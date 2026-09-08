/**
 * El RUC del negocio tal como debe salir en los documentos.
 *
 * Un negocio que marcó "No tengo RUC" en Mi Empresa (uso interno, sin emisión
 * a SUNAT) no tiene RUC que imprimir: devuelve '' y quien imprime omite la
 * línea. Antes cada ticket rellenaba con 00000000000, un número que no es de
 * nadie, y Mi Empresa no dejaba guardar sin un RUC válido.
 *
 * Es el único criterio: tickets térmicos, BLE, ticket web, cierre de caja y
 * PDF de comprobantes y cotizaciones leen de aquí.
 */
export function rucDeEmpresa(negocio) {
  if (!negocio || negocio.sinRuc === true) return ''
  return String(negocio.ruc || '').trim()
}

/**
 * La línea "RUC: 20123456789" de una cabecera, o '' si no hay RUC.
 * `sufijo` es el salto de línea que use cada impresora ('\n' en las que
 * escriben el salto dentro del texto; vacío en las que llaman a newLine()).
 */
export function lineaRuc(negocio, sufijo = '') {
  const ruc = rucDeEmpresa(negocio)
  return ruc ? `RUC: ${ruc}${sufijo}` : ''
}
