import { useState, useEffect, useMemo } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useToast } from '@/contexts/ToastContext'
import {
  subscribeToRappiOrders,
  mapRappiItemToProduct,
  createMockRappiOrder,
} from '@/services/rappiService'
import { getProducts } from '@/services/firestoreService'
import {
  Bike, Search, Loader2, Inbox, Clock, CheckCircle, XCircle,
  ShoppingCart, MapPin, Phone, User, DollarSign, Package, AlertCircle,
  Calendar, FileText, Link2, Sparkles
} from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { matchesSearchQuery } from '@/lib/utils'

const STATUS_CONFIG = {
  pending: { label: 'Recibido', className: 'bg-amber-100 text-amber-800 border-amber-300', icon: Clock },
  accepted: { label: 'Aceptado', className: 'bg-blue-100 text-blue-800 border-blue-300', icon: CheckCircle },
  ready_for_pickup: { label: 'Listo', className: 'bg-indigo-100 text-indigo-800 border-indigo-300', icon: Package },
  completed: { label: 'Facturado', className: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle },
  cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800 border-red-300', icon: XCircle },
}

const DATE_RANGES = [
  { id: '1d', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'all', label: 'Todo' },
]

const ACTIVE_STATUSES = ['pending', 'accepted', 'ready_for_pickup']
const FINAL_STATUSES = ['completed', 'cancelled']

const formatMoney = (n) => `S/ ${(Number(n) || 0).toFixed(2)}`

const formatDateTime = (ts) => {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts))
  return date.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

const getRangeBounds = (preset) => {
  const now = new Date()
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (preset === '1d') return { from: today0, to: null }
  if (preset === '7d') {
    const d = new Date(today0); d.setDate(d.getDate() - 6)
    return { from: d, to: null }
  }
  if (preset === '30d') {
    const d = new Date(today0); d.setDate(d.getDate() - 29)
    return { from: d, to: null }
  }
  if (preset === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null }
  }
  return { from: null, to: null }
}

