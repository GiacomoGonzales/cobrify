/**
 * Servicio de exportación a Excel para clientes.
 *
 * Genera un reporte completo de 3 hojas:
 *   1. Listado de clientes con TODOS los campos disponibles (mostrando solo
 *      las columnas que tienen al menos un dato en algún cliente).
 *   2. Compras por cliente (detalle de productos comprados, agregado).
 *   3. Estadísticas (top, distribución por tipo doc, métricas globales).
 *
 * Para incluir analytics (última compra, productos comprados, ticket promedio
 * real) se recibe el array de invoices opcional. Si no se pasa, esas columnas
 * quedan vacías.
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

const DOC_TYPE_LABELS = {
  DNI: 'DNI',
  RUC: 'RUC',
  CE: 'Carnet Extranjería',
  PASSPORT: 'Pasaporte',
  '1': 'DNI', '6': 'RUC', '4': 'CE', '7': 'Pasaporte',
}

/** Convierte cualquier valor de fecha (Timestamp/Date/string) a Date o null. */
const toDate = (val) => {
  if (!val) return null
  if (val.toDate) return val.toDate()
  if (val instanceof Date) return val
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Procesa todas las facturas y arma un mapa de analytics por documentNumber:
 * - productosUnicos (Set)
 * - cantidadItems (suma)
 * - ultimaCompra (max date)
 * - primeraCompra (min date)
 * - facturasCount
 * - totalReal (suma de inv.total)
 */
const buildCustomerAnalytics = (invoices) => {
  const map = new Map()
  for (const inv of invoices || []) {
    const docNum = inv.customer?.documentNumber || inv.clientDocumentNumber || ''
    if (!docNum) continue
    if (!map.has(docNum)) {
      map.set(docNum, {
        productos: new Set(),
        cantidadItems: 0,
        ultimaCompra: null,
        primeraCompra: null,
        facturasCount: 0,
        totalReal: 0,
      })
    }
    const entry = map.get(docNum)
    entry.facturasCount += 1
    entry.totalReal += (inv.total || 0)
    const itemsArr = inv.items || []
    entry.cantidadItems += itemsArr.length
    for (const item of itemsArr) {
      const name = item.name || item.description
      if (name) entry.productos.add(name)
    }
    const d = toDate(inv.createdAt) || toDate(inv.emissionDate)
    if (d) {
      if (!entry.ultimaCompra || d > entry.ultimaCompra) entry.ultimaCompra = d
      if (!entry.primeraCompra || d < entry.primeraCompra) entry.primeraCompra = d
    }
  }
  return map
}

/**
 * Detecta qué "grupos de campos especializados" están en uso (al menos un
 * cliente los tiene). Devuelve un set de flags para decidir qué columnas
 * extra incluir en el listado.
 */
const detectFieldGroups = (customers) => {
  const flags = {
    hasBusinessName: false,    // razón social distinta del nombre
    hasBirthDate: false,
    hasAddress: false,
    hasEmail: false,
    hasPhone: false,
    hasPriceLevel: false,
    hasSubscription: false,
    hasVehicle: false,
    hasPet: false,
    hasStudent: false,
    hasCreatedAt: false,
  }
  for (const c of customers) {
    if (c.businessName && c.businessName !== c.name) flags.hasBusinessName = true
    if (c.birthDate) flags.hasBirthDate = true
    if (c.address) flags.hasAddress = true
    if (c.email) flags.hasEmail = true
    if (c.phone) flags.hasPhone = true
    if (c.priceLevel) flags.hasPriceLevel = true
    if (c.subscriptionPlan || c.subscriptionPrice || c.subscriptionExpiry) flags.hasSubscription = true
    if (c.vehiclePlate) flags.hasVehicle = true
    if (c.petName || c.petSpecies || c.petBreed) flags.hasPet = true
    if (c.studentName || c.studentSchedule) flags.hasStudent = true
    if (c.createdAt) flags.hasCreatedAt = true
  }
  return flags
}

/** Genera el reporte de clientes con datos completos. */
export const generateCustomersExcel = async (customers, businessData, invoices = []) => {
  const wb = XLSX.utils.book_new()
  const analytics = buildCustomerAnalytics(invoices)
  const flags = detectFieldGroups(customers)

  // =========================================================================
  // HOJA 1: LISTADO DE CLIENTES
  // =========================================================================
  {
    // Definición dinámica de columnas — solo las que tienen datos en algún cliente.
    const cols = []
    const push = (header, width, getter, kind = 'text') => cols.push({ header, width, getter, kind })

    push('Tipo Doc', 10, c => DOC_TYPE_LABELS[c.documentType] || c.documentType || 'N/A', 'center')
    push('Número Doc', 16, c => c.documentNumber || 'N/A', 'center')
    push('Nombre', 32, c => c.name || c.businessName || 'N/A', 'text')
    if (flags.hasBusinessName) push('Razón Social', 32, c => c.businessName || '', 'text')
    if (flags.hasEmail) push('Email', 26, c => c.email || '', 'text')
    if (flags.hasPhone) push('Teléfono', 14, c => c.phone || '', 'center')
    if (flags.hasAddress) push('Dirección', 36, c => c.address || '', 'text')
    if (flags.hasBirthDate) push('Cumpleaños', 12, c => {
      if (!c.birthDate) return ''
      // birthDate viene como 'YYYY-MM-DD' string
      return String(c.birthDate).split('-').reverse().join('/')
    }, 'center')
    if (flags.hasPriceLevel) push('Nivel Precio', 12, c => c.priceLevel || '', 'center')
    if (flags.hasSubscription) {
      push('Plan Suscripción', 18, c => c.subscriptionPlan || '', 'text')
      push('Precio Suscripción', 16, c => c.subscriptionPrice ? Number(c.subscriptionPrice) : '', 'number')
      push('Vence Suscripción', 14, c => c.subscriptionExpiry || '', 'center')
    }
    if (flags.hasVehicle) push('Vehículo', 14, c => c.vehiclePlate || '', 'center')
    if (flags.hasStudent) {
      push('Alumno', 20, c => c.studentName || '', 'text')
      push('Horario', 18, c => c.studentSchedule || '', 'text')
    }
    if (flags.hasPet) {
      push('Mascota', 18, c => c.petName || '', 'text')
      push('Especie', 14, c => c.petSpecies || '', 'center')
      push('Raza', 16, c => c.petBreed || '', 'text')
    }
    // Analytics derivadas de invoices
    push('Pedidos', 10, c => {
      const a = analytics.get(c.documentNumber)
      return a ? a.facturasCount : (c.ordersCount || 0)
    }, 'int')
    push('Total Gastado', 16, c => {
      const a = analytics.get(c.documentNumber)
      return Number((a ? a.totalReal : (c.totalSpent || 0)).toFixed(2))
    }, 'number')
    push('Ticket Promedio', 16, c => {
      const a = analytics.get(c.documentNumber)
      const orders = a ? a.facturasCount : (c.ordersCount || 0)
      const spent = a ? a.totalReal : (c.totalSpent || 0)
      return orders > 0 ? Number((spent / orders).toFixed(2)) : 0
    }, 'number')
    push('Primera Compra', 14, c => {
      const a = analytics.get(c.documentNumber)
      return a?.primeraCompra ? formatDateLocale(a.primeraCompra) : ''
    }, 'center')
    push('Última Compra', 14, c => {
      const a = analytics.get(c.documentNumber)
      return a?.ultimaCompra ? formatDateLocale(a.ultimaCompra) : ''
    }, 'center')
    push('Productos Únicos', 14, c => {
      const a = analytics.get(c.documentNumber)
      return a ? a.productos.size : 0
    }, 'int')
    if (flags.hasCreatedAt) push('Registrado', 12, c => {
      const d = toDate(c.createdAt)
      return d ? formatDateLocale(d) : ''
    }, 'center')

    const headers = cols.map(c => c.header)
    const totalCols = headers.length

    // Construir aoa
    const aoa = [['LISTADO DE CLIENTES'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      totalLabel: 'Total clientes',
      totalItems: customers.length,
    }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length

    let totalOrders = 0, totalSpent = 0
    customers.forEach(c => {
      const row = cols.map(col => col.getter(c))
      aoa.push(row)
      // Para totales
      const a = analytics.get(c.documentNumber)
      totalOrders += a ? a.facturasCount : (c.ordersCount || 0)
      totalSpent += a ? a.totalReal : (c.totalSpent || 0)
    })

    // Fila de totales (en las columnas Pedidos y Total Gastado)
    const ordersColIdx = cols.findIndex(c => c.header === 'Pedidos')
    const spentColIdx = cols.findIndex(c => c.header === 'Total Gastado')
    aoa.push([])
    const totalRowIdx = aoa.length
    const totalRow = new Array(totalCols).fill('')
    if (ordersColIdx >= 0) totalRow[ordersColIdx] = totalOrders
    if (spentColIdx >= 0) totalRow[spentColIdx] = Number(totalSpent.toFixed(2))
    // Label "TOTALES" en la columna antes de Pedidos
    const labelColIdx = Math.max(0, ordersColIdx - 1)
    totalRow[labelColIdx] = 'TOTALES'
    aoa.push(totalRow)

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, cols.map(c => c.width))
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)

    // Filas de datos según kind de cada columna
    for (let i = 0; i < customers.length; i++) {
      const r = dataStart + i
      for (let c = 0; c < totalCols; c++) {
        const kind = cols[c].kind
        if (kind === 'number') setStyle(ws, r, c, numberStyle(i))
        else if (kind === 'int') setStyle(ws, r, c, intStyle(i))
        else if (kind === 'center') setStyle(ws, r, c, centerStyle(i))
        else setStyle(ws, r, c, cellStyle(i))
      }
    }
    // Fila de totales
    for (let c = 0; c < totalCols; c++) {
      if (c === ordersColIdx) setStyle(ws, totalRowIdx, c, { ...totalNumberStyle, numFmt: '#,##0' })
      else if (c === spentColIdx) setStyle(ws, totalRowIdx, c, totalNumberStyle)
      else setStyle(ws, totalRowIdx, c, totalLabelStyle)
    }
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
  }

  // =========================================================================
  // HOJA 2: COMPRAS POR CLIENTE (productos comprados, detalle agregado)
  // =========================================================================
  if (invoices && invoices.length > 0) {
    // Construir agregación: por (cliente, producto) → qty + total
    const purchases = new Map() // key: docNum|productName → { customerName, docNum, productName, qty, total, lastDate }
    for (const inv of invoices) {
      const docNum = inv.customer?.documentNumber || ''
      if (!docNum) continue
      const customerName = inv.customer?.name || inv.customer?.businessName || 'Cliente General'
      const invDate = toDate(inv.createdAt) || toDate(inv.emissionDate)
      for (const item of inv.items || []) {
        const productName = item.name || item.description
        if (!productName) continue
        const key = `${docNum}|${productName}`
        if (!purchases.has(key)) {
          purchases.set(key, {
            customerName,
            docNum,
            productName,
            qty: 0,
            total: 0,
            lastDate: null,
          })
        }
        const p = purchases.get(key)
        const qty = item.quantity || 1
        const itemTotal = qty * (item.unitPrice || item.price || 0)
        p.qty += qty
        p.total += itemTotal
        if (invDate && (!p.lastDate || invDate > p.lastDate)) p.lastDate = invDate
      }
    }

    if (purchases.size > 0) {
      // Ordenar por cliente luego por total descendente
      const rows = [...purchases.values()].sort((a, b) => {
        const cmp = a.customerName.localeCompare(b.customerName, 'es', { sensitivity: 'base' })
        if (cmp !== 0) return cmp
        return b.total - a.total
      })

      const headers = ['Cliente', 'Documento', 'Producto', 'Cantidad', 'Monto Total', 'Última Compra']
      const totalCols = headers.length

      const aoa = [['COMPRAS POR CLIENTE'], []]
      const metaStart = aoa.length
      aoa.push(...buildBusinessMetadataRows(businessData, {
        totalLabel: 'Total combinaciones cliente-producto',
        totalItems: rows.length,
      }))
      const metaEnd = aoa.length - 1
      aoa.push([])
      const headerRow = aoa.length
      aoa.push(headers)
      const dataStart = aoa.length

      let totalQty = 0, totalAmount = 0
      rows.forEach(p => {
        totalQty += p.qty
        totalAmount += p.total
        aoa.push([
          p.customerName,
          p.docNum,
          p.productName,
          Number(p.qty),
          Number(p.total.toFixed(2)),
          p.lastDate ? formatDateLocale(p.lastDate) : '',
        ])
      })
      aoa.push([])
      const totalRowIdx = aoa.length
      aoa.push(['', '', 'TOTALES', Number(totalQty), Number(totalAmount.toFixed(2)), ''])

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      applyColumnWidths(ws, [30, 16, 40, 12, 16, 16])
      applyTitleRow(ws, 0, totalCols)
      applyMetadataRows(ws, metaStart, metaEnd)
      applyHeaderRow(ws, headerRow, totalCols)
      for (let i = 0; i < rows.length; i++) {
        const r = dataStart + i
        setStyle(ws, r, 0, cellStyle(i))
        setStyle(ws, r, 1, centerStyle(i))
        setStyle(ws, r, 2, cellStyle(i))
        setStyle(ws, r, 3, numberStyle(i))
        setStyle(ws, r, 4, numberStyle(i))
        setStyle(ws, r, 5, centerStyle(i))
      }
      for (let c = 0; c <= 2; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
      setStyle(ws, totalRowIdx, 3, totalNumberStyle)
      setStyle(ws, totalRowIdx, 4, totalNumberStyle)
      setStyle(ws, totalRowIdx, 5, totalLabelStyle)
      applyFreezeBelow(ws, headerRow)
      XLSX.utils.book_append_sheet(wb, ws, 'Compras por Cliente')
    }
  }

  // =========================================================================
  // HOJA 3: ESTADÍSTICAS
  // =========================================================================
  {
    const totalCustomers = customers.length
    const totalOrders = customers.reduce((sum, c) => {
      const a = analytics.get(c.documentNumber)
      return sum + (a ? a.facturasCount : (c.ordersCount || 0))
    }, 0)
    const totalRevenue = customers.reduce((sum, c) => {
      const a = analytics.get(c.documentNumber)
      return sum + (a ? a.totalReal : (c.totalSpent || 0))
    }, 0)
    const avgSpent = totalCustomers > 0 ? totalRevenue / totalCustomers : 0
    const avgOrders = totalCustomers > 0 ? totalOrders / totalCustomers : 0
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0
    const withPurchases = [...analytics.keys()].length
    const noPurchases = Math.max(0, totalCustomers - withPurchases)

    // Distribución por tipo de documento
    const byDocType = customers.reduce((acc, c) => {
      const type = DOC_TYPE_LABELS[c.documentType] || c.documentType || 'Sin tipo'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {})

    // Top 10 clientes por monto gastado
    const ranked = [...customers]
      .map(c => {
        const a = analytics.get(c.documentNumber)
        return {
          name: c.name || c.businessName || 'N/A',
          documentNumber: c.documentNumber || '-',
          orders: a ? a.facturasCount : (c.ordersCount || 0),
          spent: a ? a.totalReal : (c.totalSpent || 0),
        }
      })
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10)

    const aoa = [['ESTADÍSTICAS DE CLIENTES'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, { totalLabel: 'Total clientes', totalItems: totalCustomers }))
    const metaEnd = aoa.length - 1

    // Sección: Globales
    aoa.push([])
    const sec1Sub = aoa.length
    aoa.push(['MÉTRICAS GLOBALES'])
    const sec1Header = aoa.length
    aoa.push(['Indicador', 'Valor'])
    const sec1DataStart = aoa.length
    aoa.push(['Total de clientes', totalCustomers])
    aoa.push(['Clientes con compras', withPurchases])
    aoa.push(['Clientes sin compras', noPurchases])
    aoa.push(['Total de pedidos', totalOrders])
    aoa.push(['Promedio de pedidos por cliente', Number(avgOrders.toFixed(2))])
    aoa.push(['Ingresos totales', Number(totalRevenue.toFixed(2))])
    aoa.push(['Gasto promedio por cliente', Number(avgSpent.toFixed(2))])
    aoa.push(['Ticket promedio', Number(avgTicket.toFixed(2))])
    const sec1DataEnd = aoa.length - 1

    // Sección: Distribución por tipo de doc
    aoa.push([])
    const sec2Sub = aoa.length
    aoa.push(['DISTRIBUCIÓN POR TIPO DE DOCUMENTO'])
    const sec2Header = aoa.length
    aoa.push(['Tipo', 'Cantidad', '% del Total'])
    const sec2DataStart = aoa.length
    Object.entries(byDocType).forEach(([type, count]) => {
      const pct = totalCustomers > 0 ? Number(((count / totalCustomers) * 100).toFixed(1)) : 0
      aoa.push([type, count, pct])
    })
    const sec2DataEnd = aoa.length - 1

    // Sección: Top 10 clientes
    aoa.push([])
    const sec3Sub = aoa.length
    aoa.push(['TOP 10 CLIENTES POR MONTO'])
    const sec3Header = aoa.length
    aoa.push(['#', 'Cliente', 'Documento', 'Pedidos', 'Total Gastado'])
    const sec3DataStart = aoa.length
    ranked.forEach((r, idx) => {
      aoa.push([idx + 1, r.name, r.documentNumber, r.orders, Number(r.spent.toFixed(2))])
    })
    const sec3DataEnd = aoa.length - 1

    const totalCols = 5
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [40, 30, 18, 14, 18])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)

    // Aplicar sección 1
    applySubtitleRow(ws, sec1Sub, totalCols)
    applyHeaderRow(ws, sec1Header, 2)
    for (let r = sec1DataStart; r <= sec1DataEnd; r++) {
      const i = r - sec1DataStart
      setStyle(ws, r, 0, cellStyle(i))
      setStyle(ws, r, 1, numberStyle(i))
    }
    // Sección 2
    applySubtitleRow(ws, sec2Sub, totalCols)
    applyHeaderRow(ws, sec2Header, 3)
    for (let r = sec2DataStart; r <= sec2DataEnd; r++) {
      const i = r - sec2DataStart
      setStyle(ws, r, 0, cellStyle(i))
      setStyle(ws, r, 1, intStyle(i))
      setStyle(ws, r, 2, numberStyle(i))
    }
    // Sección 3
    applySubtitleRow(ws, sec3Sub, totalCols)
    applyHeaderRow(ws, sec3Header, 5)
    for (let r = sec3DataStart; r <= sec3DataEnd; r++) {
      const i = r - sec3DataStart
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, cellStyle(i))
      setStyle(ws, r, 2, centerStyle(i))
      setStyle(ws, r, 3, intStyle(i))
      setStyle(ws, r, 4, numberStyle(i))
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas')
  }

  const fileName = buildExcelFileName('Clientes')
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Listado de clientes',
    subDirectory: 'Clientes',
  })
}
