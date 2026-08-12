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
 * comprobante electrónico —no va a SUNAT— así que no tiene plazo hacia atrás.
 */
const DAYS_BACK = { factura: 3, boleta: 7 }

/**
 * ¿Este documento viaja a SUNAT y por lo tanto tiene plazo HACIA ATRÁS?
 *
 * Ojo: esto NO decide si se valida la fecha, solo si hay un mínimo. El tope de
 * hoy aplica a todos (ver `getEmissionDateLimits`).
 */
export const hasEmissionDateLimits = (documentType) =>
  documentType !== 'nota_venta' && !!documentType

/**
 * Límites para el campo de fecha, en YYYY-MM-DD.
 *
 * `max` es SIEMPRE hoy, para cualquier tipo de documento. `min` solo existe para
 * los que van a SUNAT.
 *
 * SEGUNDO CASO REAL (12-ago-2026): una nota de venta quedó guardada con fecha del
 * año **275760** —el tope que acepta un `<input type="date">` si se escribe el año
 * a mano— y el Dashboard la sumó a "Ventas del Día" todos los días desde entonces.
 * Antes las notas de venta se saltaban la validación entera porque no tienen plazo
 * de SUNAT; "no tiene plazo hacia atrás" se había implementado como "no se revisa
 * nada". Una venta futura no existe: ya ocurrió o no ocurrió.
 */
export const getEmissionDateLimits = (documentType, today = new Date()) => {
  const max = toDateString(today)
  if (!hasEmissionDateLimits(documentType)) return { min: undefined, max }

  const daysBack = DAYS_BACK[documentType] ?? 7
  const minDate = new Date(today)
  minDate.setDate(today.getDate() - daysBack)

  return { min: toDateString(minDate), max, daysBack }
}

/**
 * Valida la fecha elegida. Devuelve `{ valid: true }` o `{ valid: false, error }`
 * con un mensaje que explica el plazo, para mostrarlo tal cual en un toast.
 */
export const validateEmissionDate = (dateStr, documentType, today = new Date()) => {
  const vaAsunat = hasEmissionDateLimits(documentType)
  const { min, max, daysBack } = getEmissionDateLimits(documentType, today)

  // Sin fecha: los comprobantes electrónicos la exigen; una nota de venta sin
  // fecha explícita sale con la de hoy, así que no se bloquea la venta.
  if (!dateStr) {
    return vaAsunat
      ? { valid: false, error: 'La fecha de emisión no es válida. Usa el formato día/mes/año.' }
      : { valid: true }
  }

  // El año DEBE tener 4 dígitos: así se descarta el "275760-06-06" del caso real.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { valid: false, error: 'La fecha de emisión no es válida. Usa el formato día/mes/año.' }
  }

  // Comparación como texto: en formato YYYY-MM-DD el orden alfabético es el
  // cronológico, y así no entra en juego ninguna zona horaria.
  if (dateStr > max) {
    return {
      valid: false,
      error: vaAsunat
        ? `La fecha de emisión no puede ser futura. Elegiste ${formatDisplay(dateStr)} y hoy es ${formatDisplay(max)}. SUNAT rechaza el comprobante y el número queda inutilizable.`
        : `La fecha de emisión no puede ser futura. Elegiste ${formatDisplay(dateStr)} y hoy es ${formatDisplay(max)}. Una fecha adelantada descuadra los reportes y el Dashboard.`,
    }
  }

  if (min && dateStr < min) {
    const nombre = documentType === 'factura' ? 'Las facturas' : 'Las boletas'
    return {
      valid: false,
      error: `La fecha de emisión es muy antigua. ${nombre} se pueden emitir hasta ${daysBack} días atrás, o sea desde el ${formatDisplay(min)}. Elegiste ${formatDisplay(dateStr)}.`,
    }
  }

  return { valid: true }
}

/**
 * Devuelve la fecha ajustada al límite más cercano si quedó fuera de rango:
 * `{ value, changed, message }`. Si estaba bien, `changed` es false.
 *
 * POR QUÉ AL SALIR DEL CAMPO Y NO AL TECLEAR (caso real, 12-ago-2026): un
 * usuario que escribe la fecha a mano terminó con una factura al año **8097**.
 * El `max` del `<input type="date">` solo pinta gris el calendario; tecleando
 * los dígitos el valor entra igual.
 *
 * No se puede corregir en cada tecla: el campo emite un cambio por cada dígito
 * del año, así que al escribir "2026" pasa por 0002, 0020 y 0202. Si se ajusta
 * en cada uno, el año se reinicia solo y escribir la fecha a mano —que es como
 * la carga el usuario— se vuelve imposible. Por eso se ajusta al salir del
 * campo, cuando el valor ya está completo.
 *
 * La validación de `validateEmissionDate` al cobrar sigue siendo la barrera
 * final, por si nunca se sale del campo.
 */
export const clampEmissionDate = (dateStr, documentType, today = new Date()) => {
  const sinCambio = { value: dateStr, changed: false, message: null }
  if (!dateStr) return sinCambio

  const { min, max } = getEmissionDateLimits(documentType, today)

  // Comparación como texto: en YYYY-MM-DD el orden alfabético es el cronológico
  // y funciona igual con años de más de 4 dígitos ("275760-06-06" > "2026-08-12").
  if (dateStr > max) {
    return {
      value: max,
      changed: true,
      message: `La fecha de emisión no puede ser futura. Se ajustó a hoy, ${formatDisplay(max)}.`,
    }
  }

  if (min && dateStr < min) {
    return {
      value: min,
      changed: true,
      message: `Esa fecha de emisión es muy antigua para este comprobante. Se ajustó al ${formatDisplay(min)}, que es lo más atrás permitido.`,
    }
  }

  return sinCambio
}

/** YYYY-MM-DD a DD/MM/YYYY, para los mensajes. */
const formatDisplay = (dateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}
