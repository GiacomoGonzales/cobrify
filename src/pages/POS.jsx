import React, { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  DollarSign,
  Printer,
  User,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ShoppingCart,
  Folder,
  Tag,
  Share2,
  Edit2,
  X,
  Check,
  Calendar,
  ChevronDown,
  ChevronUp,
  Settings2,
  Eye,
  ScanBarcode,
  Store,
  Warehouse,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBranding } from '@/contexts/BrandingContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils'
import { calculateInvoiceAmounts, calculateMixedInvoiceAmounts, ID_TYPES } from '@/utils/peruUtils'
import { generateInvoicePDF, getInvoicePDFBlob, previewInvoicePDF, preloadLogo } from '@/utils/pdfGenerator'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { getDoc, doc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import {
  getProducts,
  getCustomers,
  createInvoice,
  getCompanySettings,
  updateProduct,
  getNextDocumentNumber,
  getProductCategories,
  sendInvoiceToSunat,
  upsertCustomerFromSale,
} from '@/services/firestoreService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { deductIngredients } from '@/services/ingredientService'
import { getRecipeByProductId } from '@/services/recipeService'
import { getWarehouses, getDefaultWarehouse, updateWarehouseStock, getStockInWarehouse, getTotalAvailableStock, getOrphanStock, createStockMovement } from '@/services/warehouseService'
import { getActiveBranches, getDefaultBranch } from '@/services/branchService'
import { shortenUrl } from '@/services/urlShortenerService'
import { releaseTable } from '@/services/tableService'
import { getSellers } from '@/services/sellerService'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { savePendingSale } from '@/services/offlineQueueService'
import InvoiceTicket from '@/components/InvoiceTicket'

const PAYMENT_METHODS = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  YAPE: 'Yape',
  PLIN: 'Plin',
  RAPPI: 'Rappi',
}

const ORDER_TYPES = {
  'dine-in': 'En Mesa',
  'takeaway': 'Para Llevar',
  'delivery': 'Delivery',
}

// Unidades de medida SUNAT (Catálogo N° 03 - UN/ECE Rec 20)
const UNIT_TYPES = [
  { code: 'NIU', label: 'Unidad' },
  { code: 'ZZ', label: 'Servicio' },
  { code: 'KGM', label: 'Kilogramo' },
  { code: 'GRM', label: 'Gramo' },
  { code: 'LTR', label: 'Litro' },
  { code: 'MTR', label: 'Metro' },
  { code: 'MTK', label: 'Metro cuadrado' },
  { code: 'MTQ', label: 'Metro cúbico' },
  { code: 'BX', label: 'Caja' },
  { code: 'PK', label: 'Paquete' },
  { code: 'SET', label: 'Juego' },
  { code: 'HUR', label: 'Hora' },
  { code: 'DZN', label: 'Docena' },
  { code: 'PR', label: 'Par' },
  { code: 'MIL', label: 'Millar' },
  { code: 'TNE', label: 'Tonelada' },
  { code: 'BJ', label: 'Balde' },
  { code: 'BLL', label: 'Barril' },
  { code: 'BG', label: 'Bolsa' },
  { code: 'BO', label: 'Botella' },
  { code: 'CT', label: 'Cartón' },
  { code: 'CMK', label: 'Centímetro cuadrado' },
  { code: 'CMQ', label: 'Centímetro cúbico' },
  { code: 'CMT', label: 'Centímetro' },
  { code: 'CEN', label: 'Ciento de unidades' },
  { code: 'CY', label: 'Cilindro' },
  { code: 'BE', label: 'Fardo' },
  { code: 'GLL', label: 'Galón' },
  { code: 'GLI', label: 'Galón inglés' },
  { code: 'LEF', label: 'Hoja' },
  { code: 'KTM', label: 'Kilómetro' },
  { code: 'KWH', label: 'Kilovatio hora' },
  { code: 'KT', label: 'Kit' },
  { code: 'CA', label: 'Lata' },
  { code: 'LBR', label: 'Libra' },
  { code: 'MWH', label: 'Megavatio hora' },
  { code: 'MGM', label: 'Miligramo' },
  { code: 'MLT', label: 'Mililitro' },
  { code: 'MMT', label: 'Milímetro' },
  { code: 'MMK', label: 'Milímetro cuadrado' },
  { code: 'MMQ', label: 'Milímetro cúbico' },
  { code: 'UM', label: 'Millón de unidades' },
  { code: 'ONZ', label: 'Onza' },
  { code: 'PF', label: 'Paleta' },
  { code: 'FOT', label: 'Pie' },
  { code: 'FTK', label: 'Pie cuadrado' },
  { code: 'FTQ', label: 'Pie cúbico' },
  { code: 'C62', label: 'Pieza' },
  { code: 'PG', label: 'Placa' },
  { code: 'ST', label: 'Pliego' },
  { code: 'INH', label: 'Pulgada' },
  { code: 'TU', label: 'Tubo' },
  { code: 'YRD', label: 'Yarda' },
  { code: 'QD', label: 'Cuarto de docena' },
  { code: 'HD', label: 'Media docena' },
  { code: 'JG', label: 'Jarra' },
  { code: 'JR', label: 'Frasco' },
  { code: 'CH', label: 'Envase' },
  { code: 'AV', label: 'Cápsula' },
  { code: 'SA', label: 'Saco' },
  { code: 'BT', label: 'Tornillo' },
  { code: 'U2', label: 'Tableta/Blister' },
  { code: 'DZP', label: 'Docena de paquetes' },
  { code: 'HT', label: 'Media hora' },
  { code: 'RL', label: 'Carrete' },
  { code: 'SEC', label: 'Segundo' },
  { code: 'RD', label: 'Varilla' },
]

// Helper functions for category hierarchy
const migrateLegacyCategories = (cats) => {
  if (!cats || cats.length === 0) return []
  if (typeof cats[0] === 'object' && cats[0].id) return cats
  return cats.map((name) => ({
    id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name,
    parentId: null,
  }))
}

const getRootCategories = (categories) => {
  return categories.filter(cat => cat.parentId === null)
}

const getSubcategories = (categories, parentId) => {
  return categories.filter(cat => cat.parentId === parentId)
}

const getCategoryById = (categories, id) => {
  return categories.find(cat => cat.id === id)
}

// Obtener todas las subcategorías de una categoría (incluyendo subcategorías de subcategorías)
const getAllSubcategoryIds = (categories, parentId) => {
  const directSubcats = getSubcategories(categories, parentId)
  let allIds = directSubcats.map(cat => cat.id)

  // Recursivamente obtener subcategorías de las subcategorías
  directSubcats.forEach(subcat => {
    const nestedIds = getAllSubcategoryIds(categories, subcat.id)
    allIds = [...allIds, ...nestedIds]
  })

  return allIds
}

// Helper para verificar estado de vencimiento de productos (FEFO - First Expire First Out)
const getProductExpirationStatus = (product) => {
  if (!product.trackExpiration || !product.expirationDate) {
    return null
  }

  const expDate = product.expirationDate.toDate
    ? product.expirationDate.toDate()
    : new Date(product.expirationDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  expDate.setHours(0, 0, 0, 0)

  const diffTime = expDate - today
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { status: 'expired', days: Math.abs(diffDays), message: `Vencido hace ${Math.abs(diffDays)} días`, canSell: false }
  } else if (diffDays === 0) {
    return { status: 'today', days: 0, message: 'Vence hoy', canSell: true }
  } else if (diffDays <= 30) {
    return { status: 'critical', days: diffDays, message: `Vence en ${diffDays} días`, canSell: true }
  } else if (diffDays <= 60) {
    return { status: 'warning', days: diffDays, message: `Vence en ${diffDays} días`, canSell: true }
  } else if (diffDays <= 90) {
    return { status: 'caution', days: diffDays, message: `Vence en ${diffDays} días`, canSell: true }
  }

  return { status: 'ok', days: diffDays, message: null, canSell: true }
}

