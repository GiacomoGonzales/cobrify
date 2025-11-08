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
 * Calcular el costo de una receta basado en sus ingredientes
 */
export const calculateRecipeCost = async (businessId, ingredients) => {
  let totalCost = 0

  for (const ingredient of ingredients) {
    const result = await getIngredient(businessId, ingredient.ingredientId)

    if (result.success) {
      const ingredientData = result.data
      const averageCost = ingredientData.averageCost || 0

      // Convertir cantidad de la receta a la unidad de compra para calcular costo
      const quantityInPurchaseUnit = convertUnit(
        ingredient.quantity,
        ingredient.unit,
        ingredientData.purchaseUnit
      )

      const ingredientCost = quantityInPurchaseUnit * averageCost
      totalCost += ingredientCost

      // Actualizar el costo en el ingrediente de la receta
      ingredient.cost = ingredientCost
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
    await deleteDoc(recipeRef)

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
    const missingIngredients = []

    for (const ingredient of recipe.ingredients) {
      const ingredientResult = await getIngredient(businessId, ingredient.ingredientId)

      if (ingredientResult.success) {
        const ingredientData = ingredientResult.data
        const currentStock = ingredientData.currentStock || 0

        // Convertir cantidad necesaria a unidad de compra
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
 */
export const getProductProfitability = async (businessId, productId, salePrice) => {
  try {
    const recipeResult = await getRecipeByProductId(businessId, productId)

    if (!recipeResult.success) {
      // Sin receta, no podemos calcular rentabilidad
      return {
        success: true,
        hasCost: false,
        cost: 0,
        price: salePrice,
        profit: salePrice,
        profitMargin: 100
      }
    }

    const recipe = recipeResult.data
    const cost = recipe.totalCost || 0
    const profit = salePrice - cost
    const profitMargin = cost > 0 ? (profit / salePrice) * 100 : 100

    return {
      success: true,
      hasCost: true,
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

      updated++
    }

    return { success: true, updated }
  } catch (error) {
    console.error('Error al recalcular costos de recetas:', error)
    return { success: false, error: error.message }
  }
}
