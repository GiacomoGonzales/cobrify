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
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import forge from 'node-forge'
import JSZip from 'jszip'
import sharp from 'sharp'
import { svgDeCuadricula } from './walletAssetsService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WWDR_PEM = readFileSync(path.join(__dirname, '../assets/wwdr-g4.pem'), 'utf8')

const PASS_TYPE_ID = 'pass.com.cobrify.loyalty'
const TEAM_ID = 'WAUWHRT3D6'

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
 * El nombre del comercio como IMAGEN (logo.png), no como logoText: el texto
 * comparte fila con el contador de sellos y con nombres largos se encimaban
 * (visto en la tarjeta de prueba). Como imagen, Apple le reserva su espacio.
 */
async function logoConNombre(nombre, tinta, escala) {
  const W = 160 * escala
  const H = 50 * escala
  const fs = 17 * escala
  const texto = String(nombre).slice(0, 24).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text x="0" y="${H / 2}" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif"
      font-size="${fs}" font-weight="bold" fill="${tinta}">${texto}</text>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
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

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    // Estable por tarjeta: re-agregar con el mismo serial reemplaza la vieja.
    serialNumber: `${businessId}-${phone}`,
    organizationName: marca.nombre,
    description: `Tarjeta de fidelidad de ${marca.nombre}`,
    foregroundColor: tinta,
    backgroundColor: rgbDe(marca.colorFondo),
    labelColor: tintaLabel,
    storeCard: {
      headerFields: [{ key: 'sellos', label: 'SELLOS', value: `${sellos}/${meta}` }],
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
    logoConNombre(marca.nombre, tintaLogo, 1),
    logoConNombre(marca.nombre, tintaLogo, 2),
    logoConNombre(marca.nombre, tintaLogo, 3),
    stripDeSellos({ colorFondo: marca.colorFondo, sellos, meta, sello }, 1),
    stripDeSellos({ colorFondo: marca.colorFondo, sellos, meta, sello }, 2),
    stripDeSellos({ colorFondo: marca.colorFondo, sellos, meta, sello }, 3),
  ])
  Object.assign(archivos, {
    'icon.png': i1, 'icon@2x.png': i2, 'icon@3x.png': i3,
    'logo.png': l1, 'logo@2x.png': l2, 'logo@3x.png': l3,
    'strip.png': s1, 'strip@2x.png': s2, 'strip@3x.png': s3,
  })

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

/** ¿El navegador que pide el link es un iPhone/iPad? (para el desvío de cbrfy.link) */
export function esDispositivoApple(userAgent) {
  return /iPhone|iPad|iPod/i.test(String(userAgent || ''))
}
