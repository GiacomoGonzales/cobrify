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

/**
 * El criterio sobre un id de sucursal SUELTO, para cuando el dato no viene en un
 * registro: la sede de un movimiento se deduce de su almacén, por ejemplo.
 */
export function sedeCoincide(branchId, alcance) {
  const scope = alcance || 'all'
  if (scope === 'all') return true
  if (scope === 'main') return !branchId || branchId === 'main'
  return branchId === scope
}

/** ¿Este registro se ve con el alcance elegido? */
export function esDeSucursal(registro, alcance) {
  return sedeCoincide(registro?.branchId, alcance)
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

/**
 * Con qué sucursal debe ABRIR un formulario que crea un documento.
 *
 * Manda la sede del selector del header: si el usuario está parado en "Sede
 * Norte", lo que emita ahí nace en Sede Norte y no en la Principal. Es lo que
 * ya hacía el POS y le faltaba a los demás formularios.
 *
 * Con el selector en "Todas" no hay respuesta obvia (misma razón que
 * `sucursalParaGuardar`), así que cae en la Principal — o en la primera
 * permitida, si el usuario no puede usar la Principal.
 *
 * @param activeBranchId  el del header ya resuelto: un id real, o null para
 *                        "Todas"/Principal
 * @param sucursalesAccesibles  las que el usuario puede usar (ya filtradas)
 * @returns la sucursal elegida, o null = Principal. El formulario deja su
 *          selector visible para corregirla.
 */
export function sucursalInicial(activeBranchId, sucursalesAccesibles, hasMainBranchAccess) {
  const lista = sucursalesAccesibles || []
  const delHeader = activeBranchId ? lista.find(b => b.id === activeBranchId) : null
  if (delHeader) return delHeader
  // Sin acceso a la Principal, el documento no puede nacer ahí.
  if (hasMainBranchAccess === false && lista.length > 0) return lista[0]
  return null
}

/** Nombre legible de la sucursal de un registro, para mostrarlo en la lista. */
export function nombreDeSucursal(branchId, branches = [], nombrePrincipal = 'Principal') {
  if (!branchId || branchId === 'main') return nombrePrincipal
  const b = (branches || []).find(x => x.id === branchId)
  return b?.name || nombrePrincipal
}
