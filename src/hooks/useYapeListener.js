import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAppContext } from '@/hooks/useAppContext'
import {
  startListening,
  stopListening,
  isPermissionGranted,
  addNotificationListener
} from '@/plugins/notificationListener'
import { getYapeConfig } from '@/services/yapeService'
// NOTA: No guardamos en Firestore desde JS porque el servicio nativo (NotificationService.java)
// ya envía directamente a la Cloud Function saveYapePaymentNative.
// Esto evita duplicados y funciona incluso cuando la app está en background.

/**
 * Hook para escuchar notificaciones de Yape automáticamente
 * Solo funciona en Android (APK)
 */
export const useYapeListener = () => {
  const { user, getBusinessId } = useAppContext()
  const [isListening, setIsListening] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [yapeConfig, setYapeConfig] = useState(null)
  const listenerHandleRef = useRef(null)
  const isNative = Capacitor.isNativePlatform()

  // Cargar configuración de Yape
  useEffect(() => {
    const loadConfig = async () => {
      if (!user?.uid) return

      const businessId = getBusinessId()
      if (!businessId) return

      const result = await getYapeConfig(businessId)
      if (result.success) {
        setYapeConfig(result.data)
      }
    }

    loadConfig()
  }, [user, getBusinessId])

  // Verificar permiso e iniciar escucha automática
  useEffect(() => {
    // Evitar múltiples inicializaciones
    if (listenerHandleRef.current) {
      console.log('🎧 Yape listener ya está inicializado, ignorando')
      return
    }

    const initYapeListener = async () => {
      if (!isNative || !user?.uid || !yapeConfig) return

      // Solo iniciar si está habilitado en la configuración
      if (!yapeConfig.enabled || !yapeConfig.autoStartListening) {
        console.log('Yape listener deshabilitado en configuración')
        return
      }

      try {
        // Verificar permiso
        const granted = await isPermissionGranted()
        setHasPermission(granted)

        if (!granted) {
          console.log('Sin permiso para escuchar notificaciones')
          return
        }

        // Iniciar escucha
        await startListening()

        // Agregar listener solo para logging (el nativo maneja todo)
        const handle = await addNotificationListener(async (notification) => {
          console.log('🟢 Notificación Yape recibida en JS:', notification)
          // No hacemos nada aquí - el servicio nativo (NotificationService.java)
          // ya envió a Firebase y el trigger enviará el push
        })

        listenerHandleRef.current = handle
        setIsListening(true)
        console.log('🎧 Yape listener iniciado automáticamente')

      } catch (error) {
        console.error('Error iniciando Yape listener:', error)
      }
    }

    initYapeListener()

    // Cleanup solo al desmontar el componente
    return () => {
      if (listenerHandleRef.current) {
        listenerHandleRef.current = null
        stopListening().catch(console.error)
        setIsListening(false)
      }
    }
  }, [isNative, user?.uid, yapeConfig?.enabled, yapeConfig?.autoStartListening])

  return {
    isListening,
    hasPermission,
    yapeConfig,
    isNative
  }
}

export default useYapeListener
