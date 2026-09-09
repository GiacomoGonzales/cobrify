/**
 * Recetas de un paciente: `customers/{id}/prescriptions`.
 *
 * Se guarda lo que se escribió (líneas e indicaciones generales) y el PDF se
 * genera cuando hace falta a partir de eso (ver utils/recetaPdf.js), igual
 * que los consentimientos. Calcado de consentService.
 */
import { collection, doc, addDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { limpiarReceta } from '@/utils/receta'

const recetasDe = (businessId, customerId) =>
  collection(db, 'businesses', businessId, 'customers', customerId, 'prescriptions')

/** Las recetas del paciente, la más reciente primero. */
export const getPrescriptions = async (businessId, customerId) => {
  const snap = await getDocs(query(recetasDe(businessId, customerId), orderBy('issuedAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * @param {object} datos
 * @param {string} [datos.date] YYYY-MM-DD; vacío = hoy
 * @param {Array<{producto, uso, frecuencia, duracion}>} datos.items
 * @param {string} [datos.notes] indicaciones generales
 * @param {string} datos.customerName
 * @param {string} [datos.customerDocument]
 * @param {string|null} [datos.createdBy]
 */
export const addPrescription = async (businessId, customerId, datos) => {
  const limpia = limpiarReceta(datos)
  const receta = {
    ...limpia,
    customerName: String(datos.customerName || '').trim(),
    customerDocument: String(datos.customerDocument || '').trim(),
    issuedAt: Timestamp.now(),
    createdBy: datos.createdBy || null,
    createdAt: serverTimestamp(),
  }
  const ref = await addDoc(recetasDe(businessId, customerId), receta)
  return { id: ref.id, ...receta }
}

export const deletePrescription = async (businessId, customerId, prescriptionId) => {
  await deleteDoc(doc(recetasDe(businessId, customerId), prescriptionId))
}
