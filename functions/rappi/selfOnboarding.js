import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import {
  loginRappi,
  buildAuthorizeUrl,
  exchangeMerchantCode,
  refreshMerchantToken,
  registerWebhook,
  listWebhooks,
  provisionStores,
  getIntegrationStatus,
  deprovisionStores,
  getClientIdFromToken,
} from '../src/services/rappiApi.js'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  verifyRappiSignature,
  encryptToken,
  decryptToken,
} from '../src/services/rappiCrypto.js'

/**
 * Cloud Functions de Rappi Self-Onboarding.
 *
 * Flujo:
 *  1. rappiOAuthStart (onCall)      → genera URL OAuth con PKCE y la devuelve al cliente
 *  2. rappiOAuthCallback (onRequest)→ recibe ?code=&state= de Rappi, intercambia y guarda merchantToken
 *  3. rappiProvisionStore (onCall)  → manda POST /v2/stores/provisioning para vincular la tienda
 *  4. rappiWebhook (onRequest)      → recibe STORE_PROVISIONING_STATUS y demás eventos (HMAC verificado)
 *  5. rappiRegisterWebhook (onCall) → registrar webhook (una sola vez, admin)
 *
 * Secrets:
 *  - RAPPI_INTEGRATOR_CLIENT_ID
 *  - RAPPI_INTEGRATOR_CLIENT_SECRET
 *  - RAPPI_WEBHOOK_SECRET
 *  - RAPPI_TOKEN_ENCRYPTION_KEY  (32 bytes en hex / 64 chars)
 *  - RAPPI_OAUTH_REDIRECT_URI    (URL pública de rappiOAuthCallback)
 */

const RAPPI_INTEGRATOR_CLIENT_ID = defineSecret('RAPPI_INTEGRATOR_CLIENT_ID')
const RAPPI_INTEGRATOR_CLIENT_SECRET = defineSecret('RAPPI_INTEGRATOR_CLIENT_SECRET')
const RAPPI_WEBHOOK_SECRET = defineSecret('RAPPI_WEBHOOK_SECRET')
const RAPPI_TOKEN_ENCRYPTION_KEY = defineSecret('RAPPI_TOKEN_ENCRYPTION_KEY')
const RAPPI_OAUTH_REDIRECT_URI = defineSecret('RAPPI_OAUTH_REDIRECT_URI')

const SELF_ONBOARDING_SECRETS = [
  RAPPI_INTEGRATOR_CLIENT_ID,
  RAPPI_INTEGRATOR_CLIENT_SECRET,
  RAPPI_TOKEN_ENCRYPTION_KEY,
  RAPPI_OAUTH_REDIRECT_URI,
]

const COMMON_OPTS = { region: 'us-central1', cors: true }

function getEnv(input) {
  // Producción por defecto; solo cae a sandbox si se pide explícitamente.
  return input === 'sandbox' ? 'sandbox' : 'production_pe'
}

async function assertBusinessAccess(db, auth, businessId) {
  if (!auth) throw new HttpsError('unauthenticated', 'Debes estar autenticado')
  if (!businessId) throw new HttpsError('invalid-argument', 'businessId requerido')
  if (auth.uid === businessId) return // owner
  const userDoc = await db.collection('users').doc(auth.uid).get()
  if (userDoc.exists && userDoc.data()?.ownerId === businessId) return // subuser
  throw new HttpsError('permission-denied', 'Sin acceso a este negocio')
}

// ─── 1. OAuth Start ──────────────────────────────────────────────────────

/**
 * Genera state + code_verifier + code_challenge, los guarda en Firestore
 * (TTL implícito de 10 min vía expiresAt), y devuelve la URL de autorización
 * para que el merchant inicie sesión en Rappi.
 */
