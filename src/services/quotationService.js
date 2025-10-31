import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio para gestionar cotizaciones
 */

// ==================== COTIZACIONES ====================

/**
 * Crear una nueva cotización
 */
export const createQuotation = async (userId, quotationData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', userId, 'quotations'), {
      ...quotationData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear cotización:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener cotizaciones de un usuario
 */
export const getQuotations = async userId => {
  try {
    const querySnapshot = await getDocs(collection(db, 'businesses', userId, 'quotations'))
    const quotations = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar por fecha de creación (más reciente primero)
    quotations.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: quotations }
  } catch (error) {
    console.error('Error al obtener cotizaciones:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una cotización específica
 */
export const getQuotation = async (userId, quotationId) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'quotations', quotationId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return {
        success: true,
        data: { id: docSnap.id, ...docSnap.data() }
      }
    } else {
      return { success: false, error: 'Cotización no encontrada' }
    }
  } catch (error) {
    console.error('Error al obtener cotización:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una cotización
 */
export const updateQuotation = async (userId, quotationId, updates) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'quotations', quotationId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar cotización:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una cotización
 */
export const deleteQuotation = async (userId, quotationId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'quotations', quotationId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar cotización:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener siguiente número de cotización
 */
export const getNextQuotationNumber = async (userId) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      const series = data.series

      if (series && series.cotizacion) {
        const typeData = series.cotizacion
        const nextNumber = typeData.lastNumber + 1
        const formattedNumber = `${typeData.serie}-${String(nextNumber).padStart(8, '0')}`

        // Actualizar el último número
        await updateDoc(docRef, {
          'series.cotizacion.lastNumber': nextNumber,
          updatedAt: serverTimestamp(),
        })

        return {
          success: true,
          number: formattedNumber,
          series: typeData.serie,
          correlativeNumber: nextNumber
        }
      } else {
        // Si no existe la serie, crearla
        await updateDoc(docRef, {
          'series.cotizacion': {
            serie: 'COT',
            lastNumber: 1
          },
          updatedAt: serverTimestamp(),
        })

        return {
          success: true,
          number: 'COT-00000001',
          series: 'COT',
          correlativeNumber: 1
        }
      }
    }

    return { success: false, error: 'Configuración de empresa no encontrada' }
  } catch (error) {
    console.error('Error al obtener siguiente número de cotización:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar estado de cotización
 */
export const updateQuotationStatus = async (userId, quotationId, status) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'quotations', quotationId)
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar estado de cotización:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener cotizaciones expiradas
 */
export const getExpiredQuotations = async (userId) => {
  try {
    const result = await getQuotations(userId)
    if (!result.success) return result

    const now = new Date()
    const expiredQuotations = result.data.filter(quotation => {
      if (!quotation.expiryDate) return false

      const expiryDate = quotation.expiryDate.toDate ?
        quotation.expiryDate.toDate() :
        new Date(quotation.expiryDate)

      return expiryDate < now && quotation.status !== 'expired' && quotation.status !== 'converted'
    })

    return { success: true, data: expiredQuotations }
  } catch (error) {
    console.error('Error al obtener cotizaciones expiradas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Marcar cotización como enviada
 */
export const markQuotationAsSent = async (userId, quotationId, sentVia) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'quotations', quotationId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Cotización no encontrada' }
    }

    const currentData = docSnap.data()
    const currentSentVia = currentData.sentVia || []

    // Agregar el nuevo método de envío si no existe
    const updatedSentVia = currentSentVia.includes(sentVia)
      ? currentSentVia
      : [...currentSentVia, sentVia]

    await updateDoc(docRef, {
      status: 'sent',
      sentVia: updatedSentVia,
      sentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al marcar cotización como enviada:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Convertir cotización a factura
 */
export const convertToInvoice = async (userId, quotationId) => {
  try {
    const quotationRef = doc(db, 'businesses', userId, 'quotations', quotationId)
    const quotationSnap = await getDoc(quotationRef)

    if (!quotationSnap.exists()) {
      return { success: false, error: 'Cotización no encontrada' }
    }

    const quotation = quotationSnap.data()

    // Verificar que la cotización no esté vencida
    if (quotation.expiryDate) {
      const expiryDate = quotation.expiryDate.toDate ?
        quotation.expiryDate.toDate() :
        new Date(quotation.expiryDate)

      if (expiryDate < new Date()) {
        return { success: false, error: 'La cotización está vencida' }
      }
    }

    // Verificar que no esté ya convertida
    if (quotation.status === 'converted' || quotation.relatedInvoiceId) {
      return { success: false, error: 'La cotización ya fue convertida a factura' }
    }

    // Retornar los datos necesarios para crear la factura
    return {
      success: true,
      data: {
        customer: quotation.customer,
        items: quotation.items,
        subtotal: quotation.subtotal,
        igv: quotation.igv,
        total: quotation.total,
        notes: quotation.notes,
        discount: quotation.discount,
        discountType: quotation.discountType,
      }
    }
  } catch (error) {
    console.error('Error al convertir cotización:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Marcar cotización como convertida a factura
 */
export const markQuotationAsConverted = async (userId, quotationId, invoiceId) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'quotations', quotationId)
    await updateDoc(docRef, {
      status: 'converted',
      relatedInvoiceId: invoiceId,
      convertedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al marcar cotización como convertida:', error)
    return { success: false, error: error.message }
  }
}
