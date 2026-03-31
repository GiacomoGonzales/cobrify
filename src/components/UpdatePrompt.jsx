import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Verificar actualizaciones cada hora
      if (r) {
        setInterval(() => {
          r.update()
        }, 60 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error)
    },
  })

  const close = () => {
    setNeedRefresh(false)
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
            onClick={() => updateServiceWorker(true)}
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
