import { useState, useEffect, useMemo } from 'react'
import { Package, Search, Calendar, AlertTriangle, Plus, Edit2, Trash2, Filter, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Pill, Layers, Warehouse, Store } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency, matchesSearchQuery } from '@/lib/utils'
import { getWarehouses } from '@/services/warehouseService'
import { getActiveBranches } from '@/services/branchService'

function BatchControl() {
  const {
    user, getBusinessId, isDemoMode, demoData, hasMainBranchAccess,
    allowedWarehouses, isBusinessOwner, isAdmin,
    filterWarehousesByAccess, filterBranchesByAccess,
  } = useAppContext()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('all') // all, with-batches, expiring
  const [expandedProducts, setExpandedProducts] = useState({})
  const [warehouses, setWarehouses] = useState([])
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [filterWarehouse, setFilterWarehouse] = useState('all')
  // Paginación: para negocios con miles de productos, renderizar todo de golpe
  // hace que React tarde varios segundos. 25 por página es suficiente.
  const [currentPage, setCurrentPage] = useState(0)
  const PRODUCTS_PER_PAGE = 25

  // Modal para editar lote
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingBatch, setEditingBatch] = useState(null)
  const [editingProductId, setEditingProductId] = useState(null)
  const [batchData, setBatchData] = useState({
    batchNumber: '',
    expirationDate: '',
    quantity: 0
  })

  const [syncingBatches, setSyncingBatches] = useState(false)

  const businessId = getBusinessId()

  // Reset de paginación cuando cambian filtros / búsqueda.
  // Sin esto, si estás en página 5 y buscás algo nuevo, queda mostrando
  // página 5 de un resultado más chico (a veces vacía).
  useEffect(() => {
    setCurrentPage(0)
  }, [searchTerm, selectedFilter, filterBranch, filterWarehouse])

  useEffect(() => {
    if (isDemoMode) {
      loadDemoProducts()
    } else if (businessId) {
      loadProducts()
    }
  }, [businessId, isDemoMode])

  // Cargar productos del demo
  const loadDemoProducts = () => {
    setLoading(true)
    try {
      const productsData = demoData?.products || []
      // Transformar lotes para usar nombres de campos consistentes
      const transformedProducts = productsData.map(product => ({
        ...product,
        batches: product.batches?.map(batch => ({
          ...batch,
          batchNumber: batch.lotNumber || batch.batchNumber,
          expirationDate: batch.expiryDate || batch.expirationDate
        })) || []
      }))
      setProducts(transformedProducts)
    } catch (error) {
      console.error('Error al cargar productos demo:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadProducts = async () => {
    if (!businessId) return

    try {
      setLoading(true)

      // Cargar productos, almacenes y sucursales en paralelo
      const [productsSnapshot, warehousesResult, branchesResult] = await Promise.all([
        getDocs(collection(db, 'businesses', businessId, 'products')),
        getWarehouses(businessId),
        getActiveBranches(businessId)
      ])

      const allProducts = productsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      setProducts(allProducts)
      if (warehousesResult.success) setWarehouses(warehousesResult.data || [])
      if (branchesResult.success) setBranches(branchesResult.data || [])
    } catch (error) {
      console.error('Error al cargar productos:', error)
      toast.error('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  // Sincronizar stock de productos con sus lotes
  // Sincroniza cantidades de lotes contra el stock, pero SOLO en casos sin ambigüedad.
  //
  // Versión segura: nunca consolida múltiples lotes ni "inventa" distribuciones.
  // - Si hay un único lote en un almacén y está descuadrado contra el stock de ese
  //   almacén, se ajusta ese lote (no hay ambigüedad).
  // - Si hay varios lotes en un almacén con descuadre, NO se toca nada — se reporta
  //   para revisión manual.
  // - Productos con variantes no se tocan (cada variante puede tener su propio stock).
  // - El cuadre se hace por almacén, no globalmente.
  const handleSyncBatchStock = async () => {
    if (isDemoMode) {
      toast.info('No disponible en modo demo')
      return
    }
    if (!confirm('Solo se cuadrarán automáticamente los lotes en casos sin ambigüedad (un único lote por almacén). Los descuadres con múltiples lotes se reportarán para revisión manual. ¿Continuar?')) return

    setSyncingBatches(true)
    try {
      let syncCount = 0
      const flagged = [] // descuadres que requieren revisión manual

      for (const product of products) {
        const batches = product.batches || []
        if (batches.length === 0) continue

        // Productos con variantes: no tocar — cada variante puede tener su propio stock/lotes.
        if (Array.isArray(product.variants) && product.variants.length > 0) {
          flagged.push({
            name: product.name || product.id,
            reason: 'producto con variantes (no soportado por la sync)',
          })
          continue
        }

        const whStocks = product.warehouseStocks || []
        const hasMultiWarehouse = whStocks.length > 0

        // Lista de almacenes a cuadrar. Para productos sin multi-almacén, un único
        // "almacén virtual" (id=null) con el stock total del producto.
        const warehouses = hasMultiWarehouse
          ? whStocks.map(ws => ({ id: ws.warehouseId || null, stock: ws.stock || 0 }))
          : [{ id: null, stock: product.stock || 0 }]

        const updatedBatches = [...batches]
        let modified = false

        for (const wh of warehouses) {
          // Filtrar lotes de este almacén. Sin multi-almacén, todos los lotes cuentan.
          const batchesInWh = hasMultiWarehouse
            ? updatedBatches.filter(b => (b.warehouseId || null) === wh.id)
            : updatedBatches

          if (batchesInWh.length === 0) {
            if (wh.stock > 0) {
              flagged.push({
                name: product.name || product.id,
                warehouseId: wh.id,
                stock: wh.stock,
                reason: 'almacén con stock pero sin lotes registrados',
              })
            }
            continue
          }

          const activeInWh = batchesInWh.filter(b => !b.isExpired)
          const activeQtySum = activeInWh.reduce((sum, b) => sum + (b.quantity || 0), 0)

          if (activeQtySum === wh.stock) continue // ya cuadrado

          // CASO SEGURO: un único lote en este almacén → no hay ambigüedad.
          if (batchesInWh.length === 1) {
            const target = batchesInWh[0]
            if (target.isExpired) {
              flagged.push({
                name: product.name || product.id,
                warehouseId: wh.id,
                stock: wh.stock,
                lotsSum: activeQtySum,
                reason: 'único lote del almacén está expirado',
              })
              continue
            }
            const idx = updatedBatches.findIndex(b => b === target)
            updatedBatches[idx] = { ...target, quantity: wh.stock }
            modified = true
          } else {
            // AMBIGUO: varios lotes en el mismo almacén con descuadre → no adivinar.
            flagged.push({
              name: product.name || product.id,
              warehouseId: wh.id,
              stock: wh.stock,
              lotsSum: activeQtySum,
              lotCount: batchesInWh.length,
              activeCount: activeInWh.length,
              reason: 'múltiples lotes en el almacén con descuadre — revisar manualmente',
            })
          }
        }

        if (modified) {
          const productRef = doc(db, 'businesses', businessId, 'products', product.id)
          await updateDoc(productRef, { batches: updatedBatches })
          syncCount++
        }
      }

      if (flagged.length > 0) {
        console.warn('[BatchControl] Productos con descuadre que requieren revisión manual:', flagged)
      }

      if (syncCount > 0 && flagged.length === 0) {
        toast.success(`${syncCount} producto(s) sincronizado(s)`)
        loadProducts()
      } else if (syncCount > 0 && flagged.length > 0) {
        toast.info(`${syncCount} sincronizado(s) · ${flagged.length} requieren revisión manual (ver consola)`)
        loadProducts()
      } else if (syncCount === 0 && flagged.length > 0) {
        toast.info(`${flagged.length} producto(s) con descuadre ambiguo (ver consola para detalles)`)
      } else {
        toast.info('Todos los lotes ya están sincronizados con el stock')
      }
    } catch (error) {
      console.error('Error al sincronizar lotes:', error)
      toast.error('Error al sincronizar')
    } finally {
      setSyncingBatches(false)
    }
  }

  // Calcular estado de vencimiento
  const getExpirationStatus = (expirationDate) => {
    if (!expirationDate) return null

    let expDate
    if (expirationDate.toDate) {
      expDate = expirationDate.toDate()
    } else if (expirationDate.seconds) {
      // Firestore Timestamp guardado como plain object (corrupto)
      expDate = new Date(expirationDate.seconds * 1000)
    } else {
      expDate = new Date(expirationDate)
    }
    if (isNaN(expDate.getTime())) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    expDate.setHours(0, 0, 0, 0)

    const diffTime = expDate - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return { status: 'expired', days: Math.abs(diffDays), label: 'Vencido', color: 'red' }
    } else if (diffDays <= 30) {
      return { status: 'critical', days: diffDays, label: `${diffDays}d`, color: 'red' }
    } else if (diffDays <= 60) {
      return { status: 'warning', days: diffDays, label: `${diffDays}d`, color: 'orange' }
    } else if (diffDays <= 90) {
      return { status: 'caution', days: diffDays, label: `${diffDays}d`, color: 'yellow' }
    } else {
      return { status: 'ok', days: diffDays, label: `${diffDays}d`, color: 'green' }
    }
  }

  // Almacenes a los que el usuario tiene acceso (para los dropdowns).
  // En modo demo el contexto no expone filterWarehousesByAccess → sin restricción (todos).
  const accessibleWarehouses = useMemo(
    () => (filterWarehousesByAccess ? filterWarehousesByAccess(warehouses) : warehouses),
    [filterWarehousesByAccess, warehouses]
  )

  // Sucursales a las que el usuario tiene acceso (para el dropdown de sucursal).
  const accessibleBranches = useMemo(
    () => (filterBranchesByAccess ? filterBranchesByAccess(branches) : branches),
    [filterBranchesByAccess, branches]
  )

  // Conjunto de IDs de almacenes permitidos para el usuario.
  // null = sin restricción (owner/admin, allowedWarehouses vacío, o modo demo) → comportamiento idéntico al actual.
  // Cuando hay restricción, derivamos el set de los almacenes accesibles ya cargados
  // (cubre el caso de IDs en allowedWarehouses que no existen como almacén).
  const allowedWarehouseIdSet = useMemo(() => {
    if (isBusinessOwner || isAdmin || !allowedWarehouses || allowedWarehouses.length === 0) return null
    return new Set(accessibleWarehouses.map(w => w.id))
  }, [isBusinessOwner, isAdmin, allowedWarehouses, accessibleWarehouses])

  // Formatear fecha
  // Almacenes filtrados por sucursal (sobre la base de almacenes permitidos)
  const filteredWarehouses = filterBranch === 'all'
    ? accessibleWarehouses
    : filterBranch === 'main'
      ? accessibleWarehouses.filter(w => !w.branchId)
      : accessibleWarehouses.filter(w => w.branchId === filterBranch)

  // Obtener stock de un producto según filtros de almacén/sucursal
  const getFilteredStock = (product) => {
    const warehouseStocks = product.warehouseStocks || []
    if (warehouseStocks.length === 0) return product.stock || 0

    if (filterWarehouse !== 'all') {
      const ws = warehouseStocks.find(ws => ws.warehouseId === filterWarehouse)
      return ws?.stock || 0
    }

    if (filterBranch === 'all') {
      // Sin restricción: suma global (igual que antes).
      // Con restricción: solo los almacenes a los que el usuario tiene acceso.
      return warehouseStocks
        .filter(ws => !allowedWarehouseIdSet || allowedWarehouseIdSet.has(ws.warehouseId))
        .reduce((sum, ws) => sum + (ws.stock || 0), 0)
    }

    const warehouseIds = filteredWarehouses.map(w => w.id)
    return warehouseStocks
      .filter(ws => warehouseIds.includes(ws.warehouseId))
      .reduce((sum, ws) => sum + (ws.stock || 0), 0)
  }

  const parseDate = (date) => {
    if (!date) return null
    if (date.toDate) return date.toDate()
    if (date.seconds) return new Date(date.seconds * 1000)
    const d = new Date(date)
    return isNaN(d.getTime()) ? null : d
  }

  const formatDate = (date) => {
    const d = parseDate(date)
    if (!d) return '-'
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Base de productos visibles para el usuario (independiente de búsqueda/filtros).
  // Sin restricción (owner/admin o allowedWarehouses vacío) = todos los productos (idéntico al actual).
  // Con restricción: se ocultan los productos cuyo stock esté SOLO en almacenes ajenos
  // (un producto se muestra si tiene algún warehouseStocks[].warehouseId permitido).
  const visibleProducts = useMemo(() => {
    if (!allowedWarehouseIdSet) return products
    return products.filter(p => {
      const ws = p.warehouseStocks || []
      if (ws.length === 0) return true // sin desglose por almacén: no se puede atribuir → se muestra
      return ws.some(s => allowedWarehouseIdSet.has(s.warehouseId))
    })
  }, [products, allowedWarehouseIdSet])

  // Filtrar productos (sobre la base permitida)
  const filteredProducts = visibleProducts
    .filter(p => {
      const matchesSearch = matchesSearchQuery(
        searchTerm,
        p.name,
        p.code,
        p.genericName,
        ...((p.batches || []).map(b => b.batchNumber))
      )

      if (!matchesSearch) return false

      // Filtrar por almacén: solo productos con stock en ese almacén
      if (filterWarehouse !== 'all') {
        const ws = (p.warehouseStocks || []).find(ws => ws.warehouseId === filterWarehouse)
        if (!ws || ws.stock <= 0) return false
      }

      // Filtrar por sucursal: solo productos con stock en almacenes de esa sucursal
      if (filterBranch !== 'all' && filterWarehouse === 'all') {
        const warehouseIds = filteredWarehouses.map(w => w.id)
        const hasStock = (p.warehouseStocks || []).some(ws =>
          warehouseIds.includes(ws.warehouseId) && ws.stock > 0
        )
        if (!hasStock && filterBranch !== 'main') return false
      }

      if (selectedFilter === 'with-batches') return p.batches && p.batches.length > 0
      if (selectedFilter === 'expiring') {
        return p.batches?.some(b => {
          const status = getExpirationStatus(b.expirationDate)
          return status && ['expired', 'critical', 'warning', 'caution'].includes(status.status)
        })
      }
      return true
    })

  // Stats (sobre la base permitida)
  const stats = {
    totalProducts: visibleProducts.length,
    productsWithBatches: visibleProducts.filter(p => p.batches && p.batches.length > 0).length,
    totalBatches: visibleProducts.reduce((sum, p) => sum + (p.batches?.length || 0), 0),
    expiringBatches: visibleProducts.reduce((sum, p) => {
      return sum + (p.batches?.filter(b => {
        const status = getExpirationStatus(b.expirationDate)
        return status && ['expired', 'critical', 'warning'].includes(status.status)
      }).length || 0)
    }, 0)
  }

  // Toggle expandir producto
  const toggleExpand = (productId) => {
    setExpandedProducts(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }))
  }

  // Abrir modal de edición de lote
  const openEditModal = (product, batch) => {
    setEditingProductId(product.id)
    setEditingBatch(batch)
    const parsedExpDate = parseDate(batch.expirationDate)
    setBatchData({
      batchNumber: batch.batchNumber || '',
      expirationDate: parsedExpDate
        ? `${parsedExpDate.getFullYear()}-${String(parsedExpDate.getMonth() + 1).padStart(2, '0')}-${String(parsedExpDate.getDate()).padStart(2, '0')}`
        : '',
      quantity: batch.quantity || 0
    })
    setShowEditModal(true)
  }

  // Guardar cambios de lote
  const saveBatchChanges = async () => {
    if (!editingProductId || !editingBatch) return

    // En modo demo, mostrar mensaje
    if (isDemoMode) {
      toast.info('En modo demo no se pueden guardar cambios')
      setShowEditModal(false)
      setEditingBatch(null)
      setEditingProductId(null)
      return
    }

    try {
      const product = products.find(p => p.id === editingProductId)
      if (!product) return

      const updatedBatches = product.batches.map(b => {
        if (b.id === editingBatch.id) {
          return {
            ...b,
            batchNumber: batchData.batchNumber,
            expirationDate: batchData.expirationDate ? new Date(batchData.expirationDate) : null,
            quantity: parseFloat(batchData.quantity) || 0
          }
        }
        return b
      })

      // Recalcular stock total
      const newTotalStock = updatedBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)

      // Recalcular vencimiento más próximo
      const activeBatches = updatedBatches.filter(b => b.quantity > 0 && b.expirationDate)
      let nearestExpiration = null
      let nearestBatchNumber = null

      if (activeBatches.length > 0) {
        activeBatches.sort((a, b) => {
          const dateA = parseDate(a.expirationDate) || new Date('2099-12-31')
          const dateB = parseDate(b.expirationDate) || new Date('2099-12-31')
          return dateA - dateB
        })
        nearestExpiration = activeBatches[0].expirationDate
        nearestBatchNumber = activeBatches[0].batchNumber
      }

      const productRef = doc(db, 'businesses', businessId, 'products', editingProductId)
      await updateDoc(productRef, {
        batches: updatedBatches,
        stock: newTotalStock,
        expirationDate: nearestExpiration,
        batchNumber: nearestBatchNumber,
        updatedAt: new Date()
      })

      // Actualizar lista local
      setProducts(products.map(p =>
        p.id === editingProductId
          ? { ...p, batches: updatedBatches, stock: newTotalStock, expirationDate: nearestExpiration, batchNumber: nearestBatchNumber }
          : p
      ))

      toast.success('Lote actualizado correctamente')
      setShowEditModal(false)
      setEditingBatch(null)
      setEditingProductId(null)
    } catch (error) {
      console.error('Error al guardar:', error)
      toast.error('Error al guardar cambios')
    }
  }

  // Eliminar lote
  const deleteBatch = async (productId, batchId) => {
    // En modo demo, mostrar mensaje
    if (isDemoMode) {
      toast.info('En modo demo no se pueden eliminar lotes')
      return
    }

    if (!confirm('¿Estás seguro de eliminar este lote?')) return

    try {
      const product = products.find(p => p.id === productId)
      if (!product) return

      const updatedBatches = product.batches.filter(b => b.id !== batchId)
      const newTotalStock = updatedBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)

      // Recalcular vencimiento más próximo
      const activeBatches = updatedBatches.filter(b => b.quantity > 0 && b.expirationDate)
      let nearestExpiration = null
      let nearestBatchNumber = null

      if (activeBatches.length > 0) {
        activeBatches.sort((a, b) => {
          const dateA = parseDate(a.expirationDate) || new Date('2099-12-31')
          const dateB = parseDate(b.expirationDate) || new Date('2099-12-31')
          return dateA - dateB
        })
        nearestExpiration = activeBatches[0].expirationDate
        nearestBatchNumber = activeBatches[0].batchNumber
      }

      const productRef = doc(db, 'businesses', businessId, 'products', productId)
      await updateDoc(productRef, {
        batches: updatedBatches,
        stock: newTotalStock,
        expirationDate: nearestExpiration,
        batchNumber: nearestBatchNumber,
        updatedAt: new Date()
      })

      setProducts(products.map(p =>
        p.id === productId
          ? { ...p, batches: updatedBatches, stock: newTotalStock, expirationDate: nearestExpiration, batchNumber: nearestBatchNumber }
          : p
      ))

      toast.success('Lote eliminado')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al eliminar lote')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-7 h-7 text-primary-600" />
            Control de Lotes
          </h1>
          <p className="text-gray-600 mt-1">Gestiona los lotes y fechas de vencimiento de tus productos</p>
        </div>
        <Button
          onClick={handleSyncBatchStock}
          disabled={syncingBatches || loading}
          variant="outline"
          size="sm"
        >
          {syncingBatches ? (
            <><Package className="w-4 h-4 mr-2 animate-spin" /> Sincronizando...</>
          ) : (
            <><Package className="w-4 h-4 mr-2" /> Sincronizar Stock a Lotes</>
          )}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalProducts}</p>
                <p className="text-sm text-gray-500">Productos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Layers className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.productsWithBatches}</p>
                <p className="text-sm text-gray-500">Con Lotes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{stats.totalBatches}</p>
                <p className="text-sm text-gray-500">Total Lotes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.expiringBatches}</p>
                <p className="text-sm text-gray-500">Por Vencer</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por nombre, código o lote..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="all">Todos los productos</option>
                <option value="with-batches">Con lotes registrados</option>
                <option value="expiring">Por vencer (90 días)</option>
              </select>
            </div>
          </div>

          {/* Filtros de sucursal y almacén */}
          {(accessibleWarehouses.length > 0 || accessibleBranches.length > 0) && (
            <div className="flex flex-col sm:flex-row gap-3 mt-3 pt-3 border-t border-gray-100">
              {accessibleBranches.length > 0 && (
                <div className="flex items-center gap-2 flex-1">
                  <Store className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <select
                    value={filterBranch}
                    onChange={(e) => { setFilterBranch(e.target.value); setFilterWarehouse('all') }}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="all">Todas las sucursales</option>
                    {hasMainBranchAccess && <option value="main">Sede principal</option>}
                    {accessibleBranches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {accessibleWarehouses.length > 0 && (
                <div className="flex items-center gap-2 flex-1">
                  <Warehouse className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <select
                    value={filterWarehouse}
                    onChange={(e) => setFilterWarehouse(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="all">Todos los almacenes</option>
                    {filteredWarehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de productos con lotes (paginada — 25 por página) */}
      {(() => {
        const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE))
        const safePage = Math.min(currentPage, totalPages - 1)
        const paginatedProducts = filteredProducts.slice(safePage * PRODUCTS_PER_PAGE, (safePage + 1) * PRODUCTS_PER_PAGE)
        return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pill className="w-5 h-5" />
            Productos y Lotes ({filteredProducts.length})
            {filteredProducts.length > PRODUCTS_PER_PAGE && (
              <span className="text-xs font-normal text-gray-500 ml-2">
                · Mostrando {safePage * PRODUCTS_PER_PAGE + 1}-{Math.min((safePage + 1) * PRODUCTS_PER_PAGE, filteredProducts.length)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-200">
            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No se encontraron productos
              </div>
            ) : (
              paginatedProducts.map((product) => (
                <div key={product.id} className="border-b last:border-b-0">
                  {/* Producto Header */}
                  <button
                    onClick={() => toggleExpand(product.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expandedProducts[product.id] ? 'rotate-90' : ''}`} />
                      <div className="text-left">
                        <p className="font-medium text-gray-900">{product.name}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          {product.code && <span>{product.code}</span>}
                          {product.genericName && <span>• {product.genericName}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">Stock: {product.hasVariants && product.variants?.length > 0 ? product.variants.reduce((s, v) => s + (v.stock || 0), 0) : getFilteredStock(product)}</p>
                        <p className="text-xs text-gray-500">{product.batches?.length || 0} lotes</p>
                      </div>
                      {product.batches && product.batches.length > 0 && (
                        <Badge variant="secondary">
                          {product.batches.filter(b => b.quantity > 0).length} activos
                        </Badge>
                      )}
                    </div>
                  </button>

                  {/* Lotes expandidos */}
                  {expandedProducts[product.id] && (
                    <div className="bg-gray-50 px-4 py-3 border-t">
                      {(!product.batches || product.batches.length === 0) ? (
                        <p className="text-sm text-gray-500 text-center py-4">
                          Este producto no tiene lotes registrados. Los lotes se crean automáticamente al registrar compras.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-6 gap-3 text-xs font-medium text-gray-500 uppercase px-2">
                            <span>N° Lote</span>
                            <span>Almacén</span>
                            <span>Vencimiento</span>
                            <span className="text-center">Stock</span>
                            <span className="text-center">Estado</span>
                            <span className="text-right">Acciones</span>
                          </div>
                          {product.batches
                            .sort((a, b) => {
                              if (!a.expirationDate) return 1
                              if (!b.expirationDate) return -1
                              const dateA = a.expirationDate.toDate ? a.expirationDate.toDate() : new Date(a.expirationDate)
                              const dateB = b.expirationDate.toDate ? b.expirationDate.toDate() : new Date(b.expirationDate)
                              return dateA - dateB
                            })
                            .map((batch) => {
                              const expStatus = getExpirationStatus(batch.expirationDate)
                              return (
                                <div
                                  key={batch.id}
                                  className={`grid grid-cols-6 gap-3 items-center px-2 py-2 rounded-lg ${
                                    batch.quantity <= 0 ? 'bg-gray-100 opacity-50' : 'bg-white'
                                  } ${
                                    expStatus?.status === 'expired' ? 'border-l-4 border-red-500' :
                                    expStatus?.status === 'critical' ? 'border-l-4 border-red-400' :
                                    expStatus?.status === 'warning' ? 'border-l-4 border-orange-400' :
                                    expStatus?.status === 'caution' ? 'border-l-4 border-yellow-400' : ''
                                  }`}
                                >
                                  <span className="font-medium text-gray-900">{batch.batchNumber || 'Sin número'}</span>
                                  <span className="text-xs text-gray-600 truncate">
                                    {batch.warehouseId
                                      ? (warehouses.find(w => w.id === batch.warehouseId)?.name || 'Almacén')
                                      : <span className="text-gray-400 italic">Sin asignar</span>
                                    }
                                  </span>
                                  <span className="text-gray-600">{formatDate(batch.expirationDate)}</span>
                                  <span className={`text-center font-medium ${batch.quantity <= 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                                    {batch.quantity || 0}
                                  </span>
                                  <span className="text-center">
                                    {expStatus && (
                                      <Badge
                                        variant={
                                          expStatus.status === 'expired' ? 'danger' :
                                          expStatus.status === 'critical' ? 'danger' :
                                          expStatus.status === 'warning' ? 'warning' :
                                          expStatus.status === 'caution' ? 'warning' : 'success'
                                        }
                                      >
                                        {expStatus.label}
                                      </Badge>
                                    )}
                                  </span>
                                  <div className="flex justify-end gap-1">
                                    <button
                                      onClick={() => openEditModal(product, batch)}
                                      className="p-1.5 text-primary-600 hover:bg-primary-50 rounded"
                                      title="Editar"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => deleteBatch(product.id, batch.id)}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                      title="Eliminar"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {/* Controles de paginación — solo si hay más de una página */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-500">
                {safePage * PRODUCTS_PER_PAGE + 1}-{Math.min((safePage + 1) * PRODUCTS_PER_PAGE, filteredProducts.length)} de {filteredProducts.length} productos
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="p-1.5 rounded-lg border hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium px-2">{safePage + 1} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="p-1.5 rounded-lg border hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        )
      })()}

      {/* Modal de edición de lote */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setEditingBatch(null)
          setEditingProductId(null)
        }}
        title="Editar Lote"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número de Lote
            </label>
            <input
              type="text"
              value={batchData.batchNumber}
              onChange={(e) => setBatchData({ ...batchData, batchNumber: e.target.value })}
              placeholder="Ej: LOTE-2024-001"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Vencimiento
            </label>
            <input
              type="date"
              value={batchData.expirationDate}
              onChange={(e) => setBatchData({ ...batchData, expirationDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cantidad en Stock
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={batchData.quantity}
              onChange={(e) => setBatchData({ ...batchData, quantity: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditModal(false)
                setEditingBatch(null)
                setEditingProductId(null)
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={saveBatchChanges}
              className="flex-1"
            >
              Guardar Cambios
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default BatchControl
