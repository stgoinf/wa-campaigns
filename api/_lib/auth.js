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

// Valida que el workspace_id enviado en x-workspace-id pertenece al usuario autenticado.
async function getWorkspaceId(req, userId) {
    const wsId = (req.headers['x-workspace-id'] || '').trim();
    if (!wsId || !userId) return null;
    const sb = adminClient();
    const { data } = await sb.from('workspaces')
        .select('id').eq('id', wsId).eq('user_id', userId).single();
    return data?.id || null;
}

module.exports = { getUserId, getWorkspaceId };
