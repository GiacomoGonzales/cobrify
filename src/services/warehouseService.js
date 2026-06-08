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
  where,
  limit as firestoreLimit,
  startAfter,
  serverTimestamp,
  Timestamp,
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
    const branchId = warehouseData.branchId || null

    // Si se marca como default, quitar default solo de almacenes de la misma sucursal
    if (warehouseData.isDefault) {
      await unsetDefaultWarehouses(businessId, null, branchId)
    } else {
      // Verificar si es el primer almacén de esta sucursal - hacerlo default automáticamente
      const snapshot = await getDocs(warehousesRef)
      const branchWarehouses = snapshot.docs.filter(doc => {
        const data = doc.data()
        const docBranchId = data.branchId || null
        return docBranchId === branchId && data.isActive !== false
      })
      if (branchWarehouses.length === 0) {
        warehouseData.isDefault = true
      }
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
    const branchId = warehouseData.branchId || null

    // Si se marca como default, quitar default solo de almacenes de la misma sucursal
    if (warehouseData.isDefault) {
      await unsetDefaultWarehouses(businessId, warehouseId, branchId)
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
 * Quitar isDefault de almacenes de la misma sucursal (helper interno)
 * @param {string} businessId - ID del negocio
 * @param {string|null} exceptId - ID del almacén a excluir (no quitarle el default)
 * @param {string|null} branchId - ID de la sucursal (null = sucursal principal)
 */
const unsetDefaultWarehouses = async (businessId, exceptId = null, branchId = null) => {
  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')
    const snapshot = await getDocs(warehousesRef)

    const batch = writeBatch(db)
    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data()
      const docBranchId = data.branchId || null

      // Solo afectar almacenes de la misma sucursal
      if (docSnapshot.id !== exceptId &&
          data.isDefault === true &&
          docBranchId === branchId) {
        batch.update(docSnapshot.ref, { isDefault: false })
      }
    })

    await batch.commit()
  } catch (error) {
    console.error('Error al actualizar almacenes default:', error)
  }
}

/**
 * Obtener almacén por defecto (de una sucursal específica o global)
 * @param {string} businessId - ID del negocio
 * @param {string|null} branchId - ID de la sucursal (null = sucursal principal, undefined = cualquiera)
 */
