/**
 * LA ANAMNESIS: lo que hay que saber del paciente ANTES de tocarlo.
 *
 * Enfermedades, alergias, medicación, hábitos y las preguntas propias del
 * negocio. Vive en `customer.anamnesis`; el texto de alergias se sigue
 * guardando en `customer.allergies` (es lo que pinta la etiqueta roja de la
 * lista) y "otras enfermedades" en `customer.background`, así lo que ya leía
 * esos dos campos no se entera del cambio.
 *
 * Los catálogos son fijos a propósito: son los de cualquier consultorio. Lo
 * que cambia de una clínica a otra va en las PREGUNTAS PROPIAS, que el
 * negocio arma en Configuración > Punto de venta.
 *
 * Todo es puro: nada de Firestore acá.
 */

export const ENFERMEDADES = [
  { id: 'diabetes', nombre: 'Diabetes' },
  { id: 'hipertension', nombre: 'Hipertensión' },
  { id: 'cardiopatia', nombre: 'Cardiopatía' },
  { id: 'marcapasos', nombre: 'Marcapasos' },
  { id: 'epilepsia', nombre: 'Epilepsia' },
  { id: 'asma', nombre: 'Asma' },
  { id: 'anemia', nombre: 'Anemia' },
  { id: 'osteoporosis', nombre: 'Osteoporosis' },
  { id: 'tiroides', nombre: 'Tiroides' },
  { id: 'vih', nombre: 'VIH / SIDA' },
  { id: 'hepatitis', nombre: 'Hepatitis' },
  { id: 'tuberculosis', nombre: 'Tuberculosis' },
  { id: 'cancer', nombre: 'Cáncer' },
  { id: 'coagulopatia', nombre: 'Problemas de coagulación' },
  { id: 'autoinmune', nombre: 'Enfermedad autoinmune' },
  { id: 'herpes', nombre: 'Herpes recurrente' },
  { id: 'queloides', nombre: 'Cicatrización queloide' },
]

export const ALERGIAS_COMUNES = [
  { id: 'anestesia', nombre: 'Anestesia' },
  { id: 'penicilina', nombre: 'Penicilina' },
  { id: 'latex', nombre: 'Látex' },
  { id: 'aines', nombre: 'AINEs (ibuprofeno y similares)' },
]

/** `alerta`: lo que cambia una atención y por eso sale como aviso en la ficha. */
export const HABITOS = [
  { id: 'embarazada', nombre: 'Embarazada', alerta: true },
  { id: 'lactancia', nombre: 'En lactancia', alerta: true },
  { id: 'fuma', nombre: 'Fuma' },
  { id: 'alcohol', nombre: 'Consume alcohol' },
  { id: 'sol', nombre: 'Exposición frecuente al sol' },
]

export const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

export const TIPOS_DE_PREGUNTA = [
  { id: 'si_no', nombre: 'Sí / No' },
  { id: 'texto', nombre: 'Texto' },
]

export const anamnesisVacia = () => ({
  motivo: '',
  enfermedades: [],
  otrasEnfermedades: '',
  cirugias: '',
  grupoSanguineo: '',
  alergias: [],
  otrasAlergias: '',
  medicamentos: '',
  habitos: [],
  tratamientosPrevios: '',
  respuestas: {},
  updatedAt: '',
})

/**
 * La anamnesis del cliente, lista para editar. Un cliente sin anamnesis pero
 * con la ficha simple (alergias y antecedentes en texto) la estrena con eso.
 */
export const normalizarAnamnesis = (customer) => {
  const base = anamnesisVacia()
  const a = customer?.anamnesis && typeof customer.anamnesis === 'object' ? customer.anamnesis : null
  if (!a) {
    return {
      ...base,
      otrasAlergias: String(customer?.allergies || '').trim(),
      otrasEnfermedades: String(customer?.background || '').trim(),
    }
  }
  return {
    ...base,
    ...a,
    enfermedades: Array.isArray(a.enfermedades) ? a.enfermedades : [],
    alergias: Array.isArray(a.alergias) ? a.alergias : [],
    habitos: Array.isArray(a.habitos) ? a.habitos : [],
    respuestas: a.respuestas && typeof a.respuestas === 'object' ? a.respuestas : {},
  }
}

