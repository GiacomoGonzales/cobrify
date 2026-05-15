/**
 * Servicio de exportación a Excel para cotizaciones.
 *
 * Genera 3 hojas:
 *   1. Listado de cotizaciones con datos completos del cliente y montos.
 *   2. Items detallados (una fila por línea de cotización).
 *   3. Resumen por estado + tasa de conversión.
 */
import {
  XLSX,
  cellStyle, centerStyle, numberStyle, intStyle,
  badgeStyle, COLORS,
  totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applySubtitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
  formatDate as formatDateLocale,
} from './excelStyles'

const STATUS_LABELS = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Expirada',
  converted: 'Convertida a Venta',
}

const STATUS_ORDER = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']

/** Badge de color según estado (verde/azul/amarillo/rojo/gris). */
const statusBadge = (status) => {
  const colorMap = {
    draft: { bg: COLORS.neutralTag, fg: COLORS.neutralText },
    sent: { bg: COLORS.infoTag, fg: COLORS.infoText },
    accepted: { bg: COLORS.successTag, fg: COLORS.successText },
    converted: { bg: COLORS.successTag, fg: COLORS.successText },
    rejected: { bg: COLORS.dangerTag, fg: COLORS.dangerText },
    expired: { bg: COLORS.warningTag, fg: COLORS.warningText },
  }
  return badgeStyle(colorMap[status] || { bg: COLORS.neutralTag, fg: COLORS.neutralText })
}

