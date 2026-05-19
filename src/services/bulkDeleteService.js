import { db } from '@/lib/firebase'
import { collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore'

/**
 * Servicio para eliminación masiva de datos
 * ADVERTENCIA: Estas operaciones son IRREVERSIBLES
 */

/**
 * Eliminar todos los documentos de una colección usando batches
 * @param {string} businessId - ID del negocio
 * @param {string} collectionName - Nombre de la colección
 * @param {function} onProgress - Callback para reportar progreso (opcional)
 * @returns {Promise<{success: boolean, deleted: number, error?: string}>}
 */
async function deleteCollection(businessId, collectionName, onProgress = null) {
  try {
    const collectionRef = collection(db, 'businesses', businessId, collectionName)
    const snapshot = await getDocs(collectionRef)

    if (snapshot.empty) {
      return { success: true, deleted: 0 }
    }

    const total = snapshot.docs.length
    let deleted = 0

    // Firestore permite máximo 500 operaciones por batch
    const batchSize = 400
    const batches = []
    let currentBatch = writeBatch(db)
    let operationsInBatch = 0

    for (const docSnapshot of snapshot.docs) {
      currentBatch.delete(doc(db, 'businesses', businessId, collectionName, docSnapshot.id))
      operationsInBatch++

      if (operationsInBatch >= batchSize) {
        batches.push(currentBatch)
        currentBatch = writeBatch(db)
        operationsInBatch = 0
      }
    }

    // Agregar el último batch si tiene operaciones
    if (operationsInBatch > 0) {
      batches.push(currentBatch)
    }

    // Ejecutar todos los batches
    for (let i = 0; i < batches.length; i++) {
      await batches[i].commit()
      deleted += (i === batches.length - 1) ? operationsInBatch : batchSize

      if (onProgress) {
        onProgress({
          deleted,
          total,
          percentage: Math.round((deleted / total) * 100)
        })
      }
    }

    return { success: true, deleted: total }
  } catch (error) {
    console.error(`Error deleting collection ${collectionName}:`, error)
    return { success: false, deleted: 0, error: error.message }
  }
}

/**
 * Eliminar todos los productos
 */
export async function deleteAllProducts(businessId, onProgress = null) {
  return deleteCollection(businessId, 'products', onProgress)
}

/**
 * Eliminar todos los clientes
 * Nota: También elimina subcolecciones de clientes (medicalHistory, vaccinations, etc.)
 */
export async function deleteAllCustomers(businessId, onProgress = null) {
  try {
    const customersRef = collection(db, 'businesses', businessId, 'customers')
    const snapshot = await getDocs(customersRef)

    if (snapshot.empty) {
      return { success: true, deleted: 0 }
    }

    const total = snapshot.docs.length
    let deleted = 0

    // Eliminar cada cliente y sus subcolecciones
    for (const customerDoc of snapshot.docs) {
      const customerId = customerDoc.id

      // Eliminar subcolecciones del cliente (veterinaria)
      const subCollections = ['medicalHistory', 'vaccinations', 'recurringServices']
      for (const subCol of subCollections) {
        try {
          const subColRef = collection(db, 'businesses', businessId, 'customers', customerId, subCol)
          const subColSnapshot = await getDocs(subColRef)
          for (const subDoc of subColSnapshot.docs) {
            await deleteDoc(doc(db, 'businesses', businessId, 'customers', customerId, subCol, subDoc.id))
          }
        } catch (e) {
          // Ignorar errores de subcolecciones que no existen
        }
      }

      // Eliminar el cliente
      await deleteDoc(doc(db, 'businesses', businessId, 'customers', customerId))
      deleted++

      if (onProgress) {
        onProgress({
          deleted,
          total,
          percentage: Math.round((deleted / total) * 100)
        })
      }
    }

    return { success: true, deleted }
  } catch (error) {
    console.error('Error deleting customers:', error)
    return { success: false, deleted: 0, error: error.message }
  }
}

/**
 * Eliminar todos los proveedores
 */
export async function deleteAllSuppliers(businessId, onProgress = null) {
  return deleteCollection(businessId, 'suppliers', onProgress)
}

/**
 * Eliminar todas las ventas/facturas
 */
export async function deleteAllInvoices(businessId, onProgress = null) {
  return deleteCollection(businessId, 'invoices', onProgress)
}

/**
 * Eliminar todas las compras
 */
export async function deleteAllPurchases(businessId, onProgress = null) {
  return deleteCollection(businessId, 'purchases', onProgress)
}

/**
 * Eliminar todos los movimientos de stock
 */
export async function deleteAllStockMovements(businessId, onProgress = null) {
  return deleteCollection(businessId, 'stockMovements', onProgress)
}

/**
 * Resetear el stock de todos los productos a cero (sin eliminar los productos)
 * - Pone stock = 0
 * - Resetea warehouseStocks[].stock = 0 (mantiene minStock y warehouseId)
 * - Vacía batches = []
 * - Limpia batchNumber y expirationDate raíz
 *
 * Útil para reinicializar inventario antes de re-importar desde Excel.
 */
export async function resetAllStock(businessId, onProgress = null) {
  try {
    const productsRef = collection(db, 'businesses', businessId, 'products')
    const snapshot = await getDocs(productsRef)

    if (snapshot.empty) {
      return { success: true, deleted: 0 }
    }

    const total = snapshot.docs.length
    let updated = 0

    const batchSize = 400
    let currentBatch = writeBatch(db)
    let operationsInBatch = 0
    const batches = []

    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data()

      // Resetear warehouseStocks manteniendo warehouseId y minStock
      const resetWarehouseStocks = Array.isArray(data.warehouseStocks)
        ? data.warehouseStocks.map(ws => ({
            ...ws,
            stock: 0,
          }))
        : []

      const updates = {
        stock: 0,
        warehouseStocks: resetWarehouseStocks,
        batches: [],
        batchNumber: null,
        expirationDate: null,
        updatedAt: new Date(),
      }

      currentBatch.update(
        doc(db, 'businesses', businessId, 'products', docSnapshot.id),
        updates
      )
      operationsInBatch++

      if (operationsInBatch >= batchSize) {
        batches.push({ batch: currentBatch, ops: operationsInBatch })
        currentBatch = writeBatch(db)
        operationsInBatch = 0
      }
    }

    if (operationsInBatch > 0) {
      batches.push({ batch: currentBatch, ops: operationsInBatch })
    }

    for (let i = 0; i < batches.length; i++) {
      await batches[i].batch.commit()
      updated += batches[i].ops

      if (onProgress) {
        onProgress({
          deleted: updated,
          total,
          percentage: Math.round((updated / total) * 100),
        })
      }
    }

    return { success: true, deleted: updated }
  } catch (error) {
    console.error('Error resetting stock:', error)
    return { success: false, deleted: 0, error: error.message }
  }
}

/**
 * Eliminar todas las guías de remisión
 */
export async function deleteAllDispatchGuides(businessId, onProgress = null) {
  return deleteCollection(businessId, 'dispatchGuides', onProgress)
}

/**
 * Eliminar todas las cotizaciones
 */
export async function deleteAllQuotations(businessId, onProgress = null) {
  return deleteCollection(businessId, 'quotations', onProgress)
}

/**
 * Contar documentos en una colección
 */
export async function countDocuments(businessId, collectionName) {
  try {
    const collectionRef = collection(db, 'businesses', businessId, collectionName)
    const snapshot = await getDocs(collectionRef)
    return snapshot.size
  } catch (error) {
    console.error(`Error counting ${collectionName}:`, error)
    return 0
  }
}
