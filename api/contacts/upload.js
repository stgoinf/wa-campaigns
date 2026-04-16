// POST /api/contacts/upload
// Body: { contacts: [{ telefono, nombre?, etiqueta? }] }
// Upsert aditivo — los contactos existentes se actualizan, no se borran.
// Los campos last_sent_at y last_template se preservan al hacer upsert.

const { adminClient } = require('../_lib/supabase');

const BATCH_SIZE = 2000;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array de contactos' });
    }

    const sb = adminClient();

    let inserted = 0;
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
        const batch = contacts.slice(i, i + BATCH_SIZE).map(c => ({
            telefono: String(c.telefono).replace(/\D/g, ''),
            nombre:   c.nombre   || null,
            etiqueta: c.etiqueta || null
        })).filter(c => c.telefono.length >= 8);

        // ignoredDuplicateHandling: upsert preserva last_sent_at y last_template existentes
        const { error } = await sb
            .from('contacts')
            .upsert(batch, { onConflict: 'telefono', ignoreDuplicates: false });
        if (error) return res.status(500).json({ error: error.message });
        inserted += batch.length;
    }

    const { count } = await sb.from('contacts').select('*', { count: 'exact', head: true });
    res.json({ success: true, total: count, inserted });
};
