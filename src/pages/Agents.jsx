import { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  UserCheck,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Save,
  Loader2,
  Phone,
  Mail,
  MapPin,
  Percent,
  DollarSign,
  TrendingUp,
  Award,
  MoreVertical,
  Eye
} from 'lucide-react'

export default function Agents() {
  const { getBusinessId } = useAppContext()
  const toast = useToast()

  const [agents, setAgents] = useState([])
  const [operations, setOperations] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [saving, setSaving] = useState(false)

  // View details modal
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [detailsAgent, setDetailsAgent] = useState(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    documentType: 'dni',
    documentNumber: '',
    phone: '',
    email: '',
    address: '',
    commissionPercent: '3',
    isActive: true,
    notes: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const businessId = getBusinessId()

      const [agentsSnap, operationsSnap] = await Promise.all([
        getDocs(query(collection(db, `businesses/${businessId}/agents`), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, `businesses/${businessId}/operations`)),
      ])

      const agentsData = agentsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }))

      const operationsData = operationsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }))

      setAgents(agentsData)
      setOperations(operationsData)
    } catch (error) {
      console.error('Error loading agents:', error)
      toast.error('Error al cargar agentes')
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setFormData({
      name: '',
      documentType: 'dni',
      documentNumber: '',
      phone: '',
      email: '',
      address: '',
      commissionPercent: '3',
      isActive: true,
      notes: '',
    })
    setModalMode('create')
    setSelectedAgent(null)
    setShowModal(true)
  }

  function openEditModal(agent) {
    setFormData({
      name: agent.name || '',
      documentType: agent.documentType || 'dni',
      documentNumber: agent.documentNumber || '',
      phone: agent.phone || '',
      email: agent.email || '',
      address: agent.address || '',
      commissionPercent: agent.commissionPercent?.toString() || '3',
      isActive: agent.isActive !== false,
      notes: agent.notes || '',
    })
    setModalMode('edit')
    setSelectedAgent(agent)
    setShowModal(true)
  }

  function openDetailsModal(agent) {
    setDetailsAgent(agent)
    setShowDetailsModal(true)
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      toast.error('El nombre es requerido')
      return
    }

    setSaving(true)
    try {
      const businessId = getBusinessId()
      const agentData = {
        name: formData.name.trim(),
        documentType: formData.documentType,
        documentNumber: formData.documentNumber.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        address: formData.address.trim(),
        commissionPercent: parseFloat(formData.commissionPercent) || 3,
        isActive: formData.isActive,
        notes: formData.notes.trim(),
        updatedAt: Timestamp.now(),
      }

      if (modalMode === 'create') {
        agentData.createdAt = Timestamp.now()
        const docRef = doc(collection(db, `businesses/${businessId}/agents`))
        await setDoc(docRef, agentData)
        toast.success('Agente creado correctamente')
      } else {
        await updateDoc(doc(db, `businesses/${businessId}/agents`, selectedAgent.id), agentData)
        toast.success('Agente actualizado correctamente')
      }

      setShowModal(false)
      loadData()
    } catch (error) {
      console.error('Error saving agent:', error)
      toast.error('Error al guardar el agente')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(agent) {
    // Check if agent has operations
    const agentOperations = operations.filter(o => o.agentId === agent.id)
    if (agentOperations.length > 0) {
      toast.error(`No se puede eliminar. Este agente tiene ${agentOperations.length} operaciones asociadas.`)
      return
    }

    if (!confirm(`¿Estás seguro de eliminar a "${agent.name}"?`)) return

    try {
      const businessId = getBusinessId()
      await deleteDoc(doc(db, `businesses/${businessId}/agents`, agent.id))
      toast.success('Agente eliminado')
      loadData()
    } catch (error) {
      console.error('Error deleting agent:', error)
      toast.error('Error al eliminar el agente')
    }
  }

  // Calculate agent stats
  function getAgentStats(agentId) {
    const agentOps = operations.filter(o => o.agentId === agentId && o.status === 'cerrada')
    const totalComisiones = agentOps.reduce((sum, o) => sum + (o.agentCommission || 0), 0)
    const ventas = agentOps.filter(o => o.type === 'venta').length
    const alquileres = agentOps.filter(o => o.type === 'alquiler').length

    return {
      totalOperaciones: agentOps.length,
      ventas,
      alquileres,
      totalComisiones
    }
  }

  // Filter agents
  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const matchesSearch = !searchTerm ||
        agent.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agent.documentNumber?.includes(searchTerm) ||
        agent.phone?.includes(searchTerm) ||
        agent.email?.toLowerCase().includes(searchTerm.toLowerCase())

      return matchesSearch
    })
  }, [agents, searchTerm])

  // Global stats
  const stats = useMemo(() => {
    const closedOps = operations.filter(o => o.status === 'cerrada' && o.agentId)
    const totalComisiones = closedOps.reduce((sum, o) => sum + (o.agentCommission || 0), 0)

    return {
      totalAgentes: agents.length,
      agentesActivos: agents.filter(a => a.isActive).length,
      operacionesConAgente: closedOps.length,
      totalComisionesAgentes: totalComisiones,
    }
  }, [agents, operations])

  function formatPrice(price) {
    if (!price) return 'S/ 0'
    return `S/ ${price.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agentes / Corredores</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona tu equipo de ventas</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nuevo Agente</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalAgentes}</p>
              <p className="text-xs text-gray-500">Total Agentes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.agentesActivos}</p>
              <p className="text-xs text-gray-500">Activos</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{stats.operacionesConAgente}</p>
              <p className="text-xs text-gray-500">Operaciones</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-cyan-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-cyan-600">{formatPrice(stats.totalComisionesAgentes)}</p>
              <p className="text-xs text-gray-500">Comisiones</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, documento, teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Agents List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Cargando agentes...</p>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="p-8 text-center">
            <UserCheck className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No se encontraron agentes</p>
            <button
              onClick={openCreateModal}
              className="mt-4 text-cyan-600 hover:text-cyan-700 font-medium"
            >
              Agregar primer agente
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredAgents.map(agent => {
              const agentStats = getAgentStats(agent.id)
              return (
                <div
                  key={agent.id}
                  className="p-4 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                        agent.isActive ? 'bg-cyan-500' : 'bg-gray-400'
                      }`}>
                        {agent.name?.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                          {!agent.isActive && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                              Inactivo
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                          {agent.documentNumber && (
                            <span>{agent.documentType?.toUpperCase()}: {agent.documentNumber}</span>
                          )}
                          {agent.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {agent.phone}
                            </span>
                          )}
                          {agent.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {agent.email}
                            </span>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="text-gray-600">
                            <strong>{agentStats.totalOperaciones}</strong> operaciones
                          </span>
                          <span className="text-green-600 font-medium">
                            {formatPrice(agentStats.totalComisiones)} ganado
                          </span>
                          <span className="text-cyan-600">
                            {agent.commissionPercent}% comisión
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openDetailsModal(agent)}
                        className="p-2 text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"
                        title="Ver detalles"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(agent)}
                        className="p-2 text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(agent)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 flex items-center justify-between z-10">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                {modalMode === 'create' ? 'Nuevo Agente' : 'Editar Agente'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Juan Pérez García"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Document */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Doc.</label>
                  <select
                    value={formData.documentType}
                    onChange={(e) => setFormData({...formData, documentType: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="dni">DNI</option>
                    <option value="ruc">RUC</option>
                    <option value="ce">CE</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                  <input
                    type="text"
                    value={formData.documentNumber}
                    onChange={(e) => setFormData({...formData, documentNumber: e.target.value})}
                    placeholder="12345678"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="999 999 999"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="correo@ejemplo.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  placeholder="Av. Ejemplo 123, Distrito"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Commission */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comisión por defecto (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formData.commissionPercent}
                    onChange={(e) => setFormData({...formData, commissionPercent: e.target.value})}
                    placeholder="3"
                    step="0.5"
                    min="0"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                <p className="text-xs text-gray-500 mt-1">Este porcentaje se usará por defecto al asignar operaciones</p>
              </div>

              {/* Active */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                  className="w-4 h-4 text-cyan-600 border-gray-300 rounded focus:ring-cyan-500"
                />
                <span className="text-sm font-medium text-gray-700">Agente activo</span>
              </label>

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
                      {modalMode === 'create' ? 'Crear Agente' : 'Guardar'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Details */}
      {showDetailsModal && detailsAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 flex items-center justify-between z-10">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Detalles del Agente</h2>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl ${
                  detailsAgent.isActive ? 'bg-cyan-500' : 'bg-gray-400'
                }`}>
                  {detailsAgent.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{detailsAgent.name}</h3>
                  <p className="text-gray-500">
                    {detailsAgent.documentType?.toUpperCase()}: {detailsAgent.documentNumber}
                  </p>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-2">
                {detailsAgent.phone && (
                  <p className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 text-gray-400" />
                    {detailsAgent.phone}
                  </p>
                )}
                {detailsAgent.email && (
                  <p className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4 text-gray-400" />
                    {detailsAgent.email}
                  </p>
                )}
                {detailsAgent.address && (
                  <p className="flex items-center gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    {detailsAgent.address}
                  </p>
                )}
              </div>

              {/* Stats */}
              {(() => {
                const agentStats = getAgentStats(detailsAgent.id)
                return (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-gray-900">{agentStats.totalOperaciones}</p>
                      <p className="text-sm text-gray-500">Operaciones Cerradas</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">{formatPrice(agentStats.totalComisiones)}</p>
                      <p className="text-sm text-gray-500">Comisiones Ganadas</p>
                    </div>
                    <div className="bg-cyan-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-cyan-600">{agentStats.ventas}</p>
                      <p className="text-sm text-gray-500">Ventas</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-orange-600">{agentStats.alquileres}</p>
                      <p className="text-sm text-gray-500">Alquileres</p>
                    </div>
                  </div>
                )
              })()}

              {/* Commission Rate */}
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-cyan-700">Comisión por defecto:</span>
                  <span className="text-xl font-bold text-cyan-700">{detailsAgent.commissionPercent}%</span>
                </div>
              </div>

              {/* Notes */}
              {detailsAgent.notes && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Notas</h4>
                  <p className="text-gray-600 text-sm">{detailsAgent.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowDetailsModal(false)
                    openEditModal(detailsAgent)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
                >
                  <Edit2 className="w-5 h-5" />
                  Editar
                </button>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
