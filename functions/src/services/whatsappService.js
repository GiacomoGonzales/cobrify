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
export async function sendWhatsappText({ token, phoneNumberId, to, texto, contextId = null }) {
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
      // context: el "responder citando" de WhatsApp — el mensaje sale
      // enganchado al que se contesta.
      ...(contextId ? { context: { message_id: contextId } } : {}),
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
 * Envia (o quita) una reaccion a un mensaje. emoji vacio = quitarla.
 * @returns {Promise<{waMessageId: string}>}
 */
export async function sendWhatsappReaction({ token, phoneNumberId, to, messageId, emoji }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji: emoji || '' },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Error ${res.status} de Meta`)
    err.metaCode = data?.error?.code || null
    throw err
  }
  return { waMessageId: data?.messages?.[0]?.id || null }
}

/**
 * Marca un mensaje entrante como leido: el cliente ve sus palomitas azules.
 * Falla en silencio aguas arriba: perder un read receipt no es grave.
 */
export async function markWhatsappMessageRead({ token, phoneNumberId, messageId }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Error ${res.status} de Meta`)
    err.metaCode = data?.error?.code || null
    throw err
  }
  return { ok: true }
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
export async function sendWhatsappMedia({ token, phoneNumberId, to, tipo, link, caption, filename, contextId = null }) {
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
      // Citar tambien al mandar un archivo.
      ...(contextId ? { context: { message_id: contextId } } : {}),
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

// =================== PLANTILLAS (Fase 4) ===================
// Fuera de la ventana de 24 horas, WhatsApp solo deja escribir con una
// plantilla aprobada por Meta. Las plantillas viven en la cuenta de WhatsApp
// (WABA), no en la app: se listan por la API y se guardan en Firestore para
// que la bandeja las tenga a mano sin consultar Meta cada vez.

/** Lista las plantillas de la cuenta, con su estado y sus componentes. */
export async function listWhatsappTemplates({ token, wabaId }) {
  const todas = []
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`
    + '?fields=name,status,category,language,components,rejected_reason&limit=100'
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error?.message || `Error ${res.status} listando plantillas`)
    todas.push(...(data.data || []))
    url = data.paging?.next || null
  }
  return todas.map(t => ({
    id: t.id,
    name: t.name,
    status: t.status,
    category: t.category,
    language: t.language,
    rejectedReason: t.rejected_reason || null,
    // Se conserva la estructura tal cual la manda Meta: HEADER (TEXT/IMAGE/...),
    // BODY con {{n}}, FOOTER y BUTTONS. La bandeja la usa para pedir los
    // valores y para armar la vista previa.
    components: t.components || [],
  }))
}

/**
 * Texto final de una plantilla con sus valores puestos, para guardarlo en el
 * mensaje y mostrarlo en la bandeja tal como lo vio el cliente.
 */
export function renderTemplateText(components, bodyValues = [], headerText = null) {
  const partes = []
  for (const c of components || []) {
    if (c.type === 'HEADER' && c.format === 'TEXT' && c.text) {
      partes.push(headerText ? c.text.replace('{{1}}', headerText) : c.text)
    } else if (c.type === 'BODY' && c.text) {
      let t = c.text
      bodyValues.forEach((v, i) => { t = t.split(`{{${i + 1}}}`).join(v ?? '') })
      partes.push(t)
    } else if (c.type === 'FOOTER' && c.text) {
      partes.push(c.text)
    }
  }
  return partes.join('\n\n')
}

/**
 * Envia una plantilla. Arma los componentes con parametros en el formato de
 * Meta: cabecera (texto o imagen por URL) y cuerpo ({{1}}, {{2}}...).
 */
export async function sendWhatsappTemplate({
  token, phoneNumberId, to, name, language,
  bodyValues = [], headerText = null, headerImageUrl = null,
}) {
  const components = []
  if (headerImageUrl) {
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: headerImageUrl } }] })
  } else if (headerText) {
    components.push({ type: 'header', parameters: [{ type: 'text', text: headerText }] })
  }
  if (bodyValues.length) {
    components.push({
      type: 'body',
      parameters: bodyValues.map(v => ({ type: 'text', text: String(v ?? '') })),
    })
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name,
        language: { code: language || 'es' },
        ...(components.length ? { components } : {}),
      },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Error ${res.status} de Meta`)
    err.metaCode = data?.error?.code || null
    err.metaDetails = data?.error?.error_data?.details || null
    throw err
  }
  const waMessageId = data?.messages?.[0]?.id
  if (!waMessageId) throw new Error('Meta acepto la plantilla pero no devolvio el id del mensaje')
  return { waMessageId }
}

