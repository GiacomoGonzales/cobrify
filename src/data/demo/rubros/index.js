/**
 * Catálogo de demos por rubro.
 *
 * Cada entrada del registro es un link que se le puede mandar a un lead:
 * `/demo/ferreteria`, `/demo/ropa`. Un lead de ferretería que entraba al demo
 * genérico veía laptops y cremas y se iba pensando que el sistema no era para
 * su negocio — esto es lo que arregla.
 *
 * Los rubros se cargan BAJO DEMANDA: sin esto, el catálogo de todos los rubros
 * viajaría en el bundle principal para los usuarios que nunca abren un demo.
 */

/** Rubros disponibles, en el orden en que se muestran. */
export const RUBROS_DEMO = [
  {
    slug: 'ferreteria',
    nombre: 'Ferretería',
    descripcion: 'Materiales, herramientas y acabados',
    modo: 'retail',
    cargar: () => import('./ferreteria'),
  },
  {
    slug: 'ropa',
    nombre: 'Tienda de ropa',
    descripcion: 'Variantes de talla y color',
    modo: 'retail',
    cargar: () => import('./ropa'),
  },
]

export const SLUGS_DEMO = RUBROS_DEMO.map((r) => r.slug)

export const esRubroDemo = (slug) => SLUGS_DEMO.includes(String(slug || '').toLowerCase())

export const rubroPorSlug = (slug) =>
  RUBROS_DEMO.find((r) => r.slug === String(slug || '').toLowerCase()) || null

/** Carga la definición del rubro. Devuelve null si el slug no existe. */
export async function cargarRubro(slug) {
  const entrada = rubroPorSlug(slug)
  if (!entrada) return null
  const mod = await entrada.cargar()
  return mod.default || mod
}
