/**
 * Plazos de la fecha de emisión de un comprobante electrónico.
 *
 * POR QUÉ EXISTE (caso real, 2-ago-2026): una usuaria se equivocó y puso el
 * 24 de agosto en una boleta emitida el 2 de agosto. SUNAT la rechazó con
 * `2329 - La fecha de emision se encuentra fuera del limite permitido`. Al
 * corregir la fecha y reintentar, SUNAT respondió `1032 - El comprobante ya
 * esta informado y se encuentra con estado anulado o rechazado`: el correlativo
 * ya estaba quemado y el documento quedó irrecuperable.
 *
 * El tope ya existía en el POS, pero solo como atributos `min`/`max` de un
 * `<input type="date">`. Eso NO restringe nada: el navegador pinta en gris los
 * días fuera de rango en el calendario, pero si la fecha se escribe a mano en
 * los segmentos del campo el valor entra igual, y nada la volvía a revisar ni
 * al cobrar ni en el servidor. Mismo patrón que la placa de las guías.
 *
 * Por eso las reglas viven acá y no repartidas por la UI: el `min`/`max` del
 * campo y la validación al emitir tienen que salir de la misma fuente, o vuelven
 * a desincronizarse.
 */

/** Fecha local en YYYY-MM-DD. Sin `toISOString`, que convierte a UTC y puede correr el día. */
export const toDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Días hacia atrás admitidos por tipo de documento. La nota de venta no es un
 * comprobante electrónico —no va a SUNAT— así que no tiene plazo.
 */
const DAYS_BACK = { factura: 3, boleta: 7 }

/** ¿Este documento viaja a SUNAT y por lo tanto tiene plazo? */
export const hasEmissionDateLimits = (documentType) =>
  documentType !== 'nota_venta' && !!documentType

/**
 * Límites para el campo de fecha. Devuelve `{ min, max }` en YYYY-MM-DD, o
 * `{ min: undefined, max: undefined }` cuando el documento no tiene plazo.
 */
export const getEmissionDateLimits = (documentType, today = new Date()) => {
  if (!hasEmissionDateLimits(documentType)) return { min: undefined, max: undefined }

  const daysBack = DAYS_BACK[documentType] ?? 7
  const minDate = new Date(today)
  minDate.setDate(today.getDate() - daysBack)

  // El máximo es HOY: SUNAT nunca acepta una fecha de emisión futura.
  return { min: toDateString(minDate), max: toDateString(today), daysBack }
}

/**
 * Valida la fecha elegida. Devuelve `{ valid: true }` o `{ valid: false, error }`
 * con un mensaje que explica el plazo, para mostrarlo tal cual en un toast.
 */
export const validateEmissionDate = (dateStr, documentType, today = new Date()) => {
  if (!hasEmissionDateLimits(documentType)) return { valid: true }

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { valid: false, error: 'La fecha de emisión no es válida. Usa el formato día/mes/año.' }
  }

  const { min, max, daysBack } = getEmissionDateLimits(documentType, today)

  // Comparación como texto: en formato YYYY-MM-DD el orden alfabético es el
  // cronológico, y así no entra en juego ninguna zona horaria.
  if (dateStr > max) {
    return {
      valid: false,
      error: `La fecha de emisión no puede ser futura. Elegiste ${formatDisplay(dateStr)} y hoy es ${formatDisplay(max)}. SUNAT rechaza el comprobante y el número queda inutilizable.`,
    }
  }

  if (dateStr < min) {
    const nombre = documentType === 'factura' ? 'Las facturas' : 'Las boletas'
    return {
      valid: false,
      error: `La fecha de emisión es muy antigua. ${nombre} se pueden emitir hasta ${daysBack} días atrás, o sea desde el ${formatDisplay(min)}. Elegiste ${formatDisplay(dateStr)}.`,
    }
  }

  return { valid: true }
}

/** YYYY-MM-DD a DD/MM/YYYY, para los mensajes. */
const formatDisplay = (dateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}
