// GET  /api/webhook  → verificación del webhook por Meta
// POST /api/webhook  → eventos de entrega (delivered, read, failed)

const { adminClient } = require('./_lib/supabase');

module.exports = async function handler(req, res) {

    // ── Verificación ──────────────────────────────
    if (req.method === 'GET') {
        const mode      = req.query['hub.mode'];
        const token     = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
            return res.status(200).send(challenge);
        }
        return res.sendStatus(403);
    }

    // ── Eventos de entrega ────────────────────────
    if (req.method === 'POST') {
        res.sendStatus(200); // Meta requiere respuesta inmediata

        const body = req.body;
        if (body?.object !== 'whatsapp_business_account') return;

        const sb = adminClient();

        for (const entry of body.entry ?? []) {
            for (const change of entry.changes ?? []) {
                for (const status of change.value?.statuses ?? []) {
                    await processStatus(sb, status);
                }
            }
        }
        return;
    }

    res.status(405).end();
};

async function processStatus(sb, status) {
    const { id: waId, status: statusValue, timestamp, errors } = status;

    // Buscar el mensaje por wa_message_id
    const { data: msg } = await sb
        .from('campaign_messages')
        .select('id, campaign_id')
        .eq('wa_message_id', waId)
        .single();

    if (!msg) return;

    const ts = timestamp ? new Date(Number(timestamp) * 1000).toISOString() : null;

    // Actualizar el mensaje
    const update = { status: statusValue };
    if (statusValue === 'delivered') update.delivered_at = ts;
    if (statusValue === 'read')      update.read_at = ts;
    if (statusValue === 'failed')    update.error = errors?.[0]?.message ?? 'Error desconocido';

    await sb.from('campaign_messages').update(update).eq('id', msg.id);

    // Actualizar contadores de la campaña
    const rpcMap = {
        delivered: 'increment_campaign_delivered',
        read:      'increment_campaign_read',
        failed:    'increment_campaign_failed'
    };
    if (rpcMap[statusValue]) {
        await sb.rpc(rpcMap[statusValue], { campaign_id: msg.campaign_id });
    }
}
