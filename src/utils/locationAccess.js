import { useAppContext } from '@/hooks/useAppContext'

/**
 * Filtro de seguridad por ubicación (sucursal / almacén) para usuarios secundarios.
 *
 * Determina si un registro (factura, compra, gasto, movimiento, cotización, etc.)
 * es visible para el usuario actual según sus sucursales/almacenes habilitados.
 *
 * Reglas:
 * - El dueño del negocio (isBusinessOwner) y el super admin (isAdmin) ven todo.
 * - allowedBranches/allowedWarehouses vacíos = sin restricción (ve todo).
 * - Registro SIN branchId = "Sucursal Principal" → visible solo si hasMainBranchAccess.
 * - Por almacén es "legacy-safe": un registro sin warehouseId NO se oculta (datos antiguos).
 *
 * @param {object} record - registro con campos de ubicación (branchId / warehouseId).
 * @param {object} ctx - { isBusinessOwner, isAdmin, allowedBranches, allowedWarehouses, hasMainBranchAccess }
 * @param {object} [opts]
 * @param {string} [opts.branchField='branchId']      - nombre del campo de sucursal en el registro.
 * @param {string} [opts.warehouseField='warehouseId']- nombre del campo de almacén en el registro.
 * @param {string[]} [opts.warehouseFields]           - varios campos de almacén (ej. transferencias:
 *                                                        ['warehouseId','fromWarehouse','toWarehouse']).
 *                                                        Si CUALQUIERA está permitido, el registro pasa.
 * @returns {boolean}
 */
export function canAccessByLocation(record, ctx, opts = {}) {
  if (!record) return false
  const { isBusinessOwner, isAdmin, allowedBranches, allowedWarehouses, hasMainBranchAccess } = ctx || {}
  const { branchField = 'branchId', warehouseField = 'warehouseId', warehouseFields } = opts

  // Dueño del negocio o super admin ven todo
  if (isBusinessOwner || isAdmin) return true

  // Restricción por sucursal (allowedBranches vacío = acceso a todas)
  if (allowedBranches && allowedBranches.length > 0) {
    const branchId = record[branchField]
    if (!branchId) {
      // Registro sin sucursal = Sucursal Principal
      if (!hasMainBranchAccess) return false
    } else if (!allowedBranches.includes(branchId)) {
      return false
    }
  }

  // Restricción por almacén (allowedWarehouses vacío = acceso a todos).
  // Legacy-safe: registros sin almacén guardado no se ocultan por este criterio.
  if (allowedWarehouses && allowedWarehouses.length > 0) {
    const fields = warehouseFields || [warehouseField]
    const present = fields.map(f => record[f]).filter(Boolean)
    // Solo se evalúa si el registro trae al menos un almacén; si trae varios
    // (transferencias), basta con que UNO esté permitido para verlo.
    if (present.length > 0 && !present.some(w => allowedWarehouses.includes(w))) {
      return false
    }
  }

  return true
}

/**
 * Hook que devuelve un predicado listo para filtrar registros por permisos de ubicación.
 *
 * Uso:
 *   const canAccess = useLocationAccess()
 *   const visibles = registros.filter(r => canAccess(r))
 *   // con campos personalizados:
 *   const visibles = movs.filter(m => canAccess(m, { warehouseFields: ['warehouseId','fromWarehouse','toWarehouse'] }))
 */
export function useLocationAccess() {
  const { isBusinessOwner, isAdmin, allowedBranches, allowedWarehouses, hasMainBranchAccess } = useAppContext()
  const ctx = { isBusinessOwner, isAdmin, allowedBranches, allowedWarehouses, hasMainBranchAccess }
  return (record, opts) => canAccessByLocation(record, ctx, opts)
}
