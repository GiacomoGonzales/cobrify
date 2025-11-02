import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Shield, Loader2 } from 'lucide-react'

/**
 * Componente para proteger rutas según permisos del usuario
 *
 * @param {string} pageId - ID de la página según AVAILABLE_PAGES
 * @param {ReactNode} children - Componente a renderizar si tiene permiso
 * @param {string} redirectTo - Ruta a la que redirigir si no tiene permiso (default: /dashboard)
 */
export default function ProtectedRoute({ pageId, children, redirectTo = '/dashboard' }) {
  const { isLoading, isAuthenticated, isAdmin, hasPageAccess } = useAuth()

  // Mientras carga, mostrar loader
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Verificando permisos...</p>
        </div>
      </div>
    )
  }

  // Si no está autenticado, redirigir a login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Si es admin, permitir acceso total
  if (isAdmin) {
    return children
  }

  // Si no se especificó pageId, permitir acceso (página sin restricciones)
  if (!pageId) {
    return children
  }

  // Verificar si tiene permiso para esta página
  const hasAccess = hasPageAccess(pageId)

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-red-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600 mb-6">
            No tienes permisos para acceder a esta página. Contacta al administrador si crees que esto es un error.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  return children
}
