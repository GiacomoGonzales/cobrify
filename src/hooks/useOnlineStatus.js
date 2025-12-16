import { useState, useEffect, useCallback } from 'react'

/**
 * Hook para detectar el estado de conectividad del dispositivo
 * Retorna información sobre si está online/offline y funciones útiles
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Conexión restaurada')
      setIsOnline(true)
      // Si estaba offline y ahora está online, marcarlo
      if (!isOnline) {
        setWasOffline(true)
        // Resetear wasOffline después de 5 segundos
        setTimeout(() => setWasOffline(false), 5000)
      }
    }

    const handleOffline = () => {
      console.log('📴 Sin conexión a internet')
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isOnline])

  // Función para verificar conectividad real (no solo el estado del navegador)
  const checkRealConnectivity = useCallback(async () => {
    try {
      // Intentar hacer un ping a Firebase
      const response = await fetch('https://www.googleapis.com/generate_204', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache',
      })
      return true
    } catch {
      return false
    }
  }, [])

  return {
    isOnline,
    isOffline: !isOnline,
    wasOffline, // true si acaba de reconectarse
    checkRealConnectivity,
  }
}
