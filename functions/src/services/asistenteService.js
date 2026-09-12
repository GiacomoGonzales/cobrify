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
 *
 * `usarRespuestaRapida` sigue la misma idea: el modelo no reescribe a su
 * manera el mensaje de precios, manda el de Giacomo, con su imagen o su video.
 * El texto y el archivo los elige Giacomo en la bandeja; la IA solo decide
 * cuál calza con lo que el cliente pidió.
 */

const API = 'https://api.anthropic.com/v1/messages'
const MODELO = 'claude-sonnet-5'

/** Cuántas respuestas rápidas puede mandar de una vez: más es bombardear. */
const MAX_RAPIDAS = 2

/** Cómo nombrar cada tipo de archivo en el guion. */
const TIPOS = { image: 'una imagen', video: 'un video', document: 'un documento', audio: 'un audio' }

const PASARLE = {
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
}

// No nombra los atajos a propósito: la herramienta va antes que el guion en lo
// que Claude guarda en caché, y si cambiara con cada respuesta rápida editada,
// se perdería la caché de los 20 KB del guion. La lista va en el guion y el
// atajo se valida acá (`atajosPedidos`).
const USAR_RAPIDA = {
  name: 'usarRespuestaRapida',
  description: 'Manda tal cual una respuesta rápida de Giacomo, con su imagen, video '
    + 'o archivo. Cuáles hay y qué dice cada una está en RESPUESTAS RÁPIDAS DE GIACOMO.',
  input_schema: {
    type: 'object',
    properties: {
      atajo: { type: 'string', description: 'El atajo exacto, como está en la lista, sin comillas.' },
    },
    required: ['atajo'],
  },
}

/**
 * Las respuestas rápidas que la IA puede usar: las de la bandeja
 * (whatsappSettings/automaticos → respuestasRapidas), menos las que Giacomo le
 * apagó en la página Asistente (respuestasIA[atajo].usar === false). Cada una
 * lleva, si él la escribió, la nota de cuándo usarla. Sin atajo, o sin texto
 * ni archivo, no sirven; con el atajo repetido vale la primera.
 */
export function respuestasParaLaIA({ respuestasRapidas, respuestasIA } = {}) {
  const ajustes = respuestasIA && typeof respuestasIA === 'object' ? respuestasIA : {}
  const lista = []
  const vistas = new Set()
  for (const r of Array.isArray(respuestasRapidas) ? respuestasRapidas : []) {
    const atajo = String(r?.atajo || '').trim()
    const texto = String(r?.texto || '').trim()
    const media = r?.media?.url ? r.media : null
    if (!atajo || vistas.has(atajo) || (!texto && !media)) continue
    vistas.add(atajo)
    if (ajustes[atajo]?.usar === false) continue
    lista.push({ atajo, texto, media, cuando: String(ajustes[atajo]?.cuando || '').trim() })
  }
  return lista
}

/** La lista para el guion: qué dice cada una, qué archivo lleva y cuándo usarla. */
export function bloqueDeRespuestas(lista) {
  if (!lista?.length) return ''
  const filas = lista.map((r) => {
    const archivo = r.media ? ` · lleva ${TIPOS[r.media.tipo] || 'un archivo'}` : ''
    const cuando = r.cuando ? ` · usarla: ${r.cuando}` : ''
    const plano = r.texto.replace(/\s+/g, ' ')
    const dice = plano ? `"${plano.length > 300 ? `${plano.slice(0, 300)}…` : plano}"` : '(solo el archivo, sin texto)'
    return `- «${r.atajo}»${archivo}${cuando} — dice: ${dice}`
  })
  return [
    'RESPUESTAS RÁPIDAS DE GIACOMO',
    'Mensajes que Giacomo ya tiene listos, muchos con su imagen, video o archivo. Se mandan '
      + 'con la herramienta usarRespuestaRapida y salen TAL CUAL, con el archivo.',
    'Si una responde lo que el cliente pide, úsala en vez de escribir tú lo mismo: dice lo '
      + 'que diría Giacomo y lleva su material. Antes puedes escribir una frase corta tuya. '
      + `Como mucho ${MAX_RAPIDAS} por respuesta, y nunca una que ya salió en esta conversación `
      + '(en el historial aparecen como "[Mandé la respuesta rápida «...»]").',
    '',
    ...filas,
  ].join('\n')
}

/** Los atajos que el modelo pidió mandar: solo los de la lista, sin repetir, hasta el tope. */
export function atajosPedidos(contenido, lista) {
  const validos = new Set((lista || []).map((r) => r.atajo))
  const pedidos = []
  for (const b of contenido || []) {
    if (b?.type !== 'tool_use' || b.name !== 'usarRespuestaRapida') continue
    const atajo = String(b.input?.atajo || '').trim().replace(/^[«"/]+|[»"]+$/g, '')
    if (validos.has(atajo) && !pedidos.includes(atajo)) pedidos.push(atajo)
  }
  return pedidos.slice(0, MAX_RAPIDAS)
}

/**
 * @param {string} apiKey
 * @param {string} guion  el system prompt, armado desde los datos reales
 * @param {Array<{rol:'cliente'|'asistente', texto:string}>} mensajes
 * @param {Array<{atajo:string, texto:string, media:object|null, cuando:string}>} respuestas
 *   las respuestas rápidas que puede mandar (ver `respuestasParaLaIA`)
 */
export async function responder({ apiKey, guion, mensajes, respuestas = [] }) {
  const bloque = bloqueDeRespuestas(respuestas)
  // El guion se marca como cacheable: son 20 KB que no cambian entre
  // mensajes, y sin esto se pagan enteros en cada respuesta. La lista de
  // respuestas rápidas va aparte y DESPUÉS: si Giacomo edita una, solo se
  // renueva la caché de la lista.
  const system = [{ type: 'text', text: guion, cache_control: { type: 'ephemeral' } }]
  if (bloque) system.push({ type: 'text', text: bloque, cache_control: { type: 'ephemeral' } })

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
      system,
      tools: respuestas.length ? [PASARLE, USAR_RAPIDA] : [PASARLE],
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
    respuestas: atajosPedidos(data.content, respuestas),
    uso: {
      entrada: data.usage?.input_tokens ?? 0,
      salida: data.usage?.output_tokens ?? 0,
      cacheEscrito: data.usage?.cache_creation_input_tokens ?? 0,
      cacheLeido: data.usage?.cache_read_input_tokens ?? 0,
    },
  }
}
