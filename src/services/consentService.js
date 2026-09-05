/**
 * Consentimientos firmados de un paciente: `customers/{id}/consents`.
 *
 * Se guarda el texto YA renderizado y la firma en PNG (base64, dentro del
 * documento): un consentimiento es un registro legal y no puede depender de
 * una URL pública ni de una plantilla que después cambie. El PDF se genera
 * cuando hace falta a partir de esto (ver utils/consentimientoPdf.js).
 */
import { collection, doc, addDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { firmaValida } from '@/utils/consentimiento'
import { hoyYMD } from '@/utils/fichaAtencion'

const consentimientosDe = (businessId, customerId) =>
  collection(db, 'businesses', businessId, 'customers', customerId, 'consents')

/** Los consentimientos del paciente, el más reciente primero. */
export const getConsents = async (businessId, customerId) => {
  const snap = await getDocs(query(consentimientosDe(businessId, customerId), orderBy('signedAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * @param {object} datos
 * @param {string} datos.templateId
 * @param {string} datos.templateName
 * @param {string} datos.text texto ya renderizado (lo que el paciente leyó)
 * @param {string} [datos.treatment]
 * @param {string} [datos.professional]
 * @param {string} datos.customerName
 * @param {string} [datos.customerDocument]
 * @param {string} datos.signatureDataUrl PNG en base64
 * @param {string|null} [datos.createdBy]
 */
export const addConsent = async (businessId, customerId, datos) => {
  if (!firmaValida(datos.signatureDataUrl)) throw new Error('Falta la firma del paciente')
  if (!String(datos.text || '').trim()) throw new Error('El consentimiento no tiene texto')
  const consent = {
    templateId: String(datos.templateId || ''),
    templateName: String(datos.templateName || 'Consentimiento'),
    text: String(datos.text).trim(),
    treatment: String(datos.treatment || '').trim(),
    professional: String(datos.professional || '').trim(),
    customerName: String(datos.customerName || '').trim(),
    customerDocument: String(datos.customerDocument || '').trim(),
    signedDate: hoyYMD(),
    signedAt: Timestamp.now(),
    signatureDataUrl: datos.signatureDataUrl,
    createdBy: datos.createdBy || null,
    createdAt: serverTimestamp(),
  }
  const ref = await addDoc(consentimientosDe(businessId, customerId), consent)
  return { id: ref.id, ...consent }
}

export const deleteConsent = async (businessId, customerId, consentId) => {
  await deleteDoc(doc(consentimientosDe(businessId, customerId), consentId))
}
