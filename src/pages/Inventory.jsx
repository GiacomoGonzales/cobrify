import React, { useState, useEffect, useDeferredValue } from 'react'
import {
  Package,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Search,
  DollarSign,
  Loader2,
  Plus,
  FileSpreadsheet,
  ArrowRightLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Warehouse,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ClipboardCheck,
  History,
  ArrowUpCircle,
  ArrowDownCircle,
  ScanBarcode,
  Store,
  Tag,
  Activity,
  Check,
  X,
  Cog,
  CookingPot,
  Wrench,
  RotateCcw,
  CheckCircle,
  MoreVertical,
  FlaskConical,
  CalendarClock,
  RefreshCw,
  PackageMinus,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useAppContext } from '@/hooks/useAppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useHidePrivateData } from '@/hooks/useHidePrivateData'
import { useToast } from '@/contexts/ToastContext'
import { recalculateProductCostsFromPurchases } from '@/services/inventoryCostService'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Alert from '@/components/ui/Alert'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatProductPrice, buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'
import { getProducts, getProductCategories, getProductBrands, updateProduct, updateProductStockTransaction, transferProductStockTransaction, getIngredientCategories } from '@/services/firestoreService'
import { getIngredients, updateIngredient, transferIngredientStock } from '@/services/ingredientService'
import { generateProductsExcel } from '@/services/productExportService'
import { getWarehouses, createStockMovement, updateWarehouseStock, getOrphanStockProducts, migrateOrphanStock, getOrphanStock, getDeletedWarehouseStock, getStockMovements, getInventoryCounts, recalculateStockFromMovements, bulkRecalculateStock, getLatestActiveStockBackup, revertStockBackup, createStockBackup, buildStockBackupItems } from '@/services/warehouseService'
import { getActiveBranches } from '@/services/branchService'
import InventoryCountModal from '@/components/InventoryCountModal'
import InventoryExportModal from '@/components/InventoryExportModal'
import MassTransferModal from '@/components/MassTransferModal'
import BulkStockCorrectionModal from '@/components/BulkStockCorrectionModal'
import { executeRecipeProduction, executeManualProduction, checkProductionReadiness } from '@/services/productionService'
import { getRecipeByProductId, calculateRecipeCost } from '@/services/recipeService'
import { getCompanySettings } from '@/services/firestoreService'
import { computeBatchDeduction, computeProductBatchMetadata } from '@/utils/batchStock'
import { getItemUnitLabel } from '@/utils/units'

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

const getCategoryPath = (categories, categoryId) => {
  if (!categoryId || !categories || categories.length === 0) return null

  const category = categories.find(cat => cat.id === categoryId)
  if (!category) return categoryId // Si no se encuentra, devolver el ID

  if (category.parentId === null) {
    return category.name
  }

  const parent = getCategoryPath(categories, category.parentId)
  return parent ? `${parent} > ${category.name}` : category.name
}

// Labels para los slugs antiguos hardcoded de ingredientes (retrocompat con datos previos
// al sistema de categorías personalizables).
const DEFAULT_INGREDIENT_CATEGORY_LABELS = {
  granos: 'Granos y Cereales',
  carnes: 'Carnes',
  vegetales: 'Vegetales y Frutas',
  lacteos: 'Lácteos',
  condimentos: 'Condimentos y Especias',
  bebidas: 'Bebidas',
  estetica: 'Estética y Belleza',
  salud: 'Salud y Farmacia',
  limpieza: 'Limpieza',
  otros: 'Otros',
}

const getIngredientCategoryName = (categories, categoryId) => {
  if (!categoryId) return ''
  const match = categories?.find(c => c.id === categoryId)
  if (match) return match.name
  if (DEFAULT_INGREDIENT_CATEGORY_LABELS[categoryId]) return DEFAULT_INGREDIENT_CATEGORY_LABELS[categoryId]
  // Retrocompat: ingredientes viejos guardaron el nombre directamente como string
  const byName = categories?.find(c => c.name?.toLowerCase() === String(categoryId).toLowerCase())
  if (byName) return byName.name
  return categoryId
}


// Función para obtener el stock real de un item (suma de warehouseStocks o stock general)
const getRealStockValue = (item) => {
  // Productos con variantes: sumar stock de todas las variantes
  if (item.hasVariants && item.variants?.length > 0) {
    return item.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
  }

  // Si tiene warehouseStocks, siempre usar la suma (fuente de verdad)
  const warehouseStocks = item.warehouseStocks || []
  if (warehouseStocks.length > 0) {
    return warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
  }

  // Si no tiene control de stock y no tiene warehouseStocks, retornar null
  if (item.stock === null || item.stock === undefined) {
    return null
  }

  // Si no tiene warehouseStocks, usar stock general
  return item.stock || 0
}

