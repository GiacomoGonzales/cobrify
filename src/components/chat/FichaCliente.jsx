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
  UserPlus,
  X,
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import { Modal, Campo, Entrada, Selector, Boton, ListaDatos, Dato, Aviso } from '@/components/admin/ui'
import EnviarAltaModal from './EnviarAltaModal'
import {
  obtenerFichaCliente,
  cuentasDeLaConversacion,
  agregarCuentaAlContacto,
  quitarCuentaDelContacto,
  sugerirCuentasDelContacto,
  buscarNegocios,
  precargarNegocios,
  vincularConversacion,
  desvincularConversacion,
  guardarRolDelContacto,
  otrosContactosDelNegocio,
  agregarComprobantes,
  formatearNumero,
  carteraDeLaCuenta,
  carteraDelVendedor,
  listarVendedores,
  vendedorPorTelefono,
  asignarVendedorALaConversacion,
  altaDeLaConversacion,
} from '@/services/whatsappChatService'
import { registerPayment, suspendUser, reactivateUser, PLANS } from '@/services/subscriptionService'
import { convertirPruebaEnCuenta } from '@/services/adminCuentasService'
import ConvertirPruebaModal from '@/components/admin/cuenta/ConvertirPruebaModal'
import { METODOS_DE_COBRO as METODOS } from '@/services/comprobanteChatService'
import ModalEmitirComprobante, { ModalReenviarComprobante } from '@/components/chat/EmitirComprobante'

/**
 * La segunda línea de un resultado de búsqueda: lo que permite distinguir dos
 * negocios de nombre parecido sin abrir ninguno. El código de cliente va
 * primero: es el mismo número de la columna Código en Usuarios.
 */
const detalleDelNegocio = (n) =>
  [n.codigoCliente, n.comercial, n.ruc && `RUC ${n.ruc}`, n.email].filter(Boolean).join(' · ')

