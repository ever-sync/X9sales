// ============================================================
// RBAC Types
// ============================================================
export type { AppRole } from '../config/rbac';
import type { AppRole } from '../config/rbac';

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

export interface BlockedAnalysisCustomer {
  id: string;
  name: string | null;
  phone: string;
}

export type AIProviderKind = 'anthropic' | 'openai' | 'gemini' | 'grok' | 'deepseek' | 'custom';

export interface AIProviderConfig {
  id: string;
  provider: AIProviderKind;
  label: string;
  api_key: string;
  model?: string;
  base_url?: string;
  enabled: boolean;
  order: number;
}

export interface CompanySettings {
  sla_first_response_sec: number;
  sla_resolution_sec: number;
  timezone: string;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  auto_block_on_critical_risk?: boolean;
  legal_name?: string;
  document_type?: 'cpf' | 'cnpj';
  document_number?: string;
  logo_url?: string;
  admin_report_frequency?: 'daily' | 'weekly' | 'monthly';
  admin_report_channel?: 'email' | 'whatsapp';
  admin_report_weekday?: string;
  admin_report_month_day?: number;
  agent_morning_improvement_ideas?: boolean;
  agent_follow_up_alerts?: boolean;
  blocked_report_numbers?: string[];
  block_team_analysis?: boolean;
  blocked_analysis_customers?: BlockedAnalysisCustomer[];
  ai_providers?: AIProviderConfig[];
}

