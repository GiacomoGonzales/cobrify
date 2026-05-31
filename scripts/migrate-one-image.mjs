// ============================================================
// COPIAR UNA IMAGEN DE CLOUDINARY A R2 (prueba, sin tocar BD)
// ------------------------------------------------------------
// Que hace:
//   1) Descarga una imagen desde su URL de Cloudinary.
//   2) La sube a R2 conservando la misma ruta (key).
//   3) Verifica que se ve por la URL publica de R2.
//   4) Te da el link de R2 para confirmar visualmente.
//
// NO toca Firestore ni la app. Solo lee de Cloudinary y escribe en R2.
//
// Uso:
//   node scripts/migrate-one-image.mjs "https://res.cloudinary.com/.../foto.jpg"
// ============================================================

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// --- Cargar .r2.env ---
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.r2.env')
const env = {}
try {
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
} catch (e) {
  console.error('❌ No pude leer .r2.env:', e.message)
  process.exit(1)
}

const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL, R2_ENDPOINT, R2_ACCOUNT_ID } = env

const cloudinaryUrl = process.argv[2]
if (!cloudinaryUrl) {
  console.error('Uso: node scripts/migrate-one-image.mjs "<url-de-cloudinary>"')
  process.exit(1)
}

// --- Extraer la "ruta" (key) desde la URL de Cloudinary ---
// Ej: .../upload/v1778036383/cobrify/abc.jpg  ->  cobrify/abc.jpg
function cloudinaryToKey(url) {
  const limpia = url.split('?')[0]
  let m = limpia.match(/\/upload\/(?:.*?\/)?v\d+\/(.+)$/)
  if (m) return m[1]
  m = limpia.match(/\/upload\/(.+)$/)
  if (m) return m[1].replace(/^v\d+\//, '')
  return null
}

const key = cloudinaryToKey(cloudinaryUrl)
if (!key) {
  console.error('❌ No pude entender la ruta de esa URL de Cloudinary.')
  process.exit(1)
}

const endpoint = R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

async function main() {
  // 1) Descargar de Cloudinary
  console.log('1) Descargando imagen de Cloudinary...')
  const res = await fetch(cloudinaryUrl)
  if (!res.ok) {
    console.error('   ❌ No se pudo descargar. HTTP', res.status)
    process.exit(1)
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  const buf = Buffer.from(await res.arrayBuffer())
  console.log('   ✅ Descargada:', (buf.length / 1024).toFixed(1), 'KB  |  tipo:', contentType)

  // 2) Subir a R2 (misma ruta)
  console.log('2) Subiendo a R2 con la ruta: %s', key)
  await s3.send(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: contentType })
  )
  console.log('   ✅ Subida a R2.')

  // 3) Verificar que se ve por la URL publica
  const publicUrl = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
  console.log('3) Verificando que se ve por internet...')
  let ok = false
  let status = null
  let size = 0
  for (let i = 1; i <= 6; i++) {
    try {
      const r = await fetch(publicUrl)
      status = r.status
      if (r.ok) {
        size = (await r.arrayBuffer()).byteLength
        ok = true
        break
      }
    } catch (e) {
      status = 'error de red: ' + e.message
    }
    if (i < 6) await new Promise((r) => setTimeout(r, 1500))
  }

  if (ok && size > 0) {
    console.log('   ✅ Se ve correctamente. Tamaño servido:', (size / 1024).toFixed(1), 'KB')
    console.log('\n================= CONFIRMA TU MISMO =================')
    console.log('Abre este link (copia en R2):')
    console.log('  ' + publicUrl)
    console.log('\nY comparalo con el original (Cloudinary):')
    console.log('  ' + cloudinaryUrl)
    console.log('====================================================')
  } else {
    console.error('   ❌ No se pudo ver por la URL publica. HTTP:', status)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('\n❌ Error:', e?.message || e)
  if (e?.$metadata?.httpStatusCode) console.error('   HTTP status:', e.$metadata.httpStatusCode)
  process.exit(1)
})
