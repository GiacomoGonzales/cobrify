import axios from 'axios'
import { createHmac } from 'crypto'

/**
 * Cliente mínimo de la API de Flow (flow.cl) para pagos únicos.
 *
 * Flow opera en Perú en PEN e incluye QR interoperable, tarjetas y PagoEfectivo
 * (todos comparten el mismo endpoint payment/create; el pagador elige el medio
 * en el checkout de Flow). El cobro recurrente (Yape recurrente / suscripción de
 * tarjeta) usa OTROS endpoints (customer/subscription) y se agrega después.
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
