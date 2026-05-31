import axios from 'axios'
import { parseCloudinaryUrl, isCloudinaryUrl } from './cloudinaryAdmin.js'

// El SDK de AWS (@aws-sdk/client-s3) es pesado de importar. Si lo cargáramos en
// el top-level, el análisis de despliegue de Cloud Functions (que ejecuta los
// imports de index.js para descubrir las funciones) se pasa de los 10s de
// presupuesto y el deploy falla con "Cannot determine backend specification".
// Por eso lo cargamos LAZY: recién cuando se ejecuta una copia a R2.
let _s3mod = null
async function getS3() {
  if (!_s3mod) _s3mod = await import('@aws-sdk/client-s3')
  return _s3mod
}

/**
 * Cliente para Cloudflare R2 (S3-compatible), usado por la migración
 * de imágenes Cloudinary → R2 (egress $0).
 *
 * Config NO secreta (hardcodeada): el account id ya va dentro del endpoint,
 * el nombre del bucket no es secreto, y la URL pública es… pública.
 *
 * CREDENCIALES (sí secretas) vienen de Secret Manager vía process.env:
 *   - R2_ACCESS_KEY_ID
 *   - R2_SECRET_ACCESS_KEY
 */

const R2_ACCOUNT_ID = '339aceed96a9738b435dd2d296f0ed51'
const R2_BUCKET = 'cobrify-media'
// Dominio propio (producción), servido por Cloudflare desde el bucket R2.
// Si algún día cambia el dominio, se cambia acá (y se redepliega la función).
const R2_PUBLIC_URL = 'https://media.cobrifymedia.site'
// URL vieja r2.dev (rate-limited, NO apta para producción): la dejamos
// RECONOCIDA para que las imágenes del piloto ya copiadas a r2.dev sigan
// contando como "ya en R2" y la migración no las vuelva a tocar (idempotencia).
const R2_LEGACY_PUBLIC_URL = 'https://pub-5f82c9900b1941f6b4e0f6ba95d60f51.r2.dev'
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

let _client = null
async function getClient() {
  if (_client) return _client
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY no configurados en Cloud Functions')
  }
  const { S3Client } = await getS3()
  _client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId, secretAccessKey },
  })
  return _client
}

/**
 * Construye la URL pública de R2 para una key.
 */
export function getR2PublicUrl(key) {
  return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
}

/**
 * Devuelve true si la URL ya apunta a nuestro bucket público de R2.
 * Sirve para que la migración sea idempotente (no recopiar lo ya migrado).
 */
export function isR2Url(url) {
  if (!url || typeof url !== 'string') return false
  return url.startsWith(R2_PUBLIC_URL) || url.startsWith(R2_LEGACY_PUBLIC_URL)
}

/**
 * Deriva la "ruta" (key) en R2 a partir de una URL de Cloudinary,
 * conservando el public_id (con carpeta) y la extensión original.
 * Ej: .../upload/v123/cobrify/abc.jpg  ->  cobrify/abc.jpg
 */
export function cloudinaryUrlToR2Key(url) {
  const parsed = parseCloudinaryUrl(url)
  if (!parsed) return null
  return parsed.extension ? `${parsed.publicId}.${parsed.extension}` : parsed.publicId
}

/**
 * ¿La URL apunta a Firebase Storage? (imágenes subidas por la app a Storage).
 * Dos formatos posibles:
 *   A) https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<rutaEncodeada>?alt=media&token=...
 *   B) https://storage.googleapis.com/<bucket>/<ruta>
 */
export function isFirebaseStorageUrl(url) {
  if (!url || typeof url !== 'string') return false
  return (
    /^https?:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\//.test(url) ||
    /^https?:\/\/storage\.googleapis\.com\/[^/]+\//.test(url)
  )
}

/**
 * Deriva la key en R2 a partir de una URL de Firebase Storage. Conserva la
 * ruta original (decodeada) y la namespacea bajo "fbstorage/" para que NUNCA
 * colisione con las keys de Cloudinary.
 * Ej: .../o/cobrify%2Fprod%2Fabc.jpg?alt=media...  ->  fbstorage/cobrify/prod/abc.jpg
 */
export function firebaseStorageUrlToR2Key(url) {
  if (!url || typeof url !== 'string') return null
  let m = url.match(/^https?:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/)
  if (!m) m = url.match(/^https?:\/\/storage\.googleapis\.com\/[^/]+\/([^?]+)/)
  if (!m) return null
  let path
  try {
    path = decodeURIComponent(m[1])
  } catch {
    path = m[1]
  }
  path = path.replace(/^\/+/, '') // sin "/" inicial
  return `fbstorage/${path}`
}

/**
 * Deriva la key en R2 a partir de CUALQUIER URL soportada (Cloudinary o
 * Firebase Storage). Devuelve null si el origen no está soportado.
 */
export function urlToR2Key(url) {
  if (isCloudinaryUrl(url)) return cloudinaryUrlToR2Key(url)
  if (isFirebaseStorageUrl(url)) return firebaseStorageUrlToR2Key(url)
  return null
}

/**
 * Sube un buffer a R2 con la key dada y devuelve la URL pública.
 * Reutilizado por: (a) la migración (copia fiel de imágenes viejas) y
 * (b) la subida directa de imágenes NUEVAS (egress $0 desde el día uno).
 */
export async function putObjectToR2({ key, body, contentType }) {
  const { PutObjectCommand } = await getS3()
  const client = await getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )
  return {
    url: getR2PublicUrl(key),
    key,
    bytes: body.length,
    contentType: contentType || 'application/octet-stream',
  }
}

/**
 * Copia FIEL (sin transformar) una imagen (Cloudinary o Firebase Storage) a R2,
 * conservando la misma ruta y extensión. Descarga el asset EXACTO que sirve el
 * origen hoy (solo bandwidth: NO consume cuota de transformaciones ni rate limit)
 * y lo sube a R2 con cache largo e inmutable.
 *
 * NO toca Firestore. NO borra del origen (el original queda como respaldo).
 *
 * Idempotente: reescribir la misma key sobreescribe con el mismo contenido.
 *
 * Devuelve { newUrl, key, bytes, contentType }.
 */
export async function migrateUrlToR2(sourceUrl) {
  const key = urlToR2Key(sourceUrl)
  if (!key) throw new Error('URL no soportada (ni Cloudinary ni Firebase Storage): ' + sourceUrl)

  // 1) Descargar el asset tal cual lo sirve el origen (Cloudinary o Firebase Storage).
  const resp = await axios.get(sourceUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
    maxContentLength: 50 * 1024 * 1024, // techo de 50 MB por imagen
    maxBodyLength: 50 * 1024 * 1024,
  })
  const body = Buffer.from(resp.data)
  const contentType = resp.headers['content-type'] || 'application/octet-stream'

  // 2) Subir a R2 con la misma key (reutiliza el helper compartido).
  await putObjectToR2({ key, body, contentType })

  return {
    newUrl: getR2PublicUrl(key),
    key,
    bytes: body.length,
    contentType,
  }
}
