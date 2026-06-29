import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

export default function UpdatePrompt() {
  // Guardamos la registración del SW para poder pedir update() desde otros efectos
  // (al volver el foco a la PWA instalada, etc.).
  const swRegistrationRef = useRef(null)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      swRegistrationRef.current = r || null
      if (r) {
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

  // Buscar actualizaciones cuando el usuario vuelve a la app (foco / pestaña visible).
  // CLAVE para la PWA instalada de escritorio: como se queda abierta días, así detecta
  // un deploy nuevo apenas el usuario la usa, sin esperar al intervalo. Junto con los
  // headers no-cache de sw.js (vercel.json), garantiza que el banner aparezca.
  useEffect(() => {
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

  const close = () => {
    setNeedRefresh(false)
  }

  const handleUpdate = () => {
    // Activa el SW en espera (skipWaiting) y recarga al tomar control.
    // Fallback: si controllerchange no dispara en la PWA instalada de escritorio,
    // recargamos igual a los 3s para asegurar que se aplique la versión nueva.
    setTimeout(() => {
      window.location.reload()
    }, 3000)
    updateServiceWorker(true)
  }

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[9999] animate-in slide-in-from-bottom-4">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl shadow-2xl p-4 border border-blue-500">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 bg-white/20 rounded-full p-2">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">Nueva versión disponible</h3>
            <p className="text-blue-100 text-xs mt-0.5">
              Hay mejoras y correcciones listas para instalar
            </p>
          </div>
          <button
            onClick={close}
            className="flex-shrink-0 text-blue-200 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleUpdate}
            className="flex-1 bg-white text-blue-600 font-medium text-sm py-2 px-4 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Actualizar ahora
          </button>
          <button
            onClick={close}
            className="px-4 py-2 text-sm text-blue-100 hover:text-white transition-colors"
          >
            Después
          </button>
        </div>
      </div>
    </div>
  )
}
