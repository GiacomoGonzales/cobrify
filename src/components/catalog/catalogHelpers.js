// Helpers puros del catálogo público (precios, stock, unidades, horario).
// Extraídos de CatalogoPublico.jsx (F1.1 del plan de rediseño) SIN cambios de
// lógica — solo se agregó `export`. Los usan la página principal, el modal
// de producto y el carrito.

// Helper: nombres de días y verificación de horario
export const DAY_NAMES = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 0: 'Domingo' }
export const DAY_SHORT = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 0: 'Dom' }

// Etiqueta corta y legible para la unidad del producto. Acepta tanto códigos
// SUNAT (NIU, KGM, ...) como nombres legibles legacy (UNIDAD, KG, ...).
export const SHORT_UNIT_LABELS = {
  NIU: 'unid', UNIDAD: 'unid',
  KGM: 'kg', KG: 'kg',
  GRM: 'g', G: 'g',
  LTR: 'L', LITRO: 'L', L: 'L',
  MLT: 'ml', ML: 'ml',
  MTR: 'm', METRO: 'm', M: 'm',
  CMT: 'cm', CM: 'cm',
  BX: 'caja', PK: 'paq', SET: 'set',
}
export const getShortUnitLabel = (unit) => {
  if (!unit) return ''
  return SHORT_UNIT_LABELS[String(unit).toUpperCase()] || String(unit).toLowerCase()
}

// Normaliza texto para búsqueda: minúsculas + sin tildes/acentos (NFD + quita diacríticos).
// Así "Pólo" se encuentra escribiendo "polo" y el buscador no es sensible a acentos.
export const normalizeForSearch = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')

// Formatea cantidad para visualización: enteros sin decimales, decimales
// con hasta 2 dígitos limpios (1 → "1", 1.5 → "1.5", 1.25 → "1.25").
export const formatQty = (n) => {
  const num = Number(n) || 0
  if (Number.isInteger(num)) return String(num)
  return Number(num.toFixed(3)).toString()
}

// Parsea cantidad libre del usuario (acepta "1,5" y "1.5"). Devuelve null si inválido.
export const parseQtyInput = (str) => {
  if (str === null || str === undefined) return null
  const cleaned = String(str).trim().replace(',', '.')
  if (cleaned === '') return null
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
}

export const isBusinessOpen = (businessHours) => {
  if (!businessHours?.enabled) return { open: true, message: '' }
  const now = new Date()
  const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
  const dayOfWeek = peruTime.getDay()
  const currentTime = peruTime.getHours() * 60 + peruTime.getMinutes()
  const dayConfig = businessHours.days?.[dayOfWeek]

  if (!dayConfig?.open) {
    return { open: false, message: `Hoy ${DAY_NAMES[dayOfWeek]} estamos cerrados` }
  }

  const [fromH, fromM] = (dayConfig.from || '09:00').split(':').map(Number)
  const [toH, toM] = (dayConfig.to || '18:00').split(':').map(Number)
  const openMin = fromH * 60 + fromM
  const closeMin = toH * 60 + toM

  if (currentTime < openMin) {
    return { open: false, message: `Abrimos hoy a las ${dayConfig.from}` }
  }
  if (currentTime >= closeMin) {
    return { open: false, message: `Cerramos a las ${dayConfig.to}. ¡Vuelve mañana!` }
  }
  return { open: true, message: `Abierto hasta las ${dayConfig.to}` }
}


// Helper: determinar si un producto está agotado
export const isProductOutOfStock = (product, ignoreStock = false) => {
  if (!product) return false
  if (ignoreStock) return false
  // Productos con trackStock explícitamente desactivado siempre disponibles
  if (product.trackStock === false) return false

  // Producto con variantes: agotado solo si TODAS las variantes están agotadas
  if (product.hasVariants && product.variants?.length > 0) {
    return product.variants.every(v => {
      if (v.warehouseStocks?.length > 0) {
        return v.warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0) <= 0
      }
      if (v.stock !== null && v.stock !== undefined) return v.stock <= 0
      return false // Sin datos de stock = disponible
    })
  }

  // Verificar stock: prioridad warehouseStocks > stock directo
  if (product.warehouseStocks?.length > 0) {
    return product.warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0) <= 0
  }
  if (typeof product.stock === 'number') return product.stock <= 0

  // Sin datos de stock = disponible
  return false
}

// Helper: stock disponible total (suma de warehouseStocks o stock directo).
// Devuelve `null` si el producto/variante no trackea stock (sin tope).
// Soporta opcionalmente una variante específica.
export const getAvailableStock = (product, variant = null) => {
  if (!product) return null
  if (product.trackStock === false) return null
  const source = variant || product
  if (source.warehouseStocks?.length > 0) {
    return source.warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
  }
  if (typeof source.stock === 'number') return source.stock
  return null
}

