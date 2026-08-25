/**
 * Servicio de sincronización offline
 * Procesa las ventas pendientes cuando se restaura la conexión
 */

import {
  getPendingSales,
  updatePendingSale,
  removePendingSale,
} from './offlineQueueService'
import { createInvoiceWithNumber } from './firestoreService'
import { descontarStockDeVentaGuardada } from './saleStockDeduction'

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
 * Procesa todas las ventas pendientes.
 *
 * @param {string} currentBusinessId - Negocio de la sesión actual (getBusinessId(),
 *   NO el uid del usuario). Solo se usa como respaldo y para no sincronizar
 *   ventas de otra cuenta que use el mismo equipo.
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
export async function processPendingSales(currentBusinessId) {
  if (isSyncing) {
    console.log('⏳ Ya hay una sincronización en progreso')
    // `alreadyRunning` y no `skipped`: ahora skipped es un CONTADOR de ventas
    // de otra cuenta, y devolver un booleano en ese campo confundiría.
    return { processed: 0, failed: 0, skipped: 0, alreadyRunning: true }
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
  let skipped = 0
  let stockIssues = 0

  // `allowNegativeStock` se lee una vez por negocio y no una vez por venta.
  // La caché es local a esta corrida: si el dueño cambia la opción, la próxima
  // sincronización la lee de nuevo.
  const negStockCache = new Map()
  const getAllowNegativeStock = async (bid) => {
    if (negStockCache.has(bid)) return negStockCache.get(bid)
    let value = false
    try {
      const { doc, getDoc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const snap = await getDoc(doc(db, 'businesses', bid))
      value = snap.exists() ? !!snap.data().allowNegativeStock : false
    } catch (err) {
      console.error('No se pudo leer allowNegativeStock; se asume false:', err)
    }
    negStockCache.set(bid, value)
    return value
  }

  for (const sale of pendingSales) {
    // El negocio destino sale de la VENTA, no de quien está sincronizando.
    // Antes se usaba el uid del usuario: para el dueño coincidía con el id del
    // negocio y funcionaba, pero un SUB-USUARIO escribía en
    // businesses/{suPropioUid}/invoices — un negocio fantasma que no existe en
    // ninguna pantalla. Y no fallaba: las reglas lo permiten porque el uid
    // coincide con el path, así que el sync decía "listo" y borraba la venta de
    // la cola. Caso real: 17 notas de venta de una farmacia (11-ago-2026).
    const targetBusinessId = sale.businessId || currentBusinessId

    // La cola vive en IndexedDB, que es por navegador y no por cuenta. Si otra
    // cuenta usa el mismo equipo, sus ventas se quedan encoladas hasta que ella
    // entre: no se sincronizan acá ni se pierden.
    if (currentBusinessId && sale.businessId && sale.businessId !== currentBusinessId) {
      skipped++
      continue
    }

    if (!targetBusinessId) {
      console.error(`❌ Venta ${sale.offlineId} sin negocio destino; se deja en cola`)
      failed++
      continue
    }

    try {
      emitSyncEvent('processing_sale', { offlineId: sale.offlineId })

      // Marcar como procesando
      await updatePendingSale(sale.offlineId, {
        status: 'processing',
        attempts: sale.attempts + 1,
      })

      // Con número atómico, igual que una venta normal. Antes se usaba
      // `createInvoice`, que solo inserta el documento: el comprobante quedaba
      // SIN número, sin serie y sin correlativo, y el contador del negocio no
      // avanzaba.
      const result = await createInvoiceWithNumber(
        targetBusinessId,
        sale.invoiceData,
        sale.documentType || sale.invoiceData?.documentType,
        sale.invoiceData?.warehouseId || null,
        sale.invoiceData?.branchId || null,
      )

      if (result.success) {
        // Descontar el stock. Va DESPUÉS de crear el comprobante y su resultado
        // no decide si la venta se reintenta: crear el comprobante NO es
        // idempotente, así que un reintento generaría un segundo comprobante con
        // otro número. Si el stock falla, la venta queda sincronizada igual y se
        // avisa para revisarla a mano.
        const stockRes = await descontarStockDeVentaGuardada({
          businessId: targetBusinessId,
          invoiceId: result.id,
          invoiceNumber: result.number,
          documentType: sale.documentType || sale.invoiceData?.documentType,
          invoiceData: sale.invoiceData,
          allowNegativeStock: await getAllowNegativeStock(targetBusinessId),
          userId: sale.userId,
        })
        if (!stockRes.ok) {
          stockIssues++
          emitSyncEvent('stock_failed', {
            offlineId: sale.offlineId,
            invoiceNumber: result.number,
            error: stockRes.error,
          })
        }

        // Marcar como completada y remover
        await updatePendingSale(sale.offlineId, {
          status: 'completed',
          firebaseId: result.id,
          invoiceNumber: result.number,
        })
        await removePendingSale(sale.offlineId)
        processed++

        emitSyncEvent('sale_processed', {
          offlineId: sale.offlineId,
          firebaseId: result.id,
          invoiceNumber: result.number,
        })

        console.log(`✅ Venta sincronizada: ${result.number || result.id}`)
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
  emitSyncEvent('sync_completed', { processed, failed, skipped, stockIssues, total: pendingSales.length })

  console.log(`🔄 Sincronización completada: ${processed} exitosas, ${failed} fallidas, ${skipped} de otra cuenta, ${stockIssues} sin descontar stock`)
  return { processed, failed, skipped, stockIssues }
}

/**
 * Inicia el monitoreo de conexión para auto-sincronizar
 * @param {string} currentBusinessId - Negocio de la sesión actual (getBusinessId())
 */
export function startAutoSync(currentBusinessId) {
  if (!currentBusinessId) return

  const handleOnline = async () => {
    console.log('🌐 Conexión detectada, iniciando sincronización automática...')
    // Esperar un momento para asegurar que la conexión esté estable
    setTimeout(async () => {
      if (navigator.onLine) {
        await processPendingSales(currentBusinessId)
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
