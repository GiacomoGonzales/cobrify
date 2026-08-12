import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X, BookOpen, ArrowRight, Loader2 } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { getGuideByPath, getVisibleSections } from '@/data/guides/registry'
import GuideRenderer from './GuideRenderer'

/**
 * Panel lateral de AYUDA: se abre con el botón "?" del Navbar y muestra la
 * guía de uso de la página en la que está parado el usuario.
 *
 * Es un panel (no un modal a pantalla completa) a propósito: la persona puede
 * leer los pasos y ejecutarlos en la pantalla al mismo tiempo.
 *
 * El contenido se carga con import() dinámico recién cuando se abre, así las
 * guías no pesan en el bundle inicial.
 *
 * REGLA: todos los hooks van ANTES del primer return condicional (React #310).
 */
export default function GuidePanel({ open, onClose }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { businessMode, businessSettings, isDemoMode } = useAppContext()

  const guideMeta = getGuideByPath(location.pathname)
  const guideId = guideMeta?.id || null

  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)

  // Cargar el contenido de la guía al abrir (o al cambiar de página con el panel abierto)
  useEffect(() => {
    if (!open || !guideMeta) {
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
    // guideId identifica la guía; guideMeta es un objeto estable del registro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guideId])

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const sections = content ? getVisibleSections(content, businessMode) : []

  const goToManual = () => {
    onClose()
    navigate(guideId ? `/app/manual/${guideId}` : '/app/manual')
  }

  const scrollToSection = (sectionId) => {
    document.getElementById(`panel-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Fondo oscurecido: clic afuera cierra */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full sm:w-[430px] bg-white shadow-2xl flex flex-col">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 flex-shrink-0">
              <BookOpen className="w-5 h-5 text-primary-600" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 leading-tight">Guía de uso</p>
              <h2 className="text-base font-bold text-gray-900 truncate">
                {guideMeta ? guideMeta.title : 'Ayuda'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-1 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
            title="Cerrar"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-5 py-4">
          {!guideMeta ? (
            // La página actual todavía no tiene guía
            <div className="flex flex-col items-center text-center pt-10 px-4">
              <BookOpen className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">
                Esta página aún no tiene guía
              </p>
              <p className="text-sm text-gray-500 mb-5">
                Estamos escribiendo las guías de cada pantalla, pantalla por pantalla.
              </p>
              {!isDemoMode && (
                <button
                  onClick={goToManual}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Ver el manual de uso
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : loading || !content ? (
            <div className="flex items-center justify-center pt-12 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* Mini índice: salta a la sección dentro del panel */}
              {sections.length > 1 && (
                <div className="mb-5 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    En esta guía
                  </p>
                  <ul className="space-y-1">
                    {sections.map(s => (
                      <li key={s.id}>
                        <button
                          onClick={() => scrollToSection(s.id)}
                          className="text-sm text-primary-700 hover:underline text-left"
                        >
                          {s.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <GuideRenderer
                content={content}
                businessMode={businessMode}
                businessSettings={businessSettings}
                anchorPrefix="panel"
                isDemoMode={isDemoMode}
                onNavigate={onClose}
              />
            </>
          )}
        </div>

        {/* Pie: acceso al manual completo (no aplica en demo, que no tiene /app) */}
        {guideMeta && !isDemoMode && (
          <div className="px-4 sm:px-5 py-3 border-t border-gray-200 flex-shrink-0">
            <button
              onClick={goToManual}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-primary-700 hover:bg-primary-50 text-sm font-medium rounded-lg border border-primary-200 transition-colors"
            >
              Ver el manual completo
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
