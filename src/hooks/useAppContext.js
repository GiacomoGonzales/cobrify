import { useAuth } from '@/contexts/AuthContext'
import { useDemo } from '@/contexts/DemoContext'

/**
 * Hook unificado que retorna el contexto apropiado (demo o real)
 * Todos los componentes deben usar este hook en lugar de useAuth directamente
 */
export function useAppContext() {
  const authContext = useAuth()
  const demoContext = useDemo()

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
