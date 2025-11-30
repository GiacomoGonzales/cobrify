import React, { useState, useEffect } from 'react'
import { db } from '@/lib/firebase'
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
  TrendingUp
} from 'lucide-react'

export default function AdminResellers() {
  const [loading, setLoading] = useState(true)
  const [resellers, setResellers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [selectedReseller, setSelectedReseller] = useState(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    email: '',
    companyName: '',
    ruc: '',
    phone: '',
    contactName: '',
    discount: 30,
    balance: 0,
    isActive: true
  })

  const [depositAmount, setDepositAmount] = useState('')
  const [depositNote, setDepositNote] = useState('')

  useEffect(() => {
    loadResellers()
  }, [])

  async function loadResellers() {
    setLoading(true)
    try {
      const resellersSnapshot = await getDocs(collection(db, 'resellers'))
      const resellersList = []

      for (const docSnap of resellersSnapshot.docs) {
        const data = docSnap.data()

        // Contar clientes del reseller
        const clientsQuery = query(
          collection(db, 'subscriptions'),
          where('resellerId', '==', docSnap.id)
        )
        const clientsSnapshot = await getDocs(clientsQuery)

        resellersList.push({
          id: docSnap.id,
          ...data,
          clientsCount: clientsSnapshot.size
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
    setFormData({
      email: '',
      companyName: '',
      ruc: '',
      phone: '',
      contactName: '',
      discount: 30,
      balance: 0,
      isActive: true
    })
    setShowModal(true)
  }

  function openEditModal(reseller) {
    setSelectedReseller(reseller)
    setFormData({
      email: reseller.email || '',
      companyName: reseller.companyName || '',
      ruc: reseller.ruc || '',
      phone: reseller.phone || '',
      contactName: reseller.contactName || '',
      discount: (reseller.discount || 0.30) * 100,
      balance: reseller.balance || 0,
      isActive: reseller.isActive !== false
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
    if (!formData.email || !formData.companyName) {
      alert('Email y nombre de empresa son requeridos')
      return
    }

    setSaving(true)
    try {
      const resellerData = {
        email: formData.email,
        companyName: formData.companyName,
        ruc: formData.ruc,
        phone: formData.phone,
        contactName: formData.contactName,
        discount: formData.discount / 100,
        balance: parseFloat(formData.balance) || 0,
        isActive: formData.isActive,
        updatedAt: Timestamp.now()
      }

      if (selectedReseller) {
        // Actualizar
        await updateDoc(doc(db, 'resellers', selectedReseller.id), resellerData)
      } else {
        // Crear nuevo - El ID debe ser el UID del usuario en Firebase Auth
        // Por ahora usamos el email como referencia temporal
        const resellerId = formData.email.replace(/[^a-zA-Z0-9]/g, '_')
        resellerData.createdAt = Timestamp.now()
        resellerData.totalSpent = 0
        await setDoc(doc(db, 'resellers', resellerId), resellerData)
      }

      setShowModal(false)
      loadResellers()
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Resellers</p>
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
              <Wallet className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">S/ {stats.totalBalance.toFixed(2)}</p>
              <p className="text-xs text-gray-500">Saldo Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalClients}</p>
              <p className="text-xs text-gray-500">Clientes Totales</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por empresa, email o RUC..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={loadResellers}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empresa</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contacto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descuento</th>
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
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        <Percent className="w-3 h-3" />
                        {((reseller.discount || 0.30) * 100).toFixed(0)}%
                      </span>
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
                      <span className="font-medium text-gray-900">{reseller.clientsCount || 0}</span>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="reseller@empresa.com"
                  />
                </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descuento (%)</label>
                  <input
                    type="number"
                    value={formData.discount}
                    onChange={e => setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    min="0"
                    max="100"
                  />
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

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>Nota:</strong> El reseller debe registrarse con este email para acceder al panel.
                  Después de registrarse, actualiza el ID del documento con su UID de Firebase.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveReseller}
                  disabled={saving}
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
                      Guardar
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
