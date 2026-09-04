/**
 * TARJETA DE ORDEN — las clases y los colores.
 *
 * Los pedazos con JSX (cantidad, modificadores, nota, chip) están al lado, en
 * tarjetaOrden.jsx. Van en dos archivos porque Fast Refresh solo recarga en
 * caliente los archivos que exportan componentes y nada más; si las constantes
 * fueran en el mismo, cada edición recargaría la página entera en desarrollo.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Órdenes y Cocina muestran la misma orden a gente distinta —caja y cocina— y
 * tienen que verse iguales: misma cabecera, misma letra, mismos botones. Si
 * cada pantalla tuviera su copia, la primera vez que se agrande un botón en
 * una se olvidaría la otra.
 *
 * ── El estilo ───────────────────────────────────────────────────────────────
 * Pedido del usuario, con una pantalla de cocina (KDS) de referencia: la letra
 * era chica, los modificadores iban en una caja azul con letra diminuta y el
 * cuerpo entero se teñía del color del estado, así que todo se veía lavado.
 *
 *   - Esquinas rectas. Cuerpo blanco.
 *   - UNA banda de color en la cabecera, y es la única que lleva color según
 *     el estado. Número y tiempo grandes, que es lo que se mira desde lejos.
 *   - Cantidad en un cuadrado negro; nombre del plato a 16px en negrita.
 *   - Modificadores colgando del plato con un filete gris a la izquierda. Sin
 *     cajas de color ni el rótulo "MODIFICADORES:".
 *   - Botones altos y en negrita, para tocarlos sin mirar.
 *
 * Sin emojis: regla de la casa.
 */

/**
 * Zoom del tablero de tarjetas, y SOLO de las tarjetas.
 *
 * Al 100% la letra se lee pero entran pocas órdenes; al 70% (lo que tenían
 * las dos páginas enteras hasta septiembre) no se leía. El usuario comparó
 * 100% y 80% en pantalla y se quedó con 80%: legible y con una orden más por
 * fila. Va en el contenedor del grid, no en la página: la cabecera, la tira
 * de contadores y los filtros siguen al tamaño normal.
 */
export const ZOOM_TARJETAS = 0.8

/** Botones de la orden (Iniciar Preparación, Marcar Entregada...). */
export const BOTON_ACCION = 'flex-1 min-h-[52px] text-base font-bold rounded-none'

/** Botones por plato (Iniciar, Marcar Listo): en una orden de ocho platos, a
 *  52px la tarjeta no cabría en pantalla. 44px es el mínimo para el dedo. */
export const BOTON_ITEM = 'flex-1 min-h-[44px] text-sm font-bold rounded-none'

/** Botones de icono sobre la banda (editar, imprimir). Heredan el color del
 *  texto de la banda. */
export const BOTON_CABECERA = 'w-9 h-9 flex items-center justify-center rounded-sm bg-black/5 hover:bg-black/10 text-current transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** Etiquetas sobre la banda (URGENTE, PAGADO, FACTURADO...): blancas con un
 *  filo gris, para que se despeguen del tono suave de la banda. */
export const ETIQUETA_CABECERA = 'inline-flex items-center gap-1 px-1.5 py-0.5 bg-white text-gray-900 text-xs font-bold rounded-sm ring-1 ring-black/10'

/** Recuadros blancos sobre la banda (número de mesa, tiempo en cocina). */
export const RECUADRO_CABECERA = 'bg-white rounded-sm ring-1 ring-black/10'

/** Estado de cada plato dentro de la orden (solo con itemStatusTracking). */
export const ESTADO_ITEM = {
  pending: { texto: 'Pendiente', chip: 'chip-aviso' },
  preparing: { texto: 'Preparando', chip: 'chip-info' },
  ready: { texto: 'Listo', chip: 'chip-ok' },
  delivered: { texto: 'Entregado', chip: 'chip-neutro' },
}

/**
 * El color de la banda según el estado de la orden.
 *
 * Tonos suaves con texto oscuro, no saturados con texto blanco: la primera
 * versión (ámbar 500, azul 600, violeta 600) se veía como cuatro bloques de
 * color gritando en la misma fila. Es la misma lógica de las etiquetas
 * `chip-*` de index.css: fondo claro del tono, texto oscuro del tono.
 */
export function bandaDeEstado(status) {
  switch (status) {
    case 'pending': return 'bg-amber-100 text-amber-900'
    case 'preparing': return 'bg-sky-100 text-sky-900'
    case 'ready': return 'bg-emerald-100 text-emerald-900'
    case 'dispatched': return 'bg-violet-100 text-violet-900'
    case 'delivered': return 'bg-gray-100 text-gray-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

/** Clases de la tarjeta. Urgente: borde rojo grueso. */
export function clasesDeTarjeta(esUrgente) {
  return `rounded-none shadow-sm ${esUrgente ? 'border-2 border-red-600' : 'border border-gray-300'}`
}

/** Clases de la banda de la cabecera. Urgente pisa al estado: rojo. */
export function clasesDeBanda(status, esUrgente) {
  return `px-4 py-3 border-b border-black/5 ${esUrgente ? 'bg-red-100 text-red-900' : bandaDeEstado(status)}`
}
