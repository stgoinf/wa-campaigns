// GET /api/admin?view=users   → lista de todos los usuarios con sus estadísticas
// GET /api/admin?view=stats   → métricas globales de la plataforma
// Solo accesible para el email de administrador

const { adminClient, dbError } = require('./_lib/supabase');
const { getUserId }   = require('./_lib/auth');

async function isAdmin(req) {
    const userId = await getUserId(req);
    if (!userId) return null;
    const sb = adminClient();
    const { data: { user }, error } = await sb.auth.admin.getUserById(userId);
    if (error || !user) return null;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return null;
    return user.email === adminEmail ? userId : null;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const adminId = await isAdmin(req);
    if (!adminId) return res.status(403).json({ error: 'Sin acceso. Solo el administrador puede ver este panel.' });

    const sb   = adminClient();
    const view = req.query.view || 'users';

    try {
        // ── Vista: lista de usuarios ──────────────────────────────────────────
        if (view === 'users') {
            const { data: { users }, error: uErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
            if (uErr) throw uErr;

            // Obtener estadísticas de todos los usuarios en paralelo
            const stats = await Promise.all(users.map(async u => {
                const [
                    { count: contacts },
                    { count: campaigns },
                    { data: campData }
                ] = await Promise.all([
                    sb.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
                    sb.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
                    sb.from('campaigns').select('enviados, fallidos, status, created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(5),
                ]);

                const totalSent   = (campData || []).reduce((s, c) => s + (c.enviados || 0), 0);
                const lastCampaign= (campData || []).find(c => c.enviados > 0);
                const hasConfig   = false; // no accedemos a app_settings para simplificar

                return {
                    id:           u.id,
                    email:        u.email,
                    created_at:   u.created_at,
                    confirmed:    !!u.email_confirmed_at,
                    contacts:     contacts  || 0,
                    campaigns:    campaigns || 0,
                    sent:         totalSent,
                    last_campaign: lastCampaign?.created_at || null,
                    recent_campaigns: campData || [],
                };
            }));

            // Ordenar: más activos primero
            stats.sort((a, b) => b.sent - a.sent || b.campaigns - a.campaigns);

            return res.json({ users: stats, total: stats.length });
        }

        // ── Vista: estadísticas globales ──────────────────────────────────────
        if (view === 'stats') {
            const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 });
            const totalUsers = users?.length || 0;
            const confirmedUsers = users?.filter(u => u.email_confirmed_at).length || 0;

            const [
                { count: totalContacts },
                { data: campData },
            ] = await Promise.all([
                sb.from('contacts').select('*', { count: 'exact', head: true }),
                sb.from('campaigns').select('enviados, fallidos, status'),
            ]);

            const totalSent    = (campData || []).reduce((s, c) => s + (c.enviados  || 0), 0);
            const totalFailed  = (campData || []).reduce((s, c) => s + (c.fallidos  || 0), 0);
            const activeCamps  = (campData || []).filter(c => c.status === 'running').length;

            return res.json({
                total_users:     totalUsers,
                confirmed_users: confirmedUsers,
                total_contacts:  totalContacts  || 0,
                total_sent:      totalSent,
                total_failed:    totalFailed,
                active_campaigns: activeCamps,
            });
        }

        res.status(400).json({ error: 'view no válido. Usa ?view=users o ?view=stats' });

    } catch (err) {
        dbError(res, err);
    }
};
