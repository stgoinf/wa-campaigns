"use client";
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { getTemplates, sendTemplateMessage, getWhatsAppStatus } from './actions';
import { 
  Send, 
  RefreshCw, 
  Image as ImageIcon, 
  Layout, 
  CheckCircle, 
  AlertTriangle,
  Users,
  Play,
  Shield
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
  
  const [sendingStatus, setSendingStatus] = useState('idle'); // idle, sending, finished, cancelled
  const [sendProgress, setSendProgress] = useState({ total: 0, current: 0, success: 0, failed: 0 });
  const [timeStats, setTimeStats] = useState({ elapsed: 0, remaining: 0 });
  const [accountStatus, setAccountStatus] = useState({ loading: true, data: null, error: null });
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Ref to track cancellation
  const cancelRef = useRef(false);

  const formatTime = (seconds) => {
    if (!seconds || seconds === Infinity) return 'Calculando...';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  useEffect(() => {
    fetchTemplates();
    fetchCandidates();
    fetchAccountStatus();
  }, []);

  async function fetchAccountStatus() {
    setAccountStatus(prev => ({ ...prev, loading: true }));
    const res = await getWhatsAppStatus();
    if (res.success) {
      setAccountStatus({ loading: false, data: res.data, error: null });
    } else {
      setAccountStatus({ loading: false, data: null, error: res.error });
    }
  }

  async function sendTestMessage() {
    if (!selectedTemplate || !testPhoneNumber) {
      alert('Por favor selecciona una plantilla e ingresa un número de prueba.');
      return;
    }

    setSendingTest(true);
    try {
      const components = [];
      if (headerImageUrl) {
        components.push({
          type: "header",
          parameters: [{ type: "image", image: { link: headerImageUrl } }]
        });
      }

      const phoneNumberId = accountStatus.data?.id || ''; // We need the ID for sending

      const res = await sendTemplateMessage({
        phone: testPhoneNumber.replace(/\+/g, '').replace(/\s/g, ''),
        templateName: selectedTemplate.name,
        languageCode: selectedTemplate.language,
        components: components
      });

      if (res.success) {
        alert('✅ Mensaje de prueba enviado con éxito a ' + testPhoneNumber);
      } else {
        throw new Error(res.error);
      }
    } catch (error) {
      alert('❌ Error en prueba: ' + error.message);
    } finally {
      setSendingTest(false);
    }
  }

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

  const stopBulkSend = () => {
    cancelRef.current = true;
    setSendingStatus('cancelled');
  };

  const startBulkSend = async () => {
    if (!selectedTemplate) return alert('Selecciona una plantilla');
    if (candidates.length === 0) return alert('No hay clientes seleccionados');

    setSendingStatus('sending');
    cancelRef.current = false;
    setSendProgress({ total: candidates.length, current: 0, success: 0, failed: 0 });
    
    const startTime = Date.now();
    const batchSize = 5;
    
    // Fetch Phone Number ID once
    const { data: configRows } = await supabase.from('configuracion').select('value').eq('key', 'WABA_PHONE_NUMBER_ID').single();
    const phoneNumberId = configRows?.value;

    if (!phoneNumberId) {
      alert('Error: Phone Number ID no configurado en los ajustes.');
      setSendingStatus('idle');
      return;
    }

    // Process in batches
    for (let i = 0; i < candidates.length; i += batchSize) {
      if (cancelRef.current) break;

      const chunk = candidates.slice(i, i + batchSize);
      
      const results = await Promise.all(chunk.map(async (client) => {
        // Build components
        const components = [];
        if (headerImageUrl) {
          components.push({
            type: "header",
            parameters: [{ type: "image", image: { link: headerImageUrl } }]
          });
        }

        const res = await sendTemplateMessage({
          phone: client.telefono,
          templateName: selectedTemplate.name,
          languageCode: selectedTemplate.language,
          components: components,
          phoneNumberId: phoneNumberId
        });

        // Register in DB
        await supabase.from('registro_envios').insert({
          telefono: client.telefono,
          template_name: selectedTemplate.name,
          status: res.success ? 'sent' : 'failed',
          error_message: res.error || null
        });

        return res.success;
      }));

      // Update progress
      const currentSent = i + chunk.length;
      const successfulInBatch = results.filter(r => r).length;
      const failedInBatch = chunk.length - successfulInBatch;

      setSendProgress(prev => ({
        ...prev,
        current: currentSent,
        success: prev.success + successfulInBatch,
        failed: prev.failed + failedInBatch
      }));

      // Update Time Estimation
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      const avgTimePerMsg = elapsed / currentSent;
      const remaining = avgTimePerMsg * (candidates.length - currentSent);
      
      setTimeStats({ 
        elapsed: Math.round(elapsed), 
        remaining: Math.round(remaining) 
      });

      // Small throttle to stay safe correctly
      await new Promise(r => setTimeout(r, 100));
    }

    if (!cancelRef.current) {
      setSendingStatus('finished');
    }
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

            {/* Test Individual Message */}
            {selectedTemplate && (
              <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'rgba(47, 129, 247, 0.05)', borderRadius: '12px', border: '1px dashed var(--accent-color)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Smartphone size={16} />
                  Enviar Prueba Individual
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Ej: 18095551234" 
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    style={{ flex: 1, fontSize: '0.8rem', padding: '8px' }}
                  />
                  <button 
                    className="btn-primary" 
                    onClick={sendTestMessage}
                    disabled={sendingTest || !testPhoneNumber}
                    style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '8px 12px' }}
                  >
                    {sendingTest ? 'Enviando...' : 'Probar ahora'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Step 2: Media Header */}
          <section className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <ImageIcon size={24} color="var(--accent-color)" />
              <h2 style={{ fontSize: '1.2rem', fontWeight: '600' }}>2. Header de Imagen (Opcional)</h2>
            </div>
            
            <div style={{ display: 'grid', gap: '1.5rem' }}>
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
                    border: '1px solid var(--border-color)',
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0
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
                    Si tu plantilla soporta un header de imagen, sube un archivo o pega una URL pública.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="file" 
                      id="headerUpload" 
                      hidden 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                    />
                    <button 
                      className="btn-primary" 
                      style={{ background: 'var(--surface-hover)', color: 'white', border: '1px solid var(--border-color)', fontSize: '0.8rem', padding: '8px 16px' }}
                      onClick={() => document.getElementById('headerUpload').click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? 'Subiendo...' : 'Subir Archivo'}
                    </button>
                    {headerImageUrl && (
                      <button 
                        className="btn-secondary" 
                        style={{ fontSize: '0.8rem', padding: '8px 16px', color: '#da3633', border: '1px solid #da3633' }}
                        onClick={() => setHeaderImageUrl('')}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  O pega aquí la URL de la imagen:
                </label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="https://ejemplo.com/imagen.jpg" 
                  value={headerImageUrl}
                  onChange={(e) => setHeaderImageUrl(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
            </div>
          </section>

        </div>

        {/* Right Column: Execution */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <section className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={20} />
              Estado de Campaña
            </h3>
            <div style={{ background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Seleccionados</p>
                <p style={{ fontSize: '1.2rem', fontWeight: '700' }}>{candidates.length}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>En Cola</p>
                <p style={{ fontSize: '1.2rem', fontWeight: '700' }}>{candidates.length - sendProgress.current}</p>
              </div>
            </div>

            {sendingStatus === 'sending' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '1.5rem', background: 'rgba(47, 129, 247, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Tiempo Transcurrido:</span>
                    <span style={{ fontWeight: '600' }}>{formatTime(timeStats.elapsed)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Tiempo Restante:</span>
                    <span style={{ fontWeight: '600', color: 'var(--accent-color)' }}>{formatTime(timeStats.remaining)}</span>
                  </div>
                </div>

                <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 1.5rem', color: 'var(--accent-color)' }} />
                <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Procesando envíos...</h4>
                
                <div style={{ width: '100%', height: '10px', background: 'var(--surface-hover)', borderRadius: '5px', overflow: 'hidden', marginBottom: '1rem', position: 'relative', border: '1px solid var(--border-color)' }}>
                  <div style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-color), #4facfe)', transition: 'width 0.4s ease' }}></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.75rem', marginBottom: '2rem' }}>
                  <div style={{ padding: '8px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>Total</p>
                    <p style={{ fontWeight: '700' }}>{sendProgress.current}</p>
                  </div>
                  <div style={{ padding: '8px', background: 'rgba(35, 134, 54, 0.1)', borderRadius: '8px', color: '#238636' }}>
                    <p>Éxito</p>
                    <p style={{ fontWeight: '700' }}>{sendProgress.success}</p>
                  </div>
                  <div style={{ padding: '8px', background: 'rgba(218, 54, 51, 0.1)', borderRadius: '8px', color: '#da3633' }}>
                    <p>Error</p>
                    <p style={{ fontWeight: '700' }}>{sendProgress.failed}</p>
                  </div>
                </div>

                <button 
                  className="btn-secondary" 
                  style={{ width: '100%', color: '#da3633', border: '1px solid #da3633', background: 'transparent' }} 
                  onClick={stopBulkSend}
                >
                  Detener Campaña
                </button>
              </div>
            ) : sendingStatus === 'finished' ? (
              <div style={{ textAlign: 'center' }}>
                <CheckCircle size={48} style={{ margin: '0 auto 1rem', color: '#238636' }} />
                <h4 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>Envío Finalizado</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  Se procesaron {sendProgress.total} contactos en {formatTime(timeStats.elapsed)}.
                </p>
                <button className="btn-primary" style={{ width: '100%' }} onClick={() => setSendingStatus('idle')}>
                  Nueva Campaña
                </button>
              </div>
            ) : sendingStatus === 'cancelled' ? (
              <div style={{ textAlign: 'center' }}>
                <AlertTriangle size={48} style={{ margin: '0 auto 1rem', color: '#d29922' }} />
                <h4 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>Campaña Detenida</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  El proceso fue cancelado manualmente.
                </p>
                <button className="btn-primary" style={{ width: '100%' }} onClick={() => setSendingStatus('idle')}>
                  Reiniciar
                </button>
              </div>
            ) : (
              <button 
                className="btn-primary" 
                style={{ width: '100%', padding: '15px', fontSize: '1rem', fontWeight: '700' }} 
                onClick={startBulkSend}
                disabled={!selectedTemplate || candidates.length === 0}
              >
                <Play size={20} strokeWidth={3} />
                Iniciar Envío Masivo
              </button>
            )}
          </section>

          <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(47, 129, 247, 0.02)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Shield size={18} color="var(--accent-color)" />
                Estado Real (Meta)
              </h4>
              <button 
                onClick={fetchAccountStatus} 
                disabled={accountStatus.loading}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '4px' }}
                title="Actualizar estado"
              >
                <RefreshCw size={14} className={accountStatus.loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {accountStatus.loading ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Consultando Meta API...</p>
              ) : accountStatus.error ? (
                <div style={{ padding: '0.75rem', background: 'rgba(218, 54, 51, 0.05)', borderRadius: '8px', border: '1px solid rgba(218, 54, 51, 0.1)', color: '#da3633', fontSize: '0.75rem' }}>
                  No se pudo cargar el estado: {accountStatus.error}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Línea:</span>
                    <span style={{ fontWeight: '600' }}>{accountStatus.data.name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Calidad:</span>
                    <span style={{ 
                      fontWeight: '700', 
                      color: accountStatus.data.quality === 'GREEN' ? '#238636' : accountStatus.data.quality === 'YELLOW' ? '#d29922' : '#da3633',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: accountStatus.data.quality === 'GREEN' ? '#238636' : accountStatus.data.quality === 'YELLOW' ? '#d29922' : '#da3633' }}></div>
                      {accountStatus.data.quality}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                    <span style={{ fontWeight: '600', color: accountStatus.data.status === 'CONNECTED' ? '#238636' : '#da3633' }}>
                      {accountStatus.data.status}
                    </span>
                  </div>

                  {accountStatus.data.quality === 'RED' && (
                    <div style={{ padding: '0.75rem', background: 'rgba(218, 54, 51, 0.1)', borderRadius: '8px', border: '1px solid #da3633' }}>
                      <p style={{ fontSize: '0.7rem', color: '#da3633', fontWeight: '600', margin: 0 }}>
                        ⚠ ALERTA: La calidad es BAJA. El envío masivo podría ser bloqueado por Meta. 
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

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
