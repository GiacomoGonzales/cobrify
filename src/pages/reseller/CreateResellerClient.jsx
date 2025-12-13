import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { doc, setDoc, updateDoc, addDoc, collection, Timestamp } from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { PLANS } from '@/services/subscriptionService'
import {
  ArrowLeft,
  Building2,
  Mail,
  Lock,
  CreditCard,
  User,
  Phone,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Wallet,
  Tag
} from 'lucide-react'

// Precios fijos para resellers (números redondos)
const RESELLER_PRICES = {
  qpse_1_month: 14,
  qpse_6_months: 70,
  qpse_12_months: 105,
  sunat_direct_1_month: 14,
  sunat_direct_6_months: 70,
  sunat_direct_12_months: 105,
}

// Precios originales para mostrar tachado
const ORIGINAL_PRICES = {
  qpse_1_month: 20,
  qpse_6_months: 100,
  qpse_12_months: 150,
  sunat_direct_1_month: 20,
  sunat_direct_6_months: 100,
  sunat_direct_12_months: 150,
}

// Función para obtener precio del reseller (precio fijo)
function getResellerPrice(plan) {
  const price = RESELLER_PRICES[plan] || 0
  const originalPrice = ORIGINAL_PRICES[plan] || 0
  const discountPercent = originalPrice > 0 ? Math.round((1 - price / originalPrice) * 100) : 0
  return {
    price,
    originalPrice,
    discountPercent
  }
}

