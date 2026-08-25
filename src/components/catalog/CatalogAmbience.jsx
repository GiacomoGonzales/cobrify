import { useEffect, useRef } from 'react'

/**
 * Capas decorativas de fondo para los temas oscuros "premium" (Velvet y
 * Hologram). Van fijas detrás de toda la tienda y no reciben clics.
 *
 * Vive aparte del catálogo porque necesita listeners propios (scroll y mouse)
 * y porque son puro adorno: si el componente no se monta, la tienda funciona
 * exactamente igual.
 *
 * Todo respeta `prefers-reduced-motion`: quien pidió menos movimiento ve las
 * capas quietas, no una pantalla en blanco. Y en móvil no hay parallax por
 * scroll ni reacción al cursor — no hay cursor, y mover capas en cada scroll
 * de un celular es la forma más rápida de que la tienda se sienta lenta.
 */
export default function CatalogAmbience({ variant, accent }) {
  const capa1 = useRef(null)
  const capa2 = useRef(null)
  const capa3 = useRef(null)
  const holo = useRef(null)

  // --- Parallax por scroll (Velvet) ---
  useEffect(() => {
    if (variant !== 'velvet') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(min-width: 768px)').matches) return

    let raf = 0
    const alScrollear = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const y = window.scrollY
        if (capa1.current) capa1.current.style.transform = `translateY(${y * 0.12}px)`
        if (capa2.current) capa2.current.style.transform = `translateY(${y * 0.22}px)`
        if (capa3.current) capa3.current.style.transform = `translateY(${y * 0.06}px)`
      })
    }
    window.addEventListener('scroll', alScrollear, { passive: true })
    return () => { window.removeEventListener('scroll', alScrollear); cancelAnimationFrame(raf) }
  }, [variant])

  // --- Iridiscencia que sigue al cursor (Hologram) ---
  useEffect(() => {
    if (variant !== 'hologram') return
    if (!window.matchMedia('(min-width: 768px)').matches) return

    let raf = 0
    const alMover = (e) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (!holo.current) return
        const x = (e.clientX / window.innerWidth) * 100
        const y = ((e.clientY + window.scrollY) / document.documentElement.scrollHeight) * 100
        const angulo = (e.clientX + e.clientY) * 0.4
        holo.current.style.background = `conic-gradient(from ${angulo}deg at ${x}% ${y}%,`
          + 'rgba(255,0,80,.14),rgba(255,165,0,.14),rgba(255,255,0,.12),rgba(0,255,100,.14),'
          + 'rgba(0,180,255,.14),rgba(130,0,255,.14),rgba(255,0,200,.12),rgba(255,0,80,.14))'
      })
    }
    window.addEventListener('mousemove', alMover, { passive: true })
    return () => { window.removeEventListener('mousemove', alMover); cancelAnimationFrame(raf) }
  }, [variant])

  if (variant === 'velvet') {
    const rosa = accent || '#E8A0C8'
    const lavanda = '#C0A0E0'
    return (
      <>
        {/* Grano: le quita el plano digital al fondo, como un papel fotográfico */}
        <div
          className="fixed inset-0 pointer-events-none z-[1]"
          style={{ opacity: 0.07, backgroundImage: GRANO, backgroundSize: '512px' }}
        />
        <div
          ref={capa1}
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 20% 25%, ${lavanda}30 0%, transparent 55%)`,
            willChange: 'transform',
          }}
        />
        <div
          ref={capa2}
          className="fixed inset-0 pointer-events-none catalog-glow-pulse"
          style={{
            background: `radial-gradient(ellipse 50% 40% at 80% 55%, ${rosa}25 0%, transparent 50%)`,
            willChange: 'transform',
          }}
        />
        <div
          ref={capa3}
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 70% 50% at 50% 80%, rgba(120,20,50,.18) 0%, transparent 55%),`
              + `radial-gradient(ellipse 40% 30% at 30% 60%, ${lavanda}12 0%, transparent 50%)`,
            willChange: 'transform',
          }}
        />
        {/* Ornamento: una rosa de los vientos apenas insinuada */}
        <svg
          className="fixed pointer-events-none hidden md:block"
          style={{ top: '3%', right: '4%', width: 150, height: 150, opacity: 0.1 }}
          viewBox="0 0 150 150"
          aria-hidden="true"
        >
          <circle cx="75" cy="75" r="60" fill="none" stroke={rosa} strokeWidth="0.5" />
          <circle cx="75" cy="75" r="45" fill="none" stroke={lavanda} strokeWidth="0.3" />
          <path d="M75 15 L85 65 L75 75 L65 65 Z" fill="none" stroke={rosa} strokeWidth="0.5" />
          <path d="M75 135 L85 85 L75 75 L65 85 Z" fill="none" stroke={rosa} strokeWidth="0.5" />
          <path d="M15 75 L65 65 L75 75 L65 85 Z" fill="none" stroke={lavanda} strokeWidth="0.5" />
          <path d="M135 75 L85 65 L75 75 L85 85 Z" fill="none" stroke={lavanda} strokeWidth="0.5" />
        </svg>
      </>
    )
  }

  if (variant === 'hologram') {
    return (
      <>
        {/* Escritorio: el iris sigue al cursor. Arranca con una posición fija
            para que no se vea vacío hasta que alguien mueva el mouse. */}
        <div
          ref={holo}
          className="fixed inset-0 pointer-events-none hidden md:block"
          style={{
            opacity: 0.8,
            background: 'conic-gradient(from 0deg at 50% 40%,'
              + 'rgba(255,0,80,.14),rgba(255,165,0,.14),rgba(255,255,0,.12),rgba(0,255,100,.14),'
              + 'rgba(0,180,255,.14),rgba(130,0,255,.14),rgba(255,0,200,.12),rgba(255,0,80,.14))',
          }}
        />
        {/* Móvil: sin cursor que seguir, el iris barre solo */}
        <div
          className="fixed inset-0 pointer-events-none md:hidden catalog-holo-sweep"
          style={{
            background: 'linear-gradient(135deg, rgba(255,0,80,.10), rgba(255,165,0,.10),'
              + 'rgba(255,255,0,.08), rgba(0,255,100,.10), rgba(0,180,255,.10),'
              + 'rgba(130,0,255,.10), rgba(255,0,80,.10))',
            backgroundSize: '400% 400%',
          }}
        />
        {/* Retícula luminosa: da profundidad sin pesar */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(200,200,220,.04) 1px, transparent 1px),'
              + 'linear-gradient(90deg, rgba(200,200,220,.04) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
      </>
    )
  }

  return null
}

// Ruido fractal en línea: no pide ninguna imagen al servidor.
const GRANO = `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
