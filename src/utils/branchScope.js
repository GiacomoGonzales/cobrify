/**
 * A qué local pertenece un registro, según el selector de sucursal del header.
 *
 * El selector maneja tres valores: `'all'` (todas), `'main'` (la Principal) o
 * el id de una sucursal. La regla que se repite en todo el sistema —y que acá
 * queda escrita una sola vez— es que **un registro SIN sucursal es de la
 * Principal**: hasta que cada módulo empezó a guardar `branchId`, todo se
 * grabó sin él. Si "sin sucursal" no contara como Principal, el histórico
 * entero desaparecería de pantalla el día que se activa el filtro.
 *
 * Por eso también se filtra en memoria y no con un `where` de Firestore:
 * Firestore no indexa los documentos a los que les falta el campo, así que
 * `where('branchId','==','main')` dejaría fuera para siempre todo lo viejo.
 */

/** ¿Este registro se ve con el alcance elegido? */
export function esDeSucursal(registro, alcance) {
  const scope = alcance || 'all'
  if (scope === 'all') return true
  const suya = registro?.branchId
  if (scope === 'main') return !suya || suya === 'main'
  return suya === scope
}

/** El mismo criterio sobre una lista. */
export function filtrarPorSucursal(registros, alcance) {
  const scope = alcance || 'all'
  if (scope === 'all') return registros || []
  return (registros || []).filter(r => esDeSucursal(r, scope))
}

/**
 * A qué sucursal se guarda lo que se cree ahora mismo.
 *
 * Con el selector en "Todas" no hay una respuesta obvia, y ahí es donde se
 * cuelan los registros en el local equivocado: se devuelve `''` (Principal) y
 * la pantalla que necesite precisión debe preguntarle al usuario.
 */
export function sucursalParaGuardar(alcance) {
  const scope = alcance || 'all'
  return scope === 'all' || scope === 'main' ? '' : scope
}

/** Nombre legible de la sucursal de un registro, para mostrarlo en la lista. */
export function nombreDeSucursal(branchId, branches = [], nombrePrincipal = 'Principal') {
  if (!branchId || branchId === 'main') return nombrePrincipal
  const b = (branches || []).find(x => x.id === branchId)
  return b?.name || nombrePrincipal
}
