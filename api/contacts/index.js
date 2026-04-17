// GET    /api/contacts?page=1&limit=50&search=&etiqueta=&sent_preset=&sent_from=&sent_to=
// GET    /api/contacts?count=true
// DELETE /api/contacts?id=123
// PUT    /api/contacts          body: { ids:[1,2,3], etiqueta:"promo" }  → bulk tag

const { adminClient } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    const sb = adminClient();

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
        // count-only
        if (req.query.count === 'true') {
            const { count, error } = await sb
                .from('contacts')
                .select('*', { count: 'exact', head: true });
            if (error) return res.status(500).json({ error: error.message });
            return res.json({ count: count || 0 });
        }

        const page      = Math.max(1, parseInt(req.query.page  || '1'));
        const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')));
        const search    = (req.query.search    || '').trim();
        const etiqueta  = (req.query.etiqueta  || '').trim();
        const preset    = (req.query.sent_preset || '').trim(); // 7d | 30d | 90d | never | custom
        const sentFrom  = (req.query.sent_from  || '').trim(); // ISO date, only with preset=custom
        const sentTo    = (req.query.sent_to    || '').trim(); // ISO date, only with preset=custom
        const from      = (page - 1) * limit;
        const to        = from + limit - 1;

        try {
            let query = sb
                .from('contacts')
                .select('id, telefono, nombre, etiqueta, created_at, last_sent_at, last_template', { count: 'exact' })
                .order('last_sent_at', { ascending: false, nullsFirst: false })
                .order('created_at',   { ascending: false })
                .range(from, to);

            if (search)   query = query.or(`telefono.ilike.%${search}%,nombre.ilike.%${search}%`);
            if (etiqueta) query = query.eq('etiqueta', etiqueta);

            // Filtro por fecha de último envío
            if (preset === 'never') {
                query = query.is('last_sent_at', null);
            } else if (preset === '7d' || preset === '30d' || preset === '90d') {
                const days  = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
                const since = new Date(Date.now() - days * 86400000).toISOString();
                query = query.gte('last_sent_at', since);
            } else if (preset === 'custom') {
                if (sentFrom) query = query.gte('last_sent_at', new Date(sentFrom).toISOString());
                if (sentTo)   query = query.lte('last_sent_at', new Date(sentTo + 'T23:59:59').toISOString());
            }

            const { data, error, count } = await query;
            if (error) return res.status(500).json({ error: error.message });

            const pages = Math.ceil((count || 0) / limit);
            return res.json({ contacts: data || [], total: count || 0, page, pages });

        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // ── PUT: asignar etiqueta en bloque ──────────────────────────────────────
    if (req.method === 'PUT') {
        const { ids, etiqueta } = req.body || {};
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ error: 'Se requiere un array de ids.' });
        }
        if (typeof etiqueta !== 'string') {
            return res.status(400).json({ error: 'Se requiere el campo etiqueta.' });
        }
        try {
            const { error } = await sb
                .from('contacts')
                .update({ etiqueta: etiqueta.trim() || null })
                .in('id', ids);
            if (error) return res.status(500).json({ error: error.message });
            return res.json({ ok: true, updated: ids.length });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // ── DELETE: eliminar por id ──────────────────────────────────────────────
    if (req.method === 'DELETE') {
        const id = parseInt(req.query.id || '0');
        if (!id) return res.status(400).json({ error: 'Falta el parámetro id.' });
        try {
            const { error } = await sb.from('contacts').delete().eq('id', id);
            if (error) return res.status(500).json({ error: error.message });
            return res.json({ ok: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.status(405).end();
};
