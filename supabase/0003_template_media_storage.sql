-- ──────────────────────────────────────────────────────────────────────────────
-- Migración 0003 — bucket "template-media" para imágenes de plantillas WA
-- ──────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase > SQL Editor.
-- Idempotente: se puede correr varias veces sin efecto adverso.
--
-- WhatsApp Cloud API necesita una URL pública para el header IMAGE de las
-- plantillas. Antes el usuario pegaba un link de Google Drive; ahora subimos
-- el PNG/JPG directo a Supabase Storage y obtenemos un publicUrl estable.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Bucket público con límite de tamaño y allowlist de MIME
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'template-media',
    'template-media',
    true,                       -- público: Meta necesita poder descargarlo sin auth
    5242880,                    -- 5 MB (límite de WhatsApp para header IMAGE)
    ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
   SET public            = EXCLUDED.public,
       file_size_limit   = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;


-- 2. RLS storage.objects — defense-in-depth
--    Los uploads van vía /api/uploads/image con service_role (bypassa RLS).
--    Esta policy solo aplica si alguien intentara subir directo con anon key.
--    El folder raíz del path es el workspace_id; permitimos escribir solo a
--    miembros de ese workspace.
DROP POLICY IF EXISTS "template_media_upload" ON storage.objects;
CREATE POLICY "template_media_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'template-media'
        AND (storage.foldername(name))[1] IN (
            SELECT workspace_id::text
            FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Lectura pública (cualquier usuario, incluyendo el CDN de Meta) — implícita
-- por bucket.public=true. No hace falta policy adicional para SELECT.
