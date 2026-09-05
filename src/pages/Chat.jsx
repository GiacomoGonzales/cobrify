import { useState, useEffect, useRef, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Film,
  Music,
  MessageCircle,
  Paperclip,
  Plus,
  Camera,
  Mic,
  Reply,
  Search,
  Send,
  StickyNote,
  UserCircle,
  Megaphone,
  Settings,
  ArrowDown,
  Trash2,
  AlertCircle,
  SmilePlus,
  Trash,
  X,
} from 'lucide-react'
import FichaCliente from '@/components/chat/FichaCliente'
import TextoWhatsapp, { TarjetaEnlace } from '@/components/chat/TextoWhatsapp'
import { Boton, useMenuDeFila, BotonDeFila, CajaMenu, ItemMenu, SeparadorMenu } from '@/components/admin/ui'
import MiniaturaPdf, { formatoKB } from '@/components/chat/MiniaturaPdf'
import SelectorPlantilla from '@/components/chat/SelectorPlantilla'
import VisorMedia from '@/components/chat/VisorMedia'
import PanelMultimedia from '@/components/chat/PanelMultimedia'
import ConfiguracionChat from '@/components/chat/ConfiguracionChat'
import { useGrabadora, relojDeGrabacion } from '@/components/chat/grabadoraDeVoz'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { MARCA_CHAT } from '@/utils/dominioChat'
import { useTema } from '@/utils/temaOscuro'
import BotonTema from '@/components/BotonTema'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import {
  suscribirConversaciones,
  suscribirMensajes,
  enviarMensaje,
  enviarArchivo,
  enviarArchivoGuardado,
  validarArchivo,
  ADJUNTOS_ACEPTADOS,
  NOMBRE_TIPO,
  marcarComoLeida,
  msRestantesDeVentana,
  formatearRestante,
  formatearNumero,
  formatearHora,
  formatearDia,
  claveDeDia,
  reaccionar,
  avisarLeido,
  EMOJIS_REACCION,
  ESTADOS,
  estadoDe,
  cambiarEstado,
  alternarEtiqueta,
  guardarNota,
  suscribirEtiquetas,
  guardarEtiquetas,
  idParaEtiqueta,
  enviarPlantilla,
  enviarCampana,
  suscribirCampana,
  revertirBaja,
  suscribirAutomaticos,
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
  const { user, isAdmin, isLoading, rolesResolved } = useAuth()
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
  const [gestorAbierto, setGestorAbierto] = useState(false)
  const [notaAbierta, setNotaAbierta] = useState(false)
  const [notaBorrador, setNotaBorrador] = useState('')
  // Se refresca solo para que el contador de la ventana no quede congelado.
  const [ahora, setAhora] = useState(Date.now())
  // Plantillas y campañas (Fase 4)
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [campanaAbierta, setCampanaAbierta] = useState(false)
  const [campanaEnCurso, setCampanaEnCurso] = useState(null)
  // Filtro rapido: a quienes les escribimos y no contestaron en 7 dias.
  const [soloSinRespuesta, setSoloSinRespuesta] = useState(false)
  // Configuracion del chat (perfil, automaticos, rapidas) en el panel principal.
  const [configAbierta, setConfigAbierta] = useState(false)
  const [respuestasRapidas, setRespuestasRapidas] = useState([])

  const contenedorHilo = useRef(null)
  // Si el usuario esta mirando el final del hilo. Cuando esta leyendo mensajes
  // viejos NO hay que arrastrarlo abajo porque llego uno nuevo.
  const pegadoAlFondo = useRef(true)
  // Para MOSTRAR el boton de bajar hace falta estado: `pegadoAlFondo` es una
  // referencia y no vuelve a pintar nada al cambiar.
  const [lejosDelFondo, setLejosDelFondo] = useState(false)
  // La primera bajada de una conversacion es un salto, no una animacion.
  const reciénAbierta = useRef(true)
  const selectorArchivo = useRef(null)
  const cuadroTexto = useRef(null)
  // Adjunto elegido, esperando confirmacion (con su vista previa y pie).
  const [adjunto, setAdjunto] = useState(null)
  const [pieAdjunto, setPieAdjunto] = useState('')
  // Archivo de una respuesta rapida: ya esta guardado, asi que no se sube de
  // nuevo — queda enganchado al cuadro y sale con el texto como pie.
  const [adjuntoGuardado, setAdjuntoGuardado] = useState(null)
  // Visor de imagenes, panel de archivos y busqueda dentro de la conversacion.
  const [visorIndice, setVisorIndice] = useState(null)
  const [panelMedia, setPanelMedia] = useState(false)
  // El menu "..." de la cabecera, el mismo del admin.
  const menuCabecera = useMenuDeFila()
  const menuEtiquetas = useMenuDeFila()
  const menuTagsConv = useMenuDeFila()
  // Claro u oscuro. Se guarda aparte del panel: son personas distintas.
  const [tema, cambiarTema] = useTema('chatTema')

  // En la app: iconos del status bar segun el tema (la franja de arriba es
  // blanca u oscura), y al salir se devuelve el estilo de la app principal.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined
    StatusBar.setStyle({ style: tema === 'oscuro' ? Style.Dark : Style.Light }).catch(() => {})
    return () => { StatusBar.setStyle({ style: Style.Dark }).catch(() => {}) }
  }, [tema])
  // La etiqueta del filtro, para nombrarla en el boton del desplegable.
  const etiquetaElegida = etiquetas.find((e) => e.id === filtroEtiqueta) || null
  const [buscarEnChat, setBuscarEnChat] = useState('')
  const [buscadorAbierto, setBuscadorAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(null)
  // Cual sugerencia esta seleccionada con las flechas.
  const [sugerenciaSel, setSugerenciaSel] = useState(0)
  // Citar y reaccionar. `menuMensaje` es el mensaje con las acciones a la
  // vista: en el escritorio salen al pasar el mouse, y en el celular no hay
  // mouse, asi que tocar la burbuja las muestra.
  const [respondiendoA, setRespondiendoA] = useState(null)
  const [menuMensaje, setMenuMensaje] = useState(null)
  const [paletaAbierta, setPaletaAbierta] = useState(null)

  // Las acciones flotantes de un mensaje —responder, reaccionar, la paleta de
  // emojis— se cierran al tocar fuera y con Escape. Antes solo se iban
  // eligiendo una opcion o abriendo las de otro mensaje, asi que si te
  // arrepentias se quedaban puestas.
  //
  // "Dentro" son la BURBUJA y los BOTONES (marcados con data-mensaje), no la
  // fila. La fila ocupa todo el ancho de la conversacion, asi que comparar
  // contra ella dejaba fuera de juego a la mitad de la pantalla: en un mensaje
  // propio, alineado a la derecha, todo el vacio de la izquierda contaba como
  // "dentro" y el clic no cerraba nada.
  //
  // La burbuja entra a proposito: tocarla es lo que abre y cierra el menu, y
  // tocar un emoji no debe cerrar la paleta antes de registrar la reaccion.
  useEffect(() => {
    const abiertoEn = menuMensaje || paletaAbierta
    if (!abiertoEn) return undefined
    const cerrar = () => { setMenuMensaje(null); setPaletaAbierta(null) }
    const alTocar = (e) => {
      if (e.target?.closest?.(`[data-mensaje="${abiertoEn}"]`)) return
      cerrar()
    }
    const alTeclear = (e) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('mousedown', alTocar, true)
    document.addEventListener('touchstart', alTocar, true)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alTocar, true)
      document.removeEventListener('touchstart', alTocar, true)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [menuMensaje, paletaAbierta])
  // Reacciones puestas por mi que todavia no volvieron del servidor. Sin esto
  // el emoji tarda medio segundo en aparecer y el toque se siente muerto.
  const [reaccionesOptimistas, setReaccionesOptimistas] = useState({})
  // Ultimo mensaje del cliente por el que ya se aviso "leido" a WhatsApp, para
  // no repetir la llamada en cada render.
  const avisadoLeido = useRef(null)
  // Grabar notas de voz. `puedeGrabar` es false en los navegadores que solo
  // saben grabar formatos que WhatsApp rechaza: ahi no se ofrece el microfono.
  const grabadora = useGrabadora()
  const selectorCamara = useRef(null)
  // El boton de camara solo tiene sentido donde hay una: en el escritorio abre
  // el mismo dialogo de archivos y confunde.
  const hayCamara = typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: coarse)').matches

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
    if (!user || !isAdmin) return undefined
    return suscribirAutomaticos((c) => setRespuestasRapidas(c.respuestasRapidas || []))
  }, [user, isAdmin])

  // Sugerencias de respuestas rapidas: al tipear "/" en el cuadro.
  const sugerenciasRapidas = useMemo(() => {
    if (!texto.startsWith('/')) return []
    const q = texto.slice(1).toLowerCase()
    return respuestasRapidas.filter((r) => r.atajo.startsWith(q)).slice(0, 6)
  }, [texto, respuestasRapidas])

  useEffect(() => { setSugerenciaSel(0) }, [texto])

  const aplicarRapida = (r) => {
    const nombre = (activa?.nombre || '').split(' ')[0]
    setTexto(r.texto.replace(/\{nombre\}/gi, nombre))
    // El archivo ya esta guardado: se engancha al cuadro y viaja como pie del
    // mensaje al enviar, sin volver a subirlo.
    setAdjuntoGuardado(r.media || null)
    // El cursor vuelve al cuadro: se elige el atajo y se manda con Enter, sin
    // tocar el mouse.
    setTimeout(() => cuadroTexto.current?.focus(), 0)
  }

  useEffect(() => {
    if (activaId) setConfigAbierta(false)
    setPendientes([])
    menuTagsConv.cerrar()
    setNotaAbierta(false)
    setAdjunto(null)
    setPieAdjunto('')
    setAdjuntoGuardado(null)
    setPanelMedia(false)
    setBuscadorAbierto(false)
    setBuscarEnChat('')
    setResaltado(null)
    setRespondiendoA(null)
    setMenuMensaje(null)
    setPaletaAbierta(null)
    setReaccionesOptimistas({})
    avisadoLeido.current = null
    pegadoAlFondo.current = true
    reciénAbierta.current = true
    if (!activaId) { setMensajes([]); return undefined }
    const parar = suscribirMensajes(activaId, setMensajes)
    marcarComoLeida(activaId)
    return parar
  }, [activaId])

  const irAlFondo = (suave) => {
    const c = contenedorHilo.current
    if (!c) return
    c.scrollTo({ top: c.scrollHeight, behavior: suave ? 'smooth' : 'auto' })
  }

  // Bajar al final del hilo.
  //
  // Al ABRIR una conversacion es un salto instantaneo, no una animacion: el
  // scroll suave tarda ~300 ms y en ese rato las imagenes y los PDF terminan
  // de cargar, empujan el contenido hacia abajo y la animacion queda a mitad
  // de camino. Saltar es instantaneo y no puede quedar corto.
  //
  // Con la conversacion ya abierta, un mensaje nuevo baja suave — pero SOLO si
  // el usuario estaba mirando el final. Si esta leyendo mensajes viejos, se
  // respeta donde esta.
  useEffect(() => {
    if (!pegadoAlFondo.current) return
    if (reciénAbierta.current) {
      irAlFondo(false)
      // Dos pasadas mas: el contenido que carga tarde (imagenes, miniaturas de
      // PDF) cambia el alto despues del primer render.
      requestAnimationFrame(() => irAlFondo(false))
      setTimeout(() => irAlFondo(false), 150)
      reciénAbierta.current = false
    } else {
      irAlFondo(true)
    }
  }, [mensajes, pendientes])

  // Mientras el usuario mire el final, mantenerlo ahi aunque el contenido
  // crezca por su cuenta: una imagen que termina de cargar agranda su burbuja
  // y empujaria el ultimo mensaje fuera de la vista.
  useEffect(() => {
    const c = contenedorHilo.current
    if (!c || !activaId) return undefined
    const obs = new ResizeObserver(() => {
      if (pegadoAlFondo.current) irAlFondo(false)
    })
    for (const hijo of c.children) obs.observe(hijo)
    return () => obs.disconnect()
  }, [activaId, mensajes.length])

  // Avisarle a WhatsApp que leimos: es lo que le pinta al cliente las dos
  // palomitas azules. Se dispara con la conversacion abierta, por el ULTIMO
  // mensaje entrante — Meta marca ese y todos los anteriores de una vez.
  useEffect(() => {
    if (!activaId || !mensajes.length) return
    const ultimoEntrante = [...mensajes].reverse()
      .find((m) => m.direccion !== 'saliente' && m.waMessageId)
    if (!ultimoEntrante) return
    if (avisadoLeido.current === ultimoEntrante.waMessageId) return
    avisadoLeido.current = ultimoEntrante.waMessageId
    getAuth().currentUser?.getIdToken()
      .then((idToken) => avisarLeido(activaId, ultimoEntrante.waMessageId, idToken))
      .catch(() => {})
  }, [activaId, mensajes])

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!campanaEnCurso?.id) return undefined
    return suscribirCampana(campanaEnCurso.id, setCampanaEnCurso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanaEnCurso?.id])

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

  // Al abrir una conversacion, el cursor va al cuadro de escribir: se abre y
  // se responde sin tocar nada mas.
  //
  // SOLO en escritorio. En el celular enfocar levanta el teclado y tapa media
  // pantalla cuando uno solo queria leer; WhatsApp hace exactamente esta
  // distincion. `pointer: fine` es lo que separa un mouse de un dedo.
  //
  // OJO: va DESPUES de `ventanaAbierta`. El arreglo de dependencias se evalua
  // durante el render, asi que un hook que nombra una const declarada mas
  // abajo revienta con "Cannot access before initialization" — y `vite build`
  // NO lo detecta, solo se ve al abrir la pantalla.
  useEffect(() => {
    if (!activaId || !ventanaAbierta) return
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
    cuadroTexto.current?.focus()
  }, [activaId, ventanaAbierta])

  // El hilo son los confirmados mas los provisionales que todavia no volvieron.
  // Un pendiente desaparece en cuanto su id ya esta entre los confirmados: asi
  // no se ve dos veces el mismo mensaje ni por un instante.
  const hilo = useMemo(() => {
    const idsConfirmados = new Set(mensajes.map((m) => m.waMessageId || m.id))
    const enVuelo = pendientes.filter((p) => !p.waMessageId || !idsConfirmados.has(p.waMessageId))
    return [...mensajes, ...enVuelo]
  }, [mensajes, pendientes])

  // El hilo cortado por dias. El separador se arma una sola vez aca en vez de
  // preguntarse en cada burbuja si cambio el dia respecto de la anterior.
  const elementos = useMemo(() => {
    const salida = []
    let diaPrevio = null
    for (const m of hilo) {
      const dia = claveDeDia(m.timestamp)
      if (dia && dia !== diaPrevio) {
        salida.push({ separador: true, id: `dia-${dia}`, rotulo: formatearDia(m.timestamp) })
        diaPrevio = dia
      }
      salida.push({ separador: false, id: m.id, mensaje: m })
    }
    return salida
  }, [hilo])

  // Buscar el mensaje citado por otro. Los mensajes viejos que ya no estan en
  // la ventana cargada no se encuentran: ahi la cita se muestra sin texto.
  const mensajePorWaId = useMemo(() => {
    const mapa = new Map()
    for (const m of hilo) if (m.waMessageId || m.id) mapa.set(m.waMessageId || m.id, m)
    return mapa
  }, [hilo])

  // Retirar lo pintado a mano cuando el servidor ya devolvio lo mismo: si no,
  // una reaccion quitada desde el telefono no se veria desaparecer aca.
  useEffect(() => {
    setReaccionesOptimistas((r) => {
      if (!Object.keys(r).length) return r
      let cambio = false
      const copia = { ...r }
      for (const m of mensajes) {
        if (copia[m.id] !== undefined && (m.reacciones?.mia || '') === copia[m.id]) {
          delete copia[m.id]
          cambio = true
        }
      }
      return cambio ? copia : r
    })
  }, [mensajes])

  // Todas las imagenes del hilo, para que el visor navegue entre ellas.
  const imagenesDelHilo = useMemo(
    () => hilo.filter((m) => (m.tipo === 'image' || m.tipo === 'sticker') && m.media?.url)
      .map((m) => m.media),
    [hilo],
  )

  const abrirVisorDe = (media) => {
    const i = imagenesDelHilo.findIndex((x) => x.url === media.url)
    setVisorIndice(i >= 0 ? i : 0)
  }

  // Ir a un mensaje puntual: lo trae a la vista y lo resalta un momento.
  const irAlMensaje = (id) => {
    setPanelMedia(false)
    setResaltado(id)
    // Se va a un mensaje viejo a proposito: no arrastrarlo de vuelta al final
    // si entra un mensaje nuevo mientras lo lee.
    pegadoAlFondo.current = false
    setTimeout(() => {
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    setTimeout(() => setResaltado(null), 2500)
  }

  // Coincidencias de la busqueda dentro de la conversacion.
  const coincidencias = useMemo(() => {
    const q = buscarEnChat.trim().toLowerCase()
    if (!q) return []
    return hilo.filter((m) => (m.texto || '').toLowerCase().includes(q))
  }, [hilo, buscarEnChat])

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
    if (soloSinRespuesta) {
      const hace7 = ahora - 7 * 86400000
      lista = lista.filter((c) =>
        c.ultimaDireccion === 'saliente'
        && (c.ultimoMensajeAt?.toMillis?.() || 0) < hace7,
      )
    }
    const t = busqueda.trim().toLowerCase()
    if (t) {
      lista = lista.filter((c) =>
        (c.nombre || '').toLowerCase().includes(t)
        || (c.waId || '').includes(t.replace(/\D/g, '')),
      )
    }
    return lista
  }, [conversaciones, tab, mundo, filtroEtiqueta, busqueda, soloSinRespuesta, ahora])

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

  // El id con el que Meta conoce un mensaje. Los provisionales (los que
  // todavia no volvieron del servidor) no tienen, y por eso no se pueden citar
  // ni reaccionar hasta que llegan.
  const idDeWhatsapp = (m) => m?.waMessageId || (m?.id?.startsWith('pendiente-') ? null : m?.id)

  /** Lo que se lee en el bloque de cita: el texto, o qué tipo de archivo era. */
  const resumenDeCita = (m) => {
    if (m.texto) return m.texto
    switch (m.tipo) {
      case 'image': return '📷 Foto'
      case 'video': return '🎬 Video'
      case 'audio': return '🎤 Nota de voz'
      case 'document': return '📄 Documento'
      case 'sticker': return 'Sticker'
      default: return 'Mensaje'
    }
  }

  const citarMensaje = (m) => {
    if (!idDeWhatsapp(m)) { toast.error('Esperá a que el mensaje termine de salir'); return }
    setRespondiendoA(m)
    setMenuMensaje(null)
    cuadroTexto.current?.focus()
  }

  /**
   * Poner o sacar una reaccion. Meta no tiene una llamada para borrar: se manda
   * el emoji vacio, y tocar el mismo emoji que ya estaba es justamente eso.
   */
  const alternarReaccion = async (m, emoji) => {
    const waId = idDeWhatsapp(m)
    if (!waId) return
    setPaletaAbierta(null)
    setMenuMensaje(null)
    const puesta = reaccionDeM(m)
    const nueva = puesta === emoji ? '' : emoji
    setReaccionesOptimistas((r) => ({ ...r, [m.id]: nueva }))
    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      await reaccionar(activaId, waId, nueva, idToken)
    } catch (error) {
      // Se retira lo pintado: dejar el emoji puesto cuando no llego seria
      // mentirle al usuario sobre lo que ve el cliente.
      setReaccionesOptimistas((r) => {
        const copia = { ...r }
        delete copia[m.id]
        return copia
      })
      toast.error(error.message || 'No se pudo reaccionar')
    }
  }

  /** Mi reaccion: la que se ve, con lo optimista por delante. */
  const reaccionDeM = (m) => {
    const optimista = reaccionesOptimistas[m.id]
    if (optimista !== undefined) return optimista
    return m.reacciones?.mia || ''
  }

  const handleEnviar = async (e) => {
    e.preventDefault()
    const limpio = texto.trim()
    if (!limpio || !activaId || enviando) return

    setEnviando(true)
    const previo = texto
    const conArchivo = adjuntoGuardado
    const citado = respondiendoA
    setTexto('')
    setAdjuntoGuardado(null)
    setRespondiendoA(null)

    // Se pinta al instante con estado 'enviando'. Cuando el mensaje real
    // aparezca por la suscripción, este provisional se descarta (se reconocen
    // por el id que devuelve WhatsApp, no adivinando por el texto).
    const tempId = `pendiente-${Date.now()}`
    setPendientes((p) => [...p, {
      id: tempId,
      direccion: 'saliente',
      tipo: conArchivo?.tipo || 'text',
      texto: limpio,
      ...(conArchivo ? { media: conArchivo } : {}),
      ...(citado ? { respondeA: idDeWhatsapp(citado) } : {}),
      estado: 'enviando',
      timestamp: { toDate: () => new Date() },
    }])

    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      const { waMessageId } = conArchivo
        ? await enviarArchivoGuardado(activaId, conArchivo, limpio, idToken, citado ? idDeWhatsapp(citado) : null)
        : await enviarMensaje(activaId, limpio, idToken, citado ? idDeWhatsapp(citado) : null)
      setPendientes((p) => p.map((m) => (m.id === tempId ? { ...m, waMessageId } : m)))
    } catch (error) {
      // Devolver el texto al cuadro: perder lo que uno escribió por un error de
      // red es la peor forma de enterarse de que algo falló.
      setPendientes((p) => p.filter((m) => m.id !== tempId))
      setTexto(previo)
      setAdjuntoGuardado(conArchivo)
      setRespondiendoA(citado)
      toast.error(error.message || 'No se pudo enviar el mensaje')
    } finally {
      setEnviando(false)
      // El boton de enviar se queda con el cursor; devolverlo permite encadenar
      // mensajes sin volver a hacer clic.
      if (cuadroTexto.current) cuadroTexto.current.style.height = 'auto'
      if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
        cuadroTexto.current?.focus()
      }
    }
  }

  const handleGrabar = async () => {
    const r = await grabadora.empezar()
    if (!r.ok) toast.error(r.motivo)
  }

  /** Termina la grabación y la manda. Una nota de voz sale sola, sin pie. */
  const handleEnviarNota = async () => {
    const archivo = await grabadora.terminar()
    if (!archivo) return
    const problema = validarArchivo(archivo)
    if (problema) { toast.error(problema); return }
    setEnviando(true)
    const citado = respondiendoA ? idDeWhatsapp(respondiendoA) : null
    setRespondiendoA(null)
    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      await enviarArchivo(activaId, archivo, '', idToken, citado)
    } catch (error) {
      toast.error(error.message || 'No se pudo enviar la nota de voz')
    } finally {
      setEnviando(false)
    }
  }

  const handleElegirArchivo = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problema = validarArchivo(file)
    if (problema) { toast.error(problema); return }
    setAdjunto(file)
    setPieAdjunto('')
  }

  const handleEnviarAdjunto = async () => {
    if (!adjunto || enviando) return
    setEnviando(true)
    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      const citado = respondiendoA ? idDeWhatsapp(respondiendoA) : null
      await enviarArchivo(activaId, adjunto, pieAdjunto.trim(), idToken, citado)
      setAdjunto(null)
      setPieAdjunto('')
      setRespondiendoA(null)
    } catch (error) {
      toast.error(error.message || 'No se pudo enviar el archivo')
    } finally {
      setEnviando(false)
    }
  }

  // Esperar a que los ROLES esten resueltos, no solo a que isLoading se apague.
  // Al iniciar sesion, onAuthChange pone rolesResolved en false SIN volver a
  // encender isLoading: en ese hueco isAdmin todavia es false y esta pantalla
  // rebotaba al dashboard justo despues de entrar — que es exactamente lo que
  // no debe pasar cuando entras por chat.cobrifyperu.com.
  if (isLoading || !rolesResolved) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/app/dashboard" replace />

  return (
    <div className={`chat-cobrify font-admin text-[13px] text-gray-900 antialiased h-screen flex flex-col bg-gray-200 overflow-hidden ${tema === 'oscuro' ? 'oscuro' : ''}`}>
      {/* En la app el contenido se dibuja debajo del status bar y de la barra
          de gestos (edge-to-edge): estas dos franjas, del color de las
          cabeceras, los cubren. En el navegador miden 0. La app principal
          hace lo mismo en su MainLayout; el chat no lo tenia y la cabecera
          quedaba debajo del status bar en la tablet. */}
      {Capacitor.isNativePlatform() && (
        <div className="bg-white flex-none" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
      )}
      <div className="flex-1 min-h-0 flex relative">

      {/* ---------- Lista de conversaciones ---------- */}
      <aside
        className="w-full md:w-80 lg:w-96 xl:w-[420px] border-r border-gray-200 bg-white flex flex-col"
      >
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            {/* La marca del producto, no la del canal: el cliente contrata
                Cobrify Chat, WhatsApp es por donde llegan los mensajes. El
                icono es el mismo de la app de iOS. */}
            <img src={MARCA_CHAT.iconoChico} alt="" className="w-6 h-6 rounded-md flex-none" />
            <h1 className="font-semibold text-gray-900">{MARCA_CHAT.nombre}</h1>
            <BotonTema tema={tema} onCambiar={cambiarTema} className="ml-auto" />
            <button
              onClick={() => { setConfigAbierta(true); setActivaId(null) }}
              className={`p-1.5 rounded-lg hover:bg-gray-100 ${configAbierta ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Configuracion del chat"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
          {/* Los dos mundos */}
          {/* Pestañas como las del admin: el activo se marca con la línea de
              abajo, no rellenando la píldora de negro. */}
          <div className="flex items-center gap-1 mb-3 -mx-1 border-b border-gray-200">
            {[['todos', 'Todos'], ['clientes', 'Clientes'], ['leads', 'Leads']].map(([id, nombre]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMundo(id)}
                className={`px-3 py-2 text-[12.5px] border-b-2 -mb-px transition-colors ${
                  mundo === id
                    ? 'border-gray-900 text-gray-900 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                {nombre}
              </button>
            ))}
            {etiquetas.length > 0 && (
              <div className="relative ml-auto mb-1.5 flex-none">
                <button
                  type="button"
                  onClick={(ev) => menuEtiquetas.alternar('etiquetas', ev.currentTarget)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    etiquetaElegida
                      ? 'border-gray-900 bg-gray-100 text-gray-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Filtrar por etiqueta"
                >
                  {etiquetaElegida && (
                    <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ backgroundColor: etiquetaElegida.color }} />
                  )}
                  {etiquetaElegida ? etiquetaElegida.nombre : 'Etiquetas'}
                  <span className="text-gray-400">▾</span>
                </button>

                {menuEtiquetas.abiertoEn === 'etiquetas' && (
                  <CajaMenu posicion={menuEtiquetas.posicion} refMenu={menuEtiquetas.refMenu}>
                    <ItemMenu onClick={() => { menuEtiquetas.cerrar(); setFiltroEtiqueta(null) }}>
                      Todas las etiquetas
                    </ItemMenu>
                    <SeparadorMenu />
                    {etiquetas.map((e) => (
                      <ItemMenu
                        key={e.id}
                        onClick={() => { menuEtiquetas.cerrar(); setFiltroEtiqueta(filtroEtiqueta === e.id ? null : e.id) }}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ backgroundColor: e.color }} />
                          {e.nombre}
                          {filtroEtiqueta === e.id && <span className="ml-auto text-gray-400">✓</span>}
                        </span>
                      </ItemMenu>
                    ))}
                    <SeparadorMenu />
                    <ItemMenu onClick={() => { menuEtiquetas.cerrar(); setGestorAbierto(true) }}>
                      Administrar etiquetas
                    </ItemMenu>
                  </CajaMenu>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o número"
              className="w-full pl-9 pr-3 py-2 text-[13px] bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Pestañas por estado */}
          <div className="flex gap-1 mt-3 bg-gray-100 rounded-lg p-1">
            {ESTADOS.map((e) => (
              <button
                key={e.id}
                onClick={() => setTab(e.id)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[11.5px] transition-colors ${
                  tab === e.id
                    ? 'bg-white text-gray-900 font-medium border border-gray-200'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {e.nombre}
                {conteos[e.id] > 0 && (
                  <span className="ml-1 text-[11px] text-gray-400">{conteos[e.id]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Sin respuesta + etiquetas + campaña, todo en una linea. Las
              etiquetas eran una fila propia que crecia con cada etiqueta
              nueva y empujaba la lista de conversaciones hacia abajo. */}
          <div className="flex items-center gap-2 mt-2.5">
            <button
              onClick={() => setSoloSinRespuesta((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                soloSinRespuesta ? 'border-gray-900 bg-gray-100 text-gray-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
              title="Les escribimos y no contestaron en 7 dias"
            >
              <Clock className="w-3 h-3" />
              Sin respuesta +7d
            </button>
            {filtradas.length > 0 && (
              <button
                onClick={() => setCampanaAbierta(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                title="Enviar una plantilla a todas las conversaciones de esta lista"
              >
                <Megaphone className="w-3 h-3" />
                Campaña a {filtradas.length}
              </button>
            )}
          </div>

          {campanaEnCurso && (
            <div className="mt-2.5 bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="font-semibold text-primary-800 truncate">{campanaEnCurso.titulo}</span>
                <button onClick={() => setCampanaEnCurso(null)} className="text-primary-600 hover:text-primary-800" aria-label="Ocultar">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="h-1.5 bg-primary-100 rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-primary-600 transition-all"
                  style={{ width: `${Math.round(((campanaEnCurso.enviados || 0) + (campanaEnCurso.fallidos || 0) + (campanaEnCurso.omitidos || 0)) / Math.max(1, campanaEnCurso.total) * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-primary-800 mt-1">
                {campanaEnCurso.enviados || 0} enviados
                {campanaEnCurso.fallidos ? ` · ${campanaEnCurso.fallidos} fallidos` : ''}
                {campanaEnCurso.omitidos ? ` · ${campanaEnCurso.omitidos} omitidos (baja)` : ''}
                {' '}de {campanaEnCurso.total}
                {campanaEnCurso.estado === 'terminada' ? ' · terminada' : ''}
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {cargando && (
            <p className="p-4 text-[13px] text-gray-500">Cargando conversaciones...</p>
          )}

          {sinPermiso && (
            <div className="p-4 m-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-[13px] text-gray-900">
                No se pudieron leer las conversaciones. Esta bandeja es solo para
                cuentas de administrador.
              </p>
            </div>
          )}

          {!cargando && !sinPermiso && filtradas.length === 0 && (
            <div className="p-6 text-center">
              <MessageCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-[13px] text-gray-500">
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
                  c.id === activaId ? 'bg-gray-100' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <Avatar nombre={c.nombre} waId={c.waId} cliente={!!c.linkedBusinessId} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-[13px] truncate">
                        {c.nombre || formatearNumero(c.waId)}
                      </span>
                      {/* El rol de quien escribe cuando no es el titular
                          ("Secretaria"): sin esto se atiende a ciegas. */}
                      {c.rolContacto && (
                        <span className="text-[11.5px] text-gray-400 truncate max-w-[7rem]">
                          {c.rolContacto}
                        </span>
                      )}
                      {c.linkedBusinessId && (
                        <span title={[c.linkedBusinessName || 'Cliente de Cobrify', c.rolContacto].filter(Boolean).join(' · ')}>
                          <UserCircle className="w-3.5 h-3.5 text-primary-600 flex-none" />
                        </span>
                      )}
                      {!abierta && (
                        <span title="Ventana de 24 horas cerrada">
                          <Clock className="w-3.5 h-3.5 text-gray-400 flex-none" />
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-gray-500 truncate mt-0.5">
                      {c.ultimaDireccion === 'saliente' && (
                        <span className="text-gray-400">Tú: </span>
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
                              className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[11px] font-semibold"
                              style={{ backgroundColor: `${e.color}18`, color: e.color }}
                            >
                              {e.nombre}
                            </span>
                          )
                        })}
                        {(c.etiquetas || []).length > 3 && (
                          <span className="text-[11px] text-gray-400">+{(c.etiquetas || []).length - 3}</span>
                        )}
                        {c.nota && <StickyNote className="w-3 h-3 text-gray-500" />}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-none">
                    <span className="text-[11px] text-gray-400">
                      {formatearHora(c.ultimoMensajeAt)}
                    </span>
                    {c.sinLeer > 0 && (
                      <span className="bg-primary-500 text-white text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
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
      {/* En móvil la conversación entra deslizándose sobre la lista y sale por
          donde vino, como en cualquier app de mensajería. Se mueve la capa
          entera con `transform`, que el navegador resuelve sin volver a
          dibujar nada — de ahí que no se sienta pesado en un Android modesto.
          En escritorio no cambia nada: `max-md:` solo aplica por debajo de md.
          Y con "reducir movimiento" activado en el sistema, no hay animación. */}
      <main
        className={`flex-1 flex flex-col bg-gray-200
          max-md:absolute max-md:inset-0 max-md:z-20
          max-md:transition-transform max-md:duration-200 max-md:ease-out
          motion-reduce:transition-none
          ${activaId || configAbierta ? 'max-md:translate-x-0' : 'max-md:translate-x-full'}`}
      >
        {configAbierta ? (
          <ConfiguracionChat onVolver={() => setConfigAbierta(false)} />
        ) : !activa ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Elige una conversación para leerla</p>
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
                <p className="text-[11.5px] text-gray-500 truncate">
                  {formatearNumero(activa.waId)}
                  {/* El rol antes que la empresa: mientras uno escribe la
                      respuesta, lo que importa es a QUIEN le habla. */}
                  {activa.rolContacto && <span> · {activa.rolContacto}</span>}
                  {activa.linkedBusinessName && (
                    <span className="text-primary-700"> · {activa.linkedBusinessName}</span>
                  )}
                </p>
              </div>
              {ventanaAbierta && (
                <span
                  className="text-[11.5px] text-gray-500 hidden lg:block"
                  title="Tiempo que queda para responder sin plantilla"
                >
                  Ventana: {formatearRestante(restante)}
                </span>
              )}

              {/* Siete iconos sin etiqueta eran adivinanza. Quedan a la vista
                  los dos de todos los dias —la ficha del cliente y cerrar la
                  conversacion— y el resto entra al menu "...", el mismo del
                  admin, donde cada accion se lee con su nombre. */}
              <div className="flex items-center gap-1 relative">
                <button
                  onClick={() => { setFichaVisible((v) => !v); setPanelMedia(false) }}
                  className={`h-8 w-8 grid place-items-center rounded-md hover:bg-gray-100 ${
                    activa.linkedBusinessId ? 'text-primary-600' : 'text-gray-500 hover:text-gray-900'
                  }`}
                  title={activa.linkedBusinessId ? `Cliente: ${activa.linkedBusinessName || ''}` : 'Ficha del cliente'}
                >
                  <UserCircle className="w-4 h-4" />
                </button>

                {estadoDe(activa) !== 'completada' ? (
                  <Boton tamano="sm" onClick={() => handleEstado('completada')}>Completar</Boton>
                ) : (
                  <Boton tamano="sm" onClick={() => handleEstado('abierta')}>Reabrir</Boton>
                )}

                <BotonDeFila onClick={(el) => menuCabecera.alternar('cabecera', el)} />
                {menuCabecera.abiertoEn === 'cabecera' && (
                  <CajaMenu posicion={menuCabecera.posicion} refMenu={menuCabecera.refMenu}>
                    <ItemMenu onClick={() => { menuCabecera.cerrar(); setBuscadorAbierto((v) => !v); setPanelMedia(false) }}>
                      Buscar en la conversación
                    </ItemMenu>
                    <ItemMenu onClick={() => { menuCabecera.cerrar(); setPanelMedia((v) => !v); setFichaVisible(false) }}>
                      Archivos de la conversación
                    </ItemMenu>
                    <SeparadorMenu />
                    <ItemMenu
                      onClick={(ev) => {
                        // Se ancla al mismo boton "..." que abrio este menu.
                        const boton = ev.currentTarget.closest('header')?.querySelector('[aria-label="Acciones"]')
                        menuCabecera.cerrar()
                        if (boton) menuTagsConv.alternar('tags', boton)
                      }}
                    >
                      Etiquetas
                    </ItemMenu>
                    <ItemMenu onClick={() => { menuCabecera.cerrar(); setNotaBorrador(activa.nota || ''); setNotaAbierta((v) => !v) }}>
                      {activa.nota ? 'Ver nota interna' : 'Agregar nota interna'}
                    </ItemMenu>
                    {estadoDe(activa) === 'abierta' && (
                      <>
                        <SeparadorMenu />
                        <ItemMenu onClick={() => { menuCabecera.cerrar(); handleEstado('pendiente') }}>
                          Marcar pendiente
                        </ItemMenu>
                      </>
                    )}
                  </CajaMenu>
                )}

                {/* Etiquetas de ESTA conversacion. Se queda abierto al marcar
                    y desmarcar —son varias— y se cierra con clic afuera o Esc,
                    como el resto de menus del kit. */}
                {menuTagsConv.abiertoEn === 'tags' && (
                  <CajaMenu posicion={menuTagsConv.posicion} refMenu={menuTagsConv.refMenu}>
                    {etiquetas.map((e) => {
                      const tiene = (activa.etiquetas || []).includes(e.id)
                      return (
                        <ItemMenu
                          key={e.id}
                          onClick={() => alternarEtiqueta(activaId, e.id, tiene).catch(() => toast.error('No se pudo cambiar la etiqueta'))}
                        >
                          <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ backgroundColor: e.color }} />
                            <span className="flex-1">{e.nombre}</span>
                            {tiene && <span className="text-gray-400">✓</span>}
                          </span>
                        </ItemMenu>
                      )
                    })}
                    <SeparadorMenu />
                    <ItemMenu onClick={() => { menuTagsConv.cerrar(); setGestorAbierto(true) }}>
                      Administrar etiquetas
                    </ItemMenu>
                  </CajaMenu>
                )}
              </div>
            </header>

            {buscadorAbierto && (
              <div className="px-4 py-2 bg-white border-b border-gray-200">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    autoFocus
                    value={buscarEnChat}
                    onChange={(e) => setBuscarEnChat(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setBuscadorAbierto(false); setBuscarEnChat('') }
                      if (e.key === 'Enter' && coincidencias.length) irAlMensaje(coincidencias[coincidencias.length - 1].id)
                    }}
                    placeholder="Buscar en esta conversacion"
                    className="w-full pl-9 pr-3 py-2 text-[13px] bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                {buscarEnChat.trim() && (
                  <div className="mt-1.5 max-h-40 overflow-y-auto">
                    {coincidencias.length === 0 ? (
                      <p className="text-[11.5px] text-gray-400 py-1">Sin coincidencias</p>
                    ) : (
                      [...coincidencias].reverse().slice(0, 20).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => irAlMensaje(m.id)}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 flex items-center gap-2"
                        >
                          <ArrowDown className="w-3 h-3 text-gray-300 flex-none" />
                          <span className="text-[11.5px] text-gray-700 truncate flex-1">{m.texto}</span>
                          <span className="text-[11px] text-gray-400 flex-none">{formatearHora(m.timestamp)}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {activa.optOut && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between gap-3">
                <p className="text-[11.5px] text-red-800">
                  Este contacto pidió no recibir más mensajes. Las campañas lo saltan.
                </p>
                <button
                  onClick={() => revertirBaja(activaId).then(() => toast.success('Baja revertida')).catch(() => toast.error('No se pudo revertir'))}
                  className="text-[11.5px] font-semibold text-red-700 underline whitespace-nowrap"
                >
                  Revertir
                </button>
              </div>
            )}

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

            {/* Nota interna: solo la ves tú, el cliente nunca */}
            {notaAbierta && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11.5px] font-semibold text-gray-600 uppercase tracking-wide">
                    Nota interna (el cliente no la ve)
                  </span>
                  <button onClick={() => setNotaAbierta(false)} className="text-gray-500 hover:text-gray-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={notaBorrador}
                  onChange={(e) => setNotaBorrador(e.target.value)}
                  rows={2}
                  placeholder="Quedo en llamar el lunes, pidio cotizacion de 3 sucursales..."
                  className="w-full text-[13px] bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
                <div className="flex justify-end mt-1.5">
                  <Boton variante="primario" tamano="sm" onClick={handleGuardarNota}>
                    Guardar nota
                  </Boton>
                </div>
              </div>
            )}
            {!notaAbierta && activa.nota && (
              <button
                onClick={() => { setNotaBorrador(activa.nota); setNotaAbierta(true) }}
                className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-left w-full hover:bg-gray-100 transition-colors"
              >
                <p className="text-[11.5px] text-gray-600 truncate">
                  <StickyNote className="w-3 h-3 inline mr-1.5 -mt-0.5" />
                  {activa.nota}
                </p>
              </button>
            )}

            {/* El envoltorio existe para poder colgar el boton de bajar: dentro
                del contenedor con scroll se iria con el contenido. */}
            <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              ref={contenedorHilo}
              onScroll={(e) => {
                const c = e.currentTarget
                // 150 px de margen: alcanza para considerar que esta "abajo"
                // sin exigir el pixel exacto.
                const abajo = c.scrollHeight - c.scrollTop - c.clientHeight < 150
                pegadoAlFondo.current = abajo
                setLejosDelFondo((antes) => (antes === !abajo ? antes : !abajo))
              }}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
            >
              {elementos.map((el) => {
                if (el.separador) {
                  return (
                    <div key={el.id} className="flex justify-center py-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-white border border-gray-200 text-[11px] font-medium text-gray-500">
                        {el.rotulo}
                      </span>
                    </div>
                  )
                }
                const m = el.mensaje
                const mio = m.direccion === 'saliente'
                // Los stickers y las notas de voz no llevan burbuja: el sticker tiene su
                // propia forma recortada y el reproductor de audio ya trae su recuadro.
                // Meterlos en una burbuja era poner un marco sobre otro marco.
                const sinBurbuja = m.tipo === 'sticker' || (m.tipo === 'audio' && !m.texto && !m.respondeA)
                const citado = m.respondeA ? mensajePorWaId.get(m.respondeA) : null
                const miReaccion = reaccionDeM(m)
                const suReaccion = m.reacciones?.cliente || ''
                const conReaccion = Boolean(miReaccion || suReaccion)
                const fallo = m.estado === 'failed'
                const puedeActuar = Boolean(idDeWhatsapp(m))
                const abierto = menuMensaje === m.id
                const acciones = puedeActuar && (
                  <div
                    data-mensaje={m.id}
                    className={`${abierto ? 'flex' : 'hidden group-hover:flex'} items-center gap-0.5 shrink-0`}
                  >
                    {paletaAbierta === m.id ? (
                      <div className="flex items-center gap-0.5 rounded-full bg-white border border-gray-200 shadow-sm px-1 py-0.5">
                        {EMOJIS_REACCION.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => alternarReaccion(m, e)}
                            className={`w-7 h-7 rounded-full text-base leading-none hover:bg-gray-100 ${
                              miReaccion === e ? 'bg-primary-50' : ''
                            }`}
                            title={miReaccion === e ? 'Quitar reacción' : `Reaccionar ${e}`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => citarMensaje(m)}
                          title="Responder a este mensaje"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                        >
                          <Reply className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setMenuMensaje(m.id); setPaletaAbierta(m.id) }}
                          title="Reaccionar"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                        >
                          <SmilePlus className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )
                return (
                  <div
                    key={m.id}
                    id={`msg-${m.id}`}
                    className={`group flex items-center gap-1 ${mio ? 'justify-end' : 'justify-start'} ${
                      conReaccion ? 'mb-3' : ''
                    } ${resaltado === m.id ? 'animate-pulse' : ''}`}
                  >
                    {mio && acciones}
                    {/* Tope en pixeles, no solo en porcentaje: en una pantalla
                        ancha el 75% son mas de mil pixeles, y ahi pasaban dos
                        cosas malas — la imagen quedaba nadando en un hueco
                        enorme, y el texto salia en renglones larguisimos que
                        cuesta leer. 34rem deja la linea en la medida comoda de
                        lectura y hace que la imagen llene la burbuja. */}
                    <div
                      data-mensaje={m.id}
                      className={`relative ${m.linkPreview || m.tipo === 'document' ? 'w-72 max-w-[85%]' : 'max-w-[min(75%,34rem)]'}`}
                    >
                    <div
                      onClick={(e) => {
                        // En el celular no hay mouse: tocar la burbuja saca las
                        // acciones. Se respeta lo que ya es tocable adentro.
                        if (e.target.closest('a, button, img, video, audio')) return
                        setPaletaAbierta(null)
                        setMenuMensaje(abierto ? null : m.id)
                      }}
                      className={`text-[14px] leading-snug ${
                        sinBurbuja
                          ? 'text-gray-900'
                          : mio
                            ? 'rounded-2xl px-3.5 py-2 bg-primary-50 border border-primary-100 text-gray-900 rounded-br-sm'
                            : 'rounded-2xl px-3.5 py-2 bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                      }`}
                    >
                      {m.respondeA && (
                        <button
                          type="button"
                          onClick={() => citado && irAlMensaje(citado.id)}
                          className={`block w-full text-left mb-1.5 rounded-md px-2 py-1 border-l-[3px] ${
                            mio ? 'bg-white/70 border-primary-300' : 'bg-gray-100 border-gray-400'
                          }`}
                        >
                          <span className={`block text-[11px] font-semibold ${mio ? 'text-gray-500' : 'text-gray-600'}`}>
                            {citado
                              ? (citado.direccion === 'saliente' ? 'Tú' : (activa?.nombre || 'Cliente'))
                              : 'Mensaje citado'}
                          </span>
                          <span className={`block text-[11.5px] truncate ${mio ? 'text-gray-500' : 'text-gray-500'}`}>
                            {citado ? resumenDeCita(citado) : 'No está en esta parte de la conversación'}
                          </span>
                        </button>
                      )}
                      {m.tipo === 'template' && (
                        <span className={`inline-block text-[11px] font-semibold uppercase tracking-wide mb-1 ${mio ? 'text-gray-500' : 'text-gray-400'}`}>
                          Plantilla
                        </span>
                      )}
                      {m.automatico && (
                        <span className={`inline-block text-[11px] font-semibold uppercase tracking-wide mb-1 ${mio ? 'text-gray-500' : 'text-gray-400'}`}>
                          Respuesta automática
                        </span>
                      )}
                      {(m.tipo === 'image' || m.tipo === 'sticker' || m.tipo === 'template') && m.media?.url && (
                        <button
                          type="button"
                          onClick={() => abrirVisorDe(m.media)}
                          // El boton envuelve la foto, no la fila: w-fit para que
                          // el area clicable sea la imagen y no el ancho entero.
                          className="block w-fit max-w-full"
                        >
                          <img
                            // La MINIATURA, no el original: una foto de camara
                            // son megas y aca se ve a 300 px. El original se
                            // baja recien al abrir el visor.
                            src={m.media.thumbUrl || m.media.url}
                            alt={m.texto || 'Imagen'}
                            loading="lazy"
                            decoding="async"
                            // Con las medidas guardadas se pinta al tamaño exacto
                            // y el espacio queda reservado antes de que la imagen
                            // baje: sin salto y sin hueco al costado. Sin medidas
                            // —mensajes viejos— se pinta como siempre.
                            style={m.tipo === 'sticker' ? undefined : medidasDeImagen(m.media) || undefined}
                            className={`rounded-lg mb-1 bg-black/5 ${
                              m.tipo === 'sticker'
                                ? 'w-28'
                                : medidasDeImagen(m.media)
                                  ? 'max-w-full h-auto'
                                  : 'max-w-full max-h-72 object-contain'
                            }`}
                          />
                        </button>
                      )}
                      {m.tipo === 'video' && m.media?.url && (
                        // preload="metadata": baja solo la cabecera para poder
                        // mostrar el primer cuadro y la duracion. Sin esto el
                        // navegador se traia el video entero al abrir el chat.
                        <video src={m.media.url} controls preload="metadata" className="rounded-lg mb-1 max-w-full max-h-72" />
                      )}
                      {m.tipo === 'audio' && m.media?.url && (
                        <audio src={m.media.url} controls className="mb-1 max-w-full" />
                      )}
                      {m.tipo === 'document' && m.media?.url && (
                        <BurbujaDocumento media={m.media} />
                      )}
                      {['image', 'sticker', 'video', 'audio', 'document'].includes(m.tipo) && !m.media?.url && (
                        <p className="text-[13px] italic opacity-75 mb-1">
                          {m.tipo === 'image' ? 'Imagen' : m.tipo === 'audio' ? 'Audio' : m.tipo === 'video' ? 'Video' : m.tipo === 'document' ? 'Documento' : 'Sticker'} no disponible
                        </p>
                      )}
                      {m.linkPreview && <TarjetaEnlace vista={m.linkPreview} mio={mio} />}
                      {m.texto
                        ? (
                          <TextoWhatsapp
                            texto={m.texto}
                            claseEnlace={`underline break-all ${'text-blue-600'}`}
                          />
                        )
                        : !['image', 'sticker', 'video', 'audio', 'document'].includes(m.tipo)
                          && <p className="text-[13px] italic opacity-75">[{m.tipo}]</p>}
                      <div
                        className={`flex items-center gap-1 justify-end mt-0.5 ${
                          'text-gray-400'
                        }`}
                      >
                        {fallo && (
                          <span className="text-[11px] font-semibold text-red-100">No se envió</span>
                        )}
                        <span className="text-[11px]">{formatearHora(m.timestamp)}</span>
                        {mio && (
                          fallo
                            ? <AlertCircle className="w-3.5 h-3.5 text-red-100" />
                            : m.estado === 'enviando'
                              ? <Clock className="w-3.5 h-3.5 opacity-70" />
                              : m.estado === 'read'
                                ? <CheckCheck className="w-3.5 h-3.5 text-blue-200" />
                                : m.estado === 'delivered'
                                  ? <CheckCheck className="w-3.5 h-3.5" />
                                  : <Check className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>
                    {conReaccion && (
                      <span
                        className={`absolute -bottom-2.5 ${mio ? 'left-2' : 'right-2'} px-1.5 py-0.5 rounded-full bg-white border border-gray-200 shadow-sm text-[11.5px] leading-none`}
                        title={miReaccion && suReaccion ? 'Tu reacción y la del cliente' : miReaccion ? 'Tu reacción' : 'Reacción del cliente'}
                      >
                        {suReaccion}{miReaccion}
                      </span>
                    )}
                    </div>
                    {!mio && acciones}
                  </div>
                )
              })}
            </div>

            {/* Volver abajo. Aparece solo al subir; leer una conversacion vieja
                y tener que arrastrar de vuelta es de las cosas que mas molestan
                de un chat. */}
            {lejosDelFondo && (
              <button
                type="button"
                onClick={() => irAlFondo(true)}
                className="absolute bottom-4 right-4 z-10 h-9 w-9 grid place-items-center rounded-full bg-white border border-gray-300 shadow-md text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                title="Ir al último mensaje"
                aria-label="Ir al último mensaje"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            )}
            </div>

            {/* Cuadro para escribir, o el aviso de por qué no se puede */}
            {ventanaAbierta ? (
              <form
                onSubmit={handleEnviar}
                className="relative px-4 py-3 bg-white border-t border-gray-200 flex items-end gap-2"
              >
                <input
                  ref={selectorArchivo}
                  type="file"
                  accept={ADJUNTOS_ACEPTADOS}
                  onChange={handleElegirArchivo}
                  className="hidden"
                />
                {/* `capture` es lo que hace que el celular abra la camara en vez
                    del carrete. Es un input aparte porque el de arriba acepta
                    PDF y audio, y con capture el navegador los ignora. */}
                <input
                  ref={selectorCamara}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleElegirArchivo}
                  className="hidden"
                />
                {!grabadora.grabando && (
                  <button
                    type="button"
                    onClick={() => selectorArchivo.current?.click()}
                    disabled={enviando}
                    className="p-2.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-40"
                    title="Adjuntar imagen o PDF"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                )}
                {hayCamara && !grabadora.grabando && (
                  <button
                    type="button"
                    onClick={() => selectorCamara.current?.click()}
                    disabled={enviando}
                    className="p-2.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-40"
                    title="Tomar una foto"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                )}
                {respondiendoA && (
                  <div
                    className={`absolute bottom-full left-4 right-4 ${
                      adjuntoGuardado ? 'mb-[3.9rem]' : 'mb-1'
                    } bg-white border border-gray-200 rounded-lg shadow-sm p-2 flex items-center gap-2.5 z-10`}
                  >
                    <div className="w-1 self-stretch rounded-full bg-primary-600 flex-none" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-gray-500">
                        Respondiendo a {respondiendoA.direccion === 'saliente' ? 'tu mensaje' : (activa?.nombre || 'el cliente')}
                      </p>
                      <p className="text-[13px] text-gray-700 truncate">{resumenDeCita(respondiendoA)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRespondiendoA(null)}
                      className="p-1 text-gray-400 hover:text-gray-600 flex-none"
                      title="Ya no responder a ese mensaje"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {adjuntoGuardado && (
                  <div className="absolute bottom-full left-4 right-4 mb-1 bg-white border border-primary-200 rounded-lg shadow-sm p-2 flex items-center gap-2.5 z-10">
                    {adjuntoGuardado.tipo === 'image' ? (
                      <img src={adjuntoGuardado.url} alt="" className="w-10 h-10 rounded object-cover flex-none" />
                    ) : adjuntoGuardado.tipo === 'video' ? (
                      <video src={adjuntoGuardado.url} className="w-10 h-10 rounded object-cover flex-none bg-black" muted />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-none">
                        {adjuntoGuardado.tipo === 'audio'
                          ? <Music className="w-5 h-5 text-gray-400" />
                          : <FileText className="w-5 h-5 text-gray-400" />}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-medium text-gray-800 truncate">
                        {adjuntoGuardado.filename || NOMBRE_TIPO[adjuntoGuardado.tipo]}
                      </p>
                      <p className="text-[11px] text-gray-400">Se envía con este mensaje</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdjuntoGuardado(null)}
                      className="p-1 text-gray-300 hover:text-red-500 flex-none"
                      aria-label="Quitar el archivo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {!adjuntoGuardado && sugerenciasRapidas.length > 0 && (
                  <div className="absolute bottom-full left-4 right-4 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-10">
                    <div className="px-3.5 py-1.5 bg-gray-50 border-b border-gray-100">
                      <p className="text-[11px] text-gray-400">Flechas para elegir · Enter para usar</p>
                    </div>
                    {sugerenciasRapidas.map((r, idx) => (
                      <button
                        key={r.atajo}
                        type="button"
                        onClick={() => aplicarRapida(r)}
                        onMouseEnter={() => setSugerenciaSel(idx)}
                        className={`w-full text-left px-3.5 py-2 flex items-start gap-3 ${
                          idx === sugerenciaSel ? 'bg-primary-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-mono text-[11.5px] font-semibold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded flex-none">/{r.atajo}</span>
                        <span className="text-[13px] text-gray-700 truncate flex-1">{r.texto}</span>
                        {r.media && (
                          <span className="flex-none text-gray-400" title={NOMBRE_TIPO[r.media.tipo]}>
                            {r.media.tipo === 'image' ? <ImageIconoRapida />
                              : r.media.tipo === 'video' ? <Film className="w-3.5 h-3.5" />
                                : r.media.tipo === 'audio' ? <Music className="w-3.5 h-3.5" />
                                  : <FileText className="w-3.5 h-3.5" />}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {grabadora.grabando ? (
                  <div className="flex-1 flex items-center gap-3 px-4 py-2.5 bg-gray-100 rounded-2xl">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-none" />
                    <span className="text-[13px] font-medium text-gray-700 tabular-nums">
                      {relojDeGrabacion(grabadora.segundos)}
                    </span>
                    <span className="text-[11.5px] text-gray-400 hidden sm:inline">Grabando una nota de voz</span>
                    <button
                      type="button"
                      onClick={grabadora.cancelar}
                      className="ml-auto p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-white"
                      title="Descartar la nota"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                <textarea
                  ref={cuadroTexto}
                  rows={1}
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value)
                    // Alto automatico: crece con el texto hasta 6 lineas, como
                    // WhatsApp. Un input de una linea obliga a escribir a
                    // ciegas cuando el mensaje es largo.
                    e.target.style.height = 'auto'
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 132)}px`
                  }}
                  onKeyDown={(e) => {
                    // Con la lista de atajos abierta, las flechas la recorren y
                    // Enter usa el elegido — sin sacar la mano del teclado.
                    if (sugerenciasRapidas.length > 0 && !adjuntoGuardado) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setSugerenciaSel((i) => (i + 1) % sugerenciasRapidas.length)
                        return
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setSugerenciaSel((i) => (i - 1 + sugerenciasRapidas.length) % sugerenciasRapidas.length)
                        return
                      }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault()
                        aplicarRapida(sugerenciasRapidas[sugerenciaSel] || sugerenciasRapidas[0])
                        return
                      }
                      if (e.key === 'Escape') { e.preventDefault(); setTexto(''); return }
                    }
                    // Enter envia; Shift+Enter hace salto de linea.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.target.style.height = 'auto'
                      handleEnviar(e)
                    }
                  }}
                  placeholder={respuestasRapidas.length ? 'Escribe un mensaje, o / para una respuesta rápida' : 'Escribe un mensaje'}
                  disabled={enviando}
                  className="flex-1 px-4 py-2.5 bg-gray-100 rounded-2xl text-[14px] focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 resize-none leading-5 max-h-[132px]"
                />
                )}
                {/* Con algo escrito, el botón envía. Sin nada, ofrece el
                    micrófono — igual que WhatsApp. */}
                {texto.trim() || grabadora.grabando || !grabadora.puedeGrabar ? (
                  <button
                    type={grabadora.grabando ? 'button' : 'submit'}
                    onClick={grabadora.grabando ? handleEnviarNota : undefined}
                    disabled={enviando || (!grabadora.grabando && !texto.trim())}
                    className="p-2.5 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label={grabadora.grabando ? 'Enviar la nota de voz' : 'Enviar'}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGrabar}
                    disabled={enviando}
                    className="p-2.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-40"
                    title="Grabar una nota de voz"
                    aria-label="Grabar una nota de voz"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </form>
            ) : (
              <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                {/* La ventana de 24h cerrada no es un error: es una regla de
                    Meta. Va en gris, como los avisos del admin; el ámbar se fue
                    con el resto de la paleta. */}
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">
                      Pasaron más de 24 horas desde su último mensaje
                    </p>
                    <p className="mt-0.5 text-[12px] text-gray-500">
                      WhatsApp solo permite responder libremente dentro de las 24 horas.
                      Para escribirle ahora hace falta una plantilla aprobada por Meta,
                      que se cobra aparte. Si te vuelve a escribir, la ventana se reabre.
                    </p>
                  </div>
                  <Boton variante="primario" onClick={() => setSelectorAbierto(true)} className="flex-none">
                    Enviar plantilla
                  </Boton>
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
              <h3 className="font-bold text-gray-900 text-[13px]">Enviar archivo</h3>
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
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                  <FileText className="w-8 h-8 text-red-500 flex-none" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 truncate">{adjunto.name}</p>
                    <p className="text-[11.5px] text-gray-400">{(adjunto.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                </div>
              )}
              <input
                type="text"
                value={pieAdjunto}
                onChange={(e) => setPieAdjunto(e.target.value)}
                placeholder="Agregar un comentario (opcional)"
                className="w-full mt-4 px-4 py-2.5 bg-gray-100 rounded-full text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setAdjunto(null)}
                disabled={enviando}
                className="px-4 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <Boton variante="primario" onClick={handleEnviarAdjunto} disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar'}
              </Boton>
            </div>
          </div>
        </div>
      )}

      {/* Archivos de la conversacion */}
      {activa && panelMedia && (
        <div
          className="absolute inset-0 z-30 sm:static sm:z-auto sm:inset-auto flex justify-end bg-black/30 sm:bg-transparent sm:flex-none"
          onClick={() => setPanelMedia(false)}
        >
          <div className="h-full w-full max-w-xs sm:max-w-none sm:w-auto" onClick={(e) => e.stopPropagation()}>
            <PanelMultimedia
              mensajes={hilo}
              onCerrar={() => setPanelMedia(false)}
              onAbrirImagen={(m) => abrirVisorDe(m.media)}
              onIrAlMensaje={irAlMensaje}
            />
          </div>
        </div>
      )}

      {visorIndice !== null && imagenesDelHilo.length > 0 && (
        <VisorMedia
          imagenes={imagenesDelHilo}
          indiceInicial={visorIndice}
          onCerrar={() => setVisorIndice(null)}
        />
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
              onAbrirConversacion={(id) => setActivaId(id)}
            />
          </div>
        </div>
      )}

      {selectorAbierto && activa && (
        <SelectorPlantilla
          titulo={`Plantilla para ${activa.nombre || formatearNumero(activa.waId)}`}
          destinatarios={1}
          onCerrar={() => setSelectorAbierto(false)}
          onEnviar={async (plantilla, valores) => {
            const idToken = await getAuth().currentUser?.getIdToken()
            await enviarPlantilla(activaId, plantilla, valores, idToken)
            toast.success('Plantilla enviada')
            setSelectorAbierto(false)
          }}
        />
      )}

      {campanaAbierta && (
        <SelectorPlantilla
          titulo="Campaña"
          modoCampana
          destinatarios={filtradas.length}
          onCerrar={() => setCampanaAbierta(false)}
          onEnviar={async (plantilla, valores) => {
            const idToken = await getAuth().currentUser?.getIdToken()
            const tituloCamp = `${plantilla.name} · ${filtradas.length} contactos`
            const r = await enviarCampana(filtradas.map((c) => c.id), plantilla, valores, tituloCamp, idToken)
            setCampanaEnCurso({ id: r.campaignId, titulo: tituloCamp, total: filtradas.length, enviados: 0 })
            setCampanaAbierta(false)
            toast.success('Campaña en marcha')
          }}
        />
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
      {Capacitor.isNativePlatform() && (
        <div className="bg-white flex-none" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      )}
    </div>
  )
}

/** Icono de imagen para la lista de sugerencias. */
const ImageIconoRapida = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)

/** Avatar con iniciales y color estable por contacto. Meta no entrega las fotos de perfil por la API. */
const PALETA_AVATAR = ['#1B6E4A', '#26456E', '#96690F', '#7C3AED', '#0E7490', '#BE185D', '#A3352C', '#4B5563']
function Avatar({ nombre, waId, cliente }) {
  const base = (nombre || '').trim()
  const iniciales = base
    ? base.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
    : String(waId || '').slice(-2)
  let h = 0
  for (const ch of String(waId || nombre || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const color = PALETA_AVATAR[h % PALETA_AVATAR.length]
  return (
    <div className="relative flex-none">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold"
        style={{ backgroundColor: color }}
      >
        {iniciales}
      </div>
      {cliente && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-primary-500 border-2 border-white rounded-full" title="Cliente de Cobrify" />
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
function BurbujaDocumento({ media }) {
  const [info, setInfo] = useState(null)
  const esPdf = /\.pdf($|\?)/i.test(media.url) || media.mimeType === 'application/pdf'

  return (
    <a
      href={media.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden mb-1 bg-white/70"
    >
      {esPdf && <MiniaturaPdf url={media.url} onDatos={setInfo} />}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-9 h-9 rounded-lg bg-red-500 flex items-center justify-center flex-none">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate text-gray-900">
            {media.filename || 'Documento'}
          </p>
          {/* gray-600 y no gray-500: en modo oscuro el 500 se queda en 3,6:1
              sobre la tarjeta, corto para una linea de 11,5 px. */}
          <p className="text-[11.5px] text-gray-600">
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
/**
 * El tamaño con el que se pinta una imagen del chat, sabiendo sus medidas.
 *
 * Se calcula el ANCHO de forma que el alto nunca llegue al tope. Asi no se
 * activa ningun recorte y la caja mide exactamente lo que la foto: sin hueco a
 * los costados y, sobre todo, sin salto — el navegador reserva el espacio antes
 * de que la imagen baje.
 *
 * Sin medidas devuelve null y se pinta como siempre.
 *
 * La BURBUJA sigue a la foto, no al reves: estos topes mandan y el contenedor
 * se cine a ellos, asi que el hueco al costado ya no depende de lo largo que
 * sea el texto (reporte de Giacomo, 05-sep-2026). El tope de ALTO es el que
 * decide cuanto ocupa una foto VERTICAL: una 9:16 solo puede ser ancha si se
 * la deja alta.
 *
 * Las medidas son comodas de leer, no grandes, a proposito: la foto se ve de
 * un vistazo y quien quiera mirarla de verdad la abre con un clic.
 */
const BORDE_FOTO = 4 // el hilo entre la foto y el borde de la burbuja (p-1)
const TOPE_ANCHO = 360 // 22.5rem
const TOPE_ALTO = 336 // 21rem

const medidasDeImagen = (media) => {
  const { ancho, alto } = media || {}
  if (!ancho || !alto) return null
  return {
    width: Math.round(Math.min(TOPE_ANCHO, ancho, (TOPE_ALTO * ancho) / alto)),
    aspectRatio: `${ancho} / ${alto}`,
  }
}

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
                className="flex-1 text-[13px] px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-gray-300 rounded-lg focus:outline-none"
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
              className="flex-1 text-[13px] px-3 py-1.5 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={agregar}
              disabled={!nombreNuevo.trim()}
              className="p-1.5 text-primary-600 hover:text-primary-700 disabled:opacity-30"
              title="Agregar"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="px-4 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
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
            className="px-4 py-2 text-[13px] font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
