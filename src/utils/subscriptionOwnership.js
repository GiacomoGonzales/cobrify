/**
 * ¿De quién es esta cuenta? Un solo criterio para toda la app.
 *
 * Una suscripción puede venir por tres caminos:
 *   - reseller: la creó un reseller de marca blanca (`createdByReseller`/`resellerId`)
 *   - vendedor: el admin se la asignó a un vendedor (`vendedorId`, sistema legacy)
 *   - directo:  cliente de Cobrify, sin intermediario
 *
 * Todo sale del propio documento de suscripción, sin llamadas asíncronas: una
 * pantalla que decide con esto no parpadea mostrando lo que debe ocultar.
 */

export const ORIGEN_RESELLER = 'reseller'
export const ORIGEN_VENDEDOR = 'vendedor'
export const ORIGEN_DIRECTO = 'directo'

export const origenDeCuenta = (subscription) => {
  if (!subscription) return ORIGEN_DIRECTO
  // El reseller manda sobre el vendedor: si una cuenta tiene los dos, la marca
  // que el cliente ve es la del reseller.
  if (subscription.createdByReseller || subscription.resellerId) return ORIGEN_RESELLER
  if (subscription.vendedorId) return ORIGEN_VENDEDOR
  return ORIGEN_DIRECTO
}

/** La cuenta le pertenece a un intermediario (reseller o vendedor). */
export const esCuentaDeIntermediario = (subscription) =>
  origenDeCuenta(subscription) !== ORIGEN_DIRECTO

/**
 * ¿Se le muestra al cliente el historial de pagos de su suscripción?
 *
 * NO cuando la cuenta es de un intermediario. Lo que hay en `paymentHistory` es
 * lo que Cobrify le cobró al INTERMEDIARIO, no lo que el intermediario le cobró
 * a su cliente: mostrárselo le revela el precio de compra de su proveedor
 * (reporte de un vendedor, 02-sep-2026, con S/ 19.90 a la vista de su cliente).
 *
 * El intermediario sí ve el suyo: su propia cuenta no tiene resellerId ni
 * vendedorId apuntándolo. `esElVendedorDeLaCuenta` cubre el caso en que el
 * admin le asignó su propia cuenta a su ficha de vendedor.
 */
export const puedeVerHistorialDePagos = (subscription, { esElVendedorDeLaCuenta = false } = {}) =>
  esElVendedorDeLaCuenta || !esCuentaDeIntermediario(subscription)
