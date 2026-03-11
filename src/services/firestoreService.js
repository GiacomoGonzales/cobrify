import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase'

/**
 * Servicio para interactuar con Firestore
 */

// ==================== FACTURAS ====================

/**
 * Crear una nueva factura
 */
export const createInvoice = async (userId, invoiceData) => {
  try {
    // Usar subcolección: businesses/{userId}/invoices
    const docRef = await addDoc(collection(db, 'businesses', userId, 'invoices'), {
      ...invoiceData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear factura:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener facturas recientes (por rango de fechas) - optimizado para Dashboard
 * @param {string} userId - ID del negocio
 * @param {Date} sinceDate - Fecha desde la cual obtener facturas
 */
export const getRecentInvoices = async (userId, sinceDate) => {
  try {
    const q = query(
      collection(db, 'businesses', userId, 'invoices'),
      where('createdAt', '>=', sinceDate),
      orderBy('createdAt', 'desc')
    )
    const querySnapshot = await getDocs(q)
    const invoices = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: invoices }
  } catch (error) {
    console.error('Error al obtener facturas recientes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener facturas de un usuario
 */
export const getInvoices = async userId => {
  try {
    // Usar subcolección - ya no necesita filtro por userId
    const querySnapshot = await getDocs(collection(db, 'businesses', userId, 'invoices'))
    const invoices = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar en el cliente por fecha de creación (más reciente primero)
    invoices.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: invoices }
  } catch (error) {
    console.error('Error al obtener facturas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener facturas de un usuario filtradas por sucursal
 * @param {string} userId - ID del negocio
 * @param {string|null} branchId - ID de la sucursal (null para sucursal principal)
 * @param {Date|null} sinceDate - Fecha desde la cual obtener facturas (opcional, para optimización)
 */
export const getInvoicesByBranch = async (userId, branchId = null, sinceDate = null) => {
  try {
    const invoicesRef = collection(db, 'businesses', userId, 'invoices')

    // Si hay fecha, usar query con filtro de Firestore para reducir documentos leídos
    let querySnapshot
    if (sinceDate) {
      const q = query(invoicesRef, where('createdAt', '>=', sinceDate), orderBy('createdAt', 'desc'))
      querySnapshot = await getDocs(q)
    } else {
      querySnapshot = await getDocs(invoicesRef)
    }

    // Filtrar por branchId en el cliente
    const invoices = querySnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter(invoice => {
        if (branchId) {
          return invoice.branchId === branchId
        } else {
          return !invoice.branchId
        }
      })

    // Ordenar por fecha de creación (más reciente primero) - solo si no venía ordenado de Firestore
    if (!sinceDate) {
      invoices.sort((a, b) => {
        if (!a.createdAt) return 1
        if (!b.createdAt) return -1
        return b.createdAt.seconds - a.createdAt.seconds
      })
    }

    return { success: true, data: invoices }
  } catch (error) {
    console.error('Error al obtener facturas por sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una factura
 */
export const updateInvoice = async (userId, invoiceId, updates) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'invoices', invoiceId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar factura:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una factura
 */
export const deleteInvoice = async (userId, invoiceId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'invoices', invoiceId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar factura:', error)
    return { success: false, error: error.message }
  }
}

// ==================== CLIENTES ====================

/**
 * Crear un nuevo cliente
 */
export const createCustomer = async (userId, customerData) => {
  try {
    // Auto-corregir tipo de documento si hay mismatch con la longitud
    let correctedData = { ...customerData }
    if (customerData.documentNumber) {
      const docLen = customerData.documentNumber.length
      if (docLen === 11 && customerData.documentType === 'DNI') {
        // RUC guardado como DNI - corregir
        correctedData.documentType = 'RUC'
      } else if (docLen === 8 && customerData.documentType === 'RUC') {
        // DNI guardado como RUC - corregir
        correctedData.documentType = 'DNI'
      }
    }

    // Usar subcolección: businesses/{userId}/customers
    const docRef = await addDoc(collection(db, 'businesses', userId, 'customers'), {
      ...correctedData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear cliente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener clientes de un usuario
 */
export const getCustomers = async userId => {
  try {
    // Usar subcolección - ya no necesita filtro por userId
    const querySnapshot = await getDocs(collection(db, 'businesses', userId, 'customers'))
    const customers = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: customers }
  } catch (error) {
    console.error('Error al obtener clientes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un cliente
 */
export const updateCustomer = async (userId, customerId, updates) => {
  try {
    // Auto-corregir tipo de documento si hay mismatch con la longitud
    let correctedUpdates = { ...updates }
    if (updates.documentNumber) {
      const docLen = updates.documentNumber.length
      if (docLen === 11 && updates.documentType === 'DNI') {
        correctedUpdates.documentType = 'RUC'
      } else if (docLen === 8 && updates.documentType === 'RUC') {
        correctedUpdates.documentType = 'DNI'
      }
    }

    const docRef = doc(db, 'businesses', userId, 'customers', customerId)
    await updateDoc(docRef, {
      ...correctedUpdates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar cliente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un cliente
 */
export const deleteCustomer = async (userId, customerId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'customers', customerId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar cliente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Buscar cliente por número de documento
 */
export const getCustomerByDocumentNumber = async (userId, documentNumber) => {
  try {
    const customersRef = collection(db, 'businesses', userId, 'customers')
    const q = query(customersRef, where('documentNumber', '==', documentNumber))
    const querySnapshot = await getDocs(q)

    if (querySnapshot.empty) {
      return { success: true, data: null }
    }

    const customerDoc = querySnapshot.docs[0]
    return {
      success: true,
      data: { id: customerDoc.id, ...customerDoc.data() }
    }
  } catch (error) {
    console.error('Error al buscar cliente por documento:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear o actualizar cliente automáticamente desde una venta
 * Si el cliente ya existe (por documentNumber), actualiza sus datos
 * Si no existe, lo crea
 */
export const upsertCustomerFromSale = async (userId, customerData) => {
  try {
    // No guardar clientes genéricos (sin documento real)
    if (!customerData.documentNumber ||
        customerData.documentNumber === '00000000' ||
        customerData.documentNumber.trim() === '') {
      return { success: true, skipped: true, reason: 'Cliente genérico sin documento' }
    }

    // Buscar si el cliente ya existe
    const existingResult = await getCustomerByDocumentNumber(userId, customerData.documentNumber)

    if (!existingResult.success) {
      return existingResult
    }

    if (existingResult.data) {
      // Cliente existe - actualizar solo si hay datos nuevos más completos
      const existing = existingResult.data
      const updates = {}

      // Actualizar campos solo si el nuevo dato tiene valor y el existente no
      if (customerData.name && !existing.name) updates.name = customerData.name
      if (customerData.businessName && !existing.businessName) updates.businessName = customerData.businessName
      if (customerData.email && !existing.email) updates.email = customerData.email
      if (customerData.phone && !existing.phone) updates.phone = customerData.phone
      if (customerData.address && !existing.address) updates.address = customerData.address

      // Solo actualizar si hay cambios
      if (Object.keys(updates).length > 0) {
        await updateCustomer(userId, existing.id, updates)
        return { success: true, updated: true, id: existing.id }
      }

      return { success: true, exists: true, id: existing.id }
    } else {
      // Cliente no existe - crearlo
      // Auto-detectar tipo de documento si no viene especificado
      const autoDocType = customerData.documentNumber?.length === 11 ? 'RUC' : 'DNI'
      const newCustomerData = {
        documentType: customerData.documentType || autoDocType,
        documentNumber: customerData.documentNumber,
        name: customerData.name || '',
        businessName: customerData.businessName || '',
        email: customerData.email || '',
        phone: customerData.phone || '',
        address: customerData.address || '',
        source: 'auto_from_sale' // Marcar que fue creado automáticamente
      }

      const createResult = await createCustomer(userId, newCustomerData)
      return { success: true, created: true, id: createResult.id }
    }
  } catch (error) {
    console.error('Error al crear/actualizar cliente desde venta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener estadísticas de clientes (pedidos y totales)
 */
export const getCustomersWithStats = async userId => {
  try {
    // Obtener clientes
    const customersResult = await getCustomers(userId)
    if (!customersResult.success) {
      return customersResult
    }

    // Obtener facturas
    const invoicesResult = await getInvoices(userId)
    if (!invoicesResult.success) {
      return invoicesResult
    }

    const customers = customersResult.data || []
    const invoices = invoicesResult.data || []

    // Calcular estadísticas por cliente
    const customersWithStats = customers.map(customer => {
      // Filtrar facturas del cliente - comparar por documentNumber ya que no se guarda el ID
      const customerInvoices = invoices.filter(
        invoice => invoice.customer?.documentNumber === customer.documentNumber
      )

      // Calcular total gastado
      const totalSpent = customerInvoices.reduce(
        (sum, invoice) => sum + (invoice.total || 0),
        0
      )

      return {
        ...customer,
        ordersCount: customerInvoices.length,
        totalSpent: totalSpent,
      }
    })

    return { success: true, data: customersWithStats }
  } catch (error) {
    console.error('Error al obtener clientes con estadísticas:', error)
    return { success: false, error: error.message }
  }
}

// ==================== PRODUCTOS ====================

/**
 * Crear un nuevo producto
 */
export const createProduct = async (userId, productData) => {
  try {
    // Usar subcolección: businesses/{userId}/products
    const docRef = await addDoc(collection(db, 'businesses', userId, 'products'), {
      ...productData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear producto:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener productos de un usuario
 */
export const getProducts = async (userId, options = {}) => {
  try {
    const {
      limit: limitCount = null,
      lastDoc = null,
      searchTerm = null,
      category = null
    } = options

    // Usar subcolección
    let q = collection(db, 'businesses', userId, 'products')

    // Si hay límite, crear query con paginación
    if (limitCount) {
      const constraints = []

      // Ordenar por nombre para paginación consistente
      constraints.push(orderBy('name', 'asc'))

      // Si hay un último documento, continuar desde ahí
      if (lastDoc) {
        constraints.push(startAfter(lastDoc))
      }

      // Aplicar límite
      constraints.push(limit(limitCount))

      q = query(q, ...constraints)
    }

    const querySnapshot = await getDocs(q)
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Devolver también el último documento para la siguiente página
    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1]

    return {
      success: true,
      data: products,
      lastDoc: lastVisible,
      hasMore: querySnapshot.docs.length === limitCount
    }
  } catch (error) {
    console.error('Error al obtener productos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un producto
 */
export const updateProduct = async (userId, productId, updates) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'products', productId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar producto:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar stock de un producto usando transacción de Firestore (atómico)
 * Evita race conditions cuando dos ventas simultáneas descuentan stock del mismo producto
 */
export const updateProductStockTransaction = async (userId, productId, warehouseId, quantity, extraUpdates = {}) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'products', productId)
    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(docRef)
      if (!productDoc.exists()) throw new Error('Producto no encontrado')

      const product = productDoc.data()
      if (product.trackStock === false || product.stock === null) return

      const warehouseStocks = [...(product.warehouseStocks || [])]
      const currentGeneralStock = product.stock || 0

      let newStock, newWarehouseStocks

      if (warehouseStocks.length === 0 && !warehouseId) {
        newStock = Math.max(0, currentGeneralStock + quantity)
        newWarehouseStocks = []
      } else {
        const existingIndex = warehouseStocks.findIndex(ws => ws.warehouseId === warehouseId)
        if (existingIndex >= 0) {
          const wsStock = (warehouseStocks[existingIndex].stock || 0) + quantity
          warehouseStocks[existingIndex] = { ...warehouseStocks[existingIndex], stock: Math.max(0, wsStock) }
        } else if (quantity > 0) {
          warehouseStocks.push({ warehouseId, stock: quantity, minStock: 0 })
        } else if (quantity < 0 && warehouseStocks.length === 0) {
          newStock = Math.max(0, currentGeneralStock + quantity)
          newWarehouseStocks = []
        } else if (quantity < 0) {
          let remaining = Math.abs(quantity)
          for (let i = 0; i < warehouseStocks.length && remaining > 0; i++) {
            const ws = warehouseStocks[i].stock || 0
            const deduct = Math.min(ws, remaining)
            if (deduct > 0) {
              warehouseStocks[i] = { ...warehouseStocks[i], stock: ws - deduct }
              remaining -= deduct
            }
          }
        }

        if (newWarehouseStocks === undefined) {
          newWarehouseStocks = warehouseStocks
          newStock = warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
        }
      }

      transaction.update(docRef, {
        stock: newStock,
        warehouseStocks: newWarehouseStocks,
        ...extraUpdates,
        updatedAt: serverTimestamp(),
      })
    })
    return { success: true }
  } catch (error) {
    console.error('Error en transacción de stock:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un producto
 * Verifica que el producto no tenga stock antes de eliminarlo
 */
export const deleteProduct = async (userId, productId) => {
  try {
    // Primero obtener el producto para verificar el stock
    const productRef = doc(db, 'businesses', userId, 'products', productId)
    const productSnap = await getDoc(productRef)

    if (!productSnap.exists()) {
      return { success: false, error: 'Producto no encontrado' }
    }

    const product = productSnap.data()

    // Verificar si el producto tiene stock
    // 1. Verificar stock general
    const generalStock = product.stock || 0

    // 2. Verificar stock en almacenes (si existe warehouseStocks)
    let warehouseStock = 0
    if (product.warehouseStocks && Array.isArray(product.warehouseStocks)) {
      warehouseStock = product.warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
    }

    // El stock total es el mayor entre el general y la suma de almacenes
    // (algunos productos pueden tener discrepancias)
    const totalStock = Math.max(generalStock, warehouseStock)

    // Si tiene stock, no permitir eliminar
    if (totalStock > 0) {
      return {
        success: false,
        error: `No se puede eliminar el producto porque tiene ${totalStock} unidad(es) en stock. Primero debes ajustar el inventario a 0.`
      }
    }

    // Si no tiene stock, proceder con la eliminación
    await deleteDoc(productRef)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar producto:', error)
    return { success: false, error: error.message }
  }
}

// ==================== SKU AUTOMÁTICO ====================

export const getNextSkuNumber = async (businessId) => {
  const counterRef = doc(db, 'businesses', businessId, 'counters', 'sku')
  try {
    const newNumber = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef)
      let currentNumber = 0
      if (counterDoc.exists()) {
        currentNumber = counterDoc.data().lastNumber || 0
      }
      const nextNumber = currentNumber + 1
      transaction.set(counterRef, { lastNumber: nextNumber }, { merge: true })
      return nextNumber
    })
    return `PROD-${String(newNumber).padStart(4, '0')}`
  } catch (error) {
    console.error('Error obteniendo siguiente SKU:', error)
    const timestamp = Date.now().toString().slice(-6)
    return `PROD-${timestamp}`
  }
}

// ==================== CONFIGURACIÓN DE EMPRESA ====================

/**
 * Guardar configuración de empresa
 */
export const saveCompanySettings = async (userId, settings) => {
  try {
    // Ahora la configuración está en businesses/{userId}
    const docRef = doc(db, 'businesses', userId)

    // Intentar actualizar
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      await updateDoc(docRef, {
        ...settings,
        updatedAt: serverTimestamp(),
      })
    } else {
      // Si no existe, usar setDoc para crear con ID específico
      await setDoc(docRef, {
        ...settings,
        ownerId: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Error al guardar configuración:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener configuración de empresa
 */
export const getCompanySettings = async userId => {
  try {
    // Ahora la configuración está en businesses/{userId}
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return { success: true, data: docSnap.data() }
    } else {
      return { success: true, data: null }
    }
  } catch (error) {
    console.error('Error al obtener configuración:', error)
    return { success: false, error: error.message }
  }
}

// ==================== SERIES DE DOCUMENTOS ====================

/**
 * Obtener o crear series de documentos para un usuario
 */
export const getDocumentSeries = async userId => {
  try {
    // Las series ahora están en businesses/{userId}
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      return { success: true, data: data.series || null }
    } else {
      // Si no existe el negocio, devolver null
      return { success: true, data: null }
    }
  } catch (error) {
    console.error('Error al obtener series:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar series de documentos
 */
export const updateDocumentSeries = async (userId, seriesData) => {
  try {
    // Las series ahora están en businesses/{userId}
    const docRef = doc(db, 'businesses', userId)
    await updateDoc(docRef, {
      series: seriesData,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar series:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Convertir una Nota de Venta a Boleta o Factura
 * - Crea un nuevo comprobante con los datos de la nota de venta
 * - NO descuenta stock (ya fue descontado en la venta original)
 * - Marca la nota de venta como convertida
 * - Retorna el nuevo comprobante para enviarlo a SUNAT si es necesario
 */
export const convertNotaVentaToComprobante = async (userId, notaVentaId, customerData = null, targetDocumentType = 'boleta') => {
  try {
    // 1. Obtener la nota de venta
    const notaRef = doc(db, 'businesses', userId, 'invoices', notaVentaId)
    const notaSnap = await getDoc(notaRef)

    if (!notaSnap.exists()) {
      return { success: false, error: 'Nota de venta no encontrada' }
    }

    const notaVenta = { id: notaSnap.id, ...notaSnap.data() }

    // 2. Verificar que sea una nota de venta
    if (notaVenta.documentType !== 'nota_venta') {
      return { success: false, error: 'El documento no es una nota de venta' }
    }

    // 3. Verificar que no haya sido convertida antes
    if (notaVenta.convertedTo) {
      return { success: false, error: `Esta nota ya fue convertida a ${notaVenta.convertedTo.type || 'comprobante'} ${notaVenta.convertedTo.number || ''}` }
    }

    // 4. Verificar que no esté anulada
    if (notaVenta.status === 'voided') {
      return { success: false, error: 'No se puede convertir una nota de venta anulada' }
    }

    // 5. Obtener siguiente número de comprobante
    const numberResult = await getNextDocumentNumber(userId, targetDocumentType)
    if (!numberResult.success) {
      return { success: false, error: `Error al obtener número de ${targetDocumentType}: ` + numberResult.error }
    }

    // 6. Preparar datos del cliente (usar los proporcionados o los originales)
    const customer = customerData || notaVenta.customer || {
      name: 'VARIOS',
      documentType: 'DNI',
      documentNumber: '00000000'
    }

    // 7. Crear el nuevo comprobante
    const comprobanteData = {
      // Datos del documento
      documentType: targetDocumentType,
      number: numberResult.number,
      series: numberResult.series,
      correlativeNumber: numberResult.correlativeNumber,

      // Datos del cliente
      customer: {
        name: customer.name || 'VARIOS',
        ...(targetDocumentType === 'factura' ? { businessName: customer.businessName || customer.name || 'VARIOS' } : {}),
        documentType: customer.documentType || (targetDocumentType === 'factura' ? 'RUC' : 'DNI'),
        documentNumber: customer.documentNumber || (targetDocumentType === 'factura' ? '00000000000' : '00000000'),
        address: customer.address || '',
        email: customer.email || '',
        phone: customer.phone || '',
      },

      // Copiar items de la nota de venta
      items: notaVenta.items || [],

      // Copiar totales
      subtotal: notaVenta.subtotal || 0,
      tax: notaVenta.tax || 0,
      igv: notaVenta.igv || notaVenta.tax || 0,
      total: notaVenta.total || 0,
      discount: notaVenta.discount || 0,

      // Copiar montos por tipo de afectación tributaria
      opGravadas: notaVenta.opGravadas || notaVenta.subtotal || 0,
      opExoneradas: notaVenta.opExoneradas || 0,
      opInafectas: notaVenta.opInafectas || 0,

      // Copiar configuración de impuestos
      taxConfig: notaVenta.taxConfig || null,

      // Estado
      status: 'completed',
      sunatStatus: 'pending', // Pendiente de envío a SUNAT

      // Datos de pago
      paymentMethod: notaVenta.paymentMethod || 'Efectivo',
      paymentStatus: 'paid',

      // Referencia a la nota de venta original
      convertedFrom: {
        type: 'nota_venta',
        id: notaVentaId,
        number: notaVenta.number,
      },

      // Metadata
      notes: notaVenta.notes || '',
      sellerId: notaVenta.sellerId || null,
      sellerName: notaVenta.sellerName || null,

      // Flag para indicar que NO debe descontar stock
      skipStockDeduction: true,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    // 8. Guardar el comprobante
    const comprobanteRef = await addDoc(collection(db, 'businesses', userId, 'invoices'), comprobanteData)

    // 9. Actualizar la nota de venta para marcarla como convertida
    await updateDoc(notaRef, {
      convertedTo: {
        type: targetDocumentType,
        id: comprobanteRef.id,
        number: numberResult.number,
        convertedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    })

    return {
      success: true,
      comprobanteId: comprobanteRef.id,
      comprobanteNumber: numberResult.number,
      // Aliases para compatibilidad
      boletaId: comprobanteRef.id,
      boletaNumber: numberResult.number,
      comprobante: {
        id: comprobanteRef.id,
        ...comprobanteData,
      }
    }
  } catch (error) {
    console.error('Error al convertir nota de venta:', error)
    return { success: false, error: error.message }
  }
}

// Alias para compatibilidad
export const convertNotaVentaToBoleta = convertNotaVentaToComprobante

/**
 * Marcar una nota de venta como convertida a comprobante
 */
export const markNotaVentaAsConverted = async (businessId, notaVentaId, comprobanteType, comprobanteId, comprobanteNumber) => {
  try {
    const notaRef = doc(db, 'businesses', businessId, 'invoices', notaVentaId)
    await updateDoc(notaRef, {
      convertedTo: {
        type: comprobanteType,
        id: comprobanteId,
        number: comprobanteNumber,
        convertedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al marcar nota de venta como convertida:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener siguiente número de documento
 * @param {string} userId - ID del negocio
 * @param {string} documentType - Tipo de documento (factura, boleta, etc.)
 * @param {string} warehouseId - ID del almacén (compatibilidad hacia atrás)
 * @param {string} branchId - ID de la sucursal (nuevo, prioritario sobre warehouseId)
 */
export const getNextDocumentNumber = async (userId, documentType, warehouseId = null, branchId = null) => {
  try {
    const docRef = doc(db, 'businesses', userId)

    // Usar transacción atómica para evitar números duplicados
    const result = await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef)

      if (!docSnap.exists()) {
        throw new Error('Negocio no encontrado')
      }

      const data = docSnap.data()
      let typeData = null
      let seriesPath = ''

      // 1. Primero intentar con branchSeries (sucursales - nuevo sistema)
      if (branchId && data.branchSeries && data.branchSeries[branchId]) {
        const branchSeries = data.branchSeries[branchId]
        if (branchSeries[documentType]) {
          typeData = branchSeries[documentType]
          seriesPath = `branchSeries.${branchId}.${documentType}`
        }
      }

      // 2. Fallback a warehouseSeries (compatibilidad hacia atrás)
      if (!typeData && warehouseId && data.warehouseSeries && data.warehouseSeries[warehouseId]) {
        const warehouseSeries = data.warehouseSeries[warehouseId]
        if (warehouseSeries[documentType]) {
          typeData = warehouseSeries[documentType]
          seriesPath = `warehouseSeries.${warehouseId}.${documentType}`
        }
      }

      // 3. Fallback a series globales si no hay series específicas
      if (!typeData && data.series && data.series[documentType]) {
        typeData = data.series[documentType]
        seriesPath = `series.${documentType}`
      }

      if (!typeData) {
        throw new Error(`Series no configuradas para ${documentType}`)
      }

      const nextNumber = (typeData.lastNumber || 0) + 1
      const formattedNumber = `${typeData.serie}-${String(nextNumber).padStart(8, '0')}`

      // Actualizar el último número de forma atómica
      transaction.update(docRef, {
        [`${seriesPath}.lastNumber`]: nextNumber,
        updatedAt: serverTimestamp(),
      })

      return {
        number: formattedNumber,
        series: typeData.serie,
        correlativeNumber: nextNumber,
        warehouseId: warehouseId,
        branchId: branchId
      }
    })

    return {
      success: true,
      ...result
    }
  } catch (error) {
    console.error('Error al obtener siguiente número:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener series de un almacén específico
 */
export const getWarehouseSeries = async (userId, warehouseId) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    const data = docSnap.data()

    if (data.warehouseSeries && data.warehouseSeries[warehouseId]) {
      return { success: true, data: data.warehouseSeries[warehouseId] }
    }

    // Si no hay series específicas, devolver null
    return { success: true, data: null }
  } catch (error) {
    console.error('Error al obtener series del almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar series de un almacén específico
 */
export const updateWarehouseSeries = async (userId, warehouseId, seriesData) => {
  try {
    const docRef = doc(db, 'businesses', userId)

    await updateDoc(docRef, {
      [`warehouseSeries.${warehouseId}`]: seriesData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar series del almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todas las series por almacén
 */
export const getAllWarehouseSeries = async (userId) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    const data = docSnap.data()
    return {
      success: true,
      data: data.warehouseSeries || {},
      globalSeries: data.series || {}
    }
  } catch (error) {
    console.error('Error al obtener series por almacén:', error)
    return { success: false, error: error.message }
  }
}

// ==================== BRANCH SERIES (SUCURSALES) ====================

/**
 * Obtener series de una sucursal específica
 */
export const getBranchSeriesFS = async (userId, branchId) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    const data = docSnap.data()

    if (data.branchSeries && data.branchSeries[branchId]) {
      return { success: true, data: data.branchSeries[branchId] }
    }

    // Si no hay series específicas, devolver null
    return { success: true, data: null }
  } catch (error) {
    console.error('Error al obtener series de la sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar series de una sucursal específica
 */
export const updateBranchSeriesFS = async (userId, branchId, seriesData) => {
  try {
    const docRef = doc(db, 'businesses', userId)

    await updateDoc(docRef, {
      [`branchSeries.${branchId}`]: seriesData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar series de la sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todas las series por sucursal
 */
export const getAllBranchSeriesFS = async (userId) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    const data = docSnap.data()
    return {
      success: true,
      data: data.branchSeries || {},
      globalSeries: data.series || {}
    }
  } catch (error) {
    console.error('Error al obtener series por sucursal:', error)
    return { success: false, error: error.message }
  }
}

// ==================== SUNAT INTEGRATION ====================

/**
 * Enviar factura/boleta a SUNAT
 */
export const sendInvoiceToSunat = async (userId, invoiceId) => {
  try {
    console.log(`📤 Enviando factura ${invoiceId} a SUNAT...`)

    // Obtener token de autenticación del usuario actual
    const user = auth.currentUser
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const idToken = await user.getIdToken()

    // Determinar URL de la Cloud Function (emulador o producción)
    const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

    const functionUrl = useEmulator
      ? 'http://127.0.0.1:5001/cobrify-395fe/us-central1/sendInvoiceToSunat'
      : 'https://us-central1-cobrify-395fe.cloudfunctions.net/sendInvoiceToSunat'

    console.log(`🌐 Llamando a: ${functionUrl}`)

    // Llamar a la Cloud Function con fetch
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        userId,
        invoiceId,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Error HTTP Response:', errorText)
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('✅ Respuesta de SUNAT:', result)

    return {
      success: result.success,
      status: result.status,
      message: result.message,
      observations: result.observations || [],
    }
  } catch (error) {
    console.error('❌ Error al enviar a SUNAT:', error)

    return {
      success: false,
      error: error.message || 'Error al enviar a SUNAT',
    }
  }
}

/**
 * Enviar Nota de Crédito a SUNAT
 * Usa una Cloud Function independiente para no afectar facturas/boletas
 */
export const sendCreditNoteToSunat = async (userId, creditNoteId) => {
  try {
    console.log(`📤 Enviando Nota de Crédito ${creditNoteId} a SUNAT...`)

    // Obtener token de autenticación del usuario actual
    const user = auth.currentUser
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const idToken = await user.getIdToken()

    // Determinar URL de la Cloud Function (emulador o producción)
    const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

    const functionUrl = useEmulator
      ? 'http://127.0.0.1:5001/cobrify-395fe/us-central1/sendCreditNoteToSunat'
      : 'https://us-central1-cobrify-395fe.cloudfunctions.net/sendCreditNoteToSunat'

    console.log(`🌐 Llamando a: ${functionUrl}`)

    // Llamar a la Cloud Function con fetch
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        userId,
        creditNoteId,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Error HTTP Response:', errorText)
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('✅ Respuesta de SUNAT (NC):', result)

    return {
      success: result.success,
      status: result.status,
      message: result.message,
      observations: result.observations || [],
    }
  } catch (error) {
    console.error('❌ Error al enviar NC a SUNAT:', error)

    return {
      success: false,
      error: error.message || 'Error al enviar nota de crédito a SUNAT',
    }
  }
}

// ==================== PROVEEDORES ====================

/**
 * Crear un nuevo proveedor
 */
export const createSupplier = async (userId, supplierData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', userId, 'suppliers'), {
      ...supplierData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear proveedor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener proveedores de un usuario
 */
export const getSuppliers = async userId => {
  try {
    const querySnapshot = await getDocs(collection(db, 'businesses', userId, 'suppliers'))
    const suppliers = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: suppliers }
  } catch (error) {
    console.error('Error al obtener proveedores:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un proveedor
 */
export const updateSupplier = async (userId, supplierId, updates) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'suppliers', supplierId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar proveedor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un proveedor
 */
export const deleteSupplier = async (userId, supplierId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'suppliers', supplierId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar proveedor:', error)
    return { success: false, error: error.message }
  }
}

// ==================== COMPRAS ====================

/**
 * Crear una nueva compra/orden de compra
 */
export const createPurchase = async (userId, purchaseData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', userId, 'purchases'), {
      ...purchaseData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una compra por ID
 */
export const getPurchase = async (userId, purchaseId) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'purchases', purchaseId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Compra no encontrada' }
    }

    return {
      success: true,
      data: { id: docSnap.id, ...docSnap.data() }
    }
  } catch (error) {
    console.error('Error al obtener compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener compras de un usuario
 */
export const getPurchases = async userId => {
  try {
    const querySnapshot = await getDocs(collection(db, 'businesses', userId, 'purchases'))
    const purchases = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar por fecha de creación (más reciente primero)
    purchases.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: purchases }
  } catch (error) {
    console.error('Error al obtener compras:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una compra
 */
export const updatePurchase = async (userId, purchaseId, updates) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'purchases', purchaseId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una compra
 */
export const deletePurchase = async (userId, purchaseId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'purchases', purchaseId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar compra:', error)
    return { success: false, error: error.message }
  }
}

// ==================== CATEGORÍAS ====================

/**
 * Obtener categorías de productos
 */
export const getProductCategories = async userId => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      return { success: true, data: data.productCategories || [] }
    } else {
      return { success: true, data: [] }
    }
  } catch (error) {
    console.error('Error al obtener categorías:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Guardar categorías de productos
 */
export const saveProductCategories = async (userId, categories) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    await updateDoc(docRef, {
      productCategories: categories,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al guardar categorías:', error)
    return { success: false, error: error.message }
  }
}

// ==================== CONTROL DE CAJA ====================

/**
 * Obtener sesión de caja actual (abierta)
 * @param {string} userId - ID del negocio
 * @param {string|null} branchId - ID de la sucursal (null = Sucursal Principal)
 * @param {string|null} userUid - Firebase UID del usuario (para filtrar caja por usuario)
 */
export const getCashRegisterSession = async (userId, branchId = null, userUid = null) => {
  try {
    // Construir query base
    let q
    if (branchId) {
      // Sucursal específica
      q = query(
        collection(db, 'businesses', userId, 'cashSessions'),
        where('status', '==', 'open'),
        where('branchId', '==', branchId)
      )
    } else {
      // Sucursal Principal (sin branchId o branchId = null)
      q = query(
        collection(db, 'businesses', userId, 'cashSessions'),
        where('status', '==', 'open')
      )
    }
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return { success: true, data: null }
    }

    // Filtrar resultados si es sucursal principal (sin branchId)
    let filteredDocs = snapshot.docs
    if (!branchId) {
      filteredDocs = snapshot.docs.filter(doc => {
        const data = doc.data()
        return !data.branchId || data.branchId === null
      })
    }

    // Filtrar por usuario si se proporciona userUid
    if (userUid) {
      filteredDocs = filteredDocs.filter(doc => {
        const data = doc.data()
        // Si la sesión tiene openedByUserId, debe coincidir exactamente
        if (data.openedByUserId) return data.openedByUserId === userUid
        // Sesiones antiguas sin openedByUserId pertenecen al owner (userId)
        return userUid === userId
      })
    }

    if (filteredDocs.length === 0) {
      return { success: true, data: null }
    }

    // Si hay múltiples sesiones abiertas (no debería pasar), tomar la más reciente
    let mostRecentSession = filteredDocs[0]
    filteredDocs.forEach(doc => {
      const currentOpenedAt = doc.data().openedAt?.toDate?.() || new Date(0)
      const mostRecentOpenedAt = mostRecentSession.data().openedAt?.toDate?.() || new Date(0)
      if (currentOpenedAt > mostRecentOpenedAt) {
        mostRecentSession = doc
      }
    })

    return {
      success: true,
      data: {
        id: mostRecentSession.id,
        ...mostRecentSession.data(),
      },
    }
  } catch (error) {
    console.error('Error al obtener sesión de caja:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todas las sesiones de caja abiertas en una sucursal
 * @param {string} businessId - ID del negocio
 * @param {string|null} branchId - ID de la sucursal (null = Sucursal Principal)
 * @returns {Promise<{success: boolean, data?: Array}>}
 */
export const getOpenCashSessions = async (businessId, branchId = null) => {
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'cashSessions'),
      where('status', '==', 'open')
    )
    const snapshot = await getDocs(q)

    // Filtrar por sucursal en el cliente
    const sessions = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(session => {
        if (branchId) {
          return session.branchId === branchId
        } else {
          return !session.branchId || session.branchId === null
        }
      })

    return { success: true, data: sessions }
  } catch (error) {
    console.error('Error al obtener sesiones abiertas:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Abrir caja
 * @param {string} userId - ID del negocio
 * @param {number} openingAmount - Monto inicial
 * @param {string|null} branchId - ID de la sucursal (null = Sucursal Principal)
 * @param {string|null} userUid - Firebase UID del usuario que abre la caja
 * @param {string|null} userName - Nombre del usuario que abre la caja
 */
export const openCashRegister = async (userId, openingAmount, branchId = null, userUid = null, userName = null) => {
  try {
    // Verificar que no haya una caja abierta para esta sucursal Y este usuario
    const currentSession = await getCashRegisterSession(userId, branchId, userUid)
    if (currentSession.success && currentSession.data) {
      return { success: false, error: 'Ya hay una caja abierta para esta sucursal' }
    }

    const sessionData = {
      openingAmount,
      status: 'open',
      openedAt: serverTimestamp(),
      openedBy: userId,
      createdAt: serverTimestamp(),
    }

    // Solo agregar branchId si no es null (sucursal adicional)
    if (branchId) {
      sessionData.branchId = branchId
    }

    // Guardar datos del usuario que abre la caja
    if (userUid) {
      sessionData.openedByUserId = userUid
      sessionData.openedByName = userName || ''
    }

    const docRef = await addDoc(collection(db, 'businesses', userId, 'cashSessions'), sessionData)

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al abrir caja:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cerrar caja
 * @param {string} userId - ID del negocio
 * @param {string} sessionId - ID de la sesión de caja
 * @param {object} closingData - Datos de cierre
 * @param {string|null} userUid - Firebase UID del usuario que cierra la caja
 * @param {string|null} userName - Nombre del usuario que cierra la caja
 */
export const closeCashRegister = async (userId, sessionId, closingData, userUid = null, userName = null) => {
  try {
    // Verificar que la sesión no esté ya cerrada (protección contra doble clic)
    const sessionRef = doc(db, 'businesses', userId, 'cashSessions', sessionId)
    const sessionSnap = await getDoc(sessionRef)
    if (sessionSnap.exists() && sessionSnap.data().status === 'closed') {
      return { success: true, alreadyClosed: true }
    }

    const { cash, card, transfer, yape, plin, rappi, pedidosYa, diDiFood, totalSales, salesCash, salesCard, salesTransfer, salesYape, salesPlin, salesRappi, salesPedidosYa, salesDiDiFood, totalIncome, totalExpense, expectedAmount, difference, invoiceCount } = closingData
    const closingAmount = cash + card + transfer + (yape || 0) + (plin || 0) + (rappi || 0) + (pedidosYa || 0) + (diDiFood || 0)

    const updateData = {
      closingAmount,
      closingCash: cash,
      closingCard: card,
      closingTransfer: transfer,
      closingYape: yape || 0,
      closingPlin: plin || 0,
      closingRappi: rappi || 0,
      closingPedidosYa: pedidosYa || 0,
      closingDiDiFood: diDiFood || 0,
      status: 'closed',
      closedAt: serverTimestamp(),
      closedBy: userId,
      // Datos adicionales para historial
      totalSales: totalSales || 0,
      salesCash: salesCash || 0,
      salesCard: salesCard || 0,
      salesTransfer: salesTransfer || 0,
      salesYape: salesYape || 0,
      salesPlin: salesPlin || 0,
      salesRappi: salesRappi || 0,
      salesPedidosYa: salesPedidosYa || 0,
      salesDiDiFood: salesDiDiFood || 0,
      totalIncome: totalIncome || 0,
      totalExpense: totalExpense || 0,
      expectedAmount: expectedAmount || 0,
      difference: difference || 0,
      invoiceCount: invoiceCount || 0,
    }

    // Guardar datos del usuario que cierra la caja
    if (userUid) {
      updateData.closedByUserId = userUid
      updateData.closedByName = userName || ''
    }

    await updateDoc(sessionRef, updateData)

    return { success: true }
  } catch (error) {
    console.error('Error al cerrar caja:', error)
    return { success: false, error: error.message }
  }
}

/**
 * TEMPORAL: Actualizar sesión de caja cerrada (para correcciones)
 * TODO: Quitar esta función cuando ya no sea necesaria
 */
export const updateCashSession = async (userId, sessionId, updateData) => {
  try {
    const { closingCash, closingCard, closingTransfer, openingAmount } = updateData
    const closingAmount = (closingCash || 0) + (closingCard || 0) + (closingTransfer || 0)

    // Recalcular diferencia
    const expectedAmount = (openingAmount || 0) + (updateData.totalSales || 0) + (updateData.totalIncome || 0) - (updateData.totalExpense || 0)
    const difference = closingAmount - expectedAmount

    await updateDoc(doc(db, 'businesses', userId, 'cashSessions', sessionId), {
      closingAmount,
      closingCash: closingCash || 0,
      closingCard: closingCard || 0,
      closingTransfer: closingTransfer || 0,
      openingAmount: openingAmount || 0,
      expectedAmount,
      difference,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar sesión de caja:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Agregar movimiento de caja
 */
export const addCashMovement = async (userId, sessionId, movementData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', userId, 'cashMovements'), {
      sessionId,
      type: movementData.type, // 'income' o 'expense'
      amount: movementData.amount,
      description: movementData.description,
      category: movementData.category || 'Otros',
      createdAt: serverTimestamp(),
      createdBy: userId,
    })

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al agregar movimiento:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener movimientos de una sesión
 */
export const getCashMovements = async (userId, sessionId) => {
  try {
    const q = query(
      collection(db, 'businesses', userId, 'cashMovements'),
      where('sessionId', '==', sessionId)
    )
    const snapshot = await getDocs(q)

    // Ordenar en el cliente para evitar índice compuesto
    const movements = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA // Más reciente primero
      })

    return { success: true, data: movements }
  } catch (error) {
    console.error('Error al obtener movimientos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todos los movimientos de caja (para Flujo de Caja)
 */
export const getAllCashMovements = async (userId) => {
  try {
    const snapshot = await getDocs(
      collection(db, 'businesses', userId, 'cashMovements')
    )

    const movements = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA
      })

    return { success: true, data: movements }
  } catch (error) {
    console.error('Error al obtener todos los movimientos:', error)
    return { success: false, error: error.message }
  }
}

// ==================== MOVIMIENTOS FINANCIEROS (Flujo de Caja) ====================

/**
 * Crear un movimiento financiero (para Flujo de Caja)
 */
export const createFinancialMovement = async (userId, movementData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', userId, 'financialMovements'), {
      ...movementData,
      createdAt: serverTimestamp(),
      createdBy: userId,
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear movimiento financiero:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todos los movimientos financieros
 */
export const getFinancialMovements = async (userId) => {
  try {
    const snapshot = await getDocs(
      collection(db, 'businesses', userId, 'financialMovements')
    )

    const movements = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const dateA = a.date?.toDate?.() || a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.date?.toDate?.() || b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA
      })

    return { success: true, data: movements }
  } catch (error) {
    console.error('Error al obtener movimientos financieros:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un movimiento financiero
 */
export const updateFinancialMovement = async (userId, movementId, movementData) => {
  try {
    await updateDoc(doc(db, 'businesses', userId, 'financialMovements', movementId), {
      ...movementData,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar movimiento financiero:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un movimiento financiero
 */
export const deleteFinancialMovement = async (userId, movementId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'financialMovements', movementId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar movimiento financiero:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un movimiento de caja
 */
export const updateCashMovement = async (userId, movementId, movementData) => {
  try {
    await updateDoc(doc(db, 'businesses', userId, 'cashMovements', movementId), {
      type: movementData.type,
      amount: movementData.amount,
      description: movementData.description,
      category: movementData.category || 'Otros',
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar movimiento:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un movimiento de caja
 */
export const deleteCashMovement = async (userId, movementId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'cashMovements', movementId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar movimiento:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener historial de sesiones de caja cerradas
 */
export const getCashRegisterHistory = async (userId, options = {}) => {
  try {
    const { limit: maxResults = 30, branchId = null, userUid = null } = options

    // Query con orderBy + limit para reducir documentos leídos desde Firestore
    const q = query(
      collection(db, 'businesses', userId, 'cashSessions'),
      where('status', '==', 'closed'),
      orderBy('closedAt', 'desc'),
      limit(maxResults * 3) // Traer extra para compensar filtros client-side
    )
    const snapshot = await getDocs(q)

    // Filtrar por sucursal y usuario en el cliente
    const sessions = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter(session => {
        // Filtrar por sucursal
        if (branchId) {
          if (session.branchId !== branchId) return false
        } else {
          if (session.branchId) return false
        }
        // Filtrar por usuario si se proporciona
        if (userUid) {
          if (session.openedByUserId) {
            if (session.openedByUserId !== userUid) return false
          } else {
            if (userUid !== userId) return false
          }
        }
        return true
      })
      .slice(0, maxResults)

    return { success: true, data: sessions }
  } catch (error) {
    console.error('Error al obtener historial de caja:', error)
    return { success: false, error: error.message }
  }
}

// ==================== GUÍAS DE REMISIÓN ====================

/**
 * Crear una nueva guía de remisión
 */
export const createDispatchGuide = async (businessId, guideData) => {
  try {
    // Obtener siguiente número usando branchSeries si hay sucursal
    const numberResult = await getNextDocumentNumber(
      businessId,
      'guia_remision',
      null,
      guideData.branchId || null
    )

    if (!numberResult.success) {
      throw new Error(numberResult.error || 'Error al obtener número de serie')
    }

    const guideNumber = numberResult.number
    const seriesPrefix = numberResult.series
    const newCorrelative = numberResult.correlativeNumber

    // Crear la guía en la subcolección
    const guideToSave = {
      ...guideData,
      number: guideNumber,
      series: seriesPrefix,
      correlative: newCorrelative,
      status: 'pending', // pending, sent, accepted, rejected
      sunatStatus: 'pending', // pending, sent, accepted, rejected
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      businessId: businessId,
    }

    const docRef = await addDoc(
      collection(db, 'businesses', businessId, 'dispatchGuides'),
      guideToSave
    )

    return {
      success: true,
      id: docRef.id,
      number: guideNumber,
      guide: { id: docRef.id, ...guideToSave }
    }
  } catch (error) {
    console.error('Error al crear guía de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener guías de remisión de un negocio
 */
export const getDispatchGuides = async (businessId) => {
  try {
    const querySnapshot = await getDocs(
      collection(db, 'businesses', businessId, 'dispatchGuides')
    )

    const guides = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar por fecha de creación (más reciente primero)
    guides.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: guides }
  } catch (error) {
    console.error('Error al obtener guías de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una guía de remisión por ID
 */
export const getDispatchGuide = async (businessId, guideId) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'dispatchGuides', guideId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Guía no encontrada' }
    }

    return {
      success: true,
      data: { id: docSnap.id, ...docSnap.data() }
    }
  } catch (error) {
    console.error('Error al obtener guía de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una guía de remisión
 */
export const updateDispatchGuide = async (businessId, guideId, updates) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'dispatchGuides', guideId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar guía de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una guía de remisión
 */
export const deleteDispatchGuide = async (businessId, guideId) => {
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'dispatchGuides', guideId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar guía de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar Guía de Remisión a SUNAT
 *
 * Esta función es INDEPENDIENTE de sendInvoiceToSunat para no afectar
 * el flujo existente de facturas y boletas.
 *
 * IMPORTANTE: Las GRE usan endpoints DIFERENTES a las facturas/boletas
 *
 * @param {string} businessId - ID del negocio
 * @param {string} guideId - ID de la guía de remisión
 * @returns {Promise<Object>} Resultado del envío
 */
export const sendDispatchGuideToSunat = async (businessId, guideId) => {
  try {
    console.log(`🚛 Enviando Guía de Remisión ${guideId} a SUNAT...`)

    // Obtener token de autenticación del usuario actual
    const user = auth.currentUser
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const idToken = await user.getIdToken()

    // Determinar URL de la Cloud Function (emulador o producción)
    const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

    const functionUrl = useEmulator
      ? 'http://127.0.0.1:5001/cobrify-395fe/us-central1/sendDispatchGuideToSunatFn'
      : 'https://senddispatchguidetosunatfn-tb5ph5ddsq-uc.a.run.app'

    console.log(`🌐 [GRE] Llamando a: ${functionUrl}`)

    // Llamar a la Cloud Function con fetch
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        businessId,
        guideId,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [GRE] Error HTTP Response:', errorText)
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('✅ [GRE] Respuesta de SUNAT:', result)

    return {
      success: result.success,
      accepted: result.accepted,
      method: result.method,
      responseCode: result.responseCode,
      description: result.description,
      error: result.error,
      guideNumber: result.guideNumber,
      sunatStatus: result.sunatStatus,
    }
  } catch (error) {
    console.error('❌ [GRE] Error al enviar guía a SUNAT:', error)

    return {
      success: false,
      error: error.message || 'Error al enviar guía de remisión a SUNAT',
    }
  }
}

// ==================== GUÍAS DE REMISIÓN TRANSPORTISTA ====================

/**
 * Crear una nueva guía de remisión transportista
 */
export const createCarrierDispatchGuide = async (businessId, guideData) => {
  try {
    // Obtener siguiente número usando branchSeries si hay sucursal
    const numberResult = await getNextDocumentNumber(
      businessId,
      'guia_transportista',
      null,
      guideData.branchId || null
    )

    if (!numberResult.success) {
      throw new Error(numberResult.error || 'Error al obtener número de serie')
    }

    const guideNumber = numberResult.number
    const seriesPrefix = numberResult.series
    const newCorrelative = numberResult.correlativeNumber

    // Crear la guía en la subcolección
    const guideToSave = {
      ...guideData,
      number: guideNumber,
      series: seriesPrefix,
      correlative: newCorrelative,
      documentType: '31', // 31 = GRE Transportista
      status: 'pending',
      sunatStatus: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      businessId: businessId,
    }

    const docRef = await addDoc(
      collection(db, 'businesses', businessId, 'carrierDispatchGuides'),
      guideToSave
    )

    return {
      success: true,
      id: docRef.id,
      number: guideNumber,
      guide: { id: docRef.id, ...guideToSave }
    }
  } catch (error) {
    console.error('Error al crear guía de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Guardar borrador de guía de remisión transportista
 */
export const saveCarrierDispatchGuideDraft = async (businessId, guideData, draftId = null) => {
  try {
    const guideToSave = {
      ...guideData,
      documentType: '31', // 31 = GRE Transportista
      status: 'draft',
      sunatStatus: null,
      updatedAt: serverTimestamp(),
      businessId: businessId,
    }

    if (draftId) {
      // Actualizar borrador existente
      const docRef = doc(db, 'businesses', businessId, 'carrierDispatchGuides', draftId)
      await updateDoc(docRef, guideToSave)
      return {
        success: true,
        id: draftId,
        guide: { id: draftId, ...guideToSave }
      }
    } else {
      // Crear nuevo borrador
      guideToSave.createdAt = serverTimestamp()
      const docRef = await addDoc(
        collection(db, 'businesses', businessId, 'carrierDispatchGuides'),
        guideToSave
      )
      return {
        success: true,
        id: docRef.id,
        guide: { id: docRef.id, ...guideToSave }
      }
    }
  } catch (error) {
    console.error('Error al guardar borrador de guía transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener guías de remisión transportista de un negocio
 */
export const getCarrierDispatchGuides = async (businessId) => {
  try {
    const querySnapshot = await getDocs(
      collection(db, 'businesses', businessId, 'carrierDispatchGuides')
    )

    const guides = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar por fecha de creación (más reciente primero)
    guides.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: guides }
  } catch (error) {
    console.error('Error al obtener guías de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una guía de remisión transportista por ID
 */
export const getCarrierDispatchGuide = async (businessId, guideId) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'carrierDispatchGuides', guideId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Guía no encontrada' }
    }

    return {
      success: true,
      data: { id: docSnap.id, ...docSnap.data() }
    }
  } catch (error) {
    console.error('Error al obtener guía de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una guía de remisión transportista
 */
export const updateCarrierDispatchGuide = async (businessId, guideId, updates) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'carrierDispatchGuides', guideId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar guía de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una guía de remisión transportista (borradores)
 */
export const deleteCarrierDispatchGuide = async (businessId, guideId) => {
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'carrierDispatchGuides', guideId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar guía de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar Guía de Remisión Transportista a SUNAT
 *
 * @param {string} businessId - ID del negocio
 * @param {string} guideId - ID de la guía de remisión transportista
 * @returns {Promise<Object>} Resultado del envío
 */
export const sendCarrierDispatchGuideToSunat = async (businessId, guideId) => {
  try {
    console.log(`🚚 Enviando GRE Transportista ${guideId} a SUNAT...`)

    // Obtener token de autenticación del usuario actual
    const user = auth.currentUser
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const idToken = await user.getIdToken()

    // Determinar URL de la Cloud Function (emulador o producción)
    const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

    const functionUrl = useEmulator
      ? 'http://127.0.0.1:5001/cobrify-395fe/us-central1/sendCarrierDispatchGuideToSunatFn'
      : 'https://sendcarrierdispatchguidetosunatfn-tb5ph5ddsq-uc.a.run.app'

    console.log(`🌐 [GRE-T] Llamando a: ${functionUrl}`)

    // Llamar a la Cloud Function con fetch
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        businessId,
        guideId,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [GRE-T] Error HTTP Response:', errorText)
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('✅ [GRE-T] Respuesta de SUNAT:', result)

    return {
      success: result.success,
      accepted: result.accepted,
      method: result.method,
      responseCode: result.responseCode,
      description: result.description,
      error: result.error,
      guideNumber: result.guideNumber,
      sunatStatus: result.sunatStatus,
    }
  } catch (error) {
    console.error('❌ [GRE-T] Error al enviar guía transportista a SUNAT:', error)

    return {
      success: false,
      error: error.message || 'Error al enviar guía de remisión transportista a SUNAT',
    }
  }
}

// ==================== PRÉSTAMOS ====================

// Obtener todos los préstamos
export const getLoans = async (businessId) => {
  try {
    const loansRef = collection(db, 'businesses', businessId, 'loans')
    const q = query(loansRef, orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    const loans = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    return { success: true, data: loans }
  } catch (error) {
    console.error('Error al obtener préstamos:', error)
    return { success: false, error: error.message }
  }
}

// Crear un préstamo
export const createLoan = async (businessId, loanData) => {
  try {
    const loansRef = collection(db, 'businesses', businessId, 'loans')
    const docRef = await addDoc(loansRef, {
      ...loanData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear préstamo:', error)
    return { success: false, error: error.message }
  }
}

// Actualizar un préstamo
export const updateLoan = async (businessId, loanId, loanData) => {
  try {
    const loanRef = doc(db, 'businesses', businessId, 'loans', loanId)
    await updateDoc(loanRef, {
      ...loanData,
      updatedAt: serverTimestamp()
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar préstamo:', error)
    return { success: false, error: error.message }
  }
}

// Eliminar un préstamo
export const deleteLoan = async (businessId, loanId) => {
  try {
    const loanRef = doc(db, 'businesses', businessId, 'loans', loanId)
    await deleteDoc(loanRef)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar préstamo:', error)
    return { success: false, error: error.message }
  }
}
