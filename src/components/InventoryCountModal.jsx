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
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { updateProduct } from '@/services/firestoreService'
import { updateIngredient } from '@/services/ingredientService'
import { createStockMovement, createInventoryCount } from '@/services/warehouseService'
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
  defaultWarehouse = null,
  onCountCompleted,
}) {
  const toast = useToast()

  // Estado principal del conteo
  const [countData, setCountData] = useState({})
  const [isApplying, setIsApplying] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [differenceFilter, setDifferenceFilter] = useState('all')
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

  // Calcular el stock real de un producto
  // Prioridad: suma de warehouseStocks > stock general
  const getRealStock = (product) => {
    const warehouseStocks = product.warehouseStocks || []
    if (warehouseStocks.length > 0) {
      const warehouseTotal = warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
      // Si hay datos en warehouseStocks, usar esa suma
      if (warehouseTotal > 0 || product.stock === 0) {
        return warehouseTotal
      }
    }
    // Si no hay warehouseStocks o suma 0, usar stock general
    return product.stock || 0
  }

  // Inicializar datos de conteo solo cuando el modal se ABRE (no cuando products cambia)
  useEffect(() => {
    if (isOpen && !initialized && products.length > 0) {
      const initialCountData = {}
      products.forEach(product => {
        if (product.stock !== null && product.stock !== undefined) {
          // Usar el stock real (del almacén si existe, o general si no)
          const realStock = getRealStock(product)

          initialCountData[product.id] = {
            productId: product.id,
            productName: product.name,
            productCode: product.code || '-',
            category: product.category,
            systemStock: realStock,
            physicalCount: '',
            price: product.price || 0,
            isIngredient: product.isIngredient || false,
            // Guardar warehouseStocks original para actualizar correctamente
            warehouseStocks: product.warehouseStocks || [],
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
    if (!isOpen && initialized) {
      setInitialized(false)
    }
  }, [isOpen, products, initialized])

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

    setCountStats(stats)
  }, [countData])

  // Obtener nombre de categoría
  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Sin categoría'
    const category = categories.find(c => c.id === categoryId)
    return category?.name || categoryId
  }

  // Filtrar productos
  const filteredProducts = useMemo(() => {
    return Object.values(countData).filter(item => {
      const matchesSearch =
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productCode.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter

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

      return matchesSearch && matchesCategory && matchesDifference
    })
  }, [countData, searchTerm, categoryFilter, differenceFilter])

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
      return { diff: null, value: null, status: 'pending' }
    }
    const diff = parseFloat(item.physicalCount) - item.systemStock
    const value = diff * item.price
    let status = 'equal'
    if (diff < 0) status = 'missing'
    else if (diff > 0) status = 'surplus'
    return { diff, value, status }
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

      for (const item of itemsToUpdate) {
        try {
          const newStock = parseFloat(item.physicalCount)
          const difference = newStock - item.systemStock

          let result
          if (item.isIngredient) {
            // Actualizar insumo (los insumos no usan warehouseStocks)
            result = await updateIngredient(businessId, item.productId, {
              stock: newStock,
            })
          } else {
            // Actualizar producto - incluir warehouseStocks si existe almacén por defecto
            const updateData = { stock: newStock }

            // Si hay almacenes configurados, actualizar también warehouseStocks
            if (defaultWarehouse && warehouses.length > 0) {
              // Calcular la diferencia y aplicarla al almacén por defecto
              // Esto asegura que el stock esté disponible en el POS
              const currentWarehouseStocks = item.warehouseStocks || []
              let newWarehouseStocks = [...currentWarehouseStocks]

              // Buscar si el almacén por defecto ya existe en warehouseStocks
              const defaultIdx = newWarehouseStocks.findIndex(
                ws => ws.warehouseId === defaultWarehouse.id
              )

              if (defaultIdx >= 0) {
                // Aplicar la diferencia al almacén por defecto
                const currentWarehouseStock = newWarehouseStocks[defaultIdx].stock || 0
                newWarehouseStocks[defaultIdx] = {
                  ...newWarehouseStocks[defaultIdx],
                  stock: Math.max(0, currentWarehouseStock + difference)
                }
              } else if (difference > 0) {
                // Si hay incremento y no existe el almacén, crear entrada
                newWarehouseStocks.push({
                  warehouseId: defaultWarehouse.id,
                  stock: difference,
                  minStock: 0
                })
              } else {
                // Si hay decremento pero no hay almacén default, distribuir proporcionalmente
                // o simplemente actualizar stock general (el POS usará getOrphanStock)
              }

              // Recalcular stock total desde warehouseStocks
              const totalFromWarehouses = newWarehouseStocks.reduce(
                (sum, ws) => sum + (ws.stock || 0), 0
              )

              // Si hay diferencia, ajustar para que coincida con newStock
              if (totalFromWarehouses !== newStock && newWarehouseStocks.length > 0) {
                // Ajustar el almacén por defecto para que el total coincida
                const adjustmentNeeded = newStock - totalFromWarehouses
                const defIdx = newWarehouseStocks.findIndex(
                  ws => ws.warehouseId === defaultWarehouse.id
                )
                if (defIdx >= 0) {
                  newWarehouseStocks[defIdx].stock = Math.max(
                    0,
                    (newWarehouseStocks[defIdx].stock || 0) + adjustmentNeeded
                  )
                }
              }

              updateData.warehouseStocks = newWarehouseStocks
            }

            result = await updateProduct(businessId, item.productId, updateData)
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
              notes: `Recuento físico: ${newStock}, Stock sistema: ${item.systemStock}, Diferencia: ${difference > 0 ? '+' : ''}${difference}`,
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
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Recuento de Inventario"
        size="full"
      >
        <div className="flex flex-col h-[calc(100vh-120px)] md:h-[calc(100vh-160px)]">
          {/* Header con estadísticas - Compacto en móvil */}
          <div className="bg-gray-50 p-2 md:p-4 rounded-lg mb-3 flex-shrink-0">
            {/* Vista móvil: 2x2 grid con las estadísticas principales */}
            <div className="grid grid-cols-2 gap-2 md:hidden">
              <div className="bg-white p-2 rounded-lg shadow-sm text-center">
                <p className="text-[10px] text-gray-500">Contados</p>
                <p className="text-lg font-bold text-blue-600">{countStats.countedProducts}/{countStats.totalProducts}</p>
              </div>
              <div className="bg-white p-2 rounded-lg shadow-sm text-center">
                <p className="text-[10px] text-gray-500">Con Diferencia</p>
                <p className="text-lg font-bold text-orange-600">{countStats.productsWithDifference}</p>
              </div>
              <div className="bg-white p-2 rounded-lg shadow-sm text-center">
                <p className="text-[10px] text-gray-500">Faltantes</p>
                <p className="text-sm font-bold text-red-600">-{countStats.totalMissing} ({formatCurrency(countStats.totalMissingValue)})</p>
              </div>
              <div className="bg-white p-2 rounded-lg shadow-sm text-center">
                <p className="text-[10px] text-gray-500">Sobrantes</p>
                <p className="text-sm font-bold text-green-600">+{countStats.totalSurplus} ({formatCurrency(countStats.totalSurplusValue)})</p>
              </div>
            </div>

            {/* Vista desktop: 7 columnas */}
            <div className="hidden md:grid md:grid-cols-7 gap-3 text-center">
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-500">Total Productos</p>
                <p className="text-xl font-bold text-gray-900">{countStats.totalProducts}</p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-500">Contados</p>
                <p className="text-xl font-bold text-blue-600">{countStats.countedProducts}</p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-500">Con Diferencia</p>
                <p className="text-xl font-bold text-orange-600">{countStats.productsWithDifference}</p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-500">Faltantes</p>
                <p className="text-xl font-bold text-red-600">-{countStats.totalMissing}</p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-500">Sobrantes</p>
                <p className="text-xl font-bold text-green-600">+{countStats.totalSurplus}</p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-500">Valor Faltante</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(countStats.totalMissingValue)}</p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-500">Valor Sobrante</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(countStats.totalSurplusValue)}</p>
              </div>
            </div>
          </div>

          {/* Filtros - Compacto en móvil */}
          <div className="flex-shrink-0 mb-3 space-y-2">
            {/* Búsqueda */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar producto..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
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
            </div>

            {/* Filtros y botones de acción */}
            <div className="flex flex-wrap gap-2">
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="flex-1 min-w-[120px] px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Categorías</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <select
                value={differenceFilter}
                onChange={e => setDifferenceFilter(e.target.value)}
                className="flex-1 min-w-[100px] px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Todos</option>
                <option value="with_difference">Con dif.</option>
                <option value="missing">Faltantes</option>
                <option value="surplus">Sobrantes</option>
              </select>
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
                  const { diff, value, status } = getDifference(item)
                  return (
                    <div key={item.productId} className="p-3 bg-white">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.productName}</p>
                          <p className="text-xs text-gray-500">{item.productCode}</p>
                        </div>
                        <div className="text-right ml-2">
                          <p className="text-xs text-gray-500">Sistema</p>
                          <p className="font-semibold text-gray-700">{item.systemStock}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={item.physicalCount}
                            onChange={e => handleCountChange(item.productId, e.target.value)}
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
                          onClick={() => handleCopySystemStock(item.productId)}
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
                            <p className="font-bold">{diff > 0 ? '+' : ''}{diff}</p>
                          </div>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
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
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                      {searchTerm || categoryFilter !== 'all' || differenceFilter !== 'all'
                        ? 'No se encontraron productos con los filtros aplicados'
                        : 'No hay productos con control de stock'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(item => {
                    const { diff, value, status } = getDifference(item)
                    return (
                      <tr key={item.productId} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm">{item.productCode}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-sm">{item.productName}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="default" className="text-xs">
                            {getCategoryName(item.category)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-gray-700">{item.systemStock}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.physicalCount}
                              onChange={e => handleCountChange(item.productId, e.target.value)}
                              placeholder="-"
                              className={`w-20 px-3 py-2 text-center border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                                status === 'missing' ? 'border-red-300 bg-red-50' :
                                status === 'surplus' ? 'border-green-300 bg-green-50' :
                                status === 'equal' ? 'border-green-300 bg-green-50' :
                                'border-gray-300'
                              }`}
                            />
                            <button
                              onClick={() => handleCopySystemStock(item.productId)}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                              title="Copiar stock del sistema"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {diff !== null ? (
                            <div className="flex items-center justify-center gap-1">
                              {status === 'missing' && <MinusCircle className="w-4 h-4 text-red-500" />}
                              {status === 'surplus' && <PlusCircle className="w-4 h-4 text-green-500" />}
                              {status === 'equal' && <CheckCircle className="w-4 h-4 text-green-500" />}
                              <span className={`font-bold ${
                                status === 'missing' ? 'text-red-600' :
                                status === 'surplus' ? 'text-green-600' :
                                'text-green-600'
                              }`}>
                                {diff > 0 ? '+' : ''}{diff}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {value !== null && value !== 0 ? (
                            <span className={`font-semibold ${
                              value < 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {formatCurrency(Math.abs(value))}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
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
                  const diff = parseFloat(item.physicalCount) - item.systemStock
                  return (
                    <tr key={item.productId}>
                      <td className="px-2 py-2 text-xs">{item.productName}</td>
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
