"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { testWhatsAppConnection } from './actions';
import { Save, Key, Shield, Info, Smartphone, ExternalLink, Activity, CheckCircle2 } from 'lucide-react';

export default function Settings() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [config, setConfig] = useState({
    WABA_BUSINESS_ID: '',
    WABA_TOKEN: '',
    WABA_PHONE_NUMBER_ID: ''
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
        if (item.key === 'WABA_PHONE_NUMBER_ID') newConfig.WABA_PHONE_NUMBER_ID = item.value;
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

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testWhatsAppConnection({
        businessId: config.WABA_BUSINESS_ID,
        token: config.WABA_TOKEN,
        phoneNumberId: config.WABA_PHONE_NUMBER_ID
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    setSaving(true);
    
    try {
      const updates = [
        { key: 'WABA_BUSINESS_ID', value: config.WABA_BUSINESS_ID },
        { key: 'WABA_PHONE_NUMBER_ID', value: config.WABA_PHONE_NUMBER_ID },
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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)' }}>
      <Activity className="animate-spin" size={24} style={{ marginRight: '10px' }} />
      Cargando configuración...
    </div>
  );

  return (
    <div style={{ maxWidth: '800px', paddingBottom: '4rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Configuración</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Gestiona tus credenciales de WhatsApp Business API</p>
      </header>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-color)' }}>
            <Shield size={24} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>Credenciales de Meta</h2>
          </div>
          <a 
            href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ 
              fontSize: '0.8rem', 
              color: 'var(--accent-color)', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px',
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(47, 129, 247, 0.1)'
            }}
          >
            <ExternalLink size={14} />
            Ver Documentación
          </a>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
                WhatsApp Business Account ID
              </label>
              <input 
                type="text" 
                className="input-field" 
                value={config.WABA_BUSINESS_ID}
                onChange={(e) => setConfig({ ...config, WABA_BUSINESS_ID: e.target.value })}
                placeholder="ID de tu cuenta comercial"
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Encontrado en "Identificadores" en el panel de Meta.
              </p>
            </div>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
                Phone Number ID
              </label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  className="input-field" 
                  value={config.WABA_PHONE_NUMBER_ID}
                  onChange={(e) => setConfig({ ...config, WABA_PHONE_NUMBER_ID: e.target.value })}
                  placeholder="ID del número de teléfono"
                />
                <Smartphone size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: 'var(--text-secondary)' }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                ID específico del número emisor.
              </p>
            </div>
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
              background: 'rgba(47, 129, 247, 0.05)', 
              borderRadius: '8px',
              marginTop: '0.5rem',
              border: '1px solid var(--border-color)'
            }}>
              <Info size={16} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                <strong>Seguridad:</strong> El token se guarda cifrado. Nunca lo compartas. Usaremos este token para consultar tus plantillas y enviar los mensajes.
              </p>
            </div>
          </div>

          {testResult && (
            <div style={{ 
              padding: '1rem', 
              borderRadius: '8px', 
              background: testResult.success ? 'rgba(35, 134, 54, 0.1)' : 'rgba(218, 54, 51, 0.1)',
              border: `1px solid ${testResult.success ? '#238636' : '#da3633'}`,
              color: testResult.success ? '#238636' : '#da3633',
              fontSize: '0.85rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', marginBottom: '4px' }}>
                {testResult.success ? <CheckCircle2 size={16} /> : <Info size={16} />}
                {testResult.success ? 'Conexión Exitosa' : 'Error de Conexión'}
              </div>
              {testResult.success ? (
                <div>
                   Vinculado a: <strong>{testResult.details.businessName}</strong> ({testResult.details.displayPhoneNumber})
                </div>
              ) : (
                <div>{testResult.error}</div>
              )}
            </div>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={handleTest} 
              disabled={testing || loading}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {testing ? <Activity className="animate-spin" size={18} /> : <Activity size={18} />}
              Probar Conexión
            </button>
            
            <button type="submit" className="btn-primary" disabled={saving || loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {saving ? <Activity className="animate-spin" size={18} /> : <Save size={18} />}
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>

      <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>Guía para obtener credenciales</h3>
        <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'grid', gap: '0.5rem' }}>
          <li>
            1. Entra a <a href="https://developers.facebook.com" target="_blank" style={{ color: 'var(--accent-color)', fontWeight: '600' }}>Meta for Developers</a>.
          </li>
          <li>2. Crea una App de tipo "Business" y añade el producto WhatsApp.</li>
          <li>3. En el menú de WhatsApp, ve a "Configuración" para ver tus IDs de cuenta y teléfono.</li>
          <li>4. Genera un "System User Token" con permisos <strong>whatsapp_business_messaging</strong> y <strong>whatsapp_business_management</strong>.</li>
        </ul>
      </div>

      <style jsx>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
