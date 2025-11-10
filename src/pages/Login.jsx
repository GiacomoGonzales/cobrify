import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema, registerSchema } from '@/utils/schemas'
import { registerUser } from '@/services/authService'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function Login() {
  const isNative = Capacitor.isNativePlatform()
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
        // Register (solo disponible en web)
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
    <div className="min-h-screen bg-primary-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo y título */}
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

        {/* Login/Register Card */}
        <Card className="shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </CardTitle>
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

              {/* Submit Button */}
              <Button type="submit" className="w-full" loading={isLoading}>
                {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </Button>
            </form>

            {/* Switch mode (solo en web) */}
            {!isNative && (
              <div className="mt-4 text-center">
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
            )}
          </CardContent>
        </Card>

        <p className="text-center text-white text-xs mt-4 opacity-75">
          © 2025 Cobrify. Sistema de facturación y cobranza.
        </p>
      </div>
    </div>
  )
}
