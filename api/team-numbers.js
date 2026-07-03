// GET    /api/team-numbers        → lista números de equipo del workspace
// POST   /api/team-numbers        → agrega un número { telefono, etiqueta }
// DELETE /api/team-numbers?id=123 → elimina por id

const { adminClient, dbError } = require('./_lib/supabase');
const { getUserId, getWorkspaceId } = require('./_lib/auth');

module.exports = async function handler(req, res) {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const workspaceId = await getWorkspaceId(req, userId);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace no especificado o inválido.' });

    const sb = adminClient();

    if (req.method === 'GET') {
        const { data, error } = await sb
            .from('team_numbers')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: true });
        if (error) return dbError(res, error);
        return res.json({ teamNumbers: data || [] });
    }

    if (req.method === 'POST') {
        const telefono = String(req.body?.telefono || '').replace(/\D/g, '');
        const etiqueta = String(req.body?.etiqueta || '').trim();

        if (telefono.length < 8) {
            return res.status(400).json({ error: 'El teléfono debe tener al menos 8 dígitos.' });
        }
        if (!etiqueta) {
            return res.status(400).json({ error: 'La etiqueta es obligatoria (ej. "Juan - Ventas").' });
        }

        const { data, error } = await sb
            .from('team_numbers')
            .insert({ workspace_id: workspaceId, telefono, etiqueta })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Ese número ya está agregado en este workspace.' });
            }
            return dbError(res, error);
        }
        return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
        const id = parseInt(req.query.id || '0');
        if (!id) return res.status(400).json({ error: 'Falta el parámetro id.' });
        const { error } = await sb.from('team_numbers').delete()
            .eq('id', id).eq('workspace_id', workspaceId);
        if (error) return dbError(res, error);
        return res.json({ ok: true });
    }

    res.status(405).end();
};
