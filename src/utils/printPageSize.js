/**
 * EL TAMAÑO DE HOJA AL IMPRIMIR UN TICKET.
 *
 * ── El bug que motivó este módulo ────────────────────────────────────────────
 * Todos los tickets declaraban `@page { size: 80mm auto }`. Esa declaración es
 * INVÁLIDA y el navegador la descarta entera: la sintaxis de `size` acepta una
 * o dos medidas, o un nombre de papel, pero no una medida mezclada con `auto`.
 * Al descartarla, Chrome caía en su tamaño por defecto y el ticket salía
 * centrado en una A4 con media hoja en blanco.
 *
 * Se comprobó en el navegador: con `size: 80mm auto` la regla queda en
 * `@page { margin: 0px; }` —sin `size`—; con `size: 80mm 297mm` se conserva.
 *
 * ── Por qué hay que MEDIR la altura ──────────────────────────────────────────
 * Un rollo térmico no tiene alto fijo: la hoja es tan larga como el ticket. Como
 * CSS no permite decir "este ancho y el alto que haga falta", la altura se mide
 * del contenido ya renderizado y se escribe en la regla. Eso es lo que hace que
 * la hoja se ajuste al ticket en vez de sobrar papel.
 */

/** 1 px de CSS es 1/96 de pulgada; una pulgada son 25.4 mm. */
const MM_POR_PX = 25.4 / 96

/**
 * Holgura sobre el alto medido. La medición se hace en PANTALLA y el ticket no
 * se imprime igual que como se ve: los estilos de impresión le cambian el
 * padding lateral (2mm en pantalla, 2mm + los márgenes configurados al
 * imprimir), y con `box-sizing: border-box` eso angosta el texto y lo hace más
 * ALTO. Con letra grande hay además un `zoom` que amplifica la diferencia.
 *
 * El error no es simétrico y por eso se redondea SIEMPRE hacia arriba:
 *
 *   - hoja MÁS CORTA que el contenido → el navegador encoge TODO para que
 *     quepa, y el ticket sale chiquito y centrado en el papel. Es el reporte
 *     del 31-ago-2026: "al poner el tamaño de letra en máximo el comprobante
 *     me sale en el medio".
 *   - hoja MÁS LARGA → sobra un poco de papel al final. En un rollo continuo
 *     no se nota, la impresora corta donde termina el ticket.
 */
const HOLGURA = 1.12
const HOLGURA_MM = 12

/**
 * Alto mínimo de la hoja. Por debajo de esto algunos visores de PDF y drivers
 * se confunden con la página, y un ticket de dos líneas tampoco se lee mejor
 * en una hoja de 8 mm.
 */
export const ALTO_MINIMO_MM = 40

/**
 * Tope de seguridad. Si la medición sale disparada —contenido aún sin
 * renderizar, una imagen que no cargó— vale más una hoja larga que un número
 * absurdo que el driver rechace.
 */
export const ALTO_MAXIMO_MM = 3000

/** px de pantalla → mm de papel. */
export const pxAMm = (px) => (Number(px) || 0) * MM_POR_PX

/**
 * El valor de `size` para un ticket, ya válido.
 *
 * @param {number} anchoMm  el ancho del papel (58, 80...)
 * @param {number} altoMm   el alto medido del contenido; si no hay, se usa el
 *                          largo de una A4 para no quedarse corto
 * @returns {string} p. ej. "80mm 154mm"
 */
export const ticketPageSize = (anchoMm, altoMm) => {
  const w = Number(anchoMm) > 0 ? Number(anchoMm) : 80
  let h = Number(altoMm)
  if (!Number.isFinite(h) || h <= 0) {
    h = 297
  } else {
    // Ver HOLGURA: quedarse corto arruina la impresión, pasarse solo gasta
    // unos centímetros de papel.
    h = h * HOLGURA + HOLGURA_MM
  }
  h = Math.min(ALTO_MAXIMO_MM, Math.max(ALTO_MINIMO_MM, h))
  // Redondeado hacia arriba: cortar el ticket por medio milímetro empujaría la
  // última línea a una segunda hoja.
  return `${w}mm ${Math.ceil(h)}mm`
}

/**
 * Mide el alto de un elemento ya pintado y lo devuelve en mm.
 * null si no se puede medir, para que el llamador decida qué hacer.
 */
export const medirAltoMm = (el) => {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null
  // scrollHeight además de la caja visible: si algo desborda el contenedor,
  // getBoundingClientRect no lo cuenta y la hoja saldría corta.
  const alto = Math.max(el.getBoundingClientRect().height || 0, el.scrollHeight || 0)
  if (!alto || alto <= 0) return null
  return pxAMm(alto)
}

/** El <style> que inyecta la regla. Uno solo, reutilizado. */
const ID_ESTILO = 'cobrify-ticket-page-size'

/**
 * Deja la hoja del tamaño del ticket, justo antes de imprimir.
 *
 * Se hace acá y no dentro de cada componente porque la altura solo se conoce
 * cuando el ticket YA está pintado, y porque son ocho tickets distintos: un
 * único punto evita que dentro de un año la mitad tenga el tamaño bien y la
 * otra mitad siga saliendo en A4.
 *
 * @param {HTMLElement} el      el contenedor del ticket, ya renderizado
 * @param {number}      anchoMm ancho del papel
 * @returns {Function} llamarla para quitar la regla cuando termine la impresión
 */
export const aplicarTamanoDeHoja = (el, anchoMm) => {
  if (typeof document === 'undefined') return () => {}

  const size = ticketPageSize(anchoMm, medirAltoMm(el))

  let estilo = document.getElementById(ID_ESTILO)
  if (!estilo) {
    estilo = document.createElement('style')
    estilo.id = ID_ESTILO
    document.head.appendChild(estilo)
  }
  // Sin @media print: `@page` solo aplica al imprimir de todos modos, y
  // envolverla agrega una capa donde equivocarse.
  estilo.textContent = `@page { size: ${size}; margin: 0; }`

  return () => {
    document.getElementById(ID_ESTILO)?.remove()
  }
}
