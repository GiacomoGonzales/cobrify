import { useState, useEffect } from 'react'
import {
  Building2,
  CalendarClock,
  CreditCard,
  Link2,
  Link2Off,
  Search,
  X,
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import {
  obtenerFichaCliente,
  buscarNegocios,
  vincularConversacion,
  desvincularConversacion,
} from '@/services/whatsappChatService'
import { registerPayment, PLANS } from '@/services/subscriptionService'

/**
 * Ficha del cliente al costado de la conversación (Fase 2 del CRM).
 *
 * La ventaja que WhatsApp Business no puede tener: saber quién escribe. Si la
 * conversación está vinculada muestra plan, vencimiento y pagos, y deja
 * renovar ahí mismo. Si no, ofrece vincularla a mano — el que escribe desde
 * otro número sigue siendo cliente aunque el cruce automático no lo vea.
 */
export default function FichaCliente({ conversacion, onCerrar }) {
  const toast = useToast()
  const [ficha, setFicha] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [buscando, setBuscando] = useState('')
  const [resultados, setResultados] = useState([])
  const [renovarAbierto, setRenovarAbierto] = useState(false)

  const businessId = conversacion?.linkedBusinessId || null

  useEffect(() => {
    setFicha(null)
    setRenovarAbierto(false)
    if (!businessId) return
    setCargando(true)
    obtenerFichaCliente(businessId)
      .then(setFicha)
      .catch(() => toast.error('No se pudo cargar la ficha del cliente'))
      .finally(() => setCargando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, conversacion?.id])

  // Búsqueda para la vinculación manual, con una pausa para no consultar
  // en cada tecla.
  useEffect(() => {
    if (buscando.trim().length < 2) { setResultados([]); return undefined }
    const t = setTimeout(() => {
      buscarNegocios(buscando).then(setResultados).catch(() => setResultados([]))
    }, 350)
    return () => clearTimeout(t)
  }, [buscando])

  const vencimiento = () => {
    if (!ficha?.vence) return null
    const dias = ficha.diasParaVencer
    const fecha = ficha.vence.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    if (dias < 0) return { texto: `Venció el ${fecha}`, clase: 'bg-red-50 text-red-700 border-red-200' }
    if (dias <= 7) return { texto: `Vence en ${dias} día${dias === 1 ? '' : 's'} (${fecha})`, clase: 'bg-amber-50 text-amber-800 border-amber-200' }
    return { texto: `Vence el ${fecha}`, clase: 'bg-green-50 text-green-700 border-green-200' }
  }

  return (
    <aside className="w-full sm:w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-sm">Ficha del cliente</h3>
        <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar ficha">
          <X className="w-4.5 h-4.5 w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* ---------- Sin vínculo: es un lead, o hay que vincular a mano ---------- */}
        {!businessId && (
          <div>
            <div className="text-center py-4">
              <Building2 className="w-9 h-9 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700">No es un cliente conocido</p>
              <p className="text-xs text-gray-500 mt-1 max-w-[24ch] mx-auto">
                Su número no coincide con ningún negocio de Cobrify. Es un lead —
                o un cliente escribiendo desde otro número.
              </p>
            </div>

            <div className="mt-3">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Vincular a un negocio
              </label>
              <div className="relative mt-1.5">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={buscando}
                  onChange={(e) => setBuscando(e.target.value)}
                  placeholder="Nombre del negocio"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              {resultados.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                  {resultados.map((r) => (
                    <button
                      key={r.businessId}
                      onClick={async () => {
                        try {
                          await vincularConversacion(conversacion.id, r.businessId, r.nombre)
                          setBuscando('')
                          toast.success(`Vinculada a ${r.nombre}`)
                        } catch {
                          toast.error('No se pudo vincular')
                        }
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-green-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-800 truncate">{r.nombre}</p>
                      {r.ruc && <p className="text-xs text-gray-400">RUC {r.ruc}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- Con vínculo: la ficha ---------- */}
        {businessId && cargando && (
          <p className="text-sm text-gray-500 py-4 text-center">Cargando ficha...</p>
        )}

        {businessId && !cargando && ficha && (
          <div className="space-y-4">
            <div>
              <p className="font-bold text-gray-900 leading-snug">{ficha.nombre || 'Negocio'}</p>
              {ficha.ruc && <p className="text-xs text-gray-500 mt-0.5">RUC {ficha.ruc}</p>}
              {ficha.email && <p className="text-xs text-gray-500 truncate">{ficha.email}</p>}
              {conversacion.linkedBy === 'manual' && (
                <p className="text-[11px] text-gray-400 mt-1">Vinculado a mano</p>
              )}
            </div>

            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Plan</span>
                <span className="text-sm font-semibold text-gray-800">{ficha.planName || '-'}</span>
              </div>
              {ficha.renewalPrice != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Precio pactado</span>
                  <span className="text-sm font-semibold text-gray-800">S/ {Number(ficha.renewalPrice).toFixed(2)}</span>
                </div>
              )}
              {ficha.accessBlocked && (
                <p className="text-xs font-semibold text-red-600">Cuenta suspendida</p>
              )}
            </div>

            {vencimiento() && (
              <div className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 ${vencimiento().clase}`}>
                <CalendarClock className="w-4 h-4 flex-none" />
                <span className="text-sm font-medium">{vencimiento().texto}</span>
              </div>
            )}

            {ficha.pagos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Últimos pagos
                </p>
                <div className="space-y-1.5">
                  {ficha.pagos.map((pg, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 text-xs">
                        {pg.date?.toDate?.()?.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) || '-'}
                      </span>
                      <span className="text-gray-700">{pg.planName || pg.plan}</span>
                      <span className="font-semibold text-gray-900">S/ {Number(pg.amount || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setRenovarAbierto(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Registrar renovación
            </button>

            <button
              onClick={async () => {
                try {
                  await desvincularConversacion(conversacion.id)
                  toast.success('Conversación desvinculada')
                } catch {
                  toast.error('No se pudo desvincular')
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <Link2Off className="w-3.5 h-3.5" />
              Desvincular
            </button>
          </div>
        )}

        {businessId && !cargando && !ficha && (
          <div className="text-center py-6">
            <Link2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">El negocio vinculado ya no existe.</p>
          </div>
        )}
      </div>

      {renovarAbierto && ficha && (
        <ModalRenovar
          ficha={ficha}
          onCerrar={() => setRenovarAbierto(false)}
          onRenovado={() => {
            setRenovarAbierto(false)
            // Releer la ficha para que el vencimiento nuevo se vea al instante.
            obtenerFichaCliente(businessId).then(setFicha).catch(() => {})
          }}
        />
      )}
    </aside>
  )
}

/**
 * Renovación desde el chat. Usa registerPayment del servicio — LA MISMA
 * función que el panel de administración, con sus mismas reglas: renovar el
 * mismo plan conserva límites y precio pactado. Acá no se decide nada nuevo.
 */
function ModalRenovar({ ficha, onCerrar, onRenovado }) {
  const toast = useToast()
  const planCatalogo = PLANS[ficha.plan]
  const montoSugerido = ficha.renewalPrice ?? planCatalogo?.totalPrice ?? 0
  const [monto, setMonto] = useState(montoSugerido)
  const [metodo, setMetodo] = useState('Yape')
  const [procesando, setProcesando] = useState(false)

  const confirmar = async () => {
    setProcesando(true)
    try {
      const r = await registerPayment(ficha.businessId, parseFloat(monto) || 0, metodo, ficha.plan)
      toast.success(
        r?.newPeriodEnd
          ? `Renovado. Nuevo vencimiento: ${r.newPeriodEnd.toLocaleDateString('es-PE')}`
          : 'Pago registrado',
      )
      onRenovado()
    } catch (error) {
      toast.error(error.message || 'No se pudo registrar el pago')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">Registrar renovación</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{ficha.nombre}</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
            {ficha.planName}
            {planCatalogo?.months ? ` — ${planCatalogo.months} mes${planCatalogo.months === 1 ? '' : 'es'}` : ''}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Monto cobrado (S/)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-lg font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {Math.abs(parseFloat(monto || 0) - montoSugerido) > 0.01 && (
              <p className="text-xs text-amber-600 mt-1">
                Su precio pactado es S/ {Number(montoSugerido).toFixed(2)}. El precio pactado no
                cambia por cobrar distinto: para eso está el panel de administración.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Método</label>
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              <option>Yape</option>
              <option>Plin</option>
              <option>Transferencia</option>
              <option>Efectivo</option>
              <option>Tarjeta</option>
            </select>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            disabled={procesando}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={procesando || !(parseFloat(monto) > 0)}
            className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {procesando ? 'Registrando...' : `Registrar S/ ${Number(parseFloat(monto) || 0).toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
