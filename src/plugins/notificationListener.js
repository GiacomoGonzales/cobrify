import { registerPlugin } from '@capacitor/core'

/**
 * Plugin para escuchar notificaciones del sistema Android.
 * Útil para detectar pagos de Yape, Plin, etc.
 */
const NotificationListener = registerPlugin('NotificationListener')

/**
 * Inicia la escucha de notificaciones
 */
export const startListening = async () => {
  return await NotificationListener.startListening()
}

/**
 * Detiene la escucha de notificaciones
 */
export const stopListening = async () => {
  return await NotificationListener.stopListening()
}

/**
 * Verifica si la app tiene permiso para escuchar notificaciones
 */
export const isPermissionGranted = async () => {
  const result = await NotificationListener.isPermissionGranted()
  return result.granted
}

/**
 * Abre la configuración para que el usuario otorgue el permiso
 */
export const requestPermission = async () => {
  return await NotificationListener.requestPermission()
}

/**
 * Agrega un listener para recibir notificaciones
 * @param {function} callback - Función que recibe la notificación
 * @returns {Promise<{remove: function}>} - Handle para remover el listener
 */
export const addNotificationListener = async (callback) => {
  return await NotificationListener.addListener('notificationReceived', callback)
}

/**
 * Parsea una notificación de Yape para extraer el monto y remitente
 * @param {object} notification - Notificación recibida
 * @returns {object|null} - Datos del pago o null si no es un pago válido
 */
export const parseYapeNotification = (notification) => {
  if (!notification.isYape) return null

  const text = notification.text || ''
  const title = notification.title || ''

  // Patrones comunes de notificaciones de Yape
  // "Recibiste S/ 50.00 de Juan Pérez"
  // "Te yaperon S/ 100.00"

  // Buscar monto en formato S/ XX.XX o S/XX.XX
  const montoMatch = text.match(/S\/\s*(\d+(?:\.\d{2})?)/i) ||
                     title.match(/S\/\s*(\d+(?:\.\d{2})?)/i)

  if (!montoMatch) return null

  const monto = parseFloat(montoMatch[1])

  // Buscar nombre del remitente
  // "de Juan Pérez" o "de JUAN PEREZ"
  const nombreMatch = text.match(/de\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s]+)/i)
  const remitente = nombreMatch ? nombreMatch[1].trim() : 'Desconocido'

  return {
    monto,
    remitente,
    moneda: 'PEN',
    timestamp: notification.timestamp,
    textoOriginal: text,
    tituloOriginal: title
  }
}

export default NotificationListener
