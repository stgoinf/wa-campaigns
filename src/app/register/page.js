"use client";
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [success, setSuccess] = useState(false);
  
  const supabase = createClient();
  const router = useRouter();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName
        }
      },
    });


    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      // Optional: Auto redirect after success message
    }
    setLoading(false);
  };

  return (
    <main className="app-container">
      <div className="main-content">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '2rem' }}>
          
          <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '16px', background: 'var(--surface-hover)', marginBottom: '1rem' }}>
                <span style={{ fontSize: '2rem', display: 'block', lineHeight: 1 }}>✨</span>
              </div>
              <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Crear Cuenta</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Regístrate para gestionar tus campañas</p>
            </div>
            
            {success ? (
              <div style={{ padding: '1.5rem', background: 'rgba(35, 134, 54, 0.1)', borderRadius: 'var(--radius-md)', color: '#238636' }}>
                <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>¡Registro exitoso! Por favor revisa tu correo para confirmar tu cuenta.</p>
                <Link href="/" className="btn-primary" style={{ width: '100%' }}>
                  Volver al Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Nombre completo</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Ej. Juan Pérez" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div style={{ textAlign: 'left' }}>

                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Correo electrónico</label>
                  <input 
                    type="email" 
                    className="input-field" 
                    placeholder="tu@dominos.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Contraseña</label>
                  <input 
                    type="password" 
                    className="input-field" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                
                {error && <p style={{ color: '#da3633', fontSize: '0.8rem', textAlign: 'left' }}>{error}</p>}
                
                <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
                  {loading ? 'Creando cuenta...' : 'Registrarse'}
                </button>
                
                <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  ¿Ya tienes cuenta? <Link href="/" style={{ color: 'var(--accent-color)' }}>Inicia sesión</Link>
                </p>
              </form>
            )}
          </div>
          
        </div>
      </div>
    </main>
  );
}
