// POST /api/send
// Body: { campaignId, messageId, telefono, templateName?, templateLanguage?, templateParams? }
// Envía UN mensaje via WhatsApp API y actualiza Supabase.

const { adminClient } = require('./_lib/supabase');
const { sendTemplate } = require('./_lib/whatsapp');
const { getUserId, getWorkspaceId } = require('./_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const workspaceId = await getWorkspaceId(req, userId);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace no especificado o inválido.' });

    const { campaignId, messageId, telefono,
            templateName, templateLanguage, templateParams } = req.body;
    if (!campaignId || !messageId || !telefono) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }

    const sb = adminClient();

    const { data: camp, error: cErr } = await sb
        .from('campaigns')
        .select('template_name, template_language, template_params, status')
        .eq('id', campaignId)
        .eq('workspace_id', workspaceId)
        .single();
    if (cErr || !camp) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (camp.status !== 'running') return res.status(400).json({ error: 'Campaña no está en ejecución' });

    const tmplName   = camp.template_name;
    const tmplLang   = camp.template_language;
    const tmplParams = templateParams && camp.template_params
        ? templateParams
        : camp.template_params || [];

    try {
        const waId = await sendTemplate(telefono, tmplName, tmplLang, tmplParams, workspaceId);
        const now  = new Date().toISOString();

        await Promise.all([
            sb.from('campaign_messages')
              .update({ status: 'sent', wa_message_id: waId, sent_at: now })
              .eq('id', messageId)
              .eq('campaign_id', campaignId),
            sb.rpc('increment_campaign_sent', { campaign_id: campaignId }),
        ]);

        sb.from('contacts')
          .update({ last_sent_at: now, last_template: tmplName })
          .eq('telefono', telefono)
          .eq('workspace_id', workspaceId)
          .then(() => {}).catch(() => {});

        res.json({ success: true, waMessageId: waId });

    } catch (err) {
        const isRateLimit = err.code === 130429 || err.httpStatus === 429;
        if (isRateLimit) {
            return res.json({ success: false, rateLimited: true, error: err.message });
        }

        await Promise.all([
            sb.from('campaign_messages')
              .update({ status: 'failed', error: err.message, sent_at: new Date().toISOString() })
              .eq('id', messageId)
              .eq('campaign_id', campaignId),
            sb.rpc('increment_campaign_failed', { campaign_id: campaignId }),
        ]);
        res.json({ success: false, error: err.message });
    }
};
