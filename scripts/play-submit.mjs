#!/usr/bin/env node
//
// Sube un AAB a Google Play y lo manda a revisión (API oficial androidpublisher v3).
// Sin dependencias: Node 18+ (fetch + crypto nativos). Firma el JWT RS256 con el JSON
// de la cuenta de servicio y lo canjea por un token OAuth.
//
//   node scripts/play-submit.mjs [opciones]
//
// SUBIR UNA VERSIÓN
//   --aab <ruta>       AAB a subir (default: android/app/build/outputs/bundle/release/app-release.aab)
//   --track <nombre>   internal | alpha | beta | production   (default: internal)
//   --notas "<texto>"  "Novedades de esta versión"
//   --notas-file <f>   Lee las notas desde un archivo
//   --porcentaje <n>   POR ETAPAS: sale solo al n% de los usuarios (0 ≤ n < 100)
//   --borrador         Deja la versión en BORRADOR (tú pulsas publicar en la consola)
//
// MOVER UN DESPLIEGUE YA EMPEZADO (no suben nada y no necesitan AAB)
//   --avanzar <n>      Lleva el despliegue de ese track al n%
//   --completar        Lo lleva al 100% de los usuarios
//   --detener          Lo PAUSA: deja de llegar a usuarios nuevos; quien ya lo tiene se lo queda
//
//   --subir            Ejecuta la acción DE VERDAD. Sin esto = simulacro (solo lectura).
//
// Credenciales (override por env): GOOGLE_PLAY_KEY, PLAY_PACKAGE.
//
// Una salida prudente a producción, paso a paso:
//   node scripts/play-submit.mjs --track production --porcentaje 10 --subir
//   node scripts/play-submit.mjs --track production --avanzar 50 --subir      (al día siguiente)
//   node scripts/play-submit.mjs --track production --completar --subir       (al 100%)
//   node scripts/play-submit.mjs --track production --detener --subir         (si algo sale mal)
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
//
// ── REGLAS DEL DESPLIEGUE POR ETAPAS ────────────────────────────────────────
// COMPROBADAS CONTRA LA API el 17-set-2026 con `probar_porcentajes.mjs`: una
// edición que se abre, prueba cada combinación y se DESCARTA sin confirmar (sin
// commit no se publica nada). No están deducidas de la documentación:
//   · El porcentaje SOLO vive con estado `inProgress`. Con `completed`, `draft`
//     o `halted` la API contesta "must not have fraction".
//   · El rango es 0 ≤ fracción < 1. El 100% NO se expresa como fracción: es
//     `completed`. Por eso `--porcentaje 100` no existe — para eso, `--completar`.
//   · `halted` (pausar) va SIN fracción: conserva el porcentaje al que llegó.
//   · El canal `internal` TAMBIÉN acepta porcentaje. Se daba por hecho que no.
//     Ojo con el alcance de la prueba: se comprobó que la API lo ACEPTA dentro de
//     la edición; no se llegó a confirmar un commit con eso, porque confirmar publica.

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
const tiene = (n) => args.includes(n)

const SUBIR = tiene('--subir')
const BORRADOR = tiene('--borrador')
const track = opt('--track', 'internal')
const aabPath = opt('--aab', AAB_POR_DEFECTO)
let notas = opt('--notas')
const notasFile = opt('--notas-file')
if (!notas && notasFile) notas = fs.readFileSync(notasFile, 'utf8').trim()

const log = (...a) => console.log(...a)
const morir = (m) => { console.error('❌ ' + m); process.exit(1) }

// Una sola acción por corrida: combinarlas no significa nada.
const GESTIONES = ['--avanzar', '--completar', '--detener'].filter(tiene)
if (GESTIONES.length > 1) morir(`Elige una sola acción: ${GESTIONES.join(' y ')} no se combinan.`)
const GESTION = GESTIONES[0] || null

// 0 ≤ n < 100. El 100 se rechaza a propósito: la API no acepta la fracción 1.
const leerPorcentaje = (crudo, flag) => {
  const n = Number(crudo)
  if (crudo === undefined || crudo === '' || Number.isNaN(n)) morir(`${flag} necesita un número. Ejemplo: ${flag} 10`)
  if (n === 100) morir(`${flag} 100 no existe: el 100% es --completar (la API rechaza la fracción 1).`)
  if (n < 0 || n >= 100) morir(`${flag} va de 0 a 99.99 — recibí ${crudo}.`)
  return Number((n / 100).toFixed(6))
}

