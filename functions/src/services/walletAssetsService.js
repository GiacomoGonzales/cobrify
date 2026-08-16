import crypto from 'crypto'
import sharp from 'sharp'
import { getStorage } from 'firebase-admin/storage'

/**
 * IMÁGENES DE LA TARJETA DE SELLOS — 15-ago-2026.
 *
 * Dos piezas, ambas generadas por el servidor (el comercio no sube nada):
 *
 *  1. LOGO CUADRADO. Google Wallet dibuja el `programLogo` en un CÍRCULO; un
 *     logo horizontal entra aplastado. El cuadrado se genera acá: se encaja
 *     el logo con relleno blanco sin deformarlo.
 *
 *  2. CUADRÍCULA DE SELLOS. La portada (heroImage) de cada tarjeta es la
 *     cartulina dibujada: casilleros llenos con check, vacíos punteados y el
 *     último con el regalo. Es POR TARJETA (comprobado: el objeto acepta su
 *     propio heroImage y pisa el de la clase) y se redibuja en cada sello.
 *     Cuando la portada es la cuadrícula, el contador de la tarjeta pasa a
 *     número ("7 de 10"): la cuadrícula ES el marcador, no una decoración.
 *
 * Hubo una tercera pieza —portadas con patrones de iconos por rubro— que se
 * ELIMINÓ a pedido del dueño: a la opacidad que exige un fondo se veían como
 * manchas, no como diseño. La portada ahora es cuadrícula, logo o color plano.
 */

// 660px es lo que recomienda Google para el logo; de ahí para arriba solo pesa.
const LADO = 660
const RUTA = (businessId) => `businesses/${businessId}/wallet/logo-square.png`

/** Si el logo ya es casi cuadrado, no se toca: reprocesarlo solo perdería nitidez. */
const TOLERANCIA_CUADRADO = 0.15

// Medida que recomienda Google para heroImage.
const PORTADA_W = 1032
const PORTADA_H = 336

const huella = (texto) => crypto.createHash('sha1').update(String(texto)).digest('hex').slice(0, 16)

