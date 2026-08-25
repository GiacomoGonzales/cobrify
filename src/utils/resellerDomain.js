/**
 * ¿La página se está viendo desde el dominio propio de un reseller?
 *
 * El criterio es por descarte: todo lo que no sea un host de Cobrify o de
 * desarrollo es el dominio de algún reseller. Estaba copiado en tres sitios
 * (index.html, BrandingContext y de ahí hacia abajo) y cada copia decidía por
 * su cuenta cuándo tapar la marca; con una sola definición, agregar un dominio
 * nuevo de Cobrify se hace en un lugar.
 *
 * Se usa para NO mostrarle a un cliente de reseller nada que diga Cobrify:
 * ni el logo de carga, ni el aviso de descargar la app, ni un enlace a la
 * ficha de Play Store.
 */
const HOSTS_PROPIOS = [
  'localhost',
  '127.0.0.1',
  'vercel.app',
  'firebaseapp.com',
  'web.app',
  'cobrifyperu.com',
  'cobrify.com',
]

export function esDominioReseller(hostname) {
  const host = String(
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  ).toLowerCase()
  if (!host) return false
  return !HOSTS_PROPIOS.some(d => host.includes(d))
}

export default esDominioReseller
