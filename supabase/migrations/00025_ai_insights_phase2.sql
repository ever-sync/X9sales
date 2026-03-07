-- Phase 2: AI Insights backend aggregates and filtered feeds

CREATE OR REPLACE FUNCTION app.get_ai_insights_summary(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_period_start date DEFAULT NULL,
    p_period_end date DEFAULT NULL,
    p_timezone text DEFAULT 'UTC',
    p_tag text DEFAULT NULL,
    p_needs_coaching boolean DEFAULT NULL
)
RETURNS TABLE (
    analyses_total integer,
    avg_score numeric,
    lowest_score integer,
    coaching_count integer,
    coaching_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    WITH filtered AS (
        SELECT
            aia.quality_score,
            aia.needs_coaching,
            COALESCE(aia.training_tags, ARRAY[]::text[]) AS training_tags,
            ARRAY(
              SELECT jsonb_array_elements_text(COALESCE(aia.structured_analysis -> 'failure_tags', '[]'::jsonb))
            ) AS failure_tags
        FROM app.ai_conversation_analysis aia
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND aia.company_id = p_company_id
          AND (p_agent_id IS NULL OR aia.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (aia.analyzed_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
          AND (p_needs_coaching IS NULL OR aia.needs_coaching = p_needs_coaching)
          AND (
            p_tag IS NULL
            OR COALESCE(aia.training_tags, ARRAY[]::text[]) @> ARRAY[p_tag]::text[]
            OR COALESCE(aia.structured_analysis -> 'failure_tags', '[]'::jsonb) ? p_tag
          )
    )
    SELECT
        COUNT(*)::integer AS analyses_total,
        ROUND(AVG(quality_score)::numeric, 2) AS avg_score,
        MIN(quality_score)::integer AS lowest_score,
        COUNT(*) FILTER (WHERE needs_coaching)::integer AS coaching_count,
        CASE
            WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE needs_coaching)::numeric / COUNT(*)::numeric) * 100, 2)
            ELSE 0
        END AS coaching_rate
    FROM filtered;
$$;

