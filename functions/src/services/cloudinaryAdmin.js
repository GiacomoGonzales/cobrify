import axios from 'axios'
import crypto from 'crypto'

/**
 * Cliente para la Admin/Upload API de Cloudinary, usado por la migración
 * de imágenes ya almacenadas (PNG/JPG → WebP) para liberar storage.
 *
 * Requiere CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (Secret Manager).
 */

const CLOUD_NAME = 'dnrj1guvs'
const UPLOAD_PRESET = 'cobrify_unsigned' // ya tiene incoming transformation configurada

const ADMIN_BASE = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`

const REGEX_CLOUDINARY = /^https?:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(?:(v\d+)\/)?(.+)$/

/**
 * Devuelve true si la URL apunta al cloud de Cloudinary que estamos manejando.
 */
export function isCloudinaryUrl(url) {
  if (!url || typeof url !== 'string') return false
  const m = url.match(REGEX_CLOUDINARY)
  if (!m) return false
  return m[1] === CLOUD_NAME
}

/**
 * Extrae el public_id (con folder, sin versión y sin extensión) de una URL.
 * Ej: https://res.cloudinary.com/dnrj1guvs/image/upload/v123/cobrify/abc.png
 *  →  { publicId: "cobrify/abc", extension: "png" }
 */
export function parseCloudinaryUrl(url) {
  const m = url?.match?.(REGEX_CLOUDINARY)
  if (!m) return null
  const tail = m[3] // "cobrify/abc.png" o "abc.png"
  const dot = tail.lastIndexOf('.')
  if (dot < 0) return { publicId: tail, extension: '' }
  return {
    publicId: tail.slice(0, dot),
    extension: tail.slice(dot + 1).toLowerCase(),
  }
}

/**
 * Heurística: ¿la URL está ya en formato comprimido moderno?
 * - Si la extensión es webp o avif → asumimos optimizada, skip.
 * - Si no tiene extensión → la tratamos como candidate por las dudas.
 */
export function isAlreadyOptimized(url) {
  const parsed = parseCloudinaryUrl(url)
  if (!parsed) return true // no es de nuestro cloud, no la tocamos
  return parsed.extension === 'webp' || parsed.extension === 'avif'
}

function getAuth() {
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error('CLOUDINARY_API_KEY/SECRET no configurados en Cloud Functions')
  }
  return { apiKey, apiSecret }
}

/**
 * Obtiene metadata del asset (incluye `bytes` actual en storage).
 * Devuelve null si no existe.
 */
export async function getResourceMetadata(publicId) {
  const { apiKey, apiSecret } = getAuth()
  try {
    const response = await axios.get(
      `${ADMIN_BASE}/resources/image/upload/${encodeURIComponent(publicId)}`,
      {
        auth: { username: apiKey, password: apiSecret },
        timeout: 20000,
      }
    )
    return response.data
  } catch (err) {
    if (err.response?.status === 404) return null
    throw err
  }
}

/**
 * Sube una imagen a Cloudinary usando una URL como fuente. El upload preset
 * `cobrify_unsigned` aplica la incoming transformation (q_auto:eco,f_auto,
 * c_limit,w_1600), por lo que el asset resultante queda como WebP/AVIF
 * optimizado.
 */
export async function reuploadFromUrl(sourceUrl) {
  const form = new URLSearchParams()
  form.append('file', sourceUrl)
  form.append('upload_preset', UPLOAD_PRESET)

  const response = await axios.post(
    `${ADMIN_BASE}/image/upload`,
    form.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 60000,
    }
  )
  return {
    secureUrl: response.data.secure_url,
    publicId: response.data.public_id,
    bytes: response.data.bytes,
    format: response.data.format,
  }
}

/**
 * Lista assets de un folder (paginado). Útil para cleanup.
 * Devuelve { resources: [{ public_id, format, bytes, ... }], next_cursor }
 */
export async function listResources({ prefix = 'cobrify/', maxResults = 500, nextCursor = null } = {}) {
  const { apiKey, apiSecret } = getAuth()
  const params = {
    type: 'upload',
    prefix,
    max_results: maxResults,
  }
  if (nextCursor) params.next_cursor = nextCursor
  const response = await axios.get(
    `${ADMIN_BASE}/resources/image`,
    {
      params,
      auth: { username: apiKey, password: apiSecret },
      timeout: 30000,
    }
  )
  return response.data
}

/**
 * Elimina varios assets por public_id en una sola llamada (max 100 por request).
 */
export async function deleteResources(publicIds) {
  const { apiKey, apiSecret } = getAuth()
  if (!publicIds.length) return { deleted: {} }
  const form = new URLSearchParams()
  for (const id of publicIds) form.append('public_ids[]', id)
  const response = await axios.delete(
    `${ADMIN_BASE}/resources/image/upload`,
    {
      data: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: apiKey, password: apiSecret },
      timeout: 30000,
    }
  )
  return response.data
}

/**
 * Elimina un asset por public_id usando la Admin API.
 * Auth: HTTP Basic con API_KEY:API_SECRET.
 */
export async function deleteResource(publicId) {
  const { apiKey, apiSecret } = getAuth()
  const response = await axios.delete(
    `${ADMIN_BASE}/resources/image/upload`,
    {
      params: { 'public_ids[]': publicId },
      auth: { username: apiKey, password: apiSecret },
      timeout: 20000,
    }
  )
  return response.data
}

/**
 * Re-uploadea una URL de Cloudinary aplicando la incoming transformation
 * del preset (q_auto:eco,f_auto,c_limit,w_1600).
 *
 * NO borra el original — eso lo decide el caller después de confirmar
 * que la actualización en Firestore fue exitosa, para evitar imágenes
 * rotas si la escritura falla.
 *
 * Devuelve { newUrl, oldPublicId, oldBytes, newBytes, freed }
 * Si dryRun=true, solo lee metadata y no toca nada.
 */
export async function migrateOneUrl(oldUrl, { dryRun = false } = {}) {
  const parsed = parseCloudinaryUrl(oldUrl)
  if (!parsed) throw new Error('URL no válida de Cloudinary')

  if (dryRun) {
    const meta = await getResourceMetadata(parsed.publicId)
    return {
      newUrl: oldUrl,
      oldPublicId: parsed.publicId,
      oldBytes: meta?.bytes || 0,
      newBytes: 0,
      freed: 0,
      dryRun: true,
    }
  }

  const meta = await getResourceMetadata(parsed.publicId)
  const oldBytes = meta?.bytes || 0

  const uploaded = await reuploadFromUrl(oldUrl)
  const newBytes = uploaded.bytes || 0

  return {
    newUrl: uploaded.secureUrl,
    oldPublicId: parsed.publicId,
    newPublicId: uploaded.publicId,
    oldBytes,
    newBytes,
    freed: Math.max(0, oldBytes - newBytes),
    dryRun: false,
  }
}
