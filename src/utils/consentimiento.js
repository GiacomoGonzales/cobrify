/**
 * CONSENTIMIENTO INFORMADO: el texto que el paciente lee y firma en pantalla
 * antes de un procedimiento.
 *
 * El negocio arma sus plantillas en Configuración > Punto de venta (una por
 * tratamiento, o una general). Sin plantillas propias se usa la general de
 * acá, que cubre lo que cualquier consentimiento tiene que decir. Las
 * variables se reemplazan al momento de firmar, y el TEXTO YA RENDERIZADO se
 * guarda con la firma: lo que se firmó no cambia aunque la plantilla cambie
 * después.
 *
 * Todo es puro: nada de Firestore acá (ver consentService.js).
 */

export const VARIABLES_DE_CONSENTIMIENTO = ['paciente', 'dni', 'edad', 'tratamiento', 'profesional', 'fecha', 'negocio']

export const PLANTILLA_CONSENTIMIENTO_POR_DEFECTO = {
  id: 'general',
  nombre: 'Consentimiento general',
  texto: [
    'Yo, {paciente}, identificado(a) con documento {dni}, declaro que he sido informado(a) por {profesional} de {negocio} sobre el procedimiento {tratamiento}: en qué consiste, sus beneficios esperados, sus riesgos y posibles complicaciones, las alternativas disponibles y los cuidados posteriores que debo seguir.',
    'He tenido la oportunidad de hacer preguntas y todas han sido respondidas de forma clara. Declaro que la información que he brindado sobre mi salud, alergias, medicación actual, embarazo o lactancia es completa y verdadera.',
    'Entiendo que los resultados pueden variar de una persona a otra y que ningún procedimiento garantiza un resultado exacto. Autorizo la toma de fotografías con fines clínicos, que se conservarán en mi ficha.',
    'En consecuencia, otorgo mi consentimiento libre y voluntario para que se realice el procedimiento indicado, con fecha {fecha}.',
  ].join('\n\n'),
}

/** Las plantillas del negocio, saneadas: con id, nombre y texto. */
export const normalizarPlantillas = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter(p => p && p.id && typeof p.texto === 'string' && p.texto.trim())
    .map(p => ({ id: String(p.id), nombre: String(p.nombre || '').trim() || 'Consentimiento', texto: p.texto.trim() }))

/** Lo que se ofrece al firmar: las del negocio, o la general si no armó ninguna. */
export const plantillasDisponibles = (businessSettings) => {
  const propias = normalizarPlantillas(businessSettings?.consentTemplates)
  return propias.length ? propias : [PLANTILLA_CONSENTIMIENTO_POR_DEFECTO]
}

/**
 * El texto con las variables reemplazadas. Una variable sin valor se
 * reemplaza por una línea para completar a mano, no por un hueco vacío.
 */
export const textoDelConsentimiento = (plantilla, datos = {}) => {
  const valores = {
    paciente: datos.paciente,
    dni: datos.dni,
    edad: datos.edad != null && datos.edad !== '' ? `${datos.edad} años` : '',
    tratamiento: datos.tratamiento,
    profesional: datos.profesional,
    fecha: datos.fecha,
    negocio: datos.negocio,
  }
  return String(plantilla?.texto || '').replace(/\{(\w+)\}/g, (todo, clave) => {
    if (!(clave in valores)) return todo
    const v = String(valores[clave] || '').trim()
    return v || '____________'
  })
}

/** ¿La firma sirve? Un PNG en base64 de tamaño razonable. */
export const firmaValida = (dataUrl) =>
  typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,') && dataUrl.length > 500 && dataUrl.length < 600000

const slug = (texto) => String(texto || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40)

export const nombreDeArchivoConsentimiento = (consent) =>
  `consentimiento-${slug(consent?.customerName) || 'paciente'}-${consent?.signedDate || 'sin-fecha'}.pdf`
