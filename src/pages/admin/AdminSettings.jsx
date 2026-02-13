import React, { useState, useEffect } from 'react'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore'
import { PLANS } from '@/services/subscriptionService'
import { getCustomPlans, createCustomPlan, updateCustomPlan, deleteCustomPlan, getHiddenPlans, hidePlan, unhidePlan } from '@/services/customPlanService'
import {
  Settings,
  Save,
  RefreshCw,
  CreditCard,
  Bell,
  Shield,
  Mail,
  Globe,
  Database,
  AlertTriangle,
  CheckCircle,
  Info,
  DollarSign,
  Percent,
  Clock,
  Users,
  Trash2,
  Wrench,
  Plus,
  Edit2,
  X
} from 'lucide-react'

export default function AdminSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState('plans')
  const [settings, setSettings] = useState({
    plans: {},
    notifications: {
      notifyOnNewUser: true,
      notifyOnPayment: true,
      notifyOnExpiring: true,
      daysBeforeExpiry: 3
    },
    system: {
      maintenanceMode: false,
      allowNewRegistrations: true,
      defaultTrialDays: 7,
      pauseSunatRestaurants: false
    }
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    try {
      // Intentar cargar configuración guardada (puede fallar por permisos)
      try {
        const settingsRef = doc(db, 'config', 'adminSettings')
        const settingsSnap = await getDoc(settingsRef)

        if (settingsSnap.exists()) {
          setSettings(prev => ({ ...prev, ...settingsSnap.data() }))
        }
      } catch (permError) {
        console.warn('No se pudo cargar config/adminSettings (permisos), usando valores por defecto')
      }

      // Cargar planes actuales (siempre desde el código)
      setSettings(prev => ({ ...prev, plans: { ...PLANS } }))
    } catch (error) {
      console.error('Error loading settings:', error)
      // Asegurar que los planes se carguen aunque falle todo lo demás
      setSettings(prev => ({ ...prev, plans: { ...PLANS } }))
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const settingsRef = doc(db, 'config', 'adminSettings')
      await setDoc(settingsRef, {
        notifications: settings.notifications,
        system: settings.system,
        updatedAt: new Date()
      }, { merge: true })

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSaving(false)
    }
  }

  function updateSetting(section, key, value) {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }))
  }

  const sections = [
    { id: 'plans', label: 'Planes', icon: CreditCard },
    { id: 'notifications', label: 'Notificaciones', icon: Bell },
    { id: 'system', label: 'Sistema', icon: Settings },
    { id: 'maintenance', label: 'Mantenimiento', icon: Wrench }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando configuración...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeSection === section.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <section.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{section.label}</span>
            </button>
          ))}

          <div className="flex-1" />

          <div className="flex items-center gap-2 p-2">
            {saved && (
              <span className="flex items-center gap-1 text-green-600 text-xs sm:text-sm">
                <CheckCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Guardado</span>
              </span>
            )}
            <button
              onClick={saveSettings}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Guardar</span>
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6">
          {activeSection === 'plans' && (
            <PlansSection plans={settings.plans} />
          )}
          {activeSection === 'notifications' && (
            <NotificationsSection
              settings={settings.notifications}
              onChange={(key, value) => updateSetting('notifications', key, value)}
            />
          )}
          {activeSection === 'system' && (
            <SystemSection
              settings={settings.system}
              onChange={(key, value) => updateSetting('system', key, value)}
            />
          )}
          {activeSection === 'maintenance' && (
            <MaintenanceSection />
          )}
        </div>
      </div>
    </div>
  )
}

