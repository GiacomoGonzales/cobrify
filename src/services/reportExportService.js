import * as XLSX from 'xlsx'
import { formatCurrency, formatDate } from '@/lib/utils'

/**
 * Servicio para exportar reportes a Excel
 */

/**
 * Exportar reporte general a Excel
 */
export const exportGeneralReport = (data) => {
  const { stats, salesByMonth, topProducts, topCustomers, filteredInvoices, dateRange } = data

  // Crear un nuevo workbook
  const wb = XLSX.utils.book_new()

  // Hoja 1: Resumen General
  const summaryData = [
    ['REPORTE GENERAL DE VENTAS'],
    ['Período:', getRangeLabel(dateRange)],
    ['Fecha de generación:', new Date().toLocaleString('es-PE')],
    [],
    ['KPIs PRINCIPALES'],
    ['Indicador', 'Valor'],
    ['Ingresos Totales', formatCurrency(stats.totalRevenue)],
    ['Ingresos Pagados', formatCurrency(stats.paidRevenue)],
    ['Ingresos Pendientes', formatCurrency(stats.pendingRevenue)],
    ['Total Comprobantes', stats.totalInvoices],
    ['Facturas', stats.facturas],
    ['Boletas', stats.boletas],
    ['Ticket Promedio', formatCurrency(stats.avgTicket)],
    ['Crecimiento vs Período Anterior', `${stats.revenueGrowth.toFixed(2)}%`],
  ]

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)

  // Ajustar ancho de columnas
  ws1['!cols'] = [
    { wch: 30 },
    { wch: 20 }
  ]

  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // Hoja 2: Ventas por Mes
  const salesHeader = [['Mes', 'Cantidad de Ventas', 'Ingresos']]
  const salesData = salesByMonth.map(item => [
    item.month,
    item.count,
    item.revenue
  ])

  const ws2 = XLSX.utils.aoa_to_sheet([...salesHeader, ...salesData])
  ws2['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Ventas por Mes')

  // Hoja 3: Top Productos
  if (topProducts && topProducts.length > 0) {
    const productsHeader = [['Posición', 'Producto', 'Cantidad Vendida', 'Ingresos Generados']]
    const productsData = topProducts.map((product, index) => [
      index + 1,
      product.name,
      product.quantity.toFixed(2),
      product.revenue
    ])

    const ws3 = XLSX.utils.aoa_to_sheet([...productsHeader, ...productsData])
    ws3['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 20 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Top Productos')
  }

  // Hoja 4: Top Clientes
  if (topCustomers && topCustomers.length > 0) {
    const customersHeader = [['Posición', 'Cliente', 'Tipo Doc', 'Documento', 'Pedidos', 'Total Gastado']]
    const customersData = topCustomers.map((customer, index) => [
      index + 1,
      customer.name,
      customer.documentType === '6' ? 'RUC' : 'DNI',
      customer.documentNumber,
      customer.ordersCount || 0,
      customer.totalSpent || 0
    ])

    const ws4 = XLSX.utils.aoa_to_sheet([...customersHeader, ...customersData])
    ws4['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws4, 'Top Clientes')
  }

  // Hoja 5: Detalle de Ventas
  if (filteredInvoices && filteredInvoices.length > 0) {
    const invoicesHeader = [['Número', 'Fecha', 'Tipo', 'Cliente', 'Documento', 'Estado', 'Subtotal', 'IGV', 'Total']]
    const invoicesData = filteredInvoices.slice(0, 1000).map(invoice => [
      invoice.number,
      invoice.createdAt ? formatDate(invoice.createdAt.toDate ? invoice.createdAt.toDate() : invoice.createdAt) : '-',
      invoice.documentType === 'factura' ? 'Factura' : 'Boleta',
      invoice.customer?.name || 'Cliente General',
      invoice.customer?.documentNumber || '-',
      invoice.status === 'paid' ? 'Pagada' : 'Pendiente',
      invoice.subtotal || 0,
      invoice.igv || 0,
      invoice.total || 0
    ])

    const ws5 = XLSX.utils.aoa_to_sheet([...invoicesHeader, ...invoicesData])
    ws5['!cols'] = [
      { wch: 15 },
      { wch: 12 },
      { wch: 10 },
      { wch: 30 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 }
    ]
    XLSX.utils.book_append_sheet(wb, ws5, 'Detalle de Ventas')
  }

  // Generar archivo
  const fileName = `Reporte_General_${dateRange}_${Date.now()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

/**
 * Exportar reporte de ventas a Excel
 */
export const exportSalesReport = (data) => {
  const { stats, salesByMonth, filteredInvoices, dateRange } = data

  const wb = XLSX.utils.book_new()

  // Hoja 1: Resumen de Ventas
  const summaryData = [
    ['REPORTE DE VENTAS'],
    ['Período:', getRangeLabel(dateRange)],
    ['Fecha de generación:', new Date().toLocaleString('es-PE')],
    [],
    ['RESUMEN'],
    ['Concepto', 'Valor'],
    ['Total Ventas', formatCurrency(stats.totalRevenue)],
    ['Ventas Pagadas', formatCurrency(stats.paidRevenue)],
    ['Ventas Pendientes', formatCurrency(stats.pendingRevenue)],
    ['Total Comprobantes', stats.totalInvoices],
    ['Crecimiento', `${stats.revenueGrowth.toFixed(2)}%`],
  ]

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 30 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // Hoja 2: Ventas Mensuales
  const salesHeader = [['Mes', 'Cantidad', 'Ingresos']]
  const salesData = salesByMonth.map(item => [
    item.month,
    item.count,
    item.revenue
  ])

  const ws2 = XLSX.utils.aoa_to_sheet([...salesHeader, ...salesData])
  ws2['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Ventas Mensuales')

  // Hoja 3: Detalle Completo
  const detailHeader = [['Número', 'Fecha', 'Tipo', 'Cliente', 'Doc Cliente', 'Estado', 'Método Pago', 'Subtotal', 'IGV', 'Total', 'Notas']]
  const detailData = filteredInvoices.map(invoice => [
    invoice.number,
    invoice.createdAt ? formatDate(invoice.createdAt.toDate ? invoice.createdAt.toDate() : invoice.createdAt) : '-',
    invoice.documentType === 'factura' ? 'Factura' : 'Boleta',
    invoice.customer?.name || 'Cliente General',
    `${invoice.customer?.documentType || ''} ${invoice.customer?.documentNumber || ''}`,
    invoice.status === 'paid' ? 'Pagada' : 'Pendiente',
    invoice.paymentMethod || '-',
    invoice.subtotal || 0,
    invoice.igv || 0,
    invoice.total || 0,
    invoice.notes || ''
  ])

  const ws3 = XLSX.utils.aoa_to_sheet([...detailHeader, ...detailData])
  ws3['!cols'] = [
    { wch: 15 },
    { wch: 12 },
    { wch: 10 },
    { wch: 30 },
    { wch: 18 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 30 }
  ]
  XLSX.utils.book_append_sheet(wb, ws3, 'Detalle Completo')

  const fileName = `Reporte_Ventas_${dateRange}_${Date.now()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

/**
 * Exportar reporte de productos a Excel
 */
export const exportProductsReport = (data) => {
  const { topProducts, dateRange } = data

  const wb = XLSX.utils.book_new()

  // Hoja: Productos
  const productsData = [
    ['REPORTE DE PRODUCTOS MÁS VENDIDOS'],
    ['Período:', getRangeLabel(dateRange)],
    ['Fecha de generación:', new Date().toLocaleString('es-PE')],
    [],
    ['Posición', 'Producto', 'Cantidad Vendida', 'Ingresos Generados', 'Precio Promedio'],
  ]

  topProducts.forEach((product, index) => {
    productsData.push([
      index + 1,
      product.name,
      product.quantity.toFixed(2),
      product.revenue,
      product.quantity > 0 ? (product.revenue / product.quantity).toFixed(2) : 0
    ])
  })

  // Agregar totales
  const totalQuantity = topProducts.reduce((sum, p) => sum + p.quantity, 0)
  const totalRevenue = topProducts.reduce((sum, p) => sum + p.revenue, 0)

  productsData.push([])
  productsData.push(['TOTALES', '', totalQuantity.toFixed(2), totalRevenue, ''])

  const ws = XLSX.utils.aoa_to_sheet(productsData)
  ws['!cols'] = [
    { wch: 12 },
    { wch: 40 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 }
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Productos')

  const fileName = `Reporte_Productos_${dateRange}_${Date.now()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

/**
 * Exportar reporte de clientes a Excel
 */
export const exportCustomersReport = (data) => {
  const { topCustomers, dateRange } = data

  const wb = XLSX.utils.book_new()

  // Hoja: Clientes
  const customersData = [
    ['REPORTE DE CLIENTES TOP'],
    ['Período:', getRangeLabel(dateRange)],
    ['Fecha de generación:', new Date().toLocaleString('es-PE')],
    [],
    ['Posición', 'Cliente', 'Tipo Doc', 'Número Documento', 'Email', 'Teléfono', 'Cantidad Pedidos', 'Total Gastado', 'Ticket Promedio'],
  ]

  topCustomers.forEach((customer, index) => {
    customersData.push([
      index + 1,
      customer.name,
      customer.documentType === '6' ? 'RUC' : customer.documentType === '1' ? 'DNI' : customer.documentType,
      customer.documentNumber,
      customer.email || '-',
      customer.phone || '-',
      customer.ordersCount || 0,
      customer.totalSpent || 0,
      customer.ordersCount > 0 ? ((customer.totalSpent || 0) / customer.ordersCount).toFixed(2) : 0
    ])
  })

  // Agregar totales
  const totalOrders = topCustomers.reduce((sum, c) => sum + (c.ordersCount || 0), 0)
  const totalSpent = topCustomers.reduce((sum, c) => sum + (c.totalSpent || 0), 0)

  customersData.push([])
  customersData.push(['TOTALES', '', '', '', '', '', totalOrders, totalSpent, totalOrders > 0 ? (totalSpent / totalOrders).toFixed(2) : 0])

  const ws = XLSX.utils.aoa_to_sheet(customersData)
  ws['!cols'] = [
    { wch: 12 },
    { wch: 35 },
    { wch: 12 },
    { wch: 18 },
    { wch: 30 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 }
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')

  const fileName = `Reporte_Clientes_${dateRange}_${Date.now()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

/**
 * Helper para obtener etiqueta del rango de fecha
 */
const getRangeLabel = (dateRange) => {
  switch (dateRange) {
    case 'week':
      return 'Última semana'
    case 'month':
      return 'Último mes'
    case 'quarter':
      return 'Último trimestre'
    case 'year':
      return 'Último año'
    case 'all':
      return 'Todo el período'
    default:
      return dateRange
  }
}
