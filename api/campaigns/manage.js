// POST /api/campaigns/manage?action=start|pause|complete&id=123
// Fusiona start.js, pause.js y complete.js en un solo endpoint para respetar
// el límite de 12 funciones de Vercel Hobby.

const { adminClient } = require('../_lib/supabase');
const { getUserId }   = require('../_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const { id, action } = req.query;
    if (!id)     return res.status(400).json({ error: 'Falta el parámetro id' });
    if (!action) return res.status(400).json({ error: 'Falta el parámetro action (start|pause|complete)' });

    const sb = adminClient();

    if (action === 'start') {
        const { data: camp } = await sb.from('campaigns').select('status')
            .eq('id', id).eq('user_id', userId).single();
        if (!camp) return res.status(404).json({ error: 'Campaña no encontrada' });
        if (camp.status === 'running')   return res.status(400).json({ error: 'Ya está en ejecución' });
        if (camp.status === 'completed') return res.status(400).json({ error: 'Ya fue completada' });

        const { error } = await sb.from('campaigns')
            .update({ status: 'running', started_at: new Date().toISOString() })
            .eq('id', id).eq('user_id', userId);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ started: true });
    }

    if (action === 'pause') {
        const { error } = await sb.from('campaigns')
            .update({ status: 'paused' })
            .eq('id', id).eq('user_id', userId);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ paused: true });
    }

    if (action === 'complete') {
        const { error } = await sb.from('campaigns')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', id).eq('user_id', userId);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ completed: true });
    }

    res.status(400).json({ error: 'action debe ser start, pause o complete' });
};
