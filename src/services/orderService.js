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
  setDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { updateTableAmount } from './tableService'

/**
 * Helper: Calcular totales (subtotal, IGV, total) según configuración fiscal del negocio
 * @param {number} total - Total incluyendo IGV
 * @param {Object} taxConfig - Configuración fiscal {igvRate, igvExempt}
 * @returns {Object} - {subtotal, tax, total}
 */
const calculateOrderTotals = (total, taxConfig = { igvRate: 18, igvExempt: false }) => {
  // Si está exonerado del IGV
  if (taxConfig.igvExempt) {
    return {
      subtotal: total,
      tax: 0,
      total: total
    }
  }

  // Si no está exonerado, calcular IGV dinámicamente
  const igvRate = taxConfig.igvRate || 18
  const igvMultiplier = 1 + (igvRate / 100) // Ej: 1.18 para 18%
  const subtotal = total / igvMultiplier // Precio sin IGV
  const tax = total - subtotal // IGV = Total - Subtotal

  return {
    subtotal,
    tax,
    total
  }
}

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
 * Obtener el siguiente número de orden del día
 */
const getDailyOrderNumber = async (businessId) => {
  try {
    // Obtener la fecha de hoy en formato YYYY-MM-DD
    const today = new Date()
    const dateKey = today.toISOString().split('T')[0] // "2025-01-15"

    // Referencia al contador diario
    const counterRef = doc(db, 'businesses', businessId, 'counters', `orders-${dateKey}`)
    const counterSnap = await getDoc(counterRef)

    let orderNumber = 1

    if (counterSnap.exists()) {
      orderNumber = (counterSnap.data().lastNumber || 0) + 1
    }

    // Si llega a 1000, reiniciar a 1
    if (orderNumber > 999) {
      orderNumber = 1
    }

    // Actualizar o crear el contador usando setDoc con merge
    await setDoc(counterRef, {
      lastNumber: orderNumber,
      date: dateKey,
      updatedAt: serverTimestamp()
    }, { merge: true })

    // Formatear como #001, #002, etc.
    return `#${String(orderNumber).padStart(3, '0')}`
  } catch (error) {
    console.error('Error al obtener número de orden:', error)
    // En caso de error, generar un número aleatorio
    return `#${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`
  }
}

/**
 * Crear una nueva orden
 */
