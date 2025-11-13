import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio para gestión de vendedores
 */

// =====================================================
// VENDEDORES (Sellers)
// =====================================================

/**
 * Obtener todos los vendedores de un negocio
 */
export const getSellers = async (businessId) => {
  try {
    const sellersRef = collection(db, 'businesses', businessId, 'sellers')
    const snapshot = await getDocs(sellersRef)

    const sellers = []
    snapshot.forEach((doc) => {
      sellers.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: sellers }
  } catch (error) {
    console.error('Error al obtener vendedores:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener un vendedor específico
 */
export const getSeller = async (businessId, sellerId) => {
  try {
    const sellerRef = doc(db, 'businesses', businessId, 'sellers', sellerId)
    const sellerSnap = await getDoc(sellerRef)

    if (!sellerSnap.exists()) {
      return { success: false, error: 'Vendedor no encontrado' }
    }

    return { success: true, data: { id: sellerSnap.id, ...sellerSnap.data() } }
  } catch (error) {
    console.error('Error al obtener vendedor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear un nuevo vendedor
 */
export const createSeller = async (businessId, sellerData) => {
  try {
    const sellersRef = collection(db, 'businesses', businessId, 'sellers')

    const newSeller = {
      ...sellerData,
      status: 'active',
      // Métricas
      todaySales: 0,
      todayOrders: 0,
      totalSales: 0,
      totalOrders: 0,
      // Timestamps
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(sellersRef, newSeller)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear vendedor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un vendedor
 */
export const updateSeller = async (businessId, sellerId, sellerData) => {
  try {
    const sellerRef = doc(db, 'businesses', businessId, 'sellers', sellerId)

    await updateDoc(sellerRef, {
      ...sellerData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar vendedor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un vendedor
 */
export const deleteSeller = async (businessId, sellerId) => {
  try {
    const sellerRef = doc(db, 'businesses', businessId, 'sellers', sellerId)
    await deleteDoc(sellerRef)

    return { success: true }
  } catch (error) {
    console.error('Error al eliminar vendedor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Alternar estado de un vendedor (activo/inactivo)
 */
export const toggleSellerStatus = async (businessId, sellerId, currentStatus) => {
  try {
    const sellerRef = doc(db, 'businesses', businessId, 'sellers', sellerId)
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'

    await updateDoc(sellerRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
    })

    return { success: true, newStatus }
  } catch (error) {
    console.error('Error al cambiar estado del vendedor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener estadísticas de vendedores
 */
export const getSellersStats = async (businessId) => {
  try {
    const sellersRef = collection(db, 'businesses', businessId, 'sellers')
    const snapshot = await getDocs(sellersRef)

    const stats = {
      total: 0,
      active: 0,
      inactive: 0,
      totalSales: 0,
      totalOrders: 0,
      todaySales: 0,
      todayOrders: 0,
    }

    snapshot.forEach((doc) => {
      const seller = doc.data()
      stats.total++

      if (seller.status === 'active') {
        stats.active++
      } else {
        stats.inactive++
      }

      stats.totalSales += seller.totalSales || 0
      stats.totalOrders += seller.totalOrders || 0
      stats.todaySales += seller.todaySales || 0
      stats.todayOrders += seller.todayOrders || 0
    })

    return { success: true, data: stats }
  } catch (error) {
    console.error('Error al obtener estadísticas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Resetear métricas del día de todos los vendedores (ejecutar diariamente)
 */
export const resetDailyMetrics = async (businessId) => {
  try {
    const sellersRef = collection(db, 'businesses', businessId, 'sellers')
    const snapshot = await getDocs(sellersRef)

    const promises = []
    snapshot.forEach((docSnap) => {
      promises.push(
        updateDoc(docSnap.ref, {
          todaySales: 0,
          todayOrders: 0,
          updatedAt: serverTimestamp(),
        })
      )
    })

    await Promise.all(promises)
    return { success: true }
  } catch (error) {
    console.error('Error al resetear métricas:', error)
    return { success: false, error: error.message }
  }
}

export default {
  getSellers,
  getSeller,
  createSeller,
  updateSeller,
  deleteSeller,
  toggleSellerStatus,
  getSellersStats,
  resetDailyMetrics,
}