CREATE OR REPLACE FUNCTION app.get_ai_insights_agent_summary(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_period_start date DEFAULT NULL,
    p_period_end date DEFAULT NULL,
    p_timezone text DEFAULT 'UTC',
    p_tag text DEFAULT NULL,
    p_needs_coaching boolean DEFAULT NULL
)
RETURNS TABLE (
    agent_id uuid,
    agent_name text,
    avg_score numeric,
    analyzed_count integer,
    coaching_count integer,
    failure_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    WITH filtered AS (
        SELECT
            aia.agent_id,
            ag.name AS agent_name,
            aia.quality_score,
            aia.needs_coaching,
            COALESCE(aia.training_tags, ARRAY[]::text[]) AS training_tags,
            ARRAY(
              SELECT jsonb_array_elements_text(COALESCE(aia.structured_analysis -> 'failure_tags', '[]'::jsonb))
            ) AS failure_tags
        FROM app.ai_conversation_analysis aia
        LEFT JOIN app.agents ag ON ag.id = aia.agent_id
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND aia.company_id = p_company_id
          AND (p_agent_id IS NULL OR aia.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (aia.analyzed_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
          AND (p_needs_coaching IS NULL OR aia.needs_coaching = p_needs_coaching)
          AND (
            p_tag IS NULL
            OR COALESCE(aia.training_tags, ARRAY[]::text[]) @> ARRAY[p_tag]::text[]
            OR COALESCE(aia.structured_analysis -> 'failure_tags', '[]'::jsonb) ? p_tag
          )
    )
    SELECT
        agent_id,
        COALESCE(NULLIF(agent_name, ''), 'Atendente nao identificado') AS agent_name,
        ROUND(AVG(quality_score)::numeric, 2) AS avg_score,
        COUNT(*)::integer AS analyzed_count,
        COUNT(*) FILTER (WHERE needs_coaching)::integer AS coaching_count,
        COALESCE(SUM(cardinality(failure_tags)), 0)::integer AS failure_count
    FROM filtered
    GROUP BY agent_id, COALESCE(NULLIF(agent_name, ''), 'Atendente nao identificado')
    ORDER BY avg_score DESC NULLS LAST, analyzed_count DESC, coaching_count DESC;
$$;

CREATE OR REPLACE FUNCTION app.get_ai_insights_tag_summary(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_period_start date DEFAULT NULL,
    p_period_end date DEFAULT NULL,
    p_timezone text DEFAULT 'UTC',
    p_needs_coaching boolean DEFAULT NULL
)
RETURNS TABLE (
    source text,
    tag text,
    count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    WITH filtered AS (
        SELECT
            COALESCE(aia.training_tags, ARRAY[]::text[]) AS training_tags,
            ARRAY(
              SELECT jsonb_array_elements_text(COALESCE(aia.structured_analysis -> 'failure_tags', '[]'::jsonb))
            ) AS failure_tags
        FROM app.ai_conversation_analysis aia
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND aia.company_id = p_company_id
          AND (p_agent_id IS NULL OR aia.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (aia.analyzed_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
          AND (p_needs_coaching IS NULL OR aia.needs_coaching = p_needs_coaching)
    ),
    training AS (
        SELECT 'training'::text AS source, unnest(training_tags) AS tag
        FROM filtered
    ),
    failure AS (
        SELECT 'failure'::text AS source, unnest(failure_tags) AS tag
        FROM filtered
    )
    SELECT
        source,
        tag,
        COUNT(*)::integer AS count
    FROM (
        SELECT * FROM training
        UNION ALL
        SELECT * FROM failure
    ) tags
    WHERE tag IS NOT NULL AND tag <> ''
    GROUP BY source, tag
    ORDER BY count DESC, tag ASC;
$$;

CREATE OR REPLACE FUNCTION app.get_ai_insights_review_feed(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_period_start date DEFAULT NULL,
    p_period_end date DEFAULT NULL,
    p_timezone text DEFAULT 'UTC',
    p_tag text DEFAULT NULL,
    p_needs_coaching boolean DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    conversation_id uuid,
    agent_id uuid,
    agent_name text,
    quality_score integer,
    needs_coaching boolean,
    training_tags text[],
    failure_tags text[],
    analyzed_at timestamptz,
    customer_name text,
    customer_phone text,
    channel text,
    conversation_started_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    SELECT
        aia.id,
        aia.conversation_id,
        aia.agent_id,
        COALESCE(NULLIF(ag.name, ''), 'Atendente nao identificado') AS agent_name,
        aia.quality_score,
        aia.needs_coaching,
        COALESCE(aia.training_tags, ARRAY[]::text[]) AS training_tags,
        ARRAY(
          SELECT jsonb_array_elements_text(COALESCE(aia.structured_analysis -> 'failure_tags', '[]'::jsonb))
        ) AS failure_tags,
        aia.analyzed_at,
        cu.name AS customer_name,
        cu.phone AS customer_phone,
        c.channel::text AS channel,
        c.started_at AS conversation_started_at
    FROM app.ai_conversation_analysis aia
    LEFT JOIN app.agents ag ON ag.id = aia.agent_id
    LEFT JOIN app.conversations c ON c.id = aia.conversation_id
    LEFT JOIN app.customers cu ON cu.id = c.customer_id
    WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
      AND aia.company_id = p_company_id
      AND (p_agent_id IS NULL OR aia.agent_id = p_agent_id)
      AND (
        p_period_start IS NULL
        OR p_period_end IS NULL
        OR (aia.analyzed_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
      )
      AND (p_needs_coaching IS NULL OR aia.needs_coaching = p_needs_coaching)
      AND (
        p_tag IS NULL
        OR COALESCE(aia.training_tags, ARRAY[]::text[]) @> ARRAY[p_tag]::text[]
        OR COALESCE(aia.structured_analysis -> 'failure_tags', '[]'::jsonb) ? p_tag
      )
    ORDER BY aia.needs_coaching DESC, aia.quality_score ASC NULLS LAST, aia.analyzed_at DESC
    LIMIT CASE WHEN p_limit IS NULL OR p_limit < 1 THEN NULL ELSE p_limit END;
$$;

CREATE OR REPLACE FUNCTION app.get_ai_insights_failure_heatmap(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_period_start date DEFAULT NULL,
    p_period_end date DEFAULT NULL,
    p_timezone text DEFAULT 'UTC',
    p_tag text DEFAULT NULL,
    p_needs_coaching boolean DEFAULT NULL
)
RETURNS TABLE (
    agent_id uuid,
    agent_name text,
    failure_tag text,
    failure_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    WITH filtered AS (
        SELECT
            aia.agent_id,
            COALESCE(NULLIF(ag.name, ''), 'Atendente nao identificado') AS agent_name,
            ARRAY(
              SELECT jsonb_array_elements_text(COALESCE(aia.structured_analysis -> 'failure_tags', '[]'::jsonb))
            ) AS failure_tags,
            COALESCE(aia.training_tags, ARRAY[]::text[]) AS training_tags,
            aia.needs_coaching
        FROM app.ai_conversation_analysis aia
        LEFT JOIN app.agents ag ON ag.id = aia.agent_id
        WHERE app.has_role_level(auth.uid(), p_company_id, 'qa_reviewer')
          AND aia.company_id = p_company_id
          AND (p_agent_id IS NULL OR aia.agent_id = p_agent_id)
          AND (
            p_period_start IS NULL
            OR p_period_end IS NULL
            OR (aia.analyzed_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date BETWEEN p_period_start AND p_period_end
          )
          AND (p_needs_coaching IS NULL OR aia.needs_coaching = p_needs_coaching)
          AND (
            p_tag IS NULL
            OR COALESCE(aia.training_tags, ARRAY[]::text[]) @> ARRAY[p_tag]::text[]
            OR COALESCE(aia.structured_analysis -> 'failure_tags', '[]'::jsonb) ? p_tag
          )
    )
    SELECT
        agent_id,
        agent_name,
        tag AS failure_tag,
        COUNT(*)::integer AS failure_count
    FROM filtered, LATERAL unnest(failure_tags) AS tag
    GROUP BY agent_id, agent_name, tag
    ORDER BY failure_count DESC, agent_name ASC, tag ASC;
$$;

REVOKE ALL ON FUNCTION app.get_ai_insights_summary(uuid, uuid, date, date, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_summary(uuid, uuid, date, date, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_summary(uuid, uuid, date, date, text, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION app.get_ai_insights_agent_summary(uuid, uuid, date, date, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_agent_summary(uuid, uuid, date, date, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_agent_summary(uuid, uuid, date, date, text, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION app.get_ai_insights_tag_summary(uuid, uuid, date, date, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_tag_summary(uuid, uuid, date, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_tag_summary(uuid, uuid, date, date, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION app.get_ai_insights_review_feed(uuid, uuid, date, date, text, text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_review_feed(uuid, uuid, date, date, text, text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_review_feed(uuid, uuid, date, date, text, text, boolean, integer) TO service_role;

REVOKE ALL ON FUNCTION app.get_ai_insights_failure_heatmap(uuid, uuid, date, date, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_failure_heatmap(uuid, uuid, date, date, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_failure_heatmap(uuid, uuid, date, date, text, text, boolean) TO service_role;
