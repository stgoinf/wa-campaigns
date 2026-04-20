// ─────────────────────────────────────────────
// Supabase — cliente del browser (clave pública)
// ─────────────────────────────────────────────
const SUPABASE_URL      = 'https://lpliytimpwstaiydwfwk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__8vr69KZjUcdO13BlwgqVQ_1rm5b6OU';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────
// Autenticación
// ─────────────────────────────────────────────
async function checkAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        showApp(session.user);
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    showLoginForm(); // asegura que siempre se muestre el form de login al salir
}

function showRegister() {
    document.getElementById('form-login').style.display      = 'none';
    document.getElementById('form-register').style.display   = 'block';
    document.getElementById('toggle-to-register').style.display = 'none';
    document.getElementById('toggle-to-login').style.display    = 'inline';
    document.getElementById('auth-subtitle').textContent = 'Crea tu cuenta gratis';
}

function showLoginForm() {
    document.getElementById('form-register').style.display   = 'none';
    document.getElementById('form-login').style.display      = 'block';
    document.getElementById('toggle-to-login').style.display    = 'none';
    document.getElementById('toggle-to-register').style.display = 'inline';
    document.getElementById('auth-subtitle').textContent = 'Inicia sesión para continuar';
}

function showApp(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('user-email').textContent = user.email;
}

function setupAuth() {
    // Login form
    document.getElementById('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email    = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const btn      = document.getElementById('btn-login');
        const errEl    = document.getElementById('login-error');

        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Entrando...';
        errEl.style.display = 'none';

        const { data, error } = await sb.auth.signInWithPassword({ email, password });

        if (error) {
            errEl.textContent   = 'Correo o contraseña incorrectos.';
            errEl.style.display = 'block';
            btn.disabled        = false;
            btn.innerHTML       = '<i class="ph ph-sign-in"></i> Entrar';
            return;
        }

        showApp(data.user);
        init();
    });

    // Toggle entre login y registro
    document.getElementById('link-to-register').addEventListener('click', e => { e.preventDefault(); showRegister(); });
    document.getElementById('link-to-login').addEventListener('click',    e => { e.preventDefault(); showLoginForm(); });

    // Formulario de registro
    document.getElementById('form-register').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email  = document.getElementById('reg-email').value.trim();
        const pwd    = document.getElementById('reg-password').value;
        const pwd2   = document.getElementById('reg-password2').value;
        const errEl  = document.getElementById('reg-error');
        const okEl   = document.getElementById('reg-success');
        const btn    = document.getElementById('btn-register');

        errEl.style.display = 'none';
        okEl.style.display  = 'none';

        if (pwd !== pwd2) {
            errEl.textContent   = 'Las contraseñas no coinciden.';
            errEl.style.display = 'block';
            return;
        }

        btn.disabled  = true;
        btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Creando cuenta...';

        const { error } = await sb.auth.signUp({ email, password: pwd });

        btn.disabled  = false;
        btn.innerHTML = '<i class="ph ph-user-plus"></i> Crear cuenta';

        if (error) {
            errEl.textContent   = error.message || 'Error al crear la cuenta.';
            errEl.style.display = 'block';
        } else {
            okEl.style.display = 'block';
            document.getElementById('form-register').reset();
        }
    });

    // Toggle contraseña visible
    document.getElementById('toggle-password').addEventListener('click', () => {
        const input = document.getElementById('login-password');
        const icon  = document.getElementById('toggle-icon');
        if (input.type === 'password') {
            input.type      = 'text';
            icon.className  = 'ph ph-eye-slash';
        } else {
            input.type      = 'password';
            icon.className  = 'ph ph-eye';
        }
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
        await sb.auth.signOut();
        if (realtimeChannel) realtimeChannel.unsubscribe();
        campaignRunning = false;
        globalData      = [];
        showLogin();
    });

    // Escuchar cambios de sesión (expiración automática, etc.)
    sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') showLogin();
    });
}

// ─────────────────────────────────────────────
// Helper: fetch autenticado (incluye JWT en header)
// ─────────────────────────────────────────────
async function authFetch(url, options = {}) {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    return fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    });
}

// ─────────────────────────────────────────────
// Estado global
// ─────────────────────────────────────────────
let globalData        = [];
let chartInstance     = null;
let fpInstance        = null;
let activeCampaignId  = null;
let campaignRunning   = false;   // controla el loop de envío en el browser
let realtimeChannel   = null;

const monthMap = {
    'ene':0,'feb':1,'mar':2,'abr':3,'may':4,'jun':5,
    'jul':6,'ago':7,'sep':8,'sept':8,'oct':9,'nov':10,'dic':11
};
const colors = [
    'rgba(59,130,246,0.8)','rgba(239,68,68,0.8)','rgba(16,185,129,0.8)',
    'rgba(245,158,11,0.8)','rgba(139,92,246,0.8)','rgba(236,72,153,0.8)',
    'rgba(20,184,166,0.8)','rgba(249,115,22,0.8)','rgba(168,85,247,0.8)',
    'rgba(6,182,212,0.8)'
];

// ─── Colores de etiquetas (determinista por nombre) ───────────────────────
const TAG_PALETTE = [
    { bg:'rgba(59,130,246,0.18)',  border:'rgba(59,130,246,0.45)',  text:'#93c5fd' },
    { bg:'rgba(16,185,129,0.18)',  border:'rgba(16,185,129,0.45)',  text:'#6ee7b7' },
    { bg:'rgba(245,158,11,0.18)',  border:'rgba(245,158,11,0.45)',  text:'#fcd34d' },
    { bg:'rgba(239,68,68,0.18)',   border:'rgba(239,68,68,0.45)',   text:'#fca5a5' },
    { bg:'rgba(139,92,246,0.18)',  border:'rgba(139,92,246,0.45)',  text:'#c4b5fd' },
    { bg:'rgba(236,72,153,0.18)',  border:'rgba(236,72,153,0.45)',  text:'#f9a8d4' },
    { bg:'rgba(20,184,166,0.18)',  border:'rgba(20,184,166,0.45)',  text:'#5eead4' },
    { bg:'rgba(249,115,22,0.18)',  border:'rgba(249,115,22,0.45)',  text:'#fdba74' },
];
function tagColor(tag) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xfffffff;
    return TAG_PALETTE[h % TAG_PALETTE.length];
}
function tagBadge(tag, contactId) {
    const c = tagColor(tag);
    const style = `background:${c.bg};border:1px solid ${c.border};color:${c.text}`;
    return `<span class="tag tag-colored" style="${style}">${escHtml(tag)}<button class="tag-remove-btn" onclick="removeContactTag(${contactId},'${escHtml(tag).replace(/'/g,"\\'")}');event.stopPropagation()" title="Quitar etiqueta">×</button></span>`;
}

// ─────────────────────────────────────────────
// Elementos UI
// ─────────────────────────────────────────────
const loader          = document.getElementById('loader');
const loaderText      = document.getElementById('loader-text');
const dateRangePicker = document.getElementById('date-range-picker');
const branchSelect    = document.getElementById('branch-select');
const kpiUsers        = document.getElementById('kpi-users');
const kpiOrders       = document.getElementById('kpi-orders');
const kpiTopBranch    = document.getElementById('kpi-top-branch');
const resetZoomBtn    = document.getElementById('reset-zoom');
const csvUpload       = document.getElementById('csv-upload');
const downloadBtn     = document.getElementById('download-csv');
const contactsBadge   = document.getElementById('contacts-badge');
const contactsCount   = document.getElementById('contacts-count');

// ─────────────────────────────────────────────
// Inicialización
// ─────────────────────────────────────────────
function init() {
    showLoader(false);
    setupNavigation();
    setupAnalytics();
    setupConfig();
    setupCampaigns();
    setupContacts();
    setupErrorsModal();
    refreshContactsCount();
}

// ─────────────────────────────────────────────
// Navegación
// ─────────────────────────────────────────────
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(`tab-${tab}`).classList.add('active');
            document.getElementById('filters-panel').style.display = tab === 'analytics' ? 'block' : 'none';
            if (tab === 'campaigns') loadCampaigns();
            if (tab === 'contacts')  { loadContacts(); loadTagsFilter(); }
            if (tab === 'config')    loadConfig();
        });
    });
}

// ═══════════════════════════════════════════════
// ══ ANÁLISIS ══════════════════════════════════
// ═══════════════════════════════════════════════

