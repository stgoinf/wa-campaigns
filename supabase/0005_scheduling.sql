-- ──────────────────────────────────────────────────────────────────────────────
-- Migración 0005 — scheduling de campañas + worker server-side
-- ──────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase > SQL Editor.
-- Idempotente.
--
-- Permite programar campañas a fecha/hora futura y procesarlas con un cron
-- worker server-side en Railway (cada 1 min) — eliminando la dependencia de
-- tener una pestaña abierta en el browser.
--
-- Status válidos:
--   campaigns:         draft | scheduled | running | paused | completed
--   campaign_messages: pending | claimed | sent | delivered | read | failed
--
-- 'claimed' es un estado intermedio: el worker lo marca antes de enviar para
-- evitar doble-procesamiento si dos ticks se solapan.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Columna scheduled_for en campaigns ────────────────────────────────────
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Índice clave: el worker escanea por (status, scheduled_for) cada minuto.
CREATE INDEX IF NOT EXISTS idx_campaigns_status_sched
    ON campaigns(status, scheduled_for);


-- 2. Columna claimed_at en campaign_messages ──────────────────────────────
ALTER TABLE campaign_messages
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;


-- 3. RPC atómica para reservar mensajes (anti-doble-envío) ─────────────────
--
-- Marca N mensajes pending como 'claimed' + setea claimed_at en una sola
-- transacción. FOR UPDATE SKIP LOCKED garantiza que dos ticks concurrentes
-- nunca reservan el mismo mensaje.
CREATE OR REPLACE FUNCTION claim_pending_messages(p_campaign_id BIGINT, p_limit INT)
RETURNS TABLE(id BIGINT, telefono TEXT)
LANGUAGE sql AS $$
    UPDATE campaign_messages
       SET status     = 'claimed',
           claimed_at = NOW()
     WHERE id IN (
         SELECT id
           FROM campaign_messages
          WHERE campaign_id = p_campaign_id
            AND status = 'pending'
          ORDER BY id
          LIMIT p_limit
          FOR UPDATE SKIP LOCKED
     )
     RETURNING id, telefono;
$$;


-- 4. RPC de rescate de claims colgados ────────────────────────────────────
--
-- Libera mensajes 'claimed' que llevan >5 min sin enviarse (caso: tick
-- crasheó a mitad). Se llama al inicio de cada tick.
CREATE OR REPLACE FUNCTION rescue_stuck_claims()
RETURNS INT
LANGUAGE sql AS $$
    WITH freed AS (
        UPDATE campaign_messages
           SET status     = 'pending',
               claimed_at = NULL
         WHERE status = 'claimed'
           AND claimed_at IS NOT NULL
           AND claimed_at < NOW() - INTERVAL '5 minutes'
        RETURNING id
    )
    SELECT COUNT(*)::INT FROM freed;
$$;


COMMIT;
