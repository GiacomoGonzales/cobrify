import React, { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, Timestamp, arrayUnion } from 'firebase/firestore'
import { PLANS, updateUserFeatures } from '@/services/subscriptionService'
import UserDetailsModal from '@/components/admin/UserDetailsModal'
import { useToast } from '@/contexts/ToastContext'
import {
  Users,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Eye,
  Ban,
  CheckCircle,
  Clock,
  AlertTriangle,
  Mail,
  Building2,
  Calendar,
  CreditCard,
  MoreVertical,
  X,
  Plus,
  Edit2,
  Trash2,
  UserPlus,
  Shield,
  Settings,
  Key,
  FileKey,
  Save,
  Loader2,
  Image,
  Sparkles,
  DollarSign,
  Receipt,
  Upload
} from 'lucide-react'

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-blue-100 text-blue-800',
  suspended: 'bg-red-100 text-red-800',
  expired: 'bg-yellow-100 text-yellow-800'
}

const STATUS_LABELS = {
  active: 'Activo',
  trial: 'Trial',
  suspended: 'Suspendido',
  expired: 'Vencido'
}

export default function AdminUsers() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [sortField, setSortField] = useState('createdAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [actionMenuUser, setActionMenuUser] = useState(null)

  // Estados para modal de configuración SUNAT
  const [showSunatModal, setShowSunatModal] = useState(false)
  const [sunatUserToEdit, setSunatUserToEdit] = useState(null)
  const [savingSunat, setSavingSunat] = useState(false)
  const [loadingSunatConfig, setLoadingSunatConfig] = useState(false)
  const [sunatForm, setSunatForm] = useState({
    emissionMethod: 'none',
    // QPse
    qpseUsuario: '',
    qpsePassword: '',
    qpseEnvironment: 'demo',
    // SUNAT Directo
    solUser: '',
    solPassword: '',
    clientId: '',
    clientSecret: '',
    certificatePassword: '',
    certificateName: '',
    sunatEnvironment: 'beta',
    // Configuración tributaria
    igvExempt: false,
    igvRate: 18
  })
  const [showPasswords, setShowPasswords] = useState({
    qpse: false,
    sol: false,
    cert: false,
    api: false
  })
  const [certificateFile, setCertificateFile] = useState(null)

  // Estados para modal de features
  const [showFeaturesModal, setShowFeaturesModal] = useState(false)
  const [featuresUserToEdit, setFeaturesUserToEdit] = useState(null)
  const [savingFeatures, setSavingFeatures] = useState(false)
  const [featuresForm, setFeaturesForm] = useState({
    productImages: false,
    hidePaymentMethods: false,
    expenseManagement: false
  })

  // Estados para modal de pagos y planes
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [paymentUserToEdit, setPaymentUserToEdit] = useState(null)
  const [processingPayment, setProcessingPayment] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      // Obtener subscriptions, businesses y users en paralelo
      const [subscriptionsSnapshot, businessesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(collection(db, 'subscriptions')),
        getDocs(collection(db, 'businesses')),
        getDocs(collection(db, 'users'))
      ])

      // Crear mapa de businesses por ID para acceso rápido
      const businessesMap = {}
      businessesSnapshot.forEach(doc => {
        businessesMap[doc.id] = doc.data()
      })

      // Contar sub-usuarios por ownerId
      const subUsersCountMap = {}
      const subUsersByOwner = {}
      usersSnapshot.forEach(doc => {
        const data = doc.data()
        if (data.ownerId) {
          subUsersCountMap[data.ownerId] = (subUsersCountMap[data.ownerId] || 0) + 1
          if (!subUsersByOwner[data.ownerId]) {
            subUsersByOwner[data.ownerId] = []
          }
          subUsersByOwner[data.ownerId].push({
            id: doc.id,
            email: data.email,
            displayName: data.displayName,
            isActive: data.isActive,
            allowedPages: data.allowedPages || [],
            createdAt: data.createdAt?.toDate?.()
          })
        }
      })

      const usersData = []
      const now = new Date()

      subscriptionsSnapshot.forEach(doc => {
        const data = doc.data()

        // Excluir sub-usuarios (ya no deberían existir en subscriptions)
        if (data.ownerId) return

        // Obtener datos del negocio
        const business = businessesMap[doc.id] || {}

        const createdAt = data.createdAt?.toDate?.() || data.startDate?.toDate?.()
        const periodEnd = data.currentPeriodEnd?.toDate?.()

        // Determinar estado real
        let status = 'active'
        if (data.status === 'suspended' || data.accessBlocked) {
          status = 'suspended'
        } else if (data.plan === 'trial' || data.plan === 'free') {
          status = 'trial'
        } else if (periodEnd && periodEnd < now) {
          status = 'expired'
        }

        // Determinar método de emisión
        // Prioridad: qpse/sunat raíz > emissionConfig.method > emissionConfig.qpse/sunat
        let emissionMethod = 'none'
        if (business.qpse?.enabled || business.qpse?.usuario) {
          emissionMethod = 'qpse'
        } else if (business.sunat?.enabled || business.sunat?.solUser) {
          emissionMethod = 'sunat_direct'
        } else if (business.emissionConfig?.method) {
          emissionMethod = business.emissionConfig.method
        } else if (business.emissionConfig?.qpse?.enabled || business.emissionConfig?.qpse?.usuario) {
          emissionMethod = 'qpse'
        } else if (business.emissionConfig?.sunat?.enabled || business.emissionConfig?.sunat?.solUser) {
          emissionMethod = 'sunat_direct'
        } else if (business.emissionMethod) {
          emissionMethod = business.emissionMethod
        }

        usersData.push({
          id: doc.id,
          userId: doc.id, // Alias para compatibilidad con UserDetailsModal
          email: data.email || 'N/A',
          businessName: business.razonSocial || business.businessName || data.businessName || 'Sin nombre',
          ruc: business.ruc || data.ruc || null,
          phone: business.phone || null,
          address: business.address || null,
          emissionMethod: emissionMethod,
          businessMode: business.businessMode || 'retail',
          plan: data.plan || 'unknown',
          status,
          createdAt,
          periodEnd,
          // Campos adicionales para UserDetailsModal
          currentPeriodEnd: data.currentPeriodEnd,
          currentPeriodStart: data.currentPeriodStart,
          lastCounterReset: data.lastCounterReset,
          monthlyPrice: PLANS[data.plan]?.pricePerMonth || 0,
          limits: data.limits || PLANS[data.plan]?.limits || {},
          usage: data.usage || { invoicesThisMonth: 0 },
          paymentHistory: data.paymentHistory || [],
          blockReason: data.blockReason || null,
          // Campos originales
          limit: PLANS[data.plan]?.limits?.maxInvoicesPerMonth || 0, // -1 = ilimitado
          accessBlocked: data.accessBlocked || false,
          lastPayment: data.paymentHistory?.slice(-1)[0]?.date?.toDate?.() || null,
          subUsersCount: subUsersCountMap[doc.id] || 0,
          subUsers: subUsersByOwner[doc.id] || [],
          features: data.features || { productImages: false }
        })
      })

      setUsers(usersData)
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filtrar y ordenar usuarios
  const filteredUsers = useMemo(() => {
    let result = [...users]

    // Filtro de búsqueda
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      result = result.filter(u =>
        u.email?.toLowerCase().includes(search) ||
        u.businessName?.toLowerCase().includes(search) ||
        u.ruc?.includes(search)
      )
    }

    // Filtro de estado
    if (statusFilter !== 'all') {
      result = result.filter(u => u.status === statusFilter)
    }

    // Filtro de plan
    if (planFilter !== 'all') {
      result = result.filter(u => u.plan === planFilter)
    }

    // Ordenar
    result.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (aVal instanceof Date) aVal = aVal.getTime()
      if (bVal instanceof Date) bVal = bVal.getTime()

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [users, searchTerm, statusFilter, planFilter, sortField, sortDirection])

  // Estadísticas rápidas
  const stats = useMemo(() => {
    return {
      total: users.length,
      active: users.filter(u => u.status === 'active').length,
      trial: users.filter(u => u.status === 'trial').length,
      suspended: users.filter(u => u.status === 'suspended').length,
      expired: users.filter(u => u.status === 'expired').length
    }
  }, [users])

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  async function toggleUserAccess(userId, block) {
    try {
      await updateDoc(doc(db, 'subscriptions', userId), {
        accessBlocked: block,
        status: block ? 'suspended' : 'active'
      })
      loadUsers()
      setActionMenuUser(null)
    } catch (error) {
      console.error('Error updating user:', error)
    }
  }

  function exportToCSV() {
    const headers = ['Email', 'Negocio', 'RUC', 'Plan', 'Estado', 'Creado', 'Uso', 'Límite']
    const rows = filteredUsers.map(u => [
      u.email,
      u.businessName,
      u.ruc,
      PLANS[u.plan]?.name || u.plan,
      STATUS_LABELS[u.status],
      u.createdAt?.toLocaleDateString() || 'N/A',
      u.usage?.invoicesThisMonth || 0,
      u.limit === -1 || u.limit === 0 ? 'Ilimitado' : u.limit
    ])

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usuarios_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // Abrir modal de configuración SUNAT
  async function openSunatConfig(user) {
    setSunatUserToEdit(user)
    setShowSunatModal(true)
    setLoadingSunatConfig(true)

    // Cargar configuración actual del negocio
    try {
      const businessRef = doc(db, 'businesses', user.id)
      const businessSnap = await getDoc(businessRef)

      if (businessSnap.exists()) {
        const businessData = businessSnap.data()
        console.log('📋 Datos del negocio cargados:', businessData)

        // Determinar método de emisión
        // Prioridad: qpse/sunat raíz > emissionConfig.method > emissionConfig.qpse/sunat
        let method = 'none'
        if (businessData.qpse?.enabled || businessData.qpse?.usuario) {
          method = 'qpse'
        } else if (businessData.sunat?.enabled || businessData.sunat?.solUser) {
          method = 'sunat_direct'
        } else if (businessData.emissionConfig?.method) {
          method = businessData.emissionConfig.method
        } else if (businessData.emissionConfig?.qpse?.enabled || businessData.emissionConfig?.qpse?.usuario) {
          method = 'qpse'
        } else if (businessData.emissionConfig?.sunat?.enabled || businessData.emissionConfig?.sunat?.solUser) {
          method = 'sunat_direct'
        } else if (businessData.emissionMethod) {
          method = businessData.emissionMethod
        }

        // Obtener datos de qpse/sunat (prioridad: raíz > emissionConfig)
        const qpseData = businessData.qpse || businessData.emissionConfig?.qpse || {}
        const sunatData = businessData.sunat || businessData.emissionConfig?.sunat || {}
        const taxConfig = businessData.emissionConfig?.taxConfig || businessData.taxConfig || {}

        console.log('📋 Método detectado:', method)
        console.log('📋 emissionConfig:', businessData.emissionConfig)
        console.log('📋 QPse data:', qpseData)
        console.log('📋 SUNAT data:', sunatData)

        // Normalizar environment (produccion -> production para QPse)
        const normalizeEnv = (env) => {
          if (env === 'production') return 'production'
          if (env === 'produccion') return 'production'
          return env || 'demo'
        }

        const normalizeSunatEnv = (env) => {
          if (env === 'production' || env === 'produccion') return 'production'
          return env || 'beta'
        }

        setSunatForm({
          emissionMethod: method,
          // QPse
          qpseUsuario: qpseData.usuario || '',
          qpsePassword: qpseData.password || '',
          qpseEnvironment: normalizeEnv(qpseData.environment),
          // SUNAT Directo
          solUser: sunatData.solUser || '',
          solPassword: sunatData.solPassword || '',
          clientId: sunatData.clientId || '',
          clientSecret: sunatData.clientSecret || '',
          certificatePassword: sunatData.certificatePassword || '',
          certificateName: sunatData.certificateName || '',
          sunatEnvironment: normalizeSunatEnv(sunatData.environment),
          // Configuración tributaria
          igvExempt: taxConfig.igvExempt || false,
          igvRate: taxConfig.igvRate || 18
        })
      } else {
        console.warn('⚠️ No se encontró documento de negocio para:', user.id)
        // Valores por defecto si no existe el negocio
        setSunatForm({
          emissionMethod: 'none',
          qpseUsuario: '',
          qpsePassword: '',
          qpseEnvironment: 'demo',
          solUser: '',
          solPassword: '',
          certificatePassword: '',
          certificateName: '',
          sunatEnvironment: 'beta',
          igvExempt: false,
          igvRate: 18
        })
      }
    } catch (error) {
      console.error('Error loading SUNAT config:', error)
      // Valores por defecto en caso de error
      setSunatForm({
        emissionMethod: 'none',
        qpseUsuario: '',
        qpsePassword: '',
        qpseEnvironment: 'demo',
        solUser: '',
        solPassword: '',
        certificatePassword: '',
        certificateName: '',
        sunatEnvironment: 'beta',
        igvExempt: false,
        igvRate: 18
      })
    } finally {
      setLoadingSunatConfig(false)
    }
  }

  // Manejar subida de certificado
  const handleCertificateUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.name.endsWith('.pfx') || file.name.endsWith('.p12')) {
        setCertificateFile(file)
        setSunatForm(prev => ({
          ...prev,
          certificateName: file.name,
        }))
      } else {
        alert('El archivo debe ser un certificado .pfx o .p12')
      }
    }
  }

  // Eliminar certificado
  const handleRemoveCertificate = () => {
    setCertificateFile(null)
    setSunatForm(prev => ({
      ...prev,
      certificateName: '',
      certificatePassword: '',
    }))
  }

  // Guardar configuración SUNAT
  async function saveSunatConfig() {
    if (!sunatUserToEdit) return

    setSavingSunat(true)
    try {
      const businessRef = doc(db, 'businesses', sunatUserToEdit.id)

      // Primero obtener los datos actuales para preservar taxConfig
      const currentDoc = await getDoc(businessRef)
      const currentData = currentDoc.exists() ? currentDoc.data() : {}
      const currentEmissionConfig = currentData.emissionConfig || {}

      const updateData = {
        updatedAt: Timestamp.now()
      }

      // Construir emissionConfig
      const emissionConfig = {
        method: sunatForm.emissionMethod,
        taxConfig: {
          igvExempt: sunatForm.igvExempt,
          igvRate: sunatForm.igvRate,
          includeIgv: !sunatForm.igvExempt
        }
      }

      if (sunatForm.emissionMethod === 'qpse') {
        const qpseData = {
          enabled: true,
          usuario: sunatForm.qpseUsuario,
          password: sunatForm.qpsePassword,
          environment: sunatForm.qpseEnvironment,
          firmasDisponibles: currentEmissionConfig.qpse?.firmasDisponibles || currentData.qpse?.firmasDisponibles || 500,
          firmasUsadas: currentEmissionConfig.qpse?.firmasUsadas || currentData.qpse?.firmasUsadas || 0
        }
        emissionConfig.qpse = qpseData
        emissionConfig.sunat = { enabled: false }
        // También guardar en raíz para compatibilidad
        updateData.qpse = qpseData
        updateData.sunat = { enabled: false }
      } else if (sunatForm.emissionMethod === 'sunat_direct') {
        // Preparar datos de SUNAT
        const sunatData = {
          enabled: true,
          solUser: sunatForm.solUser,
          solPassword: sunatForm.solPassword,
          clientId: sunatForm.clientId,
          clientSecret: sunatForm.clientSecret,
          certificatePassword: sunatForm.certificatePassword,
          environment: sunatForm.sunatEnvironment,
          homologated: sunatForm.sunatEnvironment === 'production',
          certificateName: sunatForm.certificateName || currentEmissionConfig.sunat?.certificateName || '',
          certificateData: currentEmissionConfig.sunat?.certificateData || null
        }

        // Si hay un nuevo archivo de certificado, convertirlo a base64
        if (certificateFile) {
          try {
            const certificateBase64 = await new Promise((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => {
                // Extraer solo la parte base64 (sin el prefijo data:...)
                const base64 = reader.result.split(',')[1]
                resolve(base64)
              }
              reader.onerror = reject
              reader.readAsDataURL(certificateFile)
            })

            sunatData.certificateData = certificateBase64
            console.log('✅ Certificado convertido a base64 (' + certificateBase64.length + ' caracteres)')
          } catch (certError) {
            console.error('Error al leer certificado:', certError)
            throw new Error('Error al procesar el certificado digital')
          }
        } else if (!sunatForm.certificateName) {
          // Si no hay nombre de certificado, eliminar el certificateData
          sunatData.certificateData = null
        }

        emissionConfig.sunat = sunatData
        emissionConfig.qpse = { enabled: false }
        // También guardar en raíz para compatibilidad
        updateData.sunat = sunatData
        updateData.qpse = { enabled: false }
      } else {
        emissionConfig.qpse = { enabled: false }
        emissionConfig.sunat = { enabled: false }
        updateData.qpse = { enabled: false }
        updateData.sunat = { enabled: false }
      }

      updateData.emissionConfig = emissionConfig

      await updateDoc(businessRef, updateData)

      // Actualizar también el plan del usuario si cambió el método
      if (sunatForm.emissionMethod === 'qpse') {
        // Verificar si tiene plan qpse, si no asignar uno
        const currentPlan = users.find(u => u.id === sunatUserToEdit.id)?.plan
        if (!currentPlan?.includes('qpse')) {
          await updateDoc(doc(db, 'subscriptions', sunatUserToEdit.id), {
            plan: 'qpse_1_month',
            limits: PLANS['qpse_1_month'].limits
          })
        }
      } else if (sunatForm.emissionMethod === 'sunat_direct') {
        const currentPlan = users.find(u => u.id === sunatUserToEdit.id)?.plan
        if (!currentPlan?.includes('sunat_direct')) {
          await updateDoc(doc(db, 'subscriptions', sunatUserToEdit.id), {
            plan: 'sunat_direct_1_month',
            limits: PLANS['sunat_direct_1_month'].limits
          })
        }
      }

      setShowSunatModal(false)
      setSunatUserToEdit(null)
      setCertificateFile(null) // Limpiar archivo temporal
      loadUsers()
      alert('Configuración guardada correctamente')
    } catch (error) {
      console.error('Error saving SUNAT config:', error)
      alert('Error al guardar la configuración')
    } finally {
      setSavingSunat(false)
    }
  }

  // Abrir modal de features
  function openFeaturesModal(user) {
    setFeaturesUserToEdit(user)
    setFeaturesForm({
      productImages: user.features?.productImages || false,
      hidePaymentMethods: user.features?.hidePaymentMethods || false,
      expenseManagement: user.features?.expenseManagement || false
    })
    setShowFeaturesModal(true)
  }

  // Guardar features
  async function saveFeatures() {
    if (!featuresUserToEdit) return

    setSavingFeatures(true)
    try {
      await updateUserFeatures(featuresUserToEdit.id, featuresForm)
      setShowFeaturesModal(false)
      setFeaturesUserToEdit(null)
      loadUsers()
      alert('Features actualizados correctamente')
    } catch (error) {
      console.error('Error saving features:', error)
      alert('Error al guardar features')
    } finally {
      setSavingFeatures(false)
    }
  }

  // Función para registrar pago
  async function handleRegisterPayment(userId, amount, method, planKey, customEndDate = null) {
    setProcessingPayment(true)
    try {
      const plan = PLANS[planKey]
      if (!plan) {
        toast.error('Plan no válido')
        return
      }

      const subscriptionRef = doc(db, 'subscriptions', userId)
      const subscriptionDoc = await getDoc(subscriptionRef)
      const currentData = subscriptionDoc.exists() ? subscriptionDoc.data() : {}

      // Calcular nueva fecha de vencimiento
      let newEndDate
      if (customEndDate) {
        // Usar fecha personalizada
        newEndDate = new Date(customEndDate)
      } else {
        // Calcular desde la fecha actual o desde el vencimiento actual si aún no venció
        const currentEnd = currentData.currentPeriodEnd?.toDate?.() || new Date()
        const baseDate = currentEnd > new Date() ? currentEnd : new Date()
        newEndDate = new Date(baseDate)
        newEndDate.setMonth(newEndDate.getMonth() + plan.months)
      }

      // Crear registro de pago
      const paymentRecord = {
        date: Timestamp.now(),
        amount: parseFloat(amount),
        method: method,
        plan: planKey,
        planName: plan.name,
        months: plan.months,
        status: 'completed',
        registeredBy: 'admin'
      }

      // Actualizar suscripción
      await updateDoc(subscriptionRef, {
        plan: planKey,
        status: 'active',
        currentPeriodStart: Timestamp.now(),
        currentPeriodEnd: Timestamp.fromDate(newEndDate),
        limits: plan.limits,
        paymentHistory: arrayUnion(paymentRecord),
        updatedAt: Timestamp.now()
      })

      toast.success(`Pago registrado. Nuevo vencimiento: ${newEndDate.toLocaleDateString('es-PE')}`)
      setShowPaymentModal(false)
      setPaymentUserToEdit(null)
      loadUsers()
    } catch (error) {
      console.error('Error al registrar pago:', error)
      toast.error('Error al registrar el pago')
    } finally {
      setProcessingPayment(false)
    }
  }

  // Función para cambiar plan
  async function handleChangePlan(userId, newPlanKey) {
    try {
      const plan = PLANS[newPlanKey]
      if (!plan) {
        toast.error('Plan no válido')
        return
      }

      const subscriptionRef = doc(db, 'subscriptions', userId)
      await updateDoc(subscriptionRef, {
        plan: newPlanKey,
        limits: plan.limits,
        updatedAt: Timestamp.now()
      })

      toast.success(`Plan cambiado a ${plan.name}`)
      setShowPlanModal(false)
      setPaymentUserToEdit(null)
      loadUsers()
    } catch (error) {
      console.error('Error al cambiar plan:', error)
      toast.error('Error al cambiar el plan')
    }
  }

  // Función para abrir modal de pago
  function openPaymentModal(user) {
    setPaymentUserToEdit(user)
    setShowPaymentModal(true)
    setSelectedUser(null)
  }

  // Función para abrir modal de cambio de plan
  function openPlanModal(user) {
    setPaymentUserToEdit(user)
    setShowPlanModal(true)
    setSelectedUser(null)
  }

  function formatDate(date) {
    if (!date) return 'N/A'
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ?
      <ChevronUp className="w-4 h-4" /> :
      <ChevronDown className="w-4 h-4" />
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4">
        <div className="bg-white rounded-xl p-2 sm:p-4 shadow-sm border border-gray-200">
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-1">
            <Users className="w-5 h-5 sm:w-8 sm:h-8 text-gray-400" />
            <span className="text-lg sm:text-2xl font-bold text-gray-900">{stats.total}</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 text-center sm:text-left">Total</p>
        </div>
        <div className="bg-white rounded-xl p-2 sm:p-4 shadow-sm border border-green-200">
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-1">
            <CheckCircle className="w-5 h-5 sm:w-8 sm:h-8 text-green-500" />
            <span className="text-lg sm:text-2xl font-bold text-green-600">{stats.active}</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 text-center sm:text-left">Activos</p>
        </div>
        <div className="bg-white rounded-xl p-2 sm:p-4 shadow-sm border border-blue-200">
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-1">
            <Clock className="w-5 h-5 sm:w-8 sm:h-8 text-blue-500" />
            <span className="text-lg sm:text-2xl font-bold text-blue-600">{stats.trial}</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 text-center sm:text-left">Trial</p>
        </div>
        <div className="bg-white rounded-xl p-2 sm:p-4 shadow-sm border border-yellow-200 hidden sm:block">
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-1">
            <AlertTriangle className="w-5 h-5 sm:w-8 sm:h-8 text-yellow-500" />
            <span className="text-lg sm:text-2xl font-bold text-yellow-600">{stats.expired}</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 text-center sm:text-left">Vencidos</p>
        </div>
        <div className="bg-white rounded-xl p-2 sm:p-4 shadow-sm border border-red-200 hidden sm:block">
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-1">
            <Ban className="w-5 h-5 sm:w-8 sm:h-8 text-red-500" />
            <span className="text-lg sm:text-2xl font-bold text-red-600">{stats.suspended}</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 text-center sm:text-left">Suspendidos</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="flex-1 sm:flex-none px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Estado</option>
              <option value="active">Activos</option>
              <option value="trial">Trial</option>
              <option value="expired">Vencidos</option>
              <option value="suspended">Suspendidos</option>
            </select>

            <select
              value={planFilter}
              onChange={e => setPlanFilter(e.target.value)}
              className="flex-1 sm:flex-none px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Plan</option>
              {Object.entries(PLANS).map(([key, plan]) => (
                <option key={key} value={key}>{plan.name}</option>
              ))}
            </select>

            <button
              onClick={loadUsers}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Recargar"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={exportToCSV}
              className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs sm:text-sm"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-2 sm:mt-3 text-xs sm:text-sm text-gray-500">
          {filteredUsers.length} de {users.length} usuarios
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Vista móvil - Cards */}
        <div className="sm:hidden">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">Cargando...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No se encontraron usuarios</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredUsers.map(user => (
                <div
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="p-3 hover:bg-gray-50 active:bg-gray-100 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">{user.businessName}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[user.status]}`}>
                        {STATUS_LABELS[user.status]}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{PLANS[user.plan]?.name || user.plan}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vista desktop - Tabla */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('businessName')}
                >
                  <div className="flex items-center gap-1">
                    Negocio <SortIcon field="businessName" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center gap-1">
                    Email <SortIcon field="email" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('plan')}
                >
                  <div className="flex items-center gap-1">
                    Plan <SortIcon field="plan" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Estado <SortIcon field="status" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('usage')}
                >
                  <div className="flex items-center gap-1">
                    Uso <SortIcon field="usage" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center gap-1">
                    Creado <SortIcon field="createdAt" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                    <p className="text-gray-500">Cargando usuarios...</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No se encontraron usuarios</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedUser(user)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.businessName}</p>
                          {user.ruc && <p className="text-xs text-gray-500">RUC: {user.ruc}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        {PLANS[user.plan]?.name || user.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[user.status]}`}>
                        {STATUS_LABELS[user.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden w-20">
                          <div
                            className={`h-full rounded-full ${
                              user.limit > 0 && (user.usage?.invoicesThisMonth || 0) / user.limit > 0.9
                                ? 'bg-red-500'
                                : user.limit > 0 && (user.usage?.invoicesThisMonth || 0) / user.limit > 0.7
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: user.limit > 0 ? `${Math.min(((user.usage?.invoicesThisMonth || 0) / user.limit) * 100, 100)}%` : '10%' }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {user.usage?.invoicesThisMonth || 0}/{user.limit === -1 || user.limit === 0 ? '∞' : user.limit}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setActionMenuUser(actionMenuUser === user.id ? null : user.id)
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <MoreVertical className="w-5 h-5 text-gray-400" />
                        </button>

                        {actionMenuUser === user.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setSelectedUser(user)
                                setActionMenuUser(null)
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Eye className="w-4 h-4" /> Ver detalles
                            </button>
                            {user.status !== 'suspended' ? (
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  toggleUserAccess(user.id, true)
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                              >
                                <Ban className="w-4 h-4" /> Suspender
                              </button>
                            ) : (
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  toggleUserAccess(user.id, false)
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2"
                              >
                                <CheckCircle className="w-4 h-4" /> Reactivar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-hidden">
          <div className="bg-white rounded-xl sm:rounded-2xl w-full max-w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Detalles del Usuario</h2>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Header */}
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">{selectedUser.businessName}</h3>
                  <p className="text-sm text-gray-500 truncate">{selectedUser.email}</p>
                  <div className="flex flex-wrap gap-1 sm:gap-2 mt-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedUser.status]}`}>
                      {STATUS_LABELS[selectedUser.status]}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      {PLANS[selectedUser.plan]?.name || selectedUser.plan}
                    </span>
                  </div>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 mb-1">
                    <CreditCard className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="text-xs sm:text-sm">RUC</span>
                  </div>
                  <p className="font-medium text-xs sm:text-base truncate">{selectedUser.ruc || 'Sin configurar'}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 mb-1">
                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="text-xs sm:text-sm">Registro</span>
                  </div>
                  <p className="font-medium text-xs sm:text-base">{formatDate(selectedUser.createdAt)}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 mb-1">
                    <Building2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="text-xs sm:text-sm">Tipo</span>
                  </div>
                  <p className="font-medium text-xs sm:text-base capitalize">{selectedUser.businessMode === 'restaurant' ? 'Restaurante' : 'Retail'}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 mb-1">
                    <Shield className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="text-xs sm:text-sm">Emisión</span>
                  </div>
                  <p className="font-medium text-xs sm:text-base">
                    {selectedUser.emissionMethod === 'qpse' ? 'QPse' :
                     selectedUser.emissionMethod === 'sunat_direct' ? 'SUNAT' :
                     selectedUser.emissionMethod === 'nubefact' ? 'NubeFact' : 'Sin config.'}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 mb-1">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="text-xs sm:text-sm">Vence</span>
                  </div>
                  <p className="font-medium text-xs sm:text-base">{formatDate(selectedUser.periodEnd)}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 mb-1">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="text-xs sm:text-sm">Sub-usuarios</span>
                  </div>
                  <p className="font-medium text-xs sm:text-base">{selectedUser.subUsersCount}</p>
                </div>
              </div>

              {/* Usage */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Uso este mes</span>
                  <span className="font-medium">
                    {selectedUser.usage?.invoicesThisMonth || 0} / {selectedUser.limit === -1 || selectedUser.limit === 0 ? '∞' : selectedUser.limit} documentos
                  </span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      selectedUser.limit > 0 && (selectedUser.usage?.invoicesThisMonth || 0) / selectedUser.limit > 0.9
                        ? 'bg-red-500'
                        : selectedUser.limit > 0 && (selectedUser.usage?.invoicesThisMonth || 0) / selectedUser.limit > 0.7
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: selectedUser.limit > 0 ? `${Math.min(((selectedUser.usage?.invoicesThisMonth || 0) / selectedUser.limit) * 100, 100)}%` : '5%' }}
                  />
                </div>
              </div>

              {/* Sub-usuarios */}
              {selectedUser.subUsers && selectedUser.subUsers.length > 0 && (
                <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                  <div className="flex items-center gap-2 text-indigo-700 mb-3">
                    <Users className="w-5 h-5" />
                    <span className="font-medium">Sub-usuarios ({selectedUser.subUsers.length})</span>
                  </div>
                  <div className="space-y-2">
                    {selectedUser.subUsers.map((subUser, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3">
                        <div>
                          <p className="font-medium text-gray-900">{subUser.displayName || subUser.email}</p>
                          <p className="text-xs text-gray-500">{subUser.email}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          subUser.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {subUser.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                <button
                  onClick={() => openPaymentModal(selectedUser)}
                  className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs sm:text-sm"
                >
                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Registrar</span> Pago
                </button>

                <button
                  onClick={() => openPlanModal(selectedUser)}
                  className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs sm:text-sm"
                >
                  <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Cambiar</span> Plan
                </button>

                <button
                  onClick={() => {
                    openSunatConfig(selectedUser)
                  }}
                  className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 text-xs sm:text-sm"
                >
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                  SUNAT
                </button>

                <button
                  onClick={() => {
                    openFeaturesModal(selectedUser)
                  }}
                  className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-xs sm:text-sm"
                >
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                  Features
                  {selectedUser.features?.productImages && (
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  )}
                </button>

                {selectedUser.status !== 'suspended' ? (
                  <button
                    onClick={() => {
                      toggleUserAccess(selectedUser.id, true)
                      setSelectedUser(null)
                    }}
                    className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-xs sm:text-sm"
                  >
                    <Ban className="w-4 h-4 sm:w-5 sm:h-5" />
                    Suspender
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      toggleUserAccess(selectedUser.id, false)
                      setSelectedUser(null)
                    }}
                    className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs sm:text-sm"
                  >
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                    Reactivar
                  </button>
                )}

                </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {actionMenuUser && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setActionMenuUser(null)}
        />
      )}

      {/* Modal de Configuración SUNAT */}
      {showSunatModal && sunatUserToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-hidden">
          <div className="bg-white rounded-xl sm:rounded-2xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-gray-900">Configurar Emisión</h2>
                <p className="text-xs sm:text-sm text-gray-500 truncate">{sunatUserToEdit.businessName}</p>
              </div>
              <button
                onClick={() => {
                  setShowSunatModal(false)
                  setSunatUserToEdit(null)
                  setCertificateFile(null)
                }}
                className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Loading state */}
              {loadingSunatConfig ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                  <p className="text-gray-500">Cargando configuración...</p>
                </div>
              ) : (
              <>
              {/* Configuración Tributaria */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200 space-y-4">
                <div className="flex items-center gap-2 text-green-700">
                  <CreditCard className="w-5 h-5" />
                  <span className="font-medium">Configuración Tributaria</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Exonerado de IGV</label>
                    <p className="text-xs text-gray-500">Marcar si la empresa está exonerada del IGV</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sunatForm.igvExempt}
                      onChange={e => setSunatForm({ ...sunatForm, igvExempt: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>

                {sunatForm.igvExempt && (
                  <div className="flex items-center gap-2 p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700 font-medium">Esta empresa NO cobra IGV en sus ventas</span>
                  </div>
                )}

                {!sunatForm.igvExempt && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tasa de IGV (%)
                    </label>
                    <input
                      type="number"
                      value={sunatForm.igvRate}
                      onChange={e => setSunatForm({ ...sunatForm, igvRate: parseFloat(e.target.value) || 18 })}
                      min="0"
                      max="100"
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                )}
              </div>

              {/* Selector de método */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Método de Emisión
                </label>
                <select
                  value={sunatForm.emissionMethod}
                  onChange={e => setSunatForm({ ...sunatForm, emissionMethod: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="none">Sin configurar</option>
                  <option value="qpse">QPse (500 docs/mes)</option>
                  <option value="sunat_direct">SUNAT Directo (Ilimitado)</option>
                </select>
              </div>

              {/* Configuración QPse */}
              {sunatForm.emissionMethod === 'qpse' && (
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 space-y-4">
                  <div className="flex items-center gap-2 text-amber-700">
                    <FileKey className="w-5 h-5" />
                    <span className="font-medium">Configuración QPse</span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ambiente
                    </label>
                    <select
                      value={sunatForm.qpseEnvironment}
                      onChange={e => setSunatForm({ ...sunatForm, qpseEnvironment: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="demo">Demo (Pruebas)</option>
                      <option value="production">Producción</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Usuario QPse
                    </label>
                    <input
                      type="text"
                      value={sunatForm.qpseUsuario}
                      onChange={e => setSunatForm({ ...sunatForm, qpseUsuario: e.target.value })}
                      placeholder="usuario@empresa.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contraseña QPse
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.qpse ? 'text' : 'password'}
                        value={sunatForm.qpsePassword}
                        onChange={e => setSunatForm({ ...sunatForm, qpsePassword: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, qpse: !showPasswords.qpse })}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Estado de homologación QPse - derivado del ambiente */}
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Estado:</span>
                    {sunatForm.qpseEnvironment === 'production' ? (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Homologado</span>
                    ) : (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">En pruebas</span>
                    )}
                  </div>
                </div>
              )}

              {/* Configuración SUNAT Directo */}
              {sunatForm.emissionMethod === 'sunat_direct' && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 space-y-4">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Shield className="w-5 h-5" />
                    <span className="font-medium">Configuración SUNAT Directo</span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ambiente
                    </label>
                    <select
                      value={sunatForm.sunatEnvironment}
                      onChange={e => setSunatForm({ ...sunatForm, sunatEnvironment: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="beta">Beta (Pruebas)</option>
                      <option value="production">Producción</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Usuario SOL
                    </label>
                    <input
                      type="text"
                      value={sunatForm.solUser}
                      onChange={e => setSunatForm({ ...sunatForm, solUser: e.target.value })}
                      placeholder="MODDATOS"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Clave SOL
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.sol ? 'text' : 'password'}
                        value={sunatForm.solPassword}
                        onChange={e => setSunatForm({ ...sunatForm, solPassword: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, sol: !showPasswords.sol })}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Credenciales API REST para Guías de Remisión */}
                  <div className="col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 mb-1">
                      Credenciales API REST (para Guías de Remisión)
                    </p>
                    <p className="text-xs text-blue-700 mb-3">
                      Requeridas para enviar GRE directamente a SUNAT. Generar en: Menú SOL → Empresa → Credenciales API
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Client ID
                        </label>
                        <input
                          type="text"
                          value={sunatForm.clientId}
                          onChange={e => setSunatForm({ ...sunatForm, clientId: e.target.value })}
                          placeholder="ej: 12345678901-abc123..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Client Secret
                        </label>
                        <div className="relative">
                          <input
                            type={showPasswords.api ? 'text' : 'password'}
                            value={sunatForm.clientSecret}
                            onChange={e => setSunatForm({ ...sunatForm, clientSecret: e.target.value })}
                            placeholder="••••••••"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords({ ...showPasswords, api: !showPasswords.api })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contraseña del Certificado
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords.cert ? 'text' : 'password'}
                        value={sunatForm.certificatePassword}
                        onChange={e => setSunatForm({ ...sunatForm, certificatePassword: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, cert: !showPasswords.cert })}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Certificado Digital */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Certificado Digital (.pfx)
                    </label>
                    {sunatForm.certificateName ? (
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <FileKey className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-700 font-medium flex-1">{sunatForm.certificateName}</span>
                        <button
                          type="button"
                          onClick={handleRemoveCertificate}
                          className="p-1 hover:bg-green-100 rounded text-green-600 hover:text-red-600 transition-colors"
                          title="Eliminar certificado"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertTriangle className="w-5 h-5 text-yellow-600" />
                          <span className="text-sm text-yellow-700">Sin certificado</span>
                        </div>
                      </div>
                    )}
                    {/* Botón para subir certificado */}
                    <label className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                      <Upload className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {sunatForm.certificateName ? 'Cambiar certificado' : 'Subir certificado'}
                      </span>
                      <input
                        type="file"
                        accept=".pfx,.p12"
                        onChange={handleCertificateUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Formatos aceptados: .pfx, .p12
                    </p>
                  </div>

                  {/* Estado de homologación - derivado del ambiente */}
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Estado:</span>
                    {sunatForm.sunatEnvironment === 'production' ? (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Homologado</span>
                    ) : (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">En pruebas</span>
                    )}
                  </div>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowSunatModal(false)
                    setSunatUserToEdit(null)
                    setCertificateFile(null)
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveSunatConfig}
                  disabled={savingSunat}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingSunat ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Guardar
                    </>
                  )}
                </button>
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Features */}
      {showFeaturesModal && featuresUserToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-hidden">
          <div className="bg-white rounded-xl sm:rounded-2xl w-full max-w-[calc(100vw-1rem)] sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-gray-900">Features Especiales</h2>
                <p className="text-xs sm:text-sm text-gray-500 truncate">{featuresUserToEdit.businessName}</p>
              </div>
              <button
                onClick={() => {
                  setShowFeaturesModal(false)
                  setFeaturesUserToEdit(null)
                }}
                className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              <p className="text-sm text-gray-600">
                Activa features especiales para este usuario. Estos features son adicionales al plan contratado.
              </p>

              {/* Feature: Imágenes de productos */}
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Image className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Imágenes de productos</h3>
                      <p className="text-xs text-gray-500">Permite subir fotos a los productos</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresForm.productImages}
                      onChange={e => setFeaturesForm({ ...featuresForm, productImages: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
                {featuresForm.productImages && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-purple-100 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-purple-600" />
                    <span className="text-sm text-purple-700 font-medium">Feature habilitado</span>
                  </div>
                )}
              </div>

              {/* Feature: Ocultar métodos de pago */}
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Ocultar métodos de pago</h3>
                      <p className="text-xs text-gray-500">Solo efectivo en POS (oculta selector)</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresForm.hidePaymentMethods}
                      onChange={e => setFeaturesForm({ ...featuresForm, hidePaymentMethods: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>
                {featuresForm.hidePaymentMethods && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-orange-100 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-orange-600" />
                    <span className="text-sm text-orange-700 font-medium">Todas las ventas serán en Efectivo</span>
                  </div>
                )}
              </div>

              {/* Feature: Gestión de Gastos */}
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <Receipt className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Gestión de Gastos</h3>
                      <p className="text-xs text-gray-500">Registro y reportes de gastos del negocio</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresForm.expenseManagement}
                      onChange={e => setFeaturesForm({ ...featuresForm, expenseManagement: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>
                {featuresForm.expenseManagement && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-red-100 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm text-red-700 font-medium">Acceso a Gastos y Reportes de Gastos</span>
                  </div>
                )}
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowFeaturesModal(false)
                    setFeaturesUserToEdit(null)
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveFeatures}
                  disabled={savingFeatures}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {savingFeatures ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Guardar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Registrar Pago */}
      {showPaymentModal && paymentUserToEdit && (
        <UserDetailsModal
          user={paymentUserToEdit}
          type="payment"
          onClose={() => {
            setShowPaymentModal(false)
            setPaymentUserToEdit(null)
          }}
          onRegisterPayment={handleRegisterPayment}
          loading={processingPayment}
          toast={toast}
        />
      )}

      {/* Modal de Cambiar Plan */}
      {showPlanModal && paymentUserToEdit && (
        <UserDetailsModal
          user={paymentUserToEdit}
          type="edit"
          onClose={() => {
            setShowPlanModal(false)
            setPaymentUserToEdit(null)
          }}
          onChangePlan={handleChangePlan}
          loading={processingPayment}
          toast={toast}
        />
      )}
    </div>
  )
}
