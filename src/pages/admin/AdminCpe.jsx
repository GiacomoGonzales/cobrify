import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, collectionGroup, documentId, query, where, orderBy, limit, startAfter, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency, matchesPrebuilt, buildSearchHaystack } from '@/lib/utils'
import { urlXmlDe, urlCdrDe, cdrEnLineaDe, tieneCdr, tieneXmlGuardado, estadoSunatDe, fechaDelComprobante } from '@/utils/sunatDocs'
import { downloadFromUrl, downloadBlob } from '@/utils/nativeDownload'
import {
  FileCheck2, Search, RefreshCw, Download, Code, Eye, X, Loader2,
  CheckCircle, XCircle, Clock, Ban, ChevronLeft, ChevronRight
} from 'lucide-react'
import { Pagina, Filtros, FiltroSelect, Buscador, Boton, Entrada, Seccion, Tabla, Th, Td, Fila, FilaVacia, Estado, Aviso } from '@/components/admin/ui'

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
  factura: { label: 'Factura', color: 'bg-gray-100 text-gray-700' },
  boleta: { label: 'Boleta', color: 'bg-gray-100 text-gray-700' },
  nota_credito: { label: 'Nota de Crédito', color: 'bg-gray-100 text-gray-700' },
  nota_debito: { label: 'Nota de Débito', color: 'bg-gray-100 text-gray-700' },
  guia_remision: { label: 'GRE Remitente', color: 'bg-gray-100 text-gray-700' },
  guia_transportista: { label: 'GRE Transportista', color: 'bg-gray-100 text-gray-700' },
}

const ESTADOS = {
  accepted: { label: 'Aceptado', color: 'bg-gray-100 text-gray-700', Icon: CheckCircle },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700', Icon: XCircle },
  pending: { label: 'Pendiente', color: 'bg-gray-100 text-gray-700', Icon: Clock },
  voided: { label: 'Anulado', color: 'bg-gray-100 text-gray-600', Icon: Ban },
}

// Corre `fn` sobre `items` de a `tam` en paralelo (para no disparar cientos
// de consultas de golpe).
async function enTandas(items, tam, fn) {
  for (let i = 0; i < items.length; i += tam) {
    await Promise.all(items.slice(i, i + tam).map(fn))
  }
}

// Alertas 1033. SUNAT responde 1033 ("registrado previamente con otros datos")
// en dos situaciones que NO se distinguen por el mensaje:
//   a) reintento de un documento nuestro que ya habia llegado (inofensivo);
//   b) el negocio repite una serie-correlativo que ya uso antes, por ejemplo
//      en otro sistema: SUNAT tiene otro documento con ese numero y el nuestro
//      no existe alla, aunque en Cobrify figure aceptado.
// Lo que delata (b) es el PATRON: muchos 1033 en el mismo negocio, con
// correlativos seguidos. Por eso las alertas se agrupan por negocio.
const ES_1033 = e => String(e?.code ?? '') === '1033' || /registrado previamente|informado anteriormente/i.test(e?.description || '')

const clasificarAlerta = h => {
  if (h.gemelos?.length || h.borrados?.length) return { clave: 'repetido', texto: 'Número repetido en Cobrify' }
  const log = Array.isArray(h.sunatLog) ? h.sunatLog : []
  const idx = log.findIndex(ES_1033)
  const previos = idx > 0 ? log.slice(0, idx).filter(e => e.status && e.status !== 'created') : []
  const huboEnvioPrevio = previos.length > 0 || (h.retryCount || 0) > 0 || !!h.lastRetryError
  if (huboEnvioPrevio) return { clave: 'reintento', texto: 'Reintento: hubo un envío anterior' }
  return { clave: 'primero', texto: 'Primer envío ya dio 1033' }
}

const correlativoDe = d => Number(d.correlativeNumber) || Number(String(d.number || '').split('-')[1]) || 0
const serieDe = d => d.series || String(d.number || '').split('-')[0] || '?'

const PESO_VEREDICTO = { repetido: 3, patron: 2, aislado: 1 }

