// POST /api/campaigns/manage?action=start|pause|complete&id=123

const { adminClient } = require('../_lib/supabase');
const { getUserId, getWorkspaceId } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const workspaceId = await getWorkspaceId(req, userId);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace no especificado o inválido.' });

    const { id, action } = req.query;
    if (!id)     return res.status(400).json({ error: 'Falta el parámetro id' });
    if (!action) return res.status(400).json({ error: 'Falta el parámetro action (start|pause|complete)' });

    const sb = adminClient();

    if (action === 'start') {
        const { data: camp } = await sb.from('campaigns').select('status')
            .eq('id', id).eq('workspace_id', workspaceId).single();
        if (!camp) return res.status(404).json({ error: 'Campaña no encontrada' });
        if (camp.status === 'running')   return res.status(400).json({ error: 'Ya está en ejecución' });
        if (camp.status === 'completed') return res.status(400).json({ error: 'Ya fue completada' });

        const { error } = await sb.from('campaigns')
            .update({ status: 'running', started_at: new Date().toISOString() })
            .eq('id', id).eq('workspace_id', workspaceId);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ started: true });
    }

    if (action === 'pause') {
        const { error } = await sb.from('campaigns')
            .update({ status: 'paused' })
            .eq('id', id).eq('workspace_id', workspaceId);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ paused: true });
    }

    if (action === 'complete') {
        const { error } = await sb.from('campaigns')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', id).eq('workspace_id', workspaceId);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ completed: true });
    }

    res.status(400).json({ error: 'action debe ser start, pause o complete' });
};
