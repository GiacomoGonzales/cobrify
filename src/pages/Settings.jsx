import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, Building2, FileText, Loader2, CheckCircle, AlertCircle, Shield, Upload, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { companySettingsSchema } from '@/utils/schemas'

export default function Settings() {
  const { user } = useAuth()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('informacion')
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
    try {
      // Cargar datos de la empresa usando userId como businessId
      const businessRef = doc(db, 'businesses', user.uid)
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
      }
    } catch (error) {
      console.error('Error al cargar configuración:', error)
      toast.error('Error al cargar la configuración. Por favor, recarga la página.')
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmit = async data => {
    if (!user?.uid) return

    setIsSaving(true)

    try {
      // Actualizar datos de la empresa usando userId como businessId
      const businessRef = doc(db, 'businesses', user.uid)

      await updateDoc(businessRef, {
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
        updatedAt: serverTimestamp(),
      })

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

    setIsSaving(true)

    try {
      // Actualizar series usando userId como businessId
      const businessRef = doc(db, 'businesses', user.uid)

      await updateDoc(businessRef, {
        series: series,
        updatedAt: serverTimestamp(),
      })

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

    setIsSaving(true)

    try {
      const businessRef = doc(db, 'businesses', user.uid)

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
      await updateDoc(businessRef, {
        sunat: sunatData,
        updatedAt: serverTimestamp(),
      })

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

  // Tabs configuration
  const tabs = [
    { id: 'informacion', label: 'Información', icon: Building2 },
    { id: 'series', label: 'Series', icon: FileText },
    { id: 'sunat', label: 'SUNAT', icon: Shield },
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

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <tab.icon
                className={`
                  -ml-0.5 mr-2 h-5 w-5
                  ${activeTab === tab.id ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'}
                `}
              />
              {tab.label}
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
          </CardContent>
        </Card>

        {/* Actions for Company Info */}
        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
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

      {/* Tab Content - SUNAT */}
      {activeTab === 'sunat' && (
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-primary-600" />
              <CardTitle>Integración con SUNAT</CardTitle>
            </div>
            {!editingSunat ? (
              <Button variant="outline" size="sm" onClick={() => setEditingSunat(true)}>
                {sunatConfig.enabled ? 'Editar Configuración' : 'Configurar SUNAT'}
              </Button>
            ) : (
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingSunat(false)
                    loadSettings() // Recargar datos originales
                  }}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveSunat}
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
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Nota:</strong> La integración con SUNAT te permite emitir facturas y
                boletas electrónicas válidas. Necesitas tener un certificado digital y credenciales
                SOL activas.
              </p>
            </div>

            {/* Enable/Disable Switch */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Habilitar SUNAT</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Activa la facturación electrónica con SUNAT
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={sunatConfig.enabled}
                  onChange={(e) => handleSunatConfigChange('enabled', e.target.checked)}
                  disabled={!editingSunat}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 ${!editingSunat ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              </label>
            </div>

            {/* SUNAT Configuration Fields */}
            {sunatConfig.enabled && (
              <>
                {/* Environment Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ambiente <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={sunatConfig.environment}
                    onChange={(e) => handleSunatConfigChange('environment', e.target.value)}
                    disabled={!editingSunat}
                    className={!editingSunat ? 'bg-gray-100' : ''}
                  >
                    <option value="beta">Beta / Homologación (Pruebas)</option>
                    <option value="production">Producción</option>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    Usa "Beta" para pruebas y "Producción" para facturas reales
                  </p>
                </div>

                {/* Homologation Status */}
                {sunatConfig.environment === 'beta' && (
                  <div className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Estado de Homologación</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {sunatConfig.homologated
                          ? '✓ Homologado - Listo para producción'
                          : 'Pendiente de homologación'}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sunatConfig.homologated}
                        onChange={(e) => handleSunatConfigChange('homologated', e.target.checked)}
                        disabled={!editingSunat}
                        className="sr-only peer"
                      />
                      <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 ${!editingSunat ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                    </label>
                  </div>
                )}

                {/* SOL Credentials */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Usuario SOL <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={sunatConfig.solUser}
                      onChange={(e) => handleSunatConfigChange('solUser', e.target.value)}
                      disabled={!editingSunat}
                      className={!editingSunat ? 'bg-gray-100' : ''}
                      placeholder="MODDATOS"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Usuario SOL de SUNAT
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Clave SOL <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type={showSolPassword ? 'text' : 'password'}
                        value={sunatConfig.solPassword}
                        onChange={(e) => handleSunatConfigChange('solPassword', e.target.value)}
                        disabled={!editingSunat}
                        className={!editingSunat ? 'bg-gray-100' : ''}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSolPassword(!showSolPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        disabled={!editingSunat}
                      >
                        {showSolPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Contraseña SOL de SUNAT
                    </p>
                  </div>
                </div>

                {/* Certificate Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Certificado Digital (.pfx) <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    {sunatConfig.certificateName ? (
                      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="text-sm text-green-800">{sunatConfig.certificateName}</span>
                        </div>
                        {editingSunat && (
                          <div className="flex space-x-3">
                            <label className="cursor-pointer">
                              <span className="text-sm text-primary-600 hover:text-primary-700">
                                Cambiar
                              </span>
                              <input
                                type="file"
                                accept=".pfx,.p12"
                                onChange={handleCertificateUpload}
                                className="hidden"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={handleRemoveCertificate}
                              className="text-sm text-red-600 hover:text-red-700"
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <label className={`flex items-center justify-center px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg ${editingSunat ? 'cursor-pointer hover:border-primary-500' : 'cursor-not-allowed opacity-50'}`}>
                        <div className="text-center">
                          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <span className="text-sm text-gray-600">
                            Haz clic para subir tu certificado
                          </span>
                          <p className="text-xs text-gray-500 mt-1">
                            Archivos .pfx o .p12
                          </p>
                        </div>
                        <input
                          type="file"
                          accept=".pfx,.p12"
                          onChange={handleCertificateUpload}
                          disabled={!editingSunat}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Certificate Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contraseña del Certificado <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showCertPassword ? 'text' : 'password'}
                      value={sunatConfig.certificatePassword}
                      onChange={(e) => handleSunatConfigChange('certificatePassword', e.target.value)}
                      disabled={!editingSunat}
                      className={!editingSunat ? 'bg-gray-100' : ''}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCertPassword(!showCertPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={!editingSunat}
                    >
                      {showCertPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Contraseña para desencriptar el certificado digital
                  </p>
                </div>

                {/* Warning for Production */}
                {sunatConfig.environment === 'production' && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex">
                      <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-red-900">Ambiente de Producción</h3>
                        <p className="text-sm text-red-800 mt-1">
                          Estás en modo producción. Los comprobantes emitidos tendrán validez legal
                          y serán reportados a SUNAT. Asegúrate de haber completado la homologación.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
        </Card>
      )}
    </div>
  )
}
