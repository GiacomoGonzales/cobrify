/**
 * TIPO DE DOCUMENTO DE IDENTIDAD DEL CLIENTE — cómo se etiqueta.
 *
 * El campo `documentType` viaja en DOS formatos porque así quedó la base:
 * el nombre corto que usa la ficha del cliente ('DNI', 'RUC', 'CE',
 * 'PASSPORT', de ID_TYPES) y el código del catálogo 06 de SUNAT que exige el
 * XML ('1', '6', '4', '7'). Los dos son válidos y ambos están en producción.
 *
 * Por qué existe este módulo: cada pantalla resolvía la etiqueta a mano y con
 * reglas distintas. El PDF aceptaba 'RUC' y '6'; el detalle del comprobante
 * solo '6', así que a un cliente guardado como 'RUC' le ponía "DNI" al lado
 * de su número de 11 dígitos, contradiciendo al PDF de esa misma venta.
 *
 * Regla: cualquier pantalla que muestre la etiqueta usa `documentLabel()`.
 */

/** Código del catálogo 06 de SUNAT, o null si no se reconoce. */
export const toSunatCode = (raw) => {
  const v = String(raw ?? '').trim().toUpperCase()
  if (v === 'RUC' || v === '6') return '6'
  if (v === 'DNI' || v === '1') return '1'
  if (v === 'CE' || v === '4') return '4'
  if (v === 'PASSPORT' || v === 'PASAPORTE' || v === '7') return '7'
  return null
}

const ETIQUETAS = { '6': 'RUC', '1': 'DNI', '4': 'CE', '7': 'Pasaporte' }

/**
 * La etiqueta que se muestra junto al número.
 *
 * Cuando el tipo no se reconoce (dato viejo, importado, vacío) se deduce del
 * número: 11 dígitos es RUC y 8 es DNI en Perú. Es preferible a devolver
 * "DNI" por descarte —que es como aparecía un RUC de 11 dígitos etiquetado
 * como DNI— y a mostrar un genérico cuando el número canta lo que es.
 *
 * @param {string} raw      documentType del cliente
 * @param {string} [numero] documentNumber, para deducir cuando el tipo falta
 * @returns {string} 'RUC' | 'DNI' | 'CE' | 'Pasaporte' | 'Doc.'
 */
export const documentLabel = (raw, numero = '') => {
  const code = toSunatCode(raw)
  if (code) return ETIQUETAS[code]

  const n = String(numero ?? '').trim()
  if (/^\d{11}$/.test(n)) return 'RUC'
  if (/^\d{8}$/.test(n)) return 'DNI'
  return 'Doc.'
}

/** ¿Es una empresa? Decide "Razón Social" vs "Nombre". */
export const esRuc = (raw, numero = '') => documentLabel(raw, numero) === 'RUC'
