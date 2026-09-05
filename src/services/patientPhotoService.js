/**
 * GALERÍA DEL PACIENTE: fotos de antes y después de cada tratamiento.
 *
 * Viven en `customers/{id}/photos` (regla propia en firestore.rules). El
 * archivo sube por el mismo camino que las fotos de producto —comprimido a
 * 1280 px y a Cloudflare R2— así una ficha con cuarenta fotos sigue abriendo
 * rápido. La URL que devuelve el almacenamiento es pública para quien la
 * tenga: no se adivina, pero tampoco pide sesión. Hoy alcanza; si un
 * negocio pide fotos protegidas de verdad, van detrás de una function.
 *
 * Borrar quita el documento; el archivo queda en el almacenamiento, igual
 * que pasa con las imágenes de producto.
 */
import { collection, addDoc, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { cleanText } from '@/lib/utils'
import { uploadImage } from './imageUploadService'
import { compressForProduct } from './productImageService'
import { hoyYMD } from '@/utils/fichaAtencion'

/** Las dos etiquetas. Pocas a propósito: es lo que la clínica le enseña a la paciente. */
export const ETIQUETAS_FOTO = [
  { id: 'antes', nombre: 'Antes' },
  { id: 'despues', nombre: 'Después' },
]

export const nombreEtiqueta = (id) => ETIQUETAS_FOTO.find(e => e.id === id)?.nombre || 'Antes'

const fotosDe = (businessId, customerId) =>
  collection(db, 'businesses', businessId, 'customers', customerId, 'photos')

/** Las fotos del paciente, la más reciente primero. */
export const getPatientPhotos = async (businessId, customerId) => {
  const snap = await getDocs(query(fotosDe(businessId, customerId), orderBy('takenAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

const esImagen = (file) => {
  const tipo = String(file?.type || '')
  const nombre = String(file?.name || '').toLowerCase()
  return tipo.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/.test(nombre)
}

/**
 * Sube una foto y la registra en la ficha.
 *
 * @param {string} businessId
 * @param {string} customerId
 * @param {File} file
 * @param {{ takenAt?: string, label?: 'antes'|'despues', treatment?: string, note?: string, createdBy?: string }} meta
 * @returns {Promise<object>} la foto guardada, con su id y su url
 */
export const addPatientPhoto = async (businessId, customerId, file, meta = {}) => {
  if (!esImagen(file)) throw new Error('Elige una imagen (JPG, PNG o WebP)')
  if (file.size > 12 * 1024 * 1024) throw new Error('La foto pesa demasiado (máximo 12 MB)')

  const comprimida = await compressForProduct(file)
  const url = await uploadImage(comprimida, { folder: 'cobrify/patients', businessId })

  const datos = {
    url,
    takenAt: /^\d{4}-\d{2}-\d{2}$/.test(meta.takenAt || '') ? meta.takenAt : hoyYMD(),
    label: meta.label === 'despues' ? 'despues' : 'antes',
    treatment: cleanText(meta.treatment || ''),
    note: cleanText(meta.note || ''),
    createdBy: meta.createdBy || null,
    createdAt: serverTimestamp(),
  }
  const ref = await addDoc(fotosDe(businessId, customerId), datos)
  return { id: ref.id, ...datos, createdAt: new Date() }
}

export const deletePatientPhoto = async (businessId, customerId, photoId) => {
  await deleteDoc(doc(fotosDe(businessId, customerId), photoId))
}
