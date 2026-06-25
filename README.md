# wa-campaigns (Pidebot)

SaaS multi-tenant para enviar campañas de plantillas de WhatsApp (Cloud API de Meta) a una lista de contactos, con scheduling, métricas y panel de administración.

## Arquitectura

```
Browser ──► Vercel (estático: index.html, app.js, admin.html, admin.js, styles.css)
              │
              │  rewrite /api/* → Railway (vercel.json)
              ▼
Railway · Node 20 · Express · always-on (server.js)
  ├── 12+ endpoints REST (api/**)
  └── worker de scheduling (setInterval interno, cada TICK_INTERVAL_MS)
              │
              ├──► Supabase (Postgres + Auth + Realtime)
              └──► Meta WhatsApp Cloud API
```

- **Frontend**: HTML/CSS/JS sin framework ni build step. Se sirve estático desde Vercel.
- **Backend**: Express en Railway (migrado desde Vercel Serverless Functions — ver [`api/_lib/adapt.js`](api/_lib/adapt.js), que envuelve cada handler `(req, res)` sin tocar su firma).
- **Base de datos**: Supabase (Postgres con RLS, Auth, Realtime para progreso de campañas en vivo).
- **Mensajería**: Meta WhatsApp Cloud API. Las credenciales (`access_token`, `phone_number_id`, `business_account_id`) viven por workspace en la tabla `app_settings`, no en variables de entorno (salvo fallback de desarrollo local — ver [`api/_lib/getSettings.js`](api/_lib/getSettings.js)).

## Estructura del repo

```
index.html, app.js, styles.css     → app principal (cliente)
admin.html, admin.js               → panel de administración (gestión de usuarios/workspaces)
server.js                          → entry point Express (Railway)
api/                               → handlers REST, montados 1:1 en server.js
  _lib/                            → helpers compartidos (auth, supabase, whatsapp, adapt)
  campaigns/                       → CRUD + scheduling + worker de envío (tick.js)
  contacts/                        → listado + upload CSV
supabase/                          → migraciones SQL (schema.sql = base, 000N_*.sql = incrementales)
vercel.json, .vercelignore         → config del frontend + rewrite a Railway
railway.json, nixpacks.toml        → config de build/deploy en Railway
```

## Funcionalidades

- **Campañas**: crear, programar (`scheduled_for`), pausar/reanudar, seguimiento en vivo (Realtime) de enviados/entregados/leídos/fallidos.
- **Scheduling**: worker server-side (`api/campaigns/tick.js`) corre cada `TICK_INTERVAL_MS` (default 20s ≈ 6 msg/s), reclama mensajes pendientes con `claim_pending_messages` (RPC con `FOR UPDATE SKIP LOCKED` para evitar doble envío) y rescata claims colgados con `rescue_stuck_claims`.
- **Plantillas**: listado desde la Graph API de Meta, preview estilo burbuja de WhatsApp antes de enviar.
- **Contactos**: import vía CSV.
- **Métricas**: tab de Análisis con timeline (día/semana/mes), KPIs (tasa de entrega/lectura/fallo) y top plantillas — vía RPCs `metrics_timeline` / `metrics_top_templates`.
- **Multi-workspace**: un usuario puede pertenecer a varios workspaces (`workspace_members`, roles `owner`/`member`).
- **Admin**: crear usuarios (nuevos o asignados a un workspace existente), resetear password, confirmar email, eliminar usuario.
- **Tema**: claro/oscuro con WCAG AA, persistido en `localStorage`.

## Requisitos

- Node.js ≥ 20
- Cuenta de Supabase (Postgres + Auth + Realtime habilitados)
- Cuenta de Meta for Developers con WhatsApp Business Cloud API configurada

## Variables de entorno (Railway / backend)

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key (bypassa RLS, solo backend) |
| `ADMIN_EMAIL` | Email autorizado para acceder al panel admin |
| `WEBHOOK_VERIFY_TOKEN` | Token de verificación del webhook de Meta (handshake) |
| `CRON_SECRET` | Header `x-cron-secret` para invocar `/api/campaigns/tick` manualmente por HTTP |
| `FRONT_URL` | Origen(es) permitidos por CORS (lista separada por comas) |
| `TICK_INTERVAL_MS` | Frecuencia del worker de scheduling en ms (default `20000`) |
| `PORT` | Puerto del servidor Express (Railway lo inyecta automático) |
| `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_BUSINESS_ACCOUNT_ID` | Fallback solo para desarrollo local — en producción se leen de `app_settings` por workspace |

El frontend (Vercel) no usa variables de entorno: la `SUPABASE_ANON_KEY` (key pública) está hardcodeada en `app.js`/`admin.js`.

## Desarrollo local

```bash
npm install
cp .env.example .env   # completar con tus credenciales de Supabase
npm run dev             # node --watch server.js, puerto 3000
```

Para probar el frontend localmente, sírvelo con cualquier servidor estático apuntando a `index.html` (el `fetch('/api/...')` necesita un proxy o correr contra el backend local en el mismo origen).

## Deploy

- **Frontend**: Vercel, deploy automático al hacer push a `main`. `vercel.json` define el rewrite `/api/* → Railway`.
- **Backend**: Railway, deploy automático al hacer push a `main` (vía conexión GitHub del servicio). Build con Nixpacks (`nixpacks.toml`), `railway.json` define `startCommand`, healthcheck (`/api/health`) y política de reinicio.
- **Base de datos**: migraciones en `supabase/` se aplican manualmente vía SQL editor de Supabase (no hay migration runner automatizado). `schema.sql` es la base; los archivos `000N_*.sql` son incrementales, en orden.

## Convenciones del código backend

Los handlers en `api/**.js` mantienen la firma `(req, res) => {}` heredada de Vercel Serverless Functions. `server.js` los monta vía [`api/_lib/adapt.js`](api/_lib/adapt.js), que mergea `req.params` en `req.query` para emular el comportamiento de las rutas dinámicas `[id].js`. Al agregar un endpoint nuevo: crear el handler con esa firma y montarlo en `server.js` (rutas planas antes de rutas con `:param`).
