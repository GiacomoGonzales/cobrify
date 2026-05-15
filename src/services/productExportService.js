/**
 * Servicio de exportación a Excel para productos.
 *
 * Tres funciones públicas:
 *   - exportProductsForImport: plantilla compatible con el importador (mismo
 *     orden de columnas que ImportProductsModal). Productos con variantes
 *     emiten 1 fila por variante con campos del padre solo en la primera fila.
 *   - generateProductsExcel: reporte detallado con jerarquía de categorías
 *     y estadísticas (Resumen, Productos, Categorías).
 *   - exportProductsForRappi: archivo simple para Self Mapping de Rappi.
 *
 * Toda la presentación se delega a excelStyles.
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

// =================== HELPERS COMUNES ===================

const safeNum = (val) => {
  if (val === undefined || val === null || val === '') return ''
  const n = Number(val)
  return isNaN(n) ? '' : n
}

const formatYmd = (val) => {
  if (!val) return ''
  let d
  if (val?.toDate) d = val.toDate()
  else if (val instanceof Date) d = val
  else d = new Date(val)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const yn = (v) => v ? 'SI' : 'NO'

const getTaxAffectationText = (taxAffectation) => {
  switch (taxAffectation) {
    case '20': return 'EXONERADO'
    case '30': return 'INAFECTO'
    default: return 'GRAVADO'
  }
}

// =================== 1. PLANTILLA PARA IMPORTAR ===================

/**
 * Exporta productos en formato compatible con el importador. El archivo se
 * puede reimportar sin cambios — usa los mismos nombres y orden de columnas
 * que ImportProductsModal espera.
 *
 * Productos con variantes: una fila por variante. El padre (sin variantes)
 * usa la primera fila para los campos compartidos; las variantes posteriores
 * solo llenan SKU/precio/stock de la variante.
 */
