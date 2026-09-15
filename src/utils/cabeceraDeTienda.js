/**
 * LA CABECERA DE UNA TIENDA CON DOMINIO PROPIO, ARMADA EN EL SERVIDOR.
 *
 * Google, Bing y los demás buscadores piden la página y reciben el index.html
 * de la aplicación, que es el de Cobrify: título "Sistema de Facturación
 * Electrónica SUNAT", su descripción, su ícono y sus datos estructurados. Lo de
 * la tienda recién aparece al ejecutar JavaScript, y el ícono de los
 * resultados sale de esa cabecera (captura de Google que mandó CITEX,
 * 15-set-2026: "citex / No hay información disponible sobre esta página").
 *
 * Esto arma la cabecera de cada página de la tienda y la pone en lugar de la
 * de Cobrify. Lo usan el middleware (a los buscadores, y el robots.txt y el
 * sitemap.xml de cada dominio) y api/domain-meta y api/catalog-meta (a los
 * bots de vista previa). La aplicación pone lo mismo al cargar
 * (utils/seoDePagina desde CatalogoPublico).
 *
 * JavaScript puro, sin alias de Vite: corre en el Edge de Vercel y en Node.
 */
import { seoDePaginaCitex } from '../components/catalog/aMedida/citex/seo.js'
import { ORDEN_LEGALES } from '../components/catalog/aMedida/citex/legales.js'

const FIREBASE_PROJECT_ID = 'cobrify-395fe'

// Los buscadores sí ejecutan JavaScript, pero la primera lectura, el ícono de
// los resultados y la verificación de Search Console salen del HTML tal como
// llega. Los bots de vista previa (WhatsApp, Facebook) van por otro camino.
const BUSCADORES = [
  'googlebot', 'google-inspectiontool', 'googleother', 'google favicon',
  'google-site-verification', 'storebot-google', 'bingbot', 'bingpreview', 'adidxbot',
  'applebot', 'duckduckbot', 'yandex', 'baiduspider', 'slurp', 'petalbot',
]

/** ¿Quien pide es un buscador (Google, Bing, Apple...)? */
export function esBuscador(userAgent) {
  const ua = String(userAgent || '').toLowerCase()
  return !!ua && BUSCADORES.some((b) => ua.includes(b))
}

// Va dentro de atributos HTML: comillas y signos de menor se escapan.
export const escapar = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const escaparXml = (s) => escapar(s).replace(/>/g, '&gt;').replace(/'/g, '&apos;')

const LEGALES = {
  'politica-privacidad': 'Política de privacidad',
  'politica-cambios-devoluciones': 'Política de cambios y devoluciones',
  'politica-envios': 'Política de envíos',
  'terminos-condiciones': 'Términos y condiciones',
}

/** La página que se pidió: su ruta y la clave que entiende el SEO a medida. */
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
    return {
      titulo: seo.titulo,
      descripcion: seo.descripcion,
      tipo: seo.tipo || 'website',
      ...(seo.noEncontrada && { noEncontrada: true }),
    }
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

/**
 * La tienda de un dominio propio, por REST y sin sesión: la misma lectura
 * pública que hace el catálogo. Con tope de tiempo: si Firestore tarda, quien
 * llama sigue con la aplicación de siempre.
 * @returns {Promise<object|null>}
 */
export async function buscarTiendaPorDominio(dominio, { tope = 4000 } = {}) {
  const limpio = String(dominio || '').toLowerCase().replace(/^www\./, '').split(':')[0]
  if (!limpio) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), tope)
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'businesses' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'customDomain' }, op: 'EQUAL', value: { stringValue: limpio } } },
                { fieldFilter: { field: { fieldPath: 'catalogEnabled' }, op: 'EQUAL', value: { booleanValue: true } } },
              ],
            },
          },
          limit: 1,
        },
      }),
      signal: control.signal,
    })
    if (!r.ok) return null
    const filas = await r.json()
    // runQuery devuelve un arreglo; un error puede venir DENTRO de él.
    const documento = Array.isArray(filas) ? filas.find((f) => f && f.document)?.document : null
    if (!documento) return null
    const f = documento.fields || {}
    const texto = (campo) => f[campo]?.stringValue || null
    return {
      id: documento.name.split('/').pop(),
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
      complaintsBookEnabled: f.complaintsBookEnabled?.booleanValue === true,
      complaintsBookSlug: texto('complaintsBookSlug'),
    }
  } catch {
    return null
  } finally {
    clearTimeout(reloj)
  }
}

// Una tienda con páginas propias (portada, tienda, políticas): el diseño a
// medida de CITEX. Las demás son una sola página, la tienda.
const tienePaginas = (business) => business?.catalogTheme === 'citex'

/** Las direcciones de la tienda que valen para Google, en el orden del sitemap. */
export function paginasDeTienda(business) {
  const rutas = ['/']
  if (tienePaginas(business)) {
    rutas.push('/tienda')
    for (const legal of ORDEN_LEGALES) rutas.push(`/legal/${legal}`)
  }
  if (business?.complaintsBookEnabled && business?.complaintsBookSlug) rutas.push('/reclamos')
  return rutas
}

