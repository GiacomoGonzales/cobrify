import { useState, useEffect } from 'react'
import { Package, Search, Calendar, AlertTriangle, Plus, Edit2, Trash2, Filter, ChevronDown, ChevronUp, ChevronRight, Pill, Layers } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'

function BatchControl() {
  const { user, getBusinessId } = useAppContext()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('all') // all, with-batches, expiring
  const [expandedProducts, setExpandedProducts] = useState({})

  // Modal para editar lote
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingBatch, setEditingBatch] = useState(null)
  const [editingProductId, setEditingProductId] = useState(null)
  const [batchData, setBatchData] = useState({
    batchNumber: '',
    expirationDate: '',
    quantity: 0
  })

  const businessId = getBusinessId()

  useEffect(() => {
    if (businessId) {
      loadProducts()
    }
  }, [businessId])

  const loadProducts = async () => {
    if (!businessId) return

    try {
      setLoading(true)
      const productsRef = collection(db, 'businesses', businessId, 'products')
      const snapshot = await getDocs(productsRef)

      const allProducts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      setProducts(allProducts)
    } catch (error) {
      console.error('Error al cargar productos:', error)
      toast.error('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  // Calcular estado de vencimiento
  const getExpirationStatus = (expirationDate) => {
    if (!expirationDate) return null

    const expDate = expirationDate.toDate ? expirationDate.toDate() : new Date(expirationDate)
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

  // Formatear fecha
  const formatDate = (date) => {
    if (!date) return '-'
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Filtrar productos
  const filteredProducts = products
    .filter(p => {
      const matchesSearch =
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.genericName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.batches?.some(b => b.batchNumber?.toLowerCase().includes(searchTerm.toLowerCase()))

      if (!matchesSearch) return false

      if (selectedFilter === 'with-batches') return p.batches && p.batches.length > 0
      if (selectedFilter === 'expiring') {
        // Productos con al menos un lote que vence en 90 días
        return p.batches?.some(b => {
          const status = getExpirationStatus(b.expirationDate)
          return status && ['expired', 'critical', 'warning', 'caution'].includes(status.status)
        })
      }
      return true
    })

  // Stats
  const stats = {
    totalProducts: products.length,
    productsWithBatches: products.filter(p => p.batches && p.batches.length > 0).length,
    totalBatches: products.reduce((sum, p) => sum + (p.batches?.length || 0), 0),
    expiringBatches: products.reduce((sum, p) => {
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
    setBatchData({
      batchNumber: batch.batchNumber || '',
      expirationDate: batch.expirationDate
        ? (batch.expirationDate.toDate ? batch.expirationDate.toDate() : new Date(batch.expirationDate)).toISOString().split('T')[0]
        : '',
      quantity: batch.quantity || 0
    })
    setShowEditModal(true)
  }

  // Guardar cambios de lote
  const saveBatchChanges = async () => {
    if (!editingProductId || !editingBatch) return

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
          const dateA = a.expirationDate.toDate ? a.expirationDate.toDate() : new Date(a.expirationDate)
          const dateB = b.expirationDate.toDate ? b.expirationDate.toDate() : new Date(b.expirationDate)
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
          const dateA = a.expirationDate.toDate ? a.expirationDate.toDate() : new Date(a.expirationDate)
          const dateB = b.expirationDate.toDate ? b.expirationDate.toDate() : new Date(b.expirationDate)
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
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-7 h-7 text-primary-600" />
            Control de Lotes
          </h1>
          <p className="text-gray-600 mt-1">Gestiona los lotes y fechas de vencimiento de tus productos</p>
        </div>
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
        </CardContent>
      </Card>

      {/* Lista de productos con lotes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pill className="w-5 h-5" />
            Productos y Lotes ({filteredProducts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-200">
            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No se encontraron productos
              </div>
            ) : (
              filteredProducts.map((product) => (
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
                        <p className="text-sm font-medium text-gray-900">Stock: {product.stock || 0}</p>
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
                          <div className="grid grid-cols-5 gap-4 text-xs font-medium text-gray-500 uppercase px-2">
                            <span>N° Lote</span>
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
                                  className={`grid grid-cols-5 gap-4 items-center px-2 py-2 rounded-lg ${
                                    batch.quantity <= 0 ? 'bg-gray-100 opacity-50' : 'bg-white'
                                  } ${
                                    expStatus?.status === 'expired' ? 'border-l-4 border-red-500' :
                                    expStatus?.status === 'critical' ? 'border-l-4 border-red-400' :
                                    expStatus?.status === 'warning' ? 'border-l-4 border-orange-400' :
                                    expStatus?.status === 'caution' ? 'border-l-4 border-yellow-400' : ''
                                  }`}
                                >
                                  <span className="font-medium text-gray-900">{batch.batchNumber || 'Sin número'}</span>
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
        </CardContent>
      </Card>

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
