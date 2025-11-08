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
 * Conversión de unidades de medida
 */
export const convertUnit = (value, fromUnit, toUnit) => {
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
 */
export const registerPurchase = async (businessId, purchaseData) => {
  try {
    const batch = writeBatch(db)

    // 1. Crear el registro de compra
    const purchasesRef = collection(db, 'businesses', businessId, 'ingredientPurchases')
    const purchaseRef = doc(purchasesRef)

    batch.set(purchaseRef, {
      ...purchaseData,
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

    // Convertir cantidad comprada a la unidad de almacenamiento si es necesario
    const quantityToAdd = convertUnit(
      purchaseData.quantity,
      purchaseData.unit,
      currentData.purchaseUnit
    )

    const newStock = currentStock + quantityToAdd

    // Calcular nuevo costo promedio ponderado
    // Si el costo actual es 0, solo usar el valor de la nueva compra
    // (esto evita diluir el precio cuando hay stock inicial sin costo)
    let newAvgCost
    if (currentAvgCost === 0 || currentStock === 0) {
      // Primera compra o stock sin costo: usar precio de compra directamente
      newAvgCost = purchaseData.unitPrice
    } else {
      // Calcular promedio ponderado con stock existente
      const totalCurrentValue = currentStock * currentAvgCost
      const totalPurchaseValue = quantityToAdd * purchaseData.unitPrice
      newAvgCost = (totalCurrentValue + totalPurchaseValue) / newStock
    }

    batch.update(ingredientRef, {
      currentStock: newStock,
      averageCost: newAvgCost,
      lastPurchasePrice: purchaseData.unitPrice,
      lastPurchaseDate: purchaseData.purchaseDate || Timestamp.now(),
      updatedAt: Timestamp.now()
    })

    // 3. Crear movimiento de stock
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
    const movementRef = doc(movementsRef)

    batch.set(movementRef, {
      ingredientId: purchaseData.ingredientId,
      ingredientName: purchaseData.ingredientName,
      type: 'purchase',
      quantity: quantityToAdd,
      unit: currentData.purchaseUnit,
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
 */
export const deductIngredients = async (businessId, ingredients, relatedSaleId, productName) => {
  try {
    const batch = writeBatch(db)

    for (const ingredient of ingredients) {
      const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', ingredient.ingredientId)
      const ingredientDoc = await getDoc(ingredientRef)

      if (!ingredientDoc.exists()) {
        console.warn(`Ingrediente ${ingredient.ingredientName} no encontrado`)
        continue
      }

      const currentData = ingredientDoc.data()
      const currentStock = currentData.currentStock || 0

      // Convertir cantidad a descontar a la unidad de almacenamiento
      const quantityToDeduct = convertUnit(
        ingredient.quantity,
        ingredient.unit,
        currentData.purchaseUnit
      )

      const newStock = Math.max(0, currentStock - quantityToDeduct)

      // Actualizar stock
      batch.update(ingredientRef, {
        currentStock: newStock,
        updatedAt: Timestamp.now()
      })

      // Crear movimiento de stock
      const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
      const movementRef = doc(movementsRef)

      batch.set(movementRef, {
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.ingredientName,
        type: 'sale',
        quantity: quantityToDeduct,
        unit: currentData.purchaseUnit,
        reason: `Venta: ${productName}`,
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
 */
export const adjustStock = async (businessId, ingredientId, ingredientName, newStock, reason) => {
  try {
    const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', ingredientId)
    const ingredientDoc = await getDoc(ingredientRef)

    if (!ingredientDoc.exists()) {
      throw new Error('Ingrediente no encontrado')
    }

    const currentData = ingredientDoc.data()
    const currentStock = currentData.currentStock || 0

    const batch = writeBatch(db)

    // Actualizar stock
    batch.update(ingredientRef, {
      currentStock: newStock,
      updatedAt: Timestamp.now()
    })

    // Crear movimiento
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
    const movementRef = doc(movementsRef)

    batch.set(movementRef, {
      ingredientId,
      ingredientName,
      type: 'adjustment',
      quantity: Math.abs(newStock - currentStock),
      unit: currentData.purchaseUnit,
      reason: reason || 'Ajuste manual de inventario',
      beforeStock: currentStock,
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
