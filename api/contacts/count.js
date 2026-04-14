// GET /api/contacts/count
const { adminClient } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const sb = adminClient();
    const { count, error } = await sb
        .from('contacts')
        .select('*', { count: 'exact', head: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ count: count ?? 0 });
};