function setupAnalytics() {
    csvUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        showLoader(true, 'Procesando CSV...');
        const reader = new FileReader();
        reader.onload = evt => parseCSV(evt.target.result, file);
        reader.readAsText(file);
    });
    branchSelect.addEventListener('change', updateDashboard);
    resetZoomBtn.addEventListener('click', updateDashboard);
    downloadBtn.addEventListener('click', downloadCSV);
}

function parseDateStr(str) {
    if (!str) return null;
    const p = str.toLowerCase().trim().split(' ');
    if (p.length === 3) return new Date(parseInt(p[2]), monthMap[p[1]] ?? 0, parseInt(p[0]));
    return new Date(str);
}

function parseCSV(csvText, file) {
    Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            const data = results.data.filter(r => r.Fecha && r.Telefono && r['Nombre Sucursal']);
            globalData = data.map(row => ({
                fechaStr: row.Fecha,
                fechaObj: parseDateStr(row.Fecha),
                telefono: String(row.Telefono).trim(),
                sucursal: row['Nombre Sucursal'],
                pedidos:  parseInt(row['Cantidad de pedidos']) || 1
            })).sort((a, b) => a.fechaObj - b.fechaObj);

            buildFilters();
            updateDashboard();
            downloadBtn.disabled = false;

            // Sincronizar contactos al backend
            await syncContactsToBackend(results.data);
            showLoader(false);
        }
    });
}

async function syncContactsToBackend(rows) {
    // Detectar columna de teléfono de forma flexible
    const fields = Object.keys(rows[0] || {});
    const phoneCol = ['Telefono','telefono','Teléfono','Phone','phone','Celular','Tel','tel']
        .find(c => fields.includes(c)) ?? fields[0];
    const nameCol  = ['Nombre','nombre','Name','name'].find(c => fields.includes(c));
    const labelCol = ['Etiqueta','etiqueta','Label','Segmento'].find(c => fields.includes(c));

    const contacts = rows
        .map(r => ({
            telefono:  String(r[phoneCol] ?? '').replace(/\D/g,''),
            nombre:    nameCol  ? r[nameCol]  || null : null,
            etiqueta:  labelCol ? r[labelCol] || null : null
        }))
        .filter(c => c.telefono.length >= 8);

    try {
        const res  = await authFetch('/api/contacts/upload', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ contacts })
        });
        const data = await res.json();
        if (data.total) {
            contactsCount.textContent  = data.total.toLocaleString();
            contactsBadge.style.display = 'flex';
        }
    } catch { /* backend no disponible, continúa modo local */ }
}

async function refreshContactsCount() {
    try {
        const res  = await authFetch('/api/contacts?count=true');
        const data = await res.json();
        if (data.count > 0) {
            contactsCount.textContent  = data.count.toLocaleString();
            contactsBadge.style.display = 'flex';
        }
    } catch { /* backend no disponible */ }
}

function getFilteredData() {
    let s = 0, e = Infinity;
    if (fpInstance?.selectedDates.length > 0) {
        const sd = fpInstance.selectedDates[0];
        const ed = fpInstance.selectedDates.length === 2 ? fpInstance.selectedDates[1] : sd;
        s = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate()).getTime();
        e = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 59, 59, 999).getTime();
    }
    const branch = branchSelect.value;
    return globalData.filter(d => {
        const t = d.fechaObj.getTime();
        return t >= s && t <= e && (branch === 'all' || d.sucursal === branch);
    });
}

function buildFilters() {
    const ts = [...new Set(globalData.map(d => d.fechaObj.getTime()))].sort();
    const dates = ts.map(t => new Date(t));
    if (!dates.length) return;
    const min = dates[0], max = dates[dates.length - 1];
    if (!fpInstance) {
        fpInstance = flatpickr(dateRangePicker, {
            mode: 'range', locale: 'es', dateFormat: 'd/m/Y',
            defaultDate: [min, max], minDate: min, maxDate: max,
            onChange: d => { if (d.length > 0) updateDashboard(); }
        });
    } else {
        fpInstance.set('minDate', min);
        fpInstance.set('maxDate', max);
        fpInstance.setDate([min, max], false);
    }
    const branches = [...new Set(globalData.map(d => d.sucursal))].sort();
    branchSelect.innerHTML = '<option value="all">Todas las sucursales</option>';
    branches.forEach(b => branchSelect.insertAdjacentHTML('beforeend', `<option value="${b}">${b}</option>`));
}

function updateDashboard() {
    const f = getFilteredData();
    const phones = new Set(f.map(d => d.telefono));
    kpiUsers.innerText  = phones.size.toLocaleString();
    kpiOrders.innerText = f.reduce((a, d) => a + d.pedidos, 0).toLocaleString();

    const stats = {};
    f.forEach(d => {
        if (!stats[d.sucursal]) stats[d.sucursal] = { users: new Set(), orders: 0 };
        stats[d.sucursal].users.add(d.telefono);
        stats[d.sucursal].orders += d.pedidos;
    });

    let topBranch = '-', maxU = 0;
    for (const [b, s] of Object.entries(stats)) {
        if (s.users.size > maxU) { maxU = s.users.size; topBranch = b; }
    }
    kpiTopBranch.innerText = topBranch;
    renderChart(stats, phones.size);
}

function renderChart(branchStats, total) {
    const ctx = document.getElementById('branchChart').getContext('2d');
    const sorted = Object.entries(branchStats)
        .map(([b, s]) => ({
            branch: b.replace("Domino's ", ''),
            usuarios: s.users.size,
            pct: total > 0 ? ((s.users.size / total) * 100).toFixed(1) : 0
        }))
        .sort((a, b) => b.usuarios - a.usuarios).slice(0, 15);

    if (chartInstance) chartInstance.destroy();
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels:   sorted.map(b => `${b.branch} (${b.pct}%)`),
            datasets: [{ label: 'Usuarios Únicos', data: sorted.map(b => b.usuarios),
                backgroundColor: colors, borderWidth: 0, borderRadius: 4 }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.9)', titleColor: '#f8fafc', bodyColor: '#f8fafc',
                    callbacks: { label: ctx => `${ctx.raw} usuarios (${sorted[ctx.dataIndex].pct}%)` }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { grid: { display: false } }
            }
        }
    });
}

function downloadCSV() {
    const f = getFilteredData();
    if (!f.length) return;
    const map = new Map();
    f.forEach(d => {
        if (!map.has(d.telefono)) map.set(d.telefono, { sucursal: d.sucursal, pedidos: 0 });
        map.get(d.telefono).pedidos += d.pedidos;
    });
    const rows = [['Telefono','Sucursal','Total Pedidos']];
    map.forEach((s, tel) => rows.push([tel, `"${s.sucursal}"`, s.pedidos]));
    const csv  = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n');
    const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a    = Object.assign(document.createElement('a'), { href: url, download: `clientes_${new Date().toISOString().slice(0,10)}.csv` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════
// ══ CAMPAÑAS ══════════════════════════════════
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// ══ CONFIGURACIÓN ════════════════════════════
// ═══════════════════════════════════════════════

let cachedTemplates = [];   // plantillas cargadas desde Meta

function setupConfig() {
    document.getElementById('form-config').addEventListener('submit', saveConfig);
    document.getElementById('btn-test-connection').addEventListener('click', testConnection);

    // Toggle visibilidad de token
    document.querySelectorAll('.password-toggle[data-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            const icon  = btn.querySelector('i');
            if (input.type === 'password') {
                input.type    = 'text';
                icon.className = 'ph ph-eye-slash';
            } else {
                input.type    = 'password';
                icon.className = 'ph ph-eye';
            }
        });
    });
}

async function loadConfig() {
    try {
        const res  = await authFetch('/api/settings');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showConfigMsg('error', err.error || 'Error al cargar configuración del servidor.');
            return;
        }
        const data = await res.json();

        document.getElementById('cfg-token').placeholder      = data.wa_access_token      ? data.wa_access_token : 'EAABzA...';
        document.getElementById('cfg-phone-id').value          = data.wa_phone_number_id     || '';
        document.getElementById('cfg-business-id').value       = data.wa_business_account_id || '';

        if (data.wa_access_token_updated_at) {
            document.getElementById('cfg-token-updated').textContent =
                'Actualizado: ' + new Date(data.wa_access_token_updated_at).toLocaleString('es');
        }
    } catch { /* backend no disponible */ }
}

