import { useState, useEffect, useMemo } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { BookOpen, Search, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { matchesSearchQuery } from '@/lib/utils'
import { GUIDES, GUIDE_CATEGORIES, getGuideById, getGuidesForMode, getVisibleSections } from '@/data/guides/registry'
import GuideRenderer from '@/components/guide/GuideRenderer'
import Card, { CardContent } from '@/components/ui/Card'

/**
 * MANUAL DE USO — /app/manual y /app/manual/:guideId
 *
 * Sin :guideId, muestra el índice: todas las guías del modo de negocio activo,
 * agrupadas por categoría y con búsqueda.
 *
 * Con :guideId, muestra esa guía completa con su índice de secciones. Cada
 * sección tiene ancla propia (/app/manual/pos#sec-cobrar-venta), pensada para
 * responder por WhatsApp con un enlace directo en vez de dictar pasos.
 */
export default function Manual() {
  const { guideId } = useParams()
  const location = useLocation()
  const { businessMode, businessSettings } = useAppContext()

  const [query, setQuery] = useState('')
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)

  const guideMeta = guideId ? getGuideById(guideId) : null

  // Cargar el contenido de la guía elegida
  useEffect(() => {
    if (!guideMeta) {
      setContent(null)
      return
    }
    let alive = true
    setLoading(true)
    guideMeta
      .load()
      .then(mod => {
        if (alive) setContent(mod.default)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideId])

  // Con el contenido ya pintado, saltar al ancla del hash (#sec-...)
  useEffect(() => {
    if (!content || !location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [content, location.hash])

  // Índice: guías del modo activo, filtradas por búsqueda y agrupadas por categoría
  const groupedGuides = useMemo(() => {
    const visible = getGuidesForMode(businessMode).filter(g =>
      matchesSearchQuery(query, g.title, g.description, g.keywords, g.category)
    )
    const groups = new Map()
    for (const g of visible) {
      if (!groups.has(g.category)) groups.set(g.category, [])
      groups.get(g.category).push(g)
    }
    // Orden fijo de categorías; las no listadas van al final
    return [...groups.entries()].sort((a, b) => {
      const ia = GUIDE_CATEGORIES.indexOf(a[0])
      const ib = GUIDE_CATEGORIES.indexOf(b[0])
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  }, [businessMode, query])

  const sections = content ? getVisibleSections(content, businessMode) : []

  // ===== Vista de una guía =====
  if (guideId) {
    return (
      <div className="w-full">
        <Link
          to="/app/manual"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Manual de uso
        </Link>

        {!guideMeta ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">Esta guía no existe</p>
              <p className="text-sm text-gray-500">
                Vuelve al índice del manual para ver las guías disponibles.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Índice de secciones (columna fija en escritorio) */}
            <aside className="w-full lg:w-60 flex-shrink-0 lg:sticky lg:top-2 order-first">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {guideMeta.title}
                  </p>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <ul className="space-y-1.5">
                      {sections.map(s => (
                        <li key={s.id}>
                          <a
                            href={`#sec-${s.id}`}
                            className="text-sm text-gray-700 hover:text-primary-700 hover:underline"
                          >
                            {s.title}
                          </a>
                        </li>
                      ))}
                      {content?.preguntas?.length > 0 && (
                        <li>
                          <a
                            href="#sec-preguntas"
                            className="text-sm text-gray-700 hover:text-primary-700 hover:underline"
                          >
                            Preguntas frecuentes
                          </a>
                        </li>
                      )}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </aside>

            {/* Contenido */}
            <div className="flex-1 min-w-0">
              <Card>
                <CardContent className="p-5 sm:p-8">
                  <h1 className="text-xl font-bold text-gray-900 mb-1">{guideMeta.title}</h1>
                  <p className="text-sm text-gray-500 mb-6">{guideMeta.description}</p>
                  {loading || !content ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <GuideRenderer
                      content={content}
                      businessMode={businessMode}
                      businessSettings={businessSettings}
                      anchorPrefix="sec"
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ===== Índice del manual =====
  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
          <BookOpen className="w-7 h-7 text-primary-600" />
          Manual de uso
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Guías paso a paso de cada parte del sistema. También puedes abrir la guía de la
          página donde estés con el botón de ayuda de la barra superior.
        </p>
      </div>

      {/* Búsqueda */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar en el manual... (ej. boleta, vuelto, stock)"
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        />
      </div>

      {groupedGuides.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700 mb-1">Sin resultados</p>
            <p className="text-sm text-gray-500">
              No encontramos guías para "{query}". Prueba con otra palabra.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedGuides.map(([category, guides]) => (
            <div key={category}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {category}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {guides.map(g => (
                  <Link key={g.id} to={`/app/manual/${g.id}`} className="group">
                    <Card className="h-full transition-shadow group-hover:shadow-md">
                      <CardContent className="p-4 flex items-start gap-3">
                        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 flex-shrink-0">
                          <BookOpen className="w-5 h-5 text-primary-600" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">
                            {g.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            {g.description}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 flex-shrink-0 mt-1 transition-colors" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-8">
        El manual está creciendo: cada semana se suman guías de más pantallas.
      </p>
    </div>
  )
}
