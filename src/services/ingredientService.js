import {
  collection,
  doc,
  getDocs,
  getDoc,
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
import { computeBatchDeduction, computeProductBatchMetadata } from '@/utils/batchStock'

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
    const batch = writeBatch(db)

    const ingredientsRef = collection(db, 'businesses', businessId, 'ingredients')
    const ingredientRef = doc(ingredientsRef)

    const currentStock = ingredientData.currentStock || 0

    const newIngredient = {
      ...ingredientData,
      currentStock,
      averageCost: ingredientData.averageCost || 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }

    batch.set(ingredientRef, newIngredient)

    // Registrar el stock inicial como movimiento(s) de entrada (igual que los productos).
    // Sin esto, el stock inicial nunca aparece en el historial de movimientos del inventario.
    const tracksStock = ingredientData.trackStock !== false
    if (tracksStock) {
      const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')

      const addInitialMovement = (warehouseId, quantity) => {
        if (!quantity || quantity <= 0) return
        batch.set(doc(movementsRef), {
          ingredientId: ingredientRef.id,
          ingredientName: ingredientData.name || '',
          isIngredient: true,
          type: 'entry',
          quantity,
          unit: ingredientData.purchaseUnit || null,
          warehouseId: warehouseId || null,
          reason: 'Stock inicial',
          referenceType: 'initial_stock',
          referenceId: ingredientRef.id,
          beforeStock: 0,
          afterStock: quantity,
          createdAt: Timestamp.now()
        })
      }

      const warehouseStocks = Array.isArray(ingredientData.warehouseStocks) ? ingredientData.warehouseStocks : []
      if (warehouseStocks.length > 0) {
        // Un movimiento por almacén con stock inicial
        warehouseStocks.forEach(ws => addInitialMovement(ws.warehouseId, ws.stock || 0))
      } else {
        // Sin almacenes: un solo movimiento con el stock total
        addInitialMovement(null, currentStock)
      }
    }

    await batch.commit()

    return { success: true, id: ingredientRef.id }
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
    const tracksStock = currentData.trackStock !== false // Por defecto true

    // Convertir cantidad comprada a la unidad de almacenamiento si es necesario
    const quantityToAdd = convertUnit(
      purchaseData.quantity,
      purchaseData.unit,
      currentData.purchaseUnit
    )

    let newStock = currentStock
    let updatedWarehouseStocks = [...warehouseStocks]

    // Almacén efectivo de la compra: el indicado o, si el insumo YA maneja stock por
    // almacén, el primero. Así currentStock (total) y warehouseStocks[] nunca divergen
    // (antes: compra sin almacén sumaba solo a currentStock y el siguiente descuento la
    //  borraba al recalcular desde warehouseStocks).
    let effPurchaseWarehouse = purchaseData.warehouseId || null
    if (!effPurchaseWarehouse && updatedWarehouseStocks.length > 0) {
      effPurchaseWarehouse = updatedWarehouseStocks[0].warehouseId
    }

    // Solo actualizar stock si el ingrediente maneja inventario
    if (tracksStock) {
      if (effPurchaseWarehouse) {
        const warehouseIndex = updatedWarehouseStocks.findIndex(
          ws => ws.warehouseId === effPurchaseWarehouse
        )

        if (warehouseIndex >= 0) {
          updatedWarehouseStocks[warehouseIndex] = {
            ...updatedWarehouseStocks[warehouseIndex],
            stock: (updatedWarehouseStocks[warehouseIndex].stock || 0) + quantityToAdd
          }
        } else {
          // Primer almacén del insumo: si tenía stock "suelto" (currentStock sin almacén),
          // se asigna a este almacén para no descartarlo al migrar a stock por almacén.
          const seed = updatedWarehouseStocks.length === 0 ? currentStock : 0
          updatedWarehouseStocks.push({
            warehouseId: effPurchaseWarehouse,
            stock: seed + quantityToAdd
          })
        }

        newStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
      } else {
        newStock = currentStock + quantityToAdd
      }
    }

    // Calcular nuevo costo promedio (siempre se actualiza, maneje o no stock)
    // Para ingredientes sin stock, simplemente usamos el último precio de compra
    let newAvgCost
    if (!tracksStock) {
      // Sin control de stock: usar directamente el precio de compra
      newAvgCost = purchaseData.unitPrice
    } else if (currentAvgCost === 0 || currentStock === 0) {
      newAvgCost = purchaseData.unitPrice
    } else {
      const totalCurrentValue = currentStock * currentAvgCost
      const totalPurchaseValue = quantityToAdd * purchaseData.unitPrice
      newAvgCost = (totalCurrentValue + totalPurchaseValue) / newStock
    }

    const updateData = {
      averageCost: newAvgCost,
      lastPurchasePrice: purchaseData.unitPrice,
      lastPurchaseDate: purchaseData.purchaseDate || Timestamp.now(),
      updatedAt: Timestamp.now()
    }

    // Solo actualizar stock si el ingrediente maneja inventario
    if (tracksStock) {
      updateData.currentStock = newStock
      if (effPurchaseWarehouse) {
        updateData.warehouseStocks = updatedWarehouseStocks
      }
    }

    batch.update(ingredientRef, updateData)

    // 3. Crear movimiento de stock (solo si maneja inventario)
    if (tracksStock) {
      const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
      const movementRef = doc(movementsRef)

      batch.set(movementRef, {
        ingredientId: purchaseData.ingredientId,
        ingredientName: purchaseData.ingredientName,
        type: 'purchase',
        quantity: quantityToAdd,
        unit: currentData.purchaseUnit,
        warehouseId: effPurchaseWarehouse || null,
        reason: `Compra - ${purchaseData.supplier || 'Sin proveedor'}`,
        relatedPurchaseId: purchaseRef.id,
        beforeStock: currentStock,
        afterStock: newStock,
        createdAt: Timestamp.now()
      })
    }

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
/**
 * Descuenta insumos del stock. Por defecto el stock no baja de 0 (Math.max).
 * Con `allowNegative=true` permite que los insumos queden en negativo —
 * pensado para el flag `companySettings.allowNegativeStock`: si el dueño
 * acepta vender productos terminados sin stock, también acepta vender platos
 * con receta aunque falten insumos (consistencia con el comportamiento del
 * stock de productos).
 */
export const deductIngredients = async (businessId, ingredients, relatedSaleId, productName, warehouseId = null, movementType = 'sale', allowNegative = false) => {
  try {
    const batch = writeBatch(db)
    // M4: registrar de qué almacén se descontó cada insumo, para que la reversión
    // (deleteProduction) lo devuelva al MISMO almacén (deduct hace auto-pick).
    const deductions = []

    // Pre-leer todos los docs en PARALELO (antes era un getDoc EN SERIE por insumo, lento
    // con muchos insumos). El cálculo y el armado del batch se hacen después, sin awaits.
    const _refs = ingredients.map(ing =>
      doc(db, 'businesses', businessId, ing.ingredientType === 'product' ? 'products' : 'ingredients', ing.ingredientId)
    )
    const _snaps = await Promise.all(_refs.map(r => getDoc(r)))

    for (let _i = 0; _i < ingredients.length; _i++) {
      const ingredient = ingredients[_i]
      // Si es un producto terminado, descontar del stock del producto
      if (ingredient.ingredientType === 'product') {
        const productRef = _refs[_i]
        const productDoc = _snaps[_i]

        if (!productDoc.exists()) {
          console.warn(`Producto ${ingredient.ingredientName} no encontrado`)
          continue
        }

        const productData = productDoc.data()
        // Respetar productos que no controlan stock (simétrico con la rama de ingrediente crudo).
        if (productData.trackStock === false) continue
        const currentStock = productData.stock ?? productData.currentStock ?? 0
        const quantityToDeduct = ingredient.quantity
        let effectiveWarehouseId = warehouseId || ingredient.warehouseId
        const warehouseStocks = productData.warehouseStocks || []

        // Usar el almacén indicado; pero si NO se indicó, o el indicado NO existe en
        // warehouseStocks[], caer al primer almacén con stock. Antes solo caía cuando
        // effectiveWarehouseId era falsy → si llegaba un almacén ajeno al producto, el
        // descuento no ocurría pero igual se registraba un movimiento (stock fantasma).
        if (warehouseStocks.length > 0 &&
            !(effectiveWarehouseId && warehouseStocks.some(ws => ws.warehouseId === effectiveWarehouseId))) {
          const warehouseWithStock = warehouseStocks.find(ws => (ws.stock || 0) >= quantityToDeduct)
            || warehouseStocks.find(ws => (ws.stock || 0) > 0)
            || warehouseStocks[0]
          effectiveWarehouseId = warehouseWithStock.warehouseId
        }

        let newStock
        let updatedWarehouseStocks = [...warehouseStocks]

        if (effectiveWarehouseId && warehouseStocks.length > 0) {
          // Descontar del almacén específico
          const warehouseIndex = updatedWarehouseStocks.findIndex(
            ws => ws.warehouseId === effectiveWarehouseId
          )
          if (warehouseIndex >= 0) {
            const currentWarehouseStock = updatedWarehouseStocks[warehouseIndex].stock || 0
            const next = currentWarehouseStock - quantityToDeduct
            updatedWarehouseStocks[warehouseIndex] = {
              ...updatedWarehouseStocks[warehouseIndex],
              stock: allowNegative ? next : Math.max(0, next)
            }
          }
          // Recalcular stock total desde almacenes
          newStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
        } else {
          const next = currentStock - quantityToDeduct
          newStock = allowNegative ? next : Math.max(0, next)
        }

        const updateData = {
          stock: newStock,
          updatedAt: Timestamp.now()
        }
        if (warehouseStocks.length > 0) {
          updateData.warehouseStocks = updatedWarehouseStocks
        }

        // Producto-como-insumo con LOTES: descontar también de batches[] (FEFO) para no
        // descuadrar el detalle por lote respecto al total (igual que la venta directa del
        // producto). Series: no se marcan vendidas acá (un insumo no selecciona serie) —
        // limitación conocida para productos serializados usados como insumo.
        let consumedLot = null
        if (productData.trackExpiration && Array.isArray(productData.batches) && productData.batches.length > 0) {
          const result = computeBatchDeduction(productData, {}, effectiveWarehouseId, quantityToDeduct)
          if (result) {
            updateData.batches = result.updatedBatches
            const meta = computeProductBatchMetadata(result.updatedBatches)
            updateData.batchNumber = meta.batchNumber
            updateData.expirationDate = meta.expirationDate
            consumedLot = result.batchBreakdown?.[0]?.lotNumber || null
          }
        }

        batch.update(productRef, updateData)

        // Crear movimiento de stock para el producto
        const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
        const movementRef = doc(movementsRef)

        batch.set(movementRef, {
          productId: ingredient.ingredientId,
          productName: ingredient.ingredientName,
          ingredientType: 'product',
          type: movementType,
          quantity: -quantityToDeduct,
          unit: productData.unit || 'unidades',
          warehouseId: effectiveWarehouseId || null,
          reason: movementType === 'production_consumption' ? `Producción: ${productName}` : `Venta: ${productName}`,
          relatedSaleId: relatedSaleId,
          ...(consumedLot && { batchNumber: consumedLot }),
          beforeStock: currentStock,
          afterStock: newStock,
          createdAt: Timestamp.now()
        })

        deductions.push({ ingredientId: ingredient.ingredientId, ingredientType: 'product', warehouseId: effectiveWarehouseId || null })
        continue
      }

      // Ingrediente crudo: flujo existente
      const ingredientRef = _refs[_i]
      const ingredientDoc = _snaps[_i]

      if (!ingredientDoc.exists()) {
        console.warn(`Ingrediente ${ingredient.ingredientName} no encontrado`)
        continue
      }

      const currentData = ingredientDoc.data()

      // Si el ingrediente no maneja stock, omitir descuento (solo se usa para calcular costos)
      if (currentData.trackStock === false) {
        console.log(`Ingrediente ${ingredient.ingredientName} no maneja stock, omitiendo descuento`)
        continue
      }

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
      let effectiveWarehouseId = warehouseId || ingredient.warehouseId

      // Usar el almacén indicado; si NO se indicó o NO existe en warehouseStocks[],
      // caer al primer almacén con stock (evita el descuento fantasma — ver rama producto).
      if (warehouseStocks.length > 0 &&
          !(effectiveWarehouseId && warehouseStocks.some(ws => ws.warehouseId === effectiveWarehouseId))) {
        const warehouseWithStock = warehouseStocks.find(ws => (ws.stock || 0) >= quantityToDeduct)
          || warehouseStocks.find(ws => (ws.stock || 0) > 0)
          || warehouseStocks[0]
        effectiveWarehouseId = warehouseWithStock.warehouseId
      }

      if (effectiveWarehouseId && warehouseStocks.length > 0) {
        // Descontar del almacén específico
        const warehouseIndex = updatedWarehouseStocks.findIndex(
          ws => ws.warehouseId === effectiveWarehouseId
        )

        if (warehouseIndex >= 0) {
          const currentWarehouseStock = updatedWarehouseStocks[warehouseIndex].stock || 0
          const next = currentWarehouseStock - quantityToDeduct
          updatedWarehouseStocks[warehouseIndex] = {
            ...updatedWarehouseStocks[warehouseIndex],
            stock: allowNegative ? next : Math.max(0, next)
          }
        }

        // Recalcular stock total
        newStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
      } else {
        // Sin almacén específico, descontar del stock general
        const next = currentStock - quantityToDeduct
        newStock = allowNegative ? next : Math.max(0, next)
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
        quantity: -quantityToDeduct,
        unit: currentData.purchaseUnit,
        warehouseId: effectiveWarehouseId || null,
        reason: movementType === 'production_consumption' ? `Producción: ${productName}` : `Venta: ${productName}`,
        relatedSaleId: relatedSaleId,
        beforeStock: currentStock,
        afterStock: newStock,
        createdAt: Timestamp.now()
      })

      deductions.push({ ingredientId: ingredient.ingredientId, ingredientType: 'ingredient', warehouseId: effectiveWarehouseId || null })
    }

    await batch.commit()
    return { success: true, deductions }
  } catch (error) {
    console.error('Error al descontar ingredientes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Restaurar ingredientes al anular una venta (inverso de deductIngredients)
 */
export const restoreIngredients = async (businessId, ingredients, warehouseId = null) => {
  try {
    const batch = writeBatch(db)

    for (const ingredient of ingredients) {
      const isProduct = ingredient.ingredientType === 'product'
      const collectionName = isProduct ? 'products' : 'ingredients'
      const ref = doc(db, 'businesses', businessId, collectionName, ingredient.ingredientId)
      const docSnap = await getDoc(ref)

      if (!docSnap.exists()) {
        console.warn(`${isProduct ? 'Producto' : 'Ingrediente'} ${ingredient.ingredientName} no encontrado para restaurar`)
        continue
      }

      const data = docSnap.data()
      if (!isProduct && data.trackStock === false) continue

      const stockField = isProduct ? 'stock' : 'currentStock'
      const currentStock = data[stockField] ?? data.currentStock ?? data.stock ?? 0
      const warehouseStocks = data.warehouseStocks || []
      const quantityToRestore = isProduct ? ingredient.quantity : convertUnit(ingredient.quantity, ingredient.unit, data.purchaseUnit)

      let effectiveWarehouseId = warehouseId || ingredient.warehouseId
      if (!effectiveWarehouseId && warehouseStocks.length > 0) {
        effectiveWarehouseId = warehouseStocks[0].warehouseId
      }

      let newStock
      let updatedWarehouseStocks = [...warehouseStocks]

      if (effectiveWarehouseId && warehouseStocks.length > 0) {
        const idx = updatedWarehouseStocks.findIndex(ws => ws.warehouseId === effectiveWarehouseId)
        if (idx >= 0) {
          updatedWarehouseStocks[idx] = {
            ...updatedWarehouseStocks[idx],
            stock: (updatedWarehouseStocks[idx].stock || 0) + quantityToRestore
          }
        } else {
          updatedWarehouseStocks.push({ warehouseId: effectiveWarehouseId, stock: quantityToRestore, minStock: 0 })
        }
        newStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
      } else {
        newStock = currentStock + quantityToRestore
      }

      const updateData = { [stockField]: newStock, updatedAt: Timestamp.now() }
      if (warehouseStocks.length > 0 || updatedWarehouseStocks.length > 0) {
        updateData.warehouseStocks = updatedWarehouseStocks
      }
      batch.update(ref, updateData)

      // Movimiento de stock
      const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
      batch.set(doc(movementsRef), {
        // Insumo crudo → ingredientId; producto-como-insumo → productId. Antes se fijaba
        // SIEMPRE productId (incluso a insumos crudos), ensuciando la trazabilidad.
        ...(isProduct ? { productId: ingredient.ingredientId } : { ingredientId: ingredient.ingredientId }),
        productName: ingredient.ingredientName,
        type: 'void_return',
        quantity: quantityToRestore,
        unit: isProduct ? 'unidades' : (data.purchaseUnit || ingredient.unit),
        warehouseId: effectiveWarehouseId || null,
        reason: 'Anulación de venta - restauración de insumo',
        beforeStock: currentStock,
        afterStock: newStock,
        createdAt: Timestamp.now()
      })
    }

    await batch.commit()
    return { success: true }
  } catch (error) {
    console.error('Error al restaurar ingredientes:', error)
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
      const tracksStock = currentData.trackStock !== false

      // Solo revertir stock si el ingrediente maneja inventario
      if (tracksStock) {
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

        // Revertir warehouseStocks. Resolver el almacén igual que en la compra (registerPurchase):
        // el indicado o, si el insumo maneja stock por almacén, el primero. Así la reversión
        // espeja exactamente cómo se sumó (evita divergencia total vs warehouseStocks).
        let effRevertWarehouse = purchaseData.warehouseId || null
        if (!effRevertWarehouse && currentData.warehouseStocks?.length > 0) {
          effRevertWarehouse = currentData.warehouseStocks[0].warehouseId
        }
        if (effRevertWarehouse && currentData.warehouseStocks) {
          const updatedWarehouseStocks = [...currentData.warehouseStocks]
          const idx = updatedWarehouseStocks.findIndex(ws => ws.warehouseId === effRevertWarehouse)
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
          // Negativo: la reversión RESTA stock (mismo signo que las demás salidas). Antes
          // era positivo, inconsistente con la convención (quantity = cambio de stock).
          quantity: -quantityToRevert,
          unit: currentData.purchaseUnit,
          warehouseId: effRevertWarehouse || null,
          reason: `Eliminación de compra - ${purchaseData.supplier || 'Sin proveedor'}`,
          beforeStock: currentStock,
          afterStock: updateData.currentStock,
          createdAt: Timestamp.now()
        })
      }
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

/**
 * Revierte todas las compras de insumo asociadas a una compra principal (mixta).
 * Una compra de CreatePurchase con ítems de insumo crea ingredientPurchases vinculadas
 * por `relatedPurchaseId`; al eliminar la compra principal hay que revertir su stock.
 */
export const deleteIngredientPurchasesByRelated = async (businessId, relatedPurchaseId) => {
  try {
    if (!relatedPurchaseId) return { success: true, count: 0 }
    const purchasesRef = collection(db, 'businesses', businessId, 'ingredientPurchases')
    const q = query(purchasesRef, where('relatedPurchaseId', '==', relatedPurchaseId))
    const snap = await getDocs(q)
    let count = 0
    for (const d of snap.docs) {
      const res = await deleteIngredientPurchase(businessId, d.id)
      if (res.success) count++
    }
    return { success: true, count }
  } catch (error) {
    console.error('Error revirtiendo compras de insumo relacionadas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Transferir stock de ingrediente entre almacenes
 */
export const transferIngredientStock = async (businessId, ingredientId, fromWarehouseId, toWarehouseId, quantity) => {
  try {
    const ingredientRef = doc(db, 'businesses', businessId, 'ingredients', ingredientId)
    const ingredientDoc = await getDoc(ingredientRef)

    if (!ingredientDoc.exists()) {
      throw new Error('Ingrediente no encontrado')
    }

    const currentData = ingredientDoc.data()
    let updatedWarehouseStocks = [...(currentData.warehouseStocks || [])]

    // Descontar del almacén origen
    let currentFromStock = 0
    const fromIdx = updatedWarehouseStocks.findIndex(ws => ws.warehouseId === fromWarehouseId)
    if (fromIdx >= 0) {
      currentFromStock = updatedWarehouseStocks[fromIdx].stock || 0
      if (currentFromStock < quantity) {
        throw new Error(`Stock insuficiente en almacén origen. Disponible: ${currentFromStock}, Requerido: ${quantity}`)
      }
      updatedWarehouseStocks[fromIdx] = {
        ...updatedWarehouseStocks[fromIdx],
        stock: currentFromStock - quantity
      }
    } else {
      throw new Error('El ingrediente no tiene stock en el almacén origen')
    }

    // Agregar al almacén destino
    const toIdx = updatedWarehouseStocks.findIndex(ws => ws.warehouseId === toWarehouseId)
    const toBefore = toIdx >= 0 ? (updatedWarehouseStocks[toIdx].stock || 0) : 0
    if (toIdx >= 0) {
      updatedWarehouseStocks[toIdx] = {
        ...updatedWarehouseStocks[toIdx],
        stock: toBefore + quantity
      }
    } else {
      updatedWarehouseStocks.push({
        warehouseId: toWarehouseId,
        stock: quantity
      })
    }

    // El stock total no cambia en una transferencia
    const newTotalStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)

    // NOTA: NO se registran movimientos acá. Los dos callers (Inventory.jsx transferencia
    // individual y massTransferService) ya crean los movimientos transfer_out/transfer_in
    // con su contexto (referenceId, etc.). Loguearlos también acá causaría duplicados.
    await updateDoc(ingredientRef, {
      currentStock: newTotalStock,
      warehouseStocks: updatedWarehouseStocks,
      updatedAt: Timestamp.now()
    })

    return { success: true }
  } catch (error) {
    console.error('Error al transferir ingrediente:', error)
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
      // Signo conservado (antes Math.abs perdía si el ajuste subía o bajaba el stock).
      // NOTA: adjustStock hoy no se llama desde ninguna parte (código muerto reservado).
      quantity: newStock - beforeStock,
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
