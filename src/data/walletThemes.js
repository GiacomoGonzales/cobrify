/**
 * TEMAS DE LA TARJETA DE SELLOS (Google Wallet) — 15-ago-2026.
 *
 * ÚNICA FUENTE DE VERDAD. El comercio elige un tema acá, y el front guarda los
 * valores YA RESUELTOS en `loyaltyConfig.walletTheme`. El backend los CONSUME
 * tal cual; no tiene su propia copia de esta tabla ni recalcula nada.
 *
 * Es a propósito: `functions/` y `src/` son dos paquetes distintos y no pueden
 * importarse entre sí, así que la alternativa era duplicar la tabla en ambos
 * lados. Duplicada, el día que se toque un color acá la tarjeta del cliente
 * seguiría saliendo con el viejo y nadie entendería por qué.
 *
 * Si mañana se agrega un tema, el backend no necesita enterarse.
 */

/**
 * Los sellos se pueden mostrar de dos formas, y no es un capricho estético:
 *  - PUNTOS (●●●○○○○○○○) es la cartulina de toda la vida. El cliente ve cuánto
 *    le falta de un vistazo, sin leer. Es lo que hace que la tarjeta funcione.
 *  - NÚMERO ("3 de 10") se lee mejor cuando la meta es alta: 40 puntitos no se
 *    distinguen y se vuelven ruido.
 */
export const SELLO_LLENO = '●'
export const SELLO_VACIO = '○'

/** Sobre esta cantidad de sellos los puntos ya no se distinguen. */
export const MAX_SELLOS_EN_PUNTOS = 20

export const WALLET_THEMES = [
  {
    id: 'oscuro',
    nombre: 'Oscuro',
    descripcion: 'Fondo carbón. El que mejor hace resaltar un logo con color.',
    colorFondo: '#1e293b',
    sellosComoPuntos: true,
  },
  {
    id: 'clasico',
    nombre: 'Clásico',
    descripcion: 'Azul sobrio, el mismo del sistema. Sirve para cualquier rubro.',
    colorFondo: '#1e3a8a',
    sellosComoPuntos: true,
  },
  {
    id: 'calido',
    nombre: 'Cálido',
    descripcion: 'Terracota. Pensado para restaurantes, cafeterías y panaderías.',
    colorFondo: '#9a3412',
    sellosComoPuntos: true,
  },
  {
    id: 'minimal',
    nombre: 'Minimal',
    descripcion: 'Casi blanco y con el conteo en número, no en puntos.',
    colorFondo: '#f1f5f9',
    sellosComoPuntos: false,
  },
]

export const TEMA_POR_DEFECTO = 'oscuro'

/**
 * PORTADAS. El cuerpo de la tarjeta de Wallet solo admite color plano; el
 * diseño va en la franja de portada (heroImage). Tres opciones honestas:
 *
 *  - cuadricula: la cartulina dibujada con los sellos del CLIENTE, redibujada
 *    en cada compra. Con esta portada el contador pasa a número ("3 de 10"):
 *    la cuadrícula ES el marcador, mostrarlo también en puntos sería decirlo
 *    dos veces.
 *  - logo: el logo del negocio como franja (solo si es apaisado).
 *  - none: color plano, sin portada.
 *
 * Hubo patrones de iconos por rubro; se ELIMINARON — a la opacidad que exige
 * un fondo se veían como manchas, no como diseño.
 */
export const MOTIVOS_PORTADA = [
  { id: 'cuadricula', nombre: 'Cuadrícula de sellos' },
  { id: 'logo', nombre: 'Tu logo' },
  { id: 'none', nombre: 'Color plano' },
]

export const esPortadaValida = (id) => MOTIVOS_PORTADA.some(p => p.id === id)

export const getTheme = (id) =>
  WALLET_THEMES.find(t => t.id === id) || WALLET_THEMES.find(t => t.id === TEMA_POR_DEFECTO)

/**
 * Lo que se guarda en Firestore. El color puede venir pisado por el comercio
 * (elige el tema y luego le cambia el color), por eso va resuelto y no como
 * una referencia al tema.
 */