async function saveConfig(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-config');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Guardando...';

    try {
        const res = await authFetch('/api/settings', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wa_access_token:        document.getElementById('cfg-token').value.trim()      || undefined,
                wa_phone_number_id:     document.getElementById('cfg-phone-id').value.trim()   || undefined,
                wa_business_account_id: document.getElementById('cfg-business-id').value.trim()|| undefined
            })
        });

        const data = await res.json();
        showConfigMsg(res.ok ? 'success' : 'error', res.ok ? 'Configuración guardada.' : data.error);

        if (res.ok) {
            document.getElementById('cfg-token').value = '';
            await loadConfig();
        }
    } catch (err) {
        showConfigMsg('error', 'Error de conexión: ' + err.message);
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Guardar';
    }
}

async function testConnection() {
    const btn = document.getElementById('btn-test-connection');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Probando...';
    showConfigMsg('', '');

    try {
        const res  = await authFetch('/api/templates');
        const data = await res.json();

        if (!res.ok) {
            showConfigMsg('error', data.error || 'Error al conectar con Meta.');
            document.getElementById('templates-panel').style.display = 'none';
        } else {
            cachedTemplates = data.templates;
            showConfigMsg('success', `Conexión exitosa. ${data.total} plantilla${data.total !== 1 ? 's' : ''} aprobada${data.total !== 1 ? 's' : ''} encontrada${data.total !== 1 ? 's' : ''}.`);
            renderTemplatesList(data.templates);
        }
    } catch (err) {
        showConfigMsg('error', 'Error: ' + err.message);
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="ph ph-plugs"></i> Probar conexión';
    }
}

function renderTemplatesList(templates) {
    const panel    = document.getElementById('templates-panel');
    const list     = document.getElementById('templates-list');
    const subtitle = document.getElementById('templates-subtitle');

    panel.style.display = 'block';

    if (!templates.length) {
        subtitle.textContent = 'No hay plantillas aprobadas en esta cuenta.';
        list.innerHTML       = '';
        return;
    }

    subtitle.textContent = `${templates.length} plantillas disponibles para usar en campañas`;

    list.innerHTML = templates.map(t => {
        const bodyComponent = t.components?.find(c => c.type === 'BODY');
        const preview       = bodyComponent?.text || '(sin texto de cuerpo)';
        return `
        <div class="template-card">
            <div class="template-header">
                <span class="template-name">${escHtml(t.name)}</span>
                <div class="template-meta">
                    <span class="tag tag-lang">${escHtml(t.language)}</span>
                    <span class="tag tag-cat">${escHtml(t.category)}</span>
                </div>
            </div>
            <p class="template-preview">${escHtml(preview)}</p>
        </div>`;
    }).join('');
}

function showConfigMsg(type, text) {
    const el = document.getElementById('config-msg');
    if (!text) { el.style.display = 'none'; return; }
    el.className      = `config-msg config-msg-${type}`;
    el.textContent    = text;
    el.style.display  = 'block';
}

function setupCampaigns() {
    document.getElementById('btn-new-campaign').addEventListener('click', openCampaignModal);
    document.getElementById('btn-load-templates').addEventListener('click', loadTemplatesIntoModal);
    document.getElementById('modal-close').addEventListener('click', closeCampaignModal);
    document.getElementById('modal-cancel').addEventListener('click', closeCampaignModal);
    document.getElementById('modal-overlay').addEventListener('click', closeCampaignModal);
    document.getElementById('btn-refresh-campaigns').addEventListener('click', loadCampaigns);
    document.getElementById('btn-pause-campaign').addEventListener('click', pauseActiveCampaign);
    document.getElementById('form-campaign').addEventListener('submit', submitCampaign);
    document.getElementById('f-source').addEventListener('change', e => {
        const show = e.target.value === 'etiqueta';
        document.getElementById('f-etiqueta-group').style.display = show ? 'block' : 'none';
        if (show) loadEtiquetasIntoSelect();
        updateContactPreview();
    });
    document.getElementById('f-etiqueta').addEventListener('change', updateContactPreview);
}

async function loadEtiquetasIntoSelect() {
    try {
        const res  = await authFetch('/api/contacts?etiquetas=true');
        const data = await res.json();
        const sel  = document.getElementById('f-etiqueta');
        const etiquetas = data.etiquetas || [];
        if (!etiquetas.length) {
            sel.innerHTML = '<option value="">— Sin etiquetas aún —</option>';
            return;
        }
        sel.innerHTML = '<option value="">Selecciona una etiqueta</option>' +
            etiquetas.map(e => `<option value="${escHtml(e.tag)}">${escHtml(e.tag)} (${e.cnt})</option>`).join('');
        updateContactPreview();
    } catch {
        document.getElementById('f-etiqueta').innerHTML = '<option value="">Error al cargar etiquetas</option>';
    }
}

async function loadCampaigns() {
    try {
        const res  = await authFetch('/api/campaigns');
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        renderCampaignsTable(data.campaigns || data); // compatible con formato nuevo { campaigns: [] } y antiguo []
    } catch {
        document.getElementById('campaigns-tbody').innerHTML = `
            <tr><td colspan="9" class="empty-state">
                <i class="ph ph-warning"></i>
                <p>Backend no disponible. Ejecuta en Vercel o localmente con <code>vercel dev</code>.</p>
            </td></tr>`;
    }
}

