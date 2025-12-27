import React, { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, Timestamp, arrayUnion } from 'firebase/firestore'
import { PLANS, updateUserFeatures, updateMaxBranches } from '@/services/subscriptionService'
import { notifyPaymentReceived } from '@/services/notificationService'
import UserDetailsModal from '@/components/admin/UserDetailsModal'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
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
  Check,
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
  Upload,
  Landmark,
  Store,
  MapPin,
  Phone
} from 'lucide-react'
import {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch
} from '@/services/branchService'
import { createWarehouse, getWarehouses, deleteWarehouse } from '@/services/warehouseService'

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
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all') // 'all' | 'cobrify' | 'reseller'
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
    igvRate: 18,
    taxType: 'standard' // 'standard' (18%), 'reduced' (8% Ley 31556), 'exempt' (0% Ley 27037)
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
    expenseManagement: false,
    loans: false
  })

  // Estados para modal de pagos y planes
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [paymentUserToEdit, setPaymentUserToEdit] = useState(null)
  const [processingPayment, setProcessingPayment] = useState(false)

  // Estados para modal de sucursales
  const [showBranchesModal, setShowBranchesModal] = useState(false)
  const [branchesUserToEdit, setBranchesUserToEdit] = useState(null)
  const [branches, setBranches] = useState([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [savingBranch, setSavingBranch] = useState(false)
  const [mainBranchName, setMainBranchName] = useState('Sucursal Principal')
  const [editingMainBranch, setEditingMainBranch] = useState(false)
  const [savingMainBranch, setSavingMainBranch] = useState(false)
  const [editingBranch, setEditingBranch] = useState(null)
  const [branchForm, setBranchForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    location: '',
    isDefault: false
  })
  // Estados para editar límite de sucursales
  const [showEditLimitModal, setShowEditLimitModal] = useState(false)
  const [editingMaxBranches, setEditingMaxBranches] = useState(1)
  const [savingMaxBranches, setSavingMaxBranches] = useState(false)

  // Estados para eliminar usuario
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [userToDelete, setUserToDelete] = useState(null)
  const [deletingUser, setDeletingUser] = useState(false)
  const [deleteWithData, setDeleteWithData] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      // Obtener subscriptions, businesses, users y resellers en paralelo
      const [subscriptionsSnapshot, businessesSnapshot, usersSnapshot, resellersSnapshot] = await Promise.all([
        getDocs(collection(db, 'subscriptions')),
        getDocs(collection(db, 'businesses')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'resellers'))
      ])

      // Crear mapa de resellers por ID para obtener nombres
      const resellersMap = {}
      resellersSnapshot.forEach(doc => {
        const data = doc.data()
        resellersMap[doc.id] = data.branding?.companyName || data.companyName || data.email || doc.id
      })

      // Crear mapa de businesses por ID para acceso rápido
      const businessesMap = {}
      businessesSnapshot.forEach(doc => {
        businessesMap[doc.id] = doc.data()
      })

      // Crear mapa de usuarios por ID para obtener displayName
      const usersMap = {}
      usersSnapshot.forEach(doc => {
        const data = doc.data()
        usersMap[doc.id] = data
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
          // Ubicación
          department: business.department || null,
          province: business.province || null,
          district: business.district || null,
          // Contacto - obtener de users collection o business
          contactName: usersMap[doc.id]?.displayName || business.contactName || business.ownerName || null,
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
          features: data.features || { productImages: false },
          // Origen del cliente (Cobrify directo o Reseller)
          createdByReseller: data.createdByReseller || false,
          resellerId: data.resellerId || null,
          resellerName: data.resellerId ? resellersMap[data.resellerId] || data.resellerId : null
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

    // Filtro de origen (Cobrify vs Reseller)
    if (sourceFilter === 'cobrify') {
      result = result.filter(u => !u.createdByReseller)
    } else if (sourceFilter === 'reseller') {
      result = result.filter(u => u.createdByReseller)
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
  }, [users, searchTerm, statusFilter, planFilter, sourceFilter, sortField, sortDirection])

  // Estadísticas rápidas
  const stats = useMemo(() => {
    return {
      total: users.length,
      active: users.filter(u => u.status === 'active').length,
      trial: users.filter(u => u.status === 'trial').length,
      suspended: users.filter(u => u.status === 'suspended').length,
      expired: users.filter(u => u.status === 'expired').length,
      cobrify: users.filter(u => !u.createdByReseller).length,
      reseller: users.filter(u => u.createdByReseller).length
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

  // Eliminar usuario completamente
  async function handleDeleteUser() {
    if (!userToDelete || !currentUser) return

    setDeletingUser(true)
    try {
      const response = await fetch('https://us-central1-cobrify-395fe.cloudfunctions.net/deleteUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUid: currentUser.uid,
          userIdToDelete: userToDelete.id,
          deleteData: deleteWithData
        })
      })

      const result = await response.json()

      if (result.success) {
        toast.success(`Usuario eliminado exitosamente`)
        setShowDeleteModal(false)
        setUserToDelete(null)
        setDeleteWithData(false)
        loadUsers() // Recargar la lista
      } else {
        toast.error(result.error || 'Error al eliminar usuario')
      }
    } catch (error) {
      console.error('Error eliminando usuario:', error)
      toast.error('Error al eliminar usuario')
    } finally {
      setDeletingUser(false)
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
          igvRate: taxConfig.igvRate || 18,
          // Determinar taxType basado en configuración existente
          // Nota: 10% = Ley 31556 (8% IGV + 2% IPM), también aceptar 8% por compatibilidad
          taxType: taxConfig.igvExempt ? 'exempt' : (taxConfig.igvRate === 10 || taxConfig.igvRate === 8 ? 'reduced' : 'standard')
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
          igvRate: 18,
          taxType: 'standard'
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
        igvRate: 18,
        taxType: 'standard'
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

      // Determinar igvExempt e igvRate basado en taxType
      // Nota: Ley 31556 es 10% (8% IGV + 2% IPM), pero en el XML se declara junto como 10%
      const taxTypeConfig = {
        standard: { igvExempt: false, igvRate: 18 },
        reduced: { igvExempt: false, igvRate: 10 }, // Ley 31556: 8% IGV + 2% IPM = 10%
        exempt: { igvExempt: true, igvRate: 0 }
      }
      const selectedTaxConfig = taxTypeConfig[sunatForm.taxType] || taxTypeConfig.standard

      // Construir emissionConfig
      const emissionConfig = {
        method: sunatForm.emissionMethod,
        taxConfig: {
          igvExempt: selectedTaxConfig.igvExempt,
          igvRate: selectedTaxConfig.igvRate,
          includeIgv: !selectedTaxConfig.igvExempt,
          taxType: sunatForm.taxType // Guardar también el tipo para referencia
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
      expenseManagement: user.features?.expenseManagement || false,
      loans: user.features?.loans || false
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

  // Abrir modal de sucursales
  async function openBranchesModal(user) {
    setBranchesUserToEdit(user)
    setShowBranchesModal(true)
    setLoadingBranches(true)
    setBranches([])
    setEditingBranch(null)
    setEditingMainBranch(false)
    setMainBranchName(user.mainBranchName || 'Sucursal Principal')
    setBranchForm({
      name: '',
      address: '',
      phone: '',
      email: '',
      location: '',
      isDefault: false
    })

    try {
      const result = await getBranches(user.id)
      if (result.success) {
        setBranches(result.data)
      }
    } catch (error) {
      console.error('Error loading branches:', error)
      toast.error('Error al cargar sucursales')
    } finally {
      setLoadingBranches(false)
    }
  }

  // Guardar nombre de sucursal principal
  async function handleSaveMainBranchName() {
    if (!branchesUserToEdit) return
    if (!mainBranchName.trim()) {
      toast.error('El nombre de la sucursal es requerido')
      return
    }

    setSavingMainBranch(true)
    try {
      const userRef = doc(db, 'users', branchesUserToEdit.id)
      await updateDoc(userRef, {
        mainBranchName: mainBranchName.trim()
      })

      // Actualizar el usuario en la lista local
      setUsers(users.map(u =>
        u.id === branchesUserToEdit.id
          ? { ...u, mainBranchName: mainBranchName.trim() }
          : u
      ))
      setBranchesUserToEdit(prev => ({ ...prev, mainBranchName: mainBranchName.trim() }))

      toast.success('Nombre de sucursal actualizado')
      setEditingMainBranch(false)
    } catch (error) {
      console.error('Error al guardar nombre:', error)
      toast.error('Error al guardar el nombre')
    } finally {
      setSavingMainBranch(false)
    }
  }

  // Crear o actualizar sucursal
  async function handleSaveBranch() {
    if (!branchesUserToEdit) return
    if (!branchForm.name.trim()) {
      toast.error('El nombre de la sucursal es requerido')
      return
    }

    setSavingBranch(true)
    try {
      if (editingBranch) {
        // Actualizar sucursal existente
        await updateBranch(branchesUserToEdit.id, editingBranch.id, branchForm)
        toast.success('Sucursal actualizada')
      } else {
        // Verificar límite de sucursales antes de crear
        const maxBranches = branchesUserToEdit.limits?.maxBranches ?? 1
        const activeBranches = branches.filter(b => b.isActive !== false).length

        if (maxBranches !== -1 && activeBranches >= maxBranches) {
          toast.error(`Límite alcanzado: ${activeBranches}/${maxBranches} sucursales. Aumenta el límite en la suscripción.`)
          setSavingBranch(false)
          return
        }

        // Crear nueva sucursal
        const branchResult = await createBranch(branchesUserToEdit.id, {
          ...branchForm,
          createdBy: 'admin'
        })

        // Crear almacén por defecto para la nueva sucursal
        if (branchResult.success && branchResult.id) {
          await createWarehouse(branchesUserToEdit.id, {
            name: branchForm.name,
            address: branchForm.address || '',
            location: branchForm.location || '',
            branchId: branchResult.id,
            isDefault: true
          })
        }
        toast.success('Sucursal creada con almacén por defecto')
      }

      // Recargar sucursales
      const result = await getBranches(branchesUserToEdit.id)
      if (result.success) {
        setBranches(result.data)
      }

      // Limpiar formulario
      setEditingBranch(null)
      setBranchForm({
        name: '',
        address: '',
        phone: '',
        email: '',
        location: '',
        isDefault: false
      })
    } catch (error) {
      console.error('Error saving branch:', error)
      toast.error('Error al guardar sucursal')
    } finally {
      setSavingBranch(false)
    }
  }

  // Editar sucursal
  function handleEditBranch(branch) {
    setEditingBranch(branch)
    setBranchForm({
      name: branch.name || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      location: branch.location || '',
      isDefault: branch.isDefault || false
    })
  }

  // Eliminar sucursal
  async function handleDeleteBranch(branchId) {
    if (!branchesUserToEdit) return
    if (!confirm('¿Estás seguro de eliminar esta sucursal?\n\nTambién se eliminarán los almacenes asociados a esta sucursal.')) return

    try {
      // Primero, eliminar los almacenes asociados a esta sucursal
      const warehousesResult = await getWarehouses(branchesUserToEdit.id)
      if (warehousesResult.success) {
        const branchWarehouses = warehousesResult.data.filter(w => w.branchId === branchId)
        for (const warehouse of branchWarehouses) {
          await deleteWarehouse(branchesUserToEdit.id, warehouse.id)
        }
      }

      // Luego eliminar la sucursal
      await deleteBranch(branchesUserToEdit.id, branchId)
      toast.success('Sucursal y almacenes eliminados')

      // Recargar sucursales
      const result = await getBranches(branchesUserToEdit.id)
      if (result.success) {
        setBranches(result.data)
      }
    } catch (error) {
      console.error('Error deleting branch:', error)
      toast.error('Error al eliminar sucursal')
    }
  }

  // Cancelar edición de sucursal
  function handleCancelBranchEdit() {
    setEditingBranch(null)
    setBranchForm({
      name: '',
      address: '',
      phone: '',
      email: '',
      location: '',
      isDefault: false
    })
  }

  // Abrir modal para editar límite de sucursales
  function openEditLimitModal() {
    setEditingMaxBranches(branchesUserToEdit?.limits?.maxBranches ?? 1)
    setShowEditLimitModal(true)
  }

  // Guardar nuevo límite de sucursales
  async function handleSaveMaxBranches() {
    if (!branchesUserToEdit) return

    setSavingMaxBranches(true)
    try {
      await updateMaxBranches(branchesUserToEdit.id, editingMaxBranches)

      // Actualizar el usuario en el estado local
      setBranchesUserToEdit(prev => ({
        ...prev,
        limits: { ...prev.limits, maxBranches: editingMaxBranches }
      }))

      // Actualizar lista de usuarios
      setUsers(prev => prev.map(u =>
        u.id === branchesUserToEdit.id
          ? { ...u, limits: { ...u.limits, maxBranches: editingMaxBranches } }
          : u
      ))

      toast.success('Límite de sucursales actualizado')
      setShowEditLimitModal(false)
    } catch (error) {
      console.error('Error updating max branches:', error)
      toast.error('Error al actualizar límite')
    } finally {
      setSavingMaxBranches(false)
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

      // Enviar notificación al usuario
      try {
        await notifyPaymentReceived(userId, parseFloat(amount), plan.name, newEndDate)
        console.log('✅ Notificación de pago enviada al usuario')
      } catch (notifError) {
        console.error('Error al enviar notificación:', notifError)
        // No fallar si la notificación falla
      }

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

            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="flex-1 sm:flex-none px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Origen ({stats.cobrify}+{stats.reseller})</option>
              <option value="cobrify">Cobrify ({stats.cobrify})</option>
              <option value="reseller">Resellers ({stats.reseller})</option>
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
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-200 sticky top-0">
              <tr>
                <th
                  className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('businessName')}
                >
                  <div className="flex items-center gap-1">
                    Negocio <SortIcon field="businessName" />
                  </div>
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                  Contacto
                </th>
                <th
                  className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('plan')}
                >
                  <div className="flex items-center gap-1">
                    Plan <SortIcon field="plan" />
                  </div>
                </th>
                <th
                  className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Estado <SortIcon field="status" />
                  </div>
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('usage')}
                >
                  <div className="flex items-center gap-1">
                    Uso <SortIcon field="usage" />
                  </div>
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                  SUNAT
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('department')}
                >
                  <div className="flex items-center gap-1">
                    Ubicación <SortIcon field="department" />
                  </div>
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('periodEnd')}
                >
                  <div className="flex items-center gap-1">
                    Vence <SortIcon field="periodEnd" />
                  </div>
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center gap-1">
                    Registro <SortIcon field="createdAt" />
                  </div>
                </th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-16">

                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <RefreshCw className="w-6 h-6 text-gray-400 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Cargando usuarios...</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No se encontraron usuarios</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => (
                  <tr
                    key={user.id}
                    className="hover:bg-indigo-50/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedUser(user)}
                  >
                    {/* Negocio + Email + RUC */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${user.createdByReseller ? 'bg-purple-100' : 'bg-indigo-100'}`}>
                          <Building2 className={`w-3.5 h-3.5 ${user.createdByReseller ? 'text-purple-600' : 'text-indigo-600'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="font-medium text-gray-900 text-[12px] truncate max-w-[140px]">{user.businessName}</p>
                            {user.createdByReseller && (
                              <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold bg-purple-100 text-purple-700" title={`Reseller: ${user.resellerName}`}>
                                R
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 truncate max-w-[150px]">{user.email}</p>
                          {user.ruc && <p className="text-[9px] text-gray-400">RUC: {user.ruc}</p>}
                        </div>
                      </div>
                    </td>
                    {/* Contacto + Teléfono */}
                    <td className="px-3 py-2">
                      <div className="min-w-0">
                        {user.contactName ? (
                          <p className="text-[11px] text-gray-700 font-medium truncate max-w-[120px]">{user.contactName}</p>
                        ) : (
                          <p className="text-[10px] text-gray-400">—</p>
                        )}
                        {user.phone && (
                          <p className="text-[10px] text-gray-500 truncate max-w-[120px]">{user.phone}</p>
                        )}
                      </div>
                    </td>
                    {/* Plan */}
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {PLANS[user.plan]?.name || user.plan}
                      </span>
                    </td>
                    {/* Estado */}
                    <td className="px-2 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        user.status === 'active' ? 'bg-green-50 text-green-700 border border-green-100' :
                        user.status === 'trial' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                        user.status === 'suspended' ? 'bg-red-50 text-red-700 border border-red-100' :
                        'bg-yellow-50 text-yellow-700 border border-yellow-100'
                      }`}>
                        {STATUS_LABELS[user.status]}
                      </span>
                    </td>
                    {/* Uso */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              user.limit > 0 && (user.usage?.invoicesThisMonth || 0) / user.limit > 0.9
                                ? 'bg-red-500'
                                : user.limit > 0 && (user.usage?.invoicesThisMonth || 0) / user.limit > 0.7
                                  ? 'bg-yellow-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{ width: user.limit > 0 ? `${Math.min(((user.usage?.invoicesThisMonth || 0) / user.limit) * 100, 100)}%` : '10%' }}
                          />
                        </div>
                        <span className="text-[11px] text-gray-500 tabular-nums">
                          {user.usage?.invoicesThisMonth || 0}/{user.limit === -1 || user.limit === 0 ? '∞' : user.limit}
                        </span>
                      </div>
                    </td>
                    {/* SUNAT */}
                    <td className="px-3 py-2">
                      {user.emissionMethod && user.emissionMethod !== 'none' ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          user.emissionMethod === 'qpse' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          user.emissionMethod === 'sunat_direct' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                          user.emissionMethod === 'nubefact' ? 'bg-violet-50 text-violet-700 border border-violet-200' :
                          'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}>
                          {user.emissionMethod === 'qpse' ? 'QPse' :
                           user.emissionMethod === 'sunat_direct' ? 'SUNAT' :
                           user.emissionMethod === 'nubefact' ? 'Nubefact' : user.emissionMethod}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">—</span>
                      )}
                    </td>
                    {/* Ubicación */}
                    <td className="px-3 py-2">
                      {user.department || user.province ? (
                        <div className="text-[11px]">
                          <p className="text-gray-700 font-medium truncate max-w-[100px]">{user.department || '—'}</p>
                          {user.province && user.province !== user.department && (
                            <p className="text-gray-400 text-[10px] truncate max-w-[100px]">{user.province}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400">—</span>
                      )}
                    </td>
                    {/* Vence */}
                    <td className="px-3 py-2">
                      {user.periodEnd ? (
                        <div className={`text-[11px] font-medium ${
                          user.periodEnd < new Date() ? 'text-red-600' :
                          user.periodEnd < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? 'text-amber-600' :
                          'text-gray-600'
                        }`}>
                          {user.periodEnd.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                          {user.periodEnd < new Date() && (
                            <span className="ml-1 text-[9px] text-red-500 font-bold">!</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-400">—</span>
                      )}
                    </td>
                    {/* Registro */}
                    <td className="px-3 py-2 text-[11px] text-gray-500">{formatDate(user.createdAt)}</td>
                    {/* Acciones */}
                    <td className="px-3 py-2 text-center">
                      <div className="relative inline-flex">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setActionMenuUser(actionMenuUser === user.id ? null : user.id)
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </button>

                        {actionMenuUser === user.id && (
                          <div className={`absolute right-0 w-44 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 ${
                            index >= filteredUsers.length - 2 ? 'bottom-full mb-1' : 'mt-1'
                          }`}>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setSelectedUser(user)
                                setActionMenuUser(null)
                              }}
                              className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ver detalles
                            </button>
                            {user.status !== 'suspended' ? (
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  toggleUserAccess(user.id, true)
                                }}
                                className="w-full px-3 py-1.5 text-left text-xs text-amber-600 hover:bg-amber-50 flex items-center gap-2"
                              >
                                <Ban className="w-3.5 h-3.5" /> Suspender
                              </button>
                            ) : (
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  toggleUserAccess(user.id, false)
                                }}
                                className="w-full px-3 py-1.5 text-left text-xs text-emerald-600 hover:bg-emerald-50 flex items-center gap-2"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Reactivar
                              </button>
                            )}
                            <div className="border-t border-gray-100 my-0.5" />
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setUserToDelete(user)
                                setShowDeleteModal(true)
                                setActionMenuUser(null)
                              }}
                              className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
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

                <button
                  onClick={() => {
                    openBranchesModal(selectedUser)
                  }}
                  className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 bg-cyan-100 text-cyan-700 rounded-lg hover:bg-cyan-200 text-xs sm:text-sm"
                >
                  <Store className="w-4 h-4 sm:w-5 sm:h-5" />
                  Sucursales
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Régimen de IGV
                  </label>
                  <div className="space-y-2">
                    {/* IGV Estándar 18% */}
                    <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                      sunatForm.taxType === 'standard'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="taxType"
                        value="standard"
                        checked={sunatForm.taxType === 'standard'}
                        onChange={e => setSunatForm({ ...sunatForm, taxType: e.target.value })}
                        className="mt-1 text-green-600 focus:ring-green-500"
                      />
                      <div>
                        <span className="font-medium text-gray-900">IGV Estándar (18%)</span>
                        <p className="text-xs text-gray-500">Régimen general para la mayoría de empresas</p>
                      </div>
                    </label>

                    {/* IGV Reducido 10% - Ley 31556 */}
                    <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                      sunatForm.taxType === 'reduced'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="taxType"
                        value="reduced"
                        checked={sunatForm.taxType === 'reduced'}
                        onChange={e => setSunatForm({ ...sunatForm, taxType: e.target.value })}
                        className="mt-1 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-medium text-gray-900">IGV Reducido (10%) - Ley N° 31556</span>
                        <p className="text-xs text-gray-500">8% IGV + 2% IPM. MYPES de restaurantes, hoteles y alojamientos turísticos (ventas ≤ S/ 7.8M anuales). Vigente hasta 31/12/2026.</p>
                      </div>
                    </label>

                    {/* Exonerado 0% - Ley 27037 */}
                    <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                      sunatForm.taxType === 'exempt'
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="taxType"
                        value="exempt"
                        checked={sunatForm.taxType === 'exempt'}
                        onChange={e => setSunatForm({ ...sunatForm, taxType: e.target.value })}
                        className="mt-1 text-amber-600 focus:ring-amber-500"
                      />
                      <div>
                        <span className="font-medium text-gray-900">Exonerado (0%) - Ley N° 27037</span>
                        <p className="text-xs text-gray-500">Ley de Promoción de la Inversión en la Amazonía. Para empresas ubicadas en Loreto, Ucayali, Madre de Dios, Amazonas y San Martín.</p>
                      </div>
                    </label>
                  </div>
                </div>
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

              {/* Feature: Préstamos */}
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <Landmark className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Préstamos</h3>
                      <p className="text-xs text-gray-500">Gestión de préstamos bancarios y de terceros</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresForm.loans}
                      onChange={e => setFeaturesForm({ ...featuresForm, loans: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                {featuresForm.loans && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-emerald-100 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm text-emerald-700 font-medium">Acceso al módulo de Préstamos</span>
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

      {/* Modal de Sucursales */}
      {showBranchesModal && branchesUserToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-hidden">
          <div className="bg-white rounded-xl sm:rounded-2xl w-full max-w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                  <Store className="w-5 h-5 text-cyan-600" />
                  Gestionar Sucursales
                  <button
                    onClick={openEditLimitModal}
                    className="ml-2 px-2.5 py-0.5 bg-cyan-100 text-cyan-700 text-xs font-medium rounded-full hover:bg-cyan-200 transition-colors flex items-center gap-1"
                    title="Editar límite de sucursales"
                  >
                    {branches.filter(b => b.isActive !== false).length + 1}/
                    {branchesUserToEdit.limits?.maxBranches === -1 ? '∞' : (branchesUserToEdit.limits?.maxBranches ?? 1)}
                    <Edit2 className="w-3 h-3" />
                  </button>
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 truncate">{branchesUserToEdit.businessName}</p>
              </div>
              <button
                onClick={() => {
                  setShowBranchesModal(false)
                  setBranchesUserToEdit(null)
                  setBranches([])
                  setEditingBranch(null)
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {/* Lista de sucursales existentes */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Sucursales Activas</h3>
                {loadingBranches ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Sucursal Principal Implícita - siempre existe */}
                    <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          {editingMainBranch ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={mainBranchName}
                                onChange={(e) => setMainBranchName(e.target.value)}
                                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                                placeholder="Nombre de la sucursal"
                                autoFocus
                              />
                              <button
                                onClick={handleSaveMainBranchName}
                                disabled={savingMainBranch}
                                className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
                              >
                                {savingMainBranch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingMainBranch(false)
                                  setMainBranchName(branchesUserToEdit?.mainBranchName || 'Sucursal Principal')
                                }}
                                className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">{mainBranchName}</h4>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                Por defecto
                              </span>
                            </div>
                          )}
                          <p className="text-sm text-gray-500 mt-1">
                            Usa las series globales del negocio (configuradas en Ajustes)
                          </p>
                        </div>
                        {!editingMainBranch && (
                          <button
                            onClick={() => setEditingMainBranch(true)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Editar nombre"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sucursales adicionales configuradas */}
                    {branches.filter(b => b.isActive).length === 0 ? (
                      <div className="text-center py-4 text-gray-400 text-sm">
                        No hay sucursales adicionales configuradas
                      </div>
                    ) : (
                  <div className="space-y-3">
                    {branches.filter(b => b.isActive).map(branch => (
                      <div
                        key={branch.id}
                        className={`p-4 border rounded-lg ${editingBranch?.id === branch.id ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200'}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">{branch.name}</h4>
                              {branch.isDefault && (
                                <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 text-xs rounded-full">
                                  Principal
                                </span>
                              )}
                            </div>
                            {branch.address && (
                              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" /> {branch.address}
                              </p>
                            )}
                            {branch.phone && (
                              <p className="text-sm text-gray-500 flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {branch.phone}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditBranch(branch)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Editar sucursal"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteBranch(branch.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Eliminar sucursal"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                    )}
                  </div>
                )}
              </div>

              {/* Formulario para crear/editar sucursal */}
              <div className="border-t pt-6">
                <h3 className="font-medium text-gray-900 mb-4">
                  {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal Adicional'}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre de la Sucursal *
                    </label>
                    <input
                      type="text"
                      value={branchForm.name}
                      onChange={e => setBranchForm({ ...branchForm, name: e.target.value })}
                      placeholder="Ej: Tienda Centro, Sucursal Norte"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dirección
                    </label>
                    <input
                      type="text"
                      value={branchForm.address}
                      onChange={e => setBranchForm({ ...branchForm, address: e.target.value })}
                      placeholder="Dirección completa para comprobantes"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Teléfono
                      </label>
                      <input
                        type="text"
                        value={branchForm.phone}
                        onChange={e => setBranchForm({ ...branchForm, phone: e.target.value })}
                        placeholder="01-1234567"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={branchForm.email}
                        onChange={e => setBranchForm({ ...branchForm, email: e.target.value })}
                        placeholder="sucursal@empresa.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ciudad/Ubicación
                    </label>
                    <input
                      type="text"
                      value={branchForm.location}
                      onChange={e => setBranchForm({ ...branchForm, location: e.target.value })}
                      placeholder="Lima, Arequipa, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    />
                  </div>

                  {!editingBranch && branches.length > 0 && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isDefault"
                        checked={branchForm.isDefault}
                        onChange={e => setBranchForm({ ...branchForm, isDefault: e.target.checked })}
                        className="w-4 h-4 text-cyan-600 border-gray-300 rounded focus:ring-cyan-500"
                      />
                      <label htmlFor="isDefault" className="text-sm text-gray-700">
                        Establecer como sucursal principal
                      </label>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    {editingBranch && (
                      <button
                        onClick={handleCancelBranchEdit}
                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      onClick={handleSaveBranch}
                      disabled={savingBranch || !branchForm.name.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
                    >
                      {savingBranch ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          {editingBranch ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          {editingBranch ? 'Actualizar' : 'Crear Sucursal Adicional'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Info sobre series */}
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                <h4 className="font-medium text-cyan-800 mb-1">Series Automáticas</h4>
                <p className="text-sm text-cyan-700">
                  Al crear una sucursal, se generan automáticamente las series de documentos (F001, B001, etc.).
                  Las series se incrementan para cada nueva sucursal (F002, B002...).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para editar límite de sucursales */}
      {showEditLimitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Store className="w-5 h-5 text-cyan-600" />
              Límite de Sucursales
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Configura cuántas sucursales puede tener este cliente. Usa -1 para ilimitado.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Máximo de sucursales
                </label>
                <input
                  type="number"
                  min="-1"
                  value={editingMaxBranches}
                  onChange={e => setEditingMaxBranches(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  -1 = Ilimitado, 1 = Una sucursal, 2+ = Múltiples
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEditLimitModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveMaxBranches}
                  disabled={savingMaxBranches}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
                >
                  {savingMaxBranches ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Guardar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Eliminar Usuario</h2>
                  <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Negocio:</span> {userToDelete.businessName}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Email:</span> {userToDelete.email}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">RUC:</span> {userToDelete.ruc || 'N/A'}
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Advertencia:</strong> Se eliminará la cuenta de Firebase Auth y el documento del usuario.
                </p>
              </div>

              <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteWithData}
                  onChange={(e) => setDeleteWithData(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-red-600 rounded focus:ring-red-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Eliminar también los datos</p>
                  <p className="text-xs text-gray-500">
                    Incluye facturas, productos, clientes, almacenes y demás información del negocio
                  </p>
                </div>
              </label>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setUserToDelete(null)
                  setDeleteWithData(false)
                }}
                disabled={deletingUser}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deletingUser}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {deletingUser ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Eliminar Usuario
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
