/**
 * Servicio de Citas/Agenda Veterinaria
 * Gestiona citas, agenda del día e integración con historial y POS
 */

import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { addRecurringService, updateRecurringService } from './veterinaryService'

// ==================== CITAS ====================

/**
 * Obtener citas por fecha
 * @param {string} businessId
 * @param {Date} date - Fecha a consultar
 */
export const getAppointmentsByDate = async (businessId, date) => {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const ref = collection(db, 'businesses', businessId, 'appointments')
  const q = query(
    ref,
    where('scheduledDate', '>=', Timestamp.fromDate(startOfDay)),
    where('scheduledDate', '<=', Timestamp.fromDate(endOfDay)),
    orderBy('scheduledDate', 'asc')
  )

  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

/**
 * Obtener citas de un rango de fechas
 */
export const getAppointmentsByDateRange = async (businessId, startDate, endDate) => {
  const ref = collection(db, 'businesses', businessId, 'appointments')
  const q = query(
    ref,
    where('scheduledDate', '>=', Timestamp.fromDate(startDate)),
    where('scheduledDate', '<=', Timestamp.fromDate(endDate)),
    orderBy('scheduledDate', 'asc')
  )

  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

/**
 * Obtener citas pendientes de un cliente/mascota
 */
export const getCustomerAppointments = async (businessId, customerId) => {
  const ref = collection(db, 'businesses', businessId, 'appointments')
  const q = query(
    ref,
    where('customerId', '==', customerId),
    where('status', 'in', ['scheduled', 'confirmed']),
    orderBy('scheduledDate', 'asc')
  )

  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

/**
 * Crear una nueva cita
 * @param {Object} appointment - Datos de la cita
 * {
 *   customerId, customerName, petName, petSpecies,
 *   serviceType, serviceName, servicePrice,
 *   scheduledDate, scheduledTime, duration (minutos),
 *   notes, phone,
 *   recurringServiceId (opcional - si viene de un servicio recurrente)
 * }
 */
export const createAppointment = async (businessId, appointment) => {
  const ref = collection(db, 'businesses', businessId, 'appointments')

  // Combinar fecha y hora (evitar problemas de zona horaria)
  const [hours, minutes] = (appointment.scheduledTime || '09:00').split(':')
  const [year, month, day] = appointment.scheduledDate.split('-').map(Number)
  const scheduledDate = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes), 0, 0)

  const docRef = await addDoc(ref, {
    ...appointment,
    scheduledDate: Timestamp.fromDate(scheduledDate),
    status: 'scheduled', // scheduled, confirmed, in_progress, completed, cancelled, no_show
    createdAt: Timestamp.now(),
  })

  return docRef.id
}

/**
 * Actualizar una cita
 */
export const updateAppointment = async (businessId, appointmentId, data) => {
  const ref = doc(db, 'businesses', businessId, 'appointments', appointmentId)

  const updateData = { ...data, updatedAt: Timestamp.now() }

  // Si se actualiza fecha/hora, recalcular (evitar problemas de zona horaria)
  if (data.scheduledDate && data.scheduledTime) {
    const [hours, minutes] = data.scheduledTime.split(':')
    const [year, month, day] = data.scheduledDate.split('-').map(Number)
    const scheduledDate = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes), 0, 0)
    updateData.scheduledDate = Timestamp.fromDate(scheduledDate)
  }

  await updateDoc(ref, updateData)
}

/**
 * Cancelar una cita
 */
