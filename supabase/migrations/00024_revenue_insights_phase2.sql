-- Phase 2: revenue insights filtered feed and backend aggregates

CREATE OR REPLACE FUNCTION app.get_revenue_signal_feed(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_period_start date DEFAULT NULL,
    p_period_end date DEFAULT NULL,
    p_timezone text DEFAULT 'UTC',
    p_limit integer DEFAULT 300
)
RETURNS TABLE (
    id uuid,
    conversation_id uuid,
    agent_id uuid,
    stage text,
    intent_level text,
    loss_risk_level text,
    estimated_value numeric,
    close_probability numeric,
    next_best_action text,
    suggested_reply text,
    generated_at timestamptz,
    customer_name text,
    customer_phone text,
    conversation_started_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    SELECT
        ds.id,
        ds.conversation_id,
        ds.agent_id,
        ds.stage,
        ds.intent_level,
        ds.loss_risk_level,
        ds.estimated_value,
        ds.close_probability,
        ds.next_best_action,
        ds.suggested_reply,
        ds.generated_at,
        cu.name AS customer_name,
        cu.phone AS customer_phone,
        c.started_at AS conversation_started_at
    FROM app.deal_signals ds
    JOIN app.conversations c ON c.id = ds.conversation_id
    LEFT JOIN app.customers cu ON cu.id = c.customer_id
    WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
      AND ds.company_id = p_company_id
      AND (p_agent_id IS NULL OR ds.agent_id = p_agent_id)
      AND (
        p_period_start IS NULL
        OR p_period_end IS NULL
        OR (ds.generated_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
      )
    ORDER BY ds.generated_at DESC
    LIMIT CASE WHEN p_limit IS NULL OR p_limit < 1 THEN NULL ELSE p_limit END;
$$;

CREATE OR REPLACE FUNCTION app.get_revenue_insights_summary(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_period_start date DEFAULT NULL,
    p_period_end date DEFAULT NULL,
    p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE (
    signals_total integer,
    potential_value numeric,
    risk_value numeric,
    won_value numeric,
    conversion_rate numeric,
    won_count integer,
    outcomes_count integer,
    actions_total integer,
    accepted_actions integer,
    adoption_rate numeric,
    avg_ticket_won numeric,
    high_intent_count integer,
    high_risk_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    WITH filtered_signals AS (
        SELECT *
        FROM app.deal_signals ds
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND ds.company_id = p_company_id
          AND (p_agent_id IS NULL OR ds.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (ds.generated_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
    ),
    filtered_outcomes AS (
        SELECT *
        FROM app.revenue_outcomes ro
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND ro.company_id = p_company_id
          AND (p_agent_id IS NULL OR ro.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (COALESCE(ro.won_at, ro.created_at) AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
    ),
    filtered_actions AS (
        SELECT *
        FROM app.coaching_actions ca
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND ca.company_id = p_company_id
          AND (p_agent_id IS NULL OR ca.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (COALESCE(ca.applied_at, ca.created_at) AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
    )
    SELECT
        (SELECT COUNT(*)::integer FROM filtered_signals) AS signals_total,
        COALESCE((SELECT SUM(COALESCE(estimated_value, 0)) FROM filtered_signals WHERE intent_level IN ('quente', 'morna')), 0) AS potential_value,
        COALESCE((SELECT SUM(COALESCE(estimated_value, 0)) FROM filtered_signals WHERE loss_risk_level = 'alto'), 0) AS risk_value,
        COALESCE((SELECT SUM(COALESCE(value, 0)) FROM filtered_outcomes WHERE outcome = 'won'), 0) AS won_value,
        CASE
            WHEN (SELECT COUNT(*) FROM filtered_outcomes) > 0 THEN
                ROUND(((SELECT COUNT(*) FROM filtered_outcomes WHERE outcome = 'won')::numeric / (SELECT COUNT(*) FROM filtered_outcomes)::numeric) * 100, 2)
            ELSE 0
        END AS conversion_rate,
        (SELECT COUNT(*)::integer FROM filtered_outcomes WHERE outcome = 'won') AS won_count,
        (SELECT COUNT(*)::integer FROM filtered_outcomes) AS outcomes_count,
        (SELECT COUNT(*)::integer FROM filtered_actions) AS actions_total,
        (SELECT COUNT(*)::integer FROM filtered_actions WHERE accepted) AS accepted_actions,
        CASE
            WHEN (SELECT COUNT(*) FROM filtered_actions) > 0 THEN
                ROUND(((SELECT COUNT(*) FROM filtered_actions WHERE accepted)::numeric / (SELECT COUNT(*) FROM filtered_actions)::numeric) * 100, 2)
            ELSE 0
        END AS adoption_rate,
        CASE
            WHEN (SELECT COUNT(*) FROM filtered_outcomes WHERE outcome = 'won') > 0 THEN
                ROUND((SELECT SUM(COALESCE(value, 0)) FROM filtered_outcomes WHERE outcome = 'won')::numeric / (SELECT COUNT(*) FROM filtered_outcomes WHERE outcome = 'won')::numeric, 2)
            ELSE 0
        END AS avg_ticket_won,
        (SELECT COUNT(*)::integer FROM filtered_signals WHERE intent_level = 'quente') AS high_intent_count,
        (SELECT COUNT(*)::integer FROM filtered_signals WHERE loss_risk_level = 'alto') AS high_risk_count;
$$;

CREATE OR REPLACE FUNCTION app.get_revenue_insights_agent_summary(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_period_start date DEFAULT NULL,
    p_period_end date DEFAULT NULL,
    p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE (
    agent_id uuid,
    hot_count integer,
    won_value numeric,
    risk_value numeric,
    conversion_rate numeric,
    adoption_rate numeric,
    outcomes_count integer,
    actions_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    WITH filtered_signals AS (
        SELECT *
        FROM app.deal_signals ds
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND ds.company_id = p_company_id
          AND (p_agent_id IS NULL OR ds.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (ds.generated_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
    ),
    filtered_outcomes AS (
        SELECT *
        FROM app.revenue_outcomes ro
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND ro.company_id = p_company_id
          AND (p_agent_id IS NULL OR ro.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (COALESCE(ro.won_at, ro.created_at) AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
    ),
    filtered_actions AS (
        SELECT *
        FROM app.coaching_actions ca
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND ca.company_id = p_company_id
          AND (p_agent_id IS NULL OR ca.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (COALESCE(ca.applied_at, ca.created_at) AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
    ),
    signals_agg AS (
        SELECT
            agent_id,
            COUNT(*) FILTER (WHERE intent_level = 'quente')::integer AS hot_count,
            COALESCE(SUM(COALESCE(estimated_value, 0)) FILTER (WHERE loss_risk_level = 'alto'), 0) AS risk_value
        FROM filtered_signals
        GROUP BY agent_id
    ),
    outcomes_agg AS (
        SELECT
            agent_id,
            COUNT(*)::integer AS outcomes_count,
            COUNT(*) FILTER (WHERE outcome = 'won')::integer AS won_count,
            COALESCE(SUM(COALESCE(value, 0)) FILTER (WHERE outcome = 'won'), 0) AS won_value
        FROM filtered_outcomes
        GROUP BY agent_id
    ),
    actions_agg AS (
        SELECT
            agent_id,
            COUNT(*)::integer AS actions_count,
            COUNT(*) FILTER (WHERE accepted)::integer AS accepted_count
        FROM filtered_actions
        GROUP BY agent_id
    ),
    agent_keys AS (
        SELECT agent_id FROM signals_agg
        UNION
        SELECT agent_id FROM outcomes_agg
        UNION
        SELECT agent_id FROM actions_agg
    ),
    merged AS (
        SELECT
            ak.agent_id,
            COALESCE(sa.hot_count, 0) AS hot_count,
            COALESCE(oa.won_value, 0) AS won_value,
            COALESCE(sa.risk_value, 0) AS risk_value,
            COALESCE(oa.outcomes_count, 0) AS outcomes_count,
            COALESCE(oa.won_count, 0) AS won_count,
            COALESCE(aa.actions_count, 0) AS actions_count,
            COALESCE(aa.accepted_count, 0) AS accepted_count
        FROM agent_keys ak
        LEFT JOIN signals_agg sa ON sa.agent_id IS NOT DISTINCT FROM ak.agent_id
        LEFT JOIN outcomes_agg oa ON oa.agent_id IS NOT DISTINCT FROM ak.agent_id
        LEFT JOIN actions_agg aa ON aa.agent_id IS NOT DISTINCT FROM ak.agent_id
    )
    SELECT
        agent_id,
        hot_count,
        won_value,
        risk_value,
        CASE WHEN outcomes_count > 0 THEN ROUND((won_count::numeric / outcomes_count::numeric) * 100, 2) ELSE 0 END AS conversion_rate,
        CASE WHEN actions_count > 0 THEN ROUND((accepted_count::numeric / actions_count::numeric) * 100, 2) ELSE 0 END AS adoption_rate,
        outcomes_count,
        actions_count
    FROM merged
    ORDER BY won_value DESC, risk_value DESC, hot_count DESC;
$$;

REVOKE ALL ON FUNCTION app.get_revenue_signal_feed(uuid, uuid, date, date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_revenue_signal_feed(uuid, uuid, date, date, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_revenue_signal_feed(uuid, uuid, date, date, text, integer) TO service_role;

REVOKE ALL ON FUNCTION app.get_revenue_insights_summary(uuid, uuid, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_revenue_insights_summary(uuid, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_revenue_insights_summary(uuid, uuid, date, date, text) TO service_role;

REVOKE ALL ON FUNCTION app.get_revenue_insights_agent_summary(uuid, uuid, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_revenue_insights_agent_summary(uuid, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_revenue_insights_agent_summary(uuid, uuid, date, date, text) TO service_role;