/**
 * Baja voluntaria: si el cliente pide que no le escriban mas, se respeta para
 * siempre en campanas. Se detecta con frases tipicas; el admin puede
 * revertirlo a mano desde la ficha si fue un malentendido.
 */
export function pareceBajaVoluntaria(texto) {
  const t = String(texto || '').trim().toLowerCase()
  if (!t || t.length > 80) return false
  return /^(no enviar|no me envi|no quiero recibir|no mas mensajes|no m[aá]s mensajes|baja|stop|cancelar|dar de baja|darme de baja|dejen de escribir|no me escriban|no molestar)/.test(t)
}

// =================== PERFIL DEL NEGOCIO ===================
// Lo que el cliente ve al tocar el nombre en su WhatsApp: foto, descripcion,
// direccion, correo, web, rubro. Se edita por la API; el NOMBRE VISIBLE no
// (eso requiere aprobacion de Meta y se cambia en WhatsApp Manager).

const CAMPOS_PERFIL = 'about,address,description,email,profile_picture_url,websites,vertical'

export async function getWhatsappBusinessProfile({ token, phoneNumberId }) {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/whatsapp_business_profile?fields=${CAMPOS_PERFIL}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Error ${res.status} leyendo el perfil`)
  const p = data?.data?.[0] || {}
  return {
    about: p.about || '',
    address: p.address || '',
    description: p.description || '',
    email: p.email || '',
    websites: p.websites || [],
    vertical: p.vertical || '',
    profilePictureUrl: p.profile_picture_url || null,
  }
}

/**
 * Sube la foto de perfil por la API de carga reanudable de Meta y devuelve el
 * "handle" que el perfil acepta. Son dos pasos (abrir sesion, subir bytes).
 */
export async function uploadWhatsappProfilePhoto({ token, appId, buffer, mimeType }) {
  const abrir = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  )
  const sesion = await abrir.json().catch(() => ({}))
  if (!abrir.ok || !sesion.id) throw new Error(sesion?.error?.message || 'No se pudo abrir la sesion de carga')

  const subir = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${sesion.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: '0',
      'Content-Type': mimeType,
    },
    body: buffer,
  })
  const resultado = await subir.json().catch(() => ({}))
  if (!subir.ok || !resultado.h) throw new Error(resultado?.error?.message || 'No se pudo subir la foto')
  return resultado.h
}

export async function updateWhatsappBusinessProfile({ token, phoneNumberId, campos, profilePictureHandle = null }) {
  const cuerpo = { messaging_product: 'whatsapp' }
  for (const k of ['about', 'address', 'description', 'email', 'vertical']) {
    if (campos[k] !== undefined) cuerpo[k] = String(campos[k] ?? '')
  }
  if (Array.isArray(campos.websites)) cuerpo.websites = campos.websites.filter(Boolean).slice(0, 2)
  if (profilePictureHandle) cuerpo.profile_picture_handle = profilePictureHandle

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/whatsapp_business_profile`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.error_user_msg || data?.error?.message || `Error ${res.status} guardando el perfil`)
  return data
}

// =================== HORARIO DE ATENCION ===================
/** ¿Ahora cae dentro del horario? horario = { dias:[1..7 lun=1], desde:'09:00', hasta:'18:00' } en hora de Lima. */
export function dentroDelHorario(horario, fecha = new Date()) {
  if (!horario) return true
  // Hora de Lima sin depender de la zona del servidor.
  const lima = new Date(fecha.toLocaleString('en-US', { timeZone: 'America/Lima' }))
  const dia = lima.getDay() === 0 ? 7 : lima.getDay() // lun=1 ... dom=7
  if (Array.isArray(horario.dias) && horario.dias.length && !horario.dias.includes(dia)) return false
  const [hd, md] = String(horario.desde || '00:00').split(':').map(Number)
  const [hh, mh] = String(horario.hasta || '23:59').split(':').map(Number)
  const minutos = lima.getHours() * 60 + lima.getMinutes()
  return minutos >= hd * 60 + md && minutos <= hh * 60 + mh
}
