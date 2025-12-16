/**
 * Servicio de cola offline para ventas pendientes
 * Usa IndexedDB para almacenar ventas cuando no hay conexión
 * y las procesa automáticamente cuando se restaura la conexión
 */

const DB_NAME = 'cobrify_offline'
const DB_VERSION = 1
const STORE_NAME = 'pending_sales'

let db = null

/**
 * Inicializa la base de datos IndexedDB
 */
async function initDB() {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('❌ Error abriendo IndexedDB:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      console.log('📦 IndexedDB inicializada para modo offline')
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = event.target.result

      // Crear store para ventas pendientes
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'offlineId',
          autoIncrement: true,
        })
        store.createIndex('createdAt', 'createdAt', { unique: false })
        store.createIndex('status', 'status', { unique: false })
        console.log('📦 Store de ventas pendientes creado')
      }
    }
  })
}

/**
 * Guarda una venta en la cola offline
 * @param {Object} saleData - Datos de la venta
 * @returns {Promise<number>} - ID de la venta offline
 */
export async function savePendingSale(saleData) {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const pendingSale = {
      ...saleData,
      status: 'pending', // pending, processing, completed, failed
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    }

    const request = store.add(pendingSale)

    request.onsuccess = () => {
      console.log('💾 Venta guardada en cola offline:', request.result)
      resolve(request.result)
    }

    request.onerror = () => {
      console.error('❌ Error guardando venta offline:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Obtiene todas las ventas pendientes
 * @returns {Promise<Array>} - Lista de ventas pendientes
 */
export async function getPendingSales() {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('status')
    const request = index.getAll('pending')

    request.onsuccess = () => {
      resolve(request.result || [])
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/**
 * Obtiene el conteo de ventas pendientes
 * @returns {Promise<number>} - Cantidad de ventas pendientes
 */
export async function getPendingSalesCount() {
  const sales = await getPendingSales()
  return sales.length
}

/**
 * Actualiza el estado de una venta pendiente
 * @param {number} offlineId - ID de la venta offline
 * @param {Object} updates - Campos a actualizar
 */
export async function updatePendingSale(offlineId, updates) {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const getRequest = store.get(offlineId)

    getRequest.onsuccess = () => {
      const sale = getRequest.result
      if (!sale) {
        reject(new Error('Venta no encontrada'))
        return
      }

      const updatedSale = { ...sale, ...updates, updatedAt: new Date().toISOString() }
      const putRequest = store.put(updatedSale)

      putRequest.onsuccess = () => resolve(updatedSale)
      putRequest.onerror = () => reject(putRequest.error)
    }

    getRequest.onerror = () => reject(getRequest.error)
  })
}

/**
 * Elimina una venta de la cola (cuando se procesa exitosamente)
 * @param {number} offlineId - ID de la venta offline
 */
export async function removePendingSale(offlineId) {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(offlineId)

    request.onsuccess = () => {
      console.log('🗑️ Venta removida de cola offline:', offlineId)
      resolve()
    }

    request.onerror = () => reject(request.error)
  })
}

/**
 * Obtiene todas las ventas (incluyendo procesadas y fallidas)
 * @returns {Promise<Array>} - Todas las ventas en la cola
 */
export async function getAllOfflineSales() {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      resolve(request.result || [])
    }

    request.onerror = () => reject(request.error)
  })
}

/**
 * Limpia ventas completadas de la cola
 */
export async function clearCompletedSales() {
  const database = await initDB()
  const allSales = await getAllOfflineSales()
  const completedSales = allSales.filter(s => s.status === 'completed')

  for (const sale of completedSales) {
    await removePendingSale(sale.offlineId)
  }

  console.log(`🧹 ${completedSales.length} ventas completadas limpiadas`)
  return completedSales.length
}

// Inicializar DB al cargar el módulo
initDB().catch(console.error)

export default {
  savePendingSale,
  getPendingSales,
  getPendingSalesCount,
  updatePendingSale,
  removePendingSale,
  getAllOfflineSales,
  clearCompletedSales,
}
