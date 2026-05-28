import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio de horarios (Capa 2 del módulo Personal).
 *
 * Dos colecciones:
 *   - businesses/{bid}/shiftTemplates/{tid}        plantillas reusables
 *   - businesses/{bid}/schedules/{userId}_{YYYY}_{WW}  horario semanal por
 *     empleado, key compuesta para lookups directos sin índices.
 */

// ---------- Helpers ISO semana ----------

/**
 * Calcula el año ISO y la semana ISO de un Date (estándar ISO 8601).
 * Lunes = primer día. La semana 1 es la que contiene el primer jueves del año.
 */
export const getIsoWeek = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7 // dom=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return { isoYear: d.getUTCFullYear(), isoWeek: weekNum }
}

/**
 * Devuelve la fecha del lunes de la semana ISO indicada.
 */
export const getMondayOfIsoWeek = (isoYear, isoWeek) => {
  const simple = new Date(Date.UTC(isoYear, 0, 1 + (isoWeek - 1) * 7))
  const dow = simple.getUTCDay()
  const monday = new Date(simple)
  if (dow <= 4) {
    monday.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1)
  } else {
    monday.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay())
  }
  // Convertir a fecha local a las 00:00
  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0, 0, 0)
}

/**
 * Devuelve los 7 Date objects (lun..dom) de la semana ISO indicada.
 */
