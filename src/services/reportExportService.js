/**
 * Servicio de exportación a Excel para la página de Reportes.
 *
 * Genera 4 reportes distintos (General, Ventas, Productos, Clientes), cada
 * uno con sus respectivas hojas. Toda la presentación está delegada a
 * excelStyles para mantener el look unificado con accounting/inventory/invoices.
 */
import {
  XLSX,
  cellStyle, centerStyle, numberStyle, intStyle,
  totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applySubtitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
  formatDate as formatDateLocale,
} from './excelStyles'

// =================== HELPERS LOCALES ===================

/** Etiqueta amigable del rango de fechas para el título. */
const getRangeLabel = (dateRange, customStartDate, customEndDate) => {
  switch (dateRange) {
    case 'week': return 'Última semana'
    case 'month': return 'Este mes'
    case 'quarter': return 'Último trimestre'
    case 'year': return 'Este año'
    case 'all': return 'Todo el período'
    case 'custom':
      if (customStartDate && customEndDate) return `${customStartDate} al ${customEndDate}`
      return 'Personalizado'
    default: return dateRange
  }
}

/** Fecha de emisión de un comprobante (con fallback a createdAt). */
const getInvoiceDate = (invoice) => {
  if (invoice?.emissionDate) {
    if (invoice.emissionDate.toDate) return invoice.emissionDate.toDate()
    if (typeof invoice.emissionDate === 'string') {
      const createdAt = invoice.createdAt?.toDate?.() || (invoice.createdAt ? new Date(invoice.createdAt) : null)
      if (createdAt) {
        const [year, month, day] = invoice.emissionDate.split('-').map(Number)
        const combined = new Date(createdAt)
        combined.setFullYear(year, month - 1, day)
        return combined
      }
      return new Date(invoice.emissionDate + 'T12:00:00')
    }
    return new Date(invoice.emissionDate)
  }
  if (!invoice?.createdAt) return null
  return invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
}

/** Diccionarios de mapeo (compartidos por varias hojas). */
const SUNAT_STATUS_LABELS = {
  accepted: 'Aceptado', pending: 'Pendiente', sending: 'Enviando',
  rejected: 'Rechazado', voided: 'Anulado', voiding: 'Anulando',
  SIGNED: 'Firmado', signed: 'Firmado', not_applicable: 'N/A',
}

const DOC_TYPE_LABELS = {
  factura: 'Factura', boleta: 'Boleta', nota_venta: 'Nota de Venta',
  nota_credito: 'Nota de Crédito', nota_debito: 'Nota de Débito',
  'nota-credito': 'Nota de Crédito', 'nota-debito': 'Nota de Débito',
}

/** Texto consolidado de métodos de pago de una factura. */
const formatPayments = (invoice) => {
  if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    if (invoice.payments.length === 1) return invoice.payments[0].method || 'Efectivo'
    return invoice.payments
      .map(p => `${p.method || 'Efectivo'} (S/ ${(p.amount || 0).toFixed(2)})`)
      .join(', ')
  }
  return invoice.paymentMethod || 'Efectivo'
}

/** Desglose Op. Gravada/Exonerada/Inafecta a partir de items. */
const computeTaxBuckets = (invoice) => {
  let opGravada = 0, opExonerada = 0, opInafecta = 0
  if (invoice.items && Array.isArray(invoice.items)) {
    invoice.items.forEach(item => {
      const itemTotal = (item.quantity || 1) * (item.price || item.unitPrice || 0)
      if (item.taxAffectation === '20') opExonerada += itemTotal
      else if (item.taxAffectation === '30') opInafecta += itemTotal
      else opGravada += itemTotal
    })
  }
  return { opGravada, opExonerada, opInafecta }
}

/**
 * Helper para construir una "sección" dentro de una hoja: subtitle mergeado +
 * fila de header + filas de datos + (opcional) fila de total. Retorna el rango
 * de filas que se afectaron para que el caller siga construyendo el aoa.
 *
 * Esta función SOLO arma el aoa (el caller hace push). Los estilos los aplica
 * un helper aparte (applySection) después de crear el worksheet.
 */
const buildSection = (aoa, { subtitle, header, rows, totalRow }) => {
  aoa.push([])
  const subtitleRow = aoa.length
  aoa.push([subtitle])
  const headerRow = aoa.length
  aoa.push(header)
  const dataStart = aoa.length
  for (const row of rows) aoa.push(row)
  const dataEnd = aoa.length - 1
  let totalRowIdx = null
  if (totalRow) {
    totalRowIdx = aoa.length
    aoa.push(totalRow)
  }
  return { subtitleRow, headerRow, dataStart, dataEnd, totalRowIdx }
}

// =================== HELPERS DE AGREGACIÓN ===================

