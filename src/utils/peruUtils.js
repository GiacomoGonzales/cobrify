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

// Tipos de detracción SUNAT con sus porcentajes (Catálogo 54)
// Referencia: https://orientacion.sunat.gob.pe/detracciones
// Actualizado: Enero 2026
export const DETRACTION_TYPES = [
  // Bienes (Anexo 1 y 2)
  { code: '001', name: 'Azúcar y melaza de caña', rate: 10, category: 'bienes' },
  { code: '003', name: 'Alcohol etílico', rate: 10, category: 'bienes' },
  { code: '004', name: 'Recursos hidrobiológicos', rate: 4, category: 'bienes' },
  { code: '005', name: 'Maíz amarillo duro', rate: 4, category: 'bienes' },
  { code: '007', name: 'Caña de azúcar', rate: 10, category: 'bienes' },
  { code: '008', name: 'Madera', rate: 4, category: 'bienes' },
  { code: '009', name: 'Arena y piedra', rate: 10, category: 'bienes' },
  { code: '010', name: 'Residuos, subproductos, desechos, recortes y desperdicios', rate: 15, category: 'bienes' },
  { code: '014', name: 'Carnes y despojos comestibles', rate: 4, category: 'bienes' },
  { code: '016', name: 'Aceite de pescado', rate: 10, category: 'bienes' },
  { code: '017', name: 'Harina, polvo y pellets de pescado, crustáceos, moluscos', rate: 4, category: 'bienes' },
  { code: '023', name: 'Leche', rate: 4, category: 'bienes' },
  { code: '031', name: 'Oro gravado con el IGV', rate: 10, category: 'bienes' },
  { code: '032', name: 'Páprika y otros frutos de los géneros capsicum o pimienta', rate: 10, category: 'bienes' },
  { code: '034', name: 'Minerales metálicos no auríferos', rate: 10, category: 'bienes' },
  { code: '035', name: 'Bienes exonerados del IGV', rate: 1.5, category: 'bienes' },
  { code: '036', name: 'Oro y demás minerales metálicos exonerados del IGV', rate: 1.5, category: 'bienes' },
  { code: '039', name: 'Minerales no metálicos', rate: 10, category: 'bienes' },
  { code: '041', name: 'Plomo', rate: 15, category: 'bienes' },
  // Servicios (Anexo 3)
  { code: '012', name: 'Intermediación laboral y tercerización', rate: 12, category: 'servicios' },
  { code: '019', name: 'Arrendamiento de bienes muebles', rate: 10, category: 'servicios' },
  { code: '020', name: 'Mantenimiento y reparación de bienes muebles', rate: 12, category: 'servicios' },
  { code: '021', name: 'Movimiento de carga', rate: 10, category: 'servicios' },
  { code: '022', name: 'Otros servicios empresariales', rate: 12, category: 'servicios' },
  { code: '024', name: 'Comisión mercantil', rate: 10, category: 'servicios' },
  { code: '025', name: 'Fabricación de bienes por encargo', rate: 10, category: 'servicios' },
  { code: '026', name: 'Servicio de transporte de personas', rate: 10, category: 'servicios' },
  { code: '027', name: 'Servicio de transporte de carga', rate: 4, category: 'servicios', minAmount: 400 },
  { code: '030', name: 'Contratos de construcción', rate: 4, category: 'servicios' },
  { code: '037', name: 'Demás servicios gravados con el IGV', rate: 12, category: 'servicios' },
]

// Monto mínimo para aplicar detracción (en soles)
export const DETRACTION_MIN_AMOUNT = 700

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
  const totalRounded = Number(total.toFixed(2))

  // Convertir tasa de porcentaje a decimal (18 -> 0.18, 0 -> 0)
  const igvMultiplier = igvRate / 100

  // Calcular el subtotal (sin IGV) a partir del total
  const subtotal = totalRounded / (1 + igvMultiplier)
  const subtotalRounded = Number(subtotal.toFixed(2))

  // Ajustar el IGV para que subtotal + IGV = total exacto (evita pérdida de centavos)
  // En lugar de calcular IGV desde el subtotal, lo calculamos como diferencia
  const igvAdjusted = totalRounded - subtotalRounded

  return {
    subtotal: subtotalRounded,
    igv: Number(igvAdjusted.toFixed(2)),
    total: totalRounded,
  }
}

