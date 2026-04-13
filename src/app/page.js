"use client";
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from "./page.module.css";

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const supabase = createClient();
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <main className="app-container">
      <div className="main-content">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '2rem' }}>
          
          <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '16px', background: 'var(--surface-hover)', marginBottom: '1rem' }}>
                <span style={{ fontSize: '2rem', display: 'block', lineHeight: 1 }}>🍕</span>
              </div>
              <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Domino's Portal</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Ingresa tus credenciales para continuar</p>
            </div>
            
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Correo electrónico</label>
                <input 
                  type="email" 
                  className="input-field" 
                  placeholder="ejemplo@dominos.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Contraseña</label>
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && <p style={{ color: '#da3633', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

              <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>
              
              <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                ¿No tienes cuenta? <Link href="/register" style={{ color: 'var(--accent-color)' }}>Regístrate aquí</Link>
              </p>
            </form>
          </div>
          
        </div>
      </div>
    </main>
  );
}
