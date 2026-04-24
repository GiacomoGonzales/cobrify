import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { updateOrderStatus } from '@/services/orderService'
import { getCompanySettings } from '@/services/firestoreService'
import { generateOrderPDF } from '@/utils/orderPdfGenerator'
import OrderTicketPrint from '@/components/OrderTicketPrint'
import { useReactToPrint } from 'react-to-print'
import {
  ShoppingBag, MessageCircle, CheckCircle, XCircle, Clock, MapPin, Phone,
  User, ChevronDown, ChevronUp, Package, Search, Loader2, RefreshCcw,
  AlertCircle, Smartphone, Mail, Printer, FileText
} from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Input from '@/components/ui/Input'

const STATUS_CONFIG = {
  pending: {
    label: 'Nuevo',
    chipClass: 'bg-amber-100 text-amber-800 border-amber-300',
    cardClass: 'border-l-4 border-l-amber-500',
    icon: Clock,
  },
  contacted: {
    label: 'Contactado',
    chipClass: 'bg-blue-100 text-blue-800 border-blue-300',
    cardClass: 'border-l-4 border-l-blue-500',
    icon: MessageCircle,
  },
  completed: {
    label: 'Completado',
    chipClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    cardClass: 'border-l-4 border-l-emerald-500',
    icon: CheckCircle,
  },
  cancelled: {
    label: 'Cancelado',
    chipClass: 'bg-red-100 text-red-800 border-red-300',
    cardClass: 'border-l-4 border-l-red-500 opacity-60',
    icon: XCircle,
  },
}

const timeAgo = (ts) => {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts))
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Hace un instante'
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `Hace ${days} d`
}

const formatDateTime = (ts) => {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts))
  return date.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

