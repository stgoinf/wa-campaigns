// ─── Supabase ────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://lpliytimpwstaiydwfwk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vsScrCXL6icSIHipYllxVA_9xqRo4W1';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mismo valor que en app.js — solo para pintar la badge "ADMIN" en la lista.
// La autorización real vive en api/admin.js (process.env.ADMIN_EMAIL).
const ADMIN_EMAIL = 'santiago.infante@botcity.com.do';

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

async function authFetch(url, opts = {}) {
    const { data: { session } } = await sb.auth.getSession();
    const headers = { ...(opts.headers || {}) };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...opts, headers });
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

    initCreateUserModal();
    initEditUserModals();

    loadUsers();
}

// ─── Modal: Crear cliente ────────────────────────────────────────────────────
function initCreateUserModal() {
    const modal   = document.getElementById('modal-create-user');
    const form    = document.getElementById('form-create-user');
    const success = document.getElementById('cu-success');
    const errorEl = document.getElementById('cu-error');
    const submit  = document.getElementById('cu-submit');

    document.getElementById('btn-new-user').addEventListener('click', () => openCreateUserModal());

    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => closeCreateUserModal({ reloadUsers: success.style.display === 'block' }));
    });

    // Toggle entre crear nuevo workspace y asignar existente
    document.querySelectorAll('input[name="cu-mode"]').forEach(r => {
        r.addEventListener('change', () => {
            const isNew = r.value === 'new' && r.checked;
            if (!r.checked) return;
            document.getElementById('cu-mode-new').style.display      = isNew ? 'block' : 'none';
            document.getElementById('cu-mode-existing').style.display = isNew ? 'none'  : 'block';
            if (!isNew) loadWorkspaceOptions();
        });
    });

    document.getElementById('cu-pw-toggle').addEventListener('click', () => {
        const inp  = document.getElementById('cu-password');
        const icon = document.querySelector('#cu-pw-toggle i');
        const visible = inp.type === 'text';
        inp.type = visible ? 'password' : 'text';
        icon.className = visible ? 'ph ph-eye' : 'ph ph-eye-slash';
    });

    document.getElementById('cu-gen-pw').addEventListener('click', () => {
        const inp = document.getElementById('cu-password');
        inp.value = generatePassword();
        inp.type  = 'text';
        document.querySelector('#cu-pw-toggle i').className = 'ph ph-eye-slash';
    });

    modal.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.copy);
            if (!target) return;
            navigator.clipboard?.writeText(target.textContent).then(() => {
                const i = btn.querySelector('i');
                const prev = i.className;
                i.className = 'ph ph-check';
                setTimeout(() => { i.className = prev; }, 1400);
            }).catch(() => {});
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        const email    = document.getElementById('cu-email').value.trim();
        const password = document.getElementById('cu-password').value;
        const mode     = document.querySelector('input[name="cu-mode"]:checked')?.value || 'new';

        if (!email || !password) {
            errorEl.textContent = 'Completa email y contraseña.';
            errorEl.style.display = 'block';
            return;
        }
        if (password.length < 8) {
            errorEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
            errorEl.style.display = 'block';
            return;
        }

        const body = { email, password };
        if (mode === 'new') {
            const workspaceName = document.getElementById('cu-workspace').value.trim();
            if (!workspaceName) {
                errorEl.textContent = 'Ingresa el nombre del workspace nuevo.';
                errorEl.style.display = 'block';
                return;
            }
            body.workspaceName = workspaceName;
        } else {
            const workspaceId = document.getElementById('cu-workspace-id').value;
            if (!workspaceId) {
                errorEl.textContent = 'Elige el workspace al que asignar este cliente.';
                errorEl.style.display = 'block';
                return;
            }
            body.workspaceId = workspaceId;
        }

        submit.disabled = true;
        const prevHtml = submit.innerHTML;
        submit.innerHTML = '<i class="ph ph-circle-notch spin"></i> Creando...';

        try {
            const res = await authFetch('/api/admin?action=create-user', {
                method: 'POST',
                body:   JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo crear el cliente.');

            document.getElementById('cu-out-email').textContent = data.email;
            document.getElementById('cu-out-pw').textContent    = password;
            const wsLabel = data.assigned
                ? `${data.workspaceName} · asignado como miembro`
                : `${data.workspaceName} · creado y asignado como dueño`;
            document.getElementById('cu-out-ws').textContent = wsLabel;
            form.style.display    = 'none';
            success.style.display = 'block';
        } catch (err) {
            errorEl.textContent   = err.message;
            errorEl.style.display = 'block';
        } finally {
            submit.disabled  = false;
            submit.innerHTML = prevHtml;
        }
    });
}

