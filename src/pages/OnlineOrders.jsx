import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useToast } from '@/contexts/ToastContext'
import { updateOrderStatus } from '@/services/orderService'
import { getCompanySettings } from '@/services/firestoreService'
import { generateOrderPDF } from '@/utils/orderPdfGenerator'
import OrderTicketPrint from '@/components/OrderTicketPrint'
import { useReactToPrint } from 'react-to-print'
import {
  ShoppingBag, MessageCircle, CheckCircle, XCircle, Clock, MapPin, Phone,
  User, ChevronDown, ChevronUp, Package, Search, Loader2,
  AlertCircle, Smartphone, Mail, Printer, FileText, ShoppingCart,
  PackageCheck, ThumbsUp, Ban, DollarSign, Calendar, Inbox, Archive, Sparkles
} from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'

const STATUS_CONFIG = {
  pending: {
    label: 'Recibido',
    chipClass: 'bg-amber-100 text-amber-800 border-amber-300',
    cardClass: 'border-l-4 border-l-amber-500',
    icon: Clock,
  },
  accepted: {
    label: 'Aceptado',
    chipClass: 'bg-blue-100 text-blue-800 border-blue-300',
    cardClass: 'border-l-4 border-l-blue-500',
    icon: ThumbsUp,
  },
  ready: {
    label: 'Listo',
    chipClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    cardClass: 'border-l-4 border-l-indigo-500',
    icon: PackageCheck,
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

// Umbral (en minutos) a partir del cual un pedido "Nuevo" se marca como urgente
const URGENT_THRESHOLD_MIN = 30

const DATE_RANGES = [
  { id: '1d', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'all', label: 'Todo' },
  { id: 'custom', label: 'Personalizado' },
]

const minutesSince = (ts) => {
  if (!ts) return 0
  const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts))
  return Math.floor((Date.now() - date.getTime()) / 60000)
}

