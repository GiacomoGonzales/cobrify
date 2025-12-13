import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getResellerTierInfo, getAllPrices } from '@/services/resellerTierService'
import {
  Users,
  UserCheck,
  UserX,
  Wallet,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Plus,
  AlertTriangle,
  Award,
  ChevronRight
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function ResellerDashboard() {
  const { user, resellerData } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    expiredClients: 0,
    expiringClients: 0
  })
  const [tierInfo, setTierInfo] = useState(null)
  const [recentTransactions, setRecentTransactions] = useState([])
  const [recentClients, setRecentClients] = useState([])

  // Obtener el ID del reseller (puede ser el docId si es diferente al uid)
  const resellerId = resellerData?.docId || user?.uid

  useEffect(() => {
    if (user && resellerId) {
      loadDashboardData()
    }
  }, [user, resellerId])

  async function loadDashboardData() {
    setLoading(true)
    try {
      // Cargar clientes del reseller
      const clientsQuery = query(
        collection(db, 'subscriptions'),
        where('resellerId', '==', resellerId)
      )
      const clientsSnapshot = await getDocs(clientsQuery)

      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      let active = 0
      let expired = 0
      let expiring = 0
      const clients = []

      clientsSnapshot.forEach(doc => {
        const data = doc.data()
        const periodEnd = data.currentPeriodEnd?.toDate?.()

        clients.push({
          id: doc.id,
          ...data,
          periodEnd
        })

        if (data.status === 'active' && !data.accessBlocked) {
          active++
          if (periodEnd && periodEnd <= sevenDaysFromNow && periodEnd > now) {
            expiring++
          }
        } else {
          expired++
        }
      })

      // Ordenar por fecha de creación y tomar los últimos 5
      clients.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA
      })

      setStats({
        totalClients: clients.length,
        activeClients: active,
        expiredClients: expired,
        expiringClients: expiring
      })

      setRecentClients(clients.slice(0, 5))

      // Cargar información del tier
      try {
        const tier = await getResellerTierInfo(resellerId, resellerData?.discountOverride)
        setTierInfo(tier)
      } catch (e) {
        console.error('Error loading tier info:', e)
      }

      // Cargar transacciones recientes
      const transactionsQuery = query(
        collection(db, 'resellerTransactions'),
        where('resellerId', '==', resellerId),
        orderBy('createdAt', 'desc'),
        limit(5)
      )

      try {
        const transactionsSnapshot = await getDocs(transactionsQuery)
        const transactions = []
        transactionsSnapshot.forEach(doc => {
          transactions.push({
            id: doc.id,
            ...doc.data()
          })
        })
        setRecentTransactions(transactions)
      } catch (e) {
        // Collection might not exist yet
        setRecentTransactions([])
      }

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(date) {
    if (!date) return 'N/A'
    const d = date instanceof Date ? date : date.toDate?.()
    if (!d) return 'N/A'
    return d.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Bienvenido, {resellerData?.companyName || 'Reseller'}</p>
        </div>
        <button
          onClick={() => navigate('/reseller/clients/new')}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Crear Cliente
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Saldo */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <Wallet className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Disponible</span>
          </div>
          <p className="text-3xl font-bold">S/ {(resellerData?.balance || 0).toFixed(2)}</p>
          <p className="text-emerald-100 text-sm mt-1">Saldo actual</p>
        </div>

        {/* Total Clientes */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.totalClients}</p>
          <p className="text-gray-500 text-sm mt-1">Total clientes</p>
        </div>

        {/* Clientes Activos */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <UserCheck className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.activeClients}</p>
          <p className="text-gray-500 text-sm mt-1">Clientes activos</p>
        </div>

        {/* Por vencer */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            {stats.expiringClients > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                Atención
              </span>
            )}
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.expiringClients}</p>
          <p className="text-gray-500 text-sm mt-1">Por vencer (7 días)</p>
        </div>
      </div>

      {/* Tier Progress Card */}
      {tierInfo && (
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-5 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Current Tier */}
            <div className="flex items-center gap-4">
              <div className="text-4xl">{tierInfo.currentTier.icon}</div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold">Nivel {tierInfo.currentTier.name}</h3>
                  {tierInfo.hasOverride && (
                    <span className="text-xs bg-purple-500 px-2 py-0.5 rounded-full">VIP</span>
                  )}
                </div>
                <p className="text-slate-300">
                  {tierInfo.effectiveDiscount}% de descuento en todos los planes
                </p>
              </div>
            </div>

            {/* Progress to Next Tier */}
            {tierInfo.progress ? (
              <div className="flex-1 max-w-md">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-300">
                    {tierInfo.activeClients} clientes activos
                  </span>
                  <span className="text-slate-300 flex items-center gap-1">
                    {tierInfo.nextTier.icon} {tierInfo.progress.remaining} más para {tierInfo.nextTier.name}
                  </span>
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${tierInfo.progress.percentage}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400">
                <Award className="w-5 h-5" />
                <span className="font-medium">¡Nivel máximo alcanzado!</span>
              </div>
            )}

            {/* Prices Preview */}
            <div className="flex items-center gap-3 bg-white/10 rounded-lg px-4 py-2">
              <div className="text-center">
                <p className="text-xs text-slate-400">1 Mes</p>
                <p className="font-bold">S/ {Math.round(20 * (1 - tierInfo.effectiveDiscount / 100))}</p>
              </div>
              <div className="text-center border-l border-white/20 pl-3">
                <p className="text-xs text-slate-400">6 Meses</p>
                <p className="font-bold">S/ {Math.round(100 * (1 - tierInfo.effectiveDiscount / 100))}</p>
              </div>
              <div className="text-center border-l border-white/20 pl-3">
                <p className="text-xs text-slate-400">12 Meses</p>
                <p className="font-bold">S/ {Math.round(150 * (1 - tierInfo.effectiveDiscount / 100))}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert if clients expiring */}
      {stats.expiringClients > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">
              Tienes {stats.expiringClients} cliente(s) por vencer en los próximos 7 días
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Revisa la lista de clientes para renovar sus suscripciones.
            </p>
            <button
              onClick={() => navigate('/reseller/clients')}
              className="mt-2 text-sm font-medium text-amber-800 hover:text-amber-900 underline"
            >
              Ver clientes
            </button>
          </div>
        </div>
      )}

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Clients */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Clientes Recientes</h2>
            <button
              onClick={() => navigate('/reseller/clients')}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Ver todos
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {recentClients.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No tienes clientes aún</p>
                <button
                  onClick={() => navigate('/reseller/clients/new')}
                  className="mt-3 text-emerald-600 hover:text-emerald-700 font-medium text-sm"
                >
                  Crear primer cliente
                </button>
              </div>
            ) : (
              recentClients.map(client => (
                <div key={client.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{client.businessName || 'Sin nombre'}</p>
                      <p className="text-sm text-gray-500">{client.email}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      client.status === 'active' && !client.accessBlocked
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {client.status === 'active' && !client.accessBlocked ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Movimientos Recientes</h2>
            <button
              onClick={() => navigate('/reseller/balance')}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Ver todos
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {recentTransactions.length === 0 ? (
              <div className="p-8 text-center">
                <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No hay movimientos aún</p>
              </div>
            ) : (
              recentTransactions.map(tx => (
                <div key={tx.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        tx.type === 'deposit' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {tx.type === 'deposit' ? (
                          <ArrowDownRight className="w-4 h-4 text-green-600" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{tx.description}</p>
                        <p className="text-xs text-gray-500">{formatDate(tx.createdAt)}</p>
                      </div>
                    </div>
                    <span className={`font-bold ${
                      tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {tx.type === 'deposit' ? '+' : '-'}S/ {Math.abs(tx.amount).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-200">
        <h3 className="font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => navigate('/reseller/clients/new')}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:shadow-md transition-all border border-gray-200"
          >
            <Plus className="w-6 h-6 text-emerald-600" />
            <span className="text-sm font-medium text-gray-700">Crear Cliente</span>
          </button>
          <button
            onClick={() => navigate('/reseller/clients')}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:shadow-md transition-all border border-gray-200"
          >
            <Users className="w-6 h-6 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">Ver Clientes</span>
          </button>
          <button
            onClick={() => navigate('/reseller/balance')}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:shadow-md transition-all border border-gray-200"
          >
            <Wallet className="w-6 h-6 text-amber-600" />
            <span className="text-sm font-medium text-gray-700">Recargar Saldo</span>
          </button>
          <button
            onClick={() => navigate('/reseller/settings')}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:shadow-md transition-all border border-gray-200"
          >
            <TrendingUp className="w-6 h-6 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Mi Cuenta</span>
          </button>
        </div>
      </div>
    </div>
  )
}
