import axios from 'axios'
import { createHmac } from 'crypto'

/**
 * Cliente mínimo de la API de Flow (flow.cl) para pagos únicos.
 *
 * Flow opera en Perú en PEN e incluye QR interoperable, tarjetas y PagoEfectivo
 * (todos comparten el mismo endpoint payment/create; el pagador elige el medio
 * en el checkout de Flow).
 *
 * COBRO RECURRENTE (15-ago-2026): se usa la API de CLIENTES (customer/*), NO la
 * de planes/suscripciones de Flow. Motivo: cada suscripción de Cobrify tiene su
 * `renewalPrice` CONGELADO (principio de grandfathering — tras la migración de
 * julio conviven 19.90, 29.90, 149.90, 199.90, 235.88, 353.90...). Los planes de
 * Flow son de monto fijo: haría falta uno por cada precio distinto y se rompería
 * al pactar un precio especial. Registrando la tarjeta y cobrando NOSOTROS, el
 * monto sale del renewalPrice de cada cliente y el calendario del
 * currentPeriodEnd.
 *
 * Firma: Flow exige firmar cada request. Se concatenan los parámetros ordenados
 * alfabéticamente por nombre como `nombrevalor` (sin separadores) y se calcula
 * HMAC-SHA256 con el secretKey; el resultado hex va en el parámetro `s`.
 */

const BASE_URL = {
  sandbox: 'https://sandbox.flow.cl/api',
  production: 'https://www.flow.cl/api',
}

function baseUrl(sandbox) {
  return sandbox ? BASE_URL.sandbox : BASE_URL.production
}

/**
 * Firma un set de parámetros según la convención de Flow.
 * @param {Object} params - parámetros SIN el campo `s`
 * @param {string} secretKey
 * @returns {string} firma hex
 */
export function flowSign(params, secretKey) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('')
  return createHmac('sha256', secretKey).update(toSign).digest('hex')
}

/**
 * Crea un pago único en Flow y devuelve la URL de checkout.
 * @returns {Promise<{url:string, token:string, flowOrder:number}>}
 */
export async function createFlowPayment({
  apiKey,
  secretKey,
  sandbox = true,
  commerceOrder,
  subject,
  amount,
  email,
  urlConfirmation,
  urlReturn,
  currency = 'PEN',
  paymentMethod = 9, // 9 = todos los medios activos; el pagador elige
}) {
  const params = {
    apiKey,
    commerceOrder,
    subject,
    currency,
    amount,
    email,
    paymentMethod,
    urlConfirmation,
    urlReturn,
  }
  params.s = flowSign(params, secretKey)

  const res = await axios.post(
    `${baseUrl(sandbox)}/payment/create`,
    new URLSearchParams(params).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const { token, url, flowOrder } = res.data || {}
  if (!token || !url) {
    throw new Error(`Flow no devolvió token/url: ${JSON.stringify(res.data)}`)
  }
  return { token, url: `${url}?token=${token}`, flowOrder }
}

/**
 * Consulta el estado real de un pago en Flow (fuente de verdad para el webhook).
 * status: 1 pendiente, 2 pagado, 3 rechazado, 4 anulado.
 * @returns {Promise<Object>} data cruda de Flow (status, commerceOrder, amount, ...)
 */
export async function getFlowPaymentStatus({ apiKey, secretKey, sandbox = true, token }) {
  const params = { apiKey, token }
  params.s = flowSign(params, secretKey)

  const res = await axios.get(`${baseUrl(sandbox)}/payment/getStatus`, { params })
  return res.data
}

// ============================================================================
// COBRO RECURRENTE — API de clientes de Flow ("Cargo Automático")
// ============================================================================

/**
 * Crea un cliente en Flow. Se hace UNA vez por negocio; el customerId
 * resultante se guarda en la suscripción y se reusa en cada cobro.
 * @returns {Promise<{customerId:string}>}
 */
export async function createFlowCustomer({
  apiKey, secretKey, sandbox = true, name, email, externalId,
}) {
  const params = { apiKey, name, email, externalId }
  params.s = flowSign(params, secretKey)

  const res = await axios.post(
    `${baseUrl(sandbox)}/customer/create`,
    new URLSearchParams(params).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  const { customerId } = res.data || {}
  if (!customerId) throw new Error(`Flow no devolvió customerId: ${JSON.stringify(res.data)}`)
  return { customerId, raw: res.data }
}

/**
 * Inicia el registro de una tarjeta: devuelve la URL donde el cliente ingresa
 * sus datos en Flow. Nosotros NUNCA vemos ni guardamos el número de tarjeta —
 * Flow devuelve solo los últimos dígitos y la marca.
 * @returns {Promise<{url:string, token:string}>}
 */
export async function registerFlowCard({
  apiKey, secretKey, sandbox = true, customerId, urlReturn,
}) {
  const params = { apiKey, customerId, url_return: urlReturn }
  params.s = flowSign(params, secretKey)

  const res = await axios.post(
    `${baseUrl(sandbox)}/customer/register`,
    new URLSearchParams(params).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  const { url, token } = res.data || {}
  if (!url || !token) throw new Error(`Flow no devolvió url/token de registro: ${JSON.stringify(res.data)}`)
  return { token, url: `${url}?token=${token}` }
}

/**
 * Estado del registro de tarjeta. Es la FUENTE DE VERDAD: el retorno del
 * navegador puede falsificarse, esto no.
 * status: 0 pendiente, 1 registrada. Trae creditCardType y last4CardDigits.
 */
export async function getFlowCardRegisterStatus({ apiKey, secretKey, sandbox = true, token }) {
  const params = { apiKey, token }
  params.s = flowSign(params, secretKey)
  const res = await axios.get(`${baseUrl(sandbox)}/customer/getRegisterStatus`, { params })
  return res.data
}

/**
 * Cobra a la tarjeta registrada de un cliente. Es el cobro recurrente en sí.
 * Flow además notifica a urlConfirmation, así que el CUMPLIMIENTO (extender el
 * período) ocurre en el webhook — un solo camino, ya idempotente.
 */
export async function chargeFlowCustomer({
  apiKey, secretKey, sandbox = true,
  customerId, commerceOrder, subject, amount, currency = 'PEN', urlConfirmation,
}) {
  const params = {
    apiKey, customerId, commerceOrder, subject, amount, currency,
    urlConfirmation,
    // 1 = si falla el cobro, Flow NO reintenta por su cuenta: el reintento lo
    // maneja nuestro programador, que sabe cuándo vence cada suscripción.
    byEmail: 0,
  }
  params.s = flowSign(params, secretKey)

  const res = await axios.post(
    `${baseUrl(sandbox)}/customer/charge`,
    new URLSearchParams(params).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return res.data // { status, commerceOrder, flowOrder, amount, ... }
}

/** Elimina la tarjeta registrada (al cancelar la renovación automática). */
export async function unregisterFlowCard({ apiKey, secretKey, sandbox = true, customerId }) {
  const params = { apiKey, customerId }
  params.s = flowSign(params, secretKey)
  const res = await axios.post(
    `${baseUrl(sandbox)}/customer/unRegister`,
    new URLSearchParams(params).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return res.data
}
