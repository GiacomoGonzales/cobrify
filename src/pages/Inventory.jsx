import { useState, useEffect } from 'react'
import {
  Package,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Search,
  DollarSign,
  Loader2,
  Plus,
  FileSpreadsheet,
  ArrowRightLeft,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Alert from '@/components/ui/Alert'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/utils'
import { getProducts, getProductCategories, updateProduct } from '@/services/firestoreService'
import { generateProductsExcel } from '@/services/productExportService'
import { getWarehouses, createStockMovement, updateWarehouseStock } from '@/services/warehouseService'

// Helper functions for category hierarchy
const migrateLegacyCategories = (cats) => {
  if (!cats || cats.length === 0) return []
  // Si ya son objetos con id, devolverlos tal cual
  if (typeof cats[0] === 'object' && cats[0].id) return cats
  // Migrar strings antiguos a nuevo formato
  return cats.map((name) => ({
    id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name,
    parentId: null,
  }))
}

const getCategoryPath = (categories, categoryId) => {
  if (!categoryId || !categories || categories.length === 0) return null

  const category = categories.find(cat => cat.id === categoryId)
  if (!category) return categoryId // Si no se encuentra, devolver el ID

  if (category.parentId === null) {
    return category.name
  }

  const parent = getCategoryPath(categories, category.parentId)
  return parent ? `${parent} > ${category.name}` : category.name
}

export default function Inventory() {
  const { user, isDemoMode, demoData, getBusinessId } = useAppContext()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [productCategories, setProductCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Warehouses y transferencias
  const [warehouses, setWarehouses] = useState([])
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferProduct, setTransferProduct] = useState(null)
  const [transferData, setTransferData] = useState({
    fromWarehouse: '',
    toWarehouse: '',
    quantity: '',
    notes: ''
  })
  const [isTransferring, setIsTransferring] = useState(false)

  useEffect(() => {
    loadProducts()
    loadCategories()
    loadWarehouses()
  }, [user])

  const loadProducts = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      // MODO DEMO: Usar datos de ejemplo
      if (isDemoMode && demoData) {
        setProducts(demoData.products || [])
        setIsLoading(false)
        return
      }

      const result = await getProducts(getBusinessId())
      if (result.success) {
        setProducts(result.data || [])
      }
    } catch (error) {
      console.error('Error al cargar productos:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadCategories = async () => {
    if (!user?.uid) return

    try {
      // MODO DEMO: Usar categorías de ejemplo
      if (isDemoMode && demoData) {
        setProductCategories([
          { id: 'cat-1', name: 'Electrónica', parentId: null },
          { id: 'cat-2', name: 'Servicios', parentId: null }
        ])
        return
      }

      const result = await getProductCategories(getBusinessId())
      if (result.success) {
        const migratedCategories = migrateLegacyCategories(result.data || [])
        setProductCategories(migratedCategories)
      }
    } catch (error) {
      console.error('Error al cargar categorías:', error)
    }
  }

  const loadWarehouses = async () => {
    if (!user?.uid) return

    try {
      if (isDemoMode) {
        setWarehouses([
          { id: 'demo-1', name: 'Almacén Principal', isDefault: true, isActive: true },
          { id: 'demo-2', name: 'Mostrador', isDefault: false, isActive: true },
        ])
        return
      }

      const result = await getWarehouses(getBusinessId())
      if (result.success) {
        setWarehouses(result.data || [])
      }
    } catch (error) {
      console.error('Error al cargar almacenes:', error)
    }
  }

  const handleExportToExcel = async () => {
    try {
      if (products.length === 0) {
        toast.error('No hay productos en el inventario para exportar');
        return;
      }

      // Obtener datos del negocio
      const { getCompanySettings } = await import('@/services/firestoreService');
      const settingsResult = await getCompanySettings(getBusinessId());
      const businessData = settingsResult.success ? settingsResult.data : null;

      // Generar Excel
      generateProductsExcel(products, productCategories, businessData);
      toast.success(`${products.length} producto(s) exportado(s) exitosamente`);
    } catch (error) {
      console.error('Error al exportar inventario:', error);
      toast.error('Error al generar el archivo Excel');
    }
  }

  const openTransferModal = (product) => {
    setTransferProduct(product)
    setTransferData({
      fromWarehouse: '',
      toWarehouse: '',
      quantity: '',
      notes: ''
    })
    setShowTransferModal(true)
  }

  const closeTransferModal = () => {
    setShowTransferModal(false)
    setTransferProduct(null)
    setTransferData({
      fromWarehouse: '',
      toWarehouse: '',
      quantity: '',
      notes: ''
    })
  }

  const handleTransfer = async () => {
    if (!user?.uid || !transferProduct) return

    // Validaciones
    if (!transferData.fromWarehouse || !transferData.toWarehouse) {
      toast.error('Debes seleccionar ambos almacenes')
      return
    }

    if (transferData.fromWarehouse === transferData.toWarehouse) {
      toast.error('Los almacenes de origen y destino deben ser diferentes')
      return
    }

    const quantity = parseFloat(transferData.quantity)
    if (!quantity || quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    // Verificar stock disponible en almacén origen
    const warehouseStock = transferProduct.warehouseStocks?.find(
      ws => ws.warehouseId === transferData.fromWarehouse
    )
    const availableStock = warehouseStock?.stock || 0

    if (quantity > availableStock) {
      toast.error(`Stock insuficiente en almacén origen. Disponible: ${availableStock}`)
      return
    }

    setIsTransferring(true)

    try {
      const businessId = getBusinessId()

      // 1. Actualizar stock - Salida del almacén origen
      let updatedProduct = updateWarehouseStock(
        transferProduct,
        transferData.fromWarehouse,
        -quantity
      )

      // 2. Actualizar stock - Entrada al almacén destino
      updatedProduct = updateWarehouseStock(
        updatedProduct,
        transferData.toWarehouse,
        quantity
      )

      // 3. Guardar en Firestore
      const updateResult = await updateProduct(businessId, transferProduct.id, {
        stock: updatedProduct.stock,
        warehouseStocks: updatedProduct.warehouseStocks
      })

      if (!updateResult.success) {
        throw new Error('Error al actualizar el stock')
      }

      // 4. Registrar movimiento de salida
      await createStockMovement(businessId, {
        productId: transferProduct.id,
        warehouseId: transferData.fromWarehouse,
        type: 'transfer_out',
        quantity: -quantity,
        reason: 'Transferencia',
        referenceType: 'transfer',
        toWarehouse: transferData.toWarehouse,
        userId: user.uid,
        notes: transferData.notes || `Transferencia a ${warehouses.find(w => w.id === transferData.toWarehouse)?.name}`
      })

      // 5. Registrar movimiento de entrada
      await createStockMovement(businessId, {
        productId: transferProduct.id,
        warehouseId: transferData.toWarehouse,
        type: 'transfer_in',
        quantity: quantity,
        reason: 'Transferencia',
        referenceType: 'transfer',
        fromWarehouse: transferData.fromWarehouse,
        userId: user.uid,
        notes: transferData.notes || `Transferencia desde ${warehouses.find(w => w.id === transferData.fromWarehouse)?.name}`
      })

      toast.success('Transferencia realizada exitosamente')
      closeTransferModal()
      loadProducts() // Recargar productos
    } catch (error) {
      console.error('Error al realizar transferencia:', error)
      toast.error('Error al realizar la transferencia')
    } finally {
      setIsTransferring(false)
    }
  }

  // Filtrar productos
  const filteredProducts = products.filter(product => {
    const matchesSearch =
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory =
      filterCategory === 'all' || product.category === filterCategory

    let matchesStatus = true
    if (filterStatus === 'low') {
      matchesStatus = product.stock !== null && product.stock < 10
    } else if (filterStatus === 'out') {
      matchesStatus = product.stock === 0
    } else if (filterStatus === 'normal') {
      matchesStatus = product.stock === null || product.stock >= 10
    }

    return matchesSearch && matchesCategory && matchesStatus
  })

  // Obtener categorías únicas con sus IDs
  const uniqueCategoryIds = [...new Set(products.map(p => p.category).filter(Boolean))]
  const categories = uniqueCategoryIds.map(catId => {
    const category = productCategories.find(c => c.id === catId)
    return category ? { id: catId, name: category.name } : { id: catId, name: catId }
  })

  // Productos con stock controlado
  const productsWithStock = products.filter(p => p.stock !== null)

  // Calcular estadísticas
  const lowStockItems = productsWithStock.filter(p => p.stock < 10)
  const outOfStockItems = productsWithStock.filter(p => p.stock === 0)
  const totalValue = productsWithStock.reduce((sum, p) => sum + (p.stock * p.price), 0)
  const totalUnits = productsWithStock.reduce((sum, p) => sum + p.stock, 0)

  const getStockStatus = product => {
    if (product.stock === null) {
      return { status: 'Sin control', variant: 'default', icon: Package }
    }
    if (product.stock === 0) {
      return { status: 'Agotado', variant: 'danger', icon: AlertTriangle }
    }
    if (product.stock < 10) {
      return { status: 'Stock Bajo', variant: 'warning', icon: TrendingDown }
    }
    return { status: 'Normal', variant: 'success', icon: TrendingUp }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando inventario...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Control de Inventario</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona el stock de tus productos
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleExportToExcel}
            className="w-full sm:w-auto"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
          <Link to="/productos" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Agregar Producto
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Total Productos</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
                  {products.length}
                </p>
              </div>
              <Package className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Valor Total</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(totalValue)}
                </p>
              </div>
              <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Stock Bajo</p>
                <p className="text-xl sm:text-2xl font-bold text-yellow-600 mt-1">
                  {lowStockItems.length}
                </p>
              </div>
              <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Agotados</p>
                <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1">
                  {outOfStockItems.length}
                </p>
              </div>
              <TrendingDown className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert for low/out of stock */}
      {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
        <Alert
          variant={outOfStockItems.length > 0 ? 'danger' : 'warning'}
          title={
            outOfStockItems.length > 0
              ? `${outOfStockItems.length} productos agotados`
              : `${lowStockItems.length} productos con stock bajo`
          }
        >
          <p className="text-sm">
            {outOfStockItems.length > 0
              ? 'Hay productos sin stock. Es urgente reabastecer para evitar ventas perdidas.'
              : 'Algunos productos tienen stock bajo. Considera reabastecer pronto.'}
          </p>
          <Link to="/productos" className="inline-block mt-2">
            <Button variant="outline" size="sm">
              Gestionar Productos
            </Button>
          </Link>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            {/* Search */}
            <div className="flex-1 min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, nombre o categoría..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Filters Group */}
            <div className="flex flex-col sm:flex-row gap-3 lg:gap-4">
              {/* Category Filter */}
              <div className="w-full sm:w-auto">
                <Select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  className="w-full lg:w-56"
                >
                  <option value="all">Todas las categorías</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Status Filter */}
              <div className="w-full sm:w-auto">
                <Select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="w-full lg:w-56"
                >
                  <option value="all">Todos los estados</option>
                  <option value="normal">Stock Normal</option>
                  <option value="low">Stock Bajo</option>
                  <option value="out">Agotados</option>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>Productos en Inventario ({filteredProducts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm || filterCategory !== 'all' || filterStatus !== 'all'
                  ? 'No se encontraron productos'
                  : 'No hay productos en inventario'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || filterCategory !== 'all' || filterStatus !== 'all'
                  ? 'Intenta con otros filtros de búsqueda'
                  : 'Comienza agregando productos a tu catálogo'}
              </p>
              {!searchTerm && filterCategory === 'all' && filterStatus === 'all' && (
                <Link to="/productos">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Producto
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="hidden md:table-cell">Categoría</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="hidden lg:table-cell">Precio Unit.</TableHead>
                    <TableHead className="hidden lg:table-cell">Valor Stock</TableHead>
                    <TableHead>Estado</TableHead>
                    {warehouses.length > 1 && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map(product => {
                    const stockStatus = getStockStatus(product)
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <span className="font-mono text-xs sm:text-sm">
                            {product.code || '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium text-sm">{product.name}</span>
                            {product.category && (
                              <p className="text-xs text-gray-500 md:hidden">
                                {getCategoryPath(productCategories, product.category) || product.category}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="default">
                            {getCategoryPath(productCategories, product.category) || 'Sin categoría'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {product.stock === null ? (
                            <span className="text-sm text-gray-500">Sin control</span>
                          ) : (
                            <span
                              className={`font-bold text-sm ${
                                product.stock === 0
                                  ? 'text-red-600'
                                  : product.stock < 10
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                              }`}
                            >
                              {product.stock}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm">{formatCurrency(product.price)}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {product.stock !== null ? (
                            <span className="font-semibold text-sm">
                              {formatCurrency(product.stock * product.price)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={stockStatus.variant}>{stockStatus.status}</Badge>
                        </TableCell>
                        {warehouses.length > 1 && (
                          <TableCell>
                            <div className="flex items-center justify-end">
                              <button
                                onClick={() => openTransferModal(product)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Transferir entre almacenes"
                                disabled={product.stock === null || product.stock === 0}
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Info */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen del Inventario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Total Productos</p>
              <p className="text-2xl font-bold text-gray-900">{products.length}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Con Control de Stock</p>
              <p className="text-2xl font-bold text-gray-900">{productsWithStock.length}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Unidades Totales</p>
              <p className="text-2xl font-bold text-gray-900">{totalUnits}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Valor Total Inventario</p>
              <p className="text-xl font-bold text-primary-600">
                {formatCurrency(totalValue)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Transferencia */}
      <Modal
        isOpen={showTransferModal}
        onClose={closeTransferModal}
        title="Transferir Stock entre Almacenes"
        size="md"
      >
        <div className="space-y-4">
          {transferProduct && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-gray-600">Producto</p>
              <p className="font-semibold text-gray-900">{transferProduct.name}</p>
              <p className="text-sm text-gray-500">Código: {transferProduct.code}</p>
            </div>
          )}

          <Select
            label="Almacén de Origen"
            required
            value={transferData.fromWarehouse}
            onChange={(e) => setTransferData({ ...transferData, fromWarehouse: e.target.value })}
          >
            <option value="">Selecciona almacén origen</option>
            {warehouses.filter(w => w.isActive).map(warehouse => {
              const warehouseStock = transferProduct?.warehouseStocks?.find(
                ws => ws.warehouseId === warehouse.id
              )
              const stock = warehouseStock?.stock || 0
              return (
                <option key={warehouse.id} value={warehouse.id} disabled={stock === 0}>
                  {warehouse.name} - Stock: {stock}
                </option>
              )
            })}
          </Select>

          <Select
            label="Almacén de Destino"
            required
            value={transferData.toWarehouse}
            onChange={(e) => setTransferData({ ...transferData, toWarehouse: e.target.value })}
          >
            <option value="">Selecciona almacén destino</option>
            {warehouses
              .filter(w => w.isActive && w.id !== transferData.fromWarehouse)
              .map(warehouse => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
          </Select>

          <Input
            label="Cantidad a Transferir"
            type="number"
            required
            min="1"
            value={transferData.quantity}
            onChange={(e) => setTransferData({ ...transferData, quantity: e.target.value })}
            placeholder="Cantidad"
          />

          {transferData.fromWarehouse && (
            <div className="text-sm text-gray-600">
              Stock disponible: {' '}
              <span className="font-semibold">
                {transferProduct?.warehouseStocks?.find(
                  ws => ws.warehouseId === transferData.fromWarehouse
                )?.stock || 0}
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notas (Opcional)
            </label>
            <textarea
              value={transferData.notes}
              onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
              placeholder="Motivo de la transferencia..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={closeTransferModal}
              disabled={isTransferring}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={isTransferring}
            >
              {isTransferring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Transfiriendo...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Transferir
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
