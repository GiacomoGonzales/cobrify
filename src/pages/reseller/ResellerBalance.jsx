import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, orderBy, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Plus,
  Filter,
  Calendar,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Smartphone,
  Building2,
  Copy,
  X
} from 'lucide-react'

export default function ResellerBalance() {
  const { user, resellerData } = useAuth()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [showRechargeModal, setShowRechargeModal] = useState(false)
  const [filterType, setFilterType] = useState('all')

  // Obtener el ID del reseller
  const resellerId = resellerData?.docId || user?.uid

  useEffect(() => {
    if (user && resellerId) {
      loadTransactions()
    }
  }, [user, resellerId])

  async function loadTransactions() {
    setLoading(true)
    try {
      const transactionsQuery = query(
        collection(db, 'resellerTransactions'),
        where('resellerId', '==', resellerId),
        orderBy('createdAt', 'desc')
      )

      const snapshot = await getDocs(transactionsQuery)
      const txList = []
      snapshot.forEach(doc => {
        txList.push({
          id: doc.id,
          ...doc.data()
        })
      })
      setTransactions(txList)
    } catch (error) {
      console.error('Error loading transactions:', error)
      // Collection might not exist yet
      setTransactions([])
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
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function getTransactionIcon(type) {
    switch (type) {
      case 'deposit':
        return <ArrowDownRight className="w-5 h-5 text-green-600" />
      case 'client_creation':
        return <ArrowUpRight className="w-5 h-5 text-red-600" />
      case 'renewal':
        return <RefreshCw className="w-5 h-5 text-blue-600" />
      default:
        return <CreditCard className="w-5 h-5 text-gray-600" />
    }
  }

  function getTransactionColor(type) {
    switch (type) {
      case 'deposit':
        return 'bg-green-100'
      case 'client_creation':
        return 'bg-red-100'
      case 'renewal':
        return 'bg-blue-100'
      default:
        return 'bg-gray-100'
    }
  }

  const filteredTransactions = filterType === 'all'
    ? transactions
    : transactions.filter(tx => tx.type === filterType)

  const totalDeposits = transactions
    .filter(tx => tx.type === 'deposit')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

  const totalSpent = transactions
    .filter(tx => tx.type !== 'deposit')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Saldo</h1>
          <p className="text-gray-500">Gestiona tu saldo y revisa tus movimientos</p>
        </div>
        <button
          onClick={() => setShowRechargeModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Recargar Saldo
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current Balance */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/20 rounded-lg">
              <Wallet className="w-6 h-6" />
            </div>
            <span className="text-emerald-100">Saldo Disponible</span>
          </div>
          <p className="text-4xl font-bold">S/ {(resellerData?.balance || 0).toFixed(2)}</p>
        </div>

        {/* Total Deposited */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <ArrowDownRight className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-gray-500">Total Recargado</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">S/ {totalDeposits.toFixed(2)}</p>
        </div>

        {/* Total Spent */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-lg">
              <ArrowUpRight className="w-6 h-6 text-red-600" />
            </div>
            <span className="text-gray-500">Total Gastado</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">S/ {totalSpent.toFixed(2)}</p>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="font-semibold text-gray-900">Historial de Movimientos</h2>
          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Todos</option>
              <option value="deposit">Recargas</option>
              <option value="client_creation">Creación de clientes</option>
              <option value="renewal">Renovaciones</option>
            </select>
            <button
              onClick={loadTransactions}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Cargando movimientos...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No hay movimientos</p>
            <p className="text-gray-400 text-sm mt-1">Los movimientos aparecerán aquí</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredTransactions.map(tx => (
              <div key={tx.id} className="p-4 hover:bg-gray-50 flex items-center gap-4">
                <div className={`p-3 rounded-xl ${getTransactionColor(tx.type)}`}>
                  {getTransactionIcon(tx.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{tx.description}</p>
                  <p className="text-sm text-gray-500">{formatDate(tx.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-lg ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount >= 0 ? '+' : ''}S/ {Math.abs(tx.amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">
                    {tx.type === 'deposit' ? 'Recarga' :
                     tx.type === 'client_creation' ? 'Nuevo cliente' :
                     tx.type === 'renewal' ? 'Renovación' : tx.type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recharge Modal */}
      {showRechargeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Recargar Saldo</h2>
              <button
                onClick={() => setShowRechargeModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Instructions */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-sm text-emerald-800">
                  Para recargar tu saldo, realiza una transferencia o Yape a la cuenta indicada
                  y envía el comprobante por WhatsApp.
                </p>
              </div>

              {/* Payment Methods */}
              <div className="space-y-4">
                {/* Yape */}
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Smartphone className="w-5 h-5 text-purple-600" />
                    </div>
                    <span className="font-medium text-gray-900">Yape / Plin</span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                    <span className="font-mono text-lg">987 654 321</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('987654321')
                        alert('Número copiado')
                      }}
                      className="p-2 hover:bg-gray-200 rounded-lg"
                    >
                      <Copy className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* Bank Transfer */}
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="font-medium text-gray-900">Transferencia BCP</span>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">Cuenta Soles</p>
                        <span className="font-mono">191-12345678-0-12</span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText('19112345678012')
                          alert('Número copiado')
                        }}
                        className="p-2 hover:bg-gray-200 rounded-lg"
                      >
                        <Copy className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">CCI</p>
                        <span className="font-mono text-sm">002-191-12345678012-34</span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText('00219112345678012')
                          alert('CCI copiado')
                        }}
                        className="p-2 hover:bg-gray-200 rounded-lg"
                      >
                        <Copy className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* WhatsApp Button */}
              <a
                href="https://wa.me/51987654321?text=Hola,%20quiero%20recargar%20mi%20saldo%20de%20reseller"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Enviar comprobante por WhatsApp
              </a>

              <p className="text-xs text-gray-500 text-center">
                Tu saldo se actualizará en máximo 30 minutos después de verificar el pago.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
