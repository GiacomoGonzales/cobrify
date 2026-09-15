/**
 * PÍXELES DE PUBLICIDAD del catálogo online: Meta, TikTok, Google Analytics y
 * Pinterest.
 *
 * Pedido de CITEX (Luis Ponce, 14-set-2026): sus campañas necesitan saber qué
 * pasa en la tienda. Los IDs se pegan en Configuración > Mi Catálogo Online >
 * Apariencia > Píxeles de publicidad y sirven a cualquier negocio.
 *
 * Solo se cargan con el permiso del comprador (components/catalog/AvisoDeCookies):
 * la ley 29733 y la política de privacidad de CITEX lo piden así. Sin permiso
 * no se inyecta ningún script, y `eventoDePixel` no hace nada.
 *
 * Un solo vocabulario de eventos, traducido a cada red:
 *   pagina     → PageView         / page             / page_view      / page
 *   producto   → ViewContent      / ViewContent      / view_item      / pagevisit
 *   alCarrito  → AddToCart        / AddToCart        / add_to_cart    / addtocart
 *   carrito    → InitiateCheckout / InitiateCheckout / begin_checkout / —
 *   pedido     → Purchase         / PlaceAnOrder     / purchase       / checkout
 * (Meta / TikTok / Google / Pinterest). Un pedido por WhatsApp cuenta como
 * pedido: es lo que la tienda puede saber.
 */

const limpiar = (v) => String(v || '').trim().replace(/[^A-Za-z0-9_-]/g, '')

/** Los cuatro IDs, saneados: solo letras, números, guion y guion bajo. */
export function normalizarPixeles(p) {
  return {
    meta: limpiar(p?.meta),
    tiktok: limpiar(p?.tiktok),
    google: limpiar(p?.google),
    pinterest: limpiar(p?.pinterest),
  }
}

/** ¿El negocio configuró al menos un píxel? */
export function hayPixeles(p) {
  const n = normalizarPixeles(p)
  return !!(n.meta || n.tiktok || n.google || n.pinterest)
}

/** Nombres para mostrar en el aviso de cookies, en el orden en que se configuraron. */
export function redesConPixel(p) {
  const n = normalizarPixeles(p)
  const nombres = []
  if (n.meta) nombres.push('Meta')
  if (n.tiktok) nombres.push('TikTok')
  if (n.google) nombres.push('Google')
  if (n.pinterest) nombres.push('Pinterest')
  return nombres
}

// ── Consentimiento del comprador (por negocio, en su navegador) ────────────
const claveDeConsentimiento = (businessId) => `catalogo_cookies_${businessId}`

/** 'si', 'no', o null si todavía no decidió. */
export function leerConsentimiento(businessId) {
  try {
    const v = localStorage.getItem(claveDeConsentimiento(businessId))
    return v === 'si' || v === 'no' ? v : null
  } catch {
    return null
  }
}

export function guardarConsentimiento(businessId, acepta) {
  try {
    localStorage.setItem(claveDeConsentimiento(businessId), acepta ? 'si' : 'no')
  } catch {
    // Sin almacenamiento (modo privado): la decisión vale para esta visita.
  }
}

/** El aviso de cookies (components/catalog/AvisoDeCookies) escucha este evento para volver a mostrarse. */
export const EVENTO_PREFERENCIAS_COOKIES = 'catalogo:cookies'

/** Vuelve a mostrar el aviso de cookies para cambiar la decisión (el botón "Cookies" de un pie). */
export function abrirPreferenciasDeCookies() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_PREFERENCIAS_COOKIES))
}

// ── Carga de los scripts (una vez por ID) ──────────────────────────────────
const cargados = { meta: '', tiktok: '', google: '', pinterest: '' }

const inyectar = (src) => {
  const s = document.createElement('script')
  s.async = true
  s.src = src
  document.head.appendChild(s)
}

// El snippet oficial de Meta, escrito legible: una cola hasta que baja fbevents.js.
function cargarMeta(id) {
  if (!window.fbq) {
    const fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments)
      else fbq.queue.push(arguments)
    }
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.queue = []
    window.fbq = fbq
    if (!window._fbq) window._fbq = fbq
    inyectar('https://connect.facebook.net/en_US/fbevents.js')
  }
  window.fbq('init', id)
}