export const cancelAppointment = async (businessId, appointmentId, reason = '') => {
  const ref = doc(db, 'businesses', businessId, 'appointments', appointmentId)
  await updateDoc(ref, {
    status: 'cancelled',
    cancelReason: reason,
    cancelledAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
}

/**
 * Marcar cita como completada y actualizar servicio recurrente
 * @param {string} invoiceId - ID de la factura generada (opcional)
 */
export const completeAppointment = async (businessId, appointmentId, invoiceId = null) => {
  const appointmentRef = doc(db, 'businesses', businessId, 'appointments', appointmentId)
  const appointmentSnap = await getDoc(appointmentRef)

  if (!appointmentSnap.exists()) {
    throw new Error('Cita no encontrada')
  }

  const appointment = appointmentSnap.data()

  // Actualizar cita como completada
  await updateDoc(appointmentRef, {
    status: 'completed',
    completedAt: Timestamp.now(),
    invoiceId: invoiceId,
    updatedAt: Timestamp.now(),
  })

  // Si tiene servicio recurrente asociado, actualizar fechas
  if (appointment.recurringServiceId && appointment.customerId) {
    try {
      const serviceRef = doc(
        db,
        'businesses',
        businessId,
        'customers',
        appointment.customerId,
        'recurringServices',
        appointment.recurringServiceId
      )
      const serviceSnap = await getDoc(serviceRef)

      if (serviceSnap.exists()) {
        const service = serviceSnap.data()
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + (service.frequency || 30))

        await updateDoc(serviceRef, {
          lastDate: Timestamp.now(),
          nextDate: Timestamp.fromDate(nextDate),
          updatedAt: Timestamp.now(),
        })
      }
    } catch (error) {
      console.error('Error actualizando servicio recurrente:', error)
    }
  }

  return appointment
}

/**
 * Eliminar una cita
 */
export const deleteAppointment = async (businessId, appointmentId) => {
  const ref = doc(db, 'businesses', businessId, 'appointments', appointmentId)
  await deleteDoc(ref)
}

/**
 * Marcar cliente como "no asistió"
 */
export const markNoShow = async (businessId, appointmentId) => {
  const ref = doc(db, 'businesses', businessId, 'appointments', appointmentId)
  await updateDoc(ref, {
    status: 'no_show',
    updatedAt: Timestamp.now(),
  })
}

/**
 * Confirmar cita
 */
export const confirmAppointment = async (businessId, appointmentId) => {
  const ref = doc(db, 'businesses', businessId, 'appointments', appointmentId)
  await updateDoc(ref, {
    status: 'confirmed',
    confirmedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
}

/**
 * Iniciar atención (cambiar estado a in_progress)
 */
export const startAppointment = async (businessId, appointmentId) => {
  const ref = doc(db, 'businesses', businessId, 'appointments', appointmentId)
  await updateDoc(ref, {
    status: 'in_progress',
    startedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
}

// ==================== TIPOS DE SERVICIO ====================

export const SERVICE_TYPES = [
  { value: 'bath', label: 'Baño', duration: 60, icon: '🛁' },
  { value: 'bath_cut', label: 'Baño y Corte', duration: 90, icon: '✂️' },
  { value: 'consultation', label: 'Consulta', duration: 30, icon: '🩺' },
  { value: 'vaccination', label: 'Vacunación', duration: 15, icon: '💉' },
  { value: 'deworming', label: 'Desparasitación', duration: 15, icon: '💊' },
  { value: 'surgery', label: 'Cirugía', duration: 120, icon: '🏥' },
  { value: 'dental', label: 'Limpieza Dental', duration: 60, icon: '🦷' },
  { value: 'nails', label: 'Corte de Uñas', duration: 15, icon: '✂️' },
  { value: 'ears', label: 'Limpieza de Oídos', duration: 15, icon: '👂' },
  { value: 'checkup', label: 'Control/Seguimiento', duration: 20, icon: '📋' },
  { value: 'emergency', label: 'Emergencia', duration: 60, icon: '🚨' },
  { value: 'other', label: 'Otro', duration: 30, icon: '📌' },
]

// ==================== ESTADOS ====================

export const APPOINTMENT_STATUS = {
  scheduled: { label: 'Programada', color: 'blue', icon: '📅' },
  confirmed: { label: 'Confirmada', color: 'green', icon: '✅' },
  in_progress: { label: 'En Atención', color: 'yellow', icon: '⏳' },
  completed: { label: 'Completada', color: 'gray', icon: '✔️' },
  cancelled: { label: 'Cancelada', color: 'red', icon: '❌' },
  no_show: { label: 'No Asistió', color: 'orange', icon: '🚫' },
}

// ==================== HELPERS ====================

/**
 * Obtener estadísticas del día
 */
export const getDayStats = async (businessId, date) => {
  const appointments = await getAppointmentsByDate(businessId, date)

  return {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === 'scheduled').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    inProgress: appointments.filter(a => a.status === 'in_progress').length,
    completed: appointments.filter(a => a.status === 'completed').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
    noShow: appointments.filter(a => a.status === 'no_show').length,
  }
}
