// Helper: extrae y valida el user_id del JWT Bearer token
// Usado por todos los endpoints para identificar al usuario que hace la petición.

const { adminClient } = require('./supabase');

async function getUserId(req) {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return null;
    try {
        const { data: { user }, error } = await adminClient().auth.getUser(token);
        return (error || !user) ? null : user.id;
    } catch {
        return null;
    }
}

module.exports = { getUserId };
