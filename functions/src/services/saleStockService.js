// Descuento de stock de una venta en el SERVIDOR, en UNA sola transacción atómica.
//
// Por qué existe:
//   En el cliente, descontar el stock de una venta grande hacía N transacciones de Firestore
//   (una por producto), y con la latencia del navegador eso tardaba decenas de segundos.
//   Aquí, en Cloud Functions, la latencia a Firestore es ~0 y el Admin SDK permite leer TODOS
//   los productos de una sola vez (transaction.getAll) y escribir todo en una transacción.
//   Resultado: rápido Y atómico (sin condiciones de carrera entre cajas).
//
//   Espeja la lógica auditada del cliente (updateProductStockTransaction + FEFO de batchStock
//   + lógica de lotes/series del POS). Solo descuenta stock y registra movimientos; los insumos
//   (recetas) se siguen descontando en el cliente.

const normalizeBn = (s) => String(s || '').trim().toLowerCase()

const toDateMs = (x) => {
  if (!x) return null
  try {
    if (typeof x.toDate === 'function') return x.toDate().getTime()
    return new Date(x).getTime()
  } catch {
    return null
  }
}

// FEFO: descuenta `qty` de los batches del producto, respetando el lote elegido (si lo hay) y
// cayendo a "lo más próximo a vencer" para el remanente. Muta y devuelve {updatedBatches, breakdown}.
function computeBatchDeduction(batchesInput, line, warehouseId, qty) {
  if (!Array.isArray(batchesInput) || batchesInput.length === 0) return null
  const updatedBatches = batchesInput.map((b) => ({ ...b }))
  const breakdown = []
  let remaining = qty

  const matchesWh = (b) => {
    if (!warehouseId) return true
    if (!b.warehouseId) return true
    return b.warehouseId === warehouseId
  }

  if (line.batchNumber) {
    const target = normalizeBn(line.batchNumber)
    const idx = updatedBatches.findIndex(
      (b) => normalizeBn(b.lotNumber || b.batchNumber) === target && matchesWh(b)
    )
    if (idx !== -1) {
      const take = Math.min(updatedBatches[idx].quantity || 0, remaining)
      updatedBatches[idx] = { ...updatedBatches[idx], quantity: (updatedBatches[idx].quantity || 0) - take }
      remaining -= take
      breakdown.push({
        lotNumber: line.batchNumber,
        quantity: take,
        expirationDate: updatedBatches[idx].expirationDate || updatedBatches[idx].expiryDate || null,
      })
    }
  }

  if (remaining > 0) {
    const fefo = updatedBatches
      .map((b, idx) => ({ b, idx }))
      .filter(({ b }) => matchesWh(b) && (b.quantity || 0) > 0)
      .sort((x, y) => {
        const ax = toDateMs(x.b.expirationDate || x.b.expiryDate)
        const ay = toDateMs(y.b.expirationDate || y.b.expiryDate)
        if (ax == null) return 1
        if (ay == null) return -1
        return ax - ay
      })
      .map(({ idx }) => idx)

    for (const i of fefo) {
      if (remaining <= 0) break
      const batch = updatedBatches[i]
      const take = Math.min(batch.quantity || 0, remaining)
      updatedBatches[i] = { ...batch, quantity: (batch.quantity || 0) - take }
      remaining -= take
      const lotNum = batch.lotNumber || batch.batchNumber || ''
      const ex = breakdown.find((b) => b.lotNumber === lotNum)
      if (ex) ex.quantity += take
      else breakdown.push({ lotNumber: lotNum, quantity: take, expirationDate: batch.expirationDate || batch.expiryDate || null })
    }
  }

  return { updatedBatches, breakdown }
}

function computeProductBatchMetadata(updatedBatches) {
  const active = updatedBatches.filter((b) => (b.quantity || 0) > 0 && (b.expirationDate || b.expiryDate))
  if (active.length === 0) return { expirationDate: null, batchNumber: null }
  active.sort((a, b) => (toDateMs(a.expirationDate || a.expiryDate) || 0) - (toDateMs(b.expirationDate || b.expiryDate) || 0))
  const nearest = active[0]
  return {
    expirationDate: nearest.expirationDate || nearest.expiryDate,
    batchNumber: nearest.batchNumber || nearest.lotNumber || null,
  }
}

