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
  cellStyle, centerStyle, numberStyle, intStyle,
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

export const generateIngredientsExcel = async (ingredients, businessData, categories = [], recipes = []) => {
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

  // ============== HOJAS EXTRA DE ANALÍTICA ==============
  appendByCategoryIngredientsSheet(wb, ingredients, businessData, resolveCategory)
  appendRecipesUsingIngredientsSheet(wb, ingredients, recipes, businessData)

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

  // Encabezados en la primera fila para que sheet_to_json del importador los reconozca.
  const headerRow = 0
  const dataStart = 1
  const aoa = [headers, ...exampleRows]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [30, 22, 22, 16, 16, 16])
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

// =================== HOJAS EXTRA DE ANALÍTICA ===================

/** Hoja "Por Categoría" — agrupación de ingredientes con stock + valor. */
function appendByCategoryIngredientsSheet(wb, ingredients, businessData, resolveCategory) {
  const agg = new Map()
  for (const ing of ingredients) {
    const cat = resolveCategory(ing.category) || 'Sin categoría'
    const stock = ing.currentStock || 0
    const avgCost = ing.averageCost || 0
    if (!agg.has(cat)) {
      agg.set(cat, { name: cat, count: 0, totalStock: 0, totalValue: 0, lowStock: 0, outOfStock: 0 })
    }
    const e = agg.get(cat)
    e.count += 1
    e.totalStock += stock
    e.totalValue += stock * avgCost
    if (stock === 0) e.outOfStock += 1
    else if (ing.minimumStock && stock <= ing.minimumStock) e.lowStock += 1
  }
  if (agg.size === 0) return

  const rows = [...agg.values()].sort((a, b) => b.totalValue - a.totalValue)

  const headers = ['Categoría', '# Ingredientes', 'Stock Total', 'Valor Total', 'Stock Bajo', 'Sin Stock', '% Valor']
  const totalCols = headers.length

  const aoa = [['INGREDIENTES POR CATEGORÍA'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total categorías',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0)
  let totalCount = 0, totalStock = 0, totalLow = 0, totalOut = 0
  rows.forEach(c => {
    const pct = totalValue > 0 ? (c.totalValue / totalValue) * 100 : 0
    totalCount += c.count
    totalStock += c.totalStock
    totalLow += c.lowStock
    totalOut += c.outOfStock
    aoa.push([
      c.name, c.count,
      Number(c.totalStock.toFixed(2)),
      Number(c.totalValue.toFixed(2)),
      c.lowStock, c.outOfStock,
      Number(pct.toFixed(1)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTALES', totalCount, Number(totalStock.toFixed(2)), Number(totalValue.toFixed(2)), totalLow, totalOut, 100])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [28, 14, 14, 16, 12, 12, 12])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, intStyle(i))
    setStyle(ws, r, 5, intStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, totalNumberStyle)
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 5, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 6, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Categoría')
}

/** Hoja "Recetas que Usan" — para cada ingrediente, qué recetas lo consumen. */
function appendRecipesUsingIngredientsSheet(wb, ingredients, recipes, businessData) {
  if (!recipes || recipes.length === 0) return

  // Inverse map: ingredientId → [{ recipeName, productName, quantity, unit }]
  const inverse = new Map()
  for (const r of recipes) {
    const recipeIngs = Array.isArray(r.ingredients) ? r.ingredients : []
    for (const ri of recipeIngs) {
      const id = ri.ingredientId
      if (!id) continue
      if (!inverse.has(id)) inverse.set(id, [])
      inverse.get(id).push({
        recipeName: r.productName || r.name || 'Receta',
        quantity: ri.quantity || 0,
        unit: ri.unit || '',
      })
    }
  }

  // Filtrar solo ingredientes que aparecen en al menos una receta
  const used = ingredients.filter(ing => inverse.has(ing.id))
  if (used.length === 0) return

  const headers = ['Ingrediente', 'Unidad', '# Recetas', 'Recetas (cantidad x unidad)']
  const totalCols = headers.length

  const aoa = [['RECETAS QUE USAN CADA INGREDIENTE'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Ingredientes usados en recetas',
    totalItems: used.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  used.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
  used.forEach(ing => {
    const usages = inverse.get(ing.id) || []
    const detail = usages.map(u => `${u.recipeName} (${u.quantity} ${u.unit})`).join(' · ')
    aoa.push([
      ing.name || 'N/A',
      ing.purchaseUnit || '',
      usages.length,
      detail,
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [28, 14, 12, 70])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < used.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
  }
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Recetas que Usan')
}
