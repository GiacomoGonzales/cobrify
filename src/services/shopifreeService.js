/**
 * Servicio de integración con Shopifree (tienda online externa).
 *
 * Shopifree expone una REST API v1. El merchant genera un API key en su
 * dashboard de Shopifree, lo pega en Cobrify, y Cobrify lo guarda en el
 * documento del business para que las Cloud Functions puedan usarlo después
 * (push de productos vía trigger Firestore, polling de pedidos vía cron).
 *
 * Este módulo expone:
 *   - validateShopifreeApiKey: pinguea Shopifree para confirmar que el key es
 *     válido. No guarda nada.
 *   - connectShopifree: guarda el key + datos del store en Firestore.
 *   - disconnectShopifree: borra el config.
 *   - pingShopifree: re-valida y actualiza lastPingAt (para mostrar estado
 *     "Conectado" en UI con timestamp fresco).
 *
 * El API key vive en `businesses/{businessId}.shopifreeConfig.apiKey` y las
 * reglas de Firestore impiden lectura externa (mismo modelo que rappiConfig).
 */
import { httpsCallable } from 'firebase/functions'
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { db, functions } from '@/lib/firebase'

/**
 * Valida el API key contra Shopifree (GET /store). No persiste nada.
 *
 * @param {string} businessId
 * @param {string} apiKey - formato `sfk_<64 hex chars>`
 * @returns {Promise<{ok: boolean, store?: object, error?: string, status?: number}>}
 */
export const validateShopifreeApiKey = async (businessId, apiKey) => {
  if (!businessId) return { ok: false, error: 'businessId requerido' }
  if (!apiKey) return { ok: false, error: 'API key requerido' }
  try {
    const fn = httpsCallable(functions, 'validateShopifreeConnection')
    const result = await fn({ businessId, apiKey })
    return result.data
  } catch (err) {
    console.error('validateShopifreeApiKey error:', err)
    return { ok: false, error: err.message || 'Error al validar' }
  }
}

/**
 * Guarda el API key + datos del store en Firestore. Llamar después de que
 * validateShopifreeApiKey haya devuelto ok:true.
 */
export const connectShopifree = async (businessId, apiKey, store) => {
  if (!businessId || !apiKey || !store) {
    throw new Error('connectShopifree: parámetros incompletos')
  }
  const ref = doc(db, 'businesses', businessId)
  await setDoc(ref, {
    shopifreeConfig: {
      apiKey,
      storeId: store.id,
      storeName: store.name,
      storeSubdomain: store.subdomain || null,
      customDomain: store.customDomain || null,
      currency: store.currency || null,
      language: store.language || null,
      plan: store.plan || null,
      country: store.country || null,
      connectedAt: serverTimestamp(),
      lastPingAt: serverTimestamp(),
      // Polling de pedidos: se activa explícitamente en una fase posterior.
      pollingEnabled: false,
    },
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * Desconecta: limpia shopifreeConfig del business.
 */
export const disconnectShopifree = async (businessId) => {
  if (!businessId) throw new Error('disconnectShopifree: businessId requerido')
  const ref = doc(db, 'businesses', businessId)
  await setDoc(ref, {
    shopifreeConfig: null,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * Re-valida la conexión existente y actualiza lastPingAt si fue exitosa.
 * Útil para el botón "Verificar conexión" del panel.
 */
export const pingShopifree = async (businessId) => {
  if (!businessId) return { ok: false, error: 'businessId requerido' }
  const ref = doc(db, 'businesses', businessId)
  const snap = await getDoc(ref)
  const apiKey = snap.data()?.shopifreeConfig?.apiKey
  if (!apiKey) return { ok: false, error: 'No hay conexión guardada' }

  const result = await validateShopifreeApiKey(businessId, apiKey)
  if (result.ok && result.store) {
    // Refrescar datos del store por si cambió nombre/dominio/currency.
    await setDoc(ref, {
      shopifreeConfig: {
        storeId: result.store.id,
        storeName: result.store.name,
        storeSubdomain: result.store.subdomain || null,
        customDomain: result.store.customDomain || null,
        currency: result.store.currency || null,
        language: result.store.language || null,
        plan: result.store.plan || null,
        country: result.store.country || null,
        lastPingAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }
  return result
}

/**
 * Construye la URL pública de la tienda Shopifree (custom domain si existe,
 * subdomain por defecto). Para mostrar como link en la UI.
 */
export const getShopifreeStoreUrl = (config) => {
  if (!config) return null
  if (config.customDomain) return `https://${config.customDomain}`
  if (config.storeSubdomain) return `https://${config.storeSubdomain}.shopifree.app`
  return null
}