export default function Inventory() {
  const { user, isDemoMode, demoData, getBusinessId, businessMode, businessSettings, hasMainBranchAccess, allowedWarehouses, isBusinessOwner } = useAppContext()
  const hidePrivateData = useHidePrivateData()
  const { filterWarehousesByAccess } = useAuth()
  const toast = useToast()

  // Recálculo opcional del costo de inventario desde el historial de compras (corrige
  // el descuadre por costos guardados a 2 decimales en compras anteriores).
  const [recalcCosts, setRecalcCosts] = useState(false)
  const handleRecalcCosts = async () => {
    if (recalcCosts || isDemoMode) return
    setRecalcCosts(true)
    try {
      const result = await recalculateProductCostsFromPurchases(getBusinessId())
      if (result.success) {
        await loadProducts()
        toast.success(result.updated > 0 ? `Costo recalculado en ${result.updated} productos` : 'Los costos ya estaban al día')
      } else {
        toast.error(result.error || 'No se pudo recalcular el costo')
      }
    } catch (e) {
      toast.error(e.message || 'Error al recalcular el costo')
    } finally {
      setRecalcCosts(false)
    }
  }
  const appNavigate = useAppNavigate()
  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [productCategories, setProductCategories] = useState([])
  const [ingredientCategories, setIngredientCategories] = useState([])
  // Marcas administradas + filtro multi-select (mismo patrón que filterCategories)
  const [brands, setBrands] = useState([])
  const [filterBrands, setFilterBrands] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [filterCategories, setFilterCategories] = useState([]) // Array vacío = todas las categorías
  const [filterStatuses, setFilterStatuses] = useState([]) // Array vacío = todos los estados
  const [filterType, setFilterType] = useState('all') // 'all', 'products', 'ingredients'
  const [filterStockTracking, setFilterStockTracking] = useState('tracked') // 'all', 'tracked', 'untracked'
  const [expandedProduct, setExpandedProduct] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false })

  // Estado para controlar qué dropdown multi-select está abierto
  const [openDropdown, setOpenDropdown] = useState(null) // 'categories', 'statuses', 'warehouses', or null

  // Cerrar dropdown al hacer clic fuera
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && !event.target.closest('.relative')) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openDropdown])

  // Paginación
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)

  // Ordenamiento
  const [sortField, setSortField] = useState('name') // 'name', 'code', 'price', 'stock', 'category'
  const [sortDirection, setSortDirection] = useState('asc') // 'asc' o 'desc'

  // Warehouses, sucursales y transferencias
  const [warehouses, setWarehouses] = useState([])
  const [allWarehouses, setAllWarehouses] = useState([]) // Todos los almacenes (para transferencias entre sucursales)
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [filterWarehouses, setFilterWarehouses] = useState([]) // Array vacío = todos los almacenes
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferProduct, setTransferProduct] = useState(null)
  const [transferData, setTransferData] = useState({
    fromWarehouse: '',
    toWarehouse: '',
    quantity: '',
    notes: '',
    selectedBatch: '', // Lote seleccionado para transferencia (farmacia)
    selectedVariantSku: '' // Variante seleccionada para transferencia
  })
  const [isTransferring, setIsTransferring] = useState(false)

  // Estado para modal de merma/daños
  const [showDamageModal, setShowDamageModal] = useState(false)
  const [damageProduct, setDamageProduct] = useState(null)
  const [damageData, setDamageData] = useState({
    warehouseId: '',
    quantity: '',
    reason: 'damaged',
    notes: '',
    selectedSerials: [],
    selectedVariantSku: '',
  })
  const [isProcessingDamage, setIsProcessingDamage] = useState(false)

  // Estado para modal de producción rápida
  const [showProductionModal, setShowProductionModal] = useState(false)
  const [productionProduct, setProductionProduct] = useState(null)
  const [productionMode, setProductionMode] = useState(null) // 'recipe' | 'manual'
  const [productionData, setProductionData] = useState({
    warehouseId: '',
    quantity: '',
    notes: '',
    batchNumber: '',
    expirationDate: '',
    serials: ''
  })
  const [isProcessingProduction, setIsProcessingProduction] = useState(false)
  const [productionRecipeInfo, setProductionRecipeInfo] = useState(null)
  const [isCheckingProductionRecipe, setIsCheckingProductionRecipe] = useState(false)

  // Estado para modal de historial de movimientos
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyProduct, setHistoryProduct] = useState(null)
  const [productMovements, setProductMovements] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)

  // Estado para migración de stock huérfano
  const [isMigratingOrphanStock, setIsMigratingOrphanStock] = useState(false)

  // Estado para modal de recuento de inventario
  const [showInventoryCountModal, setShowInventoryCountModal] = useState(false)
  const [showMassTransferModal, setShowMassTransferModal] = useState(false)
  const [showBulkCorrectionModal, setShowBulkCorrectionModal] = useState(false)
  // Backup activo de la última verificación masiva (para revertir si algo se desconfiguró).
  // Visible durante 7 días después de cada verificación.
  const [latestStockBackup, setLatestStockBackup] = useState(null)
  const [showRevertModal, setShowRevertModal] = useState(false)
  const [isReverting, setIsReverting] = useState(false)
  const [revertProgress, setRevertProgress] = useState({ processed: 0, total: 0, errors: 0 })
  const [showCountHistory, setShowCountHistory] = useState(false)
  const [countHistory, setCountHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedCount, setSelectedCount] = useState(null)

  // Cargar historial de recuentos cuando se abre el modal
  useEffect(() => {
    if (!showCountHistory || !user?.uid) return
    const loadHistory = async () => {
      setLoadingHistory(true)
      try {
        const result = await getInventoryCounts(getBusinessId())
        if (result.success) setCountHistory(result.data || [])
      } catch (e) {
        console.error('Error cargando historial:', e)
      } finally {
        setLoadingHistory(false)
      }
    }
    loadHistory()
  }, [showCountHistory, user])
  const [companySettings, setCompanySettings] = useState(null)

  useEffect(() => {
    loadProducts()
    loadIngredients()
    loadCategories()
    loadBrands()
    loadWarehouses()
    loadBranches()
    loadCompanySettings()
    loadLatestStockBackup()
  }, [user])

  // Cargar el último backup activo de verificación masiva (si existe y no expiró).
  const loadLatestStockBackup = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const businessId = getBusinessId()
      const backup = await getLatestActiveStockBackup(businessId)
      setLatestStockBackup(backup)
    } catch (err) {
      console.error('Error cargando backup activo de stock:', err)
      setLatestStockBackup(null)
    }
  }

  // Revertir la última verificación masiva.
  const handleRevertStockBackup = async () => {
    if (!latestStockBackup || isReverting) return
    setIsReverting(true)
    setRevertProgress({ processed: 0, total: latestStockBackup.itemsCount || 0, errors: 0 })
    try {
      const businessId = getBusinessId()
      const result = await revertStockBackup(businessId, latestStockBackup.id, {
        onProgress: (state) => setRevertProgress(state),
      })
      if (result.success) {
        toast.success(`Stock restaurado: ${result.restored} producto(s)`)
        if (result.errors > 0) {
          toast.error(`Hubo ${result.errors} error(es) al restaurar algunos items`, 5000)
        }
        setLatestStockBackup(null)
        setShowRevertModal(false)
        loadProducts()
        loadIngredients()
      } else {
        toast.error('Error al revertir: ' + (result.error || 'Desconocido'))
      }
    } catch (err) {
      console.error('Error revirtiendo backup:', err)
      toast.error('Error al revertir el backup')
    } finally {
      setIsReverting(false)
    }
  }

  // Resetear página cuando cambia el filtro de tipo (productos/insumos)
  useEffect(() => {
    console.log(`🔄 [Inventory] filterType cambió a: "${filterType}"`)
    setCurrentPage(1)
  }, [filterType])

  // Resetear página cuando cambia el filtro de sucursal o almacén
  useEffect(() => {
    setCurrentPage(1)
  }, [filterBranch, filterWarehouses])

  // Resetear filtro de almacén cuando cambia el filtro de sucursal
  useEffect(() => {
    setFilterWarehouses([])
  }, [filterBranch])

  // Obtener almacenes filtrados por sucursal seleccionada
  const getFilteredWarehouses = React.useCallback(() => {
    if (filterBranch === 'all') {
      return warehouses
    }
    if (filterBranch === 'main') {
      return warehouses.filter(w => !w.branchId)
    }
    return warehouses.filter(w => w.branchId === filterBranch)
  }, [warehouses, filterBranch])

  const filteredWarehouses = React.useMemo(() => getFilteredWarehouses(), [getFilteredWarehouses])

  // Conjunto de IDs de almacenes permitidos para el usuario (null = sin restricción → todos).
  // Para owner/admin/usuarios sin restricción se queda en null y el comportamiento es idéntico al actual.
  const allowedWarehouseIdSet = React.useMemo(() => {
    if (!allowedWarehouses || allowedWarehouses.length === 0) return null
    return new Set(allowedWarehouses)
  }, [allowedWarehouses])

  // Calcular stock considerando los filtros de sucursal y almacén
  const getStockForBranch = React.useCallback((item) => {
    // Productos con variantes: sumar stock de todas las variantes
    if (item.hasVariants && item.variants?.length > 0) {
      return item.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
    }

    // Si tiene warehouseStocks, siempre usarlos como fuente de verdad
    const warehouseStocks = item.warehouseStocks || []
    if (warehouseStocks.length > 0) {
      // Continúa abajo con la lógica de filtros
    } else if (item.stock === null || item.stock === undefined) {
      // Sin warehouseStocks y sin control de stock
      return null
    } else {
      // Sin warehouseStocks, usar stock general
      return item.stock || 0
    }

    // Si hay almacenes específicos seleccionados
    if (filterWarehouses.length > 0) {
      // Sumar stock de los almacenes seleccionados
      const selectedStock = warehouseStocks
        .filter(ws => filterWarehouses.includes(ws.warehouseId))
        .reduce((sum, ws) => sum + (ws.stock || 0), 0)
      return selectedStock
    }

    // Obtener IDs de almacenes filtrados por sucursal
    const filteredWarehouseIds = filteredWarehouses.map(w => w.id)

    // Si estamos viendo todas las sucursales, sumar todo (respetando los almacenes permitidos del usuario)
    if (filterBranch === 'all') {
      return warehouseStocks
        .filter(ws => !allowedWarehouseIdSet || allowedWarehouseIdSet.has(ws.warehouseId))
        .reduce((sum, ws) => sum + (ws.stock || 0), 0)
    }

    // Filtrar y sumar solo los almacenes de la sucursal seleccionada
    const branchStock = warehouseStocks
      .filter(ws => filteredWarehouseIds.includes(ws.warehouseId))
      .reduce((sum, ws) => sum + (ws.stock || 0), 0)

    return branchStock
  }, [filterBranch, filterWarehouses, filteredWarehouses, allowedWarehouseIdSet])

  const loadProducts = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      // MODO DEMO: Usar datos de ejemplo
      if (isDemoMode && demoData) {
        setProducts(demoData.products || [])
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()

      // Carga rápida: primeros 200 productos para mostrar algo inmediato
      const firstBatch = await getProducts(businessId, { limit: 200 })
      if (firstBatch.success && firstBatch.data?.length > 0) {
        setProducts(firstBatch.data)
        setIsLoading(false)

        // Si hay menos de 200, ya tenemos todo
        if (firstBatch.data.length < 200) return

        // Carga completa en background para filtros
        const allResult = await getProducts(businessId)
        if (allResult.success) {
          setProducts(allResult.data || [])
        }
      } else {
        // Fallback: cargar todo de una vez
        const result = await getProducts(businessId)
        if (result.success) {
          setProducts(result.data || [])
        }
      }
    } catch (error) {
      console.error('Error al cargar productos:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadIngredients = async () => {
    if (!user?.uid && !isDemoMode) return

    try {
      // MODO DEMO: Usar ingredientes de ejemplo
      if (isDemoMode) {
        setIngredients([
          { id: 'ins1', name: 'Crema Hidratante Facial', category: 'Belleza', purchaseUnit: 'unidades', currentStock: 24, minimumStock: 10, averageCost: 45.00 },
          { id: 'ins2', name: 'Aceite Esencial Lavanda', category: 'Belleza', purchaseUnit: 'unidades', currentStock: 18, minimumStock: 5, averageCost: 28.00 },
          { id: 'ins3', name: 'Mascarilla de Arcilla', category: 'Belleza', purchaseUnit: 'unidades', currentStock: 15, minimumStock: 8, averageCost: 22.00 },
          { id: 'ins4', name: 'Toallas Desechables', category: 'Suministros', purchaseUnit: 'cajas', currentStock: 8, minimumStock: 3, averageCost: 25.00 },
          { id: 'ins5', name: 'Guantes de Látex', category: 'Suministros', purchaseUnit: 'cajas', currentStock: 12, minimumStock: 5, averageCost: 18.00 },
        ])
        return
      }

      const result = await getIngredients(getBusinessId())
      if (result.success) {
        setIngredients(result.data || [])
      }
    } catch (error) {
      console.error('Error al cargar ingredientes:', error)
    }
  }

  const loadCategories = async () => {
    if (!user?.uid) return

    try {
      // MODO DEMO: Usar categorías del demo data
      if (isDemoMode && demoData) {
        setProductCategories(demoData.categories || [])
        setIngredientCategories(demoData.ingredientCategories || [])
        return
      }

      const businessId = getBusinessId()
      const [prodResult, ingResult] = await Promise.all([
        getProductCategories(businessId),
        getIngredientCategories(businessId),
      ])
      if (prodResult.success) {
        const migratedCategories = migrateLegacyCategories(prodResult.data || [])
        setProductCategories(migratedCategories)
      }
      if (ingResult.success) {
        setIngredientCategories(ingResult.data || [])
      }
    } catch (error) {
      console.error('Error al cargar categorías:', error)
    }
  }

  const loadBrands = async () => {
    try {
      if (isDemoMode) {
        setBrands(demoData?.brands || [])
        return
      }
      const result = await getProductBrands(getBusinessId())
      if (result.success) {
        setBrands(result.data || [])
      }
    } catch (error) {
      console.error('Error al cargar marcas:', error)
    }
  }

  const loadWarehouses = async () => {
    if (!user?.uid && !isDemoMode) return

    try {
      if (isDemoMode && demoData?.warehouses) {
        // Usar almacenes del DemoContext para mantener sincronización con warehouseStocks
        setWarehouses(demoData.warehouses)
        setAllWarehouses(demoData.warehouses)
        return
      }

      const result = await getWarehouses(getBusinessId())
      if (result.success) {
        // Guardar todos los almacenes (para transferencias entre sucursales)
        const allWarehousesData = result.data || []
        setAllWarehouses(allWarehousesData)

        // Filtrar almacenes según permisos del usuario
        const filteredWarehouses = filterWarehousesByAccess(allWarehousesData)
        setWarehouses(filteredWarehouses)
      }
    } catch (error) {
      console.error('Error al cargar almacenes:', error)
    }
  }

  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return

    try {
      const result = await getActiveBranches(getBusinessId())
      if (result.success) {
        setBranches(result.data || [])
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
    }
  }

  const loadCompanySettings = async () => {
    if (!user?.uid) return

    try {
      if (isDemoMode) {
        setCompanySettings({ companyName: 'Empresa Demo' })
        return
      }

      const result = await getCompanySettings(getBusinessId())
      if (result.success) {
        setCompanySettings(result.data || {})
      }
    } catch (error) {
      console.error('Error al cargar configuración de empresa:', error)
    }
  }

  // Estado del modal de opciones de exportación
  const [showExportModal, setShowExportModal] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleOpenExportModal = () => {
    if (products.length === 0 && ingredients.length === 0) {
      toast.error('No hay items en el inventario para exportar')
      return
    }
    setShowExportModal(true)
  }

  const handleExportWithOptions = async (options) => {
    try {
      setIsExporting(true)

      // Obtener datos del negocio
      const { getCompanySettings } = await import('@/services/firestoreService')
      const settingsResult = await getCompanySettings(getBusinessId())
      const businessData = settingsResult.success ? settingsResult.data : null

      // Importar y ejecutar el export
      const { exportInventoryWithOptions } = await import('@/services/inventoryExportService')
      const result = await exportInventoryWithOptions({
        products,
        ingredients,
        categories: productCategories,
        brands,
        warehouses: filteredWarehouses,
        businessData,
        options,
      })

      toast.success(`${result.itemCount} item(s) exportado(s) exitosamente`)
      setShowExportModal(false)
    } catch (error) {
      console.error('Error al exportar inventario:', error)
      toast.error(error.message || 'Error al generar el archivo Excel')
    } finally {
      setIsExporting(false)
    }
  }

  // Función para escanear código de barras y buscar producto
  const handleScanBarcode = async () => {
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

        // Buscar producto por código de barras o SKU
        // (incluye `barcodes[]`: códigos alternativos del mismo producto)
        const foundProduct = products.find(
          p => p.code === scannedCode ||
            p.sku === scannedCode ||
            p.barcode === scannedCode ||
            (Array.isArray(p.barcodes) && p.barcodes.includes(scannedCode))
        )

        if (foundProduct) {
          // Establecer el término de búsqueda para mostrar el producto
          setSearchTerm(scannedCode)
          toast.success(`Producto encontrado: ${foundProduct.name}`)
        } else {
          toast.error(`No se encontró producto con código: ${scannedCode}`)
          setSearchTerm(scannedCode)
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

  const openTransferModal = (product) => {
    setTransferProduct(product)
    setTransferData({
      fromWarehouse: '',
      toWarehouse: '',
      quantity: '',
      notes: '',
      selectedBatch: '',
      selectedSerials: [],
    })
    setShowTransferModal(true)
  }

  const closeTransferModal = () => {
    setShowTransferModal(false)
    setTransferProduct(null)
    setTransferData({
      fromWarehouse: '',
      toWarehouse: '',
      quantity: '',
      notes: '',
      selectedBatch: '',
      selectedSerials: [],
      selectedVariantSku: ''
    })
  }

  // Funciones para modal de merma/daños (o salida simple en modo logística)
  const openDamageModal = (product) => {
    setDamageProduct(product)
    // Si solo hay un almacén, seleccionarlo automáticamente
    const activeWarehouses = warehouses.filter(w => w.isActive)
    const defaultWarehouseId = activeWarehouses.length === 1 ? activeWarehouses[0].id : ''
    setDamageData({
      warehouseId: defaultWarehouseId,
      quantity: '',
      reason: businessMode === 'logistics' ? 'office_use' : 'damaged',
      notes: '',
      selectedSerials: [],
      selectedVariantSku: '',
    })
    setShowDamageModal(true)
  }

  const closeDamageModal = () => {
    setShowDamageModal(false)
    setDamageProduct(null)
    setDamageData({
      warehouseId: '',
      quantity: '',
      reason: 'damaged',
      notes: '',
      selectedSerials: [],
      selectedVariantSku: '',
    })
  }

  const handleDamage = async () => {
    if (!user?.uid || !damageProduct) return

    // Validaciones
    if (!damageData.warehouseId) {
      toast.error('Debes seleccionar un almacén')
      return
    }

    // Validar variante si el producto tiene variantes
    const isVariantDamage = damageProduct.hasVariants && damageProduct.variants?.length > 0
    if (isVariantDamage && !damageData.selectedVariantSku) {
      toast.error('Debes seleccionar una variante')
      return
    }

    // Validar seriales
    if (damageProduct.trackSerials && damageProduct.serials?.length > 0) {
      if (!damageData.selectedSerials || damageData.selectedSerials.length === 0) {
        toast.error('Debes seleccionar al menos una serie')
        return
      }
    }

    const quantity = parseFloat(damageData.quantity)
    if (!quantity || quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    // Verificar stock disponible en almacén (o variante)
    let availableStock = 0
    if (isVariantDamage) {
      const selectedVariant = damageProduct.variants.find(v => v.sku === damageData.selectedVariantSku)
      const variantWS = selectedVariant?.warehouseStocks?.find(ws => ws.warehouseId === damageData.warehouseId)
      availableStock = variantWS?.stock || 0
    } else {
      const warehouseStock = damageProduct.warehouseStocks?.find(
        ws => ws.warehouseId === damageData.warehouseId
      )
      availableStock = warehouseStock?.stock || 0
    }

    if (quantity > availableStock) {
      toast.error(`Stock insuficiente. Disponible: ${availableStock}`)
      return
    }

    setIsProcessingDamage(true)
    try {
      const businessId = getBusinessId()
      const warehouseName = warehouses.find(w => w.id === damageData.warehouseId)?.name || ''

      // Mapeo de razones (se comparten ambos modos para no romper datos históricos)
      const reasonLabels = {
        // Motivos de merma/daño (modo normal)
        damaged: 'Producto dañado',
        expired: 'Producto expirado',
        lost: 'Pérdida/Extravío',
        theft: 'Robo',
        // Motivos de salida simple (modo logística)
        office_use: 'Uso en oficina',
        employee_delivery: 'Entrega a trabajador',
        internal_consumption: 'Consumo interno',
        project_use: 'Uso en proyecto/obra',
        other: 'Otro'
      }
      const reasonLabel = reasonLabels[damageData.reason] || damageData.reason

      // Crear movimiento de merma
      const variantSku = isVariantDamage ? damageData.selectedVariantSku : null
      const variantNote = variantSku ? ` (Variante: ${variantSku})` : ''

      // Lotes: si el producto (sin variantes) maneja lotes, descontar de batches[] con
      // FEFO para que el detalle por lote no se descuadre del stock total. Antes la merma
      // bajaba el stock total pero dejaba batches[] intacto.
      let damageBatchUpdates = {}
      let damageBatchNumber = null
      let damageBatchNote = ''
      if (!damageProduct.isIngredient && !isVariantDamage && damageProduct.batches?.length > 0) {
        const result = computeBatchDeduction(
          damageProduct,
          { batchNumber: damageData.selectedBatch || null, productId: damageProduct.id },
          damageData.warehouseId,
          quantity
        )
        if (result && result.batchBreakdown?.length > 0) {
          const meta = computeProductBatchMetadata(result.updatedBatches)
          damageBatchUpdates = {
            batches: result.updatedBatches,
            batchNumber: meta.batchNumber,
            expirationDate: meta.expirationDate,
          }
          damageBatchNumber = result.batchBreakdown[0].lotNumber || null
          damageBatchNote = ' | Lotes: ' + result.batchBreakdown
            .map(b => `${b.lotNumber || 's/l'}(${b.quantity})`).join(', ')
        }
      }

      const movementData = {
        warehouseId: damageData.warehouseId,
        type: 'damage',
        quantity: -quantity, // Siempre negativo
        reason: reasonLabel,
        referenceType: 'damage_adjustment',
        userId: user.uid,
        notes: (damageData.notes || `${businessMode === 'logistics' ? 'Salida' : 'Merma'}: ${quantity} unidades - ${reasonLabel}${variantNote}`) + damageBatchNote,
        ...(variantSku && { variantSku }),
        ...(damageBatchNumber && { batchNumber: damageBatchNumber }),
      }

      // Usar ingredientId o productId según corresponda
      if (damageProduct.isIngredient) {
        movementData.ingredientId = damageProduct.id
        movementData.ingredientName = damageProduct.name
        movementData.isIngredient = true
      } else {
        movementData.productId = damageProduct.id
      }

      await createStockMovement(businessId, movementData)

      if (damageProduct.isIngredient) {
        // Actualizar stock del ingrediente
        const updatedWarehouseStocks = [...(damageProduct.warehouseStocks || [])]
        const wsIdx = updatedWarehouseStocks.findIndex(ws => ws.warehouseId === damageData.warehouseId)
        if (wsIdx >= 0) {
          updatedWarehouseStocks[wsIdx] = {
            ...updatedWarehouseStocks[wsIdx],
            stock: Math.max(0, (updatedWarehouseStocks[wsIdx].stock || 0) - quantity)
          }
        }
        const newTotalStock = updatedWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)

        const updateResult = await updateIngredient(businessId, damageProduct.id, {
          currentStock: newTotalStock,
          warehouseStocks: updatedWarehouseStocks
        })

        if (!updateResult.success) {
          throw new Error('Error al actualizar el stock del ingrediente')
        }
      } else {
        // Actualizar seriales a 'lost' si aplica (solo para productos)
        const extraDamageUpdates = {}
        if (damageData.selectedSerials?.length > 0 && damageProduct.serials?.length > 0) {
          const updatedSerials = damageProduct.serials.map(s => {
            if (damageData.selectedSerials.includes(s.serialNumber) && s.status === 'available') {
              return { ...s, status: 'lost', lostReason: reasonLabel, lostDate: new Date() }
            }
            return s
          })
          extraDamageUpdates.serials = updatedSerials
        }

        // Aplicar el descuento de lotes (batches[]) calculado con FEFO arriba
        if (damageBatchUpdates.batches) {
          extraDamageUpdates.batches = damageBatchUpdates.batches
          extraDamageUpdates.batchNumber = damageBatchUpdates.batchNumber
          extraDamageUpdates.expirationDate = damageBatchUpdates.expirationDate
        }

        // Actualizar stock del producto en el almacén (transacción atómica)
        const updateResult = await updateProductStockTransaction(
          businessId,
          damageProduct.id,
          damageData.warehouseId,
          -quantity,
          extraDamageUpdates,
          variantSku
        )

        if (!updateResult.success) {
          throw new Error('Error al actualizar el stock')
        }
      }

      const actionWord = businessMode === 'logistics' ? 'Salida' : 'Merma'
      toast.success(`${actionWord} registrada: ${quantity} ${damageProduct.isIngredient ? damageProduct.purchaseUnit : 'unidades'} de ${damageProduct.name}`)
      closeDamageModal()
      if (damageProduct.isIngredient) {
        loadIngredients()
      } else {
        loadProducts()
      }
    } catch (error) {
      const actionWordLower = businessMode === 'logistics' ? 'salida' : 'merma'
      console.error(`Error al registrar ${actionWordLower}:`, error)
      toast.error(`Error al registrar la ${actionWordLower}`)
    } finally {
      setIsProcessingDamage(false)
    }
  }

  // Funciones para modal de producción rápida
  const openProductionModal = async (product) => {
    setProductionProduct(product)
    setProductionMode(null)
    setProductionRecipeInfo(null)
    const activeWarehouses = warehouses.filter(w => w.isActive)
    const defaultWarehouseId = activeWarehouses.length === 1 ? activeWarehouses[0].id : ''
    setProductionData({
      warehouseId: defaultWarehouseId,
      quantity: '',
      notes: '',
      batchNumber: '',
      expirationDate: '',
      serials: ''
    })
    setShowProductionModal(true)

    // Verificar si tiene receta
    try {
      const businessId = getBusinessId()
      const recipeResult = await getRecipeByProductId(businessId, product.id)
      if (recipeResult.success) {
        setProductionMode('recipe')
        // Pre-cargar info de receta
        setIsCheckingProductionRecipe(true)
        const readiness = await checkProductionReadiness(businessId, product.id, 1)
        if (readiness.success && readiness.hasRecipe) {
          let totalCost = 0
          if (readiness.recipe?.ingredients) {
            totalCost = await calculateRecipeCost(businessId, readiness.recipe.ingredients)
          }
          setProductionRecipeInfo({
            recipe: readiness.recipe,
            hasStock: readiness.hasStock,
            missingIngredients: readiness.missingIngredients || [],
            totalCost
          })
        }
        setIsCheckingProductionRecipe(false)
      } else {
        setProductionMode('manual')
      }
    } catch (error) {
      console.error('Error al verificar receta:', error)
      setProductionMode('manual')
    }
  }

  const closeProductionModal = () => {
    setShowProductionModal(false)
    setProductionProduct(null)
    setProductionMode(null)
    setProductionRecipeInfo(null)
    setProductionData({
      warehouseId: '',
      quantity: '',
      notes: '',
      batchNumber: '',
      expirationDate: '',
      serials: ''
    })
  }

  const handleProductionQuantityChange = async (value) => {
    setProductionData(prev => ({ ...prev, quantity: value }))
    if (productionMode === 'recipe' && productionProduct && value) {
      const qty = parseFloat(value)
      if (qty > 0) {
        setIsCheckingProductionRecipe(true)
        try {
          const businessId = getBusinessId()
          const readiness = await checkProductionReadiness(businessId, productionProduct.id, qty)
          if (readiness.success && readiness.hasRecipe) {
            let totalCost = 0
            if (readiness.recipe?.ingredients) {
              totalCost = await calculateRecipeCost(businessId, readiness.recipe.ingredients) * qty
            }
            setProductionRecipeInfo({
              recipe: readiness.recipe,
              hasStock: readiness.hasStock,
              missingIngredients: readiness.missingIngredients || [],
              totalCost
            })
          }
        } catch (error) {
          console.error('Error al re-verificar stock:', error)
        } finally {
          setIsCheckingProductionRecipe(false)
        }
      }
    }
  }

  const handleProduction = async () => {
    if (!user?.uid || !productionProduct) return

    if (!productionData.warehouseId) {
      toast.error('Debes seleccionar un almacén destino')
      return
    }

    const quantity = parseFloat(productionData.quantity)
    if (!quantity || quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    // Lote/vencimiento y series (solo productos sin variantes que los manejan)
    // El lote/vencimiento solo aplica si el control de lotes está habilitado globalmente
    // (farmacia o la preferencia "Control de Lotes y Vencimientos"); si está desactivado,
    // no se exige aunque el producto tenga trackExpiration marcado de antes.
    const batchControlEnabled = businessMode === 'pharmacy' || businessSettings?.posCustomFields?.showBatchExpiryInPurchase
    const tracksBatch = batchControlEnabled && productionProduct.trackExpiration && !productionProduct.hasVariants
    const tracksSerials = productionProduct.trackSerials && !productionProduct.hasVariants

    if (tracksBatch) {
      if (!productionData.batchNumber.trim()) {
        toast.error('Ingresa el número de lote del producto producido')
        return
      }
      if (!productionData.expirationDate) {
        toast.error('Ingresa la fecha de vencimiento del lote')
        return
      }
    }

    let serialsList = []
    if (tracksSerials) {
      serialsList = productionData.serials.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
      if (serialsList.length === 0) {
        toast.error('Ingresa los números de serie producidos')
        return
      }
      if (serialsList.length !== quantity) {
        toast.error(`Debes ingresar ${quantity} números de serie (ingresaste ${serialsList.length})`)
        return
      }
      const seen = new Set()
      const dupes = serialsList.filter(s => { const k = s.toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false })
      if (dupes.length > 0) {
        toast.error(`Hay números de serie repetidos: ${[...new Set(dupes)].join(', ')}`)
        return
      }
      const existing = new Set((productionProduct.serials || []).map(s => String(s.serialNumber).trim().toLowerCase()))
      const collide = serialsList.filter(s => existing.has(s.toLowerCase()))
      if (collide.length > 0) {
        toast.error(`Estos números de serie ya existen: ${collide.join(', ')}`)
        return
      }
    }

    setIsProcessingProduction(true)
    try {
      const businessId = getBusinessId()
      const params = {
        productId: productionProduct.id,
        productName: productionProduct.name,
        quantity,
        warehouseId: productionData.warehouseId,
        notes: productionData.notes,
        userId: user.uid,
        product: productionProduct,
        ...(tracksBatch && { batchNumber: productionData.batchNumber.trim(), expirationDate: productionData.expirationDate }),
        ...(tracksSerials && { serials: serialsList }),
      }

      let result
      if (productionMode === 'recipe') {
        result = await executeRecipeProduction(businessId, params)
      } else {
        result = await executeManualProduction(businessId, params)
      }

      if (result.success) {
        const modeLabel = productionMode === 'recipe' ? 'con receta' : 'manual'
        toast.success(`Producción ${modeLabel}: ${quantity} unidades de ${productionProduct.name}`)
        closeProductionModal()
        loadProducts()
        loadIngredients()
      } else {
        toast.error(result.error || 'Error al ejecutar producción')
      }
    } catch (error) {
      console.error('Error en producción:', error)
      toast.error('Error inesperado al ejecutar producción')
    } finally {
      setIsProcessingProduction(false)
    }
  }

  // Funciones para modal de historial de movimientos
  const openHistoryModal = async (product) => {
    setHistoryProduct(product)
    setShowHistoryModal(true)
    setIsLoadingHistory(true)

    try {
      const businessId = getBusinessId()
      // Usar ingredientId si es ingrediente, productId si es producto
      const filterKey = product.isIngredient ? 'ingredientId' : 'productId'
      const result = await getStockMovements(businessId, { [filterKey]: product.id })

      if (result.success) {
        // Enriquecer movimientos con nombres de almacenes
        const enrichedMovements = result.data.map(mov => {
          const defaultWarehouse = warehouses.find(w => w.isDefault) || warehouses[0]
          const warehouse = mov.warehouseId
            ? warehouses.find(w => w.id === mov.warehouseId) || defaultWarehouse
            : defaultWarehouse
          const fromWarehouse = warehouses.find(w => w.id === mov.fromWarehouse)
          const toWarehouse = warehouses.find(w => w.id === mov.toWarehouse)

          return {
            ...mov,
            warehouseName: warehouse?.name || 'Almacén Principal',
            fromWarehouseName: fromWarehouse?.name,
            toWarehouseName: toWarehouse?.name,
          }
        })
        setProductMovements(enrichedMovements)
      } else {
        toast.error('Error al cargar el historial')
      }
    } catch (error) {
      console.error('Error al cargar historial:', error)
      toast.error('Error al cargar el historial')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const closeHistoryModal = () => {
    setShowHistoryModal(false)
    setHistoryProduct(null)
    setProductMovements([])
  }

  // Recalcular stock desde movimientos
  const handleRecalculateStock = async () => {
    if (!historyProduct || isDemoMode) return
    setIsRecalculating(true)
    try {
      const businessId = getBusinessId()
      console.log('Recalculando stock para:', historyProduct.id, historyProduct.name)
      console.log('Stock actual en modal:', historyProduct.stock)

      const result = await recalculateStockFromMovements(businessId, historyProduct.id, historyProduct.isIngredient)
      console.log('Resultado recalculo:', result)

      if (result.success) {
        // Actualizar el producto en el modal con el stock corregido
        setHistoryProduct(prev => prev ? { ...prev, stock: result.stockFromMovements } : prev)

        // También actualizar el producto en la lista local (stock Y warehouseStocks)
        setProducts(prev => prev.map(p => {
          if (p.id !== historyProduct.id) return p

          // Construir nuevo warehouseStocks basado en byWarehouse
          const newWarehouseStocks = (p.warehouseStocks || []).map(ws => ({
            ...ws,
            stock: result.byWarehouse?.[ws.warehouseId] || 0
          }))

          return {
            ...p,
            stock: result.stockFromMovements,
            warehouseStocks: newWarehouseStocks
          }
        }))

        if (result.corrected) {
          toast.success(`Stock corregido: ${result.previousStock} → ${result.stockFromMovements}`)
        } else {
          toast.info(`El stock ya estaba correcto (${result.stockFromMovements})`)
        }

        // Advertir si hay movimientos sin variantSku en producto con variantes
        if (result.hasVariants && result.orphanMovements?.length > 0) {
          const count = result.orphanMovements.length
          toast.warning(
            `Hay ${count} movimiento${count > 1 ? 's' : ''} antiguo${count > 1 ? 's' : ''} sin variante asignada. Las variantes se recalcularon ignorándolos. Si tu stock no cuadra, haz un recuento manual de cada variante.`,
            8000
          )
          console.warn('Movimientos huérfanos (sin variantSku):', result.orphanMovements)
        }
      } else {
        console.error('Error en recalculo:', result.error)
        toast.error('Error al recalcular: ' + (result.error || 'Error desconocido'))
      }
    } catch (error) {
      console.error('Error al recalcular stock:', error)
      toast.error('Error al recalcular el stock: ' + error.message)
    } finally {
      setIsRecalculating(false)
    }
  }

  // Función para obtener info del tipo de movimiento
  const getMovementTypeInfo = (type) => {
    const types = {
      entry: {
        label: 'Entrada',
        icon: ArrowUpCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        variant: 'success',
      },
      exit: {
        label: 'Salida',
        icon: ArrowDownCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        variant: 'danger',
      },
      sale: {
        label: 'Venta',
        icon: ArrowDownCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        variant: 'danger',
      },
      transfer_in: {
        label: 'Transferencia Entrada',
        icon: ArrowRightLeft,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        variant: 'info',
      },
      transfer_out: {
        label: 'Transferencia Salida',
        icon: ArrowRightLeft,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        variant: 'warning',
      },
      adjustment: {
        label: 'Ajuste',
        icon: Package,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        variant: 'default',
      },
      damage: {
        label: businessMode === 'logistics' ? 'Salida' : 'Merma/Dañado',
        icon: AlertTriangle,
        color: businessMode === 'logistics' ? 'text-blue-700' : 'text-red-700',
        bgColor: businessMode === 'logistics' ? 'bg-blue-100' : 'bg-red-100',
        variant: businessMode === 'logistics' ? 'default' : 'danger',
      },
      production: {
        label: 'Producción',
        icon: Cog,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        variant: 'success',
      },
      production_manual: {
        label: 'Producción Manual',
        icon: Cog,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        variant: 'success',
      },
      production_consumption: {
        label: 'Consumo Producción',
        icon: Cog,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        variant: 'warning',
      },
    }

    return types[type] || types.adjustment
  }

  // Función para formatear fecha
  const formatMovementDate = (date) => {
    if (!date) return '-'
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
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

  const handleTransfer = async () => {
    if (!user?.uid || !transferProduct) return

    // Validaciones
    if (!transferData.fromWarehouse || !transferData.toWarehouse) {
      toast.error('Debes seleccionar ambos almacenes')
      return
    }

    if (transferData.fromWarehouse === transferData.toWarehouse) {
      toast.error('Los almacenes de origen y destino deben ser diferentes')
      return
    }

    const quantity = parseFloat(transferData.quantity)
    if (!quantity || quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    // ========== TRANSFERENCIA DE INGREDIENTES ==========
    if (transferProduct.isIngredient) {
      // Verificar stock disponible
      const warehouseStock = transferProduct.warehouseStocks?.find(ws => ws.warehouseId === transferData.fromWarehouse)
      const availableStock = warehouseStock?.stock || 0

      if (quantity > availableStock) {
        toast.error(`Stock insuficiente. Disponible: ${availableStock} ${transferProduct.purchaseUnit}`)
        return
      }

      setIsTransferring(true)
      try {
        const businessId = getBusinessId()
        const fromWarehouseName = warehouses.find(w => w.id === transferData.fromWarehouse)?.name || ''
        const toWarehouseName = warehouses.find(w => w.id === transferData.toWarehouse)?.name || ''

        // Usar la función de transferencia de ingredientes
        const result = await transferIngredientStock(
          businessId,
          transferProduct.id,
          transferData.fromWarehouse,
          transferData.toWarehouse,
          quantity
        )

        if (!result.success) {
          throw new Error(result.error || 'Error al transferir ingrediente')
        }

        // Crear movimientos de stock
        await createStockMovement(businessId, {
          ingredientId: transferProduct.id,
          ingredientName: transferProduct.name,
          warehouseId: transferData.fromWarehouse,
          type: 'transfer_out',
          quantity: -quantity,
          unit: transferProduct.purchaseUnit,
          reason: 'Transferencia entre almacenes',
          referenceType: 'transfer',
          toWarehouse: transferData.toWarehouse,
          userId: user.uid,
          isIngredient: true,
          notes: transferData.notes || `Transferencia → ${toWarehouseName}`,
        })

        await createStockMovement(businessId, {
          ingredientId: transferProduct.id,
          ingredientName: transferProduct.name,
          warehouseId: transferData.toWarehouse,
          type: 'transfer_in',
          quantity: quantity,
          unit: transferProduct.purchaseUnit,
          reason: 'Transferencia entre almacenes',
          referenceType: 'transfer',
          fromWarehouse: transferData.fromWarehouse,
          userId: user.uid,
          isIngredient: true,
          notes: transferData.notes || `Transferencia ← ${fromWarehouseName}`,
        })

        toast.success(`Transferencia exitosa: ${quantity} ${transferProduct.purchaseUnit} de ${transferProduct.name}`)
        closeTransferModal()
        loadIngredients()
      } catch (error) {
        console.error('Error en transferencia de ingrediente:', error)
        toast.error(error.message || 'Error al realizar la transferencia')
      } finally {
        setIsTransferring(false)
      }
      return
    }

    // ========== TRANSFERENCIA DE PRODUCTOS ==========
    // Verificar que el producto maneja stock
    if (transferProduct.trackStock === false) {
      toast.error('Este producto no maneja stock y no puede ser transferido')
      return
    }

    // Verificar stock disponible en almacén origen (o en el lote seleccionado)
    const batchesInOrigin = (transferProduct.batches || []).filter(b => b.quantity > 0 && (!b.warehouseId || b.warehouseId === transferData.fromWarehouse))
    const hasBatches = batchesInOrigin.length > 0
    const isNoLotTransfer = transferData.selectedBatch === '__NO_LOT__'
    const selectedBatchData = hasBatches && transferData.selectedBatch && !isNoLotTransfer
      ? transferProduct.batches.find(b => (b.lotNumber || b.batchNumber || b.id) === transferData.selectedBatch)
      : null

    // Calcular stock sin lote para validación
    const warehouseStockTotal = transferProduct.warehouseStocks?.find(ws => ws.warehouseId === transferData.fromWarehouse)?.stock || 0
    const batchesTotalInOrigin = batchesInOrigin.reduce((sum, b) => sum + (b.quantity || 0), 0)
    const stockWithoutLotInOrigin = Math.max(0, warehouseStockTotal - batchesTotalInOrigin)

    if (hasBatches && !transferData.selectedBatch) {
      // Si hay lotes pero también hay stock sin lote, aún se debe seleccionar algo
      if (stockWithoutLotInOrigin > 0) {
        toast.error('Debes seleccionar un lote o "Sin lote" para transferir')
      } else {
        toast.error('Debes seleccionar un lote para transferir')
      }
      return
    }

    // Validar seriales
    if (transferProduct.trackSerials && (transferProduct.serials || []).filter(s => s.status === 'available' && (!s.warehouseId || s.warehouseId === transferData.fromWarehouse)).length > 0) {
      if (!transferData.selectedSerials || transferData.selectedSerials.length === 0) {
        toast.error('Debes seleccionar al menos un número de serie para transferir')
        return
      }
    }

    // Para variantes: buscar stock en la variante seleccionada
    let availableStock = 0
    const isVariantTransfer = transferProduct.hasVariants && transferData.selectedVariantSku

    if (isVariantTransfer) {
      if (!transferData.selectedVariantSku) {
        toast.error('Debes seleccionar una variante')
        return
      }
      const selectedVariant = transferProduct.variants?.find(v => v.sku === transferData.selectedVariantSku)
      const variantWS = selectedVariant?.warehouseStocks?.find(ws => ws.warehouseId === transferData.fromWarehouse)
      availableStock = variantWS?.stock || 0
    } else if (isNoLotTransfer) {
      // Transferencia de stock sin lote
      availableStock = stockWithoutLotInOrigin
    } else if (selectedBatchData) {
      availableStock = selectedBatchData.quantity
    } else {
      const warehouseStock = transferProduct.warehouseStocks?.find(ws => ws.warehouseId === transferData.fromWarehouse)
      availableStock = warehouseStock?.stock || 0
    }

    if (quantity > availableStock) {
      const stockSource = isNoLotTransfer ? 'stock sin lote' : selectedBatchData ? `lote ${transferData.selectedBatch}` : 'almacén origen'
      toast.error(`Stock insuficiente en ${stockSource}. Disponible: ${availableStock}`)
      return
    }

    setIsTransferring(true)

    try {
      const businessId = getBusinessId()

      // Transferencia ATÓMICA (Fase 2): salida del origen + entrada al destino en UNA
      // sola transacción que lee fresco y mueve warehouseStocks + el lote seleccionado
      // + series juntos. Evita stock evaporado (antes 2 transacciones) y el descuadre
      // lote↔almacén por snapshot viejo.
      const variantSku = isVariantTransfer ? transferData.selectedVariantSku : null
      const transferRes = await transferProductStockTransaction(
        businessId,
        transferProduct.id,
        transferData.fromWarehouse,
        transferData.toWarehouse,
        quantity,
        {
          variantSku,
          batchNumber: selectedBatchData ? transferData.selectedBatch : null,
          isNoLot: isNoLotTransfer,
          serialNumbers: transferData.selectedSerials || [],
          allowNegative: false,
        }
      )

      if (!transferRes.success) {
        throw new Error(transferRes.error || 'Error al transferir el stock')
      }

      const batchNote = selectedBatchData ? ` (Lote: ${transferData.selectedBatch})` : ''

      const variantNote = variantSku ? ` (Variante: ${variantSku})` : ''

      // 4. Registrar movimiento de salida
      await createStockMovement(businessId, {
        productId: transferProduct.id,
        warehouseId: transferData.fromWarehouse,
        type: 'transfer_out',
        quantity: -quantity,
        reason: 'Transferencia',
        referenceType: 'transfer',
        toWarehouse: transferData.toWarehouse,
        userId: user.uid,
        ...(selectedBatchData && { batchNumber: transferData.selectedBatch }),
        ...(variantSku && { variantSku }),
        ...(transferData.selectedSerials?.length > 0 && { serialNumbers: transferData.selectedSerials }),
        notes: transferData.notes || `Transferencia a ${allWarehouses.find(w => w.id === transferData.toWarehouse)?.name}${batchNote}${variantNote}`
      })

      // 5. Registrar movimiento de entrada
      await createStockMovement(businessId, {
        productId: transferProduct.id,
        warehouseId: transferData.toWarehouse,
        type: 'transfer_in',
        quantity: quantity,
        reason: 'Transferencia',
        referenceType: 'transfer',
        fromWarehouse: transferData.fromWarehouse,
        userId: user.uid,
        ...(selectedBatchData && { batchNumber: transferData.selectedBatch }),
        ...(variantSku && { variantSku }),
        ...(transferData.selectedSerials?.length > 0 && { serialNumbers: transferData.selectedSerials }),
        notes: transferData.notes || `Transferencia desde ${allWarehouses.find(w => w.id === transferData.fromWarehouse)?.name}${batchNote}${variantNote}`
      })

      toast.success('Transferencia realizada exitosamente')
      closeTransferModal()
      loadProducts() // Recargar productos
    } catch (error) {
      console.error('Error al realizar transferencia:', error)
      toast.error('Error al realizar la transferencia')
    } finally {
      setIsTransferring(false)
    }
  }

  // Combinar productos e ingredientes en modo retail
  // IMPORTANTE: Este useMemo genera la lista base según el filtro de tipo
  const allItems = React.useMemo(() => {
    console.log(`📋 [Inventory] useMemo recalculando con filterType="${filterType}"`)

    // Mapear productos con itemType
    const productItems = products.map(p => ({ ...p, itemType: 'product' }))

    // Mapear ingredientes
    const ingredientItems = ingredients.map(i => ({
      ...i,
      itemType: 'ingredient',
      isIngredient: true,
      code: i.code || '-',
      price: i.averageCost || 0,
      stock: i.currentStock || 0,
      category: i.category
    }))

    console.log(`📋 [Inventory] Datos: ${productItems.length} productos, ${ingredientItems.length} insumos`)

    // Filtrar según el tipo seleccionado
    let result
    if (filterType === 'products') {
      result = productItems
      console.log(`📋 [Inventory] Retornando ${result.length} productos`)
    } else if (filterType === 'ingredients') {
      result = ingredientItems
      console.log(`📋 [Inventory] Retornando ${result.length} insumos`)
    } else {
      // 'all' o default
      result = [...productItems, ...ingredientItems]
      console.log(`📋 [Inventory] Retornando todos: ${result.length} items`)
    }

    return result
  }, [products, ingredients, filterType])

  // Búsqueda con haystack pre-construido (perf): re-normaliza solo cuando cambia
  // la lista de items, no en cada keystroke.
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const itemSearchIndex = React.useMemo(() => {
    const map = new Map()
    for (const item of allItems) {
      // Key compuesta porque productos e ingredientes pueden compartir id.
      const key = `${item.itemType}-${item.id}`
      if (item.itemType === 'ingredient') {
        // Los insumos solo tienen name + category relevantes.
        map.set(key, buildSearchHaystack(item.name, item.code, item.category))
      } else {
        map.set(key, buildSearchHaystack(
          item.name,
          item.code,
          item.sku,
          item.category,
          item.marca,
          item.laboratoryName,
        ))
      }
    }
    return map
  }, [allItems])

  // Filtrar y ordenar items (optimizado con useMemo)
  const filteredProducts = React.useMemo(() => {
    console.log(`🔍 [Inventory] filteredProducts recalculando. allItems.length=${allItems.length}`)

    const filtered = allItems.filter(item => {
      // Búsqueda flexible: cada palabra parcial debe aparecer en alguno de los
      // campos, en cualquier orden, sin acentos. "pol roj x" matchea "POLO ROJO XXL".
      const matchesSearch = matchesPrebuilt(deferredSearchTerm, itemSearchIndex.get(`${item.itemType}-${item.id}`) || '')

      // Multi-select: array vacío = todas las categorías
      const matchesCategory =
        filterCategories.length === 0 || filterCategories.includes(item.category)

      // Marca: multi-select. "sin-marca" matchea productos sin brandId. El resto
      // matchea por brandId administrado.
      let matchesBrand = true
      if (filterBrands.length > 0) {
        const wantsSinMarca = filterBrands.includes('sin-marca')
        const wantedBrandIds = filterBrands.filter(id => id !== 'sin-marca')
        matchesBrand =
          (wantsSinMarca && !item.brandId) ||
          wantedBrandIds.includes(item.brandId)
      }

      // Usar stock filtrado por sucursal
      const branchStock = getStockForBranch(item)

      // Multi-select: array vacío = todos los estados
      // Stock mínimo por producto (default 3 si no está configurado).
      const itemMinStock = Number.isFinite(Number(item?.minStock)) && Number(item?.minStock) >= 0
        ? Number(item.minStock)
        : 3
      let matchesStatus = true
      if (filterStatuses.length > 0) {
        const itemStatuses = []
        if (branchStock !== null && branchStock > 0 && branchStock <= itemMinStock) {
          itemStatuses.push('low')
        }
        if (branchStock === 0) {
          itemStatuses.push('out')
        }
        if (branchStock === null || branchStock > itemMinStock) {
          itemStatuses.push('normal')
        }
        matchesStatus = filterStatuses.some(status => itemStatuses.includes(status))
      }

      // Filtro por control de stock
      let matchesStockTracking = true
      const hasVariantStock = item.hasVariants && item.variants?.length > 0
      if (filterStockTracking === 'tracked') {
        // Solo items que manejan stock (trackStock !== false y stock no es null, o tiene variantes con stock)
        matchesStockTracking = item.trackStock !== false && (item.stock !== null && item.stock !== undefined || hasVariantStock)
      } else if (filterStockTracking === 'untracked') {
        // Solo items que NO manejan stock
        matchesStockTracking = item.trackStock === false || (item.stock === null && item.stock === undefined && !hasVariantStock)
      }

      return matchesSearch && matchesCategory && matchesBrand && matchesStatus && matchesStockTracking
    })

    // Ordenar productos
    const sorted = [...filtered].sort((a, b) => {
      let aValue, bValue

      switch (sortField) {
        case 'code':
          aValue = a.sku || a.code || ''
          bValue = b.sku || b.code || ''
          break
        case 'name':
          aValue = a.name || ''
          bValue = b.name || ''
          break
        case 'price':
          aValue = a.price || 0
          bValue = b.price || 0
          break
        case 'stock':
          // Ordenar por stock de la sucursal seleccionada
          aValue = getStockForBranch(a) ?? -1
          bValue = getStockForBranch(b) ?? -1
          break
        case 'category':
          aValue = getCategoryPath(productCategories, a.category) || ''
          bValue = getCategoryPath(productCategories, b.category) || ''
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

    console.log(`🔍 [Inventory] filteredProducts resultado: ${sorted.length} items`)
    return sorted
  }, [allItems, deferredSearchTerm, itemSearchIndex, filterCategories, filterBrands, filterStatuses, filterStockTracking, productCategories, sortField, sortDirection, getStockForBranch])

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
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterCategories, filterBrands, filterStatuses, filterBranch, filterWarehouses, filterStockTracking])

  // Obtener categorías únicas (productos + ingredientes en retail)
  const categories = React.useMemo(() => {
    let allCategories = []

    // Categorías de productos
    const productCats = [...new Set(products.map(p => p.category).filter(Boolean))]
    allCategories = productCats.map(catId => {
      const category = productCategories.find(c => c.id === catId)
      return category ? { id: catId, name: category.name } : { id: catId, name: catId }
    })

    // Categorías de ingredientes (resuelve a través de ingredientCategories + fallback a slugs viejos)
    const ingredientCats = [...new Set(ingredients.map(i => i.category).filter(Boolean))]
    ingredientCats.forEach(cat => {
      if (!allCategories.find(c => c.id === cat)) {
        allCategories.push({
          id: cat,
          name: getIngredientCategoryName(ingredientCategories, cat) || cat
        })
      }
    })

    return allCategories
  }, [products, ingredients, productCategories, ingredientCategories])

  // Calcular estadísticas (basadas en productos filtrados para reflejar todos los filtros)
  const statistics = React.useMemo(() => {
    const itemsWithStock = filteredProducts.filter(i => getStockForBranch(i) !== null)
    const lowStockItems = itemsWithStock.filter(i => {
      const branchStock = getStockForBranch(i)
      const itemMinStock = Number.isFinite(Number(i?.minStock)) && Number(i?.minStock) >= 0
        ? Number(i.minStock)
        : 3
      return branchStock !== null && branchStock > 0 && branchStock <= itemMinStock
    })
    const outOfStockItems = itemsWithStock.filter(i => getStockForBranch(i) === 0)
    const totalValue = itemsWithStock.reduce((sum, i) => {
      if (i.hasVariants && i.variants?.length > 0) {
        return sum + i.variants.reduce((vs, v) => vs + (v.stock || 0) * (v.price || 0), 0)
      }
      const branchStock = getStockForBranch(i) || 0
      const price = i.itemType === 'ingredient' ? (i.averageCost || 0) : (i.price || 0)
      return sum + (branchStock * price)
    }, 0)
    const totalCostValue = itemsWithStock.reduce((sum, i) => {
      if (i.hasVariants && i.variants?.length > 0) {
        // Para variantes, usar el costo de la variante si existe, si no usar el costo del producto padre
        const parentCost = parseFloat(i.cost) || 0
        return sum + i.variants.reduce((vs, v) => vs + (v.stock || 0) * (v.cost || parentCost || 0), 0)
      }
      const branchStock = getStockForBranch(i) || 0
      const cost = i.itemType === 'ingredient' ? (i.averageCost || 0) : (parseFloat(i.cost) || 0)
      return sum + (branchStock * cost)
    }, 0)
    const totalUnits = itemsWithStock.reduce((sum, i) => sum + (getStockForBranch(i) || 0), 0)

    return {
      productsWithStock: itemsWithStock,
      lowStockItems,
      outOfStockItems,
      totalValue,
      totalCostValue,
      totalUnits
    }
  }, [filteredProducts, getStockForBranch])

  const { productsWithStock, lowStockItems, outOfStockItems, totalValue, totalCostValue, totalUnits } = statistics

  // Calcular productos con stock huérfano (pasando almacenes activos para detectar almacenes eliminados)
  // IMPORTANTE: No calcular si los almacenes aún no se han cargado para evitar falsos positivos
  const orphanStockProducts = React.useMemo(() => {
    if (!warehouses || warehouses.length === 0) return []
    return getOrphanStockProducts(products, warehouses)
  }, [products, warehouses])

  // Calcular total de stock huérfano (incluyendo stock en almacenes eliminados)
  const totalOrphanStock = React.useMemo(() => {
    return orphanStockProducts.reduce((sum, p) => sum + getOrphanStock(p, warehouses), 0)
  }, [orphanStockProducts, warehouses])

  // Calcular cuántos productos tienen stock en almacenes eliminados
  const productsWithDeletedWarehouseStock = React.useMemo(() => {
    return products.filter(p => {
      const deleted = getDeletedWarehouseStock(p, warehouses)
      return deleted.total > 0
    })
  }, [products, warehouses])

  // Obtener almacén por defecto
  const defaultWarehouse = React.useMemo(() => {
    return warehouses.find(w => w.isDefault) || warehouses[0] || null
  }, [warehouses])

  // Alias para usar stock filtrado por sucursal
  const getRealStock = getStockForBranch

  // Función para migrar todo el stock huérfano al almacén por defecto
  // También limpia referencias a almacenes eliminados
  const handleMigrateOrphanStock = async () => {
    if (!defaultWarehouse || orphanStockProducts.length === 0) return

    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    // Blindaje (Fase 1): solo el dueño, con confirmación y respaldo revertible.
    if (!isBusinessOwner) {
      toast.error('Solo el dueño del negocio puede reasignar stock')
      return
    }
    if (!window.confirm(`Vas a reasignar el stock SIN almacén al almacén "${defaultWarehouse.name}". Se creará un respaldo para poder revertir. ¿Continuar?`)) {
      return
    }

    setIsMigratingOrphanStock(true)

    try {
      const businessId = getBusinessId()

      // Respaldo revertible ANTES de tocar nada (botón "Revertir" en Inventario).
      try {
        await createStockBackup(businessId, buildStockBackupItems(orphanStockProducts), {
          userId: user?.uid || null,
          userName: user?.displayName || user?.email || null,
          totalChecked: orphanStockProducts.length,
        })
      } catch (e) {
        console.error('No se pudo crear el respaldo antes de migrar:', e)
      }
      let successCount = 0
      let errorCount = 0

      for (const product of orphanStockProducts) {
        try {
          // Pasar los almacenes activos para limpiar referencias a almacenes eliminados
          const updatedProduct = migrateOrphanStock(product, defaultWarehouse.id, warehouses)

          // Guardar en Firestore
          const result = await updateProduct(businessId, product.id, {
            warehouseStocks: updatedProduct.warehouseStocks
          })

          if (result.success) {
            successCount++
          } else {
            errorCount++
          }
        } catch (error) {
          console.error(`Error al migrar producto ${product.id}:`, error)
          errorCount++
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} producto(s) migrado(s) exitosamente al almacén "${defaultWarehouse.name}"`)
        loadProducts() // Recargar productos
        loadLatestStockBackup() // Mostrar el botón "Revertir"
      }

      if (errorCount > 0) {
        toast.error(`${errorCount} producto(s) no pudieron ser migrados`)
      }
    } catch (error) {
      console.error('Error al migrar stock huérfano:', error)
      toast.error('Error al migrar el stock')
    } finally {
      setIsMigratingOrphanStock(false)
    }
  }

  const getStockStatus = product => {
    const realStock = getRealStock(product)
    if (realStock === null) {
      return { status: 'Sin control', variant: 'default', icon: Package }
    }
    if (realStock === 0) {
      return { status: 'Agotado', variant: 'danger', icon: AlertTriangle }
    }
    // Stock mínimo por producto (default 3 si no está configurado).
    const minStock = Number.isFinite(Number(product?.minStock)) && Number(product?.minStock) >= 0
      ? Number(product.minStock)
      : 3
    if (realStock <= minStock) {
      return { status: 'Stock Bajo', variant: 'warning', icon: TrendingDown }
    }
    return { status: 'Normal', variant: 'success', icon: TrendingUp }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando inventario...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Control de Inventario</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona el stock de tus productos e ingredientes
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMassTransferModal(true)}
          >
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            Traslado Masivo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInventoryCountModal(true)}
          >
            <ClipboardCheck className="w-4 h-4 mr-2" />
            Recuento
          </Button>
          {isBusinessOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkCorrectionModal(true)}
            disabled={isDemoMode}
            title={isDemoMode ? 'No disponible en modo demo' : 'Verificar y corregir stock de todos los productos'}
          >
            <Wrench className="w-4 h-4 mr-2" />
            Verificar stock
          </Button>
          )}
          {/* Botón "Revertir" — solo visible si hay un backup activo (≤ 7 días). */}
          {latestStockBackup && !isDemoMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRevertModal(true)}
              className="text-amber-700 border-amber-300 hover:bg-amber-50"
              title={`Restaura el stock al estado previo a la verificación del ${latestStockBackup.createdAt?.toLocaleString?.('es-PE') || 'reciente'}`}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Revertir verificación
            </Button>
          )}
          {!hidePrivateData && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCountHistory(true)}
          >
            <History className="w-4 h-4 mr-2" />
            Historial
          </Button>
          )}
          {!hidePrivateData && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenExportModal}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Total Items
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
                  {products.length + ingredients.length}
                </p>
              </div>
              <Package className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />
            </div>
          </CardContent>
        </Card>

        {!hidePrivateData && (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Valor Venta</p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(totalValue)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    Costo: {formatCurrency(totalCostValue)}
                    <button
                      type="button"
                      onClick={handleRecalcCosts}
                      disabled={recalcCosts}
                      title="Recalcular el costo desde el historial de compras"
                      className="text-gray-300 hover:text-primary-600 disabled:opacity-60 transition-colors"
                    >
                      <RefreshCw className={`w-3 h-3 ${recalcCosts ? 'animate-spin' : ''}`} />
                    </button>
                  </p>
                </div>
                <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Stock Bajo</p>
                <p className="text-xl sm:text-2xl font-bold text-yellow-600 mt-1">
                  {lowStockItems.length}
                </p>
              </div>
              <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Agotados</p>
                <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1">
                  {outOfStockItems.length}
                </p>
              </div>
              <TrendingDown className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert for orphan stock - Stock sin asignar a almacén o en almacenes eliminados */}
      {orphanStockProducts.length > 0 && defaultWarehouse && (
        <Alert
          variant="warning"
          title={`${orphanStockProducts.length} producto(s) con stock sin asignar a almacén`}
        >
          <p className="text-sm mb-3">
            Tienes <strong>{totalOrphanStock} unidades</strong> de stock que no están asignadas a ningún almacén activo.
            {productsWithDeletedWarehouseStock.length > 0 && (
              <span className="block mt-1 text-amber-700">
                Incluye {productsWithDeletedWarehouseStock.length} producto(s) con stock en almacenes que fueron eliminados.
              </span>
            )}
            <span className="block mt-1">
              El stock no asignado no aparecerá disponible en el Punto de Venta.
            </span>
          </p>
          {isBusinessOwner && (
          <Button
            size="sm"
            onClick={handleMigrateOrphanStock}
            disabled={isMigratingOrphanStock}
          >
            {isMigratingOrphanStock ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Migrando...
              </>
            ) : (
              <>
                <Warehouse className="w-4 h-4 mr-2" />
                Asignar todo al almacén "{defaultWarehouse.name}"
              </>
            )}
          </Button>
          )}
        </Alert>
      )}

      {/* Alert for low/out of stock */}
      {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
        <Alert
          variant={outOfStockItems.length > 0 ? 'danger' : 'warning'}
          title={
            outOfStockItems.length > 0
              ? `${outOfStockItems.length} productos agotados`
              : `${lowStockItems.length} productos con stock bajo`
          }
        >
          <p className="text-sm">
            {outOfStockItems.length > 0
              ? 'Hay productos sin stock. Es urgente reabastecer para evitar ventas perdidas.'
              : 'Algunos productos tienen stock bajo. Considera reabastecer pronto.'}
          </p>
          <div className="inline-block mt-2">
            <Button variant="outline" size="sm" onClick={() => appNavigate('productos')}>
              Gestionar Productos
            </Button>
          </div>
        </Alert>
      )}

      {/* Tabs - Filtro por tipo */}
      {(
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => {
              console.log('🔘 [Inventory] Click: Todos')
              setFilterType('all')
            }}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterType === 'all'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Todos ({products.length + ingredients.length})
          </button>
          <button
            onClick={() => {
              console.log('🔘 [Inventory] Click: Productos')
              setFilterType('products')
            }}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterType === 'products'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Productos ({products.length})
          </button>
          <button
            onClick={() => {
              console.log('🔘 [Inventory] Click: Insumos')
              setFilterType('ingredients')
            }}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterType === 'ingredients'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Ingredientes ({ingredients.length})
          </button>
        </div>
      )}

      {/* Info de ayuda contextual */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-3">
          <p className="text-xs text-blue-800">
            <strong>Productos</strong> son los artículos que vendes. <strong>Ingredientes</strong> son la materia prima que consumen.
            Ve a <strong>{businessMode === 'restaurant' ? 'Recetas' : 'Composición'}</strong> para definir qué ingredientes consume cada producto.
          </p>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Fila 1: Búsqueda */}
            <div className="flex gap-2">
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm flex-1">
                <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar por código, nombre o categoría..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
                />
              </div>
              <Button
                onClick={handleScanBarcode}
                disabled={isScanning}
                size="sm"
                title="Escanear código de barras"
              >
                {isScanning ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ScanBarcode className="w-5 h-5" />
                )}
              </Button>
            </div>

            {/* Fila 2: Filtros */}
            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3 sm:flex-wrap">
              {/* Category Multi-Select Filter */}
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'categories' ? null : 'categories')}
                  className={`w-full flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-primary-400 transition-colors ${filterCategories.length > 0 ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
                >
                  <Tag className="w-4 h-4 text-gray-500" />
                  <span className="max-w-[150px] truncate">
                    {filterCategories.length === 0
                      ? 'Todas las categorías'
                      : filterCategories.length === 1
                        ? categories.find(c => c.id === filterCategories[0])?.name || 'Categoría'
                        : `${filterCategories.length} categorías`}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openDropdown === 'categories' ? 'rotate-180' : ''}`} />
                  {filterCategories.length > 0 && (
                    <X
                      className="w-4 h-4 text-gray-400 hover:text-gray-600"
                      onClick={(e) => { e.stopPropagation(); setFilterCategories([]); }}
                    />
                  )}
                </button>
                {openDropdown === 'categories' && (
                  <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {categories.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No hay categorías</div>
                    ) : (
                      categories.map(category => (
                        <label
                          key={category.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={filterCategories.includes(category.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterCategories([...filterCategories, category.id])
                              } else {
                                setFilterCategories(filterCategories.filter(id => id !== category.id))
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">{category.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Brand Multi-Select Filter (mismo estilo que categorías) */}
              {brands.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'brands' ? null : 'brands')}
                    className={`w-full flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-primary-400 transition-colors ${filterBrands.length > 0 ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
                  >
                    <Tag className="w-4 h-4 text-gray-500" />
                    <span className="max-w-[150px] truncate">
                      {filterBrands.length === 0
                        ? 'Todas las marcas'
                        : filterBrands.length === 1
                          ? (filterBrands[0] === 'sin-marca'
                              ? 'Sin marca'
                              : (brands.find(b => b.id === filterBrands[0])?.name || 'Marca'))
                          : `${filterBrands.length} marcas`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openDropdown === 'brands' ? 'rotate-180' : ''}`} />
                    {filterBrands.length > 0 && (
                      <X
                        className="w-4 h-4 text-gray-400 hover:text-gray-600"
                        onClick={(e) => { e.stopPropagation(); setFilterBrands([]); }}
                      />
                    )}
                  </button>
                  {openDropdown === 'brands' && (
                    <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {[...brands].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })).map(brand => (
                        <label
                          key={brand.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={filterBrands.includes(brand.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterBrands([...filterBrands, brand.id])
                              } else {
                                setFilterBrands(filterBrands.filter(id => id !== brand.id))
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">{brand.name}</span>
                        </label>
                      ))}
                      <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-t border-gray-100">
                        <input
                          type="checkbox"
                          checked={filterBrands.includes('sin-marca')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFilterBrands([...filterBrands, 'sin-marca'])
                            } else {
                              setFilterBrands(filterBrands.filter(id => id !== 'sin-marca'))
                            }
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-500 italic">Sin marca</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Status Multi-Select Filter */}
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'statuses' ? null : 'statuses')}
                  className={`w-full flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-primary-400 transition-colors ${filterStatuses.length > 0 ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
                >
                  <Activity className="w-4 h-4 text-gray-500" />
                  <span className="max-w-[150px] truncate">
                    {filterStatuses.length === 0
                      ? 'Todos los estados'
                      : filterStatuses.length === 1
                        ? { normal: 'Stock Normal', low: 'Stock Bajo', out: 'Agotados' }[filterStatuses[0]]
                        : `${filterStatuses.length} estados`}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openDropdown === 'statuses' ? 'rotate-180' : ''}`} />
                  {filterStatuses.length > 0 && (
                    <X
                      className="w-4 h-4 text-gray-400 hover:text-gray-600"
                      onClick={(e) => { e.stopPropagation(); setFilterStatuses([]); }}
                    />
                  )}
                </button>
                {openDropdown === 'statuses' && (
                  <div className="absolute z-50 mt-1 w-48 bg-white border border-gray-300 rounded-lg shadow-lg">
                    {[
                      { id: 'normal', name: 'Stock Normal' },
                      { id: 'low', name: 'Stock Bajo' },
                      { id: 'out', name: 'Agotados' }
                    ].map(status => (
                      <label
                        key={status.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={filterStatuses.includes(status.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFilterStatuses([...filterStatuses, status.id])
                            } else {
                              setFilterStatuses(filterStatuses.filter(id => id !== status.id))
                            }
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">{status.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Branch Filter (single select - stays the same) */}
              {branches.length > 0 && (
                <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm w-full sm:w-auto">
                  <Store className="w-4 h-4 text-gray-500" />
                  <select
                    value={filterBranch}
                    onChange={e => setFilterBranch(e.target.value)}
                    className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Todas las sucursales</option>
                    {hasMainBranchAccess && <option value="main">{companySettings?.mainBranchName || 'Sucursal Principal'}</option>}
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Warehouse Multi-Select Filter */}
              {filteredWarehouses.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'warehouses' ? null : 'warehouses')}
                    className={`w-full flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-primary-400 transition-colors ${filterWarehouses.length > 0 ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
                  >
                    <Warehouse className="w-4 h-4 text-gray-500" />
                    <span className="max-w-[150px] truncate">
                      {filterWarehouses.length === 0
                        ? 'Todos los almacenes'
                        : filterWarehouses.length === 1
                          ? filteredWarehouses.find(w => w.id === filterWarehouses[0])?.name || 'Almacén'
                          : `${filterWarehouses.length} almacenes`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openDropdown === 'warehouses' ? 'rotate-180' : ''}`} />
                    {filterWarehouses.length > 0 && (
                      <X
                        className="w-4 h-4 text-gray-400 hover:text-gray-600"
                        onClick={(e) => { e.stopPropagation(); setFilterWarehouses([]); }}
                      />
                    )}
                  </button>
                  {openDropdown === 'warehouses' && (
                    <div className="absolute z-50 mt-1 w-56 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredWarehouses.map(warehouse => (
                        <label
                          key={warehouse.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={filterWarehouses.includes(warehouse.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterWarehouses([...filterWarehouses, warehouse.id])
                              } else {
                                setFilterWarehouses(filterWarehouses.filter(id => id !== warehouse.id))
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">{warehouse.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Stock Tracking Filter */}
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm w-full sm:w-auto">
                <Package className="w-4 h-4 text-gray-500" />
                <select
                  value={filterStockTracking}
                  onChange={e => setFilterStockTracking(e.target.value)}
                  className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos</option>
                  <option value="tracked">Con control de stock</option>
                  <option value="untracked">Sin control de stock</option>
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {`${filterType === 'all' ? 'Items' : filterType === 'products' ? 'Productos' : 'Ingredientes'} en Inventario (${filteredProducts.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm || filterCategories.length > 0 || filterStatuses.length > 0
                  ? 'No se encontraron productos'
                  : 'No hay productos en inventario'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || filterCategories.length > 0 || filterStatuses.length > 0
                  ? 'Intenta con otros filtros de búsqueda'
                  : 'Ve a la página de Productos para agregar productos a tu catálogo'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden">
              {/* Vista de tarjetas para móvil */}
              <div className="lg:hidden divide-y divide-gray-100">
                {paginatedProducts.map(item => {
                  const stockStatus = getStockStatus(item)
                  const realStock = getRealStock(item)
                  const isProduct = item.itemType === 'product'
                  const isExpanded = expandedProduct === item.id
                  const hasWarehouseStocks = item.warehouseStocks && item.warehouseStocks.length > 0
                  const hasBatches = item.batches && item.batches.filter(b => b.quantity > 0).length > 0
                  const hasVariantsWithStock = item.hasVariants && item.variants?.length > 0
                  const hasIngredientWarehouseStocks = item.isIngredient && item.warehouseStocks && item.warehouseStocks.length > 0
                  const canExpand = ((warehouses.length > 0 || hasBatches || hasVariantsWithStock) && realStock !== null && isProduct) || hasIngredientWarehouseStocks

                  return (
                    <div key={`card-${item.itemType}-${item.id}`}>
                      <div
                        className={`px-4 py-3 transition-colors ${canExpand ? 'cursor-pointer active:bg-gray-100' : ''} ${isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                        onClick={() => {
                          if (canExpand) setExpandedProduct(isExpanded ? null : item.id)
                        }}
                      >
                        {/* Fila 1: Nombre + acciones */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {canExpand && (
                              isExpanded
                                ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                            <p className="text-sm font-medium line-clamp-2">{item.name}</p>
                          </div>
                          {warehouses.length >= 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const rect = e.currentTarget.getBoundingClientRect()
                                const menuHeight = 200
                                const spaceBelow = window.innerHeight - rect.bottom
                                const openUpward = spaceBelow < menuHeight
                                setMenuPosition({
                                  top: openUpward ? rect.top - 8 : rect.bottom + 8,
                                  right: window.innerWidth - rect.right,
                                  openUpward
                                })
                                setOpenMenuId(openMenuId === item.id ? null : item.id)
                              }}
                              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                              title="Acciones"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Fila 2: SKU + tipo + categoría */}
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500" style={canExpand ? { paddingLeft: '1.375rem' } : undefined}>
                          {(item.sku || item.code) && (
                            <span className="font-mono text-primary-600">{item.sku || item.code}</span>
                          )}
                          <Badge variant={isProduct ? 'default' : 'success'} className="text-xs">
                            {isProduct ? 'Prod.' : 'Ing.'}
                          </Badge>
                          {item.category && (
                            <span className="truncate">
                              {isProduct
                                ? getCategoryPath(productCategories, item.category) || item.category
                                : getIngredientCategoryName(ingredientCategories, item.category)
                              }
                            </span>
                          )}
                          {item.location && (
                            <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                              {item.location}
                            </span>
                          )}
                        </div>

                        {/* Fila 3: Stock + precio + valor + estado */}
                        <div className="flex items-center justify-between mt-2" style={canExpand ? { paddingLeft: '1.375rem' } : undefined}>
                          <div className="flex items-center gap-3">
                            {realStock === null ? (
                              <span className="text-xs text-gray-500">S/C</span>
                            ) : (
                              <span className={`font-bold text-sm ${realStock === 0 ? 'text-red-600' : realStock <= (item?.minStock ?? 3) ? 'text-yellow-600' : 'text-green-600'}`}>
                                {item.isIngredient || !Number.isInteger(realStock) ? Number(realStock).toFixed(2) : realStock} {getItemUnitLabel(item, 'uds').toLowerCase()}
                              </span>
                            )}
                            <span className="text-sm text-gray-700">{isProduct ? formatProductPrice(item) : formatCurrency(item.averageCost || 0)}</span>
                            {realStock !== null && (
                              <span className="text-sm font-semibold">{formatCurrency(isProduct && item.hasVariants ? item.variants?.reduce((sum, v) => sum + (Number(v.stock) || 0) * (Number(v.price) || 0), 0) || 0 : realStock * (isProduct ? (Number(item.price) || 0) : (item.averageCost || 0)))}</span>
                            )}
                          </div>
                          <Badge variant={stockStatus.variant} className="text-xs whitespace-nowrap">
                            {stockStatus.status === 'Sin control' ? 'S/C' : stockStatus.status === 'Stock Bajo' ? 'Bajo' : stockStatus.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Expandible: Variantes agrupadas por sucursal → almacén */}
                      {isExpanded && canExpand && hasVariantsWithStock && (
                        <div className="px-4 pb-3 bg-gray-50">
                          <div className="space-y-2">
                            {(() => {
                              // Construir mapa: warehouseId → [{ sku, label, stock }]
                              const warehouseVariantMap = {}
                              item.variants.forEach((variant, vIdx) => {
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

                              const mainWhs = filteredWarehouses.filter(w => !w.branchId)
                              const branchGroups = filteredWarehouses.filter(w => w.branchId).reduce((acc, w) => {
                                if (!acc[w.branchId]) acc[w.branchId] = []
                                acc[w.branchId].push(w)
                                return acc
                              }, {})

                              const renderWarehouse = (wh) => {
                                const variants = warehouseVariantMap[wh.id] || []
                                const total = variants.reduce((s, v) => s + v.stock, 0)
                                return (
                                  <div key={wh.id} className="bg-white rounded px-2 py-1.5">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <Warehouse className="w-3 h-3 text-gray-400" />
                                        <span className="text-xs text-gray-700">{wh.name}</span>
                                        {wh.isDefault && <span className="text-[10px] text-primary-500 font-medium bg-primary-50 px-1.5 py-0.5 rounded-full">Principal</span>}
                                      </div>
                                      <span className={`font-semibold text-xs ${total > (item?.minStock ?? 3) ? 'text-green-600' : total > 0 ? 'text-yellow-600' : 'text-red-600'}`}>{total}</span>
                                    </div>
                                    {variants.length > 0 && (
                                      <div className="mt-1 ml-4 space-y-0.5">
                                        {variants.map((v, idx) => (
                                          <div key={idx} className="flex items-center justify-between text-[10px] bg-purple-50/50 px-1.5 py-0.5 rounded">
                                            <div className="flex items-center gap-1">
                                              <span className="font-mono font-medium text-purple-600">{v.sku}</span>
                                              <span className="text-gray-500">{v.label}</span>
                                            </div>
                                            <span className="font-semibold text-gray-600">{v.stock}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              }

                              return (
                                <div className="space-y-2">
                                  {mainWhs.length > 0 && (
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                      {filterBranch === 'all' && (
                                        <div className="bg-primary-50 px-3 py-1.5 flex items-center gap-2 border-b border-gray-200">
                                          <Store className="w-3 h-3 text-primary-600" />
                                          <span className="text-xs font-medium text-primary-700">{companySettings?.mainBranchName || 'Sucursal Principal'}</span>
                                        </div>
                                      )}
                                      <div className="p-2 space-y-1">
                                        {mainWhs.map(renderWarehouse)}
                                      </div>
                                    </div>
                                  )}
                                  {Object.entries(branchGroups).map(([branchId, branchWhs]) => {
                                    const branch = branches.find(b => b.id === branchId)
                                    return (
                                      <div key={branchId} className="border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-primary-50 px-3 py-1.5 flex items-center gap-2 border-b border-gray-200">
                                          <Store className="w-3 h-3 text-primary-600" />
                                          <span className="text-xs font-medium text-primary-700">{branch?.name || 'Sucursal'}</span>
                                        </div>
                                        <div className="p-2 space-y-1">
                                          {branchWhs.map(renderWarehouse)}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Expandible: Stock por almacén/sucursal (productos sin variantes) */}
                      {isExpanded && canExpand && isProduct && !hasVariantsWithStock && (filteredWarehouses.length > 0 || hasBatches) && (
                        <div className="px-4 pb-3 bg-gray-50">
                          <div className="space-y-2">
                            {(() => {
                              const mainBranchWarehouses = filteredWarehouses.filter(w => !w.branchId)
                              const warehousesByBranch = filteredWarehouses
                                .filter(w => w.branchId)
                                .reduce((acc, warehouse) => {
                                  const branchId = warehouse.branchId
                                  if (!acc[branchId]) acc[branchId] = []
                                  acc[branchId].push(warehouse)
                                  return acc
                                }, {})

                              return (
                                <div className="space-y-2">
                                  {mainBranchWarehouses.length > 0 && (
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                      {filterBranch === 'all' && (
                                        <div className="bg-primary-50 px-3 py-1.5 flex items-center gap-2 border-b border-gray-200">
                                          <Store className="w-3 h-3 text-primary-600" />
                                          <span className="text-xs font-medium text-primary-700">{companySettings?.mainBranchName || 'Sucursal Principal'}</span>
                                          <span className="text-xs text-primary-600 ml-auto">
                                            {mainBranchWarehouses.reduce((sum, w) => {
                                              const ws = item.warehouseStocks?.find(ws => ws.warehouseId === w.id)
                                              return sum + (ws?.stock || 0)
                                            }, 0)} total
                                          </span>
                                        </div>
                                      )}
                                      <div className="p-2 space-y-1">
                                        {mainBranchWarehouses.map(warehouse => {
                                          const stock = hasWarehouseStocks
                                            ? (item.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)?.stock || 0)
                                            : 0
                                          const wBatches = (item.batches || []).filter(b => b.quantity > 0 && b.warehouseId === warehouse.id)
                                          return (
                                            <div key={warehouse.id} className="bg-white rounded px-2 py-1.5">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                  <Warehouse className="w-3 h-3 text-gray-400" />
                                                  <span className="text-xs text-gray-700">{warehouse.name}</span>
                                                  {warehouse.isDefault && <span className="text-[10px] text-primary-500 font-medium bg-primary-50 px-1.5 py-0.5 rounded-full">Principal</span>}
                                                </div>
                                                <span className={`font-semibold text-xs ${stock > (item?.minStock ?? 3) ? 'text-green-600' : stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                  {stock}
                                                </span>
                                              </div>
                                              {wBatches.length > 0 && (
                                                <div className="mt-1 ml-4 space-y-0.5">
                                                  {wBatches.map((batch, bIdx) => {
                                                    const bId = batch.lotNumber || batch.batchNumber || batch.id
                                                    const expD = (batch.expirationDate || batch.expiryDate)
                                                    const expDate = expD ? (expD.toDate ? expD.toDate() : new Date(expD)) : null
                                                    const expStr = expDate ? expDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
                                                    return (
                                                      <div key={bId + bIdx} className="flex items-center justify-between text-[10px] bg-amber-50/50 px-1.5 py-0.5 rounded">
                                                        <div className="flex items-center gap-1">
                                                          <FlaskConical className="w-2.5 h-2.5 text-amber-500" />
                                                          <span className="font-medium text-gray-600">{bId}</span>
                                                          {expStr && <span className="text-gray-400">{expStr}</span>}
                                                        </div>
                                                        <span className="font-semibold text-gray-600">{batch.quantity}</span>
                                                      </div>
                                                    )
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {Object.entries(warehousesByBranch).map(([branchId, branchWarehouses]) => {
                                    const branch = branches.find(b => b.id === branchId)
                                    const branchTotal = branchWarehouses.reduce((sum, w) => {
                                      const ws = item.warehouseStocks?.find(ws => ws.warehouseId === w.id)
                                      return sum + (ws?.stock || 0)
                                    }, 0)
                                    return (
                                      <div key={branchId} className="border border-gray-200 rounded-lg overflow-hidden">
                                        {filterBranch === 'all' && (
                                          <div className="bg-blue-50 px-3 py-1.5 flex items-center gap-2 border-b border-gray-200">
                                            <Store className="w-3 h-3 text-blue-600" />
                                            <span className="text-xs font-medium text-blue-700">{branch?.name || 'Sucursal'}</span>
                                            <span className="text-xs text-blue-600 ml-auto">{branchTotal} total</span>
                                          </div>
                                        )}
                                        <div className="p-2 space-y-1">
                                          {branchWarehouses.map(warehouse => {
                                            const stock = hasWarehouseStocks
                                              ? (item.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)?.stock || 0)
                                              : 0
                                            const wBatches = (item.batches || []).filter(b => b.quantity > 0 && b.warehouseId === warehouse.id)
                                            return (
                                              <div key={warehouse.id} className="bg-white rounded px-2 py-1.5">
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-1.5">
                                                    <Warehouse className="w-3 h-3 text-gray-400" />
                                                    <span className="text-xs text-gray-700">{warehouse.name}</span>
                                                    {warehouse.isDefault && <span className="text-[10px] text-primary-500 font-medium bg-primary-50 px-1.5 py-0.5 rounded-full">Principal</span>}
                                                  </div>
                                                  <span className={`font-semibold text-xs ${stock > (item?.minStock ?? 3) ? 'text-green-600' : stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                    {stock}
                                                  </span>
                                                </div>
                                                {wBatches.length > 0 && (
                                                  <div className="mt-1 ml-4 space-y-0.5">
                                                    {wBatches.map((batch, bIdx) => {
                                                      const bId = batch.lotNumber || batch.batchNumber || batch.id
                                                      const expD = (batch.expirationDate || batch.expiryDate)
                                                      const expDate = expD ? (expD.toDate ? expD.toDate() : new Date(expD)) : null
                                                      const expStr = expDate ? expDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
                                                      return (
                                                        <div key={bId + bIdx} className="flex items-center justify-between text-[10px] bg-amber-50/50 px-1.5 py-0.5 rounded">
                                                          <div className="flex items-center gap-1">
                                                            <FlaskConical className="w-2.5 h-2.5 text-amber-500" />
                                                            <span className="font-medium text-gray-600">{bId}</span>
                                                            {expStr && <span className="text-gray-400">{expStr}</span>}
                                                          </div>
                                                          <span className="font-semibold text-gray-600">{batch.quantity}</span>
                                                        </div>
                                                      )
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                                  {/* Lotes sin almacén asignado - legacy (mobile) */}
                                  {item.batches && item.batches.filter(b => b.quantity > 0 && !b.warehouseId).length > 0 && (
                                    <div className="mt-2 border-t border-gray-200 pt-2">
                                      <div className="flex items-center gap-1.5 mb-1.5 px-1">
                                        <FlaskConical className="w-3 h-3 text-amber-600" />
                                        <span className="text-xs font-medium text-amber-700">Lotes</span>
                                        <span className="text-xs text-amber-600 ml-auto">
                                          {item.batches.filter(b => b.quantity > 0 && !b.warehouseId).length} sin asignar
                                        </span>
                                      </div>
                                      <div className="space-y-1">
                                        {item.batches
                                          .filter(b => b.quantity > 0 && !b.warehouseId)
                                          .sort((a, b) => {
                                            const dA = (a.expirationDate || a.expiryDate)?.toDate?.() || new Date(a.expirationDate || a.expiryDate || '2099-12-31')
                                            const dB = (b.expirationDate || b.expiryDate)?.toDate?.() || new Date(b.expirationDate || b.expiryDate || '2099-12-31')
                                            return dA - dB
                                          })
                                          .map((batch, bIdx) => {
                                            const batchId = batch.lotNumber || batch.batchNumber || batch.id || `lote-${bIdx}`
                                            const expiryDate = batch.expirationDate || batch.expiryDate
                                            const expiryD = expiryDate ? (expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate)) : null
                                            const now = new Date()
                                            const daysUntilExpiry = expiryD ? Math.ceil((expiryD - now) / (1000 * 60 * 60 * 24)) : null
                                            const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0
                                            const isNearExpiry = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30
                                            const expiryStr = expiryD
                                              ? expiryD.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                              : 'Sin fecha'
                                            return (
                                              <div key={batchId + bIdx} className="flex items-center justify-between px-2 py-1.5 bg-white rounded">
                                                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                                  <div className="flex items-center gap-1.5">
                                                    <FlaskConical className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                                    <span className="text-xs text-gray-700 font-medium truncate">{batchId}</span>
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                      <CalendarClock className={`w-3 h-3 ${isExpired ? 'text-red-500' : isNearExpiry ? 'text-yellow-500' : 'text-gray-400'}`} />
                                                      <span className={`text-xs ${isExpired ? 'text-red-600 font-semibold' : isNearExpiry ? 'text-yellow-600' : 'text-gray-500'}`}>
                                                        {expiryStr}
                                                      </span>
                                                    </div>
                                                  </div>
                                                  {batch.warehouseId && (
                                                    <div className="flex items-center gap-1 ml-4">
                                                      <Warehouse className="w-2.5 h-2.5 text-gray-400" />
                                                      <span className="text-[10px] text-gray-500">
                                                        {allWarehouses.find(w => w.id === batch.warehouseId)?.name || 'Almacén'}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                                <span className={`font-semibold text-xs flex-shrink-0 ml-2 ${batch.quantity >= 4 ? 'text-green-600' : batch.quantity > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                  {batch.quantity}
                                                </span>
                                              </div>
                                            )
                                          })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Expandible: Stock por almacén para ingredientes (mobile) */}
                      {isExpanded && canExpand && item.isIngredient && item.warehouseStocks && item.warehouseStocks.length > 0 && (
                        <div className="px-4 pb-3 bg-gray-50">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
                              <Store className="w-3.5 h-3.5" />
                              <span className="font-medium">
                                {filterBranch === 'all' ? 'Stock por Sucursal y Almacén:' : 'Stock por Almacén:'}
                              </span>
                            </div>
                            {(() => {
                              const stockOf = (w) => (item.warehouseStocks.find(ws => ws.warehouseId === w.id)?.stock || 0)
                              const mainBranchWarehouses = filteredWarehouses.filter(w => !w.branchId)
                              const warehousesByBranch = filteredWarehouses.filter(w => w.branchId).reduce((acc, w) => {
                                if (!acc[w.branchId]) acc[w.branchId] = []
                                acc[w.branchId].push(w)
                                return acc
                              }, {})
                              const renderWarehouse = (warehouse) => {
                                const stock = stockOf(warehouse)
                                return (
                                  <div key={warehouse.id} className="flex items-center justify-between bg-white rounded px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                      <span className="text-sm text-gray-700">{warehouse.name}</span>
                                      {warehouse.isDefault && <span className="text-[10px] text-primary-500 font-medium bg-primary-50 px-1.5 py-0.5 rounded-full">Principal</span>}
                                    </div>
                                    <span className={`font-semibold text-sm ${stock > (item?.minStock ?? 3) ? 'text-green-600' : stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                      {stock.toFixed(2)} {getItemUnitLabel(item, 'uds').toLowerCase()}
                                    </span>
                                  </div>
                                )
                              }
                              return (
                                <div className="space-y-2">
                                  {mainBranchWarehouses.length > 0 && (
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                      {filterBranch === 'all' && (
                                        <div className="bg-primary-50 px-3 py-1.5 flex items-center gap-2 border-b border-gray-200">
                                          <Store className="w-3 h-3 text-primary-600" />
                                          <span className="text-xs font-medium text-primary-700">{companySettings?.mainBranchName || 'Sucursal Principal'}</span>
                                          <span className="text-xs text-primary-600 ml-auto">{mainBranchWarehouses.reduce((s, w) => s + stockOf(w), 0).toFixed(2)} {getItemUnitLabel(item, 'uds').toLowerCase()}</span>
                                        </div>
                                      )}
                                      <div className="p-2 space-y-1">{mainBranchWarehouses.map(renderWarehouse)}</div>
                                    </div>
                                  )}
                                  {Object.entries(warehousesByBranch).map(([branchId, branchWarehouses]) => {
                                    const branch = branches.find(b => b.id === branchId)
                                    const branchTotal = branchWarehouses.reduce((s, w) => s + stockOf(w), 0)
                                    return (
                                      <div key={branchId} className="border border-gray-200 rounded-lg overflow-hidden">
                                        {filterBranch === 'all' && (
                                          <div className="bg-blue-50 px-3 py-1.5 flex items-center gap-2 border-b border-gray-200">
                                            <Store className="w-3 h-3 text-blue-600" />
                                            <span className="text-xs font-medium text-blue-700">{branch?.name || 'Sucursal'}</span>
                                            <span className="text-xs text-blue-600 ml-auto">{branchTotal.toFixed(2)} {getItemUnitLabel(item, 'uds').toLowerCase()}</span>
                                          </div>
                                        )}
                                        <div className="p-2 space-y-1">{branchWarehouses.map(renderWarehouse)}</div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Tabla para desktop */}
              <Table className="hidden lg:table w-full lg:table-fixed [&_th]:px-2 [&_th]:lg:px-3 [&_td]:px-2 [&_td]:lg:px-3">
                <TableHeader>
                  <TableRow>
                    <TableHead className="lg:w-[7%]">
                      <button
                        onClick={() => handleSort('code')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por SKU"
                      >
                        SKU
                        {getSortIcon('code')}
                      </button>
                    </TableHead>
                    <TableHead className="lg:w-[32%]">
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por nombre"
                      >
                        Nombre
                        {getSortIcon('name')}
                      </button>
                    </TableHead>
                    <TableHead className="hidden sm:table-cell lg:w-[6%]">Tipo</TableHead>
                    <TableHead className="hidden md:table-cell lg:w-[10%]">
                      <button
                        onClick={() => handleSort('category')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por categoría"
                      >
                        Categoría
                        {getSortIcon('category')}
                      </button>
                    </TableHead>
                    <TableHead className="lg:w-[6%] text-right">
                      <button
                        onClick={() => handleSort('stock')}
                        className="flex items-center gap-1 justify-end hover:text-primary-600 transition-colors"
                        title="Ordenar por stock"
                      >
                        Stock
                        {getSortIcon('stock')}
                      </button>
                    </TableHead>
                    <TableHead className="lg:w-[8%] text-right">
                      <button
                        onClick={() => handleSort('price')}
                        className="flex items-center gap-1 justify-end hover:text-primary-600 transition-colors"
                        title="Ordenar por precio"
                      >
                        Precio
                        {getSortIcon('price')}
                      </button>
                    </TableHead>
                    <TableHead className="lg:w-[10%] text-right">Valor</TableHead>
                    <TableHead className="lg:w-[7%] text-right">Estado</TableHead>
                    {warehouses.length >= 1 && <TableHead className="lg:w-[3%]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map(item => {
                    const stockStatus = getStockStatus(item)
                    const isExpanded = expandedProduct === item.id
                    const hasWarehouseStocks = item.warehouseStocks && item.warehouseStocks.length > 0
                    const isProduct = item.itemType === 'product'

                    return (
                      <React.Fragment key={`${item.itemType}-${item.id}`}>
                      <TableRow>
                        <TableCell className="lg:w-[7%]">
                          <span className="font-mono text-xs break-all block">
                            {item.sku || item.code || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="lg:w-[32%] max-w-0 !whitespace-normal">
                          <div className="min-w-0">
                            <p className="font-medium text-sm line-clamp-2" title={item.name}>
                              {item.name}
                            </p>
                            {item.category && (
                              <p className="text-xs text-gray-500 md:hidden truncate">
                                {isProduct
                                  ? getCategoryPath(productCategories, item.category) || item.category
                                  : getIngredientCategoryName(ingredientCategories, item.category)
                                }
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell lg:w-[6%]">
                          <Badge variant={isProduct ? 'default' : 'success'} className="text-xs">
                            {isProduct ? 'Prod.' : 'Ing.'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell lg:w-[10%] max-w-0 !whitespace-normal">
                          <span
                            className="text-xs text-gray-600 line-clamp-2 block"
                            title={isProduct
                              ? getCategoryPath(productCategories, item.category) || 'Sin categoría'
                              : getIngredientCategoryName(ingredientCategories, item.category) || 'Sin categoría'
                            }
                          >
                            {isProduct
                              ? getCategoryPath(productCategories, item.category) || 'Sin categoría'
                              : getIngredientCategoryName(ingredientCategories, item.category) || 'Sin categoría'
                            }
                          </span>
                        </TableCell>
                        <TableCell className="text-right lg:w-[6%]">
                          {(() => {
                            const realStock = getRealStock(item)
                            const hasIngredientWarehouseStocks = item.isIngredient && item.warehouseStocks && item.warehouseStocks.length > 0
                            const canExpandTable = ((warehouses.length > 0 || (item.batches && item.batches.filter(b => b.quantity > 0).length > 0) || (item.hasVariants && item.variants?.length > 0)) && realStock !== null && isProduct) || hasIngredientWarehouseStocks
                            return (
                              <div className="flex items-center justify-end space-x-1">
                                {/* Botón de expandir/contraer si hay almacenes o lotes */}
                                {canExpandTable && (
                                  <button
                                    onClick={() => setExpandedProduct(isExpanded ? null : item.id)}
                                    className="p-0.5 hover:bg-gray-100 rounded transition-colors"
                                    title={isExpanded ? "Ocultar detalle" : "Ver por almacén"}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-3 h-3 text-gray-500" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 text-gray-500" />
                                    )}
                                  </button>
                                )}

                                {/* Stock total */}
                                <div>
                                  {realStock === null ? (
                                    <span className="text-xs text-gray-500">S/C</span>
                                  ) : (
                                    <span
                                      className={`font-bold text-sm ${
                                        realStock === 0
                                          ? 'text-red-600'
                                          : realStock <= (item?.minStock ?? 3)
                                          ? 'text-yellow-600'
                                          : 'text-green-600'
                                      }`}
                                    >
                                      {item.isIngredient || !Number.isInteger(realStock) ? Number(realStock).toFixed(2) : realStock}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-right lg:w-[8%]">
                          <span className="text-sm">
                            {isProduct ? formatProductPrice(item) : formatCurrency(item.averageCost || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right lg:w-[10%]">
                          {(() => {
                            const realStock = getRealStock(item)
                            const inventoryValue = isProduct && item.hasVariants
                              ? item.variants?.reduce((sum, v) => sum + (v.stock || 0) * (v.price || 0), 0) || 0
                              : realStock * (isProduct ? item.price : (item.averageCost || 0))
                            return realStock !== null ? (
                              <span className="font-semibold text-sm">
                                {formatCurrency(inventoryValue)}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500">-</span>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-right lg:w-[7%]">
                          <Badge variant={stockStatus.variant} className="text-xs whitespace-nowrap">
                            {stockStatus.status === 'Sin control' ? 'S/C' : stockStatus.status === 'Stock Bajo' ? 'Bajo' : stockStatus.status}
                          </Badge>
                        </TableCell>
                        {warehouses.length >= 1 && (
                          <TableCell className="lg:w-[4%]">
                            <div className="flex justify-end">
                              <button
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  const menuHeight = 200
                                  const spaceBelow = window.innerHeight - rect.bottom
                                  const openUpward = spaceBelow < menuHeight
                                  setMenuPosition({
                                    top: openUpward ? rect.top - 8 : rect.bottom + 8,
                                    right: window.innerWidth - rect.right,
                                    openUpward
                                  })
                                  setOpenMenuId(openMenuId === item.id ? null : item.id)
                                }}
                                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>

                      {/* Fila expandible: Variantes agrupadas por sucursal → almacén (desktop) */}
                      {isExpanded && item.hasVariants && item.variants?.length > 0 && getRealStock(item) !== null && isProduct && (
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={8} className="py-3">
                            <div className="pl-8 space-y-4">
                              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                                <Store className="w-4 h-4" />
                                <span className="font-medium">Stock por Sucursal y Almacén:</span>
                              </div>
                              {(() => {
                                const warehouseVariantMap = {}
                                item.variants.forEach((variant, vIdx) => {
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

                                const mainWhs = filteredWarehouses.filter(w => !w.branchId)
                                const branchGroups = filteredWarehouses.filter(w => w.branchId).reduce((acc, w) => {
                                  if (!acc[w.branchId]) acc[w.branchId] = []
                                  acc[w.branchId].push(w)
                                  return acc
                                }, {})

                                const renderWarehouse = (wh) => {
                                  const variants = warehouseVariantMap[wh.id] || []
                                  const total = variants.reduce((s, v) => s + v.stock, 0)
                                  return (
                                    <div key={wh.id} className="p-2 space-y-1">
                                      <div className="flex items-center justify-between px-2 py-1">
                                        <div className="flex items-center gap-2">
                                          <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                          <span className="text-sm text-gray-700">{wh.name}</span>
                                          {wh.isDefault && <span className="text-[10px] text-primary-500 font-medium bg-primary-50 px-1.5 py-0.5 rounded-full">Principal</span>}
                                        </div>
                                        <span className="text-xs font-semibold text-gray-600">{total} total</span>
                                      </div>
                                      {variants.length > 0 && (
                                        <div className="ml-4 space-y-0.5">
                                          {variants.map((v, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-white rounded px-2 py-1">
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-xs font-mono text-purple-600">{v.sku}</span>
                                                <span className="text-xs text-gray-500 truncate">{v.label}</span>
                                              </div>
                                              <span className={`font-semibold text-xs shrink-0 ml-2 ${v.stock > (item?.minStock ?? 3) ? 'text-green-600' : v.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>{v.stock}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                }

                                return (
                                  <div className="space-y-4">
                                    {mainWhs.length > 0 && (
                                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-primary-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                                          <Store className="w-4 h-4 text-primary-600" />
                                          <span className="font-medium text-primary-700">{companySettings?.mainBranchName || 'Sucursal Principal'}</span>
                                        </div>
                                        {mainWhs.map(renderWarehouse)}
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
                                          {branchWhs.map(renderWarehouse)}
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

                      {/* Fila expandible con detalle por sucursal y almacén - solo para productos sin variantes */}
                      {isExpanded && !item.hasVariants && (filteredWarehouses.length > 0 || (item.batches && item.batches.filter(b => b.quantity > 0).length > 0)) && getRealStock(item) !== null && isProduct && (
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={8} className="py-3">
                            <div className="pl-8 space-y-4">
                              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                                <Store className="w-4 h-4" />
                                <span className="font-medium">
                                  {filterBranch === 'all' ? 'Stock por Sucursal y Almacén:' : 'Stock por Almacén:'}
                                </span>
                              </div>

                              {/* Agrupar almacenes por sucursal */}
                              {(() => {
                                // Almacenes de la sucursal principal (sin branchId)
                                const mainBranchWarehouses = filteredWarehouses.filter(w => !w.branchId)
                                // Agrupar el resto por branchId
                                const warehousesByBranch = filteredWarehouses
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
                                        {filterBranch === 'all' && (
                                          <div className="bg-primary-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                                            <Store className="w-4 h-4 text-primary-600" />
                                            <span className="font-medium text-primary-700">{companySettings?.mainBranchName || 'Sucursal Principal'}</span>
                                            <Badge variant="default" className="text-xs ml-2">
                                              {mainBranchWarehouses.reduce((sum, w) => {
                                                const ws = item.warehouseStocks?.find(ws => ws.warehouseId === w.id)
                                                return sum + (ws?.stock || 0)
                                              }, 0)} total
                                            </Badge>
                                          </div>
                                        )}
                                        <div className="p-3 space-y-2">
                                          {mainBranchWarehouses.map(warehouse => {
                                            const warehouseStock = hasWarehouseStocks
                                              ? item.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)
                                              : null
                                            const stock = warehouseStock?.stock || 0
                                            const warehouseBatches = (item.batches || []).filter(b => b.quantity > 0 && b.warehouseId === warehouse.id)
                                            // Calcular stock sin lote asignado
                                            const batchesTotal = warehouseBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)
                                            const stockWithoutLot = Math.max(0, stock - batchesTotal)

                                            return (
                                              <div key={warehouse.id} className="bg-white border border-gray-100 rounded-lg p-2.5">
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center space-x-2">
                                                    <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                                    <span className="text-sm text-gray-700">{warehouse.name}</span>
                                                    {warehouse.isDefault && <span className="text-[10px] text-primary-500 font-medium bg-primary-50 px-1.5 py-0.5 rounded-full">Principal</span>}
                                                  </div>
                                                  <span className={`font-semibold text-sm ${stock > (item?.minStock ?? 3) ? 'text-green-600' : stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                    {stock}
                                                  </span>
                                                </div>
                                                {(warehouseBatches.length > 0 || (stockWithoutLot > 0 && item.batches?.length > 0)) && (
                                                  <div className="mt-1.5 pl-5 space-y-1">
                                                    {/* Stock sin lote asignado - solo si el producto usa lotes */}
                                                    {stockWithoutLot > 0 && item.batches?.length > 0 && (
                                                      <div className="flex items-center justify-between text-xs px-2 py-1 rounded bg-gray-50 border border-dashed border-gray-300">
                                                        <div className="flex items-center gap-1.5">
                                                          <Package className="w-3 h-3 text-gray-400" />
                                                          <span className="font-medium text-gray-500">Sin lote</span>
                                                          <span className="text-[10px] text-gray-400">(stock inicial)</span>
                                                        </div>
                                                        <span className={`font-semibold ${stockWithoutLot >= 4 ? 'text-green-600' : 'text-yellow-600'}`}>{stockWithoutLot}</span>
                                                      </div>
                                                    )}
                                                    {/* Lotes */}
                                                    {warehouseBatches.map((batch, bIdx) => {
                                                      const batchId = batch.lotNumber || batch.batchNumber || batch.id || `lote-${bIdx}`
                                                      const expiryDate = batch.expirationDate || batch.expiryDate
                                                      const expiryD = expiryDate ? (expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate)) : null
                                                      const daysUntilExpiry = expiryD ? Math.ceil((expiryD - new Date()) / (1000 * 60 * 60 * 24)) : null
                                                      const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0
                                                      const isNearExpiry = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30
                                                      const expiryStr = expiryD ? expiryD.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
                                                      return (
                                                        <div key={batchId + bIdx} className={`flex items-center justify-between text-xs px-2 py-1 rounded ${isExpired ? 'bg-red-50' : isNearExpiry ? 'bg-yellow-50' : 'bg-amber-50/50'}`}>
                                                          <div className="flex items-center gap-1.5">
                                                            <FlaskConical className="w-3 h-3 text-amber-500" />
                                                            <span className="font-medium text-gray-700">{batchId}</span>
                                                            {expiryStr && (
                                                              <span className={`${isExpired ? 'text-red-600' : isNearExpiry ? 'text-yellow-600' : 'text-gray-400'}`}>
                                                                {isExpired ? 'Vencido' : expiryStr}
                                                              </span>
                                                            )}
                                                          </div>
                                                          <span className={`font-semibold ${batch.quantity >= 4 ? 'text-green-600' : 'text-yellow-600'}`}>{batch.quantity}</span>
                                                        </div>
                                                      )
                                                    })}
                                                  </div>
                                                )}
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
                                        const ws = item.warehouseStocks?.find(ws => ws.warehouseId === w.id)
                                        return sum + (ws?.stock || 0)
                                      }, 0)

                                      return (
                                        <div key={branchId} className="border border-gray-200 rounded-lg overflow-hidden">
                                          {filterBranch === 'all' && (
                                            <div className="bg-blue-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                                              <Store className="w-4 h-4 text-blue-600" />
                                              <span className="font-medium text-blue-700">
                                                {branch?.name || 'Sucursal sin nombre'}
                                              </span>
                                              <Badge variant="secondary" className="text-xs ml-2">
                                                {branchTotal} total
                                              </Badge>
                                            </div>
                                          )}
                                          <div className="p-3 space-y-2">
                                            {branchWarehouses.map(warehouse => {
                                              const warehouseStock = hasWarehouseStocks
                                                ? item.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)
                                                : null
                                              const stock = warehouseStock?.stock || 0
                                              const warehouseBatches = (item.batches || []).filter(b => b.quantity > 0 && b.warehouseId === warehouse.id)
                                              // Calcular stock sin lote asignado
                                              const batchesTotal = warehouseBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)
                                              const stockWithoutLot = Math.max(0, stock - batchesTotal)

                                              return (
                                                <div key={warehouse.id} className="bg-white border border-gray-100 rounded-lg p-2.5">
                                                  <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-2">
                                                      <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                                      <span className="text-sm text-gray-700">{warehouse.name}</span>
                                                      {warehouse.isDefault && <span className="text-[10px] text-primary-500 font-medium bg-primary-50 px-1.5 py-0.5 rounded-full">Principal</span>}
                                                    </div>
                                                    <span className={`font-semibold text-sm ${stock > (item?.minStock ?? 3) ? 'text-green-600' : stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                      {stock}
                                                    </span>
                                                  </div>
                                                  {(warehouseBatches.length > 0 || (stockWithoutLot > 0 && item.batches?.length > 0)) && (
                                                    <div className="mt-1.5 pl-5 space-y-1">
                                                      {/* Stock sin lote asignado - solo si el producto usa lotes */}
                                                      {stockWithoutLot > 0 && item.batches?.length > 0 && (
                                                        <div className="flex items-center justify-between text-xs px-2 py-1 rounded bg-gray-50 border border-dashed border-gray-300">
                                                          <div className="flex items-center gap-1.5">
                                                            <Package className="w-3 h-3 text-gray-400" />
                                                            <span className="font-medium text-gray-500">Sin lote</span>
                                                            <span className="text-[10px] text-gray-400">(stock inicial)</span>
                                                          </div>
                                                          <span className={`font-semibold ${stockWithoutLot >= 4 ? 'text-green-600' : 'text-yellow-600'}`}>{stockWithoutLot}</span>
                                                        </div>
                                                      )}
                                                      {/* Lotes */}
                                                      {warehouseBatches.map((batch, bIdx) => {
                                                        const batchId = batch.lotNumber || batch.batchNumber || batch.id || `lote-${bIdx}`
                                                        const expiryDate = batch.expirationDate || batch.expiryDate
                                                        const expiryD = expiryDate ? (expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate)) : null
                                                        const daysUntilExpiry = expiryD ? Math.ceil((expiryD - new Date()) / (1000 * 60 * 60 * 24)) : null
                                                        const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0
                                                        const isNearExpiry = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30
                                                        const expiryStr = expiryD ? expiryD.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
                                                        return (
                                                          <div key={batchId + bIdx} className={`flex items-center justify-between text-xs px-2 py-1 rounded ${isExpired ? 'bg-red-50' : isNearExpiry ? 'bg-yellow-50' : 'bg-amber-50/50'}`}>
                                                            <div className="flex items-center gap-1.5">
                                                              <FlaskConical className="w-3 h-3 text-amber-500" />
                                                              <span className="font-medium text-gray-700">{batchId}</span>
                                                              {expiryStr && (
                                                                <span className={`${isExpired ? 'text-red-600' : isNearExpiry ? 'text-yellow-600' : 'text-gray-400'}`}>
                                                                  {isExpired ? 'Vencido' : expiryStr}
                                                                </span>
                                                              )}
                                                            </div>
                                                            <span className={`font-semibold ${batch.quantity >= 4 ? 'text-green-600' : 'text-yellow-600'}`}>{batch.quantity}</span>
                                                          </div>
                                                        )
                                                      })}
                                                    </div>
                                                  )}
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      )
                                    })}

                                  {/* Lotes sin almacén asignado (legacy) */}
                                  {item.batches && item.batches.filter(b => b.quantity > 0 && !b.warehouseId).length > 0 && (
                                    <div className="mt-3 border-t border-gray-200 pt-3">
                                      <div className="flex items-center gap-2 mb-2 px-1">
                                        <FlaskConical className="w-4 h-4 text-amber-600" />
                                        <span className="font-medium text-sm text-amber-700">Lotes</span>
                                        <Badge variant="warning" className="text-xs">
                                          {item.batches.filter(b => b.quantity > 0 && !b.warehouseId).length} sin asignar
                                        </Badge>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {item.batches
                                          .filter(b => b.quantity > 0 && !b.warehouseId)
                                          .sort((a, b) => {
                                            const dA = (a.expirationDate || a.expiryDate)?.toDate?.() || new Date(a.expirationDate || a.expiryDate || '2099-12-31')
                                            const dB = (b.expirationDate || b.expiryDate)?.toDate?.() || new Date(b.expirationDate || b.expiryDate || '2099-12-31')
                                            return dA - dB
                                          })
                                          .map((batch, bIdx) => {
                                            const batchId = batch.lotNumber || batch.batchNumber || batch.id || `lote-${bIdx}`
                                            const expiryDate = batch.expirationDate || batch.expiryDate
                                            const expiryD = expiryDate ? (expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate)) : null
                                            const now = new Date()
                                            const daysUntilExpiry = expiryD ? Math.ceil((expiryD - now) / (1000 * 60 * 60 * 24)) : null
                                            const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0
                                            const isNearExpiry = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30
                                            const expiryStr = expiryD
                                              ? expiryD.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                              : 'Sin fecha'
                                            return (
                                              <div
                                                key={batchId + bIdx}
                                                className={`flex items-center justify-between p-2.5 border rounded-lg ${
                                                  isExpired ? 'bg-red-50 border-red-200' : isNearExpiry ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'
                                                }`}
                                              >
                                                <div className="flex flex-col gap-0.5">
                                                  <div className="flex items-center gap-1.5">
                                                    <FlaskConical className="w-3.5 h-3.5 text-amber-500" />
                                                    <span className="text-sm font-medium text-gray-800">{batchId}</span>
                                                  </div>
                                                  <div className="flex items-center gap-1 ml-5">
                                                    <CalendarClock className={`w-3 h-3 ${isExpired ? 'text-red-500' : isNearExpiry ? 'text-yellow-500' : 'text-gray-400'}`} />
                                                    <span className={`text-xs ${isExpired ? 'text-red-600 font-semibold' : isNearExpiry ? 'text-yellow-600' : 'text-gray-500'}`}>
                                                      {isExpired ? 'Vencido' : isNearExpiry ? `Vence: ${expiryStr} (${daysUntilExpiry}d)` : expiryStr}
                                                    </span>
                                                  </div>
                                                  {batch.warehouseId && (
                                                    <div className="flex items-center gap-1 ml-5">
                                                      <Warehouse className="w-3 h-3 text-gray-400" />
                                                      <span className="text-xs text-gray-500">
                                                        {allWarehouses.find(w => w.id === batch.warehouseId)?.name || 'Almacén'}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="text-right">
                                                  <span className={`font-bold text-lg ${batch.quantity >= 4 ? 'text-green-600' : batch.quantity > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                    {batch.quantity}
                                                  </span>
                                                  <p className="text-xs text-gray-400">{getItemUnitLabel(item, 'unidades').toLowerCase()}</p>
                                                </div>
                                              </div>
                                            )
                                          })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                              })()}

                              {!hasWarehouseStocks && (
                                <p className="text-xs text-gray-500 mt-2">
                                  Stock no distribuido por almacenes
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Fila expandible para ingredientes - Stock por almacén */}
                      {isExpanded && item.isIngredient && item.warehouseStocks && item.warehouseStocks.length > 0 && (
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={8} className="py-3">
                            <div className="pl-8 space-y-2">
                              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                                <Store className="w-4 h-4" />
                                <span className="font-medium">
                                  {filterBranch === 'all' ? 'Stock por Sucursal y Almacén:' : 'Stock por Almacén:'}
                                </span>
                              </div>
                              {(() => {
                                const stockOf = (w) => (item.warehouseStocks.find(ws => ws.warehouseId === w.id)?.stock || 0)
                                const mainBranchWarehouses = filteredWarehouses.filter(w => !w.branchId)
                                const warehousesByBranch = filteredWarehouses.filter(w => w.branchId).reduce((acc, w) => {
                                  if (!acc[w.branchId]) acc[w.branchId] = []
                                  acc[w.branchId].push(w)
                                  return acc
                                }, {})
                                const renderWarehouse = (warehouse) => {
                                  const stock = stockOf(warehouse)
                                  return (
                                    <div key={warehouse.id} className="bg-white border border-gray-100 rounded-lg p-2.5">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                          <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                          <span className="text-sm text-gray-700">{warehouse.name}</span>
                                          {warehouse.isDefault && <span className="text-[10px] text-primary-500 font-medium bg-primary-50 px-1.5 py-0.5 rounded-full">Principal</span>}
                                        </div>
                                        <span className={`font-semibold text-sm ${stock > (item?.minStock ?? 3) ? 'text-green-600' : stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                          {stock.toFixed(2)} {getItemUnitLabel(item, 'uds').toLowerCase()}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                }
                                return (
                                  <div className="space-y-2">
                                    {mainBranchWarehouses.length > 0 && (
                                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        {filterBranch === 'all' && (
                                          <div className="bg-primary-50 px-3 py-1.5 flex items-center gap-2 border-b border-gray-200">
                                            <Store className="w-3 h-3 text-primary-600" />
                                            <span className="text-xs font-medium text-primary-700">{companySettings?.mainBranchName || 'Sucursal Principal'}</span>
                                            <span className="text-xs text-primary-600 ml-auto">{mainBranchWarehouses.reduce((s, w) => s + stockOf(w), 0).toFixed(2)} {getItemUnitLabel(item, 'uds').toLowerCase()}</span>
                                          </div>
                                        )}
                                        <div className="p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                          {mainBranchWarehouses.map(renderWarehouse)}
                                        </div>
                                      </div>
                                    )}
                                    {Object.entries(warehousesByBranch).map(([branchId, branchWarehouses]) => {
                                      const branch = branches.find(b => b.id === branchId)
                                      const branchTotal = branchWarehouses.reduce((s, w) => s + stockOf(w), 0)
                                      return (
                                        <div key={branchId} className="border border-gray-200 rounded-lg overflow-hidden">
                                          {filterBranch === 'all' && (
                                            <div className="bg-blue-50 px-3 py-1.5 flex items-center gap-2 border-b border-gray-200">
                                              <Store className="w-3 h-3 text-blue-600" />
                                              <span className="text-xs font-medium text-blue-700">{branch?.name || 'Sucursal'}</span>
                                              <span className="text-xs text-blue-600 ml-auto">{branchTotal.toFixed(2)} {getItemUnitLabel(item, 'uds').toLowerCase()}</span>
                                            </div>
                                          )}
                                          <div className="p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                            {branchWarehouses.map(renderWarehouse)}
                                          </div>
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
                    </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>

              {/* Menú de acciones flotante */}
              {openMenuId && (() => {
                const menuItem = [...products, ...ingredients.map(ing => ({ ...ing, isIngredient: true }))].find(p => p.id === openMenuId)
                if (!menuItem) return null
                const noStock = getRealStock(menuItem) === null || getRealStock(menuItem) === 0
                return (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                    <div
                      className="fixed w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                      style={{
                        top: `${menuPosition.top}px`,
                        right: `${menuPosition.right}px`,
                        transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                      }}
                    >
                      {warehouses.length > 1 && (
                        <button
                          onClick={() => { openTransferModal(menuItem); setOpenMenuId(null) }}
                          disabled={noStock}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                          Transferir
                        </button>
                      )}
                      <button
                        onClick={() => { openProductionModal(menuItem); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Cog className="w-4 h-4 text-emerald-600" />
                        Producir
                      </button>
                      <button
                        onClick={() => { openDamageModal(menuItem); setOpenMenuId(null) }}
                        disabled={noStock}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {businessMode === 'logistics' ? (
                          <PackageMinus className="w-4 h-4 text-blue-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        )}
                        {businessMode === 'logistics' ? 'Registrar salida' : 'Registrar merma'}
                      </button>
                      <button
                        onClick={() => { openHistoryModal(menuItem); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <History className="w-4 h-4 text-purple-600" />
                        Ver historial
                      </button>
                    </div>
                  </>
                )
              })()}

              {/* Controles de paginación */}
              {totalFilteredProducts > 0 && (
                <div className="px-4 lg:px-6 py-3 lg:py-4 border-t border-gray-200">
                  <div className="flex items-center justify-between gap-2">
                    {/* Info de productos mostrados */}
                    <div className="text-xs lg:text-sm text-gray-600">
                      <span className="font-medium">{startIndex + 1}</span>-<span className="font-medium">{Math.min(endIndex, totalFilteredProducts)}</span>
                      <span className="hidden sm:inline"> de <span className="font-medium">{totalFilteredProducts}</span></span>
                    </div>

                    {/* Controles de paginación */}
                    <div className="flex items-center gap-1 lg:gap-2">
                      {/* Selector de items por página */}
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value))
                          setCurrentPage(1)
                        }}
                        className="px-2 lg:px-3 py-1.5 border border-gray-300 rounded-lg text-xs lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                      </select>

                      {/* Botones de navegación */}
                      <div className="flex items-center gap-0.5 lg:gap-1">
                        <button
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                          className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Primera"
                        >
                          <ChevronsLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Anterior"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        {/* Números de página */}
                        <div className="flex items-center gap-0.5 lg:gap-1">
                          {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
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
                                className={`w-8 h-8 text-xs lg:text-sm rounded-lg ${
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
                          className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Siguiente"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                          className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Última"
                        >
                          <ChevronsRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Info */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen del Inventario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Total Items</p>
              <p className="text-2xl font-bold text-gray-900">
                {products.length + ingredients.length}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Con Control de Stock</p>
              <p className="text-2xl font-bold text-gray-900">{productsWithStock.length}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Unidades Totales</p>
              <p className="text-2xl font-bold text-gray-900">{totalUnits}</p>
            </div>
            {!hidePrivateData && (
              <>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-600 mb-1">Valor Venta Inventario</p>
                  <p className="text-xl font-bold text-primary-600">
                    {formatCurrency(totalValue)}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-600 mb-1">Valor Costo Inventario</p>
                  <p className="text-xl font-bold text-green-700">
                    {formatCurrency(totalCostValue)}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal de Transferencia */}
      <Modal
        isOpen={showTransferModal}
        onClose={closeTransferModal}
        title="Transferir Stock entre Almacenes"
        size="md"
      >
        <div className="space-y-4">
          {transferProduct && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-gray-600">Producto</p>
              <p className="font-semibold text-gray-900">{transferProduct.name}</p>
              <p className="text-sm text-gray-500">Código: {transferProduct.code}</p>
            </div>
          )}

          {/* Indicador de transferencia entre sucursales */}
          {(() => {
            const fromWarehouse = allWarehouses.find(w => w.id === transferData.fromWarehouse)
            const toWarehouse = allWarehouses.find(w => w.id === transferData.toWarehouse)
            const isCrossBranch = fromWarehouse && toWarehouse &&
              (fromWarehouse.branchId || null) !== (toWarehouse.branchId || null)

            if (isCrossBranch) {
              const fromBranch = fromWarehouse.branchId
                ? branches.find(b => b.id === fromWarehouse.branchId)?.name
                : (companySettings?.mainBranchName || 'Sucursal Principal')
              const toBranch = toWarehouse.branchId
                ? branches.find(b => b.id === toWarehouse.branchId)?.name
                : (companySettings?.mainBranchName || 'Sucursal Principal')

              return (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                  <Store className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-amber-700">
                    Transferencia entre sucursales: <strong>{fromBranch}</strong> → <strong>{toBranch}</strong>
                  </span>
                </div>
              )
            }
            return null
          })()}

          {/* 1. Almacén de Origen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Almacén de Origen <span className="text-red-500">*</span>
            </label>
            <select
              value={transferData.fromWarehouse}
              onChange={(e) => setTransferData({ ...transferData, fromWarehouse: e.target.value, selectedVariantSku: '' })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Selecciona almacén origen</option>
              {allWarehouses.filter(w => w.isActive && !w.branchId).length > 0 && (
                <optgroup label={`📍 ${companySettings?.mainBranchName || 'Sucursal Principal'}`}>
                  {allWarehouses.filter(w => w.isActive && !w.branchId).map(warehouse => {
                    // Para variantes: sumar stock de todas las variantes en este almacén
                    let stock = 0
                    if (transferProduct?.hasVariants && transferProduct.variants?.length > 0) {
                      stock = transferProduct.variants.reduce((sum, v) => {
                        const ws = (v.warehouseStocks || []).find(ws => ws.warehouseId === warehouse.id)
                        return sum + (ws?.stock || 0)
                      }, 0)
                    } else {
                      const ws = transferProduct?.warehouseStocks?.find(ws => ws.warehouseId === warehouse.id)
                      stock = ws?.stock || 0
                    }
                    return (
                      <option key={warehouse.id} value={warehouse.id} disabled={stock === 0}>
                        {warehouse.name} - Stock: {stock}
                      </option>
                    )
                  })}
                </optgroup>
              )}
              {branches.map(branch => {
                const branchWarehouses = allWarehouses.filter(w => w.isActive && w.branchId === branch.id)
                if (branchWarehouses.length === 0) return null
                return (
                  <optgroup key={branch.id} label={`📍 ${branch.name}`}>
                    {branchWarehouses.map(warehouse => {
                      let stock = 0
                      if (transferProduct?.hasVariants && transferProduct.variants?.length > 0) {
                        stock = transferProduct.variants.reduce((sum, v) => {
                          const ws = (v.warehouseStocks || []).find(ws => ws.warehouseId === warehouse.id)
                          return sum + (ws?.stock || 0)
                        }, 0)
                      } else {
                        const ws = transferProduct?.warehouseStocks?.find(ws => ws.warehouseId === warehouse.id)
                        stock = ws?.stock || 0
                      }
                      return (
                        <option key={warehouse.id} value={warehouse.id} disabled={stock === 0}>
                          {warehouse.name} - Stock: {stock}
                        </option>
                      )
                    })}
                  </optgroup>
                )
              })}
            </select>
          </div>

          {/* 2. Selector de variante (solo después de elegir almacén origen) */}
          {transferProduct?.hasVariants && transferProduct.variants?.length > 0 && transferData.fromWarehouse && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Variante <span className="text-red-500">*</span>
              </label>
              <select
                value={transferData.selectedVariantSku}
                onChange={(e) => setTransferData({ ...transferData, selectedVariantSku: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Selecciona variante</option>
                {transferProduct.variants.map(v => {
                  const label = Object.values(v.attributes || {}).join(' / ')
                  const wsStock = (v.warehouseStocks || []).find(ws => ws.warehouseId === transferData.fromWarehouse)?.stock || 0
                  return wsStock > 0 ? (
                    <option key={v.sku} value={v.sku}>
                      {v.sku} - {label} (Stock: {wsStock})
                    </option>
                  ) : null
                })}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Almacén de Destino <span className="text-red-500">*</span>
            </label>
            <select
              value={transferData.toWarehouse}
              onChange={(e) => setTransferData({ ...transferData, toWarehouse: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Selecciona almacén destino</option>
              {/* Almacenes de Sucursal Principal */}
              {allWarehouses.filter(w => w.isActive && !w.branchId && w.id !== transferData.fromWarehouse).length > 0 && (
                <optgroup label={`📍 ${companySettings?.mainBranchName || 'Sucursal Principal'}`}>
                  {allWarehouses.filter(w => w.isActive && !w.branchId && w.id !== transferData.fromWarehouse).map(warehouse => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {/* Almacenes agrupados por sucursal */}
              {branches.map(branch => {
                const branchWarehouses = allWarehouses.filter(w => w.isActive && w.branchId === branch.id && w.id !== transferData.fromWarehouse)
                if (branchWarehouses.length === 0) return null
                return (
                  <optgroup key={branch.id} label={`📍 ${branch.name}`}>
                    {branchWarehouses.map(warehouse => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </div>

          {/* Selección de Lote (si el producto tiene lotes en el almacén origen) */}
          {transferProduct?.batches?.filter(b => b.quantity > 0 && (!b.warehouseId || b.warehouseId === transferData.fromWarehouse)).length > 0 && (() => {
            const warehouseBatches = transferProduct.batches.filter(b => b.quantity > 0 && (!b.warehouseId || b.warehouseId === transferData.fromWarehouse))
            const batchesTotal = warehouseBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)
            const warehouseStock = transferProduct.warehouseStocks?.find(ws => ws.warehouseId === transferData.fromWarehouse)?.stock || 0
            const stockWithoutLot = Math.max(0, warehouseStock - batchesTotal)

            return (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lote <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {/* Opción Sin lote */}
                {stockWithoutLot > 0 && (
                  <button
                    type="button"
                    onClick={() => setTransferData({ ...transferData, selectedBatch: '__NO_LOT__', quantity: '' })}
                    className={`w-full p-3 border-2 rounded-lg text-left transition-all ${
                      transferData.selectedBatch === '__NO_LOT__'
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-700">Sin lote</p>
                        <p className="text-xs text-gray-500">Stock inicial sin lote asignado</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-amber-600">{stockWithoutLot}</p>
                        <p className="text-xs text-gray-400">disponibles</p>
                      </div>
                    </div>
                  </button>
                )}
                {/* Lotes */}
                {warehouseBatches
                  .sort((a, b) => {
                    const dA = (a.expirationDate || a.expiryDate)?.toDate?.() || new Date(a.expirationDate || a.expiryDate || '2099-12-31')
                    const dB = (b.expirationDate || b.expiryDate)?.toDate?.() || new Date(b.expirationDate || b.expiryDate || '2099-12-31')
                    return dA - dB
                  })
                  .map((batch, idx) => {
                    const batchId = batch.lotNumber || batch.batchNumber || batch.id
                    const expiryDate = batch.expirationDate || batch.expiryDate
                    const expiryStr = expiryDate
                      ? (expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate)).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      : 'Sin fecha'
                    const isSelected = transferData.selectedBatch === batchId
                    return (
                      <button
                        key={batchId + idx}
                        type="button"
                        onClick={() => setTransferData({ ...transferData, selectedBatch: batchId, quantity: '' })}
                        className={`w-full p-3 border-2 rounded-lg text-left transition-all ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{batchId}</p>
                            <p className="text-xs text-gray-500">Vence: {expiryStr}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-primary-600">{batch.quantity}</p>
                            <p className="text-xs text-gray-400">disponibles</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
              </div>
            </div>
          )})()}

          {/* Selección de números de serie */}
          {transferProduct?.trackSerials && transferData.fromWarehouse && (() => {
            const availableSerials = (transferProduct.serials || []).filter(s =>
              s.status === 'available' && (!s.warehouseId || s.warehouseId === transferData.fromWarehouse)
            )
            if (availableSerials.length === 0) return null
            return (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Números de Serie a Transferir <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg max-h-48 overflow-y-auto">
                  {availableSerials.map((s) => {
                    const isSelected = (transferData.selectedSerials || []).includes(s.serialNumber)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          const current = transferData.selectedSerials || []
                          const newSelected = isSelected
                            ? current.filter(sn => sn !== s.serialNumber)
                            : [...current, s.serialNumber]
                          setTransferData({ ...transferData, selectedSerials: newSelected, quantity: newSelected.length || '' })
                        }}
                        className={`px-3 py-1.5 text-sm rounded-lg border-2 transition-colors ${
                          isSelected
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'
                        }`}
                      >
                        {s.serialNumber}
                      </button>
                    )
                  })}
                </div>
                {(transferData.selectedSerials || []).length > 0 && (
                  <p className="text-xs text-amber-700 mt-1">{transferData.selectedSerials.length} serie(s) seleccionada(s)</p>
                )}
              </div>
            )
          })()}

          <Input
            label="Cantidad a Transferir"
            type="number"
            required
            min="1"
            max={(() => {
              if (transferData.selectedBatch === '__NO_LOT__') {
                // Stock sin lote = total del almacén - suma de lotes
                const warehouseStock = transferProduct?.warehouseStocks?.find(ws => ws.warehouseId === transferData.fromWarehouse)?.stock || 0
                const batchesInWarehouse = (transferProduct?.batches || []).filter(b => b.quantity > 0 && (!b.warehouseId || b.warehouseId === transferData.fromWarehouse))
                const batchesTotal = batchesInWarehouse.reduce((sum, b) => sum + (b.quantity || 0), 0)
                return Math.max(0, warehouseStock - batchesTotal)
              }
              if (transferProduct?.batches?.length > 0 && transferData.selectedBatch) {
                const batch = transferProduct.batches.find(b => (b.lotNumber || b.batchNumber || b.id) === transferData.selectedBatch)
                return batch?.quantity || 0
              }
              return transferProduct?.warehouseStocks?.find(ws => ws.warehouseId === transferData.fromWarehouse)?.stock || 0
            })()}
            value={transferData.quantity}
            onChange={(e) => setTransferData({ ...transferData, quantity: e.target.value })}
            placeholder="Cantidad"
          />

          {transferData.fromWarehouse && (
            <div className="text-sm text-gray-600">
              Stock disponible{transferData.selectedBatch === '__NO_LOT__' ? ' (Sin lote)' : transferData.selectedBatch ? ` (Lote ${transferData.selectedBatch})` : ''}: {' '}
              <span className="font-semibold">
                {(() => {
                  if (transferData.selectedBatch === '__NO_LOT__') {
                    // Stock sin lote = total del almacén - suma de lotes
                    const warehouseStock = transferProduct?.warehouseStocks?.find(ws => ws.warehouseId === transferData.fromWarehouse)?.stock || 0
                    const batchesInWarehouse = (transferProduct?.batches || []).filter(b => b.quantity > 0 && (!b.warehouseId || b.warehouseId === transferData.fromWarehouse))
                    const batchesTotal = batchesInWarehouse.reduce((sum, b) => sum + (b.quantity || 0), 0)
                    return Math.max(0, warehouseStock - batchesTotal)
                  }
                  if (transferProduct?.batches?.length > 0 && transferData.selectedBatch) {
                    const batch = transferProduct.batches.find(b => (b.lotNumber || b.batchNumber || b.id) === transferData.selectedBatch)
                    return batch?.quantity || 0
                  }
                  return transferProduct?.warehouseStocks?.find(
                    ws => ws.warehouseId === transferData.fromWarehouse
                  )?.stock || 0
                })()}
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notas (Opcional)
            </label>
            <textarea
              value={transferData.notes}
              onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
              placeholder="Motivo de la transferencia..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={closeTransferModal}
              disabled={isTransferring}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={isTransferring}
            >
              {isTransferring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Transfiriendo...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Transferir
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Merma/Daños (o Salida Simple en modo logística) */}
      <Modal
        isOpen={showDamageModal}
        onClose={closeDamageModal}
        title={businessMode === 'logistics' ? 'Registrar Salida de Almacén' : 'Registrar Merma o Daño'}
        size="md"
      >
        <div className="space-y-4">
          {damageProduct && (
            <div className={`p-4 rounded-lg border ${
              businessMode === 'logistics'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <p className="text-sm text-gray-600">Producto</p>
              <p className="font-semibold text-gray-900">{damageProduct.name}</p>
              <p className="text-sm text-gray-500">Código: {damageProduct.code}</p>
            </div>
          )}

          <Select
            label="Almacén"
            required
            value={damageData.warehouseId}
            onChange={(e) => setDamageData({ ...damageData, warehouseId: e.target.value })}
          >
            <option value="">Seleccionar almacén</option>
            {warehouses
              .filter((w) => w.isActive)
              .map((warehouse) => {
                const warehouseStock = damageProduct?.warehouseStocks?.find(
                  (ws) => ws.warehouseId === warehouse.id
                )
                const stock = warehouseStock?.stock || 0
                return (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} (Stock: {stock})
                  </option>
                )
              })}
          </Select>

          {/* Selector de variante (si el producto tiene variantes) */}
          {damageProduct?.hasVariants && damageProduct.variants?.length > 0 && (
            <Select
              label="Variante"
              required
              value={damageData.selectedVariantSku}
              onChange={(e) => setDamageData({ ...damageData, selectedVariantSku: e.target.value })}
            >
              <option value="">Seleccionar variante</option>
              {damageProduct.variants.map((variant) => {
                const variantWS = variant.warehouseStocks?.find(ws => ws.warehouseId === damageData.warehouseId)
                const stock = variantWS?.stock || 0
                const attrsLabel = Object.values(variant.attributes || {}).join(' / ')
                return (
                  <option key={variant.sku} value={variant.sku}>
                    {attrsLabel || variant.sku} (Stock: {stock})
                  </option>
                )
              })}
            </Select>
          )}

          <Select
            label="Motivo"
            required
            value={damageData.reason}
            onChange={(e) => setDamageData({ ...damageData, reason: e.target.value })}
          >
            {businessMode === 'logistics' ? (
              <>
                <option value="office_use">Uso en oficina</option>
                <option value="employee_delivery">Entrega a trabajador</option>
                <option value="internal_consumption">Consumo interno</option>
                <option value="project_use">Uso en proyecto/obra</option>
                <option value="other">Otro</option>
              </>
            ) : (
              <>
                <option value="damaged">Producto dañado</option>
                <option value="expired">Producto expirado</option>
                <option value="lost">Pérdida/Extravío</option>
                <option value="theft">Robo</option>
                <option value="other">Otro</option>
              </>
            )}
          </Select>

          {/* Selección de series o cantidad */}
          {damageProduct?.trackSerials && damageData.warehouseId ? (() => {
            const availableSerials = (damageProduct.serials || []).filter(s =>
              s.status === 'available' && (!s.warehouseId || s.warehouseId === damageData.warehouseId)
            )
            if (availableSerials.length === 0) return (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                No hay series disponibles en este almacén.
              </div>
            )
            const isLogistics = businessMode === 'logistics'
            const selectedBg = isLogistics ? 'bg-blue-600 border-blue-600' : 'bg-red-600 border-red-600'
            const hoverBorder = isLogistics ? 'hover:border-blue-400' : 'hover:border-red-400'
            const countColor = isLogistics ? 'text-blue-600' : 'text-red-600'
            return (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isLogistics ? 'Seleccionar series a retirar' : 'Seleccionar series afectadas'} <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg max-h-48 overflow-y-auto">
                  {availableSerials.map((s) => {
                    const isSelected = (damageData.selectedSerials || []).includes(s.serialNumber)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          const current = damageData.selectedSerials || []
                          const newSelected = isSelected
                            ? current.filter(sn => sn !== s.serialNumber)
                            : [...current, s.serialNumber]
                          setDamageData({ ...damageData, selectedSerials: newSelected, quantity: newSelected.length.toString() })
                        }}
                        className={`px-3 py-1.5 text-sm rounded-lg border-2 transition-colors ${
                          isSelected
                            ? `${selectedBg} text-white`
                            : `bg-white text-gray-700 border-gray-300 ${hoverBorder}`
                        }`}
                      >
                        {s.serialNumber}
                      </button>
                    )
                  })}
                </div>
                {(damageData.selectedSerials || []).length > 0 && (
                  <p className={`text-xs ${countColor} mt-1`}>
                    {damageData.selectedSerials.length} serie(s) seleccionada(s) para {isLogistics ? 'salida' : 'merma'}
                  </p>
                )}
              </div>
            )
          })() : (
            <Input
              label={businessMode === 'logistics' ? 'Cantidad a retirar' : 'Cantidad a descontar'}
              type="number"
              min="1"
              step="1"
              required
              value={damageData.quantity}
              onChange={(e) => setDamageData({ ...damageData, quantity: e.target.value })}
              placeholder="Ej: 5"
            />
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {businessMode === 'logistics' ? 'Destino / Notas (opcional)' : 'Notas (opcional)'}
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows={3}
              value={damageData.notes}
              onChange={(e) => setDamageData({ ...damageData, notes: e.target.value })}
              placeholder={businessMode === 'logistics'
                ? 'Ej: Entregado a oficina de Juan Pérez, obra Lima Norte...'
                : 'Descripción del daño o motivo adicional...'}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={closeDamageModal}
              disabled={isProcessingDamage}
            >
              Cancelar
            </Button>
            <Button
              variant={businessMode === 'logistics' ? 'primary' : 'danger'}
              onClick={handleDamage}
              disabled={isProcessingDamage}
            >
              {isProcessingDamage ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  {businessMode === 'logistics' ? (
                    <PackageMinus className="w-4 h-4 mr-2" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mr-2" />
                  )}
                  {businessMode === 'logistics' ? 'Registrar Salida' : 'Registrar Merma'}
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Producción Rápida */}
      <Modal
        isOpen={showProductionModal}
        onClose={closeProductionModal}
        title="Producción Rápida"
        size="md"
      >
        <div className="space-y-4">
          {productionProduct && (
            <div className="flex items-center gap-3 p-3 bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-xl">
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-white border border-emerald-200 flex items-center justify-center flex-shrink-0">
                {productionProduct.imageUrl ? (
                  <img src={productionProduct.imageUrl} alt={productionProduct.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-6 h-6 text-emerald-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">Producto a producir</p>
                <p className="font-semibold text-gray-900 truncate">{productionProduct.name}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {productionMode === 'recipe' ? (
                    <Badge variant="info"><CookingPot className="w-3 h-3 mr-1" />Con Receta</Badge>
                  ) : productionMode === 'manual' ? (
                    <Badge variant="default"><Wrench className="w-3 h-3 mr-1" />Manual</Badge>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                      <Loader2 className="w-3 h-3 animate-spin" />Detectando…
                    </span>
                  )}
                  {productionProduct.code && (
                    <span className="text-xs text-gray-400">Cód: {productionProduct.code}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {productionMode && (
            <>
              <Select
                label="Almacén destino"
                required
                value={productionData.warehouseId}
                onChange={(e) => setProductionData({ ...productionData, warehouseId: e.target.value })}
              >
                <option value="">Seleccionar almacén</option>
                {warehouses
                  .filter((w) => w.isActive)
                  .map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
              </Select>

              <Input
                label="Cantidad a producir"
                type="number"
                min="1"
                step="1"
                required
                value={productionData.quantity}
                onChange={(e) => handleProductionQuantityChange(e.target.value)}
                placeholder="Ej: 10"
              />

              {/* Lote y vencimiento (productos con lote, sin variantes; solo si el control de lotes está habilitado) */}
              {(businessMode === 'pharmacy' || businessSettings?.posCustomFields?.showBatchExpiryInPurchase) && productionProduct?.trackExpiration && !productionProduct?.hasVariants && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Lote"
                    required
                    value={productionData.batchNumber}
                    onChange={(e) => setProductionData({ ...productionData, batchNumber: e.target.value })}
                    placeholder="Ej: L-2026-001"
                  />
                  <Input
                    label="Vencimiento"
                    type="date"
                    required
                    value={productionData.expirationDate}
                    onChange={(e) => setProductionData({ ...productionData, expirationDate: e.target.value })}
                  />
                </div>
              )}

              {/* Números de serie (productos con series, sin variantes) */}
              {productionProduct?.trackSerials && !productionProduct?.hasVariants && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Números de serie <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                    rows={Math.min(6, Math.max(2, parseInt(productionData.quantity) || 2))}
                    value={productionData.serials}
                    onChange={(e) => setProductionData({ ...productionData, serials: e.target.value })}
                    placeholder={'Uno por línea, ej:\nSN-0001\nSN-0002'}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Ingresa {productionData.quantity || 'N'} series (uno por línea o separadas por coma).
                    {' '}Ingresadas: {productionData.serials.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length}
                  </p>
                </div>
              )}

              {/* Vista previa de receta (modo recipe) */}
              {productionMode === 'recipe' && (
                <div>
                  {isCheckingProductionRecipe ? (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      <span className="text-sm text-gray-500">Verificando insumos...</span>
                    </div>
                  ) : productionRecipeInfo ? (
                    <div className={`p-4 rounded-lg border ${productionRecipeInfo.hasStock ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {productionRecipeInfo.hasStock ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        )}
                        <span className={`text-sm font-medium ${productionRecipeInfo.hasStock ? 'text-green-700' : 'text-red-700'}`}>
                          {productionRecipeInfo.hasStock ? 'Insumos disponibles' : 'Stock insuficiente'}
                        </span>
                      </div>
                      {productionRecipeInfo.recipe?.ingredients && (
                        <div className="space-y-1">
                          {productionRecipeInfo.recipe.ingredients.map((ing, idx) => {
                            const needed = ing.quantity * (parseFloat(productionData.quantity) || 1)
                            const missing = productionRecipeInfo.missingIngredients?.find(
                              m => m.name === ing.ingredientName
                            )
                            return (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className={missing ? 'text-red-600' : 'text-gray-700'}>
                                  {ing.ingredientName}
                                </span>
                                <span className={missing ? 'text-red-600 font-medium' : 'text-gray-500'}>
                                  {needed.toFixed(2)} {ing.unit}
                                  {missing && ` (disp: ${missing.available.toFixed(2)})`}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {productionRecipeInfo.totalCost > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between text-sm font-medium">
                          <span className="text-gray-600">Costo estimado:</span>
                          <span className="text-gray-900">{formatCurrency(productionRecipeInfo.totalCost)}</span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={2}
                  value={productionData.notes}
                  onChange={(e) => setProductionData({ ...productionData, notes: e.target.value })}
                  placeholder="Notas adicionales..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={closeProductionModal}
                  disabled={isProcessingProduction}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleProduction}
                  disabled={
                    isProcessingProduction ||
                    !productionData.warehouseId ||
                    !productionData.quantity ||
                    (productionMode === 'recipe' && productionRecipeInfo && !productionRecipeInfo.hasStock) ||
                    isCheckingProductionRecipe
                  }
                >
                  {isProcessingProduction ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Produciendo...
                    </>
                  ) : (
                    <>
                      <Cog className="w-4 h-4 mr-2" />
                      Producir
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Modal de Historial de Movimientos */}
      <Modal
        isOpen={showHistoryModal}
        onClose={closeHistoryModal}
        title={`Historial - ${historyProduct?.name || ''}`}
        size="6xl"
        fullScreenMobile
      >
        <div className="space-y-4">
          {historyProduct && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm text-gray-600">Producto</p>
              <p className="font-semibold text-gray-900">{historyProduct.name}</p>
              <p className="text-sm text-gray-500">Código: {historyProduct.code || '-'}</p>
            </div>
          )}

          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              <span className="ml-2 text-gray-600">Cargando historial...</span>
            </div>
          ) : productMovements.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Sin movimientos registrados
              </h3>
              <p className="text-gray-600">
                Este producto no tiene historial de movimientos
              </p>
            </div>
          ) : (
            <>
              {/* Vista móvil/tablet - Tarjetas */}
              <div className="md:hidden max-h-[60vh] overflow-y-auto space-y-3">
                {productMovements.map(movement => {
                  const typeInfo = getMovementTypeInfo(movement.type)
                  const Icon = typeInfo.icon
                  return (
                    <div
                      key={movement.id}
                      className={`p-3 rounded-lg border-l-4 ${
                        movement.quantity > 0
                          ? 'bg-green-50 border-green-500'
                          : 'bg-red-50 border-red-500'
                      }`}
                    >
                      {/* Fila 1: Tipo + Cantidad */}
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={typeInfo.variant} className="text-xs">
                          <Icon className="w-3 h-3 mr-1 inline" />
                          {typeInfo.label}
                        </Badge>
                        <span
                          className={`text-lg font-bold ${
                            movement.quantity > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {movement.quantity > 0 ? '+' : ''}
                          {Math.round(movement.quantity * 100) / 100}
                          <span className="text-xs font-normal text-gray-400 ml-1">{getItemUnitLabel(historyProduct, '').toLowerCase()}</span>
                        </span>
                      </div>

                      {/* Fila 2: Almacén */}
                      <div className="text-sm mb-1">
                        {movement.type === 'transfer_in' && movement.fromWarehouseName ? (
                          <p className="text-gray-700">
                            <span className="text-gray-500">De:</span> {movement.fromWarehouseName} → <span className="font-medium">{movement.warehouseName}</span>
                          </p>
                        ) : movement.type === 'transfer_out' && movement.toWarehouseName ? (
                          <p className="text-gray-700">
                            <span className="font-medium">{movement.warehouseName}</span> → <span className="text-gray-500">{movement.toWarehouseName}</span>
                          </p>
                        ) : (
                          <p className="text-gray-700">
                            <Warehouse className="w-3 h-3 inline mr-1 text-gray-400" />
                            {movement.warehouseName}
                          </p>
                        )}
                      </div>

                      {/* Fila 3: Motivo (si existe) */}
                      {(movement.notes || movement.reason) && (
                        <p className="text-xs text-gray-600 mb-1 line-clamp-2">
                          {movement.notes || movement.reason}
                        </p>
                      )}

                      {/* Fila 4: Fecha + Referencia */}
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-200/50">
                        <span>{formatMovementDate(movement.createdAt)}</span>
                        {movement.referenceNumber && (
                          <span className="text-gray-400">{movement.referenceNumber}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Vista desktop - Tabla */}
              <div className="hidden md:block overflow-x-auto max-h-96">
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="w-[15%] px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="w-[13%] px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                      <th className="w-[17%] px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Almacén</th>
                      <th className="w-[15%] px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cant.</th>
                      <th className="w-[40%] px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {productMovements.map(movement => {
                      const typeInfo = getMovementTypeInfo(movement.type)
                      const Icon = typeInfo.icon
                      return (
                        <tr key={movement.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {formatMovementDate(movement.createdAt)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={typeInfo.variant} className="text-xs">
                              <Icon className="w-3 h-3 mr-1 inline" />
                              {typeInfo.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-xs">
                              {movement.type === 'transfer_in' && movement.fromWarehouseName ? (
                                <>
                                  <p className="text-gray-400">De: {movement.fromWarehouseName}</p>
                                  <p className="font-medium">A: {movement.warehouseName}</p>
                                </>
                              ) : movement.type === 'transfer_out' && movement.toWarehouseName ? (
                                <>
                                  <p className="font-medium">De: {movement.warehouseName}</p>
                                  <p className="text-gray-400">A: {movement.toWarehouseName}</p>
                                </>
                              ) : (
                                <p className="font-medium">{movement.warehouseName}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-bold ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {movement.quantity > 0 ? '+' : ''}{Math.round(movement.quantity * 100) / 100}
                            </span>
                            <span className="text-xs text-gray-400 ml-1">{getItemUnitLabel(historyProduct, '').toLowerCase()}</span>
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-xs text-gray-600 whitespace-normal break-words line-clamp-3">
                              {movement.notes || movement.reason || '-'}
                            </p>
                            {movement.referenceNumber && (
                              <p className="text-[10px] text-gray-400 mt-0.5">{movement.referenceNumber}</p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Resumen de movimientos */}
          {!isLoadingHistory && productMovements.length > 0 && (() => {
            const stockFromMovements = productMovements.reduce((sum, m) => sum + (m.quantity || 0), 0)
            const stockUnit = getItemUnitLabel(historyProduct, 'und')
            const currentStock = historyProduct?.hasVariants && historyProduct.variants?.length > 0
              ? historyProduct.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
              : historyProduct?.warehouseStocks?.length > 0
                ? historyProduct.warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
                : (historyProduct?.stock || historyProduct?.currentStock || 0)
            const hasDiscrepancy = Math.abs(stockFromMovements - currentStock) >= 1

            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t">
                  <div className="bg-gray-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-gray-600">Total</p>
                    <p className="text-lg font-bold text-gray-900">{productMovements.length}</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-gray-600">Entradas</p>
                    <p className="text-lg font-bold text-green-600">
                      +{Math.round(productMovements.filter(m => m.quantity > 0).reduce((sum, m) => sum + m.quantity, 0) * 100) / 100}
                    </p>
                    <p className="text-xs text-gray-500">{productMovements.filter(m => m.quantity > 0).length} mov.</p>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-gray-600">Salidas</p>
                    <p className="text-lg font-bold text-red-600">
                      {Math.round(productMovements.filter(m => m.quantity < 0).reduce((sum, m) => sum + m.quantity, 0) * 100) / 100}
                    </p>
                    <p className="text-xs text-gray-500">{productMovements.filter(m => m.quantity < 0).length} mov.</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-gray-600">Balance</p>
                    <p className={`text-lg font-bold ${stockFromMovements >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {stockFromMovements >= 0 ? '+' : ''}{Math.round(stockFromMovements * 100) / 100} <span className="text-xs font-normal text-gray-500">{stockUnit}</span>
                    </p>
                  </div>
                </div>

                {hasDiscrepancy && (
                  <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">
                          Stock desincronizado
                        </p>
                        <p className="text-xs text-yellow-700">
                          Stock actual: <span className="font-bold">{currentStock} {stockUnit}</span> — Según movimientos: <span className="font-bold">{stockFromMovements} {stockUnit}</span>
                        </p>
                      </div>
                    </div>
                    {!isDemoMode && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRecalculateStock}
                        disabled={isRecalculating}
                        className="border-yellow-400 text-yellow-800 hover:bg-yellow-100 flex-shrink-0"
                      >
                        {isRecalculating ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-1" />
                        )}
                        Corregir
                      </Button>
                    )}
                  </div>
                )}
              </>
            )
          })()}

          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              onClick={closeHistoryModal}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Transferencia Masiva */}
      <MassTransferModal
        isOpen={showMassTransferModal}
        onClose={() => setShowMassTransferModal(false)}
        products={products}
        ingredients={ingredients}
        warehouses={warehouses}
        allWarehouses={allWarehouses}
        branches={branches}
        businessId={getBusinessId()}
        userId={user?.uid}
        userName={user?.displayName || user?.email || ''}
        companySettings={companySettings}
        onTransferCompleted={() => {
          loadProducts()
          loadIngredients()
          setShowMassTransferModal(false)
        }}
      />

      {/* Modal de Verificación y Corrección masiva de stock */}
      <BulkStockCorrectionModal
        isOpen={showBulkCorrectionModal}
        onClose={() => setShowBulkCorrectionModal(false)}
        totalItems={products.length + ingredients.length}
        onStart={async ({ onProgress }) => {
          const businessId = getBusinessId()
          const items = [
            ...products.map(p => ({ id: p.id, name: p.name, isIngredient: false })),
            ...ingredients.map(i => ({ id: i.id, name: i.name, isIngredient: true })),
          ]
          return await bulkRecalculateStock(businessId, items, {
            batchSize: 8,
            onProgress,
            userId: user?.uid || null,
            userName: user?.displayName || user?.email || null,
          })
        }}
        onCompleted={() => {
          // Refrescar inventario tras correcciones
          loadProducts()
          loadIngredients()
          // Mostrar el botón "Revertir" cargando el nuevo backup
          loadLatestStockBackup()
        }}
      />

      {/* Modal de confirmación: Revertir verificación masiva */}
      <Modal
        isOpen={showRevertModal}
        onClose={() => !isReverting && setShowRevertModal(false)}
        title={
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-600" />
            <span className="text-lg font-bold">Revertir verificación de stock</span>
          </div>
        }
        size="md"
      >
        {!isReverting && latestStockBackup && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
              Esto restaurará el stock de <strong>{latestStockBackup.itemsCount}</strong>{' '}
              producto{latestStockBackup.itemsCount === 1 ? '' : 's'} al estado previo
              a la verificación.
              {latestStockBackup.createdAt && (
                <div className="mt-2 text-xs text-amber-700">
                  Verificación realizada el{' '}
                  <strong>{latestStockBackup.createdAt.toLocaleString('es-PE')}</strong>
                  {latestStockBackup.userName && (
                    <> por <strong>{latestStockBackup.userName}</strong></>
                  )}
                </div>
              )}
            </div>
            <ul className="text-xs text-gray-600 space-y-1 pl-4 list-disc">
              <li>Solo se restauran los productos que la verificación modificó.</li>
              <li>Movimientos de stock posteriores a la verificación se mantienen registrados.</li>
              <li>Una vez revertido, este backup ya no se puede volver a aplicar.</li>
            </ul>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowRevertModal(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleRevertStockBackup}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Revertir ahora
              </Button>
            </div>
          </div>
        )}
        {isReverting && (
          <div className="space-y-4">
            <div className="text-center py-2">
              <Loader2 className="w-10 h-10 text-amber-600 animate-spin mx-auto mb-2" />
              <div className="text-sm font-medium text-gray-800">
                Restaurando {revertProgress.processed} de {revertProgress.total}…
              </div>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-600 transition-all"
                style={{
                  width: `${revertProgress.total > 0
                    ? Math.min(100, Math.round((revertProgress.processed / revertProgress.total) * 100))
                    : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 text-center">
              No cierres esta ventana mientras se restaura el stock.
            </p>
          </div>
        )}
      </Modal>

      {/* Modal de Recuento de Inventario */}
      {/* Modal de opciones de exportación */}
      <InventoryExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        warehouses={filteredWarehouses}
        onExport={handleExportWithOptions}
        isExporting={isExporting}
        hasIngredients={ingredients.length > 0}
      />

      <InventoryCountModal
        isOpen={showInventoryCountModal}
        onClose={() => setShowInventoryCountModal(false)}
        products={[...products, ...ingredients.map(ing => ({
          ...ing,
          isIngredient: true,
          name: `${ing.name} (Ingrediente)`,
        }))]}
        categories={productCategories}
        businessId={getBusinessId()}
        userId={user?.uid}
        companySettings={companySettings}
        warehouses={warehouses}
        defaultWarehouse={defaultWarehouse}
        onCountCompleted={() => {
          loadProducts()
          loadIngredients()
          setShowInventoryCountModal(false)
        }}
      />

      {/* Modal Historial de Recuentos */}
      <Modal
        isOpen={showCountHistory}
        onClose={() => { setShowCountHistory(false); setSelectedCount(null) }}
        title={selectedCount ? 'Detalle del Recuento' : 'Historial de Recuentos'}
        size="lg"
      >
        {selectedCount ? (
          <div className="space-y-4">
            <button onClick={() => setSelectedCount(null)} className="text-sm text-primary-600 hover:underline flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Volver al historial
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Contados</p>
                <p className="text-lg font-bold text-blue-600">{selectedCount.totalProductsCounted || 0}</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Con diferencia</p>
                <p className="text-lg font-bold text-yellow-600">{selectedCount.productsWithDifference || 0}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Faltante</p>
                <p className="text-lg font-bold text-red-600">{selectedCount.totalMissing || 0} uds</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Sobrante</p>
                <p className="text-lg font-bold text-green-600">{selectedCount.totalSurplus || 0} uds</p>
              </div>
            </div>
            {selectedCount.itemsAdjusted && selectedCount.itemsAdjusted.length > 0 ? (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Producto</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Sistema</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Conteo</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedCount.itemsAdjusted.map((item, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.productName}</p>
                          {item.productCode && <p className="text-xs text-gray-400">{item.productCode}</p>}
                        </td>
                        <td className="text-right px-3 py-2">{item.previousStock}</td>
                        <td className="text-right px-3 py-2">{item.newStock}</td>
                        <td className={`text-right px-3 py-2 font-semibold ${
                          item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : 'text-gray-400'
                        }`}>
                          {item.difference > 0 ? '+' : ''}{item.difference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No se registraron ajustes en este recuento</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : countHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ClipboardCheck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>No hay recuentos registrados</p>
                <p className="text-xs mt-1">Realiza tu primer recuento de inventario</p>
              </div>
            ) : (
              countHistory.map(count => (
                <button
                  key={count.id}
                  onClick={() => setSelectedCount(count)}
                  className="w-full text-left bg-white border rounded-lg p-4 hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {count.createdAt?.toDate ? count.createdAt.toDate().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {count.totalProductsCounted || 0} productos contados
                        {count.productsWithDifference > 0 && (
                          <span className="text-yellow-600"> - {count.productsWithDifference} con diferencia</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {(count.totalMissingValue > 0 || count.totalSurplusValue > 0) && (
                        <div className="text-right">
                          {count.totalMissingValue > 0 && (
                            <p className="text-xs text-red-600">-{formatCurrency(count.totalMissingValue)}</p>
                          )}
                          {count.totalSurplusValue > 0 && (
                            <p className="text-xs text-green-600">+{formatCurrency(count.totalSurplusValue)}</p>
                          )}
                        </div>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
