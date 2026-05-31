import { httpsCallable } from 'firebase/functions'
import { functions, auth } from '@/lib/firebase'
import { uploadToCloudinary } from '@/utils/cloudinary'

/**
 * Servicio único de subida de imágenes NUEVAS.
 *
 * Objetivo: "cerrar la canilla" — que las imágenes nuevas vayan directo a
 * Cloudflare R2 (egress $0) en vez de Cloudinary. Para no arriesgar al SaaS en
 * vivo, esto se activa SOLO para las cuentas de la allowlist (piloto). El resto
 * sigue yendo a Cloudinary como siempre.
 *
 * Si la subida a R2 falla por lo que sea, cae de vuelta a Cloudinary
 * automáticamente (respaldo): el usuario nunca se queda sin poder subir.
 */

// ACTIVADO PARA TODOS (2026-05-30): tras migrar los 392 negocios a R2, todas las
// imágenes NUEVAS (logos, portadas, productos) suben directo a Cloudflare R2
// (egress $0). Cloudinary queda solo como RESPALDO DE EMERGENCIA: si la subida a
// R2 fallara, el fallback en uploadImage() usa Cloudinary para que el usuario
// nunca se quede sin poder subir. Cuando R2 esté 100% probado en producción se
// puede quitar ese fallback y recién ahí borrar Cloudinary del todo.
const R2_UPLOAD_FOR_ALL = true

// businessId (== uid del dueño) de las cuentas de prueba que ya suben a R2.
const R2_UPLOAD_ALLOWLIST = [
  'rVJgQJiduAVozIP1lc5dy6mpvR43', // yigastrolab@gmail.com (cuenta de prueba del piloto)
]

// Emails de prueba: si el usuario logueado es uno de estos, sube a R2 sin
// importar en qué negocio esté. Útil para probar con una cuenta puntual sin
// tener que averiguar su businessId.
const R2_UPLOAD_EMAIL_ALLOWLIST = [
  'giacomogonzales@icloud.com',
]

/**
 * ¿Esta cuenta debe subir sus imágenes nuevas a R2?
 * Se activa por businessId (dueño) o por el email del usuario logueado.
 */
export function shouldUploadToR2(businessId) {
  if (R2_UPLOAD_FOR_ALL) return true
  if (businessId && R2_UPLOAD_ALLOWLIST.includes(businessId)) return true
  const email = (auth?.currentUser?.email || '').toLowerCase()
  if (email && R2_UPLOAD_EMAIL_ALLOWLIST.some(e => e.toLowerCase() === email)) return true
  return false
}

/**
 * Convierte un Blob/File a base64 (sin el prefijo "data:...;base64,").
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const r = reader.result || ''
      const c = typeof r === 'string' ? r.indexOf(',') : -1
      resolve(c >= 0 ? r.slice(c + 1) : r)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Sube una imagen (ya comprimida) y devuelve su URL pública.
 *
 * - Cuentas en la allowlist (o todos, si R2_UPLOAD_FOR_ALL): R2 con respaldo
 *   Cloudinary si falla.
 * - Resto: Cloudinary, como siempre.
 *
 * @param {Blob|File} file imagen ya comprimida lista para subir
 * @param {{ folder?: string, businessId?: string }} opts
 * @returns {Promise<string>} URL pública de la imagen
 */
export async function uploadImage(file, { folder = 'uploads', businessId } = {}) {
  if (shouldUploadToR2(businessId)) {
    try {
      const dataBase64 = await blobToBase64(file)
      const fn = httpsCallable(functions, 'uploadImageToR2', { timeout: 120000 })
      const r = await fn({ dataBase64, contentType: file.type || 'image/webp', folder })
      if (r?.data?.url) {
        console.log('✅ Imagen subida a R2:', r.data.url)
        return r.data.url
      }
      throw new Error('R2 no devolvió URL')
    } catch (e) {
      console.warn('⚠️ Subida a R2 falló, usando Cloudinary de respaldo:', e?.message || e)
      return uploadToCloudinary(file)
    }
  }
  return uploadToCloudinary(file)
}
