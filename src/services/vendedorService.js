import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  query,
  where
} from 'firebase/firestore'
import { db } from '../lib/firebase'

const COLLECTION = 'vendedores'

// Crear un nuevo vendedor
export const createVendedor = async (data) => {
  try {
    const vendedorData = {
      name: data.name || '',
      phone: data.phone || '',
      yapeNumber: data.yapeNumber || '',
      yapeName: data.yapeName || '',
      bcpAccount: data.bcpAccount || '',
      bcpCci: data.bcpCci || '',
      titular: data.titular || '',
      linkedUserId: data.linkedUserId || null,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }

    const docRef = await addDoc(collection(db, COLLECTION), vendedorData)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear vendedor:', error)
    return { success: false, error: error.message }
  }
}

// Obtener todos los vendedores
export const getVendedores = async () => {
  try {
    const q = query(collection(db, COLLECTION), orderBy('name', 'asc'))
    const snapshot = await getDocs(q)
    const vendedores = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    return { success: true, data: vendedores }
  } catch (error) {
    console.error('Error al obtener vendedores:', error)
    return { success: false, error: error.message }
  }
}

// Obtener un vendedor por ID
export const getVendedor = async (vendedorId) => {
  try {
    const docRef = doc(db, COLLECTION, vendedorId)
    const docSnap = await getDoc(docRef)
    if (docSnap.exists()) {
      return { success: true, data: { id: docSnap.id, ...docSnap.data() } }
    }
    return { success: false, error: 'Vendedor no encontrado' }
  } catch (error) {
    console.error('Error al obtener vendedor:', error)
    return { success: false, error: error.message }
  }
}

// Actualizar un vendedor
export const updateVendedor = async (vendedorId, data) => {
  try {
    const docRef = doc(db, COLLECTION, vendedorId)
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar vendedor:', error)
    return { success: false, error: error.message }
  }
}

// Obtener vendedor vinculado a un usuario
export const getVendedorByLinkedUser = async (userId) => {
  try {
    const q = query(collection(db, COLLECTION), where('linkedUserId', '==', userId))
    const snapshot = await getDocs(q)
    if (snapshot.empty) return { success: false, error: 'No vinculado' }
    const vendedorDoc = snapshot.docs[0]
    return { success: true, data: { id: vendedorDoc.id, ...vendedorDoc.data() } }
  } catch (error) {
    console.error('Error al buscar vendedor vinculado:', error)
    return { success: false, error: error.message }
  }
}

// Obtener clientes asignados a un vendedor
export const getVendedorClients = async (vendedorId) => {
  try {
    const q = query(collection(db, 'subscriptions'), where('vendedorId', '==', vendedorId))
    const snapshot = await getDocs(q)

    const clients = []
    for (const subDoc of snapshot.docs) {
      const subData = subDoc.data()
      // Obtener datos del negocio
      let businessData = {}
      try {
        const businessDoc = await getDoc(doc(db, 'businesses', subDoc.id))
        if (businessDoc.exists()) businessData = businessDoc.data()
      } catch (e) { /* skip */ }

      clients.push({
        id: subDoc.id,
        plan: subData.plan || '',
        planName: subData.planName || subData.plan || '',
        status: subData.status || '',
        currentPeriodEnd: subData.currentPeriodEnd,
        businessName: businessData.businessName || businessData.razonSocial || '',
        ruc: businessData.ruc || '',
        phone: businessData.phone || '',
      })
    }

    return { success: true, data: clients }
  } catch (error) {
    console.error('Error al obtener clientes del vendedor:', error)
    return { success: false, error: error.message }
  }
}

// Eliminar un vendedor
export const deleteVendedor = async (vendedorId) => {
  try {
    const docRef = doc(db, COLLECTION, vendedorId)
    await deleteDoc(docRef)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar vendedor:', error)
    return { success: false, error: error.message }
  }
}
