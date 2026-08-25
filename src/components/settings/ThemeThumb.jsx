import { useRef, useState, useLayoutEffect } from 'react'
import { getCatalogTheme, getCatalogAccent } from '@/themes/catalogThemes'
import RansomText from '@/components/catalog/RansomText'

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
 * 2. El lienzo tiene un tamaño FIJO (270×480) con medidas de tienda real
 *    —texto de 13px, tarjetas de 100px— y luego se escala con transform para
 *    caber en la tarjeta. Maquetar directo en miniatura obliga a fuentes de
 *    6px y bloques enormes, que es justo como se veía antes: desproporcionado
 *    y vacío abajo.
 *
 * Es una maqueta viva, no una captura: si un tema cambia de color, radio o
 * tipografía, su miniatura cambia sola y no hay que volver a fotografiar nada.
 */

const ANCHO = 270
// 480 = exactamente lo que ocupa el contenido (cabecera + portada + buscador +
// categorias + dos filas de productos). Da 9/16, la misma proporcion que usa
// shopifree, y hace que la miniatura CALCE con su marco: ni hueco abajo ni
// una fila cortada por la mitad.
const ALTO = 480

// Grano fino (Velvet): la misma textura de la tienda, a escala de miniatura.
// Texto pintado con el espectro (Hologram), sin animar en la miniatura.
const ESPECTRO_TEXTO = {
  backgroundImage: 'linear-gradient(90deg,#ff0050,#ff8800,#ffff00,#00ff66,#00bbff,#8800ff,#ff00cc)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
}

const GRANO_FINO = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`

// Ruido de fotocopia (Zine), en linea para no pedir ninguna imagen.
const TEXTURA_PAPEL = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.95' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.10' /%3E%3C/svg%3E")`

