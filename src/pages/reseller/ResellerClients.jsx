import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, doc, updateDoc, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PLANS } from '@/services/subscriptionService'
import { getResellerTierInfo, calculatePrice, BASE_PRICES } from '@/services/resellerTierService'
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
  CreditCard,
  Wallet,
  Loader2
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Meses por plan
const PLAN_MONTHS = {
  qpse_1_month: 1,
  qpse_6_months: 6,
  qpse_12_months: 12,
  sunat_direct_1_month: 1,
  sunat_direct_6_months: 6,
  sunat_direct_12_months: 12,
}

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800',
  expiring: 'bg-amber-100 text-amber-800'
}

export default function ResellerClients() {
  const { user, resellerData, refreshResellerData } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState([])
  const [filteredClients, setFilteredClients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedClient, setSelectedClient] = useState(null)

  // Estados para renovación
  const [showRenewalModal, setShowRenewalModal] = useState(false)
  const [renewalClient, setRenewalClient] = useState(null)
  const [renewalPlan, setRenewalPlan] = useState('qpse_1_month')
  const [renewalLoading, setRenewalLoading] = useState(false)
  const [tierInfo, setTierInfo] = useState(null)

  // Obtener el ID del reseller
  const resellerId = resellerData?.docId || user?.uid
  const currentBalance = resellerData?.balance || 0
  const effectiveDiscount = tierInfo?.effectiveDiscount || 20

  useEffect(() => {
    if (user && resellerId) {
      loadClients()
      loadTierInfo()
    }
  }, [user, resellerId])

  async function loadTierInfo() {
    try {
      const info = await getResellerTierInfo(resellerId, resellerData?.discountOverride)
      setTierInfo(info)
    } catch (e) {
      console.error('Error loading tier info:', e)
    }
  }

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

  // Abrir modal de renovación
  function openRenewalModal(client) {
    setRenewalClient(client)
    setRenewalPlan(client.plan || 'qpse_1_month')
    setShowRenewalModal(true)
    setSelectedClient(null)
  }

  // Procesar renovación
  async function handleRenewal() {
    if (!renewalClient || !renewalPlan) return

    const planPrice = calculatePrice(renewalPlan, effectiveDiscount)
    const planMonths = PLAN_MONTHS[renewalPlan]

    if (!planMonths) {
      alert('Plan no válido')
      return
    }

    if (currentBalance < planPrice) {
      alert(`Saldo insuficiente. Necesitas S/ ${planPrice} pero tienes S/ ${currentBalance.toFixed(2)}`)
      return
    }

    setRenewalLoading(true)

    try {
      // Calcular nueva fecha de vencimiento
      const now = new Date()
      const currentEnd = renewalClient.periodEnd
      // Si ya venció, empezar desde hoy; si no, extender desde la fecha actual
      const startFrom = currentEnd && currentEnd > now ? currentEnd : now
      const newPeriodEnd = new Date(startFrom)
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + planMonths)

      // 1. Actualizar suscripción del cliente
      // QPse = 200 docs/mes, SUNAT Directo = ilimitado
      const isSunatDirect = renewalPlan.startsWith('sunat_direct')
      await updateDoc(doc(db, 'subscriptions', renewalClient.id), {
        plan: renewalPlan,
        currentPeriodEnd: Timestamp.fromDate(newPeriodEnd),
        status: 'active',
        accessBlocked: false,
        'limits.maxInvoicesPerMonth': isSunatDirect ? -1 : 200,
        updatedAt: Timestamp.now(),
        lastRenewalAt: Timestamp.now(),
        lastRenewalBy: resellerId
      })

      // 2. Deducir saldo del reseller
      const newBalance = currentBalance - planPrice
      await updateDoc(doc(db, 'resellers', resellerId), {
        balance: newBalance,
        updatedAt: Timestamp.now()
      })

      // 3. Registrar transacción
      await addDoc(collection(db, 'resellerTransactions'), {
        resellerId: resellerId,
        type: 'renewal',
        amount: -planPrice,
        description: `Renovación ${PLANS[renewalPlan]?.name || renewalPlan} - ${renewalClient.businessName || renewalClient.email}`,
        clientId: renewalClient.id,
        clientEmail: renewalClient.email,
        plan: renewalPlan,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        createdAt: Timestamp.now()
      })

      // 4. Refrescar datos
      await refreshResellerData()
      await loadClients()

      setShowRenewalModal(false)
      setRenewalClient(null)
      alert('¡Renovación exitosa!')
    } catch (error) {
      console.error('Error en renovación:', error)
      alert('Error al procesar la renovación: ' + error.message)
    } finally {
      setRenewalLoading(false)
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
                    onClick={() => openRenewalModal(selectedClient)}
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

      {/* Modal de Renovación */}
      {showRenewalModal && renewalClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Renovar Suscripción</h2>
              <button
                onClick={() => {
                  setShowRenewalModal(false)
                  setRenewalClient(null)
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
                disabled={renewalLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Info del cliente */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{renewalClient.businessName || 'Sin nombre'}</p>
                    <p className="text-sm text-gray-500">{renewalClient.email}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
                  <p className="text-gray-600">
                    <span className="font-medium">Plan actual:</span> {PLANS[renewalClient.plan]?.name || renewalClient.plan}
                  </p>
                  <p className="text-gray-600">
                    <span className="font-medium">Vence:</span> {formatDate(renewalClient.periodEnd)}
                  </p>
                </div>
              </div>

              {/* Saldo disponible */}
              <div className="flex items-center gap-3 bg-emerald-50 rounded-lg p-4">
                <Wallet className="w-6 h-6 text-emerald-600" />
                <div>
                  <p className="text-sm text-emerald-700">Tu saldo disponible</p>
                  <p className="text-xl font-bold text-emerald-700">S/ {currentBalance.toFixed(2)}</p>
                </div>
              </div>

              {/* Selección de plan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selecciona el plan de renovación
                </label>
                <select
                  value={renewalPlan}
                  onChange={e => setRenewalPlan(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  disabled={renewalLoading}
                >
                  <optgroup label="Planes QPse">
                    <option value="qpse_1_month">QPse 1 Mes - S/ {calculatePrice('qpse_1_month', effectiveDiscount)}</option>
                    <option value="qpse_6_months">QPse 6 Meses - S/ {calculatePrice('qpse_6_months', effectiveDiscount)}</option>
                    <option value="qpse_12_months">QPse 12 Meses - S/ {calculatePrice('qpse_12_months', effectiveDiscount)}</option>
                  </optgroup>
                  <optgroup label="Planes SUNAT Directo">
                    <option value="sunat_direct_1_month">SUNAT Directo 1 Mes - S/ {calculatePrice('sunat_direct_1_month', effectiveDiscount)}</option>
                    <option value="sunat_direct_6_months">SUNAT Directo 6 Meses - S/ {calculatePrice('sunat_direct_6_months', effectiveDiscount)}</option>
                    <option value="sunat_direct_12_months">SUNAT Directo 12 Meses - S/ {calculatePrice('sunat_direct_12_months', effectiveDiscount)}</option>
                  </optgroup>
                </select>
              </div>

              {/* Resumen del costo */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Precio reseller ({effectiveDiscount}% desc.):</span>
                  <span className="text-xl font-bold text-gray-900">
                    S/ {calculatePrice(renewalPlan, effectiveDiscount)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm text-gray-500 mt-1">
                  <span>Precio normal:</span>
                  <span className="line-through">S/ {BASE_PRICES[renewalPlan]}</span>
                </div>
                {currentBalance < calculatePrice(renewalPlan, effectiveDiscount) && (
                  <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-600 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Saldo insuficiente
                  </div>
                )}
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowRenewalModal(false)
                    setRenewalClient(null)
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  disabled={renewalLoading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRenewal}
                  disabled={renewalLoading || currentBalance < calculatePrice(renewalPlan, effectiveDiscount)}
                  className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {renewalLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Confirmar Renovación
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
