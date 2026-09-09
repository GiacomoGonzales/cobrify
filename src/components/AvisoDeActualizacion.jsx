import { RefreshCw } from 'lucide-react'
import { useActualizacion } from '@/contexts/ActualizacionContext'

/**
 * "Hay una versión nueva", en el pie del menú lateral.
 *
 * Va pegado al número de versión a propósito: es el lugar donde alguien mira
 * para saber qué copia tiene corriendo, así que es donde espera enterarse de
 * que hay otra. No tapa la pantalla, no empuja el contenido y no hay que
 * cerrarlo: se queda quieto hasta que la persona decida actualizar.
 *
 * Reemplaza a la franja azul que salía debajo del Navbar. Con varios deploys
 * por día, esa franja aparecía todo el tiempo y terminaba siendo ruido
 * (ver src/contexts/ActualizacionContext.jsx).
 *
 * @param {boolean} soloIcono  menú colapsado: entra el ícono y nada más.
 */
export default function AvisoDeActualizacion({ soloIcono = false, className = '' }) {
  const { hay, tipo, actualizando, actualizar } = useActualizacion()
  if (!hay) return null

  const texto = tipo === 'tienda' ? 'Actualizar la app' : 'Actualizar Cobrify'
  const detalle = tipo === 'tienda'
    ? 'Hay una versión nueva en la tienda'
    : 'Se recargará la página para instalarla'

  if (soloIcono) {
    return (
      <button
        onClick={actualizar}
        disabled={actualizando}
        title={`${texto}. ${detalle}.`}
        className={`mx-auto flex items-center justify-center w-9 h-9 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors ${className}`}
      >
        <RefreshCw className={`w-4 h-4 ${actualizando ? 'animate-spin' : ''}`} />
      </button>
    )
  }

  return (
    <button
      onClick={actualizar}
      disabled={actualizando}
      title={detalle}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-primary-200 bg-primary-50/60 text-left hover:bg-primary-50 disabled:opacity-70 disabled:cursor-wait transition-colors ${className}`}
    >
      <RefreshCw className={`w-4 h-4 flex-shrink-0 text-primary-600 ${actualizando ? 'animate-spin' : ''}`} />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-primary-900 truncate">
          {actualizando ? 'Actualizando...' : texto}
        </span>
        {/* Sin `truncate`: en el menú entran dos líneas cortas, y media frase
            con puntos suspensivos no dice nada. */}
        <span className="block text-[11px] leading-snug text-primary-700/70">{detalle}</span>
      </span>
    </button>
  )
}