export default function ThemeThumb({ themeId, colorNegocio, nombre = 'Tu tienda', logoUrl, portadaUrl, fotos = [] }) {
  // El lienzo se dibuja a 270px y se encoge al ancho real de la tarjeta.
  // scale() necesita un numero puro, asi que el factor se mide aca: en CSS
  // (calc(100%/270)) seria invalido y la miniatura saldria a tamano completo.
  const cajaRef = useRef(null)
  // La escala exacta la da la container query de CSS. El calculo por JS solo
  // se usa donde no hay soporte de cqw: teniendo los dos activos, el valor
  // medido (que puede quedarse viejo si la columna cambia de ancho) pisaba al
  // de CSS y el lienzo se veia mas chico que su marco.
  const soportaCq = typeof CSS !== 'undefined' && CSS.supports?.('container-type: inline-size')
  const [escala, setEscala] = useState(null)
  // useLayoutEffect: mide con el layout ya calculado y ANTES de pintar, asi la
  // miniatura nunca aparece un frame a tamano completo.
  useLayoutEffect(() => {
    if (soportaCq) return
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
  }, [soportaCq])

  const theme = getCatalogTheme(themeId)
  const t = theme.tokens || {}
  const c = t.colors || {}
  const accent = getCatalogAccent({ catalogColor: colorNegocio, catalogTheme: themeId }, themeId)
  const radio = t.radius?.lg || '0.75rem'
  const oscuro = !!t.effects?.darkMode
  const chrome = theme.chrome || {}
  const pal = theme.palette || {}
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

  // Los temas que enmarcan la foto del producto (Bauhaus, Brutalist) declaran
  // classes.cardFrame. La miniatura lo refleja para no prometer otra cosa.
  const marcoLoseta = theme.classes?.cardFrame ? `2px solid ${borde}` : undefined
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
        // Grano de fotocopia: el mismo que pinta la tienda con este tema.
        backgroundImage: chrome.pageTexture === 'paper' ? TEXTURA_PAPEL : undefined,
        fontFamily: theme.fonts?.body || undefined,
        position: 'relative',
      }}
    >
      {/* Ambiente de los temas oscuros, congelado (sin animacion) */}
      {chrome.ambience === 'velvet' && (
        <>
          <span className="absolute inset-0 pointer-events-none" style={{ opacity: 0.07, backgroundImage: GRANO_FINO, backgroundSize: '256px' }} />
          <span className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 60% 50% at 20% 25%, ${accent}30 0%, transparent 55%)` }} />
          <span className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 80%, rgba(120,20,50,.22) 0%, transparent 55%)' }} />
        </>
      )}
      {chrome.ambience === 'hologram' && (
        <>
          <span
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: 0.8,
              background: 'conic-gradient(from 40deg at 55% 35%, rgba(255,0,80,.14), rgba(255,165,0,.14), rgba(255,255,0,.12), rgba(0,255,100,.14), rgba(0,180,255,.14), rgba(130,0,255,.14), rgba(255,0,200,.12), rgba(255,0,80,.14))',
            }}
          />
          <span
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(200,200,220,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(200,200,220,.05) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </>
      )}

      {/* Franja numerada del tema, cuando la pide */}
      {chrome.topStrip && (
        <div
          className="flex items-center justify-between px-3 text-[7px] font-bold uppercase tracking-widest"
          style={{ height: 16, borderBottom: `2px solid ${borde}`, color: texto }}
        >
          <span>01 / 24</span>
          <span>{chrome.topStripText || ''}</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      )}

      {/* Cabecera */}
      <div
        className="flex items-center gap-2 px-3"
        style={{
          height: 44,
          backgroundColor: chrome.heroCover === 'impact' ? bg : surface,
          borderBottom: chrome.topStrip ? `2px solid ${borde}` : undefined,
        }}
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
          style={chrome.headerNameGlow
            ? { color: accent, textShadow: `0 0 18px ${accent}88`, fontFamily: fuenteTitulo }
            : chrome.headerNameSpectrum
            ? { fontFamily: fuenteTitulo, ...ESPECTRO_TEXTO }
            : chrome.headerNameStamp
            ? {
              backgroundColor: texto, color: c.textInverted || '#EFEDE6',
              padding: '1px 6px', transform: 'rotate(-1deg)', display: 'inline-block',
              fontFamily: fuenteTitulo,
            }
            : { color: nombreEnAcento ? accent : texto, fontFamily: fuenteTitulo }}
        >
          {nombre}
        </span>
        {/* Carrito con la forma del tema */}
        {chrome.headerCart === 'glow' ? (
          <span
            className="ml-auto flex-none flex items-center justify-center gap-1 px-2"
            style={{
              height: 24, borderRadius: t.radius?.md || '0.625rem',
              background: `linear-gradient(135deg, ${accent}, ${accent}AA)`,
              boxShadow: `0 0 14px ${accent}80`,
            }}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke={oscuro ? '#0F0F12' : '#fff'} strokeWidth="2">
              <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[9px] font-bold" style={{ color: oscuro ? '#0F0F12' : '#fff' }}>2</span>
          </span>
        ) : chrome.headerCart === 'zine' ? (
          <span
            className="ml-auto flex-none flex items-center justify-center text-[8px] font-bold uppercase px-1.5"
            style={{
              height: 20, border: `2px solid ${borde}`,
              backgroundColor: accent, color: c.textInverted || '#EFEDE6',
              boxShadow: `2px 2px 0 0 ${borde}`, letterSpacing: '0.1em',
            }}
          >
            Bolsa [2]
          </span>
        ) : chrome.headerCart === 'brutal' ? (
          <span
            className="ml-auto flex-none flex items-center justify-center text-[8px] font-bold uppercase tracking-wider px-1.5"
            style={{
              height: 20, border: `2px solid ${borde}`,
              backgroundColor: accent, color: '#FFFFFF',
              boxShadow: `2px 2px 0 ${borde}`,
            }}
          >
            Bolsa (2)
          </span>
        ) : chrome.headerCart === 'outline' ? (
          <span
            className="ml-auto flex-none flex items-center justify-center text-[8px] font-bold uppercase tracking-wider px-1.5"
            style={{ height: 20, border: `2px solid ${borde}`, color: texto }}
          >
            Bolsa (2)
          </span>
        ) : (
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
        )}
      </div>

      {/* Composicion geometrica (Bauhaus): la miniatura muestra la MISMA
          reticula que el catalogo, en pequeno. */}
      {chrome.heroCover === 'mondrian' ? (
        <div className="grid grid-cols-12 grid-rows-6 gap-1 px-3 py-2.5" style={{ height: 150 }}>
          <div className="col-span-7 row-span-3 relative flex items-end p-1.5" style={{ backgroundColor: accent }}>
            <span className="text-[9px] font-black uppercase leading-none text-white truncate" style={{ fontFamily: fuenteTitulo }}>
              {nombre}
            </span>
            <svg className="absolute top-1 right-1 w-3 h-3" viewBox="0 0 50 50"><polygon points="25,4 46,46 4,46" fill={pal.negro || '#0E0E0E'} /></svg>
          </div>
          <div className="col-span-5 row-span-2 flex items-center justify-center" style={{ backgroundColor: pal.amarillo || '#FFD500' }}>
            <span className="w-2/3 aspect-square rounded-full" style={{ backgroundColor: pal.negro || '#0E0E0E' }} />
          </div>
          <div className="col-span-5 row-span-2 flex items-center p-1" style={{ backgroundColor: pal.negro || '#0E0E0E' }}>
            <span className="text-[6px] uppercase leading-tight text-white line-clamp-2">Menos, pero mejor.</span>
          </div>
          <div className="col-span-7 row-span-3 overflow-hidden" style={{ backgroundColor: pal.azul || '#1A4DCC' }}>
            {portadaUrl
              ? <img src={portadaUrl} alt="" className="w-full h-full object-cover" />
              : <svg viewBox="0 0 600 400" preserveAspectRatio="none" className="w-full h-full">
                  <rect x="40" y="60" width="180" height="180" fill={pal.amarillo || '#FFD500'} />
                  <circle cx="380" cy="220" r="100" fill="#fff" />
                  <polygon points="500,60 580,200 420,200" fill={pal.negro || '#0E0E0E'} />
                </svg>}
          </div>
          <div className="col-span-2 row-span-1" style={{ backgroundColor: pal.amarillo || '#FFD500' }} />
          <div className="col-span-2 row-span-1" style={{ backgroundColor: pal.negro || '#0E0E0E' }} />
          <div className="col-span-1 row-span-1" style={{ backgroundColor: accent }} />
        </div>
      ) : chrome.heroCover === 'fade' ? (
        /* Temas oscuros: la foto se apaga hacia abajo hasta el fondo. Sin
           portada queda el nombre solo, que es como se ve la tienda. */
        <div className="relative" style={{ height: 116, backgroundColor: bg }}>
          {portadaUrl ? (
            <>
              <img src={portadaUrl} alt="" className="w-full h-full object-cover" style={{ filter: chrome.heroCoverFilter || 'brightness(0.75)' }} />
              <div
                className="absolute inset-0"
                // El velo de arriba solo en temas oscuros: sobre papel crema
                // ensucia la foto (mismo criterio que la tienda).
                style={{ background: `linear-gradient(180deg, ${oscuro ? 'rgba(0,0,0,.5)' : 'transparent'} 0%, transparent 35%, transparent 55%, ${bg} 100%)` }}
              />
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center px-3 text-center">
              {/* Sin portada, cada tema pone el nombre con SU voz */}
              <span
                className="text-[20px] leading-tight truncate max-w-full"
                style={(() => {
                  const base = { fontFamily: fuenteTitulo }
                  if (chrome.heroEmpty === 'spectrum') {
                    return { ...base, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', ...ESPECTRO_TEXTO }
                  }
                  if (chrome.heroEmpty === 'impact') {
                    return { ...base, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', color: accent }
                  }
                  if (chrome.heroEmpty === 'editorial') {
                    return { ...base, fontWeight: 700, color: accent }
                  }
                  return { ...base, fontStyle: 'italic', fontWeight: 600, color: texto, textShadow: `0 0 22px ${accent}66` }
                })()}
              >
                {nombre}
              </span>
            </div>
          )}
        </div>
      ) : chrome.heroCover === 'collage' ? (
        /* Collage de fanzine: cinta, sello, el nombre recortado y la foto en
           blanco y negro con marco y sombra dura — igual que la tienda. */
        <div className="relative overflow-hidden px-3 pt-3 pb-2" style={{ height: 150 }}>
          <span
            className="absolute w-16 h-4 pointer-events-none"
            style={{ top: 4, left: '22%', backgroundColor: 'rgba(253,230,138,0.8)', transform: 'rotate(-12deg)' }}
          />
          <span
            className="absolute w-12 h-4 pointer-events-none"
            style={{ top: 10, right: '28%', backgroundColor: 'rgba(253,230,138,0.75)', transform: 'rotate(8deg)' }}
          />
          <div className="relative text-center">
            <span
              className="inline-block uppercase tracking-widest text-[6px] px-1.5 py-0.5"
              style={{ backgroundColor: texto, color: c.textInverted || '#EFEDE6', transform: 'rotate(-2deg)', fontFamily: fuenteTitulo }}
            >
              ★ Número uno ★
            </span>
            <div className="mt-1.5">
              <RansomText
                text={(nombre || '').toUpperCase()}
                tamano="20px"
                colorFondo={texto}
                colorTexto={c.textInverted || '#EFEDE6'}
                colorNormal={texto}
              />
            </div>
          </div>
          {portadaUrl && (
            <div className="mt-3 flex justify-center">
              <div
                className="overflow-hidden"
                style={{
                  width: 150, height: 58, border: `2px solid ${texto}`,
                  boxShadow: `4px 4px 0 0 ${texto}`, transform: 'rotate(-1deg)',
                  filter: 'grayscale(0.85) contrast(1.4)',
                }}
              >
                <img src={portadaUrl} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
          )}
        </div>
      ) : chrome.heroCover === 'raw' ? (
        /* Brutalist: la foto cruda con el contraste subido y filete grueso.
           Sin portada, el nombre a tamano de cartel — el mismo manifiesto que
           arma la tienda. */
        <div style={{ height: 116, backgroundColor: bg, borderBottom: `3px solid ${borde}` }}>
          {portadaUrl ? (
            <img src={portadaUrl} alt="" className="w-full h-full object-cover" style={{ filter: 'contrast(110%)' }} />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center px-3 text-center">
              <span
                className="text-[24px] font-bold uppercase leading-none truncate max-w-full"
                style={{ color: texto, fontFamily: fuenteTitulo, letterSpacing: '-0.05em' }}
              >
                {nombre}
              </span>
              <span className="text-[8px] uppercase tracking-[0.2em] mt-2" style={{ color: textoSuave }}>
                {'// '}{chrome.topStripText || 'Catálogo'}
              </span>
            </div>
          )}
        </div>
      ) : (
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
      )}

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
              <div className="relative overflow-hidden" style={{ height: 84, backgroundColor: surfaceHover, borderRadius: radio, border: marcoLoseta }}>
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
