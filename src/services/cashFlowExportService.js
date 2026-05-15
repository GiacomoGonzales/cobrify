/**
 * Exportación del Flujo de Caja con estilos unificados.
 *
 * Hojas:
 *   - Resumen: ingresos, egresos, balance, proyecciones (con barra de % y badges)
 *   - Ingresos: detalle por categoría (Ventas, Otros, Préstamos, Financieros)
 *   - Egresos: detalle por categoría (Gastos, Compras, Otros, Préstamos, Financieros)
 *   - Detalle Ventas Cobradas
 *   - Detalle Gastos
 *   - Detalle Compras Pagadas
 *   - Movimientos Financieros
 *   - Por Cobrar (cuentas pendientes de clientes)
 *   - Por Pagar (compras + cuotas de préstamos pendientes)
 *
 * Todo el estilo se delega a excelStyles.
 */
import {
  XLSX,
  cellStyle, centerStyle, numberStyle, intStyle,
  badgeStyle, statusStyle, COLORS,
  totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applySubtitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  formatDate,
  saveAndShareExcel,
} from './excelStyles'

// =================== HELPERS LOCALES ===================

const EXPENSE_CATEGORY_LABEL = {
  servicios: 'Servicios Básicos',
  alquiler: 'Alquiler de Local',
  proveedores: 'Proveedores / Mercadería',
  gastos_ventas: 'Gastos de Ventas',
  transporte: 'Transporte / Combustible',
  personal: 'Sueldos / Personal',
  impuestos: 'Impuestos',
  mantenimiento: 'Mantenimiento',
  marketing: 'Marketing / Publicidad',
  bancarios: 'Gastos Bancarios',
  otros: 'Otros',
}
const expenseCategoryLabel = (id) => EXPENSE_CATEGORY_LABEL[id] || id || 'Otros'

const FINANCIAL_CATEGORY_LABEL = {
  aporte_capital: 'Aporte de Capital',
  venta_activo: 'Venta de Activo',
  dividendos_recibidos: 'Dividendos Recibidos',
  otros_ingresos: 'Otros Ingresos',
  retiro_dueno: 'Retiro del Dueño',
  compra_activo: 'Compra de Activo',
  dividendos_pagados: 'Dividendos Pagados',
  otros_egresos: 'Otros Egresos',
}
const financialCategoryLabel = (id) => FINANCIAL_CATEGORY_LABEL[id] || id || '-'

const PAYMENT_METHOD_LABEL = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  yape: 'Yape',
  plin: 'Plin',
}
const paymentMethodLabel = (id) => PAYMENT_METHOD_LABEL[id] || id || '-'

const moneyBadge = (positive) => badgeStyle({
  bg: positive ? COLORS.successTag : COLORS.dangerTag,
  fg: positive ? COLORS.successText : COLORS.dangerText,
})

const incomeBadge = () => badgeStyle({ bg: COLORS.successTag, fg: COLORS.successText })
const expenseBadge = () => badgeStyle({ bg: COLORS.dangerTag, fg: COLORS.dangerText })

// =================== EXPORT PRINCIPAL ===================

/**
 * @param {Object} args
 * @param {Object} args.data        Objeto cashFlowData calculado en CashFlow.jsx
 * @param {Object} args.businessData
 * @param {Object} args.dateRange   { startDate, endDate } (YYYY-MM-DD)
 * @param {string} args.branchLabel  "Todas las sucursales" o nombre concreto
 */
export const exportCashFlowExcel = async ({ data, businessData = null, dateRange, branchLabel }) => {
  if (!data) throw new Error('No hay datos para exportar')

  const periodLabel = `${formatDate(dateRange?.startDate)} - ${formatDate(dateRange?.endDate)}`

  const wb = XLSX.utils.book_new()
  appendSummarySheet(wb, data, businessData, periodLabel, branchLabel)
  appendIncomeSheet(wb, data, businessData, periodLabel, branchLabel)
  appendExpenseSheet(wb, data, businessData, periodLabel, branchLabel)
  appendSalesDetailSheet(wb, data, businessData, periodLabel)
  appendExpensesDetailSheet(wb, data, businessData, periodLabel)
  appendPurchasesDetailSheet(wb, data, businessData, periodLabel)
  appendFinancialMovementsSheet(wb, data, businessData, periodLabel)
  appendReceivablesSheet(wb, data, businessData)
  appendPayablesSheet(wb, data, businessData)

  const fileName = buildExcelFileName('FlujoDeCaja', [dateRange?.startDate, dateRange?.endDate])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Reporte de flujo de caja',
    subDirectory: 'FlujoDeCaja',
  })
  return { success: true }
}

