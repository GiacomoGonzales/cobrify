/**
 * PREFIJO DE RUTA según dónde se está parado.
 *
 * El sistema vive bajo varios prefijos: `/app` para una cuenta real y un
 * `/demo*` distinto por cada demo. Cada pantalla que arma un link interno
 * necesita el prefijo correcto, y esa lógica estaba COPIADA en el Sidebar, en
 * el Dashboard y en Mesas.
 *
 * La copia se notó cuando llegaron los demos por rubro: el Sidebar aprendió a
 * llevar el rubro en el link, el Dashboard no, y el botón "Punto de Venta" del
 * tablero sacaba al visitante de /demo/ferreteria y lo mandaba al demo
 * genérico. Un solo lugar, un solo criterio.
 */

import { SLUGS_DEMO } from '@/data/demo/rubros'

/** Demos con prefijo propio (los que existían antes de los rubros). */
const PREFIJOS_PROPIOS = [
  '/demorestaurant',
  '/demopharmacy',
  '/demohotel',
  '/demoveterinary',
  '/demologistics',
]

/**
 * Prefijo con el que hay que armar los links internos.
 *
 * @param {string} pathname - location.pathname
 * @param {boolean} enDemo  - isDemoMode
 * @returns {string} '/app' | '/demo' | '/demo/{rubro}' | '/demorestaurant' | ...
 */
export function prefijoDeRuta(pathname, enDemo) {
  if (!enDemo) return '/app'
  const ruta = String(pathname || '')

  const propio = PREFIJOS_PROPIOS.find((p) => ruta.startsWith(p))
  if (propio) return propio

  // Demo por rubro: el rubro tiene que viajar en TODOS los links o al primer
  // clic el visitante cae en el demo genérico y ve el catálogo de otro rubro.
  const porRubro = ruta.match(/^\/demo\/([a-z0-9-]+)(?:\/|$)/)
  if (porRubro && SLUGS_DEMO.includes(porRubro[1])) return `/demo/${porRubro[1]}`

  return '/demo'
}

/** El rubro del demo actual, o null si es el genérico / una cuenta real. */
export function rubroDeRuta(pathname) {
  const porRubro = String(pathname || '').match(/^\/demo\/([a-z0-9-]+)(?:\/|$)/)
  return porRubro && SLUGS_DEMO.includes(porRubro[1]) ? porRubro[1] : null
}
