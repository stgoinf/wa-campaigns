// GET /api/workspaces        → lista los workspaces del usuario autenticado
// POST /api/workspaces       → crea un nuevo workspace
// PUT /api/workspaces?id=... → renombra un workspace

const { adminClient, dbError } = require('./_lib/supabase');
const { getUserId } = require('./_lib/auth');

module.exports = async function handler(req, res) {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const sb = adminClient();

    if (req.method === 'GET') {
        const { data, error } = await sb
            .from('workspaces')
            .select('id, name, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });
        if (error) return dbError(res, error);
        return res.json({ workspaces: data || [] });
    }

    if (req.method === 'POST') {
        const { name } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ error: 'Se requiere un nombre para la cuenta.' });
        const { data, error } = await sb
            .from('workspaces')
            .insert({ user_id: userId, name: name.trim() })
            .select()
            .single();
        if (error) return dbError(res, error);
        return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
        const { id } = req.query;
        const { name } = req.body || {};
        if (!id) return res.status(400).json({ error: 'Falta el parámetro id.' });
        if (!name?.trim()) return res.status(400).json({ error: 'Se requiere un nombre.' });
        const { error } = await sb
            .from('workspaces')
            .update({ name: name.trim() })
            .eq('id', id)
            .eq('user_id', userId);
        if (error) return dbError(res, error);
        return res.json({ ok: true });
    }

    res.status(405).end();
};
