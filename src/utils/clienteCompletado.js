/**
 * De dónde salió un dato del cliente que NO escribió el usuario.
 *
 * Lo usa la emisión masiva: el Excel puede traer solo el RUC o el DNI, y el
 * nombre y la dirección vacíos se completan al subir el archivo (pedido de
 * JMC, 18-set-2026). El buscador marca el origen, el parser lo guarda en
 * `cliente.completado` y la vista previa lo cuenta con estas palabras.
 */

export const ORIGEN = { SUNAT: 'SUNAT', RENIEC: 'RENIEC', CLIENTES: 'CLIENTES' }

const NOMBRE_DEL_ORIGEN = {
  [ORIGEN.SUNAT]: 'SUNAT',
  [ORIGEN.RENIEC]: 'RENIEC',
  [ORIGEN.CLIENTES]: 'tu lista de clientes',
}

/**
 * "completado con SUNAT", "nombre de RENIEC, dirección de tu lista de
 * clientes"... `null` si no se completó nada.
 *
 * @param {{nombre?: string|null, direccion?: string|null}} [completado]
 */
export function describirCompletado(completado) {
  const nombre = NOMBRE_DEL_ORIGEN[completado?.nombre] || null
  const direccion = NOMBRE_DEL_ORIGEN[completado?.direccion] || null
  if (!nombre && !direccion) return null
  if (nombre && direccion) {
    return nombre === direccion
      ? `completado con ${nombre}`
      : `nombre de ${nombre}, dirección de ${direccion}`
  }
  return nombre ? `nombre de ${nombre}` : `dirección de ${direccion}`
}
