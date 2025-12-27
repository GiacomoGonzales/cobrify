import * as XLSX from 'xlsx'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Servicio para exportar reportes a Excel
 */

/**
 * Helper para exportar Excel que funciona en iOS/Android
 */
const saveAndShareExcel = async (workbook, fileName) => {
  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })

      const excelDir = 'Reportes'
      try {
        await Filesystem.mkdir({
          path: excelDir,
          directory: Directory.Documents,
          recursive: true
        })
      } catch (mkdirError) {
        // Directorio ya existe
      }

      const result = await Filesystem.writeFile({
        path: `${excelDir}/${fileName}`,
        data: excelBuffer,
        directory: Directory.Documents,
        recursive: true
      })

      console.log('Excel guardado en:', result.uri)

      await Share.share({
        title: fileName,
        text: `Reporte: ${fileName}`,
        url: result.uri,
        dialogTitle: 'Compartir Reporte'
      })

      return { success: true, uri: result.uri }
    } catch (error) {
      console.error('Error al exportar Excel en móvil:', error)
      throw error
    }
  } else {
    XLSX.writeFile(workbook, fileName)
    return { success: true }
  }
}

/**
 * Exportar reporte general a Excel
 */
export const exportGeneralReport = async (data) => {
  const { stats, salesByMonth, topProducts, topCustomers, filteredInvoices, dateRange, paymentMethodStats, customStartDate, customEndDate } = data

  // Crear un nuevo workbook
  const wb = XLSX.utils.book_new()

  // Hoja 1: Resumen General
  const summaryData = [
    ['REPORTE GENERAL DE VENTAS'],
    ['Período:', getRangeLabel(dateRange, customStartDate, customEndDate)],
    ['Fecha de generación:', new Date().toLocaleString('es-PE')],
    [],
    ['KPIs PRINCIPALES'],
    ['Indicador', 'Valor'],
    ['Ingresos Totales', formatCurrency(stats.totalRevenue)],
    ['Costo Total', formatCurrency(stats.totalCost || 0)],
    ['Utilidad Total', formatCurrency(stats.totalProfit || 0)],
    ['Margen de Utilidad', `${(stats.profitMargin || 0).toFixed(2)}%`],
    [],
    ['DESGLOSE DE INGRESOS'],
    ['Ingresos Pagados', formatCurrency(stats.paidRevenue)],
    ['Ingresos Pendientes', formatCurrency(stats.pendingRevenue)],
    [],
    ['DOCUMENTOS'],
    ['Total Comprobantes', stats.totalInvoices],
    ['Facturas', stats.facturas],
    ['Boletas', stats.boletas],
    ['Ticket Promedio', formatCurrency(stats.avgTicket)],
    ['Crecimiento vs Período Anterior', `${stats.revenueGrowth.toFixed(2)}%`],
  ]

  // Agregar resumen de métodos de pago si está disponible
  if (paymentMethodStats && paymentMethodStats.length > 0) {
    summaryData.push([])
    summaryData.push(['MÉTODOS DE PAGO'])
    summaryData.push(['Método', 'Monto Total', 'Transacciones'])
    paymentMethodStats.forEach(method => {
      summaryData.push([
        method.method,
        formatCurrency(method.total),
        method.count
      ])
    })
  }

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)

  // Ajustar ancho de columnas
  ws1['!cols'] = [
    { wch: 30 },
    { wch: 20 },
    { wch: 15 }
  ]

  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // Hoja 2: Ventas por Mes
  const salesHeader = [['Mes', 'Cantidad de Ventas', 'Ingresos']]
  const salesData = salesByMonth.map(item => [
    item.month,
    item.count,
    Number((item.revenue || 0).toFixed(2))
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
      Number((product.quantity || 0).toFixed(2)),
      Number((product.revenue || 0).toFixed(2))
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
      Number((customer.totalSpent || 0).toFixed(2))
    ])

    const ws4 = XLSX.utils.aoa_to_sheet([...customersHeader, ...customersData])
    ws4['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws4, 'Top Clientes')
  }

  // Hoja 5: Detalle de Ventas
  if (filteredInvoices && filteredInvoices.length > 0) {
    const invoicesHeader = [['Número', 'Fecha', 'Tipo', 'Cliente', 'Documento', 'Estado', 'Método Pago', 'Precio Venta', 'Costo', 'Utilidad', 'Margen %', 'Subtotal', 'IGV']]
    const invoicesData = filteredInvoices.slice(0, 1000).map(invoice => {
      // Obtener método(s) de pago
      let paymentMethods = 'Efectivo'
      if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
        if (invoice.payments.length === 1) {
          paymentMethods = invoice.payments[0].method || 'Efectivo'
        } else {
          paymentMethods = invoice.payments.map(p => `${p.method || 'Efectivo'} (${formatCurrency(p.amount || 0)})`).join(', ')
        }
      } else if (invoice.paymentMethod) {
        paymentMethods = invoice.paymentMethod
      }

      return [
        invoice.number,
        invoice.createdAt ? formatDate(invoice.createdAt.toDate ? invoice.createdAt.toDate() : invoice.createdAt) : '-',
        invoice.documentType === 'factura' ? 'Factura' : 'Boleta',
        invoice.customer?.name || 'Cliente General',
        invoice.customer?.documentNumber || '-',
        invoice.status === 'paid' ? 'Pagada' : 'Pendiente',
        paymentMethods,
        Number((invoice.total || 0).toFixed(2)),
        Number((invoice.totalCost || 0).toFixed(2)),
        Number((invoice.profit || 0).toFixed(2)),
        Number((invoice.profitMargin || 0).toFixed(2)),
        Number((invoice.subtotal || 0).toFixed(2)),
        Number((invoice.igv || 0).toFixed(2))
      ]
    })

    const ws5 = XLSX.utils.aoa_to_sheet([...invoicesHeader, ...invoicesData])
    ws5['!cols'] = [
      { wch: 15 },  // Número
      { wch: 12 },  // Fecha
      { wch: 10 },  // Tipo
      { wch: 30 },  // Cliente
      { wch: 15 },  // Documento
      { wch: 12 },  // Estado
      { wch: 25 },  // Método Pago
      { wch: 15 },  // Precio Venta
      { wch: 15 },  // Costo
      { wch: 15 },  // Utilidad
      { wch: 12 },  // Margen %
      { wch: 15 },  // Subtotal
      { wch: 15 }   // IGV
    ]
    XLSX.utils.book_append_sheet(wb, ws5, 'Detalle de Ventas')
  }

  // Generar archivo con nombre atractivo
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`
  const rangeLabel = getRangeLabel(dateRange, customStartDate, customEndDate).replace(/\s+/g, '_')
  const fileName = `Reporte_General_${rangeLabel}_${dateStr}.xlsx`
  await saveAndShareExcel(wb, fileName)
}

/**
 * Exportar reporte de ventas a Excel
 */
export const exportSalesReport = async (data) => {
  const { stats, salesByMonth, filteredInvoices, dateRange, paymentMethodStats, customStartDate, customEndDate } = data

  const wb = XLSX.utils.book_new()

  // Hoja 1: Resumen de Ventas
  const summaryData = [
    ['REPORTE DE VENTAS'],
    ['Período:', getRangeLabel(dateRange, customStartDate, customEndDate)],
    ['Fecha de generación:', new Date().toLocaleString('es-PE')],
    [],
    ['RESUMEN FINANCIERO'],
    ['Concepto', 'Valor'],
    ['Total Ventas', formatCurrency(stats.totalRevenue)],
    ['Costo Total', formatCurrency(stats.totalCost || 0)],
    ['Utilidad Total', formatCurrency(stats.totalProfit || 0)],
    ['Margen de Utilidad', `${(stats.profitMargin || 0).toFixed(2)}%`],
    [],
    ['ESTADO DE COBRO'],
    ['Ventas Pagadas', formatCurrency(stats.paidRevenue)],
    ['Ventas Pendientes', formatCurrency(stats.pendingRevenue)],
    [],
    ['OTROS INDICADORES'],
    ['Total Comprobantes', stats.totalInvoices],
    ['Crecimiento', `${stats.revenueGrowth.toFixed(2)}%`],
  ]

  // Agregar resumen de métodos de pago si está disponible
  if (paymentMethodStats && paymentMethodStats.length > 0) {
    summaryData.push([])
    summaryData.push(['MÉTODOS DE PAGO'])
    summaryData.push(['Método', 'Monto Total', 'Transacciones', '% del Total'])
    const totalAmount = paymentMethodStats.reduce((sum, m) => sum + (m.total || 0), 0)
    paymentMethodStats.forEach(method => {
      const percentage = totalAmount > 0 ? ((method.total / totalAmount) * 100).toFixed(1) : 0
      summaryData.push([
        method.method,
        formatCurrency(method.total),
        method.count,
        `${percentage}%`
      ])
    })
  }

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // Hoja 2: Ventas Mensuales
  const salesHeader = [['Mes', 'Cantidad', 'Ingresos']]
  const salesData = salesByMonth.map(item => [
    item.month,
    item.count,
    Number((item.revenue || 0).toFixed(2))
  ])

  const ws2 = XLSX.utils.aoa_to_sheet([...salesHeader, ...salesData])
  ws2['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Ventas Mensuales')

  // Hoja 3: Detalle Completo
  const detailHeader = [['Número', 'Fecha', 'Tipo', 'Cliente', 'Doc Cliente', 'Estado', 'Método Pago', 'Precio Venta', 'Costo', 'Utilidad', 'Margen %', 'Subtotal', 'IGV', 'Notas']]
  const detailData = filteredInvoices.map(invoice => {
    // Obtener método(s) de pago
    let paymentMethods = 'Efectivo'
    if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
      if (invoice.payments.length === 1) {
        paymentMethods = invoice.payments[0].method || 'Efectivo'
      } else {
        paymentMethods = invoice.payments.map(p => `${p.method || 'Efectivo'} (${formatCurrency(p.amount || 0)})`).join(', ')
      }
    } else if (invoice.paymentMethod) {
      paymentMethods = invoice.paymentMethod
    }

    return [
      invoice.number,
      invoice.createdAt ? formatDate(invoice.createdAt.toDate ? invoice.createdAt.toDate() : invoice.createdAt) : '-',
      invoice.documentType === 'factura' ? 'Factura' : 'Boleta',
      invoice.customer?.name || 'Cliente General',
      `${invoice.customer?.documentType || ''} ${invoice.customer?.documentNumber || ''}`,
      invoice.status === 'paid' ? 'Pagada' : 'Pendiente',
      paymentMethods,
      Number((invoice.total || 0).toFixed(2)),
      Number((invoice.totalCost || 0).toFixed(2)),
      Number((invoice.profit || 0).toFixed(2)),
      Number((invoice.profitMargin || 0).toFixed(2)),
      Number((invoice.subtotal || 0).toFixed(2)),
      Number((invoice.igv || 0).toFixed(2)),
      invoice.notes || ''
    ]
  })

  const ws3 = XLSX.utils.aoa_to_sheet([...detailHeader, ...detailData])
  ws3['!cols'] = [
    { wch: 15 },  // Número
    { wch: 12 },  // Fecha
    { wch: 10 },  // Tipo
    { wch: 30 },  // Cliente
    { wch: 18 },  // Doc Cliente
    { wch: 12 },  // Estado
    { wch: 25 },  // Método Pago (ampliado para múltiples métodos)
    { wch: 15 },  // Precio Venta
    { wch: 15 },  // Costo
    { wch: 15 },  // Utilidad
    { wch: 12 },  // Margen %
    { wch: 15 },  // Subtotal
    { wch: 15 },  // IGV
    { wch: 30 }   // Notas
  ]
  XLSX.utils.book_append_sheet(wb, ws3, 'Detalle Completo')

  // Generar archivo con nombre atractivo
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`
  const rangeLabel = getRangeLabel(dateRange, customStartDate, customEndDate).replace(/\s+/g, '_')
  const fileName = `Reporte_Ventas_${rangeLabel}_${dateStr}.xlsx`
  await saveAndShareExcel(wb, fileName)
}

