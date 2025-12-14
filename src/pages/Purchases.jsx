import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  Search,
  Eye,
  Trash2,
  Loader2,
  ShoppingBag,
  AlertTriangle,
  Package,
  DollarSign,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  CheckCircle,
  CreditCard,
  Clock,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getPurchases, deletePurchase, updatePurchase } from '@/services/firestoreService'

export default function Purchases() {
  const { user, isDemoMode, demoData, getBusinessId } = useAppContext()
  const toast = useToast()
  const [purchases, setPurchases] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewingPurchase, setViewingPurchase] = useState(null)
  const [deletingPurchase, setDeletingPurchase] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Estado para marcar como pagado
  const [markingAsPaid, setMarkingAsPaid] = useState(null)
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)

  // Ordenamiento
  const [sortField, setSortField] = useState('date') // 'date', 'amount', 'supplier'
  const [sortDirection, setSortDirection] = useState('desc') // 'asc', 'desc'

  // Filtro de fechas
  const [dateFilter, setDateFilter] = useState('all') // 'all', 'today', '3days', '7days', '30days', 'custom'
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Filtro de tipo de pago
  const [paymentFilter, setPaymentFilter] = useState('all') // 'all', 'contado', 'credito', 'pending'

  useEffect(() => {
    loadPurchases()
  }, [user])

  const loadPurchases = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      // MODO DEMO: Usar datos de ejemplo
      if (isDemoMode && demoData) {
        setPurchases(demoData.purchases || [])
        setIsLoading(false)
        return
      }

      const result = await getPurchases(getBusinessId())
      if (result.success) {
        setPurchases(result.data || [])
      } else {
        console.error('Error al cargar compras:', result.error)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingPurchase || !user?.uid) return

    // MODO DEMO: No permitir eliminaciones
    if (isDemoMode) {
      toast.error('No se pueden eliminar compras en modo demo')
      setDeletingPurchase(null)
      return
    }

    setIsDeleting(true)
    try {
      const result = await deletePurchase(getBusinessId(), deletingPurchase.id)

      if (result.success) {
        toast.success('Compra eliminada exitosamente')
        setDeletingPurchase(null)
        loadPurchases()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar compra:', error)
      toast.error('Error al eliminar la compra. Inténtalo nuevamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Marcar compra como pagada
  const handleMarkAsPaid = async () => {
    if (!markingAsPaid || !user?.uid) return

    if (isDemoMode) {
      toast.error('No se pueden modificar compras en modo demo')
      setMarkingAsPaid(null)
      return
    }

    setIsMarkingPaid(true)
    try {
      const result = await updatePurchase(getBusinessId(), markingAsPaid.id, {
        paymentStatus: 'paid',
        paidAmount: markingAsPaid.total,
        paidAt: new Date(),
      })

      if (result.success) {
        toast.success('Compra marcada como pagada')
        setMarkingAsPaid(null)
        loadPurchases()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al marcar como pagada:', error)
      toast.error('Error al actualizar la compra')
    } finally {
      setIsMarkingPaid(false)
    }
  }

  // Función para cambiar ordenamiento
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Icono de ordenamiento
  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4 text-primary-600" />
      : <ArrowDown className="w-4 h-4 text-primary-600" />
  }

  // Obtener rango de fechas basado en el filtro
  const getDateRange = () => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    switch (dateFilter) {
      case 'today':
        return { start: startOfDay, end: endOfDay }
      case '3days':
        const threeDaysAgo = new Date(startOfDay)
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 2)
        return { start: threeDaysAgo, end: endOfDay }
      case '7days':
        const sevenDaysAgo = new Date(startOfDay)
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        return { start: sevenDaysAgo, end: endOfDay }
      case '30days':
        const thirtyDaysAgo = new Date(startOfDay)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
        return { start: thirtyDaysAgo, end: endOfDay }
      case 'custom':
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate)
          start.setHours(0, 0, 0, 0)
          const end = new Date(customEndDate)
          end.setHours(23, 59, 59, 999)
          return { start, end }
        }
        return null
      default:
        return null
    }
  }

  // Filtrar por fecha
  const filterByDate = (purchase) => {
    const dateRange = getDateRange()
    if (!dateRange) return true // 'all' o custom sin fechas

    const purchaseDate = purchase.createdAt?.toDate
      ? purchase.createdAt.toDate()
      : new Date(purchase.createdAt || 0)

    return purchaseDate >= dateRange.start && purchaseDate <= dateRange.end
  }

  // Filtrar por tipo de pago
  const filterByPayment = (purchase) => {
    if (paymentFilter === 'all') return true
    if (paymentFilter === 'contado') return purchase.paymentType === 'contado'
    if (paymentFilter === 'credito') return purchase.paymentType === 'credito'
    if (paymentFilter === 'pending') return purchase.paymentType === 'credito' && purchase.paymentStatus === 'pending'
    return true
  }

  const filteredPurchases = purchases
    .filter(filterByDate) // Filtrar por fecha
    .filter(filterByPayment) // Filtrar por tipo de pago
    .filter(purchase => {
      // Si no hay término de búsqueda, mostrar todas las compras
      if (!searchTerm || searchTerm.trim() === '') return true

      const search = searchTerm.toLowerCase()
      return (
        purchase.invoiceNumber?.toLowerCase().includes(search) ||
        purchase.supplier?.businessName?.toLowerCase().includes(search) ||
        purchase.supplier?.documentNumber?.includes(search)
      )
    })
    .sort((a, b) => {
      let comparison = 0

      if (sortField === 'date') {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
        comparison = dateA - dateB
      } else if (sortField === 'amount') {
        comparison = (a.total || 0) - (b.total || 0)
      } else if (sortField === 'supplier') {
        const supplierA = a.supplier?.businessName?.toLowerCase() || ''
        const supplierB = b.supplier?.businessName?.toLowerCase() || ''
        comparison = supplierA.localeCompare(supplierB)
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

  // Compras filtradas solo por fecha (para las estadísticas, sin búsqueda de texto)
  const dateFilteredPurchases = useMemo(() => {
    return purchases.filter(filterByDate)
  }, [purchases, dateFilter, customStartDate, customEndDate])

  // Estadísticas
  const stats = useMemo(() => {
    const filtered = dateFilteredPurchases
    const pendingPurchases = filtered.filter(p => p.paymentType === 'credito' && p.paymentStatus === 'pending')
    const pendingAmount = pendingPurchases.reduce((sum, p) => {
      const remaining = (p.total || 0) - (p.paidAmount || 0)
      return sum + remaining
    }, 0)

    return {
      total: filtered.length,
      totalAmount: filtered.reduce((sum, p) => sum + (p.total || 0), 0),
      totalAll: purchases.length,
      pendingCount: pendingPurchases.length,
      pendingAmount: pendingAmount,
    }
  }, [dateFilteredPurchases, purchases])

  // Etiqueta del filtro actual
  const getFilterLabel = () => {
    switch (dateFilter) {
      case 'today': return 'Hoy'
      case '3days': return 'Últimos 3 días'
      case '7days': return 'Últimos 7 días'
      case '30days': return 'Últimos 30 días'
      case 'custom':
        if (customStartDate && customEndDate) {
          return `${customStartDate} - ${customEndDate}`
        }
        return 'Personalizado'
      default: return 'Todo el tiempo'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando compras...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Compras</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tus órdenes de compra y entrada de mercadería
          </p>
        </div>
        <Link to="/app/compras/nueva" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Compra
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por número de factura, proveedor..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Filtro de fechas */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 font-medium">Período:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'Todo' },
                { value: 'today', label: 'Hoy' },
                { value: '3days', label: '3 días' },
                { value: '7days', label: '7 días' },
                { value: '30days', label: '30 días' },
                { value: 'custom', label: 'Personalizado' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDateFilter(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    dateFilter === option.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fechas personalizadas */}
          {dateFilter === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Desde:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Hasta:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
          )}

          {/* Filtro de tipo de pago */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 font-medium">Pago:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'Todos' },
                { value: 'contado', label: 'Contado' },
                { value: 'credito', label: 'Crédito' },
                { value: 'pending', label: 'Pendientes' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPaymentFilter(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    paymentFilter === option.value
                      ? option.value === 'pending' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                  {option.value === 'pending' && stats.pendingCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                      {stats.pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Compras</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <div className="p-2 bg-primary-100 rounded-lg">
                <ShoppingBag className="w-5 h-5 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Monto Total</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {formatCurrency(stats.totalAmount)}
                </p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.pendingCount > 0 ? 'ring-2 ring-red-200' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Por Pagar</p>
                <p className="text-lg font-bold text-red-600 mt-1">
                  {formatCurrency(stats.pendingAmount)}
                </p>
                {stats.pendingCount > 0 && (
                  <p className="text-xs text-red-500">{stats.pendingCount} pendientes</p>
                )}
              </div>
              <div className="p-2 bg-red-100 rounded-lg">
                <Clock className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Período</p>
                <p className="text-sm font-bold text-gray-900 mt-1">{getFilterLabel()}</p>
              </div>
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Purchases Table */}
      <Card>
        {filteredPurchases.length === 0 ? (
          <CardContent className="p-12 text-center">
            <ShoppingBag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron compras' : 'No hay compras registradas'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza registrando tu primera compra'}
            </p>
            {!searchTerm && (
              <Link to="/app/compras/nueva">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Primera Compra
                </Button>
              </Link>
            )}
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Factura</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('supplier')}
                      className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                    >
                      Proveedor
                      {getSortIcon('supplier')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('date')}
                      className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                    >
                      Fecha
                      {getSortIcon('date')}
                    </button>
                  </TableHead>
                  <TableHead className="text-center hidden md:table-cell">Productos</TableHead>
                  <TableHead className="text-right">
                    <button
                      onClick={() => handleSort('amount')}
                      className="flex items-center gap-1 hover:text-primary-600 transition-colors ml-auto"
                    >
                      Monto
                      {getSortIcon('amount')}
                    </button>
                  </TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.map(purchase => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-medium">{purchase.invoiceNumber || '-'}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{purchase.supplier?.businessName || 'N/A'}</p>
                        <p className="text-xs text-gray-500">
                          {purchase.supplier?.documentNumber || ''}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {purchase.createdAt
                        ? formatDate(
                            purchase.createdAt.toDate
                              ? purchase.createdAt.toDate()
                              : purchase.createdAt
                          )
                        : '-'}
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell">
                      <Badge>{purchase.items?.length || 0} items</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(purchase.total)}
                    </TableCell>
                    <TableCell className="text-center">
                      {purchase.paymentType === 'credito' ? (
                        purchase.paymentStatus === 'paid' ? (
                          <Badge variant="success" className="text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Pagado
                          </Badge>
                        ) : (
                          <Badge variant="danger" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            Pendiente
                          </Badge>
                        )
                      ) : (
                        <Badge variant="default" className="text-xs bg-gray-100 text-gray-700">
                          Contado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end space-x-1">
                        {/* Botón marcar como pagado (solo para crédito pendiente) */}
                        {purchase.paymentType === 'credito' && purchase.paymentStatus === 'pending' && (
                          <button
                            onClick={() => setMarkingAsPaid(purchase)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Marcar como pagado"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setViewingPurchase(purchase)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingPurchase(purchase)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Modal Ver Detalles */}
      <Modal
        isOpen={!!viewingPurchase}
        onClose={() => setViewingPurchase(null)}
        title="Detalles de Compra"
        size="lg"
      >
        {viewingPurchase && (
          <div className="space-y-6">
            {/* Información del proveedor */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Proveedor</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">{viewingPurchase.supplier?.businessName}</p>
                <p className="text-sm text-gray-600">
                  {viewingPurchase.supplier?.documentNumber}
                </p>
              </div>
            </div>

            {/* Información de la factura */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Factura</h3>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Número:</span>
                  <span className="text-sm font-medium">{viewingPurchase.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Fecha:</span>
                  <span className="text-sm font-medium">
                    {viewingPurchase.createdAt
                      ? formatDate(
                          viewingPurchase.createdAt.toDate
                            ? viewingPurchase.createdAt.toDate()
                            : viewingPurchase.createdAt
                        )
                      : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Productos */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Productos</h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Cantidad</TableHead>
                      <TableHead className="text-right">Precio Unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingPurchase.items?.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Totales */}
            <div className="border-t pt-4 space-y-2">
              {viewingPurchase.subtotal && (
                <>
                  <div className="flex justify-between items-center text-gray-600">
                    <span className="text-sm">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(viewingPurchase.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-600">
                    <span className="text-sm">IGV (18%):</span>
                    <span className="font-medium">{formatCurrency(viewingPurchase.igv)}</span>
                  </div>
                </>
              )}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-700">Total:</span>
                <span className="text-2xl font-bold text-primary-600">
                  {formatCurrency(viewingPurchase.total)}
                </span>
              </div>
            </div>

            {viewingPurchase.notes && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Notas</h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  {viewingPurchase.notes}
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setViewingPurchase(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingPurchase}
        onClose={() => setDeletingPurchase(null)}
        title="Eliminar Compra"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar la compra{' '}
                <strong>{deletingPurchase?.invoiceNumber}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción no se puede deshacer. Los cambios de stock se mantendrán.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingPurchase(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>Eliminar</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmar Marcar como Pagado */}
      <Modal
        isOpen={!!markingAsPaid}
        onClose={() => setMarkingAsPaid(null)}
        title="Marcar como Pagado"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Confirmas que la compra{' '}
                <strong>{markingAsPaid?.invoiceNumber || 'sin número'}</strong> de{' '}
                <strong>{markingAsPaid?.supplier?.businessName || 'proveedor'}</strong>{' '}
                ha sido pagada?
              </p>
              <p className="text-lg font-bold text-gray-900 mt-2">
                Monto: {formatCurrency(markingAsPaid?.total || 0)}
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMarkingAsPaid(null)}
              disabled={isMarkingPaid}
            >
              Cancelar
            </Button>
            <Button onClick={handleMarkAsPaid} disabled={isMarkingPaid}>
              {isMarkingPaid ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirmar Pago
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
