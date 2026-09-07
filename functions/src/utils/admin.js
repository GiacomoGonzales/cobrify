/**
 * ¿Quién es administrador de Cobrify?
 *
 * ÚNICO criterio del sistema. Estaba escrito de dos maneras distintas en quince
 * sitios de `index.js`: la mayoría preguntaba solo si existe el documento en
 * `admins`, y dos exigían además `isAdmin === true`.
 *
 * Eso no era un matiz. El documento del único admin tenía `role: 'admin'` pero
 * NO tenía `isAdmin`, así que las funciones del segundo grupo —entre ellas la
 * rama de `sendInvoiceToSunat` que deja a soporte reenviar un comprobante en
 * nombre de un negocio— le respondían 403 al admin de verdad. Un permiso que se
 * creía tener y no se tenía, sin ningún error a la vista hasta que alguien lo
 * necesitó (7-set-2026).
 *
 * Gana el criterio de la mayoría: **estar en `admins` ES ser administrador**.
 * Esa colección solo se escribe desde la consola, así que figurar ahí ya es la
 * autorización; el flag no agregaba seguridad, agregaba una segunda verdad.
 *
 * Se respeta un `isAdmin: false` explícito, que es lo único que ese campo
 * aportaba: desactivar a alguien sin borrarle el documento. Un `isAdmin`
 * ausente NO desactiva a nadie — ese fue exactamente el defecto.
 */

/**
 * Decide sobre un documento ya leído de `admins`. Es la parte con criterio, y
 * por eso está separada de la lectura: así se puede probar sin Firestore.
 *
 * @param {{exists: boolean, data: () => object}|null} doc
 */
export function esAdminSegunDoc(doc) {
  if (!doc || !doc.exists) return false
  const datos = typeof doc.data === 'function' ? doc.data() : null
  return datos?.isAdmin !== false
}
