import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, query, where, orderBy, limit, startAfter, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency, matchesPrebuilt, buildSearchHaystack } from '@/lib/utils'
import { urlXmlDe, urlCdrDe, cdrEnLineaDe, tieneCdr, tieneXmlGuardado, estadoSunatDe, fechaDelComprobante } from '@/utils/sunatDocs'
import { downloadFromUrl, downloadBlob } from '@/utils/nativeDownload'
import {
  FileCheck2, Search, RefreshCw, Download, Code, Eye, X, Loader2,
  CheckCircle, XCircle, Clock, Ban, ChevronLeft, ChevronRight
} from 'lucide-react'

/**
 * Panel de CPE de los negocios con SUNAT DIRECTO — la vista de soporte.
 *
 * Existe porque con QPse hay un panel del proveedor (cpe.qpse.pe) donde ver y
 * descargar los XML/CDR de todas las empresas, pero para SUNAT directo esos
 * archivos solo se podían ver entrando a la cuenta del negocio.
 *
 * Dos pestañas, como en QPse:
 *  - Comprobantes y guías: SOLO documentos que viajan a SUNAT — facturas,
 *    boletas, NC, ND y las dos guías de remisión. Las notas de venta viven en
 *    la misma colección `invoices` pero son internas (no se declaran), así que
 *    se excluyen con la lista blanca de TIPOS.
 *  - Comunicaciones de baja: SUNAT tiene DOS mecanismos según el documento.
 *    Las facturas (y sus notas) se dan de baja con una comunicación RA-
 *    (colección `voidedDocuments`); las BOLETAS se anulan con un resumen
 *    diario de baja RC- (colección `summaryDocuments`, action 'void'). La
 *    pestaña junta los dos — al principio solo leía RA y las boletas anuladas
 *    "no aparecían" (caso LA PATOTA, 31-ago-2026).
 *
 * PAGINACIÓN POR MEZCLA DE FUENTES. La lista junta ~12 negocios × 3
 * colecciones ordenados por fecha de creación, y hay meses de miles de
 * boletas: traerlo todo de golpe no escala. Cada fuente (negocio×colección)
 * mantiene su propio cursor y va trayendo tandas; una fila es "segura" de
 * mostrar cuando ninguna fuente sin agotar podría todavía traer algo más
 * nuevo que ella (la marca de agua = la más nueva de las "últimas traídas").
 * Al avanzar de página se piden más tandas SOLO a la fuente que limita.
 * Así el primer pantallazo es liviano y "todas" las páginas son alcanzables.
 *
 * La marca de agua se calcula sobre las fuentes RELEVANTES al filtro de tipo:
 * al filtrar por GRE, las boletas no deben retener nada (caso HUAMAN PUSCAN,
 * 31-ago-2026: su guía del 21-ago existía pero quedaba "no segura" porque las
 * miles de boletas de otro negocio apenas cubrían los últimos días del mes).
 *
 * Cero índices nuevos y cero cambios de reglas: el admin ya lee subcolecciones
 * de businesses (es lo que usan las stats de SUNAT de la página Usuarios), y
 * las descargas usan las URLs con token guardadas en el propio documento
 * (criterio compartido en @/utils/sunatDocs, el mismo de Contabilidad).
 */

const POR_PAGINA = 15
const TANDA = 100      // documentos por fetch por fuente
const MAX_RONDAS = 12  // tope de fetches por avance (filtros muy estrechos)

// Lista blanca de lo que se muestra: lo que se declara ante SUNAT. Las guías
// no traen documentType en su doc — se les estampa al leerlas de su colección.
const TIPOS = {
  factura: { label: 'Factura', color: 'bg-blue-100 text-blue-700' },
  boleta: { label: 'Boleta', color: 'bg-purple-100 text-purple-700' },
  nota_credito: { label: 'Nota de Crédito', color: 'bg-amber-100 text-amber-700' },
  nota_debito: { label: 'Nota de Débito', color: 'bg-cyan-100 text-cyan-700' },
  guia_remision: { label: 'GRE Remitente', color: 'bg-teal-100 text-teal-700' },
  guia_transportista: { label: 'GRE Transportista', color: 'bg-indigo-100 text-indigo-700' },
}

const ESTADOS = {
  accepted: { label: 'Aceptado', color: 'bg-green-100 text-green-700', Icon: CheckCircle },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700', Icon: XCircle },
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', Icon: Clock },
  voided: { label: 'Anulado', color: 'bg-gray-100 text-gray-600', Icon: Ban },
}

const mesActual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const formatFechaHora = (v) => {
  if (!v) return '-'
  const d = v.toDate ? v.toDate() : v.seconds ? new Date(v.seconds * 1000) : new Date(v)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}

