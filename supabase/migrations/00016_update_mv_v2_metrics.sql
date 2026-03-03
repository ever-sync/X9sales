-- Migration 00016: Update Materialized Views with CSAT metrics

-- 1. Update app.mv_dashboard_overview
DROP MATERIALIZED VIEW IF EXISTS app.mv_dashboard_overview CASCADE;

CREATE MATERIALIZED VIEW app.mv_dashboard_overview AS
SELECT
    mc.company_id,

    -- Last 7 days
    COUNT(*) FILTER (WHERE mc.conversation_date >= CURRENT_DATE - 7) AS conversations_7d,
    AVG(mc.first_response_time_sec) FILTER (WHERE mc.conversation_date >= CURRENT_DATE - 7) AS avg_frt_7d,
    COUNT(*) FILTER (WHERE mc.sla_first_response_met = true AND mc.conversation_date >= CURRENT_DATE - 7)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE mc.first_response_time_sec IS NOT NULL AND mc.conversation_date >= CURRENT_DATE - 7), 0) * 100
        AS sla_pct_7d,

    -- Last 30 days
    COUNT(*) FILTER (WHERE mc.conversation_date >= CURRENT_DATE - 30) AS conversations_30d,
    AVG(mc.first_response_time_sec) FILTER (WHERE mc.conversation_date >= CURRENT_DATE - 30) AS avg_frt_30d,
    AVG(mc.resolution_time_sec) FILTER (WHERE mc.conversation_date >= CURRENT_DATE - 30) AS avg_resolution_30d,
    COUNT(*) FILTER (WHERE mc.sla_first_response_met = true AND mc.conversation_date >= CURRENT_DATE - 30)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE mc.first_response_time_sec IS NOT NULL AND mc.conversation_date >= CURRENT_DATE - 30), 0) * 100
        AS sla_pct_30d,
    SUM(mc.message_count_in) FILTER (WHERE mc.conversation_date >= CURRENT_DATE - 30) AS messages_in_30d,
    SUM(mc.message_count_out) FILTER (WHERE mc.conversation_date >= CURRENT_DATE - 30) AS messages_out_30d,

    -- CSAT 30d (from AI analysis)
    (SELECT ROUND(AVG(aia.predicted_csat), 2)
     FROM app.ai_conversation_analysis aia
     WHERE aia.company_id = mc.company_id
       AND aia.analyzed_at >= CURRENT_DATE - 30
       AND aia.predicted_csat IS NOT NULL) AS avg_predicted_csat_30d,

    -- Conversations by status
    (SELECT COUNT(*) FROM app.conversations c WHERE c.company_id = mc.company_id AND c.status = 'active') AS active_conversations,
    (SELECT COUNT(*) FROM app.conversations c WHERE c.company_id = mc.company_id AND c.status = 'waiting') AS waiting_conversations,

    -- Open alerts
    (SELECT COUNT(*) FROM app.alerts a WHERE a.company_id = mc.company_id AND a.status = 'open') AS open_alerts,
    (SELECT COUNT(*) FROM app.alerts a WHERE a.company_id = mc.company_id AND a.status = 'open' AND a.severity = 'critical') AS critical_alerts,

    now() AS refreshed_at

FROM app.metrics_conversation mc
GROUP BY mc.company_id;

CREATE UNIQUE INDEX idx_mv_dashboard_overview_company ON app.mv_dashboard_overview (company_id);

-- 2. Update app.mv_agent_ranking
DROP MATERIALIZED VIEW IF EXISTS app.mv_agent_ranking CASCADE;

