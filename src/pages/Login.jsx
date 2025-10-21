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
  const [mode, setMode] = useState('login') // 'login' o 'register'
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
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <FileText className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Cobrify</h1>
          <p className="text-primary-100">Sistema de facturación y cobranza para Perú</p>
        </div>

        {/* Login/Register Card */}
        <Card>
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

        <p className="text-center text-white text-sm mt-6">
          © 2024 Cobrify. Sistema de facturación y cobranza.
        </p>
      </div>
    </div>
  )
}
