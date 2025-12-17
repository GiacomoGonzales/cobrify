// Vercel Serverless Function para meta tags dinámicos de catálogos
// Esta función intercepta las requests a /catalogo/:slug y sirve meta tags
// personalizados para crawlers de redes sociales (WhatsApp, Facebook, Twitter, etc.)

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Inicializar Firebase Admin si no está inicializado
if (!getApps().length) {
  // En Vercel, las credenciales se pasan como variable de entorno
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : null

  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount)
    })
  } else {
    // Fallback para desarrollo local o si no hay credenciales
    initializeApp()
  }
}

const db = getFirestore()

// User agents de bots de redes sociales
const SOCIAL_BOT_USER_AGENTS = [
  'facebookexternalhit',
  'Facebot',
  'LinkedInBot',
  'Twitterbot',
  'WhatsApp',
  'TelegramBot',
  'Slackbot',
  'Discordbot',
  'Pinterest',
  'Googlebot',
  'bingbot',
  'Applebot'
]

/**
 * Detecta si el request viene de un bot de redes sociales
 */
function isSocialBot(userAgent) {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return SOCIAL_BOT_USER_AGENTS.some(bot => ua.includes(bot.toLowerCase()))
}

/**
 * Genera HTML con meta tags dinámicos para un catálogo público
 */
function generateCatalogMetaTagsHTML(business, slug) {
  const businessName = business.name || business.businessName || 'Catálogo'
  const tagline = business.catalogTagline || `Catálogo de productos de ${businessName}`
  const description = business.catalogWelcome || tagline
  const logoUrl = business.logoUrl || 'https://cobrifyperu.com/logo.png'
  const themeColor = business.catalogColor || '#10B981'
  const url = `https://cobrifyperu.com/catalogo/${slug}`

  // Usar imagen específica para redes sociales, o logo, o imagen por defecto
  const socialImageUrl = business.catalogSocialImage || business.logoUrl || 'https://cobrifyperu.com/socialmedia.jpg'

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta Tags -->
  <title>${businessName} - Catálogo de Productos</title>
  <meta name="title" content="${businessName} - Catálogo de Productos" />
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />

  <!-- Favicon -->
  <link rel="icon" type="image/png" href="${logoUrl}" />
  <link rel="apple-touch-icon" href="${logoUrl}" />

  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${businessName}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${businessName} - Catálogo de Productos" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${socialImageUrl}" />
  <meta property="og:image:url" content="${socialImageUrl}" />
  <meta property="og:image:secure_url" content="${socialImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Catálogo de ${businessName}" />
  <meta property="og:locale" content="es_PE" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${url}" />
  <meta name="twitter:title" content="${businessName} - Catálogo de Productos" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${socialImageUrl}" />
  <meta name="twitter:image:alt" content="Catálogo de ${businessName}" />
</head>
<body>
  <script>window.location.href = "${url}";</script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=${url}">
    <p>Redirigiendo a <a href="${url}">${businessName}</a>...</p>
  </noscript>
</body>
</html>`
}

export default async function handler(req, res) {
  try {
    const { slug } = req.query
    const userAgent = req.headers['user-agent'] || ''

    console.log(`🛍️ [CatalogMeta] Request for slug: ${slug}, UA: ${userAgent.substring(0, 50)}...`)

    if (!slug) {
      // Sin slug, redirigir a home
      return res.redirect(302, '/')
    }

    // Si no es un bot de redes sociales, dejar que la SPA maneje la ruta
    if (!isSocialBot(userAgent)) {
      console.log(`🛍️ [CatalogMeta] Normal user, serving SPA`)
      // Redirigir a la ruta del catálogo para que la SPA lo maneje
      return res.redirect(302, `/catalogo/${slug}`)
    }

    console.log(`🛍️ [CatalogMeta] Social bot detected, fetching business data...`)

    // Buscar el negocio por catalogSlug
    const businessesSnapshot = await db.collection('businesses')
      .where('catalogSlug', '==', slug)
      .where('catalogEnabled', '==', true)
      .limit(1)
      .get()

    if (businessesSnapshot.empty) {
      console.log(`🛍️ [CatalogMeta] No catalog found for slug: ${slug}`)
      return res.redirect(302, `/catalogo/${slug}`)
    }

    const businessDoc = businessesSnapshot.docs[0]
    const business = businessDoc.data()

    console.log(`🛍️ [CatalogMeta] Found business: ${business.name || business.businessName}`)

    // Generar y enviar HTML con meta tags
    const html = generateCatalogMetaTagsHTML(business, slug)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300') // Cache por 5 minutos
    return res.status(200).send(html)

  } catch (error) {
    console.error('❌ [CatalogMeta] Error:', error)
    return res.redirect(302, '/')
  }
}
