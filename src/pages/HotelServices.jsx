import { useState, useEffect } from 'react'
import { Waves, Gamepad2, Calendar, ConciergeBell, Plus, Edit2, Trash2, Users } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/lib/utils'
import { createService, getServices, updateService, deleteService } from '@/services/hotelService'

const SERVICE_TYPES = {
  pool: { label: 'Piscina', icon: Waves, color: 'blue' },
  games: { label: 'Juegos', icon: Gamepad2, color: 'purple' },
  events: { label: 'Eventos', icon: Calendar, color: 'orange' },
  other: { label: 'Otro', icon: ConciergeBell, color: 'gray' }
}

const RATE_TYPES = {
  per_person: 'Por persona',
  per_hour: 'Por hora',
  fixed: 'Precio fijo'
}

const initialFormData = {
  name: '',
  type: 'pool',
  rate: '',
  rateType: 'per_person',
  capacity: '',
  status: 'active',
  notes: ''
}

function HotelServices() {
  const { getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(initialFormData)

  const businessId = getBusinessId()

  useEffect(() => {
    if (businessId) loadServices()
  }, [businessId])

  const loadServices = async () => {
    try {
      setLoading(true)
      if (isDemoMode && demoData?.hotelServices) {
        setServices(demoData.hotelServices)
        setLoading(false)
        return
      }
      const result = await getServices(businessId)
      if (result.success) {
        setServices(result.data)
      } else {
        toast.error('Error al cargar servicios')
      }
    } catch (error) {
      console.error('Error al cargar servicios:', error)
      toast.error('Error al cargar servicios')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('El nombre del servicio es requerido')
      return
    }

    if (isDemoMode) {
      toast.error('En modo demo no se pueden guardar cambios')
      closeModal()
      return
    }

    try {
      setSaving(true)
      const payload = {
        ...formData,
        rate: Number(formData.rate) || 0,
        capacity: Number(formData.capacity) || 0
      }

      let result
      if (editingService) {
        result = await updateService(businessId, editingService.id, payload)
      } else {
        result = await createService(businessId, payload)
      }

      if (result.success) {
        toast.success(editingService ? 'Servicio actualizado' : 'Servicio creado')
        closeModal()
        loadServices()
      } else {
        toast.error(result.error || 'Error al guardar servicio')
      }
    } catch (error) {
      console.error('Error al guardar servicio:', error)
      toast.error('Error al guardar servicio')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (service) => {
    setEditingService(service)
    setFormData({
      name: service.name || '',
      type: service.type || 'pool',
      rate: service.rate || '',
      rateType: service.rateType || 'per_person',
      capacity: service.capacity || '',
      status: service.status || 'active',
      notes: service.notes || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (service) => {
    if (isDemoMode) {
      toast.error('En modo demo no se pueden eliminar servicios')
      return
    }

    if (!confirm(`¿Estás seguro de eliminar el servicio "${service.name}"?`)) return

    try {
      const result = await deleteService(businessId, service.id)
      if (result.success) {
        toast.success('Servicio eliminado')
        loadServices()
      } else {
        toast.error(result.error || 'Error al eliminar servicio')
      }
    } catch (error) {
      console.error('Error al eliminar servicio:', error)
      toast.error('Error al eliminar servicio')
    }
  }

  const handleToggleStatus = async (service) => {
    if (isDemoMode) return
    const newStatus = service.status === 'active' ? 'inactive' : 'active'
    const result = await updateService(businessId, service.id, { status: newStatus })
    if (result.success) {
      toast.success(`Servicio ${newStatus === 'active' ? 'activado' : 'desactivado'}`)
      loadServices()
    } else {
      toast.error('Error al cambiar estado')
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingService(null)
    setFormData(initialFormData)
  }

  const getTypeConfig = (type) => SERVICE_TYPES[type] || SERVICE_TYPES.other

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ConciergeBell className="w-7 h-7 text-amber-600" />
            Servicios del Hotel
          </h1>
          <p className="text-gray-600 mt-1">
            Gestiona los servicios y áreas recreativas del hotel
          </p>
        </div>
        <button
          onClick={() => { closeModal(); setShowModal(true) }}
          className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nuevo Servicio
        </button>
      </div>

      {/* Service cards */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando servicios...</p>
        </div>
      ) : services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ConciergeBell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay servicios registrados</h3>
            <p className="text-gray-600 mb-4">Comienza agregando los servicios y áreas del hotel</p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700"
            >
              <Plus className="w-5 h-5" />
              Agregar Servicio
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map(service => {
            const config = getTypeConfig(service.type)
            const Icon = config.icon
            const colorMap = {
              blue: 'bg-blue-100 text-blue-600',
              purple: 'bg-purple-100 text-purple-600',
              orange: 'bg-orange-100 text-orange-600',
              gray: 'bg-gray-100 text-gray-600'
            }
            const badgeMap = {
              blue: 'bg-blue-100 text-blue-700',
              purple: 'bg-purple-100 text-purple-700',
              orange: 'bg-orange-100 text-orange-700',
              gray: 'bg-gray-100 text-gray-700'
            }

            return (
              <Card key={service.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[config.color]}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{service.name}</h3>
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${badgeMap[config.color]}`}>
                          {config.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(service)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(service)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Tarifa:</span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(service.rate || 0)} <span className="text-gray-500 text-xs">({RATE_TYPES[service.rateType] || service.rateType})</span>
                      </span>
                    </div>
                    {service.capacity > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Capacidad:</span>
                        <span className="font-medium text-gray-900 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {service.capacity} personas
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Estado:</span>
                    <button
                      onClick={() => handleToggleStatus(service)}
                      className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                        service.status === 'active'
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      {service.status === 'active' ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <ConciergeBell className="w-5 h-5 text-amber-600" />
                {editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  placeholder="Ej: Piscina Principal"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  >
                    <option value="pool">Piscina</option>
                    <option value="games">Juegos</option>
                    <option value="events">Eventos</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tarifa</label>
                  <input
                    type="number"
                    value={formData.rate}
                    onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de tarifa</label>
                  <select
                    value={formData.rateType}
                    onChange={(e) => setFormData({ ...formData, rateType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  >
                    <option value="per_person">Por persona</option>
                    <option value="per_hour">Por hora</option>
                    <option value="fixed">Precio fijo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacidad (personas)</label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  placeholder="0"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  placeholder="Notas adicionales sobre el servicio..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : (editingService ? 'Guardar Cambios' : 'Crear Servicio')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default HotelServices
