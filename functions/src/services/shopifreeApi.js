/**
 * Cliente HTTP y mapper para la integración con Shopifree (tienda online externa).
 *
 * Spec: https://shopifree.app/api/v1
 * Auth: header `Authorization: Bearer sfk_<64 hex>`
 *
 * Este módulo expone:
 *   - postProductsBulk(apiKey, productsArray)    → POST /products (max 200 items)
 *   - deleteProductByExternalId(apiKey, extId)   → DELETE /products?externalId=...
 *   - getOrders(apiKey, { since, status, limit }) → GET /orders
 *   - syncOrder(apiKey, orderId, externalInvoiceId) → POST /orders { action: sync }
 *   - mapCobrifyProductToShopifree(product, opts) → traduce el shape interno
 *     de Cobrify al payload que acepta POST /products.
 *
 * Decisiones de diseño:
 *   - Productos con variantes: Fase 1 los pushea como "master flatten" sin
 *     variantes (Shopifree v1 no soporta variantes en la API). En una fase
 *     posterior se puede flattenar cada combinación como producto separado.
 *   - Stock: Shopifree solo tiene un campo stock plano. Sumamos warehouseStocks
 *     o caemos al campo `stock` del producto.
 *   - categoryName: Shopifree hace find-or-create por nombre. Si no podemos
 *     resolver el nombre desde categoryId, omitimos el campo (queda "Sin categoría").
 *   - active: respetamos isActive !== false. Si el producto está oculto del
 *     catálogo público (catalogVisible === false), también lo marcamos inactive.
 */
import axios from 'axios'

const SHOPIFREE_API_BASE = 'https://shopifree.app/api/v1'
const MAX_PRODUCTS_PER_REQUEST = 200
const REQUEST_TIMEOUT_MS = 30_000

// =====================================================
// HTTP CLIENT
// =====================================================

const buildClient = (apiKey) => axios.create({
  baseURL: SHOPIFREE_API_BASE,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
})

/**
 * POST /products — upsert en lote (max 200 items por request).
 * Si recibís más, hacé chunks fuera.
 *
 * @param {string} apiKey
 * @param {Array<object>} products - cada item con shape de mapCobrifyProductToShopifree
 * @returns {Promise<{ created:number, updated:number, errors:Array }>}
 */
export const postProductsBulk = async (apiKey, products) => {
  if (!Array.isArray(products) || products.length === 0) {
    return { created: 0, updated: 0, errors: [] }
  }
  if (products.length > MAX_PRODUCTS_PER_REQUEST) {
    throw new Error(`Shopifree acepta máximo ${MAX_PRODUCTS_PER_REQUEST} productos por request`)
  }
  const client = buildClient(apiKey)
  const response = await client.post('/products', { products })
  return response.data
}

/**
 * DELETE /products?externalId=...
 *
 * @returns {Promise<{ deleted: boolean }>}
 * @throws si status !== 200/404 (404 lo tragamos como "ya no existía").
 */
export const deleteProductByExternalId = async (apiKey, externalId) => {
  if (!externalId) throw new Error('externalId requerido')
  const client = buildClient(apiKey)
  try {
    const response = await client.delete('/products', {
      params: { externalId },
    })
    return response.data
  } catch (err) {
    if (err.response?.status === 404) {
      return { deleted: false, notFound: true }
    }
    throw err
  }
}

/**
 * GET /orders?since=...&status=...&limit=...
 *
 * @param {string} apiKey
 * @param {object} [opts]
 * @param {string} [opts.since] - ISO-8601, filtra por createdAt >= since
 * @param {string} [opts.status] - pending|confirmed|preparing|ready|delivered|cancelled
 * @param {number} [opts.limit] - max 500, default 100
 * @returns {Promise<{ orders: Array, count: number }>}
 */
export const getOrders = async (apiKey, opts = {}) => {
  const client = buildClient(apiKey)
  const params = {}
  if (opts.since) params.since = opts.since
  if (opts.status) params.status = opts.status
  if (opts.limit) params.limit = opts.limit
  const response = await client.get('/orders', { params })
  return response.data
}

/**
 * POST /orders body: { action: "sync", orderId, externalInvoiceId }
 * Marca un pedido como sincronizado con un invoice ID externo.
 * Idempotente: si llamás dos veces, el segundo invoice gana.
 */
export const syncOrder = async (apiKey, orderId, externalInvoiceId) => {
  if (!orderId || !externalInvoiceId) {
    throw new Error('orderId y externalInvoiceId requeridos')
  }
  const client = buildClient(apiKey)
  const response = await client.post('/orders', {
    action: 'sync',
    orderId,
    externalInvoiceId,
  })
  return response.data
}