export default function OnlineOrders() {
  const { user, getBusinessId } = useAppContext()
  const toast = useToast()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedOrders, setExpandedOrders] = useState({})
  const [updatingOrderId, setUpdatingOrderId] = useState(null)
  const [companySettings, setCompanySettings] = useState(null)
  const [orderToPrint, setOrderToPrint] = useState(null)
  const [generatingPdfFor, setGeneratingPdfFor] = useState(null)
  const printRef = useRef(null)

  // Cargar datos del negocio para header del ticket/PDF
  useEffect(() => {
    if (!user?.uid) return
    const businessId = getBusinessId()
    if (!businessId) return
    getCompanySettings(businessId).then(result => {
      if (result.success) setCompanySettings(result.data)
    })
  }, [user?.uid, getBusinessId])

  // Hook de impresión web
  const handleWebPrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => setOrderToPrint(null),
  })

  const handlePrintTicket = (order) => {
    setOrderToPrint(order)
    // Delay mínimo para que React renderice el contenido antes de imprimir
    setTimeout(() => handleWebPrint(), 150)
  }

  const handleDownloadPdf = async (order) => {
    setGeneratingPdfFor(order.id)
    try {
      await generateOrderPDF(order, companySettings || {})
      toast.success('PDF generado')
    } catch (err) {
      console.error('Error generando PDF:', err)
      toast.error('Error al generar el PDF')
    } finally {
      setGeneratingPdfFor(null)
    }
  }

  // Listener en tiempo real
  useEffect(() => {
    if (!user?.uid) return
    const businessId = getBusinessId()
    if (!businessId) return

    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    const q = query(ordersRef, where('source', '==', 'menu_digital'))

    const unsub = onSnapshot(q, (snapshot) => {
      const data = []
      snapshot.forEach(d => data.push({ id: d.id, ...d.data() }))
      data.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0
        const tb = b.createdAt?.toMillis?.() || 0
        return tb - ta
      })
      setOrders(data)
      setLoading(false)
    }, (error) => {
      console.error('Error listening to online orders:', error)
      setLoading(false)
    })

    return () => unsub()
  }, [user?.uid, getBusinessId])

  // Normalizar status: si no es un estado válido del retail, agruparlo como pending
  const normalizedOrders = useMemo(() => orders.map(o => {
    const validStatuses = ['pending', 'contacted', 'completed', 'cancelled']
    // Restaurantes pueden tener 'preparing', 'ready', etc. — los agrupamos como pending para retail
    const status = validStatuses.includes(o.status) ? o.status : 'pending'
    return { ...o, status }
  }), [orders])

  const stats = useMemo(() => ({
    pending: normalizedOrders.filter(o => o.status === 'pending').length,
    contacted: normalizedOrders.filter(o => o.status === 'contacted').length,
    completed: normalizedOrders.filter(o => o.status === 'completed').length,
    cancelled: normalizedOrders.filter(o => o.status === 'cancelled').length,
    total: normalizedOrders.length,
  }), [normalizedOrders])

  const filteredOrders = useMemo(() => normalizedOrders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim()
      const matches =
        (o.customerName || '').toLowerCase().includes(term) ||
        String(o.orderNumber || '').toLowerCase().includes(term) ||
        (o.customerPhone || '').includes(term)
      if (!matches) return false
    }
    return true
  }), [normalizedOrders, statusFilter, searchTerm])

  const toggleExpand = (orderId) => {
    setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }))
  }

  const handleChangeStatus = async (order, newStatus, successMessage) => {
    setUpdatingOrderId(order.id)
    try {
      const result = await updateOrderStatus(getBusinessId(), order.id, newStatus)
      if (result.success) {
        toast.success(successMessage || 'Pedido actualizado')
      } else {
        toast.error(result.error || 'Error al actualizar')
      }
    } catch (err) {
      toast.error('Error al actualizar')
      console.error(err)
    } finally {
      setUpdatingOrderId(null)
    }
  }

  const handleWhatsApp = async (order) => {
    if (!order.customerPhone) {
      toast.error('Este pedido no tiene teléfono de contacto')
      return
    }
    const phone = order.customerPhone.replace(/\D/g, '')
    const itemsText = (order.items || [])
      .map(i => `• ${i.quantity}x ${i.name}`)
      .join('\n')
    const message = encodeURIComponent(
      `¡Hola ${order.customerName || ''}! 👋\n\n` +
      `Recibimos tu pedido #${order.orderNumber || ''}:\n\n${itemsText}\n\n` +
      `Total: S/ ${(order.total || 0).toFixed(2)}\n\n` +
      `¿Cómo podemos ayudarte con tu pedido?`
    )
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank')

    if (order.status === 'pending') {
      await handleChangeStatus(order, 'contacted', 'Marcado como contactado')
    }
  }

  const tabs = [
    { id: 'pending', label: 'Nuevos', count: stats.pending, color: 'amber' },
    { id: 'contacted', label: 'Contactados', count: stats.contacted, color: 'blue' },
    { id: 'completed', label: 'Completados', count: stats.completed, color: 'emerald' },
    { id: 'cancelled', label: 'Cancelados', count: stats.cancelled, color: 'red' },
    { id: 'all', label: 'Todos', count: stats.total, color: 'gray' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-primary-600" />
            Pedidos Online
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Pedidos recibidos desde tu catálogo digital
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Nuevos" value={stats.pending} color="amber" icon={Clock} />
        <StatCard label="Contactados" value={stats.contacted} color="blue" icon={MessageCircle} />
        <StatCard label="Completados" value={stats.completed} color="emerald" icon={CheckCircle} />
        <StatCard label="Total" value={stats.total} color="gray" icon={Package} />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 space-y-2">
          {/* Tabs de estado */}
          <div className="flex flex-wrap gap-2">
            {tabs.map(tab => {
              const active = statusFilter === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    active
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      active ? 'bg-white/30' : 'bg-white'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por cliente, número o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista de pedidos */}
      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">
              {statusFilter === 'pending'
                ? 'No tienes pedidos nuevos por atender'
                : 'No hay pedidos que coincidan con los filtros'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Los pedidos que hagan tus clientes desde el catálogo aparecerán aquí
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              isExpanded={!!expandedOrders[order.id]}
              onToggleExpand={() => toggleExpand(order.id)}
              onChangeStatus={handleChangeStatus}
              onWhatsApp={handleWhatsApp}
              onPrintTicket={handlePrintTicket}
              onDownloadPdf={handleDownloadPdf}
              isUpdating={updatingOrderId === order.id}
              isGeneratingPdf={generatingPdfFor === order.id}
            />
          ))}
        </div>
      )}

      {/* Ticket oculto para impresión web */}
      <div style={{ display: 'none' }}>
        {orderToPrint && (
          <OrderTicketPrint
            ref={printRef}
            order={orderToPrint}
            companySettings={companySettings || {}}
          />
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color, icon: Icon }) {
  const colorMap = {
    amber: 'text-amber-600 bg-amber-50',
    blue: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    gray: 'text-gray-600 bg-gray-50',
  }
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.gray}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-gray-500 leading-tight">{label}</p>
            <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OrderCard({ order, isExpanded, onToggleExpand, onChangeStatus, onWhatsApp, onPrintTicket, onDownloadPdf, isUpdating, isGeneratingPdf }) {
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const hasAddress = !!order.customerAddress

  const itemsToShow = isExpanded ? (order.items || []) : (order.items || []).slice(0, 3)
  const hasMoreItems = (order.items || []).length > 3

  return (
    <Card className={config.cardClass}>
      <CardContent className="p-3 space-y-2.5">
        {/* Header: número + estado + tiempo */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-gray-900 text-lg">
              <Smartphone className="w-4 h-4 text-gray-400" />
              #{order.orderNumber || order.id.slice(0, 6)}
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${config.chipClass}`}>
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </span>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(order.createdAt)}
            </p>
            <p className="text-xs text-gray-400" title={formatDateTime(order.createdAt)}>
              {formatDateTime(order.createdAt).split(',')[0]}
            </p>
          </div>
        </div>

        {/* Info del cliente */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {order.customerName && (
            <div className="flex items-center gap-2 text-gray-700">
              <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="font-medium truncate">{order.customerName}</span>
            </div>
          )}
          {order.customerPhone && (
            <div className="flex items-center gap-2 text-gray-700">
              <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <a href={`tel:${order.customerPhone}`} className="hover:text-primary-600 truncate">
                {order.customerPhone}
              </a>
            </div>
          )}
          {order.customerEmail && (
            <div className="flex items-center gap-2 text-gray-700">
              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <a href={`mailto:${order.customerEmail}`} className="hover:text-primary-600 truncate">
                {order.customerEmail}
              </a>
            </div>
          )}
          {hasAddress && (
            <div className="flex items-start gap-2 text-gray-700 sm:col-span-2">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="break-words">{order.customerAddress}</span>
                {order.customerCoords && (
                  <a
                    href={`https://www.google.com/maps?q=${order.customerCoords.lat},${order.customerCoords.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline ml-2 inline-flex items-center gap-0.5"
                  >
                    Ver en mapa
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {order.notes && (
          <div className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
            <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <span className="text-yellow-900"><strong>Notas:</strong> {order.notes}</span>
          </div>
        )}

        {/* Items */}
        <div className="space-y-1 bg-gray-50 rounded-lg p-3">
          {itemsToShow.map((item, i) => (
            <div key={i} className="flex justify-between items-start text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900">{item.quantity}x</span>{' '}
                <span className="text-gray-700">{item.name}</span>
                {item.isVariant && item.variantAttributes && (
                  <span className="text-xs text-gray-500 ml-1">
                    ({Object.entries(item.variantAttributes).map(([k, v]) => `${k}: ${v}`).join(', ')})
                  </span>
                )}
              </div>
              <span className="text-gray-600 whitespace-nowrap ml-2">S/ {(item.total || item.price * item.quantity || 0).toFixed(2)}</span>
            </div>
          ))}
          {hasMoreItems && !isExpanded && (
            <button
              onClick={onToggleExpand}
              className="text-xs text-primary-600 hover:underline flex items-center gap-1 mt-1"
            >
              <ChevronDown className="w-3 h-3" />
              Ver {(order.items || []).length - 3} más
            </button>
          )}
          {hasMoreItems && isExpanded && (
            <button
              onClick={onToggleExpand}
              className="text-xs text-primary-600 hover:underline flex items-center gap-1 mt-1"
            >
              <ChevronUp className="w-3 h-3" />
              Ocultar
            </button>
          )}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-sm text-gray-600">Total</span>
          <span className="text-xl font-bold text-gray-900">S/ {(order.total || 0).toFixed(2)}</span>
        </div>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t">
          {/* Primarias: rellenan el ancho disponible */}
          <div className="flex gap-2 flex-1 min-w-0">
            {(order.status === 'pending' || order.status === 'contacted') && order.customerPhone && (
              <button
                onClick={() => onWhatsApp(order)}
                disabled={isUpdating}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
            )}
            {(order.status === 'pending' || order.status === 'contacted') && !order.customerPhone && (
              <button
                onClick={() => onChangeStatus(order, 'contacted', 'Marcado como contactado')}
                disabled={isUpdating}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Contactado
              </button>
            )}
            {(order.status === 'pending' || order.status === 'contacted') && (
              <button
                onClick={() => onChangeStatus(order, 'completed', 'Pedido completado')}
                disabled={isUpdating}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Completar
              </button>
            )}
            {(order.status === 'completed' || order.status === 'cancelled') && (
              <button
                onClick={() => onChangeStatus(order, 'pending', 'Pedido reabierto')}
                disabled={isUpdating}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                Reabrir pedido
              </button>
            )}
          </div>

          {/* Utilitarios: iconos discretos */}
          <div className="flex items-center justify-end gap-1 sm:border-l sm:border-gray-200 sm:pl-2">
            <IconAction
              icon={Printer}
              label="Imprimir ticket"
              onClick={() => onPrintTicket(order)}
              disabled={isUpdating}
            />
            <IconAction
              icon={FileText}
              label="Descargar PDF"
              onClick={() => onDownloadPdf(order)}
              loading={isGeneratingPdf}
              disabled={isUpdating}
            />
            {(order.status === 'pending' || order.status === 'contacted') && (
              <IconAction
                icon={XCircle}
                label="Cancelar pedido"
                onClick={() => onChangeStatus(order, 'cancelled', 'Pedido cancelado')}
                disabled={isUpdating}
                danger
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function IconAction({ icon: Icon, label, onClick, loading, disabled, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={label}
      aria-label={label}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
        danger
          ? 'text-red-600 hover:bg-red-50 active:bg-red-100'
          : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
    </button>
  )
}