function renderCampaignsTable(campaigns) {
    const tbody = document.getElementById('campaigns-tbody');
    if (!campaigns.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">
            <i class="ph ph-paper-plane-tilt"></i><p>No hay campañas aún.</p></td></tr>`;
        return;
    }
    tbody.innerHTML = campaigns.map(c => {
        const safeName = c.nombre.replace(/'/g, "\\'");
        const failedCell = c.fallidos > 0
            ? `<button class="btn-failed-link" onclick="showCampaignErrors(${c.id},'${safeName}')">${c.fallidos.toLocaleString()} <i class="ph ph-info"></i></button>`
            : '0';
        return `
        <tr>
            <td><strong>${escHtml(c.nombre)}</strong></td>
            <td><code>${escHtml(c.template_name)}</code></td>
            <td>${c.total.toLocaleString()}</td>
            <td class="col-sent">${c.enviados.toLocaleString()}</td>
            <td class="col-delivered">${c.entregados.toLocaleString()}</td>
            <td class="col-read">${c.leidos.toLocaleString()}</td>
            <td class="col-failed">${failedCell}</td>
            <td><span class="status-badge ${c.status}">${statusLabel(c.status)}</span></td>
            <td class="actions-cell">
                ${['draft','paused'].includes(c.status) ? `
                    <button class="btn-icon-green" onclick="startCampaign(${c.id})" title="Iniciar">
                        <i class="ph ph-play"></i>
                    </button>` : ''}
                ${c.status === 'running' ? `
                    <button class="btn-icon-warn" onclick="pauseCampaign(${c.id})" title="Pausar">
                        <i class="ph ph-pause"></i>
                    </button>` : ''}
                ${c.status !== 'running' ? `
                    <button class="btn-icon-red" onclick="deleteCampaign(${c.id})" title="Eliminar">
                        <i class="ph ph-trash"></i>
                    </button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

// ── Campaign runner (loop en el browser) ──────

async function startCampaign(id) {
    try {
        const res = await authFetch(`/api/campaigns/start?id=${id}`, { method: 'POST' });
        if (!res.ok) return alert((await res.json()).error);

        activeCampaignId = id;
        campaignRunning  = true;

        const camp = await (await authFetch(`/api/campaigns/${id}`)).json();
        showMonitor(camp);
        subscribeToRealtime(id);
        loadCampaigns();

        runCampaignLoop(id);
    } catch (err) {
        alert('Error al iniciar: ' + err.message);
    }
}

async function runCampaignLoop(campaignId) {
    const RATE_MS = 300;
    const delay   = ms => new Promise(r => setTimeout(r, ms));

    while (campaignRunning) {
        // Revisar si fue pausada externamente
        const campRes = await authFetch(`/api/campaigns/${campaignId}`);
        const camp    = await campRes.json();
        if (camp.status !== 'running') { campaignRunning = false; break; }

        // Obtener el siguiente mensaje pendiente
        const { data: pending } = await sb
            .from('campaign_messages')
            .select('id, telefono')
            .eq('campaign_id', campaignId)
            .eq('status', 'pending')
            .limit(1)
            .single();

        if (!pending) {
            // Todos enviados → completar
            await authFetch(`/api/campaigns/complete?id=${campaignId}`, { method: 'POST' });
            campaignRunning = false;
            break;
        }

        // Enviar via API
        await authFetch('/api/send', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                campaignId,
                messageId: pending.id,
                telefono:  pending.telefono
            })
        });

        await delay(RATE_MS);
    }
}

async function pauseCampaign(id) {
    campaignRunning = false;
    await authFetch(`/api/campaigns/pause?id=${id}`, { method: 'POST' });
    loadCampaigns();
}

async function pauseActiveCampaign() {
    if (activeCampaignId) await pauseCampaign(activeCampaignId);
}

async function deleteCampaign(id) {
    if (!confirm('¿Eliminar esta campaña?')) return;
    await authFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    loadCampaigns();
}

// ── Supabase Realtime ──────────────────────────

function subscribeToRealtime(campaignId) {
    if (realtimeChannel) realtimeChannel.unsubscribe();

    realtimeChannel = sb
        .channel(`campaign-${campaignId}`)
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'campaign_messages',
            filter: `campaign_id=eq.${campaignId}`
        }, payload => {
            const msg = payload.new;
            const labels = { sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: `Fallido${msg.error ? ': ' + msg.error : ''}` };
            if (labels[msg.status]) addFeedEntry(msg.telefono, msg.status, labels[msg.status]);
        })
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'campaigns',
            filter: `id=eq.${campaignId}`
        }, payload => {
            const camp = payload.new;
            updateMonitor(camp);
            if (camp.status === 'completed') {
                campaignRunning = false;
                document.querySelector('.monitor-header .status-badge').textContent = 'Completada';
                document.querySelector('.monitor-header .status-badge').className   = 'status-badge completed';
                document.getElementById('btn-pause-campaign').style.display = 'none';
                loadCampaigns();
            }
            if (camp.status === 'paused') {
                campaignRunning = false;
                document.querySelector('.monitor-header .status-badge').textContent = 'Pausada';
                document.querySelector('.monitor-header .status-badge').className   = 'status-badge paused';
                loadCampaigns();
            }
        })
        .subscribe();
}

// ── Monitor UI ─────────────────────────────────

function showMonitor(campaign) {
    const panel = document.getElementById('monitor-panel');
    panel.style.display = 'block';
    document.getElementById('monitor-campaign-name').textContent       = campaign.nombre;
    document.querySelector('.monitor-header .status-badge').textContent = statusLabel(campaign.status);
    document.querySelector('.monitor-header .status-badge').className   = `status-badge ${campaign.status}`;
    document.getElementById('btn-pause-campaign').style.display = campaign.status === 'running' ? 'flex' : 'none';
    document.getElementById('live-feed-log').innerHTML = '';
    updateMonitor(campaign);
}

function updateMonitor(c) {
    const pct = c.total > 0 ? Math.round((c.enviados / c.total) * 100) : 0;
    document.getElementById('monitor-progress-bar').style.width   = `${pct}%`;
    document.getElementById('monitor-progress-label').textContent = `${c.enviados.toLocaleString()} / ${c.total.toLocaleString()} enviados`;
    document.getElementById('mk-sent').textContent      = c.enviados.toLocaleString();
    document.getElementById('mk-delivered').textContent = c.entregados.toLocaleString();
    document.getElementById('mk-read').textContent      = c.leidos.toLocaleString();
    document.getElementById('mk-failed').textContent    = c.fallidos.toLocaleString();
}

function addFeedEntry(telefono, status, label) {
    const log  = document.getElementById('live-feed-log');
    const time = new Date().toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const el   = document.createElement('div');
    el.className = `feed-entry ${status}`;
    el.innerHTML = `<span class="feed-time">${time}</span><span class="feed-phone">${escHtml(telefono)}</span><span class="feed-status">${escHtml(label)}</span>`;
    log.insertBefore(el, log.firstChild);
    if (log.children.length > 100) log.removeChild(log.lastChild);
}

// ── Modal nueva campaña ────────────────────────

async function openCampaignModal() {
    document.getElementById('modal-campaign').style.display = 'flex';
    await updateContactPreview();
    // Cargar plantillas automáticamente (o usar caché si ya están)
    if (cachedTemplates.length) {
        renderTemplateList(cachedTemplates);
    } else {
        loadTemplatesIntoModal();
    }
    loadRecentTemplates();
}

async function loadTemplatesIntoModal() {
    const btn = document.getElementById('btn-load-templates');
    btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i>';
    btn.disabled  = true;
    try {
        const res  = await authFetch('/api/templates');
        const data = await res.json();
        if (!res.ok) {
            document.getElementById('template-cards').innerHTML =
                `<p class="tc-empty tc-error"><i class="ph ph-warning"></i> ${escHtml(data.error || 'Error al cargar plantillas.')}</p>`;
        } else {
            cachedTemplates = data.templates;
            renderTemplateList(data.templates);
        }
    } catch {
        document.getElementById('template-cards').innerHTML =
            `<p class="tc-empty tc-error"><i class="ph ph-warning"></i> Error de conexión. Verifica la configuración.</p>`;
    } finally {
        btn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Actualizar plantillas';
        btn.disabled  = false;
    }
}

// ─── Lista de plantillas ─────────────────────

// Caché de campañas recientes para pre-llenado sin segundo fetch
let cachedRecentCampaigns = [];

function renderTemplateList(templates) {
    const ul = document.getElementById('template-list');
    if (!templates.length) {
        ul.innerHTML = '<li class="tl-empty">No hay plantillas aprobadas en esta cuenta.</li>';
        return;
    }
    ul.innerHTML = templates.map(t => {
        const bodyComp   = t.components?.find(c => c.type === 'BODY');
        const headerComp = t.components?.find(c => c.type === 'HEADER');
        const preview    = bodyComp?.text?.slice(0, 80) || '(sin texto de cuerpo)';
        const more       = (bodyComp?.text?.length ?? 0) > 80 ? '…' : '';
        const fmt        = headerComp?.format;
        const mediaIcon  = fmt === 'IMAGE'    ? '<i class="ph ph-image tl-media"></i>'
                         : fmt === 'VIDEO'    ? '<i class="ph ph-video tl-media"></i>'
                         : fmt === 'DOCUMENT' ? '<i class="ph ph-file tl-media"></i>'
                         : '';
        const safeName   = t.name.replace(/'/g, "\\'");
        return `
        <li class="tl-item" data-name="${escHtml(t.name)}" onclick="selectTemplate('${safeName}')">
            <div class="tl-name">${mediaIcon}<strong>${escHtml(t.name)}</strong>
                <span class="tag tag-lang">${escHtml(t.language)}</span></div>
            <div class="tl-preview">${escHtml(preview)}${more}</div>
        </li>`;
    }).join('');
}

async function loadRecentTemplates() {
    const section = document.getElementById('recent-templates-section');
    try {
        const res  = await authFetch('/api/campaigns');
        const data = await res.json();
        cachedRecentCampaigns = data.campaigns || [];
        // Deduplicar por template_name, tomar el más reciente de cada una
        const seen = new Map();
        cachedRecentCampaigns.forEach(c => {
            if (!seen.has(c.template_name)) seen.set(c.template_name, c);
        });
        const recents = [...seen.values()].slice(0, 5);
        if (!recents.length) { section.style.display = 'none'; return; }
        section.style.display = 'block';
        const ul = document.getElementById('recent-template-list');
        ul.innerHTML = recents.map(c => {
            const safeName = c.template_name.replace(/'/g, "\\'");
            return `
            <li class="tl-item tl-recent" data-name="${escHtml(c.template_name)}"
                onclick="selectTemplateFromCampaign('${safeName}', ${c.id})">
                <div class="tl-name"><i class="ph ph-arrow-counter-clockwise tl-reuse"></i>
                    <strong>${escHtml(c.template_name)}</strong>
                    <span class="tag tag-lang">${escHtml(c.template_language)}</span>
                </div>
                <div class="tl-preview tl-reuse-hint">Reutilizar con parámetros anteriores</div>
            </li>`;
        }).join('');
    } catch { section.style.display = 'none'; }
}

function selectTemplateFromCampaign(templateName, campaignId) {
    const camp = cachedRecentCampaigns.find(c => c.id === campaignId);
    selectTemplate(templateName, camp?.template_params || null);
}

function selectTemplate(name, prefill = null) {
    const template = cachedTemplates.find(t => t.name === name);
    if (!template) return;

    // Resaltar el ítem seleccionado
    document.querySelectorAll('.tl-item').forEach(i => i.classList.remove('tl-selected'));
    const item = document.querySelector(`.tl-item[data-name="${CSS.escape(name)}"]`);
    if (item) { item.classList.add('tl-selected'); item.scrollIntoView({ block: 'nearest' }); }

    // Actualizar inputs ocultos
    document.getElementById('f-template').value = template.name;
    document.getElementById('f-language').value  = template.language;

    // Hint con idioma
    document.getElementById('f-template-hint').textContent =
        `Plantilla seleccionada: ${template.name}  ·  Idioma: ${template.language}`;

    // Generar campos dinámicos (con valores pre-llenados si se pasa prefill)
    generateDynamicFields(template, prefill);
}

function generateDynamicFields(template, prefill = null) {
    const container  = document.getElementById('f-dynamic-fields');
    container.innerHTML = '';

    const components = template.components || [];
    const headerComp = components.find(c => c.type === 'HEADER');
    const bodyComp   = components.find(c => c.type === 'BODY');

    // Extraer valores pre-llenados del array template_params
    const prefillHeader = prefill?.find(p => p.type === 'header');
    const prefillBody   = prefill?.find(p => p.type === 'body');

    let hasFields = false;

    // ── Campo de URL para header multimedia ──
    if (headerComp && ['IMAGE','VIDEO','DOCUMENT'].includes(headerComp.format)) {
        hasFields = true;
        const fmt        = headerComp.format;
        const mediaKey   = fmt.toLowerCase(); // 'image', 'video', 'document'
        const iconCls    = fmt === 'IMAGE' ? 'ph-image' : fmt === 'VIDEO' ? 'ph-video' : 'ph-file';
        const label      = fmt === 'IMAGE' ? 'imagen' : fmt === 'VIDEO' ? 'video' : 'documento';
        const example    = fmt === 'IMAGE' ? 'jpg' : fmt === 'VIDEO' ? 'mp4' : 'pdf';
        const prefillUrl = prefillHeader?.parameters?.[0]?.[mediaKey]?.link || '';

        container.insertAdjacentHTML('beforeend', `
            <div class="form-group">
                <label><i class="ph ${iconCls}"></i> URL del ${label} (encabezado)</label>
                <input type="text" id="df-header-url" class="glass-select"
                    placeholder="https://ejemplo.com/archivo.${example}"
                    data-param-type="header" data-media-type="${mediaKey}"
                    value="${escHtml(prefillUrl)}">
                ${fmt === 'IMAGE' ? `
                <div id="df-img-preview" class="img-preview" style="${prefillUrl ? 'display:block' : 'display:none'}">
                    <img id="df-img-tag" src="${escHtml(prefillUrl)}" alt="Vista previa">
                </div>` : ''}
            </div>
        `);

        if (fmt === 'IMAGE') {
            const urlInput = document.getElementById('df-header-url');
            const preview  = document.getElementById('df-img-preview');
            const img      = document.getElementById('df-img-tag');

            function toEmbedUrl(raw) {
                // Google Drive: https://drive.google.com/file/d/FILE_ID/view  o  uc?id=FILE_ID
                const driveFile = raw.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
                if (driveFile) return `https://drive.google.com/thumbnail?id=${driveFile[1]}&sz=w600`;
                const driveUc = raw.match(/drive\.google\.com\/.*[?&]id=([^&]+)/);
                if (driveUc) return `https://drive.google.com/thumbnail?id=${driveUc[1]}&sz=w600`;
                return raw; // URL directa, la usamos tal cual
            }

            function applyPreview(raw) {
                if (!raw) { preview.style.display = 'none'; return; }
                img.src = toEmbedUrl(raw);
                img.alt = 'Vista previa';
                preview.style.display = 'block';
                img.onerror = () => { img.alt = '⚠️ No se puede mostrar la imagen. Verifica la URL.'; };
            }

            // Aplicar al cargar si ya hay URL (prefill de campaña anterior)
            if (urlInput.value.trim()) applyPreview(urlInput.value.trim());

            urlInput.addEventListener('input', e => applyPreview(e.target.value.trim()));
        }
    }

    // ── Campos para variables {{N}} del cuerpo ──
    if (bodyComp?.text) {
        const nums = [...new Set(
            [...bodyComp.text.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1]))
        )].sort((a, b) => a - b);

        nums.forEach((num, idx) => {
            hasFields = true;
            // Mostrar la frase que rodea la variable como contexto
            const ctx = bodyComp.text.replace(/\{\{(\d+)\}\}/g, (_, n) =>
                parseInt(n) === num ? `【→ {{${n}}}】` : `{{${n}}}`
            );
            const prefillVal = prefillBody?.parameters?.[idx]?.text || '';
            container.insertAdjacentHTML('beforeend', `
                <div class="form-group">
                    <label>Variable <code>{{${num}}}</code> del cuerpo</label>
                    <input type="text" id="df-body-${num}" class="glass-select"
                        placeholder="Valor para {{${num}}}"
                        data-param-type="body" data-var-num="${num}"
                        value="${escHtml(prefillVal)}">
                    <small class="field-updated ctx-hint">${escHtml(ctx.slice(0,100))}${ctx.length > 100 ? '…' : ''}</small>
                </div>
            `);
        });
    }

    if (hasFields) {
        const hint = prefill ? ' <span class="prefill-hint"><i class="ph ph-magic-wand"></i> Pre-llenado de campaña anterior</span>' : '';
        container.insertAdjacentHTML('afterbegin', `
            <div class="dynamic-fields-title">
                <i class="ph ph-sliders"></i> Parámetros de la plantilla${hint}
            </div>
        `);
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function buildTemplateParams() {
    const params = [];

    // Header
    const headerInput = document.querySelector('[data-param-type="header"]');
    if (headerInput?.value.trim()) {
        const mediaType = headerInput.dataset.mediaType; // 'image', 'video', 'document'
        params.push({
            type: 'header',
            parameters: [{ type: mediaType, [mediaType]: { link: headerInput.value.trim() } }]
        });
    }

    // Body
    const bodyInputs = [...document.querySelectorAll('[data-param-type="body"]')]
        .sort((a, b) => parseInt(a.dataset.varNum) - parseInt(b.dataset.varNum));
    if (bodyInputs.length) {
        params.push({
            type: 'body',
            parameters: bodyInputs.map(inp => ({ type: 'text', text: inp.value.trim() }))
        });
    }

    return params;
}
function closeCampaignModal() {
    document.getElementById('modal-campaign').style.display = 'none';
    document.getElementById('form-campaign').reset();
    document.getElementById('f-etiqueta-group').style.display = 'none';
    // Limpiar selección de plantilla y campos dinámicos
    document.querySelectorAll('.tl-item').forEach(i => i.classList.remove('tl-selected'));
    const dynFields = document.getElementById('f-dynamic-fields');
    dynFields.innerHTML = '';
    dynFields.style.display = 'none';
    document.getElementById('f-template-hint').textContent = 'Selecciona una plantilla de la lista';
}
async function updateContactPreview() {
    const source   = document.getElementById('f-source').value;
    const etiqueta = document.getElementById('f-etiqueta').value.trim();
    try {
        let url = '/api/contacts/count';
        if (source === 'etiqueta' && etiqueta) {
            const res  = await authFetch(`/api/contacts?count=true&etiqueta=${encodeURIComponent(etiqueta)}`);
            const data = await res.json();
            document.getElementById('preview-count').textContent = `${(data.count ?? 0).toLocaleString()} contactos serán incluidos`;
            return;
        }
        const res  = await authFetch(url);
        const data = await res.json();
        document.getElementById('preview-count').textContent = `${(data.count ?? 0).toLocaleString()} contactos serán incluidos`;
    } catch {
        document.getElementById('preview-count').textContent = 'No se pudo calcular';
    }
}

async function submitCampaign(e) {
    e.preventDefault();

    const templateName = document.getElementById('f-template').value.trim();
    if (!templateName) {
        alert('Selecciona una plantilla antes de continuar.');
        return;
    }

    showLoader(true, 'Creando campaña...');
    try {
        const res  = await authFetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre:           document.getElementById('f-nombre').value.trim(),
                templateName,
                templateLanguage: document.getElementById('f-language').value,
                templateParams:   buildTemplateParams(),
                source:           document.getElementById('f-source').value,
                etiqueta:         document.getElementById('f-etiqueta').value.trim() || undefined
            })
        });
        const data = await res.json();
        showLoader(false);
        if (!res.ok) return alert(data.error || 'Error');
        closeCampaignModal();
        loadCampaigns();
    } catch (err) {
        showLoader(false);
        alert('Error: ' + err.message);
    }
}

