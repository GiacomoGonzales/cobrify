/**
 * Publica de una vez las APK ya compiladas de varios resellers.
 *
 * Toma los .apk de una carpeta, los sube a Storage y los deja disponibles en
 * el panel de cada reseller. Es el mismo trabajo que hacer siete veces el
 * botón del panel de admin, pero sin siete veces el gesto.
 *
 * Cada archivo se relaciona con su reseller leyendo el `applicationId` del
 * propio APK y buscando el dominio que le corresponde: así no hay que mantener
 * a mano una lista de qué archivo es de quién, que es justo donde se cuelan
 * los errores (subirle a un reseller la app de otro).
 *
 * Uso:
 *   node scripts/reseller-apk/publish-batch.mjs --dir=C:/ruta/apks [--version=1.0]
 *
 * Credenciales: FIREBASE_SERVICE_ACCOUNT (JSON) o, en local,
 *   gcloud auth application-default login
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import JSZip from 'jszip'

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const i = a.indexOf('=')
      return i === -1 ? [a.slice(2), 'true'] : [a.slice(2, i), a.slice(i + 1)]
    })
)

const DIR = args.dir
if (!DIR) {
  console.error('Falta --dir=<carpeta con los .apk>')
  process.exit(1)
}
const VERSION = args.version || '1.0'

const raw = process.env.FIREBASE_SERVICE_ACCOUNT
initializeApp({
  credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
  projectId: 'cobrify-395fe',
  storageBucket: 'cobrify-395fe.firebasestorage.app',
})

const db = getFirestore()
const bucket = getStorage().bucket()

/** El dominio al que apunta el APK, leído de su propia configuración. */
async function dominioDelApk(ruta) {
  try {
    const zip = await JSZip.loadAsync(readFileSync(ruta))
    const cfg = JSON.parse(await zip.file('assets/capacitor.config.json').async('string'))
    return new URL(cfg.server.url).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

// Resellers por dominio, para emparejar sin listas a mano.
const snap = await db.collection('resellers').get()
const porDominio = new Map()
snap.forEach(d => {
  const dom = (d.data().customDomain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (dom) porDominio.set(dom.replace(/^www\./, ''), { id: d.id, nombre: d.data().companyName || d.id })
})

const archivos = readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.apk'))
console.log(`\n${archivos.length} APK en la carpeta\n`)

let ok = 0
for (const archivo of archivos) {
  const ruta = join(DIR, archivo)
  const dominio = await dominioDelApk(ruta)
  if (!dominio) {
    console.log(`  ! ${archivo}: no se pudo leer su configuración, se omite`)
    continue
  }
  const reseller = porDominio.get(dominio)
  if (!reseller) {
    console.log(`  ! ${archivo}: ningún reseller con el dominio ${dominio}, se omite`)
    continue
  }

  const destino = `reseller-apks/${reseller.id}/app.apk`
  const sizeMb = Math.round((statSync(ruta).size / 1048576) * 10) / 10

  // El bucket tiene acceso uniforme (uniform bucket-level access), asi que no
  // se pueden dar permisos por objeto con makePublic(). Se usa el mecanismo
  // propio de Firebase Storage: un token de descarga en la metadata, que es
  // exactamente lo que genera getDownloadURL() en el SDK web.
  const token = randomUUID()
  await bucket.upload(ruta, {
    destination: destino,
    metadata: {
      contentType: 'application/vnd.android.package-archive',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  })
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}`
    + `/o/${encodeURIComponent(destino)}?alt=media&token=${token}`

  await db.collection('resellers').doc(reseller.id).update({
    androidApp: {
      url, version: VERSION, notas: '', sizeMb, updatedAt: Timestamp.now(),
    },
    updatedAt: Timestamp.now(),
  })

  console.log(`  ok ${reseller.nombre.padEnd(22)} ${sizeMb} MB  (${dominio})`)
  ok++
}

console.log(`\nPublicadas ${ok} de ${archivos.length}. Ya les aparecen en su panel.\n`)
