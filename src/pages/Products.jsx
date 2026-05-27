import React, { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Edit, Trash2, Package, Loader2, AlertTriangle, DollarSign, Folder, FolderPlus, Tag, X, FileSpreadsheet, Upload, ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Warehouse, CheckSquare, Square, CheckCheck, FolderEdit, Calendar, Eye, EyeOff, Truck, ArrowUpDown, ArrowUp, ArrowDown, Image, Camera, Pill, ScanBarcode, Store, Copy, MoreVertical, SlidersHorizontal, Check, Printer, Layers, Boxes } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useAppContext } from '@/hooks/useAppContext'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useHidePrivateData } from '@/hooks/useHidePrivateData'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { productSchema } from '@/utils/schemas'
import { formatCurrency, formatProductPrice, applyMarginToCost } from '@/lib/utils'
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductCategories,
  saveProductCategories,
  getProductBrands,
  saveProductBrands,
  getNextSkuNumber,
} from '@/services/firestoreService'
import { exportProductsForImport, exportProductsForRappi } from '@/services/productExportService'
import ImportProductsModal from '@/components/ImportProductsModal'
import { getWarehouses, updateWarehouseStock, getDefaultWarehouse, createWarehouse, createStockMovement } from '@/services/warehouseService'
import { getActiveBranches } from '@/services/branchService'
import ProductModifiersSection from '@/components/ProductModifiersSection'
import { uploadProductImage, deleteProductImage, createImagePreview, revokeImagePreview } from '@/services/productImageService'
import ProductImagesManager, { productToImageItems, resolveImageUrls } from '@/components/product/ProductImagesManager'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { printProductBarcodes, isPrinterReady } from '@/services/thermalPrinterService'

