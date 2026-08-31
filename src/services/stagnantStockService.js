import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { diasEnStock, toDate } from '@/utils/purchaseDate'

/**
 * MERCADERÍA ESTANCADA — qué no se vende y cuánta plata hay parada ahí.
 *
 * ── Por qué se mira el LIBRO DE STOCK y no las ventas ────────────────────────
 * La pregunta es "¿esta mercadería se movió?", y quien responde eso es el
 * libro de movimientos, no el de ventas. Además pesa mucho menos: un
 * movimiento son ~900 bytes contra ~5.600 de un comprobante con sus ítems, y
 * en una cuenta grande esa diferencia es la que hace que el reporte abra.
 *
 * Si una venta no dejó movimiento, tampoco descontó stock — así que el
 * producto sigue mostrando esa mercadería y el reporte igual dice la verdad
 * sobre lo que hay en el depósito.
 *
 * ── Qué NO es ────────────────────────────────────────────────────────────────
 * No mide rentabilidad ni rotación fina. Responde una sola cosa: de lo que
 * tengo hoy en stock, qué no se vendió en los últimos X días y cuánto vale.
 */

/**
 * Última vez que se vendió cada producto, dentro de la ventana.
 *
 * @param {string} businessId
 * @param {Date} desde  desde cuándo mirar
 * @returns {Promise<{ok: boolean, ventas?: Map<string, Date>, error?: string}>}
 */
export const getLastSaleDates = async (businessId, desde) => {
  try {
    const ref = collection(db, 'businesses', businessId, 'stockMovements')
    const snap = await getDocs(query(ref, where('createdAt', '>=', desde), orderBy('createdAt', 'desc')))

    const ventas = new Map()
    snap.forEach(d => {
      const m = d.data()
      // 'sale' es la venta del POS. Se filtra acá y no en la consulta para no
      // exigir un índice compuesto más.
      if (m.type !== 'sale') return
      const id = m.productId
      if (!id) return
      const fecha = m.createdAt?.toDate ? m.createdAt.toDate() : null
      if (!fecha) return
      // La consulta viene ordenada de la más nueva a la más vieja, así que la
      // primera que se ve de cada producto ya es la última venta.
      if (!ventas.has(id)) ventas.set(id, fecha)
    })

    return { ok: true, ventas }
  } catch (error) {
    console.error('Error al leer movimientos para mercadería estancada:', error)
    return { ok: false, error: error.message }
  }
}

/** El stock real del producto: la suma por almacén, o el total si no hay desglose. */
const stockDe = (p) => {
  const ws = p.warehouseStocks || []
  if (ws.length > 0) return ws.reduce((s, w) => s + (Number(w.stock) || 0), 0)
  return Number(p.stock) || 0
}

/**
 * ¿Qué tan parado está UN producto? El criterio, en un solo lugar.
 *
 * Lo usan por igual el listado de Inventario (filtrar la lista por "sin vender
 * hace más de X") y el resumen del período: el mismo producto tiene que dar el
 * mismo número en las dos pantallas.
 *
 * @param {object} p            el producto
 * @param {Map}    ventas       productId → última venta (de getLastSaleDates)
 * @param {number} diasVentana  la ventana consultada, en días
 * @param {Date}   asOf         fecha de corte
 * @returns {object|null} null si el producto no entra al análisis (agotado o
 *                        sin control de stock)
 */
export const evaluarEstancamiento = (p, ventas, diasVentana, asOf = new Date()) => {
  // Sin stock no hay plata parada: un producto agotado no es mercadería
  // estancada, es justamente lo contrario.
  const stock = stockDe(p)
  if (stock <= 0) return null
  // Servicios y productos sin control de stock no ocupan depósito.
  if (p.trackStock === false) return null

  const ultima = ventas?.get(p.id) || null
  const costo = Number(p.cost) || 0

  // Cuánto lleva el producto EN EL SISTEMA. Antes de esa fecha no hay
  // registro de ventas de dónde agarrarse, así que nada puede llevar más
  // tiempo sin venderse que el que lleva existiendo: un producto creado hoy
  // no lleva 90 días sin vender, lleva cero.
  const creado = toDate(p.createdAt)
  const diasEnSistema = creado ? Math.max(0, Math.floor((asOf - creado) / 86400000)) : null

  // Solo se puede afirmar "no se vendió en 90 días" del producto que lleva
  // esos 90 días cargado. El más nuevo entra igual al análisis —su stock es
  // plata parada como cualquier otro— pero no se lo acusa de estancado.
  const esNuevo = diasEnSistema != null && diasEnSistema < diasVentana && !ultima

  const dias = ultima
    ? Math.floor((asOf - ultima) / 86400000)
    : (esNuevo ? diasEnSistema : null)

  return {
    id: p.id,
    nombre: p.name || '',
    sku: p.sku || p.code || '',
    stock,
    costo,
    valor: Math.round(stock * costo * 100) / 100,
    ultimaVenta: ultima,
    // null = no vendió NADA en la ventana consultada. Se muestra como
    // "más de N días" y no como un número inventado.
    diasSinVender: dias,
    // Estancado CONFIRMADO: lleva la ventana completa en el sistema y no
    // vendió nada. El producto recién cargado no cuenta acá.
    nuncaEnVentana: !ultima && !esNuevo,
    esNuevo,
    diasEnSistema,
    diasVentana,
    // Días desde la fecha de compra. Lo que no vendió en la ventana no tiene
    // fecha de venta de dónde agarrarse; ahí esto es la única pista de hace
    // cuánto está parado en el depósito.
    diasEnStock: diasEnStock(p, asOf),
  }
}

/** Los días de ventana entre dos fechas, como los cuenta este módulo. */
export const ventanaEnDias = (desde, asOf = new Date()) =>
  Math.max(1, Math.round((asOf - desde) / 86400000))

/**
 * El resumen de todo el catálogo, ordenado de lo más parado a lo que más rota.
 *
 * @param {Array} products    catálogo
 * @param {Map}   ventas      productId → última venta
 * @param {Date}  desde       inicio de la ventana consultada
 * @param {Date}  [asOf]      fecha de corte
 * @returns {{filas: Array, totalValor: number, totalItems: number}}
 */
export const buildStagnantReport = (products = [], ventas = new Map(), desde, asOf = new Date()) => {
  const diasVentana = ventanaEnDias(desde, asOf)
  const filas = []
  for (const p of products) {
    const fila = evaluarEstancamiento(p, ventas, diasVentana, asOf)
    if (fila) filas.push(fila)
  }

  // Lo más estancado primero, y entre iguales lo de mayor valor: es donde está
  // la plata que conviene mover.
  filas.sort((a, b) => {
    const da = a.diasSinVender == null ? Infinity : a.diasSinVender
    const db2 = b.diasSinVender == null ? Infinity : b.diasSinVender
    if (da !== db2) return db2 - da
    // Ambos sin venta en la ventana: desempata el que lleva más tiempo comprado.
    // El que no tiene fecha de compra no se adelanta a uno que sí la tiene.
    if (da === Infinity) {
      const ea = a.diasEnStock == null ? -1 : a.diasEnStock
      const eb = b.diasEnStock == null ? -1 : b.diasEnStock
      if (ea !== eb) return eb - ea
    }
    return b.valor - a.valor
  })

  return {
    filas,
    totalValor: Math.round(filas.reduce((s, f) => s + f.valor, 0) * 100) / 100,
    totalItems: filas.length,
  }
}
