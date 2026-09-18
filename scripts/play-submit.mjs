#!/usr/bin/env node
//
// Sube un AAB a Google Play y lo manda a revisión (API oficial androidpublisher v3).
// Sin dependencias: Node 18+ (fetch + crypto nativos). Firma el JWT RS256 con el JSON
// de la cuenta de servicio y lo canjea por un token OAuth.
//
//   node scripts/play-submit.mjs [opciones]
//
// Opciones:
//   --aab <ruta>       AAB a subir (default: android/app/build/outputs/bundle/release/app-release.aab)
//   --track <nombre>   internal | alpha | beta | production   (default: internal)
//   --notas "<texto>"  "Novedades de esta versión"
//   --notas-file <f>   Lee las notas desde un archivo
//   --borrador         Deja la versión en BORRADOR (tú pulsas publicar en la consola)
//   --subir            Ejecuta la SUBIDA REAL. Sin esto = simulacro (solo lectura).
//
// Credenciales (override por env): GOOGLE_PLAY_KEY, PLAY_PACKAGE.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ─────────────────────────────────────────────
// El AAB se subía a mano por Play Console. iOS ya estaba automatizado
// (scripts/asc-submit.mjs), así que esto es el gemelo del otro lado: mismo
// estilo, mismo simulacro por defecto, mismo secreto fuera del repo.
//
// ⚠️ DIFERENCIA IMPORTANTE CON iOS: en Play NO existe un "enviar a revisión"
// aparte. Subir a un track con estado `completed` ES el envío; Google revisa
// desde ahí. Con `--borrador` la versión queda en BORRADOR y el botón final
// lo pulsas tú. En iOS la revisión sí es un paso explícito.
//
// ⚠️ El identificador del paquete NO es el `namespace` de build.gradle
// (com.cobrify.app): es el `applicationId`, com.factuya.cobrify.

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const KEY_FILE = process.env.GOOGLE_PLAY_KEY || path.join(os.homedir(), '.googleplay', 'cobrify-publisher.json')
const PACKAGE = process.env.PLAY_PACKAGE || 'com.factuya.cobrify'
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3'
const AAB_POR_DEFECTO = 'android/app/build/outputs/bundle/release/app-release.aab'
const TRACKS = ['internal', 'alpha', 'beta', 'production']

const args = process.argv.slice(2)
const opt = (n, def) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : def }
const SUBIR = args.includes('--subir')
const BORRADOR = args.includes('--borrador')
const track = opt('--track', 'internal')
const aabPath = opt('--aab', AAB_POR_DEFECTO)
let notas = opt('--notas')
const notasFile = opt('--notas-file')
if (!notas && notasFile) notas = fs.readFileSync(notasFile, 'utf8').trim()

const log = (...a) => console.log(...a)
const morir = (m) => { console.error('❌ ' + m); process.exit(1) }

if (!TRACKS.includes(track)) morir(`Track desconocido: ${track}. Usa uno de: ${TRACKS.join(', ')}`)
if (!fs.existsSync(KEY_FILE)) morir(`No existe la clave de la cuenta de servicio: ${KEY_FILE}\n   Créala en Google Cloud y guárdala ahí (ver el plan de publicación).`)
if (!fs.existsSync(aabPath)) morir(`No existe el AAB: ${aabPath}\n   Ármalo primero (gradlew bundleRelease).`)

// ── Token OAuth a partir del JSON de la cuenta de servicio ──────────────────
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

