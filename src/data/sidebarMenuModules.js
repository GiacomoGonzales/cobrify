/**
 * EL CATÁLOGO DEL MENÚ LATERAL: qué módulos puede mostrar u ocultar cada tipo
 * de negocio desde Configuración > Módulos.
 *
 * Es la ÚNICA fuente. Antes el catálogo estaba escrito siete veces dentro de
 * `src/pages/Settings.jsx` (un bloque casi idéntico por modo) y este archivo
 * era un "espejo" que nadie mantenía: General había ganado la Agenda de
 * Citas, Conductores y vehículos, Promociones y Emisión Masiva sin que el
 * espejo se enterara. Hoy lo leen `src/pages/settings/Modulos.jsx` y
 * `src/components/SidebarModulesPicker.jsx`; si un módulo nuevo entra al
 * menú, se agrega acá y en ningún otro lado.
 *
 * ── Estructura ──────────────────────────────────────────────────────────────
 * Cada modo es un array de GRUPOS `{ title?, items: [{ id, label, description }] }`.
 * General (retail) usa grupos con título; los demás modos son un único grupo
 * plano, sin título. El `id` es el `menuId` del item en
 * `src/components/Sidebar.jsx`: si no coinciden, la casilla no oculta nada.
 *
 * ── Cómo funciona la lista de ocultos ───────────────────────────────────────
 * `hiddenMenuItems` trabaja por EXCLUSIÓN: todo se muestra salvo lo que el
 * negocio desmarcó. Por eso un módulo que NACE apagado no puede vivir ahí —
 * lleva `flag`, con el nombre del interruptor booleano que lo gobierna en
 * `businessSettings`. Hoy es solo la Agenda de Citas de General
 * (`appointmentsEnabled`): la pestaña Módulos lee y escribe ese flag en vez
 * de tocar la lista, y sigue siendo UNA casilla, que es lo que el usuario
 * espera ver.
 *
 * ── Ítems que dependen de un módulo opcional ────────────────────────────────
 * Obras (4 páginas, `obrasEnabled`) y Cobranza de servicios (3 páginas,
 * `serviciosEnabled`) solo entran al catálogo cuando el módulo está
 * encendido: si no, se ofrecen casillas para páginas que el menú va a filtrar
 * igual, y parece que la opción no funciona. Se piden con
 * `getMenuModuleGroups(modo, { obrasEnabled, serviciosEnabled })`.
 *
 * Los módulos principales (Dashboard, POS, Ventas, Clientes, Productos,
 * Configuración) siempre están visibles y NO se listan aquí.
 */

// Las cuatro páginas del modo Logística ofrecidas a General como módulo.
const OBRAS = [
  { id: 'projects', label: 'Proyectos / Obras', description: 'Obras y proyectos activos' },
  { id: 'warehouse-exits', label: 'Salidas de Almacén', description: 'Material que sale hacia una obra' },
  { id: 'warehouse-returns', label: 'Retornos a Almacén', description: 'Material que vuelve de la obra' },
  { id: 'logistics-reports', label: 'Reportes de Obra', description: 'Consumo y costo por obra' },
]

// Cobranza de luz o agua por medidor (el negocio que reparte un recibo
// mayorista entre los vecinos).
const SERVICIOS = [
  { id: 'service-supplies', label: 'Suministros', description: 'Padrón de medidores y cuotas fijas' },
  { id: 'service-readings', label: 'Lecturas del mes', description: 'Cobranza de luz o agua por medidor' },
  { id: 'service-receipts', label: 'Recibos de servicio', description: 'Emitir, imprimir y cobrar los recibos del mes' },
]

/**
 * General (retail). Es el único modo con grupos titulados, y el único con
 * ítems que dependen de un módulo opcional.
 */
