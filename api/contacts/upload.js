// POST /api/contacts/upload
// Body: { contacts: [{ telefono, nombre?, etiqueta? }] }
// Upsert aditivo — los contactos existentes se actualizan, no se borran.

const { adminClient, dbError } = require('../_lib/supabase');
const { getUserId, getWorkspaceId } = require('../_lib/auth');

const BATCH_SIZE  = 2000;
const MAX_CONTACTS = 50_000;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const workspaceId = await getWorkspaceId(req, userId);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace no especificado o inválido.' });

    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array de contactos' });
    }
    if (contacts.length > MAX_CONTACTS) {
        return res.status(400).json({ error: `Máximo ${MAX_CONTACTS.toLocaleString()} contactos por solicitud` });
    }

    const sb = adminClient();

    const normalized = contacts.map(c => ({
        telefono: String(c.telefono).replace(/\D/g, ''),
        nombre:   c.nombre || null,
        etiqueta: c.etiqueta || null,
    })).filter(c => c.telefono.length >= 8);

    let inserted = 0;
    for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
        const slice  = normalized.slice(i, i + BATCH_SIZE);
        const phones = slice.map(c => c.telefono);

        // Traer nombre/tags existentes para mezclarlos — el upsert no debe
        // pisar tags previos con la etiqueta nueva del CSV ni borrar el
        // nombre si esta fila no trae uno.
        const { data: existing, error: exErr } = await sb
            .from('contacts')
            .select('telefono, nombre, tags')
            .eq('workspace_id', workspaceId)
            .in('telefono', phones);
        if (exErr) return dbError(res, exErr);

        const existingByPhone = new Map((existing || []).map(r => [r.telefono, r]));

        const batch = slice.map(c => {
            const prev    = existingByPhone.get(c.telefono);
            const prevTags = prev?.tags || [];
            const tags    = c.etiqueta && !prevTags.includes(c.etiqueta)
                ? [...prevTags, c.etiqueta]
                : prevTags;
            return {
                telefono:     c.telefono,
                nombre:       c.nombre || prev?.nombre || null,
                etiqueta:     tags[0] || null,
                tags,
                user_id:      userId,
                workspace_id: workspaceId,
            };
        });

        const { error } = await sb
            .from('contacts')
            .upsert(batch, { onConflict: 'workspace_id,telefono', ignoreDuplicates: false });
        if (error) return dbError(res, error);
        inserted += batch.length;
    }

    const { count } = await sb.from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);
    res.json({ success: true, total: count, inserted });
};
