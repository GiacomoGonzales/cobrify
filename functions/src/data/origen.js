/**
 * DE DÓNDE VINO CADA CLIENTE, con una sola forma.
 *
 * Hasta ahora el origen se guardaba de dos maneras distintas: `acquisition` en
 * el negocio, con la forma que trae la landing (source/medium/campaign), y
 * `origenAnuncio` en la conversación de WhatsApp, con la forma que manda Meta.
 * Con referidos y Google Ads iban a ser cuatro, y cada pantalla que quisiera
 * contar tendría que conocerlas todas.
 *
 * Acá se traducen todas a lo mismo:
 *
 *   canal    de qué tipo de fuente vino. Lista cerrada, para poder AGRUPAR:
 *            si un día entra "facebook" y otro "fb", no suman.
 *   detalle  lo que lo identifica para una persona: el titular del anuncio,
 *            el buscador, quién lo refirió.
 *   id       lo que lo identifica para la máquina: el id del anuncio o el
 *            código del referido. Sirve para volver a la fuente exacta.
 *   fecha    cuándo se captó, en texto ISO.
 *
 * Este archivo NO importa nada a propósito, igual que `semilla.js`: lo leen
 * igual Node (las funciones) y Vite (el navegador).
 */

/** Los canales que sabemos contar. Todo lo demás cae en `otro`. */
export const CANALES = {
  META_ADS: 'meta-ads',
  GOOGLE_ADS: 'google-ads',
  REFERIDO: 'referido',
  ORGANICO: 'organico',
  SOCIAL: 'social',
  WHATSAPP: 'whatsapp',
  DIRECTO: 'directo',
  OTRO: 'otro',
}

/** Cómo se llama cada canal en pantalla. */
export const NOMBRE_CANAL = {
  [CANALES.META_ADS]: 'Anuncios de Meta',
  [CANALES.GOOGLE_ADS]: 'Anuncios de Google',
  [CANALES.REFERIDO]: 'Referido',
  [CANALES.ORGANICO]: 'Búsqueda',
  [CANALES.SOCIAL]: 'Redes sociales',
  [CANALES.WHATSAPP]: 'WhatsApp',
  [CANALES.DIRECTO]: 'Directo',
  [CANALES.OTRO]: 'Otro',
}

const corto = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

/** Arma el origen ya recortado; sin canal no se devuelve nada. */
function armar(canal, detalle, id, fecha) {
  if (!canal) return null
  return {
    canal,
    detalle: corto(detalle, 80),
    id: corto(id, 60),
    fecha: corto(fecha, 40) || new Date().toISOString(),
  }
}

/**
 * Lo que capturó la landing (`src/utils/attribution.js`) → origen.
 *
 * El `medium` manda sobre el `source`: "google / publicidad" es Google Ads y
 * "google / organico" es alguien que buscó. Mirar solo la fuente los mezclaría,
 * y son cosas opuestas — una cuesta plata y la otra no.
 */
export function origenDesdeLanding(attr) {
  if (!attr || typeof attr !== 'object') return null
  const fuente = corto(attr.source, 40).toLowerCase()
  const medio = corto(attr.medium, 40).toLowerCase()
  if (!fuente) return null

  let canal = CANALES.OTRO
  if (medio === 'publicidad') {
    canal = fuente === 'google' ? CANALES.GOOGLE_ADS
      : (fuente === 'facebook' || fuente === 'instagram') ? CANALES.META_ADS
        : CANALES.OTRO
  } else if (fuente === 'referido' || medio === 'referido-cliente') {
    canal = CANALES.REFERIDO
  } else if (medio === 'organico') {
    canal = CANALES.ORGANICO
  } else if (medio === 'social') {
    canal = CANALES.SOCIAL
  } else if (medio === 'mensajeria' || fuente === 'whatsapp') {
    canal = CANALES.WHATSAPP
  } else if (medio === 'directo' || fuente === 'directo') {
    canal = CANALES.DIRECTO
  }

  // El detalle: la campaña si la hay, si no el buscador o el sitio de donde vino.
  return armar(canal, attr.campaign || fuente, attr.campaign || '', attr.landedAt)
}

/**
 * El anuncio de Meta que trajo un lead a WhatsApp (`origenAnuncio` de la
 * conversación) → origen.
 *
 * El detalle es el TITULAR, que es lo que la persona leyó antes de escribir; el
 * id del anuncio no le dice nada a nadie mirando una tabla, pero es el que
 * sirve para volver a la campaña.
 */
export function origenDesdeAnuncio(anuncio) {
  if (!anuncio || typeof anuncio !== 'object') return null
  if (!anuncio.anuncioId && !anuncio.titular) return null
  return armar(CANALES.META_ADS, anuncio.titular || anuncio.anuncioId, anuncio.anuncioId, anuncio.fechaIso)
}

/** Un cliente que refirió a otro → origen. */
export function origenDesdeReferido(codigo, nombre) {
  if (!codigo) return null
  return armar(CANALES.REFERIDO, nombre || `Cliente ${codigo}`, String(codigo))
}

/**
 * Recorta cualquier cosa que llegue con forma de origen. Es la última puerta
 * antes de escribir: lo que no esté en la lista se descarta, y un canal
 * desconocido se guarda como `otro` en vez de ensuciar el conteo.
 */
export function limpiarOrigen(v) {
  if (!v || typeof v !== 'object') return null
  const canal = corto(v.canal, 30).toLowerCase()
  if (!canal) return null
  const conocido = Object.values(CANALES).includes(canal) ? canal : CANALES.OTRO
  return armar(conocido, v.detalle, v.id, v.fecha)
}
