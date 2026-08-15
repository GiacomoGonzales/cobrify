import { useState, useEffect, useMemo } from 'react'
import { useParams, useLocation, useSearchParams, Link } from 'react-router-dom'
import { BookOpen, Search, ChevronRight, ChevronDown, X, Menu, Store } from 'lucide-react'
import { GUIDES, GUIDE_CATEGORIES, getGuideById } from '@/data/guides/registry'
import GuideRenderer from '@/components/guide/GuideRenderer'
import { matchesSearchQuery } from '@/lib/utils'

/**
 * MANUAL PÚBLICO — /ayuda y /ayuda/:guideId
 *
 * El mismo contenido que /app/manual, pero SIN sesión.
 *
 * POR QUÉ EXISTE (13-ago-2026): el manual vivía solo dentro de la app, así que
 * un enlace compartido por WhatsApp chocaba con la pantalla de login y el que lo
 * recibía no veía nada. Con esta ruta el enlace abre y se lee: en el celular, en
 * el navegador interno de WhatsApp, con la app instalada o sin ella.
 *
 * Se evaluó antes hacerlo con Android App Links (que el enlace abriera la app).
 * Se descartó: exige un AAB nuevo, verificación por dominio, y el navegador
 * interno de WhatsApp igual se salta el salto a la app.
 *
 * NO duplica contenido: usa el mismo registro y el mismo renderer. Las dos
 * diferencias las resuelve el prop `publico` del renderer (mostrar todas las
 * secciones etiquetadas por rubro, y los enlaces a /app como texto).
 *
 * RUBRO: sin sesion no hay negocio del cual deducir el rubro, asi que el lector
 * lo elige. Sin elegir se muestra TODO etiquetado; al elegir, el manual se
 * comporta como dentro de la app (se ocultan las guias y las secciones de otros
 * rubros). La eleccion viaja en la URL como ?rubro=, para poder mandar por
 * WhatsApp un enlace ya filtrado, y queda guardada para la proxima visita.
 *
 * ÍNDICE LATERAL: se cargan TODAS las guías al entrar, no solo la abierta. Es lo
 * que permite buscar por SUBTEMA —el título de una sección— y no solo por
 * página: con 26 guías, buscar "vuelto" o "merma" tiene que llevarte a la
 * sección exacta, no obligarte a adivinar en qué guía está. Son ~250 KB en
 * trozos chicos y es una pantalla de documentación, no el punto de venta; el
 * índice se dibuja al instante con los datos del registro y los subtemas
 * aparecen en cuanto llegan.
 */
const NOMBRE_MODO = {
  retail: 'General',
  restaurant: 'Restaurante',
  pharmacy: 'Farmacia',
  veterinary: 'Veterinaria',
  hotel: 'Hotelería',
  transport: 'Transporte',
  logistics: 'Logística',
  real_estate: 'Inmobiliaria',
  lending: 'Préstamos',
}

const MODOS = Object.keys(NOMBRE_MODO)
const RUBRO_GUARDADO = 'manualPublicoRubro'

