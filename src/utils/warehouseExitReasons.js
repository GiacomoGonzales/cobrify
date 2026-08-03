/**
 * Motivos de una salida simple de almacén (modo logística).
 *
 * Los cuatro de siempre estaban escritos a mano en el modal, así que cada
 * negocio tenía que encajar sus salidas en ellos o marcar "Otro" y explicar en
 * las notas. Ahora el negocio puede sumar los suyos.
 *
 * A diferencia de los métodos de pago, un motivo NO necesita declarar "se
 * comporta como": nadie clasifica plata con esto. Es una etiqueta descriptiva
 * que se guarda en la salida (`reason` + `reasonLabel`) y solo se lee para
 * mostrarla. Por eso un motivo propio puede ser un valor nuevo sin más.
 *
 * La salida guarda `reasonLabel` junto al `reason`: si mañana el motivo se
 * borra o se renombra, las salidas viejas siguen diciendo lo que decían el día
 * que se registraron. Un histórico no se reescribe.
 */

/** Los cuatro de siempre. `fixed: true` = no se puede borrar. */
export const BUILTIN_EXIT_REASONS = [
  { value: 'office_use', label: 'Uso en oficina' },
  { value: 'employee_delivery', label: 'Entrega a trabajador' },
  { value: 'internal_consumption', label: 'Consumo interno' },
  // "Otro" se queda siempre: es la salida de emergencia cuando ninguno encaja.
  { value: 'other', label: 'Otro', fixed: true },
]

const CUSTOM_PREFIX = 'custom_'

export const isCustomExitReason = (value) => String(value || '').startsWith(CUSTOM_PREFIX)

/** Los motivos propios del negocio, saneados (sin nombre = se descarta). */
export const getCustomExitReasons = (companySettings) =>
  (companySettings?.customExitReasons || [])
    .filter(r => r && String(r.label || '').trim())
    .map(r => ({
      value: String(r.value || '').trim() || `${CUSTOM_PREFIX}${r.id || ''}`,
      label: String(r.label).trim(),
      isCustom: true,
    }))
    .filter(r => r.value !== CUSTOM_PREFIX)

/**
 * Todos los motivos que el desplegable debe ofrecer. Los propios van después de
 * los de siempre, en el orden en que se crearon.
 */
export const getExitReasons = (companySettings) => {
  const custom = getCustomExitReasons(companySettings)
  // "Otro" al final, después de los propios: es el descarte, no una opción más.
  const builtinSinOtro = BUILTIN_EXIT_REASONS.filter(r => r.value !== 'other')
  const otro = BUILTIN_EXIT_REASONS.find(r => r.value === 'other')
  return [...builtinSinOtro, ...custom, otro]
}

/** Etiqueta de un motivo. Cae al propio valor si ya no existe (motivo borrado). */
export const getExitReasonLabel = (value, companySettings) => {
  if (!value) return ''
  const found = getExitReasons(companySettings).find(r => r.value === value)
  return found?.label || ''
}

/**
 * Crea el registro de un motivo propio a partir del texto que escribió el
 * usuario. Devuelve `{ ok: false, error }` si el nombre está vacío o repetido.
 *
 * El `value` se deriva del texto (sin acentos ni espacios) más un sufijo, para
 * que sea legible en Firestore y no choque con otro creado el mismo instante.
 */
export const buildCustomExitReason = (rawLabel, companySettings) => {
  const label = String(rawLabel || '').trim()
  if (!label) return { ok: false, error: 'Escribe un nombre para el motivo.' }
  if (label.length > 40) return { ok: false, error: 'El motivo no puede pasar de 40 caracteres.' }

  const existentes = getExitReasons(companySettings)
  const yaExiste = existentes.some(r => r.label.toLowerCase() === label.toLowerCase())
  if (yaExiste) return { ok: false, error: `Ya existe un motivo llamado "${label}".` }

  const slug = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento, ya separadas por NFD
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)

  const id = `${slug || 'motivo'}_${existentes.length + 1}`
  return { ok: true, reason: { id, value: `${CUSTOM_PREFIX}${id}`, label } }
}
