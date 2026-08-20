import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit as firestoreLimit,
  startAfter,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Inventario a una fecha pasada ("¿cuánto stock tenía yo el 31 de julio?").
 *
 * No guardamos fotos del inventario, así que la única forma de responder es
 * caminar el historial hacia atrás desde el stock de HOY:
 *
 *     stock_a_la_fecha = stock_de_hoy − (suma de movimientos posteriores)
 *
 * Esto funciona porque `quantity` viene SIEMPRE con signo en todos los tipos de
 * movimiento (venta y salida negativas, compra/entrada/devolución positivas, y
 * el ajuste guarda la diferencia con su signo), verificado sobre datos reales.
 *
 * LÍMITES HONESTOS de la reconstrucción — se reportan en el resultado para que
 * la pantalla los pueda mostrar en vez de fingir exactitud:
 *  - Solo es tan buena como el historial. Si a un producto le movieron el stock
 *    sin dejar movimiento (importaciones antiguas, ediciones directas), el
 *    número de esa fecha sale corrido.
 *  - Los movimientos de VENTA no registran la variante, así que un producto con
 *    variantes se puede reconstruir en total y por almacén, pero no variante por
 *    variante.
 *  - Los lotes y las series de esa fecha no se reconstruyen: se informa cantidad.
 *
 * OJO con el paginado: `getStockMovements` corta en 200 por página, y ese fue
 * exactamente el defecto que hizo que el viejo botón "Sincronizar movimientos"
 * descuadrara inventarios. Acá se recorre el historial COMPLETO en páginas
 * hasta agotarlo, y si se llega al tope duro se avisa (`truncado`) en vez de
 * devolver un número incompleto que parece bueno.
 */

const TAMANO_PAGINA = 500
// Tope duro: 60 mil movimientos son ~4 meses del negocio más activo. Si se
// alcanza, es preferible avisar que entregar una reconstrucción a medias.
const TOPE_MOVIMIENTOS = 60000

/** Fin del día elegido en hora local: el inventario es "al cierre" de esa fecha. */
const finDelDia = (fechaISO) => {
  const [y, m, d] = String(fechaISO).split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

const claveAlmacen = (itemId, warehouseId) => `${itemId}|${warehouseId || ''}`

/**
 * Suma los movimientos POSTERIORES a la fecha de corte.
 *
 * @returns {Object} { success, data: { corte, deltas, deltasAlmacen, movimientos, truncado } }
 *   deltas         Map itemId -> cantidad neta movida después del corte
 *   deltasAlmacen  Map "itemId|warehouseId" -> lo mismo, por almacén
 */
export const buildStockSnapshot = async (businessId, fechaISO) => {
  try {
    if (!businessId) return { success: false, error: 'Falta el negocio' }
    if (!fechaISO) return { success: false, error: 'Falta la fecha del inventario' }

    const corte = finDelDia(fechaISO)
    if (Number.isNaN(corte.getTime())) return { success: false, error: 'Fecha inválida' }
    if (corte > new Date()) {
      return { success: false, error: 'La fecha del inventario no puede ser futura' }
    }

    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
    const deltas = new Map()
    const deltasAlmacen = new Map()
    let movimientos = 0
    let truncado = false
    let cursor = null

    // Ascendente: el cursor avanza en el tiempo y no se salta nada aunque
    // entren movimientos nuevos mientras se lee.
    for (;;) {
      const restrictions = [
        where('createdAt', '>', Timestamp.fromDate(corte)),
        orderBy('createdAt', 'asc'),
        firestoreLimit(TAMANO_PAGINA),
      ]
      if (cursor) restrictions.push(startAfter(cursor))

      const snapshot = await getDocs(query(movementsRef, ...restrictions))
      if (snapshot.empty) break

      snapshot.forEach((docSnap) => {
        const m = docSnap.data()
        // Los movimientos de insumos usan ingredientId; los de producto, productId.
        const itemId = m.productId || m.ingredientId
        if (!itemId) return
        const cantidad = Number(m.quantity) || 0
        if (!cantidad) return
        deltas.set(itemId, (deltas.get(itemId) || 0) + cantidad)
        // Una transferencia suma en el destino y resta en el origen: cada lado
        // deja su propio movimiento, así que basta con leer warehouseId.
        const k = claveAlmacen(itemId, m.warehouseId)
        deltasAlmacen.set(k, (deltasAlmacen.get(k) || 0) + cantidad)
      })

      movimientos += snapshot.size
      cursor = snapshot.docs[snapshot.docs.length - 1]
      if (snapshot.size < TAMANO_PAGINA) break
      if (movimientos >= TOPE_MOVIMIENTOS) {
        truncado = true
        break
      }
    }

    return { success: true, data: { corte, deltas, deltasAlmacen, movimientos, truncado } }
  } catch (error) {
    console.error('Error al reconstruir el inventario a la fecha:', error)
    return { success: false, error: error.message }
  }
}

const stockActualDeItem = (item) => {
  if (item.itemType === 'ingredient' || item.currentStock !== undefined) {
    return Number(item.currentStock) || 0
  }
  if (item.hasVariants && Array.isArray(item.variants) && item.variants.length > 0) {
    return item.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0)
  }
  return Number(item.stock) || 0
}