const DAYS_OF_WEEK = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Agrupa invoices por la propiedad indicada (función getKey). */
const groupInvoicesBy = (invoices, getKey) => {
  const map = new Map()
  for (const inv of invoices || []) {
    const key = getKey(inv) || 'Sin asignar'
    if (!map.has(key)) {
      map.set(key, { key, count: 0, subtotal: 0, igv: 0, discount: 0, total: 0, customers: new Set() })
    }
    const g = map.get(key)
    g.count += 1
    g.subtotal += (inv.subtotal || 0)
    g.igv += (inv.igv || inv.tax || 0)
    g.discount += (inv.discount || 0)
    g.total += (inv.total || 0)
    const cust = inv.customer?.documentNumber || inv.customer?.name
    if (cust) g.customers.add(cust)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

/** Agrega una hoja al workbook con tabla "agrupada" (Por Vendedor / Por Sucursal). */
const appendGroupedSheet = (wb, { sheetName, title, groupLabel, businessData, periodLabel, branchLabel, groups }) => {
  const headers = [groupLabel, 'Comprobantes', 'Clientes', 'Subtotal', 'IGV', 'Descuento', 'Total', 'Ticket Prom.', '% del Total']
  const totalCols = headers.length

  const totalGeneral = groups.reduce((s, g) => s + g.total, 0)

  const aoa = [[title], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    branchLabel: branchLabel || 'Todas',
    totalLabel: `Total ${groupLabel.toLowerCase()}`,
    totalItems: groups.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let sumCount = 0, sumSub = 0, sumIgv = 0, sumDisc = 0, sumTotal = 0
  groups.forEach(g => {
    const ticket = g.count > 0 ? g.total / g.count : 0
    const pct = totalGeneral > 0 ? (g.total / totalGeneral) * 100 : 0
    sumCount += g.count
    sumSub += g.subtotal
    sumIgv += g.igv
    sumDisc += g.discount
    sumTotal += g.total
    aoa.push([
      g.key,
      g.count,
      g.customers.size,
      Number(g.subtotal.toFixed(2)),
      Number(g.igv.toFixed(2)),
      Number(g.discount.toFixed(2)),
      Number(g.total.toFixed(2)),
      Number(ticket.toFixed(2)),
      Number(pct.toFixed(1)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push([
    'TOTALES', sumCount, '', Number(sumSub.toFixed(2)), Number(sumIgv.toFixed(2)),
    Number(sumDisc.toFixed(2)), Number(sumTotal.toFixed(2)), '', 100,
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [28, 14, 12, 14, 12, 12, 14, 14, 12])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < groups.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
    setStyle(ws, r, 7, numberStyle(i))
    setStyle(ws, r, 8, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, totalLabelStyle)
  for (let c = 3; c <= 6; c++) setStyle(ws, totalRowIdx, c, totalNumberStyle)
  setStyle(ws, totalRowIdx, 7, totalLabelStyle)
  setStyle(ws, totalRowIdx, 8, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
}

/** Agrega hoja "Items Detallados" con una fila por línea vendida. */
const appendItemsDetailSheet = (wb, { businessData, periodLabel, branchLabel, invoices, sheetName = 'Items Detallados', title = 'ITEMS DETALLADOS DE VENTAS' }) => {
  const headers = [
    'N° Comprobante', 'Fecha', 'Tipo', 'Cliente', 'Producto', 'SKU',
    'Cantidad', 'Precio Unit.', 'Descuento', 'Subtotal Item', 'Afectación IGV',
  ]
  const totalCols = headers.length

  const aoa = [[title], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalQty = 0, totalAmount = 0
  let rowCount = 0
  for (const inv of invoices || []) {
    if (!Array.isArray(inv.items)) continue
    const invDate = getInvoiceDate(inv)
    const customerName = inv.customer?.name || inv.customer?.businessName || 'Cliente General'
    const tipo = DOC_TYPE_LABELS[inv.documentType] || 'Boleta'
    for (const item of inv.items) {
      const qty = item.quantity || 1
      const price = item.unitPrice || item.price || 0
      const disc = item.discount || 0
      const sub = qty * price - disc
      const afect = item.taxAffectation === '20' ? 'EXONERADO' : item.taxAffectation === '30' ? 'INAFECTO' : 'GRAVADO'
      totalQty += qty
      totalAmount += sub
      aoa.push([
        inv.number || 'N/A',
        invDate ? formatDateLocale(invDate) : 'N/A',
        tipo,
        customerName,
        item.name || item.description || 'Producto',
        item.sku || item.code || '',
        Number(qty),
        Number(price.toFixed(2)),
        Number(disc.toFixed(2)),
        Number(sub.toFixed(2)),
        afect,
      ])
      rowCount++
    }
  }

  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', '', 'TOTALES', Number(totalQty), '', '', Number(totalAmount.toFixed(2)), ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [14, 12, 12, 28, 36, 14, 10, 12, 12, 14, 14])
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
  setStyle(ws, totalRowIdx, 7, totalLabelStyle)
  setStyle(ws, totalRowIdx, 8, totalLabelStyle)
  setStyle(ws, totalRowIdx, 9, totalNumberStyle)
  setStyle(ws, totalRowIdx, 10, totalLabelStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
}

/** Agrega hoja con las Notas de Crédito/Débito (devoluciones y ajustes). */
const appendCreditNotesSheet = (wb, { businessData, periodLabel, branchLabel, invoices }) => {
  const credits = (invoices || []).filter(inv => {
    const t = inv.documentType
    return t === 'nota_credito' || t === 'nota-credito' || t === 'nota_debito' || t === 'nota-debito'
  })
  if (credits.length === 0) return

  const headers = [
    'Número', 'Fecha', 'Tipo', 'Cliente', 'Documento',
    'Comprobante Ref.', 'Motivo', 'Subtotal', 'IGV', 'Total', 'Estado SUNAT',
  ]
  const totalCols = headers.length

  const aoa = [['NOTAS DE CRÉDITO Y DÉBITO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total notas',
    totalItems: credits.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let sumSub = 0, sumIgv = 0, sumTotal = 0
  credits.forEach(nc => {
    const invDate = getInvoiceDate(nc)
    const sunat = nc.documentType === 'nota_venta'
      ? 'N/A'
      : (SUNAT_STATUS_LABELS[nc.sunatStatus] || nc.sunatStatus || 'Pendiente')
    sumSub += (nc.subtotal || 0)
    sumIgv += (nc.igv || nc.tax || 0)
    sumTotal += (nc.total || 0)
    aoa.push([
      nc.number || 'N/A',
      invDate ? formatDateLocale(invDate) : 'N/A',
      DOC_TYPE_LABELS[nc.documentType] || nc.documentType,
      nc.customer?.name || 'Cliente General',
      nc.customer?.documentNumber || '-',
      nc.referenceNumber || nc.relatedInvoiceNumber || '-',
      nc.reason || nc.notes || '-',
      Number((nc.subtotal || 0).toFixed(2)),
      Number((nc.igv || nc.tax || 0).toFixed(2)),
      Number((nc.total || 0).toFixed(2)),
      sunat,
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push([
    '', '', '', '', '', '', 'TOTALES',
    Number(sumSub.toFixed(2)),
    Number(sumIgv.toFixed(2)),
    Number(sumTotal.toFixed(2)),
    '',
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [14, 12, 14, 28, 14, 16, 32, 12, 10, 12, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < credits.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, centerStyle(i))
    setStyle(ws, r, 5, centerStyle(i))
    setStyle(ws, r, 6, cellStyle(i))
    setStyle(ws, r, 7, numberStyle(i))
    setStyle(ws, r, 8, numberStyle(i))
    setStyle(ws, r, 9, numberStyle(i))
    setStyle(ws, r, 10, centerStyle(i))
  }
  for (let c = 0; c <= 6; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  for (let c = 7; c <= 9; c++) setStyle(ws, totalRowIdx, c, totalNumberStyle)
  setStyle(ws, totalRowIdx, 10, totalLabelStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Notas Crédito-Débito')
}

/** Agrega hoja "RFM" — segmentación de clientes por Recency/Frequency/Monetary. */
const appendRfmSheet = (wb, { businessData, periodLabel, branchLabel, customers, invoices }) => {
  if (!customers || customers.length === 0) return

  // Calcular métricas por cliente
  const now = new Date()
  const stats = new Map()
  for (const inv of invoices || []) {
    const docNum = inv.customer?.documentNumber
    if (!docNum) continue
    if (!stats.has(docNum)) stats.set(docNum, { count: 0, total: 0, lastDate: null })
    const s = stats.get(docNum)
    s.count += 1
    s.total += (inv.total || 0)
    const d = getInvoiceDate(inv)
    if (d && (!s.lastDate || d > s.lastDate)) s.lastDate = d
  }

  const rfmData = customers
    .map(c => {
      const s = stats.get(c.documentNumber) || { count: 0, total: 0, lastDate: null }
      const recencyDays = s.lastDate ? Math.round((now - s.lastDate) / 86400000) : null
      return {
        name: c.name || c.businessName || 'N/A',
        documentNumber: c.documentNumber || '-',
        recencyDays,
        frequency: s.count,
        monetary: s.total,
      }
    })
    .filter(c => c.frequency > 0)

  if (rfmData.length === 0) return

  // Clasificar en segmentos (quintiles)
  const sortedByRecency = [...rfmData].sort((a, b) => (a.recencyDays ?? Infinity) - (b.recencyDays ?? Infinity))
  const sortedByFreq = [...rfmData].sort((a, b) => b.frequency - a.frequency)
  const sortedByMon = [...rfmData].sort((a, b) => b.monetary - a.monetary)

  const quintile = (arr, item) => {
    const idx = arr.findIndex(x => x === item)
    return Math.min(5, Math.floor((idx / arr.length) * 5) + 1)
  }

  const segments = rfmData.map(c => {
    const R = quintile(sortedByRecency, c) // 1=más reciente (mejor)
    const F = quintile(sortedByFreq, c)    // 1=más frecuente
    const M = quintile(sortedByMon, c)     // 1=más gasto
    let label = 'Otros'
    if (R <= 2 && F <= 2 && M <= 2) label = 'Campeones'
    else if (R <= 2 && F <= 3) label = 'Leales'
    else if (R <= 2 && M <= 2) label = 'Gran Cliente'
    else if (R >= 4 && F <= 2) label = 'En Riesgo'
    else if (R === 5 && F === 5 && M >= 4) label = 'Perdidos'
    else if (R === 5) label = 'Inactivos'
    else if (F === 1 && R <= 3) label = 'Nuevos Compradores'
    return { ...c, R, F, M, segment: label }
  })

  const headers = ['Cliente', 'Documento', 'Recency (días)', 'Frequency (pedidos)', 'Monetary (S/)', 'R', 'F', 'M', 'Segmento']
  const totalCols = headers.length

  const aoa = [['ANÁLISIS RFM DE CLIENTES'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total clientes con compras',
    totalItems: segments.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  // Ordenar por R asc, F asc, M asc (mejores arriba)
  segments.sort((a, b) => (a.R + a.F + a.M) - (b.R + b.F + b.M))
  segments.forEach(s => {
    aoa.push([
      s.name, s.documentNumber,
      s.recencyDays ?? '', s.frequency,
      Number(s.monetary.toFixed(2)),
      s.R, s.F, s.M, s.segment,
    ])
  })

  // Resumen por segmento
  aoa.push([])
  const summarySub = aoa.length
  aoa.push(['RESUMEN POR SEGMENTO'])
  const summaryHeader = aoa.length
  aoa.push(['Segmento', 'Cantidad', '% del Total', 'Monto Total', 'Ticket Promedio'])
  const summaryDataStart = aoa.length
  const bySegment = new Map()
  segments.forEach(s => {
    if (!bySegment.has(s.segment)) bySegment.set(s.segment, { count: 0, total: 0 })
    const e = bySegment.get(s.segment)
    e.count += 1
    e.total += s.monetary
  })
  const totalSegments = segments.length
  for (const [seg, e] of bySegment) {
    aoa.push([
      seg, e.count,
      Number(((e.count / totalSegments) * 100).toFixed(1)),
      Number(e.total.toFixed(2)),
      Number((e.total / e.count).toFixed(2)),
    ])
  }
  const summaryDataEnd = aoa.length - 1

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [30, 14, 14, 18, 16, 6, 6, 6, 20])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < segments.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, intStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
    setStyle(ws, r, 5, centerStyle(i))
    setStyle(ws, r, 6, centerStyle(i))
    setStyle(ws, r, 7, centerStyle(i))
    setStyle(ws, r, 8, centerStyle(i))
  }
  applySubtitleRow(ws, summarySub, 5)
  applyHeaderRow(ws, summaryHeader, 5)
  for (let r = summaryDataStart; r <= summaryDataEnd; r++) {
    const i = r - summaryDataStart
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
  }
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'RFM')
}

/** Agrega hoja "Cumpleañeros" — clientes con birthDate en el mes actual o próximo. */
const appendBirthdaysSheet = (wb, { businessData, customers }) => {
  if (!customers || customers.length === 0) return
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1

  const inMonth = (m) => customers.filter(c => {
    if (!c.birthDate) return false
    const parts = String(c.birthDate).split('-')
    if (parts.length < 2) return false
    const month = parseInt(parts[1])
    return month === m
  })

  const current = inMonth(currentMonth)
  const next = inMonth(nextMonth)
  if (current.length === 0 && next.length === 0) return

  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  const headers = ['Cliente', 'Documento', 'Cumpleaños', 'Email', 'Teléfono']
  const totalCols = headers.length

  const aoa = [['CUMPLEAÑOS DE CLIENTES'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total con cumpleaños registrado',
    totalItems: current.length + next.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])

  const renderSection = (title, list) => {
    const subRow = aoa.length
    aoa.push([title])
    const headerR = aoa.length
    aoa.push(headers)
    const dataS = aoa.length
    list.sort((a, b) => {
      const da = parseInt((a.birthDate || '').split('-')[2] || 0)
      const db = parseInt((b.birthDate || '').split('-')[2] || 0)
      return da - db
    })
    list.forEach(c => {
      const dmy = String(c.birthDate || '').split('-').reverse().join('/')
      aoa.push([
        c.name || c.businessName || 'N/A',
        c.documentNumber || '-',
        dmy,
        c.email || '',
        c.phone || '',
      ])
    })
    return { subRow, headerR, dataS, dataE: aoa.length - 1 }
  }

  const sections = []
  if (current.length > 0) sections.push({ kind: 'current', ...renderSection(`CUMPLEAÑOS DE ${months[currentMonth - 1].toUpperCase()}`, current) })
  if (next.length > 0) {
    aoa.push([])
    sections.push({ kind: 'next', ...renderSection(`CUMPLEAÑOS DE ${months[nextMonth - 1].toUpperCase()}`, next) })
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [32, 16, 14, 26, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  sections.forEach(({ subRow, headerR, dataS, dataE }) => {
    applySubtitleRow(ws, subRow, totalCols)
    applyHeaderRow(ws, headerR, totalCols)
    for (let r = dataS; r <= dataE; r++) {
      const i = r - dataS
      setStyle(ws, r, 0, cellStyle(i))
      setStyle(ws, r, 1, centerStyle(i))
      setStyle(ws, r, 2, centerStyle(i))
      setStyle(ws, r, 3, cellStyle(i))
      setStyle(ws, r, 4, centerStyle(i))
    }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Cumpleañeros')
}

/** Agrega hoja "Inactivos" — clientes que NO compran hace 60+ días. */
const appendInactiveSheet = (wb, { businessData, customers, invoices, daysThreshold = 60 }) => {
  if (!customers || customers.length === 0) return
  const now = new Date()
  // Última compra por cliente
  const lastByDoc = new Map()
  for (const inv of invoices || []) {
    const docNum = inv.customer?.documentNumber
    if (!docNum) continue
    const d = getInvoiceDate(inv)
    if (!d) continue
    if (!lastByDoc.has(docNum) || d > lastByDoc.get(docNum).date) {
      lastByDoc.set(docNum, { date: d, total: inv.total || 0 })
    }
  }

  const inactive = customers
    .filter(c => {
      const last = lastByDoc.get(c.documentNumber)
      if (!last) return false // nunca compró: no es "inactivo", es "nunca compró"
      const daysAgo = Math.round((now - last.date) / 86400000)
      return daysAgo >= daysThreshold
    })
    .map(c => {
      const last = lastByDoc.get(c.documentNumber)
      const daysAgo = Math.round((now - last.date) / 86400000)
      return { customer: c, lastDate: last.date, daysAgo }
    })
    .sort((a, b) => b.daysAgo - a.daysAgo)

  if (inactive.length === 0) return

  const headers = ['Cliente', 'Documento', 'Última Compra', 'Días sin Comprar', 'Email', 'Teléfono']
  const totalCols = headers.length

  const aoa = [[`CLIENTES INACTIVOS (>${daysThreshold} DÍAS)`], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total inactivos',
    totalItems: inactive.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length
  inactive.forEach(({ customer: c, lastDate, daysAgo }) => {
    aoa.push([
      c.name || c.businessName || 'N/A',
      c.documentNumber || '-',
      formatDateLocale(lastDate),
      daysAgo,
      c.email || '',
      c.phone || '',
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [32, 16, 14, 16, 26, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < inactive.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, intStyle(i))
    setStyle(ws, r, 4, cellStyle(i))
    setStyle(ws, r, 5, centerStyle(i))
  }
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Inactivos')
}

/** Agrega hoja "Nuevos del período" — clientes cuya primera compra está en el rango. */
const appendNewCustomersSheet = (wb, { businessData, periodLabel, customers, invoices }) => {
  if (!customers || customers.length === 0 || !invoices || invoices.length === 0) return

  // Para cada cliente que aparece en invoices, primera compra
  const firstByDoc = new Map()
  for (const inv of invoices) {
    const docNum = inv.customer?.documentNumber
    if (!docNum) continue
    const d = getInvoiceDate(inv)
    if (!d) continue
    if (!firstByDoc.has(docNum) || d < firstByDoc.get(docNum).date) {
      firstByDoc.set(docNum, { date: d, customerName: inv.customer?.name, total: inv.total || 0 })
    }
  }
  // "Nuevos" = todos los que tienen primera compra en este conjunto de invoices (ya filtrado por período)
  const nuevos = [...firstByDoc.entries()].map(([docNum, info]) => {
    const customer = customers.find(c => c.documentNumber === docNum)
    return {
      name: customer?.name || customer?.businessName || info.customerName || 'N/A',
      documentNumber: docNum,
      firstDate: info.date,
      firstTotal: info.total,
      email: customer?.email || '',
      phone: customer?.phone || '',
    }
  }).sort((a, b) => a.firstDate - b.firstDate)

  if (nuevos.length === 0) return

  const headers = ['Cliente', 'Documento', 'Primera Compra', 'Monto', 'Email', 'Teléfono']
  const totalCols = headers.length

  const aoa = [['CLIENTES NUEVOS DEL PERÍODO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    totalLabel: 'Total nuevos',
    totalItems: nuevos.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length
  nuevos.forEach(n => {
    aoa.push([
      n.name, n.documentNumber,
      formatDateLocale(n.firstDate),
      Number(n.firstTotal.toFixed(2)),
      n.email, n.phone,
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [32, 16, 16, 14, 26, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < nuevos.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, cellStyle(i))
    setStyle(ws, r, 5, centerStyle(i))
  }
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Nuevos del Período')
}

/** Agrega hoja "Productos sin vender" — masters que NO aparecen en topProducts. */
const appendUnsoldProductsSheet = (wb, { businessData, periodLabel, branchLabel, products, topProducts }) => {
  if (!products || products.length === 0) return
  const soldIds = new Set((topProducts || []).map(p => p.id).filter(Boolean))
  const unsold = products.filter(p => !soldIds.has(p.id) && p.trackStock !== false)
  if (unsold.length === 0) return

  const headers = ['SKU', 'Producto', 'Categoría', 'Stock Actual', 'Stock Mín.', 'Precio', 'Antigüedad (días)']
  const totalCols = headers.length

  const aoa = [['PRODUCTOS SIN VENTAS EN EL PERÍODO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total productos sin vender',
    totalItems: unsold.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const now = new Date()
  unsold.forEach(p => {
    const created = p.createdAt?.toDate ? p.createdAt.toDate() : (p.createdAt ? new Date(p.createdAt) : null)
    const days = created ? Math.round((now - created) / 86400000) : ''
    const stock = Number(p.stock) || 0
    const price = p.hasVariants && p.variants?.length > 0 ? (Number(p.variants[0].price) || 0) : (Number(p.price) || 0)
    aoa.push([
      p.sku || '',
      p.name || 'N/A',
      p.category || '-',
      stock,
      Number(p.minStock) || 0,
      Number(price),
      days,
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [16, 36, 22, 14, 12, 14, 16])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < unsold.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, intStyle(i))
    setStyle(ws, r, 4, intStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
    setStyle(ws, r, 6, intStyle(i))
  }
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Sin Vender')
}

/** Agrega hoja "Stock Bajo" — productos con stock <= minStock (o 0). */
const appendLowStockSheet = (wb, { businessData, products, branchLabel }) => {
  if (!products || products.length === 0) return
  const lowStock = products.filter(p => {
    if (p.trackStock === false) return false
    const stock = Number(p.stock) || 0
    const min = Number(p.minStock) || 3
    return stock <= min
  }).sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0))
  if (lowStock.length === 0) return

  const headers = ['SKU', 'Producto', 'Categoría', 'Stock', 'Stock Mín.', 'Estado', 'Precio', 'Valor Faltante']
  const totalCols = headers.length

  const aoa = [['ALERTA: PRODUCTOS CON STOCK BAJO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total productos en alerta',
    totalItems: lowStock.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalFaltante = 0
  const statuses = []
  lowStock.forEach(p => {
    const stock = Number(p.stock) || 0
    const min = Number(p.minStock) || 3
    const status = stock === 0 ? 'Sin stock' : 'Stock bajo'
    statuses.push(status)
    const price = p.hasVariants && p.variants?.length > 0 ? (Number(p.variants[0].price) || 0) : (Number(p.price) || 0)
    const faltante = Math.max(0, min - stock) * price
    totalFaltante += faltante
    aoa.push([
      p.sku || '',
      p.name || 'N/A',
      p.category || '-',
      stock,
      min,
      status,
      Number(price),
      Number(faltante.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', '', 'TOTAL FALTANTE', '', Number(totalFaltante.toFixed(2))])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [16, 36, 22, 12, 12, 14, 12, 16])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < lowStock.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, intStyle(i))
    setStyle(ws, r, 4, intStyle(i))
    setStyle(ws, r, 5, statuses[i] === 'Sin stock'
      ? { ...centerStyle(i), font: { ...centerStyle(i).font, bold: true, color: { rgb: 'B91C1C' } } }
      : { ...centerStyle(i), font: { ...centerStyle(i).font, bold: true, color: { rgb: 'B45309' } } })
    setStyle(ws, r, 6, numberStyle(i))
    setStyle(ws, r, 7, numberStyle(i))
  }
  for (let c = 0; c <= 6; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 7, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Bajo')
}

/** Agrega hoja "Análisis de Margen" — top y bottom 15 productos por margen %. */
const appendMarginAnalysisSheet = (wb, { businessData, periodLabel, branchLabel, topProducts }) => {
  const withMargin = (topProducts || [])
    .filter(p => (p.revenue || 0) > 0)
    .map(p => ({
      ...p,
      margin: ((p.revenue - (p.cost || 0)) / p.revenue) * 100,
    }))
  if (withMargin.length === 0) return

  const sortedByMargin = [...withMargin].sort((a, b) => b.margin - a.margin)
  const top = sortedByMargin.slice(0, 15)
  const bottom = sortedByMargin.slice(-15).reverse()

  const headers = ['#', 'Producto', 'Unidades', 'Ingresos', 'Costo', 'Utilidad', 'Margen %']
  const totalCols = headers.length

  const aoa = [['ANÁLISIS DE MARGEN POR PRODUCTO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
  const metaEnd = aoa.length - 1
  aoa.push([])

  // Sección Top 15
  const sec1Sub = aoa.length
  aoa.push(['TOP 15 — PRODUCTOS MÁS RENTABLES'])
  const sec1Header = aoa.length
  aoa.push(headers)
  const sec1DataStart = aoa.length
  top.forEach((p, i) => {
    aoa.push([
      i + 1, p.name,
      Number((p.quantity || 0).toFixed(2)),
      Number((p.revenue || 0).toFixed(2)),
      Number((p.cost || 0).toFixed(2)),
      Number(((p.revenue - (p.cost || 0))).toFixed(2)),
      Number(p.margin.toFixed(1)),
    ])
  })
  const sec1DataEnd = aoa.length - 1

  // Sección Bottom 15
  aoa.push([])
  const sec2Sub = aoa.length
  aoa.push(['BOTTOM 15 — PRODUCTOS MENOS RENTABLES'])
  const sec2Header = aoa.length
  aoa.push(headers)
  const sec2DataStart = aoa.length
  bottom.forEach((p, i) => {
    aoa.push([
      i + 1, p.name,
      Number((p.quantity || 0).toFixed(2)),
      Number((p.revenue || 0).toFixed(2)),
      Number((p.cost || 0).toFixed(2)),
      Number(((p.revenue - (p.cost || 0))).toFixed(2)),
      Number(p.margin.toFixed(1)),
    ])
  })
  const sec2DataEnd = aoa.length - 1

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [6, 38, 12, 14, 12, 14, 12])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)

  applySubtitleRow(ws, sec1Sub, totalCols)
  applyHeaderRow(ws, sec1Header, totalCols)
  for (let r = sec1DataStart; r <= sec1DataEnd; r++) {
    const i = r - sec1DataStart
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    for (let c = 2; c <= 6; c++) setStyle(ws, r, c, numberStyle(i))
  }
  applySubtitleRow(ws, sec2Sub, totalCols)
  applyHeaderRow(ws, sec2Header, totalCols)
  for (let r = sec2DataStart; r <= sec2DataEnd; r++) {
    const i = r - sec2DataStart
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    for (let c = 2; c <= 6; c++) setStyle(ws, r, c, numberStyle(i))
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Análisis Margen')
}

/** Agrega hoja "Heatmap" con análisis de cuándo se vende (día de la semana + hora). */
const appendHeatmapSheet = (wb, { businessData, periodLabel, branchLabel, invoices }) => {
  // Agregar por día de semana y por hora
  const byDay = Array.from({ length: 7 }, () => ({ count: 0, total: 0 }))
  const byHour = Array.from({ length: 24 }, () => ({ count: 0, total: 0 }))
  const byDayHour = new Map() // key: "d-h" → { count, total }

  for (const inv of invoices || []) {
    const d = getInvoiceDate(inv)
    if (!d) continue
    const day = d.getDay()
    const hour = d.getHours()
    const total = inv.total || 0
    byDay[day].count += 1
    byDay[day].total += total
    byHour[hour].count += 1
    byHour[hour].total += total
    const key = `${day}-${hour}`
    if (!byDayHour.has(key)) byDayHour.set(key, { day, hour, count: 0, total: 0 })
    const e = byDayHour.get(key)
    e.count += 1
    e.total += total
  }

  const aoa = [['HEATMAP: CUÁNDO SE VENDE'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
  const metaEnd = aoa.length - 1
  aoa.push([])

  // Sección 1: Por día de la semana
  const sec1Sub = aoa.length
  aoa.push(['POR DÍA DE LA SEMANA'])
  const sec1Header = aoa.length
  aoa.push(['Día', 'Comprobantes', 'Ingresos', '% del Total'])
  const sec1DataStart = aoa.length
  const dayTotalCount = byDay.reduce((s, d) => s + d.count, 0)
  for (let d = 0; d < 7; d++) {
    const pct = dayTotalCount > 0 ? Number(((byDay[d].count / dayTotalCount) * 100).toFixed(1)) : 0
    aoa.push([DAYS_OF_WEEK[d], byDay[d].count, Number(byDay[d].total.toFixed(2)), pct])
  }
  const sec1DataEnd = aoa.length - 1

  // Sección 2: Por hora del día
  aoa.push([])
  const sec2Sub = aoa.length
  aoa.push(['POR HORA DEL DÍA'])
  const sec2Header = aoa.length
  aoa.push(['Hora', 'Comprobantes', 'Ingresos', '% del Total'])
  const sec2DataStart = aoa.length
  for (let h = 0; h < 24; h++) {
    if (byHour[h].count === 0) continue // omitir horas sin actividad
    const pct = dayTotalCount > 0 ? Number(((byHour[h].count / dayTotalCount) * 100).toFixed(1)) : 0
    aoa.push([`${String(h).padStart(2, '0')}:00`, byHour[h].count, Number(byHour[h].total.toFixed(2)), pct])
  }
  const sec2DataEnd = aoa.length - 1

  // Sección 3: Top 10 combinaciones día+hora
  aoa.push([])
  const sec3Sub = aoa.length
  aoa.push(['TOP 10 COMBINACIONES DÍA + HORA'])
  const sec3Header = aoa.length
  aoa.push(['#', 'Día', 'Hora', 'Comprobantes', 'Ingresos'])
  const top10 = [...byDayHour.values()].sort((a, b) => b.count - a.count).slice(0, 10)
  const sec3DataStart = aoa.length
  top10.forEach((t, i) => {
    aoa.push([i + 1, DAYS_OF_WEEK[t.day], `${String(t.hour).padStart(2, '0')}:00`, t.count, Number(t.total.toFixed(2))])
  })
  const sec3DataEnd = aoa.length - 1

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [12, 18, 16, 14, 14])
  applyTitleRow(ws, 0, 5)
  applyMetadataRows(ws, metaStart, metaEnd)
  applySubtitleRow(ws, sec1Sub, 5)
  applyHeaderRow(ws, sec1Header, 4)
  for (let r = sec1DataStart; r <= sec1DataEnd; r++) {
    const i = r - sec1DataStart
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
  }
  applySubtitleRow(ws, sec2Sub, 5)
  applyHeaderRow(ws, sec2Header, 4)
  for (let r = sec2DataStart; r <= sec2DataEnd; r++) {
    const i = r - sec2DataStart
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
  }
  applySubtitleRow(ws, sec3Sub, 5)
  applyHeaderRow(ws, sec3Header, 5)
  for (let r = sec3DataStart; r <= sec3DataEnd; r++) {
    const i = r - sec3DataStart
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, intStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Heatmap')
}

/** Aplica los estilos de una sección creada con buildSection. */
const applySection = (ws, totalCols, section, { numericCols = [], totalNumericCols = [] } = {}) => {
  const { subtitleRow, headerRow, dataStart, dataEnd, totalRowIdx } = section
  applySubtitleRow(ws, subtitleRow, totalCols)
  applyHeaderRow(ws, headerRow, totalCols)
  // Filas de datos
  for (let r = dataStart; r <= dataEnd; r++) {
    const i = r - dataStart
    for (let c = 0; c < totalCols; c++) {
      if (numericCols.includes(c)) setStyle(ws, r, c, numberStyle(i))
      else if (c === 0) setStyle(ws, r, c, c === 0 && numericCols.includes(0) ? numberStyle(i) : cellStyle(i))
      else setStyle(ws, r, c, cellStyle(i))
    }
  }
  // Fila de total
  if (totalRowIdx !== null) {
    for (let c = 0; c < totalCols; c++) {
      if (totalNumericCols.includes(c)) setStyle(ws, totalRowIdx, c, totalNumberStyle)
      else setStyle(ws, totalRowIdx, c, totalLabelStyle)
    }
  }
}

// =================== REPORTE GENERAL ===================

export const exportGeneralReport = async (data) => {
  const {
    stats, salesByMonth, topProducts, topCustomers, filteredInvoices,
    dateRange, paymentMethodStats, customStartDate, customEndDate, branchLabel,
    businessData,
  } = data

  const wb = XLSX.utils.book_new()
  const periodLabel = getRangeLabel(dateRange, customStartDate, customEndDate)

  // ============== HOJA 1: RESUMEN ==============
  // Estructurado como varias "secciones" — cada una con subtitle, header y datos
  // numéricos con formato real de moneda.
  {
    const aoa = []
    aoa.push(['REPORTE GENERAL DE VENTAS'])
    aoa.push([])

    const metaStart = aoa.length
    const metadataRows = buildBusinessMetadataRows(businessData, {
      periodLabel,
      branchLabel: branchLabel || 'Todas',
      totalLabel: 'Total comprobantes',
      totalItems: stats.totalInvoices,
    })
    aoa.push(...metadataRows)
    const metaEnd = aoa.length - 1

    // Sección: KPIs principales
    const kpiSection = buildSection(aoa, {
      subtitle: 'KPIs PRINCIPALES',
      header: ['Indicador', 'Valor'],
      rows: [
        ['Ingresos Totales', Number((stats.totalRevenue || 0).toFixed(2))],
        ['Costo Total', Number((stats.totalCost || 0).toFixed(2))],
        ['Utilidad Total', Number((stats.totalProfit || 0).toFixed(2))],
        ['Margen de Utilidad %', Number((stats.profitMargin || 0).toFixed(2))],
        ['Crecimiento vs Período Anterior %', Number((stats.revenueGrowth || 0).toFixed(2))],
      ],
    })

    // Sección: Estado de cobro
    const cobroSection = buildSection(aoa, {
      subtitle: 'ESTADO DE COBRO',
      header: ['Concepto', 'Monto'],
      rows: [
        ['Ingresos Pagados', Number((stats.paidRevenue || 0).toFixed(2))],
        ['Ingresos Pendientes', Number((stats.pendingRevenue || 0).toFixed(2))],
      ],
    })

    // Sección: Documentos
    const docsSection = buildSection(aoa, {
      subtitle: 'DOCUMENTOS',
      header: ['Tipo', 'Cantidad'],
      rows: [
        ['Total Comprobantes', stats.totalInvoices || 0],
        ['Facturas', stats.facturas || 0],
        ['Boletas', stats.boletas || 0],
        ['Notas de Venta', stats.notasVenta || 0],
        ['Ticket Promedio', Number((stats.avgTicket || 0).toFixed(2))],
      ],
    })

    // Sección: Métodos de pago (opcional)
    let paySection = null
    if (paymentMethodStats && paymentMethodStats.length > 0) {
      paySection = buildSection(aoa, {
        subtitle: 'MÉTODOS DE PAGO',
        header: ['Método', 'Monto Total', 'Transacciones'],
        rows: paymentMethodStats.map(m => [
          m.method,
          Number((m.total || 0).toFixed(2)),
          m.count || 0,
        ]),
      })
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [38, 22, 18])
    applyTitleRow(ws, 0, 3)
    applyMetadataRows(ws, metaStart, metaEnd)

    // Aplicar secciones (valor en columna 1 = numérico, columna 2 = texto/int si aplica)
    applySection(ws, 3, kpiSection, { numericCols: [1] })
    applySection(ws, 3, cobroSection, { numericCols: [1] })
    applySection(ws, 3, docsSection, { numericCols: [1] })
    if (paySection) {
      applySection(ws, 3, paySection, { numericCols: [1, 2] })
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Resumen')
  }

  // ============== HOJA 2: VENTAS POR PERÍODO ==============
  {
    const headers = ['Período', 'Cantidad de Ventas', 'Ingresos']
    const aoa = [['VENTAS POR PERÍODO'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length
    let totalCount = 0, totalRev = 0
    salesByMonth.forEach(item => {
      const cnt = item.count || 0
      const rev = item.revenue || 0
      totalCount += cnt
      totalRev += rev
      aoa.push([item.period, cnt, Number(rev.toFixed(2))])
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push(['TOTALES', totalCount, Number(totalRev.toFixed(2))])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [22, 18, 18])
    applyTitleRow(ws, 0, 3)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, 3)
    for (let i = 0; i < salesByMonth.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, cellStyle(i))
      setStyle(ws, r, 1, intStyle(i))
      setStyle(ws, r, 2, numberStyle(i))
    }
    setStyle(ws, totalRowIdx, 0, totalLabelStyle)
    setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
    setStyle(ws, totalRowIdx, 2, totalNumberStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas por Período')
  }

  // ============== HOJA 3: TOP PRODUCTOS ==============
  if (topProducts && topProducts.length > 0) {
    const headers = ['#', 'Producto', 'Cantidad Vendida', 'Ingresos Generados']
    const aoa = [['TOP PRODUCTOS'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length
    let totalQty = 0, totalRev = 0
    topProducts.forEach((p, idx) => {
      const qty = Number((p.quantity || 0).toFixed(2))
      const rev = Number((p.revenue || 0).toFixed(2))
      totalQty += qty
      totalRev += rev
      aoa.push([idx + 1, p.name, qty, rev])
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push(['', 'TOTALES', Number(totalQty.toFixed(2)), Number(totalRev.toFixed(2))])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [6, 42, 18, 20])
    applyTitleRow(ws, 0, 4)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, 4)
    for (let i = 0; i < topProducts.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, cellStyle(i))
      setStyle(ws, r, 2, numberStyle(i))
      setStyle(ws, r, 3, numberStyle(i))
    }
    setStyle(ws, totalRowIdx, 0, totalLabelStyle)
    setStyle(ws, totalRowIdx, 1, totalLabelStyle)
    setStyle(ws, totalRowIdx, 2, totalNumberStyle)
    setStyle(ws, totalRowIdx, 3, totalNumberStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Top Productos')
  }

  // ============== HOJA 4: TOP CLIENTES ==============
  if (topCustomers && topCustomers.length > 0) {
    const headers = ['#', 'Cliente', 'Tipo Doc', 'Documento', 'Pedidos', 'Total Gastado']
    const aoa = [['TOP CLIENTES'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length
    let totalOrders = 0, totalSpent = 0
    topCustomers.forEach((c, idx) => {
      const orders = c.ordersCount || 0
      const spent = Number((c.totalSpent || 0).toFixed(2))
      totalOrders += orders
      totalSpent += spent
      aoa.push([
        idx + 1,
        c.name,
        c.documentType === '6' ? 'RUC' : 'DNI',
        c.documentNumber || '-',
        orders,
        spent,
      ])
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push(['', '', '', 'TOTALES', totalOrders, Number(totalSpent.toFixed(2))])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [6, 32, 10, 16, 12, 18])
    applyTitleRow(ws, 0, 6)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, 6)
    for (let i = 0; i < topCustomers.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, cellStyle(i))
      setStyle(ws, r, 2, centerStyle(i))
      setStyle(ws, r, 3, centerStyle(i))
      setStyle(ws, r, 4, intStyle(i))
      setStyle(ws, r, 5, numberStyle(i))
    }
    for (let c = 0; c < 4; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
    setStyle(ws, totalRowIdx, 4, { ...totalNumberStyle, numFmt: '#,##0' })
    setStyle(ws, totalRowIdx, 5, totalNumberStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Top Clientes')
  }

  // ============== HOJA 5: DETALLE DE VENTAS ==============
  if (filteredInvoices && filteredInvoices.length > 0) {
    const headers = [
      'Número', 'Fecha', 'Tipo', 'Cliente', 'Documento',
      'Estado', 'Estado SUNAT', 'Método Pago',
      'Descuento', 'Op. Gravada', 'Op. Exonerada', 'Op. Inafecta',
      'Subtotal', 'IGV', 'Total', 'Costo', 'Utilidad', 'Margen %',
    ]
    const totalCols = headers.length

    const aoa = [['DETALLE DE VENTAS'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)

    const sorted = [...filteredInvoices].sort((a, b) => {
      const dA = getInvoiceDate(a) || new Date(0)
      const dB = getInvoiceDate(b) || new Date(0)
      return dB - dA
    }).slice(0, 1000)

    const dataStart = aoa.length
    sorted.forEach(inv => {
      const buckets = computeTaxBuckets(inv)
      const invDate = getInvoiceDate(inv)
      const sunatStatus = inv.documentType === 'nota_venta'
        ? 'N/A'
        : (SUNAT_STATUS_LABELS[inv.sunatStatus] || inv.sunatStatus || 'Pendiente')
      aoa.push([
        inv.number,
        invDate ? formatDateLocale(invDate) : '-',
        DOC_TYPE_LABELS[inv.documentType] || 'Boleta',
        inv.customer?.name || 'Cliente General',
        inv.customer?.documentNumber || '-',
        inv.status === 'paid' ? 'Pagada' : 'Pendiente',
        sunatStatus,
        formatPayments(inv),
        Number((inv.discount || 0).toFixed(2)),
        Number(buckets.opGravada.toFixed(2)),
        Number(buckets.opExonerada.toFixed(2)),
        Number(buckets.opInafecta.toFixed(2)),
        Number((inv.subtotal || 0).toFixed(2)),
        Number((inv.igv || 0).toFixed(2)),
        Number((inv.total || 0).toFixed(2)),
        Number((inv.totalCost || 0).toFixed(2)),
        Number((inv.profit || 0).toFixed(2)),
        Number((inv.profitMargin || 0).toFixed(2)),
      ])
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [
      15, 12, 14, 30, 15, 12, 14, 25, 12, 14, 14, 14, 12, 10, 12, 12, 12, 10,
    ])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)

    // Filas de datos
    for (let i = 0; i < sorted.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, centerStyle(i))
      setStyle(ws, r, 2, centerStyle(i))
      setStyle(ws, r, 3, cellStyle(i))
      setStyle(ws, r, 4, centerStyle(i))
      setStyle(ws, r, 5, centerStyle(i))
      setStyle(ws, r, 6, centerStyle(i))
      setStyle(ws, r, 7, cellStyle(i))
      for (let c = 8; c < totalCols; c++) setStyle(ws, r, c, numberStyle(i))
    }
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle de Ventas')
  }

  // ============== HOJAS EXTRA: VENDEDOR / SUCURSAL / HEATMAP ==============

  if (filteredInvoices && filteredInvoices.length > 0) {
    // Por vendedor (solo si hay sellers identificados)
    const sellerGroups = groupInvoicesBy(filteredInvoices, inv => inv.sellerName || (inv.sellerId ? 'Sin nombre' : null))
      .filter(g => g.key && g.key !== 'Sin asignar')
    if (sellerGroups.length > 0) {
      appendGroupedSheet(wb, {
        sheetName: 'Por Vendedor',
        title: 'VENTAS POR VENDEDOR',
        groupLabel: 'Vendedor',
        businessData, periodLabel, branchLabel,
        groups: sellerGroups,
      })
    }

    // Por sucursal (solo si hay branches identificados)
    const branchGroups = groupInvoicesBy(filteredInvoices, inv => inv.branchName || (inv.branchId ? 'Sin nombre' : null))
      .filter(g => g.key && g.key !== 'Sin asignar')
    if (branchGroups.length > 0) {
      appendGroupedSheet(wb, {
        sheetName: 'Por Sucursal',
        title: 'VENTAS POR SUCURSAL',
        groupLabel: 'Sucursal',
        businessData, periodLabel, branchLabel,
        groups: branchGroups,
      })
    }

    // Heatmap día/hora — siempre se incluye
    appendHeatmapSheet(wb, { businessData, periodLabel, branchLabel, invoices: filteredInvoices })
  }

  const fileName = buildExcelFileName('Reporte_General', [periodLabel])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: `Reporte General: ${fileName}`,
    subDirectory: 'Reportes',
  })
}

// =================== REPORTE DE VENTAS ===================

export const exportSalesReport = async (data) => {
  const {
    stats, salesByMonth, filteredInvoices, dateRange, paymentMethodStats,
    customStartDate, customEndDate, branchLabel, businessData,
  } = data

  const wb = XLSX.utils.book_new()
  const periodLabel = getRangeLabel(dateRange, customStartDate, customEndDate)

  // ============== HOJA 1: RESUMEN ==============
  {
    const aoa = []
    aoa.push(['REPORTE DE VENTAS'])
    aoa.push([])

    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      periodLabel,
      branchLabel: branchLabel || 'Todas',
      totalLabel: 'Total comprobantes',
      totalItems: stats.totalInvoices,
    }))
    const metaEnd = aoa.length - 1

    const financeSection = buildSection(aoa, {
      subtitle: 'RESUMEN FINANCIERO',
      header: ['Concepto', 'Valor'],
      rows: [
        ['Total Ventas', Number((stats.totalRevenue || 0).toFixed(2))],
        ['Costo Total', Number((stats.totalCost || 0).toFixed(2))],
        ['Utilidad Total', Number((stats.totalProfit || 0).toFixed(2))],
        ['Margen de Utilidad %', Number((stats.profitMargin || 0).toFixed(2))],
      ],
    })

    const cobroSection = buildSection(aoa, {
      subtitle: 'ESTADO DE COBRO',
      header: ['Concepto', 'Monto'],
      rows: [
        ['Ventas Pagadas', Number((stats.paidRevenue || 0).toFixed(2))],
        ['Ventas Pendientes', Number((stats.pendingRevenue || 0).toFixed(2))],
      ],
    })

    const otrosSection = buildSection(aoa, {
      subtitle: 'OTROS INDICADORES',
      header: ['Indicador', 'Valor'],
      rows: [
        ['Total Comprobantes', stats.totalInvoices || 0],
        ['Crecimiento %', Number((stats.revenueGrowth || 0).toFixed(2))],
      ],
    })

    let paySection = null
    if (paymentMethodStats && paymentMethodStats.length > 0) {
      const totalAmount = paymentMethodStats.reduce((s, m) => s + (m.total || 0), 0)
      paySection = buildSection(aoa, {
        subtitle: 'MÉTODOS DE PAGO',
        header: ['Método', 'Monto', 'Transacciones', '% del Total'],
        rows: paymentMethodStats.map(m => [
          m.method,
          Number((m.total || 0).toFixed(2)),
          m.count || 0,
          totalAmount > 0 ? Number(((m.total / totalAmount) * 100).toFixed(1)) : 0,
        ]),
      })
    }

    const totalCols = paySection ? 4 : 2
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, paySection ? [38, 22, 18, 14] : [38, 22])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applySection(ws, totalCols, financeSection, { numericCols: [1] })
    applySection(ws, totalCols, cobroSection, { numericCols: [1] })
    applySection(ws, totalCols, otrosSection, { numericCols: [1] })
    if (paySection) {
      applySection(ws, totalCols, paySection, { numericCols: [1, 2, 3] })
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Resumen')
  }

  // ============== HOJA 2: VENTAS POR PERÍODO ==============
  {
    const aoa = [['VENTAS POR PERÍODO'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(['Período', 'Cantidad', 'Ingresos'])
    const dataStart = aoa.length
    let totalCount = 0, totalRev = 0
    salesByMonth.forEach(item => {
      const cnt = item.count || 0
      const rev = item.revenue || 0
      totalCount += cnt
      totalRev += rev
      aoa.push([item.period, cnt, Number(rev.toFixed(2))])
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push(['TOTALES', totalCount, Number(totalRev.toFixed(2))])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [22, 14, 18])
    applyTitleRow(ws, 0, 3)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, 3)
    for (let i = 0; i < salesByMonth.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, cellStyle(i))
      setStyle(ws, r, 1, intStyle(i))
      setStyle(ws, r, 2, numberStyle(i))
    }
    setStyle(ws, totalRowIdx, 0, totalLabelStyle)
    setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
    setStyle(ws, totalRowIdx, 2, totalNumberStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas por Período')
  }

  // ============== HOJA 3: DETALLE COMPLETO ==============
  {
    const headers = [
      'Número', 'Fecha', 'Tipo', 'Cliente', 'Doc Cliente',
      'Estado', 'Estado SUNAT', 'Método Pago',
      'Descuento', 'Op. Gravada', 'Op. Exonerada', 'Op. Inafecta',
      'Subtotal', 'IGV', 'Total', 'Costo', 'Utilidad', 'Margen %', 'Notas',
    ]
    const totalCols = headers.length

    const aoa = [['DETALLE COMPLETO DE VENTAS'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)

    const sorted = [...filteredInvoices].sort((a, b) => {
      const dA = getInvoiceDate(a) || new Date(0)
      const dB = getInvoiceDate(b) || new Date(0)
      return dB - dA
    })

    const dataStart = aoa.length
    sorted.forEach(inv => {
      const buckets = computeTaxBuckets(inv)
      const invDate = getInvoiceDate(inv)
      const sunatStatus = inv.documentType === 'nota_venta'
        ? 'N/A'
        : (SUNAT_STATUS_LABELS[inv.sunatStatus] || inv.sunatStatus || 'Pendiente')
      aoa.push([
        inv.number,
        invDate ? formatDateLocale(invDate) : '-',
        DOC_TYPE_LABELS[inv.documentType] || 'Boleta',
        inv.customer?.name || 'Cliente General',
        `${inv.customer?.documentType || ''} ${inv.customer?.documentNumber || ''}`.trim() || '-',
        inv.status === 'paid' ? 'Pagada' : 'Pendiente',
        sunatStatus,
        formatPayments(inv),
        Number((inv.discount || 0).toFixed(2)),
        Number(buckets.opGravada.toFixed(2)),
        Number(buckets.opExonerada.toFixed(2)),
        Number(buckets.opInafecta.toFixed(2)),
        Number((inv.subtotal || 0).toFixed(2)),
        Number((inv.igv || 0).toFixed(2)),
        Number((inv.total || 0).toFixed(2)),
        Number((inv.totalCost || 0).toFixed(2)),
        Number((inv.profit || 0).toFixed(2)),
        Number((inv.profitMargin || 0).toFixed(2)),
        inv.notes || '',
      ])
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [
      15, 12, 14, 30, 18, 12, 14, 25, 12, 14, 14, 14, 12, 10, 12, 12, 12, 10, 28,
    ])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)

    for (let i = 0; i < sorted.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, centerStyle(i))
      setStyle(ws, r, 2, centerStyle(i))
      setStyle(ws, r, 3, cellStyle(i))
      setStyle(ws, r, 4, centerStyle(i))
      setStyle(ws, r, 5, centerStyle(i))
      setStyle(ws, r, 6, centerStyle(i))
      setStyle(ws, r, 7, cellStyle(i))
      for (let c = 8; c <= 17; c++) setStyle(ws, r, c, numberStyle(i))
      setStyle(ws, r, 18, cellStyle(i))
    }
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle Completo')
  }

  // ============== HOJAS EXTRA ==============
  if (filteredInvoices && filteredInvoices.length > 0) {
    // Items detallados (siempre útil)
    appendItemsDetailSheet(wb, {
      businessData, periodLabel,
      branchLabel: branchLabel || 'Todas',
      invoices: filteredInvoices,
    })
    // Notas de crédito / débito (solo si hay)
    appendCreditNotesSheet(wb, {
      businessData, periodLabel,
      branchLabel: branchLabel || 'Todas',
      invoices: filteredInvoices,
    })
  }

  const fileName = buildExcelFileName('Reporte_Ventas', [periodLabel])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de Ventas: ${fileName}`,
    subDirectory: 'Reportes',
  })
}

// =================== REPORTE DE PRODUCTOS ===================

export const exportProductsReport = async (data) => {
  const {
    topProducts, salesByCategory, salesByBrand, products,
    dateRange, customStartDate, customEndDate, branchLabel, businessData,
  } = data

  const wb = XLSX.utils.book_new()
  const periodLabel = getRangeLabel(dateRange, customStartDate, customEndDate)

  // Totales generales (compartidos entre hojas)
  const totalUnidades = topProducts.reduce((sum, p) => sum + (p.quantity || 0), 0)
  const totalIngresos = topProducts.reduce((sum, p) => sum + (p.revenue || 0), 0)
  const totalCostos = topProducts.reduce((sum, p) => sum + (p.cost || 0), 0)
  const totalUtilidad = totalIngresos - totalCostos
  const margenPromedio = totalIngresos > 0 ? (totalUtilidad / totalIngresos) * 100 : 0

  // ============== HOJA 1: RESUMEN EJECUTIVO ==============
  {
    const aoa = [['REPORTE DE PRODUCTOS Y CATEGORÍAS'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      periodLabel,
      branchLabel: branchLabel || 'Todas',
    }))
    const metaEnd = aoa.length - 1

    const kpis = buildSection(aoa, {
      subtitle: 'RESUMEN EJECUTIVO',
      header: ['Indicador', 'Valor'],
      rows: [
        ['Total de productos vendidos', topProducts.length],
        ['Total de categorías', salesByCategory?.length || 0],
        ['Total de marcas', salesByBrand?.length || 0],
        ['Unidades vendidas', Number(totalUnidades.toFixed(2))],
        ['Ingresos totales', Number(totalIngresos.toFixed(2))],
        ['Costos totales', Number(totalCostos.toFixed(2))],
        ['Utilidad bruta', Number(totalUtilidad.toFixed(2))],
        ['Margen promedio %', Number(margenPromedio.toFixed(1))],
      ],
    })

    const top5Products = topProducts.slice(0, 5).map((p, i) => [
      `${i + 1}. ${p.name}`,
      Number((p.revenue || 0).toFixed(2)),
    ])
    const topProductsSection = top5Products.length > 0 ? buildSection(aoa, {
      subtitle: 'TOP 5 PRODUCTOS',
      header: ['Producto', 'Ingresos'],
      rows: top5Products,
    }) : null

    const top5Cats = (salesByCategory || []).slice(0, 5).map((c, i) => [
      `${i + 1}. ${c.name}`,
      Number((c.revenue || 0).toFixed(2)),
    ])
    const topCatsSection = top5Cats.length > 0 ? buildSection(aoa, {
      subtitle: 'TOP 5 CATEGORÍAS',
      header: ['Categoría', 'Ingresos'],
      rows: top5Cats,
    }) : null

    const top5Brands = (salesByBrand || []).slice(0, 5).map((b, i) => [
      `${i + 1}. ${b.name}`,
      Number((b.revenue || 0).toFixed(2)),
    ])
    const topBrandsSection = top5Brands.length > 0 ? buildSection(aoa, {
      subtitle: 'TOP 5 MARCAS',
      header: ['Marca', 'Ingresos'],
      rows: top5Brands,
    }) : null

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [44, 22])
    applyTitleRow(ws, 0, 2)
    applyMetadataRows(ws, metaStart, metaEnd)
    applySection(ws, 2, kpis, { numericCols: [1] })
    if (topProductsSection) applySection(ws, 2, topProductsSection, { numericCols: [1] })
    if (topCatsSection) applySection(ws, 2, topCatsSection, { numericCols: [1] })
    if (topBrandsSection) applySection(ws, 2, topBrandsSection, { numericCols: [1] })

    XLSX.utils.book_append_sheet(wb, ws, 'Resumen')
  }

  // ============== HOJA 2: DETALLE DE PRODUCTOS ==============
  {
    const headers = ['#', 'SKU', 'Producto', 'Unidades', 'Ingresos', 'Costo', 'Utilidad', 'Margen %', 'Precio Prom.']
    const totalCols = headers.length

    const aoa = [['DETALLE DE PRODUCTOS VENDIDOS'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length
    topProducts.forEach((p, idx) => {
      const margen = p.revenue > 0 ? ((p.profit || 0) / p.revenue) * 100 : 0
      const precioProm = p.quantity > 0 ? p.revenue / p.quantity : 0
      aoa.push([
        idx + 1,
        p.sku || '',
        p.name,
        Number((p.quantity || 0).toFixed(2)),
        Number((p.revenue || 0).toFixed(2)),
        Number((p.cost || 0).toFixed(2)),
        Number((p.profit || 0).toFixed(2)),
        Number(margen.toFixed(1)),
        Number(precioProm.toFixed(2)),
      ])
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push([
      '', '', 'TOTALES',
      Number(totalUnidades.toFixed(2)),
      Number(totalIngresos.toFixed(2)),
      Number(totalCostos.toFixed(2)),
      Number(totalUtilidad.toFixed(2)),
      Number(margenPromedio.toFixed(1)),
      '',
    ])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [6, 16, 42, 14, 16, 14, 14, 12, 14])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < topProducts.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, centerStyle(i))
      setStyle(ws, r, 2, cellStyle(i))
      for (let c = 3; c <= 8; c++) setStyle(ws, r, c, numberStyle(i))
    }
    for (let c = 0; c <= 2; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
    for (let c = 3; c <= 7; c++) setStyle(ws, totalRowIdx, c, totalNumberStyle)
    setStyle(ws, totalRowIdx, 8, totalLabelStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
  }

  // ============== HOJA 3: VENTAS POR CATEGORÍA ==============
  if (salesByCategory && salesByCategory.length > 0) {
    const headers = ['#', 'Categoría', 'Ventas', 'Unidades', 'Ingresos', 'Costo', 'Utilidad', 'Margen %', '% del Total']
    const totalCols = headers.length

    const totalCatIngresos = salesByCategory.reduce((s, c) => s + (c.revenue || 0), 0)
    const totalCatCostos = salesByCategory.reduce((s, c) => s + (c.cost || 0), 0)
    const totalCatUtilidad = totalCatIngresos - totalCatCostos
    const totalCatUnidades = salesByCategory.reduce((s, c) => s + (c.quantity || 0), 0)
    const totalCatVentas = salesByCategory.reduce((s, c) => s + (c.itemCount || 0), 0)
    const margenCat = totalCatIngresos > 0 ? (totalCatUtilidad / totalCatIngresos) * 100 : 0

    const aoa = [['VENTAS POR CATEGORÍA'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length
    salesByCategory.forEach((cat, idx) => {
      const margen = cat.revenue > 0 ? ((cat.profit || 0) / cat.revenue) * 100 : 0
      const porcentaje = totalCatIngresos > 0 ? (cat.revenue / totalCatIngresos) * 100 : 0
      aoa.push([
        idx + 1,
        cat.name,
        cat.itemCount || 0,
        Number((cat.quantity || 0).toFixed(2)),
        Number((cat.revenue || 0).toFixed(2)),
        Number((cat.cost || 0).toFixed(2)),
        Number((cat.profit || 0).toFixed(2)),
        Number(margen.toFixed(1)),
        Number(porcentaje.toFixed(1)),
      ])
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push([
      '', 'TOTALES', totalCatVentas,
      Number(totalCatUnidades.toFixed(2)),
      Number(totalCatIngresos.toFixed(2)),
      Number(totalCatCostos.toFixed(2)),
      Number(totalCatUtilidad.toFixed(2)),
      Number(margenCat.toFixed(1)),
      100.0,
    ])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [6, 26, 10, 12, 14, 12, 14, 12, 12])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < salesByCategory.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, cellStyle(i))
      setStyle(ws, r, 2, intStyle(i))
      for (let c = 3; c <= 8; c++) setStyle(ws, r, c, numberStyle(i))
    }
    setStyle(ws, totalRowIdx, 0, totalLabelStyle)
    setStyle(ws, totalRowIdx, 1, totalLabelStyle)
    setStyle(ws, totalRowIdx, 2, { ...totalNumberStyle, numFmt: '#,##0' })
    for (let c = 3; c <= 8; c++) setStyle(ws, totalRowIdx, c, totalNumberStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Categorías')
  }

  // ============== HOJA 4: VENTAS POR MARCA ==============
  if (salesByBrand && salesByBrand.length > 0) {
    const headers = ['#', 'Marca', 'Ventas', 'Unidades', 'Ingresos', 'Costo', 'Utilidad', 'Margen %', '% del Total']
    const totalCols = headers.length

    const totalBrandIngresos = salesByBrand.reduce((s, b) => s + (b.revenue || 0), 0)
    const totalBrandCostos = salesByBrand.reduce((s, b) => s + (b.cost || 0), 0)
    const totalBrandUtilidad = totalBrandIngresos - totalBrandCostos
    const totalBrandUnidades = salesByBrand.reduce((s, b) => s + (b.quantity || 0), 0)
    const totalBrandVentas = salesByBrand.reduce((s, b) => s + (b.itemCount || 0), 0)
    const margenBrand = totalBrandIngresos > 0 ? (totalBrandUtilidad / totalBrandIngresos) * 100 : 0

    const aoa = [['VENTAS POR MARCA'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length
    salesByBrand.forEach((brand, idx) => {
      const margen = brand.revenue > 0 ? ((brand.profit || 0) / brand.revenue) * 100 : 0
      const porcentaje = totalBrandIngresos > 0 ? (brand.revenue / totalBrandIngresos) * 100 : 0
      aoa.push([
        idx + 1,
        brand.name,
        brand.itemCount || 0,
        Number((brand.quantity || 0).toFixed(2)),
        Number((brand.revenue || 0).toFixed(2)),
        Number((brand.cost || 0).toFixed(2)),
        Number((brand.profit || 0).toFixed(2)),
        Number(margen.toFixed(1)),
        Number(porcentaje.toFixed(1)),
      ])
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push([
      '', 'TOTALES', totalBrandVentas,
      Number(totalBrandUnidades.toFixed(2)),
      Number(totalBrandIngresos.toFixed(2)),
      Number(totalBrandCostos.toFixed(2)),
      Number(totalBrandUtilidad.toFixed(2)),
      Number(margenBrand.toFixed(1)),
      100.0,
    ])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [6, 26, 10, 12, 14, 12, 14, 12, 12])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < salesByBrand.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, cellStyle(i))
      setStyle(ws, r, 2, intStyle(i))
      for (let c = 3; c <= 8; c++) setStyle(ws, r, c, numberStyle(i))
    }
    setStyle(ws, totalRowIdx, 0, totalLabelStyle)
    setStyle(ws, totalRowIdx, 1, totalLabelStyle)
    setStyle(ws, totalRowIdx, 2, { ...totalNumberStyle, numFmt: '#,##0' })
    for (let c = 3; c <= 8; c++) setStyle(ws, totalRowIdx, c, totalNumberStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Marcas')
  }

  // ============== HOJAS EXTRA: ANÁLISIS DE MARGEN / SIN VENDER / STOCK BAJO ==============

  // Análisis de margen (no necesita products extra)
  appendMarginAnalysisSheet(wb, {
    businessData, periodLabel, branchLabel: branchLabel || 'Todas',
    topProducts,
  })

  // Sin vender (requiere products master)
  if (products && products.length > 0) {
    appendUnsoldProductsSheet(wb, {
      businessData, periodLabel, branchLabel: branchLabel || 'Todas',
      products, topProducts,
    })
    // Stock bajo (también requiere products)
    appendLowStockSheet(wb, {
      businessData, branchLabel: branchLabel || 'Todas',
      products,
    })
  }

  const fileName = buildExcelFileName('Reporte_Productos_Categorias', [periodLabel])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de Productos: ${fileName}`,
    subDirectory: 'Reportes',
  })
}

// =================== REPORTE DE MARCAS ===================

/**
 * Exporta el reporte dedicado de Ventas por Marca a Excel.
 *
 * Genera dos hojas:
 *  - Resumen ejecutivo (KPIs + Top 10 marcas + Sin marca destacado)
 *  - Detalle completo de todas las marcas con totales
 *
 * El cálculo (revenue, cost, profit, profitMargin) viene precomputado en
 * salesByBrand desde Reports.jsx — esta función sólo agrega presentación.
 */
export const exportBrandsReport = async (data) => {
  const {
    salesByBrand,
    dateRange, customStartDate, customEndDate, branchLabel, businessData,
  } = data

  const wb = XLSX.utils.book_new()
  const periodLabel = getRangeLabel(dateRange, customStartDate, customEndDate)

  // Totales
  const totalIngresos = salesByBrand.reduce((s, b) => s + (b.revenue || 0), 0)
  const totalCostos = salesByBrand.reduce((s, b) => s + (b.cost || 0), 0)
  const totalUtilidad = totalIngresos - totalCostos
  const totalUnidades = salesByBrand.reduce((s, b) => s + (b.quantity || 0), 0)
  const totalVentas = salesByBrand.reduce((s, b) => s + (b.itemCount || 0), 0)
  const margenPromedio = totalIngresos > 0 ? (totalUtilidad / totalIngresos) * 100 : 0
  const topBrand = salesByBrand[0]
  // "Sin marca" se trata aparte como referencia (saber cuánto se vende sin marca asignada)
  const sinMarca = salesByBrand.find(b => b.name === 'Sin marca')

  // ============== HOJA 1: RESUMEN EJECUTIVO ==============
  {
    const aoa = [['REPORTE DE VENTAS POR MARCA'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      periodLabel,
      branchLabel: branchLabel || 'Todas',
    }))
    const metaEnd = aoa.length - 1

    const kpis = buildSection(aoa, {
      subtitle: 'RESUMEN EJECUTIVO',
      header: ['Indicador', 'Valor'],
      rows: [
        ['Total de marcas con ventas', salesByBrand.length],
        ['Marca más vendida', topBrand ? topBrand.name : '-'],
        ['Ingresos de la marca top', Number((topBrand?.revenue || 0).toFixed(2))],
        ['Unidades vendidas (todas las marcas)', Number(totalUnidades.toFixed(2))],
        ['Ingresos totales', Number(totalIngresos.toFixed(2))],
        ['Costos totales', Number(totalCostos.toFixed(2))],
        ['Utilidad bruta', Number(totalUtilidad.toFixed(2))],
        ['Margen promedio %', Number(margenPromedio.toFixed(1))],
        ...(sinMarca
          ? [['Ingresos de productos SIN marca', Number((sinMarca.revenue || 0).toFixed(2))]]
          : []),
      ],
    })

    const top10 = salesByBrand.slice(0, 10).map((b, i) => [
      `${i + 1}. ${b.name}`,
      Number((b.revenue || 0).toFixed(2)),
      totalIngresos > 0 ? Number(((b.revenue / totalIngresos) * 100).toFixed(1)) : 0,
    ])
    const topBrandsSection = top10.length > 0 ? buildSection(aoa, {
      subtitle: 'TOP 10 MARCAS POR INGRESOS',
      header: ['Marca', 'Ingresos', '% del Total'],
      rows: top10,
    }) : null

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [44, 18, 14])
    applyTitleRow(ws, 0, 3)
    applyMetadataRows(ws, metaStart, metaEnd)
    applySection(ws, 3, kpis, { numericCols: [1] })
    if (topBrandsSection) applySection(ws, 3, topBrandsSection, { numericCols: [1, 2] })

    XLSX.utils.book_append_sheet(wb, ws, 'Resumen')
  }

  // ============== HOJA 2: DETALLE COMPLETO ==============
  {
    const headers = ['#', 'Marca', 'Ventas', 'Unidades', 'Ingresos', 'Costo', 'Utilidad', 'Margen %', '% del Total']
    const totalCols = headers.length

    const aoa = [['DETALLE DE VENTAS POR MARCA'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { periodLabel, branchLabel: branchLabel || 'Todas' }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length
    salesByBrand.forEach((brand, idx) => {
      const margen = brand.revenue > 0 ? ((brand.profit || 0) / brand.revenue) * 100 : 0
      const porcentaje = totalIngresos > 0 ? (brand.revenue / totalIngresos) * 100 : 0
      aoa.push([
        idx + 1,
        brand.name,
        brand.itemCount || 0,
        Number((brand.quantity || 0).toFixed(2)),
        Number((brand.revenue || 0).toFixed(2)),
        Number((brand.cost || 0).toFixed(2)),
        Number((brand.profit || 0).toFixed(2)),
        Number(margen.toFixed(1)),
        Number(porcentaje.toFixed(1)),
      ])
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push([
      '', 'TOTALES', totalVentas,
      Number(totalUnidades.toFixed(2)),
      Number(totalIngresos.toFixed(2)),
      Number(totalCostos.toFixed(2)),
      Number(totalUtilidad.toFixed(2)),
      Number(margenPromedio.toFixed(1)),
      100.0,
    ])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [6, 26, 10, 12, 14, 12, 14, 12, 12])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < salesByBrand.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, cellStyle(i))
      setStyle(ws, r, 2, intStyle(i))
      for (let c = 3; c <= 8; c++) setStyle(ws, r, c, numberStyle(i))
    }
    setStyle(ws, totalRowIdx, 0, totalLabelStyle)
    setStyle(ws, totalRowIdx, 1, totalLabelStyle)
    setStyle(ws, totalRowIdx, 2, { ...totalNumberStyle, numFmt: '#,##0' })
    for (let c = 3; c <= 8; c++) setStyle(ws, totalRowIdx, c, totalNumberStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Marcas')
  }

  const fileName = buildExcelFileName('Reporte_Marcas', [periodLabel])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de Marcas: ${fileName}`,
    subDirectory: 'Reportes',
  })
}

// =================== REPORTE DE CLIENTES ===================

export const exportCustomersReport = async (data) => {
  const {
    topCustomers, customers, filteredInvoices,
    dateRange, customStartDate, customEndDate,
    branchLabel, businessData,
  } = data

  const wb = XLSX.utils.book_new()
  const periodLabel = getRangeLabel(dateRange, customStartDate, customEndDate)

  const headers = [
    'Posición', 'Cliente', 'Tipo Doc', 'Número Documento',
    'Email', 'Teléfono', 'Cantidad Pedidos', 'Total Gastado', 'Ticket Promedio',
  ]
  const totalCols = headers.length

  const aoa = [['REPORTE DE CLIENTES TOP'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total clientes',
    totalItems: topCustomers.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalOrders = 0, totalSpent = 0
  topCustomers.forEach((customer, idx) => {
    const orders = customer.ordersCount || 0
    const spent = Number((customer.totalSpent || 0).toFixed(2))
    const ticket = orders > 0 ? Number((spent / orders).toFixed(2)) : 0
    totalOrders += orders
    totalSpent += spent
    aoa.push([
      idx + 1,
      customer.name,
      customer.documentType === '6' ? 'RUC' : (customer.documentType === '1' ? 'DNI' : customer.documentType || '-'),
      customer.documentNumber || '-',
      customer.email || '-',
      customer.phone || '-',
      orders,
      spent,
      ticket,
    ])
  })

  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push([
    '', '', '', '', '', 'TOTALES',
    totalOrders,
    Number(totalSpent.toFixed(2)),
    totalOrders > 0 ? Number((totalSpent / totalOrders).toFixed(2)) : 0,
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [10, 32, 10, 18, 26, 16, 14, 18, 18])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  for (let i = 0; i < topCustomers.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, centerStyle(i))
    setStyle(ws, r, 4, cellStyle(i))
    setStyle(ws, r, 5, centerStyle(i))
    setStyle(ws, r, 6, intStyle(i))
    setStyle(ws, r, 7, numberStyle(i))
    setStyle(ws, r, 8, numberStyle(i))
  }
  for (let c = 0; c <= 5; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 6, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 7, totalNumberStyle)
  setStyle(ws, totalRowIdx, 8, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')

  // ============== HOJAS EXTRA: RFM / CUMPLEAÑEROS / INACTIVOS / NUEVOS ==============
  if (customers && customers.length > 0) {
    if (filteredInvoices && filteredInvoices.length > 0) {
      appendRfmSheet(wb, {
        businessData, periodLabel,
        branchLabel: branchLabel || 'Todas',
        customers, invoices: filteredInvoices,
      })
      appendInactiveSheet(wb, { businessData, customers, invoices: filteredInvoices })
      appendNewCustomersSheet(wb, {
        businessData, periodLabel,
        customers, invoices: filteredInvoices,
      })
    }
    appendBirthdaysSheet(wb, { businessData, customers })
  }

  const fileName = buildExcelFileName('Reporte_Clientes', [periodLabel])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de Clientes: ${fileName}`,
    subDirectory: 'Reportes',
  })
}
