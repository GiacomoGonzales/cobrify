/**
 * SUCURSALES DE UN VENDEDOR.
 *
 * Antes el vendedor tenía un `branchId` único: o trabajaba en una sucursal, o
 * el campo iba vacío y eso significaba "Sucursal Principal" (no "todas"). Con
 * ese modelo no había forma de que alguien atendiera en dos locales, que es lo
 * normal en negocios chicos.
 *
 * Ahora se guarda `branchIds`, un arreglo donde cada elemento es el id de una
 * sucursal o la constante PRINCIPAL para la sede sin id propio.
 *
 * COMPATIBILIDAD: los vendedores que ya existen no tienen `branchIds`. Para
 * ellos se deriva del `branchId` de siempre, así que siguen apareciendo
 * exactamente donde aparecían.
 */

/** La sede principal no tiene documento propio: se la nombra con esta clave. */
export const PRINCIPAL = 'main'

/** Normaliza null/'' /undefined a la clave de la Principal. */
export const claveDeSucursal = (branchId) => branchId || PRINCIPAL

/**
 * Sucursales en las que trabaja el vendedor, como arreglo de claves.
 * Nunca devuelve vacío: sin nada configurado, es la Principal.
 */
export function sucursalesDelVendedor(seller) {
  const lista = seller?.branchIds
  if (Array.isArray(lista) && lista.length > 0) return lista.map(claveDeSucursal)
  return [claveDeSucursal(seller?.branchId)]
}

/** ¿Este vendedor atiende en esta sucursal? `branchId` null = Principal. */
export function vendedorEnSucursal(seller, branchId) {
  return sucursalesDelVendedor(seller).includes(claveDeSucursal(branchId))
}

/** Filtra la lista de vendedores por la sucursal activa. */
export function vendedoresDeSucursal(sellers, branchId) {
  return (sellers || []).filter((s) => vendedorEnSucursal(s, branchId))
}

/**
 * Texto para mostrar las sucursales de un vendedor.
 *
 * @param {object} seller
 * @param {Array}  branches - sucursales del negocio [{id, name}]
 * @param {string} [nombrePrincipal]
 */
export function etiquetaSucursales(seller, branches, nombrePrincipal = 'Principal') {
  const nombres = sucursalesDelVendedor(seller).map((clave) => (
    clave === PRINCIPAL
      ? nombrePrincipal
      : (branches || []).find((b) => b.id === clave)?.name || 'Sucursal'
  ))
  if (nombres.length <= 2) return nombres.join(' · ')
  return `${nombres.slice(0, 2).join(' · ')} +${nombres.length - 2}`
}

/**
 * Campos a guardar. Se sigue escribiendo `branchId` cuando hay UNA sola
 * sucursal para que cualquier lector viejo que quede siga funcionando; con
 * varias se vacía, porque ningún valor único sería honesto.
 */
export function camposDeSucursales(claves) {
  const limpias = [...new Set((claves || []).map(claveDeSucursal))]
  const finales = limpias.length > 0 ? limpias : [PRINCIPAL]
  const unica = finales.length === 1 && finales[0] !== PRINCIPAL ? finales[0] : ''
  return { branchIds: finales, branchId: unica }
}
