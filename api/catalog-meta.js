// Vercel Serverless Function para meta tags dinámicos de catálogos
// Llamar con: /api/catalog-meta?slug=mi-tienda

const FIREBASE_PROJECT_ID = 'cobrify-395fe'

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

function isSocialBot(userAgent) {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return SOCIAL_BOT_USER_AGENTS.some(bot => ua.includes(bot.toLowerCase()))
}

async function findBusinessByCatalogSlug(slug) {
  try {
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    })

    if (!response.ok) {
      console.error('Firestore API error:', response.status)
      return null
    }

    const results = await response.json()

    if (!results || results.length === 0 || !results[0].document) {
      return null
    }

    const doc = results[0].document
    const fields = doc.fields || {}

    return {
      name: fields.name?.stringValue || null,
      businessName: fields.businessName?.stringValue || null,
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

function generateHTML(business, slug) {
  const businessName = business.name || business.businessName || 'Catálogo'
  const tagline = business.catalogTagline || `Catálogo de productos de ${businessName}`
  const description = business.catalogWelcome || tagline
  const logoUrl = business.logoUrl || 'https://cobrifyperu.com/logo.png'
  const themeColor = business.catalogColor || '#10B981'
  const url = `https://cobrifyperu.com/catalogo/${slug}`
  const socialImageUrl = business.catalogSocialImage || business.logoUrl || 'https://cobrifyperu.com/socialmedia.jpg'

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${businessName} - Catálogo de Productos</title>
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />
  <link rel="icon" href="${logoUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${businessName}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${businessName} - Catálogo de Productos" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${socialImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="es_PE" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${businessName} - Catálogo de Productos" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${socialImageUrl}" />
</head>
<body>
  <script>window.location.href="${url}";</script>
  <noscript><meta http-equiv="refresh" content="0;url=${url}"></noscript>
</body>
</html>`
}

export default async function handler(req, res) {
  const slug = req.query.slug
  const userAgent = req.headers['user-agent'] || ''

  console.log(`[CatalogMeta] slug=${slug}, UA=${userAgent.substring(0, 50)}`)

  if (!slug) {
    return res.redirect(302, '/')
  }

  // Solo servir meta tags a bots sociales
  if (!isSocialBot(userAgent)) {
    return res.redirect(302, `/catalogo/${slug}`)
  }

  const business = await findBusinessByCatalogSlug(slug)

  if (!business) {
    const html = generateHTML({ name: 'Catálogo' }, slug)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)
  }

  const html = generateHTML(business, slug)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  return res.status(200).send(html)
}
