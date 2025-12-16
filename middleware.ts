import { next } from '@vercel/edge';

// Configuración de resellers con sus meta tags
const RESELLERS: Record<string, {
  title: string;
  description: string;
  image: string;
  logo: string;
  themeColor: string;
}> = {
  'factuvip.com': {
    title: 'FACTUVIP - Sistema de Facturación Electrónica',
    description: 'Sistema de facturación electrónica SUNAT para negocios en Perú',
    image: 'https://firebasestorage.googleapis.com/v0/b/cobrify-395fe.firebasestorage.app/o/reseller-logos%2F2V6UaD4KwdZmJtaTcDNJ9sa38ll1%2Fsocial-image.jpeg?alt=media&token=59a0db41-d87d-464f-84e1-62c837994f5e',
    logo: 'https://firebasestorage.googleapis.com/v0/b/cobrify-395fe.firebasestorage.app/o/reseller-logos%2F2V6UaD4KwdZmJtaTcDNJ9sa38ll1%2Flogo.png?alt=media&token=4b1e5aad-d447-4fe8-a4c5-2a90383fa816',
    themeColor: '#3B82F6'
  },
  'www.factuvip.com': {
    title: 'FACTUVIP - Sistema de Facturación Electrónica',
    description: 'Sistema de facturación electrónica SUNAT para negocios en Perú',
    image: 'https://firebasestorage.googleapis.com/v0/b/cobrify-395fe.firebasestorage.app/o/reseller-logos%2F2V6UaD4KwdZmJtaTcDNJ9sa38ll1%2Fsocial-image.jpeg?alt=media&token=59a0db41-d87d-464f-84e1-62c837994f5e',
    logo: 'https://firebasestorage.googleapis.com/v0/b/cobrify-395fe.firebasestorage.app/o/reseller-logos%2F2V6UaD4KwdZmJtaTcDNJ9sa38ll1%2Flogo.png?alt=media&token=4b1e5aad-d447-4fe8-a4c5-2a90383fa816',
    themeColor: '#3B82F6'
  }
};

// Bots de redes sociales
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
];

function isSocialBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return SOCIAL_BOTS.some(bot => ua.includes(bot.toLowerCase()));
}

function generateHTML(reseller: typeof RESELLERS[string], host: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${reseller.title}</title>
  <meta name="title" content="${reseller.title}" />
  <meta name="description" content="${reseller.description}" />
  <meta name="theme-color" content="${reseller.themeColor}" />
  <link rel="icon" type="image/png" href="${reseller.logo}" />
  <link rel="apple-touch-icon" href="${reseller.logo}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://${host}/" />
  <meta property="og:site_name" content="${reseller.title.split(' - ')[0]}" />
  <meta property="og:title" content="${reseller.title}" />
  <meta property="og:description" content="${reseller.description}" />
  <meta property="og:image" content="${reseller.image}" />
  <meta property="og:image:url" content="${reseller.image}" />
  <meta property="og:image:secure_url" content="${reseller.image}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${reseller.title}" />
  <meta property="og:locale" content="es_PE" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://${host}/" />
  <meta name="twitter:title" content="${reseller.title}" />
  <meta name="twitter:description" content="${reseller.description}" />
  <meta name="twitter:image" content="${reseller.image}" />
</head>
<body>
  <script>window.location.replace('/');</script>
  <noscript><meta http-equiv="refresh" content="0;url=/"></noscript>
</body>
</html>`;
}

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';
  const userAgent = request.headers.get('user-agent') || '';

  // Solo procesar la ruta raíz
  if (url.pathname !== '/') {
    return next();
  }

  // Verificar si es un dominio de reseller
  const reseller = RESELLERS[host.toLowerCase()];

  if (!reseller) {
    return next();
  }

  // Solo servir HTML especial a bots de redes sociales
  if (isSocialBot(userAgent)) {
    const html = generateHTML(reseller, host);
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }

  return next();
}

export const config = {
  matcher: '/'
};