/**
 * Calcula los montos de una factura con productos mixtos (gravados, exonerados, inafectos)
 * Los precios de los items YA incluyen IGV (para productos gravados)
 * @param {Array} items - Array de items con precio, cantidad y taxAffectation
 * @param {number} igvRate - Tasa de IGV para productos gravados (por defecto 18)
 * @returns {Object} - Objeto con montos separados por tipo de afectación
 */
export function calculateMixedInvoiceAmounts(items, igvRate = 18) {
  let subtotalGravado = 0   // Subtotal sin IGV de productos gravados
  let igvGravado = 0        // IGV total de productos gravados
  let totalGravado = 0      // Total con IGV de productos gravados
  let totalExonerado = 0    // Total de productos exonerados (sin IGV)
  let totalInafecto = 0     // Total de productos inafectos (sin IGV)

  // Desglose por tasa de IGV (para mostrar IGV 18% e IGV 10.5% por separado)
  const byRate = {}

  items.forEach(item => {
    const lineTotal = item.price * item.quantity
    const taxAffectation = item.taxAffectation || '10' // Default: Gravado

    switch (taxAffectation) {
      case '10': { // Gravado
        // Usar igvRate del item si existe, sino el global como fallback
        const itemRate = item.igvRate ?? igvRate
        const itemMultiplier = itemRate / 100
        const lineSubtotal = lineTotal / (1 + itemMultiplier)
        const lineIgv = lineTotal - lineSubtotal
        subtotalGravado += lineSubtotal
        igvGravado += lineIgv
        totalGravado += lineTotal

        // Acumular por tasa
        if (!byRate[itemRate]) byRate[itemRate] = { subtotal: 0, igv: 0, total: 0 }
        byRate[itemRate].subtotal += lineSubtotal
        byRate[itemRate].igv += lineIgv
        byRate[itemRate].total += lineTotal
        break
      }
      case '20': // Exonerado
        totalExonerado += lineTotal
        break
      case '30': // Inafecto
        totalInafecto += lineTotal
        break
      default:
        totalGravado += lineTotal // Default a gravado
    }
  })

  // El subtotal total es la suma de todos los subtotales
  const subtotalTotal = subtotalGravado + totalExonerado + totalInafecto
  const totalFinal = totalGravado + totalExonerado + totalInafecto

  // Redondear desglose por tasa
  const igvByRate = {}
  for (const rate in byRate) {
    igvByRate[rate] = {
      subtotal: Number(byRate[rate].subtotal.toFixed(2)),
      igv: Number(byRate[rate].igv.toFixed(2)),
      total: Number(byRate[rate].total.toFixed(2)),
    }
  }

  return {
    // Montos por tipo de afectación
    gravado: {
      subtotal: Number(subtotalGravado.toFixed(2)),
      igv: Number(igvGravado.toFixed(2)),
      total: Number(totalGravado.toFixed(2)),
    },
    exonerado: {
      total: Number(totalExonerado.toFixed(2)),
    },
    inafecto: {
      total: Number(totalInafecto.toFixed(2)),
    },
    // Desglose de IGV por tasa (ej: { 18: { subtotal, igv, total }, 10.5: { ... } })
    igvByRate,
    // Totales generales
    subtotal: Number(subtotalTotal.toFixed(2)),
    igv: Number(igvGravado.toFixed(2)),
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

// ========================================
// RECARGO AL CONSUMO (Decreto Ley N° 25988)
// ========================================

// Porcentaje máximo permitido por ley
export const RECARGO_CONSUMO_MAX_RATE = 13

/**
 * Calcula el Recargo al Consumo
 * El RC se calcula sobre el subtotal SIN IGV (base imponible)
 * NO forma parte de la base imponible del IGV
 * Código SUNAT: 46 (Catálogo 53)
 * @param {number} subtotal - Subtotal sin IGV (base imponible)
 * @param {number} rate - Porcentaje del recargo (1-13%)
 * @returns {number} - Monto del recargo al consumo
 */
export function calculateRecargoConsumo(subtotal, rate) {
  if (!rate || rate <= 0 || subtotal <= 0) return 0
  // Limitar al máximo permitido por ley
  const effectiveRate = Math.min(rate, RECARGO_CONSUMO_MAX_RATE)
  return Number((subtotal * (effectiveRate / 100)).toFixed(2))
}
