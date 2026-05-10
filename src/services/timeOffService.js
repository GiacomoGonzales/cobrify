import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio de vacaciones y permisos (Capa 3 del módulo Personal).
 *
 * Colección: businesses/{bid}/timeOffRequests/{rid}
 */

export const TIMEOFF_TYPES = [
  { value: 'vacation', label: 'Vacaciones', color: 'blue', countsAgainstBalance: true },
  { value: 'sick', label: 'Licencia médica', color: 'amber', countsAgainstBalance: false },
  { value: 'permission', label: 'Permiso', color: 'purple', countsAgainstBalance: false },
  { value: 'unpaid', label: 'Sin goce', color: 'gray', countsAgainstBalance: false },
  { value: 'other', label: 'Otro', color: 'gray', countsAgainstBalance: false },
]

export const TIMEOFF_STATUSES = [
  { value: 'pending', label: 'Pendiente', color: 'amber' },
  { value: 'approved', label: 'Aprobada', color: 'emerald' },
  { value: 'rejected', label: 'Rechazada', color: 'red' },
  { value: 'cancelled', label: 'Cancelada', color: 'gray' },
]

export const getTimeOffTypeInfo = (type) =>
  TIMEOFF_TYPES.find((t) => t.value === type) || TIMEOFF_TYPES[0]

export const getTimeOffStatusInfo = (status) =>
  TIMEOFF_STATUSES.find((s) => s.value === status) || TIMEOFF_STATUSES[0]

const requestsCol = (businessId) =>
  collection(db, 'businesses', businessId, 'timeOffRequests')

const requestDoc = (businessId, rid) =>
  doc(db, 'businesses', businessId, 'timeOffRequests', rid)

// ---------- Helpers ----------

/**
 * Convierte distintos formatos a Date.
 */
const toDate = (v) => {
  if (!v) return null
  if (v.toDate && typeof v.toDate === 'function') return v.toDate()
  if (v instanceof Date) return v
  return new Date(v)
}

/**
 * Calcula la cantidad de días entre startDate y endDate (inclusive).
 * Útil para validar y persistir daysCount.
 */
export const calcDaysBetween = (start, end) => {
  const s = toDate(start)
  const e = toDate(end)
  if (!s || !e) return 0
  // Normalizar a 00:00 para evitar problemas de horas
  const startOfDay = new Date(s.getFullYear(), s.getMonth(), s.getDate())
  const endOfDay = new Date(e.getFullYear(), e.getMonth(), e.getDate())
  const diff = Math.round((endOfDay - startOfDay) / 86400000) + 1
  return Math.max(0, diff)
}

// ---------- CRUD ----------

/**
 * Lista solicitudes con filtros opcionales.
 *
 * @param {object} [filters]
 * @param {string} [filters.userId]
 * @param {string} [filters.status]
 * @param {Date}   [filters.fromDate]   inclusive
 * @param {Date}   [filters.toDate]     inclusive
 */
