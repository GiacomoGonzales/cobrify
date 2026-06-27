import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getIngredient, convertUnit } from './ingredientService'

/**
 * Determina si una receta debe descontar/validar stock de ingredientes al vender.
 *
 * El campo `deductOnSale` se introdujo después de que ya existían recetas en producción.
 * Las recetas creadas antes de esa fecha tienen `deductOnSale === undefined`. Para esas,
 * aplicamos el mismo default que usa el formulario de Composición (Recipes.jsx):
 *   - businessMode === 'restaurant' → true (descontar al vender, comportamiento clásico)
 *   - cualquier otro modo            → false (modo "producción", no descontar al vender)
 *
 * Esto evita que negocios no-restaurant con recetas legacy queden bloqueados por la
 * validación de stock de ingredientes (ver POS.jsx handleCheckout) cuando el dueño
 * nunca configuró explícitamente que se descuente.
 */
export const shouldDeductIngredients = (recipe, businessMode) => {
  if (!recipe) return false
  if (recipe.deductOnSale === true) return true
  if (recipe.deductOnSale === false) return false
  return businessMode === 'restaurant'
}

/**
 * Calcular el costo de una receta basado en sus ingredientes
 */
export const calculateRecipeCost = async (businessId, ingredients) => {
  let totalCost = 0

  for (const ingredient of ingredients) {
    if (ingredient.ingredientType === 'product') {
      // Producto terminado: usar costo o precio del producto
      const productRef = doc(db, 'businesses', businessId, 'products', ingredient.ingredientId)
      const productSnap = await getDoc(productRef)

      if (productSnap.exists()) {
        const productData = productSnap.data()
        const unitCost = productData.cost || productData.price || 0
        const ingredientCost = ingredient.quantity * unitCost
        totalCost += ingredientCost
        ingredient.cost = ingredientCost
      }
    } else {
      // Ingrediente crudo: usar averageCost con conversión de unidad
      const result = await getIngredient(businessId, ingredient.ingredientId)

      if (result.success) {
        const ingredientData = result.data
        const averageCost = ingredientData.averageCost || 0

        const quantityInPurchaseUnit = convertUnit(
          ingredient.quantity,
          ingredient.unit,
          ingredientData.purchaseUnit
        )

        const ingredientCost = quantityInPurchaseUnit * averageCost
        totalCost += ingredientCost
        ingredient.cost = ingredientCost
      }
    }
  }

  return totalCost
}

/**
 * Obtener todas las recetas
 */