const urlDescarga = (bucket, ruta, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(ruta)}?alt=media&token=${token}`

/** Luminancia percibida: decide si el dibujo va en blanco o en oscuro. */
const esClaro = (hex) => {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return false
  return (0.299 * parseInt(h.slice(0, 2), 16)
    + 0.587 * parseInt(h.slice(2, 4), 16)
    + 0.114 * parseInt(h.slice(4, 6), 16)) > 160
}

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
// CUADRÍCULA DE SELLOS
//
// DETALLE QUE IMPORTA: Google cachea las imágenes por URL, así que cada
// cantidad de sellos es un ARCHIVO distinto (grid-{tel}-{n}.png). Reusar la
// misma URL dejaría la tarjeta mostrando la cuadrícula vieja quién sabe hasta
// cuándo. El archivo del conteo anterior se borra al pasar al siguiente.
// ============================================================================

/**
 * Iconos de sello para los casilleros llenos (caja de 64x64, solo trazo).
 * ESPEJO de SELLOS_TARJETA en src/data/walletThemes.js — el front guarda y
 * manda solo el ID (nunca el trazo), para que un documento de Firestore jamás
 * inyecte SVG arbitrario acá. Si se toca un icono, se toca en los dos lados.
 */
const SELLOS = {
  check: { grosor: 5, trazo: '<path d="M19 33 l9 9 L45 23"/>' },
  estrella: { grosor: 3.2, trazo: '<path d="M32 13 l6.2 12.6 13.8 2 -10 9.8 2.4 13.8 -12.4 -6.5 -12.4 6.5 2.4 -13.8 -10 -9.8 13.8 -2 Z"/>' },
  corazon: { grosor: 3.2, trazo: '<path d="M32 49 C10 34 15 13 32 23 C49 13 54 34 32 49 Z"/>' },
  taza: { grosor: 3.2, trazo: '<path d="M16 26 h24 v10 a12 12 0 0 1 -24 0 z"/><path d="M40 28 h5 a6 6 0 0 1 0 12 h-4"/><path d="M23 12 q3 4 0 9 M31 12 q3 4 0 9"/>' },
  pizza: { grosor: 3.2, trazo: '<path d="M14 18 L50 18 L32 52 Z"/><circle cx="27" cy="26" r="3"/><circle cx="38" cy="25" r="3"/><circle cx="32" cy="35" r="3"/>' },
  hamburguesa: { grosor: 3.2, trazo: '<path d="M15 27 a17 13 0 0 1 34 0 v1 H15 Z"/><path d="M14 34 h36"/><path d="M16 40 h32 v3 a5 5 0 0 1 -5 5 H21 a5 5 0 0 1 -5 -5 Z"/>' },
  huella: { grosor: 3.2, trazo: '<ellipse cx="32" cy="41" rx="10" ry="8"/><circle cx="18" cy="29" r="4.5"/><circle cx="27" cy="21" r="4.5"/><circle cx="37" cy="21" r="4.5"/><circle cx="46" cy="29" r="4.5"/>' },
  tijeras: { grosor: 3.2, trazo: '<circle cx="20" cy="42" r="6"/><circle cx="20" cy="22" r="6"/><path d="M25 25 L48 44 M25 39 L48 20"/>' },
  cruz: { grosor: 3.2, trazo: '<path d="M26 14 h12 v12 h12 v12 H38 v12 H26 V38 H14 V26 h12 Z"/>' },
  polo: { grosor: 3, trazo: '<path d="M24 13 l-11 8 5 8 5 -3 v26 h18 V26 l5 3 5 -8 -11 -8 a8 5 0 0 1 -16 0 z"/>' },
}

// Cambia cuando cambia el DIBUJO sin cambiar los datos (grosores, estilo de
// celda): fuerza URL nueva, porque Google cachea las imágenes por URL.
const VERSION_DIBUJO = 'v2'

// regalo para el casillero del premio
const ICONO_REGALO = '<rect x="14" y="28" width="36" height="22" rx="4"/><rect x="11" y="18" width="42" height="10" rx="3"/><path d="M32 18 v32 M32 18 q-5 -10 -12 -6 q-4 5 12 6 M32 18 q5 -10 12 -6 q4 5 -12 6"/>'

/**
 * El SVG de la cuadrícula. Exportado aparte para poder previsualizarlo sin
 * Storage; el front dibuja su vista previa con esta MISMA geometría (espejo
 * en src/data/walletThemes.js).
 *
 * Sobrio a propósito: fondo del MISMO color de la tarjeta (la portada se
 * funde con el cuerpo, sin costura), casilleros llenos en blanco con el check
 * del color de fondo, vacíos con línea punteada suave. Nada más.
 */
export function svgDeCuadricula({ color = '#1e3a8a', sellos = 0, meta = 10, sello = 'check' } = {}) {
  const tinta = esClaro(color) ? '#1f2937' : '#ffffff'
  const icono = SELLOS[sello] || SELLOS.check
  const m = Math.max(1, meta)
  const s = Math.max(0, sellos)
  const filas = m <= 5 ? 1 : 2
  const cols = Math.ceil(m / filas)
  const gap = 26
  // La celda se achica sola con metas altas para que la fila siempre entre.
  const lado = Math.min(108,
    Math.floor((PORTADA_W - 160 - (cols - 1) * gap) / cols),
    Math.floor((PORTADA_H - 100 - (filas - 1) * gap) / filas))
  const radio = Math.round(lado * 0.22)
  const gh = filas * lado + (filas - 1) * gap
  const y0 = (PORTADA_H - gh) / 2
  // Con el casillero ya sin relleno, la figura es la protagonista: un poco
  // más grande que antes.
  const esc = (lado / 64) * 0.66
  const off = (lado - 64 * esc) / 2

  let celdas = ''
  for (let f = 0; f < filas; f++) {
    const enFila = f === filas - 1 ? m - cols * f : cols
    const gw = enFila * lado + (enFila - 1) * gap
    const x0 = (PORTADA_W - gw) / 2 // cada fila centrada (la última puede ser más corta)
    for (let c = 0; c < enFila; c++) {
      const i = f * cols + c
      const x = x0 + c * (lado + gap)
      const y = y0 + f * (lado + gap)
      if (i < s) {
        // Lleno = contorno sólido y la figura al centro, SIN rellenar el
        // casillero: el bloque macizo le quitaba ligereza a la tarjeta
        // (pedido expreso del dueño). Lo lleno se distingue de lo vacío por
        // trazo continuo + opacidad plena contra punteado tenue.
        celdas += `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${radio}" fill="none" stroke="${tinta}" stroke-width="3"/>`
        celdas += `<g transform="translate(${x + off} ${y + off}) scale(${esc.toFixed(3)})" fill="none" stroke="${tinta}" stroke-width="${icono.grosor}" stroke-linecap="round" stroke-linejoin="round">${icono.trazo}</g>`
      } else {
        // Relleno apenas visible + punteado suave: presencia sin ruido.
        celdas += `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${radio}" fill="${tinta}" fill-opacity="0.07"/>`
        celdas += `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${radio}" fill="none" stroke="${tinta}" stroke-opacity="0.5" stroke-width="2.5" stroke-dasharray="8 7"/>`
        if (i === m - 1) {
          celdas += `<g transform="translate(${x + off} ${y + off}) scale(${esc.toFixed(3)})" fill="none" stroke="${tinta}" stroke-opacity="0.6" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${ICONO_REGALO}</g>`
        }
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTADA_W}" height="${PORTADA_H}" viewBox="0 0 ${PORTADA_W} ${PORTADA_H}"><rect width="100%" height="100%" fill="${color}"/>${celdas}</svg>`
}

