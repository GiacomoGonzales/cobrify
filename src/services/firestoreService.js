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
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'

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

    // Obtener referencia a la Cloud Function
    const sendToSunatFunction = httpsCallable(functions, 'sendInvoiceToSunat')

    // Llamar a la Cloud Function
    const result = await sendToSunatFunction({
      userId,
      invoiceId,
    })

    console.log('✅ Respuesta de SUNAT:', result.data)

    return {
      success: result.data.success,
      status: result.data.status,
      message: result.data.message,
      observations: result.data.observations || [],
    }
  } catch (error) {
    console.error('❌ Error al enviar a SUNAT:', error)

    // Extraer mensaje de error más específico
    let errorMessage = 'Error al enviar a SUNAT'

    if (error.code === 'functions/not-found') {
      errorMessage = 'Cloud Function no encontrada. Asegúrate de que las funciones estén desplegadas.'
    } else if (error.code === 'functions/unauthenticated') {
      errorMessage = 'No estás autenticado. Inicia sesión nuevamente.'
    } else if (error.code === 'functions/permission-denied') {
      errorMessage = 'No tienes permisos para realizar esta operación.'
    } else if (error.code === 'functions/failed-precondition') {
      errorMessage = error.message || 'Precondición fallida'
    } else if (error.code === 'functions/invalid-argument') {
      errorMessage = error.message || 'Argumentos inválidos'
    } else if (error.message) {
      errorMessage = error.message
    }

    return {
      success: false,
      error: errorMessage,
    }
  }
}