// =====================================================
// MAPPER: Producto Cobrify → Producto Shopifree
// =====================================================

/**
 * Suma el stock total de un producto Cobrify desde warehouseStocks[],
 * cayendo al campo `stock` si no hay warehouseStocks.
 */
const computeTotalStock = (product) => {
  const ws = Array.isArray(product.warehouseStocks) ? product.warehouseStocks : []
  if (ws.length > 0) {
    return ws.reduce((sum, w) => sum + (Number(w.stock) || 0), 0)
  }
  const direct = Number(product.stock)
  return Number.isFinite(direct) ? direct : 0
}

/**
 * Construye el array `images` desde el producto Cobrify.
 * Prioriza imageUrls[] (multi-imagen nuevo), cae a imageUrl (legacy single).
 */
const buildImages = (product) => {
  if (Array.isArray(product.imageUrls) && product.imageUrls.length > 0) {
    return product.imageUrls.filter(Boolean)
  }
  if (product.imageUrl) return [product.imageUrl]
  return []
}

/**
 * Resuelve el precio "público" de un producto. Para productos con variantes
 * (que Shopifree v1 no soporta), usamos basePrice o el primer variant price.
 */
const resolvePrice = (product) => {
  if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
    const firstWithPrice = product.variants.find(v => Number(v.price) > 0)
    if (firstWithPrice) return Number(firstWithPrice.price)
    if (Number(product.basePrice) > 0) return Number(product.basePrice)
  }
  return Number(product.price) || 0
}

/**
 * Determina si el producto debe estar `active` en Shopifree.
 * Reglas:
 *  - isActive === false → inactive
 *  - catalogVisible === false → inactive (oculto del catálogo público de Cobrify)
 *  - default: active
 */
const isActiveForShopifree = (product) => {
  if (product.isActive === false) return false
  if (product.catalogVisible === false) return false
  return true
}

/**
 * Mapea un producto Cobrify al payload que acepta POST /products de Shopifree.
 *
 * @param {string} productId - el doc ID de Firestore (sirve como externalId)
 * @param {object} product - data del documento
 * @param {object} [ctx] - contexto opcional para resolver referencias
 * @param {Map<string,string>} [ctx.categoryMap] - { categoryId → categoryName }
 * @returns {object|null} - payload listo para Shopifree, o null si no se debe pushear
 */
export const mapCobrifyProductToShopifree = (productId, product, ctx = {}) => {
  if (!productId || !product) return null

  const payload = {
    externalId: productId,
    name: product.name || '',
    price: resolvePrice(product),
    active: isActiveForShopifree(product),
  }

  // Opcionales
  if (product.sku) payload.sku = product.sku
  if (product.description) payload.description = product.description

  if (product.trackStock !== false) {
    payload.trackStock = true
    payload.stock = computeTotalStock(product)
  } else {
    payload.trackStock = false
  }

  const comparePrice = Number(product.catalogComparePrice)
  if (Number.isFinite(comparePrice) && comparePrice > 0) {
    payload.comparePrice = comparePrice
  }

  const images = buildImages(product)
  if (images.length > 0) payload.images = images

  // Categoría: necesitamos el NOMBRE, no el ID. ctx.categoryMap resuelve.
  if (product.category && ctx.categoryMap) {
    const catName = ctx.categoryMap.get(product.category)
    if (catName) payload.categoryName = catName
  }

  if (product.marca) payload.brand = product.marca

  return payload
}

/**
 * Helper: lista de campos relevantes para detectar cambios "reales" (evita
 * disparar la sincronización en cambios irrelevantes como `updatedAt`).
 *
 * Si después de filtrar por estos campos el `before` y el `after` son
 * idénticos, no hay nada que sincronizar.
 */
export const RELEVANT_PRODUCT_FIELDS = [
  'name', 'price', 'sku', 'description', 'stock', 'warehouseStocks',
  'trackStock', 'catalogComparePrice', 'imageUrl', 'imageUrls',
  'category', 'marca', 'isActive', 'catalogVisible',
  'hasVariants', 'variants', 'basePrice',
]

export const hasRelevantProductChange = (before, after) => {
  if (!before && after) return true  // create
  if (before && !after) return true  // delete
  if (!before && !after) return false
  for (const field of RELEVANT_PRODUCT_FIELDS) {
    const a = before?.[field]
    const b = after?.[field]
    // Comparar via JSON.stringify para arrays/objetos (warehouseStocks, imageUrls, variants)
    if (JSON.stringify(a) !== JSON.stringify(b)) return true
  }
  return false
}
