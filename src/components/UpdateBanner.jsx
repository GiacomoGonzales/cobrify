import { RefreshCw, X } from 'lucide-react'
import { useActualizacion } from '@/contexts/ActualizacionContext'

/**
 * La franja de "actualiza la app desde la tienda" — SOLO para Android/iPhone.
 *
 * La versión web se avisa en el pie del menú (`AvisoDeActualizacion`) y no
 * interrumpe: se despliega varias veces al día y una franja para cada deploy
 * era puro ruido.
 *
 * La de la tienda es otra cosa. Pasan días o semanas entre una versión y la
 * siguiente, y mientras tanto la persona está corriendo código viejo de verdad
 * —no una compilación de hace dos horas—. Eso sí merece que se vea de una, así
 * que conserva su franja. Se puede cerrar y no vuelve hasta la próxima vez que
 * abra la app.
 */
export default function UpdateBanner() {
  const { franjaDeTienda, plataformaTienda, actualizar, descartarTienda } = useActualizacion()
  if (!franjaDeTienda) return null

  return (
    <div className="bg-blue-50 border-b-2 border-blue-300 px-3 sm:px-4 py-2 flex-shrink-0">
      <div className="flex items-center gap-2 sm:gap-3">
        <RefreshCw className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-sm text-blue-900">
          <span className="font-semibold">Nueva versión disponible.</span>{' '}
          <span className="hidden sm:inline text-blue-700">
            Actualiza la app desde la tienda para recibir las mejoras.
          </span>
        </div>
        <button
          onClick={actualizar}
          className="flex-shrink-0 bg-blue-600 text-white text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {plataformaTienda === 'ios' ? 'Abrir App Store' : 'Abrir Play Store'}
        </button>
        <button
          onClick={descartarTienda}
          className="flex-shrink-0 text-blue-400 hover:text-blue-600 transition-colors"
          title="Recordar después"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
