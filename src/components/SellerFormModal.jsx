import { useState, useEffect } from 'react'
import { Loader2, User, Store } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { createSeller, updateSeller } from '@/services/sellerService'
import { getActiveBranches } from '@/services/branchService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'

export default function SellerFormModal({ isOpen, onClose, seller, onSuccess }) {
  const { getBusinessId } = useAppContext()
  const toast = useToast()

  const [isLoading, setIsLoading] = useState(false)
  const [branches, setBranches] = useState([])
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    phone: '',
    email: '',
    dni: '',
    branchId: '', // Sucursal asignada
  })

  const [errors, setErrors] = useState({})

  // Cargar sucursales
  useEffect(() => {
    const loadBranches = async () => {
      const businessId = getBusinessId()
      if (!businessId) return
      const result = await getActiveBranches(businessId)
      if (result.success) {
        setBranches(result.data || [])
      }
    }
    if (isOpen) {
      loadBranches()
    }
  }, [isOpen, getBusinessId])

  // Cargar datos del vendedor si es edición
  useEffect(() => {
    if (seller) {
      setFormData({
        name: seller.name || '',
        code: seller.code || '',
        phone: seller.phone || '',
        email: seller.email || '',
        dni: seller.dni || '',
        branchId: seller.branchId || '',
      })
    } else {
      // Reset form for new seller
      setFormData({
        name: '',
        code: '',
        phone: '',
        email: '',
        dni: '',
        branchId: '',
      })
    }
    setErrors({})
  }, [seller, isOpen])

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
      const result = seller
        ? await updateSeller(businessId, seller.id, formData)
        : await createSeller(businessId, formData)

      if (result.success) {
        toast.success(seller ? 'Vendedor actualizado correctamente' : 'Vendedor creado correctamente')
        onSuccess()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error al guardar vendedor:', error)
      toast.error('Error al guardar vendedor')
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
          {seller ? 'Editar Vendedor' : 'Nuevo Vendedor'}
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
            placeholder="Ej: María García"
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
            placeholder="Ej: V001"
            error={errors.code}
            required
          />
          {errors.code && <p className="text-red-500 text-sm mt-1">{errors.code}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Código único para identificar al vendedor
          </p>
        </div>

        {/* DNI */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            DNI
          </label>
          <Input
            type="text"
            name="dni"
            value={formData.dni}
            onChange={handleChange}
            placeholder="Ej: 12345678"
            maxLength="8"
          />
        </div>

        {/* Sucursal */}
        {branches.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Store className="w-4 h-4 inline mr-1" />
              Sucursal
            </label>
            <select
              name="branchId"
              value={formData.branchId}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Sucursal Principal</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Sucursal donde trabaja el vendedor
            </p>
          </div>
        )}

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
            placeholder="Ej: maria@example.com"
          />
        </div>

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
            ) : seller ? (
              'Actualizar'
            ) : (
              'Crear Vendedor'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
