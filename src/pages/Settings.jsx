import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, Building2, FileText, Loader2, CheckCircle, AlertCircle, Shield, Upload, Eye, EyeOff, Lock, X, Image, Info, Settings as SettingsIcon, Store, UtensilsCrossed, Printer, AlertTriangle, Search, Pill, Home, Bluetooth, Wifi, Hash, Palette, ShoppingCart, Cog, Globe, ExternalLink, Copy, Check, QrCode, Download, Warehouse, Edit, MapPin, Plus, Bell } from 'lucide-react'
import QRCode from 'qrcode'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { invalidateLogoCache } from '@/utils/pdfGenerator'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
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
  testPrinter,
  getConnectionType
} from '@/services/thermalPrinterService'
import { getWarehouses } from '@/services/warehouseService'
import { getAllWarehouseSeries, updateWarehouseSeries, getAllBranchSeriesFS, updateBranchSeriesFS } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'
import { getYapeConfig, saveYapeConfig } from '@/services/yapeService'

// URL base de producción para el catálogo público
const PRODUCTION_URL = 'https://cobrifyperu.com'

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

  // Estados para series por almacén (legacy - para compatibilidad)
  const [warehouses, setWarehouses] = useState([])
  const [warehouseSeries, setWarehouseSeries] = useState({})
  const [editingWarehouseId, setEditingWarehouseId] = useState(null)
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)

  // Estados para series por sucursal (nuevo sistema)
  const [branches, setBranches] = useState([])
  const [branchSeries, setBranchSeries] = useState({})
  const [editingBranchId, setEditingBranchId] = useState(null)
  const [loadingBranches, setLoadingBranches] = useState(false)

  // Series por defecto para nuevos almacenes
  const defaultSeries = {
    factura: { serie: 'F001', lastNumber: 0 },
    boleta: { serie: 'B001', lastNumber: 0 },
    nota_venta: { serie: 'N001', lastNumber: 0 },
    cotizacion: { serie: 'C001', lastNumber: 0 },
    nota_credito_factura: { serie: 'FN01', lastNumber: 0 },
    nota_credito_boleta: { serie: 'BN01', lastNumber: 0 },
    nota_debito_factura: { serie: 'FD01', lastNumber: 0 },
    nota_debito_boleta: { serie: 'BD01', lastNumber: 0 },
    guia_remision: { serie: 'T001', lastNumber: 0 },
    guia_transportista: { serie: 'V001', lastNumber: 0 },
  }

  // Estados para SUNAT
  const [sunatConfig, setSunatConfig] = useState({
    enabled: false,
    environment: 'beta',
    solUser: '',
    solPassword: '',
    clientId: '',
    clientSecret: '',
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

  // Estado para color de PDF
  const [pdfAccentColor, setPdfAccentColor] = useState('#464646') // Gris oscuro por defecto

  // Estado para eslogan de empresa (aparece en el PDF debajo del logo)
  const [companySlogan, setCompanySlogan] = useState('')

  // Estados para configuración de inventario
  const [allowNegativeStock, setAllowNegativeStock] = useState(false)
  const [allowCustomProducts, setAllowCustomProducts] = useState(false)
  const [allowPriceEdit, setAllowPriceEdit] = useState(false)
  const [enableProductImages, setEnableProductImages] = useState(false)
  const [defaultDocumentType, setDefaultDocumentType] = useState('boleta') // boleta, factura, nota_venta

  // Estados para configuración de notas de venta
  const [hideRucIgvInNotaVenta, setHideRucIgvInNotaVenta] = useState(false)
  const [allowPartialPayments, setAllowPartialPayments] = useState(false)

  // Estados para configuración de comprobantes
  const [allowDeleteInvoices, setAllowDeleteInvoices] = useState(false)

  // Estados para configuración de SUNAT
  const [autoSendToSunat, setAutoSendToSunat] = useState(false)

  // Estados para fecha de emisión
  const [allowCustomEmissionDate, setAllowCustomEmissionDate] = useState(false)

  // Estados para múltiples precios
  const [multiplePricesEnabled, setMultiplePricesEnabled] = useState(false)
  const [priceLabels, setPriceLabels] = useState({
    price1: 'Público',
    price2: 'Mayorista',
    price3: 'VIP',
    price4: 'Especial'
  })

  // Estado para presentaciones de venta
  const [presentationsEnabled, setPresentationsEnabled] = useState(false)

  // Estados para privacidad
  const [hideDashboardDataFromSecondary, setHideDashboardDataFromSecondary] = useState(false)

  // Estados para menú personalizado
  const [hiddenMenuItems, setHiddenMenuItems] = useState([])

  // Estados para catálogo público
  const [catalogEnabled, setCatalogEnabled] = useState(false)
  const [catalogSlug, setCatalogSlug] = useState('')
  const [catalogColor, setCatalogColor] = useState('#10B981')
  const [catalogWelcome, setCatalogWelcome] = useState('')
  const [catalogTagline, setCatalogTagline] = useState('')
  const [catalogQrDataUrl, setCatalogQrDataUrl] = useState('')
  const qrCanvasRef = useRef(null)

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

  // Estados para configuración de Yape
  const [yapeConfig, setYapeConfig] = useState({
    enabled: false,
    notifyAllUsers: true,
    notifyUsers: [],
    autoStartListening: true
  })
  const [businessUsers, setBusinessUsers] = useState([])
  const [isSavingYape, setIsSavingYape] = useState(false)
  const [isLoadingYape, setIsLoadingYape] = useState(false)

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
  const [showWifiConnect, setShowWifiConnect] = useState(false) // Para mostrar formulario WiFi
  const [wifiIp, setWifiIp] = useState('')
  const [wifiPort, setWifiPort] = useState('9100')
  const [wifiName, setWifiName] = useState('')

  // Estado para búsqueda de RUC
  const [isLookingUpRuc, setIsLookingUpRuc] = useState(false)
  const [manualAddress, setManualAddress] = useState('')
  const [manualName, setManualName] = useState('')

  // Estado para cuentas bancarias estructuradas
  const [bankAccounts, setBankAccounts] = useState([])
  // Estructura: [{ bank: 'BCP', currency: 'PEN', accountNumber: '123-456789-0-12', cci: '00212345678901234567' }]

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

  // Generar QR del catálogo cuando cambie el slug
  useEffect(() => {
    if (catalogSlug && catalogEnabled) {
      const catalogUrl = `${PRODUCTION_URL}/catalogo/${catalogSlug}`
      QRCode.toDataURL(catalogUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }).then(url => {
        setCatalogQrDataUrl(url)
      }).catch(err => {
        console.error('Error generating QR:', err)
      })
    } else {
      setCatalogQrDataUrl('')
    }
  }, [catalogSlug, catalogEnabled])

  // Cargar configuración de Yape cuando se activa el tab
  useEffect(() => {
    const loadYapeSettings = async () => {
      if (activeTab !== 'yape' || !user?.uid || isDemoMode) return

      setIsLoadingYape(true)
      try {
        const businessId = getBusinessId()
        if (!businessId) return

        // Cargar configuración de Yape
        const configResult = await getYapeConfig(businessId)
        if (configResult.success) {
          setYapeConfig(configResult.data)
        }

        // Cargar usuarios del negocio desde múltiples fuentes
        let users = []
        const userIds = new Set()

        // 1. Buscar usuarios con businessId igual
        const usersSnapshot = await getDocs(
          query(
            collection(db, 'users'),
            where('businessId', '==', businessId)
          )
        )
        usersSnapshot.docs.forEach(d => {
          if (!userIds.has(d.id)) {
            userIds.add(d.id)
            users.push({ id: d.id, ...d.data() })
          }
        })

        // 2. También buscar en businesses/{businessId}/users (colección anidada)
        try {
          const nestedUsersSnapshot = await getDocs(
            collection(db, 'businesses', businessId, 'users')
          )
          for (const userDoc of nestedUsersSnapshot.docs) {
            const userId = userDoc.data().userId || userDoc.id
            if (!userIds.has(userId)) {
              userIds.add(userId)
              // Obtener datos completos del usuario
              const fullUserDoc = await getDoc(doc(db, 'users', userId))
              if (fullUserDoc.exists()) {
                users.push({ id: userId, ...fullUserDoc.data() })
              } else {
                users.push({ id: userId, ...userDoc.data() })
              }
            }
          }
        } catch (e) {
          console.log('No hay colección anidada de usuarios:', e.message)
        }

        // 3. Agregar al dueño del negocio
        const businessDoc = await getDoc(doc(db, 'businesses', businessId))
        if (businessDoc.exists()) {
          const business = businessDoc.data()
          const ownerId = business.ownerId || businessId

          if (!userIds.has(ownerId)) {
            userIds.add(ownerId)
            const ownerDoc = await getDoc(doc(db, 'users', ownerId))
            if (ownerDoc.exists()) {
              users.unshift({
                id: ownerId,
                ...ownerDoc.data(),
                isOwner: true
              })
            }
          } else {
            // Marcar al dueño como tal
            const ownerIndex = users.findIndex(u => u.id === ownerId)
            if (ownerIndex >= 0) {
              users[ownerIndex].isOwner = true
            }
          }
        }

        // 4. Si el usuario actual no está en la lista, agregarlo
        if (user?.uid && !userIds.has(user.uid)) {
          const currentUserDoc = await getDoc(doc(db, 'users', user.uid))
          if (currentUserDoc.exists()) {
            users.push({ id: user.uid, ...currentUserDoc.data(), isCurrent: true })
          }
        }

        console.log('Usuarios encontrados para Yape:', users.length, users.map(u => ({ id: u.id, name: u.displayName || u.name || u.email })))
        setBusinessUsers(users)
      } catch (error) {
        console.error('Error al cargar config Yape:', error)
      } finally {
        setIsLoadingYape(false)
      }
    }

    loadYapeSettings()
  }, [activeTab, user, isDemoMode, getBusinessId])

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
          bankAccounts: businessData.bankAccounts || '',
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
            guia_transportista: businessData.series.guia_transportista || { serie: 'V001', lastNumber: 0 },
          })
        }

        // Cargar configuración SUNAT
        if (businessData.sunat) {
          setSunatConfig({
            enabled: businessData.sunat.enabled || false,
            environment: businessData.sunat.environment || 'beta',
            solUser: businessData.sunat.solUser || '',
            solPassword: businessData.sunat.solPassword || '',
            clientId: businessData.sunat.clientId || '',
            clientSecret: businessData.sunat.clientSecret || '',
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

        // Cargar color de PDF
        if (businessData.pdfAccentColor) {
          setPdfAccentColor(businessData.pdfAccentColor)
        }

        // Cargar eslogan de empresa
        if (businessData.companySlogan) {
          setCompanySlogan(businessData.companySlogan)
        }

        // Cargar cuentas bancarias estructuradas
        if (businessData.bankAccountsList && Array.isArray(businessData.bankAccountsList)) {
          setBankAccounts(businessData.bankAccountsList)
        }

        // Cargar configuración de inventario
        setAllowNegativeStock(businessData.allowNegativeStock || false)
        setAllowCustomProducts(businessData.allowCustomProducts || false)
        setAllowPriceEdit(businessData.allowPriceEdit || false)
        setEnableProductImages(businessData.enableProductImages || false)
        setDefaultDocumentType(businessData.defaultDocumentType || 'boleta')

        // Cargar configuración de notas de venta
        setHideRucIgvInNotaVenta(businessData.hideRucIgvInNotaVenta || false)
        setAllowPartialPayments(businessData.allowPartialPayments || false)

        // Cargar configuración de comprobantes
        setAllowDeleteInvoices(businessData.allowDeleteInvoices || false)

        // Cargar configuración de SUNAT
        setAutoSendToSunat(businessData.autoSendToSunat || false)

        // Cargar configuración de fecha de emisión
        setAllowCustomEmissionDate(businessData.allowCustomEmissionDate || false)

        // Cargar configuración de múltiples precios
        setMultiplePricesEnabled(businessData.multiplePricesEnabled || false)
        // Cargar configuración de presentaciones de venta
        setPresentationsEnabled(businessData.presentationsEnabled || false)
        if (businessData.priceLabels) {
          setPriceLabels({
            price1: businessData.priceLabels.price1 || 'Público',
            price2: businessData.priceLabels.price2 || 'Mayorista',
            price3: businessData.priceLabels.price3 || 'VIP',
            price4: businessData.priceLabels.price4 || 'Especial'
          })
        }

        // Cargar configuración de privacidad
        setHideDashboardDataFromSecondary(businessData.hideDashboardDataFromSecondary || false)

        // Cargar menú personalizado
        if (businessData.hiddenMenuItems && Array.isArray(businessData.hiddenMenuItems)) {
          setHiddenMenuItems(businessData.hiddenMenuItems)
        }

        // Cargar configuración de catálogo
        setCatalogEnabled(businessData.catalogEnabled || false)
        setCatalogSlug(businessData.catalogSlug || '')
        setCatalogColor(businessData.catalogColor || '#10B981')
        setCatalogWelcome(businessData.catalogWelcome || '')
        setCatalogTagline(businessData.catalogTagline || '')

        // Cargar modo de negocio
        setBusinessMode(businessData.businessMode || 'retail')
        if (businessData.restaurantConfig) {
          setRestaurantConfig(businessData.restaurantConfig)
        }

        // Cargar configuración de impresora desde localStorage (por dispositivo)
        const localPrinterConfig = await getPrinterConfig(getBusinessId())
        if (localPrinterConfig.success && localPrinterConfig.config) {
          // Merge con valores por defecto para asegurar que todos los campos existan
          setPrinterConfig(prev => ({
            ...prev,
            ...localPrinterConfig.config
          }))
        }
      }
    } catch (error) {
      console.error('Error al cargar configuración:', error)
      toast.error('Error al cargar la configuración. Por favor, recarga la página.')
    } finally {
      setIsLoading(false)
    }
  }

  // Cargar almacenes y sus series
  const loadWarehousesAndSeries = async () => {
    if (!user?.uid || isDemoMode) return

    setLoadingWarehouses(true)
    try {
      // Cargar almacenes
      const warehousesResult = await getWarehouses(getBusinessId())
      if (warehousesResult.success) {
        setWarehouses(warehousesResult.data || [])
      }

      // Cargar series por almacén
      const seriesResult = await getAllWarehouseSeries(getBusinessId())
      if (seriesResult.success) {
        setWarehouseSeries(seriesResult.data || {})
      }
    } catch (error) {
      console.error('Error al cargar almacenes y series:', error)
    } finally {
      setLoadingWarehouses(false)
    }
  }

  // Cargar almacenes cuando se abre el tab de series
  useEffect(() => {
    if (activeTab === 'series' && user?.uid && !isDemoMode) {
      loadWarehousesAndSeries()
    }
  }, [activeTab, user?.uid])

  // Manejar cambio de serie de almacén
  const handleWarehouseSeriesChange = (warehouseId, docType, field, value) => {
    setWarehouseSeries(prev => ({
      ...prev,
      [warehouseId]: {
        ...defaultSeries,
        ...(prev[warehouseId] || {}),
        [docType]: {
          ...(prev[warehouseId]?.[docType] || defaultSeries[docType]),
          [field]: field === 'lastNumber' ? parseInt(value) || 0 : value.toUpperCase()
        }
      }
    }))
  }

  // Guardar series de un almacén
  const handleSaveWarehouseSeries = async (warehouseId) => {
    if (!user?.uid) return

    setIsSaving(true)
    try {
      const seriesToSave = warehouseSeries[warehouseId] || defaultSeries
      const result = await updateWarehouseSeries(getBusinessId(), warehouseId, seriesToSave)

      if (result.success) {
        toast.success('Series del almacén actualizadas')
        setEditingWarehouseId(null)
      } else {
        toast.error(result.error || 'Error al guardar series')
      }
    } catch (error) {
      console.error('Error al guardar series:', error)
      toast.error('Error al guardar series')
    } finally {
      setIsSaving(false)
    }
  }

  // Inicializar series de un almacén si no existen
  const initializeWarehouseSeries = (warehouseId, warehouseIndex) => {
    if (!warehouseSeries[warehouseId]) {
      // Generar series únicas basadas en el índice del almacén
      const suffix = String(warehouseIndex + 1).padStart(2, '0')
      const newSeries = {
        factura: { serie: `F0${suffix}`, lastNumber: 0 },
        boleta: { serie: `B0${suffix}`, lastNumber: 0 },
        nota_venta: { serie: `N0${suffix}`, lastNumber: 0 },
        cotizacion: { serie: `C0${suffix}`, lastNumber: 0 },
        nota_credito_factura: { serie: `FN${suffix}`, lastNumber: 0 },
        nota_credito_boleta: { serie: `BN${suffix}`, lastNumber: 0 },
        nota_debito_factura: { serie: `FD${suffix}`, lastNumber: 0 },
        nota_debito_boleta: { serie: `BD${suffix}`, lastNumber: 0 },
        guia_remision: { serie: `T0${suffix}`, lastNumber: 0 },
        guia_transportista: { serie: `V0${suffix}`, lastNumber: 0 },
      }
      setWarehouseSeries(prev => ({
        ...prev,
        [warehouseId]: newSeries
      }))
    }
    setEditingWarehouseId(warehouseId)
  }

  // ====== FUNCIONES PARA SUCURSALES ======

  // Cargar sucursales y sus series
  const loadBranchesAndSeries = async () => {
    if (!user?.uid || isDemoMode) return

    setLoadingBranches(true)
    try {
      // Cargar sucursales activas
      const branchesResult = await getActiveBranches(getBusinessId())
      if (branchesResult.success) {
        setBranches(branchesResult.data || [])
      }

      // Cargar series por sucursal
      const seriesResult = await getAllBranchSeriesFS(getBusinessId())
      if (seriesResult.success) {
        setBranchSeries(seriesResult.data || {})
      }
    } catch (error) {
      console.error('Error al cargar sucursales y series:', error)
    } finally {
      setLoadingBranches(false)
    }
  }

  // Cargar sucursales cuando se abre el tab de series
  useEffect(() => {
    if (activeTab === 'series' && user?.uid && !isDemoMode) {
      loadBranchesAndSeries()
    }
  }, [activeTab, user?.uid])

  // Manejar cambio de serie de sucursal
  const handleBranchSeriesChange = (branchId, docType, field, value) => {
    setBranchSeries(prev => ({
      ...prev,
      [branchId]: {
        ...defaultSeries,
        ...(prev[branchId] || {}),
        [docType]: {
          ...(prev[branchId]?.[docType] || defaultSeries[docType]),
          [field]: field === 'lastNumber' ? parseInt(value) || 0 : value.toUpperCase()
        }
      }
    }))
  }

  // Guardar series de una sucursal
  const handleSaveBranchSeries = async (branchId) => {
    if (!user?.uid) return

    setIsSaving(true)
    try {
      const seriesToSave = branchSeries[branchId] || defaultSeries
      const result = await updateBranchSeriesFS(getBusinessId(), branchId, seriesToSave)

      if (result.success) {
        toast.success('Series de la sucursal actualizadas')
        setEditingBranchId(null)
      } else {
        toast.error(result.error || 'Error al guardar series')
      }
    } catch (error) {
      console.error('Error al guardar series:', error)
      toast.error('Error al guardar series')
    } finally {
      setIsSaving(false)
    }
  }

  // Inicializar series de una sucursal si no existen
  const initializeBranchSeries = (branchId, branchIndex) => {
    if (!branchSeries[branchId]) {
      // Generar series únicas basadas en el índice de la sucursal
      const suffix = String(branchIndex + 1).padStart(3, '0')
      const newSeries = {
        factura: { serie: `F${suffix}`, lastNumber: 0 },
        boleta: { serie: `B${suffix}`, lastNumber: 0 },
        nota_venta: { serie: `N${suffix}`, lastNumber: 0 },
        cotizacion: { serie: `C${suffix}`, lastNumber: 0 },
        nota_credito_factura: { serie: `FC${suffix}`, lastNumber: 0 },
        nota_credito_boleta: { serie: `BC${suffix}`, lastNumber: 0 },
        nota_debito_factura: { serie: `FD${suffix}`, lastNumber: 0 },
        nota_debito_boleta: { serie: `BD${suffix}`, lastNumber: 0 },
        guia_remision: { serie: `T${suffix}`, lastNumber: 0 },
        guia_transportista: { serie: `V${suffix}`, lastNumber: 0 },
      }
      setBranchSeries(prev => ({
        ...prev,
        [branchId]: newSeries
      }))
    }
    setEditingBranchId(branchId)
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
      // Invalidar caché del logo
      invalidateLogoCache()
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
          // Invalidar caché del logo para que se descargue el nuevo
          invalidateLogoCache()
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
        bankAccounts: data.bankAccounts || '', // Campo legacy (texto libre)
        bankAccountsList: bankAccounts, // Cuentas estructuradas
        address: data.address,
        urbanization: data.urbanization,
        district: data.district,
        province: data.province,
        department: data.department,
        ubigeo: data.ubigeo,
        logoUrl: uploadedLogoUrl || null,
        pdfAccentColor: pdfAccentColor,
        companySlogan: companySlogan || '',
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
        clientId: sunatConfig.clientId,
        clientSecret: sunatConfig.clientSecret, // TODO: Encriptar
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

  // Función para guardar configuración de Yape
  const handleSaveYapeConfig = async () => {
    if (isDemoMode) {
      toast.error('No se puede modificar en modo demo')
      return
    }

    const businessId = getBusinessId()
    if (!businessId) {
      toast.error('No se encontró el ID del negocio')
      return
    }

    setIsSavingYape(true)
    try {
      // Guardar directamente en Firestore
      const configRef = doc(db, 'businesses', businessId, 'settings', 'yapeNotifications')

      await setDoc(configRef, {
        enabled: yapeConfig.enabled ?? false,
        notifyUsers: yapeConfig.notifyUsers || [],
        notifyAllUsers: yapeConfig.notifyAllUsers ?? true,
        autoStartListening: yapeConfig.autoStartListening ?? true,
        updatedAt: serverTimestamp()
      }, { merge: true })

      toast.success('Configuración de Yape guardada')
    } catch (error) {
      console.error('Error al guardar config Yape:', error)
      toast.error(`Error: ${error.message}`)
    } finally {
      setIsSavingYape(false)
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

  // Conectar impresora WiFi/LAN
  const handleWifiConnect = async () => {
    if (!wifiIp.trim()) {
      toast.error('Ingresa la dirección IP de la impresora')
      return
    }

    // Validar formato de IP
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(wifiIp.trim())) {
      toast.error('Formato de IP inválido. Usa el formato XXX.XXX.XXX.XXX')
      return
    }

    // Validar puerto
    const port = parseInt(wifiPort, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error('Puerto inválido. Debe ser un número entre 1 y 65535')
      return
    }

    setIsConnecting(true)
    try {
      // Construir dirección con puerto
      const address = `${wifiIp.trim()}:${port}`
      const result = await connectPrinter(address)

      if (result.success) {
        // Guardar configuración
        const newConfig = {
          enabled: true,
          address: address,
          name: wifiName.trim() || 'Impresora WiFi',
          type: 'wifi',
          paperWidth: printerConfig.paperWidth || 58
        }
        setPrinterConfig(newConfig)

        // Guardar en Firestore
        await savePrinterConfig(getBusinessId(), newConfig)

        toast.success('Impresora WiFi conectada exitosamente')
        setShowWifiConnect(false)
        setWifiIp('')
        setWifiPort('9100')
        setWifiName('')
      } else {
        toast.error(result.error || 'Error al conectar impresora WiFi')
      }
    } catch (error) {
      console.error('Error connecting WiFi printer:', error)
      toast.error('Error al conectar impresora WiFi')
    } finally {
      setIsConnecting(false)
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
    { id: 'informacion', label: 'Mi Empresa', icon: Building2 },
    { id: 'preferencias', label: 'Preferencias', icon: SettingsIcon },
    { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
    { id: 'catalogo', label: 'Catálogo', icon: Globe },
    { id: 'series', label: 'Series', icon: FileText },
    { id: 'avanzado', label: 'Avanzado', icon: Cog },
    { id: 'impresora', label: 'Impresora', icon: Printer },
    { id: 'seguridad', label: 'Seguridad', icon: Shield },
    { id: 'yape', label: 'Yape', icon: Bell },
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

              <div className="md:col-span-2">
                <Input
                  label="Eslogan / Descripción"
                  placeholder="Tu frase comercial o descripción breve"
                  value={companySlogan}
                  onChange={(e) => setCompanySlogan(e.target.value.toUpperCase())}
                  maxLength={120}
                  helperText="Aparecerá debajo del logo en el PDF (máx. 120 caracteres, hasta 2 líneas)"
                />
              </div>

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

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Cuentas Bancarias */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cuentas Bancarias
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Estas cuentas aparecerán en tus facturas, boletas y cotizaciones.
                </p>

                {/* Lista de cuentas bancarias */}
                {bankAccounts.length > 0 && (
                  <div className="mb-3 border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Banco</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Tipo</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Moneda</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Nº Cuenta</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">CCI</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {bankAccounts.map((account, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-3 py-2">{account.bank}</td>
                            <td className="px-3 py-2 text-xs">
                              {account.accountType === 'detracciones' ? (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Detracciones</span>
                              ) : account.accountType === 'ahorros' ? (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Ahorros</span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">Corriente</span>
                              )}
                            </td>
                            <td className="px-3 py-2">{account.currency === 'PEN' ? 'Soles' : 'Dólares'}</td>
                            <td className="px-3 py-2 font-mono text-xs">{account.accountNumber}</td>
                            <td className="px-3 py-2 font-mono text-xs">{account.cci || '-'}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setBankAccounts(bankAccounts.filter((_, i) => i !== index))}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Formulario para agregar nueva cuenta */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3 bg-gray-50 rounded-lg">
                  <select
                    id="newBankName"
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    defaultValue=""
                  >
                    <option value="" disabled>Banco</option>
                    <option value="BCP">BCP</option>
                    <option value="BBVA">BBVA</option>
                    <option value="Interbank">Interbank</option>
                    <option value="Scotiabank">Scotiabank</option>
                    <option value="BanBif">BanBif</option>
                    <option value="Pichincha">Pichincha</option>
                    <option value="Banco de la Nación">Banco de la Nación</option>
                    <option value="Otro">Otro</option>
                  </select>
                  <select
                    id="newAccountType"
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    defaultValue="corriente"
                  >
                    <option value="corriente">Cta. Corriente</option>
                    <option value="ahorros">Cta. Ahorros</option>
                    <option value="detracciones">Detracciones</option>
                  </select>
                  <select
                    id="newBankCurrency"
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    defaultValue="PEN"
                  >
                    <option value="PEN">Soles</option>
                    <option value="USD">Dólares</option>
                  </select>
                  <input
                    id="newBankAccount"
                    type="text"
                    placeholder="Nº Cuenta"
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  <input
                    id="newBankCci"
                    type="text"
                    placeholder="CCI (opcional)"
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const bank = document.getElementById('newBankName').value
                      const accountType = document.getElementById('newAccountType').value
                      const currency = document.getElementById('newBankCurrency').value
                      const accountNumber = document.getElementById('newBankAccount').value
                      const cci = document.getElementById('newBankCci').value

                      if (!bank || !accountNumber) {
                        toast.error('Ingresa el banco y número de cuenta')
                        return
                      }

                      setBankAccounts([...bankAccounts, { bank, accountType, currency, accountNumber, cci }])

                      // Limpiar campos
                      document.getElementById('newBankName').value = ''
                      document.getElementById('newAccountType').value = 'corriente'
                      document.getElementById('newBankCurrency').value = 'PEN'
                      document.getElementById('newBankAccount').value = ''
                      document.getElementById('newBankCci').value = ''
                    }}
                    className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Agregar
                  </button>
                </div>
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

      {/* Tab Content - Preferencias (Tipo de negocio + Personalización) */}
      {activeTab === 'preferencias' && (
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <SettingsIcon className="w-5 h-5 text-primary-600" />
              <CardTitle>Preferencias Generales</CardTitle>
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

                  <label className={`flex items-start space-x-3 cursor-pointer group p-4 border-2 rounded-lg transition-colors ${
                    businessMode === 'pharmacy'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-green-300 hover:bg-green-50/30'
                  }`}>
                    <input
                      type="radio"
                      name="businessMode"
                      value="pharmacy"
                      checked={businessMode === 'pharmacy'}
                      onChange={(e) => setBusinessMode(e.target.value)}
                      className="mt-1 w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                    />
                    <Pill className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      businessMode === 'pharmacy' ? 'text-green-600' : 'text-gray-400 group-hover:text-green-600'
                    }`} />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-green-900">
                        Modo Farmacia
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        Para farmacias, boticas y droguerías.
                        Incluye: medicamentos, laboratorios, control de lotes, alertas de vencimiento, inventario FEFO.
                      </p>
                    </div>
                  </label>

                  <label className={`flex items-start space-x-3 cursor-pointer group p-4 border-2 rounded-lg transition-colors ${
                    businessMode === 'real_estate'
                      ? 'border-cyan-500 bg-cyan-50'
                      : 'border-gray-200 hover:border-cyan-300 hover:bg-cyan-50/30'
                  }`}>
                    <input
                      type="radio"
                      name="businessMode"
                      value="real_estate"
                      checked={businessMode === 'real_estate'}
                      onChange={(e) => setBusinessMode(e.target.value)}
                      className="mt-1 w-4 h-4 text-cyan-600 border-gray-300 focus:ring-cyan-500"
                    />
                    <Home className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      businessMode === 'real_estate' ? 'text-cyan-600' : 'text-gray-400 group-hover:text-cyan-600'
                    }`} />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-cyan-900">
                        Modo Inmobiliaria
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        Para agencias inmobiliarias y corredores de bienes raíces.
                        Incluye: propiedades, clientes interesados, propietarios, operaciones de venta/alquiler, comisiones.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Color de Acento del PDF */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color de Acento del PDF
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Este color se usará en los encabezados de tablas y secciones de tus facturas, boletas y cotizaciones.
                </p>
                <div className="flex flex-wrap gap-3">
                  {[
                    { color: '#464646', name: 'Gris Oscuro' },
                    { color: '#1E40AF', name: 'Azul' },
                    { color: '#065F46', name: 'Verde' },
                    { color: '#7C2D12', name: 'Marrón' },
                    { color: '#581C87', name: 'Púrpura' },
                    { color: '#0F172A', name: 'Negro' },
                    { color: '#B91C1C', name: 'Rojo' },
                    { color: '#0E7490', name: 'Cyan' },
                  ].map((option) => (
                    <button
                      key={option.color}
                      type="button"
                      onClick={() => setPdfAccentColor(option.color)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                        pdfAccentColor === option.color
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      title={option.name}
                    >
                      <div
                        className="w-10 h-10 rounded-md shadow-sm"
                        style={{ backgroundColor: option.color }}
                      />
                      <span className="text-xs text-gray-600">{option.name}</span>
                    </button>
                  ))}
                  {/* Selector de color personalizado */}
                  <div className="flex flex-col items-center gap-1 p-2">
                    <input
                      type="color"
                      value={pdfAccentColor}
                      onChange={(e) => setPdfAccentColor(e.target.value)}
                      onInput={(e) => setPdfAccentColor(e.target.value)}
                      onBlur={(e) => setPdfAccentColor(e.target.value)}
                      className="w-10 h-10 rounded-md cursor-pointer border border-gray-300 shadow-sm"
                      title="Elegir color personalizado"
                    />
                    <span className="text-xs text-gray-600">Otro</span>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Imágenes de productos */}
              <label className="flex items-start space-x-3 cursor-pointer group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                <input
                  type="checkbox"
                  checked={enableProductImages}
                  onChange={(e) => setEnableProductImages(e.target.checked)}
                  className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                    Habilitar imágenes de productos
                  </span>
                  <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                    {enableProductImages
                      ? '✓ Habilitado: Podrás subir imágenes para tus productos. Las imágenes se mostrarán en el catálogo de productos y en el punto de venta, facilitando la identificación visual de cada producto.'
                      : '✗ Deshabilitado: Los productos se mostrarán sin imagen. Recomendado si prefieres un catálogo más simple o tienes muchos productos sin fotos.'}
                  </p>
                </div>
              </label>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Personalización del Menú Lateral */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Personalizar Menú Lateral</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Elige qué módulos mostrar en tu menú lateral. Desmarca los que no uses para simplificar tu navegación.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Módulos según el modo de negocio */}
                  {businessMode === 'retail' && (
                    <>
                      {[
                        { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja diario' },
                        { id: 'quotations', label: 'Cotizaciones', description: 'Presupuestos y proformas' },
                        { id: 'dispatch-guides', label: 'GRE Remitente', description: 'Guías de remisión como remitente' },
                        { id: 'carrier-dispatch-guides', label: 'GRE Transportista', description: 'Guías de remisión como transportista' },
                        { id: 'sellers', label: 'Vendedores', description: 'Gestión de vendedores y comisiones' },
                        { id: 'inventory', label: 'Inventario', description: 'Control de stock por producto' },
                        { id: 'warehouses', label: 'Almacenes', description: 'Múltiples ubicaciones de stock' },
                        { id: 'stock-movements', label: 'Movimientos', description: 'Historial de entradas y salidas' },
                        { id: 'suppliers', label: 'Proveedores', description: 'Listado de proveedores' },
                        { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
                        { id: 'ingredients', label: 'Insumos', description: 'Materia prima y componentes' },
                        { id: 'recipes', label: 'Composición', description: 'Productos compuestos' },
                        { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
                        { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
                        { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
                        { id: 'loans', label: 'Préstamos', description: 'Préstamos a clientes' },
                      ].map((item) => (
                        <label
                          key={item.id}
                          className={`flex items-start space-x-3 cursor-pointer p-3 border rounded-lg transition-colors ${
                            !hiddenMenuItems.includes(item.id)
                              ? 'border-primary-200 bg-primary-50/50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!hiddenMenuItems.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setHiddenMenuItems(hiddenMenuItems.filter(i => i !== item.id))
                              } else {
                                setHiddenMenuItems([...hiddenMenuItems, item.id])
                              }
                            }}
                            className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-900 block">{item.label}</span>
                            <span className="text-xs text-gray-500">{item.description}</span>
                          </div>
                        </label>
                      ))}
                    </>
                  )}
                  {businessMode === 'restaurant' && (
                    <>
                      {[
                        { id: 'cash-register', label: 'Caja', description: 'Apertura y cierre de caja' },
                        { id: 'orders', label: 'Órdenes', description: 'Listado de órdenes activas' },
                        { id: 'tables', label: 'Mesas', description: 'Gestión de mesas del local' },
                        { id: 'kitchen', label: 'Cocina', description: 'Vista de cocina para preparación' },
                        { id: 'ingredients', label: 'Ingredientes', description: 'Inventario de ingredientes' },
                        { id: 'recipes', label: 'Recetas', description: 'Recetas y composición de platos' },
                        { id: 'purchase-history', label: 'Historial de Compras', description: 'Registro de compras de insumos' },
                        { id: 'waiters', label: 'Mozos', description: 'Gestión de personal de atención' },
                        { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
                        { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
                        { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
                      ].map((item) => (
                        <label
                          key={item.id}
                          className={`flex items-start space-x-3 cursor-pointer p-3 border rounded-lg transition-colors ${
                            !hiddenMenuItems.includes(item.id)
                              ? 'border-primary-200 bg-primary-50/50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!hiddenMenuItems.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setHiddenMenuItems(hiddenMenuItems.filter(i => i !== item.id))
                              } else {
                                setHiddenMenuItems([...hiddenMenuItems, item.id])
                              }
                            }}
                            className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-900 block">{item.label}</span>
                            <span className="text-xs text-gray-500">{item.description}</span>
                          </div>
                        </label>
                      ))}
                    </>
                  )}
                  {businessMode === 'pharmacy' && (
                    <>
                      {[
                        { id: 'cash-register', label: 'Control de Caja', description: 'Apertura y cierre de caja' },
                        { id: 'laboratories', label: 'Laboratorios', description: 'Fabricantes de medicamentos' },
                        { id: 'inventory', label: 'Inventario', description: 'Control de stock' },
                        { id: 'batch-control', label: 'Control de Lotes', description: 'Gestión de lotes y vencimientos' },
                        { id: 'expiry-alerts', label: 'Alertas de Vencimiento', description: 'Productos próximos a vencer' },
                        { id: 'suppliers', label: 'Proveedores', description: 'Droguerías y distribuidores' },
                        { id: 'purchases', label: 'Compras', description: 'Registro de compras' },
                        { id: 'reports', label: 'Reportes', description: 'Estadísticas y análisis' },
                        { id: 'expenses', label: 'Gastos', description: 'Control de gastos del negocio' },
                        { id: 'cash-flow', label: 'Flujo de Caja', description: 'Liquidez total del negocio' },
                        { id: 'loans', label: 'Préstamos', description: 'Préstamos a clientes' },
                      ].map((item) => (
                        <label
                          key={item.id}
                          className={`flex items-start space-x-3 cursor-pointer p-3 border rounded-lg transition-colors ${
                            !hiddenMenuItems.includes(item.id)
                              ? 'border-primary-200 bg-primary-50/50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!hiddenMenuItems.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setHiddenMenuItems(hiddenMenuItems.filter(i => i !== item.id))
                              } else {
                                setHiddenMenuItems([...hiddenMenuItems, item.id])
                              }
                            }}
                            className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-900 block">{item.label}</span>
                            <span className="text-xs text-gray-500">{item.description}</span>
                          </div>
                        </label>
                      ))}
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Los módulos principales (Dashboard, POS, Ventas, Clientes, Productos, Configuración) siempre estarán visibles.
                </p>
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
                      enableProductImages: enableProductImages,
                      hiddenMenuItems: hiddenMenuItems,
                      pdfAccentColor: pdfAccentColor,
                      updatedAt: serverTimestamp(),
                    }, { merge: true })
                    toast.success('Preferencias guardadas exitosamente.')
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

      {/* Tab Content - Ventas (Inventario y POS) */}
      {activeTab === 'ventas' && (
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <ShoppingCart className="w-5 h-5 text-primary-600" />
              <CardTitle>Ventas e Inventario</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
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
                <h3 className="text-base font-semibold text-gray-900 mb-1">Control de Inventario</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configura el comportamiento del control de stock
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
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* POS Settings */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Punto de Venta</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configura el comportamiento del punto de venta
                </p>
                <div className="space-y-4">
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

                  {/* Tipo de documento por defecto en POS */}
                  <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900">
                        Tipo de comprobante por defecto en POS
                      </span>
                      <p className="text-xs text-gray-600 mt-1.5 mb-3 leading-relaxed">
                        Selecciona qué tipo de comprobante aparecerá seleccionado por defecto al abrir el Punto de Venta.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDefaultDocumentType('boleta')}
                          className={`px-3 py-2 border-2 rounded-lg transition-colors ${
                            defaultDocumentType === 'boleta'
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-sm font-medium">Boleta</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDefaultDocumentType('factura')}
                          className={`px-3 py-2 border-2 rounded-lg transition-colors ${
                            defaultDocumentType === 'factura'
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-sm font-medium">Factura</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDefaultDocumentType('nota_venta')}
                          className={`px-3 py-2 border-2 rounded-lg transition-colors ${
                            defaultDocumentType === 'nota_venta'
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-sm font-medium">Nota de Venta</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Múltiples precios por producto */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Múltiples Precios por Producto</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configura hasta 3 precios diferentes por producto (ej: Público, Mayorista, VIP)
                </p>
                <div className="space-y-4">
                  <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <label className="flex items-start space-x-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={multiplePricesEnabled}
                        onChange={(e) => setMultiplePricesEnabled(e.target.checked)}
                        className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                          Habilitar múltiples precios por producto
                        </span>
                        <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                          {multiplePricesEnabled
                            ? '✓ Habilitado: Podrás asignar hasta 3 precios diferentes a cada producto. Al vender, podrás elegir qué precio aplicar o asignar un nivel de precio a cada cliente.'
                            : '✗ Deshabilitado: Solo se usará un precio por producto (comportamiento normal).'}
                        </p>
                      </div>
                    </label>

                    {multiplePricesEnabled && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-3">Personaliza los nombres de cada nivel de precio:</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Precio 1</label>
                            <input
                              type="text"
                              value={priceLabels.price1}
                              onChange={(e) => setPriceLabels(prev => ({ ...prev, price1: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              placeholder="Público"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Precio 2</label>
                            <input
                              type="text"
                              value={priceLabels.price2}
                              onChange={(e) => setPriceLabels(prev => ({ ...prev, price2: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              placeholder="Mayorista"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Precio 3</label>
                            <input
                              type="text"
                              value={priceLabels.price3}
                              onChange={(e) => setPriceLabels(prev => ({ ...prev, price3: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              placeholder="VIP"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Precio 4</label>
                            <input
                              type="text"
                              value={priceLabels.price4}
                              onChange={(e) => setPriceLabels(prev => ({ ...prev, price4: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              placeholder="Especial"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Presentaciones de Venta */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Presentaciones de Venta</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Permite vender productos en diferentes presentaciones (Unidad, Pack, Caja, etc.)
                </p>
                <div className="space-y-4">
                  <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                    <label className="flex items-start space-x-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={presentationsEnabled}
                        onChange={(e) => setPresentationsEnabled(e.target.checked)}
                        className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                          Habilitar presentaciones de venta por producto
                        </span>
                        <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                          {presentationsEnabled
                            ? '✓ Habilitado: Podrás definir múltiples presentaciones por producto (ej: Unidad, Media Docena, Caja x24). Al vender, elegirás la presentación y el stock se descontará automáticamente.'
                            : '✗ Deshabilitado: Los productos se venderán con una sola unidad de medida (comportamiento normal).'}
                        </p>
                      </div>
                    </label>

                    {presentationsEnabled && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="text-xs text-blue-800">
                            <p className="font-medium mb-1">¿Cómo funciona?</p>
                            <ul className="list-disc list-inside space-y-1 text-blue-700">
                              <li>El stock se maneja en la unidad más pequeña (ej: unidades)</li>
                              <li>Cada presentación tiene un factor de conversión y precio</li>
                              <li>Al vender, el stock se descuenta según el factor</li>
                              <li>Ejemplo: Vender 1 "Caja x24" descuenta 24 unidades</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200"></div>

              {/* Notas de Venta */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Notas de Venta</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configura opciones específicas para notas de venta
                </p>
                <div className="space-y-4">
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
            </div>
          </CardContent>

          {/* Save Button for Ventas */}
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
                      restaurantConfig: restaurantConfig,
                      allowNegativeStock: allowNegativeStock,
                      allowCustomProducts: allowCustomProducts,
                      allowPriceEdit: allowPriceEdit,
                      defaultDocumentType: defaultDocumentType,
                      hideRucIgvInNotaVenta: hideRucIgvInNotaVenta,
                      allowPartialPayments: allowPartialPayments,
                      multiplePricesEnabled: multiplePricesEnabled,
                      priceLabels: priceLabels,
                      presentationsEnabled: presentationsEnabled,
                      updatedAt: serverTimestamp(),
                    }, { merge: true })
                    toast.success('Configuración de ventas guardada exitosamente.')
                  } catch (error) {
                    console.error('Error al guardar configuración:', error)
                    toast.error('Error al guardar la configuración')
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
                    Guardar Configuración
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Tab Content - Catálogo Público */}
      {activeTab === 'catalogo' && (
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Globe className="w-5 h-5 text-primary-600" />
              <CardTitle>Catálogo Virtual</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Descripción */}
              <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-emerald-900">Comparte tu catálogo con tus clientes</h3>
                    <p className="text-sm text-emerald-700 mt-1">
                      Crea un catálogo online para que tus clientes vean tus productos, agreguen al carrito y hagan pedidos por WhatsApp. Sin necesidad de app ni registro.
                    </p>
                  </div>
                </div>
              </div>

              {/* Toggle habilitar */}
              <label className="flex items-start space-x-3 cursor-pointer group p-4 border-2 rounded-xl transition-colors hover:border-emerald-300">
                <input
                  type="checkbox"
                  checked={catalogEnabled}
                  onChange={(e) => setCatalogEnabled(e.target.checked)}
                  className="mt-1 w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <span className="text-base font-semibold text-gray-900">
                    {catalogEnabled ? 'Catálogo habilitado' : 'Habilitar catálogo público'}
                  </span>
                  <p className="text-sm text-gray-600 mt-1">
                    {catalogEnabled
                      ? 'Tu catálogo está activo y visible para el público'
                      : 'Activa esta opción para crear tu catálogo online'}
                  </p>
                </div>
              </label>

              {/* Configuración del catálogo (solo si está habilitado) */}
              {catalogEnabled && (
                <>
                  {/* URL del catálogo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      URL de tu catálogo
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center bg-gray-100 rounded-lg overflow-hidden">
                        <span className="px-3 py-2.5 text-gray-500 text-sm bg-gray-200">
                          cobrify.com/catalogo/
                        </span>
                        <input
                          type="text"
                          value={catalogSlug}
                          onChange={(e) => setCatalogSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                          placeholder="mi-tienda"
                          className="flex-1 px-3 py-2.5 bg-white border-0 focus:ring-2 focus:ring-emerald-500 text-gray-900"
                        />
                      </div>
                      {catalogSlug && (
                        <button
                          type="button"
                          onClick={() => window.open(`${PRODUCTION_URL}/catalogo/${catalogSlug}`, '_blank')}
                          className="p-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                          title="Ver catálogo"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Solo letras minúsculas, números y guiones. Ejemplo: mi-tienda, ferreteria-lopez
                    </p>
                  </div>

                  {/* Vista previa del enlace */}
                  {catalogSlug && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 mb-1">Enlace de tu catálogo:</p>
                          <p className="text-sm font-medium text-emerald-600 truncate">
                            {PRODUCTION_URL}/catalogo/{catalogSlug}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${PRODUCTION_URL}/catalogo/${catalogSlug}`)
                            toast.success('Enlace copiado al portapapeles')
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                        >
                          <Copy className="w-4 h-4" />
                          Copiar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Código QR del catálogo */}
                  {catalogSlug && catalogQrDataUrl && (
                    <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                      <div className="flex items-center gap-2 mb-3">
                        <QrCode className="w-5 h-5 text-emerald-600" />
                        <h4 className="font-medium text-gray-900">Código QR de tu Catálogo</h4>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="bg-white p-3 rounded-xl shadow-sm">
                          <img
                            src={catalogQrDataUrl}
                            alt="QR del catálogo"
                            className="w-40 h-40"
                          />
                        </div>
                        <div className="flex-1 text-center sm:text-left">
                          <p className="text-sm text-gray-600 mb-3">
                            Descarga este código QR para compartirlo en tu negocio, tarjetas de presentación, o redes sociales.
                          </p>
                          <button
                            onClick={() => {
                              const link = document.createElement('a')
                              link.download = `catalogo-${catalogSlug}-qr.png`
                              link.href = catalogQrDataUrl
                              link.click()
                              toast.success('QR descargado exitosamente')
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                          >
                            <Download className="w-4 h-4" />
                            Descargar QR
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-200"></div>

                  {/* Personalización */}
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-4">Personalización</h3>

                    <div className="space-y-4">
                      {/* Tagline */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Eslogan o descripción corta (opcional)
                        </label>
                        <input
                          type="text"
                          value={catalogTagline}
                          onChange={(e) => setCatalogTagline(e.target.value)}
                          placeholder="Los mejores productos al mejor precio"
                          maxLength={60}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">{catalogTagline.length}/60 caracteres</p>
                      </div>

                      {/* Mensaje de bienvenida */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Mensaje de bienvenida (opcional)
                        </label>
                        <input
                          type="text"
                          value={catalogWelcome}
                          onChange={(e) => setCatalogWelcome(e.target.value)}
                          placeholder="¡Bienvenido! Explora nuestros productos"
                          maxLength={100}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>

                      {/* Color */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Color principal del catálogo
                        </label>
                        <div className="flex flex-wrap gap-3">
                          {[
                            { color: '#10B981', name: 'Esmeralda' },
                            { color: '#3B82F6', name: 'Azul' },
                            { color: '#8B5CF6', name: 'Violeta' },
                            { color: '#F59E0B', name: 'Ámbar' },
                            { color: '#EF4444', name: 'Rojo' },
                            { color: '#EC4899', name: 'Rosa' },
                            { color: '#14B8A6', name: 'Teal' },
                            { color: '#1F2937', name: 'Oscuro' },
                          ].map((option) => (
                            <button
                              key={option.color}
                              type="button"
                              onClick={() => setCatalogColor(option.color)}
                              className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                                catalogColor === option.color
                                  ? 'border-gray-900 shadow-md'
                                  : 'border-transparent hover:border-gray-300'
                              }`}
                            >
                              <div
                                className="w-10 h-10 rounded-full shadow-sm flex items-center justify-center"
                                style={{ backgroundColor: option.color }}
                              >
                                {catalogColor === option.color && (
                                  <Check className="w-5 h-5 text-white" />
                                )}
                              </div>
                              <span className="text-xs text-gray-600">{option.name}</span>
                            </button>
                          ))}
                          <div className="flex flex-col items-center gap-1 p-2">
                            <input
                              type="color"
                              value={catalogColor}
                              onChange={(e) => setCatalogColor(e.target.value)}
                              onInput={(e) => setCatalogColor(e.target.value)}
                              onBlur={(e) => setCatalogColor(e.target.value)}
                              className="w-10 h-10 rounded-full cursor-pointer border-2 border-gray-300"
                            />
                            <span className="text-xs text-gray-600">Otro</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200"></div>

                  {/* Productos en el catálogo */}
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-900">¿Cómo agrego productos al catálogo?</h4>
                        <p className="text-sm text-blue-700 mt-1">
                          Ve a <strong>Productos</strong>, edita un producto y activa la opción <strong>"Mostrar en catálogo"</strong>. Solo los productos con esta opción activada aparecerán en tu catálogo público.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>

          {/* Save Button for Catalogo */}
          <div className="px-6 pb-6">
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  if (isDemoMode) {
                    toast.error('No se pueden guardar cambios en modo demo.')
                    return
                  }

                  if (catalogEnabled && !catalogSlug) {
                    toast.error('Ingresa una URL para tu catálogo')
                    return
                  }

                  setIsSaving(true)
                  try {
                    const businessRef = doc(db, 'businesses', getBusinessId())
                    await setDoc(businessRef, {
                      catalogEnabled,
                      catalogSlug: catalogSlug.toLowerCase().trim(),
                      catalogColor,
                      catalogWelcome,
                      catalogTagline,
                      updatedAt: serverTimestamp(),
                    }, { merge: true })
                    toast.success(catalogEnabled ? 'Catálogo configurado exitosamente' : 'Catálogo deshabilitado')
                  } catch (error) {
                    console.error('Error al guardar catálogo:', error)
                    toast.error('Error al guardar la configuración')
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
                    Guardar Catálogo
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Tab Content - Avanzado (SUNAT, Comprobantes, GRE, Privacidad) */}
      {activeTab === 'avanzado' && (
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Cog className="w-5 h-5 text-primary-600" />
              <CardTitle>Configuración Avanzada</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
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

          {/* Save Button for Avanzado */}
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
                      autoSendToSunat: autoSendToSunat,
                      allowDeleteInvoices: allowDeleteInvoices,
                      allowCustomEmissionDate: allowCustomEmissionDate,
                      hideDashboardDataFromSecondary: hideDashboardDataFromSecondary,
                      updatedAt: serverTimestamp(),
                    }, { merge: true })
                    toast.success('Configuración avanzada guardada exitosamente. Recarga la página para ver los cambios en el menú.')
                  } catch (error) {
                    console.error('Error al guardar configuración:', error)
                    toast.error('Error al guardar la configuración')
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
                    Guardar Configuración
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Tab Content - Series por Sucursal */}
      {activeTab === 'series' && (
        <div className="space-y-6">
          {/* Información */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-800 font-medium">Series por Sucursal</p>
                <p className="text-sm text-blue-700 mt-1">
                  La <strong>Sucursal Principal</strong> usa las series globales configuradas aquí.
                  Las sucursales adicionales tienen sus propias series independientes.
                </p>
              </div>
            </div>
          </div>

          {/* Loading */}
          {loadingBranches && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              <span className="ml-2 text-gray-600">Cargando sucursales...</span>
            </div>
          )}

          {/* Sucursal Principal - Series Globales (siempre visible) */}
          {!loadingBranches && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Store className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Sucursal Principal</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        Series globales del negocio
                      </p>
                    </div>
                    <span className="px-2 py-1 text-xs font-medium bg-cyan-100 text-cyan-700 rounded-full">
                      Principal
                    </span>
                  </div>
                  {!editingSeries ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingSeries(true)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar Series
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingSeries(false)}
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
                {/* Tabla de series globales */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Documento</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Serie</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Último #</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Siguiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'factura', label: 'Factura Electrónica' },
                        { key: 'boleta', label: 'Boleta de Venta' },
                        { key: 'nota_venta', label: 'Nota de Venta' },
                        { key: 'cotizacion', label: 'Cotización' },
                      ].map(({ key, label }) => (
                        <tr key={key} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-700 font-medium">{label}</td>
                          <td className="py-2 px-3">
                            <Input
                              value={series[key]?.serie || defaultSeries[key].serie}
                              onChange={e => handleSeriesChange(key, 'serie', e.target.value)}
                              disabled={!editingSeries}
                              className={`w-20 ${!editingSeries ? 'bg-gray-50' : ''}`}
                              maxLength={4}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              value={series[key]?.lastNumber ?? 0}
                              onChange={e => handleSeriesChange(key, 'lastNumber', e.target.value)}
                              disabled={!editingSeries}
                              className={`w-24 ${!editingSeries ? 'bg-gray-50' : ''}`}
                              min="0"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-mono text-gray-600">
                              {getNextNumber(series[key]?.serie || defaultSeries[key].serie, series[key]?.lastNumber ?? 0)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-blue-50">
                        <td colSpan="4" className="py-1 px-3 text-xs font-semibold text-blue-700">Notas de Crédito</td>
                      </tr>
                      {[
                        { key: 'nota_credito_factura', label: 'NC - Facturas' },
                        { key: 'nota_credito_boleta', label: 'NC - Boletas' },
                      ].map(({ key, label }) => (
                        <tr key={key} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-600">{label}</td>
                          <td className="py-2 px-3">
                            <Input
                              value={series[key]?.serie || defaultSeries[key].serie}
                              onChange={e => handleSeriesChange(key, 'serie', e.target.value)}
                              disabled={!editingSeries}
                              className={`w-20 ${!editingSeries ? 'bg-gray-50' : ''}`}
                              maxLength={4}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              value={series[key]?.lastNumber ?? 0}
                              onChange={e => handleSeriesChange(key, 'lastNumber', e.target.value)}
                              disabled={!editingSeries}
                              className={`w-24 ${!editingSeries ? 'bg-gray-50' : ''}`}
                              min="0"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-mono text-gray-600">
                              {getNextNumber(series[key]?.serie || defaultSeries[key].serie, series[key]?.lastNumber ?? 0)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-orange-50">
                        <td colSpan="4" className="py-1 px-3 text-xs font-semibold text-orange-700">Notas de Débito</td>
                      </tr>
                      {[
                        { key: 'nota_debito_factura', label: 'ND - Facturas' },
                        { key: 'nota_debito_boleta', label: 'ND - Boletas' },
                      ].map(({ key, label }) => (
                        <tr key={key} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-600">{label}</td>
                          <td className="py-2 px-3">
                            <Input
                              value={series[key]?.serie || defaultSeries[key].serie}
                              onChange={e => handleSeriesChange(key, 'serie', e.target.value)}
                              disabled={!editingSeries}
                              className={`w-20 ${!editingSeries ? 'bg-gray-50' : ''}`}
                              maxLength={4}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              value={series[key]?.lastNumber ?? 0}
                              onChange={e => handleSeriesChange(key, 'lastNumber', e.target.value)}
                              disabled={!editingSeries}
                              className={`w-24 ${!editingSeries ? 'bg-gray-50' : ''}`}
                              min="0"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-mono text-gray-600">
                              {getNextNumber(series[key]?.serie || defaultSeries[key].serie, series[key]?.lastNumber ?? 0)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-purple-50">
                        <td colSpan="4" className="py-1 px-3 text-xs font-semibold text-purple-700">Guías de Remisión</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 px-3 text-gray-600">Guía de Remisión (Remitente)</td>
                        <td className="py-2 px-3">
                          <Input
                            value={series['guia_remision']?.serie || defaultSeries['guia_remision'].serie}
                            onChange={e => handleSeriesChange('guia_remision', 'serie', e.target.value)}
                            disabled={!editingSeries}
                            className={`w-20 ${!editingSeries ? 'bg-gray-50' : ''}`}
                            maxLength={4}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            value={series['guia_remision']?.lastNumber ?? 0}
                            onChange={e => handleSeriesChange('guia_remision', 'lastNumber', e.target.value)}
                            disabled={!editingSeries}
                            className={`w-24 ${!editingSeries ? 'bg-gray-50' : ''}`}
                            min="0"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-mono text-gray-600">
                            {getNextNumber(series['guia_remision']?.serie || 'T001', series['guia_remision']?.lastNumber ?? 0)}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 px-3 text-gray-600">Guía de Remisión (Transportista)</td>
                        <td className="py-2 px-3">
                          <Input
                            value={series['guia_transportista']?.serie || defaultSeries['guia_transportista'].serie}
                            onChange={e => handleSeriesChange('guia_transportista', 'serie', e.target.value)}
                            disabled={!editingSeries}
                            className={`w-20 ${!editingSeries ? 'bg-gray-50' : ''}`}
                            maxLength={4}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            value={series['guia_transportista']?.lastNumber ?? 0}
                            onChange={e => handleSeriesChange('guia_transportista', 'lastNumber', e.target.value)}
                            disabled={!editingSeries}
                            className={`w-24 ${!editingSeries ? 'bg-gray-50' : ''}`}
                            min="0"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-mono text-gray-600">
                            {getNextNumber(series['guia_transportista']?.serie || 'V001', series['guia_transportista']?.lastNumber ?? 0)}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sucursales Adicionales */}
          {!loadingBranches && branches.length > 0 && (
            <>
              <div className="flex items-center gap-2 mt-6">
                <Store className="w-5 h-5 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900">Sucursales Adicionales</h3>
                <span className="text-sm text-gray-500">({branches.length})</span>
              </div>

              {branches.map((branch, index) => {
                const bSeries = branchSeries[branch.id] || {}
                const isEditing = editingBranchId === branch.id

                return (
                  <Card key={branch.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-cyan-100 rounded-lg">
                            <Store className="w-5 h-5 text-cyan-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{branch.name}</CardTitle>
                            {branch.address && (
                              <p className="text-sm text-gray-500 flex items-center mt-1">
                                <MapPin className="w-3 h-3 mr-1" />
                                {branch.address}
                              </p>
                            )}
                          </div>
                        </div>
                        {!isEditing ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => initializeBranchSeries(branch.id, index)}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Editar Series
                          </Button>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingBranchId(null)
                                loadBranchesAndSeries()
                              }}
                              disabled={isSaving}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveBranchSeries(branch.id)}
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
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left py-2 px-3 font-medium text-gray-700">Documento</th>
                              <th className="text-left py-2 px-3 font-medium text-gray-700">Serie</th>
                              <th className="text-left py-2 px-3 font-medium text-gray-700">Último #</th>
                              <th className="text-left py-2 px-3 font-medium text-gray-700">Siguiente</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { key: 'factura', label: 'Factura Electrónica' },
                              { key: 'boleta', label: 'Boleta de Venta' },
                              { key: 'nota_venta', label: 'Nota de Venta' },
                              { key: 'cotizacion', label: 'Cotización' },
                            ].map(({ key, label }) => (
                              <tr key={key} className="border-b border-gray-100">
                                <td className="py-2 px-3 text-gray-700 font-medium">{label}</td>
                                <td className="py-2 px-3">
                                  <Input
                                    value={bSeries[key]?.serie || defaultSeries[key].serie}
                                    onChange={e => handleBranchSeriesChange(branch.id, key, 'serie', e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-20 ${!isEditing ? 'bg-gray-50' : ''}`}
                                    maxLength={4}
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <Input
                                    type="number"
                                    value={bSeries[key]?.lastNumber ?? 0}
                                    onChange={e => handleBranchSeriesChange(branch.id, key, 'lastNumber', e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-24 ${!isEditing ? 'bg-gray-50' : ''}`}
                                    min="0"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <span className="font-mono text-gray-600">
                                    {getNextNumber(bSeries[key]?.serie || defaultSeries[key].serie, bSeries[key]?.lastNumber ?? 0)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-blue-50">
                              <td colSpan="4" className="py-1 px-3 text-xs font-semibold text-blue-700">Notas de Crédito</td>
                            </tr>
                            {[
                              { key: 'nota_credito_factura', label: 'NC - Facturas' },
                              { key: 'nota_credito_boleta', label: 'NC - Boletas' },
                            ].map(({ key, label }) => (
                              <tr key={key} className="border-b border-gray-100">
                                <td className="py-2 px-3 text-gray-600">{label}</td>
                                <td className="py-2 px-3">
                                  <Input
                                    value={bSeries[key]?.serie || defaultSeries[key].serie}
                                    onChange={e => handleBranchSeriesChange(branch.id, key, 'serie', e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-20 ${!isEditing ? 'bg-gray-50' : ''}`}
                                    maxLength={4}
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <Input
                                    type="number"
                                    value={bSeries[key]?.lastNumber ?? 0}
                                    onChange={e => handleBranchSeriesChange(branch.id, key, 'lastNumber', e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-24 ${!isEditing ? 'bg-gray-50' : ''}`}
                                    min="0"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <span className="font-mono text-gray-600">
                                    {getNextNumber(bSeries[key]?.serie || defaultSeries[key].serie, bSeries[key]?.lastNumber ?? 0)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-orange-50">
                              <td colSpan="4" className="py-1 px-3 text-xs font-semibold text-orange-700">Notas de Débito</td>
                            </tr>
                            {[
                              { key: 'nota_debito_factura', label: 'ND - Facturas' },
                              { key: 'nota_debito_boleta', label: 'ND - Boletas' },
                            ].map(({ key, label }) => (
                              <tr key={key} className="border-b border-gray-100">
                                <td className="py-2 px-3 text-gray-600">{label}</td>
                                <td className="py-2 px-3">
                                  <Input
                                    value={bSeries[key]?.serie || defaultSeries[key].serie}
                                    onChange={e => handleBranchSeriesChange(branch.id, key, 'serie', e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-20 ${!isEditing ? 'bg-gray-50' : ''}`}
                                    maxLength={4}
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <Input
                                    type="number"
                                    value={bSeries[key]?.lastNumber ?? 0}
                                    onChange={e => handleBranchSeriesChange(branch.id, key, 'lastNumber', e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-24 ${!isEditing ? 'bg-gray-50' : ''}`}
                                    min="0"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <span className="font-mono text-gray-600">
                                    {getNextNumber(bSeries[key]?.serie || defaultSeries[key].serie, bSeries[key]?.lastNumber ?? 0)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-purple-50">
                              <td colSpan="4" className="py-1 px-3 text-xs font-semibold text-purple-700">Guías de Remisión</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                              <td className="py-2 px-3 text-gray-600">Guía de Remisión (Remitente)</td>
                              <td className="py-2 px-3">
                                <Input
                                  value={bSeries['guia_remision']?.serie || defaultSeries['guia_remision'].serie}
                                  onChange={e => handleBranchSeriesChange(branch.id, 'guia_remision', 'serie', e.target.value)}
                                  disabled={!isEditing}
                                  className={`w-20 ${!isEditing ? 'bg-gray-50' : ''}`}
                                  maxLength={4}
                                />
                              </td>
                              <td className="py-2 px-3">
                                <Input
                                  type="number"
                                  value={bSeries['guia_remision']?.lastNumber ?? 0}
                                  onChange={e => handleBranchSeriesChange(branch.id, 'guia_remision', 'lastNumber', e.target.value)}
                                  disabled={!isEditing}
                                  className={`w-24 ${!isEditing ? 'bg-gray-50' : ''}`}
                                  min="0"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-mono text-gray-600">
                                  {getNextNumber(bSeries['guia_remision']?.serie || 'T001', bSeries['guia_remision']?.lastNumber ?? 0)}
                                </span>
                              </td>
                            </tr>
                            <tr className="border-b border-gray-100">
                              <td className="py-2 px-3 text-gray-600">Guía de Remisión (Transportista)</td>
                              <td className="py-2 px-3">
                                <Input
                                  value={bSeries['guia_transportista']?.serie || defaultSeries['guia_transportista'].serie}
                                  onChange={e => handleBranchSeriesChange(branch.id, 'guia_transportista', 'serie', e.target.value)}
                                  disabled={!isEditing}
                                  className={`w-20 ${!isEditing ? 'bg-gray-50' : ''}`}
                                  maxLength={4}
                                />
                              </td>
                              <td className="py-2 px-3">
                                <Input
                                  type="number"
                                  value={bSeries['guia_transportista']?.lastNumber ?? 0}
                                  onChange={e => handleBranchSeriesChange(branch.id, 'guia_transportista', 'lastNumber', e.target.value)}
                                  disabled={!isEditing}
                                  className={`w-24 ${!isEditing ? 'bg-gray-50' : ''}`}
                                  min="0"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-mono text-gray-600">
                                  {getNextNumber(bSeries['guia_transportista']?.serie || 'V001', bSeries['guia_transportista']?.lastNumber ?? 0)}
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {!isEditing && !bSeries.factura && (
                        <p className="text-sm text-amber-600 mt-3 flex items-center">
                          <AlertTriangle className="w-4 h-4 mr-1" />
                          Series no configuradas. Haz clic en "Editar Series" para configurar.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </>
          )}
        </div>
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

                  </div>
                )}

                {/* Escanear impresoras */}
                {(!printerConfig.enabled || !printerConfig.address) && (
                  <div className="space-y-4">
                    {/* Opciones de conexión */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Button
                        onClick={handleScanPrinters}
                        disabled={isScanning}
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Escaneando...
                          </>
                        ) : (
                          <>
                            <Bluetooth className="w-4 h-4 mr-2" />
                            Bluetooth
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowManualConnect(!showManualConnect)
                          setShowWifiConnect(false)
                        }}
                        className="flex-1 border-gray-300 hover:bg-gray-100"
                      >
                        {showManualConnect ? (
                          <>
                            <X className="w-4 h-4 mr-2" />
                            Cancelar
                          </>
                        ) : (
                          <>
                            <Hash className="w-4 h-4 mr-2" />
                            MAC Manual
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowWifiConnect(!showWifiConnect)
                          setShowManualConnect(false)
                        }}
                        className="flex-1 border-green-300 text-green-700 hover:bg-green-100"
                      >
                        {showWifiConnect ? (
                          <>
                            <X className="w-4 h-4 mr-2 text-green-700" />
                            Cancelar
                          </>
                        ) : (
                          <>
                            <Wifi className="w-4 h-4 mr-2" />
                            WiFi/LAN
                          </>
                        )}
                      </Button>
                    </div>

                    <p className="text-sm text-gray-500">
                      {showManualConnect
                        ? 'Ingresa la dirección MAC de tu impresora Bluetooth'
                        : showWifiConnect
                        ? 'Conecta tu impresora térmica por red WiFi/LAN'
                        : 'Selecciona el método de conexión para tu impresora térmica'
                      }
                    </p>

                    {/* Formulario de conexión WiFi/LAN */}
                    {showWifiConnect && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-4">
                        <div className="flex items-start space-x-3 mb-4">
                          <div className="bg-green-100 p-2 rounded-full flex-shrink-0">
                            <Info className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="text-sm text-green-800">
                            <p className="font-semibold mb-1">Conexión WiFi/LAN</p>
                            <p>Tu impresora debe estar conectada a la misma red que tu celular. Las impresoras térmicas generalmente usan el puerto 9100.</p>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Dirección IP de la impresora *
                          </label>
                          <Input
                            type="text"
                            placeholder="192.168.1.100"
                            value={wifiIp}
                            onChange={(e) => setWifiIp(e.target.value)}
                            className="font-mono"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Puedes encontrar la IP en la configuración de tu impresora o imprimiendo una página de prueba
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Puerto (por defecto: 9100)
                          </label>
                          <Input
                            type="text"
                            placeholder="9100"
                            value={wifiPort}
                            onChange={(e) => setWifiPort(e.target.value.replace(/\D/g, ''))}
                            className="font-mono w-32"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nombre de la impresora (opcional)
                          </label>
                          <Input
                            type="text"
                            placeholder="Impresora Cocina"
                            value={wifiName}
                            onChange={(e) => setWifiName(e.target.value)}
                          />
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                          <p className="text-xs text-yellow-800">
                            <strong>Cómo encontrar la IP de tu impresora:</strong><br />
                            1. Mantén presionado el botón FEED de la impresora al encenderla<br />
                            2. Se imprimirá una página de autotest con la IP<br />
                            3. O revisa la configuración de red de la impresora
                          </p>
                        </div>
                        <Button
                          onClick={handleWifiConnect}
                          disabled={isConnecting || !wifiIp.trim()}
                          className="w-full bg-green-600 hover:bg-green-700"
                        >
                          {isConnecting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Conectando...
                            </>
                          ) : (
                            '📶 Conectar via WiFi'
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Formulario de conexión manual Bluetooth */}
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
                            'Conectar Impresora Bluetooth'
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

              {/* Divider */}
              <div className="border-t border-gray-200 my-6"></div>

              {/* Modo legible para impresión web - SIEMPRE VISIBLE */}
              <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
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
                    <label htmlFor="webPrintLegible" className="block text-sm font-medium text-gray-900 cursor-pointer">
                      Impresión Web Legible
                    </label>
                    <p className="text-xs text-gray-600 mt-1">
                      Activa esta opción para hacer las letras más grandes y gruesas al imprimir desde el navegador web (comprobantes, precuentas, comandas). No afecta la impresión térmica Bluetooth.
                    </p>
                  </div>
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

      {/* Yape Tab */}
      {activeTab === 'yape' && (
        <div className="space-y-6">
          {/* Configuración principal */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Bell className="w-5 h-5 text-purple-600" />
                  <CardTitle>Detector de Pagos Yape</CardTitle>
                </div>
                {/* Toggle de activación */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={yapeConfig.enabled}
                    onChange={(e) => setYapeConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  <span className="ml-2 text-sm font-medium text-gray-700">
                    {yapeConfig.enabled ? 'Activado' : 'Desactivado'}
                  </span>
                </label>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Descripción */}
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-sm text-purple-800">
                    Detecta automáticamente cuando recibes un pago por Yape y envía notificaciones
                    push a los usuarios que selecciones.
                  </p>
                </div>

                {yapeConfig.enabled && (
                  <>
                    {/* Auto-iniciar */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Iniciar automáticamente</p>
                        <p className="text-xs text-gray-600">Comenzar a escuchar notificaciones al abrir la app</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={yapeConfig.autoStartListening}
                          onChange={(e) => setYapeConfig(prev => ({ ...prev, autoStartListening: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    {/* Notificar a todos */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Notificar a todos los usuarios</p>
                        <p className="text-xs text-gray-600">Enviar notificación push a todos los usuarios del negocio</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={yapeConfig.notifyAllUsers}
                          onChange={(e) => setYapeConfig(prev => ({ ...prev, notifyAllUsers: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    {/* Selección de usuarios específicos */}
                    {!yapeConfig.notifyAllUsers && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Usuarios a notificar</h4>
                        {isLoadingYape ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                          </div>
                        ) : businessUsers.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">
                            No hay usuarios registrados en este negocio
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {businessUsers.map(user => (
                              <label
                                key={user.id}
                                className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                              >
                                <input
                                  type="checkbox"
                                  checked={yapeConfig.notifyUsers.includes(user.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setYapeConfig(prev => ({
                                        ...prev,
                                        notifyUsers: [...prev.notifyUsers, user.id]
                                      }))
                                    } else {
                                      setYapeConfig(prev => ({
                                        ...prev,
                                        notifyUsers: prev.notifyUsers.filter(id => id !== user.id)
                                      }))
                                    }
                                  }}
                                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                />
                                <div className="ml-3">
                                  <p className="text-sm font-medium text-gray-900">
                                    {user.displayName || user.name || user.email}
                                    {user.isOwner && (
                                      <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                                        Dueño
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-gray-500">{user.email}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Botón guardar */}
                    <div className="border-t border-gray-200 pt-4">
                      <Button
                        onClick={handleSaveYapeConfig}
                        disabled={isSavingYape}
                        className="w-full sm:w-auto"
                      >
                        {isSavingYape ? (
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
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Instrucciones */}
          {yapeConfig.enabled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Instrucciones de uso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                      <span className="text-purple-600 font-bold text-sm">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Instala el APK en tu celular</p>
                      <p className="text-xs text-gray-600">El dispositivo donde tengas Yape instalado</p>
                    </div>
                  </div>
                  <div className="flex items-start p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                      <span className="text-purple-600 font-bold text-sm">2</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Otorga el permiso de notificaciones</p>
                      <p className="text-xs text-gray-600">Configuración → Acceso a notificaciones → Activa Cobrify</p>
                    </div>
                  </div>
                  <div className="flex items-start p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                      <span className="text-purple-600 font-bold text-sm">3</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">¡Listo!</p>
                      <p className="text-xs text-gray-600">Cuando recibas un Yape, los usuarios seleccionados recibirán una notificación push</p>
                    </div>
                  </div>
                </div>

                {/* Botón de prueba */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <Link
                    to="/test-notifications"
                    className="inline-flex items-center text-sm text-purple-600 hover:text-purple-700"
                  >
                    <Bell className="w-4 h-4 mr-1" />
                    Abrir página de pruebas
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Nota de privacidad */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <Info className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900">Privacidad</h4>
                <p className="text-sm text-blue-800 mt-1">
                  Solo se detectan notificaciones de Yape. Las notificaciones se procesan
                  localmente y solo se guarda el monto y nombre del pagador.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
