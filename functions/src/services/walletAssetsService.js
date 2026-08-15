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

// ============================================================================
// PORTADAS CON MOTIVO — 15-ago-2026
//
// El cuerpo de la tarjeta de Wallet solo admite un color plano (comprobado:
// el campo es un hex y nada más). Lo que sí admite diseño es la FRANJA DE
// PORTADA (heroImage) — y ahí es donde las tarjetas "bonitas" de otros
// comercios llevan lo suyo. Estas portadas se dibujan acá: un patrón de
// iconos del rubro en línea fina sobre el color del tema, con el logo del
// negocio compuesto al centro. El comercio no sube nada.
// ============================================================================

// Medida que recomienda Google para heroImage.
const PORTADA_W = 1032
const PORTADA_H = 336

/**
 * Iconos de cada motivo, dibujados a mano en una caja de 64x64, solo trazo.
 * Línea fina y opacidad baja: la portada es un FONDO, no una ilustración —
 * si compite con el logo, perdieron los dos.
 */
const MOTIVOS = {
  comida: [
    // taza con vapor
    '<path d="M16 26 h24 v10 a12 12 0 0 1 -24 0 z"/><path d="M40 28 h5 a6 6 0 0 1 0 12 h-4"/><path d="M23 12 q3 4 0 9 M31 12 q3 4 0 9"/>',
    // porción de pizza
    '<path d="M14 18 L50 18 L32 52 Z"/><circle cx="27" cy="26" r="3"/><circle cx="38" cy="25" r="3"/><circle cx="32" cy="35" r="3"/>',
    // tenedor y cuchillo
    '<path d="M20 12 v14 M26 12 v14 M23 26 v26 M20 26 a3 4 0 0 0 6 0"/><path d="M42 12 v40 M42 12 q9 12 1 22"/>',
  ],
  moda: [
    // gancho de ropa
    '<path d="M32 17 a5 5 0 1 1 5 -5 q0 3 -5 5 l0 4"/><path d="M32 21 L54 42 H10 Z"/>',
    // polo
    '<path d="M24 13 l-11 8 5 8 5 -3 v26 h18 V26 l5 3 5 -8 -11 -8 a8 5 0 0 1 -16 0 z"/>',
    // etiqueta de precio
    '<path d="M13 32 L33 12 h17 v17 L30 49 Z"/><circle cx="44" cy="18" r="3.5"/>',
  ],
  salud: [
    // cruz
    '<path d="M26 13 h12 v13 h13 v12 H38 v13 H26 V38 H13 V26 h13 Z"/>',
    // hoja
    '<path d="M16 48 Q14 16 48 15 Q50 46 16 48 Z"/><path d="M21 43 Q30 30 44 20"/>',
    // corazón
    '<path d="M32 49 C10 34 15 13 32 23 C49 13 54 34 32 49 Z"/>',
  ],
  puntos: [
    // anillo, punto y rombo: abstracto, sirve para cualquier rubro
    '<circle cx="32" cy="32" r="11"/>',
    '<circle cx="32" cy="32" r="4.5"/>',
    '<rect x="24" y="24" width="16" height="16" rx="2" transform="rotate(45 32 32)"/>',
  ],
}

export const MOTIVOS_VALIDOS = Object.keys(MOTIVOS)

/** Luminancia percibida: decide si el patrón va en blanco o en oscuro. */
const esClaro = (hex) => {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return false
  return (0.299 * parseInt(h.slice(0, 2), 16)
    + 0.587 * parseInt(h.slice(2, 4), 16)
    + 0.114 * parseInt(h.slice(4, 6), 16)) > 160
}

/**
 * El SVG de la portada: fondo del color del tema, patrón del motivo en grilla
 * a tresbolillo con rotaciones alternadas, y una sombra suave abajo para darle
 * profundidad. Exportado aparte para poder probarlo sin Storage.
 */
