import { getUnitShortLabel } from '@/utils/units'
import { unitDisplayName } from '@/data/sunatUnits'

/**
 * LA UNIDAD EN EL TICKET. Criterio único de los caminos que imprimen un
 * comprobante: el ticket del navegador (InvoiceTicket.jsx), la ticketera de 80
 * y 58 mm y la de ESC/POS (thermalPrinterService.js) y la Bluetooth
 * (blePrinterService.js).
 *
 * Puede ir en dos lugares:
 *  - DELANTE del nombre, con "Unidad de medida en el ticket" (`showItemUnit`,
 *    opción de cada equipo): "2 SACO Arroz". En una línea de presentación, la
 *    presentación hace de unidad.
 *  - JUNTO A LA CANTIDAD, en la línea del precio: "2 saco x S/ 125.00". Solo en
 *    productos que se venden por peso o medida (`allowDecimalQuantity`), donde
 *    un "2" suelto no dice si son 2 sacos o 2 kilos.
 *
 * Con la opción prendida sale en los dos: es lo que pide quien despacha leyendo
 * la cantidad grande (EDIN SOLANO, d1c0216b). Pero el negocio que escribe la
 * unidad en el NOMBRE de sus presentaciones ("SACO", "CAJA") la ve repetida, y
 * contradicha si la presentación no tiene unidad propia: "1 SACO Arroz" arriba
 * y "1 KILOGRAMO x S/ 138" abajo (GRUPO JC&AN, 11-set-2026). Para ese caso está
 * "Solo delante del producto" (`ticketUnidadSoloDelante`). Es del NEGOCIO, no
 * del equipo, porque depende de cómo nombra su catálogo.
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

/** "Solo delante del producto": el negocio pidió no repetir la unidad junto a la cantidad. */
export const soloDelante = (empresa) => empresa?.ticketUnidadSoloDelante === true

/**
 * La unidad pegada a la cantidad en la línea del precio ("saco" en
 * "2 saco x S/ 125.00"), o '' si no lleva.
 * @param {object} item  la línea del comprobante
 * @param {{ showItemUnit?: boolean, empresa?: object }} [opciones]
 *   `showItemUnit`: este ticket pone la unidad delante del nombre; `empresa`:
 *   el negocio, por "Solo delante del producto". Se omite solo con las dos: si
 *   no va delante, junto a la cantidad es el único lugar que le queda.
 */
export function unidadJuntoALaCantidad(item, { showItemUnit = false, empresa = null } = {}) {
  if (showItemUnit && soloDelante(empresa)) return ''
  return item?.unit && item?.allowDecimalQuantity ? getUnitShortLabel(item.unit) : ''
}