const stockActualEnAlmacen = (item, warehouseId) => {
  if (item.hasVariants && Array.isArray(item.variants) && item.variants.length > 0) {
    return item.variants.reduce((s, v) => {
      const ws = (v.warehouseStocks || []).find(x => x.warehouseId === warehouseId)
      return s + (Number(ws?.stock) || 0)
    }, 0)
  }
  const ws = (item.warehouseStocks || []).find(x => x.warehouseId === warehouseId)
  return Number(ws?.stock) || 0
}

const fechaCreacion = (item) => {
  const c = item.createdAt
  if (!c) return null
  if (typeof c?.toDate === 'function') return c.toDate()
  const d = new Date(c)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Devuelve los items con el stock que tenían a la fecha, marcados con
 * `_snapshotStock` y `_snapshotWarehouseStocks` (el export los prefiere sobre
 * los campos vivos). Los items creados DESPUÉS del corte se excluyen: a esa
 * fecha no existían, y mostrarlos en cero solo ensucia el listado.
 *
 * @param {Array} items    productos o insumos tal como los tiene la pantalla
 * @param {Object} snapshot  data devuelta por buildStockSnapshot
 * @param {Array} warehouses almacenes a reconstruir por separado
 */
export const applyStockSnapshot = (items, snapshot, warehouses = []) => {
  const { corte, deltas, deltasAlmacen } = snapshot
  const resultado = []
  let excluidos = 0      // creados después de la fecha
  let negativos = 0      // el historial no alcanza: quedó por debajo de cero
  let conVariantes = 0   // reconstruidos solo a nivel total

  for (const item of items || []) {
    const creado = fechaCreacion(item)
    if (creado && creado > corte) {
      excluidos++
      continue
    }

    const delta = deltas.get(item.id) || 0
    const bruto = stockActualDeItem(item) - delta
    // Un negativo significa historial incompleto, no stock negativo real:
    // se corta en cero y se cuenta para poder avisarlo.
    const total = bruto < 0 ? 0 : bruto
    if (bruto < 0) negativos++

    const porAlmacen = (warehouses || []).map(w => {
      const d = deltasAlmacen.get(claveAlmacen(item.id, w.id)) || 0
      const v = stockActualEnAlmacen(item, w.id) - d
      return { warehouseId: w.id, stock: v < 0 ? 0 : v }
    })

    if (item.hasVariants && Array.isArray(item.variants) && item.variants.length > 0) {
      conVariantes++
    }

    resultado.push({
      ...item,
      _snapshotStock: total,
      _snapshotWarehouseStocks: porAlmacen,
    })
  }

  return { items: resultado, excluidos, negativos, conVariantes }
}
