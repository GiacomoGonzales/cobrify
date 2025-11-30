import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PLANS } from '@/services/subscriptionService'
import {
  Users,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Eye,
  RotateCcw,
  Ban,
  CheckCircle,
  Clock,
  AlertTriangle,
  Building2,
  Mail,
  Calendar,
  X,
  CreditCard
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800',
  expiring: 'bg-amber-100 text-amber-800'
}

export default function ResellerClients() {
  const { user, resellerData } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState([])
  const [filteredClients, setFilteredClients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedClient, setSelectedClient] = useState(null)

  // Obtener el ID del reseller
  const resellerId = resellerData?.docId || user?.uid

  useEffect(() => {
    if (user && resellerId) {
      loadClients()
    }
  }, [user, resellerId])

  useEffect(() => {
    filterClients()
  }, [clients, searchTerm, statusFilter])

  async function loadClients() {
    setLoading(true)
    try {
      const clientsQuery = query(
        collection(db, 'subscriptions'),
        where('resellerId', '==', resellerId)
      )
      const snapshot = await getDocs(clientsQuery)

      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      const clientsList = []
      snapshot.forEach(docSnap => {
        const data = docSnap.data()
        const periodEnd = data.currentPeriodEnd?.toDate?.()

        let status = 'active'
        if (data.accessBlocked || data.status === 'suspended') {
          status = 'suspended'
        } else if (periodEnd && periodEnd < now) {
          status = 'expired'
        } else if (periodEnd && periodEnd <= sevenDaysFromNow) {
          status = 'expiring'
        }

        clientsList.push({
          id: docSnap.id,
          ...data,
          periodEnd,
          displayStatus: status,
          createdAt: data.createdAt?.toDate?.()
        })
      })

      // Sort by creation date
      clientsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

      setClients(clientsList)
    } catch (error) {
      console.error('Error loading clients:', error)
    } finally {
      setLoading(false)
    }
  }

  function filterClients() {
    let result = [...clients]

    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      result = result.filter(c =>
        c.email?.toLowerCase().includes(search) ||
        c.businessName?.toLowerCase().includes(search) ||
        c.ruc?.includes(search)
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter(c => c.displayStatus === statusFilter)
    }

    setFilteredClients(result)
  }

  function formatDate(date) {
    if (!date) return 'N/A'
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  function getStatusLabel(status) {
    const labels = {
      active: 'Activo',
      expired: 'Vencido',
      suspended: 'Suspendido',
      expiring: 'Por vencer'
    }
    return labels[status] || status
  }

  async function toggleClientAccess(clientId, block) {
    try {
      await updateDoc(doc(db, 'subscriptions', clientId), {
        accessBlocked: block,
        status: block ? 'suspended' : 'active'
      })
      loadClients()
      setSelectedClient(null)
    } catch (error) {
      console.error('Error updating client:', error)
      alert('Error al actualizar el cliente')
    }
  }

  const stats = {
    total: clients.length,
    active: clients.filter(c => c.displayStatus === 'active').length,
    expiring: clients.filter(c => c.displayStatus === 'expiring').length,
    expired: clients.filter(c => c.displayStatus === 'expired').length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando clientes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Clientes</h1>
          <p className="text-gray-500">Gestiona los clientes de tu red</p>
        </div>
        <button
          onClick={() => navigate('/reseller/clients/new')}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Crear Cliente
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
              <p className="text-xs text-gray-500">Activos</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.expiring}</p>
              <p className="text-xs text-gray-500">Por vencer</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.expired}</p>
              <p className="text-xs text-gray-500">Vencidos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, email o RUC..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="expiring">Por vencer</option>
            <option value="expired">Vencidos</option>
            <option value="suspended">Suspendidos</option>
          </select>
          <button
            onClick={loadClients}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-5 h-5" />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Clients List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredClients.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No se encontraron clientes</p>
            {clients.length === 0 && (
              <button
                onClick={() => navigate('/reseller/clients/new')}
                className="mt-4 text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Crear tu primer cliente
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vencimiento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uso</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredClients.map(client => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{client.businessName || 'Sin nombre'}</p>
                          <p className="text-sm text-gray-500">{client.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">
                        {PLANS[client.plan]?.name || client.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[client.displayStatus]}`}>
                        {getStatusLabel(client.displayStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(client.periodEnd)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{
                              width: `${Math.min(
                                ((client.usage?.invoicesThisMonth || 0) /
                                  (PLANS[client.plan]?.limits?.maxInvoicesPerMonth || 500)) * 100,
                                100
                              )}%`
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {client.usage?.invoicesThisMonth || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedClient(client)}
                        className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Client Detail Modal */}
      {selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Detalles del Cliente</h2>
              <button
                onClick={() => setSelectedClient(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Client Info */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedClient.businessName || 'Sin nombre'}</h3>
                  <p className="text-gray-500">{selectedClient.email}</p>
                  <span className={`inline-flex mt-2 px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[selectedClient.displayStatus]}`}>
                    {getStatusLabel(selectedClient.displayStatus)}
                  </span>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-xs">Plan</span>
                  </div>
                  <p className="font-medium">{PLANS[selectedClient.plan]?.name || selectedClient.plan}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">Vencimiento</span>
                  </div>
                  <p className="font-medium">{formatDate(selectedClient.periodEnd)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Mail className="w-4 h-4" />
                    <span className="text-xs">Creado</span>
                  </div>
                  <p className="font-medium">{formatDate(selectedClient.createdAt)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Users className="w-4 h-4" />
                    <span className="text-xs">Uso este mes</span>
                  </div>
                  <p className="font-medium">{selectedClient.usage?.invoicesThisMonth || 0} docs</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {selectedClient.displayStatus === 'expired' || selectedClient.displayStatus === 'expiring' ? (
                  <button
                    onClick={() => {
                      // TODO: Implement renewal
                      alert('Función de renovación próximamente')
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Renovar
                  </button>
                ) : null}

                {selectedClient.displayStatus !== 'suspended' ? (
                  <button
                    onClick={() => toggleClientAccess(selectedClient.id, true)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                  >
                    <Ban className="w-5 h-5" />
                    Suspender
                  </button>
                ) : (
                  <button
                    onClick={() => toggleClientAccess(selectedClient.id, false)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Reactivar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
