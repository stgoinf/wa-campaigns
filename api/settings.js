// GET  /api/settings  → devuelve config actual del usuario (token enmascarado)
// POST /api/settings  → guarda nuevas credenciales en Supabase app_settings

const { adminClient } = require('./_lib/supabase');
const { getSettings }  = require('./_lib/getSettings');
const { getUserId }    = require('./_lib/auth');

function maskToken(token) {
    if (!token) return null;
    if (token.length <= 12) return '••••••••';
    return token.slice(0, 6) + '•'.repeat(token.length - 10) + token.slice(-4);
}

module.exports = async function handler(req, res) {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
        const settings = await getSettings(userId);
        return res.json({
            wa_access_token:            maskToken(settings.wa_access_token),
            wa_phone_number_id:         settings.wa_phone_number_id         || '',
            wa_business_account_id:     settings.wa_business_account_id     || '',
            wa_access_token_updated_at: settings.wa_access_token_updated_at || null,
        });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
        const { wa_access_token, wa_phone_number_id, wa_business_account_id } = req.body || {};

        if (!wa_access_token && !wa_phone_number_id && !wa_business_account_id) {
            return res.status(400).json({ error: 'No se recibió ningún campo para actualizar.' });
        }

        const sb = adminClient();

        // Leer valores actuales del usuario para no borrar lo que no se envió
        const current = await getSettings(userId);

        const newValues = {
            user_id:                userId,
            wa_access_token:        wa_access_token        || current.wa_access_token        || null,
            wa_phone_number_id:     wa_phone_number_id     || current.wa_phone_number_id     || null,
            wa_business_account_id: wa_business_account_id || current.wa_business_account_id || null,
            updated_at:             new Date().toISOString(),
        };

        const { error } = await sb
            .from('app_settings')
            .upsert(newValues, { onConflict: 'user_id' });

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ ok: true });
    }

    res.status(405).end();
};