export const listRequests = async (businessId, filters = {}) => {
  try {
    const snap = await getDocs(requestsCol(businessId))
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

    if (filters.userId) list = list.filter((r) => r.userId === filters.userId)
    if (filters.status) list = list.filter((r) => r.status === filters.status)
    if (filters.fromDate) {
      const f = toDate(filters.fromDate)
      list = list.filter((r) => {
        const e = toDate(r.endDate)
        return e && e >= f
      })
    }
    if (filters.toDate) {
      const t = toDate(filters.toDate)
      list = list.filter((r) => {
        const s = toDate(r.startDate)
        return s && s <= t
      })
    }

    // Más recientes primero (por requestedAt)
    list.sort((a, b) => {
      const aTs = a.requestedAt?.seconds || 0
      const bTs = b.requestedAt?.seconds || 0
      return bTs - aTs
    })

    return { success: true, data: list }
  } catch (error) {
    console.error('Error listando solicitudes:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Crea una solicitud nueva (en estado 'pending').
 *
 * @param {object} data
 * @param {string} data.userId
 * @param {string} data.userName
 * @param {string} data.type        valor de TIMEOFF_TYPES.value
 * @param {Date}   data.startDate
 * @param {Date}   data.endDate
 * @param {string} [data.reason]
 * @param {string} [data.requestedByUid]   quién la creó (owner o el mismo empleado)
 * @param {string} [data.requestedByName]
 */
export const createRequest = async (businessId, data) => {
  try {
    if (!data.userId) return { success: false, error: 'Empleado requerido' }
    if (!data.type) return { success: false, error: 'Tipo de solicitud requerido' }
    if (!data.startDate || !data.endDate) {
      return { success: false, error: 'Fechas requeridas' }
    }
    const start = toDate(data.startDate)
    const end = toDate(data.endDate)
    if (end < start) return { success: false, error: 'La fecha fin no puede ser anterior al inicio' }

    const typeInfo = getTimeOffTypeInfo(data.type)
    const ref = doc(requestsCol(businessId))
    const payload = {
      id: ref.id,
      userId: data.userId,
      userName: data.userName || '',
      type: data.type,
      startDate: start,
      endDate: end,
      daysCount: calcDaysBetween(start, end),
      reason: data.reason || '',
      attachmentUrl: data.attachmentUrl || null,
      status: 'pending',
      countsAgainstBalance: typeInfo.countsAgainstBalance,
      requestedAt: serverTimestamp(),
      requestedByUid: data.requestedByUid || null,
      requestedByName: data.requestedByName || null,
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionNote: null,
    }
    await setDoc(ref, payload)
    return { success: true, id: ref.id }
  } catch (error) {
    console.error('Error creando solicitud:', error)
    return { success: false, error: error.message }
  }
}

const setDecision = async (businessId, rid, status, decisionNote, approverUid, approverName) => {
  try {
    await updateDoc(requestDoc(businessId, rid), {
      status,
      decisionNote: decisionNote || null,
      decidedAt: serverTimestamp(),
      decidedBy: approverUid || null,
      decidedByName: approverName || null,
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export const approveRequest = (businessId, rid, decisionNote, approverUid, approverName) =>
  setDecision(businessId, rid, 'approved', decisionNote, approverUid, approverName)

export const rejectRequest = (businessId, rid, decisionNote, approverUid, approverName) =>
  setDecision(businessId, rid, 'rejected', decisionNote, approverUid, approverName)

export const cancelRequest = async (businessId, rid) => {
  try {
    await updateDoc(requestDoc(businessId, rid), {
      status: 'cancelled',
      decidedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ---------- Balances ----------

/**
 * Calcula el balance de vacaciones de un empleado para un año.
 *
 * @param {object} employee     objeto del empleado (con personnel.vacationDaysPerYear)
 * @param {array}  requests     todas las solicitudes del empleado
 * @param {number} [year]       default año actual
 * @returns {object} { total, taken, pending, available }
 */
export const calculateBalance = (employee, requests, year = new Date().getFullYear()) => {
  const total = Number(employee?.vacationDaysPerYear ?? employee?.personnel?.vacationDaysPerYear ?? 0) || 0

  let taken = 0
  let pending = 0
  for (const r of requests || []) {
    if (!r.countsAgainstBalance) continue
    const start = toDate(r.startDate)
    if (!start || start.getFullYear() !== year) continue
    if (r.status === 'approved') taken += r.daysCount || 0
    else if (r.status === 'pending') pending += r.daysCount || 0
  }

  const available = Math.max(0, total - taken - pending)
  return { total, taken, pending, available }
}

/**
 * Devuelve qué empleados están de vacaciones HOY (solicitud aprobada que
 * incluye la fecha actual).
 */
export const getOnVacationToday = (requests) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  return (requests || []).filter((r) => {
    if (r.status !== 'approved') return false
    const s = toDate(r.startDate)
    const e = toDate(r.endDate)
    if (!s || !e) return false
    return s < tomorrow && e >= today
  })
}

/**
 * Devuelve la solicitud aprobada que cubre una fecha dada (si existe).
 * Útil para justificar ausencias o tardanzas en el cruce con asistencia.
 *
 * @param {Date} date
 * @returns la solicitud aprobada o null
 */
export const getApprovedTimeOffForDate = (requests, date) => {
  const d = date instanceof Date ? date : new Date(date)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return (requests || []).find((r) => {
    if (r.status !== 'approved') return false
    const s = toDate(r.startDate)
    const e = toDate(r.endDate)
    if (!s || !e) return false
    const sd = new Date(s.getFullYear(), s.getMonth(), s.getDate())
    const ed = new Date(e.getFullYear(), e.getMonth(), e.getDate())
    return day >= sd && day <= ed
  }) || null
}

/**
 * Versión async que consulta directamente Firestore (para usar al marcar asistencia).
 */
export const fetchApprovedTimeOffForDate = async (businessId, userId, date) => {
  try {
    const list = await listRequests(businessId, { userId, status: 'approved' })
    if (!list.success) return null
    return getApprovedTimeOffForDate(list.data, date)
  } catch (error) {
    console.error('Error consultando time-off:', error)
    return null
  }
}

/**
 * Devuelve solicitudes que comienzan dentro de los próximos N días.
 */
export const getUpcomingVacations = (requests, days = 30) => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const limit = new Date(now)
  limit.setDate(now.getDate() + days)

  return (requests || []).filter((r) => {
    if (r.status !== 'approved') return false
    const s = toDate(r.startDate)
    if (!s) return false
    return s >= now && s <= limit
  })
}