async function conseguirToken() {
  const key = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))
  if (!key.client_email || !key.private_key) morir('El JSON no parece de una cuenta de servicio (faltan client_email / private_key).')
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const firma = crypto.sign('RSA-SHA256', Buffer.from(input), key.private_key)
  const jwt = `${input}.${b64url(firma)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const j = await res.json()
  if (!res.ok) morir(`No se pudo obtener el token: ${j.error_description || JSON.stringify(j)}`)
  return { token: j.access_token, correo: key.client_email }
}

async function api(method, ruta, { body, raw, contentType } = {}) {
  const res = await fetch((ruta.startsWith('http') ? ruta : API + ruta), {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(contentType ? { 'Content-Type': contentType } : (body ? { 'Content-Type': 'application/json' } : {})),
    },
    body: raw || (body ? JSON.stringify(body) : undefined),
  })
  const texto = await res.text()
  let j
  try { j = texto ? JSON.parse(texto) : {} } catch { j = { raw: texto } }
  if (!res.ok) {
    const msg = j?.error?.message || texto
    // El error más común al empezar: la cuenta de servicio no tiene permiso en
    // Play Console, o Google todavía no lo propagó (puede tardar horas).
    if (res.status === 401 || res.status === 403) {
      morir(`${res.status}: ${msg}\n   Revisa que la cuenta de servicio esté invitada en Play Console con permiso sobre ${PACKAGE}.\n   Si la acabas de invitar, Google puede tardar horas en propagarlo.`)
    }
    morir(`${method} ${ruta} → ${res.status}: ${msg}`)
  }
  return j
}

let TOKEN = null

;(async () => {
  const cred = await conseguirToken()
  TOKEN = cred.token
  const tamaño = fs.statSync(aabPath).size
  log(`🔑 Cuenta de servicio: ${cred.correo}`)
  log(`📦 Paquete: ${PACKAGE}`)
  log(`📁 AAB: ${aabPath} (${tamaño.toLocaleString('es-PE')} bytes)`)
  log(`🚦 Track: ${track}${BORRADOR ? ' (como BORRADOR)' : ''}`)
  log(SUBIR ? '⚠️  MODO SUBIDA REAL (--subir)' : '🧪 SIMULACRO (no se sube nada)')
  log('')

  // Lectura: qué hay hoy en ese track. Sirve igual en simulacro.
  const edit = await api('POST', `/applications/${PACKAGE}/edits`)
  const editId = edit.id
  log(`📝 Edición abierta: ${editId}`)

  const actual = await api('GET', `/applications/${PACKAGE}/edits/${editId}/tracks/${track}`)
    .catch(() => ({ releases: [] }))
  const versiones = (actual.releases || []).flatMap(r => r.versionCodes || [])
  log(`   Hoy en "${track}": ${versiones.length ? versiones.join(', ') : '(sin versiones)'}`)

  if (!SUBIR) {
    log('')
    log('🧪 Con --subir haría:')
    log(`   1. Subir ${path.basename(aabPath)} como bundle nuevo`)
    log(`   2. Ponerlo en el track "${track}" con estado ${BORRADOR ? 'draft (borrador)' : 'completed (= enviado a revisión)'}`)
    log(`   3. Novedades: ${notas ? JSON.stringify(notas.slice(0, 60) + (notas.length > 60 ? '…' : '')) : '(sin notas)'}`)
    log(`   4. Confirmar la edición (commit)`)
    log('')
    log('   Para subir de verdad: --subir')
    // La edición sin confirmar caduca sola; se borra igual por prolijidad.
    await api('DELETE', `/applications/${PACKAGE}/edits/${editId}`).catch(() => {})
    return
  }

  // ===== CAMINO DE ESCRITURA (--subir) =====
  log('⏳ Subiendo el AAB (puede tardar varios minutos)…')
  const bundle = await api('POST', `${UPLOAD}/applications/${PACKAGE}/edits/${editId}/bundles?uploadType=media`, {
    raw: fs.readFileSync(aabPath),
    contentType: 'application/octet-stream',
  })
  log(`   ✓ Subido como versionCode ${bundle.versionCode}`)

  const release = {
    versionCodes: [String(bundle.versionCode)],
    status: BORRADOR ? 'draft' : 'completed',
  }
  if (notas) release.releaseNotes = [{ language: 'es-419', text: notas }]

  await api('PUT', `/applications/${PACKAGE}/edits/${editId}/tracks/${track}`, {
    body: { track, releases: [release] },
  })
  log(`   ✓ Puesto en "${track}" con estado ${release.status}`)

  await api('POST', `/applications/${PACKAGE}/edits/${editId}:commit`)
  log('')
  log(`✅ versionCode ${bundle.versionCode} en el track "${track}".`)
  log(BORRADOR
    ? '   Quedó en BORRADOR: entra a Play Console y pulsa publicar cuando quieras.'
    : '   Google ya lo tiene para revisión. Suele tardar horas o días.')
})().catch(e => { console.error('❌', e.message); process.exit(1) })
