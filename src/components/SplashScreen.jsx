import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function SplashScreen() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuth()
  const [show, setShow] = useState(true)

  useEffect(() => {
    // Esperar a que termine de cargar la autenticación
    if (isLoading) return

    const timer = setTimeout(() => {
      setShow(false)

      // Si ya está autenticado, ir al dashboard
      // Si no, ir al login
      if (isAuthenticated) {
        console.log('✅ Usuario autenticado, redirigiendo a dashboard')
        navigate('/app/dashboard', { replace: true })
      } else {
        console.log('❌ Usuario no autenticado, redirigiendo a login')
        navigate('/login', { replace: true })
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [navigate, isAuthenticated, isLoading])

  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#2563eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <img
        src="/logo.png"
        alt="Cobrify"
        style={{
          width: '180px',
          height: '180px',
          objectFit: 'contain'
        }}
      />
    </div>
  )
}
