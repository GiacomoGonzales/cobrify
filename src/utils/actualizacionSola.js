/**
 * LA WEB SE ACTUALIZA SOLA.
 *
 * El service worker guarda la versión que uno tiene y la sigue sirviendo hasta
 * que alguien acepta actualizar o cierra todas las pestañas. Quien trabaja con
 * la pestaña abierta todo el día puede quedarse días atrás sin enterarse: el
 * 16-set-2026 se reportó como error algo que estaba arreglado hacía dos.
 *
 * Acá vive el criterio de CUÁNDO se puede recargar sin que nadie pierda nada.
 * Lo usa ActualizacionContext.
 */

const EDITABLES = 'input, textarea, [contenteditable="true"]'

/** Los que no guardan trabajo: un buscador a medias no se extraña. */
const esDeBusqueda = (el) => {
  if (el.type === 'search') return true
  const pistas = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute?.('aria-label') || ''}`
  return /busca|search|filtr/i.test(pistas)
}

/** Lo que no está en pantalla no se puede perder. */
const seVe = (el) => !!(el.offsetParent || el.getClientRects?.().length)

const tieneAlgoEscrito = (el) => {
  if (el.isContentEditable) return (el.textContent || '').trim() !== ''
  if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'hidden') return false
  return (el.value || '').trim() !== ''
}

/**
 * true = está haciendo algo, no es momento de recargar.
 *
 * Tres señales, leídas del DOM a propósito en vez de preguntarle a cada
 * pantalla: así vale para todas las que ya existen y para las que vengan.
 *  - hay un cuadro abierto (role="dialog"),
 *  - el cursor está dentro de un campo,
 *  - o quedó algo escrito en un campo que no es un buscador (el mensaje a
 *    medio escribir, una venta a medio llenar).
 */
export function estaEnMedioDeAlgo(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return true
  // Un cuadro abierto, o una pantalla que avisa que tiene trabajo a medias sin
  // nada escrito: el POS con productos en el carrito se marca `data-ocupado`,
  // porque ahí se arma una venta a puros clics.
  if (doc.querySelector('[role="dialog"], [data-ocupado="1"]')) return true

  const foco = doc.activeElement
  if (foco && typeof foco.matches === 'function' && foco.matches(EDITABLES)) return true

  return [...doc.querySelectorAll(EDITABLES)].some(
    (el) => seVe(el) && !esDeBusqueda(el) && tieneAlgoEscrito(el)
  )
}

const CLAVE_REANUDAR = 'cobrify:actualizacionSola'
const CLAVE_ULTIMA = 'cobrify:actualizacionSolaEn'

/** Se llama justo antes de recargar sola. */
export function marcarActualizacionAutomatica() {
  try {
    sessionStorage.setItem(CLAVE_REANUDAR, '1')
    sessionStorage.setItem(CLAVE_ULTIMA, String(Date.now()))
  } catch { /* sin sessionStorage se actualiza igual, solo que sin reanudar */ }
}

/**
 * true UNA sola vez: esta carga viene de una actualización automática, no de
 * que la persona haya entrado. Sirve para dejarla donde estaba.
 */
export function fueActualizacionAutomatica() {
  try {
    const hubo = sessionStorage.getItem(CLAVE_REANUDAR) === '1'
    if (hubo) sessionStorage.removeItem(CLAVE_REANUDAR)
    return hubo
  } catch {
    return false
  }
}

const CLAVE_CHAT = 'cobrify:chatAbierto'

/** La conversación abierta del chat, por si la página se recarga sola. */
export function recordarConversacion(id) {
  try {
    if (id) sessionStorage.setItem(CLAVE_CHAT, id)
    else sessionStorage.removeItem(CLAVE_CHAT)
  } catch { /* sin sessionStorage simplemente no se reanuda */ }
}

/**
 * La conversación a la que hay que volver, o null. Solo devuelve algo cuando
 * la carga viene de una actualización automática: si la persona entró al chat
 * por su cuenta, empieza en la lista, como siempre.
 */
export function conversacionParaReanudar() {
  try {
    return fueActualizacionAutomatica() ? sessionStorage.getItem(CLAVE_CHAT) : null
  } catch {
    return null
  }
}

/**
 * Freno de mano: como mucho una recarga sola cada diez minutos por pestaña.
 * Si algo saliera mal y la versión nueva siguiera pareciendo pendiente, esto
 * evita que la página se recargue en bucle delante del cliente.
 */
export function actualizoSolaHacePoco(ms = 10 * 60 * 1000) {
  try {
    const t = Number(sessionStorage.getItem(CLAVE_ULTIMA) || 0)
    return t > 0 && Date.now() - t < ms
  } catch {
    return false
  }
}
