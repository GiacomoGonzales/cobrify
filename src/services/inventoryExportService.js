/**
 * Exportación avanzada del inventario con estilos.
 *
 * Opciones:
 *   {
 *     includeProducts: boolean,
 *     includeIngredients: boolean,
 *     warehouseIds: string[],
 *     includeNoStockTracking: boolean,
 *     format: 'columns' | 'rows',
 *   }
 *
 * Toda la presentación se delega a excelStyles para mantener el look unificado.
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
  saveAndShareExcel,
} from './excelStyles'

// =================== HELPERS LOCALES ===================

/** Badge verde (producto) o naranja (insumo). */
const itemTypeBadgeStyle = (isProduct) => badgeStyle({
  bg: isProduct ? COLORS.successTag : COLORS.warningTag,
  fg: isProduct ? COLORS.successText : COLORS.warningText,
})

// Stock de un item en un almacén específico
const getStockAtWarehouse = (item, warehouseId) => {
  if (!warehouseId) return 0
  // Producto con variantes: sumar stock de todas las variantes en el almacén
  if (item.hasVariants && item.variants?.length > 0) {
    return item.variants.reduce((sum, v) => {
      const ws = (v.warehouseStocks || []).find(s => s.warehouseId === warehouseId)
      return sum + (ws?.stock || 0)
    }, 0)
  }
  // Producto normal o ingrediente
  const ws = (item.warehouseStocks || []).find(s => s.warehouseId === warehouseId)
  return ws?.stock || 0
}

// Stock total (todos los almacenes) de un item
const getTotalStock = (item) => {
  if (item.hasVariants && item.variants?.length > 0) {
    return item.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
  }
  if (item.itemType === 'ingredient') return item.currentStock || 0
  return item.stock || 0
}

// Jerarquía de categoría (con padre > hijo)
const getCategoryLabel = (categoryId, categories = []) => {
  if (!categoryId) return 'Sin categoría'
  const hierarchy = []
  let currentId = categoryId
  let iterations = 0
  while (currentId && iterations < 10) {
    const cat = categories.find(c => c.id === currentId)
    if (!cat) break
    hierarchy.unshift(cat.name)
    currentId = cat.parentId
    iterations++
  }
  return hierarchy.length > 0 ? hierarchy.join(' > ') : 'Sin categoría'
}

// Estado del stock
const getStockStatus = (stock, minStock) => {
  if (!stock || stock === 0) return 'Sin stock'
  if (minStock && stock <= minStock) return 'Stock bajo'
  return 'Normal'
}

// =================== EXPORT PRINCIPAL ===================

export const exportInventoryWithOptions = async ({
  products = [],
  ingredients = [],
  categories = [],
  brands = [],
  warehouses = [],
  businessData = null,
  options = {},
}) => {
  const {
    includeProducts = true,
    includeIngredients = true,
    warehouseIds = [],
    includeNoStockTracking = false,
    format: exportFormat = 'columns',
  } = options

  const selectedWarehouses = warehouses.filter(w => warehouseIds.includes(w.id))
  if (selectedWarehouses.length === 0) {
    throw new Error('Debes seleccionar al menos un almacén')
  }

  // Lista unificada de items (productos + ingredientes)
  let items = []
  if (includeProducts) {
    const mapped = products
      .filter(p => includeNoStockTracking || p.trackStock !== false)
      .map(p => ({ ...p, itemType: 'product' }))
    items.push(...mapped)
  }
  if (includeIngredients) {
    const mapped = ingredients
      .filter(i => includeNoStockTracking || i.trackStock !== false)
      .map(i => ({
        ...i,
        itemType: 'ingredient',
        unit: i.purchaseUnit || i.unit || 'UNIDAD',
        price: i.averageCost || 0,
        stock: i.currentStock || 0,
      }))
    items.push(...mapped)
  }

  if (items.length === 0) {
    throw new Error('No hay items para exportar con los filtros seleccionados')
  }

  const wb = XLSX.utils.book_new()
  const sheet = exportFormat === 'rows'
    ? buildSheetRows(items, selectedWarehouses, categories, businessData)
    : buildSheetColumns(items, selectedWarehouses, categories, businessData)
  XLSX.utils.book_append_sheet(wb, sheet, 'Inventario')

  const warehouseSheet = buildWarehouseInfoSheet(selectedWarehouses, items)
  XLSX.utils.book_append_sheet(wb, warehouseSheet, 'Almacenes')

  // ============== HOJAS EXTRA DE ANALÍTICA ==============
  appendLowStockSheet(wb, items, categories, businessData)
  appendByCategorySheet(wb, items, categories, businessData)
  appendByBrandSheet(wb, items, brands, businessData)

  const fileName = buildExcelFileName('Inventario')
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Reporte de inventario',
    subDirectory: 'Inventario',
  })
  return { success: true, itemCount: items.length }
}

