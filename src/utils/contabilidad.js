/**
 * LOS CRITERIOS DEL REPORTE CONTABLE.
 *
 * La fecha de cada comprobante, su estado ante SUNAT, sus montos con el signo
 * que le toca y el comprobante que modifica cada nota. Los usan el Excel de
 * Contabilidad (services/accountingExportService), el TXT del registro de ventas
 * (utils/registroDeVentasTxt) y la hoja 14.1 del Excel de Ventas: los archivos
 * que recibe el contador tienen que decir lo mismo. Antes vivían sueltos dentro
 * del servicio del Excel. Sin dependencias pesadas, para probarlo con node.
 */
import { montosPorAfectacion } from '@/utils/peruUtils'

/** Tipo de comprobante en el catálogo 01 de SUNAT. */
export const TIPO_SUNAT = {
  factura: '01', boleta: '03',
  nota_credito: '07', 'nota-credito': '07',
  nota_debito: '08', 'nota-debito': '08',
}

// Fecha del comprobante para el reporte: priorizar la FECHA DE EMISIÓN elegida en el
// POS (emissionDate) por sobre createdAt (fecha de creación del registro). Cuando se
// emite con fecha personalizada, ambas difieren y el reporte contable debe usar la de
// emisión — igual que la pantalla de Contabilidad. Devuelve un Date; las fechas string
// YYYY-MM-DD se fijan al mediodía local para evitar el corrimiento de día por UTC.
export const toReportDate = (v) => {
  if (!v) return null
  if (v.toDate) return v.toDate()
  if (typeof v === 'string') return new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00' : v)
  return new Date(v)
}
export const getInvoiceDate = (inv) => toReportDate(inv.emissionDate || inv.issueDate || inv.createdAt || inv.date)

export const getSunatStatus = (inv) => {
  const s = inv.sunatStatus
  if (s === 'accepted' || s === 'ACEPTADO') return 'accepted'
  if (s === 'rejected' || s === 'RECHAZADO') return 'rejected'
  if (s === 'voided' || s === 'ANULADO') return 'voided'
  return 'pending'
}

/**
 * ¿Suma en el período?
 *
 * Un comprobante ANULADO o RECHAZADO por SUNAT no es una venta: se sigue
 * listando con su estado, pero no suma. El Excel de Contabilidad los sumaba en
 * sus totales, en el resumen de IGV y en los ítems (13-set-2026). Una factura
 * anulada con nota de crédito sí suma: SUNAT la tiene aceptada y la que resta
 * es la nota.
 */
export const cuentaEnLosTotales = (inv) => {
  const estado = getSunatStatus(inv)
  return estado !== 'voided' && estado !== 'rejected'
}

/**
 * ¿Este documento DESHACE una venta?
 *
 * Acepta las dos escrituras que conviven en la base (`nota_credito` y
 * `nota-credito`), igual que el mapa de nombres del Excel.
 */
export const esNotaDeCredito = (docType) =>
  String(docType || '').replace('-', '_') === 'nota_credito'

/**
 * Los montos de un documento COMO LOS CUENTA LA CONTABILIDAD.
 *
 * Una nota de crédito no es una venta más: deshace una. Se guarda en positivo
 * —es un comprobante con su propio total— pero en un reporte contable tiene
 * que RESTAR. Sumándola, el total del período dice que se vendió más de lo que
 * se vendió, y encima crece cada vez que se corrige una venta (observación de
 * JMC, 03-sep-2026). La nota de DÉBITO sí suma: aumenta la deuda. Y lo que no
 * cuenta (anulado o rechazado, ver `cuentaEnLosTotales`) vale cero.
 *
 * Un solo lugar para todo lo que suma plata. El desglose por afectación estaba
 * copiado tres veces, que es justo donde el signo se habría arreglado en una y
 * no en las otras.
 */
export const montosContables = (inv, businessData = null) => {
  const signo = esNotaDeCredito(inv.documentType) ? -1 : 1
  if (!cuentaEnLosTotales(inv)) {
    return { signo, gravada: 0, exonerada: 0, inafecta: 0, subtotal: 0, descuento: 0, igv: 0, total: 0 }
  }
  // "Op. Gravada" es la BASE IMPONIBLE, sin IGV. Antes se recalculaba de los
  // ítems con cantidad x precio, y el precio trae el IGV adentro: la columna
  // decía el importe con IGV y la suma del mes no cuadraba con SUNAT
  // (observación de JMC, 10-set-2026). El criterio vive en peruUtils, el mismo
  // que imprime el desglose en el PDF y el ticket.
  const { gravada, exonerada, inafecta } = montosPorAfectacion(inv, businessData)
  return {
    signo,
    gravada: signo * gravada,
    exonerada: signo * exonerada,
    inafecta: signo * inafecta,
    subtotal: signo * (inv.subtotal || 0),
    descuento: signo * (inv.discount || 0),
    igv: signo * (inv.igv || inv.tax || 0),
    total: signo * (inv.total || 0),
  }
}

/**
 * EL COMPROBANTE QUE MODIFICA UNA NOTA (de crédito o de débito).
 *
 * La nota guarda `referencedDocumentId` ("F001-00000306") y
 * `referencedDocumentType` ('01' o '03'). La hoja 14.1 del Excel de Ventas leía
 * `referenceNumber` y `referenceDocumentType`, que la nota no tiene, y su
 * referencia salía siempre vacía (13-set-2026). Se aceptan los dos nombres.
 *
 * La fecha solo se sabe si el original está en `todos` (lo que se cargó).
 *
 * @returns {null | {fecha: Date|null, tipo: string, serie: string, numero: string}}
 *   null si el documento no es una nota
 */
export const comprobanteQueModifica = (doc, todos = []) => {
  const tipo = TIPO_SUNAT[doc?.documentType]
  if (tipo !== '07' && tipo !== '08') return null
  const referido = String(doc.referencedDocumentId || doc.referenceNumber || '').trim()
  const original = (todos || []).find((d) =>
    (doc.referencedInvoiceFirestoreId && d.id === doc.referencedInvoiceFirestoreId)
    || (referido && d.number === referido)) || null
  const tipoRef = String(doc.referencedDocumentType || doc.referenceDocumentType || '').trim()
  const guion = referido.indexOf('-')
  return {
    fecha: original ? getInvoiceDate(original) : null,
    tipo: TIPO_SUNAT[tipoRef] || (/^0[1-8]$/.test(tipoRef) ? tipoRef : '')
      || (original ? TIPO_SUNAT[original.documentType] || '' : ''),
    serie: guion > 0 ? referido.slice(0, guion) : '',
    numero: guion > 0 ? referido.slice(guion + 1) : referido,
  }
}
