"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Save, Key, Shield, Info } from 'lucide-react';

export default function Settings() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    WABA_BUSINESS_ID: '',
    WABA_TOKEN: ''
  });
  const [maskedToken, setMaskedToken] = useState('****************');

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('configuracion')
        .select('*');

      if (error) throw error;

      const newConfig = { ...config };
      data.forEach(item => {
        if (item.key === 'WABA_BUSINESS_ID') newConfig.WABA_BUSINESS_ID = item.value;
        if (item.key === 'WABA_TOKEN') {
          newConfig.WABA_TOKEN = item.value;
          // Mask the token: show only last 4 chars
          if (item.value) {
            setMaskedToken(`...${item.value.slice(-4)}`);
          }
        }
      });
      
      setConfig(newConfig);
    } catch (error) {
      console.error('Error fetching config:', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    
    try {
      const updates = [
        { key: 'WABA_BUSINESS_ID', value: config.WABA_BUSINESS_ID },
        { key: 'WABA_TOKEN', value: config.WABA_TOKEN }
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('configuracion')
          .upsert(update, { onConflict: 'key' });
        
        if (error) throw error;
      }

      alert('Configuración guardada correctamente.');
      if (config.WABA_TOKEN) {
        setMaskedToken(`...${config.WABA_TOKEN.slice(-4)}`);
      }
    } catch (error) {
      alert('Error guardando configuración: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Cargando configuración...</div>;

  return (
    <div style={{ maxWidth: '800px' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Configuración</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Gestiona tus credenciales de WhatsApp Business API</p>
      </header>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: 'var(--accent-color)' }}>
          <Shield size={24} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)' }}>Credenciales de Meta</h2>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
              WhatsApp Business Account ID
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                className="input-field" 
                value={config.WABA_BUSINESS_ID}
                onChange={(e) => setConfig({ ...config, WABA_BUSINESS_ID: e.target.value })}
                placeholder="ID de tu cuenta comercial"
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Encuéntralo en el panel de Meta para Desarrolladores > WhatsApp > Configuración.
            </p>
          </div>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
              System User Access Token
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type="password" 
                className="input-field" 
                value={config.WABA_TOKEN}
                onChange={(e) => setConfig({ ...config, WABA_TOKEN: e.target.value })}
                placeholder={maskedToken}
              />
              <Key size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: 'var(--text-secondary)' }} />
            </div>
            <div style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              padding: '1rem', 
              background: 'rgba(47, 129, 247, 0.1)', 
              borderRadius: '8px',
              marginTop: '0.5rem'
            }}>
              <Info size={16} style={{ color: 'var(--accent-color)', shrink: 0 }} />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <strong>Seguridad:</strong> El token se guarda cifrado en tu base de datos de Supabase. Nunca lo compartas con nadie. Usaremos este token para consultar tus plantillas y enviar los mensajes.
              </p>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : (
                <>
                  <Save size={18} />
                  Guardar Cambios
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>Instrucciones rápidas</h3>
        <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'grid', gap: '0.5rem' }}>
          <li>Entra a <a href="https://developers.facebook.com" target="_blank" style={{ color: 'var(--accent-color)' }}>developers.facebook.com</a></li>
          <li>Crea una App de tipo "Business" y añade el producto WhatsApp.</li>
          <li>Genera un "System User Token" con permisos <code>whatsapp_business_messaging</code>.</li>
        </ul>
      </div>
    </div>
  );
}
