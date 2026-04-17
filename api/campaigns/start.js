// POST /api/campaigns/start?id=123
// Marca la campaña como 'running'. El frontend ejecuta el loop de envío.

const { adminClient } = require('../_lib/supabase');
const { getUserId }   = require('../_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const { id } = req.query;
    const sb = adminClient();

    const { data: camp } = await sb.from('campaigns').select('status')
        .eq('id', id).eq('user_id', userId).single();
    if (!camp) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (camp.status === 'running')   return res.status(400).json({ error: 'Ya está en ejecución' });
    if (camp.status === 'completed') return res.status(400).json({ error: 'Ya fue completada' });

    const { error } = await sb
        .from('campaigns')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ started: true });
};