// El snippet oficial de TikTok, escrito legible.
function cargarTikTok(id) {
  if (!window.ttq) {
    const ttq = []
    window.TiktokAnalyticsObject = 'ttq'
    window.ttq = ttq
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent']
    ttq.setAndDefer = (t, e) => {
      t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) }
    }
    for (const m of ttq.methods) ttq.setAndDefer(ttq, m)
    ttq.instance = (t) => {
      const e = ttq._i[t] || []
      for (const m of ttq.methods) ttq.setAndDefer(e, m)
      return e
    }
    ttq.load = (e, n) => {
      const r = 'https://analytics.tiktok.com/i18n/pixel/events.js'
      ttq._i = ttq._i || {}
      ttq._i[e] = []
      ttq._i[e]._u = r
      ttq._t = ttq._t || {}
      ttq._t[e] = +new Date()
      ttq._o = ttq._o || {}
      ttq._o[e] = n || {}
      inyectar(`${r}?sdkid=${e}&lib=ttq`)
    }
  }
  window.ttq.load(id)
}

// Google Analytics 4 (gtag). La visita se manda a mano en 'pagina', así una
// tienda de varias páginas cuenta cada una.
function cargarGoogle(id) {
  window.dataLayer = window.dataLayer || []
  if (!window.gtag) {
    window.gtag = function () { window.dataLayer.push(arguments) }
  }
  inyectar(`https://www.googletagmanager.com/gtag/js?id=${id}`)
  window.gtag('js', new Date())
  window.gtag('config', id, { send_page_view: false })
}

// El snippet oficial de Pinterest, escrito legible.
function cargarPinterest(id) {
  if (!window.pintrk) {
    window.pintrk = function () { window.pintrk.queue.push(Array.prototype.slice.call(arguments)) }
    window.pintrk.queue = []
    window.pintrk.version = '3.0'
    inyectar('https://s.pinimg.com/ct/core.js')
  }
  window.pintrk('load', id)
}

/**
 * Carga los píxeles configurados. Idempotente: el mismo ID no se carga dos
 * veces. No manda ninguna visita: eso lo hace `eventoDePixel('pagina')`.
 * @returns {boolean} si quedó al menos uno cargado
 */
export function cargarPixeles(pixeles) {
  if (typeof window === 'undefined') return false
  const p = normalizarPixeles(pixeles)
  const cargadores = { meta: cargarMeta, tiktok: cargarTikTok, google: cargarGoogle, pinterest: cargarPinterest }
  for (const red of Object.keys(cargadores)) {
    if (p[red] && cargados[red] !== p[red]) {
      try {
        cargadores[red](p[red])
        cargados[red] = p[red]
      } catch (e) {
        console.warn(`No se pudo cargar el píxel de ${red}:`, e)
      }
    }
  }
  return !!(cargados.meta || cargados.tiktok || cargados.google || cargados.pinterest)
}

// ── Eventos ────────────────────────────────────────────────────────────────
const num = (v) => Math.round((Number(v) || 0) * 100) / 100
const contenidoMeta = (items) => items.map((i) => ({ id: String(i.id), quantity: i.cantidad || 1, item_price: num(i.precio) }))
const contenidoTikTok = (items) => items.map((i) => ({ content_id: String(i.id), content_name: i.nombre, content_type: 'product', price: num(i.precio), quantity: i.cantidad || 1 }))
const itemsGoogle = (items) => items.map((i) => ({ item_id: String(i.id), item_name: i.nombre, price: num(i.precio), quantity: i.cantidad || 1 }))
const lineasPinterest = (items) => items.map((i) => ({ product_id: String(i.id), product_name: i.nombre, product_price: num(i.precio), product_quantity: i.cantidad || 1 }))

