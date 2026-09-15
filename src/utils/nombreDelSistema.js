/**
 * Cómo se llama el sistema para quien lo está usando.
 *
 * Un cliente de reseller usa el sistema con la marca de su proveedor, y ver
 * "Cobrify" en un aviso lo confunde (Eztienda, 15/09/2026: el "Actualizar
 * Cobrify" del menú lateral les salía a todos sus clientes). La marca la
 * resuelve BrandingContext; acá queda escrita una sola vez la regla de qué
 * nombre mostrar, para el título de la pestaña y para los avisos.
 *
 * Sin imports a propósito: se prueba en Node tal cual.
 */

export const NOMBRE_COBRIFY = 'Cobrify'

/** El nombre de la marca del reseller, o "Cobrify" si no hay una propia. */
export function nombreDelSistema(branding) {
  const nombre = String(branding?.companyName || '').trim()
  return nombre && nombre !== NOMBRE_COBRIFY ? nombre : NOMBRE_COBRIFY
}

/** ¿El usuario ve el sistema con una marca que no es Cobrify? */
export function esMarcaPropia(branding) {
  return nombreDelSistema(branding) !== NOMBRE_COBRIFY
}
