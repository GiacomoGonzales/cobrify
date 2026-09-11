/**
 * La serie y el correlativo de un comprobante, por separado: "F001" y
 * "00000123" en vez de "F001-00000123".
 *
 * Los Excel que se le entregan al contador los piden en dos columnas: así los
 * filtra por serie, los ordena por número y los importa a su sistema. Una sola
 * forma de separarlos para todos los reportes (Contabilidad y el Registro de
 * Ventas), para que no digan cosas distintas.
 */

/** @returns {{serie: string, correlativo: string}} */
export function serieYCorrelativo(documento) {
  const numero = String(documento?.number || '').trim()
  const guion = numero.indexOf('-')
  if (guion > 0) {
    return { serie: numero.slice(0, guion), correlativo: numero.slice(guion + 1) }
  }
  // Sin el número armado: los campos sueltos del documento.
  const serie = String(documento?.series || '').trim()
  const n = documento?.correlativeNumber
  const correlativo = n === undefined || n === null || n === '' ? '' : String(n).padStart(8, '0')
  return { serie, correlativo }
}

/**
 * El correlativo como número, para que Excel lo ordene como número (con el
 * formato 00000000 se sigue viendo como en el comprobante). null si no es
 * solo dígitos: ese se deja como texto, tal cual.
 */
export function correlativoComoNumero(correlativo) {
  const texto = String(correlativo ?? '').trim()
  return /^\d{1,15}$/.test(texto) ? Number(texto) : null
}
