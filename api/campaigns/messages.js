// GET /api/campaigns/messages?id=123&limit=50&offset=0

const { adminClient } = require('../_lib/supabase');
const { getUserId }   = require('../_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const { id, limit = 50, offset = 0 } = req.query;
    const sb = adminClient();

    // Verificar que la campaña pertenece al usuario autenticado
    const { data: camp } = await sb.from('campaigns').select('id')
        .eq('id', id).eq('user_id', userId).single();
    if (!camp) return res.status(403).json({ error: 'Sin acceso a esta campaña' });

    const { data, error } = await sb
        .from('campaign_messages')
        .select('*')
        .eq('campaign_id', id)
        .order('id', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
};
