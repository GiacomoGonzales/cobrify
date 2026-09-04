import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useDemo } from '@/contexts/DemoContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'
import { useDemoPharmacy } from '@/contexts/DemoPharmacyContext'
import { useDemoHotel } from '@/contexts/DemoHotelContext'
import { useDemoVeterinary } from '@/contexts/DemoVeterinaryContext'
import { useDemoLogistics } from '@/contexts/DemoLogisticsContext'

// Los ajustes de cada demo viven FUERA del hook, como constantes, para que
// `businessSettings` tenga siempre la misma identidad. Antes eran literales
// dentro del `return`: un objeto nuevo en cada render. Cualquier pantalla con
// `useEffect(..., [businessSettings])` que hiciera `setState` entraba en bucle
// infinito en modo demo (lo detectó la reorganización de Configuración).
const AJUSTES_DEMO_BASE = Object.freeze({
  dispatchGuidesEnabled: true, enableProductImages: true, multiplePricesEnabled: true, presentationsEnabled: true,
})
const AJUSTES_DEMO_LOGISTICA = Object.freeze({
  businessMode: 'logistics', enableProductImages: true, multiplePricesEnabled: true, presentationsEnabled: true, dispatchGuidesEnabled: true,
})
const AJUSTES_DEMO_HOTEL = Object.freeze({
  businessMode: 'hotel', enableProductImages: true, multiplePricesEnabled: true, presentationsEnabled: true, posCustomFields: {},
})
const AJUSTES_DEMO_VETERINARIA = Object.freeze({
  businessMode: 'veterinary', enableProductImages: true, multiplePricesEnabled: true, presentationsEnabled: true, batchControlEnabled: true,
})

/**
 * Hook unificado que retorna el contexto apropiado (demo o real)
 * Todos los componentes deben usar este hook en lugar de useAuth directamente
 */
