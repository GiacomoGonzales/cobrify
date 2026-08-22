/**
 * Servicio para gestión veterinaria
 * Maneja historial médico, vacunas y servicios recurrentes de mascotas
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

// ==================== HISTORIAL MÉDICO ====================

/**
 * Obtener historial médico de un paciente (mascota/cliente)
 */
export const getMedicalHistory = async (businessId, customerId) => {
  const ref = collection(db, 'businesses', businessId, 'customers', customerId, 'medicalHistory')
  const q = query(ref, orderBy('date', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

/**
 * Agregar registro médico
 * @param {Object} record - { date, type, diagnosis, treatment, notes, veterinarian, weight, temperature }
 */
export const addMedicalRecord = async (businessId, customerId, record) => {
  const ref = collection(db, 'businesses', businessId, 'customers', customerId, 'medicalHistory')
  const docRef = await addDoc(ref, {
    ...record,
    date: record.date ? Timestamp.fromDate(new Date(record.date)) : Timestamp.now(),
    createdAt: Timestamp.now(),
  })
  return docRef.id
}

/**
 * Actualizar registro médico
 */
export const updateMedicalRecord = async (businessId, customerId, recordId, data) => {
  const ref = doc(db, 'businesses', businessId, 'customers', customerId, 'medicalHistory', recordId)
  await updateDoc(ref, {
    ...data,
    updatedAt: Timestamp.now(),
  })
}

/**
 * Eliminar registro médico
 */
export const deleteMedicalRecord = async (businessId, customerId, recordId) => {
  const ref = doc(db, 'businesses', businessId, 'customers', customerId, 'medicalHistory', recordId)
  await deleteDoc(ref)
}

// ==================== VACUNAS ====================

/**
 * Obtener vacunas de un paciente
 */
export const getVaccinations = async (businessId, customerId) => {
  const ref = collection(db, 'businesses', businessId, 'customers', customerId, 'vaccinations')
  const q = query(ref, orderBy('dateApplied', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

/**
 * Agregar vacuna
 * @param {Object} vaccination - { name, dateApplied, nextDoseDate, lot, veterinarian, notes }
 */
export const addVaccination = async (businessId, customerId, vaccination) => {
  const ref = collection(db, 'businesses', businessId, 'customers', customerId, 'vaccinations')
  const docRef = await addDoc(ref, {
    ...vaccination,
    dateApplied: vaccination.dateApplied ? Timestamp.fromDate(new Date(vaccination.dateApplied)) : Timestamp.now(),
    nextDoseDate: vaccination.nextDoseDate ? Timestamp.fromDate(new Date(vaccination.nextDoseDate)) : null,
    createdAt: Timestamp.now(),
  })
  return docRef.id
}

/**
 * Actualizar vacuna
 */
export const updateVaccination = async (businessId, customerId, vaccinationId, data) => {
  const ref = doc(db, 'businesses', businessId, 'customers', customerId, 'vaccinations', vaccinationId)
  await updateDoc(ref, {
    ...data,
    nextDoseDate: data.nextDoseDate ? Timestamp.fromDate(new Date(data.nextDoseDate)) : null,
    updatedAt: Timestamp.now(),
  })
}

/**
 * Eliminar vacuna
 */
export const deleteVaccination = async (businessId, customerId, vaccinationId) => {
  const ref = doc(db, 'businesses', businessId, 'customers', customerId, 'vaccinations', vaccinationId)
  await deleteDoc(ref)
}

// ==================== SERVICIOS RECURRENTES ====================

/**
 * Obtener servicios recurrentes de un paciente
 */
export const getRecurringServices = async (businessId, customerId) => {
  const ref = collection(db, 'businesses', businessId, 'customers', customerId, 'recurringServices')
  const q = query(ref, orderBy('nextDate', 'asc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

/**
 * Agregar servicio recurrente
 * @param {Object} service - { name, frequency (days), lastDate, nextDate, notes }
 */
export const addRecurringService = async (businessId, customerId, service) => {
  const ref = collection(db, 'businesses', businessId, 'customers', customerId, 'recurringServices')
  const docRef = await addDoc(ref, {
    ...service,
    lastDate: service.lastDate ? Timestamp.fromDate(new Date(service.lastDate)) : null,
    nextDate: service.nextDate ? Timestamp.fromDate(new Date(service.nextDate)) : null,
    createdAt: Timestamp.now(),
  })
  return docRef.id
}

/**
 * Actualizar servicio recurrente
 */
export const updateRecurringService = async (businessId, customerId, serviceId, data) => {
  const ref = doc(db, 'businesses', businessId, 'customers', customerId, 'recurringServices', serviceId)
  await updateDoc(ref, {
    ...data,
    lastDate: data.lastDate ? Timestamp.fromDate(new Date(data.lastDate)) : null,
    nextDate: data.nextDate ? Timestamp.fromDate(new Date(data.nextDate)) : null,
    updatedAt: Timestamp.now(),
  })
}

/**
 * Marcar servicio como realizado y calcular próxima fecha
 */
export const markServiceCompleted = async (businessId, customerId, serviceId, completedDate = new Date()) => {
  const ref = doc(db, 'businesses', businessId, 'customers', customerId, 'recurringServices', serviceId)
  const docSnap = await getDoc(ref)

  if (docSnap.exists()) {
    const service = docSnap.data()
    const nextDate = new Date(completedDate)
    nextDate.setDate(nextDate.getDate() + (service.frequency || 30))

    await updateDoc(ref, {
      lastDate: Timestamp.fromDate(completedDate),
      nextDate: Timestamp.fromDate(nextDate),
      updatedAt: Timestamp.now(),
    })
  }
}

/**
 * Programar (o reprogramar) los recordatorios que deja una venta.
 *
 * Es el disparador que faltaba: hasta ahora el recordatorio existía pero
 * alguien tenía que acordarse de cargarlo a mano en la ficha de la mascota.
 * Ahora, al cobrar un servicio marcado con "Recordar servicio (días)", la
 * próxima fecha se programa sola.
 *
 * REPROGRAMA, no duplica: si la mascota ya tenía ese mismo servicio cargado,
 * corre su fecha en vez de crear un segundo recordatorio idéntico. Sin esto,
 * a los seis baños la ficha tendría seis "Baño" y la pantalla de Alertas
 * avisaría seis veces por lo mismo.
 *
 * @param {string} businessId
 * @param {string} customerId  dueño; si la venta fue a un cliente no registrado, no hay dónde guardar
 * @param {string|null} petName  mascota atendida (el POS la sabe por los chips)
 * @param {Array<{nombre: string, dias: number, productId?: string}>} servicios
 * @returns {Promise<{programados: number}>}
 */
export const programarRecordatoriosDeVenta = async (businessId, customerId, petName, servicios) => {
  if (!businessId || !customerId || !Array.isArray(servicios) || servicios.length === 0) {
    return { programados: 0 }
  }

  const ref = collection(db, 'businesses', businessId, 'customers', customerId, 'recurringServices')
  const existentes = await getDocs(ref)
  const mascota = (petName || '').trim()

  // Índice de lo que ya existe, por producto y por nombre. La clave incluye
  // la mascota: en una casa con dos perros, el baño de cada uno es un
  // recordatorio distinto. Se prefiere el productId (sobrevive a que renombren
  // el servicio) y se cae al nombre para los recordatorios cargados a mano
  // antes de que existiera este campo.
  const porProducto = new Map()
  const porNombre = new Map()
  existentes.forEach(d => {
    const data = d.data()
    const registro = { id: d.id, ...data }
    if (data.productId) porProducto.set(claveDeRecordatorio(data.productId, data.petName), registro)
    porNombre.set(claveDeRecordatorio(data.name, data.petName), registro)
  })

  const ahora = new Date()
  let programados = 0

  for (const servicio of servicios) {
    const dias = Number(servicio?.dias) || 0
    const nombre = (servicio?.nombre || '').trim()
    if (!nombre || dias <= 0) continue

    const proxima = new Date(ahora)
    proxima.setDate(proxima.getDate() + dias)

    const yaExiste =
      (servicio.productId && porProducto.get(claveDeRecordatorio(servicio.productId, mascota))) ||
      porNombre.get(claveDeRecordatorio(nombre, mascota))
    if (yaExiste) {
      await updateDoc(doc(ref, yaExiste.id), {
        // La frecuencia se actualiza al valor con el que se cobró: si esta vez
        // el cliente pidió 15 días, de ahí en adelante son 15.
        frequency: dias,
        lastDate: Timestamp.fromDate(ahora),
        nextDate: Timestamp.fromDate(proxima),
        ...(mascota && !yaExiste.petName ? { petName: mascota } : {}),
        ...(servicio.productId && !yaExiste.productId ? { productId: servicio.productId } : {}),
        updatedAt: Timestamp.now(),
      })
    } else {
      await addDoc(ref, {
        name: nombre,
        productId: servicio.productId || null,
        petName: mascota || null,
        frequency: dias,
        lastDate: Timestamp.fromDate(ahora),
        nextDate: Timestamp.fromDate(proxima),
        notes: '',
        createdAt: Timestamp.now(),
      })
    }
    programados++
  }

  return { programados }
}

/** Clave de identidad: servicio (id o nombre) + mascota, sin distinguir mayúsculas. */
const claveDeRecordatorio = (servicio, petName) =>
  `${String(servicio || '').trim().toLowerCase()}|${(petName || '').trim().toLowerCase()}`

/**
 * Eliminar servicio recurrente
 */
export const deleteRecurringService = async (businessId, customerId, serviceId) => {
  const ref = doc(db, 'businesses', businessId, 'customers', customerId, 'recurringServices', serviceId)
  await deleteDoc(ref)
}

// ==================== ALERTAS Y RECORDATORIOS ====================

/**
 * Obtener todas las alertas pendientes (vacunas y servicios próximos a vencer)
 * @param {number} daysAhead - Días hacia adelante para buscar alertas (default 7)
 */
export const getPendingAlerts = async (businessId, daysAhead = 7) => {
  const alerts = []
  const today = new Date()
  const futureDate = new Date()
  futureDate.setDate(today.getDate() + daysAhead)

  // Obtener todos los clientes
  const customersRef = collection(db, 'businesses', businessId, 'customers')
  const customersSnapshot = await getDocs(customersRef)

  for (const customerDoc of customersSnapshot.docs) {
    const customer = { id: customerDoc.id, ...customerDoc.data() }

    // Solo procesar si tiene datos de mascota (modo veterinaria)
    if (!customer.petName && (!customer.pets || customer.pets.length === 0)) continue

    // Verificar vacunas próximas
    const vaccinationsRef = collection(db, 'businesses', businessId, 'customers', customer.id, 'vaccinations')
    const vaccinationsSnapshot = await getDocs(vaccinationsRef)

    for (const vacDoc of vaccinationsSnapshot.docs) {
      const vac = vacDoc.data()
      if (vac.nextDoseDate) {
        const nextDate = vac.nextDoseDate.toDate()
        if (nextDate <= futureDate && nextDate >= new Date(today.setHours(0,0,0,0))) {
          alerts.push({
            id: vacDoc.id,
            type: 'vaccination',
            customerId: customer.id,
            customerName: customer.name,
            petName: customer.petName,
            petSpecies: customer.petSpecies,
            title: `Vacuna: ${vac.name}`,
            description: `Refuerzo pendiente`,
            dueDate: nextDate,
            phone: customer.phone,
          })
        }
      }
    }

    // Verificar servicios recurrentes próximos
    const servicesRef = collection(db, 'businesses', businessId, 'customers', customer.id, 'recurringServices')
    const servicesSnapshot = await getDocs(servicesRef)

    for (const svcDoc of servicesSnapshot.docs) {
      const svc = svcDoc.data()
      if (svc.nextDate) {
        const nextDate = svc.nextDate.toDate()
        if (nextDate <= futureDate && nextDate >= new Date(today.setHours(0,0,0,0))) {
          alerts.push({
            id: svcDoc.id,
            type: 'service',
            customerId: customer.id,
            customerName: customer.name,
            // La mascota del recordatorio manda: un cliente puede tener dos
            // perros, y `customer.petName` es siempre el primero. Sin esto, el
            // baño de Toby llegaba avisado como si fuera el de Firulais.
            petName: svc.petName || customer.petName,
            petSpecies: customer.petSpecies,
            title: svc.name,
            description: `Cada ${svc.frequency} días`,
            dueDate: nextDate,
            phone: customer.phone,
          })
        }
      }
    }
  }

  // Ordenar por fecha
  alerts.sort((a, b) => a.dueDate - b.dueDate)

  return alerts
}

/**
 * Obtener alertas vencidas (pasadas de fecha)
 */
export const getOverdueAlerts = async (businessId) => {
  const alerts = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const customersRef = collection(db, 'businesses', businessId, 'customers')
  const customersSnapshot = await getDocs(customersRef)

  for (const customerDoc of customersSnapshot.docs) {
    const customer = { id: customerDoc.id, ...customerDoc.data() }

    if (!customer.petName && (!customer.pets || customer.pets.length === 0)) continue

    // Vacunas vencidas
    const vaccinationsRef = collection(db, 'businesses', businessId, 'customers', customer.id, 'vaccinations')
    const vaccinationsSnapshot = await getDocs(vaccinationsRef)

    for (const vacDoc of vaccinationsSnapshot.docs) {
      const vac = vacDoc.data()
      if (vac.nextDoseDate) {
        const nextDate = vac.nextDoseDate.toDate()
        if (nextDate < today) {
          alerts.push({
            id: vacDoc.id,
            type: 'vaccination',
            customerId: customer.id,
            customerName: customer.name,
            petName: customer.petName,
            petSpecies: customer.petSpecies,
            title: `Vacuna: ${vac.name}`,
            description: `Refuerzo VENCIDO`,
            dueDate: nextDate,
            phone: customer.phone,
            overdue: true,
          })
        }
      }
    }

    // Servicios vencidos
    const servicesRef = collection(db, 'businesses', businessId, 'customers', customer.id, 'recurringServices')
    const servicesSnapshot = await getDocs(servicesRef)

    for (const svcDoc of servicesSnapshot.docs) {
      const svc = svcDoc.data()
      if (svc.nextDate) {
        const nextDate = svc.nextDate.toDate()
        if (nextDate < today) {
          alerts.push({
            id: svcDoc.id,
            type: 'service',
            customerId: customer.id,
            customerName: customer.name,
            petName: svc.petName || customer.petName,
            petSpecies: customer.petSpecies,
            title: svc.name,
            description: `VENCIDO - Cada ${svc.frequency} días`,
            dueDate: nextDate,
            phone: customer.phone,
            overdue: true,
          })
        }
      }
    }
  }

  alerts.sort((a, b) => a.dueDate - b.dueDate)

  return alerts
}

// ==================== TIPOS DE CONSULTA PREDEFINIDOS ====================

export const CONSULTATION_TYPES = [
  { value: 'checkup', label: 'Consulta General' },
  { value: 'vaccination', label: 'Vacunación' },
  { value: 'emergency', label: 'Emergencia' },
  { value: 'surgery', label: 'Cirugía' },
  { value: 'dental', label: 'Dental' },
  { value: 'grooming', label: 'Baño/Peluquería' },
  { value: 'deworming', label: 'Desparasitación' },
  { value: 'labwork', label: 'Laboratorio' },
  { value: 'xray', label: 'Radiografía' },
  { value: 'ultrasound', label: 'Ecografía' },
  { value: 'followup', label: 'Control/Seguimiento' },
  { value: 'other', label: 'Otro' },
]

// ==================== VACUNAS COMUNES ====================

export const COMMON_VACCINES = {
  dog: [
    { name: 'Parvovirus', frequency: 365 },
    { name: 'Moquillo', frequency: 365 },
    { name: 'Rabia', frequency: 365 },
    { name: 'Hepatitis', frequency: 365 },
    { name: 'Leptospirosis', frequency: 365 },
    { name: 'Bordetella (Tos de las perreras)', frequency: 180 },
    { name: 'Polivalente (Séxtuple/Óctuple)', frequency: 365 },
  ],
  cat: [
    { name: 'Triple Felina', frequency: 365 },
    { name: 'Rabia', frequency: 365 },
    { name: 'Leucemia Felina', frequency: 365 },
    { name: 'Panleucopenia', frequency: 365 },
  ],
  other: [
    { name: 'Vacuna General', frequency: 365 },
  ],
}

// ==================== SERVICIOS RECURRENTES COMUNES ====================

export const COMMON_RECURRING_SERVICES = [
  { name: 'Baño', frequency: 15 },
  { name: 'Baño y Corte', frequency: 30 },
  { name: 'Corte de Uñas', frequency: 30 },
  { name: 'Limpieza de Oídos', frequency: 30 },
  { name: 'Desparasitación Interna', frequency: 90 },
  { name: 'Desparasitación Externa (Antipulgas)', frequency: 30 },
  { name: 'Control de Peso', frequency: 30 },
]
