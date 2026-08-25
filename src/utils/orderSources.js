/**
 * Fuentes de órdenes: de dónde llegó el pedido (mostrador, WhatsApp, Rappi…).
 *
 * Estaban escritas a mano dentro de CreateOrderModal, así que un negocio que
 * no trabaja con Glovo lo veía igual, y uno que vende por Instagram o TikTok
 * no tenía dónde ponerlo. Ahora la lista se arma acá y el negocio la ajusta
 * desde Configuración.
 *
 * ── Por qué agregar y quitar es seguro ───────────────────────────────────────
 * La orden guarda la ETIQUETA de la fuente ("Rappi"), no un código. O sea que
 * es texto congelado en el momento de crearla: ocultar una fuente o borrar una
 * propia NO altera las órdenes ya registradas ni sus reportes. Es la misma
 * razón por la que quitar un método de pago tampoco toca las ventas viejas.
 */

/**
 * Las de fábrica. `key` identifica para ocultar (no viaja a la orden).
 * `fixed: true` = no se puede ocultar: sin ninguna fuente visible no se podría
 * crear una orden, y Mostrador es la que todo restaurante usa.
 */
export const BUILTIN_ORDER_SOURCES = [
  { key: 'counter', label: 'Mostrador', fixed: true },
  { key: 'phone', label: 'Teléfono' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'rappi', label: 'Rappi' },
  { key: 'pedidosya', label: 'PedidosYa' },
  { key: 'uber_eats', label: 'Uber Eats' },
  { key: 'glovo', label: 'Glovo' },
  { key: 'web', label: 'Página Web' },
  { key: 'other', label: 'Otro' },
]

/**
 * Lista final para el selector: las de fábrica que el negocio no ocultó, más
 * las propias. Devuelve [{ value, label }] listo para el <Select>.
 *
 * @param {string[]} ocultas  claves de fábrica ocultadas (hiddenOrderSources)
 * @param {Array}    propias  [{ id, name }] (customOrderSources)
 */
export function getVisibleOrderSources(ocultas = [], propias = []) {
  const deFabrica = BUILTIN_ORDER_SOURCES
    .filter(s => s.fixed || !ocultas.includes(s.key))
    .map(s => ({ value: s.key, label: s.label }))

  const delNegocio = (propias || [])
    .filter(s => s?.name?.trim())
    .map(s => ({ value: `custom:${s.id}`, label: s.name.trim() }))

  return [...deFabrica, ...delNegocio]
}

/**
 * Etiqueta que se guarda en la orden. Cae al value si la fuente ya no existe
 * (p. ej. una orden vieja que se reabre tras borrar esa fuente propia).
 */
export function getOrderSourceLabel(value, ocultas = [], propias = []) {
  return getVisibleOrderSources(ocultas, propias).find(s => s.value === value)?.label || value
}
