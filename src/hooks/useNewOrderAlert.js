import { useEffect, useRef } from 'react'
import { playOrderAlertBeep, vibrateOrderAlert } from '@/utils/orderAlertSound'

const REPEAT_INTERVAL_MS = 30000 // Recordatorio cada 30s mientras haya pendientes

/**
 * Alerta in-app cuando llegan pedidos nuevos (pending) al listener de Firestore.
 * Reproduce sonido, vibra, parpadea el título y repite cada 30s mientras
 * sigan habiendo pendientes sin atender. La detección es por diff de IDs
 * entre snapshots, así NO suena en la carga inicial.
 *
 * @param {Array} orders - Lista de pedidos del listener (con .id y .status)
 * @param {Object} options
 * @param {boolean} options.enabled - Activar/desactivar la alerta
 */
export function useNewOrderAlert(orders, { enabled = true } = {}) {
  const knownPendingIdsRef = useRef(null) // null = primer snapshot, no alertar
  const initialTitleRef = useRef(null)
  const flashIntervalRef = useRef(null)
  const reminderIntervalRef = useRef(null)

  // Diff: detectar IDs pending nuevos
  useEffect(() => {
    if (!enabled) return
    if (!Array.isArray(orders)) return

    const currentPendingIds = new Set(
      orders.filter(o => o.status === 'pending').map(o => o.id)
    )

    // Primera carga: registrar baseline sin alertar
    if (knownPendingIdsRef.current === null) {
      knownPendingIdsRef.current = currentPendingIds
      return
    }

    const previousIds = knownPendingIdsRef.current
    const newIds = []
    currentPendingIds.forEach(id => {
      if (!previousIds.has(id)) newIds.push(id)
    })

    knownPendingIdsRef.current = currentPendingIds

    if (newIds.length === 0) return

    // Hubo pedidos nuevos: alarma fuerte
    playOrderAlertBeep('strong')
    vibrateOrderAlert([300, 100, 300, 100, 300])

    // Notificación del navegador (cobertura extra cuando la pestaña no está visible)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        const n = new Notification('🔔 Nuevo pedido online', {
          body: newIds.length === 1
            ? 'Tienes un pedido nuevo por atender'
            : `Tienes ${newIds.length} pedidos nuevos por atender`,
          tag: 'cobrify-new-order',
          renotify: true,
        })
        n.onclick = () => { window.focus(); n.close() }
      }
    } catch { /* no-op */ }
  }, [orders, enabled])

  // Pedir permiso de notificación del navegador la primera vez (web)
  useEffect(() => {
    if (!enabled) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    // Pedir permiso tras la primera interacción del usuario (requerido en algunos browsers)
    const askOnce = () => {
      Notification.requestPermission().catch(() => {})
      window.removeEventListener('pointerdown', askOnce)
    }
    window.addEventListener('pointerdown', askOnce, { once: true })
    return () => window.removeEventListener('pointerdown', askOnce)
  }, [enabled])

  // Flash del título mientras haya pendientes
  useEffect(() => {
    if (!enabled) return
    if (initialTitleRef.current === null) initialTitleRef.current = document.title

    const pendingCount = (orders || []).filter(o => o.status === 'pending').length

    // Limpiar timer previo
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current)
      flashIntervalRef.current = null
    }

    if (pendingCount === 0) {
      document.title = initialTitleRef.current
      return
    }

    const altTitle = `🔔 ${pendingCount} pedido${pendingCount > 1 ? 's' : ''} nuevo${pendingCount > 1 ? 's' : ''}`
    let toggle = false
    flashIntervalRef.current = setInterval(() => {
      document.title = toggle ? initialTitleRef.current : altTitle
      toggle = !toggle
    }, 1000)

    return () => {
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current)
        flashIntervalRef.current = null
      }
      document.title = initialTitleRef.current
    }
  }, [orders, enabled])

  // Restaurar título al desmontar
  useEffect(() => {
    return () => {
      if (initialTitleRef.current) document.title = initialTitleRef.current
    }
  }, [])

  // Recordatorio: si hay pendientes sin atender, beep suave cada 30s
  useEffect(() => {
    if (!enabled) return

    if (reminderIntervalRef.current) {
      clearInterval(reminderIntervalRef.current)
      reminderIntervalRef.current = null
    }

    const hasPending = (orders || []).some(o => o.status === 'pending')
    if (!hasPending) return

    reminderIntervalRef.current = setInterval(() => {
      const stillPending = (knownPendingIdsRef.current?.size || 0) > 0
      if (!stillPending) return
      playOrderAlertBeep('normal')
      vibrateOrderAlert([200, 100, 200])
    }, REPEAT_INTERVAL_MS)

    return () => {
      if (reminderIntervalRef.current) {
        clearInterval(reminderIntervalRef.current)
        reminderIntervalRef.current = null
      }
    }
  }, [orders, enabled])
}
