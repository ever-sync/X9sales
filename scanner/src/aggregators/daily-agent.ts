import { supabase } from '../config';

export async function aggregateDailyMetrics(): Promise<void> {
  console.log('[DailyAggregator] Starting daily metrics aggregation...');

  const { data: companies, error } = await supabase
    .schema('app')
    .from('companies')
    .select('id');

  if (error || !companies) {
    console.error('[DailyAggregator] Failed to fetch companies:', error?.message);
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  for (const company of companies) {
    try {
      await aggregateCompanyDaily(company.id, today);
    } catch (err) {
      console.error(`[DailyAggregator] Error for company ${company.id}:`, err);
    }
  }

  console.log('[DailyAggregator] Aggregation complete. Refreshing materialized views...');
  const { error: refreshError } = await supabase
    .schema('app')
    .rpc('refresh_dashboard_views');
  if (refreshError) {
    console.error('[DailyAggregator] Failed to refresh views:', refreshError.message);
  } else {
    console.log('[DailyAggregator] Views refreshed.');
  }
}

async function aggregateCompanyDaily(companyId: string, date: string): Promise<void> {
  // Get all agents for this company
  const { data: agents } = await supabase
    .schema('app')
    .from('agents')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!agents) return;

  for (const agent of agents) {
    // Get conversation metrics for this agent on this date
    const { data: metrics } = await supabase
      .schema('app')
      .from('metrics_conversation')
      .select('*')
      .eq('company_id', companyId)
      .eq('agent_id', agent.id)
      .eq('conversation_date', date);

    if (!metrics || metrics.length === 0) continue;

    const totalConversations = metrics.length;
    const closedConversations = metrics.filter(m => m.resolution_time_sec != null).length;
    const withFrt = metrics.filter(m => m.first_response_time_sec != null);
    const withResolution = metrics.filter(m => m.resolution_time_sec != null);

    const avgFrt = withFrt.length > 0
      ? Math.floor(withFrt.reduce((sum, m) => sum + (m.first_response_time_sec ?? 0), 0) / withFrt.length)
      : null;

    const avgResolution = withResolution.length > 0
      ? Math.floor(withResolution.reduce((sum, m) => sum + (m.resolution_time_sec ?? 0), 0) / withResolution.length)
      : null;

    const slaFrtMet = withFrt.filter(m => m.sla_first_response_met === true).length;
    const slaFrtPct = withFrt.length > 0 ? (slaFrtMet / withFrt.length) * 100 : null;

    const slaResMet = withResolution.filter(m => m.sla_resolution_met === true).length;
    const slaResPct = withResolution.length > 0 ? (slaResMet / withResolution.length) * 100 : null;

    const messagesSent = metrics.reduce((sum, m) => sum + (m.message_count_out ?? 0), 0);
    const messagesReceived = metrics.reduce((sum, m) => sum + (m.message_count_in ?? 0), 0);

    // Get deal events for this agent today
    const { data: dealEvents } = await supabase
      .schema('app')
      .from('events')
      .select('event_type, meta')
      .eq('company_id', companyId)
      .eq('agent_id', agent.id)
      .in('event_type', ['WON', 'LOST'])
      .gte('event_timestamp', `${date}T00:00:00`)
      .lt('event_timestamp', `${date}T23:59:59`);

    const dealsWon = dealEvents?.filter(e => e.event_type === 'WON').length ?? 0;
    const dealsLost = dealEvents?.filter(e => e.event_type === 'LOST').length ?? 0;
    const revenue = dealEvents
      ?.filter(e => e.event_type === 'WON')
      .reduce((sum, e) => sum + (e.meta?.value ?? 0), 0) ?? 0;

    // Get CSAT scores from AI Analysis
    const convIdsForCsat = withResolution.map(m => m.conversation_id);
    let avgCsat: number | null = null;
    
    if (convIdsForCsat.length > 0) {
      const { data: analysis } = await supabase
        .schema('app')
        .from('ai_conversation_analysis')
        .select('predicted_csat')
        .in('conversation_id', convIdsForCsat)
        .not('predicted_csat', 'is', null);

      if (analysis && analysis.length > 0) {
        const sumCsat = analysis.reduce((sum, a) => sum + (a.predicted_csat ?? 0), 0);
        avgCsat = Number((sumCsat / analysis.length).toFixed(2));
      }
    }

    // Upsert daily metrics
    await supabase
      .schema('app')
      .from('metrics_agent_daily')
      .upsert(
        {
          company_id: companyId,
          agent_id: agent.id,
          metric_date: date,
          conversations_total: totalConversations,
          conversations_closed: closedConversations,
          avg_first_response_sec: avgFrt,
          avg_resolution_sec: avgResolution,
          avg_predicted_csat: avgCsat,
          sla_first_response_pct: slaFrtPct != null ? parseFloat(slaFrtPct.toFixed(2)) : null,
          sla_resolution_pct: slaResPct != null ? parseFloat(slaResPct.toFixed(2)) : null,
          messages_sent: messagesSent,
          messages_received: messagesReceived,
          deals_won: dealsWon,
          deals_lost: dealsLost,
          revenue: revenue,
        },
        { onConflict: 'company_id,agent_id,metric_date' }
      );
  }
}
