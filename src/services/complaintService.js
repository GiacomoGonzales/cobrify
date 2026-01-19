import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  runTransaction
} from 'firebase/firestore'

/**
 * Tipos de reclamo según normativa peruana
 */
export const COMPLAINT_TYPES = [
  {
    id: 'reclamo',
    name: 'Reclamo',
    description: 'Disconformidad relacionada a los productos o servicios adquiridos'
  },
  {
    id: 'queja',
    name: 'Queja',
    description: 'Malestar o descontento respecto a la atención al público'
  }
]

/**
 * Estados de un reclamo
 */
export const COMPLAINT_STATUS = {
  pending: { id: 'pending', name: 'Pendiente', color: 'yellow' },
  in_progress: { id: 'in_progress', name: 'En Proceso', color: 'blue' },
  resolved: { id: 'resolved', name: 'Resuelto', color: 'green' }
}

/**
 * Tipos de documento de identidad
 */
export const DOCUMENT_TYPES = [
  { id: 'DNI', name: 'DNI' },
  { id: 'CE', name: 'Carné de Extranjería' },
  { id: 'PASAPORTE', name: 'Pasaporte' },
  { id: 'RUC', name: 'RUC' }
]

/**
 * Genera un código de seguimiento aleatorio de 8 caracteres
 */
function generateTrackingCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Obtiene el siguiente número correlativo de reclamo
 */
async function getNextComplaintNumber(businessId) {
  const counterRef = doc(db, 'businesses', businessId, 'counters', 'complaints')

  try {
    const newNumber = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef)

      let currentNumber = 0
      if (counterDoc.exists()) {
        currentNumber = counterDoc.data().lastNumber || 0
      }

      const nextNumber = currentNumber + 1
      transaction.set(counterRef, { lastNumber: nextNumber }, { merge: true })

      return nextNumber
    })

    const year = new Date().getFullYear()
    return `REC-${year}-${String(newNumber).padStart(6, '0')}`
  } catch (error) {
    console.error('Error obteniendo número de reclamo:', error)
    // Fallback con timestamp
    const year = new Date().getFullYear()
    const timestamp = Date.now().toString().slice(-6)
    return `REC-${year}-${timestamp}`
  }
}

/**
 * Busca un negocio por su slug de libro de reclamaciones
 */
export async function getBusinessByComplaintsSlug(slug) {
  try {
    const businessesRef = collection(db, 'businesses')
    const q = query(
      businessesRef,
      where('complaintsBookSlug', '==', slug),
      where('complaintsBookEnabled', '==', true)
    )

    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return null
    }

    const doc = snapshot.docs[0]
    return {
      id: doc.id,
      ...doc.data()
    }
  } catch (error) {
    console.error('Error buscando negocio por slug:', error)
    throw error
  }
}

/**
 * Crea un nuevo reclamo (acceso público)
 */
export async function createPublicComplaint(businessId, complaintData, businessSnapshot) {
  try {
    const complaintsRef = collection(db, 'businesses', businessId, 'complaints')

    // Generar número correlativo y código de seguimiento
    const complaintNumber = await getNextComplaintNumber(businessId)
    const trackingCode = generateTrackingCode()

    // Calcular fecha de vencimiento (30 días por defecto)
    const responseDays = businessSnapshot?.complaintsBookResponseDays || 30
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + responseDays)

    const newComplaint = {
      // Identificación
      complaintNumber,
      trackingCode,

      // Tipo
      type: complaintData.type, // 'reclamo' | 'queja'

      // Consumidor
      consumer: {
        fullName: complaintData.consumer.fullName?.trim() || '',
        documentType: complaintData.consumer.documentType || 'DNI',
        documentNumber: complaintData.consumer.documentNumber?.trim() || '',
        email: complaintData.consumer.email?.trim().toLowerCase() || '',
        phone: complaintData.consumer.phone?.trim() || '',
        address: complaintData.consumer.address?.trim() || ''
      },

      // Menor de edad
      isMinor: complaintData.isMinor || false,
      guardian: complaintData.isMinor ? {
        fullName: complaintData.guardian?.fullName?.trim() || '',
        documentType: complaintData.guardian?.documentType || 'DNI',
        documentNumber: complaintData.guardian?.documentNumber?.trim() || ''
      } : null,

      // Detalle del reclamo
      productOrService: complaintData.productOrService?.trim() || '',
      amount: complaintData.amount ? parseFloat(complaintData.amount) : null,
      description: complaintData.description?.trim() || '',
      consumerRequest: complaintData.consumerRequest?.trim() || '',
      attachments: complaintData.attachments || [],

      // Estado
      status: 'pending',
      response: null,

      // Fechas
      createdAt: Timestamp.now(),
      dueDate: Timestamp.fromDate(dueDate),

      // Snapshot del negocio al momento del reclamo
      business: {
        name: businessSnapshot?.businessName || '',
        ruc: businessSnapshot?.ruc || '',
        address: businessSnapshot?.address || ''
      }
    }

    const docRef = await addDoc(complaintsRef, newComplaint)

    return {
      id: docRef.id,
      ...newComplaint,
      createdAt: newComplaint.createdAt.toDate(),
      dueDate: newComplaint.dueDate.toDate()
    }
  } catch (error) {
    console.error('Error al crear reclamo:', error)
    throw error
  }
}

/**
 * Consulta un reclamo por código de seguimiento (acceso público)
 */
