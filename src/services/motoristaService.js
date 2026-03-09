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
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio para gestión de motoristas/repartidores
 */

// =====================================================
// MOTORISTAS
// =====================================================

/**
 * Obtener todos los motoristas de un negocio
 */
export const getMotoristas = async (businessId) => {
  try {
    const ref = collection(db, 'businesses', businessId, 'motoristas')
    const q = query(ref, orderBy('name', 'asc'))
    const snapshot = await getDocs(q)

    const motoristas = []
    snapshot.forEach((doc) => {
      motoristas.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: motoristas }
  } catch (error) {
    console.error('Error al obtener motoristas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear un nuevo motorista
 */
export const createMotorista = async (businessId, data) => {
  try {
    const ref = collection(db, 'businesses', businessId, 'motoristas')

    const newMotorista = {
      name: data.name,
      code: data.code,
      phone: data.phone || '',
      email: data.email || '',
      vehicleType: data.vehicleType || 'moto', // moto, auto, bicicleta, pie
      licensePlate: data.licensePlate || '',
      paymentType: data.paymentType || 'per_delivery', // per_delivery, fixed, mixed
      ratePerDelivery: parseFloat(data.ratePerDelivery) || 0,
      fixedSalary: parseFloat(data.fixedSalary) || 0,
      status: 'active', // active, inactive
      operationalStatus: 'available', // available, on_delivery, break, offline
      // Métricas
      todayDeliveries: 0,
      todayCashCollected: 0,
      todayEarnings: 0,
      totalDeliveries: 0,
      totalEarnings: 0,
      // Metadata
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(ref, newMotorista)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear motorista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un motorista
 */
export const updateMotorista = async (businessId, motoristaId, data) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'motoristas', motoristaId)
    await updateDoc(ref, {
      ...data,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar motorista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un motorista
 */
export const deleteMotorista = async (businessId, motoristaId) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'motoristas', motoristaId)
    await deleteDoc(ref)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar motorista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cambiar estado de un motorista (activar/desactivar)
 */
export const toggleMotoristaStatus = async (businessId, motoristaId, isActive) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'motoristas', motoristaId)
    await updateDoc(ref, {
      status: isActive ? 'active' : 'inactive',
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al cambiar estado del motorista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cambiar estado operacional (available, on_delivery, break, offline)
 */
export const updateOperationalStatus = async (businessId, motoristaId, status) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'motoristas', motoristaId)
    await updateDoc(ref, {
      operationalStatus: status,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al cambiar estado operacional:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener motoristas activos (para dropdown en Orders)
 */
export const getActiveMotoristas = async (businessId) => {
  try {
    const ref = collection(db, 'businesses', businessId, 'motoristas')
    const q = query(
      ref,
      where('status', '==', 'active'),
      orderBy('name', 'asc')
    )
    const snapshot = await getDocs(q)

    const motoristas = []
    snapshot.forEach((doc) => {
      motoristas.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: motoristas }
  } catch (error) {
    console.error('Error al obtener motoristas activos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener estadísticas de motoristas
 */
export const getMotoristasStats = async (businessId) => {
  try {
    const result = await getMotoristas(businessId)
    if (!result.success) return result

    const motoristas = result.data
    const active = motoristas.filter(m => m.status === 'active')

    // Obtener entregas de hoy
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTimestamp = Timestamp.fromDate(today)

    const deliveriesRef = collection(db, 'businesses', businessId, 'deliveries')
    const deliveriesQuery = query(deliveriesRef, where('createdAt', '>=', todayTimestamp))
    const deliveriesSnap = await getDocs(deliveriesQuery)

    let todayDeliveries = 0
    let todayCashCollected = 0
    let todayEarnings = 0

    deliveriesSnap.forEach((doc) => {
      const d = doc.data()
      todayDeliveries++
      if (d.paymentMethod === 'cash' || d.paymentMethod === 'efectivo') {
        todayCashCollected += d.cashCollected || d.amount || 0
      }
      todayEarnings += d.deliveryFee || 0
    })

    const stats = {
      total: motoristas.length,
      active: active.length,
      todayDeliveries,
      todayCashCollected,
      averageEarning: todayDeliveries > 0 ? todayEarnings / todayDeliveries : 0,
    }

    return { success: true, data: stats }
  } catch (error) {
    console.error('Error al obtener estadísticas de motoristas:', error)
    return { success: false, error: error.message }
  }
}

// =====================================================
// DELIVERIES (Registros de entregas)
// =====================================================

/**
 * Crear un registro de entrega
 */
export const createDeliveryRecord = async (businessId, data) => {
  try {
    const ref = collection(db, 'businesses', businessId, 'deliveries')

    const newDelivery = {
      motoristaId: data.motoristaId,
      motoristaName: data.motoristaName || '',
      orderId: data.orderId || '',
      orderNumber: data.orderNumber || '',
      customerName: data.customerName || '',
      customerPhone: data.customerPhone || '',
      customerAddress: data.customerAddress || '',
      amount: parseFloat(data.amount) || 0,
      deliveryFee: parseFloat(data.deliveryFee) || 0,
      paymentMethod: data.paymentMethod || 'cash',
      cashCollected: parseFloat(data.cashCollected) || 0,
      status: data.status || 'assigned', // assigned, in_transit, delivered, cancelled
      settled: false, // Para arqueo de caja
      settledAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(ref, newDelivery)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear registro de entrega:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener entregas con filtros
 */
export const getDeliveries = async (businessId, filters = {}) => {
  try {
    const ref = collection(db, 'businesses', businessId, 'deliveries')
    const constraints = []

    if (filters.motoristaId) {
      constraints.push(where('motoristaId', '==', filters.motoristaId))
    }
    if (filters.status) {
      constraints.push(where('status', '==', filters.status))
    }
    if (filters.startDate) {
      const [y, m, d] = filters.startDate.split('-').map(Number)
      const start = new Date(y, m - 1, d, 0, 0, 0, 0)
      constraints.push(where('createdAt', '>=', Timestamp.fromDate(start)))
    }
    if (filters.endDate) {
      const [y, m, d] = filters.endDate.split('-').map(Number)
      const end = new Date(y, m - 1, d, 23, 59, 59, 999)
      constraints.push(where('createdAt', '<=', Timestamp.fromDate(end)))
    }

    const q = constraints.length > 0
      ? query(ref, ...constraints, orderBy('createdAt', 'desc'))
      : query(ref, orderBy('createdAt', 'desc'))

    const snapshot = await getDocs(q)

    const deliveries = []
    snapshot.forEach((doc) => {
      deliveries.push({ id: doc.id, ...doc.data() })
    })

    // Filtro client-side para paymentMethod (evitar composite index innecesario)
    let filtered = deliveries
    if (filters.paymentMethod) {
      filtered = filtered.filter(d => d.paymentMethod === filters.paymentMethod)
    }

    return { success: true, data: filtered }
  } catch (error) {
    console.error('Error al obtener entregas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener entregas en efectivo sin liquidar de un motorista en una fecha
 */
export const getUnsettledDeliveriesForMotorista = async (businessId, motoristaId, date) => {
  try {
    const ref = collection(db, 'businesses', businessId, 'deliveries')

    const [y, m, d] = date.split('-').map(Number)
    const startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0)
    const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999)

    const q = query(
      ref,
      where('motoristaId', '==', motoristaId),
      where('settled', '==', false),
      where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
      where('createdAt', '<=', Timestamp.fromDate(endOfDay))
    )

    const snapshot = await getDocs(q)
    const deliveries = []
    snapshot.forEach((doc) => {
      deliveries.push({ id: doc.id, ...doc.data() })
    })

    // Filtrar solo las de efectivo
    const cashDeliveries = deliveries.filter(
      d => d.paymentMethod === 'cash' || d.paymentMethod === 'efectivo'
    )

    return { success: true, data: cashDeliveries }
  } catch (error) {
    console.error('Error al obtener entregas sin liquidar:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar estado de un envío
 */
export const updateDeliveryStatus = async (businessId, deliveryId, status) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'deliveries', deliveryId)
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar estado del envío:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Liquidar (cerrar arqueo) entregas
 */
export const settleDeliveries = async (businessId, deliveryIds, actualAmount) => {
  try {
    const now = serverTimestamp()
    const updates = deliveryIds.map((id) => {
      const ref = doc(db, 'businesses', businessId, 'deliveries', id)
      return updateDoc(ref, {
        settled: true,
        settledAt: now,
        actualAmountDelivered: parseFloat(actualAmount) || 0,
        updatedAt: now,
      })
    })

    await Promise.all(updates)
    return { success: true }
  } catch (error) {
    console.error('Error al liquidar entregas:', error)
    return { success: false, error: error.message }
  }
}