const toDate = (val) => {
  if (!val) return null
  if (val.toDate) return val.toDate()
  if (val instanceof Date) return val
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

const daysBetween = (d1, d2) => {
  if (!d1 || !d2) return null
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

/** Genera el reporte completo de cotizaciones. */
export const generateQuotationsExcel = async (quotations, filters = {}, businessData = {}) => {
  const wb = XLSX.utils.book_new()
  const now = new Date()

  // Extras para metadata (filtros aplicados)
  const extra = []
  if (filters.status && filters.status !== 'all') {
    extra.push(['Estado:', STATUS_LABELS[filters.status] || filters.status])
  }
  if (filters.startDate) extra.push(['Fecha Desde:', formatDateLocale(new Date(filters.startDate))])
  if (filters.endDate) extra.push(['Fecha Hasta:', formatDateLocale(new Date(filters.endDate))])

  // =========================================================================
  // HOJA 1: LISTADO DE COTIZACIONES
  // =========================================================================
  {
    const headers = [
      'Número', 'Emisión', 'Vencimiento', 'Días Vigencia',
      'Cliente', 'RUC/DNI', 'Email', 'Teléfono',
      'N° Items', 'Subtotal', 'Descuento', 'IGV', 'Total',
      'Estado', 'Días desde Emisión', 'Vendedor', 'Notas',
    ]
    const totalCols = headers.length

    const aoa = [['REPORTE DE COTIZACIONES'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      totalLabel: 'Total cotizaciones',
      totalItems: quotations.length,
      extra,
    }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length

    const quoteStatuses = []

    quotations.forEach(q => {
      const createdDate = toDate(q.createdAt)
      const expiryDate = toDate(q.expiryDate)
      const daysSinceCreated = createdDate ? daysBetween(createdDate, now) : null
      const customerName = q.customer?.name || q.customer?.businessName || q.customerName || 'Cliente General'
      const itemsCount = Array.isArray(q.items) ? q.items.length : 0
      quoteStatuses.push(q.status || 'draft')

      aoa.push([
        q.number || 'N/A',
        createdDate ? formatDateLocale(createdDate) : 'N/A',
        expiryDate ? formatDateLocale(expiryDate) : 'N/A',
        q.validDays || (createdDate && expiryDate ? daysBetween(createdDate, expiryDate) : 'N/A'),
        customerName,
        q.customer?.documentNumber || q.customerDocumentNumber || '-',
        q.customer?.email || '',
        q.customer?.phone || '',
        itemsCount,
        Number((q.subtotal || 0).toFixed(2)),
        Number((q.discount || 0).toFixed(2)),
        Number((q.igv || q.tax || 0).toFixed(2)),
        Number((q.total || 0).toFixed(2)),
        STATUS_LABELS[q.status] || q.status || 'N/A',
        daysSinceCreated !== null ? daysSinceCreated : '',
        q.createdByName || q.createdBy || 'N/A',
        q.notes || '',
      ])
    })

    // Totales
    const sumSubtotal = quotations.reduce((s, q) => s + (q.subtotal || 0), 0)
    const sumDiscount = quotations.reduce((s, q) => s + (q.discount || 0), 0)
    const sumIgv = quotations.reduce((s, q) => s + (q.igv || q.tax || 0), 0)
    const sumTotal = quotations.reduce((s, q) => s + (q.total || 0), 0)
    const sumItems = quotations.reduce((s, q) => s + (Array.isArray(q.items) ? q.items.length : 0), 0)

    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push([
      '', '', '', '', '', '', '', 'TOTALES',
      sumItems,
      Number(sumSubtotal.toFixed(2)),
      Number(sumDiscount.toFixed(2)),
      Number(sumIgv.toFixed(2)),
      Number(sumTotal.toFixed(2)),
      '', '', '', '',
    ])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [
      14, 12, 12, 10,
      28, 14, 24, 14,
      8, 12, 12, 10, 12,
      14, 14, 18, 32,
    ])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)

    for (let i = 0; i < quotations.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))   // Número
      setStyle(ws, r, 1, centerStyle(i))   // Emisión
      setStyle(ws, r, 2, centerStyle(i))   // Vencimiento
      setStyle(ws, r, 3, intStyle(i))      // Días vigencia
      setStyle(ws, r, 4, cellStyle(i))     // Cliente
      setStyle(ws, r, 5, centerStyle(i))   // RUC/DNI
      setStyle(ws, r, 6, cellStyle(i))     // Email
      setStyle(ws, r, 7, centerStyle(i))   // Teléfono
      setStyle(ws, r, 8, intStyle(i))      // N° Items
      for (let c = 9; c <= 12; c++) setStyle(ws, r, c, numberStyle(i))
      setStyle(ws, r, 13, statusBadge(quoteStatuses[i]))  // Estado (badge)
      setStyle(ws, r, 14, intStyle(i))     // Días desde emisión
      setStyle(ws, r, 15, cellStyle(i))    // Vendedor
      setStyle(ws, r, 16, cellStyle(i))    // Notas
    }
    // Fila de totales
    for (let c = 0; c <= 7; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
    setStyle(ws, totalRowIdx, 8, { ...totalNumberStyle, numFmt: '#,##0' })
    for (let c = 9; c <= 12; c++) setStyle(ws, totalRowIdx, c, totalNumberStyle)
    for (let c = 13; c <= 16; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Cotizaciones')
  }

  // =========================================================================
  // HOJA 2: ITEMS DETALLADOS (una fila por línea)
  // =========================================================================
  {
    const headers = [
      'N° Cotización', 'Fecha', 'Cliente', 'Estado',
      'Producto', 'SKU', 'Cantidad', 'Precio Unitario',
      'Descuento Item', 'Subtotal Item',
    ]
    const totalCols = headers.length

    const aoa = [['ITEMS DETALLADOS DE COTIZACIONES'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { extra }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length

    const rowStatuses = []
    let sumQty = 0
    let sumSubtotal = 0

    quotations.forEach(q => {
      const createdDate = toDate(q.createdAt)
      const customerName = q.customer?.name || q.customer?.businessName || 'Cliente General'
      const status = STATUS_LABELS[q.status] || q.status || 'N/A'
      const items = Array.isArray(q.items) ? q.items : []
      items.forEach(item => {
        const qty = item.quantity || 1
        const unitPrice = item.unitPrice || item.price || 0
        const itemDiscount = item.discount || 0
        const itemSubtotal = qty * unitPrice - itemDiscount
        sumQty += qty
        sumSubtotal += itemSubtotal
        aoa.push([
          q.number || 'N/A',
          createdDate ? formatDateLocale(createdDate) : 'N/A',
          customerName,
          status,
          item.name || item.description || 'Producto',
          item.sku || item.code || '',
          Number(qty),
          Number(unitPrice.toFixed(2)),
          Number(itemDiscount.toFixed(2)),
          Number(itemSubtotal.toFixed(2)),
        ])
        rowStatuses.push(q.status || 'draft')
      })
    })

    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push([
      '', '', '', '', '', 'TOTALES',
      Number(sumQty),
      '', '',
      Number(sumSubtotal.toFixed(2)),
    ])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [14, 12, 28, 14, 36, 16, 10, 14, 14, 14])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)

    for (let i = 0; i < rowStatuses.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, centerStyle(i))
      setStyle(ws, r, 2, cellStyle(i))
      setStyle(ws, r, 3, statusBadge(rowStatuses[i]))
      setStyle(ws, r, 4, cellStyle(i))
      setStyle(ws, r, 5, centerStyle(i))
      setStyle(ws, r, 6, numberStyle(i))
      setStyle(ws, r, 7, numberStyle(i))
      setStyle(ws, r, 8, numberStyle(i))
      setStyle(ws, r, 9, numberStyle(i))
    }
    for (let c = 0; c <= 5; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
    setStyle(ws, totalRowIdx, 6, totalNumberStyle)
    setStyle(ws, totalRowIdx, 7, totalLabelStyle)
    setStyle(ws, totalRowIdx, 8, totalLabelStyle)
    setStyle(ws, totalRowIdx, 9, totalNumberStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Items Detallados')
  }

  // =========================================================================
  // HOJA 3: RESUMEN POR ESTADO + TASA DE CONVERSIÓN
  // =========================================================================
  {
    // Conteos y totales por estado
    const statusCounts = {}
    const statusTotals = {}
    for (const s of STATUS_ORDER) {
      statusCounts[s] = 0
      statusTotals[s] = 0
    }
    for (const q of quotations) {
      const s = q.status || 'draft'
      if (statusCounts[s] === undefined) {
        statusCounts[s] = 0
        statusTotals[s] = 0
      }
      statusCounts[s] += 1
      statusTotals[s] += (q.total || 0)
    }
    const totalQuotations = quotations.length
    const totalAmount = quotations.reduce((s, q) => s + (q.total || 0), 0)
    const convertedCount = (statusCounts.converted || 0) + (statusCounts.accepted || 0)
    const conversionRate = totalQuotations > 0 ? (convertedCount / totalQuotations) * 100 : 0
    const acceptedValue = (statusTotals.accepted || 0) + (statusTotals.converted || 0)

    const headers = ['Estado', 'Cantidad', '% del Total', 'Monto Total', '% del Monto']
    const totalCols = headers.length

    const aoa = [['RESUMEN POR ESTADO'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      totalLabel: 'Total cotizaciones',
      totalItems: totalQuotations,
      extra,
    }))
    const metaEnd = aoa.length - 1
    aoa.push([])

    // Sección: por estado
    const sec1Sub = aoa.length
    aoa.push(['DISTRIBUCIÓN POR ESTADO'])
    const sec1Header = aoa.length
    aoa.push(headers)
    const sec1DataStart = aoa.length
    const rowStatuses = []
    for (const s of STATUS_ORDER) {
      const count = statusCounts[s] || 0
      const total = statusTotals[s] || 0
      const pctCount = totalQuotations > 0 ? Number(((count / totalQuotations) * 100).toFixed(1)) : 0
      const pctAmount = totalAmount > 0 ? Number(((total / totalAmount) * 100).toFixed(1)) : 0
      aoa.push([STATUS_LABELS[s] || s, count, pctCount, Number(total.toFixed(2)), pctAmount])
      rowStatuses.push(s)
    }
    const sec1DataEnd = aoa.length - 1

    // Fila de total
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push(['TOTAL', totalQuotations, 100, Number(totalAmount.toFixed(2)), 100])

    // Sección: tasa de conversión
    aoa.push([])
    const sec2Sub = aoa.length
    aoa.push(['TASA DE CONVERSIÓN'])
    const sec2Header = aoa.length
    aoa.push(['Métrica', 'Valor'])
    const sec2DataStart = aoa.length
    aoa.push(['Cotizaciones aceptadas + convertidas', convertedCount])
    aoa.push(['Total de cotizaciones', totalQuotations])
    aoa.push(['Tasa de conversión %', Number(conversionRate.toFixed(2))])
    aoa.push(['Monto de cotizaciones ganadas', Number(acceptedValue.toFixed(2))])
    const sec2DataEnd = aoa.length - 1

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [28, 14, 14, 18, 14])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)

    // Sección 1
    applySubtitleRow(ws, sec1Sub, totalCols)
    applyHeaderRow(ws, sec1Header, totalCols)
    for (let r = sec1DataStart; r <= sec1DataEnd; r++) {
      const i = r - sec1DataStart
      setStyle(ws, r, 0, statusBadge(rowStatuses[i]))
      setStyle(ws, r, 1, intStyle(i))
      setStyle(ws, r, 2, numberStyle(i))
      setStyle(ws, r, 3, numberStyle(i))
      setStyle(ws, r, 4, numberStyle(i))
    }
    // Fila TOTAL
    setStyle(ws, totalRowIdx, 0, totalLabelStyle)
    setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
    setStyle(ws, totalRowIdx, 2, totalNumberStyle)
    setStyle(ws, totalRowIdx, 3, totalNumberStyle)
    setStyle(ws, totalRowIdx, 4, totalNumberStyle)

    // Sección 2
    applySubtitleRow(ws, sec2Sub, totalCols)
    applyHeaderRow(ws, sec2Header, 2)
    for (let r = sec2DataStart; r <= sec2DataEnd; r++) {
      const i = r - sec2DataStart
      setStyle(ws, r, 0, cellStyle(i))
      setStyle(ws, r, 1, numberStyle(i))
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Resumen por Estado')
  }

  // ============== HOJAS EXTRA DE ANALÍTICA ==============
  appendBySellerSheet(wb, quotations, businessData)
  appendByMonthSheet(wb, quotations, businessData)
  appendExpiringSoonSheet(wb, quotations, businessData)
  appendTopQuotedProductsSheet(wb, quotations, businessData)

  const statusInfo = filters.status && filters.status !== 'all' ? filters.status : ''
  const dateInfo = (filters.startDate || filters.endDate) ? 'filtrado' : ''
  const fileName = buildExcelFileName('Cotizaciones', [statusInfo, dateInfo])

  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de cotizaciones: ${fileName}`,
    subDirectory: 'Cotizaciones',
  })
}

// =================== HOJAS EXTRA DE ANALÍTICA ===================

const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** Por Vendedor — agrupado por createdByName/createdBy. */
function appendBySellerSheet(wb, quotations, businessData) {
  const agg = new Map()
  for (const q of quotations) {
    const seller = q.createdByName || q.createdBy || 'Sin asignar'
    if (!agg.has(seller)) agg.set(seller, { name: seller, count: 0, total: 0, accepted: 0, rejected: 0 })
    const e = agg.get(seller)
    e.count += 1
    e.total += (q.total || 0)
    if (q.status === 'accepted' || q.status === 'converted') e.accepted += 1
    else if (q.status === 'rejected' || q.status === 'expired') e.rejected += 1
  }
  if (agg.size === 0) return

  const rows = [...agg.values()].sort((a, b) => b.total - a.total)

  const headers = ['Vendedor', '# Cotizaciones', 'Total', 'Aceptadas', 'Rechazadas/Vencidas', 'Tasa Conversión %', 'Ticket Promedio']
  const totalCols = headers.length

  const aoa = [['COTIZACIONES POR VENDEDOR'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total vendedores',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalCount = 0, totalAmount = 0, totalAccepted = 0, totalRejected = 0
  rows.forEach(r => {
    const conv = r.count > 0 ? (r.accepted / r.count) * 100 : 0
    const ticket = r.count > 0 ? r.total / r.count : 0
    totalCount += r.count
    totalAmount += r.total
    totalAccepted += r.accepted
    totalRejected += r.rejected
    aoa.push([
      r.name, r.count,
      Number(r.total.toFixed(2)),
      r.accepted, r.rejected,
      Number(conv.toFixed(1)),
      Number(ticket.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  const totalConv = totalCount > 0 ? (totalAccepted / totalCount) * 100 : 0
  aoa.push([
    'TOTALES', totalCount,
    Number(totalAmount.toFixed(2)),
    totalAccepted, totalRejected,
    Number(totalConv.toFixed(1)),
    Number((totalCount > 0 ? totalAmount / totalCount : 0).toFixed(2)),
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [26, 14, 14, 12, 18, 16, 16])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
    setStyle(ws, r, 3, intStyle(i))
    setStyle(ws, r, 4, intStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, totalNumberStyle)
  setStyle(ws, totalRowIdx, 3, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 4, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 5, totalNumberStyle)
  setStyle(ws, totalRowIdx, 6, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Vendedor')
}

/** Por Mes — agrupado por mes/año de createdAt. */
function appendByMonthSheet(wb, quotations, businessData) {
  const agg = new Map()
  for (const q of quotations) {
    const d = toDate(q.createdAt)
    if (!d) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!agg.has(key)) agg.set(key, { year: d.getFullYear(), month: d.getMonth() + 1, count: 0, total: 0, accepted: 0 })
    const e = agg.get(key)
    e.count += 1
    e.total += (q.total || 0)
    if (q.status === 'accepted' || q.status === 'converted') e.accepted += 1
  }
  if (agg.size === 0) return

  const rows = [...agg.values()].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month))

  const headers = ['Mes', '# Cotizaciones', 'Monto Total', 'Aceptadas', 'Conversión %']
  const totalCols = headers.length

  const aoa = [['COTIZACIONES POR MES'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total meses con actividad',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalCount = 0, totalAmount = 0, totalAccepted = 0
  rows.forEach(r => {
    const label = `${MONTH_LABELS[r.month - 1]} ${r.year}`
    const conv = r.count > 0 ? (r.accepted / r.count) * 100 : 0
    totalCount += r.count
    totalAmount += r.total
    totalAccepted += r.accepted
    aoa.push([label, r.count, Number(r.total.toFixed(2)), r.accepted, Number(conv.toFixed(1))])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  const totalConv = totalCount > 0 ? (totalAccepted / totalCount) * 100 : 0
  aoa.push(['TOTALES', totalCount, Number(totalAmount.toFixed(2)), totalAccepted, Number(totalConv.toFixed(1))])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [22, 14, 16, 12, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
    setStyle(ws, r, 3, intStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, totalNumberStyle)
  setStyle(ws, totalRowIdx, 3, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 4, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Mes')
}

/** Vencen Pronto — cotizaciones cuyo vencimiento es <= 7 días desde ahora. */
function appendExpiringSoonSheet(wb, quotations, businessData) {
  const now = new Date()
  const threshold = new Date(now.getTime() + 7 * 86400000)

  const soon = quotations
    .filter(q => {
      if (q.status === 'accepted' || q.status === 'converted' || q.status === 'rejected' || q.status === 'expired') return false
      const exp = toDate(q.expiryDate)
      return exp && exp >= now && exp <= threshold
    })
    .map(q => {
      const exp = toDate(q.expiryDate)
      return { q, exp, daysLeft: Math.ceil((exp - now) / 86400000) }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)

  if (soon.length === 0) return

  const headers = ['Número', 'Cliente', 'Fecha Emisión', 'Vence', 'Días Restantes', 'Total', 'Estado', 'Email', 'Teléfono']
  const totalCols = headers.length

  const aoa = [['COTIZACIONES QUE VENCEN PRONTO (≤ 7 DÍAS)'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total que vencen pronto',
    totalItems: soon.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const rowStatuses = []
  soon.forEach(({ q, exp, daysLeft }) => {
    const created = toDate(q.createdAt)
    rowStatuses.push(q.status || 'draft')
    aoa.push([
      q.number || 'N/A',
      q.customer?.name || q.customer?.businessName || 'Cliente General',
      created ? formatDateLocale(created) : 'N/A',
      formatDateLocale(exp),
      daysLeft,
      Number((q.total || 0).toFixed(2)),
      STATUS_LABELS[q.status] || q.status || 'N/A',
      q.customer?.email || '',
      q.customer?.phone || '',
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [14, 28, 14, 14, 14, 14, 16, 26, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < soon.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, centerStyle(i))
    setStyle(ws, r, 4, { ...intStyle(i), font: { ...intStyle(i).font, bold: true, color: { rgb: 'B45309' } } })
    setStyle(ws, r, 5, numberStyle(i))
    setStyle(ws, r, 6, statusBadge(rowStatuses[i]))
    setStyle(ws, r, 7, cellStyle(i))
    setStyle(ws, r, 8, centerStyle(i))
  }
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Vencen Pronto')
}

/** Top Productos Cotizados — agregación de items. */
function appendTopQuotedProductsSheet(wb, quotations, businessData) {
  const agg = new Map()
  for (const q of quotations) {
    if (!Array.isArray(q.items)) continue
    const wasAccepted = q.status === 'accepted' || q.status === 'converted'
    for (const item of q.items) {
      const name = item.name || item.description || 'Producto'
      const sku = item.sku || item.code || ''
      const key = `${name}|${sku}`
      if (!agg.has(key)) {
        agg.set(key, { name, sku, qty: 0, count: 0, revenue: 0, acceptedCount: 0 })
      }
      const e = agg.get(key)
      const qty = item.quantity || 1
      const price = item.unitPrice || item.price || 0
      const disc = item.discount || 0
      e.qty += qty
      e.count += 1
      e.revenue += qty * price - disc
      if (wasAccepted) e.acceptedCount += 1
    }
  }
  if (agg.size === 0) return

  const rows = [...agg.values()].sort((a, b) => b.revenue - a.revenue)

  const headers = ['#', 'Producto', 'SKU', 'Cantidad Cotizada', '# Cotizaciones', 'Monto Total', 'En Aceptadas', '% Conversión']
  const totalCols = headers.length

  const aoa = [['TOP PRODUCTOS COTIZADOS'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total productos únicos cotizados',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  let totalQty = 0, totalCount = 0, totalAccepted = 0
  rows.forEach((p, idx) => {
    const conv = p.count > 0 ? (p.acceptedCount / p.count) * 100 : 0
    totalQty += p.qty
    totalCount += p.count
    totalAccepted += p.acceptedCount
    aoa.push([
      idx + 1, p.name, p.sku,
      Number(p.qty), p.count,
      Number(p.revenue.toFixed(2)),
      p.acceptedCount,
      Number(conv.toFixed(1)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  const totalConv = totalCount > 0 ? (totalAccepted / totalCount) * 100 : 0
  aoa.push(['', 'TOTALES', '', Number(totalQty), totalCount, Number(totalRevenue.toFixed(2)), totalAccepted, Number(totalConv.toFixed(1))])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [6, 38, 16, 14, 14, 14, 14, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, intStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
    setStyle(ws, r, 6, intStyle(i))
    setStyle(ws, r, 7, numberStyle(i))
  }
  for (let c = 0; c <= 2; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 5, totalNumberStyle)
  setStyle(ws, totalRowIdx, 6, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 7, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Top Productos Cotizados')
}
