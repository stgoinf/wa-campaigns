// POST /api/contacts/upload
// Body: { contacts: [{ telefono, nombre?, etiqueta? }] }
// Upsert aditivo — los contactos existentes se actualizan, no se borran.
//
// El merge de tags/nombre se hace en SQL (RPC upsert_contacts_batch), no en
// JS: un .in('telefono', [...miles...]) para traer los existentes generaba
// una URL gigante que rompía con "Error interno del servidor" en imports
// grandes. El batch entero viaja como JSONB en el body, sin límite de URL.

const { adminClient, dbError } = require('../_lib/supabase');
const { getUserId, getWorkspaceId } = require('../_lib/auth');

const BATCH_SIZE   = 2000;
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

    let inserted = 0;
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
        const batch = contacts.slice(i, i + BATCH_SIZE).map(c => ({
            telefono: c.telefono != null ? String(c.telefono) : '',
            nombre:   c.nombre   || null,
            etiqueta: c.etiqueta || null,
        }));

        const { data, error } = await sb.rpc('upsert_contacts_batch', {
            p_workspace_id: workspaceId,
            p_user_id:      userId,
            p_rows:         batch,
        });
        if (error) return dbError(res, error);
        inserted += data || 0;
    }

    const { count } = await sb.from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);
    res.json({ success: true, total: count, inserted });
};
