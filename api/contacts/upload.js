// POST /api/contacts/upload
// Body: { contacts: [{ telefono, nombre?, etiqueta? }] }
// Upsert aditivo — los contactos existentes se actualizan, no se borran.

const { adminClient, dbError } = require('../_lib/supabase');
const { getUserId, getWorkspaceId } = require('../_lib/auth');

const BATCH_SIZE  = 2000;
const MAX_CONTACTS = 50_000;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
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
            const batch = contacts.slice(i, i + BATCH_SIZE).map(c => {
                const etiqueta = c.etiqueta || null;
                return {
                    telefono:     String(c.telefono).replace(/\D/g, ''),
                    nombre:       c.nombre || null,
                    etiqueta,
                    tags:         etiqueta ? [etiqueta] : [],
                    user_id:      userId,
                    workspace_id: workspaceId,
                };
            }).filter(c => c.telefono.length >= 8);

            const { error } = await sb
                .from('contacts')
                .upsert(batch, { onConflict: 'workspace_id,telefono', ignoreDuplicates: false });
            if (error) return res.status(500).json({ error: `DB: ${error.message || error.details || JSON.stringify(error)}` });
            inserted += batch.length;
        }

        const { count } = await sb.from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId);
        res.json({ success: true, total: count, inserted });
    } catch (e) {
        res.status(500).json({ error: `EX: ${e.message}` });
    }
};
