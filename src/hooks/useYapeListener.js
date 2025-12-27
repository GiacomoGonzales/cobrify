import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  startListening,
  stopListening,
  isPermissionGranted,
  addNotificationListener
} from '@/plugins/notificationListener'
import {
  saveYapePayment,
  parseYapeNotification,
  getYapeConfig
} from '@/services/yapeService'
import { getFunctions, httpsCallable } from 'firebase/functions'

/**
 * Hook para escuchar notificaciones de Yape automáticamente
 * Solo funciona en Android (APK)
 */
export const useYapeListener = () => {
  const { user, getBusinessId } = useAppContext()
  const toast = useToast()
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

        // Agregar listener
        const handle = await addNotificationListener(async (notification) => {
          console.log('🟢 Notificación Yape recibida:', notification)

          // Parsear notificación
          const paymentData = parseYapeNotification(notification)

          if (!paymentData) {
            console.log('No se pudo parsear la notificación de Yape')
            return
          }

          console.log('💰 Pago detectado:', paymentData)

          const businessId = getBusinessId()
          if (!businessId) return

          // Guardar en Firestore
          const saveResult = await saveYapePayment(businessId, {
            ...paymentData,
            detectedBy: user.uid
          })

          if (saveResult.success) {
            console.log('✅ Pago guardado:', saveResult.id)

            // Mostrar toast local
            toast.success(`Yape recibido: S/ ${paymentData.amount.toFixed(2)} de ${paymentData.senderName}`)

            // Enviar push a otros usuarios via Cloud Function
            try {
              const functions = getFunctions()
              const sendYapeNotification = httpsCallable(functions, 'onYapePaymentDetected')

              await sendYapeNotification({
                businessId,
                paymentId: saveResult.id,
                amount: paymentData.amount,
                senderName: paymentData.senderName
              })

              console.log('📤 Notificación push enviada')
            } catch (pushError) {
              console.warn('Error enviando push de Yape:', pushError)
            }
          }
        })

        listenerHandleRef.current = handle
        setIsListening(true)
        console.log('🎧 Yape listener iniciado automáticamente')

      } catch (error) {
        console.error('Error iniciando Yape listener:', error)
      }
    }

    initYapeListener()

    // Cleanup al desmontar
    return () => {
      if (listenerHandleRef.current) {
        stopListening().catch(console.error)
        setIsListening(false)
      }
    }
  }, [isNative, user, yapeConfig, getBusinessId, toast])

  return {
    isListening,
    hasPermission,
    yapeConfig,
    isNative
  }
}

export default useYapeListener
