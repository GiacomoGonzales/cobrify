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

export const getTheme = (id) =>
  WALLET_THEMES.find(t => t.id === id) || WALLET_THEMES.find(t => t.id === TEMA_POR_DEFECTO)

/**
 * Lo que se guarda en Firestore. El color puede venir pisado por el comercio
 * (elige el tema y luego le cambia el color), por eso va resuelto y no como
 * una referencia al tema.
 */
export const resolveTheme = ({ temaId, colorFondo } = {}) => {
  const tema = getTheme(temaId)
  return {
    id: tema.id,
    colorFondo: colorFondo || tema.colorFondo,
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
