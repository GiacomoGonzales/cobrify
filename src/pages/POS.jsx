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
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils'
import { calculateInvoiceAmounts, ID_TYPES } from '@/utils/peruUtils'
import { generateInvoicePDF, getInvoicePDFBlob } from '@/utils/pdfGenerator'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { getDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  getProducts,
  getCustomers,
  createInvoice,
  getCompanySettings,
  updateProduct,
  getNextDocumentNumber,
  getProductCategories,
  sendInvoiceToSunat,
} from '@/services/firestoreService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { deductIngredients } from '@/services/ingredientService'
import { getRecipeByProductId } from '@/services/recipeService'
import { getWarehouses, getDefaultWarehouse, updateWarehouseStock, getStockInWarehouse, getTotalAvailableStock, getOrphanStock } from '@/services/warehouseService'
import { releaseTable } from '@/services/tableService'
import { getSellers } from '@/services/sellerService'
import InvoiceTicket from '@/components/InvoiceTicket'

const PAYMENT_METHODS = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  YAPE: 'Yape',
  PLIN: 'Plin',
}

const ORDER_TYPES = {
  'dine-in': 'En Mesa',
  'takeaway': 'Para Llevar',
  'delivery': 'Delivery',
}

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

export default function POS() {
  const { user, isDemoMode, demoData, getBusinessId, businessMode, businessSettings, hasFeature } = useAppContext()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const ticketRef = useRef(null)
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [taxConfig, setTaxConfig] = useState({ igvRate: 18, igvExempt: false }) // Configuración de impuestos
  const [cart, setCart] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [documentType, setDocumentType] = useState('boleta')
  const [emissionDate, setEmissionDate] = useState(new Date().toISOString().split('T')[0]) // Fecha de emisión (por defecto hoy)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)

  // Estado para datos de mesa
  const [tableData, setTableData] = useState(null)
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('')
  const [lastInvoiceData, setLastInvoiceData] = useState(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Warehouses
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouse, setSelectedWarehouse] = useState(null)

  // Sellers
  const [sellers, setSellers] = useState([])
  const [selectedSeller, setSelectedSeller] = useState(null)

  // Categories
  const [categories, setCategories] = useState([])
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')

  // Pagination for products
  const [visibleProductsCount, setVisibleProductsCount] = useState(6)
  const PRODUCTS_PER_PAGE = 6

  // Pagos múltiples - lista simple y vertical
  const [payments, setPayments] = useState([{ method: '', amount: '' }])

  // Tipo de pedido (para reportes)
  const [orderType, setOrderType] = useState('takeaway')

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
    quantity: 1
  })

  // Estado para configuración de impresión web legible
  const [webPrintLegible, setWebPrintLegible] = useState(false)

  // Price editing
  const [editingPriceItemId, setEditingPriceItemId] = useState(null)
  const [editingPrice, setEditingPrice] = useState('')

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
        setCategories([])
        // Almacenes de demo
        const demoWarehouses = [
          { id: 'demo-1', name: 'Almacén Principal', isDefault: true, isActive: true },
          { id: 'demo-2', name: 'Almacén Secundario', isDefault: false, isActive: true },
        ]
        setWarehouses(demoWarehouses)
        setSelectedWarehouse(demoWarehouses[0])
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
      const warehousesResult = await getWarehouses(businessId)
      if (warehousesResult.success) {
        const warehouseList = warehousesResult.data || []
        setWarehouses(warehouseList)

        // Seleccionar almacén por defecto
        const defaultWarehouse = warehouseList.find(w => w.isDefault) || warehouseList[0] || null
        setSelectedWarehouse(defaultWarehouse)
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

  // Auto-agregar producto cuando se escanea código de barras
  useEffect(() => {
    // Solo ejecutar si hay un término de búsqueda
    if (!searchTerm || searchTerm.length < 3) return

    // Buscar productos que coincidan exactamente con el código de barras o SKU
    const searchLower = searchTerm.toLowerCase()
    const exactMatches = products.filter(p =>
      p.code?.toLowerCase() === searchLower ||
      p.sku?.toLowerCase() === searchLower
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

  const addToCart = product => {
    // If product has variants, show variant selection modal
    if (product.hasVariants) {
      setSelectedProductForVariant(product)
      setShowVariantModal(true)
      return
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

  const addVariantToCart = (product, variant) => {
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

    const quantity = parseInt(customProduct.quantity) || 1
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
      stock: null, // Productos personalizados no tienen control de stock
      isCustom: true,
    }

    setCart([...cart, customProductItem])
    toast.success('Producto personalizado agregado al carrito')

    // Resetear y cerrar modal
    setCustomProduct({ name: '', price: '', quantity: 1 })
    setShowCustomProductModal(false)
  }

  const updateQuantity = (itemId, change) => {
    setCart(
      cart
        .map(item => {
          const matchId = item.cartId || item.id
          if (matchId === itemId) {
            const newQuantity = item.quantity + change

            // Verificar stock del almacén seleccionado (solo para productos no personalizados)
            if (item.stock !== null && !item.isCustom) {
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

  // Función para establecer cantidad directamente (para productos por peso)
  const setQuantityDirectly = (itemId, newQuantity) => {
    const quantity = parseFloat(newQuantity)
    if (isNaN(quantity) || quantity < 0) return

    setCart(
      cart
        .map(item => {
          const matchId = item.cartId || item.id
          if (matchId === itemId) {
            // Verificar stock del almacén seleccionado (solo para productos no personalizados)
            if (item.stock !== null && !item.isCustom && quantity > 0) {
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
    setCart(cart.filter(item => (item.cartId || item.id) !== itemId))
  }

  const startEditingPrice = (itemId, currentPrice) => {
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
    setDocumentType('boleta')
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
    setDiscountAmount('')
    setDiscountPercentage('')
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
    const baseAmounts = calculateInvoiceAmounts(
      cart.map(item => ({
        price: item.price,
        quantity: item.quantity,
      })),
      taxConfig.igvRate
    )

    // Aplicar descuento al TOTAL (no al subtotal) para que sea más intuitivo
    const discount = parseFloat(discountAmount) || 0

    // El descuento se aplica al total (con IGV incluido)
    const totalAfterDiscount = Math.max(0, baseAmounts.total - discount)

    // Recalcular subtotal e IGV desde el nuevo total
    const subtotalAfterDiscount = taxConfig.igvRate > 0
      ? totalAfterDiscount / (1 + taxConfig.igvRate / 100)
      : totalAfterDiscount
    const igvAfterDiscount = totalAfterDiscount - subtotalAfterDiscount

    return {
      subtotal: Number(baseAmounts.subtotal.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      subtotalAfterDiscount: Number(subtotalAfterDiscount.toFixed(2)),
      igv: Number(igvAfterDiscount.toFixed(2)),
      total: Number(totalAfterDiscount.toFixed(2)),
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

    // Detectar si es venta al crédito (pago parcial habilitado con monto 0)
    const isCreditSale = enablePartialPayment && amountToPay === 0

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

      // 1. Obtener siguiente número de documento
      const numberResult = await getNextDocumentNumber(businessId, documentType)
      if (!numberResult.success) {
        console.error('❌ Error detallado al generar número:', numberResult.error)
        throw new Error(numberResult.error || 'Error al generar número de comprobante')
      }
      console.log('✅ Número generado:', numberResult.number)

      // 2. Preparar items de la factura
      const items = cart.map(item => ({
        productId: item.id,
        code: item.code || item.id, // Si no tiene código asignado, usar el ID
        name: item.name,
        quantity: item.quantity,
        unit: item.unit || 'UNIDAD',
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
        ...(item.notes && { notes: item.notes }), // Incluir notas si existen
      }))

      // 3. Crear factura
      // Calcular datos de pago parcial y ventas al crédito
      const partialAmount = parseFloat(partialPaymentAmount) || 0
      const isCreditSaleForInvoice = enablePartialPayment && partialAmount === 0 && documentType === 'nota_venta'
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

      // 4. Actualizar stock de productos por almacén
      const stockUpdates = cart
        .filter(item => !item.isCustom) // Excluir solo productos personalizados
        .map(async item => {
          const productData = products.find(p => p.id === item.id)
          if (!productData) return

          // Solo actualizar si el producto maneja stock (trackStock !== false)
          // Si trackStock es undefined o true, sí actualizar
          // Si trackStock es false, NO actualizar
          if (productData.trackStock === false) return

          // Actualizar stock usando el helper de almacén
          const updatedProduct = updateWarehouseStock(
            productData,
            selectedWarehouse?.id || '',
            -item.quantity // Negativo porque es una salida
          )

          // Guardar en Firestore
          return updateProduct(businessId, item.id, {
            stock: updatedProduct.stock,
            warehouseStocks: updatedProduct.warehouseStocks
          })
        })

      await Promise.all(stockUpdates)

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

      // Mostrar mensaje de éxito con toast
      const documentName = documentType === 'factura' ? 'Factura' : documentType === 'nota_venta' ? 'Nota de Venta' : 'Boleta'
      toast.success(`${documentName} ${numberResult.number} generada exitosamente`, 5000)

      // 7. Recargar productos para actualizar stock
      const productsResult = await getProducts(businessId)
      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }
    } catch (error) {
      console.error('Error al procesar venta:', error)
      toast.error(error.message || 'Error al procesar la venta. Inténtalo nuevamente.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePrintTicket = async () => {
    const isNative = Capacitor.isNativePlatform()

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
  }

  const handleSendWhatsApp = async () => {
    console.log('=== handleSendWhatsApp llamado ===')
    console.log('lastInvoiceData:', lastInvoiceData)
    console.log('companySettings:', companySettings)

    if (!lastInvoiceData) {
      console.error('No hay datos de factura')
      toast.error('No hay datos de factura disponibles')
      return
    }

    try {
      // Verificar si está en plataforma nativa
      const { Capacitor } = await import('@capacitor/core')
      const isNative = Capacitor.isNativePlatform()
      console.log('isNative:', isNative)

      if (!isNative) {
        // En WEB - Detectar si es móvil o escritorio
        const isMobileWeb = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        console.log('isMobileWeb:', isMobileWeb)

        const phone = lastInvoiceData.customer?.phone || customerData.phone
        console.log('Teléfono del cliente:', phone)

        if (!phone) {
          toast.error('El cliente no tiene un número de teléfono registrado')
          return
        }

        const cleanPhone = phone.replace(/\D/g, '')
        const docTypeName = lastInvoiceData.documentType === 'factura' ? 'Factura' :
                           lastInvoiceData.documentType === 'boleta' ? 'Boleta' : 'Nota de Venta'
        const customerName = lastInvoiceData.customer?.name || 'Cliente'

        if (isMobileWeb && navigator.share) {
          // MÓVIL WEB - Usar Share API nativo del navegador
          try {
            toast.info('Generando PDF...')

            // Generar PDF como blob
            const pdfBlob = await getInvoicePDFBlob(lastInvoiceData, companySettings)
            const fileName = `${docTypeName}_${lastInvoiceData.number.replace(/\//g, '-')}.pdf`

            // Crear archivo para compartir
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' })

            const shareData = {
              title: `${docTypeName} ${lastInvoiceData.number}`,
              text: `Hola ${customerName}, se adjunta su comprobante de pago. Gracias por su compra.\n\n${companySettings?.businessName || 'Tu Empresa'}`,
              files: [file]
            }

            // Verificar si el navegador soporta compartir archivos
            if (navigator.canShare && navigator.canShare(shareData)) {
              await navigator.share(shareData)
              toast.success('Compartido exitosamente')
            } else {
              // Fallback: descargar PDF y abrir WhatsApp
              await generateInvoicePDF(lastInvoiceData, companySettings)
              toast.success('PDF descargado')

              const message = `Hola ${customerName}, se adjunta su comprobante de pago. Gracias por su compra.`
              const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`

              setTimeout(() => {
                window.open(url, '_blank')
                toast.success('Abriendo WhatsApp...')
              }, 500)
            }
          } catch (error) {
            console.error('Error al compartir:', error)
            // Si el usuario cancela o hay error, fallback a WhatsApp Web
            if (error.name !== 'AbortError') {
              toast.error('Error al compartir. Abriendo WhatsApp...')
              const message = `Hola ${customerName}, se adjunta su comprobante de pago. Gracias por su compra.`
              const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
              window.open(url, '_blank')
            }
          }
          return
        }

        // ESCRITORIO WEB - Descargar PDF y abrir WhatsApp Web con mensaje corto
        toast.info('Generando PDF...')
        try {
          await generateInvoicePDF(lastInvoiceData, companySettings)
          toast.success('PDF descargado')
        } catch (error) {
          console.error('Error generando PDF:', error)
          toast.error('Error al generar el PDF')
        }

        // Mensaje corto para escritorio
        const message = `Hola ${customerName}, se adjunta su comprobante de pago. Gracias por su compra.`
        const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`

        // Pequeño delay para que el usuario vea el PDF descargado antes de abrir WhatsApp
        setTimeout(() => {
          window.open(url, '_blank')
          toast.success('Abriendo WhatsApp...')
        }, 500)

        return
      }

      // En móvil nativo, compartir PDF
      toast.info('Generando PDF...')

      // Generar el PDF como blob
      const pdfBlob = await getInvoicePDFBlob(lastInvoiceData, companySettings)

      // Convertir Blob a base64
      const reader = new FileReader()
      reader.readAsDataURL(pdfBlob)

      await new Promise((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64Data = reader.result.split(',')[1]

            // Crear nombre de archivo
            const docTypeName = lastInvoiceData.documentType === 'factura' ? 'Factura' :
                               lastInvoiceData.documentType === 'boleta' ? 'Boleta' : 'NotaVenta'
            const fileName = `${docTypeName}_${lastInvoiceData.number.replace(/\//g, '-')}.pdf`

            // Guardar archivo temporalmente
            const savedFile = await Filesystem.writeFile({
              path: fileName,
              data: base64Data,
              directory: Directory.Cache,
            })

            console.log('Archivo guardado:', savedFile.uri)

            // Crear mensaje
            const customerName = lastInvoiceData.customer?.name || 'Cliente'
            const total = formatCurrency(lastInvoiceData.total)

            const message = `Hola ${customerName},

Gracias por tu compra. Adjunto encontrarás tu ${docTypeName}.

${docTypeName}: ${lastInvoiceData.number}
Total: ${total}

${companySettings?.businessName || 'Tu Empresa'}`

            // Compartir usando Capacitor Share
            await Share.share({
              title: `${docTypeName} ${lastInvoiceData.number}`,
              text: message,
              url: savedFile.uri,
              dialogTitle: 'Compartir comprobante',
            })

            toast.success('PDF compartido exitosamente')
            resolve()
          } catch (error) {
            console.error('Error al compartir:', error)
            reject(error)
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

    if (warehouseStock < 10) {
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
            <div className="flex gap-2">
              {companySettings?.allowCustomProducts && (
                <Button onClick={() => setShowCustomProductModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Producto Personalizado
                </Button>
              )}
              <Button variant="outline" onClick={clearCart} disabled={cart.length === 0}>
                <Trash2 className="w-4 h-4 mr-2" />
                Limpiar
              </Button>
            </div>
          </div>

          {/* Customer and Document Type Selection */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                {/* Tipo de Comprobante */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Comprobante
                  </label>
                  <Select
                    value={documentType}
                    onChange={e => {
                      setDocumentType(e.target.value)
                      // Resetear pago parcial si cambia de nota de venta a otro tipo
                      if (e.target.value !== 'nota_venta') {
                        setEnablePartialPayment(false)
                        setPartialPaymentAmount('')
                      }
                    }}
                  >
                    <option value="boleta">Boleta de Venta</option>
                    <option value="factura">Factura Electrónica</option>
                    <option value="nota_venta">Nota de Venta</option>
                  </Select>
                </div>

                {/* Fecha de Emisión - Solo si está habilitado en configuración */}
                {businessSettings?.allowCustomEmissionDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Fecha de Emisión
                    </label>
                    <input
                      type="date"
                      value={emissionDate}
                      max={new Date().toISOString().split('T')[0]}
                      min={(() => {
                        const today = new Date()
                        const maxDaysBack = documentType === 'factura' ? 3 : documentType === 'boleta' ? 7 : 30
                        const minDate = new Date(today)
                        minDate.setDate(today.getDate() - maxDaysBack)
                        return minDate.toISOString().split('T')[0]
                      })()}
                      onChange={e => setEmissionDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {documentType === 'factura' && 'Máximo 3 días anteriores según SUNAT'}
                      {documentType === 'boleta' && 'Máximo 7 días anteriores según SUNAT'}
                      {documentType === 'nota_venta' && 'Sin límite de antigüedad'}
                    </p>
                  </div>
                )}

                {/* Tipo de Pedido - Solo para modo restaurant */}
                {businessMode === 'restaurant' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de Pedido
                    </label>
                    <Select
                      value={orderType}
                      onChange={e => setOrderType(e.target.value)}
                      disabled={tableData?.fromTable} // Deshabilitar si viene de mesa
                    >
                      {Object.entries(ORDER_TYPES).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    {tableData?.fromTable && (
                      <p className="text-xs text-gray-500 mt-1">
                        Pedido de Mesa {tableData.tableNumber}
                      </p>
                    )}
                  </div>
                )}

                {/* Selector de Almacén */}
                {warehouses.length > 0 && businessMode !== 'restaurant' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Almacén de Venta
                    </label>
                    <Select
                      value={selectedWarehouse?.id || ''}
                      onChange={e => {
                        const warehouse = warehouses.find(w => w.id === e.target.value)
                        setSelectedWarehouse(warehouse)
                      }}
                    >
                      {warehouses.filter(w => w.isActive).map(warehouse => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      El stock se descontará de este almacén
                    </p>
                  </div>
                )}

                {/* Buscador de Cliente Registrado */}
                {customers.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Buscar Cliente Registrado (Opcional)
                    </label>
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={customerSearchTerm}
                          onChange={e => {
                            setCustomerSearchTerm(e.target.value)
                            setShowCustomerDropdown(true)
                          }}
                          onFocus={() => setShowCustomerDropdown(true)}
                          placeholder="Buscar por nombre o documento..."
                          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Dropdown de resultados */}
                      {showCustomerDropdown && customerSearchTerm && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredCustomers.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500 text-center">
                              No se encontraron clientes
                            </div>
                          ) : (
                            filteredCustomers.map(customer => (
                              <button
                                key={customer.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCustomer(customer)
                                  setCustomerSearchTerm(customer.name || customer.businessName || customer.documentNumber)
                                  setShowCustomerDropdown(false)
                                  setCustomerData({
                                    documentType: customer.documentType || ID_TYPES.DNI,
                                    documentNumber: customer.documentNumber || '',
                                    name: customer.name || '',
                                    businessName: customer.businessName || '',
                                    address: customer.address || '',
                                    email: customer.email || '',
                                    phone: customer.phone || ''
                                  })
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b last:border-b-0"
                              >
                                <div className="font-medium text-gray-900">
                                  {customer.name || customer.businessName || 'Sin nombre'}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {customer.documentNumber}
                                  {customer.email && ` • ${customer.email}`}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {selectedCustomer && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-green-800 font-medium">
                              Cliente seleccionado: {selectedCustomer.name || selectedCustomer.businessName}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-500 mt-2">
                      Busca y selecciona un cliente registrado o deja vacío para ingresar datos manualmente
                    </p>
                  </div>
                )}

                {/* Selector de Vendedor */}
                {sellers.length > 0 && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Vendedor (Opcional)
                    </label>
                    <select
                      value={selectedSeller?.id || ''}
                      onChange={e => {
                        const seller = sellers.find(s => s.id === e.target.value)
                        setSelectedSeller(seller || null)
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Sin vendedor</option>
                      {sellers.map(seller => (
                        <option key={seller.id} value={seller.id}>
                          {seller.code} - {seller.name}
                        </option>
                      ))}
                    </select>

                    {selectedSeller && (
                      <div className="mt-2 p-2 bg-purple-100 border border-purple-200 rounded text-sm">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-purple-600" />
                          <span className="text-purple-800 font-medium">
                            Vendedor: {selectedSeller.code} - {selectedSeller.name}
                          </span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-500 mt-2">
                      Selecciona el vendedor que realizará esta venta
                    </p>
                  </div>
                )}

                {/* Campos para BOLETA */}
                {documentType === 'boleta' && (
                  <>
                    {/* Primera fila: Tipo de Doc y Documento con botón */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Selector de tipo de documento */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tipo de Documento
                        </label>
                        <select
                          value={customerData.documentType}
                          onChange={e => setCustomerData({
                            ...customerData,
                            documentType: e.target.value,
                            documentNumber: '',
                            name: '',
                            businessName: ''
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value={ID_TYPES.DNI}>DNI</option>
                          <option value={ID_TYPES.RUC}>RUC</option>
                          <option value={ID_TYPES.CE}>Carnet de Extranjería</option>
                        </select>
                      </div>

                      {/* Campo de documento con botón de búsqueda */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {customerData.documentType === ID_TYPES.RUC ? 'RUC' : customerData.documentType === ID_TYPES.CE ? 'CE' : 'DNI'}
                        </label>
                        <div className="flex gap-2">
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
                            placeholder={customerData.documentType === ID_TYPES.RUC ? '20123456789' : customerData.documentType === ID_TYPES.CE ? 'CE123456789' : '12345678'}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                            className="flex-shrink-0"
                          >
                            {isLookingUp ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Segunda fila: Nombre / Razón Social */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {customerData.documentType === ID_TYPES.RUC ? 'Razón Social' : 'Nombre'}
                      </label>
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email
                        </label>
                        <input
                          type="email"
                          value={customerData.email}
                          onChange={e => setCustomerData({
                            ...customerData,
                            email: e.target.value
                          })}
                          placeholder="email@ejemplo.com (opcional)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          value={customerData.phone}
                          onChange={e => setCustomerData({
                            ...customerData,
                            phone: e.target.value
                          })}
                          placeholder="987654321 (opcional)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Dirección
                      </label>
                      <input
                        type="text"
                        value={customerData.address}
                        onChange={e => setCustomerData({
                          ...customerData,
                          address: e.target.value
                        })}
                        placeholder="Av. Principal 123 (opcional)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </>
                )}

                {/* Campos para FACTURA */}
                {documentType === 'factura' && (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          RUC <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={11}
                            value={customerData.documentNumber}
                            onChange={e => setCustomerData({
                              ...customerData,
                              documentNumber: e.target.value.replace(/\D/g, '')
                            })}
                            placeholder="20123456789"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleLookupDocument}
                            disabled={isLookingUp || !customerData.documentNumber || customerData.documentNumber.length !== 11}
                            className="flex-shrink-0"
                          >
                            {isLookingUp ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Razón Social <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={customerData.businessName}
                          onChange={e => setCustomerData({
                            ...customerData,
                            businessName: e.target.value
                          })}
                          placeholder="MI EMPRESA SAC"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre Comercial
                      </label>
                      <input
                        type="text"
                        value={customerData.name}
                        onChange={e => setCustomerData({
                          ...customerData,
                          name: e.target.value
                        })}
                        placeholder="Mi Empresa (opcional)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Dirección
                        </label>
                        <input
                          type="text"
                          value={customerData.address}
                          onChange={e => setCustomerData({
                            ...customerData,
                            address: e.target.value
                          })}
                          placeholder="Av. Principal 123, Lima"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          value={customerData.phone}
                          onChange={e => setCustomerData({
                            ...customerData,
                            phone: e.target.value
                          })}
                          placeholder="01-1234567"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={customerData.email}
                        onChange={e => setCustomerData({
                          ...customerData,
                          email: e.target.value
                        })}
                        placeholder="contacto@miempresa.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </>
                )}

                {/* Campos para NOTA DE VENTA */}
                {documentType === 'nota_venta' && (
                  <>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Nota de Venta:</strong> Documento interno para ventas menores. No requiere datos del cliente.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          DNI / RUC
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={11}
                            value={customerData.documentNumber}
                            onChange={e => setCustomerData({
                              ...customerData,
                              documentNumber: e.target.value.replace(/\D/g, '')
                            })}
                            placeholder="12345678 (opcional)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleLookupDocument}
                            disabled={isLookingUp || !customerData.documentNumber || (customerData.documentNumber.length !== 8 && customerData.documentNumber.length !== 11)}
                            className="flex-shrink-0"
                          >
                            {isLookingUp ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nombre / Razón Social
                        </label>
                        <input
                          type="text"
                          value={customerData.name}
                          onChange={e => setCustomerData({
                            ...customerData,
                            name: e.target.value
                          })}
                          placeholder="Cliente (opcional)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar producto por nombre o código..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-base sm:text-lg"
            />
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
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
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

                  return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={isOutOfStock}
                  className={`p-3 sm:p-4 bg-white border-2 rounded-lg transition-all text-left ${
                    isOutOfStock
                      ? 'border-gray-200 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-primary-500 hover:shadow-md'
                  }`}
                >
                  <div className="flex gap-3 h-full">
                    {/* Product Image - Square on the left */}
                    {product.imageUrl && (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    {/* Product Info - Right side */}
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="font-semibold text-gray-900 line-clamp-2 text-sm sm:text-base flex-1">
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
                      </div>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <p className="text-base sm:text-lg font-bold text-primary-600">
                          {product.hasVariants
                            ? formatCurrency(product.basePrice)
                            : formatCurrency(product.price)
                          }
                        </p>
                        {!product.hasVariants && getStockBadge(product)}
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
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Carrito
                </CardTitle>
                {cart.length > 0 && (
                  <span className="bg-primary-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {cart.length}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-4 sm:p-6">
              {/* Cart Items */}
              <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar mb-4 max-h-[300px] lg:max-h-[400px]">
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
                                  /* Botones +/- para productos normales */
                                  <>
                                    <button
                                      onClick={() => updateQuantity(itemId, -1)}
                                      className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <span className="w-8 text-center font-semibold text-sm">
                                      {item.quantity}
                                    </span>
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

                {/* Solo mostrar IGV si la tasa es mayor que 0 */}
                {taxConfig.igvRate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">IGV ({taxConfig.igvRate}%):</span>
                    <span className="font-medium">{formatCurrency(amounts.igv)}</span>
                  </div>
                )}
                {/* Mostrar badge si está exonerado de IGV */}
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
                  {/* Si es venta al crédito (pago adelantado = 0), mostrar mensaje en lugar de métodos de pago */}
                  {enablePartialPayment && amountToPay === 0 ? (
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
                disabled={cart.length === 0 || isProcessing || lastInvoiceData !== null}
                className="w-full mt-4 h-12 sm:h-14 text-base sm:text-lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : lastInvoiceData !== null ? (
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
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Imprimir Ticket
                    </Button>
                    <Button
                      onClick={() => {
                        try {
                          generateInvoicePDF(lastInvoiceData, companySettings)
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
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Enviar por WhatsApp
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
          setCustomProduct({ name: '', price: '', quantity: 1 })
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
                min="1"
                value={customProduct.quantity}
                onChange={(e) => setCustomProduct({ ...customProduct, quantity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
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
                    {formatCurrency(parseFloat(customProduct.price) * (parseInt(customProduct.quantity) || 1))}
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
                setCustomProduct({ name: '', price: '', quantity: 1 })
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
                              variant.stock > 10
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
