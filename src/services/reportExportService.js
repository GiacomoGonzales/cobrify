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
    topProducts, salesByCategory, salesByBrand,
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

  const fileName = buildExcelFileName('Reporte_Productos_Categorias', [periodLabel])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de Productos: ${fileName}`,
    subDirectory: 'Reportes',
  })
}

// =================== REPORTE DE CLIENTES ===================

export const exportCustomersReport = async (data) => {
  const {
    topCustomers, dateRange, customStartDate, customEndDate,
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

  const fileName = buildExcelFileName('Reporte_Clientes', [periodLabel])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de Clientes: ${fileName}`,
    subDirectory: 'Reportes',
  })
}
