// Vercel Serverless Function para meta tags dinámicos de catálogos
// Llamar con: /api/catalog-meta?slug=mi-tienda
//
// Un catálogo con diseño a medida puede tener varias páginas (hoy CITEX):
// /catalogo/<slug>/tienda y /catalogo/<slug>/legal/<política>. El rewrite las
// manda acá con `pagina` (y `legal`); el título y la descripción de cada una
// son los mismos que pone la app (ver api/domain-meta.js).
import { paginaPedida, seoGenerico } from './domain-meta.js'

const FIREBASE_PROJECT_ID = 'cobrify-395fe'

// Solo los bots de vista previa, que no ejecutan JavaScript. Google y Bing sí
// lo ejecutan y ven la aplicación de verdad.
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
  'CobrifyChat',
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
    const texto = (campo) => fields[campo]?.stringValue || null

    return {
      name: texto('name'),
      businessName: texto('businessName'),
      catalogTagline: texto('catalogTagline'),
      catalogWelcome: texto('catalogWelcome'),
      companySlogan: texto('companySlogan'),
      catalogColor: texto('catalogColor'),
      catalogSocialImage: texto('catalogSocialImage'),
      catalogLogoUrl: texto('catalogLogoUrl'),
      catalogFaviconUrl: texto('catalogFaviconUrl'),
      logoUrl: texto('logoUrl'),
      // El título de la pestaña que eligió el negocio (Apariencia) y su tema.
      catalogPageTitle: texto('catalogPageTitle'),
      catalogTheme: texto('catalogTheme'),
    }
  } catch (error) {
    console.error('Error fetching from Firestore:', error)
    return null
  }
}

// Va dentro de atributos HTML: comillas y signos de menor se escapan.
const escapar = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function generateHTML(business, slug, pagina) {
  const businessName = business.name || business.businessName || 'Catálogo'
  const seo = seoGenerico(business, pagina)
  // Sin tema a medida, el catálogo de siempre conserva su título de siempre.
  const pageTitle = escapar(pagina.clave === 'inicio' && business.catalogTheme !== 'citex'
    ? (business.catalogPageTitle || `${businessName} - Catálogo de Productos`)
    : seo.titulo)
  const description = escapar(pagina.clave === 'inicio' && business.catalogTheme !== 'citex'
    ? (business.catalogWelcome || business.catalogTagline || `Catálogo de productos de ${businessName}`)
    : seo.descripcion)
  const logoUrl = business.catalogFaviconUrl || business.catalogLogoUrl || business.logoUrl || 'https://cobrifyperu.com/logo.png'
  const themeColor = business.catalogColor || '#10B981'
  const url = `https://cobrifyperu.com/catalogo/${slug}${pagina.ruta}`
  const socialImageUrl = business.catalogSocialImage || business.logoUrl || 'https://cobrifyperu.com/socialmedia.jpg'

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageTitle}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="${themeColor}" />
  <link rel="icon" href="${escapar(logoUrl)}" />
  <meta property="og:type" content="${seo.tipo || 'website'}" />
  <meta property="og:site_name" content="${escapar(businessName)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${pageTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${escapar(socialImageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="es_PE" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${pageTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${escapar(socialImageUrl)}" />
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
  const pagina = paginaPedida(req.query)

  console.log(`[CatalogMeta] slug=${slug}, pagina=${pagina.clave}, UA=${userAgent.substring(0, 50)}`)

  if (!slug) {
    return res.redirect(302, '/')
  }

  // Solo servir meta tags a bots sociales
  if (!isSocialBot(userAgent)) {
    return res.redirect(302, `/catalogo/${slug}${pagina.ruta}`)
  }

  const business = await findBusinessByCatalogSlug(slug)

  if (!business) {
    const html = generateHTML({ name: 'Catálogo' }, slug, pagina)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)
  }

  const html = generateHTML(business, slug, pagina)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  return res.status(200).send(html)
}
