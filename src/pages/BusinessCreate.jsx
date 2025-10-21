import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'

// Schema de validación
const businessSchema = z.object({
  ruc: z
    .string()
    .min(11, 'El RUC debe tener 11 dígitos')
    .max(11, 'El RUC debe tener 11 dígitos')
    .regex(/^\d+$/, 'El RUC solo debe contener números'),
  businessName: z.string().min(3, 'La razón social es obligatoria'),
  name: z.string().optional(),
  address: z.string().min(5, 'La dirección es obligatoria'),
  district: z.string().min(2, 'El distrito es obligatorio'),
  province: z.string().min(2, 'La provincia es obligatoria'),
  department: z.string().min(2, 'El departamento es obligatorio'),
  phone: z.string().optional(),
  email: z.string().email('Email inválido'),
})

export default function BusinessCreate() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [message, setMessage] = useState(null)
  const [isFirstTime, setIsFirstTime] = useState(true)
  const [hasChecked, setHasChecked] = useState(false)
  const [successfullyCreated, setSuccessfullyCreated] = useState(false)

  // Verificar si es primera vez (viene del flujo de registro)
  useEffect(() => {
    const checkFirstTime = async () => {
      if (!user?.uid || hasChecked) return

      try {
        const businessRef = doc(db, 'businesses', user.uid)
        const businessDoc = await getDoc(businessRef)

        // Si ya existe el negocio, redirigir al dashboard
        if (businessDoc.exists()) {
          navigate('/dashboard', { replace: true })
          return
        }

        setIsFirstTime(true)
        setHasChecked(true)
      } catch (error) {
        console.error('Error al verificar:', error)
        setHasChecked(true)
      }
    }

    checkFirstTime()
  }, [user, hasChecked, navigate])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      ruc: '',
      businessName: '',
      name: '',
      address: '',
      district: '',
      province: '',
      department: '',
      phone: '',
      email: user?.email || '',
    },
  })

  const onSubmit = async (data) => {
    if (!user?.uid) return

    setIsCreating(true)
    setMessage(null)

    try {
      // Crear el negocio directamente en Firestore
      // El ID del documento es el userId (1 usuario = 1 negocio)
      const businessRef = doc(db, 'businesses', user.uid)

      await setDoc(businessRef, {
        ruc: data.ruc,
        businessName: data.businessName,
        name: data.name || data.businessName,
        address: data.address,
        district: data.district,
        province: data.province,
        department: data.department,
        phone: data.phone || '',
        email: data.email,
        ownerId: user.uid,
        // Series por defecto
        series: {
          factura: { serie: 'F001', lastNumber: 0 },
          boleta: { serie: 'B001', lastNumber: 0 },
          nota_venta: { serie: 'N001', lastNumber: 0 },
        },
        // SUNAT deshabilitado por defecto
        sunat: {
          enabled: false,
          environment: 'beta',
          solUser: '',
          homologated: false,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // Marcar como creado exitosamente y redirigir inmediatamente
      setSuccessfullyCreated(true)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      console.error('Error al crear empresa:', error)
      setMessage({
        type: 'error',
        text: 'Error al crear la empresa. Inténtalo nuevamente.',
      })
      setIsCreating(false)
    }
  }

  // Mostrar loader mientras redirige
  if (successfullyCreated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-lg text-gray-900 font-medium">Empresa creada exitosamente</p>
          <p className="text-gray-600">Redirigiendo al dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          {!isFirstTime && (
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
          )}

          <h1 className="text-3xl font-bold text-gray-900">
            {isFirstTime ? 'Configura tu Empresa' : 'Crear Nueva Empresa'}
          </h1>
          <p className="text-gray-600 mt-2">
            {isFirstTime
              ? 'Para comenzar a usar Cobrify, primero necesitamos los datos de tu empresa'
              : 'Registra los datos de tu empresa para empezar a facturar'}
          </p>
        </div>

        {/* Messages */}
        {message && (
          <Alert
            variant={message.type === 'success' ? 'success' : 'danger'}
            title={message.type === 'success' ? 'Éxito' : 'Error'}
            className="mb-6"
          >
            {message.text}
          </Alert>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="w-6 h-6 text-primary-600" />
                <CardTitle>Información de la Empresa</CardTitle>
              </div>
            </CardHeader>

            <CardContent>
              <div className="space-y-6">
                {/* RUC */}
                <div>
                  <Input
                    label="RUC"
                    required
                    placeholder="20123456789"
                    maxLength={11}
                    error={errors.ruc?.message}
                    {...register('ruc')}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Número de RUC de 11 dígitos
                  </p>
                </div>

                {/* Razón Social */}
                <Input
                  label="Razón Social"
                  required
                  placeholder="MI EMPRESA S.A.C."
                  error={errors.businessName?.message}
                  {...register('businessName')}
                />

                {/* Nombre Comercial */}
                <Input
                  label="Nombre Comercial (Opcional)"
                  placeholder="Mi Empresa"
                  error={errors.name?.message}
                  {...register('name')}
                  helperText="Nombre con el que se conoce tu negocio"
                />

                {/* Dirección */}
                <Input
                  label="Dirección"
                  required
                  placeholder="Av. Principal 123"
                  error={errors.address?.message}
                  {...register('address')}
                />

                {/* Ubicación */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Distrito"
                    required
                    placeholder="Miraflores"
                    error={errors.district?.message}
                    {...register('district')}
                  />

                  <Input
                    label="Provincia"
                    required
                    placeholder="Lima"
                    error={errors.province?.message}
                    {...register('province')}
                  />

                  <Input
                    label="Departamento"
                    required
                    placeholder="Lima"
                    error={errors.department?.message}
                    {...register('department')}
                  />
                </div>

                {/* Contacto */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Teléfono"
                    type="tel"
                    placeholder="01-2345678"
                    error={errors.phone?.message}
                    {...register('phone')}
                  />

                  <Input
                    label="Email"
                    type="email"
                    required
                    placeholder="contacto@miempresa.com"
                    error={errors.email?.message}
                    {...register('email')}
                  />
                </div>

                {/* Información adicional */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Nota:</strong> Una vez creada la empresa, podrás
                    configurar:
                  </p>
                  <ul className="text-sm text-blue-700 mt-2 ml-4 list-disc">
                    <li>Series de comprobantes (F001, B001, etc.)</li>
                    <li>Integración con SUNAT</li>
                    <li>Certificado digital</li>
                    <li>Usuarios adicionales</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botones */}
          <div className="mt-6 flex justify-end gap-4">
            {!isFirstTime && (
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
                disabled={isCreating}
              >
                Cancelar
              </Button>
            )}

            <Button type="submit" disabled={isCreating} className={isFirstTime ? 'w-full' : ''}>
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creando Empresa...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  {isFirstTime ? 'Comenzar a Facturar' : 'Crear Empresa'}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