const timeAgo = (ts) => {
  if (!ts) return ''
  const mins = minutesSince(ts)
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

// Devuelve los límites de fecha para un preset dado
const getRangeBounds = (preset, customFrom, customTo) => {
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
  if (preset === 'custom') {
    return {
      from: customFrom ? new Date(customFrom + 'T00:00:00') : null,
      to: customTo ? new Date(customTo + 'T23:59:59') : null,
    }
  }
  return { from: null, to: null } // 'all'
}

const formatMoney = (n) => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Identificador único del cliente (teléfono normalizado o email)
const customerKey = (order) => {
  const phone = (order.customerPhone || '').replace(/\D/g, '')
  const phoneKey = phone.length >= 6 ? phone.slice(-9) : '' // últimos 9 dígitos
  const emailKey = (order.customerEmail || '').toLowerCase().trim()
  return phoneKey || emailKey || null
}

// "hoy", "ayer", "hace 5 días", "hace 2 meses"
const relativeDate = (ts) => {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  const diffMs = Date.now() - date.getTime()
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (days < 1) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  if (months < 12) return `hace ${months} mes${months > 1 ? 'es' : ''}`
  const years = Math.floor(days / 365)
  return `hace ${years} año${years > 1 ? 's' : ''}`
}

// Posición ordinal con sufijo español (1°, 2°, 3°)
const ordinal = (n) => `${n}°`

export default function OnlineOrders() {
  const { user, getBusinessId } = useAppContext()
  const appNavigate = useAppNavigate()
  const toast = useToast()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('active') // 'active' | 'history'
  const [statusFilter, setStatusFilter] = useState('pending')
  const [dateRange, setDateRange] = useState('30d') // '1d', '7d', '30d', 'month', 'all', 'custom'
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedOrders, setExpandedOrders] = useState({})
  const [updatingOrderId, setUpdatingOrderId] = useState(null)
  const [companySettings, setCompanySettings] = useState(null)
  const [orderToPrint, setOrderToPrint] = useState(null)
  const [generatingPdfFor, setGeneratingPdfFor] = useState(null)
  const [detailOrderId, setDetailOrderId] = useState(null)
  // Tick cada 60s para refrescar "Hace X min" y el marcador de urgencia
  const [, setNowTick] = useState(0)
  const printRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Cambiar de vista reinicia el filtro de estado al primer tab relevante
  useEffect(() => {
    setStatusFilter(viewMode === 'active' ? 'pending' : 'completed')
  }, [viewMode])

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

  const handleLoadToPOS = (order) => {
    appNavigate('/pos', {
      state: {
        fromOnlineOrder: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        items: (order.items || []).map(item => ({
          id: item.productId || item.itemId || item.id,
          productId: item.productId || '',
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          unit: 'NIU',
          ...(item.isVariant && {
            isVariant: true,
            variantSku: item.variantSku,
            variantAttributes: item.variantAttributes,
          }),
        })),
        customer: {
          name: order.customerName || '',
          email: order.customerEmail || '',
          phone: order.customerPhone || '',
          address: order.customerAddress || '',
        },
        notes: order.notes || '',
      },
    })
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

  // Mapa cliente → lista de sus pedidos (excluye cancelados para no inflar el contador)
  // Los pedidos vienen ordenados de más recientes a más antiguos (por el listener),
  // acá los reordenamos cronológicamente ascendente para calcular posición.
  const customersMap = useMemo(() => {
    const map = new Map()
    const sorted = [...orders]
      .filter(o => o.status !== 'cancelled')
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0
        const tb = b.createdAt?.toMillis?.() || 0
        return ta - tb
      })
    for (const o of sorted) {
      const key = customerKey(o)
      if (!key) continue
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(o)
    }
    return map
  }, [orders])

  // Dado un pedido, devuelve { position, prev } si es recurrente; null si es el primero o sin datos
  const getCustomerBadge = (order) => {
    const key = customerKey(order)
    if (!key) return null
    const customerOrders = customersMap.get(key) || []
    const idx = customerOrders.findIndex(o => o.id === order.id)
    if (idx <= 0) return null // Primer pedido del cliente (o no encontrado)
    return {
      position: idx + 1,
      prev: customerOrders[idx - 1],
    }
  }

  // Normalizar status para la UI de retail
  // - contacted (legacy) → accepted
  // - preparing, dispatched (de restaurante) → accepted
  // - todo lo desconocido → pending
  const normalizedOrders = useMemo(() => orders.map(o => {
    let status = o.status
    if (status === 'contacted' || status === 'preparing' || status === 'dispatched') {
      status = 'accepted'
    }
    const validStatuses = ['pending', 'accepted', 'ready', 'completed', 'cancelled']
    if (!validStatuses.includes(status)) status = 'pending'
    return { ...o, status }
  }), [orders])

  // Pedidos del modo actual (activos vs historial)
  const ordersByMode = useMemo(() => {
    const active = ['pending', 'accepted', 'ready']
    const finalized = ['completed', 'cancelled']
    const target = viewMode === 'active' ? active : finalized
    return normalizedOrders.filter(o => target.includes(o.status))
  }, [normalizedOrders, viewMode])

  // En modo historial se aplica el rango de fechas; en modo activo se muestran todos
  const ordersInRange = useMemo(() => {
    if (viewMode === 'active') return ordersByMode
    const { from, to } = getRangeBounds(dateRange, customFrom, customTo)
    if (!from && !to) return ordersByMode
    return ordersByMode.filter(o => {
      const created = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt ? new Date(o.createdAt) : null)
      if (!created) return true
      if (from && created < from) return false
      if (to && created > to) return false
      return true
    })
  }, [ordersByMode, viewMode, dateRange, customFrom, customTo])

  const stats = useMemo(() => {
    const completed = ordersInRange.filter(o => o.status === 'completed')
    return {
      pending: ordersInRange.filter(o => o.status === 'pending').length,
      accepted: ordersInRange.filter(o => o.status === 'accepted').length,
      ready: ordersInRange.filter(o => o.status === 'ready').length,
      completed: completed.length,
      cancelled: ordersInRange.filter(o => o.status === 'cancelled').length,
      total: ordersInRange.length,
      revenue: completed.reduce((sum, o) => sum + (o.total || 0), 0),
      avgTicket: completed.length > 0
        ? completed.reduce((sum, o) => sum + (o.total || 0), 0) / completed.length
        : 0,
    }
  }, [ordersInRange])

  const filteredOrders = useMemo(() => ordersInRange.filter(o => {
    // Filtro "En proceso" agrupa aceptados + listos
    if (statusFilter === 'in_progress' && o.status !== 'accepted' && o.status !== 'ready') return false
    if (statusFilter !== 'all' && statusFilter !== 'in_progress' && o.status !== statusFilter) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim()
      const matches =
        (o.customerName || '').toLowerCase().includes(term) ||
        String(o.orderNumber || '').toLowerCase().includes(term) ||
        (o.customerPhone || '').includes(term)
      if (!matches) return false
    }
    return true
  }), [ordersInRange, statusFilter, searchTerm])

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
  }

  const inProgressCount = stats.accepted + stats.ready
  const tabs = viewMode === 'active'
    ? [
        { id: 'pending', label: 'Recibidos', count: stats.pending },
        { id: 'in_progress', label: 'En proceso', count: inProgressCount },
        { id: 'all', label: 'Todos los activos', count: stats.total },
      ]
    : [
        { id: 'completed', label: 'Completados', count: stats.completed },
        { id: 'cancelled', label: 'Cancelados', count: stats.cancelled },
        { id: 'all', label: 'Todos', count: stats.total },
      ]

  // Totales para el toggle de modo (contador de pendientes por gestionar)
  const activeTotal = useMemo(
    () => normalizedOrders.filter(o => ['pending', 'accepted', 'ready'].includes(o.status)).length,
    [normalizedOrders]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header + toggle de modo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-primary-600" />
            Pedidos Online
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {viewMode === 'active'
              ? 'Pedidos por gestionar'
              : 'Pedidos finalizados (completados y cancelados)'}
          </p>
        </div>

        {/* Toggle Gestión / Historial */}
        <div className="inline-flex p-1 bg-gray-100 rounded-lg self-start sm:self-auto">
          <button
            onClick={() => setViewMode('active')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'active'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Inbox className="w-4 h-4" />
            En gestión
            {activeTotal > 0 && viewMode !== 'active' && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
                {activeTotal}
              </span>
            )}
            {activeTotal > 0 && viewMode === 'active' && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">
                {activeTotal}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode('history')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'history'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Archive className="w-4 h-4" />
            Historial
          </button>
        </div>
      </div>

      {/* Stats cards: cambian según el modo */}
      {viewMode === 'active' ? (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Recibidos" value={stats.pending} color="amber" icon={Clock} />
          <StatCard label="Aceptados" value={stats.accepted} color="blue" icon={ThumbsUp} />
          <StatCard label="Listos" value={stats.ready} color="blue" icon={PackageCheck} />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Facturado"
            value={formatMoney(stats.revenue)}
            helper={stats.completed > 0 ? `${stats.completed} pedido${stats.completed > 1 ? 's' : ''} · prom. ${formatMoney(stats.avgTicket)}` : 'Sin ventas en el rango'}
            color="emerald"
            icon={DollarSign}
            prominent
          />
          <StatCard label="Completados" value={stats.completed} color="emerald" icon={CheckCircle} />
          <StatCard label="Cancelados" value={stats.cancelled} color="gray" icon={XCircle} />
          <StatCard label="Total" value={stats.total} color="gray" icon={Package} />
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 space-y-2.5">
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

          {/* Rango de fechas (solo en modo historial) */}
          {viewMode === 'history' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t">
              <Calendar className="w-4 h-4 text-gray-400 mr-0.5" />
              {DATE_RANGES.map(r => {
                const active = dateRange === r.id
                return (
                  <button
                    key={r.id}
                    onClick={() => setDateRange(r.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Rango personalizado (desde/hasta) */}
          {viewMode === 'history' && dateRange === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <label className="flex-1 flex items-center gap-2 text-sm text-gray-600">
                <span className="whitespace-nowrap">Desde</span>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="text-sm"
                />
              </label>
              <label className="flex-1 flex items-center gap-2 text-sm text-gray-600">
                <span className="whitespace-nowrap">Hasta</span>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="text-sm"
                />
              </label>
            </div>
          )}

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
            {viewMode === 'active' ? <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" /> : <Archive className="w-12 h-12 text-gray-300 mx-auto mb-3" />}
            <p className="text-gray-500 font-medium">
              {viewMode === 'active'
                ? statusFilter === 'pending'
                  ? 'No tienes pedidos nuevos por atender'
                  : 'No hay pedidos por gestionar'
                : 'No hay pedidos en el historial del rango seleccionado'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {viewMode === 'active'
                ? 'Los pedidos que hagan tus clientes desde el catálogo aparecerán aquí'
                : 'Cambia el rango de fechas para ver más'}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'history' ? (
        <Card>
          <div className="divide-y divide-gray-100">
            {filteredOrders.map(order => (
              <OrderListRow
                key={order.id}
                order={order}
                customerBadge={getCustomerBadge(order)}
                onOpenDetail={() => setDetailOrderId(order.id)}
                onPrintTicket={handlePrintTicket}
                onDownloadPdf={handleDownloadPdf}
                isGeneratingPdf={generatingPdfFor === order.id}
              />
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filteredOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              customerBadge={getCustomerBadge(order)}
              isExpanded={!!expandedOrders[order.id]}
              onToggleExpand={() => toggleExpand(order.id)}
              onChangeStatus={handleChangeStatus}
              onWhatsApp={handleWhatsApp}
              onPrintTicket={handlePrintTicket}
              onDownloadPdf={handleDownloadPdf}
              onLoadToPOS={handleLoadToPOS}
              onOpenDetail={() => setDetailOrderId(order.id)}
              isUpdating={updatingOrderId === order.id}
              isGeneratingPdf={generatingPdfFor === order.id}
            />
          ))}
        </div>
      )}

      {/* Modal de detalle + timeline */}
      <OrderDetailModal
        isOpen={!!detailOrderId}
        order={normalizedOrders.find(o => o.id === detailOrderId) || null}
        customerBadge={(() => {
          const o = normalizedOrders.find(o => o.id === detailOrderId)
          return o ? getCustomerBadge(o) : null
        })()}
        onClose={() => setDetailOrderId(null)}
        onChangeStatus={handleChangeStatus}
        onWhatsApp={handleWhatsApp}
        onPrintTicket={handlePrintTicket}
        onDownloadPdf={handleDownloadPdf}
        onLoadToPOS={handleLoadToPOS}
        isUpdating={updatingOrderId === detailOrderId}
        isGeneratingPdf={generatingPdfFor === detailOrderId}
      />

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

function StatCard({ label, value, helper, color, icon: Icon, prominent = false }) {
  const colorMap = {
    amber: 'text-amber-600 bg-amber-50',
    blue: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    gray: 'text-gray-600 bg-gray-50',
  }
  const isProminent = prominent
  return (
    <Card className={isProminent ? 'ring-2 ring-emerald-200 bg-gradient-to-br from-emerald-50 to-white' : ''}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2.5">
          <div className={`${isProminent ? 'w-10 h-10' : 'w-9 h-9'} rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.gray}`}>
            <Icon className={isProminent ? 'w-5 h-5' : 'w-4 h-4'} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 leading-tight">{label}</p>
            <p className={`${isProminent ? 'text-lg' : 'text-xl'} font-bold text-gray-900 leading-tight truncate`}>{value}</p>
            {helper && <p className="text-[10px] text-gray-500 leading-tight mt-0.5 truncate">{helper}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OrderCard({ order, customerBadge, isExpanded, onToggleExpand, onChangeStatus, onWhatsApp, onPrintTicket, onDownloadPdf, onLoadToPOS, onOpenDetail, isUpdating, isGeneratingPdf }) {
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const hasAddress = !!order.customerAddress
  const ageMin = minutesSince(order.createdAt)
  const isActive = ['pending', 'accepted', 'ready'].includes(order.status)
  const isUrgent = order.status === 'pending' && ageMin >= URGENT_THRESHOLD_MIN

  const itemsToShow = isExpanded ? (order.items || []) : (order.items || []).slice(0, 3)
  const hasMoreItems = (order.items || []).length > 3

  return (
    <Card className={`${config.cardClass} ${isUrgent ? '!border-l-red-600 bg-red-50/40 ring-1 ring-red-200' : ''}`}>
      {isUrgent && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-t-[inherit]">
          <AlertCircle className="w-4 h-4 animate-pulse flex-shrink-0" />
          <span>Sin atender hace {ageMin < 60 ? `${ageMin} min` : `${Math.floor(ageMin / 60)} h ${ageMin % 60} min`}</span>
        </div>
      )}
      <CardContent className="p-3 space-y-2.5">
        {/* Header: número + estado + tiempo (clickable para abrir detalle) */}
        <div
          className="flex items-start justify-between gap-3 cursor-pointer group"
          onClick={onOpenDetail}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenDetail?.()}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-gray-900 text-lg group-hover:text-primary-600 transition-colors">
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

        {/* Chip de cliente recurrente */}
        {customerBadge && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5 w-fit">
            <Sparkles className="w-3 h-3" />
            <span>
              {ordinal(customerBadge.position)} pedido · último {relativeDate(customerBadge.prev.createdAt)}
            </span>
          </div>
        )}

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
        <div className="flex flex-col gap-2 pt-3 border-t">
          {/* Paso 1 — Recibido: Aceptar o Rechazar */}
          {order.status === 'pending' && (
            <div className="flex gap-2">
              <button
                onClick={() => onChangeStatus(order, 'accepted', 'Pedido aceptado')}
                disabled={isUpdating}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                Aceptar
              </button>
              <button
                onClick={() => onChangeStatus(order, 'cancelled', 'Pedido rechazado')}
                disabled={isUpdating}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 border border-red-300 text-red-700 bg-white hover:bg-red-50 active:bg-red-100 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                Rechazar
              </button>
            </div>
          )}

          {/* Paso 2 — Aceptado: Marcar Listo */}
          {order.status === 'accepted' && (
            <button
              onClick={() => onChangeStatus(order, 'ready', 'Pedido listo')}
              disabled={isUpdating}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
              Marcar listo
            </button>
          )}

          {/* Paso 3 — Listo: Cobrar en POS (auto-completa al facturar) */}
          {order.status === 'ready' && (
            <button
              onClick={() => onLoadToPOS(order)}
              disabled={isUpdating}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              <ShoppingCart className="w-4 h-4" />
              Cobrar en POS
            </button>
          )}

          {/* Acciones secundarias cuando el pedido sigue activo */}
          {isActive && (
            <div className="flex items-center gap-1.5">
              {order.customerPhone && (
                <button
                  onClick={() => onWhatsApp(order)}
                  disabled={isUpdating}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </button>
              )}
              <div className={`flex items-center gap-0.5 ${order.customerPhone ? 'ml-auto pl-1.5 border-l border-gray-200' : 'w-full justify-end'}`}>
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
                {/* Cancelar solo en aceptado/listo (en recibido ya hay "Rechazar") */}
                {(order.status === 'accepted' || order.status === 'ready') && (
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
          )}

          {/* Pedidos cerrados: solo imprimir/PDF */}
          {!isActive && (
            <div className="flex items-center justify-end gap-0.5">
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
            </div>
          )}
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

function OrderListRow({ order, customerBadge, onOpenDetail, onPrintTicket, onDownloadPdf, isGeneratingPdf }) {
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.completed
  const StatusIcon = config.icon
  const items = order.items || []
  const total = order.total ?? items.reduce((s, i) => s + (i.total || i.price * i.quantity || 0), 0)

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={onOpenDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenDetail?.()}
    >
      {/* # pedido */}
      <div className="flex-shrink-0 w-20 sm:w-24">
        <div className="font-semibold text-gray-900 text-sm">#{order.orderNumber || order.id.slice(0, 6)}</div>
        <div className="text-[10px] text-gray-500 sm:hidden">{formatDateTime(order.createdAt).split(',')[0]}</div>
      </div>

      {/* Cliente */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
          <span className="truncate">{order.customerName || 'Sin nombre'}</span>
          {customerBadge && (
            <span
              className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-1.5 py-0"
              title={`${ordinal(customerBadge.position)} pedido · último ${relativeDate(customerBadge.prev.createdAt)}`}
            >
              <Sparkles className="w-2.5 h-2.5" />
              {ordinal(customerBadge.position)}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {order.customerPhone || order.customerEmail || '—'}
        </div>
      </div>

      {/* Fecha (solo desktop) */}
      <div className="hidden sm:block text-xs text-gray-500 w-32 flex-shrink-0">
        {formatDateTime(order.createdAt)}
      </div>

      {/* Items (solo desktop) */}
      <div className="hidden md:block text-xs text-gray-600 w-20 flex-shrink-0 text-right">
        {items.length} item{items.length !== 1 ? 's' : ''}
      </div>

      {/* Total */}
      <div className="w-20 sm:w-24 flex-shrink-0 text-right">
        <div className="font-semibold text-gray-900 text-sm">S/ {Number(total).toFixed(2)}</div>
      </div>

      {/* Estado */}
      <div className="flex-shrink-0">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${config.chipClass}`}>
          <StatusIcon className="w-3 h-3" />
          <span className="hidden sm:inline">{config.label}</span>
        </span>
      </div>

      {/* Acciones (solo desktop para no saturar) */}
      <div
        className="hidden sm:flex items-center gap-0.5 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <IconAction
          icon={Printer}
          label="Imprimir ticket"
          onClick={() => onPrintTicket(order)}
        />
        <IconAction
          icon={FileText}
          label="Descargar PDF"
          onClick={() => onDownloadPdf(order)}
          loading={isGeneratingPdf}
        />
      </div>
    </div>
  )
}

function OrderDetailModal({ isOpen, order, customerBadge, onClose, onChangeStatus, onWhatsApp, onPrintTicket, onDownloadPdf, onLoadToPOS, isUpdating, isGeneratingPdf }) {
  if (!order) return null
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const items = order.items || []
  const subtotal = order.subtotal ?? 0
  const tax = order.tax ?? 0
  const total = order.total ?? items.reduce((s, i) => s + (i.total || i.price * i.quantity || 0), 0)
  const history = order.statusHistory || []
  const isActive = ['pending', 'accepted', 'ready'].includes(order.status)

  const handleAction = (fn) => () => {
    fn?.()
    onClose?.()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" fullScreenMobile>
      <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white rounded-t-lg z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 font-bold text-gray-900 text-lg">
            <Smartphone className="w-5 h-5 text-gray-400" />
            Pedido #{order.orderNumber || order.id.slice(0, 6)}
          </div>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${config.chipClass}`}>
            <StatusIcon className="w-3 h-3" />
            {config.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100"
          aria-label="Cerrar"
        >
          <XCircle className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-4 overflow-y-auto lg:max-h-[70vh]">
        {/* Cliente */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente</h3>
            {customerBadge && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">
                <Sparkles className="w-3 h-3" />
                {ordinal(customerBadge.position)} pedido · último {relativeDate(customerBadge.prev.createdAt)}
              </span>
            )}
          </div>
          <div className="space-y-1.5 text-sm">
            {order.customerName && (
              <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /><span className="font-medium">{order.customerName}</span></div>
            )}
            {order.customerPhone && (
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /><a href={`tel:${order.customerPhone}`} className="hover:text-primary-600">{order.customerPhone}</a></div>
            )}
            {order.customerEmail && (
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /><a href={`mailto:${order.customerEmail}`} className="hover:text-primary-600 break-all">{order.customerEmail}</a></div>
            )}
            {order.customerAddress && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="break-words">{order.customerAddress}</div>
                  {order.customerCoords && (
                    <a
                      href={`https://www.google.com/maps?q=${order.customerCoords.lat},${order.customerCoords.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver en Google Maps ↗
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Productos */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Productos ({items.length})</h3>
          <div className="divide-y border rounded-lg">
            {items.map((item, idx) => {
              const qty = item.quantity || 1
              const price = item.price || 0
              const itemTotal = item.total || (price * qty)
              return (
                <div key={idx} className="p-3 flex justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-semibold">{qty}x</span> {item.name}
                    </div>
                    {item.isVariant && item.variantAttributes && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {Object.entries(item.variantAttributes).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    )}
                    {item.notes && <div className="text-xs text-yellow-700 mt-0.5">📝 {item.notes}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">S/ {price.toFixed(2)} c/u</div>
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap">S/ {itemTotal.toFixed(2)}</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Totales */}
        <section className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
          {subtotal > 0 && Math.abs(subtotal - total) > 0.01 && (
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>S/ {subtotal.toFixed(2)}</span></div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-gray-600"><span>IGV</span><span>S/ {tax.toFixed(2)}</span></div>
          )}
          <div className="flex justify-between pt-1 border-t text-base font-bold"><span>Total</span><span>S/ {Number(total).toFixed(2)}</span></div>
        </section>

        {/* Notas */}
        {order.notes && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notas del cliente</h3>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-900">
              {order.notes}
            </div>
          </section>
        )}

        {/* Timeline */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Historial</h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">Sin historial disponible</p>
          ) : (
            <ol className="relative border-l-2 border-gray-200 ml-2 space-y-3">
              {history.map((entry, idx) => {
                const entryConfig = STATUS_CONFIG[entry.status] || STATUS_CONFIG.pending
                const EntryIcon = entryConfig.icon
                const isCurrent = idx === history.length - 1
                const ts = entry.timestamp?.toDate ? entry.timestamp.toDate() : (entry.timestamp ? new Date(entry.timestamp) : null)
                return (
                  <li key={idx} className="ml-4">
                    <span className={`absolute -left-[11px] flex items-center justify-center w-5 h-5 rounded-full ring-2 ring-white ${isCurrent ? 'bg-primary-600' : 'bg-gray-300'}`}>
                      <EntryIcon className="w-3 h-3 text-white" />
                    </span>
                    <div className="text-sm font-semibold text-gray-900">{entryConfig.label}</div>
                    {ts && (
                      <div className="text-xs text-gray-500">
                        {ts.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })}
                      </div>
                    )}
                    {entry.note && <div className="text-xs text-gray-600 mt-0.5">{entry.note}</div>}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      {/* Footer con acciones */}
      {isActive && (
        <div className="border-t p-3 bg-gray-50 rounded-b-lg">
          <div className="flex flex-wrap gap-2">
            {order.status === 'pending' && (
              <>
                <button
                  onClick={handleAction(() => onChangeStatus(order, 'accepted', 'Pedido aceptado'))}
                  disabled={isUpdating}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  <ThumbsUp className="w-4 h-4" />
                  Aceptar
                </button>
                <button
                  onClick={handleAction(() => onChangeStatus(order, 'cancelled', 'Pedido rechazado'))}
                  disabled={isUpdating}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-red-300 text-red-700 bg-white hover:bg-red-50 text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  <Ban className="w-4 h-4" />
                  Rechazar
                </button>
              </>
            )}
            {order.status === 'accepted' && (
              <button
                onClick={handleAction(() => onChangeStatus(order, 'ready', 'Pedido listo'))}
                disabled={isUpdating}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                <PackageCheck className="w-4 h-4" />
                Marcar listo
              </button>
            )}
            {order.status === 'ready' && (
              <button
                onClick={handleAction(() => onLoadToPOS(order))}
                disabled={isUpdating}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                <ShoppingCart className="w-4 h-4" />
                Cobrar en POS
              </button>
            )}
            {order.customerPhone && (
              <button
                onClick={() => onWhatsApp(order)}
                disabled={isUpdating}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
            )}
            <div className="flex items-center gap-0.5 ml-auto">
              <IconAction icon={Printer} label="Imprimir ticket" onClick={() => onPrintTicket(order)} disabled={isUpdating} />
              <IconAction icon={FileText} label="Descargar PDF" onClick={() => onDownloadPdf(order)} loading={isGeneratingPdf} disabled={isUpdating} />
              {(order.status === 'accepted' || order.status === 'ready') && (
                <IconAction
                  icon={XCircle}
                  label="Cancelar pedido"
                  onClick={handleAction(() => onChangeStatus(order, 'cancelled', 'Pedido cancelado'))}
                  disabled={isUpdating}
                  danger
                />
              )}
            </div>
          </div>
        </div>
      )}
      {!isActive && (
        <div className="border-t p-3 bg-gray-50 rounded-b-lg flex items-center justify-end gap-0.5">
          <IconAction icon={Printer} label="Imprimir ticket" onClick={() => onPrintTicket(order)} disabled={isUpdating} />
          <IconAction icon={FileText} label="Descargar PDF" onClick={() => onDownloadPdf(order)} loading={isGeneratingPdf} disabled={isUpdating} />
        </div>
      )}
    </Modal>
  )
}
