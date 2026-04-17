// GET    /api/contacts?page=1&limit=50&search=&etiqueta=&sent_preset=&sent_from=&sent_to=
// GET    /api/contacts?count=true
// GET    /api/contacts?etiquetas=true
// DELETE /api/contacts?id=123
// PUT    /api/contacts          body: { ids:[1,2,3], etiqueta:"promo" }  → bulk tag

const { adminClient } = require('../_lib/supabase');
const { getUserId }   = require('../_lib/auth');

module.exports = async function handler(req, res) {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const sb = adminClient();

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
        // count-only
        if (req.query.count === 'true') {
            const { count, error } = await sb
                .from('contacts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);
            if (error) return res.status(500).json({ error: error.message });
            return res.json({ count: count || 0 });
        }

        // all unique tags with contact counts (scoped to this user)
        if (req.query.etiquetas === 'true') {
            const { data, error } = await sb.rpc('get_all_tags_with_counts', { p_user_id: userId });
            if (error) return res.status(500).json({ error: error.message });
            return res.json({ etiquetas: data || [] });
        }

        const page      = Math.max(1, parseInt(req.query.page  || '1'));
        const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')));
        const search    = (req.query.search    || '').trim();
        const etiqueta  = (req.query.etiqueta  || '').trim();
        const preset    = (req.query.sent_preset || '').trim();
        const sentFrom  = (req.query.sent_from  || '').trim();
        const sentTo    = (req.query.sent_to    || '').trim();
        const from      = (page - 1) * limit;
        const to        = from + limit - 1;

        try {
            let query = sb
                .from('contacts')
                .select('id, telefono, nombre, etiqueta, tags, created_at, last_sent_at, last_template', { count: 'exact' })
                .eq('user_id', userId)
                .order('last_sent_at', { ascending: false, nullsFirst: false })
                .order('created_at',   { ascending: false })
                .range(from, to);

            if (search)   query = query.or(`telefono.ilike.%${search}%,nombre.ilike.%${search}%`);
            if (etiqueta) query = query.contains('tags', [etiqueta]);

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
        const { ids, etiqueta, mode = 'replace' } = req.body || {};
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ error: 'Se requiere un array de ids.' });
        }
        if (typeof etiqueta !== 'string') {
            return res.status(400).json({ error: 'Se requiere el campo etiqueta.' });
        }
        const tag = etiqueta.trim();
        try {
            if (mode === 'replace' || !tag) {
                const newTags = tag ? [tag] : [];
                const { error } = await sb
                    .from('contacts')
                    .update({ etiqueta: tag || null, tags: newTags })
                    .in('id', ids)
                    .eq('user_id', userId);
                if (error) return res.status(500).json({ error: error.message });
            } else if (mode === 'add') {
                for (const id of ids) {
                    const { data: row } = await sb.from('contacts').select('tags, etiqueta')
                        .eq('id', id).eq('user_id', userId).single();
                    const current = row?.tags || [];
                    if (!current.includes(tag)) {
                        const newTags = [...current, tag];
                        await sb.from('contacts').update({ tags: newTags, etiqueta: newTags[0] || null })
                            .eq('id', id).eq('user_id', userId);
                    }
                }
            } else if (mode === 'remove') {
                for (const id of ids) {
                    const { data: row } = await sb.from('contacts').select('tags, etiqueta')
                        .eq('id', id).eq('user_id', userId).single();
                    const current = row?.tags || [];
                    const newTags = current.filter(t => t !== tag);
                    await sb.from('contacts').update({ tags: newTags, etiqueta: newTags[0] || null })
                        .eq('id', id).eq('user_id', userId);
                }
            }
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
            const { error } = await sb.from('contacts').delete()
                .eq('id', id).eq('user_id', userId);
            if (error) return res.status(500).json({ error: error.message });
            return res.json({ ok: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.status(405).end();
};
