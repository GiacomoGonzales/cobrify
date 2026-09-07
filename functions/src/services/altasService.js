/**
 * Altas de clientes nuevos: el enlace que se manda por WhatsApp cuando alguien
 * paga, y lo que pasa cuando lo abre.
 *
 * El enlace es la prueba de que pagó. Por eso no hay una página de registro
 * abierta: hay un enlace con un código que solo existe porque alguien del
 * equipo lo generó desde la conversación.
 *
 * El código va en la dirección, así que tiene que ser imposible de adivinar
 * pero corto de leer: 10 caracteres de un alfabeto sin letras que se confundan
 * (nada de 0/O ni 1/l). Son mil billones de combinaciones y cabe en un mensaje.
 */

/** Sin 0, O, 1, I, l — se confunden al leerlas en voz alta o al teclearlas. */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Un código nuevo. `crypto` global existe en Node 20+. */
export function nuevoCodigoDeAlta(largo = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(largo))
  let salida = ''
  for (const b of bytes) salida += ALFABETO[b % ALFABETO.length]
  return salida
}

/** Estados por los que pasa un alta. */
export const ESTADOS_ALTA = {
  ENVIADA: 'enviada',
  ABIERTA: 'abierta',
  USADA: 'usada',
}

/**
 * Lo que el formulario puede saber antes de que nadie se identifique: con qué
 * nombre saludar y qué plan le vendieron. Nada más — quien tenga el enlace no
 * tiene por qué ver el teléfono ni quién se lo mandó.
 */
export function altaParaElFormulario(datos) {
  return {
    nombre: datos.nombre || '',
    plan: datos.plan || null,
    planNombre: datos.planNombre || '',
    meses: datos.meses || null,
    precio: datos.precio ?? null,
    whatsapp: datos.waId ? `+${datos.waId}` : '',
    estado: datos.estado || ESTADOS_ALTA.ENVIADA,
  }
}

/**
 * El mensaje que sale por WhatsApp. Va aquí y no en la pantalla para que el
 * texto sea el mismo venga de donde venga el envío.
 */
export function mensajeDeAlta({ nombre, planNombre, enlace }) {
  const saludo = nombre ? `¡Bienvenido a Cobrify, ${nombre.split(' ')[0]}! 🎉` : '¡Bienvenido a Cobrify! 🎉'
  const plan = planNombre ? ` del *${planNombre}*` : ''
  return [
    saludo,
    '',
    `Ya registramos tu pago${plan}. Entra aquí para activar tu cuenta, son 3 minutos:`,
    '',
    enlace,
    '',
    'Cualquier cosa me escribes por acá.',
  ].join('\n')
}
