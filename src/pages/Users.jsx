import { useState, useEffect, useMemo } from 'react'
import { Users as UsersIcon, Plus, Edit2, Shield, Loader2, Eye, EyeOff, UserCheck, Warehouse, Store, CheckCircle2, XCircle, ChevronDown, ChevronRight, DollarSign, Briefcase, Bell, Key, Trash2, AlertTriangle, Archive, ArchiveRestore } from 'lucide-react'
import { EMPLOYMENT_TYPES, HR_STATUSES } from '@/services/personnelService'
import { useAuth } from '@/contexts/AuthContext'
import { useAppContext } from '@/hooks/useAppContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Modal from '@/components/ui/Modal'
import { useForm } from 'react-hook-form'
import { useToast } from '@/contexts/ToastContext'
import {
  getAvailablePagesByMode,
  createManagedUser,
  getManagedUsers,
  updateUserPermissions,
  updateUserData,
  toggleUserStatus,
  resetSubUserPassword,
  deleteManagedUser,
  CATEGORY_NAMES,
} from '@/services/userManagementService'
import { getWarehouses } from '@/services/warehouseService'
import { getActiveBranches } from '@/services/branchService'
import { getSellers } from '@/services/sellerService'
import { getActiveWaiters } from '@/services/waiterService'
import { formatDate } from '@/lib/utils'
import { db } from '@/lib/firebase'
import { collection, getDocs } from 'firebase/firestore'

