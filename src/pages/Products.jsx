import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Edit, Trash2, Package, Loader2, AlertTriangle, DollarSign, Folder, FolderPlus, Tag, X, FileSpreadsheet, Upload, ChevronDown, ChevronRight, Warehouse, CheckSquare, Square, CheckCheck, FolderEdit, Calendar } from 'lucide-react'
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

// Unidades de medida
const UNITS = [
  { value: 'UNIDAD', label: 'Unidad' },
  { value: 'CAJA', label: 'Caja' },
  { value: 'KG', label: 'Kilogramo' },
  { value: 'LITRO', label: 'Litro' },
  { value: 'METRO', label: 'Metro' },
  { value: 'HORA', label: 'Hora' },
  { value: 'SERVICIO', label: 'Servicio' },
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
  const { user, isDemoMode, demoData, getBusinessId, businessMode } = useAppContext()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showExpiringOnly, setShowExpiringOnly] = useState(false) // Filtro de vencimiento
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [deletingProduct, setDeletingProduct] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [noStock, setNoStock] = useState(false)
  const [trackExpiration, setTrackExpiration] = useState(false) // Control de vencimiento
  const [expandedProduct, setExpandedProduct] = useState(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState('') // Almacén para stock inicial

  // Paginación en cliente
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)

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
      name: '',
      description: '',
      price: '',
      cost: '',
      unit: 'UNIDAD',
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
  }, [user])

  const loadProducts = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        // Cargar datos de demo
        setProducts(demoData.products || [])
        setCategories([]) // Demo no necesita categorías por ahora
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
          { id: 'demo-1', name: 'Almacén Principal', isDefault: true, isActive: true },
          { id: 'demo-2', name: 'Almacén Secundario', isDefault: false, isActive: true },
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

  const openCreateModal = () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingProduct(null)
    setNoStock(false)
    setTrackExpiration(false)
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
      name: '',
      description: '',
      price: '',
      cost: '',
      unit: 'UNIDAD',
      category: '',
      stock: '',
      noStock: false,
      trackExpiration: false,
      expirationDate: '',
    })
    setModifiers([]) // Limpiar modificadores
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

    // Format expiration date if exists (from Firestore Timestamp to YYYY-MM-DD)
    let formattedExpirationDate = ''
    if (product.expirationDate) {
      const expDate = product.expirationDate.toDate ? product.expirationDate.toDate() : new Date(product.expirationDate)
      formattedExpirationDate = expDate.toISOString().split('T')[0]
    }

    reset({
      code: product.code,
      name: product.name,
      description: product.description || '',
      price: productHasVariants ? '' : (product.price?.toString() || ''),
      cost: product.cost?.toString() || '',
      unit: product.unit || 'UNIDAD',
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
    reset()
  }

  const onSubmit = async data => {
    if (!user?.uid) return

    // Validate variants if hasVariants is true
    if (hasVariants && variants.length === 0) {
      toast.error('Debes agregar al menos una variante')
      return
    }

    if (hasVariants && variantAttributes.length === 0) {
      toast.error('Debes definir al menos un atributo de variante (ej: talla, color)')
      return
    }

    setIsSaving(true)

    try {
      // Build product data based on hasVariants
      const productData = {
        code: data.code,
        name: data.name,
        description: data.description || '',
        unit: data.unit,
        category: data.category || '',
        cost: data.cost && data.cost !== '' ? parseFloat(data.cost) : null,
        hasVariants: hasVariants,
        trackExpiration: trackExpiration,
        expirationDate: trackExpiration && data.expirationDate ? new Date(data.expirationDate) : null,
        // Add modifiers if in restaurant mode
        modifiers: businessMode === 'restaurant' ? modifiers : undefined,
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
            // Al editar, mantener el stock actual (no lo modificamos aquí)
            // Solo actualizar initialStock si el usuario es business_owner y lo modificó
            if (user?.role === 'business_owner' && data.initialStock !== '') {
              productData.initialStock = parseInt(data.initialStock)
            }
            // No modificar stock actual en edición (se modifica con ventas/compras)
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
      generateProductsExcel(products, categories, businessData);
      toast.success(`${products.length} producto(s) exportado(s) exitosamente`);
    } catch (error) {
      console.error('Error al exportar productos:', error);
      toast.error('Error al generar el archivo Excel');
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

  // Filtrar productos por búsqueda y categoría (optimizado con useMemo)
  const filteredProducts = React.useMemo(() => {
    return products.filter(product => {
      const search = searchTerm.toLowerCase()

      // Get category name for search (backward compatible)
      const categoryName = product.category
        ? (getCategoryById(categories, product.category)?.name || product.category)
        : ''

      const matchesSearch =
        product.code?.toLowerCase().includes(search) ||
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
  }, [products, searchTerm, selectedCategoryFilter, showExpiringOnly, categories])

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
      if (product.stock && product.price) {
        return sum + product.stock * product.price
      }
      return sum
    }, 0)

    const lowStockCount = products.filter(product => product.stock !== null && product.stock < 10).length

    const expiringProductsCount = products.filter(product => {
      if (!product.trackExpiration || !product.expirationDate) return false
      const expStatus = getExpirationStatus(product.expirationDate)
      return expStatus && (expStatus.status === 'expired' || expStatus.status === 'warning')
    }).length

    return { totalValue, lowStockCount, expiringProductsCount }
  }, [products])

  const { totalValue, lowStockCount, expiringProductsCount } = statistics

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
                  <TableHead className="w-12">
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
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead className="w-48">Nombre</TableHead>
                  <TableHead className="hidden lg:table-cell w-64">Descripción</TableHead>
                  <TableHead className="w-28">Precio</TableHead>
                  <TableHead className="hidden xl:table-cell w-24">Utilidad</TableHead>
                  <TableHead className="hidden md:table-cell w-32">Categoría</TableHead>
                  <TableHead className="w-20">Stock</TableHead>
                  <TableHead className="hidden lg:table-cell w-32">Vencimiento</TableHead>
                  <TableHead className="text-right w-32">Acciones</TableHead>
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
                        <TableCell>
                          <span className="font-mono text-xs text-primary-600">
                            {product.code}
                          </span>
                        </TableCell>
                        <TableCell className="w-48">
                          <p className="text-sm font-medium whitespace-normal break-words">{product.name}</p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell w-64">
                          <p className="text-xs text-gray-600 whitespace-normal break-words">
                            {product.description || '-'}
                          </p>
                        </TableCell>
                        <TableCell>
                          {product.hasVariants ? (
                            <div>
                              <span className="text-sm font-semibold">{formatCurrency(product.basePrice)}</span>
                              <p className="text-xs text-gray-500">{product.variants?.length || 0} var.</p>
                            </div>
                          ) : (
                            <div>
                              <span className="text-sm font-semibold">{formatCurrency(product.price)}</span>
                              <p className="text-xs text-gray-500">{product.unit}</p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {!product.hasVariants && product.cost !== undefined && product.cost !== null ? (
                            <div>
                              <span className="text-sm font-semibold text-green-600">
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
                        <TableCell className="hidden md:table-cell">
                          {product.category ? (
                            <span className="text-xs text-gray-700 truncate block">
                              {getCategoryPath(categories, product.category) || product.category}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {/* Botón de expandir/contraer solo si hay almacenes */}
                            {warehouses.length > 0 && !product.hasVariants && (
                              <button
                                onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                                className="p-1 hover:bg-gray-100 rounded transition-colors"
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
                                  {product.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) || 0} total
                                </span>
                              ) : product.stock !== null && product.stock !== undefined ? (
                                <span
                                  className={`font-medium ${
                                    product.stock > 10
                                      ? 'text-green-600'
                                      : product.stock > 0
                                      ? 'text-yellow-600'
                                      : 'text-red-600'
                                  }`}
                                >
                                  {product.stock}
                                </span>
                              ) : (
                                <span className="text-gray-400">N/A</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {product.trackExpiration && product.expirationDate ? (() => {
                            const expStatus = getExpirationStatus(product.expirationDate)
                            const expDate = product.expirationDate.toDate ? product.expirationDate.toDate() : new Date(product.expirationDate)
                            const formattedDate = expDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })

                            return (
                              <div className="flex flex-col space-y-1">
                                <Badge
                                  variant={expStatus.status === 'expired' ? 'danger' : expStatus.status === 'warning' ? 'warning' : 'success'}
                                  className="text-xs"
                                >
                                  {expStatus.status === 'expired'
                                    ? `Vencido hace ${expStatus.days}d`
                                    : expStatus.status === 'warning'
                                    ? `${expStatus.days}d restantes`
                                    : `${expStatus.days}d restantes`
                                  }
                                </Badge>
                                <span className="text-xs text-gray-500">{formattedDate}</span>
                              </div>
                            )
                          })() : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end space-x-2">
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
                                          stock > 10
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
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Info de productos mostrados */}
                <div className="text-sm text-gray-600">
                  Mostrando <span className="font-medium">{startIndex + 1}</span> a{' '}
                  <span className="font-medium">{Math.min(endIndex, totalFilteredProducts)}</span> de{' '}
                  <span className="font-medium">{totalFilteredProducts}</span> productos
                </div>

                {/* Controles de paginación */}
                <div className="flex items-center gap-2">
                  {/* Selector de items por página */}
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                  </select>

                  {/* Botones de navegación */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Primera
                    </button>
                    <button
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>

                    {/* Números de página */}
                    <div className="flex items-center gap-1 px-2">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum
                        if (totalPages <= 5) {
                          pageNum = i + 1
                        } else if (currentPage <= 3) {
                          pageNum = i + 1
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i
                        } else {
                          pageNum = currentPage - 2 + i
                        }

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-8 h-8 text-sm rounded-lg ${
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
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Siguiente
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Última
                    </button>
                  </div>
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Código"
              required
              placeholder="PROD001"
              error={errors.code?.message}
              {...register('code')}
            />

            <Select
              label="Unidad de Medida"
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

          <Input
            label="Nombre"
            required
            placeholder="Nombre del producto o servicio"
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                label="Costo"
                type="number"
                step="0.01"
                placeholder="0.00"
                error={errors.cost?.message}
                {...register('cost')}
              />
              <p className="text-xs text-gray-500 mt-1">
                Opcional. Para platos con receta, el costo se calcula automáticamente.
              </p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría (Opcional)
              </label>
              <select
                {...register('category')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Sin categoría</option>
                {/* Render root categories and their subcategories */}
                {getRootCategories(categories).map(cat => (
                  <React.Fragment key={cat.id}>
                    <option value={cat.id}>
                      {cat.name}
                    </option>
                    {getSubcategories(categories, cat.id).map(subcat => (
                      <option key={subcat.id} value={subcat.id}>
                        └─ {subcat.name}
                      </option>
                    ))}
                  </React.Fragment>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>
              )}
              {categories.length === 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  Crea categorías desde el botón "Categorías" para organizarlos mejor
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Control de Stock
            </label>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="noStock"
                  checked={noStock}
                  onChange={e => {
                    const checked = e.target.checked
                    setNoStock(checked)
                    if (checked) {
                      setValue('stock', '')
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="noStock" className="ml-2 text-sm text-gray-700">
                  No manejar stock (servicios o productos sin control)
                </label>
              </div>

              {!noStock && (
                <div className="space-y-4">
                  {/* Stock Actual - Solo informativo cuando se edita */}
                  {editingProduct && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Stock Actual
                      </label>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 font-semibold">
                        {editingProduct.stock ?? 0} unidades
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Este valor se actualiza automáticamente con las ventas y compras
                      </p>
                    </div>
                  )}

                  {/* Stock Inicial - Editable solo por Business Owner cuando se edita */}
                  <Input
                    label="Stock Inicial"
                    type="number"
                    placeholder="Ingresa la cantidad inicial"
                    error={errors.initialStock?.message}
                    {...register('initialStock')}
                    disabled={editingProduct && user?.role !== 'business_owner'}
                    helperText={
                      editingProduct && user?.role !== 'business_owner'
                        ? "Solo el propietario puede modificar el stock inicial"
                        : editingProduct
                        ? "Stock con el que comenzó el producto (dato histórico)"
                        : "Ingresa la cantidad inicial de unidades"
                    }
                  />

                  {/* Selector de Almacén - Solo al crear nuevo producto */}
                  {!editingProduct && warehouses.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Almacén de Stock Inicial
                      </label>
                      <select
                        value={selectedWarehouse}
                        onChange={(e) => setSelectedWarehouse(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Seleccionar almacén...</option>
                        {warehouses.filter(wh => wh.isActive).map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name} {wh.isDefault ? '(Predeterminado)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Selecciona el almacén donde se registrará el stock inicial
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Control de Vencimiento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Control de Vencimiento
            </label>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="trackExpiration"
                  checked={trackExpiration}
                  onChange={e => {
                    const checked = e.target.checked
                    setTrackExpiration(checked)
                    if (!checked) {
                      setValue('expirationDate', '')
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="trackExpiration" className="ml-2 text-sm text-gray-700">
                  Controlar fecha de vencimiento del producto
                </label>
              </div>

              {trackExpiration && (
                <div>
                  <Input
                    label="Fecha de Vencimiento"
                    type="date"
                    placeholder="Selecciona la fecha de vencimiento"
                    error={errors.expirationDate?.message}
                    {...register('expirationDate')}
                    helperText="Fecha en la que este producto vence o caduca"
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              {...register('description')}
              rows={3}
              placeholder="Descripción del producto o servicio"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          {/* Variant System Toggle */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                id="hasVariants"
                checked={hasVariants}
                onChange={e => {
                  const checked = e.target.checked
                  setHasVariants(checked)
                  if (!checked) {
                    setVariantAttributes([])
                    setVariants([])
                    setNewAttributeName('')
                    setNewVariant({ sku: '', attributes: {}, price: '', stock: '' })
                  }
                }}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="hasVariants" className="ml-2 text-sm font-medium text-gray-700">
                Este producto tiene variantes (tallas, colores, presentaciones, etc.)
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

      {/* Modal Gestionar Categorías */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false)
          setEditingCategory(null)
          setNewCategoryName('')
          setParentCategoryId(null)
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

                return (
                  <div key={category.id}>
                    {/* Root Category */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2">
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
                          return (
                            <div
                              key={subcategory.id}
                              className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200"
                            >
                              <div className="flex items-center gap-2">
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
