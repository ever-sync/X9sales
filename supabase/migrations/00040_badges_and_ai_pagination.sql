CREATE OR REPLACE FUNCTION app.get_ai_insights_review_feed(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_period_start date DEFAULT NULL,
    p_period_end date DEFAULT NULL,
    p_timezone text DEFAULT 'UTC',
    p_tag text DEFAULT NULL,
    p_needs_coaching boolean DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
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
    conversation_started_at timestamptz,
    total_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    WITH filtered AS (
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
    )
    SELECT
        filtered.*,
        COUNT(*) OVER ()::integer AS total_count
    FROM filtered
    ORDER BY needs_coaching DESC, quality_score ASC NULLS LAST, analyzed_at DESC
    LIMIT CASE WHEN p_limit IS NULL OR p_limit < 1 THEN NULL ELSE p_limit END
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION app.get_ai_insights_review_feed(uuid, uuid, date, date, text, text, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_ai_insights_review_feed(uuid, uuid, date, date, text, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_review_feed(uuid, uuid, date, date, text, text, boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_ai_insights_review_feed(uuid, uuid, date, date, text, text, boolean, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION app.get_agent_badges(
    p_company_id uuid,
    p_agent_id uuid DEFAULT NULL,
    p_reference_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    company_id uuid,
    agent_id uuid,
    badge_key text,
    badge_label text,
    badge_description text,
    badge_tone text,
    award_reason text,
    awarded_at date
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    WITH window_bounds AS (
        SELECT
            date_trunc('week', p_reference_date::timestamp)::date AS window_start,
            (date_trunc('week', p_reference_date::timestamp)::date + 6) AS window_end
    ),
    conversation_window AS (
        SELECT
            mad.company_id,
            mad.agent_id,
            SUM(mad.conversations_total)::integer AS conversations_total,
            AVG(mad.sla_first_response_pct) FILTER (WHERE mad.sla_first_response_pct IS NOT NULL) AS avg_sla
        FROM app.metrics_agent_daily mad
        CROSS JOIN window_bounds wb
        WHERE mad.company_id = p_company_id
          AND mad.metric_date BETWEEN wb.window_start AND wb.window_end
        GROUP BY mad.company_id, mad.agent_id
    ),
    revenue_window AS (
        SELECT
            sr.company_id,
            sr.seller_agent_id AS agent_id,
            COUNT(*)::integer AS deals_won,
            COALESCE(SUM(sr.margin_amount), 0)::numeric AS total_revenue
        FROM app.sales_records sr
        CROSS JOIN window_bounds wb
        WHERE sr.company_id = p_company_id
          AND sr.seller_agent_id IS NOT NULL
          AND sr.sold_at::date BETWEEN wb.window_start AND wb.window_end
        GROUP BY sr.company_id, sr.seller_agent_id
    ),
    quality_window AS (
        SELECT
            aia.company_id,
            aia.agent_id,
            AVG(aia.quality_score) FILTER (WHERE aia.quality_score IS NOT NULL) AS avg_quality,
            COUNT(*)::integer AS analyses_count
        FROM app.ai_conversation_analysis aia
        CROSS JOIN window_bounds wb
        WHERE aia.company_id = p_company_id
          AND aia.agent_id IS NOT NULL
          AND aia.analyzed_at::date BETWEEN wb.window_start AND wb.window_end
        GROUP BY aia.company_id, aia.agent_id
    ),
    base AS (
        SELECT
            a.company_id,
            a.id AS agent_id,
            a.name,
            COALESCE(cw.conversations_total, 0) AS conversations_total,
            cw.avg_sla,
            COALESCE(rw.deals_won, 0) AS deals_won,
            COALESCE(rw.total_revenue, 0)::numeric AS total_revenue,
            qw.avg_quality,
            COALESCE(qw.analyses_count, 0) AS analyses_count
        FROM app.agents a
        LEFT JOIN conversation_window cw ON cw.company_id = a.company_id AND cw.agent_id = a.id
        LEFT JOIN revenue_window rw ON rw.company_id = a.company_id AND rw.agent_id = a.id
        LEFT JOIN quality_window qw ON qw.company_id = a.company_id AND qw.agent_id = a.id
        WHERE a.company_id = p_company_id
          AND a.is_active = true
          AND (p_agent_id IS NULL OR a.id = p_agent_id)
    ),
    sales_badge AS (
        SELECT
            company_id,
            agent_id,
            'revenue_sprinter'::text AS badge_key,
            'Sprint de Receita'::text AS badge_label,
            'Maior receita fechada na semana.'::text AS badge_description,
            'gold'::text AS badge_tone,
            'Fechou ' || to_char(total_revenue, 'FM"R$"999G999G990D00') || ' em ' || deals_won || ' venda(s) na semana.' AS award_reason,
            p_reference_date AS awarded_at
        FROM (
            SELECT *,
                   ROW_NUMBER() OVER (ORDER BY total_revenue DESC, deals_won DESC, name ASC) AS badge_rank
            FROM base
            WHERE total_revenue > 0
        ) ranked
        WHERE badge_rank = 1
    ),
    volume_badge AS (
        SELECT
            company_id,
            agent_id,
            'pipeline_machine'::text AS badge_key,
            'Maquina de Conversas'::text AS badge_label,
            'Maior volume de atendimentos na semana.'::text AS badge_description,
            'indigo'::text AS badge_tone,
            'Liderou o time com ' || conversations_total || ' conversa(s) no periodo.' AS award_reason,
            p_reference_date AS awarded_at
        FROM (
            SELECT *,
                   ROW_NUMBER() OVER (ORDER BY conversations_total DESC, total_revenue DESC, name ASC) AS badge_rank
            FROM base
            WHERE conversations_total > 0
        ) ranked
        WHERE badge_rank = 1
    ),
    quality_badge AS (
        SELECT
            company_id,
            agent_id,
            'quality_guardian'::text AS badge_key,
            'Guardiao da Qualidade'::text AS badge_label,
            'Melhor media de qualidade IA na semana.'::text AS badge_description,
            'emerald'::text AS badge_tone,
            'Fez media ' || ROUND(avg_quality)::text || '/100 em ' || analyses_count || ' analise(s).' AS award_reason,
            p_reference_date AS awarded_at
        FROM (
            SELECT *,
                   ROW_NUMBER() OVER (ORDER BY avg_quality DESC NULLS LAST, analyses_count DESC, name ASC) AS badge_rank
            FROM base
            WHERE analyses_count >= 3
              AND avg_quality IS NOT NULL
        ) ranked
        WHERE badge_rank = 1
    ),
    sla_badge AS (
        SELECT
            company_id,
            agent_id,
            'sla_master'::text AS badge_key,
            'Mestre do SLA'::text AS badge_label,
            'Melhor SLA medio de primeira resposta na semana.'::text AS badge_description,
            'amber'::text AS badge_tone,
            'Sustentou SLA medio de ' || ROUND(avg_sla)::text || '% com ' || conversations_total || ' conversa(s).' AS award_reason,
            p_reference_date AS awarded_at
        FROM (
            SELECT *,
                   ROW_NUMBER() OVER (ORDER BY avg_sla DESC NULLS LAST, conversations_total DESC, name ASC) AS badge_rank
            FROM base
            WHERE conversations_total >= 10
              AND avg_sla IS NOT NULL
        ) ranked
        WHERE badge_rank = 1
    )
    SELECT *
    FROM (
        SELECT * FROM sales_badge
        UNION ALL
        SELECT * FROM volume_badge
        UNION ALL
        SELECT * FROM quality_badge
        UNION ALL
        SELECT * FROM sla_badge
    ) badges
    WHERE app.has_role_level(auth.uid(), p_company_id, 'agent');
$$;

REVOKE ALL ON FUNCTION app.get_agent_badges(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_agent_badges(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_agent_badges(uuid, uuid, date) TO service_role;
