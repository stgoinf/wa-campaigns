// GET /api/campaigns/messages?id=123&limit=50&offset=0

const { adminClient } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const { id, limit = 50, offset = 0 } = req.query;
    const sb = adminClient();

    const { data, error } = await sb
        .from('campaign_messages')
        .select('*')
        .eq('campaign_id', id)
        .order('id', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
};
