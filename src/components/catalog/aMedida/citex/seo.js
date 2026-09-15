/**
 * SEO de cada página de citex.pe: título y descripción, los mismos que usa su
 * web (citex.com.pe). Lo lee la aplicación (utils/seoDePagina) y también las
 * funciones de Vercel que responden a los bots de WhatsApp y Facebook
 * (api/domain-meta y api/catalog-meta), así los dos dicen lo mismo. Por eso
 * este archivo es JavaScript puro, sin JSX ni alias de Vite.
 */
import { LEGALES } from './legales.js'

const NOMBRE = 'CITEX'

export const SEO_CITEX = {
  inicio: {
    titulo: 'Inicio | CITEX - Polos por mayor y menor',
    descripcion: 'CITEX fabrica polos por mayor y menor en Gamarra, La Victoria. Compra polos de algodón, sublimación y personalizados con atención directa por WhatsApp y envíos a todo el Perú.',
  },
  tienda: {
    titulo: 'Tienda en línea | CITEX - Polos por mayor y menor',
    descripcion: 'Compra polos clásicos, oversize y para sublimación por mayor o menor. Precios directos de fábrica en Gamarra y envíos a todo el Perú.',
  },
  reclamos: {
    titulo: 'Libro de Reclamaciones | CITEX',
    descripcion: 'Registra tu reclamo o queja en el Libro de Reclamaciones de CITEX (GRUPO CREATIVO INDEPENDIENTE TEXTIL E.I.R.L.) y consulta su estado.',
  },
}

/**
 * @param {string} pagina 'inicio' | 'tienda' | 'reclamos' | 'legal/<pagina>'
 * @returns {{ titulo: string, descripcion: string, tipo?: string }}
 */
export function seoDePaginaCitex(pagina) {
  const p = String(pagina || 'inicio')
  if (p.startsWith('legal/')) {
    const legal = LEGALES[p.slice(6)]
    if (!legal) return { titulo: `Página no encontrada | ${NOMBRE}`, descripcion: SEO_CITEX.inicio.descripcion }
    return { titulo: `${legal.titulo} | ${NOMBRE}`, descripcion: legal.descripcion, tipo: 'article' }
  }
  return SEO_CITEX[p] || SEO_CITEX.inicio
}
