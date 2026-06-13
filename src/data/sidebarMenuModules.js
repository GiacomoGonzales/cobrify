/**
 * Módulos del menú lateral que se pueden mostrar/ocultar, por modo de negocio.
 *
 * ESPEJO de las definiciones inline en `src/pages/Settings.jsx` (sección
 * "Personalizar Menú Lateral"). Si agregas/quitas módulos del menú allá,
 * actualiza también aquí para que el onboarding (Crear Cuenta) quede sincronizado.
 *
 * Estructura: cada modo es un array de GRUPOS `{ title?, items: [{id,label,description}] }`.
 * Retail usa grupos con título; los demás modos son un único grupo plano (sin título).
 * Los módulos principales (Dashboard, POS, Ventas, Clientes, Productos, Configuración)
 * siempre están visibles y NO se listan aquí.
 */

const RETAIL = [
  { title: 'Ventas y cobro', items: [
    { id: 'public-catalog', label: 'Mi Catálogo Online', description: 'Catálogo digital para compartir con tus clientes y recibir pedidos' },
    { id: 'online-orders', label: 'Pedidos Online', description: 'Bandeja de pedidos que llegan desde tu catálogo digital' },
    { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja diario' },
    { id: 'quotations', label: 'Cotizaciones', description: 'Presupuestos y proformas' },
    { id: 'sellers', label: 'Vendedores', description: 'Gestión de vendedores y comisiones' },
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
  ] },
  { title: 'Producción', items: [
    { id: 'ingredients', label: 'Insumos', description: 'Materia prima y componentes' },
    { id: 'recipes', label: 'Composición', description: 'Productos compuestos' },
    { id: 'production', label: 'Producción', description: 'Producción y transformación de productos' },
  ] },
  { title: 'Guías y envíos', items: [
    { id: 'dispatch-guides', label: 'GRE Remitente', description: 'Guías de remisión como remitente' },
    { id: 'carrier-dispatch-guides', label: 'GRE Transportista', description: 'Guías de remisión como transportista' },
    { id: 'envios', label: 'Envíos', description: 'Gestión de repartidores y entregas' },
  ] },
  { title: 'Finanzas', items: [
    { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
    { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
    { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
    { id: 'accounting', label: 'Contabilidad', description: 'Control de comprobantes electrónicos SUNAT' },
    { id: 'loans', label: 'Préstamos', description: 'Préstamos a clientes' },
  ] },
  { title: 'Operación y otros', items: [
    { id: 'student-payments', label: 'Control de Alumnos', description: 'Control de pagos de alumnos' },
    { id: 'certificates', label: 'Certificados', description: 'Emisión de certificados' },
    { id: 'attendance', label: 'Personal', description: 'Directorio, asistencia y datos de los empleados' },
    { id: 'complaints', label: 'Libro de Reclamos', description: 'Quejas y reclamaciones de clientes' },
  ] },
]

const RESTAURANT = [
  { id: 'public-catalog', label: 'Mi Carta Digital', description: 'Carta digital para compartir con tus clientes y recibir pedidos' },
  { id: 'cash-register', label: 'Caja', description: 'Apertura y cierre de caja' },
  { id: 'orders', label: 'Órdenes', description: 'Listado de órdenes activas' },
  { id: 'tables', label: 'Mesas', description: 'Gestión de mesas del local' },
  { id: 'kitchen', label: 'Cocina', description: 'Vista de cocina para preparación' },
  { id: 'ingredients', label: 'Ingredientes', description: 'Inventario de ingredientes' },
  { id: 'recipes', label: 'Recetas', description: 'Recetas y composición de platos' },
  { id: 'production', label: 'Producción', description: 'Producción y transformación de platos' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock de productos e ingredientes' },
  { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras a proveedores' },
  { id: 'purchase-history', label: 'Historial de Compras', description: 'Registro de compras de insumos' },
  { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
  { id: 'sellers', label: 'Vendedores', description: 'Gestión de vendedores y comisiones' },
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
  { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja' },
  { id: 'quotations', label: 'Cotizaciones', description: 'Presupuestos y proformas' },
  { id: 'sellers', label: 'Vendedores', description: 'Gestión de vendedores y comisiones' },
  { id: 'laboratories', label: 'Laboratorios', description: 'Fabricantes de medicamentos' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock' },
  { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
  { id: 'stock-movements', label: 'Movimientos', description: 'Historial de entradas y salidas' },
  { id: 'batch-control', label: 'Control de Lotes', description: 'Gestión de lotes y vencimientos' },
  { id: 'expiry-alerts', label: 'Alertas de Vencimiento', description: 'Productos próximos a vencer' },
  { id: 'suppliers', label: 'Proveedores', description: 'Droguerías y distribuidores' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
  { id: 'dispatch-guides', label: 'GRE Remitente', description: 'Guías de remisión como remitente' },
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
  { id: 'sellers', label: 'Vendedores', description: 'Gestión de vendedores y comisiones' },
  { id: 'inventory', label: 'Inventario', description: 'Control de stock por producto' },
  { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
  { id: 'stock-movements', label: 'Movimientos', description: 'Historial de entradas y salidas' },
  { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
  { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
  { id: 'purchase-history', label: 'Historial de Compras', description: 'Registro de compras de insumos' },
  { id: 'purchase-orders', label: 'Órdenes de Compra', description: 'Pedidos a proveedores' },
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
  { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja diario' },
  { id: 'quotations', label: 'Cotizaciones', description: 'Presupuestos y proformas' },
  { id: 'sellers', label: 'Veterinarios', description: 'Gestión de veterinarios' },
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

// Cada modo como array de GRUPOS. Los modos planos van en un único grupo sin título.
const MENU_MODULE_GROUPS = {
  retail: RETAIL,
  restaurant: [{ items: RESTAURANT }],
  pharmacy: [{ items: PHARMACY }],
  hotel: [{ items: HOTEL }],
  transport: [{ items: TRANSPORT }],
  logistics: [{ items: LOGISTICS }],
  veterinary: [{ items: VETERINARY }],
}

export function getMenuModuleGroups(businessMode) {
  return MENU_MODULE_GROUPS[businessMode] || MENU_MODULE_GROUPS.retail
}

export default MENU_MODULE_GROUPS