// Carga la lista de workspaces en el dropdown del modal (solo cuando se
// escoge "Asignar existente"). Se cachea por sesión del modal.
let workspaceOptionsCache = null;
async function loadWorkspaceOptions() {
    const select = document.getElementById('cu-workspace-id');
    if (workspaceOptionsCache) {
        renderWorkspaceOptions(select, workspaceOptionsCache);
        return;
    }
    select.innerHTML = '<option value="">Cargando workspaces…</option>';
    try {
        const res = await authFetch('/api/admin?view=workspaces');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo cargar la lista.');
        workspaceOptionsCache = data.workspaces || [];
        renderWorkspaceOptions(select, workspaceOptionsCache);
    } catch (err) {
        select.innerHTML = `<option value="">Error: ${escHtml(err.message)}</option>`;
    }
}
function renderWorkspaceOptions(select, workspaces) {
    if (!workspaces.length) {
        select.innerHTML = '<option value="">No hay workspaces todavía</option>';
        return;
    }
    select.innerHTML = '<option value="">Selecciona un workspace…</option>' +
        workspaces.map(w => {
            const meta = [w.owner_email, `${w.member_count} miembro${w.member_count === 1 ? '' : 's'}`]
                .filter(Boolean).join(' · ');
            return `<option value="${escHtml(w.id)}">${escHtml(w.name)} — ${escHtml(meta)}</option>`;
        }).join('');
}

function openCreateUserModal() {
    const modal   = document.getElementById('modal-create-user');
    const form    = document.getElementById('form-create-user');
    const success = document.getElementById('cu-success');
    form.reset();
    form.style.display    = 'block';
    success.style.display = 'none';
    document.getElementById('cu-error').style.display = 'none';
    document.getElementById('cu-password').type = 'password';
    document.querySelector('#cu-pw-toggle i').className = 'ph ph-eye';
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('cu-email').focus(), 50);
}

function closeCreateUserModal({ reloadUsers } = {}) {
    document.getElementById('modal-create-user').style.display = 'none';
    if (reloadUsers) loadUsers();
}

