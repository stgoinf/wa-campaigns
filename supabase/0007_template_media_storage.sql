-- Bucket público para imágenes de header de plantillas WhatsApp.
-- Las subidas las hace siempre el backend (service_role, bypassa RLS) vía
-- POST /api/uploads/image — el browser nunca habla directo con Storage.
-- public=true expone las imágenes en una URL pública (requerido: Meta debe
-- poder descargarlas para enviarlas como header de plantilla).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('template-media', 'template-media', true, 5242880, ARRAY['image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;
