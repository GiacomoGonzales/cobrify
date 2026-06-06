import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore'
import { createStockMovement } from '@/services/warehouseService'
import { updateProductStockTransaction } from '@/services/firestoreService'

/**
 * Servicio de Retornos a Almacén desde Obras/Proyectos
 * Colección: businesses/{businessId}/warehouseReturns
 */

export const getWarehouseReturns = async (businessId) => {
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'warehouseReturns'),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)
    const returns = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: returns }
  } catch (error) {
    console.error('Error al obtener retornos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear un retorno a almacén
 * @param {string} businessId
 * @param {Object} returnData
 * items: [{ productId, productName, productCode, quantity, unit, condition, conditionNotes }]
 * condition: 'good' | 'damaged' | 'lost'
 */
const getNextReturnNumber = async (businessId) => {
  const counterRef = doc(db, 'businesses', businessId, 'counters', 'warehouseReturns')
  const num = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef)
    const current = counterDoc.exists() ? (counterDoc.data().lastNumber || 0) : 0
    const next = current + 1
    transaction.set(counterRef, { lastNumber: next }, { merge: true })
    return next
  })
  return `RET-${String(num).padStart(5, '0')}`
}

export const createWarehouseReturn = async (businessId, returnData) => {
  try {
    const totalItems = returnData.items.reduce((sum, item) => sum + item.quantity, 0)
    const number = await getNextReturnNumber(businessId)
    const goodItems = returnData.items.filter(i => i.condition === 'good').reduce((s, i) => s + i.quantity, 0)
    const damagedItems = returnData.items.filter(i => i.condition === 'damaged').reduce((s, i) => s + i.quantity, 0)
    const lostItems = returnData.items.filter(i => i.condition === 'lost').reduce((s, i) => s + i.quantity, 0)

    const docRef = await addDoc(collection(db, 'businesses', businessId, 'warehouseReturns'), {
      ...returnData,
      number,
      totalItems,
      goodItems,
      damagedItems,
      lostItems,
      status: 'completed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // Devolver stock y crear movimiento (solo items en buen estado y dañados vuelven
    // al stock; los perdidos no)
    for (const item of returnData.items) {
      const isLost = item.condition === 'lost'
      const qty = Math.abs(item.quantity)

      // Series: marcar las seleccionadas (que estaban 'in_project') según la condición:
      // buen estado/dañado → 'available' (regresan al stock); perdido → 'lost'.
      let serialExtra = {}
      let serialNote = ''
      if (item.selectedSerials?.length > 0) {
        try {
          const prodSnap = await getDoc(doc(db, 'businesses', businessId, 'products', item.productId))
          if (prodSnap.exists() && Array.isArray(prodSnap.data().serials)) {
            const sel = new Set(item.selectedSerials)
            serialExtra.serials = prodSnap.data().serials.map(s => {
              if (sel.has(s.serialNumber) && s.status === 'in_project') {
                return isLost
                  ? { ...s, status: 'lost', lostReason: 'Retorno: perdido', lostDate: new Date() }
                  : { ...s, status: 'available', warehouseId: returnData.warehouseId, projectId: null, exitId: null }
              }
              return s
            })
            serialNote = ` | Series: ${item.selectedSerials.join(', ')}`
          }
        } catch (e) {
          console.warn('No se pudieron procesar series en retorno para', item.productId, e)
        }
      }

      // Perdidos: NO regresan al stock, pero sí actualizamos el estado de la serie a 'lost'
      if (isLost) {
        if (serialExtra.serials) {
          await updateProductStockTransaction(
            businessId, item.productId, returnData.warehouseId, 0, serialExtra, item.variantSku || null
          )
        }
        continue
      }

      // 1. Devolver el stock REAL (base + variante) + series a 'available'. Esto antes
      //    faltaba: el retorno solo registraba el movimiento y el stock nunca subía,
      //    por lo que los materiales devueltos quedaban fuera del inventario (descuadre).
      await updateProductStockTransaction(
        businessId,
        item.productId,
        returnData.warehouseId,
        qty, // positivo: regresa al stock
        serialExtra,
        item.variantSku || null
      )

      // 2. Movimiento para trazabilidad
      await createStockMovement(businessId, {
        productId: item.productId,
        variantSku: item.variantSku || null,
        ...(item.selectedSerials?.length > 0 && { serialNumbers: item.selectedSerials }),
        warehouseId: returnData.warehouseId,
        type: 'warehouse_return',
        quantity: qty,
        reason: `Retorno de obra: ${returnData.projectName} (${item.condition === 'good' ? 'buen estado' : 'dañado'})`,
        referenceType: 'warehouse_return',
        referenceId: docRef.id,
        userId: returnData.userId,
        notes: (item.conditionNotes || '') + serialNote,
      })
    }

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear retorno:', error)
    return { success: false, error: error.message }
  }
}
