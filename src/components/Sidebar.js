"use client";
import { createClient } from '@/utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Users, 
  Upload, 
  Send, 
  Settings, 
  LogOut, 
  PieChart
} from 'lucide-react';


export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();


  const menuItems = [
    { label: 'Dashboard', icon: <PieChart size={20} />, href: '/dashboard' },
    { label: 'Clientes', icon: <Users size={20} />, href: '/dashboard/clientes' },
    { label: 'Cargar CSV', icon: <Upload size={20} />, href: '/dashboard/upload' },
    { label: 'Envíos', icon: <Send size={20} />, href: '/dashboard/send' },
    { label: 'Configuración', icon: <Settings size={20} />, href: '/dashboard/settings' },
  ];

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
