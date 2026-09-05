/**
 * PAQUETES DE SESIONES: "6 sesiones de láser" se cobra UNA vez y se consume
 * cita por cita. Viven en `customers/{id}/packages` (regla propia).
 *
 * Nacen de dos lados:
 *  - De una VENTA: el POS, al cobrar a un paciente registrado un producto con
 *    "Sesiones incluidas", deja el paquete en su ficha (crearPaquetesDeVenta).
 *  - A MANO, desde la ficha: la clínica que llega con pacientes a mitad de un
 *    paquete comprado en otro sistema, o un paquete regalado.
 *
 * Se consumen desde la Agenda ("Usar sesión": completa la cita sin pasar por
 * el POS) o a mano desde la ficha. El cliente guarda un RESUMEN
 * (`packagesSummary`) para que la lista de Pacientes muestre las sesiones
 * que le quedan sin leer la subcolección de cada uno.
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, orderBy,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { hoyYMD } from '@/utils/fichaAtencion'

const paquetesDe = (businessId, customerId) =>
  collection(db, 'businesses', businessId, 'customers', customerId, 'packages')

/** Sesiones que quedan por usar. */
export const sesionesDisponibles = (p) =>
  Math.max(0, (Number(p?.sessionsTotal) || 0) - (Number(p?.sessionsUsed) || 0))

/** ¿Todavía se puede descontar de este paquete? */
export const estaActivo = (p) => p?.status !== 'cancelled' && sesionesDisponibles(p) > 0

/**
 * El resumen que se guarda en el cliente. Es lo único que lee la lista de
 * Pacientes: cuántos paquetes activos y cuántas sesiones suman.
 */
export const resumenDePaquetes = (paquetes) => {
  const activos = (paquetes || []).filter(estaActivo)
  return {
    active: activos.length,
    remaining: activos.reduce((s, p) => s + sesionesDisponibles(p), 0),
    updatedAt: hoyYMD(),
  }
}

export const getPackages = async (businessId, customerId) => {
  const snap = await getDocs(query(paquetesDe(businessId, customerId), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/** Relee los paquetes y deja el resumen en el cliente. Devuelve la lista. */
const guardarResumen = async (businessId, customerId) => {
  const lista = await getPackages(businessId, customerId)
  await updateDoc(doc(db, 'businesses', businessId, 'customers', customerId), {
    packagesSummary: resumenDePaquetes(lista),
  })
  return lista
}

/**
 * @param {object} datos
 * @param {string|null} [datos.productId]
 * @param {string} datos.productName
 * @param {number} datos.sessionsTotal
 * @param {number} [datos.sessionsUsed] sesiones ya usadas (paquete que viene de otro sistema)
 * @param {string|null} [datos.invoiceId]
 * @param {string} [datos.invoiceNumber]
 * @param {number|null} [datos.price]
 * @param {string} [datos.notes]
 * @param {string|null} [datos.createdBy]
 */
export const addPackage = async (businessId, customerId, datos) => {
  const total = Math.max(1, parseInt(datos.sessionsTotal) || 0)
  const usadas = Math.min(total, Math.max(0, parseInt(datos.sessionsUsed) || 0))
  const paquete = {
    productId: datos.productId || null,
    productName: String(datos.productName || '').trim() || 'Paquete',
    sessionsTotal: total,
    sessionsUsed: usadas,
    uses: [],
    invoiceId: datos.invoiceId || null,
    invoiceNumber: String(datos.invoiceNumber || ''),
    price: datos.price != null && Number.isFinite(Number(datos.price)) ? Number(datos.price) : null,
    notes: String(datos.notes || '').trim(),
    status: usadas >= total ? 'finished' : 'active',
    createdBy: datos.createdBy || null,
    createdAt: serverTimestamp(),
  }
  const ref = await addDoc(paquetesDe(businessId, customerId), paquete)
  await guardarResumen(businessId, customerId)
  return { id: ref.id, ...paquete }
}

/**
 * Descuenta UNA sesión. Una misma cita descuenta una sola vez: si la cita ya
 * figura en los usos, no se vuelve a restar (vuelve con `yaUsada: true`).
 */
export const usarSesion = async (businessId, customerId, packageId, { appointmentId = null, note = '', date = hoyYMD() } = {}) => {
  const ref = doc(paquetesDe(businessId, customerId), packageId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('El paquete ya no existe')
  const p = snap.data()
  if (appointmentId && (p.uses || []).some(u => u.appointmentId === appointmentId)) {
    return { id: packageId, ...p, yaUsada: true }
  }
  if (!estaActivo(p)) throw new Error('Este paquete no tiene sesiones disponibles')

  const sessionsUsed = (Number(p.sessionsUsed) || 0) + 1
  const uses = [...(p.uses || []), { date, appointmentId, note: String(note || '').trim(), at: Timestamp.now() }]
  const status = sessionsUsed >= (Number(p.sessionsTotal) || 0) ? 'finished' : 'active'
  await updateDoc(ref, { sessionsUsed, uses, status, updatedAt: serverTimestamp() })
  await guardarResumen(businessId, customerId)
  return { id: packageId, ...p, sessionsUsed, uses, status }
}

/** Deshace el último descuento (se marcó una sesión por error). */
export const deshacerUltimoUso = async (businessId, customerId, packageId) => {
  const ref = doc(paquetesDe(businessId, customerId), packageId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('El paquete ya no existe')
  const p = snap.data()
  const uses = [...(p.uses || [])]
  if (uses.length === 0 && !(Number(p.sessionsUsed) > 0)) return { id: packageId, ...p }
  uses.pop()
  const sessionsUsed = Math.max(0, (Number(p.sessionsUsed) || 0) - 1)
  await updateDoc(ref, { sessionsUsed, uses, status: 'active', updatedAt: serverTimestamp() })
  await guardarResumen(businessId, customerId)
  return { id: packageId, ...p, sessionsUsed, uses, status: 'active' }
}

export const deletePackage = async (businessId, customerId, packageId) => {
  await deleteDoc(doc(paquetesDe(businessId, customerId), packageId))
  await guardarResumen(businessId, customerId)
}

/**
 * Los paquetes que nacen de una VENTA: cada ítem cuyo producto tiene
 * "Sesiones incluidas" (más de una) crea un paquete de sesiones × cantidad.
 * Lo llama el POS después de cobrar; si algo falla, la venta ya está hecha y
 * el paquete se carga a mano desde la ficha.
 *
 * @param {Array} items el carrito cobrado
 * @param {Array} productos el catálogo, para leer `sessions` de la ficha
 * @returns {Promise<number>} cuántos paquetes se crearon
 */
export const crearPaquetesDeVenta = async (businessId, customerId, items, productos, { invoiceId = null, invoiceNumber = '', createdBy = null } = {}) => {
  if (!customerId) return 0
  const fichaPorId = new Map((productos || []).map(p => [p.id, p]))
  let creados = 0
  for (const item of items || []) {
    if (item?.isCustom) continue
    const ficha = fichaPorId.get(item.productId || item.id)
    const sesiones = Number(ficha?.sessions) || 0
    if (sesiones <= 1) continue
    const cantidad = Math.max(1, Number(item.quantity) || 1)
    await addPackage(businessId, customerId, {
      productId: ficha.id,
      productName: ficha.name || item.name,
      sessionsTotal: sesiones * cantidad,
      invoiceId,
      invoiceNumber,
      price: item.price != null ? Number(item.price) * cantidad : null,
      createdBy,
    })
    creados++
  }
  return creados
}
