/**
 * Servicio de Tipo de Cambio (TC) — soporte multi-divisa USD/PEN.
 *
 * Estrategia en capas:
 *   1) Override MANUAL guardado por el usuario para esa fecha (prioridad
 *      máxima, lo escribe Configuración o el formulario al emitir).
 *   2) CACHE local del día (localStorage, evita recursivos a la API).
 *   3) Fetch en vivo a la API SBS (apis.net.pe v2 — gratis, sin token).
 *
 * USO TÍPICO (Fase 1+):
 *   const tc = await getRateForDate()      // hoy
 *   const rate = tc?.sell || 3.80          // fallback razonable
 *
 * CRÍTICO:
 * - Al guardar una factura/compra en USD, persistir el `exchangeRate` en
 *   el documento. NUNCA recalcular reportes con TC actual; usar el que
 *   quedó congelado en cada documento.
 * - SUNAT toma como TC oficial el "tipo de cambio venta" del día.
 */

const LS_CACHE_PREFIX = 'cobrify_xchg_sbs_'
const LS_MANUAL_PREFIX = 'cobrify_xchg_manual_'
const SBS_ENDPOINT = 'https://api.apis.net.pe/v2/sunat/tipo-cambio'

// ---------- helpers de fecha ----------

const pad2 = (n) => String(n).padStart(2, '0')

/** Devuelve 'YYYY-MM-DD' en zona local del navegador. */
export function toIsoDate(date) {
  const d = date instanceof Date ? date : (date ? new Date(date) : new Date())
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// ---------- helpers localStorage ----------

const readLS = (key) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeLS = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* full / disabled */ }
}

const removeLS = (key) => {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

// ---------- API pública ----------

/**
 * Devuelve el TC USD/PEN para una fecha.
 *
 * Orden de búsqueda:
 *   1) Override manual del usuario para esa fecha.
 *   2) Cache local SBS.
 *   3) API SBS en vivo (apis.net.pe).
 *
 * @param {string|Date} [date]  default: hoy.
 * @returns {Promise<{ buy:number, sell:number, date:string, source:'manual'|'cache'|'sbs' } | null>}
 */
export async function getRateForDate(date) {
  const day = toIsoDate(date)

  // 1) Override manual
  const manual = readLS(LS_MANUAL_PREFIX + day)
  if (manual && Number.isFinite(Number(manual.sell))) {
    return { ...manual, date: day, source: 'manual' }
  }

  // 2) Cache SBS
  const cached = readLS(LS_CACHE_PREFIX + day)
  if (cached && Number.isFinite(Number(cached.sell))) {
    return { ...cached, date: day, source: 'cache' }
  }

  // 3) Fetch SBS
  try {
    const url = `${SBS_ENDPOINT}?date=${day}`
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) throw new Error(`SBS HTTP ${res.status}`)
    const json = await res.json()
    // Respuesta esperada (v2): { precioCompra, precioVenta, moneda, fecha }
    const buy = parseFloat(json.precioCompra ?? json.compra)
    const sell = parseFloat(json.precioVenta ?? json.venta)
    if (!Number.isFinite(sell) || sell <= 0) throw new Error('Respuesta SBS sin precio venta')
    const rate = { buy, sell, date: day, source: 'sbs' }
    writeLS(LS_CACHE_PREFIX + day, { buy, sell })
    return rate
  } catch (err) {
    if (typeof console !== 'undefined' && console?.warn) {
      console.warn('[exchangeRateService] SBS no disponible:', err?.message || err)
    }
    return null
  }
}

/** Atajo: TC de hoy. */
export function getTodayRate() {
  return getRateForDate(new Date())
}

/**
 * Guarda un override manual del TC para una fecha (gana sobre la SBS).
 * Útil cuando la SBS no responde o el negocio quiere forzar un TC propio.
 *
 * @param {string|Date} date
 * @param {number} sellRate    TC venta (PEN por USD) — obligatorio.
 * @param {number} [buyRate]   TC compra — opcional, si no se da se reusa sellRate.
 * @returns {{ buy:number, sell:number, date:string, source:'manual' }}
 */
export function saveManualRate(date, sellRate, buyRate) {
  const day = toIsoDate(date)
  const sell = Number(sellRate) || 0
  const buy = Number.isFinite(Number(buyRate)) && Number(buyRate) > 0 ? Number(buyRate) : sell
  const value = { buy, sell }
  writeLS(LS_MANUAL_PREFIX + day, value)
  return { ...value, date: day, source: 'manual' }
}

/** Borra el override manual para una fecha (queda solo el de SBS si existe). */
export function clearManualRate(date) {
  removeLS(LS_MANUAL_PREFIX + toIsoDate(date))
}

/** Limpia el cache local de TC (no afecta los TC ya congelados en facturas). */
export function clearLocalCache() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_CACHE_PREFIX) || k.startsWith(LS_MANUAL_PREFIX))
      .forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}
