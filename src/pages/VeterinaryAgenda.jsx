/**
 * Agenda de Citas Veterinarias
 * Vista de citas del día con acciones para completar y generar comprobantes
 */

import { useState, useEffect } from 'react'
import { esVendible } from '@/utils/productSale'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  getAppointmentsByDate,
  getAppointmentsByDateRange,
  subscribeAppointmentsByDateRange,
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
import DaySlotPicker from '@/components/appointments/DaySlotPicker'
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
  ShoppingCart,
  MessageCircle,
  MoreVertical,
  Trash2,
  Edit,
  Search,
  MapPin,
  ClipboardList,
  ClipboardCheck,
  Package,
} from 'lucide-react'
import { filtrarPorSucursal, nombreDeSucursal, sucursalParaGuardar } from '@/utils/branchScope'
import { tieneFichaDeAtencion } from '@/utils/businessModes'
import { registrarAtencionDesdeCita } from '@/services/attentionService'
import { getPackages, usarSesion, estaActivo, sesionesDisponibles } from '@/services/packageService'
import { mensajeDeCita, linkWhatsApp } from '@/utils/mensajeCita'
import GuideLink from '@/components/guide/GuideLink'
import { getSellers } from '@/services/sellerService'

export default function VeterinaryAgenda() {
  const navigate = useNavigate()
  const { user, getBusinessId, isDemoMode, businessMode, businessSettings, branchScope, branches } = useAppContext()

  /**
   * La agenda nació para veterinarias, pero cualquier negocio que atienda con
   * cita la necesita: consultorios, podología, estética, talleres. En los demás
   * rubros el mismo tablero funciona igual, solo que sin mascota — ahí el que
   * viene a la cita ES el cliente.
   *
   * Todo lo de mascotas queda detrás de esta bandera en vez de duplicar la
   * pantalla: una segunda copia se desincroniza en el primer arreglo que se
   * haga en una sola de las dos.
   */
  const esVeterinaria = businessMode === 'veterinary'
  const toast = useToast()

  /**
   * Registrar la atención en la ficha del paciente al terminar la cita. Solo
   * donde la ficha existe (Clínica, o General con la ficha encendida); en
   * veterinaria el historial va por la historia clínica de la mascota.
   */
  const conFicha = tieneFichaDeAtencion(businessMode, businessSettings)
  const [atencionDe, setAtencionDe] = useState(null) // la cita cuya atención se registra
  const [atencionForm, setAtencionForm] = useState({
    service: '', treatment: '', recommendations: '', specialist: '', nextControlDate: '', nextControlTime: '',
  })
  const [savingAtencion, setSavingAtencion] = useState(false)

  // Paquetes de sesiones ACTIVOS de los pacientes en atención, por cliente.
  // La tarjeta muestra "Usar sesión del paquete" solo si le quedan sesiones:
  // así la cita se completa sin volver a cobrar lo que ya se pagó.
  const [paquetesPorCliente, setPaquetesPorCliente] = useState({})
  const [usoDe, setUsoDe] = useState(null) // cita que va a consumir una sesión
  const [usandoSesion, setUsandoSesion] = useState(null)

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
  // Walk-in (atender ahora, sin cita previa) y agendar cita a futuro.
  // El MISMO modal sirve para los dos: cliente + mascota + servicios son
  // idénticos; lo único que cambia es que agendar pide fecha/hora y NO
  // arranca la atención.
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkInIntent, setWalkInIntent] = useState('now') // 'now' | 'schedule'
  const [walkInMode, setWalkInMode] = useState('existing') // 'existing' | 'new'
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('09:00')
  // A qué local va la cita. Con el selector del header en "Todas" no hay una
  // respuesta obvia, así que el modal pregunta en vez de adivinar: agendar sin
  // querer en la sede equivocada es justo lo que hay que evitar.
  const [schedBranch, setSchedBranch] = useState('')
  // Citas ya tomadas del día elegido, para ver la disponibilidad al agendar
  const [schedDayAppts, setSchedDayAppts] = useState([])
  const [customers, setCustomers] = useState([])
  const [walkInSearch, setWalkInSearch] = useState('')
  const [walkInCustomer, setWalkInCustomer] = useState(null)
  const [walkInPetIdx, setWalkInPetIdx] = useState(0) // índice en customer.pets; -1 = otra mascota
  const [newClient, setNewClient] = useState({ documentType: ID_TYPES.DNI, documentNumber: '', name: '', phone: '' })
  const [newPet, setNewPet] = useState({ name: '', species: '' })
  const [lookingUpDoc, setLookingUpDoc] = useState(false)
  // Servicios del walk-in: array (una mascota puede llevar baño + corte + movilidad, etc.)
  const [walkInServices, setWalkInServices] = useState([{ serviceId: '', serviceName: '', price: '' }])
  // Servicios reales del negocio (Productos y Servicios) para el buscador del walk-in
  const [serviceOptions, setServiceOptions] = useState([])
  // Qué fila de servicio tiene el buscador abierto (índice) o null
  const [activeSvcIdx, setActiveSvcIdx] = useState(null)
  const [savingWalkIn, setSavingWalkIn] = useState(false)
  /**
   * Quién atiende la cita.
   *
   * La lista sale de VENDEDORES, que es donde los negocios ya tienen cargado a
   * su personal: Podología Vital tenía ahí a sus podólogas por nombre antes de
   * pedir esto. Crear una colección aparte les habría hecho cargar dos veces a
   * la misma gente.
   */
  const [specialists, setSpecialists] = useState([])
  const [schedSpecialist, setSchedSpecialist] = useState('')

  // Citas del mes EN TIEMPO REAL. La agenda la miran dos personas a la vez
  // (quien agenda por telefono y quien atiende en el mostrador): con una
  // suscripcion, lo que una agenda aparece en la pantalla de la otra sin tocar
  // nada. Antes habia un boton "actualizar" que era confesar que la pantalla no
  // se enteraba sola.
  //
  // La suscripcion se rehace al cambiar de mes y se corta al desmontar: sin el
  // cleanup quedarian escuchas colgadas acumulando lecturas.
  useEffect(() => {
    if (!user?.uid || isDemoMode) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const businessId = getBusinessId()
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1, 0, 0, 0)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59)
    // El filtro por sucursal se hace acá, sobre el único origen de datos de la
    // pantalla: el calendario, el día, las estadísticas y los huecos libres
    // salen todos de `monthAppointments`, así que ninguno puede quedarse con
    // las citas del otro local. Va en memoria y no en la consulta porque
    // Firestore no indexa los documentos sin `branchId` y el histórico entero
    // se quedaría afuera.
    const unsubscribe = subscribeAppointmentsByDateRange(
      businessId, start, end,
      (appts) => { setMonthAppointments(filtrarPorSucursal(appts, branchScope)); setIsLoading(false) },
      () => { toast.error('Error al cargar las citas'); setIsLoading(false) },
    )
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, currentMonth, isDemoMode, branchScope])

  // Las acciones (agendar, cancelar, completar) siguen llamando a esto por
  // costumbre; ya no hace falta porque el snapshot se entera solo. Se deja
  // como no-op para no tocar seis llamadas que no rompen nada.
  const loadAppointments = () => {}

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

  /**
   * Chip con el local de la cita. Solo aparece con el selector del header en
   * "Todas las sucursales": ahí conviven citas de los dos lados y sin esto no
   * hay forma de saber cuál es de cuál. Viendo un local solo sobra.
   */
  const varios = (branches || []).length > 0
  const chipDeLocal = (appt) => {
    if (!varios || (branchScope || 'all') !== 'all') return null
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        <MapPin className="w-3 h-3" /> {nombreDeSucursal(appt.branchId, branches)}
      </span>
    )
  }

  /**
   * Quién atiende, en la fila de la agenda.
   *
   * Sin esto el dato quedaba guardado pero invisible: quien agenda no puede
   * comprobar que asigno bien, y quien mira la agenda del dia —que es el uso
   * real— no sabe a quien le toca.
   */
  const chipDeEspecialista = (appt) => {
    if (!appt?.specialistName) return null
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
        <User className="w-3 h-3" /> {appt.specialistName}
      </span>
    )
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

  const abrirRegistroDeAtencion = (appointment) => {
    setAtencionForm({
      service: appointment.serviceName || '',
      treatment: '',
      recommendations: '',
      // La reserva pública guarda staffName; la agenda, specialistName.
      specialist: appointment.specialistName || appointment.staffName || '',
      nextControlDate: '',
      nextControlTime: '',
    })
    setAtencionDe(appointment)
  }

  const guardarAtencion = async ({ cobrar = false } = {}) => {
    if (!atencionDe) return
    setSavingAtencion(true)
    try {
      const { controlesAgendados } = await registrarAtencionDesdeCita(getBusinessId(), atencionDe, atencionForm, branchScope)
      toast.success(controlesAgendados > 0
        ? 'Atención registrada en la ficha y próximo control agendado'
        : 'Atención registrada en la ficha del paciente')
      const cita = atencionDe
      setAtencionDe(null)
      loadInProgress()
      if (cobrar) handleComplete(cita)
    } catch (e) {
      console.error('Error al registrar la atención:', e)
      toast.error(e?.message || 'No se pudo registrar la atención')
    } finally {
      setSavingAtencion(false)
    }
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

  // Los paquetes con sesiones de cada paciente en atención (una lectura por
  // paciente; son los de la tarde, no el padrón entero).
  const cargarPaquetesDe = async (appts) => {
    const ids = [...new Set(appts.map(a => a.customerId).filter(Boolean))]
    if (ids.length === 0) { setPaquetesPorCliente({}); return }
    const businessId = getBusinessId()
    const entradas = await Promise.all(ids.map(async (id) => {
      try {
        return [id, (await getPackages(businessId, id)).filter(estaActivo)]
      } catch (e) {
        return [id, []]
      }
    }))
    setPaquetesPorCliente(Object.fromEntries(entradas))
  }

  // Descontar una sesión y dar la cita por completada, sin comprobante.
  const confirmarUsoDeSesion = async (paquete) => {
    if (!usoDe) return
    setUsandoSesion(paquete.id)
    try {
      const businessId = getBusinessId()
      const r = await usarSesion(businessId, usoDe.customerId, paquete.id, { appointmentId: usoDe.id })
      await completeAppointment(businessId, usoDe.id, null)
      await updateAppointment(businessId, usoDe.id, { packageId: paquete.id, packageName: paquete.productName, paidWithPackage: true })
      toast.success(r.yaUsada
        ? 'Esta cita ya había descontado su sesión. Cita completada.'
        : `Sesión descontada: quedan ${sesionesDisponibles(r)} de ${r.sessionsTotal}. Cita completada.`)
      setUsoDe(null)
      loadInProgress()
    } catch (e) {
      console.error('Error al usar la sesión:', e)
      toast.error(e?.message || 'No se pudo usar la sesión')
    } finally {
      setUsandoSesion(null)
    }
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
      const enAtencion = filtrarPorSucursal(appts, branchScope).filter(a => a.status === 'in_progress')
      setInProgress(enAtencion)
      cargarPaquetesDe(enAtencion)
    } catch (e) {
      console.error('Error al cargar en atención:', e)
    }
  }

  useEffect(() => {
    if (view === 'attention') loadInProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, monthAppointments, branchScope])

  const openWalkIn = async (intent = 'now', { time } = {}) => {
    setWalkInIntent(intent)
    setWalkInMode('existing')
    setWalkInCustomer(null)
    setWalkInSearch('')
    setWalkInPetIdx(0)
    setNewClient({ documentType: ID_TYPES.DNI, documentNumber: '', name: '', phone: '' })
    setNewPet({ name: '', species: '' })
    setWalkInServices([{ serviceId: '', serviceName: '', price: '' }])
    // Que no se arrastre el especialista de la cita anterior.
    setSchedSpecialist('')
    setSchedBranch(sucursalParaGuardar(branchScope))
    if (intent === 'schedule') {
      // Arranca con el día que está seleccionado en el calendario: el flujo
      // natural es "clic en el día → clic en la hora libre".
      const d = selectedDate
      setSchedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      setSchedTime(time || '09:00')
    }
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
        // Filtraba por `p.active`, un campo inexistente en el producto.
        setServiceOptions((rp.data || [])
          .filter(esVendible)
          .sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      }
    } catch (e) { /* sin servicios */ }
    // Quien atiende: se toma de Vendedores, donde el negocio ya tiene a su gente.
    if (specialists.length === 0) {
      try {
        const rs = await getSellers(getBusinessId())
        if (rs.success) {
          setSpecialists((rs.data || [])
            .filter(v => v.status !== 'inactive')
            .sort((a, b) => (a.name || '').localeCompare(b.name || '')))
        }
      } catch (e) { /* sin vendedores cargados */ }
    }
  }

  // Disponibilidad: al agendar, cargar las citas ya tomadas del día elegido
  // para verlas dentro del modal antes de fijar la hora.
  useEffect(() => {
    if (!walkInOpen || walkInIntent !== 'schedule' || !schedDate) { setSchedDayAppts([]); return }
    let alive = true
    ;(async () => {
      try {
        const [y, m, d] = schedDate.split('-').map(Number)
        const appts = await getAppointmentsByDate(getBusinessId(), new Date(y, m - 1, d))
        if (alive) {
          setSchedDayAppts(
            // Contra la sucursal ELEGIDA en el modal, no contra la del header:
            // una hora ocupada en un local no ocupa nada en el otro, que era
            // justamente lo que impedía dar la misma hora en las dos sedes.
            filtrarPorSucursal(appts, schedBranch || 'main')
              .filter(a => a.status !== 'cancelled' && a.status !== 'no_show')
              .sort((a, b) => {
                const dA = a.scheduledDate?.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate)
                const dB = b.scheduledDate?.toDate ? b.scheduledDate.toDate() : new Date(b.scheduledDate)
                return dA - dB
              })
          )
        }
      } catch (e) {
        if (alive) setSchedDayAppts([])
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkInOpen, walkInIntent, schedDate, schedBranch])

  const selectWalkInCustomer = (c) => {
    setWalkInCustomer(c)
    setWalkInSearch(c.name || '')
    setWalkInPetIdx(normalizePets(c).length > 0 ? 0 : -1)
    setNewPet({ name: '', species: '' })
  }

  // El buscador de cliente también resuelve documentos NO registrados: si lo
  // que se tipeó es un DNI (8 dígitos) o RUC (11) sin coincidencias, un clic
  // lo consulta en RENIEC/SUNAT y deja el formulario de cliente nuevo con
  // documento y nombre ya puestos — solo falta teléfono y mascota.
  const buscarDocEnPadron = async () => {
    const num = walkInSearch.trim()
    const esDni = /^\d{8}$/.test(num)
    const esRuc = /^\d{11}$/.test(num)
    if (!esDni && !esRuc) return
    setLookingUpDoc(true)
    try {
      const r = esDni ? await consultarDNI(num) : await consultarRUC(num)
      const nombre = esDni
        ? r?.data?.nombreCompleto
        : (r?.data?.nombreComercial || r?.data?.razonSocial)
      setWalkInMode('new')
      setNewClient({
        documentType: esDni ? ID_TYPES.DNI : ID_TYPES.RUC,
        documentNumber: num,
        name: r?.success ? (nombre || '') : '',
        phone: '',
      })
      if (r?.success && nombre) toast.success(esVeterinaria ? 'Datos encontrados. Completa teléfono y mascota.' : 'Datos encontrados. Completa el teléfono.')
      else toast.info('No figura en el padrón. Completa los datos a mano.')
    } catch (e) {
      setWalkInMode('new')
      setNewClient({ documentType: esDni ? ID_TYPES.DNI : ID_TYPES.RUC, documentNumber: num, name: '', phone: '' })
      toast.error('No se pudo consultar el documento. Completa los datos a mano.')
    } finally {
      setLookingUpDoc(false)
    }
  }

  // "No está registrado → crearlo" sin re-tipear: lo buscado pasa al
  // formulario de cliente nuevo como documento (si es número) o como nombre.
  const irACrearNuevo = () => {
    const q = walkInSearch.trim()
    const esNum = /^\d+$/.test(q)
    setWalkInMode('new')
    setNewClient(c => ({
      ...c,
      documentType: /^\d{11}$/.test(q) ? ID_TYPES.RUC : c.documentType,
      documentNumber: esNum ? q : '',
      name: esNum ? '' : q,
    }))
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

  // ----- Helpers de servicios del walk-in (multi) -----
  const updateWalkInService = (idx, patch) =>
    setWalkInServices(list => list.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  const addWalkInService = () =>
    setWalkInServices(list => [...list, { serviceId: '', serviceName: '', price: '' }])
  const removeWalkInService = (idx) =>
    setWalkInServices(list => (list.length > 1 ? list.filter((_, i) => i !== idx) : list))
  const walkInTotal = walkInServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0)

  const handleCreateWalkIn = async () => {
    const businessId = getBusinessId()
    const isSchedule = walkInIntent === 'schedule'

    // Validación según modo
    if (walkInMode === 'new') {
      if (!newClient.documentNumber.trim() || !newClient.name.trim()) { toast.error('Completa documento y nombre del cliente'); return }
      if (esVeterinaria && !newPet.name.trim()) { toast.error('Indica el nombre de la mascota'); return }
    } else {
      if (!walkInCustomer) { toast.error('Selecciona un cliente'); return }
      const usingExistingPet = walkInPetIdx >= 0 && normalizePets(walkInCustomer)[walkInPetIdx]
      if (esVeterinaria && !usingExistingPet && !newPet.name.trim()) { toast.error('Indica la mascota'); return }
    }
    if (isSchedule) {
      if (!schedDate) { toast.error('Elige la fecha de la cita'); return }
      if (!schedTime) { toast.error('Elige la hora de la cita'); return }
      if (!walkInServices.some(s => (s.serviceName || '').trim())) { toast.error('Indica al menos un servicio'); return }
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
          // Fuera de veterinaria no hay mascota: no se inventa una ficha vacia
          // que despues aparece como "mascota sin nombre" en el cliente.
          ...(esVeterinaria && {
            pets: [{ name: newPet.name.trim(), species: newPet.species.trim() }],
            petName: newPet.name.trim(),
            petSpecies: newPet.species.trim(),
          }),
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

      // Servicios: array (baño + corte + movilidad...). Se toman los que tengan
      // nombre; el precio puede ser 0. serviceName/servicePrice quedan como
      // resumen (nombres unidos con " + " y suma) para las tarjetas y el POS,
      // que ya consume el array services[] (un ítem de carrito por servicio).
      const services = walkInServices
        .map(s => ({
          name: (s.serviceName || '').trim(),
          price: parseFloat(s.price) || 0,
          ...(Number(s.duration) > 0 ? { duration: Number(s.duration) } : {}),
        }))
        .filter(s => s.name)
      const price = services.reduce((sum, s) => sum + s.price, 0)
      // Cuánto ocupa la cita en el panel del día: la suma de lo que dura cada
      // servicio (ficha del producto). Sin duraciones, un solo turno.
      const duration = services.reduce((sum, s) => sum + (s.duration || 0), 0) || null
      const svcName = services.map(s => s.name).join(' + ')
      const now = new Date()
      const dateStr = isSchedule
        ? schedDate
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const timeStr = isSchedule
        ? schedTime
        : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const especialista = specialists.find(e => e.id === schedSpecialist)
      const id = await createAppointment(businessId, {
        branchId: schedBranch,
        // El NOMBRE se guarda junto al id: si mañana borran al vendedor, la cita
        // vieja tiene que seguir diciendo quien atendio.
        ...(especialista && { specialistId: especialista.id, specialistName: especialista.name || '' }),
        customerId, customerName, petName, petSpecies, petId, phone,
        serviceName: svcName,
        servicePrice: price,
        services,
        ...(duration ? { duration } : {}),
        scheduledDate: dateStr,
        scheduledTime: timeStr,
        notes: isSchedule ? '' : 'Atención directa (walk-in)',
      })
      if (isSchedule) {
        // La cita queda "Programada"; la atención arranca el día que llegue.
        const [y, m, d] = schedDate.split('-').map(Number)
        toast.success(`Cita agendada para el ${new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${schedTime}`)
        // Llevar el calendario al día agendado para que se vea de inmediato
        setSelectedDate(new Date(y, m - 1, d))
        if (m - 1 !== currentMonth.getMonth() || y !== currentMonth.getFullYear()) {
          setCurrentMonth(new Date(y, m - 1, 1))
        }
      } else {
        await startAppointment(businessId, id) // dejarla "en atención" de una
        toast.success('Atención iniciada')
      }
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

    // El texto sale de un solo lugar (mensajeCita.js): el mismo que usa
    // Recordatorios > Citas, con la plantilla que el negocio edita en
    // Configuración > Punto de venta.
    const message = mensajeDeCita(appointment, {
      plantilla: businessSettings?.appointmentReminderTemplate,
      nombreNegocio: businessSettings?.businessName || '',
    })
    window.open(linkWhatsApp(appointment.phone, message), '_blank')
  }

  const isToday = selectedDate.toDateString() === new Date().toDateString()

  // Acciones compactas de una cita, para las tarjetas del panel de horas.
  // Misma lógica por estado que tenía la antigua lista de abajo.
  const renderApptActions = (appointment) => {
    if (actionLoading === appointment.id) {
      return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
    }
    return (
      <>
        {appointment.phone && (
          <button
            onClick={() => handleWhatsApp(appointment)}
            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="Enviar WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        )}
        {appointment.status === 'scheduled' && (
          <>
            <button
              onClick={() => handleConfirm(appointment)}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Confirmar"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCancelModal(appointment)}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
              className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
              title="Iniciar atención"
            >
              <Play className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleNoShow(appointment)}
              className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
              title="No asistió"
            >
              <Ban className="w-4 h-4" />
            </button>
          </>
        )}
        {conFicha && (appointment.status === 'in_progress' || appointment.status === 'completed') && (
          <button
            onClick={() => abrirRegistroDeAtencion(appointment)}
            className={`p-1.5 rounded-lg transition-colors ${appointment.attentionRegisteredAt ? 'text-green-600 hover:bg-green-50' : 'text-gray-500 hover:text-primary-600 hover:bg-primary-50'}`}
            title={appointment.attentionRegisteredAt ? 'Atención registrada en la ficha (editar)' : 'Registrar atención'}
          >
            {appointment.attentionRegisteredAt ? <ClipboardCheck className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
          </button>
        )}
        {appointment.status === 'in_progress' && (
          <button
            onClick={() => handleComplete(appointment)}
            className="inline-flex items-center gap-1 px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-lg transition-colors"
            title="Finalizar y Cobrar"
          >
            <ShoppingCart className="w-3.5 h-3.5" /> Cobrar
          </button>
        )}
        {['scheduled', 'cancelled', 'no_show'].includes(appointment.status) && (
          <button
            onClick={() => handleDelete(appointment)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </>
    )
  }

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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Agenda de Citas</h1>
            <GuideLink />
          </div>
          <p className="text-sm sm:text-base text-gray-600 mt-1 capitalize">{formatDate(selectedDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>Hoy</Button>
          <Button variant="outline" size="sm" onClick={() => openWalkIn('schedule')}>
            <Plus className="w-4 h-4 mr-1" /> Agendar cita
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
            <Button size="sm" onClick={() => openWalkIn('now')}>
              <Plus className="w-4 h-4 mr-1" /> Atender ahora
            </Button>
          </div>
          {inProgress.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {esVeterinaria
                  ? <PawPrint className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  : <User className="w-10 h-10 mx-auto mb-2 text-gray-300" />}
                <p>{esVeterinaria ? 'No hay mascotas en atención ahora.' : 'No hay nadie en atención ahora.'}</p>
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
                    {chipDeLocal(appt) && <div className="mb-2">{chipDeLocal(appt)}</div>}
                    {esVeterinaria ? (
                      <>
                        <p className="text-sm text-gray-800 flex items-center gap-1">
                          <PawPrint className="w-4 h-4 text-gray-400 flex-shrink-0" /> <strong className="truncate">{appt.petName || 'Mascota'}</strong>
                        </p>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <User className="w-4 h-4 text-gray-400 flex-shrink-0" /> <span className="truncate">{appt.customerName}</span>
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-800 flex items-center gap-1">
                        <User className="w-4 h-4 text-gray-400 flex-shrink-0" /> <strong className="truncate">{appt.customerName}</strong>
                      </p>
                    )}
                    {appt.servicePrice > 0 && (
                      <p className="text-sm font-semibold text-primary-600 mt-1">S/ {appt.servicePrice.toFixed(2)}</p>
                    )}
                    {conFicha && (
                      <Button size="sm" variant="outline" className="w-full mt-3 gap-1" onClick={() => abrirRegistroDeAtencion(appt)}>
                        {appt.attentionRegisteredAt
                          ? <><ClipboardCheck className="w-4 h-4" /> Atención registrada</>
                          : <><ClipboardList className="w-4 h-4" /> Registrar atención</>}
                      </Button>
                    )}
                    {(paquetesPorCliente[appt.customerId] || []).length > 0 && (
                      <Button size="sm" variant="outline" className="w-full mt-2 gap-1" onClick={() => setUsoDe(appt)}>
                        <Package className="w-4 h-4" /> Usar sesión del paquete
                        <span className="text-xs text-gray-500">
                          ({paquetesPorCliente[appt.customerId].reduce((s, p) => s + sesionesDisponibles(p), 0)} disp.)
                        </span>
                      </Button>
                    )}
                    <Button size="sm" className={`w-full gap-1 ${conFicha || (paquetesPorCliente[appt.customerId] || []).length > 0 ? 'mt-2' : 'mt-3'}`} onClick={() => handleComplete(appt)}>
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
      {/* Resumen del día: chips compactos en vez de tarjetones de colores */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
          {dayStats.total || 0} {dayStats.total === 1 ? 'cita' : 'citas'} este día
        </span>
        {((dayStats.scheduled || 0) + (dayStats.confirmed || 0)) > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
            {(dayStats.scheduled || 0) + (dayStats.confirmed || 0)} pendientes
          </span>
        )}
        {(dayStats.inProgress || 0) > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 text-xs font-medium">
            {dayStats.inProgress} en atención
          </span>
        )}
        {(dayStats.completed || 0) > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
            {dayStats.completed} completadas
          </span>
        )}
      </div>

      {/* Calendario y horas del día, lado a lado (patrón Calendly/Fresha):
          clic en el día → el panel derecho muestra sus horas; clic en una
          hora libre → formulario de agendar con fecha y hora ya puestas. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
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

      {/* Horas del día elegido. El key por fecha remonta el panel y con eso
          la animación de entrada se repite en cada cambio de día. Altura
          fija en escritorio: el scroll es SOLO interno, la página no crece. */}
      <div key={selectedDate.toDateString()} className="animate-fade-in lg:h-[560px]">
        <DaySlotPicker
          date={selectedDate}
          appointments={dayAppointments}
          onPickSlot={(hora) => openWalkIn('schedule', { time: hora })}
          onPrevDay={() => changeDate(-1)}
          onNextDay={() => changeDate(1)}
          renderStatus={(a) => (
            <span className="inline-flex items-center gap-1.5 flex-wrap">{getStatusBadge(a.status)}{chipDeLocal(a)}{chipDeEspecialista(a)}</span>
          )}
          renderActions={renderApptActions}
        />
      </div>
      </div>

      </>
      )}

      {/* Registrar la atención en la ficha del paciente (Clínica, o General
          con la ficha de atención encendida). El historial es el mismo que se
          edita en Clientes; ver attentionService.registrarAtencionDesdeCita. */}
      <Modal
        isOpen={!!atencionDe}
        onClose={() => !savingAtencion && setAtencionDe(null)}
        title="Registrar atención"
        size="lg"
      >
        {atencionDe && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Queda en la ficha de <strong>{atencionDe.customerName || 'el paciente'}</strong> como la atención de hoy.
              {atencionDe.attentionRegisteredAt && ' Esta cita ya tiene una atención registrada: lo que guardes la reemplaza.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Procedimiento</label>
                <input
                  type="text"
                  value={atencionForm.service}
                  onChange={(e) => setAtencionForm(f => ({ ...f, service: e.target.value }))}
                  placeholder="Ej: Limpieza facial"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Especialista</label>
                <input
                  type="text"
                  value={atencionForm.specialist}
                  onChange={(e) => setAtencionForm(f => ({ ...f, specialist: e.target.value }))}
                  placeholder="Quién atendió"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tratamiento / medicación</label>
              <input
                type="text"
                value={atencionForm.treatment}
                onChange={(e) => setAtencionForm(f => ({ ...f, treatment: e.target.value }))}
                placeholder="Ej: Ácido hialurónico 1 ml en labios"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Recomendaciones</label>
              <textarea
                rows={3}
                value={atencionForm.recommendations}
                onChange={(e) => setAtencionForm(f => ({ ...f, recommendations: e.target.value }))}
                placeholder="Qué se le indicó al paciente para los próximos días"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 resize-y"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Próximo control</label>
                <input
                  type="date"
                  value={atencionForm.nextControlDate}
                  onChange={(e) => setAtencionForm(f => ({ ...f, nextControlDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hora</label>
                <input
                  type="time"
                  value={atencionForm.nextControlTime}
                  onChange={(e) => setAtencionForm(f => ({ ...f, nextControlTime: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
            {atencionForm.nextControlDate && (
              <p className="text-[11px] text-primary-700">Al guardar, el control se agenda solo en la Agenda.</p>
            )}
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAtencionDe(null)} disabled={savingAtencion}>
                Volver
              </Button>
              <Button
                variant={atencionDe.status === 'in_progress' ? 'outline' : undefined}
                onClick={() => guardarAtencion()}
                disabled={savingAtencion}
              >
                {savingAtencion ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
              </Button>
              {atencionDe.status === 'in_progress' && (
                <Button onClick={() => guardarAtencion({ cobrar: true })} disabled={savingAtencion} className="gap-1">
                  <ShoppingCart className="w-4 h-4" /> Guardar y cobrar
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Usar una sesión de un paquete: completa la cita sin pasar por el POS */}
      <Modal isOpen={!!usoDe} onClose={() => !usandoSesion && setUsoDe(null)} title="Usar sesión del paquete">
        {usoDe && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              La cita de <strong>{usoDe.customerName}</strong> se completa descontando una sesión, sin cobrar en el Punto de Venta.
            </p>
            {(paquetesPorCliente[usoDe.customerId] || []).map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.productName}</p>
                  <p className="text-xs text-gray-500">{sesionesDisponibles(p)} de {p.sessionsTotal} disponibles</p>
                </div>
                <Button size="sm" onClick={() => confirmarUsoDeSesion(p)} disabled={!!usandoSesion} className="gap-1 flex-shrink-0">
                  {usandoSesion === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} Usar 1 sesión
                </Button>
              </div>
            ))}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setUsoDe(null)} disabled={!!usandoSesion}>Volver</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de cancelación */}
      <Modal
        isOpen={!!cancelModal}
        onClose={() => { setCancelModal(null); setCancelReason('') }}
        title="Cancelar Cita"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            ¿Cancelar la cita de <strong>{(esVeterinaria && cancelModal?.petName) || cancelModal?.customerName}</strong> para{' '}
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

      {/* Modal "Atender ahora" (walk-in) / "Agendar cita" (a futuro).
          Mismo formulario de cliente + mascota + servicios; agendar suma
          fecha, hora y la disponibilidad del día elegido. */}
      <Modal isOpen={walkInOpen} onClose={() => !savingWalkIn && setWalkInOpen(false)} title={walkInIntent === 'schedule' ? 'Agendar cita' : 'Atender ahora'} size="lg">
        <div className="space-y-4">
          {/* ===== LOCAL (solo si el negocio tiene más de uno) ===== */}
          {(branches || []).length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
              <select
                value={schedBranch}
                onChange={(e) => setSchedBranch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Principal</option>
                {(branches || []).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                La agenda de cada local es independiente: la misma hora puede estar libre en uno y ocupada en otro.
              </p>
            </div>
          )}

          {/* ===== QUIÉN ATIENDE ===== */}
          {/* Se muestra solo si el negocio tiene personal cargado en Vendedores:
              a quien no lo use, el formulario no le crece con un campo vacío. */}
          {specialists.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Especialista</label>
              <select
                value={schedSpecialist}
                onChange={(e) => setSchedSpecialist(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Sin asignar</option>
                {specialists.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Quién va a atender. La lista sale de tus vendedores.
              </p>
            </div>
          )}

          {/* ===== FECHA, HORA Y DISPONIBILIDAD (solo al agendar) ===== */}
          {walkInIntent === 'schedule' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              {/* Disponibilidad del día elegido */}
              {schedDayAppts.length === 0 ? (
                <p className="text-xs text-green-600 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  Día libre: no hay citas agendadas para esta fecha.
                </p>
              ) : (
                <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <p className="font-medium text-gray-700 mb-1">Horarios ya tomados ese día:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {schedDayAppts.map(a => {
                      const mismaHora = formatTime(a.scheduledDate) === schedTime
                      return (
                        <span
                          key={a.id}
                          title={`${a.serviceName || 'Cita'} — ${a.petName || ''}`}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${mismaHora ? 'bg-amber-100 border-amber-300 text-amber-800 font-semibold' : 'bg-white border-gray-200 text-gray-600'}`}
                        >
                          <Clock className="w-3 h-3" /> {formatTime(a.scheduledDate)} · {a.petName || a.customerName}
                        </span>
                      )
                    })}
                  </div>
                  {schedDayAppts.some(a => formatTime(a.scheduledDate) === schedTime) && (
                    <p className="text-amber-700 mt-1.5">Ya hay una cita a esa misma hora. Puedes agendarla igual o elegir otra.</p>
                  )}
                </div>
              )}
            </div>
          )}
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
                          {matches.length === 0 && (() => {
                            const q = walkInSearch.trim()
                            const esDni = /^\d{8}$/.test(q)
                            const esRuc = /^\d{11}$/.test(q)
                            const esNum = /^\d+$/.test(q)
                            return (
                              <div className="px-3 py-2.5 space-y-2">
                                <p className="text-sm text-gray-500">No está registrado.</p>
                                {(esDni || esRuc) && (
                                  <button
                                    type="button"
                                    onClick={buscarDocEnPadron}
                                    disabled={lookingUpDoc}
                                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
                                  >
                                    {lookingUpDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                    Buscar {esDni ? 'DNI' : 'RUC'} {q} en {esDni ? 'RENIEC' : 'SUNAT'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={irACrearNuevo}
                                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  Crear cliente nuevo {esNum ? 'con este documento' : q ? 'con este nombre' : ''}
                                </button>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>

              {/* Mascota: seleccionar de las del cliente (solo veterinaria) */}
              {esVeterinaria && walkInCustomer && (() => {
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
              {esVeterinaria && (
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
              )}
            </>
          )}

          {/* ===== SERVICIOS + PRECIOS (multi: baño + corte + movilidad...)
               Buscador con sugerencias, no desplegable: se tipea y filtra
               sobre Productos y Servicios; elegir uno trae su precio. Lo que
               no está en la lista queda tal cual como servicio libre. ===== */}
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <label className="block text-sm font-medium text-gray-700">Servicios</label>

            {walkInServices.map((svc, idx) => {
              const q = (svc.serviceName || '').trim()
              const sugerencias = (svc.serviceId ? [] : (q ? serviceOptions.filter(p => matchesSearchQuery(q, p.name)) : serviceOptions)).slice(0, 8)
              return (
                <div key={idx} className="flex items-start gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={svc.serviceName}
                      onChange={(e) => updateWalkInService(idx, { serviceName: e.target.value, serviceId: '', duration: null })}
                      onFocus={() => setActiveSvcIdx(idx)}
                      onBlur={() => setActiveSvcIdx(i => (i === idx ? null : i))}
                      placeholder="Busca el servicio o escríbelo (ej. Baño y corte)"
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    {activeSvcIdx === idx && sugerencias.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full max-h-44 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg divide-y">
                        {sugerencias.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={(e) => {
                              // onMouseDown y no onClick: el blur del input
                              // desmontaría la lista antes de que el click llegue.
                              e.preventDefault()
                              updateWalkInService(idx, {
                                serviceId: p.id,
                                serviceName: p.name,
                                price: p.price != null ? String(p.price) : svc.price,
                                duration: Number(p.duration) > 0 ? Number(p.duration) : null,
                              })
                              setActiveSvcIdx(null)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{p.name}</span>
                            {p.price != null && <span className="text-xs text-gray-400 flex-shrink-0">S/ {Number(p.price).toFixed(2)}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={svc.price}
                    onChange={(e) => updateWalkInService(idx, { price: e.target.value })}
                    placeholder="0.00"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm text-right"
                  />
                  <button
                    type="button"
                    onClick={() => removeWalkInService(idx)}
                    disabled={walkInServices.length === 1}
                    title="Quitar servicio"
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={addWalkInService}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                <Plus className="w-4 h-4" /> Agregar servicio
              </button>
              {walkInTotal > 0 && (
                <span className="text-sm font-semibold text-gray-900">Total: S/ {walkInTotal.toFixed(2)}</span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setWalkInOpen(false)} disabled={savingWalkIn}>Cancelar</Button>
            <Button onClick={handleCreateWalkIn} disabled={savingWalkIn}>
              {savingWalkIn
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : walkInIntent === 'schedule'
                  ? <><Calendar className="w-4 h-4 mr-1" /> Agendar cita</>
                  : <><Play className="w-4 h-4 mr-1" /> Iniciar atención</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
