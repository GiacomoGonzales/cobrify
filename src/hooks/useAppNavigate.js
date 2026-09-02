import { useNavigate, useLocation } from 'react-router-dom'
import { useAppContext } from './useAppContext'
import { rutaDeApp } from '@/utils/appPath'

/**
 * Navegación con el prefijo del contexto (/app, /demo, /demorestaurant…).
 *
 * El cálculo del prefijo vive en utils/appPath, para que quien necesite la URL
 * —abrir en otra pestaña, armar un enlace— no tenga que repetir la lista de
 * demos y quedarse viejo al agregar el próximo.
 */
export function useAppNavigate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isDemoMode } = useAppContext()

  return (path, options) => navigate(rutaDeApp(path, isDemoMode, location.pathname), options)
}

/** La misma ruta, pero devuelta en vez de navegada. */
export function useAppPath() {
  const location = useLocation()
  const { isDemoMode } = useAppContext()

  return (path) => rutaDeApp(path, isDemoMode, location.pathname)
}