export const exportProductsForImport = async (products, categories, businessMode = 'retail') => {
  const getCategoryAndSubcategory = (categoryId) => {
    if (!categoryId) return { categoria: '', subcategoria: '' }
    const category = categories.find(cat => cat.id === categoryId)
    if (!category) return { categoria: '', subcategoria: '' }
    if (category.parentId) {
      const parent = categories.find(cat => cat.id === category.parentId)
      return { categoria: parent ? parent.name : '', subcategoria: category.name }
    }
    return { categoria: category.name, subcategoria: '' }
  }

  // Headers (mismo orden que ImportProductsModal). Pharmacy agrega 8 columnas.
  const baseHeaders = ['sku', 'codigo_barras', 'nombre', 'descripcion', 'marca', 'categoria', 'subcategoria', 'unidad']
  const pharmacyHeaders = businessMode === 'pharmacy'
    ? ['nombre_generico', 'concentracion', 'presentacion', 'laboratorio', 'principio_activo', 'accion_terapeutica', 'condicion_venta', 'registro_sanitario']
    : []
  const restHeaders = [
    'costo', 'precio', 'precio2', 'precio3', 'precio4',
    'stock', 'trackStock', 'permitir_decimales',
    'control_vencimiento', 'fecha_vencimiento', 'control_series',
    'mostrar_en_catalogo', 'precio_comparacion', 'imagen_url',
    'peso', 'ubicacion', 'afectacion_igv', 'tasa_igv',
    'presentacion1_nombre', 'presentacion1_cantidad', 'presentacion1_precio',
    'presentacion2_nombre', 'presentacion2_cantidad', 'presentacion2_precio',
    'presentacion3_nombre', 'presentacion3_cantidad', 'presentacion3_precio',
    'variante_atributo', 'variante_valor', 'variante_sku', 'variante_precio', 'variante_stock',
  ]
  const headers = [...baseHeaders, ...pharmacyHeaders, ...restHeaders]
  const totalCols = headers.length

  // Construye las filas de un producto (1 si no tiene variantes, N si las tiene).
  const buildRowsForProduct = (product) => {
    const { categoria, subcategoria } = getCategoryAndSubcategory(product.category)
    const presentations = Array.isArray(product.presentations) ? product.presentations : []
    const p1 = presentations[0] || {}
    const p2 = presentations[1] || {}
    const p3 = presentations[2] || {}

    const pharmacyValues = businessMode === 'pharmacy' ? [
      product.genericName || '',
      product.concentration || '',
      product.presentation || '',
      product.laboratoryName || '',
      product.activeIngredient || '',
      product.therapeuticAction || '',
      product.saleCondition || '',
      product.sanitaryRegistry || '',
    ] : []

    // SIN variantes: una fila completa
    if (!product.hasVariants || !Array.isArray(product.variants) || product.variants.length === 0) {
      return [[
        product.sku || '',
        product.code || '',
        product.name || '',
        product.description || '',
        product.marca || '',
        categoria,
        subcategoria,
        product.unit || 'UNIDAD',
        ...pharmacyValues,
        safeNum(product.cost),
        safeNum(product.price),
        safeNum(product.price2),
        safeNum(product.price3),
        safeNum(product.price4),
        safeNum(product.stock),
        product.trackStock === false ? 'NO' : 'SI',
        yn(product.allowDecimalQuantity),
        yn(product.trackExpiration),
        formatYmd(product.expirationDate),
        yn(product.trackSerials),
        product.catalogVisible === false ? 'NO' : 'SI',
        safeNum(product.catalogComparePrice),
        product.imageUrl || '',
        safeNum(product.weight),
        product.location || '',
        getTaxAffectationText(product.taxAffectation),
        safeNum(product.igvRate),
        p1.name || '', safeNum(p1.factor), safeNum(p1.price),
        p2.name || '', safeNum(p2.factor), safeNum(p2.price),
        p3.name || '', safeNum(p3.factor), safeNum(p3.price),
        '', '', '', '', '',
      ]]
    }

    // CON variantes: una fila por variante
    return product.variants.map((variant, idx) => {
      const isFirst = idx === 0
      const attrs = variant.attributes || {}
      const attrKeys = Object.keys(attrs)
      const attrNames = attrKeys.join(',')
      const attrValues = attrKeys.map(k => attrs[k]).join(',')

      const emptyOrPharma = isFirst ? pharmacyValues : pharmacyValues.map(() => '')

      return [
        '', '', product.name || '', // padre sin SKU/code, nombre siempre
        isFirst ? (product.description || '') : '',
        isFirst ? (product.marca || '') : '',
        isFirst ? categoria : '',
        isFirst ? subcategoria : '',
        isFirst ? (product.unit || 'UNIDAD') : '',
        ...emptyOrPharma,
        isFirst ? safeNum(product.cost) : '',
        '', '', '', '', // precio* no van en padre con variantes
        '', // stock padre vacío
        isFirst ? (product.trackStock === false ? 'NO' : 'SI') : '',
        isFirst ? yn(product.allowDecimalQuantity) : '',
        isFirst ? yn(product.trackExpiration) : '',
        isFirst ? formatYmd(product.expirationDate) : '',
        isFirst ? yn(product.trackSerials) : '',
        isFirst ? (product.catalogVisible === false ? 'NO' : 'SI') : '',
        isFirst ? safeNum(product.catalogComparePrice) : '',
        isFirst ? (product.imageUrl || '') : '',
        isFirst ? safeNum(product.weight) : '',
        isFirst ? (product.location || '') : '',
        isFirst ? getTaxAffectationText(product.taxAffectation) : '',
        isFirst ? safeNum(product.igvRate) : '',
        isFirst ? (p1.name || '') : '', isFirst ? safeNum(p1.factor) : '', isFirst ? safeNum(p1.price) : '',
        isFirst ? (p2.name || '') : '', isFirst ? safeNum(p2.factor) : '', isFirst ? safeNum(p2.price) : '',
        isFirst ? (p3.name || '') : '', isFirst ? safeNum(p3.factor) : '', isFirst ? safeNum(p3.price) : '',
        attrNames, attrValues, variant.sku || '', safeNum(variant.price), safeNum(variant.stock),
      ]
    })
  }

  const dataRows = products.flatMap(buildRowsForProduct)

  // Construir aoa
  const aoa = []
  aoa.push([businessMode === 'pharmacy' ? 'PLANTILLA DE MEDICAMENTOS' : 'PLANTILLA DE PRODUCTOS'])
  aoa.push([])

  const metaStart = aoa.length
  aoa.push(['Fecha de generación:', formatDateLocale(new Date(), 'dd/MM/yyyy HH:mm')])
  aoa.push(['Modo:', businessMode === 'pharmacy' ? 'Farmacia' : 'Retail'])
  aoa.push(['Total filas:', dataRows.length])
  aoa.push(['Total productos:', products.length])
  const metaEnd = aoa.length - 1
  aoa.push([])

  const headerRow = aoa.length
  aoa.push(headers)

  const dataStart = aoa.length
  for (const row of dataRows) aoa.push(row)

  // Worksheet
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Anchos de columna (orden: base + pharmacy si aplica + rest)
  const baseWidths = [18, 16, 35, 40, 15, 20, 20, 10]
  const pharmacyWidths = businessMode === 'pharmacy' ? [18, 14, 14, 18, 22, 18, 14, 16] : []
  const restWidths = [
    10, 10, 10, 10, 10, // costo + precio1..4
    10, 12, 18, // stock + trackStock + permitir_decimales
    18, 16, 14, // control_vencimiento + fecha_vencimiento + control_series
    18, 16, 30, 8, 14, 14, 10, // catálogo + comparación + imagen + peso + ubicación + igv
    18, 16, 12, 18, 16, 12, 18, 16, 12, // 3 presentaciones
    18, 16, 18, 12, 12, // variantes
  ]
  applyColumnWidths(ws, [...baseWidths, ...pharmacyWidths, ...restWidths])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  // Filas de datos (estilo plano sin colores fuertes — es una plantilla editable)
  // Columnas numéricas: costo (idx según modo), precios, stock, peso, igv, presentaciones, variantes.
  const numericKeyTokens = [
    'costo', 'precio', 'precio2', 'precio3', 'precio4', 'stock', 'precio_comparacion',
    'peso', 'tasa_igv',
    'presentacion1_cantidad', 'presentacion1_precio',
    'presentacion2_cantidad', 'presentacion2_precio',
    'presentacion3_cantidad', 'presentacion3_precio',
    'variante_precio', 'variante_stock',
  ]
  const numericCols = headers.reduce((acc, h, idx) => {
    if (numericKeyTokens.includes(h)) acc.push(idx)
    return acc
  }, [])

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataStart + i
    for (let c = 0; c < totalCols; c++) {
      if (numericCols.includes(c)) setStyle(ws, r, c, numberStyle(i))
      else setStyle(ws, r, c, cellStyle(i))
    }
  }
  applyFreezeBelow(ws, headerRow)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, businessMode === 'pharmacy' ? 'Medicamentos' : 'Productos')

  const fileName = buildExcelFileName(
    businessMode === 'pharmacy' ? 'Medicamentos_Exportados' : 'Productos_Exportados'
  )
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Productos exportados (compatible con importación)',
  })
}

