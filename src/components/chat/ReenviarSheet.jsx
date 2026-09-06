import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { formatearNumero } from '@/services/whatsappChatService'

/**
 * A quién reenviar. Se pueden marcar varias conversaciones.
 *
 * Las que tienen la ventana de 24 h cerrada salen apagadas: WhatsApp no
 * aceptaría el archivo y es mejor decirlo antes que fallar después.
 */
export default function ReenviarSheet({ conversaciones, onCerrar, onEnviar }) {
  const [busqueda, setBusqueda] = useState('')
  const [elegidas, setElegidas] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const ventanaCerrada = (c) => {
    const vence = c.ventanaVenceAt?.toDate?.()
    return !vence || vence.getTime() <= Date.now()
  }

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return conversaciones
    return conversaciones.filter((c) => (
      (c.nombre || '').toLowerCase().includes(q)
      || (c.waId || '').includes(q)
      || (c.linkedBusinessName || '').toLowerCase().includes(q)
    ))
  }, [conversaciones, busqueda])

  const alternar = (id) => {
    setElegidas((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
  }

  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      await onEnviar(elegidas)
    } catch (e) {
      setError(e.message || 'No se pudo reenviar.')
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onCerrar}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Reenviar a…</h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-gray-100">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar conversación"
              className="w-full pl-9 pr-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtradas.map((c) => {
            const cerrada = ventanaCerrada(c)
            const marcada = elegidas.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                disabled={cerrada || enviando}
                onClick={() => alternar(c.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 ${cerrada ? 'opacity-50' : ''}`}
              >
                <span className="w-9 h-9 rounded-full bg-gray-200 grid place-items-center text-gray-600 text-[13px] font-semibold flex-none">
                  {(c.nombre || '#').trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-gray-900 truncate">
                    {c.nombre || formatearNumero(c.waId)}
                  </span>
                  <span className={`block text-[11.5px] truncate ${cerrada ? 'text-orange-500' : 'text-gray-500'}`}>
                    {cerrada ? 'Ventana cerrada' : (c.linkedBusinessName || formatearNumero(c.waId))}
                  </span>
                </span>
                <span
                  className={`w-5 h-5 rounded-full border grid place-items-center flex-none ${
                    marcada ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300'
                  }`}
                >
                  {marcada && <Check className="w-3 h-3" />}
                </span>
              </button>
            )
          })}
          {filtradas.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-gray-400">Ninguna conversación con ese nombre.</p>
          )}
        </div>

        {error && <p className="px-5 py-2 text-[12.5px] text-red-600 border-t border-gray-100">{error}</p>}

        {elegidas.length > 0 && (
          <div className="p-3 border-t border-gray-200">
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="w-full py-2.5 rounded-xl bg-primary-600 text-white font-semibold text-[14px] disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : `Enviar a ${elegidas.length}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