// ═══════════════════════════════════════════════
// ══ CLIENTES ══════════════════════════════════
// ═══════════════════════════════════════════════

let contactsCurrentPage     = 1;
let contactsCurrentSearch   = '';
let contactsCurrentEtiqueta = '';
let contactsCurrentPreset   = '';
let contactsCurrentFrom     = '';
let contactsCurrentTo       = '';
let contactsSelected        = new Set(); // ids seleccionados

function setupContacts() {
    document.getElementById('btn-import-contacts').addEventListener('click', openContactsImportModal);
    document.getElementById('btn-refresh-contacts').addEventListener('click', () => loadContacts());

    // Búsqueda con debounce
    let searchTimer;
    document.getElementById('contacts-search').addEventListener('input', e => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            contactsCurrentSearch = e.target.value.trim();
            contactsCurrentPage   = 1;
            loadContacts();
        }, 400);
    });

    // Filtro etiqueta — toggle dropdown
    document.getElementById('tags-filter-btn').addEventListener('click', e => {
        e.stopPropagation();
        const dd = document.getElementById('tags-filter-dropdown');
        dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
    // Cerrar dropdown al hacer click fuera
    document.addEventListener('click', e => {
        const wrap = document.getElementById('tags-filter-wrap');
        if (wrap && !wrap.contains(e.target))
            document.getElementById('tags-filter-dropdown').style.display = 'none';
    });

    // Filtro último envío (preset)
    document.getElementById('contacts-sent-preset').addEventListener('change', e => {
        contactsCurrentPreset = e.target.value;
        contactsCurrentPage   = 1;
        const rangePanel = document.getElementById('contacts-date-range');
        if (e.target.value === 'custom') {
            rangePanel.style.display = 'flex';
        } else {
            rangePanel.style.display = 'none';
            contactsCurrentFrom = '';
            contactsCurrentTo   = '';
            loadContacts();
        }
    });

    // Aplicar rango de fechas personalizado
    document.getElementById('btn-apply-date-range').addEventListener('click', () => {
        contactsCurrentFrom = document.getElementById('contacts-sent-from').value;
        contactsCurrentTo   = document.getElementById('contacts-sent-to').value;
        contactsCurrentPage = 1;
        loadContacts();
    });

    // Paginación
    document.getElementById('btn-contacts-prev').addEventListener('click', () => {
        if (contactsCurrentPage > 1) { contactsCurrentPage--; loadContacts(); }
    });
    document.getElementById('btn-contacts-next').addEventListener('click', () => {
        contactsCurrentPage++;
        loadContacts();
    });

    // Selección — "Seleccionar todos"
    document.getElementById('contacts-check-all').addEventListener('change', e => {
        document.querySelectorAll('.contact-row-check').forEach(cb => {
            cb.checked = e.target.checked;
            const id   = parseInt(cb.dataset.id);
            e.target.checked ? contactsSelected.add(id) : contactsSelected.delete(id);
        });
        updateBulkBar();
    });

    // Barra de acciones en bloque
    document.getElementById('btn-bulk-deselect').addEventListener('click', clearContactSelection);
    document.getElementById('btn-bulk-apply').addEventListener('click', applyBulkEtiqueta);

    // Botones nuevos
    document.getElementById('btn-add-contact').addEventListener('click', openAddContactModal);
    document.getElementById('btn-download-template').addEventListener('click', downloadContactsTemplate);

    // Modal agregar cliente
    document.getElementById('add-contact-close').addEventListener('click', closeAddContactModal);
    document.getElementById('ac-cancel').addEventListener('click', closeAddContactModal);
    document.getElementById('add-contact-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('add-contact-modal')) closeAddContactModal();
    });
    document.getElementById('form-add-contact').addEventListener('submit', submitAddContact);

    // Modo de etiqueta en bloque (Agregar / Reemplazar / Quitar)
    let bulkTagMode = 'add';
    document.querySelectorAll('.bulk-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bulk-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            bulkTagMode = btn.id === 'bulk-mode-add' ? 'add'
                        : btn.id === 'bulk-mode-replace' ? 'replace'
                        : 'remove';
        });
    });
    window._bulkTagMode = () => bulkTagMode;

    // Bulk tag combo: mostrar/ocultar sugerencias
    const bulkInput = document.getElementById('bulk-etiqueta-input');
    const bulkSugg  = document.getElementById('bulk-tag-suggestions');
    bulkInput.addEventListener('focus', () => {
        if (bulkSugg.children.length) bulkSugg.style.display = 'block';
    });
    bulkInput.addEventListener('input', () => {
        const val = bulkInput.value.toLowerCase();
        [...bulkSugg.children].forEach(ch => {
            ch.style.display = ch.dataset.tag.toLowerCase().includes(val) ? '' : 'none';
        });
        bulkSugg.style.display = [...bulkSugg.children].some(ch => ch.style.display !== 'none') ? 'block' : 'none';
    });
    document.addEventListener('click', e => {
        if (!bulkInput.contains(e.target) && !bulkSugg.contains(e.target))
            bulkSugg.style.display = 'none';
    });

    setupContactsImportModal();
}

