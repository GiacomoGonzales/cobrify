import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Edit, Trash2, Truck, Loader2, AlertTriangle, MoreVertical, Phone, Mail, MapPin } from 'lucide-react'
import { z } from 'zod'
import { useAppContext } from '@/hooks/useAppContext'
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
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'

// Schema de validación para proveedores
const supplierSchema = z.object({
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
  businessName: z.string().min(1, 'Razón social es requerida'),
  contactName: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
})

export default function Suppliers() {
  const { user, isDemoMode, demoData, getBusinessId } = useAppContext()
  const toast = useToast()
  const [suppliers, setSuppliers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [deletingSupplier, setDeletingSupplier] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false })

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    getValues,
    watch,
  } = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      documentType: '',
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
      // MODO DEMO: Usar datos de ejemplo
      if (isDemoMode && demoData) {
        setSuppliers(demoData.suppliers || [])
        setIsLoading(false)
        return
      }

      const result = await getSuppliers(getBusinessId())
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
      documentType: '',
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
      documentType: supplier.documentType || '',
      documentNumber: supplier.documentNumber || '',
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

  // Buscar datos de DNI o RUC automáticamente
  const handleLookupDocument = async () => {
    const docNumber = getValues('documentNumber')
    const docType = getValues('documentType')

    if (!docNumber) {
      toast.error('Ingrese un número de documento para buscar')
      return
    }

    setIsLookingUp(true)

    try {
      let result

      // Determinar si es DNI o RUC según el tipo seleccionado o la longitud
      if (docType === ID_TYPES.DNI || docNumber.length === 8) {
        if (docNumber.length !== 8) {
          toast.error('El DNI debe tener 8 dígitos')
          setIsLookingUp(false)
          return
        }
        result = await consultarDNI(docNumber)

        if (result.success) {
          setValue('businessName', result.data.nombreCompleto || '')
          setValue('documentType', ID_TYPES.DNI)
          toast.success(`Datos encontrados: ${result.data.nombreCompleto}`)
        }
      } else if (docType === ID_TYPES.RUC || docNumber.length === 11) {
        if (docNumber.length !== 11) {
          toast.error('El RUC debe tener 11 dígitos')
          setIsLookingUp(false)
          return
        }
        result = await consultarRUC(docNumber)

        if (result.success) {
          setValue('businessName', result.data.razonSocial || '')
          setValue('address', result.data.direccion || '')
          setValue('documentType', ID_TYPES.RUC)
          toast.success(`Datos encontrados: ${result.data.razonSocial}`)
        }
      } else {
        toast.error('Seleccione un tipo de documento o ingrese 8 dígitos (DNI) u 11 dígitos (RUC)')
        setIsLookingUp(false)
        return
      }

      if (result && !result.success) {
        toast.error(result.error || 'No se encontraron datos para este documento')
      }
    } catch (error) {
      console.error('Error al buscar documento:', error)
      toast.error('Error al consultar el documento. Verifique su conexión.')
    } finally {
      setIsLookingUp(false)
    }
  }

  const onSubmit = async data => {
    if (!user?.uid) return

    // MODO DEMO: No permitir modificaciones
    if (isDemoMode) {
      toast.error('No se pueden crear o editar proveedores en modo demo')
      return
    }

    setIsSaving(true)

    try {
      let result

      if (editingSupplier) {
        result = await updateSupplier(getBusinessId(), editingSupplier.id, data)
      } else {
        result = await createSupplier(getBusinessId(), data)
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

    // MODO DEMO: No permitir eliminaciones
    if (isDemoMode) {
      toast.error('No se pueden eliminar proveedores en modo demo')
      setDeletingSupplier(null)
      return
    }

    setIsSaving(true)
    try {
      const result = await deleteSupplier(getBusinessId(), deletingSupplier.id)

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
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
            <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar por razón social, RUC, contacto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
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
          <div className="overflow-hidden">
            {/* Vista móvil - Tarjetas */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filteredSuppliers.map(supplier => (
                <div key={supplier.id} className="px-4 py-3 hover:bg-gray-50">
                  {/* Fila 1: Nombre + acciones */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-2 flex-1">{supplier.businessName}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const menuHeight = 120
                        const spaceBelow = window.innerHeight - rect.bottom
                        const openUpward = spaceBelow < menuHeight
                        setMenuPosition({
                          top: openUpward ? rect.top - 8 : rect.bottom + 8,
                          right: window.innerWidth - rect.right,
                          openUpward
                        })
                        setOpenMenuId(openMenuId === supplier.id ? null : supplier.id)
                      }}
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila 2: Documento + Contacto */}
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    {supplier.documentType && supplier.documentNumber ? (
                      <span className="flex items-center gap-1">
                        {getDocumentBadge(supplier.documentType)}
                        <span>{supplier.documentNumber}</span>
                      </span>
                    ) : null}
                    {supplier.contactName && (
                      <>
                        {supplier.documentNumber && <span className="text-gray-300">•</span>}
                        <span>{supplier.contactName}</span>
                      </>
                    )}
                  </div>

                  {/* Fila 3: Email + Teléfono */}
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <div className="flex items-center gap-3">
                      {supplier.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {supplier.phone}
                        </span>
                      )}
                      {supplier.email && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3" />
                          {supplier.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Vista desktop - Tabla */}
            <div className="hidden lg:block">
              <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
                <div className="col-span-3">Razón Social</div>
                <div className="col-span-2">Documento</div>
                <div className="col-span-3">Contacto</div>
                <div className="col-span-3">Dirección</div>
                <div className="col-span-1 text-right">Acciones</div>
              </div>
              <div className="divide-y divide-gray-100">
                {filteredSuppliers.map(supplier => (
                  <div key={supplier.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50">
                    <div className="col-span-3">
                      <p className="font-medium text-sm">{supplier.businessName}</p>
                      {supplier.contactName && (
                        <p className="text-xs text-gray-500">Contacto: {supplier.contactName}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      {supplier.documentType && supplier.documentNumber ? (
                        <div className="flex items-center space-x-2">
                          {getDocumentBadge(supplier.documentType)}
                          <span className="text-sm">{supplier.documentNumber}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </div>
                    <div className="col-span-3">
                      {supplier.email && <p className="text-sm">{supplier.email}</p>}
                      {supplier.phone && <p className="text-xs text-gray-500">{supplier.phone}</p>}
                    </div>
                    <div className="col-span-3">
                      <p className="text-sm text-gray-600 truncate">{supplier.address || '-'}</p>
                    </div>
                    <div className="col-span-1">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(supplier)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingSupplier(supplier)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Menú de acciones flotante */}
            {openMenuId && (() => {
              const menuSupplier = filteredSuppliers.find(s => s.id === openMenuId)
              if (!menuSupplier) return null
              return (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                  <div
                    className="fixed w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                    style={{
                      top: `${menuPosition.top}px`,
                      right: `${menuPosition.right}px`,
                      transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                    }}
                  >
                    <button
                      onClick={() => { openEditModal(menuSupplier); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit className="w-4 h-4 text-blue-600" />
                      Editar
                    </button>
                    <button
                      onClick={() => { setDeletingSupplier(menuSupplier); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar
                    </button>
                  </div>
                </>
              )
            })()}
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
              error={errors.documentType?.message}
              {...register('documentType')}
            >
              <option value="">Sin documento</option>
              <option value={ID_TYPES.RUC}>RUC</option>
              <option value={ID_TYPES.DNI}>DNI</option>
              <option value={ID_TYPES.CE}>Carnet de Extranjería</option>
            </Select>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número de Documento
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="20123456789"
                  {...register('documentNumber')}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLookupDocument}
                  disabled={isLookingUp}
                  className="px-3"
                  title="Buscar datos en SUNAT/RENIEC"
                >
                  {isLookingUp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {errors.documentNumber?.message && (
                <p className="text-sm text-red-500 mt-1">{errors.documentNumber.message}</p>
              )}
            </div>
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
