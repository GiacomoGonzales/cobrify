/**
 * Qué ficha de negocio es una CUENTA de verdad.
 *
 * El mismo criterio con que la página de Usuarios del panel arma su lista
 * (`cargarCuentas` en src/services/adminCuentasService.js), puesto en un solo
 * lugar para que el buscador del chat y la limpieza de Mantenimiento cuenten
 * igual:
 *
 *  - tiene plan (`subscriptions/{id}`) y ni el plan ni el usuario son de un
 *    sub-usuario; o
 *  - quedó a medio crear: no tiene plan, pero su usuario es dueño de negocio.
 *
 * Todo lo demás es una ficha SUELTA: de una cuenta que se eliminó (hasta el
 * 11-set-2026 "Eliminar cuenta" borraba el acceso, el usuario y el plan, pero
 * no la ficha), de un sub-usuario o de una prueba. El buscador del chat las
 * ofrecía para vincular conversaciones y en Usuarios no aparecían: buscando
 * "quantio" salían tres en el chat y dos en el panel.
 *
 * Sin dependencias: lo usan el navegador (vía src/data/cuentas.js) y las
 * Cloud Functions.
 */

/**
 * @param {{ plan?: { ownerId?: string | null } | null, usuario?: { ownerId?: string | null, isBusinessOwner?: boolean } | null }} datos
 *   `plan` es el documento subscriptions/{id} y `usuario` el users/{id}, con
 *   el mismo id que la ficha; null si no existen.
 */
export function esCuenta({ plan = null, usuario = null } = {}) {
  if (usuario?.ownerId) return false // sub-usuario: su cuenta es la del dueño
  if (plan) return !plan.ownerId
  return usuario?.isBusinessOwner === true // a medio crear: dueño sin plan
}

/** Por qué una ficha no es cuenta, en palabras, para Mantenimiento. */
export function motivoDeFichaSuelta({ plan = null, usuario = null } = {}) {
  if (usuario?.ownerId || plan?.ownerId) return 'Es de un sub-usuario'
  if (!plan && !usuario) return 'Su cuenta se eliminó'
  return 'Usuario sin plan que no es dueño'
}
