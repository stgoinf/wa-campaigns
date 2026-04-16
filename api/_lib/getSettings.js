// Helper: obtiene las credenciales de WhatsApp desde Supabase (tabla app_settings)
// con fallback a variables de entorno (para desarrollo local).

const { adminClient } = require('./supabase');

async function getSettings() {
    // Fallback a env vars si están configuradas (desarrollo local / Vercel dashboard)
    const fromEnv = {
        wa_access_token:        process.env.WA_ACCESS_TOKEN        || null,
        wa_phone_number_id:     process.env.WA_PHONE_NUMBER_ID     || null,
        wa_business_account_id: process.env.WA_BUSINESS_ACCOUNT_ID || null,
    };

    try {
        const sb = adminClient();
        const { data, error } = await sb
            .from('app_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (error || !data) return fromEnv;

        return {
            wa_access_token:            data.wa_access_token        || fromEnv.wa_access_token,
            wa_phone_number_id:         data.wa_phone_number_id     || fromEnv.wa_phone_number_id,
            wa_business_account_id:     data.wa_business_account_id || fromEnv.wa_business_account_id,
            wa_access_token_updated_at: data.updated_at,
        };
    } catch {
        return fromEnv;
    }
}

module.exports = { getSettings };
