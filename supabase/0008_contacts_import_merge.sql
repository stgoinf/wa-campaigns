-- RPC para el import CSV de contactos. Reemplaza el patrón anterior
-- (SELECT existentes con .in(telefono) + merge en JS + upsert) que rompía
-- con "Error interno del servidor" en importaciones grandes: el .in() con
-- miles de teléfonos genera una URL gigante que excede límites de la
-- request. Aquí el batch entero viaja como JSONB en el body del RPC (sin
-- límite de URL) y el merge de tags/nombre se hace atómico en SQL.

CREATE OR REPLACE FUNCTION upsert_contacts_batch(p_workspace_id UUID, p_user_id UUID, p_rows JSONB)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    affected INT;
BEGIN
    WITH input AS (
        SELECT
            regexp_replace(r->>'telefono', '\D', '', 'g') AS telefono,
            NULLIF(trim(r->>'nombre'), '')   AS nombre,
            NULLIF(trim(r->>'etiqueta'), '') AS etiqueta,
            ord
        FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(r, ord)
    ),
    -- Si el CSV trae el mismo teléfono repetido, nos quedamos con la
    -- última fila (mayor ord) — un solo INSERT no puede tocar la misma
    -- fila dos veces vía ON CONFLICT.
    filtered AS (
        SELECT DISTINCT ON (telefono) telefono, nombre, etiqueta
        FROM input
        WHERE length(telefono) >= 8
        ORDER BY telefono, ord DESC
    )
    INSERT INTO contacts AS c (telefono, nombre, etiqueta, tags, workspace_id, user_id)
    SELECT
        f.telefono,
        f.nombre,
        f.etiqueta,
        CASE WHEN f.etiqueta IS NOT NULL THEN ARRAY[f.etiqueta] ELSE '{}'::TEXT[] END,
        p_workspace_id,
        p_user_id
    FROM filtered f
    ON CONFLICT (workspace_id, telefono) DO UPDATE SET
        nombre = COALESCE(EXCLUDED.nombre, c.nombre),
        tags = CASE
            WHEN EXCLUDED.etiqueta IS NOT NULL AND NOT (EXCLUDED.etiqueta = ANY(c.tags))
                THEN c.tags || EXCLUDED.etiqueta
            ELSE c.tags
        END,
        etiqueta = CASE
            WHEN EXCLUDED.etiqueta IS NOT NULL AND NOT (EXCLUDED.etiqueta = ANY(c.tags))
                THEN (c.tags || EXCLUDED.etiqueta)[1]
            ELSE c.tags[1]
        END;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
