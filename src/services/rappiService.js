import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

const RAPPI_SOURCE = 'rappi'

/**
 * Suscripción en tiempo real a los pedidos Rappi del negocio.
 */
export const subscribeToRappiOrders = (businessId, onChange, onError) => {
  if (!businessId) return () => {}
  const ordersRef = collection(db, 'businesses', businessId, 'orders')
  const q = query(ordersRef, where('source', '==', RAPPI_SOURCE))
  return onSnapshot(q, (snapshot) => {
    const data = []
    snapshot.forEach(d => data.push({ id: d.id, ...d.data() }))
    data.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0
      const tb = b.createdAt?.toMillis?.() || 0
      return tb - ta
    })
    onChange(data)
  }, onError)
}

/**
 * Marca un pedido Rappi como facturado.
 */
export const markRappiOrderInvoiced = async (businessId, orderId, invoiceId) => {
  if (!businessId || !orderId) return { success: false, error: 'Datos incompletos' }
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    await updateDoc(orderRef, {
      invoiceId: invoiceId || null,
      invoicedAt: serverTimestamp(),
      status: 'completed',
    })
    return { success: true }
  } catch (error) {
    console.error('Error marcando orden Rappi como facturada:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Vincula manualmente un SKU de Rappi con un producto del catálogo Cobrify.
 * Actualiza el item dentro del array `items` del pedido.
 */
export const mapRappiItemToProduct = async (businessId, orderId, itemIndex, product) => {
  if (!businessId || !orderId || itemIndex == null || !product) {
    return { success: false, error: 'Datos incompletos' }
  }
  try {
    const orderRef = doc(db, 'businesses', businessId, 'orders', orderId)
    // Trae el doc actual para mutar el array items
    const { getDoc } = await import('firebase/firestore')
    const snap = await getDoc(orderRef)
    if (!snap.exists()) return { success: false, error: 'Pedido no existe' }
    const data = snap.data()
    const items = Array.isArray(data.items) ? [...data.items] : []
    if (!items[itemIndex]) return { success: false, error: 'Item fuera de rango' }
    items[itemIndex] = {
      ...items[itemIndex],
      productId: product.id,
      sku: product.sku || product.code || items[itemIndex].sku || '',
      mappedManually: true,
    }
    await updateDoc(orderRef, { items })
    return { success: true }
  } catch (error) {
    console.error('Error mapeando item Rappi:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Inserta un pedido de prueba en Firestore con `source: 'rappi'` para testing del UI.
 * SOLO debe usarse en desarrollo/testing.
 */
export const createMockRappiOrder = async (businessId) => {
  if (!businessId) return { success: false, error: 'Sin businessId' }
  try {
    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    const mockOrder = {
      source: RAPPI_SOURCE,
      status: 'pending',
      rappiOrderId: `MOCK-${Date.now().toString().slice(-6)}`,
      customerName: 'Cliente Rappi Demo',
      customerPhone: '999888777',
      customerEmail: '',
      customerAddress: 'Av. Demo 123, Lima',
      customerDocumentType: 'dni',
      customerDocumentNumber: '00000000',
      items: [
        {
          name: 'Lomo Saltado',
          sku: 'PLATO-001',
          rappiId: 'rappi-12345',
          productId: '',
          price: 28.00,
          quantity: 1,
        },
        {
          name: 'Chicha Morada 500ml',
          sku: 'BEB-002',
          rappiId: 'rappi-12346',
          productId: '',
          price: 6.00,
          quantity: 2,
        },
      ],
      subtotal: 33.90,
      igv: 6.10,
      total: 40.00,
      paymentMethod: 'rappi_pay',
      notes: 'Sin cebolla',
      createdAt: Timestamp.now(),
    }
    const ref = await addDoc(ordersRef, mockOrder)
    return { success: true, id: ref.id }
  } catch (error) {
    console.error('Error creando pedido mock:', error)
    return { success: false, error: error.message }
  }
}
