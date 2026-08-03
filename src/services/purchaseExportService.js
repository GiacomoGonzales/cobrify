/**
 * Servicio de exportación a Excel para la página de Compras.
 *
 * Hermano de `invoiceExportService`: misma estructura y los mismos helpers de
 * `excelStyles`, para que ambos reportes se vean y se mantengan igual.
 *
 * Hojas:
 *   1) Compras            — listado con desglose tributario, pago y ubicación
 *   2) Registro de Compras — formato SUNAT 8.1, para el contador
 *   3) Detalle de Items    — una fila por producto/insumo comprado
 *   4) Por Proveedor       — agregado con participación y ticket promedio
 *   5) Cuentas por Pagar   — solo compras al crédito con saldo
 *
 * MONEDA: cada fila va en la moneda NATIVA de la compra; los TOTALES y las hojas
 * agregadas van SIEMPRE en soles, convertidos con el TC congelado de cada
 * documento (`getDocumentRate`). Mezclar USD y PEN sin convertir daba sumas sin
 * sentido — mismo criterio que el reporte de comprobantes.
 */
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { getDocumentRate, getDocumentTotalInBase, normalizeCurrency } from '@/utils/currency'
import { parseLocalDateString } from '@/utils/invoiceDate'
import {
  XLSX,
  cellStyle, centerStyle, numberStyle,
  docTypeBadgeStyle, statusStyle,
  totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applySubtitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
} from './excelStyles'

// =================== HELPERS ===================

/**
 * Fecha de una compra. Prioriza `invoiceDate` (la de la factura del proveedor),
 * igual que la lista y los filtros de la página; `createdAt` es solo cuándo se
 * cargó al sistema y puede ser meses después en compras migradas.
 */
