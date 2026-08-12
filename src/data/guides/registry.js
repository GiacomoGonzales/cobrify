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
