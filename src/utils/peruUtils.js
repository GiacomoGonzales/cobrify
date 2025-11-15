/**
 * Utilidades específicas para facturación en Perú
 * Incluye cálculos de IGV, validaciones de RUC/DNI, etc.
 */

// Constantes de Perú
export const IGV_RATE = 0.18 // 18%
export const DOCUMENT_TYPES = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
}

export const ID_TYPES = {
  DNI: 'DNI',
  RUC: 'RUC',
  CE: 'CE', // Carnet de Extranjería
  PASSPORT: 'PASSPORT',
}

/**
 * Calcula el IGV (18%) de un monto
 * @param {number} amount - Monto base
 * @returns {number} - IGV calculado
 */
export function calculateIGV(amount) {
  return Number((amount * IGV_RATE).toFixed(2))
}

/**
 * Calcula el subtotal a partir de un total con IGV
 * @param {number} totalAmount - Monto total con IGV
 * @returns {number} - Subtotal sin IGV
 */
export function calculateSubtotalFromTotal(totalAmount) {
  return Number((totalAmount / (1 + IGV_RATE)).toFixed(2))
}

/**
 * Calcula el total con IGV incluido
 * @param {number} subtotal - Subtotal sin IGV
 * @returns {number} - Total con IGV
 */
export function calculateTotal(subtotal) {
  return Number((subtotal * (1 + IGV_RATE)).toFixed(2))
}

/**
 * Calcula los montos de una factura
 * Los precios de los items YA incluyen IGV
 * @param {Array} items - Array de items con precio (con IGV incluido) y cantidad
 * @param {number} igvRate - Tasa de IGV (por defecto 18, puede ser 0 para exonerados)
 * @returns {Object} - Objeto con subtotal, igv y total
 */
export function calculateInvoiceAmounts(items, igvRate = 18) {
  // El total es la suma de los precios (que ya incluyen IGV)
  const total = items.reduce((sum, item) => {
    return sum + item.price * item.quantity
  }, 0)

  // Convertir tasa de porcentaje a decimal (18 -> 0.18, 0 -> 0)
  const igvMultiplier = igvRate / 100

  // Calcular el subtotal (sin IGV) a partir del total
  const subtotal = total / (1 + igvMultiplier)
  const subtotalRounded = Number(subtotal.toFixed(2))

  // Calcular el IGV desde el subtotal redondeado para evitar pérdida de centavos
  const igv = subtotalRounded * igvMultiplier
  const igvRounded = Number(igv.toFixed(2))

  // Recalcular el total para asegurar consistencia
  const totalFinal = subtotalRounded + igvRounded

  return {
    subtotal: subtotalRounded,
    igv: igvRounded,
    total: Number(totalFinal.toFixed(2)),
  }
}

/**
 * Valida un número de RUC peruano
 * @param {string} ruc - Número de RUC a validar
 * @returns {boolean} - true si es válido
 */
export function validateRUC(ruc) {
  if (!ruc || typeof ruc !== 'string') return false

  // RUC debe tener 11 dígitos
  if (ruc.length !== 11 || !/^\d+$/.test(ruc)) return false

  // El primer dígito debe ser 1 o 2
  const firstDigit = parseInt(ruc[0])
  if (firstDigit !== 1 && firstDigit !== 2) return false

  // Validación del dígito verificador (deshabilitada temporalmente)
  // Si necesitas validación estricta, descomenta el código siguiente:
  /*
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0

  for (let i = 0; i < 10; i++) {
    sum += parseInt(ruc[i]) * weights[i]
  }

  const remainder = sum % 11
  const checkDigit = remainder === 0 ? 0 : 11 - remainder
  const lastDigit = parseInt(ruc[10])

  return checkDigit === lastDigit
  */

  // Por ahora, solo validamos longitud y formato
  return true
}

/**
 * Valida un número de DNI peruano
 * @param {string} dni - Número de DNI a validar
 * @returns {boolean} - true si es válido
 */
export function validateDNI(dni) {
  if (!dni || typeof dni !== 'string') return false

  // DNI debe tener 8 dígitos
  return dni.length === 8 && /^\d+$/.test(dni)
}

/**
 * Valida un documento de identidad según su tipo
 * @param {string} docType - Tipo de documento (DNI, RUC, etc)
 * @param {string} docNumber - Número de documento
 * @returns {Object} - {isValid: boolean, message: string}
 */
export function validateDocument(docType, docNumber) {
  switch (docType) {
    case ID_TYPES.RUC:
      return {
        isValid: validateRUC(docNumber),
        message: validateRUC(docNumber)
          ? 'RUC válido'
          : 'RUC inválido. Debe tener 11 dígitos y comenzar con 1 o 2',
      }
    case ID_TYPES.DNI:
      return {
        isValid: validateDNI(docNumber),
        message: validateDNI(docNumber) ? 'DNI válido' : 'DNI inválido. Debe tener 8 dígitos',
      }
    case ID_TYPES.CE:
      return {
        isValid: docNumber.length >= 9 && docNumber.length <= 12,
        message: 'Carnet de Extranjería debe tener entre 9 y 12 caracteres',
      }
    case ID_TYPES.PASSPORT:
      return {
        isValid: docNumber.length >= 5 && docNumber.length <= 12,
        message: 'Pasaporte debe tener entre 5 y 12 caracteres',
      }
    default:
      return {
        isValid: false,
        message: 'Tipo de documento no válido',
      }
  }
}

/**
 * Genera un número de serie correlativo para facturas
 * @param {string} prefix - Prefijo (ej: 'F001', 'B001')
 * @param {number} lastNumber - Último número usado
 * @returns {string} - Número correlativo (ej: 'F001-00000123')
 */
export function generateSeriesNumber(prefix, lastNumber) {
  const nextNumber = (lastNumber + 1).toString().padStart(8, '0')
  return `${prefix}-${nextNumber}`
}

/**
 * Formatea un número de documento con guiones
 * @param {string} docType - Tipo de documento
 * @param {string} docNumber - Número de documento
 * @returns {string} - Documento formateado
 */
export function formatDocument(docType, docNumber) {
  if (docType === ID_TYPES.RUC && docNumber.length === 11) {
    return `${docNumber.slice(0, 2)}-${docNumber.slice(2)}`
  }
  if (docType === ID_TYPES.DNI && docNumber.length === 8) {
    return docNumber
  }
  return docNumber
}

/**
 * Convierte un número a texto en español (para letras en facturas)
 * @param {number} amount - Monto a convertir
 * @returns {string} - Monto en letras
 */
export function numberToWords(amount) {
  // Implementación simplificada - en producción usar una librería
  const enteros = Math.floor(amount)
  const decimales = Math.round((amount - enteros) * 100)

  return `${enteros} CON ${decimales.toString().padStart(2, '0')}/100 SOLES`
}
