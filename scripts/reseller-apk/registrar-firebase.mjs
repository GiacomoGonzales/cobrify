/**
 * Da de alta en Firebase las apps Android de los resellers.
 *
 * Sin esto el push NO funciona: el `google-services.json` que lleva el APK
 * tiene el paquete clonado a mano —alcanza para compilar— pero Firebase no
 * reconoce esas apps como suyas y nunca les entrega un mensaje.
 *
 * Al terminar, baja el `google-services.json` actualizado del proyecto (con
 * las apps nuevas dentro) y lo deja en android/. Los APK hay que
 * RECOMPILARLOS después: los que ya están publicados llevan el archivo viejo.
 *
 * Uso:
 *   node scripts/reseller-apk/registrar-firebase.mjs [--dry]   (--dry = solo mostrar)
 *
 * Credenciales: gcloud auth application-default login, o FIREBASE_SERVICE_ACCOUNT.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GoogleAuth } from 'google-auth-library'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROYECTO = 'cobrify-395fe'
const API = `https://firebase.googleapis.com/v1beta1/projects/${PROYECTO}`

const DRY = process.argv.includes('--dry')

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
const cliente = await auth.getClient()

const pedir = async (url, method = 'GET', data) => {
  const r = await cliente.request({ url, method, data })
  return r.data
}

const dormir = (ms) => new Promise(r => setTimeout(r, ms))

// ---------------------------------------------------------------- resellers
// Se leen del propio proyecto: la fuente de la verdad es Firestore, no una
// lista escrita a mano que se desactualiza al primer reseller nuevo.
const { getFirestore } = await import('firebase-admin/firestore')
const { initializeApp, applicationDefault, cert } = await import('firebase-admin/app')
const raw = process.env.FIREBASE_SERVICE_ACCOUNT
initializeApp({
  credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
  projectId: PROYECTO,
})
const db = getFirestore()

const appIdDe = (marca, dominio) => {
  const base = (marca || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    || dominio.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
  return `com.${base}.app`
}

const snap = await db.collection('resellers').get()
const resellers = []
snap.forEach(d => {
  const v = d.data()
  const dom = (v.customDomain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!dom) return
  const marca = v.branding?.companyName || v.companyName || ''
  resellers.push({ id: d.id, marca, dominio: dom, packageName: appIdDe(marca, dom) })
})
resellers.sort((a, b) => a.marca.localeCompare(b.marca, 'es'))

// ------------------------------------------------------------ ya registradas
// PAGINADO: la API devuelve las apps por paginas. Sin seguir nextPageToken,
// con 11 apps la primera bajada trajo 9. Paso de verdad (25-ago-2026).
const listarApps = async () => {
  const apps = []
  let pageToken = null
  do {
    const r = await pedir(`${API}/androidApps${pageToken ? `?pageToken=${pageToken}` : ''}`)
    apps.push(...(r.apps || []))
    pageToken = r.nextPageToken || null
  } while (pageToken)
  return apps
}

const existentes = new Set((await listarApps()).map(a => a.packageName))

const faltan = resellers.filter(r => !existentes.has(r.packageName))

console.log(`\nApps Android ya registradas: ${existentes.size}`)
existentes.forEach(p => console.log(`  · ${p}`))
console.log(`\nA registrar: ${faltan.length}`)
faltan.forEach(r => console.log(`  + ${r.packageName.padEnd(26)} ${r.marca}`))

if (DRY) {
  console.log('\n(simulación — no se creó nada; quita --dry para aplicar)\n')
  process.exit(0)
}
// Sin nada que registrar NO se sale: igual hay que bajar el
// google-services.json. Si no, un `git checkout android/` que revierta el
// archivo deja el repo sin las apps y los APK se compilan con el
// identificador de Firebase equivocado — pasó exactamente eso.
if (faltan.length === 0) {
  console.log('\nTodas registradas; se refresca el google-services.json.')
}

// -------------------------------------------------------------- registrarlas
console.log('')
for (const r of faltan) {
  try {
    // La creación devuelve una operación de larga duración; hay que esperarla
    // o el google-services.json se baja sin la app dentro.
    const op = await pedir(`${API}/androidApps`, 'POST', {
      packageName: r.packageName,
      displayName: r.marca,
    })
    let hecha = op.done ? op : null
    for (let i = 0; i < 30 && !hecha; i++) {
      await dormir(2000)
      const estado = await pedir(`https://firebase.googleapis.com/v1beta1/${op.name}`)
      if (estado.done) hecha = estado
    }
    if (!hecha) throw new Error('la operación no terminó a tiempo')
    if (hecha.error) throw new Error(hecha.error.message)
    console.log(`  ok ${r.packageName.padEnd(26)} ${r.marca}`)
  } catch (e) {
    console.log(`  FALLO ${r.packageName}: ${(e.message || '').slice(0, 120)}`)
  }
}

// --------------------------------------------- google-services.json del proyecto
// Se baja el de la app PRINCIPAL y se FUSIONA con el archivo local: el config
// que devuelve Firebase puede venir incompleto (mismo paginado que la lista),
// y pisar el archivo fue lo que dejo fuera a com.factuya.cobrify — la app de
// Play — y el AAB de la 4.26.63 no compilaba. Un cliente que ya esta en el
// archivo local NUNCA se pierde; solo se agregan los nuevos.
const apps = await listarApps()
const principal = apps.find(a => a.packageName === 'com.factuya.cobrify')
  || apps.find(a => a.packageName === 'com.cobrify.app')
  || apps[0]
const cfg = await pedir(`https://firebase.googleapis.com/v1beta1/${principal.name}/config`)
const bajado = JSON.parse(Buffer.from(cfg.configFileContents, 'base64').toString('utf8'))

const destino = join(RAIZ, 'android/app/google-services.json')
const { readFileSync, existsSync } = await import('node:fs')
const local = existsSync(destino) ? JSON.parse(readFileSync(destino, 'utf8')) : { ...bajado, client: [] }
const pkgDe = (c) => c.client_info.android_client_info.package_name
const yaEsta = new Set(local.client.map(pkgDe))
for (const c of bajado.client) {
  if (!yaEsta.has(pkgDe(c))) local.client.push(c)
}
local.client.sort((a, b) => pkgDe(a).localeCompare(pkgDe(b)))
writeFileSync(destino, JSON.stringify(local, null, 2), 'utf8')

const paquetes = local.client.map(pkgDe)
console.log(`\ngoogle-services.json actualizado (${paquetes.length} paquetes):`)
paquetes.forEach(p => console.log(`  · ${p}`))
// Guardia: sin la app principal de Play, el AAB no compila.
if (!paquetes.includes('com.factuya.cobrify')) {
  console.log('\n⚠️  OJO: falta com.factuya.cobrify (la app de Play Store) en el archivo.')
}
console.log('\nOJO: los APK ya publicados llevan el archivo viejo. Hay que recompilarlos.\n')
