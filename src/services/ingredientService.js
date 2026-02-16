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
  Timestamp,
  writeBatch,
  increment
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Helper: Actualizar stock de ingrediente en un almacén específico
 * Similar a updateWarehouseStock en warehouseService
 */
export const updateIngredientWarehouseStock = (ingredient, warehouseId, quantityChange) => {
  const currentStock = ingredient.currentStock || 0
  const warehouseStocks = ingredient.warehouseStocks || []

  // Buscar el almacén en el array
  const warehouseIndex = warehouseStocks.findIndex(ws => ws.warehouseId === warehouseId)

  let updatedWarehouseStocks = [...warehouseStocks]

  if (warehouseIndex >= 0) {
    // Actualizar stock existente
    const currentWarehouseStock = updatedWarehouseStocks[warehouseIndex].stock || 0
    updatedWarehouseStocks[warehouseIndex] = {
      ...updatedWarehouseStocks[warehouseIndex],
      stock: Math.max(0, currentWarehouseStock + quantityChange)
    }
  } else if (quantityChange > 0) {
    // Agregar nuevo almacén solo si es entrada de stock
    updatedWarehouseStocks.push({
      warehouseId,
      stock: quantityChange
    })
  }

  // Calcular stock total
  const newTotalStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)

  return {
    ...ingredient,
    currentStock: newTotalStock,
    warehouseStocks: updatedWarehouseStocks
  }
}

/**
 * Helper: Obtener stock de un ingrediente en un almacén específico
 */
export const getIngredientStockInWarehouse = (ingredient, warehouseId) => {
  if (!ingredient.warehouseStocks || ingredient.warehouseStocks.length === 0) {
    // Si no tiene warehouseStocks, asumir que todo el stock está en el almacén principal
    return warehouseId ? 0 : (ingredient.currentStock || 0)
  }

  const warehouseStock = ingredient.warehouseStocks.find(ws => ws.warehouseId === warehouseId)
  return warehouseStock?.stock || 0
}

/**
 * Helper: Obtener stock total de un ingrediente para una sucursal
 */
export const getIngredientStockForBranch = (ingredient, warehouses, branchFilter) => {
  if (!ingredient.warehouseStocks || ingredient.warehouseStocks.length === 0) {
    // Sin warehouseStocks, retornar stock total solo para 'all' o 'main'
    if (branchFilter === 'all' || branchFilter === 'main') {
      return ingredient.currentStock || 0
    }
    return 0
  }

  // Filtrar almacenes según sucursal
  let filteredWarehouses = warehouses
  if (branchFilter === 'main') {
    filteredWarehouses = warehouses.filter(w => !w.branchId)
  } else if (branchFilter !== 'all') {
    filteredWarehouses = warehouses.filter(w => w.branchId === branchFilter)
  }

  const warehouseIds = filteredWarehouses.map(w => w.id)

  return ingredient.warehouseStocks
    .filter(ws => warehouseIds.includes(ws.warehouseId))
    .reduce((sum, ws) => sum + (ws.stock || 0), 0)
}

/**
 * Conversión de unidades de medida
 */
export const convertUnit = (value, fromUnit, toUnit) => {
  // Si alguna unidad no está definida, retornar el valor sin convertir
  if (!fromUnit || !toUnit) return value

  // Normalizar a minúsculas
  const from = fromUnit.toLowerCase()
  const to = toUnit.toLowerCase()

  // Si son la misma unidad, no hay conversión
  if (from === to) return value

  // Conversiones de peso
  const weightConversions = {
    'kg-g': value * 1000,
    'g-kg': value / 1000,
    'kg-kg': value,
    'g-g': value
  }

  // Conversiones de volumen
  const volumeConversions = {
    'l-ml': value * 1000,
    'ml-l': value / 1000,
    'l-l': value,
    'ml-ml': value
  }

  const key = `${from}-${to}`

  if (weightConversions[key] !== undefined) {
    return weightConversions[key]
  }

  if (volumeConversions[key] !== undefined) {
    return volumeConversions[key]
  }

  // Si no se puede convertir, retornar el valor original
  console.warn(`No se puede convertir de ${fromUnit} a ${toUnit}`)
  return value
}

