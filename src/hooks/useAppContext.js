import { useAuth } from '@/contexts/AuthContext'
import { useDemo } from '@/contexts/DemoContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'
import { useDemoPharmacy } from '@/contexts/DemoPharmacyContext'
import { useDemoHotel } from '@/contexts/DemoHotelContext'
import { useDemoVeterinary } from '@/contexts/DemoVeterinaryContext'

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
      businessSettings: { businessMode: 'hotel', enableProductImages: true, multiplePricesEnabled: true, presentationsEnabled: true, posCustomFields: {} },
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
      businessSettings: { businessMode: 'veterinary', enableProductImages: true, multiplePricesEnabled: true, presentationsEnabled: true, batchControlEnabled: true },
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
      businessSettings: { dispatchGuidesEnabled: true, enableProductImages: true, multiplePricesEnabled: true, presentationsEnabled: true },
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
      businessSettings: { dispatchGuidesEnabled: true, enableProductImages: true, multiplePricesEnabled: true, presentationsEnabled: true }, // Habilitar guías e imágenes en demo
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
      businessMode: 'retail', // Modo por defecto en demo
      businessSettings: { dispatchGuidesEnabled: true, enableProductImages: true, multiplePricesEnabled: true, presentationsEnabled: true }, // Habilitar guías e imágenes en demo
      userFeatures: { expenseManagement: true }, // Features habilitados en demo
      hasFeature: (feature) => ['expenseManagement'].includes(feature), // Features disponibles en demo
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
