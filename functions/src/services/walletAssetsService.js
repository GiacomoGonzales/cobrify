import crypto from 'crypto'
import sharp from 'sharp'
import { getStorage } from 'firebase-admin/storage'

/**
 * IMÁGENES DE LA TARJETA DE SELLOS — 15-ago-2026.
 *
 * EL PROBLEMA QUE RESUELVE: Google Wallet dibuja el `programLogo` dentro de un
 * CÍRCULO. Un logo horizontal —que es lo que tiene casi todo comercio, porque
 * es lo que le hizo el diseñador para el membrete— entra aplastado y se ve mal.
 *
 * La salida fácil era exigirle al comercio un logo cuadrado. No sirve: la
 * mayoría no lo tiene, no sabe hacerlo, y terminaría con la tarjeta fea o sin
 * subir nada. Así que el cuadrado lo genera el servidor: encaja el logo con
 * relleno blanco SIN deformarlo.
 *
 * Y el logo ancho no se desperdicia — se usa como `heroImage`, la franja de
 * portada, que es justo donde una imagen apaisada luce bien.
 */

// 660px es lo que recomienda Google para el logo; de ahí para arriba solo pesa.
const LADO = 660
const RUTA = (businessId) => `businesses/${businessId}/wallet/logo-square.png`

/** Si el logo ya es casi cuadrado, no se toca: reprocesarlo solo perdería nitidez. */
const TOLERANCIA_CUADRADO = 0.15

const huella = (texto) => crypto.createHash('sha1').update(String(texto)).digest('hex').slice(0, 16)

const urlDescarga = (bucket, ruta, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(ruta)}?alt=media&token=${token}`

/**
 * Devuelve una URL de logo CUADRADO listo para el círculo de Wallet.
 *
 * @returns {Promise<string|null>} URL, o null si el logo no se pudo bajar
 *          (el llamador cae al logo genérico — la clase no admite quedarse sin).
 */
export async function logoCuadradoDe(businessId, logoUrl) {
  if (!logoUrl) return null

  const bucket = getStorage().bucket()
  const ruta = RUTA(businessId)
  const archivo = bucket.file(ruta)
  const origen = huella(logoUrl)

  // ¿Ya lo generamos para ESTE mismo logo? Se compara la huella del origen: si
  // el comercio cambia su logo, la huella cambia y se regenera solo.
  try {
    const [meta] = await archivo.getMetadata()
    const guardado = meta.metadata || {}
    if (guardado.origen === origen && guardado.firebaseStorageDownloadTokens) {
      return urlDescarga(bucket.name, ruta, guardado.firebaseStorageDownloadTokens.split(',')[0])
    }
  } catch (error) {
    // 404 = todavía no existe, hay que generarlo. Cualquier otra cosa sí es un
    // problema de verdad y no conviene tragárselo.
    if (error.code !== 404) throw error
  }

  let original
  try {
    const res = await fetch(logoUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    original = Buffer.from(await res.arrayBuffer())
  } catch (error) {
    console.warn(`[Wallet] No se pudo bajar el logo de ${businessId}:`, error.message)
    return null
  }

  try {
    const { width, height } = await sharp(original).metadata()
    if (width && height) {
      const desvio = Math.abs(width - height) / Math.max(width, height)
      if (desvio <= TOLERANCIA_CUADRADO) return logoUrl // ya es cuadrado: se usa tal cual
    }

    const cuadrado = await sharp(original)
      // 'contain' encaja la imagen COMPLETA y rellena; 'cover' recortaría, y
      // recortar un logo horizontal le come el nombre del negocio.
      .resize(LADO, LADO, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: '#ffffff' }) // sin esto, un PNG transparente sale negro
      .png()
      .toBuffer()

    const token = crypto.randomUUID()
    await archivo.save(cuadrado, {
      resumable: false,
      metadata: {
        contentType: 'image/png',
        cacheControl: 'public,max-age=31536000',
        metadata: { firebaseStorageDownloadTokens: token, origen },
      },
    })
    console.log(`[Wallet] Logo cuadrado generado para ${businessId} (${width}x${height} -> ${LADO}x${LADO})`)
    return urlDescarga(bucket.name, ruta, token)
  } catch (error) {
    console.warn(`[Wallet] No se pudo cuadrar el logo de ${businessId}:`, error.message)
    return null
  }
}

/**
 * Imagen de portada (la franja ancha de arriba). Se usa el logo ORIGINAL solo
 * si es claramente apaisado: uno cuadrado estirado a lo ancho se vería peor que
 * no poner nada.
 */
export async function portadaDe(logoUrl) {
  if (!logoUrl) return null
  try {
    const res = await fetch(logoUrl)
    if (!res.ok) return null
    const { width, height } = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    if (!width || !height) return null
    return (width / height) >= 1.8 ? logoUrl : null
  } catch {
    return null
  }
}
