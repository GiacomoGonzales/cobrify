/**
 * MASONRY: cada tarjeta sube hasta donde termina la de arriba, no hasta donde
 * termina la fila.
 *
 * En un grid normal todas las tarjetas de una fila ocupan la altura de la mas
 * alta. Con `items-start` dejan de estirarse por dentro, pero el hueco no
 * desaparece: se pasa al espacio ENTRE filas, porque las filas siguen
 * alineadas. Una orden de dos productos deja medio cuerpo en blanco debajo si
 * la de al lado trae ocho.
 *
 * ── Por que no `columns-*` ──────────────────────────────────────────────────
 * CSS multicolumna hace esto en una linea, pero rompe dos cosas:
 *   - los desplegables `position: absolute` dentro de las tarjetas (el menu
 *     "+" de una orden) se recortan o se apilan mal entre columnas;
 *   - el orden de lectura pasa a ser vertical —bajas la primera columna entera
 *     antes de saltar a la segunda—, y en una lista ordenada por tiempo de
 *     espera eso confunde.
 *
 * ── Como funciona ───────────────────────────────────────────────────────────
 * El grid se queda igual; se le dan filas de 1px y se le quita la separacion
 * vertical. Cada tarjeta declara cuantas de esas filas ocupa —tantas como
 * pixeles mide— con `grid-row-end: span N`. Como cada una ocupa exactamente lo
 * suyo, la siguiente arranca donde termina la de arriba EN SU COLUMNA. El
 * orden de colocacion no cambia: sigue siendo izquierda a derecha.
 *
 * La separacion visual la pone un `margin-bottom` en la tarjeta y no
 * `row-gap`, porque con `row-gap` la unidad minima seria fila+hueco y
 * sobrarian hasta 16px por tarjeta, que es justo lo que se queria quitar.
 *
 * Requiere `items-start` en el grid: sin eso la tarjeta se estira hasta el
 * span que le acabamos de poner y la medicion de la pasada siguiente sale mal.
 */
import { useCallback, useLayoutEffect, useRef } from 'react'

/** Alto de la fila del grid. 1px = el span sale exacto, sin redondeo visible. */
const ALTO_DE_FILA = 1

/** La separacion entre tarjetas. 16px es el `gap-4` de Tailwind. */
const SEPARACION = 16

/**
 * Cuantas filas del grid ocupa una tarjeta de `alto` pixeles.
 *
 * Se suma la separacion porque el hueco hacia la de abajo sale del margen de
 * esta, no del `row-gap` del grid.
 */
export function filasQueOcupa(alto, separacion = SEPARACION, altoDeFila = ALTO_DE_FILA) {
  const total = Math.max(0, Number(alto) || 0) + separacion
  return Math.max(1, Math.ceil(total / altoDeFila))
}

/**
 * @param {object} [opciones]
 * @param {number} [opciones.separacion=16] Separacion entre tarjetas, en px.
 * @returns {{ contenedorRef: React.RefObject, acomodar: () => void }}
 */
export function useMasonry({ separacion = SEPARACION } = {}) {
  const contenedorRef = useRef(null)

  const acomodar = useCallback(() => {
    const cont = contenedorRef.current
    if (!cont) return

    const hijos = Array.from(cont.children)

    // Con una sola columna no hay nada que escalonar: las tarjetas ya van una
    // debajo de otra. Se devuelve el grid a como estaba en el CSS para que la
    // separacion la siga poniendo `gap-4` y no queden estilos colgados.
    const columnas = getComputedStyle(cont)
      .gridTemplateColumns
      .split(' ')
      .filter(Boolean)
      .length

    if (columnas < 2) {
      cont.style.gridAutoRows = ''
      cont.style.rowGap = ''
      hijos.forEach(hijo => {
        hijo.style.gridRowEnd = ''
        hijo.style.marginBottom = ''
      })
      return
    }

    cont.style.gridAutoRows = `${ALTO_DE_FILA}px`
    cont.style.rowGap = '0px'

    hijos.forEach(hijo => {
      hijo.style.marginBottom = `${separacion}px`
      // El margen no entra en `getBoundingClientRect`, y con `items-start` el
      // grid no estira la tarjeta: la medida no depende del span que le
      // pusimos en la pasada anterior, asi que esto no se realimenta.
      const alto = hijo.getBoundingClientRect().height
      hijo.style.gridRowEnd = `span ${filasQueOcupa(alto, separacion)}`
    })
  }, [separacion])

  useLayoutEffect(() => {
    const cont = contenedorRef.current
    if (!cont) return

    acomodar()

    // WebView viejo: sin ResizeObserver se acomoda una vez y listo. Peor que
    // nada seria dejar el grid con filas de 1px y sin spans.
    if (typeof ResizeObserver === 'undefined') return

    let pedido = 0
    const pedir = () => {
      if (pedido) return
      pedido = requestAnimationFrame(() => {
        pedido = 0
        acomodar()
      })
    }

    // El contenedor por el ancho (cambio de columnas, sidebar que se pliega) y
    // cada tarjeta por su alto: una orden gana un producto, o el usuario sube
    // el tamano de la interfaz y todo crece.
    const ro = new ResizeObserver(pedir)
    ro.observe(cont)
    const observarTarjetas = () => {
      for (const hijo of cont.children) ro.observe(hijo)
    }
    observarTarjetas()

    // Las tarjetas entran y salen solas: una orden nueva llega por el listener
    // en vivo, otra se cierra y desaparece.
    const mo = new MutationObserver(() => {
      observarTarjetas()
      pedir()
    })
    mo.observe(cont, { childList: true })

    return () => {
      if (pedido) cancelAnimationFrame(pedido)
      ro.disconnect()
      mo.disconnect()
    }
  }, [acomodar])

  return { contenedorRef, acomodar }
}
