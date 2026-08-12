/**
 * Registro de GUÍAS DE USO del sistema.
 *
 * Cada página del sistema puede tener una guía. Acá vive solo la METADATA
 * (título, categoría, ruta, palabras de búsqueda); el CONTENIDO de cada guía
 * vive en su propio archivo de esta carpeta y se carga bajo demanda con
 * import() dinámico, para que el manual no engorde el bundle principal.
 *
 * La guía se consume desde dos lugares:
 *  - El panel lateral de ayuda (botón "?" del Navbar) muestra la guía de la
 *    página ACTUAL, resuelta por ruta con getGuideByPath().
 *  - La página /app/manual lista todas las guías del modo de negocio activo,
 *    con búsqueda, y muestra cada una completa en /app/manual/:guideId.
 *
 * REGLA DEL EQUIPO: toda funcionalidad nueva entra al repo con su sección de
 * guía en el mismo commit. Para agregar una guía nueva: crear el archivo de
 * contenido y registrar una entrada acá. Nada más.
 *
 * ENLACES PROFUNDOS A CONFIGURACIÓN: los bloques `enlace` y `requiereOpcion.ruta`
 * aceptan `/app/configuracion?tab=<pestaña>&opcion=<flag>` — Settings abre esa
 * pestaña, hace scroll hasta la opción y la resalta. El ancla es `opcion-<flag>`
 * (el `id` del SettingToggle, mismo nombre del flag en businessSettings).
 */

/** Orden fijo de las categorías en el índice del manual. */
export const GUIDE_CATEGORIES = [
  'Primeros pasos',
  'Ventas',
  'Inventario',
  'Operación',
  'Finanzas',
  'Configuración',
]

