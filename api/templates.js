// GET /api/templates
// Devuelve las plantillas APPROVED desde la cuenta de Meta/WhatsApp Business

const GRAPH_URL    = 'https://graph.facebook.com/v19.0';
const { getSettings } = require('./_lib/getSettings');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const settings = await getSettings();
    const token    = settings.wa_access_token;
    const phoneId  = settings.wa_phone_number_id;

    if (!token || !phoneId) {
        return res.status(500).json({ error: 'Credenciales de WhatsApp no configuradas. Ve a la sección Configuración y guarda tu Access Token y Phone Number ID.' });
    }

    try {
        // 1. Obtener el WABA Business ID a partir del Phone Number ID
        const phoneRes  = await fetch(`${GRAPH_URL}/${phoneId}?fields=account_id&access_token=${token}`);
        const phoneData = await phoneRes.json();

        if (phoneData.error) throw new Error(phoneData.error.message);
        const wabaId = phoneData.account_id;
        if (!wabaId) throw new Error('No se pudo obtener el WABA Business ID');

        // 2. Obtener plantillas aprobadas
        const url = `${GRAPH_URL}/${wabaId}/message_templates?status=APPROVED&limit=100&fields=name,language,status,components&access_token=${token}`;
        const tmplRes  = await fetch(url);
        const tmplData = await tmplRes.json();

        if (tmplData.error) throw new Error(tmplData.error.message);

        const templates = tmplData.data || [];
        res.json({ templates, total: templates.length });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
