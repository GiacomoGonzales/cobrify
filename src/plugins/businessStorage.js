import { registerPlugin } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'

/**
 * Plugin para almacenar businessId y userId en el almacenamiento nativo.
 * Esto permite que el servicio de notificaciones nativo acceda a la info
 * del negocio incluso cuando la app está en background.
 */
const BusinessStorage = registerPlugin('BusinessStorage')

/**
 * Guarda la información del negocio en almacenamiento nativo
 * @param {string} businessId - ID del negocio
 * @param {string} userId - ID del usuario
 * @param {string} businessName - Nombre del negocio (opcional)
 */
export const setBusinessInfo = async (businessId, userId, businessName = '') => {
  if (!Capacitor.isNativePlatform()) {
    console.log('[BusinessStorage] No es plataforma nativa, ignorando')
    return { success: true }
  }

  try {
    const result = await BusinessStorage.setBusinessInfo({
      businessId,
      userId,
      businessName
    })
    console.log('[BusinessStorage] Info guardada:', { businessId, userId })
    return result
  } catch (error) {
    console.error('[BusinessStorage] Error guardando info:', error)
    throw error
  }
}

/**
 * Obtiene la información del negocio guardada
 * @returns {Promise<{businessId: string, userId: string, businessName: string}>}
 */
export const getBusinessInfo = async () => {
  if (!Capacitor.isNativePlatform()) {
    return { businessId: null, userId: null, businessName: null }
  }

  try {
    return await BusinessStorage.getBusinessInfo()
  } catch (error) {
    console.error('[BusinessStorage] Error obteniendo info:', error)
    return { businessId: null, userId: null, businessName: null }
  }
}

/**
 * Limpia la información del negocio (para logout)
 */
export const clearBusinessInfo = async () => {
  if (!Capacitor.isNativePlatform()) {
    return { success: true }
  }

  try {
    return await BusinessStorage.clearBusinessInfo()
  } catch (error) {
    console.error('[BusinessStorage] Error limpiando info:', error)
    throw error
  }
}

export default BusinessStorage
