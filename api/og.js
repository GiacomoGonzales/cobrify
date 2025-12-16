// Vercel Serverless Function para servir meta tags dinámicas a bots sociales

const SOCIAL_BOTS = [
  'facebookexternalhit',
  'Facebot',
  'LinkedInBot',
  'Twitterbot',
  'WhatsApp',
  'TelegramBot',
  'Slackbot',
  'Discordbot',
  'Pinterest'
]

const IGNORED_DOMAINS = [
  'localhost',
  'vercel.app',
  'firebaseapp.com',
  'web.app',
  'cobrifyperu.com',
  'cobrify.com'
]

export default async function handler(req, res) {
  const userAgent = req.headers['user-agent'] || ''
  const host = req.headers['host'] || req.headers['x-forwarded-host'] || ''

  // Verificar si es dominio de reseller
  const isResellerDomain = !IGNORED_DOMAINS.some(d => host.toLowerCase().includes(d))

  if (!isResellerDomain) {
    return res.redirect(302, '/')
  }

  // Verificar si es bot social
  const isSocialBot = SOCIAL_BOTS.some(bot =>
    userAgent.toLowerCase().includes(bot.toLowerCase())
  )

  if (!isSocialBot) {
    return res.redirect(302, '/')
  }

  try {
    // Llamar a la Cloud Function de Firebase
    const functionUrl = 'https://socialmetatags-tb5ph5ddsq-uc.a.run.app'

    const response = await fetch(functionUrl, {
      headers: {
        'user-agent': userAgent,
        'x-forwarded-host': host
      }
    })

    const html = await response.text()

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).send(html)

  } catch (error) {
    console.error('Error fetching meta tags:', error)
    return res.redirect(302, '/')
  }
}
