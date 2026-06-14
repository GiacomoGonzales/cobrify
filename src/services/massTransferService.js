import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore'
import { createStockMovement } from '@/services/warehouseService'
import { updateProductStockTransaction } from '@/services/firestoreService'
import { transferIngredientStock } from '@/services/ingredientService'

/**
 * Servicio de Transferencias Masivas entre Almacenes
 * Colección: businesses/{businessId}/massTransfers
 */

const getNextTransferNumber = async (businessId) => {
  const counterRef = doc(db, 'businesses', businessId, 'counters', 'massTransfers')
  const num = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef)
    const current = counterDoc.exists() ? (counterDoc.data().lastNumber || 0) : 0
    const next = current + 1
    transaction.set(counterRef, { lastNumber: next }, { merge: true })
    return next
  })
  return `TRANS-${String(num).padStart(5, '0')}`
}

export const getMassTransfers = async (businessId) => {
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'massTransfers'),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)
    const transfers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    return { success: true, data: transfers }
  } catch (error) {
    console.error('Error al obtener transferencias:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear transferencia masiva
 * @param {string} businessId
 * @param {Object} transferData - { fromWarehouseId, fromWarehouseName, toWarehouseId, toWarehouseName, items, notes, userId, userName }
 * items: [{ productId, productName, productCode, quantity, unit, batchNumber?, batchData?, batches? }]
 */
export const createMassTransfer = async (businessId, transferData) => {
  try {
    const number = await getNextTransferNumber(businessId)
    const totalItems = transferData.items.reduce((sum, item) => sum + item.quantity, 0)

    // Guardar documento de transferencia masiva
    const docRef = await addDoc(collection(db, 'businesses', businessId, 'massTransfers'), {
      number,
      fromWarehouseId: transferData.fromWarehouseId,
      fromWarehouseName: transferData.fromWarehouseName,
      toWarehouseId: transferData.toWarehouseId,
      toWarehouseName: transferData.toWarehouseName,
      items: transferData.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        productCode: item.productCode || '',
        quantity: item.quantity,
        unit: item.unit || 'und',
        batchNumber: item.batchNumber === '__NO_LOT__' ? null : (item.batchNumber || null),
        isNoLot: item.batchNumber === '__NO_LOT__' || false,
        batchExpiration: item.batchExpiration || null,
        variantSku: item.variantSku || null,
        variantLabel: item.variantLabel || null,
        // El modal manda las series en `serialNumbers`; antes se leía `selectedSerials`
        // (undefined) → el doc guardaba siempre [] (no quedaba qué series se movieron).
        selectedSerials: item.serialNumbers || item.selectedSerials || [],
        isIngredient: item.isIngredient || false,
      })),
      totalItems,
      totalProducts: transferData.items.length,
      notes: transferData.notes || '',
      userId: transferData.userId,
      userName: transferData.userName || '',
      // 'processing' hasta que terminen los movimientos; al final se marca completed/partial/
      // failed según el resultado. Antes se creaba 'completed' ANTES de mover stock → el doc
      // mentía si algún ítem fallaba.
      status: 'processing',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // Ejecutar transferencias de stock por cada item. Se recolectan los fallos en vez de
    // saltarlos en silencio.
    const failedItems = []
    for (const item of transferData.items) {
      // Si es ingrediente, usar flujo específico
      if (item.isIngredient) {
        const ingredientResult = await transferIngredientStock(
          businessId,
          item.productId,
          transferData.fromWarehouseId,
          transferData.toWarehouseId,
          item.quantity
        )

        if (!ingredientResult.success) {
          console.error(`Error al transferir ingrediente ${item.productName}:`, ingredientResult.error)
          failedItems.push({ productId: item.productId, productName: item.productName, error: ingredientResult.error || 'Error al transferir insumo' })
          continue
        }

        // Movimiento de salida para ingrediente
        await createStockMovement(businessId, {
          ingredientId: item.productId,
          ingredientName: item.productName,
          warehouseId: transferData.fromWarehouseId,
          type: 'transfer_out',
          quantity: -item.quantity,
          unit: item.unit || 'und',
          reason: 'Transferencia masiva',
          referenceType: 'mass_transfer',
          referenceId: docRef.id,
          toWarehouse: transferData.toWarehouseId,
          userId: transferData.userId,
          isIngredient: true,
          notes: `${number} → ${transferData.toWarehouseName}`,
        })

        // Movimiento de entrada para ingrediente
        await createStockMovement(businessId, {
          ingredientId: item.productId,
          ingredientName: item.productName,
          warehouseId: transferData.toWarehouseId,
          type: 'transfer_in',
          quantity: item.quantity,
          unit: item.unit || 'und',
          reason: 'Transferencia masiva',
          referenceType: 'mass_transfer',
          referenceId: docRef.id,
          fromWarehouse: transferData.fromWarehouseId,
          userId: transferData.userId,
          isIngredient: true,
          notes: `${number} ← ${transferData.fromWarehouseName}`,
        })

        continue
      }

      // Flujo normal para productos
      // Salida del almacén origen. allowNegative=true: si el origen no tuviera suficiente,
      // se descuenta igual (puede quedar negativo, visible y corregible) en vez de clampar
      // a 0 y sumar al destino la cantidad completa → eso CREABA stock fantasma (el total
      // subía). Con allowNegative el total se preserva.
      const exitResult = await updateProductStockTransaction(
        businessId,
        item.productId,
        transferData.fromWarehouseId,
        -item.quantity,
        {},
        item.variantSku || null,
        null,
        true
      )
      if (!exitResult.success) {
        console.error(`Error al descontar stock de ${item.productName}:`, exitResult.error)
        failedItems.push({ productId: item.productId, productName: item.productName, error: exitResult.error || 'Error al descontar stock' })
        continue
      }

      // Entrada al almacén destino (con actualización de lotes si aplica)
      const extraUpdates = {}
      // Si es transferencia "Sin lote", NO procesar lotes - solo mover stock general
      if (item.batchData && !item.batchData.isNoLot) {
        const batchId = item.batchNumber
        let updatedBatches = (item.batches || []).map(b => {
          const bId = b.lotNumber || b.batchNumber || b.id
          if (bId === batchId && (!b.warehouseId || b.warehouseId === transferData.fromWarehouseId)) {
            return { ...b, quantity: b.quantity - item.quantity, warehouseId: b.warehouseId || transferData.fromWarehouseId }
          }
          return b
        })

        // Crear o actualizar lote en almacén destino
        const existingDestBatch = updatedBatches.find(b => {
          const bId = b.lotNumber || b.batchNumber || b.id
          return bId === batchId && b.warehouseId === transferData.toWarehouseId
        })

        if (existingDestBatch) {
          updatedBatches = updatedBatches.map(b => {
            const bId = b.lotNumber || b.batchNumber || b.id
            if (bId === batchId && b.warehouseId === transferData.toWarehouseId) {
              return { ...b, quantity: b.quantity + item.quantity }
            }
            return b
          })
        } else {
          updatedBatches.push({
            ...item.batchData,
            id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            quantity: item.quantity,
            warehouseId: transferData.toWarehouseId,
          })
        }

        // Limpiar lotes con cantidad 0
        updatedBatches = updatedBatches.filter(b => b.quantity > 0)

        extraUpdates.batches = updatedBatches

        const activeBatches = updatedBatches.filter(b => b.quantity > 0 && (b.expirationDate || b.expiryDate))
        if (activeBatches.length > 0) {
          activeBatches.sort((a, b) => {
            const dateA = (a.expirationDate || a.expiryDate)?.toDate?.() || new Date(a.expirationDate || a.expiryDate || '2099-12-31')
            const dateB = (b.expirationDate || b.expiryDate)?.toDate?.() || new Date(b.expirationDate || b.expiryDate || '2099-12-31')
            return dateA - dateB
          })
          extraUpdates.expirationDate = activeBatches[0].expirationDate || activeBatches[0].expiryDate
          extraUpdates.batchNumber = activeBatches[0].lotNumber || activeBatches[0].batchNumber
        } else {
          extraUpdates.expirationDate = null
          extraUpdates.batchNumber = null
        }
      }

      // Transferir números de serie si aplica
      if (item.serialNumbers && item.serialNumbers.length > 0 && item.serials) {
        const updatedSerials = (item.serials || []).map(s => {
          if (item.serialNumbers.includes(s.serialNumber) && s.status === 'available') {
            return { ...s, warehouseId: transferData.toWarehouseId }
          }
          return s
        })
        extraUpdates.serials = updatedSerials
      }

      await updateProductStockTransaction(
        businessId,
        item.productId,
        transferData.toWarehouseId,
        item.quantity,
        extraUpdates,
        item.variantSku || null
      )

      const variantNote = item.variantSku ? ` (${item.variantSku}${item.variantLabel ? ': ' + item.variantLabel : ''})` : ''
      const serialNote = (item.serialNumbers && item.serialNumbers.length > 0)
        ? ` (Series: ${item.serialNumbers.join(', ')})` : ''

      // Movimiento de salida
      await createStockMovement(businessId, {
        productId: item.productId,
        warehouseId: transferData.fromWarehouseId,
        type: 'transfer_out',
        quantity: -item.quantity,
        reason: 'Transferencia masiva',
        referenceType: 'mass_transfer',
        referenceId: docRef.id,
        toWarehouse: transferData.toWarehouseId,
        userId: transferData.userId,
        ...(item.batchNumber && item.batchNumber !== '__NO_LOT__' && { batchNumber: item.batchNumber }),
        ...(item.variantSku && { variantSku: item.variantSku }),
        ...(item.serialNumbers?.length > 0 && { serialNumbers: item.serialNumbers }),
        notes: `${number} → ${transferData.toWarehouseName}${item.batchNumber === '__NO_LOT__' ? ' (Sin lote)' : item.batchNumber ? ` (Lote: ${item.batchNumber})` : ''}${variantNote}${serialNote}`,
      })

      // Movimiento de entrada
      await createStockMovement(businessId, {
        productId: item.productId,
        warehouseId: transferData.toWarehouseId,
        type: 'transfer_in',
        quantity: item.quantity,
        reason: 'Transferencia masiva',
        referenceType: 'mass_transfer',
        referenceId: docRef.id,
        fromWarehouse: transferData.fromWarehouseId,
        userId: transferData.userId,
        ...(item.batchNumber && item.batchNumber !== '__NO_LOT__' && { batchNumber: item.batchNumber }),
        ...(item.variantSku && { variantSku: item.variantSku }),
        ...(item.serialNumbers?.length > 0 && { serialNumbers: item.serialNumbers }),
        notes: `${number} ← ${transferData.fromWarehouseName}${item.batchNumber === '__NO_LOT__' ? ' (Sin lote)' : item.batchNumber ? ` (Lote: ${item.batchNumber})` : ''}${variantNote}${serialNote}`,
      })
    }

    // Reflejar el resultado real en el documento (antes quedaba 'completed' siempre).
    const allFailed = transferData.items.length > 0 && failedItems.length === transferData.items.length
    const finalStatus = failedItems.length === 0
      ? 'completed'
      : (allFailed ? 'failed' : 'partial')
    await updateDoc(docRef, {
      status: finalStatus,
      ...(failedItems.length > 0 && { failedItems }),
      updatedAt: serverTimestamp(),
    })

    // success=true salvo que TODO haya fallado; el caller muestra un aviso si hay parciales.
    return {
      success: !allFailed,
      id: docRef.id,
      number,
      status: finalStatus,
      failedItems,
      ...(allFailed && { error: 'No se pudo transferir ningún ítem' }),
    }
  } catch (error) {
    console.error('Error al crear transferencia masiva:', error)
    return { success: false, error: error.message }
  }
}
