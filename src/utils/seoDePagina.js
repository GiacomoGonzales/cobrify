/**
 * SEO DE UNA PÁGINA del catálogo, puesto desde la aplicación: título,
 * descripción, dirección canónica y las tarjetas de redes (Open Graph y
 * Twitter).
 *
 * El HTML que sirve Vercel es el de Cobrify para TODAS las páginas (es una
 * sola aplicación). Google, Bing y los buscadores modernos ejecutan el
 * JavaScript y se quedan con lo que se pone acá; a los bots de WhatsApp,
 * Facebook y compañía, que no lo ejecutan, les responden api/domain-meta y
 * api/catalog-meta con lo mismo. Pedido de CITEX (14-set-2026): que cada
 * página muestre su nombre y quede bien indexada.
 *
 * Al salir del catálogo (`restaurarSeoDePagina`) vuelven las etiquetas de
 * Cobrify, para que la app no quede con el título de una tienda.
 */

const escapar = (s) => String(s ?? '')

const buscar = (selector) => document.head.querySelector(selector)

const poner = (selector, crear, atributo, valor) => {
  let el = buscar(selector)
  if (!el) {
    el = crear()
    document.head.appendChild(el)
  }
  el.setAttribute(atributo, valor)
  return el
}

const metaPorNombre = (nombre) => () => {
  const m = document.createElement('meta')
  m.setAttribute('name', nombre)
  return m
}
const metaPorPropiedad = (propiedad) => () => {
  const m = document.createElement('meta')
  m.setAttribute('property', propiedad)
  return m
}

const ETIQUETAS = [
  ['meta[name="description"]', metaPorNombre('description'), 'content', 'descripcion'],
  ['meta[name="robots"]', metaPorNombre('robots'), 'content', 'robots'],
  ['meta[property="og:type"]', metaPorPropiedad('og:type'), 'content', 'tipo'],
  ['meta[property="og:site_name"]', metaPorPropiedad('og:site_name'), 'content', 'nombreDelSitio'],
  ['meta[property="og:title"]', metaPorPropiedad('og:title'), 'content', 'titulo'],
  ['meta[property="og:description"]', metaPorPropiedad('og:description'), 'content', 'descripcion'],
  ['meta[property="og:url"]', metaPorPropiedad('og:url'), 'content', 'url'],
  ['meta[property="og:image"]', metaPorPropiedad('og:image'), 'content', 'imagen'],
  ['meta[name="twitter:title"]', metaPorNombre('twitter:title'), 'content', 'titulo'],
  ['meta[name="twitter:description"]', metaPorNombre('twitter:description'), 'content', 'descripcion'],
  ['meta[name="twitter:image"]', metaPorNombre('twitter:image'), 'content', 'imagen'],
  ['link[rel="canonical"]', () => { const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l }, 'href', 'url'],
]

// Lo que había antes de la primera vez que se aplicó algo, para restaurarlo.
let original = null

const guardarOriginal = () => {
  if (original) return
  original = { titulo: document.title, etiquetas: {} }
  for (const [selector, , atributo] of ETIQUETAS) {
    const el = buscar(selector)
    original.etiquetas[selector] = el ? el.getAttribute(atributo) : null
  }
}

/**
 * @param {object} p
 * @param {string} p.titulo
 * @param {string} [p.descripcion]
 * @param {string} [p.url]        dirección canónica, absoluta
 * @param {string} [p.imagen]     imagen para la tarjeta al compartir, absoluta
 * @param {string} [p.tipo]       'website' (por defecto) o 'article'
 * @param {string} [p.nombreDelSitio]
 */
export function aplicarSeoDePagina({ titulo, descripcion = '', url = '', imagen = '', tipo = 'website', nombreDelSitio = '' }) {
  if (typeof document === 'undefined') return
  guardarOriginal()
  document.title = escapar(titulo)
  const valores = {
    titulo: escapar(titulo),
    descripcion: escapar(descripcion).slice(0, 300),
    url: escapar(url),
    imagen: escapar(imagen),
    tipo: escapar(tipo || 'website'),
    nombreDelSitio: escapar(nombreDelSitio),
    robots: 'index, follow',
  }
  for (const [selector, crear, atributo, clave] of ETIQUETAS) {
    const valor = valores[clave]
    if (!valor) {
      // Sin valor no se inventa una etiqueta vacía; si existía, se deja como estaba.
      continue
    }
    poner(selector, crear, atributo, valor)
  }
}

/** Vuelve a las etiquetas que tenía la página antes del catálogo. */
export function restaurarSeoDePagina() {
  if (typeof document === 'undefined' || !original) return
  document.title = original.titulo
  for (const [selector, , atributo] of ETIQUETAS) {
    const el = buscar(selector)
    if (!el) continue
    const valor = original.etiquetas[selector]
    if (valor === null) el.remove()
    else el.setAttribute(atributo, valor)
  }
}
