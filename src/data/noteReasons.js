/**
 * Motivos de notas de crédito y débito (catálogos 09 y 10 de SUNAT).
 *
 * Vivían dentro de `CreateCreditNote.jsx` y `CreateDebitNote.jsx`, así que la
 * lista de Ventas no podía traducir el código guardado en el comprobante y solo
 * habría podido mostrar un "01" pelado.
 *
 * OJO con el catálogo 09: hasta jul-2026 las etiquetas de 12 y 13 estaban
 * cruzadas. El 12 real es "Ajustes afectos al IVAP" (arroz pilado: exige TODOS
 * los ítems con afectación 17, si no SUNAT rechaza con error 2644) y el ajuste
 * de montos/fechas de pago es el 13.
 */

/** Catálogo 09 — tipos de nota de crédito. */
export const CREDIT_NOTE_REASONS = [
  { code: '01', description: 'Anulación de la operación' },
  { code: '02', description: 'Anulación por error en el RUC' },
  { code: '03', description: 'Corrección por error en la descripción' },
  { code: '04', description: 'Descuento global' },
  { code: '05', description: 'Descuento por ítem' },
  { code: '06', description: 'Devolución total' },
  { code: '07', description: 'Devolución por ítem' },
  { code: '08', description: 'Bonificación' },
  { code: '09', description: 'Disminución en el valor' },
  { code: '10', description: 'Otros conceptos' },
  { code: '11', description: 'Ajustes de operaciones de exportación' },
  { code: '12', description: 'Ajustes afectos al IVAP' },
  { code: '13', description: 'Corrección del monto pendiente de pago / fechas de cuotas' },
]

/** Catálogo 10 — tipos de nota de débito. */
export const DEBIT_NOTE_REASONS = [
  { code: '01', description: 'Intereses por mora' },
  { code: '02', description: 'Aumento en el valor' },
  { code: '03', description: 'Penalidades/ otros conceptos' },
]

/**
 * Descripción del motivo de una nota. Si el código no está en el catálogo
 * devuelve el código tal cual, para no ocultar un dato raro detrás de un vacío.
 */
export const getNoteReasonLabel = (documentType, code) => {
  if (!code) return ''
  const catalogo = documentType === 'nota_debito' ? DEBIT_NOTE_REASONS : CREDIT_NOTE_REASONS
  return catalogo.find(r => r.code === String(code))?.description || String(code)
}

/** Etiqueta del tipo de documento referenciado (catálogo 01 de SUNAT). */
export const getReferencedDocTypeLabel = (code) => {
  const mapa = { '01': 'Factura', '03': 'Boleta', '07': 'Nota de Crédito', '08': 'Nota de Débito' }
  return mapa[String(code)] || ''
}
