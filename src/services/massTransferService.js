import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore'
import { createStockMovement } from '@/services/warehouseService'
import { updateProductStockTransaction } from '@/services/firestoreService'

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
        batchNumber: item.batchNumber || null,
        batchExpiration: item.batchExpiration || null,
      })),
      totalItems,
      totalProducts: transferData.items.length,
      notes: transferData.notes || '',
      userId: transferData.userId,
      userName: transferData.userName || '',
      status: 'completed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // Ejecutar transferencias de stock por cada item
    for (const item of transferData.items) {
      // Salida del almacén origen
      const exitResult = await updateProductStockTransaction(
        businessId,
        item.productId,
        transferData.fromWarehouseId,
        -item.quantity,
        {},
        item.variantSku || null
      )
      if (!exitResult.success) {
        console.error(`Error al descontar stock de ${item.productName}:`, exitResult.error)
        continue
      }

      // Entrada al almacén destino (con actualización de lotes si aplica)
      const extraUpdates = {}
      if (item.batchData) {
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

      await updateProductStockTransaction(
        businessId,
        item.productId,
        transferData.toWarehouseId,
        item.quantity,
        extraUpdates,
        item.variantSku || null
      )

      const variantNote = item.variantSku ? ` (${item.variantSku}${item.variantLabel ? ': ' + item.variantLabel : ''})` : ''

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
        ...(item.batchNumber && { batchNumber: item.batchNumber }),
        ...(item.variantSku && { variantSku: item.variantSku }),
        notes: `${number} → ${transferData.toWarehouseName}${item.batchNumber ? ` (Lote: ${item.batchNumber})` : ''}${variantNote}`,
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
        ...(item.batchNumber && { batchNumber: item.batchNumber }),
        ...(item.variantSku && { variantSku: item.variantSku }),
        notes: `${number} ← ${transferData.fromWarehouseName}${item.batchNumber ? ` (Lote: ${item.batchNumber})` : ''}${variantNote}`,
      })
    }

    return { success: true, id: docRef.id, number }
  } catch (error) {
    console.error('Error al crear transferencia masiva:', error)
    return { success: false, error: error.message }
  }
}
