// GET    /api/campaigns/[id]  → obtener una campaña
// DELETE /api/campaigns/[id]  → eliminar (solo draft/paused)

const { adminClient } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    const { id } = req.query;
    const sb = adminClient();

    if (req.method === 'GET') {
        const { data, error } = await sb.from('campaigns').select('*').eq('id', id).single();
        if (error || !data) return res.status(404).json({ error: 'No encontrada' });
        return res.json(data);
    }

    if (req.method === 'DELETE') {
        const { data: camp } = await sb.from('campaigns').select('status').eq('id', id).single();
        if (!camp) return res.status(404).json({ error: 'No encontrada' });
        if (camp.status === 'running') return res.status(400).json({ error: 'No se puede eliminar una campaña en ejecución' });

        await sb.from('campaign_messages').delete().eq('campaign_id', id);
        await sb.from('campaigns').delete().eq('id', id);
        return res.json({ deleted: true });
    }

    res.status(405).end();
};
