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
  where,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getRecipeByProductId, checkRecipeStock, calculateRecipeCost } from './recipeService'
import { deductIngredients, restoreIngredients, convertUnit } from './ingredientService'
import { updateWarehouseStock, updateVariantWarehouseStock, createStockMovement } from './warehouseService'
import { computeProductBatchMetadata } from '@/utils/batchStock'
// updateProduct ya no se usa - producción usa transacciones para evitar datos stale

const normalizeBn = (s) => String(s || '').trim().toLowerCase()

/**
 * Construye los campos extra (batches[], serials[], campos rápidos) cuando se produce
 * un producto CON lote/vencimiento o CON números de serie. Solo aplica a productos sin
 * variantes (el modelo no soporta lotes/series por variante). Devuelve {} si no aplica.
 * Antes producción solo subía el stock total y dejaba batches[]/serials[] intactos,
 * descuadrando el detalle por lote/serie respecto al total.
 */
function buildProductionExtras(freshProduct, { batchNumber, expirationDate, serials, warehouseId, quantity, costPrice }) {
  const extras = {}
  if (freshProduct.hasVariants) return extras // lotes/series por variante no soportados

  // LOTE: agregar (o sumar) el lote producido a batches[]
  if (freshProduct.trackExpiration && batchNumber) {
    const batches = [...(freshProduct.batches || [])]
    const idx = batches.findIndex(b =>
      normalizeBn(b.lotNumber || b.batchNumber) === normalizeBn(batchNumber) &&
      (b.warehouseId || null) === (warehouseId || null)
    )
    if (idx >= 0) {
      batches[idx] = { ...batches[idx], quantity: (batches[idx].quantity || 0) + quantity }
    } else {
      batches.push({
        batchNumber,
        lotNumber: batchNumber,
        expirationDate: expirationDate || null,
        quantity,
        warehouseId: warehouseId || null,
        costPrice: costPrice || 0,
      })
    }
    extras.batches = batches
    const meta = computeProductBatchMetadata(batches)
    extras.batchNumber = meta.batchNumber
    extras.expirationDate = meta.expirationDate
  }

  // SERIES: agregar los números de serie producidos a serials[]
  if (freshProduct.trackSerials && Array.isArray(serials) && serials.length > 0) {
    const all = [...(freshProduct.serials || [])]
    const existing = new Set(all.map(s => normalizeBn(s.serialNumber)))
    serials.forEach(sn => {
      const clean = String(sn).trim()
      if (!clean || existing.has(normalizeBn(clean))) return
      all.push({ serialNumber: clean, status: 'available', warehouseId: warehouseId || null, addedVia: 'production' })
      existing.add(normalizeBn(clean))
    })
    extras.serials = all
  }

  return extras
}

/**
 * Ejecutar producción con receta (modo automático)
 * Descuenta insumos y aumenta stock del producto
 */
