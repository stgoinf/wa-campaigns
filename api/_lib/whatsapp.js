const GRAPH_URL = 'https://graph.facebook.com/v19.0';

async function sendTemplate(telefono, templateName, languageCode = 'es', components = []) {
    const to = formatPhone(telefono);

    const res = await fetch(
        `${GRAPH_URL}/${process.env.WA_PHONE_NUMBER_ID}/messages`,
        {
            method: 'POST',
            headers: {
                Authorization:  `Bearer ${process.env.WA_ACCESS_TOKEN}`,
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
