import { useState, useEffect, useMemo, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Search,
  Edit,
  Eye,
  Loader2,
  CalendarDays,
  LogIn,
  LogOut,
  Hotel,
  Users,
  Percent,
  DollarSign,
  Trash2,
  Receipt,
  X,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, matchesSearchQuery } from '@/lib/utils'
import {
  createReservation,
  getReservations,
  getActiveReservations,
  updateReservation,
  deleteReservation,
  undoCheckIn,
  getRooms,
  checkIn,
  checkOut,
  ensureRoomNightCharges,
  addCharge,
  getChargesByReservation,
  getReservationTotal,
  getServices,
  deleteCharge,
} from '@/services/hotelService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { upsertCustomerFromSale, getProducts, getCustomerByDocumentNumber } from '@/services/firestoreService'

// Schema
const reservationSchema = z.object({
  guestName: z.string().min(1, 'Nombre es requerido'),
  documentType: z.enum(['DNI', 'RUC', 'CE', 'Pasaporte']),
  documentNumber: z.string().min(1, 'Documento es requerido'),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  roomId: z.string().min(1, 'Seleccione una habitación'),
  checkInDate: z.string().min(1, 'Fecha de check-in es requerida'),
  checkOutDate: z.string().min(1, 'Fecha de check-out es requerida'),
  // Para modo hourly. Opcional en el schema porque el modo se detecta dinámicamente.
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  ratePerNight: z.coerce.number().min(0, 'Tarifa inválida'),
  ratePerHour: z.coerce.number().min(0, 'Tarifa inválida').optional(),
  guests: z.coerce.number().int().min(1).optional(),
  notes: z.string().optional(),
})

const STATUS_CONFIG = {
  confirmed: { label: 'Confirmada', variant: 'info' },
  checked_in: { label: 'Check-in', variant: 'success' },
  checked_out: { label: 'Check-out', variant: 'default' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
  no_show: { label: 'No show', variant: 'warning' },
}

const TABS = [
  { key: 'all', label: 'Todas' },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'checked_in', label: 'Check-in' },
  { key: 'checked_out', label: 'Check-out' },
  { key: 'cancelled', label: 'Canceladas' },
]

function calculateNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0
  const diff = new Date(checkOut) - new Date(checkIn)
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0)
}

// Horas exactas entre dos pares fecha+hora, redondeo hacia arriba (Math.ceil).
function calculateHoursDiff(checkInDate, checkInTime, checkOutDate, checkOutTime) {
  if (!checkInDate || !checkInTime || !checkOutDate || !checkOutTime) return 0
  const inMs = new Date(`${checkInDate}T${checkInTime}:00`).getTime()
  const outMs = new Date(`${checkOutDate}T${checkOutTime}:00`).getTime()
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return 0
  const diffMs = outMs - inMs
  if (diffMs <= 0) return 0
  return Math.ceil(diffMs / (1000 * 60 * 60))
}

// Parsea Timestamp / Date / string "YYYY-MM-DD" como fecha LOCAL (no UTC), para
// evitar que una fecha se muestre un día antes en zonas con UTC negativo (Perú = UTC-5).
function parseDateLocal(date) {
  if (!date) return null
  if (date.toDate) return date.toDate()
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [y, m, d] = date.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(date)
}

