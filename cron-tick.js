// ─────────────────────────────────────────────────────────────────────────────
// cron-tick.js — worker que dispara el procesamiento de campañas programadas
//
// Se ejecuta como servicio separado en Railway (cron schedule: cada 1 min).
// Hace un POST al endpoint /api/campaigns/tick (que se creará en PR 5) con
// header de autenticación interno. No procesa nada por sí mismo — solo
// dispara — para mantener la lógica centralizada en el server web.
//
// Stub para esta migración: el endpoint /api/campaigns/tick aún no existe;
// el cron loggea el intento y sale. Cuando PR 5 lo cree, este stub funciona
// como está sin cambios.
// ─────────────────────────────────────────────────────────────────────────────

const INTERNAL_API   = process.env.INTERNAL_API_URL || 'http://localhost:3000';
const CRON_SECRET    = process.env.CRON_SECRET || '';
const ENDPOINT_PATH  = '/api/campaigns/tick';

async function tick() {
    if (!CRON_SECRET) {
        console.warn('[cron] CRON_SECRET no configurado — abortando.');
        process.exit(1);
    }

    const url = `${INTERNAL_API}${ENDPOINT_PATH}`;
    const start = Date.now();

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type':   'application/json',
                'x-cron-secret':  CRON_SECRET,
            },
            body: JSON.stringify({ source: 'railway-cron', ts: start }),
        });

        const body = await res.text();
        const ms   = Date.now() - start;

        if (res.status === 404) {
            // Endpoint todavía no implementado (pre-PR 5). Salida limpia.
            console.log(`[cron] ${ENDPOINT_PATH} no disponible aún (404). ${ms}ms`);
            process.exit(0);
        }

        if (!res.ok) {
            console.error(`[cron] ${res.status} en ${ms}ms — ${body.slice(0, 200)}`);
            process.exit(1);
        }

        console.log(`[cron] ok en ${ms}ms — ${body.slice(0, 200)}`);
        process.exit(0);
    } catch (err) {
        console.error('[cron] error de red:', err.message);
        process.exit(1);
    }
}

tick();
