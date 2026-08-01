/**
 * Placa del vehículo para guías de remisión electrónicas.
 *
 * Regla OFICIAL de SUNAT, tomada del Excel de validaciones GRE
 * (`public/ValidacionesGREv20250421_0 (3).xlsx`, hoja Guía-Remitente2_0,
 * filas 278 y 297 → error 2567):
 *
 *   "el formato del Tag UBL es diferente a alfanumérico de 6 a 8 caracteres
 *    (solo se permiten letras mayúsculas y números, no espacios en blanco ni
 *    guion, tampoco se permite solamente ceros)"
 *
 * Vive acá porque estaba escrita TRES veces y las tres estaban mal: dos exigían
 * exactamente 6 caracteres —rechazando placas válidas de 7 y 8— y la del
 * transportista aceptaba guiones y minúsculas, que SUNAT rechaza. Un usuario
 * emitió con la placa "ATC97" y SUNAT le devolvió el 2567 (31-jul-2026).
 */

/** Deja la placa como la quiere SUNAT: sin guiones ni espacios, en mayúsculas. */
export const normalizePlate = (value) =>
  String(value || '').replace(/[-\s]/g, '').toUpperCase()

export const PLATE_MAX_LENGTH = 8

/** Ejemplos para placeholders y mensajes. */
export const PLATE_EXAMPLE = 'ABC123'

/**
 * Valida una placa. Devuelve `{ valid, error }` con un mensaje que dice QUÉ está
 * mal, no solo que está mal: el usuario tiene que poder corregirlo sin
 * adivinar.
 */
export const validatePlate = (value) => {
  const plate = normalizePlate(value)

  if (!plate) return { valid: false, error: 'Falta la placa del vehículo.' }

  if (plate.length < 6) {
    return {
      valid: false,
      error: `La placa "${plate}" tiene ${plate.length} caracteres y SUNAT exige entre 6 y 8. Revisa que no falte ninguno, por ejemplo ${PLATE_EXAMPLE}.`,
    }
  }
  if (plate.length > 8) {
    return {
      valid: false,
      error: `La placa "${plate}" tiene ${plate.length} caracteres y SUNAT admite hasta 8.`,
    }
  }
  if (!/^[A-Z0-9]+$/.test(plate)) {
    return {
      valid: false,
      error: `La placa "${plate}" tiene caracteres que SUNAT no acepta. Solo letras y números, sin guiones ni espacios, por ejemplo ${PLATE_EXAMPLE}.`,
    }
  }
  // Regla explícita del Excel: "tampoco se permite solamente ceros".
  if (/^0+$/.test(plate)) {
    return { valid: false, error: 'La placa no puede ser solo ceros.' }
  }

  return { valid: true, error: null }
}
