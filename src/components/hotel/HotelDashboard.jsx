import { useState, useEffect } from 'react'
import {
  BedDouble,
  CalendarCheck,
  CalendarX,
  DollarSign,
  Loader2,
  ArrowRight,
  ShoppingCart,
  ClipboardList,
  Home,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils'
import { getRooms, getReservations } from '@/services/hotelService'
import { getRecentInvoices } from '@/services/firestoreService'

const STATUS_LABELS = {
  confirmed: 'Confirmada',
  checked_in: 'Hospedado',
  checked_out: 'Check-out',
  cancelled: 'Cancelada',
  no_show: 'No show',
}

const STATUS_VARIANTS = {
  confirmed: 'info',
  checked_in: 'success',
  checked_out: 'default',
  cancelled: 'danger',
  no_show: 'warning',
}

const ROOM_STATUS_COLORS = {
  available: 'bg-green-100 border-green-400 text-green-800',
  occupied: 'bg-red-100 border-red-400 text-red-800',
  cleaning: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  maintenance: 'bg-gray-100 border-gray-400 text-gray-600',
}

const ROOM_STATUS_LABELS = {
  available: 'Disponible',
  occupied: 'Ocupada',
  cleaning: 'Limpieza',
  maintenance: 'Mantenimiento',
}

export default function HotelDashboard({ getBusinessId, getRoutePrefix, isDemoMode }) {
  const { user, demoData } = useAppContext()
  const toast = useToast()

  const [rooms, setRooms] = useState([])
  const [reservations, setReservations] = useState([])
  const [todayInvoices, setTodayInvoices] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]
  const routePrefix = getRoutePrefix()

  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        setRooms(demoData.hotelRooms || [])
        setReservations(demoData.hotelReservations || [])
        setTodayInvoices(demoData.invoices || [])
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      if (!businessId) return

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [roomsRes, reservationsRes, invoicesRes] = await Promise.all([
        getRooms(businessId),
        getReservations(businessId),
        getRecentInvoices(businessId, todayStart),
      ])

      if (roomsRes.success) setRooms(roomsRes.data || [])
      if (reservationsRes.success) setReservations(reservationsRes.data || [])
      if (invoicesRes.success) setTodayInvoices(invoicesRes.data || [])
    } catch (error) {
      console.error('Error al cargar dashboard hotel:', error)
      toast.error('Error al cargar datos del dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  // Stats calculations
  const totalRooms = rooms.length
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length
  const occupancyPct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0

  const arrivalsToday = reservations.filter(r => r.checkIn === today && r.status !== 'cancelled').length
  const departuresToday = reservations.filter(r => r.checkOut === today && r.status !== 'cancelled').length

  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0)

  // Recent activity — last 10 reservations by updatedAt
  const recentReservations = [...reservations]
    .sort((a, b) => {
      const aTime = a.updatedAt?.seconds || a.updatedAt?.toMillis?.() || 0
      const bTime = b.updatedAt?.seconds || b.updatedAt?.toMillis?.() || 0
      return bTime - aTime
    })
    .slice(0, 10)

  // Room status counts
  const roomsByStatus = rooms.reduce((acc, room) => {
    acc[room.status] = (acc[room.status] || 0) + 1
    return acc
  }, {})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Ocupacion</p>
                <p className="text-2xl font-bold">{occupiedRooms}/{totalRooms}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <BedDouble className="w-8 h-8 text-primary-500" />
                <Badge variant={occupancyPct >= 80 ? 'danger' : occupancyPct >= 50 ? 'warning' : 'success'}>
                  {occupancyPct}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Llegadas Hoy</p>
                <p className="text-2xl font-bold">{arrivalsToday}</p>
              </div>
              <CalendarCheck className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Salidas Hoy</p>
                <p className="text-2xl font-bold">{departuresToday}</p>
              </div>
              <CalendarX className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Ingresos Hoy</p>
                <p className="text-2xl font-bold">{formatCurrency(todayRevenue)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two columns layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Activity */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentReservations.length === 0 ? (
                <p className="text-sm text-gray-500 px-6 py-8 text-center">
                  No hay reservaciones registradas
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recentReservations.map(res => (
                    <div key={res.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-gray-900 truncate">
                          {res.guestName || 'Sin nombre'}
                        </p>
                        <p className="text-xs text-gray-500">
                          Hab. {res.roomNumber} &middot; {res.checkIn} al {res.checkOut}
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANTS[res.status] || 'default'}>
                        {STATUS_LABELS[res.status] || res.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Room Status Summary */}
        <div>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Estado de Habitaciones</CardTitle>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(ROOM_STATUS_LABELS).map(([status, label]) => (
                  <span key={status} className="flex items-center gap-1 text-xs text-gray-600">
                    <span className={`w-2.5 h-2.5 rounded-full ${ROOM_STATUS_COLORS[status]?.split(' ')[0]}`} />
                    {label} ({roomsByStatus[status] || 0})
                  </span>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {rooms.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No hay habitaciones registradas
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
                  {rooms.map(room => (
                    <div
                      key={room.id}
                      className={`rounded-lg border px-2 py-2 text-center text-sm font-medium ${ROOM_STATUS_COLORS[room.status] || ROOM_STATUS_COLORS.maintenance}`}
                    >
                      {room.number}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link to={`${routePrefix}/hotel-rooms`}>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium transition-colors">
            <Home className="w-4 h-4" />
            Ir a Habitaciones
            <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
        <Link to={`${routePrefix}/hotel-reservations`}>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium transition-colors">
            <ClipboardList className="w-4 h-4" />
            Ir a Reservas
            <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
        <Link to={`${routePrefix}/pos`}>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors">
            <ShoppingCart className="w-4 h-4" />
            Punto de Venta
            <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
      </div>
    </div>
  )
}