// =================== 2. REPORTE DETALLADO ===================

const UNIT_LABELS = {
  UNIDAD: 'Unidad', CAJA: 'Caja', KG: 'Kilogramo',
  LITRO: 'Litro', METRO: 'Metro', HORA: 'Hora', SERVICIO: 'Servicio',
}

/** Reporte de productos con detalle + árbol de categorías + estadísticas. */
export const generateProductsExcel = async (products, categories, businessData, branchLabel = null, warehouseLabel = null) => {
  const wb = XLSX.utils.book_new()

  const getCategoryHierarchy = (categoryId) => {
    if (!categoryId) return 'Sin categoría'
    const hierarchy = []
    let currentId = categoryId
    while (currentId) {
      const category = categories.find(cat => cat.id === currentId)
      if (!category) break
      hierarchy.unshift(category.name)
      currentId = category.parentId
    }
    return hierarchy.length > 0 ? hierarchy.join(' > ') : 'Sin categoría'
  }

  // ============== HOJA 1: PRODUCTOS ==============
  {
    const headers = [
      'SKU', 'Código Barras', 'Nombre', 'Categoría', 'Descripción',
      'Unidad', 'Precio', 'Stock', 'Stock Mín.', 'Estado', 'Creado',
    ]
    const totalCols = headers.length

    const aoa = [['LISTADO DE PRODUCTOS'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      branchLabel: branchLabel || 'Todas',
      warehouseLabel: warehouseLabel || 'Todos',
      totalLabel: 'Total productos',
      totalItems: products.length,
    }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length

    // Estadísticas
    let totalStock = 0
    let totalValue = 0
    let lowStockCount = 0
    let outOfStockCount = 0

    products.forEach(product => {
      const stock = Number(product.stock) || 0
      const price = product.hasVariants && product.variants?.length > 0
        ? (Number(product.variants[0].price) || 0)
        : (Number(product.price) || 0)

      let stockStatus = 'Normal'
      if (stock === 0) {
        stockStatus = 'Sin stock'
        outOfStockCount++
      } else if (product.minStock && stock <= product.minStock) {
        stockStatus = 'Stock bajo'
        lowStockCount++
      }
      totalStock += stock
      totalValue += stock * price

      aoa.push([
        product.sku || '',
        product.code || '',
        product.name || 'N/A',
        getCategoryHierarchy(product.category),
        product.description || '',
        UNIT_LABELS[product.unit] || product.unit || 'Unidad',
        price,
        stock,
        Number(product.minStock) || 0,
        stockStatus,
        product.createdAt?.toDate
          ? formatDateLocale(product.createdAt.toDate(), 'dd/MM/yyyy')
          : 'N/A',
      ])
    })

    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push([
      '', '', '', '', '', 'TOTALES:',
      Number(totalValue.toFixed(2)),
      totalStock,
      '', '', '',
    ])

    aoa.push([])
    const statsStart = aoa.length
    aoa.push(['ESTADÍSTICAS'])
    aoa.push(['Total de productos', products.length])
    aoa.push(['Productos sin stock', outOfStockCount])
    aoa.push(['Productos con stock bajo', lowStockCount])
    aoa.push(['Unidades en stock', totalStock])
    aoa.push(['Valor total del inventario', Number(totalValue.toFixed(2))])
    const statsEnd = aoa.length - 1

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [16, 18, 32, 26, 36, 12, 14, 10, 12, 14, 14])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)

    for (let i = 0; i < products.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, centerStyle(i))
      setStyle(ws, r, 1, centerStyle(i))
      setStyle(ws, r, 2, cellStyle(i))
      setStyle(ws, r, 3, cellStyle(i))
      setStyle(ws, r, 4, cellStyle(i))
      setStyle(ws, r, 5, centerStyle(i))
      setStyle(ws, r, 6, numberStyle(i))
      setStyle(ws, r, 7, intStyle(i))
      setStyle(ws, r, 8, intStyle(i))
      setStyle(ws, r, 9, centerStyle(i))
      setStyle(ws, r, 10, centerStyle(i))
    }
    // Fila de totales
    for (let c = 0; c <= 5; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)
    setStyle(ws, totalRowIdx, 6, totalNumberStyle)
    setStyle(ws, totalRowIdx, 7, { ...totalNumberStyle, numFmt: '#,##0' })
    for (let c = 8; c <= 10; c++) setStyle(ws, totalRowIdx, c, totalLabelStyle)

    // Bloque de estadísticas (subtitle + filas tipo metadata)
    applySubtitleRow(ws, statsStart, totalCols)
    applyMetadataRows(ws, statsStart + 1, statsEnd)
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
  }

  // ============== HOJA 2: CATEGORÍAS ==============
  if (categories && categories.length > 0) {
    const headers = ['Categoría', 'Tipo', 'Productos en Categoría']
    const totalCols = headers.length

    const countProductsInCategory = (categoryId) => {
      let count = products.filter(p => p.category === categoryId).length
      const subcategories = categories.filter(cat => cat.parentId === categoryId)
      subcategories.forEach(sub => {
        count += countProductsInCategory(sub.id)
      })
      return count
    }

    const aoa = [['ESTRUCTURA DE CATEGORÍAS'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(businessData, {
      branchLabel: branchLabel || 'Todas',
      totalLabel: 'Total categorías',
      totalItems: categories.length,
    }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length

    const rootCategories = categories.filter(cat => !cat.parentId)
    const rowKinds = [] // 'root' | 'sub' por fila — para distinguir estilo
    rootCategories.forEach(rootCat => {
      const productCount = countProductsInCategory(rootCat.id)
      aoa.push([rootCat.name, 'Categoría principal', productCount])
      rowKinds.push('root')
      const subcategories = categories.filter(cat => cat.parentId === rootCat.id)
      subcategories.forEach(sub => {
        const subCount = countProductsInCategory(sub.id)
        aoa.push([`  └─ ${sub.name}`, 'Subcategoría', subCount])
        rowKinds.push('sub')
      })
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [36, 20, 22])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < rowKinds.length; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, cellStyle(i))
      setStyle(ws, r, 1, centerStyle(i))
      setStyle(ws, r, 2, intStyle(i))
    }
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Categorías')
  }

  const fileName = buildExcelFileName('Productos')
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Listado de productos',
    subDirectory: 'Productos',
  })
}

