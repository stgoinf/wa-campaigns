// POST /api/campaigns/complete?id=123
// Llamado por el frontend cuando el loop de envío termina

const { adminClient } = require('../_lib/supabase');
const { getUserId }   = require('../_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const { id } = req.query;
    const sb = adminClient();

    const { error } = await sb
        .from('campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ completed: true });
};
