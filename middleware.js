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

export default function middleware(request) {
  const url = new URL(request.url)
  const hostname = request.headers.get('host') || ''
  const userAgent = request.headers.get('user-agent') || ''
  const pathname = url.pathname

  // Solo interceptar para bots sociales
  if (!isSocialBot(userAgent)) {
    return // Continuar normalmente
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

  // Caso 2: Dominio de reseller (ruta raíz)
  if (pathname === '/' && isResellerDomain(hostname)) {
    // Reescribir a la API de reseller
    url.pathname = '/api/reseller-meta'
    return Response.redirect(url.toString(), 307)
  }

  // Continuar normalmente para otros casos
  return
}

export const config = {
  matcher: ['/', '/catalogo/:path*']
}
