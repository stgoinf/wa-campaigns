"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { getTemplates, sendTemplateMessage } from './actions';
import { 
  Send, 
  RefreshCw, 
  Image as ImageIcon, 
  Layout, 
  CheckCircle, 
  AlertTriangle,
  Users,
  Play
} from 'lucide-react';

export default function BulkSend() {
  const supabase = createClient();

  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  
  const [headerImageUrl, setHeaderImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const [sendingStatus, setSendingStatus] = useState('idle'); // idle, sending, finished
  const [sendProgress, setSendProgress] = useState({ total: 0, current: 0, success: 0, failed: 0 });

  useEffect(() => {
    fetchTemplates();
    fetchCandidates();
  }, []);

  async function fetchTemplates() {
    setLoadingTemplates(true);
    const res = await getTemplates();
    if (res.success) {
      setTemplates(res.templates);
    }
    setLoadingTemplates(false);
  }

  async function fetchCandidates() {
    setLoadingCandidates(true);
    // Get all clients by default for the bulk send module
    const { data } = await supabase.from('clientes').select('*');
    setCandidates(data || []);
    setLoadingCandidates(false);
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const fileName = `whatsapp-headers/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('public-assets')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('public-assets')
        .getPublicUrl(fileName);

      setHeaderImageUrl(publicUrl);
    } catch (error) {
      alert('Error al subir imagen: ' + error.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const startBulkSend = async () => {
    if (!selectedTemplate) return alert('Selecciona una plantilla');
    if (candidates.length === 0) return alert('No hay clientes seleccionados');

    setSendingStatus('sending');
    setSendProgress({ total: candidates.length, current: 0, success: 0, failed: 0 });

    for (const client of candidates) {
      // Build components (Header image if needed)
      const components = [];
      if (headerImageUrl) {
        components.push({
          type: "header",
          parameters: [
            {
              type: "image",
              image: { link: headerImageUrl }
            }
          ]
        });
      }

      // Fetch Phone Number ID from config
      const { data: configRows } = await supabase.from('configuracion').select('value').eq('key', 'WABA_PHONE_NUMBER_ID').single();
      const phoneNumberId = configRows?.value;

      const res = await sendTemplateMessage({
        phone: client.telefono,
        templateName: selectedTemplate.name,
        languageCode: selectedTemplate.language,
        components: components,
        phoneNumberId: phoneNumberId // Used dynamic ID from DB
      });

      // Update progress
      setSendProgress(prev => ({
        ...prev,
        current: prev.current + 1,
        success: res.success ? prev.success + 1 : prev.success,
        failed: !res.success ? prev.failed + 1 : prev.failed
      }));

      // Register in DB
      await supabase.from('registro_envios').insert({
        telefono: client.telefono,
        template_name: selectedTemplate.name,
        status: res.success ? 'sent' : 'failed',
        error_message: res.error || null
      });

      // Simple delay to avoid rate limits
      await new Promise(r => setTimeout(r, 200));
    }

    setSendingStatus('finished');
  };

  return (
    <div style={{ maxWidth: '1000px' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Envío Masivo</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Configura tu campaña y envía mensajes masivos con plantillas aprobadas.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
        
        {/* Left Column: Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Step 1: Select Template */}
          <section className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Layout size={24} color="var(--accent-color)" />
                <h2 style={{ fontSize: '1.2rem', fontWeight: '600' }}>1. Seleccionar Plantilla</h2>
              </div>
              <button className="btn-secondary" onClick={fetchTemplates} disabled={loadingTemplates} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <RefreshCw size={18} className={loadingTemplates ? 'animate-spin' : ''} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: '1rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {templates.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                  {loadingTemplates ? 'Cargando plantillas...' : 'No se encontraron plantillas aprobadas.'}
                </p>
              ) : (
                templates.map(tmp => (
                  <div 
                    key={tmp.id} 
                    onClick={() => setSelectedTemplate(tmp)}
                    style={{ 
                      padding: '1rem', 
                      borderRadius: 'var(--radius-md)', 
                      border: `2px solid ${selectedTemplate?.id === tmp.id ? 'var(--accent-color)' : 'var(--border-color)'}`,
                      background: selectedTemplate?.id === tmp.id ? 'rgba(47, 129, 247, 0.05)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{tmp.name}</span>
                      <span style={{ fontSize: '0.7rem', background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: '4px' }}>{tmp.language}</span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {tmp.components.find(c => c.type === 'BODY')?.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Step 2: Media Header */}
          <section className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <ImageIcon size={24} color="var(--accent-color)" />
              <h2 style={{ fontSize: '1.2rem', fontWeight: '600' }}>2. Header de Imagen (Opcional)</h2>
            </div>
            
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <div 
                style={{ 
                  width: '120px', 
                  height: '120px', 
                  background: 'var(--surface-hover)', 
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px dashed var(--border-color)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {headerImageUrl ? (
                  <img src={headerImageUrl} alt="Header" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <ImageIcon size={32} color="var(--text-secondary)" />
                )}
              </div>
              
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Si tu plantilla soporta un header de imagen, sube el archivo aquí. Se generará una URL pública automáticamente.
                </p>
                <input 
                  type="file" 
                  id="headerUpload" 
                  hidden 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                />
                <button 
                  className="btn-primary" 
                  style={{ background: 'var(--surface-hover)', color: 'white', border: '1px solid var(--border-color)' }}
                  onClick={() => document.getElementById('headerUpload').click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? 'Subiendo...' : 'Subir Imagen'}
                </button>
              </div>
            </div>
          </section>

        </div>

        {/* Right Column: Execution */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <section className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={20} />
              Audiencia
            </h3>
            <div style={{ background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Clientes seleccionados:</p>
              <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{candidates.length}</p>
            </div>

            {sendingStatus === 'sending' ? (
              <div style={{ textAlign: 'center' }}>
                <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--accent-color)' }} />
                <h4 style={{ marginBottom: '0.5rem' }}>Enviando mensajes...</h4>
                <div style={{ width: '100%', height: '8px', background: 'var(--surface-hover)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%`, height: '100%', background: 'var(--accent-color)' }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>{sendProgress.current} / {sendProgress.total}</span>
                  <span style={{ color: '#238636' }}>Exitosos: {sendProgress.success}</span>
                  <span style={{ color: '#da3633' }}>Fallidos: {sendProgress.failed}</span>
                </div>
              </div>
            ) : sendingStatus === 'finished' ? (
              <div style={{ textAlign: 'center' }}>
                <CheckCircle size={32} style={{ margin: '0 auto 1rem', color: '#238636' }} />
                <h4 style={{ marginBottom: '1rem' }}>Envío Finalizado</h4>
                <button className="btn-primary" style={{ width: '100%' }} onClick={() => setSendingStatus('idle')}>
                  Nueva Campaña
                </button>
              </div>
            ) : (
              <button 
                className="btn-primary" 
                style={{ width: '100%', padding: '15px', fontSize: '1rem' }} 
                onClick={startBulkSend}
                disabled={!selectedTemplate || candidates.length === 0}
              >
                <Play size={20} strokeWidth={3} />
                Iniciar Envío Masivo
              </button>
            )}
          </section>

          <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', background: 'rgba(255, 170, 0, 0.05)', border: '1px solid rgba(255, 170, 0, 0.2)', display: 'flex', gap: '0.75rem' }}>
            <AlertTriangle size={20} style={{ color: '#d29922', shrink: 0 }} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <strong>Importante:</strong> WhatsApp limita el envío masivo según tu nivel de calidad. Asegúrate de que tu plantilla sea relevante para evitar bloqueos.
            </p>
          </div>

        </div>

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

function Loader2({ size, className, style }) {
  return (
    <RefreshCw size={size} className={className} style={{ ...style }} />
  );
}
