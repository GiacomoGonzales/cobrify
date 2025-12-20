import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Edit, Trash2, Package, Loader2, AlertTriangle, DollarSign, Folder, FolderPlus, Tag, X, FileSpreadsheet, Upload, ChevronDown, ChevronRight, Warehouse, CheckSquare, Square, CheckCheck, FolderEdit, Calendar, Eye, Truck, ArrowUpDown, ArrowUp, ArrowDown, Image, Camera, Pill, ScanBarcode } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { productSchema } from '@/utils/schemas'
import { formatCurrency } from '@/lib/utils'
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductCategories,
  saveProductCategories,
} from '@/services/firestoreService'
import { generateProductsExcel } from '@/services/productExportService'
import ImportProductsModal from '@/components/ImportProductsModal'
import { getWarehouses, updateWarehouseStock, getDefaultWarehouse, createWarehouse } from '@/services/warehouseService'
import ProductModifiersSection from '@/components/ProductModifiersSection'
import { uploadProductImage, deleteProductImage, createImagePreview, revokeImagePreview } from '@/services/productImageService'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

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
  return categories.filter(cat => cat.parentId === null)
}

const getSubcategories = (categories, parentId) => {
  return categories.filter(cat => cat.parentId === parentId)
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
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showExpiringOnly, setShowExpiringOnly] = useState(false) // Filtro de vencimiento
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [deletingProduct, setDeletingProduct] = useState(null)
  const [viewingProduct, setViewingProduct] = useState(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isScanningBarcode, setIsScanningBarcode] = useState(false)
  const [isScanningSearch, setIsScanningSearch] = useState(false)
  const [noStock, setNoStock] = useState(false)
  const [allowDecimalQuantity, setAllowDecimalQuantity] = useState(false) // Venta por peso
  const [trackExpiration, setTrackExpiration] = useState(false) // Control de vencimiento
  const [catalogVisible, setCatalogVisible] = useState(false) // Visible en catálogo público
  const [expandedProduct, setExpandedProduct] = useState(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState('') // Almacén para stock inicial

  // Paginación en cliente
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)

  // Ordenamiento
  const [sortField, setSortField] = useState('name') // 'name', 'code', 'price', 'stock', 'category'
  const [sortDirection, setSortDirection] = useState('asc') // 'asc' o 'desc'

  // Variant management state
  const [hasVariants, setHasVariants] = useState(false)
  const [variantAttributes, setVariantAttributes] = useState([]) // ["size", "color"]
  const [newAttributeName, setNewAttributeName] = useState('')
  const [variants, setVariants] = useState([]) // [{ sku, attributes: {size: "M", color: "Red"}, price, stock }]
  const [newVariant, setNewVariant] = useState({ sku: '', attributes: {}, price: '', stock: '' })

  // Category management state
  const [categories, setCategories] = useState([])
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [parentCategoryId, setParentCategoryId] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  const [isDeletingCategories, setIsDeletingCategories] = useState(false)

  // Import modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // Bulk actions state
  const [selectedProducts, setSelectedProducts] = useState(new Set())
  const [bulkActionModalOpen, setBulkActionModalOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState(null) // 'delete', 'changeCategory', 'toggleActive'
  const [bulkCategoryChange, setBulkCategoryChange] = useState('')
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)

  // Modifiers state (for restaurant mode)
  const [modifiers, setModifiers] = useState([])

  // Tax affectation state (IGV: Gravado, Exonerado, Inafecto)
  const [taxAffectation, setTaxAffectation] = useState('10') // '10' = Gravado (default), '20' = Exonerado, '30' = Inafecto

  // Pharmacy mode state
  const [pharmacyData, setPharmacyData] = useState({
    genericName: '',           // Denominación Común Internacional (DCI)
    concentration: '',         // Ej: 500mg, 100ml
    presentation: '',          // Ej: Tabletas x 100, Jarabe 120ml
    laboratoryId: '',          // ID del laboratorio
    laboratoryName: '',        // Nombre del laboratorio (para mostrar)
    batchNumber: '',           // Número de lote
    activeIngredient: '',      // Principio activo
    therapeuticAction: '',     // Acción terapéutica (Analgésico, Antibiótico, etc.)
    saleCondition: 'sin_receta', // sin_receta | con_receta | receta_retenida
    requiresPrescription: false,
    sanitaryRegistry: '',      // Registro sanitario DIGEMID
    location: '',              // Ubicación en estante/anaquel
  })
  const [laboratories, setLaboratories] = useState([]) // Lista de laboratorios para el select

  // Image upload state
  const [productImage, setProductImage] = useState(null) // File object
  const [productImagePreview, setProductImagePreview] = useState(null) // URL preview
  const [uploadingImage, setUploadingImage] = useState(false)

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
      cost: '',
      unit: 'NIU',
      category: '',
      stock: '',
      noStock: false,
      trackExpiration: false,
      expirationDate: '',
    },
  })

  // Cargar productos y almacenes
  useEffect(() => {
    loadProducts()
    loadWarehouses()
    // Cargar laboratorios solo en modo farmacia
    if (businessMode === 'pharmacy') {
      loadLaboratories()
    }
  }, [user, businessMode])

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
      const [productsResult, categoriesResult] = await Promise.all([
        getProducts(businessId),
        getProductCategories(businessId)
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
      } else {
        console.error('Error al cargar almacenes:', result.error)
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
    setHasVariants(false)
    setVariantAttributes([])
    setVariants([])
    setNewAttributeName('')
    setNewVariant({ sku: '', attributes: {}, price: '', stock: '' })
    // Resetear almacén seleccionado al almacén por defecto
    const defaultWh = warehouses.find(wh => wh.isDefault)
    setSelectedWarehouse(defaultWh?.id || (warehouses.length > 0 ? warehouses[0].id : ''))
    reset({
      code: '',
      sku: '',
      name: '',
      description: '',
      price: '',
      cost: '',
      unit: 'NIU',
      category: '',
      stock: '',
      noStock: false,
      trackExpiration: false,
      expirationDate: '',
    })
    setModifiers([]) // Limpiar modificadores
    setTaxAffectation('10') // Default: Gravado
    // Resetear datos de farmacia
    setPharmacyData({
      genericName: '',
      concentration: '',
      presentation: '',
      laboratoryId: '',
      laboratoryName: '',
      batchNumber: '',
      activeIngredient: '',
      therapeuticAction: '',
      saleCondition: 'sin_receta',
      requiresPrescription: false,
      sanitaryRegistry: '',
      location: '',
    })
    setIsModalOpen(true)
  }

  const openEditModal = product => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingProduct(product)
    const hasNoStock = product.stock === null || product.stock === undefined
    setNoStock(hasNoStock)

    // Set decimal quantity state (venta por peso)
    setAllowDecimalQuantity(product.allowDecimalQuantity || false)

    // Set expiration tracking state
    const hasExpiration = product.trackExpiration || false
    setTrackExpiration(hasExpiration)

    // Load variant data if product has variants
    const productHasVariants = product.hasVariants || false
    setHasVariants(productHasVariants)
    setVariantAttributes(product.variantAttributes || [])
    setVariants(product.variants || [])
    setNewAttributeName('')
    setNewVariant({ sku: '', attributes: {}, price: '', stock: '' })

    // Load modifiers if product has them (restaurant mode)
    setModifiers(product.modifiers || [])

    // Load pharmacy data if exists (pharmacy mode)
    setPharmacyData({
      genericName: product.genericName || '',
      concentration: product.concentration || '',
      presentation: product.presentation || '',
      laboratoryId: product.laboratoryId || '',
      laboratoryName: product.laboratoryName || '',
      batchNumber: product.batchNumber || '',
      activeIngredient: product.activeIngredient || '',
      therapeuticAction: product.therapeuticAction || '',
      saleCondition: product.saleCondition || 'sin_receta',
      requiresPrescription: product.requiresPrescription || false,
      sanitaryRegistry: product.sanitaryRegistry || '',
      location: product.location || '',
    })

    // Load tax affectation (default to '10' = Gravado if not set for backwards compatibility)
    setTaxAffectation(product.taxAffectation || '10')

    // Load catalog visibility
    setCatalogVisible(product.catalogVisible || false)

    // Load product image if exists
    setProductImage(null)
    setProductImagePreview(product.imageUrl || null)

    // Format expiration date if exists (from Firestore Timestamp to YYYY-MM-DD)
    let formattedExpirationDate = ''
    if (product.expirationDate) {
      const expDate = product.expirationDate.toDate ? product.expirationDate.toDate() : new Date(product.expirationDate)
      formattedExpirationDate = expDate.toISOString().split('T')[0]
    }

    reset({
      code: product.code || '',
      sku: product.sku || '',
      name: product.name,
      description: product.description || '',
      price: productHasVariants ? '' : (product.price?.toString() || ''),
      cost: product.cost?.toString() || '',
      unit: product.unit || 'NIU',
      category: product.category || '',
      // Si no tiene initialStock definido, usar 0 (productos creados antes de esta feature o desde compras)
      initialStock: hasNoStock ? '' : (product.initialStock !== undefined && product.initialStock !== null ? product.initialStock.toString() : '0'),
      noStock: hasNoStock,
      trackExpiration: hasExpiration,
      expirationDate: formattedExpirationDate,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingProduct(null)
    setSelectedWarehouse('')
    setModifiers([]) // Limpiar modificadores
    // Limpiar imagen
    if (productImagePreview) {
      revokeImagePreview(productImagePreview)
    }
    setProductImage(null)
    setProductImagePreview(null)
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

    // Validar código de barras duplicado (solo si se ingresó uno)
    if (data.code && data.code.trim()) {
      const codeToCheck = data.code.trim().toUpperCase()
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

    // Validar SKU duplicado (solo si se ingresó uno)
    if (data.sku && data.sku.trim()) {
      const skuToCheck = data.sku.trim().toUpperCase()
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
      // Build product data based on hasVariants
      const productData = {
        code: data.code || '',
        sku: data.sku || '',
        name: data.name,
        description: data.description || '',
        unit: data.unit,
        category: data.category || '',
        cost: data.cost && data.cost !== '' ? parseFloat(data.cost) : null,
        hasVariants: hasVariants,
        trackExpiration: trackExpiration,
        expirationDate: trackExpiration && data.expirationDate ? new Date(data.expirationDate) : null,
        allowDecimalQuantity: allowDecimalQuantity, // Venta por peso (decimales)
        taxAffectation: taxAffectation, // '10' = Gravado, '20' = Exonerado, '30' = Inafecto (SUNAT Catálogo 07)
        catalogVisible: catalogVisible, // Visible en catálogo público
        // Add modifiers if in restaurant mode (only include if exists)
        ...(businessMode === 'restaurant' && modifiers ? { modifiers } : {}),
        // Add pharmacy data if in pharmacy mode
        ...(businessMode === 'pharmacy' ? {
          genericName: pharmacyData.genericName || null,
          concentration: pharmacyData.concentration || null,
          presentation: pharmacyData.presentation || null,
          laboratoryId: pharmacyData.laboratoryId || null,
          laboratoryName: pharmacyData.laboratoryName || null,
          batchNumber: pharmacyData.batchNumber || null,
          activeIngredient: pharmacyData.activeIngredient || null,
          therapeuticAction: pharmacyData.therapeuticAction || null,
          saleCondition: pharmacyData.saleCondition || 'sin_receta',
          requiresPrescription: pharmacyData.saleCondition !== 'sin_receta',
          sanitaryRegistry: pharmacyData.sanitaryRegistry || null,
          location: pharmacyData.location || null,
        } : {}),
      }

      if (hasVariants) {
        // Product with variants
        productData.variantAttributes = variantAttributes
        productData.variants = variants.map(v => ({
          sku: v.sku,
          attributes: v.attributes,
          price: typeof v.price === 'string' ? parseFloat(v.price) : v.price,
          stock: v.stock === '' || v.stock === null ? null : (typeof v.stock === 'string' ? parseInt(v.stock) : v.stock),
        }))
        // Calculate base price as average of variant prices
        const avgPrice = productData.variants.reduce((sum, v) => sum + v.price, 0) / productData.variants.length
        productData.basePrice = parseFloat(avgPrice.toFixed(2))
        // Don't include single price/stock for variant products
        productData.price = null
        productData.stock = null
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
            // Al crear, initialStock y stock son el mismo valor inicial
            const initialStockValue = data.initialStock === '' ? null : parseInt(data.initialStock)
            productData.stock = initialStockValue
            productData.initialStock = initialStockValue

            // Si hay stock inicial y almacenes disponibles, asignar al almacén seleccionado
            if (initialStockValue && initialStockValue > 0 && selectedWarehouse) {
              productData.warehouseStocks = [{
                warehouseId: selectedWarehouse,
                stock: initialStockValue,
                minStock: 0
              }]
            } else {
              productData.warehouseStocks = []
            }
          }
        }

        // Clear variant fields
        productData.variantAttributes = []
        productData.variants = []
      }

      // Handle product image upload (only if feature is enabled)
      if (canUseProductImages && productImage) {
        try {
          setUploadingImage(true)
          const businessId = getBusinessId()
          const tempProductId = editingProduct?.id || `temp_${Date.now()}`
          const imageUrl = await uploadProductImage(businessId, tempProductId, productImage)
          productData.imageUrl = imageUrl
        } catch (imageError) {
          console.error('Error al subir imagen:', imageError)
          toast.error('Error al subir la imagen. El producto se guardará sin imagen.')
        } finally {
          setUploadingImage(false)
        }
      } else if (editingProduct?.imageUrl && !productImagePreview) {
        // Si se eliminó la imagen, limpiar la URL
        productData.imageUrl = null
      } else if (editingProduct?.imageUrl && productImagePreview && !productImage) {
        // Mantener la imagen existente si no se cambió
        productData.imageUrl = editingProduct.imageUrl
      }

      let result

      if (editingProduct) {
        // Update
        result = await updateProduct(getBusinessId(), editingProduct.id, productData)
      } else {
        // Create
        result = await createProduct(getBusinessId(), productData)
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

  // Handle image selection
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      toast.error('Tipo de archivo no válido. Use JPG, PNG, WebP o GIF.')
      return
    }

    // Validar tamaño (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error('La imagen es muy grande. Máximo 5MB.')
      return
    }

    // Limpiar preview anterior
    if (productImagePreview && productImagePreview.startsWith('blob:')) {
      revokeImagePreview(productImagePreview)
    }

    // Crear preview
    const previewUrl = createImagePreview(file)
    setProductImage(file)
    setProductImagePreview(previewUrl)
  }

  // Handle image removal
  const handleImageRemove = () => {
    if (productImagePreview && productImagePreview.startsWith('blob:')) {
      revokeImagePreview(productImagePreview)
    }
    setProductImage(null)
    setProductImagePreview(null)
  }

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
        throw new Error(result.error)
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

      // Obtener datos del negocio
      const { getCompanySettings } = await import('@/services/firestoreService');
      const settingsResult = await getCompanySettings(getBusinessId());
      const businessData = settingsResult.success ? settingsResult.data : null;

      // Generar Excel
      await generateProductsExcel(products, categories, businessData);
      toast.success(`${products.length} producto(s) exportado(s) exitosamente`);
    } catch (error) {
      console.error('Error al exportar productos:', error);
      toast.error('Error al generar el archivo Excel');
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
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
      if (!available) {
        toast.info('Instalando módulo de escáner... Por favor espera')
        await BarcodeScanner.installGoogleBarcodeScannerModule()
        toast.success('Módulo instalado. Intenta escanear de nuevo.')
        setIsScanningBarcode(false)
        return
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

      if (barcodes && barcodes.length > 0) {
        const scannedCode = barcodes[0].rawValue
        console.log('Código escaneado:', scannedCode)

        // Establecer el código en el formulario
        setValue('code', scannedCode)
        toast.success(`Código escaneado: ${scannedCode}`)
      }
    } catch (error) {
      console.error('Error al escanear:', error)
      if (error.message !== 'User cancelled the scan') {
        toast.error('Error al escanear el código de barras')
      }
    } finally {
      setIsScanningBarcode(false)
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
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
      if (!available) {
        toast.info('Instalando módulo de escáner... Por favor espera')
        await BarcodeScanner.installGoogleBarcodeScannerModule()
        toast.success('Módulo instalado. Intenta escanear de nuevo.')
        setIsScanningSearch(false)
        return
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

      if (barcodes && barcodes.length > 0) {
        const scannedCode = barcodes[0].rawValue

        // Buscar el producto con ese código
        const foundProduct = products.find(p => p.code === scannedCode || p.sku === scannedCode)

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
      if (error.message !== 'User cancelled the scan') {
        toast.error('Error al escanear el código de barras')
      }
    } finally {
      setIsScanningSearch(false)
    }
  }

  const handleImportProducts = async (productsToImport) => {
    if (!user?.uid) return { success: 0, errors: ['Usuario no autenticado'] }

    const errors = []
    let successCount = 0

    try {
      // Obtener almacenes existentes
      const warehousesResult = await getWarehouses(getBusinessId())
      let existingWarehouses = warehousesResult.success ? warehousesResult.data : []

      // Crear un mapa de almacenes por nombre para búsqueda rápida
      const warehouseMap = new Map()
      existingWarehouses.forEach(wh => {
        warehouseMap.set(wh.name.toLowerCase().trim(), wh)
      })

      // Identificar almacenes únicos que necesitan ser creados
      const uniqueWarehouseNames = new Set()
      for (const product of productsToImport) {
        if (product.warehouse && product.warehouse.trim() !== '') {
          const warehouseName = product.warehouse.trim()
          const warehouseKey = warehouseName.toLowerCase()

          // Si no existe en el mapa, agregarlo al set de nuevos
          if (!warehouseMap.has(warehouseKey)) {
            uniqueWarehouseNames.add(warehouseName)
          }
        }
      }

      // Crear almacenes nuevos
      if (uniqueWarehouseNames.size > 0) {
        for (const warehouseName of uniqueWarehouseNames) {
          const newWarehouse = {
            name: warehouseName,
            location: warehouseName,
            description: `Almacén creado automáticamente durante importación de productos`,
            isDefault: existingWarehouses.length === 0, // Solo el primero es default si no hay almacenes
            isActive: true
          }

          const createResult = await createWarehouse(getBusinessId(), newWarehouse)

          if (createResult.success) {
            const createdWarehouse = createResult.data
            existingWarehouses.push(createdWarehouse)
            warehouseMap.set(warehouseName.toLowerCase().trim(), createdWarehouse)
            console.log('✅ Almacén creado:', createdWarehouse)
          } else {
            console.error('❌ Error al crear almacén:', createResult.error)
          }
        }

        if (uniqueWarehouseNames.size > 0) {
          toast.info(`${uniqueWarehouseNames.size} almacén(es) creado(s) automáticamente`)
        }
      }

      // Obtener almacén predeterminado como fallback
      let defaultWarehouse = null
      const defaultWarehouseResult = await getDefaultWarehouse(getBusinessId())

      if (defaultWarehouseResult.success && defaultWarehouseResult.data) {
        defaultWarehouse = defaultWarehouseResult.data
      } else if (existingWarehouses.length === 0) {
        // NO HAY ALMACENES - Crear uno automáticamente como fallback
        console.log('No se encontró ningún almacén, creando almacén principal...')

        const newWarehouse = {
          name: 'Almacén Principal',
          location: 'Principal',
          description: 'Almacén creado automáticamente durante importación de productos',
          isDefault: true,
          isActive: true
        }

        const createResult = await createWarehouse(getBusinessId(), newWarehouse)

        if (createResult.success) {
          defaultWarehouse = createResult.data
          existingWarehouses.push(defaultWarehouse)
          warehouseMap.set('almacén principal', defaultWarehouse)
          toast.info('Almacén principal creado automáticamente')
          console.log('✅ Almacén creado:', defaultWarehouse)
        } else {
          console.error('❌ Error al crear almacén:', createResult.error)
          toast.warning('No se pudo crear almacén automático. Los productos se importarán sin stock asignado.')
        }
      }

      // Crear un mapa de categorías nuevas que se necesitan crear
      const newCategoriesNeeded = new Set()
      const updatedCategories = [...categories]

      // Identificar categorías que no existen
      for (const product of productsToImport) {
        if (product.category && product.category.trim() !== '') {
          const categoryName = product.category.trim()
          // Verificar si la categoría ya existe (por nombre)
          const categoryExists = updatedCategories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())

          if (!categoryExists) {
            newCategoriesNeeded.add(categoryName)
          }
        }
      }

      // Crear las categorías nuevas
      if (newCategoriesNeeded.size > 0) {
        for (const categoryName of newCategoriesNeeded) {
          const newCategory = {
            id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: categoryName,
            parentId: null,
          }
          updatedCategories.push(newCategory)
        }

        // Guardar las nuevas categorías en Firestore
        const saveCategoriesResult = await saveProductCategories(getBusinessId(), updatedCategories)
        if (saveCategoriesResult.success) {
          setCategories(updatedCategories)
          toast.info(`${newCategoriesNeeded.size} categoría(s) creada(s) automáticamente`)
        }
      }

      // Importar productos
      for (let i = 0; i < productsToImport.length; i++) {
        const product = productsToImport[i]

        try {
          // Convertir nombre de categoría a ID si existe
          if (product.category && product.category.trim() !== '') {
            const categoryName = product.category.trim()
            const foundCategory = updatedCategories.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase())
            if (foundCategory) {
              product.category = foundCategory.id
            }
          }

          // Asignar stock al almacén específico o al predeterminado
          if (product.stock && product.stock > 0 && product.trackStock) {
            let targetWarehouse = null

            // Intentar encontrar el almacén específico mencionado en el producto
            if (product.warehouse && product.warehouse.trim() !== '') {
              const warehouseKey = product.warehouse.trim().toLowerCase()
              targetWarehouse = warehouseMap.get(warehouseKey)
            }

            // Si no se encontró almacén específico, usar el predeterminado
            if (!targetWarehouse && defaultWarehouse) {
              targetWarehouse = defaultWarehouse
            }

            // Asignar stock al almacén encontrado
            if (targetWarehouse) {
              product.warehouseStocks = [{
                warehouseId: targetWarehouse.id,
                stock: product.stock,
                minStock: 0
              }]
            } else {
              product.warehouseStocks = []
            }
          } else if (!product.trackStock) {
            // Si no controla stock, asegurar que warehouseStocks esté vacío
            product.warehouseStocks = []
          }

          const result = await createProduct(getBusinessId(), product)

          if (result.success) {
            successCount++
          } else {
            errors.push(`Producto "${product.name}": ${result.error}`)
          }
        } catch (error) {
          errors.push(`Producto "${product.name}": ${error.message}`)
        }
      }

      // Recargar productos después de la importación
      await loadProducts()

      if (successCount > 0) {
        toast.success(`${successCount} producto(s) importado(s) exitosamente`)
      }

      if (errors.length > 0) {
        toast.error(`${errors.length} producto(s) no pudieron ser importados`)
      }

      return { success: successCount, errors }
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
    setIsCategoryModalOpen(true)
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !user?.uid) return

    try {
      const newCategory = {
        id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: newCategoryName.trim(),
        parentId: parentCategoryId,
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
  }

  const handleUpdateCategory = async () => {
    if (!newCategoryName.trim() || !editingCategory || !user?.uid) return

    try {
      const updatedCategories = categories.map(cat =>
        cat.id === editingCategory.id
          ? { ...cat, name: newCategoryName.trim(), parentId: parentCategoryId }
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

  const handleDeleteCategory = async (categoryId) => {
    if (!user?.uid) return

    const categoryToDelete = getCategoryById(categories, categoryId)
    if (!categoryToDelete) return

    // Verificar si tiene productos asignados (comparando por ID o nombre para compatibilidad)
    const hasProducts = products.some(p => p.category === categoryId || p.category === categoryToDelete.name)

    // Verificar si tiene subcategorías
    const hasSubcategories = getSubcategories(categories, categoryId).length > 0

    if (hasProducts) {
      toast.error('No puedes eliminar una categoría que tiene productos asignados', 5000)
      return
    }

    if (hasSubcategories) {
      toast.error('No puedes eliminar una categoría que tiene subcategorías', 5000)
      return
    }

    try {
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
      const updatedCategories = categories.filter(cat => !categoriesToDelete.includes(cat.id))
      setCategories(updatedCategories)

      const result = await saveProductCategories(getBusinessId(), updatedCategories)
      if (result.success) {
        const skipped = selectedCategories.size - categoriesToDelete.length
        if (skipped > 0) {
          toast.success(`${categoriesToDelete.length} categoría(s) eliminada(s). ${skipped} no se pudieron eliminar (tienen productos o subcategorías).`, 5000)
        } else {
          toast.success(`${categoriesToDelete.length} categoría(s) eliminada(s) exitosamente`)
        }
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
        toast.error(`${errorCount} producto(s) no pudieron ser eliminados`)
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
      attributes: { ...newVariant.attributes },
      price: parseFloat(newVariant.price),
      stock: newVariant.stock === '' ? null : parseInt(newVariant.stock),
    }])

    // Reset new variant form
    setNewVariant({
      sku: '',
      attributes: {},
      price: '',
      stock: '',
    })
  }

  const handleRemoveVariant = (index) => {
    setVariants(variants.filter((_, i) => i !== index))
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
      const search = searchTerm.toLowerCase()

      // Get category name for search (backward compatible)
      const categoryName = product.category
        ? (getCategoryById(categories, product.category)?.name || product.category)
        : ''

      const matchesSearch =
        product.code?.toLowerCase().includes(search) ||
        product.sku?.toLowerCase().includes(search) ||
        product.name?.toLowerCase().includes(search) ||
        categoryName.toLowerCase().includes(search) ||
        product.description?.toLowerCase().includes(search)

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

      return matchesSearch && matchesCategory && matchesExpiration
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
  }, [products, searchTerm, selectedCategoryFilter, showExpiringOnly, categories, sortField, sortDirection])

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
  }, [searchTerm, selectedCategoryFilter, showExpiringOnly])

  // Calcular estadísticas (optimizado con useMemo)
  const statistics = React.useMemo(() => {
    const totalValue = products.reduce((sum, product) => {
      const realStock = getRealStockValue(product)
      if (realStock && product.price) {
        return sum + realStock * product.price
      }
      return sum
    }, 0)

    const lowStockCount = products.filter(product => {
      const realStock = getRealStockValue(product)
      return realStock !== null && realStock < 4
    }).length

    const expiringProductsCount = products.filter(product => {
      if (!product.trackExpiration || !product.expirationDate) return false
      const expStatus = getExpirationStatus(product.expirationDate)
      return expStatus && (expStatus.status === 'expired' || expStatus.status === 'warning')
    }).length

    return { totalValue, lowStockCount, expiringProductsCount }
  }, [products])

  const { totalValue, lowStockCount, expiringProductsCount } = statistics

  // Calcular qué columnas tienen datos (para ocultar columnas vacías)
  const visibleColumns = React.useMemo(() => {
    return {
      image: products.some(p => p.imageUrl),
      sku: products.some(p => p.sku && p.sku.trim() !== ''),
      code: products.some(p => p.code && p.code.trim() !== ''),
      description: products.some(p => p.description && p.description.trim() !== ''),
      cost: products.some(p => p.cost !== undefined && p.cost !== null),
      category: products.some(p => p.category && p.category.trim() !== ''),
      expiration: products.some(p => p.trackExpiration && p.expirationDate),
    }
  }, [products])

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
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <Button
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="w-full sm:w-auto"
          >
            <Upload className="w-4 h-4 mr-2" />
            Importar Excel
          </Button>
          <Button
            variant="outline"
            onClick={handleExportToExcel}
            className="w-full sm:w-auto"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={openCategoryModal}
              className="flex-1 sm:flex-initial"
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              Categorías
            </Button>
            <Button onClick={openCreateModal} className="flex-1 sm:flex-initial">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Producto
            </Button>
          </div>
        </div>
      </div>

      {/* Search and Category Filter */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, nombre, categoría..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {Capacitor.isNativePlatform() && (
                <button
                  type="button"
                  onClick={handleScanSearch}
                  disabled={isScanningSearch}
                  className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center"
                  title="Escanear código de barras"
                >
                  {isScanningSearch ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ScanBarcode className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>

            {/* Filtro de vencimiento */}
            {expiringProductsCount > 0 && (
              <button
                onClick={() => setShowExpiringOnly(!showExpiringOnly)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  showExpiringOnly
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Próximos a vencer</span>
                <Badge variant="danger" className="bg-white text-red-700 ml-1">
                  {expiringProductsCount}
                </Badge>
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Tag className="w-3 h-3 inline mr-1" />
                Todas
              </button>
              {/* Render root categories and their subcategories */}
              {getRootCategories(categories).map((category) => {
                const subcats = getSubcategories(categories, category.id)
                return (
                  <React.Fragment key={category.id}>
                    <button
                      onClick={() => setSelectedCategoryFilter(category.id)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedCategoryFilter === category.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Folder className="w-3 h-3 inline mr-1" />
                      {category.name}
                    </button>
                    {/* Render subcategories with visual indicator */}
                    {subcats.map((subcat) => (
                      <button
                        key={subcat.id}
                        onClick={() => setSelectedCategoryFilter(subcat.id)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          selectedCategoryFilter === subcat.id
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Valor Inventario</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalValue)}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

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
            <div className="overflow-x-auto">
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
                {paginatedProducts.map(product => {
                  const isExpanded = expandedProduct === product.id
                  const hasWarehouseStocks = product.warehouseStocks && product.warehouseStocks.length > 0

                  return (
                    <React.Fragment key={product.id}>
                      <TableRow>
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
                          <p className="text-sm font-medium truncate" title={product.name}>{product.name}</p>
                        </TableCell>
                        {visibleColumns.description && (
                          <TableCell className="hidden lg:table-cell max-w-[150px]">
                            <p className="text-xs text-gray-600 truncate" title={product.description || '-'}>
                              {product.description || '-'}
                            </p>
                          </TableCell>
                        )}
                        <TableCell className="max-w-[100px]">
                          {product.hasVariants ? (
                            <div>
                              <span className="text-sm font-semibold truncate block">{formatCurrency(product.basePrice)}</span>
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
                          <TableCell className="hidden xl:table-cell max-w-[90px]">
                            {!product.hasVariants && product.cost !== undefined && product.cost !== null ? (
                              <div>
                                <span className="text-sm font-semibold text-green-600 truncate block">
                                  {formatCurrency(product.price - product.cost)}
                                </span>
                                <p className="text-xs text-gray-500">
                                  {product.price > 0 ? `${(((product.price - product.cost) / product.price) * 100).toFixed(0)}%` : '0%'}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
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
                        <TableCell className="max-w-[80px]">
                          <div className="flex items-center space-x-1">
                            {/* Botón de expandir/contraer solo si hay almacenes */}
                            {warehouses.length > 0 && !product.hasVariants && (
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
                              {product.hasVariants ? (
                                <span className="text-xs text-gray-500">
                                  {product.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) || 0}
                                </span>
                              ) : (() => {
                                const realStock = getRealStockValue(product)
                                return realStock !== null ? (
                                  <span
                                    className={`font-medium text-sm ${
                                      realStock >= 4
                                        ? 'text-green-600'
                                        : realStock > 0
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {realStock}
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
                            <button
                              onClick={() => {
                                setViewingProduct(product)
                                setIsViewModalOpen(true)
                              }}
                              className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Ver Detalles"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditModal(product)}
                              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingProduct(product)}
                              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Fila expandible con detalle por almacén */}
                      {isExpanded && warehouses.length > 0 && !product.hasVariants && (
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={8} className="py-3">
                            <div className="pl-8 space-y-2">
                              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                                <Warehouse className="w-4 h-4" />
                                <span className="font-medium">Stock por Almacén:</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {warehouses.map(warehouse => {
                                  const warehouseStock = hasWarehouseStocks
                                    ? product.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)
                                    : null
                                  const stock = warehouseStock?.stock || 0

                                  return (
                                    <div
                                      key={warehouse.id}
                                      className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                                    >
                                      <div className="flex items-center space-x-2">
                                        <span className="text-sm font-medium text-gray-700">
                                          {warehouse.name}
                                        </span>
                                        {warehouse.isDefault && (
                                          <Badge variant="default" className="text-xs">Principal</Badge>
                                        )}
                                      </div>
                                      <span
                                        className={`font-semibold ${
                                          stock >= 4
                                            ? 'text-green-600'
                                            : stock > 0
                                            ? 'text-yellow-600'
                                            : 'text-red-600'
                                        }`}
                                      >
                                        {stock}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
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
                    <span className="font-medium">{Math.min(endIndex, totalFilteredProducts)}</span> de{' '}
                    <span className="font-medium">{totalFilteredProducts}</span>
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
                  {/* Primera y Anterior */}
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 sm:px-2 sm:py-1 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Primera"
                  >
                    <span className="hidden sm:inline">Primera</span>
                    <span className="sm:hidden">««</span>
                  </button>
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1.5 sm:px-2 sm:py-1 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Anterior"
                  >
                    <span className="hidden sm:inline">Anterior</span>
                    <span className="sm:hidden">«</span>
                  </button>

                  {/* Números de página - menos en móvil */}
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

                  {/* Siguiente y Última */}
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 sm:px-2 sm:py-1 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Siguiente"
                  >
                    <span className="hidden sm:inline">Siguiente</span>
                    <span className="sm:hidden">»</span>
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 sm:px-2 sm:py-1 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Última"
                  >
                    <span className="hidden sm:inline">Última</span>
                    <span className="sm:hidden">»»</span>
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
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* ═══════════════════════════════════════════════════════════════════
              SECCIÓN 1: INFORMACIÓN BÁSICA
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Información Básica
            </h3>

            {/* Nombre del producto */}
            <Input
              label="Nombre"
              required
              placeholder="Nombre del producto o servicio"
              error={errors.name?.message}
              {...register('name')}
            />

            {/* Imagen y Descripción en fila */}
            <div className="flex gap-4">
              {/* Image upload - only shown if feature is enabled */}
              {canUseProductImages && (
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Imagen</label>
                  <div className="relative">
                    {productImagePreview ? (
                      <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-300 group">
                        <img
                          src={productImagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={handleImageRemove}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        {/* Botón para cambiar imagen */}
                        <label className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                          Cambiar
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="cursor-pointer block w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-gray-100 flex items-center justify-center bg-gray-50 transition-colors">
                        <div className="text-center">
                          <Camera className="w-8 h-8 text-gray-400 mx-auto" />
                          <span className="text-xs text-gray-500 mt-1 block">Subir foto</span>
                        </div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleImageSelect}
                          className="hidden"
                        />
                      </label>
                    )}
                    {uploadingImage && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Descripción */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción (Opcional)
                </label>
                <textarea
                  {...register('description')}
                  rows={canUseProductImages ? 3 : 2}
                  placeholder="Descripción breve del producto o servicio"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                />
              </div>
            </div>

            {/* SKU */}
            <Input
              label="SKU / Código Interno"
              placeholder="SKU-001"
              error={errors.sku?.message}
              {...register('sku')}
              helperText="Código interno de tu negocio"
            />

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
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECCIÓN 2: PRECIOS Y CLASIFICACIÓN
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Precios y Clasificación
            </h3>

            {/* Precios */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Input
                  label="Costo"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  error={errors.cost?.message}
                  {...register('cost')}
                />
                <p className="text-xs text-gray-500 mt-1">Opcional</p>
              </div>

              <Input
                label="Precio de Venta"
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                error={errors.price?.message}
                {...register('price')}
              />

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

              {/* Afectación IGV */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Afectación IGV
                </label>
                <select
                  value={taxAffectation}
                  onChange={(e) => setTaxAffectation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="10">Gravado</option>
                  <option value="20">Exonerado</option>
                  <option value="30">Inafecto</option>
                </select>
              </div>
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

          {/* ═══════════════════════════════════════════════════════════════════
              SECCIÓN 3: INVENTARIO
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Inventario
            </h3>

            {/* Checkboxes de opciones */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={noStock}
                  onChange={e => {
                    setNoStock(e.target.checked)
                    if (e.target.checked) setValue('stock', '')
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">No manejar stock</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDecimalQuantity}
                  onChange={e => setAllowDecimalQuantity(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Permitir decimales</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={trackExpiration}
                  onChange={e => {
                    setTrackExpiration(e.target.checked)
                    if (!e.target.checked) setValue('expirationDate', '')
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Control de vencimiento</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={catalogVisible}
                  onChange={e => setCatalogVisible(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <span className="ml-2 text-sm text-gray-700">Mostrar en catálogo</span>
              </label>
            </div>

            {/* Campos de Stock (solo si controla stock) */}
            {!noStock && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
                {/* Stock Actual (solo al editar) */}
                {editingProduct && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Stock Actual
                    </label>
                    <div className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-semibold">
                      {editingProduct.stock ?? 0} unidades
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Se actualiza con ventas y compras</p>
                  </div>
                )}

                {/* Stock Inicial */}
                <Input
                  label="Stock Inicial"
                  type="number"
                  placeholder="0"
                  error={errors.initialStock?.message}
                  {...register('initialStock')}
                  disabled={editingProduct && user?.role !== 'business_owner'}
                  helperText={editingProduct ? "Dato histórico" : "Cantidad inicial"}
                />

                {/* Almacén (solo al crear) */}
                {!editingProduct && warehouses.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Almacén
                    </label>
                    <select
                      value={selectedWarehouse}
                      onChange={(e) => setSelectedWarehouse(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {warehouses.filter(wh => wh.isActive).map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name} {wh.isDefault ? '(Predeterminado)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Fecha de Vencimiento (solo si está activado) */}
                {trackExpiration && (
                  <Input
                    label="Fecha de Vencimiento"
                    type="date"
                    error={errors.expirationDate?.message}
                    {...register('expirationDate')}
                  />
                )}
              </div>
            )}

            {/* Fecha de vencimiento fuera del bloque de stock si no controla stock pero sí vencimiento */}
            {noStock && trackExpiration && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <Input
                  label="Fecha de Vencimiento"
                  type="date"
                  error={errors.expirationDate?.message}
                  {...register('expirationDate')}
                />
              </div>
            )}
          </div>

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
                    <option value="Antibiótico">Antibiótico</option>
                    <option value="Antialérgico">Antialérgico</option>
                    <option value="Antihipertensivo">Antihipertensivo</option>
                    <option value="Antiácido">Antiácido</option>
                    <option value="Antidiarreico">Antidiarreico</option>
                    <option value="Antidepresivo">Antidepresivo</option>
                    <option value="Antiparasitario">Antiparasitario</option>
                    <option value="Antifúngico">Antifúngico</option>
                    <option value="Antipirético">Antipirético</option>
                    <option value="Antiemético">Antiemético</option>
                    <option value="Antitusivo">Antitusivo</option>
                    <option value="Broncodilatador">Broncodilatador</option>
                    <option value="Diurético">Diurético</option>
                    <option value="Laxante">Laxante</option>
                    <option value="Vitamina/Suplemento">Vitamina/Suplemento</option>
                    <option value="Dermatológico">Dermatológico</option>
                    <option value="Oftálmico">Oftálmico</option>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="text-sm font-semibold text-gray-900">
                Variantes
              </h3>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasVariants}
                  onChange={e => {
                    setHasVariants(e.target.checked)
                    if (!e.target.checked) {
                      setVariantAttributes([])
                      setVariants([])
                      setNewAttributeName('')
                      setNewVariant({ sku: '', attributes: {}, price: '', stock: '' })
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Tiene variantes</span>
              </label>
            </div>

            {hasVariants && (
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
                            Precio
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={newVariant.price}
                            onChange={e => handleNewVariantChange('price', e.target.value)}
                            placeholder="0.00"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
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
                              {variantAttributes.map(attr => (
                                <th key={attr} className="px-2 py-2 text-left capitalize">{attr}</th>
                              ))}
                              <th className="px-2 py-2 text-left">Precio</th>
                              <th className="px-2 py-2 text-left">Stock</th>
                              <th className="px-2 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {variants.map((variant, index) => (
                              <tr key={index} className="border-b border-gray-200">
                                <td className="px-2 py-2 font-mono text-xs">{variant.sku}</td>
                                {variantAttributes.map(attr => (
                                  <td key={attr} className="px-2 py-2">{variant.attributes[attr] || '-'}</td>
                                ))}
                                <td className="px-2 py-2 font-semibold">{formatCurrency(variant.price)}</td>
                                <td className="px-2 py-2">{variant.stock ?? 'N/A'}</td>
                                <td className="px-2 py-2">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveVariant(index)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
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
            )}
          </div>

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
                  <p className="text-lg text-green-600 font-bold mt-1">{formatCurrency(viewingProduct.price)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Costo</label>
                  <p className="text-lg text-orange-600 font-bold mt-1">
                    {viewingProduct.cost ? formatCurrency(viewingProduct.cost) : '-'}
                  </p>
                </div>
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
                          realStock >= 4 ? 'text-green-600' :
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
                                {warehouse?.name || 'Almacén desconocido'}
                                {warehouse?.isDefault && <Badge variant="default" className="ml-2 text-xs">Principal</Badge>}
                              </span>
                              <span className={`font-semibold text-sm ${
                                ws.stock >= 4 ? 'text-green-600' :
                                ws.stock > 0 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {ws.stock}
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
                            <p className="font-medium">{variant.stock}</p>
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
                        <Folder className="w-5 h-5 text-primary-600" />
                        <div>
                          <p className="font-medium text-gray-900">{category.name}</p>
                          <p className="text-xs text-gray-500">
                            {productCount} {productCount === 1 ? 'producto' : 'productos'}
                            {subcategories.length > 0 && ` • ${subcategories.length} subcategoría${subcategories.length === 1 ? '' : 's'}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditCategory(category)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                                <Folder className="w-4 h-4 text-gray-500" />
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{subcategory.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {subProductCount} {subProductCount === 1 ? 'producto' : 'productos'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
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

      {/* Bulk Actions Modal */}
      <Modal
        isOpen={bulkActionModalOpen}
        onClose={closeBulkActionModal}
        title={
          bulkAction === 'delete'
            ? 'Eliminar productos seleccionados'
            : bulkAction === 'changeCategory'
            ? 'Cambiar categoría'
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
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  Cambiarás el estado (activo/inactivo) de {selectedProducts.size} producto{selectedProducts.size !== 1 ? 's' : ''} seleccionado{selectedProducts.size !== 1 ? 's' : ''}.
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Los productos activos se desactivarán y viceversa.
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
        </div>
      </Modal>

      {/* Import Products Modal */}
      <ImportProductsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportProducts}
      />
    </div>
  )
}
