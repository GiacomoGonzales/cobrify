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
  orderBy,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio para gestión de Sucursales (Branches)
 * Las sucursales son puntos de venta/emisión configurados por el admin
 * Diferentes de almacenes que son solo para inventario
 */

// Colección de sucursales
const getBranchesRef = (businessId) => collection(db, 'businesses', businessId, 'branches')
const getBranchRef = (businessId, branchId) => doc(db, 'businesses', businessId, 'branches', branchId)

/**
 * Obtener todas las sucursales de un negocio
 */
export const getBranches = async (businessId) => {
  try {
    if (!businessId) {
      return { success: false, error: 'BusinessId es requerido', data: [] }
    }

    const branchesRef = getBranchesRef(businessId)
    const q = query(branchesRef, orderBy('createdAt', 'asc'))
    const snapshot = await getDocs(q)

    const branches = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return { success: true, data: branches }
  } catch (error) {
    console.error('Error al obtener sucursales:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Obtener sucursales activas de un negocio
 */
export const getActiveBranches = async (businessId) => {
  try {
    if (!businessId) {
      return { success: false, error: 'BusinessId es requerido', data: [] }
    }

    const branchesRef = getBranchesRef(businessId)
    const q = query(branchesRef, where('isActive', '==', true), orderBy('createdAt', 'asc'))
    const snapshot = await getDocs(q)

    const branches = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return { success: true, data: branches }
  } catch (error) {
    console.error('Error al obtener sucursales activas:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Obtener una sucursal específica
 */
export const getBranch = async (businessId, branchId) => {
  try {
    if (!businessId || !branchId) {
      return { success: false, error: 'BusinessId y BranchId son requeridos', data: null }
    }

    const branchRef = getBranchRef(businessId, branchId)
    const snapshot = await getDoc(branchRef)

    if (!snapshot.exists()) {
      return { success: false, error: 'Sucursal no encontrada', data: null }
    }

    return {
      success: true,
      data: { id: snapshot.id, ...snapshot.data() }
    }
  } catch (error) {
    console.error('Error al obtener sucursal:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Obtener la sucursal por defecto
 */
export const getDefaultBranch = async (businessId) => {
  try {
    if (!businessId) {
      return { success: false, error: 'BusinessId es requerido', data: null }
    }

    const branchesRef = getBranchesRef(businessId)
    const q = query(branchesRef, where('isDefault', '==', true))
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      // Si no hay default, obtener la primera activa
      const allBranches = await getActiveBranches(businessId)
      if (allBranches.success && allBranches.data.length > 0) {
        return { success: true, data: allBranches.data[0] }
      }
      return { success: false, error: 'No hay sucursales configuradas', data: null }
    }

    const defaultBranch = snapshot.docs[0]
    return {
      success: true,
      data: { id: defaultBranch.id, ...defaultBranch.data() }
    }
  } catch (error) {
    console.error('Error al obtener sucursal por defecto:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Crear una nueva sucursal (Solo desde Admin Panel)
 */
export const createBranch = async (businessId, branchData) => {
  try {
    if (!businessId) {
      return { success: false, error: 'BusinessId es requerido' }
    }

    const branchesRef = getBranchesRef(businessId)

    // Si es la primera sucursal, hacerla default
    const existingBranches = await getDocs(branchesRef)
    const isFirst = existingBranches.empty

    const newBranch = {
      name: branchData.name || 'Sucursal Principal',
      address: branchData.address || '',
      phone: branchData.phone || '',
      email: branchData.email || '',
      location: branchData.location || '',
      isDefault: isFirst ? true : (branchData.isDefault || false),
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: branchData.createdBy || 'admin'
    }

    // Si esta sucursal será default, quitar default de las demás
    if (newBranch.isDefault && !isFirst) {
      const batch = []
      existingBranches.forEach(doc => {
        if (doc.data().isDefault) {
          batch.push(updateDoc(doc.ref, { isDefault: false }))
        }
      })
      await Promise.all(batch)
    }

    const docRef = await addDoc(branchesRef, newBranch)

    // Inicializar series para esta sucursal
    await initializeBranchSeries(businessId, docRef.id)

    return {
      success: true,
      id: docRef.id,
      message: 'Sucursal creada exitosamente'
    }
  } catch (error) {
    console.error('Error al crear sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una sucursal
 */
export const updateBranch = async (businessId, branchId, branchData) => {
  try {
    if (!businessId || !branchId) {
      return { success: false, error: 'BusinessId y BranchId son requeridos' }
    }

    const branchRef = getBranchRef(businessId, branchId)

    // Si se está marcando como default, quitar default de las demás
    if (branchData.isDefault) {
      const branchesRef = getBranchesRef(businessId)
      const snapshot = await getDocs(branchesRef)
      const batch = []
      snapshot.forEach(doc => {
        if (doc.id !== branchId && doc.data().isDefault) {
          batch.push(updateDoc(doc.ref, { isDefault: false }))
        }
      })
      await Promise.all(batch)
    }

    await updateDoc(branchRef, {
      ...branchData,
      updatedAt: serverTimestamp()
    })

    return { success: true, message: 'Sucursal actualizada' }
  } catch (error) {
    console.error('Error al actualizar sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una sucursal (marcar como inactiva)
 */
export const deleteBranch = async (businessId, branchId) => {
  try {
    if (!businessId || !branchId) {
      return { success: false, error: 'BusinessId y BranchId son requeridos' }
    }

    const branchRef = getBranchRef(businessId, branchId)
    const branchDoc = await getDoc(branchRef)

    if (!branchDoc.exists()) {
      return { success: false, error: 'Sucursal no encontrada' }
    }

    // No eliminar físicamente, solo marcar como inactiva
    await updateDoc(branchRef, {
      isActive: false,
      updatedAt: serverTimestamp()
    })

    return { success: true, message: 'Sucursal desactivada' }
  } catch (error) {
    console.error('Error al eliminar sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Inicializar series para una nueva sucursal
 */
export const initializeBranchSeries = async (businessId, branchId) => {
  try {
    const businessRef = doc(db, 'businesses', businessId)
    const businessDoc = await getDoc(businessRef)

    if (!businessDoc.exists()) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    const data = businessDoc.data()
    const existingBranchSeries = data.branchSeries || {}

    // Si ya tiene series, no hacer nada
    if (existingBranchSeries[branchId]) {
      return { success: true, message: 'Series ya existen' }
    }

    // Contar sucursales para generar series únicas (F001, F002, etc.)
    const branchesRef = getBranchesRef(businessId)
    const snapshot = await getDocs(branchesRef)
    const branchCount = snapshot.size

    // Generar número de serie (001, 002, etc.)
    const seriesNumber = String(branchCount).padStart(3, '0')

    // Crear series por defecto para esta sucursal
    const defaultSeries = {
      factura: { serie: `F${seriesNumber}`, lastNumber: 0 },
      boleta: { serie: `B${seriesNumber}`, lastNumber: 0 },
      nota_venta: { serie: `N${seriesNumber}`, lastNumber: 0 },
      cotizacion: { serie: `C${seriesNumber}`, lastNumber: 0 },
      nota_credito_factura: { serie: `FC${seriesNumber}`, lastNumber: 0 },
      nota_credito_boleta: { serie: `BC${seriesNumber}`, lastNumber: 0 },
      nota_debito_factura: { serie: `FD${seriesNumber}`, lastNumber: 0 },
      nota_debito_boleta: { serie: `BD${seriesNumber}`, lastNumber: 0 },
      guia_remision: { serie: `T${seriesNumber}`, lastNumber: 0 }
    }

    await updateDoc(businessRef, {
      [`branchSeries.${branchId}`]: defaultSeries
    })

    return { success: true, message: 'Series inicializadas' }
  } catch (error) {
    console.error('Error al inicializar series de sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener series de una sucursal
 */
export const getBranchSeries = async (businessId, branchId) => {
  try {
    const businessRef = doc(db, 'businesses', businessId)
    const businessDoc = await getDoc(businessRef)

    if (!businessDoc.exists()) {
      return { success: false, error: 'Negocio no encontrado', data: null }
    }

    const data = businessDoc.data()
    const branchSeries = data.branchSeries?.[branchId] || null

    return { success: true, data: branchSeries }
  } catch (error) {
    console.error('Error al obtener series de sucursal:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Actualizar series de una sucursal
 */
export const updateBranchSeries = async (businessId, branchId, seriesData) => {
  try {
    const businessRef = doc(db, 'businesses', businessId)

    await updateDoc(businessRef, {
      [`branchSeries.${branchId}`]: seriesData
    })

    return { success: true, message: 'Series actualizadas' }
  } catch (error) {
    console.error('Error al actualizar series de sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todas las series de todas las sucursales
 */
export const getAllBranchSeries = async (businessId) => {
  try {
    const businessRef = doc(db, 'businesses', businessId)
    const businessDoc = await getDoc(businessRef)

    if (!businessDoc.exists()) {
      return { success: false, error: 'Negocio no encontrado', data: {} }
    }

    const data = businessDoc.data()
    return { success: true, data: data.branchSeries || {} }
  } catch (error) {
    console.error('Error al obtener todas las series:', error)
    return { success: false, error: error.message, data: {} }
  }
}

/**
 * Contar sucursales activas de un negocio
 */
export const countActiveBranches = async (businessId) => {
  try {
    const result = await getActiveBranches(businessId)
    return result.success ? result.data.length : 0
  } catch (error) {
    console.error('Error al contar sucursales:', error)
    return 0
  }
}

/**
 * Verificar si un negocio puede crear más sucursales
 * según su límite de suscripción
 */
export const canCreateBranch = async (businessId, maxBranches) => {
  try {
    const currentCount = await countActiveBranches(businessId)

    // -1 significa ilimitado
    if (maxBranches === -1) return true

    return currentCount < maxBranches
  } catch (error) {
    console.error('Error al verificar límite de sucursales:', error)
    return false
  }
}
