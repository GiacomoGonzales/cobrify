/**
 * Caché local de productos del POS via IndexedDB.
 *
 * Motivo: en cuentas con miles de productos, abrir el POS descarga ~4k+ docs
 * de Firestore y eso tarda 5-15s incluso con buena conexión. Con este caché
 * el cajero ve los productos al instante (los de la última sesión) mientras
 * `subscribeToProducts` sincroniza en background.
 *
 * Por qué IndexedDB y no localStorage:
 *   - localStorage tiene límite de ~5MB. 4000 productos × 2-5KB ≈ 8-20MB → no entra.
 *   - IndexedDB: límite efectivo de cientos de MB, async (no bloquea el hilo).
 *
 * Modelo: 1 entrada por businessId. La entrada guarda { products, updatedAt }.
 * Si el negocio cambia de selector (multi-cuenta), se guarda otra entrada.
 *
 * Falla GRACEFULLY: si IndexedDB no está disponible (Safari privado, navegador
 * viejo) o falla la lectura/escritura, las funciones retornan null/no-op y el
 * POS sigue funcionando con su carga normal vía Firestore.
 */

const DB_NAME = 'cobrify_pos_cache'
const STORE = 'products_by_business'
const DB_VERSION = 1

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null)
    return dbPromise
  }
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE) // key = businessId
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => { console.warn('[productCache] IndexedDB open error:', req.error); resolve(null) }
      req.onblocked = () => { console.warn('[productCache] IndexedDB blocked'); resolve(null) }
    } catch (e) {
      console.warn('[productCache] IndexedDB open exception:', e)
      resolve(null)
    }
  })
  return dbPromise
}

/**
 * Devuelve los productos cacheados del businessId, o null si no hay / falla.
 * Async — no bloquea. El consumidor puede pintar mientras tanto el placeholder.
 */
export async function getCachedProducts(businessId) {
  if (!businessId) return null
  const db = await openDB()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const req = store.get(businessId)
      req.onsuccess = () => {
        const entry = req.result
        if (entry && Array.isArray(entry.products) && entry.products.length > 0) {
          resolve(entry.products)
        } else {
          resolve(null)
        }
      }
      req.onerror = () => resolve(null)
    } catch (e) {
      console.warn('[productCache] get error:', e)
      resolve(null)
    }
  })
}

/**
 * Guarda los productos del businessId. Async, fire-and-forget — el consumidor
 * no necesita await (no impacta perf si la escritura demora).
 */
export async function setCachedProducts(businessId, products) {
  if (!businessId || !Array.isArray(products)) return
  const db = await openDB()
  if (!db) return
  try {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.put({ products, updatedAt: Date.now() }, businessId)
  } catch (e) {
    console.warn('[productCache] set error:', e)
  }
}

/**
 * Limpia el caché del businessId. Útil tras cerrar sesión o cuando se quiere
 * forzar una re-descarga limpia.
 */
export async function clearCachedProducts(businessId) {
  if (!businessId) return
  const db = await openDB()
  if (!db) return
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(businessId)
  } catch (e) {
    console.warn('[productCache] clear error:', e)
  }
}
