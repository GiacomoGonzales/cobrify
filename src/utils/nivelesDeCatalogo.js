/**
 * Cómo se le ofrecen al comprador los niveles de precio en el catálogo.
 *
 * Hay DOS modos y los decide el producto, con el mismo interruptor que ya manda
 * en el mostrador ("Aplicar precio automático según cantidad"):
 *
 *  - **Automático** (`useAutoPriceByQty`): el precio baja SOLO cuando la
 *    cantidad alcanza el mínimo. La lista de niveles se muestra como
 *    referencia, no se elige. Es lo que el propio formulario promete: "el
 *    precio cambia solo cuando el cliente alcanza la cantidad mínima".
 *  - **Manual**: el comprador elige el nivel, como se comportó siempre el
 *    catálogo. Hay tiendas vivas que lo usan así.
 *
 * Hasta el 9-set-2026 el catálogo ignoraba el interruptor y SIEMPRE mostraba el
 * selector manual: quien lo activaba veía tres precios para elegir en vez de un
 * precio que baja al llevar más, y reportaba que "la cantidad mínima no
 * funciona" (Medias de Abejita, con 6 y 50 bien configurados).
 */
import { getCatalogMinQty } from '@/lib/utils'

/** Con el interruptor puesto, el precio lo decide la cantidad, no el comprador. */
export const precioAutomaticoPorCantidad = (producto) => producto?.useAutoPriceByQty === true

/**
 * Los niveles tal como hay que pintarlos, con su mínimo y cuál está aplicando.
 *
 * @param {object} p
 * @param {object} p.producto
 * @param {object} p.business
 * @param {Array}  p.precios       lo que devuelve getProductPrices/getVariantPrices
 * @param {number} p.cantidad      la cantidad elegida ahora
 * @param {string} [p.nivelElegido] solo cuenta en modo manual
 * @returns {{ automatico: boolean, niveles: Array, claveAplicando: string }}
 */
export function nivelesParaMostrar({ producto, business, precios = [], cantidad = 0, nivelElegido = null }) {
  const automatico = precioAutomaticoPorCantidad(producto)

  const conMinimo = (precios || []).map((p) => {
    const min = p.key === 'price1' ? 1 : getCatalogMinQty(business, p.key, producto)
    return {
      ...p,
      min,
      // price1 siempre está disponible; los demás, solo con su mínimo cumplido.
      alcanzado: p.key === 'price1' || (min > 1 && cantidad >= min),
    }
  })

  let claveAplicando = 'price1'
  if (automatico) {
    // El más barato de los que la cantidad ya alcanzó.
    const alcanzados = conMinimo
      .filter((p) => p.key !== 'price1' && p.alcanzado)
      .sort((a, b) => a.value - b.value)
    claveAplicando = alcanzados[0]?.key || 'price1'
  } else {
    claveAplicando = nivelElegido || conMinimo[0]?.key || 'price1'
  }

  return {
    automatico,
    claveAplicando,
    niveles: conMinimo.map((p) => ({ ...p, aplicando: p.key === claveAplicando })),
  }
}

/**
 * Cuánto falta para el siguiente nivel más barato, para poder decírselo:
 * "Lleva 5 más y pagas S/ 0.20 cada una". Sin esto el comprador no tiene forma
 * de saber que existe un precio mejor a la vuelta.
 *
 * @returns {{ faltan: number, nivel: object }|null}
 */
export function faltanParaElSiguiente({ niveles = [], cantidad = 0 }) {
  const pendientes = (niveles || [])
    .filter((n) => n.key !== 'price1' && n.min > 1 && cantidad < n.min)
    .sort((a, b) => a.min - b.min)
  const siguiente = pendientes[0]
  if (!siguiente) return null
  return { faltan: siguiente.min - cantidad, nivel: siguiente }
}
