import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'

export default function MobileRedirect({ children }) {
  const navigate = useNavigate()

  useEffect(() => {
    // Si estamos en app móvil nativa, redirigir al login
    if (Capacitor.isNativePlatform()) {
      navigate('/login', { replace: true })
    }
  }, [navigate])

  // Si es móvil, mostrar pantalla de carga mientras redirige
  if (Capacitor.isNativePlatform()) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-primary-600">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Factuya</h1>
          <p className="text-white">Cargando...</p>
        </div>
      </div>
    )
  }

  // Si es web, mostrar el contenido normal (landing page)
  return children
}
