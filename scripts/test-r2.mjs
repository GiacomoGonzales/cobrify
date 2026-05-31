// ============================================================
// PRUEBA MINIMA DE CLOUDFLARE R2 (cobrify)
// ------------------------------------------------------------
// Que hace:
//   1) Sube un pequeño archivo de prueba al bucket R2.
//   2) Verifica que ese archivo se puede ver por la URL publica.
//   3) (Opcional) lo borra para no dejar basura.
//
// Como correrlo:
//   node scripts/test-r2.mjs
//
// IMPORTANTE: este script NUNCA imprime tus credenciales.
// Lee los valores desde el archivo .r2.env (que no esta en Git).
// ============================================================

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.r2.env')

// --- 1. Cargar .r2.env (parser simple, sin dependencias) ---
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
  console.error('❌ No pude leer el archivo .r2.env:', e.message)
  console.error('   Asegurate de que el archivo .r2.env existe en la raiz del proyecto.')
  process.exit(1)
}

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_URL,
  R2_ENDPOINT,
} = env

// --- 2. Validar que pegaste tus credenciales (sin mostrarlas) ---
const missing = []
if (!R2_ACCESS_KEY_ID || R2_ACCESS_KEY_ID.includes('PEGA_AQUI')) missing.push('R2_ACCESS_KEY_ID')
if (!R2_SECRET_ACCESS_KEY || R2_SECRET_ACCESS_KEY.includes('PEGA_AQUI')) missing.push('R2_SECRET_ACCESS_KEY')
if (!R2_BUCKET) missing.push('R2_BUCKET')
if (!R2_PUBLIC_URL) missing.push('R2_PUBLIC_URL')
if (missing.length) {
  console.error('❌ Faltan valores en .r2.env:', missing.join(', '))
  console.error('   Abre el archivo .r2.env y completa las lineas que dicen PEGA_AQUI.')
  process.exit(1)
}

const endpoint = R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

const key = `pruebas/hola-r2-${Date.now()}.txt`
const contenido = `Prueba de Cloudflare R2 para cobrify - ${new Date().toISOString()}`

async function main() {
  // --- 3. Subir ---
  console.log('1) Subiendo archivo de prueba al bucket "%s"...', R2_BUCKET)
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: contenido,
      ContentType: 'text/plain; charset=utf-8',
    })
  )
  console.log('   ✅ Subido:', key)

  // --- 4. Verificar que se sirve por la URL publica ---
  const publicUrl = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
  console.log('2) Verificando que se ve por la URL publica...')
  console.log('   URL:', publicUrl)

  let ok = false
  let lastStatus = null
  let recibido = ''
  for (let intento = 1; intento <= 5; intento++) {
    try {
      const res = await fetch(publicUrl)
      lastStatus = res.status
      if (res.ok) {
        recibido = await res.text()
        ok = true
        break
      }
    } catch (e) {
      lastStatus = 'error de red: ' + e.message
    }
    if (intento < 5) await new Promise((r) => setTimeout(r, 1500))
  }

  if (ok && recibido === contenido) {
    console.log('   ✅ Servido correctamente y el contenido coincide.')
  } else {
    console.error('   ❌ No se pudo ver el archivo por la URL publica.')
    console.error('   HTTP status:', lastStatus)
    if (recibido) console.error('   Contenido recibido (primeros 200):', JSON.stringify(recibido).slice(0, 200))
    console.error('\n   Posible causa: la "Public Development URL" del bucket no esta activada,')
    console.error('   o tarda unos segundos en propagar. Espera 1 min y vuelve a correr.')
    process.exit(1)
  }

  // --- 5. Limpieza: borrar el archivo de prueba ---
  console.log('3) Borrando el archivo de prueba (limpieza)...')
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    console.log('   ✅ Borrado.')
  } catch (e) {
    console.log('   ⚠️ No se pudo borrar (no es grave):', e.message)
  }

  console.log('\n✅✅ EXITO TOTAL: R2 funciona (subir + servir + borrar).')
  console.log('    Ya podemos avanzar a migrar imagenes de prueba.')
}

main().catch((e) => {
  // No imprimimos credenciales; solo el mensaje de error.
  console.error('\n❌ FALLO en la prueba de R2.')
  console.error('   Mensaje:', e?.message || e)
  if (e?.$metadata?.httpStatusCode) console.error('   HTTP status:', e.$metadata.httpStatusCode)
  console.error('\n   Si dice "InvalidAccessKeyId" o "SignatureDoesNotMatch":')
  console.error('   revisa que pegaste bien R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY en .r2.env.')
  process.exit(1)
})
