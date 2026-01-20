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
  where,
  increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { createOrder, completeOrder } from './orderService'

/**
 * Servicio para gestión de mesas de restaurante
 */

// =====================================================
// TABLES (Mesas)
// =====================================================

/**
 * Obtener todas las mesas de un negocio
 */
export const getTables = async (businessId) => {
  try {
    const tablesRef = collection(db, 'businesses', businessId, 'tables')
    const q = query(tablesRef, orderBy('number', 'asc'))
    const snapshot = await getDocs(q)

    const tables = []
    snapshot.forEach((doc) => {
      tables.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: tables }
  } catch (error) {
    console.error('Error al obtener mesas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una mesa específica
 */
export const getTable = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)

    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }

    return { success: true, data: { id: tableSnap.id, ...tableSnap.data() } }
  } catch (error) {
    console.error('Error al obtener mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear una nueva mesa
 */
export const createTable = async (businessId, tableData) => {
  try {
    const tablesRef = collection(db, 'businesses', businessId, 'tables')

    const newTable = {
      number: tableData.number,
      capacity: tableData.capacity || 4,
      zone: tableData.zone || 'Salón Principal',
      status: 'available', // available, occupied, reserved, maintenance
      isActive: true,
      // Datos de ocupación (null cuando está disponible)
      currentOrder: null,
      waiter: null,
      waiterId: null,
      startTime: null,
      amount: 0,
      // Datos de reserva (null cuando no está reservada)
      reservedFor: null,
      reservedBy: null,
      reservationTime: null,
      // Metadata
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(tablesRef, newTable)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una mesa
 */
export const updateTable = async (businessId, tableId, tableData) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)

    await updateDoc(tableRef, {
      ...tableData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una mesa
 */
export const deleteTable = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    await deleteDoc(tableRef)

    return { success: true }
  } catch (error) {
    console.error('Error al eliminar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Ocupar una mesa (asignar mozo y abrir orden automáticamente)
 */
export const occupyTable = async (businessId, tableId, occupyData) => {
  try {
    // Obtener datos de la mesa
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)

    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }

    const tableData = tableSnap.data()

    // Crear una orden automáticamente
    const orderResult = await createOrder(businessId, {
      tableId: tableId,
      tableNumber: tableData.number,
      waiterId: occupyData.waiterId,
      waiterName: occupyData.waiterName,
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      customerName: occupyData.customerName || null,
      customerPhone: occupyData.customerPhone || null,
      notes: occupyData.notes || '',
    })

    if (!orderResult.success) {
      return { success: false, error: 'Error al crear orden: ' + orderResult.error }
    }

    const orderId = orderResult.id

    // Actualizar la mesa con la información de ocupación
    await updateDoc(tableRef, {
      status: 'occupied',
      currentOrder: orderId,
      waiter: occupyData.waiterName,
      waiterId: occupyData.waiterId,
      startTime: serverTimestamp(),
      amount: 0,
      updatedAt: serverTimestamp(),
    })

    // Actualizar métricas del mozo (incrementar mesas activas)
    if (occupyData.waiterId) {
      const waiterRef = doc(db, 'businesses', businessId, 'waiters', occupyData.waiterId)
      await updateDoc(waiterRef, {
        activeTables: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(err => {
        console.warn('No se pudo actualizar métricas del mozo:', err)
        // No fallar si no se puede actualizar las métricas
      })
    }

    return { success: true, orderId }
  } catch (error) {
    console.error('Error al ocupar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Liberar una mesa (cerrar orden y completarla)
 */
export const releaseTable = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)

    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }

    const tableData = tableSnap.data()

    // PRIMERO: Liberar la mesa inmediatamente para que la UI se actualice rápido
    await updateDoc(tableRef, {
      status: 'available',
      currentOrder: null,
      waiter: null,
      waiterId: null,
      startTime: null,
      amount: 0,
      updatedAt: serverTimestamp(),
    })

    // DESPUÉS: Completar orden y actualizar métricas en paralelo (no bloquea)
    const backgroundTasks = []

    // Completar la orden si existe
    if (tableData.currentOrder) {
      backgroundTasks.push(
        completeOrder(businessId, tableData.currentOrder).catch(err => {
          console.warn('No se pudo completar la orden:', err)
        })
      )
    }

    // Actualizar métricas del mozo
    if (tableData.waiterId) {
      const waiterRef = doc(db, 'businesses', businessId, 'waiters', tableData.waiterId)
      backgroundTasks.push(
        updateDoc(waiterRef, {
          activeTables: increment(-1),
          updatedAt: serverTimestamp(),
        }).catch(err => {
          console.warn('No se pudo actualizar métricas del mozo:', err)
        })
      )
    }

    // Ejecutar tareas en paralelo sin esperar (fire and forget)
    if (backgroundTasks.length > 0) {
      Promise.all(backgroundTasks).catch(() => {})
    }

    return { success: true }
  } catch (error) {
    console.error('Error al liberar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Reservar una mesa
 */
export const reserveTable = async (businessId, tableId, reservationData) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)

    await updateDoc(tableRef, {
      status: 'reserved',
      reservedFor: reservationData.reservedFor, // Hora de la reserva
      reservedBy: reservationData.reservedBy, // Nombre del cliente
      reservationTime: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al reservar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cancelar reserva de una mesa
 */
export const cancelReservation = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)

    await updateDoc(tableRef, {
      status: 'available',
      reservedFor: null,
      reservedBy: null,
      reservationTime: null,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al cancelar reserva:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar el monto de consumo de una mesa
 */
export const updateTableAmount = async (businessId, tableId, amount) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)

    await updateDoc(tableRef, {
      amount: amount,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar monto:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Mover una orden a otra mesa
 */
export const moveOrderToTable = async (businessId, sourceTableId, destinationTableId) => {
  try {
    // Obtener datos de la mesa origen
    const sourceTableRef = doc(db, 'businesses', businessId, 'tables', sourceTableId)
    const sourceTableSnap = await getDoc(sourceTableRef)

    if (!sourceTableSnap.exists()) {
      return { success: false, error: 'Mesa origen no encontrada' }
    }

    const sourceTableData = sourceTableSnap.data()

    if (sourceTableData.status !== 'occupied') {
      return { success: false, error: 'La mesa origen no está ocupada' }
    }

    if (!sourceTableData.currentOrder) {
      return { success: false, error: 'La mesa origen no tiene una orden activa' }
    }

    // Obtener datos de la mesa destino
    const destTableRef = doc(db, 'businesses', businessId, 'tables', destinationTableId)
    const destTableSnap = await getDoc(destTableRef)

    if (!destTableSnap.exists()) {
      return { success: false, error: 'Mesa destino no encontrada' }
    }

    const destTableData = destTableSnap.data()

    if (destTableData.status !== 'available') {
      return { success: false, error: 'La mesa destino no está disponible' }
    }

    // Actualizar la orden con la nueva mesa
    const orderRef = doc(db, 'businesses', businessId, 'orders', sourceTableData.currentOrder)
    await updateDoc(orderRef, {
      tableId: destinationTableId,
      tableNumber: destTableData.number,
      updatedAt: serverTimestamp(),
    })

    // Ocupar la mesa destino con los datos de la orden
    await updateDoc(destTableRef, {
      status: 'occupied',
      currentOrder: sourceTableData.currentOrder,
      waiter: sourceTableData.waiter,
      waiterId: sourceTableData.waiterId,
      startTime: sourceTableData.startTime,
      amount: sourceTableData.amount,
      updatedAt: serverTimestamp(),
    })

    // Liberar la mesa origen (sin completar la orden)
    await updateDoc(sourceTableRef, {
      status: 'available',
      currentOrder: null,
      waiter: null,
      waiterId: null,
      startTime: null,
      amount: 0,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al mover orden a otra mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Transferir una mesa a otro mozo
 */
export const transferTable = async (businessId, tableId, transferData) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)

    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }

    const tableData = tableSnap.data()

    if (tableData.status !== 'occupied') {
      return { success: false, error: 'Solo se pueden transferir mesas ocupadas' }
    }

    // Actualizar la mesa con el nuevo mozo
    await updateDoc(tableRef, {
      waiter: transferData.waiterName,
      waiterId: transferData.waiterId,
      updatedAt: serverTimestamp(),
    })

    // Si hay una orden asociada, también actualizar el mozo en la orden
    if (tableData.currentOrder) {
      const orderRef = doc(db, 'businesses', businessId, 'orders', tableData.currentOrder)
      await updateDoc(orderRef, {
        waiterName: transferData.waiterName,
        waiterId: transferData.waiterId,
        updatedAt: serverTimestamp(),
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Error al transferir mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener mesas por zona
 */
export const getTablesByZone = async (businessId, zone) => {
  try {
    const tablesRef = collection(db, 'businesses', businessId, 'tables')
    const q = query(
      tablesRef,
      where('zone', '==', zone),
      orderBy('number', 'asc')
    )
    const snapshot = await getDocs(q)

    const tables = []
    snapshot.forEach((doc) => {
      tables.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: tables }
  } catch (error) {
    console.error('Error al obtener mesas por zona:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener mesas por estado
 */
export const getTablesByStatus = async (businessId, status) => {
  try {
    const tablesRef = collection(db, 'businesses', businessId, 'tables')
    const q = query(
      tablesRef,
      where('status', '==', status),
      orderBy('number', 'asc')
    )
    const snapshot = await getDocs(q)

    const tables = []
    snapshot.forEach((doc) => {
      tables.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: tables }
  } catch (error) {
    console.error('Error al obtener mesas por estado:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener estadísticas de mesas
 */
export const getTablesStats = async (businessId) => {
  try {
    const result = await getTables(businessId)
    if (!result.success) {
      return result
    }

    const tables = result.data
    const stats = {
      total: tables.length,
      available: tables.filter(t => t.status === 'available').length,
      occupied: tables.filter(t => t.status === 'occupied').length,
      reserved: tables.filter(t => t.status === 'reserved').length,
      maintenance: tables.filter(t => t.status === 'maintenance').length,
      totalCapacity: tables.reduce((sum, t) => sum + (t.capacity || 0), 0),
      totalAmount: tables
        .filter(t => t.status === 'occupied')
        .reduce((sum, t) => sum + (t.amount || 0), 0),
    }

    return { success: true, data: stats }
  } catch (error) {
    console.error('Error al obtener estadísticas de mesas:', error)
    return { success: false, error: error.message }
  }
}

export default {
  getTables,
  getTable,
  createTable,
  updateTable,
  deleteTable,
  occupyTable,
  releaseTable,
  reserveTable,
  cancelReservation,
  updateTableAmount,
  moveOrderToTable,
  transferTable,
  getTablesByZone,
  getTablesByStatus,
  getTablesStats,
}
