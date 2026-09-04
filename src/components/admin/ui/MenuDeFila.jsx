import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * El menú "⋯" de una fila o de una tarjeta.
 *
 * Vive suelto (position: fixed) y no dentro de la fila, porque una tabla con
 * `overflow` recorta cualquier cosa que se salga de ella y el menú quedaría
 * cortado a la mitad.
 *
 * Al abrirse se coloca DEBAJO del botón y después se MIDE para encajarlo en la
 * pantalla. Antes el alto estaba escrito a mano —470 px— y no coincidía con el
 * menú real: en una laptop se abría medio afuera y quedaba cortado. Si no entra
 * abajo, sube; nunca se sale por arriba; y si aun así no cabe, se desplaza por
 * dentro.
 *
 * Se usa en Usuarios y en Resellers. Cualquier arreglo de posición va acá y
 * sirve para los dos.
 */

const ANCHO = 232 // tiene que coincidir con el w-[232px] de CajaMenu

export function useMenuDeFila() {
  const [abiertoEn, setAbiertoEn] = useState(null)
  const [posicion, setPosicion] = useState({ top: 0, left: 0 })
  const disparador = useRef(null)
  const menu = useRef(null)

  const calcular = el => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    // Fuera de la vista: no tiene sentido colocar un menú que nadie ve.
    if (r.bottom < 0 || r.top > window.innerHeight) return null
    return { top: r.bottom + 4, left: Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8)) }
  }

  useLayoutEffect(() => {
    if (!abiertoEn || !menu.current) return
    const alto = menu.current.offsetHeight
    setPosicion(pos => {
      const top = Math.max(8, Math.min(pos.top, window.innerHeight - alto - 8))
      return top === pos.top ? pos : { ...pos, top }
    })
  }, [abiertoEn])

  // Al desplazar o cambiar de tamaño, el menú sigue a su botón; si el botón se
  // fue de la pantalla, el menú se cierra en vez de quedar flotando suelto.
  useEffect(() => {
    if (!abiertoEn) return undefined
    const recolocar = () => {
      const pos = calcular(disparador.current)
      if (!pos) { setAbiertoEn(null); disparador.current = null; return }
      setPosicion(pos)
    }
    // capture: true para captar también el scroll de contenedores internos.
    window.addEventListener('scroll', recolocar, true)
    window.addEventListener('resize', recolocar)
    return () => {
      window.removeEventListener('scroll', recolocar, true)
      window.removeEventListener('resize', recolocar)
    }
  }, [abiertoEn])

  const alternar = (id, el) => {
    if (abiertoEn === id) { setAbiertoEn(null); disparador.current = null; return }
    const pos = calcular(el)
    if (!pos) return
    disparador.current = el
    setPosicion(pos)
    setAbiertoEn(id)
  }

  const cerrar = () => { setAbiertoEn(null); disparador.current = null }

  return { abiertoEn, posicion, alternar, cerrar, refMenu: menu }
}

/** El botón de tres puntos que lo abre. */
export function BotonDeFila({ onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(e.currentTarget) }}
      className={`h-7 w-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900 text-[16px] leading-none ${className}`}
      title="Acciones"
      aria-label="Acciones"
    >
      ⋯
    </button>
  )
}

/** El recuadro del menú. Recibe la posición y el ref del hook. */
export function CajaMenu({ posicion, refMenu, children }) {
  return (
    <div
      ref={refMenu}
      className="fixed w-[232px] max-h-[calc(100vh-16px)] overflow-y-auto overflow-x-hidden overscroll-contain whitespace-normal bg-white rounded-md border border-gray-200 shadow-md py-1 z-50 text-left"
      style={{ top: posicion.top, left: posicion.left }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

export function ItemMenu({ rojo = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-1.5 text-left text-[12.5px] leading-snug whitespace-normal break-words hover:bg-gray-50 ${rojo ? 'text-red-600' : 'text-gray-700'}`}
    >
      {children}
    </button>
  )
}

export function SeparadorMenu() {
  return <div className="border-t border-gray-100 my-1" />
}
