const { createClient } = require('@supabase/supabase-js');

// Cliente admin con service key — solo para funciones serverless (nunca en el browser)
function adminClient() {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        { auth: { persistSession: false } }
    );
}

// Evita filtrar detalles internos de Supabase al cliente.
// Loguea el error real en el servidor para depuración.
function dbError(res, error, fallback = 'Error interno del servidor') {
    console.error('[db]', error?.message || error);
    return res.status(500).json({ error: fallback });
}

module.exports = { adminClient, dbError };
