/**
 * Leyenda legal al pie de una NOTA DE VENTA.
 *
 * La nota de venta no es un comprobante electrónico, así que lleva una leyenda
 * que lo advierte. Estaba escrita a mano en CINCO sitios —ticket web, térmico
 * WiFi, térmico Bluetooth clásico, térmico BLE y PDF— y ya habían empezado a
 * separarse: el PDF decía "PARA EFECTOS TRIBUTARIOS" y los tickets "PARA FINES
 * TRIBUTARIOS".
 *
 * Ahora el negocio puede cambiarla desde Configuración > Documentos. Vive acá
 * para que los cinco digan lo mismo, sea el texto por defecto o el propio.
 */

/** Lo que se imprime si el negocio no configuró nada. */
export const DEFAULT_NOTA_VENTA_LEGEND = 'DOCUMENTO NO VÁLIDO PARA FINES TRIBUTARIOS'

/** Tope de largo: es un pie de ticket, no un espacio para un párrafo. */
export const NOTA_VENTA_LEGEND_MAX = 120

/**
 * Leyenda a imprimir. Un texto vacío o solo espacios cae al de por defecto: si
 * alguien borra el campo sin querer, el ticket no puede quedarse sin la
 * advertencia.
 */
export const getNotaVentaLegend = (companySettings) => {
  const propia = String(companySettings?.notaVentaLegend ?? '').trim()
  return propia || DEFAULT_NOTA_VENTA_LEGEND
}

/**
 * Parte la leyenda en líneas que quepan en el papel térmico.
 *
 * Las impresoras no cortan solas: un texto más largo que el ancho del papel se
 * trunca sin aviso. El texto por defecto ya venía partido a mano en dos líneas;
 * con texto libre hay que calcularlo.
 *
 * @param {string} texto
 * @param {number} charsPorLinea  32 para papel de 58 mm, 48 para 80 mm
 */
export const wrapLegend = (texto, charsPorLinea = 32) => {
  const limpio = String(texto || '').trim()
  if (!limpio) return []

  const lineas = []
  let actual = ''
  for (const palabra of limpio.split(/\s+/)) {
    // Palabra sola más larga que la línea: se deja pasar entera. Cortarla a la
    // mitad sería peor que dejar que la impresora la trunque.
    if (!actual) {
      actual = palabra
    } else if ((actual + ' ' + palabra).length <= charsPorLinea) {
      actual += ' ' + palabra
    } else {
      lineas.push(actual)
      actual = palabra
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}