export const GUIDES = [
  {
    id: 'pos',
    route: '/app/pos',
    title: 'Punto de Venta (POS)',
    category: 'Ventas',
    description: 'Cobrar una venta, elegir el comprobante, medios de pago, impresión del ticket y qué hacer si se corta el internet.',
    keywords: 'vender cobrar caja boleta factura nota de venta ticket vuelto efectivo yape plin tarjeta credito cuotas escaner codigo de barras cliente ruc dni fecha de emision producto personalizado limpiar aparcar en espera descuento bonificacion whatsapp pdf referencias',
    modos: null, // null = aplica a todos los modos de negocio
    load: () => import('./pos.js'),
  },
  {
    id: 'facturas',
    route: '/app/facturas',
    title: 'Ventas (historial de comprobantes)',
    category: 'Ventas',
    description: 'Buscar comprobantes, cobrar lo pendiente, anular o corregir con nota de crédito, convertir notas de venta y exportar a Excel.',
    keywords: 'ventas facturas boletas historial comprobantes anular nota de credito nota de debito baja sunat cdr xml pdf convertir nota de venta registrar pago pagos pendientes cuentas por cobrar exportar excel archivados rechazado reenviar guia de remision',
    modos: null,
    load: () => import('./facturas.js'),
  },
  {
    id: 'clientes',
    route: '/app/clientes',
    title: 'Clientes',
    category: 'Ventas',
    description: 'Registrar clientes con búsqueda automática en SUNAT/RENIEC, ver quién te debe, importar en Excel y asignar niveles de precio.',
    keywords: 'clientes cartera ruc dni reniec sunat importar exportar excel por cobrar vencidas nivel de precio mayorista mascotas vehiculo alumno cumpleanos deuda',
    modos: null,
    load: () => import('./clientes.js'),
  },
  {
    id: 'productos',
    route: '/app/productos',
    title: 'Productos',
    category: 'Inventario',
    description: 'Crear productos, códigos de barras, variantes y presentaciones, precios, acciones masivas, etiquetas e importación.',
    keywords: 'productos catalogo crear precio costo sku codigo de barras ean variantes tallas colores presentaciones caja docena categoria marca igv afectacion etiquetas zebra importar exportar excel acciones masivas activar desactivar decimales servicio',
    modos: null,
    load: () => import('./productos.js'),
  },
  {
    id: 'inventario',
    route: '/app/inventario',
    title: 'Inventario',
    category: 'Inventario',
    description: 'Cuadrar el stock: mermas, traslados entre almacenes, recuento físico, historial de movimientos, lotes y series.',
    keywords: 'inventario stock merma perdida robo vencido dañado transferir traslado almacen sucursal recuento fisico conteo diferencia faltante sobrante movimientos entradas salidas lotes vencimiento series valor costo stock bajo agotados negativo',
    modos: null,
    load: () => import('./inventario.js'),
  },
  {
    id: 'caja',
    route: '/app/caja',
    title: 'Control de Caja',
    category: 'Finanzas',
    description: 'Abrir y cerrar caja, registrar ingresos y egresos, arqueo, diferencias, cierre a ciegas e historial de sesiones.',
    keywords: 'caja apertura cierre arqueo monto inicial efectivo contado esperado diferencia faltante sobrante ingreso egreso movimientos constancia historial yape plin tarjeta dolares turno cajero a ciegas',
    modos: null,
    load: () => import('./caja.js'),
  },
  {
    id: 'gastos',
    route: '/app/gastos',
    title: 'Gastos',
    category: 'Finanzas',
    description: 'Registrar y categorizar los gastos del negocio, ver en qué se va el dinero y exportar para el contador.',
    keywords: 'gastos egresos categorias servicios luz agua internet sueldos salarios transporte alquiler proveedor comprobante recibo dolares tipo de cambio sbs excel promedio diario evolucion',
    modos: null,
    load: () => import('./gastos.js'),
  },
  {
    id: 'reportes',
    route: '/app/reportes',
    title: 'Reportes',
    category: 'Finanzas',
    description: 'Qué se vende, quién compra y cuánto ganas: ventas por hora, top productos, clientes, vendedores y rentabilidad.',
    keywords: 'reportes estadisticas ticket promedio utilidad bruta neta margen rentabilidad top productos categorias marcas variantes clientes zonas vendedores comisiones ventas por hora metodo de pago exportar excel periodo',
    modos: null,
    load: () => import('./reportes.js'),
  },
  {
    id: 'configuracion',
    route: '/app/configuracion',
    title: 'Configuración',
    category: 'Configuración',
    description: 'Qué vive en cada pestaña: datos de empresa, ajustes del POS, series y numeración, impresora y módulos del menú.',
    keywords: 'configuracion ajustes empresa ruc razon social logo establecimientos anexos series numeracion correlativo impresora termica ancho papel modulos menu preferencias documentos seguridad notificaciones',
    modos: null,
    load: () => import('./configuracion.js'),
  },
]

/**
 * Normaliza la ruta actual para poder resolver la guía también dentro de los
 * demos: /demo/pos, /demorestaurant/pos, etc. → /app/pos.
 */
const normalizePath = (pathname = '') => pathname.replace(/^\/demo[a-z]*(\/|$)/, '/app$1')

/** Guía correspondiente a la ruta actual (o null si la página aún no tiene). */
export const getGuideByPath = (pathname) => {
  const path = normalizePath(pathname)
  return (
    GUIDES.find(g => g.route === path || path.startsWith(g.route + '/')) || null
  )
}

export const getGuideById = (id) => GUIDES.find(g => g.id === id) || null

/** Guías visibles para un modo de negocio. */
export const getGuidesForMode = (businessMode) =>
  GUIDES.filter(g => !g.modos || g.modos.includes(businessMode))

/**
 * Secciones visibles de una guía para el modo activo.
 * `soloModos` OCULTA la sección en modos ajenos (a un minimarket no le hablamos
 * de comandas). Las opciones de configuración NO ocultan: la sección se muestra
 * con una nota "requiere activar X" (ver GuideRenderer), para que el usuario
 * descubra que la función existe.
 */
export const getVisibleSections = (content, businessMode) =>
  (content?.sections || []).filter(s => !s.soloModos || s.soloModos.includes(businessMode))
