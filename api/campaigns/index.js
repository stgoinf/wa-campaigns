// GET  /api/campaigns       → lista todas
// POST /api/campaigns       → crear nueva

const { adminClient } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    const sb = adminClient();

    // ── GET ──────────────────────────────────────
    if (req.method === 'GET') {
        const { data, error } = await sb
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
    }

    // ── POST ─────────────────────────────────────
    if (req.method === 'POST') {
        const {
            nombre, templateName, templateLanguage = 'es',
            templateParams = [], source = 'all', etiqueta
        } = req.body;

        if (!nombre || !templateName) {
            return res.status(400).json({ error: 'nombre y templateName son obligatorios' });
        }

        // Obtener contactos según la fuente
        let query = sb.from('contacts').select('telefono');
        if (source === 'etiqueta' && etiqueta) query = query.eq('etiqueta', etiqueta);

        const { data: contacts, error: cErr } = await query;
        if (cErr) return res.status(500).json({ error: cErr.message });
        if (!contacts.length) return res.status(400).json({ error: 'No hay contactos para esta selección' });

        // Crear campaña
        const { data: camp, error: campErr } = await sb
            .from('campaigns')
            .insert({
                nombre,
                template_name:     templateName,
                template_language: templateLanguage,
                template_params:   templateParams,
                total:             contacts.length
            })
            .select()
            .single();

        if (campErr) return res.status(500).json({ error: campErr.message });

        // Insertar mensajes en lotes de 2000
        const BATCH = 2000;
        for (let i = 0; i < contacts.length; i += BATCH) {
            const batch = contacts.slice(i, i + BATCH).map(c => ({
                campaign_id: camp.id,
                telefono:    c.telefono
            }));
            const { error: mErr } = await sb.from('campaign_messages').insert(batch);
            if (mErr) return res.status(500).json({ error: mErr.message });
        }

        return res.status(201).json(camp);
    }

    res.status(405).end();
};
