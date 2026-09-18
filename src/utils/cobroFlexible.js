/**
 * COBRO FLEXIBLE AL CONTADO — función especial por cuenta.
 *
 * Pedido de JMC GERENCIA Y CONSTRUCCION (18-set-2026). Emiten facturas al
 * contado de servicios que muchas veces el cliente ya pagó ANTES de facturar,
 * o que va a pagar unos días después. Pidieron dos cosas:
 *   - poder emitir al contado con 0.00 cobrado ("cancelado 0.00");
 *   - poner la fecha en que el cliente pagó, que no es la de la factura.
 *
 * Por eso es una función especial (Admin → Funciones especiales) y no algo de
 * todos: para SUNAT, un pago POSTERIOR a la emisión es Crédito (RS 193-2020,
 * Informe 092-2021-SUNAT/7T0000). Esto emite Contado igual, a pedido de ellos.
 *
 * Cómo queda la venta: sale a SUNAT como Contado, y en el sistema lleva lo que
 * de verdad se cobró. Lo cobrado va en `paymentHistory` con su fecha —el mismo
 * formato de "Registrar pago"—, y el resto queda POR COBRAR (paymentStatus
 * 'pending' o 'partial' + `balance`), así entra en Pagos Pendientes y se cobra
 * después con "Registrar pago" en Ventas. La caja lo cuenta el día del pago.
 *
 * Si se cobra todo y hoy, no cambia nada: la venta se guarda como siempre.
 */
import { toDateString } from './emissionDate'
import { fechaDePagoElegida } from './fechaDePago'

/** Clave de la función en Admin → Funciones especiales (`subscription.features`). */
export const FUNCION_COBRO_FLEXIBLE = 'cobroFlexible'

/** Tolerancia de medio centavo, la misma del POS al validar el cobro. */
const EPS = 0.005

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100

/** ¿Aplica en esta venta? Factura o boleta al contado, con la función encendida. */
export const aplicaCobroFlexible = ({ activa, documentType, paymentType }) =>
  !!activa && (documentType === 'factura' || documentType === 'boleta') && paymentType !== 'credito'

/**
 * Los campos de pago del comprobante cuando no se cobra "todo y hoy".
 *
 * @param {object} p
 * @param {number} p.total        lo que el cliente tiene que pagar (ya sin anticipos)
 * @param {Array}  p.pagos        los pagos del POS, ya recortados al total: [{ method, amount }]
 * @param {string} p.fechaDePago  'YYYY-MM-DD'; vacía = hoy
 * @param {{recordedBy: string, recordedByName: string}} p.quien
 * @param {Date}   [p.ahora]
 * @returns {object|null} null = venta normal, se guarda como siempre
 */
export function camposDeCobroFlexible({ total, pagos, fechaDePago, quien, ahora = new Date() }) {
  const cobrados = (pagos || []).filter((p) => (Number(p.amount) || 0) > 0)
  const pagado = redondear(cobrados.reduce((s, p) => s + Number(p.amount), 0))
  const saldo = Math.max(0, redondear(total - pagado))
  const otroDia = !!fechaDePago && fechaDePago !== toDateString(ahora)
  if (saldo <= EPS && !otroDia) return null

  const fecha = fechaDePagoElegida(fechaDePago, ahora)
  const paymentStatus = saldo <= EPS ? 'completed' : (pagado > 0 ? 'partial' : 'pending')
  return {
    cobroFlexible: true,
    paymentStatus,
    amountPaid: pagado,
    balance: saldo <= EPS ? 0 : saldo,
    status: paymentStatus === 'completed' ? 'paid' : 'pending',
    paymentHistory: cobrados.map((p) => ({
      amount: redondear(p.amount),
      date: fecha,
      method: p.method,
      recordedBy: quien?.recordedBy || '',
      recordedByName: quien?.recordedByName || 'Usuario',
    })),
    // Mismo sello que deja "Registrar pago": lo usa la caja para ubicar el cobro.
    ...(cobrados.length > 0 ? { lastPaymentDate: fecha } : {}),
    // Sin ningún cobro, el método es lo que se imprime en los tickets
    // ("Por cobrar: S/ 150.00"). El POS pondría "Crédito", que no lo es.
    ...(cobrados.length === 0 ? { paymentMethod: 'Por cobrar' } : {}),
  }
}

/**
 * Cómo se llama una venta que todavía no tiene ningún cobro. Una al crédito es
 * "Crédito"; una al contado del cobro flexible es "Por cobrar": decirle
 * "Crédito" contradiría la factura, que dice CONTADO.
 */
export const etiquetaSinCobro = (invoice) =>
  (invoice?.cobroFlexible && invoice?.paymentType !== 'credito' ? 'Por cobrar' : 'Crédito')