export const getDefaultWarehouse = async (businessId, branchId = undefined) => {
  try {
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')
    const snapshot = await getDocs(warehousesRef)

    let defaultWarehouse = null
    let firstBranchWarehouse = null

    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data()
      const docBranchId = data.branchId || null

      // Si se especifica branchId, filtrar por esa sucursal
      if (branchId !== undefined && docBranchId !== branchId) {
        return
      }

      // Guardar el primer almacén de la sucursal como fallback
      if (!firstBranchWarehouse && data.isActive !== false) {
        firstBranchWarehouse = { id: docSnapshot.id, ...data }
      }

      if (data.isDefault === true && data.isActive !== false) {
        defaultWarehouse = { id: docSnapshot.id, ...data }
      }
    })

    // Si no hay default, retornar el primero de la sucursal
    if (!defaultWarehouse && firstBranchWarehouse) {
      defaultWarehouse = firstBranchWarehouse
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
    let movements = []

    // Si se filtra por producto o ingrediente, usar query separada sin orderBy para evitar índice compuesto
    const filterProductId = filters.productId
    const filterIngredientId = filters.ingredientId
    if (filterProductId || filterIngredientId) {
      const filterId = filterIngredientId || filterProductId

      // Buscar por productId
      const productQuery = query(
        movementsRef,
        where('productId', '==', filterId)
      )
      const snapshot = await getDocs(productQuery)
      snapshot.forEach((doc) => {
        movements.push({ id: doc.id, ...doc.data() })
      })

      // Si es ingrediente, también buscar por ingredientId (algunos movimientos usan este campo)
      if (filterIngredientId) {
        const ingredientQuery = query(
          movementsRef,
          where('ingredientId', '==', filterId)
        )
        const ingSnapshot = await getDocs(ingredientQuery)
        const existingIds = new Set(movements.map(m => m.id))
        ingSnapshot.forEach((doc) => {
          if (!existingIds.has(doc.id)) {
            movements.push({ id: doc.id, ...doc.data() })
          }
        })
      }

      // Ordenar en cliente
      movements.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA // desc
      })

      // Filtros adicionales en cliente
      if (filters.startDate) {
        const [y, m, d] = filters.startDate.split('-').map(Number)
        const startDate = new Date(y, m - 1, d, 0, 0, 0)
        movements = movements.filter(m => {
          const movDate = m.createdAt?.toDate?.() || new Date(0)
          return movDate >= startDate
        })
      }
      if (filters.endDate) {
        const [y, m, d] = filters.endDate.split('-').map(Number)
        const endDate = new Date(y, m - 1, d, 23, 59, 59)
        movements = movements.filter(m => {
          const movDate = m.createdAt?.toDate?.() || new Date(0)
          return movDate <= endDate
        })
      }
      if (filters.warehouseId) {
        movements = movements.filter(
          (m) => m.warehouseId === filters.warehouseId || m.toWarehouse === filters.warehouseId
        )
      }
      if (filters.type) {
        movements = movements.filter((m) => m.type === filters.type)
      }

      return { success: true, data: movements, lastDoc: null, hasMore: false }
    }

    // Query general (sin filtro de producto)
    const constraints = []

    if (filters.startDate) {
      const [y, m, d] = filters.startDate.split('-').map(Number)
      constraints.push(where('createdAt', '>=', Timestamp.fromDate(new Date(y, m - 1, d, 0, 0, 0))))
    }
    if (filters.endDate) {
      const [y, m, d] = filters.endDate.split('-').map(Number)
      constraints.push(where('createdAt', '<=', Timestamp.fromDate(new Date(y, m - 1, d, 23, 59, 59))))
    }

    constraints.push(orderBy('createdAt', 'desc'))

    const pageSize = filters.pageSize || 200
    constraints.push(firestoreLimit(pageSize))

    if (filters.startAfterDoc) {
      constraints.push(startAfter(filters.startAfterDoc))
    }

    const q = query(movementsRef, ...constraints)
    const snapshot = await getDocs(q)

    snapshot.forEach((doc) => {
      movements.push({ id: doc.id, ...doc.data() })
    })

    // Filtrar en cliente
    if (filters.warehouseId) {
      movements = movements.filter(
        (m) => m.warehouseId === filters.warehouseId || m.toWarehouse === filters.warehouseId
      )
    }
    if (filters.type) {
      movements = movements.filter((m) => m.type === filters.type)
    }

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
    const hasMore = snapshot.docs.length === pageSize

    return { success: true, data: movements, lastDoc, hasMore }
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
  // Si el producto no controla stock, no modificar nada
  if (product.trackStock === false) {
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
  } else if (quantity < 0) {
    // Almacén no encontrado pero hay otros almacenes configurados
    // Esto ocurre al editar compras antiguas o cuando el almacén original fue eliminado
    // Restar del primer almacén que tenga stock suficiente, o del stock general como fallback
    let remainingToDeduct = Math.abs(quantity)

    // Intentar restar de los almacenes existentes
    for (let i = 0; i < warehouseStocks.length && remainingToDeduct > 0; i++) {
      const currentWsStock = warehouseStocks[i].stock || 0
      const deductFromThis = Math.min(currentWsStock, remainingToDeduct)
      if (deductFromThis > 0) {
        warehouseStocks[i] = {
          ...warehouseStocks[i],
          stock: currentWsStock - deductFromThis
        }
        remainingToDeduct -= deductFromThis
      }
    }

    // Recalcular stock total
    return {
      ...product,
      warehouseStocks,
      stock: calculateTotalStock(warehouseStocks)
    }
  }

  return {
    ...product,
    warehouseStocks,
    stock: calculateTotalStock(warehouseStocks)
  }
}

/**
 * Actualiza el stock de una VARIANTE específica en un almacén
 * Similar a updateWarehouseStock pero opera a nivel de variant.warehouseStocks
 * @param {Object} product - Producto completo con variants[]
 * @param {number} variantIndex - Índice de la variante a actualizar
 * @param {string} warehouseId - ID del almacén
 * @param {number} quantity - Cantidad a sumar (positivo) o restar (negativo)
 * @returns {Object} Producto actualizado con variant.warehouseStocks y variant.stock recalculados
 */
