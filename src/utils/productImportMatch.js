/**
 * Cómo el importador de Excel decide si una fila actualiza un producto existente
 * o crea uno nuevo.
 *
 * Vive aparte porque lo usan dos sitios: el importador real (Products.jsx) y la
 * vista previa del modal, que le anticipa al usuario cuántos se van a crear. Si
 * cada uno tuviera su propia copia, la previsualización podría prometer una cosa
 * y la importación hacer otra.
 *
 * El orden importa: SKU manda sobre código de barras, y este sobre el nombre.
 */

const key = (v) => String(v ?? '').toLowerCase().trim()

/**
 * Índices de búsqueda de los productos que ya tiene el negocio.
 */
export const buildProductIndex = (existingProducts = []) => {
  const bySku = new Map()
  const byCode = new Map()
  const byName = new Map()
  for (const p of existingProducts) {
    if (p?.sku) bySku.set(key(p.sku), p)
    if (p?.code) byCode.set(key(p.code), p)
    if (p?.name) byName.set(key(p.name), p)
  }
  return { bySku, byCode, byName }
}

/**
 * Agrega un producto recién creado a los índices, para que una fila posterior
 * del mismo archivo que repita su SKU/código/nombre lo actualice en vez de
 * crear otro duplicado.
 */
export const indexProduct = (index, product) => {
  if (!index || !product) return
  if (product.sku) index.bySku.set(key(product.sku), product)
  if (product.code) index.byCode.set(key(product.code), product)
  if (product.name) index.byName.set(key(product.name), product)
}

/**
 * Producto existente que corresponde a una fila del Excel, o null si es nuevo.
 */
export const findExistingProduct = (index, row) => {
  if (!index || !row) return null
  if (row.sku) {
    const m = index.bySku.get(key(row.sku))
    if (m) return m
  }
  if (row.code) {
    const m = index.byCode.get(key(row.code))
    if (m) return m
  }
  if (row.name) {
    const m = index.byName.get(key(row.name))
    if (m) return m
  }
  return null
}

/**
 * Resumen para la confirmación previa: cuántas filas actualizan y cuántas crean.
 *
 * `matchByRow` mapea el índice de la fila al producto existente, para poder
 * marcar fila por fila en la vista previa cuál es nueva.
 *
 * Va indexando las filas nuevas conforme avanza, igual que el importador: si el
 * Excel trae dos veces el mismo producto, la segunda actualiza a la primera y se
 * cuenta como actualización, no como una creación más.
 */
export const summarizeImport = (existingProducts = [], rows = []) => {
  const index = buildProductIndex(existingProducts)
  const matchByRow = new Map()
  let toUpdate = 0
  rows.forEach((row, i) => {
    const match = findExistingProduct(index, row)
    if (match) {
      matchByRow.set(i, match)
      toUpdate++
    } else {
      indexProduct(index, row)
    }
  })
  return {
    index,
    matchByRow,
    toUpdate,
    toCreate: rows.length - toUpdate,
    total: rows.length,
  }
}
