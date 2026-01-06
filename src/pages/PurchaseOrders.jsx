import { useState, useEffect } from 'react'
import {
  Plus,
  Search,
  Download,
  Eye,
  Trash2,
  Loader2,
  FileText,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  MoreVertical,
  ShoppingCart,
  Truck,
  Package,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  getPurchaseOrders,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  markPurchaseOrderAsSent,
} from '@/services/purchaseOrderService'
import { getCompanySettings, getSuppliers } from '@/services/firestoreService'
import { generatePurchaseOrderPDF, previewPurchaseOrderPDF } from '@/utils/purchaseOrderPdfGenerator'
import { preloadLogo } from '@/utils/pdfGenerator'
import CreatePurchaseOrderModal from '@/components/CreatePurchaseOrderModal'

export default function PurchaseOrders() {
  const { user, isDemoMode, getBusinessId } = useAppContext()
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [viewingOrder, setViewingOrder] = useState(null)
  const [deletingOrder, setDeletingOrder] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: true })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [downloadingPdf, setDownloadingPdf] = useState(null)

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (isDemoMode) {
        setOrders([])
        setSuppliers([])
        setCompanySettings(null)
        setIsLoading(false)
        return
      }

      const [ordersResult, settingsResult, suppliersResult] = await Promise.all([
        getPurchaseOrders(getBusinessId()),
        getCompanySettings(getBusinessId()),
        getSuppliers(getBusinessId()),
      ])

      if (ordersResult.success) {
        setOrders(ordersResult.data || [])
      }

      if (settingsResult.success) {
        setCompanySettings(settingsResult.data)
        if (settingsResult.data?.logoUrl) {
          preloadLogo(settingsResult.data.logoUrl).catch(() => {})
        }
      }

      if (suppliersResult.success) {
        setSuppliers(suppliersResult.data || [])
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingOrder) return

    setIsDeleting(true)
    try {
      const result = await deletePurchaseOrder(getBusinessId(), deletingOrder.id)
      if (result.success) {
        toast.success('Orden de compra eliminada')
        setOrders(orders.filter(o => o.id !== deletingOrder.id))
        setDeletingOrder(null)
      } else {
        toast.error(result.error || 'Error al eliminar')
      }
    } catch (error) {
      toast.error('Error al eliminar orden')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDownloadPdf = async (order) => {
    setDownloadingPdf(order.id)
    try {
      await generatePurchaseOrderPDF(order, companySettings, true)
      toast.success('PDF generado correctamente')
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar PDF')
    } finally {
      setDownloadingPdf(null)
    }
  }

  const handlePreviewPdf = async (order) => {
    try {
      await previewPurchaseOrderPDF(order, companySettings)
    } catch (error) {
      console.error('Error al generar vista previa:', error)
      toast.error('Error al generar vista previa')
    }
  }

  const handleMarkAsSent = async (order) => {
    try {
      const result = await markPurchaseOrderAsSent(getBusinessId(), order.id, 'manual')
      if (result.success) {
        toast.success('Orden marcada como enviada')
        loadData()
      } else {
        toast.error(result.error || 'Error al actualizar estado')
      }
    } catch (error) {
      toast.error('Error al actualizar orden')
    }
  }

  const handleMarkAsReceived = async (order) => {
    try {
      const result = await updatePurchaseOrderStatus(getBusinessId(), order.id, 'received')
      if (result.success) {
        toast.success('Orden marcada como recibida')
        loadData()
      } else {
        toast.error(result.error || 'Error al actualizar estado')
      }
    } catch (error) {
      toast.error('Error al actualizar orden')
    }
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: 'Borrador', variant: 'secondary', icon: FileText },
      sent: { label: 'Enviada', variant: 'info', icon: Send },
      received: { label: 'Recibida', variant: 'success', icon: CheckCircle },
      cancelled: { label: 'Cancelada', variant: 'danger', icon: XCircle },
    }

    const config = statusConfig[status] || statusConfig.draft
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    )
  }

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      (order.number?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (order.supplier?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())

    const matchesStatus = filterStatus === 'all' || order.status === filterStatus

    return matchesSearch && matchesStatus
  })

  const stats = {
    total: orders.length,
    draft: orders.filter(o => o.status === 'draft').length,
    sent: orders.filter(o => o.status === 'sent').length,
    received: orders.filter(o => o.status === 'received').length,
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Órdenes de Compra</h1>
          <p className="text-gray-600 text-sm mt-1">
            Gestiona tus pedidos a proveedores
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Orden
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-gray-50 to-gray-100">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-200 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-200 rounded-lg">
                <FileText className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-700">{stats.draft}</p>
                <p className="text-xs text-yellow-600">Borradores</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-200 rounded-lg">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700">{stats.sent}</p>
                <p className="text-xs text-blue-600">Enviadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">{stats.received}</p>
                <p className="text-xs text-green-600">Recibidas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por número o proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="sent">Enviadas</option>
              <option value="received">Recibidas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary-600" />
            Órdenes de Compra ({filteredOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay órdenes de compra
              </h3>
              <p className="text-gray-500 mb-4">
                Crea tu primera orden de compra para comenzar
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Nueva Orden
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-semibold text-gray-900">
                        {order.number || 'Sin número'}
                      </span>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {order.supplier?.name || 'Proveedor no especificado'}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>
                        {order.createdAt?.toDate
                          ? formatDate(order.createdAt.toDate())
                          : '-'}
                      </span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(order.total || 0)}
                      </span>
                      <span>{order.items?.length || 0} productos</span>
                    </div>
                  </div>

                  {/* Actions Button */}
                  <button
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const menuHeight = 250
                      const spaceBelow = window.innerHeight - rect.bottom
                      const openUpward = spaceBelow < menuHeight

                      setMenuPosition({
                        top: openUpward ? rect.top - 10 : rect.bottom + 10,
                        right: window.innerWidth - rect.right,
                        openUpward
                      })
                      setOpenMenuId(openMenuId === order.id ? null : order.id)
                    }}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dropdown Menu (fixed position) */}
      {openMenuId && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpenMenuId(null)}
          />
          <div
            className="fixed w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
            style={{
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            {(() => {
              const order = filteredOrders.find(o => o.id === openMenuId)
              if (!order) return null

              return (
                <>
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      setViewingOrder(order)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Eye className="w-4 h-4 text-primary-600" />
                    <span>Ver detalles</span>
                  </button>

                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      handlePreviewPdf(order)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <FileText className="w-4 h-4 text-purple-600" />
                    <span>Vista previa PDF</span>
                  </button>

                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      handleDownloadPdf(order)
                    }}
                    disabled={downloadingPdf === order.id}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50"
                  >
                    {downloadingPdf === order.id ? (
                      <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 text-green-600" />
                    )}
                    <span>Descargar PDF</span>
                  </button>

                  {order.status === 'draft' && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          handleMarkAsSent(order)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-3 text-blue-600"
                      >
                        <Send className="w-4 h-4" />
                        <span>Marcar como enviada</span>
                      </button>
                    </>
                  )}

                  {order.status === 'sent' && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          handleMarkAsReceived(order)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-3 text-green-600"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Marcar como recibida</span>
                      </button>
                    </>
                  )}

                  {order.status !== 'received' && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          setDeletingOrder(order)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Eliminar</span>
                      </button>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </>
      )}

      {/* View Order Modal */}
      <Modal
        isOpen={!!viewingOrder}
        onClose={() => setViewingOrder(null)}
        title={`Orden de Compra ${viewingOrder?.number || ''}`}
        size="lg"
      >
        {viewingOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Proveedor</p>
                <p className="font-medium">{viewingOrder.supplier?.name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">RUC</p>
                <p className="font-medium">{viewingOrder.supplier?.documentNumber || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Fecha</p>
                <p className="font-medium">
                  {viewingOrder.createdAt?.toDate
                    ? formatDate(viewingOrder.createdAt.toDate())
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Estado</p>
                {getStatusBadge(viewingOrder.status)}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-2">Productos</p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-center">Cant.</th>
                      <th className="px-3 py-2 text-right">P. Unit.</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingOrder.items?.map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2 text-center">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice || item.price || 0)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency((item.unitPrice || item.price || 0) * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t">
              <div className="text-right">
                <p className="text-sm text-gray-500">Subtotal: {formatCurrency(viewingOrder.subtotal || 0)}</p>
                <p className="text-sm text-gray-500">IGV: {formatCurrency(viewingOrder.igv || 0)}</p>
                <p className="text-lg font-bold text-primary-600">Total: {formatCurrency(viewingOrder.total || 0)}</p>
              </div>
            </div>

            {viewingOrder.notes && (
              <div>
                <p className="text-sm text-gray-500">Observaciones</p>
                <p className="text-sm">{viewingOrder.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingOrder}
        onClose={() => setDeletingOrder(null)}
        title="Eliminar Orden de Compra"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            ¿Estás seguro de que deseas eliminar la orden <strong>{deletingOrder?.number}</strong>?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeletingOrder(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <CreatePurchaseOrderModal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false)
            setEditingOrder(null)
          }}
          onSuccess={() => {
            setShowCreateModal(false)
            setEditingOrder(null)
            loadData()
          }}
          suppliers={suppliers}
          companySettings={companySettings}
          editingOrder={editingOrder}
        />
      )}
    </div>
  )
}
