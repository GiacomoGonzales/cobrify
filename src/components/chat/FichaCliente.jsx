import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CreditCard,
  FilePlus2,
  FileText,
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
  cuentasDeLaConversacion,
  agregarCuentaAlContacto,
  quitarCuentaDelContacto,
  sugerirCuentasDelContacto,
  buscarNegocios,
  vincularConversacion,
  desvincularConversacion,
  guardarRolDelContacto,
  otrosContactosDelNegocio,
  agregarComprobantes,
  formatearNumero,
} from '@/services/whatsappChatService'
import { registerPayment, suspendUser, reactivateUser, PLANS } from '@/services/subscriptionService'
import { METODOS_DE_COBRO as METODOS } from '@/services/comprobanteChatService'
import ModalEmitirComprobante from '@/components/chat/EmitirComprobante'

/**
 * La segunda línea de un resultado de búsqueda: lo que permite distinguir dos
 * negocios de nombre parecido sin abrir ninguno.
 */
const detalleDelNegocio = (n) =>
  [n.comercial, n.ruc && `RUC ${n.ruc}`, n.email].filter(Boolean).join(' · ')

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
export default function FichaCliente({ conversacion, onCerrar, onAbrirConversacion }) {
  const toast = useToast()
  const { isAdmin } = useAuth()
  const [ficha, setFicha] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [buscando, setBuscando] = useState('')
  const [resultados, setResultados] = useState([])
  const [renovarAbierto, setRenovarAbierto] = useState(false)
  const [reactivarAbierto, setReactivarAbierto] = useState(false)
  const [comprobantesAbierto, setComprobantesAbierto] = useState(false)
  const [emitirAbierto, setEmitirAbierto] = useState(false)
  const [verTodosLosPagos, setVerTodosLosPagos] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  // Una empresa puede tener VARIOS numeros escribiendo: el dueno, su
  // secretaria, su contador. El rol dice quien es quien, y la lista de otros
  // contactos evita atender a la secretaria creyendo que es el dueno.
  const [otros, setOtros] = useState([])
  const [editandoRol, setEditandoRol] = useState(false)
  const [rolBorrador, setRolBorrador] = useState('')

  // UN numero puede tener VARIAS empresas: un reseller que escribe por sus
  // clientes, un vendedor, o alguien con dos negocios en cuentas distintas.
  // El iPhone ya lo guardaba y la web lo ignoraba, asi que mostraba una sola
  // sin avisar que habia mas.
  const cuentas = useMemo(() => cuentasDeLaConversacion(conversacion), [conversacion])
  const [cuentaVista, setCuentaVista] = useState(null)
  const [nombres, setNombres] = useState({})
  const [gestorAbierto, setGestorAbierto] = useState(false)

  // Con VARIAS cuentas se abre en la lista y se entra a la que uno elija, con
  // vuelta atras — como en el iPhone. Con una sola no hay lista que mostrar:
  // se entra directo, igual que siempre.
  useEffect(() => {
    setCuentaVista(cuentas.length === 1 ? cuentas[0] : null)
  }, [conversacion?.id, cuentas])

  const enLista = cuentas.length > 1 && !cuentaVista
  const businessId = cuentaVista || (cuentas.length === 1 ? cuentas[0] : null)

  // Los nombres para el selector: la ficha abierta solo trae la suya.
  useEffect(() => {
    let vivo = true
    const faltan = cuentas.filter((id) => !nombres[id])
    if (!faltan.length) return undefined
    Promise.all(faltan.map((id) => obtenerFichaCliente(id).then((f) => [id, f?.nombre || id]).catch(() => [id, id])))
      .then((pares) => { if (vivo) setNombres((n) => ({ ...n, ...Object.fromEntries(pares) })) })
    return () => { vivo = false }
  }, [cuentas, nombres])

  useEffect(() => {
    setFicha(null)
    setRenovarAbierto(false)
    setReactivarAbierto(false)
    setComprobantesAbierto(false)
    setEmitirAbierto(false)
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

  // Los otros numeros que escriben por esta misma empresa.
  useEffect(() => {
    setOtros([])
    if (!businessId) return undefined
    let vivo = true
    otrosContactosDelNegocio(businessId, conversacion?.id)
      .then((lista) => { if (vivo) setOtros(lista) })
      .catch(() => {})
    return () => { vivo = false }
  }, [businessId, conversacion?.id])

  // El borrador del rol sigue a la conversacion abierta.
  useEffect(() => {
    setEditandoRol(false)
    setRolBorrador(conversacion?.rolContacto || '')
  }, [conversacion?.id, conversacion?.rolContacto])

  const guardarRol = async () => {
    try {
      await guardarRolDelContacto(conversacion.id, rolBorrador)
      setEditandoRol(false)
      toast.success(rolBorrador.trim() ? `Anotado: ${rolBorrador.trim()}` : 'Rol quitado')
    } catch {
      toast.error('No se pudo guardar')
    }
  }

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
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        {cuentas.length > 1 && !enLista && (
          <button
            onClick={() => setCuentaVista(null)}
            className="-ml-1 p-1 text-gray-500 hover:text-gray-900"
            title="Volver a las cuentas"
            aria-label="Volver a las cuentas"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <h3 className="flex-1 min-w-0 truncate font-semibold text-gray-900 text-[13px]">
          {enLista ? `Cuentas del cliente (${cuentas.length})` : 'Ficha del cliente'}
        </h3>
        <button onClick={onCerrar} className="flex-none text-gray-400 hover:text-gray-600" aria-label="Cerrar ficha">
          <X className="w-5 h-5" />
        </button>
      </div>


      <div className="flex-1 overflow-y-auto p-4">
        {/* ---------- Varias empresas: primero se elige cuál ---------- */}
        {enLista && (
          <div className="space-y-3">
            <p className="text-[11.5px] text-gray-500">
              Este número maneja varias empresas. Elige cuál quieres ver.
            </p>
            <div className="space-y-2">
              {cuentas.map((id, i) => (
                <TarjetaCuenta
                  key={id}
                  businessId={id}
                  principal={i === 0}
                  onAbrir={() => setCuentaVista(id)}
                />
              ))}
            </div>
            <Boton className="w-full" onClick={() => setGestorAbierto(true)}>
              Agregar o quitar empresas
            </Boton>
          </div>
        )}

        {/* ---------- Sin vínculo: es un lead, o hay que vincular a mano ---------- */}
        {!businessId && !enLista && (
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
                  placeholder="Nombre, RUC o correo"
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
                          // Es el unico momento en que se sabe quien es: se
                          // pregunta ahora o no se anota nunca.
                          setRolBorrador('')
                          setEditandoRol(true)
                          toast.success(`Vinculada a ${r.nombre}`)
                        } catch {
                          toast.error('No se pudo vincular')
                        }
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors"
                    >
                      <p className="text-[13px] font-medium text-gray-800 truncate">{r.nombre}</p>
                      <p className="text-[11.5px] text-gray-400 truncate">{detalleDelNegocio(r)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Un lead que ya pagó (una cuenta nueva, por ejemplo) también
                necesita su comprobante, y todavía no hay a quién vincularlo:
                el RUC se escribe a mano y se completa desde SUNAT. */}
            <button
              onClick={() => setEmitirAbierto(true)}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Emitir comprobante
            </button>
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
            </div>

            {ficha.sinSuscripcion && (
              <Aviso tono="rojo" titulo="Sin suscripción">
                Esta cuenta no tiene documento de suscripción: no hay plan, vencimiento ni pagos que mostrar.
              </Aviso>
            )}

            {/* Quien escribe NO siempre es el titular. Sin esto, en el chat de
                la secretaria se leia el nombre del dueno y se la saludaba mal. */}
            {(conversacion.linkedBy === 'manual' || conversacion.rolContacto || otros.length > 0) && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <p className="text-[11px] text-gray-500">Te escribe</p>
                <p className="text-[13px] font-medium text-gray-900 truncate">
                  {conversacion.nombre || formatearNumero(conversacion.waId)}
                  {conversacion.rolContacto && (
                    <span className="font-normal text-gray-500"> · {conversacion.rolContacto}</span>
                  )}
                </p>

                {editandoRol ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Entrada
                      autoFocus
                      value={rolBorrador}
                      onChange={(e) => setRolBorrador(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') guardarRol()
                        if (e.key === 'Escape') { setEditandoRol(false); setRolBorrador(conversacion.rolContacto || '') }
                      }}
                      placeholder="Secretaria, contador, almacén…"
                      className="flex-1 min-w-0"
                    />
                    <Boton variante="primario" tamano="sm" onClick={guardarRol}>Guardar</Boton>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditandoRol(true)}
                    className="mt-1 text-[11.5px] text-primary-700 hover:underline"
                  >
                    {conversacion.rolContacto ? 'Cambiar quién es' : 'Anotar quién es'}
                  </button>
                )}

                {conversacion.linkedBy === 'manual' && (
                  <p className="text-[11px] text-gray-400 mt-1.5">Vinculado a mano</p>
                )}
              </div>
            )}

            {/* Los otros numeros de la misma empresa, con salto a su chat. */}
            {otros.length > 0 && (
              <div>
                <p className="text-[12px] font-medium text-gray-700 mb-1.5">
                  También escriben por esta empresa
                </p>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                  {otros.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => { onAbrirConversacion?.(o.id); onCerrar?.() }}
                      disabled={!onAbrirConversacion}
                      className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors disabled:hover:bg-transparent"
                    >
                      <p className="text-[13px] text-gray-800 truncate">
                        {o.nombre || formatearNumero(o.waId)}
                        {o.rol && <span className="text-gray-500"> · {o.rol}</span>}
                      </p>
                      <p className="text-[11.5px] text-gray-400">{formatearNumero(o.waId)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

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

            {ficha.nuncaVence && (
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2.5 bg-gray-50 text-gray-600 border-gray-200">
                <CalendarClock className="w-4 h-4 flex-none" />
                <span className="text-[13px] font-medium">Sin vencimiento (cuenta interna)</span>
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

            {/* Agregar y quitar empresas se hace en la lista de cuentas, no
                aca. La excepcion es el contacto con UNA sola: no tiene lista,
                y sin este boton no habria como sumarle la segunda. */}
            {cuentas.length === 1 && (
              <Boton className="w-full" onClick={() => setGestorAbierto(true)}>
                Agregar otra empresa
              </Boton>
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

            {/* Factura, boleta o nota de venta, emitida desde la cuenta del
                admin y mandada como PDF en esta misma conversación. */}
            <button
              onClick={() => setEmitirAbierto(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 text-[13px] font-medium rounded-md hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Emitir comprobante
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

      {gestorAbierto && (
        <GestorDeCuentas
          conversacion={conversacion}
          cuentas={cuentas}
          nombres={nombres}
          onCerrar={() => setGestorAbierto(false)}
        />
      )}

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

      {emitirAbierto && (
        <ModalEmitirComprobante
          conversacion={conversacion}
          ficha={ficha}
          onCerrar={() => setEmitirAbierto(false)}
          onEmitido={() => setEmitirAbierto(false)}
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

/**
 * Una empresa, en su propia tarjeta.
 *
 * En tarjeta y no en fila para que el nombre entre completo: las razones
 * sociales peruanas son largas ("GONZALES GONZALEZ GIACOMO JEREMY") y en una
 * linea se cortaban justo donde se distinguen dos empresas del mismo dueno.
 *
 * El punto de color es un semaforo, no decoracion: es el unico dato que hay
 * que poder leer sin leer. Por eso se permite el ambar aunque la paleta del
 * panel sean tres colores — un estado con tres niveles necesita tres.
 */
const SEMAFORO = {
  activa: { punto: 'bg-green-500', texto: 'text-gray-500' },
  aviso: { punto: 'bg-amber-500', texto: 'text-amber-700' },
  grave: { punto: 'bg-red-500', texto: 'text-red-600' },
}

function estadoDeCuenta(c) {
  if (!c) return { nivel: 'activa', detalle: 'Cargando…' }
  if (c.accessBlocked) return { nivel: 'grave', detalle: 'Suspendida' }
  const d = c.diasParaVencer
  const plan = c.planName || '—'
  if (c.nuncaVence) return { nivel: 'activa', detalle: `${plan} · sin vencimiento` }
  if (d == null) return { nivel: 'activa', detalle: plan }
  if (d < 0) return { nivel: 'aviso', detalle: `Vencida hace ${-d} día${d === -1 ? '' : 's'}` }
  if (d === 0) return { nivel: 'aviso', detalle: 'Vence hoy' }
  if (d <= 7) return { nivel: 'aviso', detalle: `Vence en ${d} día${d === 1 ? '' : 's'}` }
  return { nivel: 'activa', detalle: `${plan} · ${d} días` }
}

function TarjetaCuenta({ businessId, principal, onAbrir }) {
  const [c, setC] = useState(null)

  useEffect(() => {
    let vivo = true
    obtenerFichaCliente(businessId).then((f) => { if (vivo) setC(f) }).catch(() => {})
    return () => { vivo = false }
  }, [businessId])

  const { nivel, detalle } = estadoDeCuenta(c)
  const tono = SEMAFORO[nivel]

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-gray-300 hover:bg-gray-50"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 flex-none rounded-full ${tono.punto}`} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 leading-snug break-words">{c?.nombre || 'Cargando…'}</p>
          {c?.ruc && <p className="text-[11.5px] text-gray-400">RUC {c.ruc}</p>}
          <p className={`mt-0.5 text-[11.5px] ${tono.texto}`}>{detalle}</p>
          {principal && <p className="mt-0.5 text-[11px] text-gray-400">Cuenta principal</p>}
        </div>
        <span className="flex-none text-gray-300">›</span>
      </div>
    </button>
  )
}

/**
 * Las empresas de un mismo contacto: se ven, se suman y se quitan.
 *
 * La PRINCIPAL no se toca desde aqui — es la que usan la web y el servidor
 * para saber de quien es la conversacion, y quitarla es "desvincular", que ya
 * tiene su propio boton. Aqui se manejan las acompanantes.
 */
function GestorDeCuentas({ conversacion, cuentas, nombres, onCerrar }) {
  const toast = useToast()
  const [sugeridas, setSugeridas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    sugerirCuentasDelContacto(cuentas).then(setSugeridas).catch(() => setSugeridas([]))
  }, [cuentas])

  useEffect(() => {
    if (busqueda.trim().length < 2) { setResultados([]); return undefined }
    let vivo = true
    const t = setTimeout(() => {
      buscarNegocios(busqueda)
        .then((r) => { if (vivo) setResultados(r.filter((n) => !cuentas.includes(n.businessId))) })
        .catch(() => {})
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [busqueda, cuentas])

  const agregar = async (id, nombre) => {
    setTrabajando(true)
    try {
      await agregarCuentaAlContacto(conversacion.id, id)
      toast.success(`${nombre} sumada al cliente`)
      setBusqueda('')
    } catch {
      toast.error('No se pudo agregar la cuenta')
    } finally {
      setTrabajando(false)
    }
  }

  const quitar = async (id) => {
    setTrabajando(true)
    try {
      await quitarCuentaDelContacto(conversacion.id, id)
      toast.success('Cuenta quitada del cliente')
    } catch {
      toast.error('No se pudo quitar la cuenta')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      titulo="Cuentas del cliente"
      subtitulo="Un mismo número puede manejar varias empresas."
      ancho="sm"
      onClose={onCerrar}
      pie={<Boton onClick={onCerrar}>Cerrar</Boton>}
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-gray-700">En este cliente</p>
          <div className="rounded-md border border-gray-200 divide-y divide-gray-100">
            {cuentas.map((id, i) => (
              <div key={id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate">
                  {nombres[id] || id}
                  {i === 0 && <span className="text-gray-400"> · principal</span>}
                </span>
                {i > 0 && (
                  <Boton tamano="sm" variante="peligro" disabled={trabajando} onClick={() => quitar(id)}>
                    Quitar
                  </Boton>
                )}
              </div>
            ))}
          </div>
          {cuentas.length > 1 && (
            <p className="mt-1 text-[11.5px] text-gray-500">
              La principal se cambia desvinculando la conversación.
            </p>
          )}
        </div>

        {sugeridas.length > 0 && (
          <div>
            {/* Del mismo reseller o del mismo vendedor: son las candidatas
                naturales. Solo se proponen — sumarlas la decides tú. */}
            <p className="mb-1.5 text-[12px] font-medium text-gray-700">
              Del mismo vendedor o reseller
            </p>
            <div className="rounded-md border border-gray-200 divide-y divide-gray-100 max-h-40 overflow-y-auto">
              {sugeridas.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">{c.nombre}</span>
                  <Boton tamano="sm" disabled={trabajando} onClick={() => agregar(c.id, c.nombre)}>
                    Agregar
                  </Boton>
                </div>
              ))}
            </div>
          </div>
        )}

        <Campo etiqueta="Buscar otra empresa" ayuda="Por nombre, nombre comercial, RUC o correo.">
          <Entrada value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, RUC o correo" />
        </Campo>
        {resultados.length > 0 && (
          <div className="rounded-md border border-gray-200 divide-y divide-gray-100 max-h-40 overflow-y-auto">
            {resultados.map((n) => (
              <div key={n.businessId} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate">{n.nombre}</p>
                  <p className="text-[11.5px] text-gray-400 truncate">{detalleDelNegocio(n)}</p>
                </div>
                <Boton tamano="sm" disabled={trabajando} onClick={() => agregar(n.businessId, n.nombre)}>
                  Agregar
                </Boton>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
