import React, { useState, useEffect } from 'react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  where
} from 'firebase/firestore'
import { getTiersConfig, calculateTier } from '@/services/resellerTierService'
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Edit2,
  Trash2,
  X,
  Building2,
  Mail,
  Phone,
  Wallet,
  Percent,
  CheckCircle,
  XCircle,
  Save,
  Loader2,
  UserPlus,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  UserCheck,
  Award,
  Crown,
  Globe,
  Link2,
  ExternalLink
} from 'lucide-react'

// URL de las Cloud Functions (Cloud Run)
const FUNCTIONS_BASE_URL = 'https://us-central1-cobrify-395fe.cloudfunctions.net'
// URLs específicas de Cloud Run (2nd Gen)
const GET_USER_URL = 'https://getuserbyemail-tb5ph5ddsq-uc.a.run.app'
const CREATE_RESELLER_URL = 'https://createreseller-tb5ph5ddsq-uc.a.run.app'

export default function AdminResellers() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [resellers, setResellers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [selectedReseller, setSelectedReseller] = useState(null)
  const [saving, setSaving] = useState(false)

  // Estados para buscar usuario por email
  const [searchingUser, setSearchingUser] = useState(false)
  const [foundUser, setFoundUser] = useState(null)
  const [userSearchError, setUserSearchError] = useState('')

  const [formData, setFormData] = useState({
    email: '',
    companyName: '',
    ruc: '',
    phone: '',
    contactName: '',
    discountOverride: '',  // Vacío = usar tier automático
    balance: 0,
    isActive: true,
    customDomain: ''  // Solo admin puede configurar esto
  })

  const [depositAmount, setDepositAmount] = useState('')
  const [depositNote, setDepositNote] = useState('')

  useEffect(() => {
    loadResellers()
  }, [])

  async function loadResellers() {
    setLoading(true)
    try {
      const [resellersSnapshot, tiers] = await Promise.all([
        getDocs(collection(db, 'resellers')),
        getTiersConfig()
      ])
      const resellersList = []

      for (const docSnap of resellersSnapshot.docs) {
        const data = docSnap.data()

        // Contar clientes activos del reseller
        const clientsQuery = query(
          collection(db, 'subscriptions'),
          where('resellerId', '==', docSnap.id)
        )
        const activeClientsQuery = query(
          collection(db, 'subscriptions'),
          where('resellerId', '==', docSnap.id),
          where('status', '==', 'active')
        )
        const [clientsSnapshot, activeClientsSnapshot] = await Promise.all([
          getDocs(clientsQuery),
          getDocs(activeClientsQuery)
        ])

        // Calcular tier basado en clientes activos
        const activeCount = activeClientsSnapshot.size
        const currentTier = calculateTier(activeCount, tiers)
        const effectiveDiscount = data.discountOverride !== undefined && data.discountOverride !== null
          ? data.discountOverride
          : currentTier.discount

        resellersList.push({
          id: docSnap.id,
          ...data,
          clientsCount: clientsSnapshot.size,
          activeClientsCount: activeCount,
          currentTier,
          effectiveDiscount,
          hasOverride: data.discountOverride !== undefined && data.discountOverride !== null,
          customDomain: data.customDomain || ''
        })
      }

      setResellers(resellersList)
    } catch (error) {
      console.error('Error loading resellers:', error)
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setSelectedReseller(null)
    setFoundUser(null)
    setUserSearchError('')
    setFormData({
      email: '',
      companyName: '',
      ruc: '',
      phone: '',
      contactName: '',
      discountOverride: '',
      balance: 0,
      isActive: true,
      customDomain: ''
    })
    setShowModal(true)
  }

  // Buscar usuario existente por email
  async function searchUserByEmail() {
    if (!formData.email || !formData.email.includes('@')) {
      setUserSearchError('Ingresa un email válido')
      return
    }

    setSearchingUser(true)
    setUserSearchError('')
    setFoundUser(null)

    try {
      const response = await fetch(GET_USER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          adminUid: user?.uid
        })
      })

      const data = await response.json()

      if (data.success) {
        if (data.isAlreadyReseller) {
          setUserSearchError('Este usuario ya es reseller')
          return
        }

        setFoundUser(data)
        // Auto-llenar datos si tiene suscripción
        if (data.subscription?.businessName) {
          setFormData(prev => ({
            ...prev,
            companyName: data.subscription.businessName
          }))
        }
      } else {
        setUserSearchError(data.error || 'Usuario no encontrado')
      }
    } catch (error) {
      console.error('Error searching user:', error)
      setUserSearchError('Error al buscar usuario')
    } finally {
      setSearchingUser(false)
    }
  }

  function openEditModal(reseller) {
    setSelectedReseller(reseller)
    setFormData({
      email: reseller.email || '',
      companyName: reseller.companyName || '',
      ruc: reseller.ruc || '',
      phone: reseller.phone || '',
      contactName: reseller.contactName || '',
      discountOverride: reseller.discountOverride !== undefined && reseller.discountOverride !== null
        ? reseller.discountOverride.toString()
        : '',
      balance: reseller.balance || 0,
      isActive: reseller.isActive !== false,
      customDomain: reseller.customDomain || ''
    })
    setShowModal(true)
  }

  function openDepositModal(reseller) {
    setSelectedReseller(reseller)
    setDepositAmount('')
    setDepositNote('')
    setShowDepositModal(true)
  }

  async function saveReseller() {
    if (!formData.companyName) {
      alert('El nombre de empresa es requerido')
      return
    }

    // Para crear nuevo, necesitamos haber encontrado el usuario
    if (!selectedReseller && !foundUser) {
      alert('Primero busca y verifica el usuario por email')
      return
    }

    setSaving(true)
    try {
      // discountOverride: vacío = null (usar tier automático), número = override manual
      const discountOverride = formData.discountOverride.trim() === ''
        ? null
        : parseInt(formData.discountOverride)

      const resellerData = {
        email: formData.email,
        companyName: formData.companyName,
        ruc: formData.ruc,
        phone: formData.phone,
        contactName: formData.contactName,
        discountOverride: discountOverride,
        balance: parseFloat(formData.balance) || 0,
        isActive: formData.isActive,
        customDomain: formData.customDomain || null
      }

      if (selectedReseller) {
        // Actualizar reseller existente
        await updateDoc(doc(db, 'resellers', selectedReseller.id), {
          ...resellerData,
          updatedAt: Timestamp.now()
        })
        setShowModal(false)
        loadResellers()
      } else {
        // Crear nuevo usando Cloud Function (con UID real)
        const response = await fetch(CREATE_RESELLER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminUid: user?.uid,
            resellerData: {
              uid: foundUser.user.uid,
              ...resellerData,
              totalSpent: 0
            }
          })
        })

        const data = await response.json()

        if (data.success) {
          setShowModal(false)
          setFoundUser(null)
          loadResellers()
        } else {
          alert('Error al crear reseller: ' + data.error)
        }
      }
    } catch (error) {
      console.error('Error saving reseller:', error)
      alert('Error al guardar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function addDeposit() {
    const amount = parseFloat(depositAmount)
    if (!amount || amount <= 0) {
      alert('Ingresa un monto válido')
      return
    }

    setSaving(true)
    try {
      // Actualizar balance
      const newBalance = (selectedReseller.balance || 0) + amount
      await updateDoc(doc(db, 'resellers', selectedReseller.id), {
        balance: newBalance,
        updatedAt: Timestamp.now()
      })

      // Registrar transacción
      await setDoc(doc(collection(db, 'resellerTransactions')), {
        resellerId: selectedReseller.id,
        type: 'deposit',
        amount: amount,
        description: depositNote || 'Recarga de saldo por admin',
        createdAt: Timestamp.now(),
        addedBy: 'admin'
      })

      setShowDepositModal(false)
      loadResellers()
    } catch (error) {
      console.error('Error adding deposit:', error)
      alert('Error al agregar depósito: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleResellerStatus(reseller) {
    try {
      await updateDoc(doc(db, 'resellers', reseller.id), {
        isActive: !reseller.isActive,
        updatedAt: Timestamp.now()
      })
      loadResellers()
    } catch (error) {
      console.error('Error toggling status:', error)
    }
  }

  const filteredResellers = resellers.filter(r => {
    const search = searchTerm.toLowerCase()
    return (
      r.email?.toLowerCase().includes(search) ||
      r.companyName?.toLowerCase().includes(search) ||
      r.ruc?.includes(search)
    )
  })

  const stats = {
    total: resellers.length,
    active: resellers.filter(r => r.isActive !== false).length,
    totalBalance: resellers.reduce((sum, r) => sum + (r.balance || 0), 0),
    totalClients: resellers.reduce((sum, r) => sum + (r.clientsCount || 0), 0)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando resellers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resellers</h1>
          <p className="text-gray-500">Gestiona tu red de revendedores</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-5 h-5" />
          Nuevo Reseller
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Resellers</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.active}</p>
              <p className="text-xs text-gray-500">Activos</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg sm:text-2xl font-bold text-gray-900 truncate">S/ {stats.totalBalance.toFixed(2)}</p>
              <p className="text-xs text-gray-500">Saldo Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.totalClients}</p>
              <p className="text-xs text-gray-500">Clientes Totales</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={loadResellers}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredResellers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No hay resellers</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="sm:hidden divide-y divide-gray-200">
              {filteredResellers.map(reseller => (
                <div key={reseller.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{reseller.companyName}</p>
                        <p className="text-xs text-gray-500 truncate">{reseller.email}</p>
                        {reseller.customDomain && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Globe className="w-2.5 h-2.5 text-indigo-400" />
                            <span className="text-xs text-indigo-600 truncate">
                              {reseller.customDomain}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      reseller.isActive !== false
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {reseller.isActive !== false ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{reseller.currentTier?.icon}</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                        <Percent className="w-3 h-3" />
                        {reseller.effectiveDiscount}%
                        {reseller.hasOverride && <Crown className="w-3 h-3 text-purple-500" />}
                      </span>
                      <span className="text-gray-500">{reseller.activeClientsCount || 0} activos</span>
                    </div>
                    <span className="font-bold text-gray-900">S/ {(reseller.balance || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => openDepositModal(reseller)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg text-xs flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> Saldo
                    </button>
                    <button
                      onClick={() => openEditModal(reseller)}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleResellerStatus(reseller)}
                      className={`p-2 rounded-lg ${
                        reseller.isActive !== false
                          ? 'text-red-500 hover:bg-red-50'
                          : 'text-green-500 hover:bg-green-50'
                      }`}
                    >
                      {reseller.isActive !== false ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empresa</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contacto</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nivel</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saldo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clientes</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredResellers.map(reseller => (
                    <tr key={reseller.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{reseller.companyName}</p>
                            <p className="text-sm text-gray-500">{reseller.ruc}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{reseller.contactName || '-'}</p>
                        <p className="text-sm text-gray-500">{reseller.email}</p>
                        {reseller.customDomain && (
                          <div className="flex items-center gap-1 mt-1">
                            <Globe className="w-3 h-3 text-indigo-400" />
                            <span className="text-xs text-indigo-600">
                              {reseller.customDomain}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{reseller.currentTier?.icon}</span>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-gray-900">{reseller.currentTier?.name}</span>
                              {reseller.hasOverride && (
                                <Crown className="w-3 h-3 text-purple-500" title="Descuento manual" />
                              )}
                            </div>
                            <span className="text-sm text-green-600 font-medium">{reseller.effectiveDiscount}% desc.</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">S/ {(reseller.balance || 0).toFixed(2)}</span>
                          <button
                            onClick={() => openDepositModal(reseller)}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                            title="Agregar saldo"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-gray-900">{reseller.activeClientsCount || 0}</span>
                          <span className="text-gray-400 text-sm"> / {reseller.clientsCount || 0}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          reseller.isActive !== false
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {reseller.isActive !== false ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(reseller)}
                            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleResellerStatus(reseller)}
                            className={`p-2 rounded-lg ${
                              reseller.isActive !== false
                                ? 'text-red-500 hover:bg-red-50'
                                : 'text-green-500 hover:bg-green-50'
                            }`}
                          >
                            {reseller.isActive !== false ? (
                              <XCircle className="w-4 h-4" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {selectedReseller ? 'Editar Reseller' : 'Nuevo Reseller'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Paso 1: Buscar usuario (solo para crear nuevo) */}
              {!selectedReseller && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Paso 1: Buscar usuario existente por email *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => {
                        setFormData({ ...formData, email: e.target.value })
                        setFoundUser(null)
                        setUserSearchError('')
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="usuario@ejemplo.com"
                      disabled={foundUser}
                    />
                    <button
                      onClick={searchUserByEmail}
                      disabled={searchingUser || foundUser}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {searchingUser ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      Buscar
                    </button>
                  </div>

                  {/* Error de búsqueda */}
                  {userSearchError && (
                    <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                      <AlertTriangle className="w-4 h-4" />
                      {userSearchError}
                    </div>
                  )}

                  {/* Usuario encontrado */}
                  {foundUser && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="bg-green-100 p-2 rounded-full">
                          <UserCheck className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-green-800">Usuario encontrado</p>
                          <p className="text-sm text-green-700">{foundUser.user.email}</p>
                          <p className="text-xs text-green-600 mt-1">UID: {foundUser.user.uid}</p>
                          {foundUser.subscription && (
                            <div className="mt-2 text-xs text-green-700">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-200 rounded-full">
                                Plan: {foundUser.subscription.plan} • {foundUser.subscription.status}
                              </span>
                              {foundUser.subscription.businessName && (
                                <p className="mt-1">Negocio: {foundUser.subscription.businessName}</p>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setFoundUser(null)
                            setFormData({ ...formData, email: '', companyName: '' })
                          }}
                          className="text-green-600 hover:text-green-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Paso 2: Datos del reseller (visible cuando hay usuario o es edición) */}
              {(foundUser || selectedReseller) && (
                <>
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                      {selectedReseller ? 'Datos del Reseller' : 'Paso 2: Datos del Reseller'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {selectedReseller && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          value={formData.email}
                          disabled
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                        />
                      </div>
                    )}
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Empresa *</label>
                      <input
                        type="text"
                        value={formData.companyName}
                        onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Mi Empresa SAC"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">RUC</label>
                      <input
                        type="text"
                        value={formData.ruc}
                        onChange={e => setFormData({ ...formData, ruc: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="20123456789"
                        maxLength={11}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="987654321"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Contacto</label>
                      <input
                        type="text"
                        value={formData.contactName}
                        onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Juan Pérez"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Descuento Manual (%)
                        <span className="text-xs text-gray-400 ml-1">Opcional</span>
                      </label>
                      <input
                        type="number"
                        value={formData.discountOverride}
                        onChange={e => setFormData({ ...formData, discountOverride: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        min="0"
                        max="100"
                        placeholder="Automático por nivel"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Vacío = automático (Bronce 20%, Plata 30%, Oro 40%)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Saldo Inicial</label>
                      <input
                        type="number"
                        value={formData.balance}
                        onChange={e => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                          className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Reseller activo</span>
                      </label>
                    </div>
                  </div>

                  {/* Sección de Dominio (solo admin) */}
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-indigo-500" />
                      Dominio Personalizado
                    </h3>

                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Dominio del Reseller
                        <span className="text-xs text-indigo-500 ml-1">(requiere configuración DNS)</span>
                      </label>
                      <input
                        type="text"
                        value={formData.customDomain}
                        onChange={e => setFormData({ ...formData, customDomain: e.target.value.toLowerCase() })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="facturacion.miempresa.com"
                      />
                      {formData.customDomain && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                          <strong>Configuración requerida:</strong>
                          <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                            <li>Agregar dominio en Vercel: {formData.customDomain}</li>
                            <li>Configurar DNS: CNAME → cname.vercel-dns.com</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Información */}
              {!selectedReseller && !foundUser && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>¿Cómo funciona?</strong><br />
                    1. Busca un usuario existente por su email<br />
                    2. El usuario debe tener una cuenta activa en Cobrify<br />
                    3. Al agregarlo como reseller, podrá acceder al panel de revendedores
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowModal(false)
                    setFoundUser(null)
                    setUserSearchError('')
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveReseller}
                  disabled={saving || (!selectedReseller && !foundUser)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {selectedReseller ? 'Guardar Cambios' : 'Crear Reseller'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && selectedReseller && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Agregar Saldo</h2>
              <button
                onClick={() => setShowDepositModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">Reseller</p>
                <p className="font-medium text-gray-900">{selectedReseller.companyName}</p>
                <p className="text-sm text-gray-500 mt-2">Saldo actual</p>
                <p className="text-2xl font-bold text-gray-900">S/ {(selectedReseller.balance || 0).toFixed(2)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto a agregar</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">S/</span>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={e => setDepositNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ej: Yape 12345, Transferencia BCP"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={addDeposit}
                  disabled={saving || !depositAmount}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4" />
                      Agregar Saldo
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
