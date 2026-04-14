// POST /api/contacts/upload
// Body: { contacts: [{ telefono, nombre?, etiqueta? }] }
// El cliente parsea el CSV y envía los datos ya procesados

const { adminClient } = require('../_lib/supabase');

const BATCH_SIZE = 2000;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array de contactos' });
    }

    const sb = adminClient();

    // Limpiar tabla y re-insertar en lotes
    const { error: delErr } = await sb.from('contacts').delete().neq('id', 0);
    if (delErr) return res.status(500).json({ error: delErr.message });

    let inserted = 0;
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
        const batch = contacts.slice(i, i + BATCH_SIZE).map(c => ({
            telefono:  String(c.telefono).replace(/\D/g, ''),
            nombre:    c.nombre  || null,
            etiqueta:  c.etiqueta || null
        })).filter(c => c.telefono.length >= 8);

        const { error } = await sb.from('contacts').upsert(batch, { onConflict: 'telefono' });
        if (error) return res.status(500).json({ error: error.message });
        inserted += batch.length;
    }

    const { count } = await sb.from('contacts').select('*', { count: 'exact', head: true });
    res.json({ success: true, total: count, inserted });
};
