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
  getDoc,
} from 'firebase/firestore'
import { createStockMovement } from '@/services/warehouseService'
import { updateProductStockTransaction } from '@/services/firestoreService'

/**
 * Servicio de Salidas de Almacén hacia Obras/Proyectos
 * Colección: businesses/{businessId}/warehouseExits
 */

export const getWarehouseExits = async (businessId) => {
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'warehouseExits'),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)
    const exits = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: exits }
  } catch (error) {
    console.error('Error al obtener salidas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear una salida de almacén
 * @param {string} businessId
 * @param {Object} exitData - {
 *   exitType: 'project' | 'simple',   // 'project' = a obra (default), 'simple' = sin proyecto
 *   reason,                            // solo para exitType='simple': 'office_use' | 'employee_delivery' | 'internal_consumption' | 'other'
 *   reasonLabel,                       // etiqueta legible del motivo
 *   projectId, projectName, projectCode,   // solo para exitType='project'
 *   warehouseId, warehouseName,
 *   items, notes, userId, userName
 * }
 * items: [{ productId, productName, productCode, quantity, unit }]
 */
const getNextExitNumber = async (businessId) => {
  const counterRef = doc(db, 'businesses', businessId, 'counters', 'warehouseExits')
  const num = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef)
    const current = counterDoc.exists() ? (counterDoc.data().lastNumber || 0) : 0
    const next = current + 1
    transaction.set(counterRef, { lastNumber: next }, { merge: true })
    return next
  })
  return `SAL-${String(num).padStart(5, '0')}`
}

export const createWarehouseExit = async (businessId, exitData) => {
  try {
    // Validación previa de stock: verificar que cada item tenga suficiente stock
    // en el almacén seleccionado antes de crear el registro
    for (const item of exitData.items) {
      const productRef = doc(db, 'businesses', businessId, 'products', item.productId)
      const productSnap = await getDoc(productRef)
      if (!productSnap.exists()) {
        return { success: false, error: `Producto ${item.productName || item.productId} no encontrado` }
      }
      const product = productSnap.data()

      // Saltar productos sin control de stock
      if (product.trackStock === false) continue

      // Obtener stock disponible en el almacén
      let availableStock = 0
      if (product.hasVariants && item.variantSku && product.variants?.length > 0) {
        const variant = product.variants.find(v => v.sku === item.variantSku)
        const variantWS = variant?.warehouseStocks?.find(ws => ws.warehouseId === exitData.warehouseId)
        availableStock = variantWS?.stock || 0
      } else {
        const ws = product.warehouseStocks?.find(ws => ws.warehouseId === exitData.warehouseId)
        availableStock = ws ? (ws.stock || 0) : (product.stock || 0)
      }

      if (item.quantity > availableStock) {
        return {
          success: false,
          error: `Stock insuficiente de "${item.productName}". Disponible: ${availableStock}, solicitado: ${item.quantity}`
        }
      }
    }

    const totalItems = exitData.items.reduce((sum, item) => sum + item.quantity, 0)
    const number = await getNextExitNumber(businessId)

    // Default a 'project' para mantener compatibilidad con salidas antiguas
    const exitType = exitData.exitType || 'project'

    const docRef = await addDoc(collection(db, 'businesses', businessId, 'warehouseExits'), {
      ...exitData,
      exitType,
      number,
      totalItems,
      status: 'completed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // Construir motivo legible según tipo de salida
    const movementReason = exitType === 'simple'
      ? `Salida simple: ${exitData.reasonLabel || 'Uso interno'}`
      : `Salida a obra: ${exitData.projectName}`

    // Descontar stock y crear movimiento por cada item
    for (const item of exitData.items) {
      // 1. Descontar stock (atómicamente) — clave para que la salida realmente afecte el inventario
      await updateProductStockTransaction(
        businessId,
        item.productId,
        exitData.warehouseId,
        -Math.abs(item.quantity),
        {},
        item.variantSku || null
      )

      // 2. Crear movimiento para trazabilidad
      await createStockMovement(businessId, {
        productId: item.productId,
        variantSku: item.variantSku || null,
        warehouseId: exitData.warehouseId,
        type: 'warehouse_exit',
        quantity: -Math.abs(item.quantity),
        reason: movementReason,
        referenceType: 'warehouse_exit',
        referenceId: docRef.id,
        referenceNumber: number,
        userId: exitData.userId,
        notes: exitData.notes || '',
      })
    }

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear salida de almacén:', error)
    return { success: false, error: error.message }
  }
}