async function loadContacts(page = contactsCurrentPage) {
    contactsCurrentPage = page;

    const tbody = document.getElementById('contacts-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><i class="ph ph-circle-notch ph-spin"></i><p>Cargando contactos...</p></td></tr>`;

    try {
        const params = new URLSearchParams({ page, limit: 50 });
        if (contactsCurrentSearch)   params.set('search',      contactsCurrentSearch);
        const selectedTags = getSelectedTags();
        if (selectedTags.length === 1) params.set('etiqueta', selectedTags[0]);
        // For multiple tags: filter client-side after load (API supports one tag at a time)
        if (contactsCurrentPreset)   params.set('sent_preset', contactsCurrentPreset);
        if (contactsCurrentPreset === 'custom') {
            if (contactsCurrentFrom) params.set('sent_from', contactsCurrentFrom);
            if (contactsCurrentTo)   params.set('sent_to',   contactsCurrentTo);
        }

        const res  = await authFetch(`/api/contacts?${params}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        // Limpiar selección al cambiar de página
        contactsSelected.clear();
        document.getElementById('contacts-check-all').checked = false;
        updateBulkBar();

        // Client-side filter for multiple tags (API handles single-tag via ?etiqueta=)
        const multiTags = getSelectedTags();
        const filtered  = multiTags.length > 1
            ? data.contacts.filter(c => multiTags.some(t => (c.tags || []).includes(t)))
            : data.contacts;

        renderContactsTable(filtered, data.total);
        renderContactsPagination(data.page, data.pages, data.total);
        loadContactsStats();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><i class="ph ph-warning"></i><p>Error al cargar contactos: ${escHtml(err.message)}</p></td></tr>`;
    }
}

function renderContactsTable(contacts, total) {
    const tbody = document.getElementById('contacts-tbody');

    if (!contacts.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">
            <i class="ph ph-address-book"></i>
            <p>${contactsCurrentSearch || getSelectedTags().length || contactsCurrentPreset ? 'No se encontraron contactos con ese filtro.' : 'No hay contactos. Importa un CSV para comenzar.'}</p>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = contacts.map(c => {
        const nombre     = c.nombre ? escHtml(c.nombre) : '<span class="dim">—</span>';
        const tagsArr    = c.tags && c.tags.length ? c.tags : (c.etiqueta ? [c.etiqueta] : []);
        const etiquetaHtml = tagsArr.length
            ? tagsArr.map(t => tagBadge(t, c.id)).join(' ')
            : '<span class="dim">—</span>';
        const created  = c.created_at ? new Date(c.created_at).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' }) : '—';
        const checked  = contactsSelected.has(c.id) ? 'checked' : '';

        let lastSent = '<span class="dim">Nunca enviado</span>';
        if (c.last_sent_at) {
            const date = new Date(c.last_sent_at).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
            const tmpl = c.last_template ? `<small class="last-template">${escHtml(c.last_template)}</small>` : '';
            lastSent = `<span class="last-sent-date">${date}</span>${tmpl}`;
        }

        return `<tr class="${contactsSelected.has(c.id) ? 'row-selected' : ''}">
            <td class="col-check">
                <input type="checkbox" class="contact-row-check" data-id="${c.id}" ${checked}
                    onchange="toggleContactSelect(${c.id}, this.checked)">
            </td>
            <td><code class="phone-code">${escHtml(c.telefono)}</code></td>
            <td>${nombre}</td>
            <td>${etiquetaHtml}</td>
            <td class="last-sent-cell">${lastSent}</td>
            <td class="dim">${created}</td>
            <td class="actions-cell">
                <button class="btn-icon-red" onclick="deleteContact(${c.id}, '${escHtml(c.telefono)}')" title="Eliminar">
                    <i class="ph ph-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function renderContactsPagination(page, pages, total) {
    const wrap  = document.getElementById('contacts-pagination');
    const label = document.getElementById('contacts-page-label');
    const prev  = document.getElementById('btn-contacts-prev');
    const next  = document.getElementById('btn-contacts-next');

    if (pages <= 1) { wrap.style.display = 'none'; return; }

    wrap.style.display    = 'flex';
    label.textContent     = `Página ${page} de ${pages}  ·  ${total.toLocaleString()} contactos`;
    prev.disabled         = page <= 1;
    next.disabled         = page >= pages;
}

async function loadContactsStats() {
    try {
        // Total
        const resTotal  = await authFetch('/api/contacts/count');
        const { count } = await resTotal.json();

        // Con envío
        const { count: sentCount } = await sb
            .from('contacts').select('*', { count: 'exact', head: true })
            .not('last_sent_at', 'is', null);

        document.getElementById('cstat-total').textContent = (count || 0).toLocaleString();
        document.getElementById('cstat-sent').textContent  = (sentCount || 0).toLocaleString();
        document.getElementById('cstat-never').textContent = ((count || 0) - (sentCount || 0)).toLocaleString();
    } catch { /* silencioso */ }
}

async function loadTagsFilter() {
    try {
        const res  = await authFetch('/api/contacts?etiquetas=true');
        const data = await res.json();
        const dropdown = document.getElementById('tags-filter-dropdown');
        const etiquetas = data.etiquetas || [];

        // Preserve currently selected tags
        const currentlySelected = getSelectedTags();

        dropdown.innerHTML = `
            <label class="tags-option">
                <input type="checkbox" id="tags-all-check" value="">
                <span>Todas las etiquetas</span>
            </label>
            ${etiquetas.map(e => {
                const c = tagColor(e.tag);
                return `<label class="tags-option">
                    <input type="checkbox" value="${escHtml(e.tag)}"${currentlySelected.includes(e.tag) ? ' checked' : ''}>
                    <span class="tag tag-colored" style="background:${c.bg};border:1px solid ${c.border};color:${c.text}">${escHtml(e.tag)}</span>
                    <span class="tags-count">(${e.cnt})</span>
                </label>`;
            }).join('')}
        `;

        // Rellenar bulk-tag-suggestions con chips clickeables
        const sugg = document.getElementById('bulk-tag-suggestions');
        if (sugg) {
            sugg.innerHTML = etiquetas.map(e => {
                const c = tagColor(e.tag);
                return `<div class="bulk-tag-sugg-item" data-tag="${escHtml(e.tag)}"
                    style="border-left:3px solid ${c.border}"
                    onclick="document.getElementById('bulk-etiqueta-input').value=this.dataset.tag;this.parentElement.style.display='none'">
                    <span style="color:${c.text}">${escHtml(e.tag)}</span>
                    <span class="tags-count">${e.cnt}</span>
                </div>`;
            }).join('');
        }

        // "Todas" checkbox: check it if nothing specific is selected
        const allChk = document.getElementById('tags-all-check');
        if (allChk) allChk.checked = currentlySelected.length === 0;

        // Wire event listeners
        dropdown.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', () => {
                // If "Todas" was clicked, uncheck specific tags; if specific was clicked, uncheck "Todas"
                if (cb.value === '') {
                    if (cb.checked) dropdown.querySelectorAll('input[type=checkbox]:not(#tags-all-check)').forEach(c => c.checked = false);
                } else {
                    if (allChk) allChk.checked = false;
                }
                updateTagsFilterLabel();
                contactsCurrentPage = 1;
                loadContacts();
            });
        });

        updateTagsFilterLabel();
    } catch { /* silencioso */ }
}

function getSelectedTags() {
    return [...document.querySelectorAll('#tags-filter-dropdown input[type=checkbox]:checked')]
        .map(cb => cb.value).filter(v => v);
}

function updateTagsFilterLabel() {
    const selected = getSelectedTags();
    document.getElementById('tags-filter-label').textContent =
        selected.length === 0 ? 'Todas las etiquetas' :
        selected.length === 1 ? selected[0] :
        `${selected.length} etiquetas`;
}

function toggleContactSelect(id, checked) {
    checked ? contactsSelected.add(id) : contactsSelected.delete(id);
    // Actualizar estado visual de la fila
    const cb  = document.querySelector(`.contact-row-check[data-id="${id}"]`);
    const row = cb?.closest('tr');
    if (row) row.classList.toggle('row-selected', checked);
    // Sincronizar "seleccionar todos"
    const all  = document.querySelectorAll('.contact-row-check');
    const allChk = document.getElementById('contacts-check-all');
    if (allChk) allChk.checked = all.length > 0 && [...all].every(c => c.checked);
    updateBulkBar();
}

function updateBulkBar() {
    const bar   = document.getElementById('bulk-action-bar');
    const label = document.getElementById('bulk-count-label');
    const n     = contactsSelected.size;
    if (n > 0) {
        bar.style.display    = 'flex';
        label.textContent    = `${n} contacto${n !== 1 ? 's' : ''} seleccionado${n !== 1 ? 's' : ''}`;
    } else {
        bar.style.display = 'none';
    }
}

function clearContactSelection() {
    contactsSelected.clear();
    document.querySelectorAll('.contact-row-check').forEach(cb => cb.checked = false);
    document.querySelectorAll('.row-selected').forEach(r => r.classList.remove('row-selected'));
    const allChk = document.getElementById('contacts-check-all');
    if (allChk) allChk.checked = false;
    updateBulkBar();
}

async function applyBulkEtiqueta() {
    const etiqueta = document.getElementById('bulk-etiqueta-input').value.trim();
    const ids      = [...contactsSelected];
    if (!ids.length) return;
    if (!etiqueta) { alert('Escribe el nombre de la etiqueta.'); return; }

    const mode = window._bulkTagMode ? window._bulkTagMode() : 'add';
    const btn  = document.getElementById('btn-bulk-apply');
    btn.disabled  = true;
    btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i>';

    try {
        const res  = await authFetch('/api/contacts', {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ ids, etiqueta, mode })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al aplicar etiqueta');
        document.getElementById('bulk-etiqueta-input').value = '';
        clearContactSelection();
        loadContacts();
        loadTagsFilter(); // refrescar el dropdown de filtros con las nuevas etiquetas
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="ph ph-check"></i> Aplicar';
    }
}

async function deleteContact(id, telefono) {
    if (!confirm(`¿Eliminar el contacto ${telefono}?`)) return;
    try {
        const res = await authFetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json(); return alert(d.error || 'Error al eliminar.'); }
        loadContacts();
        refreshContactsCount();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function removeContactTag(contactId, tag) {
    try {
        const res  = await authFetch('/api/contacts', {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ ids: [contactId], etiqueta: tag, mode: 'remove' })
        });
        if (!res.ok) { const d = await res.json(); return alert(d.error || 'Error'); }
        loadContacts();
        loadTagsFilter();
    } catch (err) { alert(err.message); }
}

function downloadContactsTemplate() {
    const csv = 'telefono,nombre,etiqueta\n18091234567,Juan Pérez,Cliente\n18097654321,María García,Promo\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = 'plantilla_contactos.csv'; a.click();
    URL.revokeObjectURL(url);
}

function openAddContactModal() {
    document.getElementById('add-contact-modal').style.display = 'flex';
    document.getElementById('ac-telefono').value = '';
    document.getElementById('ac-nombre').value   = '';
    document.getElementById('ac-etiqueta').value = '';
    document.getElementById('ac-error').style.display = 'none';
    document.getElementById('ac-telefono').focus();
    // Poblar datalist con etiquetas existentes
    authFetch('/api/contacts?etiquetas=true').then(r => r.json()).then(d => {
        document.getElementById('ac-etiqueta-list').innerHTML =
            (d.etiquetas || []).map(e => `<option value="${escHtml(e.tag)}">`).join('');
    }).catch(() => {});
}
function closeAddContactModal() {
    document.getElementById('add-contact-modal').style.display = 'none';
}
async function submitAddContact(e) {
    e.preventDefault();
    const telefono = document.getElementById('ac-telefono').value.replace(/\D/g,'');
    const nombre   = document.getElementById('ac-nombre').value.trim() || null;
    const etiqueta = document.getElementById('ac-etiqueta').value.trim() || null;
    const errEl    = document.getElementById('ac-error');
    const btn      = document.getElementById('ac-submit');

    if (telefono.length < 8) {
        errEl.textContent = 'El teléfono debe tener al menos 8 dígitos.';
        errEl.style.display = 'block'; return;
    }
    errEl.style.display = 'none';
    btn.disabled  = true;
    btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Guardando...';

    try {
        const contact = { telefono, nombre, etiqueta };
        const res  = await authFetch('/api/contacts/upload', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ contacts: [contact] })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al guardar');
        closeAddContactModal();
        loadContacts();
        refreshContactsCount();
        loadTagsFilter();
    } catch (err) {
        errEl.textContent   = err.message;
        errEl.style.display = 'block';
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="ph ph-plus"></i> Agregar';
    }
}

// ── Modal de importación de contactos ──────────

function setupContactsImportModal() {
    const dropzone = document.getElementById('contacts-dropzone');
    const fileInput= document.getElementById('contacts-csv-input');
    const submitBtn= document.getElementById('contacts-import-submit');

    // Click en la dropzone → abrir selector de archivo
    dropzone.addEventListener('click', () => fileInput.click());

    // Drag & drop
    dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('dropzone-over'); });
    dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('dropzone-over'));
    dropzone.addEventListener('drop',      e  => {
        e.preventDefault();
        dropzone.classList.remove('dropzone-over');
        const file = e.dataTransfer.files[0];
        if (file) setContactsFile(file);
    });

    // Selección normal de archivo
    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) setContactsFile(e.target.files[0]);
    });

    // Botones
    document.getElementById('contacts-import-close').addEventListener('click',  closeContactsImportModal);
    document.getElementById('contacts-import-cancel').addEventListener('click', closeContactsImportModal);
    document.getElementById('contacts-import-overlay').addEventListener('click', closeContactsImportModal);
    submitBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (file) submitContactsImport(file);
    });
}

function setContactsFile(file) {
    const nameEl   = document.getElementById('contacts-import-filename');
    const submitBtn= document.getElementById('contacts-import-submit');
    const resultEl = document.getElementById('contacts-import-result');
    nameEl.textContent  = `📄 ${file.name}`;
    nameEl.style.display= 'block';
    submitBtn.disabled  = false;
    resultEl.style.display = 'none';
    // Asignar al input para que submitContactsImport pueda leerlo
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('contacts-csv-input').files = dt.files;
}

function openContactsImportModal() {
    document.getElementById('modal-contacts-import').style.display = 'flex';
    document.getElementById('contacts-import-result').style.display   = 'none';
    document.getElementById('contacts-import-filename').style.display = 'none';
    document.getElementById('contacts-import-submit').disabled = true;
    document.getElementById('contacts-csv-input').value = '';
}

function closeContactsImportModal() {
    document.getElementById('modal-contacts-import').style.display = 'none';
}

async function submitContactsImport(file) {
    const btn      = document.getElementById('contacts-import-submit');
    const resultEl = document.getElementById('contacts-import-result');
    btn.disabled   = true;
    btn.innerHTML  = '<i class="ph ph-circle-notch ph-spin"></i> Importando...';
    resultEl.style.display = 'none';

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async results => {
            const fields   = Object.keys(results.data[0] || {});
            const phoneCol = ['telefono','Telefono','Teléfono','phone','Phone','celular','Celular','cel','Cel','Tel','tel']
                .find(c => fields.includes(c)) ?? fields[0];
            const nameCol  = ['nombre','Nombre','name','Name'].find(c => fields.includes(c));
            const labelCol = ['etiqueta','Etiqueta','label','Label','segmento','Segmento'].find(c => fields.includes(c));

            const contacts = results.data.map(r => ({
                telefono:  String(r[phoneCol] ?? '').replace(/\D/g, ''),
                nombre:    nameCol  ? r[nameCol]  || null : null,
                etiqueta:  labelCol ? r[labelCol] || null : null
            })).filter(c => c.telefono.length >= 8);

            if (!contacts.length) {
                resultEl.className    = 'import-result import-result-error';
                resultEl.textContent  = 'No se encontraron números válidos. Verifica que el CSV tenga una columna "telefono".';
                resultEl.style.display= 'block';
                btn.disabled  = false;
                btn.innerHTML = '<i class="ph ph-upload-simple"></i> Importar';
                return;
            }

            try {
                const res  = await authFetch('/api/contacts/upload', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ contacts })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al importar');

                resultEl.className    = 'import-result import-result-ok';
                resultEl.textContent  = `✅ ${data.inserted.toLocaleString()} contactos procesados · Total en DB: ${data.total.toLocaleString()}`;
                resultEl.style.display= 'block';
                loadContacts();
                refreshContactsCount();
            } catch (err) {
                resultEl.className    = 'import-result import-result-error';
                resultEl.textContent  = '❌ ' + err.message;
                resultEl.style.display= 'block';
            } finally {
                btn.disabled  = false;
                btn.innerHTML = '<i class="ph ph-upload-simple"></i> Importar';
            }
        },
        error: err => {
            resultEl.className    = 'import-result import-result-error';
            resultEl.textContent  = 'Error al leer el archivo: ' + err.message;
            resultEl.style.display= 'block';
            btn.disabled  = false;
            btn.innerHTML = '<i class="ph ph-upload-simple"></i> Importar';
        }
    });
}

// ─────────────────────────────────────────────
// Modal de errores por campaña
// ─────────────────────────────────────────────

function setupErrorsModal() {
    document.getElementById('errors-close').addEventListener('click', closeErrorsModal);
    document.getElementById('errors-overlay').addEventListener('click', closeErrorsModal);
}

function closeErrorsModal() {
    document.getElementById('modal-errors').style.display = 'none';
}

async function showCampaignErrors(id, name) {
    document.getElementById('errors-campaign-name').textContent =
        `Campaña: ${name}`;
    document.getElementById('errors-list').innerHTML =
        '<div class="errors-loading"><i class="ph ph-circle-notch ph-spin"></i> Cargando errores...</div>';
    document.getElementById('modal-errors').style.display = 'flex';

    const { data, error } = await sb
        .from('campaign_messages')
        .select('telefono, error, updated_at')
        .eq('campaign_id', id)
        .eq('status', 'failed')
        .order('updated_at', { ascending: false });

    if (error) {
        document.getElementById('errors-list').innerHTML =
            '<div class="errors-loading">Error al consultar la base de datos.</div>';
        return;
    }

    if (!data?.length) {
        document.getElementById('errors-list').innerHTML =
            '<div class="errors-loading">No se encontraron errores detallados.</div>';
        return;
    }

    document.getElementById('errors-list').innerHTML = data.map(m => `
        <div class="error-row">
            <span class="error-phone"><i class="ph ph-phone"></i> ${escHtml(m.telefono)}</span>
            <span class="error-msg">${escHtml(m.error || 'Error desconocido')}</span>
        </div>
    `).join('');
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function showLoader(on, text = 'Procesando...') {
    loaderText.textContent = text;
    loader.classList.toggle('active', on);
}
function statusLabel(s) {
    return { draft:'Borrador', running:'En ejecución', paused:'Pausada', completed:'Completada', failed:'Error' }[s] ?? s;
}
function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

document.addEventListener('DOMContentLoaded', async () => {
    setupAuth();
    await checkAuth();
    // init() se llama solo si ya hay sesión activa
    const { data: { session } } = await sb.auth.getSession();
    if (session) init();
});
