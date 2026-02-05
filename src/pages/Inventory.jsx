import React, { useState, useEffect } from 'react'
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
  ChevronRight,
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
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { Link } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Alert from '@/components/ui/Alert'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/utils'
import { getProducts, getProductCategories, updateProduct } from '@/services/firestoreService'
import { getIngredients } from '@/services/ingredientService'
import { generateProductsExcel } from '@/services/productExportService'
import { getWarehouses, createStockMovement, updateWarehouseStock, getOrphanStockProducts, migrateOrphanStock, getOrphanStock, getDeletedWarehouseStock, getStockMovements } from '@/services/warehouseService'
import { getActiveBranches } from '@/services/branchService'
import InventoryCountModal from '@/components/InventoryCountModal'
import { getCompanySettings } from '@/services/firestoreService'

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

// Función para obtener el stock real de un item (suma de warehouseStocks o stock general)
const getRealStockValue = (item) => {
  // Si no tiene control de stock, retornar null
  if (item.stock === null || item.stock === undefined) {
    return null
  }

  // Si tiene warehouseStocks, usar la suma
  const warehouseStocks = item.warehouseStocks || []
  if (warehouseStocks.length > 0) {
    const warehouseTotal = warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
    // Retornar el mayor entre la suma de almacenes y el stock general
    // para no perder datos en caso de inconsistencia
    return Math.max(warehouseTotal, item.stock || 0)
  }

  // Si no tiene warehouseStocks, usar stock general
  return item.stock || 0
}