export function useAppContext() {
  const authContext = useAuth()
  const demoContext = useDemo()
  const demoRestaurantContext = useDemoRestaurant()
  const demoPharmacyContext = useDemoPharmacy()
  const demoHotelContext = useDemoHotel()
  const demoVeterinaryContext = useDemoVeterinary()
  const demoLogisticsContext = useDemoLogistics()

  // El demo generico arma sus ajustes con los del rubro elegido: se memoiza
  // sobre lo que los cambia, y se calcula siempre (antes de cualquier `return`)
  // para no romper la regla de los hooks.
  const negocioDemo = demoContext?.demoData?.business
  const rubroDemo = demoContext?.rubroDemo
  const ajustesDemoGenerico = useMemo(() => ({
    ...AJUSTES_DEMO_BASE,
    ...(negocioDemo?.ajustesDemo || {}),
    // Marca que este demo es de un rubro: el Sidebar la usa para aplicar
    // los filtros normales en vez de ensenar TODOS los modulos.
    ...(rubroDemo ? { rubroDemo } : {}),
  }), [negocioDemo, rubroDemo])

  // Si estamos en modo demo de logística, usar datos de demo de logística
  if (demoLogisticsContext?.isDemoMode) {
    return {
      user: demoLogisticsContext.demoData.user,
      isAuthenticated: true,
      isLoading: false,
      isAdmin: false,
      subscription: demoLogisticsContext.demoData.subscription,
      hasAccess: true,
      isDemoMode: true,
      demoData: demoLogisticsContext.demoData,
      businessMode: 'logistics',
      businessSettings: AJUSTES_DEMO_LOGISTICA,
      userFeatures: { expenseManagement: true },
      hasFeature: (feature) => ['expenseManagement'].includes(feature),
      getBusinessId: () => demoLogisticsContext.demoData.user.uid,
      login: async () => ({ success: false, error: 'Demo mode' }),
      logout: async () => {},
      refreshSubscription: async () => {},
    }
  }

  // Si estamos en modo demo de hotel, usar datos de demo de hotel
  if (demoHotelContext?.isDemo) {
    return {
      user: demoHotelContext.user,
      isAuthenticated: true,
      isLoading: false,
      isAdmin: false,
      subscription: { status: 'active', accessBlocked: false },
      hasAccess: true,
      isDemoMode: true,
      demoData: demoHotelContext,
      businessMode: 'hotel',
      businessSettings: AJUSTES_DEMO_HOTEL,
      userFeatures: { expenseManagement: true },
      hasFeature: (feature) => ['expenseManagement'].includes(feature),
      getBusinessId: demoHotelContext.getBusinessId,
      login: async () => ({ success: false, error: 'Demo mode' }),
      logout: async () => {},
      refreshSubscription: async () => {},
    }
  }

  // Si estamos en modo demo de veterinaria, usar datos de demo de veterinaria
  if (demoVeterinaryContext?.isDemoMode) {
    return {
      user: demoVeterinaryContext.demoData.user,
      isAuthenticated: true,
      isLoading: false,
      isAdmin: false,
      subscription: demoVeterinaryContext.demoData.subscription,
      hasAccess: true,
      isDemoMode: true,
      demoData: demoVeterinaryContext.demoData,
      businessMode: 'veterinary',
      businessSettings: AJUSTES_DEMO_VETERINARIA,
      userFeatures: { expenseManagement: true },
      hasFeature: (feature) => ['expenseManagement'].includes(feature),
      getBusinessId: () => demoVeterinaryContext.demoData.user.uid,
      login: async () => ({ success: false, error: 'Demo mode' }),
      logout: async () => {},
      refreshSubscription: async () => {},
    }
  }

  // Si estamos en modo demo de farmacia, usar datos de demo de farmacia
  if (demoPharmacyContext?.isDemoMode) {
    return {
      user: demoPharmacyContext.demoData.user,
      isAuthenticated: true, // En demo siempre "autenticado"
      isLoading: false,
      isAdmin: false,
      subscription: demoPharmacyContext.demoData.subscription,
      hasAccess: true,
      isDemoMode: true,
      demoData: demoPharmacyContext.demoData,
      businessMode: 'pharmacy', // Modo farmacia
      businessSettings: AJUSTES_DEMO_BASE,
      userFeatures: { expenseManagement: true },
      hasFeature: (feature) => ['expenseManagement'].includes(feature),
      getBusinessId: () => demoPharmacyContext.demoData.user.uid,
      login: async () => ({ success: false, error: 'Demo mode' }),
      logout: async () => {},
      refreshSubscription: async () => {},
    }
  }

  // Si estamos en modo demo de restaurante, usar datos de demo de restaurante
  if (demoRestaurantContext?.isDemo) {
    return {
      user: demoRestaurantContext.user,
      isAuthenticated: true, // En demo siempre "autenticado"
      isLoading: false,
      isAdmin: false,
      subscription: { status: 'active', accessBlocked: false },
      hasAccess: true,
      isDemoMode: true,
      demoData: demoRestaurantContext,
      businessMode: 'restaurant', // Modo restaurante
      businessSettings: AJUSTES_DEMO_BASE, // Habilitar guías e imágenes en demo
      userFeatures: { expenseManagement: true }, // Features habilitados en demo
      hasFeature: (feature) => ['expenseManagement'].includes(feature), // Features disponibles en demo
      getBusinessId: demoRestaurantContext.getBusinessId,
      login: async () => ({ success: false, error: 'Demo mode' }),
      logout: async () => {},
      refreshSubscription: async () => {},
    }
  }

  // Si estamos en modo demo, usar datos de demo
  if (demoContext?.isDemoMode) {
    return {
      user: demoContext.demoData.user,
      isAuthenticated: true, // En demo siempre "autenticado"
      isLoading: false,
      isAdmin: false,
      subscription: demoContext.demoData.subscription,
      hasAccess: true,
      isDemoMode: true,
      demoData: demoContext.demoData,
      // Demo por rubro: el modo y los ajustes salen del rubro (una pastelería
      // enciende Producción, una ferretería apaga la Agenda de Citas). El demo
      // genérico conserva los de siempre.
      businessMode: demoContext.demoData.business?.businessMode || 'retail',
      businessSettings: ajustesDemoGenerico,
      userFeatures: { expenseManagement: true }, // Features habilitados en demo
      hasFeature: (feature) => (
        demoContext.demoData.business?.featuresDemo
          ? demoContext.demoData.business.featuresDemo.includes(feature)
          : ['expenseManagement'].includes(feature)
      ),
      getBusinessId: () => demoContext.demoData.user.uid, // Retornar el ID del usuario demo
      login: async () => ({ success: false, error: 'Demo mode' }),
      logout: async () => {},
      refreshSubscription: async () => {},
    }
  }

  // Modo normal, usar auth context
  return {
    ...authContext,
    isDemoMode: false,
    demoData: null,
  }
}