export const rappiOAuthStart = onCall(
  { ...COMMON_OPTS, secrets: [RAPPI_INTEGRATOR_CLIENT_ID, RAPPI_OAUTH_REDIRECT_URI] },
  async (request) => {
    const db = getFirestore()
    const businessId = request.data?.businessId
    const env = getEnv(request.data?.env)
    await assertBusinessAccess(db, request.auth, businessId)

    const clientId = RAPPI_INTEGRATOR_CLIENT_ID.value()
    const redirectUri = RAPPI_OAUTH_REDIRECT_URI.value()
    if (!clientId || !redirectUri) {
      throw new HttpsError('failed-precondition', 'Secrets de Rappi no configurados')
    }

    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const state = generateState()

    // Guardamos en una colección dedicada con el state como id (no expone businessId).
    const expiresAt = Date.now() + 10 * 60 * 1000
    await db.collection('rappiOAuthStates').doc(state).set({
      businessId,
      env,
      codeVerifier,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    })

    const url = buildAuthorizeUrl({
      env,
      clientId,
      redirectUri,
      codeChallenge,
      state,
    })

    return { url, state, expiresAt }
  }
)

// ─── 2. OAuth Callback ───────────────────────────────────────────────────

/**
 * Endpoint público al que Rappi redirige tras login del merchant.
 * Recibe `?code=&state=`, valida state, intercambia code por JWT y guarda
 * el `merchantToken` cifrado en `businesses/{businessId}.rappiConfig`.
 *
 * Renderiza un HTML simple que comunica el resultado a la ventana padre
 * vía `window.opener.postMessage` y se autocierra.
 */
