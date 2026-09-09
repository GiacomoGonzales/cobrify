import { useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { resolverPermisosDeComprobantes, ACCIONES_COMPLETAS } from '@/utils/permisosDeComprobantes'

/**
 * Qué puede hacer el usuario actual con un comprobante ya emitido:
 * `{ editar, anular }`.
 *
 * En modo demo y para dueño/admin devuelve todo en true. Un sub-usuario también
 * los tiene en true salvo que el dueño se los haya apagado en su ficha
 * (ver src/utils/permisosDeComprobantes.js).
 */
export function useInvoicePermissions() {
  const { isAdmin, isBusinessOwner, isDemoMode, invoicePermissions } = useAppContext()
  const esSecundario = !isDemoMode && !isAdmin && !isBusinessOwner

  return useMemo(() => {
    if (!esSecundario) return { ...ACCIONES_COMPLETAS }
    return resolverPermisosDeComprobantes({ esSecundario, invoicePermissions })
  }, [esSecundario, invoicePermissions])
}
