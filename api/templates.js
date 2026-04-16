// GET /api/templates
// Devuelve las plantillas APPROVED desde la cuenta de Meta/WhatsApp Business

const GRAPH_URL       = 'https://graph.facebook.com/v19.0';
const { getSettings } = require('./_lib/getSettings');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const settings = await getSettings();
    const token    = settings.wa_access_token;
    const wabaId   = settings.wa_business_account_id;

    if (!token) {
        return res.status(500).json({ error: 'Access Token no configurado. Ve a Configuración y guarda tus credenciales.' });
    }
    if (!wabaId) {
        return res.status(500).json({ error: 'Business Account ID no configurado. Ve a Configuración y guarda el Business Account ID.' });
    }

    try {
        // Obtener plantillas aprobadas usando el Business Account ID configurado
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