export const executeRecipeProduction = async (businessId, params) => {
  const { productId, productName, quantity, warehouseId, notes, userId, product, variantIndex, variantSku, batchNumber, expirationDate, serials } = params

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
    // M4: mapa ingredientId → almacén REALMENTE descontado (deduct hace auto-pick), para
    // guardarlo en la producción y que la reversión devuelva al mismo almacén.
    const deductedWarehouseById = new Map((deductResult.deductions || []).map(d => [d.ingredientId, d.warehouseId]))

    // Pasos 6-8 con COMPENSACIÓN: el descuento de insumos (paso 5) ya hizo su propio
    // commit; si algo falla después, restauramos los insumos para no perderlos (el flujo
    // no es transaccional entre los dos sistemas de stock).
    try {
    // 6. Aumentar stock del producto usando transacción (leer datos frescos)
    const productRef = doc(db, 'businesses', businessId, 'products', productId)
    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(productRef)
      if (!productDoc.exists()) throw new Error('Producto no encontrado')

      const freshProduct = { id: productDoc.id, ...productDoc.data() }
      let updateData

      let extras = {}
      if (variantIndex != null && freshProduct.variants?.length > 0) {
        const updatedProduct = updateVariantWarehouseStock(freshProduct, variantIndex, warehouseId, quantity)
        updateData = {
          variants: updatedProduct.variants,
          stock: updatedProduct.stock,
          warehouseStocks: updatedProduct.warehouseStocks,
        }
      } else {
        const updatedProduct = updateWarehouseStock(freshProduct, warehouseId, quantity)
        updateData = {
          stock: updatedProduct.stock,
          warehouseStocks: updatedProduct.warehouseStocks
        }
        // Lotes/series del producto producido (solo productos sin variantes)
        extras = buildProductionExtras(freshProduct, {
          batchNumber, expirationDate, serials, warehouseId, quantity,
          costPrice: quantity > 0 ? (totalCost / quantity) : 0,
        })
      }

      transaction.update(productRef, {
        ...updateData,
        ...extras,
        updatedAt: serverTimestamp()
      })
    })

    // 7. Crear movimiento de stock
    await createStockMovement(businessId, {
      productId,
      warehouseId,
      type: 'production',
      quantity: quantity,
      reason: `Producción con receta: ${productName} (x${quantity})`,
      referenceType: 'production',
      userId,
      ...(variantSku && { variantSku }),
      ...(batchNumber && { batchNumber }),
      notes: (notes || `Producción automática de ${quantity} unidades`) +
        (serials?.length ? ` | Series: ${serials.join(', ')}` : '')
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
      ...(batchNumber && { batchNumber, expirationDate: expirationDate || null }),
      ...(serials?.length && { serials }),
      ingredientsDeducted: ingredientsToDeduct.map(ing => ({
        ingredientId: ing.ingredientId,
        ingredientName: ing.ingredientName,
        quantity: ing.quantity,
        unit: ing.unit,
        // Guardar el tipo para que la reversión NO tenga que adivinar sondeando Firestore
        // (evita colisión de IDs producto/insumo y una lectura extra por insumo).
        ingredientType: ing.ingredientType || null,
        // M4: almacén realmente descontado; la reversión devuelve aquí (no al de producción).
        warehouseId: deductedWarehouseById.has(ing.ingredientId) ? deductedWarehouseById.get(ing.ingredientId) : warehouseId,
      })),
      totalCost,
      notes: notes || '',
      userId,
      createdAt: Timestamp.now()
    }

    const productionsRef = collection(db, 'businesses', businessId, 'productions')
    const docRef = await addDoc(productionsRef, productionData)

    return { success: true, id: docRef.id, totalCost }
    } catch (innerErr) {
      // Compensar: devolver los insumos descontados en el paso 5.
      try {
        await restoreIngredients(businessId, ingredientsToDeduct, warehouseId)
        console.warn('Producción fallida tras descontar insumos: insumos restaurados (compensación).')
      } catch (restoreErr) {
        console.error('Error restaurando insumos tras fallo de producción:', restoreErr)
      }
      throw innerErr
    }
  } catch (error) {
    console.error('Error en producción con receta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Ejecutar producción manual (solo aumenta stock)
 */
export const executeManualProduction = async (businessId, params) => {
  const { productId, productName, quantity, warehouseId, notes, userId, product, variantIndex, variantSku, batchNumber, expirationDate, serials } = params

  try {
    // 1. Aumentar stock del producto usando transacción (leer datos frescos de Firestore)
    const productRef = doc(db, 'businesses', businessId, 'products', productId)
    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(productRef)
      if (!productDoc.exists()) throw new Error('Producto no encontrado')

      const freshProduct = { id: productDoc.id, ...productDoc.data() }
      let updateData
      let extras = {}

      if (variantIndex != null && freshProduct.variants?.length > 0) {
        const updatedProduct = updateVariantWarehouseStock(freshProduct, variantIndex, warehouseId, quantity)
        updateData = {
          variants: updatedProduct.variants,
          stock: updatedProduct.stock,
          warehouseStocks: updatedProduct.warehouseStocks,
        }
      } else {
        const updatedProduct = updateWarehouseStock(freshProduct, warehouseId, quantity)
        updateData = {
          stock: updatedProduct.stock,
          warehouseStocks: updatedProduct.warehouseStocks
        }
        // Lotes/series del producto producido (solo productos sin variantes)
        extras = buildProductionExtras(freshProduct, {
          batchNumber, expirationDate, serials, warehouseId, quantity,
          costPrice: freshProduct.costPrice || product?.costPrice || 0,
        })
      }

      transaction.update(productRef, {
        ...updateData,
        ...extras,
        updatedAt: serverTimestamp()
      })
    })

    // 2. Crear movimiento de stock
    await createStockMovement(businessId, {
      productId,
      warehouseId,
      type: 'production_manual',
      quantity: quantity,
      reason: `Producción manual: ${productName} (x${quantity})`,
      referenceType: 'production_manual',
      userId,
      ...(variantSku && { variantSku }),
      ...(batchNumber && { batchNumber }),
      notes: (notes || `Producción manual de ${quantity} unidades`) +
        (serials?.length ? ` | Series: ${serials.join(', ')}` : '')
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
      ...(batchNumber && { batchNumber, expirationDate: expirationDate || null }),
      ...(serials?.length && { serials }),
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
    const { productId, quantity, warehouseId, mode, ingredientsDeducted, variantIndex, variantSku, batchNumber, serials } = production

    const batch = writeBatch(db)

    // 1. Revertir stock del producto producido (restar lo que se añadió)
    const productRef = doc(db, 'businesses', businessId, 'products', productId)
    const productDoc = await getDoc(productRef)

    if (productDoc.exists()) {
      const productData = productDoc.data()
      if (productData.stock !== null && productData.trackStock !== false) {
        // Si la producción fue de una variante específica, revertir a nivel de variante
        if (variantIndex != null && productData.variants?.length > variantIndex) {
          const updatedProduct = updateVariantWarehouseStock(
            { id: productId, ...productData },
            variantIndex,
            warehouseId,
            -quantity
          )
          batch.update(productRef, {
            variants: updatedProduct.variants,
            stock: updatedProduct.stock,
            warehouseStocks: updatedProduct.warehouseStocks,
            updatedAt: Timestamp.now(),
          })
        } else {
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

          // Revertir también el lote/serie producido para no descuadrar el detalle
          const reverseExtras = {}
          if (batchNumber && Array.isArray(productData.batches)) {
            const batches = [...productData.batches]
            const idx = batches.findIndex(b =>
              normalizeBn(b.lotNumber || b.batchNumber) === normalizeBn(batchNumber) &&
              (b.warehouseId || null) === (warehouseId || null)
            )
            if (idx >= 0) {
              batches[idx] = { ...batches[idx], quantity: Math.max(0, (batches[idx].quantity || 0) - quantity) }
              reverseExtras.batches = batches
              const meta = computeProductBatchMetadata(batches)
              reverseExtras.batchNumber = meta.batchNumber
              reverseExtras.expirationDate = meta.expirationDate
            }
          }
          if (Array.isArray(serials) && serials.length > 0 && Array.isArray(productData.serials)) {
            const toRemove = new Set(serials.map(s => normalizeBn(s)))
            reverseExtras.serials = productData.serials.filter(s =>
              !(toRemove.has(normalizeBn(s.serialNumber)) && s.status === 'available')
            )
          }

          batch.update(productRef, {
            stock: newStock,
            warehouseStocks,
            ...reverseExtras,
            updatedAt: Timestamp.now()
          })
        }

        // Movimiento de reversión del producto
        const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
        batch.set(doc(movementsRef), {
          productId,
          productName: production.productName,
          type: 'production_reversal',
          quantity: -quantity,
          warehouseId: warehouseId || null,
          ...(variantSku && { variantSku }),
          reason: `Reversión de producción: ${production.productName}`,
          createdAt: Timestamp.now()
        })
      }
    }

    // 2. Para producciones con receta: devolver stock de insumos
    if (mode === 'recipe' && ingredientsDeducted?.length > 0) {
      for (const ing of ingredientsDeducted) {
        // M4: devolver al almacén realmente descontado (guardado por insumo); fallback al
        // almacén de producción para producciones legacy sin warehouseId.
        const ingWh = ing.warehouseId || warehouseId
        // Intentar primero como producto terminado
        const asProductRef = doc(db, 'businesses', businessId, 'products', ing.ingredientId)
        const asProductDoc = await getDoc(asProductRef)

        // Preferir el tipo guardado (robusto ante colisión de IDs); si falta (producciones
        // legacy sin ingredientType), caer al sondeo de existencia del producto.
        const treatAsProduct = ing.ingredientType
          ? ing.ingredientType === 'product'
          : asProductDoc.exists()

        if (treatAsProduct && asProductDoc.exists()) {
          // Es un producto terminado usado como insumo
          const pData = asProductDoc.data()
          if (pData.stock !== null && pData.trackStock !== false) {
            const wStocks = [...(pData.warehouseStocks || [])]
            const wIdx = wStocks.findIndex(ws => ws.warehouseId === ingWh)

            if (wIdx >= 0) {
              wStocks[wIdx] = { ...wStocks[wIdx], stock: (wStocks[wIdx].stock || 0) + ing.quantity }
            } else if (wStocks.length > 0) {
              wStocks.push({ warehouseId: ingWh, stock: ing.quantity, minStock: 0 })
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
              warehouseId: ingWh || null,
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
            // Convertir la cantidad de la receta a la unidad de almacenamiento, IGUAL que
            // el descuento (deductIngredients). Antes la reversión devolvía ing.quantity en
            // la unidad de la receta → cantidad equivocada si difería de purchaseUnit.
            const revertQty = convertUnit(ing.quantity, ing.unit, iData.purchaseUnit)
            const wStocks = [...(iData.warehouseStocks || [])]
            const wIdx = wStocks.findIndex(ws => ws.warehouseId === ingWh)

            if (wIdx >= 0) {
              wStocks[wIdx] = { ...wStocks[wIdx], stock: (wStocks[wIdx].stock || 0) + revertQty }
            } else if (wStocks.length > 0) {
              wStocks.push({ warehouseId: ingWh, stock: revertQty, minStock: 0 })
            }

            const newStock = wStocks.length > 0
              ? wStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
              : (iData.currentStock || 0) + revertQty

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
              quantity: revertQty,
              unit: iData.purchaseUnit || ing.unit || null,
              warehouseId: ingWh || null,
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
