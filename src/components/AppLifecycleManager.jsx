import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()

  // Tap en push notification → según lo que traiga la data del push.
  // notificationService.js dispara este evento global desde el listener de
  // pushNotificationActionPerformed (que vive fuera de React Router).
  useEffect(() => {
    const handleTap = async (e) => {
      const data = e?.detail || {}

      // Campaña de calificación: abrir el diálogo NATIVO de reseña (el mismo que
      // usa ReviewPrompt). Es mucho mejor que mandar a la tienda: el usuario
      // califica sin salir de la app. Si el plugin falla, se cae a la tienda.
      if (data.action === 'review') {
        try {
          const { InAppReview } = await import('@capacitor-community/in-app-review')
          await InAppReview.requestReview()
        } catch (error) {
          // Fallback a la ficha real de cada tienda (las mismas URLs que usan
          // ReviewPrompt y la landing).
          console.error('In-app review error:', error)
          const store = Capacitor.getPlatform() === 'ios'
            ? 'https://apps.apple.com/pe/app/cobrify-peru/id6756195760'
            : 'https://play.google.com/store/apps/details?id=com.factuya.cobrify'
          window.open(store, '_blank')
        }
        return
      }

      // Enlace externo (promos, landing, formulario...)
      if (data.action === 'url' && data.actionUrl) {
        window.open(data.actionUrl, '_blank')
        return
      }

      // Navegación interna de siempre
      if (data.redirectPath) navigate(data.redirectPath)
    }
    window.addEventListener('cobrify:notification-tap', handleTap)
    return () => window.removeEventListener('cobrify:notification-tap', handleTap)
  }, [navigate])

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
