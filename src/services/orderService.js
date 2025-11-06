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
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { updateTableAmount } from './tableService'

/**
 * Servicio para gestión de órdenes de restaurante
 */

// =====================================================
// ORDERS (Órdenes)
// =====================================================

/**
 * Obtener todas las órdenes de un negocio
 */
export const getOrders = async (businessId) => {
  try {
    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    const q = query(ordersRef, orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)

    const orders = []
    snapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: orders }
  } catch (error) {
    console.error('Error al obtener órdenes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una orden específica
 */
export const getOrder = async (businessId, orderId) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    const orderSnap = await getDoc(orderRef)

    if (!orderSnap.exists()) {
      return { success: false, error: 'Orden no encontrada' }
    }

    return { success: true, data: { id: orderSnap.id, ...orderSnap.data() } }
  } catch (error) {
    console.error('Error al obtener orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear una nueva orden
 */
export const createOrder = async (businessId, orderData) => {
  try {
    const ordersRef = collection(db, 'businesses', businessId, 'orders')

    const newOrder = {
      // Información de la mesa y mozo
      tableId: orderData.tableId,
      tableNumber: orderData.tableNumber,
      waiterId: orderData.waiterId,
      waiterName: orderData.waiterName,

      // Items de la orden
      items: orderData.items || [],

      // Información del cliente (opcional)
      customerName: orderData.customerName || null,
      customerPhone: orderData.customerPhone || null,

      // Cálculos
      subtotal: orderData.subtotal || 0,
      tax: orderData.tax || 0,
      total: orderData.total || 0,

      // Estado de la orden
      status: 'pending', // pending, preparing, ready, delivered, cancelled

      // Notas especiales
      notes: orderData.notes || '',

      // Timestamps
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      statusHistory: [
        {
          status: 'pending',
          timestamp: serverTimestamp(),
          note: 'Orden creada',
        },
      ],
    }

    const docRef = await addDoc(ordersRef, newOrder)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una orden
 */
export const updateOrder = async (businessId, orderId, orderData) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)

    await updateDoc(orderRef, {
      ...orderData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una orden
 */
export const deleteOrder = async (businessId, orderId) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    await deleteDoc(orderRef)

    return { success: true }
  } catch (error) {
    console.error('Error al eliminar orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Agregar items a una orden existente y actualizar la mesa
 */
export const addOrderItems = async (businessId, orderId, newItems) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    const orderSnap = await getDoc(orderRef)

    if (!orderSnap.exists()) {
      return { success: false, error: 'Orden no encontrada' }
    }

    const orderData = orderSnap.data()
    const currentItems = orderData.items || []
    const updatedItems = [...currentItems, ...newItems]

    // Recalcular totales
    const subtotal = updatedItems.reduce((sum, item) => sum + item.total, 0)
    const tax = subtotal * 0.18 // IGV 18%
    const total = subtotal + tax

    // Actualizar la orden
    await updateDoc(orderRef, {
      items: updatedItems,
      subtotal,
      tax,
      total,
      updatedAt: serverTimestamp(),
    })

    // Actualizar el monto en la mesa si existe tableId
    if (orderData.tableId) {
      const updateTableResult = await updateTableAmount(businessId, orderData.tableId, total)
      if (!updateTableResult.success) {
        console.warn('No se pudo actualizar el monto de la mesa:', updateTableResult.error)
        // Continuar de todos modos, la orden se actualizó correctamente
      }
    }

    return { success: true, data: { subtotal, tax, total } }
  } catch (error) {
    console.error('Error al agregar items a la orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar el estado de una orden
 */
export const updateOrderStatus = async (businessId, orderId, newStatus, note = '') => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    const orderSnap = await getDoc(orderRef)

    if (!orderSnap.exists()) {
      return { success: false, error: 'Orden no encontrada' }
    }

    const orderData = orderSnap.data()
    const statusHistory = orderData.statusHistory || []

    statusHistory.push({
      status: newStatus,
      timestamp: new Date(),
      note: note || `Estado cambiado a ${newStatus}`,
    })

    await updateDoc(orderRef, {
      status: newStatus,
      statusHistory,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar estado de orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener órdenes por estado
 */
export const getOrdersByStatus = async (businessId, status) => {
  try {
    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    const q = query(
      ordersRef,
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)

    const orders = []
    snapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: orders }
  } catch (error) {
    console.error('Error al obtener órdenes por estado:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener órdenes de una mesa específica
 */
export const getOrdersByTable = async (businessId, tableId) => {
  try {
    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    const q = query(
      ordersRef,
      where('tableId', '==', tableId),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)

    const orders = []
    snapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: orders }
  } catch (error) {
    console.error('Error al obtener órdenes de la mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener órdenes de un mozo específico
 */
export const getOrdersByWaiter = async (businessId, waiterId) => {
  try {
    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    const q = query(
      ordersRef,
      where('waiterId', '==', waiterId),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)

    const orders = []
    snapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: orders }
  } catch (error) {
    console.error('Error al obtener órdenes del mozo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener estadísticas de órdenes
 */
export const getOrdersStats = async (businessId) => {
  try {
    const result = await getOrders(businessId)
    if (!result.success) {
      return result
    }

    const orders = result.data
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayOrders = orders.filter((order) => {
      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt)
      return orderDate >= today
    })

    const stats = {
      total: orders.length,
      today: todayOrders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      preparing: orders.filter((o) => o.status === 'preparing').length,
      ready: orders.filter((o) => o.status === 'ready').length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      totalSalesToday: todayOrders.reduce((sum, o) => sum + (o.total || 0), 0),
      averageTicket: todayOrders.length > 0
        ? todayOrders.reduce((sum, o) => sum + (o.total || 0), 0) / todayOrders.length
        : 0,
    }

    return { success: true, data: stats }
  } catch (error) {
    console.error('Error al obtener estadísticas de órdenes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cancelar una orden
 */
export const cancelOrder = async (businessId, orderId, reason = '') => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    const orderSnap = await getDoc(orderRef)

    if (!orderSnap.exists()) {
      return { success: false, error: 'Orden no encontrada' }
    }

    const orderData = orderSnap.data()
    const statusHistory = orderData.statusHistory || []

    statusHistory.push({
      status: 'cancelled',
      timestamp: new Date(),
      note: reason || 'Orden cancelada',
    })

    await updateDoc(orderRef, {
      status: 'cancelled',
      statusHistory,
      cancelledAt: serverTimestamp(),
      cancelReason: reason,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al cancelar orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Completar una orden (marcar como entregada)
 */
export const completeOrder = async (businessId, orderId) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    const orderSnap = await getDoc(orderRef)

    if (!orderSnap.exists()) {
      return { success: false, error: 'Orden no encontrada' }
    }

    const orderData = orderSnap.data()
    const statusHistory = orderData.statusHistory || []

    statusHistory.push({
      status: 'delivered',
      timestamp: new Date(),
      note: 'Orden completada y entregada',
    })

    await updateDoc(orderRef, {
      status: 'delivered',
      statusHistory,
      deliveredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al completar orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener órdenes activas (pending, preparing, ready)
 */
export const getActiveOrders = async (businessId) => {
  try {
    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    const q = query(
      ordersRef,
      where('status', 'in', ['pending', 'preparing', 'ready']),
      orderBy('createdAt', 'asc')
    )
    const snapshot = await getDocs(q)

    const orders = []
    snapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: orders }
  } catch (error) {
    console.error('Error al obtener órdenes activas:', error)
    return { success: false, error: error.message }
  }
}

export default {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  addOrderItems,
  updateOrderStatus,
  getOrdersByStatus,
  getOrdersByTable,
  getOrdersByWaiter,
  getOrdersStats,
  cancelOrder,
  completeOrder,
  getActiveOrders,
}
