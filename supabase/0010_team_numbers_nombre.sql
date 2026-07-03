-- team_numbers ganaba un campo "nombre" propio (ej. "Juan Pérez"),
-- separado de "etiqueta" (ej. "Ventas", ahora opcional/categoría).
-- Antes "etiqueta" hacía las dos funciones a la vez; se migra su valor
-- actual a "nombre" para no perder los datos ya cargados.

BEGIN;

ALTER TABLE team_numbers ADD COLUMN IF NOT EXISTS nombre TEXT;
UPDATE team_numbers SET nombre = etiqueta WHERE nombre IS NULL;
ALTER TABLE team_numbers ALTER COLUMN nombre SET NOT NULL;
ALTER TABLE team_numbers ALTER COLUMN etiqueta DROP NOT NULL;

COMMIT;
