import { useState, useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'

export default function MainLayout() {
  const { user, isAuthenticated, isLoading, hasAccess, isAdmin, subscription } = useAuth()
  const [hasBusiness, setHasBusiness] = useState(null)
  const [checkingBusiness, setCheckingBusiness] = useState(false)
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)
  const location = useLocation()

  // Verificar si el usuario tiene un negocio creado
  useEffect(() => {
    let isMounted = true
    let timeoutId

    const checkBusiness = async () => {
      if (!user?.uid) {
        if (isMounted) {
          setCheckingBusiness(false)
          setHasBusiness(null)
        }
        return
      }

      if (isMounted) setCheckingBusiness(true)

      // Timeout de seguridad
      timeoutId = setTimeout(() => {
        if (isMounted) {
          console.warn('⚠️ Business check timeout - continuando sin datos')
          setCheckingBusiness(false)
          setHasBusiness(true) // Asumir que existe para no bloquear
        }
      }, 5000)

      try {
        const businessRef = doc(db, 'businesses', user.uid)
        const businessDoc = await getDoc(businessRef)

        if (isMounted) {
          clearTimeout(timeoutId)
          setHasBusiness(businessDoc.exists())
        }
      } catch (error) {
        console.error('Error al verificar negocio:', error)
        if (isMounted) {
          clearTimeout(timeoutId)
          setHasBusiness(true) // Asumir que existe en caso de error
        }
      } finally {
        if (isMounted) {
          setCheckingBusiness(false)
        }
      }
    }

    if (isAuthenticated && user) {
      checkBusiness()
    } else {
      setCheckingBusiness(false)
      setHasBusiness(null)
    }

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [user?.uid, isAuthenticated, location.pathname])

  // Esperar a que la suscripción se cargue antes de verificar acceso
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Dar un pequeño tiempo para que la suscripción se cargue
      const timer = setTimeout(() => {
        setSubscriptionLoading(false)
      }, 300) // Reducido de 500 a 300ms
      return () => clearTimeout(timer)
    } else if (!isAuthenticated) {
      setSubscriptionLoading(false)
    }
  }, [isLoading, isAuthenticated])

  // Mostrar loading mientras carga auth o suscripción
  if (isLoading || checkingBusiness || subscriptionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Redirigir a login si no está autenticado
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Verificar acceso a suscripción
  // IMPORTANTE: Los administradores SIEMPRE tienen acceso completo, sin importar su suscripción
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isSubscriptionRoute = location.pathname === '/mi-suscripcion'
  const isBusinessNewRoute = location.pathname === '/business/new'

  // Solo bloquear si NO es admin Y NO tiene acceso Y NO está en rutas especiales
  const shouldBlockAccess = !isAdmin && !hasAccess && !isAdminRoute && !isSubscriptionRoute && !isBusinessNewRoute

  if (shouldBlockAccess) {
    return <Navigate to="/account-suspended" replace />
  }

  // No redirigir a crear negocio - permitir acceso directo al dashboard
  // Los usuarios pueden configurar su negocio más tarde desde Configuración
  // if (hasBusiness === false && location.pathname !== '/business/new' && !isAdmin) {
  //   return <Navigate to="/business/new" replace />
  // }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden" style={{ height: '100dvh' }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden md:ml-64">
        {/* Navbar - Siempre fijo */}
        <Navbar />

        {/* Page Content - Solo esta área hace scroll */}
        <main className="flex-1 overflow-y-auto overscroll-none p-4 sm:p-6 custom-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
