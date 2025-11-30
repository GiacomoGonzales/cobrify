import React, { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore'
import { PLANS } from '@/services/subscriptionService'
import {
  Users,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Eye,
  Ban,
  CheckCircle,
  Clock,
  AlertTriangle,
  Mail,
  Building2,
  Calendar,
  CreditCard,
  MoreVertical,
  X,
  Plus,
  Edit2,
  Trash2,
  UserPlus,
  Shield
} from 'lucide-react'

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-blue-100 text-blue-800',
  suspended: 'bg-red-100 text-red-800',
  expired: 'bg-yellow-100 text-yellow-800'
}

const STATUS_LABELS = {
  active: 'Activo',
  trial: 'Trial',
  suspended: 'Suspendido',
  expired: 'Vencido'
}

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [sortField, setSortField] = useState('createdAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [actionMenuUser, setActionMenuUser] = useState(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      // Obtener subscriptions, businesses y users en paralelo
      const [subscriptionsSnapshot, businessesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(collection(db, 'subscriptions')),
        getDocs(collection(db, 'businesses')),
        getDocs(collection(db, 'users'))
      ])

      // Crear mapa de businesses por ID para acceso rápido
      const businessesMap = {}
      businessesSnapshot.forEach(doc => {
        businessesMap[doc.id] = doc.data()
      })

      // Contar sub-usuarios por ownerId
      const subUsersCountMap = {}
      const subUsersByOwner = {}
      usersSnapshot.forEach(doc => {
        const data = doc.data()
        if (data.ownerId) {
          subUsersCountMap[data.ownerId] = (subUsersCountMap[data.ownerId] || 0) + 1
          if (!subUsersByOwner[data.ownerId]) {
            subUsersByOwner[data.ownerId] = []
          }
          subUsersByOwner[data.ownerId].push({
            id: doc.id,
            email: data.email,
            displayName: data.displayName,
            isActive: data.isActive,
            allowedPages: data.allowedPages || [],
            createdAt: data.createdAt?.toDate?.()
          })
        }
      })

      const usersData = []
      const now = new Date()

      subscriptionsSnapshot.forEach(doc => {
        const data = doc.data()

        // Excluir sub-usuarios (ya no deberían existir en subscriptions)
        if (data.ownerId) return

        // Obtener datos del negocio
        const business = businessesMap[doc.id] || {}

        const createdAt = data.createdAt?.toDate?.() || data.startDate?.toDate?.()
        const periodEnd = data.currentPeriodEnd?.toDate?.()

        // Determinar estado real
        let status = 'active'
        if (data.status === 'suspended' || data.accessBlocked) {
          status = 'suspended'
        } else if (data.plan === 'trial' || data.plan === 'free') {
          status = 'trial'
        } else if (periodEnd && periodEnd < now) {
          status = 'expired'
        }

        usersData.push({
          id: doc.id,
          email: data.email || 'N/A',
          businessName: business.razonSocial || business.businessName || data.businessName || 'Sin nombre',
          ruc: business.ruc || data.ruc || null,
          phone: business.phone || null,
          address: business.address || null,
          emissionMethod: business.emissionMethod || 'none',
          businessMode: business.businessMode || 'retail',
          plan: data.plan || 'unknown',
          status,
          createdAt,
          periodEnd,
          usage: data.usage?.invoicesThisMonth || 0,
          limit: PLANS[data.plan]?.invoiceLimit || 0,
          accessBlocked: data.accessBlocked || false,
          lastPayment: data.paymentHistory?.slice(-1)[0]?.date?.toDate?.() || null,
          subUsersCount: subUsersCountMap[doc.id] || 0,
          subUsers: subUsersByOwner[doc.id] || []
        })
      })

      setUsers(usersData)
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filtrar y ordenar usuarios
  const filteredUsers = useMemo(() => {
    let result = [...users]

    // Filtro de búsqueda
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      result = result.filter(u =>
        u.email?.toLowerCase().includes(search) ||
        u.businessName?.toLowerCase().includes(search) ||
        u.ruc?.includes(search)
      )
    }

    // Filtro de estado
    if (statusFilter !== 'all') {
      result = result.filter(u => u.status === statusFilter)
    }

    // Filtro de plan
    if (planFilter !== 'all') {
      result = result.filter(u => u.plan === planFilter)
    }

    // Ordenar
    result.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (aVal instanceof Date) aVal = aVal.getTime()
      if (bVal instanceof Date) bVal = bVal.getTime()

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [users, searchTerm, statusFilter, planFilter, sortField, sortDirection])

  // Estadísticas rápidas
  const stats = useMemo(() => {
    return {
      total: users.length,
      active: users.filter(u => u.status === 'active').length,
      trial: users.filter(u => u.status === 'trial').length,
      suspended: users.filter(u => u.status === 'suspended').length,
      expired: users.filter(u => u.status === 'expired').length
    }
  }, [users])

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  async function toggleUserAccess(userId, block) {
    try {
      await updateDoc(doc(db, 'subscriptions', userId), {
        accessBlocked: block,
        status: block ? 'suspended' : 'active'
      })
      loadUsers()
      setActionMenuUser(null)
    } catch (error) {
      console.error('Error updating user:', error)
    }
  }

  function exportToCSV() {
    const headers = ['Email', 'Negocio', 'RUC', 'Plan', 'Estado', 'Creado', 'Uso', 'Límite']
    const rows = filteredUsers.map(u => [
      u.email,
      u.businessName,
      u.ruc,
      PLANS[u.plan]?.name || u.plan,
      STATUS_LABELS[u.status],
      u.createdAt?.toLocaleDateString() || 'N/A',
      u.usage,
      u.limit || 'Ilimitado'
    ])

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usuarios_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  function formatDate(date) {
    if (!date) return 'N/A'
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ?
      <ChevronUp className="w-4 h-4" /> :
      <ChevronDown className="w-4 h-4" />
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <Users className="w-8 h-8 text-gray-400" />
            <span className="text-2xl font-bold text-gray-900">{stats.total}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Total</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200">
          <div className="flex items-center justify-between">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <span className="text-2xl font-bold text-green-600">{stats.active}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Activos</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-200">
          <div className="flex items-center justify-between">
            <Clock className="w-8 h-8 text-blue-500" />
            <span className="text-2xl font-bold text-blue-600">{stats.trial}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Trial</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-yellow-200">
          <div className="flex items-center justify-between">
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
            <span className="text-2xl font-bold text-yellow-600">{stats.expired}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Vencidos</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-red-200">
          <div className="flex items-center justify-between">
            <Ban className="w-8 h-8 text-red-500" />
            <span className="text-2xl font-bold text-red-600">{stats.suspended}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Suspendidos</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por email, negocio o RUC..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="trial">Trial</option>
              <option value="expired">Vencidos</option>
              <option value="suspended">Suspendidos</option>
            </select>

            <select
              value={planFilter}
              onChange={e => setPlanFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todos los planes</option>
              {Object.entries(PLANS).map(([key, plan]) => (
                <option key={key} value={key}>{plan.name}</option>
              ))}
            </select>

            <button
              onClick={loadUsers}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Recargar"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Exportar</span>
            </button>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-3 text-sm text-gray-500">
          Mostrando {filteredUsers.length} de {users.length} usuarios
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('businessName')}
                >
                  <div className="flex items-center gap-1">
                    Negocio <SortIcon field="businessName" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center gap-1">
                    Email <SortIcon field="email" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('plan')}
                >
                  <div className="flex items-center gap-1">
                    Plan <SortIcon field="plan" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Estado <SortIcon field="status" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('usage')}
                >
                  <div className="flex items-center gap-1">
                    Uso <SortIcon field="usage" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center gap-1">
                    Creado <SortIcon field="createdAt" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                    <p className="text-gray-500">Cargando usuarios...</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No se encontraron usuarios</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedUser(user)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.businessName}</p>
                          {user.ruc && <p className="text-xs text-gray-500">RUC: {user.ruc}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        {PLANS[user.plan]?.name || user.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[user.status]}`}>
                        {STATUS_LABELS[user.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden w-20">
                          <div
                            className={`h-full rounded-full ${
                              user.limit && user.usage / user.limit > 0.9
                                ? 'bg-red-500'
                                : user.limit && user.usage / user.limit > 0.7
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: user.limit ? `${Math.min((user.usage / user.limit) * 100, 100)}%` : '10%' }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {user.usage}/{user.limit || '∞'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setActionMenuUser(actionMenuUser === user.id ? null : user.id)
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <MoreVertical className="w-5 h-5 text-gray-400" />
                        </button>

                        {actionMenuUser === user.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setSelectedUser(user)
                                setActionMenuUser(null)
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Eye className="w-4 h-4" /> Ver detalles
                            </button>
                            {user.status !== 'suspended' ? (
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  toggleUserAccess(user.id, true)
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                              >
                                <Ban className="w-4 h-4" /> Suspender
                              </button>
                            ) : (
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  toggleUserAccess(user.id, false)
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2"
                              >
                                <CheckCircle className="w-4 h-4" /> Reactivar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Detalles del Usuario</h2>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">{selectedUser.businessName}</h3>
                  <p className="text-gray-500">{selectedUser.email}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedUser.status]}`}>
                      {STATUS_LABELS[selectedUser.status]}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      {PLANS[selectedUser.plan]?.name || selectedUser.plan}
                    </span>
                  </div>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-sm">RUC</span>
                  </div>
                  <p className="font-medium">{selectedUser.ruc || 'Sin configurar'}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">Fecha de registro</span>
                  </div>
                  <p className="font-medium">{formatDate(selectedUser.createdAt)}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Building2 className="w-4 h-4" />
                    <span className="text-sm">Tipo de negocio</span>
                  </div>
                  <p className="font-medium capitalize">{selectedUser.businessMode === 'restaurant' ? 'Restaurante' : 'Retail/Comercio'}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Shield className="w-4 h-4" />
                    <span className="text-sm">Emisión electrónica</span>
                  </div>
                  <p className="font-medium">
                    {selectedUser.emissionMethod === 'qpse' ? 'QPse' :
                     selectedUser.emissionMethod === 'sunat_direct' ? 'SUNAT Directo' :
                     selectedUser.emissionMethod === 'nubefact' ? 'NubeFact' : 'Sin configurar'}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Vencimiento</span>
                  </div>
                  <p className="font-medium">{formatDate(selectedUser.periodEnd)}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">Sub-usuarios</span>
                  </div>
                  <p className="font-medium">{selectedUser.subUsersCount}</p>
                </div>
              </div>

              {/* Usage */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Uso este mes</span>
                  <span className="font-medium">
                    {selectedUser.usage} / {selectedUser.limit || '∞'} documentos
                  </span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      selectedUser.limit && selectedUser.usage / selectedUser.limit > 0.9
                        ? 'bg-red-500'
                        : selectedUser.limit && selectedUser.usage / selectedUser.limit > 0.7
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: selectedUser.limit ? `${Math.min((selectedUser.usage / selectedUser.limit) * 100, 100)}%` : '5%' }}
                  />
                </div>
              </div>

              {/* Sub-usuarios */}
              {selectedUser.subUsers && selectedUser.subUsers.length > 0 && (
                <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                  <div className="flex items-center gap-2 text-indigo-700 mb-3">
                    <Users className="w-5 h-5" />
                    <span className="font-medium">Sub-usuarios ({selectedUser.subUsers.length})</span>
                  </div>
                  <div className="space-y-2">
                    {selectedUser.subUsers.map((subUser, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3">
                        <div>
                          <p className="font-medium text-gray-900">{subUser.displayName || subUser.email}</p>
                          <p className="text-xs text-gray-500">{subUser.email}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          subUser.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {subUser.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                {selectedUser.status !== 'suspended' ? (
                  <button
                    onClick={() => {
                      toggleUserAccess(selectedUser.id, true)
                      setSelectedUser(null)
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                  >
                    <Ban className="w-5 h-5" />
                    Suspender cuenta
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      toggleUserAccess(selectedUser.id, false)
                      setSelectedUser(null)
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Reactivar cuenta
                  </button>
                )}

                <button
                  onClick={() => {
                    window.open(`mailto:${selectedUser.email}`, '_blank')
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200"
                >
                  <Mail className="w-5 h-5" />
                  Enviar email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {actionMenuUser && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setActionMenuUser(null)}
        />
      )}
    </div>
  )
}
