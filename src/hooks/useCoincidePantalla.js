import { useEffect, useState } from 'react'

/** La de Tailwind `lg:`: desde ese ancho la app muestra tablas en vez de tarjetas. */
export const PANTALLA_LG = '(min-width: 1024px)'

const leer = (consulta) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(consulta).matches
    : null

/**
 * Si la pantalla cumple `consulta` (true o false), o null si el navegador no
 * sabe decirlo.
 *
 * Sirve para dibujar SOLO la vista que se ve, tarjetas en el celular y tabla en
 * escritorio: esconder una con CSS igual la dibuja, y con listas grandes eso
 * duplica el trabajo en cada tecla (Productos, 15/09/2026). Con null conviene
 * dibujar las dos, como antes.
 */
export function useCoincidePantalla(consulta) {
  const [coincide, setCoincide] = useState(() => leer(consulta))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(consulta)
    const alCambiar = () => setCoincide(mq.matches)
    alCambiar()
    // addListener: WebView viejos sin addEventListener en MediaQueryList.
    if (mq.addEventListener) mq.addEventListener('change', alCambiar)
    else if (mq.addListener) mq.addListener(alCambiar)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', alCambiar)
      else if (mq.removeListener) mq.removeListener(alCambiar)
    }
  }, [consulta])

  return coincide
}
