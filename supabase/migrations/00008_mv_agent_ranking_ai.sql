-- Migration 00008: Rebuild mv_agent_ranking with AI quality score columns

-- Drop existing view and its index (no critical data, just a refresh cache)
DROP MATERIALIZED VIEW IF EXISTS app.mv_agent_ranking;

-- Recreate with two new AI-sourced columns
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

    -- AI quality: average score across analyzed conversations (last 30 days)
    (SELECT ROUND(AVG(aia.quality_score))
     FROM app.ai_conversation_analysis aia
     WHERE aia.agent_id = mad.agent_id
       AND aia.analyzed_at >= CURRENT_DATE - 30
       AND aia.quality_score IS NOT NULL) AS avg_ai_quality_score,

    -- AI coaching: how many conversations flagged this month
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

CREATE UNIQUE INDEX idx_mv_agent_ranking_pk
    ON app.mv_agent_ranking (company_id, agent_id);

GRANT SELECT ON app.mv_agent_ranking TO authenticated;
