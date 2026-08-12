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