function formatDate(date) {
  const d = parseDateLocal(date)
  if (!d) return '-'
  return d.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function isToday(date) {
  const d = parseDateLocal(date)
  if (!d) return false
  const today = new Date()
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
}

export default function HotelReservations() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const appNavigate = useAppNavigate()

  // Data
  const [reservations, setReservations] = useState([])
  const [rooms, setRooms] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [roomFilter, setRoomFilter] = useState('all')

  // Reservation modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Folio modal
  const [folioReservation, setFolioReservation] = useState(null)
  const [folioCharges, setFolioCharges] = useState([])
  const [folioTotal, setFolioTotal] = useState(0)
  const [isFolioLoading, setIsFolioLoading] = useState(false)
  const [chargeDescription, setChargeDescription] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeQuantity, setChargeQuantity] = useState(1)
  const [itemSearch, setItemSearch] = useState('')
  const [showItemDropdown, setShowItemDropdown] = useState(false)
  const [isAddingCharge, setIsAddingCharge] = useState(false)
  // Carrito local: items que se cargarán juntos al folio
  const [pendingItems, setPendingItems] = useState([]) // [{ key, kind, name, price, quantity, chargeType }]
  // Catálogos para el folio (productos + servicios del hotel)
  const [products, setProducts] = useState([])
  const [hotelServices, setHotelServices] = useState([])

  // Processing actions
  const [processingId, setProcessingId] = useState(null)

  // Document lookup
  const [isLookingUp, setIsLookingUp] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      guestName: '',
      documentType: 'DNI',
      documentNumber: '',
      phone: '',
      email: '',
      roomId: '',
      checkInDate: '',
      checkOutDate: '',
      checkInTime: '',
      checkOutTime: '',
      ratePerNight: 0,
      ratePerHour: 0,
      guests: 1,
      notes: '',
    },
  })

  const watchCheckIn = watch('checkInDate')
  const watchCheckOut = watch('checkOutDate')
  const watchCheckInTime = watch('checkInTime')
  const watchCheckOutTime = watch('checkOutTime')
  const watchRate = watch('ratePerNight')
  const watchRateHour = watch('ratePerHour')
  const watchRoomId = watch('roomId')
  const watchGuests = watch('guests')
  const watchDocType = watch('documentType')
  const watchDocNumber = watch('documentNumber')

  // Detectar habitación seleccionada y modos soportados.
  // - "Por noche" siempre está soportado (rate > 0 es obligatorio en config de habitación).
  // - "Por hora" está soportado si la habitación tiene ratePerHour > 0.
  // El operador puede elegir el modo en este toggle (default: el modo predeterminado del cuarto).
  const selectedRoom = useMemo(() => rooms.find(r => r.id === watchRoomId), [rooms, watchRoomId])
  const roomSupportsHourly = (selectedRoom?.ratePerHour || 0) > 0
  const [reservationPricingMode, setReservationPricingMode] = useState('nightly')
  const isHourlyMode = reservationPricingMode === 'hourly'

  // Cuando cambia la habitación, resetear el toggle al modo predeterminado de la habitación
  // (solo si la habitación soporta el modo; si no, forzar 'nightly').
  useEffect(() => {
    if (!selectedRoom) {
      setReservationPricingMode('nightly')
      return
    }
    if (selectedRoom.pricingMode === 'hourly' && roomSupportsHourly) {
      setReservationPricingMode('hourly')
    } else {
      setReservationPricingMode('nightly')
    }
  }, [selectedRoom?.id, roomSupportsHourly]) // eslint-disable-line react-hooks/exhaustive-deps

  const nights = calculateNights(watchCheckIn, watchCheckOut)
  const hours = calculateHoursDiff(watchCheckIn, watchCheckInTime, watchCheckOut, watchCheckOutTime)
  // Personas adicionales: se cobra por noche por cada huésped que supera los incluidos en la habitación.
  const baseGuests = Number(selectedRoom?.baseGuests ?? 1)
  const extraGuestRate = Number(selectedRoom?.extraGuestRate ?? 0)
  const extraGuests = Math.max(0, (Number(watchGuests) || 0) - baseGuests)
  const extraGuestNightly = nights * extraGuests * extraGuestRate
  const estimatedTotal = isHourlyMode
    ? hours * (watchRateHour || 0)
    : nights * (watchRate || 0) + extraGuestNightly

  // Auto-cargar tarifa al seleccionar habitación. Cargamos ambos campos (rate per night/hour)
  // pero solo se usa el del modo activo. Editable para descuentos/promos.
  useEffect(() => {
    if (!watchRoomId) return
    const room = rooms.find(r => r.id === watchRoomId)
    if (!room) return
    const roomRate = Number(room.rate ?? room.ratePerNight ?? 0)
    const roomRateHour = Number(room.ratePerHour ?? 0)
    setValue('ratePerNight', roomRate, { shouldValidate: true })
    setValue('ratePerHour', roomRateHour, { shouldValidate: true })
  }, [watchRoomId, rooms, setValue])

  // Búsqueda de cliente: primero en Clientes registrados, luego RENIEC/SUNAT
  const handleDocumentLookup = async () => {
    const docNumber = watchDocNumber?.trim()
    if (!docNumber) {
      toast.error('Ingrese el número de documento')
      return
    }
    setIsLookingUp(true)
    try {
      // 1. Buscar primero en clientes locales
      if (!isDemoMode && user?.uid) {
        const businessId = getBusinessId()
        const localResult = await getCustomerByDocumentNumber(businessId, docNumber)
        if (localResult.success && localResult.data) {
          const c = localResult.data
          setValue('guestName', c.businessName || c.name || '', { shouldValidate: true })
          if (c.phone) setValue('phone', c.phone, { shouldValidate: true })
          if (c.email) setValue('email', c.email, { shouldValidate: true })
          if (c.documentType && (c.documentType === 'DNI' || c.documentType === 'RUC')) {
            setValue('documentType', c.documentType, { shouldValidate: true })
          }
          toast.success('Cliente ya registrado, datos cargados')
          return
        }
      }

      // 2. Si no existe localmente, consultar RENIEC/SUNAT
      if (watchDocType === 'DNI' && docNumber.length === 8) {
        const result = await consultarDNI(docNumber)
        if (result.success && result.data) {
          const name = result.data.nombreCompleto
            || `${result.data.nombres || ''} ${result.data.apellidoPaterno || ''} ${result.data.apellidoMaterno || ''}`.trim()
          if (name) {
            setValue('guestName', name, { shouldValidate: true })
            toast.success('Huésped encontrado en RENIEC')
          } else {
            toast.error('No se pudo obtener el nombre del DNI')
          }
        } else {
          toast.error(result.error || 'No se encontró el DNI')
        }
      } else if (watchDocType === 'RUC' && docNumber.length === 11) {
        const result = await consultarRUC(docNumber)
        if (result.success && result.data) {
          const name = result.data.razonSocial || result.data.nombreComercial || ''
          if (name) {
            setValue('guestName', name, { shouldValidate: true })
            toast.success('Empresa encontrada en SUNAT')
          } else {
            toast.error('No se pudo obtener la razón social del RUC')
          }
        } else {
          toast.error(result.error || 'No se encontró el RUC')
        }
      } else {
        toast.error(watchDocType === 'DNI' ? 'DNI debe tener 8 dígitos' : watchDocType === 'RUC' ? 'RUC debe tener 11 dígitos' : 'Búsqueda solo disponible para DNI o RUC')
      }
    } catch (error) {
      console.error('Error al buscar cliente:', error)
      toast.error('Error al consultar documento')
    } finally {
      setIsLookingUp(false)
    }
  }

  // Load data
  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid && !isDemoMode) return
    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        setReservations(demoData.hotelReservations || [])
        setRooms(demoData.hotelRooms || [])
        setProducts(demoData.products || [])
        setHotelServices(demoData.hotelServices || [])
        setIsLoading(false)
        return
      }
      const businessId = getBusinessId()
      const [resResult, roomsResult, productsResult, servicesResult] = await Promise.all([
        getReservations(businessId),
        getRooms(businessId),
        getProducts(businessId),
        getServices(businessId),
      ])
      if (resResult.success) setReservations(resResult.data || [])
      if (roomsResult.success) setRooms(roomsResult.data || [])
      if (productsResult.success) setProducts(productsResult.data || [])
      if (servicesResult.success) setHotelServices(servicesResult.data || [])
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar reservas')
    } finally {
      setIsLoading(false)
    }
  }

  // Stats
  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const reservationsToday = reservations.filter(r => {
      const created = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt)
      created.setHours(0, 0, 0, 0)
      return created.getTime() === today.getTime()
    }).length

    const arrivalsToday = reservations.filter(r =>
      r.status === 'confirmed' && isToday(r.checkInDate)
    ).length

    const departuresToday = reservations.filter(r =>
      r.status === 'checked_in' && isToday(r.checkOutDate)
    ).length

    const totalRooms = rooms.length
    const occupiedRooms = reservations.filter(r => r.status === 'checked_in').length
    const occupancy = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0

    return { reservationsToday, arrivalsToday, departuresToday, occupancy }
  }, [reservations, rooms])

  // Abrir folio automáticamente si llega ?folio=<reservationId>
  useEffect(() => {
    const folioId = searchParams.get('folio')
    if (!folioId || reservations.length === 0 || folioReservation) return
    const reservation = reservations.find(r => r.id === folioId)
    if (reservation) {
      openFolio(reservation)
      // Limpiar el query param para evitar reabrir al navegar
      searchParams.delete('folio')
      setSearchParams(searchParams, { replace: true })
    }
  }, [reservations, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lista de cabañas para el selector de filtro (ordenadas por nombre, con orden numérico
  // para que "4-..." < "5-..." < "6-...").
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) =>
      (a.name || a.number || '').localeCompare(b.name || b.number || '', 'es', { numeric: true })
    ),
    [rooms]
  )

  // Filtered reservations (pestaña + búsqueda + cabaña seleccionada)
  const filteredReservations = useMemo(() => {
    return reservations.filter(r => {
      const matchesTab = activeTab === 'all' || r.status === activeTab
      const matchesRoom = roomFilter === 'all' || r.roomId === roomFilter
      const matchesSearch = matchesSearchQuery(searchTerm, r.guestName, r.documentNumber, r.roomName)
      return matchesTab && matchesRoom && matchesSearch
    })
  }, [reservations, activeTab, searchTerm, roomFilter])

  // Agrupar por cabaña y, dentro de cada cabaña, ordenar por fecha de llegada
  // (próximas primero = check-in ascendente). Los grupos se ordenan por nombre de cabaña.
  const groupedReservations = useMemo(() => {
    const getInTime = (r) => {
      const d = parseDateLocal(r.checkInDate || r.checkIn)
      return d ? d.getTime() : 0
    }
    const groups = new Map()
    for (const r of filteredReservations) {
      const key = r.roomId || r.roomName || r.roomNumber || '__none__'
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          roomName: r.roomName || r.roomNumber || 'Sin cabaña',
          reservations: [],
        })
      }
      groups.get(key).reservations.push(r)
    }
    const arr = Array.from(groups.values())
    arr.forEach(g => g.reservations.sort((a, b) => getInTime(a) - getInTime(b)))
    arr.sort((a, b) => a.roomName.localeCompare(b.roomName, 'es', { numeric: true }))
    return arr
  }, [filteredReservations])

  // Available rooms for form
  // Mostrar TODAS las habitaciones: una misma habitación puede reservarse para
  // distintas fechas, así que no se filtran las que estén ocupadas/reservadas hoy.
  const availableRooms = useMemo(() => rooms, [rooms])

  // Fechas ya reservadas (confirmadas o con check-in) de la habitación seleccionada,
  // para avisar al operador y evitar doble reserva. Solo reservas por noche.
  const selectedRoomBookings = useMemo(() => {
    if (!selectedRoom) return []
    return reservations
      .filter(r => r.roomId === selectedRoom.id)
      .filter(r => r.status === 'confirmed' || r.status === 'checked_in')
      .filter(r => !editingReservation || r.id !== editingReservation.id)
      .filter(r => r.pricingMode !== 'hourly')
      .map(r => ({ in: r.checkInDate || r.checkIn, out: r.checkOutDate || r.checkOut }))
      .filter(b => b.in && b.out)
      .sort((a, b) => (a.in < b.in ? -1 : 1))
  }, [selectedRoom, reservations, editingReservation])

  // Open create modal
  const openCreateModal = () => {
    setEditingReservation(null)
    reset({
      guestName: '',
      documentType: 'DNI',
      documentNumber: '',
      phone: '',
      email: '',
      roomId: '',
      checkInDate: new Date().toISOString().split('T')[0],
      checkOutDate: '',
      checkInTime: '',
      checkOutTime: '',
      ratePerNight: 0,
      ratePerHour: 0,
      guests: 1,
      notes: '',
    })
    setIsModalOpen(true)
  }

  // Open edit modal
  const openEditModal = (reservation) => {
    setEditingReservation(reservation)
    // Soportar dos formatos: nombres del form (checkInDate/documentNumber/...) y nombres del service (checkIn/guestDocument/...)
    const rawCheckIn = reservation.checkInDate ?? reservation.checkIn
    const rawCheckOut = reservation.checkOutDate ?? reservation.checkOut
    const ciDate = rawCheckIn?.toDate ? rawCheckIn.toDate().toISOString().split('T')[0] : rawCheckIn
    const coDate = rawCheckOut?.toDate ? rawCheckOut.toDate().toISOString().split('T')[0] : rawCheckOut
    reset({
      guestName: reservation.guestName || '',
      documentType: reservation.documentType || reservation.guestDocumentType || 'DNI',
      documentNumber: reservation.documentNumber || reservation.guestDocument || '',
      phone: reservation.phone || reservation.guestPhone || '',
      email: reservation.email || reservation.guestEmail || '',
      roomId: reservation.roomId || '',
      checkInDate: ciDate || '',
      checkOutDate: coDate || '',
      checkInTime: reservation.checkInTime || '',
      checkOutTime: reservation.checkOutTime || '',
      ratePerNight: reservation.ratePerNight || 0,
      ratePerHour: reservation.ratePerHour || 0,
      guests: reservation.guests || 1,
      notes: reservation.notes || '',
    })
    // Sincronizar el toggle de modo con lo guardado en la reserva.
    setReservationPricingMode(reservation.pricingMode === 'hourly' ? 'hourly' : 'nightly')
    setIsModalOpen(true)
  }

  // Save reservation
  const onSubmit = async (data) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    if (!user?.uid) return

    const room = rooms.find(r => r.id === data.roomId)
    // El modo se decide en el toggle del form, no en la habitación.
    const isHourly = reservationPricingMode === 'hourly'

    // Validaciones específicas del modo hourly
    if (isHourly) {
      if (!data.checkInTime) { toast.error('Seleccione la hora de check-in'); return }
      if (!data.checkOutTime) { toast.error('Seleccione la hora de check-out'); return }
    }

    // Evitar doble reserva: la misma habitación no puede tener fechas que se crucen con
    // otra reserva activa (confirmada o con check-in). Solo aplica a reservas por noche.
    if (!isHourly) {
      const todayStr = new Date().toISOString().split('T')[0]
      const overlap = reservations.find(r => {
        if (r.roomId !== data.roomId) return false
        if (r.status !== 'confirmed' && r.status !== 'checked_in') return false
        if (editingReservation && r.id === editingReservation.id) return false
        if (r.pricingMode === 'hourly') return false
        const exIn = r.checkInDate || r.checkIn
        const exOut = r.checkOutDate || r.checkOut
        if (!exIn || !exOut) return false
        // Reservas confirmed cuyo checkout ya pasó son restos huérfanos (sin check-in
        // ni cancelación). No deben bloquear nuevas reservas futuras.
        if (r.status === 'confirmed' && exOut < todayStr) return false
        // Se cruzan si: nuevoCheckIn < existenteCheckOut Y nuevoCheckOut > existenteCheckIn
        return data.checkInDate < exOut && data.checkOutDate > exIn
      })
      if (overlap) {
        toast.error(`La habitación ya está reservada del ${formatDate(overlap.checkInDate || overlap.checkIn)} al ${formatDate(overlap.checkOutDate || overlap.checkOut)}. Elige otras fechas.`)
        return
      }
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const nightsCount = isHourly ? 0 : calculateNights(data.checkInDate, data.checkOutDate)
      const hoursCount = isHourly
        ? calculateHoursDiff(data.checkInDate, data.checkInTime, data.checkOutDate, data.checkOutTime)
        : 0
      if (isHourly && hoursCount <= 0) {
        toast.error('La hora de check-out debe ser posterior al check-in')
        setIsSaving(false)
        return
      }
      // Personas adicionales (solo modo por noche)
      const resBaseGuests = Number(room?.baseGuests ?? 1)
      const resExtraGuestRate = Number(room?.extraGuestRate ?? 0)
      const resGuests = Number(data.guests) || resBaseGuests
      const resExtraGuests = isHourly ? 0 : Math.max(0, resGuests - resBaseGuests)
      const extraGuestTotal = nightsCount * resExtraGuests * resExtraGuestRate
      const totalAmount = (isHourly
        ? hoursCount * Number(data.ratePerHour || 0)
        : nightsCount * Number(data.ratePerNight || 0)) + extraGuestTotal

      // Mapear al formato que espera el service (guestDocument, checkIn, ...) manteniendo también los nombres del form
      const payload = {
        // Form-friendly (para display/edit sin re-mapear)
        guestName: data.guestName,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        phone: data.phone || '',
        email: data.email || '',
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        // Service-friendly (lo que createReservation/folio esperan)
        guestDocument: data.documentNumber,
        guestDocumentType: data.documentType,
        guestPhone: data.phone || '',
        guestEmail: data.email || '',
        checkIn: data.checkInDate,
        checkOut: data.checkOutDate,
        // Room info
        roomId: data.roomId,
        roomName: room?.name || '',
        roomNumber: room?.number || '',
        // Modo de tarificación (snapshot tomado de la habitación al momento de la reserva)
        pricingMode: isHourly ? 'hourly' : 'nightly',
        ...(isHourly && {
          checkInTime: data.checkInTime,
          checkOutTime: data.checkOutTime,
          hours: hoursCount,
          ratePerHour: Number(data.ratePerHour || 0),
        }),
        // Totals
        nights: nightsCount,
        ratePerNight: Number(data.ratePerNight || 0),
        guests: resGuests,
        baseGuests: resBaseGuests,
        extraGuestRate: resExtraGuestRate,
        extraGuestTotal,
        totalAmount,
        total: totalAmount,
        notes: data.notes || '',
        status: editingReservation?.status || 'confirmed',
      }

      let result
      if (editingReservation) {
        result = await updateReservation(businessId, editingReservation.id, payload)
      } else {
        result = await createReservation(businessId, { ...payload, userId: user.uid })
      }

      if (result.success) {
        // Guardar/actualizar huésped en la base de clientes (solo en alta o edición con documento)
        if (data.documentNumber?.trim()) {
          upsertCustomerFromSale(businessId, {
            documentType: data.documentType === 'RUC' ? 'RUC' : 'DNI',
            documentNumber: data.documentNumber.trim(),
            name: data.guestName || '',
            businessName: data.documentType === 'RUC' ? data.guestName : '',
            email: data.email || '',
            phone: data.phone || '',
          }).catch(err => console.warn('No se pudo sincronizar huésped:', err))
        }
        toast.success(editingReservation ? 'Reserva actualizada' : 'Reserva creada')
        setIsModalOpen(false)
        loadData()
      } else {
        toast.error(result.error || 'Error al guardar reserva')
      }
    } catch (error) {
      console.error('Error al guardar:', error)
      toast.error('Error al guardar reserva')
    } finally {
      setIsSaving(false)
    }
  }

  // Check-in
  const handleCheckIn = async (reservation) => {
    if (isDemoMode) {
      // Simular check-in en demo
      setReservations(prev => prev.map(r => r.id === reservation.id ? { ...r, status: 'checked_in' } : r))
      toast.success(`Check-in realizado: ${reservation.guestName} (DEMO)`)
      return
    }
    if (!user?.uid) return
    setProcessingId(reservation.id)
    try {
      const businessId = getBusinessId()
      const result = await checkIn(businessId, reservation.id, reservation.roomId)
      if (result.success) {
        toast.success(`Check-in realizado: ${reservation.guestName}`)
        loadData()
      } else {
        toast.error(result.error || 'Error en check-in')
      }
    } catch (error) {
      toast.error('Error en check-in')
    } finally {
      setProcessingId(null)
    }
  }

  // Ejecuta el check-out real (después de cobrar o si no hay cargos)
  const executeCheckOut = async (reservation) => {
    if (isDemoMode) {
      setReservations(prev => prev.map(r => r.id === reservation.id ? { ...r, status: 'checked_out' } : r))
      toast.success(`Check-out realizado: ${reservation.guestName} (DEMO)`)
      return
    }
    if (!user?.uid) return
    setProcessingId(reservation.id)
    try {
      const businessId = getBusinessId()
      const result = await checkOut(businessId, reservation.id, reservation.roomId)
      if (result.success) {
        toast.success(`Check-out realizado: ${reservation.guestName}`)
        loadData()
      } else {
        toast.error(result.error || 'Error en check-out')
      }
    } catch (error) {
      toast.error('Error en check-out')
    } finally {
      setProcessingId(null)
    }
  }

  // Check-out guiado: si hay cargos pendientes, cobrar primero
  const handleCheckOut = async (reservation) => {
    setProcessingId(reservation.id)
    try {
      // Cargar cargos del folio
      let charges = []
      if (isDemoMode) {
        charges = (demoData?.hotelFolioCharges || []).filter(c => c.reservationId === reservation.id)
      } else {
        const businessId = getBusinessId()
        const chargesResult = await getChargesByReservation(businessId, reservation.id)
        if (chargesResult.success) charges = chargesResult.data || []
      }

      const pending = charges.filter(c => !c.invoiceId)
      const pendingTotal = pending.reduce((s, c) => s + (c.amount || 0), 0)

      if (pending.length > 0 && pendingTotal > 0) {
        // Hay cargos sin cobrar. Preguntar: ir al POS o descartar del folio
        const summary = pending.map(c => `• ${c.description}: S/ ${(c.amount || 0).toFixed(2)}`).join('\n')
        const msg = `Hay ${pending.length} cargo(s) sin cobrar por S/ ${pendingTotal.toFixed(2)}:\n\n${summary}\n\n¿Cobrarlos ahora en el POS?\n\n[Aceptar] → Ir al POS\n[Cancelar] → Descartar del folio y hacer check-out`
        const goToPOS = window.confirm(msg)
        if (goToPOS) {
          setProcessingId(null)
          goToPOSWithFolio(reservation, pending)
          return
        }
        // Descartar pendientes: eliminar del folio
        if (!isDemoMode) {
          const businessId = getBusinessId()
          for (const c of pending) {
            try { await deleteCharge(businessId, c.id) } catch (e) { console.warn('No se pudo eliminar cargo', c.id, e) }
          }
        }
        await executeCheckOut(reservation)
        setProcessingId(null)
        return
      }

      // No hay pendientes → confirmar y check-out directo
      setProcessingId(null)
      const confirmMsg = charges.length > 0
        ? `Todos los cargos ya fueron facturados. ¿Confirmar check-out de ${reservation.guestName}?`
        : `No hay cargos registrados en el folio de ${reservation.guestName}. ¿Confirmar check-out?`
      if (!window.confirm(confirmMsg)) return
      setProcessingId(reservation.id)
      await executeCheckOut(reservation)
    } catch (error) {
      console.error('Error en check-out guiado:', error)
      toast.error('Error al preparar check-out')
      setProcessingId(null)
    }
  }

  // Open folio
  const openFolio = async (reservation) => {
    setFolioReservation(reservation)
    setFolioCharges([])
    setFolioTotal(0)
    setChargeDescription('')
    setChargeAmount('')
    setChargeQuantity(1)
    setItemSearch('')
    setShowItemDropdown(false)
    setPendingItems([])
    setIsFolioLoading(true)
    try {
      if (isDemoMode && demoData?.hotelFolioCharges) {
        const charges = demoData.hotelFolioCharges.filter(c => c.reservationId === reservation.id)
        setFolioCharges(charges)
        setFolioTotal(charges.reduce((s, c) => s + (c.amount || 0), 0))
        setIsFolioLoading(false)
        return
      }
      const businessId = getBusinessId()
      let [chargesResult, totalResult] = await Promise.all([
        getChargesByReservation(businessId, reservation.id),
        getReservationTotal(businessId, reservation.id),
      ])
      // Reserva confirmada (sin check-in aun): generar los cargos de la estadia para poder
      // emitir la boleta por adelantado. Es idempotente (no duplica si ya existen).
      const hasRoomCharge = (chargesResult.data || []).some(c => c.chargeType === 'room_night' || c.chargeType === 'room_hourly')
      if (reservation.status === 'confirmed' && !hasRoomCharge) {
        await ensureRoomNightCharges(businessId, reservation.id, reservation.roomId)
        const refreshed = await Promise.all([
          getChargesByReservation(businessId, reservation.id),
          getReservationTotal(businessId, reservation.id),
        ])
        chargesResult = refreshed[0]
        totalResult = refreshed[1]
      }
      if (chargesResult.success) setFolioCharges(chargesResult.data || [])
      if (totalResult.success) setFolioTotal(totalResult.data || 0)
    } catch (error) {
      console.error('Error al cargar folio:', error)
      toast.error('Error al cargar folio')
    } finally {
      setIsFolioLoading(false)
    }
  }

  // Catálogo unificado de productos + servicios para el buscador
  const catalogItems = useMemo(() => {
    const items = []
    hotelServices.forEach(s => {
      if (s.active === false || s.status === 'inactive') return
      items.push({
        kind: 'service',
        id: s.id,
        name: s.name || 'Servicio',
        code: '',
        price: Number(s.rate ?? s.pricePerUnit ?? 0),
        badge: 'Servicio',
      })
    })
    products.forEach(p => {
      items.push({
        kind: 'product',
        id: p.id,
        name: p.name || 'Producto',
        code: p.code || '',
        price: Number(p.price ?? p.rate ?? 0),
        badge: p.category || 'Producto',
      })
    })
    return items
  }, [hotelServices, products])

  // Items filtrados por el término de búsqueda (limitado a 25 resultados)
  const filteredCatalog = useMemo(() => {
    const term = itemSearch.trim().toLowerCase()
    if (!term) return catalogItems.slice(0, 25)
    return catalogItems.filter(i =>
      i.name.toLowerCase().includes(term)
      || i.code?.toLowerCase().includes(term)
      || i.badge?.toLowerCase().includes(term)
    ).slice(0, 25)
  }, [itemSearch, catalogItems])

  // Deducir chargeType para un item del catálogo
  const getChargeTypeForCatalogItem = (item) => {
    if (item.kind === 'service') {
      const s = hotelServices.find(x => x.id === item.id)
      return s?.type || 'service'
    }
    if (item.kind === 'product') {
      const cat = (item.badge || '').toLowerCase()
      if (cat.includes('minibar')) return 'minibar'
      if (cat.includes('restaurant') || cat.includes('comida')) return 'restaurant'
      if (cat.includes('lavand')) return 'laundry'
    }
    return 'other'
  }

  // Al seleccionar del dropdown → suma al carrito (si ya está, aumenta cantidad)
  const selectCatalogItem = (item) => {
    const key = `${item.kind}:${item.id}`
    setPendingItems(prev => {
      const existing = prev.find(p => p.key === key)
      if (existing) {
        return prev.map(p => p.key === key ? { ...p, quantity: p.quantity + 1 } : p)
      }
      return [...prev, {
        key,
        kind: item.kind,
        name: item.name,
        price: item.price,
        quantity: 1,
        chargeType: getChargeTypeForCatalogItem(item),
      }]
    })
    setItemSearch('')
    setShowItemDropdown(false)
  }

  // Actualizar cantidad de un item del carrito
  const updateItemQuantity = (key, delta) => {
    setPendingItems(prev => prev
      .map(p => p.key === key ? { ...p, quantity: p.quantity + delta } : p)
      .filter(p => p.quantity > 0)
    )
  }

  // Editar precio unitario de un item del carrito
  const updateItemPrice = (key, newPrice) => {
    const price = parseFloat(newPrice) || 0
    setPendingItems(prev => prev.map(p => p.key === key ? { ...p, price } : p))
  }

  // Eliminar item del carrito
  const removeItemFromCart = (key) => {
    setPendingItems(prev => prev.filter(p => p.key !== key))
  }

  // Deshacer un check-in hecho por error (vuelve la reserva a "confirmada")
  const handleUndoCheckIn = async () => {
    if (!editingReservation) return
    if (!window.confirm('¿Deshacer el check-in? La reserva volverá a "Confirmada" y se quitarán los cargos de noche agregados al ingresar (los consumos se conservan).')) return
    if (isDemoMode) {
      setReservations(prev => prev.map(r => r.id === editingReservation.id ? { ...r, status: 'confirmed' } : r))
      toast.success('Check-in deshecho (DEMO)')
      setIsModalOpen(false)
      return
    }
    setIsSaving(true)
    try {
      const result = await undoCheckIn(getBusinessId(), editingReservation.id, editingReservation.roomId)
      if (result.success) {
        toast.success('Check-in deshecho')
        setIsModalOpen(false)
        loadData()
      } else {
        toast.error(result.error || 'Error al deshacer el check-in')
      }
    } catch (e) {
      console.error('Error al deshacer check-in:', e)
      toast.error('Error al deshacer el check-in')
    } finally {
      setIsSaving(false)
    }
  }

  // Eliminar una reserva (ej. una de prueba)
  const handleDeleteReservation = async () => {
    if (!editingReservation) return
    if (!window.confirm(`¿Eliminar la reserva de ${editingReservation.guestName}? Esta acción no se puede deshacer.`)) return
    if (isDemoMode) {
      setReservations(prev => prev.filter(r => r.id !== editingReservation.id))
      toast.success('Reserva eliminada (DEMO)')
      setIsModalOpen(false)
      return
    }
    setIsSaving(true)
    try {
      const result = await deleteReservation(getBusinessId(), editingReservation.id)
      if (result.success) {
        toast.success('Reserva eliminada')
        setIsModalOpen(false)
        loadData()
      } else {
        toast.error(result.error || 'Error al eliminar la reserva')
      }
    } catch (e) {
      console.error('Error al eliminar reserva:', e)
      toast.error('Error al eliminar la reserva')
    } finally {
      setIsSaving(false)
    }
  }

  // Agregar cargo manual al carrito (no al folio directo)
  const addManualToCart = () => {
    const qty = Number(chargeQuantity) || 1
    const unit = parseFloat(chargeAmount) || 0
    if (!chargeDescription.trim() || unit <= 0) {
      toast.error('Ingrese descripción y monto')
      return
    }
    const key = `manual:${Date.now()}`
    setPendingItems(prev => [...prev, {
      key,
      kind: 'manual',
      name: chargeDescription.trim(),
      price: unit,
      quantity: qty,
      chargeType: 'other',
    }])
    setChargeDescription('')
    setChargeAmount('')
    setChargeQuantity(1)
  }

  // Subtotal del carrito
  const pendingTotal = useMemo(
    () => pendingItems.reduce((s, p) => s + p.price * p.quantity, 0),
    [pendingItems]
  )

  // Desglose del folio: hospedaje (noches/estadía) vs consumos (productos/servicios),
  // para verlos separados en el folio (el hospedaje aparte de la venta de productos).
  const folioSplit = useMemo(() => {
    const isRoom = (c) => {
      const t = c.chargeType || c.type
      return t === 'room_night' || t === 'room_hourly'
    }
    let hospedaje = 0, consumo = 0
    for (const c of folioCharges) {
      const amt = Number(c.amount) || 0
      if (isRoom(c)) hospedaje += amt
      else consumo += amt
    }
    return { hospedaje, consumo }
  }, [folioCharges])

  // Navegar al POS con los cargos del folio precargados
  const goToPOSWithFolio = (reservation, charges) => {
    appNavigate('/pos', {
      state: {
        fromFolio: true,
        reservationId: reservation.id,
        items: charges,
        customer: {
          documentType: reservation.documentType || reservation.guestDocumentType || 'DNI',
          documentNumber: reservation.documentNumber || reservation.guestDocument || '',
          name: reservation.guestName || '',
          businessName: (reservation.documentType || reservation.guestDocumentType) === 'RUC' ? (reservation.guestName || '') : '',
          email: reservation.email || reservation.guestEmail || '',
          phone: reservation.phone || reservation.guestPhone || '',
        },
        reservationNote: `Folio de ${reservation.guestName} · Hab. ${reservation.roomNumber}`,
      },
    })
  }

  // Enviar todos los items del carrito al folio (una llamada por item)
  const handleSubmitCart = async () => {
    if (pendingItems.length === 0) {
      toast.error('Agregá al menos un ítem al carrito')
      return
    }
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setIsAddingCharge(true)
    try {
      const businessId = getBusinessId()
      let successCount = 0
      for (const item of pendingItems) {
        const amount = item.price * item.quantity
        const description = item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name
        const result = await addCharge(businessId, {
          reservationId: folioReservation.id,
          roomId: folioReservation.roomId,
          roomNumber: folioReservation.roomNumber,
          guestName: folioReservation.guestName,
          chargeType: item.chargeType || 'other',
          description,
          amount,
          createdBy: user?.uid || '',
        })
        if (result.success) successCount++
      }
      if (successCount > 0) {
        toast.success(`${successCount} cargo${successCount > 1 ? 's' : ''} agregado${successCount > 1 ? 's' : ''} al folio`)
        // Limpiar carrito y recargar folio
        setPendingItems([])
        const [chargesResult, totalResult] = await Promise.all([
          getChargesByReservation(businessId, folioReservation.id),
          getReservationTotal(businessId, folioReservation.id),
        ])
        if (chargesResult.success) setFolioCharges(chargesResult.data || [])
        if (totalResult.success) setFolioTotal(totalResult.data || 0)
      }
      if (successCount < pendingItems.length) {
        toast.error(`${pendingItems.length - successCount} cargo(s) fallaron`)
      }
    } catch (error) {
      console.error('Error al agregar cargos:', error)
      toast.error('Error al agregar cargos')
    } finally {
      setIsAddingCharge(false)
    }
  }

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.confirmed
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getChargeTypeLabel = (type) => {
    const labels = {
      room: 'Habitación',
      restaurant: 'Restaurante',
      pool: 'Piscina',
      extra: 'Extra',
      minibar: 'Minibar',
      laundry: 'Lavandería',
      spa: 'Spa',
    }
    return labels[type] || type
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Hotel className="w-7 h-7 text-primary-600" />
            Reservas
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona las reservas del hotel
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Reserva
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CalendarDays className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Reservas hoy</p>
                <p className="text-xl font-bold text-gray-900">{stats.reservationsToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <LogIn className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Llegadas hoy</p>
                <p className="text-xl font-bold text-gray-900">{stats.arrivalsToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <LogOut className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Salidas hoy</p>
                <p className="text-xl font-bold text-gray-900">{stats.departuresToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Percent className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Ocupación</p>
                <p className="text-xl font-bold text-gray-900">{stats.occupancy}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs + Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-1 overflow-x-auto flex-shrink-0">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.key
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por huésped, documento o habitación..."
                className="w-full h-10 pl-10 pr-4 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {/* Filtro por cabaña */}
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              title="Filtrar por cabaña"
              className="h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white text-gray-700 flex-shrink-0 w-full sm:w-auto sm:max-w-[14rem]"
            >
              <option value="all">Todas las cabañas</option>
              {sortedRooms.map(room => (
                <option key={room.id} value={room.id}>{room.name || room.number}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Reservations list */}
      <Card>
        <CardContent className="p-0">
          {filteredReservations.length === 0 ? (
            <div className="text-center py-12">
              <Hotel className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {reservations.length === 0
                  ? 'No hay reservas registradas. Crea tu primera reserva.'
                  : 'No se encontraron reservas con los filtros aplicados.'}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile cards (agrupadas por cabaña) */}
              <div className="lg:hidden">
                {groupedReservations.map((group) => (
                  <div key={group.key} className="border-b border-gray-200 last:border-b-0">
                    <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700">Hab. {group.roomName}</span>
                      <span className="text-xs text-gray-400">{group.reservations.length} reserva{group.reservations.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {group.reservations.map((reservation) => (
                        <div key={reservation.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-1 flex-1">{reservation.guestName}</p>
                      {getStatusBadge(reservation.status)}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {reservation.pricingMode === 'hourly' ? (
                        <span>
                          {formatDate(reservation.checkInDate)} {reservation.checkInTime || ''} → {reservation.checkOutTime || ''}
                        </span>
                      ) : (
                        <span>{formatDate(reservation.checkInDate)} - {formatDate(reservation.checkOutDate)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-medium text-gray-900">
                        {reservation.pricingMode === 'hourly'
                          ? `${reservation.hours || 0} hora${(reservation.hours || 0) !== 1 ? 's' : ''}`
                          : `${reservation.nights || calculateNights(reservation.checkInDate, reservation.checkOutDate)} noches`}
                        {' - '}{formatCurrency(reservation.total || 0)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {reservation.status === 'confirmed' && (
                          <Button
                            size="sm"
                            onClick={() => handleCheckIn(reservation)}
                            disabled={processingId === reservation.id}
                          >
                            <LogIn className="w-3 h-3" />
                          </Button>
                        )}
                        {reservation.status === 'checked_in' && (
                          <Button
                            size="sm"
                            onClick={() => handleCheckOut(reservation)}
                            disabled={processingId === reservation.id}
                          >
                            <LogOut className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openFolio(reservation)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        <button
                          type="button"
                          onClick={() => openEditModal(reservation)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                          title="Editar"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Huésped</TableHead>
                      <TableHead>Habitación</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead className="text-right">Duración</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedReservations.map((group) => (
                      <Fragment key={group.key}>
                        <TableRow className="bg-gray-50 hover:bg-gray-50">
                          <TableCell colSpan={8} className="py-2 font-semibold text-sm text-gray-700">
                            Hab. {group.roomName}
                            <span className="text-gray-400 font-normal"> · {group.reservations.length} reserva{group.reservations.length !== 1 ? 's' : ''}</span>
                          </TableCell>
                        </TableRow>
                        {group.reservations.map((reservation) => {
                          const isHourly = reservation.pricingMode === 'hourly'
                          return (
                          <TableRow key={reservation.id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{reservation.guestName}</p>
                            <p className="text-xs text-gray-500">{reservation.documentType} {reservation.documentNumber}</p>
                          </div>
                        </TableCell>
                        <TableCell>{reservation.roomName || reservation.roomNumber || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {formatDate(reservation.checkInDate)}
                          {isHourly && reservation.checkInTime && (
                            <span className="text-xs text-gray-500 ml-1">{reservation.checkInTime}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(reservation.checkOutDate)}
                          {isHourly && reservation.checkOutTime && (
                            <span className="text-xs text-gray-500 ml-1">{reservation.checkOutTime}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isHourly
                            ? `${reservation.hours || 0} hora${(reservation.hours || 0) !== 1 ? 's' : ''}`
                            : `${reservation.nights || calculateNights(reservation.checkInDate, reservation.checkOutDate)} noches`}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(reservation.total || 0)}
                        </TableCell>
                        <TableCell>{getStatusBadge(reservation.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {/* Acción primaria según estado */}
                            {reservation.status === 'confirmed' && (
                              <Button
                                size="sm"
                                onClick={() => handleCheckIn(reservation)}
                                disabled={processingId === reservation.id}
                              >
                                {processingId === reservation.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><LogIn className="w-3 h-3 mr-1" /> Check-in</>
                                )}
                              </Button>
                            )}
                            {reservation.status === 'checked_in' && (
                              <Button
                                size="sm"
                                onClick={() => handleCheckOut(reservation)}
                                disabled={processingId === reservation.id}
                              >
                                {processingId === reservation.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><LogOut className="w-3 h-3 mr-1" /> Check-out</>
                                )}
                              </Button>
                            )}

                            {/* Folio (siempre disponible) */}
                            <Button size="sm" variant="outline" onClick={() => openFolio(reservation)}>
                              <Eye className="w-3 h-3 mr-1" /> Folio
                            </Button>

                            {/* Editar (icono sutil al final) */}
                            <button
                              type="button"
                              onClick={() => openEditModal(reservation)}
                              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Editar reserva"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </TableCell>
                          </TableRow>
                          )
                        })}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Reservation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSaving && setIsModalOpen(false)}
        title={editingReservation ? 'Editar Reserva' : 'Nueva Reserva'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Guest info */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Datos del huésped</h4>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Tipo de documento"
                required
                {...register('documentType')}
                error={errors.documentType?.message}
              >
                <option value="DNI">DNI</option>
                <option value="RUC">RUC</option>
                <option value="CE">CE</option>
                <option value="Pasaporte">Pasaporte</option>
              </Select>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nro. documento <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    {...register('documentNumber')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDocumentLookup}
                    disabled={isLookingUp || (watchDocType !== 'DNI' && watchDocType !== 'RUC')}
                    title="Buscar por DNI/RUC"
                    className="px-3"
                  >
                    {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {errors.documentNumber && (
                  <p className="mt-1 text-xs text-red-600">{errors.documentNumber.message}</p>
                )}
              </div>
            </div>
            <Input
              label="Nombre completo"
              required
              {...register('guestName')}
              error={errors.guestName?.message}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Teléfono"
                type="tel"
                {...register('phone')}
                error={errors.phone?.message}
              />
              <Input
                label="Email"
                type="email"
                {...register('email')}
                error={errors.email?.message}
              />
            </div>
          </div>

          {/* Stay info */}
          <div className="space-y-3 pt-2 border-t">
            <h4 className="text-sm font-semibold text-gray-700">Datos de la estadía</h4>
            <Select
              label="Habitación"
              required
              {...register('roomId')}
              error={errors.roomId?.message}
            >
              <option value="">Seleccionar habitación</option>
              {editingReservation && (
                <option value={editingReservation.roomId}>
                  Hab. {editingReservation.roomNumber || '-'}{editingReservation.roomName ? ` - ${editingReservation.roomName}` : ''} (actual)
                </option>
              )}
              {availableRooms.map(room => {
                const roomRateNight = room.rate ?? room.ratePerNight ?? 0
                const roomRateHour = room.ratePerHour ?? 0
                const rateLabel = roomRateHour > 0
                  ? `${formatCurrency(roomRateNight)}/noche · ${formatCurrency(roomRateHour)}/hora`
                  : `${formatCurrency(roomRateNight)}/noche`
                const label = `Hab. ${room.number || '-'}${room.name ? ` - ${room.name}` : ''} · ${room.type || 'Estándar'} · ${rateLabel}`
                return (
                  <option key={room.id} value={room.id}>
                    {label}
                  </option>
                )
              })}
            </Select>
            {/* Toggle modo de cobro: visible solo si la habitación soporta por hora */}
            {selectedRoom && roomSupportsHourly && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">¿Cómo se cobra esta reserva?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReservationPricingMode('nightly')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 transition-colors text-sm ${
                      reservationPricingMode === 'nightly'
                        ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                        : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <CalendarDays className="w-4 h-4" />
                    Por noche
                  </button>
                  <button
                    type="button"
                    onClick={() => setReservationPricingMode('hourly')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 transition-colors text-sm ${
                      reservationPricingMode === 'hourly'
                        ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                        : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <Hotel className="w-4 h-4" />
                    Por hora
                  </button>
                </div>
              </div>
            )}

            {isHourlyMode ? (
              <>
                {/* Modo por horas: 4 inputs separados (fecha + hora x 2) */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                  Cobro <strong>por hora</strong>. Las horas se redondean hacia arriba.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Fecha check-in"
                    type="date"
                    required
                    {...register('checkInDate')}
                    error={errors.checkInDate?.message}
                  />
                  <Input
                    label="Hora check-in"
                    type="time"
                    required
                    {...register('checkInTime')}
                    error={errors.checkInTime?.message}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Fecha check-out"
                    type="date"
                    required
                    {...register('checkOutDate')}
                    error={errors.checkOutDate?.message}
                  />
                  <Input
                    label="Hora check-out"
                    type="time"
                    required
                    {...register('checkOutTime')}
                    error={errors.checkOutTime?.message}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Input
                      label="Tarifa por hora"
                      type="number"
                      step="0.01"
                      required
                      {...register('ratePerHour')}
                      error={errors.ratePerHour?.message}
                    />
                    <p className="text-xs text-gray-400 mt-1">Se carga de la habitación. Editá para aplicar descuento.</p>
                  </div>
                  <div className="flex flex-col justify-end">
                    <p className="text-sm text-gray-500">
                      {hours > 0 ? `${hours} hora${hours !== 1 ? 's' : ''} (redondeado)` : 'Define fechas y horas'}
                    </p>
                    {hours > 0 && watchRateHour > 0 && (
                      <p className="text-lg font-bold text-gray-900">
                        Total: {formatCurrency(estimatedTotal)}
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Modo por noches: comportamiento original */}
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Check-in"
                    type="date"
                    required
                    {...register('checkInDate')}
                    error={errors.checkInDate?.message}
                  />
                  <Input
                    label="Check-out"
                    type="date"
                    required
                    {...register('checkOutDate')}
                    error={errors.checkOutDate?.message}
                  />
                </div>
                {selectedRoomBookings.length > 0 && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="font-semibold">⚠ Fechas ya reservadas en esta habitación:</span>{' '}
                    {selectedRoomBookings.map(b => `${formatDate(b.in)} – ${formatDate(b.out)}`).join('  ·  ')}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Input
                      label="Tarifa por noche"
                      type="number"
                      step="0.01"
                      required
                      {...register('ratePerNight')}
                      error={errors.ratePerNight?.message}
                    />
                    <p className="text-xs text-gray-400 mt-1">Se carga de la habitación. Editá para aplicar descuento o promo.</p>
                  </div>
                  <div className="flex flex-col justify-end">
                    <p className="text-sm text-gray-500">
                      {nights > 0 ? `${nights} noche${nights > 1 ? 's' : ''}` : 'Seleccione fechas'}
                    </p>
                    {nights > 0 && watchRate > 0 && (
                      <p className="text-lg font-bold text-gray-900">
                        Total: {formatCurrency(estimatedTotal)}
                      </p>
                    )}
                  </div>
                </div>
                {extraGuestRate > 0 && (
                  <div>
                    <Input
                      label={`Huéspedes (incluye ${baseGuests}; persona extra S/ ${extraGuestRate.toFixed(2)}/noche)`}
                      type="number"
                      min="1"
                      {...register('guests')}
                    />
                    {extraGuests > 0 && nights > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        + {extraGuests} persona{extraGuests > 1 ? 's' : ''} adicional{extraGuests > 1 ? 'es' : ''} × {nights} noche{nights > 1 ? 's' : ''} = {formatCurrency(extraGuestNightly)}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                rows={2}
                placeholder="Notas adicionales..."
                {...register('notes')}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {editingReservation && editingReservation.status === 'checked_in' && (
                <Button type="button" variant="outline" onClick={handleUndoCheckIn} disabled={isSaving}>
                  Deshacer check-in
                </Button>
              )}
              {editingReservation && (
                <Button type="button" variant="danger" onClick={handleDeleteReservation} disabled={isSaving}>
                  <Trash2 className="w-4 h-4 mr-1" /> Eliminar
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</>
                ) : (
                  editingReservation ? 'Actualizar Reserva' : 'Crear Reserva'
                )}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Folio Modal */}
      <Modal
        isOpen={!!folioReservation}
        onClose={() => setFolioReservation(null)}
        title={`Folio - ${folioReservation?.guestName || ''}`}
        size="lg"
      >
        {isFolioLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Reservation summary */}
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-500">Habitación:</span>{' '}
                  <span className="font-medium">{folioReservation?.roomName || folioReservation?.roomNumber}</span>
                </div>
                <div>
                  <span className="text-gray-500">Estado:</span>{' '}
                  {folioReservation && getStatusBadge(folioReservation.status)}
                </div>
                <div>
                  <span className="text-gray-500">Check-in:</span>{' '}
                  <span className="font-medium">{formatDate(folioReservation?.checkInDate)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Check-out:</span>{' '}
                  <span className="font-medium">{formatDate(folioReservation?.checkOutDate)}</span>
                </div>
              </div>
            </div>

            {/* Charges list */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Cargos</h4>
              {folioCharges.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No hay cargos registrados</p>
              ) : (
                <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                  {folioCharges.map((charge, idx) => (
                    <div
                      key={charge.id || idx}
                      className={`flex items-center justify-between px-4 py-2.5 ${charge.invoiceId ? 'bg-green-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{charge.description}</p>
                          {charge.invoiceId && (
                            <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                              Facturado {charge.invoiceNumber || ''}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {getChargeTypeLabel(charge.chargeType || charge.type)}
                          {charge.date && ` · ${charge.date}`}
                        </p>
                      </div>
                      <span className={`text-sm font-medium flex-shrink-0 ml-2 ${charge.invoiceId ? 'text-green-700 line-through opacity-70' : 'text-gray-900'}`}>
                        {formatCurrency(charge.amount || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add charge (estilo carrito tipo POS) */}
            {folioReservation?.status === 'checked_in' && (
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Agregar cargos al folio</h4>

                {/* Buscador con dropdown */}
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Buscar producto o servicio..."
                      className="w-full h-10 pl-9 pr-9 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      value={itemSearch}
                      onChange={(e) => { setItemSearch(e.target.value); setShowItemDropdown(true) }}
                      onFocus={() => setShowItemDropdown(true)}
                      onBlur={() => setTimeout(() => setShowItemDropdown(false), 150)}
                    />
                    {itemSearch && (
                      <button
                        type="button"
                        onClick={() => setItemSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                        title="Limpiar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {showItemDropdown && filteredCatalog.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {filteredCatalog.map(item => (
                        <button
                          key={`${item.kind}-${item.id}`}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); selectCatalogItem(item) }}
                          className="w-full text-left px-3 py-2 hover:bg-primary-50 border-b last:border-b-0 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              {item.badge}{item.code ? ` · ${item.code}` : ''}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                            {formatCurrency(item.price)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showItemDropdown && itemSearch && filteredCatalog.length === 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-sm text-gray-500">
                      Sin coincidencias
                    </div>
                  )}
                </div>

                {/* Carrito local */}
                {pendingItems.length > 0 && (
                  <div className="border rounded-lg divide-y bg-gray-50">
                    {pendingItems.map(item => (
                      <div key={item.key} className="flex items-center gap-2 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <input
                              type="number"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => updateItemPrice(item.key, e.target.value)}
                              className="w-20 h-6 px-1 text-xs border border-gray-300 rounded"
                              title="Precio unitario"
                            />
                            <span className="text-xs text-gray-400">c/u</span>
                          </div>
                        </div>
                        {/* Controles de cantidad */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.key, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-100"
                          >−</button>
                          <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.key, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-100"
                          >+</button>
                        </div>
                        {/* Subtotal y eliminar */}
                        <span className="w-20 text-right text-sm font-semibold text-gray-800 flex-shrink-0">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItemFromCart(item.key)}
                          className="p-1 text-red-500 hover:text-red-700 flex-shrink-0"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-100 rounded-b-lg">
                      <span className="text-sm font-semibold text-gray-700">
                        Subtotal ({pendingItems.length} ítem{pendingItems.length > 1 ? 's' : ''})
                      </span>
                      <span className="text-base font-bold text-gray-900">{formatCurrency(pendingTotal)}</span>
                    </div>
                  </div>
                )}

                {/* Cargo manual (opcional) */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700 py-1">+ Agregar cargo manual</summary>
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="Descripción"
                      className="flex-1 min-w-0 h-10 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      value={chargeDescription}
                      onChange={(e) => setChargeDescription(e.target.value)}
                    />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Cant."
                      className="w-16 flex-shrink-0 h-10 px-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      value={chargeQuantity}
                      onChange={(e) => setChargeQuantity(e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Precio"
                      className="w-24 flex-shrink-0 h-10 px-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      value={chargeAmount}
                      onChange={(e) => setChargeAmount(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addManualToCart}
                      className="flex-shrink-0 whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Agregar
                    </Button>
                  </div>
                </details>

                {/* Botón confirmar carga al folio */}
                {pendingItems.length > 0 && (
                  <Button
                    onClick={handleSubmitCart}
                    disabled={isAddingCharge}
                    className="w-full"
                  >
                    {isAddingCharge ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Procesando...</>
                    ) : (
                      <><Plus className="w-4 h-4 mr-1" /> Cargar {pendingItems.length} ítem{pendingItems.length > 1 ? 's' : ''} al folio · {formatCurrency(pendingTotal)}</>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Desglose (hospedaje vs consumos) + Total */}
            <div className="border-t pt-3 space-y-1.5">
              {folioSplit.consumo > 0 && (
                <>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Hospedaje</span>
                    <span>{formatCurrency(folioSplit.hospedaje)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Consumos / Productos</span>
                    <span>{formatCurrency(folioSplit.consumo)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-lg font-semibold text-gray-700">Total</span>
                <span className="text-xl font-bold text-gray-900">{formatCurrency(folioTotal)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              {folioCharges.some(c => !c.invoiceId) && (
                <Button onClick={() => goToPOSWithFolio(folioReservation, folioCharges.filter(c => !c.invoiceId))}>
                  <Receipt className="w-4 h-4 mr-1" /> Generar Comprobante
                </Button>
              )}
              <Button variant="outline" onClick={() => setFolioReservation(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
