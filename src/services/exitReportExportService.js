/**
 * Excel del reporte de consumo por obra (modo logística).
 *
 * Hojas:
 *   1) Resumen por Obra   — cuánto se consumió en cada una
 *   2) Detalle por Obra   — qué producto salió a cada obra y por cuánto
 *   3) Salidas            — el listado de salidas del período
 *
 * La valorización NO se calcula acá: viene de `@/utils/exitCosting`, el mismo
 * módulo que usa el reporte en pantalla. Dos cálculos separados terminarían
 * dando cifras distintas para lo mismo.
 */
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { groupExitsByProject, buildProductIndex, getExitTotalCost } from '@/utils/exitCosting'
import {
  XLSX,
  cellStyle, centerStyle, numberStyle,
  totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applySubtitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
} from './excelStyles'

const fmtDate = (value) => {
  if (!value) return '-'
  const d = value.toDate ? value.toDate() : new Date(value)
  return isNaN(d.getTime()) ? '-' : format(d, 'dd/MM/yyyy', { locale: es })
}

const fmtDateTime = (value) => {
  if (!value) return '-'
  const d = value.toDate ? value.toDate() : new Date(value)
  return isNaN(d.getTime()) ? '-' : format(d, 'dd/MM/yyyy HH:mm', { locale: es })
}

/**
 * @param {Array}  exits    - salidas ya filtradas por el período elegido
 * @param {Array}  products - catálogo, para valorizar salidas viejas sin costo
 * @param {Object} businessData
 * @param {Object} options   - { periodLabel, warehouseLabel }
 */
