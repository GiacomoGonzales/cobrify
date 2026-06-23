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
import { convertUnit } from '@/services/ingredientService'

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

    // Mapa por id de insumo: { stock, unit }. Si hay warehouseId, tomamos el
    // stock SÓLO de ese almacén; si no, usamos currentStock (suma global).
    // Guardamos también la unidad de compra (`purchaseUnit`) para poder
    // convertir la cantidad de la receta a la unidad en que se guarda el stock.
    const infoById = new Map()
    ingredientsSnap.forEach(d => {
      const data = d.data()
      if (data.trackStock === false) {
        // Insumos que no manejan stock no bloquean nunca: stock infinito.
        infoById.set(d.id, { stock: Infinity, unit: null })
        return
      }
      let stock
      if (warehouseId && Array.isArray(data.warehouseStocks)) {
        const ws = data.warehouseStocks.find(w => w.warehouseId === warehouseId)
        stock = ws?.stock || 0
      } else {
        stock = data.currentStock || 0
      }
      infoById.set(d.id, { stock, unit: data.purchaseUnit || null })
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
        const info = infoById.get(ing.ingredientId)
        const have = info ? info.stock : 0
        // La cantidad de la receta viene en `ing.unit` (p.ej. g) pero el stock
        // se guarda en la unidad de compra del insumo (p.ej. kg). Convertimos
        // antes de comparar, igual que checkRecipeStock al cobrar. Sin esto,
        // 150 g vs 5 kg se comparaba como 5 < 150 y marcaba "Sin insumos" mal.
        const need = convertUnit(Number(ing.quantity) || 0, ing.unit, info?.unit)
        if (!(need > 0)) continue
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
