import crypto from 'crypto'

/**
 * WhatsApp Cloud API — utilidades del webhook.
 *
 * El endpoint del webhook es PUBLICO: Meta tiene que poder llamarlo sin
 * credenciales. Lo unico que separa un mensaje real de uno inventado por
 * cualquiera que descubra la URL es la firma que Meta pone en cada envio,
 * calculada con el App Secret. Por eso se verifica SIEMPRE.
 */

/**
 * Verifica la cabecera X-Hub-Signature-256 de Meta.
 *
 * Se compara contra el cuerpo CRUDO (bytes tal como llegaron), no contra el
 * JSON reinterpretado: cualquier reserializacion cambia espacios o el orden de
 * las claves y la firma deja de coincidir.
 *
 * @param {Buffer|string} rawBody cuerpo crudo del request
 * @param {string} signatureHeader valor de x-hub-signature-256 ("sha256=...")
 * @param {string} appSecret App Secret de la app de Meta
 * @returns {boolean}
 */
export function verifyWhatsappSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !rawBody) return false
  const esperado = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')

  const a = Buffer.from(esperado)
  const b = Buffer.from(String(signatureHeader))
  // Comparacion en tiempo constante: un === corriente filtra, por el tiempo que
  // tarda en fallar, cuantos caracteres del principio acerto quien lo intenta.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Aplana el payload del webhook a una lista de eventos faciles de guardar.
 *
 * Meta anida todo en entry[].changes[].value, y en un mismo POST pueden venir
 * mensajes de varias conversaciones y actualizaciones de estado mezcladas.
 *
 * @returns {{mensajes: Array, estados: Array}}
 */
export function parseWhatsappWebhook(body) {
  const mensajes = []
  const estados = []

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value
      if (!value) continue

      const cuenta = {
        wabaId: entry.id || null,
        phoneNumberId: value.metadata?.phone_number_id || null,
        displayNumber: value.metadata?.display_phone_number || null,
      }

      // Nombre del contacto: Meta lo manda aparte de los mensajes, indexado por
      // wa_id. Se arma el mapa antes para poder pegarlo a cada mensaje.
      const nombres = {}
      for (const c of value.contacts || []) {
        if (c?.wa_id) nombres[c.wa_id] = c.profile?.name || null
      }

      for (const m of value.messages || []) {
        mensajes.push({
          cuenta,
          waMessageId: m.id,
          waId: m.from,
          nombre: nombres[m.from] || null,
          tipo: m.type || 'unknown',
          // El timestamp de Meta viene en SEGUNDOS.
          timestamp: Number(m.timestamp) * 1000,
          texto: extraerTexto(m),
          // Los archivos se guardan por referencia: bajarlos necesita el token
          // de acceso y se hace aparte, no dentro del webhook.
          media: extraerMedia(m),
          respondeA: m.context?.id || null,
          crudo: m,
        })
      }

      for (const s of value.statuses || []) {
        estados.push({
          cuenta,
          waMessageId: s.id,
          estado: s.status || null,
          timestamp: Number(s.timestamp) * 1000,
          waId: s.recipient_id || null,
          error: s.errors?.[0]?.title || null,
        })
      }
    }
  }

  return { mensajes, estados }
}

function extraerTexto(m) {
  if (m.type === 'text') return m.text?.body || ''
  // Los botones y listas llegan como tipos propios; para la bandeja lo util es
  // lo que el cliente vio y toco.
  if (m.type === 'button') return m.button?.text || ''
  if (m.type === 'interactive') {
    return m.interactive?.button_reply?.title
      || m.interactive?.list_reply?.title
      || ''
  }
  // Las imagenes y videos pueden traer pie de foto.
  return m[m.type]?.caption || ''
}

function extraerMedia(m) {
  const conMedia = ['image', 'video', 'audio', 'document', 'sticker']
  if (!conMedia.includes(m.type)) return null
  const d = m[m.type] || {}
  return {
    mediaId: d.id || null,
    mimeType: d.mime_type || null,
    filename: d.filename || null,
    sha256: d.sha256 || null,
  }
}

/** Milisegundos que dura la ventana de servicio de WhatsApp. */
export const VENTANA_24H_MS = 24 * 60 * 60 * 1000

/** Version de la Graph API. Debe coincidir con la que la app tiene configurada. */
const GRAPH_VERSION = 'v26.0'

/**
 * Envia un mensaje de texto por la Cloud API.
 *
 * @param {Object} p
 * @param {string} p.token        token permanente (WHATSAPP_TOKEN)
 * @param {string} p.phoneNumberId numero de la empresa que envia
 * @param {string} p.to           numero del destinatario (solo digitos)
 * @param {string} p.texto
 * @returns {Promise<{waMessageId: string}>}
 */
export async function sendWhatsappText({ token, phoneNumberId, to, texto }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      // preview_url: que los enlaces se vean con su tarjeta, como en WhatsApp normal.
      text: { preview_url: true, body: texto },
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // El error de Meta viene anidado y con codigo propio; se propaga tal cual
    // para poder mostrarselo al usuario en vez de un "fallo" generico.
    const msg = data?.error?.message || `Error ${res.status} de Meta`
    const err = new Error(msg)
    err.metaCode = data?.error?.code || null
    err.metaSubcode = data?.error?.error_subcode || null
    throw err
  }

  const waMessageId = data?.messages?.[0]?.id
  if (!waMessageId) throw new Error('Meta acepto el envio pero no devolvio el id del mensaje')
  return { waMessageId }
}