const agruparAlertas = (hits, negocios) => {
  const porNegocio = new Map()
  for (const h of hits) {
    if (!porNegocio.has(h.bizId)) porNegocio.set(h.bizId, [])
    porNegocio.get(h.bizId).push(h)
  }
  return [...porNegocio.entries()].map(([bizId, docs]) => {
    // Corrida mas larga de correlativos seguidos con 1033, por serie
    const porSerie = new Map()
    for (const d of docs) {
      const serie = serieDe(d)
      if (!porSerie.has(serie)) porSerie.set(serie, [])
      porSerie.get(serie).push(correlativoDe(d))
    }
    let corridaMax = 1
    for (const nums of porSerie.values()) {
      const u = [...new Set(nums)].sort((a, b) => a - b)
      let run = 1
      for (let i = 1; i < u.length; i++) {
        run = u[i] === u[i - 1] + 1 ? run + 1 : 1
        corridaMax = Math.max(corridaMax, run)
      }
    }
    const repetidos = docs.filter(d => clasificarAlerta(d).clave === 'repetido').length
    const primeros = docs.filter(d => clasificarAlerta(d).clave === 'primero').length
    let veredicto
    if (repetidos > 0) veredicto = { clave: 'repetido', texto: `${repetidos} con el número repetido en Cobrify` }
    else if (docs.length >= 3 || corridaMax >= 2) veredicto = { clave: 'patron', texto: `Patrón: ${docs.length} en el mes${corridaMax >= 2 ? `, ${corridaMax} correlativos seguidos` : ''}` }
    else veredicto = { clave: 'aislado', texto: 'Caso aislado, probable reintento' }
    return {
      bizId,
      negocio: negocios.get(bizId) || { id: bizId, nombre: bizId, ruc: '', metodo: '' },
      docs: docs.sort((a, b) => tiempoDe(b) - tiempoDe(a)),
      series: [...porSerie.keys()],
      corridaMax,
      repetidos,
      primeros,
      veredicto,
    }
  }).sort((a, b) => (PESO_VEREDICTO[b.veredicto.clave] - PESO_VEREDICTO[a.veredicto.clave]) || (b.docs.length - a.docs.length))
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
  // Metodo de emision de las empresas que se listan. Con SUNAT directo son
  // pocas y se pueden mirar todas juntas; con QPse son cientos, asi que se
  // elige una empresa por vez.
  const [metodo, setMetodo] = useState('sunat_direct')
  // Alertas 1033 (todas las empresas, cualquier metodo)
  const [alertas, setAlertas] = useState(null)
  const [cargandoAlertas, setCargandoAlertas] = useState(false)
  const [errorAlertas, setErrorAlertas] = useState(null)
  const [grupoAbierto, setGrupoAbierto] = useState(null)

  // ------------------------------------------------------------ los negocios
  useEffect(() => {
    const cargar = async () => {
      setCargandoEmpresas(true)
      setEmpresaSel('all')
      try {
        const snap = await getDocs(query(
          collection(db, 'businesses'),
          where('emissionConfig.method', '==', metodo)
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
        console.error(`Error cargando negocios ${metodo}:`, e)
      } finally {
        setCargandoEmpresas(false)
      }
    }
    cargar()
  }, [metodo])

  // Con QPse no se cargan "todas": hay que elegir una empresa.
  const faltaElegirEmpresa = metodo === 'qpse' && empresaSel === 'all'

  const empresaDe = (bizId) => nombreEmpresa.get(bizId) || alertas?.negocios?.get(bizId)

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
    if (faltaElegirEmpresa) {
      datosRef.current = { fuentes: [], filas: [] }
      setVista({ filas: [], fuentes: [] })
      return
    }
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

  // ---------------------------------------------------------- alertas 1033
  // Una sola consulta de grupo sobre TODAS las subcolecciones `invoices`
  // (necesita la regla con comodin y el indice de grupo). Los casos son pocos,
  // asi que despues se busca por cada uno si el numero esta repetido en
  // Cobrify (otro comprobante vivo o uno eliminado con el mismo numero).
  const cargarAlertas = async () => {
    setCargandoAlertas(true)
    setErrorAlertas(null)
    try {
      const [desde, hasta] = rangoDelMes()
      const snap = await getDocs(query(
        collectionGroup(db, 'invoices'),
        // El codigo se guardo como texto casi siempre; por si acaso, tambien numero
        where('sunatResponse.code', 'in', ['1033', 1033]),
        where('createdAt', '>=', desde),
        where('createdAt', '<', hasta),
        orderBy('createdAt', 'desc'),
        limit(2000),
      ))
      const hits = snap.docs.map(d => ({ id: d.id, bizId: d.ref.parent.parent.id, coleccion: 'invoices', ...d.data() }))

      const negocios = new Map()
      const ids = [...new Set(hits.map(h => h.bizId))]
      for (let i = 0; i < ids.length; i += 30) {
        const s = await getDocs(query(collection(db, 'businesses'), where(documentId(), 'in', ids.slice(i, i + 30))))
        s.forEach(d => {
          const b = d.data()
          negocios.set(d.id, {
            id: d.id,
            nombre: b.razonSocial || b.businessName || d.id,
            ruc: b.ruc || '',
            metodo: b.emissionConfig?.method || b.emissionMethod || '',
          })
        })
      }

      await enTandas(hits, 10, async h => {
        if (!h.number) return
        const [otros, borrados] = await Promise.all([
          getDocs(query(collection(db, 'businesses', h.bizId, 'invoices'), where('number', '==', h.number), limit(5))).catch(() => null),
          getDocs(query(collection(db, 'businesses', h.bizId, 'deletedInvoices'), where('number', '==', h.number), limit(5))).catch(() => null),
        ])
        h.gemelos = (otros?.docs || []).filter(d => d.id !== h.id).map(d => ({ id: d.id, ...d.data() }))
        h.borrados = (borrados?.docs || []).map(d => ({ id: d.id, ...d.data() }))
      })

      setAlertas({ hits, negocios, grupos: agruparAlertas(hits, negocios), truncado: snap.size >= 2000 })
      setGrupoAbierto(null)
    } catch (e) {
      console.error('Error cargando alertas 1033:', e)
      setErrorAlertas(e.message || 'No se pudieron cargar las alertas')
    } finally {
      setCargandoAlertas(false)
    }
  }

  useEffect(() => {
    if (seccion === 'alertas') cargarAlertas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion, mes])

  const gruposFiltrados = useMemo(() => {
    if (!alertas) return []
    if (!busqueda) return alertas.grupos
    return alertas.grupos.filter(g =>
      matchesPrebuilt(busqueda, buildSearchHaystack(g.negocio.nombre, g.negocio.ruc, ...g.docs.map(d => d.number)))
    )
  }, [alertas, busqueda])

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
            <span className="block text-gray-700 mt-0.5">
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
      <Pagina
        resumen={seccion === 'alertas'
          ? (alertas
            ? `${alertas.hits.length} comprobantes con código 1033 en ${alertas.grupos.length} negocios · ${alertas.grupos.filter(g => g.veredicto.clave !== 'aislado').length} con patrón sospechoso${alertas.truncado ? ' · lista recortada a 2000' : ''}`
            : cargandoAlertas ? 'Buscando comprobantes con código 1033 en todos los negocios…' : '')
          : `${empresas.length} negocios ${metodo === 'qpse' ? 'emiten por QPse' : 'emiten directo contra SUNAT'}${faltaElegirEmpresa ? ' · elige una empresa para ver sus comprobantes' : ''}${seccion === 'cpe' && !faltaElegirEmpresa
            ? ` · ${stats.total} comprobantes cargados · ${stats.accepted} aceptados · ${stats.rejected} rechazados · ${stats.pending} pendientes · ${stats.voided} anulados${!agotadoRelevante && !cargando ? ' (avanza de página para traer más)' : ''}`
            : ''}`}
        acciones={
          <Boton
            tamano="sm"
            onClick={() => (seccion === 'alertas' ? cargarAlertas() : seccion === 'cpe' ? cargaInicial() : cargarBajas())}
            disabled={cargando || cargandoBajas || cargandoAlertas}
          >
            {cargando || cargandoBajas || cargandoAlertas ? 'Cargando…' : 'Recargar'}
          </Boton>
        }
      />
      <Filtros>
        {/* En el celular ocupan la fila entera y se reparten el ancho, con el
            nombre corto: los tres nombres largos no entran en 375 px y el texto
            se salia del recuadro. */}
        <div className="flex w-full sm:inline-flex sm:w-auto rounded-md border border-gray-300 bg-white p-0.5">
          {[
            ['cpe', 'Comprobantes y guías', 'Comprobantes'],
            ['bajas', 'Resúmenes diarios', 'Resúmenes'],
            ['alertas', 'Alertas 1033', 'Alertas'],
          ].map(([k, largo, corto]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSeccion(k)}
              className={`h-7 flex-1 sm:flex-none min-w-0 px-2 sm:px-3 rounded text-[12px] sm:text-[12.5px] whitespace-nowrap ${seccion === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <span className="sm:hidden">{corto}</span>
              <span className="hidden sm:inline">{largo}</span>
            </button>
          ))}
        </div>
        <Buscador
          ancho="w-full sm:w-80"
          placeholder={seccion === 'cpe' ? 'Número, cliente, empresa o RUC' : seccion === 'alertas' ? 'Empresa, RUC o número' : 'Identificador, documento, ticket, empresa'}
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        {seccion !== 'alertas' && (
          <>
            <FiltroSelect value={metodo} onChange={e => setMetodo(e.target.value)} valorTodos="sunat_direct">
              <option value="sunat_direct">SUNAT directo</option>
              <option value="qpse">QPse</option>
            </FiltroSelect>
            <FiltroSelect value={empresaSel} onChange={e => setEmpresaSel(e.target.value)} className="max-w-xs">
              <option value="all">{metodo === 'qpse' ? `Elige una empresa (${empresas.length})` : `Todas las empresas (${empresas.length})`}</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre} {e.ruc ? `(${e.ruc})` : ''}</option>)}
            </FiltroSelect>
          </>
        )}
        <Entrada type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className="w-40" />
        {seccion === 'cpe' && (
          <>
            <FiltroSelect value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
              <option value="all">Tipo</option>
              {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </FiltroSelect>
            <FiltroSelect value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
              <option value="all">Estado</option>
              {Object.entries(ESTADOS).map(([k, est]) => <option key={k} value={k}>{est.label}</option>)}
            </FiltroSelect>
          </>
        )}
      </Filtros>

      {/* ------------------------------------------------ tabla comprobantes */}
      {seccion === 'cpe' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                                className="p-1.5 text-gray-700 hover:bg-gray-50 rounded"
                              >
                                {descargando === `${inv.id}-xml` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code className="w-4 h-4" />}
                              </button>
                            )}
                            {tieneCdr(inv) && (
                              <button
                                onClick={() => descargarCdr(inv)}
                                title="Descargar CDR"
                                className="p-1.5 text-gray-700 hover:bg-gray-50 rounded"
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
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                                className="p-1.5 text-gray-700 hover:bg-gray-50 rounded"
                              >
                                {descargando === `${b.id}-xml` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code className="w-4 h-4" />}
                              </button>
                            )}
                            {(b.voidCdrStorageUrl || b.cdrData) && (
                              <button
                                onClick={() => bajar(`${b.id}-cdr`, b.voidCdrStorageUrl, `CDR-${b.voidedDocId || b.summaryDocId || b.id}.xml`, b.cdrData)}
                                title="Descargar CDR de la baja"
                                className="p-1.5 text-gray-700 hover:bg-gray-50 rounded"
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

      {/* ------------------------------------------------------ alertas 1033 */}
      {seccion === 'alertas' && (
        <div className="space-y-4">
          <Aviso>
            SUNAT responde 1033 tanto cuando reintentamos un comprobante que ya había llegado (inofensivo) como cuando el negocio
            repite una serie y correlativo que ya usó antes, por ejemplo en otro sistema (SUNAT tiene otro documento con ese número).
            El mensaje es el mismo; lo que delata el segundo caso es el patrón: varios en el mismo negocio, con correlativos seguidos.
          </Aviso>
          {errorAlertas && (
            <Aviso tono="rojo" titulo="No se pudieron cargar las alertas">
              {errorAlertas}. Si es la primera vez, faltan desplegar la regla y el índice de grupo de `invoices`.
            </Aviso>
          )}
          <Seccion sinRelleno className="overflow-hidden">
            <Tabla>
              <thead>
                <tr>
                  <Th>Negocio</Th>
                  <Th>Método</Th>
                  <Th alinear="der">Con 1033</Th>
                  <Th>Series</Th>
                  <Th alinear="der">Seguidos</Th>
                  <Th alinear="der">Sin envío previo</Th>
                  <Th>Veredicto</Th>
                  <Th ancho={90}></Th>
                </tr>
              </thead>
              <tbody>
                {cargandoAlertas ? (
                  <FilaVacia colSpan={8}>Buscando en todos los negocios…</FilaVacia>
                ) : !alertas ? (
                  <FilaVacia colSpan={8}>Sin datos</FilaVacia>
                ) : gruposFiltrados.length === 0 ? (
                  <FilaVacia colSpan={8}>Ningún comprobante con código 1033 en este mes</FilaVacia>
                ) : (
                  gruposFiltrados.map(g => (
                    <Fila key={g.bizId} onClick={() => setGrupoAbierto(grupoAbierto === g.bizId ? null : g.bizId)} seleccionada={grupoAbierto === g.bizId}>
                      <Td className="max-w-[280px]">
                        <div className="truncate font-medium">{g.negocio.nombre}</div>
                        <div className="text-[11.5px] text-gray-500">{g.negocio.ruc || g.bizId}</div>
                      </Td>
                      <Td apagado>{g.negocio.metodo === 'qpse' ? 'QPse' : g.negocio.metodo === 'sunat_direct' ? 'SUNAT directo' : g.negocio.metodo || '—'}</Td>
                      <Td numero className="font-medium">{g.docs.length}</Td>
                      <Td apagado>{g.series.join(', ')}</Td>
                      <Td numero className={g.corridaMax >= 2 ? 'text-red-600 font-medium' : ''}>{g.corridaMax >= 2 ? g.corridaMax : '—'}</Td>
                      <Td numero apagado>{g.primeros}</Td>
                      <Td>
                        <Estado valor={g.veredicto.clave === 'aislado' ? 'ok' : 'rejected'} etiqueta={g.veredicto.texto} />
                      </Td>
                      <Td alinear="der" onClick={e => e.stopPropagation()}>
                        <Boton tamano="sm" onClick={() => setGrupoAbierto(grupoAbierto === g.bizId ? null : g.bizId)}>
                          {grupoAbierto === g.bizId ? 'Cerrar' : 'Ver'}
                        </Boton>
                      </Td>
                    </Fila>
                  ))
                )}
              </tbody>
            </Tabla>
          </Seccion>

          {alertas && grupoAbierto && (() => {
            const g = alertas.grupos.find(x => x.bizId === grupoAbierto)
            if (!g) return null
            return (
              <Seccion
                titulo={`${g.negocio.nombre} · ${g.docs.length} comprobantes con 1033`}
                descripcion={g.veredicto.texto}
                sinRelleno
                acciones={<a href={`/app/admin/users/${g.bizId}`} className="text-[12.5px] text-primary-700 hover:underline">Ver ficha de la cuenta</a>}
              >
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Creado</Th>
                      <Th>Número</Th>
                      <Th>Tipo</Th>
                      <Th>En Cobrify</Th>
                      <Th>Lectura</Th>
                      <Th alinear="der">Reintentos</Th>
                      <Th>CDR</Th>
                      <Th>Mismo número en Cobrify</Th>
                      <Th>Mensaje de SUNAT</Th>
                      <Th ancho={70}></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.docs.map(d => {
                      const lectura = clasificarAlerta(d)
                      const gemelos = [...(d.gemelos || []).map(x => `${x.number} (vivo, S/ ${Number(x.total || 0).toFixed(2)})`), ...(d.borrados || []).map(x => `${x.number} (eliminado)`)]
                      return (
                        <Fila key={d.id}>
                          <Td apagado>{formatFechaHora(d.createdAt)}</Td>
                          <Td className="font-medium">{d.number || d.id}</Td>
                          <Td apagado>{TIPOS[d.documentType]?.label || d.documentType || '—'}</Td>
                          <Td><Estado valor={estadoSunatDe(d)} etiqueta={ESTADOS[estadoSunatDe(d)]?.label || d.sunatStatus} /></Td>
                          <Td><Estado valor={lectura.clave === 'reintento' ? 'ok' : 'rejected'} etiqueta={lectura.texto} /></Td>
                          <Td numero apagado>{d.retryCount || 0}</Td>
                          <Td apagado>{tieneCdr(d) ? 'Sí' : 'No'}</Td>
                          <Td className={gemelos.length ? 'text-red-600' : 'text-gray-400'}>{gemelos.length ? gemelos.join(' · ') : '—'}</Td>
                          <Td apagado className="max-w-[320px] truncate" title={d.sunatResponse?.description || ''}>{d.sunatResponse?.description || '—'}</Td>
                          <Td alinear="der">
                            <Boton tamano="sm" onClick={() => { setDetalle(d); setDetalleTab('seguimiento') }}>Detalle</Boton>
                          </Td>
                        </Fila>
                      )
                    })}
                  </tbody>
                </Tabla>
              </Seccion>
            )
          })()}
        </div>
      )}

      {/* Detalle de comprobante */}
      {detalle && (() => {
        const emp = empresaDe(detalle.bizId)
        const resp = detalle.sunatResponse || {}
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetalle(null)}>
            <div
              className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[85vh] overflow-y-auto"
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
                const puntoColor = (st) => st === 'accepted' ? 'bg-primary-600'
                  : st === 'rejected' ? 'bg-red-500'
                  : st === 'voided' || st === 'voiding' ? 'bg-gray-400'
                  : st === 'created' ? 'bg-gray-300'
                  : 'bg-primary-600'
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
                  <div className="rounded-lg p-3 text-xs bg-gray-50 text-gray-900">
                    <p className="font-medium mb-0.5">Último error de reintento ({detalle.lastRetryError.timestamp?.slice(0, 19).replace('T', ' ')})</p>
                    <p>{detalle.lastRetryError.description}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {tieneXmlGuardado(detalle) && (
                    <button
                      onClick={() => descargarXml(detalle)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      {descargando === `${detalle.id}-xml` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code className="w-4 h-4" />} XML firmado
                    </button>
                  )}
                  {tieneCdr(detalle) && (
                    <button
                      onClick={() => descargarCdr(detalle)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
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
