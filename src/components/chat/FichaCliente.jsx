import { useState, useEffect } from 'react'
import {
  Building2,
  CalendarClock,
  CreditCard,
  FilePlus2,
  Link2,
  Link2Off,
  Lock,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import {
  obtenerFichaCliente,
  buscarNegocios,
  vincularConversacion,
  desvincularConversacion,
  agregarComprobantes,
} from '@/services/whatsappChatService'
import { registerPayment, suspendUser, reactivateUser, PLANS } from '@/services/subscriptionService'

/** Los mismos métodos de cobro que ofrece el panel. */
const METODOS = ['Yape', 'Plin', 'Transferencia', 'Efectivo', 'Tarjeta']

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
  const [reactivarAbierto, setReactivarAbierto] = useState(false)
  const [comprobantesAbierto, setComprobantesAbierto] = useState(false)
  const [verTodosLosPagos, setVerTodosLosPagos] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  const businessId = conversacion?.linkedBusinessId || null

  useEffect(() => {
    setFicha(null)
    setRenovarAbierto(false)
    setReactivarAbierto(false)
    setComprobantesAbierto(false)
    setVerTodosLosPagos(false)
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

  const releerFicha = () => obtenerFichaCliente(businessId).then(setFicha).catch(() => {})

  const handleSuspender = async () => {
    if (!window.confirm('¿Suspender el acceso de este negocio por falta de pago?')) return
    setTrabajando(true)
    try {
      await suspendUser(businessId, 'Falta de pago')
      await releerFicha()
      toast.success('Acceso suspendido')
    } catch {
      toast.error('No se pudo suspender')
    } finally {
      setTrabajando(false)
    }
  }

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
                <div className="pt-1 border-t border-gray-200">
                  <p className="text-xs font-semibold text-red-600">Cuenta suspendida</p>
                  {ficha.motivoBloqueo && (
                    <p className="text-[11px] text-gray-500 mt-0.5">Motivo: {ficha.motivoBloqueo}</p>
                  )}
                  {ficha.bloqueadoEl && (
                    <p className="text-[11px] text-gray-400">
                      Desde el {ficha.bloqueadoEl.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {vencimiento() && (
              <div className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 ${vencimiento().clase}`}>
                <CalendarClock className="w-4 h-4 flex-none" />
                <span className="text-sm font-medium">{vencimiento().texto}</span>
              </div>
            )}

            {/* Comprobantes del mes: es lo primero que pregunta un cliente
                que llama porque "no puede facturar". */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Comprobantes de este mes
              </p>
              {ficha.topeComprobantes === null || ficha.topeComprobantes < 0 ? (
                <p className="text-sm text-gray-700">
                  Ilimitados <span className="text-gray-400">({ficha.emitidosEsteMes} emitidos)</span>
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-800">
                      <span className="font-semibold">{ficha.emitidosEsteMes}</span> de {ficha.topeComprobantes}
                    </span>
                    <span className={`text-xs font-medium ${
                      ficha.topeComprobantes - ficha.emitidosEsteMes < 50 ? 'text-amber-700' : 'text-gray-400'
                    }`}>
                      quedan {Math.max(0, ficha.topeComprobantes - ficha.emitidosEsteMes)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        ficha.emitidosEsteMes >= ficha.topeComprobantes ? 'bg-red-500' : 'bg-green-600'
                      }`}
                      style={{ width: `${Math.min(100, (ficha.emitidosEsteMes / Math.max(1, ficha.topeComprobantes)) * 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={() => setComprobantesAbierto(true)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-300"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    Agregar 500 comprobantes
                  </button>
                </>
              )}
            </div>

            {ficha.pagos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  {verTodosLosPagos ? `Pagos (${ficha.pagos.length})` : 'Últimos pagos'}
                </p>
                <div className="space-y-1.5">
                  {(verTodosLosPagos ? ficha.pagos : ficha.pagos.slice(0, 3)).map((pg, i) => (
                    <div key={i} className="flex items-center justify-between text-sm gap-2">
                      <span className="text-gray-500 text-xs flex-none">
                        {fechaDePago(pg.date)}
                      </span>
                      <span className="text-gray-700 truncate">{pg.planName || pg.plan}</span>
                      <span className="font-semibold text-gray-900 flex-none">S/ {Number(pg.amount || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                {ficha.pagos.length > 3 && (
                  <button
                    onClick={() => setVerTodosLosPagos((v) => !v)}
                    className="mt-2 text-xs font-medium text-green-700 hover:text-green-800"
                  >
                    {verTodosLosPagos
                      ? 'Ver solo los últimos'
                      : `Ver los ${ficha.pagos.length} pagos · S/ ${totalPagado(ficha.pagos).toFixed(2)} en total`}
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => setRenovarAbierto(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Registrar renovación
            </button>

            {/* Cortar y devolver el acceso. Son las dos acciones que antes
                obligaban a salir del chat y abrir el panel. */}
            {ficha.accessBlocked ? (
              <button
                onClick={() => setReactivarAbierto(true)}
                disabled={trabajando}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                Reactivar acceso
              </button>
            ) : (
              <button
                onClick={handleSuspender}
                disabled={trabajando}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                Suspender acceso
              </button>
            )}

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
            releerFicha()
          }}
        />
      )}

      {reactivarAbierto && ficha && (
        <ModalReactivar
          ficha={ficha}
          onCerrar={() => setReactivarAbierto(false)}
          onListo={() => { setReactivarAbierto(false); releerFicha() }}
        />
      )}

      {comprobantesAbierto && ficha && (
        <ModalComprobantes
          ficha={ficha}
          onCerrar={() => setComprobantesAbierto(false)}
          onListo={() => { setComprobantesAbierto(false); releerFicha() }}
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

/** La fecha de un pago llega como texto ISO o como marca de Firestore. */
function fechaDePago(fecha) {
  const d = fecha?.toDate?.() || (typeof fecha === 'string' ? new Date(fecha) : null)
  if (!d || Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })
}

const totalPagado = (pagos) => pagos.reduce((t, p) => t + (Number(p.amount) || 0), 0)

/**
 * Devolver el acceso sin cobrar: son días de gracia, no una renovación. Por eso
 * no toca el historial de pagos ni el precio pactado — si el cliente después
 * paga, se registra la renovación aparte.
 */
function ModalReactivar({ ficha, onCerrar, onListo }) {
  const toast = useToast()
  const [dias, setDias] = useState(7)
  const [guardando, setGuardando] = useState(false)

  const base = ficha.vence && ficha.vence > new Date() ? ficha.vence : new Date()
  const nuevoVence = new Date(base)
  nuevoVence.setDate(nuevoVence.getDate() + dias)

  const guardar = async () => {
    setGuardando(true)
    try {
      await reactivateUser(ficha.businessId, dias)
      toast.success(`Acceso devuelto por ${dias} días`)
      onListo()
    } catch {
      toast.error('No se pudo reactivar')
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900">Reactivar acceso</h3>
        <p className="text-xs text-gray-500 mt-1">
          Le devuelve el acceso a {ficha.nombre || 'este negocio'} sin cobrarle. Son días de gracia.
        </p>

        <div className="grid grid-cols-4 gap-2 mt-4">
          {[7, 15, 30, 60].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                dias === d
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
              }`}
            >
              {d} d
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Nuevo vencimiento:{' '}
          <span className="font-semibold text-gray-800">
            {nuevoVence.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
        </p>

        <div className="flex gap-2 mt-5">
          <button onClick={onCerrar} className="flex-1 py-2.5 text-sm font-medium text-gray-600 rounded-xl border border-gray-200 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50"
          >
            {guardando ? 'Reactivando...' : 'Reactivar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Vender 500 comprobantes sueltos. No cambia el plan ni el vencimiento: solo
 * sube el tope del mes y deja el cobro anotado en el historial.
 */
function ModalComprobantes({ ficha, onCerrar, onListo }) {
  const toast = useToast()
  const [monto, setMonto] = useState('10')
  const [metodo, setMetodo] = useState('Yape')
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const nuevoTope = await agregarComprobantes(ficha.businessId, Number(monto), metodo)
      toast.success(`Ahora puede emitir ${nuevoTope} al mes`)
      onListo()
    } catch (error) {
      toast.error(error.message || 'No se pudo agregar')
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <form onSubmit={guardar} className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900">Agregar 500 comprobantes</h3>
        <p className="text-xs text-gray-500 mt-1">
          El tope del mes pasa de {ficha.topeComprobantes} a {ficha.topeComprobantes + 500}.
          El plan y el vencimiento no cambian.
        </p>

        <label className="block mt-4">
          <span className="text-xs font-medium text-gray-600">Monto cobrado</span>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-gray-400">S/</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </label>

        <label className="block mt-3">
          <span className="text-xs font-medium text-gray-600">Método</span>
          <select
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCerrar} className="flex-1 py-2.5 text-sm font-medium text-gray-600 rounded-xl border border-gray-200 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  )
}
