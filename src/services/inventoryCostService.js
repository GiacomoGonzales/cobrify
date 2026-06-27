import { db } from '@/lib/firebase'
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore'

/**
 * Recalcula el costo unitario de los productos a partir del HISTORIAL DE COMPRAS,
 * con precisión de 6 decimales: cost = Σ(dinero base) / Σ(cantidad base).
 *
 * Corrige el descuadre del "Costo de inventario" que aparecía porque el costo se
 * guardaba redondeado a 2 decimales y el inventario valúa como `stock × cost`
 * (el redondeo del unitario × la cantidad no daba el dinero real de la compra).
 *
 * - Respeta presentaciones (cantidad base = quantity × presentationFactor) y divisa
 *   (USD se convierte a PEN con el exchangeRate CONGELADO de cada compra).
 * - Las bonificaciones (unitPrice 0) suman cantidad con dinero 0 → bajan el promedio,
 *   igual que en el flujo de compra.
 * - Maneja variantes (matchea item.variantSku con variant.sku).
 * - Solo actualiza el campo `cost` (y `variants[].cost`). NO toca el stock.
 *
 * @returns {Promise<{success:boolean, updated:number, error?:string}>}
 */
export async function recalculateProductCostsFromPurchases(businessId, onProgress = null) {
  try {
    const [purchasesSnap, productsSnap] = await Promise.all([
      getDocs(collection(db, 'businesses', businessId, 'purchases')),
      getDocs(collection(db, 'businesses', businessId, 'products')),
    ])

    // Acumular dinero base + cantidad base por producto / variante.
    // key: productId (base) | `${productId}__${variantSku}` (variante)
    const acc = {}
    for (const pDoc of purchasesSnap.docs) {
      const p = pDoc.data()
      const rate = p.currency === 'USD' ? (Number(p.exchangeRate) || 1) : 1
      for (const item of (p.items || [])) {
        if (item.itemType === 'ingredient') continue // solo productos
        if (!item.productId) continue
        const factor = Number(item.presentationFactor) || 1
        const qtyBase = (parseFloat(item.quantity) || 0) * factor
        const moneyBase = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0) * rate
        const key = item.variantSku ? `${item.productId}__${item.variantSku}` : item.productId
        if (!acc[key]) acc[key] = { money: 0, qty: 0 }
        acc[key].money += moneyBase
        acc[key].qty += qtyBase
      }
    }

    const round6 = (x) => Math.round(x * 1e6) / 1e6
    const total = productsSnap.docs.length
    let processed = 0
    let updated = 0

    const batchSize = 400
    let currentBatch = writeBatch(db)
    let ops = 0
    const batches = []

    for (const prodDoc of productsSnap.docs) {
      const prod = prodDoc.data()

      // Los productos costeados por RECETA no se recalculan desde compras: manda la receta.
      if (prod.hasRecipe) {
        processed++
        if (onProgress) onProgress({ processed, total, percentage: Math.round((processed / total) * 100) })
        continue
      }

      const patch = {}

      // Costo base (productos sin variante)
      const baseAcc = acc[prodDoc.id]
      if (baseAcc && baseAcc.qty > 0) {
        const newCost = round6(baseAcc.money / baseAcc.qty)
        if (Math.abs(newCost - (Number(prod.cost) || 0)) > 1e-9) patch.cost = newCost
      }

      // Costo por variante
      if (Array.isArray(prod.variants) && prod.variants.length > 0) {
        let changed = false
        const newVariants = prod.variants.map(v => {
          const va = acc[`${prodDoc.id}__${v.sku}`]
          if (va && va.qty > 0) {
            const vc = round6(va.money / va.qty)
            if (Math.abs(vc - (Number(v.cost) || 0)) > 1e-9) { changed = true; return { ...v, cost: vc } }
          }
          return v
        })
        if (changed) patch.variants = newVariants
      }

      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date()
        currentBatch.update(doc(db, 'businesses', businessId, 'products', prodDoc.id), patch)
        ops++
        updated++
        if (ops >= batchSize) { batches.push(currentBatch); currentBatch = writeBatch(db); ops = 0 }
      }

      processed++
      if (onProgress) onProgress({ processed, total, percentage: Math.round((processed / total) * 100) })
    }

    if (ops > 0) batches.push(currentBatch)
    for (const b of batches) await b.commit()

    return { success: true, updated }
  } catch (error) {
    console.error('Error recalculando costos de productos:', error)
    return { success: false, updated: 0, error: error.message }
  }
}