// Helper: obtener precios disponibles de un producto (mayorista, VIP, etc.)
export const getProductPrices = (product, business) => {
  if (!business?.multiplePricesEnabled) return []
  const defaultLabels = { price1: 'Público', price2: 'Mayorista', price3: 'VIP', price4: 'Especial' }
  const prices = []

  if (product.hasVariants && product.variants?.length > 0) {
    // Para productos con variantes, verificar qué niveles de precio tienen las variantes
    const baseValue = product.basePrice || Math.min(...product.variants.map(v => v.price))
    prices.push({
      key: 'price1',
      value: baseValue,
      label: business.priceLabels?.price1 || defaultLabels.price1
    })
    const hasP2 = product.variants.some(v => v.price2 && v.price2 > 0)
    const hasP3 = product.variants.some(v => v.price3 && v.price3 > 0)
    const hasP4 = product.variants.some(v => v.price4 && v.price4 > 0)
    if (hasP2) {
      const avgP2 = product.variants.reduce((sum, v) => sum + (v.price2 || 0), 0) / product.variants.filter(v => v.price2 > 0).length
      prices.push({ key: 'price2', value: parseFloat(avgP2.toFixed(2)), label: business.priceLabels?.price2 || defaultLabels.price2 })
    }
    if (hasP3) {
      const avgP3 = product.variants.reduce((sum, v) => sum + (v.price3 || 0), 0) / product.variants.filter(v => v.price3 > 0).length
      prices.push({ key: 'price3', value: parseFloat(avgP3.toFixed(2)), label: business.priceLabels?.price3 || defaultLabels.price3 })
    }
    if (hasP4) {
      const avgP4 = product.variants.reduce((sum, v) => sum + (v.price4 || 0), 0) / product.variants.filter(v => v.price4 > 0).length
      prices.push({ key: 'price4', value: parseFloat(avgP4.toFixed(2)), label: business.priceLabels?.price4 || defaultLabels.price4 })
    }
    return prices
  }

  // Producto sin variantes
  const keys = [
    { priceField: 'price', labelKey: 'price1' },
    { priceField: 'price2', labelKey: 'price2' },
    { priceField: 'price3', labelKey: 'price3' },
    { priceField: 'price4', labelKey: 'price4' },
  ]
  keys.forEach(({ priceField, labelKey }) => {
    const value = product[priceField]
    if (value && value > 0) {
      prices.push({
        key: labelKey,
        value,
        label: business.priceLabels?.[labelKey] || defaultLabels[labelKey]
      })
    }
  })
  return prices
}

// Helper: obtener rango de precios min~max (productos con múltiples precios, con o sin variantes)
export const getProductPriceRange = (product, business) => {
  if (!business?.multiplePricesEnabled) return null

  if (product.hasVariants && product.variants?.length > 0) {
    // Rango directo: min y max de todos los precios de todas las variantes
    const allPrices = []
    product.variants.forEach(v => {
      allPrices.push(v.price)
      if (v.price2 && v.price2 > 0) allPrices.push(v.price2)
      if (v.price3 && v.price3 > 0) allPrices.push(v.price3)
      if (v.price4 && v.price4 > 0) allPrices.push(v.price4)
    })
    if (allPrices.length <= 1) return null
    const min = Math.min(...allPrices)
    const max = Math.max(...allPrices)
    if (min === max) return null
    return { min, max }
  }

  // Producto sin variantes
  const prices = getProductPrices(product, business)
  if (prices.length <= 1) return null
  const values = prices.map(p => p.value)
  return { min: Math.min(...values), max: Math.max(...values) }
}

// Helper: obtener precio de variante para un nivel de precio (lectura directa)
export const getVariantPriceForLevel = (variant, product, priceLevel) => {
  if (!priceLevel || priceLevel === 'price1') return variant.price
  const key = priceLevel === 'price2' ? 'price2'
    : priceLevel === 'price3' ? 'price3'
    : priceLevel === 'price4' ? 'price4' : null
  return (key && variant[key]) ? variant[key] : variant.price
}

// Helper: obtener precios disponibles de una variante específica
export const getVariantPrices = (variant, business) => {
  if (!business?.multiplePricesEnabled) return []
  const defaultLabels = { price1: 'Público', price2: 'Mayorista', price3: 'VIP', price4: 'Especial' }
  const prices = [{ key: 'price1', value: variant.price, label: business.priceLabels?.price1 || defaultLabels.price1 }]
  if (variant.price2 && variant.price2 > 0) {
    prices.push({ key: 'price2', value: variant.price2, label: business.priceLabels?.price2 || defaultLabels.price2 })
  }
  if (variant.price3 && variant.price3 > 0) {
    prices.push({ key: 'price3', value: variant.price3, label: business.priceLabels?.price3 || defaultLabels.price3 })
  }
  if (variant.price4 && variant.price4 > 0) {
    prices.push({ key: 'price4', value: variant.price4, label: business.priceLabels?.price4 || defaultLabels.price4 })
  }
  return prices
}
