import { getCatalogTheme, getCatalogAccent } from '@/themes/catalogThemes'

/**
 * Miniatura de un tema del catálogo, en formato retrato (como la galería de
 * apariencia de shopifree).
 *
 * En vez de una captura guardada como archivo, la mini-tienda se DIBUJA con
 * los tokens del propio tema: fondo, superficie, bordes, radios, tipografía y
 * acento. Así la miniatura nunca se desactualiza — si mañana un tema cambia de
 * color o de esquinas, su tarjeta cambia sola — y no hay que mantener imágenes
 * ni volver a fotografiar cada tema.
 *
 * Si el negocio eligió un color propio, la miniatura lo usa: el catálogo va a
 * verse con ESE color, no con el del tema.
 */
export default function ThemeThumb({ themeId, colorNegocio }) {
  const theme = getCatalogTheme(themeId)
  const t = theme.tokens || {}
  const c = t.colors || {}
  const accent = getCatalogAccent({ catalogColor: colorNegocio, catalogTheme: themeId }, themeId)
  const radio = t.radius?.lg || '0.75rem'
  const oscuro = !!t.effects?.darkMode
  const fuenteTitulo = theme.fonts?.heading || undefined

  const bg = c.background || '#F9FAFB'
  const surface = c.surface || '#FFFFFF'
  const surfaceHover = c.surfaceHover || '#F3F4F6'
  const texto = c.text || '#111827'
  const borde = c.border || '#E5E7EB'

  return (
    <div className="w-full h-full flex flex-col text-[6px] leading-none" style={{ backgroundColor: bg }}>
      {/* Cabecera */}
      <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0" style={{ backgroundColor: surface }}>
        <span className="w-2.5 h-2.5 flex-shrink-0" style={{ backgroundColor: accent, borderRadius: radio }} />
        <span className="font-bold truncate" style={{ color: texto, fontFamily: fuenteTitulo }}>Tienda</span>
        <span className="ml-auto w-2.5 h-2.5 flex-shrink-0" style={{ backgroundColor: accent, borderRadius: '999px' }} />
      </div>

      {/* Portada */}
      <div
        className="h-8 flex-shrink-0"
        style={{ background: `linear-gradient(120deg, ${accent}, ${accent}88)` }}
      />

      <div className="flex-1 p-1.5 space-y-1.5 min-h-0">
        {/* Buscador */}
        <div
          className="h-2.5"
          style={{ backgroundColor: surface, border: `0.5px solid ${borde}`, borderRadius: radio }}
        />

        {/* Categorías: activa con el acento */}
        <div className="flex gap-1 items-center">
          <span className="h-1.5 w-5" style={{ backgroundColor: accent, borderRadius: '999px' }} />
          <span className="h-1.5 w-4" style={{ backgroundColor: surfaceHover, borderRadius: '999px' }} />
          <span className="h-1.5 w-4" style={{ backgroundColor: surfaceHover, borderRadius: '999px' }} />
        </div>

        {/* Tarjetas de producto */}
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} style={{ backgroundColor: surface, borderRadius: radio, overflow: 'hidden' }}>
              <div style={{ backgroundColor: surfaceHover, height: '18px' }} />
              <div className="p-1 space-y-0.5">
                <div style={{ backgroundColor: oscuro ? '#4B5563' : '#E5E7EB', height: '2px', width: '80%', borderRadius: '999px' }} />
                <div style={{ backgroundColor: accent, height: '3px', width: '45%', borderRadius: '999px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
