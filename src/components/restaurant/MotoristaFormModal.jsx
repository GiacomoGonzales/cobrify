import { useState, useEffect } from 'react'
import { Loader2, Bike } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createMotorista, updateMotorista } from '@/services/motoristaService'
import { getActiveBranches } from '@/services/branchService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'

export default function MotoristaFormModal({ isOpen, onClose, motorista, onSuccess }) {
  const { getBusinessId, filterBranchesByAccess, allowedBranches, hasMainBranchAccess, businessSettings, branchScope } = useAppContext()
  const toast = useToast()

  const [isLoading, setIsLoading] = useState(false)
  // Sucursales habilitadas para el usuario: para asignar la sede del motorista.
  const [branches, setBranches] = useState([])
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    phone: '',
    email: '',
    vehicleType: 'moto',
    licensePlate: '',
    paymentType: 'per_delivery',
    ratePerDelivery: '',
    fixedSalary: '',
    branchId: null,
  })

  const [errors, setErrors] = useState({})

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

  useEffect(() => {
    if (motorista) {
      setFormData({
        name: motorista.name || '',
        code: motorista.code || '',
        phone: motorista.phone || '',
        email: motorista.email || '',
        vehicleType: motorista.vehicleType || 'moto',
        licensePlate: motorista.licensePlate || '',
        paymentType: motorista.paymentType || 'per_delivery',
        ratePerDelivery: motorista.ratePerDelivery || '',
        fixedSalary: motorista.fixedSalary || '',
        branchId: motorista.branchId || null,
      })
    } else {
      // La sede por defecto sale del selector del header: si estás viendo
      // "Sede Norte" y creas un motorista, lo normal es que sea de ahí — y con
      // la lista acotada a esa sede, nacer en la Principal lo haría desaparecer
      // apenas se guarda. Con "Todas" se cae al criterio de siempre.
      const sedePorDefecto = (() => {
        if (branchScope && branchScope !== 'all') {
          if (branchScope === 'main') return hasMainBranchAccess ? null : (branches[0]?.id || null)
          if (branches.some(b => b.id === branchScope)) return branchScope
        }
        return !hasMainBranchAccess && branches.length > 0 ? branches[0].id : null
      })()
      setFormData({
        name: '',
        code: '',
        phone: '',
        email: '',
        vehicleType: 'moto',
        licensePlate: '',
        paymentType: 'per_delivery',
        ratePerDelivery: '',
        fixedSalary: '',
        branchId: sedePorDefecto,
      })
    }
    setErrors({})
  }, [motorista, isOpen, branches, hasMainBranchAccess, branchScope])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido'
    if (!formData.code.trim()) newErrors.code = 'El código es requerido'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const result = motorista
        ? await updateMotorista(businessId, motorista.id, formData)
        : await createMotorista(businessId, formData)

      if (result.success) {
        toast.success(motorista ? 'Motorista actualizado correctamente' : 'Motorista creado correctamente')
        onSuccess()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error al guardar motorista:', error)
      toast.error('Error al guardar motorista')
    } finally {
      setIsLoading(false)
    }
  }

  const showLicensePlate = formData.vehicleType === 'moto' || formData.vehicleType === 'auto'
  const showRate = formData.paymentType === 'per_delivery' || formData.paymentType === 'mixed'
  const showSalary = formData.paymentType === 'fixed' || formData.paymentType === 'mixed'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Bike className="w-5 h-5" />
          {motorista ? 'Editar Motorista' : 'Nuevo Motorista'}
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
            placeholder="Ej: Carlos López"
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
            placeholder="Ej: MOT001"
            error={errors.code}
            required
          />
          {errors.code && <p className="text-red-500 text-sm mt-1">{errors.code}</p>}
          <p className="text-xs text-gray-500 mt-1">Código único para identificar al motorista</p>
        </div>

        {/* Teléfono y Email */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono</label>
            <Input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Ej: 987654321"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Ej: carlos@email.com"
            />
          </div>
        </div>

        {/* Tipo de vehículo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Vehículo</label>
          <Select name="vehicleType" value={formData.vehicleType} onChange={handleChange}>
            <option value="moto">Moto</option>
            <option value="auto">Auto</option>
            <option value="bicicleta">Bicicleta</option>
            <option value="pie">A pie</option>
          </Select>
        </div>

        {/* Placa (solo moto/auto) */}
        {showLicensePlate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Placa del Vehículo</label>
            <Input
              type="text"
              name="licensePlate"
              value={formData.licensePlate}
              onChange={handleChange}
              placeholder="Ej: ABC-123"
            />
          </div>
        )}

        {/* Tipo de pago */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Pago</label>
          <Select name="paymentType" value={formData.paymentType} onChange={handleChange}>
            <option value="per_delivery">Por entrega</option>
            <option value="fixed">Fijo</option>
            <option value="mixed">Mixto</option>
          </Select>
        </div>

        {/* Tarifa por entrega */}
        {showRate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tarifa por Entrega (S/)</label>
            <Input
              type="number"
              name="ratePerDelivery"
              value={formData.ratePerDelivery}
              onChange={handleChange}
              placeholder="Ej: 5.00"
              step="0.01"
              min="0"
            />
          </div>
        )}

        {/* Salario fijo */}
        {showSalary && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Salario Fijo (S/)</label>
            <Input
              type="number"
              name="fixedSalary"
              value={formData.fixedSalary}
              onChange={handleChange}
              placeholder="Ej: 1200.00"
              step="0.01"
              min="0"
            />
          </div>
        )}

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
              {hasMainBranchAccess && <option value="">{businessSettings?.mainBranchName || 'Sucursal Principal'}</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              El motorista solo aparecerá en esta sede.
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
            ) : motorista ? (
              'Actualizar'
            ) : (
              'Crear Motorista'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
