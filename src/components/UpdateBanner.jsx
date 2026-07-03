import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const isNative = Capacitor.isNativePlatform()

/**
 * Banner de actualización INTEGRADO (no flotante): barra fija bajo el Navbar,
 * estilo WhatsApp Web. Reemplaza al viejo UpdatePrompt (toast flotante).
 *
 * - Web / PWA instalada: detecta la versión nueva vía service worker (chequeo
 *   cada 30 min + al volver el foco). "Reiniciar para actualizar" espera el
 *   evento REAL de cambio de control del SW antes de recargar (nada de timers
 *   ciegos); si en 8s no tomó control, fallback duro: desregistra el SW, borra
 *   cachés y recarga — el equivalente a "desinstalar y reinstalar" en un clic.
 * - App nativa (Android/iOS): compara su versión (App.getInfo().build) contra
 *   `appConfig/version` en Firestore y ofrece abrir la tienda. El doc se
 *   actualiza al publicar cada AAB/IPA.
 */
export default function UpdateBanner() {
  const swRegistrationRef = useRef(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // Update de tienda (solo app nativa): { build, url, platform }
  const [storeUpdate, setStoreUpdate] = useState(null)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      swRegistrationRef.current = r || null
      if (r && !isNative) {
        // Chequeo periódico de actualizaciones (cada 30 min).
        setInterval(() => {
          r.update().catch(() => {})
        }, 30 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error)
    },
  })

  // Buscar actualizaciones cuando el usuario vuelve a la app (foco / pestaña
  // visible). CLAVE para la PWA instalada de escritorio: como se queda abierta
  // días, así detecta un deploy nuevo apenas el usuario la usa.
  useEffect(() => {
    if (isNative) return
    const check = () => {
      if (document.visibilityState !== 'visible') return
      const reg = swRegistrationRef.current
      if (reg) reg.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    check()
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  // App nativa: comparar la versión instalada contra appConfig/version
  // (al abrir y cada vez que la app vuelve a primer plano).
  useEffect(() => {
    if (!isNative) return
    let cancelled = false
    const check = async () => {
      try {
        const [info, snap] = await Promise.all([
          CapApp.getInfo(),
          getDoc(doc(db, 'appConfig', 'version')),
        ])
        if (cancelled || !snap.exists()) return
        const cfg = snap.data()
        const platform = Capacitor.getPlatform() // 'android' | 'ios'
        const latest = Number(platform === 'ios' ? cfg.iosBuild : cfg.androidBuild) || 0
        const current = Number(info.build) || 0
        if (latest > current) {
          // No volver a molestar en esta sesión si ya lo cerró para esta versión
          if (sessionStorage.getItem(`storeUpdateDismissed_${platform}_${latest}`)) return
          const url = platform === 'ios'
            ? (cfg.iosUrl || '')
            : (cfg.androidUrl || `market://details?id=${info.id}`)
          if (url) setStoreUpdate({ build: latest, url, platform })
        }
      } catch (e) {
        console.warn('No se pudo verificar la versión publicada de la app:', e)
      }
    }
    check()
    const listener = CapApp.addListener('resume', check)
    return () => {
      cancelled = true
      Promise.resolve(listener).then(h => h?.remove?.()).catch(() => {})
    }
  }, [])

  // Actualización web/PWA confiable: recargar EXACTAMENTE cuando el SW nuevo
  // toma el control; fallback duro si no lo logra.
  const handleWebUpdate = async () => {
    if (isUpdating) return
    setIsUpdating(true)
    let reloaded = false
    const reloadOnce = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    try {
      navigator.serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true })
    } catch (e) { /* navegador sin SW */ }
    // Fallback duro a los 8s: desregistrar SW + borrar cachés + recargar.
    // Equivale a "desinstalar y volver a instalar" la PWA, pero en un clic.
    setTimeout(async () => {
      if (reloaded) return
      try {
        const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
        await Promise.all(regs.map(r => r.unregister()))
        if (window.caches?.keys) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
      } catch (e) {
        console.warn('Fallback duro de actualización:', e)
      }
      reloadOnce()
    }, 8000)
    try {
      await updateServiceWorker(true)
    } catch (e) {
      console.warn('updateServiceWorker falló, se aplicará el fallback:', e)
    }
  }

  const handleOpenStore = () => {
    if (!storeUpdate?.url) return
    // En Capacitor, navegar a market:// / itms-apps: dispara el intent del sistema
    window.location.href = storeUpdate.url
  }

  const handleDismiss = () => {
    setDismissed(true)
    if (storeUpdate) {
      sessionStorage.setItem(`storeUpdateDismissed_${storeUpdate.platform}_${storeUpdate.build}`, '1')
    }
    if (needRefresh) setNeedRefresh(false)
  }

  const showWeb = !isNative && needRefresh && !dismissed
  const showStore = isNative && !!storeUpdate && !dismissed
  if (!showWeb && !showStore) return null

  return (
    <div className="bg-blue-50 border-b-2 border-blue-300 px-3 sm:px-4 py-2 flex-shrink-0">
      <div className="flex items-center gap-2 sm:gap-3">
        <RefreshCw className={`w-4 h-4 text-blue-600 flex-shrink-0 ${isUpdating ? 'animate-spin' : ''}`} />
        <div className="flex-1 min-w-0 text-sm text-blue-900">
          <span className="font-semibold">Nueva versión disponible.</span>{' '}
          <span className="hidden sm:inline text-blue-700">
            {showStore
              ? 'Actualiza la app desde la tienda para recibir las mejoras.'
              : 'Hay mejoras y correcciones listas para instalar.'}
          </span>
        </div>
        {showWeb && (
          <button
            onClick={handleWebUpdate}
            disabled={isUpdating}
            className="flex-shrink-0 bg-blue-600 text-white text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-70 disabled:cursor-wait transition-colors"
          >
            {isUpdating ? 'Actualizando...' : 'Reiniciar para actualizar'}
          </button>
        )}
        {showStore && (
          <button
            onClick={handleOpenStore}
            className="flex-shrink-0 bg-blue-600 text-white text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {storeUpdate.platform === 'ios' ? 'Abrir App Store' : 'Abrir Play Store'}
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-blue-400 hover:text-blue-600 transition-colors"
          title="Recordar después"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
