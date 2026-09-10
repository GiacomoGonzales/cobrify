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
 * Con `emisorId` (un RUC adicional, "Varios RUC") lee y escribe en la
 * subcolección del emisor, `emisores/{eid}/secrets/emission`, que tiene la
 * MISMA forma: así el formulario del admin y el servidor tratan igual a los
 * dos. Para el emisor no hay fallback al doc del negocio: sus credenciales
 * son suyas o no existen, nunca las del RUC principal.
 *
 * @param {string} businessId
 * @param {object} [topLevelData] datos ya cargados de /businesses/{id} (fallback)
 * @param {{emisorId?: string}} [opciones]
 */
export function refDeSecretosDeEmision(businessId, emisorId = null) {
  return emisorId
    ? doc(db, 'businesses', businessId, 'emisores', emisorId, 'secrets', 'emission')
    : doc(db, 'businesses', businessId, 'secrets', 'emission')
}

export async function getEmissionSecrets(businessId, topLevelData = {}, { emisorId = null } = {}) {
  let secret = {}
  try {
    const snap = await getDoc(refDeSecretosDeEmision(businessId, emisorId))
    if (snap.exists()) secret = snap.data() || {}
  } catch (e) {
    // sin permiso / no existe → usar el fallback del doc top-level
  }
  const td = emisorId ? {} : (topLevelData || {})
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
export async function saveEmissionSecrets(businessId, payload, { emisorId = null } = {}) {
  await setDoc(refDeSecretosDeEmision(businessId, emisorId), payload, { merge: true })
}
