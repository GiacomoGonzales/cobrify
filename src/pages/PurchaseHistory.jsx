import { useState, useEffect } from 'react'
import { Search, Package, Calendar, User, DollarSign, Loader2, Receipt, TrendingUp } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getPurchases } from '@/services/ingredientService'
import { getIngredients } from '@/services/ingredientService'

export default function PurchaseHistory() {
  const { user, getBusinessId } = useAppContext()
  const toast = useToast()

  const [purchases, setPurchases] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterIngredient, setFilterIngredient] = useState('all')
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
      const businessId = getBusinessId()
      const [purchasesResult, ingredientsResult] = await Promise.all([
        getPurchases(businessId),
        getIngredients(businessId)
      ])

      if (purchasesResult.success) {
        setPurchases(purchasesResult.data || [])
      }

      if (ingredientsResult.success) {
        setIngredients(ingredientsResult.data || [])
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  // Get unique suppliers
  const suppliers = Array.from(
    new Set(purchases.map(p => p.supplier).filter(Boolean))
  )

  // Filter purchases
  const filteredPurchases = purchases.filter(purchase => {
    const matchesSearch =
      purchase.ingredientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesIngredient = filterIngredient === 'all' || purchase.ingredientId === filterIngredient
    const matchesSupplier = filterSupplier === 'all' || purchase.supplier === filterSupplier

    let matchesDateRange = true
    if (filterStartDate || filterEndDate) {
      const purchaseDate = purchase.purchaseDate?.toDate ? purchase.purchaseDate.toDate() : new Date(purchase.purchaseDate)

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

    return matchesSearch && matchesIngredient && matchesSupplier && matchesDateRange
  })

  // Apply pagination
  const displayedPurchases = filteredPurchases.slice(0, visibleCount)
  const hasMore = filteredPurchases.length > visibleCount

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(20)
  }, [searchTerm, filterIngredient, filterSupplier, filterStartDate, filterEndDate])

  // Stats
  const stats = {
    total: filteredPurchases.length,
    totalAmount: filteredPurchases.reduce((sum, p) => sum + (p.totalCost || 0), 0),
    suppliers: new Set(filteredPurchases.map(p => p.supplier).filter(Boolean)).size
  }

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
          Registro de todas las compras de ingredientes
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por ingrediente, proveedor o factura..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Select
                value={filterIngredient}
                onChange={e => setFilterIngredient(e.target.value)}
              >
                <option value="all">Todos los ingredientes</option>
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name}
                  </option>
                ))}
              </Select>

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
            {(filterStartDate || filterEndDate || filterIngredient !== 'all' || filterSupplier !== 'all') && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setFilterStartDate('')
                    setFilterEndDate('')
                    setFilterIngredient('all')
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
              {purchases.length === 0
                ? 'No hay compras registradas'
                : 'No se encontraron compras'}
            </h3>
            <p className="text-gray-600">
              {purchases.length === 0
                ? 'Registra tu primera compra de ingredientes'
                : 'Intenta con otros filtros de búsqueda'}
            </p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Ingrediente</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Precio Unit.</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Factura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedPurchases.map(purchase => {
                const purchaseDate = purchase.purchaseDate?.toDate
                  ? purchase.purchaseDate.toDate()
                  : new Date(purchase.purchaseDate)

                return (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-sm whitespace-nowrap">
                          {formatDate(purchaseDate)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{purchase.ingredientName}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {purchase.quantity} {purchase.unit}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {formatCurrency(purchase.unitPrice)}/{purchase.unit}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(purchase.totalCost)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{purchase.supplier || 'Sin proveedor'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
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
