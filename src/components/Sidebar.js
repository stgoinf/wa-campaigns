"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Users, 
  Upload, 
  Send, 
  Settings, 
  LogOut, 
  PieChart,
  ShieldCheck
} from 'lucide-react';



export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();


  const [isAdmin, setIsAdmin] = useState(false);
  
  const baseMenuItems = [
    { label: 'Dashboard', icon: <PieChart size={20} />, href: '/dashboard' },
    { label: 'Clientes', icon: <Users size={20} />, href: '/dashboard/clientes' },
    { label: 'Cargar CSV', icon: <Upload size={20} />, href: '/dashboard/upload' },
    { label: 'Envíos', icon: <Send size={20} />, href: '/dashboard/send' },
    { label: 'Configuración', icon: <Settings size={20} />, href: '/dashboard/settings' },
  ];

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log("Sidebar: No hay usuario autenticado");
        return;
      }

      console.log("Sidebar: Verificando rol para", user.email);

      // 1. Verificar por email (Fallback de emergencia)
      const adminEmails = process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
      if (adminEmails.includes(user.email)) {
        console.log("Sidebar: Acceso concedido por email en lista blanca");
        setIsAdmin(true);
        return;
      }

      // 2. Verificar por base de datos
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (error) {
        console.error("Sidebar: Error al cargar perfil:", error.message);
      }

      if (profile?.role === 'admin') {
        console.log("Sidebar: Acceso concedido por rol admin en DB");
        setIsAdmin(true);
      } else {
        console.log("Sidebar: Usuario no es admin. Rol:", profile?.role);
      }
    } catch (err) {
      console.error("Sidebar: Error inesperado en checkAdmin:", err);
    }
  }

  const menuItems = isAdmin 
    ? [{ label: 'Admin Backoffice', icon: <ShieldCheck size={20} />, href: '/dashboard/admin' }, ...baseMenuItems]
    : baseMenuItems;


  return (
    <aside className="glass-panel" style={{ 
      width: '260px', 
      height: 'calc(100vh - 2rem)', 
      margin: '1rem',
      display: 'flex', 
      flexDirection: 'column',
      position: 'sticky',
      top: '1rem'
    }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'var(--brand-red)', padding: '6px', borderRadius: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>🍕</span>
          </div>
          <span style={{ fontWeight: '700', fontSize: '1.1rem', letterSpacing: '-0.5px' }}>Domino's Tool</span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '1rem 0.5rem' }}>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link href={item.href} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  background: isActive ? 'var(--surface-hover)' : 'transparent',
                  transition: 'all 0.2s ease',
                  fontSize: '0.95rem',
                  fontWeight: isActive ? '600' : '400'
                }}>
                  <span style={{ color: isActive ? 'var(--accent-color)' : 'inherit' }}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <button 
          className="btn-secondary" 
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace('/');
          }}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 12px',
            cursor: 'pointer'
          }}
        >
          <LogOut size={20} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
