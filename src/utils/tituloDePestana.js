/**
 * QUÉ DICE LA PESTAÑA DEL NAVEGADOR.
 *
 * Antes decía siempre lo mismo —el título largo de la landing, bueno para
 * Google y malo para trabajar—, así que con el admin y el sistema abiertos a la
 * vez las dos pestañas se llamaban igual y no había forma de saber cuál era
 * cuál sin entrar. Ahora cada zona se nombra: "Administrador - Cobrify",
 * "Punto de Venta - Cobrify".
 *
 * Los nombres NO se escriben otra vez acá: salen de `AVAILABLE_PAGES`, el mismo
 * catálogo con el que se reparten los permisos de los usuarios secundarios. Una
 * página nueva que entre ahí se nombra sola en la pestaña.
 *
 * Quien lo pone es `BrandingContext`, que es el que ya manda sobre
 * `document.title`; acá solo se decide el texto.
 */
import { AVAILABLE_PAGES, LENDING_PAGES } from '@/services/userManagementService'

/** "Punto de Venta (POS)" → "Punto de Venta". El paréntesis aclara un permiso,
 *  no hace falta en una pestaña de tres centímetros. */
const sinParentesis = (nombre) => nombre.replace(/\s*\([^)]*\)\s*$/, '').trim()

/**
 * Las zonas que no son páginas del catálogo de permisos.
 *
 * El admin va entero como "Administrador": es una herramienta sola y lo que
 * hace falta es distinguirla del sistema del cliente, no saber en qué pestaña
 * de ella se está.
 */
const ZONAS = [
  ['/app/admin', 'Administrador'],
  ['/reseller', 'Panel de reseller'],
  ['/app/nota-credito', 'Nota de crédito'],
  ['/app/nota-debito', 'Nota de débito'],
  ['/app/emision-masiva', 'Emisión masiva'],
  ['/app/guias-transportista', 'Guías de transportista'],
  ['/app/flujo-caja', 'Flujo de caja'],
  ['/app/perfil', 'Mi perfil'],
  ['/app/suscripcion', 'Mi suscripción'],
]

/** Ruta → nombre, del catálogo de permisos y de las zonas de arriba. */
const RUTAS = (() => {
  const mapa = new Map()
  for (const p of [...AVAILABLE_PAGES, ...LENDING_PAGES]) {
    const ruta = `/app${p.path}`
    if (!mapa.has(ruta)) mapa.set(ruta, sinParentesis(p.name))
  }
  for (const [ruta, nombre] of ZONAS) mapa.set(ruta, nombre)
  // De la más larga a la más corta: `/app/admin` tiene que ganarle a `/app`.
  return [...mapa.entries()].sort((a, b) => b[0].length - a[0].length)
})()

/**
 * Cómo se llama la parte del sistema en la que se está, o `null` si esa ruta no
 * se nombra (la landing, el catálogo público, el chat: cada uno tiene lo suyo).
 *
 * Compara por prefijo para que las sub-rutas hereden el nombre de su página:
 * `/app/cotizaciones/nueva` es "Cotizaciones", `/app/admin/altas` es
 * "Administrador".
 */
export function seccionDeLaRuta(pathname = '') {
  const ruta = pathname.replace(/\/+$/, '') || '/'
  for (const [prefijo, nombre] of RUTAS) {
    if (ruta === prefijo || ruta.startsWith(`${prefijo}/`)) return nombre
  }
  return ruta === '/app' ? 'Dashboard' : null
}

/**
 * El título sin adornos de la pestaña actual.
 *
 * Lo guarda quien lo escribe, para que el aviso de pedidos nuevos —que hace
 * parpadear la pestaña y después la deja como estaba— no devuelva el título de
 * la página donde se prendió, que puede no ser en la que estamos.
 */
let base = ''

export function recordarTitulo(titulo) {
  base = titulo
}

export function tituloBaseActual() {
  return base || document.title
}
