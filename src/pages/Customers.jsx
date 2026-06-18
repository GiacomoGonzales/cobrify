import { useState, useEffect, useMemo, useDeferredValue } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Edit, Trash2, User, Loader2, AlertTriangle, ShoppingCart, DollarSign, TrendingUp, FileSpreadsheet, CalendarClock, Cake, Columns3, PawPrint, ClipboardList, Eye, EyeOff, X } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useHidePrivateData } from '@/hooks/useHidePrivateData'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { customerSchema } from '@/utils/schemas'
import { ID_TYPES } from '@/utils/peruUtils'
import {
  getCustomers,
  getCustomersWithStats,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '@/services/firestoreService'
import { formatCurrency, buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'
import { generateCustomersExcel } from '@/services/customerExportService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import MedicalHistoryModal from '@/components/veterinary/MedicalHistoryModal'
import { normalizePets, createEmptyPet } from '@/utils/petUtils'

export default function Customers() {
  const { user, isDemoMode, demoData, getBusinessId, businessSettings, businessMode } = useAppContext()
  const hidePrivateData = useHidePrivateData()
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAmounts, setShowAmounts] = useState(() => localStorage.getItem('dashboard_show_amounts') === 'true')
  const hiddenAmount = '••••••'
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [deletingCustomer, setDeletingCustomer] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [sortBy, setSortBy] = useState('name') // name, orders, spent, expiry
  const [subscriptionFilter, setSubscriptionFilter] = useState('all') // all, expired, expiring, active
  const [birthMonthFilter, setBirthMonthFilter] = useState('all') // all, 1-12, this
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    document: true,
    contact: true,
    address: true,
    birthday: true,
    orders: true,
    spent: true,
  })
  const [visibleCount, setVisibleCount] = useState(20)
  const ITEMS_PER_PAGE = 20

  // Estado para modal de historia clínica (veterinaria)
  const [medicalHistoryCustomer, setMedicalHistoryCustomer] = useState(null)
  // Estado para múltiples mascotas (veterinaria)
  const [pets, setPets] = useState([])

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
    getValues,
  } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      documentType: ID_TYPES.DNI,
      documentNumber: '',
      businessName: '',
      name: '',
      code: '',
      email: '',
      phone: '',
      address: '',
      studentName: '',
      studentSchedule: '',
      priceLevel: null,
      subscriptionPlan: '',
      subscriptionPrice: '',
      subscriptionExpiry: '',
      // Campos para mascota (veterinaria)
      petName: '',
      petSpecies: '',
      petBreed: '',
      petAge: '',
      petWeight: '',
      petNotes: '',
    },
  })

  const documentType = watch('documentType')

  // Cargar clientes
  useEffect(() => {
    loadCustomers()
  }, [user])

  const loadCustomers = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        // Cargar datos de demo con stats simulados
        const customersWithStats = demoData.customers.map(customer => ({
          ...customer,
          ordersCount: 0,
          totalSpent: 0
        }))
        setCustomers(customersWithStats)
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      // PERF cuentas grandes: la tabla aparece al instante con la lista de
      // clientes (getCustomers, ~liviano). Las estadísticas (nº de compras y
      // total gastado) recorren TODAS las facturas, así que se calculan en
      // SEGUNDO PLANO y se fusionan cuando llegan, sin bloquear la página.
      const baseResult = await getCustomers(businessId)
      if (baseResult.success) {
        setCustomers(baseResult.data || [])
      } else {
        console.error('Error al cargar clientes:', baseResult.error)
      }
      setIsLoading(false)

      getCustomersWithStats(businessId)
        .then(statsResult => {
          if (statsResult.success) setCustomers(statsResult.data || [])
        })
        .catch(err => console.error('Error al cargar estadísticas de clientes:', err))
      return
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingCustomer(null)
    reset({
      documentType: ID_TYPES.DNI,
      documentNumber: '',
      businessName: '',
      name: '',
      code: '',
      email: '',
      phone: '',
      address: '',
      studentName: '',
      studentSchedule: '',
      birthDate: '',
    })
    // Inicializar con una mascota vacía en veterinaria
    if (businessMode === 'veterinary') {
      setPets([createEmptyPet()])
    }
    setIsModalOpen(true)
  }

  const openEditModal = customer => {
    setEditingCustomer(customer)
    reset({
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      businessName: customer.businessName || '',
      name: customer.name,
      code: customer.code || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      studentName: customer.studentName || '',
      studentSchedule: customer.studentSchedule || '',
      vehiclePlate: customer.vehiclePlate || '',
      priceLevel: customer.priceLevel || null,
      subscriptionPlan: customer.subscriptionPlan || '',
      subscriptionPrice: customer.subscriptionPrice || '',
      subscriptionExpiry: customer.subscriptionExpiry || '',
      birthDate: customer.birthDate || '',
      // Campos de mascota legacy (se mantienen para compatibilidad)
      petName: customer.petName || '',
      petSpecies: customer.petSpecies || '',
      petBreed: customer.petBreed || '',
      petAge: customer.petAge || '',
      petWeight: customer.petWeight || '',
      petNotes: customer.petNotes || '',
    })
    // Cargar mascotas normalizadas
    setPets(normalizePets(customer))
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingCustomer(null)
    setPets([])
    reset()
  }

  // Buscar datos de DNI o RUC automáticamente
  const handleLookupDocument = async () => {
    const docNumber = getValues('documentNumber')
    const docType = getValues('documentType')

    if (!docNumber) {
      toast.error('Ingrese un número de documento para buscar')
      return
    }

    // SUNAT solo expone búsqueda para DNI y RUC
    if (docType === ID_TYPES.CE || docType === ID_TYPES.PASSPORT) {
      toast.info('La búsqueda automática solo está disponible para DNI y RUC. Completa los datos manualmente.')
      return
    }

    setIsLookingUp(true)

    try {
      let result

      // Determinar si es DNI o RUC según el tipo seleccionado o la longitud
      if (docType === ID_TYPES.DNI || (!docType && docNumber.length === 8)) {
        if (docNumber.length !== 8) {
          toast.error('El DNI debe tener 8 dígitos')
          setIsLookingUp(false)
          return
        }
        result = await consultarDNI(docNumber)

        if (result.success) {
          setValue('name', result.data.nombreCompleto || '')
          setValue('documentType', ID_TYPES.DNI)
          toast.success(`Datos encontrados: ${result.data.nombreCompleto}`)
        }
      } else if (docType === ID_TYPES.RUC || (!docType && docNumber.length === 11)) {
        if (docNumber.length !== 11) {
          toast.error('El RUC debe tener 11 dígitos')
          setIsLookingUp(false)
          return
        }
        result = await consultarRUC(docNumber)

        if (result.success) {
          setValue('businessName', result.data.razonSocial || '')
          setValue('name', result.data.nombreComercial || result.data.razonSocial || '')
          setValue('address', result.data.direccion || '')
          setValue('documentType', ID_TYPES.RUC)
          toast.success(`Datos encontrados: ${result.data.razonSocial}`)
        }
      } else {
        toast.error('Seleccione un tipo de documento o ingrese 8 dígitos (DNI) u 11 dígitos (RUC)')
        setIsLookingUp(false)
        return
      }

      if (result && !result.success) {
        toast.error(result.error || 'No se encontraron datos para este documento')
      }
    } catch (error) {
      console.error('Error al buscar documento:', error)
      toast.error('Error al consultar el documento. Verifique su conexión.')
    } finally {
      setIsLookingUp(false)
    }
  }

  const onSubmit = async data => {
    if (!user?.uid) return

    const businessId = getBusinessId()
    setIsSaving(true)

    try {
      // Agregar mascotas al data si estamos en modo veterinaria
      if (businessMode === 'veterinary' && pets.length > 0) {
        const validPets = pets.filter(p => p.name.trim() !== '')
        data.pets = validPets
        // Backward compatibility: escribir datos de la primera mascota en campos legacy
        const primary = validPets[0]
        if (primary) {
          data.petName = primary.name
          data.petSpecies = primary.species || ''
          data.petBreed = primary.breed || ''
          data.petAge = primary.age || ''
          data.petWeight = primary.weight || ''
          data.petNotes = primary.notes || ''
        }
      }

      let result

      if (editingCustomer) {
        // Actualizar
        result = await updateCustomer(businessId, editingCustomer.id, data)
      } else {
        // Crear
        result = await createCustomer(businessId, data)
      }

      if (result.success) {
        toast.success(
          editingCustomer
            ? 'Cliente actualizado exitosamente'
            : 'Cliente creado exitosamente'
        )
        closeModal()
        loadCustomers()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al guardar cliente:', error)
      toast.error('Error al guardar el cliente. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingCustomer || !user?.uid) return

    const businessId = getBusinessId()
    setIsSaving(true)
    try {
      const result = await deleteCustomer(businessId, deletingCustomer.id)

      if (result.success) {
        toast.success('Cliente eliminado exitosamente')
        setDeletingCustomer(null)
        loadCustomers()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar cliente:', error)
      toast.error('Error al eliminar el cliente. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExportToExcel = async () => {
    try {
      if (customers.length === 0) {
        toast.error('No hay clientes para exportar');
        return;
      }

      let businessData = null;

      // En modo demo, usar datos del demo
      if (isDemoMode && demoData) {
        businessData = demoData.business;
      } else {
        // Obtener datos del negocio
        const { getCompanySettings } = await import('@/services/firestoreService');
        const settingsResult = await getCompanySettings(user.uid);
        businessData = settingsResult.success ? settingsResult.data : null;
      }

      // Cargar facturas para obtener servicios por cliente
      toast.info('Cargando datos de servicios...')
      let invoices = []
      if (!isDemoMode) {
        const businessId = getBusinessId()
        const { collection, getDocs, query, where } = await import('firebase/firestore')
        const { db } = await import('@/lib/firebase')
        const invoicesRef = collection(db, 'businesses', businessId, 'invoices')
        const q = query(invoicesRef, where('status', '!=', 'annulled'))
        const snapshot = await getDocs(q)
        invoices = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      }

      // Generar Excel
      await generateCustomersExcel(customers, businessData, invoices);
      toast.success(`${customers.length} cliente(s) exportado(s) exitosamente`);
    } catch (error) {
      console.error('Error al exportar clientes:', error);
      toast.error('Error al generar el archivo Excel');
    }
  }

  // Helper: estado de suscripción de un cliente
  const getSubscriptionStatus = (customer) => {
    if (!customer.subscriptionExpiry) return 'none'
    const expiry = new Date(customer.subscriptionExpiry + 'T23:59:59')
    const now = new Date()
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    if (expiry < now) return 'expired'
    if (expiry < in7Days) return 'expiring'
    return 'active'
  }

  // Búsqueda con haystack pre-construido (perf): re-normaliza solo cuando cambia
  // la lista de clientes, no en cada keystroke.
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const customerSearchIndex = useMemo(() => {
    const map = new Map()
    for (const customer of customers) {
      const petFields = normalizePets(customer).flatMap(p => [p.name, p.species, p.breed])
      map.set(customer.id, buildSearchHaystack(
        customer.name,
        customer.documentNumber,
        customer.businessName,
        customer.email,
        customer.phone,
        customer.address,
        ...petFields,
        customer.studentName,
        customer.studentSchedule,
        customer.vehiclePlate,
        customer.subscriptionPlan
      ))
    }
    return map
  }, [customers])

  // Filtrar y ordenar clientes
  const filteredCustomers = useMemo(() => customers
    .filter(customer => {
      // Búsqueda insensible a acentos/tildes y mayúsculas (multi-palabra, multi-campo)
      const matchesSearch = matchesPrebuilt(deferredSearchTerm, customerSearchIndex.get(customer.id) || '')
      if (!matchesSearch) return false

      // Filtro de suscripción
      if (subscriptionFilter !== 'all') {
        const status = getSubscriptionStatus(customer)
        if (subscriptionFilter === 'expired') return status === 'expired'
        if (subscriptionFilter === 'expiring') return status === 'expiring'
        if (subscriptionFilter === 'active') return status === 'active'
      }

      // Filtro de cumpleaños
      if (birthMonthFilter !== 'all') {
        if (!customer.birthDate) return false
        const month = parseInt(customer.birthDate.split('-')[1])
        if (birthMonthFilter === 'this') {
          return month === new Date().getMonth() + 1
        }
        return month === parseInt(birthMonthFilter)
      }
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'orders':
          return (b.ordersCount || 0) - (a.ordersCount || 0)
        case 'spent':
          return (b.totalSpent || 0) - (a.totalSpent || 0)
        case 'expiry': {
          // Los que no tienen fecha van al final, luego por fecha más próxima primero
          if (!a.subscriptionExpiry && !b.subscriptionExpiry) return 0
          if (!a.subscriptionExpiry) return 1
          if (!b.subscriptionExpiry) return -1
          return a.subscriptionExpiry.localeCompare(b.subscriptionExpiry)
        }
        case 'name':
        default:
          return (a.name || '').localeCompare(b.name || '')
      }
    }), [customers, deferredSearchTerm, customerSearchIndex, subscriptionFilter, birthMonthFilter, sortBy])

  const displayedCustomers = filteredCustomers.slice(0, visibleCount)
  const hasMore = filteredCustomers.length > visibleCount

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE)
  }, [searchTerm, sortBy, subscriptionFilter, birthMonthFilter])

  const getDocumentBadge = type => {
    const badges = {
      [ID_TYPES.RUC]: <Badge variant="primary">RUC</Badge>,
      [ID_TYPES.DNI]: <Badge>DNI</Badge>,
      [ID_TYPES.CE]: <Badge variant="secondary">CE</Badge>,
      [ID_TYPES.PASSPORT]: <Badge variant="secondary">Pasaporte</Badge>,
    }
    return badges[type] || <Badge>{type}</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando clientes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tu cartera de clientes
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {!hidePrivateData && (
            <Button
              variant="outline"
              onClick={handleExportToExcel}
              className="w-full sm:w-auto"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
          )}
          <Button onClick={openCreateModal} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      {/* Search & Sort */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm flex-1 min-w-0">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar por nombre, RUC, DNI, alumno..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
            {/* Ordenar */}
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
              >
                <option value="name">Ordenar por Nombre</option>
                <option value="orders">Ordenar por Pedidos</option>
                {!hidePrivateData && <option value="spent">Ordenar por Total Gastado</option>}
                {businessSettings?.posCustomFields?.showSubscriptionFields && (
                  <option value="expiry">Ordenar por Vencimiento</option>
                )}
              </select>
            </div>
            {/* Filtro de suscripción */}
            {businessSettings?.posCustomFields?.showSubscriptionFields && (
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <CalendarClock className="w-4 h-4 text-gray-500" />
                <select
                  value={subscriptionFilter}
                  onChange={e => setSubscriptionFilter(e.target.value)}
                  className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas las suscripciones</option>
                  <option value="expired">Vencidas</option>
                  <option value="expiring">Por vencer (7 días)</option>
                  <option value="active">Vigentes</option>
                </select>
              </div>
            )}
            {/* Filtro de cumpleaños */}
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Cake className="w-4 h-4 text-gray-500" />
              <select
                value={birthMonthFilter}
                onChange={e => setBirthMonthFilter(e.target.value)}
                className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
              >
                <option value="all">Cumpleaños</option>
                <option value="this">Este mes</option>
                <option value="1">Enero</option>
                <option value="2">Febrero</option>
                <option value="3">Marzo</option>
                <option value="4">Abril</option>
                <option value="5">Mayo</option>
                <option value="6">Junio</option>
                <option value="7">Julio</option>
                <option value="8">Agosto</option>
                <option value="9">Septiembre</option>
                <option value="10">Octubre</option>
                <option value="11">Noviembre</option>
                <option value="12">Diciembre</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${hidePrivateData ? 'lg:grid-cols-2' : 'lg:grid-cols-4'} gap-6`}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-600">Total Clientes</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{customers.length}</p>
              </div>
              <User className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-600">Total Pedidos</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {showAmounts ? customers.reduce((sum, c) => sum + (c.ordersCount || 0), 0) : hiddenAmount}
                </p>
              </div>
              <button
                onClick={() => { const v = !showAmounts; setShowAmounts(v); localStorage.setItem('dashboard_show_amounts', v) }}
                className="flex-shrink-0 hover:opacity-60 transition-opacity"
                title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
              >
                {showAmounts ? <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" /> : <EyeOff className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />}
              </button>
            </div>
          </CardContent>
        </Card>
        {!hidePrivateData && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">Ingresos Totales</p>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {showAmounts ? formatCurrency(customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0)) : hiddenAmount}
                  </p>
                </div>
                <button
                  onClick={() => { const v = !showAmounts; setShowAmounts(v); localStorage.setItem('dashboard_show_amounts', v) }}
                  className="flex-shrink-0 hover:opacity-60 transition-opacity"
                  title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
                >
                  {showAmounts ? <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" /> : <EyeOff className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />}
                </button>
              </div>
            </CardContent>
          </Card>
        )}
        {!hidePrivateData && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">Promedio por Cliente</p>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {showAmounts ? formatCurrency(
                      customers.length > 0
                        ? customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0) / customers.length
                        : 0
                    ) : hiddenAmount}
                  </p>
                </div>
                <button
                  onClick={() => { const v = !showAmounts; setShowAmounts(v); localStorage.setItem('dashboard_show_amounts', v) }}
                  className="flex-shrink-0 hover:opacity-60 transition-opacity"
                  title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
                >
                  {showAmounts ? <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-600" /> : <EyeOff className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-600" />}
                </button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Resumen de suscripciones */}
      {businessSettings?.posCustomFields?.showSubscriptionFields && (() => {
        const withSub = customers.filter(c => c.subscriptionExpiry)
        const now = new Date()
        const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        const expired = withSub.filter(c => new Date(c.subscriptionExpiry + 'T23:59:59') < now)
        const expiring = withSub.filter(c => {
          const d = new Date(c.subscriptionExpiry + 'T23:59:59')
          return d >= now && d < in7Days
        })
        const active = withSub.filter(c => new Date(c.subscriptionExpiry + 'T23:59:59') >= in7Days)

        return (expired.length > 0 || expiring.length > 0) ? (
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => { setSubscriptionFilter('expired'); setSortBy('expiry') }}
              className={`p-3 rounded-lg border text-center transition-colors ${subscriptionFilter === 'expired' ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200 hover:border-red-200'}`}
            >
              <p className="text-2xl font-bold text-red-600">{expired.length}</p>
              <p className="text-xs text-gray-600">Vencidas</p>
            </button>
            <button
              onClick={() => { setSubscriptionFilter('expiring'); setSortBy('expiry') }}
              className={`p-3 rounded-lg border text-center transition-colors ${subscriptionFilter === 'expiring' ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200 hover:border-yellow-200'}`}
            >
              <p className="text-2xl font-bold text-yellow-600">{expiring.length}</p>
              <p className="text-xs text-gray-600">Por vencer</p>
            </button>
            <button
              onClick={() => { setSubscriptionFilter('active'); setSortBy('expiry') }}
              className={`p-3 rounded-lg border text-center transition-colors ${subscriptionFilter === 'active' ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200 hover:border-green-200'}`}
            >
              <p className="text-2xl font-bold text-green-600">{active.length}</p>
              <p className="text-xs text-gray-600">Vigentes</p>
            </button>
          </div>
        ) : null
      })()}

      {/* Customers Table */}
      <Card>
        {filteredCustomers.length === 0 ? (
          <CardContent className="p-12 text-center">
            <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza agregando tu primer cliente'}
            </p>
            {!searchTerm && (
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Cliente
              </Button>
            )}
          </CardContent>
        ) : (
          <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {displayedCustomers.map(customer => (
                <div key={customer.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  {/* Fila 1: Nombre + acciones */}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{customer.name}</p>
                      {customer.businessName && customer.businessName !== customer.name && (
                        <p className="text-xs text-gray-500 truncate">{customer.businessName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {businessMode === 'veterinary' && normalizePets(customer).length > 0 && (
                        <button
                          onClick={() => setMedicalHistoryCustomer(customer)}
                          className="p-1.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                          title="Historia Clínica"
                        >
                          <ClipboardList className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(customer)}
                        className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingCustomer(customer)}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Fila 2: Documento + contacto */}
                  <div className="flex items-center gap-3 mt-1">
                    {customer.documentType && customer.documentNumber ? (
                      <div className="flex items-center gap-1">
                        {getDocumentBadge(customer.documentType)}
                        <span className="text-xs text-gray-600">{customer.documentNumber}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Sin documento</span>
                    )}
                    {customer.phone && (
                      <span className="text-xs text-gray-500">{customer.phone}</span>
                    )}
                  </div>

                  {/* Fila 3: Métricas + campos condicionales */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      {businessSettings?.posCustomFields?.showStudentField && customer.studentName && (
                        <span>{customer.studentName}</span>
                      )}
                      {businessSettings?.posCustomFields?.showVehiclePlateField && customer.vehiclePlate && (
                        <span className="font-medium uppercase">{customer.vehiclePlate}</span>
                      )}
                      {businessMode === 'veterinary' && normalizePets(customer).length > 0 && (
                        <span className="inline-flex items-center gap-1 text-primary-600">
                          <PawPrint className="w-3 h-3" />
                          {normalizePets(customer).map(p => p.name).join(', ')}
                        </span>
                      )}
                      {customer.email && (
                        <span className="text-gray-500 truncate max-w-[160px]">{customer.email}</span>
                      )}
                    </div>
                    {businessSettings?.posCustomFields?.showSubscriptionFields && (customer.subscriptionPlan || customer.subscriptionExpiry) && (
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        {customer.subscriptionPlan && (
                          <span className="text-gray-700 font-medium">{customer.subscriptionPlan}</span>
                        )}
                        {customer.subscriptionPrice && (
                          <span className="text-gray-600">{formatCurrency(Number(customer.subscriptionPrice))}</span>
                        )}
                        {customer.subscriptionExpiry && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full font-medium ${
                            new Date(customer.subscriptionExpiry + 'T23:59:59') < new Date()
                              ? 'bg-red-100 text-red-700'
                              : new Date(customer.subscriptionExpiry + 'T23:59:59') < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                          }`}>
                            {new Date(customer.subscriptionExpiry + 'T00:00:00').toLocaleDateString('es-PE')}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                        {showAmounts ? (customer.ordersCount || 0) : '•'}
                      </span>
                      {!hidePrivateData && (
                        <span className="text-xs font-semibold text-gray-900">{showAmounts ? formatCurrency(customer.totalSpent || 0) : hiddenAmount}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla para desktop */}
            <div className="hidden lg:block">
              {/* Column picker */}
              <div className="flex justify-end px-4 py-2 border-b">
                <div className="relative">
                  <button
                    onClick={() => setShowColumnPicker(!showColumnPicker)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Columns3 className="w-3.5 h-3.5" />
                    Columnas
                  </button>
                  {showColumnPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowColumnPicker(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[160px]">
                        {[
                          { key: 'name', label: 'Nombre' },
                          { key: 'document', label: 'Documento' },
                          { key: 'contact', label: 'Contacto' },
                          { key: 'address', label: 'Dirección' },
                          { key: 'birthday', label: 'Cumpleaños' },
                          { key: 'orders', label: 'Pedidos' },
                          ...(!hidePrivateData ? [{ key: 'spent', label: 'Total Gastado' }] : []),
                        ].map(col => (
                          <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={visibleColumns[col.key]}
                              onChange={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-xs text-gray-700">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.name && <TableHead className="text-xs py-2">Nombre</TableHead>}
                  {visibleColumns.document && <TableHead className="text-xs py-2">Documento</TableHead>}
                  {visibleColumns.contact && <TableHead className="text-xs py-2">Contacto</TableHead>}
                  {visibleColumns.address && (
                    businessSettings?.posCustomFields?.showStudentField ? (
                      <>
                        <TableHead className="text-xs py-2">Alumno</TableHead>
                        <TableHead className="text-xs py-2">Horario</TableHead>
                      </>
                    ) : (
                      <TableHead className="text-xs py-2">Dirección</TableHead>
                    )
                  )}
                  {businessSettings?.posCustomFields?.showVehiclePlateField && (
                    <TableHead className="text-xs py-2">Placa</TableHead>
                  )}
                  {businessMode === 'veterinary' && (
                    <TableHead className="text-xs py-2">Mascotas</TableHead>
                  )}
                  {businessSettings?.posCustomFields?.showSubscriptionFields && (
                    <>
                      <TableHead className="text-xs py-2">Plan</TableHead>
                      <TableHead className="text-xs py-2 text-right">Precio</TableHead>
                      <TableHead className="text-xs py-2">Vence</TableHead>
                    </>
                  )}
                  {visibleColumns.birthday && <TableHead className="text-xs py-2">Cumple</TableHead>}
                  {visibleColumns.orders && <TableHead className="text-xs py-2 text-center">Ped.</TableHead>}
                  {visibleColumns.spent && !hidePrivateData && <TableHead className="text-xs py-2 text-right">Gastado</TableHead>}
                  <TableHead className="text-xs py-2 text-right w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedCustomers.map(customer => (
                  <TableRow key={customer.id}>
                    {visibleColumns.name && (
                      <TableCell className="py-1.5">
                        <p className="text-xs font-medium truncate max-w-[180px]">{customer.name}</p>
                        {customer.businessName && customer.businessName !== customer.name && (
                          <p className="text-[10px] text-gray-500 truncate max-w-[180px]">{customer.businessName}</p>
                        )}
                        {customer.code && (
                          <p className="text-[10px] text-gray-400 truncate max-w-[180px]">Cód: {customer.code}</p>
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.document && (
                      <TableCell className="py-1.5">
                        {customer.documentType && customer.documentNumber ? (
                          <div className="flex items-center gap-1">
                            {getDocumentBadge(customer.documentType)}
                            <span className="text-xs">{customer.documentNumber}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.contact && (
                      <TableCell className="py-1.5">
                        {customer.phone && <p className="text-xs">{customer.phone}</p>}
                        {customer.email && <p className="text-[10px] text-gray-500 truncate max-w-[150px]">{customer.email}</p>}
                      </TableCell>
                    )}
                    {visibleColumns.address && (
                      businessSettings?.posCustomFields?.showStudentField ? (
                        <>
                          <TableCell className="py-1.5">
                            <p className="text-xs">{customer.studentName || '-'}</p>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <p className="text-xs text-gray-600">{customer.studentSchedule || '-'}</p>
                          </TableCell>
                        </>
                      ) : (
                        <TableCell className="py-1.5">
                          <p className="text-xs text-gray-600 truncate max-w-[150px]">{customer.address || '-'}</p>
                        </TableCell>
                      )
                    )}
                    {businessSettings?.posCustomFields?.showVehiclePlateField && (
                      <TableCell className="py-1.5">
                        <p className="text-xs font-medium uppercase">{customer.vehiclePlate || '-'}</p>
                      </TableCell>
                    )}
                    {businessMode === 'veterinary' && (
                      <TableCell className="py-1.5">
                        {normalizePets(customer).length > 0 ? (
                          <div className="space-y-0.5">
                            {normalizePets(customer).map((pet, idx) => (
                              <div key={pet.id || idx} className="flex items-center gap-1">
                                <PawPrint className="w-3 h-3 text-primary-500 flex-shrink-0" />
                                <p className="text-xs font-medium">{pet.name}</p>
                                {pet.species && <span className="text-xs text-gray-500">({pet.species})</span>}
                                {pet.breed && <span className="text-xs text-gray-400">- {pet.breed}</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">-</p>
                        )}
                      </TableCell>
                    )}
                    {businessSettings?.posCustomFields?.showSubscriptionFields && (
                      <>
                        <TableCell className="py-1.5">
                          <p className="text-xs">{customer.subscriptionPlan || '-'}</p>
                        </TableCell>
                        <TableCell className="py-1.5 text-right">
                          <p className="text-xs">{customer.subscriptionPrice ? formatCurrency(Number(customer.subscriptionPrice)) : '-'}</p>
                        </TableCell>
                        <TableCell className="py-1.5">
                          {customer.subscriptionExpiry ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              new Date(customer.subscriptionExpiry + 'T23:59:59') < new Date()
                                ? 'bg-red-100 text-red-700'
                                : new Date(customer.subscriptionExpiry + 'T23:59:59') < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-green-100 text-green-700'
                            }`}>
                              {new Date(customer.subscriptionExpiry + 'T00:00:00').toLocaleDateString('es-PE')}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </TableCell>
                      </>
                    )}
                    {visibleColumns.birthday && (
                      <TableCell className="py-1.5">
                        {customer.birthDate ? (() => {
                          const [y, m, d] = customer.birthDate.split('-')
                          const today = new Date()
                          const isBirthdayMonth = parseInt(m) === today.getMonth() + 1
                          const isBirthdayToday = isBirthdayMonth && parseInt(d) === today.getDate()
                          return (
                            <span className={`text-xs ${isBirthdayToday ? 'font-bold text-pink-600' : isBirthdayMonth ? 'font-medium text-purple-600' : 'text-gray-600'}`}>
                              {`${d}/${m}`}
                              {isBirthdayToday && ' 🎂'}
                            </span>
                          )
                        })() : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.orders && (
                      <TableCell className="py-1.5 text-center">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                          {showAmounts ? (customer.ordersCount || 0) : '•'}
                        </span>
                      </TableCell>
                    )}
                    {visibleColumns.spent && !hidePrivateData && (
                      <TableCell className="py-1.5 text-right">
                        <span className="text-xs font-semibold text-gray-900">
                          {showAmounts ? formatCurrency(customer.totalSpent || 0) : hiddenAmount}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="py-1.5">
                      <div className="flex items-center justify-end gap-0.5">
                        {businessMode === 'veterinary' && normalizePets(customer).length > 0 && (
                          <button
                            onClick={() => setMedicalHistoryCustomer(customer)}
                            className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                            title="Historia Clínica"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(customer)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingCustomer(customer)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </>

        )}
      </Card>

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
            className="text-sm text-gray-600 hover:text-primary-600 transition-colors py-2 px-4 hover:bg-gray-50 rounded-lg"
          >
            Ver más clientes ({filteredCustomers.length - visibleCount} restantes)
          </button>
        </div>
      )}

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Tipo de Documento (opcional)"
              error={errors.documentType?.message}
              {...register('documentType')}
            >
              <option value="">Seleccionar...</option>
              <option value={ID_TYPES.DNI}>DNI</option>
              <option value={ID_TYPES.RUC}>RUC</option>
              <option value={ID_TYPES.CE}>Carnet de Extranjería</option>
              <option value={ID_TYPES.PASSPORT}>Pasaporte</option>
            </Select>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número de Documento (opcional)
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder={documentType === ID_TYPES.RUC ? '20123456789' : documentType === ID_TYPES.DNI ? '12345678' : 'Número de documento'}
                  error={errors.documentNumber?.message}
                  {...register('documentNumber')}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLookupDocument}
                  disabled={isLookingUp}
                  className="px-3"
                  title="Buscar datos en SUNAT/RENIEC"
                >
                  {isLookingUp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {errors.documentNumber?.message && (
                <p className="text-sm text-red-500 mt-1">{errors.documentNumber.message}</p>
              )}
            </div>
          </div>

          {documentType === ID_TYPES.RUC && (
            <Input
              label="Razón Social"
              placeholder="MI EMPRESA SAC"
              error={errors.businessName?.message}
              {...register('businessName')}
            />
          )}

          <Input
            label={businessMode === 'veterinary' ? 'Nombre del Dueño' : 'Nombre'}
            required
            placeholder={documentType === ID_TYPES.RUC ? 'Nombre Comercial' : businessMode === 'veterinary' ? 'Nombre del propietario de la mascota' : 'Nombre Completo'}
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label="Código (opcional)"
            placeholder="Ej: CLI-001"
            error={errors.code?.message}
            {...register('code')}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Correo Electrónico"
              type="email"
              placeholder="correo@ejemplo.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Teléfono"
              type="tel"
              placeholder="987654321"
              error={errors.phone?.message}
              {...register('phone')}
            />
          </div>

          <Input
            label="Dirección"
            placeholder="Av. Principal 123, Distrito, Lima"
            error={errors.address?.message}
            {...register('address')}
          />

          <Input
            label="Cumpleaños"
            type="date"
            error={errors.birthDate?.message}
            {...register('birthDate')}
          />

          {/* Campos Alumno y Horario - solo si está habilitado en configuración */}
          {businessSettings?.posCustomFields?.showStudentField && (
            <>
              <Input
                label="Nombre del Alumno"
                placeholder="Nombre del alumno inscrito"
                error={errors.studentName?.message}
                {...register('studentName')}
              />
              <Input
                label="Horario / Turno"
                placeholder="Ej: Lunes y Miércoles 5:00 PM"
                error={errors.studentSchedule?.message}
                {...register('studentSchedule')}
              />
            </>
          )}

          {/* Campo Placa de Vehículo - solo si está habilitado en configuración */}
          {businessSettings?.posCustomFields?.showVehiclePlateField && (
            <Input
              label="Placa de Vehículo"
              placeholder="Ej: ABC-123"
              error={errors.vehiclePlate?.message}
              {...register('vehiclePlate')}
              className="uppercase"
            />
          )}

          {/* Campos de Mascotas - solo para modo veterinaria */}
          {businessMode === 'veterinary' && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <PawPrint className="w-4 h-4" />
                  Mascotas ({pets.length})
                </h4>
                <button
                  type="button"
                  onClick={() => setPets([...pets, createEmptyPet()])}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar mascota
                </button>
              </div>
              <div className="space-y-3">
                {pets.map((pet, index) => (
                  <div key={pet.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 relative">
                    {pets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPets(pets.filter((_, i) => i !== index))}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar mascota"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="space-y-3">
                      <Input
                        label={pets.length > 1 ? `Mascota ${index + 1} - Nombre` : 'Nombre de la Mascota'}
                        placeholder="Ej: Firulais, Michi, Rocky..."
                        value={pet.name}
                        onChange={e => {
                          const updated = [...pets]
                          updated[index] = { ...updated[index], name: e.target.value }
                          setPets(updated)
                        }}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Especie</label>
                          <select
                            value={pet.species}
                            onChange={e => {
                              const updated = [...pets]
                              updated[index] = { ...updated[index], species: e.target.value }
                              setPets(updated)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          >
                            <option value="">Seleccionar...</option>
                            <option value="Perro">Perro</option>
                            <option value="Gato">Gato</option>
                            <option value="Ave">Ave</option>
                            <option value="Conejo">Conejo</option>
                            <option value="Hamster">Hamster</option>
                            <option value="Pez">Pez</option>
                            <option value="Reptil">Reptil</option>
                            <option value="Otro">Otro</option>
                          </select>
                        </div>
                        <Input
                          label="Raza"
                          placeholder="Ej: Labrador, Siamés..."
                          value={pet.breed}
                          onChange={e => {
                            const updated = [...pets]
                            updated[index] = { ...updated[index], breed: e.target.value }
                            setPets(updated)
                          }}
                        />
                        <Input
                          label="Edad"
                          placeholder="Ej: 3 años, 6 meses"
                          value={pet.age}
                          onChange={e => {
                            const updated = [...pets]
                            updated[index] = { ...updated[index], age: e.target.value }
                            setPets(updated)
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                          label="Peso"
                          placeholder="Ej: 5 kg, 500 gr"
                          value={pet.weight}
                          onChange={e => {
                            const updated = [...pets]
                            updated[index] = { ...updated[index], weight: e.target.value }
                            setPets(updated)
                          }}
                        />
                        <Input
                          label="Notas / Observaciones"
                          placeholder="Alergias, condiciones, etc."
                          value={pet.notes}
                          onChange={e => {
                            const updated = [...pets]
                            updated[index] = { ...updated[index], notes: e.target.value }
                            setPets(updated)
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nivel de precio - solo si está habilitado múltiples precios */}
          {businessSettings?.multiplePricesEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nivel de Precio
              </label>
              <select
                {...register('priceLevel')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Sin nivel asignado</option>
                <option value="price1">{businessSettings?.priceLabels?.price1 || 'Precio 1'}</option>
                <option value="price2">{businessSettings?.priceLabels?.price2 || 'Precio 2'}</option>
                <option value="price3">{businessSettings?.priceLabels?.price3 || 'Precio 3'}</option>
                <option value="price4">{businessSettings?.priceLabels?.price4 || 'Precio 4'}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Si asignas un nivel, el cliente verá automáticamente ese precio en el POS.
              </p>
            </div>
          )}

          {/* Campos de suscripción - solo si está habilitado */}
          {businessSettings?.posCustomFields?.showSubscriptionFields && (
            <>
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" />
                  Suscripción
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Plan"
                    placeholder="Ej: Premium, Básico"
                    error={errors.subscriptionPlan?.message}
                    {...register('subscriptionPlan')}
                  />
                  <Input
                    label="Precio"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    error={errors.subscriptionPrice?.message}
                    {...register('subscriptionPrice')}
                  />
                  <Input
                    label="Fecha de Vencimiento"
                    type="date"
                    error={errors.subscriptionExpiry?.message}
                    {...register('subscriptionExpiry')}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>{editingCustomer ? 'Actualizar' : 'Crear'} Cliente</>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingCustomer}
        onClose={() => setDeletingCustomer(null)}
        title="Eliminar Cliente"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar al cliente{' '}
                <strong>{deletingCustomer?.name}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción no se puede deshacer.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingCustomer(null)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>Eliminar</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Historia Clínica (Veterinaria) */}
      {medicalHistoryCustomer && (
        <MedicalHistoryModal
          isOpen={!!medicalHistoryCustomer}
          onClose={() => setMedicalHistoryCustomer(null)}
          customer={medicalHistoryCustomer}
          businessId={getBusinessId()}
        />
      )}
    </div>
  )
}
