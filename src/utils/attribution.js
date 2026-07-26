/**
 * Atribución de tráfico: de dónde viene cada visita a la landing.
 *
 * Antes no se medía nada (ni Analytics, ni píxeles, ni referrer), así que era
 * imposible saber si los clientes llegaban por Google, por publicidad o por
 * recomendación. Esto captura el origen en la primera visita y lo conserva hasta
 * el registro, para poder responder lo que de verdad importa: qué canal trae
 * clientes que PAGAN, no solo visitas.
 *
 * Se usa atribución de "primer contacto": si alguien llega por un anuncio y
 * vuelve dos días después escribiendo la URL, el mérito queda en el anuncio.
 */

const STORAGE_KEY = 'cobrify_attribution'

/** Fuentes conocidas por dominio de procedencia. */
const REFERRER_MAP = [
  { test: /(^|\.)google\./i, source: 'google', medium: 'organico' },
  { test: /(^|\.)bing\./i, source: 'bing', medium: 'organico' },
  { test: /duckduckgo\./i, source: 'duckduckgo', medium: 'organico' },
  { test: /(^|\.)(facebook|fb)\./i, source: 'facebook', medium: 'social' },
  { test: /instagram\./i, source: 'instagram', medium: 'social' },
  { test: /tiktok\./i, source: 'tiktok', medium: 'social' },
  { test: /(youtube\.|youtu\.be)/i, source: 'youtube', medium: 'social' },
  { test: /(whatsapp\.|wa\.me)/i, source: 'whatsapp', medium: 'mensajeria' },
  { test: /(t\.co|twitter\.|x\.com)/i, source: 'twitter', medium: 'social' },
  { test: /linkedin\./i, source: 'linkedin', medium: 'social' },
  { test: /(^|\.)yahoo\./i, source: 'yahoo', medium: 'organico' },
]

/**
 * Determina el origen de la visita actual.
 * Prioridad: parámetros de anuncios (gclid/fbclid) → UTM → referrer → directo.
 */
export function detectSource() {
  const params = new URLSearchParams(window.location.search)
  const referrer = document.referrer || ''

  // 1. Identificadores de clic de anuncios: la señal más confiable de que la
  //    visita vino de publicidad PAGA (los pone la plataforma automáticamente).
  if (params.get('gclid')) {
    return { source: 'google', medium: 'publicidad', campaign: params.get('utm_campaign') || 'google-ads', referrer }
  }
  if (params.get('fbclid')) {
    return { source: 'facebook', medium: 'publicidad', campaign: params.get('utm_campaign') || 'meta-ads', referrer }
  }
  if (params.get('ttclid')) {
    return { source: 'tiktok', medium: 'publicidad', campaign: params.get('utm_campaign') || 'tiktok-ads', referrer }
  }

  // 2. UTM explícitos (los que se arman a mano en cada campaña)
  const utmSource = params.get('utm_source')
  if (utmSource) {
    return {
      source: utmSource.toLowerCase().slice(0, 40),
      medium: (params.get('utm_medium') || 'referido').toLowerCase().slice(0, 40),
      campaign: (params.get('utm_campaign') || '').slice(0, 60),
      referrer,
    }
  }

  // 3. Sitio de procedencia
  if (referrer) {
    let host = ''
    try { host = new URL(referrer).hostname } catch { host = '' }
    // Navegación dentro del propio sitio: no es una fuente nueva
    if (host && host !== window.location.hostname) {
      const known = REFERRER_MAP.find(r => r.test.test(host))
      if (known) return { source: known.source, medium: known.medium, campaign: '', referrer }
      return { source: host.replace(/^www\./, '').slice(0, 40), medium: 'referido', campaign: '', referrer }
    }
  }

  // 4. Sin rastro: escribió la URL, la tenía guardada o vino de una app sin referrer
  return { source: 'directo', medium: 'directo', campaign: '', referrer: '' }
}

/** Devuelve la atribución guardada (primer contacto), o null. */
export function getStoredAttribution() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Guarda la atribución si es la PRIMERA visita de este navegador.
 * Devuelve { attribution, isFirstVisit }.
 */
export function captureAttribution() {
  const existing = getStoredAttribution()
  if (existing) return { attribution: existing, isFirstVisit: false }

  const detected = detectSource()
  const attribution = { ...detected, landedAt: new Date().toISOString() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution))
  } catch { /* modo incógnito o storage lleno: no rompe la visita */ }
  return { attribution, isFirstVisit: true }
}
