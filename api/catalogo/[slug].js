// Vercel Serverless Function para meta tags dinámicos de catálogos
// Esta función intercepta las requests a /catalogo/:slug y sirve meta tags
// personalizados para crawlers de redes sociales (WhatsApp, Facebook, Twitter, etc.)
//
// Usa la REST API de Firestore (no requiere Service Account Key)

// Configuración de Firebase (mismas variables que el frontend)
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'cobrify-395fe'

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
 * Busca un negocio por catalogSlug usando la REST API de Firestore
 */
async function findBusinessByCatalogSlug(slug) {
  try {
    // Firestore REST API - runQuery
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`

    const query = {
      structuredQuery: {
        from: [{ collectionId: 'businesses' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'catalogSlug' },
                  op: 'EQUAL',
                  value: { stringValue: slug }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'catalogEnabled' },
                  op: 'EQUAL',
                  value: { booleanValue: true }
                }
              }
            ]
          }
        },
        limit: 1
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    })

    if (!response.ok) {
      console.error('Firestore API error:', response.status, await response.text())
      return null
    }

    const results = await response.json()

    // La respuesta es un array, el primer elemento puede tener document o estar vacío
    if (!results || results.length === 0 || !results[0].document) {
      return null
    }

    // Convertir el formato de Firestore a objeto plano
    const doc = results[0].document
    const fields = doc.fields || {}

    return {
      id: doc.name.split('/').pop(),
      name: fields.name?.stringValue || null,
      businessName: fields.businessName?.stringValue || null,
      catalogSlug: fields.catalogSlug?.stringValue || null,
      catalogEnabled: fields.catalogEnabled?.booleanValue || false,
      catalogTagline: fields.catalogTagline?.stringValue || null,
      catalogWelcome: fields.catalogWelcome?.stringValue || null,
      catalogColor: fields.catalogColor?.stringValue || null,
      catalogSocialImage: fields.catalogSocialImage?.stringValue || null,
      logoUrl: fields.logoUrl?.stringValue || null
    }
  } catch (error) {
    console.error('Error fetching from Firestore:', error)
    return null
  }
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
      return res.redirect(302, '/')
    }

    // Si no es un bot de redes sociales, servir el index.html para que React maneje la ruta
    if (!isSocialBot(userAgent)) {
      console.log(`🛍️ [CatalogMeta] Normal user, serving SPA`)
      // Redirigir a /app/catalogo/:slug que sirve el index.html sin pasar por la API
      return res.redirect(302, `/app/catalogo/${slug}`)
    }

    console.log(`🛍️ [CatalogMeta] Social bot detected, fetching business data...`)

    // Buscar el negocio por catalogSlug usando REST API
    const business = await findBusinessByCatalogSlug(slug)

    if (!business) {
      console.log(`🛍️ [CatalogMeta] No catalog found for slug: ${slug}`)
      // Si no se encuentra, devolver meta tags genéricos
      const html = generateCatalogMetaTagsHTML({ name: 'Catálogo' }, slug)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=60')
      return res.status(200).send(html)
    }

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
