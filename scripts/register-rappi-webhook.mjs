#!/usr/bin/env node
/**
 * Registra el webhook STORE_PROVISIONING_STATUS en Rappi (operación única de plataforma).
 *
 * Uso:
 *   RAPPI_INTEGRATOR_CLIENT_ID=... \
 *   RAPPI_INTEGRATOR_CLIENT_SECRET=... \
 *   RAPPI_WEBHOOK_SECRET=... \
 *   [RAPPI_WEBHOOK_URL=...] \
 *   node scripts/register-rappi-webhook.mjs [sandbox|production]
 *
 * Default env: sandbox. Default webhook URL: https://us-central1-cobrify-395fe.cloudfunctions.net/rappiWebhook
 *
 * El script:
 *   1. Autentica como integrador M2M (POST /restaurants/auth/v1/token/login/integrations).
 *   2. Registra el webhook (POST /clients/{clientId}/webhooks) con evento STORE_PROVISIONING_STATUS.
 *   3. Lista los webhooks registrados para verificar.
 */
import axios from 'axios'

// Producción por defecto; pasa "sandbox" como argumento para usar dev.
const env = (process.argv[2] === 'sandbox') ? 'sandbox' : 'production'

const BASE_URLS = {
  sandbox: 'https://microservices.dev.rappi.com',
  production: 'https://services.rappi.pe',
}

// Prefijo OBLIGATORIO de la Public API v2 (faltaba en la versión anterior → 404).
const PUBLIC_API = '/api/v2/restaurants-integrations-public-api'

// Lee el claim `azp` del JWT (= clientId que Rappi espera en el path del webhook).
function azpFromToken(token, fallback) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'))
    return payload?.azp || payload?.client_id || fallback
  } catch { return fallback }
}

const CLIENT_ID = process.env.RAPPI_INTEGRATOR_CLIENT_ID
const CLIENT_SECRET = process.env.RAPPI_INTEGRATOR_CLIENT_SECRET
const WEBHOOK_SECRET = process.env.RAPPI_WEBHOOK_SECRET
const WEBHOOK_URL = process.env.RAPPI_WEBHOOK_URL
  || 'https://us-central1-cobrify-395fe.cloudfunctions.net/rappiWebhook'
const EVENT = process.env.RAPPI_WEBHOOK_EVENT || 'STORE_PROVISIONING_STATUS'

if (!CLIENT_ID || !CLIENT_SECRET || !WEBHOOK_SECRET) {
  console.error('❌ Faltan variables de entorno:')
  console.error('   RAPPI_INTEGRATOR_CLIENT_ID, RAPPI_INTEGRATOR_CLIENT_SECRET, RAPPI_WEBHOOK_SECRET')
  process.exit(1)
}

const base = BASE_URLS[env]

console.log(`📡 Registrando webhook Rappi`)
console.log(`   Ambiente   : ${env} (${base})`)
console.log(`   Cliente ID : ${CLIENT_ID.slice(0, 6)}…${CLIENT_ID.slice(-4)}`)
console.log(`   Evento     : ${EVENT}`)
console.log(`   Webhook URL: ${WEBHOOK_URL}`)
console.log()

async function main() {
  // 1. Login integrador
  console.log('1️⃣  Login integrador…')
  let token
  try {
    const res = await axios.post(
      `${base}/restaurants/auth/v1/token/login/integrations`,
      { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    )
    token = res.data?.access_token
    if (!token) throw new Error('Respuesta sin access_token: ' + JSON.stringify(res.data))
    console.log('   ✅ Token obtenido')
  } catch (err) {
    console.error('   ❌ Error login:', err.response?.status, err.response?.data || err.message)
    process.exit(1)
  }

  // El clientId del path es el claim `azp` del JWT (no necesariamente el credencial).
  const clientId = azpFromToken(token, CLIENT_ID)
  console.log(`   azp (clientId del path): ${clientId.slice(0, 6)}…${clientId.slice(-4)}`)

  // 2. Registrar webhook
  console.log(`\n2️⃣  Registrando webhook ${EVENT}…`)
  try {
    const res = await axios.post(
      `${base}${PUBLIC_API}/clients/${clientId}/webhooks`,
      { event: EVENT, url: WEBHOOK_URL, secret: WEBHOOK_SECRET },
      {
        headers: {
          'x-authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    )
    console.log(`   ✅ HTTP ${res.status}`)
    console.log('   Respuesta:', JSON.stringify(res.data, null, 2))
  } catch (err) {
    console.error('   ❌ Error registrando:', err.response?.status, JSON.stringify(err.response?.data, null, 2) || err.message)
    if (err.response?.status === 409) {
      console.log('   ℹ️  Es posible que el webhook ya estuviera registrado.')
    } else {
      process.exit(1)
    }
  }

  // 3. Listar para verificar
  console.log('\n3️⃣  Listando webhooks registrados…')
  try {
    const res = await axios.get(
      `${base}${PUBLIC_API}/clients/${clientId}/webhooks`,
      { headers: { 'x-authorization': `Bearer ${token}` }, timeout: 15000 }
    )
    console.log('   ', JSON.stringify(res.data, null, 2))
  } catch (err) {
    console.error('   ⚠️  No se pudo listar:', err.response?.status, err.message)
  }

  console.log('\n✅ Listo')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