export const resolveTheme = ({ temaId, colorFondo, motivo } = {}) => {
  const tema = getTheme(temaId)
  return {
    id: tema.id,
    colorFondo: colorFondo || tema.colorFondo,
    // La cuadrícula es el defecto: es la que hace visible el progreso. Un
    // valor viejo de los patrones eliminados también cae acá.
    motivo: esPortadaValida(motivo) ? motivo : 'cuadricula',
    sellosComoPuntos: tema.sellosComoPuntos,
    // Los símbolos y el tope viajan CON el tema, no como constantes del
    // backend. Así `functions/` pinta la tarjeta sin conocer esta tabla: si
    // acá se cambia el símbolo del sello, la tarjeta del cliente lo refleja
    // sin tocar ni desplegar el servidor.
    selloLleno: SELLO_LLENO,
    selloVacio: SELLO_VACIO,
    maxSellosEnPuntos: MAX_SELLOS_EN_PUNTOS,
  }
}

/**
 * Texto del contador grande de la tarjeta.
 * Con puntos apagados —o con una meta tan alta que los puntos no se leerían—
 * cae al número.
 */
export const textoDeSellos = (sellos, meta, sellosComoPuntos) => {
  const s = Math.max(0, Number(sellos) || 0)
  const m = Math.max(1, Number(meta) || 10)
  if (!sellosComoPuntos || m > MAX_SELLOS_EN_PUNTOS) return `${s} de ${m}`
  // Pasada la meta (12 sellos con meta 10) no se pintan puntos de más: se
  // muestran los de la meta llenos y el excedente aparte, que es lo honesto.
  const llenos = Math.min(s, m)
  const puntos = SELLO_LLENO.repeat(llenos) + SELLO_VACIO.repeat(m - llenos)
  return s > m ? `${puntos}  +${s - m}` : puntos
}

/**
 * La CUADRÍCULA de sellos (estilo cartulina dibujada): casilleros llenos con
 * check, vacíos punteados y el último con el regalo. Espejo de la geometría
 * del servidor (`svgDeCuadricula` en walletAssetsService.js); esta pinta la
 * vista previa, aquella la portada real de cada cliente.
 *
 * Devuelve el interior de un SVG 1032x336, con colores propios por elemento.
 */
export const celdasDeCuadricula = (sellos, meta, colorFondo) => {
  const W = 1032, H = 336
  const tinta = esColorClaro(colorFondo) ? '#1f2937' : '#ffffff'
  const m = Math.max(1, Number(meta) || 10)
  const s = Math.max(0, Math.min(Number(sellos) || 0, m))
  const filas = m <= 5 ? 1 : 2
  const cols = Math.ceil(m / filas)
  const gap = 26
  const lado = Math.min(108,
    Math.floor((W - 160 - (cols - 1) * gap) / cols),
    Math.floor((H - 100 - (filas - 1) * gap) / filas))
  const radio = Math.round(lado * 0.22)
  const gh = filas * lado + (filas - 1) * gap
  const y0 = (H - gh) / 2
  const esc = (lado / 64) * 0.6
  const off = (lado - 64 * esc) / 2
  const CHECK = '<path d="M19 33 l9 9 L45 23"/>'
  const REGALO = '<rect x="14" y="28" width="36" height="22" rx="4"/><rect x="11" y="18" width="42" height="10" rx="3"/><path d="M32 18 v32 M32 18 q-5 -10 -12 -6 q-4 5 12 6 M32 18 q5 -10 12 -6 q4 5 -12 6"/>'

  let celdas = ''
  for (let f = 0; f < filas; f++) {
    const enFila = f === filas - 1 ? m - cols * f : cols
    const gw = enFila * lado + (enFila - 1) * gap
    const x0 = (W - gw) / 2
    for (let c = 0; c < enFila; c++) {
      const i = f * cols + c
      const x = x0 + c * (lado + gap)
      const y = y0 + f * (lado + gap)
      if (i < s) {
        celdas += `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${radio}" fill="${tinta}" fill-opacity="0.95"/>`
        celdas += `<g transform="translate(${x + off} ${y + off}) scale(${esc.toFixed(3)})" fill="none" stroke="${colorFondo}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round">${CHECK}</g>`
      } else {
        celdas += `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${radio}" fill="${tinta}" fill-opacity="0.07"/>`
        celdas += `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${radio}" fill="none" stroke="${tinta}" stroke-opacity="0.5" stroke-width="2.5" stroke-dasharray="8 7"/>`
        if (i === m - 1) {
          celdas += `<g transform="translate(${x + off} ${y + off}) scale(${esc.toFixed(3)})" fill="none" stroke="${tinta}" stroke-opacity="0.6" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${REGALO}</g>`
        }
      }
    }
  }
  return celdas
}

/** ¿El color de fondo es claro? Decide si la vista previa usa texto oscuro. */
export const esColorClaro = (hex) => {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  // Luminancia percibida: el ojo pesa mucho más el verde que el azul.
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160
}
