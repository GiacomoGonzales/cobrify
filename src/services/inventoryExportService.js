import * as XLSX from 'xlsx-js-style'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Exportación avanzada del inventario con estilos.
 *
 * Opciones:
 *   {
 *     includeProducts: boolean,
 *     includeIngredients: boolean,
 *     warehouseIds: string[],   // array de IDs de almacenes a incluir
 *     includeNoStockTracking: boolean,
 *     format: 'columns' | 'rows',
 *   }
 */

// =================== PALETA DE ESTILOS ===================
const COLORS = {
  titleBg: '1E3A8A',        // Azul oscuro
  titleFg: 'FFFFFF',
  subtitleBg: 'E0E7FF',     // Azul muy claro
  headerBg: '3730A3',       // Indigo
  headerFg: 'FFFFFF',
  zebraBg: 'F9FAFB',        // Gris muy suave
  totalBg: 'FEF3C7',        // Amarillo suave
  productTag: 'D1FAE5',     // Verde claro
  productText: '065F46',    // Verde oscuro
  ingredientTag: 'FED7AA',  // Naranja claro
  ingredientText: '9A3412', // Naranja oscuro
  stockOk: '065F46',
  stockLow: 'B45309',       // Ámbar oscuro
  stockOut: 'B91C1C',       // Rojo oscuro
  border: 'CBD5E1',
}

const BORDER_ALL = {
  top: { style: 'thin', color: { rgb: COLORS.border } },
  bottom: { style: 'thin', color: { rgb: COLORS.border } },
  left: { style: 'thin', color: { rgb: COLORS.border } },
  right: { style: 'thin', color: { rgb: COLORS.border } },
}

const titleStyle = {
  font: { bold: true, sz: 14, color: { rgb: COLORS.titleFg } },
  fill: { fgColor: { rgb: COLORS.titleBg } },
  alignment: { horizontal: 'center', vertical: 'center' },
}

const metaLabelStyle = {
  font: { bold: true, sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: COLORS.subtitleBg } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
}

