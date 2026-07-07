import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore'

/**
 * Requerimientos de compra de insumos (cocina → compras).
 *
 * El equipo de cocina (usualmente el turno de cierre) registra qué insumos
 * faltan y cuánto comprar; al día siguiente el comprador ve la lista, la
 * imprime/copia y al terminar la marca como comprada.
 *
 * Colección: businesses/{businessId}/requirements
 * Documento:
 *   {
 *     status: 'open' | 'sent' | 'purchased',
 *     branchId: string|null, branchName: string|null,   // sucursal de la cocina
 *     notes: string,
 *     items: [{
 *       ingredientId: string|null,   // null = ítem de texto libre (ej. "gas")
 *       name, unit, qty, priority: 'alta'|'media'|'baja',
 *       stockAtRequest: number|null, // stock al momento de pedir (referencial)
 *     }],
 *     createdAt, createdBy, createdByName,
 *     sentAt?, purchasedAt?, purchasedBy?, purchasedByName?,
 *   }
 *
 * Todas las funciones devuelven { success, data?, error? } (patrón del repo).
 */

const requirementsRef = (businessId) => collection(db, 'businesses', businessId, 'requirements')

export const getRequirements = async (businessId) => {
  try {
    const q = query(requirementsRef(businessId), orderBy('createdAt', 'desc'), limit(200))
    const snap = await getDocs(q)
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    return { success: true, data }
  } catch (error) {
    console.error('Error obteniendo requerimientos:', error)
    return { success: false, error: error.message }
  }
}

export const createRequirement = async (businessId, data) => {
  try {
    const docRef = await addDoc(requirementsRef(businessId), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, data: { id: docRef.id } }
  } catch (error) {
    console.error('Error creando requerimiento:', error)
    return { success: false, error: error.message }
  }
}

export const updateRequirement = async (businessId, requirementId, updates) => {
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'requirements', requirementId), {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error actualizando requerimiento:', error)
    return { success: false, error: error.message }
  }
}

export const deleteRequirement = async (businessId, requirementId) => {
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'requirements', requirementId))
    return { success: true }
  } catch (error) {
    console.error('Error eliminando requerimiento:', error)
    return { success: false, error: error.message }
  }
}
