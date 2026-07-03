/**
 * Servicio de exportación a Excel para la página de Comprobantes.
 * Genera dos hojas:
 *   1) Listado de comprobantes con desglose tributario + estado SUNAT
 *   2) Registro de Ventas e Ingresos (formato SUNAT 14.1)
 *
 * Toda la presentación (estilos, layout, descarga) está delegada a excelStyles.
 */
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { getDocumentRate, getDocumentTotalInBase, normalizeCurrency } from '@/utils/currency'
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

/** Formatea los métodos de pago de una factura. */
const formatPaymentMethods = (invoice) => {
  if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    if (invoice.payments.length === 1) return invoice.payments[0].method || 'Efectivo'
    return invoice.payments.map(p => `${p.method}: S/${(p.amount || 0).toFixed(2)}`).join(' + ')
  }
  return invoice.paymentMethod || 'Efectivo'
}

/**
 * Generar reporte de facturas en Excel con estilos.
 */
export const generateInvoicesExcel = async (invoices, filters, businessData, branchLabel = null) => {
  const workbook = XLSX.utils.book_new()

  // ============== HOJA 1: COMPROBANTES ==============
  const headers1 = [
    'Fecha', 'Tipo', 'Número', 'Cliente', 'RUC/DNI', 'Alumno', 'Productos',
    'Op. Gravada', 'Op. Exonerada', 'Op. Inafecta', 'Subtotal', 'Descuento',
    'IGV', 'Total', 'Moneda', 'T.C.', 'Estado', 'Estado SUNAT', 'Método de Pago', 'Vendedor',
  ]
  const totalCols1 = headers1.length

  const aoa1 = []
  aoa1.push(['REPORTE DE COMPROBANTES EMITIDOS'])
  aoa1.push([])

  // Metadata del negocio + filtros aplicados como "extra"
  const extra = []
  if (filters?.type && filters.type !== 'all') {
    const typeLabels = {
      factura: 'Facturas', boleta: 'Boletas',
      'nota-credito': 'Notas de Crédito', 'nota-debito': 'Notas de Débito',
    }
    extra.push(['Tipo de Comprobante:', typeLabels[filters.type] || filters.type])
  }
  if (filters?.startDate) extra.push(['Fecha Desde:', format(new Date(filters.startDate), 'dd/MM/yyyy', { locale: es })])
  if (filters?.endDate) extra.push(['Fecha Hasta:', format(new Date(filters.endDate), 'dd/MM/yyyy', { locale: es })])
  if (filters?.sellerLabel) extra.push(['Vendedor:', filters.sellerLabel])
  if (filters?.paymentStatusLabel) extra.push(['Estado de Pago:', filters.paymentStatusLabel])
  if (filters?.paymentMethodLabel) extra.push(['Método de Pago:', filters.paymentMethodLabel])
  if (filters?.sunatStatusLabel) extra.push(['Estado SUNAT:', filters.sunatStatusLabel])

  const metaStart = aoa1.length
  const metadataRows = buildBusinessMetadataRows(businessData, {
    branchLabel: branchLabel || 'Todas',
    extra,
  })
  aoa1.push(...metadataRows)
  const metaEndRow = aoa1.length - 1
  aoa1.push([])

  const subtitleRow = aoa1.length
  aoa1.push(['LISTADO DE COMPROBANTES'])
  aoa1.push([])

  const header1Row = aoa1.length
  aoa1.push(headers1)

  // Diccionarios de mapeo
  const typeNames = {
    factura: 'Factura', boleta: 'Boleta', nota_venta: 'Nota de Venta',
    nota_credito: 'Nota de Crédito', nota_debito: 'Nota de Débito',
    'nota-credito': 'Nota de Crédito', 'nota-debito': 'Nota de Débito',
  }
  const statusNames = {
    draft: 'Borrador', pending: 'Pendiente', paid: 'Pagado',
    sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada', cancelled: 'Anulada',
  }
  const sunatStatusNames = {
    accepted: 'Aceptado', pending: 'Pendiente', sending: 'Enviando',
    rejected: 'Rechazado', voided: 'Anulado', voiding: 'Anulando',
    SIGNED: 'Firmado', signed: 'Firmado', not_applicable: 'N/A',
  }

  const dataStart1 = aoa1.length
  const invoiceDocTypes = [] // Para estilizar el badge

  invoices.forEach(invoice => {
    const docType = invoice.documentType || invoice.type || 'N/A'
    invoiceDocTypes.push(docType)
    const customerName = invoice.customer?.name || invoice.customer?.businessName || invoice.customerName || 'Cliente General'
    const customerDoc = invoice.customer?.documentNumber || invoice.customerDocumentNumber || 'N/A'
    const studentName = invoice.customer?.studentName || invoice.studentName || ''

    const productsList = invoice.items && Array.isArray(invoice.items)
      ? invoice.items.map(item => {
          const name = `${item.quantity || 1}x ${item.name || item.description || 'Producto'}`
          if (item.taxAffectation === '20') return `${name} [EXO]`
          if (item.taxAffectation === '30') return `${name} [INA]`
          return name
        }).join(', ')
      : ''

    let opGravada = 0, opExonerada = 0, opInafecta = 0
    if (invoice.items && Array.isArray(invoice.items)) {
      invoice.items.forEach(item => {
        const itemTotal = (item.quantity || 1) * (item.price || item.unitPrice || 0)
        if (item.taxAffectation === '20') opExonerada += itemTotal
        else if (item.taxAffectation === '30') opInafecta += itemTotal
        else opGravada += itemTotal
      })
    }

    const sunatStatus = invoice.documentType === 'nota_venta'
      ? 'N/A'
      : (sunatStatusNames[invoice.sunatStatus] || invoice.sunatStatus || 'Pendiente')

    const sellerName = invoice.createdByName || invoice.sellerName || invoice.createdByEmail || 'Sin vendedor'
    // Moneda del comprobante: los montos de la fila van en su moneda NATIVA;
    // la fila de TOTALES convierte todo a soles con el TC congelado de cada doc.
    const rowCurrency = normalizeCurrency(invoice.currency)
    const rowRate = getDocumentRate(invoice)

    aoa1.push([
      invoice.createdAt?.toDate ? format(invoice.createdAt.toDate(), 'dd/MM/yyyy', { locale: es }) : 'N/A',
      typeNames[docType] || docType || 'N/A',
      invoice.number || 'N/A',
      customerName,
      customerDoc,
      studentName,
      productsList,
      Number(opGravada.toFixed(2)),
      Number(opExonerada.toFixed(2)),
      Number(opInafecta.toFixed(2)),
      Number((invoice.subtotal || 0).toFixed(2)),
      Number((invoice.discount || 0).toFixed(2)),
      Number((invoice.igv || invoice.tax || 0).toFixed(2)),
      Number((invoice.total || 0).toFixed(2)),
      rowCurrency,
      rowCurrency === 'PEN' ? '' : Number(rowRate.toFixed(3)),
      statusNames[invoice.status] || invoice.status || 'N/A',
      sunatStatus,
      formatPaymentMethods(invoice),
      sellerName,
    ])
  })

  // Totales SIEMPRE en soles: cada documento se convierte con su TC congelado
  // (antes se sumaban USD y PEN sin convertir → totales sin sentido si había USD).
  const subtotalSum = invoices.reduce((s, i) => s + (i.subtotal || 0) * getDocumentRate(i), 0)
  const discountSum = invoices.reduce((s, i) => s + (i.discount || 0) * getDocumentRate(i), 0)
  const taxSum = invoices.reduce((s, i) => s + (i.igv || i.tax || 0) * getDocumentRate(i), 0)
  const totalSum = invoices.reduce((s, i) => s + getDocumentTotalInBase(i), 0)
  const taxBuckets = invoices.reduce((acc, inv) => {
    const rate = getDocumentRate(inv)
    inv.items?.forEach(item => {
      const t = (item.quantity || 1) * (item.price || item.unitPrice || 0) * rate
      if (item.taxAffectation === '20') acc.e += t
      else if (item.taxAffectation === '30') acc.i += t
      else acc.g += t
    })
    return acc
  }, { g: 0, e: 0, i: 0 })

  aoa1.push([])
  const totalRow = aoa1.length
  aoa1.push([
    '', '', '', '', '', '', 'TOTALES (S/):',
    Number(taxBuckets.g.toFixed(2)),
    Number(taxBuckets.e.toFixed(2)),
    Number(taxBuckets.i.toFixed(2)),
    Number(subtotalSum.toFixed(2)),
    Number(discountSum.toFixed(2)),
    Number(taxSum.toFixed(2)),
    Number(totalSum.toFixed(2)),
    '', '', '', '', '', '',
  ])

  // Crear worksheet
  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)

  applyColumnWidths(ws1, [
    12, 14, 14, 30, 14, 22, 45, 13, 14, 13, 12, 11, 10, 12, 9, 8, 12, 14, 30, 22,
  ])

  // Layout: título / metadata / subtítulo / header
  applyTitleRow(ws1, 0, totalCols1)
  applyMetadataRows(ws1, metaStart, metaEndRow)
  applySubtitleRow(ws1, subtitleRow, totalCols1)
  applyHeaderRow(ws1, header1Row, totalCols1)

  // Filas de datos
  for (let i = 0; i < invoices.length; i++) {
    const r = dataStart1 + i
    const docType = invoiceDocTypes[i]
    setStyle(ws1, r, 0, centerStyle(i))       // Fecha
    setStyle(ws1, r, 1, docTypeBadgeStyle(docType)) // Tipo (badge)
    setStyle(ws1, r, 2, centerStyle(i))       // Número
    setStyle(ws1, r, 3, cellStyle(i))         // Cliente
    setStyle(ws1, r, 4, centerStyle(i))       // RUC/DNI
    setStyle(ws1, r, 5, cellStyle(i))         // Alumno
    setStyle(ws1, r, 6, cellStyle(i))         // Productos
    for (let c = 7; c <= 13; c++) setStyle(ws1, r, c, numberStyle(i))
    setStyle(ws1, r, 14, centerStyle(i)) // Moneda
    setStyle(ws1, r, 15, numberStyle(i)) // T.C.
    setStyle(ws1, r, 16, statusStyle(i, aoa1[r][16]))
    setStyle(ws1, r, 17, statusStyle(i, aoa1[r][17]))
    setStyle(ws1, r, 18, cellStyle(i))
    setStyle(ws1, r, 19, cellStyle(i)) // Vendedor
  }

  // Fila de totales
  for (let c = 0; c < totalCols1; c++) {
    if (c === 6) setStyle(ws1, totalRow, c, totalLabelStyle)
    else if (c >= 7 && c <= 13) setStyle(ws1, totalRow, c, totalNumberStyle)
    else setStyle(ws1, totalRow, c, { ...totalNumberStyle, alignment: { horizontal: 'left', vertical: 'center' } })
  }

  applyFreezeBelow(ws1, header1Row)
  XLSX.utils.book_append_sheet(workbook, ws1, 'Comprobantes')

  // ============== HOJA 2: REGISTRO DE VENTAS (SUNAT 14.1) ==============
  const headers2 = [
    'CUO', 'Fecha Emisión', 'Fecha Vencimiento', 'Tipo Comprobante', 'Serie', 'Número',
    'Tipo Doc. Cliente', 'Nro Doc. Cliente', 'Razón Social / Nombre',
    'Base Imponible', 'Descuento Base Imp.', 'IGV', 'Importe Exonerado', 'Importe Inafecto',
    'ISC', 'Otros Tributos', 'Importe Total', 'Tipo Cambio',
    'Tipo Comp. Ref.', 'Serie Comp. Ref.', 'Número Comp. Ref.', 'Estado',
  ]
  const totalCols2 = headers2.length

  const aoa2 = []
  aoa2.push(['REGISTRO DE VENTAS E INGRESOS'])
  aoa2.push([])

  const meta2Start = aoa2.length
  aoa2.push(['RUC:', businessData?.ruc || 'N/A'])
  aoa2.push(['Razón Social:', businessData?.name || 'N/A'])
  aoa2.push(['Período:', filters?.startDate && filters?.endDate
    ? `${format(new Date(filters.startDate), 'dd/MM/yyyy', { locale: es })} - ${format(new Date(filters.endDate), 'dd/MM/yyyy', { locale: es })}`
    : format(new Date(), 'MM/yyyy', { locale: es })])
  const meta2End = aoa2.length - 1
  aoa2.push([])

  const header2Row = aoa2.length
  aoa2.push(headers2)

  const sunatDocTypeCodes = {
    factura: '01', boleta: '03', nota_venta: '00',
    nota_credito: '07', nota_debito: '08',
    'nota-credito': '07', 'nota-debito': '08',
  }
  const sunatIdTypeCodes = { '1': '1', '6': '6', '0': '0', '4': '4', '7': '7', A: 'A' }

  const sorted = [...invoices].sort((a, b) => {
    const dA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
    const dB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
    return dA - dB
  })

  const dataStart2 = aoa2.length
  sorted.forEach((invoice, index) => {
    const invoiceDate = invoice.createdAt?.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
    const docType = invoice.documentType || 'boleta'
    const parts = (invoice.number || '').split('-')
    const serie = parts[0] || ''
    const numero = parts.slice(1).join('-') || ''

    const customerDocType = invoice.customer?.documentType || '0'
    const customerDocNumber = invoice.customer?.documentNumber || ''

    // Registro de Ventas: los importes van SIEMPRE en soles (formato SUNAT).
    // Los documentos en USD se convierten con su TC congelado y el TC se
    // consigna en la columna "Tipo Cambio" (antes iba 1.000 fijo).
    const sunatRate = getDocumentRate(invoice)
    let baseImponible = 0, importeExonerado = 0, importeInafecto = 0
    if (invoice.items && Array.isArray(invoice.items)) {
      invoice.items.forEach(item => {
        const itemTotal = (item.quantity || 1) * (item.price || item.unitPrice || 0) * sunatRate
        if (item.taxAffectation === '20') importeExonerado += itemTotal
        else if (item.taxAffectation === '30') importeInafecto += itemTotal
        else baseImponible += itemTotal
      })
    }

    const refDocType = invoice.referenceDocumentType ? (sunatDocTypeCodes[invoice.referenceDocumentType] || '') : ''
    const refParts = (invoice.referenceNumber || '').split('-')
    const refSerie = refParts[0] || ''
    const refNumero = refParts.slice(1).join('-') || ''

    let estado = '1'
    if (invoice.status === 'cancelled' || invoice.status === 'voided') estado = '2'

    aoa2.push([
      String(index + 1),
      invoiceDate ? format(invoiceDate, 'dd/MM/yyyy', { locale: es }) : '',
      invoice.dueDate ? format(new Date(invoice.dueDate), 'dd/MM/yyyy', { locale: es }) : '',
      sunatDocTypeCodes[docType] || '00',
      serie, numero,
      sunatIdTypeCodes[customerDocType] || customerDocType || '0',
      customerDocNumber,
      invoice.customer?.name || invoice.customer?.businessName || 'Cliente General',
      Number(baseImponible.toFixed(2)),
      Number(((invoice.discount || 0) * sunatRate).toFixed(2)),
      Number(((invoice.igv || invoice.tax || 0) * sunatRate).toFixed(2)),
      Number(importeExonerado.toFixed(2)),
      Number(importeInafecto.toFixed(2)),
      0, 0,
      Number(getDocumentTotalInBase(invoice).toFixed(2)),
      Number(sunatRate.toFixed(3)),
      refDocType, refSerie, refNumero, estado,
    ])
  })

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  applyColumnWidths(ws2, [
    6, 12, 12, 10, 8, 12, 10, 15, 35, 14, 12, 12, 14, 14, 8, 12, 14, 10, 10, 8, 12, 8,
  ])
  applyTitleRow(ws2, 0, totalCols2)
  applyMetadataRows(ws2, meta2Start, meta2End)
  applyHeaderRow(ws2, header2Row, totalCols2)

  // Data rows (SUNAT format)
  const numericCols2 = [9, 10, 11, 12, 13, 14, 15, 16, 17]
  for (let i = 0; i < sorted.length; i++) {
    const r = dataStart2 + i
    for (let c = 0; c < totalCols2; c++) {
      if (numericCols2.includes(c)) {
        setStyle(ws2, r, c, numberStyle(i))
      } else if (c === 0 || c === 1 || c === 2 || (c >= 3 && c <= 7) || c === 18 || c === 19 || c === 21) {
        setStyle(ws2, r, c, centerStyle(i))
      } else {
        setStyle(ws2, r, c, cellStyle(i))
      }
    }
  }

  applyFreezeBelow(ws2, header2Row)
  XLSX.utils.book_append_sheet(workbook, ws2, 'Registro de Ventas')

  // ============== HOJAS EXTRA DE ANALÍTICA ==============
  appendItemsDetailSheet(workbook, invoices, businessData, branchLabel)
  appendTopProductsSheet(workbook, invoices, businessData, branchLabel)
  appendPaymentMethodsSheet(workbook, invoices, businessData, branchLabel)
  appendSellersSheet(workbook, invoices, businessData, branchLabel)

  // Nombre del archivo
  const filterInfo = filters?.type && filters.type !== 'all' ? filters.type : ''
  const dateInfo = (filters?.startDate || filters?.endDate) ? 'filtrado' : ''
  const fileName = buildExcelFileName('Comprobantes', [filterInfo, dateInfo])

  await saveAndShareExcel(workbook, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de comprobantes: ${fileName}`,
    subDirectory: 'Comprobantes',
  })
}

// =================== HOJAS EXTRA DE ANALÍTICA ===================

/** Items detallados: una fila por línea de cada comprobante. */
function appendItemsDetailSheet(wb, invoices, businessData, branchLabel) {
  if (!invoices || invoices.length === 0) return

  const headers = [
    'N° Comprobante', 'Fecha', 'Tipo', 'Cliente',
    'Producto', 'SKU', 'Cantidad', 'Precio Unit.',
    'Descuento', 'Subtotal Item', 'Afectación IGV',
  ]
  const totalCols = headers.length

  const aoa = [['ITEMS DETALLADOS'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    branchLabel: branchLabel || 'Todas',
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalQty = 0, totalAmount = 0
  let rowCount = 0
  const typeNames = {
    factura: 'Factura', boleta: 'Boleta', nota_venta: 'Nota de Venta',
    nota_credito: 'Nota de Crédito', nota_debito: 'Nota de Débito',
    'nota-credito': 'Nota de Crédito', 'nota-debito': 'Nota de Débito',
  }

  for (const inv of invoices) {
    if (!Array.isArray(inv.items)) continue
    const invDate = inv.createdAt?.toDate ? format(inv.createdAt.toDate(), 'dd/MM/yyyy', { locale: es }) : 'N/A'
    const customerName = inv.customer?.name || inv.customer?.businessName || 'Cliente General'
    const tipo = typeNames[inv.documentType] || 'Boleta'
    // Montos en SOLES (TC congelado del doc) para poder totalizar sin mezclar monedas
    const rate = getDocumentRate(inv)
    for (const item of inv.items) {
      const qty = item.quantity || 1
      const price = (item.unitPrice || item.price || 0) * rate
      const disc = (item.discount || 0) * rate
      const sub = qty * price - disc
      const afect = item.taxAffectation === '20' ? 'EXONERADO' : item.taxAffectation === '30' ? 'INAFECTO' : 'GRAVADO'
      totalQty += qty
      totalAmount += sub
      aoa.push([
        inv.number || 'N/A', invDate, tipo, customerName,
        item.name || item.description || 'Producto', item.sku || item.code || '',
        Number(qty), Number(price.toFixed(2)),
        Number(disc.toFixed(2)), Number(sub.toFixed(2)), afect,
      ])
      rowCount++
    }
  }

  if (rowCount === 0) return
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', '', 'TOTALES', Number(totalQty), '', '', Number(totalAmount.toFixed(2)), ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [14, 12, 14, 28, 36, 14, 10, 12, 12, 14, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rowCount; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, cellStyle(i))
    setStyle(ws, r, 5, centerStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
    setStyle(ws, r, 7, numberStyle(i))
    setStyle(ws, r, 8, numberStyle(i))
    setStyle(ws, r, 9, numberStyle(i))
    setStyle(ws, r, 10, centerStyle(i))
  }
  for (let c = 0; c <= 5; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 6, totalNumberStyle)
  for (let c = 7; c <= 8; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 9, totalNumberStyle)
  setStyle(ws, totalRowIdx, 10, totalLabelStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Items Detallados')
}

/** Top productos: agregación por nombre de producto (con sku). */
function appendTopProductsSheet(wb, invoices, businessData, branchLabel) {
  if (!invoices || invoices.length === 0) return

  // Agregar por nombre+sku
  const agg = new Map()
  for (const inv of invoices) {
    // Ingresos en SOLES (TC congelado del doc) — sin esto se mezclaban USD y PEN
    const rate = getDocumentRate(inv)
    for (const item of inv.items || []) {
      const name = item.name || item.description || 'Producto'
      const sku = item.sku || item.code || ''
      const key = `${name}|${sku}`
      if (!agg.has(key)) agg.set(key, { name, sku, qty: 0, count: 0, revenue: 0 })
      const e = agg.get(key)
      const qty = item.quantity || 1
      const price = (item.unitPrice || item.price || 0) * rate
      const disc = (item.discount || 0) * rate
      e.qty += qty
      e.count += 1
      e.revenue += qty * price - disc
    }
  }
  if (agg.size === 0) return

  const rows = [...agg.values()].sort((a, b) => b.revenue - a.revenue)

  const headers = ['#', 'Producto', 'SKU', 'Cantidad Vendida', '# Ventas', 'Ingresos', 'Precio Promedio', '% del Total']
  const totalCols = headers.length

  const aoa = [['TOP PRODUCTOS DEL PERÍODO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total productos únicos',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  let totalQty = 0, totalCount = 0
  rows.forEach((p, idx) => {
    const avgPrice = p.qty > 0 ? p.revenue / p.qty : 0
    const pct = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0
    totalQty += p.qty
    totalCount += p.count
    aoa.push([
      idx + 1, p.name, p.sku,
      Number(p.qty), p.count,
      Number(p.revenue.toFixed(2)),
      Number(avgPrice.toFixed(2)),
      Number(pct.toFixed(1)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', 'TOTALES', '', Number(totalQty), totalCount, Number(totalRevenue.toFixed(2)), '', 100])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [6, 38, 16, 14, 12, 14, 14, 12])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
    setStyle(ws, r, 7, numberStyle(i))
  }
  for (let c = 0; c <= 2; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 5, totalNumberStyle)
  setStyle(ws, totalRowIdx, 6, totalLabelStyle)
  setStyle(ws, totalRowIdx, 7, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Top Productos')
}

/** Por método de pago: agregación con monto total y % del total. */
function appendPaymentMethodsSheet(wb, invoices, businessData, branchLabel) {
  if (!invoices || invoices.length === 0) return

  const agg = new Map()
  for (const inv of invoices) {
    // Montos en SOLES (TC congelado del doc) — sin esto se mezclaban USD y PEN
    const rate = getDocumentRate(inv)
    if (inv.payments && Array.isArray(inv.payments) && inv.payments.length > 0) {
      // Pagos múltiples: cada uno con su monto
      for (const p of inv.payments) {
        const method = p.method || 'Efectivo'
        if (!agg.has(method)) agg.set(method, { method, amount: 0, count: 0 })
        const e = agg.get(method)
        e.amount += (p.amount || 0) * rate
        e.count += 1
      }
    } else {
      const method = inv.paymentMethod || 'Efectivo'
      if (!agg.has(method)) agg.set(method, { method, amount: 0, count: 0 })
      const e = agg.get(method)
      e.amount += getDocumentTotalInBase(inv)
      e.count += 1
    }
  }
  if (agg.size === 0) return

  const rows = [...agg.values()].sort((a, b) => b.amount - a.amount)
  const headers = ['Método de Pago', '# Transacciones', 'Monto Total', '% del Total', 'Ticket Promedio']
  const totalCols = headers.length

  const aoa = [['VENTAS POR MÉTODO DE PAGO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total métodos usados',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  let totalCount = 0
  rows.forEach(p => {
    const pct = totalAmount > 0 ? (p.amount / totalAmount) * 100 : 0
    const ticket = p.count > 0 ? p.amount / p.count : 0
    totalCount += p.count
    aoa.push([
      p.method, p.count,
      Number(p.amount.toFixed(2)),
      Number(pct.toFixed(1)),
      Number(ticket.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTALES', totalCount, Number(totalAmount.toFixed(2)), 100, ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [24, 16, 16, 14, 16])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, numberStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, totalNumberStyle)
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, totalLabelStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Método de Pago')
}

/** Por vendedor: agregación con N° de ventas, monto total, % y ticket promedio. */
function appendSellersSheet(wb, invoices, businessData, branchLabel) {
  if (!invoices || invoices.length === 0) return

  const agg = new Map()
  for (const inv of invoices) {
    const seller = inv.createdByName || inv.sellerName || inv.createdByEmail || 'Sin vendedor'
    if (!agg.has(seller)) agg.set(seller, { seller, amount: 0, count: 0 })
    const e = agg.get(seller)
    // En SOLES con el TC congelado del doc (no mezclar monedas)
    e.amount += getDocumentTotalInBase(inv)
    e.count += 1
  }
  if (agg.size === 0) return

  const rows = [...agg.values()].sort((a, b) => b.amount - a.amount)
  const headers = ['Vendedor', 'N° de Ventas', 'Monto Total', '% del Total', 'Ticket Promedio']
  const totalCols = headers.length

  const aoa = [['VENTAS POR VENDEDOR'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total vendedores',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  let totalCount = 0
  rows.forEach(p => {
    const pct = totalAmount > 0 ? (p.amount / totalAmount) * 100 : 0
    const ticket = p.count > 0 ? p.amount / p.count : 0
    totalCount += p.count
    aoa.push([
      p.seller, p.count,
      Number(p.amount.toFixed(2)),
      Number(pct.toFixed(1)),
      Number(ticket.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTALES', totalCount, Number(totalAmount.toFixed(2)), 100, ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [28, 14, 16, 14, 16])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, numberStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, totalNumberStyle)
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, totalLabelStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Vendedor')
}