// Aplica todas las líneas de UN producto sobre su data (copia), devuelve el objeto de update
// para transaction.update + el desglose de lotes por cartKey.
function applyProductDeductions(product, lines, allowNegative, FieldValue) {
  const hasVariants = product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0
  const variants = hasVariants
    ? product.variants.map((v) => ({ ...v, warehouseStocks: (v.warehouseStocks || []).map((ws) => ({ ...ws })) }))
    : null
  const warehouseStocks = (product.warehouseStocks || []).map((ws) => ({ ...ws }))
  let batches = Array.isArray(product.batches) ? product.batches.map((b) => ({ ...b })) : null
  let serials = Array.isArray(product.serials) ? product.serials.map((s) => ({ ...s })) : null
  let generalStock = product.stock || 0
  const usesWarehouses = warehouseStocks.length > 0
  let batchesTouched = false
  let serialsTouched = false
  const batchBreakdownByCartKey = {}

  for (const line of lines) {
    const qty = line.quantity
    const whId = line.warehouseId || null

    // SERIES
    if (line.serialNumber && serials && serials.length > 0) {
      serials = serials.map((s) =>
        s.serialNumber === line.serialNumber
          ? { ...s, status: 'sold', saleId: line.saleId || null, saleDate: line.saleDate ? new Date(line.saleDate) : null }
          : s
      )
      serialsTouched = true
    }

    // LOTES (FEFO) — solo sin variantes y no "sin lote"
    if (batches && batches.length > 0 && !hasVariants && !line.isNoLot) {
      const res = computeBatchDeduction(batches, line, whId, qty)
      if (res) {
        batches = res.updatedBatches
        batchesTouched = true
        if (res.breakdown.length && line.cartKey) batchBreakdownByCartKey[line.cartKey] = res.breakdown
      }
    }

    // STOCK
    if (hasVariants && line.variantSku) {
      const vIdx = variants.findIndex((v) => v.sku === line.variantSku)
      if (vIdx >= 0) {
        const vws = variants[vIdx].warehouseStocks
        const wsIdx = vws.findIndex((ws) => ws.warehouseId === whId)
        if (wsIdx >= 0) {
          const ns = (vws[wsIdx].stock || 0) - qty
          vws[wsIdx].stock = allowNegative ? ns : Math.max(0, ns)
        } else if (allowNegative) {
          vws.push({ warehouseId: whId, stock: -qty, minStock: 0 })
        }
      }
    } else if (!usesWarehouses) {
      generalStock = allowNegative ? generalStock - qty : Math.max(0, generalStock - qty)
    } else {
      const wsIdx = warehouseStocks.findIndex((ws) => ws.warehouseId === whId)
      if (wsIdx >= 0) {
        const ns = (warehouseStocks[wsIdx].stock || 0) - qty
        warehouseStocks[wsIdx].stock = allowNegative ? ns : Math.max(0, ns)
      } else if (allowNegative && whId) {
        warehouseStocks.push({ warehouseId: whId, stock: -qty, minStock: 0 })
      } else {
        let rem = qty
        for (let i = 0; i < warehouseStocks.length && rem > 0; i++) {
          const cur = warehouseStocks[i].stock || 0
          const d = Math.min(cur, rem)
          if (d > 0) { warehouseStocks[i].stock = cur - d; rem -= d }
        }
      }
    }
  }

  const updateData = { updatedAt: FieldValue.serverTimestamp() }
  if (hasVariants) {
    variants.forEach((v) => { v.stock = (v.warehouseStocks || []).reduce((s, ws) => s + (ws.stock || 0), 0) })
    const agg = {}
    variants.forEach((v) => (v.warehouseStocks || []).forEach((ws) => {
      if (!ws.warehouseId) return
      agg[ws.warehouseId] = (agg[ws.warehouseId] || 0) + (ws.stock || 0)
    }))
    const existing = product.warehouseStocks || []
    const productWs = []
    const seen = new Set()
    existing.forEach((ws) => {
      if (!ws.warehouseId) return
      seen.add(ws.warehouseId)
      productWs.push({ ...ws, stock: agg[ws.warehouseId] || 0 })
    })
    Object.entries(agg).forEach(([wid, st]) => {
      if (seen.has(wid)) return
      productWs.push({ warehouseId: wid, stock: st, minStock: 0 })
    })
    updateData.variants = variants
    updateData.warehouseStocks = productWs
    updateData.stock = variants.reduce((s, v) => s + (v.stock || 0), 0)
  } else {
    if (!usesWarehouses) {
      updateData.stock = generalStock
      updateData.warehouseStocks = []
    } else {
      updateData.warehouseStocks = warehouseStocks
      updateData.stock = warehouseStocks.reduce((s, ws) => s + (ws.stock || 0), 0)
    }
    if (batchesTouched) {
      updateData.batches = batches
      const meta = computeProductBatchMetadata(batches)
      updateData.batchNumber = meta.batchNumber
      updateData.expirationDate = meta.expirationDate
    }
  }
  if (serialsTouched) updateData.serials = serials

  return { updateData, batchBreakdownByCartKey }
}