export interface BillingSubscription {
  id: string;
  company_id: string;
  stripe_subscription_id: string;
  plan_code: string;
  plan_name: string;
  status: string;
  billing_cycle: string;
  amount_cents: number;
  currency: string;
  included_seats: number | null;
  used_seats: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingInvoice {
  id: string;
  company_id: string;
  stripe_invoice_id: string;
  stripe_subscription_id: string | null;
  status: string;
  amount_due_cents: number;
  currency: string;
  due_date: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  created_at: string;
}

export interface CompanyInvite {
  id: string;
  company_id: string;
  email: string;
  role: AppRole;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  token: string;
  invited_by_user_id: string;
  expires_at: string;
  accepted_by_user_id: string | null;
  created_at: string;
}

export interface NotificationJobSummary {
  id: string;
  company_id: string;
  job_type: 'admin_report' | 'agent_morning_ideas' | 'agent_follow_up';
  target_user_id: string | null;
  target_agent_id: string | null;
  channel: 'email' | 'whatsapp';
  scheduled_for: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  payload: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface SaleRecord {
  id: string;
  company_id: string;
  seller_agent_id: string | null;
  conversation_id: string | null;
  seller_name_snapshot: string;
  store_name: string;
  quantity: number;
  margin_amount: number;
  sold_at: string;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  seller?: Agent | null;
  conversation?: Pick<Conversation, 'id' | 'started_at'> & {
    customer?: Pick<Customer, 'name' | 'phone'> | null;
  } | null;
}

// ============================================================
// Agent Types
// ============================================================
export interface Agent {
  id: string;
  company_id: string;
  member_id: string | null;
  store_id: string | null;
  external_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  store?: Store | null;
}

export interface Store {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  metadata: MessageMetadata | null;
  created_at: string;
}

export interface MessageAudioMetadata {
  url?: string | null;
  provider?: string | null;
  transcription_status?: 'pending' | 'completed' | 'failed' | 'no_speech';
  language?: string | null;
  text?: string | null;
  engine?: string | null;
  transcribed_at?: string | null;
  error?: string | null;
}

export interface MessageMetadata extends Record<string, unknown> {
  audio?: MessageAudioMetadata | null;
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

export interface AgentBadge {
  company_id: string;
  agent_id: string;
  badge_key: string;
  badge_label: string;
  badge_description: string;
  badge_tone: 'gold' | 'indigo' | 'emerald' | 'amber' | string;
  award_reason: string;
  awarded_at: string;
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
export interface MissedOpportunity {
  turn: number;
  agent_message: string;
  missed_action: string;
  impact: 'low' | 'medium' | 'high';
}

export interface ConversationDiagnosis {
  conversation_type: string;
  sales_stage: string;
  customer_intent: string;
  interest_level: string;
}

export interface WeightedBreakdown {
  communication_weighted: number;
  investigation_weighted: number;
  steering_weighted: number;
  objections_weighted: number;
  closing_weighted: number;
}

export interface BehaviorFlags {
  close_attempted: boolean;
  follow_up_present: boolean;
  real_diagnosis: boolean;
  passive_response: boolean;
  objection_mishandled: boolean;
  abandoned_without_next_step: boolean;
}

export interface CompetencyScores {
  opening: number | null;
  timing: number | null;
  authority: number | null;
  follow_up: number | null;
  closing: number | null;
}

export interface SeverityFinding {
  tag: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: string;
  impact: string;
}

export interface StructuredAnalysis {
  missed_opportunities: MissedOpportunity[];
  strengths: string[];
  improvements: string[];
  diagnosis: ConversationDiagnosis | null;
  pillar_evidence: Record<string, string>;
  weighted_breakdown: WeightedBreakdown;
  failure_tags: string[];
  behavior_flags?: BehaviorFlags | null;
  competency_scores?: CompetencyScores | null;
  severity_findings?: SeverityFinding[] | null;
  seller_profile_hint?: string | null;
}

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
  score_investigation: number | null;
  score_commercial_steering: number | null;
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
  structured_analysis: StructuredAnalysis | null;
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

export interface AIInsightsSummary {
  analyses_total: number;
  avg_score: number | null;
  lowest_score: number | null;
  coaching_count: number;
  coaching_rate: number;
}

export interface AIInsightsAgentSummary {
  agent_id: string | null;
  agent_name: string;
  avg_score: number | null;
  analyzed_count: number;
  coaching_count: number;
  failure_count: number;
}

export interface AIInsightsTagSummary {
  source: 'training' | 'failure';
  tag: string;
  count: number;
}

export interface AIInsightsReviewItem {
  id: string;
  conversation_id: string;
  agent_id: string | null;
  agent_name: string;
  quality_score: number | null;
  needs_coaching: boolean;
  training_tags: string[];
  failure_tags: string[];
  analyzed_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  channel: string | null;
  conversation_started_at: string | null;
  total_count: number;
}

export interface AIInsightsFailureHeatmapCell {
  agent_id: string | null;
  agent_name: string;
  failure_tag: string;
  failure_count: number;
}

export type AISellerAuditAlertLevel = 'verde' | 'amarelo' | 'laranja' | 'vermelho';

export interface AISellerAuditScorecard {
  abertura: number | null;
  agilidade: number | null;
  diagnostico: number | null;
  conducao: number | null;
  construcao_valor: number | null;
  objecoes: number | null;
  fechamento: number | null;
  follow_up: number | null;
  comunicacao: number | null;
  consistencia: number | null;
}

export interface AISellerAuditPerformanceMetrics {
  close_attempt_rate: number;
  follow_up_rate: number;
  real_diagnosis_rate: number;
  abandonment_rate: number;
  poor_objection_handling_rate: number;
  passive_response_rate: number;
}

export interface AISellerAuditOpportunity {
  conversation_id: string;
  customer_name: string | null;
  customer_phone_masked: string | null;
  what_happened: string;
  why_it_was_lost: string;
  what_should_have_been_done: string;
  impact: 'low' | 'medium' | 'high';
  evidence: string | null;
}

export interface AISellerAuditEvidenceSample {
  conversation_id: string;
  customer_name: string | null;
  customer_phone_masked: string | null;
  category: 'forte' | 'fraco';
  excerpt: string;
}

export interface AISellerAuditInterventionPlan {
  stop_now: string[];
  start_now: string[];
  train_next_30_days: string[];
}

export interface AISellerAuditRecommendedTraining {
  priority: string;
  reason: string;
}

export interface AISellerAuditFinalQuestions {
  extracts_opportunities_well: string;
  needs_more_leads_or_skill: string;
  main_problem_skill_or_posture: string;
  next_30_days_if_nothing_changes: string;
  train_pressure_monitor_or_replace: string;
}

export interface AISellerAuditReport {
  executive_verdict: string;
  alert_level: AISellerAuditAlertLevel;
  final_score: number | null;
  seller_level: string;
  scorecard: AISellerAuditScorecard;
  performance_metrics: AISellerAuditPerformanceMetrics;
  strengths: string[];
  main_errors: string[];
  recurring_patterns: string[];
  operational_impact: string[];
  behavior_profile: string;
  critical_failures: string[];
  high_failures: string[];
  medium_failures: string[];
  low_failures: string[];
  lost_opportunities: AISellerAuditOpportunity[];
  unfiltered_manager_note: string;
  manager_actions: string[];
  intervention_plan_30d: AISellerAuditInterventionPlan;
  recommended_training: AISellerAuditRecommendedTraining | null;
  final_conclusion: string;
  final_questions: AISellerAuditFinalQuestions;
  evidence_samples: AISellerAuditEvidenceSample[];
  totals: {
    conversations_considered: number;
    analyzed_conversations: number;
    open_alerts: number;
  };
}

export type AISellerAuditRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AISellerAuditRun {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string;
  period_start: string;
  period_end: string;
  company_timezone: string;
  source: 'manual' | 'ai_analysis_auto' | 'manager_copilot';
  status: AISellerAuditRunStatus;
  total_conversations: number;
  processed_count: number;
  analyzed_count: number;
  failed_count: number;
  report_json: AISellerAuditReport | null;
  report_markdown: string | null;
  prompt_version: string;
  model_used: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export type ProductIntelligenceSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ProductIntelligenceCause =
  | 'produto'
  | 'comunicacao'
  | 'posicionamento'
  | 'oferta'
  | 'atendimento'
  | 'preco'
  | 'expectativa';

export interface ProductIntelligenceStrategicItem {
  title: string;
  summary: string;
  frequency: number | null;
  impact: string;
  urgency: string;
  severity: ProductIntelligenceSeverity;
  likely_cause: ProductIntelligenceCause;
  evidence_conversation_ids: string[];
}

export interface ProductIntelligenceClientProfile {
  profile: string;
  what_they_seek: string;
  main_blockers: string;
  best_approach: string;
  frequency: number | null;
}

export interface ProductIntelligenceDecision {
  title: string;
  why_now: string;
  expected_impact: string;
  urgency: string;
  evidence_conversation_ids: string[];
}

export interface ProductIntelligenceStrategicReport {
  resumo_executivo: string;
  percepcao_geral_produto: {
    clareza: string;
    valor_percebido: string;
    interesse_gerado: string;
    principal_risco: string;
    principal_oportunidade: string;
  };
  clientes_buscam: ProductIntelligenceStrategicItem[];
  principais_dores: ProductIntelligenceStrategicItem[];
  duvidas_frequentes: ProductIntelligenceStrategicItem[];
  objecoes_frequentes: ProductIntelligenceStrategicItem[];
  valor_percebido: ProductIntelligenceStrategicItem[];
  pontos_de_confusao: ProductIntelligenceStrategicItem[];
  melhorias_de_produto: ProductIntelligenceStrategicItem[];
  melhorias_de_oferta_e_comunicacao: ProductIntelligenceStrategicItem[];
  perfis_de_cliente: ProductIntelligenceClientProfile[];
  sinais_estrategicos: ProductIntelligenceStrategicItem[];
  top_5_decisoes_recomendadas: ProductIntelligenceDecision[];
  totals: {
    conversations_considered: number;
    analyzed_conversations: number;
    evidence_items: number;
  };
}

export type ProductIntelligenceRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ProductIntelligenceRun {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  period_start: string;
  period_end: string;
  company_timezone: string;
  source: 'manual';
  status: ProductIntelligenceRunStatus;
  total_conversations: number;
  processed_count: number;
  analyzed_count: number;
  failed_count: number;
  report_json: ProductIntelligenceStrategicReport | null;
  report_markdown: string | null;
  prompt_version: string;
  model_used: string | null;
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

export interface ConversationComment {
  id: string;
  company_id: string;
  conversation_id: string;
  author_id: string;
  body: string;
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
