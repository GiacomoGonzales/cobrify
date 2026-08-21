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
