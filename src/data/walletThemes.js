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

/**
 * EL SELLO: el icono que se estampa en los casilleros llenos de la cuadrícula.
 * Trazos a mano en una caja de 64x64, solo línea, pensados para leerse a
 * tamaño de casillero. `grosor` es el ancho de trazo con el que cada uno se ve
 * mejor (un corazón aguanta menos grosor que un check).
 *
 * El backend tiene su ESPEJO de esta tabla (walletAssetsService.js), keyed por
 * id — se pasa el id y no el trazo para que un documento de Firestore jamás
 * inyecte SVG arbitrario en el dibujador del servidor.
 */
export const SELLOS_TARJETA = [
  { id: 'check', nombre: 'Check', grosor: 5, trazo: '<path d="M19 33 l9 9 L45 23"/>' },
  { id: 'estrella', nombre: 'Estrella', grosor: 3.2, trazo: '<path d="M32 13 l6.2 12.6 13.8 2 -10 9.8 2.4 13.8 -12.4 -6.5 -12.4 6.5 2.4 -13.8 -10 -9.8 13.8 -2 Z"/>' },
  { id: 'corazon', nombre: 'Corazón', grosor: 3.2, trazo: '<path d="M32 49 C10 34 15 13 32 23 C49 13 54 34 32 49 Z"/>' },
  { id: 'taza', nombre: 'Taza', grosor: 3.2, trazo: '<path d="M16 26 h24 v10 a12 12 0 0 1 -24 0 z"/><path d="M40 28 h5 a6 6 0 0 1 0 12 h-4"/><path d="M23 12 q3 4 0 9 M31 12 q3 4 0 9"/>' },
  { id: 'pizza', nombre: 'Pizza', grosor: 3.2, trazo: '<path d="M14 18 L50 18 L32 52 Z"/><circle cx="27" cy="26" r="3"/><circle cx="38" cy="25" r="3"/><circle cx="32" cy="35" r="3"/>' },
  { id: 'hamburguesa', nombre: 'Hamburguesa', grosor: 3.2, trazo: '<path d="M15 27 a17 13 0 0 1 34 0 v1 H15 Z"/><path d="M14 34 h36"/><path d="M16 40 h32 v3 a5 5 0 0 1 -5 5 H21 a5 5 0 0 1 -5 -5 Z"/>' },
  { id: 'huella', nombre: 'Huella', grosor: 3.2, trazo: '<ellipse cx="32" cy="41" rx="10" ry="8"/><circle cx="18" cy="29" r="4.5"/><circle cx="27" cy="21" r="4.5"/><circle cx="37" cy="21" r="4.5"/><circle cx="46" cy="29" r="4.5"/>' },
  { id: 'tijeras', nombre: 'Tijeras', grosor: 3.2, trazo: '<circle cx="20" cy="42" r="6"/><circle cx="20" cy="22" r="6"/><path d="M25 25 L48 44 M25 39 L48 20"/>' },
  { id: 'cruz', nombre: 'Cruz', grosor: 3.2, trazo: '<path d="M26 14 h12 v12 h12 v12 H38 v12 H26 V38 H14 V26 h12 Z"/>' },
  { id: 'polo', nombre: 'Polo', grosor: 3, trazo: '<path d="M24 13 l-11 8 5 8 5 -3 v26 h18 V26 l5 3 5 -8 -11 -8 a8 5 0 0 1 -16 0 z"/>' },
]

export const SELLO_POR_DEFECTO = 'check'

export const getSello = (id) =>
  SELLOS_TARJETA.find(s => s.id === id) || SELLOS_TARJETA.find(s => s.id === SELLO_POR_DEFECTO)

export const getTheme = (id) =>
  WALLET_THEMES.find(t => t.id === id) || WALLET_THEMES.find(t => t.id === TEMA_POR_DEFECTO)

/**
 * Lo que se guarda en Firestore. El color puede venir pisado por el comercio
 * (elige el tema y luego le cambia el color), por eso va resuelto y no como
 * una referencia al tema.
 */
export const resolveTheme = ({ temaId, colorFondo, motivo, sello } = {}) => {
  const tema = getTheme(temaId)
  return {
    id: tema.id,
    colorFondo: colorFondo || tema.colorFondo,
    // La cuadrícula es el defecto: es la que hace visible el progreso. Un
    // valor viejo de los patrones eliminados también cae acá.
    motivo: esPortadaValida(motivo) ? motivo : 'cuadricula',
    // El icono de los casilleros llenos. Se guarda el ID, nunca el trazo.
    sello: getSello(sello).id,
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
export const celdasDeCuadricula = (sellos, meta, colorFondo, selloId) => {
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
  const esc = (lado / 64) * 0.66
  const off = (lado - 64 * esc) / 2
  const sello = getSello(selloId)
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
        celdas += `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${radio}" fill="none" stroke="${tinta}" stroke-width="3"/>`
        celdas += `<g transform="translate(${x + off} ${y + off}) scale(${esc.toFixed(3)})" fill="none" stroke="${tinta}" stroke-width="${sello.grosor}" stroke-linecap="round" stroke-linejoin="round">${sello.trazo}</g>`
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
