// ─────────────────────────────────────────────────────────────────────────────
// wa-campaigns · backend Express para Railway (always-on)
//
// Reemplaza el modelo serverless de Vercel. Cada handler en api/**.js sigue
// siendo (req, res) puro — los montamos con el adaptador para que funcionen
// 1:1 sin cambios internos.
//
// URLs idénticas a las de Vercel, así el frontend (que llama fetch('/api/...'))
// sigue funcionando vía rewrite en vercel.json.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const { adapt } = require('./api/_lib/adapt');

const app = express();
app.disable('x-powered-by');

// Logs en stdout — Railway los captura automático.
app.use(morgan('tiny'));

// CORS: en operación normal el frontend llega vía rewrite (mismo origen),
// así que no es necesario. Activo como cinturón si alguien pega la URL del
// backend directo desde otro dominio.
const allowedOrigins = (process.env.FRONT_URL || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);                // curl / server-to-server
        if (allowedOrigins.length === 0) return cb(null, true);  // dev sin lista
        return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
}));

// Body parsers. Límite global 15 MB para acomodar contacts/upload con CSVs
// de hasta 50k filas. Webhook de Meta envía JSON pequeño.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Healthcheck — usado por Railway para validar el deploy.
app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now(), service: 'wa-campaigns-api' });
});

// ─── Endpoints planos ──────────────────────────────────────────────────────
app.all('/api/admin',           adapt(require('./api/admin')));
app.all('/api/send',            adapt(require('./api/send')));
app.all('/api/webhook',         adapt(require('./api/webhook')));
app.all('/api/settings',        adapt(require('./api/settings')));
app.all('/api/templates',       adapt(require('./api/templates')));
app.all('/api/workspaces',      adapt(require('./api/workspaces')));

// ─── Contacts ──────────────────────────────────────────────────────────────
app.all('/api/contacts',        adapt(require('./api/contacts/index')));
app.all('/api/contacts/upload', adapt(require('./api/contacts/upload')));

// ─── Campaigns ─────────────────────────────────────────────────────────────
// CRÍTICO: las rutas planas /manage y /messages van ANTES de /:id para que
// Express no las absorba como params.
app.all('/api/campaigns',          adapt(require('./api/campaigns/index')));
app.all('/api/campaigns/manage',   adapt(require('./api/campaigns/manage')));
app.all('/api/campaigns/messages', adapt(require('./api/campaigns/messages')));
app.all('/api/campaigns/:id',      adapt(require('./api/campaigns/[id]'), { id: 'id' }));

// 404 explícito para /api/* no matcheado
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado', path: req.path });
});

// Handler de errores global (devuelve 500 sanitizado).
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log(`wa-campaigns-api listening on :${port}`);
});

// Timeout defensivo. Vercel imponía 30s, en Railway no hay límite — pero
// no queremos requests colgadas indefinidamente.
server.setTimeout(60_000);