/**
 * Manda un evento a todos los píxeles cargados. Si no hay ninguno (sin IDs o
 * sin permiso del comprador) no hace nada, así se puede llamar desde cualquier
 * lado sin preguntar antes.
 *
 * @param {'pagina'|'producto'|'alCarrito'|'carrito'|'pedido'} nombre
 * @param {{ items?: Array<{id, nombre, precio, cantidad}>, valor?: number, moneda?: string, id?: string }} datos
 */
export function eventoDePixel(nombre, datos = {}) {
  if (!cargados.meta && !cargados.tiktok && !cargados.google && !cargados.pinterest) return
  const items = Array.isArray(datos.items) ? datos.items.filter(Boolean) : []
  const valor = num(datos.valor)
  const moneda = datos.moneda || 'PEN'
  const fbq = cargados.meta && typeof window.fbq === 'function' ? window.fbq : null
  const ttq = cargados.tiktok && window.ttq ? window.ttq : null
  const gtag = cargados.google && typeof window.gtag === 'function' ? window.gtag : null
  const pintrk = cargados.pinterest && typeof window.pintrk === 'function' ? window.pintrk : null

  try {
    switch (nombre) {
      case 'pagina':
        if (fbq) fbq('track', 'PageView')
        if (ttq) ttq.page()
        if (gtag) gtag('event', 'page_view', { page_location: window.location.href, page_title: document.title })
        if (pintrk) pintrk('page')
        break
      case 'producto': {
        const [i] = items
        if (!i) return
        if (fbq) fbq('track', 'ViewContent', { content_ids: [String(i.id)], content_name: i.nombre, content_type: 'product', value: valor, currency: moneda })
        if (ttq) ttq.track('ViewContent', { contents: contenidoTikTok(items), value: valor, currency: moneda })
        if (gtag) gtag('event', 'view_item', { currency: moneda, value: valor, items: itemsGoogle(items) })
        if (pintrk) pintrk('track', 'pagevisit', { product_id: String(i.id), product_name: i.nombre, value: valor, currency: moneda })
        break
      }
      case 'alCarrito':
        if (fbq) fbq('track', 'AddToCart', { content_ids: items.map((i) => String(i.id)), content_type: 'product', contents: contenidoMeta(items), value: valor, currency: moneda })
        if (ttq) ttq.track('AddToCart', { contents: contenidoTikTok(items), value: valor, currency: moneda })
        if (gtag) gtag('event', 'add_to_cart', { currency: moneda, value: valor, items: itemsGoogle(items) })
        if (pintrk) pintrk('track', 'addtocart', { value: valor, currency: moneda, line_items: lineasPinterest(items) })
        break
      case 'carrito':
        if (fbq) fbq('track', 'InitiateCheckout', { content_ids: items.map((i) => String(i.id)), content_type: 'product', contents: contenidoMeta(items), num_items: items.reduce((s, i) => s + (i.cantidad || 1), 0), value: valor, currency: moneda })
        if (ttq) ttq.track('InitiateCheckout', { contents: contenidoTikTok(items), value: valor, currency: moneda })
        if (gtag) gtag('event', 'begin_checkout', { currency: moneda, value: valor, items: itemsGoogle(items) })
        break
      case 'pedido': {
        const id = datos.id || `pedido-${Date.now()}`
        if (fbq) fbq('track', 'Purchase', { content_ids: items.map((i) => String(i.id)), content_type: 'product', contents: contenidoMeta(items), num_items: items.reduce((s, i) => s + (i.cantidad || 1), 0), value: valor, currency: moneda })
        if (ttq) ttq.track('PlaceAnOrder', { contents: contenidoTikTok(items), value: valor, currency: moneda })
        if (gtag) gtag('event', 'purchase', { transaction_id: id, currency: moneda, value: valor, items: itemsGoogle(items) })
        if (pintrk) pintrk('track', 'checkout', { value: valor, currency: moneda, order_id: id, order_quantity: items.reduce((s, i) => s + (i.cantidad || 1), 0), line_items: lineasPinterest(items) })
        break
      }
      default:
    }
  } catch (e) {
    // Un píxel roto nunca puede romper la tienda.
    console.warn(`Píxel (${nombre}):`, e)
  }
}
