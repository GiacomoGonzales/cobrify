// Lógica compartida de descuento de stock por LOTE (batches[]) con FEFO.
//
// Por qué existe:
//   Varias operaciones que mueven stock (guías de remisión, salidas de almacén,
//   mermas/daños) deben mantener product.batches[] sincronizado con el stock total.
//   La lógica vivía solo en dispatchGuideStockService y otras secciones la omitían,
//   causando que product.stock bajara pero product.batches[].quantity quedara intacto
//   (descuadre entre stock total y detalle por lote). Centralizar evita que las
//   copias vuelvan a divergir.
//
//   computeBatchDeduction:  descuenta del lote elegido por el usuario (si lo hay) o
//                           aplica FEFO (lo más próximo a vencer primero) para el resto.
//   computeProductBatchMetadata: recalcula los campos rápidos batchNumber/expirationDate.

const normalizeBn = (s) => String(s || '').trim().toLowerCase()

// Calcula los lotes nuevos tras descontar `quantityToDeduct` del producto, respetando
// el lote seleccionado por el usuario (si lo hay) y cayendo a FEFO para el remanente.
// Devuelve { updatedBatches, batchBreakdown } o null si el producto no tiene batches.
export function computeBatchDeduction(productData, item, warehouseId, quantityToDeduct) {
  if (!productData.batches || productData.batches.length === 0) return null

  const updatedBatches = [...productData.batches]
  const batchBreakdown = []
  let remainingToDeduct = quantityToDeduct

  const batchMatchesWarehouse = (b) => {
    if (!warehouseId) return true
    if (!b.warehouseId) return true // legacy sin warehouseId: aceptar
    return b.warehouseId === warehouseId
  }

  // Si el usuario eligió lote explícito, descontar de ahí primero.
  if (item.batchNumber) {
    const itemBn = normalizeBn(item.batchNumber)
    const idx = updatedBatches.findIndex(b =>
      normalizeBn(b.lotNumber || b.batchNumber) === itemBn && batchMatchesWarehouse(b)
    )
    if (idx !== -1) {
      const deductFromBatch = Math.min(updatedBatches[idx].quantity, remainingToDeduct)
      updatedBatches[idx] = {
        ...updatedBatches[idx],
        quantity: updatedBatches[idx].quantity - deductFromBatch
      }
      remainingToDeduct -= deductFromBatch
      batchBreakdown.push({
        lotNumber: item.batchNumber,
        quantity: deductFromBatch,
        expirationDate: updatedBatches[idx].expirationDate || updatedBatches[idx].expiryDate || null,
      })
    } else {
      console.warn(
        `[batchStock] Lote "${item.batchNumber}" no encontrado para producto ${item.productId} ` +
        `en almacén ${warehouseId || '(ninguno)'}. Cayendo a FEFO.`
      )
    }
  }

  // Remanente (o si no se seleccionó lote): FEFO filtrado por almacén.
  if (remainingToDeduct > 0) {
    const fefoIndices = updatedBatches
      .map((b, idx) => ({ b, idx }))
      .filter(({ b }) => batchMatchesWarehouse(b) && (b.quantity || 0) > 0)
      .sort((x, y) => {
        const ax = x.b.expirationDate || x.b.expiryDate
        const ay = y.b.expirationDate || y.b.expiryDate
        if (!ax) return 1
        if (!ay) return -1
        const dateA = ax.toDate ? ax.toDate() : new Date(ax)
        const dateB = ay.toDate ? ay.toDate() : new Date(ay)
        return dateA - dateB
      })
      .map(({ idx }) => idx)

    for (const i of fefoIndices) {
      if (remainingToDeduct <= 0) break
      const batch = updatedBatches[i]
      const deductFromBatch = Math.min(batch.quantity, remainingToDeduct)
      updatedBatches[i] = { ...batch, quantity: batch.quantity - deductFromBatch }
      remainingToDeduct -= deductFromBatch
      const lotNum = batch.lotNumber || batch.batchNumber || ''
      const existing = batchBreakdown.find(b => b.lotNumber === lotNum)
      if (existing) {
        existing.quantity += deductFromBatch
      } else {
        batchBreakdown.push({
          lotNumber: lotNum,
          quantity: deductFromBatch,
          expirationDate: batch.expirationDate || batch.expiryDate || null,
        })
      }
    }
  }

  return { updatedBatches, batchBreakdown }
}

// Recalcula expirationDate y batchNumber "principales" del producto: el lote más cercano
// a vencer con stock disponible. Si no quedan lotes con stock, los limpia.
export function computeProductBatchMetadata(updatedBatches) {
  const active = updatedBatches.filter(b => b.quantity > 0 && (b.expirationDate || b.expiryDate))
  if (active.length === 0) {
    return { expirationDate: null, batchNumber: null }
  }
  active.sort((a, b) => {
    const ax = a.expirationDate || a.expiryDate
    const bx = b.expirationDate || b.expiryDate
    const dateA = ax.toDate ? ax.toDate() : new Date(ax)
    const dateB = bx.toDate ? bx.toDate() : new Date(bx)
    return dateA - dateB
  })
  const nearest = active[0]
  return {
    expirationDate: nearest.expirationDate || nearest.expiryDate,
    batchNumber: nearest.batchNumber || nearest.lotNumber || null,
  }
}
