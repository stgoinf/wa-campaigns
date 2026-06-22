// POST /api/campaigns/tick
// Worker server-side disparado por Railway cron service cada 1 min.
//
// Hace 3 cosas:
//   1. Rescata mensajes 'claimed' colgados (>5 min sin enviar).
//   2. Promueve campañas 'scheduled' cuyo scheduled_for <= NOW() a 'running'.
//   3. Procesa N mensajes pending de campañas 'running': claim → enviar →
//      actualizar status + contador. Marca 'completed' cuando no quedan
//      mensajes.
//
// Gated por header x-cron-secret (matches process.env.CRON_SECRET).
// El budget es ilimitado en Railway (always-on) pero capamos por tick para
// no quemar la quota de Meta de un workspace en una sola pasada.

const { adminClient, dbError } = require('../_lib/supabase');
const { sendTemplate }         = require('../_lib/whatsapp');

const BATCH_PER_CAMPAIGN = 120;   // mensajes a procesar por campaña por tick
const CONCURRENCY        = 8;     // envíos en paralelo
const MAX_CAMPAIGNS_TICK = 10;    // campañas a procesar en un tick

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const provided = req.headers['x-cron-secret'];
    const expected = process.env.CRON_SECRET;
    if (!expected || provided !== expected) {
        return res.status(401).json({ error: 'invalid cron secret' });
    }

    const sb = adminClient();
    const start = Date.now();
    const summary = {
        rescued: 0,
        promoted: 0,
        campaignsProcessed: 0,
        sent: 0,
        failed: 0,
        completed: 0,
        elapsedMs: 0,
    };

    try {
        // 1. Rescate de claims colgados ──────────────────────────────────
        const { data: rescued } = await sb.rpc('rescue_stuck_claims');
        summary.rescued = Number(rescued) || 0;

        // 2. Promover scheduled → running ────────────────────────────────
        const { data: promoted, error: pErr } = await sb
            .from('campaigns')
            .update({ status: 'running', started_at: new Date().toISOString() })
            .eq('status', 'scheduled')
            .lte('scheduled_for', new Date().toISOString())
            .select('id');
        if (pErr) throw pErr;
        summary.promoted = (promoted || []).length;

        // 3. Tomar lista de campañas running para procesar ───────────────
        const { data: running, error: rErr } = await sb
            .from('campaigns')
            .select('id, workspace_id, template_name, template_language, template_params, total, enviados, fallidos')
            .eq('status', 'running')
            .order('started_at', { ascending: true, nullsFirst: true })
            .limit(MAX_CAMPAIGNS_TICK);
        if (rErr) throw rErr;

        for (const camp of running || []) {
            summary.campaignsProcessed++;

            // Reservar lote
            const { data: claimed, error: cErr } = await sb.rpc('claim_pending_messages', {
                p_campaign_id: camp.id,
                p_limit:       BATCH_PER_CAMPAIGN,
            });
            if (cErr) {
                console.error('[tick] claim error', camp.id, cErr.message);
                continue;
            }

            const messages = claimed || [];
            if (messages.length === 0) {
                // No quedan pending. Cerrar si todo procesado.
                if ((camp.enviados + camp.fallidos) >= camp.total) {
                    await sb.from('campaigns')
                        .update({ status: 'completed', completed_at: new Date().toISOString() })
                        .eq('id', camp.id);
                    summary.completed++;
                }
                continue;
            }

            // Enviar con concurrency limitada
            await processInChunks(messages, CONCURRENCY, async (msg) => {
                try {
                    const waId = await sendTemplate(
                        msg.telefono,
                        camp.template_name,
                        camp.template_language,
                        camp.template_params || [],
                        camp.workspace_id,
                    );
                    const now = new Date().toISOString();
                    await Promise.all([
                        sb.from('campaign_messages')
                          .update({ status: 'sent', wa_message_id: waId, sent_at: now })
                          .eq('id', msg.id),
                        sb.rpc('increment_campaign_sent', { campaign_id: camp.id }),
                    ]);
                    // Mejor esfuerzo: actualizar last_sent_at del contacto
                    sb.from('contacts')
                      .update({ last_sent_at: now, last_template: camp.template_name })
                      .eq('telefono', msg.telefono)
                      .eq('workspace_id', camp.workspace_id)
                      .then(() => {}).catch(() => {});
                    summary.sent++;
                } catch (err) {
                    const isRateLimit = err.code === 130429 || err.httpStatus === 429;
                    if (isRateLimit) {
                        // Devolver al pool pending para el próximo tick
                        await sb.from('campaign_messages')
                            .update({ status: 'pending', claimed_at: null })
                            .eq('id', msg.id);
                        return;
                    }
                    await Promise.all([
                        sb.from('campaign_messages')
                          .update({ status: 'failed', error: String(err.message).slice(0, 500), sent_at: new Date().toISOString() })
                          .eq('id', msg.id),
                        sb.rpc('increment_campaign_failed', { campaign_id: camp.id }),
                    ]);
                    summary.failed++;
                }
            });
        }

        summary.elapsedMs = Date.now() - start;
        console.log('[tick]', JSON.stringify(summary));
        return res.json({ ok: true, ...summary });

    } catch (err) {
        console.error('[tick] fatal', err);
        return dbError(res, err, 'Tick error');
    }
};

// Helper: procesa items en lotes paralelos de tamaño N.
async function processInChunks(items, concurrency, fn) {
    for (let i = 0; i < items.length; i += concurrency) {
        const chunk = items.slice(i, i + concurrency);
        await Promise.all(chunk.map(fn));
    }
}