export async function getComplaintByTrackingCode(slug, trackingCode) {
  try {
    // Primero buscar el negocio por slug
    const business = await getBusinessByComplaintsSlug(slug)
    if (!business) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    // Buscar el reclamo por código de seguimiento
    const complaintsRef = collection(db, 'businesses', business.id, 'complaints')
    const q = query(complaintsRef, where('trackingCode', '==', trackingCode.toUpperCase()))

    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return { success: false, error: 'Reclamo no encontrado' }
    }

    const doc = snapshot.docs[0]
    const data = doc.data()

    return {
      success: true,
      complaint: {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        dueDate: data.dueDate?.toDate?.() || new Date(data.dueDate),
        response: data.response ? {
          ...data.response,
          respondedAt: data.response.respondedAt?.toDate?.() || new Date(data.response.respondedAt)
        } : null
      }
    }
  } catch (error) {
    console.error('Error consultando reclamo:', error)
    return { success: false, error: 'Error al consultar el reclamo' }
  }
}

/**
 * Obtiene todos los reclamos de un negocio (admin)
 */
export async function getComplaints(userId, filters = {}) {
  try {
    const complaintsRef = collection(db, 'businesses', userId, 'complaints')
    let q = query(complaintsRef, orderBy('createdAt', 'desc'))

    const snapshot = await getDocs(q)
    let complaints = snapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        dueDate: data.dueDate?.toDate?.() || new Date(data.dueDate),
        response: data.response ? {
          ...data.response,
          respondedAt: data.response.respondedAt?.toDate?.() || new Date(data.response.respondedAt)
        } : null
      }
    })

    // Filtrar por estado
    if (filters.status && filters.status !== 'all') {
      complaints = complaints.filter(c => c.status === filters.status)
    }

    // Filtrar por tipo
    if (filters.type && filters.type !== 'all') {
      complaints = complaints.filter(c => c.type === filters.type)
    }

    // Filtrar por rango de fechas
    if (filters.startDate) {
      const start = new Date(filters.startDate)
      start.setHours(0, 0, 0, 0)
      complaints = complaints.filter(c => c.createdAt >= start)
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate)
      end.setHours(23, 59, 59, 999)
      complaints = complaints.filter(c => c.createdAt <= end)
    }

    // Filtrar vencidos (pendientes cuya fecha límite ya pasó)
    if (filters.showExpired) {
      const now = new Date()
      complaints = complaints.filter(c =>
        c.status === 'pending' && c.dueDate < now
      )
    }

    return complaints
  } catch (error) {
    console.error('Error al obtener reclamos:', error)
    throw error
  }
}

/**
 * Obtiene un reclamo por ID (admin)
 */
export async function getComplaintById(userId, complaintId) {
  try {
    const complaintRef = doc(db, 'businesses', userId, 'complaints', complaintId)
    const complaintDoc = await getDoc(complaintRef)

    if (!complaintDoc.exists()) {
      return null
    }

    const data = complaintDoc.data()
    return {
      id: complaintDoc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
      dueDate: data.dueDate?.toDate?.() || new Date(data.dueDate),
      response: data.response ? {
        ...data.response,
        respondedAt: data.response.respondedAt?.toDate?.() || new Date(data.response.respondedAt)
      } : null
    }
  } catch (error) {
    console.error('Error al obtener reclamo:', error)
    throw error
  }
}

/**
 * Responde a un reclamo (admin)
 */
export async function respondComplaint(userId, complaintId, responseText, respondedBy) {
  try {
    const complaintRef = doc(db, 'businesses', userId, 'complaints', complaintId)

    const updateData = {
      status: 'resolved',
      response: {
        text: responseText.trim(),
        respondedAt: Timestamp.now(),
        respondedBy: respondedBy
      }
    }

    await updateDoc(complaintRef, updateData)

    return {
      ...updateData,
      response: {
        ...updateData.response,
        respondedAt: updateData.response.respondedAt.toDate()
      }
    }
  } catch (error) {
    console.error('Error al responder reclamo:', error)
    throw error
  }
}

/**
 * Actualiza el estado de un reclamo (admin)
 */
export async function updateComplaintStatus(userId, complaintId, status) {
  try {
    const complaintRef = doc(db, 'businesses', userId, 'complaints', complaintId)

    await updateDoc(complaintRef, {
      status,
      updatedAt: Timestamp.now()
    })

    return true
  } catch (error) {
    console.error('Error al actualizar estado:', error)
    throw error
  }
}

/**
 * Calcula los días restantes para responder
 */
export function getDaysRemaining(dueDate) {
  const now = new Date()
  const due = new Date(dueDate)
  const diffTime = due - now
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * Verifica si un reclamo está vencido
 */
export function isComplaintExpired(complaint) {
  if (complaint.status === 'resolved') return false
  return getDaysRemaining(complaint.dueDate) < 0
}

/**
 * Obtiene estadísticas de reclamos
 */
export async function getComplaintsStats(userId) {
  try {
    const complaints = await getComplaints(userId)
    const now = new Date()

    const stats = {
      total: complaints.length,
      pending: complaints.filter(c => c.status === 'pending').length,
      inProgress: complaints.filter(c => c.status === 'in_progress').length,
      resolved: complaints.filter(c => c.status === 'resolved').length,
      expired: complaints.filter(c => c.status === 'pending' && new Date(c.dueDate) < now).length,
      reclamos: complaints.filter(c => c.type === 'reclamo').length,
      quejas: complaints.filter(c => c.type === 'queja').length
    }

    return stats
  } catch (error) {
    console.error('Error al obtener estadísticas:', error)
    throw error
  }
}
