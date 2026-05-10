import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getScheduleForDate } from './scheduleService'
import { fetchApprovedTimeOffForDate } from './timeOffService'

/**
 * Cruza los datos de asistencia con el horario asignado y vacaciones aprobadas
 * para detectar tardanzas / ausencias justificadas. Devuelve un patch a aplicar
 * al record antes de persistir. Si falla cualquier consulta, devuelve {} (no
 * bloquea la marcación; F6 es informativo, no crítico).
 *
 * @param {string} businessId
 * @param {string} userId
 * @param {Date} timestamp        fecha/hora de la marcación
 * @param {'in'|'out'} type
 * @param {number} [graceMinutes] tolerancia antes de etiquetar tardanza (default 15)
 */
const buildScheduleEnrichment = async (businessId, userId, timestamp, type, graceMinutes = 15) => {
  try {
    if (type !== 'in') return {}
    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp)

    // 1) Vacación/permiso aprobado para hoy: si existe, marca como justificado
    //    (en una marcación 'in', justificado significa que la tardanza no aplica
    //    aunque se llegue tarde; igual queda como 'in' normal).
    const offReq = await fetchApprovedTimeOffForDate(businessId, userId, ts)
    if (offReq) {
      return {
        scheduledStart: null,
        scheduledEnd: null,
        lateMinutes: 0,
        isLate: false,
        justified: true,
        justifiedReason: offReq.type,        // 'vacation' | 'sick' | etc.
        justifiedRequestId: offReq.id || null,
      }
    }

    // 2) Turno asignado para hoy
    const sched = await getScheduleForDate(businessId, userId, ts)
    const cell = sched?.data?.cell
    if (!cell || cell.rest || !cell.start) {
      // No hay turno asignado o es descanso → no hay nada que comparar.
      return {}
    }

    const [sh, sm] = String(cell.start).split(':').map(Number)
    const expected = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate(), sh || 0, sm || 0, 0, 0)
    const diffMin = Math.round((ts.getTime() - expected.getTime()) / 60000)
    const lateMinutes = Math.max(0, diffMin)
    const isLate = lateMinutes > graceMinutes

    return {
      scheduledStart: cell.start,
      scheduledEnd: cell.end || null,
      lateMinutes,
      isLate,
      justified: false,
    }
  } catch (e) {
    console.warn('No se pudo enriquecer marcación con horario:', e)
    return {}
  }
}

/**
 * Servicio de Control de Asistencia del Personal.
 *
 * Modelo:
 * - businesses/{bid}/branches/{branchId}.attendance = { enabled, token, gpsLat, gpsLng, gpsRadius, tokenGeneratedAt, tokenGeneratedBy }
 * - businesses/{bid}/attendance/{recordId}        = { userId, userName, branchId, branchName, type, timestamp, gps, gpsValid, approvalStatus, createdBy, notes, autoClosed }
 */

const getAttendanceColRef = (businessId) => collection(db, 'businesses', businessId, 'attendance')
const getAttendanceDocRef = (businessId, recordId) => doc(db, 'businesses', businessId, 'attendance', recordId)
const getBranchRef = (businessId, branchId) => doc(db, 'businesses', businessId, 'branches', branchId)
const getBusinessDocRef = (businessId) => doc(db, 'businesses', businessId)

// La sucursal principal no es un documento en `branches`. Se guarda su configuración
// de asistencia directamente en el documento del negocio con branchId 'main'.
const isMainBranchId = (branchId) => branchId === 'main' || branchId === '' || branchId == null
const getAttendanceTargetRef = (businessId, branchId) => (
  isMainBranchId(branchId) ? getBusinessDocRef(businessId) : getBranchRef(businessId, branchId)
)

