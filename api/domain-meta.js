// Vercel Serverless Function para meta tags dinámicos de dominios personalizados de catálogo/menú
// Llamar con: /api/domain-meta?domain=lafilomenacafe.com
//
// Desde el 15-set-2026 un catálogo con dominio propio puede tener varias
// PÁGINAS (pedido de CITEX): la raíz, /tienda, /legal/<política> y /reclamos.
// El middleware y los rewrites de vercel.json mandan acá a los bots de vista
// previa de cada una con `pagina` (y `legal` para las políticas), y cada página
// sale con su título, su descripción y su dirección. La búsqueda de la tienda
// y el SEO de cada página viven en src/utils/cabeceraDeTienda.js, que también
// arma la cabecera que ven los buscadores: la app, el middleware y estas
// funciones dicen lo mismo.
import { buscarTiendaPorDominio, paginaPedida, seoGenerico, escapar } from '../src/utils/cabeceraDeTienda.js'

// api/catalog-meta los importa de acá.
export { paginaPedida, seoGenerico }

function generateHTML(business, domain, pagina, origen) {
  const businessName = business.name || business.businessName || domain
  const isRestaurant = business.businessMode === 'restaurant'
  const seo = seoGenerico(business, pagina, { esRestaurante: isRestaurant })
  const logoUrl = business.catalogFaviconUrl || business.catalogLogoUrl || business.logoUrl || `${origen}/logo.png`
  const themeColor = business.catalogColor || '#10B981'
  const url = `${origen}${pagina.ruta}`
  const socialImageUrl = business.catalogSocialImage || business.logoUrl || `${origen}/socialmedia.jpeg`
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
// ejecutan JavaScript. Google y Bing sí lo ejecutan: a ellos el middleware les
// sirve la aplicación con la cabecera de la tienda (utils/cabeceraDeTienda).
const BOTS_SOCIALES = [
  'facebookexternalhit', 'facebot', 'linkedinbot', 'twitterbot', 'whatsapp',
  'telegrambot', 'slackbot', 'discordbot', 'pinterest', 'cobrifychat',
]

const esBotSocial = (userAgent) => {
  const ua = String(userAgent || '').toLowerCase()
  return !!ua && BOTS_SOCIALES.some(bot => ua.includes(bot))
}

/**
 * A quien NO es bot de vista previa —una persona, o Google, que ejecuta
 * JavaScript— se le sirve la aplicación tal cual, SIN redirigir. Si algo lo
 * trajo acá (el middleware, un rewrite, una caché) y se lo devolviera a la
 * misma dirección, volvería a entrar y así hasta que el navegador se rinda:
 * pasó el 15-set-2026 con Googlebot en todos los dominios propios.
 */
async function servirLaApp(req, res) {
  try {
    const host = req.headers.host
    const r = await fetch(`https://${host}/index.html`, { headers: { 'user-agent': 'CobrifyMeta/1.0' } })
    if (r.ok) {
      const html = await r.text()
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
      return res.status(200).send(html)
    }
  } catch (error) {
    console.warn('[DomainMeta] no se pudo servir index.html:', error?.message)
  }
  // Un archivo estático, que ninguna regla vuelve a tocar: no hay bucle posible.
  return res.redirect(302, '/index.html')
}

export default async function handler(req, res) {
  const userAgent = req.headers['user-agent'] || ''
  // El dominio llega por query cuando alguien llama a la función a mano (o
  // desde el middleware), y por el header Host cuando entra por el rewrite.
  // Sin `www.` ni puerto: el negocio guarda el dominio pelado (citex.pe) y
  // Vercel sirve la web en www.citex.pe.
  const domain = String(req.query.domain || req.headers.host || '').toLowerCase().replace(/^www\./, '').split(':')[0]
  const pagina = paginaPedida(req.query)
  // La dirección que de verdad sirve la tienda es el host por el que entró el
  // bot (www.citex.pe); el dominio guardado responde 308 hacia allá.
  const hostReal = String(req.headers.host || '').toLowerCase().split(':')[0]
  const origen = hostReal && !esDominioDeCobrify(hostReal) ? `https://${hostReal}` : `https://${domain}`

  console.log(`[DomainMeta] domain=${domain}, pagina=${pagina.clave}, UA=${userAgent.substring(0, 50)}`)

  if (!domain) {
    return res.redirect(302, '/index.html')
  }

  // La home de Cobrify tiene sus propios meta tags en el index. Se manda ahí
  // directo y no a `/`, que volvería a entrar por el rewrite: bucle infinito.
  if (esDominioDeCobrify(domain)) {
    return res.redirect(302, '/index.html')
  }

  if (!esBotSocial(userAgent)) {
    return servirLaApp(req, res)
  }

  // Primero buscar como dominio de catálogo de negocio
  const business = await buscarTiendaPorDominio(domain)

  if (business) {
    const html = generateHTML(business, domain, pagina, origen)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).send(html)
  }

  // Fallback: redirigir a reseller-meta por si es dominio de reseller
  return res.redirect(307, `/api/reseller-meta?domain=${encodeURIComponent(domain)}`)
}
