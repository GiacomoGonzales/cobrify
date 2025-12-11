import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio para gestión de almacenes y movimientos de stock
 */

// Helper para detectar modo demo
const isDemoMode = (businessId) => {
  return businessId === 'demo-user'
}

// Obtener datos de demo desde window (inyectados por DemoContext)
const getDemoData = () => {
  // Acceder a los datos de demo desde el contexto global
  if (typeof window !== 'undefined' && window.__DEMO_DATA__) {
    return window.__DEMO_DATA__
  }
  return null
}

// =====================================================
// WAREHOUSES (Almacenes)
// =====================================================

/**
 * Obtener todos los almacenes de un negocio
 */
export const getWarehouses = async (businessId) => {
  // Si es modo demo, retornar datos de demo
  if (isDemoMode(businessId)) {
    const demoData = getDemoData()
    if (demoData?.warehouses) {
      return { success: true, data: demoData.warehouses }
    }
  }

  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')
    const q = query(warehousesRef, orderBy('createdAt', 'asc'))
    const snapshot = await getDocs(q)

    const warehouses = []
    snapshot.forEach((doc) => {
      warehouses.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: warehouses }
  } catch (error) {
    console.error('Error al obtener almacenes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener un almacén específico
 */
export const getWarehouse = async (businessId, warehouseId) => {
  try {
    const warehouseRef = doc(db, 'businesses', businessId, 'warehouses', warehouseId)
    const warehouseSnap = await getDoc(warehouseRef)

    if (!warehouseSnap.exists()) {
      return { success: false, error: 'Almacén no encontrado' }
    }

    return { success: true, data: { id: warehouseSnap.id, ...warehouseSnap.data() } }
  } catch (error) {
    console.error('Error al obtener almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear un nuevo almacén
 */
export const createWarehouse = async (businessId, warehouseData) => {
  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')

    // Si es el primer almacén o se marca como default, actualizar otros
    if (warehouseData.isDefault) {
      await unsetDefaultWarehouses(businessId)
    }

    const newWarehouse = {
      ...warehouseData,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(warehousesRef, newWarehouse)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un almacén
 */
export const updateWarehouse = async (businessId, warehouseId, warehouseData) => {
  try {
    const warehouseRef = doc(db, 'businesses', businessId, 'warehouses', warehouseId)

    // Si se marca como default, quitar default de otros
    if (warehouseData.isDefault) {
      await unsetDefaultWarehouses(businessId, warehouseId)
    }

    await updateDoc(warehouseRef, {
      ...warehouseData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un almacén (solo si no tiene stock)
 */
export const deleteWarehouse = async (businessId, warehouseId) => {
  try {
    // Verificar que no tenga productos con stock en este almacén
    const productsRef = collection(db, 'businesses', businessId, 'products')
    const productsSnapshot = await getDocs(productsRef)

    const productsWithStock = []
    productsSnapshot.forEach((doc) => {
      const product = doc.data()
      const warehouseStocks = product.warehouseStocks || []
      const stockInWarehouse = warehouseStocks.find(ws => ws.warehouseId === warehouseId)

      if (stockInWarehouse && stockInWarehouse.stock > 0) {
        productsWithStock.push({
          id: doc.id,
          name: product.name,
          stock: stockInWarehouse.stock
        })
      }
    })

    // Si hay productos con stock, no permitir eliminar
    if (productsWithStock.length > 0) {
      return {
        success: false,
        error: `No se puede eliminar el almacén porque tiene ${productsWithStock.length} producto(s) con stock. Transfiere el stock a otro almacén primero.`,
        productsWithStock
      }
    }

    const warehouseRef = doc(db, 'businesses', businessId, 'warehouses', warehouseId)
    await deleteDoc(warehouseRef)

    return { success: true }
  } catch (error) {
    console.error('Error al eliminar almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Quitar isDefault de todos los almacenes (helper interno)
 */
const unsetDefaultWarehouses = async (businessId, exceptId = null) => {
  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')
    const snapshot = await getDocs(warehousesRef)

    const batch = writeBatch(db)
    snapshot.forEach((doc) => {
      if (doc.id !== exceptId && doc.data().isDefault === true) {
        batch.update(doc.ref, { isDefault: false })
      }
    })

    await batch.commit()
  } catch (error) {
    console.error('Error al actualizar almacenes default:', error)
  }
}

/**
 * Obtener almacén por defecto
 */
export const getDefaultWarehouse = async (businessId) => {
  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')
    const snapshot = await getDocs(warehousesRef)

    let defaultWarehouse = null
    snapshot.forEach((doc) => {
      const data = doc.data()
      if (data.isDefault === true) {
        defaultWarehouse = { id: doc.id, ...data }
      }
    })

    // Si no hay default, retornar el primero
    if (!defaultWarehouse && !snapshot.empty) {
      const firstDoc = snapshot.docs[0]
      defaultWarehouse = { id: firstDoc.id, ...firstDoc.data() }
    }

    return { success: true, data: defaultWarehouse }
  } catch (error) {
    console.error('Error al obtener almacén default:', error)
    return { success: false, error: error.message }
  }
}

// =====================================================
// STOCK MOVEMENTS (Movimientos de Inventario)
// =====================================================

/**
 * Registrar un movimiento de stock
 */
export const createStockMovement = async (businessId, movementData) => {
  try {
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')

    const newMovement = {
      ...movementData,
      createdAt: serverTimestamp(),
    }

    const docRef = await addDoc(movementsRef, newMovement)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear movimiento de stock:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener movimientos de stock con filtros opcionales
 */
export const getStockMovements = async (businessId, filters = {}) => {
  try {
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
    let q = query(movementsRef, orderBy('createdAt', 'desc'))

    const snapshot = await getDocs(q)
    let movements = []

    snapshot.forEach((doc) => {
      movements.push({ id: doc.id, ...doc.data() })
    })

    // Filtrar en cliente si es necesario
    if (filters.warehouseId) {
      movements = movements.filter(
        (m) => m.warehouseId === filters.warehouseId || m.toWarehouse === filters.warehouseId
      )
    }
    if (filters.productId) {
      movements = movements.filter((m) => m.productId === filters.productId)
    }
    if (filters.type) {
      movements = movements.filter((m) => m.type === filters.type)
    }

    return { success: true, data: movements }
  } catch (error) {
    console.error('Error al obtener movimientos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear un movimiento de transferencia entre almacenes
 */
export const createTransfer = async (businessId, transferData) => {
  const {
    productId,
    variantSku,
    fromWarehouseId,
    toWarehouseId,
    quantity,
    userId,
    notes,
  } = transferData

  try {
    const movement = {
      productId,
      variantSku: variantSku || null,
      warehouseId: fromWarehouseId,
      type: 'transfer',
      quantity: -quantity, // Negativo porque sale del almacén origen
      reason: 'Transferencia',
      referenceType: 'transfer',
      fromWarehouse: fromWarehouseId,
      toWarehouse: toWarehouseId,
      userId,
      notes: notes || `Transferencia a ${toWarehouseId}`,
    }

    return await createStockMovement(businessId, movement)
  } catch (error) {
    console.error('Error al crear transferencia:', error)
    return { success: false, error: error.message }
  }
}

// =====================================================
// STOCK HELPERS (Funciones auxiliares para stock)
// =====================================================

/**
 * Calcular stock total desde warehouseStocks
 */
export const calculateTotalStock = (warehouseStocks) => {
  if (!warehouseStocks || warehouseStocks.length === 0) return 0
  return warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
}

/**
 * Actualizar stock de un producto en un almacén específico
 * @param {Object} product - Producto actual
 * @param {string} warehouseId - ID del almacén
 * @param {number} quantity - Cantidad a sumar/restar (positivo=entrada, negativo=salida)
 * @returns {Object} - Producto actualizado con nuevo warehouseStocks
 */
export const updateWarehouseStock = (product, warehouseId, quantity) => {
  // Si el producto no controla stock (trackStock === false o stock === null), no modificar nada
  if (product.trackStock === false || product.stock === null) {
    return product
  }

  const warehouseStocks = [...(product.warehouseStocks || [])]
  const currentGeneralStock = product.stock || 0

  // Si no hay almacenes configurados (warehouseStocks vacío), trabajar con stock general
  if (warehouseStocks.length === 0 && !warehouseId) {
    const newStock = Math.max(0, currentGeneralStock + quantity)
    return {
      ...product,
      stock: newStock,
      warehouseStocks: []
    }
  }

  // Buscar si ya existe entrada para este almacén
  const existingIndex = warehouseStocks.findIndex(ws => ws.warehouseId === warehouseId)

  if (existingIndex >= 0) {
    // Actualizar stock existente
    const newStock = (warehouseStocks[existingIndex].stock || 0) + quantity
    warehouseStocks[existingIndex] = {
      ...warehouseStocks[existingIndex],
      stock: Math.max(0, newStock) // No permitir negativos
    }
  } else if (quantity > 0) {
    // Crear nueva entrada (solo si es positivo)
    warehouseStocks.push({
      warehouseId,
      stock: quantity,
      minStock: 0
    })
  } else if (quantity < 0 && warehouseStocks.length === 0) {
    // Caso especial: descuento sin almacén configurado pero warehouseId proporcionado
    // Descontar del stock general
    const newStock = Math.max(0, currentGeneralStock + quantity)
    return {
      ...product,
      stock: newStock,
      warehouseStocks: []
    }
  }

  return {
    ...product,
    warehouseStocks,
    stock: calculateTotalStock(warehouseStocks)
  }
}

/**
 * Obtener stock de un producto en un almacén específico
 */
export const getStockInWarehouse = (product, warehouseId) => {
  if (!product.warehouseStocks) return product.stock || 0

  const warehouseStock = product.warehouseStocks.find(ws => ws.warehouseId === warehouseId)
  return warehouseStock?.stock || 0
}

/**
 * Inicializar warehouseStocks para productos existentes que solo tienen stock general
 * @param {Object} product - Producto actual
 * @param {string} defaultWarehouseId - ID del almacén por defecto
 * @returns {Object} - Producto con warehouseStocks inicializado
 */
export const initializeWarehouseStocks = (product, defaultWarehouseId) => {
  // Si ya tiene warehouseStocks, no hacer nada
  if (product.warehouseStocks && product.warehouseStocks.length > 0) {
    return product
  }

  // Si tiene stock general, moverlo al almacén por defecto
  if (product.stock && product.stock > 0 && defaultWarehouseId) {
    return {
      ...product,
      warehouseStocks: [{
        warehouseId: defaultWarehouseId,
        stock: product.stock,
        minStock: 0
      }]
    }
  }

  return product
}

/**
 * Detectar productos con stock huérfano
 * Incluye:
 * 1. Productos con stock > 0 pero warehouseStocks vacío o suma 0
 * 2. Productos con warehouseStocks apuntando a almacenes eliminados
 *
 * @param {Array} products - Lista de productos
 * @param {Array} activeWarehouses - Lista de almacenes activos (opcional)
 * @returns {Array} - Productos con stock huérfano
 */
export const getOrphanStockProducts = (products, activeWarehouses = null) => {
  if (!products || products.length === 0) return []

  const activeWarehouseIds = activeWarehouses ? activeWarehouses.map(w => w.id) : null

  return products.filter(product => {
    // Solo productos con control de stock activo
    if (product.stock === null || product.stock === undefined || product.stock <= 0) {
      return false
    }

    // Si no tiene trackStock habilitado, no aplica
    if (product.trackStock === false) {
      return false
    }

    // Calcular suma de warehouseStocks (solo de almacenes activos si tenemos la lista)
    let warehouseTotal = 0
    if (product.warehouseStocks && product.warehouseStocks.length > 0) {
      product.warehouseStocks.forEach(ws => {
        // Si tenemos lista de almacenes activos, solo contar los que existen
        if (activeWarehouseIds === null || activeWarehouseIds.includes(ws.warehouseId)) {
          warehouseTotal += ws.stock || 0
        }
      })
    }

    // Es huérfano si el stock general es mayor que la suma de almacenes activos
    return product.stock > warehouseTotal
  })
}

/**
 * Calcular el stock huérfano de un producto
 * Incluye stock en almacenes que ya no existen
 *
 * @param {Object} product - Producto
 * @param {Array} activeWarehouses - Lista de almacenes activos (opcional)
 * @returns {number} - Cantidad de stock huérfano
 */
export const getOrphanStock = (product, activeWarehouses = null) => {
  if (!product || product.stock === null || product.stock === undefined) {
    return 0
  }

  const activeWarehouseIds = activeWarehouses ? activeWarehouses.map(w => w.id) : null

  // Calcular stock solo en almacenes activos
  let activeWarehouseTotal = 0
  if (product.warehouseStocks && product.warehouseStocks.length > 0) {
    product.warehouseStocks.forEach(ws => {
      if (activeWarehouseIds === null || activeWarehouseIds.includes(ws.warehouseId)) {
        activeWarehouseTotal += ws.stock || 0
      }
    })
  }

  const orphanStock = product.stock - activeWarehouseTotal
  return orphanStock > 0 ? orphanStock : 0
}

/**
 * Obtener stock en almacenes eliminados de un producto
 * @param {Object} product - Producto
 * @param {Array} activeWarehouses - Lista de almacenes activos
 * @returns {Object} - { total: number, details: [{warehouseId, stock}] }
 */
export const getDeletedWarehouseStock = (product, activeWarehouses) => {
  if (!product || !product.warehouseStocks || !activeWarehouses) {
    return { total: 0, details: [] }
  }

  const activeWarehouseIds = activeWarehouses.map(w => w.id)
  const details = []
  let total = 0

  product.warehouseStocks.forEach(ws => {
    if (!activeWarehouseIds.includes(ws.warehouseId) && ws.stock > 0) {
      details.push({
        warehouseId: ws.warehouseId,
        stock: ws.stock
      })
      total += ws.stock
    }
  })

  return { total, details }
}

/**
 * Migrar stock huérfano de un producto a un almacén específico
 * También limpia referencias a almacenes eliminados
 *
 * @param {Object} product - Producto a migrar
 * @param {string} targetWarehouseId - ID del almacén destino
 * @param {Array} activeWarehouses - Lista de almacenes activos (para limpiar referencias eliminadas)
 * @returns {Object} - Producto actualizado con warehouseStocks limpios
 */
export const migrateOrphanStock = (product, targetWarehouseId, activeWarehouses = null) => {
  if (!product || !targetWarehouseId) return product

  const orphanStock = getOrphanStock(product, activeWarehouses)

  if (orphanStock <= 0) {
    return product
  }

  // Si tenemos lista de almacenes activos, filtrar solo los que existen
  let warehouseStocks = []
  if (activeWarehouses) {
    const activeWarehouseIds = activeWarehouses.map(w => w.id)
    // Mantener solo entradas de almacenes que aún existen
    warehouseStocks = (product.warehouseStocks || []).filter(ws =>
      activeWarehouseIds.includes(ws.warehouseId)
    )
  } else {
    warehouseStocks = product.warehouseStocks ? [...product.warehouseStocks] : []
  }

  // Buscar si ya existe entrada para el almacén destino
  const existingIndex = warehouseStocks.findIndex(ws => ws.warehouseId === targetWarehouseId)

  if (existingIndex >= 0) {
    // Sumar al stock existente del almacén
    warehouseStocks[existingIndex] = {
      ...warehouseStocks[existingIndex],
      stock: (warehouseStocks[existingIndex].stock || 0) + orphanStock
    }
  } else {
    // Crear nueva entrada para el almacén
    warehouseStocks.push({
      warehouseId: targetWarehouseId,
      stock: orphanStock,
      minStock: 0
    })
  }

  return {
    ...product,
    warehouseStocks
  }
}

/**
 * Obtener el stock total de un producto incluyendo stock huérfano
 * @param {Object} product - Producto
 * @param {string} warehouseId - ID del almacén (opcional, si no se pasa devuelve stock total)
 * @returns {number} - Stock del producto
 */
export const getTotalAvailableStock = (product, warehouseId = null) => {
  if (!product) return 0

  // Si no tiene control de stock, retornar Infinity (disponibilidad ilimitada)
  if (product.stock === null || product.trackStock === false) {
    return Infinity
  }

  // Si se especifica almacén, devolver stock de ese almacén + stock huérfano
  if (warehouseId) {
    const warehouseStock = getStockInWarehouse(product, warehouseId)
    const orphanStock = getOrphanStock(product)
    return warehouseStock + orphanStock
  }

  // Si no se especifica almacén, devolver stock total
  return product.stock || 0
}

// =====================================================
// INVENTORY COUNTS (Sesiones de Recuento)
// =====================================================

/**
 * Crear una sesión de recuento de inventario
 * @param {string} businessId - ID del negocio
 * @param {Object} countData - Datos del recuento
 * @returns {Object} - { success: boolean, id?: string, error?: string }
 */
/**
 * Sincronizar stock de todos los productos con sus warehouseStocks
 * Esto corrige la inconsistencia donde stock != suma de warehouseStocks
 *
 * @param {string} businessId - ID del negocio
 * @param {string} targetWarehouseId - ID del almacén donde asignar el stock huérfano
 * @returns {Object} - { success: boolean, synced: number, error?: string }
 */
export const syncAllProductsStock = async (businessId, targetWarehouseId) => {
  try {
    const productsRef = collection(db, 'businesses', businessId, 'products')
    const snapshot = await getDocs(productsRef)

    let syncedCount = 0
    let batchCount = 0
    let batch = writeBatch(db)
    const MAX_BATCH = 450 // Firestore limit is 500

    for (const docSnap of snapshot.docs) {
      const product = { id: docSnap.id, ...docSnap.data() }

      // Solo procesar productos con control de stock
      if (product.stock === null || product.stock === undefined || product.trackStock === false) {
        continue
      }

      const currentStock = product.stock || 0
      const warehouseStocks = product.warehouseStocks || []

      // Calcular suma actual de warehouseStocks
      const warehouseTotal = warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)

      // Si ya están sincronizados, saltar
      if (currentStock === warehouseTotal && warehouseStocks.length > 0) {
        continue
      }

      const productRef = doc(db, 'businesses', businessId, 'products', product.id)

      // CASO 1: Producto tiene warehouseStocks con datos
      // → El stock del almacén es el correcto, actualizar stock general
      if (warehouseStocks.length > 0 && warehouseTotal > 0) {
        batch.update(productRef, {
          stock: warehouseTotal,
          updatedAt: serverTimestamp()
        })
      }
      // CASO 2: Producto NO tiene warehouseStocks (huérfano)
      // → Asignar el stock general al almacén destino
      else if (warehouseStocks.length === 0 && currentStock > 0) {
        const newWarehouseStocks = [{
          warehouseId: targetWarehouseId,
          stock: currentStock,
          minStock: 0
        }]
        batch.update(productRef, {
          warehouseStocks: newWarehouseStocks,
          updatedAt: serverTimestamp()
        })
      }
      // CASO 3: warehouseStocks existe pero suma 0, y stock > 0
      // → El stock general es el correcto, asignar al almacén
      else if (warehouseStocks.length > 0 && warehouseTotal === 0 && currentStock > 0) {
        const newWarehouseStocks = [{
          warehouseId: targetWarehouseId,
          stock: currentStock,
          minStock: 0
        }]
        batch.update(productRef, {
          warehouseStocks: newWarehouseStocks,
          updatedAt: serverTimestamp()
        })
      }
      else {
        // No necesita cambios
        continue
      }

      syncedCount++
      batchCount++

      // Commit batch si llegamos al límite
      if (batchCount >= MAX_BATCH) {
        await batch.commit()
        batch = writeBatch(db) // Crear nuevo batch
        batchCount = 0
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit()
    }

    return { success: true, synced: syncedCount }
  } catch (error) {
    console.error('Error al sincronizar stock:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Recalcular stock general basándose en la suma de warehouseStocks
 * Útil cuando warehouseStocks es el valor correcto y stock general está desactualizado
 *
 * @param {string} businessId - ID del negocio
 * @returns {Object} - { success: boolean, updated: number, error?: string }
 */
export const recalculateStockFromWarehouses = async (businessId) => {
  try {
    const productsRef = collection(db, 'businesses', businessId, 'products')
    const snapshot = await getDocs(productsRef)

    let updatedCount = 0
    const batch = writeBatch(db)
    let batchCount = 0
    const MAX_BATCH = 450

    for (const docSnap of snapshot.docs) {
      const product = { id: docSnap.id, ...docSnap.data() }

      // Solo procesar productos con warehouseStocks
      if (!product.warehouseStocks || product.warehouseStocks.length === 0) {
        continue
      }

      if (product.trackStock === false) {
        continue
      }

      // Calcular suma de warehouseStocks
      const warehouseTotal = product.warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
      const currentStock = product.stock || 0

      // Si ya están sincronizados, saltar
      if (currentStock === warehouseTotal) {
        continue
      }

      // Actualizar stock general
      const productRef = doc(db, 'businesses', businessId, 'products', product.id)
      batch.update(productRef, {
        stock: warehouseTotal,
        updatedAt: serverTimestamp()
      })

      updatedCount++
      batchCount++

      if (batchCount >= MAX_BATCH) {
        await batch.commit()
        batchCount = 0
      }
    }

    if (batchCount > 0) {
      await batch.commit()
    }

    return { success: true, updated: updatedCount }
  } catch (error) {
    console.error('Error al recalcular stock:', error)
    return { success: false, error: error.message }
  }
}

export const createInventoryCount = async (businessId, countData) => {
  try {
    const countsRef = collection(db, 'businesses', businessId, 'inventoryCounts')

    const newCount = {
      ...countData,
      createdAt: serverTimestamp(),
    }

    const docRef = await addDoc(countsRef, newCount)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear sesión de recuento:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener historial de recuentos de inventario
 * @param {string} businessId - ID del negocio
 * @param {Object} filters - Filtros opcionales (dateFrom, dateTo)
 * @returns {Object} - { success: boolean, data?: Array, error?: string }
 */
export const getInventoryCounts = async (businessId, filters = {}) => {
  try {
    const countsRef = collection(db, 'businesses', businessId, 'inventoryCounts')
    const q = query(countsRef, orderBy('createdAt', 'desc'))

    const snapshot = await getDocs(q)
    let counts = []

    snapshot.forEach((doc) => {
      counts.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: counts }
  } catch (error) {
    console.error('Error al obtener recuentos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener un recuento específico por ID
 * @param {string} businessId - ID del negocio
 * @param {string} countId - ID del recuento
 * @returns {Object} - { success: boolean, data?: Object, error?: string }
 */
export const getInventoryCountById = async (businessId, countId) => {
  try {
    const countRef = doc(db, 'businesses', businessId, 'inventoryCounts', countId)
    const countSnap = await getDoc(countRef)

    if (!countSnap.exists()) {
      return { success: false, error: 'Recuento no encontrado' }
    }

    return { success: true, data: { id: countSnap.id, ...countSnap.data() } }
  } catch (error) {
    console.error('Error al obtener recuento:', error)
    return { success: false, error: error.message }
  }
}

export default {
  // Warehouses
  getWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  getDefaultWarehouse,
  // Stock Movements
  createStockMovement,
  getStockMovements,
  createTransfer,
  // Stock Helpers
  calculateTotalStock,
  updateWarehouseStock,
  getStockInWarehouse,
  initializeWarehouseStocks,
  // Orphan Stock Helpers
  getOrphanStockProducts,
  getOrphanStock,
  getDeletedWarehouseStock,
  migrateOrphanStock,
  // Stock Sync
  syncAllProductsStock,
  recalculateStockFromWarehouses,
  getTotalAvailableStock,
  // Inventory Counts
  createInventoryCount,
  getInventoryCounts,
  getInventoryCountById,
}
