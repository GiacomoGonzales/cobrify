import React, { useState } from 'react'
import { UserPlus, Loader2, CheckCircle, Eye, EyeOff, Search } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { registerBusinessAsAdmin } from '@/services/authService'
import { consultarRUC } from '@/services/documentLookupService'

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  ruc: '',
  businessName: '',
  tradeName: '',
  phone: '',
  address: '',
  department: '',
  province: '',
  district: '',
}

export default function AdminCreateAccount() {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [lookingUpRuc, setLookingUpRuc] = useState(false)
  const [lastCreated, setLastCreated] = useState(null)

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  // Buscar datos del RUC en SUNAT y rellenar el formulario automáticamente
  const handleLookupRuc = async () => {
    const ruc = form.ruc.trim()
    if (!/^\d{11}$/.test(ruc)) {
      toast.error('Ingresa un RUC válido de 11 dígitos')
      return
    }
    setLookingUpRuc(true)
    try {
      const result = await consultarRUC(ruc)
      if (result.success) {
        setForm((prev) => ({
          ...prev,
          businessName: result.data.razonSocial || prev.businessName,
          tradeName: result.data.nombreComercial || prev.tradeName,
          address: result.data.direccion || prev.address,
          department: result.data.departamento || prev.department,
          province: result.data.provincia || prev.province,
          district: result.data.distrito || prev.district,
        }))
        toast.success('Datos del RUC cargados')
      } else {
        toast.error(result.error || 'No se encontraron datos para este RUC')
      }
    } catch (err) {
      console.error('Error al buscar RUC:', err)
      toast.error('Error al consultar el RUC. Intenta nuevamente.')
    } finally {
      setLookingUpRuc(false)
    }
  }

  const validate = () => {
    if (!form.name.trim()) return 'Ingresa el nombre del responsable.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return 'Ingresa un correo válido.'
    if (form.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'
    if (!/^\d{11}$/.test(form.ruc.trim())) return 'El RUC debe tener 11 dígitos.'
    if (!form.businessName.trim()) return 'Ingresa la razón social.'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }

    setSubmitting(true)
    try {
      const result = await registerBusinessAsAdmin(
        form.email.trim(),
        form.password,
        form.name.trim(),
        {
          ruc: form.ruc.trim(),
          businessName: form.businessName.trim(),
          tradeName: form.tradeName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          department: form.department.trim(),
          province: form.province.trim(),
          district: form.district.trim(),
        }
      )

      if (result.success) {
        toast.success('Cuenta creada correctamente')
        setLastCreated({ email: form.email.trim(), businessName: form.businessName.trim() })
        setForm(EMPTY_FORM)
      } else {
        toast.error(result.error || 'No se pudo crear la cuenta')
      }
    } catch (err) {
      console.error('Error al crear cuenta:', err)
      toast.error('Ocurrió un error al crear la cuenta')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Crear Nueva Cuenta</h2>
        <p className="text-sm text-gray-500">Registra un nuevo negocio sin salir de tu sesión de administrador.</p>
      </div>

      {lastCreated && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-800">
            <p className="font-medium">Última cuenta creada</p>
            <p className="text-green-700">{lastCreated.businessName} · {lastCreated.email}</p>
            <p className="text-xs text-green-600 mt-1">Nace en plan de prueba. Asigna su plan o pago desde la sección Usuarios.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos de acceso */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-1">Datos de acceso</h3>
          <p className="text-sm text-gray-500 mb-4">Con estos datos el cliente iniciará sesión.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nombre del responsable *</label>
              <input type="text" value={form.name} onChange={setField('name')} className={inputClass} placeholder="Ej: Juan Pérez" autoComplete="off" />
            </div>
            <div>
              <label className={labelClass}>Correo electrónico *</label>
              <input type="email" value={form.email} onChange={setField('email')} className={inputClass} placeholder="correo@empresa.com" autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Contraseña *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={setField('password')}
                  className={`${inputClass} pr-10`}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Datos del negocio */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-1">Datos del negocio</h3>
          <p className="text-sm text-gray-500 mb-4">Información fiscal y de contacto de la empresa.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>RUC *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.ruc}
                  onChange={setField('ruc')}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLookupRuc() } }}
                  className={`${inputClass} flex-1`}
                  placeholder="20123456789"
                />
                <button
                  type="button"
                  onClick={handleLookupRuc}
                  disabled={lookingUpRuc}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex-shrink-0"
                  title="Buscar datos del RUC en SUNAT"
                >
                  {lookingUpRuc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span className="hidden sm:inline">Buscar</span>
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Razón social *</label>
              <input type="text" value={form.businessName} onChange={setField('businessName')} className={inputClass} placeholder="EMPRESA SAC" />
            </div>
            <div>
              <label className={labelClass}>Nombre comercial</label>
              <input type="text" value={form.tradeName} onChange={setField('tradeName')} className={inputClass} placeholder="Opcional" />
            </div>
            <div>
              <label className={labelClass}>Teléfono</label>
              <input type="tel" value={form.phone} onChange={setField('phone')} className={inputClass} placeholder="Opcional" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Dirección</label>
              <input type="text" value={form.address} onChange={setField('address')} className={inputClass} placeholder="Av. Principal 123" />
            </div>
            <div>
              <label className={labelClass}>Departamento</label>
              <input type="text" value={form.department} onChange={setField('department')} className={inputClass} placeholder="Lima" />
            </div>
            <div>
              <label className={labelClass}>Provincia</label>
              <input type="text" value={form.province} onChange={setField('province')} className={inputClass} placeholder="Lima" />
            </div>
            <div>
              <label className={labelClass}>Distrito</label>
              <input type="text" value={form.district} onChange={setField('district')} className={inputClass} placeholder="Miraflores" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </div>
  )
}