/**
 * Obtener todos los ingredientes
 */
export const getIngredients = async (businessId) => {
  try {
    const ingredientsRef = collection(db, 'businesses', businessId, 'ingredients')
    const q = query(ingredientsRef, orderBy('name', 'asc'))
    const snapshot = await getDocs(q)

    const ingredients = []
    snapshot.forEach((doc) => {
      ingredients.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: ingredients }
  } catch (error) {
    console.error('Error al obtener ingredientes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener un ingrediente por ID
 */
export const getIngredient = async (businessId, ingredientId) => {
  try {
    const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', ingredientId)
    const ingredientDoc = await getDoc(ingredientRef)

    if (!ingredientDoc.exists()) {
      return { success: false, error: 'Ingrediente no encontrado' }
    }

    return { success: true, data: { id: ingredientDoc.id, ...ingredientDoc.data() } }
  } catch (error) {
    console.error('Error al obtener ingrediente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear un nuevo ingrediente
 */
export const createIngredient = async (businessId, ingredientData) => {
  try {
    const ingredientsRef = collection(db, 'businesses', businessId, 'ingredients')

    const newIngredient = {
      ...ingredientData,
      currentStock: ingredientData.currentStock || 0,
      averageCost: ingredientData.averageCost || 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }

    const docRef = await addDoc(ingredientsRef, newIngredient)

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear ingrediente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un ingrediente
 */
export const updateIngredient = async (businessId, ingredientId, updates) => {
  try {
    const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', ingredientId)

    await updateDoc(ingredientRef, {
      ...updates,
      updatedAt: Timestamp.now()
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar ingrediente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un ingrediente
 */
export const deleteIngredient = async (businessId, ingredientId) => {
  try {
    const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', ingredientId)
    await deleteDoc(ingredientRef)

    return { success: true }
  } catch (error) {
    console.error('Error al eliminar ingrediente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Registrar una compra de ingrediente
 * Ahora soporta warehouseId para stock por almacén
 */
export const registerPurchase = async (businessId, purchaseData) => {
  try {
    const batch = writeBatch(db)

    // 1. Crear el registro de compra
    const purchasesRef = collection(db, 'businesses', businessId, 'ingredientPurchases')
    const purchaseRef = doc(purchasesRef)

    batch.set(purchaseRef, {
      ...purchaseData,
      warehouseId: purchaseData.warehouseId || null,
      purchaseDate: purchaseData.purchaseDate || Timestamp.now(),
      createdAt: Timestamp.now()
    })

    // 2. Actualizar stock del ingrediente
    const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', purchaseData.ingredientId)
    const ingredientDoc = await getDoc(ingredientRef)

    if (!ingredientDoc.exists()) {
      throw new Error('Ingrediente no encontrado')
    }

    const currentData = ingredientDoc.data()
    const currentStock = currentData.currentStock || 0
    const currentAvgCost = currentData.averageCost || 0
    const warehouseStocks = currentData.warehouseStocks || []

    // Convertir cantidad comprada a la unidad de almacenamiento si es necesario
    const quantityToAdd = convertUnit(
      purchaseData.quantity,
      purchaseData.unit,
      currentData.purchaseUnit
    )

    // Actualizar warehouseStocks si se especificó un almacén
    let updatedWarehouseStocks = [...warehouseStocks]
    if (purchaseData.warehouseId) {
      const warehouseIndex = updatedWarehouseStocks.findIndex(
        ws => ws.warehouseId === purchaseData.warehouseId
      )

      if (warehouseIndex >= 0) {
        updatedWarehouseStocks[warehouseIndex] = {
          ...updatedWarehouseStocks[warehouseIndex],
          stock: (updatedWarehouseStocks[warehouseIndex].stock || 0) + quantityToAdd
        }
      } else {
        updatedWarehouseStocks.push({
          warehouseId: purchaseData.warehouseId,
          stock: quantityToAdd
        })
      }
    }

    // Calcular nuevo stock total
    const newStock = purchaseData.warehouseId
      ? updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
      : currentStock + quantityToAdd

    // Calcular nuevo costo promedio ponderado
    let newAvgCost
    if (currentAvgCost === 0 || currentStock === 0) {
      newAvgCost = purchaseData.unitPrice
    } else {
      const totalCurrentValue = currentStock * currentAvgCost
      const totalPurchaseValue = quantityToAdd * purchaseData.unitPrice
      newAvgCost = (totalCurrentValue + totalPurchaseValue) / newStock
    }

    const updateData = {
      currentStock: newStock,
      averageCost: newAvgCost,
      lastPurchasePrice: purchaseData.unitPrice,
      lastPurchaseDate: purchaseData.purchaseDate || Timestamp.now(),
      updatedAt: Timestamp.now()
    }

    // Solo actualizar warehouseStocks si se usó almacén
    if (purchaseData.warehouseId) {
      updateData.warehouseStocks = updatedWarehouseStocks
    }

    batch.update(ingredientRef, updateData)

    // 3. Crear movimiento de stock
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
    const movementRef = doc(movementsRef)

    batch.set(movementRef, {
      ingredientId: purchaseData.ingredientId,
      ingredientName: purchaseData.ingredientName,
      type: 'purchase',
      quantity: quantityToAdd,
      unit: currentData.purchaseUnit,
      warehouseId: purchaseData.warehouseId || null,
      reason: `Compra - ${purchaseData.supplier || 'Sin proveedor'}`,
      relatedPurchaseId: purchaseRef.id,
      beforeStock: currentStock,
      afterStock: newStock,
      createdAt: Timestamp.now()
    })

    await batch.commit()

    return { success: true, purchaseId: purchaseRef.id }
  } catch (error) {
    console.error('Error al registrar compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener compras de ingredientes
 */
export const getPurchases = async (businessId, filters = {}) => {
  try {
    const purchasesRef = collection(db, 'businesses', businessId, 'ingredientPurchases')
    let q = query(purchasesRef, orderBy('purchaseDate', 'desc'))

    if (filters.ingredientId) {
      q = query(purchasesRef,
        where('ingredientId', '==', filters.ingredientId),
        orderBy('purchaseDate', 'desc')
      )
    }

    const snapshot = await getDocs(q)
    const purchases = []

    snapshot.forEach((doc) => {
      purchases.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: purchases }
  } catch (error) {
    console.error('Error al obtener compras:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Descontar ingredientes del stock (cuando se vende un plato)
 * Ahora soporta warehouseId para descuento por almacén
 */
export const deductIngredients = async (businessId, ingredients, relatedSaleId, productName, warehouseId = null, movementType = 'sale') => {
  try {
    const batch = writeBatch(db)

    for (const ingredient of ingredients) {
      // Si es un producto terminado, descontar del stock del producto
      if (ingredient.ingredientType === 'product') {
        const productRef = doc(db, 'businesses', businessId, 'products', ingredient.ingredientId)
        const productDoc = await getDoc(productRef)

        if (!productDoc.exists()) {
          console.warn(`Producto ${ingredient.ingredientName} no encontrado`)
          continue
        }

        const productData = productDoc.data()
        const currentStock = productData.stock ?? productData.currentStock ?? 0
        const quantityToDeduct = ingredient.quantity
        const newStock = Math.max(0, currentStock - quantityToDeduct)

        batch.update(productRef, {
          stock: newStock,
          updatedAt: Timestamp.now()
        })

        // Crear movimiento de stock para el producto
        const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
        const movementRef = doc(movementsRef)

        batch.set(movementRef, {
          productId: ingredient.ingredientId,
          productName: ingredient.ingredientName,
          ingredientType: 'product',
          type: movementType,
          quantity: quantityToDeduct,
          unit: productData.unit || 'unidades',
          warehouseId: null,
          reason: movementType === 'production_consumption' ? `Producción: ${productName}` : `Venta: ${productName}`,
          relatedSaleId: relatedSaleId,
          beforeStock: currentStock,
          afterStock: newStock,
          createdAt: Timestamp.now()
        })

        continue
      }

      // Ingrediente crudo: flujo existente
      const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', ingredient.ingredientId)
      const ingredientDoc = await getDoc(ingredientRef)

      if (!ingredientDoc.exists()) {
        console.warn(`Ingrediente ${ingredient.ingredientName} no encontrado`)
        continue
      }

      const currentData = ingredientDoc.data()
      const currentStock = currentData.currentStock || 0
      const warehouseStocks = currentData.warehouseStocks || []

      // Convertir cantidad a descontar a la unidad de almacenamiento
      const quantityToDeduct = convertUnit(
        ingredient.quantity,
        ingredient.unit,
        currentData.purchaseUnit
      )

      let newStock
      let updatedWarehouseStocks = [...warehouseStocks]
      const effectiveWarehouseId = warehouseId || ingredient.warehouseId

      if (effectiveWarehouseId && warehouseStocks.length > 0) {
        // Descontar del almacén específico
        const warehouseIndex = updatedWarehouseStocks.findIndex(
          ws => ws.warehouseId === effectiveWarehouseId
        )

        if (warehouseIndex >= 0) {
          const currentWarehouseStock = updatedWarehouseStocks[warehouseIndex].stock || 0
          updatedWarehouseStocks[warehouseIndex] = {
            ...updatedWarehouseStocks[warehouseIndex],
            stock: Math.max(0, currentWarehouseStock - quantityToDeduct)
          }
        }

        // Recalcular stock total
        newStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
      } else {
        // Sin almacén específico, descontar del stock general
        newStock = Math.max(0, currentStock - quantityToDeduct)
      }

      // Preparar datos de actualización
      const updateData = {
        currentStock: newStock,
        updatedAt: Timestamp.now()
      }

      if (effectiveWarehouseId && warehouseStocks.length > 0) {
        updateData.warehouseStocks = updatedWarehouseStocks
      }

      // Actualizar stock
      batch.update(ingredientRef, updateData)

      // Crear movimiento de stock
      const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
      const movementRef = doc(movementsRef)

      batch.set(movementRef, {
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.ingredientName,
        type: movementType,
        quantity: quantityToDeduct,
        unit: currentData.purchaseUnit,
        warehouseId: effectiveWarehouseId || null,
        reason: movementType === 'production_consumption' ? `Producción: ${productName}` : `Venta: ${productName}`,
        relatedSaleId: relatedSaleId,
        beforeStock: currentStock,
        afterStock: newStock,
        createdAt: Timestamp.now()
      })
    }

    await batch.commit()
    return { success: true }
  } catch (error) {
    console.error('Error al descontar ingredientes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener movimientos de stock
 */
export const getStockMovements = async (businessId, filters = {}) => {
  try {
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
    let q = query(movementsRef, orderBy('createdAt', 'desc'))

    if (filters.ingredientId) {
      q = query(movementsRef,
        where('ingredientId', '==', filters.ingredientId),
        orderBy('createdAt', 'desc')
      )
    }

    const snapshot = await getDocs(q)
    const movements = []

    snapshot.forEach((doc) => {
      movements.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: movements }
  } catch (error) {
    console.error('Error al obtener movimientos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Ajustar stock manualmente
 * Ahora soporta warehouseId para ajuste por almacén
 */
/**
 * Eliminar una compra de ingrediente y revertir su stock
 */
export const deleteIngredientPurchase = async (businessId, purchaseId) => {
  try {
    // 1. Obtener datos de la compra
    const purchaseRef = doc(db, 'businesses', businessId, 'ingredientPurchases', purchaseId)
    const purchaseDoc = await getDoc(purchaseRef)

    if (!purchaseDoc.exists()) {
      throw new Error('Compra no encontrada')
    }

    const purchaseData = purchaseDoc.data()
    const batch = writeBatch(db)

    // 2. Revertir stock del ingrediente
    const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', purchaseData.ingredientId)
    const ingredientDoc = await getDoc(ingredientRef)

    if (ingredientDoc.exists()) {
      const currentData = ingredientDoc.data()
      const currentStock = currentData.currentStock || 0

      const quantityToRevert = convertUnit(
        purchaseData.quantity,
        purchaseData.unit,
        currentData.purchaseUnit
      )

      const newStock = Math.max(0, currentStock - quantityToRevert)

      const updateData = {
        currentStock: newStock,
        updatedAt: Timestamp.now()
      }

      // Revertir warehouseStocks si aplica
      if (purchaseData.warehouseId && currentData.warehouseStocks) {
        const updatedWarehouseStocks = [...currentData.warehouseStocks]
        const idx = updatedWarehouseStocks.findIndex(ws => ws.warehouseId === purchaseData.warehouseId)
        if (idx >= 0) {
          updatedWarehouseStocks[idx] = {
            ...updatedWarehouseStocks[idx],
            stock: Math.max(0, (updatedWarehouseStocks[idx].stock || 0) - quantityToRevert)
          }
          updateData.warehouseStocks = updatedWarehouseStocks
          updateData.currentStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
        }
      }

      batch.update(ingredientRef, updateData)

      // 3. Crear movimiento de stock
      const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
      const movementRef = doc(movementsRef)
      batch.set(movementRef, {
        ingredientId: purchaseData.ingredientId,
        ingredientName: purchaseData.ingredientName,
        type: 'purchase_delete',
        quantity: quantityToRevert,
        unit: currentData.purchaseUnit,
        warehouseId: purchaseData.warehouseId || null,
        reason: `Eliminación de compra - ${purchaseData.supplier || 'Sin proveedor'}`,
        beforeStock: currentStock,
        afterStock: updateData.currentStock,
        createdAt: Timestamp.now()
      })
    }

    // 4. Eliminar la compra
    batch.delete(purchaseRef)

    await batch.commit()
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar compra de ingrediente:', error)
    return { success: false, error: error.message }
  }
}

export const adjustStock = async (businessId, ingredientId, ingredientName, newStock, reason, warehouseId = null) => {
  try {
    const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', ingredientId)
    const ingredientDoc = await getDoc(ingredientRef)

    if (!ingredientDoc.exists()) {
      throw new Error('Ingrediente no encontrado')
    }

    const currentData = ingredientDoc.data()
    const currentStock = currentData.currentStock || 0
    const warehouseStocks = currentData.warehouseStocks || []

    const batch = writeBatch(db)

    let updatedWarehouseStocks = [...warehouseStocks]
    let newTotalStock = newStock
    let beforeWarehouseStock = 0

    if (warehouseId) {
      // Ajustar stock en almacén específico
      const warehouseIndex = updatedWarehouseStocks.findIndex(ws => ws.warehouseId === warehouseId)

      if (warehouseIndex >= 0) {
        beforeWarehouseStock = updatedWarehouseStocks[warehouseIndex].stock || 0
        updatedWarehouseStocks[warehouseIndex] = {
          ...updatedWarehouseStocks[warehouseIndex],
          stock: newStock
        }
      } else {
        updatedWarehouseStocks.push({
          warehouseId,
          stock: newStock
        })
      }

      // Recalcular stock total
      newTotalStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
    }

    // Preparar datos de actualización
    const updateData = {
      currentStock: newTotalStock,
      updatedAt: Timestamp.now()
    }

    if (warehouseId) {
      updateData.warehouseStocks = updatedWarehouseStocks
    }

    // Actualizar stock
    batch.update(ingredientRef, updateData)

    // Crear movimiento
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
    const movementRef = doc(movementsRef)

    const beforeStock = warehouseId ? beforeWarehouseStock : currentStock

    batch.set(movementRef, {
      ingredientId,
      ingredientName,
      type: 'adjustment',
      quantity: Math.abs(newStock - beforeStock),
      unit: currentData.purchaseUnit,
      warehouseId: warehouseId || null,
      reason: reason || 'Ajuste manual de inventario',
      beforeStock: beforeStock,
      afterStock: newStock,
      createdAt: Timestamp.now()
    })

    await batch.commit()
    return { success: true }
  } catch (error) {
    console.error('Error al ajustar stock:', error)
    return { success: false, error: error.message }
  }
}