const nombresDe = (catalogo, ids) =>
  (Array.isArray(ids) ? ids : []).map(id => catalogo.find(x => x.id === id)?.nombre).filter(Boolean)

/** El texto de alergias que se guarda en el cliente (la etiqueta roja). */
export const textoDeAlergias = (anamnesis) =>
  [...nombresDe(ALERGIAS_COMUNES, anamnesis?.alergias), String(anamnesis?.otrasAlergias || '').trim()]
    .filter(Boolean)
    .join(', ')

/** Lo que sale como AVISO antes de atender (embarazo, lactancia). */
export const alertasDeAnamnesis = (anamnesis) =>
  HABITOS.filter(h => h.alerta && (anamnesis?.habitos || []).includes(h.id)).map(h => h.nombre)

/** Las preguntas propias del negocio, saneadas: sin vacías, con tipo válido. */
export const normalizarPreguntas = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter(p => p && typeof p.texto === 'string' && p.texto.trim() && p.id)
    .map(p => ({ id: String(p.id), texto: p.texto.trim(), tipo: p.tipo === 'texto' ? 'texto' : 'si_no' }))

const respuestaLegible = (pregunta, valor) => {
  if (pregunta.tipo === 'si_no') return valor === true ? 'Sí' : 'No'
  return String(valor)
}

/**
 * El resumen para la ficha: solo lo que tiene algo, con Alergias siempre
 * primero (es lo que más importa y "ninguna conocida" también es un dato).
 * @returns {Array<{ etiqueta: string, valor: string, importante?: boolean }>}
 */
export const resumenDeAnamnesis = (anamnesis, preguntas = []) => {
  const a = anamnesis || {}
  const filas = []
  const alergias = textoDeAlergias(a)
  filas.push({ etiqueta: 'Alergias', valor: alergias || 'Ninguna conocida', importante: Boolean(alergias) })

  const habitos = nombresDe(HABITOS, a.habitos)
  if (habitos.length) filas.push({ etiqueta: 'Hábitos y estado', valor: habitos.join(', '), importante: alertasDeAnamnesis(a).length > 0 })

  const enfermedades = [...nombresDe(ENFERMEDADES, a.enfermedades), String(a.otrasEnfermedades || '').trim()].filter(Boolean)
  if (enfermedades.length) filas.push({ etiqueta: 'Enfermedades', valor: enfermedades.join(', ') })
  if (a.medicamentos) filas.push({ etiqueta: 'Medicamentos actuales', valor: a.medicamentos })
  if (a.cirugias) filas.push({ etiqueta: 'Cirugías previas', valor: a.cirugias })
  if (a.tratamientosPrevios) filas.push({ etiqueta: 'Tratamientos previos', valor: a.tratamientosPrevios })
  if (a.grupoSanguineo) filas.push({ etiqueta: 'Grupo sanguíneo', valor: a.grupoSanguineo })
  if (a.motivo) filas.push({ etiqueta: 'Motivo de consulta', valor: a.motivo })

  for (const p of normalizarPreguntas(preguntas)) {
    const v = a.respuestas?.[p.id]
    if (v === undefined || v === null || v === '') continue
    filas.push({ etiqueta: p.texto, valor: respuestaLegible(p, v) })
  }
  return filas
}

/** ¿Se llenó algo más que "ninguna alergia conocida"? */
export const anamnesisTieneDatos = (anamnesis, preguntas = []) =>
  resumenDeAnamnesis(anamnesis, preguntas).some(f => f.etiqueta !== 'Alergias' || f.importante)

/**
 * Lo que se escribe en el cliente al guardar: la anamnesis y los dos campos
 * de texto que el resto del sistema ya leía.
 */
export const camposParaGuardar = (anamnesis, hoy) => ({
  anamnesis: { ...anamnesis, updatedAt: hoy },
  allergies: textoDeAlergias(anamnesis),
  background: String(anamnesis?.otrasEnfermedades || '').trim(),
})
