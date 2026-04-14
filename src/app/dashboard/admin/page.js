"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { 
  Users, 
  UserCheck, 
  UserX, 
  BarChart3, 
  ShieldCheck, 
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function AdminDashboard() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalUsers: 0, pendingUsers: 0, totalMessages: 0, successRate: 0 });
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'all'

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch Stats
      const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: pendingUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('approved', false);
      const { count: totalMessages } = await supabase.from('registro_envios').select('*', { count: 'exact', head: true });
      const { count: successMessages } = await supabase.from('registro_envios').select('*', { count: 'exact', head: true }).eq('status', 'sent');
      
      setStats({
        totalUsers: totalUsers || 0,
        pendingUsers: pendingUsers || 0,
        totalMessages: totalMessages || 0,
        successRate: totalMessages > 0 ? Math.round((successMessages / totalMessages) * 100) : 0
      });

      // Fetch Users
      const { data: usersData, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(usersData || []);
    } catch (error) {
      console.error('Error fetching admin data:', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleApproval(userId, currentStatus) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ approved: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      
      // Update local state
      setUsers(users.map(u => u.id === userId ? { ...u, approved: !currentStatus } : u));
      setStats(prev => ({ 
        ...prev, 
        pendingUsers: currentStatus ? prev.pendingUsers + 1 : prev.pendingUsers - 1 
      }));
    } catch (error) {
      alert('Error actualizando usuario: ' + error.message);
    }
  }

  const filteredUsers = activeTab === 'pending' 
    ? users.filter(u => !u.approved) 
    : users;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.5rem' }}>Panel Administrativo</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Gestiona los accesos y supervisa el rendimiento global del sistema.</p>
      </header>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Users size={24} color="var(--accent-color)" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Usuarios totales</span>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stats.totalUsers}</p>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Clock size={24} color="#eab308" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pendientes</span>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stats.pendingUsers}</p>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <BarChart3 size={24} color="#22c55e" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Mensajes Enviados</span>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stats.totalMessages}</p>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <ShieldCheck size={24} color="var(--accent-color)" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tasa de Éxito</span>
          </div>
          <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stats.successRate}%</p>
        </div>
      </div>

      {/* User Management */}
      <div className="glass-panel">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Gestión de Usuarios</h2>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--surface-hover)', padding: '4px', borderRadius: '8px' }}>
            <button 
              onClick={() => setActiveTab('pending')}
              style={{ 
                padding: '6px 12px', 
                borderRadius: '6px', 
                border: 'none', 
                fontSize: '0.85rem',
                cursor: 'pointer',
                background: activeTab === 'pending' ? 'var(--bg-color)' : 'transparent',
                color: activeTab === 'pending' ? 'white' : 'var(--text-secondary)'
              }}
            >
              Pendientes
            </button>
            <button 
              onClick={() => setActiveTab('all')}
              style={{ 
                padding: '6px 12px', 
                borderRadius: '6px', 
                border: 'none', 
                fontSize: '0.85rem',
                cursor: 'pointer',
                background: activeTab === 'all' ? 'var(--bg-color)' : 'transparent',
                color: activeTab === 'all' ? 'white' : 'var(--text-secondary)'
              }}
            >
              Todos
            </button>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>USUARIO</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>FECHA REGISTRO</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>ROL</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>ESTADO</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'right' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando usuarios...</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay usuarios en esta lista.</td></tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: '600' }}>{user.full_name || 'Sin nombre'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{user.id}</div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      background: user.role === 'admin' ? 'rgba(47, 129, 247, 0.1)' : 'var(--surface-hover)',
                      color: user.role === 'admin' ? 'var(--accent-color)' : 'var(--text-secondary)',
                      padding: '2px 8px',
                      borderRadius: '12px'
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                      {user.approved ? (
                        <CheckCircle2 size={16} color="#22c55e" />
                      ) : (
                        <AlertCircle size={16} color="#eab308" />
                      )}
                      {user.approved ? 'Aprobado' : 'Pendiente'}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button 
                      onClick={() => handleToggleApproval(user.id, user.approved)}
                      className={user.approved ? 'btn-secondary' : 'btn-primary'}
                      style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '0.5rem' }}
                    >
                      {user.approved ? <UserX size={14} /> : <UserCheck size={14} />}
                      {user.approved ? 'Suspender' : 'Aprobar'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
