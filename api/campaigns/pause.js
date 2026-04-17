// POST /api/campaigns/pause?id=123

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
        .update({ status: 'paused' })
        .eq('id', id).eq('user_id', userId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ paused: true });
};
