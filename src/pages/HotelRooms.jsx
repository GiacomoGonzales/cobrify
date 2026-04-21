import { useState, useEffect } from 'react'
import { Plus, BedDouble, Loader2, Trash2, Users, CheckCircle, AlertTriangle, Wrench, Edit, X, User, Calendar, DollarSign, Wifi, Phone, Clock, Settings, Receipt, LogOut, ShoppingCart } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createRoom, getRooms, updateRoom, deleteRoom, updateRoomStatus, getActiveReservations, checkOut } from '@/services/hotelService'

const STATUS_CONFIG = {
  available: { label: 'Disponible', color: 'bg-green-500', bg: 'bg-green-50 border-green-300', text: 'text-green-700', icon: CheckCircle, iconColor: 'text-green-500' },
  occupied: { label: 'Ocupada', color: 'bg-red-500', bg: 'bg-red-50 border-red-300', text: 'text-red-700', icon: Users, iconColor: 'text-red-500' },
  cleaning: { label: 'Limpieza', color: 'bg-yellow-500', bg: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-700', icon: AlertTriangle, iconColor: 'text-yellow-500' },
  maintenance: { label: 'Mantenimiento', color: 'bg-gray-500', bg: 'bg-gray-50 border-gray-300', text: 'text-gray-700', icon: Wrench, iconColor: 'text-gray-500' },
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
}

// Transiciones de estado válidas para operación diaria
const STATUS_TRANSITIONS = {
  available: ['occupied', 'cleaning', 'maintenance'],
  occupied: ['cleaning', 'available'],
  cleaning: ['available', 'maintenance'],
  maintenance: ['available', 'cleaning'],
}

export default function HotelRooms() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const appNavigate = useAppNavigate()
  const toast = useToast()

  const [rooms, setRooms] = useState([])
  const [activeReservations, setActiveReservations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  // Panel de detalle operativo
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  // Modal de configuración (crear/editar)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  // Filtro de estado
  const [statusFilter, setStatusFilter] = useState('all')

  const stats = {
    total: rooms.length,
    available: rooms.filter(r => r.status === 'available').length,
    occupied: rooms.filter(r => r.status === 'occupied').length,
    cleaning: rooms.filter(r => r.status === 'cleaning').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
  }

  const filteredRooms = statusFilter === 'all'
    ? rooms
    : rooms.filter(r => r.status === statusFilter)

  // Obtener huésped actual de una habitación ocupada
  const getGuestForRoom = (roomId) => {
    const source = isDemoMode
      ? (demoData?.hotelReservations || [])
      : activeReservations
    return source.find(r => r.roomId === roomId && r.status === 'checked_in')
  }

  useEffect(() => {
    loadRooms()
  }, [user, isDemoMode])

  const loadRooms = async () => {
    if (!user?.uid && !isDemoMode) return
    setIsLoading(true)
    try {
      if (isDemoMode && demoData?.hotelRooms) {
        setRooms(demoData.hotelRooms)
        setActiveReservations(demoData.hotelReservations || [])
        setIsLoading(false)
        return
      }
      const businessId = getBusinessId()
      const [roomsResult, reservationsResult] = await Promise.all([
        getRooms(businessId),
        getActiveReservations(businessId),
      ])
      if (roomsResult.success) {
        setRooms(roomsResult.data)
      } else {
        toast.error('Error al cargar habitaciones')
      }
      if (reservationsResult.success) {
        setActiveReservations(reservationsResult.data || [])
      }
    } catch (error) {
      toast.error('Error al cargar habitaciones')
    } finally {
      setIsLoading(false)
    }
  }

  // --- Gestión operativa (panel de detalle) ---

  const openRoomDetail = (room) => {
    setSelectedRoom(room)
  }

  const closeRoomDetail = () => {
    setSelectedRoom(null)
  }

  // Ir al folio de la reserva de esta habitación
  const handleGoToFolio = (guest) => {
    if (!guest) return
    setSelectedRoom(null)
    appNavigate(`/reservas?folio=${guest.id}`)
  }

  // Ir al Punto de Venta
  const handleGoToPOS = () => {
    setSelectedRoom(null)
    appNavigate('/pos')
  }

  // Check-out desde el detalle de habitación
  const handleQuickCheckOut = async (guest) => {
    if (!selectedRoom || !guest) return
    if (!window.confirm(`¿Confirmar check-out de ${guest.guestName}? La habitación pasará a limpieza.`)) return

    setIsCheckingOut(true)
    try {
      if (isDemoMode) {
        setRooms(prev => prev.map(r =>
          r.id === selectedRoom.id ? { ...r, status: 'cleaning' } : r
        ))
        setActiveReservations(prev => prev.map(r =>
          r.id === guest.id ? { ...r, status: 'checked_out' } : r
        ))
        setSelectedRoom(prev => ({ ...prev, status: 'cleaning' }))
        toast.success(`Check-out realizado: ${guest.guestName} (DEMO)`)
        return
      }
      const businessId = getBusinessId()
      const result = await checkOut(businessId, guest.id, selectedRoom.id)
      if (result.success) {
        toast.success(`Check-out realizado: ${guest.guestName}`)
        await loadRooms()
        setSelectedRoom(prev => ({ ...prev, status: 'cleaning' }))
      } else {
        toast.error(result.error || 'Error en check-out')
      }
    } catch (error) {
      toast.error('Error en check-out')
    } finally {
      setIsCheckingOut(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    if (!selectedRoom || newStatus === selectedRoom.status) return

    setIsChangingStatus(true)
    try {
      if (isDemoMode) {
        // En demo, actualizar localmente
        setRooms(prev => prev.map(r =>
          r.id === selectedRoom.id ? { ...r, status: newStatus } : r
        ))
        setSelectedRoom(prev => ({ ...prev, status: newStatus }))
        toast.success(`Habitación ${selectedRoom.number} → ${STATUS_CONFIG[newStatus].label}`)
      } else {
        const businessId = getBusinessId()
        const result = await updateRoomStatus(businessId, selectedRoom.id, newStatus)
        if (result.success) {
          toast.success(`Habitación ${selectedRoom.number} → ${STATUS_CONFIG[newStatus].label}`)
          await loadRooms()
          setSelectedRoom(prev => ({ ...prev, status: newStatus }))
        } else {
          toast.error(result.error || 'Error al cambiar estado')
        }
      }
    } catch (error) {
      toast.error('Error al cambiar estado')
    } finally {
      setIsChangingStatus(false)
    }
  }

  // --- Configuración de habitación (modal CRUD) ---

  const openCreateModal = () => {
    setEditingRoom(null)
    setFormData(INITIAL_FORM)
    setDeleteConfirm(false)
    setIsConfigModalOpen(true)
  }

  const openEditFromDetail = () => {
    if (!selectedRoom) return
    setEditingRoom(selectedRoom)
    setFormData({
      number: selectedRoom.number || '',
      name: selectedRoom.name || '',
      type: selectedRoom.type || 'simple',
      floor: selectedRoom.floor?.toString() || '',
      rate: (selectedRoom.rate || selectedRoom.ratePerNight)?.toString() || '',
      capacity: selectedRoom.capacity?.toString() || '1',
      amenities: Array.isArray(selectedRoom.amenities) ? selectedRoom.amenities.join(', ') : (selectedRoom.amenities || ''),
      notes: selectedRoom.notes || '',
    })
    setDeleteConfirm(false)
    setSelectedRoom(null)
    setIsConfigModalOpen(true)
  }

  const closeConfigModal = () => {
    setIsConfigModalOpen(false)
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

      if (isDemoMode) {
        if (editingRoom) {
          setRooms(prev => prev.map(r =>
            r.id === editingRoom.id ? { ...r, ...payload } : r
          ))
          toast.success('Habitación actualizada')
        } else {
          const newRoom = { ...payload, id: `room-${Date.now()}`, status: 'available' }
          setRooms(prev => [...prev, newRoom])
          toast.success('Habitación creada')
        }
        closeConfigModal()
        return
      }

      let result
      if (editingRoom) {
        result = await updateRoom(businessId, editingRoom.id, payload)
      } else {
        result = await createRoom(businessId, payload)
      }

      if (result.success) {
        toast.success(editingRoom ? 'Habitación actualizada' : 'Habitación creada')
        closeConfigModal()
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
      if (isDemoMode) {
        setRooms(prev => prev.filter(r => r.id !== editingRoom.id))
        toast.success('Habitación eliminada')
        closeConfigModal()
        return
      }
      const businessId = getBusinessId()
      const result = await deleteRoom(businessId, editingRoom.id)
      if (result.success) {
        toast.success('Habitación eliminada')
        closeConfigModal()
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

  // Formatear fecha corta
  const formatDate = (date) => {
    if (!date) return '-'
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BedDouble className="w-7 h-7 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Habitaciones</h1>
        </div>
        <Button onClick={openCreateModal} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Nueva
        </Button>
      </div>

      {/* Stats como filtros clickeables */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { key: 'all', label: 'Todas', count: stats.total, bgActive: 'bg-blue-100 border-blue-400', icon: BedDouble, iconColor: 'text-blue-600' },
          { key: 'available', label: 'Disponibles', count: stats.available, bgActive: 'bg-green-100 border-green-400', icon: CheckCircle, iconColor: 'text-green-600' },
          { key: 'occupied', label: 'Ocupadas', count: stats.occupied, bgActive: 'bg-red-100 border-red-400', icon: Users, iconColor: 'text-red-600' },
          { key: 'cleaning', label: 'Limpieza', count: stats.cleaning, bgActive: 'bg-yellow-100 border-yellow-400', icon: AlertTriangle, iconColor: 'text-yellow-600' },
          { key: 'maintenance', label: 'Mant.', count: stats.maintenance, bgActive: 'bg-gray-200 border-gray-400', icon: Wrench, iconColor: 'text-gray-600' },
        ].map(f => {
          const Icon = f.icon
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`p-2 rounded-lg border-2 transition-all text-center ${
                statusFilter === f.key
                  ? `${f.bgActive} shadow-sm`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${statusFilter === f.key ? f.iconColor : 'text-gray-400'}`} />
              <p className="text-lg font-bold leading-none">{f.count}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 hidden sm:block">{f.label}</p>
            </button>
          )
        })}
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
      ) : filteredRooms.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          No hay habitaciones con estado "{STATUS_CONFIG[statusFilter]?.label}"
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredRooms.map(room => {
            const statusCfg = STATUS_CONFIG[room.status] || STATUS_CONFIG.available
            const typeLabel = ROOM_TYPES.find(t => t.value === (room.type || '').toLowerCase())?.label || room.type
            const guest = room.status === 'occupied' ? getGuestForRoom(room.id) : null
            return (
              <div
                key={room.id}
                onClick={() => openRoomDetail(room)}
                className={`relative border-2 rounded-xl p-3 cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] ${statusCfg.bg}`}
              >
                {/* Status indicator dot */}
                <div className={`absolute top-2.5 right-2.5 w-3 h-3 rounded-full ${statusCfg.color} ring-2 ring-white`} />

                {/* Room number */}
                <p className="text-2xl font-bold text-gray-800 leading-none">{room.number}</p>

                {/* Type */}
                <p className="text-xs font-medium text-gray-500 mt-1">{typeLabel}</p>

                {/* Guest name if occupied */}
                {guest && (
                  <div className="flex items-center gap-1 mt-2 bg-white/60 rounded px-1.5 py-0.5">
                    <User className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <p className="text-[11px] text-gray-700 font-medium truncate">{guest.guestName}</p>
                  </div>
                )}

                {/* Rate */}
                <p className="text-xs font-semibold text-gray-600 mt-2">
                  S/ {(room.rate || room.ratePerNight || 0).toFixed(0)}
                  <span className="font-normal text-gray-400"> /n</span>
                </p>

                {/* Status badge */}
                <div className={`mt-2 text-center text-[10px] font-semibold py-0.5 rounded-full ${statusCfg.color} text-white`}>
                  {statusCfg.label}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Room Detail Panel (operativo) */}
      <Modal isOpen={!!selectedRoom} onClose={closeRoomDetail} title={`Habitación ${selectedRoom?.number || ''}`} size="md">
        {selectedRoom && (() => {
          const statusCfg = STATUS_CONFIG[selectedRoom.status] || STATUS_CONFIG.available
          const StatusIcon = statusCfg.icon
          const typeLabel = ROOM_TYPES.find(t => t.value === (selectedRoom.type || '').toLowerCase())?.label || selectedRoom.type
          const guest = selectedRoom.status === 'occupied' ? getGuestForRoom(selectedRoom.id) : null
          const allowedTransitions = STATUS_TRANSITIONS[selectedRoom.status] || []

          return (
            <div className="space-y-4">
              {/* Estado actual */}
              <div className={`flex items-center gap-3 p-3 rounded-xl ${statusCfg.bg} border-2`}>
                <StatusIcon className={`w-6 h-6 ${statusCfg.iconColor}`} />
                <div className="flex-1">
                  <p className={`text-sm font-bold ${statusCfg.text}`}>{statusCfg.label}</p>
                  <p className="text-xs text-gray-500">{typeLabel} · Piso {selectedRoom.floor || '-'} · Cap. {selectedRoom.capacity || 1}</p>
                </div>
                <p className="text-lg font-bold text-gray-800">
                  S/ {(selectedRoom.rate || selectedRoom.ratePerNight || 0).toFixed(2)}
                  <span className="text-xs font-normal text-gray-400"> /noche</span>
                </p>
              </div>

              {/* Huésped actual */}
              {guest && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Huésped actual</p>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-blue-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{guest.guestName}</p>
                      <p className="text-xs text-gray-500">{guest.guestDocumentType === 'A' ? 'Pasaporte' : 'DNI'}: {guest.guestDocument}</p>
                      {guest.guestPhone && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-500">{guest.guestPhone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600 pt-1 border-t border-blue-200">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>In: {formatDate(guest.checkIn)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>Out: {formatDate(guest.checkOut)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span>{guest.nights} noches</span>
                    </div>
                    <div className="flex items-center gap-1 ml-auto font-semibold">
                      <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                      <span>S/ {guest.totalAmount?.toFixed(2)}</span>
                    </div>
                  </div>
                  {guest.notes && (
                    <p className="text-xs text-blue-700 italic">"{guest.notes}"</p>
                  )}
                </div>
              )}

              {/* Acciones rápidas para habitación ocupada */}
              {guest && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleGoToFolio(guest)}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all hover:scale-[1.03] active:scale-95"
                  >
                    <Receipt className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-700">Cobrar / Folio</span>
                  </button>
                  <button
                    onClick={() => handleQuickCheckOut(guest)}
                    disabled={isCheckingOut}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCheckingOut ? (
                      <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                    ) : (
                      <LogOut className="w-5 h-5 text-orange-600" />
                    )}
                    <span className="text-xs font-semibold text-orange-700">Check-out</span>
                  </button>
                  <button
                    onClick={handleGoToPOS}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-primary-200 bg-primary-50 hover:bg-primary-100 transition-all hover:scale-[1.03] active:scale-95"
                  >
                    <ShoppingCart className="w-5 h-5 text-primary-600" />
                    <span className="text-xs font-semibold text-primary-700">Punto de Venta</span>
                  </button>
                </div>
              )}

              {/* Amenidades */}
              {selectedRoom.amenities && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Amenidades</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(selectedRoom.amenities) ? selectedRoom.amenities : selectedRoom.amenities.split(',').map(a => a.trim())).filter(Boolean).map((amenity, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-600">
                        <Wifi className="w-3 h-3" />
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cambiar estado */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cambiar estado</p>
                <div className="grid grid-cols-3 gap-2">
                  {allowedTransitions.map(status => {
                    const cfg = STATUS_CONFIG[status]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        disabled={isChangingStatus}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all
                          hover:scale-[1.03] hover:shadow-md active:scale-95
                          ${cfg.bg}
                          ${isChangingStatus ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        {isChangingStatus ? (
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        ) : (
                          <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
                        )}
                        <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Footer con botón de configuración */}
              <div className="flex items-center justify-between pt-3 border-t">
                <button
                  onClick={openEditFromDetail}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Editar configuración
                </button>
                <Button variant="outline" size="sm" onClick={closeRoomDetail}>
                  Cerrar
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Config Modal (crear/editar habitación) */}
      <Modal isOpen={isConfigModalOpen} onClose={closeConfigModal} title={editingRoom ? `Configurar Hab. ${editingRoom.number}` : 'Nueva Habitación'}>
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
              <Button variant="outline" onClick={closeConfigModal}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingRoom ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
