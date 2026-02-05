import { useState, useEffect, useMemo } from 'react'
import { Search, Package, Calendar, User, DollarSign, Loader2, Receipt, TrendingUp } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getPurchases as getIngredientPurchases, getIngredients } from '@/services/ingredientService'
import { getPurchases as getProductPurchases } from '@/services/firestoreService'

export default function PurchaseHistory() {
  const { user, getBusinessId } = useAppContext()
  const demoContext = useDemoRestaurant()
  const toast = useToast()

  const [ingredientPurchases, setIngredientPurchases] = useState([])
  const [productPurchases, setProductPurchases] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all', 'products', 'ingredients'
  const [filterSupplier, setFilterSupplier] = useState('all')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  // Pagination
  const [visibleCount, setVisibleCount] = useState(20)
  const ITEMS_PER_PAGE = 20

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (demoContext) {
        const demoPurchases = demoContext.demoData?.purchases || []
        const demoIngredients = demoContext.demoData?.ingredients || []
        setIngredientPurchases(demoPurchases)
        setIngredients(demoIngredients)
      } else {
        const businessId = getBusinessId()
        const [ingPurchasesResult, ingredientsResult, prodPurchasesResult] = await Promise.all([
          getIngredientPurchases(businessId),
          getIngredients(businessId),
          getProductPurchases(businessId)
        ])

        if (ingPurchasesResult.success) {
          setIngredientPurchases(ingPurchasesResult.data || [])
        }
        if (ingredientsResult.success) {
          setIngredients(ingredientsResult.data || [])
        }
        if (prodPurchasesResult.success) {
          setProductPurchases(prodPurchasesResult.data || [])
        }
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  // Unificar ambas fuentes en un solo array normalizado
  const allPurchases = useMemo(() => {
    // Compras de ingredientes (colección ingredientPurchases)
    const ingItems = ingredientPurchases.map(p => ({
      id: p.id,
      type: 'ingredient',
      name: p.ingredientName,
      quantity: p.quantity,
      unit: p.unit,
      unitPrice: p.unitPrice,
      total: p.totalCost || (p.quantity * p.unitPrice),
      supplier: p.supplier || '',
      invoiceNumber: p.invoiceNumber || '',
      date: p.purchaseDate || p.createdAt,
    }))

    // Compras de productos (colección purchases) - desglosar items individuales
    const prodItems = []
    productPurchases.forEach(purchase => {
      if (!purchase.items || purchase.items.length === 0) return
      const purchaseDate = purchase.invoiceDate || purchase.createdAt
      const supplierName = purchase.supplier?.businessName || ''

      purchase.items.forEach(item => {
        prodItems.push({
          id: `${purchase.id}-${item.productId}`,
          type: item.itemType === 'ingredient' ? 'ingredient' : 'product',
          name: item.productName,
          quantity: item.quantity,
          unit: item.unit || 'NIU',
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
          supplier: supplierName,
          invoiceNumber: purchase.invoiceNumber || '',
          date: purchaseDate,
        })
      })
    })

    return [...ingItems, ...prodItems].sort((a, b) => {
      const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0)
      const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0)
      return dateB - dateA
    })
  }, [ingredientPurchases, productPurchases])

  // Get unique suppliers
  const suppliers = Array.from(
    new Set(allPurchases.map(p => p.supplier).filter(Boolean))
  ).sort()

  // Filter purchases
  const filteredPurchases = allPurchases.filter(purchase => {
    const matchesSearch =
      purchase.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = filterType === 'all' ||
      (filterType === 'products' && purchase.type === 'product') ||
      (filterType === 'ingredients' && purchase.type === 'ingredient')

    const matchesSupplier = filterSupplier === 'all' || purchase.supplier === filterSupplier

    let matchesDateRange = true
    if (filterStartDate || filterEndDate) {
      const purchaseDate = purchase.date?.toDate ? purchase.date.toDate() : new Date(purchase.date)

      if (filterStartDate) {
        const startDate = new Date(filterStartDate)
        startDate.setHours(0, 0, 0, 0)
        if (purchaseDate < startDate) matchesDateRange = false
      }

      if (filterEndDate) {
        const endDate = new Date(filterEndDate)
        endDate.setHours(23, 59, 59, 999)
        if (purchaseDate > endDate) matchesDateRange = false
      }
    }

    return matchesSearch && matchesType && matchesSupplier && matchesDateRange
  })

  // Apply pagination
  const displayedPurchases = filteredPurchases.slice(0, visibleCount)
  const hasMore = filteredPurchases.length > visibleCount

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(20)
  }, [searchTerm, filterType, filterSupplier, filterStartDate, filterEndDate])

  // Stats
  const stats = useMemo(() => ({
    total: filteredPurchases.length,
    totalAmount: filteredPurchases.reduce((sum, p) => sum + (p.total || 0), 0),
    suppliers: new Set(filteredPurchases.map(p => p.supplier).filter(Boolean)).size,
    products: filteredPurchases.filter(p => p.type === 'product').length,
    ingredients: filteredPurchases.filter(p => p.type === 'ingredient').length,
  }), [filteredPurchases])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando historial...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Historial de Compras</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          Registro de todas las compras de productos e ingredientes
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Compras</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.products} prod. · {stats.ingredients} ing.
                </p>
              </div>
              <Receipt className="w-8 h-8 text-primary-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Proveedores</p>
                <p className="text-2xl font-bold text-blue-600 mt-2">{stats.suppliers}</p>
              </div>
              <User className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Gastado</p>
                <p className="text-2xl font-bold text-green-600 mt-2">{formatCurrency(stats.totalAmount)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de tipo */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setFilterType('all')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
            filterType === 'all'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Todos ({allPurchases.length})
        </button>
        <button
          onClick={() => setFilterType('products')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
            filterType === 'products'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Productos ({allPurchases.filter(p => p.type === 'product').length})
        </button>
        <button
          onClick={() => setFilterType('ingredients')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
            filterType === 'ingredients'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Ingredientes ({allPurchases.filter(p => p.type === 'ingredient').length})
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, proveedor o factura..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                value={filterSupplier}
                onChange={e => setFilterSupplier(e.target.value)}
              >
                <option value="all">Todos los proveedores</option>
                {suppliers.map(supplier => (
                  <option key={supplier} value={supplier}>
                    {supplier}
                  </option>
                ))}
              </Select>

              <Input
                type="date"
                value={filterStartDate}
                onChange={e => setFilterStartDate(e.target.value)}
                placeholder="Fecha desde"
              />

              <Input
                type="date"
                value={filterEndDate}
                onChange={e => setFilterEndDate(e.target.value)}
                placeholder="Fecha hasta"
              />
            </div>

            {/* Clear filters */}
            {(filterStartDate || filterEndDate || filterSupplier !== 'all') && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setFilterStartDate('')
                    setFilterEndDate('')
                    setFilterSupplier('all')
                  }}
                  className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Purchases Table */}
      <Card>
        {filteredPurchases.length === 0 ? (
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {allPurchases.length === 0
                ? 'No hay compras registradas'
                : 'No se encontraron compras'}
            </h3>
            <p className="text-gray-600">
              {allPurchases.length === 0
                ? 'Registra tu primera compra'
                : 'Intenta con otros filtros de búsqueda'}
            </p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                <TableHead className="text-right">Precio Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden md:table-cell">Proveedor</TableHead>
                <TableHead className="hidden lg:table-cell">Factura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedPurchases.map(purchase => {
                const purchaseDate = purchase.date?.toDate
                  ? purchase.date.toDate()
                  : new Date(purchase.date)

                return (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400 hidden sm:block" />
                        <span className="text-sm whitespace-nowrap">
                          {formatDate(purchaseDate)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{purchase.name}</span>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      <Badge variant={purchase.type === 'ingredient' ? 'success' : 'default'} className="text-xs">
                        {purchase.type === 'ingredient' ? 'Ingrediente' : 'Producto'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm">
                        {purchase.quantity} {purchase.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm">
                        {formatCurrency(purchase.unitPrice)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-green-600">
                        {formatCurrency(purchase.total)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm">{purchase.supplier || '-'}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-gray-600">
                        {purchase.invoiceNumber || '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Load More Button */}
      {filteredPurchases.length > 0 && hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
            className="text-sm text-gray-600 hover:text-primary-600 transition-colors py-2 px-4 hover:bg-gray-50 rounded-lg"
          >
            Ver más compras ({filteredPurchases.length - visibleCount} restantes)
          </button>
        </div>
      )}
    </div>
  )
}
