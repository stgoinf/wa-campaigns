// ─── Supabase ────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://lpliytimpwstaiydwfwk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__8vr69KZjUcdO13BlwgqVQ_1rm5b6OU';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CAMPAIGN_STATUS_LABELS = {
    running: 'En ejecución', completed: 'Completada',
    paused: 'Pausada', failed: 'Fallida', draft: 'Borrador'
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function checkAdminAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '/'; return; }

    // La validación real de admin se hace server-side en /api/admin
    // Aquí solo verificamos que haya sesión activa antes de cargar el panel
    const email = session.user.email;

    document.getElementById('admin-app').style.display = 'flex';
    document.getElementById('admin-user-info').textContent = email;
    initAdmin(session);
}

async function authFetch(url) {
    const { data: { session } } = await sb.auth.getSession();
    return fetch(url, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
    });
}

// ─── Navegación ───────────────────────────────────────────────────────────────
function initAdmin(session) {
    document.querySelectorAll('.admin-nav-item[data-view]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const view = link.dataset.view;
            document.querySelectorAll('.admin-nav-item').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.getElementById('view-users').style.display = view === 'users' ? 'block' : 'none';
            document.getElementById('view-stats').style.display = view === 'stats' ? 'block' : 'none';
            if (view === 'stats') loadGlobalStats();
        });
    });

    document.getElementById('btn-refresh-users').addEventListener('click', loadUsers);

    loadUsers();
}

// ─── Cargar lista de usuarios ─────────────────────────────────────────────────
async function loadUsers() {
    const tbody    = document.getElementById('users-tbody');
    const subtitle = document.getElementById('users-subtitle');
    tbody.innerHTML = `<tr><td colspan="8"><div class="admin-spinner"><i class="ph ph-circle-notch spin"></i> Cargando clientes...</div></td></tr>`;

    try {
        const res  = await authFetch('/api/admin?view=users');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const users = data.users || [];
        subtitle.textContent = `${users.length} cliente${users.length !== 1 ? 's' : ''} registrado${users.length !== 1 ? 's' : ''}`;

        // Quick stats en la parte superior
        const totalSent     = users.reduce((s, u) => s + u.sent, 0);
        const totalContacts = users.reduce((s, u) => s + u.contacts, 0);
        const confirmed     = users.filter(u => u.confirmed).length;
        document.getElementById('qs-users').textContent    = users.length.toLocaleString();
        document.getElementById('qs-confirmed').textContent= confirmed.toLocaleString();
        document.getElementById('qs-sent').textContent     = totalSent.toLocaleString();
        document.getElementById('qs-contacts').textContent = totalContacts.toLocaleString();
        document.getElementById('quick-stats').style.display = 'grid';

        if (!users.length) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="admin-empty">No hay usuarios registrados aún.</div></td></tr>`;
            return;
        }

        tbody.innerHTML = users.map((u, i) => {
            const status     = !u.confirmed ? 'inactive'
                             : u.sent > 0   ? 'active'
                             : u.campaigns > 0 ? 'setup'
                             : 'setup';
            const statusLabel= status === 'active' ? 'Activo' : status === 'setup' ? 'Sin envíos' : 'Sin confirmar';
            const registered = new Date(u.created_at).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
            const lastCamp   = u.last_campaign
                ? new Date(u.last_campaign).toLocaleDateString('es', { day:'2-digit', month:'short' })
                : '—';
            const isAdmin    = u.email === ADMIN_EMAIL;

            return `
            <tr class="user-main-row" data-idx="${i}">
                <td>
                    <span class="user-status-dot status-${status}"></span>
                    <span style="font-size:0.8rem;color:var(--text-secondary)">${statusLabel}</span>
                </td>
                <td>
                    <strong style="font-size:0.875rem">${escHtml(u.email)}</strong>
                    ${isAdmin ? '<span style="font-size:0.7rem;background:rgba(245,158,11,0.2);color:#fbbf24;padding:1px 5px;border-radius:4px;margin-left:4px">Admin</span>' : ''}
                </td>
                <td style="color:var(--text-secondary);font-size:0.82rem">${registered}</td>
                <td><strong>${u.contacts.toLocaleString()}</strong></td>
                <td><strong>${u.campaigns.toLocaleString()}</strong></td>
                <td><strong style="color:${u.sent > 0 ? '#6ee7b7' : 'var(--text-secondary)'}">${u.sent.toLocaleString()}</strong></td>
                <td style="color:var(--text-secondary);font-size:0.82rem">${lastCamp}</td>
                <td>
                    ${u.recent_campaigns.length ? `
                    <button class="expand-btn" onclick="toggleDetail(${i})" title="Ver campañas recientes">
                        <i class="ph ph-caret-down" id="expand-icon-${i}"></i>
                    </button>` : ''}
                </td>
            </tr>
            <tr class="detail-row" id="detail-row-${i}">
                <td colspan="8">
                    <div class="detail-content">
                        <h4>Campañas recientes</h4>
                        <div class="mini-camp-list">
                            ${u.recent_campaigns.map(c => `
                            <div class="mini-camp">
                                <span style="color:var(--text-secondary)">${new Date(c.created_at).toLocaleDateString('es', {day:'2-digit',month:'short',year:'numeric'})}</span>
                                <span>${(c.enviados||0).toLocaleString()} enviados · ${(c.fallidos||0).toLocaleString()} fallidos</span>
                                <span class="status-badge ${c.status}" style="font-size:0.72rem">${CAMPAIGN_STATUS_LABELS[c.status] || c.status}</span>
                            </div>`).join('')}
                        </div>
                    </div>
                </td>
            </tr>`;
        }).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="admin-empty" style="color:#f87171"><i class="ph ph-warning"></i> Error: ${escHtml(err.message)}</div></td></tr>`;
        subtitle.textContent = 'Error al cargar';
    }
}

// ─── Cargar métricas globales ─────────────────────────────────────────────────
async function loadGlobalStats() {
    try {
        const res  = await authFetch('/api/admin?view=stats');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        document.getElementById('gs-users').textContent    = (data.total_users     || 0).toLocaleString();
        document.getElementById('gs-confirmed').textContent= (data.confirmed_users || 0).toLocaleString();
        document.getElementById('gs-contacts').textContent = (data.total_contacts  || 0).toLocaleString();
        document.getElementById('gs-sent').textContent     = (data.total_sent      || 0).toLocaleString();
        document.getElementById('gs-failed').textContent   = (data.total_failed    || 0).toLocaleString();
        document.getElementById('gs-active').textContent   = (data.active_campaigns|| 0).toLocaleString();
    } catch (err) {
        console.error('Error cargando stats:', err);
    }
}

// ─── Toggle detalle de usuario ────────────────────────────────────────────────
function toggleDetail(idx) {
    const row  = document.getElementById(`detail-row-${idx}`);
    const icon = document.getElementById(`expand-icon-${idx}`);
    const open = row.style.display === 'table-row';
    row.style.display  = open ? 'none' : 'table-row';
    icon.className     = open ? 'ph ph-caret-down' : 'ph ph-caret-up';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
checkAdminAuth();
