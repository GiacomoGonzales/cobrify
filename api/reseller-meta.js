// Vercel Serverless Function para meta tags dinámicos de resellers
// Detecta el dominio personalizado y devuelve meta tags del reseller

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

// Dominios que NO son de resellers
const IGNORED_DOMAINS = [
  'localhost',
  'vercel.app',
  'firebaseapp.com',
  'web.app',
  'cobrifyperu.com',
  'cobrify.com',
  'www.cobrifyperu.com',
  'www.cobrify.com'
]

function isSocialBot(userAgent) {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return SOCIAL_BOT_USER_AGENTS.some(bot => ua.includes(bot.toLowerCase()))
}

function isResellerDomain(domain) {
  if (!domain) return false
  const d = domain.toLowerCase().replace(/^www\./, '')
  return !IGNORED_DOMAINS.some(ignored => d.includes(ignored))
}

async function findResellerByDomain(domain) {
  try {
    // Limpiar dominio (quitar www. y puerto)
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')

    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`

    const query = {
      structuredQuery: {
        from: [{ collectionId: 'resellers' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'customDomain' },
            op: 'EQUAL',
            value: { stringValue: cleanDomain }
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
    const branding = fields.branding?.mapValue?.fields || {}

    return {
      companyName: branding.companyName?.stringValue || fields.companyName?.stringValue || null,
      brandName: fields.brandName?.stringValue || null,
      description: branding.description?.stringValue || null,
      logoUrl: branding.logoUrl?.stringValue || fields.logoUrl?.stringValue || null,
      socialImageUrl: branding.socialImageUrl?.stringValue || null,
      primaryColor: branding.primaryColor?.stringValue || null,
      customDomain: fields.customDomain?.stringValue || null
    }
  } catch (error) {
    console.error('Error fetching reseller:', error)
    return null
  }
}

function generateHTML(reseller, domain) {
  const brandName = reseller.companyName || reseller.brandName || 'Sistema de Facturación'
  const description = reseller.description || `${brandName} - Sistema de facturación electrónica SUNAT para negocios en Perú`
  const logoUrl = reseller.logoUrl || 'https://cobrifyperu.com/logo.png'
  const socialImageUrl = reseller.socialImageUrl || reseller.logoUrl || 'https://cobrifyperu.com/socialmedia.jpg'
  const themeColor = reseller.primaryColor || '#2563eb'
  const url = `https://${domain}`

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${brandName} - Sistema de Facturación Electrónica</title>
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />
  <link rel="icon" href="${logoUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${brandName}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${brandName} - Sistema de Facturación Electrónica" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${socialImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="es_PE" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${brandName} - Sistema de Facturación Electrónica" />
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
  // Obtener el dominio del header
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  const domain = host.toLowerCase().replace(/:\d+$/, '')
  const userAgent = req.headers['user-agent'] || ''

  console.log(`[ResellerMeta] domain=${domain}, UA=${userAgent.substring(0, 50)}`)

  // Si no es dominio de reseller, redirigir al index
  if (!isResellerDomain(domain)) {
    console.log(`[ResellerMeta] Not a reseller domain, skipping`)
    return res.redirect(302, '/')
  }

  // Si no es bot social, redirigir al index (la app React cargará)
  if (!isSocialBot(userAgent)) {
    console.log(`[ResellerMeta] Normal user, redirecting to app`)
    return res.redirect(302, '/')
  }

  console.log(`[ResellerMeta] Social bot detected, fetching reseller data...`)

  const reseller = await findResellerByDomain(domain)

  if (!reseller) {
    console.log(`[ResellerMeta] No reseller found for domain: ${domain}`)
    // Devolver meta tags genéricos
    const html = generateHTML({ companyName: 'Sistema de Facturación' }, domain)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)
  }

  console.log(`[ResellerMeta] Found reseller: ${reseller.companyName || reseller.brandName}`)

  const html = generateHTML(reseller, domain)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  return res.status(200).send(html)
}