export const getWeekDates = (isoYear, isoWeek) => {
  const monday = getMondayOfIsoWeek(isoYear, isoWeek)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

/**
 * Suma o resta semanas a un { isoYear, isoWeek } de forma segura.
 */
export const addWeeks = (isoYear, isoWeek, delta) => {
  const monday = getMondayOfIsoWeek(isoYear, isoWeek)
  monday.setDate(monday.getDate() + delta * 7)
  return getIsoWeek(monday)
}

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const DAY_LABELS = {
  mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom',
}

/**
 * Convierte HH:mm a minutos desde medianoche.
 */
export const timeToMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string') return 0
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Calcula la duración en horas (decimales) entre dos HH:mm. Soporta turnos
 * que cruzan medianoche (end < start asume +24h).
 * @param {number} breakMinutes  minutos de descanso a descontar
 */
export const calcShiftHours = (start, end, breakMinutes = 0) => {
  let s = timeToMinutes(start)
  let e = timeToMinutes(end)
  if (e <= s) e += 24 * 60 // cruza medianoche
  const total = Math.max(0, e - s - (breakMinutes || 0))
  return Math.round((total / 60) * 100) / 100
}

/**
 * Suma todas las horas de un objeto `days` ({mon: {start,end,breakMinutes}, ...}).
 */
export const calculateWeekHours = (daysObj) => {
  if (!daysObj) return 0
  let total = 0
  for (const key of DAY_KEYS) {
    const d = daysObj[key]
    // Descansos y recuperaciones no suman horas semanales: solo turnos productivos.
    if (!d || d.rest || d.recovery) continue
    if (d.start && d.end) {
      total += calcShiftHours(d.start, d.end, d.breakMinutes || 0)
    }
  }
  return Math.round(total * 100) / 100
}

// ---------- Plantillas de turno ----------

const templatesCol = (businessId) => collection(db, 'businesses', businessId, 'shiftTemplates')

export const listShiftTemplates = async (businessId, { includeInactive = false } = {}) => {
  try {
    const snap = await getDocs(templatesCol(businessId))
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    if (!includeInactive) list = list.filter((t) => t.isActive !== false)
    list.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
    return { success: true, data: list }
  } catch (error) {
    console.error('Error listando plantillas:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export const createShiftTemplate = async (businessId, data) => {
  try {
    const ref = doc(templatesCol(businessId))
    const payload = {
      id: ref.id,
      name: data.name || 'Sin nombre',
      startTime: data.startTime || '08:00',
      endTime: data.endTime || '17:00',
      breakMinutes: Number(data.breakMinutes) || 0,
      color: data.color || '#fbbf24',
      isRest: !!data.isRest,
      // Sucursal por defecto al aplicar esta plantilla (opcional).
      // null = usa la sucursal del filtro activo del planner.
      defaultBranchId: data.defaultBranchId || null,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(ref, payload)
    return { success: true, id: ref.id, data: payload }
  } catch (error) {
    console.error('Error creando plantilla:', error)
    return { success: false, error: error.message }
  }
}

export const updateShiftTemplate = async (businessId, tid, data) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'shiftTemplates', tid)
    const payload = { ...data, updatedAt: serverTimestamp() }
    if (payload.breakMinutes !== undefined) payload.breakMinutes = Number(payload.breakMinutes) || 0
    await updateDoc(ref, payload)
    return { success: true }
  } catch (error) {
    console.error('Error actualizando plantilla:', error)
    return { success: false, error: error.message }
  }
}

export const deleteShiftTemplate = async (businessId, tid) => {
  // Soft delete: solo marca isActive=false, así los horarios viejos que la
  // referencian no se rompen.
  return updateShiftTemplate(businessId, tid, { isActive: false })
}

// ---------- Horarios semanales ----------

const scheduleId = (userId, isoYear, isoWeek) =>
  `${userId}_${isoYear}_${String(isoWeek).padStart(2, '0')}`

const schedulesCol = (businessId) => collection(db, 'businesses', businessId, 'schedules')
const scheduleDoc = (businessId, userId, isoYear, isoWeek) =>
  doc(db, 'businesses', businessId, 'schedules', scheduleId(userId, isoYear, isoWeek))

/**
 * Lee el horario de un usuario para una semana específica.
 * Si no existe, devuelve null (no error).
 */
export const getWeekSchedule = async (businessId, userId, isoYear, isoWeek) => {
  try {
    const snap = await getDoc(scheduleDoc(businessId, userId, isoYear, isoWeek))
    if (!snap.exists()) return { success: true, data: null }
    return { success: true, data: { id: snap.id, ...snap.data() } }
  } catch (error) {
    console.error('Error leyendo horario:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Lee TODOS los horarios de la semana (todos los empleados).
 * Usa un where en isoYear+isoWeek; sin índice compuesto necesario porque
 * el campo isoYear se filtra primero y el resultado por semana es chico (<200).
 */
export const getWeekScheduleAll = async (businessId, isoYear, isoWeek) => {
  try {
    const q = query(
      schedulesCol(businessId),
      where('isoYear', '==', isoYear),
      where('isoWeek', '==', isoWeek),
    )
    const snap = await getDocs(q)
    return { success: true, data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error leyendo horarios de la semana:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Guarda (o sobreescribe) el horario semanal de un empleado.
 * @param {object} days  { mon: {start,end,...} | { rest: true } | null, ... }
 */
export const saveWeekSchedule = async (businessId, userId, isoYear, isoWeek, days, extra = {}) => {
  try {
    const monday = getMondayOfIsoWeek(isoYear, isoWeek)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    const payload = {
      userId,
      isoYear,
      isoWeek,
      weekStart: monday,
      weekEnd: sunday,
      branchId: extra.branchId || null,
      days: days || {},
      totalHours: calculateWeekHours(days),
      publishedAt: extra.publishedAt || null,
      publishedBy: extra.publishedBy || null,
      updatedAt: serverTimestamp(),
    }

    await setDoc(scheduleDoc(businessId, userId, isoYear, isoWeek), payload, { merge: true })
    return { success: true }
  } catch (error) {
    console.error('Error guardando horario:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Devuelve el turno asignado a un usuario para una fecha específica.
 * Útil para el cruce con asistencia (detección de tardanzas).
 *
 * @returns {Promise<{ success, data: { dayKey, cell, schedule } | null }>}
 */
export const getScheduleForDate = async (businessId, userId, date) => {
  try {
    const d = date instanceof Date ? date : new Date(date)
    const { isoYear, isoWeek } = getIsoWeek(d)
    const res = await getWeekSchedule(businessId, userId, isoYear, isoWeek)
    if (!res.success || !res.data) return { success: true, data: null }

    // Mapear getDay() (0=dom..6=sáb) a DAY_KEYS (mon..sun)
    const dow = d.getDay()
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dow]
    const cell = res.data.days?.[dayKey] || null
    return { success: true, data: { dayKey, cell, schedule: res.data } }
  } catch (error) {
    console.error('Error obteniendo turno del día:', error)
    return { success: false, error: error.message, data: null }
  }
}

export const deleteWeekSchedule = async (businessId, userId, isoYear, isoWeek) => {
  try {
    await deleteDoc(scheduleDoc(businessId, userId, isoYear, isoWeek))
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Publica todos los horarios de una semana (set publishedAt para que los
 * empleados los vean en su portal).
 *
 * @param {string[]|'all'} userIds
 */
export const publishWeekSchedules = async (businessId, isoYear, isoWeek, userIds = 'all', publisherUid = null) => {
  try {
    const all = await getWeekScheduleAll(businessId, isoYear, isoWeek)
    if (!all.success) return all
    const targets = userIds === 'all' ? all.data : all.data.filter((s) => userIds.includes(s.userId))
    const now = serverTimestamp()
    await Promise.all(
      targets.map((s) =>
        updateDoc(scheduleDoc(businessId, s.userId, isoYear, isoWeek), {
          publishedAt: now,
          publishedBy: publisherUid,
        })
      )
    )
    return { success: true, count: targets.length }
  } catch (error) {
    console.error('Error publicando horarios:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Copia el horario de la semana anterior a la semana indicada para un usuario.
 * No copia el flag publishedAt (el copy queda como borrador).
 */
export const copyPreviousWeek = async (businessId, userId, isoYear, isoWeek) => {
  try {
    const prev = addWeeks(isoYear, isoWeek, -1)
    const prevSchedule = await getWeekSchedule(businessId, userId, prev.isoYear, prev.isoWeek)
    if (!prevSchedule.success) return prevSchedule
    if (!prevSchedule.data) return { success: false, error: 'No hay horario en la semana anterior' }
    return saveWeekSchedule(businessId, userId, isoYear, isoWeek, prevSchedule.data.days || {})
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Bulk: aplica una plantilla a un set de empleados en los días indicados,
 * en una semana específica.
 *
 * @param {string[]} userIds
 * @param {string[]} days     ['mon','tue',...] subset de DAY_KEYS
 * @param {object} template   { startTime, endTime, breakMinutes, id }
 */
export const applyTemplateBulk = async (businessId, isoYear, isoWeek, userIds, days, template) => {
  try {
    const all = await getWeekScheduleAll(businessId, isoYear, isoWeek)
    if (!all.success) return all
    const byUser = new Map(all.data.map((s) => [s.userId, s]))

    await Promise.all(
      userIds.map(async (uid) => {
        const existing = byUser.get(uid)?.days || {}
        const newDays = { ...existing }
        for (const dk of days) {
          newDays[dk] = {
            templateId: template.id || null,
            start: template.startTime,
            end: template.endTime,
            breakMinutes: template.breakMinutes || 0,
            color: template.color || null,
          }
        }
        await saveWeekSchedule(businessId, uid, isoYear, isoWeek, newDays)
      })
    )
    return { success: true, count: userIds.length }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
