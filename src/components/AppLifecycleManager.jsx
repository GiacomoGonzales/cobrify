import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { disableNetwork, enableNetwork } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Si la app estuvo en background más de este tiempo, recargamos la WebView
// porque iOS WKWebView suele dejarla en estado inutilizable (timers congelados,
// memoria recortada). Por debajo del umbral basta con reconectar Firestore.
const HARD_RELOAD_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutos

/**
 * En iOS, cuando el usuario bloquea el celular o pasa a otra app por bastante
 * tiempo, WKWebView pausa la ejecución y rompe las conexiones de Firestore.
 * Al volver al foreground los listeners (onSnapshot) quedan colgados y la app
 * se ve "vacía" hasta que el usuario la cierra y la vuelve a abrir.
 *
 * Este componente detecta ese resume y:
 *   - si fue una pausa corta → fuerza reconexión a Firestore.
 *   - si fue larga → recarga la WebView (equivalente a relanzar la app).
 */
export default function AppLifecycleManager() {
  const backgroundedAtRef = useRef(null)
  const reconnectingRef = useRef(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (Capacitor.getPlatform() !== 'ios') return

    const reconnectFirestore = async () => {
      if (reconnectingRef.current) return
      reconnectingRef.current = true
      try {
        await disableNetwork(db)
        await enableNetwork(db)
        console.log('🔄 Firestore reconectado tras resume')
      } catch (error) {
        console.warn('⚠️ Error reconectando Firestore:', error)
      } finally {
        reconnectingRef.current = false
      }
    }

    const handleResume = async () => {
      const backgroundedAt = backgroundedAtRef.current
      backgroundedAtRef.current = null

      if (!backgroundedAt) return

      const elapsed = Date.now() - backgroundedAt
      console.log(`📱 App resumed tras ${Math.round(elapsed / 1000)}s en background`)

      if (elapsed >= HARD_RELOAD_THRESHOLD_MS) {
        // Pausa larga: la WebView puede estar en estado inconsistente.
        // Recargar es más confiable que intentar revivir conexiones.
        window.location.reload()
        return
      }

      await reconnectFirestore()
    }

    let stateChangeHandle
    let resumeHandle

    const register = async () => {
      stateChangeHandle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          handleResume()
        } else {
          backgroundedAtRef.current = Date.now()
        }
      })

      // Algunos dispositivos disparan 'resume' sin appStateChange tras un wake.
      resumeHandle = await CapacitorApp.addListener('resume', () => {
        if (backgroundedAtRef.current) handleResume()
      })
    }

    register()

    // Respaldo: si iOS sirvió la página desde page cache (bfcache) tras un
    // memory purge, persisted=true. Recargar para asegurar estado limpio.
    const handlePageShow = (event) => {
      if (event.persisted) {
        console.log('🔄 pageshow persisted=true → recargando')
        window.location.reload()
      }
    }
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      stateChangeHandle?.remove?.()
      resumeHandle?.remove?.()
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  return null
}
