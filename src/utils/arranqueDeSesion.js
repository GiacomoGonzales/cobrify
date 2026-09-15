/**
 * DE QUÉ NEGOCIO Y DE QUÉ PLAN HABLA EL ARRANQUE.
 *
 * Al iniciar sesión, AuthContext tiene que leer el plan, el negocio y las
 * sucursales. De quién depende del rol:
 *  - dueño o super admin: todo cuelga de su propio uid;
 *  - sub-usuario: el negocio y el plan son los de su dueño (`ownerId`);
 *  - alguien sin ficha (registro a medias, comprador del catálogo): su propio
 *    uid, y más abajo se decide qué hacer con él.
 *
 * La decisión vive aparte para poder probarla sin React, y porque de ella
 * depende un atajo: para un dueño las tres lecturas se piden POR ADELANTADO,
 * junto con las preguntas de rol, y `esElPropio` dice si eso sirvió o hay que
 * pedirlas de nuevo con el ownerId.
 */
export function idsDelNegocio({ uid, superAdminStatus = false, businessOwnerStatus = false, subUserOwnerId = null }) {
  const idDelNegocio = (businessOwnerStatus || superAdminStatus) ? uid : (subUserOwnerId || uid)
  const idParaElPlan = subUserOwnerId || uid
  return { idDelNegocio, idParaElPlan, esElPropio: idDelNegocio === uid && idParaElPlan === uid }
}
