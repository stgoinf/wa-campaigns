export default function Dashboard() {
  const stats = [
    { label: 'Total Clientes', value: '45,231', change: '+12%', icon: '👥' },
    { label: 'Mensajes Enviados', value: '1,204', change: '+5%', icon: '📩' },
    { label: 'Sucursales Activas', value: '18', change: '0', icon: '📍' },
    { label: 'Crédito Estimado', value: '$120.50', change: '-$5.20', icon: '💰' },
  ];

  return (
    <div>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.25rem' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Bienvenido de nuevo al panel de control de Domino's WhatsApp.</p>
      </header>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '1.5rem',
        marginBottom: '2.5rem'
      }}>
        {stats.map((stat, i) => (
          <div key={i} className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ 
                background: 'var(--surface-hover)', 
                width: '40px', 
                height: '40px', 
                borderRadius: '10px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}>
                {stat.icon}
              </div>
              <span style={{ 
                fontSize: '0.8rem', 
                fontWeight: '600', 
                color: stat.change.startsWith('+') ? '#238636' : stat.change === '0' ? 'var(--text-secondary)' : '#da3633',
                background: stat.change.startsWith('+') ? 'rgba(35, 134, 54, 0.15)' : stat.change === '0' ? 'rgba(139, 148, 158, 0.15)' : 'rgba(218, 54, 51, 0.15)',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {stat.change}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>{stat.label}</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stat.value}</h3>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Actividad Reciente</h2>
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No hay envíos registrados recientemente.</p>
        </div>
      </div>
    </div>
  );
}
