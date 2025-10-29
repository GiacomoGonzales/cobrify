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
export const getProducts = async userId => {
  try {
    // Usar subcolección - ya no necesita filtro por userId
    const querySnapshot = await getDocs(collection(db, 'businesses', userId, 'products'))
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: products }
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
    const { cash, card, transfer } = closingData
    const closingAmount = cash + card + transfer

    await updateDoc(doc(db, 'businesses', userId, 'cashSessions', sessionId), {
      closingAmount,
      closingCash: cash,
      closingCard: card,
      closingTransfer: transfer,
      status: 'closed',
      closedAt: serverTimestamp(),
      closedBy: userId,
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
