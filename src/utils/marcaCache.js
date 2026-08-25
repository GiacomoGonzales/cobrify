/**
 * Memoria local de la marca por dominio + escala de color derivada.
 *
 * Dos problemas que resuelve:
 *
 * 1. Resolver la marca exige leer Firestore; en el arranque frío no se sabe
 *    de quién es el dominio. Aquí se recuerda la última marca resuelta (por
 *    hostname) para pintarla al instante — la leen el splash del
 *    BrandingContext, el del MainLayout y el script inline de index.html.
 *
 * 2. La escala `primary` de Tailwind era azul FIJO: solo se veía la marca
 *    donde alguien la cableaba inline (el Button de ui/). El POS, la franja
 *    del status bar y ~2.500 usos de primary-* quedaban azules. Ahora la
 *    escala lee variables CSS (--primary-N como tripletas RGB) y
 *    `aplicarEscalaPrimary` las genera desde el color del reseller: TODA la
 *    app adopta su color sin tocar el markup.
 */

export const llaveMarcaCache = () =>
  'marcaCache:' + window.location.hostname.toLowerCase()

export function leerMarcaCache() {
  try {
    const raw = localStorage.getItem(llaveMarcaCache())
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function guardarMarcaCache(b) {
  try {
    localStorage.setItem(llaveMarcaCache(), JSON.stringify({
      companyName: b.companyName || '',
      logoUrl: b.logoUrl || null,
      primaryColor: b.primaryColor || '#2563eb',
      secondaryColor: b.secondaryColor || null,
      accentColor: b.accentColor || null,
    }))
  } catch { /* almacenamiento bloqueado: el splash cae al neutro */ }
}

// ---------- escala de color ----------

const hexARgb = (hex) => {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const mezclar = (rgb, destino, factor) =>
  rgb.map((c, i) => Math.round(c + (destino[i] - c) * factor))

/**
 * Deriva la escala 50..950 desde el color base (que ocupa el 600, igual que
 * el azul de Cobrify ocupa el blue-600). Tintes con blanco hacia arriba,
 * sombras con negro hacia abajo, en proporciones calcadas de la relación
 * entre los pasos del azul de Tailwind.
 */
export function escalaDesdeColor(hex) {
  const base = hexARgb(hex)
  if (!base) return null
  const B = [255, 255, 255]
  const N = [0, 0, 0]
  return {
    50: mezclar(base, B, 0.95),
    100: mezclar(base, B, 0.88),
    200: mezclar(base, B, 0.76),
    300: mezclar(base, B, 0.60),
    400: mezclar(base, B, 0.38),
    500: mezclar(base, B, 0.16),
    600: base,
    700: mezclar(base, N, 0.18),
    800: mezclar(base, N, 0.35),
    900: mezclar(base, N, 0.50),
    950: mezclar(base, N, 0.66),
  }
}

/**
 * Pinta la escala en :root como tripletas RGB ("37 99 235"): es el formato
 * que Tailwind necesita para que los modificadores de opacidad
 * (bg-primary-600/20) sigan funcionando.
 */
export function aplicarEscalaPrimary(hex) {
  const escala = escalaDesdeColor(hex)
  if (!escala) return
  const root = document.documentElement
  for (const [paso, rgb] of Object.entries(escala)) {
    root.style.setProperty(`--primary-${paso}`, rgb.join(' '))
  }
}

/** Vuelve al azul por defecto (los valores del stylesheet). */
export function quitarEscalaPrimary() {
  const root = document.documentElement
  for (const paso of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
    root.style.removeProperty(`--primary-${paso}`)
  }
}
