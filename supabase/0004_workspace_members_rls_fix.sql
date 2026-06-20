-- ──────────────────────────────────────────────────────────────────────────────
-- Migración 0004 — fix RLS en workspace_members
-- ──────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase > SQL Editor.
-- Idempotente.
--
-- Bug: la migración 0002 habilitó RLS en workspace_members pero no agregó
-- ninguna policy. En Postgres, una tabla con RLS habilitada y sin policies
-- niega todo acceso a usuarios no superusuario. Eso rompía el subquery
-- interno de las policies de workspaces/contacts/campaigns/campaign_messages
-- /app_settings que hacen:
--
--   workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
--
-- Desde el browser (anon + JWT) el subquery devolvía 0 rows → cascada de RLS
-- denegaba todo. Síntoma: runCampaignLoop hacía select de campaign_messages
-- pending, recibía 0 rows, asumía "todo terminado" y mandaba ?action=complete
-- sin haber enviado ni un mensaje.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Cada usuario puede ver SUS PROPIAS filas de membresía. Esto es suficiente
-- para que los subqueries en otras policies funcionen, sin exponer
-- membresías ajenas. El admin gestiona miembros server-side con service_role.
DROP POLICY IF EXISTS "self_membership" ON workspace_members;
CREATE POLICY "self_membership" ON workspace_members
    FOR SELECT
    USING (user_id = auth.uid());

COMMIT;
