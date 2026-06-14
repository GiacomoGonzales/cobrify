/**
 * recipeAvailability.js
 *
 * Calcula qué productos con receta NO tienen insumos suficientes para
 * preparar al menos 1 unidad. Pensado para mostrar un badge "Sin insumos"
 * en la grilla del POS, Mesas y Órdenes del modo restaurante, ANTES de que
 * el mozo arme la venta y se entere al cobrar.
 *
 * Lazy por diseño: la carga se hace UNA vez en background después de pintar
 * la página. Si el negocio no tiene recetas configuradas, no se hace nada
 * (cero overhead para el 80% de las cuentas que no usan insumos).
 *
 * Sólo lectura — no muta nada.
 */
import { collection, getDocs, query, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Lee la primera receta del negocio. Si no hay ninguna, devuelve false sin
 * cargar nada más — el caller usa esto para evitar el resto del trabajo.
 * @param {string} businessId
 * @returns {Promise<boolean>}
 */
export const hasAnyRecipe = async (businessId) => {
  if (!businessId) return false
  try {
    const recipesRef = collection(db, 'businesses', businessId, 'recipes')
    const snap = await getDocs(query(recipesRef, limit(1)))
    return !snap.empty
  } catch (e) {
    console.warn('No se pudo verificar recetas:', e)
    return false
  }
}

/**
 * Devuelve el conjunto de productIds que NO tienen suficientes insumos para
 * preparar AL MENOS 1 unidad. Lee recetas + ingredientes en paralelo y hace
 * todo el cálculo en memoria (sin queries adicionales).
 *
 * @param {string} businessId
 * @param {string|null} warehouseId  Si se especifica, valida contra el stock
 *                                   de ESE almacén (los `warehouseStocks` del
 *                                   ingrediente). Si no, usa `currentStock`.
 * @returns {Promise<Set<string>>} productIds sin insumos suficientes.
 */
export const computeProductsWithoutIngredients = async (businessId, warehouseId = null) => {
  const empty = new Set()
  if (!businessId) return empty
  try {
    const [recipesSnap, ingredientsSnap] = await Promise.all([
      getDocs(collection(db, 'businesses', businessId, 'recipes')),
      getDocs(collection(db, 'businesses', businessId, 'ingredients')),
    ])

    if (recipesSnap.empty) return empty

    // Mapa de stock por id de insumo. Si hay warehouseId, sumamos sólo de ese
    // almacén; si no, usamos currentStock (suma global del documento).
    const stockById = new Map()
    ingredientsSnap.forEach(d => {
      const data = d.data()
      if (data.trackStock === false) {
        // Insumos que no manejan stock no bloquean nunca: stock infinito.
        stockById.set(d.id, Infinity)
        return
      }
      if (warehouseId && Array.isArray(data.warehouseStocks)) {
        const ws = data.warehouseStocks.find(w => w.warehouseId === warehouseId)
        stockById.set(d.id, ws?.stock || 0)
      } else {
        stockById.set(d.id, data.currentStock || 0)
      }
    })

    // Para insumos de tipo "producto terminado", no precargamos porque sería
    // un query extra grande; los tratamos como "stock infinito" en el badge
    // (el bloqueo real al cobrar sigue siendo correcto). En la práctica las
    // recetas de restaurante usan ingredientes crudos, no productos.
    const result = new Set()
    recipesSnap.forEach(d => {
      const recipe = d.data()
      if (!recipe.productId) return
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
      if (ingredients.length === 0) return
      for (const ing of ingredients) {
        if (ing.ingredientType === 'product') continue // no se valida en badge
        const need = Number(ing.quantity) || 0
        if (need <= 0) continue
        const have = stockById.has(ing.ingredientId) ? stockById.get(ing.ingredientId) : 0
        if (have < need) {
          result.add(recipe.productId)
          break
        }
      }
    })
    return result
  } catch (e) {
    console.warn('Error calculando disponibilidad de insumos:', e)
    return empty
  }
}
