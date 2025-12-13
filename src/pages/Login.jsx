import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema } from '@/utils/schemas'
import { getResellerBranding } from '@/services/brandingService'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function Login() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [customBranding, setCustomBranding] = useState(null) // null = usar Cobrify
  const [isLoadingBranding, setIsLoadingBranding] = useState(false)
  const [searchParams] = useSearchParams()
  const { login } = useAuth()

  const refId = searchParams.get('ref')

  // Cargar branding del reseller SOLO si hay un parámetro ref en la URL
  useEffect(() => {
    if (refId) {
      setIsLoadingBranding(true)
      getResellerBranding(refId)
        .then(setCustomBranding)
        .finally(() => setIsLoadingBranding(false))
    }
  }, [refId])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async data => {
    setIsLoading(true)
    setError('')

    try {
      const result = await login(data.email, data.password)
      if (!result.success) {
        setError(result.error || 'Error al iniciar sesión')
      }
      // Si es exitoso, el navigate en AuthContext se encargará de la navegación
    } finally {
      setIsLoading(false)
    }
  }

  // Mostrar spinner mientras carga el branding del reseller
  if (refId && isLoadingBranding) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  // Si hay branding personalizado (reseller), usar esos valores
  // Si no, usar los valores de Cobrify por defecto
  if (customBranding) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: customBranding.primaryColor }}
      >
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            {customBranding.logoUrl ? (
              <img
                src={customBranding.logoUrl}
                alt={`${customBranding.companyName} - Sistema de facturación electrónica`}
                className="max-w-96 max-h-48 mx-auto mb-4 object-contain"
              />
            ) : (
              <img
                src="/logo.png"
                alt={`${customBranding.companyName} - Sistema de facturación electrónica`}
                className="max-w-96 max-h-48 mx-auto mb-4 object-contain"
              />
            )}
            <h1 className="text-3xl font-bold text-white mb-1">{customBranding.companyName}</h1>
            <p className="text-sm text-white/80">Sistema de facturación para Perú</p>
          </div>

          <Card className="shadow-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Iniciar Sesión</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                  placeholder="••••••••"
                  error={errors.password?.message}
                  {...register('password')}
                />
                {error && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  loading={isLoading}
                  style={{ backgroundColor: customBranding.primaryColor }}
                >
                  Iniciar Sesión
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-white text-xs mt-4 opacity-75">
            © 2025 {customBranding.companyName}. Sistema de facturación y cobranza.
          </p>
        </div>
      </div>
    )
  }

  // Login por defecto de Cobrify (sin branding personalizado)
  return (
    <div className="min-h-screen bg-primary-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="Cobrify - Sistema de facturación electrónica"
            className="w-32 h-32 mx-auto mb-3 object-contain"
            width="128"
            height="128"
          />
          <h1 className="text-3xl font-bold text-white mb-1">Cobrify</h1>
          <p className="text-sm text-primary-100">Sistema de facturación para Perú</p>
        </div>

        <Card className="shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Iniciar Sesión</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                placeholder="••••••••"
                error={errors.password?.message}
                {...register('password')}
              />
              {error && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full" loading={isLoading}>
                Iniciar Sesión
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-white text-xs mt-4 opacity-75">
          © 2025 Cobrify. Sistema de facturación y cobranza.
        </p>
      </div>
    </div>
  )
}
