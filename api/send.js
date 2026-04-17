// POST /api/send
// Body: { campaignId, messageId, telefono }
// Envía UN mensaje via WhatsApp API y actualiza Supabase.
// El frontend llama esto en loop con rate limiting.

const { adminClient } = require('./_lib/supabase');
const { sendTemplate } = require('./_lib/whatsapp');
const { getUserId }    = require('./_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const { campaignId, messageId, telefono } = req.body;
    if (!campaignId || !messageId || !telefono) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }

    const sb = adminClient();

    // Obtener datos de la campaña (validando ownership)
    const { data: camp, error: cErr } = await sb
        .from('campaigns')
        .select('template_name, template_language, template_params, status')
        .eq('id', campaignId)
        .eq('user_id', userId)
        .single();

    if (cErr || !camp) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (camp.status !== 'running') return res.status(400).json({ error: 'Campaña no está en ejecución' });

    try {
        // Enviar usando las credenciales del usuario autenticado
        const waId = await sendTemplate(
            telefono,
            camp.template_name,
            camp.template_language,
            camp.template_params || [],
            userId
        );

        const now = new Date().toISOString();

        // Actualizar mensaje como enviado
        await sb
            .from('campaign_messages')
            .update({ status: 'sent', wa_message_id: waId, sent_at: now })
            .eq('id', messageId);

        // Incrementar contador de enviados en la campaña
        await sb.rpc('increment_campaign_sent', { campaign_id: campaignId });

        // Registrar último envío en el contacto (best-effort)
        sb.from('contacts')
          .update({ last_sent_at: now, last_template: camp.template_name })
          .eq('telefono', telefono)
          .eq('user_id', userId)
          .then(() => {}).catch(() => {});

        res.json({ success: true, waMessageId: waId });

    } catch (err) {
        // Marcar como fallido
        await sb
            .from('campaign_messages')
            .update({ status: 'failed', error: err.message, sent_at: new Date().toISOString() })
            .eq('id', messageId);

        await sb.rpc('increment_campaign_failed', { campaign_id: campaignId });

        res.json({ success: false, error: err.message });
    }
};
