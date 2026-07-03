// GET  /api/campaigns       → lista todas (del workspace activo)
// POST /api/campaigns       → crear nueva

const { adminClient, dbError } = require('../_lib/supabase');
const { getUserId, getWorkspaceId } = require('../_lib/auth');
const { getSettings } = require('../_lib/getSettings');

module.exports = async function handler(req, res) {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const workspaceId = await getWorkspaceId(req, userId);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace no especificado o inválido.' });

    const sb = adminClient();

    // ── GET ──────────────────────────────────────
    if (req.method === 'GET') {
        const { data, error } = await sb
            .from('campaigns')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });

        if (error) return dbError(res, error);
        return res.json({ campaigns: data || [] });
    }

    // ── POST ─────────────────────────────────────
    if (req.method === 'POST') {
        const {
            nombre, templateName, templateLanguage = 'es',
            templateParams = [], source = 'all', etiqueta,
            scheduledFor,    // ISO string opcional. Si está → scheduled. Si no → ahora.
        } = req.body;

        if (!nombre || !templateName) {
            return res.status(400).json({ error: 'nombre y templateName son obligatorios' });
        }

        // Determinar momento de envío. El worker procesa todo lo que tenga
        // scheduled_for <= NOW(), así que un envío "inmediato" es simplemente
        // scheduled_for = ahora (el cron lo levanta en máx ~60s).
        let scheduledAt = new Date();
        if (scheduledFor) {
            const parsed = new Date(scheduledFor);
            if (isNaN(parsed.getTime())) {
                return res.status(400).json({ error: 'scheduledFor inválido (debe ser ISO 8601).' });
            }
            scheduledAt = parsed;
        }

        // Obtener TODOS los contactos paginando en bloques de 1000
        const PAGE = 1000;
        let contacts = [];
        let from = 0;
        while (true) {
            let query = sb.from('contacts')
                .select('telefono')
                .eq('workspace_id', workspaceId)
                .range(from, from + PAGE - 1);
            if (source === 'etiqueta' && etiqueta) query = query.contains('tags', [etiqueta]);
            const { data: page, error: cErr } = await query;
            if (cErr) return dbError(res, cErr);
            if (page && page.length) contacts = contacts.concat(page);
            if (!page || page.length < PAGE) break;
            from += PAGE;
        }

        // Números de equipo: si el workspace tiene el toggle activo, se
        // agregan siempre como destinatarios adicionales (dedupe por
        // teléfono contra los contactos ya incluidos).
        const wsSettings = await getSettings(workspaceId);
        if (wsSettings.include_team_numbers) {
            const { data: teamNums, error: tnErr } = await sb
                .from('team_numbers')
                .select('telefono')
                .eq('workspace_id', workspaceId);
            if (tnErr) return dbError(res, tnErr);

            const existing = new Set(contacts.map(c => c.telefono));
            for (const tn of (teamNums || [])) {
                if (!existing.has(tn.telefono)) {
                    contacts.push({ telefono: tn.telefono });
                    existing.add(tn.telefono);
                }
            }
        }

        if (!contacts.length) return res.status(400).json({ error: 'No hay contactos para esta selección' });

        const { data: camp, error: campErr } = await sb
            .from('campaigns')
            .insert({
                nombre,
                template_name:     templateName,
                template_language: templateLanguage,
                template_params:   templateParams,
                total:             contacts.length,
                user_id:           userId,
                workspace_id:      workspaceId,
                status:            'scheduled',
                scheduled_for:     scheduledAt.toISOString(),
            })
            .select()
            .single();

        if (campErr) return dbError(res, campErr);

        const BATCH = 2000;
        for (let i = 0; i < contacts.length; i += BATCH) {
            const batch = contacts.slice(i, i + BATCH).map(c => ({
                campaign_id: camp.id,
                telefono:    c.telefono
            }));
            const { error: mErr } = await sb.from('campaign_messages').insert(batch);
            if (mErr) return dbError(res, mErr);
        }

        return res.status(201).json(camp);
    }

    res.status(405).end();
};
