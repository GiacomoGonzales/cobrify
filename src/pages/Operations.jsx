import { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  Handshake,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Save,
  Loader2,
  Home,
  User,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  Phone,
  Percent,
  TrendingUp,
  Key,
  Building2,
  UserCheck
} from 'lucide-react'

const OPERATION_TYPES = [
  { value: 'venta', label: 'Venta', color: 'cyan' },
  { value: 'alquiler', label: 'Alquiler', color: 'orange' },
]

const OPERATION_STATUS = [
  { value: 'en_proceso', label: 'En Proceso', color: 'yellow', icon: Clock },
  { value: 'cerrada', label: 'Cerrada', color: 'green', icon: CheckCircle },
  { value: 'cancelada', label: 'Cancelada', color: 'red', icon: XCircle },
]

export default function Operations() {
  const { getBusinessId } = useAppContext()
  const toast = useToast()

  const [operations, setOperations] = useState([])
  const [properties, setProperties] = useState([])
  const [customers, setCustomers] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [selectedOperation, setSelectedOperation] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    propertyId: '',
    customerId: '',
    agentId: '',
    type: 'venta',
    agreedPrice: '',
    commissionPercent: '',
    commissionAmount: '',
    agentCommissionPercent: '',
    agentCommission: '',
    status: 'en_proceso',
    startDate: '',
    endDate: '',
    notes: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const businessId = getBusinessId()

      // Load operations, properties and customers in parallel
      const [operationsSnap, propertiesSnap, customersSnap] = await Promise.all([
        getDocs(query(collection(db, `businesses/${businessId}/operations`), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, `businesses/${businessId}/properties`)),
        getDocs(collection(db, `businesses/${businessId}/customers`)),
      ])

      const operationsData = operationsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        startDate: doc.data().startDate?.toDate?.() || null,
        endDate: doc.data().endDate?.toDate?.() || null,
      }))

      const propertiesData = propertiesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      const customersData = customersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      setOperations(operationsData)
      setProperties(propertiesData)
      setCustomers(customersData)

      // Load agents separately to avoid blocking if collection doesn't exist
      try {
        const agentsSnap = await getDocs(collection(db, `businesses/${businessId}/agents`))
        const agentsData = agentsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setAgents(agentsData)
      } catch (agentError) {
        console.log('Agents collection not available yet:', agentError.message)
        setAgents([])
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setFormData({
      propertyId: '',
      customerId: '',
      agentId: '',
      type: 'venta',
      agreedPrice: '',
      commissionPercent: '5',
      commissionAmount: '',
      agentCommissionPercent: '',
      agentCommission: '',
      status: 'en_proceso',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      notes: '',
    })
    setModalMode('create')
    setSelectedOperation(null)
    setShowModal(true)
  }

  function openEditModal(operation) {
    setFormData({
      propertyId: operation.propertyId || '',
      customerId: operation.customerId || '',
      agentId: operation.agentId || '',
      type: operation.type || 'venta',
      agreedPrice: operation.agreedPrice || '',
      commissionPercent: operation.commissionPercent || '',
      commissionAmount: operation.commissionAmount || '',
      agentCommissionPercent: operation.agentCommissionPercent || '',
      agentCommission: operation.agentCommission || '',
      status: operation.status || 'en_proceso',
      startDate: operation.startDate ? operation.startDate.toISOString().split('T')[0] : '',
      endDate: operation.endDate ? operation.endDate.toISOString().split('T')[0] : '',
      notes: operation.notes || '',
    })
    setModalMode('edit')
    setSelectedOperation(operation)
    setShowModal(true)
  }

  // Calculate commissions when price or percent changes
  function recalculateCommissions(updates) {
    const newFormData = { ...formData, ...updates }
    const price = parseFloat(newFormData.agreedPrice) || 0
    const percent = parseFloat(newFormData.commissionPercent) || 0
    const agentPercent = parseFloat(newFormData.agentCommissionPercent) || 0

    newFormData.commissionAmount = ((price * percent) / 100).toFixed(2)
    newFormData.agentCommission = ((price * agentPercent) / 100).toFixed(2)

    setFormData(newFormData)
  }

  function handlePriceChange(value) {
    recalculateCommissions({ agreedPrice: value })
  }

  function handlePercentChange(value) {
    recalculateCommissions({ commissionPercent: value })
  }

  function handleAgentChange(agentId) {
    const agent = agents.find(a => a.id === agentId)
    const agentPercent = agent?.commissionPercent?.toString() || ''
    recalculateCommissions({ agentId, agentCommissionPercent: agentPercent })
  }

  function handleAgentPercentChange(value) {
    recalculateCommissions({ agentCommissionPercent: value })
  }

  async function handleSave() {
    if (!formData.propertyId) {
      toast.error('Selecciona una propiedad')
      return
    }

    setSaving(true)
    try {
      const businessId = getBusinessId()
      const property = properties.find(p => p.id === formData.propertyId)
      const customer = customers.find(c => c.id === formData.customerId)
      const agent = agents.find(a => a.id === formData.agentId)

      const operationData = {
        propertyId: formData.propertyId,
        propertyCode: property?.code || '',
        propertyTitle: property?.title || '',
        customerId: formData.customerId || null,
        customerName: customer?.name || customer?.displayName || '',
        customerPhone: customer?.phone || '',
        agentId: formData.agentId || null,
        agentName: agent?.name || '',
        agentCommissionPercent: parseFloat(formData.agentCommissionPercent) || 0,
        agentCommission: parseFloat(formData.agentCommission) || 0,
        type: formData.type,
        agreedPrice: parseFloat(formData.agreedPrice) || 0,
        commissionPercent: parseFloat(formData.commissionPercent) || 0,
        commissionAmount: parseFloat(formData.commissionAmount) || 0,
        status: formData.status,
        startDate: formData.startDate ? Timestamp.fromDate(new Date(formData.startDate)) : null,
        endDate: formData.endDate ? Timestamp.fromDate(new Date(formData.endDate)) : null,
        notes: formData.notes,
        updatedAt: Timestamp.now(),
      }

      if (modalMode === 'create') {
        operationData.createdAt = Timestamp.now()
        const docRef = doc(collection(db, `businesses/${businessId}/operations`))
        await setDoc(docRef, operationData)

        // Update property status if operation is closed
        if (formData.status === 'cerrada' && property) {
          const newStatus = formData.type === 'venta' ? 'vendido' : 'alquilado'
          await updateDoc(doc(db, `businesses/${businessId}/properties`, formData.propertyId), {
            status: newStatus,
            updatedAt: Timestamp.now()
          })
        }

        toast.success('Operación registrada correctamente')
      } else {
        await updateDoc(doc(db, `businesses/${businessId}/operations`, selectedOperation.id), operationData)

        // Update property status if operation is closed
        if (formData.status === 'cerrada' && property) {
          const newStatus = formData.type === 'venta' ? 'vendido' : 'alquilado'
          await updateDoc(doc(db, `businesses/${businessId}/properties`, formData.propertyId), {
            status: newStatus,
            updatedAt: Timestamp.now()
          })
        }

        toast.success('Operación actualizada correctamente')
      }

      setShowModal(false)
      loadData()
    } catch (error) {
      console.error('Error saving operation:', error)
      toast.error('Error al guardar la operación')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(operation) {
    if (!confirm('¿Estás seguro de eliminar esta operación?')) return

    try {
      const businessId = getBusinessId()
      await deleteDoc(doc(db, `businesses/${businessId}/operations`, operation.id))
      toast.success('Operación eliminada')
      loadData()
    } catch (error) {
      console.error('Error deleting operation:', error)
      toast.error('Error al eliminar la operación')
    }
  }

  // Filter operations
  const filteredOperations = useMemo(() => {
    return operations.filter(operation => {
      const matchesSearch = !searchTerm ||
        operation.propertyTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        operation.propertyCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        operation.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        operation.agentName?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesType = typeFilter === 'all' || operation.type === typeFilter
      const matchesStatus = statusFilter === 'all' || operation.status === statusFilter

      return matchesSearch && matchesType && matchesStatus
    })
  }, [operations, searchTerm, typeFilter, statusFilter])

  // Stats
  const stats = useMemo(() => {
    const cerradas = operations.filter(o => o.status === 'cerrada')
    const ventasCerradas = cerradas.filter(o => o.type === 'venta')
    const alquileresCerrados = cerradas.filter(o => o.type === 'alquiler')

    const totalComisiones = cerradas.reduce((sum, o) => sum + (o.commissionAmount || 0), 0)
    const comisionesVenta = ventasCerradas.reduce((sum, o) => sum + (o.commissionAmount || 0), 0)
    const comisionesAlquiler = alquileresCerrados.reduce((sum, o) => sum + (o.commissionAmount || 0), 0)

    return {
      total: operations.length,
      enProceso: operations.filter(o => o.status === 'en_proceso').length,
      cerradas: cerradas.length,
      totalComisiones,
      comisionesVenta,
      comisionesAlquiler,
    }
  }, [operations])

  function formatPrice(price) {
    if (!price) return '-'
    return `S/ ${price.toLocaleString('es-PE')}`
  }

  function formatDate(date) {
    if (!date) return '-'
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function getStatusBadge(status) {
    const statusConfig = OPERATION_STATUS.find(s => s.value === status) || OPERATION_STATUS[0]
    const colors = {
      yellow: 'bg-yellow-100 text-yellow-800',
      green: 'bg-green-100 text-green-800',
      red: 'bg-red-100 text-red-800',
    }
    const Icon = statusConfig.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[statusConfig.color]}`}>
        <Icon className="w-3 h-3" />
        {statusConfig.label}
      </span>
    )
  }

  function getTypeBadge(type) {
    const colors = {
      venta: 'bg-cyan-100 text-cyan-800',
      alquiler: 'bg-orange-100 text-orange-800',
    }
    const icons = {
      venta: Key,
      alquiler: Building2,
    }
    const labels = {
      venta: 'Venta',
      alquiler: 'Alquiler',
    }
    const Icon = icons[type] || Key
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[type] || colors.venta}`}>
        <Icon className="w-3 h-3" />
        {labels[type] || type}
      </span>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Operaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona ventas y alquileres de propiedades</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nueva Operación</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Handshake className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-yellow-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">{stats.enProceso}</p>
              <p className="text-xs text-gray-500">En Proceso</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.cerradas}</p>
              <p className="text-xs text-gray-500">Cerradas</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-cyan-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-cyan-600">{formatPrice(stats.totalComisiones)}</p>
              <p className="text-xs text-gray-500">Comisiones</p>
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
              placeholder="Buscar por propiedad o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
            >
              <option value="all">Tipo</option>
              {OPERATION_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
            >
              <option value="all">Estado</option>
              {OPERATION_STATUS.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Operations List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Cargando operaciones...</p>
          </div>
        ) : filteredOperations.length === 0 ? (
          <div className="p-8 text-center">
            <Handshake className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No se encontraron operaciones</p>
            <button
              onClick={openCreateModal}
              className="mt-4 text-cyan-600 hover:text-cyan-700 font-medium"
            >
              Registrar primera operación
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredOperations.map(operation => (
              <div
                key={operation.id}
                className="p-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {getTypeBadge(operation.type)}
                      {getStatusBadge(operation.status)}
                      <span className="text-xs text-gray-500">{formatDate(operation.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <Home className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{operation.propertyTitle}</span>
                      <span className="text-xs text-gray-500 font-mono">({operation.propertyCode})</span>
                    </div>

                    {operation.customerName && (
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                        <User className="w-4 h-4 text-gray-400" />
                        <span>{operation.customerName}</span>
                        {operation.customerPhone && (
                          <>
                            <Phone className="w-3 h-3 text-gray-400 ml-2" />
                            <span>{operation.customerPhone}</span>
                          </>
                        )}
                      </div>
                    )}

                    {operation.agentName && (
                      <div className="flex items-center gap-2 mt-1 text-sm text-cyan-600">
                        <UserCheck className="w-4 h-4" />
                        <span>Agente: {operation.agentName}</span>
                        {operation.agentCommission > 0 && (
                          <span className="text-xs bg-cyan-100 px-1.5 py-0.5 rounded">
                            {formatPrice(operation.agentCommission)} ({operation.agentCommissionPercent}%)
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="font-semibold text-gray-900">
                        Precio: {formatPrice(operation.agreedPrice)}
                      </span>
                      <span className="text-green-600 font-medium">
                        Comisión: {formatPrice(operation.commissionAmount)} ({operation.commissionPercent}%)
                      </span>
                    </div>

                    {operation.type === 'alquiler' && (operation.startDate || operation.endDate) && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {formatDate(operation.startDate)} - {formatDate(operation.endDate)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(operation)}
                      className="p-2 text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(operation)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 flex items-center justify-between z-10">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                {modalMode === 'create' ? 'Nueva Operación' : 'Editar Operación'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {/* Property Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Propiedad *</label>
                <select
                  value={formData.propertyId}
                  onChange={(e) => setFormData({...formData, propertyId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Seleccionar propiedad...</option>
                  {properties.filter(p => p.status === 'disponible' || p.id === formData.propertyId).map(property => (
                    <option key={property.id} value={property.id}>
                      {property.code} - {property.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select
                  value={formData.customerId}
                  onChange={(e) => setFormData({...formData, customerId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Seleccionar cliente...</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name || customer.displayName} {customer.phone ? `- ${customer.phone}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Agent Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4" />
                    Agente / Corredor
                  </span>
                </label>
                <select
                  value={formData.agentId}
                  onChange={(e) => handleAgentChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Sin agente asignado</option>
                  {agents.filter(a => a.isActive).map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.commissionPercent}%)
                    </option>
                  ))}
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Operación *</label>
                <div className="flex gap-3">
                  {OPERATION_TYPES.map(type => (
                    <label
                      key={type.value}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-lg cursor-pointer transition-colors ${
                        formData.type === type.value
                          ? type.value === 'venta'
                            ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                            : 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="type"
                        value={type.value}
                        checked={formData.type === type.value}
                        onChange={(e) => setFormData({...formData, type: e.target.value})}
                        className="sr-only"
                      />
                      {type.value === 'venta' ? <Key className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                      {type.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Price and Commission */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precio {formData.type === 'venta' ? 'Venta' : 'Mensual'} (S/)
                  </label>
                  <input
                    type="number"
                    value={formData.agreedPrice}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comisión (%)</label>
                  <input
                    type="number"
                    value={formData.commissionPercent}
                    onChange={(e) => handlePercentChange(e.target.value)}
                    placeholder="5"
                    step="0.1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Commission Amount Display */}
              {formData.commissionAmount > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-700">Comisión inmobiliaria:</span>
                    <span className="text-lg font-bold text-green-700">
                      S/ {parseFloat(formData.commissionAmount).toLocaleString('es-PE')}
                    </span>
                  </div>
                </div>
              )}

              {/* Agent Commission */}
              {formData.agentId && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-700 text-sm font-medium">
                    <UserCheck className="w-4 h-4" />
                    Comisión del Agente
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-cyan-600 mb-1">Porcentaje (%)</label>
                      <input
                        type="number"
                        value={formData.agentCommissionPercent}
                        onChange={(e) => handleAgentPercentChange(e.target.value)}
                        placeholder="3"
                        step="0.5"
                        className="w-full px-2 py-1.5 text-sm border border-cyan-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-cyan-600 mb-1">Monto (S/)</label>
                      <input
                        type="text"
                        value={formData.agentCommission ? `S/ ${parseFloat(formData.agentCommission).toLocaleString('es-PE')}` : 'S/ 0'}
                        disabled
                        className="w-full px-2 py-1.5 text-sm bg-white border border-cyan-300 rounded-lg font-semibold text-cyan-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Dates for Rental */}
              {formData.type === 'alquiler' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              )}

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  {OPERATION_STATUS.map(status => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
                {formData.status === 'cerrada' && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ Al cerrar, la propiedad se marcará como {formData.type === 'venta' ? 'vendida' : 'alquilada'}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={2}
                  placeholder="Observaciones adicionales..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                />
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
                      {modalMode === 'create' ? 'Registrar' : 'Guardar'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
