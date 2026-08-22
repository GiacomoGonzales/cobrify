// Vercel Serverless Function: manifiesto PWA por dominio.
//
// El manifiesto define lo que Chrome muestra en el cuadro "Instalar aplicación":
// nombre, descripción e ícono. Estaba horneado en el build, así que un reseller
// con su propio dominio veía igual el nombre y el logo de Cobrify al instalar.
//
// Acá se resuelve por el Host: si el dominio es de un reseller, se devuelve su
// marca; si no, el manifiesto de Cobrify tal cual estaba. Mismo criterio y misma
// consulta que `api/reseller-meta.js`, para que no puedan divergir.
//
// El middleware solo desvía hacia acá los dominios que NO son de Cobrify, así
// que el dominio principal sigue sirviendo el archivo estático del build.

const FIREBASE_PROJECT_ID = 'cobrify-395fe'

const IGNORED_DOMAINS = [
  'localhost',
  'vercel.app',
  'firebaseapp.com',
  'web.app',
  'cobrifyperu.com',
  'cobrify.com',
]

const MANIFIESTO_COBRIFY = {
  name: 'Cobrify - Sistema de Facturación Electrónica SUNAT',
  short_name: 'Cobrify',
  description: 'Sistema completo de facturación electrónica homologado con SUNAT para negocios en Perú.',
  theme_color: '#2563eb',
  background_color: '#0a0e27',
  logoUrl: '/logo.png',
}

function esDominioDeReseller(hostname) {
  if (!hostname) return false
  const h = hostname.toLowerCase().replace(/^www\./, '').split(':')[0]
  return !IGNORED_DOMAINS.some((d) => h.includes(d))
}

async function buscarResellerPorDominio(hostname) {
  const dominio = hostname.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`
  const consulta = {
    structuredQuery: {
      from: [{ collectionId: 'resellers' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'customDomain' },
          op: 'EQUAL',
          value: { stringValue: dominio },
        },
      },
      limit: 1,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(consulta),
  })
  if (!res.ok) return null

  const filas = await res.json()
  if (!Array.isArray(filas) || !filas.length || !filas[0].document) return null

  const campos = filas[0].document.fields || {}
  const marca = campos.branding?.mapValue?.fields || {}
  return {
    companyName: marca.companyName?.stringValue || campos.brandName?.stringValue || null,
    description: marca.description?.stringValue || null,
    logoUrl: marca.logoUrl?.stringValue || campos.logoUrl?.stringValue || null,
    primaryColor: marca.primaryColor?.stringValue || null,
  }
}

function armarManifiesto(marca) {
  const nombre = marca.companyName || MANIFIESTO_COBRIFY.short_name
  const esCobrify = !marca.companyName

  // El ícono va SOLO con purpose 'any'. Un logo cualquiera no está diseñado
  // para 'maskable' —Android recorta un círculo y le come los bordes—, así que
  // declararlo sería arruinar el logo del reseller en su propio celular.
  const icono = marca.logoUrl || MANIFIESTO_COBRIFY.logoUrl
  const icons = [{ src: icono, sizes: '512x512', type: 'image/png', purpose: 'any' }]

  return {
    name: esCobrify ? MANIFIESTO_COBRIFY.name : `${nombre} - Facturación Electrónica SUNAT`,
    short_name: nombre,
    description: marca.description
      || (esCobrify
        ? MANIFIESTO_COBRIFY.description
        : `Sistema de facturación electrónica homologado con SUNAT. Gestiona facturas, boletas, clientes e inventario con ${nombre}.`),
    start_url: '/',
    display: 'standalone',
    // Fondo blanco para los resellers: es el color con el que casi cualquier
    // logo se ve bien. El azul oscuro de Cobrify solo funciona con su propio
    // logo, que es claro.
    background_color: esCobrify ? MANIFIESTO_COBRIFY.background_color : '#ffffff',
    theme_color: marca.primaryColor || MANIFIESTO_COBRIFY.theme_color,
    orientation: 'any',
    scope: '/',
    lang: 'es-PE',
    categories: ['business', 'finance', 'productivity'],
    icons,
    shortcuts: [
      { name: 'Punto de Venta', short_name: 'POS', description: 'Abrir punto de venta rápidamente', url: '/app/pos', icons },
      { name: 'Nueva Venta', short_name: 'Venta', description: 'Crear nueva venta', url: '/app/pos', icons },
      { name: 'Clientes', short_name: 'Clientes', description: 'Ver lista de clientes', url: '/app/clientes', icons },
    ],
  }
}

export default async function handler(req, res) {
  const host = (req.query?.host || req.headers.host || '').toString()

  let marca = {}
  if (esDominioDeReseller(host)) {
    try {
      marca = (await buscarResellerPorDominio(host)) || {}
    } catch (error) {
      // Sin marca del reseller se sirve el manifiesto de Cobrify. Un fallo acá
      // no puede dejar a la app sin manifiesto: sin él no se instala nada.
      console.error('manifest: no se pudo resolver el reseller de', host, error)
      marca = {}
    }
  }

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  // Igual que el estático: sin caché dura, para que al cambiar el logo se vea.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
  res.status(200).send(JSON.stringify(armarManifiesto(marca)))
}
