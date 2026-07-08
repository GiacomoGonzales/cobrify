import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppNavigate } from '@/hooks/useAppNavigate'
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
  ChevronRight,
  ChevronUp,
  Settings2,
  Eye,
  ScanBarcode,
  Store,
  Warehouse,
  FileText,
  PanelLeftClose,
  PanelRightClose,
  BedDouble,
  Wallet,
  Pause,
  Play,
  LayoutGrid,
  List,
  Gift,
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
import PostSaleModal from '@/components/pos/PostSaleModal'
import { formatCurrency, formatUnitPrice, formatLineAmount, formatProductPrice, applyMarginToCost, matchesSearchQuery, buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'
import {
  isMultiCurrencyEnabled,
  getDefaultCurrency,
  convertToBase,
  convertFromBase,
  normalizeCurrency,
  SUPPORTED_CURRENCIES,
  BASE_CURRENCY,
} from '@/utils/currency'
import { getRateForDate } from '@/services/exchangeRateService'
import { applyBranchPricing } from '@/utils/branchPricing'
import { calculateInvoiceAmounts, calculateMixedInvoiceAmounts, calculateRecargoConsumo, ID_TYPES, DETRACTION_TYPES, DETRACTION_MIN_AMOUNT } from '@/utils/peruUtils'
import { generateInvoicePDF, getInvoicePDFBlob, previewInvoicePDF, preloadLogo } from '@/utils/pdfGenerator'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { getDoc, doc, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { getRooms as getHotelRooms, getActiveReservations, addCharge as addFolioCharge, markChargesAsInvoiced } from '@/services/hotelService'
import { getCachedProducts, setCachedProducts } from '@/utils/productCache'
import {
  subscribeToProducts,
  getCustomers,
  createInvoice,
  createInvoiceWithNumber,
  getCompanySettings,
  updateProduct,
  updateProductStockTransaction,
  getNextDocumentNumber,
  getProductCategories,
  getProductBrands,
  sendInvoiceToSunat,
  upsertCustomerFromSale,
  getCashRegisterSession,
  getCustomerStoreCredit,
  redeemStoreCredit,
} from '@/services/firestoreService'
import ModifierSelectorModal from '@/components/restaurant/ModifierSelectorModal'
import { consultarDNI, consultarRUC, consultarEstablecimientos } from '@/services/documentLookupService'
import { deductIngredients } from '@/services/ingredientService'
import { getRecipeByProductId, checkRecipeStock, shouldDeductIngredients, getRecipes } from '@/services/recipeService'
import { computeProductsWithoutIngredients, hasAnyRecipe } from '@/utils/recipeAvailability'
import { getWarehouses, getDefaultWarehouse, updateWarehouseStock, getStockInWarehouse, getTotalAvailableStock, getOrphanStock, createStockMovement } from '@/services/warehouseService'
import { getActiveBranches, getDefaultBranch } from '@/services/branchService'
import { shortenUrl } from '@/services/urlShortenerService'
import { releaseTable, updateTableAmount } from '@/services/tableService'
import { getSellers } from '@/services/sellerService'
import { markOrderAsPaid, updateOrder, updateOrderStatus } from '@/services/orderService'
import { markQuotationAsConverted } from '@/services/quotationService'
import { markNotaVentaAsConverted } from '@/services/firestoreService'
import { completeAppointment } from '@/services/appointmentService'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { savePendingSale } from '@/services/offlineQueueService'
import * as CustomerDisplay from '@/services/customerDisplayService'
import InvoiceTicket from '@/components/InvoiceTicket'
import { getPrimaryPet } from '@/utils/petUtils'

const PAYMENT_METHODS = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  YAPE: 'Yape',
  PLIN: 'Plin',
  RAPPI: 'Rappi',
  PEDIDOSYA: 'PedidosYa',
  DIDIFOOD: 'DiDiFood',
  ROOM: 'Cargo a Habitación',
  CREDIT_NOTE: 'Saldo a favor',
}

// Mapeo de IDs de restricción (lowercase) a keys del POS (uppercase)
const PAYMENT_METHOD_ID_TO_KEY = {
  cash: 'CASH',
  card: 'CARD',
  transfer: 'TRANSFER',
  yape: 'YAPE',
  plin: 'PLIN',
  rappiPay: 'RAPPI',
  pedidosYa: 'PEDIDOSYA',
  didifood: 'DIDIFOOD',
  chargeToRoom: 'ROOM',
}

const ORDER_TYPES = {
  'dine-in': 'En Mesa',
  'takeaway': 'Para Llevar',
  'delivery': 'Delivery',
}

// Unidades de medida SUNAT (Catálogo N° 03 - UN/ECE Rec 20)
// Abreviaturas cortas para mostrar en el carrito
const UNIT_SHORT_LABELS = {
  KGM: 'kg', GRM: 'g', LTR: 'lt', MTR: 'm', MTK: 'm²', MTQ: 'm³',
  NIU: 'und', ZZ: 'srv', BX: 'caja', PK: 'paq', TNE: 'ton',
  GLL: 'gal', MLT: 'ml', ONZ: 'oz', LBR: 'lb', DZN: 'doc',
}
const getUnitShortLabel = (code) => UNIT_SHORT_LABELS[code] || UNIT_TYPES.find(u => u.code === code)?.label || code

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
  // Ordenar por `order` (mismo criterio que la vista de Productos, que persiste el
  // orden alfabético al usar "Ordenar alfabéticamente"). Antes el POS no ordenaba y
  // las mostraba en orden de creación.
  return categories.filter(cat => cat.parentId === null).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
}

const getSubcategories = (categories, parentId) => {
  return categories.filter(cat => cat.parentId === parentId).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
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

// Inferir tipo de documento del largo del número cuando falta el tipo
const inferDocumentType = (docType, docNumber) => {
  if (docType && docType !== '') return docType
  if (docNumber && docNumber.length === 11) return ID_TYPES.RUC
  if (docNumber && docNumber.length === 8) return ID_TYPES.DNI
  return ID_TYPES.DNI
}

export default function POS() {
  const { user, isDemoMode, demoData, getBusinessId, businessMode, businessSettings, hasFeature } = useAppContext()
  const { filterWarehousesByAccess, allowedWarehouses, filterBranchesByAccess, allowedBranches, activeBranchId, setActiveBranch, allowedDocumentTypes, allowedPaymentMethods, assignedSellerId, independentCashRegister, hideStockInPOS, hideDiscountInPOS, userPermissions } = useAuth()
  const { branding } = useBranding()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const appNavigate = useAppNavigate()
  const ticketRef = useRef(null)
  const { isOnline, isOffline } = useOnlineStatus()

  // Si solo hay un método de pago permitido, pre-seleccionarlo
  const getDefaultPaymentMethod = () => {
    if (allowedPaymentMethods && allowedPaymentMethods.length === 1) {
      return PAYMENT_METHOD_ID_TO_KEY[allowedPaymentMethods[0]] || ''
    }
    // Método de pago por defecto configurado por el negocio (Configuración > Ventas),
    // solo si está permitido para este usuario.
    const configured = companySettings?.defaultPaymentMethod
    if (configured && PAYMENT_METHODS[configured]) {
      const allowedOk = !allowedPaymentMethods || allowedPaymentMethods.length === 0
        || allowedPaymentMethods.map(id => PAYMENT_METHOD_ID_TO_KEY[id]).includes(configured)
      if (allowedOk) return configured
    }
    return ''
  }

  // productsRaw = productos tal cual vienen de Firestore. `products` (más abajo,
  // tras selectedBranch) es la vista EFECTIVA con los precios por sucursal
  // aplicados — todo el POS lee de `products`, así los overrides aplican solos.
  const [productsRaw, setProductsRaw] = useState([])
  const [productsLoading, setProductsLoading] = useState(true)
  // Set<productId> de platos con receta cuyos insumos no alcanzan para 1 unidad.
  // Se calcula lazy (después del primer paint) y sólo si `!allowNegativeStock`.
  // El badge "Sin insumos" se renderiza con base en este set.
  const [productsWithoutIngredients, setProductsWithoutIngredients] = useState(() => new Set())
  // Map<productId, totalCost> de recetas. Se usa para congelar el costo del
  // plato al vender (costAtSale en comprobantes). Se carga lazy y SOLO si la
  // cuenta tiene recetas → cero overhead para las cuentas retail.
  const [recipeCostMap, setRecipeCostMap] = useState(() => new Map())
  const [customers, setCustomers] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [taxConfig, setTaxConfig] = useState({ igvRate: 18, igvExempt: false, taxType: 'standard' }) // Configuración de impuestos
  const [recargoConsumoConfig, setRecargoConsumoConfig] = useState({ enabled: false, rate: 10 }) // Recargo al Consumo (restaurantes)
  // Recargo por pago con tarjeta (Configuración > Ventas). Cuando aplica, SUBE el
  // precio de los productos (no se muestra como línea); el comprobante sale como
  // una venta normal a ese precio, así el IGV queda correcto sin tocar SUNAT.
  const [cardCommissionConfig, setCardCommissionConfig] = useState({ enabled: false, rate: 5 })
  // Marca para autocompletar el monto del único pago tras cambiar de método (el
  // total puede subir por el recargo de tarjeta, que se sabe recién al elegir Tarjeta).
  const pendingAmountSyncRef = useRef(false)
  const [cart, setCart] = useState([])

  // ===== Multi-divisa (USD) — solo en modo retail con flag activa ======
  // Restaurant, hotel, etc. quedan SIEMPRE en PEN. Si el negocio activó
  // multi-divisa en Configuración Y está en retail, aparece el selector.
  const posMultiCurrencyOn = React.useMemo(
    () => businessMode === 'retail' && isMultiCurrencyEnabled(businessSettings),
    [businessMode, businessSettings]
  )
  const [currency, setCurrency] = useState(
    posMultiCurrencyOn ? getDefaultCurrency(businessSettings) : BASE_CURRENCY
  )
  const [exchangeRate, setExchangeRate] = useState(1)
  const [exchangeRateSource, setExchangeRateSource] = useState(null) // 'sbs'|'cache'|'manual'
  const [loadingRate, setLoadingRate] = useState(false)
  // Estado local de texto del input de TC. Permite que el campo quede
  // vacío mientras el usuario escribe (sin forzar "0" al borrarlo).
  const [exchangeRateInput, setExchangeRateInput] = useState('1')
  const [tcInputFocused, setTcInputFocused] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef(null)
  // Detección de escaneo de pistola "copiar/pegar/Enter": momento del último pegado
  // en el buscador, y bandera de escaneo desde el detector global de pistola. Sirven
  // para avisar (modal) cuando el código escaneado no está registrado.
  const lastSearchPasteRef = useRef(0)
  const scanSubmitRef = useRef(false)
  const cartScrollRef = useRef(null)
  const cartSectionRef = useRef(null)
  // Detecta si estamos en la app nativa (móvil/tablet vía Capacitor). En web/desktop
  // no se muestran botones que solo funcionan en la app — como el escáner de
  // código de barras que usa la cámara nativa.
  const isNativeApp = React.useMemo(() => {
    try { return Capacitor?.isNativePlatform?.() === true } catch (_) { return false }
  }, [])
  // Modo de visualización del catálogo: 'grid' (cards con foto) o 'list' (filas densas).
  // Persistido en localStorage para que la preferencia sobreviva entre sesiones.
  const [productViewMode, setProductViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem('pos:productViewMode')
      return saved === 'list' ? 'list' : 'grid'
    } catch (_) {
      return 'grid'
    }
  })
  useEffect(() => {
    try { localStorage.setItem('pos:productViewMode', productViewMode) } catch (_) {}
  }, [productViewMode])
  // Ref del botón "Procesar Venta". Cuando el usuario selecciona un método de pago,
  // movemos el focus aquí para que pueda apretar Enter y procesar sin usar el mouse.
  const checkoutButtonRef = useRef(null)
  // Ref del input de monto del primer pago. Al elegir "Efectivo" enfocamos y
  // seleccionamos este campo para que el cajero tipee el monto recibido (vuelto)
  // y luego procese con Enter.
  const cashAmountInputRef = useRef(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [documentType, setDocumentType] = useState(() => {
    if (allowedDocumentTypes && allowedDocumentTypes.length > 0) {
      return allowedDocumentTypes[0]
    }
    return 'boleta'
  })
  // ¿El negocio puede emitir comprobantes FISCALES (boleta/factura)?
  // Requiere conexión SUNAT (método 'qpse' o 'sunat_direct') O que el admin lo haya
  // habilitado manualmente (allowInvoicingWithoutSunat). Sin eso, solo Nota de Venta.
  // Mientras companySettings carga (null) asumimos true (optimista) para no parpadear el
  // selector ni forzar Nota de Venta antes de tiempo; al cargar queda el valor real.
  const hasSunatConnection = ['qpse', 'sunat_direct'].includes(companySettings?.emissionMethod)
  const canEmitFiscal = isDemoMode || !companySettings || hasSunatConnection || companySettings.allowInvoicingWithoutSunat === true
  // Obtener fecha local en formato YYYY-MM-DD (sin usar toISOString que convierte a UTC)
  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const [emissionDate, setEmissionDate] = useState(getLocalDateString()) // Fecha de emisión (por defecto hoy)
  // ¿El usuario eligió manualmente la fecha de emisión? Si NO, siempre se usa la
  // fecha actual del sistema al vender. Evita que una pestaña del POS abierta de un
  // día para otro "congele" la fecha y emita las ventas de hoy con la fecha de ayer.
  const emissionDateEditedRef = useRef(false)
  // Obtener fecha-hora local en formato YYYY-MM-DDTHH:mm (para inputs datetime-local)
  const getLocalDateTimeString = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }
  const [metaEventTime, setMetaEventTime] = useState(getLocalDateTimeString()) // Hora del evento para Meta Ads
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
  const [changeReminder, setChangeReminder] = useState(null) // Recordatorio de vuelto en efectivo (opcional)
  // Recordatorio de vuelto que queda PENDIENTE de mostrar: cuando hay auto-impresión,
  // el aviso se difiere hasta que el ticket haya salido (se dispara desde handlePrintTicket).
  const pendingChangeReminderRef = useRef(null)
  const [postSaleModalOpen, setPostSaleModalOpen] = useState(false) // Modal de opciones post-venta
  const postSaleHandledRef = useRef(false) // Para abrir el modal una sola vez por venta
  const [isLookingUp, setIsLookingUp] = useState(false)
  // Establecimientos (anexos) de un RUC con varios locales: lista + modal para elegir.
  const [establishments, setEstablishments] = useState([])
  const [showEstablishmentsModal, setShowEstablishmentsModal] = useState(false)
  const [loadingEstablishments, setLoadingEstablishments] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Warehouses (para stock/inventario)
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouse, setSelectedWarehouse] = useState(null)

  // Branches/Sucursales (para series de documentos)
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)
  // Sede pendiente de aplicar al cobrar una mesa/orden (se resuelve cuando cargan sucursales/almacenes)
  const [pendingBranchSelection, setPendingBranchSelection] = useState(null)

  // Precios por sucursal (businessSettings.branchPricingEnabled): `products` es la
  // vista EFECTIVA con price/price2/3/4 reemplazados por el override de la sucursal
  // activa. Sin feature o en Sucursal Principal (sin branchId) → lista original tal
  // cual (misma referencia, no invalida memos aguas abajo).
  const products = useMemo(() => {
    if (!businessSettings?.branchPricingEnabled) return productsRaw
    const branchId = selectedBranch?.id || null
    if (!branchId) return productsRaw
    return productsRaw.map(p => applyBranchPricing(p, branchId))
  }, [productsRaw, selectedBranch, businessSettings?.branchPricingEnabled])

  // Estado para edición de documento existente
  const [editingInvoiceId, setEditingInvoiceId] = useState(null)
  const [editingInvoiceData, setEditingInvoiceData] = useState(null)
  const editInvoiceLoadedRef = useRef(false)

  // Estado para orden de restaurante (para marcar como pagada al completar)
  const [pendingOrderId, setPendingOrderId] = useState(null)
  const [markOrderPaidOnComplete, setMarkOrderPaidOnComplete] = useState(false)
  const [markOnlineOrderCompleteOnSale, setMarkOnlineOrderCompleteOnSale] = useState(false)

  // Estado para cotización (para marcar como convertida al completar)
  const [pendingQuotationId, setPendingQuotationId] = useState(null)

  // Estado para nota(s) de venta (para marcar como convertida(s) y skip stock al completar)
  // Puede ser un string (una nota) o un array (múltiples notas)
  const [pendingNotaVentaIds, setPendingNotaVentaIds] = useState(null)

  // Estado para guía de remisión origen (skip stock si la guía ya descontó al crearse).
  // Shape: { id, number, stockAlreadyDeducted } | null
  const [sourceDispatchGuide, setSourceDispatchGuide] = useState(null)

  // Estado para cita veterinaria (para marcar como completada al finalizar la venta)
  const [pendingAppointmentData, setPendingAppointmentData] = useState(null)

  // Cash register check
  const [cashRegisterOpen, setCashRegisterOpen] = useState(true)

  // Barcode Scanner
  const [isScanning, setIsScanning] = useState(false)
  const [expandedCart, setExpandedCart] = useState(false)

  // Ventas en espera (hold/park)
  const [heldSales, setHeldSales] = useState([])
  const [showHeldSales, setShowHeldSales] = useState(false)

  // Sellers
  const [sellers, setSellers] = useState([])
  const [selectedSeller, setSelectedSeller] = useState(null)

  // Categories
  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')
  // Categoría raíz cuya rama de subcategorías está expandida. Una sola raíz a la vez.
  const [expandedRootCategoryId, setExpandedRootCategoryId] = useState(null)
  // Colapso global de TODA la sección de chips de categorías. Persiste en localStorage.
  const [categoriesSectionCollapsed, setCategoriesSectionCollapsed] = useState(() => {
    try {
      return localStorage.getItem('pos_categories_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const toggleCategoriesSection = () => {
    setCategoriesSectionCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('pos_categories_collapsed', String(next)) } catch (e) { void e }
      return next
    })
  }
  // Filtro por marca (independiente de categoría; se combinan con AND).
  const [selectedBrandFilter, setSelectedBrandFilter] = useState('all')
  const [brandsSectionCollapsed, setBrandsSectionCollapsed] = useState(() => {
    try {
      return localStorage.getItem('pos_brands_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const toggleBrandsSection = () => {
    setBrandsSectionCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('pos_brands_collapsed', String(next)) } catch (e) { void e }
      return next
    })
  }

  // Pagination for products
  const [visibleProductsCount, setVisibleProductsCount] = useState(12)
  const PRODUCTS_PER_PAGE = 12
  // Nº de columnas del grid de productos (mismos breakpoints que tenían las clases
  // columns-2 sm:columns-3 xl:columns-4/2). Se necesita en JS porque el masonry se
  // reparte a mano (round-robin) para que el orden sea HORIZONTAL: producto 1 →
  // col 1, producto 2 → col 2, etc. CSS multi-column llenaba columna por columna
  // y con pocos productos quedaban apilados a la izquierda.
  const [gridColumns, setGridColumns] = useState(2)
  useEffect(() => {
    const mqSm = window.matchMedia('(min-width: 640px)')
    const mqXl = window.matchMedia('(min-width: 1280px)')
    const update = () => {
      if (mqXl.matches) setGridColumns(expandedCart ? 2 : 4)
      else if (mqSm.matches) setGridColumns(3)
      else setGridColumns(2)
    }
    update()
    mqSm.addEventListener('change', update)
    mqXl.addEventListener('change', update)
    return () => {
      mqSm.removeEventListener('change', update)
      mqXl.removeEventListener('change', update)
    }
  }, [expandedCart])

  // Pagos múltiples - lista simple y vertical
  const [payments, setPayments] = useState([{ method: getDefaultPaymentMethod(), amount: '' }])

  // Saldo a favor del cliente (store credit): notas de crédito que el cliente
  // conserva y puede usar como pago. Se carga al seleccionar/identificar al
  // cliente por documento. { total, notes: [{id, number, available, ...}] }
  const [customerStoreCredit, setCustomerStoreCredit] = useState({ total: 0, notes: [] })

  // companySettings llega async; al montar aún no estaba listo. Cuando carga, aplicar el
  // método de pago por defecto configurado SI el formulario sigue pristino (sin borrador/
  // edición). Los reinicios (Nueva Venta) ya lo aplican vía getDefaultPaymentMethod.
  useEffect(() => {
    const configured = companySettings?.defaultPaymentMethod
    if (!configured || !PAYMENT_METHODS[configured]) return
    const allowedOk = !allowedPaymentMethods || allowedPaymentMethods.length === 0
      || allowedPaymentMethods.map(id => PAYMENT_METHOD_ID_TO_KEY[id]).includes(configured)
    if (!allowedOk) return
    setPayments(prev => (
      prev.length === 1 && prev[0].method === '' && !prev[0].amount
        ? [{ ...prev[0], method: configured }]
        : prev
    ))
  }, [companySettings])

  // Hotel: habitaciones ocupadas y selección de habitación para cargo
  const [occupiedRooms, setOccupiedRooms] = useState([])
  const [selectedRoom, setSelectedRoom] = useState(null)

  // Cargar habitaciones ocupadas para modo hotel
  useEffect(() => {
    if (businessMode !== 'hotel' || !user?.uid) return
    const loadOccupiedRooms = async () => {
      try {
        const [roomsRes, reservationsRes] = await Promise.all([
          getHotelRooms(getBusinessId()),
          getActiveReservations(getBusinessId())
        ])
        if (roomsRes.success && reservationsRes.success) {
          const occupied = roomsRes.data
            .filter(r => r.status === 'occupied')
            .map(room => {
              const reservation = reservationsRes.data.find(
                res => res.roomId === room.id && res.status === 'checked_in'
              )
              return { ...room, reservation }
            })
          setOccupiedRooms(occupied)
        }
      } catch (e) {
        console.warn('Error cargando habitaciones:', e)
      }
    }
    loadOccupiedRooms()
  }, [businessMode, user])

  // Tipo de pedido (para reportes)
  const [orderType, setOrderType] = useState('takeaway')

  // Modal de selección de precio (para productos con múltiples precios)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [productForPriceSelection, setProductForPriceSelection] = useState(null)

  // Modal de selección de presentación (para productos con presentaciones)
  const [showPresentationModal, setShowPresentationModal] = useState(false)
  const [productForPresentationSelection, setProductForPresentationSelection] = useState(null)

  // Modal de selección de lote (modo farmacia)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [productForBatchSelection, setProductForBatchSelection] = useState(null)
  const [pendingPriceForBatch, setPendingPriceForBatch] = useState(null) // Precio seleccionado antes de elegir lote
  const [pendingBatchForPresentation, setPendingBatchForPresentation] = useState(null) // Lote seleccionado antes de elegir presentación
  const [pendingBatchForPrice, setPendingBatchForPrice] = useState(null) // Lote seleccionado antes de elegir precio (desde presentación base)
  const [priceFromBaseUnit, setPriceFromBaseUnit] = useState(false) // Viene del flujo presentación → unidad base → precios

  // Modal de selección de número de serie
  const [showSerialModal, setShowSerialModal] = useState(false)
  const [productForSerialSelection, setProductForSerialSelection] = useState(null)
  const [pendingSerialData, setPendingSerialData] = useState(null) // { price, batch, presentation } datos pendientes del flujo
  // Multi-selección de N° de serie: el usuario puede marcar varias series y
  // agregarlas todas al carrito en una sola operación (útil para ventas de
  // muchas unidades con número de serie individual).
  const [selectedSerialIds, setSelectedSerialIds] = useState(() => new Set())

  // Descuento
  const [discountAmount, setDiscountAmount] = useState('')
  const [discountPercentage, setDiscountPercentage] = useState('')

  // Observaciones generales
  const [generalNotes, setGeneralNotes] = useState('')
  const [showNotesSection, setShowNotesSection] = useState(false)

  // Variant selection modal
  const [selectedProductForVariant, setSelectedProductForVariant] = useState(null)
  const [showVariantModal, setShowVariantModal] = useState(false)
  const [variantForPriceSelection, setVariantForPriceSelection] = useState(null) // Variante pendiente de selección de precio

  // Modifier selection modal (restaurant modifiers)
  const [showModifierModal, setShowModifierModal] = useState(false)
  const [productForModifiers, setProductForModifiers] = useState(null)

  // Aviso de insumos insuficientes (recetas): bloquea la venta con un modal claro
  const [missingIngredientsAlert, setMissingIngredientsAlert] = useState(null)

  // Aviso (modal) cuando se escanea/pega un código que no existe en el sistema.
  const [unknownScanCode, setUnknownScanCode] = useState(null)

  // Custom product modal
  const [showCustomProductModal, setShowCustomProductModal] = useState(false)
  const [customProduct, setCustomProduct] = useState({
    name: '',
    price: '',
    quantity: 1,
    unit: 'NIU',
    taxAffectation: '10', // '10'=Gravado 18%, '20'=Exonerado, '30'=Inafecto
    igvRate: 18, // Per-product IGV rate (18% or 10.5%)
    addIgv: false // Si true, se agrega IGV al precio ingresado
  })

  // Aplicar la afectación por defecto del negocio (Configuración > Preferencias)
  // cuando businessSettings carga, SOLO si el usuario aún no tocó el modal
  // (el modal recuerda la última afectación elegida durante la sesión).
  const customProductDefaultApplied = useRef(false)
  useEffect(() => {
    if (customProductDefaultApplied.current) return
    const def = businessSettings?.defaultTaxAffectation
    if (!def || def === '10') return
    customProductDefaultApplied.current = true
    setCustomProduct(prev => (prev.name || prev.price ? prev : { ...prev, taxAffectation: def }))
  }, [businessSettings?.defaultTaxAffectation])

  // Estado para configuración de impresión web legible y compacta
  const [webPrintLegible, setWebPrintLegible] = useState(false)
  const [ticketFontSize, setTicketFontSize] = useState('small')
  const [compactPrint, setCompactPrint] = useState(false)
  const [printMargins, setPrintMargins] = useState(8)
  const [simplePrint, setSimplePrint] = useState(false)
  const [a4SheetPrint, setA4SheetPrint] = useState(false)
  const [showItemUnit, setShowItemUnit] = useState(false)
  const [ticketPaperWidth, setTicketPaperWidth] = useState(80)

  // Price editing
  const [editingPriceItemId, setEditingPriceItemId] = useState(null)
  const [editingPrice, setEditingPrice] = useState('')
  const [editingPriceWithoutIgv, setEditingPriceWithoutIgv] = useState(false)

  // Venta por monto (granel): ingresa S/ y calcula el peso
  const [amountModeItemId, setAmountModeItemId] = useState(null)
  const [amountModeValue, setAmountModeValue] = useState('')

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
    phone: '',
    studentName: '', // Campo libre para nombre de alumno
    studentSchedule: '', // Horario/turno del alumno
    petName: '', // Nombre de la mascota (modo veterinaria)
    vehiclePlate: '', // Placa de vehículo
    vehicleModel: '', // Modelo de vehículo
    vehicleYear: '', // Año de vehículo
    // Campos para transporte de carga
    originAddress: '', // Dirección de origen
    destinationAddress: '', // Dirección de destino
    tripDetail: '', // Detalle del viaje
    serviceReferenceValue: '', // Valor referencial del servicio
    effectiveLoadValue: '', // Valor referencial carga efectiva
    usefulLoadValue: '', // Valor referencial carga útil
    bankAccount: '', // Cta. Cte. Banco de la Nación
    detractionPercentage: '', // Porcentaje de detracción
    detractionAmount: '', // Monto de detracción
    goodsServiceCode: '', // Código de bien o servicio SUNAT
  })

  // Saldo a favor del cliente: se recarga cuando cambia el documento del cliente.
  // Solo para documentos válidos (DNI 8 / RUC 11) y fuera del modo demo.
  // OJO: este effect debe ir DESPUÉS de la declaración de customerData (TDZ).
  useEffect(() => {
    const docNum = (customerData.documentNumber || '').trim()
    if (isDemoMode || (docNum.length !== 8 && docNum.length !== 11)) {
      setCustomerStoreCredit({ total: 0, notes: [] })
      return
    }
    let cancelled = false
    ;(async () => {
      const res = await getCustomerStoreCredit(getBusinessId(), docNum)
      if (cancelled) return
      setCustomerStoreCredit(res.success ? res.data : { total: 0, notes: [] })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerData.documentNumber, isDemoMode])

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

  // Estados para detracción (solo facturas)
  const [hasDetraction, setHasDetraction] = useState(false)
  const [detractionType, setDetractionType] = useState('') // Código SUNAT del tipo de bien/servicio
  const [hasRetencion, setHasRetencion] = useState(false) // Régimen de Retención IGV (cliente agente de retención)
  const [detractionBankAccount, setDetractionBankAccount] = useState('') // Cuenta del Banco de la Nación

  // Mostrar campos de transporte de carga solo para códigos 021 y 027
  const showTransportFields = hasDetraction && ['021', '027'].includes(detractionType)

  // Ref para controlar si ya se cargó el borrador
  const draftLoadedRef = useRef(false)

  // Clave única para el localStorage basada en el businessId
  const getDraftKey = () => `pos_draft_${getBusinessId()}`

  // ===== Multi-divisa: helpers + efectos =================================

  // Trae el TC del día (SBS vía Cloud Function). Si el TC actual fue editado
  // manualmente, no lo pisa salvo que se pase forceForToday=true.
  const fetchExchangeRate = async (forceForToday = false) => {
    if (loadingRate) return
    setLoadingRate(true)
    try {
      const result = await getRateForDate(forceForToday ? new Date() : new Date())
      if (result && Number.isFinite(result.sell) && result.sell > 0) {
        setExchangeRate(Number(result.sell.toFixed(4)))
        setExchangeRateSource(result.source)
        if (result.source === 'sbs') {
          toast.success(`Tipo de cambio del día: S/ ${result.sell.toFixed(4)} (SBS)`)
        }
      } else {
        setExchangeRateSource(null)
        toast.error('No se pudo obtener el TC SBS. Ingresa el valor manualmente.')
      }
    } catch (err) {
      console.error('Error obteniendo TC:', err)
    } finally {
      setLoadingRate(false)
    }
  }

  // Al cambiar a USD, si TC no fue editado (<= 1), traemos uno automáticamente.
  useEffect(() => {
    if (!posMultiCurrencyOn) return
    if (currency === 'USD' && exchangeRate <= 1) {
      fetchExchangeRate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency])

  // Multi-divisa: aunque la sesión esté en soles, asegurar un TC del día disponible para poder
  // valuar productos anclados al dólar (precio en soles = priceUSD × TC).
  useEffect(() => {
    if (!posMultiCurrencyOn) return
    if (exchangeRate <= 1) fetchExchangeRate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posMultiCurrencyOn])

  // Sincronizar el texto del input cuando el TC cambia desde afuera (SBS,
  // draft, etc.) — pero no mientras el usuario está escribiendo.
  useEffect(() => {
    if (tcInputFocused) return
    setExchangeRateInput(exchangeRate > 0 ? String(exchangeRate) : '')
  }, [exchangeRate, tcInputFocused])

  // Cuando el cajero edita el TC manualmente (o se actualiza desde SBS),
  // recomputamos los precios USD del carrito desde basePrice (PEN). Así
  // si TC pasa de 3.454 → 3.60, el item de 300 PEN pasa de $86.86 a $83.33.
  // EXCEPCIÓN: items con fixedPriceUSD (precio fijo USD del producto) NO
  // se recalculan, mantienen su precio definido por el usuario.
  useEffect(() => {
    if (!posMultiCurrencyOn) return
    if (!exchangeRate || exchangeRate <= 0) return
    setCart(prev => prev.map(item => {
      const fixedUSD = Number(item.fixedPriceUSD)
      if (Number.isFinite(fixedUSD) && fixedUSD > 0) {
        // Anclado al dólar: el precio en USD no cambia; recalculamos el equivalente en
        // soles (basePrice). En sesión soles, el precio mostrado también = USD × TC.
        if (exchangeRate <= 1) return item // sin TC válido aún, no tocar
        const newBase = Number((fixedUSD * exchangeRate).toFixed(2))
        const newPrice = currency === 'USD' ? fixedUSD : newBase
        if (Math.abs((Number(item.basePrice) || 0) - newBase) < 0.005 &&
            Math.abs((Number(item.price) || 0) - newPrice) < 0.005) return item
        return { ...item, price: newPrice, basePrice: newBase }
      }
      // No anclado: solo recalcular el precio mostrado en sesión USD desde basePrice (PEN).
      if (currency !== 'USD') return item
      const baseInPEN = Number(item.basePrice)
      if (!Number.isFinite(baseInPEN) || baseInPEN <= 0) return item
      const newPrice = Number(convertFromBase(baseInPEN, 'USD', exchangeRate).toFixed(2))
      // Si el precio ya coincide (margen redondeo), no tocar para evitar renders innecesarios.
      if (Math.abs((Number(item.price) || 0) - newPrice) < 0.005) return item
      return { ...item, price: newPrice }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchangeRate])

  // Convierte un precio del catálogo (siempre en PEN) a la moneda activa
  // de la sesión POS. Si la sesión es PEN, devuelve el mismo número.
  const toSessionCurrency = (priceInBase) => {
    const n = Number(priceInBase) || 0
    if (currency === BASE_CURRENCY || n === 0) return n
    return Number(convertFromBase(n, currency, exchangeRate).toFixed(2))
  }

  // Multi-divisa: arma el pricing de un ítem ANCLADO AL DÓLAR (producto/variante/presentación
  // con priceUSD). El dólar es la referencia: en sesión USD vale priceUSD fijo, y el equivalente
  // en soles = priceUSD × TC. Así, al cambiar el TC, lo que varía es el monto en soles, no el
  // dólar. Si todavía no hay un TC válido (>1), cae al precio en soles de respaldo para no romper.
  // Devuelve { price (moneda de sesión), basePrice (PEN), fixedPriceUSD } o null si no aplica.
  const buildUsdAnchoredCartPricing = (priceUSD, fallbackPenPrice = 0) => {
    const usd = Number(priceUSD)
    if (!Number.isFinite(usd) || usd <= 0) return null
    const tc = Number(exchangeRate) > 1 ? Number(exchangeRate) : 0
    const baseInPEN = tc > 0 ? Number((usd * tc).toFixed(2)) : (Number(fallbackPenPrice) || 0)
    const price = currency === 'USD' ? usd : baseInPEN
    return { price, basePrice: baseInPEN, fixedPriceUSD: usd }
  }

  // UX doble moneda: devuelve el precio UNITARIO de un ítem del carrito en AMBAS monedas
  // (USD y PEN), usando el ancla (fixedPriceUSD / basePrice) cuando existe para máxima
  // exactitud. Si no hay TC válido (>1), el equivalente cae a 0.
  const getItemDualPrice = (item) => {
    const tc = Number(exchangeRate) > 1 ? Number(exchangeRate) : 0
    const sessionPrice = Number(item.price) || 0
    let pen
    if (Number.isFinite(Number(item.basePrice)) && Number(item.basePrice) > 0) pen = Number(item.basePrice)
    else if (currency === 'PEN') pen = sessionPrice
    else pen = tc > 0 ? Number((sessionPrice * tc).toFixed(2)) : 0
    let usd
    if (Number.isFinite(Number(item.fixedPriceUSD)) && Number(item.fixedPriceUSD) > 0) usd = Number(item.fixedPriceUSD)
    else if (currency === 'USD') usd = sessionPrice
    else usd = tc > 0 ? Number((pen / tc).toFixed(2)) : 0
    return { usd, pen }
  }

  // Valor (número) de una entidad (producto o variante) en una moneda dada, respetando el
  // ancla en dólares (priceUSD). En USD vale el priceUSD fijo; en soles = priceUSD × TC. Sin
  // priceUSD: price (soles) o su conversión por TC. Base de la grilla con doble moneda.
  const productEntityValueIn = (entity, cur) => {
    if (!entity) return 0
    const tc = Number(exchangeRate) > 1 ? Number(exchangeRate) : 0
    const usd = Number(entity.priceUSD)
    if (Number.isFinite(usd) && usd > 0) {
      if (cur === 'USD') return usd
      return tc > 0 ? Number((usd * tc).toFixed(2)) : (Number(entity.price) || usd)
    }
    const pen = Number(entity.price) || 0
    if (cur === 'PEN') return pen
    return tc > 0 ? Number((pen / tc).toFixed(2)) : pen
  }

  // Formatea el precio de catálogo de un producto en una moneda específica (PEN o USD).
  // Para productos con variantes muestra rango "X – Y". Respeta el ancla USD en ambas monedas.
  const formatCatalogPriceIn = (product, cur) => {
    if (!product) return formatCurrency(0, cur)
    if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
      const prices = product.variants
        .map((v) => productEntityValueIn(v, cur))
        .filter((p) => Number.isFinite(p) && p > 0)
      if (prices.length === 0) return formatCurrency(0, cur)
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      return min === max
        ? formatCurrency(min, cur)
        : `${formatCurrency(min, cur)} – ${formatCurrency(max, cur)}`
    }
    return formatCurrency(productEntityValueIn(product, cur), cur)
  }

  // Precio del producto en la moneda activa de la sesión (la moneda de cobro elegida).
  const formatCatalogPrice = (product) => formatCatalogPriceIn(product, currency)

  // Cambio de moneda. Si vamos a USD y no hay TC válido, lo obtenemos
  // antes de hacer cualquier otra cosa. Si hay carrito, convertimos los
  // precios con el TC efectivo recién obtenido.
  const handleCurrencyChange = async (newCurrency) => {
    if (newCurrency === currency) return

    // 1) Asegurar TC válido si vamos a USD. Si la SBS no responde,
    //    bloqueamos el cambio y pedimos ingreso manual.
    let effectiveRate = exchangeRate
    if (newCurrency === 'USD' && exchangeRate <= 1) {
      setLoadingRate(true)
      try {
        const result = await getRateForDate(new Date())
        if (result && Number.isFinite(result.sell) && result.sell > 0) {
          effectiveRate = Number(result.sell.toFixed(4))
          setExchangeRate(effectiveRate)
          setExchangeRateSource(result.source)
          if (result.source === 'sbs') {
            toast.success(`Tipo de cambio del día: S/ ${effectiveRate} (SBS)`)
          }
        } else {
          toast.error('No se pudo obtener el TC. Ingrésalo manualmente y vuelve a intentar.')
          setLoadingRate(false)
          return
        }
      } catch (err) {
        console.error('Error obteniendo TC:', err)
        toast.error('No se pudo obtener el TC. Ingrésalo manualmente y vuelve a intentar.')
        setLoadingRate(false)
        return
      }
      setLoadingRate(false)
    }

    // 2) Carrito vacío: cambio directo.
    if (cart.length === 0) {
      setCurrency(newCurrency)
      return
    }

    // 3) Carrito con items: convertir precios usando el TC efectivo
    //    (sin confirmación, cambio inmediato).
    setCart(prev => prev.map(item => {
      const oldPrice = Number(item.price) || 0
      // Si el item tiene fixedPriceUSD (precio fijo definido en el producto)
      // y vamos a USD, usamos ese precio directamente —ignorando el TC—.
      // En PEN seguimos usando basePrice como antes.
      const fixedUSD = Number(item.fixedPriceUSD)
      const hasFixedUSD = Number.isFinite(fixedUSD) && fixedUSD > 0
      // Si el item tiene basePrice (PEN como source of truth), recomputamos
      // el precio desde ahí para evitar pérdida de precisión en round-trips
      // (300 PEN → 87.36 USD → 299.97 PEN ❌; con basePrice → 300 PEN ✅).
      // Si no hay basePrice (item viejo o editado manualmente), caemos al
      // método de conversión directa (puede perder precisión).
      let newPrice = oldPrice
      let newBasePrice = item.basePrice
      const baseInPEN = Number(item.basePrice)
      const hasBase = Number.isFinite(baseInPEN) && baseInPEN > 0
      if (hasFixedUSD) {
        // Anclado al dólar: USD fijo; el equivalente en soles = priceUSD × TC. Al cambiar el
        // TC varían los soles, no el dólar.
        newBasePrice = Number((fixedUSD * effectiveRate).toFixed(2))
        newPrice = newCurrency === 'USD' ? fixedUSD : newBasePrice
      } else if (hasBase) {
        // Recomputar desde la fuente PEN sin redondeos intermedios.
        newPrice = newCurrency === 'PEN'
          ? baseInPEN
          : Number(convertFromBase(baseInPEN, 'USD', effectiveRate).toFixed(2))
        newBasePrice = baseInPEN
      } else {
        // Fallback (sin basePrice): conversión directa antigua.
        if (currency === 'PEN' && newCurrency === 'USD') {
          newPrice = Number(convertFromBase(oldPrice, 'USD', effectiveRate).toFixed(2))
        } else if (currency === 'USD' && newCurrency === 'PEN') {
          newPrice = Number(convertToBase(oldPrice, 'USD', effectiveRate).toFixed(2))
        }
      }
      // También convertir itemDiscount si es monto (no porcentaje)
      let newItemDiscount = item.itemDiscount
      if (typeof item.itemDiscount === 'number' && item.itemDiscount > 0 && item.itemDiscountType !== 'percentage') {
        if (currency === 'PEN' && newCurrency === 'USD') {
          newItemDiscount = Number(convertFromBase(item.itemDiscount, 'USD', effectiveRate).toFixed(2))
        } else if (currency === 'USD' && newCurrency === 'PEN') {
          newItemDiscount = Number(convertToBase(item.itemDiscount, 'USD', effectiveRate).toFixed(2))
        }
      }
      return { ...item, price: newPrice, basePrice: newBasePrice, itemDiscount: newItemDiscount }
    }))
    setCurrency(newCurrency)
  }

  // Nota: las boletas SÍ pueden emitirse en USD (SUNAT lo permite — el sistema SEE-SOL
  // deja elegir la moneda). Antes había un useEffect que forzaba factura/PEN al elegir
  // USD+boleta; se quitó porque era un supuesto incorrecto. El umbral de S/700 para
  // boletas se valida sobre el total en SOLES (amounts.totalInBase).

  // Red de seguridad: si el tipo de comprobante actual no está permitido para el
  // usuario, caer al primero permitido. Depende también de `documentType` para que
  // corrija CUALQUIER camino que deje un tipo inválido (ej: el default del negocio
  // aplicado tarde), no solo cuando cambian los permisos.
  useEffect(() => {
    if (allowedDocumentTypes && allowedDocumentTypes.length > 0 && !allowedDocumentTypes.includes(documentType)) {
      setDocumentType(allowedDocumentTypes[0])
    }
  }, [allowedDocumentTypes, documentType])

  // Autofocus en barra de búsqueda solo en desktop/laptop.
  // Tablets quedan excluidos aunque tengan ancho >= 1024px (ej. iPad Pro,
  // tablets Android grandes en landscape) — abrir el teclado virtual al
  // entrar al POS es molesto. Detectamos "tiene mouse" con `pointer: fine`.
  useEffect(() => {
    const hasFinePointer = typeof window !== 'undefined'
      && window.matchMedia?.('(pointer: fine)').matches
    if (!isLoading && window.innerWidth >= 1024 && hasFinePointer && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isLoading])

  // Tras agregar un item al carrito (por click en lista, modal de variante, lote, serie,
  // presentación, precio múltiple o modificadores) limpiar el buscador y devolver el foco al input.
  // Sin esto, el foco queda en el botón clickeado y el Enter de la pistola lectora re-activa
  // ese botón en lugar de buscar el código escaneado.
  //
  // Configurable: businessSettings.posClearSearchOnAdd (default true).
  // Si está en false, conserva el término de búsqueda — útil para agregar varias unidades
  // del mismo producto o varios productos similares ('coca cola', 'coca cola light', etc.).
  const previousCartLengthRef = useRef(cart.length)
  useEffect(() => {
    if (cart.length > previousCartLengthRef.current) {
      const clearOnAdd = businessSettings?.posClearSearchOnAdd !== false
      if (clearOnAdd) {
        setSearchTerm('')
      }
      // Solo enfocar el buscador en desktop/laptop con mouse físico.
      // Tablets (incluso >= 1024px de ancho) tienen `pointer: coarse` y
      // queremos evitar abrir el teclado virtual al agregar cada producto.
      const hasFinePointer = typeof window !== 'undefined'
        && window.matchMedia?.('(pointer: fine)').matches
      if (window.innerWidth >= 1024 && hasFinePointer) {
        searchInputRef.current?.focus()
      }
      // Auto-scroll al último producto agregado para que sea visible (útil al escanear con pistola).
      // - Interno (carrito → último item): siempre, el carrito tiene scroll propio en móvil y desktop.
      // - Exterior (panel derecho → inicio del carrito): solo en desktop. En móvil el panel no
      //   tiene scroll propio, así que un scrollIntoView movería la página entera y alejaría
      //   al usuario de la lista de productos — no deseado.
      requestAnimationFrame(() => {
        const inner = cartScrollRef.current
        if (inner) inner.scrollTo({ top: inner.scrollHeight, behavior: 'smooth' })
        if (window.innerWidth >= 1024) {
          cartSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }
      })
    }
    previousCartLengthRef.current = cart.length
  }, [cart.length])

  // Auto-actualizar fecha de emisión cuando la pestaña vuelve a estar activa
  // (cubre: PC apagada/encendida, pestaña en segundo plano, suspensión del sistema)
  useEffect(() => {
    // Refresca la fecha de emisión a HOY cuando la pestaña vuelve a estar activa.
    // Se aplica SIEMPRE (incluso con fecha personalizada activada) salvo que el
    // usuario haya elegido manualmente una fecha — así nunca se queda "congelada".
    const refreshEmissionDate = () => {
      if (!emissionDateEditedRef.current) setEmissionDate(getLocalDateString())
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshEmissionDate()
    }
    const handleFocus = () => refreshEmissionDate()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Cleanup: cerrar pantalla de cliente al desmontar POS
  useEffect(() => {
    return () => { CustomerDisplay.hideDisplay() }
  }, [])

  // Cargar borrador del localStorage al iniciar
  useEffect(() => {
    if (!user?.uid || draftLoadedRef.current) return

    // No cargar borrador si viene de una mesa, orden, nota de venta o folio de hotel
    if (location.state?.fromTable || location.state?.fromOrder || location.state?.fromNotaVenta || location.state?.fromFolio) return

    // No cargar borrador si venimos a editar o duplicar un comprobante (URL),
    // para no pisar lo que cargan loadInvoiceForEdit/loadInvoiceForDuplicate.
    const editParams = new URLSearchParams(location.search)
    if (editParams.get('editInvoiceId') || editParams.get('duplicateInvoiceId')) return

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
          // Multi-divisa: restaurar moneda, TC y fuente del TC. Solo aplica
          // si el negocio tiene multi-divisa activa (si la flag se desactivó
          // mientras tanto, ignoramos el draft USD y mantenemos PEN).
          if (draft.currency && posMultiCurrencyOn) {
            setCurrency(draft.currency)
            if (draft.exchangeRate) setExchangeRate(Number(draft.exchangeRate))
            if (draft.exchangeRateSource) setExchangeRateSource(draft.exchangeRateSource)
          }

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
          // Multi-divisa: persistir moneda + TC + fuente del TC
          currency,
          exchangeRate,
          exchangeRateSource,
          timestamp: Date.now(),
        }
        localStorage.setItem(getDraftKey(), JSON.stringify(draft))
      } catch (error) {
        console.error('Error al guardar borrador:', error)
      }
    }, 500) // Esperar 500ms antes de guardar

    return () => clearTimeout(timeoutId)
  }, [cart, customerData, documentType, payments, discountAmount, discountPercentage, orderType, selectedSeller, currency, exchangeRate, exchangeRateSource, user])

  // Función para limpiar el borrador del localStorage
  const clearDraft = () => {
    try {
      localStorage.removeItem(getDraftKey())
    } catch (error) {
      console.error('Error al limpiar borrador:', error)
    }
  }

  // --- Ventas en espera (hold/park) ---
  const getHeldSalesKey = () => `pos_held_sales_${getBusinessId()}_${user?.uid}`

  // Cargar ventas en espera al iniciar
  useEffect(() => {
    if (!user?.uid) return
    try {
      const saved = localStorage.getItem(getHeldSalesKey())
      if (saved) {
        const parsed = JSON.parse(saved)
        // Filtrar ventas con más de 24 horas
        const maxAge = 24 * 60 * 60 * 1000
        const valid = parsed.filter(s => Date.now() - (s.timestamp || 0) < maxAge)
        setHeldSales(valid)
        if (valid.length < parsed.length) {
          localStorage.setItem(getHeldSalesKey(), JSON.stringify(valid))
        }
      }
    } catch (e) {
      console.error('Error al cargar ventas en espera:', e)
    }
  }, [user])

  const saveHeldSales = (sales) => {
    setHeldSales(sales)
    try {
      localStorage.setItem(getHeldSalesKey(), JSON.stringify(sales))
    } catch (e) {
      console.error('Error al guardar ventas en espera:', e)
    }
  }

  const holdCurrentSale = () => {
    if (cart.length === 0) return
    if (heldSales.length >= 10) {
      toast.error('Máximo 10 ventas en espera')
      return
    }
    const label = customerData.name || customerData.businessName || `Venta ${heldSales.length + 1}`
    const held = {
      id: Date.now(),
      label,
      itemCount: cart.length,
      total: amounts.total,
      cart,
      customerData,
      selectedCustomer,
      documentType,
      payments,
      discountAmount,
      discountPercentage,
      orderType,
      selectedSeller,
      generalNotes,
      paymentType,
      // Multi-divisa: preservar moneda, TC y fuente al aparcar.
      currency,
      exchangeRate,
      exchangeRateSource,
      timestamp: Date.now(),
    }
    saveHeldSales([...heldSales, held])
    clearCart()
    toast.success(`Venta aparcada: ${label}`)
  }

  const restoreHeldSale = (heldId) => {
    const sale = heldSales.find(s => s.id === heldId)
    if (!sale) return
    // Si hay items en el carrito actual, aparcar primero
    if (cart.length > 0) {
      holdCurrentSale()
    }
    setCart(sale.cart || [])
    setCustomerData(sale.customerData || { documentType: ID_TYPES.DNI, documentNumber: '', name: '', businessName: '', address: '', email: '', phone: '', studentName: '', studentSchedule: '', petName: '', vehiclePlate: '', vehicleModel: '', vehicleYear: '', originAddress: '', destinationAddress: '', tripDetail: '', serviceReferenceValue: '', effectiveLoadValue: '', usefulLoadValue: '', bankAccount: '', detractionPercentage: '', detractionAmount: '', goodsServiceCode: '' })
    setSelectedCustomer(sale.selectedCustomer || null)
    setDocumentType(sale.documentType || companySettings?.defaultDocumentType || 'boleta')
    setPayments(sale.payments || [{ method: getDefaultPaymentMethod(), amount: '' }])
    setDiscountAmount(sale.discountAmount || '')
    setDiscountPercentage(sale.discountPercentage || '')
    setOrderType(sale.orderType || 'takeaway')
    setSelectedSeller(sale.selectedSeller || null)
    setGeneralNotes(sale.generalNotes || '')
    setPaymentType(sale.paymentType || 'contado')
    // Multi-divisa: restaurar moneda y TC si estaban guardados (solo si la
    // flag sigue activa; si la apagaron, ignorar y dejar PEN).
    if (sale.currency && posMultiCurrencyOn) {
      setCurrency(sale.currency)
      if (sale.exchangeRate) setExchangeRate(Number(sale.exchangeRate))
      if (sale.exchangeRateSource) setExchangeRateSource(sale.exchangeRateSource)
    } else if (posMultiCurrencyOn) {
      // Venta aparcada antes de la flag: forzar PEN para consistencia.
      setCurrency('PEN')
      setExchangeRate(1)
      setExchangeRateSource(null)
    }
    setSaleCompleted(false)
    setLastInvoiceData(null)
    saveHeldSales(heldSales.filter(s => s.id !== heldId))
    setShowHeldSales(false)
    toast.info(`Venta recuperada: ${sale.label}`)
  }

  const removeHeldSale = (heldId) => {
    saveHeldSales(heldSales.filter(s => s.id !== heldId))
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
          setTicketFontSize(printerConfigResult.config.ticketFontSize || (printerConfigResult.config.webPrintLegible ? 'medium' : 'small'))
          setCompactPrint(printerConfigResult.config.compactPrint || false)
          setPrintMargins(printerConfigResult.config.printMargins ?? 8)
          setSimplePrint(printerConfigResult.config.simplePrint || false)
          setA4SheetPrint(printerConfigResult.config.a4SheetPrint || false)
          setShowItemUnit(printerConfigResult.config.showItemUnit || false)
          setTicketPaperWidth(printerConfigResult.config.paperWidth || 80)
        }
      } catch (error) {
        console.error('Error loading printer config:', error)
      }
    }
    loadPrinterConfig()
  }, [user])

  // Ref para evitar ejecución duplicada del efecto de carga de mesa/orden/cotización
  const tableLoadedRef = useRef(false)
  const orderLoadedRef = useRef(false)
  const quotationLoadedRef = useRef(false)
  const notaVentaLoadedRef = useRef(false)
  const dispatchGuideLoadedRef = useRef(false)
  const folioLoadedRef = useRef(false)
  const onlineOrderLoadedRef = useRef(false)
  // IDs de cargos del folio pendientes de marcar como facturados (persiste aunque el cart cambie)
  const pendingFolioChargeIdsRef = useRef([])
  // Evita que loadBusinessData sobrescriba el documentType después de que el usuario lo cambió manualmente
  const userChangedDocTypeRef = useRef(false)

  // Detectar si viene de una mesa y cargar items
  // Fija la sucursal y su almacén en el POS según la sede de la mesa/orden que se va a cobrar,
  // para que el comprobante, la serie SUNAT, la caja y el descuento de stock/insumos usen la sede correcta.
  const applyBranchForOrder = (branchId) => {
    if (!branchId) {
      setSelectedBranch(null)
      const mainWarehouses = warehouses.filter(w => w.isActive && !w.branchId)
      if (mainWarehouses.length > 0) {
        setSelectedWarehouse(mainWarehouses.find(w => w.isDefault) || mainWarehouses[0])
      }
    } else {
      const branch = branches.find(b => b.id === branchId)
      if (branch) {
        setSelectedBranch(branch)
        const branchWarehouses = warehouses.filter(w => w.isActive && w.branchId === branchId)
        if (branchWarehouses.length > 0) {
          setSelectedWarehouse(branchWarehouses.find(w => w.isDefault) || branchWarehouses[0])
        }
      }
    }
  }

  // Aplica la sede pendiente cuando ya cargaron los almacenes (evita la carrera al montar el POS
  // desde el cobro de una mesa: fromTable corre antes de que getWarehouses/getActiveBranches resuelvan).
  useEffect(() => {
    if (!pendingBranchSelection) return
    if (warehouses.length === 0) return
    applyBranchForOrder(pendingBranchSelection.branchId)
    setPendingBranchSelection(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBranchSelection, warehouses, branches])

  useEffect(() => {
    if (location.state?.fromTable && !tableLoadedRef.current) {
      const tableInfo = location.state

      // Marcar como cargado para evitar duplicados
      tableLoadedRef.current = true

      setTableData(tableInfo)
      setOrderType('dine-in') // Establecer automáticamente como "En Mesa"

      // Forzar la sede (y su almacén) a la de la mesa: el comprobante, la serie, la caja y el
      // descuento de stock/insumos deben quedar en la sucursal de la mesa, no en la del cajero.
      if ('branchId' in tableInfo) {
        setPendingBranchSelection({ branchId: tableInfo.branchId ?? null })
      }

      // Si la mesa tiene una orden asociada, guardarla para marcarla como pagada al completar
      // En cobro parcial (partialClose) NO marcar la orden como pagada porque sigue activa
      if (tableInfo.orderId) {
        setPendingOrderId(tableInfo.orderId)
        if (!tableInfo.partialClose) {
          setMarkOrderPaidOnComplete(true)
        }
      }

      // Cargar items de la mesa al carrito. Las cortesías (bonificación marcada en
      // la mesa) se jalan como bonificación: precio 0, inafecto y etiqueta en el
      // nombre, igual que un producto de catálogo con precio 0. Así el cajero las
      // ve en el POS y se emiten como bonificación (no se cobran).
      if (tableInfo.items && tableInfo.items.length > 0) {
        const billableSourceItems = tableInfo.items.filter(item => !item.isCourtesy)
        const cartItems = tableInfo.items.map((item, idx) => {
          if (!item.isCourtesy) {
            return { ...item, id: item.productId || item.id }
          }
          const alreadyLabeled = (item.name || '').includes('(BONIFICACIÓN)')
          const bonif = {
            ...item,
            id: item.productId || item.id,
            cartId: `mesa-bonif-${idx}`, // id único: evita fusionarse con un item facturable del mismo producto
            price: 0,
            basePrice: 0,
            total: 0,
            isBonificacion: true,
            taxAffectation: '30', // Inafecto (las bonificaciones no gravan IGV)
            name: alreadyLabeled ? item.name : `${item.name} (BONIFICACIÓN)`,
          }
          // No arrastrar las marcas de cortesía de la mesa al comprobante
          delete bonif.originalPrice
          delete bonif.originalTotal
          delete bonif.isCourtesy
          delete bonif.courtesyReason
          delete bonif.courtesyMarkedAt
          delete bonif.courtesyMarkedBy
          return bonif
        })
        setCart(cartItems)
        const courtesyCount = tableInfo.items.length - billableSourceItems.length
        const toastMsg = courtesyCount > 0
          ? `Mesa ${tableInfo.tableNumber} cargada - ${cartItems.length} items (${courtesyCount} bonificación${courtesyCount > 1 ? 'es' : ''})`
          : `Mesa ${tableInfo.tableNumber} cargada - ${cartItems.length} items`
        toast.success(toastMsg)

        // Cargar descuento global aplicado en la precuenta (si existe)
        if (tableInfo.discount && tableInfo.discount.value > 0) {
          const billableItemsTotal = billableSourceItems.reduce((sum, it) => sum + (it.total || 0), 0)
          if (tableInfo.discount.type === 'percent') {
            const pct = Math.min(parseFloat(tableInfo.discount.value) || 0, 100)
            setDiscountPercentage(pct.toString())
            const amount = (billableItemsTotal * pct / 100)
            setDiscountAmount(amount.toFixed(2))
          } else {
            const amount = Math.min(parseFloat(tableInfo.discount.value) || 0, billableItemsTotal)
            setDiscountAmount(amount.toFixed(2))
            if (billableItemsTotal > 0) {
              setDiscountPercentage(((amount / billableItemsTotal) * 100).toFixed(2))
            }
          }
        }
      }

      // Limpiar el state de navegación para evitar recarga
      navigate(location.pathname, { replace: true, state: null })
    }

    // Detectar si viene del Folio de una reserva de hotel y cargar cargos como items
    if (location.state?.fromFolio && !folioLoadedRef.current) {
      const folioInfo = location.state
      folioLoadedRef.current = true

      // Cargar items al carrito (cada cargo del folio = un item con precio = amount y quantity = 1)
      if (Array.isArray(folioInfo.items) && folioInfo.items.length > 0) {
        const cartItems = folioInfo.items.map((ch, idx) => ({
          id: `folio-${ch.id || idx}`,
          productId: null,
          code: '',
          name: ch.description || 'Cargo',
          price: Number(ch.amount || 0),
          quantity: 1,
          unit: 'ZZ',
          stock: null,
          fromFolio: true,
          folioChargeId: ch.id,
        }))
        setCart(cartItems)
        // Guardar los IDs de cargo en una ref independiente del cart (sobrevive a edits)
        pendingFolioChargeIdsRef.current = folioInfo.items
          .map(ch => ch.id)
          .filter(Boolean)
      }

      // Precargar datos del cliente (huésped)
      if (folioInfo.customer) {
        const c = folioInfo.customer
        setCustomerData(prev => ({
          ...prev,
          documentType: c.documentType || prev.documentType,
          documentNumber: c.documentNumber || '',
          name: c.name || '',
          businessName: c.businessName || '',
          email: c.email || '',
          phone: c.phone || '',
          address: c.address || '',
        }))
      }

      // Nota con referencia a la reserva
      if (folioInfo.reservationNote) {
        toast.success(folioInfo.reservationNote)
      } else if (folioInfo.items?.length > 0) {
        toast.success(`Folio cargado · ${folioInfo.items.length} cargo${folioInfo.items.length > 1 ? 's' : ''}`)
      }

      navigate(location.pathname, { replace: true, state: null })
    }

    // Detectar si viene de una orden (para llevar/delivery) y cargar items
    if (location.state?.fromOrder && !orderLoadedRef.current) {
      const orderInfo = location.state

      // Marcar como cargado para evitar duplicados
      orderLoadedRef.current = true

      // Guardar info de la orden para marcar como pagada al completar
      if (orderInfo.orderId) {
        setPendingOrderId(orderInfo.orderId)
        setMarkOrderPaidOnComplete(orderInfo.markAsPaidOnComplete || false)
      }

      // Si la orden está asociada a una mesa, guardar info de mesa para que se libere
      // automáticamente al completar el pago (restaura comportamiento previo).
      if (orderInfo.tableId) {
        setTableData({
          tableId: orderInfo.tableId,
          tableNumber: orderInfo.tableNumber || null,
          orderId: orderInfo.orderId,
          waiterId: orderInfo.waiterId || null,
          waiterName: orderInfo.waiterName || null,
        })
      }

      // Establecer tipo de orden
      setOrderType(orderInfo.orderType || 'takeaway')

      // Forzar la sede (y su almacén) a la de la orden, para cobrar/descontar stock en la sucursal correcta
      if ('branchId' in orderInfo) {
        setPendingBranchSelection({ branchId: orderInfo.branchId ?? null })
      }

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

    // Detectar si viene de una cotización y cargar items
    if (location.state?.fromQuotation && !quotationLoadedRef.current) {
      const quotationInfo = location.state

      // Marcar como cargado para evitar duplicados
      quotationLoadedRef.current = true

      // Guardar info de la cotización para marcar como convertida al completar
      if (quotationInfo.quotationId) {
        setPendingQuotationId(quotationInfo.quotationId)
      }

      // Cargar items de la cotización al carrito.
      // IMPORTANTE: preservar metadata de variante (isVariant, variantSku, variantAttributes).
      // Sin estos campos, al emitir la venta el descuento de stock cae al stock general
      // del producto en vez de descontar de la variante específica → bug reportado.
      if (quotationInfo.items && quotationInfo.items.length > 0) {
        const cartItems = quotationInfo.items.map(item => ({
          id: item.productId || item.id || `temp-${Date.now()}-${Math.random()}`,
          productId: item.productId || '',
          name: item.name || '',
          description: item.description || '',
          price: item.unitPrice || item.price || 0,
          quantity: item.quantity || 1,
          unit: item.unit || 'NIU',
          code: item.code || '',
          observations: item.observations || '',
          ...(item.isVariant && {
            isVariant: true,
            variantSku: item.variantSku || '',
            variantAttributes: item.variantAttributes || {},
          }),
          ...(item.presentationName && {
            presentationName: item.presentationName,
            presentationFactor: item.presentationFactor || 1,
          }),
        }))
        setCart(cartItems)
      }

      // Cargar datos del cliente si existe
      if (quotationInfo.customer) {
        const customer = quotationInfo.customer
        // Buscar si el cliente existe en la lista
        const existingCustomer = customers.find(
          c => c.documentNumber === customer.documentNumber
        )
        if (existingCustomer) {
          setSelectedCustomer(existingCustomer)
        } else {
          // Usar los datos del cliente de la cotización
          setSelectedCustomer({
            id: customer.id || null,
            name: customer.name || '',
            businessName: customer.businessName || '',
            documentType: inferDocumentType(customer.documentType, customer.documentNumber),
            documentNumber: customer.documentNumber || '',
            email: customer.email || '',
            phone: customer.phone || '',
            address: customer.address || '',
          })
        }
        // También llenar el formulario (customerData): el formulario lee de customerData,
        // no de selectedCustomer, así que sin esto los campos salen vacíos al convertir.
        setCustomerData(prev => ({
          ...prev,
          documentType: inferDocumentType(customer.documentType, customer.documentNumber),
          documentNumber: customer.documentNumber || '',
          name: customer.name || '',
          businessName: customer.businessName || '',
          address: customer.address || '',
          email: customer.email || '',
          phone: customer.phone || '',
        }))
      }

      // Cargar observaciones de la cotización
      if (quotationInfo.notes) {
        setGeneralNotes(quotationInfo.notes)
      }

      // Cargar descuento de la cotización
      if (quotationInfo.discount && quotationInfo.discount > 0) {
        if (quotationInfo.discountType === 'percentage') {
          setDiscountPercentage(quotationInfo.discount.toString())
          // Calcular monto basado en el total de items
          const totalItems = (quotationInfo.items || []).reduce((sum, item) => sum + (item.unitPrice || item.price || 0) * (item.quantity || 1), 0)
          const amount = (totalItems * quotationInfo.discount / 100).toFixed(2)
          setDiscountAmount(amount)
        } else {
          setDiscountAmount(quotationInfo.discount.toString())
        }
      }

      // Si el cliente tiene RUC (11 dígitos), seleccionar factura automáticamente
      if (quotationInfo.customer?.documentNumber?.length === 11) {
        setDocumentType('factura')
      }

      // Multi-divisa: heredar moneda y TC de la cotización (si la flag
      // está activa). El cajero podrá ajustar el TC antes de cobrar.
      if (posMultiCurrencyOn && quotationInfo.currency) {
        const qCcy = normalizeCurrency(quotationInfo.currency)
        setCurrency(qCcy)
        if (qCcy === 'USD') {
          const r = Number(quotationInfo.exchangeRate)
          if (Number.isFinite(r) && r > 0) {
            setExchangeRate(r)
            setExchangeRateSource('manual')
          }
        }
      }

      toast.success(`Cotización ${quotationInfo.quotationNumber} cargada - ${quotationInfo.items?.length || 0} items. Revisa y completa la venta.`)

      // Limpiar el state de navegación para evitar recarga
      navigate(location.pathname, { replace: true, state: null })
    }

    // Detectar si viene de un pedido online (tienda virtual retail) o de Rappi y cargar items + cliente
    const isFromOnlineOrder = location.state?.fromOnlineOrder
    const isFromRappiOrder = location.state?.fromRappiOrder
    if ((isFromOnlineOrder || isFromRappiOrder) && !onlineOrderLoadedRef.current) {
      const info = location.state
      onlineOrderLoadedRef.current = true

      // Guardar orderId para marcarlo como completado al finalizar la venta
      if (info.orderId) {
        setPendingOrderId(info.orderId)
        setMarkOnlineOrderCompleteOnSale(true)
      }

      // Cargar items al carrito
      if (Array.isArray(info.items) && info.items.length > 0) {
        const cartItems = info.items.map(item => ({
          id: item.productId || item.id || `temp-${Date.now()}-${Math.random()}`,
          productId: item.productId || '',
          name: item.name || '',
          price: item.price || 0,
          quantity: item.quantity || 1,
          unit: item.unit || 'NIU',
          code: item.code || item.sku || '',
          ...(item.isVariant && {
            isVariant: true,
            variantSku: item.variantSku,
            variantAttributes: item.variantAttributes,
          }),
        }))
        setCart(cartItems)
      }

      // Cargar datos del cliente (siempre inline — son datos del catálogo público)
      if (info.customer) {
        const c = info.customer
        setCustomerData(prev => ({
          ...prev,
          name: c.name || '',
          email: c.email || '',
          phone: c.phone || '',
          address: c.address || '',
        }))
        setSelectedCustomer({
          id: null,
          name: c.name || '',
          businessName: '',
          documentType: c.documentType || 'dni',
          documentNumber: c.documentNumber || '',
          email: c.email || '',
          phone: c.phone || '',
          address: c.address || '',
        })
      }

      if (info.notes) {
        setGeneralNotes(info.notes)
      }

      const orderLabel = isFromRappiOrder
        ? `Pedido Rappi #${info.rappiOrderId || ''}`
        : `Pedido online #${info.orderNumber || ''}`
      toast.success(`${orderLabel} cargado · ${info.items?.length || 0} items`)

      navigate(location.pathname, { replace: true, state: null })
    }

    // Detectar si viene de una nota de venta y cargar items
    if (location.state?.fromNotaVenta && !notaVentaLoadedRef.current) {
      const notaVentaInfo = location.state

      // Marcar como cargado para evitar duplicados
      notaVentaLoadedRef.current = true

      // Guardar info de la(s) nota(s) de venta para marcar como convertida(s) al completar
      if (notaVentaInfo.notaVentaIds) {
        // Múltiples notas de venta
        setPendingNotaVentaIds(notaVentaInfo.notaVentaIds)
      } else if (notaVentaInfo.notaVentaId) {
        // Una sola nota de venta (compatibilidad)
        setPendingNotaVentaIds([notaVentaInfo.notaVentaId])
      }

      // Cargar items de la nota de venta al carrito
      if (notaVentaInfo.items && notaVentaInfo.items.length > 0) {
        const cartItems = notaVentaInfo.items.map(item => ({
          id: item.productId || item.id || `temp-${Date.now()}-${Math.random()}`,
          productId: item.productId || '',
          name: item.name || '',
          description: item.description || '',
          price: item.unitPrice || item.price || 0,
          quantity: item.quantity || 1,
          unit: item.unit || 'NIU',
          code: item.code || '',
          observations: item.observations || '',
          taxAffectation: taxConfig.igvExempt ? '20' : (item.taxAffectation || '10'),
          itemDiscount: item.itemDiscount || 0,
          notes: item.notes || '',
          presentationName: item.presentationName || '',
          presentationFactor: item.presentationFactor || 1,
          batchNumber: item.batchNumber || '',
          batchExpiryDate: item.batchExpiryDate || '',
        }))
        setCart(cartItems)
      }

      // Cargar datos del cliente en el formulario (customerData)
      if (notaVentaInfo.customer) {
        const customer = notaVentaInfo.customer
        // Buscar si el cliente existe en la lista
        const existingCustomer = customers.find(
          c => c.documentNumber === customer.documentNumber
        )
        if (existingCustomer) {
          setSelectedCustomer(existingCustomer)
        }
        // Siempre llenar los campos del formulario
        setCustomerData({
          documentType: inferDocumentType(customer.documentType, customer.documentNumber),
          documentNumber: customer.documentNumber || '',
          name: customer.name || '',
          businessName: customer.businessName || '',
          address: customer.address || '',
          email: customer.email || '',
          phone: customer.phone || '',
          studentName: customer.studentName || '',
          studentSchedule: customer.studentSchedule || '',
          petName: getPrimaryPet(customer)?.name || customer.petName || '',
          vehiclePlate: customer.vehiclePlate || '',
          vehicleModel: customer.vehicleModel || '',
          vehicleYear: customer.vehicleYear || '',
          originAddress: customer.originAddress || '',
          destinationAddress: customer.destinationAddress || '',
          tripDetail: customer.tripDetail || '',
          serviceReferenceValue: customer.serviceReferenceValue || '',
          effectiveLoadValue: customer.effectiveLoadValue || '',
          usefulLoadValue: customer.usefulLoadValue || '',
        })
      }

      // Cargar método de pago (convertir del formato guardado al formato del formulario)
      if (notaVentaInfo.payments && notaVentaInfo.payments.length > 0) {
        const formPayments = notaVentaInfo.payments.map(p => ({
          method: p.methodKey || Object.keys(PAYMENT_METHODS).find(k => PAYMENT_METHODS[k] === p.method) || '',
          amount: p.amount ? p.amount.toString() : '',
        }))
        setPayments(formPayments)
      } else if (notaVentaInfo.paymentMethod) {
        const methodKey = Object.keys(PAYMENT_METHODS).find(k => PAYMENT_METHODS[k] === notaVentaInfo.paymentMethod) || ''
        setPayments([{ method: methodKey, amount: '' }])
      }

      // Cargar notas generales
      if (notaVentaInfo.notes) {
        setGeneralNotes(notaVentaInfo.notes)
      }

      // Cargar descuento global (solo si hay porcentaje de descuento global)
      // NOTA: invoice.discount incluye item discounts + global, no sirve para esto.
      // Los descuentos por ítem ya se cargan en cada item del carrito (itemDiscount).
      // Solo cargamos el descuento general si discountPercentage > 0.
      if (notaVentaInfo.discountPercentage && notaVentaInfo.discountPercentage > 0) {
        setDiscountPercentage(notaVentaInfo.discountPercentage.toString())
        const subtotal = (notaVentaInfo.items || []).reduce((sum, item) => sum + ((item.unitPrice || item.price || 0) * (item.quantity || 1)), 0)
        if (subtotal > 0) {
          const amount = ((subtotal * notaVentaInfo.discountPercentage) / 100).toFixed(2)
          setDiscountAmount(amount)
        }
      }

      // Cargar vendedor si existe
      if (notaVentaInfo.sellerId) {
        const seller = sellers.find(s => s.id === notaVentaInfo.sellerId)
        if (seller) {
          setSelectedSeller(seller)
        }
      }

      toast.success(`Nota de Venta ${notaVentaInfo.notaVentaNumber} cargada - ${notaVentaInfo.items?.length || 0} items. Selecciona Boleta o Factura y completa la venta.`)

      // Limpiar el state de navegación para evitar recarga
      navigate(location.pathname, { replace: true, state: null })
    }

    // Detectar si viene de una guía de remisión (esperar a que products esté cargado).
    // Usamos !productsLoading en vez de products.length > 0 para que también funcione
    // cuando el negocio no tiene productos en catálogo y la guía solo lleva items manuales.
    if (location.state?.fromDispatchGuide && !dispatchGuideLoadedRef.current && !productsLoading) {
      const guideInfo = location.state
      dispatchGuideLoadedRef.current = true

      // Cargar items de la guía al carrito con precios del producto
      if (guideInfo.items && guideInfo.items.length > 0) {
        const cartItems = guideInfo.items.map((item, idx) => {
          const product = item.productId ? products.find(p => p.id === item.productId) : null
          return {
            id: product?.id || `guide-${Date.now()}-${idx}`,
            productId: item.productId || '',
            name: item.name || '',
            description: item.description || '',
            price: product?.price || item.price || 0,
            quantity: item.quantity || 1,
            unit: item.unit || 'NIU',
            code: item.code || product?.sku || product?.code || '',
            sku: product?.sku || item.code || '',
            marca: item.marca || product?.marca || '',
            laboratoryName: item.laboratoryName || product?.laboratoryName || '',
            batchNumber: item.batchNumber || '',
            batchExpiryDate: item.batchExpiryDate || '',
            taxAffectation: product?.taxAffectation || '10',
          }
        })
        setCart(cartItems)
      }

      // Cargar datos del destinatario como cliente
      if (guideInfo.customer) {
        const customer = guideInfo.customer
        const existingCustomer = customers.find(
          c => c.documentNumber === customer.documentNumber
        )
        if (existingCustomer) {
          setSelectedCustomer(existingCustomer)
        } else {
          setSelectedCustomer({
            id: null,
            name: customer.name || '',
            businessName: customer.businessName || '',
            documentType: inferDocumentType(customer.documentType, customer.documentNumber),
            documentNumber: customer.documentNumber || '',
            email: customer.email || '',
            phone: customer.phone || '',
            address: customer.address || '',
          })
        }
      }

      // Cargar número de guía en el campo de referencia
      if (guideInfo.guideNumber) {
        setGuideNumber(guideInfo.guideNumber)
      }

      // Si la guía ya descontó stock, marcar para que la factura no lo descuente de nuevo
      if (guideInfo.guideId) {
        setSourceDispatchGuide({
          id: guideInfo.guideId,
          number: guideInfo.guideNumber || '',
          stockAlreadyDeducted: !!guideInfo.stockAlreadyDeducted,
        })
      }

      // Si el destinatario tiene RUC, seleccionar factura
      if (guideInfo.customer?.documentNumber?.length === 11) {
        setDocumentType('factura')
      }

      const stockMsg = guideInfo.stockAlreadyDeducted ? ' (stock ya descontado por la guía, no se descontará de nuevo)' : ''
      toast.success(`Guía ${guideInfo.guideNumber} cargada - ${guideInfo.items?.length || 0} items.${stockMsg} Completa los precios y emite la factura.`)

      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, customers, products, productsLoading])

  // Cargar documento para edición o duplicación si viene en la URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const editId = searchParams.get('editInvoiceId')
    const duplicateId = searchParams.get('duplicateInvoiceId')

    if (editId && !editInvoiceLoadedRef.current && user?.uid) {
      editInvoiceLoadedRef.current = true
      loadInvoiceForEdit(editId)
    } else if (duplicateId && !editInvoiceLoadedRef.current && user?.uid) {
      editInvoiceLoadedRef.current = true
      loadInvoiceForDuplicate(duplicateId)
    }
  }, [location.search, user])

  // Función para cargar documento a editar
  const loadInvoiceForEdit = async (invoiceId) => {
    try {
      setIsLoading(true)
      const businessId = getBusinessId()

      // Obtener el documento directamente de Firestore
      const { doc, getDoc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')

      const invoiceRef = doc(db, 'businesses', businessId, 'invoices', invoiceId)
      const invoiceSnap = await getDoc(invoiceRef)

      if (!invoiceSnap.exists()) {
        toast.error('No se pudo cargar el documento para editar')
        appNavigate('facturas')
        return
      }

      const invoice = { id: invoiceSnap.id, ...invoiceSnap.data() }

      // Verificar que no haya sido aceptado por SUNAT
      if (invoice.sunatStatus === 'accepted') {
        toast.error('Este documento ya fue aceptado por SUNAT y no puede editarse')
        appNavigate('facturas')
        return
      }

      // Guardar datos originales
      setEditingInvoiceId(invoiceId)
      setEditingInvoiceData(invoice)

      // Restaurar moneda y tipo de cambio del comprobante (multi-divisa).
      // Sin esto, un comprobante en USD se abría en PEN y, al cambiar a USD,
      // los precios se recalculaban por el TC (se "bajaban"). Honramos la
      // moneda original; el basePrice (PEN) por ítem queda como fuente de verdad.
      const invoiceCurrency = normalizeCurrency(invoice.currency || 'PEN')
      setCurrency(invoiceCurrency)
      if (invoiceCurrency === 'USD') {
        const savedRate = Number(invoice.exchangeRate) || 0
        if (savedRate > 1) {
          setExchangeRate(savedRate)
          setExchangeRateInput(String(savedRate))
          setExchangeRateSource('manual')
        }
      }

      // Desbloquear UI para edición (por si venía de una venta completada)
      setSaleCompleted(false)

      // Cargar datos en el formulario
      setDocumentType(invoice.documentType)

      // Cargar cliente
      setCustomerData({
        documentType: inferDocumentType(invoice.customer?.documentType, invoice.customer?.documentNumber),
        documentNumber: invoice.customer?.documentNumber || '',
        businessName: invoice.customer?.businessName || '',
        name: invoice.customer?.name || '',
        address: invoice.customer?.address || '',
        email: invoice.customer?.email || '',
        phone: invoice.customer?.phone || '',
        studentName: invoice.customer?.studentName || '',
        studentSchedule: invoice.customer?.studentSchedule || '',
        petName: invoice.customer?.petName || '',
        vehiclePlate: invoice.customer?.vehiclePlate || '',
        vehicleModel: invoice.customer?.vehicleModel || '',
        vehicleYear: invoice.customer?.vehicleYear || '',
        originAddress: invoice.customer?.originAddress || '',
        destinationAddress: invoice.customer?.destinationAddress || '',
        tripDetail: invoice.customer?.tripDetail || '',
        serviceReferenceValue: invoice.customer?.serviceReferenceValue || '',
        effectiveLoadValue: invoice.customer?.effectiveLoadValue || '',
        usefulLoadValue: invoice.customer?.usefulLoadValue || '',
      })

      // Cargar items al carrito.
      // IMPORTANTE: el campo se llama `itemDiscount` en Firestore (no `discount`).
      // También hay que rehidratar taxAffectation/igvRate/code/sku para que los
      // recálculos del POS (incluida la detección de bonificación) reflejen el original.
      const cartItems = (invoice.items || []).map((item, index) => ({
        id: item.productId || `edit-item-${index}`,
        productId: item.productId,
        code: item.code || item.sku || '',
        sku: item.sku || item.code || '',
        name: item.name || item.description,
        description: item.description,
        price: item.unitPrice || item.price,
        // basePrice (PEN) = fuente de verdad multi-divisa. En comprobantes USD
        // se guardó el precio en soles; en PEN cae al propio precio. Necesario
        // para que cambiar de moneda recompute bien (no "baje" los precios).
        basePrice: Number(item.basePrice) > 0 ? Number(item.basePrice) : (Number(item.unitPrice ?? item.price) || 0),
        quantity: item.quantity,
        itemDiscount: item.itemDiscount || item.descuento || 0,
        itemDiscountType: item.itemDiscountType || 'amount',
        observations: item.observations || '',
        unit: item.unit || 'NIU',
        taxAffectation: item.taxAffectation || '10',
        igvRate: item.igvRate,
        igvType: item.igvType || 'gravado',
        ...(item.presentationName && { presentationName: item.presentationName, presentationFactor: item.presentationFactor }),
        ...(item.batchNumber && { batchNumber: item.batchNumber }),
        ...(item.batchExpiryDate && { batchExpiryDate: item.batchExpiryDate }),
        ...(item.serialNumber && { serialNumber: item.serialNumber }),
        ...(item.isVariant && { isVariant: true, variantSku: item.variantSku, variantAttributes: item.variantAttributes }),
        ...(item.modifiers && { modifiers: item.modifiers }),
        // Mantener referencia a datos originales
        originalItem: item,
      }))
      setCart(cartItems)

      // Cargar retención (si existe) y detracción
      setHasRetencion(!!invoice.hasRetencion)
      if (invoice.hasDetraction) {
        setHasDetraction(true)
        setDetractionType(invoice.detractionType || '')
        setDetractionBankAccount(invoice.detractionBankAccount || '')
      }

      // Cargar forma de pago (crédito/contado)
      if (invoice.paymentType) {
        setPaymentType(invoice.paymentType)
        if (invoice.paymentType === 'credito') {
          setPaymentDueDate(invoice.paymentDueDate || '')
          setPaymentInstallments(invoice.paymentInstallments || [])
        }
      }

      // Cargar métodos de pago del comprobante.
      // El payment guardado tiene { method: 'Efectivo' (label traducido), methodKey: 'CASH', amount: number }
      // El estado del POS espera { method: 'CASH' (key), amount: string }
      if (invoice.payments && invoice.payments.length > 0) {
        const formPayments = invoice.payments.map(p => ({
          method: p.methodKey || Object.keys(PAYMENT_METHODS).find(k => PAYMENT_METHODS[k] === p.method) || '',
          amount: p.amount != null ? p.amount.toString() : '',
        }))
        setPayments(formPayments)
      } else if (invoice.paymentMethod) {
        const methodKey = Object.keys(PAYMENT_METHODS).find(k => PAYMENT_METHODS[k] === invoice.paymentMethod) || ''
        setPayments([{ method: methodKey, amount: '' }])
      }

      // Cargar descuento global
      if (invoice.globalDiscount) {
        setDiscountAmount(invoice.globalDiscount.toString())
      }

      // Cargar fecha de emisión
      if (invoice.emissionDate) {
        if (invoice.emissionDate.toDate) {
          // Firestore Timestamp → convertir a fecha local
          setEmissionDate(getLocalDateString(invoice.emissionDate.toDate()))
        } else if (typeof invoice.emissionDate === 'string') {
          // Ya es string YYYY-MM-DD, usar directo (no pasar por new Date que parsea como UTC)
          setEmissionDate(invoice.emissionDate)
        } else {
          setEmissionDate(getLocalDateString(new Date(invoice.emissionDate)))
        }
        // Fecha cargada de un comprobante existente (edición): respetarla en el checkout.
        emissionDateEditedRef.current = true
      }

      // Cargar hora del evento (Meta Ads)
      if (invoice.metaEventTime) {
        const d = invoice.metaEventTime.toDate
          ? invoice.metaEventTime.toDate()
          : (invoice.metaEventTime.seconds ? new Date(invoice.metaEventTime.seconds * 1000) : new Date(invoice.metaEventTime))
        if (!isNaN(d.getTime())) {
          setMetaEventTime(getLocalDateTimeString(d))
        }
      }

      toast.info(`Editando ${invoice.documentType === 'factura' ? 'Factura' : 'Boleta'} ${invoice.series}-${invoice.number}`)

      // Limpiar URL sin recargar
      appNavigate('pos', { replace: true })

    } catch (error) {
      console.error('Error al cargar documento para editar:', error)
      toast.error('Error al cargar el documento')
      appNavigate('facturas')
    } finally {
      setIsLoading(false)
    }
  }

  // Función para duplicar un documento existente (pre-llenar POS sin vincular al original)
  const loadInvoiceForDuplicate = async (invoiceId) => {
    try {
      setIsLoading(true)
      const businessId = getBusinessId()

      const { doc, getDoc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')

      const invoiceRef = doc(db, 'businesses', businessId, 'invoices', invoiceId)
      const invoiceSnap = await getDoc(invoiceRef)

      if (!invoiceSnap.exists()) {
        toast.error('No se pudo cargar el documento para duplicar')
        appNavigate('facturas')
        return
      }

      const invoice = { id: invoiceSnap.id, ...invoiceSnap.data() }

      // Desbloquear UI (por si venía de una venta completada)
      setSaleCompleted(false)

      // NO setear editingInvoiceId/editingInvoiceData → es un documento NUEVO
      setEditingInvoiceId(null)
      setEditingInvoiceData(null)

      // Restaurar moneda y TC del comprobante original (multi-divisa), igual
      // que en edición: el duplicado debe nacer en la misma moneda y no
      // recalcular los precios por el TC.
      const invoiceCurrency = normalizeCurrency(invoice.currency || 'PEN')
      setCurrency(invoiceCurrency)
      if (invoiceCurrency === 'USD') {
        const savedRate = Number(invoice.exchangeRate) || 0
        if (savedRate > 1) {
          setExchangeRate(savedRate)
          setExchangeRateInput(String(savedRate))
          setExchangeRateSource('manual')
        }
      }

      // Cargar tipo de documento
      setDocumentType(invoice.documentType)

      // Cargar cliente
      setCustomerData({
        documentType: inferDocumentType(invoice.customer?.documentType, invoice.customer?.documentNumber),
        documentNumber: invoice.customer?.documentNumber || '',
        businessName: invoice.customer?.businessName || '',
        name: invoice.customer?.name || '',
        address: invoice.customer?.address || '',
        email: invoice.customer?.email || '',
        phone: invoice.customer?.phone || '',
        studentName: invoice.customer?.studentName || '',
        studentSchedule: invoice.customer?.studentSchedule || '',
        petName: invoice.customer?.petName || '',
        vehiclePlate: invoice.customer?.vehiclePlate || '',
        vehicleModel: invoice.customer?.vehicleModel || '',
        vehicleYear: invoice.customer?.vehicleYear || '',
        originAddress: invoice.customer?.originAddress || '',
        destinationAddress: invoice.customer?.destinationAddress || '',
        tripDetail: invoice.customer?.tripDetail || '',
        serviceReferenceValue: invoice.customer?.serviceReferenceValue || '',
        effectiveLoadValue: invoice.customer?.effectiveLoadValue || '',
        usefulLoadValue: invoice.customer?.usefulLoadValue || '',
      })

      // Cargar items al carrito (mismo mapeo que en loadInvoiceForEdit)
      const cartItems = (invoice.items || []).map((item, index) => ({
        id: item.productId || `dup-item-${index}`,
        productId: item.productId,
        code: item.code || item.sku || '',
        sku: item.sku || item.code || '',
        name: item.name || item.description,
        description: item.description,
        price: item.unitPrice || item.price,
        // basePrice (PEN) = fuente de verdad multi-divisa. En comprobantes USD
        // se guardó el precio en soles; en PEN cae al propio precio. Necesario
        // para que cambiar de moneda recompute bien (no "baje" los precios).
        basePrice: Number(item.basePrice) > 0 ? Number(item.basePrice) : (Number(item.unitPrice ?? item.price) || 0),
        quantity: item.quantity,
        itemDiscount: item.itemDiscount || item.descuento || 0,
        itemDiscountType: item.itemDiscountType || 'amount',
        observations: item.observations || '',
        unit: item.unit || 'NIU',
        taxAffectation: item.taxAffectation || '10',
        igvRate: item.igvRate,
        igvType: item.igvType || 'gravado',
        ...(item.presentationName && { presentationName: item.presentationName, presentationFactor: item.presentationFactor }),
        ...(item.batchNumber && { batchNumber: item.batchNumber }),
        ...(item.batchExpiryDate && { batchExpiryDate: item.batchExpiryDate }),
        ...(item.serialNumber && { serialNumber: item.serialNumber }),
        ...(item.isVariant && { isVariant: true, variantSku: item.variantSku, variantAttributes: item.variantAttributes }),
        ...(item.modifiers && { modifiers: item.modifiers }),
      }))
      setCart(cartItems)

      // Cargar retención (si existe) y detracción
      setHasRetencion(!!invoice.hasRetencion)
      if (invoice.hasDetraction) {
        setHasDetraction(true)
        setDetractionType(invoice.detractionType || '')
        setDetractionBankAccount(invoice.detractionBankAccount || '')
      }

      // Cargar forma de pago (crédito/contado)
      if (invoice.paymentType) {
        setPaymentType(invoice.paymentType)
        if (invoice.paymentType === 'credito') {
          setPaymentDueDate(invoice.paymentDueDate || '')
          setPaymentInstallments(invoice.paymentInstallments || [])
        }
      }

      // Cargar métodos de pago del comprobante original
      if (invoice.payments && invoice.payments.length > 0) {
        const formPayments = invoice.payments.map(p => ({
          method: p.methodKey || Object.keys(PAYMENT_METHODS).find(k => PAYMENT_METHODS[k] === p.method) || '',
          amount: p.amount != null ? p.amount.toString() : '',
        }))
        setPayments(formPayments)
      } else if (invoice.paymentMethod) {
        const methodKey = Object.keys(PAYMENT_METHODS).find(k => PAYMENT_METHODS[k] === invoice.paymentMethod) || ''
        setPayments([{ method: methodKey, amount: '' }])
      }

      // Cargar descuento global
      if (invoice.globalDiscount) {
        setDiscountAmount(invoice.globalDiscount.toString())
      }

      // Usar fecha de HOY (no la del documento original)
      setEmissionDate(getLocalDateString())
      // Usar hora actual para Meta Ads (no la del documento original)
      setMetaEventTime(getLocalDateTimeString())

      const docName = invoice.documentType === 'factura' ? 'Factura' : invoice.documentType === 'boleta' ? 'Boleta' : 'Nota de Venta'
      toast.success(`Comprobante duplicado. Revisa los datos y emite el nuevo ${docName}.`)

      // Limpiar URL sin recargar
      appNavigate('pos', { replace: true })

    } catch (error) {
      console.error('Error al duplicar documento:', error)
      toast.error('Error al cargar el documento para duplicar')
      appNavigate('facturas')
    } finally {
      setIsLoading(false)
    }
  }

  // Obtener el businessId actual para detectar cambios (fix: sub-usuarios)
  const currentBusinessId = getBusinessId()

  // Cargar datos iniciales (re-ejecutar cuando businessId cambie, ej: al cargar permisos del sub-usuario)
  useEffect(() => {
    loadInitialData()
  }, [user, currentBusinessId])

  // Productos en TIEMPO REAL: un listener (onSnapshot) mantiene el catálogo del POS
  // siempre fresco, así un cambio/renombre de producto hecho desde otra pestaña o
  // dispositivo se refleja al instante (sin tener que refrescar). En demo se usa demoData.
  //
  // PERF: con miles de productos la primera descarga del snapshot tarda 5-15s.
  // Para que el cajero NO espere, primero leemos el caché local (IndexedDB) de
  // la última sesión y mostramos esos productos al instante; el listener sigue
  // detrás y reemplaza el estado cuando llega el snapshot fresco. Tras cada
  // snapshot guardamos el caché para la próxima sesión.
  useEffect(() => {
    if (isDemoMode) return
    if (!user?.uid) return
    const businessId = getBusinessId()
    if (!businessId) return

    let cancelled = false
    setProductsLoading(true)

    // 1) Mostrar caché de inmediato (si existe) para que el cajero pueda buscar
    // mientras el snapshot fresco viene en background.
    getCachedProducts(businessId).then((cached) => {
      if (cancelled) return
      if (cached && cached.length > 0) {
        setProductsRaw(cached)
        setProductsLoading(false) // UX inmediata, aunque el listener siga sincronizando
      }
    }).catch(() => {})

    // 2) Suscripción en tiempo real (igual que antes). Cuando llega el primer
    // snapshot, reemplaza el estado y persiste al caché para la próxima vez.
    const unsubscribe = subscribeToProducts(businessId, (result) => {
      if (cancelled) return
      if (result.success) {
        const list = result.data || []
        setProductsRaw(list)
        // Fire-and-forget: no bloquear el snapshot por la escritura del caché.
        setCachedProducts(businessId, list).catch(() => {})
      }
      setProductsLoading(false)
    })

    return () => {
      cancelled = true
      if (typeof unsubscribe === 'function') unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, currentBusinessId, isDemoMode])

  const loadInitialData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        // Cargar datos de demo
        setProductsRaw(demoData.products || [])
        setCustomers(demoData.customers || [])
        setCompanySettings(demoData.business || null)
        setCategories(demoData.categories || [])
        // Almacenes de demo
        setWarehouses(demoData.warehouses || [])
        const defaultWarehouse = (demoData.warehouses || []).find(w => w.isDefault) || demoData.warehouses?.[0] || null
        setSelectedWarehouse(defaultWarehouse)
        setIsLoading(false)
        setProductsLoading(false)
        return
      }

      const businessId = getBusinessId()
      console.log('🛒 POS loadInitialData - businessId:', businessId, '| user.uid:', user?.uid)

      // FASE 1: Cargar configuración esencial primero (datos ligeros)
      const [
        settingsResult,
        categoriesResult,
        brandsResult,
        warehousesResult,
        branchesResult,
        sellersResult
      ] = await Promise.all([
        getCompanySettings(businessId),
        getProductCategories(businessId),
        getProductBrands(businessId),
        getWarehouses(businessId),
        getActiveBranches(businessId),
        getSellers(businessId)
      ])

      // Procesar configuración de empresa
      if (settingsResult.success && settingsResult.data) {
        const businessData = settingsResult.data
        setCompanySettings(businessData)

        // Pre-cargar logo en background para que esté listo al generar PDF
        if (businessData.logoUrl) {
          preloadLogo(businessData.logoUrl).catch(() => {})
        }

        // Establecer tipo de documento por defecto si está configurado y no hay borrador
        // IMPORTANTE: No sobrescribir si estamos en modo edición (editInvoiceId en URL)
        const searchParams = new URLSearchParams(location.search)
        const isEditingFromUrl = searchParams.get('editInvoiceId')

        if (!isEditingFromUrl) {
          const draftKey = `pos_draft_${businessId}`
          const savedDraft = localStorage.getItem(draftKey)
          const hasDraft = savedDraft && JSON.parse(savedDraft)?.cart?.length > 0

          // Solo aplicar el default si el usuario aún no cambió manualmente el tipo de documento.
          // Evita race condition: el usuario abre el POS, cambia a "Factura", y cuando termina
          // el fetch async de businessData se pisaba con "boleta" (default).
          // OJO: respetar los tipos permitidos del usuario. Si el default del negocio no está
          // permitido (ej: sub-usuario que solo emite Notas de Venta y el default es Boleta),
          // caer al primero permitido; si no, el <select> muestra un tipo pero el state queda
          // en otro inválido (desync: se ve "Nota de Venta" pero internamente es "boleta").
          if (!hasDraft && businessData.defaultDocumentType && !userChangedDocTypeRef.current) {
            const def = businessData.defaultDocumentType
            const safeDef = (allowedDocumentTypes && allowedDocumentTypes.length > 0 && !allowedDocumentTypes.includes(def))
              ? allowedDocumentTypes[0]
              : def
            setDocumentType(safeDef)
          }
        }

        // Cargar configuración de impuestos (taxConfig) desde emissionConfig
        const tc = businessData.emissionConfig?.taxConfig
        console.log('💰 taxConfig desde emissionConfig:', tc)
        if (tc) {
          const newTaxConfig = {
            igvRate: tc.igvRate === 10 ? 10.5 : (tc.igvRate ?? 18),
            igvExempt: tc.igvExempt ?? false,
            exemptionReason: tc.exemptionReason ?? '',
            exemptionCode: tc.exemptionCode ?? '10',
            taxType: tc.taxType || (tc.igvExempt ? 'exempt' : 'standard')
          }
          console.log('✅ TaxConfig a aplicar:', newTaxConfig)
          setTaxConfig(newTaxConfig)
        } else {
          console.warn('⚠️ taxConfig no existe en emissionConfig, usando valores por defecto')
        }

        // Cargar configuración de Recargo al Consumo (solo para restaurantes)
        if (businessData.restaurantConfig) {
          const rcConfig = {
            enabled: businessData.restaurantConfig.recargoConsumoEnabled ?? false,
            rate: businessData.restaurantConfig.recargoConsumoRate ?? 10
          }
          setRecargoConsumoConfig(rcConfig)
        }

        // Cargar configuración de Recargo por pago con tarjeta (Configuración > Ventas)
        setCardCommissionConfig({
          enabled: businessData.cardCommissionEnabled ?? false,
          rate: Number(businessData.cardCommissionRate) || 5,
        })

        // Verificar si la caja diaria está abierta (si el setting lo requiere)
        // Nota: calcular branchId aquí porque selectedBranch aún no se ha establecido en el estado
        if (businessData.requireOpenCashRegister) {
          const isSharedCashUser = userPermissions?.ownerId && !independentCashRegister
          const cashUserUid = isSharedCashUser ? null : (user?.uid || null)
          // Determinar branchId del usuario sin depender del estado
          const hasMainAccess = !allowedBranches || allowedBranches.length === 0 || allowedBranches.includes('main')
          let cashBranchId = null
          if (!hasMainAccess && branchesResult.success) {
            const userBranches = filterBranchesByAccess ? filterBranchesByAccess(branchesResult.data || []) : (branchesResult.data || [])
            if (userBranches.length > 0) {
              cashBranchId = userBranches[0].id
            }
          }
          const cashResult = await getCashRegisterSession(businessId, cashBranchId, cashUserUid)
          setCashRegisterOpen(cashResult.success && cashResult.data !== null)
        }

        // Inicializar pantalla de cliente (segunda pantalla) si está habilitada
        if (businessData.enableCustomerDisplay) {
          CustomerDisplay.initializeDisplay({
            primaryColor: businessData.pdfAccentColor || businessData.brandingColor || '#1e40af',
            accentColor: businessData.pdfAccentColor || businessData.brandingColor || '#f59e0b',
            companyName: businessData.companyName || businessData.businessName || '',
            logoUrl: businessData.logoUrl || '',
          })
        }
      }

      // Procesar categorías
      if (categoriesResult.success) {
        const migratedCategories = migrateLegacyCategories(categoriesResult.data || [])
        setCategories(migratedCategories)
      }

      // Procesar marcas administradas
      if (brandsResult?.success) {
        setBrands(brandsResult.data || [])
      }

      // Procesar almacenes y seleccionar el default
      let warehouseList = []
      if (warehousesResult.success) {
        const allWarehouses = warehousesResult.data || []
        warehouseList = filterWarehousesByAccess(allWarehouses)
        setWarehouses(warehouseList)
      }

      // Procesar sucursales
      if (branchesResult.success) {
        const allBranches = branchesResult.data || []
        const branchList = filterBranchesByAccess(allBranches)
        setBranches(branchList)

        const hasMainAccess = !allowedBranches || allowedBranches.length === 0 || allowedBranches.includes('main')

        // Sembrar la sucursal del POS desde el LOCAL ACTIVO global (selector del navbar),
        // para que una venta DIRECTA emita con la serie/almacén de esa sede. El cobro desde
        // mesa/orden la sobreescribe luego vía pendingBranchSelection (esa sede manda).
        const activeBranchObj = activeBranchId ? branchList.find(b => b.id === activeBranchId) : null

        if (activeBranchObj) {
          setSelectedBranch(activeBranchObj)
          const branchWarehouses = warehouseList.filter(w => w.isActive && w.branchId === activeBranchObj.id)
          if (branchWarehouses.length > 0) {
            setSelectedWarehouse(branchWarehouses.find(w => w.isDefault) || branchWarehouses[0])
          }
        } else if (hasMainAccess) {
          setSelectedBranch(null)
          const mainWarehouses = warehouseList.filter(w => w.isActive && !w.branchId)
          if (mainWarehouses.length > 0) {
            setSelectedWarehouse(mainWarehouses.find(w => w.isDefault) || mainWarehouses[0])
          } else if (warehouseList.length > 0) {
            setSelectedWarehouse(warehouseList.find(w => w.isDefault) || warehouseList[0])
          }
        } else if (branchList.length > 0) {
          setSelectedBranch(branchList[0])
          const branchWarehouses = warehouseList.filter(w => w.isActive && w.branchId === branchList[0].id)
          if (branchWarehouses.length > 0) {
            setSelectedWarehouse(branchWarehouses.find(w => w.isDefault) || branchWarehouses[0])
          }
        }
      } else {
        if (warehouseList.length > 0) {
          setSelectedWarehouse(warehouseList.find(w => w.isDefault) || warehouseList[0])
        }
      }

      // Procesar vendedores
      if (sellersResult.success) {
        const activeSellers = (sellersResult.data || []).filter(s => s.status === 'active')
        setSellers(activeSellers)
        if (assignedSellerId) {
          const assigned = activeSellers.find(s => s.id === assignedSellerId)
          if (assigned) setSelectedSeller(assigned)
        }
      }

      // FASE 2: Cargar clientes en background. Los PRODUCTOS ahora llegan por un
      // listener en tiempo real (onSnapshot) — ver el useEffect de suscripción — para
      // que ediciones/renombres se reflejen al instante sin refrescar el POS.
      setIsLoading(false)

      const customersResult = await getCustomers(businessId)
      if (customersResult.success) {
        setCustomers(customersResult.data || [])
      }
      return
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar los datos. Por favor, recarga la página.')
    } finally {
      setIsLoading(false)
    }
  }

  // Cargar datos de cita veterinaria desde sessionStorage (cuando viene de la Agenda)
  useEffect(() => {
    const appointmentDataStr = sessionStorage.getItem('appointmentData')
    if (appointmentDataStr && !pendingAppointmentData) {
      try {
        const appointmentData = JSON.parse(appointmentDataStr)
        if (appointmentData.fromAppointment) {
          console.log('🐾 POS: Cargando datos de cita veterinaria:', appointmentData)
          setPendingAppointmentData(appointmentData)

          // Pre-llenar datos del cliente
          setCustomerData(prev => ({
            ...prev,
            name: appointmentData.customerName || '',
            phone: appointmentData.phone || '',
            petName: appointmentData.petName || '',
          }))

          // Agregar servicios al carrito (cada servicio como ítem separado)
          const petSuffix = appointmentData.petName ? ` - ${appointmentData.petName}` : ''
          if (appointmentData.services && appointmentData.services.length > 0) {
            // Usar el array de servicios individuales
            const serviceItems = appointmentData.services.map((service, idx) => ({
              id: `appointment-${appointmentData.appointmentId}-${idx}-${Date.now()}`,
              code: service.code || 'SERVICIO-VET',
              name: `${service.name}${petSuffix}`,
              price: service.price || 0,
              quantity: 1,
              unit: 'ZZ',
              taxAffectation: '10',
              stock: null,
              isCustom: true,
            }))
            setCart(serviceItems)
          } else if (appointmentData.serviceName && appointmentData.servicePrice > 0) {
            // Fallback: cita antigua sin array de servicios
            const serviceItem = {
              id: `appointment-${appointmentData.appointmentId}-${Date.now()}`,
              code: 'SERVICIO-VET',
              name: `${appointmentData.serviceName}${petSuffix}`,
              price: appointmentData.servicePrice,
              quantity: 1,
              unit: 'ZZ',
              taxAffectation: '10',
              stock: null,
              isCustom: true,
            }
            setCart([serviceItem])
          }

          // Limpiar sessionStorage para evitar recargas
          sessionStorage.removeItem('appointmentData')
          toast.success(`Cita cargada: ${appointmentData.serviceName} - ${appointmentData.petName}`)
        }
      } catch (error) {
        console.error('Error al cargar datos de cita:', error)
        sessionStorage.removeItem('appointmentData')
      }
    }
  }, [isLoading]) // Se ejecuta cuando termina de cargar

  // Lazy: calcular en background qué productos con receta no tienen insumos
  // suficientes para preparar 1 unidad. Sólo cuando: (a) terminó la carga,
  // (b) `allowNegativeStock` está DESACTIVADO (si está activo, el dueño
  // aceptó vender sin stock, no hace falta el aviso), y (c) hay al menos
  // una receta configurada. Si el negocio no usa recetas, este efecto sale
  // sin hacer nada (cero overhead para el 80% de las cuentas).
  React.useEffect(() => {
    if (isLoading) return
    if (companySettings?.allowNegativeStock) {
      // Sin avisos cuando se permite vender en negativo.
      setProductsWithoutIngredients(prev => (prev.size === 0 ? prev : new Set()))
      return
    }
    const businessId = getBusinessId()
    if (!businessId || isDemoMode) return
    let cancelled = false
    // setTimeout(0) garantiza que esto se ejecuta DESPUÉS de pintar la grilla
    // del POS, no antes — la carga inicial no se ve afectada.
    const handle = setTimeout(async () => {
      if (cancelled) return
      const has = await hasAnyRecipe(businessId)
      if (cancelled || !has) return
      const warehouseId = selectedWarehouse?.id || null
      const result = await computeProductsWithoutIngredients(businessId, warehouseId)
      if (cancelled) return
      setProductsWithoutIngredients(result)
    }, 0)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [isLoading, companySettings?.allowNegativeStock, getBusinessId, isDemoMode, selectedWarehouse?.id, saleCompleted])

  // Lazy: cargar el costo (totalCost) de las recetas para poder CONGELAR el
  // costo del plato al momento de la venta (costAtSale). Igual que el efecto
  // de arriba: corre después del primer paint y sólo si la cuenta tiene
  // recetas → cero overhead para cuentas retail. En demo no aplica.
  React.useEffect(() => {
    if (isLoading || isDemoMode) return
    const businessId = getBusinessId()
    if (!businessId) return
    let cancelled = false
    const handle = setTimeout(async () => {
      if (cancelled) return
      const has = await hasAnyRecipe(businessId)
      if (cancelled || !has) return
      const result = await getRecipes(businessId)
      if (cancelled || !result?.success) return
      const map = new Map()
      for (const r of (result.data || [])) {
        if (r.productId) map.set(r.productId, Number(r.totalCost) || 0)
      }
      setRecipeCostMap(map)
    }, 0)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [isLoading, isDemoMode, getBusinessId, saleCompleted])

  // useDeferredValue mantiene el <input> responsivo aunque el filtro tarde.
  // React renderiza el input con la última tecla de inmediato, y el filter
  // se procesa "low priority" un tick después. Sensación instantánea con 4k+ productos.
  const deferredSearchTerm = useDeferredValue(searchTerm)

  // Índice de búsqueda pre-normalizado por producto. Se rearma SOLO cuando
  // cambian `products`, NO en cada keystroke. En cada tecla la búsqueda es un
  // `includes()` por producto en vez de re-normalizar 10 campos con NFD/regex
  // (que con 4k productos eran ~40k ops/tecla → cuelga el input).
  const productSearchIndex = React.useMemo(() => {
    const map = new Map()
    for (const p of products) {
      const code = p.code || ''
      const sku = p.sku || ''
      const variantTokens = (p.hasVariants && Array.isArray(p.variants))
        ? p.variants.flatMap(v => [v?.sku || '', (v?.sku || '').replace(/-/g, ''), v?.barcode || '']).filter(Boolean)
        : []
      const extraBarcodeTokens = Array.isArray(p.barcodes)
        ? p.barcodes.flatMap(b => [b || '', String(b || '').replace(/-/g, '')]).filter(Boolean)
        : []
      map.set(p.id, buildSearchHaystack(
        p.name,
        code,
        code.replace(/-/g, ''),
        sku,
        sku.replace(/-/g, ''),
        p.marca,
        p.laboratoryName,
        ...variantTokens,
        ...extraBarcodeTokens,
      ))
    }
    return map
  }, [products])

  // Optimizar filtrado de productos con useMemo
  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      // Excluir productos desactivados (isActive === false).
      // Si el campo no existe (undefined) se considera activo por retrocompatibilidad.
      if (p.isActive === false) return false
      const matchesSearch = matchesPrebuilt(deferredSearchTerm, productSearchIndex.get(p.id) || '')

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

      // Filtro de marca (managed brandId). "Sin marca" = sin brandId.
      let matchesBrand = true
      if (selectedBrandFilter !== 'all') {
        if (selectedBrandFilter === 'sin-marca') {
          matchesBrand = !p.brandId
        } else {
          matchesBrand = p.brandId === selectedBrandFilter
        }
      }

      // Filtro de stock: ocultar productos con stock 0 si está habilitado
      if (businessSettings?.posCustomFields?.hideOutOfStockInPOS && p.trackStock !== false) {
        let totalStock = 0
        if (p.hasVariants && p.variants?.length > 0) {
          if (selectedWarehouse) {
            totalStock = p.variants.reduce((sum, v) => {
              const ws = (v.warehouseStocks || []).find(ws => ws.warehouseId === selectedWarehouse.id)
              return sum + (ws?.stock || 0)
            }, 0)
          } else {
            totalStock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
          }
        } else {
          totalStock = selectedWarehouse
            ? getStockInWarehouse(p, selectedWarehouse.id)
            : (p.stock || 0)
        }
        if (totalStock <= 0) return false
      }

      return matchesSearch && matchesCategory && matchesBrand
    })
  }, [products, deferredSearchTerm, productSearchIndex, selectedCategoryFilter, selectedBrandFilter, categories, businessSettings?.posCustomFields?.hideOutOfStockInPOS, selectedWarehouse])

  // Cap del render para que el grid no explote en pantallas con miles de
  // productos. Antes al buscar mostraba TODAS las coincidencias (con 4k
  // productos podían ser 1000+ cards y el render se volvía pesado). Ahora:
  //  - Sin búsqueda: respeta `visibleProductsCount` (paginación clásica).
  //  - Con búsqueda: muestra al menos 60 resultados de una (suficiente para
  //    cubrir el caso típico) sin colapsar el render con 4k productos.
  // En ambos casos el botón "Ver más" sigue disponible para cargar el resto.
  const renderCap = React.useMemo(() => {
    // Opción de Configuración: mostrar SIEMPRE todos los productos (sin "Ver más").
    // Pensada para catálogos chicos (restaurantes, etc.). Se lee de companySettings
    // (mismo doc que autoPrint/autoReset) para evitar mismatch con businessSettings.
    if (companySettings?.showAllProductsInPOS) return Infinity
    return deferredSearchTerm.trim()
      ? Math.max(visibleProductsCount, 60)
      : visibleProductsCount
  }, [deferredSearchTerm, visibleProductsCount, companySettings?.showAllProductsInPOS])

  const displayedProducts = React.useMemo(() => {
    return filteredProducts.slice(0, renderCap)
  }, [filteredProducts, renderCap])

  const hasMoreProducts = filteredProducts.length > renderCap

  // Columnas del masonry repartidas round-robin (orden horizontal): el producto i
  // va a la columna i % N. Cada columna apila compacto (sin huecos) y con pocos
  // productos quedan al costado, no uno encima de otro.
  const productColumns = React.useMemo(() => {
    const cols = Array.from({ length: gridColumns }, () => [])
    displayedProducts.forEach((p, i) => cols[i % gridColumns].push(p))
    return cols
  }, [displayedProducts, gridColumns])

  const loadMoreProducts = () => {
    setVisibleProductsCount(prev => prev + PRODUCTS_PER_PAGE)
  }

  // "Ver todos": carga de una vez todo lo que queda (se usa con categoría seleccionada)
  const loadAllProducts = () => {
    setVisibleProductsCount(filteredProducts.length)
  }

  // Reset pagination when search or filter changes
  useEffect(() => {
    if (searchTerm || selectedCategoryFilter !== 'all' || selectedBrandFilter !== 'all') {
      setVisibleProductsCount(12) // Reset to initial
    }
  }, [searchTerm, selectedCategoryFilter, selectedBrandFilter])

  // Sincronizar la expansión de la rama de subcategorías con la categoría seleccionada.
  // - "Todas" o "Sin categoría" → colapsar todo.
  // - Raíz con subcategorías → expandir esa raíz.
  // - Subcategoría → expandir su raíz padre.
  useEffect(() => {
    if (!selectedCategoryFilter || selectedCategoryFilter === 'all' || selectedCategoryFilter === 'sin-categoria') {
      setExpandedRootCategoryId(null)
      return
    }
    const cat = categories.find(c => c.id === selectedCategoryFilter)
    if (!cat) return
    if (cat.parentId) {
      setExpandedRootCategoryId(cat.parentId)
    } else {
      const hasSubs = getSubcategories(categories, cat.id).length > 0
      setExpandedRootCategoryId(hasSubs ? cat.id : null)
    }
  }, [selectedCategoryFilter, categories])

  // Detector global de pistola lectora: captura escaneos aunque el buscador no tenga foco.
  // Pistolas USB tipo "keyboard wedge" escriben donde está el cursor — si el foco está en otro
  // botón/elemento no editable, los caracteres se perderían. Aquí los acumulamos y, si detectamos
  // la firma típica de un scanner (chars muy rápidos terminados en Enter), volcamos al buscador
  // para que el flujo de auto-agregado existente los procese. Si el usuario está escribiendo en
  // un input/textarea (cliente, DNI, etc.) no interferimos.
  useEffect(() => {
    if (saleCompleted) return
    let buffer = ''
    let firstCharTime = 0
    let lastCharTime = 0
    let resetTimer = null

    const handleKeyDown = (e) => {
      const active = document.activeElement
      const tag = active?.tagName
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active?.isContentEditable
      // Si el usuario está editando otro campo, el flujo nativo del input maneja el escaneo.
      if (isEditable) { buffer = ''; firstCharTime = 0; return }

      const now = Date.now()

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          const elapsed = lastCharTime - firstCharTime
          const avgPerChar = buffer.length > 1 ? elapsed / (buffer.length - 1) : 0
          // Velocidad humana típica: >80ms/char. Scanner: <30ms/char. Umbral 50ms.
          if (avgPerChar < 50) {
            e.preventDefault()
            setSearchTerm(buffer)
            // Marca que esto vino de la pistola (detector global): si el código no
            // existe, el auto-agregado mostrará el aviso de "no registrado".
            scanSubmitRef.current = true
            // En desktop con mouse, llevar el foco al buscador para que el
            // cajero pueda continuar editando con teclado. En tablets evitar
            // el focus para no abrir el teclado virtual — la pistola escribe
            // vía keydown global, no necesita que el input esté enfocado.
            const hasFinePointer = typeof window !== 'undefined'
              && window.matchMedia?.('(pointer: fine)').matches
            if (hasFinePointer) {
              searchInputRef.current?.focus()
            }
          }
        }
        buffer = ''
        firstCharTime = 0
        return
      }

      // Solo caracteres imprimibles sin modificadores.
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return

      if (buffer === '') firstCharTime = now
      buffer += e.key
      lastCharTime = now

      // Si pasan >300ms sin completar, descartar el buffer (era tipeo humano, no scanner).
      clearTimeout(resetTimer)
      resetTimer = setTimeout(() => { buffer = ''; firstCharTime = 0 }, 300)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearTimeout(resetTimer)
    }
  }, [saleCompleted])

  // Auto-agregar producto cuando se escanea código de barras o SKU
  // Debounce de 500ms para evitar que códigos cortos (ej: L34) se agreguen
  // antes de terminar de escribir códigos más largos (ej: L340)
  useEffect(() => {
    // Solo ejecutar si hay un término de búsqueda
    if (!searchTerm || searchTerm.length < 3) return

    const timer = setTimeout(() => {
      // ¿Vino de la pistola (detector global)? Consumimos la bandera.
      const wasGunScan = scanSubmitRef.current
      scanSubmitRef.current = false
      // Buscar productos que coincidan exactamente con el código de barras o SKU
      // También comparar sin guiones para compatibilidad con pistola lectora
      const searchLower = searchTerm.toLowerCase()
      const searchNoHyphens = searchLower.replace(/-/g, '')

      // 1) Match en padre (producto sin variantes o código del padre)
      //    Incluye `barcodes[]`: lista de códigos adicionales para el mismo producto
      //    (ej. múltiples EANs apuntan al mismo stock).
      const exactMatches = products.filter(p => {
        if (p.isActive === false) return false
        const code = p.code?.toLowerCase() || ''
        const sku = p.sku?.toLowerCase() || ''
        if (code === searchLower || sku === searchLower ||
          code.replace(/-/g, '') === searchNoHyphens || sku.replace(/-/g, '') === searchNoHyphens) {
          return true
        }
        if (Array.isArray(p.barcodes) && p.barcodes.length > 0) {
          return p.barcodes.some(bc => {
            const b = String(bc || '').toLowerCase()
            return b === searchLower || b.replace(/-/g, '') === searchNoHyphens
          })
        }
        return false
      })

      // 2) Si no hubo match en padre, buscar match exacto en SKU/barcode de variantes
      let variantMatch = null
      if (exactMatches.length === 0) {
        for (const p of products) {
          if (p.isActive === false) continue
          if (!p.hasVariants || !Array.isArray(p.variants)) continue
          const v = p.variants.find(v => {
            if (!v) return false
            const vSku = (v.sku || '').toLowerCase()
            const vBarcode = (v.barcode || '').toLowerCase()
            return vSku === searchLower || vBarcode === searchLower ||
              vSku.replace(/-/g, '') === searchNoHyphens
          })
          if (v) { variantMatch = { product: p, variant: v }; break }
        }
      }

      if (variantMatch) {
        const { product, variant } = variantMatch
        if (variant.stock !== null && variant.stock <= 0 && !companySettings?.allowNegativeStock) {
          toast.error(`Variante de ${product.name} sin stock`)
        } else {
          addVariantToCart(product, variant)
          setSearchTerm('')
          toast.success(`${product.name} agregado al carrito`)
        }
        return
      }

      // Si hay exactamente una coincidencia exacta por código, agregarlo automáticamente
      if (exactMatches.length === 1) {
        const product = exactMatches[0]

        // Verificar que el producto tenga stock disponible en el almacén seleccionado.
        // IMPORTANTE: Usar getTotalAvailableStock (no getStockInWarehouse) para que
        // incluya el "stock huérfano" — productos cuyo stock total existe pero no
        // está formalmente asignado al almacén. Esto unifica el comportamiento con
        // el escaneo por cámara (handleScanBarcode → getCurrentWarehouseStock) que
        // ya consideraba el huérfano. Antes la pistola Bluetooth rechazaba como
        // "sin stock" productos que la cámara sí podía vender.
        const warehouseStock = selectedWarehouse
          ? getTotalAvailableStock(product, selectedWarehouse.id)
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

      // No se encontró ningún producto con ese código. Si vino de la pistola
      // (detector global), avisar con un modal para que el cajero se detenga.
      if (exactMatches.length === 0 && !variantMatch && wasGunScan && products.length > 0) {
        setUnknownScanCode(searchTerm)
        setSearchTerm('')
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchTerm, products, companySettings, selectedWarehouse])

  // ¿Existe algún producto/variante con este código EXACTO (code/SKU/barcode)?
  // Se usa para avisar cuando la pistola pega/escanea un código no registrado.
  const codeExists = (term) => {
    const searchLower = String(term || '').toLowerCase().trim()
    if (!searchLower) return false
    const searchNoHyphens = searchLower.replace(/-/g, '')
    return products.some(p => {
      if (p.isActive === false) return false
      const code = p.code?.toLowerCase() || ''
      const sku = p.sku?.toLowerCase() || ''
      if (code === searchLower || sku === searchLower ||
        code.replace(/-/g, '') === searchNoHyphens || sku.replace(/-/g, '') === searchNoHyphens) return true
      if (Array.isArray(p.barcodes) && p.barcodes.some(bc => {
        const b = String(bc || '').toLowerCase()
        return b === searchLower || b.replace(/-/g, '') === searchNoHyphens
      })) return true
      if (p.hasVariants && Array.isArray(p.variants) && p.variants.some(v => {
        if (!v) return false
        const vSku = (v.sku || '').toLowerCase()
        const vBarcode = (v.barcode || '').toLowerCase()
        return vSku === searchLower || vBarcode === searchLower || vSku.replace(/-/g, '') === searchNoHyphens
      })) return true
      return false
    })
  }

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
      if (Capacitor.getPlatform() === 'android') {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
        if (!available) {
          toast.info('Instalando módulo de escáner... Por favor espera')
          await BarcodeScanner.installGoogleBarcodeScannerModule()
          toast.success('Módulo instalado. Intenta escanear de nuevo.')
          setIsScanning(false)
          return
        }
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
      await BarcodeScanner.stopScan().catch(() => {})

      if (barcodes && barcodes.length > 0) {
        const scannedCode = barcodes[0].rawValue
        console.log('Código escaneado:', scannedCode)

        // 1) Buscar producto por código de barras / SKU del producto padre
        //    Incluye `barcodes[]` (códigos adicionales para el mismo producto).
        let foundProduct = products.find(
          p => p.code === scannedCode ||
            p.sku === scannedCode ||
            p.barcode === scannedCode ||
            (Array.isArray(p.barcodes) && p.barcodes.includes(scannedCode))
        )
        let foundVariant = null

        // 2) Si no hubo match a nivel padre, buscar dentro de las variantes
        //    (cada variante puede tener su propio SKU o código de barras EAN único).
        if (!foundProduct) {
          for (const p of products) {
            if (!p.hasVariants || !Array.isArray(p.variants)) continue
            const v = p.variants.find(
              v => v && (v.sku === scannedCode || v.barcode === scannedCode)
            )
            if (v) {
              foundProduct = p
              foundVariant = v
              break
            }
          }
        }

        if (foundProduct) {
          if (foundVariant) {
            // Match en variante: agregar esa variante específica directo al carrito
            // (sin abrir el modal de selección — el escaneo ya identifica unívocamente).
            if (foundVariant.stock !== null && foundVariant.stock <= 0 && !companySettings?.allowNegativeStock) {
              toast.error(`${foundProduct.name} (variante) no tiene stock disponible`)
            } else {
              addVariantToCart(foundProduct, foundVariant)
              toast.success(`${foundProduct.name} agregado al carrito`)
            }
          } else {
            // Match en padre (producto sin variantes o escaneo del código del padre)
            const warehouseStock = getCurrentWarehouseStock(foundProduct)
            if (foundProduct.stock !== null && warehouseStock <= 0 && !companySettings?.allowNegativeStock) {
              toast.error(`${foundProduct.name} no tiene stock disponible`)
            } else {
              addToCart(foundProduct)
              toast.success(`${foundProduct.name} agregado al carrito`)
            }
          }
        } else {
          toast.error(`No se encontró producto con código: ${scannedCode}`)
        }
      }
    } catch (error) {
      console.error('Error al escanear:', error)
      await BarcodeScanner.stopScan().catch(() => {})
      if (error.message !== 'User cancelled the scan') {
        toast.error('Error al escanear el código de barras')
      }
    } finally {
      setIsScanning(false)
    }
  }

  // Helper: obtener lotes disponibles ordenados por FEFO (filtrados por almacén seleccionado)
  const getAvailableBatches = (product) => {
    if (!product.batches || !Array.isArray(product.batches)) return []
    return product.batches
      .filter(b => b.quantity > 0 && !b.isExpired && (!b.warehouseId || !selectedWarehouse || b.warehouseId === selectedWarehouse.id))
      .map(b => ({
        ...b,
        lotNumber: b.lotNumber || b.batchNumber || 'S/N',
        expiryDate: b.expiryDate || b.expirationDate || null
      }))
      .sort((a, b) => {
        const dA = a.expiryDate?.toDate?.() || new Date(a.expiryDate || '2099-12-31')
        const dB = b.expiryDate?.toDate?.() || new Date(b.expiryDate || '2099-12-31')
        return dA - dB
      })
  }

  // Helper: calcular stock que no está asignado a ningún lote
  const getStockWithoutLot = (product) => {
    if (!product) return 0
    // Obtener stock total del almacén seleccionado
    const totalWarehouseStock = getCurrentWarehouseStock(product)
    // Obtener suma de todos los lotes disponibles en ese almacén
    const availableBatches = getAvailableBatches(product)
    const batchesTotal = availableBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)
    // Stock sin lote = total - lotes
    const stockWithoutLot = totalWarehouseStock - batchesTotal
    return Math.max(0, stockWithoutLot)
  }

  // Helper: formatear fecha de vencimiento
  const formatBatchExpiry = (date) => {
    if (!date) return 'Sin fecha'
    let d
    if (date.toDate) d = date.toDate()
    else if (date.seconds) d = new Date(date.seconds * 1000)
    else d = new Date(date)
    if (isNaN(d.getTime())) return 'Sin fecha'
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const addToCart = (product, selectedPrice = null, selectedPresentation = null, selectedBatch = null) => {
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

    // FARMACIA: Verificar lotes PRIMERO (antes de presentaciones)
    const availableBatches = getAvailableBatches(product)
    if (availableBatches.length >= 1 && selectedBatch === null) {
      setProductForBatchSelection(product)
      setPendingPriceForBatch(selectedPrice)
      setShowBatchModal(true)
      return
    }

    // Verificar si tiene presentaciones y no viene con presentación ya seleccionada
    const hasPresentations = businessSettings?.presentationsEnabled && product.presentations && product.presentations.length > 0
    if (hasPresentations && selectedPresentation === null) {
      setProductForPresentationSelection(product)
      setPendingBatchForPresentation(selectedBatch)
      setShowPresentationModal(true)
      return
    }

    // Verificar si tiene múltiples precios y no viene con precio ya seleccionado
    const hasMultiplePrices = businessSettings?.multiplePricesEnabled && (
      hasPriceLevel(product, 'price2') || hasPriceLevel(product, 'price3') || hasPriceLevel(product, 'price4')
    )
    if (hasMultiplePrices && selectedPrice === null && selectedPresentation === null) {
      if (selectedCustomer?.priceLevel) {
        const priceKey = selectedCustomer.priceLevel
        const autoPrice = resolvePrice(product, priceKey) || product.price
        return addToCart({ ...product, price: autoPrice }, autoPrice, null, selectedBatch)
      }
      // Auto-precio por cantidad habilitado: bypass del modal.
      // Empieza con price1 (qty=1 todavía no califica para mayorista) y se
      // ajusta automáticamente cuando el cajero suba la cantidad en el carrito.
      if (product.useAutoPriceByQty === true) {
        return addToCart({ ...product, price: product.price }, product.price, null, selectedBatch)
      }
      setProductForPriceSelection(product)
      setPendingBatchForPrice(selectedBatch)
      setShowPriceModal(true)
      return
    }

    // Si el producto tiene modificadores, abrir modal de selección
    // (después de precio para que el producto ya tenga el precio correcto)
    if (product.modifiers && product.modifiers.length > 0) {
      setProductForModifiers({ ...product, _selectedPrice: selectedPrice || product.price })
      setShowModifierModal(true)
      return
    }

    // Usar el lote seleccionado o el único disponible (FEFO)
    const batchToUse = selectedBatch || (availableBatches.length === 1 ? availableBatches[0] : null)

    // FEFO: Verificar si el producto está vencido
    const expirationStatus = getProductExpirationStatus(product)
    if (expirationStatus && !expirationStatus.canSell) {
      toast.error(`No se puede vender: ${product.name} - ${expirationStatus.message}`)
      return
    }

    if (expirationStatus && ['today', 'critical'].includes(expirationStatus.status)) {
      toast.warning(`Atención: ${product.name} - ${expirationStatus.message}`)
    }

    // Verificar stock del almacén/lote
    const warehouseStock = batchToUse ? batchToUse.quantity : getCurrentWarehouseStock(product)
    if (product.stock !== null && warehouseStock <= 0 && !companySettings?.allowNegativeStock) {
      toast.error(`Producto sin stock en ${selectedWarehouse?.name || 'este almacén'}`)
      return
    }

    // SUNAT regla 3462: No se permite mezclar tasas de IGV en la misma boleta/factura
    // Validar que el producto tenga la misma tasa que los items gravados ya en el carrito
    if (taxConfig.taxType === 'standard' && (product.taxAffectation || '10') === '10') {
      const rawProductRate = product.igvRate || taxConfig.igvRate || 18
      const productRate = rawProductRate === 10 ? 10.5 : rawProductRate
      const existingGravado = cart.find(item => (item.taxAffectation || '10') === '10')
      if (existingGravado) {
        const rawCartRate = existingGravado.igvRate || taxConfig.igvRate || 18
        const cartRate = rawCartRate === 10 ? 10.5 : rawCartRate
        if (productRate !== cartRate) {
          toast.error(`No se puede mezclar productos con IGV ${cartRate}% e IGV ${productRate}% en la misma venta. SUNAT requiere una sola tasa por comprobante.`)
          return
        }
      }
    }

    // Verificar si tiene números de serie
    if (product.trackSerials && product.serials?.length > 0) {
      const availableSerials = product.serials.filter(s =>
        s.status === 'available' && (!s.warehouseId || s.warehouseId === selectedWarehouse?.id)
      )
      // Excluir los que ya están en el carrito
      const serialsInCart = cart.filter(item => (item.id === product.id || item.productId === product.id) && item.serialNumber).map(item => item.serialNumber)
      const filteredSerials = availableSerials.filter(s => !serialsInCart.includes(s.serialNumber))

      if (filteredSerials.length === 0) {
        toast.error('No hay números de serie disponibles para este producto')
        return
      }
      setProductForSerialSelection(product)
      setPendingSerialData({ batch: batchToUse })
      setShowSerialModal(true)
      return
    }

    // ID único para el item en carrito (diferente por lote + presentación)
    const presKey = product.presentationName ? `-pres-${product.presentationName}` : ''
    const isNoLotSale = batchToUse?.isNoLot === true
    const cartItemId = isNoLotSale
      ? `${product.id}-nolot${presKey}`
      : batchToUse
        ? `${product.id}-batch-${batchToUse.lotNumber}${presKey}`
        : (product.presentationName ? `${product.id}${presKey}` : product.id)
    const existingItem = cart.find(item => (item.cartId || item.id) === cartItemId)

    if (existingItem) {
      if (product.stock !== null && existingItem.quantity >= warehouseStock && !companySettings?.allowNegativeStock) {
        const stockMsg = isNoLotSale ? 'stock sin lote' : batchToUse ? `lote ${batchToUse.lotNumber}` : (selectedWarehouse?.name || 'este almacén')
        toast.warning(`Stock agotado en ${stockMsg}. Agrega el producto de nuevo para usar otro lote.`)
        return
      }

      setCart(
        cart.map(item => {
          if ((item.cartId || item.id) === cartItemId) {
            const newQuantity = item.quantity + 1
            // Auto-precio por cantidad: al sumar con clics también debe cambiar de nivel
            // (Público → Mayorista, etc.), igual que al editar la cantidad en el carrito.
            const autoPrice = computeAutoPriceForQty(item.id, newQuantity)
            return autoPrice != null
              ? { ...item, quantity: newQuantity, price: autoPrice }
              : { ...item, quantity: newQuantity }
          }
          return item
        })
      )
    } else {
      // Detectar bonificación automática: productos del catálogo con precio 0.
      // Se comportan igual que la bonificación ad-hoc (inafecto + etiqueta en el nombre).
      const effectivePrice = selectedPrice ?? product.price ?? 0
      const isFreeProduct = Number(effectivePrice) === 0
      const alreadyLabeled = (product.name || '').includes('(BONIFICACIÓN)')

      // Multi-divisa: convertir el precio a la moneda activa de la sesión.
      // Catálogo guarda PEN; si la sesión es USD, dividimos por el TC.
      // Guardamos basePrice (siempre en PEN) como source of truth para
      // evitar pérdida de precisión en round-trips de moneda.
      // Si el producto tiene priceUSD (precio fijo en USD) Y NO se seleccionó
      // un nivel de precio (price2/3/4), usamos priceUSD en sesiones USD.
      // Si el cajero elige un nivel de precio explícito, ese precio (PEN)
      // se convierte con TC normalmente.
      const fixedUSD = Number(product.priceUSD)
      const hasFixedUSD = selectedPrice == null && Number.isFinite(fixedUSD) && fixedUSD > 0
      // Anclado al dólar: priceUSD es la referencia (USD fijo; soles = USD × TC).
      const usdAnchor = hasFixedUSD ? buildUsdAnchoredCartPricing(fixedUSD, Number(effectivePrice) || 0) : null
      const priceForCart = isFreeProduct
        ? 0
        : (usdAnchor ? usdAnchor.price : toSessionCurrency(effectivePrice))
      const basePriceForCart = isFreeProduct
        ? 0
        : (usdAnchor ? usdAnchor.basePrice : Number(effectivePrice) || 0)

      const cartItem = {
        ...product,
        quantity: 1,
        price: priceForCart,
        basePrice: basePriceForCart,
        // Multi-divisa: recordar precio fijo USD si el producto lo tiene
        // y se usa el precio principal (sin nivel de precio explícito).
        // Sobrevive a cambios de moneda del POS (PEN ↔ USD).
        ...(hasFixedUSD && { fixedPriceUSD: fixedUSD }),
        ...(isFreeProduct && {
          isBonificacion: true,
          taxAffectation: '30', // Inafecto (las bonificaciones no gravan IGV)
          name: alreadyLabeled ? product.name : `${product.name} (BONIFICACIÓN)`,
          price: 0,
        }),
        // Sin lote: marcar isNoLot y LIMPIAR batchNumber del producto
        ...(isNoLotSale && {
          cartId: cartItemId,
          isNoLot: true,
          batchQuantity: batchToUse.quantity,
          batchNumber: null,
          batchExpiryDate: null,
        }),
        // Con lote: asignar batchNumber normal
        ...(batchToUse && !isNoLotSale && {
          cartId: cartItemId,
          batchNumber: batchToUse.lotNumber,
          batchExpiryDate: batchToUse.expiryDate,
          batchQuantity: batchToUse.quantity
        })
      }
      setCart([...cart, cartItem])
    }
  }

  // Construye el cartItem de una serie (helper compartido por single y bulk).
  const buildSerialCartItem = (product, serial, batchToUse) => {
    // Pricing: anclado al dólar si el producto tiene priceUSD; si no, su precio en soles
    // convertido a la moneda de sesión. basePrice (PEN) como fuente de verdad.
    const serialUSD = Number(product.priceUSD)
    const serialAnchor = Number.isFinite(serialUSD) && serialUSD > 0
      ? buildUsdAnchoredCartPricing(serialUSD, Number(product.price) || 0)
      : null
    return {
      ...product,
      price: serialAnchor ? serialAnchor.price : toSessionCurrency(Number(product.price) || 0),
      basePrice: serialAnchor ? serialAnchor.basePrice : (Number(product.price) || 0),
      ...(serialAnchor && { fixedPriceUSD: serialAnchor.fixedPriceUSD }),
      quantity: 1,
      cartId: `${product.id}-serial-${serial.serialNumber}`,
      serialNumber: serial.serialNumber,
      serialId: serial.id,
      // Si es Sin lote, limpiar batchNumber del producto
      ...(batchToUse?.isNoLot && {
        isNoLot: true,
        batchNumber: null,
        batchExpiryDate: null,
        batchQuantity: batchToUse.quantity
      }),
      // Con lote normal
      ...(batchToUse && !batchToUse.isNoLot && {
        batchNumber: batchToUse.lotNumber,
        batchExpiryDate: batchToUse.expiryDate,
        batchQuantity: batchToUse.quantity
      })
    }
  }

  // Toggle de selección de una serie en el modal multi-select.
  const toggleSerialSelection = (serialId) => {
    setSelectedSerialIds(prev => {
      const next = new Set(prev)
      if (next.has(serialId)) next.delete(serialId)
      else next.add(serialId)
      return next
    })
  }

  // Cierra el modal y limpia el estado de selección.
  const closeSerialModal = () => {
    setShowSerialModal(false)
    setProductForSerialSelection(null)
    setPendingSerialData(null)
    setSelectedSerialIds(new Set())
  }

  // Agrega todas las series seleccionadas al carrito de una sola vez.
  const handleConfirmMultipleSerials = (filteredSerials) => {
    if (!productForSerialSelection) return
    const product = productForSerialSelection
    const batchToUse = pendingSerialData?.batch || null

    const selected = filteredSerials.filter(s => selectedSerialIds.has(s.id))
    if (selected.length === 0) return

    const newCartItems = selected.map(serial => buildSerialCartItem(product, serial, batchToUse))
    setCart(prev => [...prev, ...newCartItems])
    toast.success(`${selected.length} serie${selected.length > 1 ? 's' : ''} agregada${selected.length > 1 ? 's' : ''} al carrito`)
    closeSerialModal()
  }

  // Manejar selección de lote desde el modal
  const handleBatchSelection = (batch) => {
    if (!productForBatchSelection) return
    const product = productForBatchSelection
    const hasPresentations = businessSettings?.presentationsEnabled && product.presentations && product.presentations.length > 0

    setShowBatchModal(false)
    setProductForBatchSelection(null)

    if (hasPresentations) {
      // Tiene presentaciones: mostrar modal de presentación con el lote ya seleccionado
      setProductForPresentationSelection(product)
      setPendingBatchForPresentation(batch)
      setShowPresentationModal(true)
      setPendingPriceForBatch(null)
    } else {
      // Sin presentaciones: agregar directo al carrito
      addToCart(product, pendingPriceForBatch, null, batch)
      setPendingPriceForBatch(null)
    }
  }

  // Manejar selección de modificadores desde el modal
  const addToCartWithModifiers = (data) => {
    if (!productForModifiers) return
    const { selectedModifiers, totalPrice } = data
    const product = productForModifiers

    // Crear identificador único basado en los modificadores seleccionados
    const modifierKey = selectedModifiers
      .map(m => `${m.modifierId}:${m.options.map(o => o.quantity ? `${o.optionId}x${o.quantity}` : o.optionId).join(',')}`)
      .join('|')
    const cartItemId = `${product.id}-mod-${modifierKey}`

    const existingItem = cart.find(item => (item.cartId || item.id) === cartItemId)

    if (existingItem) {
      setCart(
        cart.map(item =>
          (item.cartId || item.id) === cartItemId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      )
    } else {
      setCart([
        ...cart,
        {
          ...product,
          price: totalPrice,
          basePrice: product.price,
          quantity: 1,
          cartId: cartItemId,
          modifiers: selectedModifiers,
          modifierKey: modifierKey,
        },
      ])
    }

    setShowModifierModal(false)
    setProductForModifiers(null)
  }

  // Resolver precio para un nivel dado, considerando: precio manual > porcentaje automático > precio base.
  // La base del % se controla en Configuración → Ventas:
  //   'public' (default histórico): Precio N = Público × (1 - %). No aplica a price1 (es la base).
  //   'cost':                       Precio N = Costo × (1 + %). Aplica también a price1 si está configurado.
  //                                  Si no hay costo registrado, se cae al precio manual o null.
  // parentProduct: cuando priceSource es una variante, permite heredar el costo del producto padre.
  const resolvePrice = (priceSource, priceKey, parentProduct = null) => {
    // El campo del precio manual: para price1 es 'price', para los demás es la propia key
    const manualField = priceKey === 'price1' ? 'price' : priceKey
    const manualValue = priceSource[manualField]
    // Si hay precio manual ingresado, usarlo (preserva comportamiento histórico)
    if (manualValue) return manualValue

    const pctConfig = businessSettings?.pricePercentages?.[priceKey]
    if (!pctConfig?.enabled || !(pctConfig.discount > 0)) {
      // Sin % configurado: para price1 devolver el valor manual aunque sea 0/null (compatibilidad);
      // para price2/3/4, no hay forma de derivar → null.
      return priceKey === 'price1' ? manualValue : null
    }

    const base = businessSettings?.priceCalculationBase || 'public'
    if (base === 'cost') {
      const cost = parseFloat(priceSource.cost) || parseFloat(parentProduct?.cost) || 0
      if (cost <= 0) return priceKey === 'price1' ? manualValue : null
      const formula = businessSettings?.marginFormula === 'margin' ? 'margin' : 'markup'
      return applyMarginToCost(cost, pctConfig.discount, formula)
    }
    // base === 'public': el % solo aplica a price2/3/4. price1 ES la referencia.
    if (priceKey === 'price1') return manualValue
    return Math.round(priceSource.price * (1 - pctConfig.discount / 100) * 100) / 100
  }

  // Verificar si un nivel de precio está disponible (manual o por porcentaje)
  const hasPriceLevel = (priceSource, priceKey, parentProduct = null) => {
    if (priceSource[priceKey]) return true
    const pctConfig = businessSettings?.pricePercentages?.[priceKey]
    if (!pctConfig?.enabled || !(pctConfig.discount > 0)) return false
    const base = businessSettings?.priceCalculationBase || 'public'
    if (base === 'cost') {
      const cost = parseFloat(priceSource.cost) || parseFloat(parentProduct?.cost) || 0
      return cost > 0
    }
    return true
  }

  // Lista de TODOS los niveles de precio de un producto (Público, Mayorista, VIP, Especial)
  // con su etiqueta configurada, para previsualizarlos en la grilla del POS cuando el negocio
  // usa múltiples precios. Usa resolvePrice (respeta precios manuales y derivados por %).
  const getProductPriceLevels = (product) => {
    if (!businessSettings?.multiplePricesEnabled) return []
    const defs = [
      { key: 'price1', def: 'Público' },
      { key: 'price2', def: 'Mayorista' },
      { key: 'price3', def: 'VIP' },
      { key: 'price4', def: 'Especial' },
    ]
    const out = []
    for (const { key, def } of defs) {
      if (key !== 'price1' && !hasPriceLevel(product, key)) continue
      const value = resolvePrice(product, key)
      if (value == null || value <= 0) continue
      out.push({ key, label: businessSettings?.priceLabels?.[key] || def, value })
    }
    return out
  }

  // Costo histórico del item al momento de la venta ("costAtSale").
  //
  // Los reportes de margen valorizan cada venta con el `cost` ACTUAL del
  // producto en el catálogo. Si el dueño edita el producto después de vender
  // (cambia la unidad, entra una compra que reescribe el costo promedio, lo
  // ajusta a mano), todos los reportes históricos se "redibujan" con el costo
  // nuevo → márgenes absurdos en ventas viejas. Para evitarlo, congelamos el
  // costo en el comprobante.
  //
  // El valor se devuelve POR UNIDAD de `quantity` (ya incluye el factor de
  // presentación), para que el reporte haga `costAtSale * quantity` sin más.
  // Devuelve null cuando no se puede determinar (producto personalizado, sin
  // costo registrado, o con receta): en esos casos el reporte usa su fallback
  // (costo de catálogo / receta actual).
  const computeItemCostAtSale = (item) => {
    // Productos personalizados / servicios ad-hoc no existen en el catálogo.
    const itemId = item.id || item.productId
    if (item.isCustom || (typeof itemId === 'string' && (itemId.startsWith('custom-') || itemId.startsWith('appointment-')))) {
      return null
    }
    const product = products.find(p => p.id === itemId)
    if (!product) return null
    const factor = item.presentationFactor || 1
    // Plato con receta: congelar el costo de la receta (costo de insumos a la
    // fecha) en vez del costo manual del producto. Prioridad sobre product.cost
    // porque para platos el costo real lo da la receta. Si la receta aún no
    // cargó (carrera con el efecto lazy), cae al costo del producto abajo.
    if (recipeCostMap.has(itemId)) {
      const recipeCost = recipeCostMap.get(itemId)
      if (recipeCost > 0) return Math.round(recipeCost * factor * 1e6) / 1e6
    }
    // Variante: preferir el costo propio de la variante, caer al del padre.
    let baseCost = parseFloat(product.cost) || 0
    if (item.isVariant && item.variantSku && Array.isArray(product.variants)) {
      const variant = product.variants.find(v => v.sku === item.variantSku)
      const variantCost = parseFloat(variant?.cost)
      if (Number.isFinite(variantCost) && variantCost > 0) baseCost = variantCost
    }
    if (!(baseCost > 0)) return null // sin costo conocido → que el reporte decida
    return Math.round(baseCost * factor * 1e6) / 1e6
  }

  // Manejar selección de precio desde el modal
  const handlePriceSelection = (priceLevel) => {
    // Manejar variante con múltiples precios
    if (variantForPriceSelection) {
      const { product, variant } = variantForPriceSelection
      const selectedPrice = resolvePrice(variant, priceLevel, product) || variant.price

      // Agregar variante al carrito con el precio seleccionado
      addVariantToCart(product, variant, selectedPrice)

      // Cerrar modal y limpiar estado
      setShowPriceModal(false)
      setVariantForPriceSelection(null)
      return
    }

    // Manejar producto normal con múltiples precios
    if (!productForPriceSelection) return

    const product = productForPriceSelection
    const selectedPrice = resolvePrice(product, priceLevel) || product.price

    if (priceFromBaseUnit) {
      // Viene del flujo: presentación → unidad base → precios
      const batchToUse = pendingBatchForPrice
      addToCart({ ...product, price: selectedPrice, presentationName: null, presentationFactor: 1 }, selectedPrice, { name: 'base', factor: 1, price: selectedPrice }, batchToUse)
    } else {
      // Flujo normal: producto sin presentaciones → precios
      addToCart({ ...product, price: selectedPrice }, selectedPrice, null, pendingBatchForPrice)
    }

    // Cerrar modal y limpiar estado
    setShowPriceModal(false)
    setProductForPriceSelection(null)
    setPendingBatchForPrice(null)
    setPriceFromBaseUnit(false)
  }

  // Manejar selección de presentación desde el modal
  const handlePresentationSelection = (presentation) => {
    if (!productForPresentationSelection) return

    const product = productForPresentationSelection
    const batchToUse = pendingBatchForPresentation
    const isNoLotSale = batchToUse?.isNoLot === true

    // ID único por lote + presentación (nunca se mezclan lotes diferentes)
    const batchKey = isNoLotSale ? '-nolot' : batchToUse ? `-batch-${batchToUse.lotNumber}` : ''
    const cartId = `${product.id}${batchKey}-pres-${presentation.name}`

    // Pricing de la presentación: anclado al dólar si tiene priceUSD; si no, su precio en soles
    // convertido a la moneda de sesión. Guardamos basePrice (PEN) como fuente de verdad.
    const presUSD = Number(presentation.priceUSD)
    const presAnchor = Number.isFinite(presUSD) && presUSD > 0
      ? buildUsdAnchoredCartPricing(presUSD, Number(presentation.price) || 0)
      : null
    const presPrice = presAnchor ? presAnchor.price : toSessionCurrency(Number(presentation.price) || 0)
    const presBasePrice = presAnchor ? presAnchor.basePrice : (Number(presentation.price) || 0)

    // Crear un item del carrito con la información de la presentación y lote
    const cartItem = {
      ...product,
      cartId,
      price: presPrice,
      basePrice: presBasePrice,
      ...(presAnchor && { fixedPriceUSD: presAnchor.fixedPriceUSD }),
      presentationName: presentation.name,
      presentationFactor: presentation.factor,
      quantity: 1,
      // Sin lote: marcar isNoLot y LIMPIAR batchNumber del producto
      ...(isNoLotSale && {
        isNoLot: true,
        batchQuantity: batchToUse.quantity,
        batchNumber: null,
        batchExpiryDate: null,
      }),
      // Con lote: asignar batchNumber normal
      ...(batchToUse && !isNoLotSale && {
        batchNumber: batchToUse.lotNumber,
        batchExpiryDate: batchToUse.expiryDate,
        batchQuantity: batchToUse.quantity
      })
    }

    // Verificar stock considerando el factor (del lote si aplica)
    const availableStock = batchToUse ? batchToUse.quantity : getCurrentWarehouseStock(product)
    const maxPresentations = Math.floor(availableStock / presentation.factor)
    if (product.stock !== null && maxPresentations < 1 && !companySettings?.allowNegativeStock) {
      const stockSource = isNoLotSale ? 'stock sin lote' : batchToUse ? `lote ${batchToUse.lotNumber}` : 'almacén'
      toast.error(`Stock insuficiente en ${stockSource}. Se necesita mínimo ${presentation.factor} unidades para 1 ${presentation.name}, disponible: ${parseFloat(availableStock.toFixed(2))}`)
      setShowPresentationModal(false)
      setProductForPresentationSelection(null)
      setPendingBatchForPresentation(null)
      return
    }

    // Buscar si ya existe esta presentación+lote en el carrito
    const existingItem = cart.find(item => item.cartId === cartId)

    if (existingItem) {
      if (product.stock !== null && (existingItem.quantity + 1) > maxPresentations && !companySettings?.allowNegativeStock) {
        const stockSource = isNoLotSale ? 'stock sin lote' : batchToUse ? `lote ${batchToUse.lotNumber}` : 'almacén'
        toast.error(`Stock máximo en ${stockSource}: ${maxPresentations} ${presentation.name}. Para más, selecciona otro lote.`)
        setShowPresentationModal(false)
        setProductForPresentationSelection(null)
        setPendingBatchForPresentation(null)
        return
      }
      setCart(
        cart.map(item =>
          item.cartId === cartId ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else {
      setCart([...cart, cartItem])
    }

    // Cerrar modal
    setShowPresentationModal(false)
    setProductForPresentationSelection(null)
    setPendingBatchForPresentation(null)
  }

  // Manejar venta directa por unidad base (sin presentación específica)
  const handleSellAsBaseUnit = () => {
    if (!productForPresentationSelection) return

    const product = productForPresentationSelection
    const batchToUse = pendingBatchForPresentation

    // Cerrar modal de presentación
    setShowPresentationModal(false)
    setProductForPresentationSelection(null)
    setPendingBatchForPresentation(null)

    // Verificar si tiene múltiples precios → mostrar modal de precios
    const hasMultiplePrices = businessSettings?.multiplePricesEnabled && (
      hasPriceLevel(product, 'price2') || hasPriceLevel(product, 'price3') || hasPriceLevel(product, 'price4')
    )
    if (hasMultiplePrices) {
      // Si el cliente tiene precio asignado, usar directo
      if (selectedCustomer?.priceLevel) {
        const priceKey = selectedCustomer.priceLevel
        const autoPrice = resolvePrice(product, priceKey) || product.price
        addToCart({ ...product, presentationName: null, presentationFactor: 1, price: autoPrice }, autoPrice, { name: 'base', factor: 1, price: autoPrice }, batchToUse)
        return
      }
      // Mostrar modal de precios, guardando el batch pendiente
      setPendingBatchForPrice(batchToUse)
      setPriceFromBaseUnit(true)
      setProductForPriceSelection(product)
      setShowPriceModal(true)
      return
    }

    // Sin múltiples precios: agregar directo al carrito
    addToCart({ ...product, presentationName: null, presentationFactor: 1 }, product.price, { name: 'base', factor: 1, price: product.price }, batchToUse)
  }

  const addVariantToCart = (product, variant, selectedPrice = null) => {
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

    // Verificar si tiene múltiples precios y no viene con precio ya seleccionado
    const hasMultiplePrices = businessSettings?.multiplePricesEnabled && (
      hasPriceLevel(variant, 'price2', product) || hasPriceLevel(variant, 'price3', product) || hasPriceLevel(variant, 'price4', product)
    )
    if (hasMultiplePrices && selectedPrice === null) {
      // Si el cliente tiene un nivel de precio asignado, usarlo automáticamente
      if (selectedCustomer?.priceLevel) {
        const priceKey = selectedCustomer.priceLevel
        const autoPrice = resolvePrice(variant, priceKey, product) || variant.price
        return addVariantToCart(product, variant, autoPrice)
      }
      // Mostrar modal de selección de precio
      setVariantForPriceSelection({ product, variant })
      setShowPriceModal(true)
      setShowVariantModal(false)
      setSelectedProductForVariant(null)
      return
    }

    // Determinar el precio final (en moneda de sesión) y el ancla USD si la variante lo tiene.
    // Si se eligió un nivel de precio explícito (selectedPrice != null), ese manda (en soles).
    const variantUSD = Number(variant.priceUSD)
    const hasVarFixedUSD = selectedPrice == null && Number.isFinite(variantUSD) && variantUSD > 0
    const rawVariantPenPrice = selectedPrice !== null ? selectedPrice : variant.price
    const variantAnchor = hasVarFixedUSD
      ? buildUsdAnchoredCartPricing(variantUSD, Number(rawVariantPenPrice) || 0)
      : null
    const finalPrice = variantAnchor ? variantAnchor.price : toSessionCurrency(Number(rawVariantPenPrice) || 0)
    const finalBasePrice = variantAnchor ? variantAnchor.basePrice : (Number(rawVariantPenPrice) || 0)

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
        price: finalPrice,
        basePrice: finalBasePrice,
        ...(variantAnchor && { fixedPriceUSD: variantAnchor.fixedPriceUSD }),
        stock: variant.stock,
        quantity: 1,
        isVariant: true,
        imageUrl: product.imageUrl, // Include product image
        description: product.description || '', // Descripción del producto para el PDF (opción showProductDescriptionInInvoice)
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

    let price = parseFloat(customProduct.price) || 0
    if (customProduct.isBonificacion) {
      price = 0
    } else if (price <= 0) {
      toast.error('El precio debe ser mayor a 0')
      return
    }

    const quantity = parseFloat(customProduct.quantity) || 1
    if (quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    // Si addIgv está activado y el producto es gravado, agregar IGV al precio
    const customIgvRate = taxConfig.taxType === 'standard' ? (customProduct.igvRate || 18) : (taxConfig.igvRate || 18)
    if (customProduct.addIgv && customProduct.taxAffectation === '10' && !taxConfig.igvExempt) {
      // Calcular precio con IGV sin redondear para mantener precisión en los cálculos
      price = price * (1 + customIgvRate / 100)
    }

    // SUNAT regla 3462: No se permite mezclar tasas de IGV en la misma venta
    if (taxConfig.taxType === 'standard' && (customProduct.taxAffectation || '10') === '10') {
      const existingGravado = cart.find(item => (item.taxAffectation || '10') === '10')
      if (existingGravado) {
        const cartRate = existingGravado.igvRate || taxConfig.igvRate || 18
        if (customIgvRate !== cartRate) {
          toast.error(`No se puede mezclar productos con IGV ${cartRate}% e IGV ${customIgvRate}% en la misma venta. SUNAT requiere una sola tasa por comprobante.`)
          return
        }
      }
    }

    // Crear producto personalizado con ID único
    const customProductItem = {
      id: `custom-${Date.now()}`,
      code: 'CUSTOM',
      name: customProduct.isBonificacion ? `${customProduct.name.trim()} (BONIFICACIÓN)` : customProduct.name.trim(),
      price: price,
      quantity: quantity,
      unit: customProduct.unit || 'NIU',
      // Bonificaciones son inafectas (no generan IGV)
      taxAffectation: customProduct.isBonificacion ? '30' : (taxConfig.igvExempt ? '20' : (customProduct.taxAffectation || '10')),
      // Solo incluir igvRate si es standard y gravado
      ...(taxConfig.taxType === 'standard' && customProduct.taxAffectation === '10' && !customProduct.isBonificacion && { igvRate: customIgvRate }),
      stock: null, // Productos personalizados no tienen control de stock
      isCustom: true,
      ...(customProduct.isBonificacion && { isBonificacion: true }),
    }

    setCart([...cart, customProductItem])
    toast.success('Producto personalizado agregado al carrito')

    // Resetear y cerrar modal. La AFECTACIÓN (gravado/exonerado/inafecto) y
    // addIgv se MANTIENEN para el siguiente item: un negocio que vende
    // exonerado agrega muchos items personalizados seguidos y re-seleccionar
    // "Exonerado" cada vez provocaba que un olvido pasara como Gravado
    // (reporte de usuario: 31 items, 1 quedó gravado por S/4 + IGV).
    setCustomProduct(prev => ({
      ...prev,
      name: '',
      price: '',
      quantity: 1,
      unit: 'NIU',
      isBonificacion: false,
      // El '30' de una bonificación es efecto del check, no elección del
      // usuario: no se hereda al siguiente item (vuelve al default del negocio).
      ...(prev.isBonificacion ? { taxAffectation: businessSettings?.defaultTaxAffectation || '10' } : {}),
    }))
    setShowCustomProductModal(false)
  }

  /**
   * Calcula el mejor precio según la cantidad cuando el producto tiene
   * `useAutoPriceByQty` habilitado. Devuelve null si no aplica (mantiene el
   * precio actual). Se usa al cambiar la cantidad de un item en el carrito.
   *
   * Prioridad de mínimos:
   *   1) Configuración a nivel PRODUCTO (product.priceMinQtys[key]).
   *   2) Fallback global del catálogo del negocio
   *      (companySettings.catalogWholesaleMinQtys[key] o catalogWholesaleMinQty).
   *
   * Si el cliente del POS tiene `priceLevel` asignado, no se modifica nada
   * (esa selección tiene prioridad).
   */
  const computeAutoPriceForQty = (productId, qty) => {
    if (selectedCustomer?.priceLevel) return null
    const product = products.find(p => p.id === productId)
    if (!product || product.useAutoPriceByQty !== true) return null

    const productMins = product.priceMinQtys || {}
    const globalMins = companySettings?.catalogWholesaleMinQtys || {}
    const legacyGlobal = parseInt(companySettings?.catalogWholesaleMinQty)

    const getMin = (key) => {
      const p = parseInt(productMins[key])
      if (Number.isFinite(p) && p >= 1) return p
      const g = parseInt(globalMins[key])
      if (Number.isFinite(g) && g >= 1) return g
      if (Number.isFinite(legacyGlobal) && legacyGlobal >= 1) return legacyGlobal
      return null
    }

    const basePrice = parseFloat(product.price) || 0
    const candidates = ['price2', 'price3', 'price4']
      .map(key => {
        const v = parseFloat(product[key])
        if (!Number.isFinite(v) || v <= 0) return null
        const min = getMin(key)
        if (min == null || min < 1) return null
        if (qty < min) return null
        return { value: v }
      })
      .filter(Boolean)
    if (candidates.length === 0) return basePrice
    candidates.sort((a, b) => a.value - b.value)
    return candidates[0].value
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
            // Coercionar a número: la cantidad puede ser '' transitorio mientras el
            // usuario edita el campo, y '' + 1 daría el string '1' (concatenación).
            const newQuantity = (parseFloat(item.quantity) || 0) + change

            // El botón "−" nunca elimina el producto: si bajaría de 1, no hace nada.
            // La única forma de quitar un ítem del carrito es el tacho rojo (removeFromCart).
            if (newQuantity < 1) return item

            // Verificar stock del almacén seleccionado (solo para productos no personalizados)
            // Si allowNegativeStock está habilitado, permitir venta sin stock
            if (item.stock !== null && !item.isCustom && !companySettings?.allowNegativeStock) {
              const productData = products.find(p => p.id === item.id)
              if (productData) {
                const factor = item.presentationFactor || 1
                // Stock disponible: variante específica > lote > "sin lote" > almacén
                let availableStock
                let stockMsg

                if (item.isVariant && productData.hasVariants) {
                  // Variante: buscar la variante por SKU y leer su stock
                  // (preferir el stock del almacén seleccionado si existe).
                  const variantData = productData.variants?.find(v => v.sku === item.variantSku)
                  if (variantData) {
                    if (selectedWarehouse) {
                      const ws = (variantData.warehouseStocks || []).find(ws => ws.warehouseId === selectedWarehouse.id)
                      availableStock = ws?.stock ?? variantData.stock ?? 0
                    } else {
                      availableStock = variantData.stock ?? 0
                    }
                  } else {
                    availableStock = item.stock ?? 0
                  }
                  const variantLabel = Object.values(item.variantAttributes || {}).join(' / ') || item.variantSku
                  stockMsg = `variante ${variantLabel}${selectedWarehouse ? ` en ${selectedWarehouse.name}` : ''}`
                } else if (item.batchNumber) {
                  // SUMAR todos los registros que tengan el mismo batchNumber.
                  // Cubre el caso edge de bases con lotes duplicados (mismo lote
                  // creado varias veces antes del fix de merge en compras).
                  const matchingBatches = (productData.batches || []).filter(b =>
                    (b.lotNumber || b.batchNumber) === item.batchNumber
                  )
                  availableStock = matchingBatches.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
                  stockMsg = `lote ${item.batchNumber}`
                } else if (item.isNoLot) {
                  const totalWarehouseStock = getCurrentWarehouseStock(productData)
                  const warehouseBatches = (productData.batches || []).filter(b =>
                    b.quantity > 0 && (!b.warehouseId || b.warehouseId === selectedWarehouse?.id)
                  )
                  const batchesTotal = warehouseBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)
                  availableStock = Math.max(0, totalWarehouseStock - batchesTotal)
                  stockMsg = 'stock sin lote'
                } else {
                  availableStock = getCurrentWarehouseStock(productData)
                  stockMsg = selectedWarehouse?.name || 'este almacén'
                }

                if (factor > 1) {
                  const maxPresentations = Math.floor(availableStock / factor)
                  if (newQuantity > maxPresentations) {
                    const presName = item.presentationName || 'presentaciones'
                    toast.error(`Máximo ${maxPresentations} ${presName} en ${stockMsg}. Para más, selecciona otro lote.`)
                    return item
                  }
                } else {
                  if (newQuantity > availableStock) {
                    toast.error(`Stock insuficiente en ${stockMsg}. Disponible: ${parseFloat(availableStock.toFixed(2))}`)
                    return item
                  }
                }
              }
            }

            // Auto-precio según cantidad (solo si el producto lo tiene habilitado).
            // Cubre tanto upgrade (Público → Mayorista al subir qty) como
            // downgrade (Mayorista → Público al bajar qty). No toca productos
            // que no tienen useAutoPriceByQty ni si el cliente tiene priceLevel.
            const autoPrice = computeAutoPriceForQty(item.id, newQuantity)
            return autoPrice != null
              ? { ...item, quantity: newQuantity, price: autoPrice }
              : { ...item, quantity: newQuantity }
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
    // Permitir string vacío o valores intermedios como "0", "0." mientras el usuario escribe
    const rawValue = newQuantity === '' || newQuantity === '0' || newQuantity === '0.' ? newQuantity : newQuantity
    const quantity = parseFloat(rawValue)
    if (rawValue !== '' && rawValue !== '0' && rawValue !== '0.' && (isNaN(quantity) || quantity < 0)) return

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
                const factor = item.presentationFactor || 1
                // Stock disponible: variante específica > lote > "sin lote" > almacén
                let availableStock
                let stockMsg

                if (item.isVariant && productData.hasVariants) {
                  const variantData = productData.variants?.find(v => v.sku === item.variantSku)
                  if (variantData) {
                    if (selectedWarehouse) {
                      const ws = (variantData.warehouseStocks || []).find(ws => ws.warehouseId === selectedWarehouse.id)
                      availableStock = ws?.stock ?? variantData.stock ?? 0
                    } else {
                      availableStock = variantData.stock ?? 0
                    }
                  } else {
                    availableStock = item.stock ?? 0
                  }
                  const variantLabel = Object.values(item.variantAttributes || {}).join(' / ') || item.variantSku
                  stockMsg = `variante ${variantLabel}${selectedWarehouse ? ` en ${selectedWarehouse.name}` : ''}`
                } else if (item.batchNumber) {
                  // SUMAR todos los registros que tengan el mismo batchNumber.
                  // Cubre el caso edge de bases con lotes duplicados (mismo lote
                  // creado varias veces antes del fix de merge en compras).
                  const matchingBatches = (productData.batches || []).filter(b =>
                    (b.lotNumber || b.batchNumber) === item.batchNumber
                  )
                  availableStock = matchingBatches.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
                  stockMsg = `lote ${item.batchNumber}`
                } else if (item.isNoLot) {
                  const totalWarehouseStock = getCurrentWarehouseStock(productData)
                  const warehouseBatches = (productData.batches || []).filter(b =>
                    b.quantity > 0 && (!b.warehouseId || b.warehouseId === selectedWarehouse?.id)
                  )
                  const batchesTotal = warehouseBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)
                  availableStock = Math.max(0, totalWarehouseStock - batchesTotal)
                  stockMsg = 'stock sin lote'
                } else {
                  availableStock = getCurrentWarehouseStock(productData)
                  stockMsg = selectedWarehouse?.name || 'este almacén'
                }

                if (factor > 1) {
                  const maxPresentations = Math.floor(availableStock / factor)
                  if (quantity > maxPresentations) {
                    const presName = item.presentationName || 'presentaciones'
                    toast.error(`Máximo ${maxPresentations} ${presName} en ${stockMsg}. Para más, selecciona otro lote.`)
                    return item
                  }
                } else {
                  if (quantity > availableStock) {
                    toast.error(`Stock insuficiente en ${stockMsg}. Disponible: ${parseFloat(availableStock.toFixed(2))}`)
                    return item
                  }
                }
              }
            }
            // Auto-precio según cantidad (igual que en updateQuantity).
            // Solo aplica con valores numéricos válidos, no con strings parciales.
            const numericQty = typeof quantity === 'number' && !isNaN(quantity) ? quantity : null
            const autoPrice = numericQty != null ? computeAutoPriceForQty(item.id, numericQty) : null
            const finalQty = rawValue === '' || rawValue === '0' || rawValue === '0.' ? rawValue : quantity
            return autoPrice != null
              ? { ...item, quantity: finalQty, price: autoPrice }
              : { ...item, quantity: finalQty }
          }
          return item
        })
    )
  }

  // Al salir del input, restaurar a 1 si quedó vacío o en 0
  const handleQuantityBlur = (itemId, currentQuantity) => {
    const qty = parseFloat(currentQuantity)
    if (!currentQuantity || currentQuantity === '' || currentQuantity === '0' || currentQuantity === '0.' || isNaN(qty) || qty <= 0) {
      setQuantityDirectly(itemId, 1)
    }
  }

  const removeFromCart = itemId => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    setCart(cart.filter(item => (item.cartId || item.id) !== itemId))
  }

  const startEditingPrice = (itemId, currentPrice, withoutIgv = false) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    setEditingPriceItemId(itemId)
    setEditingPriceWithoutIgv(withoutIgv)
    if (withoutIgv) {
      // Calcular precio sin IGV
      const igvRate = taxConfig?.igvRate || 18
      setEditingPrice((currentPrice / (1 + igvRate / 100)).toFixed(2))
    } else {
      setEditingPrice(currentPrice.toString())
    }
  }

  const cancelEditingPrice = () => {
    setEditingPriceItemId(null)
    setEditingPrice('')
    setEditingPriceWithoutIgv(false)
  }

  // Devuelve los cartIds de todos los ítems del mismo grupo de series que el itemId dado.
  // Un "grupo" son varias unidades del mismo producto (+mismo lote) con números de serie.
  // Si el ítem no tiene serialNumber, retorna solo su propio cartId.
  const getSerialGroupCartIds = (itemId) => {
    const target = cart.find(i => (i.cartId || i.id) === itemId)
    if (!target || !target.serialNumber) return [itemId]
    const targetProductId = target.id || target.productId
    const targetBatch = target.batchNumber || ''
    return cart
      .filter(o => o.serialNumber
        && ((o.id || o.productId) === targetProductId)
        && (o.batchNumber || '') === targetBatch)
      .map(o => o.cartId || o.id)
  }

  const saveEditedPrice = (itemId) => {
    let newPrice = parseFloat(editingPrice)

    if (isNaN(newPrice) || newPrice <= 0) {
      toast.error('El precio debe ser mayor a 0')
      return
    }

    // Si editó sin IGV, calcular precio con IGV
    if (editingPriceWithoutIgv) {
      const igvRate = taxConfig?.igvRate || 18
      newPrice = parseFloat((newPrice * (1 + igvRate / 100)).toFixed(2))
    }

    // Multi-divisa: actualizar también basePrice (PEN) para mantener
    // consistencia en round-trips de moneda. Si la sesión es USD, el
    // newPrice viene en USD → convertir a PEN para guardar como base.
    const newBasePrice = currency === 'USD'
      ? Number(convertToBase(newPrice, 'USD', exchangeRate).toFixed(2))
      : newPrice

    // Propagar el precio a todos los miembros del grupo de series (si aplica)
    const groupIds = new Set(getSerialGroupCartIds(itemId))
    setCart(cart.map(item => {
      const currentItemId = item.cartId || item.id
      if (groupIds.has(currentItemId)) {
        // Edición manual: el ítem pasa a precio manual; soltamos el ancla USD para que el
        // recálculo por TC no lo sobreescriba con el priceUSD del catálogo.
        return { ...item, price: newPrice, basePrice: newBasePrice, fixedPriceUSD: null }
      }
      return item
    }))

    setEditingPriceItemId(null)
    setEditingPrice('')
    setEditingPriceWithoutIgv(false)
    toast.success('Precio actualizado')
  }

  // Actualizar observaciones de un item (IMEI, placa, serie, etc.)
  // Si el ítem pertenece a un grupo de series, aplica a todos los miembros del grupo.
  const updateItemObservations = (itemId, observations) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    const groupIds = new Set(getSerialGroupCartIds(itemId))
    setCart(cart.map(item => {
      const matchId = item.cartId || item.id
      if (groupIds.has(matchId)) {
        return { ...item, observations }
      }
      return item
    }))
  }

  // Actualizar nombre de un item en el carrito
  // Si el ítem pertenece a un grupo de series, aplica a todos los miembros del grupo.
  const updateItemName = (itemId, name) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    const groupIds = new Set(getSerialGroupCartIds(itemId))
    setCart(cart.map(item => {
      const matchId = item.cartId || item.id
      if (groupIds.has(matchId)) {
        return { ...item, name }
      }
      return item
    }))
  }

  // Eliminar todos los miembros de un grupo de series (botón de basura del grupo)
  const removeSerialGroup = (itemId) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    const groupIds = new Set(getSerialGroupCartIds(itemId))
    setCart(cart.filter(item => !groupIds.has(item.cartId || item.id)))
  }

  // Actualizar descuento TOTAL de un grupo de series: se prorratea entre los miembros
  const updateGroupDiscount = (itemId, totalValue) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    const total = parseFloat(totalValue) || 0
    const groupIds = new Set(getSerialGroupCartIds(itemId))
    const perMember = groupIds.size > 0 ? total / groupIds.size : 0
    setCart(cart.map(item => {
      const matchId = item.cartId || item.id
      if (!groupIds.has(matchId)) return item
      const maxDiscount = item.price * item.quantity
      return { ...item, itemDiscount: Math.min(Math.max(0, perMember), maxDiscount) }
    }))
  }

  // Actualizar descuento individual de un item
  const updateItemDiscount = (itemId, discountValue) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    const discount = parseFloat(discountValue) || 0
    setCart(cart.map(item => {
      const matchId = item.cartId || item.id
      if (matchId === itemId) {
        // El descuento no puede ser mayor al total de la línea
        const maxDiscount = item.price * item.quantity
        const validDiscount = Math.min(Math.max(0, discount), maxDiscount)
        return { ...item, itemDiscount: validDiscount }
      }
      return item
    }))
  }

  const clearCart = () => {
    setCart([])
    setSelectedCustomer(null)
    userChangedDocTypeRef.current = false
    // Resetear al default del negocio, pero respetando los tipos permitidos del
    // usuario logueado. Si el default no está en allowedDocumentTypes (típico en
    // sub-usuarios con permisos restringidos), caer al primero permitido — así
    // el state nunca queda en un valor sin <option> en el <select>.
    const def = companySettings?.defaultDocumentType || 'boleta'
    const safeDoc = (allowedDocumentTypes && allowedDocumentTypes.length > 0 && !allowedDocumentTypes.includes(def))
      ? allowedDocumentTypes[0]
      : def
    setDocumentType(safeDoc)
    setOrderType('takeaway')
    setCustomerData({
      documentType: ID_TYPES.DNI,
      documentNumber: '',
      name: '',
      businessName: '',
      address: '',
      email: '',
      phone: '',
      studentName: '',
      studentSchedule: '',
      petName: '',
      vehiclePlate: '',
      vehicleModel: '',
      vehicleYear: '',
      // Campos de transporte de carga
      originAddress: '',
      destinationAddress: '',
      tripDetail: '',
      serviceReferenceValue: '',
      effectiveLoadValue: '',
      usefulLoadValue: '',
      bankAccount: '',
      detractionPercentage: '',
      detractionAmount: '',
      goodsServiceCode: '',
    })
    setPayments([{ method: getDefaultPaymentMethod(), amount: '' }])
    setSelectedRoom(null)
    setLastInvoiceData(null)
    setSaleCompleted(false) // Desbloquear carrito para nueva venta
    // OJO: no limpiamos changeReminder aquí. Con auto-reset activado, clearCart corre
    // ~1s después de la venta y borraría el aviso de vuelto recién mostrado. El aviso
    // se limpia al iniciar el siguiente cobro (handleCheckout) o al cerrarlo el cajero.
    setPostSaleModalOpen(false) // Cerrar el modal de opciones post-venta
    // Reiniciar la fecha de emisión a HOY y limpiar el flag de edición manual, para
    // que cada nueva venta tome la fecha actual del sistema (no una fecha "congelada").
    setEmissionDate(getLocalDateString())
    emissionDateEditedRef.current = false
    setDiscountAmount('')
    setDiscountPercentage('')
    // Reset observaciones generales
    setGeneralNotes('')
    setShowNotesSection(false)
    // Reset forma de pago
    setPaymentType('contado')
    setPaymentDueDate('')
    setPaymentInstallments([])
    // Reset campos de referencia
    setGuideNumber('')
    setPurchaseOrderNumber('')
    setOrderNumber('')
    // Reset hora del evento de Meta Ads
    setMetaEventTime(getLocalDateTimeString())
    clearDraft() // Limpiar borrador de localStorage
  }

  // Cerrar el recordatorio de vuelto. El ticket ya se imprimió ANTES del aviso (el
  // aviso es lo último que ve el cajero), así que aquí solo se cierra. El modal de
  // opciones post-venta ya está abierto debajo (o se abre vía el efecto de abajo).
  const dismissChangeReminder = () => {
    setChangeReminder(null)
  }

  // Abrir el modal de opciones post-venta al completar una venta (una sola vez por venta;
  // postSaleHandledRef se libera al limpiar). Si el negocio tiene impresión automática Y
  // reinicio automático (flujo 100% automático), NO se abre el modal para no estorbar al
  // cajero rápido; si la auto-impresión falla, el carrito queda con el mini-aviso para reintentar.
  useEffect(() => {
    // Venta limpiada → reiniciar el guard de "una vez por venta"
    if (!lastInvoiceData || !saleCompleted) {
      postSaleHandledRef.current = false
      return
    }
    // Sin auto-impresión el recordatorio se muestra de inmediato: en ese caso esperar
    // a que el cajero lo cierre antes de abrir las opciones post-venta. Con auto-impresión
    // el aviso sale DESPUÉS del ticket (desde handlePrintTicket) y este modal ya está abierto.
    if (changeReminder) return
    if (!postSaleHandledRef.current) {
      postSaleHandledRef.current = true
      const fullyAuto = !!(companySettings?.autoPrintTicket && companySettings?.autoResetPOS)
      if (!fullyAuto) setPostSaleModalOpen(true)
    }
  }, [lastInvoiceData, saleCompleted, companySettings, changeReminder])

  // Buscar datos de DNI o RUC automáticamente
  const handleLookupDocument = async () => {
    const docNumber = customerData.documentNumber
    const docType = customerData.documentType

    if (!docNumber) {
      toast.error('Ingrese un número de documento para buscar')
      return
    }

    // SUNAT solo expone consulta para DNI y RUC. CE y Pasaporte se llenan manualmente.
    if (docType === ID_TYPES.CE || docType === ID_TYPES.PASSPORT) {
      toast.info('La búsqueda automática solo está disponible para DNI y RUC. Completa los datos manualmente.')
      return
    }

    setIsLookingUp(true)

    try {
      // Buscar si el cliente ya existe en la lista de clientes registrados
      const existingCustomer = customers.find(c => c.documentNumber === docNumber)

      let result

      // Determinar si es DNI o RUC según tipo explícito, con fallback por longitud
      const isDNI = docType === ID_TYPES.DNI || (!docType && docNumber.length === 8)
      const isRUC = docType === ID_TYPES.RUC || (!docType && docNumber.length === 11)

      if (isDNI) {
        if (docNumber.length !== 8) {
          toast.error('El DNI debe tener 8 dígitos')
          return
        }
        result = await consultarDNI(docNumber)
      } else if (isRUC) {
        if (docNumber.length !== 11) {
          toast.error('El RUC debe tener 11 dígitos')
          return
        }
        result = await consultarRUC(docNumber)
      } else {
        toast.error('El documento debe tener 8 dígitos (DNI) o 11 dígitos (RUC)')
        return
      }

      if (result.success) {
        // Si el cliente ya existe localmente, fijarlo para que aparezcan sus mascotas (chips).
        if (existingCustomer) setSelectedCustomer(existingCustomer)
        // Autocompletar datos de SUNAT + datos locales del cliente registrado
        if (docNumber.length === 8) {
          // Datos de DNI
          setCustomerData(prev => ({
            ...prev,
            name: result.data.nombreCompleto || '',
            // Completar con datos del cliente registrado (si existe)
            ...(existingCustomer && {
              phone: existingCustomer.phone || prev.phone || '',
              email: existingCustomer.email || prev.email || '',
              address: existingCustomer.address || prev.address || '',
              studentName: existingCustomer.studentName || prev.studentName || '',
              studentSchedule: existingCustomer.studentSchedule || prev.studentSchedule || '',
              vehiclePlate: existingCustomer.vehiclePlate || prev.vehiclePlate || '',
              vehicleModel: existingCustomer.vehicleModel || prev.vehicleModel || '',
              vehicleYear: existingCustomer.vehicleYear || prev.vehicleYear || '',
              // Veterinaria: traer la mascota del cliente local (si la tiene).
              petName: getPrimaryPet(existingCustomer)?.name || existingCustomer.petName || prev.petName || '',
            }),
          }))
          toast.success(`Datos encontrados: ${result.data.nombreCompleto}`)
        } else {
          // Datos de RUC
          setCustomerData(prev => ({
            ...prev,
            businessName: result.data.razonSocial || '',
            name: result.data.nombreComercial || '',
            address: result.data.direccion || '',
            // Completar con datos del cliente registrado (si existe)
            ...(existingCustomer && {
              phone: existingCustomer.phone || prev.phone || '',
              email: existingCustomer.email || prev.email || '',
              studentName: existingCustomer.studentName || prev.studentName || '',
              studentSchedule: existingCustomer.studentSchedule || prev.studentSchedule || '',
              vehiclePlate: existingCustomer.vehiclePlate || prev.vehiclePlate || '',
              vehicleModel: existingCustomer.vehicleModel || prev.vehicleModel || '',
              vehicleYear: existingCustomer.vehicleYear || prev.vehicleYear || '',
              // Veterinaria: traer la mascota del cliente local (si la tiene).
              petName: getPrimaryPet(existingCustomer)?.name || existingCustomer.petName || prev.petName || '',
            }),
          }))
          toast.success(`Datos encontrados: ${result.data.razonSocial}`)
        }

        // Si el cliente existe localmente, marcarlo como seleccionado
        if (existingCustomer) {
          setSelectedCustomer(existingCustomer)
        }
      } else {
        // SUNAT no encontró datos, pero si existe localmente, usar esos datos
        if (existingCustomer) {
          setSelectedCustomer(existingCustomer)
          setCustomerData(prev => ({
            ...prev,
            documentType: existingCustomer.documentType || prev.documentType,
            name: existingCustomer.name || prev.name || '',
            businessName: existingCustomer.businessName || prev.businessName || '',
            address: existingCustomer.address || prev.address || '',
            email: existingCustomer.email || prev.email || '',
            phone: existingCustomer.phone || prev.phone || '',
            studentName: existingCustomer.studentName || prev.studentName || '',
            studentSchedule: existingCustomer.studentSchedule || prev.studentSchedule || '',
            vehiclePlate: existingCustomer.vehiclePlate || prev.vehiclePlate || '',
            vehicleModel: existingCustomer.vehicleModel || prev.vehicleModel || '',
            vehicleYear: existingCustomer.vehicleYear || prev.vehicleYear || '',
          }))
          toast.success(`Cliente registrado encontrado: ${existingCustomer.name || existingCustomer.businessName}`)
        } else {
          toast.error(result.error || 'No se encontraron datos para este documento', 5000)
        }
      }
    } catch (error) {
      console.error('Error al buscar documento:', error)
      toast.error('Error al consultar el documento. Verifique su conexión.', 5000)
    } finally {
      setIsLookingUp(false)
    }
  }

  // Consultar los establecimientos (anexos) del RUC. Si hay varios, abre un modal
  // para elegir la dirección; si hay uno solo, la aplica directo. Es una consulta
  // aparte a la API (1 crédito), por eso va con botón explícito.
  const handleViewEstablishments = async () => {
    const ruc = (customerData.documentNumber || '').replace(/\D/g, '')
    if (ruc.length !== 11) {
      toast.error('Ingresa un RUC válido (11 dígitos) primero')
      return
    }
    setLoadingEstablishments(true)
    try {
      const res = await consultarEstablecimientos(ruc)
      if (!res.success) {
        toast.error(res.error || 'No se pudieron obtener los establecimientos', 5000)
        return
      }
      const list = res.data || []
      if (list.length === 0) {
        toast.info('Este RUC no tiene locales anexos en SUNAT — se mantiene el domicilio fiscal')
        return
      }
      if (list.length === 1) {
        const dir = list[0].direccionCompleta || list[0].direccion || ''
        if (dir) setCustomerData(prev => ({ ...prev, address: dir }))
        toast.success('Este RUC tiene un solo establecimiento. Dirección actualizada.')
        return
      }
      setEstablishments(list)
      setShowEstablishmentsModal(true)
    } catch (error) {
      console.error('Error al consultar establecimientos:', error)
      toast.error('Error al consultar establecimientos. Verifique su conexión.', 5000)
    } finally {
      setLoadingEstablishments(false)
    }
  }

  // Elegir un establecimiento del modal → poner su dirección en el cliente.
  const handleSelectEstablishment = (est) => {
    const dir = est.direccionCompleta || est.direccion || ''
    if (dir) setCustomerData(prev => ({ ...prev, address: dir }))
    setShowEstablishmentsModal(false)
    toast.success('Dirección del establecimiento aplicada')
  }

  // Actualizar tipo de documento del cliente cuando cambia el tipo de comprobante
  const prevDocTypeRef = useRef(documentType)
  useEffect(() => {
    const prevDocType = prevDocTypeRef.current
    prevDocTypeRef.current = documentType
    // Factura fuerza RUC (obligatorio por SUNAT).
    if (documentType === 'factura') {
      setCustomerData(prev => ({
        ...prev,
        documentType: ID_TYPES.RUC
      }))
    } else if (prevDocType === 'factura' && customerData.documentType === ID_TYPES.RUC) {
      // Al SALIR de factura, el RUC que factura forzó ya no aplica: volver a DNI.
      // Sin esto la interfaz seguía mostrando el campo RUC/razón social en la boleta
      // (desync: se ve "factura" pero el comprobante es boleta) y la búsqueda de
      // documento fallaba porque el número era un RUC pero se validaba como DNI.
      // Solo se resetea en la TRANSICIÓN factura→otro; un RUC elegido a mano en
      // boleta (prevDocType no es factura) se conserva.
      setCustomerData(prev => ({
        ...prev,
        documentType: ID_TYPES.DNI
      }))
    } else if (documentType === 'boleta' && !customerData.documentType) {
      // Default DNI si no hay tipo seleccionado
      setCustomerData(prev => ({
        ...prev,
        documentType: ID_TYPES.DNI
      }))
    }

    // Resetear detracción/retención cuando no es factura (ambas son factura-only)
    if (documentType !== 'factura') {
      setHasDetraction(false)
      setDetractionType('')
      setDetractionBankAccount('')
      setHasRetencion(false)
    }
  }, [documentType])

  // Sin conexión SUNAT (y sin override del admin): forzar Nota de Venta. Boleta y
  // factura quedan ocultas del selector; esto corrige el default si era 'boleta'.
  useEffect(() => {
    if (!canEmitFiscal && (documentType === 'boleta' || documentType === 'factura')) {
      setDocumentType('nota_venta')
    }
  }, [canEmitFiscal, documentType])

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

  // Recargo por pago con tarjeta: cuando el pago es 100% con tarjeta y el feature
  // está activo (Configuración > Ventas), se SUBE el precio de cada ítem por el %.
  // No es una línea aparte: el comprobante (incluida boleta/factura a SUNAT) sale
  // con el precio ya recargado, como una venta normal. Así el IGV queda correcto
  // sobre el total y no hay que declarar ningún "cargo" especial.
  const cardSurchargeFactor = React.useMemo(() => {
    if (!cardCommissionConfig.enabled) return 1
    const rate = Number(cardCommissionConfig.rate) || 0
    if (rate <= 0) return 1
    const isCardOnly = payments.length > 0 && payments.every(p => p.method === 'CARD')
    return isCardOnly ? 1 + rate / 100 : 1
  }, [cardCommissionConfig, payments])

  // Carrito "efectivo": el mismo carrito pero con los precios escalados por el
  // recargo de tarjeta (cuando aplica). Se usa para los totales y para los ítems
  // del comprobante, así todo queda consistente con lo que se envía a SUNAT.
  const effectiveCart = React.useMemo(() => {
    if (cardSurchargeFactor === 1) return cart
    const scale = (v) => Math.round((Number(v) || 0) * cardSurchargeFactor * 100) / 100
    return cart.map(item => ({
      ...item,
      price: scale(item.price),
      ...(item.basePrice != null ? { basePrice: scale(item.basePrice) } : {}),
      ...(item.itemDiscount ? { itemDiscount: scale(item.itemDiscount) } : {}),
    }))
  }, [cart, cardSurchargeFactor])

  // Calcular montos sin descuento (optimizado con useMemo)
  const amounts = React.useMemo(() => {
    // Calcular total de descuentos por ítem
    const totalItemDiscounts = effectiveCart.reduce((sum, item) => sum + (item.itemDiscount || 0), 0)

    // Usar calculateMixedInvoiceAmounts para manejar productos con diferentes taxAffectation
    // Aplicamos el precio efectivo considerando el descuento por ítem
    const baseAmounts = calculateMixedInvoiceAmounts(
      effectiveCart.map(item => {
        const lineTotal = item.price * item.quantity
        const itemDiscount = item.itemDiscount || 0
        // Calcular precio efectivo por unidad después del descuento del ítem
        const effectivePrice = itemDiscount > 0
          ? (lineTotal - itemDiscount) / item.quantity
          : item.price
        return {
          price: effectivePrice,
          quantity: item.quantity,
          taxAffectation: taxConfig.igvExempt ? '20' : (item.taxAffectation || '10'), // Si empresa exonerada, forzar exonerado
          igvRate: taxConfig.igvExempt ? 0 : (taxConfig.taxType === 'reduced' ? taxConfig.igvRate : item.igvRate), // Ley restaurantes: forzar tasa global
        }
      }),
      taxConfig.igvRate
    )

    // Aplicar descuento GLOBAL al TOTAL (no al subtotal) para que sea más intuitivo
    const globalDiscount = parseFloat(discountAmount) || 0

    // Descuento total = descuentos por ítem + descuento global
    const totalDiscount = totalItemDiscounts + globalDiscount

    // El descuento global se aplica al total (con IGV incluido)
    const totalAfterDiscount = Math.max(0, baseAmounts.total - globalDiscount)

    // Calcular proporción del descuento para aplicarlo a cada tipo
    const discountRatio = baseAmounts.total > 0 ? totalAfterDiscount / baseAmounts.total : 1

    // Recalcular montos con descuento aplicado proporcionalmente
    const gravadoAfterDiscount = baseAmounts.gravado.total * discountRatio
    const exoneradoAfterDiscount = baseAmounts.exonerado.total * discountRatio
    const inafectoAfterDiscount = baseAmounts.inafecto.total * discountRatio

    // Recalcular IGV proporcionalmente (correcto con tasas mixtas 18%/10%)
    const subtotalGravadoAfterDiscount = baseAmounts.gravado.subtotal * discountRatio
    const igvAfterDiscount = baseAmounts.gravado.igv * discountRatio

    // Subtotal total = subtotal gravado + exonerado + inafecto
    const subtotalAfterDiscount = subtotalGravadoAfterDiscount + exoneradoAfterDiscount + inafectoAfterDiscount

    // Calcular Recargo al Consumo (solo si está habilitado y es restaurante)
    // El RC se calcula sobre el subtotal SIN IGV y NO forma parte de la base imponible del IGV
    let recargoConsumo = 0
    if (recargoConsumoConfig.enabled && businessMode === 'restaurant') {
      recargoConsumo = calculateRecargoConsumo(subtotalAfterDiscount, recargoConsumoConfig.rate)
    }

    // Total final = total con IGV + recargo al consumo
    const totalFinal = totalAfterDiscount + recargoConsumo

    // Desglose de IGV por tasa, con descuento aplicado proporcionalmente
    const igvByRate = {}
    if (baseAmounts.igvByRate) {
      for (const rate in baseAmounts.igvByRate) {
        igvByRate[rate] = {
          igv: Number((baseAmounts.igvByRate[rate].igv * discountRatio).toFixed(2)),
        }
      }
    }

    // Multi-divisa: equivalentes en moneda base (PEN).
    //
    // Si todos los items tienen basePrice (PEN como source of truth),
    // recalculamos los *InBase corriendo el mismo cálculo de impuestos
    // pero con precios en PEN. Esto evita el error de redondeo
    // S/300 → $92.31 → S/300.01 que ocurre al hacer (totalUSD × TC).
    //
    // Si no hay basePrice (carrito legacy o PEN puro), conversión directa.
    const allItemsHaveBase = currency === 'USD'
      && effectiveCart.length > 0
      && effectiveCart.every(item => Number(item.basePrice) > 0)

    let subtotalInBase, igvInBase, totalInBase
    if (allItemsHaveBase) {
      // Recalcular en PEN base usando basePrices (sin pérdida de precisión).
      // Los itemDiscount y globalDiscount están en USD → convertir a PEN.
      const baseAmountsInPEN = calculateMixedInvoiceAmounts(
        effectiveCart.map(item => {
          const basePriceVal = Number(item.basePrice) || 0
          const lineTotalPEN = basePriceVal * item.quantity
          const itemDiscountInPEN = (item.itemDiscount || 0) > 0
            ? convertToBase(item.itemDiscount, 'USD', exchangeRate)
            : 0
          const effectivePricePEN = itemDiscountInPEN > 0
            ? (lineTotalPEN - itemDiscountInPEN) / item.quantity
            : basePriceVal
          return {
            price: effectivePricePEN,
            quantity: item.quantity,
            taxAffectation: taxConfig.igvExempt ? '20' : (item.taxAffectation || '10'),
            igvRate: taxConfig.igvExempt ? 0 : (taxConfig.taxType === 'reduced' ? taxConfig.igvRate : item.igvRate),
          }
        }),
        taxConfig.igvRate
      )
      const globalDiscountInPEN = convertToBase(globalDiscount, 'USD', exchangeRate)
      const totalPENAfterDiscount = Math.max(0, baseAmountsInPEN.total - globalDiscountInPEN)
      const ratioPEN = baseAmountsInPEN.total > 0 ? totalPENAfterDiscount / baseAmountsInPEN.total : 1
      totalInBase = totalPENAfterDiscount
      subtotalInBase = (baseAmountsInPEN.gravado.subtotal + baseAmountsInPEN.exonerado.total + baseAmountsInPEN.inafecto.total) * ratioPEN
      igvInBase = baseAmountsInPEN.gravado.igv * ratioPEN
    } else {
      // PEN session o legacy: convertir directo desde session totals.
      subtotalInBase = convertToBase(subtotalAfterDiscount, currency, exchangeRate)
      igvInBase = convertToBase(igvAfterDiscount, currency, exchangeRate)
      totalInBase = convertToBase(totalFinal, currency, exchangeRate)
    }

    return {
      subtotal: Number(baseAmounts.subtotal.toFixed(2)),
      discount: Number(totalDiscount.toFixed(2)), // Total de descuentos (ítems + global)
      globalDiscount: Number(globalDiscount.toFixed(2)),
      itemDiscounts: Number(totalItemDiscounts.toFixed(2)),
      subtotalAfterDiscount: Number(subtotalAfterDiscount.toFixed(2)),
      igv: Number(igvAfterDiscount.toFixed(2)),
      igvByRate,
      recargoConsumo: Number(recargoConsumo.toFixed(2)),
      recargoConsumoRate: recargoConsumoConfig.enabled ? recargoConsumoConfig.rate : 0,
      total: Number(totalFinal.toFixed(2)),
      // Equivalentes en PEN base
      subtotalInBase: Number(subtotalInBase.toFixed(2)),
      igvInBase: Number(igvInBase.toFixed(2)),
      totalInBase: Number(totalInBase.toFixed(2)),
      // Montos por tipo de afectación (para mostrar desglose)
      gravado: baseAmounts.gravado,
      exonerado: baseAmounts.exonerado,
      inafecto: baseAmounts.inafecto,
    }
  }, [effectiveCart, taxConfig.igvRate, discountAmount, recargoConsumoConfig, businessMode, currency, exchangeRate])

  // Actualizar pantalla de cliente cuando cambia el carrito
  useEffect(() => {
    if (!companySettings?.enableCustomerDisplay) return
    if (saleCompleted) return // No actualizar durante pantalla de "completado"
    if (cart.length === 0) {
      CustomerDisplay.showWelcome()
    } else {
      CustomerDisplay.updateCart(cart, amounts)
    }
  }, [cart, amounts, companySettings?.enableCustomerDisplay, saleCompleted])

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

    // Saldo a favor: el monto no puede exceder lo disponible del cliente.
    const creditCap = method === 'CREDIT_NOTE' ? customerStoreCredit.total : Infinity

    // Auto-fill del monto. Para UN solo pago NO tocamos el monto acá (evita el
    // parpadeo del botón): solo marcamos para que un layout-effect lo complete con
    // el total YA recalculado (incluye el recargo por tarjeta), antes del paint.
    // Para pagos múltiples mantenemos el autocompletado con el saldo.
    // Excepción: saldo a favor se autocompleta acá con el tope (no por el effect).
    if (method === 'CREDIT_NOTE') {
      const base = newPayments.length === 1 ? amounts.total : remaining
      newPayments[index].amount = Math.max(0, Math.min(base, creditCap)).toString()
    } else if (newPayments.length === 1) {
      pendingAmountSyncRef.current = true
    } else if (!newPayments[index].amount && payments.length > 1) {
      newPayments[index].amount = remaining.toString()
    }

    setPayments(newPayments)

    // UX: tras elegir el método, mover el foco para poder procesar con Enter sin
    // usar el mouse. Si es EFECTIVO y hay un solo pago, enfocamos y SELECCIONAMOS
    // el campo del monto (el cajero suele tipear lo que recibe para dar vuelto),
    // así sobrescribe el total y aprieta Enter. Para el resto, foco al botón.
    // setTimeout(0) deja que React termine el re-render (y el autollenado del
    // monto) antes de aplicar el focus.
    setTimeout(() => {
      if (method === 'CASH' && newPayments.length === 1 && cashAmountInputRef.current) {
        cashAmountInputRef.current.focus()
        try { cashAmountInputRef.current.select() } catch (_) {}
      } else {
        checkoutButtonRef.current?.focus()
      }
    }, 0)
  }

  // Tras cambiar el método de un único pago, completa el monto con el total ya
  // recalculado (incluye el recargo por tarjeta). Se usa useLayoutEffect (no
  // useEffect) para que el monto se actualice ANTES del paint y NO se vea el
  // parpadeo del botón. Solo actúa cuando lo marca handlePaymentMethodChange.
  React.useLayoutEffect(() => {
    if (!pendingAmountSyncRef.current) return
    pendingAmountSyncRef.current = false
    if (payments.length !== 1) return
    if (!(amounts.total > 0)) return
    const next = amounts.total.toString()
    setPayments(prev => {
      if (prev.length !== 1 || prev[0].amount === next) return prev
      return [{ ...prev[0], amount: next }]
    })
  }, [amounts.total, payments])

  // Actualizar monto de pago
  const handlePaymentAmountChange = (index, amount) => {
    const newPayments = [...payments]
    // Saldo a favor: clamp al disponible del cliente.
    if (newPayments[index].method === 'CREDIT_NOTE') {
      const num = parseFloat(amount)
      if (!Number.isNaN(num) && num > customerStoreCredit.total) {
        amount = customerStoreCredit.total.toString()
      }
    }
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

  // Mantener el monto del pago sincronizado con el total cuando hay un solo método
  // Esto cubre: recargo al consumo que carga después, cambios de cantidad, descuentos, etc.
  useEffect(() => {
    if (saleCompleted) return
    setPayments(prev => {
      if (prev.length !== 1 || !prev[0].method) return prev
      // Saldo a favor: capear al disponible (no llenar con el total completo).
      const cap = prev[0].method === 'CREDIT_NOTE'
        ? Math.min(amounts.total, customerStoreCredit.total)
        : amounts.total
      const newAmount = cap > 0 ? cap.toString() : ''
      if (prev[0].amount === newAmount) return prev
      return [{ ...prev[0], amount: newAmount }]
    })
  }, [amounts.total, saleCompleted, customerStoreCredit.total])

  // Eliminar un método de pago
  const handleRemovePaymentMethod = (index) => {
    if (payments.length > 1) {
      setPayments(payments.filter((_, i) => i !== index))
    }
  }


  const checkoutGuardRef = React.useRef(false)
  const handleCheckout = async () => {
    if (!user?.uid) return
    if (isProcessing || checkoutGuardRef.current) return
    const _checkoutT0 = Date.now() // diagnóstico: tiempo total desde el clic
    console.log('🛒 handleCheckout: iniciando proceso de venta', {
      itemsEnCarrito: cart.length,
      tipoDoc: documentType,
      total: amounts?.total,
    })
    // Validaciones rápidas (antes de bloquear UI)
    if (companySettings?.requireOpenCashRegister && !cashRegisterOpen) {
      toast.error('Debe abrir la caja diaria antes de emitir ventas')
      return
    }
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
    }
    if (!documentType) {
      toast.error('Selecciona el tipo de comprobante antes de emitir')
      return
    }

    // Sin conexión SUNAT (ni override del admin): no se permiten comprobantes fiscales.
    if ((documentType === 'boleta' || documentType === 'factura') && !canEmitFiscal) {
      toast.error('Este negocio no tiene conexión con SUNAT. Solo puede emitir Nota de Venta. Contacta al administrador para habilitar comprobantes.')
      return
    }

    checkoutGuardRef.current = true
    setIsProcessing(true)
    setChangeReminder(null) // Limpiar recordatorio de vuelto de la venta anterior
    pendingChangeReminderRef.current = null // ...y el que hubiera quedado pendiente de imprimir

    // Helper para abortar validación y desbloquear UI
    const abortCheckout = (msg, opts) => {
      toast.error(msg, opts)
      setIsProcessing(false); checkoutGuardRef.current = false
    }

    const businessId = getBusinessId()

    // Fecha de emisión: usar SIEMPRE la fecha actual del sistema, salvo que el usuario
    // haya elegido manualmente una fecha personalizada (opción activada + campo editado
    // a mano). Esto evita que una pestaña del POS abierta de un día para otro "congele"
    // la fecha y emita las ventas de hoy con la fecha de ayer.
    const currentDate = getLocalDateString()
    const useCustomDate = emissionDateEditedRef.current
    const emissionDateToUse = useCustomDate ? emissionDate : currentDate
    if (emissionDate !== emissionDateToUse) {
      setEmissionDate(emissionDateToUse)
    }

    // Validar stock de ingredientes de recetas.
    // Se omite cuando `allowNegativeStock` está activo: si el dueño aceptó vender
    // sin stock de productos terminados, también aceptamos vender platos con
    // receta aunque falten insumos (los insumos se descuentan a negativo).
    if (!companySettings?.allowNegativeStock) {
      const allMissingIngredients = []

      // Leer TODAS las recetas en UNA sola consulta (antes era 1 query por ítem → ~N queries
      // en fila, el verdadero cuello ANTES de guardar la factura). Mapa productId -> receta.
      const _valRecipeByProduct = new Map()
      try {
        const { collection: _vc, getDocs: _vg } = await import('firebase/firestore')
        const { db: _vdb } = await import('@/lib/firebase')
        const _vsnap = await _vg(_vc(_vdb, 'businesses', businessId, 'recipes'))
        _vsnap.forEach(d => { const r = { id: d.id, ...d.data() }; if (r.productId) _valRecipeByProduct.set(r.productId, r) })
      } catch (e) {
        console.warn('No se pudieron leer recetas para validación:', e)
      }

      // Solo los ítems con receta que descuenta al vender requieren validar insumos.
      const _itemsToCheck = cart.filter(item => {
        if (item.isCustom) return false
        const r = _valRecipeByProduct.get(item.id)
        return r && shouldDeductIngredients(r, businessMode)
      })

      // Validar en PARALELO (antes era en serie).
      const _checks = await Promise.all(_itemsToCheck.map(async (item) => {
        try {
          const stockCheck = await checkRecipeStock(businessId, item.id, item.quantity)
          return { item, stockCheck }
        } catch (error) {
          console.warn(`No se pudo verificar receta de ${item.name}:`, error)
          return { item, stockCheck: null }
        }
      }))

      for (const { item, stockCheck } of _checks) {
        if (stockCheck && stockCheck.success && !stockCheck.hasStock) {
          stockCheck.missingIngredients.forEach(ing => {
            allMissingIngredients.push({
              product: item.name,
              ingredient: ing.name,
              available: ing.available,
              needed: ing.needed,
              unit: ing.unit
            })
          })
        }
      }

      if (allMissingIngredients.length > 0) {
        // Agrupar por ingrediente para mostrar mensaje más claro
        const ingredientSummary = allMissingIngredients.reduce((acc, item) => {
          const key = item.ingredient
          if (!acc[key]) {
            acc[key] = { available: item.available, needed: 0, unit: item.unit }
          }
          acc[key].needed += item.needed
          return acc
        }, {})

        // Lista de insumos faltantes para mostrar en el modal de aviso
        const missingItems = Object.entries(ingredientSummary).map(([name, data]) => ({
          name,
          needed: data.needed,
          available: data.available,
          unit: data.unit,
        }))

        // Log explícito en consola para depurar.
        console.error('🛑 Venta abortada: faltan ingredientes de receta', {
          ingredientes: ingredientSummary,
          detalle: allMissingIngredients,
        })

        // Aviso bien visible: modal que no se pierde + toast de respaldo.
        // NOTA: la duración del toast debe ser un NÚMERO (ms), no un objeto;
        // antes se pasaba { duration: 7000 } y el toast se cerraba al instante.
        setMissingIngredientsAlert({ items: missingItems })
        toast.error('No hay suficiente stock de insumos para procesar la venta', 7000)
        setIsProcessing(false)
        checkoutGuardRef.current = false
        return
      } else {
        console.log('✅ Validación de ingredientes OK')
      }
    }

    // Validar consistencia del modo edición
    if (editingInvoiceId && !editingInvoiceData) {
      console.error('⚠️ Estado inconsistente: editingInvoiceId definido pero editingInvoiceData es null')
      abortCheckout('Error de estado. Por favor, recarga la página e intenta nuevamente.')
      return
    }

    // Si es factura, validar datos de RUC
    if (documentType === 'factura') {
      if (!customerData.documentNumber || customerData.documentNumber.length !== 11) {
        abortCheckout('Las facturas requieren un RUC válido (11 dígitos)')
        return
      }
      if (!customerData.businessName) {
        abortCheckout('La razón social es requerida para facturas')
        return
      }
    }

    // Si tiene detracción, validar que exista cuenta del Banco de la Nación
    if (hasDetraction && detractionType) {
      let bnAccount = detractionBankAccount
      if (!bnAccount && companySettings?.bankAccountsList && Array.isArray(companySettings.bankAccountsList)) {
        bnAccount = companySettings.bankAccountsList.find(acc => acc.accountType === 'detracciones')?.accountNumber
      }
      if (!bnAccount) {
        abortCheckout('Para emitir con detraccion debes configurar tu cuenta del Banco de la Nacion en Ajustes > Cuentas bancarias (tipo "detracciones")')
        return
      }
    }

    // Si es boleta mayor a 700 soles, validar DNI obligatorio (según normativa SUNAT).
    // Se compara el total en SOLES (totalInBase) para que aplique también a boletas en USD.
    if (documentType === 'boleta' && amounts.totalInBase > 700) {
      if (!customerData.documentNumber) {
        abortCheckout('Por normativa SUNAT, las boletas mayores a S/ 700.00 requieren documento del cliente')
        return
      }
      if (customerData.documentType === ID_TYPES.DNI && customerData.documentNumber.length !== 8) {
        abortCheckout('El DNI debe tener 8 dígitos')
        return
      }
      if (customerData.documentType === ID_TYPES.CE && customerData.documentNumber.length < 9) {
        abortCheckout('El Carnet de Extranjería debe tener al menos 9 caracteres')
        return
      }
      // Para RUC, la razón social va en businessName; para DNI/CE/Pasaporte
      // va en name. Aceptamos cualquiera de los dos para no bloquear boletas
      // con RUC (caso real reportado: I.E.E. con RUC válido pero name vacío).
      const hasIdentityName = (customerData.name && customerData.name.trim() !== '')
        || (customerData.businessName && customerData.businessName.trim() !== '')
      if (!hasIdentityName) {
        abortCheckout('Por normativa SUNAT, las boletas mayores a S/ 700.00 requieren el nombre o razón social del cliente')
        return
      }
    }

    // Si es boleta, validar datos mínimos
    if (documentType === 'boleta' && customerData.documentNumber) {
      if (customerData.documentType === ID_TYPES.RUC) {
        if (customerData.documentNumber.length !== 11) {
          abortCheckout('El RUC debe tener 11 dígitos')
          return
        }
      } else if (customerData.documentType === ID_TYPES.DNI) {
        if (customerData.documentNumber.length !== 8) {
          abortCheckout('El DNI debe tener 8 dígitos')
          return
        }
      } else if (customerData.documentType === ID_TYPES.CE) {
        if (customerData.documentNumber.length < 9) {
          abortCheckout('El Carnet de Extranjería debe tener al menos 9 caracteres')
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
    // Tolerancia de medio centavo para evitar falsos negativos por imprecisión de
    // punto flotante (p.ej. 27.9 + 46.80 = 74.69999... < 74.70 en JS).
    const PAYMENT_EPSILON = 0.005
    if (!isCreditSale && !isHidePaymentMethods && totalPaid < amountToPay - PAYMENT_EPSILON) {
      abortCheckout(`Falta pagar ${formatCurrency(remaining)}. Agrega más métodos de pago.`)
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
      // Limitar montos para que la suma no exceda el total (el excedente es vuelto, no ingreso)
      let remainingToPay = amountToPay
      allPayments = payments
        .filter(p => p.method && parseFloat(p.amount) > 0)
        .map(p => {
          const paid = parseFloat(p.amount)
          const effectiveAmount = Math.min(paid, remainingToPay)
          remainingToPay = Math.round((remainingToPay - effectiveAmount) * 100) / 100
          return {
            method: PAYMENT_METHODS[p.method],
            methodKey: p.method,
            amount: effectiveAmount
          }
        })
    }

    // Validar que haya al menos un método de pago
    // EXCEPCIÓN: Si es venta al crédito, no requiere método de pago
    if (!isCreditSale && allPayments.length === 0) {
      abortCheckout('Debes seleccionar al menos un método de pago')
      return
    }

    // Saldo a favor aplicado (monto efectivo, ya capeado al total). No puede
    // exceder el disponible del cliente. La redención se registra tras guardar.
    const creditApplied = allPayments
      .filter(p => p.methodKey === 'CREDIT_NOTE')
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
    if (creditApplied > customerStoreCredit.total + PAYMENT_EPSILON) {
      abortCheckout(`El saldo a favor aplicado (${formatCurrency(creditApplied)}) supera el disponible (${formatCurrency(customerStoreCredit.total)}).`)
      return
    }

    try {
      // MODO DEMO: Simular venta sin guardar en Firebase
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Procesando venta simulada...')
        // Simular un delay para hacer más realista
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Preparar items de la factura (effectiveCart = precios con recargo de tarjeta si aplica)
        const items = effectiveCart.map(item => ({
          productId: item.id,
          code: item.sku || item.code || '',
          name: item.presentationName ? `${item.name} (${item.presentationName})` : item.name,
          quantity: item.quantity,
          unit: item.unit || 'NIU',
          unitPrice: item.price,
          ...(() => { const c = computeItemCostAtSale(item); return c != null ? { costAtSale: c } : {} })(), // costo congelado al momento de la venta (reportes de margen)
          ...(item.imageUrl && { imageUrl: item.imageUrl }), // imagen del producto para el PDF de comprobante (opción showImagesInInvoices)
        ...(item.description && { description: item.description }), // descripción del producto para el PDF (opción showProductDescriptionInInvoice)
          ...(currency === 'USD' && Number(item.basePrice) > 0 && {
            basePrice: Number(item.basePrice),
          }),
          subtotal: item.price * item.quantity,
          taxAffectation: taxConfig.igvExempt ? '20' : (item.taxAffectation || '10'), // Si empresa exonerada, forzar exonerado
          ...(item.observations && { observations: item.observations }),
          ...(item.itemDiscount > 0 && { itemDiscount: item.itemDiscount }),
          ...(item.presentationName && { presentationName: item.presentationName, presentationFactor: item.presentationFactor }),
          ...(item.batchNumber && { batchNumber: item.batchNumber }),
          ...(item.batchExpiryDate && { batchExpiryDate: item.batchExpiryDate }),
          ...(item.serialNumber && { serialNumber: item.serialNumber }),
          ...(item.modifiers && { modifiers: item.modifiers }),
          ...(item.laboratoryName && { laboratoryName: item.laboratoryName }),
          ...(item.marca && { marca: item.marca }),
          ...(item.genericName && { genericName: item.genericName }),
          ...(item.concentration && { concentration: item.concentration }),
          ...(item.presentation && { presentation: item.presentation }),
          ...(item.activeIngredient && { activeIngredient: item.activeIngredient }),
          ...(item.sanitaryRegistry && { sanitaryRegistry: item.sanitaryRegistry }),
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
                documentType: documentType === 'factura' ? ID_TYPES.RUC : inferDocumentType(customerData.documentType, customerData.documentNumber),
                documentNumber: customerData.documentNumber || '00000000',
                name: documentType === 'factura'
                  ? (customerData.businessName || customerData.name || 'Cliente')
                  : (customerData.name || customerData.businessName || 'Cliente'),
                businessName: customerData.businessName || '',
                email: customerData.email || '',
                phone: customerData.phone || '',
                address: customerData.address || '',
                studentName: customerData.studentName || '',
                studentSchedule: customerData.studentSchedule || '',
                petName: customerData.petName || '',
                vehiclePlate: customerData.vehiclePlate || '',
                vehicleModel: customerData.vehicleModel || '',
                vehicleYear: customerData.vehicleYear || '',
                // Campos de transporte de carga
                originAddress: customerData.originAddress || '',
                destinationAddress: customerData.destinationAddress || '',
                tripDetail: customerData.tripDetail || '',
                serviceReferenceValue: customerData.serviceReferenceValue || '',
                effectiveLoadValue: customerData.effectiveLoadValue || '',
                usefulLoadValue: customerData.usefulLoadValue || '',
                bankAccount: customerData.bankAccount || '',
                detractionPercentage: customerData.detractionPercentage || '',
                detractionAmount: customerData.detractionAmount || '',
                goodsServiceCode: customerData.goodsServiceCode || '',
              }
            : {
                documentType: ID_TYPES.DNI,
                documentNumber: '00000000',
                name: 'Cliente General',
                businessName: '',
                email: '',
                phone: '',
                address: '',
                studentName: customerData.studentName || '',
                studentSchedule: customerData.studentSchedule || '',
                petName: customerData.petName || '',
                vehiclePlate: customerData.vehiclePlate || '',
                vehicleModel: customerData.vehicleModel || '',
                vehicleYear: customerData.vehicleYear || '',
                // Campos de transporte de carga
                originAddress: customerData.originAddress || '',
                destinationAddress: customerData.destinationAddress || '',
                tripDetail: customerData.tripDetail || '',
                serviceReferenceValue: customerData.serviceReferenceValue || '',
                effectiveLoadValue: customerData.effectiveLoadValue || '',
                usefulLoadValue: customerData.usefulLoadValue || '',
                bankAccount: customerData.bankAccount || '',
                detractionPercentage: customerData.detractionPercentage || '',
                detractionAmount: customerData.detractionAmount || '',
                goodsServiceCode: customerData.goodsServiceCode || '',
              },
          items: items,
          subtotal: amounts.subtotalAfterDiscount, // Subtotal después del descuento (base imponible)
          subtotalBeforeDiscount: amounts.subtotal, // Subtotal original (antes del descuento)
          discount: amounts.discount || 0,
          globalDiscount: amounts.globalDiscount || 0, // Solo descuento global (sin item discounts) para XML
          discountPercentage: parseFloat(discountPercentage) || 0,
          igv: amounts.igv,
          igvByRate: amounts.igvByRate || {},
          total: amounts.total,
          // Multi-divisa (demo): mismo modelo que la creación real
          currency: normalizeCurrency(currency),
          exchangeRate: currency === 'USD' ? (Number(exchangeRate) || 1) : 1,
          subtotalInBase: amounts.subtotalInBase,
          igvInBase: amounts.igvInBase,
          totalInBase: amounts.totalInBase,
          // Montos por tipo de afectación tributaria
          opGravadas: amounts.gravado?.total || 0,
          opExoneradas: amounts.exonerado?.total || 0,
          opInafectas: amounts.inafecto?.total || 0,
          // Recargo al Consumo (para restaurantes)
          recargoConsumo: amounts.recargoConsumo || 0,
          recargoConsumoRate: amounts.recargoConsumoRate || 0,
          // Recargo por pago con tarjeta — dato interno (los precios ya vienen
          // recargados; esto es solo para reportes, no se muestra en el comprobante).
          cardCommissionApplied: cardSurchargeFactor > 1,
          cardCommissionRate: cardSurchargeFactor > 1 ? (Number(cardCommissionConfig.rate) || 0) : 0,
          cardCommissionAmount: cardSurchargeFactor > 1 ? Number((amounts.total - amounts.total / cardSurchargeFactor).toFixed(2)) : 0,
          payments: allPayments,
          paymentMethod: allPayments.length > 0 ? allPayments[0].method : 'Efectivo',
          // Vuelto (cambio que se devuelve al cliente). Solo aplica a pagos al contado.
          change: (!isCreditSaleDemo && totalPaid > amounts.total)
            ? Math.round((totalPaid - amounts.total) * 100) / 100
            : 0,
          // Monto entregado por el cliente (solo cuando hay vuelto)
          amountReceived: (!isCreditSaleDemo && totalPaid > amounts.total)
            ? Math.round(totalPaid * 100) / 100
            : 0,
          status: isCreditSaleDemo ? 'pending' : 'paid',
          notes: generalNotes || '',
          sunatStatus: 'not_applicable',
          sunatResponse: null,
          sunatSentAt: null,
          createdAt: new Date(emissionDateToUse + 'T12:00:00'),
          emissionDate: emissionDateToUse,
          // Hora del evento para Meta Ads (si está habilitado)
          ...(businessSettings?.metaAdsEnabled && metaEventTime && {
            metaEventTime: new Date(metaEventTime),
          }),
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
          studentName: '',
          studentSchedule: '',
          petName: '',
          vehiclePlate: '',
          vehicleModel: '',
          vehicleYear: '',
          // Campos de transporte de carga
          originAddress: '',
          destinationAddress: '',
          tripDetail: '',
          serviceReferenceValue: '',
          effectiveLoadValue: '',
          usefulLoadValue: '',
          bankAccount: '',
          detractionPercentage: '',
          detractionAmount: '',
          goodsServiceCode: '',
        })
        setPayments([{ id: Date.now(), method: getDefaultPaymentMethod(), amount: '' }])
        setSelectedCustomer(null)
        setDiscountAmount('')
        setDiscountPercentage('')

        setIsProcessing(false); checkoutGuardRef.current = false
        return
      }

      const isEditMode = !!editingInvoiceId

      // 1. En modo edición, obtener número existente. En modo normal, el número se genera atómicamente al crear la factura.
      let numberResult = null
      if (isEditMode) {
        // MODO EDICIÓN: Usar el número original del documento
        numberResult = {
          success: true,
          number: editingInvoiceData.number,
          series: editingInvoiceData.series,
          correlativeNumber: editingInvoiceData.correlativeNumber,
        }
        console.log('📝 Modo edición - Usando número original:', numberResult.number)
      }
      // NOTA: En modo normal, el número se genera atómicamente con createInvoiceWithNumber más adelante

      // 2. Preparar items de la factura (effectiveCart = precios con recargo de tarjeta si aplica)
      const items = effectiveCart.map(item => ({
        productId: item.id,
        code: item.sku || item.code || '', // Priorizar SKU, luego código, vacío si no hay
        name: item.presentationName ? `${item.name} (${item.presentationName})` : item.name,
        quantity: item.quantity,
        unit: item.unit || 'NIU',
        unitPrice: item.price,
        ...(() => { const c = computeItemCostAtSale(item); return c != null ? { costAtSale: c } : {} })(), // costo congelado al momento de la venta (reportes de margen)
        ...(item.imageUrl && { imageUrl: item.imageUrl }), // imagen del producto para el PDF de comprobante (opción showImagesInInvoices)
        ...(item.description && { description: item.description }), // descripción del producto para el PDF (opción showProductDescriptionInInvoice)
        // Multi-divisa: persistir basePrice (PEN exacto) cuando la venta es
        // USD, para que NC/ND/reportes futuros puedan reconstruir el
        // equivalente PEN sin pérdida de redondeo.
        ...(currency === 'USD' && Number(item.basePrice) > 0 && {
          basePrice: Number(item.basePrice),
        }),
        subtotal: item.price * item.quantity,
        taxAffectation: taxConfig.igvExempt ? '20' : (item.taxAffectation || '10'), // Si empresa exonerada, forzar exonerado
        ...(!taxConfig.igvExempt && (taxConfig.taxType === 'reduced' ? { igvRate: taxConfig.igvRate } : (item.igvRate ? { igvRate: item.igvRate } : {}))), // Ley restaurantes: forzar tasa global
        ...(item.observations && { observations: item.observations }), // Incluir observaciones si existen (IMEI, placa, serie, etc.)
        ...(item.itemDiscount > 0 && { itemDiscount: item.itemDiscount }), // Descuento por ítem para XML SUNAT
        ...(item.notes && { notes: item.notes }), // Incluir notas si existen
        ...(item.presentationName && { presentationName: item.presentationName, presentationFactor: item.presentationFactor }),
        ...(item.batchNumber && { batchNumber: item.batchNumber }),
        ...(item.batchExpiryDate && { batchExpiryDate: item.batchExpiryDate }),
        ...(item.serialNumber && { serialNumber: item.serialNumber }),
        ...(item.isVariant && { isVariant: true, variantSku: item.variantSku, variantAttributes: item.variantAttributes }),
        ...(item.laboratoryName && { laboratoryName: item.laboratoryName }),
        ...(item.marca && { marca: item.marca }),
        ...(item.genericName && { genericName: item.genericName }),
        ...(item.concentration && { concentration: item.concentration }),
        ...(item.presentation && { presentation: item.presentation }),
        ...(item.activeIngredient && { activeIngredient: item.activeIngredient }),
        ...(item.therapeuticAction && { therapeuticAction: item.therapeuticAction }),
        ...(item.saleCondition && { saleCondition: item.saleCondition }),
        ...(item.sanitaryRegistry && { sanitaryRegistry: item.sanitaryRegistry }),
        ...(item.modifiers && { modifiers: item.modifiers }),
      }))

      // 3. Crear factura
      // Lectura FRESH de autoSendToSunat para decidir el sunatStatus inicial:
      //   - true  → 'pending' (el cron retryPendingInvoices puede reenviarlo)
      //   - false → 'not_sent' (queda INVISIBLE para el cron, envío 100% manual)
      // Defensa en profundidad: aunque el cron ya verifica autoSendToSunat,
      // marcar diferente garantiza que NUNCA se procese automáticamente.
      let shouldAutoSendToSunat = false
      try {
        const freshSettings = await getCompanySettings(businessId)
        shouldAutoSendToSunat = freshSettings?.success === true && freshSettings.data?.autoSendToSunat === true
      } catch (settingsErr) {
        console.warn('No se pudo releer companySettings, usando valor en memoria:', settingsErr)
        shouldAutoSendToSunat = companySettings?.autoSendToSunat === true
      }

      // Calcular datos de pago parcial y ventas al crédito
      const partialAmount = parseFloat(partialPaymentAmount) || 0
      const isCreditSaleForNotaVenta = enablePartialPayment && partialAmount === 0 && documentType === 'nota_venta'
      const isCreditSaleForFactura = documentType === 'factura' && paymentType === 'credito'
      const isCreditSaleForInvoice = isCreditSaleForNotaVenta || isCreditSaleForFactura
      const isPartialPayment = enablePartialPayment && partialAmount > 0 && documentType === 'nota_venta'

      const amountPaid = isCreditSaleForInvoice ? 0 : (isPartialPayment ? partialAmount : amounts.total)
      const balance = isCreditSaleForInvoice ? amounts.total : (isPartialPayment ? amounts.total - amountPaid : 0)
      const paymentStatus = isCreditSaleForInvoice ? 'pending' : (isPartialPayment ? (balance > 0 ? 'partial' : 'completed') : 'completed')

      // Vuelto: solo aplica a pagos al contado (no crédito, no parcial) cuando el cliente
      // pagó más que el total. totalPaid viene del state del POS y refleja exactamente lo
      // que ingresó el cajero (NO el monto recortado a allPayments por effectiveAmount).
      const change = (!isCreditSaleForInvoice && !isPartialPayment && totalPaid > amounts.total)
        ? Math.round((totalPaid - amounts.total) * 100) / 100
        : 0
      // Monto entregado por el cliente (incluye el excedente que se devuelve como vuelto).
      // Para tickets: se muestra como "Pago con" cuando hay vuelto, para que el cliente vea
      // claro cuánto entregó vs. cuánto cubre el total.
      const amountReceived = change > 0 ? Math.round(totalPaid * 100) / 100 : 0

      // Recordatorio de vuelto (opcional): si el negocio activó la opción y la venta
      // se pagó en EFECTIVO con cambio, guardamos los datos para mostrar el aviso al
      // completar la venta. Si no aplica, queda null y no se muestra nada.
      const changeReminderData = (companySettings?.showChangeReminder && change > 0 && allPayments.some(p => p.methodKey === 'CASH'))
        ? { change, total: amounts.total, received: amountReceived, currency }
        : null

      console.log('🧾 [POS] Datos de pago parcial calculados:', {
        documentType,
        enablePartialPayment,
        partialAmount,
        isPartialPayment,
        amountPaid,
        balance,
        paymentStatus
      })

      const invoiceData = {
        // En modo edición, incluir número existente. En modo normal, se genera atómicamente al guardar.
        ...(isEditMode && {
          number: numberResult.number,
          series: numberResult.series,
          correlativeNumber: numberResult.correlativeNumber,
        }),
        documentType: documentType,
        // Guardar el ID del cliente si fue seleccionado de la lista
        ...(selectedCustomer?.id && { customerId: selectedCustomer.id }),
        customer: customerData.documentNumber || customerData.name || customerData.businessName
          ? {
              documentType: documentType === 'factura' ? ID_TYPES.RUC : inferDocumentType(customerData.documentType, customerData.documentNumber),
              documentNumber: customerData.documentNumber || '00000000',
              name: documentType === 'factura'
                ? (customerData.businessName || customerData.name || 'Cliente')
                : (customerData.name || customerData.businessName || 'Cliente'),
              businessName: customerData.businessName || '',
              code: selectedCustomer?.code || '',
              email: customerData.email || '',
              phone: customerData.phone || '',
              address: customerData.address || '',
              studentName: customerData.studentName || '',
              studentSchedule: customerData.studentSchedule || '',
              petName: customerData.petName || '',
              vehiclePlate: customerData.vehiclePlate || '',
              vehicleModel: customerData.vehicleModel || '',
              vehicleYear: customerData.vehicleYear || '',
              // Campos de transporte de carga
              originAddress: customerData.originAddress || '',
              destinationAddress: customerData.destinationAddress || '',
              tripDetail: customerData.tripDetail || '',
              serviceReferenceValue: customerData.serviceReferenceValue || '',
              effectiveLoadValue: customerData.effectiveLoadValue || '',
              usefulLoadValue: customerData.usefulLoadValue || '',
              bankAccount: customerData.bankAccount || '',
              detractionPercentage: customerData.detractionPercentage || '',
              detractionAmount: customerData.detractionAmount || '',
              goodsServiceCode: customerData.goodsServiceCode || '',
            }
          : {
              documentType: ID_TYPES.DNI,
              documentNumber: '00000000',
              name: 'Cliente General',
              businessName: '',
              email: '',
              phone: '',
              address: '',
              studentName: customerData.studentName || '',
              studentSchedule: customerData.studentSchedule || '',
              petName: customerData.petName || '',
              vehiclePlate: customerData.vehiclePlate || '',
              vehicleModel: customerData.vehicleModel || '',
              vehicleYear: customerData.vehicleYear || '',
              // Campos de transporte de carga
              originAddress: customerData.originAddress || '',
              destinationAddress: customerData.destinationAddress || '',
              tripDetail: customerData.tripDetail || '',
              serviceReferenceValue: customerData.serviceReferenceValue || '',
              effectiveLoadValue: customerData.effectiveLoadValue || '',
              usefulLoadValue: customerData.usefulLoadValue || '',
              bankAccount: customerData.bankAccount || '',
              detractionPercentage: customerData.detractionPercentage || '',
              detractionAmount: customerData.detractionAmount || '',
              goodsServiceCode: customerData.goodsServiceCode || '',
            },
        items: items,
        subtotal: amounts.subtotalAfterDiscount, // Subtotal después del descuento (base imponible)
        subtotalBeforeDiscount: amounts.subtotal, // Subtotal original (antes del descuento)
        discount: amounts.discount || 0,
        globalDiscount: amounts.globalDiscount || 0, // Solo descuento global (sin item discounts) para XML
        discountPercentage: parseFloat(discountPercentage) || 0,
        igv: amounts.igv,
        igvByRate: amounts.igvByRate || {},
        total: amounts.total,
        // Multi-divisa: moneda nativa del documento + TC CONGELADO. PEN=1
        // si no se activó multi-divisa o si se vende en soles. NUNCA se
        // recalculan a posteriori los *InBase (reportes históricos fijos).
        currency: normalizeCurrency(currency),
        exchangeRate: currency === 'USD' ? (Number(exchangeRate) || 1) : 1,
        subtotalInBase: amounts.subtotalInBase,
        igvInBase: amounts.igvInBase,
        totalInBase: amounts.totalInBase,
        // Montos por tipo de afectación tributaria
        opGravadas: amounts.gravado?.total || 0,
        opExoneradas: amounts.exonerado?.total || 0,
        opInafectas: amounts.inafecto?.total || 0,
        // Configuración de impuestos
        taxConfig: taxConfig,
        // Recargo al Consumo (para restaurantes)
        recargoConsumo: amounts.recargoConsumo || 0,
        recargoConsumoRate: amounts.recargoConsumoRate || 0,
        // Recargo por pago con tarjeta — dato interno (los precios ya vienen
        // recargados; esto es solo para reportes, no se muestra en el comprobante).
        cardCommissionApplied: cardSurchargeFactor > 1,
        cardCommissionRate: cardSurchargeFactor > 1 ? (Number(cardCommissionConfig.rate) || 0) : 0,
        cardCommissionAmount: cardSurchargeFactor > 1 ? Number((amounts.total - amounts.total / cardSurchargeFactor).toFixed(2)) : 0,
        // Guardar los métodos de pago
        payments: allPayments,
        // Guardar el primer método como principal para compatibilidad
        paymentMethod: allPayments.length > 0 ? allPayments[0].method : 'Efectivo',
        // Vuelto (cambio que se devuelve al cliente, si pagó más que el total)
        change,
        // Monto entregado por el cliente (solo guardamos cuando hay vuelto, para mostrar
        // "Pago con" en el ticket. Si el pago fue exacto, no aporta info y se omite).
        amountReceived,
        status: isCreditSaleForInvoice ? 'pending' : 'paid',
        // Datos de pago parcial (notas de venta y facturas al crédito)
        ...((documentType === 'nota_venta' || isCreditSaleForFactura) && {
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
        notes: generalNotes || '',
        // Estado de SUNAT - solo facturas y boletas pueden enviarse a SUNAT.
        // 'not_sent' cuando autoSendToSunat=false → invisible para crones de retry,
        // el cliente lo envía manualmente desde InvoiceList. 'pending' = candidato a retry.
        sunatStatus: (documentType === 'factura' || documentType === 'boleta')
          ? (shouldAutoSendToSunat ? 'pending' : 'not_sent')
          : 'not_applicable',
        sunatResponse: null,
        sunatSentAt: null,
        // Fecha de emisión
        emissionDate: emissionDateToUse,
        // Hora del evento para Meta Ads (si está habilitado)
        ...(businessSettings?.metaAdsEnabled && metaEventTime && {
          metaEventTime: new Date(metaEventTime),
        }),
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
        // Información de la sucursal (para series de documentos y datos del comprobante).
        // Snapshot de los datos personalizables por sucursal (logo + nombre comercial)
        // para que el comprobante conserve los datos de la sede al momento de emitir.
        branchId: selectedBranch?.id || null,
        branchName: selectedBranch?.name || null,
        branchTradeName: selectedBranch?.tradeName || null,
        branchLogoUrl: selectedBranch?.logoUrl || null,
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
          // Datos de detracción
          hasDetraction: hasDetraction,
          ...(hasDetraction && detractionType && {
            detractionType: detractionType,
            detractionTypeName: DETRACTION_TYPES.find(t => t.code === detractionType)?.name || '',
            detractionRate: DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0,
            detractionAmount: Math.round((amounts.total * (DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0)) / 100),
            detractionBankAccount: detractionBankAccount || null,
            netPayable: Number((amounts.total - Math.round((amounts.total * (DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0)) / 100)).toFixed(2)),
          }),
          // Datos de retención (Régimen de Retención del IGV — cliente agente de retención).
          // Solo leyenda + cálculo informativo: el total NO cambia (el comprador retiene el 3%).
          hasRetencion: hasRetencion,
          ...(hasRetencion && {
            retencionRate: 3,
            retencionAmount: Number((amounts.total * 0.03).toFixed(2)),
            retencionNetPayable: Number((amounts.total - amounts.total * 0.03).toFixed(2)),
          }),
        }),
        // Si viene de nota(s) de venta, marcar para no descontar stock de nuevo
        ...(pendingNotaVentaIds && pendingNotaVentaIds.length > 0 && {
          skipStockDeduction: true,
          convertedFrom: pendingNotaVentaIds.length === 1
            ? { type: 'nota_venta', id: pendingNotaVentaIds[0] }
            : { type: 'nota_venta', ids: pendingNotaVentaIds },
        }),
        // Si viene de una guía de remisión que ya descontó stock, no descontar de nuevo
        ...(sourceDispatchGuide && sourceDispatchGuide.stockAlreadyDeducted && {
          skipStockDeduction: true,
          convertedFrom: { type: 'dispatch_guide', id: sourceDispatchGuide.id, number: sourceDispatchGuide.number },
        }),
      }

      // MODO OFFLINE: Si no hay conexión, guardar en cola local
      if (isOffline) {
        console.log('📴 Modo offline: Guardando venta en cola local...')

        // Solo permitir notas de venta en modo offline (no requieren SUNAT)
        if (documentType === 'factura' || documentType === 'boleta') {
          toast.warning('Sin conexión: Las facturas y boletas requieren conexión a SUNAT. Puedes crear una Nota de Venta.', 5000)
          setIsProcessing(false); checkoutGuardRef.current = false
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
          if (changeReminderData) setChangeReminder(changeReminderData)
          if (companySettings?.enableCustomerDisplay) {
            CustomerDisplay.showCompleted(amounts.total, `OFFLINE-${offlineId}`, documentType)
          }
          setIsProcessing(false); checkoutGuardRef.current = false
          return
        } catch (offlineError) {
          console.error('❌ Error guardando venta offline:', offlineError)
          toast.error('Error al guardar la venta localmente')
          setIsProcessing(false); checkoutGuardRef.current = false
          return
        }
      }

      let invoiceId
      // isEditMode ya está definido arriba

      if (isEditMode) {
        // MODO EDICIÓN: Actualizar documento existente (sincrónico - no es venta frecuente)
        console.log('📝 Actualizando documento existente:', editingInvoiceId)

        const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
        const { db } = await import('@/lib/firebase')

        const invoiceRef = doc(db, 'businesses', businessId, 'invoices', editingInvoiceId)

        // Mantener datos originales que no deben cambiar
        const updateData = {
          ...invoiceData,
          // Mantener serie y número original
          series: editingInvoiceData.series,
          number: editingInvoiceData.number,
          // Mantener el TIPO original: el número pertenece a la serie del tipo emitido.
          // Cambiarlo dejaría p.ej. una "factura" con correlativo de boleta (BA02-xxx),
          // que SUNAT rechaza. Para cambiar de tipo: anular y emitir de nuevo.
          documentType: editingInvoiceData.documentType,
          // Mantener fecha de creación original
          createdAt: editingInvoiceData.createdAt,
          // Actualizar fecha de modificación
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          updatedByName: user.displayName || user.email || 'Usuario',
          // Mantener estado SUNAT original (pendiente)
          sunatStatus: editingInvoiceData.sunatStatus || 'pending',
        }

        await updateDoc(invoiceRef, updateData)
        invoiceId = editingInvoiceId

        toast.success(`Documento ${editingInvoiceData.series}-${editingInvoiceData.number} actualizado correctamente`)

        // Limpiar estado de edición
        setEditingInvoiceId(null)
        setEditingInvoiceData(null)
        editInvoiceLoadedRef.current = false

        // Auto-imprimir en modo edición (el recordatorio de vuelto no aplica al editar).
        if (companySettings?.autoPrintTicket) {
          setTimeout(() => handlePrintTicket(invoiceData), 500)
        }

      } else {
        // ========================================
        // MODO NORMAL: Venta segura (save-first)
        // Primero: guardar factura con número atómico
        // Después: mostrar éxito + imprimir ticket
        // Esto garantiza que el número solo se usa si la factura se crea exitosamente
        // ========================================

        // 1. PRIMERO: Crear factura con número atómico (garantiza que no se pierdan números)
        console.log('💾 Guardando factura con número atómico...')
        const createResult = await createInvoiceWithNumber(
          businessId,
          invoiceData,
          documentType,
          selectedWarehouse?.id,
          selectedBranch?.id
        )

        if (!createResult.success) {
          console.error('❌ Error al crear factura:', createResult.error)
          throw new Error(createResult.error || 'Error al generar comprobante')
        }

        // Obtener datos de la factura creada
        const invoiceId = createResult.id
        numberResult = {
          number: createResult.number,
          series: createResult.series,
          correlativeNumber: createResult.correlativeNumber,
        }
        console.log('✅ Factura creada atómicamente:', numberResult.number, 'ID:', invoiceId)

        // Actualizar invoiceData con el número generado para uso posterior (impresión, etc.)
        invoiceData.number = numberResult.number
        invoiceData.series = numberResult.series
        invoiceData.correlativeNumber = numberResult.correlativeNumber

        // 2. AHORA SÍ: Mostrar éxito (la venta ya está guardada)
        const documentName = documentType === 'factura' ? 'Factura' : documentType === 'nota_venta' ? 'Nota de Venta' : 'Boleta'
        toast.success(`${documentName} ${numberResult.number} generada exitosamente`, 5000)

        setLastInvoiceNumber(numberResult.number)
        setLastInvoiceData(invoiceData)
        setSaleCompleted(true)
        if (changeReminderData) {
          if (companySettings?.autoPrintTicket) {
            // Con auto-impresión: imprimir PRIMERO y mostrar el aviso al terminar (handlePrintTicket)
            pendingChangeReminderRef.current = changeReminderData
          } else {
            // Sin auto-impresión no hay nada que imprimir antes: mostrar el aviso de inmediato
            setChangeReminder(changeReminderData)
          }
        }

        // Redimir saldo a favor: descontar de las notas de crédito del cliente
        // (FIFO) lo que se aplicó como pago "Saldo a favor". No bloquea la venta:
        // si falla, la venta ya está guardada y se avisa para revisar.
        if (creditApplied > 0 && customerData.documentNumber) {
          try {
            const redeemRes = await redeemStoreCredit(businessId, customerData.documentNumber, creditApplied, {
              invoiceId,
              invoiceNumber: numberResult.number,
            })
            if (redeemRes.success) {
              console.log('✅ Saldo a favor redimido:', redeemRes.data)
              setCustomerStoreCredit(prev => ({
                total: Math.max(0, Math.round((prev.total - (redeemRes.data?.applied || 0)) * 100) / 100),
                notes: prev.notes,
              }))
            } else {
              console.error('❌ Error al redimir saldo a favor:', redeemRes.error)
              toast.error('Venta guardada, pero no se pudo descontar el saldo a favor: ' + (redeemRes.error || ''), 6000)
            }
          } catch (err) {
            console.error('❌ Excepción al redimir saldo a favor:', err)
            toast.error('Venta guardada, pero falló el descuento del saldo a favor: ' + (err.message || ''), 6000)
          }
        }

        // Si la venta vino de un folio de hotel, marcar esos cargos como facturados.
        // SOLO los que siguen en el carrito: si el usuario quitó un item del folio
        // antes de cobrar, ese cargo NO está en el comprobante y no debe marcarse
        // (quedaba "facturado" sin estar en la boleta → noche fantasma en reportes).
        // La ref queda como fallback por si el carrito perdió el tag folioChargeId.
        const refIds = pendingFolioChargeIdsRef.current || []
        const cartIds = cart.filter(item => item.fromFolio && item.folioChargeId).map(item => item.folioChargeId)
        const allFolioChargeIds = cartIds.length > 0 ? Array.from(new Set(cartIds)) : refIds
        if (allFolioChargeIds.length > 0) {
          console.log('📘 Marcando cargos del folio como facturados:', allFolioChargeIds, '→ invoice', invoiceId, numberResult.number)
          try {
            const markResult = await markChargesAsInvoiced(businessId, allFolioChargeIds, invoiceId, numberResult.number)
            if (markResult.success) {
              console.log('✅ Cargos marcados:', markResult.updated)
              pendingFolioChargeIdsRef.current = []
            } else {
              console.error('❌ Error al marcar cargos:', markResult.error)
              toast.error('Venta guardada, pero no se pudo marcar el folio como facturado: ' + (markResult.error || ''), 6000)
            }
          } catch (err) {
            console.error('❌ Excepción al marcar cargos:', err)
            toast.error('Venta guardada, pero falló el marcado del folio: ' + (err.message || ''), 6000)
          }
        }

        // Mostrar "Gracias por su compra" en pantalla de cliente
        if (companySettings?.enableCustomerDisplay) {
          CustomerDisplay.showCompleted(amounts.total, numberResult.number, documentType)
        }

        // Actualizar stock localmente
        setProductsRaw(prev => prev.map(product => {
          // Buscar TODOS los items del carrito que correspondan a este producto
          const cartItems = cart.filter(ci => ci.id === product.id || ci.productId === product.id)
          if (cartItems.length === 0) return product

          if (product.hasVariants && product.variants?.length > 0) {
            let updatedVariants = [...product.variants]
            for (const cartItem of cartItems) {
              const quantityToDeduct = cartItem.quantity * (cartItem.presentationFactor || 1)
              updatedVariants = updatedVariants.map(v => {
                if (cartItem.variantSku && v.sku === cartItem.variantSku) {
                  const newStock = Math.max(0, (v.stock || 0) - quantityToDeduct)
                  const updatedWs = (v.warehouseStocks || []).map(ws =>
                    ws.warehouseId === selectedWarehouse?.id
                      ? { ...ws, stock: Math.max(0, (ws.stock || 0) - quantityToDeduct) }
                      : ws
                  )
                  return { ...v, stock: newStock, warehouseStocks: updatedWs }
                }
                return v
              })
            }
            return { ...product, variants: updatedVariants }
          }

          const cartItem = cartItems[0]
          const quantityToDeduct = cartItem.quantity * (cartItem.presentationFactor || 1)
          if (product.stock != null) {
            const newStock = Math.max(0, product.stock - quantityToDeduct)
            const updatedWarehouseStocks = (product.warehouseStocks || []).map(ws =>
              ws.warehouseId === selectedWarehouse?.id
                ? { ...ws, stock: Math.max(0, (ws.stock || 0) - quantityToDeduct) }
                : ws
            )
            return { ...product, stock: newStock, warehouseStocks: updatedWarehouseStocks }
          }
          return product
        }))

        // Limpiar borrador
        clearDraft()

        // Auto-imprimir ticket. El recordatorio de vuelto (si aplica) queda pendiente y
        // se muestra al terminar la impresión, para que el ticket salga PRIMERO.
        if (companySettings?.autoPrintTicket) {
          setTimeout(() => handlePrintTicket(invoiceData), 100)
        }

        // Limpiar estado de mesa/orden/cotización
        const _tableData = tableData
        const _pendingOrderId = pendingOrderId
        const _markOrderPaidOnComplete = markOrderPaidOnComplete
        const _markOnlineOrderCompleteOnSale = markOnlineOrderCompleteOnSale
        const _pendingQuotationId = pendingQuotationId
        const _pendingNotaVentaIds = pendingNotaVentaIds
        const _sourceDispatchGuide = sourceDispatchGuide
        const _pendingAppointmentData = pendingAppointmentData
        if (_tableData) setTableData(null)
        if (_pendingOrderId) {
          setPendingOrderId(null)
          setMarkOrderPaidOnComplete(false)
          setMarkOnlineOrderCompleteOnSale(false)
          onlineOrderLoadedRef.current = false
        }
        if (_pendingQuotationId) setPendingQuotationId(null)
        if (_pendingNotaVentaIds) setPendingNotaVentaIds(null)
        if (_sourceDispatchGuide) setSourceDispatchGuide(null)
        if (_pendingAppointmentData) setPendingAppointmentData(null)

        // Capturar datos necesarios para el background
        const bgCart = [...cart]
        const bgProducts = [...products]
        const bgSelectedWarehouse = selectedWarehouse
        const bgDocumentType = documentType
        const bgTaxConfig = taxConfig
        const bgAmounts = { ...amounts }
        const bgCustomerData = { ...customerData }
        const bgSelectedSeller = selectedSeller ? { ...selectedSeller } : null
        const bgNumberResult = { ...numberResult }
        const bgUserUid = user.uid
        const bgUserEmail = user.email
        const bgUserDisplayName = user.displayName
        const bgInvoiceId = invoiceId

        // ========================================
        // BACKGROUND: Operaciones adicionales de Firestore
        // (la factura ya fue creada, estas son operaciones complementarias)
        // ========================================
        const backgroundSave = async () => {
          const _bgStart = Date.now()
          let _stockMs = null
          let _recipeMs = null
          try {
            console.log('✅ Factura ya guardada, ejecutando operaciones complementarias...')

            // Incrementar contador de ventas para review prompt
            try { const { incrementSalesCount } = await import('@/components/ReviewPrompt'); incrementSalesCount() } catch (e) { /* ignore */ }

            // 3.0.1. Si es cargo a habitación (hotel), agregar al folio del huésped
            if (selectedRoom?.reservation && invoiceData.payments?.some(p => p.methodKey === 'ROOM')) {
              try {
                const roomCharge = {
                  reservationId: selectedRoom.reservation.id,
                  roomId: selectedRoom.id,
                  roomNumber: selectedRoom.number,
                  guestName: selectedRoom.reservation.guestName,
                  chargeType: 'restaurant',
                  description: `Consumo POS - ${invoiceData.number || 'S/N'}`,
                  amount: invoiceData.total || 0,
                  date: new Date().toISOString().split('T')[0],
                  createdBy: user?.email || '',
                }
                await addFolioCharge(businessId, roomCharge)
                console.log('✅ Cargo agregado al folio de habitación', selectedRoom.number)
              } catch (folioError) {
                console.error('Error al cargar al folio:', folioError)
              }
            }

            // 3.1. Envío automático a SUNAT - reutiliza shouldAutoSendToSunat
            // ya leído FRESH antes de crear el invoiceData. Consistente con el
            // sunatStatus inicial que guardamos arriba.
            const shouldAutoSend = shouldAutoSendToSunat
            const canSendToSunat = bgDocumentType === 'factura' || bgDocumentType === 'boleta'

            let isPausedByAdmin = false
            if (shouldAutoSend && bgDocumentType === 'factura') {
              try {
                const { doc: docRef, getDoc: getDocSnap } = await import('firebase/firestore')
                const { db: fireDb } = await import('@/lib/firebase')
                const adminSettingsSnap = await getDocSnap(docRef(fireDb, 'config', 'adminSettings'))
                if (adminSettingsSnap.exists()) {
                  const adminConfig = adminSettingsSnap.data()
                  const isReducedIgv = bgTaxConfig.taxType === 'reduced' || bgTaxConfig.igvRate === 10.5
                  if (adminConfig.system?.pauseSunatRestaurants && isReducedIgv) {
                    isPausedByAdmin = true
                    console.log('⏸️ Envío de factura a SUNAT pausado por admin (restaurantes IGV reducido)')
                    toast.warning('Envío de facturas a SUNAT pausado temporalmente por el administrador.', 6000)
                  }
                }
              } catch (adminCheckError) {
                console.warn('No se pudo verificar config admin:', adminCheckError)
              }
            }

            if (shouldAutoSend && canSendToSunat && !isPausedByAdmin) {
              console.log('🚀 Enviando automáticamente a SUNAT (background)...')
              sendInvoiceToSunat(businessId, bgInvoiceId)
                .then(() => {
                  console.log('✅ Comprobante enviado a SUNAT exitosamente')
                  toast.success('Comprobante aceptado por SUNAT', 4000)
                })
                .catch((sunatError) => {
                  console.error('❌ Error al enviar a SUNAT:', sunatError)
                  toast.warning('Error al enviar a SUNAT. Reenvía desde Ventas.', 5000)
                })
            }

            // 3.2. Guardar cliente automáticamente
            try {
              await upsertCustomerFromSale(businessId, bgCustomerData)
            } catch (customerError) {
              console.error('⚠️ Error al guardar cliente (no crítico):', customerError)
            }

            // 4. Actualizar stock en Firestore (CRÍTICO - con detección específica de fallos).
            //    Skip si viene de nota de venta (ya descontó) o de guía de remisión con
            //    stock ya descontado (el toggle "descontar stock" se activó al crearla).
            const _guideAlreadyDeducted = !!(_sourceDispatchGuide && _sourceDispatchGuide.stockAlreadyDeducted)
            if (!(_pendingNotaVentaIds && _pendingNotaVentaIds.length > 0) && !_guideAlreadyDeducted) {
              // Fase de stock + movimientos: corre EN PARALELO con la fase de recetas/insumos
              // (son independientes). Antes corrían en cadena (stock → movimientos → recetas →
              // insumos), lo que sumaba los tiempos. console.time mide cuánto toma cada fase.
              const _stockPhase = (async () => {
              const _stockT0 = Date.now()
              // === PRIMARY: descuento de stock + movimientos EN EL SERVIDOR (1 transacción
              // atómica, rápido). Si falla (o la función no está desplegada), cae al fallback
              // en el cliente de más abajo, así nunca se pierde una venta. ===
              try {
                const { httpsCallable } = await import('firebase/functions')
                const { functions: _fns } = await import('@/lib/firebase')
                const _itemsPayload = bgCart.filter(it => !it.isCustom).map(it => {
                  const pd = bgProducts.find(p => p.id === it.id)
                  if (!pd || pd.trackStock === false) return null
                  return {
                    productId: it.id,
                    name: it.name || '',
                    quantity: it.quantity * (it.presentationFactor || 1),
                    variantSku: it.variantSku || null,
                    isNoLot: !!it.isNoLot,
                    batchNumber: it.batchNumber || null,
                    serialNumber: it.serialNumber || null,
                    cartKey: it.cartId || it.id,
                    presentationName: it.presentationName || null,
                    originalQty: it.quantity,
                  }
                }).filter(Boolean)
                if (_itemsPayload.length > 0) {
                  const _res = await httpsCallable(_fns, 'processSaleStock')({
                    businessId,
                    warehouseId: bgSelectedWarehouse?.id || '',
                    invoiceId: bgInvoiceId || '',
                    invoiceNumber: bgNumberResult?.number || '',
                    documentType: bgDocumentType,
                    allowNegativeStock: !!companySettings?.allowNegativeStock,
                    // Sin esto el servidor grababa los movimientos de venta con userId vacío.
                    userId: bgUserUid || '',
                    items: _itemsPayload,
                  })
                  // Actualizar la factura con el desglose de lotes devuelto por el servidor
                  const _bb = _res?.data?.batchBreakdownByCartKey || {}
                  if (Object.keys(_bb).length > 0 && bgInvoiceId) {
                    try {
                      const { doc: _dr, getDoc: _gd, updateDoc: _ud } = await import('firebase/firestore')
                      const { db: _fdb } = await import('@/lib/firebase')
                      const _invRef = _dr(_fdb, 'businesses', businessId, 'invoices', bgInvoiceId)
                      const _invSnap = await _gd(_invRef)
                      if (_invSnap.exists()) {
                        const _invData = _invSnap.data()
                        const _updItems = (_invData.items || []).map(invItem => {
                          const cartItem = bgCart.find(c => c.id === invItem.productId)
                          const cartKey = cartItem?.cartId || cartItem?.id
                          const breakdown = _bb[cartKey]
                          return breakdown ? { ...invItem, batchBreakdown: breakdown } : invItem
                        })
                        await _ud(_invRef, { items: _updItems })
                      }
                    } catch (err) { console.error('Error al guardar desglose de lotes (servidor):', err) }
                  }
                }
                _stockMs = Date.now() - _stockT0
                return // listo en el servidor → no ejecutar el fallback de cliente
              } catch (serverErr) {
                console.error('⚠️ processSaleStock (servidor) falló, usando fallback en cliente:', serverErr)
              }

              try {
              // IDEMPOTENCIA: antes de descontar en cliente, verificar si el servidor
              // YA CREÓ movimientos de stock para esta factura (caso clásico: timeout
              // falso → el cliente recibe error pero el server sí termino la tx).
              // Sin esto, el fallback descuenta otra vez → bug "1 coca = doble salida".
              if (bgInvoiceId) {
                try {
                  const { collection: _col, query: _q, where: _w, limit: _lim, getDocs: _gd } = await import('firebase/firestore')
                  const { db: _fdb } = await import('@/lib/firebase')
                  const _movRef = _col(_fdb, 'businesses', businessId, 'stockMovements')
                  const _existing = await _gd(_q(_movRef,
                    _w('referenceType', '==', 'invoice'),
                    _w('referenceId', '==', bgInvoiceId),
                    _lim(1)
                  ))
                  if (!_existing.empty) {
                    console.warn(`[POS fallback] IDEMPOTENCY: invoiceId=${bgInvoiceId} ya tiene movimientos. Aborto descuento en cliente para evitar doble salida.`)
                    _stockMs = Date.now() - _stockT0
                    return
                  }
                } catch (idemErr) {
                  console.warn('[POS fallback] No se pudo verificar idempotencia (sigo con el descuento):', idemErr)
                }
              }

              // FALLBACK (cliente): Map para almacenar desglose de lotes por item (para actualizar factura)
              const batchBreakdownByItemId = {}

              // Agrupar items con número de serie por (productId|variantSku|warehouseId).
              // Cada serie se agrega al carrito como item separado con quantity:1, lo que generaba
              // N transacciones concurrentes sobre el mismo doc Firestore — varias agotaban
              // reintentos y fallaban silenciosamente. Consolidamos en 1 transacción por grupo.
              const serialGroupKey = (item) => `${item.id}|${item.variantSku || ''}|${bgSelectedWarehouse?.id || ''}`
              const serialGroups = new Map()
              const nonSerialItems = []
              bgCart.filter(item => !item.isCustom).forEach(item => {
                if (item.serialNumber) {
                  const key = serialGroupKey(item)
                  if (!serialGroups.has(key)) serialGroups.set(key, [])
                  serialGroups.get(key).push(item)
                } else {
                  nonSerialItems.push(item)
                }
              })

              // Agrupar las operaciones de stock por PRODUCTO. Distintas líneas del mismo
              // producto (ej. varias variantes) se corren en SERIE entre sí para NO chocar
              // sobre el mismo documento de Firestore: la contención dispara reintentos con
              // backoff exponencial (1s, 2s, 4s...) y eso era lo que hacía que una venta con
              // muchas variantes del mismo producto demorara 20-30s. Productos distintos
              // siguen corriendo en paralelo.
              const stockOpsByProduct = new Map()
              const pushStockOp = (productId, opFn) => {
                if (!stockOpsByProduct.has(productId)) stockOpsByProduct.set(productId, [])
                stockOpsByProduct.get(productId).push(opFn)
              }

              // Una transacción por grupo de series del mismo producto/variante/almacén
              for (const items of serialGroups.values()) {
                const firstItem = items[0]
                const productData = bgProducts.find(p => p.id === firstItem.id)
                if (!productData) continue
                if (productData.trackStock === false) continue
                const totalQty = items.reduce((sum, it) => sum + it.quantity * (it.presentationFactor || 1), 0)
                const saleDate = Timestamp.fromDate(new Date())
                const serialsPayload = items.map(it => ({
                  serialNumber: it.serialNumber,
                  saleId: bgInvoiceId || null,
                  saleDate
                }))
                pushStockOp(firstItem.id, () =>
                  updateProductStockTransaction(
                    businessId,
                    firstItem.id,
                    bgSelectedWarehouse?.id || '',
                    -totalQty,
                    {},
                    firstItem.variantSku || null,
                    serialsPayload,
                    !!companySettings?.allowNegativeStock
                  )
                )
              }

              // Items sin número de serie: mantienen el procesamiento individual con lógica de lotes
              nonSerialItems.forEach(item => {
                pushStockOp(item.id, async () => {
                  const productData = bgProducts.find(p => p.id === item.id)
                  if (!productData) return
                  if (productData.trackStock === false) return

                  const quantityToDeduct = item.quantity * (item.presentationFactor || 1)

                  // Datos extra para lotes (descontar del lote seleccionado o FEFO)
                  const extraUpdates = {}
                  const batchBreakdown = [] // Registrar de qué lotes se descontó

                  // Si es venta "Sin lote" (isNoLot), NO tocar los batches - solo descontar del stock general
                  if (productData.batches && productData.batches.length > 0 && !item.isNoLot) {
                    let remainingToDeduct = quantityToDeduct
                    const updatedBatches = [...productData.batches]

                    // Helpers para matching robusto: normaliza casing/espacios y filtra por almacén.
                    // Alinea con la lógica de merge en CreatePurchase y evita que ventas con typos
                    // o diferencias de casing caigan silenciosamente a FEFO.
                    const normalizeBn = (s) => String(s || '').trim().toLowerCase()
                    const targetWarehouseId = bgSelectedWarehouse?.id || null
                    const batchMatchesWarehouse = (b) => {
                      // Sin contexto de almacén: aceptar cualquier lote (comportamiento legacy).
                      if (!targetWarehouseId) return true
                      // Lote legacy sin warehouseId: aceptarlo en el almacén actual.
                      if (!b.warehouseId) return true
                      return b.warehouseId === targetWarehouseId
                    }

                    if (item.batchNumber) {
                      // Descontar del lote específico seleccionado por el usuario (mismo nº y almacén).
                      const itemBn = normalizeBn(item.batchNumber)
                      const batchIdx = updatedBatches.findIndex(b =>
                        normalizeBn(b.lotNumber || b.batchNumber) === itemBn &&
                        batchMatchesWarehouse(b)
                      )
                      if (batchIdx !== -1) {
                        const deductFromBatch = Math.min(updatedBatches[batchIdx].quantity, remainingToDeduct)
                        updatedBatches[batchIdx] = {
                          ...updatedBatches[batchIdx],
                          quantity: updatedBatches[batchIdx].quantity - deductFromBatch
                        }
                        remainingToDeduct -= deductFromBatch
                        batchBreakdown.push({
                          lotNumber: item.batchNumber,
                          quantity: deductFromBatch,
                          expirationDate: updatedBatches[batchIdx].expirationDate || null
                        })
                      } else {
                        // Diagnóstico: la venta tenía batchNumber pero no se encontró el lote.
                        // Indica typo, desincronización o lote en otro almacén. Caerá a FEFO.
                        console.warn(
                          `[POS] Lote "${item.batchNumber}" no encontrado para producto ${item.id} ` +
                          `en almacén ${targetWarehouseId || '(ninguno)'}. Cayendo a FEFO.`
                        )
                      }
                    }

                    // Si queda remanente (o no se seleccionó lote), usar FEFO filtrando por almacén.
                    if (remainingToDeduct > 0) {
                      // Construir índices ordenados sin mutar el orden del array persistido.
                      const fefoIndices = updatedBatches
                        .map((b, idx) => ({ b, idx }))
                        .filter(({ b }) => batchMatchesWarehouse(b) && (b.quantity || 0) > 0)
                        .sort((x, y) => {
                          if (!x.b.expirationDate) return 1
                          if (!y.b.expirationDate) return -1
                          const dateA = x.b.expirationDate.toDate ? x.b.expirationDate.toDate() : new Date(x.b.expirationDate)
                          const dateB = y.b.expirationDate.toDate ? y.b.expirationDate.toDate() : new Date(y.b.expirationDate)
                          return dateA - dateB
                        })
                        .map(({ idx }) => idx)

                      for (const i of fefoIndices) {
                        if (remainingToDeduct <= 0) break
                        const batch = updatedBatches[i]
                        const deductFromBatch = Math.min(batch.quantity, remainingToDeduct)
                        updatedBatches[i] = {
                          ...batch,
                          quantity: batch.quantity - deductFromBatch
                        }
                        remainingToDeduct -= deductFromBatch
                        const lotNum = batch.lotNumber || batch.batchNumber || ''
                        // No duplicar si ya se registró este lote
                        const existing = batchBreakdown.find(b => b.lotNumber === lotNum)
                        if (existing) {
                          existing.quantity += deductFromBatch
                        } else {
                          batchBreakdown.push({
                            lotNumber: lotNum,
                            quantity: deductFromBatch,
                            expirationDate: batch.expirationDate || null
                          })
                        }
                      }
                    }

                    extraUpdates.batches = updatedBatches

                    const activeBatches = updatedBatches.filter(b => b.quantity > 0 && b.expirationDate)
                    if (activeBatches.length > 0) {
                      activeBatches.sort((a, b) => {
                        const dateA = a.expirationDate.toDate ? a.expirationDate.toDate() : new Date(a.expirationDate)
                        const dateB = b.expirationDate.toDate ? b.expirationDate.toDate() : new Date(b.expirationDate)
                        return dateA - dateB
                      })
                      const nearestBatch = activeBatches[0]
                      extraUpdates.expirationDate = nearestBatch.expirationDate
                      extraUpdates.batchNumber = nearestBatch.batchNumber
                    } else {
                      extraUpdates.expirationDate = null
                      extraUpdates.batchNumber = null
                    }
                  }

                  // Guardar desglose de lotes para actualizar la factura
                  if (batchBreakdown.length > 0) {
                    batchBreakdownByItemId[item.cartId || item.id] = batchBreakdown
                  }

                  // Usar transacción para evitar race conditions entre ventas simultáneas
                  return updateProductStockTransaction(
                    businessId, item.id,
                    bgSelectedWarehouse?.id || '',
                    -quantityToDeduct,
                    extraUpdates,
                    item.variantSku || null,
                    null,
                    !!companySettings?.allowNegativeStock
                  )
                })
              })

              // Correr: en SERIE dentro de cada producto (evita contención sobre el mismo
              // documento), en PARALELO entre productos distintos.
              await Promise.all(
                [...stockOpsByProduct.values()].map(async (ops) => {
                  for (const op of ops) {
                    await op()
                  }
                })
              )

              // 4.0.1. Actualizar factura con desglose de lotes (si hubo lotes usados)
              if (Object.keys(batchBreakdownByItemId).length > 0 && bgInvoiceId) {
                try {
                  const { doc: docRef, getDoc: getDocFn, updateDoc: updateDocFn } = await import('firebase/firestore')
                  const { db: fireDb } = await import('@/lib/firebase')
                  const invoiceRef = docRef(fireDb, 'businesses', businessId, 'invoices', bgInvoiceId)
                  const invoiceSnap = await getDocFn(invoiceRef)
                  if (invoiceSnap.exists()) {
                    const invoiceData = invoiceSnap.data()
                    const updatedItems = (invoiceData.items || []).map(invItem => {
                      const cartItem = bgCart.find(c => c.id === invItem.productId)
                      const cartKey = cartItem?.cartId || cartItem?.id
                      const breakdown = batchBreakdownByItemId[cartKey]
                      if (breakdown) {
                        return { ...invItem, batchBreakdown: breakdown }
                      }
                      return invItem
                    })
                    await updateDocFn(invoiceRef, { items: updatedItems })
                  }
                } catch (err) {
                  console.error('⚠️ Error al guardar desglose de lotes en factura:', err)
                }
              }

              // 4.1. Registrar movimientos de stock
              const itemsForMovement = bgCart.filter(item => {
                if (item.isCustom) return false
                const productData = bgProducts.find(p => p.id === item.id)
                if (!productData) return false
                if (productData.trackStock === false) return false
                return true
              })

              // Registrar TODOS los movimientos en writeBatch (1 escritura por lote de hasta 450,
              // en vez de N escrituras sueltas). Muchísimos menos round-trips a Firestore.
              try {
                const { writeBatch: _wb, collection: _mc, doc: _md, serverTimestamp: _mts } = await import('firebase/firestore')
                const { db: _mdb } = await import('@/lib/firebase')
                const _movCol = _mc(_mdb, 'businesses', businessId, 'stockMovements')
                const _docTypeName = bgDocumentType === 'boleta' ? 'Boleta' : bgDocumentType === 'factura' ? 'Factura' : 'Nota de Venta'
                for (let _mi = 0; _mi < itemsForMovement.length; _mi += 450) {
                  const _chunk = itemsForMovement.slice(_mi, _mi + 450)
                  const _batch = _wb(_mdb)
                  for (const item of _chunk) {
                    const quantityForMovement = item.quantity * (item.presentationFactor || 1)
                    const noteParts = [`Venta ${item.name} - ${_docTypeName} ${bgNumberResult?.number || ''}`]
                    if (item.batchNumber) noteParts.push(`Lote: ${item.batchNumber}`)
                    if (item.isNoLot) noteParts.push('Sin lote')
                    if (item.presentationName) noteParts.push(`${item.quantity} ${item.presentationName}`)
                    _batch.set(_md(_movCol), {
                      productId: item.id,
                      productName: item.name || '',
                      warehouseId: bgSelectedWarehouse?.id || '',
                      type: 'sale',
                      quantity: -quantityForMovement,
                      reason: 'Venta',
                      referenceType: 'invoice',
                      referenceId: bgInvoiceId || '',
                      referenceNumber: bgNumberResult?.number || '',
                      userId: bgUserUid,
                      ...(item.batchNumber && { batchNumber: item.batchNumber }),
                      ...(item.serialNumber && { serialNumber: item.serialNumber }),
                      ...(item.variantSku && { variantSku: item.variantSku }),
                      notes: noteParts.join(' - '),
                      createdAt: _mts(),
                    })
                  }
                  await _batch.commit()
                }
              } catch (movErr) {
                console.error('📦 [StockMovement] Error al registrar movimientos en lote:', movErr)
              }
              } catch (stockErr) {
                console.error('❌ CRÍTICO: Error en descuento de stock:', stockErr)
                toast.error('Venta guardada pero falló el descuento de stock. Revisa el inventario manualmente.', 10000)
              }
              _stockMs = Date.now() - _stockT0
              })()

              // Fase de recetas/insumos: corre EN PARALELO con stock+movimientos. Es
              // independiente (toca docs de ingredientes, no de los productos vendidos).
              const _recipePhase = (async () => {
              const _recipeT0 = Date.now()
              // 4.5. Descontar ingredientes del inventario (solo recetas con deductOnSale).
              //   - true: descontar al vender · false: producción (ya descontado) ·
              //     undefined: default por modo (restaurant=sí) vía shouldDeductIngredients.
              // Lectura de recetas: UNA por producto (dedupe). Varias líneas del mismo producto
              // (presentaciones/variantes) comparten productId, así no se relee N veces.
              // Leer TODAS las recetas en UNA sola consulta (antes era 1 query por producto,
              // ~50 queries con muchos ítems). Mapa productId -> receta.
              const _recipeByProduct = new Map()
              try {
                const { collection: _rc, getDocs: _rg } = await import('firebase/firestore')
                const { db: _rdb } = await import('@/lib/firebase')
                const _recipesSnap = await _rg(_rc(_rdb, 'businesses', businessId, 'recipes'))
                _recipesSnap.forEach(d => {
                  const r = { id: d.id, ...d.data() }
                  if (r.productId) _recipeByProduct.set(r.productId, r)
                })
              } catch (error) {
                console.warn('No se pudieron leer las recetas:', error)
              }
              // AGREGAR el consumo de insumos de TODOS los platos y descontar en 1 sola pasada.
              // Antes era 1 llamada a deductIngredients por plato, EN SERIE (race de insumos
              // compartidos) → con ~25 platos eso eran decenas de lecturas+commits encadenados,
              // el verdadero cuello de la venta. Sumamos por (ingredientId|unidad) y descontamos
              // una vez: cada insumo se lee/escribe una sola vez, sin race.
              const _ingAgg = new Map()
              for (const item of bgCart.filter(item => !item.isCustom)) {
                const recipe = _recipeByProduct.get(item.id)
                if (!recipe || !shouldDeductIngredients(recipe, businessMode)) continue
                for (const ing of (recipe.ingredients || [])) {
                  const k = `${ing.ingredientId}|${ing.unit || ''}`
                  // Multiplicar por presentationFactor igual que el stock del producto y la
                  // restauración al anular (InvoiceList): vender 1 "caja de 6" consume la
                  // receta ×6. Antes el descuento omitía el factor → subdescontaba insumos
                  // y al anular se restauraba de más (asimetría).
                  const addQty = (ing.quantity || 0) * (item.quantity || 0) * (item.presentationFactor || 1)
                  const ex = _ingAgg.get(k)
                  if (ex) ex.quantity += addQty
                  else _ingAgg.set(k, { ...ing, quantity: addQty })
                }
              }
              if (_ingAgg.size > 0) {
                // Repartir en pasadas donde cada ingredientId aparezca a lo sumo UNA vez, para que
                // una sola llamada nunca toque el mismo doc dos veces (caso raro: mismo insumo en
                // dos unidades distintas). Caso normal = 1 pasada.
                const _passes = []
                const _passIds = []
                for (const ing of _ingAgg.values()) {
                  let placed = false
                  for (let p = 0; p < _passes.length; p++) {
                    if (!_passIds[p].has(ing.ingredientId)) {
                      _passes[p].push(ing); _passIds[p].add(ing.ingredientId); placed = true; break
                    }
                  }
                  if (!placed) { _passes.push([ing]); _passIds.push(new Set([ing.ingredientId])) }
                }
                let _ingFail = false
                for (const pass of _passes) {
                  try {
                    await deductIngredients(businessId, pass, bgInvoiceId, 'Venta (varios productos)', bgSelectedWarehouse?.id || null, 'sale', !!companySettings?.allowNegativeStock)
                  } catch (error) {
                    _ingFail = true
                    console.warn('⚠️ No se pudo descontar insumos (agregado):', error)
                  }
                }
                if (_ingFail) {
                  // Antes el fallo era silencioso (solo console.warn) y el inventario de
                  // insumos quedaba descuadrado sin que el usuario se enterara.
                  try {
                    toast.warning('La venta se registró, pero no se pudieron descontar algunos insumos. Revisá el inventario de insumos.', 7000)
                  } catch (_) { /* noop */ }
                }
              }
              _recipeMs = Date.now() - _recipeT0
              })()

              // Esperar ambas fases (corren en paralelo)
              await Promise.all([_stockPhase, _recipePhase])
            }

            // 5. Actualizar métricas del mozo
            if (_tableData?.waiterId) {
              try {
                const { increment } = await import('firebase/firestore')
                const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
                const { db } = await import('@/lib/firebase')
                const waiterRef = doc(db, 'businesses', businessId, 'waiters', _tableData.waiterId)
                await updateDoc(waiterRef, {
                  todaySales: increment(bgAmounts.total),
                  todayOrders: increment(1),
                  totalSales: increment(bgAmounts.total),
                  totalOrders: increment(1),
                  updatedAt: serverTimestamp(),
                }).catch(err => console.warn('No se pudo actualizar métricas del mozo:', err))
              } catch (error) {
                console.warn('Error al actualizar métricas del mozo:', error)
              }
            }

            // 5.1. Actualizar métricas del vendedor
            if (bgSelectedSeller?.id) {
              try {
                const { increment } = await import('firebase/firestore')
                const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
                const { db } = await import('@/lib/firebase')
                const sellerRef = doc(db, 'businesses', businessId, 'sellers', bgSelectedSeller.id)
                await updateDoc(sellerRef, {
                  todaySales: increment(bgAmounts.total),
                  todayOrders: increment(1),
                  totalSales: increment(bgAmounts.total),
                  totalOrders: increment(1),
                  updatedAt: serverTimestamp(),
                }).catch(err => console.warn('No se pudo actualizar métricas del vendedor:', err))
              } catch (error) {
                console.warn('Error al actualizar métricas del vendedor:', error)
              }
            }

            // 6. Liberar mesa o actualizar orden
            if (_tableData?.tableId && _tableData?.partialClose) {
              try {
                const remaining = _tableData.remainingItems || []
                const newTotal = remaining.reduce((sum, item) => sum + (item.total || 0), 0)
                await updateOrder(businessId, _tableData.orderId, { items: remaining, total: newTotal })
                await updateTableAmount(businessId, _tableData.tableId, newTotal)
              } catch (error) {
                console.error('Error al actualizar orden parcial:', error)
              }
            } else if (_tableData?.tableId) {
              try {
                await releaseTable(businessId, _tableData.tableId)
              } catch (error) {
                console.error('Error al liberar mesa:', error)
              }
            }

            // 6.1. Marcar orden como pagada (flujo restaurante: mesa/delivery)
            // Mesa (tiene tableId) → cierra la orden. Delivery/para-llevar → solo marca
            // pagada+facturada; la orden SIGUE en su flujo de cocina y la cierra "Entregada".
            if (_pendingOrderId && _markOrderPaidOnComplete) {
              try {
                await markOrderAsPaid(businessId, _pendingOrderId, {
                  close: !!_tableData?.tableId,
                  invoiceId: bgInvoiceId || null,
                })
              } catch (error) {
                console.error('Error al marcar orden como pagada:', error)
              }
            }

            // 6.1.b. Marcar pedido online retail como completado al facturarse
            if (_pendingOrderId && _markOnlineOrderCompleteOnSale) {
              try {
                await updateOrderStatus(businessId, _pendingOrderId, 'completed', 'Facturado desde POS')
              } catch (error) {
                console.error('Error al completar pedido online:', error)
              }
            }

            // 6.2. Marcar cotización como convertida
            if (_pendingQuotationId) {
              try {
                await markQuotationAsConverted(businessId, _pendingQuotationId, bgInvoiceId)
              } catch (error) {
                console.error('Error al marcar cotización como convertida:', error)
              }
            }

            // 6.3. Marcar nota(s) de venta como convertida(s) y verificar movimientos de stock
            if (_pendingNotaVentaIds && _pendingNotaVentaIds.length > 0) {
              try {
                await Promise.all(_pendingNotaVentaIds.map(notaId =>
                  markNotaVentaAsConverted(businessId, notaId, bgDocumentType, bgInvoiceId, bgNumberResult.number)
                ))
              } catch (error) {
                console.error('Error al marcar notas de venta como convertidas:', error)
              }

              // Verificar que las notas originales tengan movimientos de stock
              try {
                const { getStockMovements, createStockMovement } = await import('@/services/warehouseService')
                const movementsResult = await getStockMovements(businessId)
                const allMovements = movementsResult.success ? movementsResult.data : []

                for (const notaId of _pendingNotaVentaIds) {
                  // Buscar movimientos de la nota original
                  const notaMovements = allMovements.filter(m => m.referenceId === notaId && m.type === 'sale')

                  if (notaMovements.length === 0) {
                    // La nota no tiene movimientos - crearlos ahora
                    console.log('⚠️ Nota', notaId, 'sin movimientos de stock. Creando...')
                    const { doc: docRef, getDoc: getDocFn } = await import('firebase/firestore')
                    const { db: fireDb } = await import('@/lib/firebase')
                    const notaRef = docRef(fireDb, 'businesses', businessId, 'invoices', notaId)
                    const notaSnap = await getDocFn(notaRef)

                    if (notaSnap.exists()) {
                      const notaData = notaSnap.data()
                      const notaItems = notaData.items || []
                      const notaWarehouseId = notaData.warehouseId || bgSelectedWarehouse?.id || ''

                      for (const item of notaItems) {
                        const productId = item.productId || item.id
                        if (!productId || item.isCustom) continue
                        const productData = bgProducts.find(p => p.id === productId)
                        if (!productData || productData.trackStock === false) continue

                        const qty = (item.quantity || 0) * (item.presentationFactor || 1)
                        await createStockMovement(businessId, {
                          productId,
                          productName: item.name || item.description || '',
                          warehouseId: notaWarehouseId,
                          type: 'sale',
                          quantity: -qty,
                          reason: 'Venta',
                          referenceType: 'invoice',
                          referenceId: notaId,
                          referenceNumber: notaData.number || '',
                          userId: bgUserUid,
                          notes: `Venta ${item.name || item.description} - Nota de Venta ${notaData.number || ''} (auto-sync conversión)`
                        })
                      }
                      console.log('✅ Movimientos de stock creados para nota', notaId)
                    }
                  }
                }
              } catch (syncError) {
                console.error('⚠️ Error al verificar/crear movimientos de stock de notas:', syncError)
              }
            }

            // 6.4. Marcar cita veterinaria como completada
            if (_pendingAppointmentData && _pendingAppointmentData.appointmentId) {
              try {
                await completeAppointment(businessId, _pendingAppointmentData.appointmentId, bgInvoiceId)
                console.log('✅ Cita veterinaria marcada como completada:', _pendingAppointmentData.appointmentId)
              } catch (appointmentError) {
                console.error('Error al completar cita veterinaria:', appointmentError)
              }
            }

            console.log('✅ Todas las operaciones de background completadas')
            // Métrica de tiempos SOLO en consola de desarrollo — no se muestra a los usuarios.
            if (import.meta.env?.DEV) {
              const _f = (ms) => ms == null ? '—' : (ms / 1000).toFixed(1) + 's'
              console.log(`⏱ Venta: desde clic ${((Date.now() - _checkoutT0) / 1000).toFixed(1)}s · registro ${((Date.now() - _bgStart) / 1000).toFixed(1)}s (stock ${_f(_stockMs)} · recetas ${_f(_recipeMs)})`)
            }
          } catch (bgError) {
            console.error('❌ Error en operaciones de background:', bgError)
            toast.error('Error al guardar datos. Verifica en el listado de ventas.', 5000)
          }
        }

        // Liberar la UI AL INSTANTE: la factura ya está guardada y tanto la impresión
        // (5533) como el envío a SUNAT (fire-and-forget) ya corren aparte. El descuento
        // de stock y el registro de movimientos siguen en SEGUNDO PLANO sin bloquear el
        // botón "Procesar venta". Antes el `await` dejaba el botón cargando hasta terminar
        // todo el stock, lo que demoraba mucho en ventas con muchos ítems/variantes.
        setIsProcessing(false)
        checkoutGuardRef.current = false
        // Igual lo esperamos para mantener viva la operación mientras la página siga
        // abierta. backgroundSave() tiene su propio try/catch interno, no lanza.
        await backgroundSave()
      }
    } catch (error) {
      console.error('Error al procesar venta:', error)
      toast.error(error.message || 'Error al procesar la venta. Inténtalo nuevamente.')
    } finally {
      setIsProcessing(false); checkoutGuardRef.current = false
    }
  }

  const handlePrintTicket = async (invoiceDataParam) => {
    const isNative = Capacitor.isNativePlatform()
    setIsPrintingTicket(true)
    const invoiceToprint = invoiceDataParam || lastInvoiceData

    try {
      // Si es móvil, intentar imprimir en impresora térmica
      if (isNative && invoiceToprint && companySettings) {
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
              const result = await printInvoiceTicket(invoiceToprint, companySettings, printerConfigResult.config.paperWidth || 80, printerConfigResult.config.showItemUnit || false, printerConfigResult.config.ticketFontSize || (printerConfigResult.config.webPrintLegible ? 'medium' : 'small'))

              if (result.success) {
                toast.success('Comprobante impreso en ticketera')
                if (companySettings?.autoResetPOS) setTimeout(() => clearCart(), 500)
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
      // Releer la configuración FRESCA de localStorage antes de imprimir. El estado en memoria
      // puede quedar desincronizado (p.ej. la opción se activó/cambió después de abrir el POS o
      // en otra pestaña), lo que hacía que el ticket saliera con valores viejos aunque en
      // Configuración se vieran activos. Releyendo aquí, cada impresión usa el valor real.
      try {
        const { getPrinterConfig } = await import('@/services/thermalPrinterService')
        const fresh = await getPrinterConfig(getBusinessId())
        if (fresh.success && fresh.config) {
          setShowItemUnit(fresh.config.showItemUnit || false)
          setWebPrintLegible(fresh.config.webPrintLegible || false)
          setTicketFontSize(fresh.config.ticketFontSize || (fresh.config.webPrintLegible ? 'medium' : 'small'))
          setCompactPrint(fresh.config.compactPrint || false)
          setPrintMargins(fresh.config.printMargins ?? 8)
          setSimplePrint(fresh.config.simplePrint || false)
          setA4SheetPrint(fresh.config.a4SheetPrint || false)
          setTicketPaperWidth(fresh.config.paperWidth || 80)
          // Dar un tick para que el ticket se re-renderice con los valores frescos antes de imprimir
          await new Promise(resolve => setTimeout(resolve, 60))
        }
      } catch (e) {
        console.error('Error releyendo config de impresora antes de imprimir:', e)
      }
      window.print()
      if (companySettings?.autoResetPOS) setTimeout(() => clearCart(), 1000)
    } finally {
      setIsPrintingTicket(false)
      // Recordatorio de vuelto DESPUÉS de imprimir (pedido del usuario): el ticket sale
      // primero y luego aparece el aviso. Solo una vez por venta (se limpia el ref).
      if (pendingChangeReminderRef.current) {
        const pending = pendingChangeReminderRef.current
        pendingChangeReminderRef.current = null
        setChangeReminder(pending)
      }
    }
  }

  const handleSendWhatsApp = async (phoneParam) => {
    console.log('=== handleSendWhatsApp llamado ===')

    if (!lastInvoiceData) {
      toast.error('No hay datos de factura disponibles')
      return
    }

    // Prioriza el número escrito en el momento (modal post-venta); si no, el del cliente.
    const phone = (typeof phoneParam === 'string' && phoneParam.trim())
      ? phoneParam.trim()
      : (lastInvoiceData.customer?.phone || customerData.phone)
    if (!phone) {
      toast.error('Ingresa un número de WhatsApp')
      return
    }

    setSendingWhatsApp(true)
    try {
      toast.info('Generando comprobante...')

      // Generar el PDF como blob
      const pdfBlob = await getInvoicePDFBlob(lastInvoiceData, companySettings, branding, branches)

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
      const total = formatCurrency(lastInvoiceData.total, lastInvoiceData.currency)

      // Crear mensaje con link de descarga
      const message = `Hola ${customerName},

Gracias por tu compra en *${companySettings?.tradeName || companySettings?.name || 'nuestra tienda'}*.

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

      if (companySettings?.autoResetPOS) setTimeout(() => clearCart(), 1000)
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
      const pdfBlob = await getInvoicePDFBlob(lastInvoiceData, companySettings, branding, branches)

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
            const total = formatCurrency(lastInvoiceData.total, lastInvoiceData.currency)
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
    // Productos con variantes: sumar stock de variantes (filtrado por almacén si aplica)
    if (product.hasVariants && product.variants?.length > 0) {
      if (!selectedWarehouse) return product.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
      return product.variants.reduce((sum, v) => {
        const ws = (v.warehouseStocks || []).find(ws => ws.warehouseId === selectedWarehouse.id)
        return sum + (ws?.stock || 0)
      }, 0)
    }
    if (!selectedWarehouse) return product.stock || 0
    // Usar getTotalAvailableStock que incluye stock del almacén + stock huérfano
    return getTotalAvailableStock(product, selectedWarehouse.id)
  }

  const getStockBadge = product => {
    // Obtener stock del almacén seleccionado
    const warehouseStock = getCurrentWarehouseStock(product)

    if (product.stock === null && !product.hasVariants) {
      return <span className="text-[10px] sm:text-xs text-gray-400 whitespace-nowrap">Sin control</span>
    }

    if (warehouseStock === 0) {
      return <span className="text-[10px] sm:text-xs text-red-600 font-semibold whitespace-nowrap">Sin stock</span>
    }

    const displayStock = Number.isInteger(warehouseStock) ? warehouseStock : parseFloat(warehouseStock.toFixed(2))
    const minStock = Number.isFinite(Number(product?.minStock)) && Number(product?.minStock) >= 0
      ? Number(product.minStock)
      : 3
    const color = warehouseStock > minStock ? 'text-green-600' : 'text-yellow-600'

    return (
      <span className={`text-[10px] sm:text-xs ${color} whitespace-nowrap`}>
        Stock: <span className="font-semibold">{displayStock}</span>
      </span>
    )
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
    <div className="animate-fade-in px-2 sm:px-4 lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
      {companySettings?.requireOpenCashRegister && !cashRegisterOpen && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-amber-50 border border-amber-300 rounded-lg text-amber-800">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">Caja diaria no aperturada</p>
            <p className="text-xs mt-0.5">Debe abrir la caja diaria antes de poder emitir ventas. Vaya a Caja Diaria para aperturar.</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 lg:flex-1 lg:min-h-0">
        {/* Products Panel */}
        <div className={`${expandedCart ? 'lg:col-span-1' : 'lg:col-span-2'} min-w-0 space-y-4 lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:pb-4 custom-scrollbar`}>
          {/* Header */}
          <div className={`flex flex-col mt-3 lg:mt-4 ${expandedCart ? 'gap-2' : 'sm:flex-row sm:items-center sm:justify-between'} gap-4`}>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Punto de Venta</h1>
                <button
                  onClick={() => setExpandedCart(prev => !prev)}
                  className="hidden lg:flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  title={expandedCart ? 'Expandir productos' : 'Expandir documento'}
                >
                  {expandedCart ? <PanelRightClose className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>
                {editingInvoiceId && (
                  <Badge variant="warning" className="bg-blue-600 text-white animate-pulse">
                    <Edit2 className="w-3 h-3 mr-1" />
                    Editando {editingInvoiceData?.series}-{editingInvoiceData?.number}
                  </Badge>
                )}
                {tableData && (
                  <Badge variant="default" className="bg-blue-600 text-white">
                    Mesa {tableData.tableNumber} - {tableData.orderNumber}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {editingInvoiceId
                  ? `Editando documento - Los cambios se guardarán al procesar`
                  : tableData
                    ? `Generando comprobante para Mesa ${tableData.tableNumber}`
                    : 'Selecciona productos para la venta'}
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {companySettings?.allowCustomProducts && (
                <button
                  onClick={() => setShowCustomProductModal(true)}
                  className="flex items-center justify-center gap-2 bg-primary-600 border border-primary-700 rounded-lg px-3 py-2 text-sm text-white hover:bg-primary-700 shadow-sm transition-colors w-[70%] sm:w-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Producto Personalizado</span>
                  <span className="sm:hidden">Personalizado</span>
                </button>
              )}
              <button
                onClick={clearCart}
                disabled={cart.length === 0 && !saleCompleted}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm shadow-sm transition-colors w-[30%] sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed ${
                  saleCompleted
                    ? 'bg-green-600 border border-green-700 text-white hover:bg-green-700 animate-pulse'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {saleCompleted ? (
                  <>
                    <Plus className="w-4 h-4" />
                    Nueva Venta
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Limpiar
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Search — sticky en desktop para que quede pegado al header al scrollear */}
          <div className={`flex gap-2 min-w-0 lg:sticky lg:top-0 lg:z-20 lg:bg-gray-50 lg:py-2 ${saleCompleted ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm flex-1 min-w-0">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={saleCompleted ? "Presiona 'Nueva Venta' para continuar..." : "Buscar producto por nombre o código..."}
                value={searchTerm}
                onChange={e => {
                  // Edición manual: cancela la bandera de escaneo de pistola.
                  scanSubmitRef.current = false
                  setSearchTerm(e.target.value)
                }}
                onPaste={() => { lastSearchPasteRef.current = Date.now() }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  const term = searchTerm.trim()
                  // Solo tratamos el Enter como "escaneo" si el código se PEGÓ recién
                  // (pistola: copiar/pegar/Enter). Si el usuario tipeó un nombre a mano,
                  // no mostramos error (puede estar buscando por nombre).
                  const wasPaste = Date.now() - lastSearchPasteRef.current < 1500
                  if (term.length >= 1 && wasPaste && products.length > 0 && !codeExists(term)) {
                    setUnknownScanCode(term)
                    setSearchTerm('')
                  }
                }}
                disabled={saleCompleted}
                className="flex-1 min-w-0 text-base sm:text-lg border-none bg-transparent focus:ring-0 focus:outline-none disabled:cursor-not-allowed"
              />
            </div>
            {isNativeApp && (
              <button
                onClick={handleScanBarcode}
                disabled={saleCompleted || isScanning}
                className="flex-shrink-0 flex items-center justify-center gap-2 bg-primary-600 border border-primary-700 text-white rounded-lg px-4 py-2 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                title="Escanear código de barras"
              >
                {isScanning ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <ScanBarcode className="w-6 h-6" />
                )}
              </button>
            )}
            {/* Toggle vista cards / lista — un solo botón que alterna */}
            <button
              onClick={() => setProductViewMode(productViewMode === 'grid' ? 'list' : 'grid')}
              disabled={saleCompleted}
              title={productViewMode === 'grid' ? 'Cambiar a vista en lista' : 'Cambiar a vista en cuadrícula'}
              className="flex-shrink-0 flex items-center justify-center rounded-lg p-2 bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {productViewMode === 'grid' ? <LayoutGrid className="w-5 h-5" /> : <List className="w-5 h-5" />}
            </button>
          </div>

          {/* Barra unificada de filtros (categorías + marcas) — un solo contenedor
              para ahorrar espacio vertical. Cuando ambas secciones están colapsadas,
              los toggles quedan lado a lado en una sola fila. */}
          {(categories.length > 0 || brands.length > 0) && (
          <div className="flex flex-wrap gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200">
          {categories.length > 0 && (
            <>
              {/* Toggle global para colapsar/expandir toda la sección de categorías */}
              <button
                onClick={toggleCategoriesSection}
                className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 inline-flex items-center gap-1"
                title={categoriesSectionCollapsed ? 'Mostrar categorías' : 'Ocultar categorías'}
              >
                {categoriesSectionCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>Categorías</span>
                {categoriesSectionCollapsed && selectedCategoryFilter !== 'all' && (
                  <span className="text-primary-700 font-semibold">
                    · {selectedCategoryFilter === 'sin-categoria'
                      ? 'Sin categoría'
                      : (categories.find(c => c.id === selectedCategoryFilter)?.name || selectedCategoryFilter)}
                  </span>
                )}
              </button>
              {!categoriesSectionCollapsed && (
              <>
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
                const hasSubs = subcats.length > 0
                const isExpanded = expandedRootCategoryId === category.id
                return (
                  <React.Fragment key={category.id}>
                    <button
                      onClick={() => {
                        // Si ya está seleccionada esta raíz y tiene subs, toggle (permite colapsar manualmente).
                        if (selectedCategoryFilter === category.id && hasSubs) {
                          setExpandedRootCategoryId(prev => prev === category.id ? null : category.id)
                        } else {
                          setSelectedCategoryFilter(category.id)
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors inline-flex items-center gap-1 ${
                        selectedCategoryFilter === category.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>{category.name}</span>
                      {hasSubs && (
                        isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                          : <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      )}
                    </button>
                    {/* Subcategorías visibles solo cuando la raíz está expandida */}
                    {isExpanded && subcats.map((subcat) => (
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
              </>
              )}
            </>
          )}

          {/* Marcas (en el mismo contenedor) */}
          {brands.length > 0 && (
            <>
              <button
                onClick={toggleBrandsSection}
                className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 inline-flex items-center gap-1"
                title={brandsSectionCollapsed ? 'Mostrar marcas' : 'Ocultar marcas'}
              >
                {brandsSectionCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>Marcas</span>
                {brandsSectionCollapsed && selectedBrandFilter !== 'all' && (
                  <span className="text-primary-700 font-semibold">
                    · {selectedBrandFilter === 'sin-marca'
                      ? 'Sin marca'
                      : (brands.find(b => b.id === selectedBrandFilter)?.name || selectedBrandFilter)}
                  </span>
                )}
              </button>
              {!brandsSectionCollapsed && (
                <>
                  <button
                    onClick={() => setSelectedBrandFilter('all')}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selectedBrandFilter === 'all'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5 inline mr-1" />
                    Todas
                  </button>
                  {[...brands].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })).map((brand) => (
                    <button
                      key={brand.id}
                      onClick={() => setSelectedBrandFilter(brand.id)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        selectedBrandFilter === brand.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Tag className="w-3.5 h-3.5 inline mr-1" />
                      {brand.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedBrandFilter('sin-marca')}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selectedBrandFilter === 'sin-marca'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Sin marca
                  </button>
                </>
              )}
            </>
          )}
          </div>
          )}

          {/* Products Grid */}
          {productsLoading ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Loader2 className="w-12 h-12 text-primary-400 mx-auto mb-4 animate-spin" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Cargando productos...</h3>
              </CardContent>
            </Card>
          ) : filteredProducts.length === 0 ? (
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
          ) : productViewMode === 'list' ? (
            <>
              <div key={selectedCategoryFilter} className={`flex flex-col divide-y divide-gray-100 bg-white rounded-lg border border-gray-200 overflow-hidden ${saleCompleted ? 'opacity-50 pointer-events-none' : ''}`}>
                {displayedProducts.map(product => {
                  const warehouseStock = getCurrentWarehouseStock(product)
                  const isOutOfStock = !product.hasVariants &&
                    product.stock !== null &&
                    warehouseStock <= 0 &&
                    !companySettings?.allowNegativeStock
                  const expirationStatus = getProductExpirationStatus(product)
                  const isExpired = expirationStatus && !expirationStatus.canSell
                  const noIngredients = !companySettings?.allowNegativeStock && productsWithoutIngredients.has(product.id)
                  const isDisabled = isOutOfStock || isExpired || noIngredients
                  const quantityInCart = cart
                    .filter(item => item.id === product.id)
                    .reduce((sum, item) => sum + item.quantity, 0)

                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={isDisabled}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors touch-no-hover ${
                        isExpired
                          ? 'bg-red-50 opacity-60 cursor-not-allowed'
                          : isOutOfStock
                            ? 'opacity-50 cursor-not-allowed'
                            : noIngredients
                              ? 'bg-orange-50/40 opacity-60 cursor-not-allowed'
                              : 'hover:bg-primary-50 active:bg-primary-100'
                      }`}
                    >
                      {/* Badge cantidad en carrito */}
                      {quantityInCart > 0 && (
                        <div className="flex-shrink-0 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow">
                          {quantityInCart}
                        </div>
                      )}
                      {/* Imagen pequeña (sólo si el producto tiene imagen) */}
                      {product.imageUrl && (
                        <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded bg-gray-100 overflow-hidden">
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      )}
                      {/* Info principal */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm sm:text-base truncate ${isExpired ? 'text-red-700' : 'text-gray-900'}`}>
                            {product.name}
                          </p>
                          {product.hasVariants && (
                            <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                              {product.variants?.length || 0} var.
                            </span>
                          )}
                          {expirationStatus && expirationStatus.status !== 'ok' && (
                            <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              isExpired
                                ? 'bg-red-600 text-white'
                                : expirationStatus.status === 'critical' || expirationStatus.status === 'today'
                                  ? 'bg-red-500 text-white'
                                  : expirationStatus.status === 'warning'
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-yellow-500 text-white'
                            }`}>
                              {isExpired ? 'VENC' : `${expirationStatus.days}d`}
                            </span>
                          )}
                          {noIngredients && (
                            <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium bg-orange-500 text-white">
                              Sin insumos
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-500 mt-0.5 truncate">
                          {(product.sku || product.code || product.barcode) && (
                            <span className="truncate">{product.sku || product.code || product.barcode}</span>
                          )}
                          {product.marca && <span className="text-purple-600 font-medium truncate">· {product.marca}</span>}
                          {product.location && <span className="font-mono text-blue-600">· {product.location}</span>}
                        </div>
                      </div>
                      {/* Precio + stock a la derecha */}
                      <div className="flex-shrink-0 text-right">
                        <p className={`text-sm sm:text-base font-bold ${isExpired ? 'text-red-600' : 'text-primary-600'}`}>
                          {formatCatalogPrice(product)}
                        </p>
                        {posMultiCurrencyOn && exchangeRate > 1 && (
                          <p className="text-[10px] font-medium text-gray-400 leading-tight">≈ {formatCatalogPriceIn(product, currency === 'USD' ? 'PEN' : 'USD')}</p>
                        )}
                        {!hideStockInPOS && (
                          <div className="text-[11px] sm:text-xs mt-0.5">
                            {!product.hasVariants
                              ? getStockBadge(product)
                              : <span className="text-gray-500">Stock: <span className="font-semibold">{getCurrentWarehouseStock(product)}</span></span>
                            }
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Load More Button - lista */}
              {hasMoreProducts && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={selectedCategoryFilter !== 'all' ? loadAllProducts : loadMoreProducts}
                    className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    {selectedCategoryFilter !== 'all'
                      ? `Ver todos (${filteredProducts.length - renderCap} restantes)`
                      : `Ver más productos (${filteredProducts.length - renderCap} restantes)`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Masonry round-robin: grid de N columnas flex-col. El reparto horizontal
                  (producto i → columna i % N) lo hace productColumns; cada columna apila
                  compacto sin huecos aunque unas cards tengan foto y otras no. */}
              <div key={selectedCategoryFilter} className={`grid gap-3 ${saleCompleted ? 'opacity-50 pointer-events-none' : ''}`} style={{ overflow: 'visible', gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
                {productColumns.map((column, columnIndex) => (
                <div key={columnIndex} className="flex flex-col gap-3 min-w-0" style={{ overflow: 'visible' }}>
                {column.map(product => {
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
                  // Producto con receta cuyos insumos no alcanzan para 1 unidad.
                  // El badge se muestra ANTES de que el mozo arme el carrito, para
                  // que no se entere recién al cobrar. Sólo aplica cuando el dueño
                  // NO permitió vender sin stock (en ese modo no avisamos).
                  const noIngredients = !companySettings?.allowNegativeStock && productsWithoutIngredients.has(product.id)
                  const isDisabled = isOutOfStock || isExpired || noIngredients

                  // Calcular cantidad en carrito (suma de todas las variantes/lotes del producto)
                  const quantityInCart = cart
                    .filter(item => item.id === product.id)
                    .reduce((sum, item) => sum + item.quantity, 0)

                  // Niveles de precio (Público, Mayorista, VIP, ...) para previsualizar en la tarjeta
                  const priceLevels = getProductPriceLevels(product)
                  const hasMultiplePriceLevels = !product.hasVariants && priceLevels.length > 1

                  return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={isDisabled}
                  style={{ overflow: 'visible' }}
                  className={`w-full p-2 sm:p-3 bg-white border-2 rounded-lg transition-all text-left relative touch-no-hover ${
                    isExpired
                      ? 'border-red-300 bg-red-50 opacity-60 cursor-not-allowed'
                      : isOutOfStock
                        ? 'border-gray-200 opacity-50 cursor-not-allowed'
                        : noIngredients
                          ? 'border-orange-200 bg-orange-50/40 opacity-60 cursor-not-allowed'
                          : expirationStatus?.status === 'critical' || expirationStatus?.status === 'today'
                            ? 'border-red-300 hover:border-red-500 hover:shadow-md'
                            : expirationStatus?.status === 'warning'
                              ? 'border-orange-300 hover:border-orange-500 hover:shadow-md'
                              : expirationStatus?.status === 'caution'
                                ? 'border-yellow-300 hover:border-yellow-500 hover:shadow-md'
                                : 'border-gray-200 hover:border-primary-500 hover:shadow-md'
                  }`}
                >
                  {/* Badge de cantidad en carrito.
                      Posicionado dentro de la card (top-1 left-1) en vez de
                      sobresalir (-top-2 -left-2) porque WebKit (iOS) recorta
                      los elementos absolute con offsets negativos dentro de
                      columnas CSS multi-column. */}
                  {quantityInCart > 0 && (
                    <div className="absolute top-1 left-1 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-lg z-10">
                      {quantityInCart}
                    </div>
                  )}

                  {/* Badge "Sin insumos" — plato con receta sin ingredientes
                      suficientes para 1 unidad. Tiene prioridad visual sobre
                      el de vencimiento porque también deshabilita la tarjeta. */}
                  {noIngredients && (
                    <div className="absolute top-1 right-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500 text-white z-10 shadow-sm">
                      Sin insumos
                    </div>
                  )}

                  {/* Badge de vencimiento */}
                  {!noIngredients && expirationStatus && expirationStatus.status !== 'ok' && (
                    <div className={`absolute top-1 right-1 px-2 py-0.5 rounded-full text-xs font-medium z-10 ${
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

                  {/* Vertical layout for all screen sizes */}
                  <div className="flex flex-col overflow-hidden min-w-0">
                    {/* Image */}
                    {product.imageUrl && (
                      <div className="aspect-square w-full rounded-lg overflow-hidden bg-gray-100 mb-1.5 sm:mb-2">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    {/* Name - más pequeño en móvil, truncado en tablet */}
                    <p className={`font-semibold text-xs sm:text-sm leading-tight line-clamp-2 ${isExpired ? 'text-red-700' : 'text-gray-900'}`}>
                      {product.name}
                    </p>
                    {/* Variants badge */}
                    {product.hasVariants && (
                      <p className="text-[10px] text-purple-600 font-medium mt-0.5">
                        {product.variants?.length || 0} variantes
                      </p>
                    )}
                    {/* Codes - más compactos en móvil, ocultos en tablet */}
                    <div className="mt-0.5 space-y-0 text-[10px] text-gray-500 sm:hidden">
                      {product.sku && <p>SKU: {product.sku}</p>}
                      {product.code && <p>Cód: {product.code}</p>}
                      {product.barcode && <p className="font-mono">{product.barcode}</p>}
                      {product.location && <p className="font-mono text-blue-600">{product.location}</p>}
                    </div>
                    {/* Tablet/Desktop: código compacto en una línea */}
                    <p className="hidden sm:block text-xs text-gray-500 mt-1 truncate">
                      {product.sku || product.code || product.barcode || ''}{product.location ? ` | ${product.location}` : ''}
                    </p>
                    {/* Marca */}
                    {product.marca && (
                      <p className="text-[10px] sm:text-xs text-purple-600 font-medium mt-0.5 truncate">{product.marca}</p>
                    )}
                    {/* Pharmacy info */}
                    {product.genericName && (
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 sm:truncate">{product.genericName} {product.concentration}</p>
                    )}
                    {businessMode === 'pharmacy' && product.laboratoryName && (
                      <p className="text-[10px] sm:text-xs text-blue-600 font-medium mt-0.5 truncate">{product.laboratoryName}</p>
                    )}
                    {/* Product description */}
                    {businessSettings?.showDescriptionInPOS && product.description && (
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 whitespace-pre-line">{product.description}</p>
                    )}
                    {/* Price and Stock */}
                    <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-100">
                      {hasMultiplePriceLevels ? (
                        <>
                          {/* Todos los niveles de precio (Público, Mayorista, VIP, ...) como previsualización */}
                          <div className="space-y-0.5 mb-1">
                            {priceLevels.map(lvl => (
                              <div key={lvl.key} className="flex items-center justify-between gap-1.5 leading-tight">
                                <span className="text-[10px] sm:text-xs text-gray-500 truncate">{lvl.label}</span>
                                <span className={`text-xs sm:text-sm font-bold whitespace-nowrap ${isExpired ? 'text-red-600' : 'text-primary-600'}`}>
                                  {formatUnitPrice(toSessionCurrency(lvl.value), currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                          {!hideStockInPOS && !product.hasVariants && getStockBadge(product)}
                        </>
                      ) : (
                        <>
                          {/* Móvil: precio y stock en línea */}
                          <div className="flex items-center justify-between sm:hidden gap-2">
                            <p className={`text-sm font-bold ${isExpired ? 'text-red-600' : 'text-primary-600'}`}>
                              {formatCatalogPrice(product)}
                            </p>
                            {posMultiCurrencyOn && exchangeRate > 1 && (
                              <p className="text-[10px] font-medium text-gray-400 leading-tight whitespace-nowrap">≈ {formatCatalogPriceIn(product, currency === 'USD' ? 'PEN' : 'USD')}</p>
                            )}
                            {!hideStockInPOS && !product.hasVariants && getStockBadge(product)}
                            {product.hasVariants && !hideStockInPOS && (
                              <span className="text-[10px] text-gray-500">
                                Stock: <span className="font-semibold">{getCurrentWarehouseStock(product)}</span>
                              </span>
                            )}
                          </div>
                          {/* Tablet/Desktop: precio arriba, stock abajo */}
                          <div className="hidden sm:block overflow-hidden">
                            <p className={`text-sm font-bold truncate ${isExpired ? 'text-red-600' : 'text-primary-600'}`}>
                              {formatCatalogPrice(product)}
                            </p>
                            {posMultiCurrencyOn && exchangeRate > 1 && (
                              <p className="text-[10px] font-medium text-gray-400 leading-tight truncate">≈ {formatCatalogPriceIn(product, currency === 'USD' ? 'PEN' : 'USD')}</p>
                            )}
                            <div className="flex items-center justify-between mt-1">
                              {!hideStockInPOS && !product.hasVariants && getStockBadge(product)}
                              {product.hasVariants && (
                                <>
                                  {!hideStockInPOS && (
                                    <span className={`text-xs font-semibold ${getCurrentWarehouseStock(product) > (product?.minStock ?? 3) ? 'text-green-600' : getCurrentWarehouseStock(product) > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                      Stock: {getCurrentWarehouseStock(product)}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-purple-500 font-medium">Ver opciones</span>
                                </>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                </button>
                  )
                })}
                </div>
                ))}
              </div>

              {/* Load More Button */}
              {hasMoreProducts && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={selectedCategoryFilter !== 'all' ? loadAllProducts : loadMoreProducts}
                    className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    {selectedCategoryFilter !== 'all'
                      ? `Ver todos (${filteredProducts.length - renderCap} restantes)`
                      : `Ver más productos (${filteredProducts.length - renderCap} restantes)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Cart Panel */}
        <div className={`${expandedCart ? 'lg:col-span-2' : ''} min-w-0 lg:overflow-y-auto lg:overscroll-contain lg:pb-4 custom-scrollbar`}>
          {/* min-h-full + flex permite que la Card crezca con su contenido
              cuando hay muchos campos (datos del cliente + carrito + métodos
              de pago). Con h-full el fondo blanco se cortaba a la mitad y
              los elementos quedaban en el aire. */}
          <Card className="flex flex-col min-h-full min-w-0 mt-3 lg:mt-4">
            <div className={`min-w-0 ${expandedCart ? 'lg:grid lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-gray-100' : ''}`}>
            <CardContent className="p-2.5 xl:p-4 space-y-2 xl:space-y-3 overflow-hidden min-w-0">
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
                        // Sincronizar el local activo global (navbar + menú lateral) con el selector del POS
                        if (setActiveBranch) setActiveBranch(e.target.value || null)
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
                      {hasMainAccess && <option value="">{businessSettings?.mainBranchName || 'Sucursal Principal'}</option>}
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

                return filteredWarehouses.length > 0 && (
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
                      disabled={!!assignedSellerId}
                      className={`w-full px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${assignedSellerId ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : 'bg-white'}`}
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
                    // En edición NO se puede cambiar el tipo: el número emitido pertenece
                    // a la serie de ese tipo (cambiarlo genera p.ej. una "factura" con
                    // correlativo de boleta, que SUNAT rechaza). Anular y emitir de nuevo.
                    disabled={!!editingInvoiceId}
                    onChange={e => {
                      userChangedDocTypeRef.current = true
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
                    className="flex-1 px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                  >
                    {canEmitFiscal && (!allowedDocumentTypes || allowedDocumentTypes.length === 0 || allowedDocumentTypes.includes('boleta')) && (
                      <option value="boleta">Boleta de Venta</option>
                    )}
                    {canEmitFiscal && (!allowedDocumentTypes || allowedDocumentTypes.length === 0 || allowedDocumentTypes.includes('factura')) && (
                      <option value="factura">Factura Electrónica</option>
                    )}
                    {(!allowedDocumentTypes || allowedDocumentTypes.length === 0 || allowedDocumentTypes.includes('nota_venta')) && (
                      <option value="nota_venta">Nota de Venta</option>
                    )}
                  </select>
                  {cart.length > 0 && (
                    <span className="bg-primary-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {cart.length}
                    </span>
                  )}
                </div>
                {!canEmitFiscal && (
                  <p className="text-xs text-amber-600 mt-1">
                    Sin conexión SUNAT: solo Nota de Venta. Contactá al administrador para habilitar comprobantes.
                  </p>
                )}
                {!!editingInvoiceId && (
                  <p className="text-xs text-gray-500 mt-1">
                    Al editar no se puede cambiar el tipo de comprobante (el número pertenece a su serie). Para cambiarlo, anula este documento y emite uno nuevo.
                  </p>
                )}
              </div>

              {/* 4b. Moneda (solo retail con flag multi-divisa activa) ===== */}
              {posMultiCurrencyOn && (
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    <label className="text-xs font-medium text-gray-700">
                      Moneda de cobro
                    </label>
                  </div>
                  <div className="flex gap-1.5">
                    {SUPPORTED_CURRENCIES.map((ccy) => {
                      // Boletas SÍ admiten USD (SUNAT lo permite). Solo se bloquea mientras carga el TC.
                      const disabled = loadingRate
                      const active = currency === ccy
                      const isLoadingThis = loadingRate && ccy === 'USD'
                      return (
                        <button
                          key={ccy}
                          type="button"
                          disabled={disabled}
                          onClick={() => handleCurrencyChange(ccy)}
                          className={`flex-1 px-2 py-1 rounded text-xs font-medium border transition-colors inline-flex items-center justify-center gap-1.5 ${
                            active
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isLoadingThis && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {ccy === 'PEN' ? 'S/ Soles' : (isLoadingThis ? 'Cargando TC…' : '$ Dólares')}
                        </button>
                      )
                    })}
                  </div>

                  {posMultiCurrencyOn && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-medium text-gray-700">
                          TC (S/ por $)
                        </label>
                        {exchangeRateSource === 'sbs' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 font-medium">SBS</span>
                        )}
                        {exchangeRateSource === 'manual' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">Manual</span>
                        )}
                      </div>
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={exchangeRateInput}
                          onFocus={() => setTcInputFocused(true)}
                          onBlur={() => {
                            setTcInputFocused(false)
                            // Al perder foco: si quedó vacío o inválido,
                            // restaurar el último TC válido.
                            const parsed = parseFloat(exchangeRateInput)
                            if (!Number.isFinite(parsed) || parsed <= 0) {
                              setExchangeRateInput(exchangeRate > 0 ? String(exchangeRate) : '')
                            }
                          }}
                          onChange={(e) => {
                            const val = e.target.value
                            setExchangeRateInput(val)
                            const parsed = parseFloat(val)
                            if (Number.isFinite(parsed) && parsed > 0) {
                              setExchangeRate(parsed)
                              setExchangeRateSource('manual')
                            }
                          }}
                          className="flex-1 h-7 px-2 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => fetchExchangeRate(true)}
                          disabled={loadingRate}
                          className="h-7 px-2 text-[10px] font-medium rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          title="Obtener TC del día desde SBS"
                        >
                          {loadingRate ? '...' : 'SBS'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 5. Fecha de Emisión */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Fecha de Emisión
                </label>
                <input
                  type="date"
                  value={emissionDate}
                  max={documentType === 'nota_venta' ? undefined : getLocalDateString()}
                  min={documentType === 'nota_venta' ? undefined : (() => {
                    const today = new Date()
                    const maxDaysBack = documentType === 'factura' ? 3 : 7
                    const minDate = new Date(today)
                    minDate.setDate(today.getDate() - maxDaysBack)
                    return getLocalDateString(minDate)
                  })()}
                  onChange={e => { setEmissionDate(e.target.value); emissionDateEditedRef.current = true }}
                  className="w-full px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                />
              </div>

              {/* 5b. Hora del evento (Meta Ads) */}
              {businessSettings?.metaAdsEnabled && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Hora del evento (Meta Ads)
                  </label>
                  <input
                    type="datetime-local"
                    value={metaEventTime}
                    onChange={e => setMetaEventTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  />
                </div>
              )}

              {/* 6. Panel de Cliente - Siempre Visible */}
              <div className="space-y-2 min-w-0">
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
                              phone: '',
                              studentName: '',
                              studentSchedule: '',
                              petName: '',
                              vehiclePlate: '',
                              vehicleModel: '',
                              vehicleYear: ''
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
                                  phone: customer.phone || '',
                                  studentName: customer.studentName || '',
                                  studentSchedule: customer.studentSchedule || '',
                                  // Veterinaria: hidratar nombre de mascota (primera del array o legacy)
                                  petName: getPrimaryPet(customer)?.name || customer.petName || '',
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
                    <div className="flex gap-2 min-w-0">
                      <input
                        type="text"
                        maxLength={11}
                        value={customerData.documentNumber}
                        onChange={e => setCustomerData({
                          ...customerData,
                          documentNumber: e.target.value.replace(/\D/g, '')
                        })}
                        placeholder="RUC *"
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLookupDocument}
                        disabled={isLookingUp || !customerData.documentNumber || customerData.documentNumber.length !== 11}
                        className="px-2 shrink-0"
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
                    {customerData.documentNumber?.length === 11 && (
                      <button
                        type="button"
                        onClick={handleViewEstablishments}
                        disabled={loadingEstablishments}
                        className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 disabled:opacity-50"
                        title="Ver los establecimientos (anexos) registrados en SUNAT para elegir la dirección"
                      >
                        {loadingEstablishments
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Store className="w-3.5 h-3.5" />}
                        Ver establecimientos (SUNAT)
                      </button>
                    )}
                    <div className="flex gap-2 min-w-0">
                      <input
                        type="email"
                        value={customerData.email}
                        onChange={e => setCustomerData({ ...customerData, email: e.target.value })}
                        placeholder="Email"
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <input
                        type="tel"
                        value={customerData.phone}
                        onChange={e => setCustomerData({ ...customerData, phone: e.target.value })}
                        placeholder="Teléfono"
                        className="w-24 shrink-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    {companySettings?.posCustomFields?.showStudentField && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={customerData.studentName}
                          onChange={e => setCustomerData({ ...customerData, studentName: e.target.value })}
                          placeholder="Alumno"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <input
                          type="text"
                          value={customerData.studentSchedule}
                          onChange={e => setCustomerData({ ...customerData, studentSchedule: e.target.value })}
                          placeholder="Horario"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    )}
                    {/* Modo veterinaria: nombre de mascota.
                        Si el cliente seleccionado tiene varias mascotas, mostrar chips para cambiar
                        rápido entre ellas (la primera carga por defecto al seleccionar cliente). */}
                    {businessMode === 'veterinary' && (() => {
                      const pets = selectedCustomer
                        ? (Array.isArray(selectedCustomer.pets) && selectedCustomer.pets.length > 0
                            ? selectedCustomer.pets
                            : (selectedCustomer.petName
                                ? [{ id: 'legacy', name: selectedCustomer.petName }]
                                : []))
                        : []
                      const allPetNames = pets.map(p => p.name).filter(Boolean).join(', ')
                      return (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={customerData.petName}
                            onChange={e => setCustomerData({ ...customerData, petName: e.target.value })}
                            placeholder="Nombre de la mascota"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          {pets.length > 1 && (() => {
                            // Selección MÚLTIPLE: petName guarda las mascotas elegidas separadas por coma.
                            const selectedNames = customerData.petName.split(',').map(s => s.trim()).filter(Boolean)
                            const allOn = pets.every(p => selectedNames.includes(p.name))
                            const togglePet = (name) => {
                              const next = selectedNames.includes(name)
                                ? selectedNames.filter(n => n !== name)
                                : [...selectedNames, name]
                              setCustomerData({ ...customerData, petName: next.join(', ') })
                            }
                            return (
                              <div className="flex flex-wrap gap-1">
                                {pets.map(p => {
                                  const on = selectedNames.includes(p.name)
                                  return (
                                    <button
                                      key={p.id || p.name}
                                      type="button"
                                      onClick={() => togglePet(p.name)}
                                      className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                                        on
                                          ? 'bg-primary-100 border-primary-500 text-primary-700'
                                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                      }`}
                                      title={p.species ? `${p.name} (${p.species})` : p.name}
                                    >
                                      {p.name}
                                    </button>
                                  )
                                })}
                                <button
                                  type="button"
                                  onClick={() => setCustomerData({ ...customerData, petName: allOn ? '' : allPetNames })}
                                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                                    allOn
                                      ? 'bg-primary-100 border-primary-500 text-primary-700'
                                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                  }`}
                                  title="Atender todas las mascotas"
                                >
                                  Todas
                                </button>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })()}
                    {companySettings?.posCustomFields?.showVehiclePlateField && (
                      <input
                        type="text"
                        value={customerData.vehiclePlate}
                        onChange={e => setCustomerData({ ...customerData, vehiclePlate: e.target.value.toUpperCase() })}
                        placeholder="Placa de Vehículo"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}
                    {companySettings?.posCustomFields?.showVehicleModelField && (
                      <input
                        type="text"
                        value={customerData.vehicleModel}
                        onChange={e => setCustomerData({ ...customerData, vehicleModel: e.target.value })}
                        placeholder="Modelo de Vehículo"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}
                    {companySettings?.posCustomFields?.showVehicleYearField && (
                      <input
                        type="text"
                        value={customerData.vehicleYear}
                        onChange={e => setCustomerData({ ...customerData, vehicleYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="Año de Vehículo"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}

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
                              onChange={e => {
                                setPaymentDueDate(e.target.value)
                                // Si hay una sola cuota, actualizar su fecha también
                                if (paymentInstallments.length === 1) {
                                  setPaymentInstallments([{ ...paymentInstallments[0], dueDate: e.target.value }])
                                }
                              }}
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
                                  // Calcular el monto correcto (con detracción si aplica)
                                  let montoInicial = amounts.total
                                  if (hasDetraction && detractionType && paymentInstallments.length === 0) {
                                    const detractionRate = DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0
                                    const detractionAmt = Math.round((amounts.total * detractionRate) / 100)
                                    montoInicial = amounts.total - detractionAmt
                                  }
                                  const newInstallment = {
                                    number: paymentInstallments.length + 1,
                                    amount: paymentInstallments.length === 0 ? montoInicial.toFixed(2) : '',
                                    dueDate: paymentDueDate || getLocalDateString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
                                  }
                                  setPaymentInstallments([...paymentInstallments, newInstallment])
                                }}
                                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                              >
                                + Agregar cuota
                              </button>
                            </div>

                            {/* Una sola cuota - mostrar campo simple con opción de editar */}
                            {paymentInstallments.length === 1 && (
                              <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                                <span className="text-xs text-gray-500">{currency === 'USD' ? '$' : 'S/'}</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={paymentInstallments[0].amount}
                                  onChange={e => {
                                    setPaymentInstallments([{ ...paymentInstallments[0], amount: e.target.value }])
                                  }}
                                  placeholder="Monto a pagar"
                                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Calcular el neto a pagar (con detracción si aplica)
                                    let montoNeto = amounts.total
                                    if (hasDetraction && detractionType) {
                                      const detractionRate = DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0
                                      const detractionAmt = Math.round((amounts.total * detractionRate) / 100)
                                      montoNeto = amounts.total - detractionAmt
                                    }
                                    setPaymentInstallments([{ ...paymentInstallments[0], amount: montoNeto.toFixed(2) }])
                                  }}
                                  className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1 bg-primary-50 rounded"
                                  title="Usar neto a pagar"
                                >
                                  Neto
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentInstallments([])
                                  }}
                                  className="text-red-500 hover:text-red-700 p-0.5"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {/* Múltiples cuotas - mostrar lista */}
                            {paymentInstallments.length > 1 && (
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

                      {/* Sección de Detracción */}
                      <div className="mt-3 pt-2 border-t border-gray-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hasDetraction}
                            onChange={e => {
                              setHasDetraction(e.target.checked)
                              if (!e.target.checked) {
                                setDetractionType('')
                                setDetractionBankAccount('')
                              } else {
                                // Auto-rellenar cuenta BN desde configuración del negocio
                                if (!detractionBankAccount && companySettings?.bankAccountsList && Array.isArray(companySettings.bankAccountsList)) {
                                  const bnAccount = companySettings.bankAccountsList.find(acc => acc.accountType === 'detracciones')
                                  if (bnAccount?.accountNumber) {
                                    setDetractionBankAccount(bnAccount.accountNumber)
                                  }
                                }
                              }
                            }}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-xs font-medium text-gray-700">Sujeto a Detracción</span>
                          {amounts.total >= DETRACTION_MIN_AMOUNT && !hasDetraction && (
                            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              Monto ≥ S/ {DETRACTION_MIN_AMOUNT}
                            </span>
                          )}
                        </label>

                        {hasDetraction && (
                          <div className="mt-2 space-y-2 bg-amber-50 p-2 rounded-lg border border-amber-200">
                            {/* Tipo de bien/servicio */}
                            <div>
                              <label className="text-[10px] text-gray-500 mb-0.5 block">Tipo de Bien/Servicio</label>
                              <select
                                value={detractionType}
                                onChange={e => setDetractionType(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                              >
                                <option value="">Seleccionar...</option>
                                <optgroup label="Bienes">
                                  {DETRACTION_TYPES.filter(t => t.category === 'bienes').map(type => (
                                    <option key={type.code} value={type.code}>
                                      {type.code} - {type.name} ({type.rate}%)
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Servicios">
                                  {DETRACTION_TYPES.filter(t => t.category === 'servicios').map(type => (
                                    <option key={type.code} value={type.code}>
                                      {type.code} - {type.name} ({type.rate}%)
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>

                            {detractionType && (
                              <>
                                {/* Porcentaje y Monto */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Porcentaje</label>
                                    <div className="px-2 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded-lg text-gray-700 font-medium">
                                      {DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0}%
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Monto Detracción</label>
                                    <div className="px-2 py-1.5 text-xs bg-amber-100 border border-amber-300 rounded-lg text-amber-800 font-bold">
                                      S/ {Math.round((amounts.total * (DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0)) / 100).toFixed(2)}
                                    </div>
                                  </div>
                                </div>

                                {/* Cuenta Banco de la Nación */}
                                <div>
                                  <label className="text-[10px] text-gray-500 mb-0.5 block">
                                    N° Cuenta Banco de la Nación (Proveedor)
                                  </label>
                                  <input
                                    type="text"
                                    value={detractionBankAccount}
                                    onChange={e => setDetractionBankAccount(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Ej: 00-123-456789"
                                    maxLength={20}
                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                                  />
                                </div>

                                {/* Campos de Transporte de Carga - Solo para 021 y 027 */}
                                {showTransportFields && (
                                  <div className="mt-2 pt-2 border-t border-amber-300 space-y-2">
                                    <p className="text-[10px] font-medium text-amber-700">Datos de Transporte de Carga</p>

                                    <input
                                      type="text"
                                      value={customerData.originAddress || ''}
                                      onChange={e => setCustomerData({ ...customerData, originAddress: e.target.value })}
                                      placeholder="Dirección de Origen"
                                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    />

                                    <input
                                      type="text"
                                      value={customerData.destinationAddress || ''}
                                      onChange={e => setCustomerData({ ...customerData, destinationAddress: e.target.value })}
                                      placeholder="Dirección de Destino"
                                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    />

                                    <input
                                      type="text"
                                      value={customerData.tripDetail || ''}
                                      onChange={e => setCustomerData({ ...customerData, tripDetail: e.target.value })}
                                      placeholder="Detalle del Viaje (ej: Transporte de contenedor)"
                                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    />

                                    <div className="grid grid-cols-3 gap-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={customerData.serviceReferenceValue || ''}
                                        onChange={e => setCustomerData({ ...customerData, serviceReferenceValue: e.target.value })}
                                        placeholder="Val. Ref. Servicio"
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                                      />
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={customerData.effectiveLoadValue || ''}
                                        onChange={e => setCustomerData({ ...customerData, effectiveLoadValue: e.target.value })}
                                        placeholder="Val. Carga Efect."
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                                      />
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={customerData.usefulLoadValue || ''}
                                        onChange={e => setCustomerData({ ...customerData, usefulLoadValue: e.target.value })}
                                        placeholder="Val. Carga Útil"
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Resumen */}
                                <div className="text-[10px] text-gray-600 bg-white p-2 rounded border border-gray-200">
                                  <div className="flex justify-between">
                                    <span>Total Factura:</span>
                                    <span className="font-medium">{formatCurrency(amounts.total, currency)}</span>
                                  </div>
                                  <div className="flex justify-between text-amber-700">
                                    <span>(-) Detracción ({DETRACTION_TYPES.find(t => t.code === detractionType)?.rate}%):</span>
                                    <span className="font-medium">
                                      {formatCurrency(Math.round((amounts.total * (DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0)) / 100))}
                                    </span>
                                  </div>
                                  <div className="flex justify-between font-bold text-green-700 border-t pt-1 mt-1">
                                    <span>Neto a Pagar:</span>
                                    <span>
                                      {formatCurrency(amounts.total - Math.round((amounts.total * (DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0)) / 100))}
                                    </span>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Sección de Retención (cliente agente de retención) */}
                      <div className="mt-3 pt-2 border-t border-gray-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hasRetencion}
                            onChange={e => setHasRetencion(e.target.checked)}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-xs font-medium text-gray-700">Operación sujeta a retención (cliente agente de retención)</span>
                        </label>
                        {hasRetencion && (
                          <div className="mt-2 text-xs bg-gray-50 rounded p-2 space-y-1">
                            <div className="flex justify-between text-gray-600">
                              <span>Retención IGV (3%):</span>
                              <span>- {formatCurrency(amounts.total * 0.03)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-green-700 border-t pt-1">
                              <span>Importe neto a pagar:</span>
                              <span>{formatCurrency(amounts.total - amounts.total * 0.03)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : documentType === 'boleta' ? (
                  <>
                    <div className="flex gap-2 min-w-0">
                      <select
                        value={customerData.documentType}
                        onChange={e => setCustomerData({
                          ...customerData,
                          documentType: e.target.value,
                          documentNumber: '',
                          name: '',
                          businessName: ''
                        })}
                        className="w-20 shrink-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                        className="px-2 shrink-0"
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
                    {companySettings?.posCustomFields?.showStudentField && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={customerData.studentName}
                          onChange={e => setCustomerData({ ...customerData, studentName: e.target.value })}
                          placeholder="Alumno"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <input
                          type="text"
                          value={customerData.studentSchedule}
                          onChange={e => setCustomerData({ ...customerData, studentSchedule: e.target.value })}
                          placeholder="Horario"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    )}
                    {/* Modo veterinaria: nombre de mascota.
                        Si el cliente seleccionado tiene varias mascotas, mostrar chips para cambiar
                        rápido entre ellas (la primera carga por defecto al seleccionar cliente). */}
                    {businessMode === 'veterinary' && (() => {
                      const pets = selectedCustomer
                        ? (Array.isArray(selectedCustomer.pets) && selectedCustomer.pets.length > 0
                            ? selectedCustomer.pets
                            : (selectedCustomer.petName
                                ? [{ id: 'legacy', name: selectedCustomer.petName }]
                                : []))
                        : []
                      const allPetNames = pets.map(p => p.name).filter(Boolean).join(', ')
                      return (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={customerData.petName}
                            onChange={e => setCustomerData({ ...customerData, petName: e.target.value })}
                            placeholder="Nombre de la mascota"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          {pets.length > 1 && (() => {
                            // Selección MÚLTIPLE: petName guarda las mascotas elegidas separadas por coma.
                            const selectedNames = customerData.petName.split(',').map(s => s.trim()).filter(Boolean)
                            const allOn = pets.every(p => selectedNames.includes(p.name))
                            const togglePet = (name) => {
                              const next = selectedNames.includes(name)
                                ? selectedNames.filter(n => n !== name)
                                : [...selectedNames, name]
                              setCustomerData({ ...customerData, petName: next.join(', ') })
                            }
                            return (
                              <div className="flex flex-wrap gap-1">
                                {pets.map(p => {
                                  const on = selectedNames.includes(p.name)
                                  return (
                                    <button
                                      key={p.id || p.name}
                                      type="button"
                                      onClick={() => togglePet(p.name)}
                                      className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                                        on
                                          ? 'bg-primary-100 border-primary-500 text-primary-700'
                                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                      }`}
                                      title={p.species ? `${p.name} (${p.species})` : p.name}
                                    >
                                      {p.name}
                                    </button>
                                  )
                                })}
                                <button
                                  type="button"
                                  onClick={() => setCustomerData({ ...customerData, petName: allOn ? '' : allPetNames })}
                                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                                    allOn
                                      ? 'bg-primary-100 border-primary-500 text-primary-700'
                                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                  }`}
                                  title="Atender todas las mascotas"
                                >
                                  Todas
                                </button>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })()}
                    {companySettings?.posCustomFields?.showVehiclePlateField && (
                      <input
                        type="text"
                        value={customerData.vehiclePlate}
                        onChange={e => setCustomerData({ ...customerData, vehiclePlate: e.target.value.toUpperCase() })}
                        placeholder="Placa de Vehículo"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}
                    {companySettings?.posCustomFields?.showVehicleModelField && (
                      <input
                        type="text"
                        value={customerData.vehicleModel}
                        onChange={e => setCustomerData({ ...customerData, vehicleModel: e.target.value })}
                        placeholder="Modelo de Vehículo"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}
                    {companySettings?.posCustomFields?.showVehicleYearField && (
                      <input
                        type="text"
                        value={customerData.vehicleYear}
                        onChange={e => setCustomerData({ ...customerData, vehicleYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="Año de Vehículo"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}

                    <input
                      type="text"
                      value={customerData.address}
                      onChange={e => setCustomerData({ ...customerData, address: e.target.value })}
                      placeholder="Dirección"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <div className="flex gap-2 min-w-0">
                      <input
                        type="email"
                        value={customerData.email}
                        onChange={e => setCustomerData({ ...customerData, email: e.target.value })}
                        placeholder="Email"
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <input
                        type="tel"
                        value={customerData.phone}
                        onChange={e => setCustomerData({ ...customerData, phone: e.target.value })}
                        placeholder="Teléfono"
                        className="w-24 shrink-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </>
                ) : (
                  /* Nota de venta - con búsqueda de DNI/RUC */
                  <div className="space-y-2 min-w-0">
                    <div className="flex gap-2 min-w-0">
                      <select
                        value={customerData.documentType || ID_TYPES.DNI}
                        onChange={e => setCustomerData({
                          ...customerData,
                          documentType: e.target.value,
                          documentNumber: '',
                          name: '',
                          businessName: ''
                        })}
                        className="w-20 shrink-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                        className="px-2 shrink-0"
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
                    {companySettings?.posCustomFields?.showStudentField && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={customerData.studentName}
                          onChange={e => setCustomerData({ ...customerData, studentName: e.target.value })}
                          placeholder="Alumno (opcional)"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <input
                          type="text"
                          value={customerData.studentSchedule}
                          onChange={e => setCustomerData({ ...customerData, studentSchedule: e.target.value })}
                          placeholder="Horario (opcional)"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    )}
                    {businessMode === 'veterinary' && (() => {
                      const pets = selectedCustomer
                        ? (Array.isArray(selectedCustomer.pets) && selectedCustomer.pets.length > 0
                            ? selectedCustomer.pets
                            : (selectedCustomer.petName
                                ? [{ id: 'legacy', name: selectedCustomer.petName }]
                                : []))
                        : []
                      const allPetNames = pets.map(p => p.name).filter(Boolean).join(', ')
                      return (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={customerData.petName}
                            onChange={e => setCustomerData({ ...customerData, petName: e.target.value })}
                            placeholder="Nombre de la mascota (opcional)"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          {pets.length > 1 && (() => {
                            // Selección MÚLTIPLE: petName guarda las mascotas elegidas separadas por coma.
                            const selectedNames = customerData.petName.split(',').map(s => s.trim()).filter(Boolean)
                            const allOn = pets.every(p => selectedNames.includes(p.name))
                            const togglePet = (name) => {
                              const next = selectedNames.includes(name)
                                ? selectedNames.filter(n => n !== name)
                                : [...selectedNames, name]
                              setCustomerData({ ...customerData, petName: next.join(', ') })
                            }
                            return (
                              <div className="flex flex-wrap gap-1">
                                {pets.map(p => {
                                  const on = selectedNames.includes(p.name)
                                  return (
                                    <button
                                      key={p.id || p.name}
                                      type="button"
                                      onClick={() => togglePet(p.name)}
                                      className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                                        on
                                          ? 'bg-primary-100 border-primary-500 text-primary-700'
                                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                      }`}
                                      title={p.species ? `${p.name} (${p.species})` : p.name}
                                    >
                                      {p.name}
                                    </button>
                                  )
                                })}
                                <button
                                  type="button"
                                  onClick={() => setCustomerData({ ...customerData, petName: allOn ? '' : allPetNames })}
                                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                                    allOn
                                      ? 'bg-primary-100 border-primary-500 text-primary-700'
                                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                  }`}
                                  title="Atender todas las mascotas"
                                >
                                  Todas
                                </button>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })()}
                    {companySettings?.posCustomFields?.showVehiclePlateField && (
                      <input
                        type="text"
                        value={customerData.vehiclePlate}
                        onChange={e => setCustomerData({ ...customerData, vehiclePlate: e.target.value.toUpperCase() })}
                        placeholder="Placa de Vehículo (opcional)"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}
                    {companySettings?.posCustomFields?.showVehicleModelField && (
                      <input
                        type="text"
                        value={customerData.vehicleModel}
                        onChange={e => setCustomerData({ ...customerData, vehicleModel: e.target.value })}
                        placeholder="Modelo de Vehículo (opcional)"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}
                    {companySettings?.posCustomFields?.showVehicleYearField && (
                      <input
                        type="text"
                        value={customerData.vehicleYear}
                        onChange={e => setCustomerData({ ...customerData, vehicleYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="Año de Vehículo (opcional)"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}

                    <input
                      type="text"
                      value={customerData.address}
                      onChange={e => setCustomerData({ ...customerData, address: e.target.value })}
                      placeholder="Dirección (opcional)"
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

            <CardContent className={`flex-1 flex flex-col p-3 pt-0 xl:p-6 xl:pt-0 overflow-hidden min-w-0 ${expandedCart ? 'lg:!pt-4' : ''}`}>
              {/* Cart Items */}
              <div ref={cartSectionRef} className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Carrito de Compras
                </label>
                {/* Total visible arriba del carrito — para que la cajera pueda
                    cantar el precio al cliente sin scrollear hasta abajo */}
                {cart.length > 0 && (
                  <span className="ml-auto mr-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 border border-primary-200 rounded-md">
                    <span className="text-[11px] font-medium text-primary-700">Total</span>
                    <span className="text-sm font-bold text-primary-700">{formatCurrency(amounts.total, currency)}</span>
                  </span>
                )}
                <div className="flex items-center gap-1">
                  {cart.length > 0 && !saleCompleted && (
                    <button
                      onClick={holdCurrentSale}
                      className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary-600 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-100"
                      title="Aparcar venta"
                    >
                      <Pause className="w-3 h-3" />
                      <span className="hidden sm:inline">Aparcar</span>
                    </button>
                  )}
                  {heldSales.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setShowHeldSales(!showHeldSales)}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary-600 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-100"
                        title="Ventas en espera"
                      >
                        <Play className="w-3 h-3" />
                        <span className="hidden sm:inline">En espera</span>
                        <span className="bg-primary-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                          {heldSales.length}
                        </span>
                      </button>
                      {showHeldSales && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowHeldSales(false)} />
                          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-64 py-1">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider px-3 py-1.5">Ventas en espera</p>
                            {heldSales.map(sale => (
                              <div key={sale.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 group">
                                <button
                                  onClick={() => restoreHeldSale(sale.id)}
                                  className="flex-1 text-left min-w-0"
                                >
                                  <p className="text-xs font-medium text-gray-700 truncate">{sale.label}</p>
                                  <p className="text-[10px] text-gray-400">{sale.itemCount} items · {formatCurrency(sale.total)}</p>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeHeldSale(sale.id) }}
                                  className="text-gray-300 hover:text-red-500 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Eliminar"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

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

              <div ref={cartScrollRef} className={`flex-1 space-y-3 overflow-y-auto custom-scrollbar mb-4 max-h-[300px] lg:max-h-[400px] ${saleCompleted ? 'opacity-60 pointer-events-none' : ''}`}>
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                    <ShoppingCart className="w-16 h-16 mb-3" />
                    <p className="text-base">No hay productos en el carrito</p>
                  </div>
                ) : (
                  (() => {
                    // Agrupar ítems con número de serie del mismo producto+lote en una sola fila.
                    // Ítems sin serie quedan como grupos de 1 miembro (render igual que siempre).
                    const groups = []
                    const seen = new Map()
                    cart.forEach((it, idx) => {
                      if (it.serialNumber) {
                        const gKey = `g|${it.id || it.productId}|${it.batchNumber || ''}`
                        const existing = seen.get(gKey)
                        if (existing) {
                          existing.members.push(it)
                          return
                        }
                        const g = { key: gKey, isSerial: true, members: [it] }
                        seen.set(gKey, g)
                        groups.push(g)
                      } else {
                        // Incluir el índice como desempate: varios ítems del mismo producto sin
                        // cartId único caían a `it.id` y producían keys DUPLICADAS, lo que en dev
                        // inundaba la consola con cientos de warnings por render (lentísimo).
                        const uniqueKey = it.cartId || `${it.id}|${idx}`
                        groups.push({ key: `s|${uniqueKey}`, isSerial: false, members: [it] })
                      }
                    })
                    return groups.map(group => {
                      const item = group.members[0]
                      const itemId = item.cartId || item.id
                      const dualUnit = (posMultiCurrencyOn && exchangeRate > 1) ? getItemDualPrice(item) : null
                      const isSerialGroup = group.isSerial && group.members.length > 1
                      const displayQty = isSerialGroup ? group.members.length : item.quantity
                      const displayDiscount = isSerialGroup
                        ? group.members.reduce((s, m) => s + (m.itemDiscount || 0), 0)
                        : (item.itemDiscount || 0)
                      // Bonificación: descuento iguala el valor total del ítem.
                      // En SUNAT se declara con afectación 15 (Catálogo 07), tributo 9996 (GRA),
                      // PriceTypeCode 02. El IGV referencial lo asume el emisor a nivel contable.
                      const lineTotalWithIGV = item.price * displayQty
                      const isBonifLine = displayDiscount > 0 &&
                        Math.abs(lineTotalWithIGV - displayDiscount) < 0.005
                      return (
                      <div key={group.key} className="p-2 bg-gray-50 rounded-lg min-w-0 hover:bg-gray-100 transition-colors">
                        {/* Fila 1: miniatura + nombre/sub-info + eliminar */}
                        <div className="flex items-start gap-2 min-w-0">
                          {/* Miniatura (sólo si el producto tiene imagen) */}
                          {item.imageUrl && (
                            <div className="w-10 h-10 flex-shrink-0 rounded bg-white overflow-hidden">
                              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          {/* Nombre + sub-info inline */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            {companySettings?.allowNameEdit ? (
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updateItemName(item.cartId || item.id, e.target.value)}
                                className="font-semibold text-sm text-gray-900 w-full bg-transparent border-b border-dashed border-gray-300 focus:border-primary-500 focus:outline-none py-0.5"
                              />
                            ) : (
                              <p className="font-semibold text-sm text-gray-900 line-clamp-1" title={item.name}>
                                {item.name}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] mt-0.5 min-w-0">
                              {isBonifLine && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full border border-purple-200 font-medium"
                                  title="Bonificación SUNAT (afectación 15, tributo 9996)"
                                >
                                  <Gift className="w-2.5 h-2.5" />
                                  Bonif.
                                </span>
                              )}
                              {item.isVariant && item.variantAttributes && (
                                <span className="text-gray-600 truncate">
                                  {Object.entries(item.variantAttributes).map(([, v]) => v).join(' / ')}
                                </span>
                              )}
                              {item.presentationName && (
                                <span className="text-green-600 font-medium truncate">
                                  {item.presentationName} (×{item.presentationFactor})
                                </span>
                              )}
                              {item.batchNumber && (
                                <span className="text-orange-600 truncate">
                                  Lote: {item.batchNumber}{item.batchExpiryDate && ` · ${formatBatchExpiry(item.batchExpiryDate)}`}
                                </span>
                              )}
                              {item.isNoLot && (
                                <span className="text-amber-600">Sin lote</span>
                              )}
                              {isSerialGroup ? (
                                <div className="flex flex-wrap gap-1 min-w-0">
                                  {group.members.map(m => (
                                    <span
                                      key={m.cartId || m.id}
                                      className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full border border-blue-200"
                                    >
                                      <span className="font-medium">{m.serialNumber}</span>
                                      <button
                                        type="button"
                                        onClick={() => removeFromCart(m.cartId || m.id)}
                                        className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                                        title="Quitar esta serie"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              ) : item.serialNumber && (
                                <span className="text-blue-600 truncate">S/N: {item.serialNumber}</span>
                              )}
                              {item.modifiers && item.modifiers.length > 0 && (
                                <span className="text-purple-600 truncate">
                                  {item.modifiers.flatMap(mod => mod.options.map(o => o.quantity > 1 ? `${o.quantity}x ${o.optionName}` : o.optionName)).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Eliminar (en fila 1 para que nombre tenga ancho completo) */}
                          <button
                            onClick={() => isSerialGroup ? removeSerialGroup(itemId) : removeFromCart(itemId)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1 transition-colors flex-shrink-0"
                            title={isSerialGroup ? 'Quitar todas las series' : 'Quitar'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Fila 2: cantidad (izq) + precio (der) */}
                        <div className="flex items-center justify-between gap-2 mt-2 min-w-0">
                          {/* Controles cantidad */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isSerialGroup ? (
                              <span className="text-sm font-semibold text-gray-700 px-1">
                                ×{displayQty}
                              </span>
                            ) : item.allowDecimalQuantity ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={amountModeItemId === itemId ? amountModeValue : item.quantity}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    if (amountModeItemId === itemId) {
                                      setAmountModeValue(val)
                                      const amount = parseFloat(val)
                                      const price = item.unitPrice || item.price
                                      if (!isNaN(amount) && amount > 0 && price > 0) {
                                        setQuantityDirectly(itemId, Math.round((amount / price) * 1000) / 1000)
                                      }
                                    } else {
                                      setQuantityDirectly(itemId, val)
                                    }
                                  }}
                                  onBlur={() => {
                                    if (amountModeItemId === itemId) {
                                      if (!amountModeValue || parseFloat(amountModeValue) <= 0) {
                                        setAmountModeItemId(null)
                                        setAmountModeValue('')
                                      }
                                    } else {
                                      handleQuantityBlur(itemId, item.quantity)
                                    }
                                  }}
                                  onFocus={(e) => e.target.select()}
                                  step={amountModeItemId === itemId ? '0.01' : '0.001'}
                                  min="0.001"
                                  className={`w-16 px-1.5 py-1 text-sm text-center font-semibold border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                    amountModeItemId === itemId ? 'border-primary-400 bg-primary-50' : 'border-gray-300'
                                  }`}
                                />
                                <div className="flex rounded border border-gray-300 overflow-hidden text-[10px]">
                                  <button
                                    onClick={() => { setAmountModeItemId(null); setAmountModeValue('') }}
                                    className={`px-1.5 py-1 font-medium transition-colors ${
                                      amountModeItemId !== itemId ? 'bg-primary-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                                  >
                                    {getUnitShortLabel(item.unit || 'KGM')}
                                  </button>
                                  <button
                                    onClick={() => {
                                      const price = item.unitPrice || item.price
                                      const qty = parseFloat(item.quantity)
                                      const amount = (!isNaN(qty) && qty > 0 && price > 0) ? Math.round(qty * price * 100) / 100 : ''
                                      setAmountModeItemId(itemId)
                                      setAmountModeValue(amount !== '' ? String(amount) : '')
                                    }}
                                    className={`px-1.5 py-1 font-medium transition-colors ${
                                      amountModeItemId === itemId ? 'bg-primary-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                                  >
                                    {currency === 'USD' ? '$' : 'S/'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => updateQuantity(itemId, -1)}
                                  disabled={Number(item.quantity) <= 1}
                                  title={Number(item.quantity) <= 1 ? 'Para quitar el producto usa el tacho rojo' : 'Disminuir'}
                                  className="w-7 h-7 rounded bg-gray-200 enabled:hover:bg-gray-300 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const raw = e.target.value
                                    // Permitir vaciar el campo para que en táctil se pueda
                                    // escribir una cantidad nueva sin tener que borrar el "1".
                                    if (raw === '') { setQuantityDirectly(itemId, ''); return }
                                    const val = parseInt(raw)
                                    if (!isNaN(val) && val >= 0) {
                                      setQuantityDirectly(itemId, val)
                                    }
                                  }}
                                  onBlur={() => handleQuantityBlur(itemId, item.quantity)}
                                  // Seleccionar todo al enfocar. El setTimeout hace que funcione
                                  // de forma confiable en pantallas táctiles (la selección inmediata
                                  // se pierde al levantar el dedo en varios navegadores móviles).
                                  onFocus={(e) => { const el = e.target; setTimeout(() => { try { el.select() } catch (err) { void err } }, 0) }}
                                  className="w-11 text-center font-bold text-sm border border-gray-300 rounded py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                                <button
                                  onClick={() => updateQuantity(itemId, 1)}
                                  className="w-7 h-7 rounded bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                          {/* Precio */}
                          {companySettings?.allowPriceEdit && editingPriceItemId === itemId ? (
                            <div className="flex flex-col gap-0.5 items-end flex-shrink-0">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={editingPrice}
                                  onChange={(e) => setEditingPrice(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditedPrice(itemId)
                                    else if (e.key === 'Escape') cancelEditingPrice()
                                  }}
                                  className="w-20 px-2 py-1 text-sm font-bold text-right border border-primary-500 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                  autoFocus
                                  step="0.01"
                                  min="0.01"
                                />
                                <button onClick={() => saveEditedPrice(itemId)} className="text-green-600 hover:text-green-800 p-1" title="Guardar">
                                  <Check className="w-4 h-4" />
                                </button>
                                <button onClick={cancelEditingPrice} className="text-gray-600 hover:text-gray-800 p-1" title="Cancelar">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              {!taxConfig?.igvExempt && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current = parseFloat(editingPrice) || 0
                                    const igvRate = taxConfig?.igvRate || 18
                                    if (editingPriceWithoutIgv) {
                                      setEditingPrice((current * (1 + igvRate / 100)).toFixed(2))
                                    } else {
                                      setEditingPrice((current / (1 + igvRate / 100)).toFixed(2))
                                    }
                                    setEditingPriceWithoutIgv(!editingPriceWithoutIgv)
                                  }}
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${editingPriceWithoutIgv ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                >
                                  {editingPriceWithoutIgv ? 'Sin IGV' : 'Con IGV'}
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {/* Desglose precio unitario x cantidad, A LA IZQUIERDA del total
                                  (misma línea, para corroborar el precio sin agrandar la fila) */}
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                {dualUnit
                                  ? `${formatUnitPrice(dualUnit.usd, 'USD')} · ${formatUnitPrice(dualUnit.pen, 'PEN')}`
                                  : formatUnitPrice(item.price, currency)} × {displayQty}
                              </span>
                              <div className="text-right min-w-[58px]">
                                {displayDiscount > 0 ? (
                                  <>
                                    <p className="text-[10px] text-gray-400 line-through leading-tight">
                                      {formatLineAmount(item.price * displayQty, currency)}
                                    </p>
                                    <p className="font-bold text-orange-600 text-sm leading-tight">
                                      {formatLineAmount((item.price * displayQty) - displayDiscount, currency)}
                                    </p>
                                  </>
                                ) : (
                                  <p className="font-bold text-gray-900 text-sm">
                                    {formatLineAmount(item.price * displayQty, currency)}
                                  </p>
                                )}
                              </div>
                              {companySettings?.allowPriceEdit && (
                                <button onClick={() => startEditingPrice(itemId, item.price)} className="text-primary-600 hover:text-primary-700 p-1" title="Editar precio">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Fila 3: nota + descuento por item */}
                        <div className="flex gap-1.5 mt-1.5 min-w-0">
                          <input
                            type="text"
                            placeholder="Nota..."
                            value={item.observations || ''}
                            onChange={(e) => updateItemObservations(itemId, e.target.value)}
                            className="flex-1 min-w-0 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          {!hideDiscountInPOS && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Tag className="w-3 h-3 text-orange-500 flex-shrink-0" />
                              <input
                                type="number"
                                placeholder="Dcto"
                                value={isSerialGroup ? (displayDiscount || '') : (item.itemDiscount || '')}
                                onChange={(e) => isSerialGroup ? updateGroupDiscount(itemId, e.target.value) : updateItemDiscount(itemId, e.target.value)}
                                min="0"
                                max={isSerialGroup ? (item.price * displayQty) : (item.price * item.quantity)}
                                step="0.01"
                                className="w-14 text-xs px-1.5 py-1 border border-orange-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      )
                    })
                  })()
                )}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(amounts.subtotal, currency)}</span>
                </div>

                {/* Descuento General */}
                {cart.length > 0 && !hideDiscountInPOS && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 xl:p-4 space-y-2 xl:space-y-3 overflow-hidden min-w-0">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 xl:w-5 xl:h-5 text-green-600 shrink-0" />
                      <p className="text-sm xl:text-base text-green-800 font-semibold">Descuento General</p>
                    </div>
                    <div className="flex items-center gap-1.5 xl:gap-3 min-w-0">
                      <div className="flex items-center gap-1 xl:gap-2 flex-1 min-w-0">
                        <span className="text-xs xl:text-sm text-green-700 font-medium shrink-0">{currency === 'USD' ? '$' : 'S/'}</span>
                        <input
                          type="number"
                          value={discountAmount}
                          onChange={(e) => handleDiscountAmountChange(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          max={amounts.subtotal}
                          step="0.01"
                          className="flex-1 min-w-0 px-2 xl:px-3 py-1.5 xl:py-2 text-sm xl:text-base border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          disabled={lastInvoiceData !== null}
                        />
                      </div>
                      <span className="text-xs xl:text-sm text-green-600 font-medium shrink-0">ó</span>
                      <div className="flex items-center gap-1 xl:gap-2 flex-1 min-w-0">
                        <input
                          type="number"
                          value={discountPercentage}
                          onChange={(e) => handleDiscountPercentageChange(e.target.value)}
                          placeholder="0"
                          min="0"
                          max="100"
                          step="0.01"
                          className="flex-1 min-w-0 px-2 xl:px-3 py-1.5 xl:py-2 text-sm xl:text-base border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          disabled={lastInvoiceData !== null}
                        />
                        <span className="text-xs xl:text-sm text-green-700 font-medium shrink-0">%</span>
                      </div>
                      {(discountAmount || discountPercentage) && (
                        <button
                          onClick={handleClearDiscount}
                          className="flex-shrink-0 p-1.5 xl:p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-lg transition-colors"
                          title="Limpiar descuento"
                          disabled={lastInvoiceData !== null}
                        >
                          <Trash2 className="w-4 h-4 xl:w-5 xl:h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Observaciones Generales */}
                {cart.length > 0 && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowNotesSection(!showNotesSection)}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                      disabled={lastInvoiceData !== null}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <span className="text-base font-medium text-gray-700">
                          Observaciones {generalNotes && <span className="text-blue-600">(1)</span>}
                        </span>
                      </div>
                      {showNotesSection ? (
                        <ChevronUp className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      )}
                    </button>
                    {showNotesSection && (
                      <div className="p-4 bg-white">
                        <textarea
                          value={generalNotes}
                          onChange={(e) => setGeneralNotes(e.target.value)}
                          placeholder="Ej: Garantía 6 meses, entrega programada, instrucciones especiales..."
                          rows={3}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          disabled={lastInvoiceData !== null}
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          Estas observaciones aparecerán en el comprobante impreso y PDF.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Resumen de Descuentos */}
                {(amounts.itemDiscounts > 0 || amounts.globalDiscount > 0) && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    {amounts.itemDiscounts > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-orange-600">Dcto. por ítems:</span>
                        <span className="font-semibold text-orange-600">-{formatCurrency(amounts.itemDiscounts, currency)}</span>
                      </div>
                    )}
                    {amounts.globalDiscount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600">Dcto. general:</span>
                        <span className="font-semibold text-green-600">-{formatCurrency(amounts.globalDiscount, currency)}</span>
                      </div>
                    )}
                    {amounts.itemDiscounts > 0 && amounts.globalDiscount > 0 && (
                      <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
                        <span className="text-gray-700">Total Descuentos:</span>
                        <span className="text-red-600">-{formatCurrency(amounts.discount, currency)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Mostrar IGV desglosado por tasa */}
                {amounts.igv > 0 && (
                  Object.keys(amounts.igvByRate).length > 1 ? (
                    // Tasas mixtas: mostrar cada tasa por separado
                    Object.entries(amounts.igvByRate)
                      .sort(([a], [b]) => Number(b) - Number(a))
                      .map(([rate, data]) => (
                        <div key={rate} className="flex justify-between text-sm">
                          <span className="text-gray-600">IGV ({rate}%):</span>
                          <span className="font-medium">{formatCurrency(data.igv, currency)}</span>
                        </div>
                      ))
                  ) : (
                    // Tasa única: mostrar una sola línea
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">IGV ({Object.keys(amounts.igvByRate)[0] || taxConfig.igvRate}%):</span>
                      <span className="font-medium">{formatCurrency(amounts.igv, currency)}</span>
                    </div>
                  )
                )}
                {/* Mostrar Recargo al Consumo si está habilitado */}
                {amounts.recargoConsumo > 0 && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span>Recargo Consumo ({amounts.recargoConsumoRate}%):</span>
                    <span className="font-medium">{formatCurrency(amounts.recargoConsumo, currency)}</span>
                  </div>
                )}
                {/* Mostrar montos exonerados si hay productos exonerados */}
                {amounts.exonerado?.total > 0 && (
                  <div className="flex justify-between text-sm text-amber-700">
                    <span>Op. Exoneradas:</span>
                    <span className="font-medium">{formatCurrency(amounts.exonerado.total, currency)}</span>
                  </div>
                )}
                {/* Mostrar montos inafectos si hay productos inafectos */}
                {amounts.inafecto?.total > 0 && (
                  <div className="flex justify-between text-sm text-blue-700">
                    <span>Op. Inafectas:</span>
                    <span className="font-medium">{formatCurrency(amounts.inafecto.total, currency)}</span>
                  </div>
                )}
                {/* Mostrar badge si está exonerado de IGV (empresa) */}
                {taxConfig.igvExempt && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md">
                    <span className="font-medium">⚠️ Empresa exonerada de IGV</span>
                  </div>
                )}
                <div className="flex justify-between text-xl sm:text-2xl font-bold border-t pt-2">
                  <span className="flex items-center gap-2">
                    Total:
                    {posMultiCurrencyOn && exchangeRate > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">TC {exchangeRate}</span>
                    )}
                  </span>
                  <span className="text-primary-600">{formatCurrency(amounts.total, currency)}</span>
                </div>
                {posMultiCurrencyOn && exchangeRate > 1 && (
                  <div className="text-right text-xs text-gray-500 -mt-1">
                    ≈ {currency === 'USD'
                        ? formatCurrency(amounts.totalInBase, 'PEN')
                        : formatCurrency(convertFromBase(amounts.total, 'USD', exchangeRate), 'USD')}
                  </div>
                )}

                {/* Advertencia SUNAT para boletas mayores a 700 soles.
                    SUNAT acepta cualquier doc de identidad válido (DNI, CE, RUC,
                    Pasaporte). La validación al procesar la venta es genérica
                    (líneas 4460+); este aviso lo refleja para no confundir al
                    cajero (caso real reportado: cliente con RUC en boleta). */}
                {documentType === 'boleta' && amounts.total > 700 && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-600 text-lg">⚠️</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-800">
                          Normativa SUNAT
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Las boletas mayores a S/ 700.00 requieren obligatoriamente un <strong>documento de identidad</strong> (DNI, RUC, CE o Pasaporte) y el <strong>nombre completo</strong> del cliente
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Opción de Pago Parcial / Venta al Crédito - Disponible para TODAS las
                  notas de venta (antes estaba detrás del flag businessSettings.allowPartialPayments,
                  que se eliminó: ahora es universal). */}
              {cart.length > 0 && documentType === 'nota_venta' && (
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
                              <span className="font-semibold">{formatCurrency(parseFloat(partialPaymentAmount), currency)}</span>
                            </div>
                            <div className="flex justify-between text-orange-600">
                              <span>Saldo pendiente:</span>
                              <span className="font-semibold">{formatCurrency(amounts.total - parseFloat(partialPaymentAmount), currency)}</span>
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
                            <strong>Monto pendiente:</strong> {formatCurrency(amounts.total, currency)}
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
                            <strong>Saldo pendiente:</strong> {formatCurrency(amounts.total, currency)}
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
                      {customerStoreCredit.total > 0 && (
                        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
                          <Wallet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span className="text-emerald-800">
                            Este cliente tiene <span className="font-bold">{formatCurrency(customerStoreCredit.total, currency)}</span> de saldo a favor.
                          </span>
                        </div>
                      )}
                  {payments.map((payment, index) => {
                    // Métodos ya seleccionados en otras filas (no la actual)
                    const usedMethods = payments
                      .filter((_, i) => i !== index)
                      .map(p => p.method)
                      .filter(Boolean)
                    const isAvailable = (val) => !usedMethods.includes(val)

                    // Métodos filtrados por permisos y modo de negocio
                    const methodDefs = [
                      ['CASH', 'Efectivo', 'cash'],
                      ['CARD', 'Tarjeta', 'card'],
                      ['TRANSFER', 'Transferencia', 'transfer'],
                      ['YAPE', 'Yape', 'yape'],
                      ['PLIN', 'Plin', 'plin'],
                      ...(businessMode === 'restaurant' ? [
                        ['RAPPI', 'Rappi', 'rappiPay'],
                        ['PEDIDOSYA', 'PedidosYa', 'pedidosYa'],
                        ['DIDIFOOD', 'DiDiFood', 'didifood'],
                      ] : []),
                      ...(businessMode === 'hotel' ? [
                        ['ROOM', 'Habitación', 'chargeToRoom'],
                      ] : [])
                    ].filter(([, , permKey]) =>
                      !allowedPaymentMethods || allowedPaymentMethods.length === 0 || allowedPaymentMethods.includes(permKey)
                    )

                    // Saldo a favor: se ofrece como método solo si el cliente tiene
                    // saldo disponible (notas de crédito sin redimir). No pasa por el
                    // filtro de permisos (no es un medio de pago configurable).
                    if (customerStoreCredit.total > 0) {
                      methodDefs.push(['CREDIT_NOTE', 'Saldo a favor'])
                    }

                    return (
                    <div key={index} className="flex flex-col gap-2">
                      {/* Botones de método de pago */}
                      <div className="grid grid-cols-3 gap-1 xl:gap-1.5">
                        {methodDefs.map(([key, label]) => {
                          const selected = payment.method === key
                          const unavailable = !isAvailable(key) && !selected
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handlePaymentMethodChange(index, key)}
                              disabled={unavailable || lastInvoiceData !== null}
                              className={`py-1.5 xl:py-2 px-1 xl:px-3 text-xs xl:text-sm rounded-lg border-2 transition-colors truncate
                                ${selected
                                  ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}
                                ${unavailable ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>

                      {/* Selector de habitación (solo modo hotel + método ROOM) */}
                      {payment.method === 'ROOM' && businessMode === 'hotel' && (
                        <div className="mb-1">
                          {occupiedRooms.length === 0 ? (
                            <p className="text-xs text-red-500 py-1">No hay habitaciones ocupadas</p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {occupiedRooms.map(room => (
                                <button
                                  key={room.id}
                                  type="button"
                                  onClick={() => setSelectedRoom(room)}
                                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border-2 transition-colors ${
                                    selectedRoom?.id === room.id
                                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700 font-semibold'
                                      : 'border-gray-200 bg-white text-gray-700 hover:border-cyan-300'
                                  }`}
                                >
                                  <BedDouble className="w-3 h-3" />
                                  {room.number}
                                  {room.reservation && (
                                    <span className="text-[10px] text-gray-500">({room.reservation.guestName?.split(' ')[0]})</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        {/* Monto */}
                        <input
                          ref={index === 0 ? cashAmountInputRef : null}
                          type="number"
                          step="0.01"
                          min="0"
                          value={payment.amount}
                          onChange={(e) => handlePaymentAmountChange(index, e.target.value)}
                          onKeyDown={(e) => {
                            // Enter en el monto = procesar la venta (haya o no
                            // modificado el número). Respeta el estado del botón.
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (cart.length > 0 && !isProcessing && !saleCompleted && !isLoading && lastInvoiceData === null) {
                                handleCheckout()
                              }
                            }
                          }}
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
                    </div>
                    )
                  })}

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
                        <span className="font-semibold text-gray-900">{formatCurrency(totalPaid, currency)}</span>
                      </div>
                      {Math.abs(remaining) >= 0.005 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{remaining > 0 ? 'Falta:' : 'Cambio:'}</span>
                          <span className={`font-semibold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(Math.abs(remaining), currency)}
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
              <button
                ref={checkoutButtonRef}
                onClick={handleCheckout}
                disabled={cart.length === 0 || isProcessing || saleCompleted || isLoading}
                className="w-full mt-4 h-12 sm:h-14 text-base sm:text-lg flex items-center justify-center gap-2 bg-primary-600 border border-primary-700 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Procesando...
                  </>
                ) : isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cargando...
                  </>
                ) : saleCompleted ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Venta Completada
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Procesar Venta
                  </>
                )}
              </button>

              {/* Mini-aviso de venta completada. Las opciones (Ticket/Preview/PDF/WhatsApp/
                  Nueva venta) viven en el modal PostSaleModal; este aviso aparece cuando el
                  modal está cerrado, para reabrir opciones o iniciar una nueva venta. */}
              {lastInvoiceData && !postSaleModalOpen && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <p className="text-sm font-medium text-green-900 flex-1 min-w-0 truncate">
                    Venta completada · {lastInvoiceData.number}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setPostSaleModalOpen(true)}>
                    Opciones
                  </Button>
                  <Button size="sm" className="bg-primary-600 hover:bg-primary-700 text-white" onClick={clearCart}>
                    <Plus className="w-4 h-4 mr-1" />Nueva
                  </Button>
                </div>
              )}

              {/* Las opciones post-venta (Ticket / Preview / PDF / WhatsApp / Nueva venta)
                  están en el modal PostSaleModal (renderizado más abajo). */}
            </CardContent>
            </div>{/* fin grid 2-cols expandido */}
          </Card>
        </div>
      </div>

      {/* Custom Product Modal */}
      <Modal
        isOpen={showCustomProductModal}
        onClose={() => {
          setShowCustomProductModal(false)
          // Mantener afectación y addIgv elegidas (ver comentario en handleAddCustomProduct)
          setCustomProduct(prev => ({
            ...prev,
            name: '',
            price: '',
            quantity: 1,
            unit: 'NIU',
            isBonificacion: false,
            ...(prev.isBonificacion ? { taxAffectation: businessSettings?.defaultTaxAffectation || '10' } : {}),
          }))
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
              <span className="text-xs font-normal text-gray-500 ml-1">(ENTER para saltar de línea)</span>
            </label>
            <textarea
              value={customProduct.name}
              onChange={(e) => setCustomProduct({ ...customProduct, name: e.target.value })}
              placeholder="Ej: Servicio de instalación, Reparación, etc."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
              autoFocus
            />
          </div>

          {/* Bonificación - solo para notas de venta */}
          {documentType === 'nota_venta' && (
            <label className="flex items-center gap-3 p-3 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors">
              <input
                type="checkbox"
                checked={customProduct.isBonificacion || false}
                onChange={e => setCustomProduct({ ...customProduct, isBonificacion: e.target.checked, ...(e.target.checked ? { price: '0', taxAffectation: '30' } : {}) })}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Bonificación (gratis)</span>
                <p className="text-xs text-gray-500 mt-0.5">Producto sin costo para el cliente</p>
              </div>
            </label>
          )}

          {/* Price and Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio Unitario {!customProduct.isBonificacion && <span className="text-red-500">*</span>}
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

          {/* Checkbox para indicar si el precio incluye IGV */}
          {!taxConfig.igvExempt && customProduct.taxAffectation === '10' && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <input
                type="checkbox"
                id="addIgvCheckbox"
                checked={!customProduct.addIgv}
                onChange={(e) => setCustomProduct({ ...customProduct, addIgv: !e.target.checked })}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="addIgvCheckbox" className="text-sm text-gray-700 cursor-pointer">
                <span className="font-medium">El precio incluye IGV</span>
              </label>
            </div>
          )}

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
              ) : taxConfig.taxType === 'standard' ? (
                <select
                  value={customProduct.taxAffectation === '10' ? `10-${customProduct.igvRate}` : customProduct.taxAffectation}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '10-18') {
                      setCustomProduct({ ...customProduct, taxAffectation: '10', igvRate: 18 })
                    } else if (val === '10-10.5') {
                      setCustomProduct({ ...customProduct, taxAffectation: '10', igvRate: 10.5 })
                    } else if (val === '20') {
                      setCustomProduct({ ...customProduct, taxAffectation: val, igvRate: 0 })
                    } else if (val === '30') {
                      setCustomProduct({ ...customProduct, taxAffectation: val, igvRate: 0 })
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="10-18">Gravado (18%)</option>
                  <option value="10-10.5">Gravado (10.5% - Ley Restaurantes)</option>
                  <option value="20">Exonerado</option>
                  <option value="30">Inafecto</option>
                </select>
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
          {customProduct.name && customProduct.price > 0 && (() => {
            const basePrice = parseFloat(customProduct.price)
            const quantity = parseFloat(customProduct.quantity) || 1
            const igvRate = taxConfig.taxType === 'standard' ? (customProduct.igvRate || 18) : (taxConfig.igvRate || 18)
            const isGravado = customProduct.taxAffectation === '10' && !taxConfig.igvExempt
            const shouldAddIgv = customProduct.addIgv && isGravado

            // Calcular precio final unitario (con IGV si aplica)
            const finalPrice = shouldAddIgv ? basePrice * (1 + igvRate / 100) : basePrice

            // Calcular desglose por unidad
            let subtotalUnit, igvUnit, totalUnit
            if (isGravado) {
              if (shouldAddIgv) {
                // Precio ingresado es sin IGV
                subtotalUnit = basePrice
                totalUnit = finalPrice
                igvUnit = totalUnit - subtotalUnit
              } else {
                // Precio ingresado ya incluye IGV
                totalUnit = basePrice
                subtotalUnit = totalUnit / (1 + igvRate / 100)
                igvUnit = totalUnit - subtotalUnit
              }
            } else {
              // Exonerado o Inafecto: no tiene IGV
              subtotalUnit = basePrice
              igvUnit = 0
              totalUnit = basePrice
            }

            // Calcular totales
            const subtotalTotal = subtotalUnit * quantity
            const igvTotal = igvUnit * quantity
            const totalFinal = totalUnit * quantity

            return (
              <div className="mt-4 p-4 bg-primary-50 border border-primary-200 rounded-lg">
                <p className="text-xs font-medium text-primary-900 mb-2">Vista Previa:</p>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{customProduct.name}</p>
                    <p className="text-sm text-gray-600">
                      Cantidad: {quantity} × {formatCurrency(totalUnit)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {customProduct.taxAffectation === '10' ? `Gravado (${igvRate}%)` : customProduct.taxAffectation === '20' ? 'Exonerado' : 'Inafecto'}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">{formatCurrency(subtotalTotal)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-gray-600">IGV ({isGravado ? igvRate : 0}%):</span>
                      <span className="font-medium">{formatCurrency(igvTotal)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-base border-t border-primary-200 pt-1 mt-1">
                      <span className="font-semibold text-gray-700">Total:</span>
                      <span className="font-bold text-primary-600">{formatCurrency(totalFinal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowCustomProductModal(false)
                setCustomProduct({ name: '', price: '', quantity: 1, unit: 'NIU', taxAffectation: '10', addIgv: false, isBonificacion: false })
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={addCustomProductToCart}
              className="flex-1"
              disabled={!customProduct.name || (!customProduct.isBonificacion && (!customProduct.price || parseFloat(customProduct.price) <= 0))}
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
              {selectedProductForVariant.variants?.map((variant, index) => {
                // Calcular stock según almacén seleccionado
                const variantStock = selectedWarehouse
                  ? ((variant.warehouseStocks || []).find(ws => ws.warehouseId === selectedWarehouse.id)?.stock || 0)
                  : (variant.stock || 0)
                const noStock = variantStock <= 0 && !companySettings?.allowNegativeStock

                return (
                  <button
                    key={index}
                    onClick={() => addVariantToCart(selectedProductForVariant, variant)}
                    disabled={noStock}
                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                      noStock
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
                          <span
                            className={`text-xs font-semibold ${
                              variantStock >= 4
                                ? 'text-green-600'
                                : variantStock > 0
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}
                          >
                            {variantStock > 0 ? `Stock: ${Number.isInteger(variantStock) ? variantStock : parseFloat(variantStock.toFixed(2))}` : 'Sin stock'}
                          </span>
                        </div>
                      </div>
                      {!noStock && (
                        <Plus className="w-5 h-5 text-primary-600 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {selectedProductForVariant.variants?.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">No hay variantes disponibles para este producto.</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de opciones post-venta (Ticket/Preview/PDF/WhatsApp/Nueva venta) */}
      <PostSaleModal
        isOpen={postSaleModalOpen && !!lastInvoiceData}
        onClose={() => setPostSaleModalOpen(false)}
        invoice={lastInvoiceData}
        formatCurrency={formatCurrency}
        isPrintingTicket={isPrintingTicket}
        isLoadingPreview={isLoadingPreview}
        sendingWhatsApp={sendingWhatsApp}
        defaultPhone={lastInvoiceData?.customer?.phone || customerData?.phone || ''}
        onPrintTicket={() => handlePrintTicket()}
        onPreview={async () => {
          setIsLoadingPreview(true)
          try {
            await previewInvoicePDF(lastInvoiceData, companySettings, branding, branches)
            if (companySettings?.autoResetPOS) setTimeout(() => clearCart(), 1000)
          } catch (error) {
            console.error('Error al generar vista previa:', error)
            toast.error('Error al generar la vista previa')
          } finally {
            setIsLoadingPreview(false)
          }
        }}
        onPdf={() => {
          try {
            generateInvoicePDF(lastInvoiceData, companySettings, true, branding, branches)
            if (companySettings?.autoResetPOS) setTimeout(() => clearCart(), 1000)
          } catch (error) {
            console.error('Error al generar PDF:', error)
            toast.error('Error al generar el PDF')
          }
        }}
        onSendWhatsApp={(phone) => handleSendWhatsApp(phone)}
        onNewSale={clearCart}
      />

      {/* Modal de Selección de Precio */}
      <Modal
        isOpen={showPriceModal}
        onClose={() => {
          setShowPriceModal(false)
          setProductForPriceSelection(null)
          setVariantForPriceSelection(null)
        }}
        title={`Seleccionar precio - ${variantForPriceSelection ? variantForPriceSelection.product.name : productForPriceSelection?.name || ''}`}
        size="sm"
      >
        {(productForPriceSelection || variantForPriceSelection) && (() => {
          // Determinar si estamos mostrando precios de variante o producto
          const priceSource = variantForPriceSelection ? variantForPriceSelection.variant : productForPriceSelection
          const parentProduct = variantForPriceSelection ? variantForPriceSelection.product : null
          const variantInfo = variantForPriceSelection?.variant

          return (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {variantInfo && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Variante: <span className="font-mono">{variantInfo.sku}</span></p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(variantInfo.attributes || {}).map(([key, value]) => (
                      <Badge key={key} variant="secondary" className="text-xs">
                        {key}: {value}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-sm text-gray-600">
                {variantForPriceSelection ? 'Esta variante' : 'Este producto'} tiene múltiples precios. Selecciona el precio a aplicar:
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
                      {formatUnitPrice(priceSource.price)}
                    </p>
                  </div>
                </button>

                {/* Precios 2, 3, 4 */}
                {[
                  { key: 'price2', color: 'green', label: businessSettings?.priceLabels?.price2 || 'Precio 2' },
                  { key: 'price3', color: 'amber', label: businessSettings?.priceLabels?.price3 || 'Precio 3' },
                  { key: 'price4', color: 'purple', label: businessSettings?.priceLabels?.price4 || 'Precio 4' }
                ].map(({ key, color, label }) => {
                  const resolved = resolvePrice(priceSource, key, parentProduct)
                  if (!resolved) return null
                  const isAutomatic = !priceSource[key]
                  const pctDiscount = businessSettings?.pricePercentages?.[key]?.discount
                  const calcBase = businessSettings?.priceCalculationBase || 'public'
                  const automaticLabel = calcBase === 'cost'
                    ? `+${pctDiscount}% sobre el costo`
                    : `-${pctDiscount}% del precio base`
                  return (
                    <button
                      key={key}
                      onClick={() => handlePriceSelection(key)}
                      className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{label}</p>
                          <p className="text-xs text-gray-500">
                            {isAutomatic ? automaticLabel : 'Precio manual'}
                          </p>
                        </div>
                        <p className={`text-xl font-bold text-${color}-600`}>
                          {formatUnitPrice(resolved)}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal de Selección de Lote (Modo Farmacia) */}
      <Modal
        isOpen={showBatchModal}
        onClose={() => {
          setShowBatchModal(false)
          setProductForBatchSelection(null)
          setPendingPriceForBatch(null)
        }}
        title={`Seleccionar lote - ${productForBatchSelection?.name || ''}`}
        size="sm"
      >
        {productForBatchSelection && (() => {
          const availableBatches = getAvailableBatches(productForBatchSelection)
          const stockWithoutLot = getStockWithoutLot(productForBatchSelection)
          return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Selecciona el lote a vender (FEFO - primero el que vence antes):
            </p>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {availableBatches.map((batch, idx) => (
                <button
                  key={batch.lotNumber + idx}
                  onClick={() => handleBatchSelection(batch)}
                  className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                    idx === 0
                      ? 'border-green-500 bg-green-50 hover:bg-green-100'
                      : 'border-gray-200 hover:border-primary-500 hover:bg-primary-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{batch.lotNumber}</p>
                        {idx === 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                            FEFO
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Vence: {formatBatchExpiry(batch.expiryDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary-600">{batch.quantity}</p>
                      <p className="text-xs text-gray-400">disponibles</p>
                    </div>
                  </div>
                </button>
              ))}
              {/* Opción para vender stock sin lote asignado - solo si el producto usa lotes */}
              {stockWithoutLot > 0 && productForBatchSelection?.batches?.length > 0 && (
                <button
                  onClick={() => handleBatchSelection({ isNoLot: true, quantity: stockWithoutLot, lotNumber: null })}
                  className="w-full p-4 border-2 border-dashed border-amber-400 rounded-lg text-left transition-all hover:bg-amber-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">Sin lote</p>
                        <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                          Stock inicial
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Unidades sin lote asignado
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-amber-600">{stockWithoutLot}</p>
                      <p className="text-xs text-gray-400">disponibles</p>
                    </div>
                  </div>
                </button>
              )}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>FEFO:</strong> First Expire, First Out - Se recomienda vender primero el lote que vence más pronto.
              </p>
            </div>
          </div>
          )
        })()}
      </Modal>

      {/* Modal de Selección de Número de Serie (multi-select) */}
      <Modal
        isOpen={showSerialModal}
        onClose={closeSerialModal}
        title={`Seleccionar N° de Serie - ${productForSerialSelection?.name || ''}`}
        size="sm"
      >
        {productForSerialSelection && (() => {
          const availableSerials = (productForSerialSelection.serials || []).filter(s =>
            s.status === 'available' && (!s.warehouseId || s.warehouseId === selectedWarehouse?.id)
          )
          const serialsInCart = cart.filter(item => (item.id === productForSerialSelection.id || item.productId === productForSerialSelection.id) && item.serialNumber).map(item => item.serialNumber)
          const filteredSerials = availableSerials.filter(s => !serialsInCart.includes(s.serialNumber))

          const selectedCount = filteredSerials.filter(s => selectedSerialIds.has(s.id)).length
          const allSelected = selectedCount === filteredSerials.length && filteredSerials.length > 0

          return (
            <div className="space-y-4">
              {/* Header: contador + acción "seleccionar/limpiar todas" */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-600">
                  {filteredSerials.length} disponible{filteredSerials.length !== 1 ? 's' : ''}
                  {selectedCount > 0 && (
                    <span className="text-primary-600 font-medium"> · {selectedCount} seleccionada{selectedCount !== 1 ? 's' : ''}</span>
                  )}
                </p>
                {filteredSerials.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      allSelected
                        ? setSelectedSerialIds(new Set())
                        : setSelectedSerialIds(new Set(filteredSerials.map(s => s.id)))
                    }
                    className="text-xs font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap"
                  >
                    {allSelected ? 'Limpiar' : 'Seleccionar todas'}
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filteredSerials.map((serial) => {
                  const isSelected = selectedSerialIds.has(serial.id)
                  return (
                    <button
                      key={serial.id}
                      type="button"
                      onClick={() => toggleSerialSelection(serial.id)}
                      className={`w-full p-3 border-2 rounded-lg text-left transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50/30'
                      }`}
                    >
                      {/* Checkbox visual */}
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="flex-1 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{serial.serialNumber}</p>
                          {serial.variantSku && (
                            <p className="text-xs text-gray-500">Variante: {serial.variantSku}</p>
                          )}
                        </div>
                        <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full whitespace-nowrap">
                          Disponible
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {filteredSerials.length === 0 && (
                <div className="p-3 bg-amber-50 rounded-lg">
                  <p className="text-sm text-amber-700">No hay series disponibles en este almacén.</p>
                </div>
              )}

              {/* Botón de confirmación (sticky al fondo) */}
              {filteredSerials.length > 0 && (
                <div className="pt-3 border-t border-gray-200 flex gap-2">
                  <button
                    type="button"
                    onClick={closeSerialModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmMultipleSerials(filteredSerials)}
                    disabled={selectedCount === 0}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {selectedCount === 0
                      ? 'Selecciona al menos una serie'
                      : `Agregar ${selectedCount} al carrito`}
                  </button>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Modal de Selección de Presentación */}
      <Modal
        isOpen={showPresentationModal}
        onClose={() => {
          setShowPresentationModal(false)
          setProductForPresentationSelection(null)
          setPendingBatchForPresentation(null)
        }}
        title={`Seleccionar presentación - ${productForPresentationSelection?.name || ''}${pendingBatchForPresentation ? (pendingBatchForPresentation.isNoLot ? ' (Sin lote)' : ` (Lote: ${pendingBatchForPresentation.lotNumber})`) : ''}`}
        size="sm"
      >
        {productForPresentationSelection && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Este producto tiene múltiples presentaciones. Selecciona cómo deseas venderlo:
            </p>
            <div className="space-y-2">
              {/* Opción: Unidad base */}
              <button
                onClick={handleSellAsBaseUnit}
                className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Unidad</p>
                    <p className="text-xs text-gray-500">Precio base por unidad</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary-600">
                      {formatCurrency(productForPresentationSelection.price)}
                    </p>
                    <p className="text-xs text-gray-400">×1</p>
                  </div>
                </div>
              </button>

              {/* Presentaciones definidas */}
              {productForPresentationSelection.presentations?.map((pres, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePresentationSelection(pres)}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-green-500 hover:bg-green-50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{pres.name}</p>
                      <p className="text-xs text-gray-500">Contiene {pres.factor} unidades</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-green-600">
                        {formatCurrency(pres.price)}
                      </p>
                      <p className="text-xs text-gray-400">×{pres.factor}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Info de stock por presentación */}
            {productForPresentationSelection.stock !== null && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-1">
                <p className="text-xs font-medium text-gray-700">
                  Stock disponible{pendingBatchForPresentation ? (pendingBatchForPresentation.isNoLot ? ' (Sin lote)' : ` (Lote ${pendingBatchForPresentation.lotNumber})`) : ''}:
                </p>
                {(() => {
                  const stockDisponible = pendingBatchForPresentation
                    ? pendingBatchForPresentation.quantity
                    : getCurrentWarehouseStock(productForPresentationSelection)
                  return (
                    <>
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">{stockDisponible}</span> unidades
                      </p>
                      {productForPresentationSelection.presentations?.map((pres, idx) => {
                        const equivalentQty = Math.floor(stockDisponible / pres.factor)
                        return (
                          <p key={idx} className="text-sm text-gray-600">
                            <span className="font-semibold">{equivalentQty}</span> {pres.name} <span className="text-gray-400">(x{pres.factor} unid.)</span>
                          </p>
                        )
                      })}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de Selección de Modificadores */}
      <ModifierSelectorModal
        isOpen={showModifierModal}
        onClose={() => {
          setShowModifierModal(false)
          setProductForModifiers(null)
        }}
        product={productForModifiers}
        onConfirm={addToCartWithModifiers}
      />

      {/* Aviso: faltan insumos (ingredientes de receta) para procesar la venta */}
      <Modal
        isOpen={!!missingIngredientsAlert}
        onClose={() => setMissingIngredientsAlert(null)}
        title="Faltan insumos para la venta"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              No se puede procesar la venta porque no hay suficiente stock de algunos
              insumos de la receta. Registra una compra o ajusta el stock de estos
              insumos e inténtalo de nuevo:
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            {(missingIngredientsAlert?.items || []).map((ing, idx) => {
              const faltan = Math.max(0, Number(ing.needed || 0) - Number(ing.available || 0))
              return (
                <div key={idx} className="flex items-center justify-between gap-3 p-3">
                  <span className="text-sm font-medium text-gray-900">{ing.name}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">
                      Faltan {faltan.toFixed(2)} {ing.unit}
                    </p>
                    <p className="text-xs text-gray-500">
                      Necesitas {Number(ing.needed || 0).toFixed(2)} · Tienes {Number(ing.available || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setMissingIngredientsAlert(null)}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>

      {/* Aviso: código escaneado/pegado que no está registrado en el sistema */}
      <Modal
        isOpen={!!unknownScanCode}
        onClose={() => setUnknownScanCode(null)}
        title="Código no registrado"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm text-gray-700">
                Este código no está registrado en el sistema:
              </p>
              <p className="mt-1 font-mono text-base font-semibold text-gray-900 break-all">
                {unknownScanCode}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                No se agregó ningún producto. Verifícalo antes de seguir escaneando.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { setUnknownScanCode(null); searchInputRef.current?.focus() }}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: elegir establecimiento (anexo) cuando el RUC tiene varios locales */}
      <Modal
        isOpen={showEstablishmentsModal}
        onClose={() => setShowEstablishmentsModal(false)}
        title="Elegir establecimiento"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Este RUC tiene varios establecimientos en SUNAT. Elige la dirección que corresponde:
          </p>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {establishments.map((est, idx) => (
              <button
                key={`${est.codigo}-${idx}`}
                type="button"
                onClick={() => handleSelectEstablishment(est)}
                className="w-full text-left p-3 hover:bg-primary-50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-200 rounded px-1.5 py-0.5">
                    {est.codigo || '—'}
                  </span>
                  {est.tipo && <span className="text-xs text-gray-500">{est.tipo}</span>}
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {est.direccionCompleta || est.direccion || 'Sin dirección'}
                </p>
                {(est.distrito || est.provincia || est.departamento) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[est.distrito, est.provincia, est.departamento].filter(Boolean).join(' · ')}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Recordatorio de vuelto en efectivo (opcional, configurable en Ajustes) */}
      <Modal
        isOpen={!!changeReminder}
        onClose={dismissChangeReminder}
        title="Recordatorio de vuelto"
        size="sm"
      >
        {changeReminder && (
          <div className="space-y-5 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Wallet className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Dar vuelto de</p>
              <p className="text-4xl font-bold text-green-600 mt-1">
                {formatCurrency(changeReminder.change, changeReminder.currency)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-sm">
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-600">Pagó con</span>
                <span className="font-semibold text-gray-900">{formatCurrency(changeReminder.received, changeReminder.currency)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-600">Total de la venta</span>
                <span className="font-semibold text-gray-900">- {formatCurrency(changeReminder.total, changeReminder.currency)}</span>
              </div>
              <div className="border-t border-gray-200 my-1"></div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-700 font-medium">Vuelto</span>
                <span className="font-bold text-green-600">{formatCurrency(changeReminder.change, changeReminder.currency)}</span>
              </div>
            </div>
            <Button onClick={dismissChangeReminder} className="w-full">
              Entendido y continuar
            </Button>
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
              items: (lastInvoiceData.items || []).map(item => ({
                code: item.code,
                name: item.name,
                description: item.name,
                quantity: item.quantity,
                price: item.unitPrice,
                unit: item.unit, // unidad de medida (para que el ticket no caiga a "UNIDAD" genérico)
                observations: item.observations,
                // Presentación elegida (CAJA, PACK, ...): el ticket la antepone con showItemUnit
                ...(item.presentationName && { presentationName: item.presentationName, presentationFactor: item.presentationFactor }),
                ...(item.serialNumber && { serialNumber: item.serialNumber }),
              })),
              series: lastInvoiceData.series,
              number: lastInvoiceData.number,
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
            paperWidth={ticketPaperWidth}
            webPrintLegible={webPrintLegible}
            ticketFontSize={ticketFontSize}
            compactPrint={compactPrint}
            printMargins={printMargins}
            simplePrint={simplePrint}
            a4SheetPrint={a4SheetPrint}
            showItemUnit={showItemUnit}
          />
        </div>
      )}
    </div>
  )
}
