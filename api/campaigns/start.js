// POST /api/campaigns/start?id=123
// Marca la campaña como 'running'. El frontend ejecuta el loop de envío.

const { adminClient } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { id } = req.query;
    const sb = adminClient();

    const { data: camp } = await sb.from('campaigns').select('status').eq('id', id).single();
    if (!camp) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (camp.status === 'running')   return res.status(400).json({ error: 'Ya está en ejecución' });
    if (camp.status === 'completed') return res.status(400).json({ error: 'Ya fue completada' });

    const { error } = await sb
        .from('campaigns')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ started: true });
};
