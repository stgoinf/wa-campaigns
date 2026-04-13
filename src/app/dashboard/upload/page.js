"use client";
import { useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function UploadCSV() {
  const supabase = createClient();

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, parsing, uploading, success, error
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ total: 0, inserted: 0, updated: 0, errors: 0 });
  const [errorMessage, setErrorMessage] = useState('');

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      setFile(droppedFile);
    } else {
      alert('Por favor sube un archivo CSV válido.');
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) setFile(selectedFile);
  };

  const processCSV = () => {
    if (!file) return;

    setStatus('parsing');
    setResults({ total: 0, inserted: 0, updated: 0, errors: 0 });
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        if (rows.length === 0) {
          setStatus('error');
          setErrorMessage('El archivo CSV está vacío.');
          return;
        }

        setStatus('uploading');
        setResults(prev => ({ ...prev, total: rows.length }));
        
        // Process in batches of 100 to avoid Supabase/Network limits
        const batchSize = 100;
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          
          // Map CSV columns to Database columns
          // Expected columns based on user sample: Fecha, Telefono, Nombre Sucursal, Cantidad de pedidos
          const formattedBatch = batch.map(row => ({
            telefono: row['Telefono']?.toString().trim(),
            nombre_sucursal: row['Nombre Sucursal'],
            fecha_ultimo_pedido: parseDate(row['Fecha']),
            cantidad_pedidos: parseInt(row['Cantidad de pedidos'] || '0', 10)
          })).filter(row => row.telefono);

          if (formattedBatch.length > 0) {
            const { error } = await supabase
              .from('clientes')
              .upsert(formattedBatch, { onConflict: 'telefono' });

            if (error) {
              console.error('Batch error:', error);
              errorCount += formattedBatch.length;
            } else {
              successCount += formattedBatch.length;
            }
          }
          
          const currentProgress = Math.round(((i + batchSize) / rows.length) * 100);
          setProgress(Math.min(currentProgress, 100));
        }

        setResults(prev => ({ ...prev, inserted: successCount, errors: errorCount }));
        setStatus('success');
      },
      error: (err) => {
        setStatus('error');
        setErrorMessage('Error al leer el archivo: ' + err.message);
      }
    });
  };

  // Helper to parse "2 sept 2024" into ISO date
  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      // Basic month mapping for Spanish abbreviations in user sample
      const months = {
        'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'ago': '08', 'sep': '09', 'sept': '09', 'oct': '10', 'nov': '11', 'dic': '12'
      };
      
      const parts = dateStr.toLowerCase().split(' ');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = months[parts[1]] || '01';
        const year = parts[2];
        return `${year}-${month}-${day}`;
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  return (
    <div style={{ maxWidth: '900px' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Cargar Datos</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Sube tu archivo CSV de clientes para actualizar la base de datos.</p>
      </header>

      {status === 'success' ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(35, 134, 54, 0.1)', borderRadius: '50%', color: '#238636', marginBottom: '1.5rem' }}>
            <CheckCircle2 size={48} />
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>¡Carga Completada!</h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '2rem' }}>
            <div>
              <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{results.total}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total procesado</p>
            </div>
            <div>
              <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#238636' }}>{results.inserted}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Exitosos / Upserted</p>
            </div>
            {results.errors > 0 && (
              <div>
                <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#da3633' }}>{results.errors}</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Errores</p>
              </div>
            )}
          </div>
          <button className="btn-primary" onClick={() => { setStatus('idle'); setFile(null); }}>
            Cargar otro archivo
          </button>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '2.5rem' }}>
          <div 
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            style={{ 
              border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '4rem 2rem',
              textAlign: 'center',
              background: isDragging ? 'rgba(47, 129, 247, 0.05)' : 'transparent',
              transition: 'all 0.2s ease',
              marginBottom: '2rem',
              cursor: 'pointer'
            }}
            onClick={() => document.getElementById('fileInput').click()}
          >
            <input 
              type="file" 
              id="fileInput" 
              hidden 
              accept=".csv" 
              onChange={handleFileChange} 
            />
            
            <div style={{ background: 'var(--surface-hover)', width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              {status === 'uploading' || status === 'parsing' ? (
                <Loader2 size={32} className="animate-spin" />
              ) : (
                <Upload size={32} />
              )}
            </div>

            {status === 'uploading' || status === 'parsing' ? (
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                  {status === 'parsing' ? 'Analizando archivo...' : 'Sincronizando con Supabase...'}
                </h3>
                <div style={{ width: '100%', maxWidth: '300px', height: '8px', background: 'var(--surface-hover)', borderRadius: '4px', margin: '1rem auto', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-color)', transition: 'width 0.3s ease' }}></div>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{progress}% completado</p>
              </div>
            ) : file ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                  <FileText size={20} color="var(--accent-color)" />
                  <span style={{ fontWeight: '600' }}>{file.name}</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  {(file.size / 1024).toFixed(2)} KB • Preparado para procesar
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); setFile(null); }} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '10px 20px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button className="btn-primary" onClick={(e) => { e.stopPropagation(); processCSV(); }}>
                    Comenzar Carga
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Haz clic o arrastra un archivo</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Formatos soportados: CSV</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '1rem' }}>
                  Asegúrate de que contenga las columnas: Fecha, Telefono, Nombre Sucursal, Cantidad de pedidos
                </p>
              </>
            )}
          </div>

          {status === 'error' && (
            <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem', background: 'rgba(218, 54, 51, 0.1)', borderRadius: 'var(--radius-md)', color: '#da3633', alignItems: 'center' }}>
              <AlertCircle size={20} />
              <p style={{ fontSize: '0.9rem' }}>{errorMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