const comoPct = (f) => `${Number((f * 100).toFixed(4))}%`
const describirUno = (r) => {
  const v = (r.versionCodes || []).join(', ') || '(sin versionCode)'
  const pct = (r.userFraction !== undefined && r.userFraction !== null) ? ` al ${comoPct(r.userFraction)}` : ''
  return `${v} [${r.status}${pct}]`
}
const describir = (lista) => (lista.length ? lista.map(describirUno).join(' · ') : '(sin versiones)')

if (!TRACKS.includes(track)) morir(`Track desconocido: ${track}. Usa uno de: ${TRACKS.join(', ')}`)
if (!fs.existsSync(KEY_FILE)) morir(`No existe la clave de la cuenta de servicio: ${KEY_FILE}\n   Créala en Google Cloud y guárdala ahí (ver el plan de publicación).`)

let fraccion = null
if (GESTION) {
  if (tiene('--porcentaje')) morir(`${GESTION} no se combina con --porcentaje: el número va dentro de --avanzar.`)
  if (BORRADOR) morir(`${GESTION} no se combina con --borrador.`)
  if (GESTION === '--avanzar') fraccion = leerPorcentaje(opt('--avanzar'), '--avanzar')
} else {
  if (tiene('--porcentaje')) {
    // Comprobado contra la API: "DRAFT release must not have fraction".
    if (BORRADOR) morir('--porcentaje y --borrador se contradicen: un borrador todavía no le llega a nadie, y la API rechaza la fracción en estado draft.')
    fraccion = leerPorcentaje(opt('--porcentaje'), '--porcentaje')
  }
  if (!fs.existsSync(aabPath)) morir(`No existe el AAB: ${aabPath}\n   Ármalo primero (gradlew bundleRelease).`)
}

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

