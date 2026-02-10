import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Warehouse,
  Plus,
  Edit,
  Trash2,
  MapPin,
  CheckCircle,
  XCircle,
  Loader2,
  Package,
  RefreshCw,
  AlertTriangle,
  Phone,
  Store,
  Search,
  MoreVertical,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  syncAllProductsStock,
} from '@/services/warehouseService'
import { getProducts, getAllBranchSeriesFS, getCompanySettings } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'
import { FileText } from 'lucide-react'

// Schema de validación
const warehouseSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  location: z.string().optional(),
  address: z.string().optional(), // Dirección completa para comprobantes
  phone: z.string().optional(), // Teléfono del local
  isDefault: z.boolean().optional(),
  branchId: z.string().optional(), // Sucursal a la que pertenece
})

export default function Warehouses() {
  const { user, getBusinessId, filterBranchesByAccess, isDemoMode } = useAppContext()
  const toast = useToast()
  const [warehouses, setWarehouses] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState(null)
  const [deletingWarehouse, setDeletingWarehouse] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncPreview, setSyncPreview] = useState(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [branchSeries, setBranchSeries] = useState({})
  const [globalSeries, setGlobalSeries] = useState({})
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: '',
      location: '',
      isDefault: false,
    },
  })

  // Nombre de sucursal principal (dinámico)
  const mainBranchName = companySettings?.mainBranchName || 'Sucursal Principal'

  useEffect(() => {
    loadWarehouses()
    loadBranches()
    loadCompanySettings()
  }, [user])

  // Cargar configuración de la empresa
  const loadCompanySettings = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const result = await getCompanySettings(getBusinessId())
      if (result.success) {
        setCompanySettings(result.data)
      }
    } catch (error) {
      console.error('Error al cargar configuración:', error)
    }
  }

  // Cargar sucursales para filtro y asignación
  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const result = await getActiveBranches(getBusinessId())
      if (result.success) {
        const branchList = filterBranchesByAccess ? filterBranchesByAccess(result.data || []) : (result.data || [])
        setBranches(branchList)
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
    }
  }

  // Filtrar almacenes
  const filteredWarehouses = warehouses.filter(warehouse => {
    // Filtrar por búsqueda
    const search = searchTerm.toLowerCase()
    const matchesSearch = !searchTerm ||
      warehouse.name?.toLowerCase().includes(search) ||
      warehouse.location?.toLowerCase().includes(search)

    // Filtrar por sucursal
    let matchesBranch = true
    if (filterBranch !== 'all') {
      if (filterBranch === 'main') {
        matchesBranch = !warehouse.branchId
      } else {
        matchesBranch = warehouse.branchId === filterBranch
      }
    }

    return matchesSearch && matchesBranch
  })

  // Helper para obtener nombre de sucursal
  const getBranchName = (branchId) => {
    if (!branchId) return mainBranchName
    const branch = branches.find(b => b.id === branchId)
    return branch?.name || 'Sin asignar'
  }

  const loadWarehouses = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const result = await getWarehouses(getBusinessId())
      if (result.success) {
        setWarehouses(result.data || [])
      } else {
        toast.error(result.error || 'Error al cargar almacenes')
      }

      // Cargar series por sucursal y globales
      const seriesResult = await getAllBranchSeriesFS(getBusinessId())
      if (seriesResult.success) {
        setBranchSeries(seriesResult.data || {})
        setGlobalSeries(seriesResult.globalSeries || {})
      }
    } catch (error) {
      console.error('Error al cargar almacenes:', error)
      toast.error('Error al cargar almacenes')
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingWarehouse(null)
    // No marcamos isDefault aquí, el servicio lo detectará automáticamente
    // si es el primer almacén de la sucursal
    reset({
      name: '',
      location: '',
      address: '',
      phone: '',
      isDefault: false,
      branchId: '',
    })
    setIsModalOpen(true)
  }

  const openEditModal = (warehouse) => {
    setEditingWarehouse(warehouse)
    reset({
      name: warehouse.name,
      location: warehouse.location || '',
      address: warehouse.address || '',
      phone: warehouse.phone || '',
      isDefault: warehouse.isDefault || false,
      branchId: warehouse.branchId || '',
    })
    setIsModalOpen(true)
  }

  const onSubmit = async (data) => {
    setIsSaving(true)
    try {
      let result

      if (editingWarehouse) {
        // Actualizar
        result = await updateWarehouse(getBusinessId(), editingWarehouse.id, data)
      } else {
        // Crear
        result = await createWarehouse(getBusinessId(), data)
      }

      if (result.success) {
        toast.success(
          editingWarehouse
            ? 'Almacén actualizado exitosamente'
            : 'Almacén creado exitosamente'
        )
        setIsModalOpen(false)
        loadWarehouses()
      } else {
        toast.error(result.error || 'Error al guardar almacén')
      }
    } catch (error) {
      console.error('Error al guardar almacén:', error)
      toast.error('Error al guardar almacén')
    } finally {
      setIsSaving(false)
    }
  }

  const [deleteError, setDeleteError] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (warehouseId) => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const result = await deleteWarehouse(getBusinessId(), warehouseId)
      if (result.success) {
        toast.success('Almacén eliminado exitosamente')
        setDeletingWarehouse(null)
        loadWarehouses()
      } else {
        // Mostrar error con lista de productos si existe
        if (result.productsWithStock && result.productsWithStock.length > 0) {
          setDeleteError({
            message: result.error,
            products: result.productsWithStock
          })
        } else {
          toast.error(result.error || 'Error al eliminar almacén')
        }
      }
    } catch (error) {
      console.error('Error al eliminar almacén:', error)
      toast.error('Error al eliminar almacén')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCloseDeleteModal = () => {
    setDeletingWarehouse(null)
    setDeleteError(null)
  }

  // Analizar qué productos necesitan sincronización
  const handleAnalyzeSync = async () => {
    const defaultWarehouse = warehouses.find(w => w.isDefault) || warehouses[0]
    if (!defaultWarehouse) {
      toast.error('No hay almacén por defecto para sincronizar')
      return
    }

    setIsLoadingPreview(true)
    setSyncPreview(null)

    try {
      const result = await getProducts(getBusinessId())
      if (!result.success) {
        toast.error('Error al cargar productos')
        return
      }

      const products = result.data || []
      const changes = []

      for (const product of products) {
        // Solo procesar productos con control de stock
        if (product.stock === null || product.stock === undefined || product.trackStock === false) {
          continue
        }

        const currentStock = product.stock || 0
        const warehouseStocks = product.warehouseStocks || []
        const warehouseTotal = warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)

        // Si ya están sincronizados, saltar
        if (currentStock === warehouseTotal && warehouseStocks.length > 0) {
          continue
        }

        // Determinar qué cambio se hará
        let changeType = ''
        let oldValue = 0
        let newValue = 0

        if (warehouseStocks.length > 0 && warehouseTotal > 0) {
          // CASO 1: Actualizar stock general desde almacén
          changeType = 'update_stock'
          oldValue = currentStock
          newValue = warehouseTotal
        } else if (warehouseStocks.length === 0 && currentStock > 0) {
          // CASO 2: Asignar stock huérfano al almacén
          changeType = 'assign_warehouse'
          oldValue = currentStock
          newValue = currentStock
        } else if (warehouseStocks.length > 0 && warehouseTotal === 0 && currentStock > 0) {
          // CASO 3: Almacén en 0 pero stock > 0
          changeType = 'assign_warehouse'
          oldValue = currentStock
          newValue = currentStock
        } else {
          continue
        }

        changes.push({
          id: product.id,
          name: product.name,
          code: product.code || '-',
          changeType,
          oldValue,
          newValue,
          warehouseTotal,
          currentStock,
        })
      }

      setSyncPreview({
        targetWarehouse: defaultWarehouse,
        changes,
        totalProducts: products.length,
      })
    } catch (error) {
      console.error('Error al analizar productos:', error)
      toast.error('Error al analizar productos')
    } finally {
      setIsLoadingPreview(false)
    }
  }

  // Sincronizar stock de todos los productos al almacén por defecto
  const handleSyncStock = async () => {
    if (!syncPreview?.targetWarehouse) {
      toast.error('No hay almacén por defecto para sincronizar')
      return
    }

    setIsSyncing(true)
    try {
      const result = await syncAllProductsStock(getBusinessId(), syncPreview.targetWarehouse.id)
      if (result.success) {
        toast.success(`Stock sincronizado: ${result.synced} producto(s) actualizado(s)`)
        setShowSyncModal(false)
        setSyncPreview(null)
      } else {
        toast.error(result.error || 'Error al sincronizar stock')
      }
    } catch (error) {
      console.error('Error al sincronizar stock:', error)
      toast.error('Error al sincronizar stock')
    } finally {
      setIsSyncing(false)
    }
  }

  // Cerrar modal y limpiar preview
  const handleCloseSyncModal = () => {
    setShowSyncModal(false)
    setSyncPreview(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Warehouse className="w-7 h-7" />
            Almacenes
          </h1>
          <p className="text-gray-600 mt-1">Gestiona tus almacenes y puntos de inventario</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {warehouses.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowSyncModal(true)}
              className="flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Sincronizar Stock
            </Button>
          )}
          <Button onClick={openCreateModal} className="flex items-center justify-center gap-2 w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Nuevo Almacén
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Almacenes</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{warehouses.length}</p>
              </div>
              <Warehouse className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Almacenes Activos</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  {warehouses.filter((w) => w.isActive).length}
                </p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  {branches.length > 0 ? 'Almacenes Principales' : 'Almacén Principal'}
                </p>
                {branches.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {/* Principal de Sucursal Principal */}
                    {(() => {
                      const mainDefault = warehouses.find(w => w.isDefault && !w.branchId)
                      return mainDefault ? (
                        <p className="text-sm text-gray-700">
                          <span className="text-primary-600 font-medium">Principal:</span> {mainDefault.name}
                        </p>
                      ) : null
                    })()}
                    {/* Principales por sucursal */}
                    {branches.slice(0, 3).map(branch => {
                      const branchDefault = warehouses.find(w => w.isDefault && w.branchId === branch.id)
                      return branchDefault ? (
                        <p key={branch.id} className="text-sm text-gray-700">
                          <span className="text-blue-600 font-medium">{branch.name}:</span> {branchDefault.name}
                        </p>
                      ) : null
                    })}
                    {branches.length > 3 && (
                      <p className="text-xs text-gray-500">+{branches.length - 3} más...</p>
                    )}
                  </div>
                ) : (
                  <p className="text-lg font-bold text-gray-900 mt-2">
                    {warehouses.find((w) => w.isDefault)?.name || 'No definido'}
                  </p>
                )}
              </div>
              <Package className="w-10 h-10 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm flex-1 min-w-0">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar por nombre o ubicación..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
            {/* Filtro de Sucursal */}
            {branches.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <Store className="w-4 h-4 text-gray-500" />
                <select
                  value={filterBranch}
                  onChange={e => setFilterBranch(e.target.value)}
                  className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas las sucursales</option>
                  <option value="main">{mainBranchName}</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla de almacenes */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Almacenes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : filteredWarehouses.length === 0 ? (
            <div className="text-center py-12">
              <Warehouse className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm || filterBranch !== 'all' ? 'No se encontraron almacenes' : 'No hay almacenes registrados'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || filterBranch !== 'all'
                  ? 'Intenta con otros filtros de búsqueda'
                  : 'Crea tu primer almacén para comenzar a gestionar inventario'}
              </p>
              {!searchTerm && filterBranch === 'all' && (
                <Button onClick={openCreateModal}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Primer Almacén
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden">
              {/* Vista móvil - Tarjetas */}
              <div className="lg:hidden divide-y divide-gray-100">
                {filteredWarehouses.map((warehouse) => {
                  const wSeries = warehouse.branchId
                    ? branchSeries[warehouse.branchId]
                    : globalSeries
                  return (
                    <div key={warehouse.id} className="px-4 py-3 hover:bg-gray-50">
                      {/* Fila 1: Nombre + acciones */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate flex-1">{warehouse.name}</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const rect = e.currentTarget.getBoundingClientRect()
                            const menuHeight = 120
                            const spaceBelow = window.innerHeight - rect.bottom
                            const openUpward = spaceBelow < menuHeight
                            setMenuPosition({
                              top: openUpward ? rect.top - 8 : rect.bottom + 8,
                              right: window.innerWidth - rect.right,
                              openUpward
                            })
                            setOpenMenuId(openMenuId === warehouse.id ? null : warehouse.id)
                          }}
                          className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Fila 2: Sucursal + Ubicación */}
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Store className="w-3 h-3" />
                          {getBranchName(warehouse.branchId)}
                        </span>
                        {warehouse.location && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3" />
                              {warehouse.location}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Fila 3: Series + Badges */}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          {warehouse.isDefault && (
                            <Badge variant="primary" className="text-xs">Principal</Badge>
                          )}
                          {warehouse.isActive ? (
                            <Badge variant="success" className="text-xs">Activo</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Inactivo</Badge>
                          )}
                        </div>
                        {wSeries && (wSeries.factura || wSeries.boleta) ? (
                          <span className="text-xs font-mono text-gray-500">
                            F:{wSeries.factura?.serie || '-'} B:{wSeries.boleta?.serie || '-'}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600">Sin series</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Vista desktop - Tabla */}
              <div className="hidden lg:block">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
                  <div className="col-span-2">Nombre</div>
                  <div className="col-span-2">Sucursal</div>
                  <div className="col-span-2">Ubicación</div>
                  <div className="col-span-2">Series</div>
                  <div className="col-span-1">Estado</div>
                  <div className="col-span-1">Principal</div>
                  <div className="col-span-2 text-right">Acciones</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {filteredWarehouses.map((warehouse) => {
                    const wSeries = warehouse.branchId
                      ? branchSeries[warehouse.branchId]
                      : globalSeries
                    return (
                      <div key={warehouse.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50">
                        <div className="col-span-2">
                          <div className="flex items-center gap-2">
                            <Warehouse className="w-4 h-4 text-gray-400" />
                            <span className="font-medium text-sm">{warehouse.name}</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Store className="w-4 h-4" />
                            <span className="text-sm">{getBranchName(warehouse.branchId)}</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="w-4 h-4" />
                            <span className="text-sm">{warehouse.location || 'No especificada'}</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          {wSeries && (wSeries.factura || wSeries.boleta) ? (
                            <div className="flex items-center gap-1">
                              <FileText className="w-4 h-4 text-blue-500" />
                              <div className="text-xs">
                                <span className="font-mono text-gray-700">
                                  F:{wSeries.factura?.serie || '-'}
                                </span>
                                <span className="mx-1 text-gray-400">|</span>
                                <span className="font-mono text-gray-700">
                                  B:{wSeries.boleta?.serie || '-'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Sin configurar
                            </span>
                          )}
                        </div>
                        <div className="col-span-1">
                          {warehouse.isActive ? (
                            <Badge variant="success" className="text-xs">Activo</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Inactivo</Badge>
                          )}
                        </div>
                        <div className="col-span-1">
                          {warehouse.isDefault ? (
                            <Badge variant="primary" className="text-xs">Principal</Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                        <div className="col-span-2">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(warehouse)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingWarehouse(warehouse)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Menú de acciones flotante */}
              {openMenuId && (() => {
                const menuWarehouse = filteredWarehouses.find(w => w.id === openMenuId)
                if (!menuWarehouse) return null
                return (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                    <div
                      className="fixed w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                      style={{
                        top: `${menuPosition.top}px`,
                        right: `${menuPosition.right}px`,
                        transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                      }}
                    >
                      <button
                        onClick={() => { openEditModal(menuWarehouse); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Edit className="w-4 h-4 text-blue-600" />
                        Editar
                      </button>
                      <button
                        onClick={() => { setDeletingWarehouse(menuWarehouse); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingWarehouse ? 'Editar Almacén' : 'Nuevo Almacén'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Almacén *
            </label>
            <Input
              {...register('name')}
              placeholder="Ej: Almacén Principal"
              error={errors.name?.message}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ubicación (referencia)
            </label>
            <Input
              {...register('location')}
              placeholder="Ej: Lima - Cercado"
              error={errors.location?.message}
            />
          </div>

          {/* Sucursal */}
          {branches.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sucursal
              </label>
              <select
                {...register('branchId')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{mainBranchName}</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Selecciona a qué sucursal pertenece este almacén
              </p>
            </div>
          )}

          {/* Datos para comprobantes */}
          <div className="pt-4 border-t">
            <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Datos para Comprobantes
            </p>
            <p className="text-xs text-gray-500 mb-3">
              Estos datos aparecerán en las facturas y boletas emitidas desde este local
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección del Local
                </label>
                <Input
                  {...register('address')}
                  placeholder="Ej: Av. Grau 123, Cercado de Lima"
                  error={errors.address?.message}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono del Local
                </label>
                <Input
                  {...register('phone')}
                  placeholder="Ej: 01-234-5678"
                  error={errors.phone?.message}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              {...register('isDefault')}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="isDefault" className="text-sm text-gray-700">
              Marcar como almacén principal
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>{editingWarehouse ? 'Actualizar' : 'Crear'} Almacén</>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Eliminar */}
      <Modal
        isOpen={!!deletingWarehouse}
        onClose={handleCloseDeleteModal}
        title="Eliminar Almacén"
        size={deleteError ? 'lg' : 'md'}
      >
        <div className="space-y-4">
          {deleteError ? (
            <>
              {/* Error: hay productos con stock */}
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex gap-3">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">No se puede eliminar</p>
                    <p className="text-sm text-red-700 mt-1">{deleteError.message}</p>
                  </div>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deleteError.products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-right">{product.stock}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <p className="text-sm text-gray-600">
                Debes transferir el stock de estos productos a otro almacén antes de eliminar este.
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleCloseDeleteModal}
                  className="flex-1"
                >
                  Entendido
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Confirmación normal */}
              <p className="text-gray-600">
                ¿Estás seguro de eliminar el almacén <strong>{deletingWarehouse?.name}</strong>?
              </p>
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  Esta acción no se puede deshacer. El sistema verificará que no haya productos con stock en este almacén.
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleCloseDeleteModal}
                  className="flex-1"
                  disabled={isDeleting}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => handleDelete(deletingWarehouse.id)}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    'Eliminar'
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Modal Sincronizar Stock */}
      <Modal
        isOpen={showSyncModal}
        onClose={handleCloseSyncModal}
        title="Sincronizar Stock de Productos"
        size={syncPreview ? 'lg' : 'md'}
      >
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">¿Qué hace esta acción?</p>
                <p className="text-sm text-blue-700 mt-1">
                  Sincroniza el stock de los productos con el almacén principal: <strong>{warehouses.find(w => w.isDefault)?.name || warehouses[0]?.name}</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 list-disc list-inside space-y-1">
                  <li>Si el producto tiene stock en almacén, actualiza el stock general para que coincida</li>
                  <li>Si el producto tiene stock "huérfano" (sin almacén), lo asigna al almacén principal</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Vista previa de cambios */}
          {syncPreview ? (
            <div className="space-y-4">
              {syncPreview.changes.length === 0 ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                  <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-green-800 font-medium">¡Todo está sincronizado!</p>
                  <p className="text-sm text-green-700 mt-1">
                    No hay productos que necesiten sincronización.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-700">
                      <strong>{syncPreview.changes.length}</strong> producto(s) de <strong>{syncPreview.totalProducts}</strong> necesitan sincronización.
                    </p>
                  </div>

                  <div className="max-h-64 overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Cambio</TableHead>
                          <TableHead className="text-right">Antes</TableHead>
                          <TableHead className="text-right">Después</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {syncPreview.changes.map((change) => (
                          <TableRow key={change.id}>
                            <TableCell className="font-medium max-w-[150px] truncate" title={change.name}>
                              {change.name}
                            </TableCell>
                            <TableCell className="text-gray-500">{change.code}</TableCell>
                            <TableCell>
                              {change.changeType === 'update_stock' ? (
                                <Badge variant="secondary" className="text-xs">
                                  Actualizar stock
                                </Badge>
                              ) : (
                                <Badge variant="warning" className="text-xs">
                                  Asignar almacén
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {change.changeType === 'update_stock' ? (
                                <span className="text-red-600">{change.oldValue}</span>
                              ) : (
                                <span className="text-gray-500">Sin almacén</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-green-600 font-medium">{change.newValue}</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>¿Estás seguro?</strong> Esta acción modificará el stock de {syncPreview.changes.length} producto(s).
                    </p>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleCloseSyncModal}
                  className="flex-1"
                  disabled={isSyncing}
                >
                  Cancelar
                </Button>
                {syncPreview.changes.length > 0 && (
                  <Button
                    onClick={handleSyncStock}
                    className="flex-1"
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sincronizando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Confirmar Sincronización
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* Botón para analizar */
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleCloseSyncModal}
                className="flex-1"
                disabled={isLoadingPreview}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAnalyzeSync}
                className="flex-1"
                disabled={isLoadingPreview}
              >
                {isLoadingPreview ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Analizar Productos
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
