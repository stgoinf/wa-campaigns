const { createClient } = require('@supabase/supabase-js');

// Cliente admin con service key — solo para funciones serverless (nunca en el browser)
function adminClient() {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        { auth: { persistSession: false } }
    );
}

module.exports = { adminClient };
