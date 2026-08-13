/**
 * Qué texto va al pie del TICKET (impreso o en el ticket HTML).
 *
 * POR QUÉ EXISTE (caso real, 12-ago-2026): una usuaria quería que sus términos
 * y condiciones de garantía —900+ caracteres— salieran impresos en el ticket
 * térmico. Los tenía cargados en "Términos y condiciones (al pie del
 * comprobante)", que solo se imprime en el PDF, así que intentó copiarlos al
 * "Mensaje al pie del ticket térmico" y no le entraron: ese campo está topado a
 * 300 caracteres. Duplicar el texto en dos campos también significaba tener que
 * mantenerlo en dos lugares.
 *
 * La solución es un interruptor: los términos se escriben UNA vez en su campo y
 * el negocio decide si además se imprimen en el ticket.
 *
 * SE DEVUELVEN POR SEPARADO A PROPÓSITO, porque se alinean distinto:
 *  - `mensaje`: corto, va CENTRADO (así estuvo siempre y así lo dice su ayuda).
 *  - `terminos`: párrafo largo, va ALINEADO A LA IZQUIERDA y a todo el ancho.
 *    Centrar un texto de 900 caracteres en 58 mm de papel lo vuelve ilegible y
 *    desperdicia ancho.
 *
 * El pie del ticket se dibuja en CUATRO sitios (ticket HTML, impresión térmica
 * USB/red, el builder ESC/POS y el path Bluetooth). Por eso la decisión de QUÉ
 * texto corresponde vive acá y no repetida en cada uno: si mañana cambia la
 * regla, cambia en un solo lugar y los cuatro quedan iguales.
 *
 * OJO: el PDF de factura NO usa esto. `generateInvoicePDF` ya imprime
 * `invoiceFooterTerms` en su propia sección; sumarlo acá los duplicaría.
 *
 * @param {object} settings - businessSettings / companySettings del negocio
 * @returns {{ mensaje: string, terminos: string }} ambos '' si no hay nada
 */
export const getTicketFooterParts = (settings) => {
  const mensaje = (settings?.ticketFooterMessage || '').trim()

  // Los términos solo salen en el ticket si el negocio lo pidió expresamente.
  // Por defecto NO: son largos y encarecen cada ticket en papel.
  const terminos = settings?.showTermsOnTicket === true
    ? (settings?.invoiceFooterTerms || '').trim()
    : ''

  return { mensaje, terminos }
}

/**
 * Justifica un texto para impresión térmica: reparte espacios entre las
 * palabras para que cada línea llegue al margen derecho.
 *
 * POR QUÉ A MANO (caso real, 12-ago-2026): el usuario pidió que sus términos
 * salgan "ajustados a los extremos". En el ticket HTML basta con
 * `text-align: justify`, pero la impresión térmica es ESC/POS y ese protocolo
 * solo conoce izquierda, centro y derecha — no existe un comando de justificar.
 * La única forma es rellenar con espacios, y se puede porque la impresora usa
 * ancho de carácter fijo.
 *
 * La ÚLTIMA línea de cada párrafo no se justifica: estirarla dejaría palabras
 * separadas por medio ticket. Es la misma convención de cualquier texto impreso.
 *
 * @param {string} texto - Texto a justificar (respeta los saltos de línea)
 * @param {number} charsPorLinea - Ancho del papel en caracteres (58mm≈32, 80mm≈48)
 * @returns {string[]} Líneas listas para imprimir
 */
export const justifyTicketText = (texto, charsPorLinea = 32) => {
  const limpio = String(texto || '').trim()
  if (!limpio) return []

  const ancho = Number(charsPorLinea)
  if (!Number.isFinite(ancho) || ancho < 8) return limpio.split(/\r?\n/)

  const salida = []

  // Los saltos que escribió el usuario se respetan: cada uno arranca un párrafo.
  for (const parrafo of limpio.split(/\r?\n/)) {
    const palabras = parrafo.trim().split(/\s+/).filter(Boolean)
    if (palabras.length === 0) { salida.push(''); continue }

    // 1) Cortar en líneas por ancho
    const lineas = []
    let actual = []
    for (const palabra of palabras) {
      const largo = actual.reduce((n, p) => n + p.length, 0) + actual.length + palabra.length
      if (actual.length === 0) {
        actual = [palabra]
      } else if (largo <= ancho) {
        actual.push(palabra)
      } else {
        lineas.push(actual)
        actual = [palabra]
      }
    }
    if (actual.length) lineas.push(actual)

    // 2) Repartir espacios, salvo en la última línea del párrafo
    lineas.forEach((linea, i) => {
      const esUltima = i === lineas.length - 1
      const textoPlano = linea.join(' ')

      // Una sola palabra no se puede estirar sin partirla por la mitad.
      if (esUltima || linea.length === 1 || textoPlano.length >= ancho) {
        salida.push(textoPlano)
        return
      }

      const huecos = linea.length - 1
      const faltan = ancho - linea.reduce((n, p) => n + p.length, 0)
      const base = Math.floor(faltan / huecos)
      // El sobrante va a los primeros huecos, como en tipografía.
      const extra = faltan % huecos

      let out = ''
      linea.forEach((palabra, j) => {
        out += palabra
        if (j < huecos) out += ' '.repeat(base + (j < extra ? 1 : 0))
      })
      salida.push(out)
    })
  }

  return salida
}
