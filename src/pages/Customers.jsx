import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Edit, Trash2, User, Loader2, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { customerSchema } from '@/utils/schemas'
import { ID_TYPES } from '@/utils/peruUtils'
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '@/services/firestoreService'

export default function Customers() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [deletingCustomer, setDeletingCustomer] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState(null)

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
      const result = await getCustomers(user.uid)
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

    setIsSaving(true)
    setMessage(null)

    try {
      let result

      if (editingCustomer) {
        // Actualizar
        result = await updateCustomer(user.uid, editingCustomer.id, data)
      } else {
        // Crear
        result = await createCustomer(user.uid, data)
      }

      if (result.success) {
        setMessage({
          type: 'success',
          text: editingCustomer
            ? '✓ Cliente actualizado exitosamente'
            : '✓ Cliente creado exitosamente',
        })
        closeModal()
        loadCustomers()
        setTimeout(() => setMessage(null), 3000)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al guardar cliente:', error)
      setMessage({
        type: 'error',
        text: 'Error al guardar el cliente. Inténtalo nuevamente.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingCustomer || !user?.uid) return

    setIsSaving(true)
    try {
      const result = await deleteCustomer(user.uid, deletingCustomer.id)

      if (result.success) {
        setMessage({
          type: 'success',
          text: '✓ Cliente eliminado exitosamente',
        })
        setDeletingCustomer(null)
        loadCustomers()
        setTimeout(() => setMessage(null), 3000)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar cliente:', error)
      setMessage({
        type: 'error',
        text: 'Error al eliminar el cliente. Inténtalo nuevamente.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Filtrar clientes por búsqueda
  const filteredCustomers = customers.filter(customer => {
    const search = searchTerm.toLowerCase()
    return (
      customer.name?.toLowerCase().includes(search) ||
      customer.documentNumber?.includes(search) ||
      customer.businessName?.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search)
    )
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
        <Button onClick={openCreateModal} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Cliente
        </Button>
      </div>

      {/* Messages */}
      {message && (
        <Alert
          variant={message.type === 'success' ? 'success' : 'danger'}
          title={message.type === 'success' ? 'Éxito' : 'Error'}
        >
          {message.text}
        </Alert>
      )}

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, RUC, DNI..."
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
                <p className="text-sm font-medium text-gray-600">Total Clientes</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{customers.length}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg">
                <User className="w-6 h-6 text-primary-600" />
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
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getDocumentBadge(customer.documentType)}
                        <span className="text-sm">{customer.documentNumber}</span>
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
              label="Tipo de Documento"
              required
              error={errors.documentType?.message}
              {...register('documentType')}
            >
              <option value={ID_TYPES.DNI}>DNI</option>
              <option value={ID_TYPES.RUC}>RUC</option>
              <option value={ID_TYPES.CE}>Carnet de Extranjería</option>
              <option value={ID_TYPES.PASSPORT}>Pasaporte</option>
            </Select>

            <Input
              label="Número de Documento"
              required
              placeholder={documentType === ID_TYPES.RUC ? '20123456789' : '12345678'}
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
