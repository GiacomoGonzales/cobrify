import { useNavigate, useLocation } from 'react-router-dom'
import { useAppContext } from './useAppContext'

/**
 * Hook personalizado para navegación que agrega automáticamente
 * el prefijo /app, /demo, /demorestaurant o /demopharmacy según el contexto
 */
export function useAppNavigate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isDemoMode } = useAppContext()

  const appNavigate = (path, options) => {
    // Si la ruta ya tiene un prefijo absoluto (/, /app, /demo), usarla tal cual
    if (path.startsWith('/app') || path.startsWith('/demo') || path === '/') {
      navigate(path, options)
      return
    }

    // Determinar el prefijo según el contexto
    let prefix = '/app'

    if (isDemoMode) {
      // Detectar qué tipo de demo estamos usando
      if (location.pathname.startsWith('/demorestaurant')) {
        prefix = '/demorestaurant'
      } else if (location.pathname.startsWith('/demopharmacy')) {
        prefix = '/demopharmacy'
      } else {
        prefix = '/demo'
      }
    }

    // Asegurar que la ruta comience con /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    // Navegar con el prefijo apropiado
    navigate(`${prefix}${normalizedPath}`, options)
  }

  return appNavigate
}