function PlansSection({ plans }) {
  const planEntries = Object.entries(plans || {})
  const [customPlans, setCustomPlans] = useState({})
  const [hiddenPlanKeys, setHiddenPlanKeys] = useState([])
  const [showHidden, setShowHidden] = useState(false)
  const [loadingCustom, setLoadingCustom] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', months: 1, totalPrice: 0, emissionMethod: 'qpse',
    maxInvoicesPerMonth: 500, maxBranches: 1,
    sunatIntegration: true, multiUser: true, notes: ''
  })

  useEffect(() => {
    loadCustomPlans()
    loadHiddenPlans()
  }, [])

  async function loadCustomPlans() {
    setLoadingCustom(true)
    try {
      const data = await getCustomPlans()
      setCustomPlans(data)
    } catch (e) {
      console.error('Error loading custom plans:', e)
    } finally {
      setLoadingCustom(false)
    }
  }

  async function loadHiddenPlans() {
    try {
      const data = await getHiddenPlans()
      setHiddenPlanKeys(data)
    } catch (e) {
      console.error('Error loading hidden plans:', e)
    }
  }

  async function handleHidePlan(planKey) {
    await hidePlan(planKey)
    setHiddenPlanKeys(prev => [...prev, planKey])
  }

  async function handleUnhidePlan(planKey) {
    await unhidePlan(planKey)
    setHiddenPlanKeys(prev => prev.filter(k => k !== planKey))
  }

  const visiblePlanEntries = showHidden
    ? planEntries
    : planEntries.filter(([key]) => !hiddenPlanKeys.includes(key))
  const hiddenCount = planEntries.filter(([key]) => hiddenPlanKeys.includes(key)).length

  function resetForm() {
    setForm({
      name: '', months: 1, totalPrice: 0, emissionMethod: 'qpse',
      maxInvoicesPerMonth: 500, maxBranches: 1,
      sunatIntegration: true, multiUser: true, notes: ''
    })
    setEditingPlan(null)
    setShowForm(false)
  }

  function openEdit(planId, plan) {
    setEditingPlan(planId)
    setForm({
      name: plan.name || '',
      months: plan.months || 1,
      totalPrice: plan.totalPrice || 0,
      emissionMethod: plan.emissionMethod || 'qpse',
      maxInvoicesPerMonth: plan.limits?.maxInvoicesPerMonth ?? 500,
      maxBranches: plan.limits?.maxBranches ?? 1,
      sunatIntegration: plan.limits?.sunatIntegration ?? true,
      multiUser: plan.limits?.multiUser ?? true,
      notes: plan.notes || ''
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const planData = {
        name: form.name.trim(),
        months: parseInt(form.months) || 1,
        totalPrice: parseFloat(form.totalPrice) || 0,
        emissionMethod: form.emissionMethod,
        limits: {
          maxInvoicesPerMonth: parseInt(form.maxInvoicesPerMonth) || 500,
          maxBranches: parseInt(form.maxBranches) || 1,
          sunatIntegration: form.sunatIntegration,
          multiUser: form.multiUser
        },
        notes: form.notes
      }

      if (editingPlan) {
        await updateCustomPlan(editingPlan, planData)
      } else {
        await createCustomPlan(planData)
      }

      await loadCustomPlans()
      resetForm()
    } catch (e) {
      console.error('Error saving custom plan:', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(planId) {
    if (!confirm('¿Eliminar este plan personalizado?')) return
    try {
      await deleteCustomPlan(planId)
      await loadCustomPlans()
    } catch (e) {
      console.error('Error deleting custom plan:', e)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start gap-2 text-amber-600 bg-amber-50 p-3 sm:p-4 rounded-lg">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm">
          Los planes estándar se configuran en el código. Los planes personalizados se gestionan abajo.
        </p>
      </div>

      {/* Planes estándar */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Planes Estándar</h3>
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {showHidden ? 'Ocultar eliminados' : `Mostrar eliminados (${hiddenCount})`}
          </button>
        )}
      </div>
      {planEntries.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p>Cargando planes...</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {visiblePlanEntries.map(([key, plan]) => (
          <div
            key={key}
            className={`rounded-xl border p-3 sm:p-5 hover:shadow-md transition-shadow ${
              hiddenPlanKeys.includes(key) ? 'bg-gray-50 border-dashed border-gray-300 opacity-60' : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="font-bold text-gray-900 text-sm sm:text-base">{plan.name}</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                key === 'trial' || key === 'free'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {key === 'trial' || key === 'free' ? 'Gratis' : 'Pago'}
              </span>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Precio
                </span>
                <span className="font-medium">S/ {plan.pricePerMonth?.toFixed(2) || '0.00'}</span>
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Docs
                </span>
                <span className="font-medium">
                  {plan.limits?.maxInvoicesPerMonth === -1 ? '∞' : (plan.limits?.maxInvoicesPerMonth || '∞')}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Multi-user
                </span>
                <span className={`font-medium ${plan.limits?.multiUser ? 'text-green-600' : 'text-gray-400'}`}>
                  {plan.limits?.multiUser ? 'Sí' : 'No'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Período
                </span>
                <span className="font-medium">
                  {plan.months === 0 ? '7 días' : plan.months >= 999 ? '∞' : `${plan.months}m`}
                </span>
              </div>

              {plan.category && (
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Emisión
                  </span>
                  <span className="font-medium">
                    {plan.category === 'qpse' ? 'QPse' : plan.category === 'sunat_direct' ? 'SUNAT' : plan.category === 'offline' ? 'Sin conexión' : plan.category}
                  </span>
                </div>
              )}
            </div>

            {plan.features && plan.features.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Características:</p>
                <ul className="space-y-1">
                  {plan.features.slice(0, 3).map((feature, idx) => (
                    <li key={idx} className="text-xs text-gray-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      {feature}
                    </li>
                  ))}
                  {plan.features.length > 3 && (
                    <li className="text-xs text-gray-400">
                      +{plan.features.length - 3} más...
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100">
              {hiddenPlanKeys.includes(key) ? (
                <button
                  onClick={() => handleUnhidePlan(key)}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Restaurar
                </button>
              ) : (
                <button
                  onClick={() => handleHidePlan(key)}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Planes Personalizados */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Planes Personalizados</h3>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Crear Plan
          </button>
        </div>

        {/* Formulario inline */}
        {showForm && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-amber-900">
                {editingPlan ? 'Editar Plan' : 'Nuevo Plan Personalizado'}
              </h4>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Plan Especial - Restaurante Juan"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Método de emisión</label>
                <select
                  value={form.emissionMethod}
                  onChange={(e) => setForm({ ...form, emissionMethod: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                >
                  <option value="qpse">QPse</option>
                  <option value="sunat_direct">SUNAT Directo</option>
                  <option value="offline">Sin conexión</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Meses</label>
                <input
                  type="number" min="1" max="36"
                  value={form.months}
                  onChange={(e) => setForm({ ...form, months: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Precio Total (S/)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.totalPrice}
                  onChange={(e) => setForm({ ...form, totalPrice: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Comprobantes/mes</label>
                <input
                  type="number" min="-1"
                  value={form.maxInvoicesPerMonth}
                  onChange={(e) => setForm({ ...form, maxInvoicesPerMonth: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-gray-400 mt-0.5">-1 = ilimitado</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sucursales</label>
                <input
                  type="number" min="1"
                  value={form.maxBranches}
                  onChange={(e) => setForm({ ...form, maxBranches: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox" checked={form.sunatIntegration}
                  onChange={(e) => setForm({ ...form, sunatIntegration: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded"
                />
                Integración SUNAT
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox" checked={form.multiUser}
                  onChange={(e) => setForm({ ...form, multiUser: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded"
                />
                Multi-usuario
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas internas del admin..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {form.months > 0 && form.totalPrice > 0 && (
              <p className="text-xs text-amber-700">
                Precio por mes: S/ {(parseFloat(form.totalPrice) / parseInt(form.months)).toFixed(2)}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingPlan ? 'Actualizar' : 'Crear'}
              </button>
              <button onClick={resetForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Grid de planes personalizados */}
        {loadingCustom ? (
          <div className="text-center py-6 text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm">Cargando planes personalizados...</p>
          </div>
        ) : Object.keys(customPlans).length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No hay planes personalizados aún.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {Object.entries(customPlans).map(([key, plan]) => (
              <div
                key={key}
                className="bg-white rounded-xl border-2 border-amber-200 p-3 sm:p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate flex-1 mr-2">{plan.name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 flex-shrink-0">
                    Custom
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-500">Precio total</span>
                    <span className="font-bold text-amber-700">S/ {plan.totalPrice?.toFixed?.(2) || plan.totalPrice}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-500">Período</span>
                    <span className="font-medium">{plan.months}m (S/ {plan.pricePerMonth?.toFixed?.(2) || '0.00'}/mes)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-500">Comprobantes</span>
                    <span className="font-medium">{plan.limits?.maxInvoicesPerMonth === -1 ? '∞' : plan.limits?.maxInvoicesPerMonth}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-500">Emisión</span>
                    <span className="font-medium">
                      {plan.emissionMethod === 'qpse' ? 'QPse' : plan.emissionMethod === 'sunat_direct' ? 'SUNAT' : 'Sin conexión'}
                    </span>
                  </div>
                  {plan.notes && (
                    <p className="text-xs text-gray-500 italic mt-1">{plan.notes}</p>
                  )}
                </div>

                <div className="flex gap-2 mt-3 pt-3 border-t border-amber-100">
                  <button
                    onClick={() => openEdit(key, plan)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button
                    onClick={() => handleDelete(key)}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NotificationsSection({ settings, onChange }) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-blue-600 bg-blue-50 p-4 rounded-lg">
        <Info className="w-5 h-5 flex-shrink-0" />
        <p className="text-sm">
          Estas configuraciones controlan las notificaciones que aparecen en la campanita del panel de administración.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Notificaciones Push (Campanita)</h3>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-indigo-600" />
              <div>
                <p className="font-medium text-gray-900">Nuevo usuario registrado</p>
                <p className="text-sm text-gray-500">Mostrar notificación cuando un nuevo usuario se registra</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.notifyOnNewUser !== false}
              onChange={e => onChange('notifyOnNewUser', e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900">Nuevo pago recibido</p>
                <p className="text-sm text-gray-500">Mostrar notificación cuando se registra un pago</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.notifyOnPayment !== false}
              onChange={e => onChange('notifyOnPayment', e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-gray-900">Suscripción por vencer</p>
                <p className="text-sm text-gray-500">Mostrar alertas de suscripciones próximas a vencer</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.notifyOnExpiring !== false}
              onChange={e => onChange('notifyOnExpiring', e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuración de Alertas</h3>

        <div className="bg-gray-50 rounded-lg p-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Días antes del vencimiento para alertar</span>
            <input
              type="number"
              min="1"
              max="30"
              value={settings.daysBeforeExpiry || 3}
              onChange={e => onChange('daysBeforeExpiry', parseInt(e.target.value) || 3)}
              className="mt-2 block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Se mostrarán alertas para suscripciones que vencen en los próximos {settings.daysBeforeExpiry || 3} días
            </p>
          </label>
        </div>
      </div>
    </div>
  )
}

function SystemSection({ settings, onChange }) {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [migrating, setMigrating] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState(null)

  async function scanProducts() {
    setScanning(true)
    setScanResult(null)
    setMigrateMsg(null)
    try {
      // Buscar negocios con IGV reducido
      const { collection: colRef, getDocs: getDocsSnap, query, where } = await import('firebase/firestore')
      const businessesSnap = await getDocsSnap(colRef(db, 'businesses'))
      const results = []

      for (const bizDoc of businessesSnap.docs) {
        const bizData = bizDoc.data()
        const tc = bizData.emissionConfig?.taxConfig
        if (tc?.taxType !== 'reduced' && tc?.igvRate !== 10.5) continue

        // Buscar productos con igvRate = 10 en este negocio
        const productsQuery = query(colRef(db, 'businesses', bizDoc.id, 'products'), where('igvRate', '==', 10))
        const productsSnap = await getDocsSnap(productsQuery)
        if (productsSnap.empty) continue

        results.push({
          businessId: bizDoc.id,
          businessName: bizData.razonSocial || bizData.businessName || bizDoc.id,
          products: productsSnap.docs.map(p => ({ id: p.id, name: p.data().name }))
        })
      }
      setScanResult(results)
    } catch (error) {
      setMigrateMsg({ success: false, message: error.message })
    } finally {
      setScanning(false)
    }
  }

  async function fixProducts(businessId, productIds) {
    setMigrating(true)
    try {
      const { doc: docRef, updateDoc, deleteField } = await import('firebase/firestore')
      for (const pid of productIds) {
        await updateDoc(docRef(db, 'businesses', businessId, 'products', pid), { igvRate: deleteField() })
      }
      // Quitar del resultado
      setScanResult(prev => prev.map(r => r.businessId === businessId ? { ...r, products: [] } : r).filter(r => r.products.length > 0))
      setMigrateMsg({ success: true, message: `${productIds.length} productos corregidos` })
    } catch (error) {
      setMigrateMsg({ success: false, message: error.message })
    } finally {
      setMigrating(false)
    }
  }

  async function fixAll() {
    if (!scanResult?.length) return
    setMigrating(true)
    let total = 0
    try {
      const { doc: docRef, updateDoc, deleteField } = await import('firebase/firestore')
      for (const biz of scanResult) {
        for (const p of biz.products) {
          await updateDoc(docRef(db, 'businesses', biz.businessId, 'products', p.id), { igvRate: deleteField() })
          total++
        }
      }
      setScanResult([])
      setMigrateMsg({ success: true, message: `${total} productos corregidos en total` })
    } catch (error) {
      setMigrateMsg({ success: false, message: error.message })
    } finally {
      setMigrating(false)
    }
  }
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuración del Sistema</h3>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900">Permitir nuevos registros</p>
                <p className="text-sm text-gray-500">Permitir que nuevos usuarios se registren en la plataforma</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.allowNewRegistrations}
              onChange={e => onChange('allowNewRegistrations', e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <p className="font-medium text-gray-900">Modo mantenimiento</p>
                <p className="text-sm text-gray-500">Bloquear acceso a usuarios mientras se realiza mantenimiento</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.maintenanceMode}
              onChange={e => onChange('maintenanceMode', e.target.checked)}
              className="w-5 h-5 text-red-600 rounded focus:ring-red-500"
            />
          </label>

          <label className={`flex items-center justify-between p-4 rounded-lg cursor-pointer ${settings.pauseSunatRestaurants ? 'bg-amber-50 hover:bg-amber-100 border border-amber-300' : 'bg-gray-50 hover:bg-gray-100'}`}>
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-gray-900">Pausar SUNAT para restaurantes (IGV 10.5%)</p>
                <p className="text-sm text-gray-500">Suspende el envio automatico a SUNAT para negocios con IGV reducido (Ley 31556). Las facturas se generan normalmente pero quedan pendientes de envio.</p>
                {settings.pauseSunatRestaurants && (
                  <p className="text-xs text-amber-700 font-medium mt-1">ACTIVO: Los restaurantes con IGV 10.5% NO envian automaticamente a SUNAT</p>
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.pauseSunatRestaurants}
              onChange={e => onChange('pauseSunatRestaurants', e.target.checked)}
              className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500"
            />
          </label>

          {/* Detectar productos IGV 10% → 10.5% */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Productos con IGV 10% (deben ser 10.5%)</p>
                <p className="text-sm text-gray-500">Detecta negocios con IGV reducido cuyos productos aún tienen 10% guardado</p>
              </div>
              <button
                onClick={scanProducts}
                disabled={scanning}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {scanning ? 'Escaneando...' : 'Escanear'}
              </button>
            </div>

            {/* Resultados del escaneo */}
            {scanResult !== null && (
              <div className="mt-3 p-3 bg-white rounded-lg border text-sm max-h-80 overflow-y-auto">
                {scanResult.length === 0 ? (
                  <p className="text-green-700 font-medium">Todo correcto. No hay productos con IGV 10%.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-900">
                        {scanResult.reduce((sum, r) => sum + r.products.length, 0)} productos en {scanResult.length} negocios
                      </p>
                      <button
                        onClick={fixAll}
                        disabled={migrating}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-xs font-medium"
                      >
                        {migrating ? 'Corrigiendo...' : 'Corregir todos'}
                      </button>
                    </div>
                    {scanResult.map(biz => (
                      <div key={biz.businessId} className="mb-3 pb-3 border-b last:border-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-gray-800">{biz.businessName} ({biz.products.length})</p>
                          <button
                            onClick={() => fixProducts(biz.businessId, biz.products.map(p => p.id))}
                            disabled={migrating}
                            className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 disabled:opacity-50"
                          >
                            Corregir
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {biz.products.map(p => (
                            <span key={p.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{p.name}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Mensaje */}
            {migrateMsg && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${migrateMsg.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                <p className="font-medium">{migrateMsg.message}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuración de Trial</h3>

        <div className="bg-gray-50 rounded-lg p-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Días de trial por defecto</span>
            <input
              type="number"
              min="1"
              max="30"
              value={settings.defaultTrialDays}
              onChange={e => onChange('defaultTrialDays', parseInt(e.target.value) || 7)}
              className="mt-2 block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Período de prueba gratuita para nuevos usuarios
            </p>
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Sistema</h3>

        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Versión de la aplicación</span>
            <span className="font-mono text-sm">v1.7.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Entorno</span>
            <span className="font-mono text-sm">
              {import.meta.env.MODE === 'production' ? 'Producción' : 'Desarrollo'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Base de datos</span>
            <span className="font-mono text-sm flex items-center gap-1">
              <Database className="w-4 h-4 text-green-500" />
              Firebase Firestore
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MaintenanceSection() {
  const [cleaning, setCleaning] = useState(false)
  const [result, setResult] = useState(null)

  async function cleanupSubUserSubscriptions() {
    setCleaning(true)
    setResult(null)

    try {
      // 1. Obtener todos los usuarios con ownerId (sub-usuarios)
      const usersSnapshot = await getDocs(collection(db, 'users'))
      const subUserIds = new Set()

      usersSnapshot.forEach(docSnap => {
        const data = docSnap.data()
        if (data.ownerId) {
          subUserIds.add(docSnap.id)
        }
      })

      console.log(`Encontrados ${subUserIds.size} sub-usuarios`)

      // 2. Buscar suscripciones que pertenecen a sub-usuarios
      const subscriptionsSnapshot = await getDocs(collection(db, 'subscriptions'))
      const toDelete = []

      subscriptionsSnapshot.forEach(docSnap => {
        if (subUserIds.has(docSnap.id)) {
          toDelete.push({
            id: docSnap.id,
            email: docSnap.data().email,
            plan: docSnap.data().plan
          })
        }
      })

      console.log(`Suscripciones a eliminar: ${toDelete.length}`)

      // 3. Eliminar las suscripciones incorrectas
      let deleted = 0
      for (const sub of toDelete) {
        try {
          await deleteDoc(doc(db, 'subscriptions', sub.id))
          deleted++
          console.log(`Eliminada suscripción de: ${sub.email}`)
        } catch (error) {
          console.error(`Error al eliminar ${sub.email}:`, error)
        }
      }

      setResult({
        success: true,
        message: `Limpieza completada: ${deleted} suscripciones de sub-usuarios eliminadas`,
        details: toDelete
      })

    } catch (error) {
      console.error('Error en limpieza:', error)
      setResult({
        success: false,
        message: `Error: ${error.message}`
      })
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Herramientas de Mantenimiento</h3>

        <div className="space-y-4">
          {/* Limpieza de suscripciones de sub-usuarios */}
          <div className="bg-amber-50 rounded-lg p-5 border border-amber-200">
            <div className="flex items-start gap-3">
              <Trash2 className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">Limpiar suscripciones de sub-usuarios</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Elimina suscripciones "trial" que fueron creadas incorrectamente para sub-usuarios.
                  Los sub-usuarios deben usar la suscripción de su negocio principal.
                </p>

                <button
                  onClick={cleanupSubUserSubscriptions}
                  disabled={cleaning}
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {cleaning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Limpiando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Ejecutar limpieza
                    </>
                  )}
                </button>

                {result && (
                  <div className={`mt-3 p-3 rounded-lg ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <p className="font-medium">{result.message}</p>
                    {result.details && result.details.length > 0 && (
                      <ul className="mt-2 text-sm">
                        {result.details.map((d, i) => (
                          <li key={i}>• {d.email} (plan: {d.plan})</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center gap-2 text-blue-800">
              <Info className="w-5 h-5" />
              <p className="text-sm">
                Estas herramientas son para uso administrativo. Úsalas con precaución.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
