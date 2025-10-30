import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FileText } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema, registerSchema } from '@/utils/schemas'
import { registerUser } from '@/services/authService'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function Login() {
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState('register') // 'login' o 'register'
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { login } = useAuth()

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: zodResolver(mode === 'login' ? loginSchema : registerSchema),
  })

  const onSubmit = async data => {
    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      if (mode === 'login') {
        // Login
        const result = await login(data.email, data.password)
        if (!result.success) {
          setError(result.error || 'Error al iniciar sesión')
        }
        // Si es exitoso, el navigate en AuthContext se encargará de la navegación
      } else {
        // Register
        const result = await registerUser(data.email, data.password, data.name)
        if (result.success) {
          setSuccess('¡Cuenta creada exitosamente! Puedes iniciar sesión ahora.')
          reset()
          setTimeout(() => {
            setMode('login')
            setSuccess('')
          }, 2000)
        } else {
          setError(result.error || 'Error al crear la cuenta')
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    setError('')
    setSuccess('')
    reset()
  }

  return (
    <div className="h-screen bg-gradient-to-br from-primary-600 to-primary-800 lg:flex overflow-hidden" style={{ height: '100dvh' }}>
      {/* Left Section - Informative */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-12 xl:px-20 overflow-y-auto">
        <div className="max-w-xl">
          {/* Logo and Brand */}
          <div className="mb-12 text-center">
            <img
              src="/logo.png"
              alt="Cobrify - Sistema de facturación electrónica SUNAT homologado para negocios en Perú"
              className="w-32 h-32 object-contain mb-6 drop-shadow-2xl mx-auto"
              width="128"
              height="128"
              loading="eager"
            />
            <h1 className="text-5xl font-bold text-white mb-4">Cobrify</h1>
            <p className="text-xl text-primary-100">
              Sistema de facturación electrónica para Perú
            </p>
          </div>

          {/* Features */}
          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg mb-1">Facturación SUNAT</h3>
                <p className="text-primary-100">
                  Genera facturas, boletas y notas de crédito/débito homologadas con SUNAT
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg mb-1">Gestión Completa</h3>
                <p className="text-primary-100">
                  Administra clientes, productos, inventario y cobranzas desde un solo lugar
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg mb-1">Reportes en Tiempo Real</h3>
                <p className="text-primary-100">
                  Visualiza ventas, métricas y reportes detallados para tomar mejores decisiones
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-white/20">
            <p className="text-sm text-primary-100">
              © 2025 Cobrify. Sistema de facturación y cobranza.
            </p>
          </div>
        </div>
      </div>

      {/* Right Section - Login/Register Forms */}
      <div className="w-full lg:w-1/2 h-full overflow-y-auto p-4 py-8 bg-white/5 lg:bg-transparent" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        <div className="w-full max-w-md mx-auto">
          {/* Logo móvil (solo visible en pantallas pequeñas) */}
          <div className="text-center mb-8 lg:hidden">
            <img
              src="/logo.png"
              alt="Cobrify - Sistema de facturación electrónica SUNAT homologado para negocios en Perú"
              className="w-32 h-32 object-contain mx-auto mb-4 drop-shadow-2xl"
              width="128"
              height="128"
              loading="eager"
            />
            <h1 className="text-4xl font-bold text-white mb-2">Cobrify</h1>
            <p className="text-primary-100">Sistema de facturación y cobranza para Perú</p>
          </div>

          {/* Login/Register Card */}
          <Card className="shadow-2xl">
            <CardHeader>
              <CardTitle>{mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Nombre (solo en registro) */}
                {mode === 'register' && (
                  <Input
                    label="Nombre Completo"
                    type="text"
                    placeholder="Juan Pérez"
                    error={errors.name?.message}
                    {...register('name')}
                  />
                )}

                {/* Email */}
                <Input
                  label="Correo Electrónico"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  error={errors.email?.message}
                  {...register('email')}
                />

                {/* Password */}
                <Input
                  label="Contraseña"
                  type="password"
                  placeholder="••••••••"
                  error={errors.password?.message}
                  {...register('password')}
                />

                {/* Confirm Password (solo en registro) */}
                {mode === 'register' && (
                  <Input
                    label="Confirmar Contraseña"
                    type="password"
                    placeholder="••••••••"
                    error={errors.confirmPassword?.message}
                    {...register('confirmPassword')}
                  />
                )}

                {/* Error message */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* Success message */}
                {success && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-600">{success}</p>
                  </div>
                )}

                {/* Submit Button */}
                <Button type="submit" className="w-full" loading={isLoading}>
                  {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                </Button>
              </form>

              {/* Switch mode */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  {mode === 'login' ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}{' '}
                  <button
                    type="button"
                    onClick={switchMode}
                    className="text-primary-600 font-semibold hover:text-primary-700 transition-colors"
                  >
                    {mode === 'login' ? 'Regístrate aquí' : 'Inicia sesión'}
                  </button>
                </p>
              </div>

              {/* Demo info (solo en login) */}
              {mode === 'login' && (
                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-500">
                    O crea una cuenta nueva usando el botón de arriba
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-white text-sm mt-6 lg:hidden">
            © 2025 Cobrify. Sistema de facturación y cobranza.
          </p>
        </div>
      </div>
    </div>
  )
}
