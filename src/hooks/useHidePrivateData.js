import { useAppContext } from './useAppContext'

/**
 * Devuelve true cuando el usuario actual debe ver los totales y la información
 * sensible ocultados, según la configuración del negocio
 * (`businessSettings.hideDashboardDataFromSecondary`).
 *
 * Aplica solamente a usuarios secundarios (no admin, no business owner) y
 * nunca al modo demo, donde la opción no aplica.
 */
export function useHidePrivateData() {
  const { isAdmin, isBusinessOwner, businessSettings, isDemoMode } = useAppContext()
  if (isDemoMode) return false
  const isSecondaryUser = !isAdmin && !isBusinessOwner
  return isSecondaryUser && !!businessSettings?.hideDashboardDataFromSecondary
}
