import { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  Home,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Eye,
  X,
  Save,
  Loader2,
  MapPin,
  Bed,
  Bath,
  Car,
  Maximize2,
  Building2,
  DollarSign,
  Tag,
  Phone,
  User,
  ChevronDown,
  Image as ImageIcon,
  MoreVertical,
  CheckCircle,
  Clock,
  XCircle,
  Key
} from 'lucide-react'

const PROPERTY_TYPES = [
  { value: 'casa', label: 'Casa' },
  { value: 'departamento', label: 'Departamento' },
  { value: 'terreno', label: 'Terreno' },
  { value: 'local_comercial', label: 'Local Comercial' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'cochera', label: 'Cochera' },
]

const OPERATION_TYPES = [
  { value: 'venta', label: 'Venta' },
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'ambos', label: 'Venta/Alquiler' },
]

const PROPERTY_STATUS = [
  { value: 'disponible', label: 'Disponible', color: 'green' },
  { value: 'reservado', label: 'Reservado', color: 'yellow' },
  { value: 'vendido', label: 'Vendido', color: 'blue' },
  { value: 'alquilado', label: 'Alquilado', color: 'purple' },
]

const FEATURES = [
  'Piscina', 'Jardín', 'Terraza', 'Balcón', 'Ascensor', 'Gimnasio',
  'Seguridad 24h', 'Área de juegos', 'Parrilla', 'Cuarto de servicio',
  'Lavandería', 'Depósito', 'Vista al mar', 'Vista a parque'
]

