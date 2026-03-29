import { supabase } from '../config';
import {
  ensureSellerAuditReport,
  SELLER_AUDIT_MODEL,
  SELLER_AUDIT_PROMPT_VERSION,
} from './seller-audit';

const MAX_ERROR_MESSAGE_LENGTH = 2000;

type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

interface ManagerFeedbackJob {
  id: string;
  thread_id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string;
  period_start: string;
  period_end: string;
  company_timezone: string;
  status: JobStatus;
  total_conversations: number;
  processed_count: number;
  quick_answer_message_id: string | null;
  final_answer_message_id: string | null;
  result_summary: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

interface SellerAuditRun {
  id: string;
  total_conversations: number;
  analyzed_count: number;
  failed_count: number;
  report_json: Record<string, unknown>;
  report_markdown: string | null;
}

function coerceRpcSingleRow<T>(value: unknown): T | null {
  if (!value) return null;
  const row = Array.isArray(value) ? (value[0] ?? null) : value;
  if (!row || typeof row !== 'object') return null;
  if ('id' in row && !((row as { id?: unknown }).id)) return null;
  return row as T;
}

function trimErrorMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? 'Unknown error');
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function buildSourcesFromAudit(run: SellerAuditRun) {
  const report = run.report_json ?? {};
  const sources: Array<Record<string, unknown>> = [];

  const evidenceSamples = Array.isArray(report.evidence_samples) ? report.evidence_samples : [];
  for (const sample of evidenceSamples) {
    if (!sample || typeof sample !== 'object') continue;
    const conversationId = typeof sample.conversation_id === 'string' ? sample.conversation_id : '';
    if (!conversationId) continue;
    sources.push({
      type: 'seller_audit_evidence',
      conversation_id: conversationId,
      category: sample.category === 'forte' ? 'forte' : 'fraco',
      customer_phone_masked: typeof sample.customer_phone_masked === 'string' ? sample.customer_phone_masked : null,
    });
  }

  const lostOpportunities = Array.isArray(report.lost_opportunities) ? report.lost_opportunities : [];
  for (const item of lostOpportunities) {
    if (!item || typeof item !== 'object') continue;
    const conversationId = typeof item.conversation_id === 'string' ? item.conversation_id : '';
    if (!conversationId) continue;
    sources.push({
      type: 'seller_audit_opportunity',
      conversation_id: conversationId,
      impact: ['low', 'medium', 'high'].includes(String(item.impact)) ? item.impact : 'medium',
      customer_phone_masked: typeof item.customer_phone_masked === 'string' ? item.customer_phone_masked : null,
    });
  }

  return sources.slice(0, 20);
}

export async function processManagerFeedbackJobs(): Promise<void> {
  const job = await dequeueManagerFeedbackJob();
  if (!job) {
    console.log('[ManagerFeedback] No queued jobs.');
    return;
  }

  try {
    const auditRun = await ensureSellerAuditReport({
      companyId: job.company_id,
      requestedByUserId: job.requested_by_user_id,
      agentId: job.agent_id,
      periodStart: job.period_start,
      periodEnd: job.period_end,
      companyTimezone: job.company_timezone,
      source: 'manager_copilot',
    });

    const finalMarkdown = auditRun.report_markdown?.trim() || 'Nao foi possivel gerar o relatorio aprofundado.';
    const sources = buildSourcesFromAudit(auditRun);
    const nowIso = new Date().toISOString();

    if (job.final_answer_message_id) {
      const { error: messageUpdateError } = await supabase
        .schema('app')
        .from('manager_copilot_messages')
        .update({
          status: 'ready',
          content_md: finalMarkdown,
          sources,
          meta: {
            mode: 'deep',
            audit_run_id: auditRun.id,
            model_used: SELLER_AUDIT_MODEL,
            prompt_version: SELLER_AUDIT_PROMPT_VERSION,
            period_start: job.period_start,
            period_end: job.period_end,
          },
        })
        .eq('id', job.final_answer_message_id);

      if (messageUpdateError) {
        throw new Error(`Failed to update final message: ${messageUpdateError.message}`);
      }
    }

    const { error: jobUpdateError } = await supabase
      .schema('app')
      .from('manager_feedback_jobs')
      .update({
        status: 'completed',
        total_conversations: auditRun.total_conversations,
        processed_count: auditRun.analyzed_count,
        result_summary: {
          audit_run_id: auditRun.id,
          report_json: auditRun.report_json,
          prompt_version: SELLER_AUDIT_PROMPT_VERSION,
        },
        error_message: null,
        finished_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', job.id);

    if (jobUpdateError) {
      throw new Error(`Failed to update manager feedback job: ${jobUpdateError.message}`);
    }

    await supabase
      .schema('app')
      .from('manager_copilot_threads')
      .update({ updated_at: nowIso })
      .eq('id', job.thread_id);

    console.log(`[ManagerFeedback] Job ${job.id} completed with audit run ${auditRun.id}.`);
  } catch (error) {
    const errorMessage = trimErrorMessage(error);
    console.error(`[ManagerFeedback] Job ${job.id} failed: ${errorMessage}`);
    await failJob(job, errorMessage);
  }
}

async function dequeueManagerFeedbackJob(): Promise<ManagerFeedbackJob | null> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('dequeue_manager_feedback_job');

  if (error) {
    throw new Error(`[ManagerFeedback] Failed to dequeue job: ${error.message}`);
  }

  return coerceRpcSingleRow<ManagerFeedbackJob>(data);
}

async function failJob(job: ManagerFeedbackJob, errorMessage: string): Promise<void> {
  const nowIso = new Date().toISOString();

  if (job.final_answer_message_id) {
    await supabase
      .schema('app')
      .from('manager_copilot_messages')
      .update({
        status: 'error',
        content_md: 'Nao foi possivel concluir a analise profunda. Tente novamente.',
        meta: {
          mode: 'deep',
          error_message: errorMessage,
        },
      })
      .eq('id', job.final_answer_message_id);
  }

  await supabase
    .schema('app')
    .from('manager_feedback_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      finished_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', job.id);
}
