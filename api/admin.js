// GET  /api/admin?view=users           → lista de todos los usuarios con sus estadísticas
// GET  /api/admin?view=stats           → métricas globales de la plataforma
// POST /api/admin?action=create-user   → da de alta un cliente (email, password, workspaceName)
// Solo accesible para el email de administrador

const { adminClient, dbError } = require('./_lib/supabase');
const { getUserId }   = require('./_lib/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function isAdmin(req) {
    const userId = await getUserId(req);
    if (!userId) return null;
    const sb = adminClient();
    const { data: { user }, error } = await sb.auth.admin.getUserById(userId);
    if (error || !user) return null;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return null;
    return user.email === adminEmail ? userId : null;
}

module.exports = async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();

    const adminId = await isAdmin(req);
    if (!adminId) return res.status(403).json({ error: 'Sin acceso. Solo el administrador puede ver este panel.' });

    const sb = adminClient();

    if (req.method === 'POST') return handleAction(req, res, sb, adminId);

    const view = req.query.view || 'users';

    try {
        // ── Vista: lista de usuarios ──────────────────────────────────────────
        if (view === 'users') {
            const { data: { users }, error: uErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
            if (uErr) throw uErr;

            // Obtener estadísticas de todos los usuarios en paralelo
            const stats = await Promise.all(users.map(async u => {
                const [
                    { count: contacts },
                    { count: campaigns },
                    { data: campData }
                ] = await Promise.all([
                    sb.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
                    sb.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
                    sb.from('campaigns').select('enviados, fallidos, status, created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(5),
                ]);

                const totalSent   = (campData || []).reduce((s, c) => s + (c.enviados || 0), 0);
                const lastCampaign= (campData || []).find(c => c.enviados > 0);
                const hasConfig   = false; // no accedemos a app_settings para simplificar

                return {
                    id:           u.id,
                    email:        u.email,
                    created_at:   u.created_at,
                    confirmed:    !!u.email_confirmed_at,
                    contacts:     contacts  || 0,
                    campaigns:    campaigns || 0,
                    sent:         totalSent,
                    last_campaign: lastCampaign?.created_at || null,
                    recent_campaigns: campData || [],
                };
            }));

            // Ordenar: más activos primero
            stats.sort((a, b) => b.sent - a.sent || b.campaigns - a.campaigns);

            return res.json({ users: stats, total: stats.length });
        }

        // ── Vista: estadísticas globales ──────────────────────────────────────
        if (view === 'stats') {
            const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 });
            const totalUsers = users?.length || 0;
            const confirmedUsers = users?.filter(u => u.email_confirmed_at).length || 0;

            const [
                { count: totalContacts },
                { data: campData },
            ] = await Promise.all([
                sb.from('contacts').select('*', { count: 'exact', head: true }),
                sb.from('campaigns').select('enviados, fallidos, status'),
            ]);

            const totalSent    = (campData || []).reduce((s, c) => s + (c.enviados  || 0), 0);
            const totalFailed  = (campData || []).reduce((s, c) => s + (c.fallidos  || 0), 0);
            const activeCamps  = (campData || []).filter(c => c.status === 'running').length;

            return res.json({
                total_users:     totalUsers,
                confirmed_users: confirmedUsers,
                total_contacts:  totalContacts  || 0,
                total_sent:      totalSent,
                total_failed:    totalFailed,
                active_campaigns: activeCamps,
            });
        }

        // ── Vista: listado de workspaces (para el dropdown del modal) ─────────
        if (view === 'workspaces') {
            const [{ data: workspaces, error: wErr }, { data: members }] = await Promise.all([
                sb.from('workspaces').select('id, name, user_id, created_at').order('name'),
                sb.from('workspace_members').select('workspace_id, user_id, role'),
            ]);
            if (wErr) throw wErr;

            const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 });
            const emailById = new Map((users || []).map(u => [u.id, u.email]));

            const memberCount = new Map();
            (members || []).forEach(m => {
                memberCount.set(m.workspace_id, (memberCount.get(m.workspace_id) || 0) + 1);
            });

            const rows = (workspaces || []).map(w => ({
                id:           w.id,
                name:         w.name,
                owner_email:  emailById.get(w.user_id) || null,
                member_count: memberCount.get(w.id) || 0,
                created_at:   w.created_at,
            }));
            return res.json({ workspaces: rows });
        }

        res.status(400).json({ error: 'view no válido. Usa ?view=users, ?view=stats o ?view=workspaces' });

    } catch (err) {
        dbError(res, err);
    }
};

