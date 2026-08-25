/**
 * Descuento de stock de una venta YA GUARDADA.
 *
 * Lo usan dos flujos que llegan al mismo punto por caminos distintos: el
 * sincronizador de ventas hechas sin conexión y la emisión masiva por Excel.
 * En ambos el comprobante ya existe en Firestore y hay que mover el inventario
 * como si lo hubiera vendido el POS.
 *
 * Vive acá y no dentro de uno de los dos porque el criterio de descuento
 * —lotes FEFO, series, variantes, presentaciones, productos sin control de
 * stock— no puede tener dos versiones.
 */
export async function descontarStockDeVentaGuardada({
  businessId, invoiceId, invoiceNumber, documentType, invoiceData, allowNegativeStock, userId,
}) {
  try {
    const items = (invoiceData?.items || [])
      // Los items personalizados (precio libre, sin producto) no mueven stock
      .filter(it => it && it.productId)
      .map((it, i) => ({
        productId: it.productId,
        name: it.name || '',
        // La presentación multiplica: vender 1 CAJA de 12 descuenta 12 unidades
        quantity: (Number(it.quantity) || 0) * (Number(it.presentationFactor) || 1),
        variantSku: it.variantSku || null,
        isNoLot: !!it.isNoLot,
        batchNumber: it.batchNumber || null,
        serialNumber: it.serialNumber || null,
        cartKey: `${it.productId}-${i}`,
        presentationName: it.presentationName || null,
        originalQty: Number(it.quantity) || 0,
      }))

    if (items.length === 0) return { ok: true, nothingToDeduct: true }

    const { httpsCallable } = await import('firebase/functions')
    const { functions } = await import('@/lib/firebase')
    const res = await httpsCallable(functions, 'processSaleStock')({
      businessId,
      warehouseId: invoiceData?.warehouseId || '',
      invoiceId: invoiceId || '',
      invoiceNumber: invoiceNumber || '',
      documentType,
      allowNegativeStock: !!allowNegativeStock,
      userId: userId || '',
      items,
    })

    // Desglose de lotes que asignó el servidor por FEFO: se guarda en el
    // comprobante igual que en una venta normal, si no la farmacia pierde de
    // qué lote salió cada unidad. Si falla, el stock ya se descontó bien.
    const breakdown = res?.data?.batchBreakdownByCartKey || {}
    if (Object.keys(breakdown).length > 0 && invoiceId) {
      try {
        const { doc, getDoc, updateDoc } = await import('firebase/firestore')
        const { db } = await import('@/lib/firebase')
        const ref = doc(db, 'businesses', businessId, 'invoices', invoiceId)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          const stored = snap.data().items || []
          const updated = stored.map((it, i) => {
            const b = breakdown[`${it.productId}-${i}`]
            return b ? { ...it, batchBreakdown: b } : it
          })
          await updateDoc(ref, { items: updated })
        }
      } catch (err) {
        console.error('Error al guardar el desglose de lotes:', err)
      }
    }

    return { ok: true }
  } catch (error) {
    console.error(`⚠️ No se pudo descontar el stock de ${invoiceNumber || invoiceId}:`, error)
    return { ok: false, error: error.message }
  }
}
