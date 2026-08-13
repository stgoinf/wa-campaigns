// GET    /api/campaigns/[id]  → obtener una campaña (del workspace activo)
// DELETE /api/campaigns/[id]  → eliminar (solo draft/paused)

const { adminClient, dbError } = require('../_lib/supabase');
const { getUserId, getWorkspaceId } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const workspaceId = await getWorkspaceId(req, userId);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace no especificado o inválido.' });

    const { id } = req.query;
    const sb = adminClient();

    if (req.method === 'GET') {
        const { data, error } = await sb.from('campaigns').select('*')
            .eq('id', id).eq('workspace_id', workspaceId).single();
        if (error || !data) return res.status(404).json({ error: 'No encontrada' });
        return res.json(data);
    }

    if (req.method === 'DELETE') {
        const { data: camp } = await sb.from('campaigns').select('status')
            .eq('id', id).eq('workspace_id', workspaceId).single();
        if (!camp) return res.status(404).json({ error: 'No encontrada' });
        if (camp.status === 'running') return res.status(400).json({ error: 'No se puede eliminar una campaña en ejecución' });

        await sb.from('campaign_messages').delete().eq('campaign_id', id);
        await sb.from('campaigns').delete().eq('id', id).eq('workspace_id', workspaceId);
        return res.json({ deleted: true });
    }

    // PUT: editar una campaña 'scheduled' (nombre, fecha, plantilla+params,
    // destinatarios). Recalcula campaign_messages vía RPC atómica — ver
    // supabase/0011_edit_scheduled_campaign.sql.
    if (req.method === 'PUT') {
        const campaignId = Number(id);
        if (!Number.isInteger(campaignId)) return res.status(400).json({ error: 'id de campaña inválido' });

        const {
            nombre, templateName, templateLanguage = 'es', templateParams = [],
            source = 'all', etiqueta, scheduledFor,
        } = req.body;
        if (!nombre || !templateName) return res.status(400).json({ error: 'nombre y templateName son obligatorios' });

        let scheduledAt = new Date();
        if (scheduledFor) {
            const parsed = new Date(scheduledFor);
            if (isNaN(parsed.getTime())) return res.status(400).json({ error: 'scheduledFor inválido (debe ser ISO 8601).' });
            scheduledAt = parsed;
        }

        const { data, error } = await sb.rpc('edit_scheduled_campaign', {
            p_campaign_id:       campaignId,
            p_workspace_id:      workspaceId,
            p_nombre:            nombre,
            p_scheduled_for:     scheduledAt.toISOString(),
            p_template_name:     templateName,
            p_template_language: templateLanguage,
            p_template_params:   templateParams,
            p_source:            source,
            p_etiqueta:          etiqueta || null,
        });

        if (error) {
            if (error.message === 'NOT_FOUND') return res.status(404).json({ error: 'No encontrada' });
            if (error.message === 'CAMPAIGN_NOT_SCHEDULED') return res.status(409).json({ error: 'La campaña ya no está programada (probablemente ya empezó a enviarse). Refresca la lista.' });
            if (error.message === 'NO_RECIPIENTS') return res.status(400).json({ error: 'No hay contactos para esta selección' });
            return dbError(res, error);
        }
        return res.json(Array.isArray(data) ? data[0] : data);
    }

    res.status(405).end();
};
