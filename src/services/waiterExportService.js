/**
 * Export a Excel del desempeño de mozos (modo restaurante).
 *
 * 2 hojas:
 *   1. Desempeño por mozo (en el periodo): ventas, órdenes, ticket promedio, en curso.
 *   2. Órdenes del periodo (detalle por orden con su mozo).
 *
 * Recibe los mozos YA con sus métricas calculadas (perf) y las órdenes del periodo.
 */
import {
  XLSX,
  cellStyle, centerStyle, numberStyle, intStyle,
  totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
  formatDateTime,
} from './excelStyles'

const ORDER_STATE_LABEL = (o) => {
  if (o.overallStatus === 'cancelled' || o.status === 'cancelled') return 'Cancelada'
  if (o.paid === true || o.status === 'closed' || o.overallStatus === 'completed') return 'Cerrada'
  return 'En curso'
}

/**
 * @param {Array} waiters - mozos con campos: code, name, branchName, shift, status,
 *   perf: { sales, orders, ticket, inProgress }
 * @param {Array} orders - órdenes del periodo (con waiterName, total, createdAt, etc.)
 * @param {Object} businessData - doc del negocio (name, ruc…)
 * @param {string} periodLabel - etiqueta del periodo (ej. "Hoy", "Este mes")
 */
export const generateWaitersExcel = async (waiters, orders, businessData, periodLabel = '') => {
  const wb = XLSX.utils.book_new()
  const hasBranches = waiters.some(w => w.branchName)

  // ===== HOJA 1: DESEMPEÑO POR MOZO =====
  {
    const cols = []
    const push = (header, width, getter, kind = 'text') => cols.push({ header, width, getter, kind })
    push('#', 6, (_, i) => i + 1, 'center')
    push('Código', 12, w => w.code || '', 'center')
    push('Mozo', 28, w => w.name || '', 'text')
    if (hasBranches) push('Sede', 22, w => w.branchName || '', 'text')
    push('Turno', 14, w => w.shift || '', 'center')
    push('Estado', 12, w => (w.status === 'active' ? 'Activo' : 'Inactivo'), 'center')
    push('Ventas', 16, w => Number((w.perf?.sales || 0).toFixed(2)), 'number')
    push('Órdenes', 10, w => w.perf?.orders || 0, 'int')
    push('Ticket Prom.', 14, w => Number((w.perf?.ticket || 0).toFixed(2)), 'number')
    push('En curso', 10, w => w.perf?.inProgress || 0, 'int')

    const headers = cols.map(c => c.header)
    const totalCols = headers.length

    const aoa = [['DESEMPEÑO DE MOZOS'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      periodLabel,
      totalLabel: 'Total mozos',
      totalItems: waiters.length,
    }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length

    let totalSales = 0, totalOrders = 0
    waiters.forEach((w, i) => {
      aoa.push(cols.map(col => col.getter(w, i)))
      totalSales += w.perf?.sales || 0
      totalOrders += w.perf?.orders || 0
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    const salesIdx = cols.findIndex(c => c.header === 'Ventas')
    const ordersIdx = cols.findIndex(c => c.header === 'Órdenes')
    const totalRow = new Array(totalCols).fill('')
    totalRow[Math.max(0, salesIdx - 1)] = 'TOTALES'
    if (salesIdx >= 0) totalRow[salesIdx] = Number(totalSales.toFixed(2))
    if (ordersIdx >= 0) totalRow[ordersIdx] = totalOrders
    aoa.push(totalRow)

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, cols.map(c => c.width))
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < waiters.length; i++) {
      const r = dataStart + i
      for (let c = 0; c < totalCols; c++) {
        const kind = cols[c].kind
        if (kind === 'number') setStyle(ws, r, c, numberStyle(i))
        else if (kind === 'int') setStyle(ws, r, c, intStyle(i))
        else if (kind === 'center') setStyle(ws, r, c, centerStyle(i))
        else setStyle(ws, r, c, cellStyle(i))
      }
    }
    for (let c = 0; c < totalCols; c++) {
      if (c === salesIdx) setStyle(ws, totalRowIdx, c, totalNumberStyle)
      else if (c === ordersIdx) setStyle(ws, totalRowIdx, c, { ...totalNumberStyle, numFmt: '#,##0' })
      else setStyle(ws, totalRowIdx, c, totalLabelStyle)
    }
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Desempeño')
  }

  // ===== HOJA 2: ÓRDENES DEL PERIODO =====
  if (orders && orders.length > 0) {
    const headers = ['N° Orden', 'Fecha/Hora', 'Mozo', 'Mesa', 'Estado', 'Total']
    const totalCols = headers.length
    const aoa = [['ÓRDENES DEL PERIODO'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      periodLabel,
      totalLabel: 'Total órdenes',
      totalItems: orders.length,
    }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length

    let totalAmount = 0
    const sorted = [...orders].sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt)
      const dbb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt)
      return dbb - da
    })
    sorted.forEach(o => {
      const state = ORDER_STATE_LABEL(o)
      if (state === 'Cerrada') totalAmount += (o.total || 0)
      aoa.push([
        o.orderNumber || o.id?.slice(0, 6) || '',
        formatDateTime(o.createdAt),
        o.waiterName || 'Sin asignar',
        o.tableNumber || '-',
        state,
        Number((o.total || 0).toFixed(2)),
      ])
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push(['', '', '', '', 'TOTAL CERRADAS', Number(totalAmount.toFixed(2))])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [12, 18, 26, 10, 12, 14])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < sorted.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, centerStyle(i))
      setStyle(ws, r, 2, cellStyle(i))
      setStyle(ws, r, 3, centerStyle(i))
      setStyle(ws, r, 4, centerStyle(i))
      setStyle(ws, r, 5, numberStyle(i))
    }
    for (let c = 0; c <= 4; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
    setStyle(ws, totalRowIdx, 5, totalNumberStyle)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Órdenes')
  }

  const fileName = buildExcelFileName('Mozos', [periodLabel])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Desempeño de mozos',
    subDirectory: 'Mozos',
  })
}
