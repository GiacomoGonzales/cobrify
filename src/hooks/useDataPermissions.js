import { useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { resolverPermisosDeDatos, PERMISOS_COMPLETOS } from '@/utils/dataPermissions'

/**
 * Los tres permisos de datos del usuario actual: `{ verTotales, verCostos, exportar }`.
 *
 * En modo demo y para dueño/admin devuelve todo en true. Para un sub-usuario
 * sin permisos propios se deriva de la opción del negocio, así que quienes ya
 * venían trabajando no ven ningún cambio (ver src/utils/dataPermissions.js).
 */
export function useDataPermissions() {
  const { isAdmin, isBusinessOwner, businessSettings, isDemoMode, dataPermissions } = useAppContext()
  const esSecundario = !isDemoMode && !isAdmin && !isBusinessOwner
  const ocultarPorDefecto = !!businessSettings?.hideDashboardDataFromSecondary

  return useMemo(() => {
    if (!esSecundario) return { ...PERMISOS_COMPLETOS }
    return resolverPermisosDeDatos({ esSecundario, dataPermissions, ocultarPorDefecto })
  }, [esSecundario, dataPermissions, ocultarPorDefecto])
}