/**
 * Cuadrícula de un cliente, subida a Storage. Devuelve la URL (o null si algo
 * falla — la tarjeta sale sin portada propia y muestra la de la clase).
 */
export async function cuadriculaDeSellos(businessId, { phone, color, sellos = 0, meta = 10, sello = 'check', sellosAntes = null }) {
  try {
    const bucket = getStorage().bucket()
    const tel = String(phone || '').replace(/[^A-Za-z0-9._-]/g, '')
    // El nombre lleva la huella del DISEÑO (color, meta, icono): cambiar el
    // sello o el color con el mismo conteo también debe ser una URL nueva —
    // Google cachea por URL y con la misma serviría la imagen vieja.
    const diseno = huella(`${color}|${meta}|${sello}|${VERSION_DIBUJO}`).slice(0, 8)
    const ruta = `businesses/${businessId}/wallet/grid-${tel}-${sellos}-${diseno}.png`
    const archivo = bucket.file(ruta)

    try {
      const [meta2] = await archivo.getMetadata()
      const guardado = meta2.metadata || {}
      if (guardado.firebaseStorageDownloadTokens) {
        return urlDescarga(bucket.name, ruta, guardado.firebaseStorageDownloadTokens.split(',')[0])
      }
    } catch (error) {
      if (error.code !== 404) throw error
    }

    const png = await sharp(Buffer.from(svgDeCuadricula({ color, sellos, meta, sello }))).png().toBuffer()
    const token = crypto.randomUUID()
    await archivo.save(png, {
      resumable: false,
      metadata: {
        contentType: 'image/png',
        cacheControl: 'public,max-age=31536000',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    })

    // Limpieza de la cuadrícula del conteo anterior CON este mismo diseño,
    // mejor-esfuerzo: si falla (o si el diseño cambió y el nombre viejo no
    // coincide) solo queda un PNG huérfano de 10KB. No vale más que esto.
    if (sellosAntes !== null && sellosAntes !== sellos) {
      bucket.file(`businesses/${businessId}/wallet/grid-${tel}-${sellosAntes}-${diseno}.png`)
        .delete().catch(() => {})
    }
    return urlDescarga(bucket.name, ruta, token)
  } catch (error) {
    console.warn(`[Wallet] No se pudo dibujar la cuadrícula de ${businessId}/${phone}:`, error.message)
    return null
  }
}

/**
 * Portada de logo (la franja ancha de arriba). Se usa el logo ORIGINAL solo
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
