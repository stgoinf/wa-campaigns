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
        // Lista los workspaces donde el usuario es miembro (no solo dueño).
        const { data, error } = await sb
            .from('workspace_members')
            .select('role, workspace:workspaces(id, name, created_at)')
            .eq('user_id', userId)
            .order('created_at', { referencedTable: 'workspaces', ascending: true });
        if (error) return dbError(res, error);
        const workspaces = (data || [])
            .filter(r => r.workspace)
            .map(r => ({ ...r.workspace, role: r.role }));
        return res.json({ workspaces });
    }

    if (req.method === 'POST') {
        const { name } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ error: 'Se requiere un nombre para la cuenta.' });

        // 1. Crea el workspace con el user como dueño nominal
        const { data: ws, error: wsErr } = await sb
            .from('workspaces')
            .insert({ user_id: userId, name: name.trim() })
            .select()
            .single();
        if (wsErr) return dbError(res, wsErr);

        // 2. Lo registra como owner en workspace_members
        const { error: mErr } = await sb
            .from('workspace_members')
            .insert({ workspace_id: ws.id, user_id: userId, role: 'owner' });
        if (mErr) {
            // Rollback del workspace para no dejar inconsistencia
            await sb.from('workspaces').delete().eq('id', ws.id);
            return dbError(res, mErr, 'No se pudo registrar la membresía del workspace.');
        }

        return res.status(201).json(ws);
    }

    if (req.method === 'PUT') {
        const { id } = req.query;
        const { name } = req.body || {};
        if (!id) return res.status(400).json({ error: 'Falta el parámetro id.' });
        if (!name?.trim()) return res.status(400).json({ error: 'Se requiere un nombre.' });

        // Verifica que el usuario es miembro del workspace antes de renombrar.
        const { data: member } = await sb
            .from('workspace_members')
            .select('role')
            .eq('workspace_id', id)
            .eq('user_id', userId)
            .maybeSingle();
        if (!member) return res.status(403).json({ error: 'No tienes acceso a este workspace.' });

        const { error } = await sb
            .from('workspaces')
            .update({ name: name.trim() })
            .eq('id', id);
        if (error) return dbError(res, error);
        return res.json({ ok: true });
    }

    res.status(405).end();
};
