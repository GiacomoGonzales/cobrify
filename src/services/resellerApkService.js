/**
 * APK de marca blanca del reseller: subirla (admin) y ofrecerla (panel).
 *
 * El reseller le instala esta app a sus clientes. Es la misma app de siempre
 * pero con su nombre, su ícono y su dominio: por dentro carga su sistema web,
 * así que las actualizaciones le llegan solas y solo hace falta un APK nuevo
 * cuando cambia algo nativo.
 *
 * El archivo vive en Storage y el enlace queda anotado en el doc del reseller
 * (`androidApp`), que es lo que lee su panel. Se guarda la versión y la fecha
 * para que sepa si lo que está repartiendo es lo último.
 */
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { doc, updateDoc, deleteField, Timestamp } from 'firebase/firestore'
import { storage, db } from '@/lib/firebase'

/** Ruta fija por reseller: subir de nuevo reemplaza, no acumula versiones. */
const rutaApk = (resellerId) => `reseller-apks/${resellerId}/app.apk`

/**
 * Sube (o reemplaza) el APK de un reseller y lo deja publicado en su panel.
 *
 * @param {string} resellerId
 * @param {File}   file      el .apk
 * @param {Object} meta      { version, notas }
 */
export async function subirApkReseller(resellerId, file, { version = '', notas = '' } = {}) {
  if (!resellerId) return { success: false, error: 'Falta el reseller' }
  if (!file) return { success: false, error: 'Falta el archivo' }
  if (!file.name?.toLowerCase().endsWith('.apk')) {
    return { success: false, error: 'El archivo debe ser un .apk' }
  }

  try {
    const storageRef = ref(storage, rutaApk(resellerId))
    // contentType explícito: sin esto Storage lo sirve como octet-stream
    // genérico y algunos navegadores de Android no ofrecen instalarlo.
    await uploadBytes(storageRef, file, {
      contentType: 'application/vnd.android.package-archive',
    })
    const url = await getDownloadURL(storageRef)

    await updateDoc(doc(db, 'resellers', resellerId), {
      androidApp: {
        url,
        version: String(version || '').trim(),
        notas: String(notas || '').trim(),
        // Tamaño y fecha para que el reseller sepa qué está repartiendo.
        sizeMb: Math.round((file.size / 1048576) * 10) / 10,
        updatedAt: Timestamp.now(),
      },
      updatedAt: Timestamp.now(),
    })

    return { success: true, url }
  } catch (error) {
    console.error('Error subiendo APK del reseller:', error)
    return { success: false, error: error.message }
  }
}

/** Retira el APK: se borra el archivo y desaparece de su panel. */
export async function quitarApkReseller(resellerId) {
  if (!resellerId) return { success: false, error: 'Falta el reseller' }
  try {
    try {
      await deleteObject(ref(storage, rutaApk(resellerId)))
    } catch (e) {
      // El archivo puede no existir (se borró antes, o solo quedó el enlace).
      // Igual hay que limpiar el doc, así que no se corta acá.
      if (e?.code !== 'storage/object-not-found') throw e
    }
    await updateDoc(doc(db, 'resellers', resellerId), {
      androidApp: deleteField(),
      updatedAt: Timestamp.now(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error quitando APK del reseller:', error)
    return { success: false, error: error.message }
  }
}