// =================== FORMATO A: UNA COLUMNA POR ALMACÉN ===================

function buildSheetColumns(items, selectedWarehouses, categories, businessData) {
  const headers = [
    'Tipo', 'SKU', 'Código', 'Nombre', 'Categoría', 'Unidad', 'Precio',
    ...selectedWarehouses.map(w => `Stock\n${w.name}`),
    'Stock Total', 'Stock Mín.', 'Estado',
  ]
  const totalCols = headers.length

  // Expandir variantes y filas
  const rows = []
  items.forEach(item => {
    if (item.itemType === 'product' && item.hasVariants && item.variants?.length > 0) {
      item.variants.forEach(v => {
        const variantLabel = Object.values(v.attributes || {}).join(' / ')
        const name = variantLabel ? `${item.name} — ${variantLabel}` : item.name
        const stockPerWh = selectedWarehouses.map(w => {
          const ws = (v.warehouseStocks || []).find(s => s.warehouseId === w.id)
          return ws?.stock || 0
        })
        const totalStock = stockPerWh.reduce((a, b) => a + b, 0)
        rows.push({
          tipo: 'Producto',
          sku: v.sku || item.sku || '',
          codigo: v.code || item.code || '',
          nombre: name,
          categoria: getCategoryLabel(item.category, categories),
          unidad: item.unit || 'UNIDAD',
          precio: Number(v.price) || 0,
          stockPerWh,
          stockTotal: totalStock,
          stockMin: Number(item.minStock) || 0,
          status: getStockStatus(totalStock, item.minStock),
          isProduct: true,
        })
      })
    } else {
      const isProduct = item.itemType === 'product'
      const stockPerWh = selectedWarehouses.map(w => getStockAtWarehouse(item, w.id))
      const totalStock = stockPerWh.reduce((a, b) => a + b, 0) || getTotalStock(item)
      rows.push({
        tipo: isProduct ? 'Producto' : 'Insumo',
        sku: item.sku || '',
        codigo: item.code || '',
        nombre: item.name || '',
        categoria: getCategoryLabel(item.category, categories),
        unidad: item.unit || 'UNIDAD',
        precio: Number(item.price) || 0,
        stockPerWh,
        stockTotal: totalStock,
        stockMin: Number(item.minStock) || 0,
        status: getStockStatus(totalStock, item.minStock),
        isProduct,
      })
    }
  })

  // AOA: título / metadata / header / data / resumen
  const aoa = [['REPORTE DE INVENTARIO'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    warehouseLabel: selectedWarehouses.map(w => w.name).join(', '),
    totalLabel: 'Total items',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])

  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length
  rows.forEach(r => {
    aoa.push([
      r.tipo, r.sku, r.codigo, r.nombre, r.categoria, r.unidad, r.precio,
      ...r.stockPerWh,
      r.stockTotal, r.stockMin, r.status,
    ])
  })

  // Resumen
  aoa.push([])
  const summaryStart = aoa.length
  aoa.push(['RESUMEN'])
  aoa.push(['Total items', rows.length])
  aoa.push(['Items con stock', rows.filter(r => r.stockTotal > 0).length])
  aoa.push(['Items sin stock', rows.filter(r => r.stockTotal === 0).length])
  aoa.push(['Items con stock bajo', rows.filter(r => r.status === 'Stock bajo').length])
  const totalValue = rows.reduce((s, r) => s + r.precio * r.stockTotal, 0)
  aoa.push(['Valor total del inventario', Number(totalValue.toFixed(2))])
  const summaryEnd = aoa.length - 1

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [
    11, 12, 14, 35, 22, 10, 10,
    ...selectedWarehouses.map(() => 14),
    12, 11, 12,
  ])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  // Filas de datos
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    const row = rows[i]
    setStyle(ws, r, 0, itemTypeBadgeStyle(row.isProduct))    // Tipo
    setStyle(ws, r, 1, cellStyle(i))                         // SKU
    setStyle(ws, r, 2, cellStyle(i))                         // Código
    setStyle(ws, r, 3, cellStyle(i))                         // Nombre
    setStyle(ws, r, 4, cellStyle(i))                         // Categoría
    setStyle(ws, r, 5, centerStyle(i))                       // Unidad
    setStyle(ws, r, 6, numberStyle(i))                       // Precio
    selectedWarehouses.forEach((_, wIdx) => {
      setStyle(ws, r, 7 + wIdx, intStyle(i))
    })
    const totalCol = 7 + selectedWarehouses.length
    setStyle(ws, r, totalCol, { ...intStyle(i), font: { ...intStyle(i).font, bold: true } })
    setStyle(ws, r, totalCol + 1, intStyle(i))
    setStyle(ws, r, totalCol + 2, statusStyle(i, row.status))
  }

  // Bloque de resumen (subtitle + filas tipo metadata)
  applySubtitleRow(ws, summaryStart, totalCols)
  applyMetadataRows(ws, summaryStart + 1, summaryEnd)
  applyFreezeBelow(ws, headerRow)

  return ws
}

