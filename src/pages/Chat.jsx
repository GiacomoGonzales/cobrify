import { useState, useEffect, useRef, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  FileText,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  StickyNote,
  UserCircle,
  Tag,
  Trash2,
  AlertTriangle,
  X,
} from 'lucide-react'
import FichaCliente from '@/components/chat/FichaCliente'
import TextoWhatsapp, { TarjetaEnlace } from '@/components/chat/TextoWhatsapp'
import MiniaturaPdf, { formatoKB } from '@/components/chat/MiniaturaPdf'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import {
  suscribirConversaciones,
  suscribirMensajes,
  enviarMensaje,
  enviarArchivo,
  ADJUNTOS_ACEPTADOS,
  marcarComoLeida,
  msRestantesDeVentana,
  formatearRestante,
  formatearNumero,
  formatearHora,
  ESTADOS,
  estadoDe,
  cambiarEstado,
  alternarEtiqueta,
  guardarNota,
  suscribirEtiquetas,
  guardarEtiquetas,
  idParaEtiqueta,
} from '@/services/whatsappChatService'

/**
 * Bandeja de WhatsApp.
 *
 * Vive FUERA del panel de administración a propósito: ocupa la pantalla
 * completa, sin el menú de Cobrify alrededor, para que abrirla sea entrar al
 * chat y nada más. Es también lo que después va a servir el subdominio tal
 * cual, sin tocar nada.
 *
 * En el celular se ve un panel por vez (lista o conversación), como cualquier
 * app de mensajes; en pantalla grande, los dos a la vez.
 */