export const rappiOAuthCallback = onRequest(
  {
    ...COMMON_OPTS,
    secrets: SELF_ONBOARDING_SECRETS,
    invoker: 'public',
  },
  async (req, res) => {
    const code = req.query?.code
    const state = req.query?.state
    const errorParam = req.query?.error

    if (errorParam) {
      return res.status(400).send(renderCallbackHtml({ ok: false, error: String(errorParam) }))
    }
    if (!code || !state) {
      return res.status(400).send(renderCallbackHtml({ ok: false, error: 'Faltan code o state' }))
    }

    try {
      const db = getFirestore()
      const stateRef = db.collection('rappiOAuthStates').doc(String(state))
      const stateSnap = await stateRef.get()
      if (!stateSnap.exists) {
        return res.status(400).send(renderCallbackHtml({ ok: false, error: 'State no encontrado o expirado' }))
      }
      const stateData = stateSnap.data()
      if (Date.now() > stateData.expiresAt) {
        await stateRef.delete().catch(() => {})
        return res.status(400).send(renderCallbackHtml({ ok: false, error: 'State expirado' }))
      }

      const { businessId, codeVerifier, env } = stateData
      const clientId = RAPPI_INTEGRATOR_CLIENT_ID.value()
      const clientSecret = RAPPI_INTEGRATOR_CLIENT_SECRET.value()
      const redirectUri = RAPPI_OAUTH_REDIRECT_URI.value()
      const encryptionKey = RAPPI_TOKEN_ENCRYPTION_KEY.value()

      const tokenResponse = await exchangeMerchantCode({
        env,
        clientId,
        clientSecret,
        code: String(code),
        codeVerifier,
        redirectUri,
      })

      const expiresIn = Number(tokenResponse.expires_in) || 3600
      const encrypted = encryptToken(tokenResponse.access_token, encryptionKey)
      const encryptedRefresh = tokenResponse.refresh_token
        ? encryptToken(tokenResponse.refresh_token, encryptionKey)
        : null

      await db.collection('businesses').doc(businessId).set({
        rappiConfig: {
          env,
          merchantToken: encrypted,
          merchantRefreshToken: encryptedRefresh,
          merchantTokenExpiresAt: Date.now() + expiresIn * 1000,
          merchantTokenScope: tokenResponse.scope || null,
          oauthConnectedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      await stateRef.delete().catch(() => {})

      return res.status(200).send(renderCallbackHtml({ ok: true }))
    } catch (err) {
      console.error('rappiOAuthCallback error:', err?.response?.data || err)
      return res.status(500).send(renderCallbackHtml({
        ok: false,
        error: err?.response?.data?.error_description || err.message || 'Error en callback',
      }))
    }
  }
)

function renderCallbackHtml({ ok, error }) {
  const safeError = String(error || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const payload = ok ? `{"ok":true,"source":"rappi-oauth"}` : `{"ok":false,"source":"rappi-oauth","error":${JSON.stringify(safeError)}}`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Rappi</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb;color:#111}
.card{padding:24px 32px;border-radius:12px;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;max-width:380px}
.ok{color:#059669}.err{color:#dc2626}</style></head>
<body><div class="card">
${ok ? '<h2 class="ok">Conectado con Rappi</h2><p>Ya puedes cerrar esta ventana.</p>' : `<h2 class="err">No se pudo conectar</h2><p>${safeError}</p>`}
</div>
<script>try{if(window.opener){window.opener.postMessage(${payload},'*')}}catch(e){}setTimeout(()=>{try{window.close()}catch(e){}},1500)</script>
</body></html>`
}

// ─── 3. Webhook handler (público, verifica HMAC) ─────────────────────────

/**
 * Endpoint público al que Rappi envía los eventos (STORE_PROVISIONING_STATUS, etc).
 * Verifica HMAC-SHA256 contra el secret compartido.
 *
 * Para PING devuelve `{ status: 'OK' }`.
 */
export const rappiWebhook = onRequest(
  {
    ...COMMON_OPTS,
    secrets: [RAPPI_WEBHOOK_SECRET],
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed')
    }

    const signatureHeader = req.headers['rappi-signature'] || req.headers['Rappi-Signature']

    // req.rawBody es provisto por Firebase Functions cuando hay payload
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {})

    let body
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(rawBody)
    } catch (err) {
      return res.status(400).json({ error: 'invalid_json' })
    }

    const eventType = (body?.event || body?.type || '').toString().toUpperCase()

    try {
      const db = getFirestore()

      // PING: health-check de Rappi. Responder OK siempre (sin verificación estricta).
      if (eventType === 'PING') {
        await db.collection('rappiWebhookEvents').add({
          event: 'PING', payload: body, receivedAt: FieldValue.serverTimestamp(),
        }).catch(() => {})
        return res.status(200).json({ status: 'OK' })
      }

      // ── Verificación HMAC multi-tenant ──
      // El secret puede ser el del negocio (rappiConfig.webhookSecret, ubicado por storeId)
      // o el secret global RAPPI_WEBHOOK_SECRET (si está configurado). Probamos ambos.
      const storeId = extractStoreId(body, eventType)
      const biz = storeId ? await findBusinessByStoreId(db, storeId) : null
      const candidateSecrets = []
      if (biz?.data?.rappiConfig?.webhookSecret) candidateSecrets.push(biz.data.rappiConfig.webhookSecret)
      const envSecret = RAPPI_WEBHOOK_SECRET.value()
      if (envSecret) candidateSecrets.push(envSecret)

      const signatureValid = candidateSecrets.length > 0 &&
        candidateSecrets.some(s => verifyRappiSignature({ rawBody, header: signatureHeader, secret: s }))

      // Log de auditoría — TODO evento queda registrado (con el resultado de la firma)
      await db.collection('rappiWebhookEvents').add({
        event: eventType || 'UNKNOWN',
        payload: body,
        storeId: storeId || null,
        signatureValid,
        hadSecret: candidateSecrets.length > 0,
        receivedAt: FieldValue.serverTimestamp(),
      })

      // Si hay secret configurado y la firma NO valida, rechazamos (posible spoofing).
      if (candidateSecrets.length > 0 && !signatureValid) {
        console.warn(`rappiWebhook: firma HMAC inválida (event=${eventType}, storeId=${storeId})`)
        return res.status(401).json({ error: 'invalid_signature' })
      }
      // Si NO hay secret configurado, no podemos verificar: procesamos igual para no perder
      // pedidos, pero queda marcado signatureValid=false en el log.

      if (eventType === 'STORE_PROVISIONING_STATUS') {
        await handleStoreProvisioningStatus(db, body)
        return res.status(200).json({ ok: true })
      }

      if (eventType === 'NEW_ORDER') {
        const result = await handleNewOrder(db, body)
        return res.status(200).json({ ok: true, ...result })
      }

      if (eventType === 'ORDER_EVENT_CANCEL') {
        const result = await handleOrderCancel(db, body)
        return res.status(200).json({ ok: true, ...result })
      }

      // Otros eventos (ORDER_OTHER_EVENT, MENU_*, STORE_CONNECTIVITY, ORDER_RT_TRACKING)
      // se loggean (arriba) pero aún no se procesan acá.
      return res.status(200).json({ ok: true, ignored: true })
    } catch (err) {
      console.error('rappiWebhook error:', err)
      return res.status(500).json({ error: 'internal' })
    }
  }
)

/**
 * Procesa el payload STORE_PROVISIONING_STATUS y actualiza cada tienda
 * encontrando el `businessId` por `storeId`.
 *
 * Payload esperado:
 *   { batchId, operation: 'PROVISION'|'DEPROVISION', results: [{ storeId, status, httpCode }] }
 */
async function handleStoreProvisioningStatus(db, body) {
  const batchId = body?.batchId || null
  const operation = body?.operation || null
  const results = Array.isArray(body?.results) ? body.results : []
  if (results.length === 0) return

  for (const result of results) {
    const storeId = String(result.storeId || result.store_id || '')
    if (!storeId) continue

    // Buscamos el negocio cuyo rappiConfig.storeId coincida
    const querySnap = await db.collection('businesses')
      .where('rappiConfig.storeId', '==', storeId)
      .limit(1)
      .get()

    if (querySnap.empty) {
      console.warn(`rappiWebhook: no se encontró businessId para storeId=${storeId}`)
      continue
    }

    const docRef = querySnap.docs[0].ref
    const status = (result.status || '').toUpperCase()
    const integrationStatus = status === 'ACTIVE'
      ? 'active'
      : status === 'INACTIVE'
      ? 'inactive'
      : 'failed'

    await docRef.set({
      rappiConfig: {
        storeIntegrationStatus: integrationStatus,
        storeProvisionedAt: integrationStatus === 'active' ? FieldValue.serverTimestamp() : null,
        lastProvisioningBatchId: batchId,
        lastProvisioningOperation: operation,
        lastProvisioningHttpCode: result.httpCode || null,
        lastProvisioningResult: result,
        lastProvisioningAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
}

// ─── Ingestión de pedidos (NEW_ORDER) ────────────────────────────────────

function firstDefined(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v
  return undefined
}

/**
 * Extrae el storeId del payload de un evento de webhook según su tipo.
 * STORE_PROVISIONING_STATUS lo trae dentro de results[]; los eventos de pedido
 * a nivel raíz / dentro de order.
 */
function extractStoreId(body, eventType) {
  if (eventType === 'STORE_PROVISIONING_STATUS') {
    const r = Array.isArray(body?.results) ? body.results[0] : null
    return r ? String(firstDefined(r.storeId, r.store_id, '') || '') : ''
  }
  const order = body?.order || body?.data || body
  return String(firstDefined(order?.store_id, order?.storeId, body?.store_id, body?.storeId, '') || '')
}

/**
 * Encuentra el businessId cuyo rappiConfig.storeId coincide con el storeId del payload.
 * Devuelve { ref, data } o null.
 */
async function findBusinessByStoreId(db, storeId) {
  if (!storeId) return null
  const snap = await db.collection('businesses')
    .where('rappiConfig.storeId', '==', String(storeId))
    .limit(1)
    .get()
  if (snap.empty) return null
  return { ref: snap.docs[0].ref, id: snap.docs[0].id, data: snap.docs[0].data() }
}

/**
 * Mapea un pedido de Rappi (NEW_ORDER) al modelo de orden de Cobrify (modo restaurante).
 * Es BEST-EFFORT: los nombres exactos de los campos de Rappi pueden variar, por eso
 * siempre se guarda `rappiRaw` con el payload original para refinar el mapeo con datos reales.
 */
function mapRappiOrder(body) {
  const order = body?.order || body?.data || body
  const customer = order?.client || order?.customer || order?.user || {}
  const itemsRaw = Array.isArray(order?.items) ? order.items
    : Array.isArray(order?.products) ? order.products
    : Array.isArray(body?.items) ? body.items : []

  const items = itemsRaw.map((it) => ({
    name: firstDefined(it?.name, it?.product_name, it?.title, 'Producto Rappi') || 'Producto Rappi',
    sku: String(firstDefined(it?.sku, it?.integration_id, it?.external_id, '') || ''),
    rappiId: String(firstDefined(it?.id, it?.rappi_id, it?.product_id, '') || ''),
    productId: '',
    price: Number(firstDefined(it?.unit_price, it?.price, it?.total, 0)) || 0,
    quantity: Number(firstDefined(it?.quantity, it?.units, it?.qty, 1)) || 1,
    notes: firstDefined(it?.comments, it?.notes, '') || '',
  }))

  const total = Number(firstDefined(order?.total_value, order?.total, order?.amount, body?.total, 0)) || 0

  return {
    source: 'rappi',
    status: 'pending',
    rappiOrderId: String(firstDefined(order?.order_id, order?.id, order?.reference, body?.order_id, body?.id, '') || ''),
    rappiStoreId: String(firstDefined(order?.store_id, order?.storeId, body?.store_id, '') || ''),
    customerName: firstDefined(customer?.name, customer?.first_name, order?.customer_name, '') || '',
    customerPhone: String(firstDefined(customer?.phone, customer?.phone_number, '') || ''),
    customerEmail: firstDefined(customer?.email, '') || '',
    customerAddress: firstDefined(order?.address?.address, order?.delivery_address, customer?.address, '') || '',
    customerDocumentType: firstDefined(customer?.document_type, '') || '',
    customerDocumentNumber: String(firstDefined(customer?.document, customer?.document_number, '') || ''),
    items,
    subtotal: Number(firstDefined(order?.subtotal, 0)) || null,
    igv: Number(firstDefined(order?.taxes, order?.tax, 0)) || null,
    total,
    paymentMethod: 'rappi_pay',
    notes: firstDefined(order?.comments, order?.notes, '') || '',
  }
}

/**
 * Crea (o actualiza) la orden Rappi en Firestore, idempotente por rappiOrderId.
 * Si no se encuentra el negocio por storeId, guarda el payload en rappiUnmatchedOrders
 * para no perder nada.
 */
async function handleNewOrder(db, body) {
  const mapped = mapRappiOrder(body)
  const storeId = mapped.rappiStoreId
  const biz = await findBusinessByStoreId(db, storeId)

  if (!biz) {
    await db.collection('rappiUnmatchedOrders').add({
      storeId: storeId || null,
      rappiOrderId: mapped.rappiOrderId || null,
      payload: body,
      receivedAt: FieldValue.serverTimestamp(),
    })
    console.warn(`rappiWebhook NEW_ORDER: sin businessId para storeId=${storeId}`)
    return { matched: false }
  }

  const ordersRef = biz.ref.collection('orders')

  // Idempotencia: si ya existe un pedido con ese rappiOrderId, no duplicar.
  if (mapped.rappiOrderId) {
    const existing = await ordersRef.where('rappiOrderId', '==', mapped.rappiOrderId).limit(1).get()
    if (!existing.empty) {
      return { matched: true, businessId: biz.id, duplicate: true, orderId: existing.docs[0].id }
    }
  }

  const branchId = biz.data?.rappiConfig?.branchId || null
  const docRef = await ordersRef.add({
    ...mapped,
    branchId,
    rappiRaw: body,
    createdAt: FieldValue.serverTimestamp(),
  })

  return { matched: true, businessId: biz.id, orderId: docRef.id }
}

/**
 * Marca una orden Rappi como cancelada (evento ORDER_EVENT_CANCEL).
 */
async function handleOrderCancel(db, body) {
  const order = body?.order || body?.data || body
  const rappiOrderId = String(firstDefined(order?.order_id, order?.id, body?.order_id, body?.id, '') || '')
  const storeId = String(firstDefined(order?.store_id, body?.store_id, '') || '')
  if (!rappiOrderId) return { matched: false }

  const biz = await findBusinessByStoreId(db, storeId)
  if (!biz) return { matched: false }

  const existing = await biz.ref.collection('orders')
    .where('rappiOrderId', '==', rappiOrderId).limit(1).get()
  if (existing.empty) return { matched: true, businessId: biz.id, found: false }

  await existing.docs[0].ref.set({
    status: 'cancelled',
    cancelledAt: FieldValue.serverTimestamp(),
    rappiCancelPayload: body,
  }, { merge: true })
  return { matched: true, businessId: biz.id, orderId: existing.docs[0].id }
}

// ─── 4. Registrar webhook (una sola vez por instancia) ────────────────────

/**
 * Helper interno: obtiene el integrator token (M2M) con los secrets configurados.
 */
async function getIntegratorToken(env) {
  const clientId = RAPPI_INTEGRATOR_CLIENT_ID.value()
  const clientSecret = RAPPI_INTEGRATOR_CLIENT_SECRET.value()
  if (!clientId || !clientSecret) {
    throw new HttpsError('failed-precondition', 'Secrets de integrador no configurados')
  }
  return loginRappi({ clientId, clientSecret, env })
}

/**
 * Registra el webhook STORE_PROVISIONING_STATUS (u otro) en Rappi.
 * Solo accesible por admins de Cobrify.
 */
export const rappiRegisterWebhook = onCall(
  {
    ...COMMON_OPTS,
    secrets: [
      RAPPI_INTEGRATOR_CLIENT_ID,
      RAPPI_INTEGRATOR_CLIENT_SECRET,
      RAPPI_WEBHOOK_SECRET,
    ],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth requerida')

    // Solo admins de Cobrify pueden registrar webhooks (una operación de plataforma)
    const db = getFirestore()
    const userDoc = await db.collection('users').doc(request.auth.uid).get()
    const isPlatformAdmin = userDoc.exists && userDoc.data()?.isPlatformAdmin === true
    if (!isPlatformAdmin) {
      throw new HttpsError('permission-denied', 'Solo administradores de plataforma')
    }

    const event = request.data?.event || 'STORE_PROVISIONING_STATUS'
    const env = getEnv(request.data?.env)
    const webhookUrl = request.data?.url
    if (!webhookUrl) throw new HttpsError('invalid-argument', 'url requerido (endpoint público de rappiWebhook)')

    const integratorToken = await getIntegratorToken(env)
    // El {clientId} del path es el claim `azp` del JWT (no el client_id credencial
    // sin más). Con Auth0 suelen coincidir, pero lo derivamos del token para evitar
    // el 404 "not found by holder" si difieren.
    const clientId = getClientIdFromToken(integratorToken, RAPPI_INTEGRATOR_CLIENT_ID.value())
    const secret = RAPPI_WEBHOOK_SECRET.value()

    try {
      const data = await registerWebhook({
        env,
        integratorToken,
        clientId,
        event,
        url: webhookUrl,
        secret,
      })
      return { ok: true, data, clientIdUsed: clientId }
    } catch (err) {
      return {
        ok: false,
        status: err?.response?.status,
        message: err?.response?.data?.message || err.message,
        data: err?.response?.data,
      }
    }
  }
)

/**
 * Lista los webhooks registrados (debug/admin).
 */
export const rappiListWebhooks = onCall(
  {
    ...COMMON_OPTS,
    secrets: [RAPPI_INTEGRATOR_CLIENT_ID, RAPPI_INTEGRATOR_CLIENT_SECRET],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth requerida')
    const db = getFirestore()
    const userDoc = await db.collection('users').doc(request.auth.uid).get()
    const isPlatformAdmin = userDoc.exists && userDoc.data()?.isPlatformAdmin === true
    if (!isPlatformAdmin) throw new HttpsError('permission-denied', 'Solo admins')

    const env = getEnv(request.data?.env)
    const integratorToken = await getIntegratorToken(env)
    const clientId = getClientIdFromToken(integratorToken, RAPPI_INTEGRATOR_CLIENT_ID.value())
    try {
      const data = await listWebhooks({ env, integratorToken, clientId })
      return { ok: true, data, clientIdUsed: clientId }
    } catch (err) {
      return {
        ok: false,
        status: err?.response?.status,
        message: err.message,
        data: err?.response?.data,
      }
    }
  }
)

// ─── 5. Provisionar tienda del merchant ───────────────────────────────────

/**
 * Obtiene el merchantToken descifrado para un negocio. Si está expirado y hay
 * refreshToken, renueva. Devuelve `{ token, env }`.
 */
async function getMerchantToken(db, businessId) {
  const encryptionKey = RAPPI_TOKEN_ENCRYPTION_KEY.value()
  const snap = await db.collection('businesses').doc(businessId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Business no existe')
  const cfg = snap.data()?.rappiConfig
  if (!cfg?.merchantToken) {
    throw new HttpsError('failed-precondition', 'El negocio no ha conectado con Rappi (sin merchantToken)')
  }
  const env = getEnv(cfg.env)

  // ¿Expirado? Renovar con refresh_token si existe.
  const exp = Number(cfg.merchantTokenExpiresAt) || 0
  if (exp && Date.now() > exp - 30_000 && cfg.merchantRefreshToken) {
    try {
      const refresh = decryptToken(cfg.merchantRefreshToken, encryptionKey)
      const refreshed = await refreshMerchantToken({
        env,
        clientId: RAPPI_INTEGRATOR_CLIENT_ID.value(),
        clientSecret: RAPPI_INTEGRATOR_CLIENT_SECRET.value(),
        refreshToken: refresh,
      })
      const newEncrypted = encryptToken(refreshed.access_token, encryptionKey)
      const newRefreshEncrypted = refreshed.refresh_token
        ? encryptToken(refreshed.refresh_token, encryptionKey)
        : cfg.merchantRefreshToken
      const expiresAt = Date.now() + (Number(refreshed.expires_in) || 3600) * 1000
      await snap.ref.set({
        rappiConfig: {
          merchantToken: newEncrypted,
          merchantRefreshToken: newRefreshEncrypted,
          merchantTokenExpiresAt: expiresAt,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      return { token: refreshed.access_token, env }
    } catch (err) {
      console.warn('Refresh merchant token failed, usando token actual:', err.message)
    }
  }

  return { token: decryptToken(cfg.merchantToken, encryptionKey), env }
}

/**
 * Provisiona la tienda del negocio en Rappi.
 *   data: { businessId, storeId, name, integrationId?, env?, pingActive?, getMenuActive?, cancellationEvents? }
 */
export const rappiProvisionStore = onCall(
  {
    ...COMMON_OPTS,
    secrets: [
      RAPPI_INTEGRATOR_CLIENT_ID,
      RAPPI_INTEGRATOR_CLIENT_SECRET,
      RAPPI_TOKEN_ENCRYPTION_KEY,
    ],
  },
  async (request) => {
    const db = getFirestore()
    const businessId = request.data?.businessId
    await assertBusinessAccess(db, request.auth, businessId)

    const storeId = String(request.data?.storeId || '').trim()
    const name = String(request.data?.name || '').trim()
    const integrationId = String(request.data?.integrationId || RAPPI_INTEGRATOR_CLIENT_ID.value() || '').trim()
    if (!storeId) throw new HttpsError('invalid-argument', 'storeId requerido')
    if (!name) throw new HttpsError('invalid-argument', 'name requerido')

    const { token: merchantToken, env } = await getMerchantToken(db, businessId)
    const integratorToken = await getIntegratorToken(env)

    const store = {
      store_id: storeId,
      integration_id: integrationId,
      name,
      status: 'ACTIVE',
    }
    if (typeof request.data?.pingActive === 'boolean') store.ping_active = request.data.pingActive
    if (typeof request.data?.getMenuActive === 'boolean') store.get_menu_active = request.data.getMenuActive
    if (Array.isArray(request.data?.cancellationEvents)) store.cancellation_events = request.data.cancellationEvents

    try {
      const data = await provisionStores({
        env,
        integratorToken,
        merchantToken,
        stores: [store],
      })

      await db.collection('businesses').doc(businessId).set({
        rappiConfig: {
          storeId,
          storeName: name,
          storeIntegrationStatus: 'pending',
          provisioningRequestedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      return { ok: true, data }
    } catch (err) {
      return {
        ok: false,
        status: err?.response?.status,
        message: err?.response?.data?.message || err.message,
        data: err?.response?.data,
      }
    }
  }
)

/**
 * Consulta el estado de integración de las tiendas del merchant.
 */
export const rappiGetStoreStatus = onCall(
  {
    ...COMMON_OPTS,
    secrets: [
      RAPPI_INTEGRATOR_CLIENT_ID,
      RAPPI_INTEGRATOR_CLIENT_SECRET,
      RAPPI_TOKEN_ENCRYPTION_KEY,
    ],
  },
  async (request) => {
    const db = getFirestore()
    const businessId = request.data?.businessId
    await assertBusinessAccess(db, request.auth, businessId)

    const { token: merchantToken, env } = await getMerchantToken(db, businessId)
    const integratorToken = await getIntegratorToken(env)

    try {
      const data = await getIntegrationStatus({ env, integratorToken, merchantToken })
      return { ok: true, data }
    } catch (err) {
      return {
        ok: false,
        status: err?.response?.status,
        message: err?.response?.data?.message || err.message,
        data: err?.response?.data,
      }
    }
  }
)

/**
 * Desprovisiona la tienda del negocio (la desconecta de Rappi).
 */
export const rappiDeprovisionStore = onCall(
  {
    ...COMMON_OPTS,
    secrets: [
      RAPPI_INTEGRATOR_CLIENT_ID,
      RAPPI_INTEGRATOR_CLIENT_SECRET,
      RAPPI_TOKEN_ENCRYPTION_KEY,
    ],
  },
  async (request) => {
    const db = getFirestore()
    const businessId = request.data?.businessId
    await assertBusinessAccess(db, request.auth, businessId)

    const storeId = String(request.data?.storeId || '').trim()
    const integrationId = String(request.data?.integrationId || RAPPI_INTEGRATOR_CLIENT_ID.value() || '').trim()
    if (!storeId) throw new HttpsError('invalid-argument', 'storeId requerido')

    const { token: merchantToken, env } = await getMerchantToken(db, businessId)
    const integratorToken = await getIntegratorToken(env)

    try {
      const data = await deprovisionStores({
        env,
        integratorToken,
        merchantToken,
        stores: [{ store_id: storeId, integration_id: integrationId }],
      })
      return { ok: true, data }
    } catch (err) {
      return {
        ok: false,
        status: err?.response?.status,
        message: err?.response?.data?.message || err.message,
        data: err?.response?.data,
      }
    }
  }
)
