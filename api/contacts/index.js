// GET    /api/contacts?page=1&limit=50&search=&etiqueta=
// DELETE /api/contacts?id=123

const { adminClient } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    const sb = adminClient();

    // ── GET: lista paginada ──────────────────────────────────────────────────
    if (req.method === 'GET') {
        const page     = Math.max(1, parseInt(req.query.page  || '1'));
        const limit    = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')));
        const search   = (req.query.search   || '').trim();
        const etiqueta = (req.query.etiqueta || '').trim();
        const from     = (page - 1) * limit;
        const to       = from + limit - 1;

        try {
            let query = sb
                .from('contacts')
                .select('id, telefono, nombre, etiqueta, created_at, last_sent_at, last_template', { count: 'exact' })
                .order('last_sent_at', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false })
                .range(from, to);

            if (search) {
                query = query.or(`telefono.ilike.%${search}%,nombre.ilike.%${search}%`);
            }
            if (etiqueta) {
                query = query.eq('etiqueta', etiqueta);
            }

            const { data, error, count } = await query;
            if (error) return res.status(500).json({ error: error.message });

            const pages = Math.ceil((count || 0) / limit);
            return res.json({ contacts: data || [], total: count || 0, page, pages });

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
