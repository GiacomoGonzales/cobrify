import React, { useState, useEffect } from 'react'
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
  ChevronDown,
  ChevronRight,
  Warehouse,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
import { getIngredients } from '@/services/ingredientService'
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
  const { user, isDemoMode, demoData, getBusinessId, businessMode } = useAppContext()
  const toast = useToast()
  const isRetailMode = businessMode === 'retail'

  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [productCategories, setProductCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all') // 'all', 'products', 'ingredients'
  const [expandedProduct, setExpandedProduct] = useState(null)

  // Paginación
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)

  // Ordenamiento
  const [sortField, setSortField] = useState('name') // 'name', 'code', 'price', 'stock', 'category'
  const [sortDirection, setSortDirection] = useState('asc') // 'asc' o 'desc'

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
    if (isRetailMode) {
      loadIngredients()
    }
    loadCategories()
    loadWarehouses()
  }, [user, isRetailMode])

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

  const loadIngredients = async () => {
    if (!user?.uid) return

    try {
      const result = await getIngredients(getBusinessId())
      if (result.success) {
        setIngredients(result.data || [])
      }
    } catch (error) {
      console.error('Error al cargar ingredientes:', error)
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

  // Función para manejar el ordenamiento
  const handleSort = (field) => {
    if (sortField === field) {
      // Si ya está ordenando por este campo, cambiar la dirección
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // Si es un campo nuevo, ordenar ascendente
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Función para obtener el icono de ordenamiento
  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-4 h-4 text-primary-600" />
    ) : (
      <ArrowDown className="w-4 h-4 text-primary-600" />
    )
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

    // Verificar que el producto maneja stock
    if (transferProduct.trackStock === false) {
      toast.error('Este producto no maneja stock y no puede ser transferido')
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

  // Combinar productos e ingredientes en modo retail
  const allItems = React.useMemo(() => {
    let items = []

    if (filterType === 'all' || filterType === 'products') {
      items = [...items, ...products.map(p => ({ ...p, itemType: 'product' }))]
    }

    if (isRetailMode && (filterType === 'all' || filterType === 'ingredients')) {
      items = [...items, ...ingredients.map(i => ({
        ...i,
        itemType: 'ingredient',
        code: i.code || '-',
        price: i.averageCost || 0,
        stock: i.currentStock || 0,
        category: i.category
      }))]
    }

    return items
  }, [products, ingredients, filterType, isRetailMode])

  // Filtrar y ordenar items (optimizado con useMemo)
  const filteredProducts = React.useMemo(() => {
    const filtered = allItems.filter(item => {
      const matchesSearch =
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesCategory =
        filterCategory === 'all' || item.category === filterCategory

      let matchesStatus = true
      if (filterStatus === 'low') {
        matchesStatus = item.stock !== null && item.stock < 4
      } else if (filterStatus === 'out') {
        matchesStatus = item.stock === 0
      } else if (filterStatus === 'normal') {
        matchesStatus = item.stock === null || item.stock >= 4
      }

      return matchesSearch && matchesCategory && matchesStatus
    })

    // Ordenar productos
    const sorted = [...filtered].sort((a, b) => {
      let aValue, bValue

      switch (sortField) {
        case 'code':
          aValue = a.code || ''
          bValue = b.code || ''
          break
        case 'name':
          aValue = a.name || ''
          bValue = b.name || ''
          break
        case 'price':
          aValue = a.price || 0
          bValue = b.price || 0
          break
        case 'stock':
          aValue = a.stock !== null && a.stock !== undefined ? a.stock : -1
          bValue = b.stock !== null && b.stock !== undefined ? b.stock : -1
          break
        case 'category':
          aValue = getCategoryPath(productCategories, a.category) || ''
          bValue = getCategoryPath(productCategories, b.category) || ''
          break
        default:
          aValue = a.name || ''
          bValue = b.name || ''
      }

      // Comparar valores
      if (typeof aValue === 'string') {
        const comparison = aValue.localeCompare(bValue, 'es', { sensitivity: 'base' })
        return sortDirection === 'asc' ? comparison : -comparison
      } else {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }
    })

    return sorted
  }, [products, searchTerm, filterCategory, filterStatus, productCategories, sortField, sortDirection])

  // Paginación de productos filtrados (optimizado con useMemo)
  const paginationData = React.useMemo(() => {
    const totalFilteredProducts = filteredProducts.length
    const totalPages = Math.ceil(totalFilteredProducts / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex)

    return {
      totalFilteredProducts,
      totalPages,
      startIndex,
      endIndex,
      paginatedProducts
    }
  }, [filteredProducts, currentPage, itemsPerPage])

  const { totalFilteredProducts, totalPages, startIndex, endIndex, paginatedProducts } = paginationData

  // Resetear a página 1 cuando cambian los filtros
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterCategory, filterStatus])

  // Obtener categorías únicas (productos + ingredientes en retail)
  const categories = React.useMemo(() => {
    let allCategories = []

    // Categorías de productos
    const productCats = [...new Set(products.map(p => p.category).filter(Boolean))]
    allCategories = productCats.map(catId => {
      const category = productCategories.find(c => c.id === catId)
      return category ? { id: catId, name: category.name } : { id: catId, name: catId }
    })

    // Categorías de ingredientes en retail
    if (isRetailMode) {
      const ingredientCats = [...new Set(ingredients.map(i => i.category).filter(Boolean))]
      const categoryLabels = {
        'granos': 'Granos y Cereales',
        'carnes': 'Carnes',
        'vegetales': 'Vegetales y Frutas',
        'lacteos': 'Lácteos',
        'condimentos': 'Condimentos y Especias',
        'bebidas': 'Bebidas',
        'estetica': 'Estética y Belleza',
        'salud': 'Salud y Farmacia',
        'limpieza': 'Limpieza',
        'otros': 'Otros'
      }

      ingredientCats.forEach(cat => {
        if (!allCategories.find(c => c.id === cat)) {
          allCategories.push({
            id: cat,
            name: categoryLabels[cat] || cat
          })
        }
      })
    }

    return allCategories
  }, [products, ingredients, productCategories, isRetailMode])

  // Calcular estadísticas (optimizado con useMemo)
  const statistics = React.useMemo(() => {
    const itemsWithStock = allItems.filter(i => i.stock !== null && i.stock !== undefined)
    const lowStockItems = itemsWithStock.filter(i => i.stock < 4)
    const outOfStockItems = itemsWithStock.filter(i => i.stock === 0)
    const totalValue = itemsWithStock.reduce((sum, i) => {
      const price = i.itemType === 'ingredient' ? (i.averageCost || 0) : (i.price || 0)
      return sum + (i.stock * price)
    }, 0)
    const totalUnits = itemsWithStock.reduce((sum, i) => sum + i.stock, 0)

    return {
      productsWithStock: itemsWithStock,
      lowStockItems,
      outOfStockItems,
      totalValue,
      totalUnits
    }
  }, [allItems])

  const { productsWithStock, lowStockItems, outOfStockItems, totalValue, totalUnits } = statistics

  const getStockStatus = product => {
    if (product.stock === null) {
      return { status: 'Sin control', variant: 'default', icon: Package }
    }
    if (product.stock === 0) {
      return { status: 'Agotado', variant: 'danger', icon: AlertTriangle }
    }
    if (product.stock < 4) {
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
            {isRetailMode ? 'Gestiona el stock de tus productos e insumos' : 'Gestiona el stock de tus productos'}
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
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">
                  {isRetailMode ? 'Total Items' : 'Total Productos'}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
                  {isRetailMode ? products.length + ingredients.length : products.length}
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
          <Link to="/app/productos" className="inline-block mt-2">
            <Button variant="outline" size="sm">
              Gestionar Productos
            </Button>
          </Link>
        </Alert>
      )}

      {/* Tabs - Solo en modo retail */}
      {isRetailMode && (
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterType === 'all'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Todos ({products.length + ingredients.length})
          </button>
          <button
            onClick={() => setFilterType('products')}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterType === 'products'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Productos ({products.length})
          </button>
          <button
            onClick={() => setFilterType('ingredients')}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterType === 'ingredients'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Insumos ({ingredients.length})
          </button>
        </div>
      )}

      {/* Info de ayuda contextual - Solo en retail cuando hay tabs */}
      {isRetailMode && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3">
            <p className="text-xs text-blue-800">
              <strong>Productos</strong> son los artículos que vendes. <strong>Insumos</strong> son la materia prima que consumen.
              Ve a <strong>Composición</strong> para definir qué insumos consume cada producto/servicio.
            </p>
          </CardContent>
        </Card>
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
          <CardTitle>
            {isRetailMode
              ? `${filterType === 'all' ? 'Items' : filterType === 'products' ? 'Productos' : 'Insumos'} en Inventario (${filteredProducts.length})`
              : `Productos en Inventario (${filteredProducts.length})`
            }
          </CardTitle>
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
                  : 'Ve a la página de Productos para agregar productos a tu catálogo'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">
                      <button
                        onClick={() => handleSort('code')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por código"
                      >
                        Código
                        {getSortIcon('code')}
                      </button>
                    </TableHead>
                    <TableHead className="w-[180px]">
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por nombre"
                      >
                        {isRetailMode ? 'Nombre' : 'Producto'}
                        {getSortIcon('name')}
                      </button>
                    </TableHead>
                    {isRetailMode && (
                      <TableHead className="hidden sm:table-cell w-[100px]">Tipo</TableHead>
                    )}
                    <TableHead className="hidden md:table-cell w-[150px]">
                      <button
                        onClick={() => handleSort('category')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por categoría"
                      >
                        Categoría
                        {getSortIcon('category')}
                      </button>
                    </TableHead>
                    <TableHead className="w-[120px]">
                      <button
                        onClick={() => handleSort('stock')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por stock"
                      >
                        Stock
                        {getSortIcon('stock')}
                      </button>
                    </TableHead>
                    <TableHead className="w-[120px]">
                      <button
                        onClick={() => handleSort('price')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por precio"
                      >
                        Precio Unit.
                        {getSortIcon('price')}
                      </button>
                    </TableHead>
                    <TableHead className="w-[120px]">Valor Stock</TableHead>
                    <TableHead className="w-[110px]">Estado</TableHead>
                    {warehouses.length > 1 && <TableHead className="w-[100px] text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map(item => {
                    const stockStatus = getStockStatus(item)
                    const isExpanded = expandedProduct === item.id
                    const hasWarehouseStocks = item.warehouseStocks && item.warehouseStocks.length > 0
                    const isProduct = item.itemType === 'product'

                    return (
                      <React.Fragment key={`${item.itemType}-${item.id}`}>
                      <TableRow>
                        <TableCell>
                          <span className="font-mono text-xs sm:text-sm">
                            {item.code || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <div className="max-w-[180px]">
                            <p className="font-medium text-sm truncate" title={item.name}>
                              {item.name}
                            </p>
                            {item.category && (
                              <p className="text-xs text-gray-500 md:hidden truncate">
                                {isProduct
                                  ? getCategoryPath(productCategories, item.category) || item.category
                                  : item.category
                                }
                              </p>
                            )}
                          </div>
                        </TableCell>
                        {isRetailMode && (
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={isProduct ? 'default' : 'success'}>
                              {isProduct ? 'Producto' : 'Insumo'}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell className="hidden md:table-cell max-w-[200px]">
                          <div className="max-w-[200px]">
                            <Badge
                              variant="default"
                              className="truncate block"
                              title={isProduct
                                ? getCategoryPath(productCategories, item.category) || 'Sin categoría'
                                : item.category || 'Sin categoría'
                              }
                            >
                              {isProduct
                                ? getCategoryPath(productCategories, item.category) || 'Sin categoría'
                                : item.category || 'Sin categoría'
                              }
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {/* Botón de expandir/contraer solo si hay almacenes y es producto */}
                            {warehouses.length > 0 && item.stock !== null && isProduct && (
                              <button
                                onClick={() => setExpandedProduct(isExpanded ? null : item.id)}
                                className="p-1 hover:bg-gray-100 rounded transition-colors"
                                title={isExpanded ? "Ocultar detalle" : "Ver por almacén"}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-500" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-500" />
                                )}
                              </button>
                            )}

                            {/* Stock total */}
                            <div>
                              {item.stock === null || item.stock === undefined ? (
                                <span className="text-sm text-gray-500">Sin control</span>
                              ) : (
                                <span
                                  className={`font-bold text-sm ${
                                    item.stock === 0
                                      ? 'text-red-600'
                                      : item.stock < 4
                                      ? 'text-yellow-600'
                                      : 'text-green-600'
                                  }`}
                                >
                                  {item.stock} {item.itemType === 'ingredient' ? item.purchaseUnit || '' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {formatCurrency(isProduct ? item.price : (item.averageCost || 0))}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.stock !== null && item.stock !== undefined ? (
                            <span className="font-semibold text-sm">
                              {formatCurrency(item.stock * (isProduct ? item.price : (item.averageCost || 0)))}
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
                              {isProduct && (
                                <button
                                  onClick={() => openTransferModal(item)}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Transferir entre almacenes"
                                  disabled={item.stock === null || item.stock === 0}
                                >
                                  <ArrowRightLeft className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>

                      {/* Fila expandible con detalle por almacén - solo para productos */}
                      {isExpanded && warehouses.length > 0 && item.stock !== null && isProduct && (
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={warehouses.length > 1 ? 8 : 7} className="py-3">
                            <div className="pl-8 space-y-2">
                              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                                <Warehouse className="w-4 h-4" />
                                <span className="font-medium">Stock por Almacén:</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {warehouses.map(warehouse => {
                                  const warehouseStock = hasWarehouseStocks
                                    ? item.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)
                                    : null
                                  const stock = warehouseStock?.stock || 0

                                  return (
                                    <div
                                      key={warehouse.id}
                                      className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                                    >
                                      <div className="flex items-center space-x-2">
                                        <span className="text-sm font-medium text-gray-700">
                                          {warehouse.name}
                                        </span>
                                        {warehouse.isDefault && (
                                          <Badge variant="default" className="text-xs">Principal</Badge>
                                        )}
                                      </div>
                                      <span
                                        className={`font-semibold ${
                                          stock >= 4
                                            ? 'text-green-600'
                                            : stock > 0
                                            ? 'text-yellow-600'
                                            : 'text-red-600'
                                        }`}
                                      >
                                        {stock}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                              {!hasWarehouseStocks && (
                                <p className="text-xs text-gray-500 mt-2">
                                  Stock no distribuido por almacenes
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>

              {/* Controles de paginación */}
              {totalFilteredProducts > 0 && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* Info de productos mostrados */}
                    <div className="text-sm text-gray-600">
                      Mostrando <span className="font-medium">{startIndex + 1}</span> a{' '}
                      <span className="font-medium">{Math.min(endIndex, totalFilteredProducts)}</span> de{' '}
                      <span className="font-medium">{totalFilteredProducts}</span> productos
                    </div>

                    {/* Controles de paginación */}
                    <div className="flex items-center gap-2">
                      {/* Selector de items por página */}
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value))
                          setCurrentPage(1)
                        }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                      </select>

                      {/* Botones de navegación */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Primera
                        </button>
                        <button
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Anterior
                        </button>

                        {/* Números de página */}
                        <div className="flex items-center gap-1 px-2">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum
                            if (totalPages <= 5) {
                              pageNum = i + 1
                            } else if (currentPage <= 3) {
                              pageNum = i + 1
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i
                            } else {
                              pageNum = currentPage - 2 + i
                            }

                            return (
                              <button
                                key={pageNum}
                                onClick={() => setCurrentPage(pageNum)}
                                className={`w-8 h-8 text-sm rounded-lg ${
                                  currentPage === pageNum
                                    ? 'bg-primary-600 text-white'
                                    : 'border border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            )
                          })}
                        </div>

                        <button
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Siguiente
                        </button>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Última
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
              <p className="text-gray-600 mb-1">{isRetailMode ? 'Total Items' : 'Total Productos'}</p>
              <p className="text-2xl font-bold text-gray-900">
                {isRetailMode ? products.length + ingredients.length : products.length}
              </p>
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
