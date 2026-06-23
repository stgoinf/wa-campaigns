-- ──────────────────────────────────────────────────────────────────────────────
-- Migración 0006 — RPCs y índice para el módulo de métricas
-- ──────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase > SQL Editor. Idempotente.
--
-- Alimenta el endpoint GET /api/metrics, que devuelve:
--   - timeline agregada (sent / delivered / read / failed) por día|semana|mes
--   - top N templates por volumen
--
-- Nota: delivered_at / read_at solo se llenan cuando el webhook de Meta
-- WhatsApp está configurado. Sin webhook, esos campos quedan NULL y las
-- tasas de entrega/lectura aparecen como 0 — el frontend muestra un aviso.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Índice parcial sobre sent_at para acelerar el groupBy ─────────────────
CREATE INDEX IF NOT EXISTS idx_cm_sent_at
    ON campaign_messages(sent_at)
    WHERE sent_at IS NOT NULL;


-- 2. RPC: timeline agregada ────────────────────────────────────────────────
--
-- p_bucket válido: 'day' | 'week' | 'month' (cualquier valor que acepte
-- date_trunc; otros lanzan error de Postgres).
CREATE OR REPLACE FUNCTION metrics_timeline(
    p_workspace UUID,
    p_from      TIMESTAMPTZ,
    p_to        TIMESTAMPTZ,
    p_bucket    TEXT
)
RETURNS TABLE(
    period    TIMESTAMPTZ,
    sent      BIGINT,
    delivered BIGINT,
    read      BIGINT,
    failed    BIGINT
)
LANGUAGE sql STABLE AS $$
    SELECT
        date_trunc(p_bucket, cm.sent_at)                                   AS period,
        COUNT(*) FILTER (WHERE cm.status IN ('sent','delivered','read'))   AS sent,
        COUNT(*) FILTER (WHERE cm.delivered_at IS NOT NULL)                AS delivered,
        COUNT(*) FILTER (WHERE cm.read_at IS NOT NULL)                     AS read,
        COUNT(*) FILTER (WHERE cm.status = 'failed')                       AS failed
      FROM campaign_messages cm
      JOIN campaigns           c ON c.id = cm.campaign_id
     WHERE c.workspace_id = p_workspace
       AND cm.sent_at BETWEEN p_from AND p_to
     GROUP BY 1
     ORDER BY 1;
$$;


-- 3. RPC: top N templates por volumen ──────────────────────────────────────
CREATE OR REPLACE FUNCTION metrics_top_templates(
    p_workspace UUID,
    p_from      TIMESTAMPTZ,
    p_to        TIMESTAMPTZ,
    p_limit     INT
)
RETURNS TABLE(
    template      TEXT,
    total         BIGINT,
    delivery_rate NUMERIC
)
LANGUAGE sql STABLE AS $$
    SELECT
        c.template_name                                                AS template,
        COUNT(*)                                                       AS total,
        ROUND(
            100.0 * COUNT(*) FILTER (WHERE cm.delivered_at IS NOT NULL)
                  / NULLIF(COUNT(*), 0),
            1
        )                                                              AS delivery_rate
      FROM campaign_messages cm
      JOIN campaigns           c ON c.id = cm.campaign_id
     WHERE c.workspace_id = p_workspace
       AND cm.sent_at BETWEEN p_from AND p_to
     GROUP BY c.template_name
     ORDER BY total DESC
     LIMIT p_limit;
$$;


COMMIT;
