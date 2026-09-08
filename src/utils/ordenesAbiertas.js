import { esDeSucursal } from '@/utils/branchScope'

/**
 * QUÉ ES UNA ORDEN ABIERTA — el criterio, en un solo lugar.
 *
 * Órdenes lo tenía escrito dos veces (el filtro del demo y la consulta en
 * vivo) y Caja no lo tenía: al cerrar caja avisaba de las mesas ocupadas pero
 * no de un delivery o un pedido para llevar que seguía sin cobrar, y ese
 * dinero descuadra el conteo igual que una mesa (pedido de Giacomo, 8-set-2026).
 */
export const ESTADOS_ABIERTOS = ['pending', 'preparing', 'ready', 'dispatched']

export const esOrdenAbierta = (orden) => ESTADOS_ABIERTOS.includes(orden?.status)

export const TIPO_DE_ORDEN = { delivery: 'Delivery', takeaway: 'Para Llevar', counter: 'En Local', dine_in: 'Mesa' }

/** Sin tipo, o con uno desconocido, se asume para llevar: es lo que Órdenes hacía. */
export const etiquetaDeTipoDeOrden = (tipo) => TIPO_DE_ORDEN[tipo] || 'Para Llevar'

/**
 * Las órdenes que todavía hay que cobrar antes de contar la caja.
 *
 * - Abiertas (ESTADOS_ABIERTOS): una entregada o anulada ya no está en juego.
 * - Sin pagar: un delivery cobrado por adelantado no altera el esperado.
 * - Sin mesa propia: las de mesa ya salen en la lista de mesas ocupadas, y
 *   listarlas dos veces sumaría la misma cuenta dos veces.
 * - De la sede que se está cerrando, con el mismo criterio que las mesas
 *   (utils/branchScope: sin branchId es la Principal).
 */
export function ordenesSinCobrar(ordenes = [], { branchId = 'main' } = {}) {
  return (ordenes || []).filter((o) => {
    if (!esOrdenAbierta(o)) return false
    if (o.paid === true) return false
    if (o.orderType === 'dine_in' && (o.tableId || o.tableNumber)) return false
    return esDeSucursal(o, branchId || 'main')
  })
}

/** Cómo se muestra una orden en el aviso: "Delivery — Juan Perez" y su monto. */
export function filaDeOrden(o) {
  const quien = String(o?.customerName || '').trim() || (o?.orderNumber ? `#${o.orderNumber}` : '') || `#${String(o?.id || '').slice(-6)}`
  return {
    id: o?.id,
    titulo: `${etiquetaDeTipoDeOrden(o?.orderType)} — ${quien}`,
    detalle: String(o?.deliveryPersonName || o?.waiterName || '').trim(),
    monto: Number(o?.total) || 0,
  }
}
