import { useState, useEffect } from 'react'
import { Users as UsersIcon, Plus, Edit2, Trash2, Shield, Loader2, Eye, EyeOff } from 'lucide-react'
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
} from '@/services/userManagementService'
import { formatDate } from '@/lib/utils'

export default function Users() {
  const { user, isAdmin, isBusinessOwner } = useAuth()
  const { businessMode } = useAppContext()
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedPages, setSelectedPages] = useState([])
  const [showPassword, setShowPassword] = useState(false)

  // Obtener páginas disponibles según el modo del negocio
  const availablePages = getAvailablePagesByMode(businessMode)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm()

  useEffect(() => {
    loadUsers()
  }, [user])

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

  const openCreateModal = () => {
    setIsEditMode(false)
    setSelectedUser(null)
    setSelectedPages([])
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

  const onSubmit = async (data) => {
    try {
      if (selectedPages.length === 0) {
        toast.error('Debes seleccionar al menos una página')
        return
      }

      if (isEditMode) {
        // Actualizar usuario existente
        const updateResult = await updateUserData(selectedUser.id, {
          displayName: data.displayName,
        })

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
        const result = await createManagedUser(user.uid, {
          email: data.email,
          password: data.password,
          displayName: data.displayName,
          allowedPages: selectedPages,
        })

        if (result.success) {
          toast.success('Usuario creado exitosamente')
          setIsModalOpen(false)
          reset()
          setSelectedPages([])
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
                  <TableHead>Páginas Permitidas</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">
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
                      <TableCell>
                        <span className="text-sm font-semibold text-primary-600">
                          {userItem.allowedPages?.length || 0} páginas
                        </span>
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

      {/* Modal de Crear/Editar Usuario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditMode ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Datos básicos */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Datos del Usuario</h3>

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

          {/* Selección de páginas con checkboxes */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Permisos de Acceso</h3>
              <button
                type="button"
                onClick={selectAllPages}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {selectedPages.length === availablePages.length
                  ? 'Desmarcar Todas'
                  : 'Marcar Todas'}
              </button>
            </div>

            <p className="text-sm text-gray-600">
              Selecciona las páginas a las que este usuario tendrá acceso
            </p>

            <div className="border border-gray-200 rounded-lg p-4 max-h-80 overflow-y-auto">
              <div className="space-y-3">
                {availablePages.map((page) => (
                  <label
                    key={page.id}
                    className="flex items-center p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPages.includes(page.id)}
                      onChange={() => togglePageSelection(page.id)}
                      className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="ml-3">
                      <p className="font-medium text-gray-900">{page.name}</p>
                      <p className="text-xs text-gray-500">{page.path}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {selectedPages.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">{selectedPages.length}</span> página
                  {selectedPages.length !== 1 ? 's' : ''} seleccionada
                  {selectedPages.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
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
