import { useState, useEffect } from 'react'
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PLANS, suspendUser, registerPayment } from '@/services/subscriptionService'
import { useAuth } from '@/contexts/AuthContext'
import {
  Clock,
  RefreshCw,
  Search,
  MessageCircle,
  Ban,
  CreditCard,
  CalendarDays,
  CheckCircle,
  XCircle,
  Loader2,
  Archive,
  ArchiveRestore
} from 'lucide-react'

// Normaliza un teléfono guardado en businesses/{uid}.phone a formato wa.me
// (solo dígitos, con código de país de Perú).
function buildPeruWhatsappNumber(rawPhone) {
  if (!rawPhone) return null
  let digits = String(rawPhone).replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2) // prefijo de salida internacional
  if (!digits) return null
  // Si ya incluye el código de país de Perú, usarlo tal cual
  if (digits.startsWith('51') && digits.length >= 11) return digits
  // Número local (móvil de 9 dígitos o fijo): anteponer 51
  return '51' + digits
}

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
  const { user } = useAuth()
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
    // Archivados: usuarios suspendidos que el admin marcó como "no contar".
    // Quedan fuera de las demás categorías y tienen su propia pestaña.
    if (sub.archived === true) return 'archived'
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
      if (activeTab === 'archived') return cat === 'archived'
      // Las otras tabs nunca muestran archivados
      if (cat === 'archived') return false
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

  async function handleArchive(sub) {
    if (!confirm(
      `¿Archivar a ${sub.businessName || sub.email}?\n\n` +
      'Quedará fuera de los reportes de vencimientos y de las estadísticas de ' +
      'renovación. Útil cuando ya no espera retomar el servicio.'
    )) return
    setActionLoading(sub.id)
    try {
      await updateDoc(doc(db, 'subscriptions', sub.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: user?.uid || null,
      })
      await loadSubscriptions()
    } catch (error) {
      console.error('Error archivando:', error)
      alert('Error al archivar')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleUnarchive(sub) {
    setActionLoading(sub.id)
    try {
      await updateDoc(doc(db, 'subscriptions', sub.id), {
        archived: false,
        archivedAt: null,
        archivedBy: null,
      })
      await loadSubscriptions()
    } catch (error) {
      console.error('Error desarchivando:', error)
      alert('Error al desarchivar')
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

  async function openWhatsApp(sub) {
    // Abrimos la pestaña dentro del gesto del clic para que el navegador no
    // bloquee el popup tras el await de Firestore; luego la redirigimos.
    const win = window.open('', '_blank')
    try {
      // El teléfono se guarda en businesses/{uid}; la suscripción usa el mismo
      // uid como id de documento, así que sub.id sirve para ubicar el negocio.
      const bizSnap = await getDoc(doc(db, 'businesses', sub.id))
      const phone = bizSnap.exists() ? bizSnap.data().phone : ''
      const number = buildPeruWhatsappNumber(phone)

      if (!number) {
        win?.close()
        alert('Este usuario no tiene un teléfono registrado.')
        return
      }

      const days = getDaysUntilExpiry(sub.currentPeriodEnd)
      const vencida = (days !== null && days < 0) || sub.accessBlocked || sub.status === 'suspended'
      const estado = vencida ? 'venció' : 'está por vencer'
      const detalle = sub.email ? ` (${sub.email})` : ''
      const message = encodeURIComponent(
        `Hola ${sub.businessName || ''}, te escribimos de Cobrify. Tu suscripción${detalle} ${estado}. ¿Deseas renovar?`
      )
      const url = `https://wa.me/${number}?text=${message}`

      if (win) win.location.href = url
      else window.open(url, '_blank')
    } catch (error) {
      console.error('Error al abrir WhatsApp:', error)
      win?.close()
      alert('No se pudo obtener el teléfono del usuario.')
    }
  }

  const counts = {
    today: subscriptions.filter(s => categorize(s) === 'today').length,
    week: subscriptions.filter(s => ['today', 'week'].includes(categorize(s))).length,
    month: subscriptions.filter(s => ['today', 'week', 'month'].includes(categorize(s))).length,
    overdue: subscriptions.filter(s => categorize(s) === 'overdue').length,
    archived: subscriptions.filter(s => categorize(s) === 'archived').length,
  }

  const tabs = [
    { id: 'today', label: 'Hoy', count: counts.today, icon: CalendarDays, color: 'text-red-600' },
    { id: 'week', label: 'Esta semana', count: counts.week, icon: Clock, color: 'text-amber-600' },
    { id: 'month', label: 'Este mes', count: counts.month, icon: CalendarDays, color: 'text-blue-600' },
    { id: 'overdue', label: 'Vencidos', count: counts.overdue, icon: XCircle, color: 'text-gray-600' },
    { id: 'archived', label: 'Archivados', count: counts.archived, icon: Archive, color: 'text-gray-500' },
  ]

  const filteredSubs = getFilteredSubs()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
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
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`bg-white rounded-xl p-4 shadow-sm border-2 transition-colors text-left ${
              activeTab === tab.id ? 'border-primary-500' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <tab.icon className={`w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0 ${tab.color}`} />
              <div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{tab.count}</p>
                <p className="text-xs sm:text-sm font-medium text-gray-500">{tab.label}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Negocio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimiento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Días</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSubs.map(sub => {
                  const days = getDaysUntilExpiry(sub.currentPeriodEnd)
                  const isOverdue = days !== null && days < 0
                  const isToday = days === 0
                  const isSuspended = sub.accessBlocked || sub.status === 'suspended'

                  return (
                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
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
                            isSuspended ? 'bg-gray-100 text-gray-700' :
                            isOverdue ? 'bg-red-100 text-red-700' :
                            isToday ? 'bg-red-100 text-red-700' :
                            days <= 3 ? 'bg-amber-100 text-amber-700' :
                            days <= 7 ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
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
                          ) : sub.archived ? (
                            <>
                              <button
                                onClick={() => handleUnarchive(sub)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Desarchivar"
                              >
                                <ArchiveRestore className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleQuickRenew(sub.id, sub.plan || 'qpse_1_month')}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Renovar (mismo plan)"
                              >
                                <CreditCard className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleQuickRenew(sub.id, sub.plan || 'qpse_1_month')}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Renovar (mismo plan)"
                              >
                                <CreditCard className="w-4 h-4" />
                              </button>
                              {!isSuspended && (isOverdue || isToday) && (
                                <button
                                  onClick={() => handleSuspend(sub.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Suspender"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => openWhatsApp(sub)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Contactar WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                              {/* Archivar: solo disponible para suspendidos/vencidos */}
                              {(isSuspended || isOverdue) && (
                                <button
                                  onClick={() => handleArchive(sub)}
                                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                  title="Archivar (no contar en estadísticas)"
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              )}
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
