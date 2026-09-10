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