export const updateVariantWarehouseStock = (product, variantIndex, warehouseId, quantity) => {
  if (!product.variants || variantIndex >= product.variants.length) return product

  const variants = product.variants.map((v, i) => {
    if (i !== variantIndex) return v

    const warehouseStocks = [...(v.warehouseStocks || [])]
    const existingIndex = warehouseStocks.findIndex(ws => ws.warehouseId === warehouseId)

    if (existingIndex >= 0) {
      const newStock = (warehouseStocks[existingIndex].stock || 0) + quantity
      warehouseStocks[existingIndex] = {
        ...warehouseStocks[existingIndex],
        stock: Math.max(0, newStock)
      }
    } else if (quantity > 0) {
      warehouseStocks.push({ warehouseId, stock: quantity, minStock: 0 })
    }

    return {
      ...v,
      warehouseStocks,
      stock: calculateTotalStock(warehouseStocks)
    }
  })

  // Sincronizar product.stock y product.warehouseStocks como suma de variantes
  const aggregatedByWarehouse = {}
  variants.forEach(v => {
    const vws = v.warehouseStocks || []
    vws.forEach(ws => {
      if (!ws.warehouseId) return
      aggregatedByWarehouse[ws.warehouseId] = (aggregatedByWarehouse[ws.warehouseId] || 0) + (ws.stock || 0)
    })
  })
  const productWarehouseStocks = []
  const seenWh = new Set()
  const existingProductWS = product.warehouseStocks || []
  existingProductWS.forEach(ws => {
    if (!ws.warehouseId) return
    seenWh.add(ws.warehouseId)
    productWarehouseStocks.push({ ...ws, stock: aggregatedByWarehouse[ws.warehouseId] || 0 })
  })
  Object.entries(aggregatedByWarehouse).forEach(([whId, stock]) => {
    if (seenWh.has(whId)) return
    productWarehouseStocks.push({ warehouseId: whId, stock, minStock: 0 })
  })
  const totalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0)

  return {
    ...product,
    variants,
    stock: totalStock,
    warehouseStocks: productWarehouseStocks,
  }
}

/**
 * Obtener stock de un producto en un almacén específico
 */