export default function RappiOrders() {
  const { user, getBusinessId } = useAppContext()
  const appNavigate = useAppNavigate()
  const toast = useToast()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('active') // 'active' | 'history'
  const [dateRange, setDateRange] = useState('7d')

  const [detailOrder, setDetailOrder] = useState(null)
  const [mappingItem, setMappingItem] = useState(null) // { orderId, itemIndex, item }
  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [creatingMock, setCreatingMock] = useState(false)

  useEffect(() => {
    if (!user?.uid) return
    const businessId = getBusinessId()
    if (!businessId) return

    const unsub = subscribeToRappiOrders(
      businessId,
      (data) => {
        setOrders(data)
        setLoading(false)
      },
      (error) => {
        console.error('Error listening to Rappi orders:', error)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [user?.uid, getBusinessId])

  // Cargar productos cuando se abre el modal de mapeo
  useEffect(() => {
    if (!mappingItem) return
    const businessId = getBusinessId()
    if (!businessId) return
    getProducts(businessId).then(result => {
      if (result.success) setProducts(result.data || [])
    }).catch(err => console.error('Error cargando productos:', err))
  }, [mappingItem, getBusinessId])

  // Filtrado
  const ordersByMode = useMemo(() => {
    const target = viewMode === 'active' ? ACTIVE_STATUSES : FINAL_STATUSES
    return orders.filter(o => target.includes(o.status))
  }, [orders, viewMode])

  const ordersInRange = useMemo(() => {
    if (viewMode === 'active') return ordersByMode
    const { from, to } = getRangeBounds(dateRange)
    if (!from && !to) return ordersByMode
    return ordersByMode.filter(o => {
      const created = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt ? new Date(o.createdAt) : null)
      if (!created) return true
      if (from && created < from) return false
      if (to && created > to) return false
      return true
    })
  }, [ordersByMode, viewMode, dateRange])

  const filteredOrders = useMemo(() => {
    return ordersInRange.filter(o => matchesSearchQuery(
      searchTerm,
      String(o.rappiOrderId || ''),
      o.customerName,
      o.customerPhone
    ))
  }, [ordersInRange, searchTerm])

  const stats = useMemo(() => {
    const pending = orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length
    const completed = orders.filter(o => o.status === 'completed')
    const totalCompleted = completed.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
    return {
      pending,
      completedCount: completed.length,
      totalCompleted,
    }
  }, [orders])

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 50)
    const term = productSearch.toLowerCase()
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term) ||
      (p.code || '').toLowerCase().includes(term)
    ).slice(0, 50)
  }, [products, productSearch])

  const handleEmitInvoice = (order) => {
    appNavigate('/pos', {
      state: {
        fromRappiOrder: true,
        orderId: order.id,
        rappiOrderId: order.rappiOrderId,
        items: (order.items || []).map(item => ({
          id: item.productId || item.sku || item.id,
          productId: item.productId || '',
          sku: item.sku || '',
          rappiId: item.rappiId || '',
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          unit: 'NIU',
        })),
        customer: {
          name: order.customerName || '',
          email: order.customerEmail || '',
          phone: order.customerPhone || '',
          address: order.customerAddress || '',
          documentType: order.customerDocumentType || '',
          documentNumber: order.customerDocumentNumber || '',
        },
        notes: order.notes || `Pedido Rappi #${order.rappiOrderId || ''}`,
      },
    })
  }

  const handleMapItem = async (product) => {
    if (!mappingItem) return
    const businessId = getBusinessId()
    const result = await mapRappiItemToProduct(
      businessId,
      mappingItem.orderId,
      mappingItem.itemIndex,
      product
    )
    if (result.success) {
      toast.success(`SKU vinculado a: ${product.name}`)
      // Actualizar también el detalle abierto
      if (detailOrder && detailOrder.id === mappingItem.orderId) {
        const updatedItems = [...(detailOrder.items || [])]
        updatedItems[mappingItem.itemIndex] = {
          ...updatedItems[mappingItem.itemIndex],
          productId: product.id,
          sku: product.sku || product.code || updatedItems[mappingItem.itemIndex].sku,
          mappedManually: true,
        }
        setDetailOrder({ ...detailOrder, items: updatedItems })
      }
      setMappingItem(null)
      setProductSearch('')
    } else {
      toast.error('No se pudo vincular: ' + result.error)
    }
  }

  const handleCreateMockOrder = async () => {
    setCreatingMock(true)
    try {
      const result = await createMockRappiOrder(getBusinessId())
      if (result.success) {
        toast.success('Pedido de prueba creado')
      } else {
        toast.error('Error: ' + result.error)
      }
    } finally {
      setCreatingMock(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Bike className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pedidos Rappi</h1>
            <p className="text-sm text-gray-500">
              Pedidos captados desde Rappi para emisión de comprobantes
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateMockOrder}
          disabled={creatingMock}
        >
          {creatingMock ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
          Crear pedido de prueba
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-xs text-gray-500">Pendientes</p>
                <p className="text-lg font-bold">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <div>
                <p className="text-xs text-gray-500">Facturados</p>
                <p className="text-lg font-bold">{stats.completedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-primary-600" />
              <div>
                <p className="text-xs text-gray-500">Total facturado</p>
                <p className="text-lg font-bold">{formatMoney(stats.totalCompleted)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Activos/Historial */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          onClick={() => setViewMode('active')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'active'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Activos
        </button>
        <button
          onClick={() => setViewMode('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'history'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Historial
        </button>
      </div>

      {/* Filtro de fecha (solo en historial) */}
      {viewMode === 'history' && (
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-gray-500" />
          {DATE_RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setDateRange(r.id)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                dateRange === r.id
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Buscar por # Rappi, cliente o teléfono"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Lista */}
      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {orders.length === 0
                ? 'Aún no se han recibido pedidos de Rappi'
                : 'No hay pedidos que coincidan con los filtros'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
            const StatusIcon = statusCfg.icon
            const hasUnmatchedItems = (order.items || []).some(it => !it.productId)
            return (
              <Card
                key={order.id}
                className="border-l-4 border-l-orange-500 hover:shadow-md cursor-pointer transition-shadow"
              >
                <CardContent className="p-4" onClick={() => setDetailOrder(order)}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">
                          #{order.rappiOrderId || order.id.slice(-6)}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${statusCfg.className}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                        {hasUnmatchedItems && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                            <AlertCircle className="w-3 h-3" />
                            SKU sin mapear
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDateTime(order.createdAt)}
                      </p>

                      <div className="mt-2 space-y-1 text-sm">
                        {order.customerName && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <User className="w-3.5 h-3.5 text-gray-400" />
                            <span>{order.customerName}</span>
                          </div>
                        )}
                        {order.customerPhone && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            <span>{order.customerPhone}</span>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-gray-500 mt-2">
                        {(order.items || []).length} item{(order.items || []).length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <p className="text-lg font-bold text-gray-900">
                        {formatMoney(order.total)}
                      </p>
                      {order.status !== 'completed' && order.status !== 'cancelled' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEmitInvoice(order) }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-md"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          Emitir comprobante
                        </button>
                      )}
                      {order.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle className="w-3 h-3" />
                          Comprobante emitido
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal: detalle del pedido */}
      <Modal
        isOpen={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        title={detailOrder ? `Pedido Rappi #${detailOrder.rappiOrderId || detailOrder.id.slice(-6)}` : ''}
        size="lg"
      >
        {detailOrder && (
          <div className="space-y-4">
            {/* Estado y fecha */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const cfg = STATUS_CONFIG[detailOrder.status] || STATUS_CONFIG.pending
                  const Icon = cfg.icon
                  return (
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${cfg.className}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  )
                })()}
                <span className="text-xs text-gray-500">{formatDateTime(detailOrder.createdAt)}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatMoney(detailOrder.total)}</p>
            </div>

            {/* Cliente */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="font-medium">{detailOrder.customerName || 'Sin nombre'}</span>
              </div>
              {detailOrder.customerPhone && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{detailOrder.customerPhone}</span>
                </div>
              )}
              {detailOrder.customerAddress && (
                <div className="flex items-center gap-2 text-gray-700">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>{detailOrder.customerAddress}</span>
                </div>
              )}
              {detailOrder.customerDocumentNumber && (
                <p className="text-xs text-gray-500">
                  {(detailOrder.customerDocumentType || 'DOC').toUpperCase()}: {detailOrder.customerDocumentNumber}
                </p>
              )}
            </div>

            {/* Items */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Productos</h3>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {(detailOrder.items || []).map((item, idx) => {
                  const unmatched = !item.productId
                  return (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {item.quantity}× {item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {item.sku && (
                            <span className="text-xs text-gray-500">SKU: {item.sku}</span>
                          )}
                          {item.rappiId && (
                            <span className="text-xs text-gray-400">RappiID: {item.rappiId}</span>
                          )}
                          {unmatched ? (
                            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">
                              <AlertCircle className="w-3 h-3" />
                              No mapeado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                              <Link2 className="w-3 h-3" />
                              Vinculado
                            </span>
                          )}
                          {item.mappedManually && (
                            <span className="text-xs text-gray-400">(manual)</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatMoney((item.price || 0) * (item.quantity || 1))}
                        </p>
                        {unmatched && (
                          <button
                            onClick={() => setMappingItem({ orderId: detailOrder.id, itemIndex: idx, item })}
                            className="text-xs text-primary-600 hover:text-primary-700 mt-1"
                          >
                            Mapear SKU
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Notas */}
            {detailOrder.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-amber-700 mt-0.5" />
                  <p className="text-sm text-amber-900">{detailOrder.notes}</p>
                </div>
              </div>
            )}

            {/* Totales */}
            <div className="border-t border-gray-200 pt-3 space-y-1 text-sm">
              {detailOrder.subtotal != null && (
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatMoney(detailOrder.subtotal)}</span>
                </div>
              )}
              {detailOrder.igv != null && (
                <div className="flex justify-between text-gray-600">
                  <span>IGV</span>
                  <span>{formatMoney(detailOrder.igv)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100">
                <span>Total</span>
                <span>{formatMoney(detailOrder.total)}</span>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDetailOrder(null)}>
                Cerrar
              </Button>
              {detailOrder.status !== 'completed' && detailOrder.status !== 'cancelled' && (
                <Button onClick={() => { handleEmitInvoice(detailOrder); setDetailOrder(null) }}>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Emitir comprobante
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: mapear SKU manualmente */}
      <Modal
        isOpen={!!mappingItem}
        onClose={() => { setMappingItem(null); setProductSearch('') }}
        title="Vincular producto a SKU de Rappi"
        size="md"
      >
        {mappingItem && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-900 font-medium">{mappingItem.item.name}</p>
              <p className="text-xs text-yellow-700 mt-1">
                SKU Rappi: {mappingItem.item.sku || '(sin SKU)'} · Cant: {mappingItem.item.quantity}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buscar producto en tu catálogo
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Nombre, SKU o código"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {filteredProducts.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-6">Sin resultados</p>
              ) : (
                filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleMapItem(p)}
                    className="w-full px-3 py-2 text-left hover:bg-primary-50 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">
                        SKU: {p.sku || p.code || '—'} · {formatMoney(p.price)}
                      </p>
                    </div>
                    <Link2 className="w-4 h-4 text-primary-600 flex-shrink-0 ml-2" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