export const getRecipes = async (businessId) => {
  try {
    const recipesRef = collection(db, 'businesses', businessId, 'recipes')
    const q = query(recipesRef, orderBy('productName', 'asc'))
    const snapshot = await getDocs(q)

    const recipes = []
    snapshot.forEach((doc) => {
      recipes.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: recipes }
  } catch (error) {
    console.error('Error al obtener recetas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una receta por ID
 */
export const getRecipe = async (businessId, recipeId) => {
  try {
    const recipeRef = doc(db, 'businesses', businessId, 'recipes', recipeId)
    const recipeDoc = await getDoc(recipeRef)

    if (!recipeDoc.exists()) {
      return { success: false, error: 'Receta no encontrada' }
    }

    return { success: true, data: { id: recipeDoc.id, ...recipeDoc.data() } }
  } catch (error) {
    console.error('Error al obtener receta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener receta por productId
 */
export const getRecipeByProductId = async (businessId, productId) => {
  try {
    const recipesRef = collection(db, 'businesses', businessId, 'recipes')
    const q = query(recipesRef, where('productId', '==', productId))
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return { success: false, error: 'Receta no encontrada' }
    }

    const recipeDoc = snapshot.docs[0]
    return { success: true, data: { id: recipeDoc.id, ...recipeDoc.data() } }
  } catch (error) {
    console.error('Error al obtener receta por productId:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Sincroniza el COSTO del producto con el de su receta.
 *
 * Para un producto hecho con receta, la receta es la ÚNICA fuente del costo: el costo
 * unitario del producto = totalCost / porciones. Además marca el producto con
 * `hasRecipe: true` para que las compras del terminado, la edición manual y el recálculo
 * de costos desde compras NO le pisen el costo (manda siempre la receta).
 *
 * Escribe directo al doc del producto (updateDoc parcial) para evitar import circular
 * con productService.
 */
const syncProductCostFromRecipe = async (businessId, productId, totalCost, portions) => {
  if (!businessId || !productId) return
  try {
    const units = Math.max(1, Number(portions) || 1)
    const unitCost = Math.round(((Number(totalCost) || 0) / units) * 1e6) / 1e6
    const productRef = doc(db, 'businesses', businessId, 'products', productId)
    await updateDoc(productRef, { cost: unitCost, hasRecipe: true, updatedAt: Timestamp.now() })
  } catch (e) {
    console.error('Error al sincronizar costo del producto desde la receta:', e)
  }
}

/**
 * Crear una nueva receta
 */
export const createRecipe = async (businessId, recipeData) => {
  try {
    // Calcular costo total de la receta
    const totalCost = await calculateRecipeCost(businessId, recipeData.ingredients)

    const recipesRef = collection(db, 'businesses', businessId, 'recipes')

    const newRecipe = {
      ...recipeData,
      totalCost,
      portions: recipeData.portions || 1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }

    const docRef = await addDoc(recipesRef, newRecipe)

    // El producto se costea por su receta (costo unitario = totalCost / porciones)
    await syncProductCostFromRecipe(businessId, recipeData.productId, totalCost, newRecipe.portions)

    return { success: true, id: docRef.id, totalCost }
  } catch (error) {
    console.error('Error al crear receta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una receta
 */
export const updateRecipe = async (businessId, recipeId, updates) => {
  try {
    // Si se actualizan los ingredientes, recalcular costo
    let totalCost = updates.totalCost
    if (updates.ingredients) {
      totalCost = await calculateRecipeCost(businessId, updates.ingredients)
    }

    const recipeRef = doc(db, 'businesses', businessId, 'recipes', recipeId)

    await updateDoc(recipeRef, {
      ...updates,
      totalCost,
      updatedAt: Timestamp.now()
    })

    // Sincronizar el costo del producto vinculado (lee la receta para tomar el productId
    // y las porciones autoritativos, vengan o no en `updates`).
    const savedSnap = await getDoc(recipeRef)
    const saved = savedSnap.exists() ? savedSnap.data() : {}
    await syncProductCostFromRecipe(businessId, saved.productId, totalCost, saved.portions)

    return { success: true, totalCost }
  } catch (error) {
    console.error('Error al actualizar receta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una receta
 */
export const deleteRecipe = async (businessId, recipeId) => {
  try {
    const recipeRef = doc(db, 'businesses', businessId, 'recipes', recipeId)

    // Antes de borrar, tomar el productId para des-marcar el producto (ya no se costea
    // por receta → vuelve a poder costearse por compras / edición manual).
    const snap = await getDoc(recipeRef)
    const productId = snap.exists() ? snap.data().productId : null

    await deleteDoc(recipeRef)

    if (productId) {
      try {
        const productRef = doc(db, 'businesses', businessId, 'products', productId)
        await updateDoc(productRef, { hasRecipe: false, updatedAt: Timestamp.now() })
      } catch (e) {
        console.error('Error al des-marcar hasRecipe del producto:', e)
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error al eliminar receta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Verificar si hay suficiente stock para preparar un plato
 */
export const checkRecipeStock = async (businessId, productId, quantity = 1) => {
  try {
    const recipeResult = await getRecipeByProductId(businessId, productId)

    if (!recipeResult.success) {
      // Si no hay receta, asumimos que hay stock suficiente (producto sin receta)
      return { success: true, hasStock: true, missingIngredients: [] }
    }

    const recipe = recipeResult.data
    // Receta sin lista de ingredientes: nada que validar. Antes el for sobre `undefined`
    // lanzaba excepción y el POS lo interpretaba como "hay stock".
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      return { success: true, hasStock: true, missingIngredients: [] }
    }
    const missingIngredients = []

    for (const ingredient of recipe.ingredients) {
      if (ingredient.ingredientType === 'product') {
        // Producto terminado: verificar stock del producto
        const productRef = doc(db, 'businesses', businessId, 'products', ingredient.ingredientId)
        const productSnap = await getDoc(productRef)

        if (productSnap.exists()) {
          const productData = productSnap.data()
          const currentStock = productData.stock ?? productData.currentStock ?? 0
          const quantityNeeded = ingredient.quantity * quantity

          if (currentStock < quantityNeeded) {
            missingIngredients.push({
              name: ingredient.ingredientName,
              available: currentStock,
              needed: quantityNeeded,
              unit: productData.unit || 'unidades'
            })
          }
        }
      } else {
        // Ingrediente crudo
        const ingredientResult = await getIngredient(businessId, ingredient.ingredientId)

        if (ingredientResult.success) {
          const ingredientData = ingredientResult.data

          // Si el ingrediente no maneja stock, omitir validación
          if (ingredientData.trackStock === false) continue

          const currentStock = ingredientData.currentStock || 0

          const quantityNeeded = convertUnit(
            ingredient.quantity * quantity,
            ingredient.unit,
            ingredientData.purchaseUnit
          )

          if (currentStock < quantityNeeded) {
            missingIngredients.push({
              name: ingredient.ingredientName,
              available: currentStock,
              needed: quantityNeeded,
              unit: ingredientData.purchaseUnit
            })
          }
        }
      }
    }

    return {
      success: true,
      hasStock: missingIngredients.length === 0,
      missingIngredients
    }
  } catch (error) {
    console.error('Error al verificar stock de receta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener costo y margen de ganancia de un producto
 * Prioriza el costo de la receta si existe, sino usa el costo manual del producto
 */
export const getProductProfitability = async (businessId, productId, salePrice, productManualCost = 0) => {
  try {
    const recipeResult = await getRecipeByProductId(businessId, productId)

    if (!recipeResult.success) {
      // Sin receta, usar costo manual del producto
      const cost = productManualCost || 0
      const profit = salePrice - cost
      const profitMargin = cost > 0 ? (profit / salePrice) * 100 : 100

      return {
        success: true,
        hasCost: cost > 0,
        hasRecipe: false,
        cost,
        price: salePrice,
        profit,
        profitMargin: profitMargin.toFixed(2)
      }
    }

    // Con receta, usar costo calculado de la receta
    const recipe = recipeResult.data
    const cost = recipe.totalCost || 0
    const profit = salePrice - cost
    const profitMargin = cost > 0 ? (profit / salePrice) * 100 : 100

    return {
      success: true,
      hasCost: true,
      hasRecipe: true,
      cost,
      price: salePrice,
      profit,
      profitMargin: profitMargin.toFixed(2)
    }
  } catch (error) {
    console.error('Error al calcular rentabilidad:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Recalcular costos de todas las recetas (útil después de actualizar precios de ingredientes)
 */
export const recalculateAllRecipeCosts = async (businessId) => {
  try {
    const recipesResult = await getRecipes(businessId)

    if (!recipesResult.success) {
      throw new Error(recipesResult.error)
    }

    const recipes = recipesResult.data
    let updated = 0

    for (const recipe of recipes) {
      const totalCost = await calculateRecipeCost(businessId, recipe.ingredients)
      const recipeRef = doc(db, 'businesses', businessId, 'recipes', recipe.id)

      await updateDoc(recipeRef, {
        totalCost,
        updatedAt: Timestamp.now()
      })

      // Propagar el costo al producto vinculado (costo por unidad = totalCost / porciones)
      await syncProductCostFromRecipe(businessId, recipe.productId, totalCost, recipe.portions)

      updated++
    }

    return { success: true, updated }
  } catch (error) {
    console.error('Error al recalcular costos de recetas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Recalcular el costo (totalCost) solo de las recetas que usan un insumo concreto.
 *
 * El totalCost de una receta es un snapshot que se calcula al crear/editar la receta.
 * Cuando cambia el costo (averageCost) o la unidad de compra de un insumo, las recetas
 * que lo usan quedan con el costo viejo. Esta función las vuelve a calcular en cascada.
 *
 * Acotada a las recetas afectadas (no recalcula todo el catálogo) para que se pueda
 * llamar tras cada edición de insumo sin un costo excesivo de lecturas/escrituras.
 */
export const recalculateRecipeCostsForIngredient = async (businessId, ingredientId) => {
  try {
    const recipesResult = await getRecipes(businessId)

    if (!recipesResult.success) {
      throw new Error(recipesResult.error)
    }

    const recipes = recipesResult.data
    let updated = 0

    for (const recipe of recipes) {
      // Solo recetas que usan ESTE insumo como ingrediente crudo (no como producto terminado).
      const usesIngredient = (recipe.ingredients || []).some(
        (ing) => ing.ingredientId === ingredientId && ing.ingredientType !== 'product'
      )
      if (!usesIngredient) continue

      const totalCost = await calculateRecipeCost(businessId, recipe.ingredients)
      const recipeRef = doc(db, 'businesses', businessId, 'recipes', recipe.id)

      await updateDoc(recipeRef, {
        totalCost,
        updatedAt: Timestamp.now()
      })

      // Propagar el costo al producto vinculado (costo por unidad = totalCost / porciones)
      await syncProductCostFromRecipe(businessId, recipe.productId, totalCost, recipe.portions)

      updated++
    }

    return { success: true, updated }
  } catch (error) {
    console.error('Error al recalcular costos de recetas por insumo:', error)
    return { success: false, error: error.message }
  }
}
