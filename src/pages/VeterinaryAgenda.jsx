/**
 * Agenda de Citas Veterinarias
 * Vista de citas del día con acciones para completar y generar comprobantes
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  getAppointmentsByDate,
  getAppointmentsByDateRange,
  updateAppointment,
  cancelAppointment,
  completeAppointment,
  confirmAppointment,
  startAppointment,
  createAppointment,
  markNoShow,
  deleteAppointment,
  APPOINTMENT_STATUS,
  getDayStats,
} from '@/services/appointmentService'
import { getCustomers, createCustomer, getProducts } from '@/services/firestoreService'
import { ID_TYPES } from '@/utils/peruUtils'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { matchesSearchQuery } from '@/lib/utils'
import { normalizePets } from '@/utils/petUtils'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import {
  Calendar,
  Clock,
  PawPrint,
  Phone,
  User,
  ChevronLeft,
  ChevronRight,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  Ban,
  Loader2,
  RefreshCw,
  ShoppingCart,
  MessageCircle,
  MoreVertical,
  Trash2,
  Edit,
  Search,
} from 'lucide-react'

export default function VeterinaryAgenda() {
  const navigate = useNavigate()
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [appointments, setAppointments] = useState([])
  const [monthAppointments, setMonthAppointments] = useState([])
  const [stats, setStats] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)

  // Modal de cancelación
  const [cancelModal, setCancelModal] = useState(null)
  const [cancelReason, setCancelReason] = useState('')

  // Modal de acciones
  const [actionMenu, setActionMenu] = useState(null)

  // Vista: 'agenda' (calendario) | 'attention' (tablero "En atención", tipo Mesas)
  const [view, setView] = useState('agenda')
  const [inProgress, setInProgress] = useState([])
  // Walk-in (atender ahora, sin cita previa)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkInMode, setWalkInMode] = useState('existing') // 'existing' | 'new'
  const [customers, setCustomers] = useState([])
  const [walkInSearch, setWalkInSearch] = useState('')
  const [walkInCustomer, setWalkInCustomer] = useState(null)
  const [walkInPetIdx, setWalkInPetIdx] = useState(0) // índice en customer.pets; -1 = otra mascota
  const [newClient, setNewClient] = useState({ documentType: ID_TYPES.DNI, documentNumber: '', name: '', phone: '' })
  const [newPet, setNewPet] = useState({ name: '', species: '' })
  const [lookingUpDoc, setLookingUpDoc] = useState(false)
  const [walkInService, setWalkInService] = useState({ serviceId: '', serviceName: '', price: '' })
  // Servicios reales del negocio (Productos y Servicios) para el dropdown del walk-in
  const [serviceOptions, setServiceOptions] = useState([])
  const [savingWalkIn, setSavingWalkIn] = useState(false)

  // Cargar citas del mes para el calendario
  useEffect(() => {
    loadMonthAppointments()
  }, [user, currentMonth])

  const loadMonthAppointments = async () => {
    if (!user?.uid || isDemoMode) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1, 0, 0, 0)
      const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59)
      const appts = await getAppointmentsByDateRange(businessId, start, end)
      setMonthAppointments(appts)
    } catch (error) {
      console.error('Error al cargar citas del mes:', error)
      toast.error('Error al cargar las citas')
    } finally {
      setIsLoading(false)
    }
  }

  const loadAppointments = () => {
    loadMonthAppointments()
  }

  // Agrupar citas por día del mes
  const appointmentsByDay = {}
  monthAppointments.forEach(appt => {
    const d = appt.scheduledDate?.toDate ? appt.scheduledDate.toDate() : new Date(appt.scheduledDate)
    const key = d.getDate()
    if (!appointmentsByDay[key]) appointmentsByDay[key] = []
    appointmentsByDay[key].push(appt)
  })

  // Filtrar citas del día seleccionado desde los datos del mes (sin query extra)
  const dayAppointments = monthAppointments.filter(appt => {
    const d = appt.scheduledDate?.toDate ? appt.scheduledDate.toDate() : new Date(appt.scheduledDate)
    return d.getDate() === selectedDate.getDate() &&
      d.getMonth() === selectedDate.getMonth() &&
      d.getFullYear() === selectedDate.getFullYear()
  }).sort((a, b) => {
    const dA = a.scheduledDate?.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate)
    const dB = b.scheduledDate?.toDate ? b.scheduledDate.toDate() : new Date(b.scheduledDate)
    return dA - dB
  })

  // Stats del día calculadas localmente
  const dayStats = {
    total: dayAppointments.length,
    scheduled: dayAppointments.filter(a => a.status === 'scheduled').length,
    confirmed: dayAppointments.filter(a => a.status === 'confirmed').length,
    inProgress: dayAppointments.filter(a => a.status === 'in_progress').length,
    completed: dayAppointments.filter(a => a.status === 'completed').length,
  }

  // Generar días del calendario
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay() // 0=Dom
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days = []
    // Días vacíos al inicio
    for (let i = 0; i < firstDay; i++) days.push(null)
    // Días del mes
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return days
  }

  const changeMonth = (delta) => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(newMonth.getMonth() + delta)
    setCurrentMonth(newMonth)
  }

  const selectDay = (day) => {
    if (!day) return
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    setSelectedDate(newDate)
    // Sync month if needed
    if (newDate.getMonth() !== currentMonth.getMonth()) {
      setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1))
    }
  }

  const changeDate = (days) => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + days)
    setSelectedDate(newDate)
    if (newDate.getMonth() !== currentMonth.getMonth()) {
      setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1))
    }
  }

  const goToToday = () => {
    setSelectedDate(new Date())
  }

  const formatDate = (date) => {
    return date.toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return '--:--'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  }

  const getStatusBadge = (status) => {
    const config = APPOINTMENT_STATUS[status] || APPOINTMENT_STATUS.scheduled
    const colorMap = {
      blue: 'bg-blue-100 text-blue-700',
      green: 'bg-green-100 text-green-700',
      yellow: 'bg-yellow-100 text-yellow-700',
      gray: 'bg-gray-100 text-gray-700',
      red: 'bg-red-100 text-red-700',
      orange: 'bg-orange-100 text-orange-700',
    }
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[config.color]}`}>
        {config.label}
      </span>
    )
  }

  // Acciones
  const handleConfirm = async (appointment) => {
    setActionLoading(appointment.id)
    try {
      const businessId = getBusinessId()
      await confirmAppointment(businessId, appointment.id)
      toast.success('Cita confirmada')
      loadAppointments()
    } catch (error) {
      toast.error('Error al confirmar')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStart = async (appointment) => {
    setActionLoading(appointment.id)
    try {
      const businessId = getBusinessId()
      await startAppointment(businessId, appointment.id)
      toast.success('Atención iniciada')
      loadAppointments()
    } catch (error) {
      toast.error('Error al iniciar')
    } finally {
      setActionLoading(null)
    }
  }

  const handleComplete = async (appointment) => {
    // Navegar al POS con los datos precargados
    const posData = {
      fromAppointment: true,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      customerName: appointment.customerName,
      petName: appointment.petName,
      serviceName: appointment.serviceName,
      servicePrice: appointment.servicePrice || 0,
      services: appointment.services || [],
      phone: appointment.phone,
    }

    // Guardar en sessionStorage para que el POS lo recoja
    sessionStorage.setItem('appointmentData', JSON.stringify(posData))

    // Navegar al POS
    navigate('/app/pos')
  }

  // ===== Tablero "En atención" + walk-in (atender ahora) =====
  const loadInProgress = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const businessId = getBusinessId()
      const now = new Date()
      // Ventana de 2 días para cubrir atenciones abiertas (normalmente son del día).
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0)
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      const appts = await getAppointmentsByDateRange(businessId, start, end)
      setInProgress(appts.filter(a => a.status === 'in_progress'))
    } catch (e) {
      console.error('Error al cargar en atención:', e)
    }
  }

  useEffect(() => {
    if (view === 'attention') loadInProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, monthAppointments])

  const openWalkIn = async () => {
    setWalkInMode('existing')
    setWalkInCustomer(null)
    setWalkInSearch('')
    setWalkInPetIdx(0)
    setNewClient({ documentType: ID_TYPES.DNI, documentNumber: '', name: '', phone: '' })
    setNewPet({ name: '', species: '' })
    setWalkInService({ serviceId: '', serviceName: '', price: '' })
    setWalkInOpen(true)
    if (customers.length === 0) {
      try {
        const r = await getCustomers(getBusinessId())
        if (r.success) setCustomers(r.data || [])
      } catch (e) { /* sin clientes */ }
    }
    // Cargar los servicios reales del negocio (Productos y Servicios) para el dropdown
    try {
      const rp = await getProducts(getBusinessId())
      if (rp.success) {
        setServiceOptions((rp.data || [])
          .filter(p => p.active !== false)
          .sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      }
    } catch (e) { /* sin servicios */ }
  }

  const selectWalkInCustomer = (c) => {
    setWalkInCustomer(c)
    setWalkInSearch(c.name || '')
    setWalkInPetIdx(normalizePets(c).length > 0 ? 0 : -1)
    setNewPet({ name: '', species: '' })
  }

  // Buscar nombre por DNI/RUC al crear cliente nuevo
  const handleLookupNewDoc = async () => {
    const num = (newClient.documentNumber || '').trim()
    if (!num) { toast.error('Ingresa el número de documento'); return }
    if (newClient.documentType !== ID_TYPES.DNI && newClient.documentType !== ID_TYPES.RUC) {
      toast.info('La búsqueda automática solo está disponible para DNI y RUC')
      return
    }
    setLookingUpDoc(true)
    try {
      if (newClient.documentType === ID_TYPES.DNI) {
        if (num.length !== 8) { toast.error('El DNI debe tener 8 dígitos'); return }
        const r = await consultarDNI(num)
        if (r.success) { setNewClient(c => ({ ...c, name: r.data.nombreCompleto || c.name })); toast.success('Datos encontrados') }
        else toast.error(r.error || 'No se encontraron datos')
      } else {
        if (num.length !== 11) { toast.error('El RUC debe tener 11 dígitos'); return }
        const r = await consultarRUC(num)
        if (r.success) { setNewClient(c => ({ ...c, name: r.data.nombreComercial || r.data.razonSocial || c.name })); toast.success('Datos encontrados') }
        else toast.error(r.error || 'No se encontraron datos')
      }
    } catch (e) {
      toast.error('Error al consultar el documento')
    } finally {
      setLookingUpDoc(false)
    }
  }

  const handleCreateWalkIn = async () => {
    const businessId = getBusinessId()

    // Validación según modo
    if (walkInMode === 'new') {
      if (!newClient.documentNumber.trim() || !newClient.name.trim()) { toast.error('Completa documento y nombre del cliente'); return }
      if (!newPet.name.trim()) { toast.error('Indica el nombre de la mascota'); return }
    } else {
      if (!walkInCustomer) { toast.error('Selecciona un cliente'); return }
      const usingExistingPet = walkInPetIdx >= 0 && normalizePets(walkInCustomer)[walkInPetIdx]
      if (!usingExistingPet && !newPet.name.trim()) { toast.error('Indica la mascota'); return }
    }

    setSavingWalkIn(true)
    try {
      let customerId, customerName, phone, petName, petSpecies, petId = null

      if (walkInMode === 'new') {
        const res = await createCustomer(businessId, {
          documentType: newClient.documentType,
          documentNumber: newClient.documentNumber.trim(),
          name: newClient.name.trim(),
          phone: newClient.phone.trim(),
          pets: [{ name: newPet.name.trim(), species: newPet.species.trim() }],
          petName: newPet.name.trim(),
          petSpecies: newPet.species.trim(),
        })
        if (!res.success) { toast.error(res.error || 'No se pudo crear el cliente'); setSavingWalkIn(false); return }
        customerId = res.id
        customerName = newClient.name.trim()
        phone = newClient.phone.trim()
        petName = newPet.name.trim(); petSpecies = newPet.species.trim()
      } else {
        customerId = walkInCustomer.id
        customerName = walkInCustomer.name || ''
        phone = walkInCustomer.phone || ''
        const pets = normalizePets(walkInCustomer)
        if (walkInPetIdx >= 0 && pets[walkInPetIdx]) {
          const pet = pets[walkInPetIdx]
          petName = pet.name || ''; petSpecies = pet.species || ''; petId = pet.id || null
        } else {
          petName = newPet.name.trim(); petSpecies = newPet.species.trim()
        }
      }

      const price = parseFloat(walkInService.price) || 0
      const svcName = (walkInService.serviceName || '').trim()
      const now = new Date()
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const id = await createAppointment(businessId, {
        customerId, customerName, petName, petSpecies, petId, phone,
        serviceName: svcName,
        servicePrice: price,
        services: svcName ? [{ name: svcName, price }] : [],
        scheduledDate: dateStr,
        scheduledTime: timeStr,
        notes: 'Atención directa (walk-in)',
      })
      await startAppointment(businessId, id) // dejarla "en atención" de una
      toast.success('Atención iniciada')
      setWalkInOpen(false)
      loadAppointments()
      loadInProgress()
    } catch (e) {
      console.error('Error al crear walk-in:', e)
      toast.error('Error al iniciar la atención')
    } finally {
      setSavingWalkIn(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelModal) return

    setActionLoading(cancelModal.id)
    try {
      const businessId = getBusinessId()
      await cancelAppointment(businessId, cancelModal.id, cancelReason)
      toast.success('Cita cancelada')
      setCancelModal(null)
      setCancelReason('')
      loadAppointments()
    } catch (error) {
      toast.error('Error al cancelar')
    } finally {
      setActionLoading(null)
    }
  }

  const handleNoShow = async (appointment) => {
    setActionLoading(appointment.id)
    try {
      const businessId = getBusinessId()
      await markNoShow(businessId, appointment.id)
      toast.success('Marcado como no asistió')
      loadAppointments()
    } catch (error) {
      toast.error('Error al actualizar')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (appointment) => {
    if (!confirm('¿Eliminar esta cita?')) return

    setActionLoading(appointment.id)
    try {
      const businessId = getBusinessId()
      await deleteAppointment(businessId, appointment.id)
      toast.success('Cita eliminada')
      loadAppointments()
    } catch (error) {
      toast.error('Error al eliminar')
    } finally {
      setActionLoading(null)
    }
  }

  const handleWhatsApp = (appointment) => {
    if (!appointment.phone) {
      toast.error('No tiene teléfono registrado')
      return
    }

    const phone = appointment.phone.replace(/\D/g, '')
    const formattedPhone = phone.startsWith('51') ? phone : `51${phone}`

    const date = appointment.scheduledDate?.toDate ? appointment.scheduledDate.toDate() : new Date(appointment.scheduledDate)
    const timeStr = formatTime(appointment.scheduledDate)
    const dateStr = date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })

    const message = `Hola! Le recordamos su cita para ${appointment.petName}: ${appointment.serviceName} programada para el ${dateStr} a las ${timeStr}. ¿Confirma su asistencia?`

    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  const isToday = selectedDate.toDateString() === new Date().toDateString()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando agenda...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Agenda de Citas</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1 capitalize">{formatDate(selectedDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>Hoy</Button>
          <Button variant="outline" size="sm" onClick={loadAppointments}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Pestañas: Agenda / En atención (tipo Mesas) */}
      <div className="flex gap-1 border-b border-gray-200">
        {[{ k: 'agenda', label: 'Agenda' }, { k: 'attention', label: `En atención${inProgress.length ? ` (${inProgress.length})` : ''}` }].map(t => (
          <button
            key={t.k}
            onClick={() => setView(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${view === t.k ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tablero "En atención": mascotas siendo atendidas ahora */}
      {view === 'attention' && (
        <div>
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={openWalkIn}>
              <Plus className="w-4 h-4 mr-1" /> Atender ahora
            </Button>
          </div>
          {inProgress.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <PawPrint className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>No hay mascotas en atención ahora.</p>
                <p className="text-sm mt-1">Inicia una atención desde una cita o usa &quot;Atender ahora&quot;.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {inProgress.map(appt => (
                <Card key={appt.id} className="border-l-4 border-yellow-400">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-gray-900 truncate">{appt.serviceName}</span>
                      <Badge variant="warning" className="ml-auto flex-shrink-0">En atención</Badge>
                    </div>
                    <p className="text-sm text-gray-800 flex items-center gap-1">
                      <PawPrint className="w-4 h-4 text-gray-400 flex-shrink-0" /> <strong className="truncate">{appt.petName || 'Mascota'}</strong>
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <User className="w-4 h-4 text-gray-400 flex-shrink-0" /> <span className="truncate">{appt.customerName}</span>
                    </p>
                    {appt.servicePrice > 0 && (
                      <p className="text-sm font-semibold text-primary-600 mt-1">S/ {appt.servicePrice.toFixed(2)}</p>
                    )}
                    <Button size="sm" className="w-full mt-3 gap-1" onClick={() => handleComplete(appt)}>
                      <ShoppingCart className="w-4 h-4" /> Finalizar y Cobrar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'agenda' && (
      <>
      {/* Calendario mensual */}
      <Card>
        <CardContent className="p-4">
          {/* Navegación del mes */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 capitalize">
              {currentMonth.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })}
            </h2>
            <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
            ))}
          </div>

          {/* Días del mes */}
          <div className="grid grid-cols-7 gap-1">
            {getCalendarDays().map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />
              const isSelected = day === selectedDate.getDate() && currentMonth.getMonth() === selectedDate.getMonth() && currentMonth.getFullYear() === selectedDate.getFullYear()
              const isTodayDay = day === new Date().getDate() && currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear()
              const dayAppts = appointmentsByDay[day] || []
              const hasPending = dayAppts.some(a => a.status === 'scheduled' || a.status === 'confirmed')
              const hasCompleted = dayAppts.some(a => a.status === 'completed')

              return (
                <button
                  key={day}
                  onClick={() => selectDay(day)}
                  className={`relative p-1.5 sm:p-2 rounded-lg text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary-600 text-white font-bold'
                      : isTodayDay
                        ? 'bg-primary-50 text-primary-700 font-semibold ring-1 ring-primary-300'
                        : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span>{day}</span>
                  {dayAppts.length > 0 && (
                    <div className="flex items-center justify-center gap-0.5 mt-0.5">
                      {hasPending && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-yellow-300' : 'bg-blue-500'}`} />}
                      {hasCompleted && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-green-300' : 'bg-green-500'}`} />}
                      <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{dayAppts.length}</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stats del día seleccionado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border p-3">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{dayStats.total || 0}</p>
        </div>
        <div className="bg-blue-50 rounded-lg border border-blue-100 p-3">
          <p className="text-xs text-blue-600">Pendientes</p>
          <p className="text-2xl font-bold text-blue-700">{(dayStats.scheduled || 0) + (dayStats.confirmed || 0)}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg border border-yellow-100 p-3">
          <p className="text-xs text-yellow-600">En Atención</p>
          <p className="text-2xl font-bold text-yellow-700">{dayStats.inProgress || 0}</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-100 p-3">
          <p className="text-xs text-green-600">Completadas</p>
          <p className="text-2xl font-bold text-green-700">{dayStats.completed || 0}</p>
        </div>
      </div>

      {/* Lista de citas */}
      {dayAppointments.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay citas para este día
            </h3>
            <p className="text-gray-600 mb-4">
              Las citas agendadas desde la historia clínica de los pacientes aparecerán aquí.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dayAppointments.map((appointment) => (
            <Card key={appointment.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row">
                  {/* Hora */}
                  <div className="bg-primary-50 p-4 sm:w-24 flex-shrink-0 flex sm:flex-col items-center justify-center gap-2">
                    <Clock className="w-4 h-4 text-primary-600" />
                    <span className="text-lg font-bold text-primary-700">
                      {formatTime(appointment.scheduledDate)}
                    </span>
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Servicio y estado */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-semibold text-gray-900">{appointment.serviceName}</span>
                          {getStatusBadge(appointment.status)}
                        </div>

                        {/* Mascota y dueño */}
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                          <span className="inline-flex items-center gap-1">
                            <PawPrint className="w-4 h-4" />
                            <strong>{appointment.petName}</strong>
                            {appointment.petSpecies && ` (${appointment.petSpecies})`}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {appointment.customerName}
                          </span>
                        </div>

                        {/* Teléfono y precio */}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          {appointment.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {appointment.phone}
                            </span>
                          )}
                          {appointment.servicePrice > 0 && (
                            <span className="font-medium text-green-600">
                              S/ {appointment.servicePrice.toFixed(2)}
                            </span>
                          )}
                        </div>

                        {/* Notas */}
                        {appointment.notes && (
                          <p className="text-xs text-gray-500 mt-2 italic">"{appointment.notes}"</p>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {actionLoading === appointment.id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        ) : (
                          <>
                            {/* WhatsApp */}
                            {appointment.phone && (
                              <button
                                onClick={() => handleWhatsApp(appointment)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Enviar WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            )}

                            {/* Acciones según estado */}
                            {appointment.status === 'scheduled' && (
                              <>
                                <button
                                  onClick={() => handleConfirm(appointment)}
                                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Confirmar"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setCancelModal(appointment)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Cancelar"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}

                            {appointment.status === 'confirmed' && (
                              <>
                                <button
                                  onClick={() => handleStart(appointment)}
                                  className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                  title="Iniciar atención"
                                >
                                  <Play className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleNoShow(appointment)}
                                  className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                  title="No asistió"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              </>
                            )}

                            {appointment.status === 'in_progress' && (
                              <Button
                                size="sm"
                                onClick={() => handleComplete(appointment)}
                                className="gap-1"
                              >
                                <ShoppingCart className="w-4 h-4" />
                                Finalizar y Cobrar
                              </Button>
                            )}

                            {/* Eliminar (solo para programadas/canceladas) */}
                            {['scheduled', 'cancelled', 'no_show'].includes(appointment.status) && (
                              <button
                                onClick={() => handleDelete(appointment)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </>
      )}

      {/* Modal de cancelación */}
      <Modal
        isOpen={!!cancelModal}
        onClose={() => { setCancelModal(null); setCancelReason('') }}
        title="Cancelar Cita"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            ¿Cancelar la cita de <strong>{cancelModal?.petName}</strong> para{' '}
            <strong>{cancelModal?.serviceName}</strong>?
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo de cancelación (opcional)
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="Ej: Reagendada para otro día..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setCancelModal(null); setCancelReason('') }}>
              Volver
            </Button>
            <Button variant="danger" onClick={handleCancel} disabled={actionLoading === cancelModal?.id}>
              {actionLoading === cancelModal?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Cancelar Cita'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal "Atender ahora" (walk-in, sin cita previa) */}
      <Modal isOpen={walkInOpen} onClose={() => !savingWalkIn && setWalkInOpen(false)} title="Atender ahora" size="lg">
        <div className="space-y-4">
          {/* Cliente existente / nuevo */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[{ k: 'existing', label: 'Cliente existente' }, { k: 'new', label: 'Cliente nuevo' }].map(t => (
              <button
                key={t.k}
                type="button"
                onClick={() => setWalkInMode(t.k)}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${walkInMode === t.k ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ===== CLIENTE EXISTENTE ===== */}
          {walkInMode === 'existing' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                {walkInCustomer ? (
                  <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{walkInCustomer.name}</p>
                      <p className="text-xs text-gray-500 truncate">{[walkInCustomer.documentNumber, walkInCustomer.phone].filter(Boolean).join(' · ') || 'Sin datos'}</p>
                    </div>
                    <button type="button" onClick={() => { setWalkInCustomer(null); setWalkInSearch('') }} className="text-xs text-primary-600 hover:underline flex-shrink-0 ml-2">Cambiar</button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={walkInSearch}
                        onChange={(e) => setWalkInSearch(e.target.value)}
                        placeholder="Buscar por nombre, documento o teléfono..."
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    {walkInSearch.trim().length > 0 && (() => {
                      // Busca por nombre, razón social, documento, teléfono Y nombre de mascota
                      // (insensible a tildes/mayúsculas, multi-palabra).
                      const matches = customers.filter(c =>
                        matchesSearchQuery(walkInSearch, c.name, c.businessName, c.documentNumber, c.phone, ...normalizePets(c).map(p => p.name))
                      ).slice(0, 12)
                      return (
                        <div className="mt-1 max-h-44 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                          {matches.map(c => {
                            const petNames = normalizePets(c).map(p => p.name).filter(Boolean).join(', ')
                            return (
                              <button key={c.id} type="button" onClick={() => selectWalkInCustomer(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                                <span className="font-medium text-gray-900">{c.name || c.businessName}</span>
                                {(c.documentNumber || c.phone) && <span className="text-gray-400 ml-2">{[c.documentNumber, c.phone].filter(Boolean).join(' · ')}</span>}
                                {petNames && <span className="block text-xs text-gray-400">Mascotas: {petNames}</span>}
                              </button>
                            )
                          })}
                          {matches.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Sin coincidencias — usa &quot;Cliente nuevo&quot;</p>}
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>

              {/* Mascota: seleccionar de las del cliente */}
              {walkInCustomer && (() => {
                const pets = normalizePets(walkInCustomer)
                return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mascota</label>
                  {pets.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {pets.map((p, idx) => (
                        <button
                          key={p.id || idx}
                          type="button"
                          onClick={() => setWalkInPetIdx(idx)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${walkInPetIdx === idx ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <PawPrint className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate"><span className="font-medium text-gray-900">{p.name}</span>{p.species ? <span className="text-gray-400"> · {p.species}</span> : null}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setWalkInPetIdx(-1)}
                        className={`px-3 py-2 rounded-lg border text-sm transition-colors ${walkInPetIdx === -1 ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        + Otra mascota
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mb-2">Este cliente no tiene mascotas registradas. Agrega una:</p>
                  )}
                  {(walkInPetIdx === -1 || pets.length === 0) && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input type="text" value={newPet.name} onChange={(e) => setNewPet(p => ({ ...p, name: e.target.value }))} placeholder="Nombre de la mascota" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      <input type="text" value={newPet.species} onChange={(e) => setNewPet(p => ({ ...p, species: e.target.value }))} placeholder="Especie (perro, gato...)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                  )}
                </div>
                )
              })()}
            </>
          )}

          {/* ===== CLIENTE NUEVO ===== */}
          {walkInMode === 'new' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo doc.</label>
                  <select value={newClient.documentType} onChange={(e) => setNewClient(c => ({ ...c, documentType: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value={ID_TYPES.DNI}>DNI</option>
                    <option value={ID_TYPES.RUC}>RUC</option>
                    <option value={ID_TYPES.CE}>CE</option>
                    <option value={ID_TYPES.PASSPORT}>Pasaporte</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número de documento</label>
                  <div className="flex gap-2">
                    <input type="text" value={newClient.documentNumber} onChange={(e) => setNewClient(c => ({ ...c, documentNumber: e.target.value }))} placeholder="N° documento" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <Button type="button" variant="outline" size="sm" onClick={handleLookupNewDoc} disabled={lookingUpDoc} title="Buscar datos por DNI/RUC">
                      {lookingUpDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del cliente</label>
                <input type="text" value={newClient.name} onChange={(e) => setNewClient(c => ({ ...c, name: e.target.value }))} placeholder="Nombre completo / razón social" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input type="text" value={newClient.phone} onChange={(e) => setNewClient(c => ({ ...c, phone: e.target.value }))} placeholder="Teléfono" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mascota</label>
                  <input type="text" value={newPet.name} onChange={(e) => setNewPet(p => ({ ...p, name: e.target.value }))} placeholder="Nombre de la mascota" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Especie</label>
                  <input type="text" value={newPet.species} onChange={(e) => setNewPet(p => ({ ...p, species: e.target.value }))} placeholder="Perro, gato..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
            </>
          )}

          {/* ===== SERVICIO + PRECIO ===== */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Servicio</label>
              <select
                value={walkInService.serviceId}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === 'custom') {
                    setWalkInService(s => ({ ...s, serviceId: 'custom', serviceName: '' }))
                  } else if (!val) {
                    setWalkInService(s => ({ ...s, serviceId: '', serviceName: '', price: '' }))
                  } else {
                    const prod = serviceOptions.find(p => p.id === val)
                    setWalkInService(s => ({
                      ...s,
                      serviceId: val,
                      serviceName: prod?.name || '',
                      price: prod?.price != null ? String(prod.price) : s.price,
                    }))
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Selecciona un servicio</option>
                {serviceOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="custom">Otro (personalizado)</option>
              </select>
              {serviceOptions.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">No tienes servicios creados. Créalos en Productos y Servicios o usa "Otro".</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio (S/)</label>
              <input type="number" min="0" step="0.01" value={walkInService.price} onChange={(e) => setWalkInService(s => ({ ...s, price: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          {walkInService.serviceId === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del servicio</label>
              <input
                type="text"
                value={walkInService.serviceName}
                onChange={(e) => setWalkInService(s => ({ ...s, serviceName: e.target.value }))}
                placeholder="Ej. Consulta general"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setWalkInOpen(false)} disabled={savingWalkIn}>Cancelar</Button>
            <Button onClick={handleCreateWalkIn} disabled={savingWalkIn}>
              {savingWalkIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4 mr-1" /> Iniciar atención</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
