const GRAPH_URL       = 'https://graph.facebook.com/v19.0';
const { getSettings } = require('./getSettings');

async function sendTemplate(telefono, templateName, languageCode = 'es', components = [], userId = null) {
    const settings = await getSettings(userId);
    const token    = settings.wa_access_token;
    const phoneId  = settings.wa_phone_number_id;

    if (!token || !phoneId) {
        throw new Error('Credenciales de WhatsApp no configuradas. Ve a Configuración y guarda el Access Token y Phone Number ID.');
    }

    const to = formatPhone(telefono);

    const res = await fetch(
        `${GRAPH_URL}/${phoneId}/messages`,
        {
            method: 'POST',
            headers: {
                Authorization:  `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    ...(components.length > 0 && { components })
                }
            })
        }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data.messages?.[0]?.id ?? null;
}

function formatPhone(tel) {
    const cleaned = String(tel).replace(/\D/g, '');
    if (cleaned.length === 10) return `1${cleaned}`;  // RD: agregar código de país
    return cleaned;
}

module.exports = { sendTemplate };
