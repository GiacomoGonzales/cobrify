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

/**
 * Una fila por producto — salvo que tenga variantes, y ahí una por variante.
 *
 * Cada variante trae su propio SKU, su código, su precio y su stock. Antes el
 * reporte mostraba una sola fila por producto, con el precio de la PRIMERA
 * variante y el stock del padre: los colores no salían por ningún lado.
 *
 * Devuelve también la variante cruda, porque la hoja de almacenes necesita
 * leerle `warehouseStocks`.
 */
const filasDeProducto = (product) => {
  // Igual que en la plantilla de importación: manda el array, no la bandera.
  const variantes = Array.isArray(product?.variants) ? product.variants : []

  const codigoDelPadre = [
    product?.code || '',
    ...(Array.isArray(product?.barcodes) ? product.barcodes : []),
  ].filter(Boolean).join('|')

  if (variantes.length === 0) {
    return [{
      producto: product,
      variante: null,
      sku: product?.sku || '',
      codigo: codigoDelPadre,
      nombre: product?.name || 'N/A',
      precio: Number(product?.price) || 0,
      stock: Number(product?.stock) || 0,
      warehouseStocks: product?.warehouseStocks || [],
    }]
  }

  return variantes.map((v) => {
    const etiqueta = Object.values(v?.attributes || {}).filter(Boolean).join(' / ')
    const base = product?.name || 'N/A'
    return {
      producto: product,
      variante: v,
      // El SKU de la variante es el específico; sin él, el del padre.
      sku: v?.sku || product?.sku || '',
      codigo: v?.barcode || codigoDelPadre,
      nombre: etiqueta ? (base + ' - ' + etiqueta) : base,
      precio: Number(v?.price ?? product?.price) || 0,
      stock: Number(v?.stock) || 0,
      warehouseStocks: v?.warehouseStocks || [],
    }
  })
}

