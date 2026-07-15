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
import { transferProductStockTransaction } from '@/services/firestoreService'
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
 * @param {Object} transferData - { fromWarehouseId, fromWarehouseName, toWarehouseId, toWarehouseName, items, notes, userId, userName, isDischarge }
 * items: [{ productId, productName, productCode, quantity, unit, batchNumber?, batchData?, batches? }]
 *
 * isDischarge: DESCARGA DE STOCK — el stock sale del origen y no entra a ningún
 * almacén (se descarta). Mismo flujo y documento que un traslado, pero sin
 * destino ni movimiento de entrada.
 */
export const createMassTransfer = async (businessId, transferData) => {
  try {
    const isDischarge = transferData.isDischarge === true
    const number = await getNextTransferNumber(businessId)
    const totalItems = transferData.items.reduce((sum, item) => sum + item.quantity, 0)
    // En una descarga no hay destino: se fuerza null aunque el caller mande algo.
    const toWarehouseId = isDischarge ? null : transferData.toWarehouseId
    const toWarehouseName = isDischarge ? null : transferData.toWarehouseName
    const reasonLabel = isDischarge ? 'Descarga de stock' : 'Transferencia masiva'

    // Guardar documento de transferencia masiva
    const docRef = await addDoc(collection(db, 'businesses', businessId, 'massTransfers'), {
      number,
      isDischarge,
      fromWarehouseId: transferData.fromWarehouseId,
      fromWarehouseName: transferData.fromWarehouseName,
      toWarehouseId,
      toWarehouseName,
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
          toWarehouseId,
          item.quantity
        )

        if (!ingredientResult.success) {
          console.error(`Error al ${isDischarge ? 'descargar' : 'transferir'} ingrediente ${item.productName}:`, ingredientResult.error)
          failedItems.push({ productId: item.productId, productName: item.productName, error: ingredientResult.error || 'Error al transferir insumo' })
          continue
        }

        // Movimiento de salida para ingrediente
        await createStockMovement(businessId, {
          ingredientId: item.productId,
          ingredientName: item.productName,
          warehouseId: transferData.fromWarehouseId,
          type: isDischarge ? 'discharge' : 'transfer_out',
          quantity: -item.quantity,
          unit: item.unit || 'und',
          reason: reasonLabel,
          referenceType: 'mass_transfer',
          referenceId: docRef.id,
          ...(!isDischarge && { toWarehouse: toWarehouseId }),
          userId: transferData.userId,
          isIngredient: true,
          notes: isDischarge ? `${number} (descarga)` : `${number} → ${toWarehouseName}`,
        })

        // Movimiento de entrada para ingrediente (no aplica en descarga)
        if (!isDischarge) {
          await createStockMovement(businessId, {
            ingredientId: item.productId,
            ingredientName: item.productName,
            warehouseId: toWarehouseId,
            type: 'transfer_in',
            quantity: item.quantity,
            unit: item.unit || 'und',
            reason: reasonLabel,
            referenceType: 'mass_transfer',
            referenceId: docRef.id,
            fromWarehouse: transferData.fromWarehouseId,
            userId: transferData.userId,
            isIngredient: true,
            notes: `${number} ← ${transferData.fromWarehouseName}`,
          })
        }

        continue
      }

      // Flujo normal para productos — transferencia ATÓMICA (Fase 2): salida del origen
      // + entrada al destino en UNA sola transacción que lee fresco y mueve
      // warehouseStocks + el lote indicado + series juntos. Evita el stock evaporado
      // (antes 2 transacciones) y el clobber de lotes por snapshot viejo.
      const transferRes = await transferProductStockTransaction(
        businessId,
        item.productId,
        transferData.fromWarehouseId,
        toWarehouseId, // null en descarga: solo descuenta del origen
        item.quantity,
        {
          variantSku: item.variantSku || null,
          batchNumber: item.batchNumber === '__NO_LOT__' ? null : (item.batchNumber || null),
          isNoLot: item.batchNumber === '__NO_LOT__',
          serialNumbers: item.serialNumbers || item.selectedSerials || [],
          allowNegative: true,
        }
      )
      if (!transferRes.success) {
        console.error(`Error al ${isDischarge ? 'descargar' : 'transferir'} ${item.productName}:`, transferRes.error)
        failedItems.push({ productId: item.productId, productName: item.productName, error: transferRes.error || 'Error al transferir stock' })
        continue
      }

      const variantNote = item.variantSku ? ` (${item.variantSku}${item.variantLabel ? ': ' + item.variantLabel : ''})` : ''
      const serialNote = (item.serialNumbers && item.serialNumbers.length > 0)
        ? ` (Series: ${item.serialNumbers.join(', ')})` : ''

      const detailNote = `${item.batchNumber === '__NO_LOT__' ? ' (Sin lote)' : item.batchNumber ? ` (Lote: ${item.batchNumber})` : ''}${variantNote}${serialNote}`

      // Movimiento de salida
      await createStockMovement(businessId, {
        productId: item.productId,
        warehouseId: transferData.fromWarehouseId,
        type: isDischarge ? 'discharge' : 'transfer_out',
        quantity: -item.quantity,
        reason: reasonLabel,
        referenceType: 'mass_transfer',
        referenceId: docRef.id,
        ...(!isDischarge && { toWarehouse: toWarehouseId }),
        userId: transferData.userId,
        ...(item.batchNumber && item.batchNumber !== '__NO_LOT__' && { batchNumber: item.batchNumber }),
        ...(item.variantSku && { variantSku: item.variantSku }),
        ...(item.serialNumbers?.length > 0 && { serialNumbers: item.serialNumbers }),
        notes: `${number}${isDischarge ? ' (descarga)' : ` → ${toWarehouseName}`}${detailNote}`,
      })

      // Movimiento de entrada (no aplica en descarga: el stock no va a ningún lado)
      if (!isDischarge) {
        await createStockMovement(businessId, {
          productId: item.productId,
          warehouseId: toWarehouseId,
          type: 'transfer_in',
          quantity: item.quantity,
          reason: reasonLabel,
          referenceType: 'mass_transfer',
          referenceId: docRef.id,
          fromWarehouse: transferData.fromWarehouseId,
          userId: transferData.userId,
          ...(item.batchNumber && item.batchNumber !== '__NO_LOT__' && { batchNumber: item.batchNumber }),
          ...(item.variantSku && { variantSku: item.variantSku }),
          ...(item.serialNumbers?.length > 0 && { serialNumbers: item.serialNumbers }),
          notes: `${number} ← ${transferData.fromWarehouseName}${detailNote}`,
        })
      }
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