// Genera un token aleatorio seguro (32 caracteres hex) para el QR de una sucursal
const generateToken = () => {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Regenera el token de asistencia de una sucursal. Invalida QR anteriores.
 */
export const regenerateAttendanceToken = async (businessId, branchId, userId) => {
  try {
    if (!businessId) {
      return { success: false, error: 'businessId es requerido' }
    }
    const targetRef = getAttendanceTargetRef(businessId, branchId)
    const snap = await getDoc(targetRef)
    if (!snap.exists()) return { success: false, error: 'Destino no encontrado' }
    const currentAttendance = snap.data().attendance || {}
    const newToken = generateToken()
    await updateDoc(targetRef, {
      attendance: {
        ...currentAttendance,
        enabled: currentAttendance.enabled !== false,
        token: newToken,
        tokenGeneratedAt: serverTimestamp(),
        tokenGeneratedBy: userId || null,
      },
      updatedAt: serverTimestamp(),
    })
    return { success: true, token: newToken }
  } catch (error) {
    console.error('Error regenerando token de asistencia:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Habilita o deshabilita asistencia en una sucursal, inicializando el token si no existía.
 */
export const setAttendanceEnabled = async (businessId, branchId, enabled, userId) => {
  try {
    const targetRef = getAttendanceTargetRef(businessId, branchId)
    const snap = await getDoc(targetRef)
    if (!snap.exists()) return { success: false, error: 'Destino no encontrado' }
    const current = snap.data().attendance || {}
    const next = { ...current, enabled: !!enabled }
    if (enabled && !current.token) {
      next.token = generateToken()
      next.tokenGeneratedAt = serverTimestamp()
      next.tokenGeneratedBy = userId || null
    }
    await updateDoc(targetRef, { attendance: next, updatedAt: serverTimestamp() })
    return { success: true, token: next.token }
  } catch (error) {
    console.error('Error actualizando asistencia de sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Guarda el geofence (lat/lng/radio) de una sucursal. Pasar null en los campos desactiva la validación GPS.
 */
export const updateBranchGeofence = async (businessId, branchId, { lat, lng, radius }) => {
  try {
    const targetRef = getAttendanceTargetRef(businessId, branchId)
    const snap = await getDoc(targetRef)
    if (!snap.exists()) return { success: false, error: 'Destino no encontrado' }
    const current = snap.data().attendance || {}
    await updateDoc(targetRef, {
      attendance: {
        ...current,
        gpsLat: lat ?? null,
        gpsLng: lng ?? null,
        gpsRadius: radius ?? null,
      },
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error updateBranchGeofence:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualiza el período de tolerancia (en minutos) antes de etiquetar tardanza.
 * Si es null/undefined, se elimina el campo y vuelve al default (15).
 */
export const updateBranchGracePeriod = async (businessId, branchId, minutes) => {
  try {
    const targetRef = getAttendanceTargetRef(businessId, branchId)
    const snap = await getDoc(targetRef)
    if (!snap.exists()) return { success: false, error: 'Destino no encontrado' }
    const current = snap.data().attendance || {}
    await updateDoc(targetRef, {
      attendance: {
        ...current,
        gracePeriodMinutes: minutes == null ? null : Number(minutes),
      },
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error updateBranchGracePeriod:', error)
    return { success: false, error: error.message }
  }
}

// Fórmula Haversine para distancia en metros entre dos coordenadas
const distanceMeters = (lat1, lng1, lat2, lng2) => {
  const toRad = (v) => (v * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Obtiene la última marcación del usuario (más reciente por timestamp).
 */
export const getLastAttendance = async (businessId, userId) => {
  try {
    const q = query(
      getAttendanceColRef(businessId),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(1),
    )
    const snap = await getDocs(q)
    if (snap.empty) return { success: true, data: null }
    const d = snap.docs[0]
    return { success: true, data: { id: d.id, ...d.data() } }
  } catch (error) {
    console.error('Error obteniendo última marcación:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crea un registro de asistencia por escaneo de QR.
 * - Valida token contra la sucursal.
 * - Calcula gpsValid con Haversine si hay geofence configurado.
 * - Si la última marcación del usuario fue `in` de un día anterior, la marca autoClosed y crea un nuevo `in`.
 * - Auto-detecta type (in/out) basado en la última marcación del día.
 */
export const markAttendanceFromQR = async (businessId, { scannedToken, user, gps }) => {
  try {
    if (!businessId || !scannedToken || !user?.uid) {
      return { success: false, error: 'Datos incompletos' }
    }
    const payload = parseQrPayload(scannedToken)
    if (!payload?.branchId || !payload?.token) {
      return { success: false, error: 'QR inválido' }
    }

    // Verificar token actual de la sucursal (puede ser 'main' → documento del negocio)
    const targetRef = getAttendanceTargetRef(businessId, payload.branchId)
    const branchSnap = await getDoc(targetRef)
    if (!branchSnap.exists()) return { success: false, error: 'Sucursal no encontrada' }
    const branch = branchSnap.data()
    const att = branch.attendance || {}
    const branchLabel = isMainBranchId(payload.branchId)
      ? (branch.name || branch.businessName || 'Sucursal Principal')
      : (branch.name || '')
    if (att.enabled === false) {
      return { success: false, error: 'La asistencia no está habilitada en esta sucursal' }
    }
    if (!att.token || att.token !== payload.token) {
      return { success: false, error: 'Este QR ya no es válido. Pida uno actualizado.' }
    }

    // Validación GPS si hay geofence
    let gpsValid = true
    if (att.gpsLat != null && att.gpsLng != null && att.gpsRadius != null && gps?.lat != null && gps?.lng != null) {
      const d = distanceMeters(att.gpsLat, att.gpsLng, gps.lat, gps.lng)
      gpsValid = d <= att.gpsRadius
    }

    // Detectar tipo y auto-close de turno del día anterior
    const last = await getLastAttendance(businessId, user.uid)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let type = 'in'
    if (last.success && last.data) {
      const lastTs = last.data.timestamp?.toDate ? last.data.timestamp.toDate() : new Date(last.data.timestamp)
      const sameDay = lastTs >= todayStart
      if (last.data.type === 'in' && !sameDay) {
        // Cerrar el turno anterior al final de ese día
        const endOfLastDay = new Date(lastTs.getFullYear(), lastTs.getMonth(), lastTs.getDate(), 23, 59, 59)
        await addDoc(getAttendanceColRef(businessId), {
          userId: last.data.userId,
          userName: last.data.userName || user.displayName || user.email || '',
          userEmail: last.data.userEmail || user.email || '',
          branchId: last.data.branchId,
          branchName: last.data.branchName || '',
          type: 'out',
          timestamp: Timestamp.fromDate(endOfLastDay),
          gps: null,
          gpsValid: false,
          approvalStatus: 'approved',
          createdBy: user.uid,
          autoClosed: true,
          notes: 'Cierre automático por cambio de día',
          createdAt: serverTimestamp(),
        })
        type = 'in'
      } else if (last.data.type === 'in' && sameDay) {
        type = 'out'
      } else {
        type = 'in'
      }
    }

    // Enriquecer con datos de horario asignado para detectar tardanza.
    // Usamos `now` (calculado arriba) en vez de serverTimestamp porque
    // necesitamos el valor cliente para la comparación.
    const enrichment = await buildScheduleEnrichment(
      businessId,
      user.uid,
      now,
      type,
      att.gracePeriodMinutes ?? 15
    )

    const record = {
      userId: user.uid,
      userName: user.displayName || user.email || '',
      userEmail: user.email || '',
      branchId: payload.branchId,
      branchName: branchLabel,
      type,
      timestamp: serverTimestamp(),
      gps: gps || null,
      gpsValid,
      approvalStatus: gpsValid ? 'approved' : 'pending',
      createdBy: user.uid,
      autoClosed: false,
      ...enrichment,
      createdAt: serverTimestamp(),
    }
    const docRef = await addDoc(getAttendanceColRef(businessId), record)
    return { success: true, id: docRef.id, type, gpsValid, ...enrichment }
  } catch (error) {
    console.error('Error registrando asistencia:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crea una marcación manual desde el admin (p.ej. cuando la app falló o el empleado olvidó marcar).
 */
export const createManualAttendance = async (businessId, { userId, userName, userEmail, branchId, branchName, type, timestamp, notes, createdBy }) => {
  try {
    const ts = timestamp ? new Date(timestamp) : new Date()
    const enrichment = await buildScheduleEnrichment(businessId, userId, ts, type, 15)

    const record = {
      userId,
      userName: userName || '',
      userEmail: userEmail || '',
      branchId: branchId || null,
      branchName: branchName || '',
      type,
      timestamp: timestamp ? Timestamp.fromDate(new Date(timestamp)) : serverTimestamp(),
      gps: null,
      gpsValid: false,
      approvalStatus: 'manual',
      createdBy: createdBy || null,
      autoClosed: false,
      notes: notes || '',
      ...enrichment,
      createdAt: serverTimestamp(),
    }
    const docRef = await addDoc(getAttendanceColRef(businessId), record)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error creando marcación manual:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Lista registros de asistencia. Soporta filtros por userId, branchId y rango de fechas (cliente).
 */
export const getAttendanceRecords = async (businessId, filters = {}) => {
  try {
    const { userId, branchId, fromDate, toDate, max } = filters
    let q = query(getAttendanceColRef(businessId), orderBy('timestamp', 'desc'))
    if (userId) q = query(getAttendanceColRef(businessId), where('userId', '==', userId), orderBy('timestamp', 'desc'))
    if (typeof max === 'number') q = query(q, limit(max))
    const snap = await getDocs(q)
    let data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    if (branchId) data = data.filter(r => r.branchId === branchId)
    if (fromDate) {
      const from = new Date(fromDate)
      data = data.filter(r => {
        const ts = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp)
        return ts >= from
      })
    }
    if (toDate) {
      const to = new Date(toDate)
      // Incluye todo el día seleccionado (hasta 23:59:59)
      const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59)
      data = data.filter(r => {
        const ts = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp)
        return ts <= toEnd
      })
    }
    return { success: true, data }
  } catch (error) {
    console.error('Error listando asistencia:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Aprueba o rechaza una marcación pendiente.
 */
export const setAttendanceApproval = async (businessId, recordId, status, reviewerId, notes) => {
  try {
    if (!['approved', 'rejected'].includes(status)) {
      return { success: false, error: 'Estado inválido' }
    }
    await updateDoc(getAttendanceDocRef(businessId, recordId), {
      approvalStatus: status,
      reviewedBy: reviewerId || null,
      reviewedAt: serverTimestamp(),
      ...(notes ? { reviewNotes: notes } : {}),
    })
    return { success: true }
  } catch (error) {
    console.error('Error cambiando aprobación:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Construye el payload que va dentro del QR. JSON compacto.
 */
export const buildQrPayload = ({ branchId, token }) => JSON.stringify({ v: 1, bid: branchId, t: token })

/**
 * Parsea el contenido escaneado del QR. Acepta formato nuevo {v,bid,t} y legacy {branchId, token}.
 */
export const parseQrPayload = (raw) => {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (obj.bid && obj.t) return { branchId: obj.bid, token: obj.t }
    if (obj.branchId && obj.token) return { branchId: obj.branchId, token: obj.token }
    return null
  } catch {
    return null
  }
}