export const generateExitReportExcel = async (exits, products, businessData = {}, options = {}) => {
  const { periodLabel = 'Todas las fechas', warehouseLabel = 'Todos' } = options
  const { groups, totals } = groupExitsByProject(exits, products)
  const workbook = XLSX.utils.book_new()

  const metaExtra = []
  if (totals.estimatedLines > 0) {
    metaExtra.push([
      'Nota:',
      `${totals.estimatedLines} línea(s) se valorizaron con el costo actual del producto porque la salida es anterior al registro de costos.`,
    ])
  }

  // ============== HOJA 1: RESUMEN POR OBRA ==============
  const headers1 = ['Obra / Destino', 'Código', 'Salidas', 'Unidades', 'Valor Consumido (S/)', '% del Total', 'Primera Salida', 'Última Salida']
  const totalCols1 = headers1.length

  const aoa1 = []
  aoa1.push(['CONSUMO POR OBRA'])
  aoa1.push([])
  const metaStart = aoa1.length
  aoa1.push(...buildBusinessMetadataRows(businessData, {
    periodLabel,
    warehouseLabel,
    totalItems: totals.exitCount,
    totalLabel: 'Total de salidas',
    extra: metaExtra,
  }))
  const metaEnd = aoa1.length - 1
  aoa1.push([])
  const subtitleRow = aoa1.length
  aoa1.push(['RESUMEN POR OBRA'])
  aoa1.push([])
  const header1Row = aoa1.length
  aoa1.push(headers1)
  const dataStart1 = aoa1.length

  groups.forEach(g => {
    const pct = totals.total > 0 ? (g.total / totals.total) * 100 : 0
    aoa1.push([
      g.name,
      g.code || '-',
      g.exitCount,
      Number(g.unitCount.toFixed(2)),
      Number(g.total.toFixed(2)),
      Number(pct.toFixed(1)),
      g.firstDate ? format(g.firstDate, 'dd/MM/yyyy', { locale: es }) : '-',
      g.lastDate ? format(g.lastDate, 'dd/MM/yyyy', { locale: es }) : '-',
    ])
  })

  aoa1.push([])
  const totalRow1 = aoa1.length
  aoa1.push([
    'TOTALES', '',
    totals.exitCount,
    Number(totals.unitCount.toFixed(2)),
    Number(totals.total.toFixed(2)),
    100, '', '',
  ])

  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  applyColumnWidths(ws1, [40, 14, 11, 13, 22, 13, 16, 16])
  applyTitleRow(ws1, 0, totalCols1)
  applyMetadataRows(ws1, metaStart, metaEnd)
  applySubtitleRow(ws1, subtitleRow, totalCols1)
  applyHeaderRow(ws1, header1Row, totalCols1)
  for (let i = 0; i < groups.length; i++) {
    const r = dataStart1 + i
    setStyle(ws1, r, 0, cellStyle(i))
    setStyle(ws1, r, 1, centerStyle(i))
    for (let c = 2; c <= 5; c++) setStyle(ws1, r, c, numberStyle(i))
    setStyle(ws1, r, 6, centerStyle(i))
    setStyle(ws1, r, 7, centerStyle(i))
  }
  setStyle(ws1, totalRow1, 0, totalLabelStyle)
  setStyle(ws1, totalRow1, 1, totalLabelStyle)
  for (let c = 2; c <= 5; c++) setStyle(ws1, totalRow1, c, totalNumberStyle)
  setStyle(ws1, totalRow1, 6, totalLabelStyle)
  setStyle(ws1, totalRow1, 7, totalLabelStyle)
  applyFreezeBelow(ws1, header1Row)
  XLSX.utils.book_append_sheet(workbook, ws1, 'Resumen por Obra')

  // ============== HOJA 2: DETALLE POR OBRA ==============
  const headers2 = ['Obra / Destino', 'Código Obra', 'Producto', 'Código', 'Variante', 'Unidad', 'Cantidad', 'Costo Unitario (S/)', 'Valor (S/)', 'Costo Estimado']
  const totalCols2 = headers2.length

  const aoa2 = []
  aoa2.push(['DETALLE DE CONSUMO POR OBRA'])
  aoa2.push([])
  const meta2Start = aoa2.length
  aoa2.push(...buildBusinessMetadataRows(businessData, { periodLabel, warehouseLabel, extra: metaExtra }))
  const meta2End = aoa2.length - 1
  aoa2.push([])
  const header2Row = aoa2.length
  aoa2.push(headers2)
  const dataStart2 = aoa2.length

  let rowCount2 = 0
  let totalDetalle = 0
  groups.forEach(g => {
    g.products.forEach(p => {
      totalDetalle += p.total
      rowCount2++
      aoa2.push([
        g.name,
        g.code || '-',
        p.name,
        p.code || '-',
        p.variantLabel || '-',
        p.unit,
        Number(p.quantity.toFixed(3)),
        Number((p.unitCost || 0).toFixed(4)),
        Number(p.total.toFixed(2)),
        p.estimated ? 'Sí' : '',
      ])
    })
  })

  aoa2.push([])
  const totalRow2 = aoa2.length
  aoa2.push(['', '', '', '', '', '', '', 'TOTAL (S/):', Number(totalDetalle.toFixed(2)), ''])

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  applyColumnWidths(ws2, [36, 14, 36, 16, 20, 10, 12, 18, 14, 15])
  applyTitleRow(ws2, 0, totalCols2)
  applyMetadataRows(ws2, meta2Start, meta2End)
  applyHeaderRow(ws2, header2Row, totalCols2)
  for (let i = 0; i < rowCount2; i++) {
    const r = dataStart2 + i
    setStyle(ws2, r, 0, cellStyle(i))
    setStyle(ws2, r, 1, centerStyle(i))
    setStyle(ws2, r, 2, cellStyle(i))
    setStyle(ws2, r, 3, centerStyle(i))
    setStyle(ws2, r, 4, cellStyle(i))
    setStyle(ws2, r, 5, centerStyle(i))
    for (let c = 6; c <= 8; c++) setStyle(ws2, r, c, numberStyle(i))
    setStyle(ws2, r, 9, centerStyle(i))
  }
  setStyle(ws2, totalRow2, 7, totalLabelStyle)
  setStyle(ws2, totalRow2, 8, totalNumberStyle)
  applyFreezeBelow(ws2, header2Row)
  XLSX.utils.book_append_sheet(workbook, ws2, 'Detalle por Obra')

  // ============== HOJA 3: SALIDAS ==============
  const headers3 = ['Nro. Salida', 'Fecha', 'Tipo', 'Obra / Motivo', 'Código Obra', 'Almacén', 'Productos', 'Unidades', 'Valor (S/)', 'Registrado por', 'Notas']
  const totalCols3 = headers3.length
  const productsById = buildProductIndex(products)

  const aoa3 = []
  aoa3.push(['SALIDAS DE ALMACÉN'])
  aoa3.push([])
  const meta3Start = aoa3.length
  aoa3.push(...buildBusinessMetadataRows(businessData, { periodLabel, warehouseLabel, totalItems: exits.length, totalLabel: 'Total de salidas' }))
  const meta3End = aoa3.length - 1
  aoa3.push([])
  const header3Row = aoa3.length
  aoa3.push(headers3)
  const dataStart3 = aoa3.length

  // Orden cronológico: el listado se lee como un histórico del período.
  const sorted = [...exits].sort((a, b) => {
    const dA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
    const dB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
    return dA - dB
  })

  let totalSalidas = 0
  sorted.forEach(exit => {
    const items = Array.isArray(exit.items) ? exit.items : []
    const { total } = getExitTotalCost(exit, productsById)
    totalSalidas += total
    const unidades = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
    const esObra = exit.exitType !== 'simple' && exit.projectId

    aoa3.push([
      exit.number || '-',
      fmtDateTime(exit.createdAt),
      esObra ? 'A obra' : 'Simple',
      esObra ? (exit.projectName || 'Obra sin nombre') : (exit.reasonLabel || 'Uso interno'),
      esObra ? (exit.projectCode || '-') : '-',
      exit.warehouseName || '-',
      items.length,
      Number(unidades.toFixed(2)),
      Number(total.toFixed(2)),
      exit.userName || '-',
      exit.notes || '',
    ])
  })

  aoa3.push([])
  const totalRow3 = aoa3.length
  aoa3.push(['', '', '', '', '', '', '', 'TOTAL (S/):', Number(totalSalidas.toFixed(2)), '', ''])

  const ws3 = XLSX.utils.aoa_to_sheet(aoa3)
  applyColumnWidths(ws3, [14, 17, 11, 36, 14, 26, 12, 12, 14, 26, 34])
  applyTitleRow(ws3, 0, totalCols3)
  applyMetadataRows(ws3, meta3Start, meta3End)
  applyHeaderRow(ws3, header3Row, totalCols3)
  for (let i = 0; i < sorted.length; i++) {
    const r = dataStart3 + i
    for (let c = 0; c <= 2; c++) setStyle(ws3, r, c, centerStyle(i))
    setStyle(ws3, r, 3, cellStyle(i))
    setStyle(ws3, r, 4, centerStyle(i))
    setStyle(ws3, r, 5, cellStyle(i))
    for (let c = 6; c <= 8; c++) setStyle(ws3, r, c, numberStyle(i))
    setStyle(ws3, r, 9, cellStyle(i))
    setStyle(ws3, r, 10, cellStyle(i))
  }
  setStyle(ws3, totalRow3, 7, totalLabelStyle)
  setStyle(ws3, totalRow3, 8, totalNumberStyle)
  applyFreezeBelow(ws3, header3Row)
  XLSX.utils.book_append_sheet(workbook, ws3, 'Salidas')

  const fileName = buildExcelFileName('Consumo-por-Obra', [])
  await saveAndShareExcel(workbook, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de consumo por obra: ${fileName}`,
    subDirectory: 'Reportes',
  })
}
