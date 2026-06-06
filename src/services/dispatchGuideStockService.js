// Lógica compartida de descuento y restauración de stock para guías de remisión.
//
// Por qué este archivo existe:
//   La lógica vivía duplicada en 4 lugares (creación de guía, anulación, toggle manual
//   de descuento, toggle manual de restauración). Las copias divergieron: ninguna
//   manejaba lotes/vencimientos pese a que la UI permite seleccionar lote. Esto causaba
//   inconsistencia entre `product.stock` (que sí bajaba) y `product.batches[].quantity`
//   (que se quedaba intacto).
//
// Qué hace ahora:
//   - Deduct: descuenta del lote seleccionado por el usuario, o aplica FEFO si no
//     hay selección. Guarda el desglose en `guide.items[i].batchBreakdown` para
//     que la restauración sepa exactamente qué reponer a cada lote.
//   - Restore: si la guía tiene `batchBreakdown` (creada con la lógica nueva),
//     restaura por lote. Si no (guía legacy), solo restaura stock total — el
//     comportamiento equivalente al de antes.
//
// Mirrors lógica del POS en src/pages/POS.jsx:5326-5427.

import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { updateProductStockTransaction, updateDispatchGuide } from './firestoreService'
import { createStockMovement } from './warehouseService'
import { computeBatchDeduction, computeProductBatchMetadata } from '@/utils/batchStock'

/**
 * Descuenta stock de una guía de remisión. Devuelve el desglose por ítem para que
 * el caller lo persista en la guía (necesario para que la restauración funcione).
 *
 * @param {Object} params
 * @param {string} params.businessId
 * @param {Object} params.guide - debe tener id, number, items[], warehouseId
 * @param {string} params.userId - uid del usuario que ejecuta la acción
 * @param {boolean} [params.persistToGuide=true] - si true, guarda items con batchBreakdown
 *        y stockDeducted=true en la guía. Si false, el caller debe persistirlo
 *        (caso de creación, donde guide.id aún no existe en la firma original).
 * @returns {Promise<{success: boolean, itemsWithBreakdown?: Array, error?: string}>}
 */