export default function Inventory() {
  const { user, isDemoMode, demoData, getBusinessId, businessMode } = useAppContext()
  const { filterWarehousesByAccess } = useAuth()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [productCategories, setProductCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [filterCategories, setFilterCategories] = useState([]) // Array vacío = todas las categorías
  const [filterStatuses, setFilterStatuses] = useState([]) // Array vacío = todos los estados
  const [filterType, setFilterType] = useState('all') // 'all', 'products', 'ingredients'
  const [expandedProduct, setExpandedProduct] = useState(null)

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
    notes: ''
  })
  const [isTransferring, setIsTransferring] = useState(false)

  // Estado para modal de merma/daños
  const [showDamageModal, setShowDamageModal] = useState(false)
  const [damageProduct, setDamageProduct] = useState(null)
  const [damageData, setDamageData] = useState({
    warehouseId: '',
    quantity: '',
    reason: 'damaged',
    notes: ''
  })
  const [isProcessingDamage, setIsProcessingDamage] = useState(false)

  // Estado para modal de historial de movimientos
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyProduct, setHistoryProduct] = useState(null)
  const [productMovements, setProductMovements] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Estado para migración de stock huérfano
  const [isMigratingOrphanStock, setIsMigratingOrphanStock] = useState(false)

  // Estado para modal de recuento de inventario
  const [showInventoryCountModal, setShowInventoryCountModal] = useState(false)
  const [companySettings, setCompanySettings] = useState(null)

  useEffect(() => {
    loadProducts()
    loadIngredients()
    loadCategories()
    loadWarehouses()
    loadBranches()
    loadCompanySettings()
  }, [user])

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

  // Calcular stock considerando los filtros de sucursal y almacén
  const getStockForBranch = React.useCallback((item) => {
    // Si no tiene control de stock, retornar null
    if (item.stock === null || item.stock === undefined) {
      return null
    }

    const warehouseStocks = item.warehouseStocks || []
    if (warehouseStocks.length === 0) {
      // Si no tiene warehouseStocks y estamos viendo todas las sucursales/almacenes, usar stock general
      if (filterBranch === 'all' && filterWarehouses.length === 0) {
        return item.stock || 0
      }
      // Si hay filtro pero no hay warehouseStocks, es 0
      return 0
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

    // Si estamos viendo todas las sucursales, sumar todo
    if (filterBranch === 'all') {
      return warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
    }

    // Filtrar y sumar solo los almacenes de la sucursal seleccionada
    const branchStock = warehouseStocks
      .filter(ws => filteredWarehouseIds.includes(ws.warehouseId))
      .reduce((sum, ws) => sum + (ws.stock || 0), 0)

    return branchStock
  }, [filterBranch, filterWarehouses, filteredWarehouses])

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

      const result = await getProducts(getBusinessId())
      if (result.success) {
        setProducts(result.data || [])
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
        return
      }

      const result = await getProductCategories(getBusinessId())
      if (result.success) {
        const migratedCategories = migrateLegacyCategories(result.data || [])
        setProductCategories(migratedCategories)
      }
    } catch (error) {
      console.error('Error al cargar categorías:', error)
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

  const handleExportToExcel = async () => {
    try {
      if (products.length === 0) {
        toast.error('No hay productos en el inventario para exportar');
        return;
      }

      // Obtener datos del negocio
      const { getCompanySettings } = await import('@/services/firestoreService');
      const settingsResult = await getCompanySettings(getBusinessId());
      const businessData = settingsResult.success ? settingsResult.data : null;

      // Determinar nombre de sucursal filtrada
      let branchLabel = null
      if (filterBranch === 'main') {
        branchLabel = 'Sucursal Principal'
      } else if (filterBranch !== 'all') {
        const branch = branches.find(b => b.id === filterBranch)
        branchLabel = branch ? branch.name : null
      }

      // Determinar nombres de almacenes filtrados
      let warehouseLabel = null
      if (filterWarehouses.length > 0) {
        const names = filterWarehouses
          .map(wId => filteredWarehouses.find(w => w.id === wId)?.name)
          .filter(Boolean)
        warehouseLabel = names.join(', ')
      }

      // Preparar productos con stock ajustado según filtro de sucursal/almacén
      const productsWithBranchStock = products.map(p => ({
        ...p,
        stock: getStockForBranch(p) ?? p.stock ?? 0,
      }))

      // Generar Excel
      await generateProductsExcel(productsWithBranchStock, productCategories, businessData, branchLabel, warehouseLabel);
      toast.success(`${products.length} producto(s) exportado(s) exitosamente`);
    } catch (error) {
      console.error('Error al exportar inventario:', error);
      toast.error('Error al generar el archivo Excel');
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
      notes: ''
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
      notes: ''
    })
  }

  // Funciones para modal de merma/daños
  const openDamageModal = (product) => {
    setDamageProduct(product)
    // Si solo hay un almacén, seleccionarlo automáticamente
    const activeWarehouses = warehouses.filter(w => w.isActive)
    const defaultWarehouseId = activeWarehouses.length === 1 ? activeWarehouses[0].id : ''
    setDamageData({
      warehouseId: defaultWarehouseId,
      quantity: '',
      reason: 'damaged',
      notes: ''
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
      notes: ''
    })
  }

  const handleDamage = async () => {
    if (!user?.uid || !damageProduct) return

    // Validaciones
    if (!damageData.warehouseId) {
      toast.error('Debes seleccionar un almacén')
      return
    }

    const quantity = parseFloat(damageData.quantity)
    if (!quantity || quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    // Verificar stock disponible en almacén
    const warehouseStock = damageProduct.warehouseStocks?.find(
      ws => ws.warehouseId === damageData.warehouseId
    )
    const availableStock = warehouseStock?.stock || 0

    if (quantity > availableStock) {
      toast.error(`Stock insuficiente. Disponible: ${availableStock}`)
      return
    }

    setIsProcessingDamage(true)
    try {
      const businessId = getBusinessId()
      const warehouseName = warehouses.find(w => w.id === damageData.warehouseId)?.name || ''

      // Mapeo de razones
      const reasonLabels = {
        damaged: 'Producto dañado',
        expired: 'Producto expirado',
        lost: 'Pérdida/Extravío',
        theft: 'Robo',
        other: 'Otro'
      }
      const reasonLabel = reasonLabels[damageData.reason] || damageData.reason

      // Crear movimiento de merma
      await createStockMovement(businessId, {
        productId: damageProduct.id,
        warehouseId: damageData.warehouseId,
        type: 'damage',
        quantity: -quantity, // Siempre negativo
        reason: reasonLabel,
        referenceType: 'damage_adjustment',
        userId: user.uid,
        notes: damageData.notes || `Merma: ${quantity} unidades - ${reasonLabel}`
      })

      // Actualizar stock del producto en el almacén
      const updatedProduct = updateWarehouseStock(
        damageProduct,
        damageData.warehouseId,
        -quantity
      )

      // Guardar en Firestore
      const updateResult = await updateProduct(businessId, damageProduct.id, {
        stock: updatedProduct.stock,
        warehouseStocks: updatedProduct.warehouseStocks
      })

      if (!updateResult.success) {
        throw new Error('Error al actualizar el stock')
      }

      toast.success(`Merma registrada: ${quantity} unidades de ${damageProduct.name}`)
      closeDamageModal()
      loadProducts() // Recargar productos
    } catch (error) {
      console.error('Error al registrar merma:', error)
      toast.error('Error al registrar la merma')
    } finally {
      setIsProcessingDamage(false)
    }
  }

  // Funciones para modal de historial de movimientos
  const openHistoryModal = async (product) => {
    setHistoryProduct(product)
    setShowHistoryModal(true)
    setIsLoadingHistory(true)

    try {
      const businessId = getBusinessId()
      const result = await getStockMovements(businessId, { productId: product.id })

      if (result.success) {
        // Enriquecer movimientos con nombres de almacenes
        const enrichedMovements = result.data.map(mov => {
          const warehouse = warehouses.find(w => w.id === mov.warehouseId)
          const fromWarehouse = warehouses.find(w => w.id === mov.fromWarehouse)
          const toWarehouse = warehouses.find(w => w.id === mov.toWarehouse)

          return {
            ...mov,
            warehouseName: warehouse?.name || 'Almacén desconocido',
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
        label: 'Merma/Dañado',
        icon: AlertTriangle,
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        variant: 'danger',
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

    // Verificar que el producto maneja stock
    if (transferProduct.trackStock === false) {
      toast.error('Este producto no maneja stock y no puede ser transferido')
      return
    }

    // Verificar stock disponible en almacén origen
    const warehouseStock = transferProduct.warehouseStocks?.find(
      ws => ws.warehouseId === transferData.fromWarehouse
    )
    const availableStock = warehouseStock?.stock || 0

    if (quantity > availableStock) {
      toast.error(`Stock insuficiente en almacén origen. Disponible: ${availableStock}`)
      return
    }

    setIsTransferring(true)

    try {
      const businessId = getBusinessId()

      // 1. Actualizar stock - Salida del almacén origen
      let updatedProduct = updateWarehouseStock(
        transferProduct,
        transferData.fromWarehouse,
        -quantity
      )

      // 2. Actualizar stock - Entrada al almacén destino
      updatedProduct = updateWarehouseStock(
        updatedProduct,
        transferData.toWarehouse,
        quantity
      )

      // 3. Guardar en Firestore
      const updateResult = await updateProduct(businessId, transferProduct.id, {
        stock: updatedProduct.stock,
        warehouseStocks: updatedProduct.warehouseStocks
      })

      if (!updateResult.success) {
        throw new Error('Error al actualizar el stock')
      }

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
        notes: transferData.notes || `Transferencia a ${warehouses.find(w => w.id === transferData.toWarehouse)?.name}`
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
        notes: transferData.notes || `Transferencia desde ${warehouses.find(w => w.id === transferData.fromWarehouse)?.name}`
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

  // Filtrar y ordenar items (optimizado con useMemo)
  const filteredProducts = React.useMemo(() => {
    console.log(`🔍 [Inventory] filteredProducts recalculando. allItems.length=${allItems.length}`)

    const filtered = allItems.filter(item => {
      // Búsqueda flexible: dividir en palabras y verificar que TODAS estén presentes
      const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0)

      // Concatenar campos buscables
      const searchableText = [
        item.name || '',
        item.code || '',
        item.sku || '',
        item.category || ''
      ].join(' ').toLowerCase()

      // Verificar que TODAS las palabras estén presentes (en cualquier orden)
      const matchesSearch = searchWords.length === 0 || searchWords.every(word => searchableText.includes(word))

      // Multi-select: array vacío = todas las categorías
      const matchesCategory =
        filterCategories.length === 0 || filterCategories.includes(item.category)

      // Usar stock filtrado por sucursal
      const branchStock = getStockForBranch(item)

      // Multi-select: array vacío = todos los estados
      let matchesStatus = true
      if (filterStatuses.length > 0) {
        const itemStatuses = []
        if (branchStock !== null && branchStock > 0 && branchStock < 4) {
          itemStatuses.push('low')
        }
        if (branchStock === 0) {
          itemStatuses.push('out')
        }
        if (branchStock === null || branchStock >= 4) {
          itemStatuses.push('normal')
        }
        matchesStatus = filterStatuses.some(status => itemStatuses.includes(status))
      }

      return matchesSearch && matchesCategory && matchesStatus
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
  }, [allItems, searchTerm, filterCategories, filterStatuses, productCategories, sortField, sortDirection, getStockForBranch])

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
  }, [searchTerm, filterCategories, filterStatuses, filterBranch, filterWarehouses])

  // Obtener categorías únicas (productos + ingredientes en retail)
  const categories = React.useMemo(() => {
    let allCategories = []

    // Categorías de productos
    const productCats = [...new Set(products.map(p => p.category).filter(Boolean))]
    allCategories = productCats.map(catId => {
      const category = productCategories.find(c => c.id === catId)
      return category ? { id: catId, name: category.name } : { id: catId, name: catId }
    })

    // Categorías de ingredientes
    const ingredientCats = [...new Set(ingredients.map(i => i.category).filter(Boolean))]
    const categoryLabels = {
      'granos': 'Granos y Cereales',
      'carnes': 'Carnes',
      'vegetales': 'Vegetales y Frutas',
      'lacteos': 'Lácteos',
      'condimentos': 'Condimentos y Especias',
      'bebidas': 'Bebidas',
      'estetica': 'Estética y Belleza',
      'salud': 'Salud y Farmacia',
      'limpieza': 'Limpieza',
      'otros': 'Otros'
    }

    ingredientCats.forEach(cat => {
      if (!allCategories.find(c => c.id === cat)) {
        allCategories.push({
          id: cat,
          name: categoryLabels[cat] || cat
        })
      }
    })

    return allCategories
  }, [products, ingredients, productCategories])

  // Calcular estadísticas (basadas en productos filtrados para reflejar todos los filtros)
  const statistics = React.useMemo(() => {
    const itemsWithStock = filteredProducts.filter(i => getStockForBranch(i) !== null)
    const lowStockItems = itemsWithStock.filter(i => {
      const branchStock = getStockForBranch(i)
      return branchStock !== null && branchStock > 0 && branchStock < 4
    })
    const outOfStockItems = itemsWithStock.filter(i => getStockForBranch(i) === 0)
    const totalValue = itemsWithStock.reduce((sum, i) => {
      const branchStock = getStockForBranch(i) || 0
      const price = i.itemType === 'ingredient' ? (i.averageCost || 0) : (i.price || 0)
      return sum + (branchStock * price)
    }, 0)
    const totalUnits = itemsWithStock.reduce((sum, i) => sum + (getStockForBranch(i) || 0), 0)

    return {
      productsWithStock: itemsWithStock,
      lowStockItems,
      outOfStockItems,
      totalValue,
      totalUnits
    }
  }, [filteredProducts, getStockForBranch])

  const { productsWithStock, lowStockItems, outOfStockItems, totalValue, totalUnits } = statistics

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

    setIsMigratingOrphanStock(true)

    try {
      const businessId = getBusinessId()
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
    if (realStock < 4) {
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
            onClick={() => setShowInventoryCountModal(true)}
          >
            <ClipboardCheck className="w-4 h-4 mr-2" />
            Recuento
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportToExcel}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
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

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Valor Total</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(totalValue)}
                </p>
              </div>
              <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

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
          <Link to="/app/productos" className="inline-block mt-2">
            <Button variant="outline" size="sm">
              Gestionar Productos
            </Button>
          </Link>
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
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            {/* Search */}
            <div className="flex-1 min-w-0">
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
            </div>

            {/* Filters Group */}
            <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 flex-wrap">
              {/* Category Multi-Select Filter */}
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'categories' ? null : 'categories')}
                  className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-primary-400 transition-colors ${filterCategories.length > 0 ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
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

              {/* Status Multi-Select Filter */}
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'statuses' ? null : 'statuses')}
                  className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-primary-400 transition-colors ${filterStatuses.length > 0 ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
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
                <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                  <Store className="w-4 h-4 text-gray-500" />
                  <select
                    value={filterBranch}
                    onChange={e => setFilterBranch(e.target.value)}
                    className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Todas las sucursales</option>
                    <option value="main">Sucursal Principal</option>
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
                    className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-primary-400 transition-colors ${filterWarehouses.length > 0 ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
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
        <CardContent>
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
            <div className="overflow-x-auto lg:overflow-x-visible">
              <Table className="w-full lg:table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20 lg:w-[8%]">
                      <button
                        onClick={() => handleSort('code')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por SKU"
                      >
                        SKU
                        {getSortIcon('code')}
                      </button>
                    </TableHead>
                    <TableHead className="lg:w-[22%]">
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por nombre"
                      >
                        Nombre
                        {getSortIcon('name')}
                      </button>
                    </TableHead>
                    <TableHead className="hidden sm:table-cell w-20 lg:w-[8%]">Tipo</TableHead>
                    <TableHead className="hidden md:table-cell lg:w-[18%]">
                      <button
                        onClick={() => handleSort('category')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Ordenar por categoría"
                      >
                        Categoría
                        {getSortIcon('category')}
                      </button>
                    </TableHead>
                    <TableHead className="w-20 lg:w-[10%] text-right">
                      <button
                        onClick={() => handleSort('stock')}
                        className="flex items-center gap-1 justify-end hover:text-primary-600 transition-colors"
                        title="Ordenar por stock"
                      >
                        Stock
                        {getSortIcon('stock')}
                      </button>
                    </TableHead>
                    <TableHead className="w-24 lg:w-[10%] text-right">
                      <button
                        onClick={() => handleSort('price')}
                        className="flex items-center gap-1 justify-end hover:text-primary-600 transition-colors"
                        title="Ordenar por precio"
                      >
                        Precio
                        {getSortIcon('price')}
                      </button>
                    </TableHead>
                    <TableHead className="w-24 lg:w-[10%] text-right">Valor</TableHead>
                    <TableHead className="w-20 lg:w-[9%] text-center">Estado</TableHead>
                    {warehouses.length >= 1 && <TableHead className="w-20 lg:w-[8%] text-right">Acciones</TableHead>}
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
                        <TableCell className="lg:w-[8%]">
                          <span className="font-mono text-xs sm:text-sm truncate block">
                            {item.sku || item.code || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="lg:w-[22%] max-w-0">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate" title={item.name}>
                              {item.name}
                            </p>
                            {item.category && (
                              <p className="text-xs text-gray-500 md:hidden truncate">
                                {isProduct
                                  ? getCategoryPath(productCategories, item.category) || item.category
                                  : item.category
                                }
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell lg:w-[8%]">
                          <Badge variant={isProduct ? 'default' : 'success'} className="text-xs">
                            {isProduct ? 'Prod.' : 'Ing.'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell lg:w-[18%] max-w-0">
                          <span
                            className="text-xs text-gray-600 truncate block"
                            title={isProduct
                              ? getCategoryPath(productCategories, item.category) || 'Sin categoría'
                              : item.category || 'Sin categoría'
                            }
                          >
                            {isProduct
                              ? getCategoryPath(productCategories, item.category) || 'Sin categoría'
                              : item.category || 'Sin categoría'
                            }
                          </span>
                        </TableCell>
                        <TableCell className="text-right lg:w-[10%]">
                          {(() => {
                            const realStock = getRealStock(item)
                            return (
                              <div className="flex items-center justify-end space-x-1">
                                {/* Botón de expandir/contraer solo si hay almacenes y es producto */}
                                {warehouses.length > 0 && realStock !== null && isProduct && (
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
                                          : realStock < 4
                                          ? 'text-yellow-600'
                                          : 'text-green-600'
                                      }`}
                                    >
                                      {realStock}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-right lg:w-[10%]">
                          <span className="text-sm">
                            {formatCurrency(isProduct ? item.price : (item.averageCost || 0))}
                          </span>
                        </TableCell>
                        <TableCell className="text-right lg:w-[10%]">
                          {(() => {
                            const realStock = getRealStock(item)
                            return realStock !== null ? (
                              <span className="font-semibold text-sm">
                                {formatCurrency(realStock * (isProduct ? item.price : (item.averageCost || 0)))}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500">-</span>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-center lg:w-[9%]">
                          <Badge variant={stockStatus.variant} className="text-xs whitespace-nowrap">
                            {stockStatus.status === 'Sin control' ? 'S/C' : stockStatus.status === 'Stock Bajo' ? 'Bajo' : stockStatus.status}
                          </Badge>
                        </TableCell>
                        {warehouses.length >= 1 && (
                          <TableCell className="lg:w-[8%]">
                            <div className="flex items-center justify-end gap-1">
                              {isProduct && warehouses.length > 1 && (
                                <button
                                  onClick={() => openTransferModal(item)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Transferir entre almacenes"
                                  disabled={getRealStock(item) === null || getRealStock(item) === 0}
                                >
                                  <ArrowRightLeft className="w-4 h-4" />
                                </button>
                              )}
                              {isProduct && (
                                <button
                                  onClick={() => openDamageModal(item)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Registrar merma/daño"
                                  disabled={getRealStock(item) === null || getRealStock(item) === 0}
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                </button>
                              )}
                              {isProduct && (
                                <button
                                  onClick={() => openHistoryModal(item)}
                                  className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                  title="Ver historial de movimientos"
                                >
                                  <History className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>

                      {/* Fila expandible con detalle por sucursal y almacén - solo para productos */}
                      {isExpanded && filteredWarehouses.length > 0 && getRealStock(item) !== null && isProduct && (
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
                                            <span className="font-medium text-primary-700">Sucursal Principal</span>
                                            <Badge variant="default" className="text-xs ml-2">
                                              {mainBranchWarehouses.reduce((sum, w) => {
                                                const ws = item.warehouseStocks?.find(ws => ws.warehouseId === w.id)
                                                return sum + (ws?.stock || 0)
                                              }, 0)} total
                                            </Badge>
                                          </div>
                                        )}
                                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                          {mainBranchWarehouses.map(warehouse => {
                                            const warehouseStock = hasWarehouseStocks
                                              ? item.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)
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
                                          <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                            {branchWarehouses.map(warehouse => {
                                              const warehouseStock = hasWarehouseStocks
                                                ? item.warehouseStocks.find(ws => ws.warehouseId === warehouse.id)
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
                                        </div>
                                      )
                                    })}
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
                    </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>

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
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Valor Total Inventario</p>
              <p className="text-xl font-bold text-primary-600">
                {formatCurrency(totalValue)}
              </p>
            </div>
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
                : 'Sucursal Principal'
              const toBranch = toWarehouse.branchId
                ? branches.find(b => b.id === toWarehouse.branchId)?.name
                : 'Sucursal Principal'

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Almacén de Origen <span className="text-red-500">*</span>
            </label>
            <select
              value={transferData.fromWarehouse}
              onChange={(e) => setTransferData({ ...transferData, fromWarehouse: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Selecciona almacén origen</option>
              {/* Almacenes de Sucursal Principal */}
              {allWarehouses.filter(w => w.isActive && !w.branchId).length > 0 && (
                <optgroup label="📍 Sucursal Principal">
                  {allWarehouses.filter(w => w.isActive && !w.branchId).map(warehouse => {
                    const warehouseStock = transferProduct?.warehouseStocks?.find(
                      ws => ws.warehouseId === warehouse.id
                    )
                    const stock = warehouseStock?.stock || 0
                    return (
                      <option key={warehouse.id} value={warehouse.id} disabled={stock === 0}>
                        {warehouse.name} - Stock: {stock}
                      </option>
                    )
                  })}
                </optgroup>
              )}
              {/* Almacenes agrupados por sucursal */}
              {branches.map(branch => {
                const branchWarehouses = allWarehouses.filter(w => w.isActive && w.branchId === branch.id)
                if (branchWarehouses.length === 0) return null
                return (
                  <optgroup key={branch.id} label={`📍 ${branch.name}`}>
                    {branchWarehouses.map(warehouse => {
                      const warehouseStock = transferProduct?.warehouseStocks?.find(
                        ws => ws.warehouseId === warehouse.id
                      )
                      const stock = warehouseStock?.stock || 0
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
                <optgroup label="📍 Sucursal Principal">
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

          <Input
            label="Cantidad a Transferir"
            type="number"
            required
            min="1"
            value={transferData.quantity}
            onChange={(e) => setTransferData({ ...transferData, quantity: e.target.value })}
            placeholder="Cantidad"
          />

          {transferData.fromWarehouse && (
            <div className="text-sm text-gray-600">
              Stock disponible: {' '}
              <span className="font-semibold">
                {transferProduct?.warehouseStocks?.find(
                  ws => ws.warehouseId === transferData.fromWarehouse
                )?.stock || 0}
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

      {/* Modal de Merma/Daños */}
      <Modal
        isOpen={showDamageModal}
        onClose={closeDamageModal}
        title="Registrar Merma o Daño"
        size="md"
      >
        <div className="space-y-4">
          {damageProduct && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
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

          <Select
            label="Motivo"
            required
            value={damageData.reason}
            onChange={(e) => setDamageData({ ...damageData, reason: e.target.value })}
          >
            <option value="damaged">Producto dañado</option>
            <option value="expired">Producto expirado</option>
            <option value="lost">Pérdida/Extravío</option>
            <option value="theft">Robo</option>
            <option value="other">Otro</option>
          </Select>

          <Input
            label="Cantidad a descontar"
            type="number"
            min="1"
            step="1"
            required
            value={damageData.quantity}
            onChange={(e) => setDamageData({ ...damageData, quantity: e.target.value })}
            placeholder="Ej: 5"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas (opcional)
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows={3}
              value={damageData.notes}
              onChange={(e) => setDamageData({ ...damageData, notes: e.target.value })}
              placeholder="Descripción del daño o motivo adicional..."
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
              variant="danger"
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
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Registrar Merma
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Historial de Movimientos */}
      <Modal
        isOpen={showHistoryModal}
        onClose={closeHistoryModal}
        title={`Historial de Movimientos - ${historyProduct?.name || ''}`}
        size="6xl"
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
            <div className="overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Almacén</TableHead>
                    <TableHead className="text-center">Cantidad</TableHead>
                    <TableHead className="hidden md:table-cell">Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productMovements.map(movement => {
                    const typeInfo = getMovementTypeInfo(movement.type)
                    const Icon = typeInfo.icon
                    return (
                      <TableRow key={movement.id}>
                        <TableCell>
                          <span className="text-sm text-gray-600">
                            {formatMovementDate(movement.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={typeInfo.variant}>
                            <Icon className="w-3 h-3 mr-1 inline" />
                            {typeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {movement.type === 'transfer_in' && movement.fromWarehouseName ? (
                              <div>
                                <p className="text-gray-500">
                                  <span className="text-gray-400">De:</span> {movement.fromWarehouseName}
                                </p>
                                <p className="font-medium">
                                  <span className="text-gray-400">A:</span> {movement.warehouseName}
                                </p>
                              </div>
                            ) : movement.type === 'transfer_out' && movement.toWarehouseName ? (
                              <div>
                                <p className="font-medium">
                                  <span className="text-gray-400">De:</span> {movement.warehouseName}
                                </p>
                                <p className="text-gray-500">
                                  <span className="text-gray-400">A:</span> {movement.toWarehouseName}
                                </p>
                              </div>
                            ) : (
                              <p className="font-medium">{movement.warehouseName}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`font-bold ${
                              movement.quantity > 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {movement.quantity > 0 ? '+' : ''}
                            {movement.quantity}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="max-w-xs">
                            <p className="text-sm text-gray-600 truncate" title={movement.notes}>
                              {movement.notes || movement.reason || '-'}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Resumen de movimientos */}
          {!isLoadingHistory && productMovements.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t">
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-600">Total</p>
                <p className="text-lg font-bold text-gray-900">{productMovements.length}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-600">Entradas</p>
                <p className="text-lg font-bold text-green-600">
                  {productMovements.filter(m => m.type === 'entry' || m.type === 'transfer_in').length}
                </p>
              </div>
              <div className="bg-red-50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-600">Salidas</p>
                <p className="text-lg font-bold text-red-600">
                  {productMovements.filter(m => m.type === 'exit' || m.type === 'transfer_out' || m.type === 'sale' || m.type === 'damage').length}
                </p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-600">Ajustes</p>
                <p className="text-lg font-bold text-purple-600">
                  {productMovements.filter(m => m.type === 'adjustment').length}
                </p>
              </div>
            </div>
          )}

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

      {/* Modal de Recuento de Inventario */}
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
    </div>
  )
}
