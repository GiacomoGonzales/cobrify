import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, Building2, FileText, Loader2, CheckCircle, AlertCircle, Shield, Upload, Eye, EyeOff, Lock, X, Image, Info, Settings as SettingsIcon } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { companySettingsSchema } from '@/utils/schemas'
import { getSubscription } from '@/services/subscriptionService'

export default function Settings() {
  const { user, isDemoMode, getBusinessId } = useAppContext()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('informacion')
  const [subscription, setSubscription] = useState(null)
  const [series, setSeries] = useState({
    factura: { serie: 'F001', lastNumber: 0 },
    boleta: { serie: 'B001', lastNumber: 0 },
    nota_venta: { serie: 'N001', lastNumber: 0 },
    nota_credito: { serie: 'FC01', lastNumber: 0 },
    nota_debito: { serie: 'FD01', lastNumber: 0 },
  })
  const [editingSeries, setEditingSeries] = useState(false)

  // Estados para SUNAT
  const [sunatConfig, setSunatConfig] = useState({
    enabled: false,
    environment: 'beta',
    solUser: '',
    solPassword: '',
    certificateName: '',
    certificatePassword: '',
    homologated: false,
  })
  const [editingSunat, setEditingSunat] = useState(false)
  const [showSolPassword, setShowSolPassword] = useState(false)
  const [showCertPassword, setShowCertPassword] = useState(false)
  const [certificateFile, setCertificateFile] = useState(null)

  // Estados para QPse
  const [qpseConfig, setQpseConfig] = useState({
    enabled: false,
    environment: 'demo',
    usuario: '',
    password: '',
    firmasDisponibles: 0,
    firmasUsadas: 0,
  })
  const [editingQpse, setEditingQpse] = useState(false)
  const [showQpsePassword, setShowQpsePassword] = useState(false)

  // Estados para logo
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Estados para configuración de inventario
  const [allowNegativeStock, setAllowNegativeStock] = useState(false)
  const [allowCustomProducts, setAllowCustomProducts] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: zodResolver(companySettingsSchema),
  })

  // Cargar configuración al montar
  useEffect(() => {
    loadSettings()
  }, [user])

  const loadSettings = async () => {
    if (!user?.uid) return

    setIsLoading(true)

    // MODO DEMO: No cargar datos de Firebase
    if (isDemoMode) {
      // Establecer datos por defecto para demo
      reset({
        ruc: '20123456789',
        businessName: 'EMPRESA DEMO SAC',
        tradeName: 'Demo Store',
        phone: '01-2345678',
        email: 'demo@empresa.com',
        website: 'www.empresademo.com',
        address: 'Av. Demo 123',
        urbanization: '',
        district: 'Miraflores',
        province: 'Lima',
        department: 'Lima',
        ubigeo: '150101',
      })
      setIsLoading(false)
      return
    }

    try {
      // Cargar suscripción del usuario
      const subResult = await getSubscription(getBusinessId())
      if (subResult) {
        setSubscription(subResult)
      }

      // Cargar datos de la empresa usando userId como businessId
      const businessRef = doc(db, 'businesses', getBusinessId())
      const businessDoc = await getDoc(businessRef)

      if (businessDoc.exists()) {
        const businessData = businessDoc.data()

        reset({
          ruc: businessData.ruc || '',
          businessName: businessData.businessName || '',
          tradeName: businessData.name || '',
          phone: businessData.phone || '',
          email: businessData.email || '',
          website: businessData.website || '',
          address: businessData.address || '',
          urbanization: businessData.urbanization || '',
          district: businessData.district || '',
          province: businessData.province || '',
          department: businessData.department || '',
          ubigeo: businessData.ubigeo || '',
        })

        // Cargar series de documentos
        if (businessData.series) {
          setSeries({
            factura: businessData.series.factura || { serie: 'F001', lastNumber: 0 },
            boleta: businessData.series.boleta || { serie: 'B001', lastNumber: 0 },
            nota_venta: businessData.series.nota_venta || { serie: 'N001', lastNumber: 0 },
            nota_credito: businessData.series.nota_credito || { serie: 'FC01', lastNumber: 0 },
            nota_debito: businessData.series.nota_debito || { serie: 'FD01', lastNumber: 0 },
          })
        }

        // Cargar configuración SUNAT
        if (businessData.sunat) {
          setSunatConfig({
            enabled: businessData.sunat.enabled || false,
            environment: businessData.sunat.environment || 'beta',
            solUser: businessData.sunat.solUser || '',
            solPassword: businessData.sunat.solPassword || '',
            certificateName: businessData.sunat.certificateName || '',
            certificatePassword: businessData.sunat.certificatePassword || '',
            homologated: businessData.sunat.homologated || false,
          })
        }

        // Cargar configuración QPse (global para todos los negocios)
        // TODO: Mover a colección settings/qpse en producción
        if (businessData.qpse) {
          setQpseConfig({
            enabled: businessData.qpse.enabled || false,
            environment: businessData.qpse.environment || 'demo',
            usuario: businessData.qpse.usuario || '',
            password: businessData.qpse.password || '',
            firmasDisponibles: businessData.qpse.firmasDisponibles || 0,
            firmasUsadas: businessData.qpse.firmasUsadas || 0,
          })
        }

        // Cargar logo
        if (businessData.logoUrl) {
          setLogoUrl(businessData.logoUrl)
        }

        // Cargar configuración de inventario
        setAllowNegativeStock(businessData.allowNegativeStock || false)
        setAllowCustomProducts(businessData.allowCustomProducts || false)
      }
    } catch (error) {
      console.error('Error al cargar configuración:', error)
      toast.error('Error al cargar la configuración. Por favor, recarga la página.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validar tipo de archivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('El archivo debe ser una imagen (JPG, PNG o WEBP)')
      return
    }

    // Validar tamaño (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 2MB')
      return
    }

    setLogoFile(file)

    // Mostrar preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setLogoUrl(e.target.result)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = async () => {
    if (!user?.uid) return

    try {
      // Si hay un logo en storage, eliminarlo
      if (logoUrl && logoUrl.includes('firebase')) {
        try {
          const logoRef = ref(storage, `businesses/${getBusinessId()}/logo`)
          await deleteObject(logoRef)
        } catch (error) {
          console.log('No se pudo eliminar el logo anterior:', error)
        }
      }

      // Actualizar Firestore
      const businessRef = doc(db, 'businesses', getBusinessId())
      await setDoc(businessRef, {
        logoUrl: null,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      setLogoUrl('')
      setLogoFile(null)
      toast.success('Logo eliminado exitosamente')
    } catch (error) {
      console.error('Error al eliminar logo:', error)
      toast.error('Error al eliminar el logo')
    }
  }

  const onSubmit = async data => {
    if (!user?.uid) return

    // MODO DEMO: No permitir cambios
    if (isDemoMode) {
      toast.error('No se pueden guardar cambios en modo demo. Crea una cuenta para configurar tu empresa.')
      return
    }

    setIsSaving(true)

    try {
      let uploadedLogoUrl = logoUrl

      // Si hay un nuevo archivo de logo, subirlo a Storage
      if (logoFile) {
        setUploadingLogo(true)
        try {
          const logoRef = ref(storage, `businesses/${getBusinessId()}/logo`)
          await uploadBytes(logoRef, logoFile)
          uploadedLogoUrl = await getDownloadURL(logoRef)
          console.log('✅ Logo subido exitosamente')
        } catch (logoError) {
          console.error('Error al subir logo:', logoError)
          toast.error('Error al subir el logo. Se guardará el resto de la configuración.')
        } finally {
          setUploadingLogo(false)
        }
      }

      // Crear o actualizar datos de la empresa usando userId como businessId
      const businessRef = doc(db, 'businesses', getBusinessId())

      await setDoc(businessRef, {
        ruc: data.ruc,
        businessName: data.businessName,
        name: data.tradeName || data.businessName,
        phone: data.phone,
        email: data.email,
        website: data.website,
        address: data.address,
        urbanization: data.urbanization,
        district: data.district,
        province: data.province,
        department: data.department,
        ubigeo: data.ubigeo,
        logoUrl: uploadedLogoUrl || null,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      setLogoFile(null) // Limpiar archivo temporal
      toast.success('Configuración guardada exitosamente')
    } catch (error) {
      console.error('Error al guardar:', error)
      toast.error('Error al guardar la configuración. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveSeries = async () => {
    if (!user?.uid) return

    // MODO DEMO: No permitir cambios
    if (isDemoMode) {
      toast.error('No se pueden guardar cambios en modo demo. Crea una cuenta para configurar tu empresa.')
      return
    }

    setIsSaving(true)

    try {
      // Crear o actualizar series usando userId como businessId
      const businessRef = doc(db, 'businesses', getBusinessId())

      await setDoc(businessRef, {
        series: series,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      toast.success('Series actualizadas exitosamente')
      setEditingSeries(false)
    } catch (error) {
      console.error('Error al guardar series:', error)
      toast.error('Error al actualizar las series. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSeriesChange = (type, field, value) => {
    setSeries(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: field === 'lastNumber' ? parseInt(value) || 0 : value,
      },
    }))
  }

  const getNextNumber = (serie, lastNumber) => {
    return `${serie}-${String(lastNumber + 1).padStart(8, '0')}`
  }

  // Funciones para SUNAT
  const handleSunatConfigChange = (field, value) => {
    setSunatConfig(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleCertificateUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.name.endsWith('.pfx') || file.name.endsWith('.p12')) {
        setCertificateFile(file)
        setSunatConfig(prev => ({
          ...prev,
          certificateName: file.name,
        }))
      } else {
        toast.error('El archivo debe ser un certificado .pfx o .p12')
      }
    }
  }

  const handleRemoveCertificate = () => {
    setCertificateFile(null)
    setSunatConfig(prev => ({
      ...prev,
      certificateName: '',
      certificatePassword: '',
    }))
  }

  const handleSaveSunat = async () => {
    if (!user?.uid) return

    // MODO DEMO: No permitir cambios
    if (isDemoMode) {
      toast.error('No se pueden guardar cambios en modo demo. Crea una cuenta para configurar tu empresa.')
      return
    }

    setIsSaving(true)

    try {
      const businessRef = doc(db, 'businesses', getBusinessId())

      // Preparar datos de SUNAT
      const sunatData = {
        enabled: sunatConfig.enabled,
        environment: sunatConfig.environment,
        solUser: sunatConfig.solUser,
        solPassword: sunatConfig.solPassword, // TODO: Encriptar
        certificateName: sunatConfig.certificateName,
        certificatePassword: sunatConfig.certificatePassword, // TODO: Encriptar
        homologated: sunatConfig.homologated,
      }

      // Si hay un nuevo archivo de certificado, convertirlo a base64
      if (certificateFile) {
        try {
          const certificateBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              // Extraer solo la parte base64 (sin el prefijo data:...)
              const base64 = reader.result.split(',')[1]
              resolve(base64)
            }
            reader.onerror = reject
            reader.readAsDataURL(certificateFile)
          })

          sunatData.certificateData = certificateBase64
          console.log('✅ Certificado convertido a base64 (' + certificateBase64.length + ' caracteres)')
        } catch (certError) {
          console.error('Error al leer certificado:', certError)
          throw new Error('Error al procesar el certificado digital')
        }
      } else if (!sunatConfig.certificateName) {
        // Si no hay nombre de certificado, eliminar el certificateData
        sunatData.certificateData = null
      }

      // Guardar configuración en Firestore
      await setDoc(businessRef, {
        sunat: sunatData,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      toast.success('Configuración SUNAT guardada exitosamente')
      setEditingSunat(false)
      setCertificateFile(null) // Limpiar archivo temporal
    } catch (error) {
      console.error('Error al guardar configuración SUNAT:', error)
      toast.error(error.message || 'Error al guardar la configuración SUNAT. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  // Funciones para QPse
  const handleQpseConfigChange = (field, value) => {
    setQpseConfig(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSaveQpse = async () => {
    if (!user?.uid) return

    // MODO DEMO: No permitir cambios
    if (isDemoMode) {
      toast.error('No se pueden guardar cambios en modo demo. Crea una cuenta para configurar tu empresa.')
      return
    }

    // Validar campos requeridos si está habilitado
    if (qpseConfig.enabled) {
      if (!qpseConfig.usuario || !qpseConfig.password) {
        toast.error('Debes completar el Usuario y Password de QPse')
        return
      }
    }

    setIsSaving(true)

    try {
      const businessRef = doc(db, 'businesses', getBusinessId())

      // Preparar datos de QPse (credenciales globales)
      const qpseData = {
        enabled: qpseConfig.enabled,
        environment: qpseConfig.environment,
        usuario: qpseConfig.usuario,
        password: qpseConfig.password, // TODO: Encriptar en producción
        firmasDisponibles: qpseConfig.firmasDisponibles || 0,
        firmasUsadas: qpseConfig.firmasUsadas || 0,
        updatedAt: new Date().toISOString(),
      }

      // Guardar configuración en Firestore
      await setDoc(businessRef, {
        qpse: qpseData,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      toast.success('Configuración de QPse guardada exitosamente')
      setEditingQpse(false)
    } catch (error) {
      console.error('Error al guardar configuración QPse:', error)
      toast.error(error.message || 'Error al guardar la configuración de QPse. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando configuración...</p>
        </div>
      </div>
    )
  }

  // Check if user is on trial plan
  const isTrialUser = subscription?.plan === 'trial'

  // Tabs configuration
  const tabs = [
    { id: 'informacion', label: 'Información', icon: Building2 },
    { id: 'preferencias', label: 'Preferencias', icon: SettingsIcon },
    { id: 'series', label: 'Series', icon: FileText },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          Configura la información de tu empresa
        </p>
      </div>

      {/* Demo Mode Alert */}
      {isDemoMode && (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Info className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Modo Demo</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  Estás explorando Cobrify en modo demostración. Para configurar la información de tu empresa
                  y personalizar tus comprobantes, necesitas{' '}
                  <a href="/register" className="font-semibold underline hover:text-blue-900">
                    crear una cuenta
                  </a>
                  {' '}y elegir un plan de suscripción.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              title={tab.tooltip || ''}
              className={`
                group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                ${tab.disabled
                  ? 'border-transparent text-gray-400 cursor-not-allowed opacity-60'
                  : activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <tab.icon
                className={`
                  -ml-0.5 mr-2 h-5 w-5
                  ${tab.disabled
                    ? 'text-gray-400'
                    : activeTab === tab.id
                    ? 'text-primary-500'
                    : 'text-gray-400 group-hover:text-gray-500'
                  }
                `}
              />
              {tab.label}
              {tab.disabled && (
                <Lock className="ml-1.5 h-4 w-4 text-gray-400" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content - Información */}
      {activeTab === 'informacion' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Company Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-primary-600" />
              <CardTitle>Información de la Empresa</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Logo Upload Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo de la Empresa
                </label>
                <div className="flex items-start gap-4">
                  {/* Logo Preview */}
                  {logoUrl ? (
                    <div className="relative group">
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="w-32 h-32 object-contain border-2 border-gray-200 rounded-lg p-2 bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Eliminar logo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                      <Image className="w-12 h-12 text-gray-400" />
                    </div>
                  )}

                  {/* Upload Button */}
                  <div className="flex-1">
                    <label className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <Upload className="w-4 h-4 mr-2 text-gray-600" />
                      <span className="text-sm text-gray-700">
                        {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                      Formatos: JPG, PNG, WEBP. Tamaño máximo: 2MB
                    </p>
                    <p className="text-xs text-gray-500">
                      El logo aparecerá en tus facturas y boletas impresas
                    </p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Company Info Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="RUC"
                  required
                  placeholder="20123456789"
                  error={errors.ruc?.message}
                  {...register('ruc')}
                />

              <Input
                label="Razón Social"
                required
                placeholder="MI EMPRESA SAC"
                error={errors.businessName?.message}
                {...register('businessName')}
              />

              <Input
                label="Nombre Comercial"
                placeholder="Mi Empresa"
                error={errors.tradeName?.message}
                {...register('tradeName')}
              />

              <Input
                label="Teléfono"
                type="tel"
                placeholder="01-2345678"
                error={errors.phone?.message}
                {...register('phone')}
              />

              <Input
                label="Correo Electrónico"
                type="email"
                required
                placeholder="contacto@miempresa.com"
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                label="Sitio Web"
                type="url"
                placeholder="https://miempresa.com"
                error={errors.website?.message}
                {...register('website')}
              />

              <div className="md:col-span-2">
                <Input
                  label="Dirección"
                  required
                  placeholder="Av. Principal 123"
                  error={errors.address?.message}
                  {...register('address')}
                  helperText="Dirección completa (calle, avenida, número)"
                />
              </div>

              <Input
                label="Urbanización"
                placeholder="Las Flores"
                error={errors.urbanization?.message}
                {...register('urbanization')}
                helperText="Opcional"
              />

              <Input
                label="Distrito"
                required
                placeholder="Miraflores"
                error={errors.district?.message}
                {...register('district')}
              />

              <Input
                label="Provincia"
                required
                placeholder="Lima"
                error={errors.province?.message}
                {...register('province')}
              />

              <Input
                label="Departamento"
                required
                placeholder="Lima"
                error={errors.department?.message}
                {...register('department')}
              />

              <Input
                label="Ubigeo"
                placeholder="150101"
                error={errors.ubigeo?.message}
                {...register('ubigeo')}
                maxLength={6}
                helperText="Código de ubicación geográfica (6 dígitos) - Consultar en SUNAT"
              />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions for Company Info */}
        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving || uploadingLogo}>
            {isSaving || uploadingLogo ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {uploadingLogo ? 'Subiendo logo...' : 'Guardando...'}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar Configuración
              </>
            )}
          </Button>
        </div>
        </form>
      )}

      {/* Tab Content - Preferencias */}
      {activeTab === 'preferencias' && (
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <SettingsIcon className="w-5 h-5 text-primary-600" />
              <CardTitle>Preferencias del Sistema</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Inventory Settings Section */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Inventario y Ventas</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configura el comportamiento del punto de venta y control de inventario
                </p>
                <div className="space-y-4">
                  <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={allowNegativeStock}
                      onChange={(e) => setAllowNegativeStock(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                        Permitir vender productos sin stock
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        {allowNegativeStock
                          ? '✓ Habilitado: Los productos se pueden vender incluso si el stock está en 0 o negativo. El stock puede quedar en números negativos. Útil para negocios bajo pedido o dropshipping.'
                          : '✗ Deshabilitado: Los productos con stock en 0 aparecerán deshabilitados en el punto de venta y no se podrán agregar al carrito. Recomendado para control estricto de inventario.'}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={allowCustomProducts}
                      onChange={(e) => setAllowCustomProducts(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                        Permitir agregar productos personalizados en el POS
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        {allowCustomProducts
                          ? '✓ Habilitado: Aparecerá un botón "Producto Personalizado" en el punto de venta que permite agregar productos con nombre y precio personalizado sin necesidad de crearlos previamente. Ideal para servicios variables, trabajos por encargo o productos únicos.'
                          : '✗ Deshabilitado: Solo se pueden vender productos previamente creados en el catálogo. Recomendado para negocios con inventario fijo y control estricto de productos.'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Placeholder for future settings */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Otras Configuraciones</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Más opciones estarán disponibles próximamente
                </p>
                <div className="p-8 text-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <SettingsIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">
                    Nuevas preferencias de configuración se agregarán aquí
                  </p>
                </div>
              </div>
            </div>
          </CardContent>

          {/* Save Button for Preferences */}
          <div className="px-6 pb-6">
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  if (isDemoMode) {
                    toast.error('No se pueden guardar cambios en modo demo. Crea una cuenta para configurar tu empresa.')
                    return
                  }

                  setIsSaving(true)
                  try {
                    const businessRef = doc(db, 'businesses', getBusinessId())
                    await setDoc(businessRef, {
                      allowNegativeStock: allowNegativeStock,
                      allowCustomProducts: allowCustomProducts,
                      updatedAt: serverTimestamp(),
                    }, { merge: true })
                    toast.success('Preferencias guardadas exitosamente')
                  } catch (error) {
                    console.error('Error al guardar preferencias:', error)
                    toast.error('Error al guardar las preferencias')
                  } finally {
                    setIsSaving(false)
                  }
                }}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Guardar Preferencias
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Tab Content - Series */}
      {activeTab === 'series' && (
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-primary-600" />
              <CardTitle>Series de Comprobantes</CardTitle>
            </div>
            {!editingSeries ? (
              <Button variant="outline" size="sm" onClick={() => setEditingSeries(true)}>
                Editar Series
              </Button>
            ) : (
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingSeries(false)
                    loadSettings() // Recargar datos originales
                  }}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveSeries}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" />
                      Guardar
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Nota:</strong> La configuración de series de comprobantes permite
                controlar la numeración correlativa de tus facturas y boletas según las normas de
                SUNAT.
              </p>
            </div>

            {/* Facturas */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Facturas Electrónicas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serie
                  </label>
                  <Input
                    value={series.factura.serie}
                    onChange={e => handleSeriesChange('factura', 'serie', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Último Número
                  </label>
                  <Input
                    type="number"
                    value={series.factura.lastNumber}
                    onChange={e => handleSeriesChange('factura', 'lastNumber', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Siguiente
                  </label>
                  <Input
                    value={getNextNumber(series.factura.serie, series.factura.lastNumber)}
                    disabled
                    className="bg-gray-100 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Boletas */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Boletas de Venta</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serie
                  </label>
                  <Input
                    value={series.boleta.serie}
                    onChange={e => handleSeriesChange('boleta', 'serie', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Último Número
                  </label>
                  <Input
                    type="number"
                    value={series.boleta.lastNumber}
                    onChange={e => handleSeriesChange('boleta', 'lastNumber', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Siguiente
                  </label>
                  <Input
                    value={getNextNumber(series.boleta.serie, series.boleta.lastNumber)}
                    disabled
                    className="bg-gray-100 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Notas de Venta */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Notas de Venta</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serie
                  </label>
                  <Input
                    value={series.nota_venta.serie}
                    onChange={e => handleSeriesChange('nota_venta', 'serie', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Último Número
                  </label>
                  <Input
                    type="number"
                    value={series.nota_venta.lastNumber}
                    onChange={e => handleSeriesChange('nota_venta', 'lastNumber', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Siguiente
                  </label>
                  <Input
                    value={getNextNumber(series.nota_venta.serie, series.nota_venta.lastNumber)}
                    disabled
                    className="bg-gray-100 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Notas de Crédito */}
            <div className="pt-4 border-t">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Notas de Crédito (SUNAT)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serie
                  </label>
                  <Input
                    value={series.nota_credito.serie}
                    onChange={e => handleSeriesChange('nota_credito', 'serie', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    maxLength={4}
                    placeholder="FC01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Último Número
                  </label>
                  <Input
                    type="number"
                    value={series.nota_credito.lastNumber}
                    onChange={e => handleSeriesChange('nota_credito', 'lastNumber', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Siguiente
                  </label>
                  <Input
                    value={getNextNumber(series.nota_credito.serie, series.nota_credito.lastNumber)}
                    disabled
                    className="bg-gray-100 font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Para anular, corregir o devolver facturas/boletas aceptadas por SUNAT
              </p>
            </div>

            {/* Notas de Débito */}
            <div className="pt-4 border-t">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Notas de Débito (SUNAT)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serie
                  </label>
                  <Input
                    value={series.nota_debito.serie}
                    onChange={e => handleSeriesChange('nota_debito', 'serie', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    maxLength={4}
                    placeholder="FD01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Último Número
                  </label>
                  <Input
                    type="number"
                    value={series.nota_debito.lastNumber}
                    onChange={e => handleSeriesChange('nota_debito', 'lastNumber', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Siguiente
                  </label>
                  <Input
                    value={getNextNumber(series.nota_debito.serie, series.nota_debito.lastNumber)}
                    disabled
                    className="bg-gray-100 font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Para aumentar el valor de facturas/boletas aceptadas por SUNAT (intereses, penalidades, etc.)
              </p>
            </div>
          </div>
        </CardContent>
        </Card>
      )}
    </div>
  )
}
