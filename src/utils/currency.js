/**
 * Utilidades de moneda para soporte opcional multi-divisa (USD).
 *
 * Por defecto Cobrify trabaja 100% en PEN. Cuando un negocio activa el
 * toggle `multiCurrencyEnabled` en companySettings, el sistema empieza a
 * aceptar USD como moneda alterna en compras, facturas y cotizaciones.
 *
 * REGLAS DEL MODELO:
 *
 * 1) PEN es siempre la MONEDA BASE del sistema. Reportes, dashboards y
 *    agregaciones se calculan sumando los equivalentes en PEN (usando el
 *    tipo de cambio congelado en cada documento). Esto garantiza que el
 *    reporte de "ventas de ayer" no cambie cuando suba o baje el dólar.
 *
 * 2) El TIPO DE CAMBIO SE CONGELA al guardar la transacción. NUNCA se
 *    recalcula con TC actual. Cada factura/compra USD guarda el TC con el
 *    que se emitió (`exchangeRate`).
 *
 * 3) BOLETAS y FACTURAS pueden emitirse en USD (SUNAT lo permite; el SEE-SOL
 *    deja elegir la moneda). Reportes/agregaciones siguen en PEN base.
 *
 * 4) NOTAS DE CRÉDITO / DÉBITO heredan la moneda y el TC del documento
 *    original. No se permite cambiar la moneda en la NC/ND.
 */

export const BASE_CURRENCY = 'PEN'

export const SUPPORTED_CURRENCIES = ['PEN', 'USD']

const CURRENCY_META = {
  PEN: { symbol: 'S/', name: 'Soles', code: 'PEN', longName: 'Soles peruanos' },
  USD: { symbol: '$', name: 'Dólares', code: 'USD', longName: 'Dólares americanos' },
}

export function isCurrencySupported(currency) {
  return SUPPORTED_CURRENCIES.includes(currency)
}

export function getCurrencySymbol(currency) {
  return CURRENCY_META[currency]?.symbol || 'S/'
}

export function getCurrencyName(currency) {
  return CURRENCY_META[currency]?.name || 'Soles'
}

export function getCurrencyLongName(currency) {
  return CURRENCY_META[currency]?.longName || 'Soles peruanos'
}

/**
 * Normaliza un valor de moneda recibido (puede venir como objeto antiguo,
 * string, undefined, etc.) a 'PEN' | 'USD'.
 */
export function normalizeCurrency(value) {
  if (!value) return BASE_CURRENCY
  const v = typeof value === 'string' ? value.toUpperCase().trim() : String(value).toUpperCase()
  return SUPPORTED_CURRENCIES.includes(v) ? v : BASE_CURRENCY
}

/**
 * Devuelve true si el negocio activó la flag de multi-divisa en Configuración.
 * Cualquier UI o flujo que dependa de USD debe checkear esto primero.
 *
 * @param {Object} businessSettings - documento del negocio (Firestore) o
 *                                    `businessSettings` del contexto.
 * @returns {boolean}
 */
export function isMultiCurrencyEnabled(businessSettings) {
  return businessSettings?.multiCurrencyEnabled === true
}

/**
 * Devuelve la moneda por defecto del negocio. Siempre PEN salvo que el
 * negocio haya activado multi-divisa y elegido USD como default.
 *
 * @param {Object} businessSettings
 * @returns {'PEN' | 'USD'}
 */
export function getDefaultCurrency(businessSettings) {
  if (!isMultiCurrencyEnabled(businessSettings)) return BASE_CURRENCY
  return normalizeCurrency(businessSettings?.defaultCurrency)
}

/**
 * Convierte un monto a la moneda base del sistema (PEN) usando el tipo de
 * cambio congelado provisto. Si ya está en PEN, devuelve el mismo monto.
 *
 * @param {number} amount       monto en la moneda de operación
 * @param {string} currency     'PEN' | 'USD'
 * @param {number} exchangeRate tipo de cambio aplicado (PEN por unidad de currency)
 * @returns {number} monto equivalente en PEN, redondeado a 2 decimales
 */
export function convertToBase(amount, currency, exchangeRate) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return 0
  if (!currency || currency === BASE_CURRENCY) return n
  const rate = Number(exchangeRate)
  if (!Number.isFinite(rate) || rate <= 0) return n
  return Math.round(n * rate * 100) / 100
}

/**
 * Inverso: convierte un monto en PEN a la moneda destino.
 *
 * @param {number} amountInBase monto en PEN
 * @param {string} targetCurrency 'PEN' | 'USD'
 * @param {number} exchangeRate TC PEN/USD aplicado
 * @returns {number}
 */
