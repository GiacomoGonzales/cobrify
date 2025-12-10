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
    // Usar subcolección: businesses/{userId}/customers
    const docRef = await addDoc(collection(db, 'businesses', userId, 'customers'), {
      ...customerData,
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
    const docRef = doc(db, 'businesses', userId, 'customers', customerId)
    await updateDoc(docRef, {
      ...updates,
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
      const newCustomerData = {
        documentType: customerData.documentType || 'DNI',
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
 * Eliminar un producto
 */
export const deleteProduct = async (userId, productId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'products', productId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar producto:', error)
    return { success: false, error: error.message }
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
 * Convertir una Nota de Venta a Boleta
 * - Crea una nueva boleta con los datos de la nota de venta
 * - NO descuenta stock (ya fue descontado en la venta original)
 * - Marca la nota de venta como convertida
 * - Retorna la nueva boleta para enviarla a SUNAT si es necesario
 */
export const convertNotaVentaToBoleta = async (userId, notaVentaId, customerData = null) => {
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
      return { success: false, error: `Esta nota ya fue convertida a boleta ${notaVenta.convertedTo}` }
    }

    // 4. Verificar que no esté anulada
    if (notaVenta.status === 'voided') {
      return { success: false, error: 'No se puede convertir una nota de venta anulada' }
    }

    // 5. Obtener siguiente número de boleta
    const numberResult = await getNextDocumentNumber(userId, 'boleta')
    if (!numberResult.success) {
      return { success: false, error: 'Error al obtener número de boleta: ' + numberResult.error }
    }

    // 6. Preparar datos del cliente (usar los proporcionados o los originales)
    const customer = customerData || notaVenta.customer || {
      name: 'VARIOS',
      documentType: 'DNI',
      documentNumber: '00000000'
    }

    // 7. Crear la nueva boleta
    const boletaData = {
      // Datos del documento
      documentType: 'boleta',
      number: numberResult.number,
      series: numberResult.series,
      correlativeNumber: numberResult.correlativeNumber,

      // Datos del cliente
      customer: {
        name: customer.name || 'VARIOS',
        documentType: customer.documentType || 'DNI',
        documentNumber: customer.documentNumber || '00000000',
        address: customer.address || '',
        email: customer.email || '',
        phone: customer.phone || '',
      },

      // Copiar items de la nota de venta
      items: notaVenta.items || [],

      // Copiar totales
      subtotal: notaVenta.subtotal || 0,
      tax: notaVenta.tax || 0,
      total: notaVenta.total || 0,
      discount: notaVenta.discount || 0,

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

    // 8. Guardar la boleta
    const boletaRef = await addDoc(collection(db, 'businesses', userId, 'invoices'), boletaData)

    // 9. Actualizar la nota de venta para marcarla como convertida
    await updateDoc(notaRef, {
      convertedTo: {
        type: 'boleta',
        id: boletaRef.id,
        number: numberResult.number,
        convertedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    })

    return {
      success: true,
      boletaId: boletaRef.id,
      boletaNumber: numberResult.number,
      boleta: {
        id: boletaRef.id,
        ...boletaData,
      }
    }
  } catch (error) {
    console.error('Error al convertir nota de venta a boleta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener siguiente número de documento
 */
export const getNextDocumentNumber = async (userId, documentType) => {
  try {
    // Las series ahora están en businesses/{userId}
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      const series = data.series

      if (series && series[documentType]) {
        const typeData = series[documentType]
        const nextNumber = typeData.lastNumber + 1
        const formattedNumber = `${typeData.serie}-${String(nextNumber).padStart(8, '0')}`

        // Actualizar el último número
        await updateDoc(docRef, {
          [`series.${documentType}.lastNumber`]: nextNumber,
          updatedAt: serverTimestamp(),
        })

        return {
          success: true,
          number: formattedNumber,
          series: typeData.serie,
          correlativeNumber: nextNumber
        }
      }
    }

    return { success: false, error: 'Series no encontradas' }
  } catch (error) {
    console.error('Error al obtener siguiente número:', error)
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
 */
export const getCashRegisterSession = async userId => {
  try {
    const q = query(
      collection(db, 'businesses', userId, 'cashSessions'),
      where('status', '==', 'open')
    )
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return { success: true, data: null }
    }

    // Si hay múltiples sesiones abiertas (no debería pasar), tomar la más reciente
    let mostRecentSession = snapshot.docs[0]
    snapshot.docs.forEach(doc => {
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
 * Abrir caja
 */
export const openCashRegister = async (userId, openingAmount) => {
  try {
    // Verificar que no haya una caja abierta
    const currentSession = await getCashRegisterSession(userId)
    if (currentSession.success && currentSession.data) {
      return { success: false, error: 'Ya hay una caja abierta' }
    }

    const docRef = await addDoc(collection(db, 'businesses', userId, 'cashSessions'), {
      openingAmount,
      status: 'open',
      openedAt: serverTimestamp(),
      openedBy: userId,
      createdAt: serverTimestamp(),
    })

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al abrir caja:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cerrar caja
 */
export const closeCashRegister = async (userId, sessionId, closingData) => {
  try {
    const { cash, card, transfer, totalSales, salesCash, salesCard, salesTransfer, salesYape, salesPlin, totalIncome, totalExpense, expectedAmount, difference } = closingData
    const closingAmount = cash + card + transfer

    await updateDoc(doc(db, 'businesses', userId, 'cashSessions', sessionId), {
      closingAmount,
      closingCash: cash,
      closingCard: card,
      closingTransfer: transfer,
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
      totalIncome: totalIncome || 0,
      totalExpense: totalExpense || 0,
      expectedAmount: expectedAmount || 0,
      difference: difference || 0,
    })

    return { success: true }
  } catch (error) {
    console.error('Error al cerrar caja:', error)
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
    const { limit: maxResults = 30 } = options

    // Query simple sin orderBy para evitar necesitar índice compuesto
    const q = query(
      collection(db, 'businesses', userId, 'cashSessions'),
      where('status', '==', 'closed')
    )
    const snapshot = await getDocs(q)

    // Ordenar en el cliente por closedAt descendente
    const sessions = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const dateA = a.closedAt?.toDate?.() || new Date(0)
        const dateB = b.closedAt?.toDate?.() || new Date(0)
        return dateB - dateA // Más reciente primero
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
    // Obtener la serie actual y el siguiente número correlativo
    const businessRef = doc(db, 'businesses', businessId)
    const businessDoc = await getDoc(businessRef)

    if (!businessDoc.exists()) {
      throw new Error('Negocio no encontrado')
    }

    const businessData = businessDoc.data()
    const series = businessData.series?.guia_remision || { serie: 'T001', lastNumber: 0 }

    // Incrementar el número correlativo
    const newCorrelative = (series.lastNumber || 0) + 1
    const guideNumber = `${series.serie}-${String(newCorrelative).padStart(8, '0')}`

    // Crear la guía en la subcolección
    const guideToSave = {
      ...guideData,
      number: guideNumber,
      series: series.serie,
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

    // Actualizar el contador de series
    await updateDoc(businessRef, {
      'series.guia_remision.lastNumber': newCorrelative,
      updatedAt: serverTimestamp(),
    })

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
