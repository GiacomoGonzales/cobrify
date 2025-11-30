import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Save,
  Loader2,
  CheckCircle,
  User,
  Calendar,
  Wallet,
  TrendingUp,
  Shield,
  Palette,
  Type,
  Eye
} from 'lucide-react'

// Colores predefinidos para elegir
const BRAND_COLORS = [
  { name: 'Esmeralda', value: '#10B981' },
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Púrpura', value: '#8B5CF6' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Naranja', value: '#F97316' },
  { name: 'Rojo', value: '#EF4444' },
  { name: 'Índigo', value: '#6366F1' },
  { name: 'Cyan', value: '#06B6D4' },
]

export default function ResellerSettings() {
  const { user, resellerData, refreshResellerData } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('empresa') // 'empresa' | 'branding'

  // Obtener el ID del reseller
  const resellerId = resellerData?.docId || user?.uid

  const [formData, setFormData] = useState({
    companyName: resellerData?.companyName || '',
    ruc: resellerData?.ruc || '',
    phone: resellerData?.phone || '',
    address: resellerData?.address || '',
    contactName: resellerData?.contactName || ''
  })

  const [brandingData, setBrandingData] = useState({
    brandName: resellerData?.brandName || resellerData?.companyName || '',
    brandColor: resellerData?.brandColor || '#10B981',
    brandTagline: resellerData?.brandTagline || ''
  })

  function handleChange(e) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setSaved(false)
  }

  function handleBrandingChange(e) {
    const { name, value } = e.target
    setBrandingData(prev => ({ ...prev, [name]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'resellers', resellerId), {
        ...formData,
        ...brandingData,
        updatedAt: Timestamp.now()
      })

      if (refreshResellerData) {
        await refreshResellerData()
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  function formatDate(date) {
    if (!date) return 'N/A'
    const d = date instanceof Date ? date : date.toDate?.()
    if (!d) return 'N/A'
    return d.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500">Gestiona los datos de tu cuenta de reseller</p>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Building2 className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{resellerData?.companyName || 'Mi Empresa'}</h2>
            <p className="text-gray-500">{user?.email}</p>
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
              <Shield className="w-3 h-3" />
              Reseller Activo
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-gray-100">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">S/ {(resellerData?.balance || 0).toFixed(2)}</p>
            <p className="text-xs text-gray-500">Saldo</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">S/ {(resellerData?.totalSpent || 0).toFixed(2)}</p>
            <p className="text-xs text-gray-500">Total gastado</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{((resellerData?.discount || 0.30) * 100).toFixed(0)}%</p>
            <p className="text-xs text-gray-500">Descuento</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{formatDate(resellerData?.createdAt)}</p>
            <p className="text-xs text-gray-500">Desde</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('empresa')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'empresa'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building2 className="w-4 h-4 inline mr-2" />
              Datos de Empresa
            </button>
            <button
              onClick={() => setActiveTab('branding')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'branding'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Palette className="w-4 h-4 inline mr-2" />
              Mi Marca (White-Label)
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'empresa' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de Empresa
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleChange}
                      placeholder="Mi Empresa SAC"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RUC
                  </label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      name="ruc"
                      value={formData.ruc}
                      onChange={handleChange}
                      placeholder="20123456789"
                      maxLength={11}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de Contacto
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      name="contactName"
                      value={formData.contactName}
                      onChange={handleChange}
                      placeholder="Juan Pérez"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="987654321"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dirección
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="Av. Principal 123, Lima"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Branding Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>White-Label:</strong> Personaliza la marca que verán tus clientes cuando usen la aplicación.
                  En lugar de "Cobrify", verán el nombre y colores de tu marca.
                </p>
              </div>

              {/* Brand Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de tu Marca
                </label>
                <p className="text-xs text-gray-500 mb-2">Este nombre verán tus clientes en lugar de "Cobrify"</p>
                <div className="relative">
                  <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    name="brandName"
                    value={brandingData.brandName}
                    onChange={handleBrandingChange}
                    placeholder="Mi Sistema de Facturación"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Brand Tagline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Eslogan (opcional)
                </label>
                <p className="text-xs text-gray-500 mb-2">Un texto corto que aparece debajo del nombre</p>
                <input
                  type="text"
                  name="brandTagline"
                  value={brandingData.brandTagline}
                  onChange={handleBrandingChange}
                  placeholder="Facturación fácil y rápida"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              {/* Brand Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color de tu Marca
                </label>
                <p className="text-xs text-gray-500 mb-2">Este color se usará en el menú lateral y acentos</p>
                <div className="flex flex-wrap gap-3">
                  {BRAND_COLORS.map(color => (
                    <button
                      key={color.value}
                      onClick={() => setBrandingData(prev => ({ ...prev, brandColor: color.value }))}
                      className={`w-10 h-10 rounded-lg border-2 transition-all ${
                        brandingData.brandColor === color.value
                          ? 'border-gray-900 scale-110'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandingData.brandColor}
                      onChange={(e) => setBrandingData(prev => ({ ...prev, brandColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg cursor-pointer"
                    />
                    <span className="text-xs text-gray-500">Personalizado</span>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <Eye className="w-4 h-4 inline mr-1" />
                  Vista Previa
                </label>
                <div
                  className="rounded-xl p-6 text-white"
                  style={{ background: `linear-gradient(135deg, ${brandingData.brandColor}, ${brandingData.brandColor}dd)` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                      <span className="text-2xl font-bold" style={{ color: brandingData.brandColor }}>
                        {brandingData.brandName?.charAt(0) || 'M'}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{brandingData.brandName || 'Mi Marca'}</h3>
                      {brandingData.brandTagline && (
                        <p className="text-sm opacity-80">{brandingData.brandTagline}</p>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Así se verá el menú lateral para tus clientes
                </p>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="pt-6 mt-6 border-t border-gray-200 flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar Cambios
                </>
              )}
            </button>

            {saved && (
              <span className="flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" />
                Guardado correctamente
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Account Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Detalles de Cuenta</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">Email</span>
            <span className="font-medium text-gray-900">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">ID de Reseller</span>
            <span className="font-mono text-sm text-gray-600">{user?.uid}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">Descuento asignado</span>
            <span className="font-medium text-emerald-600">{((resellerData?.discount || 0.30) * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-500">Estado de cuenta</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              Activo
            </span>
          </div>
        </div>
      </div>

      {/* Help */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
        <h3 className="font-semibold text-emerald-800 mb-2">¿Necesitas ayuda?</h3>
        <p className="text-sm text-emerald-700 mb-4">
          Si tienes preguntas sobre tu cuenta de reseller, descuentos especiales o necesitas soporte técnico,
          no dudes en contactarnos.
        </p>
        <a
          href="https://wa.me/51987654321?text=Hola,%20soy%20reseller%20y%20necesito%20ayuda"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
        >
          Contactar Soporte
        </a>
      </div>
    </div>
  )
}