// =================== FORMATO B: UNA FILA POR (ITEM, ALMACÉN) ===================

function buildSheetRows(items, selectedWarehouses, categories, businessData) {
  const headers = [
    'Tipo', 'SKU', 'Código', 'Nombre', 'Categoría', 'Unidad', 'Precio',
    'Almacén', 'Stock', 'Stock Mín.', 'Estado',
  ]
  const totalCols = headers.length

  const rows = []
  items.forEach(item => {
    if (item.itemType === 'product' && item.hasVariants && item.variants?.length > 0) {
      item.variants.forEach(v => {
        const variantLabel = Object.values(v.attributes || {}).join(' / ')
        const name = variantLabel ? `${item.name} — ${variantLabel}` : item.name
        selectedWarehouses.forEach(w => {
          const ws = (v.warehouseStocks || []).find(s => s.warehouseId === w.id)
          const stock = ws?.stock || 0
          rows.push({
            tipo: 'Producto',
            sku: v.sku || item.sku || '',
            codigo: v.code || item.code || '',
            nombre: name,
            categoria: getCategoryLabel(item.category, categories),
            unidad: item.unit || 'UNIDAD',
            precio: Number(v.price) || 0,
            almacen: w.name,
            stock,
            stockMin: Number(item.minStock) || 0,
            status: getStockStatus(stock, item.minStock),
            isProduct: true,
          })
        })
      })
    } else {
      const isProduct = item.itemType === 'product'
      selectedWarehouses.forEach(w => {
        const stock = getStockAtWarehouse(item, w.id)
        rows.push({
          tipo: isProduct ? 'Producto' : 'Insumo',
          sku: item.sku || '',
          codigo: item.code || '',
          nombre: item.name || '',
          categoria: getCategoryLabel(item.category, categories),
          unidad: item.unit || 'UNIDAD',
          precio: Number(item.price) || 0,
          almacen: w.name,
          stock,
          stockMin: Number(item.minStock) || 0,
          status: getStockStatus(stock, item.minStock),
          isProduct,
        })
      })
    }
  })

  const aoa = [['REPORTE DE INVENTARIO (formato extendido)'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    warehouseLabel: selectedWarehouses.map(w => w.name).join(', '),
    totalLabel: 'Total filas',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length
  rows.forEach(r => {
    aoa.push([
      r.tipo, r.sku, r.codigo, r.nombre, r.categoria, r.unidad,
      r.precio, r.almacen, r.stock, r.stockMin, r.status,
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [11, 12, 14, 32, 22, 10, 10, 22, 11, 11, 12])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    const row = rows[i]
    setStyle(ws, r, 0, itemTypeBadgeStyle(row.isProduct))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, cellStyle(i))
    setStyle(ws, r, 5, centerStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
    setStyle(ws, r, 7, cellStyle(i))
    setStyle(ws, r, 8, intStyle(i))
    setStyle(ws, r, 9, intStyle(i))
    setStyle(ws, r, 10, statusStyle(i, row.status))
  }
  applyFreezeBelow(ws, headerRow)
  return ws
}

// =================== HOJA DE ALMACENES ===================

function buildWarehouseInfoSheet(selectedWarehouses, items) {
  const headers = ['Almacén', 'Principal', 'Items con stock', 'Total unidades']
  const totalCols = headers.length

  const aoa = [['INFORMACIÓN DE ALMACENES'], []]
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  selectedWarehouses.forEach(w => {
    let withStock = 0
    let totalUnits = 0
    items.forEach(item => {
      const s = getStockAtWarehouse(item, w.id)
      if (s > 0) {
        withStock++
        totalUnits += s
      }
    })
    aoa.push([w.name, w.isDefault ? 'Sí' : '', withStock, totalUnits])
  })

  // Totales
  const totalWithStock = selectedWarehouses.reduce((sum, w) => {
    return sum + items.filter(it => getStockAtWarehouse(it, w.id) > 0).length
  }, 0)
  const totalUnitsAll = selectedWarehouses.reduce((sum, w) => {
    return sum + items.reduce((s, it) => s + getStockAtWarehouse(it, w.id), 0)
  }, 0)
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTALES', '', totalWithStock, totalUnitsAll])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [30, 12, 18, 16])
  applyTitleRow(ws, 0, totalCols)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < selectedWarehouses.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, intStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, totalLabelStyle)
  setStyle(ws, totalRowIdx, 2, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 3, { ...totalNumberStyle, numFmt: '#,##0' })
  applyFreezeBelow(ws, headerRow)

  return ws
}

// =================== HOJAS EXTRA DE ANALÍTICA ===================

/** Hoja "Stock Bajo": items con stock <= stockMin (incluyendo sin stock). */
function appendLowStockSheet(wb, items, categories, businessData) {
  const inAlert = items
    .map(item => {
      const stock = getTotalStock(item)
      const min = Number(item.minStock || item.minimumStock) || 3
      return { item, stock, min }
    })
    .filter(({ stock, min }) => stock <= min)
    .sort((a, b) => a.stock - b.stock)

  if (inAlert.length === 0) return

  const headers = ['Tipo', 'SKU', 'Nombre', 'Categoría', 'Stock Actual', 'Stock Mín.', 'Faltante', 'Estado', 'Precio Unit.', 'Valor Faltante']
  const totalCols = headers.length

  const aoa = [['ALERTA: STOCK BAJO Y AGOTADOS'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total items en alerta',
    totalItems: inAlert.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  let totalFaltante = 0
  const statuses = []
  inAlert.forEach(({ item, stock, min }) => {
    const isProduct = item.itemType === 'product'
    const faltante = Math.max(0, min - stock)
    const status = stock === 0 ? 'Sin stock' : 'Stock bajo'
    statuses.push(status)
    const price = Number(item.price) || 0
    const valorFaltante = faltante * price
    totalFaltante += valorFaltante
    aoa.push([
      isProduct ? 'Producto' : 'Insumo',
      item.sku || '',
      item.name || 'N/A',
      getCategoryLabel(item.category, categories),
      stock,
      min,
      faltante,
      status,
      Number(price),
      Number(valorFaltante.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', '', '', '', '', '', '', 'TOTAL FALTANTE', '', Number(totalFaltante.toFixed(2))])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [11, 14, 36, 22, 12, 12, 12, 14, 14, 16])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < inAlert.length; i++) {
    const r = dataStart + i
    const isProduct = inAlert[i].item.itemType === 'product'
    setStyle(ws, r, 0, itemTypeBadgeStyle(isProduct))
    setStyle(ws, r, 1, centerStyle(i))
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, intStyle(i))
    setStyle(ws, r, 5, intStyle(i))
    setStyle(ws, r, 6, intStyle(i))
    setStyle(ws, r, 7, statuses[i] === 'Sin stock'
      ? { ...centerStyle(i), font: { ...centerStyle(i).font, bold: true, color: { rgb: COLORS.dangerText } } }
      : { ...centerStyle(i), font: { ...centerStyle(i).font, bold: true, color: { rgb: COLORS.warningText } } })
    setStyle(ws, r, 8, numberStyle(i))
    setStyle(ws, r, 9, numberStyle(i))
  }
  for (let c = 0; c <= 8; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
  setStyle(ws, totalRowIdx, 9, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Bajo')
}

/** Hoja "Por Categoría": agregación de items por categoría. */
function appendByCategorySheet(wb, items, categories, businessData) {
  const agg = new Map()
  for (const item of items) {
    const catLabel = getCategoryLabel(item.category, categories)
    const stock = getTotalStock(item)
    const price = Number(item.price) || 0
    if (!agg.has(catLabel)) {
      agg.set(catLabel, { name: catLabel, count: 0, totalStock: 0, totalValue: 0, lowStock: 0, outOfStock: 0 })
    }
    const e = agg.get(catLabel)
    e.count += 1
    e.totalStock += stock
    e.totalValue += stock * price
    if (stock === 0) e.outOfStock += 1
    else if ((item.minStock || 3) >= stock) e.lowStock += 1
  }
  if (agg.size === 0) return

  const rows = [...agg.values()].sort((a, b) => b.totalValue - a.totalValue)

  const headers = ['Categoría', '# Items', 'Stock Total', 'Valor Total', 'Stock Bajo', 'Sin Stock', '% Valor']
  const totalCols = headers.length

  const aoa = [['INVENTARIO POR CATEGORÍA'], []]
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
      c.name,
      c.count,
      Number(c.totalStock),
      Number(c.totalValue.toFixed(2)),
      c.lowStock,
      c.outOfStock,
      Number(pct.toFixed(1)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTALES', totalCount, Number(totalStock), Number(totalValue.toFixed(2)), totalLow, totalOut, 100])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [30, 12, 14, 16, 12, 12, 12])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, intStyle(i))
    setStyle(ws, r, 5, intStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 5, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 6, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Categoría')
}

/** Hoja "Por Marca": agregación por brandId administrado + grupo "Sin marca". */
function appendByBrandSheet(wb, items, brands, businessData) {
  // Solo aplica si hay al menos una marca administrada
  if (!brands || brands.length === 0) return

  const brandMap = new Map(brands.map(b => [b.id, b.name]))
  const agg = new Map()

  for (const item of items) {
    if (item.itemType !== 'product') continue
    const brandId = item.brandId
    const key = brandId && brandMap.has(brandId) ? brandId : '__NO_BRAND__'
    const name = brandId && brandMap.has(brandId) ? brandMap.get(brandId) : 'Sin marca'
    const stock = getTotalStock(item)
    const price = Number(item.price) || 0
    if (!agg.has(key)) {
      agg.set(key, { name, count: 0, totalStock: 0, totalValue: 0, lowStock: 0, outOfStock: 0 })
    }
    const e = agg.get(key)
    e.count += 1
    e.totalStock += stock
    e.totalValue += stock * price
    if (stock === 0) e.outOfStock += 1
    else if ((item.minStock || 3) >= stock) e.lowStock += 1
  }
  if (agg.size === 0) return

  const rows = [...agg.values()].sort((a, b) => b.totalValue - a.totalValue)

  const headers = ['Marca', '# Productos', 'Stock Total', 'Valor Total', 'Stock Bajo', 'Sin Stock', '% Valor']
  const totalCols = headers.length

  const aoa = [['INVENTARIO POR MARCA'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total marcas en inventario',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0)
  let totalCount = 0, totalStock = 0, totalLow = 0, totalOut = 0
  rows.forEach(b => {
    const pct = totalValue > 0 ? (b.totalValue / totalValue) * 100 : 0
    totalCount += b.count
    totalStock += b.totalStock
    totalLow += b.lowStock
    totalOut += b.outOfStock
    aoa.push([
      b.name, b.count,
      Number(b.totalStock),
      Number(b.totalValue.toFixed(2)),
      b.lowStock, b.outOfStock,
      Number(pct.toFixed(1)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTALES', totalCount, Number(totalStock), Number(totalValue.toFixed(2)), totalLow, totalOut, 100])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [30, 14, 14, 16, 12, 12, 12])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, intStyle(i))
    setStyle(ws, r, 5, intStyle(i))
    setStyle(ws, r, 6, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 5, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 6, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Marca')
}
