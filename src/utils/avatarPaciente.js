/**
 * Qué se muestra en el círculo del paciente: su foto si la tiene, y si no,
 * sus iniciales. Lo leen la ficha y la lista, para que las dos decidan igual.
 *
 * Pedido de Adara (9-set-2026): poder tomarle una foto al paciente y verla en
 * su ficha en vez de la letra.
 */

/** Las dos primeras iniciales del nombre; "?" si no hay nombre. */
export const iniciales = (nombre) =>
  String(nombre || '').trim().split(/\s+/).slice(0, 2).map(p => (p[0] || '').toUpperCase()).join('') || '?'

/**
 * @returns {{ tipo: 'foto', url: string } | { tipo: 'iniciales', texto: string }}
 */
export function fuenteDeAvatar(customer) {
  const url = String(customer?.photoUrl || '').trim()
  if (/^https?:\/\//.test(url)) return { tipo: 'foto', url }
  return { tipo: 'iniciales', texto: iniciales(customer?.name) }
}
