/**
 * Quién pone el título y el ícono de la pestaña.
 *
 * BrandingContext los pone en cada cambio de ruta y solo sabe apartarse en
 * /catalogo/ y /menu/. Pero con dominio propio (citex.pe) la tienda vive en
 * "/", "/tienda", "/legal/..." y "/reclamos": al pasar de una página a otra,
 * su efecto corría DESPUÉS del de la tienda y volvía a poner el título y el
 * ícono de Cobrify (reporte de CITEX, 15-set-2026).
 *
 * Mientras la tienda esté en pantalla lo anota aquí (LandingRouter), y
 * BrandingContext no toca la pestaña. Es un contador y no un sí/no para que el
 * montaje que llega y el que se va no se pisen.
 */
let tomas = 0

/** La tienda toma la pestaña; devuelve con qué soltarla (sirve de limpieza de un efecto). */
export function tomarLaPestana() {
  tomas += 1
  let suelta = false
  return () => {
    if (suelta) return
    suelta = true
    tomas = Math.max(0, tomas - 1)
  }
}

/** ¿La pestaña es de una tienda ahora mismo? */
export const pestanaDeLaTienda = () => tomas > 0