// =================== HOJA 1: RESUMEN ===================

function appendSummarySheet(wb, data, businessData, periodLabel, branchLabel) {
  const totalCols = 4
  const aoa = [['REPORTE DE FLUJO DE CAJA'], []]

  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    branchLabel: branchLabel || 'Todas las sucursales',
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])

  // Sección Ingresos
  const incomeTitleRow = aoa.length
  aoa.push(['INGRESOS DEL PERÍODO'])
  const incomeHeaderRow = aoa.length
  aoa.push(['Categoría', 'Monto', '% del Total', ''])
  const incomeRows = [
    ['Ventas cobradas', data.salesIncome],
    ['Otros ingresos (caja)', data.otherIncome],
    ['Préstamos recibidos', data.loansIncome],
    ['Movimientos financieros (ingresos)', data.financialIncome],
  ]
  const incomeStart = aoa.length
  incomeRows.forEach(([label, amount]) => {
    const pct = data.totalIncome > 0 ? (amount / data.totalIncome) * 100 : 0
    aoa.push([label, Number((amount || 0).toFixed(2)), Number(pct.toFixed(1)), ''])
  })
  const incomeEnd = aoa.length - 1
  const incomeTotalRow = aoa.length
  aoa.push(['TOTAL INGRESOS', Number(data.totalIncome.toFixed(2)), 100, ''])
  aoa.push([])

  // Sección Egresos
  const expenseTitleRow = aoa.length
  aoa.push(['EGRESOS DEL PERÍODO'])
  const expenseHeaderRow = aoa.length
  aoa.push(['Categoría', 'Monto', '% del Total', ''])
  const expenseRows = [
    ['Gastos operativos', data.expensesTotal],
    ['Compras pagadas', data.purchasesTotal],
    ['Otros egresos (caja)', data.otherExpenses],
    ['Pago de cuotas de préstamos', data.loanInstallmentsTotal],
    ['Movimientos financieros (egresos)', data.financialExpenses],
  ]
  const expenseStart = aoa.length
  expenseRows.forEach(([label, amount]) => {
    const pct = data.totalExpenses > 0 ? (amount / data.totalExpenses) * 100 : 0
    aoa.push([label, Number((amount || 0).toFixed(2)), Number(pct.toFixed(1)), ''])
  })
  const expenseEnd = aoa.length - 1
  const expenseTotalRow = aoa.length
  aoa.push(['TOTAL EGRESOS', Number(data.totalExpenses.toFixed(2)), 100, ''])
  aoa.push([])

  // Balance
  const balanceTitleRow = aoa.length
  aoa.push(['BALANCE'])
  const balanceHeaderRow = aoa.length
  aoa.push(['Concepto', 'Monto', 'Estado', ''])
  const balanceStart = aoa.length
  const balanceLabel = data.balance >= 0 ? 'Superávit' : 'Déficit'
  aoa.push(['Balance del período (Ingresos - Egresos)', Number(data.balance.toFixed(2)), balanceLabel, ''])
  aoa.push([])

  // Proyecciones
  const projTitleRow = aoa.length
  aoa.push(['PROYECCIONES'])
  const projHeaderRow = aoa.length
  aoa.push(['Concepto', 'Monto', 'Detalle', ''])
  const projStart = aoa.length
  aoa.push(['Cuentas por cobrar (clientes)', Number(data.accountsReceivable.toFixed(2)), `${data.pendingInvoices?.length || 0} comprobante(s)`, ''])
  aoa.push(['Cuentas por pagar (proveedores)', Number(data.purchasesPayable.toFixed(2)), `${data.pendingPurchases?.length || 0} compra(s)`, ''])
  aoa.push(['Cuotas pendientes de préstamos', Number(data.loansPayable.toFixed(2)), `${data.pendingLoanInstallments?.length || 0} cuota(s)`, ''])
  const projEnd = aoa.length - 1
  const projBalanceLabel = data.projectedBalance >= 0 ? 'Favorable' : 'Desfavorable'
  const projTotalRow = aoa.length
  aoa.push(['BALANCE PROYECTADO', Number(data.projectedBalance.toFixed(2)), projBalanceLabel, ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [42, 18, 16, 4])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)

  // Sección Ingresos
  applySubtitleRow(ws, incomeTitleRow, totalCols)
  applyHeaderRow(ws, incomeHeaderRow, totalCols)
  for (let r = incomeStart; r <= incomeEnd; r++) {
    const i = r - incomeStart
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, numberStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
  }
  setStyle(ws, incomeTotalRow, 0, totalLabelStyle)
  setStyle(ws, incomeTotalRow, 1, totalNumberStyle)
  setStyle(ws, incomeTotalRow, 2, totalNumberStyle)

  // Sección Egresos
  applySubtitleRow(ws, expenseTitleRow, totalCols)
  applyHeaderRow(ws, expenseHeaderRow, totalCols)
  for (let r = expenseStart; r <= expenseEnd; r++) {
    const i = r - expenseStart
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, numberStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
  }
  setStyle(ws, expenseTotalRow, 0, totalLabelStyle)
  setStyle(ws, expenseTotalRow, 1, totalNumberStyle)
  setStyle(ws, expenseTotalRow, 2, totalNumberStyle)

  // Balance
  applySubtitleRow(ws, balanceTitleRow, totalCols)
  applyHeaderRow(ws, balanceHeaderRow, totalCols)
  setStyle(ws, balanceStart, 0, { ...cellStyle(0), font: { ...cellStyle(0).font, bold: true } })
  setStyle(ws, balanceStart, 1, { ...numberStyle(0), font: { ...numberStyle(0).font, bold: true, color: { rgb: data.balance >= 0 ? COLORS.statusOk : COLORS.statusError } } })
  setStyle(ws, balanceStart, 2, moneyBadge(data.balance >= 0))

  // Proyecciones
  applySubtitleRow(ws, projTitleRow, totalCols)
  applyHeaderRow(ws, projHeaderRow, totalCols)
  for (let r = projStart; r <= projEnd; r++) {
    const i = r - projStart
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, numberStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
  }
  setStyle(ws, projTotalRow, 0, totalLabelStyle)
  setStyle(ws, projTotalRow, 1, { ...totalNumberStyle, font: { ...totalNumberStyle.font, color: { rgb: data.projectedBalance >= 0 ? COLORS.statusOk : COLORS.statusError } } })
  setStyle(ws, projTotalRow, 2, moneyBadge(data.projectedBalance >= 0))

  applyFreezeBelow(ws, metaEnd + 1)
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen')
}