export default function Chat() {
  const { user, isAdmin, isLoading } = useAuth()
  const toast = useToast()

  const [conversaciones, setConversaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [sinPermiso, setSinPermiso] = useState(false)
  const [activaId, setActivaId] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Mensajes recien enviados que todavia no volvieron por la suscripcion.
  // Sin esto la pantalla queda vacia 2 o 3 segundos entre que uno manda y que
  // el mensaje vuelve del servidor, y se siente como si no hubiera salido.
  const [pendientes, setPendientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  // Organización (Fase 1): pestaña por estado, filtro por etiqueta, catálogo.
  const [tab, setTab] = useState('abierta')
  // Los dos mundos: todos / clientes (vinculados a un negocio) / leads.
  const [mundo, setMundo] = useState('todos')
  const [fichaVisible, setFichaVisible] = useState(false)
  const [filtroEtiqueta, setFiltroEtiqueta] = useState(null)
  const [etiquetas, setEtiquetas] = useState([])
  const [tagPickerAbierto, setTagPickerAbierto] = useState(false)
  const [gestorAbierto, setGestorAbierto] = useState(false)
  const [notaAbierta, setNotaAbierta] = useState(false)
  const [notaBorrador, setNotaBorrador] = useState('')
  // Se refresca solo para que el contador de la ventana no quede congelado.
  const [ahora, setAhora] = useState(Date.now())

  const finDelHilo = useRef(null)
  const selectorArchivo = useRef(null)
  // Adjunto elegido, esperando confirmacion (con su vista previa y pie).
  const [adjunto, setAdjunto] = useState(null)
  const [pieAdjunto, setPieAdjunto] = useState('')

  useEffect(() => {
    if (!user || !isAdmin) return undefined
    const parar = suscribirConversaciones(
      (lista) => { setConversaciones(lista); setCargando(false) },
      () => { setSinPermiso(true); setCargando(false) },
    )
    return parar
  }, [user, isAdmin])

  useEffect(() => {
    if (!user || !isAdmin) return undefined
    return suscribirEtiquetas(setEtiquetas)
  }, [user, isAdmin])

  useEffect(() => {
    setPendientes([])
    setTagPickerAbierto(false)
    setNotaAbierta(false)
    setAdjunto(null)
    setPieAdjunto('')
    if (!activaId) { setMensajes([]); return undefined }
    const parar = suscribirMensajes(activaId, setMensajes)
    marcarComoLeida(activaId)
    return parar
  }, [activaId])

  // Al llegar un mensaje, bajar al final del hilo.
  useEffect(() => {
    finDelHilo.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, pendientes])

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  const activa = useMemo(
    () => conversaciones.find((c) => c.id === activaId) || null,
    [conversaciones, activaId],
  )

  // Se calcula contra `ahora` (que se refresca cada minuto) en vez de contra
  // Date.now(): así el contador avanza solo en vez de quedar congelado en el
  // valor que tenía al abrir la conversación.
  const restante = activa
    ? Math.max(0, (activa.ventanaVenceAt?.toMillis?.() || 0) - ahora)
    : 0
  const ventanaAbierta = restante > 0

  // El hilo son los confirmados mas los provisionales que todavia no volvieron.
  // Un pendiente desaparece en cuanto su id ya esta entre los confirmados: asi
  // no se ve dos veces el mismo mensaje ni por un instante.
  const hilo = useMemo(() => {
    const idsConfirmados = new Set(mensajes.map((m) => m.waMessageId || m.id))
    const enVuelo = pendientes.filter((p) => !p.waMessageId || !idsConfirmados.has(p.waMessageId))
    return [...mensajes, ...enVuelo]
  }, [mensajes, pendientes])

  const conteos = useMemo(() => {
    const c = { abierta: 0, pendiente: 0, completada: 0 }
    for (const conv of conversaciones) c[estadoDe(conv)] = (c[estadoDe(conv)] || 0) + 1
    return c
  }, [conversaciones])

  const filtradas = useMemo(() => {
    let lista = conversaciones.filter((c) => estadoDe(c) === tab)
    if (mundo === 'clientes') lista = lista.filter((c) => c.linkedBusinessId)
    if (mundo === 'leads') lista = lista.filter((c) => !c.linkedBusinessId)
    if (filtroEtiqueta) {
      lista = lista.filter((c) => (c.etiquetas || []).includes(filtroEtiqueta))
    }
    const t = busqueda.trim().toLowerCase()
    if (t) {
      lista = lista.filter((c) =>
        (c.nombre || '').toLowerCase().includes(t)
        || (c.waId || '').includes(t.replace(/\D/g, '')),
      )
    }
    return lista
  }, [conversaciones, tab, mundo, filtroEtiqueta, busqueda])

  const etiquetaPorId = useMemo(() => {
    const m = new Map()
    for (const e of etiquetas) m.set(e.id, e)
    return m
  }, [etiquetas])

  const handleEstado = async (estado) => {
    try {
      await cambiarEstado(activaId, estado)
      if (estado !== tab) toast.success(estado === 'completada' ? 'Conversación completada' : estado === 'pendiente' ? 'Movida a pendientes' : 'Conversación reabierta')
    } catch {
      toast.error('No se pudo cambiar el estado')
    }
  }

  const handleGuardarNota = async () => {
    try {
      await guardarNota(activaId, notaBorrador.trim())
      setNotaAbierta(false)
      toast.success(notaBorrador.trim() ? 'Nota guardada' : 'Nota eliminada')
    } catch {
      toast.error('No se pudo guardar la nota')
    }
  }

  const handleEnviar = async (e) => {
    e.preventDefault()
    const limpio = texto.trim()
    if (!limpio || !activaId || enviando) return

    setEnviando(true)
    const previo = texto
    setTexto('')

    // Se pinta al instante con estado 'enviando'. Cuando el mensaje real
    // aparezca por la suscripción, este provisional se descarta (se reconocen
    // por el id que devuelve WhatsApp, no adivinando por el texto).
    const tempId = `pendiente-${Date.now()}`
    setPendientes((p) => [...p, {
      id: tempId,
      direccion: 'saliente',
      tipo: 'text',
      texto: limpio,
      estado: 'enviando',
      timestamp: { toDate: () => new Date() },
    }])

    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      const { waMessageId } = await enviarMensaje(activaId, limpio, idToken)
      setPendientes((p) => p.map((m) => (m.id === tempId ? { ...m, waMessageId } : m)))
    } catch (error) {
      // Devolver el texto al cuadro: perder lo que uno escribió por un error de
      // red es la peor forma de enterarse de que algo falló.
      setPendientes((p) => p.filter((m) => m.id !== tempId))
      setTexto(previo)
      toast.error(error.message || 'No se pudo enviar el mensaje')
    } finally {
      setEnviando(false)
    }
  }

  const handleElegirArchivo = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ADJUNTOS_ACEPTADOS.includes(file.type)) {
      toast.error('Solo imágenes (JPG, PNG, WebP) o PDF')
      return
    }
    setAdjunto(file)
    setPieAdjunto('')
  }

  const handleEnviarAdjunto = async () => {
    if (!adjunto || enviando) return
    setEnviando(true)
    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      await enviarArchivo(activaId, adjunto, pieAdjunto.trim(), idToken)
      setAdjunto(null)
      setPieAdjunto('')
    } catch (error) {
      toast.error(error.message || 'No se pudo enviar el archivo')
    } finally {
      setEnviando(false)
    }
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/app/dashboard" replace />

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden relative">

      {/* ---------- Lista de conversaciones ---------- */}
      <aside
        className={`w-full md:w-80 lg:w-96 border-r border-gray-200 bg-white flex flex-col ${
          activaId ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="w-5 h-5 text-green-600" />
            <h1 className="font-bold text-gray-900">WhatsApp</h1>
          </div>
          {/* Los dos mundos */}
          <div className="flex gap-1 mb-3 text-xs font-semibold">
            {[['todos', 'Todos'], ['clientes', 'Clientes'], ['leads', 'Leads']].map(([id, nombre]) => (
              <button
                key={id}
                onClick={() => setMundo(id)}
                className={`px-3 py-1.5 rounded-full border transition-colors ${
                  mundo === id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {nombre}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o número"
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Pestañas por estado */}
          <div className="flex gap-1 mt-3 bg-gray-100 rounded-lg p-1">
            {ESTADOS.map((e) => (
              <button
                key={e.id}
                onClick={() => setTab(e.id)}
                className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  tab === e.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {e.nombre}
                {conteos[e.id] > 0 && (
                  <span className="ml-1 text-[10px] text-gray-400">{conteos[e.id]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Filtro por etiqueta */}
          {etiquetas.length > 0 && (
            <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {etiquetas.map((e) => {
                const activo = filtroEtiqueta === e.id
                return (
                  <button
                    key={e.id}
                    onClick={() => setFiltroEtiqueta(activo ? null : e.id)}
                    className={`flex-none inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      activo ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                    style={activo
                      ? { backgroundColor: e.color, borderColor: e.color }
                      : { borderColor: '#e5e7eb' }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-none"
                      style={{ backgroundColor: activo ? 'white' : e.color }}
                    />
                    {e.nombre}
                  </button>
                )
              })}
              <button
                onClick={() => setGestorAbierto(true)}
                className="flex-none inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400"
                title="Administrar etiquetas"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {cargando && (
            <p className="p-4 text-sm text-gray-500">Cargando conversaciones...</p>
          )}

          {sinPermiso && (
            <div className="p-4 m-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-900">
                No se pudieron leer las conversaciones. Esta bandeja es solo para
                cuentas de administrador.
              </p>
            </div>
          )}

          {!cargando && !sinPermiso && filtradas.length === 0 && (
            <div className="p-6 text-center">
              <MessageCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                {busqueda || filtroEtiqueta
                  ? 'No hay conversaciones que coincidan.'
                  : tab === 'pendiente'
                    ? 'Nada pendiente.'
                    : tab === 'completada'
                      ? 'Todavía no completaste ninguna conversación.'
                      : 'Todavía no hay conversaciones. Aparecerán acá apenas alguien te escriba.'}
              </p>
            </div>
          )}

          {filtradas.map((c) => {
            const abierta = msRestantesDeVentana(c) > 0
            return (
              <button
                key={c.id}
                onClick={() => setActivaId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  c.id === activaId ? 'bg-green-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm truncate">
                        {c.nombre || formatearNumero(c.waId)}
                      </span>
                      {c.linkedBusinessId && (
                        <span title={c.linkedBusinessName || 'Cliente de Cobrify'}>
                          <UserCircle className="w-3.5 h-3.5 text-green-600 flex-none" />
                        </span>
                      )}
                      {!abierta && (
                        <span title="Ventana de 24 horas cerrada">
                          <Clock className="w-3.5 h-3.5 text-gray-400 flex-none" />
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate mt-0.5">
                      {c.ultimaDireccion === 'saliente' && (
                        <span className="text-gray-400">Vos: </span>
                      )}
                      {c.ultimoMensaje}
                    </p>
                    {((c.etiquetas || []).length > 0 || c.nota) && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {(c.etiquetas || []).slice(0, 3).map((id) => {
                          const e = etiquetaPorId.get(id)
                          if (!e) return null
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-semibold"
                              style={{ backgroundColor: `${e.color}18`, color: e.color }}
                            >
                              {e.nombre}
                            </span>
                          )
                        })}
                        {(c.etiquetas || []).length > 3 && (
                          <span className="text-[10px] text-gray-400">+{(c.etiquetas || []).length - 3}</span>
                        )}
                        {c.nota && <StickyNote className="w-3 h-3 text-amber-500" />}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-none">
                    <span className="text-[11px] text-gray-400">
                      {formatearHora(c.ultimoMensajeAt)}
                    </span>
                    {c.sinLeer > 0 && (
                      <span className="bg-green-500 text-white text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
                        {c.sinLeer}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ---------- Conversación ---------- */}
      <main className={`flex-1 flex flex-col ${activaId ? 'flex' : 'hidden md:flex'}`}>
        {!activa ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Elegí una conversación para leerla</p>
            </div>
          </div>
        ) : (
          <>
            <header className="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
              <button
                onClick={() => setActivaId(null)}
                className="md:hidden p-1 -ml-1 text-gray-600"
                aria-label="Volver a la lista"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-gray-900 truncate">
                  {activa.nombre || formatearNumero(activa.waId)}
                </h2>
                <p className="text-xs text-gray-500 truncate">
                  {formatearNumero(activa.waId)}
                  {activa.linkedBusinessName && (
                    <span className="text-green-700"> · {activa.linkedBusinessName}</span>
                  )}
                </p>
              </div>
              {ventanaAbierta && (
                <span
                  className="text-xs text-gray-500 hidden lg:block"
                  title="Tiempo que queda para responder sin plantilla"
                >
                  Ventana: {formatearRestante(restante)}
                </span>
              )}

              {/* Acciones de organizacion */}
              <div className="flex items-center gap-1 relative">
                <button
                  onClick={() => setFichaVisible((v) => !v)}
                  className={`p-2 rounded-lg hover:bg-gray-100 ${
                    activa.linkedBusinessId ? 'text-green-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title={activa.linkedBusinessId ? `Cliente: ${activa.linkedBusinessName || ''}` : 'Ficha del cliente'}
                >
                  <UserCircle className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setTagPickerAbierto((v) => !v)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  title="Etiquetas"
                >
                  <Tag className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    setNotaBorrador(activa.nota || '')
                    setNotaAbierta((v) => !v)
                  }}
                  className={`p-2 rounded-lg hover:bg-gray-100 ${activa.nota ? 'text-amber-500' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Nota interna"
                >
                  <StickyNote className="w-5 h-5" />
                </button>
                {estadoDe(activa) === 'abierta' && (
                  <button
                    onClick={() => handleEstado('pendiente')}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-amber-600"
                    title="Marcar pendiente"
                  >
                    <Clock className="w-5 h-5" />
                  </button>
                )}
                {estadoDe(activa) !== 'completada' ? (
                  <button
                    onClick={() => handleEstado('completada')}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-green-600"
                    title="Completar"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleEstado('abierta')}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-green-600"
                    title="Reabrir"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                )}

                {/* Selector de etiquetas */}
                {tagPickerAbierto && (
                  <div className="absolute right-0 top-11 z-20 w-60 bg-white border border-gray-200 rounded-xl shadow-lg py-2">
                    {etiquetas.map((e) => {
                      const tiene = (activa.etiquetas || []).includes(e.id)
                      return (
                        <button
                          key={e.id}
                          onClick={() => alternarEtiqueta(activaId, e.id, tiene).catch(() => toast.error('No se pudo cambiar la etiqueta'))}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left hover:bg-gray-50"
                        >
                          <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ backgroundColor: e.color }} />
                          <span className="flex-1 text-gray-800">{e.nombre}</span>
                          {tiene && <Check className="w-4 h-4 text-green-600" />}
                        </button>
                      )
                    })}
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button
                        onClick={() => { setTagPickerAbierto(false); setGestorAbierto(true) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-500 hover:bg-gray-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Administrar etiquetas
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </header>

            {/* Etiquetas puestas, visibles bajo la cabecera */}
            {(activa.etiquetas || []).length > 0 && (
              <div className="px-4 py-1.5 bg-white border-b border-gray-100 flex gap-1.5 flex-wrap">
                {(activa.etiquetas || []).map((id) => {
                  const e = etiquetaPorId.get(id)
                  if (!e) return null
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: `${e.color}18`, color: e.color }}
                    >
                      {e.nombre}
                      <button
                        onClick={() => alternarEtiqueta(activaId, id, true).catch(() => {})}
                        className="opacity-50 hover:opacity-100"
                        aria-label={`Quitar ${e.nombre}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Nota interna: solo la ves vos, el cliente nunca */}
            {notaAbierta && (
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                    Nota interna (el cliente no la ve)
                  </span>
                  <button onClick={() => setNotaAbierta(false)} className="text-amber-500 hover:text-amber-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={notaBorrador}
                  onChange={(e) => setNotaBorrador(e.target.value)}
                  rows={2}
                  placeholder="Quedo en llamar el lunes, pidio cotizacion de 3 sucursales..."
                  className="w-full text-sm bg-white border border-amber-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
                <div className="flex justify-end mt-1.5">
                  <button
                    onClick={handleGuardarNota}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                  >
                    Guardar nota
                  </button>
                </div>
              </div>
            )}
            {!notaAbierta && activa.nota && (
              <button
                onClick={() => { setNotaBorrador(activa.nota); setNotaAbierta(true) }}
                className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-left w-full hover:bg-amber-100 transition-colors"
              >
                <p className="text-xs text-amber-800 truncate">
                  <StickyNote className="w-3 h-3 inline mr-1.5 -mt-0.5" />
                  {activa.nota}
                </p>
              </button>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {hilo.map((m) => {
                const mio = m.direccion === 'saliente'
                return (
                  <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`${m.linkPreview || m.tipo === 'document' ? 'w-72 max-w-[85%]' : 'max-w-[75%]'} rounded-2xl px-3.5 py-2 ${
                        mio
                          ? 'bg-green-600 text-white rounded-br-sm'
                          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                      }`}
                    >
                      {(m.tipo === 'image' || m.tipo === 'sticker') && m.media?.url && (
                        <a href={m.media.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={m.media.url}
                            alt={m.texto || 'Imagen'}
                            loading="lazy"
                            className={`rounded-lg mb-1 ${m.tipo === 'sticker' ? 'w-28' : 'max-w-full max-h-72 object-contain'}`}
                          />
                        </a>
                      )}
                      {m.tipo === 'video' && m.media?.url && (
                        <video src={m.media.url} controls className="rounded-lg mb-1 max-w-full max-h-72" />
                      )}
                      {m.tipo === 'audio' && m.media?.url && (
                        <audio src={m.media.url} controls className="mb-1 max-w-full" />
                      )}
                      {m.tipo === 'document' && m.media?.url && (
                        <BurbujaDocumento media={m.media} mio={mio} />
                      )}
                      {['image', 'sticker', 'video', 'audio', 'document'].includes(m.tipo) && !m.media?.url && (
                        <p className="text-sm italic opacity-75 mb-1">
                          {m.tipo === 'image' ? 'Imagen' : m.tipo === 'audio' ? 'Audio' : m.tipo === 'video' ? 'Video' : m.tipo === 'document' ? 'Documento' : 'Sticker'} no disponible
                        </p>
                      )}
                      {m.linkPreview && <TarjetaEnlace vista={m.linkPreview} mio={mio} />}
                      {m.texto
                        ? (
                          <TextoWhatsapp
                            texto={m.texto}
                            claseEnlace={`underline break-all ${mio ? 'text-green-100' : 'text-blue-600'}`}
                          />
                        )
                        : !['image', 'sticker', 'video', 'audio', 'document'].includes(m.tipo)
                          && <p className="text-sm italic opacity-75">[{m.tipo}]</p>}
                      <div
                        className={`flex items-center gap-1 justify-end mt-0.5 ${
                          mio ? 'text-green-100' : 'text-gray-400'
                        }`}
                      >
                        <span className="text-[10px]">{formatearHora(m.timestamp)}</span>
                        {mio && (
                          m.estado === 'enviando'
                            ? <Clock className="w-3.5 h-3.5 opacity-70" />
                            : m.estado === 'read'
                              ? <CheckCheck className="w-3.5 h-3.5 text-blue-200" />
                              : m.estado === 'delivered'
                                ? <CheckCheck className="w-3.5 h-3.5" />
                                : <Check className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={finDelHilo} />
            </div>

            {/* Cuadro para escribir, o el aviso de por qué no se puede */}
            {ventanaAbierta ? (
              <form
                onSubmit={handleEnviar}
                className="px-4 py-3 bg-white border-t border-gray-200 flex items-center gap-2"
              >
                <input
                  ref={selectorArchivo}
                  type="file"
                  accept={ADJUNTOS_ACEPTADOS}
                  onChange={handleElegirArchivo}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => selectorArchivo.current?.click()}
                  disabled={enviando}
                  className="p-2.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-40"
                  title="Adjuntar imagen o PDF"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escribí un mensaje"
                  disabled={enviando}
                  className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!texto.trim() || enviando}
                  className="p-2.5 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Enviar"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            ) : (
              <div className="px-4 py-3 bg-amber-50 border-t border-amber-200">
                <div className="flex gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-none mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">
                      Pasaron más de 24 horas desde su último mensaje
                    </p>
                    <p className="text-xs text-amber-800 mt-0.5">
                      WhatsApp solo permite responder libremente dentro de las 24 horas.
                      Para escribirle ahora hace falta una plantilla aprobada por Meta,
                      que se cobra aparte. Si te vuelve a escribir, la ventana se reabre.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Vista previa del adjunto antes de enviarlo */}
      {adjunto && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setAdjunto(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-sm">Enviar archivo</h3>
              <button onClick={() => setAdjunto(null)} className="text-gray-400 hover:text-gray-600" aria-label="Cancelar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              {adjunto.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(adjunto)}
                  alt="Vista previa"
                  className="rounded-lg max-h-64 mx-auto object-contain"
                />
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                  <FileText className="w-8 h-8 text-red-500 flex-none" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{adjunto.name}</p>
                    <p className="text-xs text-gray-400">{(adjunto.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                </div>
              )}
              <input
                type="text"
                value={pieAdjunto}
                onChange={(e) => setPieAdjunto(e.target.value)}
                placeholder="Agregar un comentario (opcional)"
                className="w-full mt-4 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setAdjunto(null)}
                disabled={enviando}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEnviarAdjunto}
                disabled={enviando}
                className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ficha del cliente: columna en escritorio, superpuesta en el celular */}
      {activa && fichaVisible && (
        <div className="absolute inset-0 z-30 sm:static sm:z-auto sm:inset-auto flex justify-end bg-black/30 sm:bg-transparent sm:flex-none"
          onClick={() => setFichaVisible(false)}
        >
          <div className="h-full w-full max-w-xs sm:max-w-none sm:w-auto" onClick={(e) => e.stopPropagation()}>
            <FichaCliente
              conversacion={activa}
              onCerrar={() => setFichaVisible(false)}
            />
          </div>
        </div>
      )}

      {gestorAbierto && (
        <GestorDeEtiquetas
          etiquetas={etiquetas}
          onCerrar={() => setGestorAbierto(false)}
          onGuardar={async (lista) => {
            try {
              await guardarEtiquetas(lista)
              toast.success('Etiquetas guardadas')
            } catch {
              toast.error('No se pudieron guardar las etiquetas')
            }
          }}
        />
      )}
    </div>
  )
}

/**
 * Tarjeta de un documento, como la muestra WhatsApp: miniatura de la primera
 * pagina (si es PDF y se pudo dibujar), nombre, paginas y tamano. La miniatura
 * se rasteriza en el navegador desde nuestra copia en R2 — vale igual para
 * enviados y recibidos, incluso los de antes de este cambio.
 */
function BurbujaDocumento({ media, mio }) {
  const [info, setInfo] = useState(null)
  const esPdf = /\.pdf($|\?)/i.test(media.url) || media.mimeType === 'application/pdf'

  return (
    <a
      href={media.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg overflow-hidden mb-1 ${mio ? 'bg-green-700/50' : 'bg-gray-100'}`}
    >
      {esPdf && <MiniaturaPdf url={media.url} onDatos={setInfo} />}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-9 h-9 rounded-lg bg-red-500 flex items-center justify-center flex-none">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${mio ? 'text-white' : 'text-gray-900'}`}>
            {media.filename || 'Documento'}
          </p>
          <p className={`text-xs ${mio ? 'text-green-100' : 'text-gray-500'}`}>
            {info ? `${info.paginas} pagina${info.paginas === 1 ? '' : 's'} · ` : ''}
            {esPdf ? 'PDF' : 'Archivo'}
            {info?.tamano ? ` · ${formatoKB(info.tamano)}` : ''}
          </p>
        </div>
      </div>
    </a>
  )
}

/**
 * Administrar el catalogo de etiquetas: crear, renombrar, recolorear, borrar.
 *
 * Borrar una etiqueta NO recorre las conversaciones quitandola: el id huerfano
 * simplemente deja de mostrarse (la pantalla ignora ids que no estan en el
 * catalogo). Es barato, reversible —recrearla con el mismo nombre la revive— y
 * evita una escritura masiva por un clic.
 */
const COLORES = ['#1B6E4A', '#A3352C', '#26456E', '#96690F', '#6B7280', '#7C3AED', '#0E7490', '#BE185D']

function GestorDeEtiquetas({ etiquetas, onCerrar, onGuardar }) {
  const [lista, setLista] = useState(etiquetas)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [colorNuevo, setColorNuevo] = useState(COLORES[0])

  const agregar = () => {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    const id = idParaEtiqueta(nombre)
    if (lista.some((e) => e.id === id)) return
    setLista([...lista, { id, nombre, color: colorNuevo }])
    setNombreNuevo('')
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Etiquetas</h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {lista.map((e, i) => (
            <div key={e.id} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
              <input
                type="color"
                value={e.color}
                onChange={(ev) => {
                  const copia = [...lista]
                  copia[i] = { ...e, color: ev.target.value }
                  setLista(copia)
                }}
                className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                title="Color"
              />
              <input
                type="text"
                value={e.nombre}
                onChange={(ev) => {
                  const copia = [...lista]
                  copia[i] = { ...e, nombre: ev.target.value }
                  setLista(copia)
                }}
                className="flex-1 text-sm px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-gray-300 rounded-lg focus:outline-none"
              />
              <button
                onClick={() => setLista(lista.filter((x) => x.id !== e.id))}
                className="p-1.5 text-gray-300 hover:text-red-500"
                title="Eliminar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-3">
            <input
              type="color"
              value={colorNuevo}
              onChange={(e) => setColorNuevo(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
              title="Color"
            />
            <input
              type="text"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar() }}
              placeholder="Nueva etiqueta"
              className="flex-1 text-sm px-3 py-1.5 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={agregar}
              disabled={!nombreNuevo.trim()}
              className="p-1.5 text-green-600 hover:text-green-700 disabled:opacity-30"
              title="Agregar"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              const limpias = lista
                .map((e) => ({ ...e, nombre: e.nombre.trim() }))
                .filter((e) => e.nombre)
              await onGuardar(limpias)
              onCerrar()
            }}
            className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
