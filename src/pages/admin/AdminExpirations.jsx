import { useState, useEffect } from 'react'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PLANS, suspendUser, registerPayment } from '@/services/subscriptionService'
import {
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  MessageCircle,
  Ban,
  CreditCard,
  CalendarDays,
  Users,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react'

const WHATSAPP_NUMBER = '51900434988'

function getDaysUntilExpiry(periodEnd) {
  if (!periodEnd) return null
  const now = new Date()
  const end = periodEnd?.toDate?.() || new Date(periodEnd)
  const diff = end.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDate(date) {
  if (!date) return 'N/A'
  const d = date?.toDate?.() || new Date(date)
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminExpirations() {
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('today')
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    loadSubscriptions()
  }, [])

  async function loadSubscriptions() {
    setLoading(true)
    try {
      const subsRef = collection(db, 'subscriptions')
      const q = query(subsRef, where('status', '==', 'active'), orderBy('currentPeriodEnd', 'asc'))
      const snapshot = await getDocs(q)

      // Also get expired/suspended ones
      const expiredQuery = query(subsRef, where('status', 'in', ['active', 'suspended']))
      const expiredSnapshot = await getDocs(expiredQuery)

      const allSubs = new Map()

      // Merge both queries
      expiredSnapshot.forEach(docSnap => {
        const data = docSnap.data()
        // Skip enterprise plans and sub-users
        if (data.plan === 'enterprise') return
        allSubs.set(docSnap.id, { id: docSnap.id, ...data })
      })

      snapshot.forEach(docSnap => {
        const data = docSnap.data()
        if (data.plan === 'enterprise') return
        allSubs.set(docSnap.id, { id: docSnap.id, ...data })
      })

      // Filter out sub-users by checking if they have an ownerId in users collection
      const usersQuery = query(collection(db, 'users'), where('ownerId', '!=', ''))
      const usersSnapshot = await getDocs(usersQuery)
      const subUserIds = new Set()
      usersSnapshot.forEach(doc => subUserIds.add(doc.id))

      const filtered = Array.from(allSubs.values()).filter(sub => !subUserIds.has(sub.id))

      setSubscriptions(filtered)
    } catch (error) {
      console.error('Error loading subscriptions:', error)
    } finally {
      setLoading(false)
    }
  }

  function categorize(sub) {
    const days = getDaysUntilExpiry(sub.currentPeriodEnd)
    if (days === null) return 'unknown'
    if (sub.accessBlocked || sub.status === 'suspended') return 'overdue'
    if (days < 0) return 'overdue'
    if (days === 0) return 'today'
    if (days <= 7) return 'week'
    if (days <= 30) return 'month'
    return 'safe'
  }

  function getFilteredSubs() {
    let filtered = subscriptions.filter(sub => {
      const cat = categorize(sub)
      if (activeTab === 'today') return cat === 'today'
      if (activeTab === 'week') return cat === 'week' || cat === 'today'
      if (activeTab === 'month') return cat === 'month' || cat === 'week' || cat === 'today'
      if (activeTab === 'overdue') return cat === 'overdue'
      return true
    })

    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(sub =>
        sub.email?.toLowerCase().includes(search) ||
        sub.businessName?.toLowerCase().includes(search)
      )
    }

    // Sort by days until expiry (most urgent first)
    filtered.sort((a, b) => {
      const daysA = getDaysUntilExpiry(a.currentPeriodEnd) ?? 999
      const daysB = getDaysUntilExpiry(b.currentPeriodEnd) ?? 999
      return daysA - daysB
    })

    return filtered
  }

  async function handleSuspend(userId) {
    if (!confirm('¿Suspender este usuario?')) return
    setActionLoading(userId)
    try {
      await suspendUser(userId, 'Suscripción vencida')
      await loadSubscriptions()
    } catch (error) {
      console.error('Error:', error)
      alert('Error al suspender')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleQuickRenew(userId, plan) {
    const planConfig = PLANS[plan]
    if (!planConfig) {
      alert('Plan no válido')
      return
    }
    if (!confirm(`¿Renovar con plan ${planConfig.name} (S/ ${planConfig.totalPrice})?`)) return
    setActionLoading(userId)
    try {
      await registerPayment(userId, planConfig.totalPrice, 'Admin - Renovación rápida', plan)
      await loadSubscriptions()
    } catch (error) {
      console.error('Error:', error)
      alert('Error al renovar')
    } finally {
      setActionLoading(null)
    }
  }

  function openWhatsApp(sub) {
    const message = encodeURIComponent(
      `Hola ${sub.businessName || ''}, te escribimos de Cobrify. Tu suscripción ${sub.email ? `(${sub.email})` : ''} está por vencer. ¿Deseas renovar?`
    )
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank')
  }

  const counts = {
    today: subscriptions.filter(s => categorize(s) === 'today').length,
    week: subscriptions.filter(s => ['today', 'week'].includes(categorize(s))).length,
    month: subscriptions.filter(s => ['today', 'week', 'month'].includes(categorize(s))).length,
    overdue: subscriptions.filter(s => categorize(s) === 'overdue').length,
  }

  const tabs = [
    { id: 'today', label: 'Hoy', count: counts.today, icon: CalendarDays, color: 'text-red-600 bg-red-100' },
    { id: 'week', label: 'Esta semana', count: counts.week, icon: Clock, color: 'text-amber-600 bg-amber-100' },
    { id: 'month', label: 'Este mes', count: counts.month, icon: CalendarDays, color: 'text-blue-600 bg-blue-100' },
    { id: 'overdue', label: 'Vencidos', count: counts.overdue, icon: XCircle, color: 'text-gray-600 bg-gray-100' },
  ]

  const filteredSubs = getFilteredSubs()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando vencimientos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vencimientos</h1>
          <p className="text-gray-500">Gestión de vencimientos y renovaciones</p>
        </div>
        <button
          onClick={loadSubscriptions}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="w-5 h-5" />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`bg-white rounded-xl p-4 border-2 transition-colors text-left ${
              activeTab === tab.id ? 'border-purple-500' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${tab.color}`}>
                <tab.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{tab.count}</p>
                <p className="text-xs text-gray-500">{tab.label}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredSubs.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No hay vencimientos en esta categoría</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Negocio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vencimiento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Días</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSubs.map(sub => {
                  const days = getDaysUntilExpiry(sub.currentPeriodEnd)
                  const isOverdue = days !== null && days < 0
                  const isToday = days === 0
                  const isSuspended = sub.accessBlocked || sub.status === 'suspended'

                  return (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{sub.businessName || 'Sin nombre'}</p>
                          <p className="text-sm text-gray-500">{sub.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {sub.planName || PLANS[sub.plan]?.name || sub.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(sub.currentPeriodEnd)}
                      </td>
                      <td className="px-4 py-3">
                        {days !== null && (
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            isSuspended ? 'bg-gray-100 text-gray-600' :
                            isOverdue ? 'bg-red-100 text-red-800' :
                            isToday ? 'bg-red-100 text-red-800' :
                            days <= 3 ? 'bg-orange-100 text-orange-800' :
                            days <= 7 ? 'bg-amber-100 text-amber-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {isSuspended ? 'Suspendido' :
                             isOverdue ? `${Math.abs(days)}d vencido` :
                             isToday ? 'Hoy' :
                             `${days}d`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {actionLoading === sub.id ? (
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          ) : (
                            <>
                              <button
                                onClick={() => handleQuickRenew(sub.id, sub.plan || 'qpse_1_month')}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                title="Renovar (mismo plan)"
                              >
                                <CreditCard className="w-4 h-4" />
                              </button>
                              {!isSuspended && (isOverdue || isToday) && (
                                <button
                                  onClick={() => handleSuspend(sub.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                  title="Suspender"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => openWhatsApp(sub)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                title="Contactar WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
