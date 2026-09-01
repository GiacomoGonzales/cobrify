import { buildSearchHaystack } from '@/lib/utils'

/**
 * Texto buscable de un PRODUCTO — criterio único para todos los buscadores del
 * sistema (POS, Productos, Inventario, Compras, Cotizaciones, Salidas,
 * Devoluciones, Recuento).
 *
 * Antes cada pantalla armaba su propia lista de campos y ninguna coincidía: el
 * POS no encontraba por categoría ni descripción, Compras indexaba el ID de la
 * categoría (`cat-3`) en vez de su nombre, Salidas y Devoluciones ni siquiera
 * quitaban tildes (buscar "cafe" no encontraba "Café") y el principio activo no
 * se podía buscar en ninguna. Un solo builder evita que vuelvan a divergir.
 *
 * Incluye, además de lo obvio: códigos SIN guiones (las pistolas lectoras los
 * omiten), códigos alternativos `barcodes[]`, y los datos de cada variante
 * (SKU, código y valores de atributo) para que "polo rojo xl" caiga en el
 * producto padre aunque el color y la talla vivan en la variante.
 *
 * @param {object} product
 * @param {object} [opts]
 * @param {Array}  [opts.categories] Lista de categorías para resolver el ID a nombre
 * @param {Function} [opts.getCategoryName] (categoryId) => nombre; alternativa a `categories`
 * @returns {string} haystack normalizado (minúsculas, sin tildes)
 */
export function buildProductHaystack(product, opts = {}) {
  if (!product) return ''
  const sinGuiones = (v) => String(v || '').replace(/-/g, '')

  const code = product.code || ''
  const sku = product.sku || ''

  // Categoría: el producto guarda el ID; buscar por "gaseosas" exige el NOMBRE
  let categoryName = ''
  const rawCat = product.category || ''
  if (rawCat) {
    if (typeof opts.getCategoryName === 'function') {
      categoryName = opts.getCategoryName(rawCat) || ''
    } else if (Array.isArray(opts.categories)) {
      categoryName = opts.categories.find(c => c?.id === rawCat)?.name || ''
    }
    // Categorías legacy en texto libre: el propio valor ya es el nombre
    if (!categoryName && !/^cat[-_]/i.test(rawCat)) categoryName = rawCat
  }

  const extraCodes = Array.isArray(product.barcodes)
    ? product.barcodes.flatMap(b => [b, sinGuiones(b)])
    : []

  const variantTokens = (product.hasVariants && Array.isArray(product.variants))
    ? product.variants.flatMap(v => v ? [
        v.sku,
        sinGuiones(v.sku),
        v.barcode,
        sinGuiones(v.barcode),
        ...Object.values(v.attributes || {}),
      ] : [])
    : []

  const presentationTokens = Array.isArray(product.presentations)
    ? product.presentations.map(p => p?.name)
    : []

  // Números de serie DISPONIBLES: quien vende motos, celulares o electro
  // busca la unidad por su serie (o por los últimos dígitos del motor/IMEI).
  // Solo las disponibles: una serie vendida ya no debe traer el producto al
  // teclearla en el POS (reporte 18-ago-2026: motos buscadas por los últimos
  // 4 dígitos del motor no aparecían).
  const serialTokens = Array.isArray(product.serials)
    ? product.serials.flatMap(sn => (sn && sn.status === 'available' && sn.serialNumber)
        ? [sn.serialNumber, sinGuiones(sn.serialNumber), sn.serialNumber2, sinGuiones(sn.serialNumber2)]
        : [])
    : []

  return buildSearchHaystack(
    product.name,
    product.description,
    code,
    sinGuiones(code),
    sku,
    sinGuiones(sku),
    categoryName,
    product.marca,
    product.brandName,
    // Farmacia / veterinaria
    product.genericName,
    product.activeIngredient,
    product.therapeuticAction,
    product.concentration,
    product.presentation,
    product.laboratoryName,
    product.sanitaryRegistry,
    // Ubicación en estante: se usa para mandar a alguien a buscar el producto
    product.location,
    // Material de uso interno: buscar "uso interno" en Productos o Inventario
    // los junta a todos, que es como el dueño los revisa.
    product.soloUsoInterno === true ? 'uso interno' : '',
    ...extraCodes,
    ...variantTokens,
    ...presentationTokens,
    ...serialTokens,
  )
}

/**
 * Texto buscable de un INSUMO (ingrediente). Mucho más simple que el producto:
 * no tiene códigos ni variantes.
 */
export function buildIngredientHaystack(ingredient) {
  if (!ingredient) return ''
  return buildSearchHaystack(
    ingredient.name,
    ingredient.code,
    ingredient.category,
    ingredient.purchaseUnit,
    ingredient.location,
  )
}
