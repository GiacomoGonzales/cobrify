import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Warehouse,
  Plus,
  Edit,
  Trash2,
  MapPin,
  CheckCircle,
  XCircle,
  Loader2,
  Package,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from '@/services/warehouseService'

// Schema de validación
const warehouseSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  location: z.string().optional(),
  isDefault: z.boolean().optional(),
})

export default function Warehouses() {
  const { user, getBusinessId } = useAppContext()
  const toast = useToast()
  const [warehouses, setWarehouses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState(null)
  const [deletingWarehouse, setDeletingWarehouse] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: '',
      location: '',
      isDefault: false,
    },
  })

  useEffect(() => {
    loadWarehouses()
  }, [user])

  const loadWarehouses = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const result = await getWarehouses(getBusinessId())
      if (result.success) {
        setWarehouses(result.data || [])
      } else {
        toast.error(result.error || 'Error al cargar almacenes')
      }
    } catch (error) {
      console.error('Error al cargar almacenes:', error)
      toast.error('Error al cargar almacenes')
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingWarehouse(null)
    reset({
      name: '',
      location: '',
      isDefault: warehouses.length === 0, // Primero es default automáticamente
    })
    setIsModalOpen(true)
  }

  const openEditModal = (warehouse) => {
    setEditingWarehouse(warehouse)
    reset({
      name: warehouse.name,
      location: warehouse.location || '',
      isDefault: warehouse.isDefault || false,
    })
    setIsModalOpen(true)
  }

  const onSubmit = async (data) => {
    setIsSaving(true)
    try {
      let result

      if (editingWarehouse) {
        // Actualizar
        result = await updateWarehouse(getBusinessId(), editingWarehouse.id, data)
      } else {
        // Crear
        result = await createWarehouse(getBusinessId(), data)
      }

      if (result.success) {
        toast.success(
          editingWarehouse
            ? 'Almacén actualizado exitosamente'
            : 'Almacén creado exitosamente'
        )
        setIsModalOpen(false)
        loadWarehouses()
      } else {
        toast.error(result.error || 'Error al guardar almacén')
      }
    } catch (error) {
      console.error('Error al guardar almacén:', error)
      toast.error('Error al guardar almacén')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (warehouseId) => {
    try {
      const result = await deleteWarehouse(getBusinessId(), warehouseId)
      if (result.success) {
        toast.success('Almacén eliminado exitosamente')
        setDeletingWarehouse(null)
        loadWarehouses()
      } else {
        toast.error(result.error || 'Error al eliminar almacén')
      }
    } catch (error) {
      console.error('Error al eliminar almacén:', error)
      toast.error('Error al eliminar almacén')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Warehouse className="w-7 h-7" />
            Almacenes
          </h1>
          <p className="text-gray-600 mt-1">Gestiona tus almacenes y puntos de inventario</p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Almacén
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Almacenes</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{warehouses.length}</p>
              </div>
              <Warehouse className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Almacenes Activos</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  {warehouses.filter((w) => w.isActive).length}
                </p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Almacén Principal</p>
                <p className="text-lg font-bold text-gray-900 mt-2">
                  {warehouses.find((w) => w.isDefault)?.name || 'No definido'}
                </p>
              </div>
              <Package className="w-10 h-10 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de almacenes */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Almacenes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : warehouses.length === 0 ? (
            <div className="text-center py-12">
              <Warehouse className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay almacenes registrados
              </h3>
              <p className="text-gray-600 mb-4">
                Crea tu primer almacén para comenzar a gestionar inventario
              </p>
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Almacén
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((warehouse) => (
                  <TableRow key={warehouse.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Warehouse className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{warehouse.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span>{warehouse.location || 'No especificada'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {warehouse.isActive ? (
                        <Badge variant="success" className="flex items-center gap-1 w-fit">
                          <CheckCircle className="w-3 h-3" />
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" />
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {warehouse.isDefault ? (
                        <Badge variant="primary" className="w-fit">Principal</Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(warehouse)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingWarehouse(warehouse)}
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
          )}
        </CardContent>
      </Card>

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingWarehouse ? 'Editar Almacén' : 'Nuevo Almacén'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Almacén *
            </label>
            <Input
              {...register('name')}
              placeholder="Ej: Almacén Principal"
              error={errors.name?.message}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ubicación
            </label>
            <Input
              {...register('location')}
              placeholder="Ej: Lima - Cercado"
              error={errors.location?.message}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              {...register('isDefault')}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="isDefault" className="text-sm text-gray-700">
              Marcar como almacén principal
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>{editingWarehouse ? 'Actualizar' : 'Crear'} Almacén</>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Eliminar */}
      <Modal
        isOpen={!!deletingWarehouse}
        onClose={() => setDeletingWarehouse(null)}
        title="Eliminar Almacén"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            ¿Estás seguro de eliminar el almacén <strong>{deletingWarehouse?.name}</strong>?
          </p>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              ⚠️ Esta acción no se puede deshacer. Asegúrate de que no haya productos con stock
              en este almacén.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setDeletingWarehouse(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => handleDelete(deletingWarehouse.id)}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
