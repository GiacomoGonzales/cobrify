import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Edit, Trash2, User, Loader2, AlertTriangle, ShoppingCart, DollarSign, TrendingUp, FileSpreadsheet } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { customerSchema } from '@/utils/schemas'
import { ID_TYPES } from '@/utils/peruUtils'
import {
  getCustomers,
  getCustomersWithStats,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '@/services/firestoreService'
import { formatCurrency } from '@/lib/utils'
import { generateCustomersExcel } from '@/services/customerExportService'

export default function Customers() {
  const { user, isDemoMode, demoData, getBusinessId, businessSettings } = useAppContext()
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [deletingCustomer, setDeletingCustomer] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [sortBy, setSortBy] = useState('name') // name, orders, spent

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      documentType: ID_TYPES.DNI,
      documentNumber: '',
      businessName: '',
      name: '',
      email: '',
      phone: '',
      address: '',
      studentName: '',
      studentSchedule: '',
      priceLevel: null,
    },
  })

  const documentType = watch('documentType')

  // Cargar clientes
  useEffect(() => {
    loadCustomers()
  }, [user])

  const loadCustomers = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        // Cargar datos de demo con stats simulados
        const customersWithStats = demoData.customers.map(customer => ({
          ...customer,
          ordersCount: 0,
          totalSpent: 0
        }))
        setCustomers(customersWithStats)
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      const result = await getCustomersWithStats(businessId)
      if (result.success) {
        setCustomers(result.data || [])
      } else {
        console.error('Error al cargar clientes:', result.error)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingCustomer(null)
    reset({
      documentType: ID_TYPES.DNI,
      documentNumber: '',
      businessName: '',
      name: '',
      email: '',
      phone: '',
      address: '',
      studentName: '',
      studentSchedule: '',
    })
    setIsModalOpen(true)
  }

  const openEditModal = customer => {
    setEditingCustomer(customer)
    reset({
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      businessName: customer.businessName || '',
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      studentName: customer.studentName || '',
      studentSchedule: customer.studentSchedule || '',
      priceLevel: customer.priceLevel || null,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingCustomer(null)
    reset()
  }

  const onSubmit = async data => {
    if (!user?.uid) return

    const businessId = getBusinessId()
    setIsSaving(true)

    try {
      let result

      if (editingCustomer) {
        // Actualizar
        result = await updateCustomer(businessId, editingCustomer.id, data)
      } else {
        // Crear
        result = await createCustomer(businessId, data)
      }

      if (result.success) {
        toast.success(
          editingCustomer
            ? 'Cliente actualizado exitosamente'
            : 'Cliente creado exitosamente'
        )
        closeModal()
        loadCustomers()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al guardar cliente:', error)
      toast.error('Error al guardar el cliente. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingCustomer || !user?.uid) return

    const businessId = getBusinessId()
    setIsSaving(true)
    try {
      const result = await deleteCustomer(businessId, deletingCustomer.id)

      if (result.success) {
        toast.success('Cliente eliminado exitosamente')
        setDeletingCustomer(null)
        loadCustomers()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar cliente:', error)
      toast.error('Error al eliminar el cliente. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExportToExcel = async () => {
    try {
      if (customers.length === 0) {
        toast.error('No hay clientes para exportar');
        return;
      }

      // Obtener datos del negocio
      const { getCompanySettings } = await import('@/services/firestoreService');
      const settingsResult = await getCompanySettings(user.uid);
      const businessData = settingsResult.success ? settingsResult.data : null;

      // Generar Excel
      await generateCustomersExcel(customers, businessData);
      toast.success(`${customers.length} cliente(s) exportado(s) exitosamente`);
    } catch (error) {
      console.error('Error al exportar clientes:', error);
      toast.error('Error al generar el archivo Excel');
    }
  }

  // Filtrar y ordenar clientes
  const filteredCustomers = customers
    .filter(customer => {
      const search = searchTerm.toLowerCase()
      return (
        customer.name?.toLowerCase().includes(search) ||
        customer.documentNumber?.includes(search) ||
        customer.businessName?.toLowerCase().includes(search) ||
        customer.email?.toLowerCase().includes(search) ||
        customer.studentName?.toLowerCase().includes(search) ||
        customer.studentSchedule?.toLowerCase().includes(search)
      )
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'orders':
          return (b.ordersCount || 0) - (a.ordersCount || 0)
        case 'spent':
          return (b.totalSpent || 0) - (a.totalSpent || 0)
        case 'name':
        default:
          return (a.name || '').localeCompare(b.name || '')
      }
    })

  const getDocumentBadge = type => {
    const badges = {
      [ID_TYPES.RUC]: <Badge variant="primary">RUC</Badge>,
      [ID_TYPES.DNI]: <Badge>DNI</Badge>,
      [ID_TYPES.CE]: <Badge variant="secondary">CE</Badge>,
      [ID_TYPES.PASSPORT]: <Badge variant="secondary">Pasaporte</Badge>,
    }
    return badges[type] || <Badge>{type}</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando clientes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tu cartera de clientes
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
          <Button onClick={openCreateModal} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      {/* Search & Sort */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm flex-1 min-w-0">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar por nombre, RUC, DNI, alumno..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
            {/* Ordenar */}
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
              >
                <option value="name">Ordenar por Nombre</option>
                <option value="orders">Ordenar por Pedidos</option>
                <option value="spent">Ordenar por Total Gastado</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-600">Total Clientes</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{customers.length}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg flex-shrink-0">
                <User className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-600">Total Pedidos</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {customers.reduce((sum, c) => sum + (c.ordersCount || 0), 0)}
                </p>
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
                <p className="text-sm font-medium text-gray-600">Ingresos Totales</p>
                <p className="text-xl font-bold text-gray-900 mt-2">
                  {formatCurrency(customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0))}
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
                <p className="text-sm font-medium text-gray-600">Promedio por Cliente</p>
                <p className="text-xl font-bold text-gray-900 mt-2">
                  {formatCurrency(
                    customers.length > 0
                      ? customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0) / customers.length
                      : 0
                  )}
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customers Table */}
      <Card>
        {filteredCustomers.length === 0 ? (
          <CardContent className="p-12 text-center">
            <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza agregando tu primer cliente'}
            </p>
            {!searchTerm && (
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Cliente
              </Button>
            )}
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre / Razón Social</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="hidden lg:table-cell">Dirección</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Pedidos</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Total Gastado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map(customer => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        {customer.businessName && customer.businessName !== customer.name && (
                          <p className="text-xs text-gray-500">{customer.businessName}</p>
                        )}
                        {customer.studentName && (
                          <div className="text-xs text-primary-600">
                            <span className="font-medium">Alumno: {customer.studentName}</span>
                            {customer.studentSchedule && (
                              <span className="text-gray-500 ml-2">({customer.studentSchedule})</span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {customer.documentType && customer.documentNumber ? (
                          <>
                            {getDocumentBadge(customer.documentType)}
                            <span className="text-sm">{customer.documentNumber}</span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">Sin documento</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {customer.email && (
                          <p className="text-sm">{customer.email}</p>
                        )}
                        {customer.phone && (
                          <p className="text-xs text-gray-500">{customer.phone}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-sm text-gray-600">{customer.address || '-'}</p>
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell">
                      <div className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full">
                        <span className="text-sm font-semibold">{customer.ordersCount || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(customer.totalSpent || 0)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openEditModal(customer)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingCustomer(customer)}
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

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Tipo de Documento (opcional)"
              error={errors.documentType?.message}
              {...register('documentType')}
            >
              <option value="">Seleccionar...</option>
              <option value={ID_TYPES.DNI}>DNI</option>
              <option value={ID_TYPES.RUC}>RUC</option>
              <option value={ID_TYPES.CE}>Carnet de Extranjería</option>
              <option value={ID_TYPES.PASSPORT}>Pasaporte</option>
            </Select>

            <Input
              label="Número de Documento (opcional)"
              placeholder={documentType === ID_TYPES.RUC ? '20123456789' : documentType === ID_TYPES.DNI ? '12345678' : 'Número de documento'}
              error={errors.documentNumber?.message}
              {...register('documentNumber')}
            />
          </div>

          {documentType === ID_TYPES.RUC && (
            <Input
              label="Razón Social"
              placeholder="MI EMPRESA SAC"
              error={errors.businessName?.message}
              {...register('businessName')}
            />
          )}

          <Input
            label="Nombre"
            required
            placeholder={documentType === ID_TYPES.RUC ? 'Nombre Comercial' : 'Nombre Completo'}
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Correo Electrónico"
              type="email"
              placeholder="correo@ejemplo.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Teléfono"
              type="tel"
              placeholder="987654321"
              error={errors.phone?.message}
              {...register('phone')}
            />
          </div>

          <Input
            label="Dirección"
            placeholder="Av. Principal 123, Distrito, Lima"
            error={errors.address?.message}
            {...register('address')}
          />

          {/* Campos Alumno y Horario - solo si está habilitado en configuración */}
          {businessSettings?.posCustomFields?.showStudentField && (
            <>
              <Input
                label="Nombre del Alumno"
                placeholder="Nombre del alumno inscrito"
                error={errors.studentName?.message}
                {...register('studentName')}
              />
              <Input
                label="Horario / Turno"
                placeholder="Ej: Lunes y Miércoles 5:00 PM"
                error={errors.studentSchedule?.message}
                {...register('studentSchedule')}
              />
            </>
          )}

          {/* Nivel de precio - solo si está habilitado múltiples precios */}
          {businessSettings?.multiplePricesEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nivel de Precio
              </label>
              <select
                {...register('priceLevel')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Sin nivel asignado</option>
                <option value="price1">{businessSettings?.priceLabels?.price1 || 'Precio 1'}</option>
                <option value="price2">{businessSettings?.priceLabels?.price2 || 'Precio 2'}</option>
                <option value="price3">{businessSettings?.priceLabels?.price3 || 'Precio 3'}</option>
                <option value="price4">{businessSettings?.priceLabels?.price4 || 'Precio 4'}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Si asignas un nivel, el cliente verá automáticamente ese precio en el POS.
              </p>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>{editingCustomer ? 'Actualizar' : 'Crear'} Cliente</>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingCustomer}
        onClose={() => setDeletingCustomer(null)}
        title="Eliminar Cliente"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar al cliente{' '}
                <strong>{deletingCustomer?.name}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción no se puede deshacer.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingCustomer(null)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isSaving}>
              {isSaving ? (
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
