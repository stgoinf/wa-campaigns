-- ──────────────────────────────────────────────────────────────────────────────
-- Migración 0002 — workspace_members (multi-usuario por workspace)
-- ──────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase > SQL Editor.
-- Idempotente: se puede correr varias veces sin efecto adverso.
--
-- Permite que varios usuarios accedan al mismo workspace.
-- El dueño original (workspaces.user_id) queda como rol 'owner'; los nuevos
-- usuarios añadidos por el admin entran como 'member'.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Tabla de membresía ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id)     ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ws_members_user      ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ws_members_workspace ON workspace_members(workspace_id);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
-- Las consultas se hacen desde el service_role en los endpoints serverless,
-- así que no exponemos políticas al cliente todavía. (Se pueden añadir más
-- adelante si exponemos /api/workspaces/:id/members al browser.)


-- 2. Backfill — el dueño actual de cada workspace pasa a ser 'owner' ──────────
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT id, user_id, 'owner'
FROM workspaces
ON CONFLICT (workspace_id, user_id) DO NOTHING;


-- 3. RLS rewrites: el acceso se basa en membresía, no en user_id directo ─────
--    (El service_role siempre las bypassa; sirven como defense-in-depth.)

DROP POLICY IF EXISTS "own_workspaces" ON workspaces;
CREATE POLICY "member_workspaces" ON workspaces
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM workspace_members wm
         WHERE wm.workspace_id = workspaces.id AND wm.user_id = auth.uid()
    ))
    WITH CHECK (user_id = auth.uid());   -- el creador queda como dueño

DROP POLICY IF EXISTS "own_contacts" ON contacts;
CREATE POLICY "ws_member_contacts" ON contacts
    FOR ALL
    USING (
        (workspace_id IS NULL AND user_id = auth.uid())   -- filas legacy sin ws
        OR workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        (workspace_id IS NULL AND user_id = auth.uid())
        OR workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "own_campaigns" ON campaigns;
CREATE POLICY "ws_member_campaigns" ON campaigns
    FOR ALL
    USING (
        (workspace_id IS NULL AND user_id = auth.uid())
        OR workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        (workspace_id IS NULL AND user_id = auth.uid())
        OR workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "own_campaign_messages" ON campaign_messages;
CREATE POLICY "ws_member_campaign_messages" ON campaign_messages
    FOR ALL
    USING (
        campaign_id IN (
            SELECT c.id FROM campaigns c
             WHERE (c.workspace_id IS NULL AND c.user_id = auth.uid())
                OR c.workspace_id IN (
                    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
                )
        )
    )
    WITH CHECK (
        campaign_id IN (
            SELECT c.id FROM campaigns c
             WHERE (c.workspace_id IS NULL AND c.user_id = auth.uid())
                OR c.workspace_id IN (
                    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
                )
        )
    );

-- app_settings: aislamiento por workspace_id (un setting por ws).
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_app_settings" ON app_settings;
CREATE POLICY "ws_member_app_settings" ON app_settings
    FOR ALL
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );


-- 4. Helper: detectar membresía en un solo lugar ─────────────────────────────
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
     WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  );
$$;


COMMIT;
