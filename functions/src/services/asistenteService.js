/**
 * EL MOTOR DEL ASISTENTE. Habla con Claude y devuelve lo que hay que contestar.
 *
 * Sin SDK a propósito: es una llamada HTTP y Node ya trae `fetch`. Una
 * dependencia menos que actualizar, y el día que algo falle se ve el cuerpo
 * exacto del error en vez de una excepción envuelta en tres capas.
 *
 * La herramienta `pasarleAGiacomo` no es un adorno: es la única forma de que
 * "escalar" sea un HECHO observable y no una frase amable dentro del texto. Si
 * el modelo solo escribiera "le paso con Giacomo", nadie se enteraría — ni
 * Giacomo. Con la herramienta queda registrado, medible, y se puede avisar.
 */

const API = 'https://api.anthropic.com/v1/messages'
const MODELO = 'claude-sonnet-5'

/** Lo único que el asistente puede HACER, además de escribir. */
const HERRAMIENTAS = [{
  name: 'pasarleAGiacomo',
  description: 'Pasa la conversación a Giacomo. Úsala cuando el cliente quiera '
    + 'comprar, pregunte algo de SUNAT, pida descuento, pida hablar con una '
    + 'persona, se ponga agresivo, o preguntes algo que no sabes con certeza.',
  input_schema: {
    type: 'object',
    properties: {
      motivo: {
        type: 'string',
        enum: ['quiere_comprar', 'pregunta_sunat', 'pide_descuento', 'pide_persona', 'molesto', 'no_se'],
      },
      resumen: { type: 'string', description: 'Dos líneas: quién es y qué necesita.' },
    },
    required: ['motivo', 'resumen'],
  },
}]

/**
 * @param {string} apiKey
 * @param {string} guion  el system prompt, armado desde los datos reales
 * @param {Array<{rol:'cliente'|'asistente', texto:string}>} mensajes
 */
export async function responder({ apiKey, guion, mensajes }) {
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1024,
      // El guion se marca como cacheable: son 20 KB que no cambian entre
      // mensajes, y sin esto se pagan enteros en cada respuesta.
      system: [{ type: 'text', text: guion, cache_control: { type: 'ephemeral' } }],
      tools: HERRAMIENTAS,
      messages: mensajes.map((m) => ({
        role: m.rol === 'cliente' ? 'user' : 'assistant',
        content: String(m.texto || '').slice(0, 4000),
      })),
    }),
  })

  if (!r.ok) {
    const cuerpo = await r.text()
    throw new Error(`Claude respondió ${r.status}: ${cuerpo.slice(0, 400)}`)
  }

  const data = await r.json()
  const texto = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
  const escalada = (data.content || []).find((b) => b.type === 'tool_use' && b.name === 'pasarleAGiacomo')

  return {
    texto,
    escalada: escalada ? escalada.input : null,
    uso: {
      entrada: data.usage?.input_tokens ?? 0,
      salida: data.usage?.output_tokens ?? 0,
      cacheEscrito: data.usage?.cache_creation_input_tokens ?? 0,
      cacheLeido: data.usage?.cache_read_input_tokens ?? 0,
    },
  }
}
