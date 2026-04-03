import { supabase } from '../config';
import { hasAnyAIProviderConfigured } from '../lib/ai-provider';

type CompanyRow = {
  id: string;
  settings?: unknown;
};

type AgentRow = {
  id: string;
};

type MemberRow = {
  user_id: string;
  role: 'owner_admin' | 'manager' | 'qa_reviewer' | 'agent';
};

type ExistingJobRow = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toDateKeyInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function toPreviousDateKeyInTimeZone(timeZone: string): string {
  const todayKey = toDateKeyInTimeZone(new Date(), timeZone);
  const asUtc = new Date(`${todayKey}T00:00:00.000Z`);
  asUtc.setUTCDate(asUtc.getUTCDate() - 1);
  return asUtc.toISOString().slice(0, 10);
}

function getCompanyTimezone(settings: unknown): string {
  if (!isRecord(settings)) return 'UTC';
  const tz = typeof settings.timezone === 'string' ? settings.timezone.trim() : '';
  return tz || 'UTC';
}

function sortMembersByPriority(rows: MemberRow[]): MemberRow[] {
  const priority: Record<MemberRow['role'], number> = {
    owner_admin: 0,
    manager: 1,
    qa_reviewer: 2,
    agent: 3,
  };
  return [...rows].sort((a, b) => priority[a.role] - priority[b.role]);
}

async function resolveRequesterUserId(companyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema('app')
    .from('company_members')
    .select('user_id, role')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error) {
    throw new Error(`[DailyAIFullScan] Failed to load members for company ${companyId}: ${error.message}`);
  }

  const sorted = sortMembersByPriority((data ?? []) as MemberRow[]);
  return sorted[0]?.user_id ?? null;
}

export async function queueDailyAiFullScanForAllAgents(): Promise<void> {
  const { data: companiesData, error: companiesError } = await supabase
    .schema('app')
    .from('companies')
    .select('id, settings');

  if (companiesError) {
    throw new Error(`[DailyAIFullScan] Failed to load companies: ${companiesError.message}`);
  }

  const companies = (companiesData ?? []) as CompanyRow[];
  if (companies.length === 0) {
    console.log('[DailyAIFullScan] No companies found.');
    return;
  }

  let queued = 0;
  let skippedExisting = 0;
  let skippedNoProvider = 0;
  let skippedNoRequester = 0;
  let skippedNoAgents = 0;

  for (const company of companies) {
    const companyId = company.id;
    const hasProvider = await hasAnyAIProviderConfigured(companyId);
    if (!hasProvider) {
      skippedNoProvider += 1;
      continue;
    }

    const requesterId = await resolveRequesterUserId(companyId);
    if (!requesterId) {
      skippedNoRequester += 1;
      console.warn(`[DailyAIFullScan] Company ${companyId} has no active member to own scheduled jobs.`);
      continue;
    }

    const companyTimezone = getCompanyTimezone(company.settings);
    const periodKey = toPreviousDateKeyInTimeZone(companyTimezone);

    const { data: agentsData, error: agentsError } = await supabase
      .schema('app')
      .from('agents')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (agentsError) {
      throw new Error(`[DailyAIFullScan] Failed to load agents for company ${companyId}: ${agentsError.message}`);
    }

    const agents = (agentsData ?? []) as AgentRow[];
    if (agents.length === 0) {
      skippedNoAgents += 1;
      continue;
    }

    for (const agent of agents) {
      const { data: existingJob, error: existingJobError } = await supabase
        .schema('app')
        .from('ai_analysis_jobs')
        .select('id, status')
        .eq('company_id', companyId)
        .eq('agent_id', agent.id)
        .eq('scope', 'all')
        .eq('period_start', periodKey)
        .eq('period_end', periodKey)
        .in('status', ['queued', 'running', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingJobError) {
        throw new Error(
          `[DailyAIFullScan] Failed to check existing jobs for company ${companyId}, agent ${agent.id}: ${existingJobError.message}`,
        );
      }

      if ((existingJob as ExistingJobRow | null)?.id) {
        skippedExisting += 1;
        continue;
      }

      const { error: createJobError } = await supabase
        .schema('app')
        .from('ai_analysis_jobs')
        .insert({
          company_id: companyId,
          requested_by_user_id: requesterId,
          agent_id: agent.id,
          scope: 'all',
          conversation_id: null,
          period_start: periodKey,
          period_end: periodKey,
          company_timezone: companyTimezone,
          status: 'queued',
          total_candidates: 0,
        });

      if (createJobError) {
        throw new Error(
          `[DailyAIFullScan] Failed to enqueue job for company ${companyId}, agent ${agent.id}: ${createJobError.message}`,
        );
      }

      queued += 1;
    }
  }

  console.log(
    `[DailyAIFullScan] Done. queued=${queued}, skipped_existing=${skippedExisting}, skipped_no_provider=${skippedNoProvider}, skipped_no_requester=${skippedNoRequester}, skipped_no_agents=${skippedNoAgents}`,
  );
}

