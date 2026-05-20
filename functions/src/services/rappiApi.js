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
 * Auth integrador (M2M):
 *   POST {base}/restaurants/auth/v1/token/login/integrations
 *   body: { client_id, client_secret }
 *   → { access_token }   (TTL ≈ 1 semana)
 *
 * Auth merchant (OAuth2 + PKCE):
 *   Authorize: https://login.partners.{dev.}rappi.com/authorize
 *   Token:     POST {auth_base}/oauth/token (intercambia code por JWT)
 *
 * Llamadas a la API:
 *   - Header `x-authorization: Bearer <integratorToken>` (siempre)
 *   - Header `Authorization-Partners: Bearer <merchantToken>` (en self-onboarding)
 */

const BASE_URLS = {
  sandbox: 'https://microservices.dev.rappi.com',
  production_pe: 'https://services.rappi.pe',
}

const PARTNERS_LOGIN_URLS = {
  sandbox: 'https://login.partners.dev.rappi.com',
  production_pe: 'https://login.partners.rappi.com',
}

export function getBaseUrl(env = 'sandbox') {
  return BASE_URLS[env] || BASE_URLS.sandbox
}

export function getPartnersLoginUrl(env = 'sandbox') {
  return PARTNERS_LOGIN_URLS[env] || PARTNERS_LOGIN_URLS.sandbox
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

// ─── Self-Onboarding ─────────────────────────────────────────────────────

/**
 * Construye la URL de autorización OAuth2 + PKCE para que el merchant inicie sesión.
 * El merchant será redirigido aquí; tras autenticarse, Rappi llama al `redirect_uri`
 * con `?code=<authorization_code>&state=<state>`.
 */
export function buildAuthorizeUrl({ env = 'sandbox', clientId, redirectUri, codeChallenge, state, scope = 'openid profile' }) {
  if (!clientId) throw new Error('clientId requerido')
  if (!redirectUri) throw new Error('redirectUri requerido')
  if (!codeChallenge) throw new Error('codeChallenge requerido')
  if (!state) throw new Error('state requerido')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope,
  })
  return `${getPartnersLoginUrl(env)}/authorize?${params.toString()}`
}

/**
 * Intercambia un `authorization_code` por el JWT del merchant.
 * Devuelve `{ access_token, refresh_token, expires_in, token_type, ... }`
 */
export async function exchangeMerchantCode({ env = 'sandbox', clientId, clientSecret, code, codeVerifier, redirectUri }) {
  if (!code) throw new Error('code requerido')
  if (!codeVerifier) throw new Error('codeVerifier requerido')
  const url = `${getPartnersLoginUrl(env)}/oauth/token`
  const body = {
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  }
  const response = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  })
  return response.data
}

/**
 * Refresca el token del merchant usando refresh_token.
 */
export async function refreshMerchantToken({ env = 'sandbox', clientId, clientSecret, refreshToken }) {
  if (!refreshToken) throw new Error('refreshToken requerido')
  const url = `${getPartnersLoginUrl(env)}/oauth/token`
  const body = {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }
  const response = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  })
  return response.data
}

/**
 * Registra un webhook en Rappi (una sola vez por cliente/evento).
 * Spec:
 *   POST {base}/clients/{clientId}/webhooks
 *   body: { event, url, secret }
 *   Headers: x-authorization (integrator token)
 *
 * Eventos válidos:
 *   STORE_PROVISIONING_STATUS, NEW_ORDER, ORDER_EVENT_CANCEL, ORDER_OTHER_EVENT,
 *   MENU_APPROVED, MENU_REJECTED, PING, STORE_CONNECTIVITY, ORDER_RT_TRACKING
 */
export async function registerWebhook({ env = 'sandbox', integratorToken, clientId, event, url, secret }) {
  if (!integratorToken) throw new Error('integratorToken requerido')
  if (!clientId) throw new Error('clientId requerido')
  if (!event) throw new Error('event requerido')
  if (!url) throw new Error('url requerido')
  if (!secret) throw new Error('secret requerido')
  const endpoint = `${getBaseUrl(env)}/clients/${clientId}/webhooks`
  const response = await axios.post(endpoint, { event, url, secret }, {
    headers: {
      'x-authorization': `Bearer ${integratorToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  })
  return response.data
}

/**
 * Lista los webhooks registrados para un clientId.
 */
export async function listWebhooks({ env = 'sandbox', integratorToken, clientId }) {
  const endpoint = `${getBaseUrl(env)}/clients/${clientId}/webhooks`
  const response = await axios.get(endpoint, {
    headers: { 'x-authorization': `Bearer ${integratorToken}` },
    timeout: 15000,
  })
  return response.data
}

/**
 * Provisiona tiendas para vincularlas a la integración del merchant.
 * Spec:
 *   POST {base}/v2/stores/provisioning
 *   Headers: x-authorization (integrator) + Authorization-Partners (merchant)
 *   body: { stores: [{ store_id, integration_id, name, status, ping_active?, get_menu_active?, cancellation_events? }] }
 *   → 202 Accepted (resultado vía webhook STORE_PROVISIONING_STATUS)
 *
 * Máximo 20 tiendas por request.
 */
export async function provisionStores({ env = 'sandbox', integratorToken, merchantToken, stores }) {
  if (!integratorToken) throw new Error('integratorToken requerido')
  if (!merchantToken) throw new Error('merchantToken requerido')
  if (!Array.isArray(stores) || stores.length === 0) throw new Error('stores requerido (array no vacío)')
  if (stores.length > 20) throw new Error('Máximo 20 tiendas por request')

  const endpoint = `${getBaseUrl(env)}/v2/stores/provisioning`
  const response = await axios.post(endpoint, { stores }, {
    headers: {
      'x-authorization': `Bearer ${integratorToken}`,
      'Authorization-Partners': `Bearer ${merchantToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  })
  return response.data
}

/**
 * Consulta el estado de integración de las tiendas del merchant.
 *   GET {base}/v2/stores/integration-status
 *   Headers: x-authorization + Authorization-Partners
 */
export async function getIntegrationStatus({ env = 'sandbox', integratorToken, merchantToken }) {
  const endpoint = `${getBaseUrl(env)}/v2/stores/integration-status`
  const response = await axios.get(endpoint, {
    headers: {
      'x-authorization': `Bearer ${integratorToken}`,
      'Authorization-Partners': `Bearer ${merchantToken}`,
    },
    timeout: 15000,
  })
  return response.data
}

/**
 * Desprovisiona tiendas (las desconecta de la integración).
 */
export async function deprovisionStores({ env = 'sandbox', integratorToken, merchantToken, stores }) {
  if (!Array.isArray(stores) || stores.length === 0) throw new Error('stores requerido')
  const endpoint = `${getBaseUrl(env)}/v2/stores/deprovisioning`
  const response = await axios.post(endpoint, { stores }, {
    headers: {
      'x-authorization': `Bearer ${integratorToken}`,
      'Authorization-Partners': `Bearer ${merchantToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  })
  return response.data
}
