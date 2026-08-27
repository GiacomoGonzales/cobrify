/**
 * Cuántos días se recuerda un producto o servicio.
 *
 * Antes había que configurar "Recordar servicio (días)" producto por producto
 * y, si el campo estaba vacío, no se recordaba nada. En una veterinaria eso es
 * al revés de lo que hace falta: casi todo lo que se vende se repite —el baño,
 * el alimento, la desparasitación— y lo excepcional es lo que NO se repite.
 * Configurar cien fichas a mano para que la pantalla de Recordatorios sirva
 * era pedirle al negocio que hiciera el trabajo del sistema.
 *
 * Ahora el negocio fija un plazo por defecto (30 días de fábrica) y la ficha
 * del producto solo sirve para las excepciones:
 *
 *   reminderDays vacío  → el plazo por defecto del negocio
 *   reminderDays > 0    → ese plazo, para ese producto
 *   reminderDays === 0  → ese producto NO genera recordatorio
 *
 * El cero es la única forma de decir "este no": con el default invertido,
 * dejar el campo vacío ya no significa "ninguno".
 */

/** Plazo de fábrica, en días. */
export const DIAS_RECORDATORIO_POR_DEFECTO = 30

/**
 * @param {object} producto        ficha del producto (puede venir sin el campo)
 * @param {object} businessSettings ajustes del negocio
 * @returns {number} días a recordar, o 0 si este producto no se recuerda
 */
export function diasDeRecordatorio(producto, businessSettings) {
  const propio = producto?.reminderDays
  // Distinguir "sin configurar" de "configurado en 0": '' , null y undefined
  // caen al default; el 0 explícito apaga el recordatorio.
  const sinConfigurar = propio === undefined || propio === null || propio === ''
  if (!sinConfigurar) {
    const n = Number(propio)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  return diasPorDefectoDelNegocio(businessSettings)
}

/** El plazo por defecto del negocio. 0 = no recordar nada salvo lo que tenga ficha. */
export function diasPorDefectoDelNegocio(businessSettings) {
  const v = businessSettings?.vetReminderDefaultDays
  if (v === undefined || v === null || v === '') return DIAS_RECORDATORIO_POR_DEFECTO
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : DIAS_RECORDATORIO_POR_DEFECTO
}
