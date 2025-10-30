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
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Alert from '@/components/ui/Alert'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/utils'
import { getProducts, getProductCategories } from '@/services/firestoreService'
import { generateProductsExcel } from '@/services/productExportService'

export default function Inventory() {
  const { user } = useAuth()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [productCategories, setProductCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [user])

  const loadProducts = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const result = await getProducts(user.uid)
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
      const result = await getProductCategories(user.uid)
      if (result.success) {
        setProductCategories(result.data || [])
      }
    } catch (error) {
      console.error('Error al cargar categorías:', error)
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
      const settingsResult = await getCompanySettings(user.uid);
      const businessData = settingsResult.success ? settingsResult.data : null;

      // Generar Excel
      generateProductsExcel(products, productCategories, businessData);
      toast.success(`${products.length} producto(s) exportado(s) exitosamente`);
    } catch (error) {
      console.error('Error al exportar inventario:', error);
      toast.error('Error al generar el archivo Excel');
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

  // Obtener categorías únicas
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))]

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
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, nombre o categoría..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Category Filter */}
            <Select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="sm:w-48"
            >
              <option value="all">Todas las categorías</option>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>

            {/* Status Filter */}
            <Select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="sm:w-48"
            >
              <option value="all">Todos los estados</option>
              <option value="normal">Stock Normal</option>
              <option value="low">Stock Bajo</option>
              <option value="out">Agotados</option>
            </Select>
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
                                {product.category}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="default">{product.category || 'Sin categoría'}</Badge>
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
    </div>
  )
}
