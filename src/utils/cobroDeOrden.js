/**
 * LO QUE EL POS NECESITA SABER PARA COBRAR UNA ORDEN.
 *
 * Desde Órdenes se puede cobrar por tres caminos —el botón Cobrar de la
 * tarjeta, Cerrar orden > con comprobante, y el cobro individual— y los tres
 * mandan al POS el mismo paquete de datos. Cada uno lo armaba a mano, y cada
 * vez que se agregaba un dato quedaba uno afuera:
 *
 *  - 3-set-2026: solo "Cerrar orden" mandaba el costo del ENVÍO, así que cobrar
 *    por el botón Cobrar —que es por donde se cobra normalmente— perdía el
 *    delivery (reporte de Edin Solano).
 *  - 6-set-2026: la MESA la mandaban dos de los tres. "Cerrar orden > con
 *    comprobante" no, así que el POS cobraba sin enterarse de qué mesa era y
 *    **la mesa quedaba ocupada para siempre**: el usuario iba a Mesas, tocaba
 *    Cerrar cuenta y le decía que ya estaba cobrada, pero seguía ocupada.
 *
 * Por eso acá va TODO lo que el POS necesita. Lo único propio de un camino es
 * el cobro parcial (`partialClose` + `remainingItems`), que solo existe en el
 * cobro individual.
 */
import { montoDeEnvio } from '@/utils/deliveryFee'

/**
 * Datos del cliente que el POS precarga para no re-teclearlos al emitir.
 *
 * `customerAddress` es la de ENTREGA (delivery) y NO va al comprobante; la
 * fiscal es `customerFiscalAddress` y es la que manda en una factura.
 */
export const datosDelCliente = (order = {}) => ({
  customerName: order.customerName || null,
  customerPhone: order.customerPhone || null,
  customerDocumentType: order.customerDocumentType || null,
  customerDocumentNumber: order.customerDocumentNumber || null,
  customerBusinessName: order.customerBusinessName || null,
  customerFiscalAddress: order.customerFiscalAddress || null,
  customerAddress: order.customerAddress || null,
})

/**
 * El paquete completo para navegar al POS.
 * Quien llama le agrega los `items` (que cambian según se cobre todo o parte).
 */
export const estadoParaCobrar = (order = {}) => ({
  fromOrder: true,
  orderId: order.id,
  orderNumber: order.orderNumber,
  orderType: order.orderType,
  markAsPaidOnComplete: true,
  // Sede de la orden: el POS fija sucursal+almacén (comprobante/serie/caja/stock correctos)
  branchId: order.branchId ?? null,
  // El costo del envío viaja APARTE de los items: el POS lo agrega como una
  // línea al final del carrito. Así se cobra sin que el cajero teclee un
  // precio, que es justo lo que estos negocios tienen apagado.
  deliveryFee: montoDeEnvio(order.deliveryFee),
  ...datosDelCliente(order),
  // Mesa y mozo: con esto el POS libera la mesa al completar el cobro.
  tableId: order.tableId || null,
  tableNumber: order.tableNumber || null,
  waiterId: order.waiterId || null,
  waiterName: order.waiterName || null,
})