function gruposRetail({ obrasEnabled = false, serviciosEnabled = false } = {}) {
  return [
    { title: 'Ventas y cobro', items: [
      { id: 'public-catalog', label: 'Mi Catálogo Online', description: 'Catálogo digital para compartir con tus clientes y recibir pedidos' },
      { id: 'online-orders', label: 'Pedidos Online', description: 'Bandeja de pedidos que llegan desde tu catálogo digital' },
      { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja diario' },
      // Nace apagada: la gobierna `appointmentsEnabled`, no la lista de ocultos.
      { id: 'vet-agenda', flag: 'appointmentsEnabled', label: 'Agenda de Citas', description: 'Programa citas por fecha y hora y cóbralas desde el Punto de Venta. Para consultorios, podología, estética, talleres.' },
      { id: 'quotations', label: 'Cotizaciones', description: 'Presupuestos y proformas' },
      { id: 'sellers', label: 'Vendedores', description: 'Gestión de vendedores y comisiones' },
      { id: 'fleet', label: 'Conductores y vehículos', description: 'Guarda conductores y vehículos para elegirlos al emitir guías de remisión' },
      { id: 'promotions', label: 'Promociones', description: 'Tarjeta de sellos, combos y cupones de descuento' },
    ] },
    { title: 'Inventario y almacenes', items: [
      { id: 'inventory', label: 'Inventario', description: 'Control de stock por producto' },
      { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
      { id: 'stock-movements', label: 'Movimientos', description: 'Historial de entradas y salidas' },
    ] },
    { title: 'Compras y proveedores', items: [
      { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
      { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
      { id: 'purchase-history', label: 'Historial de Compras', description: 'Registro de compras de insumos' },
      { id: 'purchase-orders', label: 'Órdenes de Compra', description: 'Pedidos a proveedores' },
      { id: 'requirements', label: 'Requerimientos', description: 'Solicitudes de insumos y materiales' },
    ] },
    { title: 'Producción', items: [
      { id: 'ingredients', label: 'Insumos', description: 'Materia prima y componentes' },
      { id: 'recipes', label: 'Composición', description: 'Productos compuestos' },
      { id: 'production', label: 'Producción', description: 'Producción y transformación de productos' },
    ] },
    { title: 'Guías y envíos', items: [
      { id: 'dispatch-guides', label: 'GRE Remitente', description: 'Guías de remisión como remitente' },
      { id: 'carrier-dispatch-guides', label: 'GRE Transportista', description: 'Guías de remisión como transportista' },
      { id: 'bulk-emission', label: 'Emisión Masiva', description: 'Crear muchos comprobantes o guías de una vez desde un Excel' },
      { id: 'envios', label: 'Envíos', description: 'Gestión de repartidores y entregas' },
    ] },
    ...(obrasEnabled ? [{ title: 'Obras y proyectos', items: OBRAS }] : []),
    { title: 'Finanzas', items: [
      { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
      { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
      { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
      { id: 'accounting', label: 'Contabilidad', description: 'Control de comprobantes electrónicos SUNAT' },
      { id: 'loans', label: 'Préstamos', description: 'Préstamos a clientes' },
    ] },
    { title: 'Operación y otros', items: [
      { id: 'student-payments', label: 'Control de Alumnos', description: 'Control de pagos de alumnos' },
      ...(serviciosEnabled ? SERVICIOS : []),
      { id: 'certificates', label: 'Certificados', description: 'Emisión de certificados' },
      { id: 'attendance', label: 'Personal', description: 'Directorio, asistencia y datos de los empleados' },
      { id: 'complaints', label: 'Libro de Reclamos', description: 'Quejas y reclamaciones de clientes' },
    ] },
  ]
}

const RESTAURANT = [
  { id: 'public-catalog', label: 'Mi Carta Digital', description: 'Carta digital para compartir con tus clientes y recibir pedidos' },
  { id: 'cash-register', label: 'Caja', description: 'Apertura y cierre de caja' },
  { id: 'orders', label: 'Órdenes', description: 'Listado de órdenes activas' },
  { id: 'tables', label: 'Mesas', description: 'Gestión de mesas del local' },
  { id: 'kitchen', label: 'Cocina', description: 'Vista de cocina para preparación' },
  { id: 'promotions', label: 'Promociones', description: 'Tarjeta de sellos, combos y cupones de descuento' },
  { id: 'ingredients', label: 'Ingredientes', description: 'Inventario de ingredientes' },
  { id: 'recipes', label: 'Recetas', description: 'Recetas y composición de platos' },
  { id: 'production', label: 'Producción', description: 'Producción y transformación de platos' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock de productos e ingredientes' },
  { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras a proveedores' },
  { id: 'purchase-history', label: 'Historial de Compras', description: 'Registro de compras de insumos' },
  { id: 'requirements', label: 'Requerimientos', description: 'Solicitudes de insumos y materiales' },
  { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
  { id: 'sellers', label: 'Vendedores', description: 'Gestión de vendedores y comisiones' },
  { id: 'fleet', label: 'Conductores y vehículos', description: 'Guarda conductores y vehículos para elegirlos al emitir guías de remisión' },
  { id: 'waiters', label: 'Mozos', description: 'Gestión de personal de atención' },
  { id: 'envios', label: 'Envíos', description: 'Gestión de repartidores y entregas' },
  { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
  { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
  { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
  { id: 'accounting', label: 'Contabilidad', description: 'Control de comprobantes electrónicos SUNAT' },
  { id: 'attendance', label: 'Personal', description: 'Directorio, asistencia y datos de los empleados' },
  { id: 'complaints', label: 'Libro de Reclamos', description: 'Quejas y reclamaciones de clientes' },
]

const PHARMACY = [
  { id: 'public-catalog', label: 'Mi Catálogo Online', description: 'Catálogo digital para compartir con tus clientes y recibir pedidos' },
  { id: 'online-orders', label: 'Pedidos Online', description: 'Bandeja de pedidos que llegan desde tu catálogo digital' },
  { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja' },
  { id: 'quotations', label: 'Cotizaciones', description: 'Presupuestos y proformas' },
  { id: 'sellers', label: 'Vendedores', description: 'Gestión de vendedores y comisiones' },
  { id: 'fleet', label: 'Conductores y vehículos', description: 'Guarda conductores y vehículos para elegirlos al emitir guías de remisión' },
  { id: 'promotions', label: 'Promociones', description: 'Tarjeta de sellos, combos y cupones de descuento' },
  { id: 'laboratories', label: 'Laboratorios', description: 'Fabricantes de medicamentos' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock' },
  { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
  { id: 'stock-movements', label: 'Movimientos', description: 'Historial de entradas y salidas' },
  { id: 'batch-control', label: 'Control de Lotes', description: 'Gestión de lotes y vencimientos' },
  { id: 'expiry-alerts', label: 'Alertas de Vencimiento', description: 'Productos próximos a vencer' },
  { id: 'suppliers', label: 'Proveedores', description: 'Droguerías y distribuidores' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
  { id: 'dispatch-guides', label: 'GRE Remitente', description: 'Guías de remisión como remitente' },
  { id: 'bulk-emission', label: 'Emisión Masiva', description: 'Crear muchos comprobantes o guías de una vez desde un Excel' },
  { id: 'purchase-orders', label: 'Órdenes de Compra', description: 'Pedidos a proveedores' },
  { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
  { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
  { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
  { id: 'accounting', label: 'Contabilidad', description: 'Control de comprobantes electrónicos SUNAT' },
  { id: 'loans', label: 'Préstamos', description: 'Préstamos a clientes' },
  { id: 'attendance', label: 'Personal', description: 'Directorio, asistencia y datos de los empleados' },
  { id: 'complaints', label: 'Libro de Reclamos', description: 'Quejas y reclamaciones de clientes' },
]

const HOTEL = [
  { id: 'public-catalog', label: 'Mi Catálogo Online', description: 'Catálogo digital para compartir con tus clientes y recibir pedidos' },
  { id: 'hotel-rooms', label: 'Habitaciones', description: 'Gestión de habitaciones y estados' },
  { id: 'hotel-reservations', label: 'Reservas', description: 'Reservas, check-in y check-out' },
  { id: 'online-orders', label: 'Pedidos Online', description: 'Bandeja de pedidos que llegan desde tu carta digital' },
  { id: 'hotel-services', label: 'Servicios', description: 'Piscina, juegos, eventos y áreas' },
  { id: 'hotel-housekeeping', label: 'Housekeeping', description: 'Limpieza y mantenimiento de habitaciones' },
  { id: 'hotel-audit', label: 'Auditoría y Tarifas', description: 'Auditoría nocturna y tarifas por temporada' },
  { id: 'cash-register', label: 'Caja', description: 'Apertura y cierre de caja' },
  { id: 'products', label: 'Productos', description: 'Catálogo de productos y servicios' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock' },
  { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
  { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
  { id: 'expenses', label: 'Gastos', description: 'Control de gastos del hotel' },
  { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
  { id: 'accounting', label: 'Contabilidad', description: 'Control de comprobantes electrónicos SUNAT' },
  { id: 'attendance', label: 'Personal', description: 'Directorio, asistencia y datos de los empleados' },
  { id: 'complaints', label: 'Libro de Reclamos', description: 'Quejas y reclamaciones' },
]

const TRANSPORT = [
  { id: 'public-catalog', label: 'Mi Catálogo Online', description: 'Catálogo digital para compartir con tus clientes y recibir pedidos' },
  { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja diario' },
  { id: 'quotations', label: 'Cotizaciones', description: 'Presupuestos y proformas' },
  { id: 'dispatch-guides', label: 'GRE Remitente', description: 'Guías de remisión como remitente' },
  { id: 'carrier-dispatch-guides', label: 'GRE Transportista', description: 'Guías de remisión como transportista' },
  { id: 'bulk-emission', label: 'Emisión Masiva', description: 'Crear muchos comprobantes o guías de una vez desde un Excel' },
  { id: 'sellers', label: 'Vendedores', description: 'Gestión de vendedores y comisiones' },
  { id: 'fleet', label: 'Conductores y vehículos', description: 'Guarda conductores y vehículos para elegirlos al emitir guías de remisión' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock por producto' },
  { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
  { id: 'stock-movements', label: 'Movimientos', description: 'Historial de entradas y salidas' },
  { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
  { id: 'purchase-history', label: 'Historial de Compras', description: 'Registro de compras de insumos' },
  { id: 'purchase-orders', label: 'Órdenes de Compra', description: 'Pedidos a proveedores' },
  { id: 'requirements', label: 'Requerimientos', description: 'Solicitudes de insumos y materiales' },
  { id: 'ingredients', label: 'Insumos', description: 'Materia prima y componentes' },
  { id: 'recipes', label: 'Composición', description: 'Productos compuestos' },
  { id: 'production', label: 'Producción', description: 'Producción y transformación de productos' },
  { id: 'envios', label: 'Envíos', description: 'Gestión de repartidores y entregas' },
  { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
  { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
  { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
  { id: 'accounting', label: 'Contabilidad', description: 'Control de comprobantes electrónicos SUNAT' },
  { id: 'loans', label: 'Préstamos', description: 'Préstamos a clientes' },
  { id: 'attendance', label: 'Personal', description: 'Directorio, asistencia y datos de los empleados' },
  { id: 'complaints', label: 'Libro de Reclamos', description: 'Quejas y reclamaciones de clientes' },
]

const LOGISTICS = [
  { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja diario' },
  { id: 'projects', label: 'Proyectos / Obras', description: 'Gestión de proyectos y obras activas' },
  { id: 'warehouse-exits', label: 'Salidas de Almacén', description: 'Registro de salidas de materiales a obras' },
  { id: 'warehouse-returns', label: 'Retornos a Almacén', description: 'Registro de retornos desde obras' },
  { id: 'logistics-reports', label: 'Reportes Logísticos', description: 'Historial y estado de inventario por obra' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock por producto' },
  { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
  { id: 'stock-movements', label: 'Movimientos', description: 'Historial de entradas y salidas' },
  { id: 'dispatch-guides', label: 'Guías de Remisión', description: 'Guías de remisión SUNAT' },
  { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
  { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
  { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
  { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
  { id: 'accounting', label: 'Contabilidad', description: 'Control de comprobantes electrónicos SUNAT' },
  { id: 'attendance', label: 'Personal', description: 'Directorio, asistencia y datos de los empleados' },
  { id: 'complaints', label: 'Libro de Reclamos', description: 'Quejas y reclamaciones de clientes' },
]

const VETERINARY = [
  { id: 'public-catalog', label: 'Mi Catálogo Online', description: 'Catálogo digital para compartir con tus clientes y recibir pedidos' },
  { id: 'online-orders', label: 'Pedidos Online', description: 'Bandeja de pedidos que llegan desde tu catálogo digital' },
  { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja diario' },
  { id: 'quotations', label: 'Cotizaciones', description: 'Presupuestos y proformas' },
  { id: 'sellers', label: 'Veterinarios', description: 'Gestión de veterinarios' },
  { id: 'promotions', label: 'Promociones', description: 'Tarjeta de sellos, combos y cupones de descuento' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock de productos' },
  { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
  { id: 'stock-movements', label: 'Movimientos', description: 'Historial de entradas y salidas' },
  { id: 'batch-control', label: 'Control de Lotes', description: 'Gestión de lotes y vencimientos' },
  { id: 'expiry-alerts', label: 'Alertas de Vencimiento', description: 'Productos próximos a vencer' },
  { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
  { id: 'purchase-history', label: 'Historial de Compras', description: 'Registro de compras de insumos' },
  { id: 'purchase-orders', label: 'Órdenes de Compra', description: 'Pedidos a proveedores' },
  { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
  { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
  { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
  { id: 'accounting', label: 'Contabilidad', description: 'Control de comprobantes electrónicos SUNAT' },
  { id: 'vet-agenda', label: 'Agenda de Citas', description: 'Calendario de citas programadas' },
  { id: 'vet-alerts', label: 'Recordatorios', description: 'Alertas de vacunas y servicios pendientes' },
  { id: 'attendance', label: 'Personal', description: 'Directorio, asistencia y datos de los empleados' },
  { id: 'complaints', label: 'Libro de Reclamos', description: 'Quejas y reclamaciones de clientes' },
]

// Modo Clínica (estética, dental, consultorio). Agenda y Recordatorios llevan
// el id de veterinaria porque son la misma pantalla. Lo que no figura acá no
// está en el menú de la clínica: nace corto a propósito.
const CLINIC = [
  { id: 'vet-agenda', label: 'Agenda', description: 'Calendario de citas: agendar, atender y cobrar' },
  { id: 'vet-alerts', label: 'Recordatorios', description: 'A quién le toca volver, según lo que se llevó' },
  { id: 'public-catalog', label: 'Mi Catálogo Online', description: 'Página pública para compartir y recibir reservas de citas' },
  { id: 'online-orders', label: 'Pedidos Online', description: 'Bandeja de pedidos que llegan desde tu catálogo digital' },
  { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja diario' },
  { id: 'quotations', label: 'Cotizaciones', description: 'Presupuestos de tratamiento' },
  { id: 'sellers', label: 'Profesionales', description: 'Quién atiende cada cita y sus comisiones' },
  { id: 'promotions', label: 'Promociones', description: 'Tarjeta de sellos, combos y cupones de descuento' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock de productos' },
  { id: 'stock-movements', label: 'Movimientos', description: 'Historial de entradas y salidas' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
  { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
  { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
  { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
  { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
  { id: 'accounting', label: 'Contabilidad', description: 'Control de comprobantes electrónicos SUNAT' },
  { id: 'attendance', label: 'Personal', description: 'Directorio, asistencia y datos de los empleados' },
  { id: 'complaints', label: 'Libro de Reclamos', description: 'Quejas y reclamaciones de clientes' },
]

// Modo Préstamos: el menú es mínimo a propósito (ver `lendingMenuItems` en el
// Sidebar): Préstamos, Clientes, Control de Caja y Configuración. Lo único que
// tiene sentido apagar es la caja — sin Clientes no hay a quién prestarle.
// Antes este modo no tenía catálogo y la pestaña mostraba una grilla vacía.
const LENDING = [
  { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja diario' },
]

// Cada modo como array de GRUPOS. Los modos planos van en un único grupo sin
// título. General va SIN los ítems condicionales: los agrega
// `getMenuModuleGroups` según los flags.
const MENU_MODULE_GROUPS = {
  retail: gruposRetail(),
  restaurant: [{ items: RESTAURANT }],
  pharmacy: [{ items: PHARMACY }],
  hotel: [{ items: HOTEL }],
  transport: [{ items: TRANSPORT }],
  logistics: [{ items: LOGISTICS }],
  veterinary: [{ items: VETERINARY }],
  clinic: [{ items: CLINIC }],
  lending: [{ items: LENDING }],
}

/** ¿Este modo tiene catálogo propio? (`real_estate`, por ejemplo, no.) */
export function tieneCatalogoDeMenu(businessMode) {
  return Object.prototype.hasOwnProperty.call(MENU_MODULE_GROUPS, businessMode)
}

/**
 * Los grupos del catálogo para un modo.
 *
 * @param {string} businessMode
 * @param {{ obrasEnabled?: boolean, serviciosEnabled?: boolean }} [modulos]
 *   Módulos opcionales encendidos: sus páginas entran al catálogo solo así.
 *   Hoy aplican únicamente a General.
 * @returns {Array<{ title?: string, items: Array<{ id: string, label: string, description: string, flag?: string }> }>}
 *   Un modo sin catálogo cae en el de General (el onboarding lo usa así).
 */
export function getMenuModuleGroups(businessMode, modulos = {}) {
  if (businessMode === 'retail' || !tieneCatalogoDeMenu(businessMode)) {
    return gruposRetail(modulos)
  }
  return MENU_MODULE_GROUPS[businessMode]
}

export default MENU_MODULE_GROUPS
