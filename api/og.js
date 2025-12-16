// Vercel Serverless Function para servir meta tags dinámicas a bots sociales

export default async function handler(req, res) {
  const userAgent = req.headers['user-agent'] || ''
  const host = req.headers['host'] || req.headers['x-forwarded-host'] || ''

  console.log('OG Function called - Host:', host, 'UA:', userAgent.substring(0, 50))

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
