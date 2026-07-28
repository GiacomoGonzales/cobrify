import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Carrusel horizontal para las filas de categorías del catálogo (Ola A1 del
 * rediseño). Reemplaza el wrap multilínea de desktop: con muchas categorías
 * se apilaban en 2-3 "pisos" y comían media pantalla.
 *
 * - SIEMPRE una sola fila con scroll horizontal (móvil y desktop).
 * - Desktop: flechas circulares en los bordes (aparecen solo si hay overflow
 *   hacia ese lado) + desvanecido en los extremos vía CSS mask (funciona
 *   sobre cualquier fondo de tema, claro u oscuro).
 * - Móvil: scroll táctil nativo, sin flechas (el dedo es el scroll).
 *
 * Uso: <CategoryScroller>{pills...}</CategoryScroller>
 */
export default function CategoryScroller({ children, className = '', innerClassName = '' }) {
  const scrollRef = useRef(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    updateArrows()
    const el = scrollRef.current
    if (!el) return
    // Reobservar en cambios de tamaño (rotación, resize, categorías que cargan tarde)
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateArrows, children])

  const scrollByAmount = (dir) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.7), behavior: 'smooth' })
  }

  // Desvanecido de bordes solo donde hay contenido oculto. mask-image respeta
  // el fondo real del tema (no hace falta adivinar el color del degradado).
  const maskImage = canLeft && canRight
    ? 'linear-gradient(to right, transparent, black 48px, black calc(100% - 48px), transparent)'
    : canLeft
      ? 'linear-gradient(to right, transparent, black 48px)'
      : canRight
        ? 'linear-gradient(to right, black calc(100% - 48px), transparent)'
        : 'none'

  return (
    <div className={`relative ${className}`}>
      <div
        ref={scrollRef}
        onScroll={updateArrows}
        className={`flex flex-nowrap overflow-x-auto scrollbar-hide ${innerClassName}`}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          WebkitMaskImage: maskImage,
          maskImage,
        }}
      >
        {children}
      </div>

      {/* Flechas: solo desktop y solo cuando hay overflow hacia ese lado */}
      {canLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount(-1)}
          aria-label="Desplazar categorías a la izquierda"
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-md border border-gray-200 hover:shadow-lg transition-shadow z-10"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          onClick={() => scrollByAmount(1)}
          aria-label="Desplazar categorías a la derecha"
          className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-md border border-gray-200 hover:shadow-lg transition-shadow z-10"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