export default function POS() {
  const { user, isDemoMode, demoData, getBusinessId, businessMode, businessSettings, hasFeature } = useAppContext()
  const { filterWarehousesByAccess, allowedWarehouses, filterBranchesByAccess, allowedBranches } = useAuth()
  const { branding } = useBranding()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const ticketRef = useRef(null)
  const { isOnline, isOffline } = useOnlineStatus()
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [taxConfig, setTaxConfig] = useState({ igvRate: 18, igvExempt: false }) // Configuración de impuestos
  const [cart, setCart] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [documentType, setDocumentType] = useState('boleta')
  // Obtener fecha local en formato YYYY-MM-DD (sin usar toISOString que convierte a UTC)
  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const [emissionDate, setEmissionDate] = useState(getLocalDateString()) // Fecha de emisión (por defecto hoy)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [isPrintingTicket, setIsPrintingTicket] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Estado para datos de mesa
  const [tableData, setTableData] = useState(null)
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('')
  const [lastInvoiceData, setLastInvoiceData] = useState(null)
  const [saleCompleted, setSaleCompleted] = useState(false) // Bloquea el carrito después de una venta exitosa
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Warehouses (para stock/inventario)
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouse, setSelectedWarehouse] = useState(null)

  // Branches/Sucursales (para series de documentos)
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)

  // Barcode Scanner
  const [isScanning, setIsScanning] = useState(false)

  // Sellers
  const [sellers, setSellers] = useState([])
  const [selectedSeller, setSelectedSeller] = useState(null)

  // Categories
  const [categories, setCategories] = useState([])
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')

  // Pagination for products
  const [visibleProductsCount, setVisibleProductsCount] = useState(12)
  const PRODUCTS_PER_PAGE = 12

  // Pagos múltiples - lista simple y vertical
  const [payments, setPayments] = useState([{ method: '', amount: '' }])

  // Tipo de pedido (para reportes)
  const [orderType, setOrderType] = useState('takeaway')

  // Modal de selección de precio (para productos con múltiples precios)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [productForPriceSelection, setProductForPriceSelection] = useState(null)

  // Descuento
  const [discountAmount, setDiscountAmount] = useState('')
  const [discountPercentage, setDiscountPercentage] = useState('')

  // Variant selection modal
  const [selectedProductForVariant, setSelectedProductForVariant] = useState(null)
  const [showVariantModal, setShowVariantModal] = useState(false)

  // Custom product modal
  const [showCustomProductModal, setShowCustomProductModal] = useState(false)
  const [customProduct, setCustomProduct] = useState({
    name: '',
    price: '',
    quantity: 1,
    unit: 'NIU',
    taxAffectation: '10' // '10'=Gravado 18%, '20'=Exonerado, '30'=Inafecto
  })

  // Estado para configuración de impresión web legible
  const [webPrintLegible, setWebPrintLegible] = useState(false)

  // Price editing
  const [editingPriceItemId, setEditingPriceItemId] = useState(null)
  const [editingPrice, setEditingPrice] = useState('')

  // Panel de cliente/documento colapsable
  const [showCustomerPanel, setShowCustomerPanel] = useState(false)

  // Datos del cliente para captura inline
  const [customerData, setCustomerData] = useState({
    documentType: ID_TYPES.DNI,
    documentNumber: '',
    name: '',
    businessName: '',
    address: '',
    email: '',
    phone: ''
  })

  // Estados para pagos parciales (solo notas de venta)
  const [enablePartialPayment, setEnablePartialPayment] = useState(false)
  const [partialPaymentAmount, setPartialPaymentAmount] = useState('')

  // Estados para forma de pago (solo facturas) - Contado/Crédito
  const [paymentType, setPaymentType] = useState('contado') // 'contado' o 'credito'
  const [paymentDueDate, setPaymentDueDate] = useState('') // Fecha de vencimiento
  const [paymentInstallments, setPaymentInstallments] = useState([]) // Cuotas: [{number, amount, dueDate}]

  // Campos opcionales de referencia
  const [guideNumber, setGuideNumber] = useState('') // N° de Guía de Remisión
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('') // N° de Orden de Compra
  const [orderNumber, setOrderNumber] = useState('') // N° de Pedido

  // Ref para controlar si ya se cargó el borrador
  const draftLoadedRef = useRef(false)

  // Clave única para el localStorage basada en el businessId
  const getDraftKey = () => `pos_draft_${getBusinessId()}`

  // Cargar borrador del localStorage al iniciar
  useEffect(() => {
    if (!user?.uid || draftLoadedRef.current) return

    // No cargar borrador si viene de una mesa o una orden
    if (location.state?.fromTable || location.state?.fromOrder) return

    try {
      const savedDraft = localStorage.getItem(getDraftKey())
      if (savedDraft) {
        const draft = JSON.parse(savedDraft)

        // Solo restaurar si el borrador tiene menos de 24 horas
        const draftAge = Date.now() - (draft.timestamp || 0)
        const maxAge = 24 * 60 * 60 * 1000 // 24 horas

        if (draftAge < maxAge) {
          if (draft.cart?.length > 0) setCart(draft.cart)
          if (draft.customerData) setCustomerData(draft.customerData)
          if (draft.documentType) setDocumentType(draft.documentType)
          if (draft.payments) setPayments(draft.payments)
          if (draft.discountAmount) setDiscountAmount(draft.discountAmount)
          if (draft.discountPercentage) setDiscountPercentage(draft.discountPercentage)
          if (draft.orderType) setOrderType(draft.orderType)
          if (draft.selectedSeller) setSelectedSeller(draft.selectedSeller)

          // Mostrar notificación si hay items en el carrito
          if (draft.cart?.length > 0) {
            toast.info(`Borrador recuperado (${draft.cart.length} items)`)
          }
        } else {
          // Borrador muy antiguo, eliminarlo
          localStorage.removeItem(getDraftKey())
        }
      }
    } catch (error) {
      console.error('Error al cargar borrador:', error)
    }

    draftLoadedRef.current = true
  }, [user])

  // Guardar borrador en localStorage cuando cambian los datos importantes
  useEffect(() => {
    if (!user?.uid || !draftLoadedRef.current) return

    // No guardar si no hay nada significativo
    const hasData = cart.length > 0 ||
                    customerData.documentNumber ||
                    customerData.name ||
                    customerData.businessName

    if (!hasData) {
      localStorage.removeItem(getDraftKey())
      return
    }

    // Usar debounce para no guardar en cada tecla
    const timeoutId = setTimeout(() => {
      try {
        const draft = {
          cart,
          customerData,
          documentType,
          payments,
          discountAmount,
          discountPercentage,
          orderType,
          selectedSeller,
          timestamp: Date.now(),
        }
        localStorage.setItem(getDraftKey(), JSON.stringify(draft))
      } catch (error) {
        console.error('Error al guardar borrador:', error)
      }
    }, 500) // Esperar 500ms antes de guardar

    return () => clearTimeout(timeoutId)
  }, [cart, customerData, documentType, payments, discountAmount, discountPercentage, orderType, selectedSeller, user])

  // Función para limpiar el borrador del localStorage
  const clearDraft = () => {
    try {
      localStorage.removeItem(getDraftKey())
    } catch (error) {
      console.error('Error al limpiar borrador:', error)
    }
  }

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Cargar configuración de impresora para webPrintLegible
  useEffect(() => {
    const loadPrinterConfig = async () => {
      if (!user?.uid) return
      try {
        const { getPrinterConfig } = await import('@/services/thermalPrinterService')
        const printerConfigResult = await getPrinterConfig(getBusinessId())
        if (printerConfigResult.success && printerConfigResult.config) {
          setWebPrintLegible(printerConfigResult.config.webPrintLegible || false)
        }
      } catch (error) {
        console.error('Error loading printer config:', error)
      }
    }
    loadPrinterConfig()
  }, [user])

  // Ref para evitar ejecución duplicada del efecto de carga de mesa
  const tableLoadedRef = useRef(false)
  const orderLoadedRef = useRef(false)

  // Detectar si viene de una mesa y cargar items
  useEffect(() => {
    if (location.state?.fromTable && !tableLoadedRef.current) {
      const tableInfo = location.state

      // Marcar como cargado para evitar duplicados
      tableLoadedRef.current = true

      setTableData(tableInfo)
      setOrderType('dine-in') // Establecer automáticamente como "En Mesa"

      // Cargar items de la mesa al carrito
      if (tableInfo.items && tableInfo.items.length > 0) {
        const cartItems = tableInfo.items.map(item => ({
          ...item,
          id: item.productId || item.id,
          // Mantener todos los datos del item de la mesa
        }))
        setCart(cartItems)
        toast.success(`Mesa ${tableInfo.tableNumber} cargada - ${cartItems.length} items`)
      }

      // Limpiar el state de navegación para evitar recarga
      navigate(location.pathname, { replace: true, state: null })
    }

    // Detectar si viene de una orden (para llevar/delivery) y cargar items
    if (location.state?.fromOrder && !orderLoadedRef.current) {
      const orderInfo = location.state

      // Marcar como cargado para evitar duplicados
      orderLoadedRef.current = true

      // Establecer tipo de orden
      setOrderType(orderInfo.orderType || 'takeaway')

      // Cargar items de la orden al carrito
      if (orderInfo.items && orderInfo.items.length > 0) {
        const cartItems = orderInfo.items.map(item => ({
          ...item,
          id: item.productId || item.id,
          // Mantener todos los datos del item
        }))
        setCart(cartItems)

        const orderLabel = orderInfo.orderType === 'delivery' ? 'Delivery' : 'Para Llevar'
        toast.success(`Orden ${orderInfo.orderNumber} cargada (${orderLabel}) - ${cartItems.length} items`)
      }

      // Limpiar el state de navegación para evitar recarga
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state])

  // Cargar datos iniciales
  useEffect(() => {
    loadInitialData()
  }, [user])

  const loadInitialData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        // Cargar datos de demo
        setProducts(demoData.products || [])
        setCustomers(demoData.customers || [])
        setCompanySettings(demoData.business || null)
        setCategories(demoData.categories || [])
        // Almacenes de demo
        setWarehouses(demoData.warehouses || [])
        const defaultWarehouse = (demoData.warehouses || []).find(w => w.isDefault) || demoData.warehouses?.[0] || null
        setSelectedWarehouse(defaultWarehouse)
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()

      // Cargar productos
      const productsResult = await getProducts(businessId)
      if (productsResult.success) {
        // Mostrar todos los productos (los sin stock se mostrarán deshabilitados)
        setProducts(productsResult.data || [])
      }

      // Cargar clientes
      const customersResult = await getCustomers(businessId)
      if (customersResult.success) {
        setCustomers(customersResult.data || [])
      }

      // Cargar configuración de empresa
      const settingsResult = await getCompanySettings(businessId)
      if (settingsResult.success && settingsResult.data) {
        setCompanySettings(settingsResult.data)

        // Pre-cargar logo en background para que esté listo al generar PDF
        if (settingsResult.data.logoUrl) {
          preloadLogo(settingsResult.data.logoUrl).catch(() => {
            // Ignorar errores de pre-carga, se intentará de nuevo al generar PDF
          })
        }

        // Establecer tipo de documento por defecto si está configurado y no hay borrador
        const draftKey = `pos_draft_${businessId}`
        const savedDraft = localStorage.getItem(draftKey)
        const hasDraft = savedDraft && JSON.parse(savedDraft)?.cart?.length > 0

        if (!hasDraft && settingsResult.data.defaultDocumentType) {
          setDocumentType(settingsResult.data.defaultDocumentType)
        }
      }

      // Cargar configuración de impuestos (taxConfig) desde el documento del business
      try {
        console.log('🔍 Cargando taxConfig para businessId:', businessId)
        const businessRef = doc(db, 'businesses', businessId)
        const businessSnap = await getDoc(businessRef)

        console.log('📄 Business documento existe?', businessSnap.exists())

        if (businessSnap.exists()) {
          const businessData = businessSnap.data()
          console.log('📦 emissionConfig encontrado:', businessData.emissionConfig)
          console.log('💰 taxConfig encontrado:', businessData.emissionConfig?.taxConfig)

          if (businessData.emissionConfig?.taxConfig) {
            const newTaxConfig = {
              igvRate: businessData.emissionConfig.taxConfig.igvRate ?? 18,
              igvExempt: businessData.emissionConfig.taxConfig.igvExempt ?? false,
              exemptionReason: businessData.emissionConfig.taxConfig.exemptionReason ?? '',
              exemptionCode: businessData.emissionConfig.taxConfig.exemptionCode ?? '10'
            }
            console.log('✅ TaxConfig a aplicar:', newTaxConfig)
            setTaxConfig(newTaxConfig)
          } else {
            console.warn('⚠️ taxConfig no existe en emissionConfig, usando valores por defecto')
          }
        } else {
          console.warn('⚠️ Documento business no existe para businessId:', businessId)
        }
      } catch (error) {
        console.error('❌ Error al cargar taxConfig:', error)
        // Si hay error, mantener los valores por defecto (IGV 18%)
      }

      // Cargar categorías
      const categoriesResult = await getProductCategories(businessId)
      if (categoriesResult.success) {
        const migratedCategories = migrateLegacyCategories(categoriesResult.data || [])
        setCategories(migratedCategories)
      }

      // Cargar almacenes y seleccionar el default
      let warehouseList = []
      const warehousesResult = await getWarehouses(businessId)
      if (warehousesResult.success) {
        const allWarehouses = warehousesResult.data || []
        // Filtrar almacenes según permisos del usuario
        warehouseList = filterWarehousesByAccess(allWarehouses)
        setWarehouses(warehouseList)
      }

      // Cargar sucursales adicionales (la principal es implícita y usa series globales)
      const branchesResult = await getActiveBranches(businessId)
      if (branchesResult.success) {
        const allBranches = branchesResult.data || []
        // Filtrar sucursales según permisos del usuario
        const branchList = filterBranchesByAccess(allBranches)
        setBranches(branchList)

        // Verificar si el usuario tiene acceso a la Sucursal Principal
        // Si allowedBranches tiene valores y NO incluye 'main', NO tiene acceso a la principal
        const hasMainAccess = !allowedBranches || allowedBranches.length === 0 || allowedBranches.includes('main')

        if (hasMainAccess) {
          // Usuario tiene acceso a la principal
          setSelectedBranch(null)
          // Seleccionar almacén por defecto de la sucursal principal
          const mainWarehouses = warehouseList.filter(w => w.isActive && !w.branchId)
          if (mainWarehouses.length > 0) {
            setSelectedWarehouse(mainWarehouses.find(w => w.isDefault) || mainWarehouses[0])
          } else if (warehouseList.length > 0) {
            // Fallback: cualquier almacén disponible
            setSelectedWarehouse(warehouseList.find(w => w.isDefault) || warehouseList[0])
          }
        } else if (branchList.length > 0) {
          // Usuario NO tiene acceso a la principal, seleccionar la primera sucursal permitida
          setSelectedBranch(branchList[0])
          // También seleccionar el almacén de esa sucursal
          const branchWarehouses = warehouseList.filter(w => w.isActive && w.branchId === branchList[0].id)
          if (branchWarehouses.length > 0) {
            setSelectedWarehouse(branchWarehouses.find(w => w.isDefault) || branchWarehouses[0])
          }
        }
      } else {
        // Si no hay sucursales, usar almacén por defecto
        if (warehouseList.length > 0) {
          setSelectedWarehouse(warehouseList.find(w => w.isDefault) || warehouseList[0])
        }
      }

      // Cargar vendedores activos
      const sellersResult = await getSellers(businessId)
      if (sellersResult.success) {
        // Filtrar solo vendedores activos
        const activeSellers = (sellersResult.data || []).filter(s => s.status === 'active')
        setSellers(activeSellers)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar los datos. Por favor, recarga la página.')
    } finally {
      setIsLoading(false)
    }
  }

  // Optimizar filtrado de productos con useMemo
  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      const search = searchTerm.toLowerCase()
      const matchesSearch =
        p.name?.toLowerCase().includes(search) ||
        p.code?.toLowerCase().includes(search) ||
        p.sku?.toLowerCase().includes(search)

      // Filtro de categoría: incluye productos de subcategorías cuando se selecciona categoría padre
      let matchesCategory = false

      if (selectedCategoryFilter === 'all') {
        matchesCategory = true
      } else if (selectedCategoryFilter === 'sin-categoria') {
        matchesCategory = !p.category
      } else {
        // Verifica si el producto está en la categoría seleccionada O en alguna de sus subcategorías
        const subcategoryIds = getAllSubcategoryIds(categories, selectedCategoryFilter)
        matchesCategory =
          p.category === selectedCategoryFilter ||
          subcategoryIds.includes(p.category)
      }

      return matchesSearch && matchesCategory
    })
  }, [products, searchTerm, selectedCategoryFilter, categories])

  // Apply pagination only when there's no search term (optimizado con useMemo)
  const displayedProducts = React.useMemo(() => {
    return searchTerm || selectedCategoryFilter !== 'all'
      ? filteredProducts
      : filteredProducts.slice(0, visibleProductsCount)
  }, [filteredProducts, searchTerm, selectedCategoryFilter, visibleProductsCount])

  const hasMoreProducts = filteredProducts.length > visibleProductsCount && !searchTerm && selectedCategoryFilter === 'all'

  const loadMoreProducts = () => {
    setVisibleProductsCount(prev => prev + PRODUCTS_PER_PAGE)
  }

  // Reset pagination when search or filter changes
  useEffect(() => {
    if (searchTerm || selectedCategoryFilter !== 'all') {
      setVisibleProductsCount(6) // Reset to initial
    }
  }, [searchTerm, selectedCategoryFilter])

  // Auto-agregar producto cuando se escanea código de barras o SKU
  useEffect(() => {
    // Solo ejecutar si hay un término de búsqueda
    if (!searchTerm || searchTerm.length < 3) return

    // Buscar productos que coincidan exactamente con el código de barras o SKU
    const searchLower = searchTerm.toLowerCase()
    const exactMatches = products.filter(p =>
      p.code?.toLowerCase() === searchLower || p.sku?.toLowerCase() === searchLower
    )

    // Si hay exactamente una coincidencia exacta por código, agregarlo automáticamente
    if (exactMatches.length === 1) {
      const product = exactMatches[0]

      // Verificar que el producto tenga stock disponible en el almacén seleccionado
      // IMPORTANTE: Usar getStockInWarehouse para verificar stock real del almacén
      const warehouseStock = selectedWarehouse
        ? getStockInWarehouse(product, selectedWarehouse.id)
        : (product.stock || 0)

      const hasStock = warehouseStock > 0 || !product.trackStock || product.stock === null || companySettings?.allowNegativeStock

      if (hasStock) {
        addToCart(product)
        // Limpiar el campo de búsqueda después de agregar
        setSearchTerm('')
        // Mostrar feedback al usuario
        toast.success(`${product.name} agregado al carrito`)
      } else {
        toast.error(`${product.name} no tiene stock disponible en ${selectedWarehouse?.name || 'este almacén'}`)
        setSearchTerm('')
      }
    }
  }, [searchTerm, products, companySettings, selectedWarehouse])

  // Función para escanear código de barras
  const handleScanBarcode = async () => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }

    const isNativePlatform = Capacitor.isNativePlatform()
    if (!isNativePlatform) {
      toast.info('El escáner de código de barras solo está disponible en la app móvil')
      return
    }

    setIsScanning(true)

    try {
      // Verificar si el módulo de Google Barcode Scanner está disponible (solo Android)
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
      if (!available) {
        toast.info('Instalando módulo de escáner... Por favor espera')
        await BarcodeScanner.installGoogleBarcodeScannerModule()
        toast.success('Módulo instalado. Intenta escanear de nuevo.')
        setIsScanning(false)
        return
      }

      // Verificar y solicitar permisos de cámara
      const { camera } = await BarcodeScanner.checkPermissions()

      if (camera !== 'granted') {
        const { camera: newPermission } = await BarcodeScanner.requestPermissions()
        if (newPermission !== 'granted') {
          toast.error('Se requiere permiso de cámara para escanear códigos')
          setIsScanning(false)
          return
        }
      }

      // Escanear código de barras
      const { barcodes } = await BarcodeScanner.scan()

      if (barcodes && barcodes.length > 0) {
        const scannedCode = barcodes[0].rawValue
        console.log('Código escaneado:', scannedCode)

        // Buscar producto por código de barras o SKU
        const foundProduct = products.find(
          p => p.code === scannedCode || p.sku === scannedCode || p.barcode === scannedCode
        )

        if (foundProduct) {
          // Verificar stock
          const warehouseStock = getCurrentWarehouseStock(foundProduct)
          if (foundProduct.stock !== null && warehouseStock <= 0 && !companySettings?.allowNegativeStock) {
            toast.error(`${foundProduct.name} no tiene stock disponible`)
          } else {
            addToCart(foundProduct)
            toast.success(`${foundProduct.name} agregado al carrito`)
          }
        } else {
          toast.error(`No se encontró producto con código: ${scannedCode}`)
        }
      }
    } catch (error) {
      console.error('Error al escanear:', error)
      if (error.message !== 'User cancelled the scan') {
        toast.error('Error al escanear el código de barras')
      }
    } finally {
      setIsScanning(false)
    }
  }

  const addToCart = (product, selectedPrice = null) => {
    // Bloquear si ya se completó una venta
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }

    // If product has variants, show variant selection modal
    if (product.hasVariants) {
      setSelectedProductForVariant(product)
      setShowVariantModal(true)
      return
    }

    // Verificar si tiene múltiples precios y no viene con precio ya seleccionado
    const hasMultiplePrices = businessSettings?.multiplePricesEnabled && (product.price2 || product.price3 || product.price4)
    if (hasMultiplePrices && selectedPrice === null) {
      // Verificar si el cliente seleccionado tiene un nivel de precio asignado
      if (selectedCustomer?.priceLevel) {
        // Usar el precio automáticamente según el nivel del cliente
        const priceKey = selectedCustomer.priceLevel // 'price1', 'price2', 'price3', o 'price4'
        const autoPrice = priceKey === 'price1' ? product.price : (product[priceKey] || product.price)
        return addToCart({ ...product, price: autoPrice }, autoPrice)
      }
      // Mostrar modal para seleccionar precio
      setProductForPriceSelection(product)
      setShowPriceModal(true)
      return
    }

    // FEFO: Verificar si el producto está vencido (solo en modo farmacia o si tiene control de vencimiento)
    const expirationStatus = getProductExpirationStatus(product)
    if (expirationStatus && !expirationStatus.canSell) {
      toast.error(`No se puede vender: ${product.name} - ${expirationStatus.message}`)
      return
    }

    // Mostrar advertencia si está próximo a vencer (pero permitir la venta)
    if (expirationStatus && ['today', 'critical'].includes(expirationStatus.status)) {
      toast.warning(`Atención: ${product.name} - ${expirationStatus.message}`)
    }

    // Verificar stock del almacén seleccionado solo si allowNegativeStock es false
    const warehouseStock = getCurrentWarehouseStock(product)
    if (product.stock !== null && warehouseStock <= 0 && !companySettings?.allowNegativeStock) {
      toast.error(`Producto sin stock en ${selectedWarehouse?.name || 'este almacén'}`)
      return
    }

    const existingItem = cart.find(item => item.id === product.id)

    if (existingItem) {
      // Verificar si hay suficiente stock en el almacén solo si allowNegativeStock es false
      if (product.stock !== null && existingItem.quantity >= warehouseStock && !companySettings?.allowNegativeStock) {
        toast.error(`Stock insuficiente en ${selectedWarehouse?.name || 'este almacén'}. Disponible: ${warehouseStock}`)
        return
      }

      setCart(
        cart.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else {
      setCart([...cart, { ...product, quantity: 1 }])
    }
  }

  // Manejar selección de precio desde el modal
  const handlePriceSelection = (priceLevel) => {
    if (!productForPriceSelection) return

    const product = productForPriceSelection
    let selectedPrice = product.price // default price1

    if (priceLevel === 'price2' && product.price2) {
      selectedPrice = product.price2
    } else if (priceLevel === 'price3' && product.price3) {
      selectedPrice = product.price3
    } else if (priceLevel === 'price4' && product.price4) {
      selectedPrice = product.price4
    }

    // Agregar al carrito con el precio seleccionado
    addToCart({ ...product, price: selectedPrice }, selectedPrice)

    // Cerrar modal
    setShowPriceModal(false)
    setProductForPriceSelection(null)
  }

  const addVariantToCart = (product, variant) => {
    // Bloquear si ya se completó una venta
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }

    // Check stock for variant solo si allowNegativeStock es false
    if (variant.stock !== null && variant.stock <= 0 && !companySettings?.allowNegativeStock) {
      toast.error('Variante sin stock disponible')
      return
    }

    // Create unique ID for variant (product ID + variant SKU)
    const variantCartId = `${product.id}-${variant.sku}`

    // Find existing variant in cart
    const existingItem = cart.find(item => item.cartId === variantCartId)

    if (existingItem) {
      // Check stock solo si allowNegativeStock es false
      if (variant.stock !== null && existingItem.quantity >= variant.stock && !companySettings?.allowNegativeStock) {
        toast.error('No hay suficiente stock disponible para esta variante')
        return
      }

      setCart(
        cart.map(item =>
          item.cartId === variantCartId ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else {
      // Add new variant to cart with unique cartId and variant info
      const cartItem = {
        cartId: variantCartId,
        id: product.id,
        code: variant.sku,
        name: product.name,
        variantSku: variant.sku,
        variantAttributes: variant.attributes,
        price: variant.price,
        stock: variant.stock,
        quantity: 1,
        isVariant: true,
        imageUrl: product.imageUrl, // Include product image
      }
      setCart([...cart, cartItem])
    }

    // Close modal
    setShowVariantModal(false)
    setSelectedProductForVariant(null)
  }

  const addCustomProductToCart = () => {
    // Bloquear si ya se completó una venta
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      setShowCustomProductModal(false)
      return
    }

    // Validar campos
    if (!customProduct.name || !customProduct.name.trim()) {
      toast.error('El nombre del producto es requerido')
      return
    }

    const price = parseFloat(customProduct.price)
    if (!price || price <= 0) {
      toast.error('El precio debe ser mayor a 0')
      return
    }

    const quantity = parseFloat(customProduct.quantity) || 1
    if (quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    // Crear producto personalizado con ID único
    const customProductItem = {
      id: `custom-${Date.now()}`,
      code: 'CUSTOM',
      name: customProduct.name.trim(),
      price: price,
      quantity: quantity,
      unit: customProduct.unit || 'NIU',
      // Si la empresa está exenta de IGV, forzar exonerado
      taxAffectation: taxConfig.igvExempt ? '20' : (customProduct.taxAffectation || '10'),
      stock: null, // Productos personalizados no tienen control de stock
      isCustom: true,
    }

    setCart([...cart, customProductItem])
    toast.success('Producto personalizado agregado al carrito')

    // Resetear y cerrar modal
    setCustomProduct({ name: '', price: '', quantity: 1, unit: 'NIU', taxAffectation: '10' })
    setShowCustomProductModal(false)
  }

  const updateQuantity = (itemId, change) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    setCart(
      cart
        .map(item => {
          const matchId = item.cartId || item.id
          if (matchId === itemId) {
            const newQuantity = item.quantity + change

            // Verificar stock del almacén seleccionado (solo para productos no personalizados)
            // Si allowNegativeStock está habilitado, permitir venta sin stock
            if (item.stock !== null && !item.isCustom && !companySettings?.allowNegativeStock) {
              const productData = products.find(p => p.id === item.id)
              if (productData) {
                const warehouseStock = getCurrentWarehouseStock(productData)
                if (newQuantity > warehouseStock) {
                  toast.error(`Stock insuficiente en ${selectedWarehouse?.name || 'este almacén'}. Disponible: ${warehouseStock}`)
                  return item
                }
              }
            }

            return { ...item, quantity: newQuantity }
          }
          return item
        })
        .filter(item => item.quantity > 0)
    )
  }

  // Función para establecer cantidad directamente (para productos por peso o input manual)
  const setQuantityDirectly = (itemId, newQuantity) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    const quantity = parseFloat(newQuantity)
    if (isNaN(quantity) || quantity < 0) return

    setCart(
      cart
        .map(item => {
          const matchId = item.cartId || item.id
          if (matchId === itemId) {
            // Verificar stock del almacén seleccionado (solo para productos no personalizados)
            // Si allowNegativeStock está habilitado, permitir venta sin stock
            if (item.stock !== null && !item.isCustom && quantity > 0 && !companySettings?.allowNegativeStock) {
              const productData = products.find(p => p.id === item.id)
              if (productData) {
                const warehouseStock = getCurrentWarehouseStock(productData)
                if (quantity > warehouseStock) {
                  toast.error(`Stock insuficiente en ${selectedWarehouse?.name || 'este almacén'}. Disponible: ${warehouseStock}`)
                  return item
                }
              }
            }
            return { ...item, quantity: quantity }
          }
          return item
        })
        .filter(item => item.quantity > 0)
    )
  }

  const removeFromCart = itemId => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    setCart(cart.filter(item => (item.cartId || item.id) !== itemId))
  }

  const startEditingPrice = (itemId, currentPrice) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    setEditingPriceItemId(itemId)
    setEditingPrice(currentPrice.toString())
  }

  const cancelEditingPrice = () => {
    setEditingPriceItemId(null)
    setEditingPrice('')
  }

  const saveEditedPrice = (itemId) => {
    const newPrice = parseFloat(editingPrice)

    if (isNaN(newPrice) || newPrice <= 0) {
      toast.error('El precio debe ser mayor a 0')
      return
    }

    setCart(cart.map(item => {
      const currentItemId = item.cartId || item.id
      if (currentItemId === itemId) {
        return { ...item, price: newPrice }
      }
      return item
    }))

    setEditingPriceItemId(null)
    setEditingPrice('')
    toast.success('Precio actualizado')
  }

  const clearCart = () => {
    setCart([])
    setSelectedCustomer(null)
    setDocumentType(companySettings?.defaultDocumentType || 'boleta')
    setOrderType('takeaway')
    setCustomerData({
      documentType: ID_TYPES.DNI,
      documentNumber: '',
      name: '',
      businessName: '',
      address: '',
      email: '',
      phone: ''
    })
    setPayments([{ method: '', amount: '' }])
    setLastInvoiceData(null)
    setSaleCompleted(false) // Desbloquear carrito para nueva venta
    setDiscountAmount('')
    setDiscountPercentage('')
    // Reset forma de pago
    setPaymentType('contado')
    setPaymentDueDate('')
    setPaymentInstallments([])
    // Reset campos de referencia
    setGuideNumber('')
    setPurchaseOrderNumber('')
    setOrderNumber('')
    clearDraft() // Limpiar borrador de localStorage
  }

  // Buscar datos de DNI o RUC automáticamente
  const handleLookupDocument = async () => {
    const docNumber = customerData.documentNumber

    if (!docNumber) {
      toast.error('Ingrese un número de documento para buscar')
      return
    }

    setIsLookingUp(true)

    try {
      let result

      // Determinar si es DNI o RUC según la longitud
      if (docNumber.length === 8) {
        result = await consultarDNI(docNumber)
      } else if (docNumber.length === 11) {
        result = await consultarRUC(docNumber)
      } else {
        toast.error('El documento debe tener 8 dígitos (DNI) o 11 dígitos (RUC)')
        return
      }

      if (result.success) {
        // Autocompletar datos
        if (docNumber.length === 8) {
          // Datos de DNI
          setCustomerData(prev => ({
            ...prev,
            name: result.data.nombreCompleto || '',
          }))
          toast.success(`Datos encontrados: ${result.data.nombreCompleto}`)
        } else {
          // Datos de RUC
          setCustomerData(prev => ({
            ...prev,
            businessName: result.data.razonSocial || '',
            name: result.data.nombreComercial || '',
            address: result.data.direccion || '',
          }))
          toast.success(`Datos encontrados: ${result.data.razonSocial}`)
        }
      } else {
        toast.error(result.error || 'No se encontraron datos para este documento', 5000)
      }
    } catch (error) {
      console.error('Error al buscar documento:', error)
      toast.error('Error al consultar el documento. Verifique su conexión.', 5000)
    } finally {
      setIsLookingUp(false)
    }
  }

  // Actualizar tipo de documento del cliente cuando cambia el tipo de comprobante
  useEffect(() => {
    // Solo forzar RUC en facturas, en boletas mantener el tipo seleccionado o default DNI
    if (documentType === 'factura') {
      setCustomerData(prev => ({
        ...prev,
        documentType: ID_TYPES.RUC
      }))
    } else if (documentType === 'boleta' && !customerData.documentType) {
      // Solo setear DNI por default si no hay tipo seleccionado
      setCustomerData(prev => ({
        ...prev,
        documentType: ID_TYPES.DNI
      }))
    }
  }, [documentType])

  // Handlers para descuento
  const handleDiscountAmountChange = (value) => {
    setDiscountAmount(value)

    if (value === '') {
      setDiscountPercentage('')
      return
    }

    const amount = parseFloat(value)
    if (!isNaN(amount) && amount >= 0) {
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      if (subtotal > 0) {
        const percentage = ((amount / subtotal) * 100).toFixed(2)
        setDiscountPercentage(percentage)
      }
    }
  }

  const handleDiscountPercentageChange = (value) => {
    setDiscountPercentage(value)

    if (value === '') {
      setDiscountAmount('')
      return
    }

    const percentage = parseFloat(value)
    if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      const amount = ((subtotal * percentage) / 100).toFixed(2)
      setDiscountAmount(amount)
    }
  }

  const handleClearDiscount = () => {
    setDiscountAmount('')
    setDiscountPercentage('')
  }

  // Calcular montos sin descuento (optimizado con useMemo)
  const amounts = React.useMemo(() => {
    // Usar calculateMixedInvoiceAmounts para manejar productos con diferentes taxAffectation
    const baseAmounts = calculateMixedInvoiceAmounts(
      cart.map(item => ({
        price: item.price,
        quantity: item.quantity,
        taxAffectation: item.taxAffectation || '10', // Default: Gravado
      })),
      taxConfig.igvRate
    )

    // Aplicar descuento al TOTAL (no al subtotal) para que sea más intuitivo
    const discount = parseFloat(discountAmount) || 0

    // El descuento se aplica al total (con IGV incluido)
    const totalAfterDiscount = Math.max(0, baseAmounts.total - discount)

    // Calcular proporción del descuento para aplicarlo a cada tipo
    const discountRatio = baseAmounts.total > 0 ? totalAfterDiscount / baseAmounts.total : 1

    // Recalcular montos con descuento aplicado proporcionalmente
    const gravadoAfterDiscount = baseAmounts.gravado.total * discountRatio
    const exoneradoAfterDiscount = baseAmounts.exonerado.total * discountRatio
    const inafectoAfterDiscount = baseAmounts.inafecto.total * discountRatio

    // Recalcular IGV solo de productos gravados
    const subtotalGravadoAfterDiscount = gravadoAfterDiscount / (1 + taxConfig.igvRate / 100)
    const igvAfterDiscount = gravadoAfterDiscount - subtotalGravadoAfterDiscount

    // Subtotal total = subtotal gravado + exonerado + inafecto
    const subtotalAfterDiscount = subtotalGravadoAfterDiscount + exoneradoAfterDiscount + inafectoAfterDiscount

    return {
      subtotal: Number(baseAmounts.subtotal.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      subtotalAfterDiscount: Number(subtotalAfterDiscount.toFixed(2)),
      igv: Number(igvAfterDiscount.toFixed(2)),
      total: Number(totalAfterDiscount.toFixed(2)),
      // Montos por tipo de afectación (para mostrar desglose)
      gravado: baseAmounts.gravado,
      exonerado: baseAmounts.exonerado,
      inafecto: baseAmounts.inafecto,
    }
  }, [cart, taxConfig.igvRate, discountAmount])

  // Calcular totales de pago (optimizado con useMemo)
  const paymentTotals = React.useMemo(() => {
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

    // Si hay pago parcial habilitado, el monto a pagar ahora es el especificado
    // Si el monto es 0 o vacío, es una venta al crédito (no requiere pago inmediato)
    let amountToPay
    if (enablePartialPayment) {
      const partialAmount = parseFloat(partialPaymentAmount) || 0
      amountToPay = partialAmount
    } else {
      amountToPay = amounts.total
    }

    const remaining = amountToPay - totalPaid
    return { totalPaid, remaining, amountToPay }
  }, [payments, amounts.total, enablePartialPayment, partialPaymentAmount])

  const { totalPaid, remaining, amountToPay } = paymentTotals

  // Filtrar clientes (optimizado con useMemo)
  const filteredCustomers = React.useMemo(() => {
    if (!customerSearchTerm) return []

    return customers.filter(c => {
      // Filtrar según tipo de documento
      const matchesDocType = documentType === 'factura'
        ? c.documentNumber?.length === 11
        : true

      // Filtrar según búsqueda
      const searchLower = customerSearchTerm.toLowerCase()
      const matchesSearch =
        c.name?.toLowerCase().includes(searchLower) ||
        c.businessName?.toLowerCase().includes(searchLower) ||
        c.documentNumber?.includes(customerSearchTerm)

      return matchesDocType && matchesSearch
    })
  }, [customers, customerSearchTerm, documentType])

  // Actualizar método de pago
  const handlePaymentMethodChange = (index, method) => {
    const newPayments = [...payments]
    newPayments[index].method = method

    // Auto-fill amount if it's empty and this is the first or only payment
    if (!newPayments[index].amount && payments.length === 1) {
      newPayments[index].amount = amounts.total.toString()
    } else if (!newPayments[index].amount && payments.length > 1) {
      newPayments[index].amount = remaining.toString()
    }

    setPayments(newPayments)
  }

  // Actualizar monto de pago
  const handlePaymentAmountChange = (index, amount) => {
    const newPayments = [...payments]
    newPayments[index].amount = amount
    setPayments(newPayments)
  }

  // Agregar un nuevo método de pago
  const handleAddPaymentMethod = () => {
    // Si solo hay un método con todo el monto, dividir el total entre los métodos
    if (payments.length === 1 && parseFloat(payments[0].amount) === amounts.total) {
      const halfAmount = (amounts.total / 2).toFixed(2)
      setPayments([
        { ...payments[0], amount: halfAmount },
        { method: '', amount: halfAmount }
      ])
    } else {
      // Agregar un nuevo método con el saldo restante
      setPayments([...payments, { method: '', amount: remaining > 0 ? remaining.toFixed(2) : '' }])
    }
  }

  // Eliminar un método de pago
  const handleRemovePaymentMethod = (index) => {
    if (payments.length > 1) {
      setPayments(payments.filter((_, i) => i !== index))
    }
  }


  const handleCheckout = async () => {
    if (!user?.uid) return

    // Validar carrito no vacío
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
    }

    // Si es factura, validar datos de RUC
    if (documentType === 'factura') {
      if (!customerData.documentNumber || customerData.documentNumber.length !== 11) {
        toast.error('Las facturas requieren un RUC válido (11 dígitos)')
        return
      }
      if (!customerData.businessName) {
        toast.error('La razón social es requerida para facturas')
        return
      }
    }

    // Si es boleta mayor a 700 soles, validar DNI obligatorio (según normativa SUNAT)
    if (documentType === 'boleta' && amounts.total > 700) {
      if (!customerData.documentNumber) {
        toast.error('Por normativa SUNAT, las boletas mayores a S/ 700.00 requieren documento del cliente')
        return
      }
      if (customerData.documentType === ID_TYPES.DNI && customerData.documentNumber.length !== 8) {
        toast.error('El DNI debe tener 8 dígitos')
        return
      }
      if (customerData.documentType === ID_TYPES.CE && customerData.documentNumber.length < 9) {
        toast.error('El Carnet de Extranjería debe tener al menos 9 caracteres')
        return
      }
      if (!customerData.name || customerData.name.trim() === '') {
        toast.error('Por normativa SUNAT, las boletas mayores a S/ 700.00 requieren el nombre completo del cliente')
        return
      }
    }

    // Si es boleta, validar datos mínimos (opcional, puede ser cliente general)
    if (documentType === 'boleta' && customerData.documentNumber) {
      // Validar según el tipo de documento seleccionado
      if (customerData.documentType === ID_TYPES.RUC) {
        if (customerData.documentNumber.length !== 11) {
          toast.error('El RUC debe tener 11 dígitos')
          return
        }
      } else if (customerData.documentType === ID_TYPES.DNI) {
        if (customerData.documentNumber.length !== 8) {
          toast.error('El DNI debe tener 8 dígitos')
          return
        }
      } else if (customerData.documentType === ID_TYPES.CE) {
        if (customerData.documentNumber.length < 9) {
          toast.error('El Carnet de Extranjería debe tener al menos 9 caracteres')
          return
        }
      }
    }

    // Detectar si es venta al crédito:
    // 1. Nota de venta con pago parcial habilitado y monto 0
    // 2. Factura con forma de pago "crédito"
    const isCreditSale = (enablePartialPayment && amountToPay === 0) || (documentType === 'factura' && paymentType === 'credito')

    // Si hidePaymentMethods está activo, usar efectivo automáticamente
    const isHidePaymentMethods = hasFeature('hidePaymentMethods')

    // Validar que se haya cubierto el monto a pagar (total o parcial)
    // EXCEPCIÓN: Si es venta al crédito, no requiere pago inmediato
    // EXCEPCIÓN: Si hidePaymentMethods está activo, se asume pago completo en efectivo
    if (!isCreditSale && !isHidePaymentMethods && totalPaid < amountToPay) {
      toast.error(`Falta pagar ${formatCurrency(remaining)}. Agrega más métodos de pago.`)
      return
    }

    // Construir array de pagos
    let allPayments
    if (isHidePaymentMethods) {
      // Si hidePaymentMethods está activo, crear pago automático en efectivo
      allPayments = [{
        method: 'Efectivo',
        methodKey: 'CASH',
        amount: amountToPay
      }]
    } else {
      // Filtrar pagos válidos del formulario
      allPayments = payments
        .filter(p => p.method && parseFloat(p.amount) > 0)
        .map(p => ({
          method: PAYMENT_METHODS[p.method],
          methodKey: p.method,
          amount: parseFloat(p.amount)
        }))
    }

    // Validar que haya al menos un método de pago
    // EXCEPCIÓN: Si es venta al crédito, no requiere método de pago
    if (!isCreditSale && allPayments.length === 0) {
      toast.error('Debes seleccionar al menos un método de pago')
      return
    }

    setIsProcessing(true)

    try {
      // MODO DEMO: Simular venta sin guardar en Firebase
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Procesando venta simulada...')
        // Simular un delay para hacer más realista
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Preparar items de la factura
        const items = cart.map(item => ({
          productId: item.id,
          code: item.code || item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit || 'UNIDAD',
          unitPrice: item.price,
          subtotal: item.price * item.quantity,
          taxAffectation: item.taxAffectation || '10', // '10'=Gravado (default), '20'=Exonerado, '30'=Inafecto
        }))

        // Crear datos simulados de factura
        const demoNumber = documentType === 'factura' ? 'F001-00000099' :
                          documentType === 'boleta' ? 'B001-00000099' : 'NV01-00000099'

        // Detectar venta al crédito para demo
        const isCreditSaleDemo = isCreditSale && documentType === 'nota_venta'

        const invoiceData = {
          number: demoNumber,
          series: documentType === 'factura' ? 'F001' : documentType === 'boleta' ? 'B001' : 'NV01',
          correlativeNumber: 99,
          documentType: documentType,
          customer: customerData.documentNumber || customerData.name || customerData.businessName
            ? {
                documentType: customerData.documentType || ID_TYPES.DNI,
                documentNumber: customerData.documentNumber || '00000000',
                name: documentType === 'factura'
                  ? (customerData.businessName || customerData.name || 'Cliente')
                  : (customerData.name || customerData.businessName || 'Cliente'),
                businessName: customerData.businessName || '',
                email: customerData.email || '',
                phone: customerData.phone || '',
                address: customerData.address || '',
              }
            : {
                documentType: ID_TYPES.DNI,
                documentNumber: '00000000',
                name: 'Cliente General',
                businessName: '',
                email: '',
                phone: '',
                address: '',
              },
          items: items,
          subtotal: amounts.subtotalAfterDiscount, // Subtotal después del descuento (base imponible)
          subtotalBeforeDiscount: amounts.subtotal, // Subtotal original (antes del descuento)
          discount: amounts.discount || 0,
          discountPercentage: parseFloat(discountPercentage) || 0,
          igv: amounts.igv,
          total: amounts.total,
          // Montos por tipo de afectación tributaria
          opGravadas: amounts.gravado?.total || 0,
          opExoneradas: amounts.exonerado?.total || 0,
          opInafectas: amounts.inafecto?.total || 0,
          payments: allPayments,
          paymentMethod: allPayments.length > 0 ? allPayments[0].method : 'Efectivo',
          status: isCreditSaleDemo ? 'pending' : 'paid',
          notes: '',
          sunatStatus: 'not_applicable',
          sunatResponse: null,
          sunatSentAt: null,
          createdAt: new Date(emissionDate + 'T12:00:00'),
          emissionDate: emissionDate,
        }

        setLastInvoiceNumber(demoNumber)
        setLastInvoiceData(invoiceData)

        const documentName = documentType === 'factura' ? 'Factura' : documentType === 'nota_venta' ? 'Nota de Venta' : 'Boleta'
        toast.success(`${documentName} ${demoNumber} generada exitosamente (DEMO - No se guardó)`, 5000)

        // Limpiar el carrito y resetear el estado
        setCart([])
        setCustomerData({
          documentType: ID_TYPES.DNI,
          documentNumber: '',
          name: '',
          businessName: '',
          email: '',
          phone: '',
          address: '',
        })
        setPayments([{ id: Date.now(), method: '', amount: '' }])
        setSelectedCustomer(null)
        setDiscountAmount('')
        setDiscountPercentage('')

        setIsProcessing(false)
        return
      }

      const businessId = getBusinessId()

      // 1. Obtener siguiente número de documento (priorizando series de sucursal, luego almacén)
      const numberResult = await getNextDocumentNumber(businessId, documentType, selectedWarehouse?.id, selectedBranch?.id)
      if (!numberResult.success) {
        console.error('❌ Error detallado al generar número:', numberResult.error)
        throw new Error(numberResult.error || 'Error al generar número de comprobante')
      }
      console.log('✅ Número generado:', numberResult.number, 'Sucursal:', selectedBranch?.name || 'N/A', 'Almacén:', selectedWarehouse?.name || 'Global')

      // 2. Preparar items de la factura
      const items = cart.map(item => ({
        productId: item.id,
        code: item.sku || item.code || '', // Priorizar SKU, luego código, vacío si no hay
        name: item.name,
        quantity: item.quantity,
        unit: item.unit || 'UNIDAD',
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
        taxAffectation: item.taxAffectation || '10', // '10'=Gravado (default), '20'=Exonerado, '30'=Inafecto
        ...(item.notes && { notes: item.notes }), // Incluir notas si existen
      }))

      // 3. Crear factura
      // Calcular datos de pago parcial y ventas al crédito
      const partialAmount = parseFloat(partialPaymentAmount) || 0
      const isCreditSaleForNotaVenta = enablePartialPayment && partialAmount === 0 && documentType === 'nota_venta'
      const isCreditSaleForFactura = documentType === 'factura' && paymentType === 'credito'
      const isCreditSaleForInvoice = isCreditSaleForNotaVenta || isCreditSaleForFactura
      const isPartialPayment = enablePartialPayment && partialAmount > 0 && documentType === 'nota_venta'

      const amountPaid = isCreditSaleForInvoice ? 0 : (isPartialPayment ? partialAmount : amounts.total)
      const balance = isCreditSaleForInvoice ? amounts.total : (isPartialPayment ? amounts.total - amountPaid : 0)
      const paymentStatus = isCreditSaleForInvoice ? 'pending' : (isPartialPayment ? (balance > 0 ? 'partial' : 'completed') : 'completed')

      const invoiceData = {
        number: numberResult.number,
        series: numberResult.series,
        correlativeNumber: numberResult.correlativeNumber,
        documentType: documentType,
        customer: customerData.documentNumber || customerData.name || customerData.businessName
          ? {
              documentType: customerData.documentType || ID_TYPES.DNI,
              documentNumber: customerData.documentNumber || '00000000',
              name: documentType === 'factura'
                ? (customerData.businessName || customerData.name || 'Cliente')
                : (customerData.name || customerData.businessName || 'Cliente'),
              businessName: customerData.businessName || '',
              email: customerData.email || '',
              phone: customerData.phone || '',
              address: customerData.address || '',
            }
          : {
              documentType: ID_TYPES.DNI,
              documentNumber: '00000000',
              name: 'Cliente General',
              businessName: '',
              email: '',
              phone: '',
              address: '',
            },
        items: items,
        subtotal: amounts.subtotalAfterDiscount, // Subtotal después del descuento (base imponible)
        subtotalBeforeDiscount: amounts.subtotal, // Subtotal original (antes del descuento)
        discount: amounts.discount || 0,
        discountPercentage: parseFloat(discountPercentage) || 0,
        igv: amounts.igv,
        total: amounts.total,
        // Montos por tipo de afectación tributaria
        opGravadas: amounts.gravado?.total || 0,
        opExoneradas: amounts.exonerado?.total || 0,
        opInafectas: amounts.inafecto?.total || 0,
        // Configuración de impuestos
        taxConfig: taxConfig,
        // Guardar los métodos de pago
        payments: allPayments,
        // Guardar el primer método como principal para compatibilidad
        paymentMethod: allPayments.length > 0 ? allPayments[0].method : 'Efectivo',
        status: isCreditSaleForInvoice ? 'pending' : 'paid',
        // Datos de pago parcial (solo para notas de venta)
        ...(documentType === 'nota_venta' && {
          paymentStatus: paymentStatus,
          amountPaid: amountPaid,
          balance: balance,
          paymentHistory: isPartialPayment ? [{
            amount: amountPaid,
            date: new Date(),
            method: allPayments.length > 0 ? allPayments[0].method : 'Efectivo',
            recordedBy: user.email || user.uid,
            recordedByName: user.displayName || user.email || 'Usuario'
          }] : []
        }),
        notes: '',
        // Estado de SUNAT - solo facturas y boletas pueden enviarse a SUNAT
        sunatStatus: (documentType === 'factura' || documentType === 'boleta') ? 'pending' : 'not_applicable',
        sunatResponse: null,
        sunatSentAt: null,
        // Fecha de emisión
        emissionDate: emissionDate,
        // Información del vendedor
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Usuario',
        createdByEmail: user.email || '',
        // Tipo de pedido (para reportes)
        orderType: orderType,
        // Información del mozo (si viene de una mesa)
        waiterId: tableData?.waiterId || null,
        waiterName: tableData?.waiterName || null,
        // Información del vendedor
        sellerId: selectedSeller?.id || null,
        sellerName: selectedSeller?.name || null,
        sellerCode: selectedSeller?.code || null,
        // Información del almacén/punto de venta (para inventario)
        warehouseId: selectedWarehouse?.id || null,
        warehouseName: selectedWarehouse?.name || null,
        warehouseAddress: selectedWarehouse?.address || null,
        warehousePhone: selectedWarehouse?.phone || null,
        // Información de la sucursal (para series de documentos y datos del comprobante)
        branchId: selectedBranch?.id || null,
        branchName: selectedBranch?.name || null,
        branchAddress: selectedBranch?.address || null,
        branchPhone: selectedBranch?.phone || null,
        // Forma de pago (solo para facturas) - Contado/Crédito con cuotas
        ...(documentType === 'factura' && {
          paymentType: paymentType, // 'contado' o 'credito'
          paymentDueDate: paymentType === 'credito' ? paymentDueDate : null,
          paymentInstallments: paymentType === 'credito' ? paymentInstallments.map(inst => ({
            number: inst.number,
            amount: parseFloat(inst.amount) || 0,
            dueDate: inst.dueDate
          })) : [],
          // Campos opcionales de referencia
          guideNumber: guideNumber || null,
          purchaseOrderNumber: purchaseOrderNumber || null,
          orderNumber: orderNumber || null,
        }),
      }

      // MODO OFFLINE: Si no hay conexión, guardar en cola local
      if (isOffline) {
        console.log('📴 Modo offline: Guardando venta en cola local...')

        // Solo permitir notas de venta en modo offline (no requieren SUNAT)
        if (documentType === 'factura' || documentType === 'boleta') {
          toast.warning('Sin conexión: Las facturas y boletas requieren conexión a SUNAT. Puedes crear una Nota de Venta.', 5000)
          setIsProcessing(false)
          return
        }

        try {
          const offlineId = await savePendingSale({
            invoiceData,
            businessId,
            userId: user.uid,
            documentType,
            total: amounts.total,
            customerName: customerData.name || customerData.businessName || 'Cliente General',
          })

          toast.success('Venta guardada localmente. Se sincronizará cuando tengas conexión.', 5000)

          // Mostrar datos de la venta offline
          setLastInvoiceNumber(`OFFLINE-${offlineId}`)
          setLastInvoiceData({
            ...invoiceData,
            id: `offline-${offlineId}`,
            number: `PENDIENTE-${offlineId}`,
            offlineId,
            isOffline: true,
          })
          setSaleCompleted(true)
          setIsProcessing(false)
          return
        } catch (offlineError) {
          console.error('❌ Error guardando venta offline:', offlineError)
          toast.error('Error al guardar la venta localmente')
          setIsProcessing(false)
          return
        }
      }

      const result = await createInvoice(businessId, invoiceData)
      if (!result.success) {
        throw new Error(result.error || 'Error al crear la factura')
      }

      const invoiceId = result.id

      // 3.1. Envío automático a SUNAT (si está configurado)
      const shouldAutoSend = companySettings?.autoSendToSunat === true
      const canSendToSunat = documentType === 'factura' || documentType === 'boleta'

      if (shouldAutoSend && canSendToSunat) {
        try {
          console.log('🚀 Enviando automáticamente a SUNAT...')
          toast.info('Enviando comprobante a SUNAT...', 3000)

          // Usar businessId para obtener las credenciales correctas (del owner)
          await sendInvoiceToSunat(businessId, invoiceId)

          console.log('✅ Comprobante enviado a SUNAT exitosamente')
          toast.success('Comprobante enviado a SUNAT exitosamente', 5000)
        } catch (sunatError) {
          console.error('❌ Error al enviar a SUNAT:', sunatError)
          toast.warning('El comprobante se guardó correctamente, pero hubo un error al enviarlo a SUNAT. Puedes reenviarlo desde la lista de comprobantes.', 7000)
        }
      }

      // 3.2. Guardar cliente automáticamente (si tiene documento válido)
      try {
        const customerResult = await upsertCustomerFromSale(businessId, customerData)
        if (customerResult.created) {
          console.log('✅ Cliente guardado automáticamente:', customerData.documentNumber)
        } else if (customerResult.updated) {
          console.log('✅ Cliente actualizado:', customerData.documentNumber)
        }
      } catch (customerError) {
        // No interrumpir la venta si falla el guardado del cliente
        console.error('⚠️ Error al guardar cliente (no crítico):', customerError)
      }

      // 4. Actualizar stock de productos por almacén (con FEFO para farmacias)
      const stockUpdates = cart
        .filter(item => !item.isCustom) // Excluir solo productos personalizados
        .map(async item => {
          const productData = products.find(p => p.id === item.id)
          if (!productData) return

          // Solo actualizar si el producto maneja stock
          // NO actualizar si:
          // - trackStock === false (explícitamente sin control de stock)
          // - stock === null (producto sin control de inventario)
          if (productData.trackStock === false || productData.stock === null) return

          // Actualizar stock usando el helper de almacén
          const updatedProduct = updateWarehouseStock(
            productData,
            selectedWarehouse?.id || '',
            -item.quantity // Negativo porque es una salida
          )

          const updates = {
            stock: updatedProduct.stock,
            warehouseStocks: updatedProduct.warehouseStocks
          }

          // FEFO: Si el producto tiene lotes, descontar del más próximo a vencer
          if (productData.batches && productData.batches.length > 0) {
            let remainingToDeduct = item.quantity
            const updatedBatches = [...productData.batches]

            // Ordenar lotes por fecha de vencimiento (FEFO - primero el que vence antes)
            updatedBatches.sort((a, b) => {
              if (!a.expirationDate) return 1
              if (!b.expirationDate) return -1
              const dateA = a.expirationDate.toDate ? a.expirationDate.toDate() : new Date(a.expirationDate)
              const dateB = b.expirationDate.toDate ? b.expirationDate.toDate() : new Date(b.expirationDate)
              return dateA - dateB
            })

            // Descontar de cada lote en orden FEFO
            for (let i = 0; i < updatedBatches.length && remainingToDeduct > 0; i++) {
              const batch = updatedBatches[i]
              if (batch.quantity > 0) {
                const deductFromBatch = Math.min(batch.quantity, remainingToDeduct)
                updatedBatches[i] = {
                  ...batch,
                  quantity: batch.quantity - deductFromBatch
                }
                remainingToDeduct -= deductFromBatch
              }
            }

            updates.batches = updatedBatches

            // Recalcular el vencimiento más próximo de lotes con stock > 0
            const activeBatches = updatedBatches.filter(b => b.quantity > 0 && b.expirationDate)
            if (activeBatches.length > 0) {
              activeBatches.sort((a, b) => {
                const dateA = a.expirationDate.toDate ? a.expirationDate.toDate() : new Date(a.expirationDate)
                const dateB = b.expirationDate.toDate ? b.expirationDate.toDate() : new Date(b.expirationDate)
                return dateA - dateB
              })
              const nearestBatch = activeBatches[0]
              updates.expirationDate = nearestBatch.expirationDate
              updates.batchNumber = nearestBatch.batchNumber
            } else {
              // No hay lotes activos, limpiar vencimiento
              updates.expirationDate = null
              updates.batchNumber = null
            }
          }

          // Guardar en Firestore
          return updateProduct(businessId, item.id, updates)
        })

      await Promise.all(stockUpdates)

      // 4.1. Registrar movimientos de stock para historial
      const itemsForMovement = cart.filter(item => {
        if (item.isCustom) return false
        const productData = products.find(p => p.id === item.id)
        if (!productData) {
          console.log('📦 [StockMovement] Producto no encontrado:', item.id)
          return false
        }
        if (productData.trackStock === false) {
          console.log('📦 [StockMovement] Producto sin control de stock:', item.name)
          return false
        }
        if (productData.stock === null) {
          console.log('📦 [StockMovement] Producto con stock null (servicio):', item.name)
          return false
        }
        return true
      })

      console.log('📦 [StockMovement] Items para registrar movimiento:', itemsForMovement.length)

      for (const item of itemsForMovement) {
        try {
          const movementResult = await createStockMovement(businessId, {
            productId: item.id,
            warehouseId: selectedWarehouse?.id || '',
            type: 'sale',
            quantity: -item.quantity,
            reason: 'Venta',
            referenceType: 'invoice',
            referenceId: invoiceId || '',
            userId: user?.uid,
            notes: `Venta - ${documentType === 'boleta' ? 'Boleta' : documentType === 'factura' ? 'Factura' : 'Nota de Venta'}`
          })
          console.log('📦 [StockMovement] Movimiento creado para:', item.name, movementResult)
        } catch (err) {
          console.error('📦 [StockMovement] Error al crear movimiento para:', item.name, err)
        }
      }

      // 4.5. Descontar ingredientes del inventario (para restaurantes)
      // Procesar cada producto del carrito y descontar sus ingredientes si tiene receta
      for (const item of cart) {
        if (item.isCustom) continue // Saltar productos personalizados

        try {
          const recipeResult = await getRecipeByProductId(businessId, item.id)

          if (recipeResult.success && recipeResult.data) {
            const recipe = recipeResult.data

            // Calcular ingredientes necesarios para la cantidad vendida
            const ingredientsToDeduct = recipe.ingredients.map(ing => ({
              ...ing,
              quantity: ing.quantity * item.quantity // Multiplicar por cantidad vendida
            }))

            // Descontar ingredientes del stock
            await deductIngredients(
              businessId,
              ingredientsToDeduct,
              invoiceId,
              item.name
            )
          }
        } catch (error) {
          // No bloquear la venta si falla el descuento de ingredientes
          console.warn(`⚠️ No se pudo descontar ingredientes para ${item.name}:`, error)
        }
      }

      // 5. Actualizar métricas del mozo (si la venta fue atendida por un mozo)
      if (tableData?.waiterId) {
        try {
          const { increment } = await import('firebase/firestore')
          const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
          const { db } = await import('@/lib/firebase')

          const waiterRef = doc(db, 'businesses', businessId, 'waiters', tableData.waiterId)
          await updateDoc(waiterRef, {
            todaySales: increment(amounts.total),
            todayOrders: increment(1),
            totalSales: increment(amounts.total),
            totalOrders: increment(1),
            updatedAt: serverTimestamp(),
          }).catch(err => {
            console.warn('No se pudo actualizar métricas del mozo:', err)
            // No fallar si no se puede actualizar las métricas
          })
        } catch (error) {
          console.warn('Error al actualizar métricas del mozo:', error)
        }
      }

      // 5.1. Actualizar métricas del vendedor seleccionado
      if (selectedSeller?.id) {
        try {
          const { increment } = await import('firebase/firestore')
          const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
          const { db } = await import('@/lib/firebase')

          const sellerRef = doc(db, 'businesses', businessId, 'sellers', selectedSeller.id)
          await updateDoc(sellerRef, {
            todaySales: increment(amounts.total),
            todayOrders: increment(1),
            totalSales: increment(amounts.total),
            totalOrders: increment(1),
            updatedAt: serverTimestamp(),
          }).catch(err => {
            console.warn('No se pudo actualizar métricas del vendedor:', err)
            // No fallar si no se puede actualizar las métricas
          })
        } catch (error) {
          console.warn('Error al actualizar métricas del vendedor:', error)
        }
      }

      // 6. Si viene de una mesa, liberar la mesa automáticamente
      if (tableData?.tableId) {
        try {
          const releaseResult = await releaseTable(businessId, tableData.tableId)
          if (releaseResult.success) {
            // No mostrar toast aquí, solo limpiar datos de mesa
            // El toast de éxito ya se muestra más abajo
            setTableData(null)
          } else {
            toast.warning(`Comprobante generado, pero no se pudo liberar la mesa automáticamente`)
          }
        } catch (error) {
          console.error('Error al liberar mesa:', error)
          toast.warning(`Comprobante generado, pero no se pudo liberar la mesa automáticamente`)
        }
      }

      // 7. Mostrar éxito
      setLastInvoiceNumber(numberResult.number)
      setLastInvoiceData(invoiceData)
      setSaleCompleted(true) // Bloquear carrito hasta que se inicie nueva venta

      // Mostrar mensaje de éxito con toast
      const documentName = documentType === 'factura' ? 'Factura' : documentType === 'nota_venta' ? 'Nota de Venta' : 'Boleta'
      toast.success(`${documentName} ${numberResult.number} generada exitosamente`, 5000)

      // 7. Recargar productos para actualizar stock
      const productsResult = await getProducts(businessId)
      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }

      // 8. Limpiar borrador del localStorage (venta exitosa)
      clearDraft()
    } catch (error) {
      console.error('Error al procesar venta:', error)
      toast.error(error.message || 'Error al procesar la venta. Inténtalo nuevamente.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePrintTicket = async () => {
    const isNative = Capacitor.isNativePlatform()
    setIsPrintingTicket(true)

    try {
      // Si es móvil, intentar imprimir en impresora térmica
      if (isNative && lastInvoiceData && companySettings) {
        try {
          // Obtener configuración de impresora
          const { getPrinterConfig, connectPrinter, printInvoiceTicket } = await import('@/services/thermalPrinterService')
          const printerConfigResult = await getPrinterConfig(getBusinessId())

          if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
            // Reconectar a la impresora
            const connectResult = await connectPrinter(printerConfigResult.config.address)

            if (!connectResult.success) {
              toast.error('No se pudo conectar a la impresora: ' + connectResult.error)
              toast.info('Usando impresión estándar...')
            } else {
              // Imprimir en impresora térmica (80mm por defecto)
              const result = await printInvoiceTicket(lastInvoiceData, companySettings, printerConfigResult.config.paperWidth || 80)

              if (result.success) {
                toast.success('Comprobante impreso en ticketera')
                return
              } else {
                toast.error('Error al imprimir en ticketera: ' + result.error)
                toast.info('Usando impresión estándar...')
              }
            }
          }
        } catch (error) {
          console.error('Error al imprimir en ticketera:', error)
          toast.info('Usando impresión estándar...')
        }
      }

      // Fallback: impresión estándar (web o si falla la térmica)
      window.print()
    } finally {
      setIsPrintingTicket(false)
    }
  }

  const handleSendWhatsApp = async () => {
    console.log('=== handleSendWhatsApp llamado ===')

    if (!lastInvoiceData) {
      toast.error('No hay datos de factura disponibles')
      return
    }

    const phone = lastInvoiceData.customer?.phone || customerData.phone
    if (!phone) {
      toast.error('El cliente no tiene un número de teléfono registrado')
      return
    }

    setSendingWhatsApp(true)
    try {
      toast.info('Generando comprobante...')

      // Generar el PDF como blob
      const pdfBlob = await getInvoicePDFBlob(lastInvoiceData, companySettings, branding)

      // Preparar nombre del archivo
      const docTypeFile = lastInvoiceData.documentType === 'factura' ? 'Factura' :
                          lastInvoiceData.documentType === 'boleta' ? 'Boleta' :
                          lastInvoiceData.documentType === 'nota_credito' ? 'NotaCredito' :
                          lastInvoiceData.documentType === 'nota_debito' ? 'NotaDebito' : 'NotaVenta'
      const fileName = `${docTypeFile}_${lastInvoiceData.number.replace(/\//g, '-')}_${Date.now()}.pdf`

      // Subir a Firebase Storage
      toast.info('Subiendo comprobante...')
      const storageRef = ref(storage, `comprobantes/${user.uid}/${fileName}`)
      await uploadBytes(storageRef, pdfBlob, { contentType: 'application/pdf' })

      // Obtener URL de descarga
      const downloadURL = await getDownloadURL(storageRef)
      console.log('PDF subido:', downloadURL)

      // Acortar URL usando cbrfy.link
      const shortURL = await shortenUrl(downloadURL, user?.businessId || user?.uid, lastInvoiceData.id)
      console.log('URL acortada:', shortURL)

      // Preparar datos para WhatsApp
      const cleanPhone = phone.replace(/\D/g, '')
      let formattedPhone = cleanPhone
      if (formattedPhone.length === 9 && formattedPhone.startsWith('9')) {
        formattedPhone = '51' + formattedPhone
      }
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '51' + formattedPhone.substring(1)
      }

      const docTypeName = lastInvoiceData.documentType === 'factura' ? 'Factura' :
                          lastInvoiceData.documentType === 'boleta' ? 'Boleta' :
                          lastInvoiceData.documentType === 'nota_credito' ? 'Nota de Crédito' :
                          lastInvoiceData.documentType === 'nota_debito' ? 'Nota de Débito' : 'Nota de Venta'
      const customerName = lastInvoiceData.customer?.name || 'Cliente'
      const total = formatCurrency(lastInvoiceData.total)

      // Crear mensaje con link de descarga
      const message = `Hola ${customerName},

Gracias por tu compra en *${companySettings?.businessName || 'nuestra tienda'}*.

*${docTypeName}:* ${lastInvoiceData.number}
*Total:* ${total}

*Descarga tu comprobante aquí:*
${shortURL}

Gracias por tu preferencia.`

      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`

      toast.success('Abriendo WhatsApp...')

      // Detectar si es móvil para usar el método apropiado
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

      if (isMobile) {
        // En móvil, usar location.href para que el SO abra WhatsApp directamente
        window.location.href = whatsappUrl
      } else {
        // En desktop, usar enlace temporal con target blank
        const link = document.createElement('a')
        link.href = whatsappUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      setSendingWhatsApp(false)
      return
    } catch (error) {
      console.error('Error al enviar por WhatsApp:', error)
      toast.error('Error al generar el comprobante. Intenta de nuevo.')
      setSendingWhatsApp(false)
    }
  }

  // Función legacy para compartir en nativo (mantener por compatibilidad)
  const handleShareNative = async () => {
    if (!lastInvoiceData) {
      toast.error('No hay datos de factura disponibles')
      return
    }

    try {
      const { Capacitor } = await import('@capacitor/core')
      const isNative = Capacitor.isNativePlatform()

      if (!isNative) {
        // Si no es nativo, usar la función de WhatsApp con link
        await handleSendWhatsApp()
        return
      }

      // En móvil nativo - Generar PDF y compartir directamente
      const phone = lastInvoiceData.customer?.phone || customerData.phone
      const customerName = lastInvoiceData.customer?.name || 'Cliente'
      const docTypeName = lastInvoiceData.documentType === 'factura' ? 'Factura' :
                         lastInvoiceData.documentType === 'boleta' ? 'Boleta' : 'Nota de Venta'

      toast.info('Generando PDF...')

      // Generar el PDF como blob
      const pdfBlob = await getInvoicePDFBlob(lastInvoiceData, companySettings, branding)

      // Convertir Blob a base64
      const reader = new FileReader()
      reader.readAsDataURL(pdfBlob)

      await new Promise((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64Data = reader.result.split(',')[1]

            // Crear nombre de archivo
            const docTypeFileName = lastInvoiceData.documentType === 'factura' ? 'Factura' :
                               lastInvoiceData.documentType === 'boleta' ? 'Boleta' : 'NotaVenta'
            const fileName = `${docTypeFileName}_${lastInvoiceData.number.replace(/\//g, '-')}.pdf`

            // Guardar archivo en Cache (temporal) para poder compartirlo
            const savedFile = await Filesystem.writeFile({
              path: fileName,
              data: base64Data,
              directory: Directory.Cache,
            })

            console.log('PDF guardado en:', savedFile.uri)

            // Crear mensaje
            const total = formatCurrency(lastInvoiceData.total)
            const message = `Hola ${customerName},

Gracias por tu compra.

${docTypeName}: ${lastInvoiceData.number}
Total: ${total}

${companySettings?.businessName || 'Tu Empresa'}`

            // Usar Share para compartir el PDF
            // Esto abre el selector de iOS donde el usuario elige WhatsApp
            // El PDF se adjunta automáticamente
            await Share.share({
              title: `${docTypeName} ${lastInvoiceData.number}`,
              text: message,
              url: savedFile.uri,
              dialogTitle: 'Enviar comprobante',
            })

            toast.success('Comprobante compartido', 3000)
            resolve()
          } catch (error) {
            console.error('Error al compartir:', error)
            // Si cancela el share, no mostrar error
            if (!error.message?.includes('cancel') && !error.message?.includes('abort')) {
              toast.error('Error al compartir el PDF')
            }
            resolve()
          }
        }
        reader.onerror = reject
      })

    } catch (error) {
      console.error('Error al compartir por WhatsApp:', error)
      toast.error(`Error: ${error.message || 'No se pudo compartir el PDF'}`)
    }
  }

  // Obtener stock del almacén seleccionado (incluyendo stock huérfano)
  const getCurrentWarehouseStock = (product) => {
    if (!selectedWarehouse) return product.stock || 0
    // Usar getTotalAvailableStock que incluye stock del almacén + stock huérfano
    return getTotalAvailableStock(product, selectedWarehouse.id)
  }

  const getStockBadge = product => {
    // Obtener stock del almacén seleccionado
    const warehouseStock = getCurrentWarehouseStock(product)

    if (product.stock === null) {
      return <span className="text-xs text-gray-500">Sin control</span>
    }

    if (warehouseStock === 0) {
      return <span className="text-xs text-red-600 font-semibold">Sin stock</span>
    }

    if (warehouseStock < 4) {
      return <span className="text-xs text-yellow-600">Stock: {warehouseStock}</span>
    }

    return <span className="text-xs text-green-600">Stock: {warehouseStock}</span>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando punto de venta...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] animate-fade-in pb-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Products Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Punto de Venta</h1>
                {tableData && (
                  <Badge variant="default" className="bg-blue-600 text-white">
                    Mesa {tableData.tableNumber} - {tableData.orderNumber}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {tableData ? `Generando comprobante para Mesa ${tableData.tableNumber}` : 'Selecciona productos para la venta'}
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {companySettings?.allowCustomProducts && (
                <Button onClick={() => setShowCustomProductModal(true)} className="w-[70%] sm:w-auto">
                  <Plus className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Producto Personalizado</span>
                  <span className="sm:hidden">Personalizado</span>
                </Button>
              )}
              <Button
                variant={saleCompleted ? "default" : "outline"}
                onClick={clearCart}
                disabled={cart.length === 0 && !saleCompleted}
                className={`w-[30%] sm:w-auto ${saleCompleted ? 'bg-green-600 hover:bg-green-700 animate-pulse' : ''}`}
              >
                {saleCompleted ? (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Venta
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpiar
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className={`flex gap-2 ${saleCompleted ? 'opacity-50' : ''}`}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={saleCompleted ? "Presiona 'Nueva Venta' para continuar..." : "Buscar producto por nombre o código..."}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                disabled={saleCompleted}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-base sm:text-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleScanBarcode}
              disabled={saleCompleted || isScanning}
              className="px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              title="Escanear código de barras"
            >
              {isScanning ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <ScanBarcode className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Category Filter Chips */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 bg-white p-3 rounded-lg border border-gray-200">
              <button
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Tag className="w-3.5 h-3.5 inline mr-1" />
                Todas
              </button>
              {getRootCategories(categories).map((category) => {
                const subcats = getSubcategories(categories, category.id)
                return (
                  <React.Fragment key={category.id}>
                    <button
                      onClick={() => setSelectedCategoryFilter(category.id)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        selectedCategoryFilter === category.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Folder className="w-3.5 h-3.5 inline mr-1" />
                      {category.name}
                    </button>
                    {subcats.map((subcat) => (
                      <button
                        key={subcat.id}
                        onClick={() => setSelectedCategoryFilter(subcat.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          selectedCategoryFilter === subcat.id
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <Folder className="w-3.5 h-3.5 inline mr-1" />
                        └─ {subcat.name}
                      </button>
                    ))}
                  </React.Fragment>
                )
              })}
              <button
                onClick={() => setSelectedCategoryFilter('sin-categoria')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategoryFilter === 'sin-categoria'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Sin categoría
              </button>
            </div>
          )}

          {/* Products Grid */}
          {filteredProducts.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? 'No se encontraron productos' : 'No hay productos disponibles'}
                </h3>
                <p className="text-gray-600">
                  {searchTerm
                    ? 'Intenta con otros términos de búsqueda'
                    : 'Agrega productos desde el módulo de Productos'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className={`grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 ${saleCompleted ? 'opacity-50 pointer-events-none' : ''}`}>
                {displayedProducts.map(product => {
                  // Determinar si el producto debe estar deshabilitado
                  // Si allowNegativeStock es true, nunca deshabilitar por stock
                  // Si allowNegativeStock es false, deshabilitar si stock del almacén === 0
                  // IMPORTANTE: Usar getCurrentWarehouseStock para verificar stock del almacén seleccionado
                  const warehouseStock = getCurrentWarehouseStock(product)
                  const isOutOfStock = !product.hasVariants &&
                    product.stock !== null && // Solo si tiene control de stock
                    warehouseStock <= 0 &&
                    !companySettings?.allowNegativeStock

                  // FEFO: Verificar estado de vencimiento
                  const expirationStatus = getProductExpirationStatus(product)
                  const isExpired = expirationStatus && !expirationStatus.canSell
                  const isDisabled = isOutOfStock || isExpired

                  return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={isDisabled}
                  className={`p-3 sm:p-4 bg-white border-2 rounded-lg transition-all text-left relative ${
                    isExpired
                      ? 'border-red-300 bg-red-50 opacity-60 cursor-not-allowed'
                      : isOutOfStock
                        ? 'border-gray-200 opacity-50 cursor-not-allowed'
                        : expirationStatus?.status === 'critical' || expirationStatus?.status === 'today'
                          ? 'border-red-300 hover:border-red-500 hover:shadow-md'
                          : expirationStatus?.status === 'warning'
                            ? 'border-orange-300 hover:border-orange-500 hover:shadow-md'
                            : expirationStatus?.status === 'caution'
                              ? 'border-yellow-300 hover:border-yellow-500 hover:shadow-md'
                              : 'border-gray-200 hover:border-primary-500 hover:shadow-md'
                  }`}
                >
                  {/* Badge de vencimiento */}
                  {expirationStatus && expirationStatus.status !== 'ok' && (
                    <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                      isExpired
                        ? 'bg-red-600 text-white'
                        : expirationStatus.status === 'critical' || expirationStatus.status === 'today'
                          ? 'bg-red-500 text-white'
                          : expirationStatus.status === 'warning'
                            ? 'bg-orange-500 text-white'
                            : 'bg-yellow-500 text-white'
                    }`}>
                      {isExpired ? 'VENCIDO' : `${expirationStatus.days}d`}
                    </div>
                  )}
                  <div className="flex gap-2 sm:gap-3 h-full">
                    {/* Product Image + Stock below */}
                    {product.imageUrl && (
                      <div className="flex-shrink-0 flex flex-col items-center">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-gray-100">
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        {/* Stock debajo de la imagen */}
                        {!product.hasVariants && (
                          <div className="mt-1">
                            {getStockBadge(product)}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Product Info - Right side */}
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className={`font-semibold line-clamp-2 text-sm sm:text-base flex-1 ${isExpired ? 'text-red-700' : 'text-gray-900'}`}>
                            {product.name}
                          </p>
                          {product.hasVariants && (
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              {product.variants?.length || 0} vars
                            </Badge>
                          )}
                        </div>
                        {product.code && !product.hasVariants && (
                          <p className="text-xs text-gray-500">{product.code}</p>
                        )}
                        {/* Mostrar info de farmacia si existe */}
                        {product.genericName && (
                          <p className="text-xs text-gray-500 truncate">{product.genericName} {product.concentration}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <p className={`text-base sm:text-lg font-bold ${isExpired ? 'text-red-600' : 'text-primary-600'}`}>
                          {product.hasVariants
                            ? formatCurrency(product.basePrice)
                            : formatCurrency(product.price)
                          }
                        </p>
                        {/* Stock al lado del precio solo si NO hay imagen */}
                        {!product.imageUrl && !product.hasVariants && getStockBadge(product)}
                        {product.hasVariants && (
                          <span className="text-xs text-gray-500">Ver opciones</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                  )
                })}
              </div>

              {/* Load More Button */}
              {hasMoreProducts && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={loadMoreProducts}
                    className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    Ver más productos ({filteredProducts.length - visibleProductsCount} restantes)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Cart Panel */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="flex flex-col h-full">
            <CardContent className="p-4 space-y-3">
              {/* 1. Sucursal (para series de documentos) */}
              {(() => {
                // Verificar si el usuario tiene acceso a la Sucursal Principal
                const hasMainAccess = !allowedBranches || allowedBranches.length === 0 || allowedBranches.includes('main')
                // Contar opciones disponibles
                const availableOptions = (hasMainAccess ? 1 : 0) + branches.length

                // Solo mostrar si hay más de una opción o hay sucursales
                return availableOptions > 0 && (branches.length > 0 || !hasMainAccess) && (
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                      <Store className="w-3.5 h-3.5" />
                      Sucursal
                    </label>
                    <select
                      value={selectedBranch?.id || ''}
                      onChange={e => {
                        if (e.target.value === '') {
                          setSelectedBranch(null)
                          // Seleccionar primer almacén de sucursal principal
                          const mainWarehouses = warehouses.filter(w => w.isActive && !w.branchId)
                          if (mainWarehouses.length > 0) {
                            setSelectedWarehouse(mainWarehouses.find(w => w.isDefault) || mainWarehouses[0])
                          }
                        } else {
                          const branch = branches.find(b => b.id === e.target.value)
                          setSelectedBranch(branch)
                          // Seleccionar primer almacén de esta sucursal
                          const branchWarehouses = warehouses.filter(w => w.isActive && w.branchId === e.target.value)
                          if (branchWarehouses.length > 0) {
                            setSelectedWarehouse(branchWarehouses.find(w => w.isDefault) || branchWarehouses[0])
                          }
                        }
                      }}
                      className="w-full px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      {/* Solo mostrar Sucursal Principal si el usuario tiene acceso */}
                      {hasMainAccess && <option value="">Sucursal Principal</option>}
                      {branches.map(branch => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                )
              })()}

              {/* 2. Almacén (para inventario) - Filtrado por sucursal */}
              {(() => {
                // Filtrar almacenes por sucursal seleccionada
                const filteredWarehouses = warehouses.filter(w => {
                  if (!w.isActive) return false
                  if (!selectedBranch) {
                    // Sucursal Principal: mostrar almacenes sin branchId
                    return !w.branchId
                  }
                  // Sucursal específica: mostrar almacenes de esa sucursal
                  return w.branchId === selectedBranch.id
                })

                return filteredWarehouses.length > 0 && businessMode !== 'restaurant' && (
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                      <Warehouse className="w-3.5 h-3.5" />
                      Almacén
                    </label>
                    <select
                      value={selectedWarehouse?.id || ''}
                      onChange={e => {
                        const warehouse = warehouses.find(w => w.id === e.target.value)
                        setSelectedWarehouse(warehouse)
                      }}
                      className="w-full px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      {filteredWarehouses.map(warehouse => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })()}

              {/* 3. Vendedor - Filtrado por sucursal */}
              {(() => {
                // Filtrar vendedores por sucursal seleccionada
                const filteredSellers = sellers.filter(s => {
                  if (!selectedBranch) {
                    // Sucursal Principal: mostrar vendedores sin branchId
                    return !s.branchId
                  }
                  // Sucursal específica: mostrar vendedores de esa sucursal
                  return s.branchId === selectedBranch.id
                })

                return filteredSellers.length > 0 && (
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                      <User className="w-3.5 h-3.5" />
                      Vendedor
                    </label>
                    <select
                      value={selectedSeller?.id || ''}
                      onChange={e => {
                        const seller = sellers.find(s => s.id === e.target.value)
                        setSelectedSeller(seller || null)
                      }}
                      className="w-full px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="">Seleccionar vendedor</option>
                      {filteredSellers.map(seller => (
                        <option key={seller.id} value={seller.id}>
                          {seller.code} - {seller.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })()}

              {/* 4. Tipo de Comprobante */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Tipo de Comprobante
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={documentType}
                    onChange={e => {
                      setDocumentType(e.target.value)
                      if (e.target.value !== 'nota_venta') {
                        setEnablePartialPayment(false)
                        setPartialPaymentAmount('')
                      }
                      // Reset forma de pago cuando no es factura
                      if (e.target.value !== 'factura') {
                        setPaymentType('contado')
                        setPaymentDueDate('')
                        setPaymentInstallments([])
                      }
                    }}
                    className="flex-1 px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="boleta">Boleta de Venta</option>
                    <option value="factura">Factura Electrónica</option>
                    <option value="nota_venta">Nota de Venta</option>
                  </select>
                  {cart.length > 0 && (
                    <span className="bg-primary-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {cart.length}
                    </span>
                  )}
                </div>
              </div>

              {/* 5. Fecha de Emisión */}
              {businessSettings?.allowCustomEmissionDate && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Fecha de Emisión
                  </label>
                  <input
                    type="date"
                    value={emissionDate}
                    max={getLocalDateString()}
                    min={(() => {
                      const today = new Date()
                      const maxDaysBack = documentType === 'factura' ? 3 : documentType === 'boleta' ? 7 : 30
                      const minDate = new Date(today)
                      minDate.setDate(today.getDate() - maxDaysBack)
                      return getLocalDateString(minDate)
                    })()}
                    onChange={e => setEmissionDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  />
                </div>
              )}

              {/* 6. Panel de Cliente - Siempre Visible */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <User className="w-3.5 h-3.5" />
                  Datos del Cliente
                </label>
                {/* Buscador de cliente registrado */}
                {customers.length > 0 && (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={customerSearchTerm}
                        onChange={e => {
                          setCustomerSearchTerm(e.target.value)
                          setShowCustomerDropdown(true)
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        placeholder="Buscar cliente registrado..."
                        className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      {(customerSearchTerm || selectedCustomer) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerSearchTerm('')
                            setSelectedCustomer(null)
                            setShowCustomerDropdown(false)
                            setCustomerData({
                              documentType: documentType === 'factura' ? ID_TYPES.RUC : ID_TYPES.DNI,
                              documentNumber: '',
                              name: '',
                              businessName: '',
                              address: '',
                              email: '',
                              phone: ''
                            })
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {showCustomerDropdown && customerSearchTerm && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filteredCustomers.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-500 text-center">
                            No encontrado
                          </div>
                        ) : (
                          filteredCustomers.slice(0, 5).map(customer => (
                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(customer)
                                setCustomerSearchTerm('')
                                setShowCustomerDropdown(false)
                                setCustomerData({
                                  documentType: customer.documentType || (customer.documentNumber?.length === 11 ? ID_TYPES.RUC : ID_TYPES.DNI),
                                  documentNumber: customer.documentNumber || '',
                                  name: customer.name || '',
                                  businessName: customer.businessName || '',
                                  address: customer.address || '',
                                  email: customer.email || '',
                                  phone: customer.phone || ''
                                })
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                            >
                              <p className="font-medium text-gray-900 truncate">{customer.name || customer.businessName}</p>
                              <p className="text-xs text-gray-500">{customer.documentNumber}</p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Campos de documento según tipo */}
                {documentType === 'factura' ? (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={11}
                        value={customerData.documentNumber}
                        onChange={e => setCustomerData({
                          ...customerData,
                          documentNumber: e.target.value.replace(/\D/g, '')
                        })}
                        placeholder="RUC *"
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLookupDocument}
                        disabled={isLookingUp || !customerData.documentNumber || customerData.documentNumber.length !== 11}
                        className="px-2"
                      >
                        {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                    <input
                      type="text"
                      value={customerData.businessName}
                      onChange={e => setCustomerData({ ...customerData, businessName: e.target.value })}
                      placeholder="Razón Social *"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <input
                      type="text"
                      value={customerData.address}
                      onChange={e => setCustomerData({ ...customerData, address: e.target.value })}
                      placeholder="Dirección"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={customerData.email}
                        onChange={e => setCustomerData({ ...customerData, email: e.target.value })}
                        placeholder="Email"
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <input
                        type="tel"
                        value={customerData.phone}
                        onChange={e => setCustomerData({ ...customerData, phone: e.target.value })}
                        placeholder="Teléfono"
                        className="w-28 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>

                    {/* Forma de Pago - Solo Facturas */}
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
                        <CreditCard className="w-3.5 h-3.5" />
                        Forma de Pago
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentType('contado')
                            setPaymentDueDate('')
                            setPaymentInstallments([])
                          }}
                          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-colors ${
                            paymentType === 'contado'
                              ? 'bg-primary-50 border-primary-500 text-primary-700'
                              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Contado
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentType('credito')
                            // Establecer fecha de vencimiento por defecto a 30 días
                            const defaultDueDate = new Date()
                            defaultDueDate.setDate(defaultDueDate.getDate() + 30)
                            setPaymentDueDate(getLocalDateString(defaultDueDate))
                          }}
                          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-colors ${
                            paymentType === 'credito'
                              ? 'bg-primary-50 border-primary-500 text-primary-700'
                              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Crédito
                        </button>
                      </div>

                      {/* Campos adicionales para Crédito */}
                      {paymentType === 'credito' && (
                        <div className="mt-2 space-y-2">
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Fecha de Vencimiento</label>
                            <input
                              type="date"
                              value={paymentDueDate}
                              onChange={e => setPaymentDueDate(e.target.value)}
                              min={emissionDate}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                          </div>

                          {/* Cuotas */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs text-gray-500">Cuotas (opcional)</label>
                              <button
                                type="button"
                                onClick={() => {
                                  const newInstallment = {
                                    number: paymentInstallments.length + 1,
                                    amount: '',
                                    dueDate: paymentDueDate || getLocalDateString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
                                  }
                                  setPaymentInstallments([...paymentInstallments, newInstallment])
                                }}
                                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                              >
                                + Agregar cuota
                              </button>
                            </div>

                            {paymentInstallments.length > 0 && (
                              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                {paymentInstallments.map((installment, index) => (
                                  <div key={index} className="flex items-center gap-1.5 bg-gray-50 p-1.5 rounded">
                                    <span className="text-xs text-gray-500 w-12">Cuota {installment.number}</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={installment.amount}
                                      onChange={e => {
                                        const updated = [...paymentInstallments]
                                        updated[index].amount = e.target.value
                                        setPaymentInstallments(updated)
                                      }}
                                      placeholder="Monto"
                                      className="flex-1 px-1.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    />
                                    <input
                                      type="date"
                                      value={installment.dueDate}
                                      onChange={e => {
                                        const updated = [...paymentInstallments]
                                        updated[index].dueDate = e.target.value
                                        setPaymentInstallments(updated)
                                      }}
                                      min={emissionDate}
                                      className="w-28 px-1.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = paymentInstallments.filter((_, i) => i !== index)
                                          .map((inst, i) => ({ ...inst, number: i + 1 }))
                                        setPaymentInstallments(updated)
                                      }}
                                      className="text-red-500 hover:text-red-700 p-0.5"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Campos opcionales de referencia */}
                      <div className="mt-3 pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-500 mb-2">Referencias (opcional)</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-400 mb-0.5 block">N° Guía</label>
                            <input
                              type="text"
                              value={guideNumber}
                              onChange={e => setGuideNumber(e.target.value.toUpperCase())}
                              placeholder="T001-0001"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 mb-0.5 block">N° O/C</label>
                            <input
                              type="text"
                              value={purchaseOrderNumber}
                              onChange={e => setPurchaseOrderNumber(e.target.value.toUpperCase())}
                              placeholder="OC-001"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 mb-0.5 block">N° Pedido</label>
                            <input
                              type="text"
                              value={orderNumber}
                              onChange={e => setOrderNumber(e.target.value.toUpperCase())}
                              placeholder="PED-001"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : documentType === 'boleta' ? (
                  <>
                    <div className="flex gap-2">
                      <select
                        value={customerData.documentType}
                        onChange={e => setCustomerData({
                          ...customerData,
                          documentType: e.target.value,
                          documentNumber: '',
                          name: '',
                          businessName: ''
                        })}
                        className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value={ID_TYPES.DNI}>DNI</option>
                        <option value={ID_TYPES.RUC}>RUC</option>
                        <option value={ID_TYPES.CE}>CE</option>
                      </select>
                      <input
                        type="text"
                        maxLength={customerData.documentType === ID_TYPES.RUC ? 11 : customerData.documentType === ID_TYPES.CE ? 12 : 8}
                        value={customerData.documentNumber}
                        onChange={e => setCustomerData({
                          ...customerData,
                          documentNumber: customerData.documentType === ID_TYPES.CE
                            ? e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
                            : e.target.value.replace(/\D/g, '')
                        })}
                        placeholder={customerData.documentType === ID_TYPES.RUC ? '20123456789' : '12345678'}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLookupDocument}
                        disabled={isLookingUp || !customerData.documentNumber ||
                          (customerData.documentType === ID_TYPES.RUC ? customerData.documentNumber.length !== 11 :
                           customerData.documentType === ID_TYPES.CE ? customerData.documentNumber.length < 9 :
                           customerData.documentNumber.length !== 8)}
                        className="px-2"
                      >
                        {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                    <input
                      type="text"
                      value={customerData.documentType === ID_TYPES.RUC ? customerData.businessName : customerData.name}
                      onChange={e => setCustomerData({
                        ...customerData,
                        ...(customerData.documentType === ID_TYPES.RUC
                          ? { businessName: e.target.value }
                          : { name: e.target.value }
                        )
                      })}
                      placeholder={customerData.documentType === ID_TYPES.RUC ? 'Razón Social' : 'Nombre'}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <input
                      type="text"
                      value={customerData.address}
                      onChange={e => setCustomerData({ ...customerData, address: e.target.value })}
                      placeholder="Dirección"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={customerData.email}
                        onChange={e => setCustomerData({ ...customerData, email: e.target.value })}
                        placeholder="Email"
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <input
                        type="tel"
                        value={customerData.phone}
                        onChange={e => setCustomerData({ ...customerData, phone: e.target.value })}
                        placeholder="Teléfono"
                        className="w-28 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </>
                ) : (
                  /* Nota de venta - con búsqueda de DNI/RUC */
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={customerData.documentType || ID_TYPES.DNI}
                        onChange={e => setCustomerData({
                          ...customerData,
                          documentType: e.target.value,
                          documentNumber: '',
                          name: '',
                          businessName: ''
                        })}
                        className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value={ID_TYPES.DNI}>DNI</option>
                        <option value={ID_TYPES.RUC}>RUC</option>
                        <option value={ID_TYPES.CE}>CE</option>
                      </select>
                      <input
                        type="text"
                        maxLength={customerData.documentType === ID_TYPES.RUC ? 11 : customerData.documentType === ID_TYPES.CE ? 12 : 8}
                        value={customerData.documentNumber}
                        onChange={e => setCustomerData({
                          ...customerData,
                          documentNumber: customerData.documentType === ID_TYPES.CE
                            ? e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
                            : e.target.value.replace(/\D/g, '')
                        })}
                        placeholder={customerData.documentType === ID_TYPES.RUC ? '20123456789 (opcional)' : '12345678 (opcional)'}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLookupDocument}
                        disabled={isLookingUp || !customerData.documentNumber ||
                          (customerData.documentType === ID_TYPES.RUC ? customerData.documentNumber.length !== 11 :
                           customerData.documentType === ID_TYPES.CE ? customerData.documentNumber.length < 9 :
                           customerData.documentNumber.length !== 8)}
                        className="px-2"
                      >
                        {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                    <input
                      type="text"
                      value={customerData.documentType === ID_TYPES.RUC ? customerData.businessName : customerData.name}
                      onChange={e => setCustomerData({
                        ...customerData,
                        ...(customerData.documentType === ID_TYPES.RUC
                          ? { businessName: e.target.value }
                          : { name: e.target.value }
                        )
                      })}
                      placeholder={customerData.documentType === ID_TYPES.RUC ? 'Razón Social (opcional)' : 'Nombre (opcional)'}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <input
                      type="tel"
                      value={customerData.phone}
                      onChange={e => setCustomerData({ ...customerData, phone: e.target.value })}
                      placeholder="Teléfono (para WhatsApp)"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                )}

                {selectedCustomer && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                    <CheckCircle className="w-3 h-3 text-green-600" />
                    <span className="text-green-800">Cliente: {selectedCustomer.name || selectedCustomer.businessName}</span>
                  </div>
                )}
              </div>

              {/* Tipo de pedido para restaurante */}
              {businessMode === 'restaurant' && (
                <select
                  value={orderType}
                  onChange={e => setOrderType(e.target.value)}
                  disabled={tableData?.fromTable}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {Object.entries(ORDER_TYPES).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              )}
            </CardContent>

            <CardContent className="flex-1 flex flex-col p-4 pt-0 sm:p-6 sm:pt-0">
              {/* Cart Items */}
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                <ShoppingCart className="w-3.5 h-3.5" />
                Carrito de Compras
              </label>

              {/* Banner de venta completada */}
              {saleCompleted && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">Venta emitida exitosamente</p>
                    <p className="text-xs text-green-600">Presiona "Nueva Venta" para iniciar otra</p>
                  </div>
                </div>
              )}

              <div className={`flex-1 space-y-3 overflow-y-auto custom-scrollbar mb-4 max-h-[300px] lg:max-h-[400px] ${saleCompleted ? 'opacity-60 pointer-events-none' : ''}`}>
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
                    <ShoppingCart className="w-12 h-12 mb-2" />
                    <p className="text-sm">No hay productos en el carrito</p>
                  </div>
                ) : (
                  cart.map(item => {
                    const itemId = item.cartId || item.id
                    return (
                      <div key={itemId} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex gap-3">
                          {/* Product thumbnail - Left side */}
                          {item.imageUrl && (
                            <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          {/* Content - Right side */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 pr-2">
                                <p className="font-medium text-sm text-gray-900 line-clamp-2">
                                  {item.name}
                                </p>
                                {item.isVariant && item.variantAttributes && (
                                  <p className="text-xs text-gray-600 mt-1">
                                    {Object.entries(item.variantAttributes).map(([key, value]) => (
                                      <span key={key} className="mr-2">
                                        {key.charAt(0).toUpperCase() + key.slice(1)}: {value}
                                      </span>
                                    ))}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => removeFromCart(itemId)}
                                className="text-red-600 hover:text-red-800 flex-shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                {item.allowDecimalQuantity ? (
                                  /* Input editable para productos por peso */
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      value={item.quantity}
                                      onChange={(e) => setQuantityDirectly(itemId, e.target.value)}
                                      step="0.001"
                                      min="0.001"
                                      className="w-20 px-2 py-1 text-sm text-center font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    />
                                    <span className="text-xs text-gray-500">{item.unit || 'kg'}</span>
                                  </div>
                                ) : (
                                  /* Botones +/- para productos normales con cantidad editable */
                                  <>
                                    <button
                                      onClick={() => updateQuantity(itemId, -1)}
                                      className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <input
                                      type="number"
                                      value={item.quantity}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value)
                                        if (!isNaN(val) && val >= 0) {
                                          setQuantityDirectly(itemId, val)
                                        }
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      min="1"
                                      className="w-12 text-center font-semibold text-sm border border-gray-300 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <button
                                      onClick={() => updateQuantity(itemId, 1)}
                                      className="w-7 h-7 rounded-lg bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center transition-colors"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>

                              {/* Precio unitario editable */}
                              <div className="flex items-center gap-2">
                                {companySettings?.allowPriceEdit && editingPriceItemId === itemId ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      value={editingPrice}
                                      onChange={(e) => setEditingPrice(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          saveEditedPrice(itemId)
                                        } else if (e.key === 'Escape') {
                                          cancelEditingPrice()
                                        }
                                      }}
                                      className="w-16 px-2 py-1 text-sm font-bold text-right border border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                                      autoFocus
                                      step="0.01"
                                      min="0.01"
                                    />
                                    <button
                                      onClick={() => saveEditedPrice(itemId)}
                                      className="text-green-600 hover:text-green-800 p-1"
                                      title="Guardar"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={cancelEditingPrice}
                                      className="text-gray-600 hover:text-gray-800 p-1"
                                      title="Cancelar"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <p className="font-bold text-gray-900 text-sm">
                                      {formatCurrency(item.price * item.quantity)}
                                    </p>
                                    {companySettings?.allowPriceEdit && !item.isCustom && (
                                      <button
                                        onClick={() => startEditingPrice(itemId, item.price)}
                                        className="text-primary-600 hover:text-primary-700 p-1"
                                        title="Editar precio"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(amounts.subtotal)}</span>
                </div>

                {/* Discount Field */}
                {cart.length > 0 && (
                  <div className="border-t border-b py-3 space-y-2">
                    <p className="text-sm text-gray-600 font-medium">Descuento:</p>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="number"
                          value={discountAmount}
                          onChange={(e) => handleDiscountAmountChange(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          max={amounts.subtotal}
                          step="0.01"
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          disabled={lastInvoiceData !== null}
                        />
                        <span className="text-sm text-gray-600 font-medium flex-shrink-0">S/</span>
                      </div>
                      <span className="text-sm text-gray-500 font-medium flex-shrink-0">o</span>
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="number"
                          value={discountPercentage}
                          onChange={(e) => handleDiscountPercentageChange(e.target.value)}
                          placeholder="0"
                          min="0"
                          max="100"
                          step="0.01"
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          disabled={lastInvoiceData !== null}
                        />
                        <span className="text-sm text-gray-600 font-medium flex-shrink-0">%</span>
                      </div>
                      {(discountAmount || discountPercentage) && (
                        <button
                          onClick={handleClearDiscount}
                          className="flex-shrink-0 p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                          title="Limpiar descuento"
                          disabled={lastInvoiceData !== null}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {/* Show discount amount if applied */}
                    {amounts.discount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Descuento aplicado:</span>
                        <span className="font-medium">-{formatCurrency(amounts.discount)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Mostrar IGV solo si hay productos gravados */}
                {amounts.igv > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">IGV ({taxConfig.igvRate}%):</span>
                    <span className="font-medium">{formatCurrency(amounts.igv)}</span>
                  </div>
                )}
                {/* Mostrar montos exonerados si hay productos exonerados */}
                {amounts.exonerado?.total > 0 && (
                  <div className="flex justify-between text-sm text-amber-700">
                    <span>Op. Exoneradas:</span>
                    <span className="font-medium">{formatCurrency(amounts.exonerado.total)}</span>
                  </div>
                )}
                {/* Mostrar montos inafectos si hay productos inafectos */}
                {amounts.inafecto?.total > 0 && (
                  <div className="flex justify-between text-sm text-blue-700">
                    <span>Op. Inafectas:</span>
                    <span className="font-medium">{formatCurrency(amounts.inafecto.total)}</span>
                  </div>
                )}
                {/* Mostrar badge si está exonerado de IGV (empresa) */}
                {taxConfig.igvExempt && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md">
                    <span className="font-medium">⚠️ Empresa exonerada de IGV</span>
                  </div>
                )}
                <div className="flex justify-between text-xl sm:text-2xl font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary-600">{formatCurrency(amounts.total)}</span>
                </div>

                {/* Advertencia SUNAT para boletas mayores a 700 soles */}
                {documentType === 'boleta' && amounts.total > 700 && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-600 text-lg">⚠️</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-800">
                          Normativa SUNAT
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Las boletas mayores a S/ 700.00 requieren obligatoriamente el <strong>DNI y nombre completo</strong> del cliente
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Opción de Pago Parcial - Solo para Notas de Venta */}
              {cart.length > 0 && businessSettings?.allowPartialPayments && documentType === 'nota_venta' && (
                <div className="border-t pt-4 mt-4">
                  <div className="space-y-3">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enablePartialPayment}
                        onChange={e => {
                          setEnablePartialPayment(e.target.checked)
                          if (!e.target.checked) {
                            setPartialPaymentAmount('')
                          }
                        }}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        disabled={lastInvoiceData !== null}
                      />
                      <span className="text-sm text-gray-700">
                        Pago parcial o al crédito
                      </span>
                    </label>

                    {enablePartialPayment && (
                      <div className="space-y-2 pl-6">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">
                            Monto a pagar ahora:
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                              S/
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={amounts.total}
                              value={partialPaymentAmount}
                              onChange={e => setPartialPaymentAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              disabled={lastInvoiceData !== null}
                            />
                          </div>
                        </div>

                        {/* Mostrar cuando hay pago parcial (monto mayor a 0) */}
                        {partialPaymentAmount && parseFloat(partialPaymentAmount) > 0 && parseFloat(partialPaymentAmount) <= amounts.total && (
                          <div className="text-xs space-y-1 pt-1">
                            <div className="flex justify-between text-gray-600">
                              <span>Pagando ahora:</span>
                              <span className="font-semibold">{formatCurrency(parseFloat(partialPaymentAmount))}</span>
                            </div>
                            <div className="flex justify-between text-orange-600">
                              <span>Saldo pendiente:</span>
                              <span className="font-semibold">{formatCurrency(amounts.total - parseFloat(partialPaymentAmount))}</span>
                            </div>
                          </div>
                        )}

                        {partialPaymentAmount && parseFloat(partialPaymentAmount) > amounts.total && (
                          <p className="text-xs text-red-600">
                            El monto no puede ser mayor que el total
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Payment Methods Section */}
              {cart.length > 0 && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  {/* Si es factura al crédito, mostrar mensaje en lugar de métodos de pago */}
                  {documentType === 'factura' && paymentType === 'credito' ? (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg">
                      <div className="flex items-start gap-3">
                        <CreditCard className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-amber-900">
                            Factura al Crédito
                          </p>
                          <p className="text-xs text-amber-700 mt-1">
                            No requiere pago inmediato. El cliente pagará según las condiciones de crédito.
                          </p>
                          <p className="text-xs text-amber-700 mt-2">
                            <strong>Monto pendiente:</strong> {formatCurrency(amounts.total)}
                          </p>
                          {paymentDueDate && (
                            <p className="text-xs text-amber-700 mt-1">
                              <strong>Vencimiento:</strong> {new Date(paymentDueDate + 'T00:00:00').toLocaleDateString('es-PE')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (enablePartialPayment && amountToPay === 0) ? (
                    <div className="p-4 bg-blue-50 border border-blue-300 rounded-lg">
                      <div className="flex items-start gap-3">
                        <CreditCard className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-blue-900">
                            Venta al Crédito
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            No requiere pago inmediato. El cliente pagará después.
                          </p>
                          <p className="text-xs text-blue-700 mt-2">
                            <strong>Saldo pendiente:</strong> {formatCurrency(amounts.total)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : hasFeature('hidePaymentMethods') ? (
                    /* Si hidePaymentMethods está activo, mostrar solo pago en efectivo sin selector */
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-green-800">Pago en Efectivo</span>
                        <span className="text-lg font-bold text-green-700">{formatCurrency(amountToPay)}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-700">Métodos de Pago:</p>
                  {payments.map((payment, index) => (
                    <div key={index} className="flex items-center gap-2">
                      {/* Método de pago */}
                      <Select
                        value={payment.method}
                        onChange={(e) => handlePaymentMethodChange(index, e.target.value)}
                        className="flex-1 text-sm"
                        disabled={lastInvoiceData !== null}
                      >
                        <option value="">Seleccionar</option>
                        <option value="CASH">Efectivo</option>
                        <option value="CARD">Tarjeta</option>
                        <option value="TRANSFER">Transferencia</option>
                        <option value="YAPE">Yape</option>
                        <option value="PLIN">Plin</option>
                        {businessMode === 'restaurant' && (
                          <option value="RAPPI">Rappi</option>
                        )}
                      </Select>

                      {/* Monto */}
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={payment.amount}
                        onChange={(e) => handlePaymentAmountChange(index, e.target.value)}
                        placeholder="0.00"
                        disabled={!payment.method || lastInvoiceData !== null}
                        className="w-24 px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                      />

                      {/* Botón eliminar */}
                      {payments.length > 1 && (
                        <button
                          onClick={() => handleRemovePaymentMethod(index)}
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                          disabled={isProcessing || lastInvoiceData !== null}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Botón agregar método */}
                  <button
                    onClick={handleAddPaymentMethod}
                    disabled={isProcessing || lastInvoiceData !== null}
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary-500 hover:text-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar método</span>
                  </button>

                  {/* Resumen de pagos */}
                  {totalPaid > 0 && (
                    <div className="p-3 bg-gray-50 rounded-lg space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total pagado:</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(totalPaid)}</span>
                      </div>
                      {remaining !== 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{remaining > 0 ? 'Falta:' : 'Cambio:'}</span>
                          <span className={`font-semibold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(Math.abs(remaining))}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                    </>
                  )}
                </div>
              )}

              {/* Checkout Button */}
              <Button
                onClick={handleCheckout}
                disabled={cart.length === 0 || isProcessing || saleCompleted}
                className="w-full mt-4 h-12 sm:h-14 text-base sm:text-lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : saleCompleted ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Venta Completada
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Procesar Venta
                  </>
                )}
              </Button>

              {/* Mensaje de venta completada */}
              {lastInvoiceData && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-900">
                        ¡Venta procesada exitosamente!
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        Para realizar una nueva venta, presiona el botón "Nueva Venta" a continuación.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Print/PDF Buttons - Show after successful sale */}
              {lastInvoiceData && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Descargar comprobante:</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={handlePrintTicket}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={isPrintingTicket}
                    >
                      {isPrintingTicket ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Imprimiendo...
                        </>
                      ) : (
                        <>
                          <Printer className="w-4 h-4 mr-2" />
                          Imprimir Ticket
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={async () => {
                        setIsLoadingPreview(true)
                        try {
                          await previewInvoicePDF(lastInvoiceData, companySettings, branding)
                        } catch (error) {
                          console.error('Error al generar vista previa:', error)
                          toast.error('Error al generar la vista previa')
                        } finally {
                          setIsLoadingPreview(false)
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={isLoadingPreview}
                    >
                      {isLoadingPreview ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Cargando...
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Vista Previa
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => {
                        try {
                          generateInvoicePDF(lastInvoiceData, companySettings, true, branding)
                        } catch (error) {
                          console.error('Error al generar PDF:', error)
                          toast.error('Error al generar el PDF')
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Descargar PDF
                    </Button>
                  </div>
                  <Button
                    onClick={handleSendWhatsApp}
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    disabled={sendingWhatsApp}
                  >
                    {sendingWhatsApp ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4 mr-2" />
                        Enviar por WhatsApp
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={clearCart}
                    className="w-full mt-3 bg-primary-600 hover:bg-primary-700 text-white h-12"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Nueva Venta
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Custom Product Modal */}
      <Modal
        isOpen={showCustomProductModal}
        onClose={() => {
          setShowCustomProductModal(false)
          setCustomProduct({ name: '', price: '', quantity: 1, unit: 'NIU', taxAffectation: '10' })
        }}
        title="Agregar Producto Personalizado"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Ingresa los datos del producto o servicio que deseas agregar al carrito:
          </p>

          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Producto/Servicio <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customProduct.name}
              onChange={(e) => setCustomProduct({ ...customProduct, name: e.target.value })}
              placeholder="Ej: Servicio de instalación, Reparación, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>

          {/* Price and Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio Unitario <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                  S/
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customProduct.price}
                  onChange={(e) => setCustomProduct({ ...customProduct, price: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={customProduct.quantity}
                onChange={(e) => setCustomProduct({ ...customProduct, quantity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Unit of Measure and Tax Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unidad de Medida
              </label>
              <select
                value={customProduct.unit}
                onChange={(e) => setCustomProduct({ ...customProduct, unit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {UNIT_TYPES.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.label} ({unit.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de IGV
              </label>
              {taxConfig.igvExempt ? (
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600">
                  Exonerado (Régimen especial)
                </div>
              ) : (
                <select
                  value={customProduct.taxAffectation}
                  onChange={(e) => setCustomProduct({ ...customProduct, taxAffectation: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="10">Gravado ({taxConfig.igvRate}%)</option>
                  <option value="20">Exonerado</option>
                  <option value="30">Inafecto</option>
                </select>
              )}
            </div>
          </div>

          {/* Preview */}
          {customProduct.name && customProduct.price > 0 && (
            <div className="mt-4 p-4 bg-primary-50 border border-primary-200 rounded-lg">
              <p className="text-xs font-medium text-primary-900 mb-2">Vista Previa:</p>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-900">{customProduct.name}</p>
                  <p className="text-sm text-gray-600">
                    Cantidad: {customProduct.quantity || 1}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary-600">
                    {formatCurrency(parseFloat(customProduct.price) * (parseFloat(customProduct.quantity) || 1))}
                  </p>
                  <p className="text-xs text-gray-600">
                    {formatCurrency(customProduct.price)} × {customProduct.quantity || 1}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowCustomProductModal(false)
                setCustomProduct({ name: '', price: '', quantity: 1, unit: 'NIU', taxAffectation: '10' })
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={addCustomProductToCart}
              className="flex-1"
              disabled={!customProduct.name || !customProduct.price || parseFloat(customProduct.price) <= 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar al Carrito
            </Button>
          </div>
        </div>
      </Modal>

      {/* Variant Selection Modal */}
      <Modal
        isOpen={showVariantModal}
        onClose={() => {
          setShowVariantModal(false)
          setSelectedProductForVariant(null)
        }}
        title={`Seleccionar variante - ${selectedProductForVariant?.name || ''}`}
        size="md"
      >
        {selectedProductForVariant && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Selecciona la variante del producto que deseas agregar al carrito:
            </p>

            {/* Variants Grid */}
            <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
              {selectedProductForVariant.variants?.map((variant, index) => (
                <button
                  key={index}
                  onClick={() => addVariantToCart(selectedProductForVariant, variant)}
                  disabled={variant.stock !== null && variant.stock <= 0}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    variant.stock !== null && variant.stock <= 0
                      ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-primary-500 hover:bg-primary-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-mono text-xs text-gray-500 mb-1">{variant.sku}</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {Object.entries(variant.attributes).map(([key, value]) => (
                          <Badge key={key} variant="default" className="text-xs">
                            {key.charAt(0).toUpperCase() + key.slice(1)}: {value}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-bold text-primary-600">
                          {formatCurrency(variant.price)}
                        </p>
                        {variant.stock !== null && (
                          <span
                            className={`text-xs font-semibold ${
                              variant.stock >= 4
                                ? 'text-green-600'
                                : variant.stock > 0
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}
                          >
                            {variant.stock > 0 ? `Stock: ${variant.stock}` : 'Sin stock'}
                          </span>
                        )}
                      </div>
                    </div>
                    {variant.stock === null || variant.stock > 0 ? (
                      <Plus className="w-5 h-5 text-primary-600 flex-shrink-0" />
                    ) : null}
                  </div>
                </button>
              ))}
            </div>

            {selectedProductForVariant.variants?.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">No hay variantes disponibles para este producto.</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de Selección de Precio */}
      <Modal
        isOpen={showPriceModal}
        onClose={() => {
          setShowPriceModal(false)
          setProductForPriceSelection(null)
        }}
        title={`Seleccionar precio - ${productForPriceSelection?.name || ''}`}
        size="sm"
      >
        {productForPriceSelection && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Este producto tiene múltiples precios. Selecciona el precio a aplicar:
            </p>

            <div className="space-y-3">
              {/* Precio 1 */}
              <button
                onClick={() => handlePriceSelection('price1')}
                className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {businessSettings?.priceLabels?.price1 || 'Precio 1'}
                    </p>
                    <p className="text-xs text-gray-500">Precio principal</p>
                  </div>
                  <p className="text-xl font-bold text-primary-600">
                    {formatCurrency(productForPriceSelection.price)}
                  </p>
                </div>
              </button>

              {/* Precio 2 */}
              {productForPriceSelection.price2 && (
                <button
                  onClick={() => handlePriceSelection('price2')}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {businessSettings?.priceLabels?.price2 || 'Precio 2'}
                      </p>
                      <p className="text-xs text-gray-500">Precio alternativo</p>
                    </div>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(productForPriceSelection.price2)}
                    </p>
                  </div>
                </button>
              )}

              {/* Precio 3 */}
              {productForPriceSelection.price3 && (
                <button
                  onClick={() => handlePriceSelection('price3')}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {businessSettings?.priceLabels?.price3 || 'Precio 3'}
                      </p>
                      <p className="text-xs text-gray-500">Precio especial</p>
                    </div>
                    <p className="text-xl font-bold text-amber-600">
                      {formatCurrency(productForPriceSelection.price3)}
                    </p>
                  </div>
                </button>
              )}

              {/* Precio 4 */}
              {productForPriceSelection.price4 && (
                <button
                  onClick={() => handlePriceSelection('price4')}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {businessSettings?.priceLabels?.price4 || 'Precio 4'}
                      </p>
                      <p className="text-xs text-gray-500">Precio personalizado</p>
                    </div>
                    <p className="text-xl font-bold text-purple-600">
                      {formatCurrency(productForPriceSelection.price4)}
                    </p>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Ticket Oculto para Impresión */}
      {lastInvoiceData && (
        <div className="hidden print:block" data-web-print-legible={webPrintLegible}>
          {/* CSS para impresión web legible */}
          <style>{`
            @media print {
              [data-web-print-legible="true"] {
                font-size: 12pt !important;
                font-weight: 600 !important;
                line-height: 1.4 !important;
              }
              [data-web-print-legible="true"] * {
                font-size: 12pt !important;
                font-weight: 600 !important;
                line-height: 1.4 !important;
              }
              [data-web-print-legible="true"] .text-sm,
              [data-web-print-legible="true"] .text-xs {
                font-size: 10pt !important;
              }
              [data-web-print-legible="true"] .text-lg {
                font-size: 14pt !important;
              }
              [data-web-print-legible="true"] .text-xl {
                font-size: 16pt !important;
                font-weight: bold !important;
              }
              [data-web-print-legible="true"] .text-2xl {
                font-size: 18pt !important;
                font-weight: bold !important;
              }
              [data-web-print-legible="true"] .font-semibold,
              [data-web-print-legible="true"] .font-bold {
                font-weight: 700 !important;
              }
            }
          `}</style>
          <InvoiceTicket
            ref={ticketRef}
            invoice={{
              ...lastInvoiceData,
              items: lastInvoiceData.items.map(item => ({
                code: item.code,
                description: item.name,
                quantity: item.quantity,
                price: item.unitPrice,
              })),
              series: lastInvoiceData.series,
              number: lastInvoiceData.correlativeNumber,
              customerDocumentNumber: lastInvoiceData.customer?.documentNumber,
              customerName: lastInvoiceData.customer?.name,
              customerBusinessName: lastInvoiceData.customer?.businessName,
              customerAddress: lastInvoiceData.customer?.address,
              subtotal: lastInvoiceData.subtotal,
              tax: lastInvoiceData.igv,
              total: lastInvoiceData.total,
              createdAt: new Date(),
            }}
            companySettings={companySettings}
            paperWidth={80}
            webPrintLegible={webPrintLegible}
          />
        </div>
      )}
    </div>
  )
}
