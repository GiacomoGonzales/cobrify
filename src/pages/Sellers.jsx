import { useState, useEffect } from 'react'
import { Users, Plus, Edit, Trash2, UserCheck, DollarSign, ShoppingCart, TrendingUp, Loader2, Store, Search } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { getSellers, getSellersStats, deleteSeller, toggleSellerStatus } from '@/services/sellerService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import SellerFormModal from '@/components/SellerFormModal'
import { formatCurrency } from '@/lib/utils'
import { getActiveBranches } from '@/services/branchService'

// Datos de ejemplo para modo demo
const DEMO_SELLERS = [
  {
    id: 'demo-seller-1',
    code: 'V001',
    name: 'Carlos Mendoza',
    dni: '45678912',
    phone: '987654321',
    email: 'carlos.mendoza@email.com',
    status: 'active',
    todaySales: 2450.00,
    todayOrders: 8,
    totalSales: 45670.50,
  },
  {
    id: 'demo-seller-2',
    code: 'V002',
    name: 'María García',
    dni: '78945612',
    phone: '976543210',
    email: 'maria.garcia@email.com',
    status: 'active',
    todaySales: 3180.00,
    todayOrders: 12,
    totalSales: 68920.00,
  },
  {
    id: 'demo-seller-3',
    code: 'V003',
    name: 'José Rodríguez',
    dni: '32165498',
    phone: '965432109',
    email: 'jose.rodriguez@email.com',
    status: 'active',
    todaySales: 1890.50,
    todayOrders: 6,
    totalSales: 32450.75,
  },
  {
    id: 'demo-seller-4',
    code: 'V004',
    name: 'Ana Torres',
    dni: '65432178',
    phone: '954321098',
    email: 'ana.torres@email.com',
    status: 'inactive',
    todaySales: 0,
    todayOrders: 0,
    totalSales: 15680.00,
  },
]

const DEMO_STATS = {
  total: 4,
  active: 3,
  todaySales: 7520.50,
  todayOrders: 26,
  totalSales: 162721.25,
}

export default function Sellers() {
  const { getBusinessId, isDemoMode, filterBranchesByAccess, user } = useAppContext()
  const toast = useToast()

  const [sellers, setSellers] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingSeller, setEditingSeller] = useState(null)
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Cargar datos de Firestore
  useEffect(() => {
    loadSellers()
    loadBranches()
  }, [])

  // Cargar sucursales para filtro
  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const result = await getActiveBranches(getBusinessId())
      if (result.success) {
        const branchList = filterBranchesByAccess ? filterBranchesByAccess(result.data || []) : (result.data || [])
        setBranches(branchList)
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
    }
  }

  // Filtrar vendedores
  const filteredSellers = sellers.filter(seller => {
    // Filtrar por búsqueda
    const search = searchTerm.toLowerCase()
    const matchesSearch = !searchTerm ||
      seller.name?.toLowerCase().includes(search) ||
      seller.code?.toLowerCase().includes(search) ||
      seller.dni?.includes(search) ||
      seller.email?.toLowerCase().includes(search)

    // Filtrar por sucursal
    let matchesBranch = true
    if (filterBranch !== 'all') {
      if (filterBranch === 'main') {
        matchesBranch = !seller.branchId
      } else {
        matchesBranch = seller.branchId === filterBranch
      }
    }

    return matchesSearch && matchesBranch
  })

  const loadSellers = async () => {
    setIsLoading(true)
    try {
      if (isDemoMode) {
        // Usar datos de ejemplo en modo demo
        setSellers(DEMO_SELLERS)
        setStats(DEMO_STATS)
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm flex-1 min-w-0">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar por nombre, código, DNI..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
            {/* Filtro de Sucursal */}
            {branches.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <Store className="w-4 h-4 text-gray-500" />
                <select
                  value={filterBranch}
                  onChange={e => setFilterBranch(e.target.value)}
                  className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas las sucursales</option>
                  <option value="main">Sucursal Principal</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sellers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Vendedores</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSellers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm || filterBranch !== 'all' ? 'No se encontraron vendedores' : 'No hay vendedores registrados'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || filterBranch !== 'all' ? 'Intenta con otros filtros de búsqueda' : 'Comienza agregando tu primer vendedor'}
              </p>
              {!searchTerm && filterBranch === 'all' && (
                <Button onClick={handleCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Vendedor
                </Button>
              )}
            </div>
          ) : (
            <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filteredSellers.map((seller) => (
                <div key={seller.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  {/* Fila 1: Código + nombre + acciones */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-primary-600 text-sm">{seller.code}</span>
                      <span className="text-sm font-medium text-gray-900 truncate">{seller.name}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <button
                        onClick={() => handleToggleStatus(seller)}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                        title={seller.status === 'active' ? 'Desactivar' : 'Activar'}
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(seller)}
                        className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(seller)}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Fila 2: DNI + contacto + sucursal */}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {seller.dni && <span>DNI: {seller.dni}</span>}
                    {seller.phone && <span>{seller.phone}</span>}
                    {branches.length > 0 && (
                      <span className="text-blue-600 flex items-center gap-0.5">
                        <Store className="w-3 h-3" />
                        {seller.branchId
                          ? branches.find(b => b.id === seller.branchId)?.name || 'Sucursal'
                          : 'Principal'}
                      </span>
                    )}
                  </div>

                  {/* Fila 3: Ventas hoy + órdenes + total + estado */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span>Hoy: <span className="font-semibold text-sm text-gray-900">{formatCurrency(seller.todaySales || 0)}</span></span>
                      <span>{seller.todayOrders || 0} órd.</span>
                      <span>Total: <span className="font-semibold">{formatCurrency(seller.totalSales || 0)}</span></span>
                    </div>
                    <Badge variant={seller.status === 'active' ? 'success' : 'secondary'}>
                      {seller.status === 'active' ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla para desktop */}
            <div className="hidden lg:block overflow-x-auto">
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
                  {filteredSellers.map((seller) => (
                    <TableRow key={seller.id}>
                      <TableCell className="font-medium">{seller.code}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{seller.name}</p>
                          {seller.dni && (
                            <p className="text-sm text-gray-500">DNI: {seller.dni}</p>
                          )}
                          {branches.length > 0 && (
                            <p className="text-xs text-blue-600 mt-0.5">
                              <Store className="w-3 h-3 inline mr-1" />
                              {seller.branchId
                                ? branches.find(b => b.id === seller.branchId)?.name || 'Sucursal'
                                : 'Sucursal Principal'}
                            </p>
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
            </>
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
