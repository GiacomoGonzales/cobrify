import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  Timestamp,
  where
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getRecipeByProductId, checkRecipeStock, calculateRecipeCost } from './recipeService'
import { deductIngredients } from './ingredientService'
import { updateWarehouseStock, createStockMovement } from './warehouseService'
import { updateProduct } from './firestoreService'

/**
 * Ejecutar producción con receta (modo automático)
 * Descuenta insumos y aumenta stock del producto
 */
export const executeRecipeProduction = async (businessId, params) => {
  const { productId, productName, quantity, warehouseId, notes, userId, product, variantIndex, variantSku } = params

  try {
    // 1. Obtener receta
    const recipeResult = await getRecipeByProductId(businessId, productId)
    if (!recipeResult.success) {
      return { success: false, error: 'No se encontró la composición/receta para este producto' }
    }
    const recipe = recipeResult.data

    // 2. Verificar stock de insumos
    const stockCheck = await checkRecipeStock(businessId, productId, quantity)
    if (!stockCheck.success) {
      return { success: false, error: 'Error al verificar stock de insumos' }
    }
    if (!stockCheck.hasStock) {
      const missing = stockCheck.missingIngredients
        .map(i => `${i.name}: necesita ${i.needed}, disponible ${i.available} ${i.unit}`)
        .join(', ')
      return { success: false, error: `Stock insuficiente de insumos: ${missing}` }
    }

    // 3. Calcular costo de producción
    const totalCost = await calculateRecipeCost(businessId, recipe.ingredients) * quantity

    // 4. Preparar ingredientes con cantidades multiplicadas por la cantidad a producir
    const ingredientsToDeduct = recipe.ingredients.map(ing => ({
      ...ing,
      quantity: ing.quantity * quantity
    }))

    // 5. Descontar insumos
    const deductResult = await deductIngredients(
      businessId,
      ingredientsToDeduct,
      null, // no relatedSaleId
      productName,
      warehouseId,
      'production_consumption'
    )
    if (!deductResult.success) {
      return { success: false, error: `Error al descontar insumos: ${deductResult.error}` }
    }

    // 6. Aumentar stock del producto (o variante)
    let updateData
    if (variantIndex != null && product.variants?.length > 0) {
      const variants = [...product.variants]
      variants[variantIndex] = {
        ...variants[variantIndex],
        stock: (variants[variantIndex].stock || 0) + quantity
      }
      updateData = { variants }
    } else {
      const updatedProduct = updateWarehouseStock(product, warehouseId, quantity)
      updateData = {
        stock: updatedProduct.stock,
        warehouseStocks: updatedProduct.warehouseStocks
      }
    }

    const updateResult = await updateProduct(businessId, productId, updateData)
    if (!updateResult.success) {
      return { success: false, error: 'Error al actualizar stock del producto' }
    }

    // 7. Crear movimiento de stock
    await createStockMovement(businessId, {
      productId,
      warehouseId,
      type: 'production',
      quantity: quantity,
      reason: `Producción con receta: ${productName} (x${quantity})`,
      referenceType: 'production',
      userId,
      notes: notes || `Producción automática de ${quantity} unidades`
    })

    // 8. Guardar registro de producción
    const productionData = {
      productId,
      productName,
      quantity,
      mode: 'recipe',
      recipeId: recipe.id,
      warehouseId,
      ...(variantIndex != null && { variantIndex, variantSku }),
      ingredientsDeducted: ingredientsToDeduct.map(ing => ({
        ingredientId: ing.ingredientId,
        ingredientName: ing.ingredientName,
        quantity: ing.quantity,
        unit: ing.unit
      })),
      totalCost,
      notes: notes || '',
      userId,
      createdAt: Timestamp.now()
    }

    const productionsRef = collection(db, 'businesses', businessId, 'productions')
    const docRef = await addDoc(productionsRef, productionData)

    return { success: true, id: docRef.id, totalCost }
  } catch (error) {
    console.error('Error en producción con receta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Ejecutar producción manual (solo aumenta stock)
 */
export const executeManualProduction = async (businessId, params) => {
  const { productId, productName, quantity, warehouseId, notes, userId, product, variantIndex, variantSku } = params

  try {
    // 1. Aumentar stock del producto (o variante)
    let updateData
    if (variantIndex != null && product.variants?.length > 0) {
      // Producto con variantes: actualizar stock de la variante
      const variants = [...product.variants]
      variants[variantIndex] = {
        ...variants[variantIndex],
        stock: (variants[variantIndex].stock || 0) + quantity
      }
      updateData = { variants }
    } else {
      const updatedProduct = updateWarehouseStock(product, warehouseId, quantity)
      updateData = {
        stock: updatedProduct.stock,
        warehouseStocks: updatedProduct.warehouseStocks
      }
    }

    const updateResult = await updateProduct(businessId, productId, updateData)
    if (!updateResult.success) {
      return { success: false, error: 'Error al actualizar stock del producto' }
    }

    // 2. Crear movimiento de stock
    await createStockMovement(businessId, {
      productId,
      warehouseId,
      type: 'production_manual',
      quantity: quantity,
      reason: `Producción manual: ${productName} (x${quantity})`,
      referenceType: 'production_manual',
      userId,
      notes: notes || `Producción manual de ${quantity} unidades`
    })

    // 3. Guardar registro de producción
    const productionData = {
      productId,
      productName,
      quantity,
      mode: 'manual',
      recipeId: null,
      warehouseId,
      ...(variantIndex != null && { variantIndex, variantSku }),
      ingredientsDeducted: [],
      totalCost: 0,
      notes: notes || '',
      userId,
      createdAt: Timestamp.now()
    }

    const productionsRef = collection(db, 'businesses', businessId, 'productions')
    const docRef = await addDoc(productionsRef, productionData)

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error en producción manual:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener historial de producciones
 */
export const getProductions = async (businessId, filters = {}) => {
  try {
    const productionsRef = collection(db, 'businesses', businessId, 'productions')
    const q = query(productionsRef, orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)

    let productions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Filtros opcionales
    if (filters.mode && filters.mode !== 'all') {
      productions = productions.filter(p => p.mode === filters.mode)
    }

    if (filters.search) {
      const search = filters.search.toLowerCase()
      productions = productions.filter(p =>
        p.productName?.toLowerCase().includes(search)
      )
    }

    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom)
      from.setHours(0, 0, 0, 0)
      productions = productions.filter(p => {
        const date = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
        return date >= from
      })
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo)
      to.setHours(23, 59, 59, 999)
      productions = productions.filter(p => {
        const date = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
        return date <= to
      })
    }

    return { success: true, data: productions }
  } catch (error) {
    console.error('Error al obtener producciones:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un registro de producción
 * @param {boolean} reverseStock - Si es true, revierte los cambios de stock
 */
export const deleteProduction = async (businessId, productionId, reverseStock = false) => {
  try {
    const productionRef = doc(db, 'businesses', businessId, 'productions', productionId)

    if (!reverseStock) {
      await deleteDoc(productionRef)
      return { success: true }
    }

    // Obtener datos de la producción para revertir
    const productionDoc = await getDoc(productionRef)
    if (!productionDoc.exists()) {
      return { success: false, error: 'Producción no encontrada' }
    }
    const production = productionDoc.data()
    const { productId, quantity, warehouseId, mode, ingredientsDeducted } = production

    const batch = writeBatch(db)

    // 1. Revertir stock del producto producido (restar lo que se añadió)
    const productRef = doc(db, 'businesses', businessId, 'products', productId)
    const productDoc = await getDoc(productRef)

    if (productDoc.exists()) {
      const productData = productDoc.data()
      if (productData.stock !== null && productData.trackStock !== false) {
        const warehouseStocks = [...(productData.warehouseStocks || [])]
        const wsIndex = warehouseStocks.findIndex(ws => ws.warehouseId === warehouseId)

        if (wsIndex >= 0) {
          warehouseStocks[wsIndex] = {
            ...warehouseStocks[wsIndex],
            stock: Math.max(0, (warehouseStocks[wsIndex].stock || 0) - quantity)
          }
        }

        const newStock = warehouseStocks.length > 0
          ? warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
          : Math.max(0, (productData.stock || 0) - quantity)

        batch.update(productRef, {
          stock: newStock,
          warehouseStocks,
          updatedAt: Timestamp.now()
        })

        // Movimiento de reversión del producto
        const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
        batch.set(doc(movementsRef), {
          productId,
          productName: production.productName,
          type: 'production_reversal',
          quantity: -quantity,
          warehouseId: warehouseId || null,
          reason: `Reversión de producción: ${production.productName}`,
          createdAt: Timestamp.now()
        })
      }
    }

    // 2. Para producciones con receta: devolver stock de insumos
    if (mode === 'recipe' && ingredientsDeducted?.length > 0) {
      for (const ing of ingredientsDeducted) {
        // Intentar primero como producto terminado
        const asProductRef = doc(db, 'businesses', businessId, 'products', ing.ingredientId)
        const asProductDoc = await getDoc(asProductRef)

        if (asProductDoc.exists()) {
          // Es un producto terminado usado como insumo
          const pData = asProductDoc.data()
          if (pData.stock !== null && pData.trackStock !== false) {
            const wStocks = [...(pData.warehouseStocks || [])]
            const wIdx = wStocks.findIndex(ws => ws.warehouseId === warehouseId)

            if (wIdx >= 0) {
              wStocks[wIdx] = { ...wStocks[wIdx], stock: (wStocks[wIdx].stock || 0) + ing.quantity }
            } else if (wStocks.length > 0) {
              wStocks.push({ warehouseId, stock: ing.quantity, minStock: 0 })
            }

            const newStock = wStocks.length > 0
              ? wStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
              : (pData.stock || 0) + ing.quantity

            batch.update(asProductRef, {
              stock: newStock,
              warehouseStocks: wStocks,
              updatedAt: Timestamp.now()
            })

            const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
            batch.set(doc(movementsRef), {
              productId: ing.ingredientId,
              productName: ing.ingredientName,
              type: 'production_reversal',
              quantity: ing.quantity,
              warehouseId: warehouseId || null,
              reason: `Reversión insumo: ${ing.ingredientName} (producción ${production.productName})`,
              createdAt: Timestamp.now()
            })
          }
        } else {
          // Intentar como ingrediente crudo
          const ingRef = doc(db, 'businesses', businessId, 'ingredients', ing.ingredientId)
          const ingDoc = await getDoc(ingRef)

          if (ingDoc.exists()) {
            const iData = ingDoc.data()
            const wStocks = [...(iData.warehouseStocks || [])]
            const wIdx = wStocks.findIndex(ws => ws.warehouseId === warehouseId)

            if (wIdx >= 0) {
              wStocks[wIdx] = { ...wStocks[wIdx], stock: (wStocks[wIdx].stock || 0) + ing.quantity }
            } else if (wStocks.length > 0) {
              wStocks.push({ warehouseId, stock: ing.quantity, minStock: 0 })
            }

            const newStock = wStocks.length > 0
              ? wStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
              : (iData.currentStock || 0) + ing.quantity

            batch.update(ingRef, {
              currentStock: newStock,
              warehouseStocks: wStocks,
              updatedAt: Timestamp.now()
            })

            const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
            batch.set(doc(movementsRef), {
              ingredientId: ing.ingredientId,
              ingredientName: ing.ingredientName,
              type: 'production_reversal',
              quantity: ing.quantity,
              warehouseId: warehouseId || null,
              reason: `Reversión insumo: ${ing.ingredientName} (producción ${production.productName})`,
              createdAt: Timestamp.now()
            })
          }
        }
      }
    }

    // 3. Eliminar el documento de producción
    batch.delete(productionRef)

    await batch.commit()
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar producción:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Verificar si un producto está listo para producción con receta
 */
export const checkProductionReadiness = async (businessId, productId, quantity) => {
  try {
    // Verificar que tiene receta
    const recipeResult = await getRecipeByProductId(businessId, productId)
    if (!recipeResult.success) {
      return { success: false, hasRecipe: false, hasStock: false, error: 'Sin composición/receta' }
    }

    // Verificar stock de insumos
    const stockCheck = await checkRecipeStock(businessId, productId, quantity)
    if (!stockCheck.success) {
      return { success: false, hasRecipe: true, hasStock: false, error: stockCheck.error }
    }

    return {
      success: true,
      hasRecipe: true,
      hasStock: stockCheck.hasStock,
      missingIngredients: stockCheck.missingIngredients,
      recipe: recipeResult.data
    }
  } catch (error) {
    console.error('Error al verificar preparación para producción:', error)
    return { success: false, error: error.message }
  }
}
