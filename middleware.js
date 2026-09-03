// Vercel Edge Middleware para meta tags dinámicos
// Este middleware intercepta TODAS las requests antes de llegar a la app

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

export default function middleware(request) {
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

  // Caso 1: Catálogo público (/catalogo/:slug)
  if (pathname.startsWith('/catalogo/')) {
    const slug = pathname.replace('/catalogo/', '').split('/')[0]
    if (slug) {
      // Reescribir a la API de catálogo
      url.pathname = '/api/catalog-meta'
      url.searchParams.set('slug', slug)
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

  // Caso 3: Dominio personalizado (ruta raíz de dominio externo)
  // Puede ser catálogo de negocio o landing de reseller
  if (pathname === '/' && isResellerDomain(hostname)) {
    const normalizedHost = hostname.toLowerCase().replace(/^www\./, '').split(':')[0]
    // Redirigir a domain-meta que busca catálogos, con fallback a reseller-meta
    url.pathname = '/api/domain-meta'
    url.searchParams.set('domain', normalizedHost)
    return Response.redirect(url.toString(), 307)
  }

  // Continuar normalmente para otros casos
  return
}

export const config = {
  matcher: ['/', '/manifest.json', '/manifest.webmanifest', '/catalogo/:path*', '/menu/:path*']
}