/**
 * Exportar reporte de productos a Excel
 */
export const exportProductsReport = async (data) => {
  const { topProducts, salesByCategory, dateRange, customStartDate, customEndDate } = data

  const wb = XLSX.utils.book_new()
  const periodo = getRangeLabel(dateRange, customStartDate, customEndDate)

  // ========== HOJA 1: RESUMEN EJECUTIVO ==========
  const totalProductos = topProducts.length
  const totalCategorias = salesByCategory?.length || 0
  const totalUnidades = topProducts.reduce((sum, p) => sum + (p.quantity || 0), 0)
  const totalIngresos = topProducts.reduce((sum, p) => sum + (p.revenue || 0), 0)
  const totalCostos = topProducts.reduce((sum, p) => sum + (p.cost || 0), 0)
  const totalUtilidad = totalIngresos - totalCostos
  const margenPromedio = totalIngresos > 0 ? (totalUtilidad / totalIngresos) * 100 : 0

  const resumenData = [
    ['REPORTE DE PRODUCTOS Y CATEGORÍAS'],
    [],
    ['Período:', periodo],
    ['Fecha de generación:', new Date().toLocaleString('es-PE')],
    [],
    ['═══════════════════════════════════════════════════════'],
    ['RESUMEN EJECUTIVO'],
    ['═══════════════════════════════════════════════════════'],
    [],
    ['INDICADOR', 'VALOR'],
    ['Total de productos vendidos', totalProductos],
    ['Total de categorías', totalCategorias],
    ['Unidades vendidas', Number(totalUnidades.toFixed(0))],
    ['Ingresos totales', `S/ ${totalIngresos.toFixed(2)}`],
    ['Costos totales', `S/ ${totalCostos.toFixed(2)}`],
    ['Utilidad bruta', `S/ ${totalUtilidad.toFixed(2)}`],
    ['Margen promedio', `${margenPromedio.toFixed(1)}%`],
    [],
    ['═══════════════════════════════════════════════════════'],
    ['TOP 5 PRODUCTOS'],
    ['═══════════════════════════════════════════════════════'],
  ]

  topProducts.slice(0, 5).forEach((product, index) => {
    resumenData.push([`${index + 1}. ${product.name}`, `S/ ${(product.revenue || 0).toFixed(2)}`])
  })

  resumenData.push([])
  resumenData.push(['═══════════════════════════════════════════════════════'])
  resumenData.push(['TOP 5 CATEGORÍAS'])
  resumenData.push(['═══════════════════════════════════════════════════════'])

  if (salesByCategory && salesByCategory.length > 0) {
    salesByCategory.slice(0, 5).forEach((cat, index) => {
      resumenData.push([`${index + 1}. ${cat.name}`, `S/ ${(cat.revenue || 0).toFixed(2)}`])
    })
  }

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
  wsResumen['!cols'] = [{ wch: 45 }, { wch: 25 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

  // ========== HOJA 2: DETALLE DE PRODUCTOS ==========
  const productsData = [
    ['DETALLE DE PRODUCTOS VENDIDOS'],
    ['Período:', periodo],
    [],
    ['#', 'Producto', 'Unidades', 'Ingresos (S/)', 'Costo (S/)', 'Utilidad (S/)', 'Margen %', 'Precio Prom.'],
  ]

  topProducts.forEach((product, index) => {
    const margen = product.revenue > 0 ? ((product.profit || 0) / product.revenue) * 100 : 0
    const precioPromedio = product.quantity > 0 ? product.revenue / product.quantity : 0
    productsData.push([
      index + 1,
      product.name,
      Number((product.quantity || 0).toFixed(0)),
      Number((product.revenue || 0).toFixed(2)),
      Number((product.cost || 0).toFixed(2)),
      Number((product.profit || 0).toFixed(2)),
      Number(margen.toFixed(1)),
      Number(precioPromedio.toFixed(2))
    ])
  })

  productsData.push([])
  productsData.push([
    'TOTALES',
    '',
    Number(totalUnidades.toFixed(0)),
    Number(totalIngresos.toFixed(2)),
    Number(totalCostos.toFixed(2)),
    Number(totalUtilidad.toFixed(2)),
    Number(margenPromedio.toFixed(1)),
    ''
  ])

  const wsProducts = XLSX.utils.aoa_to_sheet(productsData)
  wsProducts['!cols'] = [
    { wch: 6 },
    { wch: 40 },
    { wch: 12 },
    { wch: 15 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 }
  ]
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Productos')

  // ========== HOJA 3: DETALLE DE CATEGORÍAS ==========
  if (salesByCategory && salesByCategory.length > 0) {
    const totalCatIngresos = salesByCategory.reduce((sum, c) => sum + (c.revenue || 0), 0)
    const totalCatCostos = salesByCategory.reduce((sum, c) => sum + (c.cost || 0), 0)
    const totalCatUtilidad = totalCatIngresos - totalCatCostos
    const totalCatUnidades = salesByCategory.reduce((sum, c) => sum + (c.quantity || 0), 0)

    const categoriesData = [
      ['VENTAS POR CATEGORÍA'],
      ['Período:', periodo],
      [],
      ['#', 'Categoría', 'Ventas', 'Unidades', 'Ingresos (S/)', 'Costo (S/)', 'Utilidad (S/)', 'Margen %', '% del Total'],
    ]

    salesByCategory.forEach((cat, index) => {
      const margen = cat.revenue > 0 ? ((cat.profit || 0) / cat.revenue) * 100 : 0
      const porcentaje = totalCatIngresos > 0 ? (cat.revenue / totalCatIngresos) * 100 : 0
      categoriesData.push([
        index + 1,
        cat.name,
        cat.itemCount || 0,
        Number((cat.quantity || 0).toFixed(0)),
        Number((cat.revenue || 0).toFixed(2)),
        Number((cat.cost || 0).toFixed(2)),
        Number((cat.profit || 0).toFixed(2)),
        Number(margen.toFixed(1)),
        Number(porcentaje.toFixed(1))
      ])
    })

    const margenTotalCat = totalCatIngresos > 0 ? (totalCatUtilidad / totalCatIngresos) * 100 : 0
    categoriesData.push([])
    categoriesData.push([
      'TOTALES',
      '',
      salesByCategory.reduce((sum, c) => sum + (c.itemCount || 0), 0),
      Number(totalCatUnidades.toFixed(0)),
      Number(totalCatIngresos.toFixed(2)),
      Number(totalCatCostos.toFixed(2)),
      Number(totalCatUtilidad.toFixed(2)),
      Number(margenTotalCat.toFixed(1)),
      '100.0'
    ])

    const wsCategories = XLSX.utils.aoa_to_sheet(categoriesData)
    wsCategories['!cols'] = [
      { wch: 6 },
      { wch: 25 },
      { wch: 10 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 14 },
      { wch: 10 },
      { wch: 12 }
    ]
    XLSX.utils.book_append_sheet(wb, wsCategories, 'Categorías')
  }

  // Generar archivo con nombre atractivo
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`
  const rangeLabel = periodo.replace(/\s+/g, '_')
  const fileName = `Reporte_Productos_Categorias_${rangeLabel}_${dateStr}.xlsx`
  await saveAndShareExcel(wb, fileName)
}

/**
 * Exportar reporte de clientes a Excel
 */
export const exportCustomersReport = async (data) => {
  const { topCustomers, dateRange, customStartDate, customEndDate } = data

  const wb = XLSX.utils.book_new()

  // Hoja: Clientes
  const customersData = [
    ['REPORTE DE CLIENTES TOP'],
    ['Período:', getRangeLabel(dateRange, customStartDate, customEndDate)],
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
      Number((customer.totalSpent || 0).toFixed(2)),
      customer.ordersCount > 0 ? Number(((customer.totalSpent || 0) / customer.ordersCount).toFixed(2)) : 0
    ])
  })

  // Agregar totales
  const totalOrders = topCustomers.reduce((sum, c) => sum + (c.ordersCount || 0), 0)
  const totalSpent = topCustomers.reduce((sum, c) => sum + (c.totalSpent || 0), 0)

  customersData.push([])
  customersData.push(['TOTALES', '', '', '', '', '', totalOrders, Number(totalSpent.toFixed(2)), totalOrders > 0 ? Number((totalSpent / totalOrders).toFixed(2)) : 0])

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

  // Generar archivo con nombre atractivo
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`
  const rangeLabel = getRangeLabel(dateRange, customStartDate, customEndDate).replace(/\s+/g, '_')
  const fileName = `Reporte_Clientes_${rangeLabel}_${dateStr}.xlsx`
  await saveAndShareExcel(wb, fileName)
}

/**
 * Helper para obtener etiqueta del rango de fecha
 */
const getRangeLabel = (dateRange, customStartDate, customEndDate) => {
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
    case 'custom':
      if (customStartDate && customEndDate) {
        return `${customStartDate}_al_${customEndDate}`
      }
      return 'Personalizado'
    default:
      return dateRange
  }
}
