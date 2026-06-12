import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Trash2, Save, Loader2, ArrowLeft, UserPlus, X, Search, Tag, Package, Hash, User, FileText, Store, DollarSign, RefreshCw } from 'lucide-react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useAuth } from '@/contexts/AuthContext'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { calculateInvoiceAmounts, ID_TYPES } from '@/utils/peruUtils'
import { formatCurrency, matchesSearchQuery } from '@/lib/utils'
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
import { getCustomers, getProducts, createCustomer } from '@/services/firestoreService'
import { createQuotation, getNextQuotationNumber, getQuotation, updateQuotation } from '@/services/quotationService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { getActiveBranches } from '@/services/branchService'
import { getSellers } from '@/services/sellerService'

// Unidades de medida SUNAT (Catálogo N° 03 - UN/ECE Rec 20)
// Reordenadas: las más comunes primero (UNIDAD, HORA, SERVICIO)
const UNITS = [
  { value: 'NIU', label: 'Unidad' },
  { value: 'HUR', label: 'Hora' },
  { value: 'ZZ', label: 'Servicio' },
  { value: 'KGM', label: 'Kilogramo' },
  { value: 'GRM', label: 'Gramo' },
  { value: 'LTR', label: 'Litro' },
  { value: 'MTR', label: 'Metro' },
  { value: 'MTK', label: 'Metro cuadrado' },
  { value: 'MTQ', label: 'Metro cúbico' },
  { value: 'BX', label: 'Caja' },
  { value: 'PK', label: 'Paquete' },
  { value: 'SET', label: 'Juego' },
  { value: 'DZN', label: 'Docena' },
  { value: 'PR', label: 'Par' },
  { value: 'MIL', label: 'Millar' },
  { value: 'TNE', label: 'Tonelada' },
  { value: 'BJ', label: 'Balde' },
  { value: 'BLL', label: 'Barril' },
  { value: 'BG', label: 'Bolsa' },
  { value: 'BO', label: 'Botella' },
  { value: 'CT', label: 'Cartón' },
  { value: 'CMK', label: 'Centímetro cuadrado' },
  { value: 'CMQ', label: 'Centímetro cúbico' },
  { value: 'CMT', label: 'Centímetro' },
  { value: 'CEN', label: 'Ciento de unidades' },
  { value: 'CY', label: 'Cilindro' },
  { value: 'BE', label: 'Fardo' },
  { value: 'GLL', label: 'Galón' },
  { value: 'GLI', label: 'Galón inglés' },
  { value: 'LEF', label: 'Hoja' },
  { value: 'KTM', label: 'Kilómetro' },
  { value: 'KWH', label: 'Kilovatio hora' },
  { value: 'KT', label: 'Kit' },
  { value: 'CA', label: 'Lata' },
  { value: 'LBR', label: 'Libra' },
  { value: 'MWH', label: 'Megavatio hora' },
  { value: 'MGM', label: 'Miligramo' },
  { value: 'MLT', label: 'Mililitro' },
  { value: 'MMT', label: 'Milímetro' },
  { value: 'MMK', label: 'Milímetro cuadrado' },
  { value: 'MMQ', label: 'Milímetro cúbico' },
  { value: 'UM', label: 'Millón de unidades' },
  { value: 'ONZ', label: 'Onza' },
  { value: 'PF', label: 'Paleta' },
  { value: 'FOT', label: 'Pie' },
  { value: 'FTK', label: 'Pie cuadrado' },
  { value: 'FTQ', label: 'Pie cúbico' },
  { value: 'C62', label: 'Pieza' },
  { value: 'PG', label: 'Placa' },
  { value: 'ST', label: 'Pliego' },
  { value: 'INH', label: 'Pulgada' },
  { value: 'TU', label: 'Tubo' },
  { value: 'YRD', label: 'Yarda' },
  { value: 'QD', label: 'Cuarto de docena' },
  { value: 'HD', label: 'Media docena' },
  { value: 'JG', label: 'Jarra' },
  { value: 'JR', label: 'Frasco' },
  { value: 'CH', label: 'Envase' },
  { value: 'AV', label: 'Cápsula' },
  { value: 'SA', label: 'Saco' },
  { value: 'BT', label: 'Tornillo' },
  { value: 'U2', label: 'Tableta/Blister' },
  { value: 'DZP', label: 'Docena de paquetes' },
  { value: 'HT', label: 'Media hora' },
  { value: 'RL', label: 'Carrete' },
  { value: 'SEC', label: 'Segundo' },
  { value: 'RD', label: 'Varilla' },
]

