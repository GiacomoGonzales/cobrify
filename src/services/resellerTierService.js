import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Configuración por defecto de tiers
const DEFAULT_TIERS = [
  { id: 'bronze', name: 'Bronce', minClients: 0, discount: 20, icon: '🥉', color: 'amber' },
  { id: 'silver', name: 'Plata', minClients: 10, discount: 30, icon: '🥈', color: 'gray' },
  { id: 'gold', name: 'Oro', minClients: 100, discount: 40, icon: '🥇', color: 'yellow' }
]

// Precios base (números redondos)
export const BASE_PRICES = {
  qpse_1_month: 20,
  qpse_6_months: 100,
  qpse_12_months: 150,
  sunat_direct_1_month: 20,
  sunat_direct_6_months: 100,
  sunat_direct_12_months: 150,
}

// Cache para evitar múltiples lecturas
let tiersCache = null
let tiersCacheTime = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos

/**
 * Obtiene la configuración de tiers desde Firestore
 * Si no existe, la crea con valores por defecto
 */
export async function getTiersConfig() {
  // Verificar cache
  if (tiersCache && tiersCacheTime && (Date.now() - tiersCacheTime < CACHE_DURATION)) {
    return tiersCache
  }

  try {
    const docRef = doc(db, 'settings', 'resellerTiers')
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      tiersCache = docSnap.data().tiers
      tiersCacheTime = Date.now()
      return tiersCache
    }

    // Si no existe, crear con valores por defecto
    await setDoc(docRef, { tiers: DEFAULT_TIERS })
    tiersCache = DEFAULT_TIERS
    tiersCacheTime = Date.now()
    return DEFAULT_TIERS
  } catch (error) {
    console.error('Error getting tiers config:', error)
    return DEFAULT_TIERS
  }
}

/**
 * Actualiza la configuración de tiers (solo admin)
 */
export async function updateTiersConfig(tiers) {
  try {
    const docRef = doc(db, 'settings', 'resellerTiers')
    await setDoc(docRef, { tiers })
    tiersCache = tiers
    tiersCacheTime = Date.now()
    return true
  } catch (error) {
    console.error('Error updating tiers config:', error)
    return false
  }
}

/**
 * Cuenta los clientes activos de un reseller
 */
export async function countActiveClients(resellerId) {
  try {
    const clientsQuery = query(
      collection(db, 'subscriptions'),
      where('resellerId', '==', resellerId),
      where('status', '==', 'active')
    )
    const snapshot = await getDocs(clientsQuery)
    return snapshot.size
  } catch (error) {
    console.error('Error counting active clients:', error)
    return 0
  }
}

/**
 * Calcula el tier actual basado en cantidad de clientes
 */
export function calculateTier(clientCount, tiers) {
  // Ordenar tiers por minClients descendente
  const sortedTiers = [...tiers].sort((a, b) => b.minClients - a.minClients)

  // Encontrar el tier que corresponde
  for (const tier of sortedTiers) {
    if (clientCount >= tier.minClients) {
      return tier
    }
  }

  // Por defecto retornar el tier más bajo
  return tiers[0]
}

/**
 * Obtiene el siguiente tier (para mostrar progreso)
 */
export function getNextTier(currentTier, tiers) {
  const sortedTiers = [...tiers].sort((a, b) => a.minClients - b.minClients)
  const currentIndex = sortedTiers.findIndex(t => t.id === currentTier.id)

  if (currentIndex < sortedTiers.length - 1) {
    return sortedTiers[currentIndex + 1]
  }

  return null // Ya está en el tier máximo
}

/**
 * Obtiene toda la información del tier para un reseller
 */
export async function getResellerTierInfo(resellerId, discountOverride = null) {
  const [tiers, activeClients] = await Promise.all([
    getTiersConfig(),
    countActiveClients(resellerId)
  ])

  const currentTier = calculateTier(activeClients, tiers)
  const nextTier = getNextTier(currentTier, tiers)

  // Si hay override, usar ese descuento pero mantener el tier visual
  const effectiveDiscount = discountOverride !== null ? discountOverride : currentTier.discount

  return {
    currentTier,
    nextTier,
    activeClients,
    effectiveDiscount,
    hasOverride: discountOverride !== null,
    progress: nextTier ? {
      current: activeClients,
      target: nextTier.minClients,
      remaining: nextTier.minClients - activeClients,
      percentage: Math.min(100, Math.round((activeClients / nextTier.minClients) * 100))
    } : null
  }
}

/**
 * Calcula el precio con descuento para un plan
 */
export function calculatePrice(plan, discount) {
  const basePrice = BASE_PRICES[plan] || 0
  const discountDecimal = discount / 100
  return Math.round(basePrice * (1 - discountDecimal))
}

/**
 * Obtiene todos los precios para un descuento dado
 */
export function getAllPrices(discount) {
  const prices = {}
  for (const [plan, basePrice] of Object.entries(BASE_PRICES)) {
    prices[plan] = {
      basePrice,
      finalPrice: calculatePrice(plan, discount),
      discount
    }
  }
  return prices
}
