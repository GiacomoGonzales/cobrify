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
 * MOTIVOS DE LA PORTADA. El cuerpo de la tarjeta de Wallet solo admite color
 * plano; el diseño va en la franja de portada, que el SERVIDOR dibuja como
 * patrón de iconos del rubro con el logo compuesto al centro.
 *
 * Los trazos de acá son el ESPEJO de los de
 * `functions/src/services/walletAssetsService.js` (los dos paquetes no pueden
 * importarse entre sí): estos pintan la vista previa, aquellos la portada
 * real. Si se toca un icono, se toca en los dos lados.
 */
export const MOTIVOS_PORTADA = [
  { id: 'comida', nombre: 'Comida' },
  { id: 'moda', nombre: 'Moda' },
  { id: 'salud', nombre: 'Salud' },
  { id: 'puntos', nombre: 'Puntos' },
  { id: 'none', nombre: 'Color plano' },
]

export const ICONOS_MOTIVO = {
  comida: [
    '<path d="M16 26 h24 v10 a12 12 0 0 1 -24 0 z"/><path d="M40 28 h5 a6 6 0 0 1 0 12 h-4"/><path d="M23 12 q3 4 0 9 M31 12 q3 4 0 9"/>',
    '<path d="M14 18 L50 18 L32 52 Z"/><circle cx="27" cy="26" r="3"/><circle cx="38" cy="25" r="3"/><circle cx="32" cy="35" r="3"/>',
    '<path d="M20 12 v14 M26 12 v14 M23 26 v26 M20 26 a3 4 0 0 0 6 0"/><path d="M42 12 v40 M42 12 q9 12 1 22"/>',
  ],
  moda: [
    '<path d="M32 17 a5 5 0 1 1 5 -5 q0 3 -5 5 l0 4"/><path d="M32 21 L54 42 H10 Z"/>',
    '<path d="M24 13 l-11 8 5 8 5 -3 v26 h18 V26 l5 3 5 -8 -11 -8 a8 5 0 0 1 -16 0 z"/>',
    '<path d="M13 32 L33 12 h17 v17 L30 49 Z"/><circle cx="44" cy="18" r="3.5"/>',
  ],
  salud: [
    '<path d="M26 13 h12 v13 h13 v12 H38 v13 H26 V38 H13 V26 h13 Z"/>',
    '<path d="M16 48 Q14 16 48 15 Q50 46 16 48 Z"/><path d="M21 43 Q30 30 44 20"/>',
    '<path d="M32 49 C10 34 15 13 32 23 C49 13 54 34 32 49 Z"/>',
  ],
  puntos: [
    '<circle cx="32" cy="32" r="11"/>',
    '<circle cx="32" cy="32" r="4.5"/>',
    '<rect x="24" y="24" width="16" height="16" rx="2" transform="rotate(45 32 32)"/>',
  ],
}

/** El motivo que le toca a cada rubro cuando el comercio no eligió uno. */
export const motivoPorDefecto = (businessMode) => ({
  restaurant: 'comida', hotel: 'comida',
  pharmacy: 'salud', veterinary: 'salud',
}[businessMode] || 'puntos')

/**
 * Las celdas del patrón (misma grilla a tresbolillo que dibuja el servidor).
 * Devuelve el interior de un <g> listo para inyectar en un SVG 1032x336.
 */
export const celdasDeMotivo = (motivo) => {
  const iconos = ICONOS_MOTIVO[motivo]
  if (!iconos) return ''
  const celdas = []
  const paso = 118
  let n = 0
  for (let fila = -1; fila * paso < 336 + paso; fila++) {
    const corrimiento = (fila % 2) ? paso / 2 : 0
    for (let col = -1; col * paso < 1032 + paso; col++) {
      const icono = iconos[n % iconos.length]
      const giro = (n % 2 ? -1 : 1) * (8 + (n % 3) * 4)
      const escala = 0.85 + ((n * 7) % 10) / 30
      celdas.push(`<g transform="translate(${col * paso + corrimiento} ${fila * paso}) rotate(${giro} 32 32) scale(${escala.toFixed(2)})">${icono}</g>`)
      n++
    }
  }
  return celdas.join('')
}

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
    // null (no undefined: Firestore lo rechaza) = que el backend decida por
    // el rubro. 'none' = portada sin patrón, color plano.
    motivo: motivo || null,
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