// Unidades de medida SUNAT (Catálogo N° 03 - UN/ECE Rec 20)
const UNITS = [
  { value: 'NIU', label: 'Unidad' },
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
  { value: 'HUR', label: 'Hora' },
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

// Helper functions for category hierarchy
const migrateLegacyCategories = (cats) => {
  if (!cats || cats.length === 0) return []
  // Si ya son objetos con id, devolverlos tal cual
  if (typeof cats[0] === 'object' && cats[0].id) return cats
  // Migrar strings antiguos a nuevo formato
  return cats.map((name) => ({
    id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name,
    parentId: null,
  }))
}

const getRootCategories = (categories) => {
  return categories.filter(cat => cat.parentId === null).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
}

const getSubcategories = (categories, parentId) => {
  return categories.filter(cat => cat.parentId === parentId).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
}

const getCategoryPath = (categories, categoryId) => {
  const category = categories.find(cat => cat.id === categoryId)
  if (!category) return ''

  if (category.parentId === null) {
    return category.name
  }

  const parent = getCategoryPath(categories, category.parentId)
  return parent ? `${parent} > ${category.name}` : category.name
}

const getCategoryById = (categories, id) => {
  return categories.find(cat => cat.id === id)
}

// Función para obtener el stock real de un producto (suma de warehouseStocks o stock general)
const getRealStockValue = (product) => {
  // Productos con variantes: sumar stock de todas las variantes
  if (product.hasVariants && product.variants?.length > 0) {
    return product.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
  }

  // Si no tiene control de stock, retornar null
  if (product.stock === null || product.stock === undefined) {
    return null
  }

  // Si tiene warehouseStocks, usar la suma
  const warehouseStocks = product.warehouseStocks || []
  if (warehouseStocks.length > 0) {
    const warehouseTotal = warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
    // Retornar el mayor entre la suma de almacenes y el stock general
    return Math.max(warehouseTotal, product.stock || 0)
  }

  // Si no tiene warehouseStocks, usar stock general
  return product.stock || 0
}

// Formatea un valor de stock para mostrar: enteros como tal, decimales redondeados a 2.
// Evita basura tipo "2.629999999999999" en pantalla.
const formatStock = (value) => {
  if (value === null || value === undefined || value === '') return value
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return Number.isInteger(n) ? n : parseFloat(n.toFixed(2))
}

// Get all descendant category IDs (children, grandchildren, etc.)
const getAllDescendantCategoryIds = (categories, parentId) => {
  const descendants = []
  const children = categories.filter(cat => cat.parentId === parentId)

  for (const child of children) {
    descendants.push(child.id)
    // Recursively get descendants of this child
    descendants.push(...getAllDescendantCategoryIds(categories, child.id))
  }

  return descendants
}

// Helper function to get expiration status
const getExpirationStatus = (expirationDate) => {
  if (!expirationDate) return null

  const expDate = expirationDate.toDate ? expirationDate.toDate() : new Date(expirationDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  expDate.setHours(0, 0, 0, 0)

  const diffTime = expDate - today
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { status: 'expired', days: Math.abs(diffDays), color: 'red' }
  } else if (diffDays <= 7) {
    return { status: 'warning', days: diffDays, color: 'yellow' }
  } else {
    return { status: 'ok', days: diffDays, color: 'green' }
  }
}

export default function Products() {
  const { user, isDemoMode, demoData, getBusinessId, businessMode, hasFeature, businessSettings } = useAppContext()
  const appNavigate = useAppNavigate()
  const hidePrivateData = useHidePrivateData()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [branches, setBranches] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showExpiringOnly, setShowExpiringOnly] = useState(false) // Filtro de vencimiento
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [deletingProduct, setDeletingProduct] = useState(null)
  const [viewingProduct, setViewingProduct] = useState(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(null) // ID del producto con menú abierto
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, left: 0, openUp: false }) // Posición del menú
  const [isSaving, setIsSaving] = useState(false)
  const [isScanningBarcode, setIsScanningBarcode] = useState(false)
  const [isScanningSearch, setIsScanningSearch] = useState(false)
  // Códigos de barra adicionales (mismo producto, múltiples EANs)
  const [extraBarcodes, setExtraBarcodes] = useState([])
  const [newBarcodeInput, setNewBarcodeInput] = useState('')
  const [isScanningExtraBarcode, setIsScanningExtraBarcode] = useState(false)
  const [noStock, setNoStock] = useState(false)
  const [allowDecimalQuantity, setAllowDecimalQuantity] = useState(false) // Venta por peso
  const [trackExpiration, setTrackExpiration] = useState(false) // Control de vencimiento
  const [trackSerials, setTrackSerials] = useState(false) // Control de N° de serie
  const [catalogVisible, setCatalogVisible] = useState(false) // Visible en catálogo público
  // Auto-precio según cantidad (opt-in por producto). Si está ON, el POS no
  // muestra el modal de elegir precio y el precio se ajusta solo al cambiar
  // la cantidad en el carrito, usando los mínimos configurados por producto.
  const [useAutoPriceByQty, setUseAutoPriceByQty] = useState(false)
  const [priceMinQtys, setPriceMinQtys] = useState({ price2: '', price3: '', price4: '' })
  const [catalogHidePrice, setCatalogHidePrice] = useState(false) // Ocultar precio en catálogo
  const [catalogComparePrice, setCatalogComparePrice] = useState('') // Precio tachado en catálogo
  const [isFeatured, setIsFeatured] = useState(false) // Producto destacado en catálogo
  const [expandedProduct, setExpandedProduct] = useState(null)
  const [warehouseInitialStocks, setWarehouseInitialStocks] = useState({}) // Stock inicial por almacén { warehouseId: quantity }

  // Edición manual de stock desde el modal — toggle businessSettings.enableManualStockEdit.
  // Map { `${warehouseId}|${variantSku||''}` -> stringValue } con los valores tipeados por el
  // usuario. Se inicializa con los stocks actuales al abrir el modal en modo edición y se
  // compara contra ellos en el submit para calcular deltas y generar stockMovements.
  const [stockEdits, setStockEdits] = useState({})
  const stockEditKey = (warehouseId, variantSku) => `${warehouseId}|${variantSku || ''}`

  // Paginación en cliente
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)

  // Ordenamiento
  const [sortField, setSortField] = useState('name') // 'name', 'code', 'price', 'stock', 'category'
  const [sortDirection, setSortDirection] = useState('asc') // 'asc' o 'desc'

  // Presentaciones y Variantes
  const [showPresentations, setShowPresentations] = useState(false)
  const [hasVariants, setHasVariants] = useState(false)
  const [variantAttributes, setVariantAttributes] = useState([]) // ["size", "color"]
  const [newAttributeName, setNewAttributeName] = useState('')
  const [variants, setVariants] = useState([]) // [{ sku, attributes: {size: "M", color: "Red"}, price, stock }]
  const [newVariant, setNewVariant] = useState({ sku: '', barcode: '', attributes: {}, price: '', price2: '', price3: '', price4: '', stock: '' })
  const [variantWarehouseId, setVariantWarehouseId] = useState('') // almacén destino para todas las variantes
  const [editingVariantIndex, setEditingVariantIndex] = useState(null)
  const [editingVariant, setEditingVariant] = useState(null)

  // Category management state
  const [categories, setCategories] = useState([])
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [parentCategoryId, setParentCategoryId] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [categoryShowInCatalog, setCategoryShowInCatalog] = useState(true)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')
  // Categoría raíz cuya rama de subcategorías está expandida. Una sola raíz expandida
  // a la vez. Click en una raíz: filtra + expande. Click en una subcategoría: filtra
  // y mantiene la raíz expandida. Click en "Todas"/"Sin categoría": colapsa todo.
  const [expandedRootCategoryId, setExpandedRootCategoryId] = useState(null)
  // Colapso global de TODA la sección de chips de categorías (para ganar espacio
  // cuando hay muchas categorías). Se persiste en localStorage.
  const [categoriesSectionCollapsed, setCategoriesSectionCollapsed] = useState(() => {
    try {
      return localStorage.getItem('products_categories_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const toggleCategoriesSection = () => {
    setCategoriesSectionCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('products_categories_collapsed', String(next)) } catch (e) { void e }
      return next
    })
  }
  // Filtro por marca (independiente del filtro de categoría — se combinan).
  const [selectedBrandFilter, setSelectedBrandFilter] = useState('all')
  const [brandsSectionCollapsed, setBrandsSectionCollapsed] = useState(() => {
    try {
      return localStorage.getItem('products_brands_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const toggleBrandsSection = () => {
    setBrandsSectionCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('products_brands_collapsed', String(next)) } catch (e) { void e }
      return next
    })
  }
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  const [isDeletingCategories, setIsDeletingCategories] = useState(false)

  // Brand management state (mismo patrón que categorías, sin jerarquía).
  const [brands, setBrands] = useState([])
  const [isBrandsModalOpen, setIsBrandsModalOpen] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [editingBrand, setEditingBrand] = useState(null)
  const [isSavingBrand, setIsSavingBrand] = useState(false)
  const [isMigratingBrands, setIsMigratingBrands] = useState(false)
  const [showMigrationPreview, setShowMigrationPreview] = useState(false)
  // Set de keys (normalizadas) seleccionadas para migrar.
  const [migrationSelected, setMigrationSelected] = useState(new Set())

  // Import modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)


  // Bulk actions state
  const [selectedProducts, setSelectedProducts] = useState(new Set())
  const [bulkActionModalOpen, setBulkActionModalOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState(null) // 'delete', 'changeCategory', 'toggleActive'
  const [bulkCategoryChange, setBulkCategoryChange] = useState('')
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)

  // Estado para impresión de etiquetas
  const [labelModalOpen, setLabelModalOpen] = useState(false)
  const [labelQuantities, setLabelQuantities] = useState({}) // { productId: cantidad }
  const [labelSize, setLabelSize] = useState('30x20') // Tamaño de etiqueta seleccionado
  // Estado para impresión en ticketera térmica (POS, 58/80mm con barcode nativo ESC/POS)
  const [thermalPaperWidth, setThermalPaperWidth] = useState(58)
  const [printingThermal, setPrintingThermal] = useState(false)

  // Modifiers state (for restaurant mode)
  const [modifiers, setModifiers] = useState([])

  // Tax affectation state (IGV: Gravado, Exonerado, Inafecto)
  const [taxAffectation, setTaxAffectation] = useState('10') // '10' = Gravado (default), '20' = Exonerado, '30' = Inafecto
  const [igvRate, setIgvRate] = useState(businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18)
  const taxType = businessSettings?.emissionConfig?.taxConfig?.taxType || (businessSettings?.emissionConfig?.taxConfig?.igvExempt ? 'exempt' : 'standard')

  // Pharmacy mode state
  const [pharmacyData, setPharmacyData] = useState({
    genericName: '',           // Denominación Común Internacional (DCI)
    concentration: '',         // Ej: 500mg, 100ml
    presentation: '',          // Ej: Tabletas x 100, Jarabe 120ml
    laboratoryId: '',          // ID del laboratorio
    laboratoryName: '',        // Nombre del laboratorio (para mostrar)
    marca: '',                 // Marca del producto (back-compat texto libre)
    brandId: '',               // Marca administrada (ID)
    batchNumber: '',           // Número de lote
    activeIngredient: '',      // Principio activo
    therapeuticAction: '',     // Acción terapéutica (Analgésico, Antibiótico, etc.)
    saleCondition: 'sin_receta', // sin_receta | con_receta | receta_retenida
    requiresPrescription: false,
    sanitaryRegistry: '',      // Registro sanitario DIGEMID
    location: '',              // Ubicación en estante/anaquel
  })
  const [laboratories, setLaboratories] = useState([]) // Lista de laboratorios para el select

  // Product location state (for enableProductLocation preference, works in all modes)
  const [productLocation, setProductLocation] = useState('')

  // Presentations state (venta por presentaciones: unidad, pack, caja, etc.)
  const [presentations, setPresentations] = useState([])
  const [newPresentation, setNewPresentation] = useState({ name: '', factor: '', price: '' })

  // Image upload state
  const [productImages, setProductImages] = useState([]) // Array de {id, file, previewUrl, uploadedUrl}
  const [uploadingImage, setUploadingImage] = useState(false)

  // Column visibility preferences (persisted in localStorage)
  const [columnPreferences, setColumnPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('products_visible_columns')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [columnSelectorOpen, setColumnSelectorOpen] = useState(false)

  // Verificar si las imágenes de productos están habilitadas (por admin O por preferencia del usuario)
  const canUseProductImages = hasFeature('productImages') || businessSettings?.enableProductImages

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: '',
      sku: '',
      name: '',
      description: '',
      price: '',
      price2: '',
      price3: '',
      price4: '',
      priceUSD: '',
      cost: '',
      weight: '',
      unit: 'NIU',
      category: '',
      stock: '',
      noStock: false,
      hasVariants: false,
      trackExpiration: false,
      trackSerials: false,
      expirationDate: '',
    },
  })

  // Cargar productos, almacenes y sucursales
  useEffect(() => {
    loadProducts()
    loadWarehouses()
    loadBranches()
    // Cargar laboratorios solo en modo farmacia
    if (businessMode === 'pharmacy') {
      loadLaboratories()
    }
  }, [user, businessMode])

  // Auto-cálculo de precios por margen sobre costo (Configuración > Ventas).
  // - Al abrir el modal: hidrata los precios habilitados que estén VACÍOS (no
  //   sobrescribe valores ya guardados en el producto).
  // - Cuando el usuario cambia el costo: recalcula SIEMPRE los precios habilitados
  //   (sí sobrescribe — es el efecto esperado de "margen automático").
  // Solo aplica cuando priceCalculationBase === 'cost'. En modo 'public' los
  // precios 2/3/4 son derivados al servir y no requieren hidratación en el modal.
  const watchedCost = watch('cost')
  const autoMarginHydratedRef = useRef(false)
  const autoMarginPrevCostRef = useRef(null)
  useEffect(() => {
    if (!isModalOpen) {
      autoMarginHydratedRef.current = false
      autoMarginPrevCostRef.current = null
      return
    }
    if (businessSettings?.priceCalculationBase !== 'cost') return

    const isFirstRender = !autoMarginHydratedRef.current
    const costChanged = watchedCost !== autoMarginPrevCostRef.current
    autoMarginHydratedRef.current = true
    autoMarginPrevCostRef.current = watchedCost

    if (!isFirstRender && !costChanged) return

    const cost = parseFloat(watchedCost) || 0
    if (cost <= 0) return

    const PRICE_FIELDS = [
      { key: 'price1', field: 'price' },
      { key: 'price2', field: 'price2' },
      { key: 'price3', field: 'price3' },
      { key: 'price4', field: 'price4' },
    ]

    PRICE_FIELDS.forEach(({ key, field }) => {
      const pctConfig = businessSettings?.pricePercentages?.[key]
      if (!pctConfig?.enabled || !(pctConfig.discount > 0)) return

      // En el primer render del modal NO sobrescribimos valores ya guardados
      // (el producto ya tiene precios manuales que el usuario quiere conservar).
      if (isFirstRender) {
        const currentValue = watch(field)
        if (currentValue && parseFloat(currentValue) > 0) return
      }

      const formula = businessSettings?.marginFormula === 'margin' ? 'margin' : 'markup'
      const newPrice = applyMarginToCost(cost, pctConfig.discount, formula)
      setValue(field, String(newPrice))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCost, isModalOpen, businessSettings])

  const loadProducts = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        // Cargar datos de demo
        setProducts(demoData.products || [])
        setCategories(demoData.categories || [])
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      const [productsResult, categoriesResult, brandsResult] = await Promise.all([
        getProducts(businessId),
        getProductCategories(businessId),
        getProductBrands(businessId),
      ])

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      } else {
        console.error('Error al cargar productos:', productsResult.error)
      }

      if (categoriesResult.success) {
        const migratedCategories = migrateLegacyCategories(categoriesResult.data || [])
        setCategories(migratedCategories)
      } else {
        console.error('Error al cargar categorías:', categoriesResult.error)
      }

      if (brandsResult.success) {
        setBrands(brandsResult.data || [])
      } else {
        console.error('Error al cargar marcas:', brandsResult.error)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadWarehouses = async () => {
    if (!user?.uid) return

    try {
      if (isDemoMode) {
        // En modo demo, usar almacenes de ejemplo
        setWarehouses([
          { id: '1', name: 'Almacén Principal', isDefault: true, isActive: true },
          { id: '2', name: 'Almacén Secundario', isDefault: false, isActive: true },
          { id: '3', name: 'Almacén de Belleza', isDefault: false, isActive: true },
        ])
        return
      }

      const businessId = getBusinessId()
      const result = await getWarehouses(businessId)

      if (result.success) {
        setWarehouses(result.data || [])
        // Preseleccionar almacén principal para variantes
        const defaultWh = (result.data || []).find(w => w.isDefault)
        if (defaultWh && !variantWarehouseId) {
          setVariantWarehouseId(defaultWh.id)
        }
      } else {
        console.error('Error al cargar almacenes:', result.error)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  // Cargar sucursales
  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return

    try {
      const businessId = getBusinessId()
      const result = await getActiveBranches(businessId)

      if (result.success) {
        setBranches(result.data || [])
      } else {
        console.error('Error al cargar sucursales:', result.error)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  // Cargar laboratorios para modo farmacia
  const loadLaboratories = async () => {
    if (!user?.uid) return

    try {
      const businessId = getBusinessId()
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

  const openCreateModal = () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingProduct(null)
    setNoStock(false)
    setAllowDecimalQuantity(false)
    setTrackExpiration(false)
    setCatalogVisible(false)
    setCatalogHidePrice(false)
    setCatalogComparePrice('')
    setUseAutoPriceByQty(false)
    setPriceMinQtys({ price2: '', price3: '', price4: '' })
    setHasVariants(false)
    setVariantAttributes([])
    setVariants([])
    setVariantWarehouseId('')
    setNewAttributeName('')
    setNewVariant({ sku: '', barcode: '', attributes: {}, price: '', price2: '', price3: '', price4: '', stock: '' })
    // Resetear stocks iniciales por almacén
    setWarehouseInitialStocks({})
    reset({
      code: '',
      sku: '',
      name: '',
      description: '',
      marca: '',
      brandId: '',
      price: '',
      priceUSD: '',
      cost: '',
      weight: '',
      unit: 'NIU',
      category: '',
      stock: '',
      noStock: false,
      hasVariants: false,
      trackExpiration: false,
      trackSerials: false,
      expirationDate: '',
    })
    setTrackSerials(false)
    setModifiers([]) // Limpiar modificadores
    setPresentations([]) // Limpiar presentaciones
    setShowPresentations(false)
    setNewPresentation({ name: '', factor: '', price: '' })
    setTaxAffectation('10') // Default: Gravado
    setIgvRate(businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18)
    // Resetear datos de farmacia
    setPharmacyData({
      genericName: '',
      concentration: '',
      presentation: '',
      laboratoryId: '',
      laboratoryName: '',
      marca: '',
      brandId: '',
      batchNumber: '',
      activeIngredient: '',
      therapeuticAction: '',
      saleCondition: 'sin_receta',
      requiresPrescription: false,
      sanitaryRegistry: '',
      location: '',
    })
    setProductLocation('')
    setExtraBarcodes([])
    setNewBarcodeInput('')
    setIsModalOpen(true)
  }

  const openEditModal = product => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingProduct(product)
    // Para productos con variantes, siempre manejan stock (trackStock = true)
    // Para otros productos, usar el campo trackStock guardado en lugar de inferir del stock
    const hasNoStock = product.hasVariants ? false : (product.trackStock === false)
    setNoStock(hasNoStock)

    // Set decimal quantity state (venta por peso)
    setAllowDecimalQuantity(product.allowDecimalQuantity || false)

    // Set expiration tracking state
    const hasExpiration = product.trackExpiration || false
    setTrackExpiration(hasExpiration)

    // Set serial tracking state
    setTrackSerials(product.trackSerials || false)

    // Load variant data if product has variants
    const productHasVariants = product.hasVariants || false
    setHasVariants(productHasVariants)
    setVariantAttributes(product.variantAttributes || [])
    setVariants(product.variants || [])
    setNewAttributeName('')
    setNewVariant({ sku: '', barcode: '', attributes: {}, price: '', price2: '', price3: '', price4: '', stock: '' })

    // Pre-seleccionar almacén si las variantes ya tienen warehouseStocks
    if (productHasVariants && product.variants?.length > 0) {
      const firstVariantWithWarehouse = product.variants.find(v => v.warehouseStocks?.length > 0)
      if (firstVariantWithWarehouse?.warehouseStocks?.[0]?.warehouseId) {
        setVariantWarehouseId(firstVariantWithWarehouse.warehouseStocks[0].warehouseId)
      }
    }

    // Load modifiers if product has them (restaurant mode)
    // Asegurar que cada modificador y opción tenga un ID (fix para productos clonados sin IDs)
    setModifiers((product.modifiers || []).map((mod, mi) => ({
      ...mod,
      id: mod.id || `mod-${Date.now()}-${mi}`,
      options: (mod.options || []).map((opt, oi) => ({
        ...opt,
        id: opt.id || `opt-${Date.now()}-${mi}-${oi}`,
      })),
    })))

    // Load presentations if product has them (venta por presentaciones)
    setPresentations(product.presentations || [])
    setShowPresentations((product.presentations || []).length > 0)
    setNewPresentation({ name: '', factor: '', price: '' })

    // Load pharmacy data if exists (pharmacy mode)
    setPharmacyData({
      genericName: product.genericName || '',
      concentration: product.concentration || '',
      presentation: product.presentation || '',
      laboratoryId: product.laboratoryId || '',
      laboratoryName: product.laboratoryName || '',
      marca: product.marca || '',
      brandId: product.brandId || '',
      batchNumber: product.batchNumber || '',
      activeIngredient: product.activeIngredient || '',
      therapeuticAction: product.therapeuticAction || '',
      saleCondition: product.saleCondition || 'sin_receta',
      requiresPrescription: product.requiresPrescription || false,
      sanitaryRegistry: product.sanitaryRegistry || '',
      location: product.location || '',
    })
    setProductLocation(product.location || '')

    // Load tax affectation (default to '10' = Gravado if not set for backwards compatibility)
    setTaxAffectation(product.taxAffectation || '10')
    setIgvRate(product.igvRate ?? (businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18))

    // Load catalog visibility
    setCatalogVisible(product.catalogVisible || false)
    setCatalogHidePrice(product.catalogHidePrice || false)
    setCatalogComparePrice(product.catalogComparePrice?.toString() || '')
    setIsFeatured(product.isFeatured || false)

    // Load auto-precio por cantidad (opt-in por producto)
    setUseAutoPriceByQty(product.useAutoPriceByQty === true)
    setPriceMinQtys({
      price2: product.priceMinQtys?.price2?.toString() || '',
      price3: product.priceMinQtys?.price3?.toString() || '',
      price4: product.priceMinQtys?.price4?.toString() || '',
    })

    // Load product images (multi)
    setProductImages(productToImageItems(product))

    // Format expiration date if exists (from Firestore Timestamp to YYYY-MM-DD)
    let formattedExpirationDate = ''
    if (product.expirationDate) {
      if (typeof product.expirationDate === 'string') {
        formattedExpirationDate = product.expirationDate.split('T')[0]
      } else {
        const expDate = product.expirationDate.toDate ? product.expirationDate.toDate() : new Date(product.expirationDate)
        formattedExpirationDate = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}-${String(expDate.getDate()).padStart(2, '0')}`
      }
    }

    reset({
      code: product.code || '',
      sku: product.sku || '',
      name: product.name,
      description: product.description || '',
      marca: product.marca || '',
      brandId: product.brandId || '',
      price: productHasVariants ? '1' : (product.price?.toString() || ''),
      price2: product.price2?.toString() || '',
      price3: product.price3?.toString() || '',
      price4: product.price4?.toString() || '',
      priceUSD: product.priceUSD != null ? product.priceUSD.toString() : '',
      cost: product.cost?.toString() || '',
      weight: product.weight?.toString() || '',
      unit: product.unit || 'NIU',
      category: product.category || '',
      // Si no tiene initialStock definido, usar 0 (productos creados antes de esta feature o desde compras)
      initialStock: hasNoStock ? '' : (product.initialStock !== undefined && product.initialStock !== null ? product.initialStock.toString() : '0'),
      noStock: hasNoStock,
      hasVariants: productHasVariants,
      trackExpiration: hasExpiration,
      expirationDate: formattedExpirationDate,
      minStock: product.minStock != null ? product.minStock.toString() : '',
    })

    // Cargar códigos de barra adicionales existentes (si los hay)
    setExtraBarcodes(Array.isArray(product.barcodes) ? product.barcodes.filter(Boolean) : [])
    setNewBarcodeInput('')

    // Inicializar stockEdits con los valores actuales por almacén × variante.
    // Esto alimenta el editor manual (toggle businessSettings.enableManualStockEdit).
    const initStock = {}
    const activeWhs = (warehouses || []).filter(w => w.isActive)
    if (productHasVariants && Array.isArray(product.variants)) {
      for (const v of product.variants) {
        for (const wh of activeWhs) {
          const ws = (v.warehouseStocks || []).find(x => x.warehouseId === wh.id)
          initStock[stockEditKey(wh.id, v.sku)] = String(ws?.stock ?? 0)
        }
      }
    } else {
      for (const wh of activeWhs) {
        const ws = (product.warehouseStocks || []).find(x => x.warehouseId === wh.id)
        initStock[stockEditKey(wh.id, null)] = String(ws?.stock ?? 0)
      }
    }
    setStockEdits(initStock)

    setIsModalOpen(true)
  }

  // Clonar producto - copia todos los datos pero crea uno nuevo
  const openCloneModal = product => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    // NO establecemos editingProduct para que se cree como nuevo
    setEditingProduct(null)

    const hasNoStock = product.stock === null || product.stock === undefined
    setNoStock(hasNoStock)
    setAllowDecimalQuantity(product.allowDecimalQuantity || false)

    const hasExpiration = product.trackExpiration || false
    setTrackExpiration(hasExpiration)
    setTrackSerials(product.trackSerials || false)

    const productHasVariants = product.hasVariants || false
    setHasVariants(productHasVariants)
    setVariantAttributes(product.variantAttributes || [])
    // Clonar variantes pero limpiar IDs
    setVariants((product.variants || []).map(({ id, ...rest }) => rest))
    setNewAttributeName('')
    setNewVariant({ sku: '', barcode: '', attributes: {}, price: '', price2: '', price3: '', price4: '', stock: '' })

    // Clonar modificadores con IDs nuevos para evitar conflictos
    setModifiers((product.modifiers || []).map(mod => ({
      ...mod,
      id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      options: (mod.options || []).map(opt => ({
        ...opt,
        id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      })),
    })))

    // Clonar presentaciones (sin el id para evitar undefined en Firestore)
    const clonedPresentations = (product.presentations || []).map(({ id, ...rest }) => rest)
    setPresentations(clonedPresentations)
    setShowPresentations(clonedPresentations.length > 0)
    setNewPresentation({ name: '', factor: '', price: '' })

    // Cargar datos de farmacia si existen
    setPharmacyData({
      genericName: product.genericName || '',
      concentration: product.concentration || '',
      presentation: product.presentation || '',
      laboratoryId: product.laboratoryId || '',
      laboratoryName: product.laboratoryName || '',
      marca: product.marca || '',
      brandId: product.brandId || '',
      batchNumber: '', // Limpiar lote para el producto clonado
      activeIngredient: product.activeIngredient || '',
      therapeuticAction: product.therapeuticAction || '',
      saleCondition: product.saleCondition || 'sin_receta',
      requiresPrescription: product.requiresPrescription || false,
      sanitaryRegistry: product.sanitaryRegistry || '',
      location: product.location || '',
    })
    setProductLocation(product.location || '')

    setTaxAffectation(product.taxAffectation || '10')
    setIgvRate(product.igvRate ?? (businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18))
    setCatalogVisible(product.catalogVisible || false)
    setCatalogHidePrice(product.catalogHidePrice || false)
    setCatalogComparePrice(product.catalogComparePrice?.toString() || '')
    setIsFeatured(product.isFeatured || false)

    // Auto-precio por cantidad (copia configuración del producto duplicado)
    setUseAutoPriceByQty(product.useAutoPriceByQty === true)
    setPriceMinQtys({
      price2: product.priceMinQtys?.price2?.toString() || '',
      price3: product.priceMinQtys?.price3?.toString() || '',
      price4: product.priceMinQtys?.price4?.toString() || '',
    })

    // No copiar las imágenes (el usuario puede agregarlas manualmente)
    setProductImages([])

    // Formatear fecha de expiración si existe
    let formattedExpirationDate = ''
    if (product.expirationDate) {
      if (typeof product.expirationDate === 'string') {
        formattedExpirationDate = product.expirationDate.split('T')[0]
      } else {
        const expDate = product.expirationDate.toDate ? product.expirationDate.toDate() : new Date(product.expirationDate)
        formattedExpirationDate = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}-${String(expDate.getDate()).padStart(2, '0')}`
      }
    }

    // Copia: arrancar sin códigos extra (los reasigna manualmente el usuario)
    setExtraBarcodes([])
    setNewBarcodeInput('')

    reset({
      code: '', // Limpiar código para evitar duplicados
      sku: '', // Limpiar SKU para evitar duplicados
      name: `${product.name} (copia)`, // Agregar indicador de copia
      description: product.description || '',
      marca: product.marca || '',
      brandId: product.brandId || '',
      price: productHasVariants ? '1' : (product.price?.toString() || ''),
      price2: product.price2?.toString() || '',
      price3: product.price3?.toString() || '',
      price4: product.price4?.toString() || '',
      priceUSD: product.priceUSD != null ? product.priceUSD.toString() : '',
      cost: product.cost?.toString() || '',
      weight: product.weight?.toString() || '',
      unit: product.unit || 'NIU',
      category: product.category || '', // Mantener la categoría
      initialStock: '', // Stock inicial vacío para el nuevo producto
      noStock: hasNoStock,
      hasVariants: productHasVariants,
      trackExpiration: hasExpiration,
      expirationDate: formattedExpirationDate,
      minStock: product.minStock != null ? product.minStock.toString() : '',
    })

    setIsModalOpen(true)
    toast.info('Editando copia del producto. Recuerda cambiar el nombre y código.')
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingProduct(null)
    setWarehouseInitialStocks({}) // Limpiar stocks por almacén
    setModifiers([]) // Limpiar modificadores
    setPresentations([]) // Limpiar presentaciones
    setShowPresentations(false)
    setNewPresentation({ name: '', factor: '', price: '' })
    // Limpiar imágenes
    setProductImages([])
    // Limpiar códigos de barra adicionales
    setExtraBarcodes([])
    setNewBarcodeInput('')
    reset()
  }

  const onSubmit = async data => {
    if (!user?.uid) return

    // Establecer isSaving INMEDIATAMENTE para prevenir múltiples clicks
    if (isSaving) return // Prevenir ejecución si ya está guardando
    setIsSaving(true)

    // Validate variants if hasVariants is true
    if (hasVariants && variants.length === 0) {
      toast.error('Debes agregar al menos una variante')
      setIsSaving(false)
      return
    }

    if (hasVariants && variantAttributes.length === 0) {
      toast.error('Debes definir al menos un atributo de variante (ej: talla, color)')
      setIsSaving(false)
      return
    }

    // Validar código de barras duplicado (solo si se ingresó uno).
    // Si está editando y NO cambió el código, saltamos la validación: el código
    // sigue siendo el suyo, no es un cambio. Esto evita que duplicados pre-existentes
    // (creados antes de la validación, o vía importador masivo) bloqueen al usuario
    // que solo quiere actualizar precio/stock.
    if (data.code && data.code.trim()) {
      const codeToCheck = data.code.trim().toUpperCase()
      const originalCode = editingProduct?.code?.trim().toUpperCase() || ''
      const codeChanged = !editingProduct || originalCode !== codeToCheck
      if (codeChanged) {
        const duplicateByCode = products.find(p => {
          if (editingProduct && p.id === editingProduct.id) return false
          return p.code?.trim().toUpperCase() === codeToCheck
        })
        if (duplicateByCode) {
          toast.error(`El código de barras "${data.code}" ya está en uso por el producto "${duplicateByCode.name}"`)
          setIsSaving(false)
          return
        }
      }
    }

    // Validar SKU duplicado (solo si se ingresó uno). Misma lógica que código:
    // si está editando y NO cambió el SKU, saltamos la validación.
    if (data.sku && data.sku.trim()) {
      const skuToCheck = data.sku.trim().toUpperCase()
      const originalSku = editingProduct?.sku?.trim().toUpperCase() || ''
      const skuChanged = !editingProduct || originalSku !== skuToCheck
      if (skuChanged) {
        const duplicateBySku = products.find(p => {
          if (editingProduct && p.id === editingProduct.id) return false
          return p.sku?.trim().toUpperCase() === skuToCheck
        })
        if (duplicateBySku) {
          toast.error(`El SKU "${data.sku}" ya está en uso por el producto "${duplicateBySku.name}"`)
          setIsSaving(false)
          return
        }
      }
    }

    // Validar SKUs duplicados en variantes si hasVariants es true
    if (hasVariants) {
      const skuCounts = {}
      for (const variant of variants) {
        const sku = variant.sku.trim().toUpperCase()
        skuCounts[sku] = (skuCounts[sku] || 0) + 1
        if (skuCounts[sku] > 1) {
          toast.error(`El SKU "${variant.sku}" está duplicado en las variantes`)
          setIsSaving(false)
          return
        }
      }
    }

    try {
      // Si el usuario escribió un código en el input "agregar" sin presionar
      // Enter/+, lo aceptamos automáticamente al guardar para no perderlo.
      const pendingExtra = (newBarcodeInput || '').trim()
      const finalExtraBarcodes = pendingExtra && !extraBarcodes.includes(pendingExtra) && pendingExtra !== (data.code || '').trim()
        ? [...extraBarcodes, pendingExtra]
        : extraBarcodes

      // Si estamos editando un producto cuyos lotes los gestiona el flujo de
      // Compras (tiene batches[] activos), NO debemos sobreescribir los
      // quick-access fields `expirationDate`, `batchNumber` y `trackExpiration`
      // desde este modal — esos los recalcula CreatePurchase derivándolos del
      // batch con vencimiento más cercano. Sobreescribirlos desde acá borraba
      // la info de lote/vencimiento que el usuario había cargado en la compra.
      const hasActiveBatches = !!editingProduct &&
        Array.isArray(editingProduct.batches) &&
        editingProduct.batches.some(b => (Number(b.quantity) || 0) > 0)

      // Build product data based on hasVariants
      const productData = {
        code: data.code || '',
        barcodes: finalExtraBarcodes,
        sku: data.sku || '',
        name: data.name,
        description: data.description || '',
        unit: data.unit,
        category: data.category || '',
        cost: data.cost && data.cost !== '' ? parseFloat(data.cost) : null,
        weight: data.weight && data.weight !== '' ? parseFloat(data.weight) : null,
        hasVariants: hasVariants,
        // Con batches activos, forzar trackExpiration:true (los lotes lo implican)
        trackExpiration: hasActiveBatches ? true : trackExpiration,
        trackSerials: trackSerials,
        // Si hay batches activos, omitir expirationDate del payload — updateDoc
        // hace merge y preserva el valor existente (calculado por Compras).
        ...(hasActiveBatches
          ? {}
          : { expirationDate: trackExpiration && data.expirationDate ? new Date(data.expirationDate) : null }
        ),
        allowDecimalQuantity: allowDecimalQuantity, // Venta por peso (decimales)
        // Stock mínimo por producto para alerta de bajo stock. Si está vacío
        // se guarda null y los lugares que consumen el dato usan el default
        // (3) preservando el comportamiento anterior a esta feature.
        minStock: data.minStock && data.minStock !== '' ? Math.max(0, parseInt(data.minStock)) : null,
        taxAffectation: taxAffectation, // '10' = Gravado, '20' = Exonerado, '30' = Inafecto (SUNAT Catálogo 07)
        ...(taxType === 'standard' && taxAffectation === '10' && { igvRate }), // Per-product IGV rate (18% or 10%)
        catalogVisible: catalogVisible, // Visible en catálogo público
        catalogHidePrice: catalogHidePrice, // Ocultar precio en catálogo (mostrar "Consultar")
        catalogComparePrice: catalogVisible && catalogComparePrice ? parseFloat(catalogComparePrice) : null, // Precio tachado en catálogo
        isFeatured: catalogVisible && isFeatured, // Producto destacado en catálogo
        // Auto-precio según cantidad: opt-in por producto. Si está OFF, el POS
        // muestra el modal de elegir precio como siempre. Si está ON, se ajusta
        // solo según la cantidad usando los mínimos configurados.
        useAutoPriceByQty: useAutoPriceByQty,
        priceMinQtys: useAutoPriceByQty ? (() => {
          const clean = Object.fromEntries(
            ['price2', 'price3', 'price4']
              .map((k) => [k, parseInt(priceMinQtys[k])])
              .filter(([, v]) => Number.isFinite(v) && v >= 1)
          )
          return Object.keys(clean).length > 0 ? clean : null
        })() : null,
        // Marca: si hay brandId administrado, derivamos `marca` (texto) del nombre
        // de la marca. Mantenemos marca como back-compat para reportes/exports viejos.
        ...(businessMode !== 'pharmacy' && (() => {
          const brand = brands.find(b => b.id === data.brandId)
          return {
            brandId: data.brandId || null,
            marca: brand ? brand.name : (data.marca || null),
          }
        })()),
        // Product location (works in all modes when enabled)
        location: businessMode === 'pharmacy' ? (pharmacyData.location || null) : (productLocation || null),
        // Add modifiers if in restaurant mode (only include if exists)
        ...(businessMode === 'restaurant' && modifiers ? { modifiers } : {}),
        // Add presentations if enabled (venta por presentaciones)
        ...(businessSettings?.presentationsEnabled ? { presentations } : {}),
        // Add pharmacy data if in pharmacy mode
        ...(businessMode === 'pharmacy' ? {
          genericName: pharmacyData.genericName || null,
          concentration: pharmacyData.concentration || null,
          presentation: pharmacyData.presentation || null,
          laboratoryId: pharmacyData.laboratoryId || null,
          laboratoryName: pharmacyData.laboratoryName || null,
          // Marca: igual al flujo no-pharmacy, derivamos texto desde brandId si aplica.
          ...((() => {
            const brand = brands.find(b => b.id === pharmacyData.brandId)
            return {
              brandId: pharmacyData.brandId || null,
              marca: brand ? brand.name : (pharmacyData.marca || null),
            }
          })()),
          // Mismo razonamiento que expirationDate: si hay batches activos
          // (lote gestionado por Compras), no tocar batchNumber — preservar
          // el valor del lote más cercano vía merge.
          ...(hasActiveBatches ? {} : { batchNumber: pharmacyData.batchNumber || null }),
          activeIngredient: pharmacyData.activeIngredient || null,
          therapeuticAction: pharmacyData.therapeuticAction || null,
          saleCondition: pharmacyData.saleCondition || 'sin_receta',
          requiresPrescription: pharmacyData.saleCondition !== 'sin_receta',
          sanitaryRegistry: pharmacyData.sanitaryRegistry || null,
        } : {}),
      }

      if (hasVariants) {
        // Product with variants
        productData.variantAttributes = variantAttributes

        // Determinar almacén destino para variantes (usar el seleccionado o el por defecto)
        let targetWarehouseForVariants = variantWarehouseId
        if (!targetWarehouseForVariants && warehouses.length > 0) {
          const defaultWh = warehouses.find(w => w.isDefault && (w.isActive || w.status === 'active'))
          targetWarehouseForVariants = defaultWh?.id || warehouses.find(w => w.isActive || w.status === 'active')?.id || ''
        }

        productData.variants = variants.map(v => {
          const stockValue = v.stock === '' || v.stock === null ? null : (typeof v.stock === 'string' ? parseInt(v.stock) : v.stock)

          // Construir warehouseStocks si hay stock y almacén destino
          let variantWarehouseStocks = v.warehouseStocks || []

          // Asignar warehouseStocks si:
          // 1. Es creación (!editingProduct) y hay stock y almacén, O
          // 2. Es edición y la variante NO tiene warehouseStocks pero se seleccionó un almacén
          const needsWarehouseAssignment =
            (!editingProduct && stockValue && stockValue > 0 && targetWarehouseForVariants) ||
            (editingProduct && (!v.warehouseStocks || v.warehouseStocks.length === 0) && stockValue && stockValue > 0 && targetWarehouseForVariants)

          if (needsWarehouseAssignment) {
            variantWarehouseStocks = [{
              warehouseId: targetWarehouseForVariants,
              stock: stockValue,
              minStock: 0
            }]
          }

          return {
            sku: v.sku,
            attributes: v.attributes,
            price: typeof v.price === 'string' ? parseFloat(v.price) : v.price,
            price2: v.price2 || null,
            price3: v.price3 || null,
            price4: v.price4 || null,
            stock: stockValue,
            warehouseStocks: variantWarehouseStocks,
          }
        })
        // Calculate base price as average of variant prices
        const avgPrice = productData.variants.reduce((sum, v) => sum + v.price, 0) / productData.variants.length
        productData.basePrice = parseFloat(avgPrice.toFixed(2))
        // Don't include single price/stock for variant products
        productData.price = null
        productData.stock = null
        // Precios adicionales se manejan a nivel variante, no producto
        productData.price2 = null
        productData.price3 = null
        productData.price4 = null
        // Productos con variantes siempre manejan stock
        productData.trackStock = true
      } else {
        // Regular product without variants
        productData.price = parseFloat(data.price)

        // Manejar stock e initialStock
        if (noStock) {
          // Producto SIN control de stock (servicios, etc)
          productData.stock = null
          productData.initialStock = null
          productData.trackStock = false // NO controlar stock
          productData.warehouseStocks = [] // Limpiar stocks de almacén
        } else {
          // Producto CON control de stock
          productData.trackStock = true // SÍ controlar stock

          if (editingProduct) {
            // Verificar si el producto antes NO tenía control de stock y ahora SÍ
            const previouslyHadNoStock = editingProduct.stock === null || editingProduct.stock === undefined

            if (previouslyHadNoStock) {
              // Activando control de stock por primera vez - inicializar en 0
              productData.stock = 0
              productData.initialStock = 0
              productData.warehouseStocks = []
            } else {
              // Ya tenía control de stock - mantener stock actual
              // Solo actualizar initialStock si el usuario es business_owner y lo modificó
              if (user?.role === 'business_owner' && data.initialStock !== '') {
                productData.initialStock = parseInt(data.initialStock)
              }
            }
          } else {
            // Al crear, calcular stock total sumando todos los almacenes
            const warehouseStocksArray = Object.entries(warehouseInitialStocks)
              .filter(([_, qty]) => qty && parseInt(qty) > 0)
              .map(([warehouseId, qty]) => ({
                warehouseId,
                stock: parseInt(qty),
                minStock: 0
              }))

            // Si hay stocks por almacén, usar esos
            if (warehouseStocksArray.length > 0) {
              const totalStock = warehouseStocksArray.reduce((sum, ws) => sum + ws.stock, 0)
              productData.stock = totalStock
              productData.initialStock = totalStock
              productData.warehouseStocks = warehouseStocksArray
            } else {
              // Fallback: si no hay almacenes o no se ingresó stock por almacén, usar el campo simple
              const initialStockValue = data.initialStock === '' ? null : parseInt(data.initialStock)
              productData.stock = initialStockValue
              productData.initialStock = initialStockValue
              productData.warehouseStocks = []
            }
          }
        }

        // Clear variant fields
        productData.variantAttributes = []
        productData.variants = []
      }

      // Precios adicionales (mayorista, VIP, etc.) — aplican tanto con como sin variantes
      productData.price2 = data.price2 && data.price2 !== '' ? parseFloat(data.price2) : null
      productData.price3 = data.price3 && data.price3 !== '' ? parseFloat(data.price3) : null
      productData.price4 = data.price4 && data.price4 !== '' ? parseFloat(data.price4) : null

      // Multi-divisa: precio fijo en USD. Solo se persiste si el negocio
      // tiene multi-divisa activada. Para negocios PEN-only siempre null,
      // así no se ensucia el documento con campos que no aplican.
      if (businessSettings?.multiCurrencyEnabled) {
        const usdRaw = data.priceUSD
        const usdVal = usdRaw === '' || usdRaw == null ? null : parseFloat(usdRaw)
        productData.priceUSD = Number.isFinite(usdVal) && usdVal > 0 ? usdVal : null
      } else {
        productData.priceUSD = null
      }

      // Handle product images (multi, máx 5): subir las nuevas, mantener las existentes
      if (canUseProductImages) {
        try {
          const hasPending = productImages.some(img => img.file)
          if (hasPending) setUploadingImage(true)
          const businessId = getBusinessId()
          const tempProductId = editingProduct?.id || `temp_${Date.now()}`
          const urls = await resolveImageUrls(productImages, (file) =>
            uploadProductImage(businessId, tempProductId, file)
          )
          productData.imageUrls = urls
          productData.imageUrl = urls[0] || null
        } catch (imageError) {
          console.error('Error al subir imágenes:', imageError)
          toast.error('Error al subir las imágenes. El producto se guardará sin imagen.')
          productData.imageUrls = []
          productData.imageUrl = null
        } finally {
          setUploadingImage(false)
        }
      }

      let result

      // Ajustes manuales de stock desde el modal (toggle businessSettings.enableManualStockEdit).
      // Si está habilitado y estamos editando un producto sin lotes, construimos la lista
      // de cambios comparando stockEdits (lo tipeado por el usuario) contra el stock actual
      // del editingProduct. Luego se aplican a warehouseStocks ANTES de updateProduct y se
      // generan movements DESPUÉS.
      if (
        editingProduct &&
        businessSettings?.enableManualStockEdit === true &&
        !noStock &&
        !(editingProduct.trackExpiration || (Array.isArray(editingProduct.batches) && editingProduct.batches.length > 0))
      ) {
        const activeWhs = (warehouses || []).filter(w => w.isActive)
        const changes = []
        if (productData.hasVariants && Array.isArray(productData.variants) && productData.variants.length > 0) {
          for (const v of productData.variants) {
            for (const wh of activeWhs) {
              const raw = stockEdits[stockEditKey(wh.id, v.sku)]
              if (raw === undefined || raw === '') continue
              const newVal = parseFloat(raw)
              if (Number.isNaN(newVal)) continue
              const origVariant = (editingProduct.variants || []).find(x => x.sku === v.sku)
              const oldVal = ((origVariant?.warehouseStocks || []).find(x => x.warehouseId === wh.id)?.stock) || 0
              if (newVal === oldVal) continue
              changes.push({ warehouseId: wh.id, variantSku: v.sku, oldStock: oldVal, newStock: newVal })
            }
          }
        } else {
          for (const wh of activeWhs) {
            const raw = stockEdits[stockEditKey(wh.id, null)]
            if (raw === undefined || raw === '') continue
            const newVal = parseFloat(raw)
            if (Number.isNaN(newVal)) continue
            const oldVal = ((editingProduct.warehouseStocks || []).find(x => x.warehouseId === wh.id)?.stock) || 0
            if (newVal === oldVal) continue
            changes.push({ warehouseId: wh.id, variantSku: null, oldStock: oldVal, newStock: newVal })
          }
        }
        if (changes.length > 0) productData._manualStockChanges = changes
      }

      // Ajustes manuales de stock desde el modal (toggle businessSettings.enableManualStockEdit).
      // Llegan en productData._manualStockChanges como [{ warehouseId, variantSku, oldStock, newStock }].
      // Los aplicamos a warehouseStocks ANTES de updateProduct y generamos movements DESPUÉS.
      const manualStockChanges = Array.isArray(productData._manualStockChanges) ? productData._manualStockChanges : []
      delete productData._manualStockChanges

      if (editingProduct && manualStockChanges.length > 0) {
        if (productData.hasVariants && Array.isArray(productData.variants)) {
          productData.variants = productData.variants.map(v => {
            const changes = manualStockChanges.filter(c => c.variantSku === v.sku)
            if (changes.length === 0) return v
            let ws = Array.isArray(v.warehouseStocks) ? [...v.warehouseStocks] : []
            for (const ch of changes) {
              const idx = ws.findIndex(x => x.warehouseId === ch.warehouseId)
              if (idx >= 0) ws[idx] = { ...ws[idx], stock: ch.newStock }
              else ws.push({ warehouseId: ch.warehouseId, stock: ch.newStock, minStock: 0 })
            }
            return { ...v, warehouseStocks: ws, stock: ws.reduce((s, x) => s + (x.stock || 0), 0) }
          })
          productData.stock = productData.variants.reduce((s, v) => s + (v.stock || 0), 0)
        } else {
          let ws = Array.isArray(productData.warehouseStocks) ? [...productData.warehouseStocks] : []
          for (const ch of manualStockChanges) {
            const idx = ws.findIndex(x => x.warehouseId === ch.warehouseId)
            if (idx >= 0) ws[idx] = { ...ws[idx], stock: ch.newStock }
            else ws.push({ warehouseId: ch.warehouseId, stock: ch.newStock, minStock: 0 })
          }
          productData.warehouseStocks = ws
          productData.stock = ws.reduce((s, x) => s + (x.stock || 0), 0)
        }
      }

      if (editingProduct) {
        // Update
        result = await updateProduct(getBusinessId(), editingProduct.id, productData)

        // Crear stockMovements de auditoría por cada cambio manual aplicado.
        // Usamos type='adjustment' y quantity CON signo (delta), igual que el flujo
        // de "Recuento de inventario" — así el resumen Entradas/Salidas/Balance del
        // historial cuadra y el badge aparece como "Ajuste" (no Entrada ni Salida).
        if (result.success && manualStockChanges.length > 0) {
          const businessId = getBusinessId()
          const userName = user?.displayName || user?.email || 'Usuario'
          for (const ch of manualStockChanges) {
            const delta = ch.newStock - ch.oldStock
            if (delta === 0) continue
            const wh = (warehouses || []).find(w => w.id === ch.warehouseId)
            const variantLabel = ch.variantSku ? ` · variante ${ch.variantSku}` : ''
            try {
              await createStockMovement(businessId, {
                productId: editingProduct.id,
                productName: editingProduct.name || '',
                variantSku: ch.variantSku || null,
                warehouseId: ch.warehouseId,
                warehouseName: wh?.name || 'General',
                type: 'adjustment',
                quantity: delta, // CON signo: + entrada, - salida
                previousStock: ch.oldStock,
                newStock: ch.newStock,
                reason: 'Ajuste manual desde edición de producto',
                referenceType: 'manual_adjustment',
                referenceId: editingProduct.id,
                userId: user?.uid,
                userName,
                notes: `Ajuste manual${variantLabel}: ${ch.oldStock} → ${ch.newStock} (${delta > 0 ? '+' : ''}${delta}) por ${userName}`,
              })
            } catch (mvErr) {
              console.error('Error registrando movimiento de ajuste manual:', mvErr)
            }
          }
        }

        // Si es producto con variantes y se seleccionó un almacén, asignar warehouseStocks a variantes que no lo tienen
        if (result.success && productData.hasVariants && productData.variants?.length > 0 && variantWarehouseId) {
          const businessId = getBusinessId()
          const variantsNeedUpdate = productData.variants.some(v =>
            (v.stock > 0 || v.stock === 0) && (!v.warehouseStocks || v.warehouseStocks.length === 0)
          )

          if (variantsNeedUpdate) {
            const updatedVariants = productData.variants.map(v => {
              if (v.warehouseStocks && v.warehouseStocks.length > 0) return v
              const stockVal = v.stock || 0
              return {
                ...v,
                warehouseStocks: stockVal > 0 ? [{ warehouseId: variantWarehouseId, stock: stockVal, minStock: 0 }] : []
              }
            })

            await updateProduct(businessId, editingProduct.id, { variants: updatedVariants })

            // Crear movimientos de stock para las variantes que se asignaron
            for (let i = 0; i < updatedVariants.length; i++) {
              const v = updatedVariants[i]
              if (v.warehouseStocks?.length > 0 && !productData.variants[i].warehouseStocks?.length) {
                const variantLabel = Object.values(v.attributes || {}).join(' / ')
                await createStockMovement(businessId, {
                  productId: editingProduct.id,
                  variantIndex: i,
                  warehouseId: variantWarehouseId,
                  type: 'entry',
                  quantity: v.stock,
                  reason: 'Asignación de almacén',
                  referenceType: 'warehouse_assignment',
                  referenceId: editingProduct.id,
                  userId: user?.uid,
                  variantSku: v.sku,
                  notes: `Asignación de variante ${v.sku} (${variantLabel}) a almacén`
                }).catch(err => console.error('Error movimiento:', err))
              }
            }

            toast.success('Variantes asignadas al almacén seleccionado')
          }
        }
      } else {
        // Create
        result = await createProduct(getBusinessId(), productData)

        // Si el producto tiene stock inicial, registrar movimiento de entrada
        if (result.success && productData.trackStock) {
          const businessId = getBusinessId()

          if (productData.hasVariants && productData.variants?.length > 0) {
            // Productos con variantes: crear movimiento por cada variante con stock
            // Las variantes ya tienen warehouseStocks asignados desde la construcción de productData
            // Solo necesitamos registrar los movimientos de stock inicial

            for (let i = 0; i < productData.variants.length; i++) {
              const variant = productData.variants[i]
              if (variant.stock && variant.stock > 0 && variant.warehouseStocks?.length > 0) {
                const variantLabel = Object.values(variant.attributes || {}).join(' / ')
                const warehouseId = variant.warehouseStocks[0]?.warehouseId

                if (warehouseId) {
                  await createStockMovement(businessId, {
                    productId: result.id,
                    variantIndex: i,
                    warehouseId: warehouseId,
                    type: 'entry',
                    quantity: variant.stock,
                    reason: 'Stock inicial',
                    referenceType: 'initial_stock',
                    referenceId: result.id,
                    userId: user?.uid,
                    notes: `Stock inicial variante: ${variantLabel}`
                  }).catch(err => console.error('Error al registrar movimiento de stock variante:', err))
                }
              }
            }

          } else if (productData.initialStock > 0) {
            // Producto sin variantes
            // Si hay stocks por almacén, crear un movimiento por cada almacén
            if (productData.warehouseStocks && productData.warehouseStocks.length > 0) {
              for (const ws of productData.warehouseStocks) {
                if (ws.stock > 0) {
                  await createStockMovement(businessId, {
                    productId: result.id,
                    warehouseId: ws.warehouseId,
                    type: 'entry',
                    quantity: ws.stock,
                    reason: 'Stock inicial',
                    referenceType: 'initial_stock',
                    referenceId: result.id,
                    userId: user?.uid,
                    notes: 'Ingreso de stock inicial al crear producto'
                  }).catch(err => console.error('Error al registrar movimiento de stock inicial:', err))
                }
              }
            } else {
              // Stock sin almacén específico - usar almacén por defecto
              const defaultWarehouse = await getDefaultWarehouse(businessId)
              await createStockMovement(businessId, {
                productId: result.id,
                warehouseId: defaultWarehouse?.id || '',
                type: 'entry',
                quantity: productData.initialStock,
                reason: 'Stock inicial',
                referenceType: 'initial_stock',
                referenceId: result.id,
                userId: user?.uid,
                notes: 'Ingreso de stock inicial al crear producto'
              }).catch(err => console.error('Error al registrar movimiento de stock inicial:', err))
            }
          }
        }
      }

      if (result.success) {
        toast.success(
          editingProduct
            ? 'Producto actualizado exitosamente'
            : 'Producto creado exitosamente'
        )
        closeModal()
        loadProducts()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al guardar producto:', error)
      toast.error('Error al guardar el producto. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  // Manejo de imágenes: delegado a <ProductImagesManager />.

  const handleDelete = async () => {
    if (!deletingProduct || !user?.uid) return

    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      setDeletingProduct(null)
      return
    }

    setIsSaving(true)
    try {
      const result = await deleteProduct(getBusinessId(), deletingProduct.id)

      if (result.success) {
        toast.success('Producto eliminado exitosamente')
        setDeletingProduct(null)
        loadProducts()
      } else {
        // Mostrar el mensaje específico devuelto por el servicio
        // (ej. "No se puede eliminar... tiene X unidades en stock").
        // Usamos warning en vez de error porque es una restricción esperada, no un fallo del sistema.
        toast.warning(result.error || 'No se pudo eliminar el producto', 6000)
      }
    } catch (error) {
      console.error('Error al eliminar producto:', error)
      toast.error('Error al eliminar el producto. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExportToExcel = async () => {
    try {
      if (products.length === 0) {
        toast.error('No hay productos para exportar');
        return;
      }

      // Exportar en formato compatible con importación
      await exportProductsForImport(products, categories, businessMode);
      toast.success(`${products.length} producto(s) exportado(s) exitosamente. El archivo es compatible con la función de importar.`);
    } catch (error) {
      console.error('Error al exportar productos:', error);
      toast.error('Error al generar el archivo Excel');
    }
  }

  const handleExportForRappi = async () => {
    try {
      if (products.length === 0) {
        toast.error('No hay productos para exportar')
        return
      }
      await exportProductsForRappi(products, categories)
      toast.success(`${products.length} producto(s) exportados para Self Mapping de Rappi`)
    } catch (error) {
      console.error('Error exportando para Rappi:', error)
      toast.error('Error al generar el Excel para Rappi')
    }
  }

  // Función para escanear código de barras
  const handleScanBarcode = async () => {
    const isNativePlatform = Capacitor.isNativePlatform()
    if (!isNativePlatform) {
      toast.info('El escáner de código de barras solo está disponible en la app móvil')
      return
    }

    setIsScanningBarcode(true)

    try {
      // Verificar si el módulo de Google Barcode Scanner está disponible (solo Android)
      if (Capacitor.getPlatform() === 'android') {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
        if (!available) {
          toast.info('Instalando módulo de escáner... Por favor espera')
          await BarcodeScanner.installGoogleBarcodeScannerModule()
          toast.success('Módulo instalado. Intenta escanear de nuevo.')
          setIsScanningBarcode(false)
          return
        }
      }

      // Verificar y solicitar permisos de cámara
      const { camera } = await BarcodeScanner.checkPermissions()

      if (camera !== 'granted') {
        const { camera: newPermission } = await BarcodeScanner.requestPermissions()
        if (newPermission !== 'granted') {
          toast.error('Se requiere permiso de cámara para escanear códigos')
          setIsScanningBarcode(false)
          return
        }
      }

      // Escanear código de barras
      const { barcodes } = await BarcodeScanner.scan()
      await BarcodeScanner.stopScan().catch(() => {})

      if (barcodes && barcodes.length > 0) {
        const scannedCode = barcodes[0].rawValue
        console.log('Código escaneado:', scannedCode)

        // Establecer el código en el formulario
        setValue('code', scannedCode)
        toast.success(`Código escaneado: ${scannedCode}`)
      }
    } catch (error) {
      console.error('Error al escanear:', error)
      await BarcodeScanner.stopScan().catch(() => {})
      if (error.message !== 'User cancelled the scan') {
        toast.error('Error al escanear el código de barras')
      }
    } finally {
      setIsScanningBarcode(false)
    }
  }

  // ---- Códigos de barra adicionales (múltiples EANs por producto) ----
  const addExtraBarcode = (rawCode) => {
    const code = String(rawCode || '').trim()
    if (!code) return
    const principalCode = (watch('code') || '').trim()
    if (code === principalCode) {
      toast.error('Ese código ya está como código principal')
      return
    }
    if (extraBarcodes.includes(code)) {
      toast.error('Ese código ya está agregado')
      return
    }
    setExtraBarcodes(prev => [...prev, code])
    setNewBarcodeInput('')
  }

  const removeExtraBarcode = (code) => {
    setExtraBarcodes(prev => prev.filter(c => c !== code))
  }

  const handleScanExtraBarcode = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.info('El escáner solo está disponible en la app móvil')
      return
    }
    setIsScanningExtraBarcode(true)
    try {
      if (Capacitor.getPlatform() === 'android') {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
        if (!available) {
          toast.info('Instalando módulo de escáner... Por favor espera')
          await BarcodeScanner.installGoogleBarcodeScannerModule()
          toast.success('Módulo instalado. Intenta escanear de nuevo.')
          return
        }
      }
      const { camera } = await BarcodeScanner.checkPermissions()
      if (camera !== 'granted') {
        const { camera: newPermission } = await BarcodeScanner.requestPermissions()
        if (newPermission !== 'granted') {
          toast.error('Se requiere permiso de cámara para escanear')
          return
        }
      }
      const { barcodes } = await BarcodeScanner.scan()
      await BarcodeScanner.stopScan().catch(() => {})
      if (barcodes && barcodes.length > 0) {
        addExtraBarcode(barcodes[0].rawValue)
      }
    } catch (error) {
      console.error('Error al escanear código adicional:', error)
      await BarcodeScanner.stopScan().catch(() => {})
      if (error.message !== 'User cancelled the scan') {
        toast.error('Error al escanear el código de barras')
      }
    } finally {
      setIsScanningExtraBarcode(false)
    }
  }

  // Función para escanear código de barras en la búsqueda
  const handleScanSearch = async () => {
    const isNativePlatform = Capacitor.isNativePlatform()
    if (!isNativePlatform) {
      toast.info('El escáner de código de barras solo está disponible en la app móvil')
      return
    }

    setIsScanningSearch(true)

    try {
      // Verificar si el módulo de Google Barcode Scanner está disponible (solo Android)
      if (Capacitor.getPlatform() === 'android') {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
        if (!available) {
          toast.info('Instalando módulo de escáner... Por favor espera')
          await BarcodeScanner.installGoogleBarcodeScannerModule()
          toast.success('Módulo instalado. Intenta escanear de nuevo.')
          setIsScanningSearch(false)
          return
        }
      }

      // Verificar y solicitar permisos de cámara
      const { camera } = await BarcodeScanner.checkPermissions()

      if (camera !== 'granted') {
        const { camera: newPermission } = await BarcodeScanner.requestPermissions()
        if (newPermission !== 'granted') {
          toast.error('Se requiere permiso de cámara para escanear códigos')
          setIsScanningSearch(false)
          return
        }
      }

      // Escanear código de barras
      const { barcodes } = await BarcodeScanner.scan()
      await BarcodeScanner.stopScan().catch(() => {})

      if (barcodes && barcodes.length > 0) {
        const scannedCode = barcodes[0].rawValue

        // Buscar el producto con ese código (incluye códigos alternativos)
        const foundProduct = products.find(p =>
          p.code === scannedCode ||
          p.sku === scannedCode ||
          (Array.isArray(p.barcodes) && p.barcodes.includes(scannedCode))
        )

        if (foundProduct) {
          setSearchTerm(scannedCode)
          toast.success(`Producto encontrado: ${foundProduct.name}`)
        } else {
          setSearchTerm(scannedCode)
          toast.warning(`No se encontró producto con código: ${scannedCode}`)
        }
      }
    } catch (error) {
      console.error('Error al escanear:', error)
      await BarcodeScanner.stopScan().catch(() => {})
      if (error.message !== 'User cancelled the scan') {
        toast.error('Error al escanear el código de barras')
      }
    } finally {
      setIsScanningSearch(false)
    }
  }

  const handleImportProducts = async (productsToImport, targetWarehouseId = null) => {
    if (!user?.uid) return { success: 0, errors: ['Usuario no autenticado'] }

    const errors = []
    let successCount = 0

    try {
      // Obtener almacenes existentes
      const warehousesResult = await getWarehouses(getBusinessId())
      const existingWarehouses = warehousesResult.success ? warehousesResult.data : []

      // Obtener el almacén destino
      let targetWarehouse = null

      if (targetWarehouseId) {
        // Usar el almacén seleccionado en el modal
        targetWarehouse = existingWarehouses.find(wh => wh.id === targetWarehouseId)
      }

      // Si no se encontró, usar el almacén por defecto
      if (!targetWarehouse) {
        targetWarehouse = existingWarehouses.find(wh => wh.isDefault) || existingWarehouses[0]
      }

      // Si aún no hay almacén, crear uno automáticamente
      if (!targetWarehouse && existingWarehouses.length === 0) {
        console.log('No se encontró ningún almacén, creando almacén principal...')

        const newWarehouse = {
          name: 'Almacén Principal',
          location: 'Principal',
          description: 'Almacén creado automáticamente durante importación de productos',
          isDefault: true,
          isActive: true,
          branchId: null
        }

        const createResult = await createWarehouse(getBusinessId(), newWarehouse)

        if (createResult.success && createResult.id) {
          targetWarehouse = { id: createResult.id, ...newWarehouse, isDefault: true }
          toast.info(`Almacén "Almacén Principal" creado automáticamente`)
          console.log('✅ Almacén creado:', targetWarehouse)
        } else {
          console.error('❌ Error al crear almacén:', createResult.error)
          toast.warning('No se pudo crear almacén automático. Los productos se importarán sin stock asignado.')
        }
      }

      // Crear un mapa de categorías nuevas que se necesitan crear
      const newCategoriesNeeded = new Set()
      const newSubcategoriesNeeded = new Map() // Map<subcategoryName, parentCategoryName>
      const updatedCategories = [...categories]

      // Identificar categorías y subcategorías que no existen
      for (const product of productsToImport) {
        if (product.category && product.category.trim() !== '') {
          const categoryName = product.category.trim()
          // Verificar si la categoría ya existe (por nombre, solo raíz)
          const categoryExists = updatedCategories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase() && !cat.parentId)

          if (!categoryExists) {
            newCategoriesNeeded.add(categoryName)
          }
        }

        if (product.subcategory && product.subcategory.trim() !== '' && product.category && product.category.trim() !== '') {
          const subcategoryName = product.subcategory.trim()
          const parentCategoryName = product.category.trim()
          // Verificar si la subcategoría ya existe bajo esa categoría padre
          const parentCat = updatedCategories.find(cat => cat.name.toLowerCase() === parentCategoryName.toLowerCase() && !cat.parentId)
          if (parentCat) {
            const subExists = updatedCategories.some(cat => cat.name.toLowerCase() === subcategoryName.toLowerCase() && cat.parentId === parentCat.id)
            if (!subExists) {
              newSubcategoriesNeeded.set(`${parentCategoryName}|||${subcategoryName}`, parentCategoryName)
            }
          } else {
            // La categoría padre es nueva, la subcategoría se creará después
            newSubcategoriesNeeded.set(`${parentCategoryName}|||${subcategoryName}`, parentCategoryName)
          }
        }
      }

      // Crear las categorías raíz nuevas
      let categoriesChanged = false
      if (newCategoriesNeeded.size > 0) {
        for (const categoryName of newCategoriesNeeded) {
          const newCategory = {
            id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: categoryName,
            parentId: null,
          }
          updatedCategories.push(newCategory)
        }
        categoriesChanged = true
      }

      // Crear las subcategorías nuevas
      if (newSubcategoriesNeeded.size > 0) {
        for (const [key] of newSubcategoriesNeeded) {
          const [parentCategoryName, subcategoryName] = key.split('|||')
          // Buscar la categoría padre (ya debería existir)
          const parentCat = updatedCategories.find(cat => cat.name.toLowerCase() === parentCategoryName.toLowerCase() && !cat.parentId)
          if (parentCat) {
            // Verificar que no se haya creado ya en esta iteración
            const subExists = updatedCategories.some(cat => cat.name.toLowerCase() === subcategoryName.toLowerCase() && cat.parentId === parentCat.id)
            if (!subExists) {
              const newSubcategory = {
                id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: subcategoryName,
                parentId: parentCat.id,
              }
              updatedCategories.push(newSubcategory)
            }
          }
        }
        categoriesChanged = true
      }

      // Guardar las categorías nuevas en Firestore
      if (categoriesChanged) {
        const totalNew = newCategoriesNeeded.size + newSubcategoriesNeeded.size
        const saveCategoriesResult = await saveProductCategories(getBusinessId(), updatedCategories)
        if (saveCategoriesResult.success) {
          setCategories(updatedCategories)
          toast.info(`${totalNew} categoría(s) creada(s) automáticamente`)
        }
      }

      // Auto-crear MARCAS que no existen (todos los modos)
      // Mismo patrón que laboratorios, pero las marcas viven como array en el
      // doc del business (no en una colección), así que un solo save al final.
      // El parser del Excel (ImportProductsModal) sólo asigna brandId si encuentra
      // match exacto contra marcas existentes; los nombres nuevos quedan como
      // texto en product.marca con brandId=null. Aquí los detectamos, creamos,
      // y reinyectamos brandId para que el reporte de "Ventas por Marca" funcione
      // sin necesidad de migración manual posterior.
      {
        const existingBrandsResult = await getProductBrands(getBusinessId())
        const existingBrands = existingBrandsResult.success ? (existingBrandsResult.data || []) : []
        const brandNameToId = new Map()
        existingBrands.forEach(b => {
          if (b.name) brandNameToId.set(String(b.name).toLowerCase().trim(), b.id)
        })

        // Identificar marcas nuevas en el import (texto sin brandId)
        const newBrandNames = new Set()
        for (const product of productsToImport) {
          if (product.brandId) continue  // ya viene linkeada por el modal
          const text = String(product.marca || '').trim()
          if (text && !brandNameToId.has(text.toLowerCase())) {
            newBrandNames.add(text)
          }
        }

        if (newBrandNames.size > 0) {
          // Generar IDs simples y construir el nuevo array
          const newBrandEntries = Array.from(newBrandNames).map(name => ({
            id: `brand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
          }))
          const updatedBrands = [...existingBrands, ...newBrandEntries]
          const saveResult = await saveProductBrands(getBusinessId(), updatedBrands)
          if (saveResult.success) {
            newBrandEntries.forEach(b => brandNameToId.set(b.name.toLowerCase(), b.id))
            setBrands(updatedBrands)
            toast.info(`${newBrandNames.size} marca(s) creada(s) automáticamente`)
          } else {
            console.error('Error al guardar marcas nuevas:', saveResult.error)
          }
        }

        // Inyectar brandId a cada producto importado (incluso los que ya tenían
        // marca existente pero el modal no asignó brandId por algún motivo).
        for (const product of productsToImport) {
          if (product.brandId) continue
          const text = String(product.marca || '').trim()
          if (!text) continue
          const brandId = brandNameToId.get(text.toLowerCase())
          if (brandId) {
            product.brandId = brandId
            // Normalizar marca texto al nombre administrado por consistencia.
            const found = existingBrands.find(b => b.id === brandId)
              || Array.from(newBrandNames).map(n => ({ name: n })).find(b => b.name.toLowerCase() === text.toLowerCase())
            if (found?.name) product.marca = found.name
          }
        }
      }

      // Auto-crear laboratorios que no existen (solo modo farmacia)
      if (businessMode === 'pharmacy') {
        const labsRef = collection(db, 'businesses', getBusinessId(), 'laboratories')
        const labsSnapshot = await getDocs(labsRef)
        const existingLabs = labsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        const labNameToId = new Map()
        existingLabs.forEach(lab => {
          labNameToId.set(lab.name.toLowerCase().trim(), lab.id)
        })

        // Identificar laboratorios nuevos del Excel
        const newLabNames = new Set()
        for (const product of productsToImport) {
          if (product.laboratoryName && product.laboratoryName.trim() !== '') {
            const labName = product.laboratoryName.trim()
            if (!labNameToId.has(labName.toLowerCase())) {
              newLabNames.add(labName)
            }
          }
        }

        // Crear laboratorios nuevos
        if (newLabNames.size > 0) {
          for (const labName of newLabNames) {
            try {
              const newLabDoc = await addDoc(labsRef, {
                name: labName,
                country: '',
                website: '',
                notes: 'Creado automáticamente durante importación',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              })
              labNameToId.set(labName.toLowerCase(), newLabDoc.id)
            } catch (err) {
              console.error(`Error al crear laboratorio "${labName}":`, err)
            }
          }
          toast.info(`${newLabNames.size} laboratorio(s) creado(s) automáticamente`)
          // Recargar laboratorios en el state
          loadLaboratories()
        }

        // Asignar laboratoryId a cada producto según el nombre
        for (const product of productsToImport) {
          if (product.laboratoryName && product.laboratoryName.trim() !== '') {
            const labId = labNameToId.get(product.laboratoryName.trim().toLowerCase())
            if (labId) {
              product.laboratoryId = labId
            }
          }
        }
      }

      // Obtener productos existentes para verificar duplicados
      const existingProductsResult = await getProducts(getBusinessId())
      const existingProducts = existingProductsResult.success ? existingProductsResult.data : []

      // Crear mapas para búsqueda rápida por SKU, código de barras y nombre
      const productBySku = new Map()
      const productByCode = new Map()
      const productByName = new Map()
      existingProducts.forEach(p => {
        if (p.sku) productBySku.set(p.sku.toLowerCase().trim(), p)
        if (p.code) productByCode.set(p.code.toLowerCase().trim(), p)
        if (p.name) productByName.set(p.name.toLowerCase().trim(), p)
      })

      // VALIDACIÓN PRE-IMPORT: rechazar si hay códigos de barras duplicados con SKUs
      // distintos. Esto antes pasaba silencioso: el importer trataba todas las filas con
      // el mismo código como "el mismo producto", sobrescribía el primero y duplicaba
      // movimientos de stock (desincronizaba el balance). Mejor abortar y avisar.
      const validationErrors = []

      // (a) Duplicados dentro del mismo Excel
      const codeOccurrences = new Map() // codeKey -> [{ rowIndex, sku, name }]
      productsToImport.forEach((p, idx) => {
        if (!p.code) return
        const codeKey = String(p.code).trim().toLowerCase()
        if (!codeOccurrences.has(codeKey)) codeOccurrences.set(codeKey, [])
        codeOccurrences.get(codeKey).push({ rowIndex: idx + 2, sku: p.sku, name: p.name })
      })
      for (const [codeKey, occ] of codeOccurrences) {
        if (occ.length < 2) continue
        const distinctSkus = new Set(occ.map(o => String(o.sku || '').toLowerCase().trim()).filter(Boolean))
        if (distinctSkus.size > 1) {
          const rowList = occ.map(o => `fila ${o.rowIndex} (SKU "${o.sku}")`).join(', ')
          validationErrors.push(`Código de barras "${occ[0].name ? codeKey : codeKey}" duplicado en el Excel con SKUs distintos: ${rowList}`)
        }
      }

      // (b) Conflictos contra la base: código existe en DB con un SKU distinto al del Excel
      productsToImport.forEach((p, idx) => {
        if (!p.code || !p.sku) return
        const codeKey = String(p.code).trim().toLowerCase()
        const skuKey = String(p.sku).trim().toLowerCase()
        const existingByCode = productByCode.get(codeKey)
        if (!existingByCode) return
        const existingSkuKey = String(existingByCode.sku || '').toLowerCase().trim()
        if (existingSkuKey && existingSkuKey !== skuKey) {
          validationErrors.push(`Fila ${idx + 2}: código de barras "${p.code}" ya está asignado al producto "${existingByCode.name}" (SKU "${existingByCode.sku}"). Si quieres actualizar ese producto, usa su SKU.`)
        }
      })

      if (validationErrors.length > 0) {
        toast.error('Importación cancelada: códigos de barras en conflicto')
        return { success: 0, errors: validationErrors }
      }

      // Importar productos
      let updatedCount = 0
      for (let i = 0; i < productsToImport.length; i++) {
        const product = productsToImport[i]

        try {
          // Convertir nombre de categoría/subcategoría a ID
          if (product.subcategory && product.subcategory.trim() !== '' && product.category && product.category.trim() !== '') {
            // Tiene subcategoría - buscar la subcategoría bajo la categoría padre
            const parentCategoryName = product.category.trim()
            const subcategoryName = product.subcategory.trim()
            const parentCat = updatedCategories.find(cat => cat.name.toLowerCase() === parentCategoryName.toLowerCase() && !cat.parentId)
            if (parentCat) {
              const subCat = updatedCategories.find(cat => cat.name.toLowerCase() === subcategoryName.toLowerCase() && cat.parentId === parentCat.id)
              product.category = subCat ? subCat.id : parentCat.id
            }
          } else if (product.category && product.category.trim() !== '') {
            // Solo categoría raíz
            const categoryName = product.category.trim()
            const foundCategory = updatedCategories.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase() && !cat.parentId)
            if (foundCategory) {
              product.category = foundCategory.id
            }
          }
          delete product.subcategory

          // El almacén destino ya está definido al inicio (targetWarehouse)

          // Buscar si el producto ya existe (por SKU, código de barras o nombre)
          let existingProduct = null
          if (product.sku) {
            existingProduct = productBySku.get(product.sku.toLowerCase().trim())
          }
          if (!existingProduct && product.code) {
            existingProduct = productByCode.get(product.code.toLowerCase().trim())
          }
          if (!existingProduct && product.name) {
            existingProduct = productByName.get(product.name.toLowerCase().trim())
          }

          if (existingProduct) {
            // PRODUCTO EXISTE - Actualizar datos y stock
            const updates = {}

            // Actualizar campos editables si vienen en el Excel
            if (product.name) updates.name = product.name
            if (product.description) updates.description = product.description
            if (product.price != null && !isNaN(product.price) && product.price > 0) updates.price = product.price
            if (product.cost != null) updates.cost = product.cost
            if (product.price2 !== undefined) updates.price2 = product.price2
            if (product.price3 !== undefined) updates.price3 = product.price3
            if (product.price4 !== undefined) updates.price4 = product.price4
            if (product.unit) updates.unit = product.unit
            if (product.location) updates.location = product.location
            if (product.afectacionIgv) updates.afectacionIgv = product.afectacionIgv
            if (product.presentations) updates.presentations = product.presentations
            if (product.laboratoryId) {
              updates.laboratoryId = product.laboratoryId
              updates.laboratoryName = product.laboratoryName || ''
            }
            // Marca: si el reimport trae brandId (ya sea linkeada por el modal o
            // recién auto-creada arriba), actualizamos en el producto existente.
            // marca texto también se actualiza si vino, para mantener consistencia.
            if (product.brandId) {
              updates.brandId = product.brandId
              if (product.marca) updates.marca = product.marca
            } else if (product.marca) {
              updates.marca = product.marca
            }
            // Código de barras (campo `code`) — también se actualiza en reimports
            if (product.code) updates.code = product.code
            // Visibilidad en catálogo público (parser usa `catalogVisible`)
            if (product.catalogVisible !== undefined) updates.catalogVisible = product.catalogVisible
            // Backward-compat: algunos sitios viejos usaban showInCatalog
            if (product.catalogVisible !== undefined) updates.showInCatalog = product.catalogVisible
            // Precio comparación (catálogo)
            if (product.catalogComparePrice !== undefined) updates.catalogComparePrice = product.catalogComparePrice
            // Inventario avanzado
            if (product.allowDecimalQuantity !== undefined) updates.allowDecimalQuantity = product.allowDecimalQuantity
            if (product.trackExpiration !== undefined) updates.trackExpiration = product.trackExpiration
            if (product.expirationDate) updates.expirationDate = product.expirationDate
            if (product.trackSerials !== undefined) updates.trackSerials = product.trackSerials
            // Imagen y peso
            if (product.imageUrl) updates.imageUrl = product.imageUrl
            if (product.imageUrls && product.imageUrls.length) updates.imageUrls = product.imageUrls
            if (product.weight !== null && product.weight !== undefined) updates.weight = product.weight

            // VARIANTES: mergear (permite usar varias filas con mismo nombre para
            //            ir agregando variantes de un producto con muchas combinaciones).
            //            Dedupe por SKU, suma stock al recalcular total.
            if (product.variants && product.variants.length > 0) {
              const existingVariants = existingProduct.variants || []
              const skuKey = (s) => String(s || '').toLowerCase().trim()
              const existingSkus = new Set(existingVariants.map(v => skuKey(v.sku)))
              // Las variantes nuevas necesitan warehouseStocks o no aparecen en la vista por almacén
              const newVariantsRaw = product.variants.filter(v => v.sku && !existingSkus.has(skuKey(v.sku)))
              const newVariants = newVariantsRaw.map(v => ({
                ...v,
                warehouseStocks: targetWarehouse
                  ? [{ warehouseId: targetWarehouse.id, stock: parseInt(v.stock) || 0, minStock: 0 }]
                  : (v.warehouseStocks || [])
              }))
              if (newVariants.length > 0) {
                const mergedVariants = [...existingVariants, ...newVariants]
                const mergedAttrs = Array.from(new Set([
                  ...(existingProduct.variantAttributes || []),
                  ...(product.variantAttributes || []),
                ]))
                updates.variants = mergedVariants
                updates.variantAttributes = mergedAttrs
                updates.hasVariants = true
                // Si hay variantes, el stock total = suma de stocks de variantes
                const totalVariantStock = mergedVariants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
                updates.stock = totalVariantStock
                // Asegurar que el producto tenga el warehouseStocks "padre" en el almacén destino
                if (targetWarehouse) {
                  const currentWS = existingProduct.warehouseStocks || []
                  const idx = currentWS.findIndex(ws => ws.warehouseId === targetWarehouse.id)
                  let newWS
                  if (idx >= 0) {
                    newWS = [...currentWS]
                    newWS[idx] = { ...newWS[idx], stock: totalVariantStock }
                  } else {
                    newWS = [...currentWS, { warehouseId: targetWarehouse.id, stock: totalVariantStock, minStock: 0 }]
                  }
                  updates.warehouseStocks = newWS
                }
              }
            }

            // Actualizar stock si corresponde.
            // Saltamos este bloque si el producto tiene variantes: el stock se calcula
            // como suma de stocks de variantes (ya seteado arriba).
            const productHasVariants = (existingProduct.hasVariants || updates.hasVariants)
            if (product.trackStock && targetWarehouse && !productHasVariants) {
              const stockValue = (product.stock !== null && product.stock !== undefined) ? product.stock : 0
              const currentWarehouseStocks = existingProduct.warehouseStocks || []

              // Buscar si ya tiene stock en este almacén
              const existingStockIndex = currentWarehouseStocks.findIndex(ws => ws.warehouseId === targetWarehouse.id)

              let newWarehouseStocks
              if (existingStockIndex >= 0) {
                // Actualizar stock existente en este almacén
                newWarehouseStocks = [...currentWarehouseStocks]
                newWarehouseStocks[existingStockIndex] = {
                  ...newWarehouseStocks[existingStockIndex],
                  stock: stockValue
                }
              } else {
                // Agregar nuevo almacén al producto
                newWarehouseStocks = [
                  ...currentWarehouseStocks,
                  {
                    warehouseId: targetWarehouse.id,
                    stock: stockValue,
                    minStock: 0
                  }
                ]
              }

              // Calcular stock total
              const totalStock = newWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
              updates.warehouseStocks = newWarehouseStocks
              updates.stock = totalStock
              // Registrar initialStock si el producto no lo tenía
              if (existingProduct.initialStock === undefined || existingProduct.initialStock === null) {
                updates.initialStock = totalStock
              }
            }

            // Mergear lotes (batches) si el Excel trae lotes nuevos. Dedupe por
            // número de lote + fecha de vencimiento. Sumamos cantidad si coincide.
            // CRÍTICO: cada batch nuevo debe llevar warehouseId, o se reporta
            // como "lote sin almacén asignado" al diagnosticar stock.
            if (Array.isArray(product.batches) && product.batches.length > 0 && targetWarehouse) {
              const existingBatches = Array.isArray(existingProduct.batches) ? existingProduct.batches : []
              const batchKey = (b) => `${(b.batchNumber || '').toString().trim().toLowerCase()}|${b.expirationDate ? new Date(b.expirationDate).getTime() : ''}|${b.warehouseId || targetWarehouse.id}`
              const merged = [...existingBatches]
              const indexByKey = new Map(merged.map((b, idx) => [batchKey(b), idx]))
              for (const incoming of product.batches) {
                const normalized = { ...incoming, warehouseId: incoming.warehouseId || targetWarehouse.id }
                const k = batchKey(normalized)
                if (indexByKey.has(k)) {
                  const idx = indexByKey.get(k)
                  merged[idx] = {
                    ...merged[idx],
                    quantity: (parseInt(merged[idx].quantity) || 0) + (parseInt(normalized.quantity) || 0),
                  }
                } else {
                  merged.push(normalized)
                  indexByKey.set(k, merged.length - 1)
                }
              }
              updates.batches = merged
              // Si trae lotes, asegurar trackExpiration activo
              if (product.trackExpiration || merged.some(b => !!b.expirationDate)) {
                updates.trackExpiration = true
              }
            }

            // Solo actualizar si hay cambios
            if (Object.keys(updates).length > 0) {
              const updateResult = await updateProduct(getBusinessId(), existingProduct.id, updates)

              if (updateResult.success) {
                updatedCount++
                // Registrar movimiento de stock si cambió.
                // Si el producto tiene variantes y vinieron nuevas variantes, creamos un
                // movimiento por variante NUEVA (no por las que ya existían).
                if (product.trackStock && targetWarehouse) {
                  if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
                    const existingSkus = new Set((existingProduct.variants || []).map(v => String(v.sku || '').toLowerCase().trim()))
                    // Las "nuevas" son las que no estaban antes del merge
                    const variantsBeforeMerge = (updates.variants || []).filter(v => !existingSkus.has(String(v.sku || '').toLowerCase().trim()))
                    for (const v of variantsBeforeMerge) {
                      const qty = parseInt(v.stock) || 0
                      if (qty <= 0) continue
                      await createStockMovement(getBusinessId(), {
                        productId: existingProduct.id,
                        variantSku: v.sku,
                        warehouseId: targetWarehouse.id,
                        type: 'entry',
                        quantity: qty,
                        reason: 'Stock inicial',
                        referenceType: 'initial_stock',
                        referenceId: existingProduct.id,
                        userId: user?.uid,
                        notes: `Stock inicial variante ${v.sku} por importación masiva`
                      })
                    }
                  } else if (updates.stock !== undefined) {
                    const stockValue = (product.stock !== null && product.stock !== undefined) ? product.stock : 0
                    // Calcular el delta real vs el stock previo en este almacén.
                    // Sin esto, cada update creaba un movimiento por el valor total del Excel
                    // (no por la diferencia), desincronizando el balance del histórico.
                    const previousInWarehouse = (existingProduct.warehouseStocks || []).find(ws => ws.warehouseId === targetWarehouse.id)
                    const previousStock = previousInWarehouse?.stock || 0
                    const delta = stockValue - previousStock
                    if (delta !== 0) {
                      await createStockMovement(getBusinessId(), {
                        productId: existingProduct.id,
                        warehouseId: targetWarehouse.id,
                        type: delta > 0 ? 'entry' : 'exit',
                        quantity: Math.abs(delta),
                        reason: 'Ajuste por importación',
                        referenceType: 'initial_stock',
                        referenceId: existingProduct.id,
                        userId: user?.uid,
                        notes: `Ajuste de stock por importación masiva (${previousStock} → ${stockValue})`
                      })
                    }
                  }
                }
                // Actualizar el producto en el mapa para siguientes iteraciones
                Object.assign(existingProduct, updates)
              } else {
                errors.push(`Producto "${product.name}": ${updateResult.error}`)
              }
            } else {
              updatedCount++
            }
          } else {
            // PRODUCTO NO EXISTE - Crear nuevo
            if (product.trackStock) {
              // Si el producto tiene variantes, su stock total = suma de stocks de variantes
              const variantStockSum = (product.variants || []).reduce(
                (sum, v) => sum + (parseInt(v.stock) || 0),
                0
              )
              const stockValue = product.hasVariants
                ? variantStockSum
                : ((product.stock !== null && product.stock !== undefined) ? product.stock : 0)
              if (targetWarehouse) {
                product.warehouseStocks = [{
                  warehouseId: targetWarehouse.id,
                  stock: stockValue,
                  minStock: 0
                }]
                product.stock = stockValue

                // CRÍTICO: los lotes (batches) DEBEN llevar warehouseId, o el
                // sistema de stock-por-almacén los detecta como "lote sin
                // almacén asignado" y obliga al usuario a reparar manualmente
                // desde Almacenes → Diagnosticar stock.
                if (Array.isArray(product.batches) && product.batches.length > 0) {
                  product.batches = product.batches.map(b => ({
                    ...b,
                    warehouseId: b.warehouseId || targetWarehouse.id,
                  }))
                }

                // CRÍTICO: cada variante necesita su propio warehouseStocks o no aparece
                // en la vista por almacén del inventario.
                if (product.hasVariants && Array.isArray(product.variants)) {
                  product.variants = product.variants.map(v => ({
                    ...v,
                    warehouseStocks: [{
                      warehouseId: targetWarehouse.id,
                      stock: parseInt(v.stock) || 0,
                      minStock: 0
                    }]
                  }))
                }
              } else {
                product.warehouseStocks = []
                product.stock = stockValue
              }
              product.initialStock = stockValue
            } else {
              product.warehouseStocks = []
              product.stock = null
              product.initialStock = null
            }

            const result = await createProduct(getBusinessId(), product)

            if (result.success) {
              successCount++
              // Registrar movimiento de stock inicial.
              // Si el producto tiene variantes, creamos UN movimiento por variante con su variantSku
              // (necesario para que recalculateStockFromMovements pueda asignar stock por variante).
              if (product.trackStock && targetWarehouse) {
                if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
                  for (const v of product.variants) {
                    const qty = parseInt(v.stock) || 0
                    if (qty <= 0) continue
                    await createStockMovement(getBusinessId(), {
                      productId: result.id,
                      variantSku: v.sku,
                      warehouseId: targetWarehouse.id,
                      type: 'entry',
                      quantity: qty,
                      reason: 'Stock inicial',
                      referenceType: 'initial_stock',
                      referenceId: result.id,
                      userId: user?.uid,
                      notes: `Stock inicial variante ${v.sku} por importación masiva`
                    })
                  }
                } else if (product.stock > 0) {
                  await createStockMovement(getBusinessId(), {
                    productId: result.id,
                    warehouseId: targetWarehouse.id,
                    type: 'entry',
                    quantity: product.stock,
                    reason: 'Stock inicial',
                    referenceType: 'initial_stock',
                    referenceId: result.id,
                    userId: user?.uid,
                    notes: 'Ingreso de stock inicial por importación masiva'
                  })
                }
              }
              // Agregar al mapa para detectar duplicados en el mismo archivo
              const createdProduct = { ...product, id: result.id }
              if (product.sku) productBySku.set(product.sku.toLowerCase().trim(), createdProduct)
              if (product.code) productByCode.set(product.code.toLowerCase().trim(), createdProduct)
              if (product.name) productByName.set(product.name.toLowerCase().trim(), createdProduct)
            } else {
              errors.push(`Producto "${product.name}": ${result.error}`)
            }
          }
        } catch (error) {
          errors.push(`Producto "${product.name}": ${error.message}`)
        }
      }

      // Recargar productos después de la importación
      await loadProducts()

      // Mostrar mensajes de resultado
      if (successCount > 0 && updatedCount > 0) {
        toast.success(`${successCount} producto(s) creado(s), ${updatedCount} actualizado(s)`)
      } else if (successCount > 0) {
        toast.success(`${successCount} producto(s) creado(s) exitosamente`)
      } else if (updatedCount > 0) {
        toast.success(`${updatedCount} producto(s) actualizado(s) con nuevo stock`)
      }

      if (errors.length > 0) {
        toast.error(`${errors.length} producto(s) con errores`)
      }

      return { success: successCount + updatedCount, errors }
    } catch (error) {
      console.error('Error en importación:', error)
      return { success: successCount, errors: [...errors, 'Error general en la importación'] }
    }
  }

  // Category management functions
  const openCategoryModal = () => {
    setNewCategoryName('')
    setParentCategoryId(null)
    setEditingCategory(null)
    setCategoryShowInCatalog(true)
    setIsCategoryModalOpen(true)
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !user?.uid) return

    try {
      const maxOrder = categories.filter(c => c.parentId === parentCategoryId).reduce((max, c) => Math.max(max, c.order ?? 0), -1)
      const newCategory = {
        id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: newCategoryName.trim(),
        parentId: parentCategoryId,
        showInCatalog: categoryShowInCatalog,
        order: maxOrder + 1,
      }

      const updatedCategories = [...categories, newCategory]
      setCategories(updatedCategories)

      const result = await saveProductCategories(getBusinessId(), updatedCategories)
      if (result.success) {
        toast.success(parentCategoryId ? 'Subcategoría creada exitosamente' : 'Categoría creada exitosamente')
        setNewCategoryName('')
        setParentCategoryId(null)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear categoría:', error)
      toast.error('Error al crear la categoría')
    }
  }

  const handleEditCategory = (category) => {
    setEditingCategory(category)
    setNewCategoryName(category.name)
    setParentCategoryId(category.parentId)
    setCategoryShowInCatalog(category.showInCatalog !== false)
  }

  const handleUpdateCategory = async () => {
    if (!newCategoryName.trim() || !editingCategory || !user?.uid) return

    try {
      const updatedCategories = categories.map(cat =>
        cat.id === editingCategory.id
          ? { ...cat, name: newCategoryName.trim(), parentId: parentCategoryId, showInCatalog: categoryShowInCatalog }
          : cat
      )
      setCategories(updatedCategories)

      const result = await saveProductCategories(getBusinessId(), updatedCategories)
      if (result.success) {
        toast.success('Categoría actualizada exitosamente')
        setEditingCategory(null)
        setNewCategoryName('')
        setParentCategoryId(null)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al actualizar categoría:', error)
      toast.error('Error al actualizar la categoría')
    }
  }

  const handleMoveCategoryOrder = async (categoryId, direction) => {
    const cat = categories.find(c => c.id === categoryId)
    if (!cat) return
    const siblings = categories
      .filter(c => c.parentId === cat.parentId)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    const idx = siblings.findIndex(c => c.id === categoryId)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= siblings.length) return

    // Intercambiar posiciones en el array local y reasignar order secuencialmente.
    // El handler anterior solo intercambiaba los valores `order` de las 2 categorías;
    // cuando muchas hermanas tenían order=undefined/999 (default), el swap no cambiaba
    // nada visualmente. Reasignar 0..N-1 garantiza que siempre tome efecto.
    const reordered = [...siblings]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    const newOrderById = new Map(reordered.map((s, i) => [s.id, i]))

    const updatedCategories = categories.map(c =>
      newOrderById.has(c.id) ? { ...c, order: newOrderById.get(c.id) } : c
    )
    setCategories(updatedCategories)
    await saveProductCategories(getBusinessId(), updatedCategories)
  }

  // Ordenar todas las categorías y subcategorías alfabéticamente.
  // Cada grupo de hermanas (mismo parentId) se ordena A-Z independientemente.
  const handleSortCategoriesAlphabetically = async () => {
    if (!categories.length) return
    // Agrupar por parentId
    const byParent = new Map()
    categories.forEach(c => {
      const key = c.parentId || 'root'
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key).push(c)
    })
    // Ordenar cada grupo y asignar order secuencial
    const newOrderById = new Map()
    byParent.forEach(group => {
      const sorted = [...group].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
      )
      sorted.forEach((c, i) => newOrderById.set(c.id, i))
    })
    const updatedCategories = categories.map(c => ({
      ...c,
      order: newOrderById.get(c.id) ?? c.order ?? 0
    }))
    setCategories(updatedCategories)
    await saveProductCategories(getBusinessId(), updatedCategories)
    toast.success('Categorías ordenadas alfabéticamente')
  }

  // ============== MARCAS ==============

  // Normaliza para deduplicar (trim + minúsculas + colapsar espacios).
  const normalizeBrandKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

  // Detecta marcas escritas a mano en productos que NO están vinculadas a una marca administrada.
  // Devuelve un array de { key, displayName, variants, productIds } para mostrar en el wizard.
  const detectHandwrittenBrands = () => {
    const managedKeys = new Set(brands.map(b => normalizeBrandKey(b.name)))
    const map = new Map() // key → { key, displayName, variants: Set, productIds: [] }
    for (const p of products) {
      // Si ya tiene brandId administrado, skip
      if (p.brandId && brands.some(b => b.id === p.brandId)) continue
      const raw = String(p.marca || '').trim()
      if (!raw) continue
      const key = normalizeBrandKey(raw)
      if (!key) continue
      if (managedKeys.has(key)) continue // ya existe administrada, no es huérfana
      if (!map.has(key)) {
        map.set(key, { key, displayName: raw, variants: new Set([raw]), productIds: [] })
      } else {
        map.get(key).variants.add(raw)
      }
      map.get(key).productIds.push(p.id)
    }
    return [...map.values()].map(g => ({ ...g, variants: [...g.variants] }))
  }

  const openBrandsModal = () => {
    setNewBrandName('')
    setEditingBrand(null)
    setShowMigrationPreview(false)
    setMigrationSelected(new Set())
    setIsBrandsModalOpen(true)
  }

  const handleAddBrand = async () => {
    const name = newBrandName.trim()
    if (!name || !user?.uid) return
    // Evitar duplicados (case-insensitive)
    const key = normalizeBrandKey(name)
    if (brands.some(b => normalizeBrandKey(b.name) === key)) {
      toast.error('Ya existe una marca con ese nombre')
      return
    }
    setIsSavingBrand(true)
    try {
      const newBrand = {
        id: `brand-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
      }
      const updated = [...brands, newBrand]
      setBrands(updated)
      const result = await saveProductBrands(getBusinessId(), updated)
      if (!result.success) throw new Error(result.error)
      toast.success('Marca creada')
      setNewBrandName('')
    } catch (err) {
      console.error('Error al crear marca:', err)
      toast.error('Error al crear la marca')
    } finally {
      setIsSavingBrand(false)
    }
  }

  const handleEditBrand = (brand) => {
    setEditingBrand(brand)
    setNewBrandName(brand.name)
  }

  const handleUpdateBrand = async () => {
    const name = newBrandName.trim()
    if (!name || !editingBrand || !user?.uid) return
    const key = normalizeBrandKey(name)
    // No permitir renombrar a uno que choque con OTRA marca existente.
    if (brands.some(b => b.id !== editingBrand.id && normalizeBrandKey(b.name) === key)) {
      toast.error('Ya existe otra marca con ese nombre')
      return
    }
    setIsSavingBrand(true)
    try {
      const updated = brands.map(b => b.id === editingBrand.id ? { ...b, name } : b)
      setBrands(updated)
      const result = await saveProductBrands(getBusinessId(), updated)
      if (!result.success) throw new Error(result.error)
      toast.success('Marca actualizada')
      setEditingBrand(null)
      setNewBrandName('')
    } catch (err) {
      console.error('Error al actualizar marca:', err)
      toast.error('Error al actualizar la marca')
    } finally {
      setIsSavingBrand(false)
    }
  }

  const handleDeleteBrand = async (brandId) => {
    if (!user?.uid) return
    // Bloquear si hay productos vinculados a esta marca.
    const linkedCount = products.filter(p => p.brandId === brandId).length
    if (linkedCount > 0) {
      toast.error(`Esta marca tiene ${linkedCount} producto(s) vinculado(s). Reasignalos antes de eliminar.`)
      return
    }
    if (!window.confirm('¿Eliminar esta marca?')) return
    try {
      const updated = brands.filter(b => b.id !== brandId)
      setBrands(updated)
      const result = await saveProductBrands(getBusinessId(), updated)
      if (!result.success) throw new Error(result.error)
      toast.success('Marca eliminada')
    } catch (err) {
      console.error('Error al eliminar marca:', err)
      toast.error('Error al eliminar la marca')
    }
  }

  // Crea una marca rápida desde el form de producto. Si ya existe (matchea por
  // nombre normalizado), devuelve el id existente. Devuelve null si falla.
  const createQuickBrand = async (name) => {
    const trimmed = String(name || '').trim()
    if (!trimmed || !user?.uid) return null
    const key = normalizeBrandKey(trimmed)
    const existing = brands.find(b => normalizeBrandKey(b.name) === key)
    if (existing) return existing.id
    const newBrand = {
      id: `brand-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: trimmed,
    }
    const updated = [...brands, newBrand]
    setBrands(updated)
    const result = await saveProductBrands(getBusinessId(), updated)
    if (!result.success) {
      toast.error('Error al crear marca')
      return null
    }
    toast.success(`Marca "${trimmed}" creada`)
    return newBrand.id
  }

  // Wizard de migración: crea las marcas seleccionadas + vincula productos por brandId.
  const handleMigrateBrands = async () => {
    if (!user?.uid) return
    const handwritten = detectHandwrittenBrands()
    const toCreate = handwritten.filter(g => migrationSelected.has(g.key))
    if (toCreate.length === 0) {
      toast.error('Seleccioná al menos una marca para importar')
      return
    }
    setIsMigratingBrands(true)
    try {
      // 1. Crear nuevas marcas administradas
      const newBrands = toCreate.map(g => ({
        id: `brand-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: g.displayName,
      }))
      const updatedBrands = [...brands, ...newBrands]

      // Mapeo key → brandId para vincular productos rápido
      const keyToBrandId = new Map(toCreate.map((g, i) => [g.key, newBrands[i].id]))

      // 2. Actualizar productos: setear brandId. Mantener `marca` como texto por back-compat.
      const businessId = getBusinessId()
      const productUpdates = []
      let touchedProducts = 0
      for (const p of products) {
        const raw = String(p.marca || '').trim()
        if (!raw) continue
        const key = normalizeBrandKey(raw)
        const brandId = keyToBrandId.get(key)
        if (!brandId) continue
        if (p.brandId === brandId) continue
        productUpdates.push(updateProduct(businessId, p.id, { brandId }))
        touchedProducts++
      }

      // 3. Guardar marcas y aplicar updates en paralelo
      await Promise.all([
        saveProductBrands(businessId, updatedBrands),
        ...productUpdates,
      ])

      // 4. Refrescar estado local
      setBrands(updatedBrands)
      setProducts(prev => prev.map(p => {
        const raw = String(p.marca || '').trim()
        if (!raw) return p
        const brandId = keyToBrandId.get(normalizeBrandKey(raw))
        return brandId ? { ...p, brandId } : p
      }))

      toast.success(`${newBrands.length} marca(s) importada(s) — ${touchedProducts} producto(s) vinculado(s)`)
      setShowMigrationPreview(false)
      setMigrationSelected(new Set())
    } catch (err) {
      console.error('Error al migrar marcas:', err)
      toast.error('Error al migrar marcas')
    } finally {
      setIsMigratingBrands(false)
    }
  }

  const handleDeleteCategory = async (categoryId) => {
    if (!user?.uid) return

    const categoryToDelete = getCategoryById(categories, categoryId)
    if (!categoryToDelete) return

    // Verificar si tiene subcategorías
    const hasSubcategories = getSubcategories(categories, categoryId).length > 0

    if (hasSubcategories) {
      toast.error('No puedes eliminar una categoría que tiene subcategorías. Elimina primero las subcategorías.', 5000)
      return
    }

    // Buscar productos asignados a esta categoría
    const affectedProducts = products.filter(p => p.category === categoryId || p.category === categoryToDelete.name)

    try {
      // Si es subcategoría y tiene productos, moverlos a la categoría padre
      if (affectedProducts.length > 0 && categoryToDelete.parentId) {
        const parentCategory = getCategoryById(categories, categoryToDelete.parentId)
        for (const product of affectedProducts) {
          await updateProduct(getBusinessId(), product.id, { category: categoryToDelete.parentId })
        }
        toast.info(`${affectedProducts.length} producto(s) movidos a "${parentCategory?.name || 'categoría padre'}"`)
      } else if (affectedProducts.length > 0 && !categoryToDelete.parentId) {
        toast.error('No puedes eliminar una categoría raíz que tiene productos. Mueve los productos primero.', 5000)
        return
      }

      const updatedCategories = categories.filter(cat => cat.id !== categoryId)
      setCategories(updatedCategories)

      const result = await saveProductCategories(getBusinessId(), updatedCategories)
      if (result.success) {
        toast.success('Categoría eliminada exitosamente')
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar categoría:', error)
      toast.error('Error al eliminar la categoría')
    }
  }

  // Funciones para selección masiva de categorías
  const toggleCategorySelection = (categoryId) => {
    const newSelection = new Set(selectedCategories)
    if (newSelection.has(categoryId)) {
      newSelection.delete(categoryId)
    } else {
      newSelection.add(categoryId)
    }
    setSelectedCategories(newSelection)
  }

  const toggleAllCategories = () => {
    if (selectedCategories.size === categories.length) {
      setSelectedCategories(new Set())
    } else {
      setSelectedCategories(new Set(categories.map(c => c.id)))
    }
  }

  const canDeleteCategory = (categoryId) => {
    const category = getCategoryById(categories, categoryId)
    if (!category) return false
    const hasProducts = products.some(p => p.category === categoryId || p.category === category.name)
    const hasSubcategories = getSubcategories(categories, categoryId).length > 0
    // Subcategorías con productos SÍ se pueden eliminar (productos se mueven al padre)
    if (category.parentId && hasProducts && !hasSubcategories) return true
    return !hasProducts && !hasSubcategories
  }

  const getDeleteableCategoriesCount = () => {
    return Array.from(selectedCategories).filter(id => canDeleteCategory(id)).length
  }

  const handleBulkDeleteCategories = async () => {
    if (!user?.uid) return

    const categoriesToDelete = Array.from(selectedCategories).filter(id => canDeleteCategory(id))

    if (categoriesToDelete.length === 0) {
      toast.error('Ninguna de las categorías seleccionadas puede ser eliminada')
      return
    }

    setIsDeletingCategories(true)
    try {
      // Mover productos de subcategorías eliminadas a su categoría padre
      let movedCount = 0
      for (const catId of categoriesToDelete) {
        const cat = getCategoryById(categories, catId)
        if (!cat?.parentId) continue
        const affected = products.filter(p => p.category === catId || p.category === cat.name)
        for (const product of affected) {
          await updateProduct(getBusinessId(), product.id, { category: cat.parentId })
          movedCount++
        }
      }

      const updatedCategories = categories.filter(cat => !categoriesToDelete.includes(cat.id))
      setCategories(updatedCategories)

      const result = await saveProductCategories(getBusinessId(), updatedCategories)
      if (result.success) {
        const skipped = selectedCategories.size - categoriesToDelete.length
        let msg = `${categoriesToDelete.length} categoría(s) eliminada(s) exitosamente`
        if (movedCount > 0) msg += `. ${movedCount} producto(s) movidos a su categoría padre`
        if (skipped > 0) msg += `. ${skipped} no se pudieron eliminar`
        toast.success(msg, 5000)
        setSelectedCategories(new Set())
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar categorías:', error)
      toast.error('Error al eliminar las categorías')
    } finally {
      setIsDeletingCategories(false)
    }
  }

  // Bulk actions functions
  const toggleProductSelection = (productId) => {
    const newSelection = new Set(selectedProducts)
    if (newSelection.has(productId)) {
      newSelection.delete(productId)
    } else {
      newSelection.add(productId)
    }
    setSelectedProducts(newSelection)
  }

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)))
    }
  }

  // Función para manejar el ordenamiento
  const handleSort = (field) => {
    if (sortField === field) {
      // Si ya está ordenando por este campo, cambiar la dirección
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // Si es un campo nuevo, ordenar ascendente
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Función para obtener el icono de ordenamiento
  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-4 h-4 text-primary-600" />
    ) : (
      <ArrowDown className="w-4 h-4 text-primary-600" />
    )
  }

  // Funciones para etiquetas de código de barras
  const openLabelModal = () => {
    if (selectedProducts.size === 0) {
      toast.error('Selecciona al menos un producto')
      return
    }
    // Inicializar cantidades en 1 para cada producto seleccionado
    const quantities = {}
    selectedProducts.forEach(id => { quantities[id] = 1 })
    setLabelQuantities(quantities)
    setLabelModalOpen(true)
  }

  const handlePrintLabels = () => {
    const selectedProds = products.filter(p => selectedProducts.has(p.id))

    // Configuración por tamaño de etiqueta (mm y parámetros de barcode)
    const LABEL_CONFIGS = {
      '30x20': { width: 30, height: 20, barWidth: 1.5, barHeight: 80, fontSize: 10 },
      '50x38': { width: 50, height: 38, barWidth: 2, barHeight: 150, fontSize: 14 },
      '58x40': { width: 58, height: 40, barWidth: 2.2, barHeight: 160, fontSize: 16 }
    }
    const cfg = LABEL_CONFIGS[labelSize] || LABEL_CONFIGS['30x20']

    // Generar códigos de barras como SVG strings usando JsBarcode
    const generateBarcodeSVG = (code) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      try {
        JsBarcode(svg, code, {
          format: 'CODE128',
          width: cfg.barWidth,
          height: cfg.barHeight,
          displayValue: true,
          fontSize: cfg.fontSize,
          margin: 0,
          textMargin: 1
        })
        return svg.outerHTML
      } catch (e) {
        console.error('Error generando barcode:', e)
        return `<span style="font-size:9pt; font-weight:bold">${code}</span>`
      }
    }

    let labelsHTML = ''
    for (const product of selectedProds) {
      const qty = labelQuantities[product.id] || 1
      const rawCode = product.code || product.sku || product.id.slice(-8)
      const code = rawCode.replace(/-/g, '')
      const barcodeSVG = generateBarcodeSVG(code)

      for (let i = 0; i < qty; i++) {
        labelsHTML += `
          <div class="label">
            <div class="barcode">${barcodeSVG}</div>
          </div>`
      }
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Permite ventanas emergentes para imprimir')
      return
    }

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Etiquetas de productos</title>
<style>
  @page { size: ${cfg.width}mm ${cfg.height}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .label {
    width: ${cfg.width}mm; height: ${cfg.height}mm; padding: 0;
    page-break-after: always; overflow: hidden;
  }
  .label:last-child { page-break-after: avoid; }
  .barcode { width: ${cfg.width}mm; height: ${cfg.height}mm; }
  .barcode svg { width: ${cfg.width}mm; height: ${cfg.height}mm; }
</style>
</head>
<body>${labelsHTML}</body>
</html>`)
    printWindow.document.close()
    printWindow.onload = () => { setTimeout(() => printWindow.print(), 200) }

    setLabelModalOpen(false)
    toast.success('Preparando etiquetas para imprimir...')
  }

  // Imprimir los códigos de barra de los productos seleccionados directamente en
  // la ticketera térmica conectada (POS 58/80mm) usando ESC/POS — la impresora
  // genera el barcode nativamente, mucho más nítido y rápido que un bitmap.
  const handlePrintBarcodesThermal = async () => {
    if (!isPrinterReady()) {
      toast.error('No hay ticketera térmica conectada. Conéctala desde Configuración.', 5000)
      return
    }
    const selectedProds = products.filter(p => selectedProducts.has(p.id))
    const items = selectedProds
      .map(p => {
        const rawCode = p.code || p.sku || p.id.slice(-8)
        return { code: String(rawCode).replace(/-/g, ''), quantity: labelQuantities[p.id] || 1 }
      })
      .filter(it => it.code)
    if (items.length === 0) {
      toast.error('Ninguno de los productos seleccionados tiene código válido')
      return
    }
    setPrintingThermal(true)
    try {
      const result = await printProductBarcodes(items, thermalPaperWidth)
      if (result?.success) {
        toast.success('Códigos enviados a la ticketera')
        setLabelModalOpen(false)
      } else {
        toast.error(`Error al imprimir: ${result?.error || 'desconocido'}`, 5000)
      }
    } catch (error) {
      toast.error(`Error al imprimir: ${error.message}`, 5000)
    } finally {
      setPrintingThermal(false)
    }
  }

  const openBulkActionModal = (action) => {
    if (selectedProducts.size === 0) {
      toast.error('Debes seleccionar al menos un producto')
      return
    }
    setBulkAction(action)
    setBulkActionModalOpen(true)
  }

  const closeBulkActionModal = () => {
    setBulkActionModalOpen(false)
    setBulkAction(null)
    setBulkCategoryChange('')
  }

  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) return

    setIsProcessingBulk(true)

    try {
      const businessId = getBusinessId()
      let successCount = 0
      let errorCount = 0

      for (const productId of selectedProducts) {
        try {
          const result = await deleteProduct(businessId, productId)
          if (result.success) {
            successCount++
          } else {
            errorCount++
          }
        } catch (error) {
          console.error(`Error al eliminar producto ${productId}:`, error)
          errorCount++
        }
      }

      await loadProducts()
      setSelectedProducts(new Set())

      if (successCount > 0) {
        toast.success(`${successCount} producto(s) eliminado(s) exitosamente`)
      }
      if (errorCount > 0) {
        toast.warning(
          `${errorCount} producto(s) no se pudieron eliminar (probablemente porque tienen stock o están en uso). Ajusta el inventario a 0 antes de borrar.`,
          7000
        )
      }

      closeBulkActionModal()
    } catch (error) {
      console.error('Error en eliminación masiva:', error)
      toast.error('Error al eliminar los productos')
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const handleBulkCategoryChange = async () => {
    if (selectedProducts.size === 0 || !bulkCategoryChange) return

    setIsProcessingBulk(true)

    try {
      const businessId = getBusinessId()
      let successCount = 0
      let errorCount = 0

      for (const productId of selectedProducts) {
        try {
          const product = products.find(p => p.id === productId)
          if (product) {
            const result = await updateProduct(businessId, productId, {
              ...product,
              category: bulkCategoryChange
            })
            if (result.success) {
              successCount++
            } else {
              errorCount++
            }
          }
        } catch (error) {
          console.error(`Error al actualizar producto ${productId}:`, error)
          errorCount++
        }
      }

      await loadProducts()
      setSelectedProducts(new Set())

      if (successCount > 0) {
        toast.success(`${successCount} producto(s) actualizado(s) exitosamente`)
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} producto(s) no pudieron ser actualizados`)
      }

      closeBulkActionModal()
    } catch (error) {
      console.error('Error en cambio masivo de categoría:', error)
      toast.error('Error al cambiar la categoría')
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const handleBulkToggleActive = async () => {
    if (selectedProducts.size === 0) return

    setIsProcessingBulk(true)

    try {
      const businessId = getBusinessId()
      let successCount = 0
      let errorCount = 0

      for (const productId of selectedProducts) {
        try {
          const product = products.find(p => p.id === productId)
          if (product) {
            const result = await updateProduct(businessId, productId, {
              ...product,
              isActive: !(product.isActive ?? true)
            })
            if (result.success) {
              successCount++
            } else {
              errorCount++
            }
          }
        } catch (error) {
          console.error(`Error al actualizar producto ${productId}:`, error)
          errorCount++
        }
      }

      await loadProducts()
      setSelectedProducts(new Set())

      if (successCount > 0) {
        toast.success(`${successCount} producto(s) actualizado(s) exitosamente`)
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} producto(s) no pudieron ser actualizados`)
      }

      closeBulkActionModal()
    } catch (error) {
      console.error('Error en cambio masivo de estado:', error)
      toast.error('Error al cambiar el estado')
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const handleBulkSetShowInCatalog = async (show) => {
    if (selectedProducts.size === 0) return

    setIsProcessingBulk(true)

    try {
      const businessId = getBusinessId()
      let successCount = 0
      let errorCount = 0

      for (const productId of selectedProducts) {
        try {
          const result = await updateProduct(businessId, productId, { showInCatalog: show })
          if (result.success) successCount++
          else errorCount++
        } catch (error) {
          console.error(`Error al actualizar producto ${productId}:`, error)
          errorCount++
        }
      }

      await loadProducts()
      setSelectedProducts(new Set())

      const action = show ? 'visible' : 'oculto'
      if (successCount > 0) {
        toast.success(`${successCount} producto(s) ahora ${successCount !== 1 ? 'están' : 'está'} ${action}${successCount !== 1 ? 's' : ''} en el catálogo`)
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} producto(s) no pudieron ser actualizados`)
      }

      closeBulkActionModal()
    } catch (error) {
      console.error('Error en cambio masivo de catálogo:', error)
      toast.error('Error al cambiar la visibilidad en catálogo')
    } finally {
      setIsProcessingBulk(false)
    }
  }

  // Variant management functions
  const handleAddAttribute = () => {
    if (!newAttributeName.trim()) {
      toast.error('El nombre del atributo no puede estar vacío')
      return
    }

    if (variantAttributes.includes(newAttributeName.trim().toLowerCase())) {
      toast.error('Este atributo ya existe')
      return
    }

    setVariantAttributes([...variantAttributes, newAttributeName.trim().toLowerCase()])
    setNewAttributeName('')
  }

  const handleRemoveAttribute = (attrToRemove) => {
    setVariantAttributes(variantAttributes.filter(attr => attr !== attrToRemove))
    // Remove this attribute from all variants
    setVariants(variants.map(v => {
      const newAttributes = { ...v.attributes }
      delete newAttributes[attrToRemove]
      return { ...v, attributes: newAttributes }
    }))
  }

  const handleAddVariant = () => {
    // Validate all attributes are filled
    if (!newVariant.sku.trim()) {
      toast.error('El SKU es requerido')
      return
    }

    if (!newVariant.price || parseFloat(newVariant.price) <= 0) {
      toast.error('El precio debe ser mayor a 0')
      return
    }

    for (const attr of variantAttributes) {
      if (!newVariant.attributes[attr] || !newVariant.attributes[attr].trim()) {
        toast.error(`El atributo "${attr}" es requerido`)
        return
      }
    }

    // Check if SKU already exists
    if (variants.some(v => v.sku === newVariant.sku.trim())) {
      toast.error('Ya existe una variante con este SKU')
      return
    }

    setVariants([...variants, {
      sku: newVariant.sku.trim(),
      barcode: newVariant.barcode?.trim() || null,
      attributes: { ...newVariant.attributes },
      price: parseFloat(newVariant.price),
      price2: newVariant.price2 ? parseFloat(newVariant.price2) : null,
      price3: newVariant.price3 ? parseFloat(newVariant.price3) : null,
      price4: newVariant.price4 ? parseFloat(newVariant.price4) : null,
      stock: newVariant.stock === '' ? null : parseInt(newVariant.stock),
    }])

    // Reset new variant form
    setNewVariant({
      sku: '',
      barcode: '',
      attributes: {},
      price: '',
      price2: '',
      price3: '',
      price4: '',
      stock: '',
    })
  }

  const handleRemoveVariant = (index) => {
    if (editingVariantIndex === index) {
      setEditingVariantIndex(null)
      setEditingVariant(null)
    } else if (editingVariantIndex !== null && editingVariantIndex > index) {
      setEditingVariantIndex(editingVariantIndex - 1)
    }
    setVariants(variants.filter((_, i) => i !== index))
  }

  const handleEditVariant = (index) => {
    const v = variants[index]
    setEditingVariantIndex(index)
    setEditingVariant({
      sku: v.sku,
      barcode: v.barcode || '',
      attributes: { ...v.attributes },
      price: v.price?.toString() || '',
      price2: v.price2?.toString() || '',
      price3: v.price3?.toString() || '',
      price4: v.price4?.toString() || '',
      stock: v.stock?.toString() || '',
    })
  }

  const handleSaveEditVariant = () => {
    if (!editingVariant.sku.trim()) {
      toast.error('El SKU es requerido')
      return
    }
    if (!editingVariant.price || parseFloat(editingVariant.price) <= 0) {
      toast.error('El precio debe ser mayor a 0')
      return
    }
    // Check SKU uniqueness (excluding current)
    if (variants.some((v, i) => i !== editingVariantIndex && v.sku === editingVariant.sku.trim())) {
      toast.error('Ya existe otra variante con este SKU')
      return
    }
    const updated = [...variants]
    updated[editingVariantIndex] = {
      ...variants[editingVariantIndex], // preservar campos no editados (warehouseStocks, etc.)
      sku: editingVariant.sku.trim(),
      barcode: editingVariant.barcode?.trim() || null,
      attributes: { ...editingVariant.attributes },
      price: parseFloat(editingVariant.price),
      price2: editingVariant.price2 ? parseFloat(editingVariant.price2) : null,
      price3: editingVariant.price3 ? parseFloat(editingVariant.price3) : null,
      price4: editingVariant.price4 ? parseFloat(editingVariant.price4) : null,
      stock: editingVariant.stock === '' ? null : parseInt(editingVariant.stock),
    }
    setVariants(updated)
    setEditingVariantIndex(null)
    setEditingVariant(null)
  }

  const handleCancelEditVariant = () => {
    setEditingVariantIndex(null)
    setEditingVariant(null)
  }

  const handleNewVariantChange = (field, value) => {
    setNewVariant({ ...newVariant, [field]: value })
  }

  const handleNewVariantAttributeChange = (attr, value) => {
    setNewVariant({
      ...newVariant,
      attributes: { ...newVariant.attributes, [attr]: value },
    })
  }

  // Filtrar y ordenar productos por búsqueda y categoría (optimizado con useMemo)
  const filteredProducts = React.useMemo(() => {
    const filtered = products.filter(product => {
      // Dividir búsqueda en palabras individuales para búsqueda flexible
      const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0)

      // Get category name for search (backward compatible)
      const categoryName = product.category
        ? (getCategoryById(categories, product.category)?.name || product.category)
        : ''

      // Concatenar todos los campos buscables (incluir versión sin guiones para compatibilidad con pistola lectora)
      const code = product.code || ''
      const sku = product.sku || ''
      const searchableText = [
        code,
        code.replace(/-/g, ''),
        sku,
        sku.replace(/-/g, ''),
        product.name || '',
        categoryName,
        product.description || '',
        product.marca || '',
        product.laboratoryName || ''
      ].join(' ').toLowerCase()

      // Verificar que TODAS las palabras de búsqueda estén presentes (en cualquier orden)
      const matchesSearch = searchWords.length === 0 || searchWords.every(word => searchableText.includes(word))

      // Check category filter (backward compatible with old string-based categories)
      let matchesCategory = false

      if (selectedCategoryFilter === 'all') {
        matchesCategory = true
      } else if (selectedCategoryFilter === 'sin-categoria') {
        matchesCategory = !product.category
      } else {
        // Check if product is in selected category OR any of its descendant categories
        const descendantIds = getAllDescendantCategoryIds(categories, selectedCategoryFilter)
        matchesCategory =
          product.category === selectedCategoryFilter ||
          descendantIds.includes(product.category)
      }

      // Check brand filter (managed brandId). "Sin marca" = sin brandId administrado.
      let matchesBrand = true
      if (selectedBrandFilter !== 'all') {
        if (selectedBrandFilter === 'sin-marca') {
          matchesBrand = !product.brandId
        } else {
          matchesBrand = product.brandId === selectedBrandFilter
        }
      }

      // Check expiration filter
      let matchesExpiration = true
      if (showExpiringOnly) {
        if (!product.trackExpiration || !product.expirationDate) {
          matchesExpiration = false
        } else {
          const expStatus = getExpirationStatus(product.expirationDate)
          // Mostrar solo productos vencidos o próximos a vencer (≤7 días)
          matchesExpiration = expStatus && (expStatus.status === 'expired' || expStatus.status === 'warning')
        }
      }

      return matchesSearch && matchesCategory && matchesBrand && matchesExpiration
    })

    // Ordenar productos
    const sorted = [...filtered].sort((a, b) => {
      let aValue, bValue

      switch (sortField) {
        case 'sku':
          aValue = a.sku || ''
          bValue = b.sku || ''
          break
        case 'code':
          aValue = a.code || ''
          bValue = b.code || ''
          break
        case 'name':
          aValue = a.name || ''
          bValue = b.name || ''
          break
        case 'price':
          aValue = a.hasVariants ? a.basePrice : a.price || 0
          bValue = b.hasVariants ? b.basePrice : b.price || 0
          break
        case 'stock':
          const aStock = getRealStockValue(a)
          const bStock = getRealStockValue(b)
          aValue = aStock !== null ? aStock : -1
          bValue = bStock !== null ? bStock : -1
          break
        case 'category':
          aValue = getCategoryPath(categories, a.category) || ''
          bValue = getCategoryPath(categories, b.category) || ''
          break
        case 'brand': {
          // Preferimos el nombre de la marca administrada; fallback al texto libre.
          const aBrand = a.brandId ? brands.find(br => br.id === a.brandId) : null
          const bBrand = b.brandId ? brands.find(br => br.id === b.brandId) : null
          aValue = aBrand?.name || (a.marca || '')
          bValue = bBrand?.name || (b.marca || '')
          break
        }
        default:
          aValue = a.name || ''
          bValue = b.name || ''
      }

      // Comparar valores
      if (typeof aValue === 'string') {
        const comparison = aValue.localeCompare(bValue, 'es', { sensitivity: 'base' })
        return sortDirection === 'asc' ? comparison : -comparison
      } else {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }
    })

    return sorted
  }, [products, searchTerm, selectedCategoryFilter, selectedBrandFilter, showExpiringOnly, categories, brands, sortField, sortDirection])

  // Paginación de productos filtrados (optimizado con useMemo)
  const paginationData = React.useMemo(() => {
    const totalFilteredProducts = filteredProducts.length
    const totalPages = Math.ceil(totalFilteredProducts / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex)

    return {
      totalFilteredProducts,
      totalPages,
      startIndex,
      endIndex,
      paginatedProducts
    }
  }, [filteredProducts, currentPage, itemsPerPage])

  const { totalFilteredProducts, totalPages, startIndex, endIndex, paginatedProducts } = paginationData

  // Resetear a página 1 cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCategoryFilter, selectedBrandFilter, showExpiringOnly])

  // Sincronizar la expansión de la rama de subcategorías con la categoría seleccionada.
  // - Si seleccionan "Todas" o "Sin categoría" → colapsar todo.
  // - Si seleccionan una raíz con subcategorías → expandir esa raíz.
  // - Si seleccionan una subcategoría → expandir su raíz padre.
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
      // Es una raíz: expandir solo si tiene subcategorías.
      const hasSubs = getSubcategories(categories, cat.id).length > 0
      setExpandedRootCategoryId(hasSubs ? cat.id : null)
    }
  }, [selectedCategoryFilter, categories])

  // Calcular estadísticas (optimizado con useMemo)
  const statistics = React.useMemo(() => {
    const totalValue = products.reduce((sum, product) => {
      if (product.hasVariants && product.variants?.length > 0) {
        return sum + product.variants.reduce((vs, v) => vs + (v.stock || 0) * (v.price || 0), 0)
      }
      const realStock = getRealStockValue(product)
      if (realStock && product.price) {
        return sum + realStock * product.price
      }
      return sum
    }, 0)

    const totalCostValue = products.reduce((sum, product) => {
      if (product.hasVariants && product.variants?.length > 0) {
        // Para variantes, usar el costo de la variante si existe, si no usar el costo del producto padre
        const parentCost = parseFloat(product.cost) || 0
        return sum + product.variants.reduce((vs, v) => vs + (v.stock || 0) * (v.cost || parentCost || 0), 0)
      }
      const realStock = getRealStockValue(product)
      const cost = product.itemType === 'ingredient' ? (product.averageCost || 0) : (parseFloat(product.cost) || 0)
      return sum + (realStock * cost)
    }, 0)

    const lowStockCount = products.filter(product => {
      const realStock = getRealStockValue(product)
      return realStock !== null && realStock <= (product?.minStock ?? 3)
    }).length

    const expiringProductsCount = products.filter(product => {
      if (!product.trackExpiration || !product.expirationDate) return false
      const expStatus = getExpirationStatus(product.expirationDate)
      return expStatus && (expStatus.status === 'expired' || expStatus.status === 'warning')
    }).length

    return { totalValue, totalCostValue, lowStockCount, expiringProductsCount }
  }, [products])

  const { totalValue, totalCostValue, lowStockCount, expiringProductsCount } = statistics

  // Calcular qué columnas tienen datos (para ocultar columnas vacías)
  const columnsWithData = React.useMemo(() => ({
    image: products.some(p => p.imageUrl),
    sku: products.some(p => p.sku && p.sku.trim() !== ''),
    code: products.some(p => p.code && p.code.trim() !== ''),
    description: products.some(p => p.description && p.description.trim() !== ''),
    cost: products.some(p => p.cost !== undefined && p.cost !== null),
    category: products.some(p => p.category && p.category.trim() !== ''),
    brand: products.some(p => p.brandId || (p.marca && String(p.marca).trim() !== '')),
    location: products.some(p => p.location && p.location.trim() !== ''),
    expiration: products.some(p => p.trackExpiration && p.expirationDate),
  }), [products])

  // Columnas visibles = tienen datos Y el usuario no las ha desactivado
  const visibleColumns = React.useMemo(() => {
    const result = {}
    for (const key of Object.keys(columnsWithData)) {
      result[key] = columnsWithData[key] && columnPreferences[key] !== false
    }
    return result
  }, [columnsWithData, columnPreferences])

  // Labels para el selector de columnas
  const columnLabels = {
    image: 'Imagen',
    sku: 'SKU',
    code: 'Código de barras',
    description: 'Descripción',
    cost: 'Costo / Utilidad',
    category: 'Categoría',
    brand: 'Marca',
    location: 'Ubicación',
    expiration: 'Vencimiento',
  }

  const toggleColumnPreference = (key) => {
    setColumnPreferences(prev => {
      const next = { ...prev, [key]: prev[key] === false ? true : false }
      localStorage.setItem('products_visible_columns', JSON.stringify(next))
      return next
    })
  }

  const resetColumnPreferences = () => {
    setColumnPreferences({})
    localStorage.removeItem('products_visible_columns')
  }

  const hasHiddenColumns = Object.keys(columnsWithData).some(
    key => columnsWithData[key] && columnPreferences[key] === false
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando productos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Productos y Servicios</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tu catálogo de productos y servicios
          </p>
        </div>
        {/* Botones del header agrupados en 2 filas para mejor jerarquía visual:
              Fila 1 — Acciones de datos: Importar / Exportar / Rappi / + Nuevo Producto
              Fila 2 — Vista y categorización: Columnas / Categorías / Marcas
            En desktop (lg+) ambas filas se ven a la derecha del título. En
            móvil/tablet cada una toma su ancho y respira sin aplastarse. */}
        <div className="flex flex-col gap-2 w-full lg:w-auto lg:items-end">
          {/* Fila 1: Acciones de gestión de datos */}
          <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:justify-end">
            <Button
              variant="outline"
              onClick={() => setIsImportModalOpen(true)}
              className="flex-1 sm:flex-initial"
            >
              <Upload className="w-4 h-4 mr-2" />
              Importar
            </Button>
            <Button
              variant="outline"
              onClick={handleExportToExcel}
              className="flex-1 sm:flex-initial"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            {businessMode === 'restaurant' && businessSettings?.rappiEnabled === true && (
              <Button
                variant="outline"
                onClick={handleExportForRappi}
                className="flex-1 sm:flex-initial"
                title="Exporta SKUs en formato listo para Self Mapping en Portal Partners de Rappi"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Rappi
              </Button>
            )}
            <Button onClick={openCreateModal} className="flex-1 sm:flex-initial">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Producto
            </Button>
          </div>

          {/* Fila 2: Configuración de vista y categorización */}
          <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:justify-end">
            {/* Selector de columnas visibles */}
            <div className="relative flex-1 sm:flex-initial">
              <Button
                variant="outline"
                onClick={() => setColumnSelectorOpen(!columnSelectorOpen)}
                className={`w-full sm:w-auto ${hasHiddenColumns ? 'border-primary-400 text-primary-700' : ''}`}
                title="Columnas visibles"
              >
                <SlidersHorizontal className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Columnas</span>
              </Button>
              {columnSelectorOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setColumnSelectorOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase">Columnas visibles</p>
                    </div>
                    {Object.keys(columnLabels).map(key => {
                      if (!columnsWithData[key]) return null
                      return (
                        <button
                          key={key}
                          onClick={() => toggleColumnPreference(key)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            columnPreferences[key] !== false
                              ? 'bg-primary-600 border-primary-600'
                              : 'border-gray-300'
                          }`}>
                            {columnPreferences[key] !== false && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                          {columnLabels[key]}
                        </button>
                      )
                    })}
                    {hasHiddenColumns && (
                      <>
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          onClick={() => {
                            resetColumnPreferences()
                            setColumnSelectorOpen(false)
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-primary-600 hover:bg-gray-50 font-medium"
                        >
                          Mostrar todas
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <Button
              variant="outline"
              onClick={openCategoryModal}
              className="flex-1 sm:flex-initial"
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              Categorías
            </Button>
            <Button
              variant="outline"
              onClick={openBrandsModal}
              className="flex-1 sm:flex-initial"
            >
              <Tag className="w-4 h-4 mr-2" />
              Marcas
            </Button>
          </div>
        </div>
      </div>

      {/* Search and Category Filter */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Fila 1: Búsqueda y escanear */}
          <div className="flex gap-2">
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm flex-1">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar por código, nombre, categoría..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
            {Capacitor.isNativePlatform() && (
              <Button
                onClick={handleScanSearch}
                disabled={isScanningSearch}
                title="Escanear código de barras"
              >
                {isScanningSearch ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ScanBarcode className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>

          {/* Fila 2: Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro de vencimiento */}
            {expiringProductsCount > 0 && (
              <Button
                onClick={() => setShowExpiringOnly(!showExpiringOnly)}
                variant={showExpiringOnly ? 'danger' : 'outline'}
                className={showExpiringOnly ? '' : 'text-red-700 border-red-300 hover:bg-red-50'}
                size="sm"
              >
                <Calendar className="w-4 h-4 mr-2" />
                <span>Próximos a vencer</span>
                <Badge variant="danger" className="bg-white text-red-700 ml-1">
                  {expiringProductsCount}
                </Badge>
              </Button>
            )}
          </div>

          {/* Fila 3: Filtros (categorías + marcas) unificados en un solo flex para
              ahorrar espacio vertical. Cuando ambas secciones están colapsadas, los
              toggles quedan lado a lado en la misma fila. */}
          {(categories.length > 0 || brands.length > 0) && (
          <div className="flex flex-wrap gap-2">
          {categories.length > 0 && (
            <>
              {/* Toggle global para colapsar/expandir toda la sección de categorías */}
              <button
                onClick={toggleCategoriesSection}
                className="px-3 py-1 rounded-full text-sm font-medium transition-colors shadow-sm bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 inline-flex items-center gap-1"
                title={categoriesSectionCollapsed ? 'Mostrar categorías' : 'Ocultar categorías'}
              >
                {categoriesSectionCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <span>Categorías</span>
                {categoriesSectionCollapsed && selectedCategoryFilter !== 'all' && (
                  <span className="text-primary-700 font-semibold">
                    · {selectedCategoryFilter === 'sin-categoria'
                      ? 'Sin categoría'
                      : (getCategoryById(categories, selectedCategoryFilter)?.name || selectedCategoryFilter)}
                  </span>
                )}
              </button>
              {!categoriesSectionCollapsed && (
              <>
              <button
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors shadow-sm ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-primary-600 text-white border border-primary-700'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                <Tag className="w-3 h-3 inline mr-1" />
                Todas
              </button>
              {/* Render root categories. Subcategorías solo se muestran si su raíz
                  está expandida. Click en raíz: filtra + (si tiene subs) toggle expansión. */}
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
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors shadow-sm inline-flex items-center gap-1 ${
                        selectedCategoryFilter === category.id
                          ? 'bg-primary-600 text-white border border-primary-700'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                    >
                      <Folder className="w-3 h-3" />
                      <span>{category.name}</span>
                      {hasSubs && (
                        isExpanded
                          ? <ChevronDown className="w-3 h-3 opacity-70" />
                          : <ChevronRight className="w-3 h-3 opacity-70" />
                      )}
                    </button>
                    {/* Subcategorías visibles solo cuando la raíz está expandida */}
                    {isExpanded && subcats.map((subcat) => (
                      <button
                        key={subcat.id}
                        onClick={() => setSelectedCategoryFilter(subcat.id)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors shadow-sm ${
                          selectedCategoryFilter === subcat.id
                            ? 'bg-primary-600 text-white border border-primary-700'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                        }`}
                      >
                        <Folder className="w-3 h-3 inline mr-1" />
                        └─ {subcat.name}
                      </button>
                    ))}
                  </React.Fragment>
                )
              })}
              <button
                onClick={() => setSelectedCategoryFilter('sin-categoria')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
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
              {/* Toggle global de la sección de marcas */}
              <button
                onClick={toggleBrandsSection}
                className="px-3 py-1 rounded-full text-sm font-medium transition-colors shadow-sm bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 inline-flex items-center gap-1"
                title={brandsSectionCollapsed ? 'Mostrar marcas' : 'Ocultar marcas'}
              >
                {brandsSectionCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
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
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors shadow-sm ${
                      selectedBrandFilter === 'all'
                        ? 'bg-primary-600 text-white border border-primary-700'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                    }`}
                  >
                    <Tag className="w-3 h-3 inline mr-1" />
                    Todas
                  </button>
                  {[...brands].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })).map((brand) => (
                    <button
                      key={brand.id}
                      onClick={() => setSelectedBrandFilter(brand.id)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors shadow-sm ${
                        selectedBrandFilter === brand.id
                          ? 'bg-primary-600 text-white border border-primary-700'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                    >
                      <Tag className="w-3 h-3 inline mr-1" />
                      {brand.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedBrandFilter('sin-marca')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
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
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedProducts.size > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700">
                  {selectedProducts.size} seleccionado{selectedProducts.size !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setSelectedProducts(new Set())}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Limpiar
                </button>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openBulkActionModal('changeCategory')}
                  className="flex-1 sm:flex-initial"
                >
                  <FolderEdit className="w-4 h-4 mr-2" />
                  Cambiar Categoría
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openBulkActionModal('toggleActive')}
                  className="flex-1 sm:flex-initial"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Activar/Desactivar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openBulkActionModal('showInCatalog')}
                  className="flex-1 sm:flex-initial"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Mostrar en catálogo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openLabelModal}
                  className="flex-1 sm:flex-initial"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Etiquetas
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => openBulkActionModal('delete')}
                  className="flex-1 sm:flex-initial"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className={`grid grid-cols-1 ${hidePrivateData ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-6`}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Productos</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{products.length}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg">
                <Package className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {!hidePrivateData && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Valor Inventario</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalValue)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Costo: {formatCurrency(totalCostValue)}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-lg">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Stock Bajo</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{lowStockCount}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        {filteredProducts.length === 0 ? (
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron productos' : 'No hay productos registrados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza agregando tu primer producto o servicio'}
            </p>
            {!searchTerm && (
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Producto
              </Button>
            )}
          </CardContent>
        ) : (
          <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden p-3 space-y-3 bg-gray-50">
              {paginatedProducts.map((product) => {
                const realStock = getRealStockValue(product)
                const categoryPath = product.category ? getCategoryPath(categories, product.category) : ''
                const priceDisplay = formatProductPrice(product)
                const stockDisplay = product.hasVariants
                  ? product.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) || 0
                  : realStock

                return (
                  <div key={product.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="flex">
                      {/* Checkbox + Imagen */}
                      <div className="flex-shrink-0 p-3 flex items-start gap-2 bg-gray-50">
                        <button
                          onClick={() => toggleProductSelection(product.id)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                        >
                          {selectedProducts.has(product.id) ? (
                            <CheckSquare className="w-5 h-5 text-primary-600" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>

                        {product.imageUrl ? (
                          <div className="w-20 h-20 rounded-lg overflow-hidden bg-white shadow-sm border border-gray-100">
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-white border border-gray-100 flex items-center justify-center">
                            <Package className="w-8 h-8 text-gray-300" />
                          </div>
                        )}
                      </div>

                      {/* Contenido principal */}
                      <div className="flex-1 p-3 min-w-0 flex flex-col justify-between">
                        {/* Nombre y acciones */}
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{product.name}</h3>
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (actionMenuOpen === product.id) {
                                  setActionMenuOpen(null)
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  const menuHeight = 180
                                  const spaceBelow = window.innerHeight - rect.bottom
                                  const openUp = spaceBelow < menuHeight

                                  setActionMenuPosition({
                                    top: openUp ? rect.top - menuHeight : rect.bottom + 4,
                                    left: rect.right - 176,
                                    openUp
                                  })
                                  setActionMenuOpen(product.id)
                                }
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Acciones"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>

                            {actionMenuOpen === product.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setActionMenuOpen(null)}
                                />
                                <div
                                  className="fixed w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                                  style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                                >
                                  <button
                                    onClick={() => {
                                      setViewingProduct(product)
                                      setIsViewModalOpen(true)
                                      setActionMenuOpen(null)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                                  >
                                    <Eye className="w-4 h-4 text-green-600" />
                                    Ver detalles
                                  </button>
                                  <button
                                    onClick={() => {
                                      openEditModal(product)
                                      setActionMenuOpen(null)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                                  >
                                    <Edit className="w-4 h-4 text-blue-600" />
                                    Editar
                                  </button>
                                  <button
                                    onClick={() => {
                                      openCloneModal(product)
                                      setActionMenuOpen(null)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                                  >
                                    <Copy className="w-4 h-4 text-purple-600" />
                                    Clonar
                                  </button>
                                  <div className="border-t border-gray-100 my-1" />
                                  <button
                                    onClick={() => {
                                      setDeletingProduct(product)
                                      setActionMenuOpen(null)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Eliminar
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Tags: SKU + código + categoría + ubicación */}
                        {(visibleColumns.sku || visibleColumns.code || categoryPath || (visibleColumns.location && product.location)) && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {visibleColumns.sku && product.sku && (
                              <span className="inline-block font-mono text-xs text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full font-medium">
                                {product.sku}
                              </span>
                            )}
                            {visibleColumns.code && product.code && (
                              <span className="inline-block font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                                {product.code}
                              </span>
                            )}
                            {categoryPath && (
                              <span className="inline-block text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full truncate max-w-[120px]">
                                {categoryPath}
                              </span>
                            )}
                            {visibleColumns.location && product.location && (
                              <span className="inline-block font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                                {product.location}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Precio y stock */}
                        <div className="flex items-end justify-between mt-2">
                          <div>
                            <span className="text-lg font-bold text-gray-900">{priceDisplay}</span>
                            {product.hasVariants && (
                              <span className="text-xs text-gray-500 ml-1">({product.variants?.length || 0} var.)</span>
                            )}
                            {!product.hasVariants && product.unit && (
                              <span className="text-xs text-gray-400 ml-1">/ {product.unit}</span>
                            )}
                            {visibleColumns.cost && !product.hasVariants && product.cost !== undefined && product.cost !== null && (
                              <div className="text-xs text-green-600 font-medium mt-0.5">
                                +{formatCurrency(product.price - product.cost)} ({product.price > 0 ? `${(((product.price - product.cost) / product.price) * 100).toFixed(0)}%` : '0%'})
                              </div>
                            )}
                          </div>
                          <div>
                            {stockDisplay !== null ? (
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  stockDisplay > (product?.minStock ?? 3)
                                    ? 'bg-green-100 text-green-700'
                                    : stockDisplay > 0
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {stockDisplay} uds
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">Sin stock</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Vista de tabla para desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <button
                      onClick={toggleSelectAll}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title={selectedProducts.size === filteredProducts.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    >
                      {selectedProducts.size === filteredProducts.length && filteredProducts.length > 0 ? (
                        <CheckSquare className="w-5 h-5 text-primary-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </TableHead>
                  {visibleColumns.image && <TableHead className="w-12"></TableHead>}
                  {visibleColumns.sku && (
                    <TableHead className="max-w-[100px]">
                      <button
                        onClick={() => handleSort('sku')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por SKU"
                      >
                        SKU
                        {getSortIcon('sku')}
                      </button>
                    </TableHead>
                  )}
                  {visibleColumns.code && (
                    <TableHead className="hidden md:table-cell max-w-[100px]">
                      <button
                        onClick={() => handleSort('code')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por código de barras"
                      >
                        Cód. Barras
                        {getSortIcon('code')}
                      </button>
                    </TableHead>
                  )}
                  <TableHead className="min-w-[150px] max-w-[200px]">
                    <button
                      onClick={() => handleSort('name')}
                      className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                      title="Ordenar por nombre"
                    >
                      Nombre
                      {getSortIcon('name')}
                    </button>
                  </TableHead>
                  {visibleColumns.description && (
                    <TableHead className="hidden lg:table-cell max-w-[150px]">Descripción</TableHead>
                  )}
                  <TableHead className="max-w-[100px]">
                    <button
                      onClick={() => handleSort('price')}
                      className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                      title="Ordenar por precio"
                    >
                      Precio
                      {getSortIcon('price')}
                    </button>
                  </TableHead>
                  {visibleColumns.cost && (
                    <TableHead className="hidden xl:table-cell max-w-[90px]">Utilidad</TableHead>
                  )}
                  {visibleColumns.category && (
                    <TableHead className="hidden md:table-cell max-w-[120px]">
                      <button
                        onClick={() => handleSort('category')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por categoría"
                      >
                        Categoría
                        {getSortIcon('category')}
                      </button>
                    </TableHead>
                  )}
                  {visibleColumns.brand && (
                    <TableHead className="hidden md:table-cell max-w-[120px]">
                      <button
                        onClick={() => handleSort('brand')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por marca"
                      >
                        Marca
                        {getSortIcon('brand')}
                      </button>
                    </TableHead>
                  )}
                  {visibleColumns.location && (
                    <TableHead className="hidden md:table-cell max-w-[110px]">Ubicación</TableHead>
                  )}
                  <TableHead className="max-w-[80px]">
                    <button
                      onClick={() => handleSort('stock')}
                      className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                      title="Ordenar por stock"
                    >
                      Stock
                      {getSortIcon('stock')}
                    </button>
                  </TableHead>
                  {visibleColumns.expiration && (
                    <TableHead className="hidden lg:table-cell max-w-[110px]">Vencimiento</TableHead>
                  )}
                  <TableHead className="text-right max-w-[100px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product, index) => {
                  const isExpanded = expandedProduct === product.id
                  const hasWarehouseStocks = product.warehouseStocks && product.warehouseStocks.length > 0
                  const isInactive = product.isActive === false

                  return (
                    <React.Fragment key={product.id}>
                      <TableRow className={isInactive ? 'opacity-60 bg-gray-50' : ''}>
                        <TableCell>
                          <button
                            onClick={() => toggleProductSelection(product.id)}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                          >
                            {selectedProducts.has(product.id) ? (
                              <CheckSquare className="w-5 h-5 text-primary-600" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        </TableCell>
                        {visibleColumns.image && (
                          <TableCell className="w-12">
                            {product.imageUrl ? (
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100">
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                <Package className="w-5 h-5 text-gray-400" />
                              </div>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.sku && (
                          <TableCell className="max-w-[100px]">
                            <span className="font-mono text-xs text-primary-600 truncate block" title={product.sku || ''}>
                              {product.sku || '-'}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.code && (
                          <TableCell className="hidden md:table-cell max-w-[100px]">
                            <span className="font-mono text-xs text-gray-500 truncate block" title={product.code || ''}>
                              {product.code || '-'}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="min-w-[150px] max-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate" title={product.name}>{product.name}</p>
                            {isInactive && (
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700 font-semibold tracking-wide" title="Producto inactivo: oculto del POS y del catálogo">
                                INACTIVO
                              </span>
                            )}
                          </div>
                        </TableCell>
                        {visibleColumns.description && (
                          <TableCell className="hidden lg:table-cell max-w-[150px]">
                            <p className="text-xs text-gray-600 truncate" title={product.description || '-'}>
                              {product.description || '-'}
                            </p>
                          </TableCell>
                        )}
                        <TableCell className="max-w-[140px]">
                          {product.hasVariants ? (
                            <div>
                              <span className="text-sm font-semibold truncate block whitespace-nowrap" title={formatProductPrice(product)}>
                                {formatProductPrice(product)}
                              </span>
                              <p className="text-xs text-gray-500">{product.variants?.length || 0} var.</p>
                            </div>
                          ) : (
                            <div>
                              <span className="text-sm font-semibold truncate block">{formatCurrency(product.price)}</span>
                              <p className="text-xs text-gray-500 truncate">{product.unit}</p>
                            </div>
                          )}
                        </TableCell>
                        {visibleColumns.cost && (
                          <TableCell className="hidden xl:table-cell max-w-[140px]">
                            {(() => {
                              if (product.cost === undefined || product.cost === null) {
                                return <span className="text-xs text-gray-400">-</span>
                              }
                              // Variantes: rango mín–máx de utilidad usando el costo del producto padre
                              if (product.hasVariants && product.variants?.length > 0) {
                                const prices = product.variants.map(v => v.price).filter(p => typeof p === 'number')
                                if (prices.length === 0) return <span className="text-xs text-gray-400">-</span>
                                const margins = prices.map(p => p - product.cost)
                                const minM = Math.min(...margins)
                                const maxM = Math.max(...margins)
                                const pcts = prices.filter(p => p > 0).map(p => ((p - product.cost) / p) * 100)
                                const minP = pcts.length > 0 ? Math.min(...pcts) : 0
                                const maxP = pcts.length > 0 ? Math.max(...pcts) : 0
                                const amountText = minM === maxM
                                  ? formatCurrency(minM)
                                  // Omitimos "S/" en el segundo valor para que el rango quepa en la columna
                                  : `${formatCurrency(minM)}–${maxM.toFixed(2)}`
                                const pctText = minP === maxP
                                  ? `${minP.toFixed(0)}%`
                                  : `${minP.toFixed(0)}–${maxP.toFixed(0)}%`
                                const tooltip = minM === maxM
                                  ? `Utilidad: ${formatCurrency(minM)} (${minP.toFixed(0)}%)`
                                  : `Utilidad: ${formatCurrency(minM)} a ${formatCurrency(maxM)} (${minP.toFixed(0)}% a ${maxP.toFixed(0)}%)`
                                return (
                                  <div title={tooltip}>
                                    <span className="text-xs font-semibold text-green-600 whitespace-nowrap block leading-tight">
                                      {amountText}
                                    </span>
                                    <p className="text-[11px] text-gray-500 whitespace-nowrap leading-tight mt-0.5">
                                      {pctText}
                                    </p>
                                  </div>
                                )
                              }
                              // Producto simple
                              return (
                                <div>
                                  <span className="text-sm font-semibold text-green-600 truncate block">
                                    {formatCurrency(product.price - product.cost)}
                                  </span>
                                  <p className="text-xs text-gray-500">
                                    {product.price > 0 ? `${(((product.price - product.cost) / product.price) * 100).toFixed(0)}%` : '0%'}
                                  </p>
                                </div>
                              )
                            })()}
                          </TableCell>
                        )}
                        {visibleColumns.category && (
                          <TableCell className="hidden md:table-cell max-w-[120px]">
                            {product.category ? (
                              <span className="text-xs text-gray-700 truncate block" title={getCategoryPath(categories, product.category)}>
                                {getCategoryPath(categories, product.category) || product.category}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.brand && (() => {
                          // Prefiere marca administrada (brandId); fallback a marca texto.
                          const managed = product.brandId ? brands.find(b => b.id === product.brandId) : null
                          const display = managed?.name || (product.marca || '').trim()
                          const isOrphan = !managed && !!display // marca a mano sin administrar
                          return (
                            <TableCell className="hidden md:table-cell max-w-[120px]">
                              {display ? (
                                <span
                                  className={`text-xs truncate block ${isOrphan ? 'text-amber-700 italic' : 'text-gray-700'}`}
                                  title={isOrphan ? `${display} (sin administrar)` : display}
                                >
                                  {display}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </TableCell>
                          )
                        })()}
                        {visibleColumns.location && (
                          <TableCell className="hidden md:table-cell max-w-[110px]">
                            {product.location ? (
                              <span className="text-xs font-mono text-gray-700 truncate block" title={product.location}>
                                {product.location}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="max-w-[80px]">
                          <div className="flex items-center space-x-1">
                            {/* Botón de expandir/contraer solo si hay almacenes */}
                            {warehouses.length > 0 && (
                              <button
                                onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                                className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                                title={isExpanded ? "Ocultar detalle" : "Ver por almacén"}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-500" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-500" />
                                )}
                              </button>
                            )}

                            {/* Stock total */}
                            <div>
                              {product.hasVariants ? (() => {
                                const variantStock = product.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) || 0
                                return (
                                  <span className={`font-medium text-sm ${
                                    variantStock > (product?.minStock ?? 3) ? 'text-green-600' : variantStock > 0 ? 'text-yellow-600' : 'text-red-600'
                                  }`}>
                                    {formatStock(variantStock)}
                                  </span>
                                )
                              })() : (() => {
                                const realStock = getRealStockValue(product)
                                return realStock !== null ? (
                                  <span
                                    className={`font-medium text-sm ${
                                      realStock > (product?.minStock ?? 3)
                                        ? 'text-green-600'
                                        : realStock > 0
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {formatStock(realStock)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs">N/A</span>
                                )
                              })()}
                            </div>
                          </div>
                        </TableCell>
                        {visibleColumns.expiration && (
                          <TableCell className="hidden lg:table-cell max-w-[110px]">
                            {product.trackExpiration && product.expirationDate ? (() => {
                              const expStatus = getExpirationStatus(product.expirationDate)
                              const expDate = product.expirationDate.toDate ? product.expirationDate.toDate() : new Date(product.expirationDate)
                              const formattedDate = expDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })

                              return (
                                <div className="flex flex-col space-y-1">
                                  <Badge
                                    variant={expStatus.status === 'expired' ? 'danger' : expStatus.status === 'warning' ? 'warning' : 'success'}
                                    className="text-xs truncate"
                                  >
                                    {expStatus.status === 'expired'
                                      ? `${expStatus.days}d`
                                      : `${expStatus.days}d`
                                    }
                                  </Badge>
                                  <span className="text-xs text-gray-500 truncate">{formattedDate}</span>
                                </div>
                              )
                            })() : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="max-w-[100px]">
                          <div className="flex items-center justify-end space-x-1">
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (actionMenuOpen === product.id) {
                                    setActionMenuOpen(null)
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const menuHeight = 180 // Altura aproximada del menú
                                    const spaceBelow = window.innerHeight - rect.bottom
                                    const openUp = spaceBelow < menuHeight

                                    setActionMenuPosition({
                                      top: openUp ? rect.top - menuHeight : rect.bottom + 4,
                                      left: rect.right - 176, // 176px = w-44 (11rem)
                                      openUp
                                    })
                                    setActionMenuOpen(product.id)
                                  }
                                }}
                                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Acciones"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {actionMenuOpen === product.id && (
                                <>
                                  {/* Overlay para cerrar el menú al hacer clic fuera */}
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setActionMenuOpen(null)}
                                  />
                                  {/* Menú desplegable con position fixed para salir del contenedor */}
                                  <div
                                    className="fixed w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                                    style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                                  >
                                    <button
                                      onClick={() => {
                                        setViewingProduct(product)
                                        setIsViewModalOpen(true)
                                        setActionMenuOpen(null)
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                                    >
                                      <Eye className="w-4 h-4 text-green-600" />
                                      Ver detalles
                                    </button>
                                    <button
                                      onClick={() => {
                                        openEditModal(product)
                                        setActionMenuOpen(null)
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                                    >
                                      <Edit className="w-4 h-4 text-blue-600" />
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => {
                                        openCloneModal(product)
                                        setActionMenuOpen(null)
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                                    >
                                      <Copy className="w-4 h-4 text-purple-600" />
                                      Clonar
                                    </button>
                                    <div className="border-t border-gray-100 my-1" />
                                    <button
                                      onClick={() => {
                                        setDeletingProduct(product)
                                        setActionMenuOpen(null)
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Eliminar
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Fila expandible: variantes agrupadas por sucursal → almacén */}
                      {isExpanded && warehouses.length > 0 && product.hasVariants && product.variants?.length > 0 && (
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={8} className="py-3">
                            <div className="pl-8 space-y-4">
                              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                                <Store className="w-4 h-4" />
                                <span className="font-medium">Stock por Sucursal y Almacén:</span>
                              </div>
                              {(() => {
                                // Construir mapa: warehouseId → [{ sku, label, stock }]
                                const warehouseVariantMap = {}
                                product.variants.forEach((variant, vIdx) => {
                                  const variantLabel = Object.values(variant.attributes || {}).join(' / ')
                                  const variantWS = variant.warehouseStocks || []
                                  if (variantWS.length > 0) {
                                    variantWS.forEach(ws => {
                                      if (!warehouseVariantMap[ws.warehouseId]) warehouseVariantMap[ws.warehouseId] = []
                                      warehouseVariantMap[ws.warehouseId].push({ sku: variant.sku || `Var ${vIdx + 1}`, label: variantLabel, stock: ws.stock || 0 })
                                    })
                                  } else if ((variant.stock || 0) > 0) {
                                    if (!warehouseVariantMap['_unassigned']) warehouseVariantMap['_unassigned'] = []
                                    warehouseVariantMap['_unassigned'].push({ sku: variant.sku || `Var ${vIdx + 1}`, label: variantLabel, stock: variant.stock || 0 })
                                  }
                                })

                                const mainWarehouses = warehouses.filter(w => !w.branchId)
                                const branchGroups = warehouses.filter(w => w.branchId).reduce((acc, w) => {
                                  if (!acc[w.branchId]) acc[w.branchId] = []
                                  acc[w.branchId].push(w)
                                  return acc
                                }, {})

                                const renderWarehouse = (wh, variants) => (
                                  <div key={wh.id} className="p-2 space-y-1">
                                    <div className="flex items-center justify-between px-2 py-1">
                                      <div className="flex items-center gap-2">
                                        <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="text-sm text-gray-700">{wh.name}</span>
                                        {wh.isDefault && <span className="text-[10px] text-primary-500 font-medium bg-primary-50 px-1.5 py-0.5 rounded-full">Principal</span>}
                                      </div>
                                      <span className="text-xs font-semibold text-gray-600">{variants.reduce((s, v) => s + v.stock, 0)} total</span>
                                    </div>
                                    {variants.map((v, idx) => (
                                      <div key={idx} className="flex items-center justify-between bg-white rounded px-3 py-1.5 ml-4">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-xs font-mono text-purple-600">{v.sku}</span>
                                          <span className="text-xs text-gray-500 truncate">{v.label}</span>
                                        </div>
                                        <span className={`font-semibold text-xs shrink-0 ml-2 ${v.stock > (product?.minStock ?? 3) ? 'text-green-600' : v.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>{v.stock}</span>
                                      </div>
                                    ))}
                                  </div>
                                )

                                return (
                                  <div className="space-y-4">
                                    {mainWarehouses.length > 0 && (
                                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-primary-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                                          <Store className="w-4 h-4 text-primary-600" />
                                          <span className="font-medium text-primary-700">Sucursal Principal</span>
                                        </div>
                                        {mainWarehouses.map(wh => {
                                          const variants = warehouseVariantMap[wh.id] || []
                                          return variants.length > 0 ? renderWarehouse(wh, variants) : (
                                            <div key={wh.id} className="px-4 py-2 flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                                <span className="text-sm text-gray-700">{wh.name}</span>
                                              </div>
                                              <span className="text-xs text-gray-400">0</span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                    {Object.entries(branchGroups).map(([branchId, branchWhs]) => {
                                      const branch = branches.find(b => b.id === branchId)
                                      return (
                                        <div key={branchId} className="border border-gray-200 rounded-lg overflow-hidden">
                                          <div className="bg-primary-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                                            <Store className="w-4 h-4 text-primary-600" />
                                            <span className="font-medium text-primary-700">{branch?.name || 'Sucursal'}</span>
                                          </div>
                                          {branchWhs.map(wh => {
                                            const variants = warehouseVariantMap[wh.id] || []
                                            return variants.length > 0 ? renderWarehouse(wh, variants) : (
                                              <div key={wh.id} className="px-4 py-2 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                  <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                                  <span className="text-sm text-gray-700">{wh.name}</span>
                                                </div>
                                                <span className="text-xs text-gray-400">0</span>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Fila expandible con detalle por sucursal y almacén (productos sin variantes) */}
                      {isExpanded && warehouses.length > 0 && !product.hasVariants && (
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={8} className="py-3">
                            <div className="pl-8 space-y-4">
                              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                                <Store className="w-4 h-4" />
                                <span className="font-medium">Stock por Sucursal y Almacén:</span>
                              </div>

                              {/* Agrupar almacenes por sucursal */}
                              {(() => {
                                // Almacenes de la sucursal principal (sin branchId)
                                const mainBranchWarehouses = warehouses.filter(w => !w.branchId)
                                // Agrupar el resto por branchId
                                const warehousesByBranch = warehouses
                                  .filter(w => w.branchId)
                                  .reduce((acc, warehouse) => {
                                    const branchId = warehouse.branchId
                                    if (!acc[branchId]) {
                                      acc[branchId] = []
                                    }
                                    acc[branchId].push(warehouse)
                                    return acc
                                  }, {})

                                return (
                                  <div className="space-y-4">
                                    {/* Sucursal Principal */}
                                    {mainBranchWarehouses.length > 0 && (
                                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-primary-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                                          <Store className="w-4 h-4 text-primary-600" />
                                          <span className="font-medium text-primary-700">Sucursal Principal</span>
                                          <Badge variant="default" className="text-xs ml-2">
                                            {mainBranchWarehouses.reduce((sum, w) => {
                                              const ws = product.warehouseStocks?.find(ws => ws.warehouseId === w.id)
                                              return sum + (ws?.stock || 0)
                                            }, 0)} total
                                          </Badge>
                                        </div>
                                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                          {mainBranchWarehouses.map(warehouse => {
                                            const warehouseStock = hasWarehouseStocks
                                              ? product.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)
                                              : null
                                            const stock = warehouseStock?.stock || 0

                                            return (
                                              <div
                                                key={warehouse.id}
                                                className="flex items-center justify-between p-2.5 bg-white border border-gray-100 rounded-lg"
                                              >
                                                <div className="flex items-center space-x-2">
                                                  <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                                  <span className="text-sm text-gray-700">
                                                    {warehouse.name}
                                                  </span>
                                                  {warehouse.isDefault && (
                                                    <Badge variant="secondary" className="text-xs">Ppal</Badge>
                                                  )}
                                                </div>
                                                <span
                                                  className={`font-semibold text-sm ${
                                                    stock > (product?.minStock ?? 3)
                                                      ? 'text-green-600'
                                                      : stock > 0
                                                      ? 'text-yellow-600'
                                                      : 'text-red-600'
                                                  }`}
                                                >
                                                  {formatStock(stock)}
                                                </span>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* Otras sucursales */}
                                    {Object.entries(warehousesByBranch).map(([branchId, branchWarehouses]) => {
                                      const branch = branches.find(b => b.id === branchId)
                                      const branchTotal = branchWarehouses.reduce((sum, w) => {
                                        const ws = product.warehouseStocks?.find(ws => ws.warehouseId === w.id)
                                        return sum + (ws?.stock || 0)
                                      }, 0)

                                      return (
                                        <div key={branchId} className="border border-gray-200 rounded-lg overflow-hidden">
                                          <div className="bg-blue-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                                            <Store className="w-4 h-4 text-blue-600" />
                                            <span className="font-medium text-blue-700">
                                              {branch?.name || 'Sucursal sin nombre'}
                                            </span>
                                            <Badge variant="secondary" className="text-xs ml-2">
                                              {formatStock(branchTotal)} total
                                            </Badge>
                                          </div>
                                          <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                            {branchWarehouses.map(warehouse => {
                                              const warehouseStock = hasWarehouseStocks
                                                ? product.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)
                                                : null
                                              const stock = warehouseStock?.stock || 0

                                              return (
                                                <div
                                                  key={warehouse.id}
                                                  className="flex items-center justify-between p-2.5 bg-white border border-gray-100 rounded-lg"
                                                >
                                                  <div className="flex items-center space-x-2">
                                                    <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                                    <span className="text-sm text-gray-700">
                                                      {warehouse.name}
                                                    </span>
                                                    {warehouse.isDefault && (
                                                      <Badge variant="secondary" className="text-xs">Ppal</Badge>
                                                    )}
                                                  </div>
                                                  <span
                                                    className={`font-semibold text-sm ${
                                                      stock > (product?.minStock ?? 3)
                                                        ? 'text-green-600'
                                                        : stock > 0
                                                        ? 'text-yellow-600'
                                                        : 'text-red-600'
                                                    }`}
                                                  >
                                                    {formatStock(stock)}
                                                  </span>
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()}

                              {!hasWarehouseStocks && (
                                <p className="text-xs text-gray-500 mt-2">
                                  Este producto aún no tiene stock distribuido por almacenes.
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
              </Table>
            </div>

            {/* Controles de paginación */}
            {totalFilteredProducts > 0 && (
            <div className="px-4 sm:px-6 py-4 border-t border-gray-200">
              <div className="flex flex-col gap-3">
                {/* Fila 1: Info y selector de items por página */}
                <div className="flex items-center justify-between">
                  <div className="text-xs sm:text-sm text-gray-600">
                    <span className="font-medium">{startIndex + 1}</span>-
                    <span className="font-medium">{Math.min(endIndex, totalFilteredProducts)}</span>
                    <span className="hidden sm:inline"> de{' '}
                    <span className="font-medium">{totalFilteredProducts}</span></span>
                  </div>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                  </select>
                </div>

                {/* Fila 2: Navegación */}
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Primera"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Números de página */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages <= 3 ? totalPages : 3, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 3) {
                        pageNum = i + 1
                      } else if (currentPage <= 2) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 1) {
                        pageNum = totalPages - 2 + i
                      } else {
                        pageNum = currentPage - 1 + i
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 text-xs sm:text-sm rounded-lg ${
                            currentPage === pageNum
                              ? 'bg-primary-600 text-white'
                              : 'border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Última"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            )}
          </>
        )}
      </Card>

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
        size="5xl"
      >
        <form onSubmit={handleSubmit(onSubmit, (formErrors) => {
          console.error('Errores de validación:', formErrors)
          const firstError = Object.values(formErrors)[0]
          if (firstError?.message) toast.error(firstError.message)
        })} className="space-y-5">
          {/* ═══════════════ LAYOUT 2 COLUMNAS (desktop) ═══════════════ */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-8">
          {/* ═══════════════════════════════════════════════════════════════════
              SECCIÓN 1: INFORMACIÓN BÁSICA
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-4 mb-5 lg:mb-0">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Información Básica
            </h3>

            {/* Nombre del producto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre <span className="text-red-500">*</span>
                <span className="text-xs font-normal text-gray-500 ml-1">(puedes presionar ENTER para saltar de línea)</span>
              </label>
              <textarea
                placeholder="Nombre del producto o servicio"
                rows={2}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-y ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                {...register('name')}
              />
              {errors.name?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            {/* Imágenes (multi, máx 5) */}
            {canUseProductImages && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Imágenes <span className="text-xs font-normal text-gray-500">(máx 5, arrastra para reordenar)</span>
                </label>
                <div className="relative">
                  <ProductImagesManager
                    images={productImages}
                    onChange={setProductImages}
                    maxImages={5}
                  />
                  {uploadingImage && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                      <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción (Opcional)
              </label>
              <textarea
                {...register('description')}
                rows={2}
                placeholder="Descripción breve del producto o servicio"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
              />
            </div>

            {/* Marca - disponible en todos los modos excepto farmacia (que lo tiene en su sección) */}
            {businessMode !== 'pharmacy' && (() => {
              const sortedBrands = [...brands].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
              const currentMarca = watch ? watch('marca') : ''
              const currentBrandId = watch ? watch('brandId') : ''
              const hasOrphanText = !!(currentMarca && !currentBrandId)
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Marca (Opcional)
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register('brandId')}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                    >
                      <option value="">Sin marca</option>
                      {sortedBrands.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={async () => {
                        const name = window.prompt('Nombre de la nueva marca:')
                        if (!name?.trim()) return
                        const newId = await createQuickBrand(name)
                        if (newId) setValue('brandId', newId, { shouldDirty: true })
                      }}
                      className="px-3 py-2 text-sm text-primary-700 hover:bg-primary-50 border border-primary-300 rounded-lg flex items-center gap-1"
                      title="Crear nueva marca"
                    >
                      <Plus className="w-4 h-4" />
                      Nueva
                    </button>
                  </div>
                  {hasOrphanText && (
                    <p className="text-xs text-amber-600 mt-1">
                      Marca actual escrita a mano: <strong>{currentMarca}</strong> — sin administrar. Seleccioná o creá una marca arriba.
                    </p>
                  )}
                </div>
              )
            })()}

            {/* SKU */}
            <div>
              <Input
                label="SKU / Código Interno"
                placeholder="SKU-001"
                error={errors.sku?.message}
                {...register('sku')}
                helperText="Código interno de tu negocio"
              />
              {businessSettings?.autoSku && !editingProduct && (
                <button
                  type="button"
                  onClick={async () => {
                    const nextSku = await getNextSkuNumber(getBusinessId())
                    setValue('sku', nextSku)
                  }}
                  className="mt-1 text-xs text-primary-600 hover:text-primary-800 font-medium hover:underline"
                >
                  Generar SKU automático
                </button>
              )}
            </div>

            {/* Código de Barras con botón de escanear */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código de Barras
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="7501234567890"
                  className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.code ? 'border-red-500' : 'border-gray-300'}`}
                  {...register('code')}
                />
                <button
                  type="button"
                  onClick={handleScanBarcode}
                  disabled={isScanningBarcode}
                  className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  title="Escanear código de barras"
                >
                  {isScanningBarcode ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ScanBarcode className="w-5 h-5" />
                  )}
                  <span className="hidden sm:inline">Escanear</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">EAN, UPC u otro</p>
              {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code.message}</p>}

              {/* Códigos de barra adicionales (mismo producto, varios EANs) */}
              <div className="mt-3 pl-3 border-l-2 border-gray-200">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Códigos adicionales
                  <span className="text-gray-400 font-normal ml-1">
                    (mismo producto, varios códigos)
                  </span>
                </label>

                {/* Chips de códigos ya agregados */}
                {extraBarcodes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {extraBarcodes.map((code) => (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 border border-primary-200 text-primary-700 rounded-md text-xs font-mono"
                      >
                        {code}
                        <button
                          type="button"
                          onClick={() => removeExtraBarcode(code)}
                          className="text-primary-500 hover:text-primary-700"
                          title="Eliminar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Input para agregar */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Otro código de barras"
                    value={newBarcodeInput}
                    onChange={(e) => setNewBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addExtraBarcode(newBarcodeInput)
                      }
                    }}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => addExtraBarcode(newBarcodeInput)}
                    disabled={!newBarcodeInput.trim()}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 rounded-lg flex items-center gap-1 text-sm"
                    title="Agregar código"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleScanExtraBarcode}
                    disabled={isScanningExtraBarcode}
                    className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-1 text-sm"
                    title="Escanear y agregar"
                  >
                    {isScanningExtraBarcode ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ScanBarcode className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Al escanear cualquiera de estos códigos, se agregará este mismo producto.
                </p>
              </div>
            </div>

            {/* Ubicación del producto (habilitado desde Preferencias) */}
            {businessSettings?.enableProductLocation && businessMode !== 'pharmacy' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ubicación del Producto
                </label>
                <input
                  type="text"
                  value={productLocation}
                  onChange={(e) => setProductLocation(e.target.value)}
                  placeholder="Ej: P1-3A-4R (Pasillo 1, Estante 3A, Fila 4)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Ubicación física en el almacén</p>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECCIÓN 2: PRECIOS Y CLASIFICACIÓN
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Precios y Clasificación
            </h3>

            {/* Precios */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="Costo"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  error={errors.cost?.message}
                  {...register('cost')}
                />
                <p className="text-xs text-gray-500 mt-1">Opcional</p>
              </div>

              <div>
                <Input
                  label="Peso (kg)"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  error={errors.weight?.message}
                  {...register('weight')}
                />
                <p className="text-xs text-gray-500 mt-1">Opcional</p>
              </div>

              {/* Precio principal - ocultar cuando tiene variantes (cada variante tiene su precio) */}
              {!hasVariants && (
                <div>
                  <Input
                    label={businessSettings?.multiplePricesEnabled ? (businessSettings?.priceLabels?.price1 || 'Precio 1') : "Precio de Venta"}
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    error={errors.price?.message}
                    {...register('price')}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Deja el precio en <strong>0</strong> para usarlo como bonificación/cortesía al agregarlo al POS.
                  </p>
                </div>
              )}

              {/* Precio fijo USD - solo si el negocio tiene multi-divisa activada.
                  Cuando se especifica, en sesiones USD el POS/catálogo usa este
                  precio directamente en vez de convertir el precio PEN con el TC.
                  Útil para productos importados o pricing en dólar. */}
              {businessSettings?.multiCurrencyEnabled && !hasVariants && (
                <div>
                  <Input
                    label="Precio fijo en USD"
                    type="number"
                    step="any"
                    placeholder="0.00 (opcional)"
                    error={errors.priceUSD?.message}
                    {...register('priceUSD')}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Si se especifica, en ventas en dólares se usa este precio en
                    vez de convertir el precio en soles con el tipo de cambio.
                  </p>
                </div>
              )}

              {/* Precio antes (tachado) - solo si está visible en catálogo */}
              {catalogVisible && !hasVariants && !catalogHidePrice && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio antes</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={catalogComparePrice}
                    onChange={e => setCatalogComparePrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Se muestra tachado en el catálogo</p>
                </div>
              )}

              {/* Precios adicionales - solo si está habilitado en Settings y NO tiene variantes */}
              {businessSettings?.multiplePricesEnabled && !hasVariants && (
                <>
                  <div>
                    <Input
                      label={businessSettings?.priceLabels?.price2 || 'Precio 2'}
                      type="number"
                      step="any"
                      placeholder="0.00 (opcional)"
                      error={errors.price2?.message}
                      {...register('price2')}
                    />
                    {useAutoPriceByQty && (
                      <Input
                        type="number"
                        min="1"
                        placeholder="Mínimo unidades"
                        value={priceMinQtys.price2}
                        onChange={(e) => setPriceMinQtys((p) => ({ ...p, price2: e.target.value }))}
                        className="mt-1.5 text-xs"
                      />
                    )}
                  </div>
                  <div>
                    <Input
                      label={businessSettings?.priceLabels?.price3 || 'Precio 3'}
                      type="number"
                      step="any"
                      placeholder="0.00 (opcional)"
                      error={errors.price3?.message}
                      {...register('price3')}
                    />
                    {useAutoPriceByQty && (
                      <Input
                        type="number"
                        min="1"
                        placeholder="Mínimo unidades"
                        value={priceMinQtys.price3}
                        onChange={(e) => setPriceMinQtys((p) => ({ ...p, price3: e.target.value }))}
                        className="mt-1.5 text-xs"
                      />
                    )}
                  </div>
                  <div>
                    <Input
                      label={businessSettings?.priceLabels?.price4 || 'Precio 4'}
                      type="number"
                      step="any"
                      placeholder="0.00 (opcional)"
                      error={errors.price4?.message}
                      {...register('price4')}
                    />
                    {useAutoPriceByQty && (
                      <Input
                        type="number"
                        min="1"
                        placeholder="Mínimo unidades"
                        value={priceMinQtys.price4}
                        onChange={(e) => setPriceMinQtys((p) => ({ ...p, price4: e.target.value }))}
                        className="mt-1.5 text-xs"
                      />
                    )}
                  </div>

                  {/* Toggle: precio automático según cantidad. Opt-in por producto. */}
                  <div className="col-span-2 mt-2 border-t border-gray-100 pt-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useAutoPriceByQty}
                        onChange={(e) => setUseAutoPriceByQty(e.target.checked)}
                        className="mt-0.5 rounded text-primary-600"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900">
                          Aplicar precio automático según cantidad
                        </span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          En el POS y catálogo, el precio cambia solo cuando el cliente alcanza la cantidad mínima.
                          Si está apagado, el cajero elige el precio manualmente al agregar.
                        </p>
                      </div>
                    </label>
                  </div>
                </>
              )}
              {businessSettings?.multiplePricesEnabled && hasVariants && (
                <div className="col-span-2">
                  <p className="text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
                    Los precios adicionales se configuran directamente en cada variante.
                  </p>
                </div>
              )}

              <Select
                label="Unidad"
                required
                error={errors.unit?.message}
                {...register('unit')}
              >
                {UNITS.map(unit => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Afectación IGV - ancho completo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Afectación IGV
              </label>
              {taxType === 'standard' ? (
                <select
                  value={taxAffectation === '10' ? `10-${igvRate}` : taxAffectation}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '10-18') {
                      setTaxAffectation('10')
                      setIgvRate(18)
                    } else if (val === '10-10.5') {
                      setTaxAffectation('10')
                      setIgvRate(10.5)
                    } else if (val === '20') {
                      setTaxAffectation('20')
                      setIgvRate(0)
                    } else if (val === '30') {
                      setTaxAffectation('30')
                      setIgvRate(0)
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
                  value={taxAffectation}
                  onChange={(e) => setTaxAffectation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="10">Gravado</option>
                  <option value="20">Exonerado</option>
                  <option value="30">Inafecto</option>
                </select>
              )}
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría (Opcional)
              </label>
              <select
                {...register('category')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Sin categoría</option>
                {getRootCategories(categories).map(cat => (
                  <React.Fragment key={cat.id}>
                    <option value={cat.id}>{cat.name}</option>
                    {getSubcategories(categories, cat.id).map(subcat => (
                      <option key={subcat.id} value={subcat.id}>└─ {subcat.name}</option>
                    ))}
                  </React.Fragment>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Crea categorías desde el botón "Categorías"
                </p>
              )}
            </div>
          </div>
          </div>{/* ═══════ FIN LAYOUT 2 COLUMNAS ═══════ */}

          {/* ═══════════════════════════════════════════════════════════════════
              SECCIÓN: OPCIONES DEL PRODUCTO
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Opciones del Producto
            </h3>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={noStock}
                  onChange={e => {
                    setNoStock(e.target.checked)
                    if (e.target.checked) setValue('stock', '')
                  }}
                  className="w-4 h-4 mt-0.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">No manejar stock</span>
                  <p className="text-xs text-gray-500 mt-0.5">Este producto es un servicio</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={allowDecimalQuantity}
                  onChange={e => setAllowDecimalQuantity(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Permitir decimales</span>
                  <p className="text-xs text-gray-500 mt-0.5">Vender por kg, litros, etc.</p>
                </div>
              </label>

              {!noStock && (
                <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={trackSerials}
                    onChange={e => setTrackSerials(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Control de N° de serie</span>
                    <p className="text-xs text-gray-500 mt-0.5">Registrar serie por unidad (IMEI, S/N, etc.)</p>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={catalogVisible}
                  onChange={e => setCatalogVisible(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Mostrar en catálogo</span>
                  <p className="text-xs text-gray-500 mt-0.5">Visible en tienda online</p>
                </div>
              </label>

              {catalogVisible && (
                <>
                  <label className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors ml-4">
                    <input
                      type="checkbox"
                      checked={isFeatured}
                      onChange={e => setIsFeatured(e.target.checked)}
                      className="w-4 h-4 mt-0.5 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Producto destacado</span>
                      <p className="text-xs text-gray-500 mt-0.5">Aparece en la sección de destacados del catálogo</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg cursor-pointer hover:bg-yellow-100 transition-colors ml-4">
                    <input
                      type="checkbox"
                      checked={catalogHidePrice}
                      onChange={e => setCatalogHidePrice(e.target.checked)}
                      className="w-4 h-4 mt-0.5 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Ocultar precio en catálogo</span>
                      <p className="text-xs text-gray-500 mt-0.5">Muestra "Consultar" en vez del precio</p>
                    </div>
                  </label>
                </>
              )}

              {businessSettings?.presentationsEnabled && (
                <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={showPresentations}
                    onChange={e => {
                      setShowPresentations(e.target.checked)
                      if (!e.target.checked) {
                        setPresentations([])
                        setNewPresentation({ name: '', factor: '', price: '' })
                      }
                    }}
                    className="w-4 h-4 mt-0.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Presentaciones</span>
                    <p className="text-xs text-gray-500 mt-0.5">Vender en pack, caja, etc.</p>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={hasVariants}
                  onChange={e => {
                    setHasVariants(e.target.checked)
                    setValue('hasVariants', e.target.checked)
                    if (e.target.checked) {
                      // Poner precio dummy para que Zod no bloquee el submit
                      setValue('price', '1')
                    } else {
                      setValue('price', '')
                      setVariantAttributes([])
                      setVariants([])
                      setNewAttributeName('')
                      setNewVariant({ sku: '', barcode: '', attributes: {}, price: '', price2: '', price3: '', price4: '', stock: '' })
                    }
                  }}
                  className="w-4 h-4 mt-0.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Variantes</span>
                  <p className="text-xs text-gray-500 mt-0.5">Talla, color, tamaño, etc.</p>
                </div>
              </label>
            </div>

            {/* Fecha de Vencimiento se maneja desde Compras (lotes) */}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECCIÓN: PRESENTACIONES DE VENTA (solo si está habilitado)
          ═══════════════════════════════════════════════════════════════════ */}
          {showPresentations && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Presentaciones de Venta
              </h3>

              <p className="text-xs text-gray-500">
                Define cómo se puede vender este producto (unidad, pack, caja, etc.). El stock se maneja en la unidad base.
              </p>

              {/* Lista de presentaciones */}
              {presentations.length > 0 && (
                <div className="space-y-2">
                  {presentations.map((pres, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-xs text-gray-500">Nombre</span>
                          <p className="text-sm font-medium">{pres.name}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500">Factor</span>
                          <p className="text-sm font-medium">×{pres.factor}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500">Precio</span>
                          <p className="text-sm font-medium">S/ {parseFloat(pres.price).toFixed(2)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = presentations.filter((_, i) => i !== idx)
                          setPresentations(updated)
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Agregar nueva presentación */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    placeholder="Ej: Caja x24"
                    value={newPresentation.name}
                    onChange={(e) => setNewPresentation(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Factor</label>
                  <input
                    type="number"
                    placeholder="24"
                    min="1"
                    value={newPresentation.factor}
                    onChange={(e) => setNewPresentation(prev => ({ ...prev, factor: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Precio</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={newPresentation.price}
                    onChange={(e) => setNewPresentation(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!newPresentation.name.trim()) {
                      toast.error('Ingresa un nombre para la presentación')
                      return
                    }
                    if (!newPresentation.factor || parseInt(newPresentation.factor) < 1) {
                      toast.error('El factor debe ser al menos 1')
                      return
                    }
                    if (!newPresentation.price || parseFloat(newPresentation.price) <= 0) {
                      toast.error('Ingresa un precio válido')
                      return
                    }
                    setPresentations([...presentations, {
                      name: newPresentation.name.trim(),
                      factor: parseInt(newPresentation.factor),
                      price: parseFloat(newPresentation.price)
                    }])
                    setNewPresentation({ name: '', factor: '', price: '' })
                  }}
                  className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {presentations.length === 0 && (
                <div className="text-center py-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Sin presentaciones definidas.
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    El producto se venderá solo por su unidad base.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SECCIÓN 3: INVENTARIO (solo si controla stock)
          ═══════════════════════════════════════════════════════════════════ */}
          {!noStock && !hasVariants && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Inventario
            </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
                {/* Stock Actual (solo al editar) */}
                {editingProduct && (() => {
                  const stockEditOn = businessSettings?.enableManualStockEdit === true
                  const hasBatches = !!editingProduct.trackExpiration || (Array.isArray(editingProduct.batches) && editingProduct.batches.length > 0)
                  const activeWhs = (warehouses || []).filter(w => w.isActive)

                  // Producto con control de lotes → bloquear edición directa con banner.
                  if (stockEditOn && hasBatches) {
                    return (
                      <div className="md:col-span-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-amber-900 mb-1">Producto con control de lotes</div>
                          <p className="text-xs text-amber-800 leading-relaxed mb-2">
                            El stock real proviene de la suma de los lotes activos. Ajustá las cantidades por lote desde Control de Lotes para preservar la trazabilidad de vencimientos.
                          </p>
                          <p className="text-xs text-amber-900 mb-2">Stock actual: <strong>{editingProduct.stock ?? 0} unidades</strong></p>
                          <button
                            type="button"
                            onClick={() => {
                              setIsModalOpen(false)
                              appNavigate('control-lotes', { state: { productId: editingProduct.id, productName: editingProduct.name } })
                            }}
                            className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline"
                          >
                            Ir a Control de Lotes →
                          </button>
                        </div>
                      </div>
                    )
                  }

                  // Toggle ON sin lotes → editor por almacén.
                  if (stockEditOn && activeWhs.length > 0) {
                    return (
                      <div className="md:col-span-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Boxes className="w-4 h-4 text-emerald-700" />
                          <label className="text-sm font-medium text-gray-900">Stock Actual</label>
                          <span className="text-xs text-gray-500">— editable, cada cambio queda auditado</span>
                        </div>
                        <div className="space-y-2">
                          {activeWhs.map((wh) => (
                            <div key={wh.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-200">
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-700">{wh.name}</span>
                                {wh.isDefault && <span className="ml-2 text-xs text-primary-600">(Principal)</span>}
                              </div>
                              <div className="w-28">
                                <input
                                  type="number"
                                  min="0"
                                  step={allowDecimalQuantity ? '0.01' : '1'}
                                  value={stockEdits[stockEditKey(wh.id, null)] ?? ''}
                                  onChange={(e) => setStockEdits(prev => ({
                                    ...prev,
                                    [stockEditKey(wh.id, null)]: e.target.value,
                                  }))}
                                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-12">uds.</span>
                            </div>
                          ))}
                        </div>
                        {activeWhs.length > 1 && (
                          <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700">Stock Total:</span>
                            <span className="text-sm font-bold text-emerald-700">
                              {activeWhs.reduce((sum, wh) => sum + (parseFloat(stockEdits[stockEditKey(wh.id, null)]) || 0), 0)} unidades
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  }

                  // Toggle OFF → comportamiento clásico (read-only).
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Stock Actual
                      </label>
                      <div className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-semibold">
                        {editingProduct.stock ?? 0} unidades
                      </div>
                      <p className="mt-1 text-xs text-gray-500">Se actualiza con ventas y compras</p>
                    </div>
                  )
                })()}

                {/* Stock Inicial - Solo para edición (dato histórico) */}
                {editingProduct && (
                  <Input
                    label="Stock Inicial"
                    type="number"
                    placeholder="0"
                    error={errors.initialStock?.message}
                    {...register('initialStock')}
                    disabled={user?.role !== 'business_owner'}
                    helperText="Dato histórico"
                  />
                )}

                {/* Stock por Almacén (solo al crear) */}
                {!editingProduct && warehouses.length > 0 && (
                  <div className="col-span-full">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Stock Inicial por Almacén
                    </label>
                    <div className="space-y-2">
                      {warehouses.filter(wh => wh.isActive).map((wh) => (
                        <div key={wh.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-700">
                              {wh.name}
                            </span>
                            {wh.isDefault && (
                              <span className="ml-2 text-xs text-primary-600">(Principal)</span>
                            )}
                          </div>
                          <div className="w-28">
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={warehouseInitialStocks[wh.id] || ''}
                              onChange={(e) => setWarehouseInitialStocks(prev => ({
                                ...prev,
                                [wh.id]: e.target.value
                              }))}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-12">uds.</span>
                        </div>
                      ))}
                    </div>
                    {/* Total */}
                    {Object.values(warehouseInitialStocks).some(v => v && parseInt(v) > 0) && (
                      <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Stock Total:</span>
                        <span className="text-sm font-bold text-primary-600">
                          {Object.values(warehouseInitialStocks).reduce((sum, v) => sum + (parseInt(v) || 0), 0)} unidades
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Si no hay almacenes, mostrar campo simple */}
                {!editingProduct && warehouses.length === 0 && (
                  <Input
                    label="Stock Inicial"
                    type="number"
                    placeholder="0"
                    error={errors.initialStock?.message}
                    {...register('initialStock')}
                    helperText="Cantidad inicial"
                  />
                )}

                {/* Stock mínimo (alerta por producto) */}
                <Input
                  label="Stock mínimo (alerta)"
                  type="number"
                  min="0"
                  placeholder="3"
                  error={errors.minStock?.message}
                  {...register('minStock')}
                  helperText="Cuando el stock baje de este valor, aparece en amarillo y se notifica. Vacío = usa el default (3)."
                />

              </div>
          </div>
          )}

          {/* Campos específicos de Farmacia */}
          {businessMode === 'pharmacy' && (
            <div className="border-t border-green-200 pt-4 bg-green-50/50 -mx-6 px-6 pb-4">
              <h3 className="text-sm font-semibold text-green-800 mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Información Farmacéutica
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nombre Genérico (DCI) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre Genérico (DCI)
                  </label>
                  <input
                    type="text"
                    value={pharmacyData.genericName}
                    onChange={(e) => setPharmacyData({...pharmacyData, genericName: e.target.value})}
                    placeholder="Ej: Paracetamol"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Denominación Común Internacional</p>
                </div>

                {/* Concentración */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Concentración
                  </label>
                  <input
                    type="text"
                    value={pharmacyData.concentration}
                    onChange={(e) => setPharmacyData({...pharmacyData, concentration: e.target.value})}
                    placeholder="Ej: 500mg, 100ml"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>

                {/* Presentación */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Presentación
                  </label>
                  <input
                    type="text"
                    value={pharmacyData.presentation}
                    onChange={(e) => setPharmacyData({...pharmacyData, presentation: e.target.value})}
                    placeholder="Ej: Tabletas x 100, Jarabe 120ml"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>

                {/* Laboratorio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Laboratorio
                  </label>
                  <select
                    value={pharmacyData.laboratoryId}
                    onChange={(e) => {
                      const lab = laboratories.find(l => l.id === e.target.value)
                      setPharmacyData({
                        ...pharmacyData,
                        laboratoryId: e.target.value,
                        laboratoryName: lab?.name || ''
                      })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  >
                    <option value="">Seleccionar laboratorio</option>
                    {laboratories.map(lab => (
                      <option key={lab.id} value={lab.id}>{lab.name}</option>
                    ))}
                  </select>
                  {laboratories.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No hay laboratorios registrados. Agrégalos desde el menú Laboratorios.</p>
                  )}
                </div>

                {/* Marca */}
                {(() => {
                  const sortedBrands = [...brands].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
                  const hasOrphanText = !!(pharmacyData.marca && !pharmacyData.brandId)
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Marca
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={pharmacyData.brandId || ''}
                          onChange={(e) => setPharmacyData({ ...pharmacyData, brandId: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white"
                        >
                          <option value="">Sin marca</option>
                          {sortedBrands.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            const name = window.prompt('Nombre de la nueva marca:')
                            if (!name?.trim()) return
                            const newId = await createQuickBrand(name)
                            if (newId) setPharmacyData(prev => ({ ...prev, brandId: newId }))
                          }}
                          className="px-3 py-2 text-sm text-green-700 hover:bg-green-50 border border-green-300 rounded-lg flex items-center gap-1"
                          title="Crear nueva marca"
                        >
                          <Plus className="w-4 h-4" />
                          Nueva
                        </button>
                      </div>
                      {hasOrphanText && (
                        <p className="text-xs text-amber-600 mt-1">
                          Marca actual escrita a mano: <strong>{pharmacyData.marca}</strong> — sin administrar.
                        </p>
                      )}
                    </div>
                  )
                })()}

                {/* Número de Lote */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de Lote
                  </label>
                  <input
                    type="text"
                    value={pharmacyData.batchNumber}
                    onChange={(e) => setPharmacyData({...pharmacyData, batchNumber: e.target.value})}
                    placeholder="Ej: LOT2024001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>

                {/* Principio Activo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Principio Activo
                  </label>
                  <input
                    type="text"
                    value={pharmacyData.activeIngredient}
                    onChange={(e) => setPharmacyData({...pharmacyData, activeIngredient: e.target.value})}
                    placeholder="Ej: Paracetamol, Ibuprofeno"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>

                {/* Acción Terapéutica */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Acción Terapéutica
                  </label>
                  <select
                    value={pharmacyData.therapeuticAction}
                    onChange={(e) => setPharmacyData({...pharmacyData, therapeuticAction: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  >
                    <option value="">Seleccionar acción</option>
                    <option value="Analgésico">Analgésico</option>
                    <option value="Antiinflamatorio">Antiinflamatorio</option>
                    <option value="Corticoide">Corticoide</option>
                    <option value="Antibiótico">Antibiótico</option>
                    <option value="Antihistamínico">Antihistamínico</option>
                    <option value="Antigripal">Antigripal</option>
                    <option value="Antihipertensivo">Antihipertensivo</option>
                    <option value="Antiácido">Antiácido</option>
                    <option value="Antidiarreico">Antidiarreico</option>
                    <option value="Antidepresivo">Antidepresivo</option>
                    <option value="Antiparasitario">Antiparasitario</option>
                    <option value="Antifúngico">Antifúngico</option>
                    <option value="Antipirético">Antipirético</option>
                    <option value="Antiemético">Antiemético</option>
                    <option value="Antitusivo">Antitusivo</option>
                    <option value="Mucolítico">Mucolítico</option>
                    <option value="Expectorante">Expectorante</option>
                    <option value="Broncodilatador">Broncodilatador</option>
                    <option value="Diurético">Diurético</option>
                    <option value="Laxante">Laxante</option>
                    <option value="Vitamina/Suplemento">Vitamina/Suplemento</option>
                    <option value="Dermatológico">Dermatológico</option>
                    <option value="Oftálmico">Oftálmico</option>
                    <option value="Ótico">Ótico</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                {/* Condición de Venta */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Condición de Venta
                  </label>
                  <select
                    value={pharmacyData.saleCondition}
                    onChange={(e) => setPharmacyData({...pharmacyData, saleCondition: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  >
                    <option value="sin_receta">Venta libre (sin receta)</option>
                    <option value="con_receta">Con receta médica</option>
                    <option value="receta_retenida">Receta retenida</option>
                  </select>
                  {pharmacyData.saleCondition !== 'sin_receta' && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Este medicamento requiere receta médica para su venta
                    </p>
                  )}
                </div>

                {/* Registro Sanitario */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Registro Sanitario DIGEMID
                  </label>
                  <input
                    type="text"
                    value={pharmacyData.sanitaryRegistry}
                    onChange={(e) => setPharmacyData({...pharmacyData, sanitaryRegistry: e.target.value})}
                    placeholder="Ej: N-12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>

                {/* Ubicación en estante */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ubicación (Estante/Anaquel)
                  </label>
                  <input
                    type="text"
                    value={pharmacyData.location}
                    onChange={(e) => setPharmacyData({...pharmacyData, location: e.target.value})}
                    placeholder="Ej: A1-E3, Vitrina 2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SECCIÓN 4: VARIANTES (Opcional)
          ═══════════════════════════════════════════════════════════════════ */}
          {hasVariants && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                Variantes
              </h3>

              {/* Editor manual de stock por variante × almacén — solo en edición con toggle ON
                  y siempre que NO haya lotes activos (los lotes se gestionan aparte). */}
              {editingProduct && businessSettings?.enableManualStockEdit === true && !noStock && variants.length > 0 &&
                !(editingProduct.trackExpiration || (Array.isArray(editingProduct.batches) && editingProduct.batches.length > 0)) && (() => {
                const activeWhs = (warehouses || []).filter(w => w.isActive)
                if (activeWhs.length === 0) return null
                return (
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="w-4 h-4 text-blue-700" />
                      <span className="text-sm font-semibold text-blue-900">Stock actual por variante y almacén</span>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">Cada cambio queda registrado como movimiento de ajuste auditable.</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-blue-200">
                            <th className="text-left py-2 px-2 font-medium text-gray-700">Variante</th>
                            {activeWhs.map((wh) => (
                              <th key={wh.id} className="text-right py-2 px-2 font-medium text-gray-700 whitespace-nowrap">
                                {wh.name}
                                {wh.isDefault && <span className="ml-1 text-[10px] text-primary-600">(Principal)</span>}
                              </th>
                            ))}
                            <th className="text-right py-2 px-2 font-medium text-gray-700 whitespace-nowrap">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variants.map((v) => {
                            const total = activeWhs.reduce((sum, wh) => sum + (parseFloat(stockEdits[stockEditKey(wh.id, v.sku)]) || 0), 0)
                            return (
                              <tr key={v.sku} className="border-b border-blue-100/60 last:border-0">
                                <td className="py-2 px-2">
                                  <div className="font-medium text-gray-900 text-xs">{v.sku}</div>
                                  {v.attributes && (
                                    <div className="text-[10px] text-gray-500">
                                      {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' · ')}
                                    </div>
                                  )}
                                </td>
                                {activeWhs.map((wh) => (
                                  <td key={wh.id} className="py-2 px-2">
                                    <input
                                      type="number"
                                      min="0"
                                      step={allowDecimalQuantity ? '0.01' : '1'}
                                      value={stockEdits[stockEditKey(wh.id, v.sku)] ?? ''}
                                      onChange={(e) => setStockEdits(prev => ({
                                        ...prev,
                                        [stockEditKey(wh.id, v.sku)]: e.target.value,
                                      }))}
                                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    />
                                  </td>
                                ))}
                                <td className="py-2 px-2 text-right font-semibold text-blue-700">{total}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

              {/* Banner para variantes con control de lotes activo. */}
              {editingProduct && businessSettings?.enableManualStockEdit === true && !noStock &&
                (editingProduct.trackExpiration || (Array.isArray(editingProduct.batches) && editingProduct.batches.length > 0)) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-amber-900 mb-1">Producto con control de lotes</div>
                    <p className="text-xs text-amber-800 leading-relaxed mb-2">
                      Las variantes con lotes se gestionan desde Control de Lotes para preservar la trazabilidad.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false)
                        appNavigate('control-lotes', { state: { productId: editingProduct.id, productName: editingProduct.name } })
                      }}
                      className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline"
                    >
                      Ir a Control de Lotes →
                    </button>
                  </div>
                </div>
              )}

              {/* Selector de almacén destino para todas las variantes */}
              {!noStock && warehouses.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {editingProduct ? 'Asignar stock de variantes a almacén' : 'Almacén destino del stock inicial'}
                  </label>
                  <select
                    value={variantWarehouseId}
                    onChange={e => setVariantWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {(() => {
                      const mainWarehouses = warehouses.filter(w => (w.isActive || w.status === 'active') && !w.branchId)
                      const branchWarehouses = warehouses.filter(w => (w.isActive || w.status === 'active') && w.branchId)
                      const branchGroups = branchWarehouses.reduce((acc, w) => {
                        if (!acc[w.branchId]) acc[w.branchId] = []
                        acc[w.branchId].push(w)
                        return acc
                      }, {})

                      return (
                        <>
                          {mainWarehouses.length > 0 && (
                            <optgroup label="Sucursal Principal">
                              {mainWarehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}{w.isDefault ? ' (Principal)' : ''}</option>
                              ))}
                            </optgroup>
                          )}
                          {Object.entries(branchGroups).map(([branchId, whs]) => {
                            const branch = branches.find(b => b.id === branchId)
                            return (
                              <optgroup key={branchId} label={branch?.name || 'Sucursal'}>
                                {whs.map(w => (
                                  <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                              </optgroup>
                            )
                          })}
                        </>
                      )
                    })()}
                  </select>
                  <p className="text-xs text-blue-600 mt-1">El stock de todas las variantes se asignará a este almacén</p>
                </div>
              )}

              <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                {/* Variant Attributes Section */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">
                    1. Define los atributos de variante
                  </h4>
                  <p className="text-xs text-gray-600 mb-3">
                    Ejemplos: talla, color, material, tamaño, sabor, etc.
                  </p>

                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newAttributeName}
                      onChange={e => setNewAttributeName(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddAttribute())}
                      placeholder="Ej: talla, color..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddAttribute}
                      disabled={!newAttributeName.trim()}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Agregar
                    </Button>
                  </div>

                  {variantAttributes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {variantAttributes.map(attr => (
                        <Badge key={attr} variant="primary" className="flex items-center gap-1">
                          {attr}
                          <button
                            type="button"
                            onClick={() => handleRemoveAttribute(attr)}
                            className="ml-1 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Variants List */}
                {variantAttributes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      2. Agrega las variantes del producto
                    </h4>

                    {/* Add Variant Form */}
                    <div className="bg-white p-3 rounded-lg border border-gray-300 mb-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            SKU
                          </label>
                          <input
                            type="text"
                            value={newVariant.sku}
                            onChange={e => handleNewVariantChange('sku', e.target.value)}
                            placeholder="POLO-M-ROJO"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Código de barras <span className="text-xs text-gray-400">(opcional)</span>
                          </label>
                          <input
                            type="text"
                            value={newVariant.barcode}
                            onChange={e => handleNewVariantChange('barcode', e.target.value)}
                            placeholder="EAN/UPC, ej: 7501234567890"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {businessSettings?.multiplePricesEnabled ? (businessSettings?.priceLabels?.price1 || 'Precio 1') : 'Precio'}
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={newVariant.price}
                            onChange={e => handleNewVariantChange('price', e.target.value)}
                            placeholder="0.00"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        {businessSettings?.multiplePricesEnabled && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {businessSettings?.priceLabels?.price2 || 'Precio 2'}
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={newVariant.price2}
                                onChange={e => handleNewVariantChange('price2', e.target.value)}
                                placeholder="0.00 (opcional)"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {businessSettings?.priceLabels?.price3 || 'Precio 3'}
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={newVariant.price3}
                                onChange={e => handleNewVariantChange('price3', e.target.value)}
                                placeholder="0.00 (opcional)"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {businessSettings?.priceLabels?.price4 || 'Precio 4'}
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={newVariant.price4}
                                onChange={e => handleNewVariantChange('price4', e.target.value)}
                                placeholder="0.00 (opcional)"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                          </>
                        )}
                        {variantAttributes.map(attr => (
                          <div key={attr}>
                            <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                              {attr.charAt(0).toUpperCase() + attr.slice(1)}
                            </label>
                            <input
                              type="text"
                              value={newVariant.attributes[attr] || ''}
                              onChange={e => handleNewVariantAttributeChange(attr, e.target.value)}
                              placeholder={`Ej: ${attr === 'talla' ? 'M' : attr === 'color' ? 'Rojo' : ''}`}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                          </div>
                        ))}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Stock (Opcional)
                          </label>
                          <input
                            type="number"
                            value={newVariant.stock}
                            onChange={e => handleNewVariantChange('stock', e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <Button
                          type="button"
                          onClick={handleAddVariant}
                          className="w-full"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Agregar Variante
                        </Button>
                      </div>
                    </div>

                    {/* Variants Table */}
                    {variants.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100 text-xs uppercase text-gray-600">
                            <tr>
                              <th className="px-2 py-2 text-left">SKU</th>
                              <th className="px-2 py-2 text-left">Cód. barras</th>
                              {variantAttributes.map(attr => (
                                <th key={attr} className="px-2 py-2 text-left capitalize">{attr}</th>
                              ))}
                              <th className="px-2 py-2 text-left">{businessSettings?.multiplePricesEnabled ? (businessSettings?.priceLabels?.price1 || 'P1') : 'Precio'}</th>
                              {businessSettings?.multiplePricesEnabled && (
                                <>
                                  <th className="px-2 py-2 text-left">{businessSettings?.priceLabels?.price2 || 'P2'}</th>
                                  <th className="px-2 py-2 text-left">{businessSettings?.priceLabels?.price3 || 'P3'}</th>
                                  <th className="px-2 py-2 text-left">{businessSettings?.priceLabels?.price4 || 'P4'}</th>
                                </>
                              )}
                              <th className="px-2 py-2 text-left">Stock</th>
                              <th className="px-2 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {variants.map((variant, index) => (
                              editingVariantIndex === index ? (
                                <tr key={index} className="border-b border-gray-200 bg-blue-50">
                                  <td className="px-2 py-1">
                                    <input type="text" value={editingVariant.sku} onChange={e => setEditingVariant({ ...editingVariant, sku: e.target.value })} className="w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded" />
                                  </td>
                                  <td className="px-2 py-1">
                                    <input type="text" value={editingVariant.barcode || ''} onChange={e => setEditingVariant({ ...editingVariant, barcode: e.target.value })} placeholder="—" className="w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded" />
                                  </td>
                                  {variantAttributes.map(attr => (
                                    <td key={attr} className="px-2 py-1">
                                      <input type="text" value={editingVariant.attributes[attr] || ''} onChange={e => setEditingVariant({ ...editingVariant, attributes: { ...editingVariant.attributes, [attr]: e.target.value } })} className="w-full px-2 py-1 text-xs border border-gray-300 rounded" />
                                    </td>
                                  ))}
                                  <td className="px-2 py-1">
                                    <input type="number" step="any" value={editingVariant.price} onChange={e => setEditingVariant({ ...editingVariant, price: e.target.value })} className="w-20 px-2 py-1 text-xs border border-gray-300 rounded" />
                                  </td>
                                  {businessSettings?.multiplePricesEnabled && (
                                    <>
                                      <td className="px-2 py-1">
                                        <input type="number" step="any" value={editingVariant.price2} onChange={e => setEditingVariant({ ...editingVariant, price2: e.target.value })} placeholder="-" className="w-20 px-2 py-1 text-xs border border-gray-300 rounded" />
                                      </td>
                                      <td className="px-2 py-1">
                                        <input type="number" step="any" value={editingVariant.price3} onChange={e => setEditingVariant({ ...editingVariant, price3: e.target.value })} placeholder="-" className="w-20 px-2 py-1 text-xs border border-gray-300 rounded" />
                                      </td>
                                      <td className="px-2 py-1">
                                        <input type="number" step="any" value={editingVariant.price4} onChange={e => setEditingVariant({ ...editingVariant, price4: e.target.value })} placeholder="-" className="w-20 px-2 py-1 text-xs border border-gray-300 rounded" />
                                      </td>
                                    </>
                                  )}
                                  <td className="px-2 py-1">
                                    <input type="number" value={editingVariant.stock} onChange={e => setEditingVariant({ ...editingVariant, stock: e.target.value })} className="w-16 px-2 py-1 text-xs border border-gray-300 rounded" />
                                  </td>
                                  <td className="px-2 py-1">
                                    <div className="flex gap-1">
                                      <button type="button" onClick={handleSaveEditVariant} className="text-green-600 hover:text-green-800">
                                        <Check className="w-4 h-4" />
                                      </button>
                                      <button type="button" onClick={handleCancelEditVariant} className="text-gray-500 hover:text-gray-700">
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                <tr key={index} className="border-b border-gray-200">
                                  <td className="px-2 py-2 font-mono text-xs">{variant.sku}</td>
                                  <td className="px-2 py-2 font-mono text-xs text-gray-600">{variant.barcode || '-'}</td>
                                  {variantAttributes.map(attr => (
                                    <td key={attr} className="px-2 py-2">{variant.attributes[attr] || '-'}</td>
                                  ))}
                                  <td className="px-2 py-2 font-semibold">{formatCurrency(variant.price)}</td>
                                  {businessSettings?.multiplePricesEnabled && (
                                    <>
                                      <td className="px-2 py-2 text-gray-600">{variant.price2 ? formatCurrency(variant.price2) : '-'}</td>
                                      <td className="px-2 py-2 text-gray-600">{variant.price3 ? formatCurrency(variant.price3) : '-'}</td>
                                      <td className="px-2 py-2 text-gray-600">{variant.price4 ? formatCurrency(variant.price4) : '-'}</td>
                                    </>
                                  )}
                                  <td className="px-2 py-2">{variant.stock !== null && variant.stock !== undefined ? formatStock(variant.stock) : 'N/A'}</td>
                                  <td className="px-2 py-2">
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleEditVariant(index)}
                                        className="text-blue-600 hover:text-blue-800"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveVariant(index)}
                                        className="text-red-600 hover:text-red-800"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {variants.length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-4">
                        No hay variantes agregadas. Agrega la primera variante arriba.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Modifiers Section - Only in Restaurant Mode */}
          {businessMode === 'restaurant' && (
            <ProductModifiersSection
              modifiers={modifiers}
              onChange={setModifiers}
            />
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>{editingProduct ? 'Actualizar' : 'Crear'} Producto</>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        title="Eliminar Producto"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar el producto{' '}
                <strong>{deletingProduct?.name}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción no se puede deshacer.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingProduct(null)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>Eliminar</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Ver Detalles del Producto */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false)
          setViewingProduct(null)
        }}
        title="Detalles del Producto"
        size="lg"
      >
        {viewingProduct && (
          <div className="space-y-6">
            {/* Información Básica */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Información Básica
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-500">Nombre</label>
                  <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.name}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">SKU / Código Interno</label>
                  <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.sku || '-'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Código de Barras</label>
                  <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.code || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-500">Descripción</label>
                  <p className="text-sm text-gray-700 mt-1">{viewingProduct.description || 'Sin descripción'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Categoría</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {viewingProduct.category ? getCategoryPath(categories, viewingProduct.category) : 'Sin categoría'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Unidad de Medida</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {UNITS.find(u => u.value === viewingProduct.unit)?.label || viewingProduct.unit}
                  </p>
                </div>
              </div>
            </div>

            {/* Precios */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Precios
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">Precio de Venta</label>
                  {viewingProduct.hasVariants && viewingProduct.variants?.length > 0 ? (
                    <p className="text-lg text-green-600 font-bold mt-1">
                      Desde {formatCurrency(Math.min(...viewingProduct.variants.map(v => v.price)))}
                      {Math.min(...viewingProduct.variants.map(v => v.price)) !== Math.max(...viewingProduct.variants.map(v => v.price)) && (
                        <span className="text-sm font-normal text-gray-500"> - {formatCurrency(Math.max(...viewingProduct.variants.map(v => v.price)))}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-lg text-green-600 font-bold mt-1">{formatCurrency(viewingProduct.price)}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Costo</label>
                  <p className="text-lg text-orange-600 font-bold mt-1">
                    {viewingProduct.cost ? formatCurrency(viewingProduct.cost) : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Peso (kg)</label>
                  <p className="text-lg text-gray-900 font-bold mt-1">
                    {viewingProduct.weight ? `${viewingProduct.weight} kg` : '-'}
                  </p>
                </div>
                {/* Precio fijo USD: solo si está configurado y multi-divisa
                    activo. Para el resto de negocios, queda oculto. */}
                {businessSettings?.multiCurrencyEnabled && viewingProduct.priceUSD > 0 && (
                  <div>
                    <label className="text-xs font-medium text-gray-500">Precio fijo en USD</label>
                    <p className="text-lg text-blue-600 font-bold mt-1">
                      {formatCurrency(viewingProduct.priceUSD, 'USD')}
                    </p>
                  </div>
                )}
                {viewingProduct.price && viewingProduct.cost && (
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-gray-500">Margen de Ganancia</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {formatCurrency(viewingProduct.price - viewingProduct.cost)}
                      <span className="text-xs text-gray-500 ml-2">
                        ({(((viewingProduct.price - viewingProduct.cost) / viewingProduct.price) * 100).toFixed(1)}%)
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Proveedor */}
            {viewingProduct.lastSupplier && (
              <div className="bg-indigo-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Último Proveedor
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Razón Social</label>
                    <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.lastSupplier.businessName}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">RUC</label>
                    <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.lastSupplier.documentNumber}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Stock e Inventario */}
            {viewingProduct.trackStock !== false && (
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Warehouse className="w-4 h-4" />
                  Stock e Inventario
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Stock Total</label>
                    {(() => {
                      const realStock = getRealStockValue(viewingProduct) || 0
                      return (
                        <p className={`text-2xl font-bold mt-1 ${
                          realStock > (viewingProduct?.minStock ?? 3) ? 'text-green-600' :
                          realStock > 0 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {realStock} {UNITS.find(u => u.value === viewingProduct.unit)?.label?.toLowerCase() || 'unidades'}
                        </p>
                      )
                    })()}
                  </div>

                  {/* Stock por Almacén */}
                  {viewingProduct.warehouseStocks && viewingProduct.warehouseStocks.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-2 block">Stock por Almacén</label>
                      <div className="grid grid-cols-1 gap-2">
                        {viewingProduct.warehouseStocks.map(ws => {
                          const warehouse = warehouses.find(w => w.id === ws.warehouseId)
                          return (
                            <div key={ws.warehouseId} className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded">
                              <span className="text-sm text-gray-700">
                                {warehouse?.name || 'Almacén Principal'}
                                {warehouse?.isDefault && <Badge variant="default" className="ml-2 text-xs">Principal</Badge>}
                              </span>
                              <span className={`font-semibold text-sm ${
                                ws.stock > (viewingProduct?.minStock ?? 3) ? 'text-green-600' :
                                ws.stock > 0 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {formatStock(ws.stock)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Ubicación del producto (para modos no farmacia) */}
            {businessMode !== 'pharmacy' && viewingProduct.location && (
              <div className="bg-blue-50 rounded-lg p-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">Ubicación</label>
                  <p className="text-sm text-gray-900 font-mono font-medium mt-1">{viewingProduct.location}</p>
                </div>
              </div>
            )}

            {/* Información Farmacéutica (solo modo farmacia) */}
            {businessMode === 'pharmacy' && (viewingProduct.genericName || viewingProduct.laboratoryId || viewingProduct.batches?.length > 0) && (
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Pill className="w-4 h-4" />
                  Información Farmacéutica
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {viewingProduct.genericName && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Nombre Genérico</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.genericName}</p>
                    </div>
                  )}
                  {viewingProduct.concentration && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Concentración</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.concentration}</p>
                    </div>
                  )}
                  {viewingProduct.presentation && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Presentación</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.presentation}</p>
                    </div>
                  )}
                  {viewingProduct.laboratoryId && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Laboratorio</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">
                        {laboratories.find(l => l.id === viewingProduct.laboratoryId)?.name || 'No especificado'}
                      </p>
                    </div>
                  )}
                  {viewingProduct.marca && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Marca</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.marca}</p>
                    </div>
                  )}
                  {viewingProduct.activeIngredient && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Principio Activo</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.activeIngredient}</p>
                    </div>
                  )}
                  {viewingProduct.therapeuticAction && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Acción Terapéutica</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.therapeuticAction}</p>
                    </div>
                  )}
                  {viewingProduct.saleCondition && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Condición de Venta</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">
                        <Badge variant={
                          viewingProduct.saleCondition === 'prescription' ? 'warning' :
                          viewingProduct.saleCondition === 'retained' ? 'danger' : 'success'
                        }>
                          {viewingProduct.saleCondition === 'otc' ? 'Venta Libre' :
                           viewingProduct.saleCondition === 'prescription' ? 'Bajo Receta' :
                           viewingProduct.saleCondition === 'retained' ? 'Receta Retenida' : viewingProduct.saleCondition}
                        </Badge>
                      </p>
                    </div>
                  )}
                  {viewingProduct.sanitaryRegistry && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Registro Sanitario</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.sanitaryRegistry}</p>
                    </div>
                  )}
                  {viewingProduct.location && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Ubicación</label>
                      <p className="text-sm text-gray-900 font-medium mt-1">{viewingProduct.location}</p>
                    </div>
                  )}
                </div>

                {/* Lotes del producto */}
                {viewingProduct.batches && viewingProduct.batches.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-green-200">
                    <label className="text-xs font-medium text-gray-500 mb-2 block">Lotes Registrados ({viewingProduct.batches.length})</label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {viewingProduct.batches
                        .sort((a, b) => {
                          if (!a.expirationDate) return 1
                          if (!b.expirationDate) return -1
                          const dateA = a.expirationDate.toDate ? a.expirationDate.toDate() : new Date(a.expirationDate)
                          const dateB = b.expirationDate.toDate ? b.expirationDate.toDate() : new Date(b.expirationDate)
                          return dateA - dateB
                        })
                        .map((batch, idx) => {
                          const expDate = batch.expirationDate
                            ? (batch.expirationDate.toDate ? batch.expirationDate.toDate() : new Date(batch.expirationDate))
                            : null
                          const today = new Date()
                          const diffDays = expDate ? Math.ceil((expDate - today) / (1000 * 60 * 60 * 24)) : null

                          return (
                            <div key={batch.id || idx} className={`flex items-center justify-between p-2 rounded ${
                              batch.quantity <= 0 ? 'bg-gray-100 opacity-50' : 'bg-white border border-gray-200'
                            }`}>
                              <div className="flex items-center gap-3">
                                <span className="font-medium text-sm">{batch.batchNumber || 'Sin número'}</span>
                                {expDate && (
                                  <span className="text-xs text-gray-500">
                                    Vence: {expDate.toLocaleDateString('es-PE')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${batch.quantity <= 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                                  {batch.quantity || 0} uds
                                </span>
                                {diffDays !== null && diffDays <= 90 && (
                                  <Badge variant={diffDays < 0 ? 'danger' : diffDays <= 30 ? 'danger' : diffDays <= 60 ? 'warning' : 'warning'} className="text-xs">
                                    {diffDays < 0 ? 'Vencido' : `${diffDays}d`}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fecha de Vencimiento */}
            {viewingProduct.expirationDate && (
              <div className="bg-yellow-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Vencimiento
                </h3>
                <div>
                  <label className="text-xs font-medium text-gray-500">Fecha de Vencimiento</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {(() => {
                      const expDate = viewingProduct.expirationDate.toDate
                        ? viewingProduct.expirationDate.toDate()
                        : new Date(viewingProduct.expirationDate)
                      const expStatus = getExpirationStatus(viewingProduct.expirationDate)
                      return (
                        <div className="flex items-center gap-2">
                          <span>{expDate.toLocaleDateString('es-PE')}</span>
                          {expStatus && (
                            <Badge variant={expStatus.variant}>
                              {expStatus.expired ? 'Vencido' :
                               expStatus.days === 0 ? 'Vence hoy' :
                               expStatus.days <= 7 ? `${expStatus.days}d restantes` :
                               `${expStatus.days}d restantes`}
                            </Badge>
                          )}
                        </div>
                      )
                    })()}
                  </p>
                </div>
              </div>
            )}

            {/* Variantes */}
            {viewingProduct.hasVariants && viewingProduct.variants && viewingProduct.variants.length > 0 && (
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Variantes del Producto
                </h3>
                <div className="space-y-2">
                  {viewingProduct.variants.map((variant, idx) => (
                    <div key={idx} className="p-3 bg-white border border-gray-200 rounded-lg">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-xs text-gray-500">SKU:</span>
                          <p className="font-medium">{variant.sku}</p>
                        </div>
                        {Object.entries(variant.attributes || {}).map(([key, value]) => (
                          <div key={key}>
                            <span className="text-xs text-gray-500 capitalize">{key}:</span>
                            <p className="font-medium">{value}</p>
                          </div>
                        ))}
                        <div>
                          <span className="text-xs text-gray-500">Precio:</span>
                          <p className="font-medium text-green-600">{formatCurrency(variant.price)}</p>
                        </div>
                        {variant.stock !== undefined && (
                          <div>
                            <span className="text-xs text-gray-500">Stock:</span>
                            <p className="font-medium">{formatStock(variant.stock)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modificadores (solo modo restaurante) */}
            {businessMode === 'restaurant' && viewingProduct.modifiers && viewingProduct.modifiers.length > 0 && (
              <div className="bg-orange-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Modificadores</h3>
                <div className="space-y-2">
                  {viewingProduct.modifiers.map((modifier, idx) => (
                    <div key={idx} className="p-2 bg-white border border-gray-200 rounded">
                      <p className="text-sm font-medium text-gray-900">{modifier.name}</p>
                      <p className="text-xs text-gray-500">
                        Precio adicional: {formatCurrency(modifier.price)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fechas de Sistema */}
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-500">
                {viewingProduct.createdAt && (
                  <div>
                    <span className="font-medium">Fecha de creación:</span>
                    <p className="mt-1">
                      {viewingProduct.createdAt.toDate
                        ? viewingProduct.createdAt.toDate().toLocaleString('es-PE')
                        : new Date(viewingProduct.createdAt).toLocaleString('es-PE')}
                    </p>
                  </div>
                )}
                {viewingProduct.updatedAt && (
                  <div>
                    <span className="font-medium">Última actualización:</span>
                    <p className="mt-1">
                      {viewingProduct.updatedAt.toDate
                        ? viewingProduct.updatedAt.toDate().toLocaleString('es-PE')
                        : new Date(viewingProduct.updatedAt).toLocaleString('es-PE')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsViewModalOpen(false)
                  setViewingProduct(null)
                }}
              >
                Cerrar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsViewModalOpen(false)
                  openCloneModal(viewingProduct)
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Clonar
              </Button>
              <Button
                onClick={() => {
                  setIsViewModalOpen(false)
                  openEditModal(viewingProduct)
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar Producto
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Gestionar Categorías */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false)
          setEditingCategory(null)
          setNewCategoryName('')
          setParentCategoryId(null)
          setSelectedCategories(new Set())
        }}
        title="Gestionar Categorías"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              Las categorías te permiten organizar tus productos de forma más eficiente.
              Por ejemplo: Hamburguesas, Bebidas, Postres, etc.
            </p>
          </div>

          {/* Barra de selección masiva */}
          {categories.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleAllCategories}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  {selectedCategories.size === categories.length ? (
                    <CheckSquare className="w-5 h-5 text-primary-600" />
                  ) : selectedCategories.size > 0 ? (
                    <CheckSquare className="w-5 h-5 text-primary-400" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                  {selectedCategories.size === categories.length
                    ? 'Deseleccionar todas'
                    : selectedCategories.size > 0
                      ? `${selectedCategories.size} seleccionada(s)`
                      : 'Seleccionar todas'}
                </button>
                <button
                  type="button"
                  onClick={handleSortCategoriesAlphabetically}
                  className="flex items-center gap-1.5 text-sm text-primary-700 hover:text-primary-900 hover:bg-primary-50 px-2 py-1 rounded transition-colors"
                  title="Ordenar alfabéticamente (A-Z)"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  Ordenar A-Z
                </button>
              </div>
              {selectedCategories.size > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleBulkDeleteCategories}
                  disabled={isDeletingCategories || getDeleteableCategoriesCount() === 0}
                >
                  {isDeletingCategories ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar ({getDeleteableCategoriesCount()})
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Add/Edit Category Form */}
          <div className="space-y-3">
            <Input
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="Nombre de la categoría"
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  if (editingCategory) {
                    handleUpdateCategory()
                  } else {
                    handleAddCategory()
                  }
                }
              }}
            />

            {/* Parent Category Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría Padre (Opcional)
              </label>
              <select
                value={parentCategoryId || ''}
                onChange={e => setParentCategoryId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={editingCategory && getSubcategories(categories, editingCategory.id).length > 0}
              >
                <option value="">Sin categoría padre (Raíz)</option>
                {getRootCategories(categories)
                  .filter(cat => !editingCategory || cat.id !== editingCategory.id)
                  .map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
              {editingCategory && getSubcategories(categories, editingCategory.id).length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  No puedes cambiar a subcategoría si ya tiene subcategorías propias
                </p>
              )}
            </div>

            {/* Show in Catalog Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={categoryShowInCatalog}
                onChange={e => setCategoryShowInCatalog(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Mostrar en catálogo</span>
              {!categoryShowInCatalog && (
                <EyeOff className="w-4 h-4 text-gray-400" />
              )}
            </label>

            <div className="flex gap-2">
              <Button
                onClick={editingCategory ? handleUpdateCategory : handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="flex-1"
              >
                {editingCategory ? (
                  <>
                    <Edit className="w-4 h-4 mr-2" />
                    Actualizar
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar
                  </>
                )}
              </Button>
              {editingCategory && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingCategory(null)
                    setNewCategoryName('')
                    setParentCategoryId(null)
                    setCategoryShowInCatalog(true)
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </div>

          {/* Categories List */}
          {categories.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {/* Render Root Categories */}
              {getRootCategories(categories).map((category) => {
                // Count products for this category (compare by ID or name for backward compatibility)
                const productCount = products.filter(p => p.category === category.id || p.category === category.name).length
                const subcategories = getSubcategories(categories, category.id)
                const isSelected = selectedCategories.has(category.id)
                const isDeletable = canDeleteCategory(category.id)

                return (
                  <div key={category.id}>
                    {/* Root Category */}
                    <div className={`flex items-center justify-between p-3 rounded-lg border ${isSelected ? 'bg-primary-50 border-primary-300' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleCategorySelection(category.id)}
                          className="flex-shrink-0"
                          title={isDeletable ? 'Seleccionar para eliminar' : 'No se puede eliminar (tiene productos o subcategorías)'}
                        >
                          {isSelected ? (
                            <CheckSquare className={`w-5 h-5 ${isDeletable ? 'text-primary-600' : 'text-gray-400'}`} />
                          ) : (
                            <Square className={`w-5 h-5 ${isDeletable ? 'text-gray-400 hover:text-gray-600' : 'text-gray-300'}`} />
                          )}
                        </button>
                        <Folder className={`w-5 h-5 ${category.showInCatalog === false ? 'text-gray-400' : 'text-primary-600'}`} />
                        <div>
                          <p className={`font-medium ${category.showInCatalog === false ? 'text-gray-400' : 'text-gray-900'}`}>
                            {category.name}
                            {category.showInCatalog === false && <EyeOff className="w-3.5 h-3.5 inline ml-1.5 text-gray-400" />}
                          </p>
                          <p className="text-xs text-gray-500">
                            {productCount} {productCount === 1 ? 'producto' : 'productos'}
                            {subcategories.length > 0 && ` • ${subcategories.length} subcategoría${subcategories.length === 1 ? '' : 's'}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleMoveCategoryOrder(category.id, -1)}
                          className="p-1.5 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                          title="Subir"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveCategoryOrder(category.id, 1)}
                          className="p-1.5 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                          title="Bajar"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEditCategory(category)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Eliminar"
                          disabled={productCount > 0 || subcategories.length > 0}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Subcategories */}
                    {subcategories.length > 0 && (
                      <div className="ml-8 mt-2 space-y-2">
                        {subcategories.map((subcategory) => {
                          const subProductCount = products.filter(p => p.category === subcategory.id || p.category === subcategory.name).length
                          const isSubSelected = selectedCategories.has(subcategory.id)
                          const isSubDeletable = canDeleteCategory(subcategory.id)
                          return (
                            <div
                              key={subcategory.id}
                              className={`flex items-center justify-between p-2 rounded-lg border ${isSubSelected ? 'bg-primary-50 border-primary-300' : 'bg-white border-gray-200'}`}
                            >
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleCategorySelection(subcategory.id)}
                                  className="flex-shrink-0"
                                  title={isSubDeletable ? 'Seleccionar para eliminar' : 'No se puede eliminar (tiene productos)'}
                                >
                                  {isSubSelected ? (
                                    <CheckSquare className={`w-4 h-4 ${isSubDeletable ? 'text-primary-600' : 'text-gray-400'}`} />
                                  ) : (
                                    <Square className={`w-4 h-4 ${isSubDeletable ? 'text-gray-400 hover:text-gray-600' : 'text-gray-300'}`} />
                                  )}
                                </button>
                                <div className="w-5 flex items-center justify-center">
                                  <div className="w-3 h-3 border-l-2 border-b-2 border-gray-300"></div>
                                </div>
                                <Folder className={`w-4 h-4 ${subcategory.showInCatalog === false ? 'text-gray-300' : 'text-gray-500'}`} />
                                <div>
                                  <p className={`text-sm font-medium ${subcategory.showInCatalog === false ? 'text-gray-400' : 'text-gray-900'}`}>
                                    {subcategory.name}
                                    {subcategory.showInCatalog === false && <EyeOff className="w-3 h-3 inline ml-1 text-gray-400" />}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {subProductCount} {subProductCount === 1 ? 'producto' : 'productos'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleMoveCategoryOrder(subcategory.id, -1)}
                                  className="p-1 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                                  title="Subir"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleMoveCategoryOrder(subcategory.id, 1)}
                                  className="p-1 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                                  title="Bajar"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleEditCategory(subcategory)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Editar"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(subcategory.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Eliminar"
                                  disabled={subProductCount > 0}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderPlus className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No hay categorías creadas</p>
              <p className="text-sm text-gray-500 mt-1">
                Crea tu primera categoría para organizar tus productos
              </p>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsCategoryModalOpen(false)
                setEditingCategory(null)
                setNewCategoryName('')
                setParentCategoryId(null)
                setSelectedCategories(new Set())
              }}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Gestionar Marcas */}
      <Modal
        isOpen={isBrandsModalOpen}
        onClose={() => {
          setIsBrandsModalOpen(false)
          setEditingBrand(null)
          setNewBrandName('')
          setShowMigrationPreview(false)
          setMigrationSelected(new Set())
        }}
        title="Gestionar Marcas"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              Las marcas te permiten organizar productos por fabricante y generar reportes de ventas por marca.
              Por ejemplo: Nike, Samsung, Coca-Cola.
            </p>
          </div>

          {/* Banner de migración: detectar marcas escritas a mano sin administrar */}
          {(() => {
            const handwritten = detectHandwrittenBrands()
            if (handwritten.length === 0) return null
            const totalProducts = handwritten.reduce((sum, g) => sum + g.productIds.length, 0)
            return (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-900">
                      Tenés {handwritten.length} marca{handwritten.length !== 1 ? 's' : ''} escrita{handwritten.length !== 1 ? 's' : ''} a mano sin administrar
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Detecté {handwritten.length} marca{handwritten.length !== 1 ? 's' : ''} en {totalProducts} producto{totalProducts !== 1 ? 's' : ''} que no están vinculadas a marcas administradas.
                    </p>
                  </div>
                </div>
                {!showMigrationPreview ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      // Pre-seleccionar todas por default
                      setMigrationSelected(new Set(handwritten.map(g => g.key)))
                      setShowMigrationPreview(true)
                    }}
                    className="w-full"
                  >
                    Revisar e importar
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-white border border-amber-200 rounded-lg divide-y max-h-64 overflow-y-auto">
                      {handwritten.map(g => (
                        <label key={g.key} className="flex items-start gap-2 p-2.5 hover:bg-amber-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={migrationSelected.has(g.key)}
                            onChange={(e) => {
                              const next = new Set(migrationSelected)
                              if (e.target.checked) next.add(g.key)
                              else next.delete(g.key)
                              setMigrationSelected(next)
                            }}
                            className="w-4 h-4 mt-0.5 text-primary-600 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-gray-900 truncate">{g.displayName}</span>
                              <span className="text-xs text-gray-500 flex-shrink-0">{g.productIds.length} prod.</span>
                            </div>
                            {g.variants.length > 1 && (
                              <p className="text-xs text-amber-700 mt-0.5">
                                Variantes: {g.variants.join(' · ')}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-600">
                        {migrationSelected.size} de {handwritten.length} seleccionada{handwritten.length !== 1 ? 's' : ''}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowMigrationPreview(false)
                            setMigrationSelected(new Set())
                          }}
                          disabled={isMigratingBrands}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleMigrateBrands}
                          disabled={isMigratingBrands || migrationSelected.size === 0}
                        >
                          {isMigratingBrands ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importando...</>
                          ) : (
                            `Importar ${migrationSelected.size}`
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Add/Edit Brand Form */}
          <div className="space-y-2">
            <Input
              value={newBrandName}
              onChange={e => setNewBrandName(e.target.value)}
              placeholder="Nombre de la marca"
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  if (editingBrand) handleUpdateBrand()
                  else handleAddBrand()
                }
              }}
              disabled={isSavingBrand}
            />
            <div className="flex gap-2">
              {editingBrand && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setEditingBrand(null)
                    setNewBrandName('')
                  }}
                  disabled={isSavingBrand}
                >
                  Cancelar edición
                </Button>
              )}
              <Button
                className="flex-1"
                onClick={editingBrand ? handleUpdateBrand : handleAddBrand}
                disabled={isSavingBrand || !newBrandName.trim()}
              >
                {isSavingBrand ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</>
                ) : editingBrand ? (
                  'Actualizar marca'
                ) : (
                  <><Plus className="w-4 h-4 mr-2" /> Agregar marca</>
                )}
              </Button>
            </div>
          </div>

          {/* Lista de marcas */}
          {brands.length > 0 ? (
            <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
              {[...brands].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })).map(brand => {
                const productCount = products.filter(p => p.brandId === brand.id).length
                return (
                  <div key={brand.id} className="flex items-center justify-between p-2.5 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{brand.name}</p>
                      <p className="text-xs text-gray-500">{productCount} producto{productCount !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditBrand(brand)}
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBrand(brand.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                        title={productCount > 0 ? 'No se puede eliminar: hay productos vinculados' : 'Eliminar'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
              <Tag className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p>No hay marcas administradas todavía</p>
              <p className="text-xs text-gray-400">Creá tu primera marca arriba</p>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsBrandsModalOpen(false)
                setEditingBrand(null)
                setNewBrandName('')
                setShowMigrationPreview(false)
                setMigrationSelected(new Set())
              }}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Actions Modal */}
      <Modal
        isOpen={bulkActionModalOpen}
        onClose={closeBulkActionModal}
        title={
          bulkAction === 'delete'
            ? 'Eliminar productos seleccionados'
            : bulkAction === 'changeCategory'
            ? 'Cambiar categoría'
            : bulkAction === 'showInCatalog'
            ? 'Mostrar en catálogo'
            : 'Activar/Desactivar productos'
        }
        size="md"
      >
        <div className="space-y-4">
          {bulkAction === 'delete' && (
            <>
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-900">
                      ¿Estás seguro de que deseas eliminar {selectedProducts.size} producto{selectedProducts.size !== 1 ? 's' : ''}?
                    </p>
                    <p className="text-sm text-red-700 mt-1">
                      Esta acción no se puede deshacer. Los productos se eliminarán permanentemente.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeBulkActionModal} disabled={isProcessingBulk}>
                  Cancelar
                </Button>
                <Button variant="danger" onClick={handleBulkDelete} disabled={isProcessingBulk}>
                  {isProcessingBulk ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar {selectedProducts.size} producto{selectedProducts.size !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {bulkAction === 'changeCategory' && (
            <>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  Cambiarás la categoría de {selectedProducts.size} producto{selectedProducts.size !== 1 ? 's' : ''} seleccionado{selectedProducts.size !== 1 ? 's' : ''}.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nueva Categoría
                </label>
                <Select
                  value={bulkCategoryChange}
                  onChange={e => setBulkCategoryChange(e.target.value)}
                  className="w-full"
                >
                  <option value="">Seleccionar categoría...</option>
                  {getRootCategories(categories).map(category => {
                    const subcategories = getSubcategories(categories, category.id)
                    return (
                      <React.Fragment key={category.id}>
                        <option value={category.id}>{category.name}</option>
                        {subcategories.map(subcat => (
                          <option key={subcat.id} value={subcat.id}>
                            &nbsp;&nbsp;→ {subcat.name}
                          </option>
                        ))}
                      </React.Fragment>
                    )
                  })}
                  <option value="">Sin categoría</option>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeBulkActionModal} disabled={isProcessingBulk}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleBulkCategoryChange}
                  disabled={isProcessingBulk || !bulkCategoryChange}
                >
                  {isProcessingBulk ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <FolderEdit className="w-4 h-4 mr-2" />
                      Cambiar Categoría
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {bulkAction === 'toggleActive' && (
            <>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <p className="text-sm text-blue-800 font-medium">
                  Vas a cambiar el estado de {selectedProducts.size} producto{selectedProducts.size !== 1 ? 's' : ''}.
                </p>
                <p className="text-xs text-blue-700">
                  Los productos <strong>activos</strong> aparecen en el POS, en el catálogo público y se pueden vender.
                </p>
                <p className="text-xs text-blue-700">
                  Los productos <strong>inactivos</strong> quedan ocultos del POS y del catálogo, pero <strong>no se eliminan</strong> — siguen en el inventario y puedes reactivarlos cuando quieras.
                </p>
                <p className="text-xs text-blue-700">
                  Esta acción <strong>invierte</strong> el estado actual de cada uno (activo → inactivo, inactivo → activo).
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeBulkActionModal} disabled={isProcessingBulk}>
                  Cancelar
                </Button>
                <Button onClick={handleBulkToggleActive} disabled={isProcessingBulk}>
                  {isProcessingBulk ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <Package className="w-4 h-4 mr-2" />
                      Cambiar Estado
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {bulkAction === 'showInCatalog' && (
            <>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  ¿Qué quieres hacer con los {selectedProducts.size} producto{selectedProducts.size !== 1 ? 's' : ''} seleccionado{selectedProducts.size !== 1 ? 's' : ''}?
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Elige si mostrarlos u ocultarlos en el catálogo público.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <Button variant="outline" onClick={closeBulkActionModal} disabled={isProcessingBulk}>
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleBulkSetShowInCatalog(false)}
                  disabled={isProcessingBulk}
                >
                  {isProcessingBulk ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-4 h-4 mr-2" />
                      Ocultar del catálogo
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handleBulkSetShowInCatalog(true)}
                  disabled={isProcessingBulk}
                >
                  {isProcessingBulk ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Mostrar en catálogo
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Import Products Modal */}
      <ImportProductsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportProducts}
        brands={brands}
      />

      {/* Modal de impresión de etiquetas */}
      <Modal
        isOpen={labelModalOpen}
        onClose={() => setLabelModalOpen(false)}
        title="Imprimir etiquetas de código de barras"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Configura el tamaño y la cantidad de etiquetas por producto.
          </p>

          {/* Selector de tamaño de etiqueta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tamaño de etiqueta
            </label>
            <select
              value={labelSize}
              onChange={(e) => setLabelSize(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              <option value="30x20">30 × 20 mm (3 × 2 cm)</option>
              <option value="50x38">50 × 38 mm (5 × 3.8 cm)</option>
              <option value="58x40">58 × 40 mm (5.8 × 4 cm)</option>
            </select>
          </div>

          {/* Lista de productos seleccionados */}
          <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {products.filter(p => selectedProducts.has(p.id)).map(product => (
              <div key={product.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                  <p className="text-xs text-gray-500">
                    {product.code || product.sku || 'Sin código'}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <label className="text-xs text-gray-500">Cant:</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={labelQuantities[product.id] || 1}
                    onChange={(e) => setLabelQuantities(prev => ({
                      ...prev,
                      [product.id]: Math.max(1, Math.min(100, parseInt(e.target.value) || 1))
                    }))}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Info */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-700">
              <strong>Tamaño seleccionado:</strong> {labelSize.replace('x', ' × ')} mm — Asegúrate de tener la impresora de etiquetas configurada en Windows con ese tamaño de papel.
              Los productos sin código de barras usarán su SKU o un código generado automáticamente.
            </p>
          </div>

          {/* Total */}
          <p className="text-sm text-gray-700">
            Total: <strong>{Object.values(labelQuantities).reduce((a, b) => a + b, 0)}</strong> etiquetas de <strong>{selectedProducts.size}</strong> productos
          </p>

          {/* Bloque alternativo: imprimir en ticketera térmica POS (58/80mm) */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
            <p className="text-xs text-amber-800">
              <strong>Ticketera térmica del POS</strong> — imprime los códigos en tira continua a la impresora ya conectada (Bluetooth/WiFi). El barcode lo genera la propia impresora (ESC/POS nativo). Sólo disponible en la app móvil.
            </p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-amber-800 font-medium">Ancho de papel:</label>
              <select
                value={thermalPaperWidth}
                onChange={(e) => setThermalPaperWidth(Number(e.target.value))}
                className="text-xs px-2 py-1 border border-amber-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value={58}>58 mm</option>
                <option value={80}>80 mm</option>
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePrintBarcodesThermal}
                disabled={printingThermal || selectedProducts.size === 0}
                className="ml-auto"
              >
                {printingThermal ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4 mr-2" />
                )}
                Imprimir en ticketera
              </Button>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setLabelModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePrintLabels}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir etiquetas
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
