"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { 
  Search, 
  Filter, 
  Calendar, 
  Store, 
  MessageSquare, 
  ChevronLeft, 
  ChevronRight,
  UserCheck
} from 'lucide-react';

export default function Clientes() {
  const supabase = createClient();

  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sucursales, setSucursales] = useState([]);
  const [selectedSucursal, setSelectedSucursal] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [selectedPhones, setSelectedPhones] = useState([]);
  
  // Pagination
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchSucursales();
  }, []);

  useEffect(() => {
    fetchClientes();
  }, [selectedSucursal, dateFrom, page]);

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

      const { data, count, error } = await query
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('fecha_ultimo_pedido', { ascending: false });

      if (error) throw error;
      setClientes(data || []);
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
          <h1 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Base de Clientes</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Filtra y selecciona clientes para tus campañas de WhatsApp.</p>
        </div>
        
        {selectedPhones.length > 0 && (
          <button className="btn-primary" style={{ gap: '0.5rem' }}>
            <MessageSquare size={18} />
            Enviar a {selectedPhones.length} seleccionados
          </button>
        )}
      </header>

      {/* Filters */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
            Mostrando {clientes.length} resultados
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
    </div>
  );
}
