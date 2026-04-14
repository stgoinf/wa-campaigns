"use client";
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Clock, LogOut, MessageCircle } from 'lucide-react';

export default function PendingApproval() {
  const supabase = createClient();
  const router = useRouter();

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'var(--bg-color)',
      padding: '2rem'
    }}>
      <div className="glass-panel" style={{ 
        maxWidth: '500px', 
        width: '100%', 
        padding: '3rem', 
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem'
      }}>
        <div style={{ 
          background: 'rgba(234, 179, 8, 0.1)', 
          padding: '1.5rem', 
          borderRadius: '50%',
          color: 'var(--brand-yellow)'
        }}>
          <Clock size={48} />
        </div>

        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', letterSpacing: '-0.5px' }}>
          Cuenta en espera
        </h1>
        
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          Tu cuenta ha sido creada exitosamente, pero requiere la <strong>aprobación manual de un administrador</strong> antes de que puedas acceder al sistema de envíos masivos.
        </p>

        <div style={{ 
          background: 'var(--surface-hover)', 
          padding: '1rem', 
          borderRadius: 'var(--radius-md)',
          width: '100%',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          justifyContent: 'center'
        }}>
          <MessageCircle size={18} />
          Contacta al soporte para agilizar el proceso.
        </div>

        <button 
          className="btn-secondary" 
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace('/');
          }}
          style={{ marginTop: '1rem', width: '100%', gap: '0.5rem' }}
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
