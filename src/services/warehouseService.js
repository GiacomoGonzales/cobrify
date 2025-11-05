import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio para gestión de almacenes y movimientos de stock
 */

// =====================================================
// WAREHOUSES (Almacenes)
// =====================================================

/**
 * Obtener todos los almacenes de un negocio
 */
export const getWarehouses = async (businessId) => {
  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')
    const q = query(warehousesRef, orderBy('createdAt', 'asc'))
    const snapshot = await getDocs(q)

    const warehouses = []
    snapshot.forEach((doc) => {
      warehouses.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: warehouses }
  } catch (error) {
    console.error('Error al obtener almacenes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener un almacén específico
 */
export const getWarehouse = async (businessId, warehouseId) => {
  try {
    const warehouseRef = doc(db, 'businesses', businessId, 'warehouses', warehouseId)
    const warehouseSnap = await getDoc(warehouseRef)

    if (!warehouseSnap.exists()) {
      return { success: false, error: 'Almacén no encontrado' }
    }

    return { success: true, data: { id: warehouseSnap.id, ...warehouseSnap.data() } }
  } catch (error) {
    console.error('Error al obtener almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear un nuevo almacén
 */
export const createWarehouse = async (businessId, warehouseData) => {
  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')

    // Si es el primer almacén o se marca como default, actualizar otros
    if (warehouseData.isDefault) {
      await unsetDefaultWarehouses(businessId)
    }

    const newWarehouse = {
      ...warehouseData,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(warehousesRef, newWarehouse)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un almacén
 */
export const updateWarehouse = async (businessId, warehouseId, warehouseData) => {
  try {
    const warehouseRef = doc(db, 'businesses', businessId, 'warehouses', warehouseId)

    // Si se marca como default, quitar default de otros
    if (warehouseData.isDefault) {
      await unsetDefaultWarehouses(businessId, warehouseId)
    }

    await updateDoc(warehouseRef, {
      ...warehouseData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un almacén (solo si no tiene stock)
 */
export const deleteWarehouse = async (businessId, warehouseId) => {
  try {
    // TODO: Verificar que no tenga stock en productos
    const warehouseRef = doc(db, 'businesses', businessId, 'warehouses', warehouseId)
    await deleteDoc(warehouseRef)

    return { success: true }
  } catch (error) {
    console.error('Error al eliminar almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Quitar isDefault de todos los almacenes (helper interno)
 */
const unsetDefaultWarehouses = async (businessId, exceptId = null) => {
  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')
    const snapshot = await getDocs(warehousesRef)

    const batch = writeBatch(db)
    snapshot.forEach((doc) => {
      if (doc.id !== exceptId && doc.data().isDefault === true) {
        batch.update(doc.ref, { isDefault: false })
      }
    })

    await batch.commit()
  } catch (error) {
    console.error('Error al actualizar almacenes default:', error)
  }
}

/**
 * Obtener almacén por defecto
 */
export const getDefaultWarehouse = async (businessId) => {
  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')
    const snapshot = await getDocs(warehousesRef)

    let defaultWarehouse = null
    snapshot.forEach((doc) => {
      const data = doc.data()
      if (data.isDefault === true) {
        defaultWarehouse = { id: doc.id, ...data }
      }
    })

    // Si no hay default, retornar el primero
    if (!defaultWarehouse && !snapshot.empty) {
      const firstDoc = snapshot.docs[0]
      defaultWarehouse = { id: firstDoc.id, ...firstDoc.data() }
    }

    return { success: true, data: defaultWarehouse }
  } catch (error) {
    console.error('Error al obtener almacén default:', error)
    return { success: false, error: error.message }
  }
}

// =====================================================
// STOCK MOVEMENTS (Movimientos de Inventario)
// =====================================================

/**
 * Registrar un movimiento de stock
 */
export const createStockMovement = async (businessId, movementData) => {
  try {
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')

    const newMovement = {
      ...movementData,
      createdAt: serverTimestamp(),
    }

    const docRef = await addDoc(movementsRef, newMovement)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear movimiento de stock:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener movimientos de stock con filtros opcionales
 */
export const getStockMovements = async (businessId, filters = {}) => {
  try {
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
    let q = query(movementsRef, orderBy('createdAt', 'desc'))

    const snapshot = await getDocs(q)
    let movements = []

    snapshot.forEach((doc) => {
      movements.push({ id: doc.id, ...doc.data() })
    })

    // Filtrar en cliente si es necesario
    if (filters.warehouseId) {
      movements = movements.filter(
        (m) => m.warehouseId === filters.warehouseId || m.toWarehouse === filters.warehouseId
      )
    }
    if (filters.productId) {
      movements = movements.filter((m) => m.productId === filters.productId)
    }
    if (filters.type) {
      movements = movements.filter((m) => m.type === filters.type)
    }

    return { success: true, data: movements }
  } catch (error) {
    console.error('Error al obtener movimientos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear un movimiento de transferencia entre almacenes
 */
export const createTransfer = async (businessId, transferData) => {
  const {
    productId,
    variantSku,
    fromWarehouseId,
    toWarehouseId,
    quantity,
    userId,
    notes,
  } = transferData

  try {
    const movement = {
      productId,
      variantSku: variantSku || null,
      warehouseId: fromWarehouseId,
      type: 'transfer',
      quantity: -quantity, // Negativo porque sale del almacén origen
      reason: 'Transferencia',
      referenceType: 'transfer',
      fromWarehouse: fromWarehouseId,
      toWarehouse: toWarehouseId,
      userId,
      notes: notes || `Transferencia a ${toWarehouseId}`,
    }

    return await createStockMovement(businessId, movement)
  } catch (error) {
    console.error('Error al crear transferencia:', error)
    return { success: false, error: error.message }
  }
}

export default {
  // Warehouses
  getWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  getDefaultWarehouse,
  // Stock Movements
  createStockMovement,
  getStockMovements,
  createTransfer,
}
