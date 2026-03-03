// ============================================================
// RBAC Types
// ============================================================
export type AppRole = 'owner_admin' | 'manager' | 'qa_reviewer' | 'agent';

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string | null;
  settings: CompanySettings;
  created_at: string;
}

export interface CompanySettings {
  sla_first_response_sec: number;
  sla_resolution_sec: number;
  timezone: string;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  auto_block_on_critical_risk?: boolean;
}

// ============================================================
// Agent Types
// ============================================================
export interface Agent {
  id: string;
  company_id: string;
  member_id: string | null;
  external_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

// ============================================================
// Conversation Types
// ============================================================
export type ConversationStatus = 'active' | 'closed' | 'waiting' | 'snoozed';
export type Channel = 'whatsapp' | 'email' | 'call' | 'chat' | 'instagram' | 'messenger' | 'telegram';

export interface Conversation {
  id: string;
  company_id: string;
  agent_id: string | null;
  customer_id: string | null;
  channel: Channel;
  status: ConversationStatus;
  started_at: string | null;
  closed_at: string | null;
  message_count_in: number;
  message_count_out: number;
  external_ticket_id: string | null; // For WhaZApi or CRM reference
  created_at: string;
  // Joined
  agent?: Agent;
  customer?: Customer;
  metrics?: ConversationMetrics;
}

export interface Message {
  id: string;
  company_id: string;
  conversation_id: string;
  sender_type: 'agent' | 'customer' | 'system' | 'bot';
  sender_id: string | null; // agent_id or customer_id
  content: string;
  content_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'interactive';
  external_message_id: string | string; // WhaZApi message ID
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Customer {
  id: string;
  company_id: string;
  external_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
}

// ============================================================
// Event Types
// ============================================================
export type EventType =
  | 'FIRST_RESPONSE'
  | 'FOLLOWUP'
  | 'PROPOSAL_SENT'
  | 'WON'
  | 'LOST'
  | 'HANDOFF'
  | 'SLA_BREACH';

export interface AppEvent {
  id: string;
  company_id: string;
  event_type: EventType;
  conversation_id: string | null;
  agent_id: string | null;
  event_timestamp: string;
  meta: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// Metrics Types
// ============================================================
export interface ConversationMetrics {
  id: string;
  conversation_id: string;
  agent_id: string | null;
  first_response_time_sec: number | null;
  resolution_time_sec: number | null;
  message_count_in: number;
  message_count_out: number;
  avg_response_gap_sec: number | null;
  sla_first_response_met: boolean | null;
  sla_resolution_met: boolean | null;
  channel: string;
  conversation_date: string;
}

export interface AgentDailyMetrics {
  id: string;
  company_id: string;
  agent_id: string;
  metric_date: string;
  conversations_total: number;
  conversations_closed: number;
  avg_first_response_sec: number | null;
  avg_resolution_sec: number | null;
  sla_first_response_pct: number | null;
  sla_resolution_pct: number | null;
  messages_sent: number;
  messages_received: number;
  deals_won: number;
  deals_lost: number;
  revenue: number;
}

// ============================================================
// Dashboard Types (Materialized Views)
// ============================================================
export interface DashboardOverview {
  company_id: string;
  conversations_7d: number;
  avg_frt_7d: number | null;
  sla_pct_7d: number | null;
  conversations_30d: number;
  avg_frt_30d: number | null;
  avg_resolution_30d: number | null;
  sla_pct_30d: number | null;
  messages_in_30d: number;
  messages_out_30d: number;
  active_conversations: number;
  waiting_conversations: number;
  open_alerts: number;
  critical_alerts: number;
  avg_predicted_csat_30d: number | null;
  refreshed_at: string;
}

export interface AgentRanking {
  company_id: string;
  agent_id: string;
  agent_name: string;
  agent_avatar: string | null;
  total_conversations: number;
  total_closed: number;
  avg_first_response_sec: number | null;
  avg_sla_first_response_pct: number | null;
  avg_sla_resolution_pct: number | null;
  total_messages_sent: number;
  total_messages_received: number;
  total_deals_won: number;
  total_deals_lost: number;
  total_revenue: number;
  open_alerts: number;
  avg_ai_quality_score: number | null;
  avg_predicted_csat: number | null;
  coaching_needed_count: number;
}

export interface DailyTrend {
  company_id: string;
  conversation_date: string;
  channel: string;
  conversation_count: number;
  avg_frt: number | null;
  sla_pct: number | null;
  messages_in: number;
  messages_out: number;
  avg_predicted_csat: number | null;
}

// ============================================================
// Alert Types
// ============================================================
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'closed';

export interface Alert {
  id: string;
  company_id: string;
  alert_type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  agent_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  closed_at: string | null;
  // Joined
  agent?: Agent;
}

// ============================================================
// Spam Risk Types
// ============================================================
export type SpamPatternType = 'identical_message' | 'near_identical_message' | 'burst_volume';

export interface SpamRiskEvent {
  id: string;
  company_id: string;
  agent_id: string;
  detected_at: string;
  window_start: string;
  window_end: string;
  pattern_type: SpamPatternType;
  identical_message_hash: string | null;
  message_sample: string | null;
  recipient_count: number;
  occurrence_count: number;
  risk_level: AlertSeverity;
  alert_id: string | null;
  created_at: string;
  // Joined
  agent?: Agent;
}

// ============================================================
// AI Analysis Types
// ============================================================
export interface AIConversationAnalysis {
  id: string;
  company_id: string;
  conversation_id: string;
  agent_id: string | null;
  quality_score: number | null;
  is_sales_conversation: boolean;
  score_empathy: number | null;
  score_professionalism: number | null;
  score_clarity: number | null;
  score_conflict_resolution: number | null;
  score_rapport: number | null;
  score_urgency: number | null;
  score_value_proposition: number | null;
  score_objection_handling: number | null;
  used_rapport: boolean | null;
  used_urgency: boolean | null;
  used_value_proposition: boolean | null;
  used_objection_handling: boolean | null;
  needs_coaching: boolean;
  coaching_tips: string[] | null;
  training_tags: string[] | null;
  model_used: string;
  prompt_version: string;
  analyzed_at: string;
  created_at: string;
  // Joined
  conversation?: Conversation;
  agent?: Agent;
}

export type AIAnalysisJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AIAnalysisJob {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string;
  scope: 'single' | 'all';
  conversation_id: string | null;
  period_start: string;
  period_end: string;
  company_timezone: string;
  status: AIAnalysisJobStatus;
  total_candidates: number;
  processed_count: number;
  analyzed_count: number;
  skipped_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

// ============================================================
// Revenue Copilot / Playbook / ROI Types
// ============================================================
export type DealStage = 'descoberta' | 'proposta' | 'objecao' | 'fechamento' | 'pos_venda';
export type IntentLevel = 'fria' | 'morna' | 'quente';
export type LossRiskLevel = 'baixo' | 'medio' | 'alto';

export interface DealSignal {
  id: string;
  company_id: string;
  conversation_id: string;
  agent_id: string | null;
  stage: DealStage;
  intent_level: IntentLevel;
  loss_risk_level: LossRiskLevel;
  estimated_value: number | null;
  close_probability: number | null;
  next_best_action: string | null;
  suggested_reply: string | null;
  model_used: string;
  prompt_version: string;
  generated_at: string;
  updated_at: string;
}

export type RevenueCopilotJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface RevenueCopilotJob {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string | null;
  scope: 'single' | 'all';
  conversation_id: string | null;
  period_start: string;
  period_end: string;
  company_timezone: string;
  status: RevenueCopilotJobStatus;
  total_candidates: number;
  processed_count: number;
  analyzed_count: number;
  skipped_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export type PlaybookStatus = 'draft' | 'active';
export type PlaybookRuleType =
  | 'abertura'
  | 'qualificacao'
  | 'valor'
  | 'cta'
  | 'contorno_objecao'
  | 'followup'
  | 'custom';

export interface Playbook {
  id: string;
  company_id: string;
  name: string;
  segment: string;
  status: PlaybookStatus;
  version: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaybookRule {
  id: string;
  playbook_id: string;
  company_id: string;
  rule_type: PlaybookRuleType;
  rule_text: string;
  weight: number;
  is_required: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CoachingAction {
  id: string;
  company_id: string;
  conversation_id: string;
  agent_id: string | null;
  action_type: string;
  accepted: boolean;
  applied_at: string | null;
  impact_score: number | null;
  meta: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
}

export type RevenueOutcomeStatus = 'won' | 'lost' | 'open';

export interface RevenueOutcome {
  id: string;
  company_id: string;
  conversation_id: string;
  agent_id: string | null;
  outcome: RevenueOutcomeStatus;
  value: number;
  won_at: string | null;
  loss_reason: string | null;
  meta: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ROIReportSummary {
  generated_at: string;
  company_id: string;
  agent_id: string | null;
  period_start: string;
  period_end: string;
  totals: {
    outcomes_total: number;
    won_count: number;
    lost_count: number;
    open_count: number;
    won_value: number;
    lost_value: number;
    avg_ticket_won: number;
    conversion_rate: number;
  };
  copilot: {
    signals_total: number;
    high_intent_count: number;
    medium_intent_count: number;
    high_risk_count: number;
    avg_close_probability: number;
  };
  coaching: {
    actions_total: number;
    accepted_actions: number;
    adoption_rate: number;
  };
  top_loss_reasons: Array<{
    reason: string;
    count: number;
  }>;
}

export interface ROIReport {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string | null;
  period_start: string;
  period_end: string;
  summary: ROIReportSummary;
  created_at: string;
}

// ============================================================
// Manager Copilot Types
// ============================================================
export interface ManagerCopilotThread {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type ManagerCopilotMessageRole = 'user' | 'assistant' | 'system';
export type ManagerCopilotMessageStatus = 'ready' | 'pending' | 'error';

export interface ManagerFeedbackSource {
  conversation_id?: string;
  category?: 'forte' | 'fraco';
  customer_phone_masked?: string | null;
  [key: string]: unknown;
}

export type ManagerFeedbackSources = ManagerFeedbackSource[];

export interface ManagerCopilotMessage {
  id: string;
  thread_id: string;
  company_id: string;
  user_id: string | null;
  role: ManagerCopilotMessageRole;
  content_md: string;
  status: ManagerCopilotMessageStatus;
  sources: ManagerFeedbackSource[] | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export type ManagerFeedbackJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ManagerFeedbackJob {
  id: string;
  thread_id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string;
  period_start: string;
  period_end: string;
  company_timezone: string;
  status: ManagerFeedbackJobStatus;
  total_conversations: number;
  processed_count: number;
  quick_answer_message_id: string | null;
  final_answer_message_id: string | null;
  result_summary: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

// ============================================================
// QA Review Types
// ============================================================
export interface QAReview {
  id: string;
  company_id: string;
  conversation_id: string;
  reviewer_id: string;
  score: number | null;
  checklist: Record<string, boolean>[];
  tags: string[];
  comments: string | null;
  created_at: string;
}
