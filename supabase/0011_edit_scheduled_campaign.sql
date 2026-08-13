-- Edición de campañas 'scheduled' (nombre, fecha, plantilla+parámetros,
-- destinatarios). Recalcula campaign_messages desde cero en una sola
-- transacción — el SELECT ... FOR UPDATE se serializa naturalmente contra
-- el UPDATE de promoción scheduled→running de tick.js sobre la misma fila.

BEGIN;

-- source/etiqueta nunca se persistían al crear (solo vivían en memoria
-- durante el POST) — sin esto no hay de dónde prefillear el filtro actual
-- al abrir el modal de edición. Nullable: campañas creadas antes de esta
-- migración quedan NULL, el frontend las trata como 'all'.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS source   TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS etiqueta TEXT;

CREATE OR REPLACE FUNCTION edit_scheduled_campaign(
    p_campaign_id       BIGINT,
    p_workspace_id      UUID,
    p_nombre            TEXT,
    p_scheduled_for     TIMESTAMPTZ,
    p_template_name     TEXT,
    p_template_language TEXT,
    p_template_params   JSONB,
    p_source            TEXT,
    p_etiqueta          TEXT
)
RETURNS SETOF campaigns
LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT;
    v_count  INT;
BEGIN
    -- Row lock: se serializa contra el UPDATE de promoción scheduled→running
    -- de tick.js sobre la misma fila (cualquiera que llegue primero bloquea
    -- a la otra hasta su commit; la perdedora ve el estado post-commit real).
    SELECT status INTO v_status
      FROM campaigns
     WHERE id = p_campaign_id AND workspace_id = p_workspace_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    IF v_status <> 'scheduled' THEN
        RAISE EXCEPTION 'CAMPAIGN_NOT_SCHEDULED';
    END IF;

    -- Recalcular destinatarios: misma lógica que el POST de creación
    -- (contactos filtrados por tag solo si source='etiqueta' con etiqueta no
    -- vacía; + team_numbers si include_team_numbers=true; UNION dedupea).
    CREATE TEMP TABLE _edit_recipients ON COMMIT DROP AS
    WITH base_contacts AS (
        SELECT c.telefono FROM contacts c
         WHERE c.workspace_id = p_workspace_id
           AND (
                NOT (p_source = 'etiqueta' AND p_etiqueta IS NOT NULL AND p_etiqueta <> '')
                OR c.tags @> ARRAY[p_etiqueta]::TEXT[]
           )
    ),
    team AS (
        SELECT tn.telefono FROM team_numbers tn
          JOIN app_settings s ON s.workspace_id = tn.workspace_id
         WHERE tn.workspace_id = p_workspace_id AND s.include_team_numbers = true
    )
    SELECT telefono FROM base_contacts
    UNION
    SELECT telefono FROM team;

    SELECT COUNT(*) INTO v_count FROM _edit_recipients;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'NO_RECIPIENTS';
    END IF;

    DELETE FROM campaign_messages WHERE campaign_id = p_campaign_id;
    INSERT INTO campaign_messages (campaign_id, telefono)
    SELECT p_campaign_id, telefono FROM _edit_recipients;

    UPDATE campaigns SET
        nombre = p_nombre, scheduled_for = p_scheduled_for,
        template_name = p_template_name, template_language = p_template_language,
        template_params = p_template_params, source = p_source, etiqueta = p_etiqueta,
        total = v_count, enviados = 0, entregados = 0, leidos = 0, fallidos = 0
    WHERE id = p_campaign_id;

    RETURN QUERY SELECT * FROM campaigns WHERE id = p_campaign_id;
END;
$$;

COMMIT;
