import crypto from 'crypto'

/**
 * Helpers criptográficos para la integración Rappi Self-Onboarding:
 *   - PKCE (code_verifier / code_challenge) para OAuth2 del merchant
 *   - Verificación HMAC-SHA256 del header `Rappi-Signature` en webhooks
 *   - Cifrado AES-256-GCM de tokens persistidos en Firestore
 */

// ─── PKCE ────────────────────────────────────────────────────────────────

/**
 * Genera un code_verifier aleatorio (43-128 caracteres url-safe).
 * Spec: https://datatracker.ietf.org/doc/html/rfc7636#section-4.1
 */
export function generateCodeVerifier(length = 64) {
  const safeLen = Math.min(128, Math.max(43, length))
  return crypto.randomBytes(safeLen).toString('base64url').slice(0, safeLen)
}

/**
 * Calcula code_challenge = BASE64URL(SHA256(code_verifier))
 */
export function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Genera un state aleatorio (CSRF protection) para el flujo OAuth.
 */
export function generateState() {
  return crypto.randomBytes(32).toString('base64url')
}

// ─── HMAC (Rappi-Signature) ──────────────────────────────────────────────

/**
 * Parsea el header `Rappi-Signature` de la forma `t=<timestamp>,sign=<hash>`.
 * Devuelve `{ timestamp, signature }` o `null` si está malformado.
 */
export function parseRappiSignature(header) {
  if (!header || typeof header !== 'string') return null
  const parts = header.split(',')
  const out = {}
  for (const part of parts) {
    const [k, v] = part.split('=')
    if (k && v) out[k.trim()] = v.trim()
  }
  if (!out.t || !out.sign) return null
  return { timestamp: out.t, signature: out.sign }
}

/**
 * Verifica la firma HMAC-SHA256 del webhook contra el `rawBody` recibido.
 * Spec: signed_payload = `${timestamp}.${rawBody}` → HMAC-SHA256 con secret compartido.
 * Devuelve true si coincide.
 */
export function verifyRappiSignature({ rawBody, header, secret, toleranceSeconds = 300 }) {
  const parsed = parseRappiSignature(header)
  if (!parsed) return false
  const { timestamp, signature } = parsed

  // Anti-replay: rechazar timestamps muy antiguos (5 min por defecto)
  const tsNum = Number(timestamp)
  if (Number.isFinite(tsNum) && toleranceSeconds > 0) {
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - tsNum) > toleranceSeconds) return false
  }

  const payload = `${timestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  // timing-safe compare
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(signature, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ─── Cifrado de tokens (AES-256-GCM) ─────────────────────────────────────

/**
 * Cifra `plaintext` con AES-256-GCM usando una clave hexadecimal de 32 bytes.
 * Devuelve un string compacto: `<iv>:<tag>:<ciphertext>` en base64url.
 */
export function encryptToken(plaintext, hexKey) {
  if (!plaintext) return ''
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('RAPPI_TOKEN_ENCRYPTION_KEY debe ser 32 bytes en hex (64 chars)')
  }
  const key = Buffer.from(hexKey, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    enc.toString('base64url'),
  ].join(':')
}

/**
 * Descifra el formato producido por `encryptToken`.
 */
export function decryptToken(ciphertext, hexKey) {
  if (!ciphertext) return ''
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('RAPPI_TOKEN_ENCRYPTION_KEY debe ser 32 bytes en hex (64 chars)')
  }
  const [ivB64, tagB64, dataB64] = ciphertext.split(':')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de token cifrado inválido')
  }
  const key = Buffer.from(hexKey, 'hex')
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const data = Buffer.from(dataB64, 'base64url')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
