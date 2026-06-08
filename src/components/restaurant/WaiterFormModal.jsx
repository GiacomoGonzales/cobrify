import { useState, useEffect } from 'react'
import { Loader2, User } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createWaiter, updateWaiter } from '@/services/waiterService'
import { getActiveBranches } from '@/services/branchService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'

export default function WaiterFormModal({ isOpen, onClose, waiter, onSuccess }) {
  const { getBusinessId, filterBranchesByAccess, allowedBranches, hasMainBranchAccess } = useAppContext()
  const toast = useToast()

  const [isLoading, setIsLoading] = useState(false)
  // Sucursales (sedes) habilitadas para el usuario: para asignar la sede del mozo
  const [branches, setBranches] = useState([])
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    phone: '',
    email: '',
    shift: 'Mañana',
    startTime: '08:00',
    branchId: null,
  })

  const [errors, setErrors] = useState({})

  // Cargar sucursales habilitadas para el usuario
  useEffect(() => {
    if (!isOpen) return
    const loadBranches = async () => {
      try {
        const result = await getActiveBranches(getBusinessId())
        if (result.success) {
          const list = filterBranchesByAccess ? filterBranchesByAccess(result.data || []) : (result.data || [])
          setBranches(list)
        }
      } catch (error) {
        console.error('Error al cargar sucursales:', error)
      }
    }
    loadBranches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, allowedBranches])

  // Cargar datos del mozo si es edición
  useEffect(() => {
    if (waiter) {
      setFormData({
        name: waiter.name || '',
        code: waiter.code || '',
        phone: waiter.phone || '',
        email: waiter.email || '',
        shift: waiter.shift || 'Mañana',
        startTime: waiter.startTime || '08:00',
        branchId: waiter.branchId || null,
      })
    } else {
      // Reset form for new waiter.
      // Por defecto: Sucursal Principal si tiene acceso; si está restringido a
      // sucursales, fijar la primera permitida.
      setFormData({
        name: '',
        code: '',
        phone: '',
        email: '',
        shift: 'Mañana',
        startTime: '08:00',
        branchId: !hasMainBranchAccess && branches.length > 0 ? branches[0].id : null,
      })
    }
    setErrors({})
  }, [waiter, isOpen, branches, hasMainBranchAccess])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error when user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido'
    }

    if (!formData.code.trim()) {
      newErrors.code = 'El código es requerido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validate()) return

    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const result = waiter
        ? await updateWaiter(businessId, waiter.id, formData)
        : await createWaiter(businessId, formData)

      if (result.success) {
        toast.success(waiter ? 'Mozo actualizado correctamente' : 'Mozo creado correctamente')
        onSuccess()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error al guardar mozo:', error)
      toast.error('Error al guardar mozo')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <User className="w-5 h-5" />
          {waiter ? 'Editar Mozo' : 'Nuevo Mozo'}
        </div>
      }
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nombre Completo *
          </label>
          <Input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Ej: Juan Pérez"
            error={errors.name}
            required
          />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
        </div>

        {/* Código */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Código *
          </label>
          <Input
            type="text"
            name="code"
            value={formData.code}
            onChange={handleChange}
            placeholder="Ej: M001"
            error={errors.code}
            required
          />
          {errors.code && <p className="text-red-500 text-sm mt-1">{errors.code}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Código único para identificar al mozo
          </p>
        </div>

        {/* Teléfono */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Teléfono
          </label>
          <Input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="Ej: 987654321"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <Input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Ej: juan@example.com"
          />
        </div>

        {/* Turno */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Turno
          </label>
          <Select name="shift" value={formData.shift} onChange={handleChange}>
            <option value="Mañana">Mañana</option>
            <option value="Tarde">Tarde</option>
            <option value="Noche">Noche</option>
            <option value="Completo">Completo</option>
          </Select>
        </div>

        {/* Hora de inicio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hora de Inicio
          </label>
          <Input
            type="time"
            name="startTime"
            value={formData.startTime}
            onChange={handleChange}
          />
        </div>

        {/* Sede (solo si el negocio tiene sucursales) */}
        {branches.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sede
            </label>
            <Select
              value={formData.branchId || ''}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, branchId: e.target.value || null }))
              }
            >
              {hasMainBranchAccess && <option value="">Sucursal Principal</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              El mozo solo aparecerá en esta sede.
            </p>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading} className="flex-1">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : waiter ? (
              'Actualizar'
            ) : (
              'Crear Mozo'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
