/**
 * Texto centrado que NUNCA se sale de su columna.
 *
 * En la cabecera de un comprobante el nombre del negocio va centrado en la
 * franja que queda entre el logo y el recuadro del documento. jsPDF no recorta
 * nada: si el texto es más ancho que esa franja lo dibuja igual, pisando el
 * logo por la izquierda y el recuadro del R.U.C. por la derecha.
 *
 * El criterio es siempre el mismo: partir en líneas y, si aun así no entra en
 * el máximo de líneas permitido, bajar el tamaño de letra hasta que entre. Solo
 * si ni con el tamaño mínimo entra, se recorta.
 *
 * IMPORTANTE: `splitTextToSize` mide con la fuente que esté activa, así que el
 * llamador debe hacer su `doc.setFont(...)` ANTES de medir o dibujar.
 */

/**
 * Calcula cómo va a quedar el texto, sin dibujarlo.
 *
 * Sirve para saber cuánto alto va a ocupar el bloque antes de decidir dónde
 * empieza (por ejemplo, para centrarlo verticalmente en la cabecera).
 *
 * @param {object} doc instancia de jsPDF
 * @param {string} texto
 * @param {object} opciones
 * @param {number} opciones.ancho ancho disponible de la columna
 * @param {number} opciones.tamano tamaño de letra deseado
 * @param {number} [opciones.tamanoMinimo] hasta dónde se puede achicar
 * @param {number} [opciones.maxLineas] cuántas líneas se permiten
 * @param {number} [opciones.alturaLinea] separación entre líneas
 * @returns {{ lineas: string[], tamano: number, alturaLinea: number, alto: number }}
 */
export function medirTextoCentrado(doc, texto, opciones = {}) {
  const {
    ancho,
    tamano,
    tamanoMinimo = Math.max(5, tamano - 3),
    maxLineas = 2,
    alturaLinea = tamano + 2,
  } = opciones

  const limpio = String(texto || '').trim()
  if (!limpio || !(ancho > 0)) {
    return { lineas: [], tamano, alturaLinea, alto: 0 }
  }

  const tamanoOriginal = doc.getFontSize()
  let usado = tamano
  let lineas = []

  while (usado >= tamanoMinimo) {
    doc.setFontSize(usado)
    lineas = doc.splitTextToSize(limpio, ancho)
    if (lineas.length <= maxLineas) break
    usado -= 0.5
  }

  // Ni con el tamaño mínimo entra: se recorta a las líneas permitidas.
  if (lineas.length > maxLineas) {
    usado = tamanoMinimo
    doc.setFontSize(usado)
    lineas = doc.splitTextToSize(limpio, ancho).slice(0, maxLineas)
  }

  doc.setFontSize(tamanoOriginal)

  return { lineas, tamano: usado, alturaLinea, alto: lineas.length * alturaLinea }
}

/**
 * Dibuja el texto centrado dentro de la columna y devuelve cuánto alto ocupó.
 *
 * @param {object} doc instancia de jsPDF
 * @param {string} texto
 * @param {object} opciones las mismas que `medirTextoCentrado`, más:
 * @param {number} opciones.centroX coordenada X del centro de la columna
 * @param {number} opciones.y línea base de la primera línea
 * @param {object} [opciones.medida] resultado ya calculado, para no medir dos veces
 * @returns {number} alto ocupado
 */
export function dibujarTextoCentrado(doc, texto, opciones = {}) {
  const { centroX, y, medida } = opciones
  const calculo = medida || medirTextoCentrado(doc, texto, opciones)
  if (calculo.lineas.length === 0) return 0

  doc.setFontSize(calculo.tamano)
  calculo.lineas.forEach((linea, i) => {
    doc.text(linea, centroX, y + (i * calculo.alturaLinea), { align: 'center' })
  })

  return calculo.alto
}
