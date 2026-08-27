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
 * Recordatorios de vacunas y servicios: los vencidos y los que vienen.
 *
 * Antes eran dos funciones, `getPendingAlerts` y `getOverdueAlerts`, y cada
 * una recorría TODOS los clientes leyendo sus dos subcolecciones **de a una,
 * esperando cada lectura antes de pedir la siguiente**. Eran `2 + 4N` viajes
 * a Firestore encadenados: con 300 clientes, más de mil idas y vueltas en
 * fila india. La pantalla no estaba colgada en "Cargando alertas...", estaba
 * haciendo cola — y en la práctica es lo mismo para quien la mira.
 *
 * Ahora es UN recorrido, en paralelo por lotes, que clasifica vencido/próximo
 * en el mismo pase: `1 + 2N` lecturas y un tiempo que no depende de N.
 *
 * También se cayó el filtro que salteaba a los clientes sin mascota cargada
 * en su ficha. Los recordatorios que crea el POS guardan la mascota en el
 * propio recordatorio y no tocan la ficha del cliente, así que ese filtro
 * escondía recordatorios que SÍ existían: el negocio veía "no hay
 * recordatorios pendientes" con la subcolección llena. Leer de más sale
 * barato ahora que las lecturas van en paralelo, y sigue siendo la mitad de
 * lo que se leía antes.
 */
const LOTE_CLIENTES = 20

async function enLotes(items, tamano, fn) {
  const salida = []
  for (let i = 0; i < items.length; i += tamano) {
    const lote = items.slice(i, i + tamano)
    salida.push(...await Promise.all(lote.map(fn)))
  }
  return salida
}

export const getVeterinaryReminders = async (businessId, daysAhead = 7, onProgress = null) => {
  const vencidos = []
  const proximos = []
  if (!businessId) return { overdue: vencidos, pending: proximos }

  // Fechas fijas ANTES del recorrido. `today.setHours(...)` dentro del bucle
  // mutaba la fecha de referencia en cada vuelta.
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const hasta = new Date(hoy)
  hasta.setDate(hasta.getDate() + daysAhead)
  hasta.setHours(23, 59, 59, 999)

  const customersSnapshot = await getDocs(collection(db, 'businesses', businessId, 'customers'))
  const clientes = customersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  // El tiempo de esta pantalla es proporcional a la cantidad de pacientes
  // (los recordatorios viven DENTRO de cada cliente). Se avisa el avance para
  // que la espera no sea un spinner mudo.
  let revisados = 0
  if (onProgress) onProgress({ revisados: 0, total: clientes.length })

  const aFecha = (valor) => {
    if (!valor) return null
    const d = valor.toDate ? valor.toDate() : new Date(valor)
    return isNaN(d.getTime()) ? null : d
  }

  /** Clasifica un recordatorio según su fecha: vencido, próximo, o ninguno. */
  const clasificar = (fecha, alerta) => {
    if (!fecha) return
    if (fecha < hoy) vencidos.push({ ...alerta, dueDate: fecha, overdue: true })
    else if (fecha <= hasta) proximos.push({ ...alerta, dueDate: fecha })
  }

  await enLotes(clientes, LOTE_CLIENTES, async (customer) => {
    const base = { customerId: customer.id, customerName: customer.name, phone: customer.phone, petSpecies: customer.petSpecies }

    const [vacunas, servicios] = await Promise.all([
      getDocs(collection(db, 'businesses', businessId, 'customers', customer.id, 'vaccinations')),
      getDocs(collection(db, 'businesses', businessId, 'customers', customer.id, 'recurringServices')),
    ])

    vacunas.docs.forEach(vacDoc => {
      const vac = vacDoc.data()
      const fecha = aFecha(vac.nextDoseDate)
      clasificar(fecha, {
        ...base,
        id: vacDoc.id,
        type: 'vaccination',
        petName: vac.petName || customer.petName,
        title: `Vacuna: ${vac.name}`,
        description: fecha && fecha < hoy ? 'Refuerzo VENCIDO' : 'Refuerzo próximo',
      })
    })

    servicios.docs.forEach(svcDoc => {
      const svc = svcDoc.data()
      const fecha = aFecha(svc.nextDate)
      clasificar(fecha, {
        ...base,
        id: svcDoc.id,
        type: 'service',
        // La mascota del recordatorio manda: un cliente puede tener dos
        // perros, y `customer.petName` es siempre el primero. Sin esto, el
        // baño de Toby llegaba avisado como si fuera el de Firulais.
        petName: svc.petName || customer.petName,
        title: svc.name,
        description: `${fecha && fecha < hoy ? 'VENCIDO - ' : ''}Cada ${svc.frequency} días`,
      })
    })

    revisados++
    if (onProgress && (revisados % LOTE_CLIENTES === 0 || revisados === clientes.length)) {
      onProgress({ revisados, total: clientes.length })
    }
  })

  // Mismo criterio que los recordatorios de ventas: lo próximo hacia adelante,
  // lo vencido de más reciente a más viejo.
  return {
    overdue: vencidos.sort((a, b) => b.dueDate - a.dueDate),
    pending: proximos.sort((a, b) => a.dueDate - b.dueDate),
  }
}

/** @deprecated Usar getVeterinaryReminders: hace el recorrido una sola vez. */
export const getPendingAlerts = async (businessId, daysAhead = 7) =>
  (await getVeterinaryReminders(businessId, daysAhead)).pending

/** @deprecated Usar getVeterinaryReminders: hace el recorrido una sola vez. */
export const getOverdueAlerts = async (businessId) =>
  (await getVeterinaryReminders(businessId, 0)).overdue

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
