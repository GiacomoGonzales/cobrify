/**
 * Publica el APK recién compilado: lo sube a Storage y lo deja disponible en
 * el panel del reseller.
 *
 * Hace exactamente lo mismo que el botón de subida del panel de admin
 * (`src/services/resellerApkService.js`) — misma ruta, mismo contentType,
 * mismo campo `androidApp` — pero desde el CI y con firebase-admin, que no
 * pasa por las reglas de seguridad.
 *
 * Uso:
 *   node scripts/reseller-apk/publish.mjs --id=<resellerId> --version=1.2 [--notas="..."]
 *
 * Necesita GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT (JSON).
 */
import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APK = join(RAIZ, 'android/app/build/outputs/apk/release/app-release.apk')

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const i = a.indexOf('=')
      return i === -1 ? [a.slice(2), 'true'] : [a.slice(2, i), a.slice(i + 1)]
    })
)

const RESELLER_ID = args.id
if (!RESELLER_ID) {
  console.error('Falta --id (el id del reseller)')
  process.exit(1)
}
if (!existsSync(APK)) {
  console.error(`No hay APK en ${APK}. ¿Corrió build.mjs?`)
  process.exit(1)
}

// La credencial puede venir como archivo (GOOGLE_APPLICATION_CREDENTIALS) o
// como JSON en una variable, que es lo práctico en un secret de CI.
const raw = process.env.FIREBASE_SERVICE_ACCOUNT
const credencial = raw ? cert(JSON.parse(raw)) : undefined

initializeApp({
  ...(credencial ? { credential: credencial } : {}),
  projectId: 'cobrify-395fe',
  storageBucket: 'cobrify-395fe.firebasestorage.app',
})

const db = getFirestore()
const bucket = getStorage().bucket()

const destino = `reseller-apks/${RESELLER_ID}/app.apk`
const bytes = readFileSync(APK)
const sizeMb = Math.round((bytes.length / 1048576) * 10) / 10

console.log(`Subiendo ${sizeMb} MB → ${destino}`)

// El bucket tiene acceso uniforme: no se puede makePublic() por objeto. Se usa
// el token de descarga de Firebase Storage, igual que getDownloadURL() del SDK.
const token = randomUUID()
await bucket.upload(APK, {
  destination: destino,
  metadata: {
    contentType: 'application/vnd.android.package-archive',
    metadata: { firebaseStorageDownloadTokens: token },
  },
})

const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}`
  + `/o/${encodeURIComponent(destino)}?alt=media&token=${token}`

await db.collection('resellers').doc(RESELLER_ID).update({
  androidApp: {
    url,
    version: String(args.version || '').trim(),
    notas: String(args.notas || '').trim(),
    sizeMb,
    updatedAt: Timestamp.now(),
  },
  updatedAt: Timestamp.now(),
})

console.log(`\nPublicada: ${url}`)
console.log('Ya le aparece al reseller en Configuración → App Android.\n')
