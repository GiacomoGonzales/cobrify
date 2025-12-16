/**
 * Servicio de sincronización offline
 * Procesa las ventas pendientes cuando se restaura la conexión
 */

import {
  getPendingSales,
  updatePendingSale,
  removePendingSale,
} from './offlineQueueService'
import { createInvoice } from './firestoreService'

let isSyncing = false
let syncListeners = []

/**
 * Registra un listener para eventos de sincronización
 * @param {Function} listener - Función callback
 * @returns {Function} - Función para remover el listener
 */
export function onSyncEvent(listener) {
  syncListeners.push(listener)
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener)
  }
}

/**
 * Emite un evento de sincronización a todos los listeners
 * @param {string} event - Tipo de evento
 * @param {Object} data - Datos del evento
 */
function emitSyncEvent(event, data) {
  syncListeners.forEach(listener => {
    try {
      listener(event, data)
    } catch (error) {
      console.error('Error en sync listener:', error)
    }
  })
}

/**
 * Procesa todas las ventas pendientes
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
export async function processPendingSales(userId) {
  if (isSyncing) {
    console.log('⏳ Ya hay una sincronización en progreso')
    return { processed: 0, failed: 0, skipped: true }
  }

  if (!navigator.onLine) {
    console.log('📴 Sin conexión, no se puede sincronizar')
    return { processed: 0, failed: 0, offline: true }
  }

  isSyncing = true
  emitSyncEvent('sync_started', {})

  const pendingSales = await getPendingSales()
  console.log(`🔄 Procesando ${pendingSales.length} ventas pendientes...`)

  let processed = 0
  let failed = 0

  for (const sale of pendingSales) {
    try {
      emitSyncEvent('processing_sale', { offlineId: sale.offlineId })

      // Marcar como procesando
      await updatePendingSale(sale.offlineId, {
        status: 'processing',
        attempts: sale.attempts + 1,
      })

      // Crear la factura en Firebase
      const result = await createInvoice(userId, sale.invoiceData)

      if (result.success) {
        // Marcar como completada y remover
        await updatePendingSale(sale.offlineId, {
          status: 'completed',
          firebaseId: result.id,
          invoiceNumber: result.invoiceNumber,
        })
        await removePendingSale(sale.offlineId)
        processed++

        emitSyncEvent('sale_processed', {
          offlineId: sale.offlineId,
          firebaseId: result.id,
          invoiceNumber: result.invoiceNumber,
        })

        console.log(`✅ Venta sincronizada: ${result.invoiceNumber || result.id}`)
      } else {
        throw new Error(result.error || 'Error desconocido')
      }
    } catch (error) {
      console.error(`❌ Error procesando venta ${sale.offlineId}:`, error)

      // Marcar como fallida (max 3 intentos)
      const newStatus = sale.attempts >= 2 ? 'failed' : 'pending'
      await updatePendingSale(sale.offlineId, {
        status: newStatus,
        lastError: error.message,
      })

      failed++
      emitSyncEvent('sale_failed', {
        offlineId: sale.offlineId,
        error: error.message,
        willRetry: newStatus === 'pending',
      })
    }
  }

  isSyncing = false
  emitSyncEvent('sync_completed', { processed, failed, total: pendingSales.length })

  console.log(`🔄 Sincronización completada: ${processed} exitosas, ${failed} fallidas`)
  return { processed, failed }
}

/**
 * Inicia el monitoreo de conexión para auto-sincronizar
 * @param {string} userId - ID del usuario
 */
export function startAutoSync(userId) {
  if (!userId) return

  const handleOnline = async () => {
    console.log('🌐 Conexión detectada, iniciando sincronización automática...')
    // Esperar un momento para asegurar que la conexión esté estable
    setTimeout(async () => {
      if (navigator.onLine) {
        await processPendingSales(userId)
      }
    }, 2000)
  }

  window.addEventListener('online', handleOnline)

  // Retornar función de limpieza
  return () => {
    window.removeEventListener('online', handleOnline)
  }
}

/**
 * Verifica si hay sincronización en progreso
 */
export function isSyncInProgress() {
  return isSyncing
}

export default {
  processPendingSales,
  startAutoSync,
  onSyncEvent,
  isSyncInProgress,
}
