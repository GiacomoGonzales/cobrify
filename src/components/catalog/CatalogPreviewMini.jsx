import { useEffect } from 'react'
import { Search, Star } from 'lucide-react'
import { getCatalogTheme, getCatalogAccent } from '@/themes/catalogThemes'

/**
 * VISTA PREVIA de Mi Catálogo Online — Paso 2 del rediseño.
 *
 * Una mini-tienda dibujada con los valores del formulario EN VIVO, sin
 * guardar: cambias el color o el tema y lo ves al instante. Es una MAQUETA,
 * no un iframe del catálogo real — el catálogo real solo puede mostrar lo ya
 * guardado, que es justo lo que no sirve para decidir.
 *
 * Los productos son bloques de relleno a propósito: el trabajo de la vista
 * previa es mostrar TEMA, COLOR y DISEÑO, no el inventario. Cargar el catálogo
 * completo de una ferretería (4.000 productos) para pintar cuatro tarjetas
 * sería pagar carísimo un detalle que no cambia la decisión.
 *
 * Usa el MISMO motor de temas que el catálogo público (getCatalogTheme): si un
 * tema cambia, la vista previa cambia sola — no hay una segunda copia de los
 * estilos que pueda desincronizarse.
 */
export default function CatalogPreviewMini({ name = 'Tu negocio', config = {} }) {
  const theme = getCatalogTheme(config.theme)
  const t = theme.classes || {}
  const accent = getCatalogAccent({ catalogColor: config.color, catalogTheme: config.theme })
  const categoriesVariant = theme.layout?.categories || 'underline'
  const cardVariant = theme.layout?.card || 'classic'
  const layout = config.layout || theme.layout?.grid || 'masonry'

  // Tipografías del tema: se inyecta el <link> de Google Fonts para que la
  // vista previa muestre la letra real del tema (clave para elegir uno).
  useEffect(() => {
    const url = theme.fonts?.googleFontsUrl
    if (!url) return
    if (document.querySelector(`link[href="${url}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
    // No se remueve al desmontar: otro tema puede volver a pedirla y las
    // fuentes cacheadas no estorban.
  }, [theme.fonts?.googleFontsUrl])

  const portada = (config.hero?.enabled && config.hero.slides?.[0]?.imageUrl)
    || config.coverImage || ''
  const anuncio = config.announcement || {}
  const flash = config.flashSale || {}
  const headingFont = theme.fonts?.heading ? { fontFamily: theme.fonts.heading } : {}
  const bodyFont = theme.fonts?.body ? { fontFamily: theme.fonts.body } : {}

  const CATS = ['Todos', 'Ofertas', 'Novedades']
  // Alturas variadas para que "masonry" se distinga de "grid" de un vistazo.
  const CARDS = layout === 'list'
    ? [1, 2, 3]
    : [{ h: 'h-16' }, { h: layout === 'masonry' ? 'h-24' : 'h-16' }, { h: layout === 'masonry' ? 'h-20' : 'h-16' }, { h: 'h-16' }]

  const MiniCard = ({ alto }) => (
    <div className={`${t.card || 'bg-white'} ${t.cardRadius || 'rounded-xl'} overflow-hidden shadow-sm`}>
      <div className={`${alto} relative`} style={{ backgroundColor: `${accent}18` }}>
        {cardVariant === 'overlay' && (
          <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/60 to-transparent">
            <div className="h-1.5 w-2/3 rounded bg-white/80" />
          </div>
        )}
      </div>
      {cardVariant !== 'overlay' && (
        <div className="p-1.5 space-y-1">
          <div className={`h-1.5 w-3/4 rounded ${config.theme === 'nocturno' ? 'bg-gray-600' : 'bg-gray-200'}`} />
          <div className="h-2 w-1/3 rounded" style={{ backgroundColor: accent }} />
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-gray-900">Vista previa</p>
        <p className="text-[11px] text-gray-400">se actualiza mientras editas</p>
      </div>

      {/* Marco de navegador: tres puntos + barra, para que se lea "así se ve
          tu página", no "esto es un dibujo". */}
      <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <div className="ml-2 flex-1 h-4 rounded bg-white border border-gray-200" />
        </div>

        <div className={`${t.bg || 'bg-gray-50'} text-[10px] leading-tight`} style={bodyFont}>

          {anuncio.enabled && anuncio.text && (
            <div
              className="px-2 py-1 text-center text-[9px] font-medium truncate"
              style={{ backgroundColor: anuncio.backgroundColor || '#111827', color: anuncio.textColor || '#fff' }}
            >
              {anuncio.text}
            </div>
          )}

          {/* Cabecera */}
          <div className={`${t.headerBg || 'bg-white'} px-3 py-2 flex items-center gap-2`}>
            {config.logoLandscape ? (
              <img src={config.logoLandscape} alt="" className="h-5 max-w-[110px] object-contain" />
            ) : (
              <>
                {config.logoUrl ? (
                  <img src={config.logoUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-none" />
                ) : (
                  <span
                    className="w-6 h-6 rounded-full flex-none flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    {(name || 'T').charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className={`block font-bold truncate text-[11px] ${t.text || 'text-gray-900'}`} style={headingFont}>{name}</span>
                  {config.tagline && (
                    <span className={`block truncate text-[8px] ${t.textMuted || 'text-gray-500'}`}>{config.tagline}</span>
                  )}
                </span>
              </>
            )}
          </div>

          {flash.enabled && flash.text && (
            <div
              className="px-2 py-1 flex items-center justify-between text-[9px] font-semibold"
              style={{ backgroundColor: flash.backgroundColor || '#DC2626', color: flash.textColor || '#fff' }}
            >
              <span className="truncate">{flash.text}</span>
              <span className="flex-none font-mono opacity-90">02:14:35</span>
            </div>
          )}

          {/* Portada */}
          {portada ? (
            <img src={portada} alt="" className="w-full h-16 object-cover" />
          ) : (
            <div
              className="w-full h-14 flex items-center justify-center"
              style={{ background: `linear-gradient(120deg, ${accent}, ${accent}99)` }}
            >
              {config.welcome && (
                <span className="px-3 text-center text-white/95 text-[9px] font-medium truncate" style={headingFont}>
                  {config.welcome}
                </span>
              )}
            </div>
          )}

          <div className="p-2 space-y-2">
            {/* Buscador decorativo */}
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${t.card || 'bg-white'} border ${config.theme === 'nocturno' ? 'border-gray-700' : 'border-gray-200'}`}>
              <Search className={`w-2.5 h-2.5 ${t.textMuted || 'text-gray-400'}`} />
              <span className={`text-[9px] ${t.textMuted || 'text-gray-400'}`}>Buscar productos...</span>
            </div>

            {/* Categorías según la variante del tema */}
            <div className="flex items-center gap-2">
              {categoriesVariant === 'circles' ? (
                CATS.map((c, i) => (
                  <span key={c} className="flex flex-col items-center gap-0.5">
                    <span
                      className="w-6 h-6 rounded-full border-2"
                      style={{ borderColor: i === 0 ? accent : 'transparent', backgroundColor: `${accent}15` }}
                    />
                    <span className={`text-[7px] ${i === 0 ? t.text : t.textMuted}`}>{c}</span>
                  </span>
                ))
              ) : categoriesVariant === 'pills' ? (
                CATS.map((c, i) => (
                  <span
                    key={c}
                    className={`px-2 py-0.5 rounded-full text-[8px] font-medium ${i === 0 ? 'text-white' : t.catInactive || 'bg-gray-100 text-gray-600'}`}
                    style={i === 0 ? { backgroundColor: accent } : {}}
                  >
                    {c}
                  </span>
                ))
              ) : (
                CATS.map((c, i) => (
                  <span
                    key={c}
                    className={`pb-0.5 text-[8px] font-medium border-b-2 ${i === 0 ? '' : `border-transparent ${t.textMuted || 'text-gray-400'}`}`}
                    style={i === 0 ? { borderColor: accent, color: accent } : {}}
                  >
                    {c}
                  </span>
                ))
              )}
            </div>

            {/* Destacados + tarjetas de producto */}
            <div className="flex items-center gap-1">
              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              <span className={`text-[9px] font-bold ${t.text || 'text-gray-900'}`} style={headingFont}>Destacados</span>
            </div>

            {layout === 'list' ? (
              <div className="space-y-1.5">
                {CARDS.map((_, i) => (
                  <div key={i} className={`${t.card || 'bg-white'} ${t.cardRadius || 'rounded-xl'} p-1.5 flex items-center gap-2 shadow-sm`}>
                    <div className="w-8 h-8 rounded-lg flex-none" style={{ backgroundColor: `${accent}18` }} />
                    <div className="flex-1 space-y-1">
                      <div className={`h-1.5 w-2/3 rounded ${config.theme === 'nocturno' ? 'bg-gray-600' : 'bg-gray-200'}`} />
                      <div className="h-2 w-1/4 rounded" style={{ backgroundColor: accent }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {CARDS.map((c, i) => <MiniCard key={i} alto={c.h} />)}
              </div>
            )}

            <p className={`text-center text-[7px] pt-1 ${t.footerPowered || 'text-gray-400'}`}>Powered by Cobrify</p>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 mt-2 leading-snug">
        Es una maqueta con productos de relleno. Guarda y usa <strong className="text-gray-500">Ver catálogo</strong> para verlo con tus productos reales.
      </p>
    </div>
  )
}