/** "vence hoy", "le quedan 2 días", "venció hace 3 días". */
const textoDeLaPrueba = (dias) => {
  if (dias == null) return ''
  if (dias === 0) return ' · vence hoy'
  if (dias > 0) return ` · ${dias === 1 ? 'le queda 1 día' : `le quedan ${dias} días`}`
  const pasados = Math.abs(dias)
  return ` · venció hace ${pasados === 1 ? '1 día' : `${pasados} días`}`
}

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
export default function FichaCliente({ conversacion, onCerrar, onAbrirConversacion, onPonerEnElCompositor }) {
  const toast = useToast()
  const { isAdmin } = useAuth()
  const [ficha, setFicha] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [buscando, setBuscando] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscandoNegocios, setBuscandoNegocios] = useState(false)
  const [renovarAbierto, setRenovarAbierto] = useState(false)
  const [reactivarAbierto, setReactivarAbierto] = useState(false)
  const [comprobantesAbierto, setComprobantesAbierto] = useState(false)
  const [emitirAbierto, setEmitirAbierto] = useState(false)
  const [reenviarAbierto, setReenviarAbierto] = useState(false)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [convertirAbierto, setConvertirAbierto] = useState(false)
  const [convirtiendo, setConvirtiendo] = useState(false)
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

  // La cuenta elegida solo vale si es de ESTA conversación. El efecto de
  // arriba la pone al día, pero corre después de pintar: en ese primer
  // cuadro seguía la de la conversación anterior, se pedía SU ficha, y si esa
  // respuesta llegaba última aparecía en otra conversación (14-set-2026).
  const vistaValida = cuentaVista && cuentas.includes(cuentaVista) ? cuentaVista : null
  // Un cliente de la cartera (de un reseller o de un vendedor) se abre en esta
  // misma ficha, con vuelta atrás: mientras tanto, todo lo de abajo trabaja
  // sobre él. { id, tipo, nombre }
  const [carteraAbierta, setCarteraAbierta] = useState(null)
  const enLista = !carteraAbierta && cuentas.length > 1 && !vistaValida
  const cuentaDeLaConversacion = vistaValida || (cuentas.length === 1 ? cuentas[0] : null)
  const businessId = carteraAbierta?.id || cuentaDeLaConversacion

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
    setReenviarAbierto(false)
    setConvertirAbierto(false)
    setVerTodosLosPagos(false)
    if (!businessId) { setCargando(false); return undefined }
    // Una respuesta que llega después de cambiar de conversación (o de
    // cuenta) se descarta: antes pisaba la ficha de la que se estaba viendo.
    let vivo = true
    setCargando(true)
    obtenerFichaCliente(businessId)
      .then((f) => { if (vivo) setFicha(f) })
      .catch(() => { if (vivo) toast.error('No se pudo cargar la ficha del cliente') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, conversacion?.id])

  // Si cambia la cuenta de la conversación, se vuelve a ella.
  useEffect(() => { setCarteraAbierta(null) }, [cuentaDeLaConversacion])

  // La cartera de la cuenta vinculada: si es la principal de un reseller, sus
  // clientes; si es el usuario de un vendedor, sus cuentas.
  const [cartera, setCartera] = useState(null)
  useEffect(() => {
    setCartera(null)
    if (!cuentaDeLaConversacion) return undefined
    let vivo = true
    carteraDeLaCuenta(cuentaDeLaConversacion)
      .then((c) => { if (vivo) setCartera(c) })
      .catch(() => {})
    return () => { vivo = false }
  }, [cuentaDeLaConversacion])

  // Y la del vendedor que se le asignó a este contacto, si tiene uno.
  const vendedorAsignado = conversacion?.vendedorContactoId || null
  const [carteraVendedor, setCarteraVendedor] = useState(null)
  useEffect(() => {
    setCarteraVendedor(null)
    if (!vendedorAsignado) return undefined
    let vivo = true
    carteraDelVendedor(vendedorAsignado)
      .then((c) => { if (vivo) setCarteraVendedor(c) })
      .catch(() => {})
    return () => { vivo = false }
  }, [vendedorAsignado])

  // ¿DE ACÁ SALIÓ UN FORMULARIO DE ALTA? Solo se pregunta cuando la
  // conversación NO está vinculada, que es justo el caso molesto: el cliente
  // completó el formulario, su cuenta existe y quedó con otro número (o el
  // alta es anterior al vínculo automático del 14-set-2026), así que la ficha
  // dice "no es un cliente conocido" y no hay manera de saber cuál es la
  // cuenta. Con esto se ve qué se le mandó y se vincula de un toque.
  const [altaPrevia, setAltaPrevia] = useState(null)
  const [cuentaDelAlta, setCuentaDelAlta] = useState(null)
  useEffect(() => {
    setAltaPrevia(null)
    setCuentaDelAlta(null)
    if (businessId || !isAdmin || !conversacion?.id) return undefined
    let vivo = true
    altaDeLaConversacion(conversacion.id)
      .then((alta) => {
        if (!vivo || !alta) return undefined
        setAltaPrevia(alta)
        if (!alta.uid) return undefined
        return obtenerFichaCliente(alta.uid).then((f) => {
          if (vivo && f) setCuentaDelAlta({ id: alta.uid, nombre: f.nombre || 'la cuenta que creó' })
        })
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [businessId, isAdmin, conversacion?.id])

  // Que el catálogo de fichas ya esté bajado cuando se escriba el primer
  // carácter: la primera búsqueda tardaba varios segundos sin avisar.
  useEffect(() => { precargarNegocios() }, [])

  // Búsqueda para la vinculación manual, con una pausa para no consultar
  // en cada tecla. "Buscando…" se prende con la tecla, no al consultar, para
  // que no aparezca "ningún negocio" en el medio.
  useEffect(() => {
    if (buscando.trim().length < 2) { setResultados([]); setBuscandoNegocios(false); return undefined }
    let vivo = true
    setBuscandoNegocios(true)
    const t = setTimeout(() => {
      buscarNegocios(buscando)
        .then((r) => { if (vivo) setResultados(r) })
        .catch(() => { if (vivo) setResultados([]) })
        .finally(() => { if (vivo) setBuscandoNegocios(false) })
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
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
        {(carteraAbierta || (cuentas.length > 1 && !enLista)) && (
          <button
            onClick={() => (carteraAbierta ? setCarteraAbierta(null) : setCuentaVista(null))}
            className="-ml-1 p-1 text-gray-500 hover:text-gray-900"
            title={carteraAbierta ? `Volver a ${carteraAbierta.nombre}` : 'Volver a las cuentas'}
            aria-label={carteraAbierta ? 'Volver a la cartera' : 'Volver a las cuentas'}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <h3 className="flex-1 min-w-0 truncate font-semibold text-gray-900 text-[13px]">
          {enLista
            ? `Cuentas del cliente (${cuentas.length})`
            : carteraAbierta
              ? `${carteraAbierta.tipo === 'reseller' ? 'Cliente de' : 'Cuenta de'} ${carteraAbierta.nombre}`
              : 'Ficha del cliente'}
        </h3>
        <button onClick={onCerrar} className="flex-none text-gray-400 hover:text-gray-600" aria-label="Cerrar ficha">
          <X className="w-5 h-5" />
        </button>
      </div>


      <div className="flex-1 overflow-y-auto chat-scrollbar p-4">
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
              {buscandoNegocios && (
                <p className="mt-2 flex items-center gap-2 text-[12px] text-gray-500">
                  <span className="inline-block h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                  Buscando…
                </p>
              )}
              {!buscandoNegocios && buscando.trim().length >= 2 && resultados.length === 0 && (
                <p className="mt-2 text-[12px] text-gray-500">Ningún negocio coincide.</p>
              )}
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

            {/* Ya se le mandó el formulario: qué se le ofreció, si lo usó y a
                qué cuenta llegó. Es lo único que conecta esta conversación con
                la cuenta nueva cuando el número no coincide. */}
            {altaPrevia && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
                <p className="text-[12.5px] font-medium">
                  Le enviaste el formulario de alta
                  {altaPrevia.creadaEn
                    ? ` el ${altaPrevia.creadaEn.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`
                    : ''}
                </p>
                <p className="text-[11.5px]">
                  {altaPrevia.diasDePrueba
                    ? `Prueba de ${altaPrevia.diasDePrueba} días`
                    : (altaPrevia.planNombre || altaPrevia.plan || 'Sin plan')}
                  {altaPrevia.estado === 'usada'
                    ? ' · ya creó su cuenta'
                    : altaPrevia.estado === 'abierta'
                      ? ' · abrió el enlace y no terminó'
                      : ' · todavía no lo abre'}
                </p>
                {cuentaDelAlta && (
                  <button
                    onClick={async () => {
                      try {
                        await vincularConversacion(conversacion.id, cuentaDelAlta.id, cuentaDelAlta.nombre)
                        toast.success(`Vinculada a ${cuentaDelAlta.nombre}`)
                      } catch {
                        toast.error('No se pudo vincular')
                      }
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Vincular con {cuentaDelAlta.nombre}
                  </button>
                )}
              </div>
            )}

            {/* Lo que se hace con un lead que acaba de pagar: mandarle el
                formulario para que se cree la cuenta él mismo, y emitirle su
                comprobante (el RUC se escribe a mano y se completa desde SUNAT,
                porque todavía no hay negocio al que vincularlo). */}
            {isAdmin && (
              <button
                onClick={() => setAltaAbierta(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Enviar formulario de alta
              </button>
            )}
            <button
              onClick={() => setEmitirAbierto(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Emitir comprobante
            </button>
            <button
              onClick={() => setReenviarAbierto(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Reenviar comprobante
            </button>
          </div>
        )}

        {/* ---------- Con vínculo: la ficha ---------- */}
        {businessId && cargando && (
          <p className="text-[13px] text-gray-500 py-4 text-center">Cargando ficha...</p>
        )}

        {businessId && !cargando && ficha && (
          <div className="space-y-4">
            {carteraAbierta && (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-[11.5px] text-gray-600">
                {carteraAbierta.tipo === 'reseller' ? 'Cliente del reseller' : 'Cuenta del vendedor'}{' '}
                {carteraAbierta.nombre}. No está vinculada a esta conversación.
              </p>
            )}
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
            {!carteraAbierta && (conversacion.linkedBy === 'manual' || conversacion.rolContacto || otros.length > 0) && (
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

            {/* EN PRUEBA: es lo que hay que reconocer de un vistazo. Cuando el
                cliente escribe "ya te pagué", esta cuenta no se renueva, se
                CONVIERTE, y antes había que adivinarlo leyendo el plan. */}
            {ficha.plan === 'trial' && (
              <div className="flex items-start gap-2 border rounded-lg px-3 py-2.5 bg-amber-50 text-amber-900 border-amber-200">
                <CalendarClock className="w-4 h-4 flex-none mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    En prueba gratuita{textoDeLaPrueba(ficha.diasParaVencer)}
                  </p>
                  <p className="text-[11.5px]">
                    Todavía no es una cuenta pagada. Si ya pagó, conviértela en cuenta real.
                  </p>
                </div>
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
            {cuentas.length === 1 && !carteraAbierta && (
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

            {/* En una prueba, convertir es LA acción: registrar una renovación
                sobre un plan que nadie contrató deja la cuenta en trial. */}
            {ficha.plan === 'trial' && (
              <button
                onClick={() => setConvertirAbierto(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-[13px] font-medium rounded-md hover:bg-primary-700 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                Convertir en cuenta real
              </button>
            )}

            <button
              onClick={() => setRenovarAbierto(true)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium rounded-md transition-colors ${
                ficha.plan === 'trial'
                  ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
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

            {/* El PDF de uno ya emitido, sin emitir otro: el que no llegó o el
                que el cliente pide de nuevo. */}
            <button
              onClick={() => setReenviarAbierto(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 text-[13px] font-medium rounded-md hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Reenviar comprobante
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

            {!carteraAbierta && (
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
            )}
          </div>
        )}

        {businessId && !cargando && !ficha && (
          <div className="text-center py-6">
            <Link2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-[13px] text-gray-500">El negocio vinculado ya no existe.</p>
          </div>
        )}

        {/* La cartera: los clientes del reseller o las cuentas del vendedor
            (por su cuenta vinculada o porque se le asignó a este contacto), y
            qué vendedor es. No va dentro de un cliente de la cartera ni en la
            lista de varias empresas. */}
        {!enLista && !carteraAbierta && !cargando && (cartera || carteraVendedor || isAdmin) && (
          <div className="mt-6 space-y-5 border-t border-gray-100 pt-4">
            {cartera && (
              <CarteraDelContacto
                key={`${cartera.tipo}-${cartera.id}`}
                cartera={cartera}
                onAbrir={(id) => setCarteraAbierta({ id, tipo: cartera.tipo, nombre: cartera.nombre })}
              />
            )}
            {carteraVendedor && !(cartera?.tipo === 'vendedor' && cartera.id === carteraVendedor.id) && (
              <CarteraDelContacto
                key={`vendedor-${carteraVendedor.id}`}
                cartera={carteraVendedor}
                onAbrir={(id) => setCarteraAbierta({ id, tipo: 'vendedor', nombre: carteraVendedor.nombre })}
              />
            )}
            {isAdmin && <VendedorDelContacto conversacion={conversacion} />}
          </div>
        )}
      </div>

      {gestorAbierto && (
        <GestorDeCuentas
          conversacion={conversacion}
          cuentas={cuentas}
          nombres={nombres}
          onCerrar={() => setGestorAbierto(false)}
          onEnviarAlta={() => { setGestorAbierto(false); setAltaAbierta(true) }}
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

      {reenviarAbierto && (
        <ModalReenviarComprobante
          conversacion={conversacion}
          ficha={ficha}
          onCerrar={() => setReenviarAbierto(false)}
        />
      )}

      {altaAbierta && (
        <EnviarAltaModal
          conversacion={conversacion}
          onClose={() => setAltaAbierta(false)}
          onPonerEnElCompositor={onPonerEnElCompositor}
        />
      )}

      {/* El mismo cuadro del panel: qué plan contrató, cuánto pagó y cómo. */}
      {convertirAbierto && ficha && (
        <ConvertirPruebaModal
          cuenta={{ businessName: ficha.nombre }}
          procesando={convirtiendo}
          onClose={() => setConvertirAbierto(false)}
          onConvertir={async (planId, monto, metodo) => {
            setConvirtiendo(true)
            try {
              const r = await convertirPruebaEnCuenta(businessId, monto, metodo, planId)
              toast.success(
                r?.newPeriodEnd
                  ? `Ya es cuenta real: ${r.planName}. Vence el ${r.newPeriodEnd.toLocaleDateString('es-PE')}`
                  : 'Ya es cuenta real',
              )
              setConvertirAbierto(false)
              await releerFicha()
            } catch (error) {
              toast.error(error.message || 'No se pudo convertir la prueba')
            } finally {
              setConvirtiendo(false)
            }
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
function GestorDeCuentas({ conversacion, cuentas, nombres, onCerrar, onEnviarAlta }) {
  const toast = useToast()
  const [sugeridas, setSugeridas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscandoNegocios, setBuscandoNegocios] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    sugerirCuentasDelContacto(cuentas).then(setSugeridas).catch(() => setSugeridas([]))
  }, [cuentas])

  useEffect(() => { precargarNegocios() }, [])

  useEffect(() => {
    if (busqueda.trim().length < 2) { setResultados([]); setBuscandoNegocios(false); return undefined }
    let vivo = true
    setBuscandoNegocios(true)
    const t = setTimeout(() => {
      buscarNegocios(busqueda)
        .then((r) => { if (vivo) setResultados(r.filter((n) => !cuentas.includes(n.businessId))) })
        .catch(() => { if (vivo) setResultados([]) })
        .finally(() => { if (vivo) setBuscandoNegocios(false) })
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
        {buscandoNegocios && (
          <p className="flex items-center gap-2 text-[12px] text-gray-500">
            <span className="inline-block h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            Buscando…
          </p>
        )}
        {!buscandoNegocios && busqueda.trim().length >= 2 && resultados.length === 0 && (
          <p className="text-[12px] text-gray-500">Ningún negocio coincide.</p>
        )}
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

        {/* La segunda empresa no siempre existe todavía: un cliente que ya
            tiene cuenta paga por otra y hay que crearla. Buscarla acá no
            servía de nada, y el formulario de alta solo aparecía en los leads
            (pedido de Giacomo, 16-set-2026). Al completarlo, la cuenta nueva
            se suma sola a este mismo contacto. */}
        {onEnviarAlta && (
          <div className="rounded-md border border-dashed border-gray-300 px-3 py-3">
            <p className="text-[12px] font-medium text-gray-700">¿La empresa todavía no existe?</p>
            <p className="mt-0.5 text-[11.5px] text-gray-500">
              Mándale el formulario de alta y, cuando lo complete, la cuenta nueva queda
              sumada a este cliente.
            </p>
            <Boton className="mt-2 w-full" onClick={onEnviarAlta}>
              Enviar formulario de alta
            </Boton>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Cómo se lee el vencimiento de una cuenta de la cartera. */
const estadoDeVencimiento = (c) => {
  if (c.bloqueada) return { texto: 'Bloqueada', clase: 'text-red-700' }
  if (c.nuncaVence) return { texto: 'Sin vencimiento', clase: 'text-gray-500' }
  if (!c.vence) return { texto: 'Sin fecha', clase: 'text-gray-500' }
  const fecha = c.vence.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  if (c.diasParaVencer < 0) return { texto: `Venció el ${fecha}`, clase: 'text-red-700' }
  if (c.diasParaVencer <= 7) return { texto: `Vence en ${c.diasParaVencer} día${c.diasParaVencer === 1 ? '' : 's'}`, clase: 'text-amber-700' }
  return { texto: `Vence el ${fecha}`, clase: 'text-gray-500' }
}

/**
 * La cartera de un reseller o de un vendedor: sus cuentas con el vencimiento,
 * primero las que piden atención (bloqueadas, vencidas, las que vencen esta
 * semana). Cada una se abre en la misma ficha.
 */
function CarteraDelContacto({ cartera, onAbrir }) {
  const [verTodas, setVerTodas] = useState(false)
  const { cuentas } = cartera
  const vencidas = cuentas.filter((c) => c.diasParaVencer !== null && c.diasParaVencer < 0).length
  const porVencer = cuentas.filter((c) => c.diasParaVencer !== null && c.diasParaVencer >= 0 && c.diasParaVencer <= 7).length
  const visibles = verTodas ? cuentas : cuentas.slice(0, 8)
  const aviso = [
    vencidas > 0 && `${vencidas} vencida${vencidas === 1 ? '' : 's'}`,
    porVencer > 0 && `${porVencer} vence${porVencer === 1 ? '' : 'n'} esta semana`,
  ].filter(Boolean).join(' · ')

  return (
    <div>
      <p className="text-[12px] font-medium text-gray-700">
        {cartera.tipo === 'reseller' ? 'Sus clientes' : 'Sus cuentas'} ({cuentas.length})
      </p>
      <p className="text-[11.5px] text-gray-500 mb-1.5 truncate">
        {cartera.tipo === 'reseller' ? 'Reseller' : 'Vendedor'} · {cartera.nombre}
        {aviso && <span className="text-red-700"> · {aviso}</span>}
      </p>
      {cuentas.length === 0 ? (
        <p className="text-[12px] text-gray-500">Todavía no tiene cuentas.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
          {visibles.map((c) => {
            const v = estadoDeVencimiento(c)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onAbrir(c.id)}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors"
              >
                <p className="text-[13px] text-gray-800 truncate">{c.nombre}</p>
                <p className="text-[11.5px] truncate">
                  <span className="text-gray-500">{c.plan || 'Sin plan'}</span>
                  <span className="text-gray-300"> · </span>
                  <span className={v.clase}>{v.texto}</span>
                </p>
              </button>
            )
          })}
        </div>
      )}
      {cuentas.length > 8 && (
        <button
          type="button"
          onClick={() => setVerTodas((x) => !x)}
          className="mt-1.5 text-[11.5px] text-primary-700 hover:underline"
        >
          {verTodas ? 'Ver menos' : `Ver todas (${cuentas.length})`}
        </button>
      )}
    </div>
  )
}

/**
 * Qué vendedor de Cobrify es este contacto. Hay vendedores que escriben sin
 * cuenta propia o desde otro número: anotarlo trae su cartera a la ficha. Si el
 * número es el de un vendedor registrado, se propone.
 */
function VendedorDelContacto({ conversacion }) {
  const toast = useToast()
  const [vendedores, setVendedores] = useState(null)
  const [editando, setEditando] = useState(false)
  const [elegido, setElegido] = useState('')
  const [guardando, setGuardando] = useState(false)
  const actual = conversacion.vendedorContactoId || ''

  useEffect(() => {
    let vivo = true
    listarVendedores()
      .then((l) => { if (vivo) setVendedores(l) })
      .catch(() => { if (vivo) setVendedores([]) })
    return () => { vivo = false }
  }, [])

  if (!vendedores || vendedores.length === 0) return null
  const nombreDe = (id) => vendedores.find((v) => v.id === id)?.nombre || 'Vendedor'
  const sugerido = !actual ? vendedorPorTelefono(vendedores, conversacion.waId) : null

  const guardar = async (id) => {
    setGuardando(true)
    try {
      await asignarVendedorALaConversacion(conversacion.id, id)
      setEditando(false)
    } catch {
      toast.error('No se pudo guardar el vendedor')
    } finally {
      setGuardando(false)
    }
  }

  if (editando) {
    return (
      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-gray-700">Vendedor de Cobrify</p>
        <div className="flex items-center gap-1.5">
          <Selector value={elegido} onChange={(e) => setElegido(e.target.value)} className="flex-1 min-w-0">
            <option value="">No es vendedor</option>
            {vendedores.filter((v) => v.activo || v.id === actual).map((v) => (
              <option key={v.id} value={v.id}>{v.nombre}</option>
            ))}
          </Selector>
          <Boton variante="primario" tamano="sm" onClick={() => guardar(elegido || null)} disabled={guardando}>
            Guardar
          </Boton>
        </div>
        <button type="button" onClick={() => setEditando(false)} className="text-[11.5px] text-gray-500 hover:underline">
          Cancelar
        </button>
      </div>
    )
  }

  if (actual) {
    return (
      <p className="text-[12px] text-gray-600">
        Es vendedor de Cobrify: <span className="font-medium text-gray-900">{nombreDe(actual)}</span>
        {' · '}
        <button type="button" onClick={() => { setElegido(actual); setEditando(true) }} className="text-primary-700 hover:underline">
          Cambiar
        </button>
      </p>
    )
  }

  if (sugerido) {
    return (
      <p className="text-[12px] text-gray-600">
        Su número es el de <span className="font-medium text-gray-900">{sugerido.nombre}</span>, vendedor de Cobrify.{' '}
        <button type="button" onClick={() => guardar(sugerido.id)} disabled={guardando} className="text-primary-700 hover:underline">
          Asignarlo
        </button>
      </p>
    )
  }

  return (
    <button type="button" onClick={() => { setElegido(''); setEditando(true) }} className="text-[11.5px] text-primary-700 hover:underline">
      ¿Es vendedor de Cobrify? Asignarlo
    </button>
  )
}
