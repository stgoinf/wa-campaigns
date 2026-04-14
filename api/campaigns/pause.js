// POST /api/campaigns/pause?id=123

const { adminClient } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { id } = req.query;
    const sb = adminClient();

    const { error } = await sb
        .from('campaigns')
        .update({ status: 'paused' })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ paused: true });
};