/** Etiqueta "Solo en X" de una guía que no aplica a todos los rubros. */
const EtiquetaRubro = ({ modos, className = '' }) => {
  if (!modos?.length) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200 ${className}`}>
      Solo en {modos.map(m => NOMBRE_MODO[m] || m).join(' y ')}
    </span>
  )
}

export default function PublicManual() {
  const { guideId } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  // La URL manda sobre lo guardado: si alguien comparte un enlace con ?rubro=,
  // el que lo abre tiene que ver ESE rubro, no el que eligio la vez pasada.
  const rubroUrl = searchParams.get('rubro')
  const rubro = MODOS.includes(rubroUrl) ? rubroUrl : ''

  // Primera visita sin ?rubro= en la URL: recuperar la eleccion anterior.
  useEffect(() => {
    if (rubroUrl !== null) return
    let guardado = null
    try { guardado = localStorage.getItem(RUBRO_GUARDADO) } catch { /* modo privado */ }
    if (MODOS.includes(guardado)) {
      setSearchParams(p => { p.set('rubro', guardado); return p }, { replace: true })
    }
  }, [])

  const cambiarRubro = (valor) => {
    try {
      if (valor) localStorage.setItem(RUBRO_GUARDADO, valor)
      else localStorage.removeItem(RUBRO_GUARDADO)
    } catch { /* modo privado */ }
    setSearchParams(p => {
      if (valor) p.set('rubro', valor)
      else p.delete('rubro')
      return p
    }, { replace: true })
  }

  /** Enlace interno que arrastra el rubro elegido (el query va antes del hash). */
  const conRubro = (ruta) => {
    if (!rubro) return ruta
    const i = ruta.indexOf('#')
    return i === -1
      ? `${ruta}?rubro=${rubro}`
      : `${ruta.slice(0, i)}?rubro=${rubro}${ruta.slice(i)}`
  }

  const [query, setQuery] = useState('')
  const [contenidos, setContenidos] = useState({}) // { [guideId]: contenido }
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [categoriasCerradas, setCategoriasCerradas] = useState({})

  const guideMeta = guideId ? getGuideById(guideId) : null
  const content = guideId ? contenidos[guideId] : null

  // Cargar TODAS las guías (para el índice, los subtemas y la búsqueda).
  useEffect(() => {
    let alive = true
    Promise.all(
      GUIDES.map(g =>
        g.load()
          .then(mod => [g.id, mod.default])
          .catch(() => [g.id, null])
      )
    ).then(pares => {
      if (!alive) return
      const mapa = {}
      for (const [id, c] of pares) if (c) mapa[id] = c
      setContenidos(mapa)
    })
    return () => { alive = false }
  }, [])

  // Saltar al ancla del hash (#sec-...) una vez pintado el contenido. Es lo que
  // permite compartir una SECCIÓN concreta y no la guía entera.
  useEffect(() => {
    if (!content || !location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [content, location.hash])

  // Al navegar, cerrar el índice en móvil y volver arriba.
  useEffect(() => {
    setMenuAbierto(false)
    if (!location.hash) window.scrollTo({ top: 0 })
  }, [guideId, location.hash])

  /**
   * Índice filtrado: categorías → guías → subtemas.
   *
   * Una guía entra si coincide ELLA (título, descripción, palabras clave,
   * categoría) o si coincide alguno de sus SUBTEMAS. Cuando el que coincide es
   * el subtema, se listan solo los que coinciden: buscar "vuelto" no debe
   * desplegar las veinte secciones del POS.
   */
  const indice = useMemo(() => {
    const hayBusqueda = query.trim().length > 0
    const grupos = new Map()

    for (const g of GUIDES) {
      // Con rubro elegido, el indice se comporta como dentro de la app.
      if (rubro && g.modos?.length > 0 && !g.modos.includes(rubro)) continue

      const secciones = contenidos[g.id]?.sections || []
      const coincideGuia = matchesSearchQuery(query, g.title, g.description, g.keywords, g.category)
      const seccionesQueCoinciden = hayBusqueda
        ? secciones.filter(s => matchesSearchQuery(query, s.title))
        : []

      if (hayBusqueda && !coincideGuia && seccionesQueCoinciden.length === 0) continue

      if (!grupos.has(g.category)) grupos.set(g.category, [])
      grupos.get(g.category).push({
        ...g,
        // Sin búsqueda, los subtemas se ven solo en la guía abierta (si no, el
        // índice sería una pared de 200 líneas).
        subtemas: hayBusqueda
          ? (seccionesQueCoinciden.length > 0 ? seccionesQueCoinciden : secciones)
          : (g.id === guideId ? secciones : []),
      })
    }

    return [...grupos.entries()].sort((a, b) => {
      const ia = GUIDE_CATEGORIES.indexOf(a[0])
      const ib = GUIDE_CATEGORIES.indexOf(b[0])
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  }, [query, contenidos, guideId, rubro])

  const totalResultados = indice.reduce((n, [, gs]) => n + gs.length, 0)

  const guiaAplica = !rubro || !guideMeta?.modos?.length || guideMeta.modos.includes(rubro)

  const Indice = () => (
    <nav className="space-y-5">
      {indice.map(([categoria, guias]) => {
        const cerrada = categoriasCerradas[categoria]
        return (
          <div key={categoria}>
            <button
              type="button"
              onClick={() => setCategoriasCerradas(p => ({ ...p, [categoria]: !p[categoria] }))}
              className="flex items-center gap-1 w-full text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 mb-1.5"
            >
              {cerrada ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {categoria}
            </button>

            {!cerrada && (
              <ul className="space-y-0.5">
                {guias.map(g => {
                  const activa = g.id === guideId
                  return (
                    <li key={g.id}>
                      <Link
                        to={conRubro(`/ayuda/${g.id}`)}
                        className={`block px-2 py-1.5 rounded-md text-sm transition-colors ${
                          activa
                            ? 'bg-primary-50 text-primary-800 font-semibold'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {g.title}
                        {!rubro && g.modos?.length > 0 && (
                          <EtiquetaRubro modos={g.modos} className="ml-1.5 align-middle" />
                        )}
                      </Link>

                      {g.subtemas.length > 0 && (
                        <ul className="mt-0.5 mb-1 ml-2 pl-2 border-l border-gray-200 space-y-0.5">
                          {g.subtemas.map(s => (
                            <li key={s.id}>
                              <Link
                                to={conRubro(`/ayuda/${g.id}#sec-${s.id}`)}
                                className="block px-2 py-1 rounded text-xs text-gray-600 hover:text-primary-700 hover:bg-gray-50 transition-colors"
                              >
                                {s.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      {totalResultados === 0 && (
        <p className="text-sm text-gray-500">No encontramos nada para esa búsqueda.</p>
      )}
    </nav>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <Link to={conRubro('/ayuda')} className="flex items-center gap-2 min-w-0">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 flex-shrink-0">
              <BookOpen className="w-5 h-5 text-primary-600" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-gray-900 truncate">Manual de uso</span>
              <span className="block text-xs text-gray-500 truncate">Cobrify</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <label className="hidden sm:flex items-center gap-1.5 text-sm">
              <Store className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="sr-only">Tipo de negocio</span>
              <select
                value={rubro}
                onChange={(e) => cambiarRubro(e.target.value)}
                className="py-1.5 pl-2 pr-7 text-sm text-gray-700 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Todos los rubros</option>
                {MODOS.map(m => (
                  <option key={m} value={m}>{NOMBRE_MODO[m]}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setMenuAbierto(v => !v)}
              className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg"
            >
              {menuAbierto ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              Índice
            </button>
            <Link to="/login" className="text-sm font-medium text-primary-700 hover:underline flex-shrink-0">
              Ingresar
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-5 py-6 lg:flex lg:gap-10">
        {/* Índice lateral */}
        <aside
          className={`lg:w-80 lg:flex-shrink-0 ${menuAbierto ? 'block' : 'hidden lg:block'}`}
        >
          <div className="lg:sticky lg:top-20 bg-white lg:bg-transparent border lg:border-0 border-gray-200 rounded-xl p-4 lg:p-0 mb-6 lg:mb-0">
            <label className="sm:hidden block mb-3">
              <span className="block text-xs font-medium text-gray-500 mb-1">Tipo de negocio</span>
              <select
                value={rubro}
                onChange={(e) => cambiarRubro(e.target.value)}
                className="w-full py-2 px-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Todos los rubros</option>
                {MODOS.map(m => (
                  <option key={m} value={m}>{NOMBRE_MODO[m]}</option>
                ))}
              </select>
            </label>

            <div className="relative mb-4">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tema o subtema…"
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-2">
              <Indice />
            </div>
          </div>
        </aside>

        {/* Contenido */}
        <main className="min-w-0 flex-1">
          {guideMeta ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{guideMeta.title}</h1>
                <EtiquetaRubro modos={guideMeta.modos} />
              </div>
              <p className="text-sm text-gray-600 mb-4">{guideMeta.description}</p>

              {!guiaAplica && (
                <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                  <span>
                    Esta guía es de <strong>{guideMeta.modos.map(m => NOMBRE_MODO[m] || m).join(' y ')}</strong>,
                    y estás viendo el manual de <strong>{NOMBRE_MODO[rubro]}</strong>.
                  </span>
                  <button
                    type="button"
                    onClick={() => cambiarRubro('')}
                    className="font-semibold underline hover:no-underline"
                  >
                    Ver todos los rubros
                  </button>
                </div>
              )}

              {!content && <p className="text-sm text-gray-500">Cargando…</p>}

              {content && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
                  <GuideRenderer content={content} anchorPrefix="sec" businessMode={guiaAplica ? rubro : ''} publico />

                  {content.preguntas?.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <h3 className="text-base font-bold text-gray-900 mb-4">Preguntas frecuentes</h3>
                      <div className="space-y-4">
                        {content.preguntas.map((p, i) => (
                          <div key={i}>
                            <p className="text-sm font-semibold text-gray-900">{p.q}</p>
                            <p className="text-sm text-gray-700 leading-relaxed mt-1">
                              {p.a.replace(/\*\*/g, '')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Manual de uso</h1>
              <p className="text-sm text-gray-600 mb-6">
                Cómo funciona cada pantalla del sistema, explicada paso a paso. Elige un tema
                del índice o busca lo que necesites.
              </p>

              <p className="text-sm text-gray-600 -mt-4 mb-6">
                {rubro ? (
                  <>
                    Estás viendo el manual de <strong className="text-gray-900">{NOMBRE_MODO[rubro]}</strong>.{' '}
                    <button type="button" onClick={() => cambiarRubro('')} className="text-primary-700 font-medium hover:underline">
                      Ver todos los rubros
                    </button>
                  </>
                ) : (
                  <>Elige tu <strong className="text-gray-900">tipo de negocio</strong> arriba y el manual deja fuera lo que no te toca.</>
                )}
              </p>

              <div className="space-y-6">
                {indice.map(([categoria, guias]) => (
                  <div key={categoria}>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                      {categoria}
                    </h2>
                    <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                      {guias.map(g => (
                        <Link
                          key={g.id}
                          to={conRubro(`/ayuda/${g.id}`)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {g.title}
                              {!rubro && g.modos?.length > 0 && (
                                <EtiquetaRubro modos={g.modos} className="ml-1.5 align-middle" />
                              )}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{g.description}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      <footer className="max-w-[1600px] mx-auto px-5 py-8 text-center">
        <p className="text-xs text-gray-500">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-primary-700 font-medium hover:underline">
            Ingresa a tu sistema
          </Link>
        </p>
      </footer>
    </div>
  )
}
