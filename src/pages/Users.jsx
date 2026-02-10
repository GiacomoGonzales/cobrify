import { useState, useEffect, useMemo } from 'react'
import { Users as UsersIcon, Plus, Edit2, Trash2, Shield, Loader2, Eye, EyeOff, UserCheck, Warehouse, Store, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
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
  deleteManagedUser,
  CATEGORY_NAMES,
} from '@/services/userManagementService'
import { getWarehouses } from '@/services/warehouseService'
import { getActiveBranches } from '@/services/branchService'
import { getSellers } from '@/services/sellerService'
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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedPages, setSelectedPages] = useState([])
  const [selectedWarehouses, setSelectedWarehouses] = useState([])
  const [selectedBranches, setSelectedBranches] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [allowedDocumentTypes, setAllowedDocumentTypes] = useState([])
  const [allowedPaymentMethods, setAllowedPaymentMethods] = useState([])
  const [posSellers, setPosSellers] = useState([])
  const [assignedSellerId, setAssignedSellerId] = useState('')

  // Verificar si estamos en modo inmobiliaria
  const isRealEstateMode = businessMode === 'real_estate'

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
  }, [user, isRealEstateMode])

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
    reset({
      email: '',
      password: '',
      displayName: '',
    })
    setIsModalOpen(true)
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

      if (isEditMode) {
        // Actualizar usuario existente
        const selectedSellerObj = posSellers.find(s => s.id === assignedSellerId)
        const updateData = {
          displayName: data.displayName,
          allowedWarehouses: selectedWarehouses,
          allowedBranches: selectedBranches,
          allowedDocumentTypes,
          allowedPaymentMethods,
          assignedSellerId: assignedSellerId || null,
          assignedSellerName: selectedSellerObj?.name || null,
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

  const handleDelete = async (userId) => {
    if (!window.confirm('¿Estás seguro de eliminar este usuario?')) {
      return
    }

    try {
      const result = await deleteManagedUser(userId)
      if (result.success) {
        toast.success('Usuario eliminado')
        loadUsers()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar usuario:', error)
      toast.error('Error al eliminar usuario')
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

      {/* Tabla de usuarios */}
      <Card>
        <CardHeader>
          <CardTitle>Usuarios Registrados ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isRealEstateMode ? 8 : 7} className="text-center py-8 text-gray-500">
                      <UsersIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p>No hay usuarios creados</p>
                      <p className="text-sm">Crea tu primer usuario para comenzar</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((userItem) => (
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
                            onClick={() => openEditModal(userItem)}
                            className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(userItem.id)}
                            className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Crear/Editar Usuario - Amplio y organizado */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditMode ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
        size="5xl"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* COLUMNA IZQUIERDA - Datos del usuario */}
            <div className="space-y-5">
              {/* Datos básicos */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <UsersIcon className="w-5 h-5 text-primary-600" />
                  Datos del Usuario
                </h3>

                <Input
                  label="Nombre Completo"
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

              {/* Vinculación con Agente (solo en modo inmobiliaria) */}
              {isRealEstateMode && agents.length > 0 && (
                <div className="bg-cyan-50 rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-cyan-600" />
                    Vincular con Agente
                  </h3>
                  <p className="text-sm text-gray-600">
                    Vincula al usuario con un agente para que vea solo sus comisiones
                  </p>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full px-3 py-2 border border-cyan-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white"
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

              {/* Restricción de Almacenes */}
              {warehouses.length > 0 && (
                <div className="bg-amber-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Warehouse className="w-5 h-5 text-amber-600" />
                      Almacenes
                    </h3>
                    <button
                      type="button"
                      onClick={selectAllWarehouses}
                      className="text-xs text-amber-700 hover:text-amber-800 font-medium"
                    >
                      {selectedWarehouses.length === warehouses.length ? 'Ninguno' : 'Todos'}
                    </button>
                  </div>
                  <p className="text-xs text-amber-700">
                    Sin selección = acceso a todos
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {warehouses.map((warehouse) => (
                      <label
                        key={warehouse.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                          selectedWarehouses.includes(warehouse.id)
                            ? 'bg-amber-200 text-amber-900'
                            : 'bg-white hover:bg-amber-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedWarehouses.includes(warehouse.id)}
                          onChange={() => toggleWarehouseSelection(warehouse.id)}
                          className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
                        />
                        <span className="truncate">{warehouse.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Restricción de Sucursales */}
              {branches.length > 0 && (
                <div className="bg-cyan-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Store className="w-5 h-5 text-cyan-600" />
                      Sucursales
                    </h3>
                    <button
                      type="button"
                      onClick={selectAllBranches}
                      className="text-xs text-cyan-700 hover:text-cyan-800 font-medium"
                    >
                      {selectedBranches.length === branches.length + 1 ? 'Ninguna' : 'Todas'}
                    </button>
                  </div>
                  <p className="text-xs text-cyan-700">
                    Sin selección = acceso a todas
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    <label
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                        selectedBranches.includes('main')
                          ? 'bg-cyan-200 text-cyan-900'
                          : 'bg-white hover:bg-cyan-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedBranches.includes('main')}
                        onChange={() => toggleBranchSelection('main')}
                        className="w-4 h-4 text-cyan-600 border-cyan-300 rounded focus:ring-cyan-500"
                      />
                      <span className="truncate">Principal</span>
                    </label>
                    {branches.map((branch) => (
                      <label
                        key={branch.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                          selectedBranches.includes(branch.id)
                            ? 'bg-cyan-200 text-cyan-900'
                            : 'bg-white hover:bg-cyan-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedBranches.includes(branch.id)}
                          onChange={() => toggleBranchSelection(branch.id)}
                          className="w-4 h-4 text-cyan-600 border-cyan-300 rounded focus:ring-cyan-500"
                        />
                        <span className="truncate">{branch.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Restricciones POS (solo si POS está en selectedPages) */}
              {selectedPages.includes('pos') && (
                <div className="bg-purple-50 rounded-xl p-4 space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-purple-600" />
                    Restricciones POS
                  </h3>
                  <p className="text-xs text-purple-700">
                    Si no se selecciona ninguno, se permiten todos
                  </p>

                  {/* Tipos de comprobante */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Tipos de Comprobante:</p>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { id: 'boleta', label: 'Boleta de Venta' },
                        { id: 'factura', label: 'Factura Electrónica' },
                        { id: 'nota_venta', label: 'Nota de Venta' },
                      ].map(docType => (
                        <label
                          key={docType.id}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                            allowedDocumentTypes.includes(docType.id)
                              ? 'bg-purple-200 text-purple-900'
                              : 'bg-white hover:bg-purple-100'
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
                            className="w-4 h-4 text-purple-600 border-purple-300 rounded focus:ring-purple-500"
                          />
                          <span>{docType.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Métodos de pago */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Métodos de Pago:</p>
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
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                            allowedPaymentMethods.includes(method.id)
                              ? 'bg-purple-200 text-purple-900'
                              : 'bg-white hover:bg-purple-100'
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
                            className="w-4 h-4 text-purple-600 border-purple-300 rounded focus:ring-purple-500"
                          />
                          <span>{method.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Vendedor asignado */}
                  {posSellers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">Vendedor Asignado:</p>
                      <select
                        value={assignedSellerId}
                        onChange={(e) => setAssignedSellerId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                      >
                        <option value="">Sin asignar (puede elegir cualquiera)</option>
                        {posSellers.map(seller => (
                          <option key={seller.id} value={seller.id}>
                            {seller.code ? `${seller.code} - ` : ''}{seller.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-purple-600">
                        Si se asigna, el vendedor queda fijo en el POS y no se puede cambiar
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* COLUMNA DERECHA - Permisos de páginas */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Permisos de Acceso</h3>
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

              {/* Lista de páginas por categoría */}
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[460px] overflow-y-auto">
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
                          <span className="font-medium text-gray-700">
                            {CATEGORY_NAMES[category] || category}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({selectedInCategory}/{pages.length})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCategoryPages(category)
                          }}
                          className={`p-1 rounded transition-colors ${
                            allSelected
                              ? 'text-green-600 hover:bg-green-100'
                              : someSelected
                              ? 'text-amber-600 hover:bg-amber-100'
                              : 'text-gray-400 hover:bg-gray-200'
                          }`}
                        >
                          {allSelected ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : someSelected ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : (
                            <XCircle className="w-5 h-5" />
                          )}
                        </button>
                      </div>

                      {/* Páginas de la categoría */}
                      {expandedCategories[category] && (
                        <div className="grid grid-cols-2 gap-1 p-2">
                          {pages.map((page) => (
                            <label
                              key={page.id}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all text-sm ${
                                selectedPages.includes(page.id)
                                  ? 'bg-primary-100 text-primary-900 ring-1 ring-primary-300'
                                  : 'hover:bg-gray-100'
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
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">
                    Debes seleccionar al menos una página
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200">
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
                'Actualizar Usuario'
              ) : (
                'Crear Usuario'
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
