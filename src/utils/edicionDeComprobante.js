/**
 * ¿Se puede todavía editar este comprobante?
 *
 * Una factura o boleta que ya salió hacia SUNAT no se edita: SUNAT se queda con
 * lo que recibió, y si acá se cambia la cantidad, el sistema y SUNAT dicen
 * cosas distintas sin que nadie lo note hasta que el contador cruza el SIRE.
 *
 * Caso real (JMC, B020-00000045 y B020-00000077, 25-ago-2026): la boleta salió
 * con 1 m³ (S/ 190) y SUNAT la aceptó en un segundo; el servidor se quedó 20
 * segundos más consultando un estado que QPse no da para boletas, y en esa
 * ventana se editó a 3 m³ (S/ 570), porque "Editar documento" solo miraba que no
 * dijera "aceptado". El sistema quedó en 570 y SUNAT en 190.
 *
 * "Ya salió" es: en envío, aceptado, firmado, anulándose, anulado, agotado de
 * reintentos, o pendiente pero con un envío ya intentado (un envío cortado
 * puede haber llegado: los 504 del 17-ago llegaron todos). Lo que queda
 * editable: lo que nunca se intentó mandar y lo que SUNAT rechazó (un
 * rechazado no existe para SUNAT; se corrige y se reenvía con el mismo número).
 *
 * El mismo criterio está en firestore.rules (`comprobanteYaEnviado`): la regla
 * es la que protege también a la app con un bundle viejo.
 */

export const ESTADOS_YA_ENVIADOS = ['sending', 'accepted', 'signed', 'SIGNED', 'voiding', 'voided', 'failed_permanent']

export function comprobanteYaEnviado(comprobante) {
  const estado = comprobante?.sunatStatus || ''
  if (ESTADOS_YA_ENVIADOS.includes(estado)) return true
  return estado === 'pending' && Boolean(comprobante?.sunatSentAt)
}

export function motivoParaNoEditar(comprobante) {
  const numero = comprobante?.number ? `La ${comprobante.number}` : 'Este comprobante'
  return `${numero} ya se envió a SUNAT, y SUNAT se queda con lo que recibió: si se edita acá, el sistema y SUNAT dirían montos distintos. Para corregirla emite una nota de crédito o de débito.`
}

/**
 * LO QUE UNA EDICIÓN NO CAMBIA.
 *
 * Editar una venta corrige sus líneas o sus pagos, pero no cambia QUIÉN la hizo
 * ni DÓNDE: sigue siendo de quien la registró, de su sucursal y del almacén de
 * donde salió la mercadería. El POS rearma el comprobante entero al guardar y
 * esos datos salían de quien estaba editando: la dueña del negocio editaba una
 * nota de su vendedora y la nota pasaba a ser suya. Con "Cada usuario ve solo
 * sus ventas" la vendedora dejaba de verla, y se le iba de su caja (ACEROS
 * RAMOS, NG11-00000034, 12-set-2026). Quién editó queda en `updatedBy`.
 *
 * @param {object} original el comprobante como estaba antes de editar
 * @param {{conVendedor?: boolean}} [opciones] conVendedor: quien edita eligió un
 *   vendedor en la pantalla; si no eligió, se conserva el de la venta (y su comisión)
 * @returns {object} los campos del original que se vuelven a escribir tal cual
 */
export function loQueNoCambiaAlEditar(original, { conVendedor = false } = {}) {
  if (!original) return {}
  const copiar = (nombres) => Object.fromEntries(
    nombres.filter((n) => n in original).map((n) => [n, original[n] ?? null])
  )
  return {
    ...copiar(['createdBy', 'createdByName', 'createdByEmail']),
    ...('branchId' in original
      ? copiar(['branchId', 'branchName', 'branchTradeName', 'branchLogoUrl', 'branchAddress', 'branchPhone'])
      : {}),
    // Sin almacén guardado queda el elegido en pantalla: de ahí mueve el stock la edición.
    ...(original.warehouseId ? copiar(['warehouseId', 'warehouseName', 'warehouseAddress', 'warehousePhone']) : {}),
    ...(!conVendedor && original.sellerId ? copiar(['sellerId', 'sellerName', 'sellerCode', 'commission']) : {}),
  }
}
