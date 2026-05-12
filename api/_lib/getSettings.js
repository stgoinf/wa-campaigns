// Helper: obtiene las credenciales de WhatsApp desde Supabase (tabla app_settings)
// Acepta workspaceId para multi-workspace: cada workspace tiene sus propias credenciales.
// Fallback a variables de entorno para desarrollo local.

const { adminClient } = require('./supabase');

async function getSettings(workspaceId = null) {
    const fromEnv = {
        wa_access_token:        process.env.WA_ACCESS_TOKEN        || null,
        wa_phone_number_id:     process.env.WA_PHONE_NUMBER_ID     || null,
        wa_business_account_id: process.env.WA_BUSINESS_ACCOUNT_ID || null,
    };

    try {
        const sb = adminClient();
        let query = sb.from('app_settings').select('*');

        if (workspaceId) {
            query = query.eq('workspace_id', workspaceId).single();
        } else {
            query = query.eq('id', 1).single();
        }

        const { data, error } = await query;
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
