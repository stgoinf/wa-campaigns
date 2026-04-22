// POST /api/send
// Body: { campaignId, messageId, telefono, templateName?, templateLanguage?, templateParams? }
// Envía UN mensaje via WhatsApp API y actualiza Supabase.
// Si se pasan templateName/Language/Params se omite la consulta de campaña (más rápido).
// El frontend lo llama en lotes paralelos de N mensajes.

const { adminClient } = require('./_lib/supabase');
const { sendTemplate } = require('./_lib/whatsapp');
const { getUserId }    = require('./_lib/auth');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const { campaignId, messageId, telefono,
            templateName, templateLanguage, templateParams } = req.body;
    if (!campaignId || !messageId || !telefono) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }

    const sb = adminClient();

    let tmplName, tmplLang, tmplParams;

    if (templateName) {
        // Datos de plantilla enviados desde el frontend — evita consulta DB por mensaje
        tmplName   = templateName;
        tmplLang   = templateLanguage || 'es';
        tmplParams = templateParams   || [];
    } else {
        // Fallback: consultar campaña (compatibilidad con llamadas sin datos de plantilla)
        const { data: camp, error: cErr } = await sb
            .from('campaigns')
            .select('template_name, template_language, template_params, status')
            .eq('id', campaignId)
            .eq('user_id', userId)
            .single();
        if (cErr || !camp) return res.status(404).json({ error: 'Campaña no encontrada' });
        if (camp.status !== 'running') return res.status(400).json({ error: 'Campaña no está en ejecución' });
        tmplName   = camp.template_name;
        tmplLang   = camp.template_language;
        tmplParams = camp.template_params || [];
    }

    try {
        const waId = await sendTemplate(telefono, tmplName, tmplLang, tmplParams, userId);
        const now  = new Date().toISOString();

        // Actualizar mensaje e incrementar contador en paralelo
        await Promise.all([
            sb.from('campaign_messages')
              .update({ status: 'sent', wa_message_id: waId, sent_at: now })
              .eq('id', messageId),
            sb.rpc('increment_campaign_sent', { campaign_id: campaignId }),
        ]);

        // Contacto — best-effort, sin bloquear la respuesta
        sb.from('contacts')
          .update({ last_sent_at: now, last_template: tmplName })
          .eq('telefono', telefono)
          .eq('user_id', userId)
          .then(() => {}).catch(() => {});

        res.json({ success: true, waMessageId: waId });

    } catch (err) {
        // Rate limit de Meta — no marcar como fallido, el frontend reintentará
        const isRateLimit = err.code === 130429 || err.httpStatus === 429;
        if (isRateLimit) {
            return res.json({ success: false, rateLimited: true, error: err.message });
        }

        await Promise.all([
            sb.from('campaign_messages')
              .update({ status: 'failed', error: err.message, sent_at: new Date().toISOString() })
              .eq('id', messageId),
            sb.rpc('increment_campaign_failed', { campaign_id: campaignId }),
        ]);
        res.json({ success: false, error: err.message });
    }
};
