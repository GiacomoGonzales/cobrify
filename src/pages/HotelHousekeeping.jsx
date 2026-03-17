import { useState, useEffect } from 'react'
import { Loader2, BedDouble, Wrench, SparklesIcon, ClipboardCheck, Pencil, Check, X } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getRooms, updateRoomStatus } from '@/services/hotelService'

const STATUS_CONFIG = {
  available: { label: 'Disponible', badge: 'success', color: 'border-green-300 bg-green-50' },
  occupied: { label: 'Ocupada', badge: 'danger', color: 'border-red-300 bg-red-50' },
  cleaning: { label: 'Limpieza', badge: 'warning', color: 'border-yellow-300 bg-yellow-50' },
  maintenance: { label: 'Mantenimiento', badge: 'default', color: 'border-gray-300 bg-gray-100' },
}

const TABS = [
  { key: 'all', label: 'Todas' },
  { key: 'cleaning', label: 'Limpieza pendiente' },
  { key: 'maintenance', label: 'Mantenimiento' },
  { key: 'available', label: 'Limpias' },
]

export default function HotelHousekeeping() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [rooms, setRooms] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [updatingId, setUpdatingId] = useState(null)
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    loadRooms()
  }, [user, isDemoMode])

  const loadRooms = async () => {
    try {
      setIsLoading(true)
      const businessId = getBusinessId()
      const result = await getRooms(businessId)
      if (result.success) {
        setRooms(result.data)
      } else {
        toast.error('Error al cargar habitaciones')
      }
    } catch (error) {
      console.error('Error loading rooms:', error)
      toast.error('Error al cargar habitaciones')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatusChange = async (roomId, newStatus) => {
    try {
      setUpdatingId(roomId)
      const businessId = getBusinessId()
      const result = await updateRoomStatus(businessId, roomId, newStatus)
      if (result.success) {
        setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: newStatus } : r))
        toast.success('Estado actualizado')
      } else {
        toast.error('Error al actualizar estado')
      }
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('Error al actualizar estado')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleNoteSave = (roomId) => {
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, notes: noteText } : r))
    setEditingNoteId(null)
    setNoteText('')
  }

  const startEditNote = (room) => {
    setEditingNoteId(room.id)
    setNoteText(room.notes || '')
  }

  const filteredRooms = activeTab === 'all'
    ? rooms
    : rooms.filter(r => r.status === activeTab)

  const stats = {
    cleaning: rooms.filter(r => r.status === 'cleaning').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
    available: rooms.filter(r => r.status === 'available').length,
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Housekeeping</h1>
        <p className="text-sm text-gray-500 mt-1">Gestión de limpieza y mantenimiento de habitaciones</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-yellow-700">{stats.cleaning}</p>
            <p className="text-xs text-yellow-600">Pendientes de limpieza</p>
          </CardContent>
        </Card>
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-red-700">{stats.maintenance}</p>
            <p className="text-xs text-red-600">En mantenimiento</p>
          </CardContent>
        </Card>
        <Card className="border-green-300 bg-green-50">
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-green-700">{stats.available}</p>
            <p className="text-xs text-green-600">Limpias</p>
          </CardContent>
        </Card>
      </div>

      {/* Room grid */}
      {filteredRooms.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <BedDouble className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No hay habitaciones en esta categoría</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredRooms.map(room => {
            const config = STATUS_CONFIG[room.status] || STATUS_CONFIG.available
            const isUpdating = updatingId === room.id
            const isEditingNote = editingNoteId === room.id

            return (
              <Card key={room.id} className={`border ${config.color}`}>
                <CardContent className="p-4 space-y-3">
                  {/* Room number & badge */}
                  <div className="flex items-start justify-between">
                    <span className="text-2xl font-bold text-gray-900">{room.number}</span>
                    <Badge variant={config.badge}>{config.label}</Badge>
                  </div>

                  {/* Room info */}
                  <div className="text-sm text-gray-600 space-y-0.5">
                    <p className="capitalize">{room.type || 'Simple'}</p>
                    {room.floor && <p>Piso {room.floor}</p>}
                  </div>

                  {/* Occupied note */}
                  {room.status === 'occupied' && (
                    <p className="text-xs text-red-600 italic">No molestar</p>
                  )}

                  {/* Notes */}
                  <div className="min-h-[28px]">
                    {isEditingNote ? (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          className="flex-1 text-xs border rounded px-2 py-1"
                          placeholder="Nota..."
                          autoFocus
                        />
                        <button onClick={() => handleNoteSave(room.id)} className="text-green-600">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingNoteId(null)} className="text-gray-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditNote(room)}
                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" />
                        {room.notes || 'Agregar nota'}
                      </button>
                    )}
                  </div>

                  {/* Action button */}
                  {room.status === 'cleaning' && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleStatusChange(room.id, 'available')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-1" />}
                      Marcar como Limpia
                    </Button>
                  )}
                  {room.status === 'maintenance' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleStatusChange(room.id, 'available')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4 mr-1" />}
                      Finalizar Mantenimiento
                    </Button>
                  )}
                  {room.status === 'available' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleStatusChange(room.id, 'maintenance')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4 mr-1" />}
                      Enviar a Mantenimiento
                    </Button>
                  )}
                  {room.status === 'occupied' && (
                    <p className="text-xs text-center text-gray-400 py-1">Ocupada</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
