import React, { useState, useEffect } from 'react'
import { db, auth } from '@/lib/firebase'
import { nombreRubro, sugerirRubroDeCuenta } from '@/data/rubros'
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, writeBatch, query, limit } from 'firebase/firestore'
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
  X,
  Image as ImageIcon, Hash, Tag } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { Boton } from '@/components/admin/ui'
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
      pauseSunatRestaurants: false,
      pauseSunatExceptions: []
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
          <RefreshCw className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando configuración...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-1 border-b border-gray-200 px-2 overflow-x-auto">
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`px-3 py-2.5 text-[13px] border-b-2 -mb-px whitespace-nowrap ${
                activeSection === section.id ? 'border-gray-900 text-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {section.label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-2 py-1.5">
            {saved && <span className="text-[12.5px] text-gray-500">Guardado</span>}
            <Boton tamano="sm" variante="primario" onClick={saveSettings} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Boton>
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
    name: '', months: 1, totalPrice: 0, includesIgv: false, emissionMethod: 'qpse',
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
      name: '', months: 1, totalPrice: 0, includesIgv: false, emissionMethod: 'qpse',
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
      includesIgv: plan.includesIgv || false,
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
        includesIgv: form.includesIgv,
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
      <div className="flex items-start gap-2 text-gray-700 bg-gray-50 p-3 sm:p-4 rounded-lg">
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
            className={`rounded-lg border p-3 sm:p-5 ${
              hiddenPlanKeys.includes(key) ? 'bg-gray-50 border-dashed border-gray-300 opacity-60' : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{plan.name}</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                key === 'trial' || key === 'free'
                  ? 'bg-gray-100 text-gray-900'
                  : 'bg-gray-100 text-gray-900'
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
                <span className={`font-medium ${plan.limits?.multiUser ? 'text-gray-700' : 'text-gray-400'}`}>
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
                      <CheckCircle className="w-3 h-3 text-gray-500" />
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
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
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
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Crear Plan
          </button>
        </div>

        {/* Formulario inline */}
        {showForm && (
          <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Método de emisión</label>
                <select
                  value={form.emissionMethod}
                  onChange={(e) => setForm({ ...form, emissionMethod: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Precio Total (S/)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.totalPrice}
                  onChange={(e) => setForm({ ...form, totalPrice: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Comprobantes/mes</label>
                <input
                  type="number" min="-1"
                  value={form.maxInvoicesPerMonth}
                  onChange={(e) => setForm({ ...form, maxInvoicesPerMonth: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-400 mt-0.5">-1 = ilimitado</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sucursales</label>
                <input
                  type="number" min="1"
                  value={form.maxBranches}
                  onChange={(e) => setForm({ ...form, maxBranches: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox" checked={form.includesIgv}
                  onChange={(e) => setForm({ ...form, includesIgv: e.target.checked })}
                  className="w-4 h-4 text-primary-600 rounded"
                />
                Precio incluye IGV (18%)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox" checked={form.sunatIntegration}
                  onChange={(e) => setForm({ ...form, sunatIntegration: e.target.checked })}
                  className="w-4 h-4 text-primary-600 rounded"
                />
                Integración SUNAT
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox" checked={form.multiUser}
                  onChange={(e) => setForm({ ...form, multiUser: e.target.checked })}
                  className="w-4 h-4 text-primary-600 rounded"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {form.months > 0 && form.totalPrice > 0 && (
              <div className="text-xs text-gray-700 space-y-0.5">
                <p>Precio por mes: S/ {(parseFloat(form.totalPrice) / parseInt(form.months)).toFixed(2)}</p>
                {form.includesIgv ? (
                  <p>Desglose: Base S/ {(parseFloat(form.totalPrice) / 1.18).toFixed(2)} + IGV S/ {(parseFloat(form.totalPrice) - parseFloat(form.totalPrice) / 1.18).toFixed(2)} = Total S/ {parseFloat(form.totalPrice).toFixed(2)}</p>
                ) : (
                  <p>Con IGV: S/ {parseFloat(form.totalPrice).toFixed(2)} + IGV S/ {(parseFloat(form.totalPrice) * 0.18).toFixed(2)} = Total S/ {(parseFloat(form.totalPrice) * 1.18).toFixed(2)}</p>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingPlan ? 'Actualizar' : 'Crear'}
              </button>
              <button onClick={resetForm} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
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
                className="bg-white rounded-lg border border-gray-200 p-3 sm:p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate flex-1 mr-2">{plan.name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-900 flex-shrink-0">
                    Custom
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-500">Precio total</span>
                    <div className="text-right">
                      <span className="font-semibold text-gray-700">S/ {plan.totalPrice?.toFixed?.(2) || plan.totalPrice}</span>
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${plan.includesIgv ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-600'}`}>
                        {plan.includesIgv ? 'Inc. IGV' : '+ IGV'}
                      </span>
                    </div>
                  </div>
                  {plan.includesIgv ? (
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Desglose</span>
                      <span>Base S/ {(plan.totalPrice / 1.18).toFixed(2)} + IGV S/ {(plan.totalPrice - plan.totalPrice / 1.18).toFixed(2)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Con IGV</span>
                      <span>S/ {(plan.totalPrice * 1.18).toFixed(2)}</span>
                    </div>
                  )}
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

                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => openEdit(key, plan)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
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
      <div className="flex items-center gap-2 text-gray-700 bg-gray-50 p-4 rounded-lg">
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
              <Users className="w-5 h-5 text-primary-600" />
              <div>
                <p className="font-medium text-gray-900">Nuevo usuario registrado</p>
                <p className="text-sm text-gray-500">Mostrar notificación cuando un nuevo usuario se registra</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.notifyOnNewUser !== false}
              onChange={e => onChange('notifyOnNewUser', e.target.checked)}
              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-gray-700" />
              <div>
                <p className="font-medium text-gray-900">Nuevo pago recibido</p>
                <p className="text-sm text-gray-500">Mostrar notificación cuando se registra un pago</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.notifyOnPayment !== false}
              onChange={e => onChange('notifyOnPayment', e.target.checked)}
              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-gray-700" />
              <div>
                <p className="font-medium text-gray-900">Suscripción por vencer</p>
                <p className="text-sm text-gray-500">Mostrar alertas de suscripciones próximas a vencer</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.notifyOnExpiring !== false}
              onChange={e => onChange('notifyOnExpiring', e.target.checked)}
              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
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
              className="mt-2 block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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

function ExceptionsList({ exceptions, onChange }) {
  const [inputId, setInputId] = useState('')
  const [businessNames, setBusinessNames] = useState({})

  useEffect(() => {
    if (exceptions.length === 0) return
    const loadNames = async () => {
      const names = {}
      for (const id of exceptions) {
        if (businessNames[id]) continue
        try {
          const snap = await getDoc(doc(db, 'businesses', id))
          if (snap.exists()) {
            names[id] = snap.data().businessName || snap.data().name || id
          } else {
            names[id] = id + ' (no encontrado)'
          }
        } catch { names[id] = id }
      }
      if (Object.keys(names).length > 0) setBusinessNames(prev => ({ ...prev, ...names }))
    }
    loadNames()
  }, [exceptions])

  const addException = () => {
    const id = inputId.trim()
    if (!id || exceptions.includes(id)) return
    onChange([...exceptions, id])
    setInputId('')
  }

  const removeException = (id) => {
    onChange(exceptions.filter(e => e !== id))
    setBusinessNames(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <p className="font-medium text-gray-900 mb-1">Excepciones a la pausa</p>
      <p className="text-sm text-gray-500 mb-3">Negocios con IGV reducido que SÍ pueden enviar a SUNAT (ej: ya compraron comprobantes)</p>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={inputId}
          onChange={e => setInputId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addException()}
          placeholder="Business ID"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={addException}
          className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>
      {exceptions.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No hay excepciones</p>
      ) : (
        <div className="space-y-2">
          {exceptions.map(id => (
            <div key={id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-800">{businessNames[id] || 'Cargando...'}</p>
                <p className="text-xs text-gray-400 font-mono">{id}</p>
              </div>
              <button onClick={() => removeException(id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
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

        // Buscar productos con igvRate = 10 en TODOS los negocios
        const productsQuery = query(colRef(db, 'businesses', bizDoc.id, 'products'), where('igvRate', '==', 10))
        const productsSnap = await getDocsSnap(productsQuery)
        if (productsSnap.empty) continue

        const tc = bizData.emissionConfig?.taxConfig
        results.push({
          businessId: bizDoc.id,
          businessName: bizData.razonSocial || bizData.businessName || bizDoc.id,
          configIgv: tc?.igvRate ?? 18,
          taxType: tc?.taxType || 'standard',
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
              <Globe className="w-5 h-5 text-gray-700" />
              <div>
                <p className="font-medium text-gray-900">Permitir nuevos registros</p>
                <p className="text-sm text-gray-500">Permitir que nuevos usuarios se registren en la plataforma</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.allowNewRegistrations}
              onChange={e => onChange('allowNewRegistrations', e.target.checked)}
              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
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

          <label className={`flex items-center justify-between p-4 rounded-lg cursor-pointer ${settings.pauseSunatRestaurants ? 'bg-gray-50 hover:bg-gray-100 border border-gray-300' : 'bg-gray-50 hover:bg-gray-100'}`}>
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-gray-700" />
              <div>
                <p className="font-medium text-gray-900">Pausar envío de facturas a SUNAT (IGV 10.5%)</p>
                <p className="text-sm text-gray-500">Suspende el envío automático de facturas a SUNAT para negocios con IGV reducido (Ley 31556). Las boletas se envían normalmente. Las facturas se generan pero quedan pendientes de envío.</p>
                {settings.pauseSunatRestaurants && (
                  <p className="text-xs text-gray-700 font-medium mt-1">ACTIVO: Las facturas de negocios con IGV 10.5% NO se envían automáticamente a SUNAT. Las boletas SÍ se envían.</p>
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.pauseSunatRestaurants}
              onChange={e => onChange('pauseSunatRestaurants', e.target.checked)}
              className="w-5 h-5 text-gray-700 rounded focus:ring-primary-500"
            />
          </label>

          {/* Excepciones a la pausa SUNAT */}
          {settings.pauseSunatRestaurants && (
            <ExceptionsList
              exceptions={settings.pauseSunatExceptions || []}
              onChange={(list) => onChange('pauseSunatExceptions', list)}
            />
          )}

          {/* Detectar productos IGV 10% → 10.5% */}
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Productos con IGV 10% (deben ser 10.5%)</p>
                <p className="text-sm text-gray-500">Detecta negocios con IGV reducido cuyos productos aún tienen 10% guardado</p>
              </div>
              <button
                onClick={scanProducts}
                disabled={scanning}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {scanning ? 'Escaneando...' : 'Escanear'}
              </button>
            </div>

            {/* Resultados del escaneo */}
            {scanResult !== null && (
              <div className="mt-3 p-3 bg-white rounded-lg border text-sm max-h-80 overflow-y-auto">
                {scanResult.length === 0 ? (
                  <p className="text-gray-700 font-medium">Todo correcto. No hay productos con IGV 10%.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-900">
                        {scanResult.reduce((sum, r) => sum + r.products.length, 0)} productos en {scanResult.length} negocios
                      </p>
                      <button
                        onClick={fixAll}
                        disabled={migrating}
                        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-xs font-medium"
                      >
                        {migrating ? 'Corrigiendo...' : 'Corregir todos'}
                      </button>
                    </div>
                    {scanResult.map(biz => (
                      <div key={biz.businessId} className="mb-3 pb-3 border-b last:border-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-800">{biz.businessName}</p>
                            <p className="text-xs text-gray-500">Config actual: IGV {biz.configIgv}% ({biz.taxType}) — {biz.products.length} productos con 10%</p>
                          </div>
                          <button
                            onClick={() => fixProducts(biz.businessId, biz.products.map(p => p.id))}
                            disabled={migrating}
                            className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 disabled:opacity-50 shrink-0"
                          >
                            Corregir
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {biz.products.map(p => (
                            <span key={p.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{p.name}</span>
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
              <div className={`mt-3 p-3 rounded-lg text-sm ${migrateMsg.success ? 'bg-gray-50 text-gray-900' : 'bg-red-50 text-red-800'}`}>
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
              className="mt-2 block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
              <Database className="w-4 h-4 text-gray-500" />
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
          <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
            <div className="flex items-start gap-3">
              <Trash2 className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">Limpiar suscripciones de sub-usuarios</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Elimina suscripciones "trial" que fueron creadas incorrectamente para sub-usuarios.
                  Los sub-usuarios deben usar la suscripción de su negocio principal.
                </p>

                <button
                  onClick={cleanupSubUserSubscriptions}
                  disabled={cleaning}
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
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
                  <div className={`mt-3 p-3 rounded-lg ${result.success ? 'bg-gray-100 text-gray-900' : 'chip-error'}`}>
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

          {/* Limpiar Cloudinary: borrar lo ya migrado a R2 (paso final del cierre, irreversible) */}
          <CloudinaryCleanupCard />

          {/* Inventario para migración a Cloudflare R2 (solo lectura, no modifica nada) */}
          <CloudinaryInventoryCard />

          {/* Migración Cloudinary → Cloudflare R2, un negocio a la vez (piloto) */}
          <R2MigrationCard />

          {/* Migración de credenciales SUNAT a subcolección protegida (cierre de exposición pública) */}
          <EmissionSecretsMigrationCard />
          <CodigoClienteCard />
          <RubroSugeridoCard />

          {/* Info */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center gap-2 text-gray-900">
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

function formatBytes(b) {
  if (!b || b < 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0; let n = b
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 ? 2 : 1)} ${u[i]}`
}

// Dispara la Cloud Function migrateEmissionSecrets (admin-only) que mueve el
// certificado/claves SUNAT/QPse del doc público a /businesses/{id}/secrets/emission.
// Orden: Probar (dry-run) → Copiar → (deploy del cliente) → Borrar del doc público.
/**
 * Código de cliente: numera de una vez las cuentas que ya existen, por orden
 * de alta (la más antigua es la 1000001). Las nuevas se numeran solas al
 * nacer (trigger `asignarCodigoCliente`). Primero "Simular" para ver cuántas
 * y cuáles; "Numerar" recién cuando el reporte cuadre.
 */
function CodigoClienteCard() {
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const URL = 'https://us-central1-cobrify-395fe.cloudfunctions.net/numerarClientes'

  async function run(mode) {
    if (mode === 'real' && !window.confirm('¿Numerar todas las cuentas que todavía no tienen código? El número se asigna una sola vez y no se cambia después.')) return
    setBusy(mode)
    setResult(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch(URL + (mode === 'dry' ? '?dryRun=1' : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({}),
      })
      setResult(await res.json())
    } catch (e) {
      setResult({ success: false, error: e.message })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <div className="flex items-start gap-3">
        <Hash className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Códigos de cliente</h4>
          <p className="text-sm text-gray-600 mt-1">
            Da a cada cuenta su código de cliente (desde <b>1000001</b>, por orden de alta). Se asigna una sola
            vez y no cambia. Las cuentas nuevas lo reciben solas al crearse; esto es solo para las que ya existen.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => run('dry')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-100 disabled:opacity-50">
              {busy === 'dry' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />} Simular
            </button>
            <button onClick={() => run('real')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {busy === 'real' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />} Numerar ahora
            </button>
          </div>
          {result && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-white border border-gray-200' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {result.success ? (
                <>
                  <p className="text-gray-800">
                    {result.dryRun ? 'Simulación: ' : 'Listo: '}
                    <b>{result.total}</b> cuentas en total ·{' '}
                    {result.dryRun
                      ? <><b>{result.yaNumerados}</b> ya tenían código · <b>{result.porNumerar}</b> por numerar{result.fechaDesdeAuth ? <> · <b>{result.fechaDesdeAuth}</b> con fecha tomada de Auth</> : null}{result.sinFechaDeAlta ? <> · <b>{result.sinFechaDeAlta}</b> sin fecha de alta (van al final)</> : null}</>
                      : <><b>{result.asignados}</b> numeradas · último código <b>{result.ultimoCodigo}</b></>}
                  </p>
                  {Array.isArray(result.muestra) && result.muestra.length > 0 && (
                    <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                      {result.muestra.map((m) => (
                        <li key={m.id}><span className="text-gray-400">{m.alta || 'sin fecha'}</span> · {m.nombre}{m.ruc ? ` · RUC ${m.ruc}` : ''}</li>
                      ))}
                      {result.dryRun && result.porNumerar > result.muestra.length && <li className="text-gray-400">… y {result.porNumerar - result.muestra.length} más</li>}
                    </ul>
                  )}
                </>
              ) : <p>{result.error || 'Error'}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Rubro sugerido. Propone el rubro de cada cuenta con lo que ya tenemos: el
 * modo de negocio, el nombre y, para las que no se dejan adivinar, lo que
 * venden. No consulta a nadie de afuera: es gratis.
 *
 * La versión anterior le preguntaba la actividad económica a SUNAT vía
 * apiperu.dev y devolvía 709 de 709 "sin datos": esa API no entrega el CIIU
 * por ningún endpoint, y cada intento gastaba un crédito. Ver el comentario
 * de `functions/src/data/clasificador.js`.
 *
 * Escribe solo `rubroSugerido`. El rubro de verdad (`rubro`) se confirma a
 * mano en la ficha del cliente: esto es para llegar ahí con la mayoría ya
 * resuelta, no para decidir por el dueño.
 */
function RubroSugeridoCard() {
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const [progreso, setProgreso] = useState(null)
  const [conProductos, setConProductos] = useState(true)

  /** Lee hasta 60 nombres de producto de una cuenta. Con eso sobra para votar. */
  async function nombresDeProductos(businessId) {
    try {
      const snap = await getDocs(query(collection(db, 'businesses', businessId, 'products'), limit(60)))
      return snap.docs.map((d) => d.data()?.name).filter(Boolean)
    } catch {
      return []
    }
  }

  /** De a 10 en paralelo: 700 cuentas de una sola vez ahoga al navegador. */
  async function enTandas(items, tam, fn, alAvanzar) {
    const salida = []
    for (let i = 0; i < items.length; i += tam) {
      salida.push(...await Promise.all(items.slice(i, i + tam).map(fn)))
      alAvanzar?.(Math.min(i + tam, items.length))
    }
    return salida
  }

  async function run(mode) {
    if (mode === 'save' && !window.confirm('¿Guardar el rubro sugerido en cada cuenta? No toca el rubro confirmado, solo la sugerencia.')) return
    setBusy(mode)
    setResult(null)
    setProgreso(null)
    try {
      // El nombre del negocio está repartido en tres colecciones según por
      // dónde se creó la cuenta: el reseller escribe `razonSocial`/`tradeName`
      // en businesses, el alta normal deja `businessName` en users, y
      // subscriptions guarda su propia copia. Leer solo businesses dejaba
      // decenas de cuentas "sin nombre" que sí lo tienen. Es la misma cadena
      // que usa el listado de Admin > Usuarios.
      const [snap, usersSnap, subsSnap] = await Promise.all([
        getDocs(collection(db, 'businesses')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'subscriptions')),
      ])
      const porId = (s) => new Map(s.docs.map((d) => [d.id, d.data()]))
      const usuarios = porId(usersSnap)
      const suscripciones = porId(subsSnap)

      // Primera pasada: nombre y modo. Es instantánea y resuelve la mayoría.
      const cuentas = snap.docs.map((d) => {
        const b = d.data()
        const u = usuarios.get(d.id) || {}
        const sub = suscripciones.get(d.id) || {}
        const nombre = [b.razonSocial, b.tradeName, b.businessName, b.nombreComercial, b.name,
                        u.businessName, u.razonSocial, sub.businessName]
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(' · ')
        const base = { nombre, modo: b.businessMode, actividadSunat: b.actividadSunat, estacionServicio: b.serviceStationConfig?.enabled === true }
        // `nombre` y `correo` van también aquí afuera: el reporte los lee de
        // este nivel, y tenerlos solo dentro de `base` hacía que la lista de
        // sin clasificar saliera entera como "(cuenta sin nombre)".
        return {
          id: d.id,
          nombre,
          correo: u.email || sub.email || b.email || '',
          ruc: String(b.ruc || u.ruc || '').trim(),
          rubroSugerido: b.rubroSugerido || null,
          base,
          ...sugerirRubroDeCuenta(base),
        }
      })

      // Segunda pasada: solo las que quedaron sin rubro o con una suposición.
      // Al resto no hay para qué leerle el inventario.
      let mirados = 0
      if (conProductos) {
        const dudosas = cuentas.filter((c) => !c.rubro || c.motivo === 'modo-supuesto' || c.motivo === 'nombre-generico')
        mirados = dudosas.length
        setProgreso({ hecho: 0, total: dudosas.length })
        await enTandas(dudosas, 10, async (c) => {
          const productos = await nombresDeProductos(c.id)
          c.cuantosProductos = productos.length
          c.ejemplos = productos.slice(0, 4)
          Object.assign(c, sugerirRubroDeCuenta({ ...c.base, productos }))
        }, (hecho) => setProgreso({ hecho, total: dudosas.length }))
        setProgreso(null)
      }

      const cuenta = { total: cuentas.length, sugeridos: {}, motivos: {}, sinClasificar: 0, guardadas: 0, mirados }
      // Las que quedan sin rubro se parten en dos, porque no tienen arreglo
      // parecido: al RUC 10 (persona natural) la razón social ES el nombre de
      // la persona y ningún patrón lo va a sacar; el RUC 20 sin pistas sí se
      // rescata agregando patrones al catálogo.
      const huerfanas = { persona: 0, empresa: 0, sinRuc: 0 }
      // ¿El techo es que falta vocabulario o que la cuenta no vendió nunca?
      // Sin esto uno se pone a inventar patrones para inventarios vacíos.
      const inventario = { vacio: 0, pocos: 0, sinMayoria: 0 }
      // Qué venden las que sí tienen inventario y aun así no se dejan
      // clasificar. Es lo único que hace falta para ampliar el vocabulario.
      const muestraInventarios = []
      const sinPistas = []
      const cambios = []

      for (const c of cuentas) {
        if (c.rubro) {
          cuenta.sugeridos[c.rubro] = (cuenta.sugeridos[c.rubro] || 0) + 1
          cuenta.motivos[c.motivo] = (cuenta.motivos[c.motivo] || 0) + 1
        } else {
          cuenta.sinClasificar += 1
          if (c.cuantosProductos === 0) inventario.vacio += 1
          else if (c.cuantosProductos < 3) inventario.pocos += 1
          else if (c.cuantosProductos >= 3) {
            inventario.sinMayoria += 1
            if (muestraInventarios.length < 14) {
              muestraInventarios.push({ nombre: c.nombre || c.correo || c.id, productos: c.ejemplos })
            }
          }
          if (c.ruc.startsWith('10')) huerfanas.persona += 1
          else if (c.ruc.startsWith('20')) {
            huerfanas.empresa += 1
            if (sinPistas.length < 25) sinPistas.push(c.nombre || `sin nombre · ${c.correo || c.id}`)
          } else huerfanas.sinRuc += 1
        }
        if (c.rubroSugerido !== c.rubro) cambios.push({ id: c.id, rubro: c.rubro })
      }

      if (mode === 'save' && cambios.length) {
        // De a 400 por lote: el tope de Firestore es 500 operaciones.
        for (let i = 0; i < cambios.length; i += 400) {
          const lote = writeBatch(db)
          for (const c of cambios.slice(i, i + 400)) {
            lote.update(doc(db, 'businesses', c.id), { rubroSugerido: c.rubro, rubroSugeridoEn: new Date() })
          }
          await lote.commit()
          cuenta.guardadas += Math.min(400, cambios.length - i)
        }
      }

      setResult({ success: true, mode, porGuardar: cambios.length, sinPistas, huerfanas, inventario, muestraInventarios, ...cuenta })
    } catch (e) {
      setResult({ success: false, error: e.message })
    } finally {
      setBusy('')
      setProgreso(null)
    }
  }

  const etiquetaMotivo = {
    nombre: 'por el nombre',
    modo: 'por el modo (solo admite ese rubro)',
    productos: 'por lo que venden',
    'nombre-generico': 'por una palabra genérica del nombre (flojo)',
    'modo-supuesto': 'ASUMIDOS por el modo, sin más pistas',
    grifo: 'por tener el modo grifo prendido',
    sunat: 'por la actividad de SUNAT',
  }

  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <div className="flex items-start gap-3">
        <Tag className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Rubro sugerido</h4>
          <p className="text-sm text-gray-600 mt-1">
            Propone el rubro de cada cuenta leyendo el <b>nombre del negocio</b> y su modo. No consulta SUNAT
            ni gasta créditos: es instantáneo. <b>No cambia el rubro confirmado</b>, solo deja la sugerencia
            para revisarla en la ficha.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => run('dry')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-100 disabled:opacity-50">
              {busy === 'dry' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />} Simular
            </button>
            <button onClick={() => run('save')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {busy === 'save' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />} Guardar sugerencias
            </button>
          </div>
          {progreso && (
            <p className="mt-2 text-sm text-gray-600">
              <RefreshCw className="inline w-4 h-4 animate-spin mr-1" />
              Revisando inventarios: {progreso.hecho} de {progreso.total}…
            </p>
          )}
          {result && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-white border border-gray-200' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {result.success ? (
                <>
                  <p className="text-gray-800">
                    {result.mode === 'dry' ? 'Simulación: ' : 'Listo: '}
                    <b>{result.total}</b> cuentas · <b>{result.total - result.sinClasificar}</b> con rubro sugerido ·{' '}
                    <b>{result.sinClasificar}</b> sin clasificar
                    {result.mode === 'dry'
                      ? <> · <b>{result.porGuardar}</b> por guardar</>
                      : <> · <b>{result.guardadas}</b> guardadas</>}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {Object.entries(result.motivos).map(([m, n]) => `${n} ${etiquetaMotivo[m] || m}`).join(' · ')}
                  </p>
                  <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                    {Object.entries(result.sugeridos).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                      <li key={id}><b>{n}</b> · {nombreRubro(id)} <span className="text-gray-400">({id})</span></li>
                    ))}
                  </ul>
                  {result.sinClasificar > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-700">
                        Sin clasificar: <b>{result.huerfanas.persona}</b> personas naturales (RUC 10, la razón social
                        es el nombre de la persona: no hay patrón que valga) · <b>{result.huerfanas.empresa}</b> empresas
                        · <b>{result.huerfanas.sinRuc}</b> sin RUC.
                      </p>
                      {result.mirados > 0 && (
                        <p className="mt-1 text-xs text-gray-700">
                          Y por inventario: <b>{result.inventario.vacio}</b> nunca cargaron un producto ·{' '}
                          <b>{result.inventario.pocos}</b> tienen menos de tres ·{' '}
                          <b>{result.inventario.sinMayoria}</b> sí venden pero el catálogo no reconoce lo suficiente
                          (esas son las que se arreglan con más patrones).
                        </p>
                      )}
                      {result.muestraInventarios?.length > 0 && (
                        <>
                          <p className="mt-3 text-xs text-gray-500">
                            Qué venden las que tienen inventario y aun así no se dejan clasificar. Esto es lo que sirve para
                            ampliar el vocabulario:
                          </p>
                          <ul className="mt-1 text-xs text-gray-600 space-y-1">
                            {result.muestraInventarios.map((m, i) => (
                              <li key={i}>
                                <span className="text-gray-400">{m.nombre}</span><br />
                                {m.productos.join(' · ')}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {result.sinPistas.length > 0 && (
                        <>
                          <p className="mt-3 text-xs text-gray-500">
                            Empresas cuyo nombre no dice a qué se dedican. Si aquí ves un patrón que falta, se agrega al catálogo:
                          </p>
                          <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
                            {result.sinPistas.map((n, i) => <li key={i}>· {n}</li>)}
                            {result.huerfanas.empresa > result.sinPistas.length && (
                              <li className="text-gray-400">… y {result.huerfanas.empresa - result.sinPistas.length} más</li>
                            )}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : <p>{result.error || 'Error'}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmissionSecretsMigrationCard() {
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const [businessId, setBusinessId] = useState('')

  const MIGRATE_URL = 'https://us-central1-cobrify-395fe.cloudfunctions.net/migrateEmissionSecrets'

  async function run(mode) {
    if (mode === 'delete' && !window.confirm('¿Borrar las credenciales del doc público? Hacelo SOLO después de desplegar el cliente que lee del subcolección.')) return
    setBusy(mode)
    setResult(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const body = {}
      const v = businessId.trim()
      if (v) { if (v.includes('@')) body.email = v; else body.businessId = v }
      if (mode === 'dryRun') body.dryRun = true
      if (mode === 'delete') body.deleteTopLevel = true
      const res = await fetch(MIGRATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify(body),
      })
      setResult(await res.json())
    } catch (e) {
      setResult({ success: false, error: e.message })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="bg-red-50 rounded-lg p-5 border border-red-200">
      <div className="flex items-start gap-3">
        <Shield className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Migrar credenciales SUNAT a subcolección protegida</h4>
          <p className="text-sm text-gray-600 mt-1">
            Mueve el certificado .p12, claves SOL y credenciales QPse del doc público del negocio a la
            subcolección protegida <code>secrets/emission</code>. Orden: <b>Probar</b> → <b>Copiar</b> →
            (tras el deploy del cliente) <b>Borrar del doc público</b>.
          </p>
          <input
            type="text"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            placeholder="businessId o email (opcional: para probar un solo negocio)"
            className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => run('dryRun')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
              {busy === 'dryRun' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />} Probar (dry-run)
            </button>
            <button onClick={() => run('copy')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {busy === 'copy' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Copiar al subcolección
            </button>
            <button onClick={() => run('delete')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {busy === 'delete' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Borrar del doc público
            </button>
          </div>
          {result && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-gray-100 text-gray-900' : 'chip-error'}`}>
              <p className="font-medium">{result.success ? `OK (${result.mode})` : `Error: ${result.error}`}</p>
              {result.stats && (
                <p className="mt-1">Total: {result.stats.total} · con secretos: {result.stats.withSecrets} · copiados: {result.stats.copied} · borrados: {result.stats.deleted} · sin secretos: {result.stats.skipped}</p>
              )}
              {result.details && (
                <pre className="mt-2 text-xs overflow-auto max-h-40">{JSON.stringify(result.details, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CloudinaryCleanupCard() {
  const [scanning, setScanning] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [cleanResult, setCleanResult] = useState(null)
  const [error, setError] = useState(null)

  async function runDryRun() {
    setScanning(true)
    setError(null)
    setScanResult(null)
    try {
      const fn = httpsCallable(functions, 'cleanupOrphanedCloudinaryAssets', { timeout: 540000 })
      const r = await fn({ dryRun: true })
      setScanResult(r.data)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setScanning(false)
    }
  }

  async function runCleanup() {
    if (!confirm(
      'Esto va a BORRAR de Cloudinary todos los assets que ya no estén referenciados ' +
      'desde Firestore. Es irreversible.\n\n' +
      'Solo apretá esto cuando TODOS los negocios estén migrados a Cloudflare R2 y verificados.\n\n' +
      '¿Confirmar?'
    )) return

    setCleaning(true)
    setError(null)
    setCleanResult(null)
    try {
      const fn = httpsCallable(functions, 'cleanupOrphanedCloudinaryAssets', { timeout: 540000 })
      const r = await fn({ dryRun: false })
      setCleanResult(r.data)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="bg-red-50 rounded-lg p-5 border border-red-200">
      <div className="flex items-start gap-3">
        <Trash2 className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Limpiar Cloudinary · borrar lo ya migrado a R2</h4>
          <p className="text-sm text-gray-600 mt-1">
            Borra de Cloudinary los assets del folder <code>cobrify/</code> que ya no
            están referenciados desde Firestore (lo que ya migraste a Cloudflare R2).
            Solo correr <strong>cuando TODOS los negocios estén migrados a R2 y verificados</strong>.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Siempre apretá primero "Escanear (dry run)" para ver cuántos assets serían
            borrados y cuántos GB liberarías, sin tocar nada.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={runDryRun}
              disabled={scanning || cleaning}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {scanning ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Escaneando...</>
              ) : (
                <><Info className="w-4 h-4" /> Escanear (dry run)</>
              )}
            </button>
            <button
              onClick={runCleanup}
              disabled={scanning || cleaning}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {cleaning ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Limpiando...</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Borrar huérfanos</>
              )}
            </button>
          </div>

          {scanResult && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-red-200 text-sm space-y-1">
              <p><strong>URLs vivas en Firestore:</strong> {scanResult.liveUrlsCollected}</p>
              <p><strong>Assets en Cloudinary:</strong> {scanResult.cloudinaryAssetsScanned}</p>
              <p><strong>Huérfanos (a borrar):</strong> {scanResult.orphansFound}</p>
              <p><strong>Storage que se liberaría:</strong> {formatBytes(scanResult.bytesFreed)}</p>
              {scanResult.sampleOrphans?.length > 0 && (
                <details className="text-xs text-gray-600 mt-1">
                  <summary className="cursor-pointer">Ver muestra</summary>
                  <ul className="mt-1 space-y-0.5">
                    {scanResult.sampleOrphans.map((o, i) => (
                      <li key={i} className="truncate">
                        • {o.publicId} ({o.format}, {formatBytes(o.bytes)})
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {cleanResult && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm space-y-1">
              <p className="font-medium text-gray-900">
                {cleanResult.doneAt ? '✓ Cleanup completado' : 'Cleanup en progreso'}
              </p>
              <p>Borrados: <strong>{cleanResult.orphansDeleted}</strong> de {cleanResult.orphansFound} huérfanos</p>
              <p>Storage liberado: <strong>{formatBytes(cleanResult.bytesFreed)}</strong></p>
              {cleanResult.errors > 0 && (
                <p className="text-gray-700">⚠ Errores: {cleanResult.errors} (revisá los logs)</p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CloudinaryInventoryCard() {
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function runInventory() {
    setAnalyzing(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      const { analyzeCloudinaryAssets } = await import('@/utils/cloudinary')
      const r = await analyzeCloudinaryAssets((p) => setProgress(p))
      setResult(r)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setAnalyzing(false)
      setProgress(null)
    }
  }

  // Candidatos a piloto: negocios con assets en Cloudinary, de menor a mayor.
  const candidates = result?.perBusiness?.filter(b => b.cloudinaryImages > 0) || []

  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <div className="flex items-start gap-3">
        <ImageIcon className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Inventario Cloudinary → Cloudflare R2 (solo lectura)</h4>
          <p className="text-sm text-gray-600 mt-1">
            Cuenta cuántas imágenes de <code className="mx-1">res.cloudinary.com</code>
            usa cada negocio (productos + logos/portadas), para elegir el negocio más chico
            como <strong>piloto</strong> de la migración a R2. No descarga, sube ni borra nada.
          </p>

          <div className="mt-3">
            <button
              onClick={runInventory}
              disabled={analyzing}
              className="flex items-center gap-2 px-4 py-2 border border-primary-600 text-gray-700 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {analyzing ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Analizando...</>
              ) : (
                <><Info className="w-4 h-4" /> Analizar inventario (read-only)</>
              )}
            </button>
          </div>

          {progress && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 text-sm">
              <p>
                <strong>Analizando {progress.businessIndex} / {progress.totalBusinesses}:</strong>{' '}
                <span className="text-gray-700">{progress.businessName}</span>
              </p>
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {result && !analyzing && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 text-sm space-y-1">
              <p className="font-medium text-gray-900">Resultado</p>
              <p>Negocios analizados: <strong>{result.totalBusinesses}</strong></p>
              <p>Negocios con imágenes en Cloudinary: <strong>{result.businessesWithCloudinary}</strong></p>
              <p>Imágenes en Cloudinary (total): <strong>{result.totalCloudinaryImages}</strong></p>
              <p className="text-gray-600">
                (productos: {result.totalProductImages} · logos/portadas: {result.totalBusinessImages})
              </p>

              {candidates.length > 0 ? (
                <div className="mt-2">
                  <p className="font-medium text-gray-900">Candidatos a piloto (de menor a mayor):</p>
                  <div className="mt-1 max-h-72 overflow-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 font-medium text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="text-left px-2 py-1">Negocio</th>
                          <th className="text-right px-2 py-1">Cloudinary</th>
                          <th className="text-right px-2 py-1">Productos</th>
                          <th className="text-right px-2 py-1">Logos/portadas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {candidates.map((b) => (
                          <tr key={b.businessId} className="hover:bg-gray-50">
                            <td className="px-2 py-1">
                              <span className="text-gray-900">{b.businessName}</span>
                              {b.failed && <span className="text-red-600"> (error)</span>}
                              <div className="text-gray-400">{b.businessId}</div>
                            </td>
                            <td className="text-right px-2 py-1 font-medium">{b.cloudinaryImages}</td>
                            <td className="text-right px-2 py-1">{b.productImages}</td>
                            <td className="text-right px-2 py-1">{b.businessImages}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-gray-700 mt-1">✓ Ningún negocio tiene imágenes en Cloudinary.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function R2MigrationCard() {
  const CACHE_KEY = 'cobrify_r2_migration_status_v1'
  const [loadingList, setLoadingList] = useState(false)
  // items: [{ businessId, businessName, status, candidates, migrated, bytes, error }]
  //   status: 'idle' (sin escanear) | 'scanning' | 'pending' (faltan) | 'done' (migrada) | 'migrating' | 'error'
  const [items, setItems] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [scanningAll, setScanningAll] = useState(false)
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 })
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, name: '' })
  const [filter, setFilter] = useState('')
  const [globalError, setGlobalError] = useState(null)

  // --- Memoria liviana en el navegador (localStorage). Guardamos solo el
  // estado 'pending'/'done' para que al recargar la página el tablero recuerde
  // qué ya migraste, sin re-escanear todo. La VERDAD real siempre la da el
  // "escaneo" (dry run), que lee Firestore en vivo.
  function persist(list) {
    try {
      const map = {}
      for (const it of list || []) {
        if (it.status === 'done' || it.status === 'pending') {
          map[it.businessId] = {
            status: it.status,
            candidates: it.candidates ?? 0,
            migrated: it.migrated ?? 0,
            bytes: it.bytes ?? 0,
          }
        }
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(map))
    } catch { /* localStorage lleno o bloqueado: lo ignoramos */ }
  }

  function patchItem(businessId, patch) {
    setItems((prev) => {
      if (!prev) return prev
      const next = prev.map((it) => (it.businessId === businessId ? { ...it, ...patch } : it))
      persist(next)
      return next
    })
  }

  async function loadBusinesses() {
    setLoadingList(true)
    setGlobalError(null)
    try {
      const { collection, getDocs } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const snap = await getDocs(collection(db, 'users'))
      let cache = {}
      try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { cache = {} }
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => !u.ownerId) // solo dueños, no sub-usuarios
        .map((u) => {
          const c = cache[u.id] || {}
          return {
            businessId: u.id,
            businessName: u.businessName || u.razonSocial || u.email || u.id,
            status: c.status === 'done' || c.status === 'pending' ? c.status : 'idle',
            candidates: c.candidates ?? null,
            migrated: c.migrated ?? 0,
            bytes: c.bytes ?? 0,
            error: null,
          }
        })
        .sort((a, b) => a.businessName.localeCompare(b.businessName))
      setItems(list)
      setSelectedIds(new Set())
    } catch (e) {
      console.error(e)
      setGlobalError(e.message || String(e))
    } finally {
      setLoadingList(false)
    }
  }

  // Escanea UN negocio (dry run, solo lectura). Marca 'done' si no le falta
  // ninguna imagen, o 'pending' con cuántas faltan.
  async function scanOne(businessId) {
    patchItem(businessId, { status: 'scanning', error: null })
    try {
      const fn = httpsCallable(functions, 'migrateBusinessImagesToR2', { timeout: 540000 })
      const r = await fn({ businessId, dryRun: true })
      const candidates = r.data?.candidates ?? 0
      patchItem(businessId, { status: candidates > 0 ? 'pending' : 'done', candidates, error: null })
      return candidates
    } catch (e) {
      console.error(e)
      patchItem(businessId, { status: 'error', error: e.message || String(e) })
      return null
    }
  }

  // Escanea TODOS los que no estén ya migrados, de a 4 en paralelo.
  async function scanAll() {
    if (!items) return
    const targets = items
      .filter((it) => it.status !== 'done' && it.status !== 'migrating')
      .map((it) => it.businessId)
    if (targets.length === 0) return
    setScanningAll(true)
    setGlobalError(null)
    setScanProgress({ done: 0, total: targets.length })
    let done = 0
    let idx = 0
    const CONCURRENCY = 4
    const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
      while (idx < targets.length) {
        const my = idx++
        await scanOne(targets[my])
        done++
        setScanProgress({ done, total: targets.length })
      }
    })
    try {
      await Promise.all(workers)
    } finally {
      setScanningAll(false)
    }
  }

  // Migra UN negocio (copia real a R2 + reescribe URLs). Reutiliza el bucle
  // resumeFrom por si tiene muchas imágenes y no entran en una sola corrida.
  async function migrateOne(businessId) {
    patchItem(businessId, { status: 'migrating', error: null, migrated: 0, bytes: 0 })
    let cumulative = { migrated: 0, errors: 0, bytes: 0 }
    let resumeFrom = null
    let calls = 0
    const MAX_CALLS = 50
    try {
      const fn = httpsCallable(functions, 'migrateBusinessImagesToR2', { timeout: 540000 })
      do {
        calls++
        const r = await fn({ businessId, dryRun: false, resumeFrom })
        const d = r.data || {}
        cumulative.migrated += d.migrated || 0
        cumulative.errors += d.errors || 0
        cumulative.bytes += d.bytes || 0
        patchItem(businessId, { migrated: cumulative.migrated, bytes: cumulative.bytes })
        resumeFrom = d.resumeFrom
      } while (resumeFrom && calls < MAX_CALLS)

      if (cumulative.errors > 0) {
        patchItem(businessId, {
          status: 'error',
          error: `Migrado con ${cumulative.errors} error(es) — revisá los logs y volvé a escanear.`,
        })
        return false
      }
      patchItem(businessId, { status: 'done', candidates: 0, error: null })
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(businessId); return n })
      return true
    } catch (e) {
      console.error(e)
      patchItem(businessId, { status: 'error', error: e.message || String(e) })
      return false
    }
  }

  // Migra en tanda las seleccionadas (una tras otra, lo más seguro).
  async function migrateSelected() {
    if (!items) return
    const targets = items.filter(
      (it) => selectedIds.has(it.businessId) && it.status !== 'done' && it.status !== 'migrating'
    )
    if (targets.length === 0) return
    if (!confirm(
      `Vas a COPIAR a Cloudflare R2 las imágenes de ${targets.length} negocio(s) seleccionado(s) ` +
      `(las que hoy están en Cloudinary o Firebase Storage) y reescribir sus URLs en Firestore.\n\n` +
      `NO borra nada del origen (queda como respaldo) y guarda las URLs viejas por si hay que revertir.\n\n` +
      `¿Continuar?`
    )) return

    setBatchRunning(true)
    setGlobalError(null)
    setBatchProgress({ done: 0, total: targets.length, name: '' })
    try {
      for (let i = 0; i < targets.length; i++) {
        setBatchProgress({ done: i, total: targets.length, name: targets[i].businessName })
        await migrateOne(targets[i].businessId)
      }
      setBatchProgress({ done: targets.length, total: targets.length, name: '' })
    } finally {
      setBatchRunning(false)
    }
  }

  function toggleSelect(businessId) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(businessId)) n.delete(businessId)
      else n.add(businessId)
      return n
    })
  }

  // Selecciona las primeras N pendientes (para migrar "de a 2" o "de a 3").
  function selectFirst(n) {
    const ids = pendingItems
      .filter((it) => it.status !== 'migrating')
      .slice(0, n)
      .map((it) => it.businessId)
    setSelectedIds(new Set(ids))
  }

  function clearSelection() { setSelectedIds(new Set()) }

  // --- Derivados para pintar las dos columnas ---
  const q = filter.trim().toLowerCase()
  const filtered = (items || []).filter(
    (it) => !q || it.businessName.toLowerCase().includes(q) || it.businessId.toLowerCase().includes(q)
  )
  const pendingItems = filtered.filter((it) => it.status !== 'done')
  const doneItems = filtered.filter((it) => it.status === 'done')
  const selectedCount = pendingItems.filter((it) => selectedIds.has(it.businessId)).length
  const totalPending = (items || []).filter((it) => it.status !== 'done').length
  const totalDone = (items || []).filter((it) => it.status === 'done').length
  const anyBusy = (items || []).some((it) => it.status === 'migrating' || it.status === 'scanning')
  const busy = scanningAll || batchRunning || anyBusy

  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <div className="flex items-start gap-3">
        <ImageIcon className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900">Migrar imágenes a Cloudflare R2 (tablero por negocio)</h4>
          <p className="text-sm text-gray-600 mt-1">
            Copia las imágenes de cada negocio desde Cloudinary o Firebase Storage a R2 y reescribe
            las URLs en Firestore para servirlas sin costo de tráfico. <strong>No borra nada del
            origen</strong> y guarda un respaldo de las URLs viejas para poder revertir. Escaneá
            todos, migrá de a poco (uno, o varios seleccionados) y verificá que se vean bien.
          </p>

          {/* Paso 1: cargar negocios */}
          {!items && (
            <div className="mt-3">
              <button
                onClick={loadBusinesses}
                disabled={loadingList}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingList ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Cargando negocios...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Cargar lista de negocios</>
                )}
              </button>
            </div>
          )}

          {items && items.length === 0 && (
            <p className="mt-3 text-gray-600 text-sm">No se encontraron negocios.</p>
          )}

          {items && items.length > 0 && (
            <div className="mt-4 space-y-3">
              {/* Barra de herramientas */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={scanAll}
                  disabled={busy}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                  {scanningAll ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Escaneando {scanProgress.done}/{scanProgress.total}...</>
                  ) : (
                    <><Info className="w-4 h-4" /> Escanear pendientes</>
                  )}
                </button>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar negocio..."
                  className="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={loadBusinesses}
                  disabled={busy || loadingList}
                  title="Recargar la lista de negocios"
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Selección rápida + migrar seleccionadas */}
              <div className="flex flex-wrap items-center gap-2 p-2 bg-white rounded-lg border border-gray-200">
                <span className="text-sm text-gray-600">Seleccionar:</span>
                <button onClick={() => selectFirst(2)} disabled={busy} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">primeras 2</button>
                <button onClick={() => selectFirst(3)} disabled={busy} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">primeras 3</button>
                <button onClick={clearSelection} disabled={busy || selectedCount === 0} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">limpiar</button>
                <div className="flex-1" />
                <button
                  onClick={migrateSelected}
                  disabled={busy || selectedCount === 0}
                  className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm"
                >
                  {batchRunning ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Migrando {batchProgress.done}/{batchProgress.total}...</>
                  ) : (
                    <><ImageIcon className="w-4 h-4" /> Migrar seleccionadas ({selectedCount})</>
                  )}
                </button>
              </div>

              {batchRunning && batchProgress.name && (
                <p className="text-xs text-gray-600">Copiando <strong>{batchProgress.name}</strong>...</p>
              )}

              {/* Dos columnas */}
              <div className="grid md:grid-cols-2 gap-3">
                {/* Pendientes */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-100 text-gray-900 text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Pendientes</span>
                    <span className="text-gray-700">{totalPending}</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {pendingItems.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-gray-500 text-center">Nada pendiente {q ? 'con ese filtro' : '🎉'}</p>
                    ) : pendingItems.map((it) => (
                      <div key={it.businessId} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(it.businessId)}
                          onChange={() => toggleSelect(it.businessId)}
                          disabled={busy || it.status === 'migrating'}
                          className="flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-gray-900" title={it.businessName}>{it.businessName}</p>
                          <p className="text-xs">
                            {it.status === 'idle' && <span className="text-gray-400">sin escanear</span>}
                            {it.status === 'scanning' && <span className="text-gray-700">escaneando...</span>}
                            {it.status === 'pending' && <span className="text-gray-700">{it.candidates} imagen(es) a copiar</span>}
                            {it.status === 'migrating' && <span className="text-gray-700">copiando... ({it.migrated})</span>}
                            {it.status === 'error' && <span className="text-red-600" title={it.error}>error: {it.error}</span>}
                          </p>
                        </div>
                        <button
                          onClick={() => scanOne(it.businessId)}
                          disabled={busy || it.status === 'scanning' || it.status === 'migrating'}
                          title="Escanear (ver cuántas faltan)"
                          className="flex-shrink-0 px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => migrateOne(it.businessId)}
                          disabled={busy || it.status === 'migrating'}
                          title="Migrar este negocio a R2"
                          className="flex-shrink-0 px-2 py-1 text-xs rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40"
                        >
                          {it.status === 'migrating' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Migrar'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Migradas */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-100 text-gray-900 text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Migradas</span>
                    <span className="text-gray-700">{totalDone}</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {doneItems.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-gray-500 text-center">Todavía ninguna</p>
                    ) : doneItems.map((it) => (
                      <div key={it.businessId} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-gray-900" title={it.businessName}>{it.businessName}</p>
                          <p className="text-xs text-gray-500">
                            {it.migrated > 0 ? `${it.migrated} copiada(s) · ${formatBytes(it.bytes)}` : 'sin imágenes pendientes'}
                          </p>
                        </div>
                        <button
                          onClick={() => scanOne(it.businessId)}
                          disabled={busy}
                          title="Volver a revisar (por si subieron imágenes nuevas)"
                          className="flex-shrink-0 px-2 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Después de migrar un negocio, abrí su catálogo y verificá que las imágenes se vean
                igual (ya servidas desde R2). El original sigue en Cloudinary/Storage como respaldo
                hasta el cleanup. El tablero recuerda lo migrado aunque cierres la página.
              </p>
            </div>
          )}

          {globalError && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-800">
              {globalError}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
