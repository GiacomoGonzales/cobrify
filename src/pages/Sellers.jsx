import { useState, useEffect } from 'react'
import { Users, Plus, Edit, Trash2, UserCheck, DollarSign, ShoppingCart, TrendingUp, Loader2 } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { getSellers, getSellersStats, deleteSeller, toggleSellerStatus } from '@/services/sellerService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import SellerFormModal from '@/components/SellerFormModal'
import { formatCurrency } from '@/lib/utils'

export default function Sellers() {
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [sellers, setSellers] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingSeller, setEditingSeller] = useState(null)

  // Cargar datos de Firestore
  useEffect(() => {
    loadSellers()
  }, [])

  const loadSellers = async () => {
    setIsLoading(true)
    try {
      if (isDemoMode) {
        toast.info('Esta función no está disponible en modo demo')
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      const [sellersResult, statsResult] = await Promise.all([
        getSellers(businessId),
        getSellersStats(businessId),
      ])

      if (sellersResult.success) {
        setSellers(sellersResult.data || [])
      } else {
        toast.error('Error al cargar vendedores: ' + sellersResult.error)
      }

      if (statsResult.success) {
        setStats(statsResult.data)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar datos de vendedores')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingSeller(null)
    setIsFormModalOpen(true)
  }

  const handleEdit = (seller) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingSeller(seller)
    setIsFormModalOpen(true)
  }

  const handleDelete = async (seller) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    if (!window.confirm(`¿Eliminar al vendedor ${seller.name}?`)) return

    try {
      const result = await deleteSeller(getBusinessId(), seller.id)
      if (result.success) {
        toast.success('Vendedor eliminado correctamente')
        loadSellers()
      } else {
        toast.error('Error al eliminar vendedor: ' + result.error)
      }
    } catch (error) {
      console.error('Error al eliminar vendedor:', error)
      toast.error('Error al eliminar vendedor')
    }
  }

  const handleToggleStatus = async (seller) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      const result = await toggleSellerStatus(getBusinessId(), seller.id, seller.status)
      if (result.success) {
        toast.success(`Vendedor ${result.newStatus === 'active' ? 'activado' : 'desactivado'}`)
        loadSellers()
      } else {
        toast.error('Error al cambiar estado: ' + result.error)
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error)
      toast.error('Error al cambiar estado del vendedor')
    }
  }

  const handleFormSuccess = () => {
    setIsFormModalOpen(false)
    setEditingSeller(null)
    loadSellers()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Vendedores</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tu equipo de vendedores y sus métricas de ventas
          </p>
        </div>
        <Button onClick={handleCreate} className="w-full lg:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Vendedor
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">Total Vendedores</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
                </div>
                <div className="p-3 bg-primary-100 rounded-lg flex-shrink-0">
                  <Users className="w-6 h-6 text-primary-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">Ventas de Hoy</p>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {formatCurrency(stats.todaySales)}
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-lg flex-shrink-0">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">Órdenes de Hoy</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{stats.todayOrders}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <ShoppingCart className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">Ventas Totales</p>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {formatCurrency(stats.totalSales)}
                  </p>
                </div>
                <div className="p-3 bg-purple-100 rounded-lg flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sellers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Vendedores</CardTitle>
        </CardHeader>
        <CardContent>
          {sellers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay vendedores registrados</h3>
              <p className="text-gray-600 mb-4">Comienza agregando tu primer vendedor</p>
              <Button onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Vendedor
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Ventas Hoy</TableHead>
                    <TableHead>Órdenes Hoy</TableHead>
                    <TableHead>Total Ventas</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellers.map((seller) => (
                    <TableRow key={seller.id}>
                      <TableCell className="font-medium">{seller.code}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{seller.name}</p>
                          {seller.dni && (
                            <p className="text-sm text-gray-500">DNI: {seller.dni}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {seller.phone && <p>{seller.phone}</p>}
                          {seller.email && <p className="text-gray-500">{seller.email}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={seller.status === 'active' ? 'success' : 'secondary'}>
                          {seller.status === 'active' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(seller.todaySales || 0)}
                      </TableCell>
                      <TableCell>
                        {seller.todayOrders || 0}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(seller.totalSales || 0)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(seller)}
                            title={seller.status === 'active' ? 'Desactivar' : 'Activar'}
                          >
                            <UserCheck className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(seller)}
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(seller)}
                            title="Eliminar"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <SellerFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setEditingSeller(null)
        }}
        seller={editingSeller}
        onSuccess={handleFormSuccess}
      />
    </div>
  )
}
