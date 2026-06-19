#!/usr/bin/env node
//
// Envía una versión de Cobrify a revisión en App Store Connect (API REST oficial).
// Sin dependencias: Node 18+ (fetch + crypto nativos). Genera el JWT ES256 con la .p8.
//
//   node scripts/asc-submit.mjs <marketingVersion> [opciones]
//
// Opciones:
//   --build <n>        Build a usar (si se omite, toma el más reciente VÁLIDO)
//   --notes "<texto>"  "Novedades" (What's New). Obligatorio para --submit.
//   --notes-file <f>   Lee las notas desde un archivo.
//   --auto-release     Publica automáticamente tras aprobación (default: liberación manual).
//   --submit           Ejecuta el ENVÍO REAL. Sin esto = dry-run (solo lectura).
//
// Credenciales (override por env): ASC_ISSUER_ID, ASC_KEY_ID, ASC_P8, ASC_BUNDLE_ID.
// NOTA: el build debe traer ITSAppUsesNonExemptEncryption embebido (builds 54+); si no,
//       App Store Connect pedirá export compliance y el envío por API fallará.

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ISSUER_ID = process.env.ASC_ISSUER_ID || '30c4081f-93c0-4315-a7fd-bdb65e06a34c'
const KEY_ID    = process.env.ASC_KEY_ID    || 'ASW2WC8WUH'
const P8        = process.env.ASC_P8        || path.join(os.homedir(), '.appstoreconnect/private_keys', `AuthKey_${KEY_ID}.p8`)
const BUNDLE_ID = process.env.ASC_BUNDLE_ID || 'com.cobrify.app'
const API = 'https://api.appstoreconnect.apple.com'

const args = process.argv.slice(2)
const version = args.find(a => !a.startsWith('--'))
const getOpt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const SUBMIT = args.includes('--submit')
const AUTO_RELEASE = args.includes('--auto-release')
const buildNumber = getOpt('--build')
let notes = getOpt('--notes')
const notesFile = getOpt('--notes-file')
if (!notes && notesFile) notes = fs.readFileSync(notesFile, 'utf8').trim()

if (!version) {
  console.error('Uso: node scripts/asc-submit.mjs <marketingVersion> [--build n] [--notes "..."] [--submit] [--auto-release]')
  process.exit(1)
}

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
function makeJWT() {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const key = crypto.createPrivateKey(fs.readFileSync(P8))
  const sig = crypto.sign('SHA256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
  return `${input}.${b64url(sig)}`
}
const TOKEN = makeJWT()

async function api(method, urlPath, body) {
  const res = await fetch(urlPath.startsWith('http') ? urlPath : API + urlPath, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok) {
    const errs = (json.errors || []).map(e => `${e.title}: ${e.detail}`).join(' | ') || text
    throw new Error(`${method} ${urlPath} → ${res.status}: ${errs}`)
  }
  return json
}
const log = (...a) => console.log(...a)

;(async () => {
  log(`🔑 Auth OK (Issuer ${ISSUER_ID.slice(0, 8)}…, Key ${KEY_ID})`)
  log(SUBMIT ? '⚠️  MODO ENVÍO REAL (--submit)' : '🧪 DRY-RUN (solo lectura)')

  // 1. App
  const apps = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}&limit=1`)
  const app = apps.data?.[0]
  if (!app) throw new Error(`No se encontró app con bundleId ${BUNDLE_ID}`)
  log(`📱 App: ${app.attributes.name} (${app.id})`)

  // 2. Build
  const builds = await api('GET', `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=25`)
  const build = buildNumber
    ? builds.data.find(b => b.attributes.version === String(buildNumber))
    : builds.data.find(b => b.attributes.processingState === 'VALID')
  if (!build) throw new Error(buildNumber ? `No encuentro el build ${buildNumber}` : 'No hay builds VÁLIDOS aún')
  log(`📦 Build ${build.attributes.version} — processingState=${build.attributes.processingState}`)

  // 3. App Store Version record
  const versRes = await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[versionString]=${version}&limit=1`)
  let asv = versRes.data?.[0]
  log(asv ? `📝 Versión ${version} existe (estado: ${asv.attributes.appStoreState})` : `📝 Versión ${version} no existe aún → se crearía`)

  if (!SUBMIT) {
    log('\n🧪 Con --submit haría:')
    log(`   1. ${asv ? 'Usar' : 'Crear'} versión ${version}`)
    log(`   2. Asociar build ${build.attributes.version}` + (build.attributes.processingState !== 'VALID' ? '  ⏳ (aún no VALID — esperar)' : ''))
    log(`   3. "Novedades": ${notes ? JSON.stringify(notes.slice(0, 60) + (notes.length > 60 ? '…' : '')) : '(faltan --notes)'}`)
    log(`   4. Liberación: ${AUTO_RELEASE ? 'automática tras aprobación' : 'manual'}`)
    log(`   5. Crear reviewSubmission + item y enviar a revisión`)
    log('\n   Para enviar de verdad: --submit (+ --notes si falta).')
    return
  }

  // ===== WRITE PATH (--submit) =====
  if (!notes) throw new Error('Faltan "Novedades" (--notes "..." o --notes-file). Obligatorio para actualizaciones.')
  if (build.attributes.processingState !== 'VALID') throw new Error(`Build ${build.attributes.version} no está VALID (procesando). Reintenta en unos minutos.`)

  if (!asv) {
    const created = await api('POST', '/v1/appStoreVersions', {
      data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: version }, relationships: { app: { data: { type: 'apps', id: app.id } } } },
    })
    asv = created.data
    log(`   ✓ Versión ${version} creada (${asv.id})`)
  }

  await api('PATCH', `/v1/appStoreVersions/${asv.id}`, {
    data: { type: 'appStoreVersions', id: asv.id, attributes: { releaseType: AUTO_RELEASE ? 'AFTER_APPROVAL' : 'MANUAL' } },
  })

  await api('PATCH', `/v1/appStoreVersions/${asv.id}/relationships/build`, { data: { type: 'builds', id: build.id } })
  log(`   ✓ Build ${build.attributes.version} asociado`)

  const locs = await api('GET', `/v1/appStoreVersions/${asv.id}/appStoreVersionLocalizations`)
  for (const loc of locs.data) {
    await api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, {
      data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { whatsNew: notes } },
    })
  }
  log(`   ✓ "Novedades" en ${locs.data.length} idioma(s)`)

  // Review submission (reusar abierta si existe)
  let rs
  try {
    const open = await api('GET', `/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,UNRESOLVED_ISSUES&limit=1`)
    rs = open.data?.[0]
  } catch { /* sin abiertas */ }
  if (!rs) {
    const created = await api('POST', '/v1/reviewSubmissions', {
      data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: app.id } } } },
    })
    rs = created.data
    log(`   ✓ reviewSubmission creada (${rs.id})`)
  } else {
    log(`   ✓ Reusando reviewSubmission ${rs.id} (${rs.attributes.state})`)
  }

  await api('POST', '/v1/reviewSubmissionItems', {
    data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: rs.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: asv.id } } } },
  })
  log(`   ✓ Versión añadida a la submission`)

  await api('PATCH', `/v1/reviewSubmissions/${rs.id}`, {
    data: { type: 'reviewSubmissions', id: rs.id, attributes: { submitted: true } },
  })
  log(`\n✅ ${version} (build ${build.attributes.version}) ENVIADA A REVISIÓN. Apple la revisará en horas–días.`)
})().catch(e => { console.error('❌', e.message); process.exit(1) })
