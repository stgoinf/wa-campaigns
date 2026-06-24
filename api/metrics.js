// GET /api/metrics?from=ISO&to=ISO&groupBy=day|week|month&topN=5
//
// Devuelve:
//   - timeline:      [{ period, sent, delivered, read, failed }]   (ordenado asc)
//   - topTemplates:  [{ template, total, deliveryRate }]
//   - totals:        { sent, delivered, read, failed, deliveryRate, readRate, failRate }
//
// Defaults: from = ahora -7d, to = ahora, groupBy = day, topN = 5.

const { adminClient, dbError } = require('./_lib/supabase');
const { getUserId, getWorkspaceId } = require('./_lib/auth');

const VALID_BUCKETS = new Set(['day', 'week', 'month']);
const MAX_RANGE_DAYS = 366;   // 1 año máximo por query

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const workspaceId = await getWorkspaceId(req, userId);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace no especificado o inválido.' });

    // Parsing y defaults
    const now = new Date();
    let from  = req.query.from ? new Date(req.query.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let to    = req.query.to   ? new Date(req.query.to)   : now;
    const groupBy = (req.query.groupBy || 'day').toLowerCase();
    const topN    = Math.min(parseInt(req.query.topN, 10) || 5, 50);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return res.status(400).json({ error: 'from / to inválidos (deben ser ISO 8601).' });
    }
    if (from > to) [from, to] = [to, from];
    if (!VALID_BUCKETS.has(groupBy)) {
        return res.status(400).json({ error: 'groupBy debe ser day, week o month.' });
    }
    const rangeDays = (to - from) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_RANGE_DAYS) {
        return res.status(400).json({ error: `Rango máximo ${MAX_RANGE_DAYS} días.` });
    }

    const sb = adminClient();

    try {
        const [tlRes, ttRes] = await Promise.all([
            sb.rpc('metrics_timeline', {
                p_workspace: workspaceId,
                p_from:      from.toISOString(),
                p_to:        to.toISOString(),
                p_bucket:    groupBy,
            }),
            sb.rpc('metrics_top_templates', {
                p_workspace: workspaceId,
                p_from:      from.toISOString(),
                p_to:        to.toISOString(),
                p_limit:     topN,
            }),
        ]);

        if (tlRes.error) return dbError(res, tlRes.error);
        if (ttRes.error) return dbError(res, ttRes.error);

        const timeline = (tlRes.data || []).map(r => ({
            period:    r.period,
            sent:      Number(r.sent)      || 0,
            delivered: Number(r.delivered) || 0,
            read:      Number(r.read)      || 0,
            failed:    Number(r.failed)    || 0,
        }));

        const topTemplates = (ttRes.data || []).map(r => ({
            template:     r.template,
            total:        Number(r.total) || 0,
            deliveryRate: r.delivery_rate == null ? null : Number(r.delivery_rate),
        }));

        // totals = reduce de timeline
        const sums = timeline.reduce((a, r) => {
            a.sent      += r.sent;
            a.delivered += r.delivered;
            a.read      += r.read;
            a.failed    += r.failed;
            return a;
        }, { sent: 0, delivered: 0, read: 0, failed: 0 });

        const pct = (n, d) => d > 0 ? Math.round(1000 * n / d) / 10 : 0;

        const totals = {
            ...sums,
            deliveryRate: pct(sums.delivered, sums.sent),
            readRate:     pct(sums.read,      sums.sent),
            failRate:     pct(sums.failed,    sums.sent + sums.failed),
        };

        return res.json({
            range:        { from: from.toISOString(), to: to.toISOString(), groupBy },
            totals,
            timeline,
            topTemplates,
        });

    } catch (err) {
        return dbError(res, err, 'Metrics error');
    }
};