/** Todas las filas de una lista de productos, con las variantes ya abiertas. */
const filasDeProductos = (products = []) => products.flatMap(filasDeProducto)


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
    'costo', 'fecha_compra', 'precio', 'precio_usd', 'precio2', 'precio3', 'precio4',
    'stock', 'stock_minimo', 'trackStock', 'permitir_decimales',
    'control_vencimiento', 'fecha_vencimiento', 'numero_lote', 'control_series',
    'mostrar_en_catalogo', 'precio_comparacion', 'imagen_url',
    'peso', 'ubicacion', 'afectacion_igv', 'tasa_igv',
    'presentacion1_nombre', 'presentacion1_cantidad', 'presentacion1_precio',
    'presentacion2_nombre', 'presentacion2_cantidad', 'presentacion2_precio',
    'presentacion3_nombre', 'presentacion3_cantidad', 'presentacion3_precio',
    'variante_atributo', 'variante_valor', 'variante_sku', 'variante_precio', 'variante_stock', 'variante_imagen',
  ]
  const headers = [...baseHeaders, ...pharmacyHeaders, ...restHeaders]
  const totalCols = headers.length

  // Construye las filas de un producto.
  //   - Sin variantes y sin lotes (o 1 solo lote): 1 fila
  //   - Sin variantes y con N lotes en batches[]: N filas (1 por lote, compatible
  //     con la agrupación por lotes del importador)
  //   - Con variantes: N filas (1 por variante), lotes se mantienen a nivel raíz
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

    // Concatena código principal + códigos alternativos con "|" (formato que
    // entiende ImportProductsModal en roundtrip).
    const codeColumn = [
      product.code || '',
      ...(Array.isArray(product.barcodes) ? product.barcodes : []),
    ].filter(Boolean).join('|')

    // SIN variantes.
    //
    // Manda el ARRAY, no la bandera `hasVariants`: la escriben varios
    // caminos —la ficha, la importación masiva, la API— y basta que uno la
    // deje sin poner para que el producto tenga tallas de verdad y el Excel
    // salga con una sola fila (reporte de WAQTA, 02-sep-2026). Para exportar,
    // la bandera no agrega nada que el array no diga.
    if (!Array.isArray(product.variants) || product.variants.length === 0) {
      const batches = Array.isArray(product.batches) ? product.batches.filter(b => b) : []

      // Caso A: múltiples lotes → una fila por lote.
      // Cada fila lleva TODOS los campos del producto repetidos; lo único que
      // cambia entre filas es la cantidad, el vencimiento y el número de lote.
      // Al reimportar, ImportProductsModal fusiona por SKU, suma las cantidades
      // y reconstruye batches[].
      if (batches.length > 1) {
        return batches.map((batch) => {
          const batchQty = safeNum(batch.quantity ?? batch.stock)
          const batchLote = batch.batchNumber || ''
          const batchExp = formatYmd(batch.expirationDate)
          // Los compartidos, en TODAS las filas — mismo criterio que la rama de
          // variantes. Lo único por fila es lo del lote: su cantidad, su
          // vencimiento y su número. El importador suma las cantidades y toma
          // los demás campos de la primera fila, así que repetirlos no molesta.
          return [
            product.sku || '',
            codeColumn,
            product.name || '',
            product.description || '',
            product.marca || '',
            categoria,
            subcategoria,
            product.unit || 'UNIDAD',
            ...pharmacyValues,
            safeNum(product.cost),
            formatYmd(product.lastPurchaseDate),
            safeNum(product.price),
            // Ancla en dolares, con el MISMO nombre de columna que lee el
            // importador: exportar -> editar -> reimportar no debe perderlo.
            safeNum(product.priceUSD),
            safeNum(product.price2),
            safeNum(product.price3),
            safeNum(product.price4),
            batchQty,
            safeNum(product.minStock),
            product.trackStock === false ? 'NO' : 'SI',
            yn(product.allowDecimalQuantity),
            'SI', // control_vencimiento siempre SI cuando hay lotes
            batchExp,
            batchLote,
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
            '', '', '', '', '', '',
          ]
        })
      }

      // Caso B: 0 o 1 lote → una fila
      const singleBatch = batches[0] || {}
      const loteFinal = singleBatch.batchNumber || product.batchNumber || ''
      const expFinal = formatYmd(singleBatch.expirationDate || product.expirationDate)

      return [[
        product.sku || '',
        codeColumn,
        product.name || '',
        product.description || '',
        product.marca || '',
        categoria,
        subcategoria,
        product.unit || 'UNIDAD',
        ...pharmacyValues,
        safeNum(product.cost),
        formatYmd(product.lastPurchaseDate),
        safeNum(product.price),
        safeNum(product.priceUSD),
        safeNum(product.price2),
        safeNum(product.price3),
        safeNum(product.price4),
        safeNum(product.stock),
        safeNum(product.minStock),
        product.trackStock === false ? 'NO' : 'SI',
        yn(product.allowDecimalQuantity),
        yn(product.trackExpiration),
        expFinal,
        loteFinal,
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
        '', '', '', '', '', '',
      ]]
    }

    // CON variantes: una fila por variante (los lotes solo en el raíz, fila 1)
    return product.variants.map((variant) => {
      const attrs = variant.attributes || {}
      const attrKeys = Object.keys(attrs)
      const attrNames = attrKeys.join(',')
      const attrValues = attrKeys.map(k => attrs[k]).join(',')

      // Los datos compartidos van en TODAS las filas, no solo en la primera.
      //
      // Dejar en blanco lo repetido es una convención de impresión, no de
      // datos: en un Excel que se filtra, se ordena o va a una tabla dinámica,
      // cada fila tiene que valerse sola. Filtrando por marca salía UNA talla
      // por modelo, porque el resto de las filas tenían la marca vacía
      // (reporte de WAQTA, 02-sep-2026).
      //
      // No rompe la reimportación: el importador agrupa las filas por nombre y
      // conserva los campos del PRIMER producto encontrado, así que los
      // valores repetidos de las siguientes los ignora.

      return [
        '', '', product.name || '', // padre sin SKU/code, nombre siempre
        product.description || '',
        product.marca || '',
        categoria,
        subcategoria,
        product.unit || 'UNIDAD',
        ...pharmacyValues,
        safeNum(product.cost),
        formatYmd(product.lastPurchaseDate),
        // CINCO columnas: precio, precio_usd, precio2, precio3, precio4.
        // Eran cuatro —faltaba precio_usd, que se sumó a la cabecera y no
        // acá— y TODO lo que venía después salía corrido una columna: el
        // atributo de la variante caía en presentacion3_precio, el color en
        // variante_atributo, el SKU en variante_valor... Reimportar ese Excel
        // metía los datos en los campos equivocados.
        //
        // Estas dos SÍ quedan vacías a propósito: en un producto con variantes
        // el precio y el stock viven en `variante_precio` / `variante_stock`.
        // Repetir acá el del padre sería un dato falso.
        '', '', '', '', '', // precio* no van en padre con variantes
        '', // stock padre vacío
        safeNum(product.minStock), // stock_minimo
        product.trackStock === false ? 'NO' : 'SI',
        yn(product.allowDecimalQuantity),
        yn(product.trackExpiration),
        formatYmd(product.expirationDate),
        product.batchNumber || '', // numero_lote
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
        attrNames, attrValues, variant.sku || '', safeNum(variant.price), safeNum(variant.stock),
        // Foto de la variante. Sale para que exportar -> editar -> reimportar
        // no la pierda; el importador lee esta misma columna.
        variant.imageUrl || '',
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
    10, 14, 10, 12, 10, 10, 10, // costo + fecha_compra + precio + precio_usd + precio2..4
    10, 12, 12, 18, // stock + stock_minimo + trackStock + permitir_decimales
    18, 16, 14, 14, // control_vencimiento + fecha_vencimiento + numero_lote + control_series
    18, 16, 30, 8, 14, 14, 10, // catálogo + comparación + imagen + peso + ubicación + igv
    18, 16, 12, 18, 16, 12, 18, 16, 12, // 3 presentaciones
    18, 16, 18, 12, 12, 30, // variantes (+ imagen)
  ]
  applyColumnWidths(ws, [...baseWidths, ...pharmacyWidths, ...restWidths])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  // Filas de datos (estilo plano sin colores fuertes — es una plantilla editable)
  // Columnas numéricas: costo (idx según modo), precios, stock, peso, igv, presentaciones, variantes.
  const numericKeyTokens = [
    'costo', 'precio', 'precio_usd', 'precio2', 'precio3', 'precio4', 'stock', 'stock_minimo', 'precio_comparacion',
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
export const generateProductsExcel = async (products, categories, businessData, branchLabel = null, warehouseLabel = null, brands = [], warehouses = []) => {
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

    // Una fila por variante: el producto de cinco colores sale con sus cinco
    // filas, cada una con su SKU, su precio y su stock.
    const filas = filasDeProductos(products)
    filas.forEach(f => {
      const product = f.producto
      const stock = f.stock
      const price = f.precio

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
        f.sku,
        f.codigo,
        f.nombre,
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
    // Con variantes hay más líneas que productos; sin este número, el
    // "Total de productos" no cuadra con lo que se ve en la hoja.
    if (filas.length !== products.length) {
      aoa.push(['Líneas listadas (con variantes)', filas.length])
    }
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

  // ============== HOJAS EXTRA DE ANALÍTICA ==============
  appendStockByWarehouseSheet(wb, products, warehouses, businessData)
  appendProductsByBrandSheet(wb, products, brands, businessData)
  appendValueByCategorySheet(wb, products, categories, businessData)

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

// =================== HOJAS EXTRA DE ANALÍTICA ===================

/** Hoja "Stock por Almacén" — matriz Producto × Almacén. */
function appendStockByWarehouseSheet(wb, products, warehouses, businessData) {
  if (!warehouses || warehouses.length === 0) return
  if (!products || products.length === 0) return

  const headers = ['SKU', 'Producto', ...warehouses.map(w => w.name), 'Total']
  const totalCols = headers.length

  const aoa = [['STOCK POR ALMACÉN'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total productos',
    totalItems: products.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const stockPerWarehouse = warehouses.map(() => 0)
  let totalUnits = 0

  // Una fila por variante. Sumadas en una sola fila se veía cuánto hay en cada
  // almacén pero no DE QUÉ color, que es lo que uno viene a buscar acá.
  filasDeProductos(products).forEach(f => {
    const p = f.producto
    if (p.trackStock === false) return
    const row = [f.sku, f.nombre]
    let productTotal = 0
    warehouses.forEach((w, wIdx) => {
      const ws = (f.warehouseStocks || []).find(s => s.warehouseId === w.id)
      const stock = ws?.stock || 0
      row.push(Number(stock))
      productTotal += stock
      stockPerWarehouse[wIdx] += stock
    })
    row.push(Number(productTotal))
    totalUnits += productTotal
    aoa.push(row)
  })

  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['', 'TOTALES', ...stockPerWarehouse.map(s => Number(s)), Number(totalUnits)])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [16, 32, ...warehouses.map(() => 14), 14])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  const dataRowCount = products.filter(p => p.trackStock !== false).length
  for (let i = 0; i < dataRowCount; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, centerStyle(i))
    setStyle(ws, r, 1, cellStyle(i))
    for (let c = 2; c < totalCols - 1; c++) setStyle(ws, r, c, intStyle(i))
    setStyle(ws, r, totalCols - 1, { ...intStyle(i), font: { ...intStyle(i).font, bold: true } })
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, totalLabelStyle)
  for (let c = 2; c < totalCols; c++) {
    setStyle(ws, totalRowIdx, c, { ...totalNumberStyle, numFmt: '#,##0' })
  }
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Stock por Almacén')
}

/** Hoja "Por Marca" — agrupación de productos por brandId. */
function appendProductsByBrandSheet(wb, products, brands, businessData) {
  if (!brands || brands.length === 0) return
  if (!products || products.length === 0) return

  const brandMap = new Map(brands.map(b => [b.id, b.name]))
  const agg = new Map()
  for (const p of products) {
    const key = p.brandId && brandMap.has(p.brandId) ? p.brandId : '__NO_BRAND__'
    const name = p.brandId && brandMap.has(p.brandId) ? brandMap.get(p.brandId) : 'Sin marca'
    const stock = Number(p.stock) || 0
    const price = p.hasVariants && p.variants?.length > 0 ? (Number(p.variants[0].price) || 0) : (Number(p.price) || 0)
    if (!agg.has(key)) {
      agg.set(key, { name, count: 0, totalStock: 0, totalValue: 0 })
    }
    const e = agg.get(key)
    e.count += 1
    e.totalStock += stock
    e.totalValue += stock * price
  }

  const rows = [...agg.values()].sort((a, b) => b.totalValue - a.totalValue)
  if (rows.length === 0) return

  const headers = ['Marca', '# Productos', 'Stock Total', 'Valor Total', '% Valor']
  const totalCols = headers.length

  const aoa = [['PRODUCTOS POR MARCA'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    totalLabel: 'Total marcas',
    totalItems: rows.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length

  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0)
  let totalCount = 0, totalStock = 0
  rows.forEach(b => {
    const pct = totalValue > 0 ? (b.totalValue / totalValue) * 100 : 0
    totalCount += b.count
    totalStock += b.totalStock
    aoa.push([
      b.name, b.count,
      Number(b.totalStock),
      Number(b.totalValue.toFixed(2)),
      Number(pct.toFixed(1)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push(['TOTALES', totalCount, Number(totalStock), Number(totalValue.toFixed(2)), 100])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [30, 14, 14, 16, 12])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Por Marca')
}

/** Hoja "Valor por Categoría" — valor de inventario agregado por categoría. */
function appendValueByCategorySheet(wb, products, categories, businessData) {
  if (!products || products.length === 0) return

  const catMap = new Map((categories || []).map(c => [c.id, c.name]))
  const getCategoryName = (catId) => {
    if (!catId) return 'Sin categoría'
    return catMap.get(catId) || catId
  }

  const agg = new Map()
  for (const p of products) {
    const catName = getCategoryName(p.category)
    const stock = Number(p.stock) || 0
    const price = p.hasVariants && p.variants?.length > 0 ? (Number(p.variants[0].price) || 0) : (Number(p.price) || 0)
    const cost = Number(p.cost) || 0
    if (!agg.has(catName)) {
      agg.set(catName, {
        name: catName, count: 0,
        totalStock: 0, totalValuePrice: 0, totalValueCost: 0,
      })
    }
    const e = agg.get(catName)
    e.count += 1
    e.totalStock += stock
    e.totalValuePrice += stock * price
    e.totalValueCost += stock * cost
  }

  const rows = [...agg.values()].sort((a, b) => b.totalValuePrice - a.totalValuePrice)
  if (rows.length === 0) return

  const headers = ['Categoría', '# Productos', 'Stock Total', 'Valor a Costo', 'Valor a Precio', 'Margen Potencial']
  const totalCols = headers.length

  const aoa = [['VALOR DE INVENTARIO POR CATEGORÍA'], []]
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

  let totalCount = 0, totalStock = 0, totalCost = 0, totalPrice = 0
  rows.forEach(c => {
    const margin = c.totalValuePrice - c.totalValueCost
    totalCount += c.count
    totalStock += c.totalStock
    totalCost += c.totalValueCost
    totalPrice += c.totalValuePrice
    aoa.push([
      c.name, c.count,
      Number(c.totalStock),
      Number(c.totalValueCost.toFixed(2)),
      Number(c.totalValuePrice.toFixed(2)),
      Number(margin.toFixed(2)),
    ])
  })
  aoa.push([])
  const totalRowIdx = aoa.length
  aoa.push([
    'TOTALES', totalCount,
    Number(totalStock),
    Number(totalCost.toFixed(2)),
    Number(totalPrice.toFixed(2)),
    Number((totalPrice - totalCost).toFixed(2)),
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [30, 14, 14, 16, 16, 16])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)
  for (let i = 0; i < rows.length; i++) {
    const r = dataStart + i
    setStyle(ws, r, 0, cellStyle(i))
    setStyle(ws, r, 1, intStyle(i))
    setStyle(ws, r, 2, intStyle(i))
    setStyle(ws, r, 3, numberStyle(i))
    setStyle(ws, r, 4, numberStyle(i))
    setStyle(ws, r, 5, numberStyle(i))
  }
  setStyle(ws, totalRowIdx, 0, totalLabelStyle)
  setStyle(ws, totalRowIdx, 1, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 2, { ...totalNumberStyle, numFmt: '#,##0' })
  setStyle(ws, totalRowIdx, 3, totalNumberStyle)
  setStyle(ws, totalRowIdx, 4, totalNumberStyle)
  setStyle(ws, totalRowIdx, 5, totalNumberStyle)
  applyFreezeBelow(ws, headerRow)
  XLSX.utils.book_append_sheet(wb, ws, 'Valor por Categoría')
}
