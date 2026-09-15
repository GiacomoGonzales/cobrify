// Vercel Edge Middleware para meta tags dinámicos
// Este middleware intercepta TODAS las requests antes de llegar a la app
import {
  esBuscador,
  buscarTiendaPorDominio,
  paginaPedida,
  etiquetasDeTienda,
  inyectarCabecera,
  robotsDeTienda,
  sitemapDeTienda,
} from './src/utils/cabeceraDeTienda.js'

// Solo los bots de vista previa, que leen etiquetas sin ejecutar JavaScript.
// Google, Bing y Apple SÍ lo ejecutan: a ellos les conviene la aplicación de
// verdad, con la página entera. Mandarlos a la página de metas les daba un
// HTML vacío que se redirigía a sí mismo (15-set-2026). Misma lista que los
// rewrites de vercel.json y que api/domain-meta, api/catalog-meta.
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

const IGNORED_DOMAINS = [
  'localhost',
  'vercel.app',
  'firebaseapp.com',
  'web.app',
  'cobrifyperu.com',
  'cobrify.com'
]

function isSocialBot(userAgent) {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return SOCIAL_BOT_USER_AGENTS.some(bot => ua.includes(bot.toLowerCase()))
}

function isResellerDomain(hostname) {
  if (!hostname) return false
  const h = hostname.toLowerCase().replace(/^www\./, '')
  return !IGNORED_DOMAINS.some(ignored => h.includes(ignored))
}

// Las páginas de un catálogo con diseño a medida (hoy CITEX): la tienda, las
// políticas y el libro de reclamaciones (pedido del 14-set-2026). Devuelve los
// parámetros que entienden api/domain-meta y api/catalog-meta, o null si es la
// raíz del catálogo.
function paginaDeCatalogo(segmentos) {
  if (segmentos[0] === 'tienda') return { pagina: 'tienda' }
  if (segmentos[0] === 'legal' && segmentos[1]) return { pagina: 'legal', legal: segmentos[1] }
  if (segmentos[0] === 'reclamos') return { pagina: 'reclamos' }
  return null
}

// El subdominio del chat (chat.cobrifyperu.com) es la MISMA app servida por
// otra puerta. Su marca no sale de la base de datos: es una constante, asi que
// la vista previa se arma aca mismo en vez de pagar una funcion. Criterio
// espejado en src/utils/dominioChat.js y en el <head> de index.html.
const HOSTS_DEL_CHAT = ['chat.cobrifyperu.com', 'chat.cobrify.com', 'chat.localhost']

function esDominioDelChat(hostname) {
  if (!hostname) return false
  return HOSTS_DEL_CHAT.includes(hostname.toLowerCase().split(':')[0])
}