export function convertFromBase(amountInBase, targetCurrency, exchangeRate) {
  const n = Number(amountInBase)
  if (!Number.isFinite(n)) return 0
  if (!targetCurrency || targetCurrency === BASE_CURRENCY) return n
  const rate = Number(exchangeRate)
  if (!Number.isFinite(rate) || rate <= 0) return n
  return Math.round((n / rate) * 100) / 100
}

/**
 * Devuelve el monto "equivalente en base" de un documento, usando el
 * exchangeRate congelado en el propio documento. Util para reportes y
 * agregaciones globales.
 *
 * @param {Object} doc - documento con { total, currency, exchangeRate }
 * @returns {number} monto equivalente en PEN
 */
export function getDocumentTotalInBase(doc) {
  if (!doc) return 0
  const amount = Number(doc.total) || 0
  const currency = normalizeCurrency(doc.currency)
  if (currency === BASE_CURRENCY) return amount
  const rate = Number(doc.exchangeRate) || 0
  if (rate <= 0) return amount // sin TC, asumimos PEN para no inflar reportes
  return convertToBase(amount, currency, rate)
}

/**
 * Moneda en la que el negocio quiere VER sus reportes/dashboard (visualización).
 * Solo puede ser USD si tiene multi-divisa activa y eligió `reportsCurrency: 'USD'`.
 * La base contable SIEMPRE es PEN — esto es solo cómo se muestran los números.
 *
 * @param {Object} businessSettings
 * @returns {'PEN' | 'USD'}
 */
export function getReportsCurrency(businessSettings) {
  if (!isMultiCurrencyEnabled(businessSettings)) return BASE_CURRENCY
  return normalizeCurrency(businessSettings?.reportsCurrency)
}

/**
 * Tasa de referencia para convertir los montos en PEN a la moneda de reportes (USD).
 * Prioridad: TC configurado (`reportsExchangeRate`) > TC congelado del documento USD
 * más reciente del set > 0. Para un negocio 100% USD casi no se usa (sus docs ya
 * son USD y se muestran nativos); solo aplica a los pocos comprobantes en soles.
 *
 * @param {Object} businessSettings
 * @param {Array} docs - comprobantes disponibles (para inferir el TC si no se configuró)
 * @returns {number}
 */
export function resolveReportsRate(businessSettings, docs = []) {
  const configured = Number(businessSettings?.reportsExchangeRate)
  if (Number.isFinite(configured) && configured > 0) return configured
  let best = null
  for (const d of docs || []) {
    if (normalizeCurrency(d?.currency) !== 'USD') continue
    const r = Number(d?.exchangeRate)
    if (!Number.isFinite(r) || r <= 0) continue
    const t = d?.createdAt?.toDate?.()?.getTime?.() ?? (d?.createdAt ? new Date(d.createdAt).getTime() : 0)
    if (!best || t >= best.t) best = { t, rate: r }
  }
  return best ? best.rate : 0
}

/**
 * Convierte un monto YA EN SOLES BASE a la moneda de display de reportes.
 * Los reportes se calculan internamente en soles (con los TC congelados de cada
 * doc); esta función es la capa de PRESENTACIÓN: si la moneda de reportes es USD,
 * divide entre la tasa de referencia. Si no hay tasa válida, deja el monto en
 * soles (no lo rompe). PEN → devuelve el mismo monto.
 *
 * @param {number} amountInBase - monto en soles (ej: getDocumentTotalInBase)
 * @param {'PEN'|'USD'} displayCurrency
 * @param {number} displayRate - tasa de referencia (de resolveReportsRate)
 * @returns {number}
 */
export function convertBaseToDisplay(amountInBase, displayCurrency = BASE_CURRENCY, displayRate = 0) {
  const n = Number(amountInBase) || 0
  if (normalizeCurrency(displayCurrency) === BASE_CURRENCY) return n
  const rate = Number(displayRate)
  if (!Number.isFinite(rate) || rate <= 0) return n
  return Math.round((n / rate) * 100) / 100
}

/**
 * Tipo de cambio EFECTIVO de un documento para convertir sus montos a PEN:
 * 1 si el documento está en PEN (o no tiene TC válido), su exchangeRate
 * congelado si está en USD. Útil para convertir montos parciales del doc
 * (items, pagos, buckets de IGV) en reportes y exports sin mezclar monedas.
 *
 * @param {Object} doc - documento con { currency, exchangeRate }
 * @returns {number} factor multiplicador a PEN
 */
export function getDocumentRate(doc) {
  const currency = normalizeCurrency(doc?.currency)
  if (currency === BASE_CURRENCY) return 1
  const rate = Number(doc?.exchangeRate)
  return Number.isFinite(rate) && rate > 0 ? rate : 1
}
