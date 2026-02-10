import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Cache para evitar múltiples lecturas
let plansCache = null
let plansCacheTime = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos

/**
 * Obtiene los planes personalizados desde Firestore (settings/customPlans)
 * Retorna un objeto { planId: planData, ... }
 */
export async function getCustomPlans() {
  if (plansCache && plansCacheTime && (Date.now() - plansCacheTime < CACHE_DURATION)) {
    return plansCache
  }

  try {
    const docRef = doc(db, 'settings', 'customPlans')
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      plansCache = docSnap.data().plans || {}
      plansCacheTime = Date.now()
      return plansCache
    }

    plansCache = {}
    plansCacheTime = Date.now()
    return {}
  } catch (error) {
    console.error('Error loading custom plans:', error)
    plansCache = {}
    plansCacheTime = Date.now()
    return {}
  }
}

/**
 * Crea un plan personalizado
 */
export async function createCustomPlan(planData) {
  try {
    const id = `custom_${Date.now()}`
    const now = new Date().toISOString()

    const plan = {
      id,
      name: planData.name,
      category: 'custom',
      months: planData.months || 1,
      totalPrice: planData.totalPrice || 0,
      pricePerMonth: planData.months > 0
        ? parseFloat((planData.totalPrice / planData.months).toFixed(2))
        : planData.totalPrice,
      emissionMethod: planData.emissionMethod || 'qpse',
      limits: {
        maxInvoicesPerMonth: planData.limits?.maxInvoicesPerMonth ?? 500,
        maxCustomers: -1,
        maxProducts: -1,
        maxBranches: planData.limits?.maxBranches ?? 1,
        sunatIntegration: planData.limits?.sunatIntegration ?? true,
        multiUser: planData.limits?.multiUser ?? true
      },
      notes: planData.notes || '',
      createdAt: now,
      updatedAt: now
    }

    // Leer planes actuales y agregar el nuevo
    const current = await getCustomPlans()
    const updated = { ...current, [id]: plan }

    const docRef = doc(db, 'settings', 'customPlans')
    await setDoc(docRef, { plans: updated })

    // Actualizar cache
    plansCache = updated
    plansCacheTime = Date.now()

    return { success: true, data: plan }
  } catch (error) {
    console.error('Error creating custom plan:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualiza un plan personalizado existente
 */
export async function updateCustomPlan(planId, planData) {
  try {
    const current = await getCustomPlans()
    if (!current[planId]) {
      return { success: false, error: 'Plan no encontrado' }
    }

    const updated = {
      ...current,
      [planId]: {
        ...current[planId],
        ...planData,
        pricePerMonth: planData.months > 0
          ? parseFloat((planData.totalPrice / planData.months).toFixed(2))
          : planData.totalPrice,
        updatedAt: new Date().toISOString()
      }
    }

    const docRef = doc(db, 'settings', 'customPlans')
    await setDoc(docRef, { plans: updated })

    plansCache = updated
    plansCacheTime = Date.now()

    return { success: true, data: updated[planId] }
  } catch (error) {
    console.error('Error updating custom plan:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Elimina un plan personalizado
 */
export async function deleteCustomPlan(planId) {
  try {
    const current = await getCustomPlans()
    const { [planId]: _, ...remaining } = current

    const docRef = doc(db, 'settings', 'customPlans')
    await setDoc(docRef, { plans: remaining })

    plansCache = remaining
    plansCacheTime = Date.now()

    return { success: true }
  } catch (error) {
    console.error('Error deleting custom plan:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Invalida el cache (forzar recarga)
 */
export function invalidateCustomPlansCache() {
  plansCache = null
  plansCacheTime = null
}

/**
 * Obtiene la lista de planes estándar ocultos
 */
export async function getHiddenPlans() {
  try {
    const docRef = doc(db, 'settings', 'hiddenPlans')
    const docSnap = await getDoc(docRef)
    return docSnap.exists() ? (docSnap.data().plans || []) : []
  } catch (error) {
    console.error('Error loading hidden plans:', error)
    return []
  }
}

/**
 * Oculta un plan estándar
 */
export async function hidePlan(planKey) {
  try {
    const current = await getHiddenPlans()
    if (current.includes(planKey)) return { success: true }
    const updated = [...current, planKey]
    await setDoc(doc(db, 'settings', 'hiddenPlans'), { plans: updated })
    return { success: true }
  } catch (error) {
    console.error('Error hiding plan:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Restaura un plan estándar oculto
 */
export async function unhidePlan(planKey) {
  try {
    const current = await getHiddenPlans()
    const updated = current.filter(k => k !== planKey)
    await setDoc(doc(db, 'settings', 'hiddenPlans'), { plans: updated })
    return { success: true }
  } catch (error) {
    console.error('Error unhiding plan:', error)
    return { success: false, error: error.message }
  }
}