const META_CHAT = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Cobrify Chat</title>
<meta name="description" content="Bandeja de WhatsApp de Cobrify." />
<meta name="robots" content="noindex, nofollow" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Cobrify Chat" />
<meta property="og:title" content="Cobrify Chat" />
<meta property="og:description" content="Bandeja de WhatsApp de Cobrify." />
<meta property="og:url" content="https://chat.cobrifyperu.com/" />
<meta property="og:image" content="https://chat.cobrifyperu.com/chat/icon-1024.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1024" />
<meta property="og:image:height" content="1024" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="Cobrify Chat" />
<meta name="twitter:description" content="Bandeja de WhatsApp de Cobrify." />
<meta name="twitter:image" content="https://chat.cobrifyperu.com/chat/icon-1024.png" />
</head>
<body>Cobrify Chat</body>
</html>`

const hostLimpio = (hostname) => String(hostname || '').toLowerCase().split(':')[0]

/**
 * Una tienda con dominio propio, para un buscador: la aplicación de siempre
 * (index.html) con la cabecera de la tienda en lugar de la de Cobrify
 * (utils/cabeceraDeTienda). Responde en la MISMA dirección, sin redirigir:
 * redirigir a /api/ es justo lo que robots.txt prohíbe leer, y así Google
 * mostraba "No hay información disponible sobre esta página" (15-set-2026).
 * Si algo falla devuelve null y el buscador recibe la aplicación tal cual.
 */
async function paginaParaBuscadores(request, hostname, parametros) {
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), 4000)
  try {
    const host = hostLimpio(hostname)
    const [tienda, index] = await Promise.all([
      buscarTiendaPorDominio(host),
      fetch(new URL('/index.html', request.url), { headers: { 'user-agent': 'CobrifyMeta/1.0' }, signal: control.signal }),
    ])
    if (!tienda || !index.ok) return null
    const etiquetas = etiquetasDeTienda({ business: tienda, origen: `https://${host}`, pagina: paginaPedida(parametros || {}) })
    const html = inyectarCabecera(await index.text(), etiquetas)
    if (!html) return null
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    })
  } catch {
    return null
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * robots.txt y sitemap.xml de una tienda con dominio propio. Sin esto cada
 * tienda servía los de Cobrify, que mandan a Google al sitemap de
 * cobrifyperu.com. null si el dominio no es de una tienda (un reseller): ahí
 * sigue el archivo de siempre.
 */
async function archivoDeTienda(pathname, hostname) {
  try {
    const host = hostLimpio(hostname)
    const tienda = await buscarTiendaPorDominio(host)
    if (!tienda) return null
    const origen = `https://${host}`
    const esRobots = pathname === '/robots.txt'
    return new Response(esRobots ? robotsDeTienda(origen) : sitemapDeTienda(tienda, origen), {
      status: 200,
      headers: {
        'Content-Type': esRobots ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return null
  }
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const hostname = request.headers.get('host') || ''
  const userAgent = request.headers.get('user-agent') || ''
  const pathname = url.pathname

  // Manifiesto PWA por dominio. Va ANTES del filtro de bots: acá quien pide es
  // el navegador de una persona. Es lo que Chrome lee para armar el cuadro
  // "Instalar aplicación" — nombre, descripción e ícono — y estaba horneado en
  // el build, así que un reseller con dominio propio veía la marca de Cobrify.
  //
  // El manifiesto vivo es /manifest.json (public/manifest.json). No esta
  // precacheado por el service worker —globPatterns no incluye json— asi que la
  // peticion sale a la red y llega hasta acá; si estuviera cacheado, el reseller
  // veria para siempre la copia de Cobrify.
  //
  // /manifest.webmanifest ya no se genera, pero se sigue atendiendo: los que
  // tengan el build viejo en cache lo van a pedir un rato mas.
  //
  // Solo se desvía en dominios de resellers: el dominio propio de Cobrify sigue
  // sirviendo el archivo estático, sin pagar una función por request.
  if ((pathname === '/manifest.json' || pathname === '/manifest.webmanifest') && isResellerDomain(hostname)) {
    const normalizedHost = hostname.toLowerCase().replace(/^www\./, '').split(':')[0]
    url.pathname = '/api/manifest'
    url.searchParams.set('host', normalizedHost)
    return Response.redirect(url.toString(), 307)
  }

  // robots.txt y sitemap.xml de una tienda con dominio propio (cualquiera los pide).
  if ((pathname === '/robots.txt' || pathname === '/sitemap.xml') && isResellerDomain(hostname)) {
    const archivo = await archivoDeTienda(pathname, hostname)
    if (archivo) return archivo
    return // Reseller: el archivo estático de siempre
  }

  // Buscadores en las páginas de una tienda con dominio propio: la aplicación
  // con la cabecera de la tienda. Va ANTES del filtro de bots sociales porque
  // Google no es uno de ellos.
  if (esBuscador(userAgent) && isResellerDomain(hostname)) {
    const segmentos = pathname.split('/').filter(Boolean)
    const pagina = paginaDeCatalogo(segmentos)
    if (segmentos.length === 0 || pagina) {
      const respuesta = await paginaParaBuscadores(request, hostname, pagina)
      if (respuesta) return respuesta
    }
    return // Continuar normalmente
  }

  // Solo interceptar para bots sociales
  if (!isSocialBot(userAgent)) {
    return // Continuar normalmente
  }

  // Caso 0: subdominio del chat. Es privado, asi que el HTML no dice mas que su
  // nombre y su icono; el navegador de una persona nunca llega aca.
  if (esDominioDelChat(hostname)) {
    return new Response(META_CHAT, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    })
  }

  // Caso 1: Catálogo público (/catalogo/:slug, y sus páginas /tienda y /legal/...)
  if (pathname.startsWith('/catalogo/')) {
    const segmentos = pathname.split('/').filter(Boolean) // ['catalogo', slug, ...]
    const slug = segmentos[1]
    if (slug) {
      // Reescribir a la API de catálogo
      url.pathname = '/api/catalog-meta'
      url.searchParams.set('slug', slug)
      const pagina = paginaDeCatalogo(segmentos.slice(2))
      if (pagina) for (const [k, v] of Object.entries(pagina)) url.searchParams.set(k, v)
      return Response.redirect(url.toString(), 307)
    }
  }

  // Caso 2: Menú digital de restaurante (/menu/:slug)
  if (pathname.startsWith('/menu/')) {
    const slug = pathname.replace('/menu/', '').split('/')[0].split('?')[0]
    if (slug) {
      // Reescribir a la API de menú
      url.pathname = '/api/menu-meta'
      url.searchParams.set('slug', slug)
      return Response.redirect(url.toString(), 307)
    }
  }

  // Caso 3: Dominio personalizado (raíz de un dominio externo, o una de las
  // páginas de su catálogo: /tienda, /legal/..., /reclamos).
  // Puede ser catálogo de negocio o landing de reseller
  if (isResellerDomain(hostname)) {
    const segmentos = pathname.split('/').filter(Boolean)
    const pagina = paginaDeCatalogo(segmentos)
    if (segmentos.length === 0 || pagina) {
      const normalizedHost = hostname.toLowerCase().replace(/^www\./, '').split(':')[0]
      // Redirigir a domain-meta que busca catálogos, con fallback a reseller-meta
      url.pathname = '/api/domain-meta'
      url.searchParams.set('domain', normalizedHost)
      if (pagina) for (const [k, v] of Object.entries(pagina)) url.searchParams.set(k, v)
      return Response.redirect(url.toString(), 307)
    }
  }

  // Continuar normalmente para otros casos
  return
}

export const config = {
  matcher: ['/', '/tienda', '/legal/:path*', '/reclamos', '/robots.txt', '/sitemap.xml', '/manifest.json', '/manifest.webmanifest', '/catalogo/:path*', '/menu/:path*']
}