export default function CreateResellerClient() {
  const { user, resellerData, refreshResellerData } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Obtener el ID del reseller y su descuento
  const resellerId = resellerData?.docId || user?.uid
  const resellerDiscount = resellerData?.discount || 30 // Por defecto 30%

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    businessName: '',
    ruc: '',
    phone: '',
    address: '',
    plan: 'qpse_1_month'
  })

  const selectedPlan = PLANS[formData.plan]
  const resellerPrice = getResellerPrice(formData.plan)
  const currentBalance = resellerData?.balance || 0
  const hasEnoughBalance = currentBalance >= (resellerPrice?.price || 0)

  function handleChange(e) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    // Validations
    if (!formData.email || !formData.password || !formData.businessName) {
      setError('Por favor completa los campos obligatorios')
      return
    }

    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (!hasEnoughBalance) {
      setError('Saldo insuficiente. Recarga tu saldo para continuar.')
      return
    }

    setLoading(true)

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      )
      const newUserId = userCredential.user.uid

      // 2. Calculate period end date
      const now = new Date()
      const periodMonths = selectedPlan.months || 1
      const periodEnd = new Date(now)
      periodEnd.setMonth(periodEnd.getMonth() + periodMonths)

      // 3. Create subscription document
      // Clientes de resellers: QPse = 200 docs/mes, SUNAT Directo = ilimitado
      const isSunatDirect = formData.plan.startsWith('sunat_direct')
      const resellerLimits = {
        ...selectedPlan.limits,
        maxInvoicesPerMonth: isSunatDirect ? -1 : 200
      }

      await setDoc(doc(db, 'subscriptions', newUserId), {
        email: formData.email,
        businessName: formData.businessName,
        plan: formData.plan,
        status: 'active',
        accessBlocked: false,
        createdAt: Timestamp.now(),
        startDate: Timestamp.now(),
        currentPeriodEnd: Timestamp.fromDate(periodEnd),
        limits: resellerLimits,
        usage: {
          invoicesThisMonth: 0,
          lastResetDate: Timestamp.now()
        },
        // Reseller info
        createdByReseller: true,
        resellerId: resellerId,
        resellerPricePaid: resellerPrice.price
      })

      // 4. Create business document
      await setDoc(doc(db, 'businesses', newUserId), {
        razonSocial: formData.businessName,
        ruc: formData.ruc || '',
        phone: formData.phone || '',
        address: formData.address || '',
        businessMode: 'retail',
        createdAt: Timestamp.now(),
        createdByReseller: true,
        resellerId: resellerId
      })

      // 5. Deduct from reseller balance
      const newBalance = currentBalance - resellerPrice.price
      await updateDoc(doc(db, 'resellers', resellerId), {
        balance: newBalance,
        totalSpent: (resellerData?.totalSpent || 0) + resellerPrice.price
      })

      // 6. Record transaction
      await addDoc(collection(db, 'resellerTransactions'), {
        resellerId: resellerId,
        type: 'client_creation',
        amount: -resellerPrice.price,
        description: `Nuevo cliente: ${formData.businessName}`,
        clientId: newUserId,
        clientEmail: formData.email,
        plan: formData.plan,
        createdAt: Timestamp.now()
      })

      // 7. Refresh reseller data in context
      if (refreshResellerData) {
        await refreshResellerData()
      }

      setSuccess(true)

      // Redirect after 2 seconds
      setTimeout(() => {
        navigate('/reseller/clients')
      }, 2000)

    } catch (error) {
      console.error('Error creating client:', error)
      if (error.code === 'auth/email-already-in-use') {
        setError('Este correo electrónico ya está registrado')
      } else if (error.code === 'auth/invalid-email') {
        setError('Correo electrónico inválido')
      } else {
        setError('Error al crear el cliente: ' + error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Cliente Creado</h2>
          <p className="text-gray-600 mb-4">
            El cliente <strong>{formData.businessName}</strong> ha sido creado exitosamente.
          </p>
          <p className="text-sm text-gray-500">
            Credenciales enviadas a: {formData.email}
          </p>
          <p className="text-sm text-emerald-600 font-medium mt-4">
            Redirigiendo a la lista de clientes...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full">
      {/* Header */}
      <div className="mb-4">
        <button
          onClick={() => navigate('/reseller/clients')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver a clientes
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Crear Nuevo Cliente</h1>
      </div>

      {/* Balance Warning */}
      {!hasEnoughBalance && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">Saldo insuficiente</p>
            <p className="text-sm text-red-700">
              Tu saldo actual es S/ {currentBalance.toFixed(2)}. Necesitas S/ {(resellerPrice?.price || 0).toFixed(2)} para este plan.
            </p>
            <button
              onClick={() => navigate('/reseller/balance')}
              className="mt-2 text-sm font-medium text-red-800 underline"
            >
              Recargar saldo
            </button>
          </div>
        </div>
      )}

      {/* Form - 2 Column Layout */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column - Form Fields */}
          <div className="space-y-4">
            {/* Credentials */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                <Lock className="w-4 h-4 text-gray-400" />
                Credenciales de Acceso
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="cliente@empresa.com"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Contraseña <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Business Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-gray-400" />
                Datos del Negocio
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nombre del Negocio <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleChange}
                      placeholder="Ej: Bodega María"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      RUC (opcional)
                    </label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        name="ruc"
                        value={formData.ruc}
                        onChange={handleChange}
                        placeholder="20123456789"
                        maxLength={11}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Teléfono (opcional)
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="987654321"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Dirección (opcional)
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="Av. Principal 123, Lima"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Plans & Summary */}
          <div className="lg:sticky lg:top-4 space-y-4 self-start">
            {/* Plan Selection */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                <Tag className="w-4 h-4 text-gray-400" />
                Plan (30% desc.)
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(RESELLER_PRICES).map(([planKey]) => {
                  const plan = PLANS[planKey]
                  if (!plan) return null

                  const prices = getResellerPrice(planKey)
                  const isSelected = formData.plan === planKey
                  const isQPse = planKey.startsWith('qpse')

                  return (
                    <label
                      key={planKey}
                      className={`relative flex flex-col p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="plan"
                        value={planKey}
                        checked={isSelected}
                        onChange={handleChange}
                        className="sr-only"
                      />
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${isQPse ? 'text-blue-600' : 'text-purple-600'}`}>
                          {isQPse ? 'QPse' : 'SUNAT'}
                        </span>
                        {isSelected && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <span className="text-xs text-gray-600 mb-1">
                        {plan.months === 1 ? '1 Mes' : plan.months === 6 ? '6 Meses' : '12 Meses'}
                      </span>
                      <span className="text-lg font-bold text-gray-900">S/ {prices.price.toFixed(0)}</span>
                      <span className="text-xs text-gray-400 line-through">S/ {prices.originalPrice}</span>
                      <span className="text-xs text-gray-500 mt-1">
                        {planKey.startsWith('sunat_direct') ? 'Ilimitado' : '200/mes'}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">Resumen</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Plan</span>
                  <span className="font-medium">{selectedPlan?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tu saldo</span>
                  <span className="font-medium">S/ {currentBalance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Costo</span>
                  <span className="font-medium text-red-600">- S/ {(resellerPrice?.price || 0).toFixed(2)}</span>
                </div>
                <hr className="my-2 border-emerald-200" />
                <div className="flex justify-between">
                  <span className="font-medium text-gray-900">Saldo final</span>
                  <span className={`font-bold text-lg ${hasEnoughBalance ? 'text-emerald-600' : 'text-red-600'}`}>
                    S/ {(currentBalance - (resellerPrice?.price || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !hasEnoughBalance}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Crear Cliente
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