export async function deductStockForDispatchGuide({ businessId, guide, userId, persistToGuide = true }) {
  if (!guide?.warehouseId) {
    return { success: false, error: 'La guía no tiene almacén asignado' }
  }

  const allItems = guide.items || []
  const itemsWithBreakdown = [...allItems]

  // Agrupar items con número de serie por (productId|variantSku|warehouseId).
  // Cada serie viene como item separado con quantity=1; consolidar en 1 transacción
  // por grupo evita N transacciones concurrentes sobre el mismo doc Firestore
  // (mismo patrón que POS.jsx:5267-5271).
  const serialGroupKey = (item) => `${item.productId}|${item.variantSku || ''}|${guide.warehouseId}`
  const serialGroups = new Map()
  const nonSerialIndices = []

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i]
    if (!item.productId || !(parseFloat(item.quantity) > 0)) continue
    if (item.serialNumber) {
      const key = serialGroupKey(item)
      if (!serialGroups.has(key)) serialGroups.set(key, [])
      serialGroups.get(key).push({ item, index: i })
    } else {
      nonSerialIndices.push(i)
    }
  }

  try {
    // 1. Procesar items NO seriados (uno por uno; cada uno puede tener lote distinto).
    for (const i of nonSerialIndices) {
      const item = allItems[i]

      const productSnap = await getDoc(doc(db, 'businesses', businessId, 'products', item.productId))
      if (!productSnap.exists()) {
        console.warn(`[DispatchGuide] Producto ${item.productId} no existe, omitiendo`)
        continue
      }
      const productData = productSnap.data()
      if (productData.trackStock === false) continue

      const quantityToDeduct = parseFloat(item.quantity)
      const extraUpdates = {}
      let batchBreakdown = null

      // Batches: solo aplica si el producto NO tiene variantes. updateProductStockTransaction
      // ignora extraUpdates.batches en el path de variantes (firestoreService.js:678-737),
      // así que no perdemos nada filtrando aquí — y nos ahorra cómputo.
      if (!productData.hasVariants) {
        const computed = computeBatchDeduction(productData, item, guide.warehouseId, quantityToDeduct)
        if (computed) {
          extraUpdates.batches = computed.updatedBatches
          batchBreakdown = computed.batchBreakdown
          const meta = computeProductBatchMetadata(computed.updatedBatches)
          extraUpdates.expirationDate = meta.expirationDate
          extraUpdates.batchNumber = meta.batchNumber
        }
      }

      await updateProductStockTransaction(
        businessId, item.productId, guide.warehouseId,
        -quantityToDeduct, extraUpdates, item.variantSku || null
      )

      await createStockMovement(businessId, {
        productId: item.productId,
        productName: item.description || item.name || '',
        warehouseId: guide.warehouseId,
        type: 'exit',
        quantity: -quantityToDeduct,
        reason: 'Guía de remisión',
        referenceType: 'dispatch_guide',
        referenceId: guide.id,
        referenceNumber: guide.number,
        userId: userId || '',
        ...(item.batchNumber && { batchNumber: item.batchNumber }),
        ...(item.variantSku && { variantSku: item.variantSku }),
        notes: `Despacho: ${guide.number}${item.batchNumber ? ` Lote: ${item.batchNumber}` : ''}`
      })

      if (batchBreakdown && batchBreakdown.length > 0) {
        itemsWithBreakdown[i] = { ...item, batchBreakdown }
      }
    }

    // 2. Procesar grupos de series: 1 transacción por grupo (todas las series del mismo
    //    producto+variante+almacén). Los serializados no usan batches (mismo trato que POS).
    for (const group of serialGroups.values()) {
      const firstItem = group[0].item
      const productSnap = await getDoc(doc(db, 'businesses', businessId, 'products', firstItem.productId))
      if (!productSnap.exists()) {
        console.warn(`[DispatchGuide] Producto ${firstItem.productId} no existe, omitiendo serial group`)
        continue
      }
      const productData = productSnap.data()
      if (productData.trackStock === false) continue

      const totalQty = group.reduce((sum, g) => sum + parseFloat(g.item.quantity), 0)
      const serialsToMark = new Set(group.map(g => g.item.serialNumber))

      const extraUpdates = {}
      if (productData.serials?.length > 0) {
        extraUpdates.serials = productData.serials.map(s =>
          serialsToMark.has(s.serialNumber) && s.status === 'available'
            ? { ...s, status: 'dispatched', dispatchGuideId: guide.id }
            : s
        )
      }

      await updateProductStockTransaction(
        businessId, firstItem.productId, guide.warehouseId,
        -totalQty, extraUpdates, firstItem.variantSku || null
      )

      // Un stockMovement por cada serie (para que el historial muestre cada S/N).
      for (const { item } of group) {
        await createStockMovement(businessId, {
          productId: item.productId,
          productName: item.description || item.name || '',
          warehouseId: guide.warehouseId,
          type: 'exit',
          quantity: -parseFloat(item.quantity),
          reason: 'Guía de remisión',
          referenceType: 'dispatch_guide',
          referenceId: guide.id,
          referenceNumber: guide.number,
          userId: userId || '',
          serialNumber: item.serialNumber,
          ...(item.variantSku && { variantSku: item.variantSku }),
          notes: `Despacho: ${guide.number} S/N: ${item.serialNumber}`
        })
      }
    }

    // Persistir items actualizados + flag stockDeducted
    if (persistToGuide && guide.id) {
      await updateDispatchGuide(businessId, guide.id, {
        items: itemsWithBreakdown,
        stockDeducted: true,
      })
    }

    return { success: true, itemsWithBreakdown }
  } catch (error) {
    console.error('[DispatchGuide] Error al descontar stock:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Restaura stock previamente descontado. Usa item.batchBreakdown para repartir el
 * stock devuelto entre los lotes originales. Si no hay breakdown (guía legacy),
 * solo restaura stock total (comportamiento equivalente al previo).
 *
 * @param {Object} params
 * @param {string} params.businessId
 * @param {Object} params.guide
 * @param {string} params.userId
 * @param {string} [params.reason='Reversión guía de remisión']
 * @param {string} [params.referenceType='dispatch_guide_reversal']
 * @param {boolean} [params.persistToGuide=true] - si true, marca stockDeducted=false
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function restoreStockForDispatchGuide({
  businessId,
  guide,
  userId,
  reason = 'Reversión guía de remisión',
  referenceType = 'dispatch_guide_reversal',
  persistToGuide = true,
}) {
  if (!guide?.warehouseId) {
    return { success: false, error: 'La guía no tiene almacén asignado' }
  }

  const allItems = guide.items || []

  // Mismo agrupamiento que deduct: 1 transacción por (productId|variantSku|warehouseId)
  // para items seriados. Items no seriados van uno por uno (cada uno con su lote).
  const serialGroupKey = (item) => `${item.productId}|${item.variantSku || ''}|${guide.warehouseId}`
  const serialGroups = new Map()
  const nonSerialItems = []

  for (const item of allItems) {
    if (!item.productId || !(parseFloat(item.quantity) > 0)) continue
    if (item.serialNumber) {
      const key = serialGroupKey(item)
      if (!serialGroups.has(key)) serialGroups.set(key, [])
      serialGroups.get(key).push(item)
    } else {
      nonSerialItems.push(item)
    }
  }

  try {
    // 1. Items NO seriados (uno por uno; cada uno puede tener su batchBreakdown).
    for (const item of nonSerialItems) {
      const quantityToRestore = parseFloat(item.quantity)
      const extraUpdates = {}

      const productSnap = await getDoc(doc(db, 'businesses', businessId, 'products', item.productId))
      if (!productSnap.exists()) {
        console.warn(`[DispatchGuide] Producto ${item.productId} no existe al restaurar, omitiendo`)
        continue
      }
      const productData = productSnap.data()

      // Batches: solo si producto no tiene variantes (path de variantes ignora extraUpdates.batches).
      // Si tenemos breakdown, restaurar por lote. Si no, dejar batches sin tocar (guía legacy).
      if (!productData.hasVariants && item.batchBreakdown && item.batchBreakdown.length > 0 && productData.batches) {
        const updatedBatches = [...productData.batches]
        for (const br of item.batchBreakdown) {
          const idx = updatedBatches.findIndex(b =>
            normalizeBn(b.lotNumber || b.batchNumber) === normalizeBn(br.lotNumber) &&
            (!b.warehouseId || b.warehouseId === guide.warehouseId)
          )
          if (idx !== -1) {
            updatedBatches[idx] = {
              ...updatedBatches[idx],
              quantity: (updatedBatches[idx].quantity || 0) + br.quantity,
            }
          } else {
            // El lote ya no existe en el producto (depleted y removido). Recrearlo.
            updatedBatches.push({
              lotNumber: br.lotNumber,
              batchNumber: br.lotNumber,
              quantity: br.quantity,
              expirationDate: br.expirationDate || null,
              expiryDate: br.expirationDate || null,
              warehouseId: guide.warehouseId,
            })
          }
        }
        extraUpdates.batches = updatedBatches
        const meta = computeProductBatchMetadata(updatedBatches)
        extraUpdates.expirationDate = meta.expirationDate
        extraUpdates.batchNumber = meta.batchNumber
      }

      await updateProductStockTransaction(
        businessId, item.productId, guide.warehouseId,
        quantityToRestore, extraUpdates, item.variantSku || null
      )

      await createStockMovement(businessId, {
        productId: item.productId,
        productName: item.description || item.name || '',
        warehouseId: guide.warehouseId,
        type: 'entry',
        quantity: quantityToRestore,
        reason,
        referenceType,
        referenceId: guide.id,
        referenceNumber: guide.number,
        userId: userId || '',
        ...(item.batchNumber && { batchNumber: item.batchNumber }),
        ...(item.variantSku && { variantSku: item.variantSku }),
        notes: `Stock restaurado: ${guide.number}${item.batchNumber ? ` Lote: ${item.batchNumber}` : ''}`
      })
    }

    // 2. Grupos de series: 1 transacción por grupo restaurando todas las series del grupo.
    for (const group of serialGroups.values()) {
      const firstItem = group[0]
      const productSnap = await getDoc(doc(db, 'businesses', businessId, 'products', firstItem.productId))
      if (!productSnap.exists()) {
        console.warn(`[DispatchGuide] Producto ${firstItem.productId} no existe al restaurar serial group, omitiendo`)
        continue
      }
      const productData = productSnap.data()

      const totalQty = group.reduce((sum, it) => sum + parseFloat(it.quantity), 0)
      const serialsToRestore = new Set(group.map(it => it.serialNumber))

      const extraUpdates = {}
      if (productData.serials?.length > 0) {
        extraUpdates.serials = productData.serials.map(s =>
          serialsToRestore.has(s.serialNumber) && s.status === 'dispatched'
            ? { ...s, status: 'available', dispatchGuideId: null }
            : s
        )
      }

      await updateProductStockTransaction(
        businessId, firstItem.productId, guide.warehouseId,
        totalQty, extraUpdates, firstItem.variantSku || null
      )

      for (const item of group) {
        await createStockMovement(businessId, {
          productId: item.productId,
          productName: item.description || item.name || '',
          warehouseId: guide.warehouseId,
          type: 'entry',
          quantity: parseFloat(item.quantity),
          reason,
          referenceType,
          referenceId: guide.id,
          referenceNumber: guide.number,
          userId: userId || '',
          serialNumber: item.serialNumber,
          ...(item.variantSku && { variantSku: item.variantSku }),
          notes: `Stock restaurado: ${guide.number} S/N: ${item.serialNumber}`
        })
      }
    }

    // Limpiar batchBreakdown de los items + marcar stockDeducted=false
    if (persistToGuide && guide.id) {
      const itemsWithoutBreakdown = (guide.items || []).map(item => {
        const { batchBreakdown, ...rest } = item
        return rest
      })
      await updateDispatchGuide(businessId, guide.id, {
        items: itemsWithoutBreakdown,
        stockDeducted: false,
      })
    }

    return { success: true }
  } catch (error) {
    console.error('[DispatchGuide] Error al restaurar stock:', error)
    return { success: false, error: error.message }
  }
}