export default function Users() {
  const { user, isAdmin, isBusinessOwner } = useAuth()
  const { businessMode, getBusinessId } = useAppContext()
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [agents, setAgents] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [branches, setBranches] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false) // ver perfiles archivados (personal que ya no trabaja)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  // Modal de reset de contraseña (admin → sub-usuario sin email real)
  const [resetTargetUser, setResetTargetUser] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  // Modal de eliminar sub-usuario
  const [deleteTargetUser, setDeleteTargetUser] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false)
  const [selectedPages, setSelectedPages] = useState([])
  const [selectedWarehouses, setSelectedWarehouses] = useState([])
  const [selectedBranches, setSelectedBranches] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [allowedDocumentTypes, setAllowedDocumentTypes] = useState([])
  const [allowedPaymentMethods, setAllowedPaymentMethods] = useState([])
  const [posSellers, setPosSellers] = useState([])
  const [assignedSellerId, setAssignedSellerId] = useState('')
  const [independentCashRegister, setIndependentCashRegister] = useState(false)
  const [hideStockInPOS, setHideStockInPOS] = useState(false)
  const [hideDiscountInPOS, setHideDiscountInPOS] = useState(false)
  const [waiters, setWaiters] = useState([])
  const [defaultWaiterId, setDefaultWaiterId] = useState('')

  // Preferencias de notificaciones para sub-usuarios.
  // Por defecto los sub-usuarios NO reciben notificaciones (decisión de
  // producto previa). Excepción: Yape se enciende por defecto porque es la
  // notificación crítica para cajeros que confirman pagos en el momento.
  const [notificationPreferences, setNotificationPreferences] = useState({
    yape_payment: true,
    new_order: false,
    new_sale: false,
    low_stock: false,
  })
  const [showNotificationsSection, setShowNotificationsSection] = useState(false)
  // Estados de colapso para las secciones avanzadas del modal (redesign visual).
  const [showAccessSection, setShowAccessSection] = useState(false)
  const [showPOSSection, setShowPOSSection] = useState(false)

  // Datos de personal (Capa 1 del módulo Personal). Todos opcionales.
  const [showPersonnelSection, setShowPersonnelSection] = useState(false)
  const [personnelData, setPersonnelData] = useState({
    jobTitle: '',
    department: '',
    employmentType: '',
    hireDate: '',
    weeklyHours: '',
    vacationDaysPerYear: '',
    hrStatus: 'active',
    phone: '',
    documentId: '',
    address: '',
    notes: '',
    excludeFromSchedule: false,
  })

  // Verificar si estamos en modo inmobiliaria
  const isRealEstateMode = businessMode === 'real_estate'
  const isRestaurantMode = businessMode === 'restaurant'

  // Obtener páginas disponibles según el modo del negocio
  const availablePages = getAvailablePagesByMode(businessMode)

  // Agrupar páginas por categoría para mejor visualización
  const pagesByCategory = useMemo(() => {
    const grouped = {}
    availablePages.forEach(page => {
      const category = page.category || 'otros'
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(page)
    })
    return grouped
  }, [availablePages])

  // Estado para controlar qué categorías están expandidas
  const [expandedCategories, setExpandedCategories] = useState({})

  // Inicializar todas las categorías como expandidas al abrir el modal
  useEffect(() => {
    if (isModalOpen) {
      const initial = {}
      Object.keys(pagesByCategory).forEach(cat => {
        initial[cat] = true
      })
      setExpandedCategories(initial)
    }
  }, [isModalOpen, pagesByCategory])

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }

  // Seleccionar/deseleccionar todas las páginas de una categoría
  const toggleCategoryPages = (category) => {
    const categoryPages = pagesByCategory[category] || []
    const categoryPageIds = categoryPages.map(p => p.id)
    const allSelected = categoryPageIds.every(id => selectedPages.includes(id))

    if (allSelected) {
      // Deseleccionar todas de esta categoría
      setSelectedPages(prev => prev.filter(id => !categoryPageIds.includes(id)))
    } else {
      // Seleccionar todas de esta categoría
      setSelectedPages(prev => [...new Set([...prev, ...categoryPageIds])])
    }
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm()

  useEffect(() => {
    loadUsers()
    loadWarehouses()
    loadBranches()
    loadPosSellers()
    if (isRealEstateMode) {
      loadAgents()
    }
    if (isRestaurantMode) {
      loadWaiters()
    }
  }, [user, isRealEstateMode, isRestaurantMode])

  const loadUsers = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const result = await getManagedUsers(user.uid)
      if (result.success) {
        setUsers(result.data)
      }
    } catch (error) {
      console.error('Error al cargar usuarios:', error)
      toast.error('Error al cargar usuarios')
    } finally {
      setIsLoading(false)
    }
  }

  const loadAgents = async () => {
    try {
      const businessId = getBusinessId()
      const agentsSnap = await getDocs(collection(db, `businesses/${businessId}/agents`))
      const agentsData = agentsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setAgents(agentsData.filter(a => a.isActive))
    } catch (error) {
      console.log('Error loading agents:', error.message)
      setAgents([])
    }
  }

  const loadWarehouses = async () => {
    try {
      const businessId = getBusinessId()
      if (!businessId) return
      const result = await getWarehouses(businessId)
      if (result.success) {
        setWarehouses(result.data.filter(w => w.isActive !== false))
      }
    } catch (error) {
      console.log('Error loading warehouses:', error.message)
      setWarehouses([])
    }
  }

  const loadBranches = async () => {
    try {
      const businessId = getBusinessId()
      if (!businessId) return
      const result = await getActiveBranches(businessId)
      if (result.success) {
        setBranches(result.data)
      }
    } catch (error) {
      console.log('Error loading branches:', error.message)
      setBranches([])
    }
  }

  const loadPosSellers = async () => {
    try {
      const businessId = getBusinessId()
      if (!businessId) return
      const result = await getSellers(businessId)
      if (result.success) {
        setPosSellers((result.data || []).filter(s => s.status === 'active'))
      }
    } catch (error) {
      console.log('Error loading sellers:', error.message)
      setPosSellers([])
    }
  }

  const loadWaiters = async () => {
    try {
      const businessId = getBusinessId()
      if (!businessId) return
      const result = await getActiveWaiters(businessId)
      if (result.success) {
        setWaiters(result.data || [])
      }
    } catch (error) {
      console.log('Error loading waiters:', error.message)
      setWaiters([])
    }
  }

  const emptyPersonnel = {
    jobTitle: '',
    department: '',
    employmentType: '',
    hireDate: '',
    weeklyHours: '',
    vacationDaysPerYear: '',
    hrStatus: 'active',
    phone: '',
    documentId: '',
    address: '',
    notes: '',
    excludeFromSchedule: false,
  }

  const openCreateModal = () => {
    setIsEditMode(false)
    setSelectedUser(null)
    setSelectedPages([])
    setSelectedWarehouses([])
    setSelectedBranches([])
    setSelectedAgentId('')
    setAllowedDocumentTypes([])
    setAllowedPaymentMethods([])
    setAssignedSellerId('')
    setDefaultWaiterId('')
    setIndependentCashRegister(false)
    setHideStockInPOS(false)
    setHideDiscountInPOS(false)
    setPersonnelData(emptyPersonnel)
    setShowPersonnelSection(false)
    setNotificationPreferences({
      yape_payment: true,
      new_order: false,
      new_sale: false,
      low_stock: false,
    })
    setShowNotificationsSection(false)
    setShowAccessSection(false)
    setShowPOSSection(false)
    reset({
      email: '',
      password: '',
      displayName: '',
    })
    setIsModalOpen(true)
  }

  // Abrir modal de reset de contraseña para un sub-usuario.
  // Limpia el estado anterior y muestra el modal con el target seleccionado.
  const openResetPasswordModal = (userToReset) => {
    setResetTargetUser(userToReset)
    setResetPassword('')
    setResetPasswordConfirm('')
    setShowResetPassword(false)
  }
  const closeResetPasswordModal = () => {
    setResetTargetUser(null)
    setResetPassword('')
    setResetPasswordConfirm('')
    setShowResetPassword(false)
    setResetLoading(false)
  }
  const handleResetPassword = async () => {
    if (!resetTargetUser) return
    if (!resetPassword || resetPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (resetPassword !== resetPasswordConfirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setResetLoading(true)
    try {
      const result = await resetSubUserPassword(resetTargetUser.uid, resetPassword)
      if (result.success) {
        toast.success(`Contraseña actualizada para ${resetTargetUser.displayName || resetTargetUser.email}`)
        closeResetPasswordModal()
      } else {
        toast.error(result.error || 'Error al resetear contraseña')
        setResetLoading(false)
      }
    } catch (error) {
      toast.error(error.message || 'Error al resetear contraseña')
      setResetLoading(false)
    }
  }

  const openEditModal = (userToEdit) => {
    setIsEditMode(true)
    setSelectedUser(userToEdit)
    setSelectedPages(userToEdit.allowedPages || [])
    setSelectedWarehouses(userToEdit.allowedWarehouses || [])
    setSelectedBranches(userToEdit.allowedBranches || [])
    setSelectedAgentId(userToEdit.agentId || '')
    setAllowedDocumentTypes(userToEdit.allowedDocumentTypes || [])
    setAllowedPaymentMethods(userToEdit.allowedPaymentMethods || [])
    setAssignedSellerId(userToEdit.assignedSellerId || '')
    setDefaultWaiterId(userToEdit.defaultWaiterId || '')
    setIndependentCashRegister(userToEdit.independentCashRegister || false)
    setHideStockInPOS(userToEdit.hideStockInPOS || false)
    setHideDiscountInPOS(userToEdit.hideDiscountInPOS || false)
    // Datos de RR.HH. (vienen del sub-objeto personnel en el sub-usuario)
    const p = userToEdit.personnel || {}
    setPersonnelData({
      jobTitle: p.jobTitle || '',
      department: p.department || '',
      employmentType: p.employmentType || '',
      hireDate: p.hireDate
        ? (p.hireDate.toDate?.() || new Date(p.hireDate)).toISOString().slice(0, 10)
        : '',
      weeklyHours: p.weeklyHours ?? '',
      vacationDaysPerYear: p.vacationDaysPerYear ?? '',
      hrStatus: p.hrStatus || 'active',
      phone: p.phone || '',
      documentId: p.documentId || '',
      address: p.address || '',
      notes: p.notes || '',
      excludeFromSchedule: p.excludeFromSchedule === true,
    })
    // Si el usuario ya tiene datos de personal, abrir la sección por defecto
    setShowPersonnelSection(!!(p.jobTitle || p.department || p.phone || p.documentId))
    // Cargar preferencias de notificaciones. Si el usuario no tiene el campo
    // (sub-usuarios viejos), aplicar defaults razonables (Yape on, resto off).
    const np = userToEdit.notificationPreferences || {}
    setNotificationPreferences({
      yape_payment: np.yape_payment !== false, // default true
      new_order: np.new_order === true,
      new_sale: np.new_sale === true,
      low_stock: np.low_stock === true,
    })
    // Abrir la sección si tiene alguna preferencia distinta del default básico
    setShowNotificationsSection(
      np.new_order === true || np.new_sale === true || np.low_stock === true || np.yape_payment === false
    )
    // Auto-expandir secciones avanzadas si el usuario ya tiene datos en ellas
    setShowAccessSection(
      (userToEdit.allowedWarehouses?.length > 0) ||
      (userToEdit.allowedBranches?.length > 0) ||
      !!userToEdit.agentId
    )
    const pages = userToEdit.allowedPages || []
    setShowPOSSection(
      pages.includes('pos') || pages.includes('cash-register')
    )
    reset({
      email: userToEdit.email,
      displayName: userToEdit.displayName,
    })
    setIsModalOpen(true)
  }

  const togglePageSelection = (pageId) => {
    setSelectedPages((prev) => {
      if (prev.includes(pageId)) {
        return prev.filter((id) => id !== pageId)
      } else {
        return [...prev, pageId]
      }
    })
  }

  const selectAllPages = () => {
    if (selectedPages.length === availablePages.length) {
      setSelectedPages([])
    } else {
      setSelectedPages(availablePages.map((page) => page.id))
    }
  }

  const toggleWarehouseSelection = (warehouseId) => {
    setSelectedWarehouses((prev) => {
      if (prev.includes(warehouseId)) {
        return prev.filter((id) => id !== warehouseId)
      } else {
        return [...prev, warehouseId]
      }
    })
  }

  const toggleBranchSelection = (branchId) => {
    setSelectedBranches((prev) => {
      if (prev.includes(branchId)) {
        return prev.filter((id) => id !== branchId)
      } else {
        return [...prev, branchId]
      }
    })
  }

  const selectAllWarehouses = () => {
    if (selectedWarehouses.length === warehouses.length) {
      setSelectedWarehouses([])
    } else {
      setSelectedWarehouses(warehouses.map((w) => w.id))
    }
  }

  const selectAllBranches = () => {
    // +1 para incluir 'main' (Sucursal Principal)
    if (selectedBranches.length === branches.length + 1) {
      setSelectedBranches([])
    } else {
      // Incluir 'main' y todas las sucursales
      setSelectedBranches(['main', ...branches.map((b) => b.id)])
    }
  }

  const onSubmit = async (data) => {
    try {
      if (selectedPages.length === 0) {
        toast.error('Debes seleccionar al menos una página')
        return
      }

      // Obtener datos del agente seleccionado
      const selectedAgent = agents.find(a => a.id === selectedAgentId)

      // Construir el sub-objeto personnel (Capa 1). Solo se incluye si el
      // usuario llenó algún campo, así no se persiste un objeto vacío.
      const buildPersonnel = () => {
        const hasData = Object.entries(personnelData).some(([k, v]) => {
          if (k === 'hrStatus') return v !== 'active' // 'active' es el default
          if (k === 'excludeFromSchedule') return v === true // solo si está activo
          return v !== '' && v !== null && v !== undefined
        })
        if (!hasData) return null
        return {
          jobTitle: personnelData.jobTitle || null,
          department: personnelData.department || null,
          employmentType: personnelData.employmentType || null,
          hireDate: personnelData.hireDate ? new Date(personnelData.hireDate) : null,
          weeklyHours: personnelData.weeklyHours !== '' ? Number(personnelData.weeklyHours) : null,
          vacationDaysPerYear: personnelData.vacationDaysPerYear !== '' ? Number(personnelData.vacationDaysPerYear) : null,
          hrStatus: personnelData.hrStatus || 'active',
          phone: personnelData.phone || null,
          documentId: personnelData.documentId || null,
          address: personnelData.address || null,
          notes: personnelData.notes || null,
          excludeFromSchedule: personnelData.excludeFromSchedule === true,
        }
      }
      const personnelPayload = buildPersonnel()

      if (isEditMode) {
        // Actualizar usuario existente
        const selectedSellerObj = posSellers.find(s => s.id === assignedSellerId)
        const selectedWaiterObj = waiters.find(w => w.id === defaultWaiterId)
        const updateData = {
          displayName: data.displayName,
          allowedWarehouses: selectedWarehouses,
          allowedBranches: selectedBranches,
          allowedDocumentTypes,
          allowedPaymentMethods,
          assignedSellerId: assignedSellerId || null,
          assignedSellerName: selectedSellerObj?.name || null,
          defaultWaiterId: defaultWaiterId || null,
          defaultWaiterName: selectedWaiterObj?.name || null,
          independentCashRegister,
          hideStockInPOS,
          hideDiscountInPOS,
          personnel: personnelPayload,
          notificationPreferences,
        }

        // Si es modo inmobiliaria, agregar datos del agente
        if (isRealEstateMode) {
          updateData.agentId = selectedAgentId || null
          updateData.agentName = selectedAgent?.name || null
        }

        const updateResult = await updateUserData(selectedUser.id, updateData)

        const permissionsResult = await updateUserPermissions(selectedUser.id, selectedPages)

        if (updateResult.success && permissionsResult.success) {
          toast.success('Usuario actualizado exitosamente')
          setIsModalOpen(false)
          loadUsers()
        } else {
          toast.error(updateResult.error || permissionsResult.error)
        }
      } else {
        // Crear nuevo usuario
        const selectedSellerForCreate = posSellers.find(s => s.id === assignedSellerId)
        const selectedWaiterForCreate = waiters.find(w => w.id === defaultWaiterId)
        const userData = {
          email: data.email,
          password: data.password,
          displayName: data.displayName,
          allowedPages: selectedPages,
          allowedWarehouses: selectedWarehouses,
          allowedBranches: selectedBranches,
          allowedDocumentTypes,
          allowedPaymentMethods,
          assignedSellerId: assignedSellerId || null,
          assignedSellerName: selectedSellerForCreate?.name || null,
          defaultWaiterId: defaultWaiterId || null,
          defaultWaiterName: selectedWaiterForCreate?.name || null,
          independentCashRegister,
          hideStockInPOS,
          hideDiscountInPOS,
          personnel: personnelPayload,
          notificationPreferences,
        }

        // Si es modo inmobiliaria, agregar datos del agente
        if (isRealEstateMode && selectedAgentId) {
          userData.agentId = selectedAgentId
          userData.agentName = selectedAgent?.name || null
        }

        const result = await createManagedUser(user.uid, userData)

        if (result.success) {
          toast.success('Usuario creado exitosamente')
          setIsModalOpen(false)
          reset()
          setSelectedPages([])
          setSelectedWarehouses([])
          setSelectedAgentId('')
          loadUsers()
        } else {
          toast.error(result.error)
        }
      }
    } catch (error) {
      console.error('Error al guardar usuario:', error)
      toast.error('Error al guardar usuario')
    }
  }

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      const result = await toggleUserStatus(userId, !currentStatus)
      if (result.success) {
        toast.success(result.message)
        loadUsers()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error)
      toast.error('Error al cambiar estado del usuario')
    }
  }

  // Archivar un perfil (personal que ya no trabaja): lo saca de la lista principal.
  // Se marca archived + isActive:false → no puede iniciar sesión (AuthContext lo cierra).
  // No se elimina: se conserva su historial y se puede desarchivar cuando se necesite.
  const handleArchiveUser = async (userItem) => {
    try {
      const result = await updateUserData(userItem.id, { archived: true, isActive: false })
      if (result.success) {
        toast.success(`Perfil de "${userItem.displayName || userItem.email}" archivado`)
        loadUsers()
      } else {
        toast.error(result.error || 'Error al archivar el perfil')
      }
    } catch (error) {
      console.error('Error al archivar usuario:', error)
      toast.error('Error al archivar el perfil')
    }
  }

  // Desarchivar: vuelve a la lista principal (queda inactivo; se activa aparte si se requiere).
  const handleUnarchiveUser = async (userItem) => {
    try {
      const result = await updateUserData(userItem.id, { archived: false })
      if (result.success) {
        toast.success(`Perfil de "${userItem.displayName || userItem.email}" restaurado`)
        loadUsers()
      } else {
        toast.error(result.error || 'Error al restaurar el perfil')
      }
    } catch (error) {
      console.error('Error al desarchivar usuario:', error)
      toast.error('Error al restaurar el perfil')
    }
  }

  // Abrir/cerrar modal de eliminar usuario
  const openDeleteModal = (userToDelete) => {
    setDeleteTargetUser(userToDelete)
    setDeleteConfirmChecked(false)
  }

  const closeDeleteModal = () => {
    if (deleteLoading) return
    setDeleteTargetUser(null)
    setDeleteConfirmChecked(false)
  }

  const handleDeleteUser = async () => {
    if (!deleteTargetUser) return
    setDeleteLoading(true)
    try {
      const result = await deleteManagedUser(deleteTargetUser.id)
      if (result.success) {
        toast.success(`Usuario "${deleteTargetUser.displayName || deleteTargetUser.email}" eliminado`)
        setDeleteTargetUser(null)
        setDeleteConfirmChecked(false)
        loadUsers()
      } else {
        toast.error(result.error || 'Error al eliminar usuario')
      }
    } catch (error) {
      console.error('Error al eliminar usuario:', error)
      toast.error('Error al eliminar usuario')
    } finally {
      setDeleteLoading(false)
    }
  }

  // Solo Business Owners pueden ver esta página
  // Super Admins NO deben verla (ellos gestionan negocios, no usuarios de negocio)
  if (!isBusinessOwner || isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">
            {isAdmin
              ? 'Esta página es para administradores de negocio. Como Super Admin, gestiona negocios desde el panel de administración.'
              : 'No tienes permisos para acceder a esta página. Solo los administradores del negocio pueden gestionar usuarios.'}
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando usuarios...</p>
        </div>
      </div>
    )
  }

  // Usuarios visibles según el modo (activos/normales vs. archivados)
  const archivedCount = users.filter(u => u.archived === true).length
  const visibleUsers = users.filter(u => (showArchived ? u.archived === true : u.archived !== true))

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Administra los usuarios y sus permisos
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />
          Crear Usuario
        </Button>
      </div>

      {/* Usuarios */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle>
              {showArchived
                ? `Perfiles Archivados (${visibleUsers.length})`
                : `Usuarios Registrados (${visibleUsers.length})`}
            </CardTitle>
            {(archivedCount > 0 || showArchived) && (
              <button
                onClick={() => setShowArchived(v => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors"
              >
                {showArchived ? (
                  <><UsersIcon className="w-4 h-4" /> Ver usuarios activos</>
                ) : (
                  <><Archive className="w-4 h-4" /> Ver archivados ({archivedCount})</>
                )}
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {/* Estado vacío */}
          {visibleUsers.length === 0 && (
            <div className="text-center py-8 text-gray-500 px-4">
              <UsersIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              {showArchived ? (
                <p>No hay perfiles archivados</p>
              ) : (
                <>
                  <p>No hay usuarios creados</p>
                  <p className="text-sm">Crea tu primer usuario para comenzar</p>
                </>
              )}
            </div>
          )}

          {/* Vista móvil - Tarjetas */}
          {visibleUsers.length > 0 && (
            <div className="sm:hidden divide-y divide-gray-200">
              {visibleUsers.map((userItem) => (
                <div key={userItem.id} className="p-4 hover:bg-gray-50">
                  {/* Header: Nombre + Estado */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        userItem.isActive ? 'bg-primary-100' : 'bg-gray-100'
                      }`}>
                        <UsersIcon className={`w-5 h-5 ${userItem.isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{userItem.displayName}</p>
                        <p className="text-sm text-gray-500 truncate">{userItem.email}</p>
                      </div>
                    </div>
                    <Badge variant={userItem.isActive ? 'success' : 'default'} className="flex-shrink-0">
                      {userItem.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>

                  {/* Info: Permisos */}
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded-lg">
                      <Shield className="w-3 h-3" />
                      {userItem.allowedPages?.length || 0} páginas
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-lg">
                      <Warehouse className="w-3 h-3" />
                      {!userItem.allowedWarehouses || userItem.allowedWarehouses.length === 0
                        ? 'Todos los almacenes'
                        : `${userItem.allowedWarehouses.length} almacén(es)`
                      }
                    </span>
                    {userItem.allowedBranches && userItem.allowedBranches.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-50 text-cyan-700 rounded-lg">
                        <Store className="w-3 h-3" />
                        {userItem.allowedBranches.length} sucursal(es)
                      </span>
                    )}
                  </div>

                  {/* Agente (solo modo inmobiliaria) */}
                  {isRealEstateMode && userItem.agentName && (
                    <div className="mb-3">
                      <span className="inline-flex items-center gap-1 text-sm text-cyan-700 bg-cyan-50 px-2 py-1 rounded-lg">
                        <UserCheck className="w-3 h-3" />
                        {userItem.agentName}
                      </span>
                    </div>
                  )}

                  {/* Fecha de creación */}
                  <p className="text-xs text-gray-400 mb-3">
                    Creado: {userItem.createdAt
                      ? formatDate(
                          userItem.createdAt.toDate
                            ? userItem.createdAt.toDate()
                            : userItem.createdAt
                        )
                      : '-'}
                  </p>

                  {/* Acciones */}
                  <div className="flex items-center justify-end gap-1 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => handleToggleStatus(userItem.id, userItem.isActive)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        userItem.isActive
                          ? 'text-yellow-600 hover:bg-yellow-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {userItem.isActive ? (
                        <><EyeOff className="w-3.5 h-3.5" /> Desactivar</>
                      ) : (
                        <><Eye className="w-3.5 h-3.5" /> Activar</>
                      )}
                    </button>
                    <button
                      onClick={() => openResetPasswordModal(userItem)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                      title="Resetear contraseña del usuario"
                    >
                      <Key className="w-3.5 h-3.5" /> Contraseña
                    </button>
                    <button
                      onClick={() => openEditModal(userItem)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </button>
                    {userItem.archived ? (
                      <button
                        onClick={() => handleUnarchiveUser(userItem)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" /> Desarchivar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleArchiveUser(userItem)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Archive className="w-3.5 h-3.5" /> Archivar
                      </button>
                    )}
                    <button
                      onClick={() => openDeleteModal(userItem)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar usuario"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vista desktop - Tabla */}
          {visibleUsers.length > 0 && (
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Estado</TableHead>
                    {isRealEstateMode && <TableHead>Agente</TableHead>}
                    <TableHead>Páginas</TableHead>
                    <TableHead>Almacenes</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((userItem) => (
                    <TableRow key={userItem.id}>
                      <TableCell className="font-medium">{userItem.displayName}</TableCell>
                      <TableCell>{userItem.email}</TableCell>
                      <TableCell>
                        <Badge variant={userItem.isActive ? 'success' : 'default'}>
                          {userItem.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      {isRealEstateMode && (
                        <TableCell>
                          {userItem.agentName ? (
                            <span className="inline-flex items-center gap-1 text-sm text-cyan-700 bg-cyan-50 px-2 py-1 rounded">
                              <UserCheck className="w-3 h-3" />
                              {userItem.agentName}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <span className="text-sm font-semibold text-primary-600">
                          {userItem.allowedPages?.length || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        {!userItem.allowedWarehouses || userItem.allowedWarehouses.length === 0 ? (
                          <span className="text-sm text-green-600 font-medium">Todos</span>
                        ) : (
                          <span className="text-sm font-semibold text-amber-600">
                            {userItem.allowedWarehouses.length} de {warehouses.length}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {userItem.createdAt
                          ? formatDate(
                              userItem.createdAt.toDate
                                ? userItem.createdAt.toDate()
                                : userItem.createdAt
                            )
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleStatus(userItem.id, userItem.isActive)}
                            className={`p-2 rounded-lg transition-colors ${
                              userItem.isActive
                                ? 'hover:bg-yellow-100 text-yellow-600'
                                : 'hover:bg-green-100 text-green-600'
                            }`}
                            title={userItem.isActive ? 'Desactivar' : 'Activar'}
                          >
                            {userItem.isActive ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => openResetPasswordModal(userItem)}
                            className="p-2 hover:bg-purple-100 text-purple-600 rounded-lg transition-colors"
                            title="Resetear contraseña"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(userItem)}
                            className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {userItem.archived ? (
                            <button
                              onClick={() => handleUnarchiveUser(userItem)}
                              className="p-2 hover:bg-green-100 text-green-600 rounded-lg transition-colors"
                              title="Desarchivar (volver a la lista)"
                            >
                              <ArchiveRestore className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchiveUser(userItem)}
                              className="p-2 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                              title="Archivar (personal que ya no trabaja)"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openDeleteModal(userItem)}
                            className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Crear/Editar Usuario - Amplio y organizado */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditMode ? 'Editar usuario' : 'Nuevo usuario secundario'}
        size="3xl"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="divide-y divide-gray-200">

            {/* === SECCIÓN 1: Datos del usuario === */}
            <div className="pb-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary-50 rounded-lg">
                  <UsersIcon className="w-4 h-4 text-primary-600" />
                </div>
                <h3 className="text-base font-semibold text-gray-900">Datos del usuario</h3>
              </div>
              <div className="space-y-4">
                <Input
                  label="Nombre completo"
                  placeholder="Ej: Juan Pérez"
                  error={errors.displayName?.message}
                  {...register('displayName', {
                    required: 'Nombre es requerido',
                  })}
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="usuario@ejemplo.com"
                  disabled={isEditMode}
                  error={errors.email?.message}
                  {...register('email', {
                    required: 'Email es requerido',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Email inválido',
                    },
                  })}
                />
                {!isEditMode && (
                  <div className="relative">
                    <Input
                      label="Contraseña"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      error={errors.password?.message}
                      {...register('password', {
                        required: 'Contraseña es requerida',
                        minLength: {
                          value: 6,
                          message: 'Mínimo 6 caracteres',
                        },
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* === SECCIÓN 2: Permisos de acceso === */}
            <div className="py-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-50 rounded-lg">
                    <Shield className="w-4 h-4 text-primary-600" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900">Permisos de acceso</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {selectedPages.length}/{availablePages.length}
                  </span>
                  <button
                    type="button"
                    onClick={selectAllPages}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {selectedPages.length === availablePages.length ? 'Ninguna' : 'Todas'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-3">Páginas y módulos a los que tendrá acceso.</p>

              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                {Object.entries(pagesByCategory).map(([category, pages]) => {
                  const categoryPageIds = pages.map(p => p.id)
                  const selectedInCategory = categoryPageIds.filter(id => selectedPages.includes(id)).length
                  const allSelected = selectedInCategory === pages.length
                  const someSelected = selectedInCategory > 0 && !allSelected

                  return (
                    <div key={category} className="border-b border-gray-100 last:border-b-0">
                      {/* Header de categoría */}
                      <div
                        className="flex items-center justify-between px-4 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
                        onClick={() => toggleCategory(category)}
                      >
                        <div className="flex items-center gap-2">
                          {expandedCategories[category] ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          )}
                          <span className="font-medium text-gray-700 text-sm">
                            {CATEGORY_NAMES[category] || category}
                          </span>
                          <span className="text-xs text-gray-500">
                            {selectedInCategory}/{pages.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCategoryPages(category)
                          }}
                          className={`p-1 rounded transition-colors ${
                            allSelected || someSelected
                              ? 'text-primary-600 hover:bg-primary-50'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          {allSelected || someSelected ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : (
                            <XCircle className="w-5 h-5" />
                          )}
                        </button>
                      </div>

                      {/* Páginas de la categoría */}
                      {expandedCategories[category] && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                          {pages.map((page) => (
                            <label
                              key={page.id}
                              className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors text-sm ${
                                selectedPages.includes(page.id)
                                  ? 'bg-primary-50 text-primary-900'
                                  : 'hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedPages.includes(page.id)}
                                onChange={() => togglePageSelection(page.id)}
                                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                              />
                              <span className="truncate">{page.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {selectedPages.length === 0 && (
                <p className="mt-3 text-sm text-red-600">Debes seleccionar al menos una página.</p>
              )}
            </div>

            {/* === SECCIÓN 3: Acceso a sucursales y almacenes (colapsable) === */}
            {(warehouses.length > 0 || branches.length > 0 || (isRealEstateMode && agents.length > 0)) && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowAccessSection((v) => !v)}
                  className={`w-full flex items-center justify-between py-4 transition-colors text-left ${
                    showAccessSection ? 'bg-gray-50/60' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${
                      showAccessSection ? 'bg-primary-50' : 'bg-gray-100'
                    }`}>
                      <Store className={`w-4 h-4 ${showAccessSection ? 'text-primary-600' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Acceso a sucursales y almacenes</h3>
                      <p className="text-xs text-gray-500">Restringe a ubicaciones específicas.</p>
                    </div>
                  </div>
                  {showAccessSection ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {showAccessSection && (
                  <div className="pb-5 space-y-5">
                    {/* Sucursales */}
                    {branches.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-medium text-gray-700">Sucursales</h4>
                          <button
                            type="button"
                            onClick={selectAllBranches}
                            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                          >
                            {selectedBranches.length === branches.length + 1 ? 'Ninguna' : 'Todas'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">Sin selección = acceso a todas.</p>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                          <label
                            className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                              selectedBranches.includes('main')
                                ? 'border-primary-300 bg-primary-50 text-primary-900'
                                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedBranches.includes('main')}
                              onChange={() => toggleBranchSelection('main')}
                              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                            />
                            <span className="truncate">Principal</span>
                          </label>
                          {branches.map((branch) => (
                            <label
                              key={branch.id}
                              className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                                selectedBranches.includes(branch.id)
                                  ? 'border-primary-300 bg-primary-50 text-primary-900'
                                  : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedBranches.includes(branch.id)}
                                onChange={() => toggleBranchSelection(branch.id)}
                                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                              />
                              <span className="truncate">{branch.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Almacenes */}
                    {warehouses.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-medium text-gray-700">Almacenes</h4>
                          <button
                            type="button"
                            onClick={selectAllWarehouses}
                            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                          >
                            {selectedWarehouses.length === warehouses.length ? 'Ninguno' : 'Todos'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">Sin selección = acceso a todos.</p>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                          {warehouses.map((warehouse) => (
                            <label
                              key={warehouse.id}
                              className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                                selectedWarehouses.includes(warehouse.id)
                                  ? 'border-primary-300 bg-primary-50 text-primary-900'
                                  : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedWarehouses.includes(warehouse.id)}
                                onChange={() => toggleWarehouseSelection(warehouse.id)}
                                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                              />
                              <span className="truncate">{warehouse.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Vincular con agente (solo modo inmobiliaria) */}
                    {isRealEstateMode && agents.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Vincular con agente</h4>
                        <p className="text-xs text-gray-500 mb-2">
                          Si vinculas un agente, el usuario verá solo sus comisiones.
                        </p>
                        <select
                          value={selectedAgentId}
                          onChange={(e) => setSelectedAgentId(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                        >
                          <option value="">Sin vincular (verá todas)</option>
                          {agents.map(agent => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name} - {agent.commissionPercent}%
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* === SECCIÓN 4: Configuración del POS y caja (colapsable) === */}
            {(selectedPages.includes('pos') || selectedPages.includes('cash-register')) && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPOSSection((v) => !v)}
                  className={`w-full flex items-center justify-between py-4 transition-colors text-left ${
                    showPOSSection ? 'bg-gray-50/60' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${
                      showPOSSection ? 'bg-primary-50' : 'bg-gray-100'
                    }`}>
                      <DollarSign className={`w-4 h-4 ${showPOSSection ? 'text-primary-600' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Configuración del POS y caja</h3>
                      <p className="text-xs text-gray-500">Comprobantes, métodos de pago, caja, descuentos.</p>
                    </div>
                  </div>
                  {showPOSSection ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {showPOSSection && (
                  <div className="pb-5 space-y-5">
                    {/* Caja */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Caja</h4>
                      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={independentCashRegister}
                          onChange={() => setIndependentCashRegister(!independentCashRegister)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">Caja independiente</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {independentCashRegister
                              ? 'Este usuario abre y cierra su propia caja.'
                              : 'Las ventas de este usuario se suman a la caja principal.'}
                          </div>
                        </div>
                      </label>
                    </div>

                    {selectedPages.includes('pos') && (
                      <>
                        {/* Comprobantes + Métodos de pago */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">Tipos de comprobante</h4>
                            <p className="text-xs text-gray-500 mb-2">Sin selección = se permiten todos.</p>
                            <div className="space-y-2">
                              {[
                                { id: 'boleta', label: 'Boleta de Venta' },
                                { id: 'factura', label: 'Factura Electrónica' },
                                { id: 'nota_venta', label: 'Nota de Venta' },
                              ].map(docType => (
                                <label
                                  key={docType.id}
                                  className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                                    allowedDocumentTypes.includes(docType.id)
                                      ? 'border-primary-300 bg-primary-50 text-primary-900'
                                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={allowedDocumentTypes.includes(docType.id)}
                                    onChange={() => {
                                      setAllowedDocumentTypes(prev =>
                                        prev.includes(docType.id)
                                          ? prev.filter(d => d !== docType.id)
                                          : [...prev, docType.id]
                                      )
                                    }}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                  />
                                  <span>{docType.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">Métodos de pago</h4>
                            <p className="text-xs text-gray-500 mb-2">Sin selección = se permiten todos.</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { id: 'cash', label: 'Efectivo' },
                                { id: 'card', label: 'Tarjeta' },
                                { id: 'transfer', label: 'Transferencia' },
                                { id: 'yape', label: 'Yape' },
                                { id: 'plin', label: 'Plin' },
                                ...(businessMode === 'restaurant' ? [
                                  { id: 'rappiPay', label: 'Rappi' },
                                  { id: 'pedidosYa', label: 'PedidosYa' },
                                  { id: 'didifood', label: 'DiDiFood' },
                                ] : []),
                              ].map(method => (
                                <label
                                  key={method.id}
                                  className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                                    allowedPaymentMethods.includes(method.id)
                                      ? 'border-primary-300 bg-primary-50 text-primary-900'
                                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={allowedPaymentMethods.includes(method.id)}
                                    onChange={() => {
                                      setAllowedPaymentMethods(prev =>
                                        prev.includes(method.id)
                                          ? prev.filter(m => m !== method.id)
                                          : [...prev, method.id]
                                      )
                                    }}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                  />
                                  <span>{method.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Vendedor / Mozo asignado */}
                        {(posSellers.length > 0 || (isRestaurantMode && waiters.length > 0)) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {posSellers.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-1">Vendedor asignado</h4>
                                <select
                                  value={assignedSellerId}
                                  onChange={(e) => setAssignedSellerId(e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                                >
                                  <option value="">Sin asignar (puede elegir cualquiera)</option>
                                  {posSellers.map(seller => (
                                    <option key={seller.id} value={seller.id}>
                                      {seller.code ? `${seller.code} - ` : ''}{seller.name}
                                    </option>
                                  ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                  Si se asigna, queda fijo en el POS.
                                </p>
                              </div>
                            )}

                            {isRestaurantMode && waiters.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-1">Mozo por defecto</h4>
                                <select
                                  value={defaultWaiterId}
                                  onChange={(e) => setDefaultWaiterId(e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                                >
                                  <option value="">Sin mozo por defecto</option>
                                  {waiters.map(waiter => (
                                    <option key={waiter.id} value={waiter.id}>
                                      {waiter.code ? `${waiter.code} - ` : ''}{waiter.name}
                                    </option>
                                  ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                  Preseleccionado al ocupar mesa.
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Visualización en POS */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Visualización</h4>
                          <div className="space-y-2">
                            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={hideStockInPOS}
                                onChange={() => setHideStockInPOS(!hideStockInPOS)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">Ocultar stock en productos</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {hideStockInPOS
                                    ? 'El usuario NO verá el stock en las tarjetas del POS.'
                                    : 'El usuario puede ver el stock en las tarjetas del POS.'}
                                </div>
                              </div>
                            </label>

                            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={hideDiscountInPOS}
                                onChange={() => setHideDiscountInPOS(!hideDiscountInPOS)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">Ocultar descuentos en POS</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {hideDiscountInPOS
                                    ? 'El usuario NO podrá aplicar descuentos en el POS.'
                                    : 'El usuario puede aplicar descuentos en el POS.'}
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* === SECCIÓN 5: Información laboral (colapsable) === */}
            <div>
              <button
                type="button"
                onClick={() => setShowPersonnelSection((v) => !v)}
                className={`w-full flex items-center justify-between py-4 transition-colors text-left ${
                  showPersonnelSection ? 'bg-gray-50/60' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-colors ${
                    showPersonnelSection ? 'bg-primary-50' : 'bg-gray-100'
                  }`}>
                    <Briefcase className={`w-4 h-4 ${showPersonnelSection ? 'text-primary-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Información laboral</h3>
                    <p className="text-xs text-gray-500">Cargo, jornada, fecha de ingreso, vacaciones (opcional).</p>
                  </div>
                </div>
                {showPersonnelSection ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {showPersonnelSection && (
                <div className="pb-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                      <Input
                        type="text"
                        value={personnelData.jobTitle}
                        onChange={(e) => setPersonnelData((p) => ({ ...p, jobTitle: e.target.value }))}
                        placeholder="Ej: Cajero, Supervisor, Almacenero"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Área / Departamento</label>
                      <Input
                        type="text"
                        value={personnelData.department}
                        onChange={(e) => setPersonnelData((p) => ({ ...p, department: e.target.value }))}
                        placeholder="Ej: Ventas, Cocina, Logística"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de jornada</label>
                      <select
                        value={personnelData.employmentType}
                        onChange={(e) => setPersonnelData((p) => ({ ...p, employmentType: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                      >
                        <option value="">Sin especificar</option>
                        {EMPLOYMENT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estado RR.HH.</label>
                      <select
                        value={personnelData.hrStatus}
                        onChange={(e) => setPersonnelData((p) => ({ ...p, hrStatus: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                      >
                        {HR_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Refuerzo / eventual */}
                  <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={personnelData.excludeFromSchedule === true}
                      onChange={(e) => setPersonnelData((p) => ({ ...p, excludeFromSchedule: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Refuerzo / Eventual</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        No aparecerá en el planificador de horarios. Útil para mozos refuerzo, freelancers o trabajadores por día. Sigue marcando asistencia.
                      </div>
                    </div>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de ingreso</label>
                      <Input
                        type="date"
                        value={personnelData.hireDate}
                        onChange={(e) => setPersonnelData((p) => ({ ...p, hireDate: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Horas semanales</label>
                      <Input
                        type="number"
                        min="0"
                        max="80"
                        value={personnelData.weeklyHours}
                        onChange={(e) => setPersonnelData((p) => ({ ...p, weeklyHours: e.target.value }))}
                        placeholder="40"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Días de vacaciones / año</label>
                      <Input
                        type="number"
                        min="0"
                        max="60"
                        value={personnelData.vacationDaysPerYear}
                        onChange={(e) => setPersonnelData((p) => ({ ...p, vacationDaysPerYear: e.target.value }))}
                        placeholder="15"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                      <Input
                        type="tel"
                        value={personnelData.phone}
                        onChange={(e) => setPersonnelData((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="+51 999 999 999"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">DNI / Documento</label>
                      <Input
                        type="text"
                        value={personnelData.documentId}
                        onChange={(e) => setPersonnelData((p) => ({ ...p, documentId: e.target.value }))}
                        placeholder="Número de identificación"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                    <Input
                      type="text"
                      value={personnelData.address}
                      onChange={(e) => setPersonnelData((p) => ({ ...p, address: e.target.value }))}
                      placeholder="Dirección de residencia"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notas internas</label>
                    <textarea
                      value={personnelData.notes}
                      onChange={(e) => setPersonnelData((p) => ({ ...p, notes: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                      placeholder="Información adicional, observaciones, etc."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* === SECCIÓN 6: Notificaciones (colapsable) === */}
            <div>
              <button
                type="button"
                onClick={() => setShowNotificationsSection((v) => !v)}
                className={`w-full flex items-center justify-between py-4 transition-colors text-left ${
                  showNotificationsSection ? 'bg-gray-50/60' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-colors ${
                    showNotificationsSection ? 'bg-primary-50' : 'bg-gray-100'
                  }`}>
                    <Bell className={`w-4 h-4 ${showNotificationsSection ? 'text-primary-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Notificaciones</h3>
                    <p className="text-xs text-gray-500">Push al celular y campanita del header.</p>
                  </div>
                </div>
                {showNotificationsSection ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {showNotificationsSection && (
                <div className="pb-5 space-y-2">
                  <p className="text-xs text-gray-500 mb-2">
                    Las notificaciones llegan como push al celular (con la app instalada) y a la campanita del header. Por defecto los sub-usuarios solo reciben las de Yape.
                  </p>

                  {/* Yape */}
                  <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={notificationPreferences.yape_payment === true}
                      onChange={(e) => setNotificationPreferences((p) => ({ ...p, yape_payment: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900">Pago Yape recibido</div>
                        <span className="px-1.5 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-100 rounded">Recomendado</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Avisa cuando entra un pago por Yape. Ideal para cajeros que confirman pagos en el momento.
                      </div>
                    </div>
                  </label>

                  {/* Nuevo pedido */}
                  <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={notificationPreferences.new_order === true}
                      onChange={(e) => setNotificationPreferences((p) => ({ ...p, new_order: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Nuevo pedido</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Pedidos del menú digital, catálogo online, mesas y mozos. Útil para mozos o staff de cocina.
                      </div>
                    </div>
                  </label>

                  {/* Nueva venta */}
                  <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={notificationPreferences.new_sale === true}
                      onChange={(e) => setNotificationPreferences((p) => ({ ...p, new_sale: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Nueva venta facturada</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Cada vez que se emite una boleta o factura.
                      </div>
                    </div>
                  </label>

                  {/* Stock bajo */}
                  <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={notificationPreferences.low_stock === true}
                      onChange={(e) => setNotificationPreferences((p) => ({ ...p, low_stock: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Stock bajo o sin stock</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Alerta cuando un producto llega a su stock mínimo o se agota. Útil para inventario y compras.
                      </div>
                    </div>
                  </label>
                </div>
              )}
            </div>

          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-6 mt-2 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting || selectedPages.length === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : isEditMode ? (
                'Actualizar usuario'
              ) : (
                'Crear usuario'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de reset de contraseña — el owner fija una nueva clave para un
          sub-usuario sin necesidad de que reciba un email (útil cuando el
          email del sub-usuario no es real). Vía Cloud Function con Admin SDK. */}
      <Modal
        isOpen={!!resetTargetUser}
        onClose={resetLoading ? undefined : closeResetPasswordModal}
        title="Resetear contraseña"
      >
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-sm text-purple-900 font-medium flex items-center gap-2">
              <Key className="w-4 h-4" />
              {resetTargetUser?.displayName || resetTargetUser?.email}
            </p>
            <p className="text-xs text-purple-700 mt-1">
              {resetTargetUser?.email}
            </p>
          </div>
          <p className="text-sm text-gray-600">
            La nueva contraseña reemplazará la anterior. El usuario tendrá que iniciar sesión con esta nueva clave en su próxima entrada.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showResetPassword ? 'text' : 'password'}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowResetPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              >
                {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
            <input
              type={showResetPassword ? 'text' : 'password'}
              value={resetPasswordConfirm}
              onChange={(e) => setResetPasswordConfirm(e.target.value)}
              placeholder="Repite la nueva contraseña"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeResetPasswordModal} disabled={resetLoading}>
              Cancelar
            </Button>
            <Button onClick={handleResetPassword} disabled={resetLoading || !resetPassword || resetPassword.length < 6}>
              {resetLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Actualizando...</>
              ) : (
                <><Key className="w-4 h-4 mr-2" /> Guardar nueva contraseña</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Eliminar Usuario */}
      <Modal
        isOpen={!!deleteTargetUser}
        onClose={closeDeleteModal}
        title="Eliminar usuario"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-900 font-medium flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              {deleteTargetUser?.displayName || deleteTargetUser?.email}
            </p>
            <p className="text-xs text-red-700 mt-1">{deleteTargetUser?.email}</p>
          </div>

          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-medium">Esta acción no se puede deshacer.</p>
              <p className="mt-1 text-amber-800">
                Por seguridad, el sistema <strong>no elimina la cuenta de acceso (Firebase Auth)</strong>,
                solo borra los permisos y datos del usuario. Por eso <strong>no podrás volver a crear
                un usuario con el mismo correo</strong> ({deleteTargetUser?.email}). Si más adelante
                necesitas un usuario para esta persona, deberás usar un correo distinto.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deleteConfirmChecked}
              onChange={(e) => setDeleteConfirmChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">
              Entiendo que es permanente y que no podré reutilizar este correo.
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeDeleteModal} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteUser}
              disabled={deleteLoading || !deleteConfirmChecked}
            >
              {deleteLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Eliminando...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> Eliminar usuario</>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
