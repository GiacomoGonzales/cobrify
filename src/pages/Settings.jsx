import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, Building2, FileText, Loader2, CheckCircle, AlertCircle, Shield, Upload, Eye, EyeOff, Lock, X, Image, Info, Settings as SettingsIcon, Store, UtensilsCrossed, Printer, AlertTriangle, Search } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { db, storage, auth } from '@/lib/firebase'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { companySettingsSchema } from '@/utils/schemas'
import { getSubscription } from '@/services/subscriptionService'
import { consultarRUC } from '@/services/documentLookupService'
import {
  scanPrinters,
  connectPrinter,
  savePrinterConfig,
  getPrinterConfig,
  testPrinter
} from '@/services/thermalPrinterService'

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
    cotizacion: { serie: 'C001', lastNumber: 0 },
    nota_credito_factura: { serie: 'FN01', lastNumber: 0 },
    nota_credito_boleta: { serie: 'BN01', lastNumber: 0 },
    nota_debito_factura: { serie: 'FD01', lastNumber: 0 },
    nota_debito_boleta: { serie: 'BD01', lastNumber: 0 },
    guia_remision: { serie: 'T001', lastNumber: 0 },
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
  const [allowPriceEdit, setAllowPriceEdit] = useState(false)

  // Estados para configuración de notas de venta
  const [hideRucIgvInNotaVenta, setHideRucIgvInNotaVenta] = useState(false)
  const [allowPartialPayments, setAllowPartialPayments] = useState(false)

  // Estados para configuración de comprobantes
  const [allowDeleteInvoices, setAllowDeleteInvoices] = useState(false)

  // Estados para configuración de SUNAT
  const [autoSendToSunat, setAutoSendToSunat] = useState(false)

  // Estados para guías de remisión
  const [dispatchGuidesEnabled, setDispatchGuidesEnabled] = useState(false)

  // Estados para fecha de emisión
  const [allowCustomEmissionDate, setAllowCustomEmissionDate] = useState(false)

  // Estados para privacidad
  const [hideDashboardDataFromSecondary, setHideDashboardDataFromSecondary] = useState(false)

  // Estados para modo de negocio
  const [businessMode, setBusinessMode] = useState('retail') // 'retail' | 'restaurant'
  const [restaurantConfig, setRestaurantConfig] = useState({
    tablesEnabled: true,
    waitersEnabled: true,
    kitchenEnabled: true,
    deliveryEnabled: false,
    itemStatusTracking: false, // Seguimiento de estado por item (false = por orden completa)
  })

  // Estados para cambio de contraseña
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Estados para impresora térmica
  const [printerConfig, setPrinterConfig] = useState({
    enabled: false,
    address: '',
    name: '',
    type: 'bluetooth', // bluetooth o wifi
    paperWidth: 58, // 58mm o 80mm
    webPrintLegible: false, // Modo legible para impresión web (letras más grandes)
  })
  const [availablePrinters, setAvailablePrinters] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [showManualConnect, setShowManualConnect] = useState(false)

  // Estado para búsqueda de RUC
  const [isLookingUpRuc, setIsLookingUpRuc] = useState(false)
  const [manualAddress, setManualAddress] = useState('')
  const [manualName, setManualName] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
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
        socialMedia: '@empresademo',
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
          socialMedia: businessData.socialMedia || '',
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
            cotizacion: businessData.series.cotizacion || { serie: 'C001', lastNumber: 0 },
            nota_venta: businessData.series.nota_venta || { serie: 'N001', lastNumber: 0 },
            nota_credito_factura: businessData.series.nota_credito_factura || { serie: 'FN01', lastNumber: 0 },
            nota_credito_boleta: businessData.series.nota_credito_boleta || { serie: 'BN01', lastNumber: 0 },
            nota_debito_factura: businessData.series.nota_debito_factura || { serie: 'FD01', lastNumber: 0 },
            nota_debito_boleta: businessData.series.nota_debito_boleta || { serie: 'BD01', lastNumber: 0 },
            guia_remision: businessData.series.guia_remision || { serie: 'T001', lastNumber: 0 },
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
        setAllowPriceEdit(businessData.allowPriceEdit || false)

        // Cargar configuración de notas de venta
        setHideRucIgvInNotaVenta(businessData.hideRucIgvInNotaVenta || false)
        setAllowPartialPayments(businessData.allowPartialPayments || false)

        // Cargar configuración de comprobantes
        setAllowDeleteInvoices(businessData.allowDeleteInvoices || false)

        // Cargar configuración de SUNAT
        setAutoSendToSunat(businessData.autoSendToSunat || false)

        // Cargar configuración de guías de remisión
        setDispatchGuidesEnabled(businessData.dispatchGuidesEnabled || false)

        // Cargar configuración de fecha de emisión
        setAllowCustomEmissionDate(businessData.allowCustomEmissionDate || false)

        // Cargar configuración de privacidad
        setHideDashboardDataFromSecondary(businessData.hideDashboardDataFromSecondary || false)

        // Cargar modo de negocio
        setBusinessMode(businessData.businessMode || 'retail')
        if (businessData.restaurantConfig) {
          setRestaurantConfig(businessData.restaurantConfig)
        }

        // Cargar configuración de impresora
        if (businessData.printerConfig) {
          setPrinterConfig(businessData.printerConfig)
        }
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

  // Buscar datos de RUC automáticamente
  const handleLookupRuc = async () => {
    const rucNumber = watch('ruc')

    if (!rucNumber) {
      toast.error('Ingrese un número de RUC para buscar')
      return
    }

    if (rucNumber.length !== 11) {
      toast.error('El RUC debe tener 11 dígitos')
      return
    }

    setIsLookingUpRuc(true)

    try {
      const result = await consultarRUC(rucNumber)

      if (result.success) {
        // Autocompletar datos
        setValue('businessName', result.data.razonSocial || '')
        setValue('tradeName', result.data.nombreComercial || '')
        setValue('address', result.data.direccion || '')

        toast.success(`Datos encontrados: ${result.data.razonSocial}`)
      } else {
        toast.error(result.error || 'No se encontraron datos para este RUC', 5000)
      }
    } catch (error) {
      console.error('Error al buscar RUC:', error)
      toast.error('Error al consultar el RUC. Verifique su conexión.', 5000)
    } finally {
      setIsLookingUpRuc(false)
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
        socialMedia: data.socialMedia || '',
        address: data.address,
        urbanization: data.urbanization,
        district: data.district,
        province: data.province,
        department: data.department,
        ubigeo: data.ubigeo,
        logoUrl: uploadedLogoUrl || null,
        businessMode: businessMode,
        restaurantConfig: restaurantConfig,
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

  // Función para cambiar contraseña
  const handleChangePassword = async (e) => {
    e.preventDefault()

    // MODO DEMO: No permitir cambios
    if (isDemoMode) {
      toast.error('No se pueden cambiar contraseñas en modo demo. Crea una cuenta para gestionar tu seguridad.')
      return
    }

    if (!user) return

    // Validaciones
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Todos los campos son requeridos')
      return
    }

    if (newPassword.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    if (currentPassword === newPassword) {
      toast.error('La nueva contraseña debe ser diferente a la actual')
      return
    }

    setIsChangingPassword(true)

    try {
      // Reautenticar al usuario con su contraseña actual
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(auth.currentUser, credential)

      // Actualizar la contraseña
      await updatePassword(auth.currentUser, newPassword)

      // Limpiar campos
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')

      toast.success('Contraseña actualizada exitosamente')
    } catch (error) {
      console.error('Error al cambiar contraseña:', error)

      // Mensajes de error específicos
      if (error.code === 'auth/wrong-password') {
        toast.error('La contraseña actual es incorrecta')
      } else if (error.code === 'auth/weak-password') {
        toast.error('La nueva contraseña es muy débil')
      } else if (error.code === 'auth/requires-recent-login') {
        toast.error('Por seguridad, debes cerrar sesión y volver a iniciar para cambiar tu contraseña')
      } else {
        toast.error('Error al cambiar la contraseña. Inténtalo nuevamente.')
      }
    } finally {
      setIsChangingPassword(false)
    }
  }

  // Funciones para impresora térmica
  const handleScanPrinters = async () => {
    setIsScanning(true)
    try {
      const result = await scanPrinters()
      if (result.success) {
        setAvailablePrinters(result.devices)
        toast.success(`${result.devices.length} impresoras encontradas`)
      } else {
        toast.error(result.error || 'Error al escanear impresoras')
      }
    } catch (error) {
      console.error('Error scanning printers:', error)
      toast.error('Error al escanear impresoras')
    } finally {
      setIsScanning(false)
    }
  }

  const handleConnectPrinter = async (printerAddress, printerName) => {
    setIsConnecting(true)
    try {
      const result = await connectPrinter(printerAddress)
      if (result.success) {
        // Guardar configuración (mantener paperWidth actual o usar 58mm por defecto)
        const newConfig = {
          enabled: true,
          address: printerAddress,
          name: printerName,
          type: 'bluetooth',
          paperWidth: printerConfig.paperWidth || 58
        }
        setPrinterConfig(newConfig)

        // Guardar en Firestore
        await savePrinterConfig(getBusinessId(), newConfig)

        toast.success('Impresora conectada exitosamente')
      } else {
        toast.error(result.error || 'Error al conectar impresora')
      }
    } catch (error) {
      console.error('Error connecting printer:', error)
      toast.error('Error al conectar impresora')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleChangePaperWidth = async (newWidth) => {
    try {
      const newConfig = { ...printerConfig, paperWidth: parseInt(newWidth) }
      setPrinterConfig(newConfig)
      await savePrinterConfig(getBusinessId(), newConfig)
      toast.success(`Ancho de papel actualizado a ${newWidth}mm`)
    } catch (error) {
      console.error('Error updating paper width:', error)
      toast.error('Error al actualizar ancho de papel')
    }
  }

  const handleTestPrinter = async () => {
    setIsTesting(true)
    try {
      // Primero reconectar a la impresora guardada
      console.log('🔄 Reconectando a impresora:', printerConfig.address)
      if (printerConfig.address) {
        const connectResult = await connectPrinter(printerConfig.address)
        console.log('Resultado de conexión:', connectResult)

        if (!connectResult.success) {
          toast.error('No se pudo conectar a la impresora: ' + (connectResult.error || 'Error desconocido'))
          setIsTesting(false)
          return
        }
      }

      console.log('🖨️ Llamando a testPrinter con ancho:', printerConfig.paperWidth || 58)

      // Agregar timeout de 30 segundos
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: La impresión tardó demasiado')), 30000)
      )

      const result = await Promise.race([
        testPrinter(printerConfig.paperWidth || 58),
        timeoutPromise
      ])

      console.log('Resultado de testPrinter:', result)

      if (result.success) {
        toast.success('Impresión de prueba enviada')
      } else {
        toast.error(result.error || 'Error al imprimir prueba')
      }
    } catch (error) {
      console.error('❌ Error en handleTestPrinter:', error)
      toast.error(error.message || 'Error al imprimir prueba')
    } finally {
      setIsTesting(false)
    }
  }

  const handleDisablePrinter = async () => {
    try {
      const newConfig = { ...printerConfig, enabled: false }
      setPrinterConfig(newConfig)
      await savePrinterConfig(getBusinessId(), newConfig)
      toast.success('Impresora deshabilitada')
    } catch (error) {
      console.error('Error disabling printer:', error)
      toast.error('Error al deshabilitar impresora')
    }
  }

  const handleManualConnect = async () => {
    if (!manualAddress.trim()) {
      toast.error('Ingresa la dirección MAC de la impresora')
      return
    }

    // Validar formato de dirección MAC (XX:XX:XX:XX:XX:XX)
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    if (!macRegex.test(manualAddress.trim())) {
      toast.error('Formato de dirección MAC inválido. Usa el formato XX:XX:XX:XX:XX:XX')
      return
    }

    await handleConnectPrinter(manualAddress.trim(), manualName.trim() || 'Impresora Manual')
    setShowManualConnect(false)
    setManualAddress('')
    setManualName('')
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
    { id: 'impresora', label: 'Impresora', icon: Printer },
    { id: 'seguridad', label: 'Seguridad', icon: Shield },
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
                {/* Campo RUC con botón de búsqueda */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RUC <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="20123456789"
                      {...register('ruc')}
                      className={`flex-1 px-3 py-2 border ${
                        errors.ruc ? 'border-red-500' : 'border-gray-300'
                      } rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
                    />
                    <button
                      type="button"
                      onClick={handleLookupRuc}
                      disabled={isLookingUpRuc}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                      title="Buscar datos del RUC"
                    >
                      {isLookingUpRuc ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errors.ruc && (
                    <p className="text-red-500 text-sm mt-1">{errors.ruc.message}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Ingrese el RUC y haga clic en el botón de búsqueda para autocompletar los datos
                  </p>
                </div>

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

              <Input
                label="Redes Sociales"
                type="text"
                placeholder="@miempresa o facebook.com/miempresa"
                error={errors.socialMedia?.message}
                {...register('socialMedia')}
                helperText="Usuario de Facebook, Instagram u otra red social"
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
              {/* Business Mode Section */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Tipo de Negocio</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Selecciona el modo que mejor se adapte a tu negocio. Esto cambiará las opciones del menú lateral.
                </p>
                <div className="space-y-3">
                  <label className={`flex items-start space-x-3 cursor-pointer group p-4 border-2 rounded-lg transition-colors ${
                    businessMode === 'retail'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50/30'
                  }`}>
                    <input
                      type="radio"
                      name="businessMode"
                      value="retail"
                      checked={businessMode === 'retail'}
                      onChange={(e) => setBusinessMode(e.target.value)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <Store className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      businessMode === 'retail' ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'
                    }`} />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                        Modo Retail (Tienda/Comercio)
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        Para tiendas, comercios, ferreterías, farmacias y negocios de venta de productos.
                        Incluye: POS, productos, inventario, almacenes, compras, proveedores.
                      </p>
                    </div>
                  </label>

                  <label className={`flex items-start space-x-3 cursor-pointer group p-4 border-2 rounded-lg transition-colors ${
                    businessMode === 'restaurant'
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/30'
                  }`}>
                    <input
                      type="radio"
                      name="businessMode"
                      value="restaurant"
                      checked={businessMode === 'restaurant'}
                      onChange={(e) => setBusinessMode(e.target.value)}
                      className="mt-1 w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
                    />
                    <UtensilsCrossed className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      businessMode === 'restaurant' ? 'text-orange-600' : 'text-gray-400 group-hover:text-orange-600'
                    }`} />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-orange-900">
                        Modo Restaurante
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        Para restaurantes, cafeterías, bares y negocios de comida.
                        Incluye: mesas, mozos, órdenes, cocina, menú/productos, caja, reportes.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Restaurant Operations Section - Only show in restaurant mode */}
              {businessMode === 'restaurant' && (
                <>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">Operaciones de Restaurante</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Configura cómo funciona el flujo de órdenes y cocina en tu restaurante
                    </p>
                    <div className="space-y-4">
                      <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                        <input
                          type="checkbox"
                          checked={restaurantConfig.itemStatusTracking}
                          onChange={(e) => setRestaurantConfig({...restaurantConfig, itemStatusTracking: e.target.checked})}
                          className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                            Seguimiento de estado por item individual
                          </span>
                          <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                            {restaurantConfig.itemStatusTracking
                              ? '✓ Habilitado: Cada plato/item de la orden se marca individualmente (Pendiente → Preparando → Listo → Entregado). Los platos pueden estar listos en diferentes momentos. Ideal para restaurantes con múltiples estaciones de cocina o menús extensos.'
                              : '✗ Deshabilitado: La orden completa se marca como un todo (Pendiente → En preparación → Lista → Entregada). Más simple y rápido para operaciones pequeñas, cafeterías o negocios con preparación rápida.'}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-gray-200"></div>
                </>
              )}

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

                  <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={allowPriceEdit}
                      onChange={(e) => setAllowPriceEdit(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                        Permitir modificar precio de productos en el POS
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        {allowPriceEdit
                          ? '✓ Habilitado: Podrás editar el precio de venta de cualquier producto directamente desde el carrito del punto de venta. Útil para aplicar descuentos personalizados, promociones especiales o ajustar precios según el cliente.'
                          : '✗ Deshabilitado: Los productos se venderán siempre al precio registrado en el catálogo sin posibilidad de modificarlo. Recomendado para mantener precios fijos y evitar errores de digitación.'}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={hideRucIgvInNotaVenta}
                      onChange={(e) => setHideRucIgvInNotaVenta(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                        Ocultar RUC e IGV en Notas de Venta
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        {hideRucIgvInNotaVenta
                          ? '✓ Habilitado: Las notas de venta no mostrarán el RUC de la empresa ni el desglose del IGV en la impresión. Solo se mostrará el total final.'
                          : '✗ Deshabilitado: Las notas de venta mostrarán el RUC de la empresa y el desglose de subtotal e IGV (18%) como es usual.'}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={allowPartialPayments}
                      onChange={(e) => setAllowPartialPayments(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                        Permitir pagos parciales en Notas de Venta
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        {allowPartialPayments
                          ? '✓ Habilitado: Podrás registrar pagos parciales en las notas de venta. El sistema mostrará el monto pagado y el saldo pendiente. Útil para adelantos o pagos en cuotas.'
                          : '✗ Deshabilitado: Las notas de venta solo se pueden emitir con pago completo. No se mostrarán opciones de pago parcial en el punto de venta.'}
                      </p>
                      <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 bg-amber-50 rounded-md border border-amber-200">
                        <Info className="w-4 h-4 text-amber-600" />
                        <span className="text-xs text-amber-700 font-medium">
                          {allowPartialPayments
                            ? 'Los clientes pueden adelantar o pagar en cuotas'
                            : 'Solo pagos completos'}
                        </span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Configuración de Envío a SUNAT */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Envío a SUNAT</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configura el comportamiento del envío de comprobantes a SUNAT
                </p>

                {/* Auto Send to SUNAT */}
                <div className="space-y-4">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSendToSunat}
                      onChange={e => setAutoSendToSunat(e.target.checked)}
                      className="mt-1 h-4 w-4 text-primary-600 rounded focus:ring-primary-500 border-gray-300"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Envío automático a SUNAT desde el POS</div>
                      <p className="text-sm text-gray-600 mt-1">
                        Cuando está activado, los comprobantes se envían automáticamente a SUNAT al completar una venta en el punto de venta.
                        Si está desactivado, deberás enviarlos manualmente desde la lista de comprobantes.
                      </p>
                      <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 bg-blue-50 rounded-md">
                        <Info className="w-4 h-4 text-blue-600" />
                        <span className="text-xs text-blue-700">
                          {autoSendToSunat
                            ? 'Los comprobantes se enviarán automáticamente'
                            : 'Los comprobantes requerirán envío manual'}
                        </span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Configuración de Comprobantes */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Gestión de Comprobantes</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configura las opciones de seguridad para la gestión de comprobantes
                </p>

                <div className="space-y-4">
                  <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={allowDeleteInvoices}
                      onChange={(e) => setAllowDeleteInvoices(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                        Permitir eliminar comprobantes
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        {allowDeleteInvoices
                          ? '✓ Habilitado: Se mostrará el botón "Eliminar" para notas de venta y comprobantes no enviados a SUNAT. Útil para corregir errores de captura, pero menos seguro desde el punto de vista contable.'
                          : '✗ Deshabilitado: Solo se podrán ANULAR las notas de venta (se mantiene el registro y se devuelve el stock). Las facturas y boletas aceptadas por SUNAT solo se pueden anular mediante Nota de Crédito. Recomendado para mayor control y seguridad contable.'}
                      </p>
                      <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 bg-amber-50 rounded-md border border-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span className="text-xs text-amber-700 font-medium">
                          {allowDeleteInvoices
                            ? 'Mayor flexibilidad, menor control'
                            : 'Mayor control y trazabilidad'}
                        </span>
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={allowCustomEmissionDate}
                      onChange={(e) => setAllowCustomEmissionDate(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                        Permitir seleccionar fecha de emisión en el POS
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        {allowCustomEmissionDate
                          ? '✓ Habilitado: Se mostrará un selector de fecha en el punto de venta para emitir comprobantes con fechas anteriores (hasta 3 días para facturas, 7 días para boletas según normativa SUNAT).'
                          : '✗ Deshabilitado: Los comprobantes siempre se emiten con la fecha actual del sistema.'}
                      </p>
                      <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 bg-blue-50 rounded-md border border-blue-200">
                        <Info className="w-4 h-4 text-blue-600" />
                        <span className="text-xs text-blue-700 font-medium">
                          {allowCustomEmissionDate
                            ? 'Útil para regularizar ventas de días anteriores'
                            : 'Emisión con fecha actual solamente'}
                        </span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Configuración de Guías de Remisión */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Guías de Remisión Electrónicas (GRE)</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Habilita la emisión de guías de remisión electrónicas homologadas con SUNAT
                </p>

                <div className="space-y-4">
                  <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={dispatchGuidesEnabled}
                      onChange={e => setDispatchGuidesEnabled(e.target.checked)}
                      className="mt-1 h-4 w-4 text-primary-600 rounded focus:ring-primary-500 border-gray-300"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 group-hover:text-primary-900">
                        Habilitar Guías de Remisión Electrónicas
                      </div>
                      <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {dispatchGuidesEnabled
                          ? '✓ Habilitado: Aparecerá la opción "Guías de Remisión" en el menú lateral. Podrás emitir guías de remisión electrónicas validadas por SUNAT para el transporte de mercancías.'
                          : '✗ Deshabilitado: No se mostrarán las guías de remisión en el sistema.'}
                      </p>
                      <div className="mt-3 p-3 bg-blue-50 rounded-md">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="text-xs text-blue-800 space-y-1">
                            <p className="font-medium">Obligatorio desde julio 2025</p>
                            <p>
                              Las Guías de Remisión Electrónicas (GRE) son documentos obligatorios para el traslado de bienes.
                              Permiten trazabilidad completa del transporte y control fiscal por SUNAT.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Configuración de Privacidad */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Privacidad y Permisos</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configura qué información pueden ver los usuarios secundarios
                </p>

                <div className="space-y-4">
                  <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={hideDashboardDataFromSecondary}
                      onChange={e => setHideDashboardDataFromSecondary(e.target.checked)}
                      className="mt-1 h-4 w-4 text-primary-600 rounded focus:ring-primary-500 border-gray-300"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 group-hover:text-primary-900">
                        Ocultar datos del dashboard a usuarios secundarios
                      </div>
                      <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {hideDashboardDataFromSecondary
                          ? '✓ Habilitado: Los usuarios secundarios verán el dashboard con todos los valores en cero. Solo el propietario y administradores podrán ver las estadísticas reales de ventas, ingresos y otros datos sensibles.'
                          : '✗ Deshabilitado: Todos los usuarios pueden ver las estadísticas completas del dashboard incluyendo ventas totales, ingresos, productos más vendidos y gráficas.'}
                      </p>
                      <div className="mt-3 p-3 bg-purple-50 rounded-md border border-purple-200">
                        <div className="flex items-start gap-2">
                          <Shield className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                          <div className="text-xs text-purple-800 space-y-1">
                            <p className="font-medium">Control de información sensible</p>
                            <p>
                              Útil cuando tienes empleados o vendedores y quieres mantener privada la información financiera del negocio.
                              Los usuarios secundarios seguirán teniendo acceso a sus funciones asignadas (POS, clientes, productos, etc.).
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </label>
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
                      businessMode: businessMode,
                      restaurantConfig: restaurantConfig,
                      allowNegativeStock: allowNegativeStock,
                      allowCustomProducts: allowCustomProducts,
                      allowPriceEdit: allowPriceEdit,
                      hideRucIgvInNotaVenta: hideRucIgvInNotaVenta,
                      allowPartialPayments: allowPartialPayments,
                      allowDeleteInvoices: allowDeleteInvoices,
                      autoSendToSunat: autoSendToSunat,
                      dispatchGuidesEnabled: dispatchGuidesEnabled,
                      allowCustomEmissionDate: allowCustomEmissionDate,
                      hideDashboardDataFromSecondary: hideDashboardDataFromSecondary,
                      updatedAt: serverTimestamp(),
                    }, { merge: true })
                    toast.success('Preferencias guardadas exitosamente. Recarga la página para ver los cambios en el menú.')
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

            {/* Cotizaciones */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Cotizaciones</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serie
                  </label>
                  <Input
                    value={series.cotizacion.serie}
                    onChange={e => handleSeriesChange('cotizacion', 'serie', e.target.value)}
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
                    value={series.cotizacion.lastNumber}
                    onChange={e => handleSeriesChange('cotizacion', 'lastNumber', e.target.value)}
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
                    value={getNextNumber(series.cotizacion.serie, series.cotizacion.lastNumber)}
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

            {/* Guías de Remisión */}
            <div className="pt-4 border-t">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Guías de Remisión Electrónicas (SUNAT)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serie
                  </label>
                  <Input
                    value={series.guia_remision.serie}
                    onChange={e => handleSeriesChange('guia_remision', 'serie', e.target.value)}
                    disabled={!editingSeries}
                    className={!editingSeries ? 'bg-gray-100' : ''}
                    maxLength={4}
                    placeholder="T001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Último Número
                  </label>
                  <Input
                    type="number"
                    value={series.guia_remision.lastNumber}
                    onChange={e => handleSeriesChange('guia_remision', 'lastNumber', e.target.value)}
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
                    value={getNextNumber(series.guia_remision.serie, series.guia_remision.lastNumber)}
                    disabled
                    className="bg-gray-100 font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Para documentar el traslado de bienes. Obligatorio desde julio 2025 para transporte de mercancías.
              </p>
            </div>
          </div>
        </CardContent>
        </Card>
      )}

      {/* Tab Content - Impresora */}
      {activeTab === 'impresora' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-primary-600" />
                <CardTitle>Configuración de Impresora Térmica</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Información */}
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                  <div className="flex items-start">
                    <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold mb-1">Impresión Térmica WiFi/Bluetooth</p>
                      <p>
                        Conecta una impresora térmica (ticketera) para imprimir automáticamente tickets,
                        comandas de cocina y precuentas desde la app móvil.
                      </p>
                      <p className="mt-2">
                        <strong>Nota:</strong> Esta funcionalidad solo está disponible en la app móvil Android.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Impresora configurada */}
                {printerConfig.enabled && printerConfig.address && (
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex flex-col space-y-3">
                        <div className="flex items-start space-x-3">
                          <div className="bg-green-100 p-2 rounded-full flex-shrink-0">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900">{printerConfig.name || 'Impresora Térmica'}</p>
                            <p className="text-sm text-gray-600 break-all">Dirección: {printerConfig.address}</p>
                            <p className="text-sm text-gray-600">Tipo: {printerConfig.type === 'bluetooth' ? 'Bluetooth' : 'WiFi'}</p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleTestPrinter}
                            disabled={isTesting}
                            className="flex-1 sm:flex-initial"
                          >
                            {isTesting ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Imprimiendo...
                              </>
                            ) : (
                              <>
                                <Printer className="w-4 h-4 mr-2" />
                                Probar
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDisablePrinter}
                            className="flex-1 sm:flex-initial"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Deshabilitar
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Configuración de ancho de papel */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Ancho de Papel
                      </label>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleChangePaperWidth(58)}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                            printerConfig.paperWidth === 58
                              ? 'border-primary-600 bg-primary-50 text-primary-700'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          <div className="font-semibold">58mm</div>
                          <div className="text-xs mt-1">Impresoras pequeñas</div>
                        </button>
                        <button
                          onClick={() => handleChangePaperWidth(80)}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                            printerConfig.paperWidth === 80
                              ? 'border-primary-600 bg-primary-50 text-primary-700'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          <div className="font-semibold">80mm</div>
                          <div className="text-xs mt-1">Impresoras estándar</div>
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Selecciona el ancho de papel de tu impresora térmica. Esto ajustará automáticamente el formato de impresión.
                      </p>
                    </div>

                    {/* Modo legible para impresión web */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          id="webPrintLegible"
                          checked={printerConfig.webPrintLegible || false}
                          onChange={async (e) => {
                            const newConfig = {
                              ...printerConfig,
                              webPrintLegible: e.target.checked
                            }
                            setPrinterConfig(newConfig)
                            await savePrinterConfig(getBusinessId(), newConfig)
                            toast.success(e.target.checked ? 'Modo legible activado' : 'Modo legible desactivado')
                          }}
                          className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <div className="flex-1">
                          <label htmlFor="webPrintLegible" className="block text-sm font-medium text-gray-700 cursor-pointer">
                            Impresión Web Legible
                          </label>
                          <p className="text-xs text-gray-500 mt-1">
                            Activa esta opción para hacer las letras más grandes y gruesas al imprimir desde el navegador web (comprobantes, precuentas, comandas). No afecta la impresión térmica Bluetooth.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Escanear impresoras */}
                {(!printerConfig.enabled || !printerConfig.address) && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={handleScanPrinters}
                        disabled={isScanning}
                        className="flex-1 sm:flex-initial"
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Escaneando...
                          </>
                        ) : (
                          <>
                            <Printer className="w-4 h-4 mr-2" />
                            Buscar Impresoras Bluetooth
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowManualConnect(!showManualConnect)}
                        className="flex-1 sm:flex-initial"
                      >
                        {showManualConnect ? 'Cancelar' : 'Conexión Manual'}
                      </Button>
                    </div>
                    <p className="text-sm text-gray-500">
                      {showManualConnect
                        ? 'Ingresa la dirección MAC de tu impresora si ya está emparejada con tu celular'
                        : 'Asegúrate de que tu impresora esté encendida y en modo de emparejamiento'
                      }
                    </p>

                    {/* Formulario de conexión manual */}
                    {showManualConnect && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Dirección MAC de la impresora *
                          </label>
                          <Input
                            type="text"
                            placeholder="XX:XX:XX:XX:XX:XX"
                            value={manualAddress}
                            onChange={(e) => setManualAddress(e.target.value.toUpperCase())}
                            className="font-mono"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Formato: 00:11:22:AA:BB:CC (puedes encontrarla en la configuración de Bluetooth de tu celular)
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nombre de la impresora (opcional)
                          </label>
                          <Input
                            type="text"
                            placeholder="Mi impresora térmica"
                            value={manualName}
                            onChange={(e) => setManualName(e.target.value)}
                          />
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded p-3">
                          <p className="text-xs text-blue-800">
                            <strong>Cómo encontrar la dirección MAC:</strong><br />
                            1. Ve a Configuración → Bluetooth en tu celular<br />
                            2. Busca tu impresora en la lista de dispositivos emparejados<br />
                            3. Toca en el ícono de información (⚙️ o ℹ️)<br />
                            4. Copia la dirección MAC que aparece
                          </p>
                        </div>
                        <Button
                          onClick={handleManualConnect}
                          disabled={isConnecting || !manualAddress.trim()}
                          className="w-full"
                        >
                          {isConnecting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Conectando...
                            </>
                          ) : (
                            'Conectar Impresora'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Lista de impresoras encontradas */}
                {availablePrinters.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">
                      Impresoras encontradas ({availablePrinters.length})
                    </h3>
                    <div className="space-y-2">
                      {availablePrinters.map((printer) => (
                        <div
                          key={printer.address}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          <div>
                            <p className="font-medium text-gray-900">{printer.name || 'Impresora sin nombre'}</p>
                            <p className="text-sm text-gray-500">{printer.address}</p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleConnectPrinter(printer.address, printer.name)}
                            disabled={isConnecting}
                          >
                            {isConnecting ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Conectando...
                              </>
                            ) : (
                              'Conectar'
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Instrucciones */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">¿Cómo configurar tu impresora?</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                    <li>Enciende tu impresora térmica (ticketera)</li>
                    <li>Activa el Bluetooth en tu dispositivo móvil</li>
                    <li>Haz clic en "Buscar Impresoras Bluetooth"</li>
                    <li>Selecciona tu impresora de la lista y haz clic en "Conectar"</li>
                    <li>Una vez conectada, prueba la impresión con el botón "Probar"</li>
                    <li>¡Listo! Ahora puedes imprimir tickets, comandas y precuentas directamente desde la app</li>
                  </ol>
                  <p className="text-xs text-gray-500 mt-3">
                    <strong>Compatibilidad:</strong> Compatible con impresoras térmicas ESC/POS de 58mm y 80mm
                    (Epson, Star, Bixolon, y otras marcas compatibles con ESC/POS)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab Content - Seguridad */}
      {activeTab === 'seguridad' && (
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-primary-600" />
              <CardTitle>Seguridad de la Cuenta</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Info del usuario */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <Info className="w-5 h-5 text-gray-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Correo electrónico</p>
                    <p className="text-sm text-gray-600 mt-1">{user?.email}</p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Formulario de cambio de contraseña */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Cambiar Contraseña</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Asegúrate de usar una contraseña segura con al menos 6 caracteres
                </p>

                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  {/* Contraseña actual */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contraseña Actual
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Ingresa tu contraseña actual"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Nueva contraseña */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nueva Contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Ingresa tu nueva contraseña"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNewPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres</p>
                  </div>

                  {/* Confirmar contraseña */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirmar Nueva Contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Confirma tu nueva contraseña"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Botón de submit */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={isChangingPassword}
                    >
                      {isChangingPassword ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Cambiando contraseña...
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          Cambiar Contraseña
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Recomendaciones de seguridad */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Recomendaciones de Seguridad</h4>
                <ul className="space-y-1 text-sm text-blue-800">
                  <li className="flex items-start">
                    <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Usa una contraseña única que no uses en otros sitios</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Combina letras mayúsculas, minúsculas, números y símbolos</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Cambia tu contraseña regularmente</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>No compartas tu contraseña con nadie</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