export const getStockInWarehouse = (product, warehouseId) => {
  if (!product.warehouseStocks) return product.stock || 0

  // Soportar formato array [{ warehouseId, stock }] y objeto { warehouseId: stock }
  if (Array.isArray(product.warehouseStocks)) {
    const warehouseStock = product.warehouseStocks.find(ws => ws.warehouseId === warehouseId)
    return warehouseStock?.stock || 0
  }

  // Formato objeto
  return product.warehouseStocks[warehouseId] ?? 0
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

    // Productos CON variantes: el stock vive en variant.warehouseStocks (no en product.warehouseStocks).
    // Comparar la suma del stock de las variantes contra lo asignado a almacenes activos en SUS warehouseStocks.
    if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
      let variantTotal = 0
      let variantAssigned = 0
      for (const v of product.variants) {
        variantTotal += v.stock || 0
        if (Array.isArray(v.warehouseStocks)) {
          v.warehouseStocks.forEach(ws => {
            if (activeWarehouseIds === null || activeWarehouseIds.includes(ws.warehouseId)) {
              variantAssigned += ws.stock || 0
            }
          })
        }
      }
      return variantTotal > variantAssigned
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

  // Productos CON variantes: el stock vive en variant.warehouseStocks (no en product.warehouseStocks).
  if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
    let variantTotal = 0
    let variantAssigned = 0
    for (const v of product.variants) {
      variantTotal += v.stock || 0
      if (Array.isArray(v.warehouseStocks)) {
        v.warehouseStocks.forEach(ws => {
          if (activeWarehouseIds === null || activeWarehouseIds.includes(ws.warehouseId)) {
            variantAssigned += ws.stock || 0
          }
        })
      }
    }
    const variantOrphan = variantTotal - variantAssigned
    return variantOrphan > 0 ? variantOrphan : 0
  }

  // Calcular stock solo en almacenes activos
  let activeWarehouseTotal = 0
  if (product.warehouseStocks) {
    if (Array.isArray(product.warehouseStocks)) {
      product.warehouseStocks.forEach(ws => {
        if (activeWarehouseIds === null || activeWarehouseIds.includes(ws.warehouseId)) {
          activeWarehouseTotal += ws.stock || 0
        }
      })
    } else {
      // Formato objeto { warehouseId: stock }
      Object.entries(product.warehouseStocks).forEach(([whId, stock]) => {
        if (activeWarehouseIds === null || activeWarehouseIds.includes(whId)) {
          activeWarehouseTotal += stock || 0
        }
      })
    }
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
      // CASO 4: Sin warehouseStocks y stock en 0 — inicializar en almacén
      else if (warehouseStocks.length === 0 && currentStock === 0) {
        const newWarehouseStocks = [{
          warehouseId: targetWarehouseId,
          stock: 0,
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
 * Recalcular stock de un producto basándose en la suma de sus movimientos de stock.
 * Útil cuando el stock del producto está desfasado por race conditions.
 * Suma todos los movimientos por almacén y corrige el producto.
 *
 * @param {string} businessId - ID del negocio
 * @param {string} productId - ID del producto a recalcular
 * @returns {Object} - { success, corrected, stockFromMovements, previousStock, byWarehouse }
 */
export const recalculateStockFromMovements = async (businessId, productId, isIngredient = false) => {
  try {
    // 1. Obtener almacenes para identificar el principal
    const warehousesRef = collection(db, 'businesses', businessId, 'warehouses')
    const warehousesSnap = await getDocs(warehousesRef)
    const warehouses = []
    warehousesSnap.forEach(doc => warehouses.push({ id: doc.id, ...doc.data() }))
    const defaultWarehouse = warehouses.find(w => w.isDefault) || warehouses[0]
    const defaultWarehouseId = defaultWarehouse?.id || null

    // 2. Obtener todos los movimientos del producto/ingrediente
    const movementsRef = collection(db, 'businesses', businessId, 'stockMovements')
    const q = query(movementsRef, where('productId', '==', productId))
    const snapshot = await getDocs(q)

    const allDocs = [...snapshot.docs]

    // Si es ingrediente, también buscar por ingredientId
    if (isIngredient) {
      const q2 = query(movementsRef, where('ingredientId', '==', productId))
      const snapshot2 = await getDocs(q2)
      const existingIds = new Set(allDocs.map(d => d.id))
      snapshot2.docs.forEach(d => {
        if (!existingIds.has(d.id)) allDocs.push(d)
      })
    }

    // 3. Leer producto/ingrediente actual (necesario para detectar variantes)
    const collectionName = isIngredient ? 'ingredients' : 'products'
    const productRef = doc(db, 'businesses', businessId, collectionName, productId)
    const productDoc = await getDoc(productRef)
    if (!productDoc.exists()) {
      return { success: false, error: isIngredient ? 'Ingrediente no encontrado' : 'Producto no encontrado' }
    }

    const product = productDoc.data()
    const previousStock = isIngredient ? (product.currentStock || 0) : (product.stock || 0)
    const previousWarehouseStocks = product.warehouseStocks || []
    const previousWarehouseTotal = previousWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)

    const hasVariants = !isIngredient && product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0

    // Saltar productos con lotes (trackExpiration) o números de serie (trackSerials):
    // el recalculo masivo no sabe reconstruir batches[] ni serials[] desde movimientos
    // y dejaría el producto inconsistente (stock total OK pero detalle viejo).
    // El usuario debe usar Control de Lotes / Recuento de Inventario para esos casos.
    if (!isIngredient && (product.trackExpiration === true || product.trackSerials === true)) {
      return {
        success: true,
        skipped: true,
        skipReason: product.trackExpiration ? 'lotes' : 'series',
        corrected: false,
        previousStock,
      }
    }

    // Snapshot exacto del estado previo. Lo retornamos para que bulkRecalculateStock
    // pueda construir un backup y permitir revertir si el usuario se arrepiente.
    // Se serializa con JSON para asegurar que sea inmutable y safe-to-store.
    const previousSnapshot = {
      stock: isIngredient ? null : (product.stock ?? null),
      currentStock: isIngredient ? (product.currentStock ?? null) : null,
      warehouseStocks: JSON.parse(JSON.stringify(previousWarehouseStocks)),
      ...(hasVariants && {
        variants: JSON.parse(JSON.stringify(product.variants || [])),
      }),
    }

    // ============================================================
    // RAMA A: Producto con variantes — recalcular por variante
    // ============================================================
    if (hasVariants) {
      // Agrupar movimientos por variantSku y warehouseId
      const byVariant = new Map() // variantSku -> { warehouseId -> qty }
      const orphanMovements = []

      allDocs.forEach(docSnap => {
        const mov = { id: docSnap.id, ...docSnap.data() }
        const qty = mov.quantity || 0
        let whId = mov.warehouseId
        if (!whId || whId === 'default') whId = defaultWarehouseId || 'default'

        if (mov.variantSku) {
          if (!byVariant.has(mov.variantSku)) byVariant.set(mov.variantSku, {})
          const m = byVariant.get(mov.variantSku)
          m[whId] = (m[whId] || 0) + qty
        } else {
          // Movimiento huérfano: no tiene variantSku pero el producto tiene variantes
          orphanMovements.push({
            id: mov.id,
            type: mov.type,
            quantity: qty,
            warehouseId: whId,
            productName: mov.productName,
            notes: mov.notes,
            referenceNumber: mov.referenceNumber,
            createdAt: mov.createdAt,
          })
        }
      })

      // Reconstruir variants[] con stock derivado de movimientos
      const variantSkusInProduct = new Set((product.variants || []).map(v => v.sku))
      const newVariants = (product.variants || []).map(v => {
        const variantMov = byVariant.get(v.sku) || {}
        const newWS = []
        const seenWh = new Set()

        // Preservar warehouses existentes (con su minStock) recalculando stock
        ;(v.warehouseStocks || []).forEach(ws => {
          if (!ws.warehouseId) return
          seenWh.add(ws.warehouseId)
          newWS.push({ ...ws, stock: Math.max(0, variantMov[ws.warehouseId] || 0) })
        })
        // Agregar warehouses que tienen movimientos pero no estaban en warehouseStocks
        Object.entries(variantMov).forEach(([whId, stock]) => {
          if (seenWh.has(whId)) return
          if (whId === 'default' || stock === 0) return
          newWS.push({ warehouseId: whId, stock: Math.max(0, stock), minStock: 0 })
        })

        const totalStock = newWS.reduce((sum, ws) => sum + (ws.stock || 0), 0)
        return { ...v, warehouseStocks: newWS, stock: totalStock }
      })

      // Detectar movimientos con variantSku que ya no existe en el producto (variante eliminada)
      const removedVariantMovements = []
      byVariant.forEach((_warehouseQty, sku) => {
        if (!variantSkusInProduct.has(sku)) {
          removedVariantMovements.push(sku)
        }
      })

      // Calcular product.warehouseStocks como agregado de todas las variantes
      const productWHAgg = {}
      newVariants.forEach(v => {
        const vws = v.warehouseStocks || []
        vws.forEach(ws => {
          if (!ws.warehouseId) return
          productWHAgg[ws.warehouseId] = (productWHAgg[ws.warehouseId] || 0) + (ws.stock || 0)
        })
      })

      const newProductWS = []
      const seenProductWh = new Set()
      previousWarehouseStocks.forEach(ws => {
        if (!ws.warehouseId) return
        seenProductWh.add(ws.warehouseId)
        newProductWS.push({ ...ws, stock: productWHAgg[ws.warehouseId] || 0 })
      })
      Object.entries(productWHAgg).forEach(([whId, stock]) => {
        if (seenProductWh.has(whId)) return
        newProductWS.push({ warehouseId: whId, stock, minStock: 0 })
      })

      const productTotalStock = newVariants.reduce((sum, v) => sum + (v.stock || 0), 0)

      await updateDoc(productRef, {
        variants: newVariants,
        stock: productTotalStock,
        warehouseStocks: newProductWS,
        updatedAt: serverTimestamp(),
      })

      const corrected = previousStock !== productTotalStock || previousWarehouseTotal !== productTotalStock

      return {
        success: true,
        corrected,
        stockFromMovements: productTotalStock,
        previousStock: previousWarehouseTotal || previousStock,
        previousSnapshot,
        byWarehouse: productWHAgg,
        hasVariants: true,
        variantsCount: newVariants.length,
        ...(orphanMovements.length > 0 && { orphanMovements }),
        ...(removedVariantMovements.length > 0 && { removedVariantSkus: removedVariantMovements }),
      }
    }

    // ============================================================
    // RAMA B: Producto sin variantes (o ingrediente) — comportamiento original
    // ============================================================
    const stockByWarehouse = {}
    let totalFromMovements = 0

    allDocs.forEach(docSnap => {
      const mov = docSnap.data()
      const qty = mov.quantity || 0
      let whId = mov.warehouseId
      if (!whId || whId === 'default') {
        whId = defaultWarehouseId || 'default'
      }

      if (!stockByWarehouse[whId]) {
        stockByWarehouse[whId] = 0
      }
      stockByWarehouse[whId] += qty
      totalFromMovements += qty
    })

    const newWarehouseStocks = []
    const processedWarehouseIds = new Set()

    previousWarehouseStocks.forEach(ws => {
      const calculatedStock = stockByWarehouse[ws.warehouseId] || 0
      newWarehouseStocks.push({ ...ws, stock: calculatedStock })
      processedWarehouseIds.add(ws.warehouseId)
    })

    Object.keys(stockByWarehouse).forEach(whId => {
      if (whId === 'default' || processedWarehouseIds.has(whId)) return
      newWarehouseStocks.push({
        warehouseId: whId,
        stock: stockByWarehouse[whId],
        minStock: 0,
      })
    })

    if (newWarehouseStocks.length === 0 && defaultWarehouseId && totalFromMovements !== 0) {
      newWarehouseStocks.push({
        warehouseId: defaultWarehouseId,
        stock: totalFromMovements,
        minStock: 0,
      })
    }

    const stockField = isIngredient ? 'currentStock' : 'stock'
    await updateDoc(productRef, {
      [stockField]: totalFromMovements,
      warehouseStocks: newWarehouseStocks,
      updatedAt: serverTimestamp(),
    })

    return {
      success: true,
      corrected: previousWarehouseTotal !== totalFromMovements || previousStock !== totalFromMovements,
      stockFromMovements: totalFromMovements,
      previousStock: previousWarehouseTotal || previousStock,
      previousSnapshot,
      byWarehouse: stockByWarehouse,
    }
  } catch (error) {
    console.error('Error al recalcular stock desde movimientos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Recalcula el stock de TODOS los productos/ingredientes recibidos comparándolos con
 * el historial de movimientos. Aplica la misma lógica que recalculateStockFromMovements
 * pero en lote, con concurrencia controlada y callback de progreso.
 *
 * @param {string} businessId
 * @param {Array<{id:string, name?:string, isIngredient?:boolean}>} items - lista de productos/ingredientes a verificar
 * @param {object} [options]
 * @param {number} [options.batchSize=8] - cuántos items procesar en paralelo
 * @param {(state:{processed:number,total:number,corrected:number,errors:number,currentName?:string})=>void} [options.onProgress]
 * @returns {Promise<{success:boolean, totalChecked:number, totalCorrected:number, errors:number, corrections:Array, errorDetails:Array}>}
 */
export const bulkRecalculateStock = async (businessId, items, options = {}) => {
  const { batchSize = 8, onProgress, userId, userName } = options
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, totalChecked: 0, totalCorrected: 0, errors: 0, corrections: [], errorDetails: [] }
  }

  const corrections = []
  const errorDetails = []
  // Items saltados por seguridad (lotes / series). Reportados al final para
  // que el usuario sepa que debe gestionarlos por separado.
  const skipped = []
  // Snapshots de los items efectivamente modificados — base del backup para revertir.
  const backupItems = []
  let processed = 0
  let corrected = 0
  let errors = 0
  let skippedCount = 0

  const reportProgress = (currentName) => {
    if (onProgress) {
      onProgress({ processed, total: items.length, corrected, errors, skipped: skippedCount, currentName })
    }
  }
  reportProgress()

  // Procesar en lotes para no saturar Firestore
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (item) => {
        try {
          const result = await recalculateStockFromMovements(businessId, item.id, !!item.isIngredient)
          return { item, result }
        } catch (err) {
          return { item, result: { success: false, error: err?.message || String(err) } }
        }
      })
    )
    results.forEach(({ item, result }) => {
      processed += 1
      if (!result.success) {
        errors += 1
        errorDetails.push({ id: item.id, name: item.name || item.id, error: result.error })
      } else if (result.skipped) {
        // Lotes o series — se omitió por seguridad.
        skippedCount += 1
        skipped.push({
          id: item.id,
          name: item.name || item.id,
          reason: result.skipReason || 'lotes/series',
        })
      } else if (result.corrected) {
        corrected += 1
        corrections.push({
          id: item.id,
          name: item.name || item.id,
          previousStock: result.previousStock,
          newStock: result.stockFromMovements,
          isIngredient: !!item.isIngredient,
          hasVariants: !!result.hasVariants,
          variantsCount: result.variantsCount || 0,
          byWarehouse: result.byWarehouse || null,
        })
        // Guardar snapshot para poder revertir más adelante.
        if (result.previousSnapshot) {
          backupItems.push({
            id: item.id,
            name: item.name || item.id,
            isIngredient: !!item.isIngredient,
            previousSnapshot: result.previousSnapshot,
          })
        }
      }
    })
    reportProgress(batch[batch.length - 1]?.name)
  }

  // Crear backup en Firestore con los items que efectivamente cambiaron.
  // El backup permite revertir la verificación durante 7 días si algo se
  // desconfiguró (ej. stock que dependía de stock inicial no registrado).
  let backupId = null
  if (backupItems.length > 0) {
    try {
      backupId = await createStockBackup(businessId, backupItems, {
        userId: userId || null,
        userName: userName || null,
        totalChecked: processed,
        totalCorrected: corrected,
      })
    } catch (err) {
      console.error('Error creando backup de stock (la verificación continuó):', err)
    }
  }

  return {
    success: true,
    totalChecked: processed,
    totalCorrected: corrected,
    errors,
    corrections,
    errorDetails,
    backupId,
    totalSkipped: skippedCount,
    skipped,
  }
}

// =====================================================
// STOCK BACKUPS (Para revertir verificación masiva)
// =====================================================

const STOCK_BACKUP_TTL_DAYS = 7

/**
 * Crea un backup del estado previo al recalculo masivo de stock.
 * Permite revertir si la verificación desconfiguró productos (ej. cuando
 * stock inicial no fue registrado como movimiento).
 *
 * Si el backup tiene muchos items (>400), se divide en sub-chunks para
 * no exceder el límite de 1MB por documento de Firestore.
 *
 * @param {string} businessId
 * @param {Array<{id:string, name:string, isIngredient:boolean, previousSnapshot:object}>} backupItems
 * @param {object} metadata - { userId, userName, totalChecked, totalCorrected }
 * @returns {Promise<string>} - ID del backup creado
 */
export const createStockBackup = async (businessId, backupItems, metadata = {}) => {
  if (!Array.isArray(backupItems) || backupItems.length === 0) {
    throw new Error('createStockBackup: backupItems vacío')
  }

  const backupRef = collection(db, 'businesses', businessId, 'stockBackups')
  const CHUNK_SIZE = 400

  // Si cabe en un solo doc, lo guardamos inline. Si no, chunks separados.
  if (backupItems.length <= CHUNK_SIZE) {
    const docRef = await addDoc(backupRef, {
      createdAt: serverTimestamp(),
      reverted: false,
      revertedAt: null,
      userId: metadata.userId || null,
      userName: metadata.userName || null,
      totalChecked: metadata.totalChecked || 0,
      totalCorrected: metadata.totalCorrected || backupItems.length,
      itemsCount: backupItems.length,
      items: backupItems,
      hasChunks: false,
    })
    return docRef.id
  }

  // Caso grande: doc principal + sub-chunks en una subcolección.
  const docRef = await addDoc(backupRef, {
    createdAt: serverTimestamp(),
    reverted: false,
    revertedAt: null,
    userId: metadata.userId || null,
    userName: metadata.userName || null,
    totalChecked: metadata.totalChecked || 0,
    totalCorrected: metadata.totalCorrected || backupItems.length,
    itemsCount: backupItems.length,
    hasChunks: true,
    chunkCount: Math.ceil(backupItems.length / CHUNK_SIZE),
  })

  const chunksRef = collection(db, 'businesses', businessId, 'stockBackups', docRef.id, 'chunks')
  for (let i = 0; i < backupItems.length; i += CHUNK_SIZE) {
    const chunk = backupItems.slice(i, i + CHUNK_SIZE)
    await addDoc(chunksRef, { index: i / CHUNK_SIZE, items: chunk })
  }
  return docRef.id
}

/**
 * Devuelve el último backup activo (no revertido y dentro del TTL de 7 días).
 * Útil para mostrar el botón "Revertir verificación" en Inventario.
 *
 * @param {string} businessId
 * @param {number} [maxAgeDays=7]
 * @returns {Promise<{id:string, createdAt:Date, totalCorrected:number, itemsCount:number, userName:string}|null>}
 */
export const getLatestActiveStockBackup = async (businessId, maxAgeDays = STOCK_BACKUP_TTL_DAYS) => {
  try {
    const backupRef = collection(db, 'businesses', businessId, 'stockBackups')
    const q = query(
      backupRef,
      where('reverted', '==', false),
      orderBy('createdAt', 'desc'),
      firestoreLimit(1),
    )
    const snap = await getDocs(q)
    if (snap.empty) return null

    const docSnap = snap.docs[0]
    const data = docSnap.data()
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null

    // Verificar TTL (7 días por defecto)
    if (createdAt) {
      const ageMs = Date.now() - createdAt.getTime()
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
      if (ageMs > maxAgeMs) return null
    }

    return {
      id: docSnap.id,
      createdAt,
      totalChecked: data.totalChecked || 0,
      totalCorrected: data.totalCorrected || 0,
      itemsCount: data.itemsCount || 0,
      userName: data.userName || '',
      hasChunks: !!data.hasChunks,
    }
  } catch (error) {
    console.error('Error obteniendo backup activo de stock:', error)
    return null
  }
}

/**
 * Lee los items de un backup (combinando chunks si están separados).
 */
const loadBackupItems = async (businessId, backupId) => {
  const backupDocRef = doc(db, 'businesses', businessId, 'stockBackups', backupId)
  const backupDoc = await getDoc(backupDocRef)
  if (!backupDoc.exists()) throw new Error('Backup no encontrado')
  const data = backupDoc.data()

  if (!data.hasChunks) {
    return { data, items: data.items || [] }
  }

  const chunksRef = collection(db, 'businesses', businessId, 'stockBackups', backupId, 'chunks')
  const chunksSnap = await getDocs(query(chunksRef, orderBy('index', 'asc')))
  const items = []
  chunksSnap.forEach(d => {
    const chunk = d.data()
    if (Array.isArray(chunk.items)) items.push(...chunk.items)
  })
  return { data, items }
}

/**
 * Revierte un backup: restaura el stock/warehouseStocks/variants de cada item
 * al estado previo a la verificación masiva. Marca el backup como `reverted`.
 *
 * @param {string} businessId
 * @param {string} backupId
 * @param {object} [options]
 * @param {(state:{processed:number,total:number,errors:number})=>void} [options.onProgress]
 * @returns {Promise<{success:boolean, restored:number, errors:number, errorDetails:Array}>}
 */
export const revertStockBackup = async (businessId, backupId, options = {}) => {
  const { onProgress, batchSize = 8 } = options
  try {
    const { data: backupData, items } = await loadBackupItems(businessId, backupId)
    if (backupData.reverted) {
      return { success: false, error: 'Este backup ya fue revertido' }
    }
    if (!items.length) {
      return { success: false, error: 'El backup no tiene items para restaurar' }
    }

    let processed = 0
    let restored = 0
    let errors = 0
    const errorDetails = []

    const reportProgress = () => {
      if (onProgress) onProgress({ processed, total: items.length, errors })
    }
    reportProgress()

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      await Promise.all(batch.map(async (item) => {
        try {
          const collectionName = item.isIngredient ? 'ingredients' : 'products'
          const itemRef = doc(db, 'businesses', businessId, collectionName, item.id)
          const snapshot = item.previousSnapshot || {}
          const updateData = {
            warehouseStocks: snapshot.warehouseStocks || [],
            updatedAt: serverTimestamp(),
          }
          if (item.isIngredient) {
            updateData.currentStock = snapshot.currentStock ?? 0
          } else {
            updateData.stock = snapshot.stock ?? 0
          }
          if (snapshot.variants) {
            updateData.variants = snapshot.variants
          }
          await updateDoc(itemRef, updateData)
          restored += 1
        } catch (err) {
          errors += 1
          errorDetails.push({ id: item.id, name: item.name, error: err?.message || String(err) })
        } finally {
          processed += 1
        }
      }))
      reportProgress()
    }

    // Marcar backup como revertido
    const backupDocRef = doc(db, 'businesses', businessId, 'stockBackups', backupId)
    await updateDoc(backupDocRef, {
      reverted: true,
      revertedAt: serverTimestamp(),
    })

    return { success: true, restored, errors, errorDetails }
  } catch (error) {
    console.error('Error revirtiendo backup de stock:', error)
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
  recalculateStockFromMovements,
  bulkRecalculateStock,
  createStockBackup,
  getLatestActiveStockBackup,
  revertStockBackup,
  recalculateStockFromWarehouses,
  getTotalAvailableStock,
  // Inventory Counts
  createInventoryCount,
  getInventoryCounts,
  getInventoryCountById,
}
