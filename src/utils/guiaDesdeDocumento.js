/**
 * QUÉ DOCUMENTO PUEDE CITAR UNA GUÍA DE REMISIÓN ANTE SUNAT.
 *
 * El documento relacionado de una guía (cac:AdditionalDocumentReference) se
 * valida contra el catálogo 61 de SUNAT: una factura (01) o una boleta (03)
 * sí; una nota de venta o una cotización no, porque no son comprobantes de
 * SUNAT. Antes, todo lo que no era factura salía citado como boleta: la guía
 * hecha desde la nota NG12-00000121 citaba "03-NG12-00000121" y SUNAT la
 * rechazaba con el error 3441 (FERRORAMOS, 15-set-2026).
 *
 * La guía de una nota de venta o de una cotización sale SIN documento
 * relacionado (SUNAT no lo exige en una guía por venta) y el vínculo con su
 * origen queda en `convertedFrom`, solo dentro del sistema
 * (utils/documentLinks lo nombra en pantalla).
 */

/** El código SUNAT con el que la guía cita el documento de origen, o null si no se puede citar. */
export function codigoParaCitar(documento) {
  if (!documento || documento.isPurchase) return null
  if (documento.documentType === 'factura') return '01'
  if (documento.documentType === 'boleta') return '03'
  return null
}

const ORIGENES_INTERNOS = { cotizacion: 'quotation', nota_venta: 'nota_venta' }

/** El vínculo interno con un origen que no se cita ante SUNAT (cotización o nota de venta), o null. */
export function origenInterno(documento) {
  if (!documento?.id || documento.isPurchase) return null
  const type = ORIGENES_INTERNOS[documento.documentType]
  return type ? { type, id: documento.id, number: documento.number || '' } : null
}
