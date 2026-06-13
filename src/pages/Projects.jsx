import { useState, useEffect } from 'react'
import { HardHat, Plus, Search, MapPin, Calendar, Edit, Trash2, CheckCircle, Clock, XCircle, Loader2, User, Phone, MoreVertical } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getProjects, createProject, updateProject, deleteProject } from '@/services/projectService'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const projectSchema = z.object({
  name: z.string().min(1, 'Nombre del proyecto es requerido'),
  code: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  responsibleName: z.string().optional(),
  responsiblePhone: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

const STATUS_CONFIG = {
  active: { label: 'Activo', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  paused: { label: 'Pausado', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  finished: { label: 'Finalizado', color: 'bg-gray-100 text-gray-700', icon: XCircle },
}

export default function Projects() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()

  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [deletingProject, setDeletingProject] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '', code: '', address: '', city: '', description: '',
      responsibleName: '', responsiblePhone: '', startDate: '', endDate: '',
    },
  })

  useEffect(() => {
    loadProjects()
  }, [user])

  const loadProjects = async () => {
    if (!user?.uid) return
    setIsLoading(true)
    try {
      if (isDemoMode) {
        setProjects(demoData?.projects || [])
        return
      }
      const result = await getProjects(getBusinessId())
      if (result.success) {
        setProjects(result.data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingProject(null)
    reset({ name: '', code: '', address: '', city: '', description: '', responsibleName: '', responsiblePhone: '', startDate: '', endDate: '' })
    setIsModalOpen(true)
  }

  const openEditModal = (project) => {
    setEditingProject(project)
    reset({
      name: project.name || '',
      code: project.code || '',
      address: project.address || '',
      city: project.city || '',
      description: project.description || '',
      responsibleName: project.responsibleName || '',
      responsiblePhone: project.responsiblePhone || '',
      startDate: project.startDate || '',
      endDate: project.endDate || '',
    })
    setIsModalOpen(true)
    setOpenMenuId(null)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingProject(null)
    reset()
  }

  const onSubmit = async (data) => {
    if (isDemoMode) {
      toast.error('No disponible en modo demo')
      return
    }
    setIsSaving(true)
    try {
      let result
      if (editingProject) {
        result = await updateProject(getBusinessId(), editingProject.id, data)
      } else {
        result = await createProject(getBusinessId(), data)
      }
      if (result.success) {
        toast.success(editingProject ? 'Proyecto actualizado' : 'Proyecto creado exitosamente')
        closeModal()
        loadProjects()
      } else {
        toast.error(result.error || 'Error al guardar')
      }
    } catch (error) {
      toast.error('Error inesperado')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingProject || isDemoMode) return
    setIsSaving(true)
    try {
      const result = await deleteProject(getBusinessId(), deletingProject.id)
      if (result.success) {
        toast.success('Proyecto eliminado')
        setDeletingProject(null)
        loadProjects()
      } else {
        toast.error(result.error || 'Error al eliminar')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleStatusChange = async (project, newStatus) => {
    if (isDemoMode) return
    const result = await updateProject(getBusinessId(), project.id, { status: newStatus })
    if (result.success) {
      toast.success(`Estado cambiado a ${STATUS_CONFIG[newStatus].label}`)
      loadProjects()
    }
    setOpenMenuId(null)
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return '-'
    if (timestamp.toDate) return timestamp.toDate().toLocaleDateString('es-PE')
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleDateString('es-PE')
    return timestamp
  }

  // Filtrar proyectos
  const filtered = projects.filter(p => {
    const matchSearch = !searchTerm ||
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.responsibleName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = filterStatus === 'all' || p.status === filterStatus
    return matchSearch && matchStatus
  })

  // Stats
  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    paused: projects.filter(p => p.status === 'paused').length,
    finished: projects.filter(p => p.status === 'finished').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HardHat className="w-7 h-7 text-indigo-600" />
            Proyectos / Obras
          </h1>
          <p className="text-gray-600 mt-1">Gestiona tus proyectos y obras activas</p>
        </div>
        <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Proyecto
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Total</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          <p className="text-xs text-gray-500">Activos</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600">{stats.paused}</p>
          <p className="text-xs text-gray-500">Pausados</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-gray-500">{stats.finished}</p>
          <p className="text-xs text-gray-500">Finalizados</p>
        </CardContent></Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, código, dirección..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="paused">Pausados</option>
          <option value="finished">Finalizados</option>
        </select>
      </div>

      {/* Lista de proyectos */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <HardHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {projects.length === 0 ? 'Sin proyectos' : 'Sin resultados'}
            </h3>
            <p className="text-gray-500 mb-4">
              {projects.length === 0 ? 'Crea tu primer proyecto u obra para empezar.' : 'Intenta con otros filtros.'}
            </p>
            {projects.length === 0 && (
              <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Crear Proyecto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(project => {
            const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.active
            const StatusIcon = statusConfig.icon
            return (
              <Card key={project.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  {/* Header de la tarjeta */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                      {project.code && (
                        <span className="text-xs text-indigo-600 font-mono">{project.code}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </span>
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenuId === project.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute right-0 top-8 z-20 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                              <button onClick={() => openEditModal(project)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <Edit className="w-4 h-4" /> Editar
                              </button>
                              {project.status !== 'active' && (
                                <button onClick={() => handleStatusChange(project, 'active')} className="w-full text-left px-3 py-2 text-sm text-green-700 hover:bg-green-50 flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4" /> Marcar Activo
                                </button>
                              )}
                              {project.status !== 'paused' && (
                                <button onClick={() => handleStatusChange(project, 'paused')} className="w-full text-left px-3 py-2 text-sm text-yellow-700 hover:bg-yellow-50 flex items-center gap-2">
                                  <Clock className="w-4 h-4" /> Pausar
                                </button>
                              )}
                              {project.status !== 'finished' && (
                                <button onClick={() => handleStatusChange(project, 'finished')} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                  <XCircle className="w-4 h-4" /> Finalizar
                                </button>
                              )}
                              <div className="border-t border-gray-100 my-1" />
                              <button onClick={() => { setDeletingProject(project); setOpenMenuId(null) }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                <Trash2 className="w-4 h-4" /> Eliminar
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Detalles */}
                  {project.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{project.description}</p>
                  )}

                  <div className="space-y-1.5 text-sm text-gray-600">
                    {project.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{project.address}{project.city ? `, ${project.city}` : ''}</span>
                      </div>
                    )}
                    {project.responsibleName && (
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{project.responsibleName}</span>
                      </div>
                    )}
                    {project.responsiblePhone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span>{project.responsiblePhone}</span>
                      </div>
                    )}
                    {(project.startDate || project.endDate) && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span>{project.startDate || '?'} → {project.endDate || '?'}</span>
                      </div>
                    )}
                  </div>

                  {/* Fecha de creación */}
                  <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
                    Creado: {formatDate(project.createdAt)}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del proyecto *</label>
              <input
                {...register('name')}
                placeholder="Ej: Edificio Los Álamos"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
              <input
                {...register('code')}
                placeholder="Ej: OBR-001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
              <input
                {...register('city')}
                placeholder="Ej: Lima"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <input
                {...register('address')}
                placeholder="Dirección de la obra"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                {...register('description')}
                rows={2}
                placeholder="Descripción breve del proyecto"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
              <input
                {...register('responsibleName')}
                placeholder="Nombre del responsable"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono responsable</label>
              <input
                {...register('responsiblePhone')}
                placeholder="987654321"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
              <input
                type="date"
                {...register('startDate')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin estimada</label>
              <input
                type="date"
                {...register('endDate')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" onClick={closeModal} variant="outline">Cancelar</Button>
            <Button type="submit" disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingProject ? 'Guardar Cambios' : 'Crear Proyecto'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingProject}
        onClose={() => setDeletingProject(null)}
        title="Eliminar Proyecto"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            ¿Estás seguro de eliminar el proyecto <strong>{deletingProject?.name}</strong>? Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <Button onClick={() => setDeletingProject(null)} variant="outline">Cancelar</Button>
            <Button onClick={handleDelete} disabled={isSaving} className="bg-red-600 hover:bg-red-700 text-white">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
