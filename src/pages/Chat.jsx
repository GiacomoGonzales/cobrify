import { useState, useEffect, useRef, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  MessageCircle,
  Search,
  Send,
  AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import {
  suscribirConversaciones,
  suscribirMensajes,
  enviarMensaje,
  marcarComoLeida,
  msRestantesDeVentana,
  formatearRestante,
  formatearNumero,
  formatearHora,
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
  // Se refresca solo para que el contador de la ventana no quede congelado.
  const [ahora, setAhora] = useState(Date.now())

  const finDelHilo = useRef(null)

  useEffect(() => {
    if (!user || !isAdmin) return undefined
    const parar = suscribirConversaciones(
      (lista) => { setConversaciones(lista); setCargando(false) },
      () => { setSinPermiso(true); setCargando(false) },
    )
    return parar
  }, [user, isAdmin])

  useEffect(() => {
    setPendientes([])
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

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return conversaciones
    return conversaciones.filter((c) =>
      (c.nombre || '').toLowerCase().includes(t)
      || (c.waId || '').includes(t.replace(/\D/g, '')),
    )
  }, [conversaciones, busqueda])

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
    <div className="h-screen flex bg-gray-50 overflow-hidden">

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
                {busqueda
                  ? 'No hay conversaciones que coincidan.'
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
                <p className="text-xs text-gray-500">{formatearNumero(activa.waId)}</p>
              </div>
              {ventanaAbierta && (
                <span
                  className="text-xs text-gray-500 hidden sm:block"
                  title="Tiempo que queda para responder sin plantilla"
                >
                  Ventana: {formatearRestante(restante)}
                </span>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {hilo.map((m) => {
                const mio = m.direccion === 'saliente'
                return (
                  <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                        mio
                          ? 'bg-green-600 text-white rounded-br-sm'
                          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                      }`}
                    >
                      {m.texto
                        ? <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>
                        : <p className="text-sm italic opacity-75">[{m.tipo}]</p>}
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
    </div>
  )
}
