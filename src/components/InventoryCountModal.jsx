import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  Search,
  ClipboardCheck,
  FileText,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle,
  MinusCircle,
  PlusCircle,
  Filter,
  Download,
  RefreshCw,
  Copy,
  Trash2,
  ScanBarcode,
  Warehouse,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import { formatCurrency, buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'
import { buildProductHaystack, buildIngredientHaystack } from '@/utils/productSearch'
import { useToast } from '@/contexts/ToastContext'
import { updateProduct } from '@/services/firestoreService'
import { updateIngredient } from '@/services/ingredientService'
import { createStockMovement, createInventoryCount } from '@/services/warehouseService'
import { isProductInBranch } from '@/utils/branchCatalog'
import { useAppContext } from '@/hooks/useAppContext'
import { generateInventoryCountPdf } from '@/utils/inventoryCountPdfGenerator'

export default function InventoryCountModal({
  isOpen,
  onClose,
  products,
  categories,
  businessId,
  userId,
  companySettings,
  warehouses = [],
  branches = [],
  defaultWarehouse = null,
  onCountCompleted,
}) {
  const toast = useToast()
  const { businessSettings, branchScope } = useAppContext()

  // Estado principal del conteo
  const [countData, setCountData] = useState({})
  const [isApplying, setIsApplying] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // Almacén seleccionado para el recuento
  const [selectedWarehouse, setSelectedWarehouse] = useState(null)
  const [showWarehouseSelector, setShowWarehouseSelector] = useState(true)

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [differenceFilter, setDifferenceFilter] = useState('all')
  // Orden alfabético por nombre: null = orden natural del recuento (agrupado
  // por producto y sus lotes), 'asc' = A-Z, 'desc' = Z-A. Arranca en null a
  // propósito: el orden natural mantiene juntas las filas de un mismo producto.
  const [sortByName, setSortByName] = useState(null)
  const [itemTypeFilter, setItemTypeFilter] = useState('all')
  const [isScanning, setIsScanning] = useState(false)

  // Estadísticas
  const [countStats, setCountStats] = useState({
    totalProducts: 0,
    countedProducts: 0,
    productsWithDifference: 0,
    totalMissing: 0,
    totalSurplus: 0,
    totalMissingValue: 0,
    totalSurplusValue: 0,
  })

  // Ref para controlar si ya se inicializó
  const [initialized, setInitialized] = useState(false)

  // Calcular el stock de un producto para el almacén seleccionado
  const getWarehouseStock = (product, warehouseId) => {
    if (!warehouseId) return 0
    const warehouseStocks = product.warehouseStocks || []
    const ws = warehouseStocks.find(w => w.warehouseId === warehouseId)
    return ws?.stock || 0
  }

  // Calcular el stock real de un producto (suma total o por almacén)
  const getRealStock = (product, warehouseId = null) => {
    // Si hay un almacén específico, retornar solo ese stock
    if (warehouseId) {
      return getWarehouseStock(product, warehouseId)
    }
    // Productos con variantes: sumar stock de todas las variantes
    if (product.hasVariants && product.variants?.length > 0) {
      return product.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
    }
    // Si no, retornar la suma total
    const warehouseStocks = product.warehouseStocks || []
    if (warehouseStocks.length > 0) {
      const warehouseTotal = warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
      if (warehouseTotal > 0 || product.stock === 0) {
        return warehouseTotal
      }
    }
    return product.stock || 0
  }

  // Inicializar datos de conteo cuando se selecciona un almacén
  const initializeCountData = (warehouseId) => {
    const initialCountData = {}
    // Catalogo por sucursal: sede a la que pertenece el almacen del recuento.
    const countBranchId = warehouses.find(w => w.id === warehouseId)?.branchId || null
    const branchCatalogOn = businessSettings?.branchCatalogEnabled === true
    products.forEach(product => {
      // Incluir productos con stock, ingredientes con currentStock, o productos con variantes
      const hasStock = product.stock !== null && product.stock !== undefined
      const hasCurrentStock = product.currentStock !== null && product.currentStock !== undefined
      const hasVariants = product.hasVariants && product.variants?.length > 0
      const isIngredient = product.isIngredient

      if (hasStock || hasCurrentStock || hasVariants || isIngredient) {
        const warehouseStock = getWarehouseStock(product, warehouseId)

        // No listar productos ajenos a la sede de este almacen SALVO que tengan
        // stock aqui (huerfano, hay que poder contarlo). Sin esto el operario
        // los contaria como 0 y el recuento generaria ajustes falsos.
        if (branchCatalogOn && !isIngredient && !isProductInBranch(product, countBranchId)) {
          const hayStockAqui = warehouseStock > 0 ||
            (product.variants || []).some(v => (v.warehouseStocks || [])
              .some(ws => ws.warehouseId === warehouseId && (ws.stock || 0) > 0))
          if (!hayStockAqui) return
        }
        // Filtrar lotes del almacén seleccionado (o legacy sin warehouseId)
        const activeBatches = (product.batches || []).filter(b => b.quantity > 0 && (!b.warehouseId || b.warehouseId === warehouseId))
        const price = product.hasVariants ? (product.basePrice || 0) : (product.price || 0)

        if (activeBatches.length > 0) {
          // Productos con lotes: una fila por lote del almacén seleccionado
          let batchTotal = 0
          activeBatches.forEach(batch => {
            const batchId = batch.lotNumber || batch.batchNumber || batch.id
            const key = `${product.id}_batch_${batchId}_${warehouseId}`
            batchTotal += batch.quantity
            initialCountData[key] = {
              productId: product.id,
              productName: product.name,
              productCode: product.code || '-',
              category: product.category,
              systemStock: batch.quantity,
              physicalCount: '',
              price,
              isIngredient: false,
              warehouseStocks: product.warehouseStocks || [],
              trackSerials: product.trackSerials || false,
              // Datos del lote
              isBatchRow: true,
              batchId,
              batchData: batch,
              batchExpiration: batch.expirationDate || batch.expiryDate || null,
              allBatches: product.batches || [],
            }
          })

          // Si el stock del almacén es mayor que la suma de lotes, hay stock "sin lote"
          const unassignedStock = warehouseStock - batchTotal
          if (unassignedStock > 0) {
            initialCountData[`${product.id}_nolot_${warehouseId}`] = {
              productId: product.id,
              productName: product.name,
              productCode: product.code || '-',
              category: product.category,
              systemStock: unassignedStock,
              physicalCount: '',
              price,
              isIngredient: false,
              warehouseStocks: product.warehouseStocks || [],
              trackSerials: product.trackSerials || false,
              isUnassignedStock: true,
              allBatches: product.batches || [],
            }
          }
        } else if (product.hasVariants && product.variants?.length > 0) {
          // Productos con variantes: una fila por variante
          product.variants.forEach(variant => {
            const variantLabel = Object.values(variant.attributes || {}).join(' / ')
            const variantWS = (variant.warehouseStocks || []).find(ws => ws.warehouseId === warehouseId)
            const variantStock = variantWS?.stock || 0
            const key = `${product.id}_variant_${variant.sku}`
            initialCountData[key] = {
              productId: product.id,
              productName: product.name,
              productCode: product.code || '-',
              category: product.category,
              systemStock: variantStock,
              physicalCount: '',
              price: variant.price || price,
              isIngredient: false,
              warehouseStocks: product.warehouseStocks || [],
              trackSerials: product.trackSerials || false,
              // Datos de variante
              isVariantRow: true,
              variantSku: variant.sku,
              variantLabel,
              variantIndex: product.variants.indexOf(variant),
              allVariants: product.variants,
            }
          })
        } else {
          // Productos sin lotes ni variantes: fila normal
          initialCountData[product.id] = {
            productId: product.id,
            productName: product.name,
            productCode: product.code || '-',
            category: product.category,
            systemStock: warehouseStock,
            physicalCount: '',
            price,
            isIngredient: product.isIngredient || false,
            unit: product.isIngredient ? (product.purchaseUnit || 'und') : (product.unit || 'und'),
            warehouseStocks: product.warehouseStocks || [],
            trackSerials: product.trackSerials || false,
          }
        }
      }
    })
    setCountData(initialCountData)
    setSearchTerm('')
    setCategoryFilter('all')
    setDifferenceFilter('all')
    setInitialized(true)
  }

  // Resetear cuando se cierra el modal
  useEffect(() => {
    if (!isOpen) {
      setInitialized(false)
      setSelectedWarehouse(null)
      setShowWarehouseSelector(true)
      setCountData({})
    }
  }, [isOpen])

  // Manejar selección de almacén
  const handleSelectWarehouse = (warehouse) => {
    setSelectedWarehouse(warehouse)
    setShowWarehouseSelector(false)
    initializeCountData(warehouse.id)
  }

  // Calcular estadísticas cuando cambian los datos de conteo
  useEffect(() => {
    const stats = {
      totalProducts: Object.keys(countData).length,
      countedProducts: 0,
      productsWithDifference: 0,
      totalMissing: 0,
      totalSurplus: 0,
      totalMissingValue: 0,
      totalSurplusValue: 0,
    }

    Object.values(countData).forEach(item => {
      if (item.physicalCount !== '' && item.physicalCount !== null) {
        stats.countedProducts++
        const diff = parseFloat(item.physicalCount) - item.systemStock
        if (diff !== 0) {
          stats.productsWithDifference++
          if (diff < 0) {
            stats.totalMissing += Math.abs(diff)
            stats.totalMissingValue += Math.abs(diff) * item.price
          } else {
            stats.totalSurplus += diff
            stats.totalSurplusValue += diff * item.price
          }
        }
      }
    })

    // Redondear a 2 decimales para visualización
    stats.totalMissing = Math.round(stats.totalMissing * 100) / 100
    stats.totalSurplus = Math.round(stats.totalSurplus * 100) / 100
    stats.totalMissingValue = Math.round(stats.totalMissingValue * 100) / 100
    stats.totalSurplusValue = Math.round(stats.totalSurplusValue * 100) / 100

    setCountStats(stats)
  }, [countData])

  // Obtener nombre de categoría
  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Sin categoría'
    const category = categories.find(c => c.id === categoryId)
    return category?.name || categoryId
  }

  // Texto buscable por producto, con el MISMO criterio que el resto del sistema
  // (marca, categoría, descripción, principio activo, códigos sin guiones...).
  // Antes este buscador comparaba a mano y sin quitar tildes: "cafe" no
  // encontraba "Café" y no se podía buscar por marca.
  const productHaystacks = useMemo(() => {
    const map = new Map()
    for (const p of products) {
      map.set(p.id, p.isIngredient ? buildIngredientHaystack(p) : buildProductHaystack(p, { categories }))
    }
    return map
  }, [products, categories])

  // Haystack por FILA: el del producto + lo propio de la fila (lote, variante)
  const rowHaystacks = useMemo(() => {
    const map = new Map()
    for (const [key, item] of Object.entries(countData)) {
      map.set(key, buildSearchHaystack(
        productHaystacks.get(item.productId) || item.productName,
        item.productCode,
        item.variantSku,
        item.variantLabel,
        item.batchId,
      ))
    }
    return map
  }, [countData, productHaystacks])

  // Filtrar productos
  const filteredProducts = useMemo(() => {
    return Object.entries(countData).map(([key, item]) => ({ ...item, _countKey: key })).filter(item => {
      const matchesSearch = matchesPrebuilt(searchTerm, rowHaystacks.get(item._countKey) || '')

      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter
      const matchesItemType = itemTypeFilter === 'all'
        || (itemTypeFilter === 'products' && !item.isIngredient)
        || (itemTypeFilter === 'ingredients' && item.isIngredient)

      let matchesDifference = true
      if (differenceFilter !== 'all' && item.physicalCount !== '' && item.physicalCount !== null) {
        const diff = parseFloat(item.physicalCount) - item.systemStock
        if (differenceFilter === 'with_difference') {
          matchesDifference = diff !== 0
        } else if (differenceFilter === 'missing') {
          matchesDifference = diff < 0
        } else if (differenceFilter === 'surplus') {
          matchesDifference = diff > 0
        }
      } else if (differenceFilter !== 'all') {
        matchesDifference = false
      }

      return matchesSearch && matchesCategory && matchesDifference && matchesItemType
    })
    // Orden por nombre (clic en la cabecera "Producto"). `localeCompare` con
    // 'es' para que la Ñ y los acentos queden donde el usuario los busca:
    // con el orden por defecto de JS, "Ñandú" cae después de "Zapato".
    // Empate por nombre → desempata el lote, así las filas de un mismo
    // producto con varios lotes no bailan entre renders.
    .sort((a, b) => {
      if (!sortByName) return 0
      const cmp = String(a.productName || '').localeCompare(String(b.productName || ''), 'es', { sensitivity: 'base', numeric: true })
      if (cmp !== 0) return sortByName === 'asc' ? cmp : -cmp
      return String(a.batchId || '').localeCompare(String(b.batchId || ''), 'es', { numeric: true })
    })
  }, [countData, rowHaystacks, searchTerm, categoryFilter, differenceFilter, itemTypeFilter, sortByName])

  // La columna Lote solo existe si el recuento tiene filas de lote o stock sin
  // asignar; en negocios sin lotes era una columna entera de guiones.
  const hasLotColumn = useMemo(
    () => Object.values(countData).some(i => i.isBatchRow || i.isUnassignedStock),
    [countData]
  )

  // Manejar cambio en conteo físico
  const handleCountChange = (productId, value) => {
    if (value === '' || (!isNaN(value) && parseFloat(value) >= 0)) {
      setCountData(prev => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          physicalCount: value,
        }
      }))
    }
  }

  // Enter salta al siguiente input de conteo: quien cuenta con teclado o lector
  // va fila por fila sin tocar el mouse. Los inputs se marcan con data-count-input
  // y se recorren en el orden visual de la lista filtrada.
  const focusNextCountInput = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    // Solo los VISIBLES: la lista móvil y la tabla de escritorio existen ambas en
    // el DOM (se ocultan por CSS), así que sin este filtro el foco saltaría a un
    // input invisible del otro layout.
    const inputs = Array.from(document.querySelectorAll('input[data-count-input="1"]'))
      .filter(el => el.offsetParent !== null)
    const next = inputs[inputs.indexOf(e.currentTarget) + 1]
    if (next) {
      next.focus()
      next.select()
    }
  }

  // Copiar stock del sistema al conteo físico
  const handleCopySystemStock = (productId) => {
    setCountData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        physicalCount: prev[productId].systemStock.toString(),
      }
    }))
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

  // Limpiar todos los conteos
  const handleClearAll = () => {
    setCountData(prev => {
      const cleared = {}
      Object.keys(prev).forEach(key => {
        cleared[key] = {
          ...prev[key],
          physicalCount: '',
        }
      })
      return cleared
    })
  }

  // Copiar todos los stocks del sistema
  const handleCopyAllSystemStock = () => {
    setCountData(prev => {
      const copied = {}
      Object.keys(prev).forEach(key => {
        copied[key] = {
          ...prev[key],
          physicalCount: prev[key].systemStock.toString(),
        }
      })
      return copied
    })
  }

  // Calcular diferencia para un producto
  const getDifference = (item) => {
    if (item.physicalCount === '' || item.physicalCount === null) {
      return { diff: null, diffDisplay: null, value: null, status: 'pending' }
    }
    const diff = parseFloat(item.physicalCount) - item.systemStock
    const diffDisplay = Math.round(diff * 100) / 100
    const value = diff * item.price
    let status = 'equal'
    if (diff < 0) status = 'missing'
    else if (diff > 0) status = 'surplus'
    return { diff, diffDisplay, value, status }
  }

  // Generar reporte PDF
  const handleGenerateReport = () => {
    try {
      const countedItems = Object.values(countData).filter(
        item => item.physicalCount !== '' && item.physicalCount !== null
      )

      if (countedItems.length === 0) {
        toast.error('No hay productos contados para generar el reporte')
        return
      }

      generateInventoryCountPdf(countedItems, countStats, companySettings, categories)
      toast.success('Reporte generado exitosamente')
    } catch (error) {
      console.error('Error al generar reporte:', error)
      toast.error('Error al generar el reporte PDF')
    }
  }

  // Confirmar y aplicar cambios
  const handleApplyChanges = async () => {
    setIsApplying(true)

    try {
      const itemsToUpdate = Object.values(countData).filter(item => {
        if (item.physicalCount === '' || item.physicalCount === null) return false
        const diff = parseFloat(item.physicalCount) - item.systemStock
        return diff !== 0
      })

      if (itemsToUpdate.length === 0) {
        toast.info('No hay diferencias para aplicar')
        setShowConfirmModal(false)
        setIsApplying(false)
        return
      }

      let successCount = 0
      let errorCount = 0

      // Agrupar items de lotes por producto para actualizar todos los lotes de un producto juntos
      const batchItemsByProduct = {}
      const normalItems = []
      const unassignedItems = []

      const variantItems = []

      for (const item of itemsToUpdate) {
        if (item.isUnassignedStock) {
          unassignedItems.push(item)
        } else if (item.isBatchRow) {
          if (!batchItemsByProduct[item.productId]) batchItemsByProduct[item.productId] = []
          batchItemsByProduct[item.productId].push(item)
        } else if (item.isVariantRow) {
          variantItems.push(item)
        } else {
          normalItems.push(item)
        }
      }

      // Procesar stock sin lote asignado (ajustar solo stock del almacén)
      for (const item of unassignedItems) {
        try {
          const newStock = parseFloat(item.physicalCount)
          const difference = newStock - item.systemStock

          const currentWarehouseStocks = item.warehouseStocks || []
          let newWarehouseStocks = [...currentWarehouseStocks]
          const selectedIdx = newWarehouseStocks.findIndex(ws => ws.warehouseId === selectedWarehouse.id)
          const currentWhStock = selectedIdx >= 0 ? (newWarehouseStocks[selectedIdx].stock || 0) : 0

          if (selectedIdx >= 0) {
            newWarehouseStocks[selectedIdx] = { ...newWarehouseStocks[selectedIdx], stock: currentWhStock + difference }
          }

          const totalFromWarehouses = newWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)

          const result = await updateProduct(businessId, item.productId, {
            stock: totalFromWarehouses,
            warehouseStocks: newWarehouseStocks,
          })

          if (result.success) {
            await createStockMovement(businessId, {
              productId: item.productId,
              type: 'adjustment',
              quantity: difference,
              reason: 'Ajuste por recuento - stock sin lote',
              referenceType: 'inventory_count',
              previousStock: item.systemStock,
              newStock,
              userId,
              warehouseId: selectedWarehouse?.id || null,
              warehouseName: selectedWarehouse?.name || 'General',
              notes: `Recuento stock sin lote: ${Math.round(newStock * 100) / 100}, Sistema: ${Math.round(item.systemStock * 100) / 100}, Dif: ${difference > 0 ? '+' : ''}${Math.round(difference * 100) / 100} (${selectedWarehouse?.name || 'General'})`,
            })
            successCount++
          } else {
            errorCount++
          }
        } catch (error) {
          console.error(`Error al actualizar stock sin lote de ${item.productName}:`, error)
          errorCount++
        }
      }

      // Procesar productos con lotes (actualizar lotes + stock del almacén)
      for (const [productId, batchItems] of Object.entries(batchItemsByProduct)) {
        try {
          const firstItem = batchItems[0]
          const allBatches = [...(firstItem.allBatches || [])]

          let totalDifference = 0
          for (const batchItem of batchItems) {
            const newQty = parseFloat(batchItem.physicalCount)
            const diff = newQty - batchItem.systemStock
            totalDifference += diff

            // Actualizar cantidad del lote (matchear por batchId + warehouseId)
            const batchIdx = allBatches.findIndex(b =>
              (b.lotNumber || b.batchNumber || b.id) === batchItem.batchId &&
              (!b.warehouseId || b.warehouseId === selectedWarehouse.id)
            )
            if (batchIdx >= 0) {
              allBatches[batchIdx] = { ...allBatches[batchIdx], quantity: newQty, warehouseId: allBatches[batchIdx].warehouseId || selectedWarehouse.id }
            }
          }

          // Recalcular stock del almacén
          const currentWarehouseStocks = firstItem.warehouseStocks || []
          let newWarehouseStocks = [...currentWarehouseStocks]
          const selectedIdx = newWarehouseStocks.findIndex(ws => ws.warehouseId === selectedWarehouse.id)
          const currentWhStock = selectedIdx >= 0 ? (newWarehouseStocks[selectedIdx].stock || 0) : 0
          const newWhStock = currentWhStock + totalDifference

          if (selectedIdx >= 0) {
            newWarehouseStocks[selectedIdx] = { ...newWarehouseStocks[selectedIdx], stock: newWhStock }
          } else if (newWhStock > 0) {
            newWarehouseStocks.push({ warehouseId: selectedWarehouse.id, stock: newWhStock, minStock: 0 })
          }

          const totalFromWarehouses = newWarehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)

          // Actualizar fecha de vencimiento más próxima
          const activeBatches = allBatches.filter(b => b.quantity > 0 && (b.expirationDate || b.expiryDate))
          const batchUpdates = { batches: allBatches }
          if (activeBatches.length > 0) {
            activeBatches.sort((a, b) => {
              const dateA = (a.expirationDate || a.expiryDate)?.toDate?.() || new Date(a.expirationDate || a.expiryDate || '2099-12-31')
              const dateB = (b.expirationDate || b.expiryDate)?.toDate?.() || new Date(b.expirationDate || b.expiryDate || '2099-12-31')
              return dateA - dateB
            })
            batchUpdates.expirationDate = activeBatches[0].expirationDate || activeBatches[0].expiryDate
            batchUpdates.batchNumber = activeBatches[0].lotNumber || activeBatches[0].batchNumber
          } else {
            batchUpdates.expirationDate = null
            batchUpdates.batchNumber = null
          }

          const result = await updateProduct(businessId, productId, {
            stock: totalFromWarehouses,
            warehouseStocks: newWarehouseStocks,
            ...batchUpdates,
          })

          if (result.success) {
            // Crear un movimiento por cada lote ajustado
            for (const batchItem of batchItems) {
              const newQty = parseFloat(batchItem.physicalCount)
              const diff = newQty - batchItem.systemStock
              if (diff !== 0) {
                await createStockMovement(businessId, {
                  productId,
                  type: 'adjustment',
                  quantity: diff,
                  reason: 'Ajuste por recuento de inventario',
                  referenceType: 'inventory_count',
                  previousStock: batchItem.systemStock,
                  newStock: newQty,
                  userId,
                  warehouseId: selectedWarehouse?.id || null,
                  warehouseName: selectedWarehouse?.name || 'General',
                  batchNumber: batchItem.batchId,
                  notes: `Recuento lote ${batchItem.batchId}: ${Math.round(newQty * 100) / 100}, Sistema: ${Math.round(batchItem.systemStock * 100) / 100}, Dif: ${diff > 0 ? '+' : ''}${Math.round(diff * 100) / 100} (${selectedWarehouse?.name || 'General'})`,
                })
              }
            }
            successCount += batchItems.length
          } else {
            errorCount += batchItems.length
          }
        } catch (error) {
          console.error(`Error al actualizar lotes de producto:`, error)
          errorCount += batchItems.length
        }
      }

      // Procesar items de variantes (ajustar variant.warehouseStocks)
      // Agrupar variantes por producto para actualizar todas las variantes de un producto en una sola escritura
      const variantsByProduct = {}
      for (const item of variantItems) {
        if (!variantsByProduct[item.productId]) variantsByProduct[item.productId] = []
        variantsByProduct[item.productId].push(item)
      }

      for (const [productId, vItems] of Object.entries(variantsByProduct)) {
        try {
          const firstItem = vItems[0]
          const updatedVariants = [...(firstItem.allVariants || [])]

          for (const vItem of vItems) {
            const newStock = parseFloat(vItem.physicalCount)
            const diff = newStock - vItem.systemStock
            const vIdx = updatedVariants.findIndex(v => v.sku === vItem.variantSku)
            if (vIdx === -1) continue

            const variant = { ...updatedVariants[vIdx] }
            const ws = [...(variant.warehouseStocks || [])]
            const wsIdx = ws.findIndex(w => w.warehouseId === selectedWarehouse.id)

            if (wsIdx >= 0) {
              ws[wsIdx] = { ...ws[wsIdx], stock: newStock }
            } else if (newStock > 0) {
              ws.push({ warehouseId: selectedWarehouse.id, stock: newStock, minStock: 0 })
            }

            variant.warehouseStocks = ws
            variant.stock = ws.reduce((sum, w) => sum + (w.stock || 0), 0)
            updatedVariants[vIdx] = variant
          }

          // Sincronizar product.stock y product.warehouseStocks con la suma de variantes
          const aggregatedByWarehouse = {}
          updatedVariants.forEach(v => {
            const vws = v.warehouseStocks || []
            vws.forEach(ws => {
              if (!ws.warehouseId) return
              aggregatedByWarehouse[ws.warehouseId] = (aggregatedByWarehouse[ws.warehouseId] || 0) + (ws.stock || 0)
            })
          })
          const existingProductWS = firstItem.productWarehouseStocks || firstItem.warehouseStocks || []
          const newProductWarehouseStocks = []
          const seenWh = new Set()
          existingProductWS.forEach(ws => {
            if (!ws.warehouseId) return
            seenWh.add(ws.warehouseId)
            newProductWarehouseStocks.push({ ...ws, stock: aggregatedByWarehouse[ws.warehouseId] || 0 })
          })
          Object.entries(aggregatedByWarehouse).forEach(([whId, stock]) => {
            if (seenWh.has(whId)) return
            newProductWarehouseStocks.push({ warehouseId: whId, stock, minStock: 0 })
          })
          const newProductTotalStock = updatedVariants.reduce((sum, v) => sum + (v.stock || 0), 0)

          const result = await updateProduct(businessId, productId, {
            variants: updatedVariants,
            stock: newProductTotalStock,
            warehouseStocks: newProductWarehouseStocks,
          })

          if (result.success) {
            for (const vItem of vItems) {
              const newStock = parseFloat(vItem.physicalCount)
              const diff = newStock - vItem.systemStock
              if (diff !== 0) {
                await createStockMovement(businessId, {
                  productId,
                  type: 'adjustment',
                  quantity: diff,
                  reason: 'Ajuste por recuento de inventario',
                  referenceType: 'inventory_count',
                  previousStock: vItem.systemStock,
                  newStock,
                  userId,
                  warehouseId: selectedWarehouse?.id || null,
                  warehouseName: selectedWarehouse?.name || 'General',
                  variantSku: vItem.variantSku,
                  notes: `Recuento variante ${vItem.variantSku} (${vItem.variantLabel}): ${Math.round(newStock * 100) / 100}, Sistema: ${Math.round(vItem.systemStock * 100) / 100}, Dif: ${diff > 0 ? '+' : ''}${Math.round(diff * 100) / 100} (${selectedWarehouse?.name || 'General'})`,
                })
              }
            }
            successCount += vItems.length
          } else {
            errorCount += vItems.length
          }
        } catch (error) {
          console.error('Error al actualizar variantes:', error)
          errorCount += vItems.length
        }
      }

      // Procesar items normales (sin lotes ni variantes)
      for (const item of normalItems) {
        try {
          const newStock = parseFloat(item.physicalCount)
          const difference = newStock - item.systemStock

          let result
          if (item.isIngredient) {
            // Actualizar warehouseStocks para ingredientes igual que productos
            const currentIngredientWarehouseStocks = item.warehouseStocks || []
            let newIngredientWarehouseStocks = [...currentIngredientWarehouseStocks]

            const ingredientWarehouseIdx = newIngredientWarehouseStocks.findIndex(
              ws => ws.warehouseId === selectedWarehouse.id
            )

            if (ingredientWarehouseIdx >= 0) {
              newIngredientWarehouseStocks[ingredientWarehouseIdx] = {
                ...newIngredientWarehouseStocks[ingredientWarehouseIdx],
                stock: newStock
              }
            } else {
              if (newStock > 0) {
                newIngredientWarehouseStocks.push({
                  warehouseId: selectedWarehouse.id,
                  stock: newStock
                })
              }
            }

            const totalIngredientStock = newIngredientWarehouseStocks.reduce(
              (sum, ws) => sum + (ws.stock || 0), 0
            )

            result = await updateIngredient(businessId, item.productId, {
              currentStock: totalIngredientStock,
              warehouseStocks: newIngredientWarehouseStocks
            })
          } else {
            const currentWarehouseStocks = item.warehouseStocks || []
            let newWarehouseStocks = [...currentWarehouseStocks]

            const selectedIdx = newWarehouseStocks.findIndex(
              ws => ws.warehouseId === selectedWarehouse.id
            )

            if (selectedIdx >= 0) {
              newWarehouseStocks[selectedIdx] = {
                ...newWarehouseStocks[selectedIdx],
                stock: newStock
              }
            } else {
              if (newStock > 0) {
                newWarehouseStocks.push({
                  warehouseId: selectedWarehouse.id,
                  stock: newStock,
                  minStock: 0
                })
              }
            }

            const totalFromWarehouses = newWarehouseStocks.reduce(
              (sum, ws) => sum + (ws.stock || 0), 0
            )

            result = await updateProduct(businessId, item.productId, {
              stock: totalFromWarehouses,
              warehouseStocks: newWarehouseStocks
            })
          }

          if (result.success) {
            await createStockMovement(businessId, {
              productId: item.productId,
              type: 'adjustment',
              quantity: difference,
              reason: 'Ajuste por recuento de inventario',
              referenceType: 'inventory_count',
              previousStock: item.systemStock,
              newStock: newStock,
              userId: userId,
              isIngredient: item.isIngredient,
              warehouseId: selectedWarehouse?.id || null,
              warehouseName: selectedWarehouse?.name || 'General',
              notes: `Recuento físico: ${Math.round(newStock * 100) / 100}, Stock sistema: ${Math.round(item.systemStock * 100) / 100}, Diferencia: ${difference > 0 ? '+' : ''}${Math.round(difference * 100) / 100} (Almacén: ${selectedWarehouse?.name || 'General'})`,
            })
            successCount++
          } else {
            errorCount++
          }
        } catch (error) {
          console.error(`Error al actualizar ${item.productName}:`, error)
          errorCount++
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} item(s) actualizado(s) exitosamente`)

        // Guardar sesión de recuento en el historial
        try {
          const countSessionData = {
            userId: userId,
            totalProductsCounted: countStats.countedProducts,
            productsWithDifference: countStats.productsWithDifference,
            totalMissing: countStats.totalMissing,
            totalSurplus: countStats.totalSurplus,
            totalMissingValue: countStats.totalMissingValue,
            totalSurplusValue: countStats.totalSurplusValue,
            itemsAdjusted: itemsToUpdate.map(item => ({
              productId: item.productId,
              productName: item.productName,
              productCode: item.productCode,
              previousStock: item.systemStock,
              newStock: parseFloat(item.physicalCount),
              difference: parseFloat(item.physicalCount) - item.systemStock,
              price: item.price,
              isIngredient: item.isIngredient || false,
              ...(item.isBatchRow && { batchNumber: item.batchId }),
            })),
            status: errorCount > 0 ? 'partial' : 'completed',
            successCount,
            errorCount,
          }

          await createInventoryCount(businessId, countSessionData)
        } catch (historyError) {
          console.error('Error al guardar historial de recuento:', historyError)
          // No mostrar error al usuario ya que los ajustes sí se aplicaron
        }
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} item(s) no pudieron ser actualizados`)
      }

      setShowConfirmModal(false)

      if (onCountCompleted) {
        onCountCompleted()
      }

      onClose()
    } catch (error) {
      console.error('Error al aplicar cambios:', error)
      toast.error('Error al aplicar los cambios')
    } finally {
      setIsApplying(false)
    }
  }

  // Obtener productos con diferencias para el modal de confirmación
  const getProductsWithDifferences = () => {
    return Object.values(countData).filter(item => {
      if (item.physicalCount === '' || item.physicalCount === null) return false
      const diff = parseFloat(item.physicalCount) - item.systemStock
      return diff !== 0
    })
  }

  return (
    <>
      {/* La pantalla de conteo si necesita todo el ancho (tabla larga); elegir
          almacen es una lista corta y a pantalla completa se veia perdida. */}
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={showWarehouseSelector ? "Seleccionar Almacén" : `Recuento: ${selectedWarehouse?.name || ''}`}
        size={showWarehouseSelector ? 'lg' : 'full'}
      >
        {/* Pantalla de selección de almacén */}
        {showWarehouseSelector ? (
          (() => {
            // Almacenes de la sucursal elegida en el header. Si esa sede no
            // tiene ninguno, se muestran todos en vez de dejar la pantalla
            // vacia: el recuento es una tarea puntual y bloquearla seria peor.
            const acotados = (!branchScope || branchScope === 'all')
              ? warehouses
              : warehouses.filter(w => (w.branchId || 'main') === branchScope)
            const visibles = acotados.length > 0 ? acotados : warehouses
            const filtrando = visibles !== warehouses

            const nombreSede = (w) => (w.branchId
              ? (branches.find(b => b.id === w.branchId)?.name || 'Otra sucursal')
              : (businessSettings?.mainBranchName || 'Sucursal Principal'))

            const stockDe = (w) => products.reduce((sum, p) => {
              const ws = p.warehouseStocks?.find(x => x.warehouseId === w.id)
              return sum + (ws?.stock || 0)
            }, 0)

            // Agrupado por sede: sin esto, con varias sucursales la lista eran
            // nombres sueltos ("Almacen 1", "Almacen 2") sin decir de donde son.
            const grupos = []
            if (branches.length > 0) {
              const principal = visibles.filter(w => !w.branchId)
              if (principal.length > 0) {
                grupos.push({ key: 'main', nombre: nombreSede(principal[0]), almacenes: principal })
              }
              branches.forEach(b => {
                const suyos = visibles.filter(w => w.branchId === b.id)
                if (suyos.length > 0) grupos.push({ key: b.id, nombre: b.name, almacenes: suyos })
              })
              // Almacenes de sedes que ya no existen o sin acceso.
              const ubicados = new Set(grupos.flatMap(g => g.almacenes.map(w => w.id)))
              const sueltos = visibles.filter(w => !ubicados.has(w.id))
              if (sueltos.length > 0) {
                grupos.push({ key: 'otros', nombre: 'Otras sucursales', almacenes: sueltos })
              }
            }

            const tarjeta = (warehouse) => (
              <button
                key={warehouse.id}
                onClick={() => handleSelectWarehouse(warehouse)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-all group text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary-200">
                    <Warehouse className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{warehouse.name}</p>
                    <p className="text-xs text-gray-500">
                      {Math.round(stockDe(warehouse) * 100) / 100} unidades
                      {branches.length === 0 ? '' : ` · ${nombreSede(warehouse)}`}
                    </p>
                  </div>
                </div>
                <ArrowLeft className="w-4 h-4 rotate-180 text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            )

            return (
              <div className="py-2">
                <div className="text-center mb-4">
                  <Warehouse className="w-10 h-10 text-primary-500 mx-auto mb-2" />
                  <h3 className="text-lg font-semibold text-gray-900">¿Qué almacén vas a contar?</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Solo se mostrará y actualizará el stock de ese almacén.
                  </p>
                </div>

                {warehouses.length === 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <AlertTriangle className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                    <p className="text-yellow-800 font-medium">No hay almacenes configurados</p>
                    <p className="text-yellow-700 text-sm mt-1">
                      Configura al menos un almacén en la sección de Inventario para poder hacer recuentos.
                    </p>
                  </div>
                ) : (
                  <>
                    {filtrando && (
                      <p className="text-xs text-gray-500 mb-2">
                        Almacenes de la sucursal seleccionada arriba.
                      </p>
                    )}
                    <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-3">
                      {grupos.length > 0 ? grupos.map(g => (
                        <div key={g.key}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 truncate" title={g.nombre}>
                            {g.nombre}
                          </p>
                          <div className="space-y-1.5">
                            {g.almacenes.map(tarjeta)}
                          </div>
                        </div>
                      )) : (
                        <div className="space-y-1.5">{visibles.map(tarjeta)}</div>
                      )}
                    </div>
                  </>
                )}

                <div className="flex justify-end mt-4">
                  <Button variant="outline" onClick={onClose}>Cancelar</Button>
                </div>
              </div>
            )
          })()
        ) : (
        <div className="flex flex-col h-[calc(100vh-120px)] md:h-[calc(100vh-160px)]">
          {/* Barra de progreso del conteo. Reemplaza las 7 tarjetas de
              estadísticas: el usuario trabaja en la lista, arriba solo necesita
              saber cuánto lleva y si hay diferencias. Los chips solo aparecen
              cuando existen faltantes/sobrantes y al tocarlos FILTRAN la lista. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3 flex-shrink-0">
            <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
              Contados {countStats.countedProducts}/{countStats.totalProducts}
            </span>
            <div className="flex-1 min-w-[70px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${countStats.totalProducts > 0 ? Math.round((countStats.countedProducts / countStats.totalProducts) * 100) : 0}%` }}
              />
            </div>
            {countStats.totalMissing > 0 && (
              <button
                onClick={() => setDifferenceFilter(prev => prev === 'missing' ? 'all' : 'missing')}
                title="Ver solo los productos con faltante"
                className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
                  differenceFilter === 'missing'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                }`}
              >
                −{countStats.totalMissing} faltan · {formatCurrency(countStats.totalMissingValue)}
              </button>
            )}
            {countStats.totalSurplus > 0 && (
              <button
                onClick={() => setDifferenceFilter(prev => prev === 'surplus' ? 'all' : 'surplus')}
                title="Ver solo los productos con sobrante"
                className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
                  differenceFilter === 'surplus'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                }`}
              >
                +{countStats.totalSurplus} sobran · {formatCurrency(countStats.totalSurplusValue)}
              </button>
            )}
          </div>

          {/* Filtros en una sola fila (el filtro por diferencia son los chips
              de la barra de arriba). En móvil el buscador toma su propia línea. */}
          <div className="flex-shrink-0 mb-3 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            {/* Solo en la app: el escaner usa la camara del dispositivo */}
            {Capacitor.isNativePlatform() && (
              <button
                onClick={handleScanBarcode}
                disabled={isScanning}
                className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                title="Escanear código de barras"
              >
                {isScanning ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ScanBarcode className="w-5 h-5" />
                )}
              </button>
            )}
            <select
              value={itemTypeFilter}
              onChange={e => setItemTypeFilter(e.target.value)}
              className="min-w-[90px] px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Todo</option>
              <option value="products">Productos</option>
              <option value="ingredients">Insumos</option>
            </select>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="min-w-[110px] px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Categorías</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            {/* Orden alfabético también en móvil, donde la tabla (y su cabecera
                clicable) no existe: ahí la lista son tarjetas. */}
            <button
              type="button"
              onClick={() => setSortByName(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
              className={`md:hidden px-3 py-2 text-sm rounded-lg border transition-colors flex items-center gap-1.5 ${
                sortByName ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-gray-300 text-gray-600'
              }`}
              title="Ordenar por nombre"
            >
              {sortByName === 'asc' ? <ArrowUp className="w-4 h-4" />
                : sortByName === 'desc' ? <ArrowDown className="w-4 h-4" />
                : <ArrowUpDown className="w-4 h-4" />}
              A-Z
            </button>
            <button
              onClick={handleCopyAllSystemStock}
              className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              title="Copiar todo el stock del sistema"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={handleClearAll}
              className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              title="Limpiar todos los conteos"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Lista de productos - Scrollable */}
          <div className="flex-1 overflow-auto border border-gray-200 rounded-lg min-h-0">
            {/* Vista móvil: Cards */}
            <div className="md:hidden divide-y divide-gray-200">
              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  {searchTerm || categoryFilter !== 'all' || differenceFilter !== 'all'
                    ? 'No se encontraron productos'
                    : 'No hay productos con control de stock'}
                </div>
              ) : (
                filteredProducts.map(item => {
                  const { diff, diffDisplay, value, status } = getDifference(item)
                  const mobileKey = item._countKey || (item.isBatchRow ? `${item.productId}_batch_${item.batchId}` : item.isVariantRow ? `${item.productId}_variant_${item.variantSku}` : item.productId)
                  // Mismo criterio de color que la tabla: verde = cuadra,
                  // ámbar = con diferencia
                  const cardTint = status === 'equal'
                    ? 'bg-green-50/60'
                    : (status === 'missing' || status === 'surplus')
                    ? 'bg-amber-50/70'
                    : item.isBatchRow ? 'bg-amber-50/30'
                    : item.isUnassignedStock ? 'bg-red-50/30'
                    : item.isVariantRow ? 'bg-purple-50/30'
                    : 'bg-white'
                  return (
                    <div key={mobileKey} className={`p-3 ${cardTint}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.productName}</p>
                          <p className="text-xs text-gray-500">{item.productCode}</p>
                          {item.isVariantRow && (
                            <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                              {item.variantSku} — {item.variantLabel}
                            </span>
                          )}
                          {item.isBatchRow && (
                            <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                              Lote: {item.batchId}
                            </span>
                          )}
                          {item.isUnassignedStock && (
                            <span className="text-xs font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                              Sin lote asignado
                            </span>
                          )}
                        </div>
                        <div className="text-right ml-2">
                          <p className="text-xs text-gray-500">Sistema</p>
                          <p className="font-semibold text-gray-700">
                            {Math.round(item.systemStock * 100) / 100}
                            {item.isIngredient && item.unit && item.unit !== 'und' && (
                              <span className="text-xs font-normal text-gray-400 ml-1">{item.unit}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.trackSerials ? (
                          <div className="flex-1 px-3 py-2 text-center text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-lg">
                            Gestionar desde merma por serie
                          </div>
                        ) : (
                        <>
                        <div className="flex-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={item.physicalCount}
                            onChange={e => handleCountChange(item._countKey, e.target.value)}
                            onKeyDown={focusNextCountInput}
                            onFocus={e => e.target.select()}
                            data-count-input="1"
                            placeholder="Conteo físico"
                            className={`w-full px-3 py-2 text-center text-lg font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                              status === 'missing' ? 'border-red-300 bg-red-50' :
                              status === 'surplus' ? 'border-green-300 bg-green-50' :
                              status === 'equal' ? 'border-green-300 bg-green-50' :
                              'border-gray-300'
                            }`}
                          />
                        </div>
                        <button
                          onClick={() => handleCopySystemStock(item._countKey)}
                          className="p-2 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-lg"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                        {diff !== null && (
                          <div className={`px-3 py-2 rounded-lg text-center min-w-[60px] ${
                            status === 'missing' ? 'bg-red-100 text-red-700' :
                            status === 'surplus' ? 'bg-green-100 text-green-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            <p className="font-bold">{diffDisplay > 0 ? '+' : ''}{diffDisplay}</p>
                          </div>
                        )}
                        </>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Vista desktop: Tabla */}
            <table className="hidden md:table w-full">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  {/* Producto: clic alterna A-Z → Z-A → orden natural */}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    <button
                      type="button"
                      onClick={() => setSortByName(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                      className="inline-flex items-center gap-1 uppercase hover:text-gray-700 transition-colors"
                      title={
                        sortByName === 'asc' ? 'Ordenado A-Z. Clic para Z-A'
                          : sortByName === 'desc' ? 'Ordenado Z-A. Clic para volver al orden original'
                          : 'Clic para ordenar alfabéticamente'
                      }
                    >
                      Producto
                      {sortByName === 'asc' ? <ArrowUp className="w-3 h-3" />
                        : sortByName === 'desc' ? <ArrowDown className="w-3 h-3" />
                        : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                    </button>
                  </th>
                  {hasLotColumn && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lote</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sistema</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Conteo</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Dif.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={hasLotColumn ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                      {searchTerm || categoryFilter !== 'all' || differenceFilter !== 'all'
                        ? 'No se encontraron productos con los filtros aplicados'
                        : 'No hay productos con control de stock'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(item => {
                    const { diff, diffDisplay, value, status } = getDifference(item)
                    const itemKey = item._countKey || (item.isBatchRow ? `${item.productId}_batch_${item.batchId}` : item.isVariantRow ? `${item.productId}_variant_${item.variantSku}` : item.productId)
                    // Fila pintada por estado del conteo: verde = cuadra, ámbar =
                    // con diferencia. Se ve de un vistazo qué va contado sin mirar
                    // los números de arriba. Sin contar, conserva el tinte especial
                    // de lote/variante/sin-asignar.
                    const rowTint = status === 'equal'
                      ? 'bg-green-50/60'
                      : (status === 'missing' || status === 'surplus')
                      ? 'bg-amber-50/70'
                      : item.isBatchRow ? 'bg-amber-50/30'
                      : item.isUnassignedStock ? 'bg-red-50/30'
                      : item.isVariantRow ? 'bg-purple-50/30'
                      : ''
                    return (
                      <tr key={itemKey} className={`hover:bg-gray-50 ${rowTint}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm">{item.productCode}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-sm">{item.productName}</span>
                          {item.isVariantRow && (
                            <span className="ml-2 text-xs font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                              {item.variantSku} — {item.variantLabel}
                            </span>
                          )}
                        </td>
                        {hasLotColumn && (
                        <td className="px-4 py-3">
                          {item.isBatchRow ? (
                            <div>
                              <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{item.batchId}</span>
                              {item.batchExpiration && (
                                <div className="text-[10px] text-gray-500 mt-0.5">
                                  Vence: {(() => {
                                    const d = item.batchExpiration
                                    if (d?.toDate) return d.toDate().toLocaleDateString('es-PE')
                                    if (d?.seconds) return new Date(d.seconds * 1000).toLocaleDateString('es-PE')
                                    return new Date(d).toLocaleDateString('es-PE')
                                  })()}
                                </div>
                              )}
                            </div>
                          ) : item.isUnassignedStock ? (
                            <span className="text-xs font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Sin lote asignado</span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        )}
                        <td className="px-4 py-3">
                          <Badge variant="default" className="text-xs">
                            {getCategoryName(item.category)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-gray-700">{Math.round(item.systemStock * 100) / 100}</span>
                          {item.isIngredient && item.unit && item.unit !== 'und' && (
                            <span className="text-xs text-gray-400 ml-1">{item.unit}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.trackSerials ? (
                            <div className="text-center text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-2 py-2">
                              Gestionar por serie
                            </div>
                          ) : (
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.physicalCount}
                              onChange={e => handleCountChange(item._countKey, e.target.value)}
                              onKeyDown={focusNextCountInput}
                              onFocus={e => e.target.select()}
                              data-count-input="1"
                              placeholder="-"
                              className={`w-24 px-3 py-2 text-center text-base font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                                status === 'missing' ? 'border-red-300 bg-red-50' :
                                status === 'surplus' ? 'border-green-300 bg-green-50' :
                                status === 'equal' ? 'border-green-300 bg-green-50' :
                                'border-gray-300'
                              }`}
                            />
                            <button
                              onClick={() => handleCopySystemStock(item._countKey)}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                              title="Copiar stock del sistema"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          </div>
                          )}
                        </td>
                        {/* Dif. y Valor solo muestran algo cuando la fila fue contada:
                            menos guiones, menos ruido */}
                        <td className="px-4 py-3 text-center">
                          {!item.trackSerials && diff !== null && (
                            <div className="flex items-center justify-center gap-1">
                              {status === 'missing' && <MinusCircle className="w-4 h-4 text-red-500" />}
                              {status === 'surplus' && <PlusCircle className="w-4 h-4 text-green-500" />}
                              {status === 'equal' && <CheckCircle className="w-4 h-4 text-green-500" />}
                              <span className={`font-bold ${
                                status === 'missing' ? 'text-red-600' :
                                status === 'surplus' ? 'text-green-600' :
                                'text-green-600'
                              }`}>
                                {diffDisplay > 0 ? '+' : ''}{diffDisplay}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {value !== null && value !== 0 && (
                            <span className={`font-semibold ${
                              value < 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {formatCurrency(Math.abs(value))}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer con acciones - Fixed en móvil */}
          <div className="flex-shrink-0 pt-3 mt-3 border-t bg-white">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
              <p className="text-xs text-gray-500 hidden sm:block">
                {filteredProducts.length} de {countStats.totalProducts} productos
              </p>
              <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={onClose} className="flex-1 sm:flex-none">
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateReport}
                  disabled={countStats.countedProducts === 0}
                  className="flex-1 sm:flex-none"
                >
                  <Download className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Generar </span>PDF
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={countStats.productsWithDifference === 0}
                  className="flex-1 sm:flex-none"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Aplicar ({countStats.productsWithDifference})
                </Button>
              </div>
            </div>
          </div>
        </div>
        )}
      </Modal>

      {/* Modal de confirmación */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirmar Ajuste"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-yellow-800 text-sm">¿Estás seguro?</h4>
                <p className="text-xs text-yellow-700 mt-1">
                  Se actualizará el stock de {countStats.productsWithDifference} producto(s).
                </p>
              </div>
            </div>
          </div>

          <div className="max-h-48 overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left text-xs">Producto</th>
                  <th className="px-2 py-2 text-center text-xs">Actual</th>
                  <th className="px-2 py-2 text-center text-xs">Nuevo</th>
                  <th className="px-2 py-2 text-center text-xs">Dif.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {getProductsWithDifferences().map(item => {
                  const diff = Math.round((parseFloat(item.physicalCount) - item.systemStock) * 100) / 100
                  const confirmKey = item.isBatchRow ? `${item.productId}_batch_${item.batchId}` : item.productId
                  return (
                    <tr key={confirmKey}>
                      <td className="px-2 py-2 text-xs">
                        {item.productName}
                        {item.isBatchRow && <span className="ml-1 text-amber-600 font-semibold">[{item.batchId}]</span>}
                        {item.isUnassignedStock && <span className="ml-1 text-red-600 font-semibold">[Sin lote]</span>}
                      </td>
                      <td className="px-2 py-2 text-center text-xs">{item.systemStock}</td>
                      <td className="px-2 py-2 text-center text-xs font-semibold">{item.physicalCount}</td>
                      <td className={`px-2 py-2 text-center text-xs font-bold ${diff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {diff > 0 ? '+' : ''}{diff}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg text-sm">
            <div>
              <p className="text-xs text-gray-600">Faltantes</p>
              <p className="font-bold text-red-600">-{countStats.totalMissing}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Sobrantes</p>
              <p className="font-bold text-green-600">+{countStats.totalSurplus}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={isApplying}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleApplyChanges}
              disabled={isApplying}
              className="flex-1 bg-primary-600 hover:bg-primary-700"
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Aplicando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirmar
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
