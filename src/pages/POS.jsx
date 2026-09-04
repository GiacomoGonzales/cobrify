import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react'
import { isPharmaLikeMode } from '@/utils/businessModes'
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
  Percent,
  Fuel,
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
import DespachoCombustibleModal from '@/components/pos/DespachoCombustibleModal'
import { estacionActiva, combustiblesDe, factorDeAjuste } from '@/utils/serviceStation'
import { WALLET_EN_APROBACION, programaVigente, vigenciaLegible } from '@/services/loyaltyService'
import { promoParaProducto, CANAL_POS } from '@/services/scheduledDiscountService'
import { formatCurrency, formatUnitPrice, formatLineAmount, formatProductPrice, applyMarginToCost, matchesSearchQuery, buildSearchHaystack, matchesPrebuilt, cleanText } from '@/lib/utils'
import { buildProductHaystack } from '@/utils/productSearch'
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
import { vendedoresDeSucursal } from '@/utils/sellerBranches'
import { stockPorSucursal } from '@/utils/branchStockView'
import { registrarVentaDemo } from '@/data/demo/operaciones'
import { applyBranchPricing } from '@/utils/branchPricing'
import { filterProductsForBranch, filterCategoriesForBranch, isProductInBranch } from '@/utils/branchCatalog'
import { filtrarVendibles, esSoloUsoInterno } from '@/utils/productSale'
import { lineaDeEnvio, yaHayEnvioEnElCarrito } from '@/utils/deliveryFee'
import { idDeFidelizacion } from '@/utils/businessGroup'
import { getAvailableDocumentTypes, resolveDocumentType } from '@/utils/documentTypes'
import { calculateInvoiceAmounts, calculateMixedInvoiceAmounts, calculateRecargoConsumo, ID_TYPES, DETRACTION_TYPES, DETRACTION_MIN_AMOUNT, calcularDetraccion } from '@/utils/peruUtils'
import { generateInvoicePDF, getInvoicePDFBlob, previewInvoicePDF, preloadLogo } from '@/utils/pdfGenerator'
// El import de Capacitor tiene que ser EXPLÍCITO: este archivo lo usa en 6
// lugares (escáner, comanda automática, impresión térmica) pero funcionaba
// solo porque importar '@capacitor/share' asigna window.Capacitor como efecto
// secundario — y esa asignación está marcada /*#__PURE__*/, o sea que el
// bundler tiene permiso de eliminarla si nadie importa Capacitor de verdad
// (detectado por ESLint no-undef, auditoría 17-ago-2026).
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { scanBarcode, scannerDisponible } from '@/utils/scanBarcode'
import { analizarRafaga, MS_ABANDONO } from '@/utils/scannerDetect'
import { getDoc, doc, Timestamp, collection, query, where, getDocs, limit as fsLimit, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { getRooms as getHotelRooms, getActiveReservations, addCharge as addFolioCharge, markChargesAsInvoiced } from '@/services/hotelService'
import { getCachedProducts, setCachedProducts } from '@/utils/productCache'
import {
  subscribeToProducts,
  getCustomers,
  createInvoice,
  createInvoiceWithNumber,
  createProduct,
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
import VariantSelectorModal from '@/components/product/VariantSelectorModal'
import { consultarDNI, consultarRUC, consultarEstablecimientos } from '@/services/documentLookupService'
import { deductIngredients } from '@/services/ingredientService'
import { consumoDeModificadoresDeVarias } from '@/utils/modificadorInsumo'
import { getRecipeByProductId, checkRecipeStock, shouldDeductIngredients, getRecipes } from '@/services/recipeService'
import { computeRecipeStockAlerts, hasAnyRecipe } from '@/utils/recipeAvailability'
import { getWarehouses, getDefaultWarehouse, updateWarehouseStock, getStockInWarehouse, getTotalAvailableStock, getOrphanStock, createStockMovement, sinControlDeStock } from '@/services/warehouseService'
import { getActiveBranches, getDefaultBranch } from '@/services/branchService'
import { shortenUrl } from '@/services/urlShortenerService'
import { releaseTable, updateTableAmount } from '@/services/tableService'
import { clampEmissionDate, getEmissionDateLimits, validateEmissionDate } from '@/utils/emissionDate'
import { computeSaleCommission } from '@/utils/commissions'
import { getSellers } from '@/services/sellerService'
import { markOrderAsPaid, updateOrder, updateOrderStatus, claimOrderForInvoicing, releaseOrderInvoicingClaim, markOrderInvoiced } from '@/services/orderService'
import { cerrarVinculoDeOrigen } from '@/services/documentLinking'
import { completeAppointment } from '@/services/appointmentService'
import { programarRecordatoriosDeVenta } from '@/services/veterinaryService'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { savePendingSale } from '@/services/offlineQueueService'
import * as CustomerDisplay from '@/services/customerDisplayService'
import InvoiceTicket from '@/components/InvoiceTicket'
import KitchenTicket from '@/components/KitchenTicket'
import { useReactToPrint } from 'react-to-print'
import { getPrimaryPet } from '@/utils/petUtils'
import { datosDeCliente, camposExtraConRespaldo } from '@/utils/posCustomerData'
import { getVisiblePaymentMethods, getPaymentLabel, getPaymentKeyByLabel } from '@/utils/paymentMethods'
import GuideLink from '@/components/guide/GuideLink'
import { diasDeRecordatorio } from '@/utils/vetReminders'
import { repreciarPorCantidad } from '@/utils/autoPriceByQty'
import { revisarAntesDeEmitir, textoDeErrores } from '@/utils/sunatPreflight'
import { lineasPorConsumo, TEXTO_POR_CONSUMO } from '@/utils/comprobantePorConsumo'
import { sePuedeGuardar, productoDesdePersonalizado } from '@/utils/productoRapido'
import AutoGrowTextarea from '@/components/ui/AutoGrowTextarea'

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
  GIFT_CERT: 'Certificado de regalo',
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
  // Come ahí pero sin mesa (patio de comidas, mostrador). Distinto de Para
  // Llevar: no carga táper ni envío. InvoiceList ya lo etiqueta "Mostrador".
  'counter': 'En Local',
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
    if (configured && getPaymentLabel(configured, companySettings)) {
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
  // Platos que SÍ se pueden preparar pero con algún insumo en su mínimo.
  // Sólo avisa (badge amarillo), no bloquea.
  const [insumosBajos, setInsumosBajos] = useState(() => new Set())
  const [motivosInsumo, setMotivosInsumo] = useState(() => new Map())
  // Map<productId, totalCost> de recetas. Se usa para congelar el costo del
  // plato al vender (costAtSale en comprobantes). Se carga lazy y SOLO si la
  // cuenta tiene recetas → cero overhead para las cuentas retail.
  const [recipeCostMap, setRecipeCostMap] = useState(() => new Map())
  const [customers, setCustomers] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [taxConfig, setTaxConfig] = useState({ igvRate: 18, igvExempt: false, taxType: 'standard' }) // Configuración de impuestos

  // === AFECTACIÓN IGV ELEGIDA PARA ESTA VENTA ===
  //
  // Caso real (negocio de la Amazonía, Ley 27037): está exonerado del IGV, pero
  // esa exoneración vale para lo que se CONSUME EN LA REGIÓN. Cuando le vende a
  // Lima la operación es gravada y sí debe cobrar IGV. No es un atributo del
  // producto —el mismo producto va exonerado o gravado según a dónde va— sino
  // de la operación, así que se elige por VENTA, no por ítem.
  //
  // 'auto' = manda lo configurado (el producto y el régimen del negocio).
  const [saleTaxMode, setSaleTaxMode] = useState('auto')
  // El interruptor de Configuración, cruzado con el régimen del negocio.
  //
  // Un Nuevo RUS queda FUERA a propósito: su régimen no discrimina IGV. Su
  // boleta viaja con tipo de operación 0113 e IGV 0 justamente para que SUNAT no
  // le exija desglosarlo, y un RUS no está autorizado a cobrarlo. Ofrecerle
  // "Gravado 18%" produciría una boleta 0113 con IGV — un comprobante que se
  // contradice a sí mismo y que SUNAT rechaza.
  const allowManualTaxAffectation =
    businessSettings?.allowManualTaxAffectation === true && taxConfig.taxType !== 'nrus'

  // Configuración de impuestos que realmente rige esta venta.
  //
  // Existe para que la decisión viva en UN solo lugar: antes `taxConfig.igvExempt`
  // se leía suelto en ocho sitios del POS y cada uno tendría que acordarse del
  // override. Este valor es el que se usa para calcular, el que decide qué se
  // muestra, y el que viaja GUARDADO en el comprobante — el generador del XML lee
  // `invoiceData.taxConfig` ANTES que la del negocio, así que con esto la venta
  // llega a SUNAT clasificada como corresponde sin tocar las Cloud Functions.
  //
  // Va declarado acá arriba a propósito: el useMemo de `amounts` lo usa, y un
  // const declarado después reventaría en el render (TDZ).
  const effectiveTaxConfig = React.useMemo(() => {
    if (!allowManualTaxAffectation || saleTaxMode === 'auto') return taxConfig

    if (saleTaxMode === 'exonerado') {
      // Solo apaga el IGV. NO toca taxType ni exemptionReason: esos describen el
      // RÉGIMEN del negocio y de ellos depende la leyenda de Amazonía del XML.
      // El de la selva debe seguir emitiéndola; uno de Lima que exonera una
      // venta puntual, no.
      return { ...taxConfig, igvExempt: true, igvRate: 0 }
    }

    // Gravado. Si el negocio ya tiene tasa propia (10.5% de restaurantes) se
    // respeta; el caso de la selva tiene tasa 0 y ahí corresponde el 18%.
    const rate = Number(taxConfig.igvRate) > 0 ? Number(taxConfig.igvRate) : 18
    return {
      ...taxConfig,
      igvExempt: false,
      igvRate: rate,
      // La leyenda de Amazonía dice que los bienes se consumen en la selva. En
      // un comprobante que cobra IGV justamente por venderse fuera, seria una
      // contradiccion. Se apagan las DOS fuentes que la disparan en el servidor:
      // taxType 'exempt' y el exemptionReason legado (que hereda con ??).
      taxType: taxConfig.taxType === 'exempt' ? 'standard' : taxConfig.taxType,
      exemptionReason: '',
    }
  }, [taxConfig, allowManualTaxAffectation, saleTaxMode])

  // Afectación con la que sale un ítem en ESTA venta.
  //
  // Cuando se elige Gravado o Exonerado, la elección MANDA sobre lo que diga el
  // producto: un producto marcado exonerado sale gravado igual, y al revés. Esa
  // es toda la razón de ser de la opción — el caso es "este producto, a este
  // cliente, hoy", no "este producto siempre". Con 'auto' manda lo configurado.
  //
  // Las bonificaciones se resuelven aparte (afectación 15/30) y no pasan por acá.
  /**
   * Una bonificación, en el lenguaje que SUNAT (y nuestro generador de XML)
   * entiende: NO es una línea de precio 0, es una línea a su VALOR REFERENCIAL
   * con un descuento del 100%.
   *
   * El generador (functions/src/utils/xmlGenerator.js) reconoce la bonificación
   * cuando `itemDiscount` iguala el total de la línea, y recién ahí la declara
   * con afectación 15 (Gravado - Bonificaciones), PriceTypeCode 02 y tributo
   * 9996 (GRA), que es lo que exige el Catálogo 07. Mandarla como precio 0
   * "a secas" la declaraba como inafecta de valor cero — el caso que SUNAT
   * rechaza con error 3105 (auditoría 18-ago-2026).
   *
   * Sin valor referencial (un producto del catálogo que de verdad vale 0) no
   * hay nada que declarar como regalo: se deja pasar tal cual, como siempre.
   */
  const bonificacionParaSunat = (item) => {
    if (!item?.isBonificacion) return {}
    const ref = Number(item.bonificacionRefPrice) || 0
    const cant = Number(item.quantity) || 0
    if (ref <= 0 || cant <= 0) return {}
    return {
      unitPrice: ref,
      subtotal: 0,
      itemDiscount: Number((ref * cant).toFixed(2)),
      itemDiscountType: 'amount',
      isBonificacion: true,
    }
  }

  /**
   * Regalo puesto "a mano": el vendedor deja el precio en 0 en vez de usar el
   * botón de bonificación (y suele agregarle "(BONIFICACIÓN)" al nombre).
   *
   * Para SUNAT una línea en 0 declarada como operación ONEROSA es una
   * contradicción y rechaza el comprobante. Guardando cuánto vale el producto,
   * el XML puede declararla como lo que es: una entrega gratuita con su valor
   * de referencia. Caso real: APU MARKET, boleta B001-00000054.
   */
  const referenciaDeRegalo = (item) => {
    if (item?.isBonificacion) return {}      // ese camino ya lo cubre bonificacionParaSunat
    if (Number(item?.price) !== 0) return {}
    const ficha = productsRaw.find(p => p.id === item.id)
    const lista = Number(item?.originalPrice ?? item?.basePrice ?? ficha?.price ?? 0)
    return Number.isFinite(lista) && lista > 0 ? { referencePrice: lista } : {}
  }

  const resolveItemTaxAffectation = React.useCallback((item) => {
    if (allowManualTaxAffectation && saleTaxMode === 'gravado') return '10'
    if (effectiveTaxConfig.igvExempt) return '20'
    return item?.taxAffectation || '10'
  }, [allowManualTaxAffectation, saleTaxMode, effectiveTaxConfig])

  // Tasa de IGV del ítem, con el mismo criterio.
  // En Gravado se fuerza UNA sola tasa para todo el comprobante: SUNAT (regla
  // 3462) exige que todas las líneas gravadas lleven la misma, y al forzar
  // productos que estaban exonerados podrían entrar con tasas distintas.
  const resolveItemIgvRate = React.useCallback((item) => {
    if (allowManualTaxAffectation && saleTaxMode === 'gravado') return effectiveTaxConfig.igvRate
    if (effectiveTaxConfig.igvExempt) return 0
    return effectiveTaxConfig.taxType === 'reduced' ? effectiveTaxConfig.igvRate : item?.igvRate
  }, [allowManualTaxAffectation, saleTaxMode, effectiveTaxConfig])
  const [recargoConsumoConfig, setRecargoConsumoConfig] = useState({ enabled: false, rate: 10 }) // Recargo al Consumo (restaurantes)
  // POR CONSUMO (restaurantes): el comprobante sale con una sola línea en vez
  // del detalle de platos. Adentro no cambia nada — ver comprobantePorConsumo.js.
  const [porConsumoConfig, setPorConsumoConfig] = useState({ enabled: false, texto: TEXTO_POR_CONSUMO })
  // Por VENTA y APAGADO por defecto: lo normal es que el comprobante salga
  // con el detalle. El interruptor de Configuración solo hace aparecer la
  // casilla; marcarla es la decisión del cajero cuando el cliente lo pide.
  const [porConsumoVenta, setPorConsumoVenta] = useState(false)
  // Recargo por pago con tarjeta (Configuración > Ventas). Cuando aplica, SUBE el
  // precio de los productos (no se muestra como línea); el comprobante sale como
  // una venta normal a ese precio, así el IGV queda correcto sin tocar SUNAT.
  // Guardar en el catalogo lo que se vende como producto personalizado.
  // Apagado por defecto: crear productos solos llena el catalogo de cosas que
  // el negocio no queria ahi. En demo no se guarda nada.
  const guardarPersonalizados = !isDemoMode && businessSettings?.autoSaveCustomProducts === true
  const [cardCommissionConfig, setCardCommissionConfig] = useState({ enabled: false, rate: 5 })
  // Marca para autocompletar el monto del único pago tras cambiar de método (el
  // total puede subir por el recargo de tarjeta, que se sabe recién al elegir Tarjeta).
  const pendingAmountSyncRef = useRef(false)
  const [cart, setCart] = useState([])

  // ===== Multi-divisa (USD) — solo en modo retail con flag activa ======
  // Multi-divisa en el POS para retail y transporte (modos que venden/facturan en
  // USD). El resto de pantallas (compras, cotizaciones, facturas, inventario,
  // reportes) ya respetan el toggle sin mirar el modo; el POS era el único que lo
  // limitaba a retail. Restaurant/hotel se dejan en PEN (su POS usa mesas/órdenes).
  const posMultiCurrencyOn = React.useMemo(
    () => (businessMode === 'retail' || businessMode === 'transport') && isMultiCurrencyEnabled(businessSettings),
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
  const isNativeApp = React.useMemo(() => Capacitor.isNativePlatform(), [])
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
    // companySettings aun no cargo aca, asi que solo se aplica el permiso del
    // usuario; el efecto de mas abajo corrige en cuanto llegan los ajustes.
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

  // Comprobantes realmente disponibles: cruza lo que emite el negocio
  // (enabledDocumentTypes — un RUS desactiva Factura), el permiso del
  // sub-usuario y la conexion SUNAT. Se calcula UNA vez y lo usan el <select>,
  // el estado inicial, el reset tras la venta y la correccion de tipo invalido.
  const docTypeOpts = useMemo(() => ({
    enabledForBusiness: companySettings?.enabledDocumentTypes || null,
    allowedForUser: allowedDocumentTypes || null,
    canEmitFiscal,
  }), [companySettings?.enabledDocumentTypes, allowedDocumentTypes, canEmitFiscal])

  const availableDocTypes = useMemo(() => getAvailableDocumentTypes(docTypeOpts), [docTypeOpts])

  // Campo "Alumno" activo (colegios): habilita buscar al apoderado por el nombre
  // del alumno y mostrarlo en el desplegable de clientes.
  const showStudentField = companySettings?.posCustomFields?.showStudentField === true
  // Obtener fecha local en formato YYYY-MM-DD (sin usar toISOString que convierte a UTC)
  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  // Día SIGUIENTE a una fecha YYYY-MM-DD. Para el `min` de los vencimientos al
  // crédito de factura/boleta: SUNAT exige que la cuota venza DESPUÉS de la
  // emisión (regla 3267) — con min = emisión, el picker dejaba elegir el mismo
  // día y la factura salía rechazada (caso real).
  const dayAfterLocalDate = (dateStr) => {
    const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date()
    d.setDate(d.getDate() + 1)
    return getLocalDateString(d)
  }
  const [emissionDate, setEmissionDate] = useState(getLocalDateString()) // Fecha de emisión (por defecto hoy)
  // ¿El usuario eligió manualmente la fecha de emisión? Si NO, siempre se usa la
  // fecha actual del sistema al vender. Evita que una pestaña del POS abierta de un
  // día para otro "congele" la fecha y emita las ventas de hoy con la fecha de ayer.
  const emissionDateEditedRef = useRef(false)
  // Límites del campo de fecha y ref para llevar el scroll ahí si se rechaza.
  const emissionDateLimits = getEmissionDateLimits(documentType)
  const emissionDateInputRef = useRef(null)
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

  // Comanda WEB de la venta directa (posCreatesKitchenOrder). En la app la
  // comanda sale por la ticketera; en el navegador se imprime igual que en
  // Mesas/Órdenes: KitchenTicket oculto + react-to-print, en su propio diálogo
  // DESPUÉS del de la boleta (window.print bloquea, así que se encadenan solos).
  const posComandaRef = useRef(null)
  const [posComandaToPrint, setPosComandaToPrint] = useState(null)
  const handlePrintPosComanda = useReactToPrint({
    contentRef: posComandaRef,
    onAfterPrint: () => setPosComandaToPrint(null),
  })
  useEffect(() => {
    if (!posComandaToPrint) return
    // Un tick para que el ticket oculto se renderice antes de abrir el diálogo.
    const t = setTimeout(() => handlePrintPosComanda(), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posComandaToPrint])
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
  const [sendingLoyaltyCard, setSendingLoyaltyCard] = useState(false) // Enviando la tarjeta de sellos por WhatsApp
  // Cupón aplicado a la venta actual ({id, type, value} o null) + su input
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponInput, setCouponInput] = useState('')
  // Certificado de regalo aplicado como pago: { id, balance }. Al portador —
  // se valida por codigo, no por cliente. La redencion corre tras guardar.
  const [appliedGiftCert, setAppliedGiftCert] = useState(null)
  const [giftCertInput, setGiftCertInput] = useState('')
  const [validatingGiftCert, setValidatingGiftCert] = useState(false)
  const [validatingCoupon, setValidatingCoupon] = useState(false)
  // Descuentos programados activos del negocio (se evalúan al agregar al carrito)
  const [scheduledPromos, setScheduledPromos] = useState([])
  const [isLookingUp, setIsLookingUp] = useState(false)
  // Establecimientos (anexos) de un RUC con varios locales: lista + modal para elegir.
  const [establishments, setEstablishments] = useState([])
  const [showEstablishmentsModal, setShowEstablishmentsModal] = useState(false)
  const [loadingEstablishments, setLoadingEstablishments] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Warehouses (para stock/inventario)
  const [warehouses, setWarehouses] = useState([])
  // Listas SIN filtrar por permisos: solo alimentan la consulta "¿dónde más
  // hay?". Las de arriba, que deciden de dónde sale la venta, siguen filtradas.
  const [todosLosAlmacenes, setTodosLosAlmacenes] = useState([])
  const [todasLasSucursales, setTodasLasSucursales] = useState([])
  // Producto cuyo stock por sucursal se está mirando (null = modal cerrado).
  const [stockSucursalesDe, setStockSucursalesDe] = useState(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState(null)

  // Branches/Sucursales (para series de documentos)
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)
  // Sede pendiente de aplicar al cobrar una mesa/orden (se resuelve cuando cargan sucursales/almacenes)
  const [pendingBranchSelection, setPendingBranchSelection] = useState(null)

  // Precios por sucursal (businessSettings.branchPricingEnabled): `products` es la
  // vista EFECTIVA con price/price2/3/4 reemplazados por el override de la sucursal
  // activa. Sin feature o en Sucursal Principal (sin branchId) → lista original tal
  // Declarado ACÁ, antes del useMemo que lo consume: un `const` usado antes de
  // su línea revienta en tiempo de ejecución ("Cannot access before
  // initialization") y `vite build` no lo detecta.
  const [categories, setCategories] = useState([])

  // cual (misma referencia, no invalida memos aguas abajo).
  const products = useMemo(() => {
    const branchId = selectedBranch?.id || null
    // 0) Fuera lo que no se vende: desactivados y material de uso interno. Un
    //    solo colador aqui cubre la grilla, la busqueda y el escaner, porque
    //    todos leen `products`. `productsRaw` queda intacto para el checkout.
    const alaVenta = filtrarVendibles(productsRaw)
    // 1) Catalogo por sucursal: saca del catalogo los productos que no aplican a
    //    esta sede. Va PRIMERO para no repreciar lo que igual no se va a mostrar.
    const visibles = filterProductsForBranch(
      alaVenta, branchId, businessSettings?.branchCatalogEnabled === true, categories
    )
    // 2) Precios por sucursal sobre lo que quedo visible.
    if (!businessSettings?.branchPricingEnabled) return visibles
    if (!branchId) return visibles
    return visibles.map(p => applyBranchPricing(p, branchId))
  }, [productsRaw, selectedBranch, businessSettings?.branchPricingEnabled, businessSettings?.branchCatalogEnabled, categories])

  // ═══ Modo estación de servicio (grifo) ═══
  //
  // Es un ATAJO encima del POS normal, no un POS aparte: el modal solo arma
  // la línea del carrito y de ahí sigue el flujo de siempre (comprobante,
  // cliente, método de pago, impresión, SUNAT). Un POS paralelo obligaría a
  // hacer cada arreglo de emisión dos veces.
  //
  // El grifo además tiene minimarket, así que el catálogo normal queda justo
  // abajo: no hay pantalla que cambiar para vender un aceite.
  const modoEstacion = estacionActiva(companySettings)
  const combustibles = useMemo(
    () => (modoEstacion ? combustiblesDe(companySettings, products) : []),
    [modoEstacion, companySettings, products],
  )
  const [combustibleElegido, setCombustibleElegido] = useState(null)

  // Los combustibles NO se repiten abajo en el catalogo. Ademas de verse dos
  // veces, la tarjeta del catalogo agregaria UN galon al precio de lista,
  // saltandose el teclado del monto — que es justo lo que el modo evita.
  const idsDeCombustible = useMemo(
    () => new Set(combustibles.map(c => c.id)),
    [combustibles],
  )

  const categoriasVisibles = useMemo(
    () => filterCategoriesForBranch(
      categories, selectedBranch?.id || null, businessSettings?.branchCatalogEnabled === true,
    ),
    [categories, selectedBranch, businessSettings?.branchCatalogEnabled],
  )


  // Aviso (no bloqueo) cuando un carrito precargado —cotizacion, nota de venta,
  // pedido online, guia— trae productos ocultos en la sucursal activa. La venta
  // procede y el stock se descuenta igual (eso lo garantiza productsRaw en el
  // checkout); esto solo evita que el cajero venda sin saberlo.
  const warnHiddenItemsInCart = (cartItems) => {
    if (businessSettings?.branchCatalogEnabled !== true) return
    if (!Array.isArray(cartItems) || cartItems.length === 0 || productsRaw.length === 0) return
    const branchId = selectedBranch?.id || null
    const ocultos = cartItems.filter(it => {
      const pid = it.productId || it.id
      if (!pid) return false
      const prod = productsRaw.find(pr => pr.id === pid)
      return prod && !isProductInBranch(prod, branchId)
    })
    if (ocultos.length === 0) return
    const nombres = ocultos.slice(0, 3).map(i => i.name).filter(Boolean).join(', ')
    const extra = ocultos.length > 3 ? ` y ${ocultos.length - 3} más` : ''
    toast.info(`Ojo: ${nombres}${extra} no ${ocultos.length === 1 ? 'está disponible' : 'están disponibles'} en esta sucursal. Se puede vender igual y el stock se descontará.`, 8000)
  }

  // Estado para edición de documento existente
  const [editingInvoiceId, setEditingInvoiceId] = useState(null)
  const [editingInvoiceData, setEditingInvoiceData] = useState(null)
  const editInvoiceLoadedRef = useRef(false)

  // Estado para orden de restaurante (para marcar como pagada al completar)
  const [pendingOrderId, setPendingOrderId] = useState(null)
  const [markOrderPaidOnComplete, setMarkOrderPaidOnComplete] = useState(false)
  const [markOnlineOrderCompleteOnSale, setMarkOnlineOrderCompleteOnSale] = useState(false)
  // Reserva viva sobre la orden mientras se emite, para soltarla si la venta falla.
  const orderClaimRef = React.useRef(null)

  // Estado para cotización (para marcar como convertida al completar)
  // { id, number } — el número hacía falta guardarlo: antes solo viajaba al
  // toast y se perdía, y es el dato que el cliente quiere ver en la factura.
  const [pendingQuotation, setPendingQuotation] = useState(null)

  // Estado para nota(s) de venta (para marcar como convertida(s) y skip stock al completar)
  // Puede ser un string (una nota) o un array (múltiples notas)
  const [pendingNotaVentaIds, setPendingNotaVentaIds] = useState(null)

  // Estado para guía de remisión origen (skip stock si la guía ya descontó al crearse).
  // Shape: { id, number, stockAlreadyDeducted } | null
  const [sourceDispatchGuide, setSourceDispatchGuide] = useState(null)

  // Estado para cita veterinaria (para marcar como completada al finalizar la venta)
  const [pendingAppointmentData, setPendingAppointmentData] = useState(null)
  // Veterinaria: días de recordatorio elegidos a mano para esta venta, por
  // producto. Vacío = se usa el que tiene configurado el servicio.
  const [diasRecordatorio, setDiasRecordatorio] = useState({})

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
    if (!configured || !getPaymentLabel(configured, companySettings)) return
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
  // Comanda de ESTA venta (feature posCreatesKitchenOrder). Default true; la
  // cajera lo apaga para ventas que no van a cocina (una gaseosa, un extra).
  const [sendToKitchen, setSendToKitchen] = useState(true)

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
  // Descuentos y cupones: plegados salvo que ya haya algo aplicado.
  const [showDiscountSection, setShowDiscountSection] = useState(false)

  // Se abre solo si el carrito ya trae descuento, cupón o certificado — por
  // ejemplo al recuperar una venta aparcada o al editar un comprobante. Si no,
  // el visitante no vería lo que ya está aplicado.
  useEffect(() => {
    if (discountAmount || discountPercentage || appliedCoupon || appliedGiftCert) {
      setShowDiscountSection(true)
    }
  }, [discountAmount, discountPercentage, appliedCoupon, appliedGiftCert])

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
  // Si el codigo escaneado SI existe pero el producto esta oculto en esta
  // sucursal, guardamos su nombre para avisarlo tal cual. Decir "no registrado"
  // seria falso y empuja al cajero a crear un duplicado con el mismo EAN.
  const [unknownScanProduct, setUnknownScanProduct] = useState(null)
  // El codigo existe pero es material de uso interno: no es un error de la
  // pistola ni un producto de otra sede, y el mensaje tiene que decirlo.
  const [unknownScanInterno, setUnknownScanInterno] = useState(false)
  // Producto sin stock esperando confirmacion del cajero. Guarda que mostrar
  // ({ nombre, detalle }) y que hacer si dice que si ({ confirmar }).
  const [sinStockPendiente, setSinStockPendiente] = useState(null)
  // "Preguntar" GANA sobre "permitir vender sin stock": si el dueno activo el
  // aviso, lo quiere ver aunque tambien tenga habilitada la venta en negativo.
  const preguntarSinStock = !!companySettings?.confirmSaleWithoutStock
  // Para todas las validaciones que BLOQUEAN: con el aviso activo la venta sin
  // stock si esta permitida, solo que se confirma antes. Si no, el cajero
  // confirmaria el modal y al cobrar le saltaria "no hay stock suficiente".
  const permiteSinStock = !!companySettings?.allowNegativeStock || preguntarSinStock

  // Unico punto donde se abre la confirmacion: guarda que mostrar y que hacer
  // si el cajero dice que si.
  const pedirConfirmacionSinStock = (nombre, detalle, confirmar) => {
    setSinStockPendiente({ nombre, detalle, confirmar })
  }

  // Custom product modal
  const [showCustomProductModal, setShowCustomProductModal] = useState(false)
  const [customProduct, setCustomProduct] = useState({
    name: '',
    price: '',
    // Costo. Sirve aunque el producto no se guarde: congelado en la venta,
    // es lo que hace que el reporte de ganancia no cuente el servicio como
    // 100% de margen.
    cost: '',
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
  // Tarjeta de fidelidad del cliente en pantalla (Configuración > Ventas).
  // Se consulta al elegir cliente para que el cajero vea los sellos ANTES de
  // cobrar y pueda canjear el premio si ya llegó a la meta.
  const [loyaltyCard, setLoyaltyCard] = useState(null)
  const [isRedeeming, setIsRedeeming] = useState(false)
  // Canje de fidelización CONECTADO a la venta (F1, 17-ago-2026): al tocar
  // "Canjear", el premio se aplica al carrito o al descuento y queda
  // PENDIENTE; los sellos se descuentan recién cuando la venta se guarda
  // (mismo patrón que los certificados de regalo). Antes se descontaban al
  // toque: una venta cancelada se comía los sellos del cliente.
  const [loyaltyRedemption, setLoyaltyRedemption] = useState(null) // { type, label, phone, discountType }
  const [sendingWalletCard, setSendingWalletCard] = useState(false)

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
    licenseNumber: '', // N° de licencia (persona natural) o de resolución (empresa)
    propertyCard: '', // Tarjeta de propiedad del vehículo
    customerCoords: null, // Ubicación GPS marcada en el catálogo online ({lat,lng})
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

  // Tarjeta de sellos del cliente en pantalla: el cajero la ve ANTES de cobrar.
  // OJO: igual que el effect de abajo, va DESPUES de declarar customerData —
  // leerlo antes lanza "Cannot access 'customerData' before initialization"
  // (TDZ) y tumba el POS entero. vite build NO lo detecta.
  useEffect(() => {
    const tel = customerData?.phone
    if (!companySettings?.loyaltyConfig?.enabled || !tel) { setLoyaltyCard(null); return }
    let alive = true
    ;(async () => {
      try {
        const { getLoyaltyCard } = await import('@/services/loyaltyService')
        const res = await getLoyaltyCard(idDeFidelizacion(companySettings, getBusinessId()), tel, companySettings?.loyaltyConfig)
        if (alive && res.success) setLoyaltyCard(res.data)
      } catch { /* la tarjeta es informativa: nunca frena el POS */ }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerData?.phone, companySettings?.loyaltyConfig?.enabled, saleCompleted])

  // Descuentos programados: se cargan una vez al abrir el POS. Solo los que
  // podrían llegar a correr (activos y no vencidos); el día/horario exacto se
  // evalúa al agregar cada producto, con la hora de ese momento.
  useEffect(() => {
    if (isDemoMode) return
    let alive = true
    ;(async () => {
      try {
        const { getScheduledDiscounts } = await import('@/services/scheduledDiscountService')
        const res = await getScheduledDiscounts(getBusinessId())
        if (alive && res.success) {
          const ahora = new Date()
          setScheduledPromos(res.data.filter(p =>
            p.active && (!p.endsAt || p.endsAt.toDate() >= ahora)))
        }
      } catch { /* sin promos no pasa nada: el POS vende igual */ }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // === ANTICIPOS (solo facturas) ===
  // isAdvanceInvoice: esta factura ES por un anticipo recibido → tipo de
  // operación 0104 (catálogo 51) y queda marcada para poder deducirla después.
  // deductAdvances/advancesList: la factura FINAL deduce anticipos ya
  // facturados (XML: PrepaidPayment + AllowanceCharge 04 + PayableAmount neto).
  const [isAdvanceInvoice, setIsAdvanceInvoice] = useState(false)
  const [deductAdvances, setDeductAdvances] = useState(false)
  const [advancesList, setAdvancesList] = useState([]) // [{ invoiceId?, fullNumber, amount }]
  const [candidateAdvances, setCandidateAdvances] = useState([]) // facturas 0104 aceptadas del cliente
  const [loadingAdvances, setLoadingAdvances] = useState(false)

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
    // documentType '' es el estado intencional "sin seleccionar" (default del
    // negocio en "Ninguno") — NO corregirlo; el cajero debe elegir y el
    // checkout ya lo bloquea. Solo corregir tipos NO vacíos que no estén
    // permitidos.
    if (documentType && availableDocTypes.length > 0 && !availableDocTypes.includes(documentType)) {
      setDocumentType(availableDocTypes[0])
    }
  }, [availableDocTypes, documentType])

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
    setCustomerData(sale.customerData || { documentType: ID_TYPES.DNI, documentNumber: '', name: '', businessName: '', address: '', email: '', phone: '', studentName: '', studentSchedule: '', petName: '', vehiclePlate: '', vehicleModel: '', vehicleYear: '', licenseNumber: '', propertyCard: '', originAddress: '', destinationAddress: '', tripDetail: '', serviceReferenceValue: '', effectiveLoadValue: '', usefulLoadValue: '', bankAccount: '', detractionPercentage: '', detractionAmount: '', goodsServiceCode: '' })
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
  // Un carrito precargado (cotización / pedido online) no pasó por las validaciones
  // de stock. Se marca acá para avisar en cuanto el catálogo esté disponible, y no
  // dejar que el vendedor se entere recién al cobrar.
  const pendingStockCheckRef = useRef(false)
  // Último aviso de faltantes mostrado, para no repetirlo en cada cambio del carrito.
  const avisoFaltantesRef = useRef('')
  // IDs de cargos del folio pendientes de marcar como facturados (persiste aunque el cart cambie)
  const pendingFolioChargeIdsRef = useRef([])
  // Reserva de hotel cuyo folio se está facturando. El reporte de hotel usa
  // el hotelReservationId del comprobante para saber qué se cobró de cada reserva;
  // sin él, "Cobrado" sale S/0.00 aunque esté todo facturado. El modal de folio
  // sí lo guardaba, pero esta ruta —facturar el folio desde el POS— no.
  const pendingFolioReservationIdRef = useRef(null)
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
            // El plato regalado SÍ tiene valor: se guarda para declararlo a
            // SUNAT como valor referencial de la bonificación.
            ...((Number(item.price) || 0) > 0 && { bonificacionRefPrice: Number(item.price) }),
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
        pendingFolioReservationIdRef.current = folioInfo.reservationId || null
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

      // Precargar datos del cliente capturados al crear la orden, para no
      // re-teclearlos al emitir el comprobante. Solo se sobreescribe lo que
      // vino en la orden (el resto de customerData queda como estaba).
      if (orderInfo.customerName || orderInfo.customerDocumentNumber || orderInfo.customerPhone || orderInfo.customerAddress) {
        // Dirección: la FISCAL (SUNAT/RUC) manda porque es la que exige la factura;
        // si no hay, se usa la de entrega del delivery para no re-teclearla.
        const addressForReceipt = orderInfo.customerFiscalAddress || orderInfo.customerAddress
        setCustomerData(prev => ({
          ...prev,
          ...(orderInfo.customerDocumentType && { documentType: orderInfo.customerDocumentType }),
          ...(orderInfo.customerDocumentNumber && { documentNumber: orderInfo.customerDocumentNumber }),
          ...(orderInfo.customerName && { name: orderInfo.customerName }),
          ...(orderInfo.customerBusinessName && { businessName: orderInfo.customerBusinessName }),
          ...(addressForReceipt && { address: addressForReceipt }),
          ...(orderInfo.customerPhone && { phone: orderInfo.customerPhone }),
        }))
      }

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

        /**
         * El envío, como última línea.
         *
         * Viene decidido desde el pedido, así que el cajero no tiene que
         * teclear un precio: es lo que permite cobrarlo con la edición de
         * precios apagada. Va al final para que se lea como lo que es —un
         * cargo aparte— y no mezclado entre los platos.
         */
        const envio = lineaDeEnvio(orderInfo.deliveryFee, businessSettings?.defaultTaxAffectation || '10')
        if (envio) {
          if (yaHayEnvioEnElCarrito(cartItems)) {
            // Muchos negocios resolvieron esto con un producto llamado
            // "Delivery" que agregan a mano. Si además viene el costo del
            // pedido se cobraría dos veces: mejor avisar antes de emitir.
            toast.warning('Este pedido ya trae un producto de delivery. Revisa que no se cobre dos veces.')
          }
          cartItems.push(envio)
        }

        setCart(cartItems)

        const orderLabel = ORDER_TYPES[orderInfo.orderType] || 'Para Llevar'
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
        setPendingQuotation({ id: quotationInfo.quotationId, number: quotationInfo.quotationNumber || '' })
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
          // SKU y código de barras van SEPARADOS, como en cualquier producto del
          // catálogo: al emitir, el comprobante resuelve `item.sku || item.code`.
          // Copiando solo `code`, esa preferencia no encontraba SKU y la venta
          // convertida quedaba con el código de BARRAS, mientras que la misma venta
          // hecha a mano quedaba con el SKU: el mismo producto con dos códigos
          // distintos según el camino, tanto en el PDF como en el XML de SUNAT.
          // Afectación IGV cotizada: sin esto, un producto exonerado cotizado
          // volvía a gravado al convertir (el resolve del POS cae al default '10'
          // si el item no la trae y el producto no se re-resuelve).
          ...(item.taxAffectation && { taxAffectation: item.taxAffectation }),
          sku: item.sku || '',
          code: item.code || '',
          observations: item.observations || '',
          // Cotizado a mano, sin producto del catálogo: mismo trato que el
          // Producto Personalizado del POS. Sin stock que descontar y fuera
          // de las validaciones que buscan una ficha que no existe.
          ...(!item.productId && { isCustom: true, stock: null }),
          ...(item.isVariant && {
            isVariant: true,
            variantSku: item.variantSku || '',
            variantAttributes: item.variantAttributes || {},
          }),
          ...(item.presentationName && {
            presentationName: item.presentationName,
            presentationFactor: item.presentationFactor || 1,
          }),
          // Lo que la cotización guardó y el comprobante sabe escribir, pero se
          // caía en este paso del medio: la venta hecha a mano salía completa y
          // la convertida salía pelada. En farmacia son el registro sanitario y
          // el número de lote, que es lo que después hay que poder rastrear.
          ...(item.imageUrl && { imageUrl: item.imageUrl }),
          ...(item.batchNumber && { batchNumber: item.batchNumber }),
          ...(item.batchExpiryDate && { batchExpiryDate: item.batchExpiryDate }),
          ...(item.laboratoryName && { laboratoryName: item.laboratoryName }),
          ...(item.marca && { marca: item.marca }),
          ...(item.genericName && { genericName: item.genericName }),
          ...(item.concentration && { concentration: item.concentration }),
          ...(item.presentation && { presentation: item.presentation }),
          ...(item.activeIngredient && { activeIngredient: item.activeIngredient }),
          ...(item.therapeuticAction && { therapeuticAction: item.therapeuticAction }),
          ...(item.saleCondition && { saleCondition: item.saleCondition }),
          ...(item.sanitaryRegistry && { sanitaryRegistry: item.sanitaryRegistry }),
        }))
        setCart(cartItems)
        warnHiddenItemsInCart(cartItems)
        // Vino precargado: no pasó por las validaciones de stock de agregar.
        pendingStockCheckRef.current = true
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
    if ((isFromOnlineOrder || isFromRappiOrder) && !onlineOrderLoadedRef.current && !productsLoading) {
      const info = location.state
      onlineOrderLoadedRef.current = true

      // Guardar orderId para marcarlo como completado al finalizar la venta
      if (info.orderId) {
        setPendingOrderId(info.orderId)
        setMarkOnlineOrderCompleteOnSale(true)
      }

      // Cargar items al carrito
      if (Array.isArray(info.items) && info.items.length > 0) {
        const cartItems = info.items.map(item => {
          // El pedido online no guarda SKU ni código de barras —el catálogo
          // público no los expone—, así que la venta salía SIN código mientras
          // que la misma venta hecha a mano salía con el SKU. Se resuelven
          // contra la ficha del producto, igual que hace la guía de remisión.
          // productsRaw: si el producto esta oculto en la sede activa, con la
          // lista filtrada la venta salia sin SKU ni codigo.
          const product = item.productId ? productsRaw.find(p => p.id === item.productId) : null
          return {
            id: item.productId || item.id || `temp-${Date.now()}-${Math.random()}`,
            productId: item.productId || '',
            name: item.name || '',
            price: item.price || 0,
            quantity: item.quantity || 1,
            unit: item.unit || 'NIU',
            // El precio ya viene con la promoción que vio el cliente al ordenar.
            // Sin esto la caja le aplicaría OTRO descuento encima, y si el
            // cajero abre el pedido fuera del horario de la promo el cliente
            // terminaría pagando más de lo que le prometimos.
            promoEvaluated: true,
            ...(item.promoPercent ? { promoName: item.promoName || '' } : {}),
            // En una variante manda su propio SKU, más específico que el del padre.
            sku: item.sku || item.variantSku || product?.sku || '',
            code: item.code || product?.code || '',
            ...(item.isVariant && {
              isVariant: true,
              variantSku: item.variantSku,
              variantAttributes: item.variantAttributes,
            }),
            // Presentación elegida en el catálogo (caja, saco, paquete). El
            // factor es el que se multiplica al descontar stock.
            ...(item.presentationName && {
              presentationName: item.presentationName,
              presentationFactor: Number(item.presentationFactor) || 1,
            }),
            // `cartId` propio: sin esto dos líneas del MISMO producto —una
            // suelta y una por caja— caían al fallback `item.id` y se pisaban
            // entre ellas al cambiar cantidad o quitar una.
            cartId: `${item.productId || item.id}${item.variantSku ? `-${item.variantSku}` : ''}${item.presentationName ? `-pres-${item.presentationName}` : ''}`,
          }
        })
        setCart(cartItems)
        warnHiddenItemsInCart(cartItems)
        // Vino precargado: no pasó por las validaciones de stock de agregar.
        pendingStockCheckRef.current = true
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
          customerCoords: c.coords || null,
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
          taxAffectation: resolveItemTaxAffectation(item),
          itemDiscount: item.itemDiscount || 0,
          notes: item.notes || '',
          presentationName: item.presentationName || '',
          presentationFactor: item.presentationFactor || 1,
          batchNumber: item.batchNumber || '',
          batchExpiryDate: item.batchExpiryDate || '',
          // SKU y código de barras van SEPARADOS, igual que en la conversión de
          // cotizaciones. Copiando solo `code`, la venta convertida quedaba con
          // el código de BARRAS y la misma venta hecha a mano con el SKU: el
          // mismo producto con dos códigos distintos según el camino, en el PDF
          // y en el XML de SUNAT.
          sku: item.sku || '',
          ...(item.imageUrl && { imageUrl: item.imageUrl }),
          // Qué variante se vendió. Acá no toca stock —la nota ya lo descontó—
          // pero sin esto el comprobante final no dice cuál era.
          ...(item.isVariant && {
            isVariant: true,
            variantSku: item.variantSku || '',
            variantAttributes: item.variantAttributes || {},
          }),
          ...(item.laboratoryName && { laboratoryName: item.laboratoryName }),
          ...(item.marca && { marca: item.marca }),
          ...(item.genericName && { genericName: item.genericName }),
          ...(item.concentration && { concentration: item.concentration }),
          ...(item.presentation && { presentation: item.presentation }),
          ...(item.activeIngredient && { activeIngredient: item.activeIngredient }),
          ...(item.therapeuticAction && { therapeuticAction: item.therapeuticAction }),
          ...(item.saleCondition && { saleCondition: item.saleCondition }),
          ...(item.sanitaryRegistry && { sanitaryRegistry: item.sanitaryRegistry }),
        }))
        setCart(cartItems)
        warnHiddenItemsInCart(cartItems)
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
        setCustomerData(datosDeCliente(customer))
      }

      // Cargar método de pago (convertir del formato guardado al formato del formulario)
      if (notaVentaInfo.payments && notaVentaInfo.payments.length > 0) {
        const formPayments = notaVentaInfo.payments.map(p => ({
          method: p.methodKey || getPaymentKeyByLabel(p.method, companySettings),
          amount: p.amount ? p.amount.toString() : '',
        }))
        setPayments(formPayments)
      } else if (notaVentaInfo.paymentMethod) {
        const methodKey = getPaymentKeyByLabel(notaVentaInfo.paymentMethod, companySettings)
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
          // productsRaw: con la lista filtrada, un producto oculto en esta sede
          // perdia SKU, marca y afectacion IGV (caia al default gravado '10').
          const product = item.productId ? productsRaw.find(p => p.id === item.productId) : null
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
        warnHiddenItemsInCart(cartItems)
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

      // Notas de venta: mismas condiciones que muestran el botón en el listado.
      // Se repiten acá porque ocultar el botón no impide entrar por la URL —un
      // enlace guardado, un atajo— y ahí el usuario editaría algo que el negocio
      // decidió no dejar editar.
      if (invoice.documentType === 'nota_venta') {
        // `companySettings` puede seguir en null: esta carga la dispara un efecto
        // que corre AL MONTAR, en paralelo con el que trae la configuración. Sin
        // leerla fresca acá, la validación rebotaba ediciones que sí estaban
        // habilitadas —dependía de cuál de los dos efectos ganara la carrera—.
        let cfg = companySettings
        if (!cfg) {
          const cfgResult = await getCompanySettings(businessId)
          cfg = cfgResult.success ? cfgResult.data : null
        }
        if (cfg?.allowEditNotaVenta !== true) {
          toast.error('La edición de notas de venta está desactivada. Actívala en Configuración > Ventas.')
          appNavigate('facturas')
          return
        }
        if (invoice.convertedTo) {
          toast.error('Esta nota de venta ya se convirtió en comprobante y no puede editarse')
          appNavigate('facturas')
          return
        }
        if (invoice.status === 'voided' || invoice.status === 'cancelled') {
          toast.error('Esta nota de venta está anulada y no puede editarse')
          appNavigate('facturas')
          return
        }
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
      // Si el comprobante se emitió POR CONSUMO, la casilla vuelve marcada: al
      // reeditarlo tiene que seguir saliendo igual, no destaparle el detalle de
      // platos a un cliente que pidió una sola línea.
      setPorConsumoVenta(Array.isArray(invoice.itemsComprobante) && invoice.itemsComprobante.length > 0)

      // Cargar cliente — mismo criterio que el resto del POS
      // (utils/posCustomerData). Esta lista estaba escrita a mano DOS veces,
      // una acá y otra en el otro cargador, y ya se había quedado corta antes.
      setCustomerData(datosDeCliente(invoice.customer))

      // Observaciones del comprobante: se guardan en `notes` y no se
      // restauraban. Al duplicar, la copia nacía sin ellas; al editar era
      // peor, porque guardar escribe `notes: generalNotes || ''` y las
      // borraba.
      setGeneralNotes(invoice.notes || '')

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
        price: item.unitPrice ?? item.price ?? 0,
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
        ...(item.serialNumber2 && { serialNumber2: item.serialNumber2 }),
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
          method: p.methodKey || getPaymentKeyByLabel(p.method, companySettings),
          amount: p.amount != null ? p.amount.toString() : '',
        }))
        setPayments(formPayments)
      } else if (invoice.paymentMethod) {
        const methodKey = getPaymentKeyByLabel(invoice.paymentMethod, companySettings)
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
      // Si el comprobante se emitió POR CONSUMO, la casilla vuelve marcada: al
      // reeditarlo tiene que seguir saliendo igual, no destaparle el detalle de
      // platos a un cliente que pidió una sola línea.
      setPorConsumoVenta(Array.isArray(invoice.itemsComprobante) && invoice.itemsComprobante.length > 0)

      // Cargar cliente — mismo criterio que el resto del POS
      // (utils/posCustomerData). Esta lista estaba escrita a mano DOS veces,
      // una acá y otra en el otro cargador, y ya se había quedado corta antes.
      setCustomerData(datosDeCliente(invoice.customer))

      // Observaciones del comprobante: se guardan en `notes` y no se
      // restauraban. Al duplicar, la copia nacía sin ellas; al editar era
      // peor, porque guardar escribe `notes: generalNotes || ''` y las
      // borraba.
      setGeneralNotes(invoice.notes || '')

      // Cargar items al carrito (mismo mapeo que en loadInvoiceForEdit)
      const cartItems = (invoice.items || []).map((item, index) => ({
        id: item.productId || `dup-item-${index}`,
        productId: item.productId,
        code: item.code || item.sku || '',
        sku: item.sku || item.code || '',
        name: item.name || item.description,
        description: item.description,
        price: item.unitPrice ?? item.price ?? 0,
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
        ...(item.serialNumber2 && { serialNumber2: item.serialNumber2 }),
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
          method: p.methodKey || getPaymentKeyByLabel(p.method, companySettings),
          amount: p.amount != null ? p.amount.toString() : '',
        }))
        setPayments(formPayments)
      } else if (invoice.paymentMethod) {
        const methodKey = getPaymentKeyByLabel(invoice.paymentMethod, companySettings)
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

  // Demo: el catálogo sigue al estado vivo. Al vender baja el stock, y sin
  // esto las tarjetas seguirían mostrando el número anterior hasta recargar.
  useEffect(() => {
    if (!isDemoMode || !demoData) return
    setProductsRaw(demoData.products || [])
    setCustomers(demoData.customers || [])
  }, [isDemoMode, demoData])

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
            // 'none' = sin default: el POS abre sin tipo seleccionado y el
            // cajero DEBE elegirlo (el checkout ya bloquea si documentType='').
            if (def === 'none') {
              setDocumentType('')
            } else {
              // businessData (no companySettings): estos son los ajustes que
              // se acaban de leer; el state todavia no se actualizo.
              setDocumentType(resolveDocumentType(def, {
                enabledForBusiness: businessData.enabledDocumentTypes || null,
                allowedForUser: allowedDocumentTypes || null,
                canEmitFiscal,
              }))
            }
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
          const pcTexto = (businessData.restaurantConfig.porConsumoTexto || '').trim() || TEXTO_POR_CONSUMO
          const pcEnabled = businessData.restaurantConfig.porConsumoEnabled === true
          setPorConsumoConfig({ enabled: pcEnabled, texto: pcTexto })
          // La casilla NO se premarca: emitir POR CONSUMO es la excepción, no
          // lo habitual. Que venga marcada haría que se emitieran sin detalle
          // ventas donde nadie lo pidió.
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
        setTodosLosAlmacenes(allWarehouses)
        warehouseList = filterWarehousesByAccess(allWarehouses)
        setWarehouses(warehouseList)
      }

      // Procesar sucursales
      if (branchesResult.success) {
        const allBranches = branchesResult.data || []
        setTodasLasSucursales(allBranches)
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

  // Lazy: calcular en background el estado de los insumos de cada plato con
  // receta — "Sin insumos" (no alcanza para 1 unidad) y "Stock bajo" (alcanza,
  // pero un insumo llegó a su mínimo). Sólo cuando terminó la carga y hay al
  // menos una receta configurada; si el negocio no usa recetas este efecto
  // sale sin hacer nada (cero overhead para el 80% de las cuentas).
  //
  // Ya no se salta cuando `allowNegativeStock` está activo: ese ajuste dice
  // "no me bloquees la venta", no "no me avises". El bloqueo se decide abajo,
  // al renderizar.
  React.useEffect(() => {
    if (isLoading) return
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
      const { sinInsumos, stockBajo, motivos } = await computeRecipeStockAlerts(businessId, warehouseId)
      if (cancelled) return
      setProductsWithoutIngredients(sinInsumos)
      setInsumosBajos(stockBajo)
      setMotivosInsumo(motivos)
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

  /**
   * Veterinaria: servicios de este carrito que dejan recordatorio.
   *
   * Un servicio recuerda si su ficha de producto tiene "Recordar servicio
   * (días)". El número se puede pisar acá mismo para esta venta — es el caso
   * de "salvo que el cliente pida 15 o 20 días".
   */
  const serviciosARecordar = React.useMemo(() => {
    if (businessMode !== 'veterinary' || cart.length === 0) return []
    const idsEnCarrito = new Set(cart.map(i => i.id))
    const fichaPorId = new Map()
    for (const p of productsRaw) {
      if (idsEnCarrito.has(p.id)) fichaPorId.set(p.id, p)
    }
    const salida = []
    for (const item of cart) {
      if (item.isCustom) continue
      // Por defecto TODO lo que se vende se recuerda (30 días de fábrica); la
      // ficha del producto solo marca las excepciones. Ver vetReminders.js.
      const base = diasDeRecordatorio(fichaPorId.get(item.id), businessSettings)
      if (base <= 0) continue
      const elegido = diasRecordatorio[item.id]
      const dias = (elegido === undefined || elegido === '')
        ? base
        : (parseInt(elegido) || 0)
      salida.push({ productId: item.id, nombre: item.name, dias, base })
    }
    return salida
  }, [businessMode, cart, productsRaw, diasRecordatorio, businessSettings])

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
      map.set(p.id, buildProductHaystack(p, { categories }))
    }
    return map
  }, [products, categories])

  // Optimizar filtrado de productos con useMemo
  // Stock del producto en la vista actual (el almacén seleccionado, o el total
  // si no hay ninguno). Suma las variantes, que llevan su stock aparte.
  const stockEnVista = React.useCallback((p) => {
    if (p.hasVariants && p.variants?.length > 0) {
      return selectedWarehouse
        ? p.variants.reduce((suma, v) => {
            const ws = (v.warehouseStocks || []).find(w => w.warehouseId === selectedWarehouse.id)
            return suma + (ws?.stock || 0)
          }, 0)
        : p.variants.reduce((suma, v) => suma + (v.stock || 0), 0)
    }
    return selectedWarehouse ? getStockInWarehouse(p, selectedWarehouse.id) : (p.stock || 0)
  }, [selectedWarehouse])

  // "Agotado" solo aplica a lo que LLEVA control de stock: un servicio o un
  // producto sin control no está agotado, no tiene stock que contar. Ojo con
  // `stock: null`, que además vale 0 al leerlo por almacén: sin esta guarda
  // los productos sin control se irían todos al final de la lista.
  const agotado = React.useCallback(
    (p) => !sinControlDeStock(p) && stockEnVista(p) <= 0,
    [stockEnVista],
  )

  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      // Excluir productos desactivados (isActive === false).
      // Si el campo no existe (undefined) se considera activo por retrocompatibilidad.
      if (p.isActive === false) return false
      // Los combustibles viven en su barra de arriba, no en el catalogo.
      if (idsDeCombustible.has(p.id)) return false
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
      if (businessSettings?.posCustomFields?.hideOutOfStockInPOS && agotado(p)) return false

      return matchesSearch && matchesCategory && matchesBrand
    })
    // Los agotados van al FINAL, y dentro de cada grupo alfabético (mismo
    // criterio que la página de Productos). Antes el orden era solo
    // alfabético y los que no se podían vender ocupaban las primeras
    // pantallas, justo las que el cajero mira con el cliente enfrente.
    .sort((a, b) => {
      const va = agotado(a)
      const vb = agotado(b)
      if (va !== vb) return va ? 1 : -1
      return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
    })
  }, [products, idsDeCombustible, deferredSearchTerm, productSearchIndex, selectedCategoryFilter, selectedBrandFilter, categories, businessSettings?.posCustomFields?.hideOutOfStockInPOS, selectedWarehouse, agotado])

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
        // El criterio de "esto lo escribió una pistola" vive en
        // @/utils/scannerDetect, compartido con la pantalla de prueba de
        // Configuración: si la prueba usara otro umbral que el mostrador, no
        // serviría para diagnosticar por qué un lector no anda.
        if (analizarRafaga(buffer, lastCharTime - firstCharTime).esEscaneo) {
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
        buffer = ''
        firstCharTime = 0
        return
      }

      // Solo caracteres imprimibles sin modificadores.
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return

      if (buffer === '') firstCharTime = now
      buffer += e.key
      lastCharTime = now

      // Sin teclas por un rato, se descarta la ráfaga (era tipeo humano).
      // El plazo sale del mismo módulo: con los tiempos de Bluetooth, 300 ms
      // vaciaban el buffer a media lectura.
      clearTimeout(resetTimer)
      resetTimer = setTimeout(() => { buffer = ''; firstCharTime = 0 }, MS_ABANDONO)
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
        const sinStockVar = variant.stock !== null && variant.stock <= 0
        if (sinStockVar && !permiteSinStock) {
          toast.error(`Variante de ${product.name} sin stock`)
        } else {
          addVariantToCart(product, variant)
          setSearchTerm('')
          if (!(sinStockVar && preguntarSinStock)) {
            toast.success(`${product.name} agregado al carrito`)
          }
        }
        return
      }

      // ¿Lo tecleado es el COMIENZO del código de alguna variante más larga?
      // Caso real: producto PROD-0001 con variante PROD-0001-1. Al escribir a
      // mano, el debounce disparaba en cuanto el texto igualaba al padre, abría
      // el selector de variantes y LIMPIABA el buscador — así el código de la
      // variante no se podía terminar de escribir nunca.
      // Con la pistola no aplica: manda el código completo de una.
      const esPrefijoDeVariante = !wasGunScan && products.some(p => {
        if (p.isActive === false || !p.hasVariants || !Array.isArray(p.variants)) return false
        return p.variants.some(v => {
          if (!v) return false
          return [v.sku, v.barcode].some(cod => {
            const c = String(cod || '').toLowerCase()
            if (!c || c === searchLower) return false
            return c.startsWith(searchLower) || c.replace(/-/g, '').startsWith(searchNoHyphens)
          })
        })
      })

      // Si hay exactamente una coincidencia exacta por código, agregarlo automáticamente
      if (exactMatches.length === 1 && !esPrefijoDeVariante) {
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

        const hasStock = warehouseStock > 0 || !product.trackStock || product.stock === null || permiteSinStock
        // Si va a abrir la confirmacion, todavia no entro al carrito.
        const preguntara = preguntarSinStock && product.stock !== null
          && product.trackStock !== false && warehouseStock <= 0

        if (hasStock) {
          addToCart(product)
          // Limpiar el campo de búsqueda después de agregar
          setSearchTerm('')
          // Con variantes, addToCart NO agrega: abre el selector. Decir
          // "agregado al carrito" ahí era mentira y confundía al cajero.
          if (product.hasVariants) {
            toast.info(`${product.name}: elige la variante`)
          } else if (!preguntara) {
            toast.success(`${product.name} agregado al carrito`)
          }
        } else {
          toast.error(`${product.name} no tiene stock disponible en ${selectedWarehouse?.name || 'este almacén'}`)
          setSearchTerm('')
        }
      }

      // No se encontró ningún producto con ese código. Si vino de la pistola
      // (detector global), avisar con un modal para que el cajero se detenga.
      if (exactMatches.length === 0 && !variantMatch && wasGunScan && products.length > 0) {
        const enOtraSede = findInFullCatalogByCode(searchTerm)
        setUnknownScanProduct(enOtraSede ? enOtraSede.name : null)
        setUnknownScanInterno(esSoloUsoInterno(enOtraSede))
        setUnknownScanCode(searchTerm)
        setSearchTerm('')
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchTerm, products, companySettings, selectedWarehouse])

  // Buscar el código EXACTO en el catálogo COMPLETO (sin filtro de sucursal).
  // Distingue "el código no existe" de "existe pero es de otra sede".
  const findInFullCatalogByCode = (term) => {
    const searchLower = String(term || '').toLowerCase().trim()
    if (!searchLower) return null
    const searchNoHyphens = searchLower.replace(/-/g, '')
    for (const p of productsRaw) {
      if (p.isActive === false) continue
      const code = p.code?.toLowerCase() || ''
      const sku = p.sku?.toLowerCase() || ''
      if (code === searchLower || sku === searchLower ||
        code.replace(/-/g, '') === searchNoHyphens || sku.replace(/-/g, '') === searchNoHyphens) {
        return p
      }
      if (Array.isArray(p.barcodes) && p.barcodes.some(bc => {
        const b = String(bc || '').toLowerCase()
        return b === searchLower || b.replace(/-/g, '') === searchNoHyphens
      })) {
        return p
      }
      if (p.hasVariants && Array.isArray(p.variants)) {
        const v = p.variants.find(v => {
          if (!v) return false
          const vSku = (v.sku || '').toLowerCase()
          const vBarcode = (v.barcode || '').toLowerCase()
          return vSku === searchLower || vBarcode === searchLower ||
            vSku.replace(/-/g, '') === searchNoHyphens
        })
        if (v) return p
      }
    }
    return null
  }

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

    if (!scannerDisponible()) {
      toast.info('El escáner de código de barras solo está disponible en la app móvil')
      return
    }

    setIsScanning(true)

    try {
      const scannedCode = await scanBarcode({ avisar: toast })

      if (scannedCode) {

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
            const sinStockV = foundVariant.stock !== null && foundVariant.stock <= 0
            if (sinStockV && !permiteSinStock) {
              toast.error(`${foundProduct.name} (variante) no tiene stock disponible`)
            } else {
              addVariantToCart(foundProduct, foundVariant)
              if (!(sinStockV && preguntarSinStock)) {
                toast.success(`${foundProduct.name} agregado al carrito`)
              }
            }
          } else {
            // Match en padre (producto sin variantes o escaneo del código del padre)
            const warehouseStock = getCurrentWarehouseStock(foundProduct)
            const sinStockP = foundProduct.stock !== null && warehouseStock <= 0
            if (sinStockP && !permiteSinStock) {
              toast.error(`${foundProduct.name} no tiene stock disponible`)
            } else {
              addToCart(foundProduct)
              if (!(sinStockP && preguntarSinStock)) {
                toast.success(`${foundProduct.name} agregado al carrito`)
              }
            }
          }
        } else {
          const enOtraSede = findInFullCatalogByCode(scannedCode)
          if (enOtraSede) {
            toast.error(`"${enOtraSede.name}" existe pero no está disponible en esta sucursal`)
          } else {
            toast.error(`No se encontró producto con código: ${scannedCode}`)
          }
        }
      }
    } catch (error) {
      console.error('Error al escanear:', error)
      toast.error(error.message || 'Error al escanear el código de barras')
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

  const addToCart = (product, selectedPrice = null, selectedPresentation = null, selectedBatch = null, yaConfirmado = false) => {
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
    const hasPresentations = product.presentations && product.presentations.length > 0
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
    if (product.stock !== null && warehouseStock <= 0 && !permiteSinStock) {
      toast.error(`Producto sin stock en ${selectedWarehouse?.name || 'este almacén'}`)
      return
    }
    // Con el ajuste de preguntar se frena aca y decide el cajero. `yaConfirmado`
    // evita el bucle: cuando vuelve desde el modal no pregunta de nuevo.
    if (product.stock !== null && warehouseStock <= 0 && preguntarSinStock && !yaConfirmado) {
      pedirConfirmacionSinStock(
        product.name,
        `No tiene stock en ${selectedWarehouse?.name || 'este almacén'}.`,
        () => addToCart(product, selectedPrice, selectedPresentation, selectedBatch, true)
      )
      return
    }

    // SUNAT regla 3462: No se permite mezclar tasas de IGV en la misma boleta/factura
    // Validar que el producto tenga la misma tasa que los items gravados ya en el carrito
    if (effectiveTaxConfig.taxType === 'standard' && (product.taxAffectation || '10') === '10') {
      const rawProductRate = product.igvRate || effectiveTaxConfig.igvRate || 18
      const productRate = rawProductRate === 10 ? 10.5 : rawProductRate
      const existingGravado = cart.find(item => (item.taxAffectation || '10') === '10')
      if (existingGravado) {
        const rawCartRate = existingGravado.igvRate || effectiveTaxConfig.igvRate || 18
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
      const stockMsgTope = isNoLotSale ? 'stock sin lote' : batchToUse ? `lote ${batchToUse.lotNumber}` : (selectedWarehouse?.name || 'este almacén')
      if (product.stock !== null && existingItem.quantity >= warehouseStock && !permiteSinStock) {
        toast.warning(`Stock agotado en ${stockMsgTope}. Agrega el producto de nuevo para usar otro lote.`)
        return
      }
      // Escanear el mismo producto de mas es tan invisible como escanear uno sin
      // stock: mismo aviso que se va solo, mismo item que falta en la venta.
      if (product.stock !== null && existingItem.quantity >= warehouseStock && preguntarSinStock && !yaConfirmado) {
        pedirConfirmacionSinStock(
          product.name,
          `Ya tienes ${existingItem.quantity} en el carrito y solo hay ${warehouseStock} en ${stockMsgTope}.`,
          () => addToCart(product, selectedPrice, selectedPresentation, selectedBatch, true)
        )
        return
      }

      setCart(
        // El repricing va sobre el carrito COMPLETO: con suma por producto, subir
        // una variante puede bajar el precio de las otras.
        applyAutoPricingToCart(
          cart.map(item =>
            (item.cartId || item.id) === cartItemId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        )
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

  /**
   * El despacho ya resuelto entra al carrito como una línea normal.
   *
   * `price` es el unitario DERIVADO (monto / galones), no el precio
   * publicado: así cantidad x precio da el monto exacto que entregó el
   * cliente y la línea cierra para SUNAT. `basePrice` (PEN) se mueve con el
   * mismo factor para que la conversión de moneda no los desalinee.
   *
   * Cada despacho es su propia línea —nunca se suma a una anterior— porque
   * dos autos seguidos del mismo combustible son dos ventas distintas.
   */
  const agregarCombustible = ({ galones, monto, unitario }) => {
    const producto = combustibleElegido
    if (!producto) return
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }

    const precioPen = Number(producto.price) || 0
    const factor = factorDeAjuste(unitario, toSessionCurrency(precioPen))

    setCart(prev => [...prev, {
      ...producto,
      quantity: galones,
      price: unitario,
      basePrice: precioPen * factor,
      // El carrito necesita el permiso explícito para mostrar decimales.
      allowDecimalQuantity: true,
      unit: producto.unit || 'GLL',
      cartId: `${producto.id}-comb-${Date.now()}`,
    }])

    setCombustibleElegido(null)
    toast.success(`${producto.name}: ${galones.toFixed(3)} gal por ${formatCurrency(monto, currency)}`)
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
      // Numero secundario de la unidad (motor de moto, 2do IMEI, codigo de
      // fabrica). Viaja junto a la serie hasta el comprobante.
      ...(serial.serialNumber2 && { serialNumber2: serial.serialNumber2 }),
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
    const hasPresentations = product.presentations && product.presentations.length > 0

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
    // Cantidad mínima desde la que se aplica cada precio, SOLO si el producto usa
    // precio automático por cantidad. Con el automático activado ya no aparece el
    // modal para elegir precio, así que el cajero no tenía forma de saber desde
    // cuántas unidades baja: por eso se muestra en la tarjeta. Misma resolución
    // que minimoDeNivel (mínimo del producto → global → legacy global).
    const autoByQty = product?.useAutoPriceByQty === true
    const productMins = product?.priceMinQtys || {}
    const globalMins = companySettings?.catalogWholesaleMinQtys || {}
    const legacyGlobal = parseInt(companySettings?.catalogWholesaleMinQty)
    const getMinQty = (key) => {
      if (!autoByQty || key === 'price1') return null
      const p = parseInt(productMins[key])
      if (Number.isFinite(p) && p >= 1) return p
      const g = parseInt(globalMins[key])
      if (Number.isFinite(g) && g >= 1) return g
      if (Number.isFinite(legacyGlobal) && legacyGlobal >= 1) return legacyGlobal
      return null
    }
    const out = []
    for (const { key, def } of defs) {
      if (key !== 'price1' && !hasPriceLevel(product, key)) continue
      const value = resolvePrice(product, key)
      if (value == null || value <= 0) continue
      out.push({ key, label: businessSettings?.priceLabels?.[key] || def, value, minQty: getMinQty(key) })
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
    // El item PUEDE traer su costo ya congelado: el producto personalizado lo
    // pide en pantalla y lo guarda al agregarlo al carrito. Ese manda, porque
    // es el que el vendedor escribió para ESTA venta.
    //
    // Va antes del corte de abajo: el corte devolvía null para todo lo
    // personalizado, así que el costo tecleado se perdía al armar el
    // comprobante y el reporte mostraba costo y utilidad vacíos — el servicio
    // escrito a mano seguía figurando con 100% de margen, que es justo lo que
    // el campo venía a resolver.
    const propio = Number(item.costAtSale)
    if (Number.isFinite(propio) && propio > 0) return propio

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
  const handlePresentationSelection = (presentation, priceKey = null) => {
    if (!productForPresentationSelection) return

    const product = productForPresentationSelection
    const batchToUse = pendingBatchForPresentation
    const isNoLotSale = batchToUse?.isNoLot === true

    // Nivel de precio de la presentación: elegido en el modal (priceKey) o
    // automático por el nivel asignado al cliente. Solo niveles MANUALES de la
    // presentación (sin derivar por %: el % sobre costo usa el costo por unidad
    // base y daría precios absurdos para un paquete de 20).
    let effectiveKey = priceKey
    if (!effectiveKey && businessSettings?.multiplePricesEnabled
        && selectedCustomer?.priceLevel && selectedCustomer.priceLevel !== 'price1'
        && Number(presentation[selectedCustomer.priceLevel]) > 0) {
      effectiveKey = selectedCustomer.priceLevel
    }
    const levelPen = effectiveKey && effectiveKey !== 'price1' && Number(presentation[effectiveKey]) > 0
      ? Number(presentation[effectiveKey])
      : null

    // ID único por lote + presentación + nivel (nunca se mezclan lotes ni precios)
    const batchKey = isNoLotSale ? '-nolot' : batchToUse ? `-batch-${batchToUse.lotNumber}` : ''
    const cartId = `${product.id}${batchKey}-pres-${presentation.name}${levelPen != null ? `-lvl-${effectiveKey}` : ''}`

    // Pricing de la presentación: anclado al dólar si tiene priceUSD; si no, su precio en soles
    // convertido a la moneda de sesión. Guardamos basePrice (PEN) como fuente de verdad.
    // Regla existente de niveles: el ancla USD solo aplica al precio principal.
    const chosenPen = levelPen != null ? levelPen : (Number(presentation.price) || 0)
    const presUSD = Number(presentation.priceUSD)
    const presAnchor = levelPen == null && Number.isFinite(presUSD) && presUSD > 0
      ? buildUsdAnchoredCartPricing(presUSD, Number(presentation.price) || 0)
      : null
    const presPrice = presAnchor ? presAnchor.price : toSessionCurrency(chosenPen)
    const presBasePrice = presAnchor ? presAnchor.basePrice : chosenPen

    // Crear un item del carrito con la información de la presentación y lote
    const cartItem = {
      ...product,
      cartId,
      price: presPrice,
      basePrice: presBasePrice,
      ...(presAnchor && { fixedPriceUSD: presAnchor.fixedPriceUSD }),
      presentationName: presentation.name,
      presentationFactor: presentation.factor,
      // Unidad SUNAT de la presentación: un saco se factura como SA, no con la
      // unidad base del producto (KGM). Sin unidad propia, hereda la base.
      unit: presentation.unit || product.unit || 'NIU',
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
      toast.error(`Stock insuficiente en ${stockSource}. Se necesita mínimo ${presentation.factor} ${getUnitShortLabel(product.unit || 'NIU')} para 1 ${presentation.name}, disponible: ${parseFloat(availableStock.toFixed(2))}`)
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

  const addVariantToCart = (product, variant, selectedPrice = null, yaConfirmado = false) => {
    // Bloquear si ya se completó una venta
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }

    // Check stock for variant solo si allowNegativeStock es false
    if (variant.stock !== null && variant.stock <= 0 && !permiteSinStock) {
      toast.error('Variante sin stock disponible')
      return
    }
    if (variant.stock !== null && variant.stock <= 0 && preguntarSinStock && !yaConfirmado) {
      pedirConfirmacionSinStock(
        `${product.name} — ${Object.values(variant.attributes || {}).join(' / ') || variant.sku}`,
        `Esa variante no tiene stock en ${selectedWarehouse?.name || 'este almacén'}.`,
        () => addVariantToCart(product, variant, selectedPrice, true)
      )
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
      // Auto-precio por cantidad: mismo atajo que ya tenía el producto sin
      // variantes. Entra con el precio unitario de la variante y el carrito lo
      // reprecia solo cuando la suma del producto alcanza el mínimo.
      if (product.useAutoPriceByQty === true) {
        return addVariantToCart(product, variant, variant.price)
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
      if (variant.stock !== null && existingItem.quantity >= variant.stock && !permiteSinStock) {
        toast.error('No hay suficiente stock disponible para esta variante')
        return
      }
      if (variant.stock !== null && existingItem.quantity >= variant.stock && preguntarSinStock && !yaConfirmado) {
        pedirConfirmacionSinStock(
          `${product.name} — ${Object.values(variant.attributes || {}).join(' / ') || variant.sku}`,
          `Ya tienes ${existingItem.quantity} en el carrito y solo hay ${variant.stock}.`,
          () => addVariantToCart(product, variant, selectedPrice, true)
        )
        return
      }

      // Reprecia el carrito completo: con suma por producto, subir esta variante
      // puede bajar el precio de las otras del mismo producto.
      setCart(applyAutoPricingToCart(
        cart.map(item =>
          item.cartId === variantCartId ? { ...item, quantity: item.quantity + 1 } : item
        )
      ))
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
        // La foto de la VARIANTE si la tiene; si no, la del producto. En el
        // carrito el vendedor está mirando el color que eligió, no el producto
        // genérico — y es la misma imagen que viaja al PDF del comprobante
        // cuando está activa la opción de mostrar imágenes.
        imageUrl: variant.imageUrl || product.imageUrl,
        description: product.description || '', // Descripción del producto para el PDF (opción showProductDescriptionInInvoice)
      }
      // Igual acá: agregar un color nuevo puede completar el mínimo del producto
      // y bajar el precio de los colores que ya estaban en el carrito.
      setCart(applyAutoPricingToCart([...cart, cartItem]))
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

    // En una bonificación lo tecleado es el VALOR REFERENCIAL de lo que se
    // regala (lo que SUNAT necesita declarar); la línea se cobra a 0.
    let price = parseFloat(customProduct.price) || 0
    let bonifRef = 0
    if (customProduct.isBonificacion) {
      // El valor referencial es OBLIGATORIO: SUNAT necesita saber cuánto vale
      // lo que se regala para declarar la transferencia gratuita. Sin él la
      // línea sale con valor 0 y el comprobante REBOTA con error 3105
      // ("El XML debe contener al menos un tributo por línea"), como pasó con
      // la boleta BC03-00000018 del 18-ago-2026.
      if (price <= 0) {
        toast.error('Indica cuánto vale lo que regalas: SUNAT lo exige como valor referencial')
        return
      }
      bonifRef = price
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
    const customIgvRate = effectiveTaxConfig.taxType === 'standard' ? (customProduct.igvRate || 18) : (effectiveTaxConfig.igvRate || 18)
    if (customProduct.addIgv && customProduct.taxAffectation === '10' && !effectiveTaxConfig.igvExempt) {
      // Calcular precio con IGV sin redondear para mantener precisión en los cálculos
      price = price * (1 + customIgvRate / 100)
    }

    // Multi-divisa: el precio pudo ingresarse en S/ o $ (selector del modal).
    // Se ANCLA a la moneda tecleada (igual que los productos del catálogo):
    //  - Tecleado en $  → fixedPriceUSD: el dólar queda fijo; el equivalente en
    //    soles = USD × TC. Al cambiar el TC cambian los soles, NO el dólar ni su
    //    IGV en dólares.
    //  - Tecleado en S/ → ancla en soles (basePrice); en sesión USD el dólar se
    //    deriva del sol y sí varía con el TC.
    // basePrice (PEN exacto) se guarda para que los totales en base no pierdan
    // precisión por redondeo.
    let customBasePrice = null
    let customFixedUSD = null
    if (posMultiCurrencyOn) {
      const entryCcy = customProduct.priceCurrency || currency
      if (entryCcy === 'USD') {
        customFixedUSD = Number(Number(price).toFixed(2))
        customBasePrice = Number(convertToBase(price, 'USD', exchangeRate).toFixed(2))
        price = currency === 'USD' ? customFixedUSD : customBasePrice
      } else {
        customBasePrice = Number(Number(price).toFixed(2))
        price = currency === 'USD'
          ? Number(convertFromBase(customBasePrice, 'USD', exchangeRate).toFixed(2))
          : customBasePrice
      }
    }

    // SUNAT regla 3462: No se permite mezclar tasas de IGV en la misma venta
    if (effectiveTaxConfig.taxType === 'standard' && (customProduct.taxAffectation || '10') === '10') {
      const existingGravado = cart.find(item => (item.taxAffectation || '10') === '10')
      if (existingGravado) {
        const cartRate = existingGravado.igvRate || effectiveTaxConfig.igvRate || 18
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
      taxAffectation: customProduct.isBonificacion ? '30' : resolveItemTaxAffectation(customProduct),
      // Solo incluir igvRate si es standard y gravado
      ...(effectiveTaxConfig.taxType === 'standard' && customProduct.taxAffectation === '10' && !customProduct.isBonificacion && { igvRate: customIgvRate }),
      stock: null, // Productos personalizados no tienen control de stock
      isCustom: true,
      // El costo que escribió el vendedor, congelado en la venta como en
      // cualquier producto del catálogo (ver computeItemCostAtSale).
      ...(Number(customProduct.cost) > 0 && { costAtSale: Number(customProduct.cost) }),
      ...(customProduct.isBonificacion && { isBonificacion: true, ...(bonifRef > 0 && { bonificacionRefPrice: bonifRef }) }),
      // Multi-divisa: PEN exacto del precio para los totales en base (sesión USD)
      ...(customBasePrice != null && customBasePrice > 0 && { basePrice: customBasePrice }),
      // Anclado al dólar cuando se tecleó en $: el USD queda fijo al cambiar el TC
      ...(customFixedUSD != null && customFixedUSD > 0 && { fixedPriceUSD: customFixedUSD }),
    }

    setCart([...cart, customProductItem])
    toast.success('Producto personalizado agregado al carrito')

    // Guardarlo en el catálogo para la PRÓXIMA vez, si el negocio lo pidió.
    //
    // La venta en curso no cambia: el ítem sigue siendo personalizado, sin
    // movimiento de stock. Meterlo dentro de esta venta cambiaría el descuento
    // de stock de una operación que ya estaba bien.
    //
    // Va sin `await` y sin avisar si falla: agregar al carrito no puede
    // quedarse esperando a Firestore ni romperse porque el catálogo no
    // respondió. Ver src/utils/productoRapido.js.
    if (guardarPersonalizados && sePuedeGuardar(customProduct, productsRaw)) {
      const nuevo = productoDesdePersonalizado(customProduct, { igvRate: effectiveTaxConfig.igvRate })
      createProduct(getBusinessId(), nuevo)
        .then(res => {
          if (res?.success) {
            setProductsRaw(prev => [...prev, { id: res.id, ...nuevo }])
            toast.info(`"${nuevo.name}" quedó guardado en tu catálogo`)
          }
        })
        .catch(err => console.error('No se pudo guardar el producto personalizado:', err))
    }

    // Resetear y cerrar modal. La AFECTACIÓN (gravado/exonerado/inafecto) y
    // addIgv se MANTIENEN para el siguiente item: un negocio que vende
    // exonerado agrega muchos items personalizados seguidos y re-seleccionar
    // "Exonerado" cada vez provocaba que un olvido pasara como Gravado
    // (reporte de usuario: 31 items, 1 quedó gravado por S/4 + IGV).
    setCustomProduct(prev => ({
      ...prev,
      name: '',
      price: '',
      cost: '',
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
  /**
   * Reprecia TODO el carrito según el precio automático por cantidad.
   *
   * La cantidad se suma POR PRODUCTO, juntando todas sus variantes: quien lleva
   * 20 rojos + 20 azules + 20 verdes se llevó 60 hojas de papel lustre y le
   * corresponde el mayorista, aunque ningún color por separado llegue al mínimo.
   *
   * El criterio vive en `src/utils/autoPriceByQty.js` porque el catálogo online
   * necesita EXACTAMENTE el mismo: tenía una versión propia que sumaba línea
   * por línea y leía los precios del producto padre, así que el mismo carrito
   * costaba distinto en el mostrador y en la tienda.
   */
  const applyAutoPricingToCart = (cartToPrice) => {
    if (selectedCustomer?.priceLevel) return cartToPrice

    const repreciado = repreciarPorCantidad(cartToPrice, {
      // productsRaw: si el producto está oculto en esta sede pero entró al
      // carrito (cotización/edición), su precio por cantidad sigue aplicando.
      productoPorId: (id) => productsRaw.find(p => p.id === id),
      businessSettings: companySettings,
      excluir: (item) => (
        !item.id || item.isCustom ||
        // Bonificación: precio 0 puesto a propósito. Comparte productId con la
        // línea pagada, así que sin este guard el motor la habría "corregido" al
        // precio del catálogo y el regalo pasaba a cobrarse. Tampoco empuja al
        // siguiente nivel: no son unidades compradas.
        item.isBonificacion || Number(item.price) === 0 ||
        // Precio anclado en dólares: se fijó a propósito y los niveles del
        // catálogo están en soles. Repreciarlo lo convierte en otra moneda.
        !!item.fixedPriceUSD
      ),
    })

    return repreciado.map(({ linea, precio, porSuma }) => {
      if (precio == null) return linea
      if (Number(linea.price) === Number(precio) && !!linea.autoPriceByTotal === porSuma) return linea
      return { ...linea, price: precio, autoPriceByTotal: porSuma }
    })
  }

  /**
   * Cuanto se puede llevar de un item del carrito, y como nombrarlo.
   * Devuelve null cuando no hay nada que topar (item personalizado, sin
   * control de stock, o sin ficha). `tope` ya viene en las unidades en que se
   * cuenta la linea: presentaciones si el producto se vende por paquete.
   */
  const topeDeItem = (item) => {
    if (!item || item.isCustom || item.stock === null) return null
    const info = getCartItemStockInfo(item)
    if (!info) return null
    const { availableStock, stockMsg, factor } = info
    return factor > 1
      ? {
        tope: Math.floor(availableStock / factor),
        donde: stockMsg,
        unidad: item.presentationName || 'presentaciones',
      }
      : { tope: availableStock, donde: stockMsg, unidad: null }
  }

  const updateQuantity = (itemId, change, yaConfirmado = false) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    // Con el ajuste de preguntar, subir la cantidad por encima del stock se
    // frena aca y decide el cajero. Tiene que ser ANTES del setCart: la
    // validacion de mas abajo vive dentro de un .map(), que es una
    // transformacion pura y no puede abrir un modal.
    if (change > 0 && preguntarSinStock && !yaConfirmado) {
      const item = cart.find(i => (i.cartId || i.id) === itemId)
      const limite = topeDeItem(item)
      const nueva = (parseFloat(item?.quantity) || 0) + change
      if (limite && nueva > limite.tope) {
        pedirConfirmacionSinStock(
          item.name,
          limite.unidad
            ? `Solo alcanza para ${limite.tope} ${limite.unidad} en ${limite.donde}.`
            : `Solo hay ${parseFloat(limite.tope.toFixed(2))} en ${limite.donde}.`,
          () => updateQuantity(itemId, change, true)
        )
        return
      }
    }

    // El repricing va sobre el carrito COMPLETO: con suma por producto,
    // cambiar una variante puede mover el precio de las otras.
    setCart(applyAutoPricingToCart(
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
            if (item.stock !== null && !item.isCustom && !permiteSinStock) {
              const info = getCartItemStockInfo(item)
              if (info) {
                const { availableStock, stockMsg, factor } = info
                if (factor > 1) {
                  const maxPresentations = Math.floor(availableStock / factor)
                  if (newQuantity > maxPresentations) {
                    const presName = item.presentationName || 'presentaciones'
                    toast.error(`Máximo ${maxPresentations} ${presName} en ${stockMsg}. Para más, selecciona otro lote.`)
                    return item
                  }
                } else if (newQuantity > availableStock) {
                  toast.error(`Stock insuficiente en ${stockMsg}. Disponible: ${parseFloat(availableStock.toFixed(2))}`)
                  return item
                }
              }
            }

            // El precio lo pone applyAutoPricingToCart sobre el carrito ya
            // actualizado; acá solo se resuelve la cantidad.
            return { ...item, quantity: newQuantity }
          }
          return item
        })
        .filter(item => item.quantity > 0)
    ))
  }

  // Función para establecer cantidad directamente (para productos por peso o input manual)
  const setQuantityDirectly = (itemId, newQuantity, yaConfirmado = false) => {
    if (saleCompleted) {
      toast.warning('Ya emitiste esta venta. Presiona "Nueva Venta" para iniciar otra.')
      return
    }
    // Mismo criterio que el boton +: si la cantidad tecleada se pasa del
    // stock, se pregunta en vez de rechazarla con un aviso que se va solo.
    if (preguntarSinStock && !yaConfirmado) {
      const pedida = parseFloat(newQuantity)
      if (Number.isFinite(pedida) && pedida > 0) {
        const item = cart.find(i => (i.cartId || i.id) === itemId)
        const limite = topeDeItem(item)
        if (limite && pedida > limite.tope) {
          pedirConfirmacionSinStock(
            item.name,
            limite.unidad
              ? `Solo alcanza para ${limite.tope} ${limite.unidad} en ${limite.donde}.`
              : `Solo hay ${parseFloat(limite.tope.toFixed(2))} en ${limite.donde}.`,
            () => setQuantityDirectly(itemId, newQuantity, true)
          )
          return
        }
      }
    }
    // Permitir string vacío o valores intermedios como "0", "0." mientras el usuario escribe
    const rawValue = newQuantity === '' || newQuantity === '0' || newQuantity === '0.' ? newQuantity : newQuantity
    const quantity = parseFloat(rawValue)
    if (rawValue !== '' && rawValue !== '0' && rawValue !== '0.' && (isNaN(quantity) || quantity < 0)) return

    setCart(applyAutoPricingToCart(
      cart
        .map(item => {
          const matchId = item.cartId || item.id
          if (matchId === itemId) {
            // Verificar stock del almacén seleccionado (solo para productos no personalizados)
            // Si allowNegativeStock está habilitado, permitir venta sin stock
            if (item.stock !== null && !item.isCustom && quantity > 0 && !permiteSinStock) {
              const info = getCartItemStockInfo(item)
              if (info) {
                const { availableStock, stockMsg, factor } = info
                if (factor > 1) {
                  const maxPresentations = Math.floor(availableStock / factor)
                  if (quantity > maxPresentations) {
                    const presName = item.presentationName || 'presentaciones'
                    toast.error(`Máximo ${maxPresentations} ${presName} en ${stockMsg}. Para más, selecciona otro lote.`)
                    return item
                  }
                } else if (quantity > availableStock) {
                  toast.error(`Stock insuficiente en ${stockMsg}. Disponible: ${parseFloat(availableStock.toFixed(2))}`)
                  return item
                }
              }
            }
            // El precio lo pone applyAutoPricingToCart sobre el carrito completo.
            // Preservar strings decimales PARCIALES mientras se escribe: "0.0",
            // "0.20", etc. Antes, al teclear "0.0" (camino a 0.025) se
            // convertía a número 0 y el campo colapsaba a "0" — imposible
            // escribir cantidades con cero tras el punto ("no me deja poner
            // 0.025 millar"). Se conserva el string crudo cuando su
            // representación numérica canónica difiere; el blur lo normaliza.
            const isPartialDecimal = typeof rawValue === 'string'
              && /^\d*\.\d*$/.test(rawValue)
              && String(parseFloat(rawValue)) !== rawValue
            const finalQty = rawValue === '' || rawValue === '0' || rawValue === '0.' || isPartialDecimal ? rawValue : quantity
            return { ...item, quantity: finalQty }
          }
          return item
        })
    ))
  }

  // Al salir del input, restaurar a 1 si quedó vacío o en 0. Si quedó un
  // string decimal parcial válido ("0.20"), normalizarlo a número para que
  // el carrito nunca guarde strings (la venta/XML esperan números).
  const handleQuantityBlur = (itemId, currentQuantity) => {
    const qty = parseFloat(currentQuantity)
    if (!currentQuantity || currentQuantity === '' || currentQuantity === '0' || currentQuantity === '0.' || isNaN(qty) || qty <= 0) {
      setQuantityDirectly(itemId, 1)
    } else if (typeof currentQuantity === 'string') {
      setQuantityDirectly(itemId, qty)
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

    // El 0 SÍ es válido: poner en cero un producto del carrito es regalarlo.
    // Se convierte en bonificación y el precio que TENÍA queda como valor
    // referencial para SUNAT (ver bonificacionParaSunat). Antes se rechazaba
    // con "El precio debe ser mayor a 0" y no había forma de regalar un
    // producto del catálogo desde el carrito (reporte 18-ago-2026).
    if (isNaN(newPrice) || newPrice < 0) {
      toast.error('El precio no puede ser negativo')
      return
    }
    const esRegalo = newPrice === 0

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
        const base = { ...item, price: newPrice, basePrice: newBasePrice, fixedPriceUSD: null }
        const yaEtiquetado = (item.name || '').includes('(BONIFICACIÓN)')

        if (esRegalo) {
          // Valor referencial = lo que el producto valía antes de regalarlo.
          // Si ya era bonificación se conserva el que tenía (no se pisa con 0).
          const ref = Number(item.bonificacionRefPrice) > 0
            ? Number(item.bonificacionRefPrice)
            : (Number(item.price) || Number(item.basePrice) || 0)
          return {
            ...base,
            isBonificacion: true,
            taxAffectation: '30',
            ...(ref > 0 && { bonificacionRefPrice: ref }),
            name: yaEtiquetado ? item.name : `${item.name} (BONIFICACIÓN)`,
          }
        }

        // Volver a ponerle precio deshace el regalo: se limpia la marca, la
        // etiqueta del nombre y el valor referencial.
        if (item.isBonificacion) {
          const limpio = { ...base, isBonificacion: false, bonificacionRefPrice: null, name: (item.name || '').replace(' (BONIFICACIÓN)', '') }
          limpio.taxAffectation = businessSettings?.defaultTaxAffectation || '10'
          return limpio
        }
        return base
      }
      return item
    }))

    setEditingPriceItemId(null)
    setEditingPrice('')
    setEditingPriceWithoutIgv(false)
    toast.success(esRegalo ? 'Producto marcado como bonificación (regalo)' : 'Precio actualizado')
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
        // Si tenía una promo programada, el número del cajero manda: la promo
        // se suelta y deja de recalcular esta línea.
        return { ...item, itemDiscount: validDiscount, promoPercent: null, promoName: null }
      }
      return item
    }))
  }

  // ── Descuentos programados (Promociones > Descuentos) ──
  // Un solo efecto central: evalúa cada línea UNA vez al entrar al carrito
  // (promoEvaluated) y, para las que ganaron promo, mantiene el monto al día
  // cuando cambia la cantidad. No toca addToCart: cualquier camino por el que
  // entre un producto (búsqueda, escáner, variantes, presentaciones) pasa por
  // aquí. El descuento manual del cajero (updateItemDiscount) suelta la promo.
  useEffect(() => {
    if (!scheduledPromos.length || cart.length === 0 || saleCompleted) return
    let cambio = false
    const ahora = new Date()
    const nuevo = cart.map(item => {
      // Evaluación inicial: solo líneas nuevas, sin descuento previo (si el
      // producto ya vino con descuento de otra pantalla, se respeta).
      if (!item.promoEvaluated) {
        // CANAL_POS: una promo marcada "solo catálogo" no debe aplicarse en la caja.
        const promo = (item.itemDiscount || 0) > 0 ? null : promoParaProducto(item, scheduledPromos, ahora, CANAL_POS)
        cambio = true
        if (!promo) return { ...item, promoEvaluated: true }
        const monto = Math.min(
          Math.round(item.price * item.quantity * (promo.percent / 100) * 100) / 100,
          item.price * item.quantity
        )
        return { ...item, promoEvaluated: true, promoPercent: promo.percent, promoName: promo.name, itemDiscount: monto }
      }
      // Mantenimiento: la cantidad cambió y la línea sigue en promo.
      if (item.promoPercent) {
        const esperado = Math.min(
          Math.round(item.price * item.quantity * (item.promoPercent / 100) * 100) / 100,
          item.price * item.quantity
        )
        if (Math.abs((item.itemDiscount || 0) - esperado) > 0.005) {
          cambio = true
          return { ...item, itemDiscount: esperado }
        }
      }
      return item
    })
    if (cambio) setCart(nuevo)
  }, [cart, scheduledPromos, saleCompleted])

  // Avisar de los faltantes en cuanto se pueda, para que el vendedor no se entere
  // recién al cobrar. Corre una sola vez por carga: el catálogo llega después que
  // el carrito, así que hay que esperar a tenerlo para poder comparar.
  useEffect(() => {
    if (!pendingStockCheckRef.current) return
    if (cart.length === 0 || products.length === 0) return
    if (permiteSinStock) return

    const faltantes = getStockShortages()
    if (faltantes.length === 0) {
      avisoFaltantesRef.current = ''
      return
    }

    const detalle = faltantes
      .map(f => `${f.name} (pide ${f.pedido}${f.unidad ? ` ${f.unidad}` : ''}, hay ${f.disponible})`)
      .join(', ')
    // Solo avisar cuando la lista CAMBIA: si no, cada tecla en una cantidad
    // dispararía el mismo mensaje otra vez.
    if (detalle === avisoFaltantesRef.current) return
    avisoFaltantesRef.current = detalle
    toast.error(`Sin stock suficiente para: ${detalle}. Ajusta las cantidades antes de cobrar.`, 9000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, products, permiteSinStock, selectedWarehouse?.id])

  const clearCart = () => {
    setCart([])
    setSelectedCustomer(null)
    // Los días de recordatorio que se pisaron a mano valen para ESA venta. Sin
    // esto, el "15 días" que pidió un cliente se le aplicaba al siguiente.
    setDiasRecordatorio({})
    // Vale para ESA venta: el cliente que pidió POR CONSUMO no decide por el
    // siguiente. Sin esto la casilla quedaba marcada toda la jornada.
    setPorConsumoVenta(false)
    // El cupón vale para UNA venta: la siguiente arranca sin él.
    setAppliedCoupon(null)
    setCouponInput('')
    // El certificado validado tambien se suelta: si quedo saldo, se vuelve a
    // validar en la proxima venta (el saldo vive en su doc, no aca).
    setAppliedGiftCert(null)
    setGiftCertInput('')
    // Un canje de fidelidad pendiente muere con la venta abandonada: los
    // sellos nunca se descontaron, el cliente no pierde nada.
    setLoyaltyRedemption(null)
    // La afectación elegida vale SOLO para esa venta. Si quedara pegada, la
    // siguiente saldría gravada (o exonerada) sin que nadie lo pidiera, que es
    // justo el error que esta opción existe para evitar.
    setSaleTaxMode('auto')
    userChangedDocTypeRef.current = false
    // El carrito precargado quedó atrás: la siguiente venta se arma a mano y ya
    // pasa por las validaciones de agregar.
    pendingStockCheckRef.current = false
    // Si se abandona un folio sin facturarlo, la siguiente venta no debe salir
    // enlazada a esa reserva.
    pendingFolioReservationIdRef.current = null
    // Soltar también la ORDEN DE MESA/PEDIDO cargada. Sin esto, "Limpiar" vaciaba
    // el carrito pero dejaba pendingOrderId apuntando a la mesa anterior: la
    // siguiente venta —armada a mano para OTRO cliente— sellaba como facturada a
    // la mesa equivocada y con un comprobante que no era el suyo. Pasó en
    // producción (Mandil, 19-ago-2026: orden de S/62 de MESA 4 quedó apuntando a
    // una nota de S/131 de la barra, que además anularon — el efectivo sobraba
    // en caja y la venta no salía en ningún reporte).
    setPendingOrderId(null)
    setMarkOrderPaidOnComplete(false)
    setMarkOnlineOrderCompleteOnSale(false)
    setTableData(null)
    onlineOrderLoadedRef.current = false
    orderLoadedRef.current = false
    tableLoadedRef.current = false
    avisoFaltantesRef.current = ''
    // Resetear al default del negocio, pero respetando los tipos permitidos del
    // usuario logueado. Si el default no está en allowedDocumentTypes (típico en
    // sub-usuarios con permisos restringidos), caer al primero permitido — así
    // el state nunca queda en un valor sin <option> en el <select>.
    const def = companySettings?.defaultDocumentType || 'boleta'
    // 'none' = sin default: para la siguiente venta el cajero vuelve a elegir.
    if (def === 'none') {
      setDocumentType('')
    } else {
      setDocumentType(resolveDocumentType(def, docTypeOpts))
    }
    setOrderType('takeaway')
    setSendToKitchen(true)
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
      vehicleYear: '', licenseNumber: '', propertyCard: '',
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
    setShowDiscountSection(false)
    // Reset forma de pago
    setPaymentType('contado')
    setPaymentDueDate('')
    setPaymentInstallments([])
    // Reset campos de referencia
    setGuideNumber('')
    setPurchaseOrderNumber('')
    setOrderNumber('')
    // Reset anticipos
    setIsAdvanceInvoice(false)
    setDeductAdvances(false)
    setAdvancesList([])
    setCandidateAdvances([])
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

      // Si el formulario todavía tiene los datos de OTRO cliente (el que se
      // atendió antes), NO deben heredarse: así es como la dirección y la
      // mascota del anterior terminaban pegadas a la ficha del siguiente
      // —y guardadas de verdad, porque al cobrar se hace upsert del cliente.
      const veniaOtroCliente = !!selectedCustomer && selectedCustomer.documentNumber !== docNumber
      const conservar = (valorPrevio) => (veniaOtroCliente ? '' : (valorPrevio || ''))

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
              phone: existingCustomer.phone || conservar(prev.phone),
              email: existingCustomer.email || conservar(prev.email),
              address: existingCustomer.address || conservar(prev.address),
              // Mismo criterio que el desplegable (utils/posCustomerData): acá la
              // lista estaba escrita a mano y se quedó sin los campos de
              // transporte, que se agregaron después.
              ...camposExtraConRespaldo(existingCustomer, prev, conservar),
              // Veterinaria: traer la mascota del cliente local (si la tiene).
              petName: getPrimaryPet(existingCustomer)?.name || existingCustomer.petName || conservar(prev.petName),
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
              phone: existingCustomer.phone || conservar(prev.phone),
              email: existingCustomer.email || conservar(prev.email),
              // Mismo criterio que el desplegable (utils/posCustomerData): acá la
              // lista estaba escrita a mano y se quedó sin los campos de
              // transporte, que se agregaron después.
              ...camposExtraConRespaldo(existingCustomer, prev, conservar),
              // Veterinaria: traer la mascota del cliente local (si la tiene).
              petName: getPrimaryPet(existingCustomer)?.name || existingCustomer.petName || conservar(prev.petName),
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
            name: existingCustomer.name || conservar(prev.name),
            businessName: existingCustomer.businessName || conservar(prev.businessName),
            address: existingCustomer.address || conservar(prev.address),
            email: existingCustomer.email || conservar(prev.email),
            phone: existingCustomer.phone || conservar(prev.phone),
            ...camposExtraConRespaldo(existingCustomer, prev, conservar),
            // Sin mascota heredada del cliente anterior.
            petName: getPrimaryPet(existingCustomer)?.name || existingCustomer.petName || conservar(prev.petName),
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
      // Anticipos también son factura-only
      setIsAdvanceInvoice(false)
      setDeductAdvances(false)
      setAdvancesList([])
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
    setAppliedCoupon(null)
  }

  // ── Cupones (Promociones > Cupones) ──
  // Un cupón NO es un descuento nuevo: solo llena el descuento global con su
  // valor. Toda la matemática (subtotal, IGV, XML de SUNAT) es la misma que la
  // del descuento manual, que ya está probada. Con cupón puesto los campos
  // manuales se bloquean: el descuento "pertenece" al cupón hasta quitarlo.
  const aplicarCupon = async () => {
    const codigo = couponInput.trim()
    if (!codigo) return
    // El descuento global es UNO: si ya lo llena el premio de fidelidad
    // canjeado, el cupon no puede pisarlo (y viceversa, ver aplicarPremioFidelidad).
    if (loyaltyRedemption?.type === 'discount') {
      toast.error('Ya hay un premio de fidelidad aplicado como descuento en esta venta')
      return
    }
    setValidatingCoupon(true)
    try {
      const { validateCoupon } = await import('@/services/couponService')
      const res = await validateCoupon(idDeFidelizacion(companySettings, getBusinessId()), codigo)
      if (!res.success) { toast.error(res.error); return }
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      if (res.coupon.type === 'percent') {
        handleDiscountPercentageChange(String(res.coupon.value))
      } else {
        // Un monto fijo mayor que la venta se recorta: el total nunca baja de 0.
        handleDiscountAmountChange(String(Math.min(res.coupon.value, subtotal).toFixed(2)))
      }
      setAppliedCoupon(res.coupon)
      setCouponInput('')
      toast.success(`Cupón ${res.coupon.id} aplicado`)
    } finally {
      setValidatingCoupon(false)
    }
  }

  const quitarCupon = () => {
    setAppliedCoupon(null)
    setDiscountAmount('')
    setDiscountPercentage('')
  }

  // ── Certificados de regalo (Promociones > Certificados) ──
  // A diferencia del cupon (que es un DESCUENTO), el certificado es un MEDIO
  // DE PAGO: no toca el total, paga parte de el. Validar el codigo habilita
  // el metodo "Certificado de regalo" en los botones de pago.
  const aplicarCertificado = async () => {
    const codigo = giftCertInput.trim()
    if (!codigo) return
    setValidatingGiftCert(true)
    try {
      const { validateGiftCertificate } = await import('@/services/giftCertificateService')
      const res = await validateGiftCertificate(getBusinessId(), codigo)
      if (!res.success) { toast.error(res.error); return }
      setAppliedGiftCert(res.data)
      setGiftCertInput('')
      toast.success(`Certificado ${res.data.id}: S/ ${Number(res.data.balance).toFixed(2)} disponibles`)
    } finally {
      setValidatingGiftCert(false)
    }
  }

  // ── Canje del premio de fidelización (Clientes > Fidelización) ──
  // El premio estructurado se APLICA a la venta en curso según su tipo:
  // producto gratis = línea de bonificación (precio 0, inafecto, mismo riel
  // que las cortesías); producto a precio especial = línea con ese precio;
  // descuento = llena el descuento global (mismo riel que el cupón). El
  // descuento de sellos ocurre después de guardar la venta.
  const aplicarPremioFidelidad = () => {
    const cfg = companySettings?.loyaltyConfig || {}
    const tipo = cfg.rewardType || 'text'
    const etiqueta = cfg.reward || 'Premio de fidelidad'

    if (tipo === 'product' || tipo === 'product_discount') {
      const prod = products.find(p => p.id === cfg.rewardProductId)
      if (!prod) {
        toast.error('El producto del premio ya no está en el catálogo. Corrígelo en Clientes > Fidelización.')
        return
      }
      const esGratis = tipo === 'product'
      const precioEspecial = Number(cfg.rewardSpecialPrice) || 0
      setCart(prev => ([...prev, {
        ...prod,
        cartId: `loyalty_${Date.now()}`,
        quantity: 1,
        price: esGratis ? 0 : precioEspecial,
        basePrice: esGratis ? 0 : precioEspecial,
        ...(esGratis && {
          isBonificacion: true,
          taxAffectation: '30',
          // Valor referencial para SUNAT: lo que el producto cuesta normalmente.
          ...((Number(prod.price) || 0) > 0 && { bonificacionRefPrice: Number(prod.price) }),
        }),
        name: esGratis ? `${prod.name} (BONIFICACIÓN)` : `${prod.name} (PREMIO FIDELIDAD)`,
        isLoyaltyReward: true,
      }]))
    } else if (tipo === 'discount') {
      if (appliedCoupon) {
        toast.error('Quita el cupón antes de canjear el descuento del premio')
        return
      }
      if (cfg.rewardDiscountType === 'amount') {
        handleDiscountAmountChange(String(Number(cfg.rewardDiscountValue) || 0))
      } else {
        handleDiscountPercentageChange(String(Number(cfg.rewardDiscountValue) || 0))
      }
    }

    setLoyaltyRedemption({
      type: tipo,
      label: etiqueta,
      phone: customerData?.phone || '',
      discountType: cfg.rewardDiscountType || 'percent',
    })
    toast.success('Premio aplicado. Los sellos se descuentan al cobrar la venta.')
  }

  const cancelarPremioFidelidad = () => {
    if (!loyaltyRedemption) return
    if (loyaltyRedemption.type === 'product' || loyaltyRedemption.type === 'product_discount') {
      setCart(prev => prev.filter(i => !i.isLoyaltyReward))
    } else if (loyaltyRedemption.type === 'discount') {
      handleClearDiscount()
    }
    setLoyaltyRedemption(null)
  }

  const quitarCertificado = () => {
    setAppliedGiftCert(null)
    // Si estaba elegido como metodo de pago, soltar esas filas para no dejar
    // un pago apuntando a un certificado que ya no esta.
    setPayments(prev => {
      const rest = prev.filter(pg => pg.method !== 'GIFT_CERT')
      return rest.length > 0 ? rest : [{ method: '', amount: '' }]
    })
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
  // ¿Esta venta sale POR CONSUMO? Solo en restaurante, con el módulo activado
  // en Configuración y la casilla marcada al cobrar.
  const porConsumoActivo = businessMode === 'restaurant' && porConsumoConfig.enabled && porConsumoVenta

  const amounts = React.useMemo(() => {
    // Calcular total de descuentos por ítem
    const totalItemDiscounts = effectiveCart.reduce((sum, item) => sum + (item.itemDiscount || 0), 0)

    // Usar calculateMixedInvoiceAmounts para manejar productos con diferentes taxAffectation
    // Aplicamos el precio efectivo considerando el descuento por ítem
    const lineasDelCarrito = effectiveCart.map(item => {
      const lineTotal = item.price * item.quantity
      const itemDiscount = item.itemDiscount || 0
      // Calcular precio efectivo por unidad después del descuento del ítem
      const effectivePrice = itemDiscount > 0
        ? (lineTotal - itemDiscount) / item.quantity
        : item.price
      return {
        price: effectivePrice,
        quantity: item.quantity,
        taxAffectation: resolveItemTaxAffectation(item),
        igvRate: resolveItemIgvRate(item),
      }
    })

    // POR CONSUMO: los totales se calculan sobre la línea COLAPSADA, no sobre
    // los platos. El total a pagar es idéntico —el colapso lo conserva exacto—,
    // pero la base y el IGV de un documento de una sola línea son los de esa
    // línea. Sin esto el ticket imprimiría un IGV y el visualizador de SUNAT
    // mostraría otro con uno o dos céntimos de diferencia: el sistema redondea
    // por línea justamente para que XML y ticket cuadren (ver peruUtils).
    const lineasParaTotales = porConsumoActivo
      ? lineasPorConsumo(lineasDelCarrito, {
          igvRate: effectiveTaxConfig.igvRate,
          texto: porConsumoConfig.texto,
        }).map(l => ({
          price: l.unitPrice,
          quantity: l.quantity,
          taxAffectation: l.taxAffectation,
          igvRate: l.igvRate,
        }))
      : lineasDelCarrito

    const baseAmounts = calculateMixedInvoiceAmounts(
      lineasParaTotales,
      effectiveTaxConfig.igvRate
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
            taxAffectation: resolveItemTaxAffectation(item),
            igvRate: resolveItemIgvRate(item),
          }
        }),
        effectiveTaxConfig.igvRate
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
  }, [effectiveCart, effectiveTaxConfig, resolveItemTaxAffectation, resolveItemIgvRate, discountAmount, recargoConsumoConfig, businessMode, currency, exchangeRate, porConsumoActivo, porConsumoConfig.texto])

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

  // Anticipos aplicados a esta factura: suma de los anticipos seleccionados,
  // acotada al total de la venta (no se puede deducir más de lo que se factura).
  /**
   * Detracción de esta venta, con sus dos caras.
   *
   * `pen` es lo que se DEPOSITA en el Banco de la Nación —siempre soles, siempre
   * entero— y `doc` su equivalente en la moneda del comprobante, que es lo que
   * se resta del total para llegar al neto. En una venta en soles los dos son
   * iguales.
   *
   * Es la misma cuenta que se guarda en el comprobante: un solo lugar para que
   * la pantalla y el documento no puedan decir cosas distintas.
   */
  const detraccionActual = React.useMemo(() => {
    if (!hasDetraction || !detractionType) return null
    const tasa = DETRACTION_TYPES.find(t => t.code === detractionType)?.rate || 0
    const tc = currency === 'USD' ? (Number(exchangeRate) || 1) : 1
    const { pen, doc } = calcularDetraccion(amounts.total, tc, tasa)
    return { tasa, pen, doc, neto: Number((amounts.total - doc).toFixed(2)) }
  }, [hasDetraction, detractionType, amounts.total, currency, exchangeRate])

  const advancesApplied = React.useMemo(() => {
    if (documentType !== 'factura' || !deductAdvances) return 0
    const sum = advancesList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
    return Math.min(Math.round(sum * 100) / 100, amounts.total)
  }, [documentType, deductAdvances, advancesList, amounts.total])

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
      // Con anticipos deducidos, el cliente solo paga el SALDO
      amountToPay = Math.round((amounts.total - advancesApplied) * 100) / 100
    }

    const remaining = amountToPay - totalPaid
    return { totalPaid, remaining, amountToPay }
  }, [payments, amounts.total, enablePartialPayment, partialPaymentAmount, advancesApplied])

  const { totalPaid, remaining, amountToPay } = paymentTotals

  // Cargar las facturas de anticipo del cliente (para deducirlas en la factura final).
  // Solo califican: facturas marcadas como anticipo (0104), ACEPTADAS por SUNAT
  // (regla 3218: el comprobante referenciado debe existir aceptado) y que no se
  // hayan usado ya en otra factura final.
  const loadCandidateAdvances = async () => {
    const customerRuc = (customerData.documentNumber || '').trim()
    if (!/^\d{11}$/.test(customerRuc)) {
      setCandidateAdvances([])
      return
    }
    setLoadingAdvances(true)
    try {
      const q = query(
        collection(db, 'businesses', getBusinessId(), 'invoices'),
        where('customer.documentNumber', '==', customerRuc),
        fsLimit(100)
      )
      const snap = await getDocs(q)
      const candidates = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(inv =>
          inv.isAdvancePayment === true &&
          inv.documentType === 'factura' &&
          inv.sunatStatus === 'accepted' &&
          !inv.advanceUsedIn &&
          inv.status !== 'cancelled' && inv.status !== 'voided'
        )
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setCandidateAdvances(candidates)
    } catch (error) {
      console.error('Error al cargar facturas de anticipo:', error)
      setCandidateAdvances([])
    } finally {
      setLoadingAdvances(false)
    }
  }

  // Alterna un anticipo candidato en la lista a deducir
  const toggleAdvance = (inv) => {
    setAdvancesList(prev => {
      const exists = prev.find(a => a.invoiceId === inv.id)
      if (exists) return prev.filter(a => a.invoiceId !== inv.id)
      return [...prev, { invoiceId: inv.id, fullNumber: inv.number, amount: inv.total }]
    })
  }

  // ===== Vencimiento y cuotas en notas de venta al crédito (opcional) =====
  // Reusa paymentDueDate/paymentInstallments (los mismos campos de la factura),
  // pero las cuotas van contra el SALDO pendiente, no contra el total.
  const notaVentaCreditTermsOn =
    documentType === 'nota_venta' &&
    enablePartialPayment &&
    companySettings?.notaVentaCreditTerms === true
  const notaVentaBalance = React.useMemo(() => {
    if (!enablePartialPayment) return 0
    const partial = parseFloat(partialPaymentAmount) || 0
    return Math.max(0, (amounts.total || 0) - partial)
  }, [enablePartialPayment, partialPaymentAmount, amounts.total])
  const installmentsTotal = React.useMemo(
    () => paymentInstallments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
    [paymentInstallments]
  )

  // Al desmarcar el crédito (o cambiar de tipo de documento) limpiar los términos
  // para no arrastrar fecha/cuotas a una venta al contado.
  useEffect(() => {
    if (!notaVentaCreditTermsOn && documentType === 'nota_venta') {
      if (paymentDueDate) setPaymentDueDate('')
      if (paymentInstallments.length > 0) setPaymentInstallments([])
    }
  }, [notaVentaCreditTermsOn, documentType])

  // Al activar el crédito con términos, sugerir vencimiento a 30 días.
  useEffect(() => {
    if (notaVentaCreditTermsOn && !paymentDueDate) {
      const d = new Date()
      d.setDate(d.getDate() + 30)
      setPaymentDueDate(getLocalDateString(d))
    }
  }, [notaVentaCreditTermsOn])

  // Índice de búsqueda de clientes: se arma UNA vez por cambio de cartera, no
  // en cada tecla. Mismo motor que la página de Clientes (buildSearchHaystack
  // + matchesPrebuilt): multi-palabra, sin tildes, insensible a mayúsculas.
  //
  // El CELULAR entra en tres formas porque cada quien lo guarda distinto: tal
  // como está en la ficha ("987 654 321"), solo dígitos (para quien lo teclea
  // de corrido) y con prefijo 51 (para quien pega un número de WhatsApp).
  // Es la vía más rápida de encontrar a un cliente de fidelización: ahí el
  // teléfono ES la llave de su tarjeta.
  const customerSearchIndex = React.useMemo(() => {
    const map = new Map()
    for (const c of customers) {
      const digitos = String(c.phone || '').replace(/\D/g, '')
      map.set(c.id, buildSearchHaystack(
        c.name,
        c.businessName,
        c.documentNumber,
        c.phone,
        digitos,
        digitos.length === 9 ? `51${digitos}` : '',
        // Colegios: encontrar al apoderado por el nombre del alumno
        c.studentName
      ))
    }
    return map
  }, [customers])

  // Filtrar clientes (optimizado con useMemo)
  const filteredCustomers = React.useMemo(() => {
    if (!customerSearchTerm) return []

    return customers.filter(c => {
      // Filtrar según tipo de documento
      const matchesDocType = documentType === 'factura'
        ? c.documentNumber?.length === 11
        : true

      return matchesDocType && matchesPrebuilt(customerSearchTerm, customerSearchIndex.get(c.id) || '')
    })
  }, [customers, customerSearchTerm, documentType, customerSearchIndex])

  // Actualizar método de pago
  const handlePaymentMethodChange = (index, method) => {
    const newPayments = [...payments]
    newPayments[index].method = method

    // Saldo a favor / certificado: el monto no puede exceder lo disponible.
    const creditCap = method === 'CREDIT_NOTE' ? customerStoreCredit.total
      : method === 'GIFT_CERT' ? (appliedGiftCert?.balance || 0)
      : Infinity

    // Auto-fill del monto. Para UN solo pago NO tocamos el monto acá (evita el
    // parpadeo del botón): solo marcamos para que un layout-effect lo complete con
    // el total YA recalculado (incluye el recargo por tarjeta), antes del paint.
    // Para pagos múltiples mantenemos el autocompletado con el saldo.
    // Excepción: saldo a favor se autocompleta acá con el tope (no por el effect).
    if (method === 'CREDIT_NOTE' || method === 'GIFT_CERT') {
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
    // Con anticipos deducidos, el monto a autollenar es el SALDO a pagar
    const autoFillTotal = Math.round((amounts.total - advancesApplied) * 100) / 100
    if (!(autoFillTotal > 0)) return
    const next = autoFillTotal.toString()
    setPayments(prev => {
      if (prev.length !== 1 || prev[0].amount === next) return prev
      return [{ ...prev[0], amount: next }]
    })
  }, [amounts.total, payments, advancesApplied])

  // Actualizar monto de pago
  const handlePaymentAmountChange = (index, amount) => {
    const newPayments = [...payments]
    // Saldo a favor / certificado: clamp al disponible.
    if (newPayments[index].method === 'CREDIT_NOTE') {
      const num = parseFloat(amount)
      if (!Number.isNaN(num) && num > customerStoreCredit.total) {
        amount = customerStoreCredit.total.toString()
      }
    }
    if (newPayments[index].method === 'GIFT_CERT') {
      const num = parseFloat(amount)
      const cap = appliedGiftCert?.balance || 0
      if (!Number.isNaN(num) && num > cap) {
        amount = cap.toString()
      }
    }
    newPayments[index].amount = amount
    setPayments(newPayments)
  }

  // Agregar un nuevo método de pago
  const handleAddPaymentMethod = () => {
    // Con anticipos deducidos, lo que se reparte entre métodos es el SALDO
    const netTotal = Math.round((amounts.total - advancesApplied) * 100) / 100
    // Si solo hay un método con todo el monto, dividir el total entre los métodos
    if (payments.length === 1 && parseFloat(payments[0].amount) === netTotal) {
      const halfAmount = (netTotal / 2).toFixed(2)
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
  // Esto cubre: recargo al consumo que carga después, cambios de cantidad, descuentos,
  // y anticipos deducidos (el cliente solo paga el SALDO).
  useEffect(() => {
    if (saleCompleted) return
    const netTotal = Math.round((amounts.total - advancesApplied) * 100) / 100
    setPayments(prev => {
      if (prev.length !== 1 || !prev[0].method) return prev
      // Saldo a favor: capear al disponible (no llenar con el total completo).
      const cap = prev[0].method === 'CREDIT_NOTE'
        ? Math.min(netTotal, customerStoreCredit.total)
        : prev[0].method === 'GIFT_CERT'
        ? Math.min(netTotal, appliedGiftCert?.balance || 0)
        : netTotal
      const newAmount = cap > 0 ? cap.toString() : ''
      if (prev[0].amount === newAmount) return prev
      return [{ ...prev[0], amount: newAmount }]
    })
  }, [amounts.total, saleCompleted, customerStoreCredit.total, appliedGiftCert, advancesApplied])

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

    /**
     * Revisión previa de lo que SUNAT rechazaría.
     *
     * Se hace ACÁ y no después de emitir: un rechazo consume el correlativo,
     * obliga a rehacer la venta y el negocio se entera horas más tarde, con el
     * cliente ya en la calle. Dos segundos antes valen más que la corrección
     * después. Ver src/utils/sunatPreflight.js.
     */
    const lineasARevisar = cart.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      taxAffectation: resolveItemTaxAffectation(item),
      igvRate: resolveItemIgvRate(item),
      isBonificacion: item.isBonificacion,
      itemDiscount: item.itemDiscount,
      ...referenciaDeRegalo(item),
    }))
    const revision = revisarAntesDeEmitir({
      documentType,
      // El nombre que se va a guardar, con el mismo respaldo que usa el
      // comprobante: si no hay nada, la boleta sale a "Cliente General".
      customer: {
        name: customerData.name || customerData.businessName || 'Cliente General',
        businessName: customerData.businessName || customerData.name || '',
      },
      // POR CONSUMO: se revisa lo que de VERDAD va a SUNAT. Un plato de
      // cortesía a precio 0 queda dentro de la línea única, así que no puede
      // bloquear la venta por algo que el comprobante nunca va a declarar.
      items: porConsumoActivo
        ? lineasPorConsumo(lineasARevisar, {
            igvRate: effectiveTaxConfig.igvRate,
            texto: porConsumoConfig.texto,
          })
        : lineasARevisar,
    })
    if (revision.errores.length > 0) {
      toast.error(`SUNAT rechazaría este comprobante:

${textoDeErrores(revision.errores)}`, 9000)
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

    // Barrera de FECHA DE EMISIÓN. Los `min`/`max` del campo no restringen nada
    // —la fecha se puede teclear a mano—, así que la revisión de verdad va acá,
    // antes de tomar correlativo. Caso real: una boleta salió con fecha futura,
    // SUNAT la rechazó (2329) y al reintentar corregida respondió 1032 porque el
    // número ya estaba quemado. El documento quedó irrecuperable.
    const _fechaCheck = validateEmissionDate(emissionDateToUse, documentType)
    if (!_fechaCheck.valid) {
      toast.error(_fechaCheck.error, 10000)
      emissionDateInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      emissionDateInputRef.current?.focus?.()
      setIsProcessing(false)
      checkoutGuardRef.current = false
      return
    }

    // Barrera de stock de PRODUCTOS TERMINADOS para carritos PRECARGADOS.
    //
    // Las validaciones de agregar/cambiar cantidad cubren el uso manual, pero una
    // cotización o un pedido online entran por `setCart()` y se las saltan por
    // completo: al cobrar solo se revisaban los insumos de recetas, así que la
    // venta pasaba y el stock quedaba en negativo (reporte 31-jul-2026).
    //
    // A PROPÓSITO solo aplica a esos dos orígenes (`pendingStockCheckRef`), no a
    // todo carrito. Mesas, órdenes y folios de hotel llegan con la comida YA
    // servida y su flujo no valida stock de producto terminado —solo insumos—;
    // exigirlo acá dejaría a un restaurante sin poder cerrar una mesa por un
    // descuadre de inventario, que es peor que el problema que se arregla.
    //
    // Nota de venta y guía de remisión ya descontaron su stock antes: volver a
    // exigirlo bloquearía conversiones legítimas.
    if (pendingStockCheckRef.current) {
      const _stockYaDescontado = !!(
        (pendingNotaVentaIds && pendingNotaVentaIds.length > 0) ||
        (sourceDispatchGuide && sourceDispatchGuide.stockAlreadyDeducted)
      )
      const _faltantes = _stockYaDescontado ? [] : getStockShortages()
      if (_faltantes.length > 0) {
        const _detalle = _faltantes
          .map(f => `${f.name}: pediste ${f.pedido}${f.unidad ? ` ${f.unidad}` : ''} y hay ${f.disponible} en ${f.donde}`)
          .join('. ')
        toast.error(
          `No hay stock suficiente. ${_detalle}. Ajusta las cantidades, cambia de almacén, o activa "permitir vender sin stock" en Configuración.`,
          9000
        )
        checkoutGuardRef.current = false
        setIsProcessing(false)
        return
      }
    }

    // Validar stock de ingredientes de recetas.
    // Se omite cuando `allowNegativeStock` está activo: si el dueño aceptó vender
    // sin stock de productos terminados, también aceptamos vender platos con
    // receta aunque falten insumos (los insumos se descuentan a negativo).
    if (!permiteSinStock) {
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

    // Venta al crédito con comprobante fiscal: SUNAT exige que la fecha del
    // pago único o de las cuotas sea POSTERIOR a la fecha de emisión (regla
    // 3267 — caso real: factura al crédito con vencimiento = día de emisión,
    // rechazada). Comparación de strings YYYY-MM-DD (orden lexicográfico).
    if ((documentType === 'factura' || documentType === 'boleta') && paymentType === 'credito') {
      const cuotaDates = paymentInstallments.length > 0
        ? paymentInstallments.map(c => c.dueDate).filter(Boolean)
        : (paymentDueDate ? [paymentDueDate] : [])
      const badDate = cuotaDates.find(d => d <= emissionDateToUse)
      if (badDate) {
        abortCheckout(`La fecha de vencimiento (${badDate}) debe ser POSTERIOR a la fecha de emisión (${emissionDateToUse}). SUNAT rechaza cuotas que vencen el mismo día de la emisión.`)
        return
      }
    }

    // Anticipos a deducir: validar formato de serie-número (regla SUNAT 2521) en
    // los agregados a mano. Los seleccionados del sistema ya vienen bien formados.
    if (documentType === 'factura' && advancesApplied > 0) {
      for (const adv of advancesList) {
        if (adv.invoiceId) continue
        const amt = parseFloat(adv.amount) || 0
        if (amt <= 0) continue // sin monto no se aplica: se ignora
        const fn = String(adv.fullNumber || '').trim().toUpperCase()
        if (!/^([FB][A-Z0-9]{3}|E001|EB01)-\d{1,8}$/.test(fn)) {
          abortCheckout(`El comprobante de anticipo "${adv.fullNumber || '(vacío)'}" debe tener formato Serie-Número (ej: F001-95). Debe ser una factura ACEPTADA por SUNAT.`)
          return
        }
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
    // 2. Factura o boleta con forma de pago "crédito"
    const isCreditSale = (enablePartialPayment && amountToPay === 0) ||
      ((documentType === 'factura' || documentType === 'boleta') && paymentType === 'credito')

    // Toda venta que queda debiendo necesita a quién cobrarle. Sin nombre, la
    // deuda cae en la fila "Cliente sin nombre" del reporte de cobranzas —
    // junto con la de todos los demás anónimos, en un solo montón. Queda
    // registrada pero es incobrable: nadie sabe a quién reclamarle.
    //
    // Al contado no se exige nada (el cliente pagó y se fue, no hay pendiente).
    // La factura ya viene cubierta por el RUC obligatorio; esto tapa los dos
    // caminos que faltaban: la nota de venta al crédito o con pago parcial, y
    // la boleta al crédito de menos de S/ 700 (que SUNAT no obliga a nombrar).
    //
    // El espejo de esta condición está al guardar (isCreditSaleForInvoice /
    // isPartialPayment): si cambia una, tiene que cambiar la otra.
    const quedaSaldoPendiente =
      ((documentType === 'factura' || documentType === 'boleta') && paymentType === 'credito') ||
      (documentType === 'nota_venta' && enablePartialPayment && amountToPay < amounts.total)
    if (quedaSaldoPendiente) {
      const nombreDeudor = (customerData.name || '').trim() || (customerData.businessName || '').trim()
      if (!nombreDeudor) {
        abortCheckout('Esta venta queda con saldo pendiente. Escribe al menos el nombre del cliente para saber a quién cobrarle.')
        return
      }
    }

    // Si hidePaymentMethods está activo, usar efectivo automáticamente
    const isHidePaymentMethods = hasFeature('hidePaymentMethods')

    // Validar que se haya cubierto el monto a pagar (total o parcial)
    // EXCEPCIÓN: Si es venta al crédito, no requiere pago inmediato
    // EXCEPCIÓN: Si hidePaymentMethods está activo, se asume pago completo en efectivo
    // Tolerancia de medio centavo para evitar falsos negativos por imprecisión de
    // punto flotante (p.ej. 27.9 + 46.80 = 74.69999... < 74.70 en JS).
    const PAYMENT_EPSILON = 0.005

    // Monto tipeado en una línea SIN método elegido. Al agregar un método el
    // sistema PRE-LLENA el saldo restante y deja el método vacío, así que la
    // línea parece completa: la validación de abajo la daba por pagada (suma
    // todas las líneas) pero al guardar se descartaba (solo se guardan las que
    // tienen método). Resultado: la venta se cobraba completa y ese monto
    // desaparecía del resumen por método de pago — dinero cobrado que no
    // figuraba en ningún lado (caso BRASA CRIOLLA: 4 ventas, S/177).
    if (!isHidePaymentMethods) {
      const sinMetodo = payments.filter(p => !p.method && parseFloat(p.amount) > 0)
      if (sinMetodo.length > 0) {
        const monto = sinMetodo.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
        abortCheckout(`Falta elegir el método de pago de ${formatCurrency(monto)}. Selecciónalo antes de cobrar.`)
        return
      }
    }

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
            method: getPaymentLabel(p.method, companySettings),
            methodKey: p.method,
            amount: effectiveAmount
          }
        })
    }

    /**
     * ¿Queda algo por cobrar?
     *
     * Un comprobante 100% gratuito —todo bonificación, una transferencia
     * gratuita— totaliza 0, y también queda en 0 cuando los anticipos ya
     * cubrieron la factura entera.
     */
    const nadaQueCobrar = amountToPay <= PAYMENT_EPSILON

    // Validar que haya al menos un método de pago
    // EXCEPCIÓN 1: venta al crédito, no requiere pago inmediato.
    // EXCEPCIÓN 2: no hay nada que cobrar. Exigir un método de pago acá es
    //   pedirle al cajero que declare cómo cobró nada: la casilla del monto
    //   solo acepta un número mayor a cero, así que la venta quedaba trabada y
    //   no había forma de emitir una boleta de transferencia gratuita.
    if (!isCreditSale && !nadaQueCobrar && allPayments.length === 0) {
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

    // Certificado de regalo: mismo criterio. La transaccion de redencion
    // re-verifica el saldo en servidor, pero acortar aca evita emitir un
    // comprobante que despues no se puede cobrar.
    const giftApplied = allPayments
      .filter(p => p.methodKey === 'GIFT_CERT')
      .reduce((s2, p) => s2 + (parseFloat(p.amount) || 0), 0)
    if (giftApplied > 0 && !appliedGiftCert) {
      abortCheckout('Valida el codigo del certificado antes de cobrar con el.')
      return
    }
    if (appliedGiftCert && giftApplied > appliedGiftCert.balance + PAYMENT_EPSILON) {
      abortCheckout(`El certificado aplicado (${formatCurrency(giftApplied)}) supera su saldo (${formatCurrency(appliedGiftCert.balance)}).`)
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
          quantity: Number(item.quantity) || 0,
          unit: item.unit || 'NIU',
          ...(item.allowDecimalQuantity && { allowDecimalQuantity: true }),
          unitPrice: item.price,
          ...(() => { const c = computeItemCostAtSale(item); return c != null ? { costAtSale: c } : {} })(), // costo congelado al momento de la venta (reportes de margen)
          ...(item.imageUrl && { imageUrl: item.imageUrl }), // imagen del producto para el PDF de comprobante (opción showImagesInInvoices)
        ...(item.description && { description: item.description }), // descripción del producto para el PDF (opción showProductDescriptionInInvoice)
          ...(currency === 'USD' && Number(item.basePrice) > 0 && {
            basePrice: Number(item.basePrice),
          }),
          subtotal: item.price * item.quantity,
          taxAffectation: resolveItemTaxAffectation(item),
          ...(item.observations && { observations: item.observations }),
          ...(item.itemDiscount > 0 && { itemDiscount: item.itemDiscount }),
          ...bonificacionParaSunat(item),
          ...(item.presentationName && { presentationName: item.presentationName, presentationFactor: item.presentationFactor }),
          ...(item.batchNumber && { batchNumber: item.batchNumber }),
          ...(item.batchExpiryDate && { batchExpiryDate: item.batchExpiryDate }),
          ...(item.serialNumber && { serialNumber: item.serialNumber }),
        ...(item.serialNumber2 && { serialNumber2: item.serialNumber2 }),
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
                licenseNumber: customerData.licenseNumber || '',
                propertyCard: customerData.propertyCard || '',
                coords: customerData.customerCoords || null,
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
                licenseNumber: customerData.licenseNumber || '',
                propertyCard: customerData.propertyCard || '',
                coords: customerData.customerCoords || null,
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
          // Igual que la venta real: el demo tiene que enseñar el mismo ticket.
          ...(porConsumoActivo
            ? { itemsComprobante: lineasPorConsumo(items, { igvRate: effectiveTaxConfig.igvRate, texto: porConsumoConfig.texto }) }
            : {}),
          subtotal: amounts.subtotalAfterDiscount, // Subtotal después del descuento (base imponible)
          subtotalBeforeDiscount: amounts.subtotal, // Subtotal original (antes del descuento)
          discount: amounts.discount || 0,
          globalDiscount: amounts.globalDiscount || 0, // Solo descuento global (sin item discounts) para XML
          ...(appliedCoupon ? { couponCode: appliedCoupon.id } : {}), // Cupón aplicado (Promociones), para reportes
          ...(appliedGiftCert ? { giftCertCode: appliedGiftCert.id } : {}), // Certificado canjeado, para rastrear el canje
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
          // Sin pagos: o queda debiendo, o no había nada que cobrar. Poner
          // 'Crédito' en el segundo caso ensucia el ticket y los reportes con
          // una deuda de S/ 0 que nadie va a cobrar nunca.
          paymentMethod: allPayments.length > 0 ? allPayments[0].method : (nadaQueCobrar ? 'Gratuito' : 'Crédito'),
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

        // La venta se REGISTRA en el estado del demo: aparece en Ventas, en el
        // Dashboard y en la caja, y DESCUENTA EL STOCK. Antes la venta se
        // simulaba y no dejaba rastro: el visitante vendía diez veces y el
        // inventario no se movía, así que el demo se sentía de mentira.
        const registro = registrarVentaDemo(invoiceData, selectedWarehouse?.id || null)
        const numeroReal = registro.success ? registro.number : demoNumber

        setLastInvoiceNumber(numeroReal)
        setLastInvoiceData({ ...invoiceData, number: numeroReal, series: registro.series || invoiceData.series })

        const documentName = documentType === 'factura' ? 'Factura' : documentType === 'nota_venta' ? 'Nota de Venta' : 'Boleta'
        toast.success(`${documentName} ${numeroReal} generada exitosamente`, 5000)

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
          vehicleYear: '', licenseNumber: '', propertyCard: '',
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
        // SIEMPRE numero. El campo de cantidad decimal conserva el string
        // crudo mientras se escribe (para poder teclear "0.0" camino a
        // "0.025"), y normalmente el blur lo normaliza — pero si se cobra sin
        // salir del campo (Enter, o tablet donde el blur no dispara antes del
        // clic) ese texto llegaba al comprobante y lo dejaba imposible de
        // imprimir para siempre (reporte 17-ago-2026, N001-00000535).
        quantity: Number(item.quantity) || 0,
        unit: item.unit || 'NIU',
        // El comprobante necesita saber que la cantidad lleva decimales: sin
        // esto el ticket imprime "3.03" a secas, sin la unidad. Los cinco
        // formatos de impresion ya lo leian, pero el mapeo nunca lo guardaba.
        ...(item.allowDecimalQuantity && { allowDecimalQuantity: true }),
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
        taxAffectation: resolveItemTaxAffectation(item),
        ...(resolveItemIgvRate(item) ? { igvRate: resolveItemIgvRate(item) } : {}),
        ...(item.observations && { observations: item.observations }), // Incluir observaciones si existen (IMEI, placa, serie, etc.)
        ...(item.itemDiscount > 0 && { itemDiscount: item.itemDiscount }), // Descuento por ítem para XML SUNAT
        ...bonificacionParaSunat(item),
        ...referenciaDeRegalo(item),
        ...(item.notes && { notes: item.notes }), // Incluir notas si existen
        ...(item.presentationName && { presentationName: item.presentationName, presentationFactor: item.presentationFactor }),
        ...(item.batchNumber && { batchNumber: item.batchNumber }),
        ...(item.batchExpiryDate && { batchExpiryDate: item.batchExpiryDate }),
        ...(item.serialNumber && { serialNumber: item.serialNumber }),
        ...(item.serialNumber2 && { serialNumber2: item.serialNumber2 }),
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
      // Factura O boleta al crédito: mismo tratamiento (paymentStatus pending +
      // balance) para que entren al reporte de Pagos Pendientes.
      const isCreditSaleForFactura = (documentType === 'factura' || documentType === 'boleta') && paymentType === 'credito'
      const isCreditSaleForInvoice = isCreditSaleForNotaVenta || isCreditSaleForFactura
      const isPartialPayment = enablePartialPayment && partialAmount > 0 && documentType === 'nota_venta'

      const amountPaid = isCreditSaleForInvoice ? 0 : (isPartialPayment ? partialAmount : amounts.total)
      const balance = isCreditSaleForInvoice ? amounts.total : (isPartialPayment ? amounts.total - amountPaid : 0)
      const paymentStatus = isCreditSaleForInvoice ? 'pending' : (isPartialPayment ? (balance > 0 ? 'partial' : 'completed') : 'completed')

      // Vuelto: solo aplica a pagos al contado (no crédito, no parcial) cuando el cliente
      // pagó más que el total. totalPaid viene del state del POS y refleja exactamente lo
      // que ingresó el cajero (NO el monto recortado a allPayments por effectiveAmount).
      // Con anticipos deducidos, el cliente paga el SALDO: el vuelto se calcula contra él.
      const netSaleTotal = Math.round((amounts.total - advancesApplied) * 100) / 100
      const change = (!isCreditSaleForInvoice && !isPartialPayment && totalPaid > netSaleTotal)
        ? Math.round((totalPaid - netSaleTotal) * 100) / 100
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
                licenseNumber: customerData.licenseNumber || '',
                propertyCard: customerData.propertyCard || '',
                coords: customerData.customerCoords || null,
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
                licenseNumber: customerData.licenseNumber || '',
                propertyCard: customerData.propertyCard || '',
                coords: customerData.customerCoords || null,
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
        // POR CONSUMO: la representación FISCAL del documento, congelada.
        // `items` sigue siendo el detalle real (stock, insumos, reportes,
        // comisiones); esto es lo único que se imprime y se declara.
        ...(porConsumoActivo
          ? { itemsComprobante: lineasPorConsumo(items, { igvRate: effectiveTaxConfig.igvRate, texto: porConsumoConfig.texto }) }
          : {}),
        subtotal: amounts.subtotalAfterDiscount, // Subtotal después del descuento (base imponible)
        subtotalBeforeDiscount: amounts.subtotal, // Subtotal original (antes del descuento)
        discount: amounts.discount || 0,
        globalDiscount: amounts.globalDiscount || 0, // Solo descuento global (sin item discounts) para XML
          ...(appliedCoupon ? { couponCode: appliedCoupon.id } : {}), // Cupón aplicado (Promociones), para reportes
          ...(appliedGiftCert ? { giftCertCode: appliedGiftCert.id } : {}), // Certificado canjeado, para rastrear el canje
        discountPercentage: parseFloat(discountPercentage) || 0,
        igv: amounts.igv,
        igvByRate: amounts.igvByRate || {},
        // Con anticipos deducidos, `total` = SALDO (el "Importe total" SUNAT /
        // PayableAmount y lo que el cliente paga). El bruto queda en grossTotal.
        // Así los reportes no cuentan doble (el anticipo ya se facturó antes).
        total: advancesApplied > 0
          ? Math.round((amounts.total - advancesApplied) * 100) / 100
          : amounts.total,
        // Multi-divisa: moneda nativa del documento + TC CONGELADO. PEN=1
        // si no se activó multi-divisa o si se vende en soles. NUNCA se
        // recalculan a posteriori los *InBase (reportes históricos fijos).
        currency: normalizeCurrency(currency),
        exchangeRate: currency === 'USD' ? (Number(exchangeRate) || 1) : 1,
        subtotalInBase: amounts.subtotalInBase,
        igvInBase: amounts.igvInBase,
        totalInBase: advancesApplied > 0
          ? Math.round(((amounts.total - advancesApplied) * (currency === 'USD' ? (Number(exchangeRate) || 1) : 1)) * 100) / 100
          : amounts.totalInBase,
        // Montos por tipo de afectación tributaria
        opGravadas: amounts.gravado?.total || 0,
        opExoneradas: amounts.exonerado?.total || 0,
        opInafectas: amounts.inafecto?.total || 0,
        // Configuración de impuestos
        taxConfig: effectiveTaxConfig,
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
        // Primer método como principal, por compatibilidad. Sin pagos es una
        // venta AL CRÉDITO: decía 'Efectivo' y el ticket la imprimía como
        // pagada en efectivo (reporte 17-ago-2026). Rellenar un campo con un
        // valor que no ocurrió es peor que dejarlo describir la realidad.
        paymentMethod: allPayments.length > 0 ? allPayments[0].method : (nadaQueCobrar ? 'Gratuito' : 'Crédito'),
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
        // Tipo de pedido: SOLO en restaurante, que es el único modo donde el
        // cajero lo elige. El estado arranca en 'takeaway' y el selector se
        // renderiza únicamente si businessMode === 'restaurant', así que en
        // retail, farmacia o veterinaria se venía guardando "Para llevar" en
        // TODAS las ventas sin que nadie lo hubiera elegido ni lo leyera.
        ...(businessMode === 'restaurant' && { orderType }),
        // Información del mozo (si viene de una mesa)
        waiterId: tableData?.waiterId || null,
        waiterName: tableData?.waiterName || null,
        // Información del vendedor
        sellerId: selectedSeller?.id || null,
        sellerName: selectedSeller?.name || null,
        sellerCode: selectedSeller?.code || null,
        // COMISIÓN CONGELADA. Se guarda con la venta, no se deduce después de la
        // configuración del vendedor: si mañana le suben el porcentaje, las
        // comisiones ya informadas (y muchas veces ya pagadas) no pueden moverse
        // solas. Mismo criterio que `costAtSale` en los items.
        //
        // Va en SOLES: el porcentaje del vendedor está en soles y `amounts.total`
        // puede venir en dólares. La utilidad usa el costo ya congelado de cada
        // item, así que la comisión sobre utilidad tampoco se mueve después.
        ...(() => {
          // Detalle por línea, para los vendedores que comisionan por producto.
          // El total de cada línea va en la moneda de la venta, así que se pasa
          // a soles con el mismo factor que ya se aplicó al total del documento
          // —así la suma de las líneas no se despega del total congelado—.
          // El costo NO se convierte: `costAtSale` ya está en soles.
          const aSoles = Number(amounts.total) > 0
            ? Number(amounts.totalInBase) / Number(amounts.total)
            : 1
          const lineasParaComision = items.map(it => {
            const cantidad = Number(it.quantity) || 0
            const bruto = (Number(it.unitPrice) || 0) * cantidad - (Number(it.itemDiscount) || 0)
            return {
              productId: it.productId,
              quantity: cantidad,
              totalInBase: Math.max(0, bruto) * aSoles,
              costInBase: (Number(it.costAtSale) || 0) * cantidad,
            }
          })
          const com = computeSaleCommission(
            selectedSeller,
            amounts.totalInBase,
            lineasParaComision.reduce((sum, l) => sum + l.costInBase, 0),
            lineasParaComision
          )
          return com ? { commission: com } : {}
        })(),
        // Reserva de hotel, cuando la venta viene de facturar un folio. Es la llave
        // que usa el reporte de hotel para saber qué se cobró de cada reserva: sin
        // ella, "Cobrado" queda en S/0.00 aunque el folio esté todo facturado.
        ...(pendingFolioReservationIdRef.current && {
          hotelReservationId: pendingFolioReservationIdRef.current,
        }),
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
        // Nota de venta al crédito con términos (opcional, Config > Ventas):
        // vencimiento + cuotas del SALDO. Usa los mismos campos que la factura,
        // así el PDF/ticket y el reporte de Pagos Pendientes los leen igual.
        ...(notaVentaCreditTermsOn && notaVentaBalance > 0 && {
          paymentType: 'credito',
          // Con cuotas no se guarda: el XML la ignora y el PDF la imprimiría
          // al lado del detalle de cuotas como si fuera otro plazo.
          paymentDueDate: paymentInstallments.length > 0 ? null : (paymentDueDate || null),
          paymentInstallments: paymentInstallments.map(inst => ({
            number: inst.number,
            amount: parseFloat(inst.amount) || 0,
            dueDate: inst.dueDate,
          })),
        }),
        // Boleta: forma de pago Contado/Crédito con cuotas, igual que factura
        // (el XML la declara con el mismo bloque FormaPago; SUNAT la acepta
        // aunque solo la valide en facturas). Sin detracción/retención (no
        // aplican a boletas).
        ...(documentType === 'boleta' && {
          paymentType: paymentType,
          paymentDueDate: paymentType === 'credito' && paymentInstallments.length === 0 ? paymentDueDate : null,
          paymentInstallments: paymentType === 'credito' ? paymentInstallments.map(inst => ({
            number: inst.number,
            amount: parseFloat(inst.amount) || 0,
            dueDate: inst.dueDate
          })) : [],
        }),
        // Forma de pago (solo para facturas) - Contado/Crédito con cuotas
        ...(documentType === 'factura' && {
          paymentType: paymentType, // 'contado' o 'credito'
          paymentDueDate: paymentType === 'credito' && paymentInstallments.length === 0 ? paymentDueDate : null,
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
          ...(detraccionActual && {
            detractionType: detractionType,
            detractionTypeName: DETRACTION_TYPES.find(t => t.code === detractionType)?.name || '',
            detractionRate: detraccionActual.tasa,
            // El monto que se DEPOSITA, en soles. Es el que va al XML (SUNAT lo
            // exige en PEN) y el que se le muestra al cliente.
            detractionAmountPEN: detraccionActual.pen,
            // Su equivalente en la moneda del documento, solo para restarlo del
            // total. En un comprobante en soles los dos son iguales.
            detractionAmount: detraccionActual.doc,
            detractionBankAccount: detractionBankAccount || null,
            netPayable: detraccionActual.neto,
          }),
          // Datos de retención (Régimen de Retención del IGV — cliente agente de retención).
          // Solo leyenda + cálculo informativo: el total NO cambia (el comprador retiene el 3%).
          hasRetencion: hasRetencion,
          ...(hasRetencion && {
            retencionRate: 3,
            retencionAmount: Number((amounts.total * 0.03).toFixed(2)),
            retencionNetPayable: Number((amounts.total - amounts.total * 0.03).toFixed(2)),
          }),
          // === ANTICIPOS ===
          // Factura DE anticipo: tipo de operación 0104 (catálogo 51). Queda
          // marcada para que la factura final del mismo cliente la encuentre.
          ...(isAdvanceInvoice && { isAdvancePayment: true }),
          // Factura FINAL que deduce anticipos: lista de comprobantes de
          // anticipo (serie-número + monto CON IGV). El XML server-side arma
          // PrepaidPayment/AllowanceCharge 04 y el PayableAmount neto.
          ...(advancesApplied > 0 && {
            advances: advancesList
              .filter(a => a.fullNumber && parseFloat(a.amount) > 0)
              .map(a => {
                const fn = String(a.fullNumber).trim().toUpperCase()
                return {
                  ...(a.invoiceId && { invoiceId: a.invoiceId }),
                  fullNumber: fn,
                  // 02 = factura de anticipo, 03 = boleta de anticipo (catálogo 12)
                  docType: (fn.startsWith('B') || fn.startsWith('EB')) ? '03' : '02',
                  amount: Math.round(parseFloat(a.amount) * 100) / 100,
                }
              }),
            advanceTotal: advancesApplied,
            // Total BRUTO de la operación (los items completos). El campo `total`
            // del doc queda como SALDO (lo que efectivamente paga el cliente).
            grossTotal: amounts.total,
          }),
        }),
        // Si viene de nota(s) de venta, marcar para no descontar stock de nuevo
        ...(pendingNotaVentaIds && pendingNotaVentaIds.length > 0 && {
          skipStockDeduction: true,
          convertedFrom: pendingNotaVentaIds.length === 1
            ? { type: 'nota_venta', id: pendingNotaVentaIds[0] }
            : { type: 'nota_venta', ids: pendingNotaVentaIds },
        }),
        // De qué cotización salió. Mismo shape que las notas de venta y las
        // guías: sin esto, desde el comprobante era imposible saberlo.
        // No lleva skipStockDeduction — una cotización no mueve stock.
        ...(pendingQuotation && {
          convertedFrom: { type: 'quotation', id: pendingQuotation.id, number: pendingQuotation.number || '' },
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

        // === Ajuste de inventario por DIFERENCIA ===
        // La venta original ya descontó su stock; acá solo se mueve lo que cambió
        // (vender 2 más = descontar 2; vender 2 menos = devolver 2). Antes la
        // edición sobrescribía el documento sin tocar el stock y el inventario
        // quedaba descuadrado. Se valida ANTES de escribir el doc: si el aumento
        // no alcanza, no se guarda nada a medias.
        const { computeEditStockDeltas, validateEditStockIncreases, applyEditStockDeltas } =
          await import('@/services/invoiceEditStockService')
        const _editWarehouseId = editingInvoiceData.warehouseId || selectedWarehouse?.id || null
        const _stockDeltas = computeEditStockDeltas(editingInvoiceData.items || [], cart)
        if (_stockDeltas.length > 0 && !permiteSinStock) {
          // productsRaw: la factura editada puede traer productos ocultos en la
          // sucursal activa; con la lista filtrada no se validaban ni ajustaban.
          const _faltantes = validateEditStockIncreases(_stockDeltas, productsRaw, _editWarehouseId)
          if (_faltantes.length > 0) {
            const _det = _faltantes
              .map(f => `${f.name}: pides ${f.adicional} más y hay ${parseFloat(Number(f.disponible).toFixed(2))}`)
              .join('. ')
            toast.error(`No hay stock para el aumento. ${_det}.`, 9000)
            checkoutGuardRef.current = false
            setIsProcessing(false)
            return
          }
        }

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

        // Aplicar los deltas DESPUÉS de que el documento se guardó: si el update
        // falla, el stock no se toca. Cada producto va en su propia transacción
        // (mismo helper que la anulación: variantes, lotes y series incluidos) y
        // queda un movimiento tipo Ajuste con referencia a esta edición.
        if (_stockDeltas.length > 0) {
          const _adjResult = await applyEditStockDeltas({
            businessId,
            deltas: _stockDeltas,
            warehouseId: _editWarehouseId,
            invoiceId: editingInvoiceId,
            invoiceNumber: `${editingInvoiceData.series}-${editingInvoiceData.number}`,
            userId: user.uid,
            userName: user.displayName || user.email || 'Usuario',
            allowNegative: permiteSinStock,
            // Para el FEFO de los aumentos en productos con lotes. productsRaw
            // (catalogo completo): con la lista filtrada por sucursal, un
            // producto oculto en la sede activa no se encontraba, se ajustaba el
            // total pero NO los lotes, y el detalle por lote quedaba descuadrado.
            products: productsRaw,
          })
          if (!_adjResult.success) {
            // El documento YA quedó editado: avisar qué productos revisar en vez
            // de fingir que todo salió bien.
            toast.error(`Documento guardado, pero no se pudo ajustar el stock de: ${_adjResult.errores.join(', ')}. Revísalos en Inventario.`, 10000)
          }
        }

        toast.success(`Documento ${editingInvoiceData.series}-${editingInvoiceData.number} actualizado correctamente`)

        // El ticket imprimible solo existe en el DOM cuando hay `lastInvoiceData`
        // (bloque `hidden print:block`). La edición no lo seteaba, así que
        // `window.print()` no encontraba ticket e imprimía LA PANTALLA del POS.
        // Se llena igual que en la venta normal, y de paso queda disponible el
        // panel con las opciones de reimpresión.
        setLastInvoiceNumber(numberResult.number)
        setLastInvoiceData(invoiceData)

        // Limpiar estado de edición
        setEditingInvoiceId(null)
        setEditingInvoiceData(null)
        editInvoiceLoadedRef.current = false

        // Auto-imprimir en modo edición (el recordatorio de vuelto no aplica al editar).
        // El retardo le da a React el tiempo de montar el ticket recién seteado.
        //
        // Al terminar se vuelve a Ventas: una edición SIEMPRE empieza ahí, así que
        // devolver al usuario cierra el círculo en vez de dejarlo en un POS con el
        // carrito de un documento que ya guardó. Solo con auto-impresión o
        // auto-reinicio activos, que es cuando el POS se da por terminado solo; sin
        // ellos se queda para que pueda reimprimir desde el panel de opciones.
        //
        // La navegación va DESPUÉS de que el diálogo de impresión se cerró: irse
        // antes desmonta el ticket a media impresión y saldría en blanco.
        const _volverAVentas = () => {
          clearCart() // que el POS no quede con el carrito del documento editado
          appNavigate('facturas')
        }
        if (companySettings?.autoPrintTicket) {
          setTimeout(async () => {
            await handlePrintTicket(invoiceData)
            _volverAVentas()
          }, 500)
        } else if (companySettings?.autoResetPOS) {
          _volverAVentas()
        }

      } else {
        // ========================================
        // MODO NORMAL: Venta segura (save-first)
        // Primero: guardar factura con número atómico
        // Después: mostrar éxito + imprimir ticket
        // Esto garantiza que el número solo se usa si la factura se crea exitosamente
        // ========================================

        // 0. Reservar la orden de mesa/pedido ANTES de gastar un correlativo.
        //
        // Sin esto, cobrar dos veces la misma mesa emite dos comprobantes: la
        // orden se marca como facturada recién en `backgroundSave()`, después de
        // la venta, así que un segundo cobro no encuentra nada que lo detenga.
        // Pasó en producción (dos boletas consecutivas, mismos 6 items, mismo
        // minuto). Detalle del mecanismo en `claimOrderForInvoicing`.
        if (pendingOrderId && markOrderPaidOnComplete) {
          const claimId = `${user.uid}-${Date.now()}`
          const claim = await claimOrderForInvoicing(businessId, pendingOrderId, claimId, user.uid)

          if (!claim.success) {
            // Se corta la venta ANTES de tomar número: no se pierde correlativo.
            if (claim.alreadyInvoiced) {
              toast.error(
                claim.invoiceNumber
                  ? `Esta cuenta ya fue cobrada con el comprobante ${claim.invoiceNumber}. Cierra la mesa sin comprobante para liberarla.`
                  : 'Esta cuenta ya fue cobrada. Cierra la mesa sin comprobante para liberarla.',
                10000
              )
              // La mesa quedó ocupada justamente porque el cobro anterior no
              // alcanzó a liberarla: soltarla acá evita que el cajero insista.
              if (tableData?.tableId) {
                releaseTable(businessId, tableData.tableId).catch(err =>
                  console.error('Error al liberar mesa ya cobrada:', err)
                )
              }
            } else {
              toast.error('Esta cuenta se está cobrando en otro dispositivo. Espera un momento y vuelve a intentarlo.', 8000)
            }
            setIsProcessing(false)
            checkoutGuardRef.current = false
            return
          }

          // Guardado para soltarla si la emisión falla más abajo.
          if (!claim.skipped) orderClaimRef.current = { orderId: pendingOrderId, claimId }
        }

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

        // Sellar la orden AQUÍ, no en el background. La reserva de arriba solo
        // dura 2 minutos; lo que cierra el caso de forma permanente es dejar la
        // orden marcada como facturada apenas el comprobante existe. Se espera a
        // propósito (una escritura chica, y solo en ventas de mesa/pedido): es la
        // escritura de la que depende que no salga un segundo comprobante.
        if (orderClaimRef.current) {
          const _claim = orderClaimRef.current
          orderClaimRef.current = null
          try {
            await markOrderInvoiced(businessId, _claim.orderId, invoiceId, numberResult.number)
          } catch (err) {
            console.error('Error al sellar la orden como facturada:', err)
          }
        }

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

        // Marcar los anticipos deducidos como USADOS en esta factura, para que
        // el selector no permita deducirlos dos veces. Fire-and-forget: si
        // falla, la venta ya está guardada (solo afecta el filtro del picker).
        if (advancesApplied > 0) {
          for (const adv of advancesList) {
            if (!adv.invoiceId) continue
            updateDoc(doc(db, 'businesses', businessId, 'invoices', adv.invoiceId), {
              advanceUsedIn: invoiceId,
              advanceUsedInNumber: numberResult.number,
            }).catch(err => console.warn('No se pudo marcar anticipo como usado:', err))
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

        // Redimir certificado de regalo: descontar del saldo lo aplicado como
        // pago. Transaccion en el servicio (dos cajeros no gastan el mismo
        // sol dos veces). No bloquea la venta: si falla, ya esta guardada y
        // se avisa fuerte para resolverlo a mano.
        if (giftApplied > 0 && appliedGiftCert) {
          try {
            const { redeemGiftCertificate } = await import('@/services/giftCertificateService')
            const giftRes = await redeemGiftCertificate(businessId, appliedGiftCert.id, giftApplied, invoiceId)
            if (giftRes.success) {
              console.log('✅ Certificado canjeado, saldo restante:', giftRes.balance)
            } else {
              console.error('❌ Error al canjear certificado:', giftRes.error)
              toast.error('Venta guardada, pero no se pudo descontar el certificado: ' + (giftRes.error || ''), 8000)
            }
          } catch (err) {
            console.error('❌ Excepción al canjear certificado:', err)
            toast.error('Venta guardada, pero falló el descuento del certificado: ' + (err.message || ''), 8000)
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
              // El folio ya se facturó: la siguiente venta no debe heredar el enlace
              // con esta reserva.
              pendingFolioReservationIdRef.current = null
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
        const _pendingQuotation = pendingQuotation
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
        if (_pendingQuotation) setPendingQuotation(null)
        if (_pendingNotaVentaIds) setPendingNotaVentaIds(null)
        if (_sourceDispatchGuide) setSourceDispatchGuide(null)
        if (_pendingAppointmentData) setPendingAppointmentData(null)

        // Capturar datos necesarios para el background
        const bgCart = [...cart]
        // productsRaw, NO products: la lista filtrada por sucursal gobierna QUE SE
        // MUESTRA para agregar al carrito, nunca QUE SE DESCUENTA al cobrar. Con
        // `products` (filtrado), un item de otra sede —que llega por edicion,
        // cotizacion, nota de venta o pedido online— no se encontraba y el stock
        // NO se descontaba: se cobraba la venta y el inventario quedaba intacto,
        // sin error, sin aviso y sin movimiento en el historial.
        const bgProducts = [...productsRaw]
        const bgSelectedWarehouse = selectedWarehouse
        const bgDocumentType = documentType
        const bgAmounts = { ...amounts }
        const bgCustomerData = { ...customerData }
        // Veterinaria: a quién y qué recordarle. Se captura antes de limpiar el
        // carrito, igual que el resto de los datos del background.
        const bgRecordatorios = serviciosARecordar.map(s => ({ ...s }))
        const bgCustomerIdVet = selectedCustomer?.id || null
        const bgPetName = customerData.petName || null
        const bgSelectedSeller = selectedSeller ? { ...selectedSeller } : null
        const bgNumberResult = { ...numberResult }
        const bgUserUid = user.uid
        const bgUserEmail = user.email
        const bgUserDisplayName = user.displayName
        const bgInvoiceId = invoiceId
        const bgOrderType = orderType
        const bgSendToKitchen = sendToKitchen
        const bgSelectedBranchId = selectedBranch?.id || null

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

            // 3.0.-1.5. Canje de fidelización PENDIENTE: la venta ya está
            // guardada, recién ahora se descuentan los sellos (si la venta se
            // cancelaba antes de cobrar, el cliente no perdía nada). Guardas:
            // el cliente de la venta debe seguir siendo el del canje, y si el
            // premio era un producto, su línea debe seguir en el carrito (el
            // cajero pudo quitarla). Nunca frena la venta: fire-and-forget.
            if (loyaltyRedemption && companySettings?.loyaltyConfig?.enabled) {
              try {
                const mismoCliente = loyaltyRedemption.phone && bgCustomerData?.phone
                  && loyaltyRedemption.phone === bgCustomerData.phone
                const esProducto = loyaltyRedemption.type === 'product' || loyaltyRedemption.type === 'product_discount'
                const premioEnCarrito = !esProducto || cart.some(i => i.isLoyaltyReward)
                if (mismoCliente && premioEnCarrito) {
                  const { redeemReward } = await import('@/services/loyaltyService')
                  const r = await redeemReward(idDeFidelizacion(companySettings, businessId), bgCustomerData.phone, {
                    userName: user?.displayName || user?.email || '',
                    note: loyaltyRedemption.label || companySettings.loyaltyConfig.reward || '',
                    config: companySettings.loyaltyConfig,
                    localId: businessId,
                  })
                  if (r.success) {
                    setLoyaltyCard(prev => (prev ? { ...prev, stamps: r.stamps } : prev))
                    console.log(`🎁 Canje ejecutado tras la venta. Sellos restantes: ${r.stamps}`)
                  } else {
                    console.error('No se pudo descontar los sellos del canje:', r.error)
                  }
                } else {
                  console.warn('Canje de fidelidad descartado: cambió el cliente o se quitó el premio del carrito')
                }
              } catch (loyaltyRedeemError) {
                console.error('Error al ejecutar el canje de fidelidad:', loyaltyRedeemError)
              } finally {
                setLoyaltyRedemption(null)
              }
            }

            // 3.0.-1. Sello de fidelización (Configuración > Ventas > "Programa
            // de fidelización"). La tarjeta se identifica por el TELÉFONO, así
            // que el mismo cliente acumula compre acá o por el catálogo online.
            // Idempotente por el ID de la factura: reprocesar no vuelve a sellar.
            if (companySettings?.loyaltyConfig?.enabled && bgCustomerData?.phone) {
              try {
                const { earnStamp } = await import('@/services/loyaltyService')
                // El grupo decide DONDE vive la tarjeta; `localId` deja
                // anotado en el movimiento cual de los dos locales sello,
                // que es lo que despues les permite liquidar entre ellos.
                const res = await earnStamp(idDeFidelizacion(companySettings, businessId), {
                  localId: businessId,
                  phone: bgCustomerData.phone,
                  customerName: bgCustomerData.name || bgCustomerData.businessName || '',
                  customerId: bgCustomerData.customerId || null,
                  refId: `invoice_${bgInvoiceId}`,
                  source: 'pos',
                  amount: bgAmounts.total,
                  config: companySettings.loyaltyConfig,
                })
                if (res.success && !res.alreadyStamped) {
                  console.log(`🎟️ Sello registrado: ${res.stamps}/${res.goal}`)
                }
              } catch (loyaltyError) {
                // La fidelización nunca frena la venta: ya está cobrada.
                console.error('No se pudo registrar el sello de fidelidad:', loyaltyError)
              }
            }

            // 3.0.-0.5. Contar el uso del cupón (Promociones > Cupones). Igual
            // que el sello: la venta ya está cobrada, un contador desfasado no
            // puede frenar la caja — fire and forget.
            if (appliedCoupon) {
              try {
                const { redeemCoupon } = await import('@/services/couponService')
                await redeemCoupon(businessId, appliedCoupon.id, bgInvoiceId)
              } catch (couponError) {
                console.error('No se pudo contar el uso del cupón:', couponError)
              }
            }

            // 3.0.0. Venta directa -> orden en Cocina + comanda (patio de comidas /
            // dark kitchen; Configuración > Ventas > "La venta del POS genera la
            // orden en Cocina"). SOLO ventas directas: si la venta viene de una
            // mesa, de una orden existente, de una conversión de nota de venta o
            // es una edición, la orden ya existe (o la comida ya salió) y crear
            // otra la duplicaría en Cocina.
            if (
              businessMode === 'restaurant' &&
              companySettings?.restaurantConfig?.posCreatesKitchenOrder === true &&
              !_tableData && !_pendingOrderId && !_pendingNotaVentaIds && !editingInvoiceId &&
              bgSendToKitchen &&
              bgCart.length > 0
            ) {
              try {
                const { createOrder } = await import('@/services/orderService')
                const orderPayload = {
                  orderType: bgOrderType || 'counter',
                  source: 'pos',
                  branchId: bgSelectedBranchId,
                  customerName: bgCustomerData?.name || null,
                  items: bgCart.map(item => ({
                    productId: item.id,
                    name: item.name || item.description || 'Producto',
                    quantity: item.quantity,
                    price: item.price,
                    total: (item.price || 0) * (item.quantity || 0),
                    ...(item.notes && { notes: item.notes }),
                    ...(item.modifiers && { modifiers: item.modifiers }),
                  })),
                  total: bgAmounts.total,
                  status: 'pending',
                  tableId: null,
                  tableNumber: null,
                  // Nace pagada y facturada: el POS ya cobró y emitió. Órdenes no
                  // debe volver a pedir el cobro (paid sin close: cocina la sigue
                  // trabajando con su flujo normal).
                  paid: true,
                  ...(invoiceData.payments?.[0]?.method && { paymentMethod: invoiceData.payments[0].method }),
                  invoiced: true,
                  invoiceId: bgInvoiceId || null,
                  invoiceNumber: invoiceData.number || null,
                }
                const orderResult = await createOrder(businessId, orderPayload)
                if (orderResult.success) {
                  console.log('✅ Orden de cocina creada desde el POS:', orderResult.orderNumber)
                  // Comanda automática. En la app sale por la ticketera (misma
                  // política que Órdenes); en el navegador se imprime con su
                  // propio diálogo, que aparece al cerrar el de la boleta
                  // (pedido del 14-ago: "boleta y comanda", también en web).
                  const autoComanda = companySettings?.restaurantConfig?.autoPrintKitchenComanda !== false
                  if (autoComanda && !Capacitor.isNativePlatform()) {
                    setPosComandaToPrint({
                      ...orderPayload,
                      id: orderResult.id,
                      orderNumber: orderResult.orderNumber,
                      _showCustomerData: companySettings?.showCustomerDataOnKitchenTicket === true,
                    })
                  }
                  if (autoComanda && Capacitor.isNativePlatform()) {
                    try {
                      const { getPrinterConfig, printKitchenOrder, printToAllStations } = await import('@/services/thermalPrinterService')
                      const printerConfigResult = await getPrinterConfig(businessId)
                      if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
                        const orderForPrint = {
                          ...orderPayload,
                          id: orderResult.id,
                          orderNumber: orderResult.orderNumber,
                          _showCustomerData: companySettings?.showCustomerDataOnKitchenTicket === true,
                        }
                        const rc = companySettings.restaurantConfig
                        const stationsWithPrinter = rc.enableKitchenStations && (rc.kitchenStations || []).filter(st => st.printerIp)
                        let printed = false
                        if (stationsWithPrinter && stationsWithPrinter.length > 0) {
                          const results = await printToAllStations(orderForPrint, rc.kitchenStations, printerConfigResult.config.paperWidth || 58)
                          printed = results.every(r => r.success)
                        } else {
                          const pr = await printKitchenOrder(orderForPrint, null, printerConfigResult.config.paperWidth || 58)
                          printed = pr.success
                        }
                        if (printed) {
                          const { updateOrder } = await import('@/services/orderService')
                          updateOrder(businessId, orderResult.id, { kitchenPrinted: true }).catch(() => {})
                        }
                      }
                    } catch (printError) {
                      // La comanda es secundaria: la orden ya está en Cocina.
                      console.error('No se pudo auto-imprimir la comanda desde el POS:', printError)
                    }
                  }
                } else {
                  console.error('No se pudo crear la orden de cocina desde el POS:', orderResult.error)
                }
              } catch (kitchenOrderError) {
                // Nunca frenar el resto del background por la orden de cocina.
                console.error('Error creando la orden de cocina desde el POS:', kitchenOrderError)
              }
            }

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

            if (shouldAutoSend && canSendToSunat) {
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
                    allowNegativeStock: !!permiteSinStock,
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
                    !!permiteSinStock
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
                    !!permiteSinStock
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
        ...(item.serialNumber2 && { serialNumber2: item.serialNumber2 }),
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
              // Insumos que consumen los MODIFICADORES ("Pieza extra de pollo").
              // Van al mismo agregado que la receta: son insumos del mismo plato
              // y así el documento de cada insumo se lee y escribe una sola vez.
              // No dependen de que el producto tenga receta —un plato sin receta
              // puede igual tener un agregado que descuenta— y por eso se suman
              // antes del filtro de recetas.
              for (const fila of consumoDeModificadoresDeVarias(bgCart.filter(item => !item.isCustom))) {
                const k = `${fila.ingredientId}|${fila.unit || ''}`
                const ex = _ingAgg.get(k)
                if (ex) ex.quantity += fila.quantity
                else _ingAgg.set(k, { ...fila })
              }
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
                    await deductIngredients(businessId, pass, bgInvoiceId, 'Venta (varios productos)', bgSelectedWarehouse?.id || null, 'sale', !!permiteSinStock)
                  } catch (error) {
                    _ingFail = true
                    console.warn('⚠️ No se pudo descontar insumos (agregado):', error)
                  }
                }
                if (_ingFail) {
                  // Antes el fallo era silencioso (solo console.warn) y el inventario de
                  // insumos quedaba descuadrado sin que el usuario se enterara.
                  try {
                    toast.warning('La venta se registró, pero no se pudieron descontar algunos insumos. Revisa el inventario de insumos.', 7000)
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
                  // Para que un segundo intento de cobro pueda nombrar el
                  // comprobante que ya salió, en vez de un "ya fue cobrada" seco.
                  invoiceNumber: bgNumberResult?.number || null,
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

            // 6.2. Marcar la cotización como convertida. Mismo criterio que usa
            // la sincronización de ventas offline: cuando esto vivía suelto acá,
            // una venta sin conexión nunca marcaba su cotización.
            if (_pendingQuotation) {
              await cerrarVinculoDeOrigen({
                businessId,
                convertedFrom: { type: 'quotation', id: _pendingQuotation.id },
                documentType: bgDocumentType,
                invoiceId: bgInvoiceId,
                invoiceNumber: bgNumberResult.number,
              })
            }

            // 6.3. Marcar nota(s) de venta como convertida(s) y verificar movimientos de stock
            if (_pendingNotaVentaIds && _pendingNotaVentaIds.length > 0) {
              await cerrarVinculoDeOrigen({
                businessId,
                convertedFrom: { type: 'nota_venta', ids: _pendingNotaVentaIds },
                documentType: bgDocumentType,
                invoiceId: bgInvoiceId,
                invoiceNumber: bgNumberResult.number,
              })

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

            // 6.5. Veterinaria: programar el próximo recordatorio de la mascota.
            // Va acá y no antes porque no debe demorar el cobro: si falla, la
            // venta ya está hecha y el recordatorio se puede cargar a mano.
            if (bgRecordatorios.length > 0 && bgCustomerIdVet) {
              try {
                const { programados } = await programarRecordatoriosDeVenta(
                  businessId, bgCustomerIdVet, bgPetName, bgRecordatorios,
                )
                console.log(`✅ Recordatorios veterinarios programados: ${programados}`)
              } catch (recordatorioError) {
                console.error('Error al programar recordatorios:', recordatorioError)
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
      // La venta no salió: soltar la reserva para que la mesa se pueda volver a
      // cobrar ya mismo, sin esperar a que la reserva venza sola.
      const _claim = orderClaimRef.current
      if (_claim) {
        orderClaimRef.current = null
        releaseOrderInvoicingClaim(getBusinessId(), _claim.orderId, _claim.claimId).catch(err =>
          console.error('Error al soltar la reserva de la orden:', err)
        )
      }
    } finally {
      setIsProcessing(false); checkoutGuardRef.current = false
    }
  }

  // Manda al cliente su tarjeta de sellos para Google Wallet por WhatsApp.
  // El link lo firma el servidor y ademas asegura que la tarjeta exista en
  // Wallet antes de entregarlo.
  const handleSendWalletCard = async () => {
    const tel = customerData?.phone
    if (!tel) { toast.error('El cliente no tiene telefono'); return }
    setSendingWalletCard(true)
    try {
      const { getWalletPassLink } = await import('@/services/loyaltyService')
      const { getAuth } = await import('firebase/auth')
      const idToken = await getAuth().currentUser?.getIdToken()
      const res = await getWalletPassLink(idDeFidelizacion(companySettings, getBusinessId()), tel, idToken)
      if (!res.success) { toast.error(res.error || 'No se pudo generar la tarjeta'); return }

      const negocio = companySettings?.tradeName || companySettings?.name || 'nuestro negocio'
      // El link corto (cbrfy.link, el mismo acortador de los PDFs): el link
      // real de Google es un JWT de ~800 caracteres que en WhatsApp ocupa
      // media pantalla.
      const texto = `Hola! Esta es tu tarjeta de sellos de ${negocio}. ` +
        `Ya tienes ${res.stamps} de ${res.goal}. Agregala a tu celular: ${res.shortUrl || res.url}`
      const soloDigitos = String(tel).replace(/\D/g, '')
      const numero = soloDigitos.length === 9 ? `51${soloDigitos}` : soloDigitos
      window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank')
    } finally {
      setSendingWalletCard(false)
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

  /**
   * Stock disponible para un ítem del carrito, con la prioridad que usa el POS:
   * variante específica > lote > "sin lote" > almacén. Devuelve null si el
   * producto ya no existe en el catálogo.
   *
   * Estaba escrito dos veces dentro de updateQuantity (subir de a uno y fijar
   * cantidad). Se extrajo para que la validación al cobrar mida EXACTAMENTE lo
   * mismo que la de agregar; si fueran dos cálculos distintos, uno dejaría pasar
   * lo que el otro bloquea.
   */
  const getCartItemStockInfo = (item) => {
    // productsRaw, no products: un item puede llegar al carrito desde una
    // cotizacion, nota de venta o edicion aunque este oculto en esta sucursal.
    // Con la lista filtrada devolvia null y ese item se saltaba TODA la
    // validacion de stock (getStockShortages lo ignoraba en silencio).
    const productData = productsRaw.find(p => p.id === item.id)
    if (!productData) return null

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
      // SUMAR todos los registros con el mismo batchNumber: cubre bases con lotes
      // duplicados (mismo lote creado varias veces antes del fix de merge en compras).
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

    return { productData, availableStock, stockMsg, factor: item.presentationFactor || 1 }
  }

  /**
   * Ítems del carrito que piden más de lo que hay disponible.
   *
   * Las cotizaciones y los pedidos online entran al carrito por `setCart()`, sin
   * pasar por las validaciones de agregar ni de cambiar cantidad, y al cobrar lo
   * único que se revisaba eran los insumos de recetas. Por ahí se colaban las
   * ventas sin stock que reportó el usuario (31-jul-2026): el POS descontaba a
   * negativo y el inventario quedaba descuadrado.
   *
   * Devuelve [] si el negocio activó "permitir vender sin stock" — ahí es una
   * decisión del dueño, no un descuido.
   */
  const getStockShortages = (cartToCheck = cart) => {
    if (permiteSinStock) return []
    const shortages = []
    for (const item of cartToCheck) {
      if (item.isCustom || item.stock === null) continue
      const info = getCartItemStockInfo(item)
      // Sin ficha o sin control de stock: no hay nada que validar.
      if (!info || info.productData.trackStock === false) continue

      const { availableStock, stockMsg, factor } = info
      const disponible = factor > 1 ? Math.floor(availableStock / factor) : availableStock
      if (item.quantity > disponible) {
        shortages.push({
          name: item.name,
          pedido: item.quantity,
          disponible: parseFloat(Number(disponible).toFixed(2)),
          unidad: factor > 1 ? (item.presentationName || 'presentaciones') : '',
          donde: stockMsg,
        })
      }
    }
    return shortages
  }

  // Consulta de stock en otras sedes: se activa desde Configuración > Ventas y
  // solo tiene sentido si el negocio tiene más de una sucursal.
  const verStockDeOtrasSucursales = !!businessSettings?.showOtherBranchesStock
    && !hideStockInPOS
    && todasLasSucursales.length > 0

  const getStockBadge = product => {
    // Vale también para los productos CON variantes. Antes cada vista les
    // pintaba su propio texto plano —tres copias del mismo número con tres
    // colores distintos— y como ese texto no era el badge, no se podía tocar:
    // en un producto con variantes no había forma de consultar las otras
    // sucursales. `getCurrentWarehouseStock` ya suma las variantes, así que el
    // número es el mismo de siempre.
    const warehouseStock = getCurrentWarehouseStock(product)

    // Un producto sin control de stock lo dice, venga por `stock: null` o por
    // `trackStock: false`. Antes el segundo caso caía abajo e imprimía el
    // "Infinity" con el que getTotalAvailableStock representa lo ilimitado.
    if (sinControlDeStock(product)) {
      return <span className="text-[10px] sm:text-xs text-gray-400 whitespace-nowrap">Sin control</span>
    }

    // El texto es el mismo de siempre; lo que cambia es que se puede tocar.
    const contenido = warehouseStock === 0
      ? <span className="text-[10px] sm:text-xs text-red-600 font-semibold whitespace-nowrap">Sin stock</span>
      : (() => {
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
        })()

    if (!verStockDeOtrasSucursales) return contenido

    // stopPropagation: la tarjeta entera agrega al carrito, y consultar el
    // stock no debe vender nada.
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setStockSucursalesDe(product) }}
        title="Ver el stock en las otras sucursales"
        className="inline-flex items-center gap-1 hover:opacity-70"
      >
        <Store className="w-3 h-3 text-gray-400 shrink-0" />
        {contenido}
      </button>
    )
  }

  // Selector Contado/Crédito + vencimiento + cuotas. Compartido por FACTURA y
  // BOLETA (SUNAT no exige la forma de pago en boletas — reglas 3244-3248 solo
  // existen para factura — pero tampoco la prohíbe: el XML la declara igual).
  // Las ramas de detracción son inertes en boleta (hasDetraction solo se
  // activa en factura).
  const formaPagoCreditoBlock = (
    <>
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
            // Una factura de anticipo NO puede ser a crédito: el anticipo es
            // dinero YA recibido. Al pasar a crédito se desmarca con aviso.
            if (isAdvanceInvoice) {
              setIsAdvanceInvoice(false)
              toast.info('Se desmarcó "Factura de anticipo": un anticipo es un pago ya recibido, no puede ser a crédito.')
            }
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
          {/* Con cuotas, esta fecha no manda: el XML declara una PaymentTerms
              por cuota y solo cae a la fecha suelta si no hay ninguna. Dejarla
              a la vista con un valor puesto hacía creer que sí. */}
          {paymentInstallments.length > 0 ? (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
              El vencimiento lo marcan las cuotas de abajo.
            </p>
          ) : (
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Fecha de Vencimiento</label>
              <input
                type="date"
                value={paymentDueDate}
                onChange={e => setPaymentDueDate(e.target.value)}
                min={dayAfterLocalDate(emissionDate)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}

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
                    const tc = currency === 'USD' ? (Number(exchangeRate) || 1) : 1
                    montoInicial = amounts.total - calcularDetraccion(amounts.total, tc, detractionRate).doc
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
                      const tc = currency === 'USD' ? (Number(exchangeRate) || 1) : 1
                      montoNeto = amounts.total - calcularDetraccion(amounts.total, tc, detractionRate).doc
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
                      min={dayAfterLocalDate(emissionDate)}
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
    </>
  )

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
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Punto de Venta</h1>
                  <GuideLink />
                </div>
                <button
                  onClick={() => setExpandedCart(prev => !prev)}
                  className="hidden lg:flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  title={expandedCart ? 'Expandir productos' : 'Expandir documento'}
                >
                  {expandedCart ? <PanelRightClose className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>
                {editingInvoiceId && (
                  <Badge variant="warning" className="bg-primary-600 text-white animate-pulse">
                    <Edit2 className="w-3 h-3 mr-1" />
                    Editando {editingInvoiceData?.series}-{editingInvoiceData?.number}
                  </Badge>
                )}
                {tableData && (
                  <Badge variant="default" className="bg-primary-600 text-white">
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
              {getRootCategories(categoriasVisibles).map((category) => {
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

          {/* Combustibles: arriba del catálogo, no en lugar de él. El grifo
              vende aceite y gaseosa por la misma caja. */}
          {modoEstacion && combustibles.length > 0 && (
            <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4 ${saleCompleted ? 'opacity-50 pointer-events-none' : ''}`}>
              {combustibles.map(combustible => (
                <button
                  key={combustible.id}
                  onClick={() => { if (saleCompleted) return; setCombustibleElegido(combustible) }}
                  className="flex flex-col items-start gap-1 p-3 sm:p-4 bg-white border-2 border-gray-200 rounded-lg hover:border-primary-400 hover:bg-primary-50 active:bg-primary-100 transition-colors text-left touch-no-hover"
                >
                  <Fuel className="w-5 h-5 text-primary-600" />
                  <span className="font-semibold text-sm sm:text-base text-gray-900 leading-tight line-clamp-2">
                    {combustible.name}
                  </span>
                  <span className="text-xs sm:text-sm text-gray-600">
                    {formatCurrency(toSessionCurrency(Number(combustible.price) || 0), currency)} / gal
                  </span>
                </button>
              ))}
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
                    !permiteSinStock
                  const expirationStatus = getProductExpirationStatus(product)
                  const isExpired = expirationStatus && !expirationStatus.canSell
                  const noIngredients = !permiteSinStock && productsWithoutIngredients.has(product.id)
                  // Alcanza para prepararlo, pero un insumo llegó a su mínimo.
                  // Avisa siempre: aunque el dueño permita vender en negativo,
                  // querer saber que se acaba el pollo no es lo mismo que
                  // querer que lo bloqueen.
                  const lowIngredients = !noIngredients && insumosBajos.has(product.id)
                  // La tarjeta NO lleva el atributo `disabled`: un botón
                  // deshabilitado se traga los clics de todo lo que tiene
                  // dentro, y acá dentro va el botón que consulta el stock de
                  // las otras sucursales. Con `disabled` ese botón quedaba
                  // muerto justo cuando el producto está agotado, que es el
                  // único caso para el que la consulta existe ("acá no me
                  // queda, ¿hay en la otra tienda?"). Se resuelve con
                  // `aria-disabled` más una guarda en el onClick: no se puede
                  // agregar al carrito, y lo gris sigue saliendo de las clases,
                  // no del atributo, así que no cambia nada a la vista.
                  const isDisabled = isOutOfStock || isExpired || noIngredients
                  const quantityInCart = cart
                    .filter(item => item.id === product.id)
                    .reduce((sum, item) => sum + item.quantity, 0)

                  return (
                    <button
                      key={product.id}
                      onClick={() => { if (isDisabled) return; addToCart(product) }}
                      aria-disabled={isDisabled}
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
                          {lowIngredients && (
                            <span
                              title={motivosInsumo.get(product.id) || 'Algún insumo llegó a su mínimo'}
                              className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium bg-yellow-500 text-white"
                            >
                              Stock bajo
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-500 mt-0.5 truncate">
                          {(product.sku || product.code || product.barcode) && (
                            <span className="truncate">{product.sku || product.code || product.barcode}</span>
                          )}
                          {product.marca && <span className="text-purple-600 font-medium truncate">· {product.marca}</span>}
                          {product.location && <span className="font-mono text-primary-600">· {product.location}</span>}
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
                            {getStockBadge(product)}
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
                    !permiteSinStock

                  // FEFO: Verificar estado de vencimiento
                  const expirationStatus = getProductExpirationStatus(product)
                  const isExpired = expirationStatus && !expirationStatus.canSell
                  // Producto con receta cuyos insumos no alcanzan para 1 unidad.
                  // El badge se muestra ANTES de que el mozo arme el carrito, para
                  // que no se entere recién al cobrar. Sólo aplica cuando el dueño
                  // NO permitió vender sin stock (en ese modo no avisamos).
                  const noIngredients = !permiteSinStock && productsWithoutIngredients.has(product.id)
                  // Alcanza para prepararlo, pero un insumo llegó a su mínimo.
                  // Avisa siempre: aunque el dueño permita vender en negativo,
                  // querer saber que se acaba el pollo no es lo mismo que
                  // querer que lo bloqueen.
                  const lowIngredients = !noIngredients && insumosBajos.has(product.id)
                  // La tarjeta NO lleva el atributo `disabled`: un botón
                  // deshabilitado se traga los clics de todo lo que tiene
                  // dentro, y acá dentro va el botón que consulta el stock de
                  // las otras sucursales. Con `disabled` ese botón quedaba
                  // muerto justo cuando el producto está agotado, que es el
                  // único caso para el que la consulta existe ("acá no me
                  // queda, ¿hay en la otra tienda?"). Se resuelve con
                  // `aria-disabled` más una guarda en el onClick: no se puede
                  // agregar al carrito, y lo gris sigue saliendo de las clases,
                  // no del atributo, así que no cambia nada a la vista.
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
                  onClick={() => { if (isDisabled) return; addToCart(product) }}
                  aria-disabled={isDisabled}
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

                  {/* Badge "Stock bajo" — se puede preparar, pero un insumo
                      llegó a su mínimo. Mismo lugar que "Sin insumos" porque
                      son excluyentes. */}
                  {lowIngredients && (
                    <div
                      title={motivosInsumo.get(product.id) || 'Algún insumo llegó a su mínimo'}
                      className="absolute top-1 right-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-500 text-white z-10 shadow-sm"
                    >
                      Stock bajo
                    </div>
                  )}

                  {/* Badge de vencimiento */}
                  {!noIngredients && !lowIngredients && expirationStatus && expirationStatus.status !== 'ok' && (
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
                    {/* Name - más pequeño en móvil, truncado en tablet.
                        El title es un tooltip nativo al pasar el mouse: con varias
                        presentaciones del mismo producto (perfumería) el nombre
                        recortado no alcanza para distinguirlas y había que adivinar
                        o escanear el código. */}
                    <p
                      title={product.name}
                      className={`font-semibold text-xs sm:text-sm leading-tight line-clamp-2 ${isExpired ? 'text-red-700' : 'text-gray-900'}`}
                    >
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
                      {product.location && <p className="font-mono text-primary-600">{product.location}</p>}
                    </div>
                    {/* Tablet/Desktop: código compacto en una línea */}
                    <p
                      title={`${product.sku || product.code || product.barcode || ''}${product.location ? ` | ${product.location}` : ''}`}
                      className="hidden sm:block text-xs text-gray-500 mt-1 truncate"
                    >
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
                    {isPharmaLikeMode(businessMode) && product.laboratoryName && (
                      <p className="text-[10px] sm:text-xs text-primary-600 font-medium mt-0.5 truncate">{product.laboratoryName}</p>
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
                                <span className="text-[10px] sm:text-xs text-gray-500 truncate">
                                  {lvl.label}
                                  {/* Desde cuántas unidades se aplica este precio (precio
                                      automático por cantidad): el cajero ya no tiene que
                                      memorizarlo ni descubrirlo subiendo la cantidad. */}
                                  {lvl.minQty > 1 && (
                                    <span className="text-emerald-600 font-semibold"> desde {lvl.minQty}</span>
                                  )}
                                </span>
                                <span className={`text-xs sm:text-sm font-bold whitespace-nowrap ${isExpired ? 'text-red-600' : 'text-primary-600'}`}>
                                  {formatUnitPrice(toSessionCurrency(lvl.value), currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                          {!hideStockInPOS && getStockBadge(product)}
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
                            {!hideStockInPOS && getStockBadge(product)}
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
                              {!hideStockInPOS && getStockBadge(product)}
                              {product.hasVariants && (
                                <span className="text-[10px] text-purple-500 font-medium">Ver opciones</span>
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
                // Un vendedor puede atender en varias sucursales (branchIds).
                const filteredSellers = vendedoresDeSucursal(sellers, selectedBranch?.id)

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
                    className={`flex-1 px-3 py-2 text-sm font-medium border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                      documentType ? 'border-gray-300' : 'border-amber-400 ring-1 ring-amber-300 text-amber-700'
                    }`}
                  >
                    {/* Placeholder cuando el default del negocio es "Ninguno":
                        obliga a elegir; el checkout bloquea si queda vacío. */}
                    {!documentType && (
                      <option value="" disabled>Selecciona un tipo…</option>
                    )}
                    {/* availableDocTypes ya cruza: comprobantes del negocio
                        (un RUS desactiva Factura), permiso del sub-usuario y
                        conexion SUNAT. */}
                    {availableDocTypes.includes('boleta') && (
                      <option value="boleta">Boleta de Venta</option>
                    )}
                    {availableDocTypes.includes('factura') && (
                      <option value="factura">Factura Electrónica</option>
                    )}
                    {availableDocTypes.includes('nota_venta') && (
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

              {/* 4a. Afectación IGV de esta venta.
                  Solo aparece con la opción activada en Configuración. Es por
                  VENTA y no por producto: el caso que resuelve —vender desde la
                  Amazonía a Lima— cambia toda la operación, no un artículo. */}
              {allowManualTaxAffectation && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                    <Percent className="w-3.5 h-3.5" />
                    IGV de esta venta
                  </label>
                  <select
                    value={saleTaxMode}
                    onChange={(e) => setSaleTaxMode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="auto">Según lo configurado</option>
                    <option value="gravado">
                      Gravado ({Number(taxConfig.igvRate) > 0 ? taxConfig.igvRate : 18}%)
                    </option>
                    <option value="exonerado">Exonerado (sin IGV)</option>
                  </select>
                  {saleTaxMode !== 'auto' && (
                    <p className="text-xs text-amber-700 mt-1">
                      El total no cambia: {saleTaxMode === 'gravado'
                        ? 'el IGV se calcula por dentro del precio.'
                        : 'el precio va completo, sin IGV.'}
                    </p>
                  )}
                </div>
              )}

              {/* 4a-bis. POR CONSUMO.
                  Restaurante con el módulo activado en Configuración. Es por
                  VENTA: arranca en lo que eligió el negocio y el cajero puede
                  desmarcarlo si el cliente pide el detalle. */}
              {businessMode === 'restaurant' && porConsumoConfig.enabled && (
                <label className="flex items-start gap-2.5 p-2.5 border border-gray-300 rounded-lg cursor-pointer hover:border-primary-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={porConsumoVenta}
                    onChange={(e) => setPorConsumoVenta(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium text-gray-900">
                      Emitir como &quot;{porConsumoConfig.texto}&quot;
                    </span>
                    <span className="block text-xs text-gray-500">
                      {porConsumoVenta
                        ? 'El comprobante sale con una sola línea. El detalle de platos queda guardado en el sistema.'
                        : 'El comprobante sale con el detalle de cada plato.'}
                    </span>
                  </span>
                </label>
              )}

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
                          <span className="text-[9px] px-1 py-0.5 rounded bg-primary-100 text-primary-700 border border-primary-200 font-medium">SBS</span>
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
                  ref={emissionDateInputRef}
                  type="date"
                  value={emissionDate}
                  // Los límites salen del mismo módulo que la validación al emitir.
                  // Ojo: min/max solo pintan gris el calendario, NO restringen lo
                  // que se teclea. Por eso el ajuste va en onBlur (y la barrera
                  // final sigue estando en handleCheckout).
                  min={emissionDateLimits.min}
                  max={emissionDateLimits.max}
                  onChange={e => { setEmissionDate(e.target.value); emissionDateEditedRef.current = true }}
                  // Al salir del campo, una fecha fuera de rango se ajusta al
                  // límite y se avisa. No se hace en onChange porque el campo
                  // emite un cambio por cada dígito del año (2026 pasa por 0002,
                  // 0020, 0202) y se volvería imposible escribirla a mano.
                  onBlur={e => {
                    const ajuste = clampEmissionDate(e.target.value, documentType)
                    if (ajuste.changed) {
                      setEmissionDate(ajuste.value)
                      toast.warning(ajuste.message)
                    }
                  }}
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
                        placeholder="Buscar por nombre, documento o celular..."
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
                                // Criterio unico (utils/posCustomerData): esta lista
                                // estaba escrita a mano y le faltaban la licencia, la
                                // tarjeta de propiedad y los datos del vehiculo. El
                                // cliente los tenia guardados y salian vacios, asi que
                                // habia que teclearlos en cada venta.
                                setCustomerData(datosDeCliente(customer))
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                            >
                              <p className="font-medium text-gray-900 truncate">{customer.name || customer.businessName}</p>
                              {/* El celular se muestra junto al documento: si se
                                  buscó por número, es lo que confirma que este
                                  es el cliente (y no un homónimo). */}
                              <p className="text-xs text-gray-500 truncate">
                                {[customer.documentNumber, customer.phone].filter(Boolean).join(' · ')}
                              </p>
                              {showStudentField && customer.studentName && (
                                <p className="text-xs text-primary-600 truncate">Alumno: {customer.studentName}</p>
                              )}
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
                      const allPetNames = pets.map(p => cleanText(p.name)).filter(Boolean).join(', ')
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
                            // Los nombres del campo se leen ya limpios, pero el nombre GUARDADO
                            // puede traer espacios en los bordes ("Flaca "). Comparando en crudo,
                            // el chip quedaba apagado aunque "Todas" sí lo hubiera escrito, y
                            // volver a tocarlo AGREGABA el nombre otra vez: salía duplicado en el
                            // comprobante. Se compara limpio de los dos lados.
                            const selectedNames = customerData.petName.split(',').map(s => cleanText(s)).filter(Boolean)
                            const nombreDe = (p) => cleanText(p.name)
                            const allOn = pets.every(p => selectedNames.includes(nombreDe(p)))
                            const togglePet = (name) => {
                              const limpio = cleanText(name)
                              const next = selectedNames.includes(limpio)
                                ? selectedNames.filter(n => n !== limpio)
                                : [...selectedNames, limpio]
                              setCustomerData({ ...customerData, petName: next.join(', ') })
                            }
                            return (
                              <div className="flex flex-wrap gap-1">
                                {pets.map(p => {
                                  const on = selectedNames.includes(nombreDe(p))
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
                    {companySettings?.posCustomFields?.showLicenseNumberField && (
                      <input
                        type="text"
                        value={customerData.licenseNumber}
                        onChange={e => setCustomerData({ ...customerData, licenseNumber: e.target.value.toUpperCase() })}
                        placeholder="N° de Licencia / Resolución"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}
                    {companySettings?.posCustomFields?.showPropertyCardField && (
                      <input
                        type="text"
                        value={customerData.propertyCard}
                        onChange={e => setCustomerData({ ...customerData, propertyCard: e.target.value.toUpperCase() })}
                        placeholder="Tarjeta de Propiedad"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}

                    {/* Forma de Pago (bloque compartido con boleta: formaPagoCreditoBlock) */}
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      {formaPagoCreditoBlock}

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
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Monto a depositar</label>
                                    <div className="px-2 py-1.5 text-xs bg-amber-100 border border-amber-300 rounded-lg text-amber-800 font-bold">
                                      S/ {(detraccionActual?.pen || 0).toFixed(2)}
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
                                  {/* Cada monto en SU moneda. Antes las dos lineas usaban
                                      formatCurrency sin moneda, asi que pintaban "S/" sobre
                                      cifras en dolares. */}
                                  <div className="flex justify-between text-amber-700">
                                    <span>(-) Detracción ({detraccionActual?.tasa || 0}%):</span>
                                    <span className="font-medium">
                                      {formatCurrency(detraccionActual?.doc || 0, currency)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between font-bold text-green-700 border-t pt-1 mt-1">
                                    <span>Neto a Pagar:</span>
                                    <span>{formatCurrency(detraccionActual?.neto || 0, currency)}</span>
                                  </div>
                                  {currency === 'USD' && (
                                    <p className="text-[10px] text-gray-500 mt-1 pt-1 border-t">
                                      La detracción se deposita en <strong>S/ {(detraccionActual?.pen || 0).toFixed(2)}</strong> en
                                      el Banco de la Nación (TC {Number(exchangeRate) || 1}). El cliente paga el neto en dólares.
                                    </p>
                                  )}
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

                      {/* Sección de Anticipos */}
                      <div className="mt-3 pt-2 border-t border-gray-100 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isAdvanceInvoice}
                            onChange={e => {
                              setIsAdvanceInvoice(e.target.checked)
                              if (e.target.checked) {
                                // Una factura no puede ser anticipo Y deducir anticipos a la vez
                                setDeductAdvances(false)
                                setAdvancesList([])
                                // El anticipo es dinero YA recibido → siempre al contado
                                if (paymentType === 'credito') {
                                  setPaymentType('contado')
                                  setPaymentDueDate('')
                                  setPaymentInstallments([])
                                  toast.info('La forma de pago cambió a Contado: un anticipo es un pago ya recibido.')
                                }
                              }
                            }}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-xs font-medium text-gray-700">Factura de anticipo</span>
                          <span className="text-[10px] text-gray-400">(pago recibido antes de entregar el bien/servicio)</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={deductAdvances}
                            onChange={e => {
                              setDeductAdvances(e.target.checked)
                              if (e.target.checked) {
                                setIsAdvanceInvoice(false)
                                loadCandidateAdvances()
                              } else {
                                setAdvancesList([])
                              }
                            }}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-xs font-medium text-gray-700">Deducir anticipos facturados</span>
                        </label>

                        {deductAdvances && (
                          <div className="space-y-2 bg-primary-50 p-2 rounded-lg border border-primary-200">
                            {loadingAdvances ? (
                              <div className="flex items-center gap-2 text-xs text-gray-500 py-1">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Buscando facturas de anticipo del cliente...
                              </div>
                            ) : candidateAdvances.length === 0 ? (
                              <p className="text-[10px] text-gray-500">
                                No se encontraron facturas de anticipo aceptadas de este cliente.
                                {!/^\d{11}$/.test(customerData.documentNumber || '') && ' Ingresa primero el RUC del cliente.'}
                                {' '}También puedes agregarla manualmente abajo.
                              </p>
                            ) : (
                              <div className="space-y-1 max-h-28 overflow-y-auto">
                                {candidateAdvances.map(inv => (
                                  <label key={inv.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-primary-100 rounded px-1 py-0.5">
                                    <input
                                      type="checkbox"
                                      checked={advancesList.some(a => a.invoiceId === inv.id)}
                                      onChange={() => toggleAdvance(inv)}
                                      className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded"
                                    />
                                    <span className="font-medium">{inv.number}</span>
                                    <span className="text-gray-500 ml-auto">{formatCurrency(inv.total, inv.currency)}</span>
                                  </label>
                                ))}
                              </div>
                            )}

                            {/* Entrada manual (anticipo emitido fuera del sistema o antes de esta función) */}
                            {(() => {
                              const manual = advancesList.find(a => !a.invoiceId)
                              return (
                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-primary-200">
                                  <input
                                    type="text"
                                    value={manual?.fullNumber || ''}
                                    onChange={e => {
                                      const v = e.target.value.toUpperCase()
                                      setAdvancesList(prev => {
                                        const rest = prev.filter(a => a.invoiceId)
                                        if (!v && !manual?.amount) return rest
                                        return [...rest, { fullNumber: v, amount: manual?.amount || '' }]
                                      })
                                    }}
                                    placeholder="Serie-Número (F001-95)"
                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={manual?.amount || ''}
                                    onChange={e => {
                                      const v = e.target.value
                                      setAdvancesList(prev => {
                                        const rest = prev.filter(a => a.invoiceId)
                                        if (!v && !manual?.fullNumber) return rest
                                        return [...rest, { fullNumber: manual?.fullNumber || '', amount: v }]
                                      })
                                    }}
                                    placeholder="Monto (con IGV)"
                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                                  />
                                </div>
                              )
                            })()}

                            {advancesApplied > 0 && (
                              <div className="text-[10px] text-gray-600 bg-white p-2 rounded border border-gray-200">
                                <div className="flex justify-between">
                                  <span>Total operación:</span>
                                  <span className="font-medium">{formatCurrency(amounts.total, currency)}</span>
                                </div>
                                <div className="flex justify-between text-primary-700">
                                  <span>(-) Anticipos:</span>
                                  <span className="font-medium">{formatCurrency(advancesApplied, currency)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-green-700 border-t pt-1 mt-1">
                                  <span>Saldo a pagar:</span>
                                  <span>{formatCurrency(amounts.total - advancesApplied, currency)}</span>
                                </div>
                              </div>
                            )}
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
                      const allPetNames = pets.map(p => cleanText(p.name)).filter(Boolean).join(', ')
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
                            // Los nombres del campo se leen ya limpios, pero el nombre GUARDADO
                            // puede traer espacios en los bordes ("Flaca "). Comparando en crudo,
                            // el chip quedaba apagado aunque "Todas" sí lo hubiera escrito, y
                            // volver a tocarlo AGREGABA el nombre otra vez: salía duplicado en el
                            // comprobante. Se compara limpio de los dos lados.
                            const selectedNames = customerData.petName.split(',').map(s => cleanText(s)).filter(Boolean)
                            const nombreDe = (p) => cleanText(p.name)
                            const allOn = pets.every(p => selectedNames.includes(nombreDe(p)))
                            const togglePet = (name) => {
                              const limpio = cleanText(name)
                              const next = selectedNames.includes(limpio)
                                ? selectedNames.filter(n => n !== limpio)
                                : [...selectedNames, limpio]
                              setCustomerData({ ...customerData, petName: next.join(', ') })
                            }
                            return (
                              <div className="flex flex-wrap gap-1">
                                {pets.map(p => {
                                  const on = selectedNames.includes(nombreDe(p))
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
                    {companySettings?.posCustomFields?.showLicenseNumberField && (
                      <input
                        type="text"
                        value={customerData.licenseNumber}
                        onChange={e => setCustomerData({ ...customerData, licenseNumber: e.target.value.toUpperCase() })}
                        placeholder="N° de Licencia / Resolución"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}
                    {companySettings?.posCustomFields?.showPropertyCardField && (
                      <input
                        type="text"
                        value={customerData.propertyCard}
                        onChange={e => setCustomerData({ ...customerData, propertyCard: e.target.value.toUpperCase() })}
                        placeholder="Tarjeta de Propiedad"
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

                    {/* Forma de Pago: boletas también pueden venderse al crédito
                        (SUNAT no exige ni prohíbe la forma de pago en boletas;
                        las reglas 3244-3248 son solo de factura). */}
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      {formaPagoCreditoBlock}
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
                      const allPetNames = pets.map(p => cleanText(p.name)).filter(Boolean).join(', ')
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
                            // Los nombres del campo se leen ya limpios, pero el nombre GUARDADO
                            // puede traer espacios en los bordes ("Flaca "). Comparando en crudo,
                            // el chip quedaba apagado aunque "Todas" sí lo hubiera escrito, y
                            // volver a tocarlo AGREGABA el nombre otra vez: salía duplicado en el
                            // comprobante. Se compara limpio de los dos lados.
                            const selectedNames = customerData.petName.split(',').map(s => cleanText(s)).filter(Boolean)
                            const nombreDe = (p) => cleanText(p.name)
                            const allOn = pets.every(p => selectedNames.includes(nombreDe(p)))
                            const togglePet = (name) => {
                              const limpio = cleanText(name)
                              const next = selectedNames.includes(limpio)
                                ? selectedNames.filter(n => n !== limpio)
                                : [...selectedNames, limpio]
                              setCustomerData({ ...customerData, petName: next.join(', ') })
                            }
                            return (
                              <div className="flex flex-wrap gap-1">
                                {pets.map(p => {
                                  const on = selectedNames.includes(nombreDe(p))
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
                    {companySettings?.posCustomFields?.showLicenseNumberField && (
                      <input
                        type="text"
                        value={customerData.licenseNumber}
                        onChange={e => setCustomerData({ ...customerData, licenseNumber: e.target.value.toUpperCase() })}
                        placeholder="N° de Licencia / Resolución (opcional)"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    )}
                    {companySettings?.posCustomFields?.showPropertyCardField && (
                      <input
                        type="text"
                        value={customerData.propertyCard}
                        onChange={e => setCustomerData({ ...customerData, propertyCard: e.target.value.toUpperCase() })}
                        placeholder="Tarjeta de Propiedad (opcional)"
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

                {/* Tarjeta de sellos del cliente: el cajero la ve ANTES de cobrar */}
                {companySettings?.loyaltyConfig?.enabled && customerData?.phone && (() => {
                  const meta = companySettings.loyaltyConfig.goal || 10
                  const sellos = loyaltyCard?.stamps || 0
                  // Programa vencido: la tarjeta se sigue viendo (el cliente
                  // preguntara) pero no se ofrece canje ni se promete nada.
                  const vigente = programaVigente(companySettings.loyaltyConfig)
                  const listo = vigente && sellos >= meta
                  return (
                    <div className={`mt-1.5 p-2 rounded border text-xs ${listo ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={listo ? 'text-amber-800 font-medium' : 'text-gray-600'}>
                          {loyaltyRedemption
                            ? 'Premio aplicado a esta venta'
                            : !vigente
                              ? `Programa vencido el ${vigenciaLegible(companySettings.loyaltyConfig)}`
                              : listo ? '🎁 Premio disponible' : `Sellos: ${sellos} de ${meta}`}
                        </span>
                        {loyaltyRedemption ? (
                          <button
                            type="button"
                            onClick={cancelarPremioFidelidad}
                            className="px-2 py-0.5 rounded border border-amber-400 text-amber-700 font-medium hover:bg-amber-100"
                          >
                            Quitar
                          </button>
                        ) : listo && (
                          <button
                            type="button"
                            disabled={isRedeeming}
                            onClick={async () => {
                              const tipoPremio = companySettings.loyaltyConfig.rewardType || 'text'
                              if (tipoPremio !== 'text') {
                                // Premio estructurado: se aplica a la venta y los
                                // sellos se descuentan al cobrar.
                                aplicarPremioFidelidad()
                                return
                              }
                              // Texto libre: canje manual, se descuenta al toque
                              // (el premio no vive en el sistema).
                              setIsRedeeming(true)
                              try {
                                const { redeemReward } = await import('@/services/loyaltyService')
                                const res = await redeemReward(idDeFidelizacion(companySettings, getBusinessId()), customerData.phone, {
                                  userName: user?.displayName || user?.email || '',
                                  note: companySettings.loyaltyConfig.reward || '',
                                  config: companySettings.loyaltyConfig,
                                  localId: getBusinessId(),
                                })
                                if (res.success) {
                                  toast.success(`Premio canjeado. Le quedan ${res.stamps} sellos.`)
                                  setLoyaltyCard(prev => (prev ? { ...prev, stamps: res.stamps } : prev))
                                } else {
                                  toast.error(res.error || 'No se pudo canjear')
                                }
                              } finally {
                                setIsRedeeming(false)
                              }
                            }}
                            className="px-2 py-0.5 rounded bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50"
                          >
                            {isRedeeming ? 'Canjeando…' : 'Canjear'}
                          </button>
                        )}
                      </div>
                      {loyaltyRedemption ? (
                        <p className="text-amber-700 mt-0.5">{loyaltyRedemption.label} — los sellos se descuentan al cobrar</p>
                      ) : listo && companySettings.loyaltyConfig.reward ? (
                        <p className="text-amber-700 mt-0.5">{companySettings.loyaltyConfig.reward}</p>
                      ) : null}
                      {/* Mandarle su tarjeta al celular. Solo si ya tiene
                          sellos: una tarjeta en cero no se le ofrece a nadie. */}
                      {sellos > 0 && (
                        <button
                          type="button"
                          onClick={handleSendWalletCard}
                          disabled={sendingWalletCard}
                          className="mt-1.5 text-[11px] text-primary-700 hover:underline disabled:opacity-50"
                        >
                          {sendingWalletCard ? 'Generando...' : 'Enviar su tarjeta por WhatsApp'}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Tipo de pedido para restaurante. Con "la venta del POS genera
                  la orden en Cocina" activo, el tipo decide lo que grita la
                  comanda (EN LOCAL / PARA LLEVAR), así que deja de ser un
                  select discreto y pasa a chips que se ven y se tocan de una.
                  Reporte del 14-ago: la venta salía PARA LLEVAR porque nadie
                  veía el select. */}
              {businessMode === 'restaurant' && (
                companySettings?.restaurantConfig?.posCreatesKitchenOrder === true && !tableData?.fromTable ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-3 gap-1.5">
                      {[['counter', 'En Local'], ['takeaway', 'Para Llevar'], ['delivery', 'Delivery']].map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setOrderType(key)}
                          className={`px-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            orderType === key
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sendToKitchen}
                        onChange={e => setSendToKitchen(e.target.checked)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      Enviar comanda a cocina
                    </label>
                  </div>
                ) : (
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
                )
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
                            {/* La descripción se ve COMPLETA, en varias líneas.
                                Antes se cortaba con puntos suspensivos —una sola
                                línea— y en rubros donde el nombre es la
                                descripción del servicio ("RECOJO, TRANSPORTE Y
                                DISPOSICIÓN FINAL DE RESIDUOS SÓLIDOS...") el
                                cajero no podía leer ni verificar lo que iba a
                                salir en el comprobante.
                                Editable: textarea que crece con el texto, para
                                corregirlo ahí mismo sin abrir otra ventana. */}
                            {companySettings?.allowNameEdit ? (
                              <AutoGrowTextarea
                                value={item.name}
                                onChange={(e) => updateItemName(item.cartId || item.id, e.target.value)}
                                className="font-semibold text-sm text-gray-900 w-full bg-transparent border-b border-dashed border-gray-300 focus:border-primary-500 focus:outline-none py-0.5"
                              />
                            ) : (
                              <p className="font-semibold text-sm text-gray-900 break-words leading-snug" title={item.name}>
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
                              {/* El precio de esta línea bajó por la cantidad TOTAL del
                                  producto (sumando otras variantes), no por su propia
                                  cantidad. Sin avisarlo, el cajero ve cambiar un renglón
                                  que no tocó y no entiende por qué. */}
                              {item.autoPriceByTotal && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200 font-medium"
                                  title="El precio bajó porque, sumando todas las variantes de este producto, se alcanzó la cantidad mínima."
                                >
                                  Precio por cantidad total
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
                                      className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 bg-primary-50 text-primary-700 text-[10px] rounded-full border border-primary-200"
                                    >
                                      <span className="font-medium">{m.serialNumber}</span>
                                      <button
                                        type="button"
                                        onClick={() => removeFromCart(m.cartId || m.id)}
                                        className="hover:bg-primary-200 rounded-full p-0.5 transition-colors"
                                        title="Quitar esta serie"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              ) : item.serialNumber && (
                                <span className="text-primary-600 truncate">S/N: {item.serialNumber}</span>
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
                                      const price = item.unitPrice ?? item.price ?? 0
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
                                      const price = item.unitPrice ?? item.price ?? 0
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
                              {!effectiveTaxConfig?.igvExempt && (
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
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${editingPriceWithoutIgv ? 'bg-primary-100 text-primary-700 font-semibold' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
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
                          {/* Promo programada aplicada: el cajero ve POR QUÉ hay
                              descuento. Editar el Dcto a mano la suelta. */}
                          {item.promoName && (
                            <span
                              className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 truncate max-w-[90px]"
                              title={`Promoción: ${item.promoName} (−${item.promoPercent}%)`}
                            >
                              ⚡ −{item.promoPercent}%
                            </span>
                          )}
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

                {/* Descuento General — plegado por defecto.
                    La mayoría de las ventas no llevan descuento ni cupón: tener
                    cuatro campos abiertos empujaba el total fuera de la vista y
                    obligaba a hacer scroll para cobrar. Se abre solo cuando ya
                    hay algo aplicado, para que no quede escondido. */}
                {cart.length > 0 && !hideDiscountInPOS && (
                  <div className="bg-green-50 border border-green-200 rounded-xl overflow-hidden min-w-0">
                    <button
                      type="button"
                      onClick={() => setShowDiscountSection(!showDiscountSection)}
                      className="w-full px-2.5 xl:px-4 py-2.5 xl:py-3 flex items-center justify-between hover:bg-green-100/60 transition-colors"
                      disabled={lastInvoiceData !== null}
                    >
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 xl:w-5 xl:h-5 text-green-600 shrink-0" />
                        <p className="text-sm xl:text-base text-green-800 font-semibold">
                          Descuento General
                          {(amounts.globalDiscount > 0 || appliedCoupon || appliedGiftCert) && (
                            <span className="ml-1.5 text-green-600">(1)</span>
                          )}
                        </p>
                      </div>
                      {showDiscountSection ? (
                        <ChevronUp className="w-5 h-5 text-green-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-green-600" />
                      )}
                    </button>
                    {showDiscountSection && (
                    <div className="px-2.5 xl:px-4 pb-2.5 xl:pb-4 space-y-2 xl:space-y-3">
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
                          disabled={lastInvoiceData !== null || !!appliedCoupon || loyaltyRedemption?.type === 'discount'}
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
                          disabled={lastInvoiceData !== null || !!appliedCoupon || loyaltyRedemption?.type === 'discount'}
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

                    {/* Cupón: el código llena el descuento de arriba y bloquea
                        los campos manuales hasta quitarlo. */}
                    {appliedCoupon ? (
                      <div className="flex items-center gap-2 bg-white border border-green-300 rounded-lg px-3 py-1.5">
                        <Tag className="w-4 h-4 text-green-600 shrink-0" />
                        <span className="text-sm font-mono font-semibold text-green-800 flex-1 truncate">
                          {appliedCoupon.id}
                          <span className="font-sans font-normal text-green-600 ml-2">
                            {appliedCoupon.type === 'percent' ? `-${appliedCoupon.value}%` : `-S/ ${Number(appliedCoupon.value).toFixed(2)}`}
                          </span>
                        </span>
                        <button
                          onClick={quitarCupon}
                          className="text-red-500 hover:text-red-700 text-xs font-medium shrink-0"
                          disabled={lastInvoiceData !== null}
                        >
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => { if (e.key === 'Enter') aplicarCupon() }}
                          placeholder="Código de cupón"
                          className="flex-1 min-w-0 px-2 xl:px-3 py-1.5 text-sm border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          disabled={lastInvoiceData !== null}
                        />
                        <button
                          onClick={aplicarCupon}
                          disabled={!couponInput.trim() || validatingCoupon || lastInvoiceData !== null}
                          className="shrink-0 px-3 py-1.5 text-sm font-medium text-green-700 bg-white border border-green-300 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                        >
                          {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar'}
                        </button>
                      </div>
                    )}

                    {/* Certificado de regalo: a diferencia del cupon (que es
                        un DESCUENTO), esto es un MEDIO DE PAGO — validar el
                        codigo habilita "Certificado de regalo" en los botones
                        de pago, capeado a su saldo. */}
                    {appliedGiftCert ? (
                      <div className="flex items-center gap-2 bg-white border border-violet-300 rounded-lg px-3 py-1.5">
                        <Gift className="w-4 h-4 text-violet-600 shrink-0" />
                        <span className="text-sm font-mono font-semibold text-violet-800 flex-1 truncate">
                          {appliedGiftCert.id}
                          <span className="font-sans font-normal text-violet-600 ml-2">
                            S/ {Number(appliedGiftCert.balance).toFixed(2)} disponibles
                          </span>
                        </span>
                        <button
                          onClick={quitarCertificado}
                          className="text-red-500 hover:text-red-700 text-xs font-medium shrink-0"
                          disabled={lastInvoiceData !== null}
                        >
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={giftCertInput}
                          onChange={(e) => setGiftCertInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => { if (e.key === 'Enter') aplicarCertificado() }}
                          placeholder="Certificado de regalo (GC...)"
                          className="flex-1 min-w-0 px-2 xl:px-3 py-1.5 text-sm border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                          disabled={lastInvoiceData !== null}
                        />
                        <button
                          onClick={aplicarCertificado}
                          disabled={!giftCertInput.trim() || validatingGiftCert || lastInvoiceData !== null}
                          className="shrink-0 px-3 py-1.5 text-sm font-medium text-violet-700 bg-white border border-violet-300 rounded-lg hover:bg-violet-100 disabled:opacity-50 transition-colors"
                        >
                          {validatingGiftCert ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Validar'}
                        </button>
                      </div>
                    )}
                    </div>
                    )}
                  </div>
                )}

                {/* Observaciones — a la vista, sin desplegable.
                    Es lo que más se escribe al cobrar (garantía, entrega,
                    indicaciones), así que tenerlo detrás de un clic sobraba. */}
                {cart.length > 0 && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 flex items-center gap-2 bg-gray-50">
                      <FileText className="w-5 h-5 text-primary-600" />
                      <span className="text-base font-medium text-gray-700">
                        Observaciones {generalNotes && <span className="text-primary-600">(1)</span>}
                      </span>
                    </div>
                    <div className="p-3 bg-white">
                      <textarea
                        value={generalNotes}
                        onChange={(e) => setGeneralNotes(e.target.value)}
                        placeholder="Ej: Garantía 6 meses, entrega programada, instrucciones especiales..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        disabled={lastInvoiceData !== null}
                      />
                      <p className="text-xs text-gray-500 mt-1.5">
                        Aparecen en el comprobante impreso y en el PDF.
                      </p>
                    </div>
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
                      <span className="text-gray-600">IGV ({Object.keys(amounts.igvByRate)[0] || effectiveTaxConfig.igvRate}%):</span>
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
                  <div className="flex justify-between text-sm text-primary-700">
                    <span>Op. Inafectas:</span>
                    <span className="font-medium">{formatCurrency(amounts.inafecto.total, currency)}</span>
                  </div>
                )}
                {/* Aviso de venta sin IGV. Distingue si es el régimen del
                    negocio o una elección puntual de esta venta, porque son
                    dos cosas distintas y el cajero necesita saber cuál rige. */}
                {effectiveTaxConfig.igvExempt && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md">
                    <span className="font-medium">
                      {saleTaxMode === 'exonerado'
                        ? 'Esta venta sale exonerada de IGV'
                        : 'Empresa exonerada de IGV'}
                    </span>
                  </div>
                )}
                {/* Con anticipos deducidos: desglose Total operación / Anticipos / Total a pagar */}
                {advancesApplied > 0 && (
                  <>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-gray-600">Total operación:</span>
                      <span className="font-medium">{formatCurrency(amounts.total, currency)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-primary-700">
                      <span>(-) Anticipos facturados:</span>
                      <span className="font-medium">- {formatCurrency(advancesApplied, currency)}</span>
                    </div>
                  </>
                )}
                <div className={`flex justify-between text-xl sm:text-2xl font-bold ${advancesApplied > 0 ? '' : 'border-t'} pt-2`}>
                  <span className="flex items-center gap-2">
                    {advancesApplied > 0 ? 'Total a pagar:' : 'Total:'}
                    {posMultiCurrencyOn && exchangeRate > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">TC {exchangeRate}</span>
                    )}
                  </span>
                  <span className="text-primary-600">{formatCurrency(amounts.total - advancesApplied, currency)}</span>
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

                        {/* Vencimiento y cuotas del saldo (opcional, se activa en
                            Configuración > Ventas). A diferencia de la factura, acá
                            las cuotas se calculan sobre el SALDO pendiente, no sobre
                            el total: lo que ya pagó al inicio no se debe. */}
                        {notaVentaCreditTermsOn && notaVentaBalance > 0 && (
                          <div className="pt-2 mt-1 border-t border-gray-200 space-y-2">
                            {paymentInstallments.length > 0 ? (
                              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
                                El vencimiento lo marcan las cuotas de abajo.
                              </p>
                            ) : (
                              <div>
                                <label className="text-xs text-gray-600 mb-0.5 block">Fecha de vencimiento del saldo</label>
                                <input
                                  type="date"
                                  value={paymentDueDate}
                                  onChange={e => setPaymentDueDate(e.target.value)}
                                  min={emissionDate}
                                  disabled={lastInvoiceData !== null}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                              </div>
                            )}

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-600">Cuotas (opcional)</label>
                                <button
                                  type="button"
                                  disabled={lastInvoiceData !== null}
                                  onClick={() => {
                                    const yaAsignado = paymentInstallments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
                                    const restante = Math.max(0, notaVentaBalance - yaAsignado)
                                    setPaymentInstallments([...paymentInstallments, {
                                      number: paymentInstallments.length + 1,
                                      amount: paymentInstallments.length === 0 ? notaVentaBalance.toFixed(2) : (restante > 0 ? restante.toFixed(2) : ''),
                                      dueDate: paymentDueDate || getLocalDateString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
                                    }])
                                  }}
                                  className="text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
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
                                        disabled={lastInvoiceData !== null}
                                        className="flex-1 min-w-0 px-1.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                                        disabled={lastInvoiceData !== null}
                                        className="w-28 px-1.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                      />
                                      <button
                                        type="button"
                                        disabled={lastInvoiceData !== null}
                                        onClick={() => {
                                          setPaymentInstallments(
                                            paymentInstallments.filter((_, i) => i !== index).map((inst, i) => ({ ...inst, number: i + 1 }))
                                          )
                                        }}
                                        className="text-red-500 hover:text-red-700 p-0.5 disabled:opacity-50"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Aviso si las cuotas no cuadran con el saldo */}
                              {paymentInstallments.length > 0 && Math.abs(installmentsTotal - notaVentaBalance) > 0.01 && (
                                <p className="text-xs text-amber-600 mt-1">
                                  Las cuotas suman {formatCurrency(installmentsTotal, currency)} y el saldo es {formatCurrency(notaVentaBalance, currency)}.
                                </p>
                              )}
                              {paymentInstallments.length === 0 && (
                                <p className="text-xs text-gray-500">
                                  Sin cuotas: el saldo vence completo en la fecha indicada.
                                </p>
                              )}
                            </div>
                          </div>
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
                          {/* Con cuotas manda cada cuota, no esta fecha: mostrarla
                              aca seria un tercer plazo a la vista que no existe. */}
                          {paymentDueDate && paymentInstallments.length === 0 && (
                            <p className="text-xs text-amber-700 mt-1">
                              <strong>Vencimiento:</strong> {new Date(paymentDueDate + 'T00:00:00').toLocaleDateString('es-PE')}
                            </p>
                          )}
                          {paymentInstallments.length > 0 && (
                            <p className="text-xs text-amber-700 mt-1">
                              <strong>Cuotas:</strong> {paymentInstallments.length}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (enablePartialPayment && amountToPay === 0) ? (
                    <div className="p-4 bg-primary-50 border border-primary-300 rounded-lg">
                      <div className="flex items-start gap-3">
                        <CreditCard className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-blue-900">
                            Venta al Crédito
                          </p>
                          <p className="text-xs text-primary-700 mt-1">
                            No requiere pago inmediato. El cliente pagará después.
                          </p>
                          <p className="text-xs text-primary-700 mt-2">
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

                    // Métodos del negocio (Configuración: ocultos + propios), filtrados
                    // además por el permiso del sub-usuario. Dos filtros distintos:
                    // el del negocio dice qué existe, el del usuario qué puede usar él.
                    const methodDefs = getVisiblePaymentMethods(companySettings, businessMode)
                      .filter(m =>
                        !allowedPaymentMethods || allowedPaymentMethods.length === 0 || allowedPaymentMethods.includes(m.permKey)
                      )
                      .map(m => [m.key, m.label, m.permKey])

                    // Saldo a favor: se ofrece como método solo si el cliente tiene
                    // saldo disponible (notas de crédito sin redimir). No pasa por el
                    // filtro de permisos (no es un medio de pago configurable).
                    if (customerStoreCredit.total > 0) {
                      methodDefs.push(['CREDIT_NOTE', 'Saldo a favor'])
                    }

                    // Certificado de regalo: se ofrece solo tras validar un
                    // codigo (al portador, no depende del cliente).
                    if (appliedGiftCert) {
                      methodDefs.push(['GIFT_CERT', 'Certificado de regalo'])
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

              {/* Veterinaria: qué queda agendado con esta venta. Se muestra
                  acá, junto al botón de cobrar, para que se vea que pasó — y
                  para poder pisar los días sin salir del cobro. */}
              {serviciosARecordar.length > 0 && (
                <div className="mt-4 border border-gray-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-600">
                    Próximo recordatorio{customerData.petName ? ` de ${customerData.petName}` : ''}
                  </p>
                  {serviciosARecordar.map(servicio => (
                    <div key={servicio.productId} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-700 truncate min-w-0">{servicio.nombre}</span>
                      <div className="flex items-center gap-1.5 flex-none">
                        <input
                          type="number"
                          min="1"
                          value={diasRecordatorio[servicio.productId] ?? ''}
                          placeholder={String(servicio.base)}
                          onChange={e => setDiasRecordatorio(prev => ({
                            ...prev,
                            [servicio.productId]: e.target.value,
                          }))}
                          className="w-16 text-center px-1 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <span className="text-xs text-gray-500">días</span>
                      </div>
                    </div>
                  ))}
                  {!selectedCustomer?.id && (
                    <p className="text-[11px] text-amber-600">
                      El recordatorio se guarda en la ficha del cliente: elige uno registrado
                      para que quede agendado.
                    </p>
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

          {/* Bonificación. Disponible en TODO comprobante: el generador de XML
              la declara con afectación 15 (Catálogo 07) usando el valor
              referencial, que es como SUNAT pide las transferencias gratuitas.
              Antes estaba limitada a notas de venta porque la línea viajaba
              como inafecta de valor 0 y podía rebotar (auditoría 18-ago-2026). */}
          {(
            <label className="flex items-center gap-3 p-3 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors">
              <input
                type="checkbox"
                checked={customProduct.isBonificacion || false}
                onChange={e => setCustomProduct({ ...customProduct, isBonificacion: e.target.checked, ...(e.target.checked ? { taxAffectation: '30' } : {}) })}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Bonificación (gratis)</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  El cliente no paga esta línea, pero <strong>el precio de arriba es obligatorio</strong>:
                  es el valor de lo que regalas y SUNAT lo exige para declarar la transferencia gratuita.
                </p>
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
                {/* Multi-divisa: elegir la moneda del precio (S/ o $), igual que en
                    los productos del catálogo. Sin multidivisa, S/ fijo como antes. */}
                {posMultiCurrencyOn ? (
                  <select
                    value={customProduct.priceCurrency || currency}
                    onChange={(e) => setCustomProduct({ ...customProduct, priceCurrency: e.target.value })}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 text-sm text-gray-600 bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer"
                    title="Moneda del precio"
                  >
                    <option value="PEN">S/</option>
                    <option value="USD">$</option>
                  </select>
                ) : (
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    S/
                  </span>
                )}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customProduct.price}
                  onChange={(e) => setCustomProduct({ ...customProduct, price: e.target.value })}
                  placeholder="0.00"
                  className={`w-full ${posMultiCurrencyOn ? 'pl-16' : 'pl-10'} pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500`}
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

          {/* Costo. Opcional, pero sin él la venta figura con 100% de margen:
              el reporte de ganancia usa el costo congelado en cada línea. */}
          {!customProduct.isBonificacion && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Costo unitario <span className="text-xs font-normal text-gray-500">(opcional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={customProduct.cost || ''}
                onChange={(e) => setCustomProduct({ ...customProduct, cost: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Lo que te costó a ti. Sin esto, Reportes cuenta esta venta como ganancia completa.
              </p>
            </div>
          )}

          {/* Checkbox para indicar si el precio incluye IGV */}
          {!effectiveTaxConfig.igvExempt && customProduct.taxAffectation === '10' && (
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
              {effectiveTaxConfig.igvExempt ? (
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600">
                  Exonerado (Régimen especial)
                </div>
              ) : effectiveTaxConfig.taxType === 'standard' ? (
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
                  <option value="10">Gravado ({effectiveTaxConfig.igvRate}%)</option>
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
            // Multidivisa: la vista previa se muestra en la MISMA moneda del selector
            // de precio (lo que el usuario tecleó), no siempre en soles.
            const previewCcy = posMultiCurrencyOn ? (customProduct.priceCurrency || currency) : 'PEN'
            const fmt = (n) => formatCurrency(n, previewCcy)
            const igvRate = effectiveTaxConfig.taxType === 'standard' ? (customProduct.igvRate || 18) : (effectiveTaxConfig.igvRate || 18)
            const isGravado = customProduct.taxAffectation === '10' && !effectiveTaxConfig.igvExempt
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
                      Cantidad: {quantity} × {fmt(totalUnit)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {customProduct.taxAffectation === '10' ? `Gravado (${igvRate}%)` : customProduct.taxAffectation === '20' ? 'Exonerado' : 'Inafecto'}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">{fmt(subtotalTotal)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-gray-600">IGV ({isGravado ? igvRate : 0}%):</span>
                      <span className="font-medium">{fmt(igvTotal)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-base border-t border-primary-200 pt-1 mt-1">
                      <span className="font-semibold text-gray-700">Total:</span>
                      <span className="font-bold text-primary-600">{fmt(totalFinal)}</span>
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

      {/* Selector de variante (componente compartido con los flujos de restaurante) */}
      <VariantSelectorModal
        isOpen={showVariantModal}
        onClose={() => {
          setShowVariantModal(false)
          setSelectedProductForVariant(null)
        }}
        product={selectedProductForVariant}
        onSelect={addVariantToCart}
        warehouse={selectedWarehouse}
        allowNegativeStock={permiteSinStock}
        formatCurrency={formatCurrency}
      />

      {/* Despachar combustible por monto (modo estación de servicio) */}
      <DespachoCombustibleModal
        isOpen={!!combustibleElegido}
        onClose={() => setCombustibleElegido(null)}
        producto={combustibleElegido}
        precio={toSessionCurrency(Number(combustibleElegido?.price) || 0)}
        moneda={currency}
        onConfirmar={agregarCombustible}
      />

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
        // Tarjeta de sellos: solo si el programa está activo y la venta tuvo
        // cliente con teléfono. loyaltyCard se recarga al completar la venta
        // (su efecto depende de saleCompleted), así que los sellos ya incluyen
        // el de esta compra.
        loyalty={
          companySettings?.loyaltyConfig?.enabled &&
          (lastInvoiceData?.customer?.phone || customerData?.phone) &&
          loyaltyCard
            ? {
                stamps: loyaltyCard.stamps || 0,
                goal: loyaltyCard.goal || companySettings?.loyaltyConfig?.goal || 10,
              }
            : null
        }
        sendingLoyaltyCard={sendingLoyaltyCard}
        // Sin handler mientras Google aprueba la publicación de Wallet: el
        // modal muestra los sellos pero esconde el botón de enviar.
        onSendLoyaltyCard={WALLET_EN_APROBACION ? null : async () => {
          if (isDemoMode) { toast.error('No disponible en modo demo'); return }
          const telCliente = lastInvoiceData?.customer?.phone || customerData?.phone
          if (!telCliente) return
          setSendingLoyaltyCard(true)
          try {
            const { getAuth } = await import('firebase/auth')
            const { getWalletPassLink } = await import('@/services/loyaltyService')
            const idToken = await getAuth().currentUser?.getIdToken()
            const res = await getWalletPassLink(idDeFidelizacion(companySettings, getBusinessId()), telCliente, idToken)
            if (!res.success) { toast.error(res.error || 'No se pudo generar la tarjeta'); return }
            const nombreNegocio = companySettings?.name || companySettings?.tradeName || companySettings?.businessName || 'nuestro negocio'
            // El mismo mensaje que usa el gestor de Promociones: un solo link
            // (cbrfy.link) que sirve para Apple y Google Wallet.
            const texto = `Hola! Esta es tu tarjeta de sellos de ${nombreNegocio}. ` +
              `Ya tienes ${res.stamps} de ${res.goal}. Agregala a tu celular: ${res.shortUrl || res.url}`
            const digitos = String(telCliente).replace(/\D/g, '')
            const numero = digitos.length === 9 ? `51${digitos}` : digitos
            window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank')
          } catch (error) {
            console.error('No se pudo enviar la tarjeta de sellos:', error)
            toast.error('No se pudo enviar la tarjeta')
          } finally {
            setSendingLoyaltyCard(false)
          }
        }}
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
                          <span className="px-2 py-0.5 text-xs font-medium chip-ok rounded-full">
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
            <div className="mt-4 p-3 bg-primary-50 rounded-lg">
              <p className="text-xs text-primary-700">
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
                          {serial.serialNumber2 && (
                            <p className="text-xs text-gray-500 truncate">{serial.serialNumber2}</p>
                          )}
                          {serial.variantSku && (
                            <p className="text-xs text-gray-500">Variante: {serial.variantSku}</p>
                          )}
                        </div>
                        <span className="px-2 py-0.5 text-xs font-medium chip-ok rounded-full whitespace-nowrap">
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
                    <p className="font-medium text-gray-900">{UNIT_TYPES.find(u => u.code === (productForPresentationSelection.unit || 'NIU'))?.label || 'Unidad'}</p>
                    <p className="text-xs text-gray-500">Precio base por {getUnitShortLabel(productForPresentationSelection.unit || 'NIU')}</p>
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
              {productForPresentationSelection.presentations?.map((pres, idx) => {
                // Niveles de precio propios de la presentación (solo manuales)
                const presLevels = businessSettings?.multiplePricesEnabled
                  ? ['price2', 'price3', 'price4'].filter(k => Number(pres[k]) > 0)
                  : []
                // Cliente con nivel asignado: el botón muestra y aplica SU precio
                const customerKey = businessSettings?.multiplePricesEnabled
                  && selectedCustomer?.priceLevel && selectedCustomer.priceLevel !== 'price1'
                  && Number(pres[selectedCustomer.priceLevel]) > 0
                  ? selectedCustomer.priceLevel
                  : null
                return (
                  <div key={idx}>
                    <button
                      onClick={() => handlePresentationSelection(pres)}
                      className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-green-500 hover:bg-green-50 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{pres.name}</p>
                          {/* Unidad base real: "Contiene 49 kg", no "49 unidades" */}
                          <p className="text-xs text-gray-500">Contiene {pres.factor} {getUnitShortLabel(productForPresentationSelection.unit || 'NIU')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-green-600">
                            {formatCurrency(customerKey ? Number(pres[customerKey]) : pres.price)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {customerKey
                              ? `${businessSettings?.priceLabels?.[customerKey] || `Precio ${customerKey.slice(-1)}`} del cliente`
                              : `×${pres.factor}`}
                          </p>
                        </div>
                      </div>
                    </button>
                    {/* Sin nivel del cliente: el cajero elige el nivel de esta presentación */}
                    {presLevels.length > 0 && !customerKey && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {presLevels.map(k => (
                          <button
                            key={k}
                            onClick={() => handlePresentationSelection(pres, k)}
                            className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 hover:border-green-500 hover:bg-green-50 transition-all"
                          >
                            {businessSettings?.priceLabels?.[k] || `Precio ${k.slice(-1)}`}: {formatCurrency(Number(pres[k]))}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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
                        <span className="font-semibold">{stockDisponible}</span> {getUnitShortLabel(productForPresentationSelection.unit || 'NIU')}
                      </p>
                      {productForPresentationSelection.presentations?.map((pres, idx) => {
                        const equivalentQty = Math.floor(stockDisponible / pres.factor)
                        return (
                          <p key={idx} className="text-sm text-gray-600">
                            <span className="font-semibold">{equivalentQty}</span> {pres.name} <span className="text-gray-400">(x{pres.factor} {getUnitShortLabel(productForPresentationSelection.unit || 'NIU')})</span>
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

      {/* Producto SIN STOCK: se frena y decide el cajero (ajuste
          "Preguntar antes de vender un producto sin stock"). Es un modal y no
          un toast a proposito: escaneando en serie, un aviso que se va solo
          pasa desapercibido y la venta sale sin ese item. */}
      <Modal
        isOpen={!!sinStockPendiente}
        onClose={() => setSinStockPendiente(null)}
        title="Producto sin stock"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900 break-words">
                {sinStockPendiente?.nombre}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {sinStockPendiente?.detalle} Si igual lo tienes, agrégalo: el stock
                quedará en negativo hasta que registres la compra.
              </p>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => { setSinStockPendiente(null); searchInputRef.current?.focus() }}
              className="w-full sm:w-auto"
            >
              No agregar
            </Button>
            <Button
              onClick={() => {
                const seguir = sinStockPendiente?.confirmar
                setSinStockPendiente(null)
                if (seguir) seguir()
                searchInputRef.current?.focus()
              }}
              className="w-full sm:w-auto"
            >
              Agregar igual
            </Button>
          </div>
        </div>
      </Modal>

      {/* Aviso: código escaneado/pegado que no está registrado en el sistema */}
      <Modal
        isOpen={!!unknownScanCode}
        onClose={() => { setUnknownScanCode(null); setUnknownScanProduct(null); setUnknownScanInterno(false) }}
        title={unknownScanInterno ? 'Producto de uso interno' : unknownScanProduct ? 'Producto de otra sucursal' : 'Código no registrado'}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              {unknownScanInterno ? (
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">{unknownScanProduct}</span> está marcado como
                  solo uso interno, así que no se vende:
                </p>
              ) : unknownScanProduct ? (
                <p className="text-sm text-gray-700">
                  Este código pertenece a <span className="font-semibold">{unknownScanProduct}</span>,
                  que no está disponible en esta sucursal:
                </p>
              ) : (
                <p className="text-sm text-gray-700">
                  Este código no está registrado en el sistema:
                </p>
              )}
              <p className="mt-1 font-mono text-base font-semibold text-gray-900 break-all">
                {unknownScanCode}
              </p>
              {unknownScanInterno ? (
                <p className="mt-2 text-sm text-gray-600">
                  No se agregó al carrito. Sigue en el inventario y se puede comprar y
                  trasladar; si en realidad sí se vende, quítale "Solo uso interno" en Productos.
                </p>
              ) : unknownScanProduct ? (
                <p className="mt-2 text-sm text-gray-600">
                  No se agregó al carrito. Si debería venderse aquí, actívalo en esta
                  sucursal desde la página Productos — no lo crees de nuevo.
                </p>
              ) : (
                <p className="mt-2 text-sm text-gray-600">
                  No se agregó ningún producto. Verifícalo antes de seguir escaneando.
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { setUnknownScanCode(null); setUnknownScanProduct(null); setUnknownScanInterno(false); searchInputRef.current?.focus() }}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: stock por sucursal. SOLO CONSULTA — no mueve ni transfiere nada. */}
      <Modal
        isOpen={!!stockSucursalesDe}
        onClose={() => setStockSucursalesDe(null)}
        title="Stock por sucursal"
        size="md"
      >
        {stockSucursalesDe && (() => {
          const filas = stockPorSucursal(stockSucursalesDe, todosLosAlmacenes, todasLasSucursales, {
            nombrePrincipal: businessSettings?.mainBranchName || 'Sucursal Principal',
            sucursalActual: selectedBranch?.id || null,
          })
          const total = filas.reduce((a, f) => a + f.stock, 0)
          return (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{stockSucursalesDe.name}</p>
                {stockSucursalesDe.hasVariants && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Este producto tiene variantes: el total suma todas.
                  </p>
                )}
              </div>

              {filas.length === 0 ? (
                <p className="text-sm text-gray-500">Este producto no tiene stock registrado en ninguna sucursal.</p>
              ) : (
                <>
                  <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {filas.map(f => (
                      <div key={f.clave} className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-sm text-gray-900 flex items-center gap-2 min-w-0">
                          <span className="truncate">{f.nombre}</span>
                          {f.esActual && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 text-primary-700 shrink-0">
                              Aquí
                            </span>
                          )}
                        </span>
                        <span className={`text-sm font-semibold shrink-0 ${f.stock > 0 ? 'text-gray-900' : 'text-red-600'}`}>
                          {f.stock}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-3 text-sm">
                    <span className="text-gray-600">Total</span>
                    <span className="font-semibold text-gray-900">{total}</span>
                  </div>
                </>
              )}

              <p className="text-xs text-gray-500">
                Solo para consultar. La venta sigue descontando del almacén con el que estás trabajando.
              </p>
            </div>
          )
        })()}
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

      {/* Comanda de la venta directa (web): oculta fuera de pantalla; la
          imprime react-to-print en su propio diálogo, separada de la boleta. */}
      {posComandaToPrint && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={posComandaRef}>
            <KitchenTicket
              order={posComandaToPrint}
              companySettings={companySettings}
            />
          </div>
        </div>
      )}

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
                // Descuento por ítem: sin esto el ticket post-venta mostraba solo el
                // descuento total abajo (parecía global) aunque fuera individual.
                ...(item.itemDiscount > 0 && { itemDiscount: item.itemDiscount }),
                // Lote/vencimiento para que el ticket los muestre (farmacia)
                ...(item.batchNumber && { batchNumber: item.batchNumber }),
                ...(item.batchExpiryDate && { batchExpiryDate: item.batchExpiryDate }),
                // Variante (talla, color, ...) para mostrarla en el ticket
                ...(item.isVariant && { isVariant: true, variantSku: item.variantSku, variantAttributes: item.variantAttributes }),
                // Presentación elegida (CAJA, PACK, ...): el ticket la antepone con showItemUnit
                ...(item.presentationName && { presentationName: item.presentationName, presentationFactor: item.presentationFactor }),
                ...(item.serialNumber && { serialNumber: item.serialNumber }),
        ...(item.serialNumber2 && { serialNumber2: item.serialNumber2 }),
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
