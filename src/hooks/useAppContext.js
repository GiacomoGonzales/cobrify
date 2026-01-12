import { useAuth } from '@/contexts/AuthContext'
import { useDemo } from '@/contexts/DemoContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'
import { useDemoPharmacy } from '@/contexts/DemoPharmacyContext'

/**
 * Hook unificado que retorna el contexto apropiado (demo o real)
 * Todos los componentes deben usar este hook en lugar de useAuth directamente
 */
export function useAppContext() {
  const authContext = useAuth()
  const demoContext = useDemo()
  const demoRestaurantContext = useDemoRestaurant()
  const demoPharmacyContext = useDemoPharmacy()

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
      businessSettings: { dispatchGuidesEnabled: true, enableProductImages: true },
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
      businessSettings: { dispatchGuidesEnabled: true, enableProductImages: true }, // Habilitar guías e imágenes en demo
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
      businessSettings: { dispatchGuidesEnabled: true, enableProductImages: true }, // Habilitar guías e imágenes en demo
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