export default function CreateQuotation() {
  const { user } = useAuth()
  const { businessSettings, getBusinessId } = useAppContext()
  const navigate = useNavigate()
  const appNavigate = useAppNavigate()
  const { id: quotationId } = useParams() // Si hay ID, es modo edición
  const [searchParams] = useSearchParams()
  const cloneId = searchParams.get('clone') // Si hay clone, duplicar cotización
  const location = useLocation()
  // Datos prellenados al navegar desde otra pantalla (ej: convertir pedido online en cotización).
  // Formato: { prefilledItems: [...], prefilledCustomer: { name, email, phone, address }, prefilledNotes }
  const prefilledFromState = location.state || null
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingQuotationNumber, setEditingQuotationNumber] = useState('')

  // Estados para selección de precio múltiple, presentaciones y variantes
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [showPresentationModal, setShowPresentationModal] = useState(false)
  const [showVariantModal, setShowVariantModal] = useState(false)
  const [pendingProductSelection, setPendingProductSelection] = useState(null) // { index, product }
  const [selectedPriceLevel, setSelectedPriceLevel] = useState(null)

  // Cliente
  const [customerMode, setCustomerMode] = useState('select') // 'select' o 'manual'
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [manualCustomer, setManualCustomer] = useState({
    documentType: 'DNI',
    documentNumber: '',
    name: '',
    email: '',
    phone: '',
    address: '',
  })
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [isLookingUpDocument, setIsLookingUpDocument] = useState(false)

  // Cotización
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [validityDays, setValidityDays] = useState(30)
  const [discount, setDiscount] = useState(0)
  const [discountType, setDiscountType] = useState('fixed')
  const [terms, setTerms] = useState('')
  const [notes, setNotes] = useState('')
  const isIgvExempt = businessSettings?.emissionConfig?.taxConfig?.igvExempt === true
  const [hideIgv, setHideIgv] = useState(isIgvExempt)

  // ===== Multi-divisa (opt-in) =====
  const quoteMultiCurrencyOn = useMemo(
    () => isMultiCurrencyEnabled(businessSettings),
    [businessSettings]
  )
  const [currency, setCurrency] = useState(
    quoteMultiCurrencyOn ? getDefaultCurrency(businessSettings) : BASE_CURRENCY
  )
  const [exchangeRate, setExchangeRate] = useState(1)
  const [exchangeRateSource, setExchangeRateSource] = useState(null)
  const [loadingRate, setLoadingRate] = useState(false)
  const [exchangeRateInput, setExchangeRateInput] = useState('1')
  const [tcInputFocused, setTcInputFocused] = useState(false)

  // Serie y número personalizado
  const [customSeries, setCustomSeries] = useState('')
  const [customNumber, setCustomNumber] = useState('')
  const [useCustomNumber, setUseCustomNumber] = useState(false)

  // Destinatario (persona a quien va dirigida la cotización)
  const [recipientName, setRecipientName] = useState('')
  const [recipientPosition, setRecipientPosition] = useState('')

  // Sucursales
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)

  // Vendedores
  const [sellers, setSellers] = useState([])
  const [selectedSeller, setSelectedSeller] = useState(null)
  const [quotationItems, setQuotationItems] = useState([
    { productId: '', name: '', quantity: '', unitPrice: 0, unit: 'UNIDAD', searchTerm: '' },
  ])

  // Buscador de productos
  const [showProductSearch, setShowProductSearch] = useState(null) // índice del item activo
  const [pricePickerIndex, setPricePickerIndex] = useState(null) // índice del item con dropdown de precio abierto

  // ===== Borrador automático en localStorage =====
  // Evita perder trabajo si el usuario cambia de página o cierra el navegador.
  const draftLoadedRef = useRef(false)
  const getDraftKey = () => `quotation_draft_${getBusinessId()}`

  const clearDraft = () => {
    try { localStorage.removeItem(getDraftKey()) } catch (e) { /* ignore */ }
  }

  // Auto-set hideIgv when businessSettings loads (only for new quotations)
  useEffect(() => {
    if (!quotationId && isIgvExempt) {
      setHideIgv(true)
    }
  }, [isIgvExempt, quotationId])

  // ===== Multi-divisa: handlers y efectos =====

  // Trae el TC del día (SBS via Cloud Function).
  const fetchExchangeRate = async () => {
    if (loadingRate) return
    setLoadingRate(true)
    try {
      const result = await getRateForDate(new Date())
      if (result && Number.isFinite(result.sell) && result.sell > 0) {
        setExchangeRate(Number(result.sell.toFixed(4)))
        setExchangeRateSource(result.source)
        if (result.source === 'sbs') {
          toast.success(`Tipo de cambio: S/ ${result.sell.toFixed(4)} (SBS)`)
        }
      } else {
        setExchangeRateSource(null)
        toast.error('No se pudo obtener el TC SBS. Ingrésalo manualmente.')
      }
    } catch (err) {
      console.error('Error obteniendo TC:', err)
    } finally {
      setLoadingRate(false)
    }
  }

  // Al cambiar a USD por primera vez, traer TC del día.
  useEffect(() => {
    if (!quoteMultiCurrencyOn) return
    if (currency === 'USD' && exchangeRate <= 1) {
      fetchExchangeRate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency])

  // Sincronizar texto del input TC con el state (solo cuando NO está enfocado).
  useEffect(() => {
    if (tcInputFocused) return
    setExchangeRateInput(exchangeRate > 0 ? String(exchangeRate) : '')
  }, [exchangeRate, tcInputFocused])

  // Convierte un precio del catálogo (siempre PEN) a la moneda activa.
  const toSessionCurrency = (priceInBase) => {
    const n = Number(priceInBase) || 0
    if (currency === BASE_CURRENCY || n === 0) return n
    return Number(convertFromBase(n, currency, exchangeRate).toFixed(2))
  }

  // Cambiar moneda — si hay items en el carrito, convertir sus precios
  // usando basePrice (PEN) cuando exista, sino conversión directa.
  const handleCurrencyChange = async (newCurrency) => {
    if (newCurrency === currency) return

    // Asegurar TC válido si vamos a USD.
    let effectiveRate = exchangeRate
    if (newCurrency === 'USD' && exchangeRate <= 1) {
      setLoadingRate(true)
      try {
        const result = await getRateForDate(new Date())
        if (result && Number.isFinite(result.sell) && result.sell > 0) {
          effectiveRate = Number(result.sell.toFixed(4))
          setExchangeRate(effectiveRate)
          setExchangeRateSource(result.source)
          if (result.source === 'sbs') toast.success(`TC: S/ ${effectiveRate} (SBS)`)
        } else {
          toast.error('No se pudo obtener el TC. Ingrésalo manualmente.')
          setLoadingRate(false)
          return
        }
      } catch (err) {
        console.error(err)
        toast.error('No se pudo obtener el TC. Ingrésalo manualmente.')
        setLoadingRate(false)
        return
      }
      setLoadingRate(false)
    }

    // Si hay items, recalcular precios desde basePrice cuando exista.
    setQuotationItems(prev => prev.map(item => {
      const oldPrice = Number(item.unitPrice) || 0
      if (oldPrice === 0) return item
      const baseInPEN = Number(item.basePrice)
      const hasBase = Number.isFinite(baseInPEN) && baseInPEN > 0
      let newPrice = oldPrice
      if (hasBase) {
        newPrice = newCurrency === 'PEN'
          ? baseInPEN
          : Number(convertFromBase(baseInPEN, 'USD', effectiveRate).toFixed(2))
      } else {
        if (currency === 'PEN' && newCurrency === 'USD') {
          newPrice = Number(convertFromBase(oldPrice, 'USD', effectiveRate).toFixed(2))
        } else if (currency === 'USD' && newCurrency === 'PEN') {
          newPrice = Number(convertToBase(oldPrice, 'USD', effectiveRate).toFixed(2))
        }
      }
      return { ...item, unitPrice: newPrice }
    }))
    setCurrency(newCurrency)
  }

  // Cuando el cajero edita TC manualmente, recomputar precios USD del
  // carrito desde basePrice (PEN) sin pérdida de precisión.
  useEffect(() => {
    if (!quoteMultiCurrencyOn) return
    if (currency !== 'USD' || !exchangeRate || exchangeRate <= 0) return
    setQuotationItems(prev => prev.map(item => {
      const baseInPEN = Number(item.basePrice)
      if (!Number.isFinite(baseInPEN) || baseInPEN <= 0) return item
      const newPrice = Number(convertFromBase(baseInPEN, 'USD', exchangeRate).toFixed(2))
      if (Math.abs((Number(item.unitPrice) || 0) - newPrice) < 0.005) return item
      return { ...item, unitPrice: newPrice }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchangeRate])

  // Si venimos desde otra pantalla con datos prellenados (ej: "Convertir en cotización"
  // desde un pedido online), precargamos items + cliente y saltamos la carga del draft.
  // El state se consume una sola vez: limpiamos history.state para que un refresh no
  // vuelva a aplicarlo encima de lo que el usuario haya editado.
  useEffect(() => {
    if (draftLoadedRef.current) return
    if (quotationId || cloneId) return
    const items = prefilledFromState?.prefilledItems
    const cust = prefilledFromState?.prefilledCustomer
    const notesIn = prefilledFromState?.prefilledNotes
    if (!Array.isArray(items) || items.length === 0) return

    setQuotationItems(items.map(it => {
      // Incluir la variante (color, etc.) en el nombre para que se vea en el
      // formulario, el PDF y la cotización guardada (igual que en el pedido online).
      const attrs = it.isVariant && it.variantAttributes
        ? Object.entries(it.variantAttributes).map(([k, v]) => `${k}: ${v}`).join(', ')
        : ''
      return {
        productId: it.productId || '',
        name: attrs ? `${it.name || ''} (${attrs})` : (it.name || ''),
        quantity: it.quantity != null ? String(it.quantity) : '',
        unitPrice: Number(it.price ?? it.unitPrice ?? 0) || 0,
        unit: it.unit || 'UNIDAD',
        searchTerm: '',
        ...(it.isVariant && {
          isVariant: true,
          variantSku: it.variantSku,
          variantAttributes: it.variantAttributes,
        }),
      }
    }))
    if (cust && (cust.name || cust.email || cust.phone)) {
      setCustomerMode('manual')
      setManualCustomer((prev) => ({
        ...prev,
        name: cust.name || '',
        email: cust.email || '',
        phone: cust.phone || '',
        address: cust.address || prev.address || '',
      }))
    }
    if (notesIn) setNotes(notesIn)
    // No tocamos el draft de localStorage: el effect de abajo no va a sobrescribir
    // porque marcamos draftLoadedRef.current.
    draftLoadedRef.current = true
    // Limpiar state del history para evitar reaplicación en refresh
    try { window.history.replaceState({}, '') } catch {}
    toast.info('Cotización precargada desde pedido')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cargar borrador al montar (solo en modo creación nueva, no edición ni clonación)
  useEffect(() => {
    if (draftLoadedRef.current) return
    if (quotationId || cloneId) {
      draftLoadedRef.current = true
      return
    }
    try {
      const saved = localStorage.getItem(getDraftKey())
      if (saved) {
        const draft = JSON.parse(saved)
        const age = Date.now() - (draft.timestamp || 0)
        const maxAge = 24 * 60 * 60 * 1000 // 24h
        if (age < maxAge) {
          if (draft.quotationItems?.length) setQuotationItems(draft.quotationItems)
          if (draft.selectedCustomer) setSelectedCustomer(draft.selectedCustomer)
          if (draft.customerMode) setCustomerMode(draft.customerMode)
          if (draft.manualCustomer) setManualCustomer(draft.manualCustomer)
          if (draft.validityDays) setValidityDays(draft.validityDays)
          if (draft.issueDate) setIssueDate(draft.issueDate)
          if (draft.notes) setNotes(draft.notes)
          if (draft.terms) setTerms(draft.terms)
          if (draft.discount) setDiscount(draft.discount)
          if (draft.discountType) setDiscountType(draft.discountType)
          if (typeof draft.hideIgv === 'boolean') setHideIgv(draft.hideIgv)
          if (draft.recipientName) setRecipientName(draft.recipientName)
          if (draft.recipientPosition) setRecipientPosition(draft.recipientPosition)
          if (draft.quotationItems?.some(i => i.name || i.productId)) {
            toast.info('Borrador recuperado')
          }
        } else {
          localStorage.removeItem(getDraftKey())
        }
      }
    } catch (e) {
      console.error('Error al cargar borrador:', e)
    }
    draftLoadedRef.current = true
  }, [quotationId, cloneId])

  // Guardar borrador cuando cambian datos importantes (debounced 500ms)
  useEffect(() => {
    if (!draftLoadedRef.current) return
    if (quotationId) return

    const hasData = (quotationItems.some(i => i.name || i.productId))
      || !!selectedCustomer
      || !!manualCustomer.documentNumber
      || !!manualCustomer.name
      || !!notes
      || !!terms

    if (!hasData) {
      localStorage.removeItem(getDraftKey())
      return
    }

    const timeoutId = setTimeout(() => {
      try {
        const draft = {
          quotationItems,
          selectedCustomer,
          customerMode,
          manualCustomer,
          validityDays,
          issueDate,
          notes,
          terms,
          discount,
          discountType,
          hideIgv,
          recipientName,
          recipientPosition,
          timestamp: Date.now(),
        }
        localStorage.setItem(getDraftKey(), JSON.stringify(draft))
      } catch (e) {
        console.error('Error al guardar borrador:', e)
      }
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [quotationItems, selectedCustomer, customerMode, manualCustomer, validityDays, issueDate, notes, terms, discount, discountType, hideIgv, recipientName, recipientPosition, quotationId])

  // Alerta del navegador al cerrar pestaña si hay datos sin guardar
  useEffect(() => {
    const handler = (e) => {
      const hasUnsavedData = !isSaving && (
        quotationItems.some(i => i.name || i.productId)
        || !!selectedCustomer
        || !!manualCustomer.documentNumber
      )
      if (!hasUnsavedData) return
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [quotationItems, selectedCustomer, manualCustomer, isSaving])

  useEffect(() => {
    loadData()
  }, [user, quotationId, cloneId])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [customersResult, productsResult, branchesResult, sellersResult] = await Promise.all([
        getCustomers(getBusinessId()),
        getProducts(getBusinessId()),
        getActiveBranches(getBusinessId()),
        getSellers(getBusinessId()),
      ])

      if (customersResult.success) {
        setCustomers(customersResult.data || [])
      }

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }

      if (branchesResult.success) {
        setBranches(branchesResult.data || [])
      }

      // Cargar vendedores activos
      const activeSellers = (sellersResult.data || []).filter(s => s.status === 'active')
      setSellers(activeSellers)

      // Si hay quotationId, cargar la cotización para edición
      if (quotationId) {
        const quotationResult = await getQuotation(getBusinessId(), quotationId)
        if (quotationResult.success) {
          const q = quotationResult.data
          setIsEditing(true)
          setEditingQuotationNumber(q.number)

          // Cargar datos del cliente
          if (q.customer) {
            // Verificar si el cliente existe en la lista
            const existingCustomer = customersResult.data?.find(c => c.id === q.customer.id)
            if (existingCustomer) {
              setCustomerMode('select')
              setSelectedCustomer(existingCustomer)
            } else {
              setCustomerMode('manual')
              setManualCustomer({
                documentType: q.customer.documentType || 'DNI',
                documentNumber: q.customer.documentNumber || '',
                name: q.customer.name || '',
                email: q.customer.email || '',
                phone: q.customer.phone || '',
                address: q.customer.address || '',
              })
            }
          }

          // Cargar items (preservar metadata de variante/presentación para que
          // al re-guardar no se pierda y la conversión a venta descuente bien el stock)
          if (q.items && q.items.length > 0) {
            setQuotationItems(q.items.map(item => ({
              productId: item.productId || '',
              name: item.name || '',
              description: item.description || '',
              quantity: item.quantity || 1,
              unitPrice: item.unitPrice || 0,
              unit: item.unit || 'NIU',
              searchTerm: item.name || '',
              ...(item.isVariant && {
                isVariant: true,
                variantSku: item.variantSku || '',
                variantAttributes: item.variantAttributes || {},
              }),
              ...(item.presentationName && {
                presentationName: item.presentationName,
                presentationFactor: item.presentationFactor || 1,
              }),
            })))
          }

          // Cargar configuración
          if (q.issueDate) {
            const d = q.issueDate.toDate ? q.issueDate.toDate() : new Date(q.issueDate)
            setIssueDate(d.toISOString().split('T')[0])
          } else if (q.createdAt) {
            const d = q.createdAt.toDate ? q.createdAt.toDate() : new Date(q.createdAt)
            setIssueDate(d.toISOString().split('T')[0])
          }
          setValidityDays(q.validityDays || 30)
          setDiscount(q.discount || 0)
          setDiscountType(q.discountType || 'fixed')
          setTerms(q.terms || '')
          setNotes(q.notes || '')
          setHideIgv(q.hideIgv || false)

          // Multi-divisa: restaurar moneda y TC de la cotización
          if (quoteMultiCurrencyOn) {
            const qCcy = normalizeCurrency(q.currency)
            setCurrency(qCcy)
            const r = Number(q.exchangeRate)
            setExchangeRate(Number.isFinite(r) && r > 0 ? r : 1)
            setExchangeRateSource(q.exchangeRate ? 'manual' : null)
          }

          // Cargar destinatario
          setRecipientName(q.recipientName || '')
          setRecipientPosition(q.recipientPosition || '')

          // Cargar sucursal si existe
          if (q.branchId && branchesResult.data) {
            const branch = branchesResult.data.find(b => b.id === q.branchId)
            if (branch) {
              setSelectedBranch(branch)
            }
          }

          // Cargar vendedor si existe
          if (q.sellerId && activeSellers.length > 0) {
            const seller = activeSellers.find(s => s.id === q.sellerId)
            if (seller) setSelectedSeller(seller)
          }

          // Cargar serie/número personalizado si existe
          if (q.customSeries || q.customNumber) {
            setUseCustomNumber(true)
            setCustomSeries(q.customSeries || '')
            setCustomNumber(q.customNumber || '')
          }
        } else {
          toast.error('No se encontró la cotización')
          appNavigate('cotizaciones')
        }
      }

      // Si hay cloneId, cargar datos de la cotización para duplicar (sin modo edición)
      if (cloneId && !quotationId) {
        const cloneResult = await getQuotation(getBusinessId(), cloneId)
        if (cloneResult.success) {
          const q = cloneResult.data

          // Cargar datos del cliente
          if (q.customer) {
            const existingCustomer = customersResult.data?.find(c => c.id === q.customer.id)
            if (existingCustomer) {
              setCustomerMode('select')
              setSelectedCustomer(existingCustomer)
            } else {
              setCustomerMode('manual')
              setManualCustomer({
                documentType: q.customer.documentType || 'DNI',
                documentNumber: q.customer.documentNumber || '',
                name: q.customer.name || '',
                email: q.customer.email || '',
                phone: q.customer.phone || '',
                address: q.customer.address || '',
              })
            }
          }

          // Cargar items (preservar metadata de variante/presentación para que
          // al re-guardar no se pierda y la conversión a venta descuente bien el stock)
          if (q.items && q.items.length > 0) {
            setQuotationItems(q.items.map(item => ({
              productId: item.productId || '',
              name: item.name || '',
              description: item.description || '',
              quantity: item.quantity || 1,
              unitPrice: item.unitPrice || 0,
              unit: item.unit || 'NIU',
              searchTerm: item.name || '',
              ...(item.isVariant && {
                isVariant: true,
                variantSku: item.variantSku || '',
                variantAttributes: item.variantAttributes || {},
              }),
              ...(item.presentationName && {
                presentationName: item.presentationName,
                presentationFactor: item.presentationFactor || 1,
              }),
            })))
          }

          // Cargar configuración
          if (q.issueDate) {
            const d = q.issueDate.toDate ? q.issueDate.toDate() : new Date(q.issueDate)
            setIssueDate(d.toISOString().split('T')[0])
          } else if (q.createdAt) {
            const d = q.createdAt.toDate ? q.createdAt.toDate() : new Date(q.createdAt)
            setIssueDate(d.toISOString().split('T')[0])
          }
          setValidityDays(q.validityDays || 30)
          setDiscount(q.discount || 0)
          setDiscountType(q.discountType || 'fixed')
          setTerms(q.terms || '')
          setNotes(q.notes || '')
          setHideIgv(q.hideIgv || false)

          // Multi-divisa: restaurar moneda y TC de la cotización
          if (quoteMultiCurrencyOn) {
            const qCcy = normalizeCurrency(q.currency)
            setCurrency(qCcy)
            const r = Number(q.exchangeRate)
            setExchangeRate(Number.isFinite(r) && r > 0 ? r : 1)
            setExchangeRateSource(q.exchangeRate ? 'manual' : null)
          }

          // Cargar destinatario
          setRecipientName(q.recipientName || '')
          setRecipientPosition(q.recipientPosition || '')

          // Cargar sucursal si existe
          if (q.branchId && branchesResult.data) {
            const branch = branchesResult.data.find(b => b.id === q.branchId)
            if (branch) {
              setSelectedBranch(branch)
            }
          }

          // Cargar vendedor si existe
          if (q.sellerId && activeSellers.length > 0) {
            const seller = activeSellers.find(s => s.id === q.sellerId)
            if (seller) setSelectedSeller(seller)
          }

          // NO copiar serie/número personalizado (se genera nuevo)
          toast.success('Cotización duplicada. Revisa los datos y guarda.')
        }
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar los datos. Por favor, recarga la página.')
    } finally {
      setIsLoading(false)
    }
  }

  const addItem = () => {
    setQuotationItems([
      ...quotationItems,
      { productId: '', name: '', description: '', quantity: '', unitPrice: 0, unit: 'UNIDAD', searchTerm: '' },
    ])
  }

  const removeItem = index => {
    if (quotationItems.length > 1) {
      setQuotationItems(quotationItems.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index, field, value) => {
    const newItems = [...quotationItems]
    newItems[index][field] = value
    setQuotationItems(newItems)
  }

  const selectProduct = (index, product, selectedPrice = null, selectedPresentation = null, selectedVariant = null) => {
    // Si tiene variantes (talla, color, etc.) y no se ha seleccionado una, mostrar modal
    if (product.hasVariants && product.variants?.length > 0 && !selectedVariant) {
      setPendingProductSelection({ index, product })
      setShowVariantModal(true)
      setShowProductSearch(null)
      return
    }

    // Verificar si tiene presentaciones habilitadas
    const hasPresentations = businessSettings?.presentationsEnabled &&
                             product.presentations &&
                             product.presentations.length > 0

    // Verificar si tiene múltiples precios habilitados
    // Para variantes, verificar los precios de la variante; para productos normales, del producto
    const priceSource = selectedVariant || product
    const hasMultiplePrices = businessSettings?.multiplePricesEnabled &&
                              (priceSource.price2 || priceSource.price3 || priceSource.price4)

    // Si tiene presentaciones y no se ha seleccionado una, mostrar modal
    if (hasPresentations && !selectedPresentation) {
      setPendingProductSelection({ index, product })
      setShowPresentationModal(true)
      setShowProductSearch(null)
      return
    }

    // Si tiene múltiples precios y no se ha seleccionado uno, mostrar modal
    if (hasMultiplePrices && !selectedPrice && !selectedPresentation) {
      // Verificar si el cliente tiene nivel de precio asignado
      const customer = selectedCustomer || (customerMode === 'manual' ? manualCustomer : null)
      if (customer?.priceLevel) {
        // Auto-seleccionar precio según nivel del cliente
        const priceKey = customer.priceLevel
        selectedPrice = priceKey === 'price1' ? priceSource.price : (priceSource[priceKey] || priceSource.price)
      } else {
        // Mostrar modal para seleccionar precio (guardar variante si aplica)
        setPendingProductSelection({ index, product, variant: selectedVariant || null })
        setShowPriceModal(true)
        setShowProductSearch(null)
        return
      }
    }

    // Determinar el precio final
    let finalPrice = selectedPrice || product.price
    let finalName = product.name
    let finalUnit = product.unit || 'UNIDAD'
    let presentationInfo = ''

    // Si se seleccionó una variante (talla, color, etc.)
    if (selectedVariant) {
      finalPrice = selectedPrice || selectedVariant.price
      const attrs = Object.entries(selectedVariant.attributes || {}).map(([k, v]) => v).join(' / ')
      finalName = `${product.name} (${attrs})`
    }

    // Si se seleccionó una presentación
    if (selectedPresentation) {
      finalPrice = selectedPresentation.price
      finalName = `${product.name} (${selectedPresentation.name})`
      presentationInfo = selectedPresentation.name
    }

    const newItems = [...quotationItems]
    newItems[index].productId = product.id
    newItems[index].name = finalName
    newItems[index].description = product.description || ''
    // Multi-divisa: finalPrice viene del catálogo (PEN). Guardar basePrice
    // como source of truth y convertir unitPrice si la sesión es USD.
    newItems[index].basePrice = Number(finalPrice) || 0
    newItems[index].unitPrice = toSessionCurrency(finalPrice)
    newItems[index].unit = finalUnit
    newItems[index].searchTerm = finalName
    newItems[index].presentationName = presentationInfo
    newItems[index].presentationFactor = selectedPresentation?.factor || 1
    newItems[index].imageUrl = product.imageUrl || product.image || ''
    newItems[index].laboratoryName = product.laboratoryName || ''
    newItems[index].marca = product.marca || ''
    newItems[index].genericName = product.genericName || ''
    newItems[index].concentration = product.concentration || ''
    newItems[index].presentation = product.presentation || ''
    newItems[index].batchNumber = product.batchNumber || ''
    newItems[index].activeIngredient = product.activeIngredient || ''
    newItems[index].therapeuticAction = product.therapeuticAction || ''
    newItems[index].saleCondition = product.saleCondition || ''
    newItems[index].sanitaryRegistry = product.sanitaryRegistry || ''
    // Persistir metadata de variante. Sin estos campos, al convertir la cotización
    // a venta el POS no sabría qué variante descontar y el stock de la variante
    // queda sin actualizar (aunque el movimiento se registra).
    if (selectedVariant) {
      newItems[index].isVariant = true
      newItems[index].variantSku = selectedVariant.sku || ''
      newItems[index].variantAttributes = selectedVariant.attributes || {}
    } else {
      delete newItems[index].isVariant
      delete newItems[index].variantSku
      delete newItems[index].variantAttributes
    }
    setQuotationItems(newItems)
    setShowProductSearch(null)
    setPendingProductSelection(null)
  }

  // Manejar selección de precio desde el modal
  const handlePriceSelection = (priceLevel) => {
    if (!pendingProductSelection) return

    const { index, product, variant } = pendingProductSelection
    // Resolver precio de la variante si existe, sino del producto
    const priceSource = variant || product
    let selectedPrice = priceSource.price

    if (priceLevel === 'price2' && priceSource.price2) {
      selectedPrice = priceSource.price2
    } else if (priceLevel === 'price3' && priceSource.price3) {
      selectedPrice = priceSource.price3
    } else if (priceLevel === 'price4' && priceSource.price4) {
      selectedPrice = priceSource.price4
    }

    setShowPriceModal(false)
    selectProduct(index, product, selectedPrice, null, variant)
  }

  // Manejar selección de variante desde el modal
  const handleVariantSelection = (variant) => {
    if (!pendingProductSelection) return

    const { index, product } = pendingProductSelection
    setShowVariantModal(false)
    selectProduct(index, product, null, null, variant)
  }

  // Manejar selección de presentación desde el modal
  const handlePresentationSelection = (presentation) => {
    if (!pendingProductSelection) return

    const { index, product } = pendingProductSelection
    setShowPresentationModal(false)
    selectProduct(index, product, null, presentation)
  }

  // Cancelar selección pendiente
  const cancelPendingSelection = () => {
    setShowPriceModal(false)
    setShowPresentationModal(false)
    setPendingProductSelection(null)
  }

  const clearProductSelection = (index) => {
    const newItems = [...quotationItems]
    newItems[index].productId = ''
    newItems[index].searchTerm = ''
    setQuotationItems(newItems)
  }

  // Filtrar productos según búsqueda
  const getFilteredProducts = (searchTerm) => {
    // Excluir productos desactivados (isActive === false) de las búsquedas.
    const activeProducts = products.filter(p => p.isActive !== false)
    if (!searchTerm) return activeProducts.slice(0, 5) // Mostrar primeros 5 si no hay búsqueda

    // Búsqueda flexible: cada palabra parcial debe aparecer en alguno de los
    // campos, en cualquier orden, sin acentos. "pol roj x" matchea "POLO ROJO XXL".
    const code = (p) => p.code || ''
    const sku = (p) => p.sku || ''
    return activeProducts
      .filter(p => matchesSearchQuery(
        searchTerm,
        p.name,
        code(p),
        code(p).replace(/-/g, ''),
        sku(p),
        sku(p).replace(/-/g, ''),
        p.marca,
        p.laboratoryName,
        p.genericName,
        p.description,
      ))
      .slice(0, 10) // Máximo 10 resultados
  }

  const calculateItemTotal = item => {
    return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }

  // ---- Helpers para mostrar stock y permitir re-seleccionar precio en línea ----
  const getProductForItem = (item) => {
    if (!item?.productId) return null
    return products.find(p => p.id === item.productId) || null
  }

  const getStockForItem = (item) => {
    const product = getProductForItem(item)
    if (!product) return null
    if (product.trackStock === false) return null
    if (item.variantSku && product.variants?.length) {
      const v = product.variants.find(v => v.sku === item.variantSku)
      if (v && v.stock != null) return v.stock
    }
    return product.stock ?? null
  }

  const getItemPriceOptions = (item) => {
    if (!businessSettings?.multiplePricesEnabled) return []
    const product = getProductForItem(item)
    if (!product) return []
    const source = (item.variantSku && product.variants?.length)
      ? (product.variants.find(v => v.sku === item.variantSku) || product)
      : product
    const opts = []
    if (source.price) opts.push({ key: 'price1', label: businessSettings?.priceLabels?.price1 || 'Precio 1', value: source.price })
    if (source.price2) opts.push({ key: 'price2', label: businessSettings?.priceLabels?.price2 || 'Precio 2', value: source.price2 })
    if (source.price3) opts.push({ key: 'price3', label: businessSettings?.priceLabels?.price3 || 'Precio 3', value: source.price3 })
    if (source.price4) opts.push({ key: 'price4', label: businessSettings?.priceLabels?.price4 || 'Precio 4', value: source.price4 })
    return opts
  }

  const setItemPrice = (index, newPrice) => {
    const newItems = [...quotationItems]
    // newPrice viene del catálogo (PEN). En USD se convierte; basePrice
    // se actualiza para que round-trips de moneda preserven valor exacto.
    newItems[index].basePrice = Number(newPrice) || 0
    newItems[index].unitPrice = toSessionCurrency(newPrice)
    setQuotationItems(newItems)
    setPricePickerIndex(null)
  }

  // Calcular total directo (suma de precio * cantidad)
  const directTotal = quotationItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }, 0)

  // Calcular subtotal base (asumiendo que precios incluyen IGV)
  const baseAmounts = calculateInvoiceAmounts(
    quotationItems.map(item => ({
      price: parseFloat(item.unitPrice) || 0,
      quantity: parseFloat(item.quantity) || 0,
    }))
  )

  // Calcular descuento (aplicado al total con IGV, igual que el POS)
  const discountValue = parseFloat(discount) || 0
  const discountAmount =
    discountType === 'percentage'
      ? directTotal * discountValue / 100
      : discountValue

  // Aplicar descuento al total (con IGV) y recalcular proporcionalmente
  const totalAfterDiscount = Math.max(0, directTotal - discountAmount)
  const discountRatio = directTotal > 0 ? totalAfterDiscount / directTotal : 1

  const discountedTotal = Number(totalAfterDiscount.toFixed(2))
  const discountedSubtotal = Number((baseAmounts.subtotal * discountRatio).toFixed(2))

  // Calcular IGV como diferencia (igual que factura) para evitar diferencia de centavos por redondeo
  const finalIgv = hideIgv ? 0 : Number((discountedTotal - discountedSubtotal).toFixed(2))
  const finalTotal = hideIgv
    ? discountedTotal
    : discountedTotal

  const handleCustomerChange = customerId => {
    const customer = customers.find(c => c.id === customerId)
    setSelectedCustomer(customer || null)
  }

  // Buscar datos de DNI o RUC automáticamente
  const handleLookupDocument = async () => {
    const docNumber = manualCustomer.documentNumber
    const docType = manualCustomer.documentType

    if (!docNumber) {
      toast.error('Ingrese un número de documento para buscar')
      return
    }

    if (docType === ID_TYPES.CE || docType === ID_TYPES.PASSPORT) {
      toast.info('La búsqueda automática solo está disponible para DNI y RUC. Completa los datos manualmente.')
      return
    }

    setIsLookingUpDocument(true)

    try {
      let result

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
        // Autocompletar datos
        if (docNumber.length === 8) {
          // Datos de DNI
          setManualCustomer(prev => ({
            ...prev,
            name: result.data.nombreCompleto || '',
          }))
          toast.success(`Datos encontrados: ${result.data.nombreCompleto}`)
        } else {
          // Datos de RUC
          setManualCustomer(prev => ({
            ...prev,
            name: result.data.razonSocial || '',
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
      setIsLookingUpDocument(false)
    }
  }

  const handleCreateCustomer = async () => {
    // Solo el nombre es obligatorio. El documento es opcional para cotizaciones.
    if (!manualCustomer.name?.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    // Si ingresaron documento, validar la longitud según el tipo
    if (manualCustomer.documentNumber) {
      if (manualCustomer.documentType === 'DNI' && manualCustomer.documentNumber.length !== 8) {
        toast.error('El DNI debe tener 8 dígitos')
        return
      }
      if (manualCustomer.documentType === 'RUC' && manualCustomer.documentNumber.length !== 11) {
        toast.error('El RUC debe tener 11 dígitos')
        return
      }
    }

    setIsCreatingCustomer(true)

    try {
      const result = await createCustomer(getBusinessId(), manualCustomer)

      if (result.success) {
        toast.success('Cliente creado exitosamente')

        // Recargar clientes
        const customersResult = await getCustomers(getBusinessId())
        if (customersResult.success) {
          setCustomers(customersResult.data || [])

          // Seleccionar el cliente recién creado
          const newCustomer = customersResult.data.find(c => c.id === result.id)
          if (newCustomer) {
            setSelectedCustomer(newCustomer)
            setCustomerMode('select')
          }
        }

        setShowNewCustomerModal(false)
        setManualCustomer({
          documentType: 'DNI',
          documentNumber: '',
          name: '',
          email: '',
          phone: '',
          address: '',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear cliente:', error)
      toast.error(error.message || 'Error al crear el cliente')
    } finally {
      setIsCreatingCustomer(false)
    }
  }

  const getCustomerData = () => {
    if (customerMode === 'select' && selectedCustomer) {
      return {
        id: selectedCustomer.id,
        documentType: selectedCustomer.documentType,
        documentNumber: selectedCustomer.documentNumber,
        name: selectedCustomer.name,
        businessName: selectedCustomer.businessName || '',
        email: selectedCustomer.email || '',
        phone: selectedCustomer.phone || '',
        address: selectedCustomer.address || '',
      }
    } else if (customerMode === 'manual') {
      return {
        documentType: manualCustomer.documentType,
        documentNumber: manualCustomer.documentNumber,
        name: manualCustomer.name,
        businessName: '',
        email: manualCustomer.email || '',
        phone: manualCustomer.phone || '',
        address: manualCustomer.address || '',
      }
    }
    return null
  }

  const validateForm = () => {
    // Validar que haya datos de cliente. El documento es opcional —
    // solo el nombre es requerido para emitir una cotización.
    const customerData = getCustomerData()
    if (!customerData || !customerData.name) {
      toast.error('Debe ingresar al menos el nombre del cliente')
      return false
    }

    // Validar que haya al menos un item
    if (quotationItems.length === 0) {
      toast.error('Debe agregar al menos un item')
      return false
    }

    // Validar que todos los items tengan datos válidos
    for (let i = 0; i < quotationItems.length; i++) {
      const item = quotationItems[i]
      if (!item.name || !item.quantity || !item.unitPrice) {
        toast.error(`Item ${i + 1}: Todos los campos son obligatorios`)
        return false
      }
      if (parseFloat(item.quantity) <= 0 || parseFloat(item.unitPrice) <= 0) {
        toast.error(`Item ${i + 1}: Cantidad y precio deben ser mayores a 0`)
        return false
      }
    }

    // Validar días de validez
    if (!validityDays || parseFloat(validityDays) <= 0) {
      toast.error('Los días de validez deben ser mayor a 0')
      return false
    }

    return true
  }

  const onSubmit = async () => {
    if (!user?.uid) return

    if (!validateForm()) {
      return
    }

    setIsSaving(true)

    try {
      // Preparar items de la cotización
      const items = quotationItems.map(item => {
        const productCatalog = products.find(p => p.id === item.productId)
        return {
          productId: item.productId || '',
          code: productCatalog?.code || '',
          name: item.name,
          description: item.description || '',
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          // Multi-divisa: si la cotización es USD, persistir basePrice (PEN
          // exacto) para conversiones futuras sin pérdida de precisión.
          ...(currency === 'USD' && Number(item.basePrice) > 0 && {
            basePrice: Number(item.basePrice),
          }),
          unit: item.unit,
          subtotal: calculateItemTotal(item),
          imageUrl: item.imageUrl || productCatalog?.imageUrl || productCatalog?.image || '',
          laboratoryName: item.laboratoryName || '',
          marca: item.marca || '',
          genericName: item.genericName || '',
          concentration: item.concentration || '',
          presentation: item.presentation || '',
          batchNumber: item.batchNumber || '',
          activeIngredient: item.activeIngredient || '',
          therapeuticAction: item.therapeuticAction || '',
          saleCondition: item.saleCondition || '',
          sanitaryRegistry: item.sanitaryRegistry || '',
          // Persistir metadata de variante / presentación. Sin estos campos, al
          // convertir la cotización a venta el POS no sabe qué variante descontar
          // y el stock se desincroniza (movimiento sin variantSku).
          ...(item.isVariant && {
            isVariant: true,
            variantSku: item.variantSku || '',
            variantAttributes: item.variantAttributes || {},
          }),
          ...(item.presentationName && {
            presentationName: item.presentationName,
            presentationFactor: item.presentationFactor || 1,
          }),
        }
      })

      // Calcular fecha de expiración desde la fecha de emisión
      const expiryDate = new Date(issueDate + 'T00:00:00')
      expiryDate.setDate(expiryDate.getDate() + parseInt(validityDays))

      // Obtener datos del cliente
      const customerData = getCustomerData()

      // Multi-divisa: equivalentes en PEN base. Si la cotización es USD,
      // sumamos basePrice de items con basePrice + conversión TC para
      // resto. Si es PEN, los inBase son iguales a los nativos.
      const computeInBase = () => {
        if (currency === 'PEN') {
          return {
            subtotalInBase: baseAmounts.subtotal,
            igvInBase: finalIgv,
            totalInBase: finalTotal,
          }
        }
        return {
          subtotalInBase: Number(convertToBase(baseAmounts.subtotal, 'USD', exchangeRate).toFixed(2)),
          igvInBase: Number(convertToBase(finalIgv, 'USD', exchangeRate).toFixed(2)),
          totalInBase: Number(convertToBase(finalTotal, 'USD', exchangeRate).toFixed(2)),
        }
      }
      const inBaseAmounts = computeInBase()

      if (isEditing) {
        // MODO EDICIÓN: Actualizar cotización existente
        const quotationData = {
          customer: customerData,
          items: items,
          subtotal: baseAmounts.subtotal,
          discount: parseFloat(discount) || 0,
          discountType: discountType,
          discountedSubtotal: discountedSubtotal,
          igv: finalIgv,
          total: finalTotal,
          // Multi-divisa: moneda + TC congelado + equivalentes PEN base
          currency: normalizeCurrency(currency),
          exchangeRate: currency === 'USD' ? (Number(exchangeRate) || 1) : 1,
          ...inBaseAmounts,
          hideIgv: hideIgv,
          issueDate: new Date(issueDate + 'T00:00:00'),
          validityDays: parseInt(validityDays),
          expiryDate: expiryDate,
          terms: terms,
          notes: notes,
          recipientName: recipientName,
          recipientPosition: recipientPosition,
          branchId: selectedBranch?.id || null,
          branchName: selectedBranch?.name || null,
          branchAddress: selectedBranch?.address || null,
          sellerId: selectedSeller?.id || null,
          sellerName: selectedSeller?.name || null,
          sellerCode: selectedSeller?.code || null,
        }

        const result = await updateQuotation(getBusinessId(), quotationId, quotationData)
        if (!result.success) {
          throw new Error(result.error || 'Error al actualizar la cotización')
        }

        toast.success(`Cotización ${editingQuotationNumber} actualizada exitosamente`)
      } else {
        // MODO CREACIÓN: Crear nueva cotización
        let finalNumber

        if (useCustomNumber && customSeries && customNumber) {
          // Usar serie y número personalizado
          finalNumber = `${customSeries}-${customNumber.padStart(8, '0')}`
        } else {
          // Usar número automático
          const numberResult = await getNextQuotationNumber(getBusinessId())
          if (!numberResult.success) {
            throw new Error('Error al generar número de cotización')
          }
          finalNumber = numberResult.number
        }

        const quotationData = {
          number: finalNumber,
          customer: customerData,
          items: items,
          subtotal: baseAmounts.subtotal,
          discount: parseFloat(discount) || 0,
          discountType: discountType,
          discountedSubtotal: discountedSubtotal,
          igv: finalIgv,
          total: finalTotal,
          // Multi-divisa: moneda + TC congelado + equivalentes PEN base
          currency: normalizeCurrency(currency),
          exchangeRate: currency === 'USD' ? (Number(exchangeRate) || 1) : 1,
          ...inBaseAmounts,
          hideIgv: hideIgv,
          issueDate: new Date(issueDate + 'T00:00:00'),
          validityDays: parseInt(validityDays),
          expiryDate: expiryDate,
          status: 'draft',
          terms: terms,
          notes: notes,
          recipientName: recipientName,
          recipientPosition: recipientPosition,
          customSeries: useCustomNumber ? customSeries : '',
          customNumber: useCustomNumber ? customNumber : '',
          sentVia: [],
          branchId: selectedBranch?.id || null,
          branchName: selectedBranch?.name || null,
          branchAddress: selectedBranch?.address || null,
          sellerId: selectedSeller?.id || null,
          sellerName: selectedSeller?.name || null,
          sellerCode: selectedSeller?.code || null,
          createdBy: user.uid,
          createdByName: user.displayName || user.email || 'Usuario',
          createdByEmail: user.email || '',
        }

        const result = await createQuotation(getBusinessId(), quotationData)
        if (!result.success) {
          throw new Error(result.error || 'Error al crear la cotización')
        }

        toast.success(`Cotización ${finalNumber} creada exitosamente`)
      }

      clearDraft() // Borrador ya no hace falta

      setTimeout(() => {
        appNavigate('cotizaciones')
      }, 1500)
    } catch (error) {
      console.error('Error al guardar cotización:', error)
      toast.error(error.message || 'Error al guardar la cotización. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => appNavigate('cotizaciones')}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {isEditing ? `Editar Cotización ${editingQuotationNumber}` : 'Nueva Cotización'}
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600">
            {isEditing ? 'Modifica los datos de la cotización' : 'Crea una nueva cotización para enviar a tus clientes'}
          </p>
        </div>
      </div>

      {/* Main Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Form Fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Serie y Número (solo en modo creación) */}
          {!isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="w-5 h-5" />
                  Serie y Numeración
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="useCustomNumber"
                      checked={useCustomNumber}
                      onChange={e => setUseCustomNumber(e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <label htmlFor="useCustomNumber" className="text-sm font-medium text-gray-700">
                      Usar serie y número personalizado
                    </label>
                  </div>

                  {useCustomNumber && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                      <Input
                        label="Serie"
                        value={customSeries}
                        onChange={e => setCustomSeries(e.target.value.toUpperCase())}
                        placeholder="COT"
                        maxLength={4}
                      />
                      <Input
                        label="Número"
                        type="number"
                        value={customNumber}
                        onChange={e => setCustomNumber(e.target.value)}
                        placeholder="1"
                        min="1"
                      />
                      <div className="col-span-2 text-sm text-gray-500">
                        Vista previa: <strong>{customSeries || 'COT'}-{(customNumber || '1').padStart(8, '0')}</strong>
                      </div>
                    </div>
                  )}

                  {!useCustomNumber && (
                    <p className="text-sm text-gray-500">
                      Se generará automáticamente el siguiente número disponible según la configuración de series.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sucursal (solo si hay sucursales configuradas) */}
          {branches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="w-5 h-5" />
                  Sucursal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Selecciona la sucursal desde donde se emite esta cotización. La dirección de la sucursal aparecerá en el documento.
                  </p>
                  <select
                    value={selectedBranch?.id || ''}
                    onChange={(e) => {
                      const branch = branches.find(b => b.id === e.target.value)
                      setSelectedBranch(branch || null)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Sucursal Principal (por defecto)</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name} {branch.address ? `- ${branch.address}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedBranch && (
                    <div className="p-3 bg-gray-50 rounded-lg text-sm">
                      <p className="font-medium text-gray-700">{selectedBranch.name}</p>
                      {selectedBranch.address && (
                        <p className="text-gray-600">{selectedBranch.address}</p>
                      )}
                      {(selectedBranch.district || selectedBranch.province || selectedBranch.department) && (
                        <p className="text-gray-500">
                          {[selectedBranch.district, selectedBranch.province, selectedBranch.department].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vendedor (solo si hay vendedores configurados) */}
          {sellers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Vendedor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <select
                  value={selectedSeller?.id || ''}
                  onChange={e => {
                    const seller = sellers.find(s => s.id === e.target.value)
                    setSelectedSeller(seller || null)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Sin vendedor asignado</option>
                  {sellers
                    .filter(s => {
                      if (!selectedBranch) return !s.branchId
                      return s.branchId === selectedBranch.id
                    })
                    .map(seller => (
                      <option key={seller.id} value={seller.id}>
                        {seller.code ? `${seller.code} - ` : ''}{seller.name}
                      </option>
                    ))
                  }
                </select>
              </CardContent>
            </Card>
          )}

          {/* Cliente */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Información del Cliente</CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewCustomerModal(true)}
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Nuevo Cliente
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Tabs para seleccionar modo */}
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCustomerMode('select')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      customerMode === 'select'
                        ? 'bg-white text-primary-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Cliente Registrado
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode('manual')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      customerMode === 'manual'
                        ? 'bg-white text-primary-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Datos Manuales
                  </button>
                </div>

                {/* Modo: Seleccionar cliente */}
                {customerMode === 'select' && (
                  <>
                    <Select
                      label="Cliente *"
                      value={selectedCustomer?.id || ''}
                      onChange={e => handleCustomerChange(e.target.value)}
                    >
                      <option value="">Seleccionar cliente...</option>
                      {customers.map(customer => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name} - {customer.documentNumber}
                        </option>
                      ))}
                    </Select>

                    {selectedCustomer && (
                      <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-600">Nombre:</span>
                            <span className="ml-2 font-medium">{selectedCustomer.name}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Documento:</span>
                            <span className="ml-2 font-medium">
                              {selectedCustomer.documentType} {selectedCustomer.documentNumber}
                            </span>
                          </div>
                          {selectedCustomer.email && (
                            <div>
                              <span className="text-gray-600">Email:</span>
                              <span className="ml-2 font-medium">{selectedCustomer.email}</span>
                            </div>
                          )}
                          {selectedCustomer.phone && (
                            <div>
                              <span className="text-gray-600">Teléfono:</span>
                              <span className="ml-2 font-medium">{selectedCustomer.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Modo: Datos manuales */}
                {customerMode === 'manual' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                      label="Tipo de Documento *"
                      value={manualCustomer.documentType}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, documentType: e.target.value })
                      }
                    >
                      <option value="DNI">DNI</option>
                      <option value="RUC">RUC</option>
                      <option value="CE">Carnet de Extranjería</option>
                      <option value="PASSPORT">Pasaporte</option>
                    </Select>

                    {/* Campo Número de Documento con botón de búsqueda */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Número de Documento <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={manualCustomer.documentNumber}
                          onChange={e =>
                            setManualCustomer({ ...manualCustomer, documentNumber: e.target.value })
                          }
                          placeholder={
                            manualCustomer.documentType === 'DNI'
                              ? '12345678'
                              : manualCustomer.documentType === 'RUC'
                              ? '20123456789'
                              : 'Número'
                          }
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={handleLookupDocument}
                          disabled={isLookingUpDocument}
                          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                          title="Buscar datos del documento"
                        >
                          {isLookingUpDocument ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Si lo ingresas, podemos buscar los datos automáticamente con la lupa.
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <Input
                        label="Nombre / Razón Social *"
                        value={manualCustomer.name}
                        onChange={e =>
                          setManualCustomer({ ...manualCustomer, name: e.target.value })
                        }
                        placeholder="Nombre completo o razón social"
                      />
                    </div>

                    <Input
                      type="email"
                      label="Email"
                      value={manualCustomer.email}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, email: e.target.value })
                      }
                      placeholder="cliente@email.com"
                    />

                    <Input
                      type="tel"
                      label="Teléfono"
                      value={manualCustomer.phone}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, phone: e.target.value })
                      }
                      placeholder="987654321"
                    />

                    <div className="sm:col-span-2">
                      <Input
                        label="Dirección"
                        value={manualCustomer.address}
                        onChange={e =>
                          setManualCustomer({ ...manualCustomer, address: e.target.value })
                        }
                        placeholder="Dirección completa"
                      />
                    </div>
                  </div>
                )}

                {/* Destinatario (dentro del card de cliente) */}
                <div className="pt-4 mt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Dirigido a (opcional)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Nombre del contacto"
                      value={recipientName}
                      onChange={e => setRecipientName(e.target.value)}
                      placeholder="Ej: Juan Pérez"
                    />
                    <Input
                      label="Cargo"
                      value={recipientPosition}
                      onChange={e => setRecipientPosition(e.target.value)}
                      placeholder="Ej: Gerente de Compras"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Productos / Servicios</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Desktop: Tabla compacta */}
              <div className="hidden lg:block">
                <table className="w-full table-fixed">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 w-[35%]">Producto</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[14%]">Cant.</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[18%]">Unidad</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[14%]">P. Unit.</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3 w-[14%]">Subtotal</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[5%]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quotationItems.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        {/* Producto - búsqueda inline */}
                        <td className="px-4 py-2">
                          <div className="relative">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="text"
                                value={item.productId ? item.name : item.searchTerm}
                                onChange={e => {
                                  if (item.productId) {
                                    updateItem(index, 'name', e.target.value)
                                  } else {
                                    const val = e.target.value
                                    const newItems = [...quotationItems]
                                    newItems[index].searchTerm = val
                                    newItems[index].name = val
                                    setQuotationItems(newItems)
                                    setShowProductSearch(index)
                                  }
                                }}
                                onFocus={() => !item.productId && setShowProductSearch(index)}
                                placeholder="Buscar producto o escribir nombre..."
                                className={`w-full pl-7 pr-7 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                  item.productId ? 'border-green-500 bg-green-50' : 'border-gray-300'
                                }`}
                              />
                              {item.productId && (
                                <button
                                  type="button"
                                  onClick={() => clearProductSelection(index)}
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            {/* Stock informativo (solo vista, no restringe) */}
                            {item.productId && (() => {
                              const stock = getStockForItem(item)
                              if (stock === null || stock === undefined) return null
                              const minStock = getProductForItem(item)?.minStock ?? 3
                              return (
                                <p className="text-[11px] text-gray-500 mt-1 ml-1">
                                  Stock: <span className={`font-medium ${stock <= 0 ? 'text-red-600' : stock <= minStock ? 'text-amber-600' : 'text-gray-700'}`}>{stock}</span>
                                </p>
                              )
                            })()}
                            {/* Dropdown de resultados */}
                            {showProductSearch === index && !item.productId && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setShowProductSearch(null)}
                                />
                                <div className="absolute z-20 left-0 w-full min-w-[450px] max-w-[90vw] mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                  {getFilteredProducts(item.searchTerm).length > 0 ? (
                                    getFilteredProducts(item.searchTerm).map(product => {
                                      const hasPresentations = businessSettings?.presentationsEnabled &&
                                                               product.presentations?.length > 0
                                      const hasMultiplePrices = businessSettings?.multiplePricesEnabled &&
                                                                (product.price2 || product.price3 || product.price4)
                                      const hasVariants = product.hasVariants && product.variants?.length > 0
                                      const displayPrice = hasVariants ? product.basePrice : product.price
                                      return (
                                        <button
                                          key={product.id}
                                          type="button"
                                          onClick={() => selectProduct(index, product)}
                                          className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <p className="font-medium text-sm truncate">{product.name}</p>
                                              {hasVariants && (
                                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 flex-shrink-0">
                                                  Variantes
                                                </span>
                                              )}
                                              {hasMultiplePrices && (
                                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 flex-shrink-0">
                                                  <Tag className="w-2.5 h-2.5 mr-0.5" />
                                                  Precios
                                                </span>
                                              )}
                                              {hasPresentations && (
                                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 flex-shrink-0">
                                                  <Package className="w-2.5 h-2.5 mr-0.5" />
                                                  Pres.
                                                </span>
                                              )}
                                            </div>
                                            {product.code && (
                                              <p className="text-xs text-gray-500">{product.code}</p>
                                            )}
                                          </div>
                                          <span className="text-sm font-semibold text-primary-600 ml-2 flex-shrink-0">
                                            {hasVariants ? `Desde ${formatCurrency(toSessionCurrency(Math.min(...product.variants.map(v => v.price))), currency)}` : formatCurrency(toSessionCurrency(displayPrice), currency)}
                                          </span>
                                        </button>
                                      )
                                    })
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                      No se encontraron productos
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        {/* Cantidad */}
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity}
                            onChange={e => updateItem(index, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        {/* Unidad */}
                        <td className="px-2 py-2">
                          <select
                            value={item.unit}
                            onChange={e => updateItem(index, 'unit', e.target.value)}
                            className="w-full px-1 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                          >
                            {UNITS.map(unit => (
                              <option key={unit.value} value={unit.value}>
                                {unit.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* Precio Unitario */}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={e => updateItem(index, 'unitPrice', e.target.value)}
                              className="flex-1 min-w-0 px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                            {(() => {
                              const opts = getItemPriceOptions(item)
                              if (opts.length < 2) return null
                              return (
                                <div className="relative flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setPricePickerIndex(pricePickerIndex === index ? null : index)}
                                    className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded border border-gray-300"
                                    title="Cambiar precio"
                                  >
                                    <Tag className="w-3.5 h-3.5" />
                                  </button>
                                  {pricePickerIndex === index && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setPricePickerIndex(null)} />
                                      <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                                        <p className="px-3 py-1 text-[10px] uppercase font-semibold text-gray-400">Cambiar precio</p>
                                        {opts.map(opt => (
                                          <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => setItemPrice(index, opt.value)}
                                            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex justify-between items-center ${
                                              Number(item.unitPrice) === Number(opt.value) ? 'bg-primary-50 text-primary-700 font-medium' : ''
                                            }`}
                                          >
                                            <span>{opt.label}</span>
                                            <span className="font-medium">{formatCurrency(toSessionCurrency(opt.value), currency)}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        </td>
                        {/* Subtotal */}
                        <td className="px-4 py-2 text-right">
                          <span className="font-semibold text-sm text-gray-900">
                            {formatCurrency(calculateItemTotal(item), currency)}
                          </span>
                        </td>
                        {/* Eliminar */}
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            disabled={quotationItems.length === 1}
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Botón "Agregar producto" al final (estilo Odoo): útil cuando la lista
                  crece y tener que scrollear hasta arriba cada vez es molesto. */}
              <button
                type="button"
                onClick={addItem}
                className="hidden lg:flex w-full items-center gap-2 px-4 py-2 mt-2 text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors"
              >
                <Plus className="w-4 h-4" />
                Agregar un producto
              </button>

              {/* Móvil: Lista compacta */}
              <div className="lg:hidden divide-y divide-gray-200">
                {quotationItems.map((item, index) => (
                  <div key={index} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        disabled={quotationItems.length === 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Búsqueda de producto */}
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={item.productId ? item.name : item.searchTerm}
                          onChange={e => {
                            if (item.productId) {
                              updateItem(index, 'name', e.target.value)
                            } else {
                              const val = e.target.value
                              const newItems = [...quotationItems]
                              newItems[index].searchTerm = val
                              newItems[index].name = val
                              setQuotationItems(newItems)
                              setShowProductSearch(index)
                            }
                          }}
                          onFocus={() => !item.productId && setShowProductSearch(index)}
                          placeholder="Buscar producto o escribir nombre..."
                          className={`w-full pl-8 pr-8 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                            item.productId ? 'border-green-500 bg-green-50' : 'border-gray-300'
                          }`}
                        />
                        {item.productId && (
                          <button
                            type="button"
                            onClick={() => clearProductSelection(index)}
                            className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {/* Stock informativo (solo vista) */}
                      {item.productId && (() => {
                        const stock = getStockForItem(item)
                        if (stock === null || stock === undefined) return null
                        const minStock = getProductForItem(item)?.minStock ?? 3
                        return (
                          <p className="text-[11px] text-gray-500 mt-1 ml-1">
                            Stock: <span className={`font-medium ${stock <= 0 ? 'text-red-600' : stock <= minStock ? 'text-amber-600' : 'text-gray-700'}`}>{stock}</span>
                          </p>
                        )
                      })()}
                      {/* Dropdown de resultados */}
                      {showProductSearch === index && !item.productId && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowProductSearch(null)}
                          />
                          <div className="absolute z-20 left-0 w-full min-w-[450px] max-w-[90vw] mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {getFilteredProducts(item.searchTerm).length > 0 ? (
                              getFilteredProducts(item.searchTerm).map(product => {
                                const hasPresentations = businessSettings?.presentationsEnabled &&
                                                         product.presentations?.length > 0
                                const hasMultiplePrices = businessSettings?.multiplePricesEnabled &&
                                                          (product.price2 || product.price3 || product.price4)
                                const hasVariants = product.hasVariants && product.variants?.length > 0
                                const displayPrice = hasVariants ? product.basePrice : product.price
                                return (
                                  <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => selectProduct(index, product)}
                                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="font-medium text-sm truncate">{product.name}</p>
                                        {hasVariants && (
                                          <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 flex-shrink-0">
                                            Variantes
                                          </span>
                                        )}
                                        {hasMultiplePrices && (
                                          <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 flex-shrink-0">
                                            <Tag className="w-2.5 h-2.5 mr-0.5" />
                                            Precios
                                          </span>
                                        )}
                                        {hasPresentations && (
                                          <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 flex-shrink-0">
                                            <Package className="w-2.5 h-2.5 mr-0.5" />
                                            Pres.
                                          </span>
                                        )}
                                      </div>
                                      {product.code && (
                                        <p className="text-xs text-gray-500">{product.code}</p>
                                      )}
                                    </div>
                                    <span className="text-sm font-semibold text-primary-600 ml-2 flex-shrink-0">
                                      {hasVariants ? `Desde ${formatCurrency(Math.min(...product.variants.map(v => v.price)))}` : formatCurrency(displayPrice)}
                                    </span>
                                  </button>
                                )
                              })
                            ) : (
                              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                No se encontraron productos
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Unidad */}
                    <select
                      value={item.unit}
                      onChange={e => updateItem(index, 'unit', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                    >
                      {UNITS.map(unit => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>

                    {/* Cant | P.Unit | Subtotal */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cant.</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity}
                          onChange={e => updateItem(index, 'quantity', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">P. Unit.</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={e => updateItem(index, 'unitPrice', e.target.value)}
                            className="flex-1 min-w-0 px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          {(() => {
                            const opts = getItemPriceOptions(item)
                            if (opts.length < 2) return null
                            return (
                              <div className="relative flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setPricePickerIndex(pricePickerIndex === index ? null : index)}
                                  className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded border border-gray-300"
                                  title="Cambiar precio"
                                >
                                  <Tag className="w-3.5 h-3.5" />
                                </button>
                                {pricePickerIndex === index && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setPricePickerIndex(null)} />
                                    <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                                      <p className="px-3 py-1 text-[10px] uppercase font-semibold text-gray-400">Cambiar precio</p>
                                      {opts.map(opt => (
                                        <button
                                          key={opt.key}
                                          type="button"
                                          onClick={() => setItemPrice(index, opt.value)}
                                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex justify-between items-center ${
                                            Number(item.unitPrice) === Number(opt.value) ? 'bg-primary-50 text-primary-700 font-medium' : ''
                                          }`}
                                        >
                                          <span>{opt.label}</span>
                                          <span className="font-medium">{formatCurrency(opt.value)}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Subtotal</label>
                        <div className="h-[34px] flex items-center justify-center bg-gray-50 border border-gray-200 rounded">
                          <span className="font-semibold text-sm text-gray-900">
                            {formatCurrency(calculateItemTotal(item), currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Botón "Agregar producto" al final en móvil */}
                <button
                  type="button"
                  onClick={addItem}
                  className="flex w-full items-center justify-center gap-2 px-4 py-3 text-sm text-primary-600 hover:bg-primary-50 rounded transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Agregar un producto
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Configuración Adicional */}
          <Card>
            <CardHeader>
              <CardTitle>Configuración Adicional</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Selector de Moneda (multi-divisa, opt-in) */}
                {quoteMultiCurrencyOn && (
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <label className="text-sm font-medium text-gray-700">Moneda de la cotización</label>
                    </div>
                    <div className="flex gap-2">
                      {SUPPORTED_CURRENCIES.map((ccy) => {
                        const active = currency === ccy
                        return (
                          <button
                            key={ccy}
                            type="button"
                            onClick={() => handleCurrencyChange(ccy)}
                            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                              active
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {ccy === 'PEN' ? 'S/  Soles' : '$  Dólares'}
                          </button>
                        )
                      })}
                    </div>
                    {currency === 'USD' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700">
                            Tipo de cambio (PEN por USD)
                          </label>
                          {exchangeRateSource === 'sbs' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 font-medium">SBS</span>
                          )}
                          {exchangeRateSource === 'cache' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 font-medium">Cache</span>
                          )}
                          {exchangeRateSource === 'manual' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">Manual</span>
                          )}
                        </div>
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={exchangeRateInput}
                            onFocus={() => setTcInputFocused(true)}
                            onBlur={() => {
                              setTcInputFocused(false)
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
                            className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={fetchExchangeRate}
                            disabled={loadingRate}
                            className="h-9 px-3 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
                            title="Obtener TC del día desde SBS"
                          >
                            {loadingRate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            SBS
                          </button>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          El TC se congela al guardar. Al convertir la cotización a factura, el POS heredará esta moneda.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    type="date"
                    label="Fecha de Emisión"
                    value={issueDate}
                    onChange={e => setIssueDate(e.target.value)}
                  />
                  <Input
                    type="number"
                    label="Validez (días) *"
                    value={validityDays}
                    onChange={e => setValidityDays(e.target.value)}
                    min="1"
                    help="Días de validez de la cotización"
                  />

                  <Select
                    label="Tipo de Descuento"
                    value={discountType}
                    onChange={e => setDiscountType(e.target.value)}
                  >
                    <option value="fixed">Monto Fijo ({currency === 'USD' ? '$' : 'S/'})</option>
                    <option value="percentage">Porcentaje (%)</option>
                  </Select>

                  <Input
                    type="number"
                    label={`Descuento ${discountType === 'percentage' ? '(%)' : `(${currency === 'USD' ? '$' : 'S/'})`}`}
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="hideIgv"
                    checked={hideIgv}
                    onChange={e => setHideIgv(e.target.checked)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="hideIgv" className="ml-2 text-sm font-medium text-gray-700">
                    Ocultar IGV (mostrar solo total)
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Términos y Condiciones
                    </label>
                    {businessSettings?.termsTemplates?.length > 0 && (
                      <select
                        onChange={e => {
                          const template = businessSettings.termsTemplates.find(t => t.id === e.target.value)
                          if (template) {
                            setTerms(template.content)
                          }
                        }}
                        className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        defaultValue=""
                      >
                        <option value="" disabled>Usar plantilla...</option>
                        {businessSettings.termsTemplates.map(template => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <textarea
                    value={terms}
                    onChange={e => setTerms(e.target.value)}
                    rows="6"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Ejemplo: Precios sujetos a cambio sin previo aviso. Válido solo para pedidos confirmados..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observaciones
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows="4"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Observaciones adicionales..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2 text-sm">
                  {!hideIgv && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">{formatCurrency(discountedSubtotal, currency)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>
                        Descuento {discountType === 'percentage' ? `(${discount}%)` : ''}:
                      </span>
                      <span className="font-medium">- {formatCurrency(discountAmount, currency)}</span>
                    </div>
                  )}
                  {!hideIgv && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">{isIgvExempt ? 'OP. EXONERADA:' : 'IGV (18%):'}</span>
                      <span className="font-medium">{formatCurrency(finalIgv, currency)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      Total:
                      {quoteMultiCurrencyOn && currency === 'USD' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">USD · TC {exchangeRate}</span>
                      )}
                    </span>
                    <span className="text-2xl font-bold text-primary-600">
                      {formatCurrency(finalTotal, currency)}
                    </span>
                  </div>
                  {quoteMultiCurrencyOn && currency === 'USD' && exchangeRate > 0 && (
                    <div className="text-right text-xs text-gray-500 mt-1">
                      ≈ {formatCurrency(convertToBase(finalTotal, 'USD', exchangeRate), 'PEN')} al TC congelado
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t space-y-2 text-sm text-gray-600">
                  <p>
                    <strong>Items:</strong> {quotationItems.length}
                  </p>
                  <p>
                    <strong>Validez:</strong> {validityDays} días
                  </p>
                  {customerMode === 'select' && selectedCustomer && (
                    <p>
                      <strong>Cliente:</strong> {selectedCustomer.name}
                    </p>
                  )}
                  {customerMode === 'manual' && manualCustomer.name && (
                    <p>
                      <strong>Cliente:</strong> {manualCustomer.name}
                    </p>
                  )}
                </div>

                <div className="pt-4">
                  <Button onClick={onSubmit} disabled={isSaving} className="w-full">
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {isEditing ? 'Actualizando...' : 'Guardando...'}
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {isEditing ? 'Guardar Cambios' : 'Crear Cotización'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal: Nuevo Cliente */}
      <Modal
        isOpen={showNewCustomerModal}
        onClose={() => !isCreatingCustomer && setShowNewCustomerModal(false)}
        title="Crear Nuevo Cliente"
        maxWidth="md"
      >
        <div className="space-y-3">
          {/* Tipo + Número de documento con lupa */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-36 flex-shrink-0">
              <Select
                label="Tipo *"
                value={manualCustomer.documentType}
                onChange={e =>
                  setManualCustomer({ ...manualCustomer, documentType: e.target.value })
                }
              >
                <option value="DNI">DNI</option>
                <option value="RUC">RUC</option>
                <option value="CE">CE</option>
                <option value="PASSPORT">Pasaporte</option>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                N° Documento <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={manualCustomer.documentNumber}
                  onChange={e =>
                    setManualCustomer({ ...manualCustomer, documentNumber: e.target.value })
                  }
                  placeholder={
                    manualCustomer.documentType === 'DNI'
                      ? '12345678'
                      : manualCustomer.documentType === 'RUC'
                      ? '20123456789'
                      : 'Número'
                  }
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                />
                <button
                  type="button"
                  onClick={handleLookupDocument}
                  disabled={isLookingUpDocument}
                  className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center flex-shrink-0 transition-colors"
                  title="Buscar datos del documento"
                >
                  {isLookingUpDocument ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <Input
            label="Nombre / Razón Social *"
            value={manualCustomer.name}
            onChange={e => setManualCustomer({ ...manualCustomer, name: e.target.value })}
            placeholder="Nombre completo o razón social"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="email"
              label="Email"
              value={manualCustomer.email}
              onChange={e => setManualCustomer({ ...manualCustomer, email: e.target.value })}
              placeholder="cliente@email.com"
            />
            <Input
              type="tel"
              label="Teléfono"
              value={manualCustomer.phone}
              onChange={e => setManualCustomer({ ...manualCustomer, phone: e.target.value })}
              placeholder="987654321"
            />
          </div>

          <Input
            label="Dirección"
            value={manualCustomer.address}
            onChange={e => setManualCustomer({ ...manualCustomer, address: e.target.value })}
            placeholder="Dirección completa"
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowNewCustomerModal(false)}
              disabled={isCreatingCustomer}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateCustomer} disabled={isCreatingCustomer}>
              {isCreatingCustomer ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Crear y Usar
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Selección de Variante */}
      <Modal
        isOpen={showVariantModal}
        onClose={() => {
          setShowVariantModal(false)
          setPendingProductSelection(null)
        }}
        title={`Seleccionar variante - ${pendingProductSelection?.product?.name || ''}`}
        maxWidth="md"
      >
        {pendingProductSelection?.product && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Selecciona la variante del producto:
            </p>
            <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
              {pendingProductSelection.product.variants?.map((variant, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleVariantSelection(variant)}
                  className="p-4 border-2 border-gray-200 rounded-lg text-left transition-all hover:border-primary-500 hover:bg-primary-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {variant.sku && (
                        <p className="font-mono text-xs text-gray-500 mb-1">{variant.sku}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mb-2">
                        {Object.entries(variant.attributes || {}).map(([key, value]) => (
                          <span key={key} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                      <p className="text-lg font-bold text-primary-600">
                        {formatCurrency(toSessionCurrency(variant.price), currency)}
                      </p>
                    </div>
                    <Plus className="w-5 h-5 text-primary-600 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
            {pendingProductSelection.product.variants?.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">No hay variantes disponibles.</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Selección de Precio */}
      <Modal
        isOpen={showPriceModal}
        onClose={cancelPendingSelection}
        title="Seleccionar Precio"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Este producto tiene múltiples precios. Seleccione el precio que desea usar para la cotización:
          </p>
          <p className="font-medium text-gray-900">
            {pendingProductSelection?.product?.name}
            {pendingProductSelection?.variant && (
              <span className="text-sm text-gray-500 ml-1">
                ({Object.values(pendingProductSelection.variant.attributes || {}).join(' / ')})
              </span>
            )}
          </p>

          {(() => {
            const priceSource = pendingProductSelection?.variant || pendingProductSelection?.product
            return (
          <div className="grid grid-cols-2 gap-3">
            {/* Precio 1 */}
            <button
              type="button"
              onClick={() => handlePriceSelection('price1')}
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-4 h-4 text-primary-600" />
                <span className="text-sm font-medium text-gray-700">
                  {businessSettings?.priceLabels?.price1 || 'Precio 1'}
                </span>
              </div>
              <p className="text-lg font-bold text-primary-600">
                {formatCurrency(toSessionCurrency(priceSource?.price || 0), currency)}
              </p>
            </button>

            {/* Precio 2 */}
            {priceSource?.price2 && (
              <button
                type="button"
                onClick={() => handlePriceSelection('price2')}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {businessSettings?.priceLabels?.price2 || 'Precio 2'}
                  </span>
                </div>
                <p className="text-lg font-bold text-green-600">
                  {formatCurrency(toSessionCurrency(priceSource?.price2), currency)}
                </p>
              </button>
            )}

            {/* Precio 3 */}
            {priceSource?.price3 && (
              <button
                type="button"
                onClick={() => handlePriceSelection('price3')}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {businessSettings?.priceLabels?.price3 || 'Precio 3'}
                  </span>
                </div>
                <p className="text-lg font-bold text-blue-600">
                  {formatCurrency(toSessionCurrency(priceSource?.price3), currency)}
                </p>
              </button>
            )}

            {/* Precio 4 */}
            {priceSource?.price4 && (
              <button
                type="button"
                onClick={() => handlePriceSelection('price4')}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {businessSettings?.priceLabels?.price4 || 'Precio 4'}
                  </span>
                </div>
                <p className="text-lg font-bold text-purple-600">
                  {formatCurrency(toSessionCurrency(priceSource?.price4), currency)}
                </p>
              </button>
            )}
          </div>
            )
          })()}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={cancelPendingSelection}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Selección de Presentación */}
      <Modal
        isOpen={showPresentationModal}
        onClose={cancelPendingSelection}
        title="Seleccionar Presentación"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Este producto tiene diferentes presentaciones. Seleccione la presentación que desea cotizar:
          </p>
          <p className="font-medium text-gray-900">
            {pendingProductSelection?.product?.name}
          </p>

          <div className="space-y-2">
            {/* Unidad base */}
            <button
              type="button"
              onClick={() => selectProduct(
                pendingProductSelection?.index,
                pendingProductSelection?.product,
                pendingProductSelection?.product?.price,
                null
              )}
              className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="font-medium">Unidad</p>
                  <p className="text-xs text-gray-500">Presentación base</p>
                </div>
              </div>
              <p className="text-lg font-bold text-primary-600">
                {formatCurrency(toSessionCurrency(pendingProductSelection?.product?.price || 0), currency)}
              </p>
            </button>

            {/* Presentaciones disponibles */}
            {pendingProductSelection?.product?.presentations?.map((presentation, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePresentationSelection(presentation)}
                className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-primary-500" />
                  <div>
                    <p className="font-medium">{presentation.name}</p>
                    <p className="text-xs text-gray-500">
                      {presentation.factor} unidades
                    </p>
                  </div>
                </div>
                <p className="text-lg font-bold text-primary-600">
                  {formatCurrency(toSessionCurrency(presentation.price), currency)}
                </p>
              </button>
            ))}
          </div>

          {/* Info de stock por presentación */}
          {pendingProductSelection?.product?.stock != null && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-1">
              <p className="text-xs font-medium text-gray-700">Stock disponible:</p>
              <p className="text-sm text-gray-600">
                <span className="font-semibold">{pendingProductSelection.product.stock}</span> unidades
              </p>
              {pendingProductSelection.product.presentations?.map((pres, idx) => {
                const equivalentQty = Math.floor(pendingProductSelection.product.stock / pres.factor)
                return (
                  <p key={idx} className="text-sm text-gray-600">
                    <span className="font-semibold">{equivalentQty}</span> {pres.name} <span className="text-gray-400">(x{pres.factor} unid.)</span>
                  </p>
                )
              })}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={cancelPendingSelection}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