// Instante comparable de una fila (para ordenar y para la marca de agua)
const tiempoDe = (fila) => {
  const c = fila.createdAt
  if (!c) return 0
  if (typeof c.seconds === 'number') return c.seconds + (c.nanoseconds || 0) / 1e9
  const d = c.toDate ? c.toDate() : new Date(c)
  return isNaN(d.getTime()) ? 0 : d.getTime() / 1000
}

export default function AdminCpe() {
  const [empresas, setEmpresas] = useState([])
  const [cargandoEmpresas, setCargandoEmpresas] = useState(true)

  const [seccion, setSeccion] = useState('cpe') // 'cpe' | 'bajas'
  const [empresaSel, setEmpresaSel] = useState('all')
  const [mes, setMes] = useState(mesActual())
  const [tipoFiltro, setTipoFiltro] = useState('all')
  const [estadoFiltro, setEstadoFiltro] = useState('all')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)

  // Las fuentes y sus cursores viven en un ref (se mutan durante los fetch);
  // `vista` es la foto que se renderiza: filas ordenadas + marca de agua.
  const datosRef = useRef({ fuentes: [], filas: [] })
  const [vista, setVista] = useState({ filas: [], fuentes: [] })
  const [cargando, setCargando] = useState(false)     // carga inicial
  const [buscandoMas, setBuscandoMas] = useState(false) // tandas extra en curso
  const [sinNuevas, setSinNuevas] = useState(false)   // el último avance no encontró más

  // Comunicaciones de baja: se cargan recién al abrir su pestaña
  const [bajas, setBajas] = useState(null)
  const [cargandoBajas, setCargandoBajas] = useState(false)
  const [paginaBajas, setPaginaBajas] = useState(0)

  const [detalle, setDetalle] = useState(null)
  const [detalleTab, setDetalleTab] = useState('info') // 'info' | 'seguimiento'
  const [descargando, setDescargando] = useState(null)

  // ------------------------------------------------------------ los negocios
  useEffect(() => {
    const cargar = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'businesses'),
          where('emissionConfig.method', '==', 'sunat_direct')
        ))
        const lista = snap.docs.map(d => {
          const b = d.data()
          return {
            id: d.id,
            nombre: b.razonSocial || b.businessName || d.id,
            ruc: b.ruc || '',
          }
        }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        setEmpresas(lista)
      } catch (e) {
        console.error('Error cargando negocios sunat_direct:', e)
      } finally {
        setCargandoEmpresas(false)
      }
    }
    cargar()
  }, [])

  const nombreEmpresa = useMemo(() => {
    const m = new Map()
    for (const e of empresas) m.set(e.id, e)
    return m
  }, [empresas])

  // ------------------------------------------------------------- las queries
  // Rango del mes elegido, consultado por createdAt (fecha de creación). Se
  // muestra TAMBIÉN la fecha de emisión: un comprobante back-dateado aparece
  // en el mes en que se creó, igual que en el panel de QPse.
  const rangoDelMes = () => {
    const [y, m] = mes.split('-').map(Number)
    return [new Date(y, m - 1, 1), new Date(y, m, 1)]
  }

  const consultarColeccion = async (bizId, coleccion, tope, despuesDe = null) => {
    const [desde, hasta] = rangoDelMes()
    const partes = [
      where('createdAt', '>=', desde),
      where('createdAt', '<', hasta),
      orderBy('createdAt', 'desc'),
    ]
    if (despuesDe) partes.push(startAfter(despuesDe))
    partes.push(limit(tope))
    const snap = await getDocs(query(collection(db, 'businesses', bizId, coleccion), ...partes))
    return snap.docs
  }

  // Normaliza cada fuente a una fila común. A las guías se les estampa el
  // documentType (su doc no lo trae) y su destinatario pasa a `customer`
  // para que la tabla y la búsqueda no distingan orígenes.
  const aFila = (fuente) => (d) => {
    const g = d.data()
    if (fuente.coleccion === 'invoices') return { id: d.id, bizId: fuente.bizId, coleccion: 'invoices', ...g }
    return {
      id: d.id, bizId: fuente.bizId, coleccion: fuente.coleccion,
      ...g,
      documentType: fuente.coleccion === 'dispatchGuides' ? 'guia_remision' : 'guia_transportista',
      customer: g.recipient || g.customer || null,
    }
  }

  /** Trae la siguiente tanda de UNA fuente y la vuelca al acumulado. */
  const traerTanda = async (fuente) => {
    try {
      const docs = await consultarColeccion(fuente.bizId, fuente.coleccion, TANDA, fuente.cursor)
      if (docs.length > 0) {
        fuente.cursor = docs[docs.length - 1]
        fuente.oldest = tiempoDe({ createdAt: docs[docs.length - 1].data().createdAt })
      }
      if (docs.length < TANDA) fuente.agotada = true
      // La lista blanca filtra al INGRESAR: las notas de venta ni entran al
      // acumulado (pero sí consumen tanda; por eso el bucle de rondas).
      const filas = docs.map(aFila(fuente)).filter(f => TIPOS[f.documentType])
      datosRef.current.filas.push(...filas)
    } catch (e) {
      // Colección inexistente o sin permiso: la fuente se da por agotada para
      // no trabar la marca de agua del resto.
      console.error(`Error en ${fuente.bizId}/${fuente.coleccion}:`, e)
      fuente.agotada = true
    }
  }

  /** Publica la foto ordenada + el estado de las fuentes para el render. */
  const publicar = () => {
    const { fuentes, filas } = datosRef.current
    filas.sort((a, b) => tiempoDe(b) - tiempoDe(a))
    setVista({
      filas: [...filas],
      fuentes: fuentes.map(f => ({ coleccion: f.coleccion, agotada: f.agotada, oldest: f.oldest })),
    })
  }

  // El filtro de tipo mapea 1 a 1 con la colección de origen: al filtrar por
  // GRE solo importan las fuentes de guías (que se agotan en la primera
  // tanda), y las miles de boletas de otro negocio no retienen la marca.
  const coleccionDelTipo = (tipo) => tipo === 'guia_remision' ? 'dispatchGuides'
    : tipo === 'guia_transportista' ? 'carrierDispatchGuides'
    : 'invoices'
  const fuentesRelevantes = (fuentes) =>
    fuentes.filter(f => tipoFiltro === 'all' || f.coleccion === coleccionDelTipo(tipoFiltro))
  // Una fila es segura si NINGUNA fuente relevante activa puede traer algo más
  // nuevo que ella: la marca es la más nueva de las "más viejas ya traídas".
  const marcaDe = (fuentes) => {
    const activas = fuentesRelevantes(fuentes).filter(f => !f.agotada)
    return activas.length ? Math.max(...activas.map(f => f.oldest ?? Infinity)) : -Infinity
  }
  const agotadoRelevante = fuentesRelevantes(vista.fuentes).every(f => f.agotada)

  // Filtro compartido entre el render y el bucle de rondas (misma lógica,
  // para que "ya tengo suficientes" signifique lo mismo en los dos lados).
  const pasaFiltros = (inv) => {
    if (tipoFiltro !== 'all' && inv.documentType !== tipoFiltro) return false
    if (estadoFiltro !== 'all' && estadoSunatDe(inv) !== estadoFiltro) return false
    if (busqueda) {
      const emp = nombreEmpresa.get(inv.bizId)
      const hay = buildSearchHaystack(
        inv.number,
        inv.customer?.businessName, inv.customer?.name, inv.customer?.documentNumber,
        emp?.nombre, emp?.ruc,
      )
      if (!matchesPrebuilt(busqueda, hay)) return false
    }
    return true
  }

  const contarFiltradasSeguras = () => {
    const { fuentes, filas } = datosRef.current
    const marca = marcaDe(fuentes)
    return filas.filter(f => tiempoDe(f) >= marca && pasaFiltros(f)).length
  }

  /**
   * Garantiza que haya al menos `objetivo` filas seguras que pasen los
   * filtros, pidiendo tandas a la fuente que limita la marca de agua.
   * Acotado a MAX_RONDAS por llamada para que un filtro estrecho en un mes de
   * miles de boletas no dispare fetches sin fin (el botón avisa y se puede
   * volver a presionar).
   */
  const asegurar = async (objetivo) => {
    const { fuentes } = datosRef.current
    let rondas = 0
    while (rondas < MAX_RONDAS && contarFiltradasSeguras() < objetivo) {
      const activas = fuentesRelevantes(fuentes).filter(f => !f.agotada)
      if (activas.length === 0) break
      // La fuente limitante: la de "más vieja traída" MÁS NUEVA. Las que aún
      // no trajeron nada (oldest undefined) limitan siempre — van primero.
      const limitante = activas.find(f => f.oldest === undefined) ||
        activas.reduce((a, b) => ((a.oldest ?? Infinity) >= (b.oldest ?? Infinity) ? a : b))
      await traerTanda(limitante)
      rondas++
    }
    publicar()
  }

  const cargaInicial = async () => {
    if (cargandoEmpresas) return
    setCargando(true)
    setPagina(0)
    setSinNuevas(false)
    const ids = empresaSel === 'all' ? empresas.map(e => e.id) : [empresaSel]
    datosRef.current = {
      fuentes: ids.flatMap(bizId => (
        ['invoices', 'dispatchGuides', 'carrierDispatchGuides'].map(coleccion => ({
          bizId, coleccion, cursor: null, agotada: false, oldest: undefined,
        }))
      )),
      filas: [],
    }
    setVista({ filas: [], fuentes: [] })
    try {
      // Primera tanda de TODAS las fuentes en paralelo: establece la marca de
      // agua global y suele alcanzar para varias páginas.
      await Promise.all(datosRef.current.fuentes.map(f => traerTanda(f)))
      publicar()
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargaInicial()
    if (seccion === 'bajas') cargarBajas()
    else setBajas(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaSel, mes, cargandoEmpresas])

  // Cambió un filtro en memoria: volver a la página 1 y, si lo cargado no da
  // ni para una página, salir a buscar más (con un pequeño debounce para no
  // disparar fetches por cada tecla del buscador).
  useEffect(() => {
    setPagina(0)
    setSinNuevas(false)
    const t = setTimeout(async () => {
      if (cargando || agotadoRelevante) return
      if (contarFiltradasSeguras() < POR_PAGINA) {
        setBuscandoMas(true)
        try { await asegurar(POR_PAGINA) } finally { setBuscandoMas(false) }
      }
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoFiltro, estadoFiltro, busqueda])

  // -------------------------------------------------------- filas visibles
  const filtrados = useMemo(() => {
    const marca = marcaDe(vista.fuentes)
    return vista.filas.filter(f => tiempoDe(f) >= marca && pasaFiltros(f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, tipoFiltro, estadoFiltro, busqueda, nombreEmpresa])

  const paginaFilas = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)

  const avanzar = async () => {
    setSinNuevas(false)
    // Apuntar a dejar la página siguiente COMPLETA (y una fila extra para
    // saber si habrá otra más).
    const objetivo = (pagina + 2) * POR_PAGINA + 1
    if (filtrados.length < objetivo && !agotadoRelevante) {
      setBuscandoMas(true)
      try { await asegurar(objetivo) } finally { setBuscandoMas(false) }
    }
    if (contarFiltradasSeguras() > (pagina + 1) * POR_PAGINA) {
      setPagina(p => p + 1)
    } else {
      // Se revisaron MAX_RONDAS tandas sin nuevas coincidencias: avisar en el
      // pie; otro clic sigue revisando desde donde quedó.
      setSinNuevas(true)
    }
  }

  const stats = useMemo(() => ({
    total: filtrados.length,
    accepted: filtrados.filter(i => estadoSunatDe(i) === 'accepted').length,
    rejected: filtrados.filter(i => estadoSunatDe(i) === 'rejected').length,
    pending: filtrados.filter(i => estadoSunatDe(i) === 'pending').length,
    voided: filtrados.filter(i => estadoSunatDe(i) === 'voided').length,
  }), [filtrados])

  // ------------------------------------------------- comunicaciones de baja
  const cargarBajas = async () => {
    if (cargandoEmpresas) return
    setCargandoBajas(true)
    setBajas([])
    setPaginaBajas(0)
    try {
      const ids = empresaSel === 'all' ? empresas.map(e => e.id) : [empresaSel]
      // RA (facturas/notas) y RC (boletas) en paralelo. Los documentos
      // contador (`counter_YYYYMMDD`) no traen createdAt, así que el rango
      // por fecha ya los deja fuera.
      const porEmpresa = await Promise.all(ids.flatMap(id => ([
        consultarColeccion(id, 'voidedDocuments', 300)
          .then(ds => ds.map(d => ({ id: d.id, bizId: id, origen: 'RA', ...d.data() })))
          .catch(err => { console.error(`Error bajas RA ${id}:`, err); return [] }),
        consultarColeccion(id, 'summaryDocuments', 300)
          .then(ds => ds.map(d => ({ id: d.id, bizId: id, origen: 'RC', ...d.data() })))
          .catch(err => { console.error(`Error bajas RC ${id}:`, err); return [] }),
      ])))
      setBajas(porEmpresa.flat().sort((a, b) => tiempoDe(b) - tiempoDe(a)))
    } catch (e) {
      console.error('Error cargando comunicaciones de baja:', e)
    } finally {
      setCargandoBajas(false)
    }
  }

  useEffect(() => {
    if (seccion === 'bajas' && bajas === null) cargarBajas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion])

  const bajasFiltradas = useMemo(() => {
    if (!bajas) return []
    return bajas.filter(b => {
      if (busqueda) {
        const emp = nombreEmpresa.get(b.bizId)
        const hay = buildSearchHaystack(
          b.voidedDocId, b.summaryDocId, b.invoiceSeries, String(b.invoiceNumber || ''),
          `${b.invoiceSeries}-${b.invoiceNumber}`, b.ticket, b.reason,
          emp?.nombre, emp?.ruc,
        )
        if (!matchesPrebuilt(busqueda, hay)) return false
      }
      return true
    })
  }, [bajas, busqueda, nombreEmpresa])

  const paginaBajasFilas = bajasFiltradas.slice(paginaBajas * POR_PAGINA, (paginaBajas + 1) * POR_PAGINA)

  useEffect(() => { setPaginaBajas(0) }, [busqueda])

  // ------------------------------------------------------------- descargas
  const numeroLimpio = (inv) => String(inv.number || inv.id).replace(/\//g, '-')

  const bajar = async (clave, url, nombre, contenidoEnLinea = null) => {
    setDescargando(clave)
    try {
      if (url) await downloadFromUrl(url, nombre)
      else if (contenidoEnLinea) await downloadBlob(new Blob([contenidoEnLinea], { type: 'application/xml' }), nombre)
    } catch (e) {
      console.error(`Error al descargar ${nombre}:`, e)
    } finally {
      setDescargando(null)
    }
  }

  const descargarXml = (inv) => bajar(`${inv.id}-xml`, urlXmlDe(inv), `${numeroLimpio(inv)}.xml`)
  const descargarCdr = (inv) => bajar(`${inv.id}-cdr`, urlCdrDe(inv), `CDR-${numeroLimpio(inv)}.xml`, cdrEnLineaDe(inv))

  /**
   * Historial de envíos del documento, más reciente primero.
   *
   * Los documentos nuevos traen `sunatLog` (lo anexa un trigger en cada
   * cambio de respuesta). Los anteriores al trigger solo conservan la ÚLTIMA
   * respuesta — cada reenvío la pisaba — así que se reconstruye lo que se
   * puede: creación, último envío y último error de reintento, marcado como
   * historial parcial.
   */
  const historialDe = (inv) => {
    const eventos = []
    if (Array.isArray(inv.sunatLog) && inv.sunatLog.length > 0) {
      for (const e of inv.sunatLog) {
        eventos.push({ at: e.at, status: e.status, code: e.code, description: e.description, method: e.method })
      }
      return { eventos: eventos.reverse(), parcial: false }
    }
    const aIso = (valor) => {
      if (!valor) return null
      const d = valor.toDate ? valor.toDate() : valor.seconds ? new Date(valor.seconds * 1000) : new Date(valor)
      return isNaN(d.getTime()) ? null : d.toISOString()
    }
    if (inv.lastRetryError?.timestamp && inv.lastRetryError.timestamp !== aIso(inv.sunatSentAt)) {
      eventos.push({
        at: inv.lastRetryError.timestamp, status: 'pending',
        code: inv.lastRetryError.code, description: inv.lastRetryError.description,
        etiqueta: 'Último error de reintento',
      })
    }
    if (inv.sunatSentAt) {
      eventos.push({
        at: aIso(inv.sunatSentAt), status: estadoSunatDe(inv),
        code: inv.sunatResponse?.code, description: inv.sunatResponse?.description,
        method: inv.sunatResponse?.method, etiqueta: 'Último envío',
      })
    }
    if (inv.voidedAt) {
      eventos.push({ at: aIso(inv.voidedAt), status: 'voided', description: inv.voidReason || 'Documento dado de baja', etiqueta: 'Anulación' })
    }
    eventos.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    eventos.push({ at: aIso(inv.createdAt), status: 'created', description: 'Documento creado en el sistema', etiqueta: 'Creación' })
    return { eventos, parcial: true }
  }

  // ---------------------------------------------------------------- badges
  const BadgeEstado = ({ estado }) => {
    const est = ESTADOS[estado] || { label: estado || '-', color: 'bg-gray-100 text-gray-600', Icon: Clock }
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${est.color}`}>
        <est.Icon className="w-3 h-3" /> {est.label}
      </span>
    )
  }

  const BadgeTipo = ({ inv }) => {
    const t = TIPOS[inv.documentType] || { label: inv.documentType || '-', color: 'bg-gray-100 text-gray-600' }
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${t.color}`}>{t.label}</span>
  }

  // Estado de una comunicación de baja: usa su campo `status` propio
  // ('pending' hasta que SUNAT procesa el ticket, luego 'accepted'/'error').
  const estadoDeBaja = (b) => {
    if (b.status === 'accepted') return 'accepted'
    if (b.status === 'pending') return 'pending'
    return 'rejected'
  }

  const Paginador = ({ paginaActual, filasEnPagina, totalFiltradas, completo, onAnterior, onSiguiente, avanzando, avisoSinNuevas }) => {
    const desde = totalFiltradas === 0 ? 0 : paginaActual * POR_PAGINA + 1
    const hasta = paginaActual * POR_PAGINA + filasEnPagina
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t border-gray-100">
        <div className="text-xs sm:text-sm text-gray-500">
          {totalFiltradas === 0 ? 'Sin resultados' : `${desde}–${hasta}`}
          {completo ? ` de ${totalFiltradas}` : ' · hay más por cargar'}
          {avisoSinNuevas && (
            <span className="block text-amber-600 mt-0.5">
              Se revisó una tanda más sin nuevas coincidencias — presiona Siguiente otra vez para seguir revisando el mes.
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAnterior}
            disabled={paginaActual === 0 || avanzando}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <span className="px-2 text-sm text-gray-500">Página {paginaActual + 1}</span>
          <button
            onClick={onSiguiente}
            disabled={avanzando || (completo && hasta >= totalFiltradas)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente {avanzando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileCheck2 className="w-6 h-6 text-primary-600" />
          Comprobantes SUNAT directo
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          XML firmados y CDR de los {empresas.length} negocios que emiten directo contra SUNAT: facturas, boletas, notas, guías de remisión y comunicaciones de baja.
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[['cpe', 'Comprobantes y guías'], ['bajas', 'Resúmenes diarios']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSeccion(k)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${seccion === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stats (solo comprobantes) */}
      {seccion === 'cpe' && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4">
            {[
              ['Total', stats.total, 'text-gray-900'],
              ['Aceptados', stats.accepted, 'text-green-600'],
              ['Rechazados', stats.rejected, 'text-red-600'],
              ['Pendientes', stats.pending, 'text-amber-600'],
              ['Anulados', stats.voided, 'text-gray-500'],
            ].map(([label, valor, color]) => (
              <div key={label} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
                <p className="text-xs sm:text-sm font-medium text-gray-500">{label}</p>
                <p className={`text-xl sm:text-2xl font-bold ${color}`}>{valor}</p>
              </div>
            ))}
          </div>
          {!agotadoRelevante && !cargando && (
            <p className="text-[11px] text-gray-400 mt-1">Conteos sobre lo cargado hasta ahora; avanza de página para traer más.</p>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={seccion === 'cpe'
                  ? 'Buscar por número, cliente, empresa o RUC...'
                  : 'Buscar por identificador, documento, ticket, empresa...'}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={() => (seccion === 'cpe' ? cargaInicial() : cargarBajas())}
              disabled={cargando || cargandoBajas}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Recargar"
            >
              <RefreshCw className={`w-5 h-5 ${(cargando || cargandoBajas) ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={empresaSel}
              onChange={e => setEmpresaSel(e.target.value)}
              className="flex-1 sm:flex-none sm:max-w-xs px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Todas las empresas ({empresas.length})</option>
              {empresas.map(e => (
                <option key={e.id} value={e.id}>{e.nombre} {e.ruc ? `(${e.ruc})` : ''}</option>
              ))}
            </select>

            <input
              type="month"
              value={mes}
              onChange={e => e.target.value && setMes(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />

            {seccion === 'cpe' && (<>
              <select
                value={tipoFiltro}
                onChange={e => setTipoFiltro(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Todos los tipos</option>
                {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>

              <select
                value={estadoFiltro}
                onChange={e => setEstadoFiltro(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Todos los estados</option>
                {Object.entries(ESTADOS).map(([k, est]) => <option key={k} value={k}>{est.label}</option>)}
              </select>
            </>)}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ tabla comprobantes */}
      {seccion === 'cpe' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {cargando ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando comprobantes...
            </div>
          ) : paginaFilas.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              {vista.filas.length === 0 ? 'Sin comprobantes en este mes' : 'Nada coincide con los filtros'}
              {!agotadoRelevante && vista.filas.length > 0 && (
                <button
                  onClick={avanzar}
                  disabled={buscandoMas}
                  className="block mx-auto mt-3 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg font-medium"
                >
                  {buscandoMas ? 'Revisando el mes...' : 'Seguir revisando el mes'}
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-3">Emisión</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Número</th>
                    <th className="px-4 py-3">Cliente / Destinatario</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginaFilas.map(inv => {
                    const emp = nombreEmpresa.get(inv.bizId)
                    return (
                      <tr key={`${inv.bizId}-${inv.coleccion}-${inv.id}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">
                          {fechaDelComprobante(inv)?.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) || '-'}
                          <span className="block text-[11px] text-gray-400">creado {formatFechaHora(inv.createdAt)}</span>
                        </td>
                        <td className="px-4 py-2.5 max-w-[220px]">
                          <p className="truncate font-medium text-gray-900 text-[13px]">{emp?.nombre || inv.bizId}</p>
                          <p className="text-[11px] text-gray-400">{emp?.ruc}</p>
                        </td>
                        <td className="px-4 py-2.5"><BadgeTipo inv={inv} /></td>
                        <td className="px-4 py-2.5 whitespace-nowrap font-medium text-gray-900">{inv.number || '-'}</td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          <p className="truncate text-gray-700">{inv.customer?.businessName || inv.customer?.name || '-'}</p>
                          <p className="text-[11px] text-gray-400">{inv.customer?.documentNumber || ''}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap font-semibold text-gray-900">
                          {inv.coleccion === 'invoices' ? formatCurrency(inv.total || 0, inv.currency) : '-'}
                        </td>
                        <td className="px-4 py-2.5"><BadgeEstado estado={estadoSunatDe(inv)} /></td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {tieneXmlGuardado(inv) && (
                              <button
                                onClick={() => descargarXml(inv)}
                                title="Descargar XML firmado"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                              >
                                {descargando === `${inv.id}-xml` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code className="w-4 h-4" />}
                              </button>
                            )}
                            {tieneCdr(inv) && (
                              <button
                                onClick={() => descargarCdr(inv)}
                                title="Descargar CDR"
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                              >
                                {descargando === `${inv.id}-cdr` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                              </button>
                            )}
                            <button
                              onClick={() => { setDetalle(inv); setDetalleTab('info') }}
                              title="Ver detalle"
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!cargando && (
            <Paginador
              paginaActual={pagina}
              filasEnPagina={paginaFilas.length}
              totalFiltradas={filtrados.length}
              completo={agotadoRelevante}
              onAnterior={() => { setSinNuevas(false); setPagina(p => Math.max(0, p - 1)) }}
              onSiguiente={avanzar}
              avanzando={buscandoMas}
              avisoSinNuevas={sinNuevas}
            />
          )}
        </div>
      )}

      {/* --------------------------------------------------- tabla de bajas */}
      {seccion === 'bajas' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {cargandoBajas || bajas === null ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando resúmenes diarios...
            </div>
          ) : paginaBajasFilas.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              {bajas.length === 0 ? 'Sin resúmenes ni comunicaciones de baja en este mes' : 'Nada coincide con la búsqueda'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Identificador</th>
                    <th className="px-4 py-3">Documento dado de baja</th>
                    <th className="px-4 py-3">Motivo</th>
                    <th className="px-4 py-3">Ticket</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginaBajasFilas.map(b => {
                    const emp = nombreEmpresa.get(b.bizId)
                    const numDoc = b.invoiceSeries ? `${b.invoiceSeries}-${b.invoiceNumber}` : (b.invoiceNumber || '-')
                    return (
                      <tr key={`${b.bizId}-${b.id}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{formatFechaHora(b.createdAt)}</td>
                        <td className="px-4 py-2.5 max-w-[220px]">
                          <p className="truncate font-medium text-gray-900 text-[13px]">{emp?.nombre || b.bizId}</p>
                          <p className="text-[11px] text-gray-400">{emp?.ruc}</p>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap font-medium text-gray-900">
                          {b.voidedDocId || b.summaryDocId || b.id}
                          <span className="block text-[11px] font-normal text-gray-400">
                            {b.origen === 'RC'
                              ? (b.action === 'void' ? 'Anulación (resumen diario)' : 'Resumen diario')
                              : 'Comunicación de baja'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-gray-900">{numDoc}</span>
                          {TIPOS[b.documentType] && <span className="block text-[11px] text-gray-400">{TIPOS[b.documentType].label}</span>}
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px]"><p className="truncate text-gray-700">{b.reason || '-'}</p></td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500">{b.ticket || '-'}</td>
                        <td className="px-4 py-2.5">
                          <BadgeEstado estado={estadoDeBaja(b)} />
                          {b.responseDescription && estadoDeBaja(b) !== 'accepted' && (
                            <p className="text-[11px] text-red-600 mt-0.5 max-w-[180px] truncate" title={b.responseDescription}>{b.responseDescription}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {(b.voidXmlStorageUrl || b.xmlSent) && (
                              <button
                                onClick={() => bajar(`${b.id}-xml`, b.voidXmlStorageUrl, `${b.voidedDocId || b.summaryDocId || b.id}.xml`, b.xmlSent)}
                                title="Descargar XML de la baja"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                              >
                                {descargando === `${b.id}-xml` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code className="w-4 h-4" />}
                              </button>
                            )}
                            {(b.voidCdrStorageUrl || b.cdrData) && (
                              <button
                                onClick={() => bajar(`${b.id}-cdr`, b.voidCdrStorageUrl, `CDR-${b.voidedDocId || b.summaryDocId || b.id}.xml`, b.cdrData)}
                                title="Descargar CDR de la baja"
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                              >
                                {descargando === `${b.id}-cdr` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!cargandoBajas && bajas !== null && (
            <Paginador
              paginaActual={paginaBajas}
              filasEnPagina={paginaBajasFilas.length}
              totalFiltradas={bajasFiltradas.length}
              completo={true}
              onAnterior={() => setPaginaBajas(p => Math.max(0, p - 1))}
              onSiguiente={() => setPaginaBajas(p => p + 1)}
              avanzando={false}
              avisoSinNuevas={false}
            />
          )}
        </div>
      )}

      {/* Detalle de comprobante */}
      {detalle && (() => {
        const emp = nombreEmpresa.get(detalle.bizId)
        const resp = detalle.sunatResponse || {}
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetalle(null)}>
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
                <div>
                  <h3 className="font-semibold text-gray-900">{detalle.number || detalle.id}</h3>
                  <p className="text-xs text-gray-500">{emp?.nombre} {emp?.ruc ? `· ${emp.ruc}` : ''}</p>
                </div>
                <button onClick={() => setDetalle(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Pestañas del detalle, como en QPse */}
              <div className="px-5 pt-3 flex gap-4 border-b border-gray-100">
                {[['info', 'Información'], ['seguimiento', 'Seguimiento']].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setDetalleTab(k)}
                    className={`pb-2 text-sm font-medium border-b-2 -mb-px ${detalleTab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {detalleTab === 'seguimiento' ? (() => {
                const { eventos, parcial } = historialDe(detalle)
                const puntoColor = (st) => st === 'accepted' ? 'bg-green-500'
                  : st === 'rejected' ? 'bg-red-500'
                  : st === 'voided' || st === 'voiding' ? 'bg-gray-400'
                  : st === 'created' ? 'bg-gray-300'
                  : 'bg-amber-400'
                return (
                  <div className="p-5 text-sm">
                    {parcial && (
                      <p className="text-[11px] text-gray-400 mb-3">
                        Historial parcial: los envíos anteriores al registro de intentos solo conservan su última respuesta.
                      </p>
                    )}
                    <div className="space-y-0">
                      {eventos.map((e, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${puntoColor(e.status)}`} />
                            {i < eventos.length - 1 && <span className="w-px flex-1 bg-gray-200" />}
                          </div>
                          <div className="pb-5 min-w-0">
                            <p className="text-xs text-gray-400">{e.at ? formatFechaHora(e.at) : '-'}</p>
                            <p className="font-medium text-gray-900">
                              {e.etiqueta || (ESTADOS[e.status]?.label ?? e.status)}
                              {e.method && <span className="ml-2 text-xs font-normal text-gray-400">vía {e.method}</span>}
                            </p>
                            <p className="text-xs text-gray-600 break-words">
                              {e.code != null && e.code !== '' && <span className="text-gray-400">Código {e.code} · </span>}
                              {e.description || 'Sin mensaje'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })() : (
              <div className="p-5 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <BadgeTipo inv={detalle} />
                  <BadgeEstado estado={estadoSunatDe(detalle)} />
                  {resp.method && <span className="text-xs text-gray-400">vía {resp.method}</span>}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-gray-500">{detalle.coleccion === 'invoices' ? 'Cliente' : 'Destinatario'}</dt>
                  <dd className="text-gray-900">{detalle.customer?.businessName || detalle.customer?.name || '-'}
                    {detalle.customer?.documentNumber && <span className="block text-xs text-gray-400">{detalle.customer.documentNumber}</span>}
                  </dd>
                  {detalle.coleccion === 'invoices' && (<>
                    <dt className="text-gray-500">Total</dt>
                    <dd className="font-semibold text-gray-900">{formatCurrency(detalle.total || 0, detalle.currency)}</dd>
                  </>)}
                  <dt className="text-gray-500">Fecha de emisión</dt>
                  <dd className="text-gray-900">{fechaDelComprobante(detalle)?.toLocaleDateString('es-PE') || '-'}</dd>
                  <dt className="text-gray-500">Creado</dt>
                  <dd className="text-gray-900">{formatFechaHora(detalle.createdAt)}</dd>
                  <dt className="text-gray-500">Enviado a SUNAT</dt>
                  <dd className="text-gray-900">{formatFechaHora(detalle.sunatSentAt)}</dd>
                  {detalle.retryCount > 0 && (<>
                    <dt className="text-gray-500">Reintentos</dt>
                    <dd className="text-gray-900">{detalle.retryCount}</dd>
                  </>)}
                </dl>

                {/* La respuesta de SUNAT tal cual quedó guardada: es lo que
                    antes había que ir a buscar a los logs de las functions. */}
                {(resp.code !== undefined || resp.description) && (
                  <div className={`rounded-lg p-3 text-xs ${estadoSunatDe(detalle) === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700'}`}>
                    <p className="font-medium mb-0.5">Respuesta de SUNAT {resp.code !== undefined && resp.code !== '' ? `(código ${resp.code})` : ''}</p>
                    <p>{resp.description || 'Sin mensaje'}</p>
                  </div>
                )}
                {detalle.lastRetryError?.description && (
                  <div className="rounded-lg p-3 text-xs bg-amber-50 text-amber-800">
                    <p className="font-medium mb-0.5">Último error de reintento ({detalle.lastRetryError.timestamp?.slice(0, 19).replace('T', ' ')})</p>
                    <p>{detalle.lastRetryError.description}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {tieneXmlGuardado(detalle) && (
                    <button
                      onClick={() => descargarXml(detalle)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50"
                    >
                      {descargando === `${detalle.id}-xml` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code className="w-4 h-4" />} XML firmado
                    </button>
                  )}
                  {tieneCdr(detalle) && (
                    <button
                      onClick={() => descargarCdr(detalle)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-green-200 text-green-700 rounded-lg hover:bg-green-50"
                    >
                      {descargando === `${detalle.id}-cdr` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} CDR
                    </button>
                  )}
                  {!tieneXmlGuardado(detalle) && !tieneCdr(detalle) && (
                    <p className="text-xs text-gray-400">Sin archivos guardados (el documento no llegó a aceptarse, o es anterior al guardado en Storage).</p>
                  )}
                </div>
              </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
