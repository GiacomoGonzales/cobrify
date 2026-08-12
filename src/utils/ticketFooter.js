/**
 * Qué texto va al pie del TICKET (impreso o en PDF de formato ticket).
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
 * El pie del ticket se dibuja en CINCO sitios distintos (ticket HTML,
 * impresión térmica USB/red, impresión Bluetooth, el payload que se manda al
 * plugin nativo y el PDF con formato ticket). Por eso la decisión de QUÉ texto
 * corresponde vive acá y no repetida en cada uno: si mañana cambia la regla,
 * cambia en un solo lugar y los cinco quedan iguales.
 *
 * Devuelve un solo string con saltos de línea, que es justo lo que cada sitio
 * ya sabe renderizar.
 *
 * @param {object} settings - businessSettings / companySettings del negocio
 * @returns {string} texto del pie (vacío si no hay nada que imprimir)
 */
export const getTicketFooterText = (settings) => {
  const bloques = []

  const mensaje = (settings?.ticketFooterMessage || '').trim()
  if (mensaje) bloques.push(mensaje)

  // Los términos solo salen en el ticket si el negocio lo pidió expresamente.
  // Por defecto NO: son largos y encarecen cada ticket en papel.
  if (settings?.showTermsOnTicket === true) {
    const terminos = (settings?.invoiceFooterTerms || '').trim()
    if (terminos) bloques.push(terminos)
  }

  return bloques.join('\n')
}
