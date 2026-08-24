import { useRef, useState, useLayoutEffect } from 'react'
import { getCatalogTheme, getCatalogAccent } from '@/themes/catalogThemes'

/**
 * Miniatura de un tema del catálogo, al estilo de la galería de apariencia de
 * shopifree: se ve una TIENDA de verdad, no un esquema de bloques.
 *
 * Dos decisiones que hacen la diferencia:
 *
 * 1. Se pinta con las imágenes REALES del negocio — su portada, su logo y las
 *    fotos de sus productos. Una miniatura con rectángulos grises no deja
 *    elegir tema: lo que se juzga es cómo caen las fotos propias en ese
 *    diseño.
 * 2. El lienzo tiene un tamaño FIJO (270×420) con medidas de tienda real
 *    —texto de 13px, tarjetas de 100px— y luego se escala con transform para
 *    caber en la tarjeta. Maquetar directo en miniatura obliga a fuentes de
 *    6px y bloques enormes, que es justo como se veía antes: desproporcionado
 *    y vacío abajo.
 *
 * Es una maqueta viva, no una captura: si un tema cambia de color, radio o
 * tipografía, su miniatura cambia sola y no hay que volver a fotografiar nada.
 */

const ANCHO = 270
const ALTO = 420

export default function ThemeThumb({ themeId, colorNegocio, nombre = 'Tu tienda', logoUrl, portadaUrl, fotos = [] }) {
  // El lienzo se dibuja a 270px y se encoge al ancho real de la tarjeta.
  // scale() necesita un numero puro, asi que el factor se mide aca: en CSS
  // (calc(100%/270)) seria invalido y la miniatura saldria a tamano completo.
  const cajaRef = useRef(null)
  // null = todavia no se midio: manda la escala CSS (container query)
  const [escala, setEscala] = useState(null)
  // useLayoutEffect: mide con el layout ya calculado y ANTES de pintar, asi la
  // miniatura nunca aparece un frame a tamano completo.
  useLayoutEffect(() => {
    const nodo = cajaRef.current
    if (!nodo) return
    const medir = () => {
      const ancho = nodo.getBoundingClientRect().width
      if (ancho > 0) setEscala(ancho / ANCHO)
    }
    // Se mide en el frame siguiente: al montar, el ancho todavia puede ser 0
    // (la grilla aun no repartio columnas) y quedaria en escala 1.
    const raf = requestAnimationFrame(medir)
    const ro = new ResizeObserver(medir)
    ro.observe(nodo)
    window.addEventListener('resize', medir)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [])

  const theme = getCatalogTheme(themeId)
  const t = theme.tokens || {}
  const c = t.colors || {}
  const accent = getCatalogAccent({ catalogColor: colorNegocio, catalogTheme: themeId }, themeId)
  const radio = t.radius?.lg || '0.75rem'
  const oscuro = !!t.effects?.darkMode
  const chrome = theme.chrome || {}
  const fuenteTitulo = theme.fonts?.heading || undefined

  const bg = c.background || '#F9FAFB'
  const surface = c.surface || '#FFFFFF'
  const surfaceHover = c.surfaceHover || '#F3F4F6'
  const texto = c.text || '#111827'
  const textoSuave = c.textMuted || '#6B7280'
  const borde = c.border || '#E5E7EB'

  // Relleno cuando el negocio aún no subió fotos: bloques con su acento, que
  // al menos respetan el color del tema.
  const imgs = [0, 1, 2, 3].map((i) => fotos[i % Math.max(1, fotos.length)] || null)

  const nombreCls = chrome.headerName || 'font-bold'
  const nombreEnAcento = !!chrome.headerNameAccent

  return (
    <div
      ref={cajaRef}
      className="absolute inset-0 overflow-hidden"
      style={{ containerType: 'inline-size', ['--thumb-cq']: `calc(100cqw / ${ANCHO}px)` }}
    >
    <div
      className="origin-top-left"
      style={{
        width: ANCHO,
        height: ALTO,
        transform: escala != null ? `scale(${escala})` : 'scale(var(--thumb-cq, 1))',
        backgroundColor: bg,
        fontFamily: theme.fonts?.body || undefined,
        position: 'relative',
      }}
    >
      {/* Cabecera */}
      <div
        className="flex items-center gap-2 px-3"
        style={{ height: 44, backgroundColor: chrome.heroCover === 'impact' ? bg : surface }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="w-7 h-7 object-cover flex-none" style={{ borderRadius: chrome.headerLogoRound ? '999px' : radio }} />
        ) : (
          <span
            className="w-7 h-7 flex-none flex items-center justify-center text-[11px] font-bold text-white"
            style={{ backgroundColor: accent, borderRadius: chrome.headerLogoRound ? '999px' : radio }}
          >
            {(nombre || 'T').charAt(0).toUpperCase()}
          </span>
        )}
        <span
          className={`text-[13px] truncate ${nombreCls}`}
          style={{ color: nombreEnAcento ? accent : texto, fontFamily: fuenteTitulo }}
        >
          {nombre}
        </span>
        {/* Carrito con la forma del tema */}
        <span
          className="ml-auto flex-none flex items-center justify-center"
          style={{
            width: 26, height: 26,
            backgroundColor: chrome.headerCart === 'square' ? accent : chrome.headerCart === 'bubble' ? surfaceHover : 'transparent',
            borderRadius: chrome.headerCart === 'square' ? '0' : '999px',
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={chrome.headerCart === 'square' ? (oscuro ? '#0F0F12' : '#fff') : accent} strokeWidth="2">
            <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      {/* Portada con el nombre encima (como en la tienda real) */}
      <div className="relative" style={{ height: 116, backgroundColor: surfaceHover }}>
        {portadaUrl ? (
          <img src={portadaUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: `linear-gradient(120deg, ${accent}, ${accent}80)` }} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: chrome.heroCover === 'impact'
              ? `linear-gradient(135deg, ${accent}B3 0%, transparent 45%, rgba(0,0,0,.9) 100%)`
              : 'linear-gradient(to top, rgba(0,0,0,.45), transparent 60%)',
          }}
        />
        <div className="absolute bottom-2 left-3 right-3">
          <p
            className={`text-white truncate ${chrome.heroCover === 'impact' ? 'font-black uppercase tracking-tight text-[19px]' : 'text-[17px] font-semibold'}`}
            style={{ fontFamily: fuenteTitulo }}
          >
            {nombre}
          </p>
        </div>
      </div>

      <div className="px-3 pt-2.5 space-y-2.5">
        {/* Buscador */}
        <div
          className="flex items-center gap-1.5 px-2.5"
          style={{ height: 26, backgroundColor: surface, border: `1px solid ${borde}`, borderRadius: radio }}
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={textoSuave} strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <span className="text-[10px]" style={{ color: textoSuave }}>Buscar productos...</span>
        </div>

        {/* Categorías: la activa con el acento */}
        <div className="flex items-center gap-3 text-[10px]">
          <span className="pb-0.5 font-semibold" style={{ color: accent, borderBottom: `2px solid ${accent}` }}>Todos</span>
          <span style={{ color: textoSuave }}>Novedades</span>
          <span style={{ color: textoSuave }}>Ofertas</span>
        </div>

        {/* Productos con las fotos del negocio */}
        <div className="grid grid-cols-2 gap-2.5">
          {imgs.map((src, k) => (
            <div key={k}>
              <div className="relative overflow-hidden" style={{ height: 84, backgroundColor: surfaceHover, borderRadius: radio }}>
                {src
                  ? <img src={src} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${accent}25, ${accent}10)` }} />}
                {k === 0 && (
                  <span
                    className="absolute top-1.5 left-1.5 px-1.5 text-[9px] font-semibold text-white"
                    style={{ backgroundColor: accent, borderRadius: '999px', lineHeight: '14px' }}
                  >
                    -50%
                  </span>
                )}
              </div>
              <p className="text-[10px] mt-1 truncate" style={{ color: texto, fontFamily: fuenteTitulo }}>Producto {k + 1}</p>
              <p className="text-[11px] font-bold" style={{ color: oscuro ? '#fff' : texto }}>S/ {[39, 59, 25, 80][k]}.00</p>
            </div>
          ))}
        </div>
      </div>

      {/* Botón flotante de WhatsApp, como en la tienda */}
      <span
        className="absolute flex items-center justify-center"
        style={{ right: 12, bottom: 12, width: 30, height: 30, borderRadius: '999px', backgroundColor: '#25D366' }}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="#fff">
          <path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.6.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.5-.7-2.5-1.3-3.5-3-.3-.4-.3-.7.1-1 .2-.2.3-.4.5-.6.1-.2.1-.3 0-.5s-.6-1.6-.9-2.2c-.2-.5-.5-.4-.6-.4h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5 1.8.8 2.5.8 3.4.7.5-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.5-.3M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2z" />
        </svg>
      </span>
    </div>
    </div>
  )
}

export { ANCHO as THUMB_W, ALTO as THUMB_H }
