/**
 * EL IGV EN LA PRECUENTA: una sola regla para los siete lugares que la
 * imprimen (web, ticketera por el plugin, por red y dividida, Bluetooth
 * normal y dividida, y la web dividida).
 *
 * Pedido de un cliente (10-set-2026): una opción para que la precuenta no
 * muestre el IGV. La precuenta no tiene valor tributario; el comprobante que
 * se emite al cobrar sigue saliendo con su IGV como siempre.
 */

/**
 * Qué dice la precuenta sobre el IGV:
 *   'desglose'  -> SUBTOTAL (sin IGV) e IGV (18%), como siempre
 *   'exonerada' -> el aviso "Empresa exonerada de IGV"
 *   'nada'      -> ninguna línea de IGV (opción "Ocultar el IGV en la precuenta")
 */
export const bloqueDeIgvEnPrecuenta = (taxConfig) => {
  if (taxConfig?.ocultarIgv === true) return 'nada'
  return taxConfig?.igvExempt ? 'exonerada' : 'desglose'
}

/**
 * La configuración de impuestos que reciben los impresores de la precuenta,
 * leída del documento del negocio. Estaba copiada en Mesas (cuatro veces) y en
 * Órdenes; ahora sale de acá.
 */
export const configDeImpuestosDePrecuenta = (negocio) => ({
  igvRate: negocio?.emissionConfig?.taxConfig?.igvRate ?? 18,
  igvExempt: negocio?.emissionConfig?.taxConfig?.igvExempt ?? false,
  ocultarIgv: negocio?.restaurantConfig?.ocultarIgvEnPrecuenta === true,
})