function generatePassword(len = 12) {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const buf   = new Uint8Array(len);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    let out = '';
    for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
    return out;
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
                    <div class="user-row-actions">
                        ${u.recent_campaigns.length ? `
                        <button class="expand-btn" onclick="toggleDetail(${i})" title="Ver campañas recientes">
                            <i class="ph ph-caret-down" id="expand-icon-${i}"></i>
                        </button>` : ''}
                        ${!u.confirmed ? `
                        <button class="btn-icon-green" onclick="confirmUserEmail('${u.id}', this)" title="Confirmar email manualmente">
                            <i class="ph ph-check-circle"></i>
                        </button>` : ''}
                        <button class="btn-icon-warn" onclick="openResetPasswordModal('${u.id}', '${escAttr(u.email)}')" title="Resetear contraseña">
                            <i class="ph ph-key"></i>
                        </button>
                        ${!isAdmin ? `
                        <button class="btn-icon-red" onclick="openDeleteUserModal('${u.id}', '${escAttr(u.email)}')" title="Eliminar usuario">
                            <i class="ph ph-trash"></i>
                        </button>` : ''}
                    </div>
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
// Para usar dentro de atributos HTML (escapa también la comilla simple)
function escAttr(str) {
    return escHtml(str).replace(/'/g, '&#39;');
}

// ─── Acciones por fila: confirmar email / resetear pw / eliminar ─────────────
async function confirmUserEmail(userId, btn) {
    if (!confirm('¿Confirmar el email manualmente? El usuario no recibirá correo.')) return;
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-circle-notch spin"></i>';
    try {
        const res  = await authFetch('/api/admin?action=confirm-email', {
            method: 'POST',
            body:   JSON.stringify({ userId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo confirmar.');
        await loadUsers();
    } catch (err) {
        alert('Error: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = prev;
    }
}

function openResetPasswordModal(userId, email) {
    const modal = document.getElementById('modal-reset-password');
    modal.dataset.userId = userId;
    document.getElementById('rp-email').textContent = email;
    const pwInp = document.getElementById('rp-password');
    pwInp.value = generatePassword();
    pwInp.type  = 'text';
    document.querySelector('#rp-pw-toggle i').className = 'ph ph-eye-slash';
    document.getElementById('rp-error').style.display = 'none';
    document.getElementById('form-reset-password').style.display = 'block';
    document.getElementById('rp-success').style.display = 'none';
    modal.style.display = 'flex';
    setTimeout(() => pwInp.focus(), 50);
}

function openDeleteUserModal(userId, email) {
    const modal = document.getElementById('modal-delete-user');
    modal.dataset.userId    = userId;
    modal.dataset.userEmail = email;
    document.getElementById('du-target-email').textContent = email;
    document.getElementById('du-confirm-email').value = '';
    document.getElementById('du-error').style.display = 'none';
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('du-confirm-email').focus(), 50);
}

function initEditUserModals() {
    // ── Reset password ──────────────────────────────────────────────────────
    const rpModal = document.getElementById('modal-reset-password');
    rpModal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => { rpModal.style.display = 'none'; });
    });
    document.getElementById('rp-pw-toggle').addEventListener('click', () => {
        const inp  = document.getElementById('rp-password');
        const icon = document.querySelector('#rp-pw-toggle i');
        const visible = inp.type === 'text';
        inp.type = visible ? 'password' : 'text';
        icon.className = visible ? 'ph ph-eye' : 'ph ph-eye-slash';
    });
    document.getElementById('rp-gen-pw').addEventListener('click', () => {
        const inp = document.getElementById('rp-password');
        inp.value = generatePassword();
        inp.type  = 'text';
        document.querySelector('#rp-pw-toggle i').className = 'ph ph-eye-slash';
    });
    rpModal.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = document.getElementById(btn.dataset.copy);
            navigator.clipboard?.writeText(t.textContent).then(() => {
                const i = btn.querySelector('i');
                const prev = i.className;
                i.className = 'ph ph-check';
                setTimeout(() => { i.className = prev; }, 1400);
            }).catch(() => {});
        });
    });
    document.getElementById('form-reset-password').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('rp-error');
        errorEl.style.display = 'none';
        const userId   = rpModal.dataset.userId;
        const password = document.getElementById('rp-password').value;
        if (!password || password.length < 8) {
            errorEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
            errorEl.style.display = 'block';
            return;
        }
        const submit = document.getElementById('rp-submit');
        submit.disabled = true;
        const prevHtml = submit.innerHTML;
        submit.innerHTML = '<i class="ph ph-circle-notch spin"></i> Actualizando…';
        try {
            const res  = await authFetch('/api/admin?action=reset-password', {
                method: 'POST',
                body:   JSON.stringify({ userId, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo actualizar.');
            document.getElementById('rp-out-pw').textContent = password;
            document.getElementById('form-reset-password').style.display = 'none';
            document.getElementById('rp-success').style.display = 'block';
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.style.display = 'block';
        } finally {
            submit.disabled = false;
            submit.innerHTML = prevHtml;
        }
    });

    // ── Delete user ─────────────────────────────────────────────────────────
    const duModal = document.getElementById('modal-delete-user');
    duModal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => { duModal.style.display = 'none'; });
    });
    document.getElementById('form-delete-user').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('du-error');
        errorEl.style.display = 'none';
        const userId       = duModal.dataset.userId;
        const targetEmail  = duModal.dataset.userEmail;
        const confirmEmail = document.getElementById('du-confirm-email').value.trim();
        if (confirmEmail !== targetEmail) {
            errorEl.textContent = 'El email no coincide.';
            errorEl.style.display = 'block';
            return;
        }
        const submit = document.getElementById('du-submit');
        submit.disabled = true;
        const prevHtml = submit.innerHTML;
        submit.innerHTML = '<i class="ph ph-circle-notch spin"></i> Eliminando…';
        try {
            const res  = await authFetch('/api/admin?action=delete-user', {
                method: 'POST',
                body:   JSON.stringify({ userId, confirmEmail }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo eliminar.');
            duModal.style.display = 'none';
            await loadUsers();
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.style.display = 'block';
        } finally {
            submit.disabled = false;
            submit.innerHTML = prevHtml;
        }
    });
}

// ─── Tema ─────────────────────────────────────────────────────────────────────
function applyAdminTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.classList.remove('ph-sun', 'ph-moon');
        icon.classList.add(theme === 'dark' ? 'ph-sun' : 'ph-moon');
    }
    document.querySelectorAll('img[data-logo-light]').forEach(img => {
        const src = theme === 'dark' ? img.dataset.logoDark : img.dataset.logoLight;
        if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
}
function initAdminTheme() {
    const stored = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyAdminTheme(stored || (prefersDark ? 'dark' : 'light'));
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyAdminTheme(next);
        try { localStorage.setItem('theme', next); } catch {}
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
initAdminTheme();
checkAdminAuth();
