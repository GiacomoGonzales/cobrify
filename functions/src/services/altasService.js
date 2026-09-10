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
export function mensajeDeAlta({ nombre, planNombre, enlace, esPrueba = false, dias = null }) {
  const saludo = nombre ? `¡Bienvenido a Cobrify, ${nombre.split(' ')[0]}! 🎉` : '¡Bienvenido a Cobrify! 🎉'

  // A quien viene a PROBAR no se le habla de un pago que no hizo. Decía "ya
  // registramos tu pago del Prueba de 7 días", que además de falso es la
  // primera frase que lee: empezar mintiéndole es el peor arranque posible.
  // Y los días van en el mensaje, no escondidos: que sepa desde el minuto uno
  // cuánto le dura, y no se entere el día que se le acaba.
  const cuerpo = esPrueba
    ? `Te dejamos lista tu *prueba gratuita${dias ? ` de ${dias} días` : ''}*. `
      + 'Entra aquí para activarla, son 3 minutos:'
    : `Ya registramos tu pago${planNombre ? ` del *${planNombre}*` : ''}. `
      + 'Entra aquí para activar tu cuenta, son 3 minutos:'

  return [
    saludo,
    '',
    cuerpo,
    '',
    enlace,
    '',
    esPrueba
      ? 'Pruébalo con calma y cualquier duda me escribes por acá, que te guío.'
      : 'Cualquier cosa me escribes por acá.',
  ].join('\n')
}
