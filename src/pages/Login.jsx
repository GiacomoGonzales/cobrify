import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import SplashMarca from '@/components/SplashMarca'
import { esDominioReseller } from '@/utils/resellerDomain'
import { esDominioDelChat, MARCA_CHAT } from '@/utils/dominioChat'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema } from '@/utils/schemas'
import { getResellerBranding, getResellerByHostname } from '@/services/brandingService'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import AuthShell from '@/components/AuthShell'

export default function Login() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [customBranding, setCustomBranding] = useState(null) // null = usar Cobrify
  const [isLoadingBranding, setIsLoadingBranding] = useState(true) // Empezar en true para esperar la detección
  const [searchParams] = useSearchParams()
  const { login, logout, isAuthenticated, isLoading: isAuthLoading, isAdmin, isBusinessOwner, isReseller, userPermissions, rolesResolved } = useAuth()
  const navigate = useNavigate()

  const refId = searchParams.get('ref')

  // Cuenta de COMPRADOR del catálogo: existe en el mismo pozo de Firebase Auth
  // pero no pertenece a ningún negocio. Si intenta entrar aquí, se le explica y
  // se cierra su sesión — sin esto quedaría rebotando entre /login y /app.
  const isBusinessUser = isAdmin || isBusinessOwner || isReseller || !!userPermissions
  const isShopperAccount = isAuthenticated && rolesResolved && !isBusinessUser

  // Redirigir al entrar (solo usuarios del sistema). Por el subdominio del chat
  // se cae en la bandeja: quien entra por esa puerta no viene a facturar.
  useEffect(() => {
    if (isAuthenticated && !isAuthLoading && rolesResolved && isBusinessUser) {
      navigate(esDominioDelChat() ? '/chat' : '/app/dashboard', { replace: true })
    }
  }, [isAuthenticated, isAuthLoading, rolesResolved, isBusinessUser, navigate])

  useEffect(() => {
    if (!isShopperAccount) return
    setError('Esta cuenta es de comprador de un catálogo, no tiene acceso al sistema. Vuelve a la tienda donde compras para iniciar sesión ahí.')
    logout()
  }, [isShopperAccount, logout])

  // Cargar branding del reseller por hostname (subdominio o dominio personalizado) o por parámetro ref
  useEffect(() => {
    async function loadBranding() {
      setIsLoadingBranding(true)

      try {
        // Prioridad 0: el subdominio del chat tiene marca propia y no hay nada
        // que consultar — es una constante, no un reseller de la base.
        if (esDominioDelChat()) {
          setCustomBranding({
            companyName: MARCA_CHAT.nombre,
            logoUrl: MARCA_CHAT.icono,
            primaryColor: MARCA_CHAT.color,
            lema: 'Bandeja de WhatsApp',
          })
          return
        }

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

  // Este splash aparece DOS veces en el recorrido nativo: al montar (mientras
  // carga la marca) y tras enviar las credenciales (mientras redirige). Era la
  // ultima copia con Cobrify cableado — la que sobrevivio al reporte de QAMIR.
  if (showSplash && Capacitor.isNativePlatform()) {
    return <SplashMarca />
  }

  // En web, esperar sin mostrar nada mientras carga
  if (showSplash) {
    return null
  }

  // Si hay branding personalizado (reseller), usar esos valores
  // Si no, usar los valores de Cobrify por defecto
  // Cobrify Chat tiene su propia entrada. Antes caia en la rama de marca
  // personalizada —la de los resellers— y de ahi salian las dos cosas que
  // desentonaban: el verde plano de fondo y el recuadro blanco alrededor del
  // logo. Ese recuadro existe porque el logo de un reseller puede ser oscuro y
  // necesita respaldo; el nuestro no, y encima ya trae su propia forma.
  if (esDominioDelChat()) {
    return (
      <AuthShell tono="chat" className="max-w-md chat-cobrify">
        <div className="text-center mb-6">
          <img
            src={MARCA_CHAT.icono}
            alt={MARCA_CHAT.nombre}
            className="w-24 h-24 mx-auto mb-3 object-contain drop-shadow-lg"
          />
          <h1 className="text-3xl font-bold text-[#0A2540] mb-1">{MARCA_CHAT.nombre}</h1>
          <p className="text-sm text-[#425466]">Bandeja de WhatsApp</p>
        </div>

        <Card className="shadow-xl">
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

        <p className="text-center text-[#425466] text-xs mt-4">
          © {new Date().getFullYear()} {MARCA_CHAT.nombre}. Bandeja de WhatsApp.
        </p>
      </AuthShell>
    )
  }

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
            ) : esDominioReseller() ? (
              /* Reseller sin logo: la inicial de SU empresa, no el logo de Cobrify */
              <div className="inline-block bg-white rounded-2xl p-4 shadow-lg mb-4">
                <span
                  className="w-24 h-24 mx-auto rounded-xl flex items-center justify-center text-4xl font-bold text-white"
                  style={{ backgroundColor: customBranding.primaryColor || '#2563eb' }}
                >
                  {(customBranding.companyName || '?').charAt(0).toUpperCase()}
                </span>
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
            <p className="text-sm text-white/80">{customBranding.lema || 'Sistema de facturación para Perú'}</p>
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
                  style={{
                    backgroundColor: customBranding.primaryColor,
                    borderColor: customBranding.primaryColor,
                  }}
                >
                  Iniciar Sesión
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-white text-xs mt-4 opacity-75">
            © {new Date().getFullYear()} {customBranding.companyName}. {customBranding.lema ? `${customBranding.lema}.` : 'Sistema de facturación y cobranza.'}
          </p>
        </div>
      </div>
    )
  }

  // Login por defecto de Cobrify (sin branding personalizado) — estilo landing
  return (
    <AuthShell>
      <div className="text-center mb-6">
        <img
          src="/logo.png"
          alt="Cobrify - Sistema de facturación electrónica"
          className="w-24 h-24 mx-auto mb-3 object-contain"
          width="96"
          height="96"
        />
        <h1 className="text-3xl font-extrabold tracking-tight mb-1" style={{ color: 'var(--navy)' }}>Cobrify</h1>
        <p className="text-sm" style={{ color: 'var(--body)' }}>Sistema de facturación para Perú</p>
      </div>

      <Card className="shadow-xl">
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

      <p className="text-center text-xs mt-4" style={{ color: '#8898AA' }}>
        © 2026 Cobrify. Sistema de facturación y cobranza.
      </p>
    </AuthShell>
  )
}
