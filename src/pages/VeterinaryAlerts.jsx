import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getVeterinaryReminders, markServiceCompleted, contarClientes } from '@/services/veterinaryService'
import { getRemindersFromSales, getDescartados, descartarRecordatorio, escucharVentasNuevas, ventanaDeVentas } from '@/services/salesRemindersService'
import {
  RANGOS, RANGO_POR_DEFECTO, desdeDeLectura, aplicarFiltros, serviciosDisponibles,
} from '@/utils/reminderFilters'
import Input from '@/components/ui/Input'
import { leerCache, guardarCache, limpiarCache } from '@/utils/reminderCache'
import { getProducts } from '@/services/firestoreService'
import Card, { CardContent } from '@/components/ui/Card'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import GuideLink from '@/components/guide/GuideLink'
import {
  Bell,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Syringe,
  Calendar,
  PawPrint,
  Phone,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

/**
 * Hasta cuántos clientes se recorren las fichas sin preguntar.
 *
 * Son dos consultas por cliente (vacunas + controles). Doscientos es un
 * momento; tres mil son seis mil consultas y el navegador se queda sin aire
 * justo cuando el usuario quiere filtrar.
 */
const TOPE_FICHAS_AUTOMATICAS = 250

export default function VeterinaryAlerts() {
  const { user, getBusinessId, isDemoMode, businessSettings, businessMode } = useAppContext()
  // Las vacunas y controles de la ficha son de veterinaria. En clinica la
  // pantalla es la misma, pero todo sale de las ventas: no hay fichas que
  // recorrer ni mascota por la que buscar.
  const esVeterinaria = businessMode === 'veterinary'
  const toast = useToast()
  // Las DOS fuentes viven separadas en el estado y se juntan al renderizar.
  // Así el tramo lento (las fichas de los pacientes) puede llegar después sin
  // pisar lo que ya se mostró ni duplicarse al recargar.
  const [ventasPend, setVentasPend] = useState([])
  const [ventasVenc, setVentasVenc] = useState([])
  const [fichasPend, setFichasPend] = useState([])
  const [fichasVenc, setFichasVenc] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [cargandoFichas, setCargandoFichas] = useState(false)
  const [ventasLeidas, setVentasLeidas] = useState(null)
  // Cuántos clientes hay que recorrer para las vacunas y controles. Decide si
  // ese barrido se hace solo o queda detrás de un botón.
  const [cuantosClientes, setCuantosClientes] = useState(null)
  // Lo que se ve es lo guardado de la vez anterior y todavia se esta releyendo.
  const [desdeCache, setDesdeCache] = useState(false)

  // ═══ Filtros ═══
  // El rango de VENTAS es lo único que decide cuánto se lee de Firestore; los
  // otros dos recortan en memoria y son instantáneos.
  const [rango, setRango] = useState(RANGO_POR_DEFECTO)
  const [desdeManual, setDesdeManual] = useState('')
  const [servicios, setServicios] = useState(() => new Set())
  const [buscaCliente, setBuscaCliente] = useState('')
  const [panelServicios, setPanelServicios] = useState(false)
  const [buscaServicio, setBuscaServicio] = useState('')

  // Las fichas de pacientes cuestan DOS consultas por cliente, así que se
  // traen una sola vez por sesión: cambiar de rango no las vuelve a pedir.
  const fichasCargadas = useRef(false)

  // La recarga en vivo, siempre apuntando a la version actual: el listener
  // se monta una sola vez y sin esto se quedaria con el rango del primer
  // render.
  const recargarRef = useRef(null)

  // El barrido de fichas avisa cada 20 clientes. Con tres mil, eso son ciento
  // cincuenta repintados de una tabla larga mientras el usuario intenta
  // filtrar. Se deja pasar uno cada medio segundo.
  const ultimoAvance = useRef(0)
  const avanceLento = (v) => {
    const ahora = Date.now()
    if (v && ahora - ultimoAvance.current < 500 && v.revisados < v.total) return
    ultimoAvance.current = ahora
    setAvance(v)
  }
  /**
   * Filtro por período. La carga SIEMPRE trae el mes completo y el filtro se
   * aplica en memoria: cambiar de "hoy" a "este mes" es instantáneo en vez de
   * volver a leer las ventas.
   */
  // Abre en "Esta semana", no en "Hoy". "Hoy" es una rebanada de UN solo dia
  // —solo entra aquel a quien se le cumple el plazo exactamente hoy— y que
  // este vacio es lo habitual. Abrir en una lista vacia hacia parecer rota
  // una pantalla que tenia doscientos avisos.
  const [periodo, setPeriodo] = useState('semana')
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 25
  const daysAhead = 30
  const [markingCompleted, setMarkingCompleted] = useState(null)
  // Cuántos pacientes lleva revisados: esta pantalla tarda en proporción a
  // cuántos hay, así que la espera se muestra en vez de disimularse.
  const [avance, setAvance] = useState(null)

  // `businessId` en las dependencias, y no solo `user`: en un sub-usuario los
  // permisos llegan DESPUÉS del login, y hasta que llegan `getBusinessId()`
  // devuelve el uid propio en vez del del dueño. Esa lectura no falla — las
  // reglas la permiten sobre un negocio que no existe — así que devolvía cero
  // recordatorios en silencio y la pantalla nunca se volvía a cargar.
  const businessId = getBusinessId()

  useEffect(() => {
    loadAlerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, isDemoMode, rango, desdeManual])

  /**
   * En vivo: al cobrar una venta, la lista se entera sola.
   *
   * Antes había un botón de actualizar, que además de feo era una tarea que no
   * le toca al usuario. El recálculo se agrupa en un par de segundos porque en
   * una tanda de ventas seguidas llegan varios avisos.
   */
  useEffect(() => {
    if (!businessId || isDemoMode) return
    let pendiente = null
    const cortar = escucharVentasNuevas(businessId, () => {
      clearTimeout(pendiente)
      pendiente = setTimeout(() => recargarRef.current?.({ silencioso: true }), 2500)
    })
    return () => { clearTimeout(pendiente); cortar() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, isDemoMode])

  /**
   * La carga va en DOS TRAMOS, y ese es el arreglo de fondo.
   *
   * Antes esperaba a las dos fuentes juntas con `Promise.all`, así que la
   * pantalla tardaba lo que tardara la MÁS LENTA — y la más lenta lee las
   * vacunas y controles de la ficha, que son dos consultas por cada cliente
   * del negocio. Con dos mil clientes son cuatro mil consultas antes de pintar
   * la primera fila.
   *
   * Ahora primero se muestran los recordatorios de VENTAS, que salen de una
   * consulta paginada y llegan en un momento, y las fichas se suman después
   * sin tapar nada. Además se guardan: cambiar el rango no las vuelve a pedir.
   */
  const loadAlerts = async ({ silencioso = false, recargarFichas = false } = {}) => {
    if (!user?.uid || isDemoMode || !businessId) {
      setIsLoading(false)
      return
    }

    // Lo ultimo que se supo, de entrada. El piso de esta pantalla es el peso
    // de las ventas y no hay forma de pedir menos campos; con conexion lenta
    // son varios segundos de spinner para ver una lista que casi siempre es
    // la de ayer. Se muestra y se corrige en cuanto llega lo fresco.
    if (!silencioso) {
      const guardado = leerCache(businessId, rango, desdeManual)
      if (guardado) {
        setVentasPend(guardado.pending)
        setVentasVenc(guardado.overdue)
        setVentasLeidas(guardado.ventasLeidas)
        setDesdeCache(true)
        setIsLoading(false)
      } else {
        setIsLoading(true)
      }
    }
    setAvance(null)
    const t0 = performance.now()
    try {
      // ── Tramo 1: las ventas ──
      //
      // Las TRES lecturas salen a la vez. Antes el catálogo y los descartes se
      // esperaban PRIMERO y recién después se pedía la primera página de
      // ventas: tres viajes en fila para algo que no depende del anterior.
      const pCatalogo = getProducts(businessId).then(r => (r?.success ? (r.data || []) : []))
      const pDescartados = getDescartados(businessId)

      // La ventana de lectura sale del rango elegido, no del plazo más largo
      // del catálogo. Es la diferencia entre leer 90 días de ventas y 425.
      // Solo "Todo el historial" necesita el catálogo para decidirla.
      const desde = desdeDeLectura(
        rango,
        desdeManual,
        rango === 'todo' ? ventanaDeVentas(await pCatalogo, businessSettings, daysAhead) : 0,
      )

      const deVentas = await getRemindersFromSales({
        businessId,
        products: pCatalogo,
        descartados: pDescartados,
        businessSettings,
        daysAhead,
        desde,
      })

      console.log(`Recordatorios (ventas): ${Math.round(performance.now() - t0)} ms · ${deVentas.ventasLeidas ?? 0} ventas leídas`)
      setVentasLeidas(deVentas.ventasLeidas ?? 0)
      setVentasPend(deVentas.pending)
      setVentasVenc(deVentas.overdue)
      setDesdeCache(false)
      setIsLoading(false)   // ← la pantalla ya sirve
      guardarCache(businessId, rango, desdeManual, {
        pending: deVentas.pending,
        overdue: deVentas.overdue,
        ventasLeidas: deVentas.ventasLeidas ?? 0,
      })

      // ── Tramo 2: las fichas de los pacientes ──
      //
      // Cuesta DOS consultas por cliente, así que primero se pregunta cuántos
      // hay (una sola consulta de agregación, sin traer documentos). Pasado el
      // tope, el barrido no arranca solo: queda detrás de un botón, porque
      // dejar al navegador haciendo miles de consultas de fondo hace que toda
      // la pantalla se sienta trabada aunque las filas ya estén pintadas.
      if (!esVeterinaria) return
      if (fichasCargadas.current && !recargarFichas) return
      const n = cuantosClientes ?? await contarClientes(businessId)
      setCuantosClientes(n)
      if (n > TOPE_FICHAS_AUTOMATICAS && !recargarFichas) return
      await cargarFichas()
    } catch (error) {
      console.error('Error al cargar alertas:', error)
      toast.error('Error al cargar las alertas')
      setIsLoading(false)
    }
  }

  /** El barrido de fichas, aparte para que el botón pueda pedirlo a mano. */
  const cargarFichas = async () => {
    setCargandoFichas(true)
    const t0 = performance.now()
    try {
      const deFichas = await getVeterinaryReminders(businessId, daysAhead, avanceLento)
      console.log(`Recordatorios (fichas): ${Math.round(performance.now() - t0)} ms`)
      setFichasPend(deFichas.pending)
      setFichasVenc(deFichas.overdue)
      fichasCargadas.current = true
    } catch {
      // Que fallen las fichas no debe borrar los recordatorios de ventas, que
      // son la mayoría y ya están en pantalla.
    } finally {
      setCargandoFichas(false)
      setAvance(null)
    }
  }

  // Se actualiza en cada render, ya con loadAlerts definido arriba.
  useEffect(() => { recargarRef.current = loadAlerts })

  const handleMarkCompleted = async (alert) => {
    if (alert.type !== 'service' && alert.type !== 'sale') return

    setMarkingCompleted(alert.id)
    try {
      const businessId = getBusinessId()
      if (alert.type === 'sale') {
        // El recordatorio de una venta no es un documento que se pueda tachar:
        // se calcula. Lo que se guarda es que ya fue atendido. Cuando el
        // cliente vuelva a comprar lo mismo, el aviso reaparece solo.
        await descartarRecordatorio(businessId, alert.clave)
      } else {
        await markServiceCompleted(businessId, alert.customerId, alert.id)
      }
      toast.success('Servicio marcado como completado')
      // El guardado de TODOS los rangos quedó viejo: en otro rango este aviso
      // seguiría apareciendo, y algo ya resuelto que reaparece es lo que hace
      // que el usuario deje de creerle a la lista.
      limpiarCache(businessId)
      // Lo de la ficha cambió en Firestore: hay que releerla. Lo de una
      // venta solo agrega un descarte, y eso se recalcula sin las fichas.
      loadAlerts({ recargarFichas: alert.type !== 'sale' })
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al marcar el servicio')
    } finally {
      setMarkingCompleted(null)
    }
  }

  const handleWhatsApp = (alert) => {
    if (!alert.phone) {
      toast.error('Este cliente no tiene teléfono registrado')
      return
    }

    const phone = alert.phone.replace(/\D/g, '')
    const formattedPhone = phone.startsWith('51') ? phone : `51${phone}`

    // El texto cambia según de dónde salga el recordatorio: a quien compró
    // alimento hace un mes no se le dice que "tiene programado" nada.
    const quien = alert.petName || alert.customerName
    let message
    if (alert.type === 'vaccination') {
      message = `Hola! Le recordamos que ${quien} tiene pendiente su vacuna: ${alert.title.replace('Vacuna: ', '')}`
      message += ` para el ${formatDate(alert.dueDate)}. ¿Le gustaría agendar una cita?`
    } else if (alert.type === 'sale') {
      message = `Hola! Le escribimos de parte nuestra: ya pasó un tiempo desde que ${quien} recibió `
      message += `${alert.title}. ¿Le gustaría reservar para estos días?`
    } else {
      message = `Hola! Le recordamos que ${quien} tiene programado: ${alert.title}`
      message += ` para el ${formatDate(alert.dueDate)}. ¿Le gustaría agendar una cita?`
    }

    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  const formatDate = (date) => {
    if (!date) return '-'
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleDateString('es-PE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  const getDaysUntil = (date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(date)
    target.setHours(0, 0, 0, 0)
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24))
    return diff
  }

  /**
   * Una fila de recordatorio.
   *
   * Fondo neutro siempre. La pantalla llegó a tener cinco colores a la vez —
   * tarjeta roja o amarilla, círculo azul o morado, badge de otro color — y
   * con eso lo urgente dejaba de destacar, porque todo destacaba. El color
   * queda para UNA sola cosa: lo vencido. El resto se lee en el texto.
   */
  const renderAlert = (alert, isOverdue = false) => {
    const daysUntil = getDaysUntil(alert.dueDate)
    const isVaccination = alert.type === 'vaccination'
    const esVenta = alert.type === 'sale'
    const urgente = isOverdue || daysUntil <= 1

    return (
      <div
        key={`${alert.type}-${alert.id}`}
        className="flex items-start justify-between gap-3 py-3 px-1 border-b border-gray-100 last:border-0"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-2 rounded-lg bg-gray-100 flex-shrink-0">
            {isVaccination
              ? <Syringe className="w-4 h-4 text-gray-500" />
              : <Calendar className="w-4 h-4 text-gray-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">{alert.title}</span>
              <span className="text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-0.5">
                {isVaccination ? 'Vacuna' : esVenta ? 'Comprado' : 'Servicio'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{alert.description}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
              {alert.petName && (
                <span className="inline-flex items-center gap-1">
                  <PawPrint className="w-3 h-3" />
                  {alert.petName}
                  {alert.petSpecies && ` (${alert.petSpecies})`}
                </span>
              )}
              <span className="truncate">{alert.customerName}</span>
              {alert.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {alert.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-sm font-medium ${urgente ? 'text-red-600' : 'text-gray-700'}`}>
            {isOverdue
              ? 'Vencido'
              : daysUntil === 0 ? 'Hoy'
                : daysUntil === 1 ? 'Mañana'
                  : `En ${daysUntil} días`}
          </span>
          <span className="text-xs text-gray-400">{formatDate(alert.dueDate)}</span>

          <div className="flex items-center gap-1 mt-1">
            <button
              onClick={() => handleWhatsApp(alert)}
              disabled={!alert.phone}
              className="p-1.5 text-gray-500 hover:text-green-700 hover:bg-green-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={alert.phone ? `Escribir a ${alert.phone}` : 'Este cliente no tiene teléfono registrado'}
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            {(alert.type === 'service' || alert.type === 'sale') && (
              <button
                onClick={() => handleMarkCompleted(alert)}
                disabled={markingCompleted === alert.id}
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                title="Marcar como completado"
              >
                {markingCompleted === alert.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ═══ Las dos fuentes, juntas ═══
  //
  // Los hooks van ANTES del early return de `isLoading`: debajo de un `return`
  // condicional, React los ve aparecer y desaparecer entre renders (error #310).
  const pendingAlerts = useMemo(
    () => [...ventasPend, ...fichasPend].sort((a, b) => a.dueDate - b.dueDate),
    [ventasPend, fichasPend],
  )
  // Lo vencido al revés: el que se pasó ayer se recupera con una llamada, el de
  // hace cinco meses ya es historia.
  const overdueAlerts = useMemo(
    () => [...ventasVenc, ...fichasVenc].sort((a, b) => b.dueDate - a.dueDate),
    [ventasVenc, fichasVenc],
  )

  // Las opciones del selector salen de TODO lo cargado, no de lo ya filtrado:
  // si no, al elegir un servicio los demás desaparecían del propio selector y
  // no había forma de cambiar de opinión sin limpiar el filtro.
  const opcionesDeServicio = useMemo(
    () => serviciosDisponibles([pendingAlerts, overdueAlerts]),
    [pendingAlerts, overdueAlerts],
  )

  const pendFiltradas = useMemo(
    () => aplicarFiltros(pendingAlerts, { servicios, cliente: buscaCliente }),
    [pendingAlerts, servicios, buscaCliente],
  )
  const vencFiltradas = useMemo(
    () => aplicarFiltros(overdueAlerts, { servicios, cliente: buscaCliente }),
    [overdueAlerts, servicios, buscaCliente],
  )

  const hayFiltros = servicios.size > 0 || buscaCliente.trim() !== ''

  const alternarServicio = (id) => {
    setServicios(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setPagina(1)
  }

  const limpiarFiltros = () => {
    setServicios(new Set())
    setBuscaCliente('')
    setPagina(1)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando recordatorios...</p>
        </div>
      </div>
    )
  }

  const totalAlerts = pendFiltradas.length + vencFiltradas.length

  const finDe = (dias) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + dias)
    d.setHours(23, 59, 59, 999)
    return d
  }

  const limiteDelPeriodo = (id) =>
    id === 'hoy' ? finDe(0) : id === 'semana' ? finDe(7) : finDe(30)

  /**
   * Los recordatorios del período elegido.
   *
   * Cada filtro es EXCLUYENTE. "Hoy" tiene que responder una sola pregunta —
   * a quién se le cumple el plazo hoy, para escribirle hoy — y si además le
   * mete adentro todo lo vencido de meses atrás, esa lista deja de servir para
   * la rutina del día. Lo vencido tiene su propia pestaña.
   *
   * Se calcula sobre lo que ya está en memoria (la carga trae el mes entero),
   * así que cambiar de filtro es instantáneo.
   */
  const delPeriodo = (id) =>
    id === 'vencidos'
      ? vencFiltradas
      : pendFiltradas.filter(a => a.dueDate <= limiteDelPeriodo(id))

  const cuantosEn = (id) => delPeriodo(id).length
  const visibles = delPeriodo(periodo)


  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const enPantalla = visibles.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)

  const FILTROS = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'semana', label: 'Esta semana' },
    { id: 'mes', label: 'Este mes' },
    { id: 'vencidos', label: 'Vencidos' },
  ]

  const etiquetaTipo = (a) =>
    a.type === 'vaccination' ? 'Vacuna' : a.type === 'sale' ? 'Comprado' : 'Servicio'

  const estadoDe = (a) => {
    const d = getDaysUntil(a.dueDate)
    // "Vencido" a secas no dice nada: hace falta saber si fue anteayer o en
    // abril para decidir a quién se llama primero.
    if (a.overdue) return { texto: `Venció hace ${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'}`, urgente: true }
    if (d === 0) return { texto: 'Hoy', urgente: true }
    if (d === 1) return { texto: 'Mañana', urgente: true }
    return { texto: `En ${d} días`, urgente: false }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Recordatorios</h1>
          <GuideLink />
        </div>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          A quién llamar: lo que cada cliente se llevó y ya toca repetir
        </p>
      </div>

      {/* Filtros.
          El rango de VENTAS es el unico que cuesta: decide cuanto se lee de
          Firestore. Los otros dos recortan lo que ya esta en memoria. */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Rango de ventas */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ventas desde</label>
              <select
                value={rango}
                onChange={(e) => { setRango(e.target.value); setPagina(1) }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {RANGOS.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
                <option value="personalizado">Desde una fecha...</option>
              </select>
              {rango === 'personalizado' && (
                <input
                  type="date"
                  value={desdeManual}
                  onChange={(e) => { setDesdeManual(e.target.value); setPagina(1) }}
                  className="mt-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              )}
            </div>

            {/* Servicio o producto */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Servicio o producto</label>
              <button
                type="button"
                onClick={() => setPanelServicios(v => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:border-gray-400 transition-colors"
              >
                <span className={servicios.size ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                  {servicios.size === 0 ? 'Todos' : servicios.size + (servicios.size === 1 ? ' elegido' : ' elegidos')}
                </span>
                <SlidersHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            </div>

            {/* Cliente */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cliente o paciente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={buscaCliente}
                  onChange={(e) => { setBuscaCliente(e.target.value); setPagina(1) }}
                  placeholder={esVeterinaria ? 'Nombre, mascota o telefono' : 'Nombre o telefono'}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* El desplegable de servicios ofrece lo que DE VERDAD genera
              recordatorios, no el catalogo entero: en una veterinaria son
              cientos de productos y la mayoria nunca aparece aca. El numero de
              al lado dice cuantos hay de cada uno. */}
          {panelServicios && (
            <div className="border border-gray-200 rounded-lg p-3">
              <Input
                placeholder="Buscar servicio..."
                value={buscaServicio}
                onChange={(e) => setBuscaServicio(e.target.value)}
                className="mb-2"
              />
              {opcionesDeServicio.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">
                  Todavia no hay recordatorios en este rango de ventas.
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-100">
                  {opcionesDeServicio
                    .filter(op => op.label.toLowerCase().includes(buscaServicio.trim().toLowerCase()))
                    .map(op => (
                      <label key={op.id} className="flex items-center gap-2 py-2 px-1 text-sm cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={servicios.has(op.id)}
                          onChange={() => alternarServicio(op.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="flex-1 min-w-0 truncate text-gray-800">{op.label}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{op.total}</span>
                      </label>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Las vacunas y controles viven dentro de la ficha de cada cliente, asi
              que traerlos cuesta dos consultas por cliente. Pasado el tope no se
              hace solo: se ofrece, con el numero a la vista para que la espera no
              sea una sorpresa. */}
          {!fichasCargadas.current && !cargandoFichas && cuantosClientes > TOPE_FICHAS_AUTOMATICAS && (
            <div className="flex items-start gap-3 flex-wrap p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <Syringe className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">
                  Faltan las vacunas y controles cargados a mano en las fichas.
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Hay que revisar {cuantosClientes.toLocaleString('es-PE')} fichas una por una, asi que tarda.
                  Lo de arriba sale de las ventas y ya esta completo.
                </p>
              </div>
              <button
                onClick={cargarFichas}
                className="px-3 py-1.5 text-sm font-medium text-primary-700 bg-white border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors flex-shrink-0"
              >
                Traerlas igual
              </button>
            </div>
          )}

          {/* Que se esta mirando, y a que costo */}
          <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500">
            <span>
              {desdeCache
                ? 'Mostrando lo guardado, actualizando...'
                : ventasLeidas !== null && ventasLeidas.toLocaleString('es-PE') + ' ventas leidas'}
              {cargandoFichas && (
                <span className="ml-2 inline-flex items-center gap-1 text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {avance && avance.total > 0
                    ? 'sumando vacunas y controles (' + avance.revisados + ' de ' + avance.total + ')'
                    : 'sumando vacunas y controles'}
                </span>
              )}
            </span>
            {hayFiltros && (
              <button
                onClick={limpiarFiltros}
                className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
              >
                <X className="w-3 h-3" />
                Quitar filtros
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filtros por período. Cada uno lleva su conteo, así que hacen de
          resumen y las tres tarjetas de estadísticas dejaron de hacer falta. */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => {
          const activo = periodo === f.id
          return (
            <button
              key={f.id}
              onClick={() => { setPeriodo(f.id); setPagina(1) }}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                activo
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 ${activo ? 'text-primary-500' : 'text-gray-400'}`}>
                {cuantosEn(f.id)}
              </span>
            </button>
          )
        })}
      </div>

      {/* "Hoy" es UN dia: solo entra aquel a quien se le cumple el plazo
          exactamente hoy, o sea el que compro hace justo 30 dias (o el plazo que
          tenga ese producto). Que de cero es lo habitual, y sin decirlo la
          pantalla parece rota. */}
      {periodo === 'hoy' && cuantosEn('hoy') === 0 && (
        <p className="text-sm text-gray-500 -mt-2">
          <strong>Hoy</strong> es un solo dia: aparece quien compro hace exactamente el
          plazo de ese producto. Que este vacio es normal.
          {cuantosEn('semana') > 0 && ' Prueba con Esta semana.'}
        </p>
      )}

      {visibles.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {hayFiltros ? 'Nada con estos filtros' : 'No hay recordatorios en este periodo'}
            </h3>
            {/* Antes decía solo "no hay recordatorios pendientes" y ahí se
                terminaba la ayuda: quien nunca vendió con cliente no tenía cómo
                saber de qué depende esta pantalla, y la leía como rota.
                Con filtros encima hay que decir CUÁL de los tres sobra, porque
                mandar a "ampliar el periodo" cuando lo que sobra es el filtro
                de servicio no lleva a ninguna parte. */}
            <p className="text-gray-600 max-w-md mx-auto">
              {hayFiltros
                ? 'Prueba quitando el filtro de servicio o de cliente, o amplía el rango de ventas.'
                : totalAlerts > 0
                  ? 'Prueba con un periodo más amplio.'
                  : 'Aquí aparecen las ventas hechas a un cliente con nombre, pasado el plazo que definas en Configuración > Punto de venta. Las ventas de mostrador, sin cliente, no generan recordatorio.'}
            </p>
            {/* El rango de ventas es el que sorprende: un plazo de 365 días no
                puede aparecer si solo se leyeron 90 días de ventas. */}
            {!hayFiltros && totalAlerts === 0 && rango !== 'todo' && (
              <p className="text-sm text-gray-500 max-w-md mx-auto mt-3">
                Ojo con <strong>Ventas desde</strong>: si tus plazos son largos ({esVeterinaria ? 'una vacuna' : 'un tratamiento'} anual, por ejemplo), amplía el rango para que esas ventas entren.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ESCRITORIO: tabla.
              CINCO columnas, no nueve. Con una por dato —cliente, paciente,
              teléfono, tipo, última vez, vence, estado— la tabla no entraba en
              la pantalla y había que arrastrarla de lado para leer una fila.
              Lo que va junto se muestra junto: el paciente debajo del cliente,
              el estado debajo de la fecha. El teléfono vive en el botón de
              WhatsApp, que es lo único para lo que se usa. */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Producto o servicio</TableHead>
                    <TableHead>Última vez</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enPantalla.map(alert => {
                    const estado = estadoDe(alert)
                    return (
                      <TableRow key={`${alert.type}-${alert.id}`}>
                        <TableCell className="whitespace-normal max-w-[240px]">
                          <div className="font-medium text-gray-900 break-words">{alert.customerName}</div>
                          {(alert.petName || alert.phone) && (
                            <div className="text-xs text-gray-500 mt-0.5 break-words">
                              {alert.petName}
                              {alert.petName && alert.petSpecies ? ` (${alert.petSpecies})` : ''}
                              {alert.petName && alert.phone ? ' · ' : ''}
                              {alert.phone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal max-w-[280px]">
                          <div className="text-gray-900 break-words">{alert.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{etiquetaTipo(alert)}</div>
                        </TableCell>
                        <TableCell className="text-gray-500 whitespace-nowrap">
                          {alert.fecha ? formatDate(alert.fecha) : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className={estado.urgente ? 'text-red-600 font-medium' : 'text-gray-700'}>
                            {formatDate(alert.dueDate)}
                          </div>
                          <div className={`text-xs mt-0.5 ${estado.urgente ? 'text-red-500' : 'text-gray-500'}`}>
                            {estado.texto}
                          </div>
                        </TableCell>
                        <TableCell className="w-px">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleWhatsApp(alert)}
                              disabled={!alert.phone}
                              className="p-1.5 text-gray-500 hover:text-green-700 hover:bg-green-50 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                              title={alert.phone ? `Escribir a ${alert.phone}` : 'Este cliente no tiene teléfono registrado'}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                            {(alert.type === 'service' || alert.type === 'sale') && (
                              <button
                                onClick={() => handleMarkCompleted(alert)}
                                disabled={markingCompleted === alert.id}
                                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                                title="Ya lo atendi"
                              >
                                {markingCompleted === alert.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <CheckCircle2 className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* MÓVIL: tarjetas, que en una pantalla angosta se leen mejor que
              nueve columnas apretadas. */}
          <Card className="lg:hidden">
            <CardContent className="p-4">
              {enPantalla.map(alert => renderAlert(alert, !!alert.overdue))}
            </CardContent>
          </Card>
          {/* Paginación. Con el historial completo detrás, un negocio con
              movimiento junta cientos de recordatorios y volcarlos todos deja
              la pantalla imposible de recorrer. */}
          {visibles.length > POR_PAGINA && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                Mostrando {(paginaActual - 1) * POR_PAGINA + 1}
                {' - '}
                {Math.min(paginaActual * POR_PAGINA, visibles.length)} de {visibles.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPagina(1)}
                  disabled={paginaActual === 1}
                  className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Primera"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPagina(paginaActual - 1)}
                  disabled={paginaActual === 1}
                  className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 text-sm text-gray-600">
                  {paginaActual} / {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina(paginaActual + 1)}
                  disabled={paginaActual === totalPaginas}
                  className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPagina(totalPaginas)}
                  disabled={paginaActual === totalPaginas}
                  className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Última"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
