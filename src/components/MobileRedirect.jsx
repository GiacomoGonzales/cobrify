import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'

export default function MobileRedirect({ children }) {
  const navigate = useNavigate()
  const [showSplash, setShowSplash] = useState(Capacitor.isNativePlatform())

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Mostrar splash por 2 segundos, luego ir al login
      const timer = setTimeout(() => {
        setShowSplash(false)
        navigate('/login', { replace: true })
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [navigate])

  // Si es móvil y debe mostrar splash
  if (showSplash) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        backgroundColor: '#2563eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
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

  // Si es web, mostrar el contenido normal (landing page)
  return children
}
