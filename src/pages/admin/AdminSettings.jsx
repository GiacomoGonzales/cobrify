import React, { useState, useEffect } from 'react'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore'
import { PLANS } from '@/services/subscriptionService'
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
  Wrench
} from 'lucide-react'

export default function AdminSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState('plans')
  const [settings, setSettings] = useState({
    plans: {},
    notifications: {
      emailOnNewUser: true,
      emailOnPayment: true,
      emailOnExpiring: true,
      daysBeforeExpiry: 3
    },
    system: {
      maintenanceMode: false,
      allowNewRegistrations: true,
      defaultTrialDays: 7
    }
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    try {
      const settingsRef = doc(db, 'config', 'adminSettings')
      const settingsSnap = await getDoc(settingsRef)

      if (settingsSnap.exists()) {
        setSettings(prev => ({ ...prev, ...settingsSnap.data() }))
      }

      // Cargar planes actuales
      setSettings(prev => ({ ...prev, plans: { ...PLANS } }))
    } catch (error) {
      console.error('Error loading settings:', error)
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
        <div className="flex border-b border-gray-200">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeSection === section.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <section.icon className="w-4 h-4" />
              {section.label}
            </button>
          ))}

          <div className="flex-1" />

          <div className="flex items-center gap-2 p-2">
            {saved && (
              <span className="flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" /> Guardado
              </span>
            )}
            <button
              onClick={saveSettings}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Guardar
            </button>
          </div>
        </div>

        <div className="p-6">
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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-4 rounded-lg">
        <Info className="w-5 h-5 flex-shrink-0" />
        <p className="text-sm">
          Los planes se configuran en el código fuente (subscriptionService.js).
          Aquí puedes ver la configuración actual.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(plans).map(([key, plan]) => (
          <div
            key={key}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{plan.name}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                key === 'trial' || key === 'free'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {key === 'trial' || key === 'free' ? 'Gratuito' : 'Pago'}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Precio mensual
                </span>
                <span className="font-medium">S/ {plan.pricePerMonth || 0}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Límite documentos
                </span>
                <span className="font-medium">{plan.invoiceLimit || '∞'}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Sub-usuarios
                </span>
                <span className="font-medium">{plan.subUsersLimit || 0}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Período
                </span>
                <span className="font-medium">{plan.periodMonths || 1} mes(es)</span>
              </div>
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
          </div>
        ))}
      </div>
    </div>
  )
}

function NotificationsSection({ settings, onChange }) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Notificaciones por Email</h3>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-indigo-600" />
              <div>
                <p className="font-medium text-gray-900">Nuevo usuario registrado</p>
                <p className="text-sm text-gray-500">Recibir email cuando un nuevo usuario se registra</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.emailOnNewUser}
              onChange={e => onChange('emailOnNewUser', e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900">Nuevo pago recibido</p>
                <p className="text-sm text-gray-500">Recibir email cuando se registra un pago</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.emailOnPayment}
              onChange={e => onChange('emailOnPayment', e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-gray-900">Suscripción por vencer</p>
                <p className="text-sm text-gray-500">Recibir alertas de suscripciones próximas a vencer</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.emailOnExpiring}
              onChange={e => onChange('emailOnExpiring', e.target.checked)}
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
              value={settings.daysBeforeExpiry}
              onChange={e => onChange('daysBeforeExpiry', parseInt(e.target.value) || 3)}
              className="mt-2 block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Se mostrarán alertas para suscripciones que vencen en los próximos {settings.daysBeforeExpiry} días
            </p>
          </label>
        </div>
      </div>
    </div>
  )
}

function SystemSection({ settings, onChange }) {
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
