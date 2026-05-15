/**
 * Servicio de exportación a Excel para ingredientes (insumos).
 *
 * Dos funciones:
 *   - generateIngredientsExcel: reporte completo con stock, costos y estadísticas
 *   - generateIngredientsTemplate: plantilla descargable para importación
 *
 * Presentación delegada a excelStyles para mantener el look unificado.
 */
import {
  XLSX,
  cellStyle, centerStyle, numberStyle,
  statusStyle,
  totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applySubtitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
  formatDate as formatDateLocale,
} from './excelStyles'

// =================== 1. REPORTE DE INGREDIENTES ===================

export const generateIngredientsExcel = async (ingredients, businessData, categories = []) => {
  const catMap = new Map(categories.map(c => [c.id, c.name]))
  const resolveCategory = (c) => {
    if (!c) return ''
    return catMap.get(c) || (categories.find(cc => cc.name?.toLowerCase() === String(c).toLowerCase())?.name || c)
  }

  const wb = XLSX.utils.book_new()

  const headers = [
    'Nombre', 'Categoría', 'Unidad', 'Stock Actual', 'Stock Mínimo',
    'Estado', 'Costo Promedio', 'Último Precio', 'Última Compra', 'Valor en Stock',
  ]
  const totalCols = headers.length

  const aoa = [['LISTADO DE INGREDIENTES'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total ingredientes',
    totalItems: ingredients.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  // Estadísticas acumuladas
  let totalValue = 0
  let lowStockCount = 0
  let outOfStockCount = 0

  ingredients.forEach(ingredient => {
    const currentStock = ingredient.currentStock || 0
    const avgCost = ingredient.averageCost || 0
    const stockValue = currentStock * avgCost
    totalValue += stockValue

    let stockStatus = 'Normal'
    if (currentStock === 0) {
      stockStatus = 'Sin stock'
      outOfStockCount++
    } else if (ingredient.minimumStock && currentStock <= ingredient.minimumStock) {
      stockStatus = 'Stock bajo'
      lowStockCount++
    }

    const lastPurchaseDate = ingredient.lastPurchaseDate
      ? formatDateLocale(ingredient.lastPurchaseDate)
      : 'N/A'

    aoa.push([
      ingredient.name || 'N/A',
      resolveCategory(ingredient.category),
      ingredient.purchaseUnit || 'N/A',
      Number(currentStock),
      Number(ingredient.minimumStock || 0),
      stockStatus,
      Number(avgCost),
      Number(ingredient.lastPurchasePrice || 0),
      lastPurchaseDate,
      Number(stockValue.toFixed(2)),
    ])
  })

  // Fila de total (solo Valor en Stock — los stocks unitarios no se suman porque tienen unidades distintas)
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push([
    '', '', '', '', '', '', '', '', 'TOTAL:',
    Number(totalValue.toFixed(2)),
  ])

  // Sección de estadísticas
  aoa.push([])
  const statsStart = aoa.length
  aoa.push(['ESTADÍSTICAS'])
  aoa.push(['Total de ingredientes', ingredients.length])
  aoa.push(['Ingredientes sin stock', outOfStockCount])
  aoa.push(['Ingredientes con stock bajo', lowStockCount])
  aoa.push(['Valor total del inventario', Number(totalValue.toFixed(2))])
  const statsEnd = aoa.length - 1

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [32, 22, 14, 14, 14, 14, 16, 16, 16, 16])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  for (let i = 0; i < ingredients.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))         // Nombre
    setStyle(ws, r, 1, cellStyle(i))         // Categoría
    setStyle(ws, r, 2, centerStyle(i))       // Unidad
    setStyle(ws, r, 3, numberStyle(i))       // Stock Actual
    setStyle(ws, r, 4, numberStyle(i))       // Stock Mínimo
    setStyle(ws, r, 5, statusStyle(i, aoa[r][5])) // Estado
    setStyle(ws, r, 6, numberStyle(i))       // Costo Promedio
    setStyle(ws, r, 7, numberStyle(i))       // Último Precio
    setStyle(ws, r, 8, centerStyle(i))       // Última Compra
    setStyle(ws, r, 9, numberStyle(i))       // Valor en Stock
  }
  // Fila de total
  for (let c = 0; c <= 8; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 9, totalNumberStyle)

  // Bloque de estadísticas
  applySubtitleRow(ws, statsStart, totalCols)
  applyMetadataRows(ws, statsStart + 1, statsEnd)
  applyFreezeBelow(ws, headerRow)

  XLSX.utils.book_append_sheet(wb, ws, 'Ingredientes')

  const fileName = buildExcelFileName('Ingredientes')
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Listado de ingredientes',
    subDirectory: 'Ingredientes',
  })
}

// =================== 2. PLANTILLA DE INGREDIENTES ===================

export const generateIngredientsTemplate = async () => {
  const wb = XLSX.utils.book_new()

  const headers = [
    'Nombre (*)', 'Categoría', 'Unidad de Compra (*)',
    'Stock Inicial', 'Stock Mínimo', 'Costo Inicial',
  ]
  const totalCols = headers.length

  const exampleRows = [
    ['Arroz', 'Granos y Cereales', 'kg', 25, 5, 4.50],
    ['Aceite Vegetal', 'Condimentos y Especias', 'L', 10, 2, 12.00],
    ['Sal', 'Condimentos y Especias', 'kg', 5, 1, 2.50],
  ]

  const aoa = [['PLANTILLA DE INGREDIENTES'], []]
  const metaStart = aoa.length
  aoa.push(['Fecha de generación:', formatDateLocale(new Date(), 'dd/MM/yyyy HH:mm')])
  aoa.push(['Total filas de ejemplo:', exampleRows.length])
  const metaEnd = aoa.length - 1
  aoa.push([])

  // Subtítulo "INSTRUCCIONES" + filas tipo metadata (label en col 0, descripción en col 1)
  const instrStart = aoa.length
  aoa.push(['INSTRUCCIONES'])
  aoa.push(['1.', 'Complete los datos en las columnas correspondientes'])
  aoa.push(['2.', 'No modifique los encabezados de las columnas'])
  aoa.push(['3.', 'Los campos marcados con (*) son obligatorios'])
  aoa.push(['4.', 'Unidades permitidas: kg, g, L, ml, unidades, cajas'])
  aoa.push(['5.', 'Use punto (.) para decimales en cantidades y precios'])
  const instrEnd = aoa.length - 1
  aoa.push([])

  // Tabla
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length
  for (const row of exampleRows) aoa.push(row)

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [30, 22, 22, 16, 16, 16])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  // Bloque de instrucciones
  applySubtitleRow(ws, instrStart, totalCols)
  applyMetadataRows(ws, instrStart + 1, instrEnd)
  // Encabezado y filas de ejemplo
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < exampleRows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, centerStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
  }
  applyFreezeBelow(ws, headerRow)

  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')

  const fileName = buildExcelFileName('Plantilla_Ingredientes')
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Plantilla de ingredientes para importación',
  })
}
