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
} from 'firebase/firestore'
import { createStockMovement } from '@/services/warehouseService'

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
 * @param {Object} exitData - { projectId, projectName, warehouseId, warehouseName, items, notes, userId, userName }
 * items: [{ productId, productName, productCode, quantity, unit }]
 */
export const createWarehouseExit = async (businessId, exitData) => {
  try {
    // Calcular totales
    const totalItems = exitData.items.reduce((sum, item) => sum + item.quantity, 0)

    const docRef = await addDoc(collection(db, 'businesses', businessId, 'warehouseExits'), {
      ...exitData,
      totalItems,
      status: 'completed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // Crear movimientos de stock por cada item (salida = cantidad negativa)
    for (const item of exitData.items) {
      await createStockMovement(businessId, {
        productId: item.productId,
        variantSku: item.variantSku || null,
        warehouseId: exitData.warehouseId,
        type: 'warehouse_exit',
        quantity: -Math.abs(item.quantity),
        reason: `Salida a obra: ${exitData.projectName}`,
        referenceType: 'warehouse_exit',
        referenceId: docRef.id,
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