/**
 * Descuenta el stock de una venta y registra los movimientos, todo en UNA transacción atómica.
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} FieldValue - FieldValue del Admin SDK (para serverTimestamp)
 * @param {object} payload - { businessId, warehouseId, invoiceId, invoiceNumber, documentType,
 *   userId, allowNegativeStock, items: [{ productId, name, quantity, variantSku, isNoLot,
 *   batchNumber, serialNumber, cartKey, presentationName, originalQty }] }
 * @returns {Promise<{ batchBreakdownByCartKey: object }>}
 */
export async function processSaleStock(db, FieldValue, payload) {
  const {
    businessId,
    warehouseId = '',
    invoiceId = '',
    invoiceNumber = '',
    documentType = 'nota_venta',
    userId = '',
    allowNegativeStock = false,
    items = [],
  } = payload

  if (!businessId) throw new Error('businessId requerido')
  const saleDate = Date.now()

  // Agrupar líneas por producto (cada producto se resuelve una sola vez)
  const linesByProduct = new Map()
  for (const it of items) {
    if (!it || !it.productId) continue
    const line = {
      quantity: Number(it.quantity) || 0,
      warehouseId,
      variantSku: it.variantSku || null,
      isNoLot: !!it.isNoLot,
      batchNumber: it.batchNumber || null,
      serialNumber: it.serialNumber || null,
      cartKey: it.cartKey || it.productId,
      saleId: invoiceId || null,
      saleDate,
    }
    if (!linesByProduct.has(it.productId)) linesByProduct.set(it.productId, [])
    linesByProduct.get(it.productId).push(line)
  }

  const productIds = [...linesByProduct.keys()]
  if (productIds.length === 0) return { batchBreakdownByCartKey: {} }

  const productsCol = db.collection('businesses').doc(businessId).collection('products')
  const movementsCol = db.collection('businesses').doc(businessId).collection('stockMovements')
  const productRefs = productIds.map((id) => productsCol.doc(id))

  const docTypeName = documentType === 'boleta' ? 'Boleta' : documentType === 'factura' ? 'Factura' : 'Nota de Venta'
  const batchBreakdownByCartKey = {}

  await db.runTransaction(async (tx) => {
    // 1 sola lectura de TODOS los productos (getAll = 1 round-trip server-local)
    const snaps = await tx.getAll(...productRefs)

    const productData = new Map()
    snaps.forEach((snap, i) => {
      if (snap.exists) productData.set(productIds[i], snap.data())
    })

    // Aplicar descuentos por producto + acumular movimientos
    const movementsToCreate = []
    for (const pid of productIds) {
      const data = productData.get(pid)
      if (!data) continue
      if (data.trackStock === false) continue

      const lines = linesByProduct.get(pid)
      const { updateData, batchBreakdownByCartKey: bb } = applyProductDeductions(data, lines, allowNegativeStock, FieldValue)
      Object.assign(batchBreakdownByCartKey, bb)
      tx.update(productsCol.doc(pid), updateData)

      // Un movimiento por línea (item original del carrito)
      for (const it of items) {
        if (it.productId !== pid) continue
        const qtyForMovement = Number(it.quantity) || 0
        const noteParts = [`Venta ${it.name || ''} - ${docTypeName} ${invoiceNumber || ''}`]
        if (it.batchNumber) noteParts.push(`Lote: ${it.batchNumber}`)
        if (it.isNoLot) noteParts.push('Sin lote')
        if (it.presentationName) noteParts.push(`${it.originalQty != null ? it.originalQty : ''} ${it.presentationName}`.trim())
        const mov = {
          productId: pid,
          productName: it.name || '',
          warehouseId,
          type: 'sale',
          quantity: -qtyForMovement,
          reason: 'Venta',
          referenceType: 'invoice',
          referenceId: invoiceId || '',
          referenceNumber: invoiceNumber || '',
          userId,
          notes: noteParts.join(' - '),
          createdAt: FieldValue.serverTimestamp(),
        }
        if (it.batchNumber) mov.batchNumber = it.batchNumber
        if (it.serialNumber) mov.serialNumber = it.serialNumber
        if (it.variantSku) mov.variantSku = it.variantSku
        movementsToCreate.push(mov)
      }
    }

    // Escribir los movimientos dentro de la misma transacción
    for (const mov of movementsToCreate) {
      tx.set(movementsCol.doc(), mov)
    }
  })

  return { batchBreakdownByCartKey }
}
