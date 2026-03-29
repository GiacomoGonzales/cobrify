// Vercel Serverless Function para meta tags dinámicos de dominios personalizados de catálogo/menú
// Llamar con: /api/domain-meta?domain=lafilomenacafe.com

const FIREBASE_PROJECT_ID = 'cobrify-395fe'

async function findBusinessByDomain(domain) {
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
                  field: { fieldPath: 'customDomain' },
                  op: 'EQUAL',
                  value: { stringValue: domain }
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

    const fields = results[0].document.fields || {}

    return {
      name: fields.name?.stringValue || null,
      businessName: fields.businessName?.stringValue || null,
      businessMode: fields.businessMode?.stringValue || null,
      companySlogan: fields.companySlogan?.stringValue || null,
      catalogColor: fields.catalogColor?.stringValue || null,
      catalogSocialImage: fields.catalogSocialImage?.stringValue || null,
      catalogLogoUrl: fields.catalogLogoUrl?.stringValue || null,
      logoUrl: fields.logoUrl?.stringValue || null,
      customDomain: fields.customDomain?.stringValue || null,
    }
  } catch (error) {
    console.error('Error fetching from Firestore:', error)
    return null
  }
}

function generateHTML(business, domain) {
  const businessName = business.name || business.businessName || domain
  const isRestaurant = business.businessMode === 'restaurant'
  const slogan = business.companySlogan || ''
  const tagline = slogan || (isRestaurant
    ? `¡Haz tu pedido en ${businessName}!`
    : `¡Visita el catálogo de ${businessName}!`)
  const description = isRestaurant
    ? `${tagline} — Menú digital de ${businessName}. Mira nuestra carta y pide desde tu mesa.`
    : `${tagline} — Catálogo de ${businessName}. Mira nuestros productos y haz tu pedido.`
  const logoUrl = business.catalogLogoUrl || business.logoUrl || `https://${domain}/logo.png`
  const themeColor = business.catalogColor || '#10B981'
  const url = `https://${domain}`
  const socialImageUrl = business.catalogSocialImage || business.logoUrl || `https://${domain}/socialmedia.jpeg`
  const title = isRestaurant
    ? `${businessName} — Menú Digital 🍽️`
    : `${businessName} — Catálogo`

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${businessName}</title>
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />
  <link rel="icon" href="${logoUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${businessName}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${socialImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="es_PE" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
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
  const domain = req.query.domain
  const userAgent = req.headers['user-agent'] || ''

  console.log(`[DomainMeta] domain=${domain}, UA=${userAgent.substring(0, 50)}`)

  if (!domain) {
    return res.redirect(302, '/')
  }

  // Primero buscar como dominio de catálogo de negocio
  const business = await findBusinessByDomain(domain)

  if (business) {
    const html = generateHTML(business, domain)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).send(html)
  }

  // Fallback: redirigir a reseller-meta por si es dominio de reseller
  return res.redirect(307, `/api/reseller-meta?domain=${encodeURIComponent(domain)}`)
}
