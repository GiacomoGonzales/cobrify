/**
 * Mapa ÚNICO ruta → pageId de permisos (sub-usuarios).
 *
 * Fuente de verdad compartida por el guard de MainLayout y la redirección
 * post-login de AuthContext. Antes cada uno tenía su propio mapa manual
 * desactualizado: las páginas nuevas (p.ej. las del modo logística) no
 * figuraban, la redirección caía al fallback /app/pos y, si el sub-usuario
 * no tenía permiso al POS, el guard redirigía en bucle a la misma ruta →
 * página en blanco al ingresar.
 *
 * Al agregar una página nueva con permiso propio, registrarla SOLO acá.
 */
export const routeToPageId = {
  '/app/dashboard': 'dashboard',
  '/app/pos': 'pos',
  '/app/facturas': 'invoices',
  '/app/clientes': 'customers',
  '/app/productos': 'products',
  '/app/caja': 'cash-register',
  '/app/reportes': 'reports',
  '/app/gastos': 'expenses',
  '/app/flujo-caja': 'cash-flow',
  '/app/configuracion': 'settings',
  '/app/vendedores': 'sellers',
  '/app/cotizaciones': 'quotations',
  '/app/guias-remision': 'dispatch-guides',
  '/app/guias-transportista': 'carrier-dispatch-guides',
  '/app/inventario': 'inventory',
  '/app/almacenes': 'warehouses',
  '/app/movimientos': 'stock-movements',
  '/app/compras': 'purchases',
  '/app/ordenes-compra': 'purchase-orders',
  '/app/proveedores': 'suppliers',
  '/app/reclamos': 'complaints',
  '/app/mesas': 'tables',
  '/app/ordenes': 'orders',
  '/app/pedidos-online': 'online-orders',
  '/app/cocina': 'kitchen',
  '/app/mozos': 'waiters',
  '/app/envios': 'envios',
  '/app/prestamos': 'loans',
  '/app/certificados': 'certificates',
  '/app/ingredientes': 'ingredients',
  '/app/recetas': 'recipes',
  '/app/laboratorios': 'laboratories',
  '/app/alertas-vencimiento': 'expiry-alerts',
  '/app/control-lotes': 'batch-control',
  '/app/propiedades': 'properties',
  '/app/agentes': 'agents',
  '/app/operaciones': 'operations',
  '/app/comisiones': 'commissions',
  '/app/proyectos': 'projects',
  '/app/salidas-almacen': 'warehouse-exits',
  '/app/retornos-almacen': 'warehouse-returns',
  '/app/reportes-logisticos': 'logistics-reports',
  '/app/control-pagos-alumnos': 'student-payment-control',
  '/app/nota-credito': 'invoices',
  '/app/nota-debito': 'invoices',
  '/app/alertas-veterinaria': 'vet-alerts',
  '/app/agenda-veterinaria': 'vet-agenda',
  '/app/contabilidad': 'accounting',
  '/app/asistencia': 'attendance',
}

// Mapa inverso pageId → ruta, derivado automáticamente. Cuando un pageId tiene
// varias rutas (p.ej. 'invoices': /app/facturas y /app/nota-credito), gana la
// PRIMERA declarada, que es la página principal.
export const pageIdToRoute = Object.entries(routeToPageId).reduce((acc, [route, pageId]) => {
  if (!acc[pageId]) acc[pageId] = route
  return acc
}, {})

/**
 * Ruta de la primera página permitida que tenga ruta conocida.
 * No asume que allowedPages[0] exista en el mapa (los permisos guardados pueden
 * incluir pageIds viejos o de otro modo de negocio).
 */
export const getFirstAllowedRoute = (allowedPages = [], fallback = '/app/dashboard') => {
  for (const pageId of allowedPages) {
    if (pageIdToRoute[pageId]) return pageIdToRoute[pageId]
  }
  return fallback
}
