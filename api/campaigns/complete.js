// POST /api/campaigns/complete?id=123
// Llamado por el frontend cuando el loop de envío termina

const { adminClient } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { id } = req.query;
    const sb = adminClient();

    const { error } = await sb
        .from('campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ completed: true });
};