export default function Properties() {
  const { getBusinessId } = useAppContext()
  const toast = useToast()

  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [operationFilter, setOperationFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('create') // 'create', 'edit', 'view'
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    type: 'casa',
    operation: 'venta',
    title: '',
    description: '',
    district: '',
    address: '',
    reference: '',
    area: '',
    bedrooms: '',
    bathrooms: '',
    parkings: '',
    salePrice: '',
    rentPrice: '',
    status: 'disponible',
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    features: [],
    images: [],
  })

  useEffect(() => {
    loadProperties()
  }, [])

  async function loadProperties() {
    setLoading(true)
    try {
      const businessId = getBusinessId()
      const propertiesRef = collection(db, `businesses/${businessId}/properties`)
      const q = query(propertiesRef, orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)

      const propertiesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }))

      setProperties(propertiesData)
    } catch (error) {
      console.error('Error loading properties:', error)
      toast.error('Error al cargar propiedades')
    } finally {
      setLoading(false)
    }
  }

  // Generate property code
  function generateCode() {
    const prefix = formData.type === 'casa' ? 'CAS' :
                   formData.type === 'departamento' ? 'DEP' :
                   formData.type === 'terreno' ? 'TER' :
                   formData.type === 'local_comercial' ? 'LOC' :
                   formData.type === 'oficina' ? 'OFI' : 'COC'
    const number = String(properties.length + 1).padStart(3, '0')
    return `${prefix}-${number}`
  }

  function openCreateModal() {
    setFormData({
      code: '',
      type: 'casa',
      operation: 'venta',
      title: '',
      description: '',
      district: '',
      address: '',
      reference: '',
      area: '',
      bedrooms: '',
      bathrooms: '',
      parkings: '',
      salePrice: '',
      rentPrice: '',
      status: 'disponible',
      ownerName: '',
      ownerPhone: '',
      ownerEmail: '',
      features: [],
      images: [],
    })
    setModalMode('create')
    setSelectedProperty(null)
    setShowModal(true)
  }

  function openEditModal(property) {
    setFormData({
      code: property.code || '',
      type: property.type || 'casa',
      operation: property.operation || 'venta',
      title: property.title || '',
      description: property.description || '',
      district: property.district || '',
      address: property.address || '',
      reference: property.reference || '',
      area: property.area || '',
      bedrooms: property.bedrooms || '',
      bathrooms: property.bathrooms || '',
      parkings: property.parkings || '',
      salePrice: property.salePrice || '',
      rentPrice: property.rentPrice || '',
      status: property.status || 'disponible',
      ownerName: property.ownerName || '',
      ownerPhone: property.ownerPhone || '',
      ownerEmail: property.ownerEmail || '',
      features: property.features || [],
      images: property.images || [],
    })
    setModalMode('edit')
    setSelectedProperty(property)
    setShowModal(true)
  }

  function openViewModal(property) {
    setSelectedProperty(property)
    setModalMode('view')
    setShowModal(true)
  }

  async function handleSave() {
    if (!formData.title.trim()) {
      toast.error('El título es requerido')
      return
    }
    if (!formData.district.trim()) {
      toast.error('El distrito es requerido')
      return
    }

    setSaving(true)
    try {
      const businessId = getBusinessId()
      const propertyData = {
        ...formData,
        code: formData.code || generateCode(),
        area: parseFloat(formData.area) || 0,
        bedrooms: parseInt(formData.bedrooms) || 0,
        bathrooms: parseInt(formData.bathrooms) || 0,
        parkings: parseInt(formData.parkings) || 0,
        salePrice: parseFloat(formData.salePrice) || 0,
        rentPrice: parseFloat(formData.rentPrice) || 0,
        updatedAt: Timestamp.now(),
      }

      if (modalMode === 'create') {
        propertyData.createdAt = Timestamp.now()
        const docRef = doc(collection(db, `businesses/${businessId}/properties`))
        await setDoc(docRef, propertyData)
        toast.success('Propiedad creada correctamente')
      } else {
        await updateDoc(doc(db, `businesses/${businessId}/properties`, selectedProperty.id), propertyData)
        toast.success('Propiedad actualizada correctamente')
      }

      setShowModal(false)
      loadProperties()
    } catch (error) {
      console.error('Error saving property:', error)
      toast.error('Error al guardar la propiedad')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(property) {
    if (!confirm(`¿Estás seguro de eliminar "${property.title}"?`)) return

    try {
      const businessId = getBusinessId()
      await deleteDoc(doc(db, `businesses/${businessId}/properties`, property.id))
      toast.success('Propiedad eliminada')
      loadProperties()
    } catch (error) {
      console.error('Error deleting property:', error)
      toast.error('Error al eliminar la propiedad')
    }
  }

  function toggleFeature(feature) {
    setFormData(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature]
    }))
  }

  // Filter properties
  const filteredProperties = useMemo(() => {
    return properties.filter(property => {
      const matchesSearch = !searchTerm ||
        property.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        property.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        property.district?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        property.address?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesType = typeFilter === 'all' || property.type === typeFilter
      const matchesOperation = operationFilter === 'all' || property.operation === operationFilter
      const matchesStatus = statusFilter === 'all' || property.status === statusFilter

      return matchesSearch && matchesType && matchesOperation && matchesStatus
    })
  }, [properties, searchTerm, typeFilter, operationFilter, statusFilter])

  // Stats
  const stats = useMemo(() => ({
    total: properties.length,
    disponibles: properties.filter(p => p.status === 'disponible').length,
    vendidos: properties.filter(p => p.status === 'vendido').length,
    alquilados: properties.filter(p => p.status === 'alquilado').length,
  }), [properties])

  function formatPrice(price) {
    if (!price) return '-'
    return `S/ ${price.toLocaleString('es-PE')}`
  }

  function getStatusBadge(status) {
    const statusConfig = PROPERTY_STATUS.find(s => s.value === status) || PROPERTY_STATUS[0]
    const colors = {
      green: 'bg-green-100 text-green-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      blue: 'bg-blue-100 text-blue-800',
      purple: 'bg-purple-100 text-purple-800',
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[statusConfig.color]}`}>
        {statusConfig.label}
      </span>
    )
  }

  function getOperationBadge(operation) {
    const colors = {
      venta: 'bg-cyan-100 text-cyan-800',
      alquiler: 'bg-orange-100 text-orange-800',
      ambos: 'bg-indigo-100 text-indigo-800',
    }
    const labels = {
      venta: 'Venta',
      alquiler: 'Alquiler',
      ambos: 'Venta/Alquiler',
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[operation] || colors.venta}`}>
        {labels[operation] || operation}
      </span>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Propiedades</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona tu cartera de inmuebles</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nueva Propiedad</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Home className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.disponibles}</p>
              <p className="text-xs text-gray-500">Disponibles</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Key className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{stats.vendidos}</p>
              <p className="text-xs text-gray-500">Vendidos</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">{stats.alquilados}</p>
              <p className="text-xs text-gray-500">Alquilados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título, código, distrito..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
            >
              <option value="all">Tipo</option>
              {PROPERTY_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <select
              value={operationFilter}
              onChange={(e) => setOperationFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
            >
              <option value="all">Operación</option>
              {OPERATION_TYPES.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
            >
              <option value="all">Estado</option>
              {PROPERTY_STATUS.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Properties List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Cargando propiedades...</p>
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="p-8 text-center">
            <Home className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No se encontraron propiedades</p>
            <button
              onClick={openCreateModal}
              className="mt-4 text-cyan-600 hover:text-cyan-700 font-medium"
            >
              Agregar primera propiedad
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredProperties.map(property => (
              <div
                key={property.id}
                className="p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => openViewModal(property)}
              >
                <div className="flex items-start gap-4">
                  {/* Image placeholder */}
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    {property.images?.length > 0 ? (
                      <img src={property.images[0]} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <Home className="w-8 h-8 text-gray-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-500 font-mono">{property.code}</span>
                          {getOperationBadge(property.operation)}
                          {getStatusBadge(property.status)}
                        </div>
                        <h3 className="font-semibold text-gray-900 mt-1 truncate">{property.title}</h3>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                          <MapPin className="w-4 h-4" />
                          {property.district}{property.address ? `, ${property.address}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openEditModal(property)}
                          className="p-2 text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(property)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                      {property.area > 0 && (
                        <span className="flex items-center gap-1">
                          <Maximize2 className="w-4 h-4" />
                          {property.area} m²
                        </span>
                      )}
                      {property.bedrooms > 0 && (
                        <span className="flex items-center gap-1">
                          <Bed className="w-4 h-4" />
                          {property.bedrooms}
                        </span>
                      )}
                      {property.bathrooms > 0 && (
                        <span className="flex items-center gap-1">
                          <Bath className="w-4 h-4" />
                          {property.bathrooms}
                        </span>
                      )}
                      {property.parkings > 0 && (
                        <span className="flex items-center gap-1">
                          <Car className="w-4 h-4" />
                          {property.parkings}
                        </span>
                      )}
                    </div>

                    {/* Price */}
                    <div className="flex items-center gap-4 mt-2">
                      {(property.operation === 'venta' || property.operation === 'ambos') && property.salePrice > 0 && (
                        <span className="font-semibold text-cyan-600">
                          Venta: {formatPrice(property.salePrice)}
                        </span>
                      )}
                      {(property.operation === 'alquiler' || property.operation === 'ambos') && property.rentPrice > 0 && (
                        <span className="font-semibold text-orange-600">
                          Alquiler: {formatPrice(property.rentPrice)}/mes
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Create/Edit/View */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 flex items-center justify-between z-10">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                {modalMode === 'create' ? 'Nueva Propiedad' :
                 modalMode === 'edit' ? 'Editar Propiedad' : 'Detalle de Propiedad'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalMode === 'view' ? (
              /* View Mode */
              <div className="p-4 sm:p-6 space-y-6">
                {/* Header */}
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-cyan-100 rounded-xl flex items-center justify-center">
                    <Home className="w-8 h-8 text-cyan-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-500 font-mono">{selectedProperty.code}</span>
                      {getOperationBadge(selectedProperty.operation)}
                      {getStatusBadge(selectedProperty.status)}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mt-1">{selectedProperty.title}</h3>
                    <p className="text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-4 h-4" />
                      {selectedProperty.district}{selectedProperty.address ? `, ${selectedProperty.address}` : ''}
                    </p>
                  </div>
                </div>

                {/* Prices */}
                <div className="grid grid-cols-2 gap-4">
                  {(selectedProperty.operation === 'venta' || selectedProperty.operation === 'ambos') && (
                    <div className="bg-cyan-50 rounded-lg p-4">
                      <p className="text-sm text-cyan-700">Precio Venta</p>
                      <p className="text-2xl font-bold text-cyan-700">{formatPrice(selectedProperty.salePrice)}</p>
                    </div>
                  )}
                  {(selectedProperty.operation === 'alquiler' || selectedProperty.operation === 'ambos') && (
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-sm text-orange-700">Precio Alquiler</p>
                      <p className="text-2xl font-bold text-orange-700">{formatPrice(selectedProperty.rentPrice)}/mes</p>
                    </div>
                  )}
                </div>

                {/* Characteristics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Maximize2 className="w-5 h-5 text-gray-500 mx-auto mb-1" />
                    <p className="text-lg font-semibold">{selectedProperty.area || 0} m²</p>
                    <p className="text-xs text-gray-500">Área</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Bed className="w-5 h-5 text-gray-500 mx-auto mb-1" />
                    <p className="text-lg font-semibold">{selectedProperty.bedrooms || 0}</p>
                    <p className="text-xs text-gray-500">Dormitorios</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Bath className="w-5 h-5 text-gray-500 mx-auto mb-1" />
                    <p className="text-lg font-semibold">{selectedProperty.bathrooms || 0}</p>
                    <p className="text-xs text-gray-500">Baños</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Car className="w-5 h-5 text-gray-500 mx-auto mb-1" />
                    <p className="text-lg font-semibold">{selectedProperty.parkings || 0}</p>
                    <p className="text-xs text-gray-500">Estac.</p>
                  </div>
                </div>

                {/* Description */}
                {selectedProperty.description && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Descripción</h4>
                    <p className="text-gray-600 text-sm">{selectedProperty.description}</p>
                  </div>
                )}

                {/* Features */}
                {selectedProperty.features?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Características</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedProperty.features.map(feature => (
                        <span key={feature} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Owner */}
                {selectedProperty.ownerName && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">Propietario</h4>
                    <div className="space-y-1 text-sm">
                      <p className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        {selectedProperty.ownerName}
                      </p>
                      {selectedProperty.ownerPhone && (
                        <p className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          {selectedProperty.ownerPhone}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => openEditModal(selectedProperty)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
                  >
                    <Edit2 className="w-5 h-5" />
                    Editar
                  </button>
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              /* Create/Edit Mode */
              <div className="p-4 sm:p-6 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Inmueble *</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    >
                      {PROPERTY_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Operación *</label>
                    <select
                      value={formData.operation}
                      onChange={(e) => setFormData({...formData, operation: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    >
                      {OPERATION_TYPES.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="Ej: Casa de 3 pisos en Miraflores"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows={3}
                    placeholder="Describe las características principales del inmueble..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Distrito *</label>
                    <input
                      type="text"
                      value={formData.district}
                      onChange={(e) => setFormData({...formData, district: e.target.value})}
                      placeholder="Ej: Miraflores"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      placeholder="Calle, número..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                {/* Characteristics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Área (m²)</label>
                    <input
                      type="number"
                      value={formData.area}
                      onChange={(e) => setFormData({...formData, area: e.target.value})}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dormitorios</label>
                    <input
                      type="number"
                      value={formData.bedrooms}
                      onChange={(e) => setFormData({...formData, bedrooms: e.target.value})}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Baños</label>
                    <input
                      type="number"
                      value={formData.bathrooms}
                      onChange={(e) => setFormData({...formData, bathrooms: e.target.value})}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estac.</label>
                    <input
                      type="number"
                      value={formData.parkings}
                      onChange={(e) => setFormData({...formData, parkings: e.target.value})}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                {/* Prices */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(formData.operation === 'venta' || formData.operation === 'ambos') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Precio Venta (S/)</label>
                      <input
                        type="number"
                        value={formData.salePrice}
                        onChange={(e) => setFormData({...formData, salePrice: e.target.value})}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  )}
                  {(formData.operation === 'alquiler' || formData.operation === 'ambos') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Precio Alquiler Mensual (S/)</label>
                      <input
                        type="number"
                        value={formData.rentPrice}
                        onChange={(e) => setFormData({...formData, rentPrice: e.target.value})}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  >
                    {PROPERTY_STATUS.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>

                {/* Features */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Características</label>
                  <div className="flex flex-wrap gap-2">
                    {FEATURES.map(feature => (
                      <button
                        key={feature}
                        type="button"
                        onClick={() => toggleFeature(feature)}
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          formData.features.includes(feature)
                            ? 'bg-cyan-100 text-cyan-700 border-2 border-cyan-500'
                            : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'
                        }`}
                      >
                        {feature}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Owner Info */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Datos del Propietario</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                      <input
                        type="text"
                        value={formData.ownerName}
                        onChange={(e) => setFormData({...formData, ownerName: e.target.value})}
                        placeholder="Nombre del propietario"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                      <input
                        type="tel"
                        value={formData.ownerPhone}
                        onChange={(e) => setFormData({...formData, ownerPhone: e.target.value})}
                        placeholder="999 999 999"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        {modalMode === 'create' ? 'Crear Propiedad' : 'Guardar Cambios'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
