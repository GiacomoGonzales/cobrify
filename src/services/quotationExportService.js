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

  const statusInfo = filters.status && filters.status !== 'all' ? filters.status : ''
  const dateInfo = (filters.startDate || filters.endDate) ? 'filtrado' : ''
  const fileName = buildExcelFileName('Cotizaciones', [statusInfo, dateInfo])

  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de cotizaciones: ${fileName}`,
    subDirectory: 'Cotizaciones',
  })
}
