import React, { useState, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useBranding } from '@/contexts/BrandingContext'
import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  updateResellerBranding,
  uploadResellerLogo,
  PRESET_COLORS
} from '@/services/brandingService'
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
  Eye,
  Upload,
  Image,
  X,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Share2,
  FileText,
  DollarSign
} from 'lucide-react'

export default function ResellerSettings() {
  const { user, resellerData, refreshResellerData, loading: authLoading } = useAuth()
  const { refreshBranding } = useBranding()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('empresa') // 'empresa' | 'branding'
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingSocialImage, setUploadingSocialImage] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const fileInputRef = useRef(null)
  const socialImageInputRef = useRef(null)

  // Obtener el ID del reseller
  const resellerId = resellerData?.docId || user?.uid

  const [formData, setFormData] = useState({
    companyName: resellerData?.companyName || '',
    ruc: resellerData?.ruc || '',
    phone: resellerData?.phone || '',
    address: resellerData?.address || '',
    contactName: resellerData?.contactName || '',
    customDomain: resellerData?.customDomain || ''
  })

  const [brandingData, setBrandingData] = useState({
    companyName: resellerData?.branding?.companyName || resellerData?.companyName || '',
    logoUrl: resellerData?.branding?.logoUrl || null,
    socialImageUrl: resellerData?.branding?.socialImageUrl || null,
    primaryColor: resellerData?.branding?.primaryColor || '#10B981',
    secondaryColor: resellerData?.branding?.secondaryColor || '#059669',
    whatsapp: resellerData?.branding?.whatsapp || resellerData?.phone || '',
    description: resellerData?.branding?.description || '',
    // Precios de la landing page
    priceMonthly: resellerData?.branding?.priceMonthly ?? 19.90,
    priceSemester: resellerData?.branding?.priceSemester ?? 99.90,
    priceAnnual: resellerData?.branding?.priceAnnual ?? 149.90,
  })

  // Sincronizar formData y brandingData cuando resellerData se cargue
  React.useEffect(() => {
    if (resellerData) {
      setFormData({
        companyName: resellerData.companyName || '',
        ruc: resellerData.ruc || '',
        phone: resellerData.phone || '',
        address: resellerData.address || '',
        contactName: resellerData.contactName || '',
        customDomain: resellerData.customDomain || ''
      })
      setBrandingData({
        companyName: resellerData.branding?.companyName || resellerData.companyName || '',
        logoUrl: resellerData.branding?.logoUrl || null,
        socialImageUrl: resellerData.branding?.socialImageUrl || null,
        primaryColor: resellerData.branding?.primaryColor || '#10B981',
        secondaryColor: resellerData.branding?.secondaryColor || '#059669',
        whatsapp: resellerData.branding?.whatsapp || resellerData.phone || '',
        description: resellerData.branding?.description || '',
        // Precios de la landing page
        priceMonthly: resellerData.branding?.priceMonthly ?? 19.90,
        priceSemester: resellerData.branding?.priceSemester ?? 99.90,
        priceAnnual: resellerData.branding?.priceAnnual ?? 149.90,
      })
      setDataLoaded(true)
    }
  }, [resellerData])

  // Mostrar loading mientras se cargan los datos
  if (authLoading || !dataLoaded) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
          <p className="text-gray-500">Gestiona los datos de tu cuenta de reseller</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <p className="text-gray-500 text-sm">Cargando datos...</p>
          </div>
        </div>
      </div>
    )
  }

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

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen')
      return
    }

    // Validar tamaño (máx 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen debe ser menor a 2MB')
      return
    }

    setUploadingLogo(true)
    try {
      // Usar user.uid para storage (coincide con auth.uid en las reglas de Firebase Storage)
      const logoUrl = await uploadResellerLogo(user.uid, file)
      setBrandingData(prev => ({ ...prev, logoUrl }))
      setSaved(false)
    } catch (error) {
      console.error('Error uploading logo:', error)
      alert('Error al subir el logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  function removeLogo() {
    setBrandingData(prev => ({ ...prev, logoUrl: null }))
    setSaved(false)
  }

  async function handleSocialImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen')
      return
    }

    // Validar tamaño (máx 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen debe ser menor a 2MB')
      return
    }

    setUploadingSocialImage(true)
    try {
      // Usar la misma función pero con sufijo diferente para distinguir
      const socialImageUrl = await uploadResellerLogo(user.uid, file, 'social')
      setBrandingData(prev => ({ ...prev, socialImageUrl }))
      setSaved(false)
    } catch (error) {
      console.error('Error uploading social image:', error)
      alert('Error al subir la imagen')
    } finally {
      setUploadingSocialImage(false)
    }
  }

  function removeSocialImage() {
    setBrandingData(prev => ({ ...prev, socialImageUrl: null }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)

    // Debug: mostrar los IDs que estamos usando
    console.log('🔍 Saving reseller settings...')
    console.log('   user.uid:', user?.uid)
    console.log('   resellerData.docId:', resellerData?.docId)
    console.log('   resellerId used:', resellerId)
    console.log('   formData:', formData)
    console.log('   brandingData:', brandingData)

    try {
      // Guardar datos de empresa
      console.log('📝 Updating reseller document...')
      await updateDoc(doc(db, 'resellers', resellerId), {
        companyName: formData.companyName,
        ruc: formData.ruc,
        phone: formData.phone,
        address: formData.address,
        contactName: formData.contactName,
        customDomain: formData.customDomain?.toLowerCase().trim() || null,
        updatedAt: Timestamp.now()
      })
      console.log('✅ Reseller document updated')

      // Guardar branding
      console.log('🎨 Updating branding...')
      await updateResellerBranding(resellerId, brandingData)
      console.log('✅ Branding updated')

      if (refreshResellerData) {
        console.log('🔄 Refreshing reseller data...')
        await refreshResellerData()
      }

      // Refrescar branding en el contexto
      if (refreshBranding) {
        console.log('🔄 Refreshing branding context...')
        await refreshBranding()
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      console.log('✅ All saved successfully!')
    } catch (error) {
      console.error('❌ Error saving settings:', error)
      console.error('   Error code:', error.code)
      console.error('   Error message:', error.message)
      alert(`Error al guardar: ${error.message}`)
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
      month: 'short',
      year: 'numeric'
    })
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Calcular descuento correctamente
  const discount = resellerData?.discountOverride || resellerData?.discount || 0
  const discountPercent = discount < 1 ? discount * 100 : discount

  // URL de login para clientes (configurada por admin)
  const customDomainUrl = resellerData?.customDomain
    ? `https://${resellerData.customDomain}/login`
    : null
  const legacyLoginUrl = `${window.location.origin}/login?ref=${resellerId}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500">Gestiona los datos de tu cuenta de reseller</p>
      </div>

      {/* Layout de 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda - Info de cuenta */}
        <div className="lg:col-span-1 space-y-4">
          {/* Account Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-gray-900 truncate">{resellerData?.companyName || 'Mi Empresa'}</h2>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
              <Shield className="w-3 h-3" />
              Reseller Activo
            </span>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-900">S/ {(resellerData?.balance || 0).toFixed(2)}</p>
                <p className="text-xs text-gray-500">Saldo</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">{discountPercent.toFixed(0)}%</p>
                <p className="text-xs text-gray-500">Descuento</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-900">S/ {(resellerData?.totalSpent || 0).toFixed(0)}</p>
                <p className="text-xs text-gray-500">Invertido</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-sm font-medium text-gray-700">{formatDate(resellerData?.createdAt)}</p>
                <p className="text-xs text-gray-500">Miembro desde</p>
              </div>
            </div>
          </div>

          {/* Account Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Detalles de Cuenta</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-900 truncate ml-2 max-w-[140px]">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-gray-500">ID</span>
                <span className="font-mono text-xs text-gray-500 truncate ml-2 max-w-[140px]">{user?.uid?.slice(0, 12)}...</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-gray-500">Estado</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  <CheckCircle className="w-3 h-3" />
                  Activo
                </span>
              </div>
            </div>
          </div>

          {/* Links de Login para Clientes */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-blue-800 text-sm flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Links de Acceso para Clientes
            </h3>

            {/* Dominio personalizado (configurado por admin) */}
            {customDomainUrl ? (
              <div>
                <p className="text-xs text-green-700 mb-1.5 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Tu dominio personalizado:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customDomainUrl}
                    readOnly
                    className="flex-1 text-xs bg-white border border-green-200 rounded px-2 py-1.5 text-gray-600 font-medium"
                  />
                  <button
                    onClick={() => copyToClipboard(customDomainUrl)}
                    className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 flex items-center gap-1"
                  >
                    {copied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <p className="text-xs text-gray-600">
                  Aún no tienes un dominio personalizado configurado. Contacta al administrador para solicitar tu dominio propio.
                </p>
              </div>
            )}

            {/* Link legacy (siempre disponible como backup) */}
            <div className="pt-2 border-t border-blue-200">
              <p className="text-xs text-blue-600 mb-1.5">Link alternativo:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={legacyLoginUrl}
                  readOnly
                  className="flex-1 text-xs bg-white border border-blue-100 rounded px-2 py-1.5 text-gray-500"
                />
                <button
                  onClick={() => copyToClipboard(legacyLoginUrl)}
                  className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Help */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <h3 className="font-semibold text-emerald-800 mb-1 text-sm">¿Necesitas ayuda?</h3>
            <p className="text-xs text-emerald-700 mb-3">
              Contacta soporte para consultas sobre tu cuenta o descuentos especiales.
            </p>
            <a
              href="https://wa.me/51987654321?text=Hola,%20soy%20reseller%20y%20necesito%20ayuda"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs"
            >
              Contactar Soporte
            </a>
          </div>
        </div>

        {/* Columna Derecha - Formularios */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200">
            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="flex">
                <button
                  onClick={() => setActiveTab('empresa')}
                  className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'empresa'
                      ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Building2 className="w-4 h-4 inline mr-2" />
                  Datos de Empresa
                </button>
                <button
                  onClick={() => setActiveTab('branding')}
                  className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'branding'
                      ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Palette className="w-4 h-4 inline mr-2" />
                  Mi Marca (White-Label)
                </button>
              </nav>
            </div>

            <div className="p-5">
              {activeTab === 'empresa' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre de Empresa
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          name="companyName"
                          value={formData.companyName}
                          onChange={handleChange}
                          placeholder="Mi Empresa SAC"
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        RUC
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre de Contacto
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          name="contactName"
                          value={formData.contactName}
                          onChange={handleChange}
                          placeholder="Juan Pérez"
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Teléfono
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

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Dirección
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

                    {/* Dominio Personalizado */}
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Globe className="w-4 h-4 inline mr-1" />
                        Dominio Personalizado
                        <span className="text-xs text-gray-500 ml-1">(opcional)</span>
                      </label>
                      <div className="relative">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          name="customDomain"
                          value={formData.customDomain}
                          onChange={handleChange}
                          placeholder="facturacion.tuempresa.com"
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>
                      {formData.customDomain && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                          <strong className="flex items-center gap-1 mb-1">
                            <Globe className="w-3 h-3" />
                            Configuración DNS requerida:
                          </strong>
                          <ol className="list-decimal ml-4 space-y-1 text-amber-700">
                            <li>En tu proveedor de dominio, crea un registro <strong>CNAME</strong></li>
                            <li>Apunta <code className="bg-amber-100 px-1 rounded">{formData.customDomain}</code> → <code className="bg-amber-100 px-1 rounded">cname.vercel-dns.com</code></li>
                            <li>Espera 24-48 horas para la propagación DNS</li>
                            <li>Contacta soporte para activar el dominio en Vercel</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Columna izquierda - Configuración */}
                  <div className="space-y-5">
                    {/* Info */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-800">
                        <strong>Marca Blanca:</strong> Personaliza la marca que verán tus clientes en lugar de "Cobrify".
                      </p>
                    </div>

                    {/* Logo Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Logo de tu Marca
                      </label>
                      <p className="text-xs text-gray-500 mb-2">PNG o JPG, máx 2MB</p>

                      <div className="flex items-center gap-3">
                        {/* Logo Preview */}
                        <div className="relative flex-shrink-0">
                          {brandingData.logoUrl ? (
                            <div className="relative">
                              <img
                                src={brandingData.logoUrl}
                                alt="Logo"
                                className="w-16 h-16 rounded-lg object-cover border-2 border-gray-200"
                              />
                              <button
                                onClick={removeLogo}
                                className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                              <Image className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                        </div>

                        {/* Upload Button */}
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingLogo}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                          >
                            {uploadingLogo ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Subiendo...
                              </>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5" />
                                Subir
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Brand Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre de tu Marca
                      </label>
                      <div className="relative">
                        <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          name="companyName"
                          value={brandingData.companyName}
                          onChange={handleBrandingChange}
                          placeholder="Mi Sistema de Facturación"
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Descripción para Redes Sociales */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <FileText className="w-4 h-4 inline mr-1" />
                        Descripción para Redes Sociales
                      </label>
                      <textarea
                        name="description"
                        value={brandingData.description}
                        onChange={handleBrandingChange}
                        placeholder="Sistema de facturación electrónica para tu negocio..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Aparecerá cuando compartas tu link en WhatsApp, Facebook, etc.</p>
                    </div>

                    {/* Imagen para Redes Sociales */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Share2 className="w-4 h-4 inline mr-1" />
                        Imagen para Redes Sociales
                      </label>
                      <p className="text-xs text-gray-500 mb-2">Recomendado: 1200x630px (aparece al compartir tu link)</p>

                      <div className="flex items-start gap-3">
                        {/* Social Image Preview */}
                        <div className="relative flex-shrink-0">
                          {brandingData.socialImageUrl ? (
                            <div className="relative">
                              <img
                                src={brandingData.socialImageUrl}
                                alt="Social Preview"
                                className="w-32 h-[68px] rounded-lg object-cover border-2 border-gray-200"
                              />
                              <button
                                onClick={removeSocialImage}
                                className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="w-32 h-[68px] rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                              <Share2 className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                        </div>

                        {/* Upload Button */}
                        <div>
                          <input
                            ref={socialImageInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleSocialImageUpload}
                            className="hidden"
                          />
                          <button
                            onClick={() => socialImageInputRef.current?.click()}
                            disabled={uploadingSocialImage}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                          >
                            {uploadingSocialImage ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Subiendo...
                              </>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5" />
                                Subir
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* WhatsApp para Landing */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        WhatsApp para tu Landing
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          name="whatsapp"
                          value={brandingData.whatsapp}
                          onChange={handleBrandingChange}
                          placeholder="51900000000"
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Número que aparecerá en el botón de WhatsApp de tu landing</p>
                    </div>

                    {/* Brand Colors */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Color Principal
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {PRESET_COLORS.map(color => (
                          <button
                            key={color.primary}
                            onClick={() => setBrandingData(prev => ({
                              ...prev,
                              primaryColor: color.primary,
                              secondaryColor: color.secondary
                            }))}
                            className={`w-8 h-8 rounded-lg border-2 transition-all ${
                              brandingData.primaryColor === color.primary
                                ? 'border-gray-900 scale-110 ring-2 ring-offset-1 ring-gray-400'
                                : 'border-transparent hover:scale-105'
                            }`}
                            style={{ backgroundColor: color.primary }}
                            title={color.name}
                          />
                        ))}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={brandingData.primaryColor}
                            onChange={(e) => setBrandingData(prev => ({
                              ...prev,
                              primaryColor: e.target.value,
                              secondaryColor: e.target.value
                            }))}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-gray-300"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Precios de la Landing */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <DollarSign className="w-4 h-4 inline mr-1" />
                        Precios de tu Landing Page
                      </label>
                      <p className="text-xs text-gray-500 mb-3">Personaliza los precios que se mostrarán en tu landing</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Mensual</label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                            <input
                              type="number"
                              step="0.10"
                              min="0"
                              value={brandingData.priceMonthly}
                              onChange={(e) => setBrandingData(prev => ({ ...prev, priceMonthly: parseFloat(e.target.value) || 0 }))}
                              className="w-full pl-7 pr-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Semestral</label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                            <input
                              type="number"
                              step="0.10"
                              min="0"
                              value={brandingData.priceSemester}
                              onChange={(e) => setBrandingData(prev => ({ ...prev, priceSemester: parseFloat(e.target.value) || 0 }))}
                              className="w-full pl-7 pr-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Anual</label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                            <input
                              type="number"
                              step="0.10"
                              min="0"
                              value={brandingData.priceAnnual}
                              onChange={(e) => setBrandingData(prev => ({ ...prev, priceAnnual: parseFloat(e.target.value) || 0 }))}
                              className="w-full pl-7 pr-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Columna derecha - Preview */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Eye className="w-4 h-4 inline mr-1" />
                      Vista Previa
                    </label>
                    <div
                      className="rounded-xl p-4 text-white h-[280px]"
                      style={{ background: `linear-gradient(135deg, ${brandingData.primaryColor}, ${brandingData.secondaryColor})` }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        {brandingData.logoUrl ? (
                          <img
                            src={brandingData.logoUrl}
                            alt="Logo"
                            className="w-10 h-10 rounded-lg object-cover bg-white"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                            <span className="text-xl font-bold" style={{ color: brandingData.primaryColor }}>
                              {brandingData.companyName?.charAt(0) || 'M'}
                            </span>
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold">{brandingData.companyName || 'Mi Marca'}</h3>
                          <p className="text-xs opacity-80">Sistema de Facturación</p>
                        </div>
                      </div>

                      {/* Simulated Menu Items */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 px-3 py-2 bg-white/20 rounded-lg">
                          <div className="w-4 h-4 bg-white/60 rounded" />
                          <span className="text-sm">Dashboard</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg">
                          <div className="w-4 h-4 bg-white/40 rounded" />
                          <span className="text-sm opacity-80">Facturación</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg">
                          <div className="w-4 h-4 bg-white/40 rounded" />
                          <span className="text-sm opacity-80">Clientes</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg">
                          <div className="w-4 h-4 bg-white/40 rounded" />
                          <span className="text-sm opacity-80">Productos</span>
                        </div>
                      </div>

                      <p className="text-xs opacity-60 mt-4 text-center">
                        Así verán tus clientes la app
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Save Button */}
              <div className="pt-5 mt-5 border-t border-gray-200 flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Guardar Cambios
                    </>
                  )}
                </button>

                {saved && (
                  <span className="flex items-center gap-1 text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Guardado
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