/**
 * Las etiquetas del <head> de una página de la tienda.
 * @param {{ business: object, origen: string, pagina: { clave: string, ruta: string } }} p
 *   `origen` es la dirección que de verdad sirve la tienda (https://www.citex.pe).
 */
export function etiquetasDeTienda({ business, origen, pagina }) {
  const nombre = business.name || business.businessName || ''
  const seo = seoGenerico(business, pagina, { esRestaurante: business.businessMode === 'restaurant' })
  const url = `${origen}${pagina.ruta || '/'}`
  const icono = business.catalogFaviconUrl || business.catalogLogoUrl || business.logoUrl || ''
  // WhatsApp y Facebook necesitan una dirección: un logo guardado como data URI no sirve.
  const imagenCandidata = business.catalogSocialImage || business.catalogLogoUrl || business.logoUrl || ''
  const imagen = imagenCandidata.startsWith('data:') ? '' : imagenCandidata
  const e = escapar
  const lineas = [
    `<title>${e(seo.titulo)}</title>`,
    `<meta name="description" content="${e(seo.descripcion)}" />`,
    `<meta name="robots" content="${seo.noEncontrada ? 'noindex, follow' : 'index, follow'}" />`,
    `<link rel="canonical" href="${e(url)}" />`,
    `<meta name="theme-color" content="${e(business.catalogColor || '#10B981')}" />`,
    ...(nombre ? [`<meta name="apple-mobile-web-app-title" content="${e(nombre)}" />`] : []),
    ...(icono
      ? [
          `<link rel="icon" href="${e(icono)}" />`,
          `<link rel="shortcut icon" href="${e(icono)}" />`,
          `<link rel="apple-touch-icon" href="${e(icono)}" />`,
        ]
      : []),
    `<meta property="og:type" content="${e(seo.tipo || 'website')}" />`,
    ...(nombre ? [`<meta property="og:site_name" content="${e(nombre)}" />`] : []),
    `<meta property="og:url" content="${e(url)}" />`,
    `<meta property="og:title" content="${e(seo.titulo)}" />`,
    `<meta property="og:description" content="${e(seo.descripcion)}" />`,
    ...(imagen ? [`<meta property="og:image" content="${e(imagen)}" />`] : []),
    '<meta property="og:locale" content="es_PE" />',
    `<meta name="twitter:card" content="${imagen ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${e(seo.titulo)}" />`,
    `<meta name="twitter:description" content="${e(seo.descripcion)}" />`,
    ...(imagen ? [`<meta name="twitter:image" content="${e(imagen)}" />`] : []),
  ]
  // El nombre del sitio que Google pone sobre cada resultado sale de aquí: sin
  // él mostraba "citex", armado con el dominio.
  if (pagina.clave === 'inicio' && nombre) {
    const sitio = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: nombre, url: `${origen}/` })
    lineas.push(`<script type="application/ld+json">${sitio.replace(/</g, '\\u003c')}</script>`)
  }
  return lineas.join('\n    ')
}

// Lo que index.html trae de Cobrify y no puede quedar en una tienda: título,
// descripción, íconos, tarjetas para redes y datos estructurados. Todo lo demás
// (scripts, estilos, el manifiesto) se queda como está.
const DE_COBRIFY = [
  /<title>[\s\S]*?<\/title>\s*/gi,
  /<meta\b[^>]*\b(?:name|property)="(?:title|description|keywords|robots|theme-color|apple-mobile-web-app-title|og:[^"]*|twitter:[^"]*)"[^>]*>\s*/gi,
  /<link\b[^>]*\brel="(?:icon|shortcut icon|apple-touch-icon|canonical)"[^>]*>\s*/gi,
  /<script\b[^>]*\btype="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\s*/gi,
]

/**
 * Cambia la cabecera de Cobrify del index.html por la de la tienda.
 * @returns {string|null} null si el HTML no tiene </head> (no se toca nada).
 */
export function inyectarCabecera(html, etiquetas) {
  let limpio = String(html || '')
  if (!/<\/head>/i.test(limpio)) return null
  for (const patron of DE_COBRIFY) limpio = limpio.replace(patron, '')
  return limpio.replace(/<\/head>/i, `    ${etiquetas}\n  </head>`)
}

/** El robots.txt de una tienda: todo abierto menos el sistema, y su propio sitemap. */
export function robotsDeTienda(origen) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /app/',
    'Disallow: /api/',
    'Disallow: /login',
    '',
    `Sitemap: ${origen}/sitemap.xml`,
    '',
  ].join('\n')
}

/** El sitemap.xml de una tienda: sus páginas en su dominio. */
export function sitemapDeTienda(business, origen) {
  const urls = paginasDeTienda(business).map((ruta) => `  <url><loc>${escaparXml(`${origen}${ruta}`)}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}
