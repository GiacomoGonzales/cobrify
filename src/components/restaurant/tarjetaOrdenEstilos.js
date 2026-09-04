/**
 * TARJETA DE ORDEN — las clases y los colores.
 *
 * Los pedazos con JSX (cantidad, modificadores, nota, chip) están al lado, en
 * tarjetaOrden.jsx. Van en dos archivos porque Fast Refresh solo recarga en
 * caliente los archivos que exportan componentes y nada más.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Órdenes y Cocina muestran la misma orden a gente distinta —caja y cocina— y
 * tienen que verse iguales. Si cada pantalla tuviera su copia, la primera vez
 * que se agrande un botón en una se olvidaría la otra.
 *
 * ── El estilo, y cómo se llegó ──────────────────────────────────────────────
 * Primera versión: banda de color saturado con texto blanco, cuadrados negros
 * con la cantidad, línea negra gruesa sobre el total, esquinas a 90°. Un
 * usuario la encontró poco estética y el dueño coincidió: "ese amarillo se ve
 * feo", "no me gusta el número sobre un cuadrado negro", "esquinas un poquito
 * curvas". Lo que había en común era que todo gritaba en bloques.
 *
 * Ahora la tarjeta es tranquila y el estado se lee de dos maneras discretas:
 *   - un FILETE de color a la izquierda de la tarjeta (4px), y
 *   - una etiqueta chica con el nombre del estado, con la misma paleta
 *     `chip-*` de index.css que usa el resto del sistema.
 * La cabecera es gris muy suave e igual para todas. Nada negro con texto
 * blanco: las cajitas de cantidad y de mesa son grises claras con texto
 * oscuro. Esquinas de 8px en la tarjeta y de 6px en botones, chips y cajitas.
 *
 * Sin emojis: regla de la casa.
 */

/**
 * Zoom del tablero de tarjetas, y SOLO de las tarjetas.
 *
 * Al 100% la letra se lee pero entran pocas órdenes; al 70% (lo que tenían
 * las dos páginas enteras hasta septiembre) no se leía. El usuario comparó
 * 100% y 80% en pantalla y se quedó con 80%. Va en el contenedor del grid, no
 * en la página: la cabecera, la tira de contadores y los filtros siguen al
 * tamaño normal.
 */
export const ZOOM_TARJETAS = 0.8

/** Botones de la orden (Iniciar Preparación, Marcar Entregada...). */
export const BOTON_ACCION = 'flex-1 min-h-[48px] text-[15px] font-semibold rounded-md'

/** Botones por plato (Iniciar, Marcar Listo): en una orden de ocho platos, a
 *  48px la tarjeta no cabría en pantalla. 42px sigue siendo cómodo al dedo. */
export const BOTON_ITEM = 'flex-1 min-h-[42px] text-sm font-semibold rounded-md'

/** Botones de icono en la cabecera (editar, imprimir): grises, se marcan al
 *  pasar por encima. */
export const BOTON_CABECERA = 'w-9 h-9 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200/70 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** Etiquetas de la cabecera (estado, URGENTE, PAGADO, FACTURADO...). Se
 *  completan con una clase `chip-*` que pone el color. */
export const ETIQUETA_CABECERA = 'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md whitespace-nowrap'

/** Cajitas de la cabecera (número de mesa, tiempo en cocina). */
export const RECUADRO_CABECERA = 'bg-white border border-gray-200 rounded-md'

/** Cajita de la cantidad del plato y del número de mesa en el cuerpo. */
export const CAJITA = 'bg-gray-100 text-gray-900 rounded-md'

/** Estado de cada plato dentro de la orden (solo con itemStatusTracking). */
export const ESTADO_ITEM = {
  pending: { texto: 'Pendiente', chip: 'chip-aviso' },
  preparing: { texto: 'Preparando', chip: 'chip-info' },
  ready: { texto: 'Listo', chip: 'chip-ok' },
  delivered: { texto: 'Entregado', chip: 'chip-neutro' },
}

/**
 * El acento del estado de la orden: el filete de la izquierda y la etiqueta.
 * Un solo lugar para los dos, así nunca se desencuentran.
 */
export function acentoDeEstado(status) {
  switch (status) {
    case 'pending': return { filete: 'border-l-amber-400', chip: 'chip-aviso' }
    case 'preparing': return { filete: 'border-l-sky-500', chip: 'chip-info' }
    case 'ready': return { filete: 'border-l-emerald-500', chip: 'chip-ok' }
    case 'dispatched': return { filete: 'border-l-violet-500', chip: 'chip-morado' }
    case 'delivered': return { filete: 'border-l-gray-300', chip: 'chip-neutro' }
    default: return { filete: 'border-l-gray-300', chip: 'chip-neutro' }
  }
}

/** Clases de la tarjeta. Urgente pisa al estado: filete rojo. */
export function clasesDeTarjeta(status, esUrgente) {
  const filete = esUrgente ? 'border-l-red-500' : acentoDeEstado(status).filete
  return `rounded-lg shadow-sm border border-gray-200 border-l-4 ${filete}`
}

/** Clases de la cabecera: gris suave, o rosado si es urgente. */
export function clasesDeCabecera(esUrgente) {
  return `px-4 py-3 rounded-tr-lg border-b ${esUrgente ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-200'}`
}

/** La clase `chip-*` de la etiqueta del estado. */
export function chipDeEstado(status, esUrgente) {
  return esUrgente ? 'chip-error' : acentoDeEstado(status).chip
}