const metaValueStyle = {
  font: { sz: 10, color: { rgb: '1F2937' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
}

const headerStyle = {
  font: { bold: true, sz: 10, color: { rgb: COLORS.headerFg } },
  fill: { fgColor: { rgb: COLORS.headerBg } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: BORDER_ALL,
}

const cellStyle = (rowIdx) => ({
  font: { sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: rowIdx % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
})

const numberStyle = (rowIdx) => ({
  font: { sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: rowIdx % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: BORDER_ALL,
  numFmt: '#,##0.00',
})

const intStyle = (rowIdx) => ({
  ...numberStyle(rowIdx),
  numFmt: '#,##0',
})

const typeTagStyle = (rowIdx, isProduct) => ({
  font: { bold: true, sz: 9, color: { rgb: isProduct ? COLORS.productText : COLORS.ingredientText } },
  fill: { fgColor: { rgb: isProduct ? COLORS.productTag : COLORS.ingredientTag } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER_ALL,
})

const statusStyle = (rowIdx, status) => {
  const color = status === 'Sin stock' ? COLORS.stockOut
    : status === 'Stock bajo' ? COLORS.stockLow
    : COLORS.stockOk
  return {
    font: { bold: true, sz: 10, color: { rgb: color } },
    fill: { fgColor: { rgb: rowIdx % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  }
}

const totalRowStyle = {
  font: { bold: true, sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: COLORS.totalBg } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: BORDER_ALL,
}

const totalLabelStyle = {
  ...totalRowStyle,
  alignment: { horizontal: 'left', vertical: 'center' },
}

// =================== HELPERS ===================

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
  if (item.itemType === 'ingredient') {
    return item.currentStock || 0
  }
  return item.stock || 0
}

// Obtener jerarquía de categoría
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

  // Filtrar almacenes
  const selectedWarehouses = warehouses.filter(w => warehouseIds.includes(w.id))
  if (selectedWarehouses.length === 0) {
    throw new Error('Debes seleccionar al menos un almacén')
  }

  // Construir lista unificada
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

  // Generar workbook
  const wb = XLSX.utils.book_new()
  const sheet = exportFormat === 'rows'
    ? buildSheetRows(items, selectedWarehouses, categories, businessData)
    : buildSheetColumns(items, selectedWarehouses, categories, businessData)
  XLSX.utils.book_append_sheet(wb, sheet, 'Inventario')

  // Hoja adicional con almacenes (info)
  const warehouseSheet = buildWarehouseInfoSheet(selectedWarehouses, items)
  XLSX.utils.book_append_sheet(wb, warehouseSheet, 'Almacenes')

  // Guardar/compartir
  const fileName = `Inventario_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`
  await saveAndShare(wb, fileName)
  return { success: true, itemCount: items.length }
}

// =================== FORMATO A: COLUMNAS POR ALMACÉN ===================

function buildSheetColumns(items, selectedWarehouses, categories, businessData) {
  const headers = [
    'Tipo',
    'SKU',
    'Código',
    'Nombre',
    'Categoría',
    'Unidad',
    'Precio',
    ...selectedWarehouses.map(w => `Stock\n${w.name}`),
    'Stock Total',
    'Stock Mín.',
    'Estado',
  ]

  // Preparar filas (con variantes expandidas)
  const rows = []
  items.forEach(item => {
    if (item.itemType === 'product' && item.hasVariants && item.variants?.length > 0) {
      // Una fila por variante
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

  // Construir AOA (array of arrays) con metadata + header + data + totales
  const aoa = []

  // Título
  aoa.push(['REPORTE DE INVENTARIO'])
  aoa.push([])
  // Metadata
  aoa.push(['Negocio:', businessData?.name || '—'])
  aoa.push(['RUC:', businessData?.ruc || '—'])
  aoa.push(['Almacenes incluidos:', selectedWarehouses.map(w => w.name).join(', ')])
  aoa.push(['Fecha de generación:', format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })])
  aoa.push(['Total de items:', rows.length])
  aoa.push([])

  // Header
  const headerRowIdx = aoa.length // 0-indexed
  aoa.push(headers)

  // Data
  const dataStartRow = aoa.length
  rows.forEach(r => {
    aoa.push([
      r.tipo,
      r.sku,
      r.codigo,
      r.nombre,
      r.categoria,
      r.unidad,
      r.precio,
      ...r.stockPerWh,
      r.stockTotal,
      r.stockMin,
      r.status,
    ])
  })
  const dataEndRow = aoa.length - 1 // inclusive

  // Totales
  aoa.push([])
  aoa.push(['RESUMEN'])
  aoa.push(['Total items:', rows.length])
  aoa.push(['Items con stock:', rows.filter(r => r.stockTotal > 0).length])
  aoa.push(['Items sin stock:', rows.filter(r => r.stockTotal === 0).length])
  aoa.push(['Items con stock bajo:', rows.filter(r => r.status === 'Stock bajo').length])
  const totalValue = rows.reduce((s, r) => s + r.precio * r.stockTotal, 0)
  aoa.push(['Valor total del inventario:', totalValue])

  // Crear worksheet
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Anchos de columna
  const cols = [
    { wch: 11 }, // Tipo
    { wch: 12 }, // SKU
    { wch: 14 }, // Código
    { wch: 35 }, // Nombre
    { wch: 22 }, // Categoría
    { wch: 10 }, // Unidad
    { wch: 10 }, // Precio
    ...selectedWarehouses.map(() => ({ wch: 14 })), // Stock por almacén
    { wch: 12 }, // Stock Total
    { wch: 11 }, // Stock Min
    { wch: 12 }, // Estado
  ]
  ws['!cols'] = cols

  // Altura del header
  ws['!rows'] = []
  ws['!rows'][headerRowIdx] = { hpt: 32 }

  // Merge del título
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
  ]

  // Estilos
  const range = XLSX.utils.decode_range(ws['!ref'])

  // Título
  setStyle(ws, 0, 0, titleStyle)
  for (let c = 1; c < headers.length; c++) setStyle(ws, 0, c, titleStyle)
  ws['!rows'][0] = { hpt: 26 }

  // Metadata (filas 2-6, columnas 0 y 1)
  for (let r = 2; r <= 6; r++) {
    setStyle(ws, r, 0, metaLabelStyle)
    setStyle(ws, r, 1, metaValueStyle)
  }

  // Header (fila headerRowIdx)
  for (let c = 0; c < headers.length; c++) {
    setStyle(ws, headerRowIdx, c, headerStyle)
  }

  // Datos
  for (let i = 0; i < rows.length; i++) {
    const r = dataStartRow + i
    const row = rows[i]
    // Tipo
    setStyle(ws, r, 0, typeTagStyle(i, row.isProduct))
    // SKU, Código, Nombre, Categoría, Unidad
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, cellStyle(i))
    setStyle(ws, r, 5, { ...cellStyle(i), alignment: { horizontal: 'center', vertical: 'center' } })
    // Precio
    setStyle(ws, r, 6, numberStyle(i))
    // Stock por almacén
    selectedWarehouses.forEach((_, wIdx) => {
      setStyle(ws, r, 7 + wIdx, intStyle(i))
    })
    // Total, Min
    const totalCol = 7 + selectedWarehouses.length
    setStyle(ws, r, totalCol, { ...intStyle(i), font: { ...intStyle(i).font, bold: true } })
    setStyle(ws, r, totalCol + 1, intStyle(i))
    // Estado
    setStyle(ws, r, totalCol + 2, statusStyle(i, row.status))
  }

  // Totales
  const summaryStartRow = dataEndRow + 3
  setStyle(ws, summaryStartRow, 0, { ...titleStyle, fill: { fgColor: { rgb: COLORS.subtitleBg } }, font: { ...titleStyle.font, color: { rgb: '1F2937' }, sz: 11 } })
  ws['!merges'].push({ s: { r: summaryStartRow, c: 0 }, e: { r: summaryStartRow, c: 3 } })
  for (let i = 1; i <= 5; i++) {
    setStyle(ws, summaryStartRow + i, 0, totalLabelStyle)
    setStyle(ws, summaryStartRow + i, 1, totalRowStyle)
  }

  // Freeze panes en la fila del header+1
  ws['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1 }

  return ws
}

// =================== FORMATO B: FILAS POR ALMACÉN ===================

function buildSheetRows(items, selectedWarehouses, categories, businessData) {
  const headers = [
    'Tipo',
    'SKU',
    'Código',
    'Nombre',
    'Categoría',
    'Unidad',
    'Precio',
    'Almacén',
    'Stock',
    'Stock Mín.',
    'Estado',
  ]

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

  const aoa = []
  aoa.push(['REPORTE DE INVENTARIO (formato extendido)'])
  aoa.push([])
  aoa.push(['Negocio:', businessData?.name || '—'])
  aoa.push(['RUC:', businessData?.ruc || '—'])
  aoa.push(['Almacenes incluidos:', selectedWarehouses.map(w => w.name).join(', ')])
  aoa.push(['Fecha de generación:', format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })])
  aoa.push(['Total de filas:', rows.length])
  aoa.push([])

  const headerRowIdx = aoa.length
  aoa.push(headers)
  const dataStartRow = aoa.length
  rows.forEach(r => {
    aoa.push([
      r.tipo, r.sku, r.codigo, r.nombre, r.categoria, r.unidad,
      r.precio, r.almacen, r.stock, r.stockMin, r.status,
    ])
  })
  const dataEndRow = aoa.length - 1

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 11 }, { wch: 12 }, { wch: 14 }, { wch: 32 }, { wch: 22 },
    { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 11 }, { wch: 11 }, { wch: 12 },
  ]
  ws['!rows'] = []
  ws['!rows'][0] = { hpt: 26 }
  ws['!rows'][headerRowIdx] = { hpt: 28 }
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]

  // Título
  for (let c = 0; c < headers.length; c++) setStyle(ws, 0, c, titleStyle)
  // Metadata
  for (let r = 2; r <= 6; r++) {
    setStyle(ws, r, 0, metaLabelStyle)
    setStyle(ws, r, 1, metaValueStyle)
  }
  // Header
  for (let c = 0; c < headers.length; c++) setStyle(ws, headerRowIdx, c, headerStyle)

  // Datos
  for (let i = 0; i < rows.length; i++) {
    const r = dataStartRow + i
    const row = rows[i]
    setStyle(ws, r, 0, typeTagStyle(i, row.isProduct))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, cellStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, cellStyle(i))
    setStyle(ws, r, 5, { ...cellStyle(i), alignment: { horizontal: 'center', vertical: 'center' } })
    setStyle(ws, r, 6, numberStyle(i))
    setStyle(ws, r, 7, cellStyle(i))
    setStyle(ws, r, 8, intStyle(i))
    setStyle(ws, r, 9, intStyle(i))
    setStyle(ws, r, 10, statusStyle(i, row.status))
  }

  ws['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1 }
  return ws
}

// =================== HOJA DE ALMACENES ===================

function buildWarehouseInfoSheet(selectedWarehouses, items) {
  const aoa = [
    ['INFORMACIÓN DE ALMACENES'],
    [],
    ['Almacén', 'Principal', 'Items con stock', 'Total unidades'],
  ]
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

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 16 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]

  setStyle(ws, 0, 0, titleStyle)
  for (let c = 1; c < 4; c++) setStyle(ws, 0, c, titleStyle)

  for (let c = 0; c < 4; c++) setStyle(ws, 2, c, headerStyle)

  for (let i = 0; i < selectedWarehouses.length; i++) {
    const r = 3 + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, { ...cellStyle(i), alignment: { horizontal: 'center', vertical: 'center' } })
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, intStyle(i))
  }
  ws['!rows'] = [{ hpt: 26 }]

  return ws
}

// =================== UTIL: aplicar estilo a celda ===================

function setStyle(ws, row, col, style) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  if (!ws[addr]) {
    ws[addr] = { t: 's', v: '' }
  }
  ws[addr].s = style
}

// =================== GUARDAR / COMPARTIR ===================

async function saveAndShare(wb, fileName) {
  const isNative = Capacitor.isNativePlatform()
  if (isNative) {
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })
    const result = await Filesystem.writeFile({
      path: fileName,
      data: excelBuffer,
      directory: Directory.Documents,
      recursive: true,
    })
    try {
      await Share.share({
        title: fileName,
        text: 'Reporte de inventario',
        url: result.uri,
        dialogTitle: 'Compartir inventario',
      })
    } catch { /* usuario canceló */ }
    return { uri: result.uri }
  } else {
    XLSX.writeFile(wb, fileName)
    return {}
  }
}
