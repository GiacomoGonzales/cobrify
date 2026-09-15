// Vercel Serverless Function para meta tags dinámicos de dominios personalizados de catálogo/menú
// Llamar con: /api/domain-meta?domain=lafilomenacafe.com
//
// Desde el 15-set-2026 un catálogo con dominio propio puede tener varias
// PÁGINAS (pedido de CITEX): la raíz, /tienda, /legal/<política> y /reclamos.
// El rewrite de vercel.json manda a los bots de cada una acá con `pagina`
// (y `legal` para las políticas), y cada página sale con su título, su
// descripción y su dirección. El diseño a medida de CITEX tiene los suyos en
// src/components/catalog/aMedida/citex/seo.js, los mismos que pone la app.
import { seoDePaginaCitex } from '../src/components/catalog/aMedida/citex/seo.js'

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
    const texto = (campo) => fields[campo]?.stringValue || null

    return {
      name: texto('name'),
      businessName: texto('businessName'),
      businessMode: texto('businessMode'),
      companySlogan: texto('companySlogan'),
      catalogTagline: texto('catalogTagline'),
      catalogWelcome: texto('catalogWelcome'),
      catalogColor: texto('catalogColor'),
      catalogSocialImage: texto('catalogSocialImage'),
      catalogLogoUrl: texto('catalogLogoUrl'),
      catalogFaviconUrl: texto('catalogFaviconUrl'),
      logoUrl: texto('logoUrl'),
      customDomain: texto('customDomain'),
      // El título de la pestaña que eligió el negocio (Apariencia) y su tema:
      // un diseño a medida trae el SEO de cada página.
      catalogPageTitle: texto('catalogPageTitle'),
      catalogTheme: texto('catalogTheme'),
    }
  } catch (error) {
    console.error('Error fetching from Firestore:', error)
    return null
  }
}

const LEGALES = {
  'politica-privacidad': 'Política de privacidad',
  'politica-cambios-devoluciones': 'Política de cambios y devoluciones',
  'politica-envios': 'Política de envíos',
  'terminos-condiciones': 'Términos y condiciones',
}

