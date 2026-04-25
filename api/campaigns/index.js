// GET  /api/campaigns       → lista todas (del usuario autenticado)
// POST /api/campaigns       → crear nueva

const { adminClient } = require('../_lib/supabase');
const { getUserId }   = require('../_lib/auth');

module.exports = async function handler(req, res) {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const sb = adminClient();

    // ── GET ──────────────────────────────────────
    if (req.method === 'GET') {
        const { data, error } = await sb
            .from('campaigns')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ campaigns: data || [] });
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

        // Obtener TODOS los contactos paginando en bloques de 1000
        // (Supabase/PostgREST tiene max_rows=1000 por defecto — hay que paginar)
        const PAGE = 1000;
        let contacts = [];
        let from = 0;
        while (true) {
            let query = sb.from('contacts')
                .select('telefono')
                .eq('user_id', userId)
                .range(from, from + PAGE - 1);
            if (source === 'etiqueta' && etiqueta) query = query.contains('tags', [etiqueta]);
            const { data: page, error: cErr } = await query;
            if (cErr) return res.status(500).json({ error: cErr.message });
            if (page && page.length) contacts = contacts.concat(page);
            if (!page || page.length < PAGE) break; // última página
            from += PAGE;
        }
        if (!contacts.length) return res.status(400).json({ error: 'No hay contactos para esta selección' });

        // Crear campaña con user_id
        const { data: camp, error: campErr } = await sb
            .from('campaigns')
            .insert({
                nombre,
                template_name:     templateName,
                template_language: templateLanguage,
                template_params:   templateParams,
                total:             contacts.length,
                user_id:           userId
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
