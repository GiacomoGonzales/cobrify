import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { z } from 'zod'
import { Search, Loader2, Building2, User, ArrowRight, ArrowLeft, MapPin } from 'lucide-react'
import { registerUser } from '@/services/authService'
import { consultarRUC } from '@/services/documentLookupService'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

// Schema de validación para el registro completo
const registerSchema = z.object({
  // Datos de cuenta
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  confirmPassword: z.string(),
  // Datos del negocio
  ruc: z.string().length(11, 'El RUC debe tener 11 dígitos').regex(/^\d+$/, 'El RUC solo debe contener números'),
  businessName: z.string().min(2, 'La razón social es requerida'),
  tradeName: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().min(5, 'La dirección es requerida'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

export default function Register() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [isLookingUpRuc, setIsLookingUpRuc] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [step, setStep] = useState(1) // 1 = cuenta, 2 = negocio

  // Estados para ubicación (códigos de ubigeo)
  const [departmentCode, setDepartmentCode] = useState('15') // Lima por defecto
  const [provinceCode, setProvinceCode] = useState('01') // Lima por defecto
  const [districtCode, setDistrictCode] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    trigger,
  } = useForm({
    resolver: zodResolver(registerSchema),
  })

  // Obtener provincias según departamento
  const getProvincias = (deptCode) => {
    return PROVINCIAS[deptCode] || []
  }

  // Obtener distritos según departamento y provincia
  const getDistritos = (deptCode, provCode) => {
    const key = `${deptCode}${provCode}`
    return DISTRITOS[key] || []
  }

  // Obtener ubigeo completo (6 dígitos)
  const getUbigeo = () => {
    if (departmentCode && provinceCode && districtCode) {
      return `${departmentCode}${provinceCode}${districtCode}`
    }
    return ''
  }

  // Obtener nombres de ubicación
  const getLocationNames = () => {
    const dept = DEPARTAMENTOS.find(d => d.code === departmentCode)
    const prov = getProvincias(departmentCode).find(p => p.code === provinceCode)
    const dist = getDistritos(departmentCode, provinceCode).find(d => d.code === districtCode)
    return {
      department: dept?.name || '',
      province: prov?.name || '',
      district: dist?.name || ''
    }
  }

  const rucValue = watch('ruc')

  // Buscar código de departamento por nombre
  const findDepartmentCode = (name) => {
    if (!name) return ''
    const normalized = name.toUpperCase().trim()
    const dept = DEPARTAMENTOS.find(d =>
      d.name.toUpperCase() === normalized ||
      d.name.toUpperCase().includes(normalized) ||
      normalized.includes(d.name.toUpperCase())
    )
    return dept?.code || ''
  }

  // Buscar código de provincia por nombre
  const findProvinceCode = (deptCode, name) => {
    if (!deptCode || !name) return ''
    const normalized = name.toUpperCase().trim()
    const provincias = PROVINCIAS[deptCode] || []
    const prov = provincias.find(p =>
      p.name.toUpperCase() === normalized ||
      p.name.toUpperCase().includes(normalized) ||
      normalized.includes(p.name.toUpperCase())
    )
    return prov?.code || ''
  }

  // Buscar código de distrito por nombre
  const findDistrictCode = (deptCode, provCode, name) => {
    if (!deptCode || !provCode || !name) return ''
    const normalized = name.toUpperCase().trim()
    const key = `${deptCode}${provCode}`
    const distritos = DISTRITOS[key] || []
    const dist = distritos.find(d =>
      d.name.toUpperCase() === normalized ||
      d.name.toUpperCase().includes(normalized) ||
      normalized.includes(d.name.toUpperCase())
    )
    return dist?.code || ''
  }

  // Buscar datos del RUC automáticamente
  const handleLookupRuc = async () => {
    if (!rucValue || rucValue.length !== 11) {
      setError('Ingrese un RUC válido de 11 dígitos')
      return
    }

    setIsLookingUpRuc(true)
    setError('')

    try {
      const result = await consultarRUC(rucValue)

      if (result.success) {
        setValue('businessName', result.data.razonSocial || '')
        setValue('tradeName', result.data.nombreComercial || '')
        setValue('address', result.data.direccion || '')

        // Convertir nombres de ubicación a códigos de ubigeo
        const deptCode = findDepartmentCode(result.data.departamento)
        if (deptCode) {
          setDepartmentCode(deptCode)
          const provCode = findProvinceCode(deptCode, result.data.provincia)
          if (provCode) {
            setProvinceCode(provCode)
            const distCode = findDistrictCode(deptCode, provCode, result.data.distrito)
            if (distCode) {
              setDistrictCode(distCode)
            }
          }
        }
      } else {
        setError(result.error || 'No se encontraron datos para este RUC')
      }
    } catch (err) {
      console.error('Error al buscar RUC:', err)
      setError('Error al consultar el RUC. Intente nuevamente.')
    } finally {
      setIsLookingUpRuc(false)
    }
  }

  // Validar paso 1 antes de continuar
  const handleNextStep = async () => {
    const isValid = await trigger(['name', 'email', 'password', 'confirmPassword'])
    if (isValid) {
      setStep(2)
      setError('')
    }
  }

  const onSubmit = async data => {
    // Validar que se haya seleccionado ubicación completa
    if (!departmentCode || !provinceCode || !districtCode) {
      setError('Por favor selecciona departamento, provincia y distrito')
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      const locationNames = getLocationNames()
      const ubigeo = getUbigeo()

      const businessData = {
        ruc: data.ruc,
        businessName: data.businessName,
        tradeName: data.tradeName,
        phone: data.phone,
        address: data.address,
        district: locationNames.district,
        province: locationNames.province,
        department: locationNames.department,
        ubigeo: ubigeo,
      }

      const result = await registerUser(data.email, data.password, data.name, businessData)

      if (result.success) {
        setSuccess('Cuenta creada exitosamente. Redirigiendo...')
        setTimeout(() => {
          navigate('/app/dashboard')
        }, 1500)
      } else {
        setError(result.error || 'Error al crear la cuenta')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary-600 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="Cobrify - Sistema de facturación electrónica"
            className="w-24 h-24 mx-auto mb-3 object-contain"
            width="96"
            height="96"
          />
          <h1 className="text-3xl font-bold text-white mb-1">Cobrify</h1>
          <p className="text-sm text-primary-100">Sistema de facturación para Perú</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            step === 1 ? 'bg-white text-primary-600' : 'bg-primary-500 text-white'
          }`}>
            <User className="w-4 h-4" />
            <span>1. Cuenta</span>
          </div>
          <ArrowRight className="w-4 h-4 text-primary-300" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            step === 2 ? 'bg-white text-primary-600' : 'bg-primary-500 text-white'
          }`}>
            <Building2 className="w-4 h-4" />
            <span>2. Negocio</span>
          </div>
        </div>

        {/* Register Card */}
        <Card className="shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {step === 1 ? 'Datos de tu Cuenta' : 'Datos de tu Negocio'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

              {/* PASO 1: Datos de cuenta */}
              {step === 1 && (
                <>
                  <Input
                    label="Nombre Completo"
                    type="text"
                    placeholder="Juan Pérez"
                    error={errors.name?.message}
                    {...register('name')}
                  />

                  <Input
                    label="Correo Electrónico"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    error={errors.email?.message}
                    {...register('email')}
                  />

                  <Input
                    label="Contraseña"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    error={errors.password?.message}
                    {...register('password')}
                  />

                  <Input
                    label="Confirmar Contraseña"
                    type="password"
                    placeholder="Repite tu contraseña"
                    error={errors.confirmPassword?.message}
                    {...register('confirmPassword')}
                  />
                </>
              )}

              {/* PASO 2: Datos del negocio */}
              {step === 2 && (
                <>
                  {/* RUC con búsqueda */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      RUC <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="20123456789"
                        maxLength={11}
                        {...register('ruc')}
                        className={`flex-1 px-3 py-2 border ${
                          errors.ruc ? 'border-red-500' : 'border-gray-300'
                        } rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
                      />
                      <button
                        type="button"
                        onClick={handleLookupRuc}
                        disabled={isLookingUpRuc}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                        title="Buscar datos del RUC en SUNAT"
                      >
                        {isLookingUpRuc ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {errors.ruc && (
                      <p className="text-red-500 text-sm mt-1">{errors.ruc.message}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Ingresa tu RUC y haz clic en buscar para autocompletar
                    </p>
                  </div>

                  <Input
                    label="Razón Social"
                    type="text"
                    placeholder="MI EMPRESA SAC"
                    required
                    error={errors.businessName?.message}
                    {...register('businessName')}
                  />

                  <Input
                    label="Nombre Comercial (opcional)"
                    type="text"
                    placeholder="Mi Empresa"
                    error={errors.tradeName?.message}
                    {...register('tradeName')}
                  />

                  <Input
                    label="Teléfono"
                    type="tel"
                    placeholder="01-2345678 o 987654321"
                    error={errors.phone?.message}
                    {...register('phone')}
                  />

                  <Input
                    label="Dirección"
                    type="text"
                    placeholder="Av. Principal 123"
                    required
                    error={errors.address?.message}
                    {...register('address')}
                  />

                  {/* Selector de ubicación con ubigeo automático */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>Ubicación del negocio</span>
                    </div>

                    <Select
                      label="Departamento"
                      value={departmentCode}
                      onChange={(e) => {
                        setDepartmentCode(e.target.value)
                        setProvinceCode('')
                        setDistrictCode('')
                      }}
                    >
                      <option value="">Seleccione departamento</option>
                      {DEPARTAMENTOS.map(dept => (
                        <option key={dept.code} value={dept.code}>
                          {dept.name}
                        </option>
                      ))}
                    </Select>

                    <div className="grid grid-cols-2 gap-3">
                      <Select
                        label="Provincia"
                        value={provinceCode}
                        onChange={(e) => {
                          setProvinceCode(e.target.value)
                          setDistrictCode('')
                        }}
                        disabled={!departmentCode}
                      >
                        <option value="">Seleccione</option>
                        {getProvincias(departmentCode).map(prov => (
                          <option key={prov.code} value={prov.code}>
                            {prov.name}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Distrito"
                        value={districtCode}
                        onChange={(e) => setDistrictCode(e.target.value)}
                        disabled={!provinceCode}
                      >
                        <option value="">Seleccione</option>
                        {getDistritos(departmentCode, provinceCode).map(dist => (
                          <option key={dist.code} value={dist.code}>
                            {dist.name}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {/* Mostrar ubigeo calculado */}
                    {departmentCode && provinceCode && districtCode && (
                      <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                        <span className="text-sm text-green-700">
                          Ubigeo: <span className="font-mono font-semibold">{getUbigeo()}</span>
                        </span>
                        <span className="text-xs text-green-600">Calculado automáticamente</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Error message */}
              {error && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Success message */}
              {success && (
                <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-600">{success}</p>
                </div>
              )}

              {/* Botones de navegación */}
              <div className="flex gap-3">
                {step === 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Anterior
                  </Button>
                )}

                {step === 1 ? (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleNextStep}
                  >
                    Continuar
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    className="flex-1"
                    loading={isLoading}
                  >
                    Crear Cuenta
                  </Button>
                )}
              </div>
            </form>

            {/* Link to login */}
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                ¿Ya tienes una cuenta?{' '}
                <Link
                  to="/login"
                  className="text-primary-600 font-semibold hover:text-primary-700 transition-colors"
                >
                  Inicia sesión
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-white text-xs mt-4 opacity-75">
          © 2025 Cobrify. Sistema de facturación y cobranza.
        </p>
      </div>
    </div>
  )
}
