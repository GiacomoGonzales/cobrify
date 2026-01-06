import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio para gestionar órdenes de compra a proveedores
 */

// ==================== ÓRDENES DE COMPRA ====================

/**
 * Crear una nueva orden de compra
 */
export const createPurchaseOrder = async (businessId, orderData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', businessId, 'purchaseOrders'), {
      ...orderData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear orden de compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener órdenes de compra de un negocio
 */
export const getPurchaseOrders = async businessId => {
  try {
    const querySnapshot = await getDocs(collection(db, 'businesses', businessId, 'purchaseOrders'))
    const orders = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar por fecha de creación (más reciente primero)
    orders.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: orders }
  } catch (error) {
    console.error('Error al obtener órdenes de compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una orden de compra específica
 */
export const getPurchaseOrder = async (businessId, orderId) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'purchaseOrders', orderId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return {
        success: true,
        data: { id: docSnap.id, ...docSnap.data() }
      }
    } else {
      return { success: false, error: 'Orden de compra no encontrada' }
    }
  } catch (error) {
    console.error('Error al obtener orden de compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una orden de compra
 */
export const updatePurchaseOrder = async (businessId, orderId, updates) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'purchaseOrders', orderId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar orden de compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una orden de compra
 */
export const deletePurchaseOrder = async (businessId, orderId) => {
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'purchaseOrders', orderId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar orden de compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener siguiente número de orden de compra
 */
export const getNextPurchaseOrderNumber = async (businessId) => {
  try {
    const docRef = doc(db, 'businesses', businessId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      const series = data.series

      if (series && series.ordenCompra) {
        const typeData = series.ordenCompra
        const nextNumber = typeData.lastNumber + 1
        const formattedNumber = `${typeData.serie}-${String(nextNumber).padStart(8, '0')}`

        // Actualizar el último número
        await updateDoc(docRef, {
          'series.ordenCompra.lastNumber': nextNumber,
          updatedAt: serverTimestamp(),
        })

        return {
          success: true,
          number: formattedNumber,
          series: typeData.serie,
          correlativeNumber: nextNumber
        }
      } else {
        // Si no existe la serie, crearla
        await updateDoc(docRef, {
          'series.ordenCompra': {
            serie: 'OC',
            lastNumber: 1
          },
          updatedAt: serverTimestamp(),
        })

        return {
          success: true,
          number: 'OC-00000001',
          series: 'OC',
          correlativeNumber: 1
        }
      }
    }

    return { success: false, error: 'Configuración de empresa no encontrada' }
  } catch (error) {
    console.error('Error al obtener siguiente número de orden de compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar estado de orden de compra
 */
export const updatePurchaseOrderStatus = async (businessId, orderId, status) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'purchaseOrders', orderId)
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar estado de orden de compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Marcar orden de compra como enviada al proveedor
 */
export const markPurchaseOrderAsSent = async (businessId, orderId, sentVia) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'purchaseOrders', orderId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Orden de compra no encontrada' }
    }

    const currentData = docSnap.data()
    const currentSentVia = currentData.sentVia || []

    // Agregar el nuevo método de envío si no existe
    const updatedSentVia = currentSentVia.includes(sentVia)
      ? currentSentVia
      : [...currentSentVia, sentVia]

    await updateDoc(docRef, {
      status: 'sent',
      sentVia: updatedSentVia,
      sentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al marcar orden de compra como enviada:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Convertir orden de compra a compra (cuando se recibe la mercadería)
 */
export const convertToPurchase = async (businessId, orderId) => {
  try {
    const orderRef = doc(db, 'businesses', businessId, 'purchaseOrders', orderId)
    const orderSnap = await getDoc(orderRef)

    if (!orderSnap.exists()) {
      return { success: false, error: 'Orden de compra no encontrada' }
    }

    const order = orderSnap.data()

    // Verificar que no esté ya convertida
    if (order.status === 'received' || order.relatedPurchaseId) {
      return { success: false, error: 'La orden de compra ya fue convertida' }
    }

    // Retornar los datos necesarios para crear la compra
    return {
      success: true,
      data: {
        supplier: order.supplier,
        items: order.items,
        subtotal: order.subtotal,
        igv: order.igv,
        total: order.total,
        notes: order.notes,
        purchaseOrderId: orderId,
        purchaseOrderNumber: order.number,
      }
    }
  } catch (error) {
    console.error('Error al convertir orden de compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Marcar orden de compra como recibida
 */
export const markPurchaseOrderAsReceived = async (businessId, orderId, purchaseId) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'purchaseOrders', orderId)
    await updateDoc(docRef, {
      status: 'received',
      relatedPurchaseId: purchaseId,
      receivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al marcar orden de compra como recibida:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cancelar orden de compra
 */
export const cancelPurchaseOrder = async (businessId, orderId, reason) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'purchaseOrders', orderId)
    await updateDoc(docRef, {
      status: 'cancelled',
      cancellationReason: reason,
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al cancelar orden de compra:', error)
    return { success: false, error: error.message }
  }
}
