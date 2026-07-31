import { updateProductStockTransaction } from '@/services/firestoreService'
import { createStockMovement } from '@/services/warehouseService'

/**
 * Ajuste de inventario al EDITAR una venta ya emitida.
 *
 * La venta original ya descontó su stock. Al editar, lo único que corresponde
 * mover es la DIFERENCIA: si la nota decía 3 y ahora dice 5, se descuentan 2
 * más; si dice 1, se devuelven 2. Recalcular todo desde cero duplicaría
 * descuentos, y no ajustar nada —que era lo que pasaba— dejaba el inventario
 * con el descuento viejo y el documento con cantidades nuevas.
 *
 * La aplicación reutiliza `updateProductStockTransaction`, el mismo helper
 * transaccional que usa la anulación de ventas: maneja variantes, lotes
 * (batches frescos dentro de la transacción), series y la sincronización de
 * warehouseStocks. No se reimplementa nada de eso acá.
 */

const keyOf = (it) => [
  it.productId || it.id || '',
  it.variantSku || it.variantName || '',
  it.batchNumber || '',
  it.serialNumber || '',
].join('|')

const baseQty = (it) => (Number(it.quantity) || 0) * (Number(it.presentationFactor) || 1)

/**
 * Diferencias entre los ítems originales del comprobante y el carrito editado,
 * en unidades base y agrupadas por producto+variante+lote+serie.
 *
 * `delta` es cuánto CAMBIÓ lo vendido: positivo = se vende más (hay que
 * descontar stock), negativo = se vende menos (hay que devolver). Los ítems
 * idénticos en ambos lados se cancelan solos, así que las ventas viejas con
 * metadata incompleta no generan ajustes fantasma: la misma carencia está en
 * los dos lados de la resta.
 */
export const computeEditStockDeltas = (originalItems = [], newItems = []) => {
  const acc = new Map()

  const add = (it, sign) => {
    const productId = it.productId || it.id
    if (!productId || it.isCustom) return
    const k = keyOf(it)
    const prev = acc.get(k) || {
      productId,
      variantSku: it.variantSku || it.variantName || null,
      batchNumber: it.batchNumber || null,
      serialNumber: it.serialNumber || null,
      expirationDate: it.expirationDate || it.batchExpiryDate || null,
      name: it.name || '',
      delta: 0,
      originalBreakdown: [],
    }
    prev.delta += sign * baseQty(it)
    if (!prev.name && it.name) prev.name = it.name
    // El desglose FEFO de la venta original (un ítem sin lote explícito pudo
    // consumir varios lotes). Solo viene del lado original: es el registro de
    // QUÉ lotes se descontaron, y se necesita para devolverles a ellos.
    if (sign < 0 && Array.isArray(it.batchBreakdown)) {
      for (const bb of it.batchBreakdown) {
        const lot = bb.lotNumber || bb.batchNumber
        const qty = Number(bb.quantity) || 0
        if (!lot || qty <= 0) continue
        const ex = prev.originalBreakdown.find(x => x.lotNumber === lot)
        if (ex) ex.quantity += qty
        else prev.originalBreakdown.push({ lotNumber: lot, quantity: qty, expirationDate: bb.expirationDate || null })
      }
    }
    acc.set(k, prev)
  }

  originalItems.forEach(it => add(it, -1))
  newItems.forEach(it => add(it, +1))

  // Tolerancia por decimales (venta por peso): 0.0001 evita ajustes de 1e-15
  return [...acc.values()].filter(d => Math.abs(d.delta) > 0.0001)
}

/**
 * ¿Alcanza el stock para los aumentos? Se valida solo lo que SUBE: devolver
 * stock siempre es posible. Devuelve la lista de faltantes para mostrarla.
 */
export const validateEditStockIncreases = (deltas, products, warehouseId) => {
  const faltantes = []
  for (const d of deltas) {
    if (d.delta <= 0) continue
    const product = products.find(p => p.id === d.productId)
    // Producto borrado o sin control de stock: no hay nada que validar
    if (!product || product.trackStock === false || product.stock === null || product.stock === undefined) continue

    let disponible
    if (d.variantSku && product.hasVariants && product.variants?.length) {
      const v = product.variants.find(x => x.sku === d.variantSku)
      const ws = (v?.warehouseStocks || []).find(w => w.warehouseId === warehouseId)
      disponible = ws?.stock ?? v?.stock ?? 0
    } else if (d.batchNumber) {
      const norm = (s) => String(s || '').trim().toLowerCase()
      disponible = (product.batches || [])
        .filter(b => norm(b.lotNumber || b.batchNumber) === norm(d.batchNumber) &&
          (!b.warehouseId || !warehouseId || b.warehouseId === warehouseId))
        .reduce((s, b) => s + (Number(b.quantity) || 0), 0)
    } else if (warehouseId) {
      const ws = (product.warehouseStocks || []).find(w => w.warehouseId === warehouseId)
      disponible = ws?.stock ?? 0
    } else {
      disponible = product.stock || 0
    }

    if (d.delta > disponible) {
      faltantes.push({ name: d.name || product.name, adicional: d.delta, disponible })
    }
  }
  return faltantes
}

/**
 * Devuelve `cantidad` unidades a los lotes del desglose original, recorriéndolo
 * en orden inverso al consumo. Lo que no alcance a cubrir el desglose (ventas
 * viejas sin batchBreakdown) queda sin entrada de lote: se devuelve al stock
 * general como "sin lote", visible, en vez de inventar un lote destino.
 */
