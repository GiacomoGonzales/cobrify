/**
 * La vista previa del enlace de alta cuando se comparte por WhatsApp.
 *
 * El enlace `registro.cobrifyperu.com/<codigo>` es lo primero que ve alguien
 * que acaba de pagar, y hasta ahora WhatsApp le mostraba la imagen de la
 * landing: "Planes desde S/ 19.90". A quien ya pagó eso le sobra —y peor, le
 * hace dudar de si el enlace es el correcto—. Acá se le da una portada propia:
 * "Bienvenido", el logo y nada más.
 *
 * Solo la ven los bots: el rewrite de `vercel.json` trae aquí las peticiones
 * cuyo user-agent es de una red social. Una persona cae en la app de siempre.
 *
 * El código del alta NO se consulta ni se valida: esta función solo pinta la
 * portada. Si el código no existe o ya se usó, quien lo abre se entera adentro,
 * que es donde se puede explicar bien. Una vista previa que dijera "enlace
 * vencido" además filtraría a WhatsApp el estado de un enlace ajeno.
 */

// Con `www` a propósito: `cobrifyperu.com` redirige a `www.cobrifyperu.com`
// (comprobado), y no todos los robots que arman la vista previa siguen el
// salto cuando el que redirige es la IMAGEN. Un enlace sin portada es
// exactamente lo que se está arreglando acá.
const IMAGEN = 'https://www.cobrifyperu.com/bienvenido.png'
const TITULO = 'Bienvenido a Cobrify'
const DESCRIPCION = 'Crea tu cuenta y empieza a facturar hoy mismo.'

export default function handler(req, res) {
  // El destino real: el mismo enlace por el que entró. Con el host se respeta
  // tanto el subdominio corto como la ruta larga de respaldo.
  const host = req.headers.host || 'registro.cobrifyperu.com'
  const ruta = (req.url || '/').split('?')[0]
  const url = `https://${host}${ruta}`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Cache corta: la portada es fija, pero si algún día cambia no conviene que
  // los bots la tengan clavada por horas.
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600')
  res.status(200).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${TITULO}</title>
  <meta name="description" content="${DESCRIPCION}" />
  <meta name="theme-color" content="#1554E8" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" href="https://www.cobrifyperu.com/logo.png" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Cobrify" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${TITULO}" />
  <meta property="og:description" content="${DESCRIPCION}" />
  <meta property="og:image" content="${IMAGEN}" />
  <meta property="og:image:secure_url" content="${IMAGEN}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Bienvenido a Cobrify" />
  <meta property="og:locale" content="es_PE" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${TITULO}" />
  <meta name="twitter:description" content="${DESCRIPCION}" />
  <meta name="twitter:image" content="${IMAGEN}" />
</head>
<body>
  <script>window.location.href=${JSON.stringify(url)};</script>
  <noscript><meta http-equiv="refresh" content="0;url=${url}"></noscript>
</body>
</html>`)
}
