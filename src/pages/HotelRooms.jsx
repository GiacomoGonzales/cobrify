import { useState, useEffect } from 'react'
import { Plus, BedDouble, Loader2, Trash2, Users, CheckCircle, AlertTriangle, Wrench } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createRoom, getRooms, updateRoom, deleteRoom, updateRoomStatus } from '@/services/hotelService'

const STATUS_CONFIG = {
  available: { label: 'Disponible', color: 'bg-green-500', bg: 'bg-green-50 border-green-300', text: 'text-green-700' },
  occupied: { label: 'Ocupada', color: 'bg-red-500', bg: 'bg-red-50 border-red-300', text: 'text-red-700' },
  cleaning: { label: 'Limpieza', color: 'bg-yellow-500', bg: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-700' },
  maintenance: { label: 'Mantenimiento', color: 'bg-gray-500', bg: 'bg-gray-50 border-gray-300', text: 'text-gray-700' },
}

const ROOM_TYPES = [
  { value: 'simple', label: 'Simple' },
  { value: 'doble', label: 'Doble' },
  { value: 'matrimonial', label: 'Matrimonial' },
  { value: 'suite', label: 'Suite' },
  { value: 'familiar', label: 'Familiar' },
]

const INITIAL_FORM = {
  number: '',
  name: '',
  type: 'simple',
  floor: '',
  rate: '',
  capacity: '1',
  amenities: '',
  notes: '',
  status: 'available',
}

export default function HotelRooms() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [rooms, setRooms] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const stats = {
    total: rooms.length,
    available: rooms.filter(r => r.status === 'available').length,
    occupied: rooms.filter(r => r.status === 'occupied').length,
    cleaning: rooms.filter(r => r.status === 'cleaning').length,
  }

  useEffect(() => {
    loadRooms()
  }, [user, isDemoMode])

  const loadRooms = async () => {
    if (!user?.uid && !isDemoMode) return
    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const result = await getRooms(businessId)
      if (result.success) {
        setRooms(result.data)
      } else {
        toast.error('Error al cargar habitaciones')
      }
    } catch (error) {
      toast.error('Error al cargar habitaciones')
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingRoom(null)
    setFormData(INITIAL_FORM)
    setDeleteConfirm(false)
    setIsModalOpen(true)
  }

  const openEditModal = (room) => {
    setEditingRoom(room)
    setFormData({
      number: room.number || '',
      name: room.name || '',
      type: room.type || 'simple',
      floor: room.floor || '',
      rate: room.rate?.toString() || '',
      capacity: room.capacity?.toString() || '1',
      amenities: room.amenities || '',
      notes: room.notes || '',
      status: room.status || 'available',
    })
    setDeleteConfirm(false)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingRoom(null)
    setDeleteConfirm(false)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    if (!formData.number.trim()) {
      toast.error('El número de habitación es obligatorio')
      return
    }
    if (!formData.rate || parseFloat(formData.rate) <= 0) {
      toast.error('La tarifa debe ser mayor a 0')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const payload = {
        number: formData.number.trim(),
        name: formData.name.trim(),
        type: formData.type,
        floor: formData.floor.trim(),
        rate: parseFloat(formData.rate) || 0,
        capacity: parseInt(formData.capacity) || 1,
        amenities: formData.amenities.trim(),
        notes: formData.notes.trim(),
      }

      let result
      if (editingRoom) {
        if (formData.status !== editingRoom.status) {
          payload.status = formData.status
        }
        result = await updateRoom(businessId, editingRoom.id, payload)
      } else {
        result = await createRoom(businessId, payload)
      }

      if (result.success) {
        toast.success(editingRoom ? 'Habitación actualizada' : 'Habitación creada')
        closeModal()
        loadRooms()
      } else {
        toast.error(result.error || 'Error al guardar')
      }
    } catch (error) {
      toast.error('Error al guardar habitación')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }
    setIsDeleting(true)
    try {
      const businessId = getBusinessId()
      const result = await deleteRoom(businessId, editingRoom.id)
      if (result.success) {
        toast.success('Habitación eliminada')
        closeModal()
        loadRooms()
      } else {
        toast.error(result.error || 'Error al eliminar')
      }
    } catch (error) {
      toast.error('Error al eliminar habitación')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BedDouble className="w-7 h-7 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Habitaciones</h1>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Habitación
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BedDouble className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Disponibles</p>
              <p className="text-xl font-bold text-green-600">{stats.available}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Users className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Ocupadas</p>
              <p className="text-xl font-bold text-red-600">{stats.occupied}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Limpieza</p>
              <p className="text-xl font-bold text-yellow-600">{stats.cleaning}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Room Grid */}
      {rooms.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BedDouble className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No hay habitaciones registradas</p>
            <Button onClick={openCreateModal}>
              <Plus className="w-4 h-4 mr-2" />
              Crear primera habitación
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {rooms.map(room => {
            const statusCfg = STATUS_CONFIG[room.status] || STATUS_CONFIG.available
            const typeLabel = ROOM_TYPES.find(t => t.value === room.type)?.label || room.type
            return (
              <div
                key={room.id}
                onClick={() => openEditModal(room)}
                className={`relative border-2 rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] ${statusCfg.bg}`}
              >
                {/* Status indicator dot */}
                <div className={`absolute top-3 right-3 w-3 h-3 rounded-full ${statusCfg.color}`} />

                {/* Room number */}
                <p className="text-3xl font-bold text-gray-800 mb-1">{room.number}</p>

                {/* Room name */}
                {room.name && (
                  <p className="text-xs text-gray-500 truncate mb-2">{room.name}</p>
                )}

                {/* Type */}
                <p className="text-sm font-medium text-gray-600 mb-1">{typeLabel}</p>

                {/* Floor */}
                {room.floor && (
                  <p className="text-xs text-gray-400">Piso {room.floor}</p>
                )}

                {/* Rate */}
                <p className="text-sm font-semibold text-gray-700 mt-2">
                  S/ {(room.rate || 0).toFixed(2)}
                  <span className="text-xs font-normal text-gray-400"> /noche</span>
                </p>

                {/* Status badge */}
                <div className={`mt-3 text-center text-xs font-semibold py-1 rounded-full ${statusCfg.color} text-white`}>
                  {statusCfg.label}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingRoom ? `Editar Habitación ${editingRoom.number}` : 'Nueva Habitación'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Número"
              name="number"
              value={formData.number}
              onChange={handleChange}
              placeholder="101"
              required
            />
            <Input
              label="Nombre"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Hab. Premium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Tipo" name="type" value={formData.type} onChange={handleChange}>
              {ROOM_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
            <Input
              label="Piso"
              name="floor"
              value={formData.floor}
              onChange={handleChange}
              placeholder="1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tarifa por noche (S/)"
              name="rate"
              type="number"
              value={formData.rate}
              onChange={handleChange}
              placeholder="150.00"
              required
            />
            <Input
              label="Capacidad"
              name="capacity"
              type="number"
              value={formData.capacity}
              onChange={handleChange}
              placeholder="2"
            />
          </div>

          {editingRoom && (
            <Select label="Estado" name="status" value={formData.status} onChange={handleChange}>
              <option value="available">Disponible</option>
              <option value="occupied">Ocupada</option>
              <option value="cleaning">Limpieza</option>
              <option value="maintenance">Mantenimiento</option>
            </Select>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amenidades</label>
            <textarea
              name="amenities"
              value={formData.amenities}
              onChange={handleChange}
              rows={2}
              placeholder="WiFi, TV, Aire acondicionado, Minibar..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Notas adicionales..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            {editingRoom ? (
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {isDeleting ? 'Eliminando...' : deleteConfirm ? 'Confirmar eliminar' : 'Eliminar'}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeModal}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingRoom ? 'Guardar cambios' : 'Crear habitación'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
