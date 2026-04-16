// ─────────────────────────────────────────────
// Supabase — cliente del browser (solo usa la clave pública)
// ─────────────────────────────────────────────
const SUPABASE_URL      = 'https://lpliytimpwstaiydwfwk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__8vr69KZjUcdO13BlwgqVQ_1rm5b6OU';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    setupCampaigns();
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
        const res  = await fetch('/api/contacts/upload', {
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
        const res  = await fetch('/api/contacts/count');
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

function setupCampaigns() {
    document.getElementById('btn-new-campaign').addEventListener('click', openCampaignModal);
    document.getElementById('modal-close').addEventListener('click', closeCampaignModal);
    document.getElementById('modal-cancel').addEventListener('click', closeCampaignModal);
    document.getElementById('modal-overlay').addEventListener('click', closeCampaignModal);
    document.getElementById('btn-refresh-campaigns').addEventListener('click', loadCampaigns);
    document.getElementById('btn-pause-campaign').addEventListener('click', pauseActiveCampaign);
    document.getElementById('form-campaign').addEventListener('submit', submitCampaign);
    document.getElementById('f-source').addEventListener('change', e => {
        document.getElementById('f-etiqueta-group').style.display =
            e.target.value === 'etiqueta' ? 'block' : 'none';
        updateContactPreview();
    });
    document.getElementById('f-etiqueta').addEventListener('input', updateContactPreview);

    // Modal de errores
    document.getElementById('modal-errors-close').addEventListener('click', closeErrorsModal);
    document.getElementById('modal-errors-cancel').addEventListener('click', closeErrorsModal);
    document.getElementById('modal-errors-overlay').addEventListener('click', closeErrorsModal);
}

async function loadCampaigns() {
    try {
        const res  = await fetch('/api/campaigns');
        if (!res.ok) throw new Error(await res.text());
        renderCampaignsTable(await res.json());
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
    tbody.innerHTML = campaigns.map(c => `
        <tr>
            <td><strong>${escHtml(c.nombre)}</strong></td>
            <td><code>${escHtml(c.template_name)}</code></td>
            <td>${c.total.toLocaleString()}</td>
            <td class="col-sent">${c.enviados.toLocaleString()}</td>
            <td class="col-delivered">${c.entregados.toLocaleString()}</td>
            <td class="col-read">${c.leidos.toLocaleString()}</td>
            <td class="col-failed">
                ${c.fallidos > 0
                    ? `<button class="col-failed-btn" onclick="showCampaignErrors(${c.id}, '${escHtml(c.nombre)}')" title="Ver errores">
                           ${c.fallidos.toLocaleString()} <i class="ph ph-info"></i>
                       </button>`
                    : '0'}
            </td>
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
        </tr>`).join('');
}

// ── Campaign runner (loop en el browser) ──────

async function startCampaign(id) {
    try {
        const res = await fetch(`/api/campaigns/start?id=${id}`, { method: 'POST' });
        if (!res.ok) return alert((await res.json()).error);

        activeCampaignId = id;
        campaignRunning  = true;

        const camp = await (await fetch(`/api/campaigns/${id}`)).json();
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
        const campRes = await fetch(`/api/campaigns/${campaignId}`);
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
            await fetch(`/api/campaigns/complete?id=${campaignId}`, { method: 'POST' });
            campaignRunning = false;
            break;
        }

        // Enviar via API
        await fetch('/api/send', {
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
    await fetch(`/api/campaigns/pause?id=${id}`, { method: 'POST' });
    loadCampaigns();
}

async function pauseActiveCampaign() {
    if (activeCampaignId) await pauseCampaign(activeCampaignId);
}

async function deleteCampaign(id) {
    if (!confirm('¿Eliminar esta campaña?')) return;
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
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
}
function closeCampaignModal() {
    document.getElementById('modal-campaign').style.display = 'none';
    document.getElementById('form-campaign').reset();
    document.getElementById('f-etiqueta-group').style.display = 'none';
}
async function updateContactPreview() {
    const source   = document.getElementById('f-source').value;
    const etiqueta = document.getElementById('f-etiqueta').value.trim();
    try {
        let url = '/api/contacts/count';
        if (source === 'etiqueta' && etiqueta) {
            const { count } = await sb.from('contacts').select('*', { count:'exact', head:true }).eq('etiqueta', etiqueta);
            document.getElementById('preview-count').textContent = `${(count ?? 0).toLocaleString()} contactos serán incluidos`;
            return;
        }
        const res  = await fetch(url);
        const data = await res.json();
        document.getElementById('preview-count').textContent = `${(data.count ?? 0).toLocaleString()} contactos serán incluidos`;
    } catch {
        document.getElementById('preview-count').textContent = 'No se pudo calcular';
    }
}

async function submitCampaign(e) {
    e.preventDefault();
    showLoader(true, 'Creando campaña...');
    try {
        const headerImageUrl = document.getElementById('f-header-image').value.trim() || undefined;
        const res  = await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre:           document.getElementById('f-nombre').value.trim(),
                templateName:     document.getElementById('f-template').value.trim(),
                templateLanguage: document.getElementById('f-language').value,
                headerImageUrl,
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

// ── Modal errores de campaña ───────────────────

async function showCampaignErrors(campaignId, campaignName) {
    document.getElementById('errors-campaign-name').textContent = campaignName;
    document.getElementById('errors-list').innerHTML = '<p style="opacity:.5;text-align:center;padding:2rem">Cargando...</p>';
    document.getElementById('modal-errors').style.display = 'flex';

    const { data: messages, error } = await sb
        .from('campaign_messages')
        .select('telefono, error')
        .eq('campaign_id', campaignId)
        .eq('status', 'failed')
        .order('id', { ascending: false })
        .limit(200);

    if (error || !messages?.length) {
        document.getElementById('errors-list').innerHTML =
            `<p style="opacity:.5;text-align:center;padding:2rem">${error ? 'Error al cargar.' : 'No se encontraron errores registrados.'}</p>`;
        return;
    }

    document.getElementById('errors-list').innerHTML = messages.map(m => `
        <div style="padding:.6rem .75rem;border-radius:8px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15)">
            <p style="font-weight:600;font-size:.82rem;margin-bottom:.2rem">${escHtml(m.telefono)}</p>
            <p style="font-size:.75rem;color:#f87171">${escHtml(m.error || 'Sin mensaje de error')}</p>
        </div>`).join('');
}

function closeErrorsModal() {
    document.getElementById('modal-errors').style.display = 'none';
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

document.addEventListener('DOMContentLoaded', init);
