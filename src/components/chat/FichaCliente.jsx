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
import { useAuth } from '@/contexts/AuthContext'
import { Modal, Campo, Entrada, Selector, Boton, ListaDatos, Dato, Aviso } from '@/components/admin/ui'
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

/** Por donde emite la cuenta. Es la primera pregunta cuando "no puede facturar". */
const ETIQUETA_EMISION = {
  qpse: 'QPse',
  sunat_direct: 'SUNAT directo',
  none: 'Sin emisión',
}

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
  const { isAdmin } = useAuth()
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
    if (dias <= 7) return { texto: `Vence en ${dias} día${dias === 1 ? '' : 's'} (${fecha})`, clase: 'bg-red-50 text-red-700 border-red-200' }
    return { texto: `Vence el ${fecha}`, clase: 'bg-primary-50 text-primary-700 border-primary-200' }
  }

  return (
    <aside className="w-full sm:w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-[13px]">Ficha del cliente</h3>
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
              <p className="text-[13px] font-medium text-gray-700">No es un cliente conocido</p>
              <p className="text-[11.5px] text-gray-500 mt-1 max-w-[24ch] mx-auto">
                Su número no coincide con ningún negocio de Cobrify. Es un lead —
                o un cliente escribiendo desde otro número.
              </p>
            </div>

            <div className="mt-3">
              <label className="text-[12px] font-medium text-gray-700">
                Vincular a un negocio
              </label>
              <div className="relative mt-1.5">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={buscando}
                  onChange={(e) => setBuscando(e.target.value)}
                  placeholder="Nombre del negocio"
                  className="w-full pl-9 pr-3 py-2 text-[13px] bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                      className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors"
                    >
                      <p className="text-[13px] font-medium text-gray-800 truncate">{r.nombre}</p>
                      {r.ruc && <p className="text-[11.5px] text-gray-400">RUC {r.ruc}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- Con vínculo: la ficha ---------- */}
        {businessId && cargando && (
          <p className="text-[13px] text-gray-500 py-4 text-center">Cargando ficha...</p>
        )}

        {businessId && !cargando && ficha && (
          <div className="space-y-4">
            <div>
              <p className="text-[14px] font-semibold text-gray-900 leading-snug">{ficha.nombre || 'Negocio'}</p>
              <p className="text-[11.5px] text-gray-500 mt-0.5">
                {[ficha.ruc && `RUC ${ficha.ruc}`, ficha.codigoCliente].filter(Boolean).join(' · ') || '—'}
              </p>
              {ficha.email && <p className="text-[11.5px] text-gray-500 truncate">{ficha.email}</p>}
              {conversacion.linkedBy === 'manual' && (
                <p className="text-[11px] text-gray-400 mt-1">Vinculado a mano</p>
              )}
            </div>

            {/* El negocio: a que se dedica y donde. Es lo que evita atender a
                ciegas cuando el cliente escribe sin presentarse. */}
            <ListaDatos>
              <Dato etiqueta="Rubro">
                {ficha.rubro}
                {ficha.rubro && ficha.rubroEsSugerido && <span className="text-gray-400"> (sugerido)</span>}
              </Dato>
              <Dato etiqueta="Modo">{ficha.modo}</Dato>
              <Dato etiqueta="Ubicación">{ficha.ubicacion}</Dato>
              <Dato etiqueta="Emisión">{ETIQUETA_EMISION[ficha.emision] || 'Sin emisión'}</Dato>
              <Dato etiqueta="Origen">
                {ficha.origenNombre || (ficha.origen === 'directo' ? 'Directo de Cobrify' : '—')}
              </Dato>
              <Dato etiqueta="Cliente desde">
                {ficha.alta ? ficha.alta.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' }) : null}
              </Dato>
            </ListaDatos>

            <ListaDatos>
              <Dato etiqueta="Plan">{ficha.planName}</Dato>
              {ficha.renewalPrice != null && (
                <Dato etiqueta="Precio pactado">S/ {Number(ficha.renewalPrice).toFixed(2)}</Dato>
              )}
            </ListaDatos>

            {ficha.accessBlocked && (
              <Aviso tono="rojo" titulo="Cuenta suspendida">
                {ficha.motivoBloqueo && <p>Motivo: {ficha.motivoBloqueo}</p>}
                {ficha.bloqueadoEl && (
                  <p>Desde el {ficha.bloqueadoEl.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                )}
              </Aviso>
            )}

            {vencimiento() && (
              <div className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 ${vencimiento().clase}`}>
                <CalendarClock className="w-4 h-4 flex-none" />
                <span className="text-[13px] font-medium">{vencimiento().texto}</span>
              </div>
            )}

            {/* Comprobantes del mes: es lo primero que pregunta un cliente
                que llama porque "no puede facturar". */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[12px] font-medium text-gray-700 mb-1.5">
                Comprobantes de este mes
              </p>
              {ficha.topeComprobantes === null || ficha.topeComprobantes < 0 ? (
                <p className="text-[13px] text-gray-700">
                  Ilimitados <span className="text-gray-400">({ficha.emitidosEsteMes} emitidos)</span>
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] text-gray-800">
                      <span className="font-semibold">{ficha.emitidosEsteMes}</span> de {ficha.topeComprobantes}
                    </span>
                    <span className={`text-[11.5px] font-medium ${
                      ficha.topeComprobantes - ficha.emitidosEsteMes < 50 ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      quedan {Math.max(0, ficha.topeComprobantes - ficha.emitidosEsteMes)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        ficha.emitidosEsteMes >= ficha.topeComprobantes ? 'bg-red-500' : 'bg-primary-600'
                      }`}
                      style={{ width: `${Math.min(100, (ficha.emitidosEsteMes / Math.max(1, ficha.topeComprobantes)) * 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={() => setComprobantesAbierto(true)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-300"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    Agregar 500 comprobantes
                  </button>
                </>
              )}
            </div>

            {ficha.pagos.length > 0 && (
              <div>
                <p className="text-[12px] font-medium text-gray-700 mb-1.5">
                  {verTodosLosPagos ? `Pagos (${ficha.pagos.length})` : 'Últimos pagos'}
                </p>
                <div className="space-y-1.5">
                  {(verTodosLosPagos ? ficha.pagos : ficha.pagos.slice(0, 3)).map((pg, i) => (
                    <div key={i} className="flex items-center justify-between text-[13px] gap-2">
                      <span className="text-gray-500 text-[11.5px] flex-none">
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
                    className="mt-2 text-[11.5px] font-medium text-primary-700 hover:text-primary-800"
                  >
                    {verTodosLosPagos
                      ? 'Ver solo los últimos'
                      : `Ver los ${ficha.pagos.length} pagos · S/ ${totalPagado(ficha.pagos).toFixed(2)} en total`}
                  </button>
                )}
              </div>
            )}

            {ficha.notasAdmin && (
              <Aviso titulo="Nota del equipo">{ficha.notasAdmin}</Aviso>
            )}

            {/* Lo que no cabe en 320 px: sucursales, sub-usuarios, historial,
                funciones. Se abre en otra pestaña a proposito — quien lo mira
                esta atendiendo una conversacion y no puede perderla de vista.
                Solo para admins: la ruta del panel los exige, y un enlace que
                lleva a un muro es peor que no tenerlo. */}
            {isAdmin && (
              <a
                href={`/app/admin/users/${ficha.businessId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-center text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Ver ficha completa ↗
              </a>
            )}

            <button
              onClick={() => setRenovarAbierto(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-[13px] font-medium rounded-md hover:bg-primary-700 transition-colors"
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
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 text-[13px] font-medium rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                Reactivar acceso
              </button>
            ) : (
              <button
                onClick={handleSuspender}
                disabled={trabajando}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-[11.5px] font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
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
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-[11.5px] text-gray-400 hover:text-red-500 transition-colors"
            >
              <Link2Off className="w-3.5 h-3.5" />
              Desvincular
            </button>
          </div>
        )}

        {businessId && !cargando && !ficha && (
          <div className="text-center py-6">
            <Link2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-[13px] text-gray-500">El negocio vinculado ya no existe.</p>
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
    <Modal
      titulo="Registrar renovación"
      subtitulo={ficha.nombre}
      ancho="sm"
      onClose={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar} disabled={procesando}>Cancelar</Boton>
          <Boton
            variante="primario"
            onClick={confirmar}
            disabled={procesando || !(parseFloat(monto) > 0)}
          >
            {procesando ? 'Registrando…' : `Registrar S/ ${Number(parseFloat(monto) || 0).toFixed(2)}`}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md bg-gray-50 px-3 py-2 text-gray-700">
          {ficha.planName}
          {planCatalogo?.months ? ` — ${planCatalogo.months} mes${planCatalogo.months === 1 ? '' : 'es'}` : ''}
        </div>

        <Campo
          etiqueta="Monto cobrado (S/)"
          error={Math.abs(parseFloat(monto || 0) - montoSugerido) > 0.01
            ? `Su precio pactado es S/ ${Number(montoSugerido).toFixed(2)}. Cobrar distinto no lo cambia: eso se hace en el panel.`
            : undefined}
        >
          <Entrada type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>

        <Campo etiqueta="Método">
          <Selector value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODOS.map((m) => <option key={m}>{m}</option>)}
          </Selector>
        </Campo>
      </div>
    </Modal>
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
    <Modal
      titulo="Reactivar acceso"
      subtitulo={`Le devuelve el acceso a ${ficha.nombre || 'este negocio'} sin cobrarle. Son días de gracia.`}
      ancho="sm"
      onClose={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={guardar} disabled={guardando}>
            {guardando ? 'Reactivando…' : 'Reactivar'}
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-2">
        {[7, 15, 30, 60].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDias(d)}
            className={`h-8 rounded-md border text-[12.5px] font-medium transition-colors ${
              dias === d
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {d} d
          </button>
        ))}
      </div>

      <p className="mt-3 text-gray-500">
        Nuevo vencimiento:{' '}
        <span className="font-medium text-gray-900">
          {nuevoVence.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
      </p>
    </Modal>
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

  const guardar = async () => {
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
    <Modal
      titulo="Agregar 500 comprobantes"
      subtitulo={`El tope del mes pasa de ${ficha.topeComprobantes} a ${ficha.topeComprobantes + 500}. El plan y el vencimiento no cambian.`}
      ancho="sm"
      onClose={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Agregar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo etiqueta="Monto cobrado (S/)">
          <Entrada type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
        <Campo etiqueta="Método">
          <Selector value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Selector>
        </Campo>
      </div>
    </Modal>
  )
}
