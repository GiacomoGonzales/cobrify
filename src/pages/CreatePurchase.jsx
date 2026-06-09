import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Trash2, Save, ArrowLeft, Loader2, Search, X, PackagePlus, Package, Beaker, Store, RefreshCw, DollarSign } from 'lucide-react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useAuth } from '@/contexts/AuthContext'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import { formatCurrency, matchesSearchQuery } from '@/lib/utils'
import {
  isMultiCurrencyEnabled,
  getDefaultCurrency,
  convertToBase,
  SUPPORTED_CURRENCIES,
  BASE_CURRENCY,
  normalizeCurrency,
} from '@/utils/currency'
import { getRateForDate } from '@/services/exchangeRateService'
import ProductFormModal, { getRootCategories, getSubcategories } from '@/components/product/ProductFormModal'
import {
  getSuppliers,
  getProducts,
  createPurchase,
  updatePurchase,
  getPurchase,
  updateProduct,
  updateProductStockTransaction,
  createProduct,
  getProductCategories,
  getProductBrands,
} from '@/services/firestoreService'
import { getWarehouses, updateWarehouseStock, createStockMovement } from '@/services/warehouseService'
import { getActiveBranches } from '@/services/branchService'
import { getIngredients, registerPurchase as registerIngredientPurchase, createIngredient, updateIngredient, convertUnit } from '@/services/ingredientService'
import Modal from '@/components/ui/Modal'
import { collection, doc, getDoc, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Helper function for legacy categories (used in ingredient logic)
const migrateLegacyCategories = (cats) => {
  if (!cats || cats.length === 0) return []
  if (typeof cats[0] === 'object' && cats[0].id) return cats
  return cats.map((cat, index) => ({
    id: `cat-${index}`,
    name: cat,
    parentId: null
  }))
}

const getSubcategoriesLocal = (cats, parentId) => {
  const migratedCats = migrateLegacyCategories(cats)
  return migratedCats.filter(cat => cat.parentId === parentId)
}

// Limpiar valores undefined de un objeto (Firestore rechaza undefined)
const cleanUndefined = (obj) => {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(cleanUndefined)
  if (obj instanceof Date) return obj
  if (obj instanceof Timestamp) return obj
  if (obj?.toDate && typeof obj.toDate === 'function') return obj // Firestore Timestamp
  if (typeof obj === 'object') {
    const cleaned = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanUndefined(value)
      }
    }
    return cleaned
  }
  return obj
}

