import { X, Check, Loader2, AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Modal de vista previa del tema del catálogo.
 * Carga el catálogo público real dentro de un iframe con ?previewTheme={id}
 * para que el dueño pueda navegar productos reales antes de aplicar el tema.
 */
export default function CatalogThemePreview({ theme, slug, enabled, isRestaurantMenu, isCurrent, onClose, onApply }) {
  const [iframeLoaded, setIframeLoaded] = useState(false)

  // Bloquear scroll del body
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hasSlug = !!slug
  // Ruta pública del catálogo: /menu/{slug} para restaurantes, /catalogo/{slug} para el resto
  const previewPath = hasSlug && enabled
    ? `/${isRestaurantMenu ? 'menu' : 'catalogo'}/${slug}?previewTheme=${theme.id}`
    : null

  // Estado vacío: sin slug o no habilitado y guardado
  let blockedReason = null
  if (!hasSlug) {
    blockedReason = {
      title: 'Configura primero la URL del catálogo',
      body: <>Para ver una vista previa, primero ingresa una URL para tu catálogo (ej: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">mi-negocio</code>) y guarda los cambios.</>,
    }
  } else if (!enabled) {
    blockedReason = {
      title: 'Habilita y guarda primero tu catálogo',
      body: <>La vista previa carga el catálogo real con tus productos. Activa el toggle <strong>"Habilitar catálogo público"</strong> y guarda los cambios. Después podrás probar los temas aquí.</>,
    }
  }

  // Renderizamos vía portal a document.body para que el fixed cubra el viewport completo
  // sin que ningún contenedor padre con transform/filter/contain lo limite.
  return createPortal((
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/60" onClick={onClose}>
      {/* Lienzo del iframe */}
      <div className="flex-1 relative bg-white" onClick={(e) => e.stopPropagation()}>
        {blockedReason ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center">
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{blockedReason.title}</h3>
              <p className="text-sm text-gray-600">{blockedReason.body}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Loading mientras carga el iframe */}
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Cargando vista previa…</p>
                </div>
              </div>
            )}
            <iframe
              key={theme.id}
              src={previewPath}
              title={`Vista previa: ${theme.name}`}
              onLoad={() => setIframeLoaded(true)}
              className="w-full h-full border-0"
            />
          </>
        )}
      </div>

      {/* Barra inferior flotante */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 px-2 py-1.5 bg-black/85 backdrop-blur-md rounded-full shadow-2xl border border-white/10">
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Cerrar vista previa (Esc)"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <span className="text-white/90 text-sm px-3 hidden sm:block font-medium">{theme.name}</span>
          <div className="w-px h-6 bg-white/20 hidden sm:block mx-1" />
          {isCurrent ? (
            <span className="px-4 py-2 text-sm font-medium text-white/80 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              Tema actual
            </span>
          ) : (
            <button
              onClick={onApply}
              className="px-4 py-2 bg-white text-gray-900 rounded-full font-medium text-sm hover:bg-gray-100 transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Usar este tema
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}
