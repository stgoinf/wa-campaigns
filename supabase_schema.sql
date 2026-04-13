-- Tablas para el Sistema de Envios Masivos Domino's

-- 1. Tabla de Configuración (Para Token y Business ID)
-- Almacenamos esto en una tabla para que sea persistente y configurable desde la UI
CREATE TABLE IF NOT EXISTS configuracion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insertar placeholders para las llaves necesarias
INSERT INTO configuracion (key, value) VALUES 
('WABA_BUSINESS_ID', 'tu_business_id_aqui'),
('WABA_TOKEN', 'tu_token_aqui')
ON CONFLICT (key) DO NOTHING;

-- 2. Tabla de Clientes
CREATE TABLE IF NOT EXISTS clientes (
  telefono TEXT PRIMARY KEY,
  nombre_sucursal TEXT,
  fecha_ultimo_pedido DATE,
  cantidad_pedidos INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Plantillas (Templates) - Cache opcional
CREATE TABLE IF NOT EXISTS plantillas (
  id TEXT PRIMARY KEY, -- El nombre o ID de Meta
  nombre TEXT NOT NULL,
  idioma TEXT DEFAULT 'es',
  header_type TEXT, -- 'IMAGE', 'TEXT', 'NONE'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Registro de Envíos Masivos
-- Para filtrar quién ya recibió qué y cuándo
CREATE TABLE IF NOT EXISTS registro_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono TEXT REFERENCES clientes(telefono),
  template_name TEXT,
  status TEXT DEFAULT 'pending', -- 'sent', 'delivered', 'failed'
  error_message TEXT,
  fecha_envio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Habilitar RLS (Row Level Security) - Por ahora básico para desarrollo
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro_envios ENABLE ROW LEVEL SECURITY;

-- Políticas temporales (Permitir todo a usuarios autenticados)
-- IMPORTANTE: En producción ajustar según el rol
CREATE POLICY "Allow all for authenticated users" ON configuracion FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated users" ON clientes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated users" ON plantillas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated users" ON registro_envios FOR ALL USING (auth.role() = 'authenticated');
