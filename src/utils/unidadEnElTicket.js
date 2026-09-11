import { getUnitShortLabel } from '@/utils/units'
import { unitDisplayName } from '@/data/sunatUnits'

/**
 * LA UNIDAD EN EL TICKET VA UNA SOLA VEZ. Criterio único de los caminos que
 * imprimen un comprobante: el ticket del navegador (InvoiceTicket.jsx), la
 * ticketera de 80 y 58 mm y la de ESC/POS (thermalPrinterService.js) y la
 * Bluetooth (blePrinterService.js).
 *
 * Puede ir en uno de dos lugares:
 *  - DELANTE del nombre, con "Unidad de medida en el ticket" (`showItemUnit`):
 *    "1 SACO Arroz Vilma". En una línea de presentación, la presentación hace
 *    de unidad.
 *  - JUNTO A LA CANTIDAD, en la línea del precio: "2 saco x S/ 125.00". Solo en
 *    productos que se venden por peso o medida (`allowDecimalQuantity`), donde
 *    un "2" suelto no dice si son 2 sacos o 2 kilos.
 *
 * Nunca en los dos. Pasó el 11-set-2026 (GRUPO JC&AN): desde que el POS le pasa
 * al ticket la línea tal como se guardó (d1c0216b), con la opción prendida
 * salía "1 SACO Arroz…" arriba y "1 KILOGRAMO x S/ 138" abajo, porque una
 * presentación sin unidad propia hereda la del producto.
 */

/**
 * La presentación de la línea y el nombre sin ella. Manda `presentationName`;
 * si no lo trae pero el nombre termina en "(...)", ese sufijo es la
 * presentación (líneas guardadas antes de que existiera el campo).
 * @param {object} item  la línea del comprobante
 * @param {string} [nombre]  el nombre a limpiar; por defecto, el de la línea
 * @returns {{ presentacion: string, nombre: string }}
 */
export function presentacionDeLaLinea(item, nombre = item?.name || item?.description || '') {
  let presentacion = item?.presentationName ? String(item.presentationName) : ''
  let limpio = nombre
  if (presentacion) {
    const sufijo = ` (${presentacion})`
    if (limpio.toLowerCase().endsWith(sufijo.toLowerCase())) {
      limpio = limpio.slice(0, limpio.length - sufijo.length)
    }
  } else {
    const suelto = limpio.match(/^(.*\S)\s+\(([^()]+)\)\s*$/)
    if (suelto) {
      limpio = suelto[1]
      presentacion = suelto[2]
    }
  }
  return { presentacion, nombre: limpio }
}

/** Lo que va DELANTE del nombre con la opción: la presentación o la unidad ("SACO", "KILOGRAMO"). */
export function unidadDelante(item, presentacion) {
  return presentacion ? presentacion.toUpperCase() : unitDisplayName(item?.unit)
}

/**
 * La unidad pegada a la cantidad en la línea del precio ("saco" en
 * "2 saco x S/ 125.00"), o '' si no lleva.
 * @param {object} item  la línea del comprobante
 * @param {boolean} yaVaDelante  este ticket ya la imprime delante del nombre
 */
export function unidadJuntoALaCantidad(item, yaVaDelante) {
  if (yaVaDelante) return ''
  return item?.unit && item?.allowDecimalQuantity ? getUnitShortLabel(item.unit) : ''
}
