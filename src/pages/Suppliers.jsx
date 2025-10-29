import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Edit, Trash2, Truck, Loader2, AlertTriangle } from 'lucide-react'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { ID_TYPES } from '@/utils/peruUtils'
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '@/services/firestoreService'

// Schema de validación para proveedores
const supplierSchema = z.object({
  documentType: z.string().min(1, 'Tipo de documento es requerido'),
  documentNumber: z.string().min(8, 'Número de documento inválido'),
  businessName: z.string().min(1, 'Razón social es requerida'),
  contactName: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
})

export default function Suppliers() {
  const { user } = useAuth()
  const toast = useToast()
  const [suppliers, setSuppliers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [deletingSupplier, setDeletingSupplier] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      documentType: ID_TYPES.RUC,
      documentNumber: '',
      businessName: '',
      contactName: '',
      email: '',
      phone: '',
      address: '',
    },
  })

  useEffect(() => {
    loadSuppliers()
  }, [user])

  const loadSuppliers = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const result = await getSuppliers(user.uid)
      if (result.success) {
        setSuppliers(result.data || [])
      } else {
        console.error('Error al cargar proveedores:', result.error)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingSupplier(null)
    reset({
      documentType: ID_TYPES.RUC,
      documentNumber: '',
      businessName: '',
      contactName: '',
      email: '',
      phone: '',
      address: '',
    })
    setIsModalOpen(true)
  }

  const openEditModal = supplier => {
    setEditingSupplier(supplier)
    reset({
      documentType: supplier.documentType,
      documentNumber: supplier.documentNumber,
      businessName: supplier.businessName || '',
      contactName: supplier.contactName || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingSupplier(null)
    reset()
  }

  const onSubmit = async data => {
    if (!user?.uid) return

    setIsSaving(true)

    try {
      let result

      if (editingSupplier) {
        result = await updateSupplier(user.uid, editingSupplier.id, data)
      } else {
        result = await createSupplier(user.uid, data)
      }

      if (result.success) {
        toast.success(
          editingSupplier
            ? 'Proveedor actualizado exitosamente'
            : 'Proveedor creado exitosamente'
        )
        closeModal()
        loadSuppliers()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al guardar proveedor:', error)
      toast.error('Error al guardar el proveedor. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingSupplier || !user?.uid) return

    setIsSaving(true)
    try {
      const result = await deleteSupplier(user.uid, deletingSupplier.id)

      if (result.success) {
        toast.success('Proveedor eliminado exitosamente')
        setDeletingSupplier(null)
        loadSuppliers()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar proveedor:', error)
      toast.error('Error al eliminar el proveedor. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredSuppliers = suppliers.filter(supplier => {
    const search = searchTerm.toLowerCase()
    return (
      supplier.businessName?.toLowerCase().includes(search) ||
      supplier.documentNumber?.includes(search) ||
      supplier.contactName?.toLowerCase().includes(search) ||
      supplier.email?.toLowerCase().includes(search)
    )
  })

  const getDocumentBadge = type => {
    const badges = {
      [ID_TYPES.RUC]: <Badge variant="primary">RUC</Badge>,
      [ID_TYPES.DNI]: <Badge>DNI</Badge>,
      [ID_TYPES.CE]: <Badge variant="secondary">CE</Badge>,
    }
    return badges[type] || <Badge>{type}</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando proveedores...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Proveedores</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tus proveedores y realiza compras
          </p>
        </div>
        <Button onClick={openCreateModal} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Proveedor
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por razón social, RUC, contacto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Proveedores</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{suppliers.length}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg">
                <Truck className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suppliers Table */}
      <Card>
        {filteredSuppliers.length === 0 ? (
          <CardContent className="p-12 text-center">
            <Truck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza agregando tu primer proveedor'}
            </p>
            {!searchTerm && (
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Proveedor
              </Button>
            )}
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razón Social</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="hidden lg:table-cell">Dirección</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map(supplier => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{supplier.businessName}</p>
                        {supplier.contactName && (
                          <p className="text-xs text-gray-500">Contacto: {supplier.contactName}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getDocumentBadge(supplier.documentType)}
                        <span className="text-sm">{supplier.documentNumber}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {supplier.email && <p className="text-sm">{supplier.email}</p>}
                        {supplier.phone && <p className="text-xs text-gray-500">{supplier.phone}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-sm text-gray-600">{supplier.address || '-'}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openEditModal(supplier)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingSupplier(supplier)}
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
        title={editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
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
              <option value={ID_TYPES.RUC}>RUC</option>
              <option value={ID_TYPES.DNI}>DNI</option>
              <option value={ID_TYPES.CE}>Carnet de Extranjería</option>
            </Select>

            <Input
              label="Número de Documento"
              required
              placeholder="20123456789"
              error={errors.documentNumber?.message}
              {...register('documentNumber')}
            />
          </div>

          <Input
            label="Razón Social / Nombre"
            required
            placeholder="PROVEEDOR SAC"
            error={errors.businessName?.message}
            {...register('businessName')}
          />

          <Input
            label="Nombre de Contacto"
            placeholder="Juan Pérez"
            error={errors.contactName?.message}
            {...register('contactName')}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Correo Electrónico"
              type="email"
              placeholder="proveedor@ejemplo.com"
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
            placeholder="Av. Industrial 456, Lima"
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
                <>{editingSupplier ? 'Actualizar' : 'Crear'} Proveedor</>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingSupplier}
        onClose={() => setDeletingSupplier(null)}
        title="Eliminar Proveedor"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar al proveedor{' '}
                <strong>{deletingSupplier?.businessName}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">Esta acción no se puede deshacer.</p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingSupplier(null)}
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