async function handleAction(req, res, sb, adminId) {
    const action = req.query.action;

    if (action === 'create-user') {
        const { email, password, workspaceName, workspaceId } = req.body || {};

        if (!email || !EMAIL_RE.test(email))   return res.status(400).json({ error: 'Email no válido.' });
        if (!password || password.length < 8)  return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });

        // Modo: 'existing' si el admin escogió un workspace ya creado; 'new' si va a crear uno.
        const useExisting = !!workspaceId;
        if (!useExisting && !workspaceName?.trim()) {
            return res.status(400).json({ error: 'Se requiere un nombre de workspace nuevo o un workspaceId existente.' });
        }

        // Si va a asignar uno existente, verificarlo antes de crear el usuario
        // para no dejar al usuario creado si el workspaceId es inválido.
        let targetWs = null;
        if (useExisting) {
            const { data, error } = await sb
                .from('workspaces')
                .select('id, name')
                .eq('id', workspaceId)
                .maybeSingle();
            if (error) return dbError(res, error);
            if (!data)  return res.status(404).json({ error: 'El workspace seleccionado no existe.' });
            targetWs = data;
        }

        const { data: created, error: cErr } = await sb.auth.admin.createUser({
            email,
            password,
            email_confirm: true,        // saltamos el flujo de verificación
        });
        if (cErr || !created?.user) {
            const msg = cErr?.message || '';
            const status = /already registered|exists/i.test(msg) ? 409 : 500;
            return res.status(status).json({ error: msg ? `No se pudo crear el usuario: ${msg}` : 'No se pudo crear el usuario.' });
        }

        const newUserId = created.user.id;

        // Rollback helper común
        const rollback = async (errPayload) => {
            await sb.auth.admin.deleteUser(newUserId).catch(() => {});
            return errPayload;
        };

        if (useExisting) {
            // Agrega al nuevo usuario como member del workspace existente.
            const { error: mErr } = await sb
                .from('workspace_members')
                .insert({ workspace_id: targetWs.id, user_id: newUserId, role: 'member' });
            if (mErr) return dbError(res, await rollback(mErr), 'No se pudo asignar el workspace al cliente.');

            return res.status(201).json({
                userId:        newUserId,
                email:         created.user.email,
                workspaceId:   targetWs.id,
                workspaceName: targetWs.name,
                assigned:      true,
            });
        }

        // Crear workspace nuevo + registrar al usuario como 'owner'
        const { data: ws, error: wErr } = await sb
            .from('workspaces')
            .insert({ user_id: newUserId, name: workspaceName.trim() })
            .select('id, name')
            .single();
        if (wErr) return dbError(res, await rollback(wErr), 'No se pudo crear el workspace del cliente.');

        const { error: mErr } = await sb
            .from('workspace_members')
            .insert({ workspace_id: ws.id, user_id: newUserId, role: 'owner' });
        if (mErr) {
            // Rollback workspace + user
            await sb.from('workspaces').delete().eq('id', ws.id).catch(() => {});
            return dbError(res, await rollback(mErr), 'No se pudo registrar la membresía del workspace.');
        }

        return res.status(201).json({
            userId:        newUserId,
            email:         created.user.email,
            workspaceId:   ws.id,
            workspaceName: ws.name,
            assigned:      false,
        });
    }

    if (action === 'reset-password') {
        const { userId, password } = req.body || {};
        if (!userId)                          return res.status(400).json({ error: 'Falta userId.' });
        if (!password || password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });

        const { error } = await sb.auth.admin.updateUserById(userId, { password });
        if (error) return dbError(res, error, 'No se pudo actualizar la contraseña.');
        return res.json({ ok: true });
    }

    if (action === 'confirm-email') {
        const { userId } = req.body || {};
        if (!userId) return res.status(400).json({ error: 'Falta userId.' });

        const { data, error } = await sb.auth.admin.updateUserById(userId, {
            email_confirm: true,
        });
        if (error) return dbError(res, error, 'No se pudo confirmar el email.');
        return res.json({ ok: true, confirmed_at: data?.user?.email_confirmed_at || null });
    }

    if (action === 'delete-user') {
        const { userId, confirmEmail } = req.body || {};
        if (!userId)        return res.status(400).json({ error: 'Falta userId.' });
        if (!confirmEmail)  return res.status(400).json({ error: 'Confirma el email del usuario que vas a eliminar.' });

        if (userId === adminId) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de admin desde aquí.' });
        }

        // Verifica que el email confirmado por el admin coincide con el del usuario,
        // como salvaguarda contra clicks accidentales.
        const { data: target, error: gErr } = await sb.auth.admin.getUserById(userId);
        if (gErr || !target?.user) return res.status(404).json({ error: 'Usuario no encontrado.' });
        if (target.user.email !== confirmEmail) {
            return res.status(400).json({ error: 'El email de confirmación no coincide.' });
        }

        const { error } = await sb.auth.admin.deleteUser(userId);
        if (error) return dbError(res, error, 'No se pudo eliminar el usuario.');
        // ON DELETE CASCADE en workspaces.user_id y workspace_members.user_id se
        // encarga del resto. Los workspaces donde era único owner desaparecen
        // junto con sus contacts/campaigns (cascade desde workspaces.id).
        return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'action no soportada. Usa ?action=create-user|reset-password|confirm-email|delete-user.' });
}
