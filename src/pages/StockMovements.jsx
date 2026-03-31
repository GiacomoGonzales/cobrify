import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  History,
  Search,
  ArrowUpCircle,
  FileSpreadsheet,
  ArrowDownCircle,
  ArrowRightLeft,
  Package,
  Loader2,
  Calendar,
  AlertTriangle,
  ScanBarcode,
  Store,
  Cog,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { getStockMovements } from '@/services/warehouseService'
import { getWarehouses } from '@/services/warehouseService'
import { getProducts } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'

export default function StockMovements() {
  const { user, isDemoMode, demoData, getBusinessId } = useAppContext()
  const toast = useToast()
  const [movements, setMovements] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterBranch, setFilterBranch] = useState('all')
  const [filterWarehouse, setFilterWarehouse] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [visibleCount, setVisibleCount] = useState(50)
  const ITEMS_PER_PAGE = 50
  const [lastDoc, setLastDoc] = useState(null)
  const [hasMoreFromServer, setHasMoreFromServer] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

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

      const [movementsResult, warehousesResult, productsResult, branchesResult] = await Promise.all([
        getStockMovements(businessId, {
          startDate: filterDateFrom || undefined,
          endDate: filterDateTo || undefined,
          pageSize: 200,
        }),
        getWarehouses(businessId),
        getProducts(businessId),
        getActiveBranches(businessId),
      ])

      const branchesData = branchesResult.success ? branchesResult.data || [] : []
      setBranches(branchesData)

      if (movementsResult.success) {
        // Helper para obtener nombre de sucursal
        const getBranchName = (branchId) => {
          if (!branchId) return 'Sucursal Principal'
          const branch = branchesData.find(b => b.id === branchId)
          return branch?.name || 'Sucursal desconocida'
        }

        // Enriquecer movimientos con nombres de productos, almacenes y sucursales
        const enrichedMovements = movementsResult.data.map(mov => {
          const product = productsResult.data?.find(p => p.id === mov.productId)
          const defaultWarehouse = warehousesResult.data?.find(w => w.isDefault) || warehousesResult.data?.[0]
          const warehouse = mov.warehouseId
            ? warehousesResult.data?.find(w => w.id === mov.warehouseId) || defaultWarehouse
            : defaultWarehouse
          const fromWarehouse = warehousesResult.data?.find(w => w.id === mov.fromWarehouse)
          const toWarehouse = warehousesResult.data?.find(w => w.id === mov.toWarehouse)

          // Determinar si es transferencia entre sucursales
          const isCrossBranchTransfer = fromWarehouse && toWarehouse &&
            (fromWarehouse.branchId || null) !== (toWarehouse.branchId || null)

          return {
            ...mov,
            productName: product?.name || mov.productName || 'Producto desconocido',
            productCode: product?.code || '-',
            warehouseName: warehouse?.name || 'Almacén desconocido',
            warehouseBranchId: warehouse?.branchId || null,
            warehouseBranchName: getBranchName(warehouse?.branchId),
            fromWarehouseName: fromWarehouse?.name,
            fromWarehouseBranchId: fromWarehouse?.branchId || null,
            fromWarehouseBranchName: fromWarehouse ? getBranchName(fromWarehouse.branchId) : null,
            toWarehouseName: toWarehouse?.name,
            toWarehouseBranchId: toWarehouse?.branchId || null,
            toWarehouseBranchName: toWarehouse ? getBranchName(toWarehouse.branchId) : null,
            isCrossBranchTransfer,
          }
        })

        setMovements(enrichedMovements)
        setLastDoc(movementsResult.lastDoc || null)
        setHasMoreFromServer(movementsResult.hasMore || false)
        setVisibleCount(50)
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

  // Cargar más movimientos (paginación cursor)
  const loadMoreMovements = async () => {
    if (!lastDoc || isLoadingMore || !hasMoreFromServer) return
    setIsLoadingMore(true)
    try {
      const businessId = getBusinessId()
      const result = await getStockMovements(businessId, {
        startDate: filterDateFrom || undefined,
        endDate: filterDateTo || undefined,
        pageSize: 200,
        startAfterDoc: lastDoc,
      })
      if (result.success && result.data.length > 0) {
        // Enriquecer nuevos movimientos
        const enriched = result.data.map(mov => {
          const product = products.find(p => p.id === mov.productId)
          const defaultWarehouse = warehouses.find(w => w.isDefault) || warehouses[0]
          const warehouse = mov.warehouseId
            ? warehouses.find(w => w.id === mov.warehouseId) || defaultWarehouse
            : defaultWarehouse
          const fromWarehouse = warehouses.find(w => w.id === mov.fromWarehouse)
          const toWarehouse = warehouses.find(w => w.id === mov.toWarehouse)
          const getBranchName = (branchId) => {
            if (!branchId) return 'Sucursal Principal'
            return branches.find(b => b.id === branchId)?.name || 'Sucursal desconocida'
          }
          const isCrossBranchTransfer = fromWarehouse && toWarehouse &&
            (fromWarehouse.branchId || null) !== (toWarehouse.branchId || null)
          return {
            ...mov,
            productName: product?.name || mov.productName || 'Producto desconocido',
            productCode: product?.code || '-',
            warehouseName: warehouse?.name || 'Almacén desconocido',
            warehouseBranchId: warehouse?.branchId || null,
            warehouseBranchName: getBranchName(warehouse?.branchId),
            fromWarehouseName: fromWarehouse?.name,
            fromWarehouseBranchId: fromWarehouse?.branchId || null,
            fromWarehouseBranchName: fromWarehouse ? getBranchName(fromWarehouse.branchId) : null,
            toWarehouseName: toWarehouse?.name,
            toWarehouseBranchId: toWarehouse?.branchId || null,
            toWarehouseBranchName: toWarehouse ? getBranchName(toWarehouse.branchId) : null,
            isCrossBranchTransfer,
          }
        })
        setMovements(prev => [...prev, ...enriched])
        setLastDoc(result.lastDoc || null)
        setHasMoreFromServer(result.hasMore || false)
      } else {
        setHasMoreFromServer(false)
      }
    } catch (error) {
      console.error('Error al cargar más movimientos:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Obtener almacenes filtrados por sucursal seleccionada
  const filteredWarehouses = warehouses.filter(w => {
    if (filterBranch === 'all') return true
    if (filterBranch === 'main') return !w.branchId
    return w.branchId === filterBranch
  })

  // Resetear filtro de almacén cuando cambia la sucursal
  const handleBranchChange = (branchId) => {
    setFilterBranch(branchId)
    setFilterWarehouse('all') // Resetear almacén al cambiar sucursal
  }

  // Filtrar movimientos
  const filteredMovements = movements.filter(movement => {
    const matchesSearch =
      movement.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      movement.productCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      movement.notes?.toLowerCase().includes(searchTerm.toLowerCase())

    // Filtro de sucursal
    let matchesBranch = true
    if (filterBranch !== 'all') {
      const targetBranchId = filterBranch === 'main' ? null : filterBranch
      matchesBranch =
        movement.warehouseBranchId === targetBranchId ||
        movement.fromWarehouseBranchId === targetBranchId ||
        movement.toWarehouseBranchId === targetBranchId
    }

    const matchesWarehouse =
      filterWarehouse === 'all' ||
      movement.warehouseId === filterWarehouse ||
      movement.fromWarehouse === filterWarehouse ||
      movement.toWarehouse === filterWarehouse

    let matchesType = true
    if (filterType !== 'all') {
      if (filterType === 'exits') {
        matchesType = movement.type === 'exit'
      } else if (filterType === 'sale') {
        matchesType = movement.type === 'sale'
      } else if (filterType === 'entries') {
        matchesType = movement.type === 'entry'
      } else if (filterType === 'transfers') {
        matchesType = movement.type === 'transfer_in' || movement.type === 'transfer_out'
      } else if (filterType === 'productions') {
        matchesType = movement.type === 'production' || movement.type === 'production_manual' || movement.type === 'production_consumption'
      } else {
        matchesType = movement.type === filterType
      }
    }

    // Filtro de fechas
    let matchesDate = true
    if (filterDateFrom || filterDateTo) {
      const movementDate = movement.createdAt?.toDate ? movement.createdAt.toDate() : new Date(movement.createdAt)

      if (filterDateFrom) {
        // Parsear como fecha local (YYYY-MM-DD → año, mes-1, día en hora local)
        const [y, m, d] = filterDateFrom.split('-').map(Number)
        const fromDate = new Date(y, m - 1, d, 0, 0, 0, 0)
        if (movementDate < fromDate) matchesDate = false
      }

      if (filterDateTo) {
        const [y, m, d] = filterDateTo.split('-').map(Number)
        const toDate = new Date(y, m - 1, d, 23, 59, 59, 999)
        if (movementDate > toDate) matchesDate = false
      }
    }

    return matchesSearch && matchesBranch && matchesWarehouse && matchesType && matchesDate
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
      production: {
        label: 'Producción',
        icon: Cog,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        variant: 'success',
      },
      production_manual: {
        label: 'Producción Manual',
        icon: Cog,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        variant: 'success',
      },
      production_consumption: {
        label: 'Consumo Producción',
        icon: Cog,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        variant: 'warning',
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
    setFilterBranch('all')
    setFilterWarehouse('all')
    setFilterType('all')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const hasActiveFilters = searchTerm || filterBranch !== 'all' || filterWarehouse !== 'all' || filterType !== 'all' || filterDateFrom || filterDateTo

  const handleExportExcel = () => {
    if (filteredMovements.length === 0) {
      toast.error('No hay movimientos para exportar')
      return
    }

    const data = filteredMovements.map(m => ({
      'Fecha': formatDate(m.createdAt),
      'Producto': m.productName || '',
      'Tipo': getMovementTypeInfo(m.type)?.label || m.type,
      'Cantidad': m.quantity || 0,
      'Stock después': m.stockAfter ?? '-',
      'Almacén': m.warehouseName || '',
      'Origen/Destino': m.type === 'transfer_in' ? m.fromWarehouseName || '' : m.type === 'transfer_out' ? m.toWarehouseName || '' : '',
      'Notas': m.notes || m.reason || '',
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos')

    // Ajustar ancho de columnas
    ws['!cols'] = [
      { wch: 12 }, // Fecha
      { wch: 30 }, // Producto
      { wch: 20 }, // Tipo
      { wch: 10 }, // Cantidad
      { wch: 12 }, // Stock después
      { wch: 20 }, // Almacén
      { wch: 20 }, // Origen/Destino
      { wch: 30 }, // Notas
    ]

    const fileName = `movimientos_${filterDateFrom || 'inicio'}_${filterDateTo || 'hoy'}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success(`${filteredMovements.length} movimientos exportados`)
  }

  // Calcular saldo acumulativo por producto+almacén
  // Ordena de más antiguo a más nuevo, suma quantity (que ya tiene signo correcto)
  const movementsWithBalance = (() => {
    // Ordenar por fecha ascendente (más antiguo primero)
    const sortedMovements = [...filteredMovements].sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt)
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt)
      return dateA - dateB
    })

    // Acumular saldo por producto+almacén
    const runningBalance = {}
    const balanceMap = {}

    sortedMovements.forEach(mov => {
      const key = `${mov.productId}_${mov.warehouseId}`
      if (runningBalance[key] === undefined) runningBalance[key] = 0
      runningBalance[key] += (mov.quantity || 0)
      balanceMap[mov.id] = runningBalance[key]
    })

    return filteredMovements.map(mov => ({
      ...mov,
      stockAfter: balanceMap[mov.id] ?? null
    }))
  })()

  const displayedMovements = movementsWithBalance.slice(0, visibleCount)
  const hasMore = movementsWithBalance.length > visibleCount

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE)
  }, [searchTerm, filterBranch, filterWarehouse, filterType, filterDateFrom, filterDateTo])

  // Recargar desde servidor cuando cambian filtros de fecha
  useEffect(() => {
    if (user?.uid && !isDemoMode) {
      loadData()
    }
  }, [filterDateFrom, filterDateTo])

  // Escanear código de barras
  const handleScanBarcode = async () => {
    // Solo disponible en plataformas nativas
    if (!Capacitor.isNativePlatform()) {
      toast.error('El escáner solo está disponible en la app móvil')
      return
    }

    setIsScanning(true)
    try {
      // Verificar si el módulo de Google Barcode Scanner está disponible (solo Android)
      if (Capacitor.getPlatform() === 'android') {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
        if (!available) {
          toast.info('Instalando módulo de escáner... Por favor espera')
          await BarcodeScanner.installGoogleBarcodeScannerModule()
          toast.success('Módulo instalado. Intenta escanear de nuevo.')
          setIsScanning(false)
          return
        }
      }

      // Verificar permisos de cámara
      const { camera } = await BarcodeScanner.checkPermissions()
      if (camera !== 'granted') {
        const { camera: newPermission } = await BarcodeScanner.requestPermissions()
        if (newPermission !== 'granted') {
          toast.error('Se requiere permiso de cámara para escanear')
          return
        }
      }

      // Escanear código de barras
      const { barcodes } = await BarcodeScanner.scan()
      await BarcodeScanner.stopScan().catch(() => {})

      if (barcodes && barcodes.length > 0) {
        const scannedCode = barcodes[0].rawValue
        // Buscar si hay un producto con ese código
        const foundProduct = products.find(p => p.code === scannedCode || p.sku === scannedCode)

        if (foundProduct) {
          setSearchTerm(scannedCode)
          toast.success(`Producto encontrado: ${foundProduct.name}`)
        } else {
          setSearchTerm(scannedCode)
          toast.warning(`No se encontró producto con código: ${scannedCode}`)
        }
      }
    } catch (error) {
      console.error('Error al escanear:', error)
      await BarcodeScanner.stopScan().catch(() => {})
      if (error.message !== 'scan canceled') {
        toast.error('Error al escanear código de barras')
      }
    } finally {
      setIsScanning(false)
    }
  }

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
            <div className="flex gap-2">
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm flex-1">
                <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar por producto, código o notas..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
                />
              </div>
              {Capacitor.isNativePlatform() && (
                <Button
                  onClick={handleScanBarcode}
                  disabled={isScanning}
                  title="Escanear código de barras"
                >
                  {isScanning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ScanBarcode className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>

            {/* Segunda fila: Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Sucursal */}
              {branches.length > 0 && (
                <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                  <Store className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <select
                    value={filterBranch}
                    onChange={e => handleBranchChange(e.target.value)}
                    className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Todas las sucursales</option>
                    <option value="main">Sucursal Principal</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Almacén */}
              <Select
                value={filterWarehouse}
                onChange={e => setFilterWarehouse(e.target.value)}
              >
                <option value="all">Todos los almacenes</option>
                {filteredWarehouses.map(warehouse => (
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
                <option value="entries">Entradas</option>
                <option value="sale">Ventas</option>
                <option value="exits">Salidas (sin ventas)</option>
                <option value="transfers">Transferencias</option>
                <option value="adjustment">Ajustes</option>
                <option value="damage">Merma/Dañado</option>
                <option value="productions">Producción</option>
              </Select>

              {/* Fecha desde */}
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                  placeholder="Desde"
                />
              </div>

              {/* Fecha hasta */}
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                  placeholder="Hasta"
                />
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex justify-end gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                >
                  Limpiar filtros
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                disabled={filteredMovements.length === 0}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar Excel
              </Button>
            </div>
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
              {filteredMovements.filter(m => m.type === 'entry').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-600 mb-1">Salidas</p>
            <p className="text-2xl font-bold text-red-600">
              {filteredMovements.filter(m => m.type === 'exit' || m.type === 'sale').length}
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
        {filteredMovements.length === 0 ? (
          <CardContent>
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
          </CardContent>
        ) : (
          <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {displayedMovements.map(movement => {
                const typeInfo = getMovementTypeInfo(movement.type)
                const Icon = typeInfo.icon
                return (
                  <div key={movement.id} className="px-4 py-3 hover:bg-gray-50 transition-colors overflow-hidden">
                    {/* Fila 1: Producto + cantidad + saldo */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{movement.productName}</p>
                        {movement.batchNumber && (
                          <p className="text-xs text-amber-600 truncate">Lote: {movement.batchNumber}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`font-bold text-sm ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                        </span>
                        <span className="text-xs text-gray-500">→</span>
                        <span className="font-semibold text-sm text-gray-700">
                          {movement.stockAfter !== null ? movement.stockAfter : '-'}
                        </span>
                      </div>
                    </div>

                    {/* Fila 2: Badge tipo + fecha */}
                    <div className="flex items-center justify-between mt-1.5">
                      <Badge variant={typeInfo.variant} className="text-xs">
                        <Icon className="w-3 h-3 mr-1 inline" />
                        {typeInfo.label}
                      </Badge>
                      <span className="text-xs text-gray-500">{formatDate(movement.createdAt)}</span>
                    </div>

                    {/* Fila 3: Almacén */}
                    <div className="mt-1 text-xs text-gray-500 truncate">
                      {movement.type === 'transfer_in' && movement.fromWarehouseName ? (
                        <span>{movement.fromWarehouseName} → {movement.warehouseName}</span>
                      ) : movement.type === 'transfer_out' && movement.toWarehouseName ? (
                        <span>{movement.warehouseName} → {movement.toWarehouseName}</span>
                      ) : (
                        <span>{movement.warehouseName}</span>
                      )}
                      {movement.isCrossBranchTransfer && (
                        <span className="ml-2 text-amber-600 font-medium">Entre sucursales</span>
                      )}
                    </div>

                    {/* Fila 4: Motivo (si existe) */}
                    {(movement.notes || movement.reason) && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{movement.notes || movement.reason}</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Tabla para desktop */}
            <div className="hidden lg:block">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="w-[12%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="w-[12%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="w-[18%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                    <th className="w-[15%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Almacén</th>
                    <th className="w-[7%] px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cant.</th>
                    <th className="w-[7%] px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Saldo</th>
                    <th className="w-[29%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedMovements.map(movement => {
                    const typeInfo = getMovementTypeInfo(movement.type)
                    const Icon = typeInfo.icon
                    return (
                      <tr key={movement.id} className="hover:bg-gray-50">
                        <td className="px-2 py-2 text-xs text-gray-500">
                          {formatDate(movement.createdAt)}
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant={typeInfo.variant} className="text-xs">
                            <Icon className="w-3 h-3 mr-1 inline" />
                            {typeInfo.label}
                          </Badge>
                        </td>
                        <td className="px-2 py-2">
                          <p className="font-medium text-xs truncate" title={movement.productName}>{movement.productName}</p>
                          {movement.productCode && <p className="text-[10px] text-gray-400 truncate">{movement.productCode}</p>}
                          {movement.batchNumber && <p className="text-[10px] text-amber-600">Lote: {movement.batchNumber}</p>}
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-xs">
                            {movement.type === 'transfer_in' && movement.fromWarehouseName ? (
                              <>
                                <p className="text-gray-400 truncate">De: {movement.fromWarehouseName}</p>
                                <p className="font-medium truncate">A: {movement.warehouseName}</p>
                                {movement.isCrossBranchTransfer && (
                                  <span className="text-[10px] text-amber-600">Entre sucursales</span>
                                )}
                              </>
                            ) : movement.type === 'transfer_out' && movement.toWarehouseName ? (
                              <>
                                <p className="font-medium truncate">De: {movement.warehouseName}</p>
                                <p className="text-gray-400 truncate">A: {movement.toWarehouseName}</p>
                                {movement.isCrossBranchTransfer && (
                                  <span className="text-[10px] text-amber-600">Entre sucursales</span>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="font-medium truncate">{movement.warehouseName}</p>
                                {branches.length > 0 && movement.warehouseBranchName && (
                                  <p className="text-[10px] text-gray-400">{movement.warehouseBranchName}</p>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={`font-bold ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="font-semibold text-gray-700 text-xs">
                            {movement.stockAfter !== null ? movement.stockAfter : '-'}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <p className="text-xs text-gray-600 line-clamp-2" title={movement.notes || movement.reason}>
                            {movement.notes || movement.reason || '-'}
                          </p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
      </Card>

      {/* Load More Button (visual pagination) */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
            className="text-sm text-gray-600 hover:text-primary-600 transition-colors py-2 px-4 hover:bg-gray-50 rounded-lg"
          >
            Ver más movimientos ({movementsWithBalance.length - visibleCount} restantes)
          </button>
        </div>
      )}

      {/* Load More from Server Button */}
      {!hasMore && hasMoreFromServer && (
        <div className="flex justify-center">
          <button
            onClick={loadMoreMovements}
            disabled={isLoadingMore}
            className="text-sm text-primary-600 hover:text-primary-700 transition-colors py-2 px-4 hover:bg-primary-50 rounded-lg flex items-center gap-2"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando...
              </>
            ) : (
              'Cargar más movimientos antiguos'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
