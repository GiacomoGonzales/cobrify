/**
 * LOS CRITERIOS DEL REPORTE CONTABLE.
 *
 * La fecha de cada comprobante, su estado ante SUNAT y sus montos con el signo
 * que le toca. Los usan el Excel de Contabilidad (services/accountingExportService)
 * y el TXT del registro de ventas (utils/registroDeVentasTxt): los dos archivos
 * que recibe el contador tienen que sumar lo mismo. Antes vivían sueltos dentro
 * del servicio del Excel. Sin dependencias pesadas, para probarlo con node.
 */
import { montosPorAfectacion } from '@/utils/peruUtils'

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
 * JMC, 03-sep-2026). La nota de DÉBITO sí suma: aumenta la deuda.
 *
 * Un solo lugar para todo lo que suma plata. El desglose por afectación estaba
 * copiado tres veces, que es justo donde el signo se habría arreglado en una y
 * no en las otras.
 */
export const montosContables = (inv, businessData = null) => {
  const signo = esNotaDeCredito(inv.documentType) ? -1 : 1
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