export const getPurchaseDate = (purchase) => {
  const raw = purchase?.invoiceDate || purchase?.createdAt
  if (!raw) return null
  const d = raw.toDate ? raw.toDate() : new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

const fmtDate = (value) => {
  if (!value) return '-'
  const d = value.toDate ? value.toDate() : new Date(value)
  return isNaN(d.getTime()) ? '-' : format(d, 'dd/MM/yyyy', { locale: es })
}

const fmtPurchaseDate = (purchase) => {
  const d = getPurchaseDate(purchase)
  return d ? format(d, 'dd/MM/yyyy', { locale: es }) : 'N/A'
}

/** Formatea una fecha "YYYY-MM-DD" de un input date como dd/MM/yyyy, sin corrimiento UTC. */
const fmtFilterDate = (str) => {
  const d = parseLocalDateString(str)
  return d ? format(d, 'dd/MM/yyyy', { locale: es }) : ''
}

const DOC_TYPE_NAMES = {
  factura: 'Factura', boleta: 'Boleta', ticket: 'Ticket',
  recibo: 'Recibo', nota_venta: 'Nota de Venta', otro: 'Otro',
}

/** Códigos del catálogo 10 de SUNAT para el Registro de Compras. */
const SUNAT_DOC_CODES = {
  factura: '01', boleta: '03', ticket: '12',
  recibo: '02', nota_venta: '00', otro: '00',
}

/** Catálogo 06: tipo de documento de identidad del proveedor. */
const supplierDocCode = (supplier) => {
  const n = (supplier?.documentNumber || '').trim()
  const declared = (supplier?.documentType || '').toUpperCase()
  if (declared === 'RUC' || n.length === 11) return '6'
  if (declared === 'DNI' || n.length === 8) return '1'
  return n ? '0' : '-'
}

/**
 * Reparte el importe de una compra por afectación de IGV a partir de sus items.
 * `factor` convierte a soles (1 para compras en PEN).
 *
 * Si la compra no tiene items utilizables cae al subtotal del documento como
 * gravado: es lo que hacen las compras "solo registro" cargadas por XML sin
 * detalle, y perderlas del reporte sería peor que asumir gravado.
 */
const splitByTaxAffectation = (purchase, factor = 1) => {
  const acc = { gravada: 0, exonerada: 0, inafecta: 0 }
  const items = Array.isArray(purchase.items) ? purchase.items : []
  let counted = 0

  items.forEach(item => {
    const line = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * factor
    counted += line
    if (item.taxAffectation === '20') acc.exonerada += line
    else if (item.taxAffectation === '30') acc.inafecta += line
    else acc.gravada += line
  })

  if (counted === 0) acc.gravada = (Number(purchase.subtotal) || 0) * factor
  return acc
}

/** Saldo pendiente de una compra al crédito. */
const getBalance = (purchase) =>
  Math.max(0, (Number(purchase.total) || 0) - (Number(purchase.paidAmount) || 0))

const PAYMENT_TYPE_NAMES = { contado: 'Contado', credito: 'Crédito' }
const PAYMENT_STATUS_NAMES = { paid: 'Pagada', pending: 'Pendiente', partial: 'Parcial' }

/**
 * Estado de pago mostrado. `paymentStatus` solo distingue paid/pending, así que
 * una compra al crédito con abonos parciales se veía como "Pendiente" a secas.
 */
const paymentStatusLabel = (purchase) => {
  if (purchase.paymentStatus === 'paid') return 'Pagada'
  const paid = Number(purchase.paidAmount) || 0
  const total = Number(purchase.total) || 0
  if (paid > 0.01 && paid < total - 0.01) return 'Parcial'
  return PAYMENT_STATUS_NAMES[purchase.paymentStatus] || 'Pendiente'
}

/** Resumen legible de los items, para la columna "Productos". */
const itemsSummary = (purchase) => {
  const items = Array.isArray(purchase.items) ? purchase.items : []
  return items.map(item => {
    const qty = Number(item.quantity) || 0
    const pres = item.presentationName ? ` ${item.presentationName}` : ''
    let name = `${qty}${pres}x ${item.productName || 'Producto'}`
    if (item.itemType === 'ingredient') name += ' [INSUMO]'
    if (item.isBonus) name += ' [BONIF]'
    if (item.taxAffectation === '20') name += ' [EXO]'
    if (item.taxAffectation === '30') name += ' [INA]'
    return name
  }).join(', ')
}

// =================== REPORTE ===================

/**
 * Genera el Excel de compras.
 *
 * @param {Array}  purchases   - compras YA filtradas por la página
 * @param {Object} filters     - filtros aplicados, para el encabezado
 * @param {Object} businessData- datos del negocio (nombre, RUC)
 * @param {Object} options     - { branchLabel, getBranchName }
 */
export const generatePurchasesExcel = async (purchases, filters = {}, businessData = {}, options = {}) => {
  const { branchLabel = null, getBranchName = () => '' } = options
  const workbook = XLSX.utils.book_new()

  // ============== HOJA 1: COMPRAS ==============
  const headers1 = [
    'Fecha', 'Tipo', 'Nro. Documento', 'Proveedor', 'RUC/DNI', 'Productos',
    'Op. Gravada', 'Op. Exonerada', 'Op. Inafecta', 'Subtotal', 'IGV', 'Total',
    'Moneda', 'T.C.', 'Tipo de Pago', 'Estado', 'Pagado', 'Saldo', 'Vencimiento',
    'Almacén', 'Sucursal', 'Afecta Stock', 'Notas', 'Registrado por', 'Fecha de Registro',
  ]
  const totalCols1 = headers1.length

  const aoa1 = []
  aoa1.push(['REPORTE DE COMPRAS'])
  aoa1.push([])

  const extra = []
  if (filters?.startDate) extra.push(['Fecha Desde:', fmtFilterDate(filters.startDate)])
  if (filters?.endDate) extra.push(['Fecha Hasta:', fmtFilterDate(filters.endDate)])
  if (filters?.docTypeLabel) extra.push(['Tipo de Documento:', filters.docTypeLabel])
  if (filters?.paymentTypeLabel) extra.push(['Tipo de Pago:', filters.paymentTypeLabel])
  if (filters?.paymentStatusLabel) extra.push(['Estado de Pago:', filters.paymentStatusLabel])
  if (filters?.supplierLabel) extra.push(['Proveedor:', filters.supplierLabel])

  const metaStart = aoa1.length
  aoa1.push(...buildBusinessMetadataRows(businessData, {
    branchLabel: branchLabel || 'Todas',
    totalItems: purchases.length,
    totalLabel: 'Total de compras',
    extra,
  }))
  const metaEndRow = aoa1.length - 1
  aoa1.push([])

  const subtitleRow = aoa1.length
  aoa1.push(['LISTADO DE COMPRAS'])
  aoa1.push([])

  const header1Row = aoa1.length
  aoa1.push(headers1)

  const dataStart1 = aoa1.length
  const rowDocTypes = []

  purchases.forEach(purchase => {
    const docType = purchase.invoiceDocType || 'factura'
    rowDocTypes.push(docType)

    const rowCurrency = normalizeCurrency(purchase.currency)
    const rowRate = getDocumentRate(purchase)
    // Los importes de la fila van en su moneda nativa (factor 1).
    const buckets = splitByTaxAffectation(purchase, 1)

    aoa1.push([
      fmtPurchaseDate(purchase),
      DOC_TYPE_NAMES[docType] || docType,
      purchase.invoiceNumber || 'S/N',
      purchase.supplier?.businessName || 'Sin proveedor',
      purchase.supplier?.documentNumber || '-',
      itemsSummary(purchase),
      Number(buckets.gravada.toFixed(2)),
      Number(buckets.exonerada.toFixed(2)),
      Number(buckets.inafecta.toFixed(2)),
      Number((Number(purchase.subtotal) || 0).toFixed(2)),
      Number((Number(purchase.igv) || 0).toFixed(2)),
      Number((Number(purchase.total) || 0).toFixed(2)),
      rowCurrency,
      rowCurrency === 'PEN' ? '' : Number(rowRate.toFixed(3)),
      PAYMENT_TYPE_NAMES[purchase.paymentType] || 'Contado',
      paymentStatusLabel(purchase),
      Number((Number(purchase.paidAmount) || 0).toFixed(2)),
      Number(getBalance(purchase).toFixed(2)),
      purchase.dueDate ? fmtDate(purchase.dueDate) : '-',
      purchase.warehouseName || '-',
      getBranchName(purchase) || '-',
      purchase.affectsStock === false ? 'No' : 'Sí',
      purchase.notes || '',
      purchase.createdByName || purchase.createdByEmail || '-',
      fmtDate(purchase.createdAt),
    ])
  })

  // Totales SIEMPRE en soles, con el TC congelado de cada compra.
  const sums = purchases.reduce((acc, p) => {
    const rate = getDocumentRate(p)
    const b = splitByTaxAffectation(p, rate)
    acc.gravada += b.gravada
    acc.exonerada += b.exonerada
    acc.inafecta += b.inafecta
    acc.subtotal += (Number(p.subtotal) || 0) * rate
    acc.igv += (Number(p.igv) || 0) * rate
    acc.total += getDocumentTotalInBase(p)
    acc.pagado += (Number(p.paidAmount) || 0) * rate
    acc.saldo += getBalance(p) * rate
    return acc
  }, { gravada: 0, exonerada: 0, inafecta: 0, subtotal: 0, igv: 0, total: 0, pagado: 0, saldo: 0 })

  aoa1.push([])
  const totalRow = aoa1.length
  aoa1.push([
    '', '', '', '', '', 'TOTALES (S/):',
    Number(sums.gravada.toFixed(2)),
    Number(sums.exonerada.toFixed(2)),
    Number(sums.inafecta.toFixed(2)),
    Number(sums.subtotal.toFixed(2)),
    Number(sums.igv.toFixed(2)),
    Number(sums.total.toFixed(2)),
    '', '', '', '',
    Number(sums.pagado.toFixed(2)),
    Number(sums.saldo.toFixed(2)),
    '', '', '', '', '', '', '',
  ])

  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  applyColumnWidths(ws1, [
    12, 12, 18, 32, 14, 45, 13, 14, 13, 12, 11, 12, 9, 8, 13, 12, 12, 12, 13,
    20, 20, 12, 30, 22, 16,
  ])
  applyTitleRow(ws1, 0, totalCols1)
  applyMetadataRows(ws1, metaStart, metaEndRow)
  applySubtitleRow(ws1, subtitleRow, totalCols1)
  applyHeaderRow(ws1, header1Row, totalCols1)

  for (let i = 0; i < purchases.length; i++) {
    const r = dataStart1 + i
    setStyle(ws1, r, 0, centerStyle(i))
    setStyle(ws1, r, 1, docTypeBadgeStyle(rowDocTypes[i]))
    setStyle(ws1, r, 2, centerStyle(i))
    setStyle(ws1, r, 3, cellStyle(i))
    setStyle(ws1, r, 4, centerStyle(i))
    setStyle(ws1, r, 5, cellStyle(i))
    for (let c = 6; c <= 11; c++) setStyle(ws1, r, c, numberStyle(i))
    setStyle(ws1, r, 12, centerStyle(i))
    setStyle(ws1, r, 13, numberStyle(i))
    setStyle(ws1, r, 14, centerStyle(i))
    setStyle(ws1, r, 15, statusStyle(i, aoa1[r][15]))
    setStyle(ws1, r, 16, numberStyle(i))
    setStyle(ws1, r, 17, numberStyle(i))
    setStyle(ws1, r, 18, centerStyle(i))
    setStyle(ws1, r, 19, cellStyle(i))
    setStyle(ws1, r, 20, cellStyle(i))
    setStyle(ws1, r, 21, centerStyle(i))
    setStyle(ws1, r, 22, cellStyle(i))
    setStyle(ws1, r, 23, cellStyle(i))
    setStyle(ws1, r, 24, centerStyle(i))
  }

  for (let c = 0; c < totalCols1; c++) {
    if (c === 5) setStyle(ws1, totalRow, c, totalLabelStyle)
    else if ((c >= 6 && c <= 11) || c === 16 || c === 17) setStyle(ws1, totalRow, c, totalNumberStyle)
    else setStyle(ws1, totalRow, c, { ...totalNumberStyle, alignment: { horizontal: 'left', vertical: 'center' } })
  }

  applyFreezeBelow(ws1, header1Row)
  XLSX.utils.book_append_sheet(workbook, ws1, 'Compras')

  // ============== HOJA 2: REGISTRO DE COMPRAS (SUNAT 8.1) ==============
  appendPurchaseRegisterSheet(workbook, purchases, businessData, filters)

  // ============== HOJAS DE ANALÍTICA ==============
  appendItemsDetailSheet(workbook, purchases, businessData, branchLabel)
  appendSuppliersSheet(workbook, purchases, businessData, branchLabel)
  appendPayablesSheet(workbook, purchases, businessData, branchLabel)

  const dateInfo = (filters?.startDate || filters?.endDate) ? 'filtrado' : ''
  const fileName = buildExcelFileName('Compras', [dateInfo])

  await saveAndShareExcel(workbook, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de compras: ${fileName}`,
    subDirectory: 'Compras',
  })
}

// =================== HOJA 2: REGISTRO DE COMPRAS ===================

/**
 * Formato del Registro de Compras de SUNAT (8.1). Los importes van SIEMPRE en
 * soles —así lo exige el formato— y el TC de cada documento se consigna en su
 * propia columna.
 */
function appendPurchaseRegisterSheet(wb, purchases, businessData, filters) {
  const headers = [
    'CUO', 'Fecha Emisión', 'Fecha Vencimiento', 'Tipo Comprobante', 'Serie', 'Número',
    'Tipo Doc. Proveedor', 'Nro Doc. Proveedor', 'Razón Social / Nombre',
    'Base Imponible Gravada', 'IGV', 'Importe Exonerado', 'Importe Inafecto',
    'ISC', 'Otros Tributos', 'Importe Total', 'Tipo Cambio',
  ]
  const totalCols = headers.length

  const aoa = []
  aoa.push(['REGISTRO DE COMPRAS'])
  aoa.push([])

  const metaStart = aoa.length
  aoa.push(['RUC:', businessData?.ruc || 'N/A'])
  aoa.push(['Razón Social:', businessData?.name || 'N/A'])
  aoa.push(['Período:', filters?.startDate && filters?.endDate
    ? `${fmtFilterDate(filters.startDate)} - ${fmtFilterDate(filters.endDate)}`
    : format(new Date(), 'MM/yyyy', { locale: es })])
  const metaEnd = aoa.length - 1
  aoa.push([])

  const headerRow = aoa.length
  aoa.push(headers)

  // El registro va en orden cronológico, no en el orden de pantalla.
  const sorted = [...purchases].sort((a, b) => {
    const dA = getPurchaseDate(a) || new Date(0)
    const dB = getPurchaseDate(b) || new Date(0)
    return dA - dB
  })

  const dataStart = aoa.length
  const totals = { gravada: 0, igv: 0, exonerada: 0, inafecta: 0, total: 0 }

  sorted.forEach((purchase, index) => {
    const rate = getDocumentRate(purchase)
    const b = splitByTaxAffectation(purchase, rate)
    const igv = (Number(purchase.igv) || 0) * rate
    const total = getDocumentTotalInBase(purchase)
    const parts = (purchase.invoiceNumber || '').split('-')
    const serie = parts.length > 1 ? parts[0] : ''
    const numero = parts.length > 1 ? parts.slice(1).join('-') : (purchase.invoiceNumber || '')

    totals.gravada += b.gravada
    totals.igv += igv
    totals.exonerada += b.exonerada
    totals.inafecta += b.inafecta
    totals.total += total

    aoa.push([
      index + 1,
      fmtPurchaseDate(purchase),
      purchase.dueDate ? fmtDate(purchase.dueDate) : '',
      SUNAT_DOC_CODES[purchase.invoiceDocType || 'factura'] || '00',
      serie,
      numero,
      supplierDocCode(purchase.supplier),
      purchase.supplier?.documentNumber || '',
      purchase.supplier?.businessName || '',
      Number(b.gravada.toFixed(2)),
      Number(igv.toFixed(2)),
      Number(b.exonerada.toFixed(2)),
      Number(b.inafecta.toFixed(2)),
      0,
      0,
      Number(total.toFixed(2)),
      Number(rate.toFixed(3)),
    ])
  })

  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push([
    '', '', '', '', '', '', '', '', 'TOTALES (S/):',
    Number(totals.gravada.toFixed(2)),
    Number(totals.igv.toFixed(2)),
    Number(totals.exonerada.toFixed(2)),
    Number(totals.inafecta.toFixed(2)),
    0, 0,
    Number(totals.total.toFixed(2)),
    '',
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [8, 13, 15, 16, 10, 14, 16, 16, 34, 18, 12, 16, 15, 10, 13, 14, 11])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  for (let i = 0; i < sorted.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    for (let c = 1; c <= 8; c++) setStyle(ws, r, c, c === 8 ? cellStyle(i) : centerStyle(i))
    for (let c = 9; c <= 16; c++) setStyle(ws, r, c, numberStyle(i))
  }
  for (let c = 0; c < totalCols; c++) {
    if (c === 8) setStyle(ws, totalRowIdx, c, totalLabelStyle)
    else if (c >= 9 && c <= 15) setStyle(ws, totalRowIdx, c, totalNumberStyle)
    else setStyle(ws, totalRowIdx, c, { ...totalNumberStyle, alignment: { horizontal: 'left', vertical: 'center' } })
  }

  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Registro de Compras')
}

// =================== HOJA 3: DETALLE DE ITEMS ===================

/** Una fila por producto o insumo comprado, con lote, vencimiento y variante. */
function appendItemsDetailSheet(wb, purchases, businessData, branchLabel) {
  const headers = [
    'Fecha', 'Nro. Documento', 'Proveedor', 'Producto', 'Tipo', 'Variante (SKU)',
    'Lote', 'Vencimiento', 'Cantidad', 'Presentación', 'Unidades Base', 'Unidad',
    'Costo Unitario', 'Total Línea', 'Afectación IGV', 'Bonificación', 'Moneda',
  ]
  const totalCols = headers.length

  const aoa = []
  aoa.push(['DETALLE DE ITEMS COMPRADOS'])
  aoa.push([])
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, { branchLabel: branchLabel || 'Todas' }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const affectationNames = { 10: 'Gravado', 20: 'Exonerado', 30: 'Inafecto' }
  let totalLineas = 0
  let rowCount = 0

  purchases.forEach(purchase => {
    const items = Array.isArray(purchase.items) ? purchase.items : []
    const rate = getDocumentRate(purchase)
    const ccy = normalizeCurrency(purchase.currency)

    items.forEach(item => {
      const qty = Number(item.quantity) || 0
      const unitPrice = Number(item.unitPrice) || 0
      const line = qty * unitPrice
      // El factor de presentación permite reconstruir las unidades base: la
      // cantidad y el costo quedan guardados POR PRESENTACIÓN (caja, docena…).
      const factor = Number(item.presentationFactor) > 1 ? Number(item.presentationFactor) : 1
      totalLineas += line * rate
      rowCount++

      aoa.push([
        fmtPurchaseDate(purchase),
        purchase.invoiceNumber || 'S/N',
        purchase.supplier?.businessName || 'Sin proveedor',
        item.productName || 'Producto',
        item.itemType === 'ingredient' ? 'Insumo' : 'Producto',
        item.variantSku || '-',
        item.batchNumber || '-',
        item.expirationDate ? fmtDate(item.expirationDate) : '-',
        qty,
        item.presentationName || '-',
        Number((qty * factor).toFixed(2)),
        item.unit || 'NIU',
        Number(unitPrice.toFixed(4)),
        Number(line.toFixed(2)),
        affectationNames[item.taxAffectation] || 'Gravado',
        item.isBonus ? 'Sí' : '',
        ccy,
      ])
    })
  })

  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push([
    '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL (S/):',
    Number(totalLineas.toFixed(2)), '', '', '',
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [12, 18, 30, 34, 11, 18, 14, 13, 11, 15, 14, 9, 14, 14, 14, 13, 9])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  for (let i = 0; i < rowCount; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    for (let c = 4; c <= 7; c++) setStyle(ws, r, c, centerStyle(i))
    setStyle(ws, r, 8, numberStyle(i))
    setStyle(ws, r, 9, centerStyle(i))
    setStyle(ws, r, 10, numberStyle(i))
    setStyle(ws, r, 11, centerStyle(i))
    setStyle(ws, r, 12, numberStyle(i))
    setStyle(ws, r, 13, numberStyle(i))
    setStyle(ws, r, 14, centerStyle(i))
    setStyle(ws, r, 15, centerStyle(i))
    setStyle(ws, r, 16, centerStyle(i))
  }
  setStyle(ws, totalRowIdx, 12, totalLabelStyle)
  setStyle(ws, totalRowIdx, 13, totalNumberStyle)

  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Detalle de Items')
}

// =================== HOJA 4: POR PROVEEDOR ===================

/** Agregado por proveedor: cuánto se le compró, qué participación y qué debemos. */
function appendSuppliersSheet(wb, purchases, businessData, branchLabel) {
  const headers = ['Proveedor', 'RUC/DNI', 'Compras', 'Total (S/)', '% del Total', 'Compra Promedio (S/)', 'Saldo Pendiente (S/)', 'Última Compra']
  const totalCols = headers.length

  const map = new Map()
  purchases.forEach(p => {
    const key = p.supplier?.documentNumber || p.supplier?.businessName || 'Sin proveedor'
    const rate = getDocumentRate(p)
    const prev = map.get(key) || {
      name: p.supplier?.businessName || 'Sin proveedor',
      doc: p.supplier?.documentNumber || '-',
      count: 0, amount: 0, balance: 0, last: null,
    }
    prev.count++
    prev.amount += getDocumentTotalInBase(p)
    prev.balance += getBalance(p) * rate
    const d = getPurchaseDate(p)
    if (d && (!prev.last || d > prev.last)) prev.last = d
    map.set(key, prev)
  })

  const rows = [...map.values()].sort((a, b) => b.amount - a.amount)
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)

  const aoa = []
  aoa.push(['COMPRAS POR PROVEEDOR'])
  aoa.push([])
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, { branchLabel: branchLabel || 'Todas' }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalCount = 0
  let totalBalance = 0
  rows.forEach(r => {
    const pct = totalAmount > 0 ? (r.amount / totalAmount) * 100 : 0
    totalCount += r.count
    totalBalance += r.balance
    aoa.push([
      r.name, r.doc, r.count,
      Number(r.amount.toFixed(2)),
      Number(pct.toFixed(1)),
      Number((r.count > 0 ? r.amount / r.count : 0).toFixed(2)),
      Number(r.balance.toFixed(2)),
      r.last ? format(r.last, 'dd/MM/yyyy', { locale: es }) : '-',
    ])
  })

  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTALES', '', totalCount, Number(totalAmount.toFixed(2)), 100, '', Number(totalBalance.toFixed(2)), ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [34, 14, 11, 16, 13, 20, 20, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    for (let c = 2; c <= 6; c++) setStyle(ws, r, c, numberStyle(i))
    setStyle(ws, r, 7, centerStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, totalLabelStyle)
  for (let c = 2; c <= 6; c++) setStyle(ws, totalRowIdx, c, totalNumberStyle)
  setStyle(ws, totalRowIdx, 7, totalLabelStyle)

  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Proveedor')
}

// =================== HOJA 5: CUENTAS POR PAGAR ===================

/** Solo las compras con saldo. Si no hay ninguna, la hoja no se agrega. */
function appendPayablesSheet(wb, purchases, businessData, branchLabel) {
  const pendientes = purchases.filter(p => getBalance(p) > 0.01)
  if (pendientes.length === 0) return

  const headers = ['Proveedor', 'RUC/DNI', 'Nro. Documento', 'Fecha', 'Vencimiento', 'Días de Atraso', 'Total', 'Pagado', 'Saldo', 'Moneda', 'Estado']
  const totalCols = headers.length

  // Medianoche de hoy: comparar contra la hora actual haría que un vencimiento
  // de hoy contara como atrasado desde las 00:01.
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const rows = [...pendientes].sort((a, b) => {
    const dA = a.dueDate ? (a.dueDate.toDate ? a.dueDate.toDate() : new Date(a.dueDate)) : null
    const dB = b.dueDate ? (b.dueDate.toDate ? b.dueDate.toDate() : new Date(b.dueDate)) : null
    // Sin vencimiento al final: no se pueden ordenar por urgencia.
    if (!dA && !dB) return 0
    if (!dA) return 1
    if (!dB) return -1
    return dA - dB
  })

  const aoa = []
  aoa.push(['CUENTAS POR PAGAR'])
  aoa.push([])
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, { branchLabel: branchLabel || 'Todas' }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalSaldo = 0
  rows.forEach(p => {
    const due = p.dueDate ? (p.dueDate.toDate ? p.dueDate.toDate() : new Date(p.dueDate)) : null
    let diasAtraso = ''
    if (due) {
      const d = new Date(due)
      d.setHours(0, 0, 0, 0)
      const diff = Math.round((hoy - d) / 86400000)
      diasAtraso = diff > 0 ? diff : 0
    }
    totalSaldo += getBalance(p) * getDocumentRate(p)

    aoa.push([
      p.supplier?.businessName || 'Sin proveedor',
      p.supplier?.documentNumber || '-',
      p.invoiceNumber || 'S/N',
      fmtPurchaseDate(p),
      due ? fmtDate(due) : 'Sin fecha',
      diasAtraso,
      Number((Number(p.total) || 0).toFixed(2)),
      Number((Number(p.paidAmount) || 0).toFixed(2)),
      Number(getBalance(p).toFixed(2)),
      normalizeCurrency(p.currency),
      diasAtraso > 0 ? 'Vencida' : 'Pendiente',
    ])
  })

  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', '', 'TOTAL SALDO (S/):', '', '', Number(totalSaldo.toFixed(2)), '', ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [32, 14, 18, 12, 13, 15, 13, 13, 13, 9, 13])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    for (let c = 1; c <= 4; c++) setStyle(ws, r, c, centerStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
    for (let c = 6; c <= 8; c++) setStyle(ws, r, c, numberStyle(i))
    setStyle(ws, r, 9, centerStyle(i))
    setStyle(ws, r, 10, statusStyle(i, aoa[r][10]))
  }
  setStyle(ws, totalRowIdx, 5, totalLabelStyle)
  setStyle(ws, totalRowIdx, 8, totalNumberStyle)

  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Cuentas por Pagar')
}
