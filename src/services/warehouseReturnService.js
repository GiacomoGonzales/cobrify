import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore'
import { createStockMovement } from '@/services/warehouseService'

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

    // Crear movimientos de stock (solo items en buen estado y dañados vuelven al stock, perdidos no)
    for (const item of returnData.items) {
      if (item.condition === 'lost') continue // Perdidos no regresan al stock

      await createStockMovement(businessId, {
        productId: item.productId,
        variantSku: item.variantSku || null,
        warehouseId: returnData.warehouseId,
        type: 'warehouse_return',
        quantity: Math.abs(item.quantity),
        reason: `Retorno de obra: ${returnData.projectName} (${item.condition === 'good' ? 'buen estado' : 'dañado'})`,
        referenceType: 'warehouse_return',
        referenceId: docRef.id,
        userId: returnData.userId,
        notes: item.conditionNotes || '',
      })
    }

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear retorno:', error)
    return { success: false, error: error.message }
  }
}
