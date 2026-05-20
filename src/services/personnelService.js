import { collection, doc, getDocs, query, updateDoc, where, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio del módulo Personal (Capa 1).
 *
 * Reusa la colección `users` (sub-usuarios). Cada empleado es un sub-usuario
 * existente. Los campos de RR.HH. viven en el sub-objeto `personnel` y son
 * todos opcionales — los registros viejos siguen funcionando.
 */

/**
 * Tipos de jornada laboral. Etiquetas en español para mostrar al usuario.
 */
export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Tiempo completo' },
  { value: 'part_time', label: 'Medio tiempo' },
  { value: 'contract', label: 'Por contrato' },
  { value: 'intern', label: 'Practicante' },
  { value: 'other', label: 'Otro' },
]

/**
 * Estados de RR.HH. del empleado.
 */
export const HR_STATUSES = [
  { value: 'active', label: 'Activo', color: 'green' },
  { value: 'vacation', label: 'De vacaciones', color: 'amber' },
  { value: 'leave', label: 'Licencia', color: 'blue' },
  { value: 'inactive', label: 'Inactivo', color: 'gray' },
]

export const getHrStatusInfo = (status) => {
  return HR_STATUSES.find((s) => s.value === status) || HR_STATUSES[0]
}

export const getEmploymentTypeLabel = (type) => {
  return EMPLOYMENT_TYPES.find((t) => t.value === type)?.label || ''
}

/**
 * Devuelve la lista de empleados (sub-usuarios) de un negocio, mapeando los
 * campos `personnel` al primer nivel para uso simple en la UI.
 *
 * @param {string} ownerId
 * @param {object} [filters]
 * @param {string} [filters.search]      filtro por nombre/email/cargo
 * @param {string} [filters.department]  filtra por departamento (label exacto)
 * @param {string} [filters.hrStatus]    filtra por estado RR.HH.
 */
export const getEmployees = async (ownerId, filters = {}) => {
  try {
    const q = query(collection(db, 'users'), where('ownerId', '==', ownerId))
    const snap = await getDocs(q)
    const list = snap.docs.map((d) => {
      const data = d.data() || {}
      const personnel = data.personnel || {}
      return {
        id: d.id,
        uid: data.uid || d.id,
        email: data.email || '',
        displayName: data.displayName || '',
        isActive: data.isActive !== false,
        // Sub-objeto personnel desempaquetado para conveniencia
        jobTitle: personnel.jobTitle || '',
        department: personnel.department || '',
        employmentType: personnel.employmentType || '',
        hireDate: personnel.hireDate || null,
        weeklyHours: personnel.weeklyHours ?? null,
        vacationDaysPerYear: personnel.vacationDaysPerYear ?? null,
        hrStatus: personnel.hrStatus || 'active',
        phone: personnel.phone || '',
        documentId: personnel.documentId || '',
        address: personnel.address || '',
        emergencyContact: personnel.emergencyContact || null,
        notes: personnel.notes || '',
        photoUrl: personnel.photoUrl || '',
        // Refuerzo / eventual: no aparece en el planificador de horarios.
        // Default false (la mayoría del personal sí planifica horarios).
        excludeFromSchedule: personnel.excludeFromSchedule === true,
        // Datos crudos por si la UI necesita comparar
        personnel,
        raw: data,
      }
    })

    // Filtros en cliente (la lista típica es chica: <200 sub-usuarios)
    let result = list
    if (filters.search) {
      const t = filters.search.toLowerCase()
      result = result.filter((e) =>
        (e.displayName || '').toLowerCase().includes(t) ||
        (e.email || '').toLowerCase().includes(t) ||
        (e.jobTitle || '').toLowerCase().includes(t) ||
        (e.department || '').toLowerCase().includes(t)
      )
    }
    if (filters.department) {
      result = result.filter((e) => e.department === filters.department)
    }
    if (filters.hrStatus) {
      result = result.filter((e) => e.hrStatus === filters.hrStatus)
    }

    return { success: true, data: result }
  } catch (error) {
    console.error('Error al obtener empleados:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualiza los campos de RR.HH. de un sub-usuario. Acepta un patch parcial
 * sobre el sub-objeto `personnel`.
 *
 * @param {string} userId
 * @param {object} personnelPatch
 */
export const updatePersonnelData = async (userId, personnelPatch) => {
  try {
    const ref = doc(db, 'users', userId)
    // Para que el merge sea limpio, escribimos campo por campo bajo `personnel.xxx`
    const updates = { updatedAt: serverTimestamp() }
    Object.entries(personnelPatch || {}).forEach(([key, value]) => {
      updates[`personnel.${key}`] = value
    })
    await updateDoc(ref, updates)
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar datos de personal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Devuelve la lista única de departamentos usados en el negocio.
 * Útil para sugerencias en autocomplete.
 */
export const getDepartments = async (ownerId) => {
  const result = await getEmployees(ownerId)
  if (!result.success) return { success: false, data: [] }
  const set = new Set()
  result.data.forEach((e) => { if (e.department) set.add(e.department) })
  return { success: true, data: Array.from(set).sort() }
}

/**
 * Devuelve la lista única de cargos usados en el negocio.
 */
export const getJobTitles = async (ownerId) => {
  const result = await getEmployees(ownerId)
  if (!result.success) return { success: false, data: [] }
  const set = new Set()
  result.data.forEach((e) => { if (e.jobTitle) set.add(e.jobTitle) })
  return { success: true, data: Array.from(set).sort() }
}