/**
 * Descarga un archivo recibido por WhatsApp.
 *
 * Son dos pasos porque asi lo diseño Meta: primero se pide la ficha del
 * archivo (que trae una URL temporal) y despues se baja de esa URL, ambas con
 * el token. La URL caduca en minutos: por eso el archivo se baja APENAS llega
 * y se guarda en almacenamiento propio, no cuando alguien abre el chat.
 *
 * @returns {Promise<{buffer: Buffer, mimeType: string}>}
 */
export async function downloadWhatsappMedia({ token, mediaId }) {
  const fichaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const ficha = await fichaRes.json().catch(() => ({}))
  if (!fichaRes.ok || !ficha.url) {
    throw new Error(ficha?.error?.message || `Meta no entrego la ficha del archivo ${mediaId}`)
  }

  const archivoRes = await fetch(ficha.url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!archivoRes.ok) {
    throw new Error(`No se pudo descargar el archivo (${archivoRes.status})`)
  }
  const buffer = Buffer.from(await archivoRes.arrayBuffer())
  return { buffer, mimeType: ficha.mime_type || 'application/octet-stream' }
}

/** Extension de archivo a partir del tipo MIME de WhatsApp. */
export function extensionDeMime(mimeType) {
  const mapa = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/3gpp': '3gp',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
    'audio/aac': 'aac', 'audio/amr': 'amr',
    'application/pdf': 'pdf',
  }
  const base = String(mimeType || '').split(';')[0].trim()
  return mapa[base] || base.split('/')[1] || 'bin'
}

/**
 * Envia un archivo por la Cloud API, referenciado por URL publica (nuestro
 * R2). Mas simple y robusto que subir el binario a Meta: el archivo ya queda
 * guardado en nuestro almacenamiento de paso.
 *
 * @param {Object} p
 * @param {'image'|'document'|'video'|'audio'} p.tipo
 * @param {string} p.link URL publica del archivo
 * @param {string} [p.caption] pie (imagenes, videos y documentos)
 * @param {string} [p.filename] nombre visible (solo documentos)
 */
export async function sendWhatsappMedia({ token, phoneNumberId, to, tipo, link, caption, filename }) {
  const cuerpoMedia = { link }
  if (caption && tipo !== 'audio') cuerpoMedia.caption = caption
  if (filename && tipo === 'document') cuerpoMedia.filename = filename

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: tipo,
      [tipo]: cuerpoMedia,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `Error ${res.status} de Meta`
    const err = new Error(msg)
    err.metaCode = data?.error?.code || null
    throw err
  }
  const waMessageId = data?.messages?.[0]?.id
  if (!waMessageId) throw new Error('Meta acepto el envio pero no devolvio el id del mensaje')
  return { waMessageId }
}

// =================== VISTA PREVIA DE ENLACES ===================
// WhatsApp muestra los enlaces con su tarjeta (imagen, titulo, descripcion).
// Para que la bandeja se vea igual, el servidor lee esos datos de la pagina en
// el momento del mensaje y los guarda JUNTO al mensaje: la tarjeta queda
// congelada como estaba ese dia, y la bandeja no tiene que salir a internet
// (el navegador ademas no podria, por CORS).

/** El primer enlace http(s) dentro de un texto, o null. */
export function extraerPrimeraUrl(texto) {
  const m = String(texto || '').match(/https?:\/\/[^\s<>"]+/i)
  return m ? m[0].replace(/[).,;!?]+$/, '') : null
}

/**
 * Lee titulo, descripcion e imagen OG de una pagina. Tolerante a fallos: si la
 * pagina tarda, bloquea robots o no tiene etiquetas, devuelve null y el
 * mensaje se muestra como enlace pelado — nunca se frena un mensaje por esto.
 */
export async function obtenerVistaPreviaDeEnlace(url) {
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 5000)
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        // Algunos hosting devuelven 403 sin User-Agent (nos paso con SiteGround).
        'User-Agent': 'Mozilla/5.0 (compatible; CobrifyChat/1.0; +https://cobrifyperu.com)',
        Accept: 'text/html',
      },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const tipo = res.headers.get('content-type') || ''
    if (!tipo.includes('text/html')) return null

    // Con los primeros ~200 KB alcanza: las etiquetas OG viven en el <head>.
    const html = (await res.text()).slice(0, 200000)

    const meta = (prop) => {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']|` +
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
        'i',
      )
      const m = html.match(re)
      return m ? (m[1] || m[2]) : null
    }

    const titulo = meta('og:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || null)
    if (!titulo) return null

    let imagen = meta('og:image')
    // Imagen relativa -> absoluta, que el navegador de la bandeja no adivina.
    if (imagen && !/^https?:\/\//i.test(imagen)) {
      try { imagen = new URL(imagen, url).href } catch { imagen = null }
    }

    return {
      url,
      titulo: decodificarEntidades(titulo).slice(0, 150),
      descripcion: decodificarEntidades(meta('og:description') || meta('description') || '').slice(0, 200) || null,
      imagen: imagen || null,
      sitio: new URL(url).hostname.replace(/^www\./, ''),
    }
  } catch {
    return null
  }
}

function decodificarEntidades(t) {
  return String(t)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
}
