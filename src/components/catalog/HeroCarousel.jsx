// Carrusel de portada del catálogo público (F2.2 del plan de rediseño).
// Feature activable: reemplaza la portada única cuando el negocio configura
// slides en Configuración > Mi Catálogo Online. Config en el doc del negocio:
//   catalogHero = { enabled, slides: [{ id, imageUrl, title, subtitle, link }] }
// Sin librerías: autoplay cada 5s (pausa en hover/touch), swipe táctil,
// flechas en desktop y dots. El primer slide carga eager (LCP); el resto lazy.
import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { optimizeImageUrl } from '@/utils/cloudinary'

export default function HeroCarousel({ slides = [] }) {
  const count = slides.length
  const [index, setIndex] = useState(0)
  const pausedRef = useRef(false)
  const touchStartX = useRef(null)

  const go = useCallback((i) => {
    if (count === 0) return
    setIndex(((i % count) + count) % count)
  }, [count])

  // Autoplay (solo con 2+ slides)
  useEffect(() => {
    if (count <= 1) return
    const timer = setInterval(() => {
      if (!pausedRef.current) setIndex(i => (i + 1) % count)
    }, 5000)
    return () => clearInterval(timer)
  }, [count])

  // Si cambia la cantidad de slides (edición en Settings), no quedar fuera de rango
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0)
  }, [count, index])

  if (count === 0) return null

  const onTouchStart = (e) => {
    pausedRef.current = true
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e) => {
    pausedRef.current = false
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1))
    touchStartX.current = null
  }

  return (
    <div
      className="relative h-48 md:h-72 overflow-hidden"
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((s, i) => {
          const hasText = !!(s.title || s.subtitle)
          const content = (
            <>
              <img
                src={optimizeImageUrl(s.imageUrl, 'cover_desktop')}
                alt={s.title || ''}
                className="absolute inset-0 w-full h-full object-cover"
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchpriority={i === 0 ? 'high' : undefined}
                decoding="async"
              />
              {hasText && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
                    <div className="max-w-7xl mx-auto">
                      {s.title && (
                        <h2 className="text-white font-bold text-lg md:text-2xl drop-shadow-lg">{s.title}</h2>
                      )}
                      {s.subtitle && (
                        <p className="text-white/80 text-sm md:text-base mt-0.5 drop-shadow">{s.subtitle}</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )
          return s.link ? (
            <a
              key={s.id || i}
              href={s.link}
              target="_blank"
              rel="noopener noreferrer"
              className="relative w-full h-full flex-shrink-0 block"
            >
              {content}
            </a>
          ) : (
            <div key={s.id || i} className="relative w-full h-full flex-shrink-0">
              {content}
            </div>
          )
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
            aria-label="Siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`}
                aria-label={`Ir al slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
