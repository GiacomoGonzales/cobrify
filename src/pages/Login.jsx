import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema } from '@/utils/schemas'
import { getResellerBranding, getResellerByHostname } from '@/services/brandingService'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function Login() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [customBranding, setCustomBranding] = useState(null) // null = usar Cobrify
  const [isLoadingBranding, setIsLoadingBranding] = useState(true) // Empezar en true para esperar la detección
  const [searchParams] = useSearchParams()
  const { login, isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const navigate = useNavigate()

  const refId = searchParams.get('ref')

  // Redirigir al dashboard si el usuario ya está autenticado
  useEffect(() => {
    if (isAuthenticated && !isAuthLoading) {
      navigate('/app/dashboard', { replace: true })
    }
  }, [isAuthenticated, isAuthLoading, navigate])

  // Cargar branding del reseller por hostname (subdominio o dominio personalizado) o por parámetro ref
  useEffect(() => {
    async function loadBranding() {
      setIsLoadingBranding(true)

      try {
        // Prioridad 1: Parámetro ?ref= en la URL
        if (refId) {
          console.log('🔍 Loading branding by ref param:', refId)
          const branding = await getResellerBranding(refId)
          setCustomBranding(branding)
          return
        }

        // Prioridad 2: Detectar por hostname (subdominio o dominio personalizado)
        const hostname = window.location.hostname
        console.log('🔍 Checking hostname for reseller:', hostname)

        const resellerData = await getResellerByHostname(hostname)
        if (resellerData) {
          console.log('✅ Found reseller branding by hostname:', resellerData.branding.companyName)
          setCustomBranding(resellerData.branding)
          return
        }

        // No se encontró branding personalizado, usar Cobrify por defecto
        console.log('ℹ️ Using default Cobrify branding')
        setCustomBranding(null)
      } catch (error) {
        console.error('Error loading branding:', error)
        setCustomBranding(null)
      } finally {
        setIsLoadingBranding(false)
      }
    }

    loadBranding()
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
        setIsLoading(false)
      }
      // Si es exitoso, mantener loading mientras AuthContext procesa y navega
    } catch (err) {
      setError('Error al iniciar sesión')
      setIsLoading(false)
    }
  }

  // Mostrar splash mientras carga el branding o auth está procesando
  const showSplash = isLoadingBranding || isAuthLoading || isAuthenticated || isLoading

  if (showSplash && Capacitor.isNativePlatform()) {
    return (
      <div className="fixed inset-0 bg-[#2563EB] flex items-center justify-center">
        <img src="/logo.png" alt="Cobrify" className="w-[140px] h-[140px] object-contain" />
      </div>
    )
  }

  // En web, esperar sin mostrar nada mientras carga
  if (showSplash) {
    return null
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
              <div className="inline-block bg-white rounded-2xl p-4 shadow-lg mb-4">
                <img
                  src={customBranding.logoUrl}
                  alt={`${customBranding.companyName} - Sistema de facturación electrónica`}
                  className="max-w-72 max-h-32 mx-auto object-contain"
                />
              </div>
            ) : (
              <div className="inline-block bg-white rounded-2xl p-4 shadow-lg mb-4">
                <img
                  src="/logo.png"
                  alt={`${customBranding.companyName} - Sistema de facturación electrónica`}
                  className="w-24 h-24 mx-auto object-contain"
                />
              </div>
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