const restoreFromBreakdown = (breakdown = [], cantidad) => {
  const restores = []
  let restante = cantidad
  for (let i = breakdown.length - 1; i >= 0 && restante > 0.0001; i--) {
    const qty = Math.min(breakdown[i].quantity, restante)
    if (qty <= 0) continue
    restores.push({ lotNumber: breakdown[i].lotNumber, quantity: qty, expirationDate: breakdown[i].expirationDate || null })
    restante -= qty
  }
  return restores.length > 0 ? restores : null
}

/**
 * Elige de qué lotes descontar `cantidad` unidades adicionales, con el mismo
 * FEFO de la venta: primero el que vence antes, solo lotes del almacén (o sin
 * almacén, legacy). Se calcula sobre el snapshot local de productos — el mismo
 * origen que usa la venta con fallback en cliente — y el helper transaccional
 * aplica contra lotes frescos con piso en cero. Lo que exceda los lotes queda
 * como descuento "sin lote", igual que en la venta.
 */
const deductFefo = (product, warehouseId, cantidad) => {
  const fecha = (b) => {
    const raw = b.expirationDate || b.expiryDate
    return raw?.toDate?.() || new Date(raw || '2099-12-31')
  }
  const candidatos = (product.batches || [])
    .filter(b => (Number(b.quantity) || 0) > 0)
    .filter(b => !b.warehouseId || !warehouseId || b.warehouseId === warehouseId)
    .sort((a, b) => fecha(a) - fecha(b))

  const deducciones = []
  let restante = cantidad
  for (const b of candidatos) {
    if (restante <= 0.0001) break
    const qty = Math.min(Number(b.quantity) || 0, restante)
    if (qty <= 0) continue
    deducciones.push({
      lotNumber: b.lotNumber || b.batchNumber,
      quantity: -qty,
      expirationDate: b.expirationDate || b.expiryDate || null,
    })
    restante -= qty
  }
  return deducciones.length > 0 ? deducciones : null
}

/**
 * Aplica los deltas al inventario y deja un movimiento de ajuste por cada uno.
 *
 * Cada producto va en su propia transacción (estado fresco); si uno falla, los
 * demás siguen y el error se reporta por nombre — preferible a abortar todo y
 * dejar la mitad aplicada sin saber cuál.
 */
export const applyEditStockDeltas = async ({
  businessId, deltas, warehouseId, invoiceId, invoiceNumber, userId, userName, allowNegative = false,
  products = [],
}) => {
  const errores = []

  for (const d of deltas) {
    // Convención del helper: cantidad POSITIVA suma stock. Vender 2 más = -2.
    const stockChange = -d.delta
    try {
      // Serie: una unidad concreta. Si salió de la venta vuelve a 'available';
      // si entró, se marca vendida. (Las líneas con serie siempre son qty 1.)
      const serials = d.serialNumber
        ? [{ serialNumber: d.serialNumber, ...(d.delta < 0 ? { restore: true } : { saleDate: new Date().toISOString() }) }]
        : null

      let batchRestores = null
      if (d.batchNumber) {
        // Lote elegido explícitamente en la venta: el delta va contra ese lote.
        batchRestores = [{ lotNumber: d.batchNumber, quantity: stockChange, expirationDate: d.expirationDate || null }]
      } else {
        // Ítem sin lote explícito de un producto CON lotes: la venta original
        // descontó por FEFO (posiblemente de varios lotes) y lo registró en
        // batchBreakdown. Sin este bloque, el ajuste movería el stock total
        // pero no los lotes, y el detalle por lote quedaría descuadrado del total.
        const product = products.find(p => p.id === d.productId)
        if (product?.batches?.length > 0) {
          if (d.delta < 0) {
            // Se vende MENOS: devolver a los mismos lotes de los que salió, en
            // orden inverso al consumo (el FEFO gastó primero el que vencía
            // antes; lo que se des-vende vuelve al último lote consumido).
            batchRestores = restoreFromBreakdown(d.originalBreakdown, -d.delta)
          } else {
            // Se vende MÁS: descontar el adicional por FEFO de los lotes
            // actuales, igual que lo habría hecho la venta.
            batchRestores = deductFefo(product, warehouseId, d.delta)
          }
        }
      }

      await updateProductStockTransaction(
        businessId,
        d.productId,
        warehouseId,
        stockChange,
        {},
        d.variantSku,
        serials,
        allowNegative,
        batchRestores
      )

      await createStockMovement(businessId, {
        productId: d.productId,
        productName: d.name || '',
        warehouseId: warehouseId || null,
        type: 'adjustment',
        quantity: stockChange, // CON signo, igual que los ajustes manuales
        reason: 'Edición de venta',
        referenceType: 'sale_edit',
        referenceId: invoiceId,
        referenceNumber: invoiceNumber || '',
        userId,
        userName: userName || '',
        ...(d.variantSku && { variantSku: d.variantSku }),
        ...(d.batchNumber && { batchNumber: d.batchNumber }),
        notes: `Edición de ${invoiceNumber || 'venta'}: cantidad vendida ${d.delta > 0 ? 'subió' : 'bajó'} ${Math.abs(d.delta)} (stock ${stockChange > 0 ? '+' : ''}${stockChange})`,
      })
    } catch (e) {
      console.error(`Error ajustando stock de ${d.name || d.productId} al editar:`, e)
      errores.push(d.name || d.productId)
    }
  }

  return { success: errores.length === 0, errores }
}