// =================== HOJA 2: INGRESOS ===================

function appendIncomeSheet(wb, data, businessData, periodLabel, branchLabel) {
  const headers = ['Categoría', 'Detalle', '# Items', 'Monto', '% del Total']
  const totalCols = headers.length

  const rows = [
    { cat: 'Ventas cobradas', det: 'Facturas y notas de venta pagadas', n: data.paidInvoices?.length || 0, amt: data.salesIncome },
    { cat: 'Otros ingresos (caja)', det: 'Movimientos manuales tipo ingreso', n: null, amt: data.otherIncome },
    { cat: 'Préstamos recibidos', det: 'Capital recibido en el período', n: data.loansReceived?.length || 0, amt: data.loansIncome },
    { cat: 'Aporte de Capital y otros', det: 'Movimientos financieros tipo ingreso', n: data.financialIncomeMovements?.length || 0, amt: data.financialIncome },
  ]

  const aoa = [['DETALLE DE INGRESOS'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    branchLabel: branchLabel || 'Todas las sucursales',
    totalLabel: 'Total ingresos',
    totalItems: Number(data.totalIncome.toFixed(2)),
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  rows.forEach(r => {
    const pct = data.totalIncome > 0 ? (r.amt / data.totalIncome) * 100 : 0
    aoa.push([
      r.cat, r.det, r.n ?? '',
      Number((r.amt || 0).toFixed(2)),
      Number(pct.toFixed(1)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTAL', '', '', Number(data.totalIncome.toFixed(2)), 100])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [32, 38, 12, 16, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, { ...cellStyle(i), font: { ...cellStyle(i).font, bold: true } })
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, totalLabelStyle)
  setStyle(ws, totalRowIdx, 2, totalLabelStyle)
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Ingresos')
}

// =================== HOJA 3: EGRESOS ===================

function appendExpenseSheet(wb, data, businessData, periodLabel, branchLabel) {
  const headers = ['Categoría', 'Detalle', '# Items', 'Monto', '% del Total']
  const totalCols = headers.length

  const byCat = data.expensesByCategory || {}
  const expenseCatRows = Object.entries(byCat).map(([catId, info]) => ({
    cat: expenseCategoryLabel(catId),
    det: `${info.items?.length || 0} gasto(s) operativo(s)`,
    n: info.items?.length || 0,
    amt: info.amount,
  }))

  const rows = [
    ...expenseCatRows,
    { cat: 'Compras pagadas', det: 'Contado + abonos de compras a crédito', n: data.paidPurchases?.length || 0, amt: data.purchasesTotal },
    { cat: 'Otros egresos (caja)', det: 'Movimientos manuales tipo egreso', n: null, amt: data.otherExpenses },
    { cat: 'Pago de cuotas de préstamos', det: 'Cuotas pagadas en el período', n: data.paidLoanInstallments?.length || 0, amt: data.loanInstallmentsTotal },
    { cat: 'Retiros del dueño y otros', det: 'Movimientos financieros tipo egreso', n: data.financialExpenseMovements?.length || 0, amt: data.financialExpenses },
  ]

  const aoa = [['DETALLE DE EGRESOS'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    branchLabel: branchLabel || 'Todas las sucursales',
    totalLabel: 'Total egresos',
    totalItems: Number(data.totalExpenses.toFixed(2)),
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  rows.forEach(r => {
    const pct = data.totalExpenses > 0 ? (r.amt / data.totalExpenses) * 100 : 0
    aoa.push([
      r.cat, r.det, r.n ?? '',
      Number((r.amt || 0).toFixed(2)),
      Number(pct.toFixed(1)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTAL', '', '', Number(data.totalExpenses.toFixed(2)), 100])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [32, 38, 12, 16, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, { ...cellStyle(i), font: { ...cellStyle(i).font, bold: true } })
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, totalLabelStyle)
  setStyle(ws, totalRowIdx, 2, totalLabelStyle)
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Egresos')
}

// =================== HOJA 4: DETALLE VENTAS COBRADAS ===================

function appendSalesDetailSheet(wb, data, businessData, periodLabel) {
  const invs = data.paidInvoices || []
  if (invs.length === 0) return

  const headers = ['Fecha', 'Número', 'Tipo', 'Cliente', 'Moneda', 'Total Doc.', 'Cobrado en período', 'Estado']
  const totalCols = headers.length

  const aoa = [['VENTAS COBRADAS EN EL PERÍODO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    totalLabel: 'Total de ventas cobradas',
    totalItems: invs.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const typeNames = {
    factura: 'Factura', boleta: 'Boleta',
    nota_venta: 'Nota Venta',
    nota_credito: 'Nota Crédito', 'nota-credito': 'Nota Crédito',
  }

  let total = 0
  invs.forEach(inv => {
    const docDate = inv.issueDate || inv.createdAt || inv.date
    const cobradoNative = (inv.paymentHistory || []).reduce((s, p) => s + (p.amount || 0), 0) || inv.total || 0
    total += Number(cobradoNative) || 0
    aoa.push([
      formatDate(docDate),
      inv.number || '-',
      typeNames[inv.documentType] || 'Factura',
      inv.customer?.businessName || inv.customer?.name || 'Cliente general',
      inv.currency || 'PEN',
      Number((inv.total || 0).toFixed(2)),
      Number((cobradoNative || 0).toFixed(2)),
      inv.status === 'paid' ? 'Pagada' : (inv.paymentStatus === 'partial' ? 'Parcial' : 'Pagada'),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', 'TOTAL', '', Number(total.toFixed(2)), ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [13, 16, 14, 32, 10, 14, 18, 12])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < invs.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, centerStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
    setStyle(ws, r, 7, statusStyle(i, 'Pagada'))
  }
  for (let c = 0; c <= 5; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 6, totalNumberStyle)
  setStyle(ws, totalRowIdx, 7, totalLabelStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas Cobradas')
}

// =================== HOJA 5: DETALLE GASTOS ===================

function appendExpensesDetailSheet(wb, data, businessData, periodLabel) {
  const list = data.filteredExpenses || []
  if (list.length === 0) return

  const headers = ['Fecha', 'Categoría', 'Descripción', 'Método de Pago', 'Moneda', 'Monto']
  const totalCols = headers.length

  const aoa = [['GASTOS OPERATIVOS DEL PERÍODO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    totalLabel: 'Total de gastos',
    totalItems: list.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let total = 0
  list.forEach(e => {
    const amt = Number(e.amount) || 0
    total += amt
    aoa.push([
      formatDate(e.date),
      expenseCategoryLabel(e.category),
      e.description || '-',
      paymentMethodLabel(e.paymentMethod),
      e.currency || 'PEN',
      Number(amt.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', 'TOTAL', Number(total.toFixed(2))])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [13, 26, 40, 16, 10, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < list.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, centerStyle(i))
    setStyle(ws, r, 4, centerStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
  }
  for (let c = 0; c <= 4; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 5, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Detalle Gastos')
}

// =================== HOJA 6: DETALLE COMPRAS PAGADAS ===================

function appendPurchasesDetailSheet(wb, data, businessData, periodLabel) {
  const cash = data.paidPurchases || []
  const payments = data.purchasePayments || []
  if (cash.length === 0 && payments.length === 0) return

  const headers = ['Fecha', 'N° Compra', 'Proveedor', 'Tipo Pago', 'Concepto', 'Moneda', 'Monto']
  const totalCols = headers.length

  const aoa = [['COMPRAS PAGADAS EN EL PERÍODO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    totalLabel: 'Total movimientos de compra',
    totalItems: cash.length + payments.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let total = 0
  // Compras al contado / pagadas completas (legacy)
  cash.forEach(p => {
    const amt = Number(p.total) || 0
    total += amt
    aoa.push([
      formatDate(p.invoiceDate || p.createdAt),
      p.invoiceNumber || '-',
      p.supplier?.businessName || 'Proveedor',
      p.paymentType === 'credito' ? 'Crédito (completo)' : 'Contado',
      'Compra completa',
      p.currency || 'PEN',
      Number(amt.toFixed(2)),
    ])
  })
  // Abonos parciales
  payments.forEach(p => {
    const amt = Number(p.amount) || 0
    total += amt
    aoa.push([
      formatDate(p.date),
      p.invoiceNumber || '-',
      p.supplierName || 'Proveedor',
      'Crédito (abono)',
      p.notes || 'Abono',
      p._parentCurrency || 'PEN',
      Number(amt.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', '', 'TOTAL', Number(total.toFixed(2))])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [13, 16, 30, 18, 24, 10, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  const rowCount = cash.length + payments.length
  for (let i = 0; i < rowCount; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, centerStyle(i))
    setStyle(ws, r, 4, cellStyle(i))
    setStyle(ws, r, 5, centerStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
  }
  for (let c = 0; c <= 5; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 6, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Compras Pagadas')
}

// =================== HOJA 7: MOVIMIENTOS FINANCIEROS ===================

function appendFinancialMovementsSheet(wb, data, businessData, periodLabel) {
  const inc = data.financialIncomeMovements || []
  const exp = data.financialExpenseMovements || []
  if (inc.length === 0 && exp.length === 0) return

  const headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Método de Pago', 'Monto']
  const totalCols = headers.length

  const aoa = [['MOVIMIENTOS FINANCIEROS'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    totalLabel: 'Total movimientos',
    totalItems: inc.length + exp.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const rows = [
    ...inc.map(m => ({ ...m, _type: 'income' })),
    ...exp.map(m => ({ ...m, _type: 'expense' })),
  ].sort((a, b) => {
    const da = new Date(a.date?.toDate ? a.date.toDate() : a.date).getTime() || 0
    const db = new Date(b.date?.toDate ? b.date.toDate() : b.date).getTime() || 0
    return da - db
  })

  let totalInc = 0, totalExp = 0
  rows.forEach(m => {
    const amt = Number(m.amount) || 0
    if (m._type === 'income') totalInc += amt
    else totalExp += amt
    aoa.push([
      formatDate(m.date),
      m._type === 'income' ? 'Ingreso' : 'Egreso',
      financialCategoryLabel(m.category),
      m.description || '-',
      paymentMethodLabel(m.paymentMethod),
      Number(amt.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalIncRow = aoa.length
  aoa.push(['', '', '', '', 'TOTAL INGRESOS', Number(totalInc.toFixed(2))])
  const totalExpRow = aoa.length
  aoa.push(['', '', '', '', 'TOTAL EGRESOS', Number(totalExp.toFixed(2))])
  const netRow = aoa.length
  aoa.push(['', '', '', '', 'NETO', Number((totalInc - totalExp).toFixed(2))])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [13, 12, 26, 36, 16, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, rows[i]._type === 'income' ? incomeBadge() : expenseBadge())
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, centerStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
  }
  for (const r of [totalIncRow, totalExpRow, netRow]) {
    for (let c = 0; c <= 4; c++) setStyle(ws, r, c, totalLabelStyle)
    setStyle(ws, r, 5, totalNumberStyle)
  }
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Movs. Financieros')
}

// =================== HOJA 8: POR COBRAR ===================

function appendReceivablesSheet(wb, data, businessData) {
  const list = data.pendingInvoices || []
  if (list.length === 0) return

  const headers = ['Fecha emisión', 'Número', 'Tipo', 'Cliente', 'RUC/DNI', 'Total', 'Pagado', 'Saldo']
  const totalCols = headers.length

  const aoa = [['CUENTAS POR COBRAR'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total comprobantes pendientes',
    totalItems: list.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const typeNames = {
    factura: 'Factura', boleta: 'Boleta',
    nota_venta: 'Nota Venta',
  }
  let totalTot = 0, totalPaid = 0, totalSaldo = 0
  list.forEach(inv => {
    const tot = Number(inv.total) || 0
    const paid = (inv.paymentHistory || []).reduce((s, p) => s + (p.amount || 0), 0)
    const saldo = Math.max(0, tot - paid)
    totalTot += tot
    totalPaid += paid
    totalSaldo += saldo
    aoa.push([
      formatDate(inv.issueDate || inv.createdAt),
      inv.number || '-',
      typeNames[inv.documentType] || 'Factura',
      inv.customer?.businessName || inv.customer?.name || 'Cliente general',
      inv.customer?.documentNumber || '-',
      Number(tot.toFixed(2)),
      Number(paid.toFixed(2)),
      Number(saldo.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', 'TOTAL', Number(totalTot.toFixed(2)), Number(totalPaid.toFixed(2)), Number(totalSaldo.toFixed(2))])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [13, 16, 14, 32, 14, 14, 14, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < list.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, centerStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
    setStyle(ws, r, 7, { ...numberStyle(i), font: { ...numberStyle(i).font, bold: true, color: { rgb: COLORS.statusWarn } } })
  }
  for (let c = 0; c <= 4; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 5, totalNumberStyle)
  setStyle(ws, totalRowIdx, 6, totalNumberStyle)
  setStyle(ws, totalRowIdx, 7, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Cobrar')
}

// =================== HOJA 9: POR PAGAR ===================

function appendPayablesSheet(wb, data, businessData) {
  const purchases = data.pendingPurchases || []
  const loanInst = data.pendingLoanInstallments || []
  if (purchases.length === 0 && loanInst.length === 0) return

  const headers = ['Concepto', 'Fecha emisión', 'Referencia', 'Acreedor', 'Tipo', 'Total', 'Pagado', 'Saldo']
  const totalCols = headers.length

  const aoa = [['CUENTAS POR PAGAR'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total compromisos pendientes',
    totalItems: purchases.length + loanInst.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalTot = 0, totalPaid = 0, totalSaldo = 0

  purchases.forEach(p => {
    const tot = Number(p.total) || 0
    const paid = Number(p.paidAmount) || 0
    const saldo = Math.max(0, tot - paid)
    totalTot += tot
    totalPaid += paid
    totalSaldo += saldo
    aoa.push([
      'Compra',
      formatDate(p.invoiceDate || p.createdAt),
      p.invoiceNumber || '-',
      p.supplier?.businessName || 'Proveedor',
      'Crédito',
      Number(tot.toFixed(2)),
      Number(paid.toFixed(2)),
      Number(saldo.toFixed(2)),
    ])
  })
  loanInst.forEach(inst => {
    const tot = Number(inst.amount) || 0
    totalTot += tot
    totalSaldo += tot
    aoa.push([
      'Cuota Préstamo',
      formatDate(inst.dueDate),
      `Cuota ${inst.number || ''}`,
      inst.lenderName || 'Acreedor',
      inst.loanType === 'bank' ? 'Banco' : 'Particular',
      Number(tot.toFixed(2)),
      0,
      Number(tot.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', 'TOTAL', Number(totalTot.toFixed(2)), Number(totalPaid.toFixed(2)), Number(totalSaldo.toFixed(2))])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [16, 13, 16, 28, 14, 14, 14, 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  const rowCount = purchases.length + loanInst.length
  for (let i = 0; i < rowCount; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, { ...cellStyle(i), font: { ...cellStyle(i).font, bold: true } })
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, centerStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
    setStyle(ws, r, 7, { ...numberStyle(i), font: { ...numberStyle(i).font, bold: true, color: { rgb: COLORS.statusError } } })
  }
  for (let c = 0; c <= 4; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 5, totalNumberStyle)
  setStyle(ws, totalRowIdx, 6, totalNumberStyle)
  setStyle(ws, totalRowIdx, 7, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Pagar')
}
