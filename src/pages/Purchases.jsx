import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getPurchases, deletePurchase } from '@/services/firestoreService'

export default function Purchases() {
  const { user, isDemoMode, demoData } = useAppContext()
  const toast = useToast()
  const [purchases, setPurchases] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewingPurchase, setViewingPurchase] = useState(null)
  const [deletingPurchase, setDeletingPurchase] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

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

      const result = await getPurchases(user.uid)
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
      const result = await deletePurchase(user.uid, deletingPurchase.id)

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

  const filteredPurchases = purchases.filter(purchase => {
    const search = searchTerm.toLowerCase()
    return (
      purchase.invoiceNumber?.toLowerCase().includes(search) ||
      purchase.supplier?.businessName?.toLowerCase().includes(search) ||
      purchase.supplier?.documentNumber?.includes(search)
    )
  })

  const stats = {
    total: purchases.length,
    totalAmount: purchases.reduce((sum, p) => sum + (p.total || 0), 0),
    thisMonth: purchases.filter(p => {
      if (!p.createdAt) return false
      const date = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
      const now = new Date()
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    }).length,
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
        <Link to="/compras/nueva" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Compra
          </Button>
        </Link>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
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
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Compras</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg">
                <ShoppingBag className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Este Mes</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.thisMonth}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monto Total</p>
                <p className="text-xl font-bold text-gray-900 mt-2">
                  {formatCurrency(stats.totalAmount)}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600" />
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
              <Link to="/compras/nueva">
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
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Productos</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.map(purchase => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-medium">{purchase.invoiceNumber}</TableCell>
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
                    <TableCell>
                      <div className="flex items-center justify-end space-x-2">
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
    </div>
  )
}
