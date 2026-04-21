import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { formatCurrency } from '@/lib/utils'
import InvoiceFromFolioModal from '@/components/hotel/InvoiceFromFolioModal'
import {
  createReservation,
  getReservations,
  getActiveReservations,
  updateReservation,
  getRooms,
  checkIn,
  checkOut,
  addCharge,
  getChargesByReservation,
  getReservationTotal,
} from '@/services/hotelService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { upsertCustomerFromSale } from '@/services/firestoreService'

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
  ratePerNight: z.coerce.number().min(0, 'Tarifa inválida'),
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

function formatDate(date) {
  if (!date) return '-'
  const d = date.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function isToday(date) {
  if (!date) return false
  const d = date.toDate ? date.toDate() : new Date(date)
  const today = new Date()
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
}

export default function HotelReservations() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  // Data
  const [reservations, setReservations] = useState([])
  const [rooms, setRooms] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('all')

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
  const [isAddingCharge, setIsAddingCharge] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)

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
      ratePerNight: 0,
      notes: '',
    },
  })

  const watchCheckIn = watch('checkInDate')
  const watchCheckOut = watch('checkOutDate')
  const watchRate = watch('ratePerNight')
  const watchRoomId = watch('roomId')
  const watchDocType = watch('documentType')
  const watchDocNumber = watch('documentNumber')
  const nights = calculateNights(watchCheckIn, watchCheckOut)
  const estimatedTotal = nights * (watchRate || 0)

  // Auto-cargar tarifa al seleccionar habitación (se puede editar después para aplicar descuentos/promos)
  useEffect(() => {
    if (!watchRoomId) return
    const room = rooms.find(r => r.id === watchRoomId)
    if (!room) return
    const roomRate = Number(room.rate ?? room.ratePerNight ?? 0)
    setValue('ratePerNight', roomRate, { shouldValidate: true })
  }, [watchRoomId, rooms, setValue])

  // Búsqueda de cliente por DNI/RUC
  const handleDocumentLookup = async () => {
    if (!watchDocNumber) {
      toast.error('Ingrese el número de documento')
      return
    }
    setIsLookingUp(true)
    try {
      if (watchDocType === 'DNI' && watchDocNumber.length === 8) {
        const result = await consultarDNI(watchDocNumber)
        if (result.success && result.data) {
          const name = result.data.nombreCompleto
            || `${result.data.nombres || ''} ${result.data.apellidoPaterno || ''} ${result.data.apellidoMaterno || ''}`.trim()
          if (name) {
            setValue('guestName', name, { shouldValidate: true })
            toast.success('Huésped encontrado')
          } else {
            toast.error('No se pudo obtener el nombre del DNI')
          }
        } else {
          toast.error(result.error || 'No se encontró el DNI')
        }
      } else if (watchDocType === 'RUC' && watchDocNumber.length === 11) {
        const result = await consultarRUC(watchDocNumber)
        if (result.success && result.data) {
          const name = result.data.razonSocial || result.data.nombreComercial || ''
          if (name) {
            setValue('guestName', name, { shouldValidate: true })
            toast.success('Empresa encontrada')
          } else {
            toast.error('No se pudo obtener la razón social del RUC')
          }
        } else {
          toast.error(result.error || 'No se encontró el RUC')
        }
      } else {
        toast.error(watchDocType === 'DNI' ? 'DNI debe tener 8 dígitos' : watchDocType === 'RUC' ? 'RUC debe tener 11 dígitos' : 'Búsqueda solo disponible para DNI o RUC')
      }
    } catch {
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
        setIsLoading(false)
        return
      }
      const businessId = getBusinessId()
      const [resResult, roomsResult] = await Promise.all([
        getReservations(businessId),
        getRooms(businessId),
      ])
      if (resResult.success) setReservations(resResult.data || [])
      if (roomsResult.success) setRooms(roomsResult.data || [])
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

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    return reservations.filter(r => {
      const matchesTab = activeTab === 'all' || r.status === activeTab
      const matchesSearch = !searchTerm ||
        r.guestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.documentNumber?.includes(searchTerm) ||
        r.roomName?.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesTab && matchesSearch
    })
  }, [reservations, activeTab, searchTerm])

  // Available rooms for form
  const availableRooms = useMemo(() => {
    const occupiedRoomIds = reservations
      .filter(r => r.status === 'checked_in' || r.status === 'confirmed')
      .filter(r => !editingReservation || r.id !== editingReservation.id)
      .map(r => r.roomId)
    return rooms.filter(r => !occupiedRoomIds.includes(r.id))
  }, [rooms, reservations, editingReservation])

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
      ratePerNight: 0,
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
      ratePerNight: reservation.ratePerNight || 0,
      notes: reservation.notes || '',
    })
    setIsModalOpen(true)
  }

  // Save reservation
  const onSubmit = async (data) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    if (!user?.uid) return
    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const room = rooms.find(r => r.id === data.roomId)
      const nightsCount = calculateNights(data.checkInDate, data.checkOutDate)
      const totalAmount = nightsCount * data.ratePerNight
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
        // Totals
        nights: nightsCount,
        ratePerNight: data.ratePerNight,
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

  // Check-out
  const handleCheckOut = async (reservation) => {
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

  // Open folio
  const openFolio = async (reservation) => {
    setFolioReservation(reservation)
    setFolioCharges([])
    setFolioTotal(0)
    setChargeDescription('')
    setChargeAmount('')
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
      const [chargesResult, totalResult] = await Promise.all([
        getChargesByReservation(businessId, reservation.id),
        getReservationTotal(businessId, reservation.id),
      ])
      if (chargesResult.success) setFolioCharges(chargesResult.data || [])
      if (totalResult.success) setFolioTotal(totalResult.data || 0)
    } catch (error) {
      console.error('Error al cargar folio:', error)
      toast.error('Error al cargar folio')
    } finally {
      setIsFolioLoading(false)
    }
  }

  // Add charge to folio
  const handleAddCharge = async () => {
    if (!chargeDescription.trim() || !chargeAmount) {
      toast.error('Ingrese descripción y monto')
      return
    }
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setIsAddingCharge(true)
    try {
      const businessId = getBusinessId()
      const result = await addCharge(businessId, {
        reservationId: folioReservation.id,
        roomId: folioReservation.roomId,
        roomNumber: folioReservation.roomNumber,
        guestName: folioReservation.guestName,
        chargeType: 'other',
        description: chargeDescription.trim(),
        amount: parseFloat(chargeAmount),
        createdBy: user?.uid || '',
      })
      if (result.success) {
        toast.success('Cargo agregado')
        setChargeDescription('')
        setChargeAmount('')
        // Reload charges
        const [chargesResult, totalResult] = await Promise.all([
          getChargesByReservation(businessId, folioReservation.id),
          getReservationTotal(businessId, folioReservation.id),
        ])
        if (chargesResult.success) setFolioCharges(chargesResult.data || [])
        if (totalResult.success) setFolioTotal(totalResult.data || 0)
      } else {
        toast.error(result.error || 'Error al agregar cargo')
      }
    } catch (error) {
      toast.error('Error al agregar cargo')
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
              {/* Mobile cards */}
              <div className="lg:hidden divide-y divide-gray-100">
                {filteredReservations.map((reservation) => (
                  <div key={reservation.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-1 flex-1">{reservation.guestName}</p>
                      {getStatusBadge(reservation.status)}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span>Hab. {reservation.roomName || reservation.roomNumber}</span>
                      <span className="text-gray-300">|</span>
                      <span>{formatDate(reservation.checkInDate)} - {formatDate(reservation.checkOutDate)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-medium text-gray-900">
                        {reservation.nights || calculateNights(reservation.checkInDate, reservation.checkOutDate)} noches - {formatCurrency(reservation.total || 0)}
                      </span>
                      <div className="flex items-center gap-1">
                        {reservation.status === 'confirmed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCheckIn(reservation)}
                            disabled={processingId === reservation.id}
                          >
                            <LogIn className="w-3 h-3" />
                          </Button>
                        )}
                        {reservation.status === 'checked_in' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCheckOut(reservation)}
                            disabled={processingId === reservation.id}
                          >
                            <LogOut className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openEditModal(reservation)}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openFolio(reservation)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                      </div>
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
                      <TableHead className="text-right">Noches</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReservations.map((reservation) => (
                      <TableRow key={reservation.id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{reservation.guestName}</p>
                            <p className="text-xs text-gray-500">{reservation.documentType} {reservation.documentNumber}</p>
                          </div>
                        </TableCell>
                        <TableCell>{reservation.roomName || reservation.roomNumber || '-'}</TableCell>
                        <TableCell className="text-sm">{formatDate(reservation.checkInDate)}</TableCell>
                        <TableCell className="text-sm">{formatDate(reservation.checkOutDate)}</TableCell>
                        <TableCell className="text-right">
                          {reservation.nights || calculateNights(reservation.checkInDate, reservation.checkOutDate)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(reservation.total || 0)}
                        </TableCell>
                        <TableCell>{getStatusBadge(reservation.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {reservation.status === 'confirmed' && (
                              <Button
                                size="sm"
                                variant="outline"
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
                                variant="outline"
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
                            <Button size="sm" variant="outline" onClick={() => openEditModal(reservation)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openFolio(reservation)}>
                              <Eye className="w-3 h-3 mr-1" /> Folio
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
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
                const roomRate = room.rate ?? room.ratePerNight ?? 0
                const label = `Hab. ${room.number || '-'}${room.name ? ` - ${room.name}` : ''} · ${room.type || 'Estándar'} · ${formatCurrency(roomRate)}/noche`
                return (
                  <option key={room.id} value={room.id}>
                    {label}
                  </option>
                )
              })}
            </Select>
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
          <div className="flex justify-end gap-3 pt-2">
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
                    <div key={charge.id || idx} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{charge.description}</p>
                        <p className="text-xs text-gray-500">
                          {getChargeTypeLabel(charge.type)}
                          {charge.createdAt && ` - ${formatDate(charge.createdAt)}`}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(charge.amount || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add charge */}
            {folioReservation?.status === 'checked_in' && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Agregar cargo</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Descripción"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    value={chargeDescription}
                    onChange={(e) => setChargeDescription(e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Monto"
                    className="w-28 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                  />
                  <Button
                    onClick={handleAddCharge}
                    disabled={isAddingCharge}
                    size="sm"
                  >
                    {isAddingCharge ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <><Plus className="w-4 h-4 mr-1" /> Agregar</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-lg font-semibold text-gray-700">Total</span>
              <span className="text-xl font-bold text-gray-900">{formatCurrency(folioTotal)}</span>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              {folioCharges.length > 0 && (
                <Button onClick={() => setShowInvoiceModal(true)}>
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

      {/* Invoice from Folio Modal */}
      <InvoiceFromFolioModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        reservation={folioReservation}
        charges={folioCharges}
        total={folioTotal}
        onInvoiceCreated={() => {
          setShowInvoiceModal(false)
        }}
      />
    </div>
  )
}