CREATE MATERIALIZED VIEW app.mv_agent_ranking AS
SELECT
    mad.company_id,
    mad.agent_id,
    a.name       AS agent_name,
    a.avatar_url AS agent_avatar,

    SUM(mad.conversations_total)    AS total_conversations,
    SUM(mad.conversations_closed)   AS total_closed,
    AVG(mad.avg_first_response_sec) AS avg_first_response_sec,
    AVG(mad.avg_resolution_sec)     AS avg_resolution_sec,
    AVG(mad.sla_first_response_pct) AS avg_sla_first_response_pct,
    AVG(mad.sla_resolution_pct)     AS avg_sla_resolution_pct,
    SUM(mad.messages_sent)          AS total_messages_sent,
    SUM(mad.messages_received)      AS total_messages_received,
    SUM(mad.deals_won)              AS total_deals_won,
    SUM(mad.deals_lost)             AS total_deals_lost,
    SUM(mad.revenue)                AS total_revenue,

    -- Open alerts
    (SELECT COUNT(*) FROM app.alerts al
     WHERE al.agent_id = mad.agent_id AND al.status = 'open') AS open_alerts,

    -- AI quality
    (SELECT ROUND(AVG(aia.quality_score))
     FROM app.ai_conversation_analysis aia
     WHERE aia.agent_id = mad.agent_id
       AND aia.analyzed_at >= CURRENT_DATE - 30
       AND aia.quality_score IS NOT NULL) AS avg_ai_quality_score,

    -- AI CSAT
    (SELECT ROUND(AVG(aia.predicted_csat), 2)
     FROM app.ai_conversation_analysis aia
     WHERE aia.agent_id = mad.agent_id
       AND aia.analyzed_at >= CURRENT_DATE - 30
       AND aia.predicted_csat IS NOT NULL) AS avg_predicted_csat,

    -- AI coaching
    (SELECT COUNT(*)
     FROM app.ai_conversation_analysis aia
     WHERE aia.agent_id = mad.agent_id
       AND aia.needs_coaching = true
       AND aia.analyzed_at >= CURRENT_DATE - 30) AS coaching_needed_count,

    now() AS refreshed_at

FROM app.metrics_agent_daily mad
JOIN app.agents a ON a.id = mad.agent_id
WHERE mad.metric_date >= CURRENT_DATE - 30
GROUP BY mad.company_id, mad.agent_id, a.name, a.avatar_url;

CREATE UNIQUE INDEX idx_mv_agent_ranking_pk ON app.mv_agent_ranking (company_id, agent_id);

-- 3. Update app.mv_daily_trend
DROP MATERIALIZED VIEW IF EXISTS app.mv_daily_trend CASCADE;

CREATE MATERIALIZED VIEW app.mv_daily_trend AS
SELECT
    mc.company_id,
    mc.conversation_date,
    mc.channel,
    COUNT(*) AS conversation_count,
    AVG(mc.first_response_time_sec) AS avg_frt,
    COUNT(*) FILTER (WHERE mc.sla_first_response_met = true)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE mc.first_response_time_sec IS NOT NULL), 0) * 100
        AS sla_pct,
    SUM(mc.message_count_in) AS messages_in,
    SUM(mc.message_count_out) AS messages_out,

    -- CSAT trend
    (SELECT ROUND(AVG(aia.predicted_csat), 2)
     FROM app.ai_conversation_analysis aia
     WHERE aia.company_id = mc.company_id
       AND aia.analyzed_at::date = mc.conversation_date
       AND aia.predicted_csat IS NOT NULL) AS avg_predicted_csat

FROM app.metrics_conversation mc
WHERE mc.conversation_date >= CURRENT_DATE - 90
GROUP BY mc.company_id, mc.conversation_date, mc.channel;

CREATE UNIQUE INDEX idx_mv_daily_trend_pk ON app.mv_daily_trend (company_id, conversation_date, channel);

-- 4. Re-grant and recreate refresh function
GRANT SELECT ON app.mv_dashboard_overview TO authenticated;
GRANT SELECT ON app.mv_agent_ranking TO authenticated;
GRANT SELECT ON app.mv_daily_trend TO authenticated;

CREATE OR REPLACE FUNCTION app.refresh_dashboard_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY app.mv_dashboard_overview;
    REFRESH MATERIALIZED VIEW CONCURRENTLY app.mv_agent_ranking;
    REFRESH MATERIALIZED VIEW CONCURRENTLY app.mv_daily_trend;
END;
$$;
