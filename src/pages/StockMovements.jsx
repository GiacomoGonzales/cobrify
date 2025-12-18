import { useState, useEffect } from 'react'
import {
  History,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowRightLeft,
  Package,
  Loader2,
  Calendar,
  AlertTriangle,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { getStockMovements } from '@/services/warehouseService'
import { getWarehouses } from '@/services/warehouseService'
import { getProducts } from '@/services/firestoreService'

export default function StockMovements() {
  const { user, isDemoMode, demoData, getBusinessId } = useAppContext()
  const toast = useToast()
  const [movements, setMovements] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterWarehouse, setFilterWarehouse] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        // Datos de demo
        setMovements([
          {
            id: 'mov-1',
            productId: 'prod-1',
            productName: 'Laptop Dell',
            warehouseId: 'demo-1',
            warehouseName: 'Almacén Principal',
            type: 'entry',
            quantity: 10,
            reason: 'Compra',
            notes: 'Ingreso por compra a proveedor',
            createdAt: new Date(Date.now() - 86400000),
          },
          {
            id: 'mov-2',
            productId: 'prod-1',
            productName: 'Laptop Dell',
            warehouseId: 'demo-2',
            warehouseName: 'Mostrador',
            type: 'transfer_in',
            quantity: 5,
            fromWarehouse: 'demo-1',
            reason: 'Transferencia',
            notes: 'Transferencia desde Almacén Principal',
            createdAt: new Date(Date.now() - 43200000),
          },
        ])
        setWarehouses([
          { id: 'demo-1', name: 'Almacén Principal' },
          { id: 'demo-2', name: 'Mostrador' },
        ])
        setProducts(demoData.products || [])
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()

      const [movementsResult, warehousesResult, productsResult] = await Promise.all([
        getStockMovements(businessId),
        getWarehouses(businessId),
        getProducts(businessId),
      ])

      if (movementsResult.success) {
        // Enriquecer movimientos con nombres de productos y almacenes
        const enrichedMovements = movementsResult.data.map(mov => {
          const product = productsResult.data?.find(p => p.id === mov.productId)
          const warehouse = warehousesResult.data?.find(w => w.id === mov.warehouseId)
          const fromWarehouse = warehousesResult.data?.find(w => w.id === mov.fromWarehouse)
          const toWarehouse = warehousesResult.data?.find(w => w.id === mov.toWarehouse)

          return {
            ...mov,
            productName: product?.name || 'Producto desconocido',
            productCode: product?.code || '-',
            warehouseName: warehouse?.name || 'Almacén desconocido',
            fromWarehouseName: fromWarehouse?.name,
            toWarehouseName: toWarehouse?.name,
          }
        })

        setMovements(enrichedMovements)
      }

      if (warehousesResult.success) {
        setWarehouses(warehousesResult.data || [])
      }

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }
    } catch (error) {
      console.error('Error al cargar movimientos:', error)
      toast.error('Error al cargar los datos')
    } finally {
      setIsLoading(false)
    }
  }

  // Filtrar movimientos
  const filteredMovements = movements.filter(movement => {
    const matchesSearch =
      movement.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      movement.productCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      movement.notes?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesWarehouse =
      filterWarehouse === 'all' ||
      movement.warehouseId === filterWarehouse ||
      movement.fromWarehouse === filterWarehouse ||
      movement.toWarehouse === filterWarehouse

    const matchesType = filterType === 'all' || movement.type === filterType

    // Filtro de fechas
    let matchesDate = true
    if (filterDateFrom || filterDateTo) {
      const movementDate = movement.createdAt?.toDate ? movement.createdAt.toDate() : new Date(movement.createdAt)

      if (filterDateFrom) {
        const fromDate = new Date(filterDateFrom)
        fromDate.setHours(0, 0, 0, 0)
        if (movementDate < fromDate) matchesDate = false
      }

      if (filterDateTo) {
        const toDate = new Date(filterDateTo)
        toDate.setHours(23, 59, 59, 999)
        if (movementDate > toDate) matchesDate = false
      }
    }

    return matchesSearch && matchesWarehouse && matchesType && matchesDate
  })

  const getMovementTypeInfo = (type) => {
    const types = {
      entry: {
        label: 'Entrada',
        icon: ArrowUpCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        variant: 'success',
      },
      exit: {
        label: 'Salida',
        icon: ArrowDownCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        variant: 'danger',
      },
      sale: {
        label: 'Venta',
        icon: ArrowDownCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        variant: 'danger',
      },
      transfer_in: {
        label: 'Transferencia Entrada',
        icon: ArrowRightLeft,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        variant: 'info',
      },
      transfer_out: {
        label: 'Transferencia Salida',
        icon: ArrowRightLeft,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        variant: 'warning',
      },
      adjustment: {
        label: 'Ajuste',
        icon: Package,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        variant: 'default',
      },
      damage: {
        label: 'Merma/Dañado',
        icon: AlertTriangle,
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        variant: 'danger',
      },
    }

    return types[type] || types.adjustment
  }

  const formatDate = (date) => {
    if (!date) return '-'
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Limpiar filtros
  const clearFilters = () => {
    setSearchTerm('')
    setFilterWarehouse('all')
    setFilterType('all')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const hasActiveFilters = searchTerm || filterWarehouse !== 'all' || filterType !== 'all' || filterDateFrom || filterDateTo

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando movimientos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Movimientos de Inventario</h1>
          <p className="text-sm text-gray-600 mt-1">
            Historial de entradas, salidas, transferencias y ajustes
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Primera fila: Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por producto, código o notas..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Segunda fila: Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Almacén */}
              <Select
                value={filterWarehouse}
                onChange={e => setFilterWarehouse(e.target.value)}
              >
                <option value="all">Todos los almacenes</option>
                {warehouses.map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </Select>

              {/* Tipo */}
              <Select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
              >
                <option value="all">Todos los tipos</option>
                <option value="entry">Entradas</option>
                <option value="exit">Salidas</option>
                <option value="sale">Ventas</option>
                <option value="transfer_in">Transferencias Entrada</option>
                <option value="transfer_out">Transferencias Salida</option>
                <option value="adjustment">Ajustes</option>
              </Select>

              {/* Fecha desde */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  placeholder="Desde"
                />
              </div>

              {/* Fecha hasta */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  placeholder="Hasta"
                />
              </div>
            </div>

            {/* Botón limpiar filtros */}
            {hasActiveFilters && (
              <div className="flex justify-end">
                <button
                  onClick={clearFilters}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-600 mb-1">Total Movimientos</p>
            <p className="text-2xl font-bold text-gray-900">{filteredMovements.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-600 mb-1">Entradas</p>
            <p className="text-2xl font-bold text-green-600">
              {filteredMovements.filter(m => m.type === 'entry' || m.type === 'transfer_in').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-600 mb-1">Salidas</p>
            <p className="text-2xl font-bold text-red-600">
              {filteredMovements.filter(m => m.type === 'exit' || m.type === 'transfer_out' || m.type === 'sale').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-600 mb-1">Ajustes</p>
            <p className="text-2xl font-bold text-purple-600">
              {filteredMovements.filter(m => m.type === 'adjustment').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de Movimientos */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Movimientos ({filteredMovements.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredMovements.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {hasActiveFilters
                  ? 'No se encontraron movimientos'
                  : 'No hay movimientos registrados'}
              </h3>
              <p className="text-gray-600">
                {hasActiveFilters
                  ? 'Intenta con otros filtros de búsqueda'
                  : 'Los movimientos aparecerán aquí cuando se realicen compras, ventas o transferencias'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Almacén</TableHead>
                    <TableHead className="text-center">Cantidad</TableHead>
                    <TableHead className="hidden md:table-cell">Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map(movement => {
                    const typeInfo = getMovementTypeInfo(movement.type)
                    const Icon = typeInfo.icon
                    return (
                      <TableRow key={movement.id}>
                        <TableCell>
                          <span className="text-sm text-gray-600">
                            {formatDate(movement.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={typeInfo.variant}>
                            <Icon className="w-3 h-3 mr-1 inline" />
                            {typeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{movement.productName}</p>
                            <p className="text-xs text-gray-500">{movement.productCode}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {movement.type === 'transfer_in' && movement.fromWarehouseName ? (
                              <div>
                                <p className="text-gray-500">
                                  <span className="text-gray-400">De:</span> {movement.fromWarehouseName}
                                </p>
                                <p className="font-medium">
                                  <span className="text-gray-400">A:</span> {movement.warehouseName}
                                </p>
                              </div>
                            ) : movement.type === 'transfer_out' && movement.toWarehouseName ? (
                              <div>
                                <p className="font-medium">
                                  <span className="text-gray-400">De:</span> {movement.warehouseName}
                                </p>
                                <p className="text-gray-500">
                                  <span className="text-gray-400">A:</span> {movement.toWarehouseName}
                                </p>
                              </div>
                            ) : (
                              <p className="font-medium">{movement.warehouseName}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`font-bold ${
                              movement.quantity > 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {movement.quantity > 0 ? '+' : ''}
                            {movement.quantity}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="max-w-xs">
                            <p className="text-sm text-gray-600 truncate" title={movement.notes}>
                              {movement.notes || movement.reason || '-'}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
