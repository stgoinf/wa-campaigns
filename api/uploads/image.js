// POST /api/uploads/image
// Body: { filename, mime, dataB64 }
// Sube una imagen (PNG/JPG) a Supabase Storage y devuelve un publicUrl
// estable para usar como header IMAGE en plantillas de WhatsApp.
//
// El upload se hace server-side con service_role (bypassa RLS); la policy
// en storage.objects sigue siendo defense-in-depth contra subidas directas
// con anon key.

const { randomUUID } = require('node:crypto');
const { adminClient, dbError } = require('../_lib/supabase');
const { getUserId, getWorkspaceId } = require('../_lib/auth');

const BUCKET    = 'template-media';
const MAX_BYTES = 5 * 1024 * 1024;            // 5 MB, igual al límite del bucket y de WhatsApp
const ALLOWED   = { 'image/png': 'png', 'image/jpeg': 'jpg' };

// Vercel default body limit ≈ 4.5 MB. Una imagen de 3 MB inflada a base64
// pesa ~4 MB en JSON, lo que cabe. Para imágenes mayores el cliente debería
// pasar a presigned uploads directos al bucket (fuera de este PR).
module.exports.config = { api: { bodyParser: { sizeLimit: '6mb' } } };

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado.' });

    const workspaceId = await getWorkspaceId(req, userId);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace no especificado o inválido.' });

    const { filename, mime, dataB64 } = req.body || {};

    if (!ALLOWED[mime])    return res.status(415).json({ error: 'Formato no soportado. Usa PNG o JPG.' });
    if (!dataB64 || typeof dataB64 !== 'string') {
        return res.status(400).json({ error: 'Falta el contenido del archivo.' });
    }

    let buffer;
    try { buffer = Buffer.from(dataB64, 'base64'); }
    catch { return res.status(400).json({ error: 'No se pudo decodificar el archivo.' }); }

    if (buffer.byteLength === 0)             return res.status(400).json({ error: 'El archivo está vacío.' });
    if (buffer.byteLength > MAX_BYTES)       return res.status(413).json({ error: 'El archivo supera el límite de 5 MB.' });

    const ext  = ALLOWED[mime];
    const path = `${workspaceId}/${randomUUID()}.${ext}`;

    const sb = adminClient();
    const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: mime, upsert: false });
    if (upErr) return dbError(res, upErr, 'No se pudo subir la imagen.');

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    if (!pub?.publicUrl) {
        // Cleanup si por algún motivo no obtenemos la URL
        await sb.storage.from(BUCKET).remove([path]).catch(() => {});
        return res.status(500).json({ error: 'No se pudo generar la URL pública.' });
    }

    return res.status(201).json({
        url:      pub.publicUrl,
        path,
        size:     buffer.byteLength,
        filename: filename || null,
    });
};
