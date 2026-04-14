"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import Papa from 'papaparse';
import { 
  Search, 
  Filter, 
  Calendar, 
  Store, 
  MessageSquare, 
  ChevronLeft, 
  ChevronRight,
  UserCheck,
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight
} from 'lucide-react';

export default function Clientes() {
  const supabase = createClient();

  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [sucursales, setSucursales] = useState([]);
  const [selectedSucursal, setSelectedSucursal] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhones, setSelectedPhones] = useState([]);
  
  // Import CSV Stats
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState(1); // 1: Upload, 2: Mapping, 3: Success
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [mapping, setMapping] = useState({
    telefono: '',
    nombre_sucursal: '',
    fecha_ultimo_pedido: '',
    cantidad_pedidos: ''
  });
  const [isImporting, setIsImporting] = useState(false);
  const [importStats, setImportStats] = useState({ total: 0, success: 0, error: 0 });
  const [failedRows, setFailedRows] = useState([]);

  const downloadErrorReport = () => {
    if (failedRows.length === 0) return;
    
    // Convert failed rows to CSV
    const headers = [...Object.keys(failedRows[0].data), 'Motivo del Error'];
    const csvContent = [
      headers.join(','),
      ...failedRows.map(f => {
        const rowData = Object.values(f.data).map(val => `"${val || ''}"`).join(',');
        return `${rowData},"${f.error}"`;
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `errores_importacion_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const normalizePhone = (phone) => {
    if (!phone) return '';
    // Remove non-numeric
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // If it has 10 digits (e.g. 8098207141), prepend 1
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    // If it's already 11 and starts with 1, keep it (like 18098207141)
    return cleaned;
  };

  
  // Pagination
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchSucursales();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClientes();
    }, 300); // Debounce search
    return () => clearTimeout(timer);
  }, [selectedSucursal, dateFrom, searchQuery, page]);


  async function fetchSucursales() {
    const { data, error } = await supabase
      .from('clientes')
      .select('nombre_sucursal')
      .neq('nombre_sucursal', null);
    
    if (data) {
      const unique = [...new Set(data.map(i => i.nombre_sucursal))].sort();
      setSucursales(unique);
    }
  }

  async function fetchClientes() {
    setLoading(true);
    try {
      let query = supabase
        .from('clientes')
        .select('*', { count: 'exact' });

      if (selectedSucursal !== 'all') {
        query = query.eq('nombre_sucursal', selectedSucursal);
      }

      if (dateFrom) {
        query = query.gte('fecha_ultimo_pedido', dateFrom);
      }

      if (searchQuery) {
        query = query.ilike('telefono', `%${searchQuery}%`);
      }


      const { data, count, error } = await query
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('fecha_ultimo_pedido', { ascending: false });

      if (error) throw error;
      setClientes(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching customers:', error.message);
    } finally {
      setLoading(false);
    }
  }

  const toggleSelect = (phone) => {
    if (selectedPhones.includes(phone)) {
      setSelectedPhones(selectedPhones.filter(p => p !== phone));
    } else {
      setSelectedPhones([...selectedPhones, phone]);
    }
  };

  const selectAll = () => {
    if (selectedPhones.length === clientes.length) {
      setSelectedPhones([]);
    } else {
      setSelectedPhones(clientes.map(c => c.telefono));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Base de Clientes</h1>
            <span style={{ 
              background: 'rgba(47, 129, 247, 0.1)', 
              color: 'var(--accent-color)', 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '0.85rem', 
              fontWeight: '700',
              marginTop: '0.5rem'
            }}>
              {totalCount.toLocaleString()} teléfonos
            </span>
            <button 
              className="btn-primary" 
              onClick={() => { setImportStep(1); setShowImportModal(true); }}
              style={{ marginLeft: '1rem', gap: '0.5rem', height: 'fit-content', alignSelf: 'center', padding: '10px 16px' }}
            >
              <Upload size={18} />
              Cargar Clientes
            </button>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Filtra y selecciona clientes para tus campañas de WhatsApp.</p>
        </div>
        
        {selectedPhones.length > 0 && (
          <button className="btn-primary" style={{ gap: '0.5rem' }}>
            <MessageSquare size={18} />
            Enviar a {selectedPhones.length} seleccionados
          </button>
        )}
      </header>

      {/* Filters & Search */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 2, minWidth: '300px', position: 'relative' }}>
          <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px' }} />
          <input 
            type="text" 
            className="input-field" 
            placeholder="Buscar por número de teléfono..." 
            style={{ paddingLeft: '40px', width: '100%' }}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '200px' }}>

          <Store size={18} color="var(--text-secondary)" />
          <select 
            className="input-field" 
            style={{ padding: '8px 12px' }}
            value={selectedSucursal}
            onChange={(e) => { setSelectedSucursal(e.target.value); setPage(0); }}
          >
            <option value="all">Todas las sucursales</option>
            {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '250px' }}>
          <Calendar size={18} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Desde:</span>
          <input 
            type="date" 
            className="input-field" 
            style={{ padding: '8px 12px' }}
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <Filter size={16} />
          <span>Filtros activos</span>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '1rem', width: '40px' }}>
                <input 
                  type="checkbox" 
                  checked={selectedPhones.length > 0 && selectedPhones.length === clientes.length}
                  onChange={selectAll}
                />
              </th>
              <th style={{ padding: '1.25rem', fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Teléfono</th>
              <th style={{ padding: '1.25rem', fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Sucursal</th>
              <th style={{ padding: '1.25rem', fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Último Pedido</th>
              <th style={{ padding: '1.25rem', fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pedidos</th>
              <th style={{ padding: '1.25rem', fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Cargando clientes...
                </td>
              </tr>
            ) : clientes.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No se encontraron clientes con estos filtros.
                </td>
              </tr>
            ) : (
              clientes.map((cliente) => (
                <tr key={cliente.telefono} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s ease' }} className="table-row-hover">
                  <td style={{ padding: '1rem' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedPhones.includes(cliente.telefono)}
                      onChange={() => toggleSelect(cliente.telefono)}
                    />
                  </td>
                  <td style={{ padding: '1.25rem', fontWeight: '600' }}>{cliente.telefono}</td>
                  <td style={{ padding: '1.25rem', color: 'var(--text-secondary)' }}>{cliente.nombre_sucursal}</td>
                  <td style={{ padding: '1.25rem' }}>{new Date(cliente.fecha_ultimo_pedido).toLocaleDateString('es-DO')}</td>
                  <td style={{ padding: '1.25rem' }}>
                    <span style={{ background: 'var(--surface-hover)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>
                      {cliente.cantidad_pedidos}
                    </span>
                  </td>
                  <td style={{ padding: '1.25rem' }}>
                    <button style={{ background: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.85rem' }}>
                      Ver Historial
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Placeholder */}
        <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Mostrando <strong>{clientes.length}</strong> de <strong>{totalCount}</strong> teléfonos encontrados
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="btn-secondary" 
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              style={{ padding: '6px 12px', background: 'var(--surface-hover)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '6px 12px', background: 'var(--surface-hover)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .table-row-hover:hover {
          background-color: rgba(255, 255, 255, 0.02);
        }
      `}</style>

      {/* Import CSV Modal */}
      {showImportModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '2rem'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2.5rem', position: 'relative' }}>
            <button 
              onClick={() => setShowImportModal(false)}
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={24} />
            </button>

            {importStep === 1 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: 'var(--surface-hover)', width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)' }}>
                  <Upload size={32} />
                </div>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Subir Archivo CSV</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Selecciona tu base de datos para mapear las columnas.</p>
                
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        complete: (results) => {
                          setCsvHeaders(results.meta.fields);
                          setCsvRows(results.data);
                          setImportStep(2);
                        }
                      });
                    }
                  }}
                  id="csv-upload"
                  hidden
                />
                <button 
                  className="btn-primary" 
                  onClick={() => document.getElementById('csv-upload').click()}
                  style={{ width: '100%', padding: '15px' }}
                >
                  Seleccionar CSV
                </button>
              </div>
            )}

            {importStep === 2 && (
              <div>
                <h2 style={{ fontSize: '1.3rem', marginBottom: '1.5rem' }}>Relacionar Columnas</h2>
                <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
                  {[
                    { key: 'telefono', label: '📞 Teléfono (Obligatorio)', hint: 'Se guardará como 1809XXXXXXX' },
                    { key: 'nombre_sucursal', label: '🏪 Sucursal', hint: 'Nombre del local' },
                    { key: 'fecha_ultimo_pedido', label: '📅 Último Pedido', hint: 'Fecha de la compra' },
                    { key: 'cantidad_pedidos', label: '🔢 Total Pedidos', hint: 'Número de compras' }
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                        {field.label}
                      </label>
                      <select 
                        className="input-field"
                        style={{ width: '100%' }}
                        value={mapping[field.key]}
                        onChange={(e) => setMapping({...mapping, [field.key]: e.target.value})}
                      >
                        <option value="">Selecciona columna...</option>
                        <option value="skip" style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>-- Omitir campo --</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{field.hint}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn-secondary" onClick={() => setImportStep(1)} style={{ flex: 1 }}>Atrás</button>
                  <button 
                    className="btn-primary" 
                    disabled={!mapping.telefono || isImporting}
                    style={{ flex: 2 }}
                    onClick={async () => {
                      setIsImporting(true);
                      setFailedRows([]);
                      let success = 0;
                      let error = 0;
                      let currentFailed = [];
                      
                      // Process in batches
                      const batchSize = 100;
                      for (let i = 0; i < csvRows.length; i += batchSize) {
                        const batch = csvRows.slice(i, i + batchSize);
                        const formatted = batch.map(row => {
                          const rowErrors = [];
                          
                          // Mandatory Phone
                          const rawPhone = mapping.telefono && mapping.telefono !== 'skip' ? row[mapping.telefono] : null;
                          const phone = normalizePhone(rawPhone);
                          
                          if (!phone || phone.length < 10) {
                            rowErrors.push('Teléfono inválido/vacío');
                          }

                          // Optional Fields
                          const sucursal = mapping.nombre_sucursal && mapping.nombre_sucursal !== 'skip' ? row[mapping.nombre_sucursal] : null;
                          const fechaRaw = mapping.fecha_ultimo_pedido && mapping.fecha_ultimo_pedido !== 'skip' ? row[mapping.fecha_ultimo_pedido] : null;
                          const cantidadRaw = mapping.cantidad_pedidos && mapping.cantidad_pedidos !== 'skip' ? row[mapping.cantidad_pedidos] : null;

                          let fecha = null;
                          if (fechaRaw) {
                            const d = new Date(fechaRaw);
                            if (isNaN(d.getTime())) {
                              rowErrors.push(`Fecha inválida: "${fechaRaw}"`);
                            } else {
                              fecha = d.toISOString();
                            }
                          }

                          let cantidad = 0;
                          if (cantidadRaw) {
                            cantidad = parseInt(cantidadRaw, 10);
                            if (isNaN(cantidad)) {
                              rowErrors.push(`Cantidad no es número: "${cantidadRaw}"`);
                            }
                          }

                          if (rowErrors.length > 0) {
                            currentFailed.push({ data: row, error: rowErrors.join(' | ') });
                            return null;
                          }

                          return {
                            telefono: phone,
                            nombre_sucursal: sucursal || null,
                            fecha_ultimo_pedido: fecha,
                            cantidad_pedidos: cantidad
                          };
                        }).filter(Boolean);

                        error += (batch.length - formatted.length);

                        if (formatted.length > 0) {
                          const { error: upsertError } = await supabase
                            .from('clientes')
                            .upsert(formatted, { onConflict: 'telefono' });
                          
                          if (upsertError) {
                            let simpleError = 'Error de sistema';
                            if (upsertError.message.includes('duplicate')) simpleError = 'Teléfono duplicado';
                            if (upsertError.message.includes('invalid input syntax')) simpleError = 'Formato de dato incorrecto en DB';
                            
                            batch.forEach(row => currentFailed.push({ data: row, error: `${simpleError}: ${upsertError.message}` }));
                            error += formatted.length;
                          } else {
                            success += formatted.length;
                          }
                        }
                      }

                      setFailedRows(currentFailed);
                      setImportStats({ total: csvRows.length, success, error });
                      setImportStep(3);
                      setIsImporting(false);
                      fetchClientes(); // Refresh list
                    }}
                  >
                    {isImporting ? 'Procesando...' : `Importar ${csvRows.length} filas`}
                  </button>
                </div>
              </div>
            )}

            {importStep === 3 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: 'rgba(35, 134, 54, 0.1)', width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#238636' }}>
                  <CheckCircle2 size={32} />
                </div>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>¡Importación Finalizada!</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                  <div style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Exitosos</p>
                    <p style={{ fontSize: '1.2rem', fontWeight: '700', color: '#238636' }}>{importStats.success}</p>
                  </div>
                  <div style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Errores</p>
                    <p style={{ fontSize: '1.2rem', fontWeight: '700', color: importStats.error > 0 ? '#da3633' : 'var(--text-secondary)' }}>{importStats.error}</p>
                  </div>
                </div>

                {importStats.error > 0 && (
                  <button 
                    className="btn-secondary" 
                    onClick={downloadErrorReport}
                    style={{ width: '100%', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#da3633', borderColor: '#da3633' }}
                  >
                    <Upload size={18} style={{ transform: 'rotate(180deg)' }} />
                    Descargar reporte de errores ({importStats.error})
                  </button>
                )}

                <button className="btn-primary" onClick={() => setShowImportModal(false)} style={{ width: '100%' }}>
                  Cerrar y Ver Clientes
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
