import axios from 'axios'

/**
 * Cliente HTTP para la API de Rappi (modo restaurante).
 *
 * Documentación: https://dev-portal.dev.rappi.com/
 *
 * Bases:
 * - sandbox/dev: https://microservices.dev.rappi.com
 * - producción Perú: https://services.rappi.pe
 *
 * Auth:
 *   POST {base}/restaurants/auth/v1/token/login/integrations
 *   body: { client_id, client_secret }
 *   → { access_token }   (TTL ≈ 1 semana)
 *
 * Llamadas siguientes: header `x-authorization: Bearer <token>`
 */

const BASE_URLS = {
  sandbox: 'https://microservices.dev.rappi.com',
  production_pe: 'https://services.rappi.pe',
}

export function getBaseUrl(env = 'sandbox') {
  return BASE_URLS[env] || BASE_URLS.sandbox
}

/**
 * Obtiene un access_token de Rappi.
 * No cachea — el caller decide la estrategia de caché.
 */
export async function loginRappi({ clientId, clientSecret, env = 'sandbox' }) {
  if (!clientId || !clientSecret) {
    throw new Error('clientId y clientSecret son requeridos')
  }
  const url = `${getBaseUrl(env)}/restaurants/auth/v1/token/login/integrations`
  const response = await axios.post(
    url,
    { client_id: clientId, client_secret: clientSecret },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  )
  const token = response.data?.access_token
  if (!token) {
    throw new Error('Respuesta de Rappi sin access_token: ' + JSON.stringify(response.data))
  }
  return token
}

/**
 * REST v1 — devuelve los pedidos nuevos del store.
 * READY → SENT después de leer. IMPORTANTE: solo se pueden leer una vez.
 */
export async function getStoreOrders({ token, storeId, env = 'sandbox' }) {
  if (!token) throw new Error('token requerido')
  if (!storeId) throw new Error('storeId requerido')
  const url = `${getBaseUrl(env)}/restaurants/orders/v1/stores/${storeId}/orders`
  const response = await axios.get(url, {
    headers: { 'x-authorization': `Bearer ${token}` },
    timeout: 15000,
  })
  return Array.isArray(response.data) ? response.data : []
}

/**
 * Public API v2 — devuelve pedidos de todas las tiendas del integrador.
 * No requiere storeId.
 */
export async function getOrdersV2({ token, env = 'sandbox' }) {
  if (!token) throw new Error('token requerido')
  const url = `${getBaseUrl(env)}/api/v2/restaurants-integrations-public-api/orders`
  const response = await axios.get(url, {
    headers: { 'x-authorization': `Bearer ${token}` },
    timeout: 15000,
  })
  return Array.isArray(response.data) ? response.data : (response.data ?? [])
}

/**
 * Acepta un pedido (estado READY → ACCEPTED).
 */
export async function acceptOrder({ token, storeId, orderId, cookingTime, env = 'sandbox' }) {
  const path = cookingTime
    ? `/restaurants/orders/v1/stores/${storeId}/orders/${orderId}/cooking_time/${cookingTime}/take`
    : `/restaurants/orders/v1/stores/${storeId}/orders/${orderId}/take`
  const url = `${getBaseUrl(env)}${path}`
  const response = await axios.put(url, {}, {
    headers: { 'x-authorization': `Bearer ${token}` },
    timeout: 15000,
  })
  return response.data
}

/**
 * Marca el pedido como listo para recoger.
 */
export async function markReadyForPickup({ token, storeId, orderId, env = 'sandbox' }) {
  const url = `${getBaseUrl(env)}/restaurants/orders/v1/stores/${storeId}/orders/${orderId}/ready-for-pickup`
  const response = await axios.post(url, {}, {
    headers: { 'x-authorization': `Bearer ${token}` },
    timeout: 15000,
  })
  return response.data
}

/**
 * Rechaza un pedido. cancelType debe ser uno de los códigos válidos:
 * STORE_CLOSED, ITEM_STOCKOUT, POS_OFFLINE, POS_INTERNAL_ERROR,
 * INTEGRATOR_ERROR, DELIVERY_METHOD_NOT_SUPPORTED, ORDER_TOTAL_INCORRECT,
 * ORDER_CHARGES_INCORRECT, ORDER_DISCOUNTS_INCORRECT, OUTSIDE_DELIVERY_AREA,
 * ITEM_PRICE_INCORRECT, ITEM_NOT_FOUND, CUSTOMER_INFO_INCORRECT, OTHER
 */
export async function rejectOrder({ token, storeId, orderId, cancelType, body, env = 'sandbox' }) {
  const url = `${getBaseUrl(env)}/restaurants/orders/v1/stores/${storeId}/orders/${orderId}/cancel_type/${cancelType}/reject`
  const response = await axios.put(url, body || {}, {
    headers: {
      'x-authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  })
  return response.data
}
