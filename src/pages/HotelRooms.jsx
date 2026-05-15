import { useState, useEffect } from 'react'
import { Plus, BedDouble, Loader2, Trash2, Users, CheckCircle, AlertTriangle, Wrench, Edit, X, User, Calendar, DollarSign, Wifi, Phone, Clock, Settings, Receipt, LogOut, ShoppingCart, LogIn, Search } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createRoom, getRooms, updateRoom, deleteRoom, updateRoomStatus, getActiveReservations, checkOut, getChargesByReservation, getReservationTotal, createReservation, checkIn, deleteCharge } from '@/services/hotelService'
import { upsertCustomerFromSale, getCustomerByDocumentNumber } from '@/services/firestoreService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { formatCurrency } from '@/lib/utils'

const STATUS_CONFIG = {
  available: { label: 'Disponible', color: 'bg-green-500', bg: 'bg-green-50 border-green-300', text: 'text-green-700', icon: CheckCircle, iconColor: 'text-green-500' },
  occupied: { label: 'Ocupada', color: 'bg-red-500', bg: 'bg-red-50 border-red-300', text: 'text-red-700', icon: Users, iconColor: 'text-red-500' },
  cleaning: { label: 'Limpieza', color: 'bg-yellow-500', bg: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-700', icon: AlertTriangle, iconColor: 'text-yellow-500' },
  maintenance: { label: 'Mantenimiento', color: 'bg-gray-500', bg: 'bg-gray-50 border-gray-300', text: 'text-gray-700', icon: Wrench, iconColor: 'text-gray-500' },
}

const ROOM_TYPES = [
  { value: 'simple', label: 'Simple' },
  { value: 'doble', label: 'Doble' },
  { value: 'matrimonial', label: 'Matrimonial' },
  { value: 'suite', label: 'Suite' },
  { value: 'familiar', label: 'Familiar' },
]

const INITIAL_FORM = {
  number: '',
  name: '',
  type: 'simple',
  floor: '',
  rate: '',
  // Modo de tarificación: 'nightly' (por noche) o 'hourly' (por hora).
  pricingMode: 'nightly',
  ratePerHour: '',
  capacity: '1',
  amenities: '',
  notes: '',
}

// Calcula horas exactas (redondeo hacia arriba) entre dos pares fecha+hora.
const calculateHoursDiff = (checkInDate, checkInTime, checkOutDate, checkOutTime) => {
  if (!checkInDate || !checkInTime || !checkOutDate || !checkOutTime) return 0
  const inMs = new Date(`${checkInDate}T${checkInTime}:00`).getTime()
  const outMs = new Date(`${checkOutDate}T${checkOutTime}:00`).getTime()
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return 0
  const diffMs = outMs - inMs
  if (diffMs <= 0) return 0
  return Math.ceil(diffMs / (1000 * 60 * 60))
}

// Transiciones de estado válidas para operación diaria
const STATUS_TRANSITIONS = {
  available: ['occupied', 'cleaning', 'maintenance'],
  occupied: ['cleaning', 'available'],
  cleaning: ['available', 'maintenance'],
  maintenance: ['available', 'cleaning'],
}

export default function HotelRooms() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const appNavigate = useAppNavigate()
  const toast = useToast()

  const [rooms, setRooms] = useState([])
  const [activeReservations, setActiveReservations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  // Panel de detalle operativo
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  // Folio del huésped (se carga al abrir el detalle de una habitación ocupada)
  const [roomFolioCharges, setRoomFolioCharges] = useState([])
  const [roomFolioTotal, setRoomFolioTotal] = useState(0)
  const [isFolioLoading, setIsFolioLoading] = useState(false)
  // Flujo guiado de cobro antes del check-out
  // Check-in rápido
  const [isQuickCheckInOpen, setIsQuickCheckInOpen] = useState(false)
  const [quickForm, setQuickForm] = useState({
    documentType: 'DNI',
    documentNumber: '',
    guestName: '',
    phone: '',
    email: '',
    checkInDate: '',
    checkOutDate: '',
    // Solo se usan si la reserva es hourly:
    checkInTime: '',
    checkOutTime: '',
    ratePerNight: 0,
    ratePerHour: 0,
    notes: '',
  })
  // Modo de cobro elegido para esta reserva (toggle).
  // Por defecto toma el modo predeterminado de la habitación.
  const [quickReservationMode, setQuickReservationMode] = useState('nightly')
  const [isSavingQuickCheckIn, setIsSavingQuickCheckIn] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)
  // Modal de configuración (crear/editar)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  // Filtro de estado
  const [statusFilter, setStatusFilter] = useState('all')

  const stats = {
    total: rooms.length,
    available: rooms.filter(r => r.status === 'available').length,
    occupied: rooms.filter(r => r.status === 'occupied').length,
    cleaning: rooms.filter(r => r.status === 'cleaning').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
  }

  const filteredRooms = statusFilter === 'all'
    ? rooms
    : rooms.filter(r => r.status === statusFilter)

  // Obtener huésped actual de una habitación ocupada
  const getGuestForRoom = (roomId) => {
    const source = isDemoMode
      ? (demoData?.hotelReservations || [])
      : activeReservations
    return source.find(r => r.roomId === roomId && r.status === 'checked_in')
  }

  useEffect(() => {
    loadRooms()
  }, [user, isDemoMode])

  // Cargar folio cuando se abre una habitación ocupada
  useEffect(() => {
    if (!selectedRoom || selectedRoom.status !== 'occupied') {
      setRoomFolioCharges([])
      setRoomFolioTotal(0)
      return
    }
    const guest = getGuestForRoom(selectedRoom.id)
    if (!guest) {
      setRoomFolioCharges([])
      setRoomFolioTotal(0)
      return
    }

    const loadFolio = async () => {
      setIsFolioLoading(true)
      try {
        if (isDemoMode) {
          const charges = (demoData?.hotelFolioCharges || []).filter(c => c.reservationId === guest.id)
          setRoomFolioCharges(charges)
          setRoomFolioTotal(charges.reduce((s, c) => s + (c.amount || 0), 0))
          return
        }
        const businessId = getBusinessId()
        const [chargesResult, totalResult] = await Promise.all([
          getChargesByReservation(businessId, guest.id),
          getReservationTotal(businessId, guest.id),
        ])
        if (chargesResult.success) setRoomFolioCharges(chargesResult.data || [])
        if (totalResult.success) setRoomFolioTotal(totalResult.data || 0)
      } catch (error) {
        console.error('Error al cargar folio de habitación:', error)
      } finally {
        setIsFolioLoading(false)
      }
    }
    loadFolio()
  }, [selectedRoom, activeReservations]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRooms = async () => {
    if (!user?.uid && !isDemoMode) return
    setIsLoading(true)
    try {
      if (isDemoMode && demoData?.hotelRooms) {
        setRooms(demoData.hotelRooms)
        setActiveReservations(demoData.hotelReservations || [])
        setIsLoading(false)
        return
      }
      const businessId = getBusinessId()
      const [roomsResult, reservationsResult] = await Promise.all([
        getRooms(businessId),
        getActiveReservations(businessId),
      ])
      if (roomsResult.success) {
        setRooms(roomsResult.data)
      } else {
        toast.error('Error al cargar habitaciones')
      }
      if (reservationsResult.success) {
        setActiveReservations(reservationsResult.data || [])
      }
    } catch (error) {
      toast.error('Error al cargar habitaciones')
    } finally {
      setIsLoading(false)
    }
  }

  // --- Gestión operativa (panel de detalle) ---

  const openRoomDetail = (room) => {
    setSelectedRoom(room)
  }

  const closeRoomDetail = () => {
    setSelectedRoom(null)
  }

  // Abrir modal de check-in rápido
  const openQuickCheckIn = () => {
    if (!selectedRoom) return
    const today = new Date().toISOString().split('T')[0]
    const roomSupportsHourly = (selectedRoom.ratePerHour || 0) > 0
    // Default del toggle: modo predeterminado de la habitación, pero solo si la
    // habitación realmente lo soporta. Si no, siempre 'nightly'.
    const defaultMode = (selectedRoom.pricingMode === 'hourly' && roomSupportsHourly) ? 'hourly' : 'nightly'
    setQuickReservationMode(defaultMode)
    // Para hourly, default: misma fecha; hora actual.
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    setQuickForm({
      documentType: 'DNI',
      documentNumber: '',
      guestName: '',
      phone: '',
      email: '',
      checkInDate: today,
      checkOutDate: defaultMode === 'hourly' ? today : '',
      checkInTime: defaultMode === 'hourly' ? currentTime : '',
      checkOutTime: '',
      ratePerNight: Number(selectedRoom.rate ?? selectedRoom.ratePerNight ?? 0),
      ratePerHour: Number(selectedRoom.ratePerHour ?? 0),
      notes: '',
    })
    setIsQuickCheckInOpen(true)
  }

  const closeQuickCheckIn = () => {
    if (isSavingQuickCheckIn) return
    setIsQuickCheckInOpen(false)
  }

  // Búsqueda de huésped: primero en Clientes registrados, luego RENIEC/SUNAT
  const handleQuickLookup = async () => {
    const docNumber = quickForm.documentNumber?.trim()
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
          setQuickForm(prev => ({
            ...prev,
            guestName: c.businessName || c.name || prev.guestName,
            phone: c.phone || prev.phone,
            email: c.email || prev.email,
            documentType: c.documentType || prev.documentType,
          }))
          toast.success('Huésped ya registrado, datos cargados')
          return
        }
      }

      // 2. Si no existe localmente, consultar RENIEC/SUNAT
      if (quickForm.documentType === 'DNI' && docNumber.length === 8) {
        const result = await consultarDNI(docNumber)
        if (result.success && result.data) {
          const name = result.data.nombreCompleto
            || `${result.data.nombres || ''} ${result.data.apellidoPaterno || ''} ${result.data.apellidoMaterno || ''}`.trim()
          if (name) {
            setQuickForm(prev => ({ ...prev, guestName: name }))
            toast.success('Huésped encontrado en RENIEC')
          } else {
            toast.error('No se pudo obtener el nombre del DNI')
          }
        } else {
          toast.error(result.error || 'No se encontró el DNI')
        }
      } else if (quickForm.documentType === 'RUC' && docNumber.length === 11) {
        const result = await consultarRUC(docNumber)
        if (result.success && result.data) {
          const name = result.data.razonSocial || result.data.nombreComercial || ''
          if (name) {
            setQuickForm(prev => ({ ...prev, guestName: name }))
            toast.success('Empresa encontrada en SUNAT')
          } else {
            toast.error('No se pudo obtener la razón social')
          }
        } else {
          toast.error(result.error || 'No se encontró el RUC')
        }
      } else {
        toast.error(quickForm.documentType === 'DNI' ? 'DNI debe tener 8 dígitos' : quickForm.documentType === 'RUC' ? 'RUC debe tener 11 dígitos' : 'Búsqueda solo disponible para DNI o RUC')
      }
    } catch (error) {
      console.error('Error al buscar huésped:', error)
      toast.error('Error al consultar documento')
    } finally {
      setIsLookingUp(false)
    }
  }

  // Guardar check-in rápido: crear reserva + check-in + sync huésped
  const handleQuickCheckInSave = async () => {
    if (!selectedRoom) return
    // El modo se toma del toggle, no de la habitación.
    const isHourly = quickReservationMode === 'hourly'
    const { documentNumber, guestName, checkInDate, checkOutDate, ratePerNight, ratePerHour, checkInTime, checkOutTime } = quickForm
    if (!documentNumber?.trim()) { toast.error('Ingrese el número de documento'); return }
    if (!guestName?.trim()) { toast.error('Ingrese el nombre del huésped'); return }
    if (!checkInDate) { toast.error('Seleccione fecha de check-in'); return }
    if (!checkOutDate) { toast.error('Seleccione fecha de check-out'); return }

    // Validaciones específicas según modo
    let nights = 0
    let hours = 0
    let totalAmount = 0
    if (isHourly) {
      if (!checkInTime) { toast.error('Seleccione hora de check-in'); return }
      if (!checkOutTime) { toast.error('Seleccione hora de check-out'); return }
      hours = calculateHoursDiff(checkInDate, checkInTime, checkOutDate, checkOutTime)
      if (hours <= 0) { toast.error('La hora de check-out debe ser posterior al check-in'); return }
      totalAmount = hours * Number(ratePerHour || 0)
    } else {
      if (new Date(checkOutDate) <= new Date(checkInDate)) { toast.error('Check-out debe ser posterior al check-in'); return }
      nights = Math.max(Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24)), 1)
      totalAmount = nights * Number(ratePerNight || 0)
    }

    setIsSavingQuickCheckIn(true)
    try {
      if (isDemoMode) {
        toast.error('No disponible en modo demo')
        return
      }
      const businessId = getBusinessId()

      // 1. Crear reserva
      const reservationPayload = {
        guestName: guestName.trim(),
        documentType: quickForm.documentType,
        documentNumber: documentNumber.trim(),
        guestDocument: documentNumber.trim(),
        guestDocumentType: quickForm.documentType,
        phone: quickForm.phone || '',
        guestPhone: quickForm.phone || '',
        email: quickForm.email || '',
        guestEmail: quickForm.email || '',
        roomId: selectedRoom.id,
        roomNumber: selectedRoom.number || '',
        roomName: selectedRoom.name || '',
        checkIn: checkInDate,
        checkOut: checkOutDate,
        checkInDate,
        checkOutDate,
        // Campos según modo
        pricingMode: isHourly ? 'hourly' : 'nightly',
        ...(isHourly && {
          checkInTime,
          checkOutTime,
          hours,
          ratePerHour: Number(ratePerHour || 0),
        }),
        nights,
        ratePerNight: Number(ratePerNight || 0),
        totalAmount,
        total: totalAmount,
        notes: quickForm.notes || '',
        userId: user.uid,
      }
      const createResult = await createReservation(businessId, reservationPayload)
      if (!createResult.success) {
        toast.error(createResult.error || 'Error al crear reserva')
        return
      }

      // 2. Check-in inmediato
      const checkInResult = await checkIn(businessId, createResult.data.id, selectedRoom.id)
      if (!checkInResult.success) {
        toast.warning('Reserva creada pero falló el check-in. Haz check-in desde Reservas.')
      }

      // 3. Sincronizar huésped a Clientes
      upsertCustomerFromSale(businessId, {
        documentType: quickForm.documentType === 'RUC' ? 'RUC' : 'DNI',
        documentNumber: documentNumber.trim(),
        name: guestName.trim(),
        businessName: quickForm.documentType === 'RUC' ? guestName.trim() : '',
        email: quickForm.email || '',
        phone: quickForm.phone || '',
      }).catch(err => console.warn('No se pudo sincronizar huésped:', err))

      toast.success(`Check-in realizado: ${guestName}`)
      setIsQuickCheckInOpen(false)
      setSelectedRoom(null)
      await loadRooms()
    } catch (error) {
      console.error('Error en check-in rápido:', error)
      toast.error('Error al realizar check-in')
    } finally {
      setIsSavingQuickCheckIn(false)
    }
  }

  // Ir al folio de la reserva de esta habitación
  const handleGoToFolio = (guest) => {
    if (!guest) return
    setSelectedRoom(null)
    appNavigate(`/reservas?folio=${guest.id}`)
  }

  // Ir al Punto de Venta
  const handleGoToPOS = () => {
    setSelectedRoom(null)
    appNavigate('/pos')
  }

  // Ejecutar el check-out real (después de cobrar o si no hay cargos)
  const executeCheckOut = async (guest, roomId) => {
    setIsCheckingOut(true)
    try {
      if (isDemoMode) {
        setRooms(prev => prev.map(r =>
          r.id === roomId ? { ...r, status: 'cleaning' } : r
        ))
        setActiveReservations(prev => prev.map(r =>
          r.id === guest.id ? { ...r, status: 'checked_out' } : r
        ))
        setSelectedRoom(prev => prev && prev.id === roomId ? { ...prev, status: 'cleaning' } : prev)
        toast.success(`Check-out realizado: ${guest.guestName} (DEMO)`)
        return true
      }
      const businessId = getBusinessId()
      const result = await checkOut(businessId, guest.id, roomId)
      if (result.success) {
        toast.success(`Check-out realizado: ${guest.guestName}`)
        await loadRooms()
        setSelectedRoom(prev => prev && prev.id === roomId ? { ...prev, status: 'cleaning' } : prev)
        return true
      } else {
        toast.error(result.error || 'Error en check-out')
        return false
      }
    } catch (error) {
      toast.error('Error en check-out')
      return false
    } finally {
      setIsCheckingOut(false)
    }
  }

  // Check-out guiado: preguntar qué hacer con cargos pendientes (cobrar o descartar)
  const handleQuickCheckOut = async (guest) => {
    if (!selectedRoom || !guest) return
    setIsCheckingOut(true)
    try {
      // Cargar cargos del folio
      let charges = []
      if (isDemoMode) {
        charges = (demoData?.hotelFolioCharges || []).filter(c => c.reservationId === guest.id)
      } else {
        const businessId = getBusinessId()
        const chargesResult = await getChargesByReservation(businessId, guest.id)
        if (chargesResult.success) charges = chargesResult.data || []
      }

      const pending = charges.filter(c => !c.invoiceId)
      const pendingTotal = pending.reduce((s, c) => s + (c.amount || 0), 0)

      if (pending.length > 0 && pendingTotal > 0) {
        const summary = pending.map(c => `• ${c.description}: S/ ${(c.amount || 0).toFixed(2)}`).join('\n')
        const msg = `Hay ${pending.length} cargo(s) sin cobrar por S/ ${pendingTotal.toFixed(2)}:\n\n${summary}\n\n¿Cobrarlos ahora en el POS?\n\n[Aceptar] → Ir al POS\n[Cancelar] → Descartar del folio y hacer check-out`
        const goToPOS = window.confirm(msg)
        if (goToPOS) {
          setIsCheckingOut(false)
          setSelectedRoom(null)
          appNavigate('/pos', {
            state: {
              fromFolio: true,
              reservationId: guest.id,
              items: pending,
              customer: {
                documentType: guest.documentType || guest.guestDocumentType || 'DNI',
                documentNumber: guest.documentNumber || guest.guestDocument || '',
                name: guest.guestName || '',
                email: guest.email || guest.guestEmail || '',
                phone: guest.phone || guest.guestPhone || '',
              },
              reservationNote: `Folio de ${guest.guestName} · Hab. ${selectedRoom.number}`,
            },
          })
          return
        }
        // Descartar del folio
        if (!isDemoMode) {
          const businessId = getBusinessId()
          for (const c of pending) {
            try { await deleteCharge(businessId, c.id) } catch (e) { console.warn('No se pudo eliminar cargo', c.id, e) }
          }
        }
        await executeCheckOut(guest, selectedRoom.id)
        return
      }

      // Sin pendientes → confirmar y check-out directo
      const confirmMsg = charges.length > 0
        ? `Todos los cargos ya fueron facturados. ¿Confirmar check-out de ${guest.guestName}?`
        : `No hay cargos registrados en el folio de ${guest.guestName}. ¿Confirmar check-out?`
      if (!window.confirm(confirmMsg)) {
        setIsCheckingOut(false)
        return
      }
      await executeCheckOut(guest, selectedRoom.id)
    } catch (error) {
      console.error('Error en check-out guiado:', error)
      toast.error('Error al preparar check-out')
      setIsCheckingOut(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    if (!selectedRoom || newStatus === selectedRoom.status) return

    setIsChangingStatus(true)
    try {
      if (isDemoMode) {
        // En demo, actualizar localmente
        setRooms(prev => prev.map(r =>
          r.id === selectedRoom.id ? { ...r, status: newStatus } : r
        ))
        setSelectedRoom(prev => ({ ...prev, status: newStatus }))
        toast.success(`Habitación ${selectedRoom.number} → ${STATUS_CONFIG[newStatus].label}`)
      } else {
        const businessId = getBusinessId()
        const result = await updateRoomStatus(businessId, selectedRoom.id, newStatus)
        if (result.success) {
          toast.success(`Habitación ${selectedRoom.number} → ${STATUS_CONFIG[newStatus].label}`)
          await loadRooms()
          setSelectedRoom(prev => ({ ...prev, status: newStatus }))
        } else {
          toast.error(result.error || 'Error al cambiar estado')
        }
      }
    } catch (error) {
      toast.error('Error al cambiar estado')
    } finally {
      setIsChangingStatus(false)
    }
  }

  // --- Configuración de habitación (modal CRUD) ---

  const openCreateModal = () => {
    setEditingRoom(null)
    setFormData(INITIAL_FORM)
    setDeleteConfirm(false)
    setIsConfigModalOpen(true)
  }

  const openEditFromDetail = () => {
    if (!selectedRoom) return
    setEditingRoom(selectedRoom)
    setFormData({
      number: selectedRoom.number || '',
      name: selectedRoom.name || '',
      type: selectedRoom.type || 'simple',
      floor: selectedRoom.floor?.toString() || '',
      rate: (selectedRoom.rate || selectedRoom.ratePerNight)?.toString() || '',
      pricingMode: selectedRoom.pricingMode === 'hourly' ? 'hourly' : 'nightly',
      ratePerHour: selectedRoom.ratePerHour?.toString() || '',
      capacity: selectedRoom.capacity?.toString() || '1',
      amenities: Array.isArray(selectedRoom.amenities) ? selectedRoom.amenities.join(', ') : (selectedRoom.amenities || ''),
      notes: selectedRoom.notes || '',
    })
    setDeleteConfirm(false)
    setSelectedRoom(null)
    setIsConfigModalOpen(true)
  }

  const closeConfigModal = () => {
    setIsConfigModalOpen(false)
    setEditingRoom(null)
    setDeleteConfirm(false)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    if (!formData.number.trim()) {
      toast.error('El número de habitación es obligatorio')
      return
    }
    if (!formData.rate || parseFloat(formData.rate) <= 0) {
      toast.error('La tarifa por noche debe ser mayor a 0')
      return
    }
    // ratePerHour es opcional: si está en 0, la habitación solo soporta reservas por noche.
    if (formData.pricingMode === 'hourly' && (!formData.ratePerHour || parseFloat(formData.ratePerHour) <= 0)) {
      toast.error('Si el modo predeterminado es "Por hora", la tarifa por hora debe ser mayor a 0')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const payload = {
        number: formData.number.trim(),
        name: formData.name.trim(),
        type: formData.type,
        floor: formData.floor.trim(),
        rate: parseFloat(formData.rate) || 0,
        // Ambas tarifas se guardan siempre. El modo se elige al crear la reserva.
        ratePerHour: parseFloat(formData.ratePerHour) || 0,
        pricingMode: formData.pricingMode === 'hourly' ? 'hourly' : 'nightly',
        capacity: parseInt(formData.capacity) || 1,
        amenities: formData.amenities.trim(),
        notes: formData.notes.trim(),
      }

      if (isDemoMode) {
        if (editingRoom) {
          setRooms(prev => prev.map(r =>
            r.id === editingRoom.id ? { ...r, ...payload } : r
          ))
          toast.success('Habitación actualizada')
        } else {
          const newRoom = { ...payload, id: `room-${Date.now()}`, status: 'available' }
          setRooms(prev => [...prev, newRoom])
          toast.success('Habitación creada')
        }
        closeConfigModal()
        return
      }

      let result
      if (editingRoom) {
        result = await updateRoom(businessId, editingRoom.id, payload)
      } else {
        result = await createRoom(businessId, payload)
      }

      if (result.success) {
        toast.success(editingRoom ? 'Habitación actualizada' : 'Habitación creada')
        closeConfigModal()
        loadRooms()
      } else {
        toast.error(result.error || 'Error al guardar')
      }
    } catch (error) {
      toast.error('Error al guardar habitación')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }
    setIsDeleting(true)
    try {
      if (isDemoMode) {
        setRooms(prev => prev.filter(r => r.id !== editingRoom.id))
        toast.success('Habitación eliminada')
        closeConfigModal()
        return
      }
      const businessId = getBusinessId()
      const result = await deleteRoom(businessId, editingRoom.id)
      if (result.success) {
        toast.success('Habitación eliminada')
        closeConfigModal()
        loadRooms()
      } else {
        toast.error(result.error || 'Error al eliminar')
      }
    } catch (error) {
      toast.error('Error al eliminar habitación')
    } finally {
      setIsDeleting(false)
    }
  }

  // Formatear fecha corta
  const formatDate = (date) => {
    if (!date) return '-'
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BedDouble className="w-7 h-7 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Habitaciones</h1>
        </div>
        <Button onClick={openCreateModal} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Nueva
        </Button>
      </div>

      {/* Stats como filtros clickeables */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { key: 'all', label: 'Todas', count: stats.total, bgActive: 'bg-blue-100 border-blue-400', icon: BedDouble, iconColor: 'text-blue-600' },
          { key: 'available', label: 'Disponibles', count: stats.available, bgActive: 'bg-green-100 border-green-400', icon: CheckCircle, iconColor: 'text-green-600' },
          { key: 'occupied', label: 'Ocupadas', count: stats.occupied, bgActive: 'bg-red-100 border-red-400', icon: Users, iconColor: 'text-red-600' },
          { key: 'cleaning', label: 'Limpieza', count: stats.cleaning, bgActive: 'bg-yellow-100 border-yellow-400', icon: AlertTriangle, iconColor: 'text-yellow-600' },
          { key: 'maintenance', label: 'Mant.', count: stats.maintenance, bgActive: 'bg-gray-200 border-gray-400', icon: Wrench, iconColor: 'text-gray-600' },
        ].map(f => {
          const Icon = f.icon
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`p-2 rounded-lg border-2 transition-all text-center ${
                statusFilter === f.key
                  ? `${f.bgActive} shadow-sm`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${statusFilter === f.key ? f.iconColor : 'text-gray-400'}`} />
              <p className="text-lg font-bold leading-none">{f.count}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 hidden sm:block">{f.label}</p>
            </button>
          )
        })}
      </div>

      {/* Room Grid */}
      {rooms.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BedDouble className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No hay habitaciones registradas</p>
            <Button onClick={openCreateModal}>
              <Plus className="w-4 h-4 mr-2" />
              Crear primera habitación
            </Button>
          </CardContent>
        </Card>
      ) : filteredRooms.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          No hay habitaciones con estado "{STATUS_CONFIG[statusFilter]?.label}"
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredRooms.map(room => {
            const statusCfg = STATUS_CONFIG[room.status] || STATUS_CONFIG.available
            const typeLabel = ROOM_TYPES.find(t => t.value === (room.type || '').toLowerCase())?.label || room.type
            const guest = room.status === 'occupied' ? getGuestForRoom(room.id) : null
            return (
              <div
                key={room.id}
                onClick={() => openRoomDetail(room)}
                className={`relative border-2 rounded-xl p-3 cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] ${statusCfg.bg}`}
              >
                {/* Status indicator dot */}
                <div className={`absolute top-2.5 right-2.5 w-3 h-3 rounded-full ${statusCfg.color} ring-2 ring-white`} />

                {/* Room number + name */}
                <p className="text-2xl font-bold text-gray-800 leading-none">{room.number}</p>
                {room.name && (
                  <p className="text-[11px] text-gray-600 mt-0.5 truncate">{room.name}</p>
                )}

                {/* Type · Piso · Capacidad */}
                <div className="flex items-center flex-wrap gap-x-1.5 mt-1 text-[11px] text-gray-500">
                  <span className="font-medium">{typeLabel}</span>
                  {room.floor && <span>· Piso {room.floor}</span>}
                  {room.capacity && (
                    <span className="flex items-center gap-0.5">
                      · <Users className="w-3 h-3" />{room.capacity}
                    </span>
                  )}
                </div>

                {/* Huésped + fecha salida si ocupada */}
                {guest && (
                  <div className="mt-2 bg-white/70 rounded px-1.5 py-1 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      <p className="text-[11px] text-gray-800 font-semibold truncate">{guest.guestName}</p>
                    </div>
                    {(guest.checkOut || guest.checkOutDate) && (
                      <p className="text-[10px] text-gray-500 flex items-center gap-0.5">
                        <LogOut className="w-2.5 h-2.5" />
                        Sale: {formatDate(guest.checkOut || guest.checkOutDate)}
                      </p>
                    )}
                  </div>
                )}

                {/* Tarifa(s): muestra la del modo predeterminado primero, y la otra abajo si existe */}
                <div className="text-xs font-semibold text-gray-700 mt-2 space-y-0.5">
                  {room.pricingMode === 'hourly' && (room.ratePerHour || 0) > 0 ? (
                    <>
                      <p>
                        S/ {(room.ratePerHour || 0).toFixed(0)}
                        <span className="font-normal text-gray-400"> /hora</span>
                      </p>
                      {(room.rate || room.ratePerNight || 0) > 0 && (
                        <p className="text-[10px] text-gray-400 font-normal">
                          S/ {(room.rate || room.ratePerNight || 0).toFixed(0)} /noche
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        S/ {(room.rate || room.ratePerNight || 0).toFixed(0)}
                        <span className="font-normal text-gray-400"> /noche</span>
                      </p>
                      {(room.ratePerHour || 0) > 0 && (
                        <p className="text-[10px] text-gray-400 font-normal">
                          S/ {(room.ratePerHour || 0).toFixed(0)} /hora
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Status badge */}
                <div className={`mt-2 text-center text-[10px] font-semibold py-0.5 rounded-full ${statusCfg.color} text-white`}>
                  {statusCfg.label}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Room Detail Panel (operativo) */}
      <Modal isOpen={!!selectedRoom} onClose={closeRoomDetail} title={`Habitación ${selectedRoom?.number || ''}`} size="md">
        {selectedRoom && (() => {
          const statusCfg = STATUS_CONFIG[selectedRoom.status] || STATUS_CONFIG.available
          const StatusIcon = statusCfg.icon
          const typeLabel = ROOM_TYPES.find(t => t.value === (selectedRoom.type || '').toLowerCase())?.label || selectedRoom.type
          const guest = selectedRoom.status === 'occupied' ? getGuestForRoom(selectedRoom.id) : null
          const allowedTransitions = STATUS_TRANSITIONS[selectedRoom.status] || []

          return (
            <div className="space-y-4">
              {/* Estado actual */}
              <div className={`flex items-center gap-3 p-3 rounded-xl ${statusCfg.bg} border-2`}>
                <StatusIcon className={`w-6 h-6 ${statusCfg.iconColor}`} />
                <div className="flex-1">
                  <p className={`text-sm font-bold ${statusCfg.text}`}>{statusCfg.label}</p>
                  <p className="text-xs text-gray-500">{typeLabel} · Piso {selectedRoom.floor || '-'} · Cap. {selectedRoom.capacity || 1}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-800 leading-tight">
                    S/ {(selectedRoom.rate || selectedRoom.ratePerNight || 0).toFixed(2)}
                    <span className="text-xs font-normal text-gray-400"> /noche</span>
                  </p>
                  {(selectedRoom.ratePerHour || 0) > 0 && (
                    <p className="text-xs text-gray-600 leading-tight">
                      S/ {selectedRoom.ratePerHour.toFixed(2)}
                      <span className="text-gray-400"> /hora</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Check-in rápido (solo si la habitación está disponible) */}
              {selectedRoom.status === 'available' && (
                <button
                  onClick={openQuickCheckIn}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-green-300 bg-green-50 hover:bg-green-100 transition-all active:scale-95 font-semibold text-green-700"
                >
                  <LogIn className="w-5 h-5" />
                  Check-in rápido
                </button>
              )}

              {/* Huésped actual */}
              {guest && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Huésped actual</p>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-blue-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{guest.guestName}</p>
                      <p className="text-xs text-gray-500">{guest.guestDocumentType === 'A' ? 'Pasaporte' : 'DNI'}: {guest.guestDocument}</p>
                      {guest.guestPhone && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-500">{guest.guestPhone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600 pt-1 border-t border-blue-200">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>In: {formatDate(guest.checkIn)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>Out: {formatDate(guest.checkOut)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span>
                        {guest.pricingMode === 'hourly'
                          ? `${guest.hours || 0} hora${(guest.hours || 0) !== 1 ? 's' : ''}`
                          : `${guest.nights || 0} noches`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 ml-auto font-semibold">
                      <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                      <span>S/ {guest.totalAmount?.toFixed(2)}</span>
                    </div>
                  </div>
                  {guest.notes && (
                    <p className="text-xs text-blue-700 italic">"{guest.notes}"</p>
                  )}
                </div>
              )}

              {/* Detalle del folio */}
              {guest && (
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalle del folio</p>
                    <span className="text-xs text-gray-400">
                      {roomFolioCharges.length} cargo{roomFolioCharges.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {isFolioLoading ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                  ) : roomFolioCharges.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">Sin cargos registrados aún</p>
                  ) : (
                    <div className="max-h-44 overflow-y-auto divide-y text-sm">
                      {roomFolioCharges.map(charge => (
                        <div key={charge.id} className="flex items-start justify-between py-1.5 gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-800 truncate">{charge.description}</p>
                            {charge.date && (
                              <p className="text-[10px] text-gray-400">{charge.date}</p>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-gray-900 flex-shrink-0">
                            {formatCurrency(charge.amount || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-sm font-semibold text-gray-700">Total folio</span>
                    <span className="text-base font-bold text-gray-900">{formatCurrency(roomFolioTotal)}</span>
                  </div>
                </div>
              )}

              {/* Acciones para habitación ocupada */}
              {selectedRoom.status === 'occupied' && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Acciones</p>
                  {guest ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleGoToFolio(guest)}
                        className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all hover:scale-[1.03] active:scale-95"
                      >
                        <Receipt className="w-5 h-5 text-emerald-600" />
                        <span className="text-xs font-semibold text-emerald-700">Ver folio / Cargos</span>
                      </button>
                      <button
                        onClick={() => handleQuickCheckOut(guest)}
                        disabled={isCheckingOut}
                        className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCheckingOut ? (
                          <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                        ) : (
                          <LogOut className="w-5 h-5 text-orange-600" />
                        )}
                        <span className="text-xs font-semibold text-orange-700">Check-out</span>
                      </button>
                    </div>
                  ) : (
                    /* Sin huésped (habitación marcada como ocupada manualmente): solo liberar */
                    <button
                      onClick={() => handleStatusChange('cleaning')}
                      disabled={isChangingStatus}
                      className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isChangingStatus ? (
                        <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                      ) : (
                        <LogOut className="w-5 h-5 text-orange-600" />
                      )}
                      <span className="text-sm font-semibold text-orange-700">Liberar habitación</span>
                    </button>
                  )}
                </div>
              )}

              {/* Amenidades */}
              {selectedRoom.amenities && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Amenidades</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(selectedRoom.amenities) ? selectedRoom.amenities : selectedRoom.amenities.split(',').map(a => a.trim())).filter(Boolean).map((amenity, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-600">
                        <Wifi className="w-3 h-3" />
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cambiar estado (solo si NO está ocupada — la liberación se hace con Check-out o Liberar) */}
              {selectedRoom.status !== 'occupied' && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cambiar estado</p>
                <div className="grid grid-cols-3 gap-2">
                  {allowedTransitions.map(status => {
                    const cfg = STATUS_CONFIG[status]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        disabled={isChangingStatus}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all
                          hover:scale-[1.03] hover:shadow-md active:scale-95
                          ${cfg.bg}
                          ${isChangingStatus ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        {isChangingStatus ? (
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        ) : (
                          <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
                        )}
                        <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              )}

              {/* Footer con botón de configuración */}
              <div className="flex items-center justify-between pt-3 border-t">
                <button
                  onClick={openEditFromDetail}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Editar configuración
                </button>
                <Button variant="outline" size="sm" onClick={closeRoomDetail}>
                  Cerrar
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Config Modal (crear/editar habitación) */}
      <Modal isOpen={isConfigModalOpen} onClose={closeConfigModal} title={editingRoom ? `Configurar Hab. ${editingRoom.number}` : 'Nueva Habitación'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Número"
              name="number"
              value={formData.number}
              onChange={handleChange}
              placeholder="101"
              required
            />
            <Input
              label="Nombre"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Hab. Premium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Tipo" name="type" value={formData.type} onChange={handleChange}>
              {ROOM_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
            <Input
              label="Piso"
              name="floor"
              value={formData.floor}
              onChange={handleChange}
              placeholder="1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tarifa por noche (S/)"
              name="rate"
              type="number"
              value={formData.rate}
              onChange={handleChange}
              placeholder="150.00"
              required
            />
            <Input
              label="Capacidad"
              name="capacity"
              type="number"
              value={formData.capacity}
              onChange={handleChange}
              placeholder="2"
            />
          </div>

          {/* Tarifa por hora (opcional) */}
          <div className="space-y-2 pt-2 border-t">
            <Input
              label="Tarifa por hora (S/) — opcional"
              name="ratePerHour"
              type="number"
              step="0.01"
              value={formData.ratePerHour}
              onChange={handleChange}
              placeholder="0.00"
            />
            <p className="text-xs text-gray-500">
              Dejá en 0 si esta habitación se cobra solo por noche.
              Si la llenás, podrás elegir el modo (por noche o por hora) al crear cada reserva.
            </p>
          </div>

          {/* Modo predeterminado (solo si hay tarifa por hora) */}
          {parseFloat(formData.ratePerHour) > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Modo predeterminado para nuevas reservas</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, pricingMode: 'nightly' }))}
                  className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 transition-colors text-sm ${
                    formData.pricingMode !== 'hourly'
                      ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  Por noche
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, pricingMode: 'hourly' }))}
                  className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 transition-colors text-sm ${
                    formData.pricingMode === 'hourly'
                      ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  Por hora
                </button>
              </div>
              <p className="text-xs text-gray-500">Se puede cambiar en cada reserva.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amenidades</label>
            <textarea
              name="amenities"
              value={formData.amenities}
              onChange={handleChange}
              rows={2}
              placeholder="WiFi, TV, Aire acondicionado, Minibar..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Notas adicionales..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors bg-white text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            {editingRoom ? (
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {isDeleting ? 'Eliminando...' : deleteConfirm ? 'Confirmar eliminar' : 'Eliminar'}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeConfigModal}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingRoom ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Check-in rápido */}
      <Modal
        isOpen={isQuickCheckInOpen}
        onClose={closeQuickCheckIn}
        title={`Check-in rápido · Hab. ${selectedRoom?.number || ''}`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Se creará la reserva y se hará check-in en un solo paso.</p>

          {/* Documento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Documento *</label>
            <div className="flex gap-2">
              <select
                className="w-28 flex-shrink-0 h-10 px-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500"
                value={quickForm.documentType}
                onChange={e => setQuickForm(prev => ({ ...prev, documentType: e.target.value }))}
              >
                <option value="DNI">DNI</option>
                <option value="RUC">RUC</option>
                <option value="CE">CE</option>
                <option value="Pasaporte">Pasaporte</option>
              </select>
              <input
                type="text"
                placeholder={quickForm.documentType === 'DNI' ? '8 dígitos' : quickForm.documentType === 'RUC' ? '11 dígitos' : 'Número'}
                className="flex-1 min-w-0 h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                value={quickForm.documentNumber}
                onChange={e => setQuickForm(prev => ({ ...prev, documentNumber: e.target.value }))}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleQuickLookup}
                disabled={isLookingUp || !quickForm.documentNumber?.trim()}
                className="flex-shrink-0 px-3"
                title="Buscar en Clientes o RENIEC/SUNAT"
              >
                {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Nombre */}
          <Input
            label="Nombre completo *"
            value={quickForm.guestName}
            onChange={e => setQuickForm(prev => ({ ...prev, guestName: e.target.value }))}
          />

          {/* Teléfono / Email */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Teléfono"
              type="tel"
              value={quickForm.phone}
              onChange={e => setQuickForm(prev => ({ ...prev, phone: e.target.value }))}
            />
            <Input
              label="Email"
              type="email"
              value={quickForm.email}
              onChange={e => setQuickForm(prev => ({ ...prev, email: e.target.value }))}
            />
          </div>

          {/* Toggle de modo: solo se muestra si la habitación tiene tarifa por hora */}
          {(selectedRoom?.ratePerHour || 0) > 0 && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">¿Cómo se cobra?</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setQuickReservationMode('nightly')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 transition-colors text-sm ${
                    quickReservationMode === 'nightly'
                      ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  Por noche
                </button>
                <button
                  type="button"
                  onClick={() => setQuickReservationMode('hourly')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 transition-colors text-sm ${
                    quickReservationMode === 'hourly'
                      ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  Por hora
                </button>
              </div>
            </div>
          )}

          {/* Fechas (y horas si la reserva es por hora) */}
          {quickReservationMode === 'hourly' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Fecha check-in *"
                  type="date"
                  value={quickForm.checkInDate}
                  onChange={e => setQuickForm(prev => ({ ...prev, checkInDate: e.target.value }))}
                />
                <Input
                  label="Hora check-in *"
                  type="time"
                  value={quickForm.checkInTime}
                  onChange={e => setQuickForm(prev => ({ ...prev, checkInTime: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Fecha check-out *"
                  type="date"
                  value={quickForm.checkOutDate}
                  onChange={e => setQuickForm(prev => ({ ...prev, checkOutDate: e.target.value }))}
                />
                <Input
                  label="Hora check-out *"
                  type="time"
                  value={quickForm.checkOutTime}
                  onChange={e => setQuickForm(prev => ({ ...prev, checkOutTime: e.target.value }))}
                />
              </div>
              {/* Tarifa por hora + preview de horas/total */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <Input
                  label="Tarifa por hora (S/)"
                  type="number"
                  step="0.01"
                  value={quickForm.ratePerHour}
                  onChange={e => setQuickForm(prev => ({ ...prev, ratePerHour: e.target.value }))}
                />
                {(() => {
                  const h = calculateHoursDiff(quickForm.checkInDate, quickForm.checkInTime, quickForm.checkOutDate, quickForm.checkOutTime)
                  const total = h * Number(quickForm.ratePerHour || 0)
                  if (h <= 0) return <p className="text-xs text-gray-400">Define fechas y horas</p>
                  return (
                    <div className="text-sm text-right">
                      <p className="text-gray-500">{h} hora{h !== 1 ? 's' : ''} (redondeado)</p>
                      <p className="text-lg font-bold text-gray-900">Total: {formatCurrency(total)}</p>
                    </div>
                  )
                })()}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Check-in *"
                  type="date"
                  value={quickForm.checkInDate}
                  onChange={e => setQuickForm(prev => ({ ...prev, checkInDate: e.target.value }))}
                />
                <Input
                  label="Check-out *"
                  type="date"
                  value={quickForm.checkOutDate}
                  onChange={e => setQuickForm(prev => ({ ...prev, checkOutDate: e.target.value }))}
                />
              </div>
              <Input
                label="Tarifa por noche (S/)"
                type="number"
                step="0.01"
                value={quickForm.ratePerNight}
                onChange={e => setQuickForm(prev => ({ ...prev, ratePerNight: e.target.value }))}
              />
            </>
          )}

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              value={quickForm.notes}
              onChange={e => setQuickForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Notas adicionales..."
            />
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={closeQuickCheckIn} disabled={isSavingQuickCheckIn}>
              Cancelar
            </Button>
            <Button onClick={handleQuickCheckInSave} disabled={isSavingQuickCheckIn}>
              {isSavingQuickCheckIn ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>
              ) : (
                <><LogIn className="w-4 h-4 mr-2" /> Confirmar Check-in</>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
