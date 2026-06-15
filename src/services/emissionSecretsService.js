import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

/**
 * Lee las credenciales de emisión (certificado SUNAT .p12, claves SOL, QPse) desde la
 * subcolección PROTEGIDA /businesses/{id}/secrets/emission, con fallback al doc
 * top-level (durante/después de la migración del certificado).
 *
 * Antes estas credenciales vivían en el doc /businesses/{id}, que es de lectura PÚBLICA
 * cuando el catálogo/libro de reclamaciones está activo → exposición pública del cert.
 * Ahora viven en la subcolección (solo dueño/admin la leen; el server con Admin SDK).
 *
 * Devuelve { sunat, qpse, emissionConfig } ya fusionados: emissionConfig combina
 * method/taxConfig (NO secretos, se quedan en el top-level) con qpse/sunat (secretos,
 * del subcolección).
 *
 * @param {string} businessId
 * @param {object} [topLevelData] datos ya cargados de /businesses/{id} (fallback)
 */
export async function getEmissionSecrets(businessId, topLevelData = {}) {
  let secret = {}
  try {
    const snap = await getDoc(doc(db, 'businesses', businessId, 'secrets', 'emission'))
    if (snap.exists()) secret = snap.data() || {}
  } catch (e) {
    // sin permiso / no existe → usar el fallback del doc top-level
  }
  const td = topLevelData || {}
  return {
    sunat: secret.sunat ?? td.sunat ?? null,
    qpse: secret.qpse ?? td.qpse ?? null,
    emissionConfig: {
      ...(td.emissionConfig || {}),     // method, taxConfig (no secretos)
      ...(secret.emissionConfig || {}), // qpse, sunat (secretos)
    },
  }
}

/** Escribe credenciales de emisión en la subcolección protegida (merge). */
export async function saveEmissionSecrets(businessId, payload) {
  await setDoc(doc(db, 'businesses', businessId, 'secrets', 'emission'), payload, { merge: true })
}