// =================== 3. EXPORT PARA SELF MAPPING DE RAPPI ===================

/**
 * Archivo simple con SKUs, nombres y precios para Self Mapping en Rappi.
 * Estructura mínima — el merchant copia/pega valores al Portal Partners.
 */
export const exportProductsForRappi = async (products, categories) => {
  const getCategoryName = (categoryId) => {
    if (!categoryId) return ''
    const category = categories.find(c => c.id === categoryId)
    if (!category) return ''
    if (category.parentId) {
      const parent = categories.find(c => c.id === category.parentId)
      return parent ? `${parent.name} > ${category.name}` : category.name
    }
    return category.name
  }

  const headers = ['SKU', 'Nombre', 'Precio', 'Descripción', 'Categoría']
  const totalCols = headers.length

  const aoa = [['PRODUCTOS PARA SELF MAPPING EN RAPPI'], []]
  const metaStart = aoa.length
  aoa.push(['Fecha de generación:', formatDateLocale(new Date(), 'dd/MM/yyyy HH:mm')])
  aoa.push(['Total productos:', products.length])
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  // Aplanar productos (variantes en filas separadas)
  let totalRows = 0
  for (const product of products) {
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((variant, idx) => {
        aoa.push([
          variant.sku || '',
          idx === 0
            ? `${product.name}${variant.attributes ? ' - ' + Object.values(variant.attributes).join(' / ') : ''}`
            : `${product.name} - ${Object.values(variant.attributes || {}).join(' / ')}`,
          Number(variant.price ?? product.price ?? 0),
          product.description || '',
          getCategoryName(product.categoryId || product.category),
        ])
        totalRows++
      })
    } else {
      aoa.push([
        product.sku || product.code || '',
        product.name || '',
        Number(product.price ?? 0),
        product.description || '',
        getCategoryName(product.categoryId || product.category),
      ])
      totalRows++
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [18, 42, 14, 50, 26])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < totalRows; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    setStyle(ws, r, 2, numberStyle(i))
    setStyle(ws, r, 3, cellStyle(i))
    setStyle(ws, r, 4, cellStyle(i))
  }
  applyFreezeBelow(ws, headerRow)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Productos para Rappi')

  const fileName = buildExcelFileName('Productos_Rappi')
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Productos para Self Mapping en Rappi',
  })
}
