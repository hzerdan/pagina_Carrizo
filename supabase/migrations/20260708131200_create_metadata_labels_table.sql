-- 1. Crear la tabla de etiquetas de metadatos
CREATE TABLE IF NOT EXISTS public.metadata_labels (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilitar permisos de acceso para todos los roles en staging
GRANT ALL ON TABLE public.metadata_labels TO anon;
GRANT ALL ON TABLE public.metadata_labels TO authenticated;
GRANT ALL ON TABLE public.metadata_labels TO service_role;

-- 3. Insertar las etiquetas iniciales del catálogo
INSERT INTO public.metadata_labels (key, label) VALUES
('ocs', 'Órdenes de Compra (OCs)'),
('remito', 'Nro. Remito Comercial'),
('pedidos', 'Pedidos Asociados'),
('camion_id', 'ID del Camión (Base de Datos)'),
('chofer_id', 'ID del Chofer (Base de Datos)'),
('domicilio', 'Domicilio de Entrega'),
('localidad', 'Localidad de Entrega'),
('numero_oc', 'Número de Orden de Compra'),
('productos', 'Productos Detallados'),
('dni_chofer', 'DNI del Chofer'),
('acoplado_id', 'ID del Acoplado (Base de Datos)'),
('operador_id', 'ID del Operador (Base de Datos)'),
('cuit_cliente', 'CUIT del Cliente'),
('inspector_id', 'ID del Inspector (Base de Datos)'),
('razon_social', 'Razón Social del Cliente'),
('condicion_iva', 'Condición frente al IVA del Cliente'),
('mision_estado', 'Estado Inicial de la Misión (FSM)'),
('nombre_chofer', 'Nombre Completo del Chofer'),
('numero_pedido', 'Número de Pedido Externo'),
('supervisor_id', 'ID del Supervisor (Base de Datos)'),
('cuit_proveedor', 'CUIT del Proveedor'),
('es_flete_corto', '¿Es Flete Corto?'),
('numero_factura', 'Número de Factura de Venta'),
('patente_chasis', 'Patente del Chasis'),
('telefono_chofer', 'Teléfono de Contacto del Chofer'),
('telefono_origen', 'Teléfono de Origen'),
('dni_chofer_nuevo', 'DNI de Chofer Nuevo'),
('patente_acoplado', 'Patente del Acoplado'),
('peso_total_remito', 'Peso Total del Remito (Toneladas)'),
('protocolo_control', 'Protocolo de Control / Checklist Guardado'),
('instrucciones_texto', 'Texto Completo de Instrucciones Generadas'),
('nombre_chofer_nuevo', 'Nombre de Chofer Nuevo'),
('tara_pesaje_momento', 'Momento para el Pesaje de Tara'),
('bruto_pesaje_momento', 'Momento para el Pesaje de Bruto'),
('celular_chofer_nuevo', 'Celular de Chofer Nuevo'),
('tara_pesaje_lugar_id', 'ID de Balanza / Lugar Pesaje Tara'),
('bruto_pesaje_lugar_id', 'ID de Balanza / Lugar Pesaje Bruto'),
('patente_chasis_valida', '¿Patente de Chasis Válida?'),
('fecha_probable_entrega', 'Fecha Probable de Entrega'),
('telefono_chofer_valido', '¿Teléfono de Chofer Válido?'),
('patente_acoplado_valida', '¿Patente de Acoplado Válida?'),
('tiene_incidencias_carga', '¿Tiene Incidencias Registradas?'),
('debe_pasar_por_reembolse', '¿Debe Pasar por Reembolse?'),
('ultimo_mensaje_chofer_at', 'Último Mensaje del Chofer Registrado'),
('fecha_hora_estimada_carga', 'Fecha y Hora Estimada de Carga'),
('me_planillas_t48_emitidas', '¿Planillas T48 Emitidas?'),
('mi_sobre_cliente_preparado', '¿Sobre del Cliente Preparado?'),
('mi_sobre_proveedor_preparado', '¿Sobre del Proveedor Preparado?'),
('me_checklist_enviado_operario', '¿Checklist Enviado a Operario?')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, updated_at = NOW();