export const createOrder = async (businessId, orderData) => {
  try {
    const ordersRef = collection(db, 'businesses', businessId, 'orders')

    const now = new Date()

    // Obtener el número de orden del día
    const orderNumber = await getDailyOrderNumber(businessId)

    const newOrder = {
      // Número de orden diario
      orderNumber: orderNumber,

      // Información de la mesa y mozo (solo si existen)
      ...(orderData.tableId && { tableId: orderData.tableId }),
      ...(orderData.tableNumber && { tableNumber: orderData.tableNumber }),
      ...(orderData.waiterId && { waiterId: orderData.waiterId }),
      ...(orderData.waiterName && { waiterName: orderData.waiterName }),

      // Tipo de orden (para llevar, delivery, dine-in)
      ...(orderData.orderType && { orderType: orderData.orderType }),

      // Fuente del pedido (Rappi, PedidosYa, etc.)
      ...(orderData.source && { source: orderData.source }),

      // Items de la orden - cada item tiene su propio estado
      items: (orderData.items || []).map(item => ({
        ...item,
        itemId: item.itemId || `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: item.status || 'pending', // Estado individual: pending, preparing, ready, delivered
        firedAt: new Date(), // Timestamp cuando se envió a cocina
        readyAt: null,
        deliveredAt: null,
      })),

      // Información del cliente (opcional)
      ...(orderData.customerName && { customerName: orderData.customerName }),
      ...(orderData.customerPhone && { customerPhone: orderData.customerPhone }),

      // Marca (para dark kitchens / multi-marca)
      ...(orderData.brandId && { brandId: orderData.brandId }),
      ...(orderData.brandName && { brandName: orderData.brandName }),
      ...(orderData.brandColor && { brandColor: orderData.brandColor }),

      // Prioridad del pedido
      priority: orderData.priority || 'normal', // 'normal' o 'urgent'

      // Estado de pago
      paid: orderData.paid || false,
      paidAt: orderData.paid ? serverTimestamp() : null,

      // Cálculos
      subtotal: orderData.subtotal || 0,
      tax: orderData.tax || 0,
      total: orderData.total || 0,

      // Estado general de la orden
      overallStatus: 'active', // active, completed, cancelled
      // Mantener 'status' por compatibilidad temporal
      status: orderData.status || 'pending', // pending, preparing, ready, delivered, cancelled

      // Notas especiales
      ...(orderData.notes && { notes: orderData.notes }),

      // Timestamps
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      statusHistory: [
        {
          status: orderData.status || 'pending',
          timestamp: now,
          note: 'Orden creada',
        },
      ],
    }

    const docRef = await addDoc(ordersRef, newOrder)
    return { success: true, id: docRef.id, orderNumber }
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
 * Marcar una orden como pagada
 */
export const markOrderAsPaid = async (businessId, orderId) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)

    await updateDoc(orderRef, {
      paid: true,
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al marcar orden como pagada:', error)
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

    // Agregar itemId y estado a los nuevos items
    const itemsWithStatus = newItems.map(item => ({
      ...item,
      itemId: item.itemId || `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: item.status || 'pending', // Nuevos items empiezan como pending
      firedAt: new Date(), // No usar serverTimestamp() en arrays
      readyAt: null,
      deliveredAt: null,
    }))

    const updatedItems = [...currentItems, ...itemsWithStatus]

    // Obtener configuración fiscal del negocio
    const businessRef = doc(db, 'businesses', businessId)
    const businessSnap = await getDoc(businessRef)
    const taxConfig = businessSnap.exists() && businessSnap.data().taxConfig
      ? businessSnap.data().taxConfig
      : { igvRate: 18, igvExempt: false }

    // Recalcular totales usando función helper con taxConfig dinámico
    const total = updatedItems.reduce((sum, item) => sum + item.total, 0)
    const { subtotal, tax } = calculateOrderTotals(total, taxConfig)

    // Si se agregan nuevos items, la orden vuelve a estar activa
    const overallStatus = 'active'

    // Actualizar la orden
    await updateDoc(orderRef, {
      items: updatedItems,
      subtotal,
      tax,
      total,
      overallStatus,
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
 * Actualizar el estado de un item individual en una orden
 * @param {string} businessId - ID del negocio
 * @param {string} orderId - ID de la orden
 * @param {string} itemId - ID del item a actualizar
 * @param {string} newStatus - Nuevo estado: 'pending', 'preparing', 'ready', 'delivered'
 */
export const updateItemStatus = async (businessId, orderId, itemId, newStatus) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    const orderSnap = await getDoc(orderRef)

    if (!orderSnap.exists()) {
      return { success: false, error: 'Orden no encontrada' }
    }

    const orderData = orderSnap.data()
    const items = orderData.items || []

    // Encontrar el item por itemId
    const itemIndex = items.findIndex(item => item.itemId === itemId)
    if (itemIndex === -1) {
      return { success: false, error: 'Item no encontrado' }
    }

    // Actualizar el item con el nuevo estado y timestamps
    const updatedItems = items.map((item, index) => {
      if (index === itemIndex) {
        const updates = {
          ...item,
          status: newStatus,
        }

        // Actualizar timestamps según el estado (no usar serverTimestamp en arrays)
        if (newStatus === 'ready' && !item.readyAt) {
          updates.readyAt = new Date()
        }
        if (newStatus === 'delivered' && !item.deliveredAt) {
          updates.deliveredAt = new Date()
        }

        return updates
      }
      return item
    })

    // Calcular el overallStatus basado en los estados de todos los items
    const allDelivered = updatedItems.every(item => item.status === 'delivered')
    const overallStatus = allDelivered ? 'completed' : 'active'

    // Actualizar la orden
    await updateDoc(orderRef, {
      items: updatedItems,
      overallStatus,
      updatedAt: serverTimestamp(),
    })

    return { success: true, overallStatus }
  } catch (error) {
    console.error('Error al actualizar estado del item:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un item de una orden existente y actualizar la mesa
 */
export const removeOrderItem = async (businessId, orderId, itemIndex) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    const orderSnap = await getDoc(orderRef)

    if (!orderSnap.exists()) {
      return { success: false, error: 'Orden no encontrada' }
    }

    const orderData = orderSnap.data()
    const currentItems = orderData.items || []

    if (itemIndex < 0 || itemIndex >= currentItems.length) {
      return { success: false, error: 'Item no encontrado' }
    }

    // Eliminar el item del array
    const updatedItems = currentItems.filter((_, index) => index !== itemIndex)

    // Obtener configuración fiscal del negocio
    const businessRef = doc(db, 'businesses', businessId)
    const businessSnap = await getDoc(businessRef)
    const taxConfig = businessSnap.exists() && businessSnap.data().taxConfig
      ? businessSnap.data().taxConfig
      : { igvRate: 18, igvExempt: false }

    // Recalcular totales usando función helper con taxConfig dinámico
    const total = updatedItems.reduce((sum, item) => sum + item.total, 0)
    const { subtotal, tax } = calculateOrderTotals(total, taxConfig)

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
      }
    }

    return { success: true, data: { subtotal, tax, total } }
  } catch (error) {
    console.error('Error al eliminar item de la orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar cantidad de un item en una orden existente y actualizar la mesa
 */
export const updateOrderItemQuantity = async (businessId, orderId, itemIndex, newQuantity) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    const orderSnap = await getDoc(orderRef)

    if (!orderSnap.exists()) {
      return { success: false, error: 'Orden no encontrada' }
    }

    const orderData = orderSnap.data()
    const currentItems = orderData.items || []

    if (itemIndex < 0 || itemIndex >= currentItems.length) {
      return { success: false, error: 'Item no encontrado' }
    }

    if (newQuantity <= 0) {
      // Si la cantidad es 0 o negativa, eliminar el item
      return await removeOrderItem(businessId, orderId, itemIndex)
    }

    // Actualizar la cantidad y el total del item
    const updatedItems = [...currentItems]
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      quantity: newQuantity,
      total: updatedItems[itemIndex].price * newQuantity
    }

    // Obtener configuración fiscal del negocio
    const businessRef = doc(db, 'businesses', businessId)
    const businessSnap = await getDoc(businessRef)
    const taxConfig = businessSnap.exists() && businessSnap.data().taxConfig
      ? businessSnap.data().taxConfig
      : { igvRate: 18, igvExempt: false }

    // Recalcular totales usando función helper con taxConfig dinámico
    const total = updatedItems.reduce((sum, item) => sum + item.total, 0)
    const { subtotal, tax } = calculateOrderTotals(total, taxConfig)

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
      }
    }

    return { success: true, data: { subtotal, tax, total } }
  } catch (error) {
    console.error('Error al actualizar cantidad de item:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar el estado de una orden
 */
export const updateOrderStatus = async (businessId, orderId, newStatus, note = '', extraData = {}) => {
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

    // Preparar datos de actualización
    const updateData = {
      status: newStatus,
      statusHistory,
      updatedAt: serverTimestamp(),
      ...extraData,
    }

    // Agregar timestamps específicos según el estado
    if (newStatus === 'ready') {
      updateData.readyAt = serverTimestamp()
    } else if (newStatus === 'dispatched') {
      updateData.dispatchedAt = serverTimestamp()
    } else if (newStatus === 'delivered') {
      updateData.deliveredAt = serverTimestamp()
    }

    await updateDoc(orderRef, updateData)

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

    // Si la orden tiene mesa asociada, liberarla
    if (orderData.tableId) {
      try {
        const tableRef = doc(db, 'businesses', businessId, 'tables', orderData.tableId)
        const tableSnap = await getDoc(tableRef)
        if (tableSnap.exists() && tableSnap.data().currentOrder === orderId) {
          await updateDoc(tableRef, {
            status: 'available',
            currentOrder: null,
            waiter: null,
            waiterId: null,
            startTime: null,
            amount: 0,
            updatedAt: serverTimestamp(),
          })
          console.log(`Mesa ${orderData.tableId} liberada al completar orden ${orderId}`)
        }
      } catch (tableError) {
        console.warn('No se pudo liberar la mesa:', tableError)
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error al completar orden:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener órdenes activas (pending, preparing, ready)
 * Filtrado en cliente para evitar necesidad de índice compuesto
 */
export const getActiveOrders = async (businessId) => {
  try {
    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    const q = query(ordersRef, orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)

    const orders = []
    snapshot.forEach((doc) => {
      const data = doc.data()
      // Filtrar solo órdenes activas
      if (['pending', 'preparing', 'ready'].includes(data.status)) {
        orders.push({ id: doc.id, ...data })
      }
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
  removeOrderItem,
  updateOrderItemQuantity,
  updateOrderStatus,
  getOrdersByStatus,
  getOrdersByTable,
  getOrdersByWaiter,
  getOrdersStats,
  cancelOrder,
  completeOrder,
  getActiveOrders,
}
