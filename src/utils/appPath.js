/**
 * La ruta con su prefijo — /app, /demo, /demorestaurant…
 *
 * Vivía dentro de `useAppNavigate`, que navega y no devuelve nada. Para abrir
 * algo en OTRA PESTAÑA hace falta la URL, no la navegación: sin esto habría
 * que repetir la lista de prefijos en cada lugar que quiera un enlace, y la
 * copia se quedaría vieja al agregar el próximo demo.
 */

/** Prefijos de demo, del más específico al genérico. */
const DEMOS = [
  '/demorestaurant',
  '/demopharmacy',
  '/demohotel',
  '/demoveterinary',
  '/demologistics',
]

/**
 * @param {string} path      ruta relativa ('pos?x=1') o absoluta ('/app/pos')
 * @param {boolean} isDemoMode
 * @param {string} pathname  la ruta actual, para saber en qué demo estamos
 * @returns {string} la ruta con prefijo
 */
export function rutaDeApp(path, isDemoMode = false, pathname = '') {
  const p = String(path ?? '')

  // Ya viene absoluta: se respeta tal cual.
  if (p.startsWith('/app') || p.startsWith('/demo') || p === '/') return p

  let prefijo = '/app'
  if (isDemoMode) {
    prefijo = DEMOS.find(d => String(pathname).startsWith(d)) || '/demo'
  }

  return `${prefijo}${p.startsWith('/') ? p : `/${p}`}`
}

/**
 * ¿La aplicación está corriendo SIN pestañas a la vista?
 *
 * Dos casos, y el segundo es fácil de olvidar:
 *
 *  - La app nativa (Capacitor).
 *  - La PWA INSTALADA, en escritorio o en el teléfono. Esa corre en el
 *    navegador, así que `Capacitor.isNativePlatform()` da false — pero no tiene
 *    barra de pestañas, y `window.open` abre una ventana FUERA de la
 *    aplicación. Se reconoce por `display-mode: standalone`; el Safari de iOS
 *    nunca implementó ese media query y usa `navigator.standalone`.
 */
export const enModoAplicacion = (esNativo) => {
  if (esNativo) return true
  if (typeof window === 'undefined') return true
  if (window.navigator?.standalone === true) return true
  try {
    return window.matchMedia?.('(display-mode: standalone)')?.matches === true
  } catch {
    return false
  }
}

/**
 * ¿Conviene abrir esto en otra pestaña?
 *
 * Solo en el navegador de escritorio, con pestañas de verdad. En la app y en la
 * PWA instalada saca al usuario afuera; en un teléfono las pestañas no se ven.
 *
 * @param {boolean} esNativo  Capacitor.isNativePlatform()
 * @param {number} ancho      window.innerWidth
 */
export const convieneOtraPestana = (esNativo, ancho) =>
  !enModoAplicacion(esNativo) && Number(ancho) >= 1024
