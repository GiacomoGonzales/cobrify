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

// ============ MODELO V2 (resellers nuevos: planes por duración) ============
// SOLO aplica a resellers con pricingModel === 'v2'. Los resellers actuales
// (sin ese campo) siguen con el modelo legacy de arriba, sin cambios.
// El precio es por duración; el toggle QPse/SUNAT directo solo cambia el límite
// de comprobantes (500 -> ilimitado). Básico es siempre 100 y solo QPse.
export const PLANS_V2 = {
  basico_mensual: { label: 'Básico Mensual', price: 19.90, months: 1, maxInvoices: 100, allowSunatDirect: false },
  mensual:        { label: 'Mensual',        price: 29.90, months: 1, maxInvoices: 500, allowSunatDirect: true },
  semestral:      { label: 'Semestral',      price: 149.90, months: 6, maxInvoices: 500, allowSunatDirect: true },
  anual:          { label: 'Anual',          price: 199.90, months: 12, maxInvoices: 500, allowSunatDirect: true },
}
export const BASE_PRICES_V2 = Object.fromEntries(
  Object.entries(PLANS_V2).map(([k, v]) => [k, v.price])
)
const DEFAULT_TIERS_V2 = [
  { id: 'bronze', name: 'Bronce', minClients: 0, discount: 10, icon: '🥉', color: 'amber' },
  { id: 'silver', name: 'Plata', minClients: 10, discount: 20, icon: '🥈', color: 'gray' },
  { id: 'gold', name: 'Oro', minClients: 100, discount: 30, icon: '🥇', color: 'yellow' }
]

// Helpers de modelo
export const isV2Reseller = (reseller) => reseller?.pricingModel === 'v2'
export const getModelOf = (reseller) => (reseller?.pricingModel === 'v2' ? 'v2' : 'legacy')
export const getBasePricesForModel = (model) => (model === 'v2' ? BASE_PRICES_V2 : BASE_PRICES)
export const getPlansForModel = (model) => (model === 'v2' ? PLANS_V2 : null)

// Cache por modelo para evitar múltiples lecturas
const tiersCache = { legacy: null, v2: null }
const tiersCacheTime = { legacy: null, v2: null }
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos

/**
 * Obtiene la configuración de tiers desde Firestore (por modelo).
 * legacy -> settings/resellerTiers (20/30/40) ; v2 -> settings/resellerTiersV2 (10/20/30)
 * Si no existe el doc, usa los defaults del modelo.
 */
export async function getTiersConfig(model = 'legacy') {
  const key = model === 'v2' ? 'v2' : 'legacy'
  const fallback = key === 'v2' ? DEFAULT_TIERS_V2 : DEFAULT_TIERS
  const docId = key === 'v2' ? 'resellerTiersV2' : 'resellerTiers'

  // Verificar cache
  if (tiersCache[key] && tiersCacheTime[key] && (Date.now() - tiersCacheTime[key] < CACHE_DURATION)) {
    return tiersCache[key]
  }

  try {
    const docSnap = await getDoc(doc(db, 'settings', docId))
    const value = docSnap.exists() && docSnap.data().tiers ? docSnap.data().tiers : fallback
    tiersCache[key] = value
    tiersCacheTime[key] = Date.now()
    return value
  } catch (error) {
    // Si hay error de permisos, usar defaults silenciosamente
    tiersCache[key] = fallback
    tiersCacheTime[key] = Date.now()
    return fallback
  }
}

/**
 * Actualiza la configuración de tiers (solo admin)
 */
export async function updateTiersConfig(tiers, model = 'legacy') {
  const key = model === 'v2' ? 'v2' : 'legacy'
  const docId = key === 'v2' ? 'resellerTiersV2' : 'resellerTiers'
  try {
    await setDoc(doc(db, 'settings', docId), { tiers })
    tiersCache[key] = tiers
    tiersCacheTime[key] = Date.now()
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
export async function getResellerTierInfo(resellerId, discountOverride = null, model = 'legacy') {
  const [tiers, activeClients] = await Promise.all([
    getTiersConfig(model),
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
export function calculatePrice(plan, discount, model = 'legacy') {
  const basePrices = model === 'v2' ? BASE_PRICES_V2 : BASE_PRICES
  const basePrice = basePrices[plan] || 0
  const discountDecimal = discount / 100
  // Redondeo a 2 decimales (los precios v2 tienen decimales; en legacy quedan enteros)
  return Math.round(basePrice * (1 - discountDecimal) * 100) / 100
}

/**
 * Obtiene todos los precios para un descuento dado
 */
export function getAllPrices(discount, model = 'legacy') {
  const basePrices = model === 'v2' ? BASE_PRICES_V2 : BASE_PRICES
  const prices = {}
  for (const [plan, basePrice] of Object.entries(basePrices)) {
    prices[plan] = {
      basePrice,
      finalPrice: calculatePrice(plan, discount, model),
      discount
    }
  }
  return prices
}