/** La página que pidió el bot: su ruta y la clave que entiende el SEO a medida. */
export function paginaPedida(query = {}) {
  const pagina = String(query.pagina || '').toLowerCase()
  const legal = String(query.legal || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (pagina === 'tienda') return { clave: 'tienda', ruta: '/tienda' }
  if (pagina === 'legal' && legal) return { clave: `legal/${legal}`, ruta: `/legal/${legal}`, legal }
  if (pagina === 'reclamos') return { clave: 'reclamos', ruta: '/reclamos' }
  return { clave: 'inicio', ruta: '' }
}

/** Título, descripción y tipo de una página, para cualquier negocio. */
export function seoGenerico(business, pagina, { esRestaurante = false } = {}) {
  const businessName = business.name || business.businessName || 'Catálogo'
  if (business.catalogTheme === 'citex') {
    const seo = seoDePaginaCitex(pagina.clave)
    return { titulo: seo.titulo, descripcion: seo.descripcion, tipo: seo.tipo || 'website' }
  }
  const slogan = (business.catalogTagline || business.companySlogan || business.catalogWelcome || '').trim()
  if (pagina.clave === 'tienda') {
    return {
      titulo: business.catalogPageTitle || `Tienda en línea | ${businessName}`,
      descripcion: slogan || `Compra en la tienda en línea de ${businessName}. Mira los productos y haz tu pedido.`,
      tipo: 'website',
    }
  }
  if (pagina.legal) {
    const titulo = LEGALES[pagina.legal] || 'Información legal'
    return { titulo: `${titulo} | ${businessName}`, descripcion: `${titulo} de ${businessName}.`, tipo: 'article' }
  }
  if (pagina.clave === 'reclamos') {
    return {
      titulo: `Libro de Reclamaciones | ${businessName}`,
      descripcion: `Registra tu reclamo o queja en el Libro de Reclamaciones de ${businessName} y consulta su estado.`,
      tipo: 'website',
    }
  }
  const tagline = slogan || (esRestaurante ? `¡Haz tu pedido en ${businessName}!` : `¡Visita el catálogo de ${businessName}!`)
  return {
    titulo: business.catalogPageTitle || (esRestaurante ? `${businessName} — Menú Digital 🍽️` : `${businessName} — Catálogo`),
    descripcion: esRestaurante
      ? `${tagline} — Menú digital de ${businessName}. Mira nuestra carta y pide desde tu mesa.`
      : `${tagline} — Catálogo de ${businessName}. Mira nuestros productos y haz tu pedido.`,
    tipo: 'website',
  }
}

// Va dentro de atributos HTML: comillas y signos de menor se escapan.
const escapar = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function generateHTML(business, domain, pagina) {
  const businessName = business.name || business.businessName || domain
  const isRestaurant = business.businessMode === 'restaurant'
  const seo = seoGenerico(business, pagina, { esRestaurante: isRestaurant })
  const logoUrl = business.catalogFaviconUrl || business.catalogLogoUrl || business.logoUrl || `https://${domain}/logo.png`
  const themeColor = business.catalogColor || '#10B981'
  const url = `https://${domain}${pagina.ruta}`
  const socialImageUrl = business.catalogSocialImage || business.logoUrl || `https://${domain}/socialmedia.jpeg`
  const title = escapar(seo.titulo)
  const description = escapar(seo.descripcion)

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="${themeColor}" />
  <link rel="icon" href="${escapar(logoUrl)}" />
  <meta property="og:type" content="${seo.tipo || 'website'}" />
  <meta property="og:site_name" content="${escapar(businessName)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${escapar(socialImageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="es_PE" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${escapar(socialImageUrl)}" />
</head>
<body>
  <script>window.location.href="${url}";</script>
  <noscript><meta http-equiv="refresh" content="0;url=${url}"></noscript>
</body>
</html>`
}

// Los dominios de Cobrify mismo: NO son el catálogo de nadie.
//
// Hacen falta porque el rewrite que trae acá a los bots se aplica a la raíz de
// CUALQUIER host —Vercel usa RE2 en sus condiciones y RE2 no tiene lookahead,
// así que no se puede escribir "cualquier dominio menos cobrifyperu.com"—. La
// exclusión se resuelve entonces del lado del código, que además es donde se
// puede leer y explicar.
const DOMINIOS_DE_COBRIFY = [
  'cobrifyperu.com',
  'www.cobrifyperu.com',
  'factuya.pe',
  'www.factuya.pe',
  'localhost',
]

const esDominioDeCobrify = (host) => {
  const limpio = String(host || '').toLowerCase().split(':')[0]
  if (!limpio) return true
  if (DOMINIOS_DE_COBRIFY.includes(limpio)) return true
  // Las URLs de despliegue y las vistas previas de Vercel.
  return limpio.endsWith('.vercel.app')
}

// Solo los bots de vista previa (WhatsApp, Facebook, LinkedIn...), que no
// ejecutan JavaScript. Google y Bing sí lo ejecutan: a ellos les conviene la
// aplicación de verdad, con la página entera y el título que pone la app.
const BOTS_SOCIALES = [
  'facebookexternalhit', 'facebot', 'linkedinbot', 'twitterbot', 'whatsapp',
  'telegrambot', 'slackbot', 'discordbot', 'pinterest', 'cobrifychat',
]

const esBotSocial = (userAgent) => {
  const ua = String(userAgent || '').toLowerCase()
  return !!ua && BOTS_SOCIALES.some(bot => ua.includes(bot))
}

export default async function handler(req, res) {
  const userAgent = req.headers['user-agent'] || ''
  // El dominio llega por query cuando alguien llama a la función a mano, y por
  // el header Host cuando entra por el rewrite de la raíz.
  const domain = req.query.domain || req.headers.host
  const pagina = paginaPedida(req.query)

  console.log(`[DomainMeta] domain=${domain}, pagina=${pagina.clave}, UA=${userAgent.substring(0, 50)}`)

  if (!domain) {
    return res.redirect(302, '/index.html')
  }

  // La home de Cobrify tiene sus propios meta tags en el index. Se manda ahí
  // directo y no a `/`, que volvería a entrar por el rewrite: bucle infinito.
  if (esDominioDeCobrify(domain)) {
    return res.redirect(302, '/index.html')
  }

  // A una persona no se le sirve esto: se la deja seguir a la aplicación.
  // Tampoco hay bucle — el rewrite solo trae acá a los bots.
  if (!esBotSocial(userAgent)) {
    return res.redirect(302, pagina.ruta || '/')
  }

  // Primero buscar como dominio de catálogo de negocio
  const business = await findBusinessByDomain(domain)

  if (business) {
    const html = generateHTML(business, domain, pagina)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).send(html)
  }

  // Fallback: redirigir a reseller-meta por si es dominio de reseller
  return res.redirect(307, `/api/reseller-meta?domain=${encodeURIComponent(domain)}`)
}
