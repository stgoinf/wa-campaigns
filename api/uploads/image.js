// POST /api/uploads/image
// Body: { mime, dataB64 }
// Sube una imagen de header de plantilla a Supabase Storage (bucket público
// template-media) y devuelve su URL pública. El browser nunca habla
// directo con Storage — siempre pasa por aquí con el service_role key.

const crypto = require('crypto');
const { adminClient, dbError } = require('../_lib/supabase');
const { getUserId, getWorkspaceId } = require('../_lib/auth');

const ALLOWED_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const MAX_BYTES = 5 * 1024 * 1024; // límite de WhatsApp para headers de imagen

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const workspaceId = await getWorkspaceId(req, userId);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace no especificado o inválido.' });

    const { mime, dataB64 } = req.body || {};
    const ext = ALLOWED_MIME[mime];
    if (!ext) return res.status(400).json({ error: 'Formato no soportado. Usa PNG o JPG.' });
    if (!dataB64) return res.status(400).json({ error: 'Falta el archivo.' });

    const buffer = Buffer.from(dataB64, 'base64');
    if (buffer.length > MAX_BYTES) {
        return res.status(400).json({ error: 'La imagen supera el límite de 5MB.' });
    }

    const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
    const sb = adminClient();
    const { error } = await sb.storage.from('template-media').upload(path, buffer, { contentType: mime });
    if (error) return dbError(res, error, 'No se pudo subir la imagen.');

    const { data } = sb.storage.from('template-media').getPublicUrl(path);
    res.json({ url: data.publicUrl });
};
