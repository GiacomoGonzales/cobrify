/**
 * Apple Wallet: genera la tarjeta de fidelización (.pkpass) de un cliente.
 *
 * Espejo de googleWalletService, con una diferencia de fondo: Google guarda la
 * tarjeta en SUS servidores (upsert de clase + objeto y un link JWT), mientras
 * que Apple no guarda nada — el .pkpass ES la tarjeta: un zip firmado que el
 * iPhone valida contra el certificado del Pass Type ID. Por eso aquí no hay
 * upserts: se construye el paquete completo en cada descarga, con los sellos
 * del momento. Re-agregar la tarjeta (mismo serialNumber) REEMPLAZA a la
 * anterior en el Wallet: así se "actualiza" sin el web service de PassKit.
 *
 * Secretos (Secret Manager): APPLE_PASS_CERT y APPLE_PASS_KEY, ambos en PEM.
 * El intermedio WWDR G4 de Apple es público y va empaquetado en src/assets.
 */
import { readFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import http2 from 'node:http2'
import forge from 'node-forge'
import JSZip from 'jszip'
import sharp from 'sharp'
import { svgDeCuadricula } from './walletAssetsService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WWDR_PEM = readFileSync(path.join(__dirname, '../assets/wwdr-g4.pem'), 'utf8')

const PASS_TYPE_ID = 'pass.com.cobrify.loyalty'
const TEAM_ID = 'WAUWHRT3D6'
// El "web service" de PassKit: el iPhone se registra aquí al añadir la
// tarjeta, y aquí vuelve a pedir la versión nueva cuando le llega un push.
const WEB_SERVICE_URL = 'https://us-central1-cobrify-395fe.cloudfunctions.net/appleWalletPassWeb'

/** Serial estable de una tarjeta. El teléfono va al final y es solo dígitos. */
export const serialDe = (businessId, phone) => `${businessId}-${phone}`

/** Deshace serialDe. El uid puede traer guiones; el teléfono nunca. */
export function parsearSerial(serial) {
  const corte = String(serial || '').lastIndexOf('-')
  if (corte <= 0) return null
  return { businessId: serial.slice(0, corte), phone: serial.slice(corte + 1) }
}

/**
 * Token de autenticación del pase (lo exige PassKit, mínimo 16 chars). Es un
 * HMAC del serial con la llave privada del certificado como secreto: no hay
 * nada que guardar ni rotar por tarjeta, y solo el servidor puede derivarlo.
 */
export function tokenDeAutenticacion(serial) {
  const secreto = process.env.APPLE_PASS_KEY
  if (!secreto) throw new Error('Falta el secreto APPLE_PASS_KEY')
  // trim(): el PEM con o sin salto de línea final debe derivar el MISMO token
  // (Secret Manager conserva el byte final; una shell con $(cat) lo recorta).
  return createHmac('sha256', secreto.trim()).update(`pass-auth:${serial}`).digest('hex')
}

/** '#1e3a8a' -> 'rgb(30,58,138)'. Apple no acepta hex en pass.json. */
function rgbDe(hex) {
  const h = String(hex || '#1e3a8a').replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0')
  return `rgb(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)})`
}

/** Mismo criterio que esClaro() en walletAssetsService: luminancia percibida. */
function fondoEsClaro(hex) {
  const h = String(hex || '').replace('#', '').padEnd(6, '0')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 186
}

/** Baja el logo del comercio y lo vuelve icono cuadrado del tamaño pedido. */
async function iconoDesdeLogo(logoUrl, lado, colorFondo) {
  const liso = () =>
    sharp({ create: { width: lado, height: lado, channels: 4, background: colorFondo } }).png().toBuffer()
  if (!logoUrl) return liso()
  try {
    const res = await fetch(logoUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(lado, lado, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer()
  } catch {
    return liso()
  }
}

/**
 * La esquina superior izquierda de la tarjeta como IMAGEN (logo.png): el logo
 * del comercio (redondeado) + su nombre al lado. Va como imagen y no como
 * logoText porque el texto comparte fila con el contador de sellos y con
 * nombres largos se encimaban (visto en la tarjeta de prueba en iPhone).
 */
async function logoConNombre(nombre, tinta, escala, logoUrl) {
  const W = 160 * escala
  const H = 50 * escala

  // Logo del comercio, cuadrado con esquinas redondeadas. Si no hay o falla,
  // la esquina queda solo con el nombre — la tarjeta sale igual.
  let logo = null
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const lado = H
      const radio = Math.round(lado * 0.22) // mismo radio que la cuadrícula de sellos
      const mascara = Buffer.from(
        `<svg width="${lado}" height="${lado}"><rect width="${lado}" height="${lado}" rx="${radio}" fill="#fff"/></svg>`
      )
      logo = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize(lado, lado, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .flatten({ background: '#ffffff' })
        .composite([{ input: mascara, blend: 'dest-in' }])
        .png()
        .toBuffer()
    } catch {
      logo = null
    }
  }

  const textX = logo ? H + 6 * escala : 0
  const fs = (logo ? 15 : 17) * escala
  const texto = String(nombre).slice(0, 24).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const svgTexto = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text x="${textX}" y="${H / 2}" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif"
      font-size="${fs}" font-weight="bold" fill="${tinta}">${texto}</text>
  </svg>`)

  const capas = [{ input: svgTexto, left: 0, top: 0 }]
  if (logo) capas.unshift({ input: logo, left: 0, top: 0 })
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(capas)
    .png()
    .toBuffer()
}

/** La cuadrícula de sellos (el MISMO dibujo que Google Wallet) como strip. */
async function stripDeSellos({ colorFondo, sellos, meta, sello }, escala) {
  const svg = Buffer.from(svgDeCuadricula({ color: colorFondo, sellos, meta, sello }))
  return sharp(svg)
    .resize(375 * escala, 123 * escala, { fit: 'cover' })
    .flatten({ background: colorFondo })
    .png()
    .toBuffer()
}

/**
 * Construye el .pkpass completo de una tarjeta. Devuelve el Buffer del zip
 * firmado, listo para servir con content-type application/vnd.apple.pkpass.
 */
export async function construirPkpass({ businessId, phone, marca, sellos, meta, nombreCliente }) {
  const certPem = process.env.APPLE_PASS_CERT
  const keyPem = process.env.APPLE_PASS_KEY
  if (!certPem || !keyPem) throw new Error('Faltan los secretos APPLE_PASS_CERT / APPLE_PASS_KEY')

  const claro = fondoEsClaro(marca.colorFondo)
  const tinta = claro ? 'rgb(31,41,55)' : 'rgb(255,255,255)'
  const tintaLabel = claro ? 'rgb(75,85,99)' : 'rgb(219,234,254)'

  const serial = serialDe(businessId, phone)
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    // Estable por tarjeta: re-agregar con el mismo serial reemplaza la vieja.
    serialNumber: serial,
    // Actualización automática: con esto el iPhone se registra al añadir la
    // tarjeta y la refresca solo cuando le avisamos por push (syncWalletPass).
    webServiceURL: WEB_SERVICE_URL,
    authenticationToken: tokenDeAutenticacion(serial),
    organizationName: marca.nombre,
    description: `Tarjeta de fidelidad de ${marca.nombre}`,
    foregroundColor: tinta,
    backgroundColor: rgbDe(marca.colorFondo),
    labelColor: tintaLabel,
    storeCard: {
      // changeMessage: cuando el pase se actualiza por push, el iPhone muestra
      // este texto en la pantalla bloqueada con el valor nuevo en %@.
      headerFields: [{ key: 'sellos', label: 'SELLOS', value: `${sellos}/${meta}`, changeMessage: 'Sellos: %@' }],
      // El nombre va completo en una línea. Se intentó partirlo en dos filas
      // (secondary + auxiliary), pero en las storeCard PassKit FUSIONA ambas
      // en una sola fila — no se apilan (visto en iPhone real). Si el nombre
      // es muy largo, iOS lo corta con "…"; decisión de Giacomo: así está bien.
      secondaryFields: [
        ...(nombreCliente ? [{ key: 'cliente', label: 'CLIENTE', value: nombreCliente }] : []),
        ...(marca.premio
          ? [{ key: 'premio', label: 'PREMIO', value: marca.premio, textAlignment: 'PKTextAlignmentRight' }]
          : []),
      ],
      backFields: [
        ...(marca.mensaje ? [{ key: 'mensaje', label: marca.nombre, value: marca.mensaje }] : []),
        ...(marca.enlaces || []).map((e) => ({
          key: e.id,
          label: e.description,
          value: e.uri,
          // Los links del reverso son texto; attributedValue los vuelve tocables.
          attributedValue: `<a href="${e.uri}">${e.uri}</a>`,
        })),
        { key: 'tel', label: 'Tarjeta', value: String(phone) },
      ],
    },
    // El QR lleva el teléfono: es lo que el cajero escanea, igual que en Google.
    barcodes: [{ format: 'PKBarcodeFormatQR', message: String(phone), messageEncoding: 'iso-8859-1' }],
    // Con ubicación, iOS sugiere la tarjeta en la pantalla bloqueada al llegar.
    ...(marca.ubicaciones?.length
      ? { locations: marca.ubicaciones.slice(0, 10).map((u) => ({ latitude: u.latitude, longitude: u.longitude })) }
      : {}),
  }

  const archivos = { 'pass.json': Buffer.from(JSON.stringify(passJson)) }
  const tintaLogo = tinta.replace('rgb', 'rgba').replace(')', ',1)')
  const sello = marca.tema?.sello || 'check'
  const [i1, i2, i3, l1, l2, l3, s1, s2, s3] = await Promise.all([
    iconoDesdeLogo(marca.logoUrl, 29, marca.colorFondo),
    iconoDesdeLogo(marca.logoUrl, 58, marca.colorFondo),
    iconoDesdeLogo(marca.logoUrl, 87, marca.colorFondo),
    logoConNombre(marca.nombre, tintaLogo, 1, marca.logoUrl),
    logoConNombre(marca.nombre, tintaLogo, 2, marca.logoUrl),
    logoConNombre(marca.nombre, tintaLogo, 3, marca.logoUrl),
    stripDeSellos({ colorFondo: marca.colorFondo, sellos, meta, sello }, 1),
    stripDeSellos({ colorFondo: marca.colorFondo, sellos, meta, sello }, 2),
    stripDeSellos({ colorFondo: marca.colorFondo, sellos, meta, sello }, 3),
  ])
  Object.assign(archivos, {
    'icon.png': i1, 'icon@2x.png': i2, 'icon@3x.png': i3,
    'logo.png': l1, 'logo@2x.png': l2, 'logo@3x.png': l3,
    'strip.png': s1, 'strip@2x.png': s2, 'strip@3x.png': s3,
  })

  return firmarYEmpaquetar(archivos, certPem, keyPem)
}

/**
 * Manifest + firma PKCS#7 + zip: la parte del formato .pkpass que es idéntica
 * para cualquier tipo de pase. Extraída para que la tarjeta de sellos y el
 * cupón no dupliquen la criptografía.
 */
async function firmarYEmpaquetar(archivos, certPem, keyPem) {
  // manifest.json: SHA-1 de cada archivo (lo exige el formato).
  const manifest = {}
  for (const [nombre, buf] of Object.entries(archivos)) {
    manifest[nombre] = createHash('sha1').update(buf).digest('hex')
  }
  const manifestBuf = Buffer.from(JSON.stringify(manifest))

  // Firma PKCS#7 desacoplada del manifest, con la cadena WWDR incluida.
  const cert = forge.pki.certificateFromPem(certPem)
  const key = forge.pki.privateKeyFromPem(keyPem)
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(manifestBuf.toString('binary'))
  p7.addCertificate(forge.pki.certificateFromPem(WWDR_PEM))
  p7.addCertificate(cert)
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  })
  p7.sign({ detached: true })

  const zip = new JSZip()
  for (const [nombre, buf] of Object.entries(archivos)) zip.file(nombre, buf)
  zip.file('manifest.json', manifestBuf)
  zip.file('signature', Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary'))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/**
 * El .pkpass de un CUPÓN (estilo `coupon` de PassKit): el descuento en grande,
 * el código y el vencimiento, con el QR del código — lo que el cajero escanea
 * o tipea en el POS.
 *
 * A diferencia de la tarjeta de sellos, el cupón es ESTÁTICO: sin
 * webServiceURL ni authenticationToken, porque no hay nada que actualizar por
 * push. Un cupón agotado o vencido simplemente no pasa la validación del POS.
 *
 * @param {Object} cupon - { code, type: 'percent'|'amount', value, expiresAt }
 */
export async function construirPkpassCupon({ businessId, marca, cupon }) {
  const certPem = process.env.APPLE_PASS_CERT
  const keyPem = process.env.APPLE_PASS_KEY
  if (!certPem || !keyPem) throw new Error('Faltan los secretos APPLE_PASS_CERT / APPLE_PASS_KEY')

  const claro = fondoEsClaro(marca.colorFondo)
  const tinta = claro ? 'rgb(31,41,55)' : 'rgb(255,255,255)'
  const tintaLabel = claro ? 'rgb(75,85,99)' : 'rgb(219,234,254)'

  const descuento = cupon.type === 'percent' ? `${cupon.value}%` : `S/ ${cupon.value}`
  const vence = cupon.expiresAt
    ? new Date(cupon.expiresAt).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' })
    : null

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    // Serial propio del cupón, con prefijo para no chocar jamás con el de una
    // tarjeta de sellos (businessId-telefono).
    serialNumber: `cupon-${businessId}-${cupon.code}`,
    organizationName: marca.nombre,
    description: `Cupón de descuento de ${marca.nombre}`,
    foregroundColor: tinta,
    backgroundColor: rgbDe(marca.colorFondo),
    labelColor: tintaLabel,
    coupon: {
      primaryFields: [{ key: 'dcto', label: 'DESCUENTO', value: descuento }],
      secondaryFields: [
        { key: 'codigo', label: 'CÓDIGO', value: cupon.code },
        ...(vence
          ? [{ key: 'vence', label: 'VÁLIDO HASTA', value: vence, textAlignment: 'PKTextAlignmentRight' }]
          : []),
      ],
      backFields: [
        {
          key: 'como',
          label: 'Cómo usarlo',
          value: `Muestra este cupón al pagar en ${marca.nombre}. El cajero escanea el código QR o ingresa el código ${cupon.code}.`,
        },
        ...(marca.enlaces || []).map((e) => ({
          key: e.id,
          label: e.description,
          value: e.uri,
          attributedValue: `<a href="${e.uri}">${e.uri}</a>`,
        })),
      ],
    },
    // El QR lleva el CÓDIGO del cupón: es lo que valida el POS.
    barcodes: [{ format: 'PKBarcodeFormatQR', message: String(cupon.code), messageEncoding: 'iso-8859-1' }],
  }

  const archivos = { 'pass.json': Buffer.from(JSON.stringify(passJson)) }
  const tintaLogo = tinta.replace('rgb', 'rgba').replace(')', ',1)')
  const [i1, i2, i3, l1, l2, l3] = await Promise.all([
    iconoDesdeLogo(marca.logoUrl, 29, marca.colorFondo),
    iconoDesdeLogo(marca.logoUrl, 58, marca.colorFondo),
    iconoDesdeLogo(marca.logoUrl, 87, marca.colorFondo),
    logoConNombre(marca.nombre, tintaLogo, 1, marca.logoUrl),
    logoConNombre(marca.nombre, tintaLogo, 2, marca.logoUrl),
    logoConNombre(marca.nombre, tintaLogo, 3, marca.logoUrl),
  ])
  Object.assign(archivos, {
    'icon.png': i1, 'icon@2x.png': i2, 'icon@3x.png': i3,
    'logo.png': l1, 'logo@2x.png': l2, 'logo@3x.png': l3,
  })

  return firmarYEmpaquetar(archivos, certPem, keyPem)
}

/**
 * Push de actualización a los iPhone registrados para una tarjeta. El payload
 * de PassKit va VACÍO a propósito: el push solo dice "hay novedades" y es el
 * iPhone quien vuelve a pedir el pase al web service (ahí ve los sellos
 * nuevos y muestra el changeMessage en pantalla bloqueada).
 *
 * La autenticación con APNs es por certificado TLS de cliente: el MISMO
 * certificado del Pass Type ID que firma los pases. Sin librerías: http2
 * nativo de Node.
 *
 * Devuelve los tokens muertos (410/400 BadDeviceToken) para que el caller
 * limpie sus registros.
 */
export async function notificarDispositivosApple(pushTokens) {
  const cert = process.env.APPLE_PASS_CERT
  const key = process.env.APPLE_PASS_KEY
  if (!cert || !key) throw new Error('Faltan los secretos APPLE_PASS_CERT / APPLE_PASS_KEY')
  if (!pushTokens.length) return { enviados: 0, muertos: [] }

  const session = http2.connect('https://api.push.apple.com', { cert, key })
  try {
    const resultados = await Promise.allSettled(pushTokens.map((token) => new Promise((resolve, reject) => {
      const req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        'apns-topic': PASS_TYPE_ID,
        'apns-push-type': 'background',
        'content-type': 'application/json',
      })
      let status = 0
      let body = ''
      req.on('response', (headers) => { status = headers[':status'] })
      req.on('data', (c) => { body += c })
      req.on('end', () => resolve({ token, status, body }))
      req.on('error', reject)
      req.setTimeout(10000, () => { req.close(); reject(new Error('APNs timeout')) })
      req.end('{}')
    })))

    const muertos = []
    let enviados = 0
    for (const r of resultados) {
      if (r.status !== 'fulfilled') continue
      if (r.value.status === 200) { enviados++; continue }
      // 410 = el pase fue eliminado del iPhone; 400 BadDeviceToken = token inválido.
      if (r.value.status === 410 || /BadDeviceToken/.test(r.value.body)) muertos.push(r.value.token)
    }
    return { enviados, muertos }
  } finally {
    session.close()
  }
}

/** ¿El navegador que pide el link es un iPhone/iPad? (para el desvío de cbrfy.link) */
export function esDispositivoApple(userAgent) {
  return /iPhone|iPad|iPod/i.test(String(userAgent || ''))
}