export default function CreatePurchase() {
  const { user } = useAuth()
  const { getBusinessId, businessMode, businessSettings } = useAppContext()
  const navigate = useNavigate()
  const appNavigate = useAppNavigate()
  const location = useLocation()
  const { purchaseId } = useParams() // Para modo edición
  const toast = useToast()

  // Datos de orden de compra (si viene desde PurchaseOrders)
  const fromPurchaseOrder = location.state?.fromPurchaseOrder || null

  // Modo edición
  const isEditMode = !!purchaseId
  const [originalPurchase, setOriginalPurchase] = useState(null) // Datos originales para revertir stock

  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [categories, setCategories] = useState([])
  // Marcas administradas — necesarias para el selector brandId en el modal
  // de crear-producto (sino marca tipeada nunca se asocia a la marca real).
  const [brands, setBrands] = useState([])
  // Modo de items: 'products', 'ingredients', o 'all'
  const [itemMode, setItemMode] = useState('products')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDocType, setInvoiceDocType] = useState('factura') // factura | boleta | guia_interna | dam | dua | otros
  // Obtener fecha local en formato YYYY-MM-DD (sin usar toISOString que convierte a UTC)
  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Parsear fecha YYYY-MM-DD a Date en hora LOCAL (evita problema de timezone)
  // "2024-01-12" con new Date() se interpreta como UTC, causando día incorrecto en Perú
  const parseLocalDate = (dateValue) => {
    if (dateValue instanceof Date) return dateValue
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [year, month, day] = dateValue.split('-').map(Number)
      return new Date(year, month - 1, day, 12, 0, 0) // Mediodía para evitar problemas
    }
    return new Date(dateValue)
  }

  const [invoiceDate, setInvoiceDate] = useState(getLocalDateString())
  const [notes, setNotes] = useState('')

  // Multi-divisa (USD) — solo se renderiza UI si el negocio activó la flag
  // en Configuración. Valores default: PEN, TC=1, sin TC fetch.
  const multiCurrencyOn = useMemo(
    () => isMultiCurrencyEnabled(businessSettings),
    [businessSettings]
  )
  const initialCurrency = useMemo(
    () => (multiCurrencyOn ? getDefaultCurrency(businessSettings) : BASE_CURRENCY),
    [multiCurrencyOn, businessSettings]
  )
  const [currency, setCurrency] = useState(initialCurrency)
  const [exchangeRate, setExchangeRate] = useState(1)
  const [exchangeRateSource, setExchangeRateSource] = useState(null) // 'sbs' | 'cache' | 'manual' | null
  const [loadingRate, setLoadingRate] = useState(false)
  // Multi-divisa: si la compra es en USD y se actualizan precios de venta, fijar el precio de
  // venta como precio EN DÓLARES (priceUSD, ancla fija) en vez de convertirlo a un precio en
  // soles congelado. Así el producto queda "base dólar" (en soles vale priceUSD × TC del día).
  const [salePriceAsUSD, setSalePriceAsUSD] = useState(false)

  // Tipo de pago
  const [paymentType, setPaymentType] = useState('contado') // 'contado' o 'credito'
  const [dueDate, setDueDate] = useState('') // Fecha de vencimiento (opcional)
  // Legacy: mantener para compatibilidad con compras antiguas en modo edición
  const [creditType, setCreditType] = useState('unico')
  const [installments, setInstallments] = useState([]) // Solo para compras antiguas con cuotas
  const [purchaseItems, setPurchaseItems] = useState([
    { productId: '', productName: '', quantity: '', unitPrice: 0, cost: 0, costWithoutIGV: 0, batchNumber: '', expirationDate: '', sanitaryRegistry: '', originalSanitaryRegistry: '', itemType: 'product', unit: 'NIU', salePrice: '', salePrice2: '', salePrice3: '', salePrice4: '', trackSerials: false, serialNumbers: [] },
  ])

  // Warehouses y Branches
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouse, setSelectedWarehouse] = useState(null)
  const [branches, setBranches] = useState([])

  // Estados para el autocompletado de proveedor
  const [supplierSearch, setSupplierSearch] = useState('')
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const supplierInputRef = useRef(null)

  // Estados para el autocompletado de productos
  const [productSearches, setProductSearches] = useState({})
  const [showProductDropdowns, setShowProductDropdowns] = useState({})
  const productInputRefs = useRef({})

  // Estados para el modal de crear producto
  const [showCreateProductModal, setShowCreateProductModal] = useState(false)
  const [currentItemIndex, setCurrentItemIndex] = useState(null)
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)
  const [newProductName, setNewProductName] = useState('')

  // Estados para el modal de crear ingrediente
  const [showCreateIngredientModal, setShowCreateIngredientModal] = useState(false)
  const [isCreatingIngredient, setIsCreatingIngredient] = useState(false)
  const [newIngredientForm, setNewIngredientForm] = useState({ name: '', category: 'otros', purchaseUnit: 'kg' })

  // Estado para menú de crear (producto o ingrediente)
  const [showCreateMenu, setShowCreateMenu] = useState({})

  // Laboratories for pharmacy mode
  const [laboratories, setLaboratories] = useState([])

  useEffect(() => {
    loadData()
  }, [user, purchaseId])

  // Trae el TC de hoy (o de la fecha de factura si está en pasado). Se llama
  // automáticamente al cambiar a USD si el TC actual no fue editado a mano.
  const fetchExchangeRate = async (forceForToday = false) => {
    if (loadingRate) return
    setLoadingRate(true)
    try {
      const refDate = forceForToday ? new Date() : (invoiceDate || new Date())
      const result = await getRateForDate(refDate)
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
      toast.error('No se pudo obtener el TC. Ingresa el valor manualmente.')
    } finally {
      setLoadingRate(false)
    }
  }

  // Al cambiar a USD, si todavía no hay TC válido (=1), traemos uno.
  // En modo edición no auto-fetch (respetamos el TC congelado).
  useEffect(() => {
    if (isEditMode) return
    if (currency === 'USD' && exchangeRate <= 1) {
      fetchExchangeRate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency])

  // SUNAT: las BOLETAS de venta no admiten USD. Forzamos PEN si el usuario
  // selecciona boleta con USD activo. Toast informativo (una sola vez).
  useEffect(() => {
    if (invoiceDocType === 'boleta' && currency === 'USD') {
      setCurrency('PEN')
      setExchangeRate(1)
      setExchangeRateSource(null)
      toast.info('Las boletas siempre se emiten en Soles (SUNAT).')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceDocType])

  // Pre-llenar datos si viene de una orden de compra
  useEffect(() => {
    if (fromPurchaseOrder && suppliers.length > 0 && !isEditMode) {
      // Buscar el proveedor en la lista o usar los datos de la orden
      const orderSupplier = fromPurchaseOrder.supplier
      if (orderSupplier) {
        // Buscar por ID o por RUC
        const existingSupplier = suppliers.find(s =>
          s.id === orderSupplier.id || s.ruc === orderSupplier.ruc
        )

        if (existingSupplier) {
          setSelectedSupplier(existingSupplier)
          setSupplierSearch(existingSupplier.businessName || '')
        } else {
          // Usar los datos de la orden directamente
          setSelectedSupplier({
            ruc: orderSupplier.ruc,
            businessName: orderSupplier.businessName,
            address: orderSupplier.address || '',
            phone: orderSupplier.phone || '',
            email: orderSupplier.email || '',
          })
          setSupplierSearch(orderSupplier.businessName || '')
        }
      }

      // Pre-llenar items
      if (fromPurchaseOrder.items && fromPurchaseOrder.items.length > 0) {
        const newItems = fromPurchaseOrder.items.map(item => {
          // Buscar producto por ID o por nombre
          const existingProduct = products.find(p =>
            p.id === item.productId || p.name === item.name
          )

          const isExemptOC = existingProduct?.taxAffectation === '20' || existingProduct?.taxAffectation === '30'
          const costOC = item.unitPrice || 0
          return {
            productId: existingProduct?.id || item.productId || '',
            productName: item.name || '',
            quantity: item.quantity || 1,
            unitPrice: costOC,
            cost: costOC,
            costWithoutIGV: costOC > 0 ? (isExemptOC ? costOC : costOC / 1.18) : 0,
            batchNumber: '',
            expirationDate: '',
            itemType: 'product',
            unit: item.unit || 'NIU',
            taxAffectation: existingProduct?.taxAffectation || '10',
            salePrice: existingProduct?.price || '',
            salePrice2: existingProduct?.price2 || '',
            salePrice3: existingProduct?.price3 || '',
            salePrice4: existingProduct?.price4 || '',
          }
        })
        setPurchaseItems(newItems)

        // Pre-llenar búsquedas de productos
        const searches = {}
        newItems.forEach((item, index) => {
          searches[index] = item.productName
        })
        setProductSearches(searches)
      }

      // Notas de la orden
      if (fromPurchaseOrder.notes) {
        setNotes(`Desde OC ${fromPurchaseOrder.number}: ${fromPurchaseOrder.notes}`)
      } else if (fromPurchaseOrder.number) {
        setNotes(`Desde Orden de Compra: ${fromPurchaseOrder.number}`)
      }

      // Pre-llenar moneda y TC de la OC (si vino). El usuario puede
      // editar el TC antes de guardar la compra real (al recibir mercadería
      // el TC del día puede ser otro).
      if (multiCurrencyOn && fromPurchaseOrder.currency) {
        const orderCcy = normalizeCurrency(fromPurchaseOrder.currency)
        setCurrency(orderCcy)
        if (orderCcy === 'USD') {
          const r = Number(fromPurchaseOrder.exchangeRate)
          if (Number.isFinite(r) && r > 0) {
            setExchangeRate(r)
            setExchangeRateSource('manual')
          }
        }
      }

      toast.info(`Datos pre-llenados desde OC ${fromPurchaseOrder.number}`)
    }
  }, [fromPurchaseOrder, suppliers, products, isEditMode])

  const loadData = async () => {
    const businessId = getBusinessId()
    if (!businessId) return

    setIsLoading(true)
    try {
      const [suppliersResult, productsResult, categoriesResult, warehousesResult, ingredientsResult, branchesResult, brandsResult] = await Promise.all([
        getSuppliers(businessId),
        getProducts(businessId),
        getProductCategories(businessId),
        getWarehouses(businessId),
        getIngredients(businessId),
        getActiveBranches(businessId),
        getProductBrands(businessId),
      ])

      if (suppliersResult.success) {
        setSuppliers(suppliersResult.data || [])
      }

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }

      if (categoriesResult.success) {
        setCategories(categoriesResult.data || [])
      }

      if (brandsResult?.success) {
        setBrands(brandsResult.data || [])
      }

      let activeWarehouses = []
      if (warehousesResult.success) {
        // Solo almacenes activos
        activeWarehouses = (warehousesResult.data || []).filter(w => w.isActive !== false)
        setWarehouses(activeWarehouses)

        // Solo seleccionar almacén por defecto si NO estamos en modo edición
        if (!isEditMode) {
          const mainBranchWarehouses = activeWarehouses.filter(w => !w.branchId)
          const defaultWarehouse = mainBranchWarehouses.find(w => w.isDefault) || mainBranchWarehouses[0] || activeWarehouses[0] || null
          setSelectedWarehouse(defaultWarehouse)
        }
      }

      if (ingredientsResult.success) {
        setIngredients(ingredientsResult.data || [])
      }

      if (branchesResult.success) {
        setBranches(branchesResult.data || [])
      }

      // Load laboratories for pharmacy mode
      if (businessMode === 'pharmacy') {
        try {
          const labsRef = collection(db, 'businesses', businessId, 'laboratories')
          const snapshot = await getDocs(labsRef)
          const labsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          setLaboratories(labsData)
        } catch (error) {
          console.error('Error al cargar laboratorios:', error)
        }
      }

      // Si estamos en modo edición, cargar los datos de la compra
      if (isEditMode && purchaseId) {
        const purchaseResult = await getPurchase(businessId, purchaseId)
        if (purchaseResult.success && purchaseResult.data) {
          const purchase = purchaseResult.data
          setOriginalPurchase(purchase) // Guardar para revertir stock

          // Cargar datos del proveedor
          if (purchase.supplier) {
            setSelectedSupplier(purchase.supplier)
            setSupplierSearch(purchase.supplier.businessName || '')
          }

          // Cargar datos básicos
          setInvoiceNumber(purchase.invoiceNumber || '')
          setInvoiceDocType(purchase.invoiceDocType || 'factura')
          if (purchase.invoiceDate) {
            const invoiceDateObj = purchase.invoiceDate.toDate ? purchase.invoiceDate.toDate() : new Date(purchase.invoiceDate)
            setInvoiceDate(getLocalDateString(invoiceDateObj))
          }
          setNotes(purchase.notes || '')

          // Moneda y TC CONGELADO de la compra original. Si la compra es
          // antigua y no tiene currency, queda como PEN/1 (compatible).
          const purchaseCurrency = normalizeCurrency(purchase.currency)
          setCurrency(purchaseCurrency)
          const rate = Number(purchase.exchangeRate)
          setExchangeRate(Number.isFinite(rate) && rate > 0 ? rate : 1)
          setExchangeRateSource(purchase.exchangeRate ? 'manual' : null)

          // Cargar tipo de pago
          setPaymentType(purchase.paymentType || 'contado')
          if (purchase.paymentType === 'credito') {
            setCreditType(purchase.creditType || 'unico')
            if (purchase.dueDate) {
              const dueDateObj = purchase.dueDate.toDate ? purchase.dueDate.toDate() : new Date(purchase.dueDate)
              setDueDate(getLocalDateString(dueDateObj))
            }
            if (purchase.installments) {
              setInstallments(purchase.installments.map(inst => ({
                ...inst,
                dueDate: inst.dueDate?.toDate ? getLocalDateString(inst.dueDate.toDate()) : inst.dueDate
              })))
              setNumInstallments(purchase.installments.length)
              if (purchase.installments[0]?.dueDate) {
                const firstDate = purchase.installments[0].dueDate.toDate
                  ? purchase.installments[0].dueDate.toDate()
                  : new Date(purchase.installments[0].dueDate)
                setFirstDueDate(getLocalDateString(firstDate))
              }
            }
          }

          // Cargar almacén
          if (purchase.warehouseId && activeWarehouses.length > 0) {
            const warehouse = activeWarehouses.find(w => w.id === purchase.warehouseId)
            if (warehouse) {
              setSelectedWarehouse(warehouse)
            }
          }

          // Cargar items
          if (purchase.items && purchase.items.length > 0) {
            const loadedItems = purchase.items.map(item => {
              // Buscar producto actual para obtener precios de venta
              const prod = products.find(p => p.id === item.productId)
              const isExemptItem = item.taxAffectation === '20' || item.taxAffectation === '30'
              // Si es variante, buscar la variante específica
              const variant = item.variantSku && prod?.variants?.find(v => v.sku === item.variantSku)
              return {
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                cost: item.unitPrice,
                costWithoutIGV: item.unitPrice > 0 ? (isExemptItem ? item.unitPrice : item.unitPrice / 1.18) : 0,
                batchNumber: item.batchNumber || '',
                expirationDate: item.expirationDate
                  ? (item.expirationDate.toDate ? getLocalDateString(item.expirationDate.toDate()) : getLocalDateString(new Date(item.expirationDate)))
                  : '',
                itemType: item.itemType || 'product',
                unit: item.unit || 'NIU',
                taxAffectation: item.taxAffectation || '10',
                variantSku: item.variantSku || null,
                isVariant: !!item.variantSku,
                hasVariants: !!item.variantSku,
                salePrice: variant ? (variant.price || '') : (prod?.price || ''),
                salePrice2: variant ? (variant.price2 || '') : (prod?.price2 || ''),
                salePrice3: variant ? (variant.price3 || '') : (prod?.price3 || ''),
                salePrice4: variant ? (variant.price4 || '') : (prod?.price4 || ''),
              }
            })
            setPurchaseItems(loadedItems)

            // También cargar las búsquedas de productos
            const searches = {}
            loadedItems.forEach((item, idx) => {
              searches[idx] = item.productName
            })
            setProductSearches(searches)
          }
        } else {
          toast.error('No se pudo cargar la compra')
          appNavigate('compras')
        }
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      setMessage({
        type: 'error',
        text: 'Error al cargar los datos. Por favor, recarga la página.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const addItem = () => {
    setPurchaseItems([
      ...purchaseItems,
      { productId: '', productName: '', quantity: '', unitPrice: 0, cost: 0, costWithoutIGV: 0, batchNumber: '', expirationDate: '', itemType: 'product', unit: 'NIU', salePrice: '', salePrice2: '', salePrice3: '', salePrice4: '', trackSerials: false, serialNumbers: [] },
    ])
  }

  const removeItem = index => {
    if (purchaseItems.length > 1) {
      setPurchaseItems(purchaseItems.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index, field, value) => {
    const newItems = [...purchaseItems]
    newItems[index][field] = value
    // Ajustar array de seriales cuando cambia la cantidad
    if (field === 'quantity' && newItems[index].trackSerials) {
      const qty = parseInt(value) || 0
      const current = newItems[index].serialNumbers || []
      if (qty > current.length) {
        newItems[index].serialNumbers = [...current, ...Array(qty - current.length).fill('')]
      } else {
        newItems[index].serialNumbers = current.slice(0, qty)
      }
    }
    setPurchaseItems(newItems)
  }

  const updateSerialNumber = (itemIndex, serialIndex, value) => {
    const newItems = [...purchaseItems]
    const serials = [...(newItems[itemIndex].serialNumbers || [])]
    serials[serialIndex] = value
    newItems[itemIndex].serialNumbers = serials
    setPurchaseItems(newItems)
  }

  // Actualizar costo con IGV y calcular sin IGV
  const updateCostWithIGV = (index, value) => {
    const newItems = [...purchaseItems]
    const costWithIGV = parseFloat(value) || 0
    const isExempt = newItems[index].taxAffectation === '20' || newItems[index].taxAffectation === '30'
    newItems[index].cost = costWithIGV
    newItems[index].costWithoutIGV = costWithIGV > 0 ? (isExempt ? costWithIGV : costWithIGV / 1.18) : 0
    setPurchaseItems(newItems)
  }

  // Actualizar costo sin IGV y calcular con IGV
  const updateCostWithoutIGV = (index, value) => {
    const newItems = [...purchaseItems]
    const costWithoutIGV = parseFloat(value) || 0
    const isExempt = newItems[index].taxAffectation === '20' || newItems[index].taxAffectation === '30'
    newItems[index].costWithoutIGV = costWithoutIGV
    newItems[index].cost = costWithoutIGV > 0 ? (isExempt ? costWithoutIGV : costWithoutIGV * 1.18) : 0
    setPurchaseItems(newItems)
  }

  // Filtrar proveedores según búsqueda (flexible: multi-palabra parcial, sin acentos)
  const filteredSuppliers = suppliers.filter(supplier =>
    matchesSearchQuery(
      supplierSearch,
      supplier.businessName,
      supplier.documentNumber,
      supplier.contactName,
    )
  )

  // Seleccionar proveedor
  const selectSupplier = supplier => {
    setSelectedSupplier(supplier)
    setSupplierSearch(supplier.businessName)
    setShowSupplierDropdown(false)
  }

  // Limpiar selección de proveedor
  const clearSupplier = () => {
    setSelectedSupplier(null)
    setSupplierSearch('')
    setShowSupplierDropdown(false)
  }

  // Filtrar productos e ingredientes según búsqueda y modo (flexible + sin acentos)
  const getFilteredItems = (index) => {
    const search = productSearches[index] || ''

    let items = []

    // Agregar productos si el modo lo permite
    if (itemMode === 'products' || itemMode === 'all') {
      const filteredProducts = products.filter(product =>
        matchesSearchQuery(search, product.name, product.code, product.sku, product.category, product.marca)
      ).map(p => ({ ...p, itemType: 'product' }))
      items = [...items, ...filteredProducts]
    }

    // Agregar ingredientes si el modo lo permite
    if (itemMode === 'ingredients' || itemMode === 'all') {
      const filteredIngredients = ingredients.filter(ing =>
        matchesSearchQuery(search, ing.name)
      ).map(i => ({ ...i, itemType: 'ingredient' }))
      items = [...items, ...filteredIngredients]
    }

    return items
  }

  // Mantener compatibilidad con nombre anterior
  const getFilteredProducts = getFilteredItems

  // Seleccionar producto o ingrediente
  const selectProduct = (index, item) => {
    // Si el producto tiene variantes, expandir en múltiples filas (una por variante)
    if (item.hasVariants && item.variants?.length > 0) {
      const newItems = [...purchaseItems]
      // Reemplazar la fila actual con las variantes
      const isExemptVar = item.taxAffectation === '20' || item.taxAffectation === '30'
      const variantRows = item.variants.map(v => {
        const variantLabel = Object.values(v.attributes || {}).join(' / ')
        const costValue = item.cost && item.cost > 0 ? item.cost : 0
        return {
          productId: item.id,
          productName: `${item.name} — ${variantLabel}`,
          variantSku: v.sku,
          variantLabel,
          quantity: '',
          unitPrice: 0,
          cost: costValue,
          costWithoutIGV: costValue > 0 ? (isExemptVar ? costValue : costValue / 1.18) : 0,
          batchNumber: '',
          expirationDate: '',
          itemType: 'product',
          unit: item.unit || 'NIU',
          isVariant: true,
          taxAffectation: item.taxAffectation || '10',
          salePrice: v.price || '',
          salePrice2: v.price2 || '',
          salePrice3: v.price3 || '',
          salePrice4: v.price4 || '',
          hasVariants: true,
          trackSerials: item.trackSerials || false,
          serialNumbers: [],
        }
      })

      newItems.splice(index, 1, ...variantRows)
      setPurchaseItems(newItems)

      // Actualizar búsquedas para cada fila nueva
      const newSearches = { ...productSearches }
      const newDropdowns = { ...showProductDropdowns }
      variantRows.forEach((_, i) => {
        newSearches[index + i] = variantRows[i].productName
        newDropdowns[index + i] = false
      })
      setProductSearches(newSearches)
      setShowProductDropdowns(newDropdowns)
      return
    }

    const newItems = [...purchaseItems]
    newItems[index].productId = item.id
    newItems[index].productName = item.name
    newItems[index].itemType = item.itemType || 'product'
    newItems[index].taxAffectation = item.taxAffectation || '10'
    newItems[index].trackSerials = item.trackSerials || false
    newItems[index].serialNumbers = []

    const isExempt = item.taxAffectation === '20' || item.taxAffectation === '30'

    if (item.itemType === 'ingredient') {
      // Para ingredientes
      newItems[index].unit = item.purchaseUnit || 'NIU'
      // Usar último precio de compra o costo promedio
      const costValue = item.lastPurchasePrice || item.averageCost || 0
      if (costValue > 0) {
        newItems[index].cost = costValue
        newItems[index].costWithoutIGV = isExempt ? costValue : costValue / 1.18
      }
    } else {
      // Para productos
      newItems[index].unit = item.unit || 'NIU'
      // Hidratar el costo con el costo actual del producto (si existe)
      if (item.cost && item.cost > 0) {
        const costValue = item.cost
        newItems[index].cost = costValue
        newItems[index].costWithoutIGV = isExempt ? costValue : costValue / 1.18
      }
      // Hidratar precios de venta
      newItems[index].salePrice = item.price || ''
      newItems[index].salePrice2 = item.price2 || ''
      newItems[index].salePrice3 = item.price3 || ''
      newItems[index].salePrice4 = item.price4 || ''
      // Farmacia: hidratar registro sanitario para que el usuario lo verifique
      // y lo pueda actualizar si cambió. Guardamos el original para detectar cambios al guardar.
      if (businessMode === 'pharmacy') {
        newItems[index].sanitaryRegistry = item.sanitaryRegistry || ''
        newItems[index].originalSanitaryRegistry = item.sanitaryRegistry || ''
      }
    }

    setPurchaseItems(newItems)

    const newSearches = { ...productSearches }
    newSearches[index] = item.name
    setProductSearches(newSearches)

    const newDropdowns = { ...showProductDropdowns }
    newDropdowns[index] = false
    setShowProductDropdowns(newDropdowns)
  }

  // Actualizar búsqueda de producto
  const updateProductSearch = (index, value) => {
    const newSearches = { ...productSearches }
    newSearches[index] = value
    setProductSearches(newSearches)

    const newDropdowns = { ...showProductDropdowns }
    newDropdowns[index] = true
    setShowProductDropdowns(newDropdowns)

    // Si borra la búsqueda, limpiar el producto seleccionado
    if (!value) {
      const newItems = [...purchaseItems]
      newItems[index].productId = ''
      newItems[index].productName = ''
      setPurchaseItems(newItems)
    }
  }

  // Click fuera para cerrar dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      // No cerrar si el evento viene del teclado virtual o de un input activo
      const activeElement = document.activeElement
      if (event.target.tagName === 'INPUT' || activeElement?.tagName === 'INPUT') {
        // Verificar si el input activo está dentro de algún contenedor de producto
        const isActiveInProductContainer = Object.keys(productInputRefs.current).some(key => {
          const ref = productInputRefs.current[key]
          return ref && ref.contains(activeElement)
        })
        if (isActiveInProductContainer) return
      }

      if (supplierInputRef.current && !supplierInputRef.current.contains(event.target)) {
        setShowSupplierDropdown(false)
      }

      // Verificar si el click fue dentro de algún dropdown de productos
      const clickedInsideAnyProductDropdown = Object.keys(productInputRefs.current).some(key => {
        const ref = productInputRefs.current[key]
        return ref && ref.contains(event.target)
      })

      // Si el click fue fuera de todos los dropdowns, cerrar todos
      if (!clickedInsideAnyProductDropdown) {
        setShowProductDropdowns({})
      }
    }

    // Agregar ambos eventos para desktop y móvil
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  // Calcular subtotal de un item usando costo con IGV directamente para evitar errores de redondeo
  const calculateItemSubtotal = (item) => {
    const quantity = parseFloat(item.quantity) || 0
    const costWithIGV = parseFloat(item.cost) || 0
    // Calcular: cantidad × costo con IGV, redondeado a 2 decimales
    return Math.round(quantity * costWithIGV * 100) / 100
  }

  const calculateAmounts = () => {
    let subtotal = 0
    let igv = 0
    let total = 0

    purchaseItems.forEach(item => {
      const itemTotal = calculateItemSubtotal(item)
      const isExempt = item.taxAffectation === '20' || item.taxAffectation === '30'

      if (isExempt) {
        // Exonerado o inafecto: no tiene IGV
        subtotal += itemTotal
      } else {
        // Gravado: el costo incluye IGV
        const itemSubtotal = itemTotal / 1.18
        subtotal += itemSubtotal
        igv += itemTotal - itemSubtotal
      }
      total += itemTotal
    })

    // Equivalentes en moneda base (PEN). Si la compra es PEN, son iguales.
    // Si es USD, se convierten con el TC congelado al momento de guardar
    // (usado en reportes globales y para el costo del producto).
    const subtotalInBase = convertToBase(subtotal, currency, exchangeRate)
    const igvInBase = convertToBase(igv, currency, exchangeRate)
    const totalInBase = convertToBase(total, currency, exchangeRate)

    return {
      subtotal,
      igv,
      total,
      subtotalInBase,
      igvInBase,
      totalInBase,
    }
  }

  // NOTA: El sistema de cuotas fijas ha sido reemplazado por pagos parciales flexibles
  // Las funciones de generación de cuotas fueron removidas

  const openCreateProductModal = (itemIndex) => {
    setCurrentItemIndex(itemIndex)
    // Pre-llenar el nombre del producto con lo que el usuario estaba buscando
    const searchTerm = productSearches[itemIndex] || ''
    setNewProductName(searchTerm)
    setShowCreateProductModal(true)
  }

  const handleCreateProduct = async (data) => {
    // Prevenir múltiples clicks
    if (isCreatingProduct) return
    setIsCreatingProduct(true)

    const businessId = getBusinessId()
    if (!businessId) {
      toast.error('Error: No se pudo identificar el negocio')
      setIsCreatingProduct(false)
      return
    }

    try {
      // Marca: para CUALQUIER modo, guardamos brandId (preferido) y marca texto.
      // Si el usuario eligió una marca administrada, derivamos el texto del nombre
      // de la marca para back-compat con reportes viejos. Si escribió texto libre
      // sin elegir marca administrada, guardamos el texto y brandId queda null.
      const selectedBrand = data.brandId ? brands.find(b => b.id === data.brandId) : null
      const marcaText = selectedBrand ? selectedBrand.name : (data.marca || null)

      const productData = {
        code: data.code || '',
        sku: data.sku || '',
        name: data.name,
        price: parseFloat(data.price) || 0,
        price2: data.price2 ? parseFloat(data.price2) : null,
        price3: data.price3 ? parseFloat(data.price3) : null,
        price4: data.price4 ? parseFloat(data.price4) : null,
        cost: data.cost ? parseFloat(data.cost) : 0,
        unit: data.unit || 'NIU',
        category: data.category || '',
        description: data.description || '',
        stock: data.noStock ? null : 0, // Stock actual en 0, se actualizará al guardar la compra
        initialStock: data.noStock ? null : 0, // Productos creados desde compras inician con stock inicial 0
        noStock: data.noStock || false,
        taxAffectation: data.taxAffectation || '10',
        allowDecimalQuantity: data.allowDecimalQuantity || false,
        trackExpiration: data.trackExpiration || false,
        catalogVisible: data.catalogVisible || false,
        presentations: data.presentations || [],
        imageUrl: data.imageUrl || null,
        imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : (data.imageUrl ? [data.imageUrl] : []),
        brandId: data.brandId || null,
        marca: marcaText,
      }

      // Include pharmacy fields if present (la marca ya está arriba, no se duplica)
      if (businessMode === 'pharmacy') {
        productData.genericName = data.genericName || null
        productData.concentration = data.concentration || null
        productData.presentation = data.presentation || null
        productData.laboratoryId = data.laboratoryId || null
        productData.laboratoryName = data.laboratoryName || null
        productData.batchNumber = data.batchNumber || null
        productData.activeIngredient = data.activeIngredient || null
        productData.therapeuticAction = data.therapeuticAction || null
        productData.saleCondition = data.saleCondition || 'sin_receta'
        productData.requiresPrescription = data.saleCondition !== 'sin_receta'
        productData.sanitaryRegistry = data.sanitaryRegistry || null
        productData.location = data.location || null
      }

      const result = await createProduct(businessId, productData)
      if (result.success) {
        toast.success('Producto creado exitosamente')

        // Recargar la lista de productos
        const productsResult = await getProducts(businessId)
        if (productsResult.success) {
          setProducts(productsResult.data || [])
        }

        // Seleccionar automáticamente el producto recién creado en el item actual
        if (currentItemIndex !== null) {
          const createdProduct = { id: result.id, ...productData }
          const costValue = productData.cost || 0

          // Actualizar todo en un solo setPurchaseItems para evitar race condition
          const newItems = [...purchaseItems]
          newItems[currentItemIndex].productId = createdProduct.id
          newItems[currentItemIndex].productName = createdProduct.name
          newItems[currentItemIndex].itemType = 'product'
          newItems[currentItemIndex].unit = createdProduct.unit || 'NIU'
          newItems[currentItemIndex].quantity = data.stock ? parseFloat(data.stock) : 1
          newItems[currentItemIndex].cost = costValue
          newItems[currentItemIndex].unitPrice = productData.price || 0
          const isExemptNew = productData.taxAffectation === '20' || productData.taxAffectation === '30'
          newItems[currentItemIndex].costWithoutIGV = costValue > 0 ? (isExemptNew ? costValue : costValue / 1.18) : 0
          newItems[currentItemIndex].taxAffectation = productData.taxAffectation || '10'
          newItems[currentItemIndex].salePrice = productData.price || ''
          newItems[currentItemIndex].salePrice2 = productData.price2 || ''
          newItems[currentItemIndex].salePrice3 = productData.price3 || ''
          newItems[currentItemIndex].salePrice4 = productData.price4 || ''
          setPurchaseItems(newItems)

          // Actualizar búsqueda y cerrar dropdown
          setProductSearches(prev => ({ ...prev, [currentItemIndex]: createdProduct.name }))
          setShowProductDropdowns(prev => ({ ...prev, [currentItemIndex]: false }))
        }

        // Cerrar modal y resetear
        closeCreateProductModal()
      } else {
        toast.error(result.error || 'Error al crear el producto')
        setIsCreatingProduct(false)
      }
    } catch (error) {
      console.error('Error al crear producto:', error)
      toast.error('Error al crear el producto')
      setIsCreatingProduct(false)
    }
  }

  const closeCreateProductModal = () => {
    setShowCreateProductModal(false)
    setNewProductName('')
    setCurrentItemIndex(null)
    setIsCreatingProduct(false)
  }

  const openCreateIngredientModal = (itemIndex) => {
    setCurrentItemIndex(itemIndex)
    const searchTerm = productSearches[itemIndex] || ''
    setNewIngredientForm({ name: searchTerm, category: 'otros', purchaseUnit: 'kg' })
    setShowCreateIngredientModal(true)
    setShowCreateMenu({})
  }

  const handleCreateIngredient = async () => {
    if (isCreatingIngredient) return
    if (!newIngredientForm.name.trim()) {
      toast.error('El nombre del ingrediente es requerido')
      return
    }

    setIsCreatingIngredient(true)
    const businessId = getBusinessId()

    try {
      const ingredientData = {
        name: newIngredientForm.name.trim(),
        category: newIngredientForm.category,
        purchaseUnit: newIngredientForm.purchaseUnit,
        currentStock: 0,
        minimumStock: 0,
        averageCost: 0,
      }

      const result = await createIngredient(businessId, ingredientData)
      if (result.success) {
        toast.success('Ingrediente creado exitosamente')

        // Recargar ingredientes
        const ingResult = await getIngredients(businessId)
        if (ingResult.success) {
          setIngredients(ingResult.data || [])
        }

        // Seleccionar el ingrediente recién creado
        if (currentItemIndex !== null) {
          const createdIngredient = {
            id: result.id,
            ...ingredientData,
            itemType: 'ingredient',
          }
          selectProduct(currentItemIndex, createdIngredient)
        }

        setShowCreateIngredientModal(false)
        setNewIngredientForm({ name: '', category: 'otros', purchaseUnit: 'kg' })
        setCurrentItemIndex(null)
      } else {
        toast.error(result.error || 'Error al crear ingrediente')
      }
    } catch (error) {
      console.error('Error al crear ingrediente:', error)
      toast.error('Error al crear el ingrediente')
    } finally {
      setIsCreatingIngredient(false)
    }
  }

  const validateForm = (itemsToValidate = null) => {
    // Usar items proporcionados o los del estado
    const items = itemsToValidate || purchaseItems

    // NOTA: La fecha de vencimiento es opcional para créditos
    // Los pagos parciales se pueden registrar en cualquier momento

    if (items.length === 0) {
      setMessage({
        type: 'error',
        text: 'Debe agregar al menos un producto',
      })
      return false
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      // Filas de variante sin cantidad: ignorar (no se compró de esa variante)
      if (item.isVariant && (!item.quantity || Number(item.quantity) <= 0)) {
        continue
      }

      // Validar campos obligatorios (cost puede ser 0 para bonificaciones)
      if (!item.productId || !item.productName) {
        setMessage({
          type: 'error',
          text: `Complete todos los campos del producto ${i + 1}`,
        })
        return false
      }

      // Validar cantidad - debe ser un número mayor a 0
      const qty = Number(item.quantity)
      if (isNaN(qty) || qty <= 0) {
        setMessage({
          type: 'error',
          text: `La cantidad del producto ${i + 1} debe ser mayor a 0`,
        })
        return false
      }

      // Permitir costo 0 para bonificaciones, solo validar que no sea negativo
      const cost = Number(item.cost) || 0
      if (cost < 0) {
        setMessage({
          type: 'error',
          text: `El costo unitario del producto ${i + 1} no puede ser negativo`,
        })
        return false
      }

      // Validar lote y vencimiento: deben ir juntos (ambos llenos o ambos vacíos)
      const hasBatch = (item.batchNumber || '').trim() !== ''
      const hasExpiry = (item.expirationDate || '').trim() !== ''
      if (hasExpiry && !hasBatch) {
        setMessage({
          type: 'error',
          text: `El producto "${item.productName}" tiene fecha de vencimiento pero falta el número de lote`,
        })
        return false
      }
      if (hasBatch && !hasExpiry) {
        setMessage({
          type: 'error',
          text: `El producto "${item.productName}" tiene número de lote pero falta la fecha de vencimiento`,
        })
        return false
      }

      // Validar números de serie completos
      if (item.trackSerials && item.serialNumbers?.length > 0) {
        const emptySerials = item.serialNumbers.filter(sn => !sn.trim())
        if (emptySerials.length > 0) {
          setMessage({
            type: 'error',
            text: `Complete todos los números de serie del producto "${item.productName}" (${emptySerials.length} pendientes)`,
          })
          return false
        }
        // Validar duplicados
        const uniqueSerials = new Set(item.serialNumbers.map(sn => sn.trim().toUpperCase()))
        if (uniqueSerials.size !== item.serialNumbers.length) {
          setMessage({
            type: 'error',
            text: `Hay números de serie duplicados en el producto "${item.productName}"`,
          })
          return false
        }
      }
    }

    return true
  }

  const handleSave = async () => {
    const businessId = getBusinessId()
    if (!businessId) {
      setMessage({
        type: 'error',
        text: 'Error: No se pudo identificar el negocio',
      })
      return
    }

    // Normalizar items: asegurar que quantity y cost sean números válidos
    const normalizedItems = purchaseItems.map(item => ({
      ...item,
      quantity: Number(item.quantity) || 1, // Default a 1 si está vacío o inválido
      cost: Number(item.cost) || 0,
      costWithoutIGV: item.costWithoutIGV || (Number(item.cost) > 0 ? Number(item.cost) / 1.18 : 0)
    }))
    setPurchaseItems(normalizedItems)

    // Validar usando los items normalizados (no el estado que puede estar desactualizado)
    if (!validateForm(normalizedItems)) return

    setIsSaving(true)
    setMessage(null)

    try {
      const amounts = calculateAmounts()

      // 1. Crear datos de la compra
      const purchaseData = {
        supplier: selectedSupplier ? {
          id: selectedSupplier.id,
          documentType: selectedSupplier.documentType || '',
          documentNumber: selectedSupplier.documentNumber || '',
          businessName: selectedSupplier.businessName,
          contactName: selectedSupplier.contactName || '',
          email: selectedSupplier.email || '',
          phone: selectedSupplier.phone || '',
          address: selectedSupplier.address || '',
        } : null,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDocType: invoiceDocType || 'factura',
        invoiceDate: parseLocalDate(invoiceDate), // Usar parseLocalDate para evitar problema de timezone
        // Almacén donde ingresa la mercadería
        warehouseId: selectedWarehouse?.id || null,
        warehouseName: selectedWarehouse?.name || null,
        items: purchaseItems
          .filter(item => !item.isVariant || (item.quantity && Number(item.quantity) > 0))
          .map(item => ({
            productId: item.productId,
            productName: item.productName,
            itemType: item.itemType || 'product',
            unit: item.unit || 'NIU',
            quantity: parseFloat(item.quantity) || 0,
            unitPrice: parseFloat(item.cost) || 0,
            taxAffectation: item.taxAffectation || '10',
            ...(item.variantSku && { variantSku: item.variantSku }),
            ...(item.batchNumber && { batchNumber: item.batchNumber }),
            ...(item.expirationDate && { expirationDate: parseLocalDate(item.expirationDate) }),
          })),
        subtotal: amounts.subtotal,
        igv: amounts.igv,
        total: amounts.total,
        // Moneda y TC CONGELADO. Si currency='PEN', exchangeRate=1 y los
        // *InBase son iguales a los nativos. NUNCA se recalculan a posteriori
        // (los reportes históricos deben quedar fijos aunque suba el dólar).
        currency: normalizeCurrency(currency),
        exchangeRate: currency === 'USD' ? (Number(exchangeRate) || 1) : 1,
        subtotalInBase: amounts.subtotalInBase,
        igvInBase: amounts.igvInBase,
        totalInBase: amounts.totalInBase,
        notes: notes.trim(),
        // Tipo de pago y estado
        paymentType: paymentType, // 'contado' o 'credito'
        paymentStatus: paymentType === 'contado' ? 'paid' : 'pending', // 'paid' o 'pending'
        paidAmount: paymentType === 'contado' ? amounts.total : 0, // Monto pagado
        // Campos para crédito - Sistema de pagos parciales (abonos)
        ...(paymentType === 'credito' && {
          ...(dueDate && { dueDate: parseLocalDate(dueDate) }), // Fecha de vencimiento opcional
          payments: [], // Array de abonos parciales - se agregan desde Purchases.jsx
        }),
      }

      // Separar items por tipo
      // Filtrar filas de variantes sin cantidad (no se compró de esa variante)
      const activeItems = purchaseItems.filter(item => !item.isVariant || (item.quantity && Number(item.quantity) > 0))
      const productItems = activeItems.filter(item => item.itemType !== 'ingredient')
      const ingredientItems = activeItems.filter(item => item.itemType === 'ingredient')

      let resultId = purchaseId // Para modo edición

      // En modo edición, calcular DIFERENCIAS entre cantidades originales y nuevas
      // Solo ajustar stock por la diferencia, NO revertir todo (para no afectar ventas ya realizadas)
      const stockDifferences = {} // { productId: diferencia } - positivo = aumentar, negativo = reducir
      let warehouseChangedInEdit = false // Indica si cambió el almacén en edición

      if (isEditMode && originalPurchase && originalPurchase.items) {
        const originalProductItems = originalPurchase.items.filter(item => item.itemType !== 'ingredient')
        const originalWarehouseId = originalPurchase.warehouseId || ''
        const newWarehouseId = selectedWarehouse?.id || ''
        warehouseChangedInEdit = originalWarehouseId !== newWarehouseId

        // Helper para agrupar por producto + variante (preserva trazabilidad de variantes)
        const makeKey = (productId, variantSku) => `${productId}|${variantSku || ''}`
        const parseKey = key => {
          const [productId, variantSku] = key.split('|')
          return { productId, variantSku: variantSku || null }
        }

        // Agrupar cantidades originales por producto + variante
        const originalQuantities = {}
        originalProductItems.forEach(item => {
          const key = makeKey(item.productId, item.variantSku)
          originalQuantities[key] = (originalQuantities[key] || 0) + (parseFloat(item.quantity) || 0)
        })

        // Agrupar cantidades nuevas por producto + variante
        const newQuantities = {}
        productItems.forEach(item => {
          const key = makeKey(item.productId, item.variantSku)
          newQuantities[key] = (newQuantities[key] || 0) + (parseFloat(item.quantity) || 0)
        })

        // Calcular diferencias (productos+variante que estaban en original)
        for (const key in originalQuantities) {
          const originalQty = originalQuantities[key]
          const newQty = newQuantities[key] || 0
          stockDifferences[key] = newQty - originalQty
        }

        // Agregar productos+variante nuevos que no estaban en la compra original
        for (const key in newQuantities) {
          if (!(key in stockDifferences)) {
            stockDifferences[key] = newQuantities[key]
          }
        }

        // Aplicar ajustes de stock solo donde hay diferencia o cambio de almacén
        for (const key in stockDifferences) {
          const { productId, variantSku } = parseKey(key)
          const difference = stockDifferences[key]
          const product = products.find(p => p.id === productId)

          if (!product || product.trackStock === false) continue

          // Si cambió el almacén, necesitamos mover el stock
          if (warehouseChangedInEdit && originalQuantities[key]) {
            const originalQty = originalQuantities[key]

            // Restar del almacén original (transacción atómica)
            await updateProductStockTransaction(businessId, productId, originalWarehouseId, -originalQty, {}, variantSku)

            // Registrar movimiento de salida del almacén original
            await createStockMovement(businessId, {
              productId: productId,
              warehouseId: originalWarehouseId,
              type: 'exit',
              quantity: -originalQty,
              reason: 'Edición de compra (cambio de almacén)',
              referenceType: 'purchase_edit',
              referenceId: purchaseId,
              userId: user?.uid,
              ...(variantSku && { variantSku }),
              notes: `Transferido a otro almacén por edición de compra`
            }).catch(err => console.error('Error movimiento salida:', err))

            // La entrada al nuevo almacén se manejará en la sección de actualización de stock
            // con la cantidad nueva completa
            stockDifferences[key] = newQuantities[key] || 0
          } else if (difference !== 0) {
            // Solo ajustar si hay diferencia (no cambió almacén)
            // Actualizar stock usando transacción atómica
            await updateProductStockTransaction(
              businessId,
              productId,
              originalWarehouseId,
              difference, // Positivo = aumentar, Negativo = reducir
              {},
              variantSku
            )

            // Registrar movimiento de ajuste
            await createStockMovement(businessId, {
              productId: productId,
              warehouseId: originalWarehouseId,
              type: difference > 0 ? 'entry' : 'exit',
              quantity: difference, // Positivo para entrada, negativo para salida
              reason: difference > 0 ? 'Edición de compra (aumento)' : 'Edición de compra (reducción)',
              referenceType: 'purchase_edit',
              referenceId: purchaseId,
              userId: user?.uid,
              ...(variantSku && { variantSku }),
              notes: `Ajuste de ${difference > 0 ? '+' : ''}${difference} unidades por edición`
            }).catch(err => console.error('Error movimiento ajuste:', err))
          }
          // Si difference === 0, no hacer nada con el stock
        }
      }

      // 2. Guardar o actualizar la compra
      let result
      if (isEditMode) {
        // Detectar si cambió el tipo de pago
        const originalPaymentType = originalPurchase?.paymentType || 'contado'
        const paymentTypeChanged = originalPaymentType !== paymentType

        if (paymentTypeChanged) {
          // Si cambió el tipo de pago, actualizar el estado según el nuevo tipo
          if (paymentType === 'contado') {
            // Cambió de crédito a contado → marcar como pagado
            purchaseData.paymentStatus = 'paid'
            purchaseData.paidAmount = amounts.total
            purchaseData.payments = [] // Limpiar pagos parciales
          } else {
            // Cambió de contado a crédito → marcar como pendiente
            purchaseData.paymentStatus = 'pending'
            purchaseData.paidAmount = 0
            purchaseData.payments = []
          }
        } else {
          // No cambió el tipo de pago, preservar estado existente
          if (originalPurchase?.paymentStatus === 'paid' && paymentType === 'contado') {
            purchaseData.paymentStatus = 'paid'
            purchaseData.paidAmount = amounts.total
          }
          // Preservar pagos parciales existentes si es crédito
          if (paymentType === 'credito' && originalPurchase?.payments && originalPurchase.payments.length > 0) {
            purchaseData.payments = originalPurchase.payments
            purchaseData.paidAmount = originalPurchase.paidAmount || 0
            // Verificar si ya está pagado completamente
            if (purchaseData.paidAmount >= amounts.total) {
              purchaseData.paymentStatus = 'paid'
            }
          }
        }

        // Compatibilidad con compras antiguas con cuotas
        if (originalPurchase?.installments && originalPurchase.installments.length > 0) {
          purchaseData.installments = originalPurchase.installments
          purchaseData.creditType = originalPurchase.creditType
          purchaseData.totalInstallments = originalPurchase.totalInstallments
          purchaseData.paidInstallments = originalPurchase.paidInstallments
        }
        result = await updatePurchase(businessId, purchaseId, cleanUndefined(purchaseData))
        if (!result.success) {
          throw new Error(result.error || 'Error al actualizar la compra')
        }
        resultId = purchaseId
      } else {
        result = await createPurchase(businessId, cleanUndefined(purchaseData))
        if (!result.success) {
          throw new Error(result.error || 'Error al crear la compra')
        }
        resultId = result.id
      }

      // 3. Actualizar stock y costo promedio de PRODUCTOS
      // IMPORTANTE: Agrupar items por productId para manejar múltiples líneas del mismo producto
      // (ej: 2 unidades @ S/3 + 1 unidad gratis @ S/0 = 3 unidades con costo promedio correcto)
      const groupedProducts = {}
      productItems.forEach(item => {
        // Para variantes, agrupar por productId + variantSku
        const groupKey = item.variantSku ? `${item.productId}__${item.variantSku}` : item.productId
        if (!groupedProducts[groupKey]) {
          groupedProducts[groupKey] = {
            productId: item.productId,
            variantSku: item.variantSku || null,
            totalQuantity: 0,
            totalCost: 0, // Suma de (cantidad * costo) para calcular promedio ponderado
            items: [] // Guardar items originales para lotes
          }
        }
        const qty = parseFloat(item.quantity) || 0
        const cost = parseFloat(item.cost) || 0
        // CRÍTICO multi-divisa: el costo del PRODUCTO se almacena siempre en
        // moneda base (PEN). Si la compra fue en USD, convertimos cada item
        // ANTES de acumular para que el promedio ponderado y los costos en
        // los batches queden en PEN. Reportes de margen, valuación de
        // inventario y precios de venta operan en PEN.
        const costInBase = convertToBase(cost, currency, exchangeRate)
        groupedProducts[groupKey].totalQuantity += qty
        groupedProducts[groupKey].totalCost += qty * costInBase
        groupedProducts[groupKey].items.push(item)
      })

      const productUpdates = Object.values(groupedProducts).map(async grouped => {
        const product = products.find(p => p.id === grouped.productId)
        if (product) {
          // Solo actualizar si el producto maneja stock (trackStock !== false)
          if (product.trackStock === false) return

          const newQuantity = grouped.totalQuantity
          // Costo promedio ponderado de todas las líneas del mismo producto (redondeado a 2 decimales)
          const newCost = newQuantity > 0 ? Math.round((grouped.totalCost / newQuantity) * 100) / 100 : 0

          // En modo edición:
          // - Si NO cambió el almacén: el stock ya fue ajustado por diferencia arriba, no sumar de nuevo
          // - Si SÍ cambió el almacén: sumar stock completo al nuevo almacén
          // En modo creación: sumar stock completo
          const shouldUpdateStock = !isEditMode || warehouseChangedInEdit

          // Calcular costo promedio ponderado con el stock existente
          const currentStock = product.stock || 0
          const currentCost = product.cost || 0
          // En modo edición sin cambio de almacén, el stock no cambia, usar stock actual
          const totalStock = shouldUpdateStock ? currentStock + newQuantity : currentStock

          let averageCost = newCost
          if (currentStock > 0 && currentCost > 0) {
            // Solo considerar el costo nuevo si es mayor a 0 (bonificaciones no afectan el costo)
            if (newCost > 0) {
              // En modo edición, recalcular costo promedio considerando la diferencia
              if (isEditMode && !warehouseChangedInEdit) {
                const diff = stockDifferences[grouped.productId] || 0
                if (diff > 0) {
                  // Solo si aumentó la cantidad, recalcular promedio
                  averageCost = ((currentStock * currentCost) + (diff * newCost)) / (currentStock + diff)
                } else {
                  // Si disminuyó o no cambió, mantener el costo actual
                  averageCost = currentCost
                }
              } else {
                averageCost = ((currentStock * currentCost) + (newQuantity * newCost)) / totalStock
              }
            } else {
              // Si todo es bonificación (costo 0), mantener el costo actual
              averageCost = currentCost
            }
          } else if (newCost === 0 && currentCost > 0) {
            // Si la nueva compra es gratis pero ya había costo, mantener el costo anterior
            averageCost = currentCost
          }

          // Redondear costo promedio a 2 decimales antes de guardar
          const roundedAverageCost = Math.round(averageCost * 100) / 100

          // Preparar datos extra (costo, proveedor, lotes)
          const extraUpdates = {
            cost: roundedAverageCost,
            ...(selectedSupplier && {
              lastSupplier: {
                id: selectedSupplier.id || '',
                documentNumber: selectedSupplier.documentNumber || '',
                businessName: selectedSupplier.businessName || ''
              }
            })
          }

          // Farmacia: si el usuario modificó el registro sanitario durante la compra,
          // propagar el nuevo valor al producto master. Tomamos la última modificación
          // (si hay varias líneas del mismo producto, generalmente comparten el registro).
          if (businessMode === 'pharmacy') {
            const modifiedItems = grouped.items.filter(it =>
              it.sanitaryRegistry !== undefined &&
              it.originalSanitaryRegistry !== undefined &&
              (it.sanitaryRegistry || '') !== (it.originalSanitaryRegistry || '')
            )
            if (modifiedItems.length > 0) {
              extraUpdates.sanitaryRegistry = modifiedItems[modifiedItems.length - 1].sanitaryRegistry || null
            }
          }

          // Sistema de múltiples lotes para farmacia (procesar cada item original).
          // MERGE: si llega un lote con el mismo batchNumber + warehouse + fecha de
          // vencimiento que un lote ya existente, SUMAMOS la cantidad al existente
          // en vez de crear un registro duplicado. Esto evita que aparezcan varios
          // registros del "mismo lote" cada vez que se reabastece, y de paso
          // arregla el caso de lotes vacíos (quantity=0) que se rellenaban con
          // un nuevo registro en vez de reusar el slot.
          const itemsWithBatch = grouped.items.filter(item => item.batchNumber || item.expirationDate)
          if (itemsWithBatch.length > 0) {
            const updatedBatches = [...(product.batches || [])]
            const targetWarehouseId = selectedWarehouse?.id || null
            const normalizeBn = (s) => String(s || '').trim().toLowerCase()
            const expDateEqual = (a, b) => {
              if (!a && !b) return true
              if (!a || !b) return false
              const da = a.toDate ? a.toDate().getTime() : new Date(a).getTime()
              const db = b.toDate ? b.toDate().getTime() : new Date(b).getTime()
              return da === db
            }

            for (const item of itemsWithBatch) {
              const itemBatchNumber = String(item.batchNumber || '').trim()
              const itemQty = parseFloat(item.quantity) || 0
              const itemExpDate = item.expirationDate
                ? Timestamp.fromDate(parseLocalDate(item.expirationDate))
                : null
              // costPrice del lote también en PEN base (ver razón en groupedProducts).
              const itemCostNative = parseFloat(item.cost) || 0
              const itemCost = convertToBase(itemCostNative, currency, exchangeRate)

              // Solo intentamos merge si hay batchNumber identificable.
              const existingIdx = itemBatchNumber
                ? updatedBatches.findIndex(b =>
                    normalizeBn(b.batchNumber) === normalizeBn(itemBatchNumber) &&
                    (b.warehouseId || null) === targetWarehouseId &&
                    expDateEqual(b.expirationDate, itemExpDate)
                  )
                : -1

              if (existingIdx >= 0) {
                const existing = updatedBatches[existingIdx]
                updatedBatches[existingIdx] = {
                  ...existing,
                  quantity: (parseFloat(existing.quantity) || 0) + itemQty,
                  // Actualizamos costo al último (sirve para futuros reportes
                  // de costo promedio si se necesita en otra iteración).
                  costPrice: itemCost || existing.costPrice || 0,
                  // Referencia a la última compra que tocó este lote
                  purchaseId: resultId || existing.purchaseId || null,
                  purchaseDate: Timestamp.fromDate(new Date(invoiceDate)),
                }
              } else {
                updatedBatches.push({
                  id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  batchNumber: itemBatchNumber,
                  quantity: itemQty,
                  expirationDate: itemExpDate,
                  purchaseId: resultId || null,
                  purchaseDate: Timestamp.fromDate(new Date(invoiceDate)),
                  costPrice: itemCost,
                  warehouseId: targetWarehouseId,
                  createdAt: Timestamp.fromDate(new Date())
                })
              }
            }

            extraUpdates.batches = updatedBatches
            extraUpdates.trackExpiration = true

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
            }
          }

          // Sistema de números de serie
          const itemsWithSerials = grouped.items.filter(item => item.trackSerials && item.serialNumbers?.some(sn => sn.trim()))
          if (itemsWithSerials.length > 0) {
            const currentSerials = product.serials || []
            const newSerials = []
            itemsWithSerials.forEach(item => {
              item.serialNumbers.forEach(sn => {
                if (sn.trim()) {
                  newSerials.push({
                    id: `serial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    serialNumber: sn.trim(),
                    status: 'available',
                    warehouseId: selectedWarehouse?.id || null,
                    purchaseId: resultId || null,
                    purchaseDate: Timestamp.fromDate(new Date(invoiceDate)),
                    saleId: null,
                    variantSku: item.variantSku || null,
                    createdAt: Timestamp.fromDate(new Date())
                  })
                }
              })
            })
            extraUpdates.serials = [...currentSerials, ...newSerials]
            extraUpdates.trackSerials = true
          }

          let result
          if (shouldUpdateStock) {
            // Actualizar stock + datos extra en transacción atómica
            result = await updateProductStockTransaction(
              businessId,
              grouped.productId,
              selectedWarehouse?.id || '',
              newQuantity,
              cleanUndefined(extraUpdates),
              grouped.variantSku
            )
          } else {
            // Solo actualizar datos extra (sin cambio de stock)
            result = await updateProduct(businessId, grouped.productId, cleanUndefined(extraUpdates))
          }
          if (!result.success) {
            console.error('❌ Error actualizando producto:', grouped.productId, result.error, 'Updates:', JSON.stringify(updates, (key, value) => {
              if (value instanceof Date) return `Date(${value.toISOString()})`
              return value
            }, 2))
          }
          return result
        }
      })

      await Promise.all(productUpdates)

      // 3.5. Registrar movimientos de stock para historial de PRODUCTOS
      // En modo edición sin cambio de almacén, los movimientos de ajuste ya se crearon arriba
      // Solo crear movimientos si es creación nueva o si cambió el almacén
      if (!isEditMode || warehouseChangedInEdit) {
        const stockMovementPromises = productItems.map(async item => {
          const product = products.find(p => p.id === item.productId)
          if (!product) return
          if (product.trackStock === false) return

          const qty = parseFloat(item.quantity) || 0
          if (qty <= 0) return

          const cleanSerials = (item.serialNumbers || []).filter(sn => sn?.trim?.())
          return createStockMovement(businessId, {
            productId: item.productId,
            warehouseId: selectedWarehouse?.id || '',
            type: 'entry',
            quantity: qty,
            reason: warehouseChangedInEdit ? 'Compra editada (nuevo almacén)' : 'Compra',
            referenceType: 'purchase',
            referenceId: resultId || '',
            userId: user?.uid,
            ...(item.variantSku && { variantSku: item.variantSku }),
            ...(item.batchNumber && { batchNumber: item.batchNumber }),
            ...(cleanSerials.length > 0 && { serialNumbers: cleanSerials }),
            notes: `${warehouseChangedInEdit ? 'Entrada a nuevo almacén' : 'Compra'} - ${selectedSupplier?.businessName || 'Proveedor'} - ${invoiceNumber || 'S/N'}${item.variantSku ? ` (${item.variantLabel || item.variantSku})` : ''}${item.batchNumber ? ` (Lote: ${item.batchNumber})` : ''}${cleanSerials.length > 0 ? ` (Series: ${cleanSerials.join(', ')})` : ''}`
          })
        })

        Promise.all(stockMovementPromises).catch(err => {
          console.error('Error al registrar movimientos de stock:', err)
        })
      }

      // 4. Actualizar stock de INGREDIENTES
      // IMPORTANTE: Agrupar items por ingredientId para manejar múltiples líneas del mismo ingrediente
      const groupedIngredients = {}
      ingredientItems.forEach(item => {
        const ingredientId = item.productId
        if (!groupedIngredients[ingredientId]) {
          groupedIngredients[ingredientId] = {
            ingredientId,
            ingredientName: item.productName,
            unit: item.unit || 'NIU',
            totalQuantity: 0,
            totalCost: 0
          }
        }
        const qty = parseFloat(item.quantity) || 0
        const cost = parseFloat(item.cost) || 0
        // Mismo principio que productos: el costo del INGREDIENTE se almacena
        // siempre en PEN base. Si la compra es USD, convertimos antes de
        // acumular para el promedio.
        const costInBase = convertToBase(cost, currency, exchangeRate)
        groupedIngredients[ingredientId].totalQuantity += qty
        groupedIngredients[ingredientId].totalCost += qty * costInBase
      })

      if (!isEditMode) {
        // Modo creación: registrar compra de ingredientes (crea registro + actualiza stock)
        const ingredientUpdates = Object.values(groupedIngredients).map(async grouped => {
          const avgUnitPrice = grouped.totalQuantity > 0 ? Math.round((grouped.totalCost / grouped.totalQuantity) * 100) / 100 : 0
          return registerIngredientPurchase(businessId, {
            ingredientId: grouped.ingredientId,
            ingredientName: grouped.ingredientName,
            quantity: grouped.totalQuantity,
            unit: grouped.unit,
            unitPrice: avgUnitPrice,
            totalCost: grouped.totalCost,
            supplier: selectedSupplier?.businessName || '',
            invoiceNumber: invoiceNumber.trim() || '',
            invoiceDocType: invoiceDocType || 'factura',
            purchaseDate: parseLocalDate(invoiceDate),
            warehouseId: selectedWarehouse?.id || null,
          })
        })

        await Promise.all(ingredientUpdates)
      } else {
        // Modo edición: calcular diferencias y ajustar stock de ingredientes
        const originalIngredientItems = (originalPurchase?.items || []).filter(item => item.itemType === 'ingredient')

        // Agrupar cantidades originales por ingrediente
        const originalIngredientQtys = {}
        originalIngredientItems.forEach(item => {
          const id = item.productId
          if (!originalIngredientQtys[id]) originalIngredientQtys[id] = 0
          originalIngredientQtys[id] += parseFloat(item.quantity) || 0
        })

        // Agrupar cantidades nuevas por ingrediente
        const newIngredientQtys = {}
        ingredientItems.forEach(item => {
          const id = item.productId
          if (!newIngredientQtys[id]) newIngredientQtys[id] = 0
          newIngredientQtys[id] += parseFloat(item.quantity) || 0
        })

        // Calcular diferencias (ingredientes existentes + nuevos + removidos)
        const allIngredientIds = new Set([...Object.keys(originalIngredientQtys), ...Object.keys(newIngredientQtys)])

        const originalIngredientWarehouseId = originalPurchase?.warehouseId || null
        const newIngredientWarehouseId = selectedWarehouse?.id || null

        const ingredientStockUpdates = [...allIngredientIds].map(async ingredientId => {
          const originalQty = originalIngredientQtys[ingredientId] || 0
          const newQty = newIngredientQtys[ingredientId] || 0

          if (originalQty === newQty && originalIngredientWarehouseId === newIngredientWarehouseId) return // Sin cambio

          const ingredient = ingredients.find(i => i.id === ingredientId)
          if (!ingredient) return

          const purchaseUnit = ingredient.purchaseUnit
          const itemUnit = groupedIngredients[ingredientId]?.unit || originalIngredientItems.find(i => i.productId === ingredientId)?.unit || 'NIU'

          const convertedOriginalQty = convertUnit(originalQty, itemUnit, purchaseUnit)
          const convertedNewQty = convertUnit(newQty, itemUnit, purchaseUnit)

          // Actualizar warehouseStocks
          let updatedWarehouseStocks = [...(ingredient.warehouseStocks || [])]

          // Revertir cantidad original del almacén original
          if (originalIngredientWarehouseId && convertedOriginalQty > 0) {
            const origIdx = updatedWarehouseStocks.findIndex(ws => ws.warehouseId === originalIngredientWarehouseId)
            if (origIdx >= 0) {
              updatedWarehouseStocks[origIdx] = {
                ...updatedWarehouseStocks[origIdx],
                stock: Math.max(0, (updatedWarehouseStocks[origIdx].stock || 0) - convertedOriginalQty)
              }
            }
          }

          // Agregar nueva cantidad al almacén seleccionado
          if (newIngredientWarehouseId && convertedNewQty > 0) {
            const newIdx = updatedWarehouseStocks.findIndex(ws => ws.warehouseId === newIngredientWarehouseId)
            if (newIdx >= 0) {
              updatedWarehouseStocks[newIdx] = {
                ...updatedWarehouseStocks[newIdx],
                stock: (updatedWarehouseStocks[newIdx].stock || 0) + convertedNewQty
              }
            } else {
              updatedWarehouseStocks.push({
                warehouseId: newIngredientWarehouseId,
                stock: convertedNewQty
              })
            }
          }

          // Calcular nuevo stock total desde warehouseStocks
          const newStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)

          const updates = {
            currentStock: newStock,
            warehouseStocks: updatedWarehouseStocks
          }

          // Recalcular costo promedio
          if (newQty > 0 && groupedIngredients[ingredientId]) {
            const grouped = groupedIngredients[ingredientId]
            const avgUnitPrice = grouped.totalQuantity > 0 ? Math.round((grouped.totalCost / grouped.totalQuantity) * 100) / 100 : 0
            if (avgUnitPrice > 0) {
              const currentAvgCost = ingredient.averageCost || 0
              const revertedStock = Math.max(0, newStock - convertedNewQty)
              if (currentAvgCost > 0 && revertedStock > 0) {
                updates.averageCost = ((revertedStock * currentAvgCost) + (convertedNewQty * avgUnitPrice)) / newStock
              } else {
                updates.averageCost = avgUnitPrice
              }
              updates.lastPurchasePrice = avgUnitPrice
            }
          }

          return updateIngredient(businessId, ingredientId, updates)
        })

        await Promise.all(ingredientStockUpdates)
      }

      // 5. Actualizar precios de venta si la opción está activa
      if (businessSettings?.posCustomFields?.showSalePriceInPurchase) {
        const priceUpdates = []
        // Agrupar items por productId para manejar variantes
        const productItemsGrouped = {}
        for (const item of activeItems) {
          if (!item.productId || item.itemType === 'ingredient') continue
          if (!productItemsGrouped[item.productId]) {
            productItemsGrouped[item.productId] = []
          }
          productItemsGrouped[item.productId].push(item)
        }

        for (const [productId, items] of Object.entries(productItemsGrouped)) {
          const product = products.find(p => p.id === productId)
          if (!product) continue

          // Helper: convertir precio de venta de la moneda de la compra a base (PEN).
          // product.price/price2/price3/price4 SIEMPRE se guarda en PEN (la moneda base);
          // si la compra está en USD, hay que dividir por el TC antes de persistir.
          const salePriceToBase = (raw) => {
            const v = parseFloat(raw)
            if (!Number.isFinite(v) || v <= 0) return null
            return Math.round(convertToBase(v, currency, exchangeRate) * 100) / 100
          }
          // Valor crudo en USD (para fijar priceUSD sin convertir). Solo aplica en modo ancla.
          const salePriceUsdRaw = (raw) => {
            const v = parseFloat(raw)
            return Number.isFinite(v) && v > 0 ? v : null
          }
          const useUsdAnchor = salePriceAsUSD && currency === 'USD'

          if (product.hasVariants && product.variants?.length > 0) {
            // Producto con variantes: leer datos frescos de Firestore para no sobreescribir el stock
            // que fue actualizado en el paso 3 por updateProductStockTransaction
            const freshDoc = await getDoc(doc(db, 'businesses', businessId, 'products', productId))
            const freshVariants = freshDoc.exists() ? (freshDoc.data().variants || product.variants) : product.variants
            const updatedVariants = freshVariants.map(v => {
              const matchingItem = items.find(i => i.variantSku === v.sku)
              if (matchingItem) {
                const p2 = salePriceToBase(matchingItem.salePrice2)
                const p3 = salePriceToBase(matchingItem.salePrice3)
                const p4 = salePriceToBase(matchingItem.salePrice4)
                if (useUsdAnchor) {
                  // Precio de venta fijo en dólares: guardar priceUSD (ancla) y price = USD × TC.
                  const usd1 = salePriceUsdRaw(matchingItem.salePrice)
                  return {
                    ...v,
                    priceUSD: usd1 != null ? usd1 : (v.priceUSD ?? null),
                    price: usd1 != null ? (Math.round(convertToBase(usd1, 'USD', exchangeRate) * 100) / 100) : v.price,
                    price2: p2 != null ? p2 : v.price2,
                    price3: p3 != null ? p3 : v.price3,
                    price4: p4 != null ? p4 : v.price4,
                  }
                }
                const p1 = salePriceToBase(matchingItem.salePrice)
                return {
                  ...v,
                  price: p1 != null ? p1 : v.price,
                  price2: p2 != null ? p2 : v.price2,
                  price3: p3 != null ? p3 : v.price3,
                  price4: p4 != null ? p4 : v.price4,
                }
              }
              return v
            })
            const avgPrice = updatedVariants.reduce((sum, v) => sum + (v.price || 0), 0) / updatedVariants.length
            priceUpdates.push(updateProduct(businessId, productId, {
              variants: updatedVariants,
              basePrice: parseFloat(avgPrice.toFixed(2)),
            }))
          } else {
            // Producto sin variantes
            const item = items[0]
            const updates = {}
            const p2 = salePriceToBase(item.salePrice2)
            const p3 = salePriceToBase(item.salePrice3)
            const p4 = salePriceToBase(item.salePrice4)
            if (useUsdAnchor) {
              // Precio de venta fijo en dólares: guardar priceUSD (ancla) y price = USD × TC.
              const usd1 = salePriceUsdRaw(item.salePrice)
              if (usd1 != null) {
                updates.priceUSD = usd1
                updates.price = Math.round(convertToBase(usd1, 'USD', exchangeRate) * 100) / 100
              }
            } else {
              const p1 = salePriceToBase(item.salePrice)
              if (p1 != null) updates.price = p1
            }
            if (p2 != null) updates.price2 = p2
            if (p3 != null) updates.price3 = p3
            if (p4 != null) updates.price4 = p4
            if (Object.keys(updates).length > 0) {
              priceUpdates.push(updateProduct(businessId, productId, updates))
            }
          }
        }

        if (priceUpdates.length > 0) {
          await Promise.all(priceUpdates)
        }
      }

      // 6. Mostrar éxito y redirigir
      toast.success(isEditMode ? 'Compra actualizada exitosamente' : 'Compra registrada exitosamente. Stock y costos actualizados')
      setTimeout(() => {
        appNavigate('compras')
      }, 1500)
    } catch (error) {
      console.error('Error al guardar compra:', error)
      setMessage({
        type: 'error',
        text: error.message || (isEditMode ? 'Error al actualizar la compra.' : 'Error al crear la compra. Inténtalo nuevamente.'),
      })
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
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="outline"
            onClick={() => appNavigate('compras')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {isEditMode ? 'Editar Compra' : 'Nueva Compra'}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {isEditMode
              ? 'Modifica los datos de la compra y el stock se actualizará automáticamente'
              : 'Registra la factura del proveedor y actualiza el inventario'}
          </p>
        </div>
      </div>

      {message && (
        <Alert type={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Información del Proveedor */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Buscador de Proveedor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Proveedor
              </label>
              <div className="relative" ref={supplierInputRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar proveedor por nombre o RUC..."
                    value={supplierSearch}
                    onChange={e => {
                      setSupplierSearch(e.target.value)
                      setShowSupplierDropdown(true)
                      if (!e.target.value) setSelectedSupplier(null)
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    className={`w-full pl-10 ${selectedSupplier ? 'pr-10' : 'pr-4'} py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      selectedSupplier ? 'border-green-500 bg-green-50' : 'border-gray-300'
                    }`}
                  />
                  {selectedSupplier && (
                    <button
                      onClick={clearSupplier}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown de proveedores */}
                {showSupplierDropdown && supplierSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredSuppliers.length > 0 ? (
                      filteredSuppliers.map(supplier => (
                        <button
                          key={supplier.id}
                          onClick={() => selectSupplier(supplier)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          <div className="font-medium text-gray-900">{supplier.businessName}</div>
                          <div className="text-sm text-gray-500">
                            {supplier.documentNumber}
                            {supplier.contactName && ` • ${supplier.contactName}`}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-500">
                        No se encontraron proveedores
                      </div>
                    )}
                  </div>
                )}

                {selectedSupplier && (
                  <div className="mt-2 text-sm text-green-600">
                    ✓ {selectedSupplier.businessName} seleccionado
                  </div>
                )}
              </div>
            </div>

            {/* Documento de referencia: tipo + número */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Documento de Referencia
              </label>
              <div className="flex gap-2">
                <select
                  value={invoiceDocType}
                  onChange={e => setInvoiceDocType(e.target.value)}
                  className="w-40 flex-shrink-0 h-10 px-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="factura">Factura</option>
                  <option value="boleta">Boleta</option>
                  <option value="guia_interna">Guía interna</option>
                  <option value="dam">DAM</option>
                  <option value="dua">DUA</option>
                  <option value="nota_credito">Nota de Crédito</option>
                  <option value="ticket">Ticket</option>
                  <option value="otros">Otros</option>
                </select>
                <input
                  type="text"
                  placeholder={
                    invoiceDocType === 'factura' ? 'F001-00000123' :
                    invoiceDocType === 'boleta' ? 'B001-00000123' :
                    invoiceDocType === 'guia_interna' ? 'T001-00000001' :
                    invoiceDocType === 'dam' || invoiceDocType === 'dua' ? 'Nº de declaración' :
                    'Número del documento'
                  }
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  className="flex-1 min-w-0 h-10 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <Input
              label="Fecha de Factura"
              type="date"
              required
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
            />

            {/* Selector de Almacén */}
            {warehouses.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Store className="w-4 h-4 inline mr-1" />
                  Almacén de Ingreso <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedWarehouse?.id || ''}
                  onChange={e => {
                    const warehouse = warehouses.find(w => w.id === e.target.value)
                    setSelectedWarehouse(warehouse)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {/* Almacenes de Sucursal Principal */}
                  {warehouses.filter(w => !w.branchId).length > 0 && (
                    <optgroup label="Sucursal Principal">
                      {warehouses.filter(w => !w.branchId).map(warehouse => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {/* Almacenes de otras sucursales */}
                  {branches.map(branch => {
                    const branchWarehouses = warehouses.filter(w => w.branchId === branch.id)
                    if (branchWarehouses.length === 0) return null
                    return (
                      <optgroup key={branch.id} label={branch.name}>
                        {branchWarehouses.map(warehouse => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  El stock ingresará a este almacén
                </p>
              </div>
            )}

            {/* === Multi-divisa: selector de moneda + TC ============== */}
            {/* Solo se muestra si el negocio activó el toggle en Configuración. */}
            {/* Las boletas se bloquean por norma SUNAT (siempre PEN). */}
            {multiCurrencyOn && (
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <label className="text-sm font-medium text-gray-700">
                    Moneda de la compra
                  </label>
                  {invoiceDocType === 'boleta' && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                      Boleta → solo PEN
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {SUPPORTED_CURRENCIES.map((ccy) => {
                    const disabled = invoiceDocType === 'boleta' && ccy === 'USD'
                    const active = currency === ccy
                    return (
                      <button
                        key={ccy}
                        type="button"
                        disabled={disabled || isEditMode}
                        onClick={() => setCurrency(ccy)}
                        className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                          active
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        } ${disabled || isEditMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={isEditMode ? 'No se puede cambiar la moneda en edición' : undefined}
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
                        Tipo de cambio (S/ por $)
                      </label>
                      {exchangeRateSource === 'sbs' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 font-medium">SBS</span>
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
                        value={exchangeRate}
                        onChange={(e) => {
                          setExchangeRate(parseFloat(e.target.value) || 0)
                          setExchangeRateSource('manual')
                        }}
                        disabled={isEditMode}
                        className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => fetchExchangeRate(true)}
                        disabled={loadingRate || isEditMode}
                        className="h-9 px-3 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
                        title="Obtener TC del día desde SBS"
                      >
                        {loadingRate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        SBS
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      El TC se congela al guardar la compra. Los reportes en PEN
                      se calcularán con este TC y no cambiarán aunque el dólar
                      fluctúe. El costo del producto se almacena en Soles.
                    </p>
                    {businessSettings?.posCustomFields?.showSalePriceInPurchase && (
                      <label className="flex items-start gap-2 pt-2 border-t border-emerald-200/70 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={salePriceAsUSD}
                          onChange={(e) => setSalePriceAsUSD(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-[11px] text-gray-600 leading-relaxed">
                          <span className="font-medium text-gray-700">Fijar precio de venta en dólares</span> — el precio de venta que ingreses se guarda como precio fijo en USD del producto (queda anclado al dólar; en soles valdrá precio × TC del día).
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tipo de Pago */}
          <div className="mt-4 pt-4 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Pago <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="paymentType"
                  value="contado"
                  checked={paymentType === 'contado'}
                  onChange={e => {
                    setPaymentType(e.target.value)
                    setDueDate('')
                    setInstallments([])
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Al Contado</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="paymentType"
                  value="credito"
                  checked={paymentType === 'credito'}
                  onChange={e => setPaymentType(e.target.value)}
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Al Crédito</span>
              </label>
            </div>

            {paymentType === 'credito' && (
              <div className="mt-4 space-y-4">
                {/* Fecha de vencimiento opcional */}
                <div className="max-w-xs">
                  <Input
                    label="Fecha de Vencimiento (opcional)"
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    min={getLocalDateString()}
                  />
                </div>
                <p className="text-sm text-gray-500">
                  Podrás registrar pagos parciales (abonos) desde la lista de compras hasta cancelar la deuda.
                </p>
              </div>
            )}
          </div>

          {suppliers.length === 0 && (
            <Alert type="warning" className="mt-4">
              No tienes proveedores registrados.{' '}
              <button
                onClick={() => appNavigate('proveedores')}
                className="underline font-medium"
              >
                Crear proveedor
              </button>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Productos e Ingredientes */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Items de Compra</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Los precios unitarios deben incluir IGV (18%)
                </p>
              </div>
              <Button onClick={addItem} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Agregar Item
              </Button>
            </div>
            {/* Tabs para seleccionar tipo de items */}
            {ingredients.length > 0 && (
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
                <button
                  onClick={() => setItemMode('products')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    itemMode === 'products'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  Productos
                </button>
                <button
                  onClick={() => setItemMode('ingredients')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    itemMode === 'ingredients'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Beaker className="w-4 h-4" />
                  Ingredientes
                </button>
                <button
                  onClick={() => setItemMode('all')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    itemMode === 'all'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Todos
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 overflow-visible">
          {/* Vista de tabla para desktop */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className={`text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 ${(businessMode === 'pharmacy' || businessSettings?.posCustomFields?.showBatchExpiryInPurchase) ? 'w-[25%]' : 'w-[35%]'}`}>Producto</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[8%]">Cant.</th>
                  {(businessMode === 'pharmacy' || businessSettings?.posCustomFields?.showBatchExpiryInPurchase) && (
                    <>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[10%]">Lote</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[12%]">Vence</th>
                    </>
                  )}
                  <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[12%]">Costo s/IGV</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[12%]">Costo c/IGV</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3 w-[12%]">Subtotal</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[5%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchaseItems.map((item, index) => (
                  <React.Fragment key={index}>
                  <tr className="hover:bg-gray-50">
                    {/* Producto */}
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <div className="relative flex-1" ref={el => productInputRefs.current[index] = el}>
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder={itemMode === 'ingredients' ? 'Buscar ingrediente...' : itemMode === 'all' ? 'Buscar producto o ingrediente...' : 'Buscar producto...'}
                              value={productSearches[index] || item.productName || ''}
                              onChange={e => {
                                updateProductSearch(index, e.target.value)
                                updateItem(index, 'productName', e.target.value)
                              }}
                              onFocus={() => {
                                const newDropdowns = { ...showProductDropdowns }
                                newDropdowns[index] = true
                                setShowProductDropdowns(newDropdowns)
                              }}
                              className={`w-full pl-7 pr-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                item.productId
                                  ? item.itemType === 'ingredient'
                                    ? 'border-amber-500 bg-amber-50'
                                    : 'border-green-500 bg-green-50'
                                  : 'border-gray-300'
                              }`}
                            />
                          </div>
                          {/* Dropdown de productos e ingredientes */}
                          {showProductDropdowns[index] && productSearches[index] && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {getFilteredItems(index).length > 0 ? (
                                getFilteredItems(index).map(searchItem => (
                                  <div
                                    key={`${searchItem.itemType}-${searchItem.id}`}
                                    role="button"
                                    tabIndex={0}
                                    onMouseDown={e => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      selectProduct(index, searchItem)
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-b-0 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2">
                                      {searchItem.itemType === 'ingredient' ? (
                                        <Beaker className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                      ) : (
                                        <Package className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                                      )}
                                      <span className="font-medium text-sm text-gray-900">{searchItem.name}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 ml-5.5 pl-0.5">
                                      {searchItem.itemType === 'ingredient' ? (
                                        <>Stock: {searchItem.currentStock} {searchItem.purchaseUnit}</>
                                      ) : (
                                        searchItem.code || `Stock: ${searchItem.stock || 0}`
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-sm text-gray-500">No encontrado</div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowCreateMenu(prev => ({ ...prev, [index]: !prev[index] }))}
                            className="p-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
                            title="Crear nuevo"
                          >
                            <PackagePlus className="w-4 h-4" />
                          </button>
                          {showCreateMenu[index] && (
                            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-40">
                              <button
                                type="button"
                                onClick={() => { setShowCreateMenu({}); openCreateProductModal(index) }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 rounded-t-lg"
                              >
                                <Package className="w-3.5 h-3.5 text-primary-600" />
                                Producto
                              </button>
                              <button
                                type="button"
                                onClick={() => openCreateIngredientModal(index)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 rounded-b-lg border-t"
                              >
                                <Beaker className="w-3.5 h-3.5 text-amber-600" />
                                Ingrediente
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Cantidad */}
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder=""
                        value={item.quantity}
                        onChange={e => updateItem(index, 'quantity', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </td>
                    {/* Lote y Vencimiento - Farmacia o si está habilitado en config */}
                    {(businessMode === 'pharmacy' || businessSettings?.posCustomFields?.showBatchExpiryInPurchase) && (
                      <>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            placeholder="Lote"
                            value={item.batchNumber || ''}
                            onChange={e => updateItem(index, 'batchNumber', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={item.expirationDate || ''}
                            onChange={e => updateItem(index, 'expirationDate', e.target.value)}
                            style={{ paddingTop: '5px', paddingBottom: '5px' }}
                            className="w-full px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                      </>
                    )}
                    {/* Costo Sin IGV */}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={item.costWithoutIGV ? parseFloat(item.costWithoutIGV.toFixed(6)) : ''}
                        onChange={e => updateCostWithoutIGV(index, e.target.value)}
                        className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </td>
                    {/* Costo Con IGV */}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={item.cost ? parseFloat(item.cost.toFixed(6)) : ''}
                        onChange={e => updateCostWithIGV(index, e.target.value)}
                        className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </td>
                    {/* Subtotal */}
                    <td className="px-4 py-2 text-right">
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(calculateItemSubtotal(item), currency)}
                      </span>
                    </td>
                    {/* Eliminar */}
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => removeItem(index)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        disabled={purchaseItems.length === 1}
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  {/* Fila de precios de venta */}
                  {businessSettings?.posCustomFields?.showSalePriceInPurchase && item.productId && (
                    <tr className="bg-blue-50/40 border-b border-gray-200">
                      <td colSpan={99} className="px-4 py-1.5">
                        <div className="flex items-center flex-wrap gap-3">
                          <span className="text-xs font-medium text-blue-600">
                            Precios de venta
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">{currency}</span>
                            {currency !== 'PEN' && (
                              <span className="ml-2 text-[10px] font-normal text-gray-500">(se guardará convertido a PEN con TC {Number(exchangeRate || 0).toFixed(2)})</span>
                            )}:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-blue-600 whitespace-nowrap">{businessSettings?.priceLabels?.price1 || 'P. Venta'}</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0.00"
                              value={item.salePrice || ''}
                              onChange={e => updateItem(index, 'salePrice', e.target.value)}
                              className="w-24 px-2 py-1 text-sm text-center border border-blue-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          {businessSettings?.multiplePricesEnabled && (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-blue-600 whitespace-nowrap">{businessSettings?.priceLabels?.price2 || 'P2'}</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="0.00"
                                  value={item.salePrice2 || ''}
                                  onChange={e => updateItem(index, 'salePrice2', e.target.value)}
                                  className="w-24 px-2 py-1 text-sm text-center border border-blue-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-blue-600 whitespace-nowrap">{businessSettings?.priceLabels?.price3 || 'P3'}</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="0.00"
                                  value={item.salePrice3 || ''}
                                  onChange={e => updateItem(index, 'salePrice3', e.target.value)}
                                  className="w-24 px-2 py-1 text-sm text-center border border-blue-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-blue-600 whitespace-nowrap">{businessSettings?.priceLabels?.price4 || 'P4'}</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="0.00"
                                  value={item.salePrice4 || ''}
                                  onChange={e => updateItem(index, 'salePrice4', e.target.value)}
                                  className="w-24 px-2 py-1 text-sm text-center border border-blue-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Fila de Registro Sanitario — solo farmacia, con producto seleccionado */}
                  {businessMode === 'pharmacy' && item.productId && (
                    <tr className="bg-purple-50/40 border-b border-gray-200">
                      <td colSpan={99} className="px-4 py-1.5">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-xs font-medium text-purple-700 whitespace-nowrap">Registro Sanitario:</span>
                          <input
                            type="text"
                            placeholder="Ej: RS-12345"
                            value={item.sanitaryRegistry || ''}
                            onChange={e => updateItem(index, 'sanitaryRegistry', e.target.value)}
                            className="flex-1 min-w-[180px] max-w-sm px-2 py-1 text-sm border border-purple-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          {item.sanitaryRegistry !== item.originalSanitaryRegistry && (
                            <span className="text-xs text-amber-600 font-medium">Modificado — se actualizará el producto al guardar</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Fila de números de serie */}
                  {item.trackSerials && item.serialNumbers?.length > 0 && (
                    <tr className="bg-amber-50/40 border-b border-gray-200">
                      <td colSpan={99} className="px-4 py-2">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-medium text-amber-700 mt-1.5 whitespace-nowrap">N° de Serie:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.serialNumbers.map((sn, snIdx) => (
                              <input
                                key={snIdx}
                                type="text"
                                placeholder={`Serie ${snIdx + 1}`}
                                value={sn}
                                onChange={e => updateSerialNumber(index, snIdx, e.target.value)}
                                className="w-36 px-2 py-1 text-sm border border-amber-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vista de lista compacta para móvil */}
          <div className="md:hidden divide-y divide-gray-200">
            {purchaseItems.map((item, index) => (
              <div key={index} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
                  <button
                    onClick={() => removeItem(index)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    disabled={purchaseItems.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Producto o Ingrediente */}
                <div className="flex gap-2">
                  <div className="relative flex-1" ref={el => productInputRefs.current[`mobile-${index}`] = el}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder={itemMode === 'ingredients' ? 'Buscar ingrediente...' : itemMode === 'all' ? 'Buscar...' : 'Buscar producto...'}
                        value={productSearches[index] || item.productName || ''}
                        onChange={e => {
                          updateProductSearch(index, e.target.value)
                          updateItem(index, 'productName', e.target.value)
                        }}
                        onFocus={() => {
                          const newDropdowns = { ...showProductDropdowns }
                          newDropdowns[index] = true
                          setShowProductDropdowns(newDropdowns)
                        }}
                        className={`w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                          item.productId
                            ? item.itemType === 'ingredient'
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-green-500 bg-green-50'
                            : 'border-gray-300'
                        }`}
                      />
                    </div>
                    {showProductDropdowns[index] && productSearches[index] && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {getFilteredItems(index).length > 0 ? (
                          getFilteredItems(index).map(searchItem => (
                            <div
                              key={`${searchItem.itemType}-${searchItem.id}`}
                              role="button"
                              tabIndex={0}
                              onMouseDown={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                selectProduct(index, searchItem)
                              }}
                              onTouchStart={e => {
                                e.stopPropagation()
                              }}
                              onTouchEnd={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                selectProduct(index, searchItem)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-b-0 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                {searchItem.itemType === 'ingredient' ? (
                                  <Beaker className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                ) : (
                                  <Package className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                                )}
                                <span className="font-medium text-sm">{searchItem.name}</span>
                              </div>
                              <div className="text-xs text-gray-500 ml-5.5 pl-0.5">
                                {searchItem.itemType === 'ingredient' ? (
                                  <>Stock: {searchItem.currentStock} {searchItem.purchaseUnit}</>
                                ) : (
                                  searchItem.code || `Stock: ${searchItem.stock || 0}`
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-gray-500">No encontrado</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowCreateMenu(prev => ({ ...prev, [`m${index}`]: !prev[`m${index}`] }))}
                      className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      title="Crear nuevo"
                    >
                      <PackagePlus className="w-4 h-4" />
                    </button>
                    {showCreateMenu[`m${index}`] && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-40">
                        <button
                          type="button"
                          onClick={() => { setShowCreateMenu({}); openCreateProductModal(index) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 rounded-t-lg"
                        >
                          <Package className="w-3.5 h-3.5 text-primary-600" />
                          Producto
                        </button>
                        <button
                          type="button"
                          onClick={() => openCreateIngredientModal(index)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 rounded-b-lg border-t"
                        >
                          <Beaker className="w-3.5 h-3.5 text-amber-600" />
                          Ingrediente
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lote y Vencimiento - Farmacia o si está habilitado en config */}
                {(businessMode === 'pharmacy' || businessSettings?.posCustomFields?.showBatchExpiryInPurchase) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">N° Lote</label>
                      <input
                        type="text"
                        placeholder="Ej: LOT-001"
                        value={item.batchNumber || ''}
                        onChange={e => updateItem(index, 'batchNumber', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">F. Vencimiento</label>
                      <input
                        type="date"
                        value={item.expirationDate || ''}
                        onChange={e => updateItem(index, 'expirationDate', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                )}

                {/* Registro Sanitario - Solo farmacia (pre-cargado del producto, editable para corregir cambios) */}
                {businessMode === 'pharmacy' && item.productId && (
                  <div>
                    <label className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Registro Sanitario</span>
                      {item.sanitaryRegistry !== item.originalSanitaryRegistry && (
                        <span className="text-amber-600 font-medium">Modificado — se actualizará el producto</span>
                      )}
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: RS-12345"
                      value={item.sanitaryRegistry || ''}
                      onChange={e => updateItem(index, 'sanitaryRegistry', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                )}

                {/* Cantidad y Costos en una fila */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder=""
                      value={item.quantity}
                      onChange={e => updateItem(index, 'quantity', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">s/IGV</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.costWithoutIGV ? parseFloat(item.costWithoutIGV.toFixed(6)) : ''}
                      onChange={e => updateCostWithoutIGV(index, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">c/IGV</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.cost ? parseFloat(item.cost.toFixed(6)) : ''}
                      onChange={e => updateCostWithIGV(index, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Precios de venta - móvil */}
                {businessSettings?.posCustomFields?.showSalePriceInPurchase && (
                  <>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
                    <span>Precios de venta</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">{currency}</span>
                    {currency !== 'PEN' && (
                      <span className="text-[10px] font-normal text-gray-500">→ PEN con TC {Number(exchangeRate || 0).toFixed(2)}</span>
                    )}
                  </div>
                  <div className={`grid gap-2 ${businessSettings?.multiplePricesEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <div>
                      <label className="block text-xs text-blue-600 mb-1">{businessSettings?.priceLabels?.price1 || 'P. Venta'}</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={item.salePrice || ''}
                        onChange={e => updateItem(index, 'salePrice', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm text-center border border-blue-300 bg-blue-50/30 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    {businessSettings?.multiplePricesEnabled && (
                      <>
                        <div>
                          <label className="block text-xs text-blue-600 mb-1">{businessSettings?.priceLabels?.price2 || 'Precio 2'}</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.00"
                            value={item.salePrice2 || ''}
                            onChange={e => updateItem(index, 'salePrice2', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm text-center border border-blue-300 bg-blue-50/30 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-blue-600 mb-1">{businessSettings?.priceLabels?.price3 || 'Precio 3'}</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.00"
                            value={item.salePrice3 || ''}
                            onChange={e => updateItem(index, 'salePrice3', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm text-center border border-blue-300 bg-blue-50/30 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-blue-600 mb-1">{businessSettings?.priceLabels?.price4 || 'Precio 4'}</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.00"
                            value={item.salePrice4 || ''}
                            onChange={e => updateItem(index, 'salePrice4', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm text-center border border-blue-300 bg-blue-50/30 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  </>
                )}

                {/* Números de serie - móvil */}
                {item.trackSerials && item.serialNumbers?.length > 0 && (
                  <div>
                    <label className="block text-xs text-amber-700 font-medium mb-1">N° de Serie</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {item.serialNumbers.map((sn, snIdx) => (
                        <input
                          key={snIdx}
                          type="text"
                          placeholder={`Serie ${snIdx + 1}`}
                          value={sn}
                          onChange={e => updateSerialNumber(index, snIdx, e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Subtotal */}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Subtotal:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(calculateItemSubtotal(item), currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {products.length === 0 && ingredients.length === 0 && (
            <Alert type="warning" className="mt-4">
              No tienes productos ni ingredientes registrados.{' '}
              <button
                onClick={() => appNavigate('productos')}
                className="underline font-medium"
              >
                Crear producto
              </button>
              {' o '}
              <button
                onClick={() => appNavigate('ingredientes')}
                className="underline font-medium"
              >
                Crear ingrediente
              </button>
            </Alert>
          )}
          {products.length === 0 && ingredients.length > 0 && itemMode === 'products' && (
            <Alert type="info" className="mt-4">
              No tienes productos registrados. Cambia a "Ingredientes" para ver tus ingredientes o{' '}
              <button
                onClick={() => appNavigate('productos')}
                className="underline font-medium"
              >
                crea un producto
              </button>
            </Alert>
          )}
          {ingredients.length === 0 && products.length > 0 && itemMode === 'ingredients' && (
            <Alert type="info" className="mt-4">
              No tienes ingredientes registrados. Cambia a "Productos" para ver tus productos o{' '}
              <button
                onClick={() => appNavigate('ingredientes')}
                className="underline font-medium"
              >
                crea un ingrediente
              </button>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Notas y Total */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <Input
              label="Notas (opcional)"
              placeholder="Observaciones adicionales..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />

            <div className="border-t pt-4 space-y-3">
              {(() => {
                const a = calculateAmounts()
                return (
                  <>
                    <div className="flex justify-between items-center text-gray-600">
                      <span className="text-sm">Subtotal:</span>
                      <span className="font-medium">{formatCurrency(a.subtotal, currency)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span className="text-sm">IGV (18%):</span>
                      <span className="font-medium">{formatCurrency(a.igv, currency)}</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between items-center">
                      <span className="text-lg font-semibold text-gray-700">Total:</span>
                      <span className="text-3xl font-bold text-primary-600">
                        {formatCurrency(a.total, currency)}
                      </span>
                    </div>
                    {currency === 'USD' && exchangeRate > 0 && (
                      <div className="text-right text-xs text-gray-500 -mt-1">
                        ≈ {formatCurrency(a.totalInBase, 'PEN')} (TC {exchangeRate})
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => appNavigate('compras')}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isEditMode ? 'Actualizando...' : 'Guardando...'}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {isEditMode ? 'Actualizar Compra' : 'Guardar Compra'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal para crear producto nuevo */}
      <ProductFormModal
        isOpen={showCreateProductModal}
        onClose={closeCreateProductModal}
        onSubmit={handleCreateProduct}
        initialData={newProductName ? { name: newProductName } : null}
        categories={categories}
        title="Nuevo Producto"
        submitLabel="Crear Producto"
        isSubmitting={isCreatingProduct}
        options={{
          showImages: true,
          showSku: true,
          showMultiplePrices: true,
          showIgvAffectation: true,
          showPresentations: true,
          showExpiration: true,
          showDecimalQuantity: true,
          showCatalogVisibility: true,
        }}
        hideStockField={true} // En compras, el stock se maneja con la cantidad del item, no aquí
        businessMode={businessMode}
        laboratories={laboratories}
        brands={brands}
      />

      {/* Modal para crear ingrediente nuevo */}
      <Modal
        isOpen={showCreateIngredientModal}
        onClose={() => { setShowCreateIngredientModal(false); setCurrentItemIndex(null) }}
        title="Nuevo Ingrediente"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              value={newIngredientForm.name}
              onChange={e => setNewIngredientForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ej: Arroz, Pollo, Tomate..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              value={newIngredientForm.category}
              onChange={e => setNewIngredientForm(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="granos">Granos y Cereales</option>
              <option value="carnes">Carnes</option>
              <option value="vegetales">Vegetales y Frutas</option>
              <option value="lacteos">Lácteos</option>
              <option value="condimentos">Condimentos y Especias</option>
              <option value="bebidas">Bebidas</option>
              <option value="estetica">Estética y Belleza</option>
              <option value="salud">Salud y Farmacia</option>
              <option value="limpieza">Limpieza</option>
              <option value="otros">Otros</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unidad de compra</label>
            <select
              value={newIngredientForm.purchaseUnit}
              onChange={e => setNewIngredientForm(prev => ({ ...prev, purchaseUnit: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="kg">Kilogramos (kg)</option>
              <option value="g">Gramos (g)</option>
              <option value="L">Litros (L)</option>
              <option value="ml">Mililitros (ml)</option>
              <option value="unidades">Unidades</option>
              <option value="cajas">Cajas</option>
              <option value="sobres">Sobres</option>
              <option value="piezas">Piezas</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => { setShowCreateIngredientModal(false); setCurrentItemIndex(null) }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateIngredient}
              disabled={isCreatingIngredient || !newIngredientForm.name.trim()}
            >
              {isCreatingIngredient ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creando...</>
              ) : (
                'Crear Ingrediente'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