// `tolerante` devuelve null en vez de cortar: lo necesita el GET de un track
// que todavía no existe. (Sin esto, un .catch() no sirve de nada, porque
// `morir` sale del proceso antes de que la promesa se rechace.)
async function api(method, ruta, { body, raw, contentType, tolerante } = {}) {
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
    if (tolerante) return null
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

// Cuál release mover. Un track suele tener uno solo; si hay varios, el que se
// puede mover es el que está en curso. Si queda ambiguo, se para antes de tocar.
const releaseAMover = (lista) => {
  if (!lista.length) morir(`En "${track}" no hay ninguna versión: no hay despliegue que mover.`)
  const enCurso = lista.filter(r => r.status === 'inProgress' || r.status === 'halted')
  if (enCurso.length > 1) morir(`En "${track}" hay ${enCurso.length} versiones en curso; no adivino cuál mover. Míralo en Play Console.`)
  const elegido = enCurso[0] || (lista.length === 1 ? lista[0] : null)
  if (!elegido) morir(`En "${track}" hay ${lista.length} versiones y ninguna en curso (${lista.map(r => r.status).join(', ')}): no sé cuál mover.`)
  if (elegido.status === 'completed' && GESTION !== '--detener') {
    morir(`En "${track}" la versión ${(elegido.versionCodes || []).join(', ')} ya está al 100% (completed): no quedan etapas que mover.`)
  }
  return elegido
}

let TOKEN = null

;(async () => {
  const cred = await conseguirToken()
  TOKEN = cred.token
  log(`🔑 Cuenta de servicio: ${cred.correo}`)
  log(`📦 Paquete: ${PACKAGE}`)
  if (!GESTION) {
    const tamaño = fs.statSync(aabPath).size
    log(`📁 AAB: ${aabPath} (${tamaño.toLocaleString('es-PE')} bytes)`)
  }
  log(`🚦 Track: ${track}${BORRADOR ? ' (como BORRADOR)' : ''}`)
  if (GESTION) log(`🔧 Acción: ${GESTION}${GESTION === '--avanzar' ? ` ${comoPct(fraccion)}` : ''} — no sube ningún AAB`)
  else if (fraccion !== null) log(`📊 Por etapas: saldría al ${comoPct(fraccion)} de los usuarios`)
  log(SUBIR ? '⚠️  MODO REAL (--subir)' : '🧪 SIMULACRO (no se cambia nada)')
  log('')

  const edit = await api('POST', `/applications/${PACKAGE}/edits`)
  const editId = edit.id
  log(`📝 Edición abierta: ${editId}`)

  const actual = await api('GET', `/applications/${PACKAGE}/edits/${editId}/tracks/${track}`, { tolerante: true })
  const releases = (actual && actual.releases) || []
  log(`   Hoy en "${track}": ${describir(releases)}`)

  // La edición sin confirmar caduca sola; se borra igual por prolijidad.
  const descartar = () => api('DELETE', `/applications/${PACKAGE}/edits/${editId}`, { tolerante: true })

  // ===== MOVER UN DESPLIEGUE YA EMPEZADO =====
  if (GESTION) {
    const elegido = releaseAMover(releases)
    const nuevo = { ...elegido }
    delete nuevo.userFraction // la API solo acepta fracción con inProgress
    if (GESTION === '--avanzar') { nuevo.status = 'inProgress'; nuevo.userFraction = fraccion }
    if (GESTION === '--completar') nuevo.status = 'completed'
    if (GESTION === '--detener') nuevo.status = 'halted'

    log('')
    log(`   ${describirUno(elegido)}  →  ${describirUno(nuevo)}`)

    if (!SUBIR) {
      log('')
      log('   Para hacerlo de verdad: --subir')
      await descartar()
      return
    }

    // Se reemplaza SOLO el release elegido: los demás viajan tal cual, y con
    // ellos sus notas de versión, que un PUT parcial borraría.
    await api('PUT', `/applications/${PACKAGE}/edits/${editId}/tracks/${track}`, {
      body: { track, releases: releases.map(r => (r === elegido ? nuevo : r)) },
    })
    await api('POST', `/applications/${PACKAGE}/edits/${editId}:commit`)
    log('')
    log(`✅ "${track}": ${describirUno(nuevo)}`)
    if (GESTION === '--detener') log('   Pausado: deja de llegar a usuarios nuevos. Quien ya lo instaló se lo queda.')
    return
  }

  // ===== SUBIR UNA VERSIÓN =====
  if (!SUBIR) {
    const estado = BORRADOR
      ? 'draft (borrador)'
      : (fraccion !== null ? `inProgress al ${comoPct(fraccion)}` : 'completed (= enviado a revisión, al 100%)')
    log('')
    log('🧪 Con --subir haría:')
    log(`   1. Subir ${path.basename(aabPath)} como bundle nuevo`)
    log(`   2. Ponerlo en el track "${track}" con estado ${estado}`)
    log(`   3. Novedades: ${notas ? JSON.stringify(notas.slice(0, 60) + (notas.length > 60 ? '…' : '')) : '(sin notas)'}`)
    log('   4. Confirmar la edición (commit)')
    log('')
    log('   Para subir de verdad: --subir')
    await descartar()
    return
  }

  log('⏳ Subiendo el AAB (puede tardar varios minutos)…')
  const bundle = await api('POST', `${UPLOAD}/applications/${PACKAGE}/edits/${editId}/bundles?uploadType=media`, {
    raw: fs.readFileSync(aabPath),
    contentType: 'application/octet-stream',
  })
  log(`   ✓ Subido como versionCode ${bundle.versionCode}`)

  const release = { versionCodes: [String(bundle.versionCode)] }
  if (BORRADOR) release.status = 'draft'
  else if (fraccion !== null) { release.status = 'inProgress'; release.userFraction = fraccion }
  else release.status = 'completed'
  if (notas) release.releaseNotes = [{ language: 'es-419', text: notas }]

  await api('PUT', `/applications/${PACKAGE}/edits/${editId}/tracks/${track}`, {
    body: { track, releases: [release] },
  })
  log(`   ✓ Puesto en "${track}": ${describirUno(release)}`)

  await api('POST', `/applications/${PACKAGE}/edits/${editId}:commit`)
  log('')
  log(`✅ versionCode ${bundle.versionCode} en el track "${track}".`)
  if (BORRADOR) {
    log('   Quedó en BORRADOR: entra a Play Console y pulsa publicar cuando quieras.')
  } else if (fraccion !== null) {
    log(`   Google ya lo tiene para revisión. Al aprobarlo sale al ${comoPct(fraccion)} de los usuarios.`)
    log('')
    log('   Los siguientes pasos, cuando quieras darlos:')
    log(`     node scripts/play-submit.mjs --track ${track} --avanzar 50 --subir`)
    log(`     node scripts/play-submit.mjs --track ${track} --completar --subir`)
    log(`     node scripts/play-submit.mjs --track ${track} --detener --subir     (si algo sale mal)`)
  } else {
    log('   Google ya lo tiene para revisión. Suele tardar horas o días.')
  }
})().catch(e => { console.error('❌', e.message); process.exit(1) })