export function svgDePortada({ color = '#1e3a8a', motivo = 'puntos' } = {}) {
  const iconos = MOTIVOS[motivo] || MOTIVOS.puntos
  const tinta = esClaro(color) ? '#1f2937' : '#ffffff'

  const celdas = []
  const paso = 118
  let n = 0
  for (let fila = -1; fila * paso < PORTADA_H + paso; fila++) {
    const corrimiento = (fila % 2) ? paso / 2 : 0
    for (let col = -1; col * paso < PORTADA_W + paso; col++) {
      const x = col * paso + corrimiento
      const y = fila * paso
      const icono = iconos[n % iconos.length]
      const giro = (n % 2 ? -1 : 1) * (8 + (n % 3) * 4)
      const escala = 0.85 + ((n * 7) % 10) / 30
      celdas.push(
        `<g transform="translate(${x} ${y}) rotate(${giro} 32 32) scale(${escala.toFixed(2)})">${icono}</g>`
      )
      n++
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTADA_W}" height="${PORTADA_H}" viewBox="0 0 ${PORTADA_W} ${PORTADA_H}">
  <defs>
    <linearGradient id="sombra" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="${color}"/>
  <g fill="none" stroke="${tinta}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.16">
    ${celdas.join('\n    ')}
  </g>
  <rect width="100%" height="100%" fill="url(#sombra)"/>
</svg>`
}

/**
 * Compone la portada completa: patrón + logo del negocio al centro sobre una
 * pastilla blanca (el logo suele traer fondo blanco; la pastilla lo convierte
 * en decisión de diseño en vez de en un parche). Sin logo, va solo el patrón.
 * Exportada sin Storage para poder previsualizarla en local.
 */
export async function componerPortada({ color, motivo, logoBuffer }) {
  const fondo = await sharp(Buffer.from(svgDePortada({ color, motivo }))).png().toBuffer()
  if (!logoBuffer) return fondo

  const logo = await sharp(logoBuffer)
    .resize(360, 96, { fit: 'inside', withoutEnlargement: true })
    .png().toBuffer()
  const { width: lw = 360, height: lh = 96 } = await sharp(logo).metadata()

  const pw = lw + 56
  const ph = lh + 36
  const pastilla = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">
      <rect width="100%" height="100%" rx="${Math.min(26, ph / 2)}" fill="#ffffff" fill-opacity="0.97"/>
    </svg>`
  )).png().toBuffer()

  return sharp(fondo)
    .composite([
      { input: pastilla, gravity: 'centre' },
      { input: logo, gravity: 'centre' },
    ])
    .png().toBuffer()
}

/**
 * Portada con motivo, cacheada en Storage. La huella cubre color, motivo y
 * logo: cambiar el tema en la UI regenera la portada sola en el siguiente
 * sello. Devuelve null si algo falla (el llamador cae a la portada simple).
 */
export async function portadaConMotivo(businessId, { color, motivo, logoUrl }) {
  try {
    const bucket = getStorage().bucket()
    const ruta = `businesses/${businessId}/wallet/hero.png`
    const archivo = bucket.file(ruta)
    const origen = huella(`${color}|${motivo}|${logoUrl || ''}`)

    try {
      const [meta] = await archivo.getMetadata()
      const guardado = meta.metadata || {}
      if (guardado.origen === origen && guardado.firebaseStorageDownloadTokens) {
        return urlDescarga(bucket.name, ruta, guardado.firebaseStorageDownloadTokens.split(',')[0])
      }
    } catch (error) {
      if (error.code !== 404) throw error
    }

    let logoBuffer = null
    if (logoUrl) {
      try {
        const res = await fetch(logoUrl)
        if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer())
      } catch { /* sin logo: la portada va igual, solo con el patrón */ }
    }

    const png = await componerPortada({ color, motivo, logoBuffer })
    const token = crypto.randomUUID()
    await archivo.save(png, {
      resumable: false,
      metadata: {
        contentType: 'image/png',
        cacheControl: 'public,max-age=31536000',
        metadata: { firebaseStorageDownloadTokens: token, origen },
      },
    })
    console.log(`[Wallet] Portada generada para ${businessId} (motivo ${motivo})`)
    return urlDescarga(bucket.name, ruta, token)
  } catch (error) {
    console.warn(`[Wallet] No se pudo generar la portada de ${businessId}:`, error.message)
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
