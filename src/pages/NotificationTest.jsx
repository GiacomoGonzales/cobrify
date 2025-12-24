import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Bell, BellOff, Settings, Trash2, DollarSign } from 'lucide-react'
import {
  startListening,
  stopListening,
  isPermissionGranted,
  requestPermission,
  addNotificationListener,
  parseYapeNotification
} from '@/plugins/notificationListener'

/**
 * Página de prueba para el detector de notificaciones de Yape
 * Esta página es solo para testing, no debe ir a producción
 */
export default function NotificationTest() {
  const [hasPermission, setHasPermission] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [yapePayments, setYapePayments] = useState([])
  const [error, setError] = useState(null)

  const isNative = Capacitor.isNativePlatform()

  // Verificar permiso al cargar
  useEffect(() => {
    if (isNative) {
      checkPermission()
    }
  }, [isNative])

  const checkPermission = async () => {
    try {
      const granted = await isPermissionGranted()
      setHasPermission(granted)
    } catch (err) {
      setError('Error al verificar permisos: ' + err.message)
    }
  }

  const handleRequestPermission = async () => {
    try {
      await requestPermission()
      // El usuario tiene que otorgar el permiso manualmente
      // Después de regresar de configuración, verificamos
      setTimeout(checkPermission, 1000)
    } catch (err) {
      setError('Error al solicitar permiso: ' + err.message)
    }
  }

  const handleStartListening = async () => {
    try {
      await startListening()

      // Agregar listener para notificaciones
      const handle = await addNotificationListener((notification) => {
        console.log('Notificación recibida:', notification)

        // Agregar a la lista de notificaciones
        setNotifications(prev => [{
          ...notification,
          id: Date.now(),
          receivedAt: new Date().toLocaleTimeString()
        }, ...prev].slice(0, 50)) // Mantener solo las últimas 50

        // Si es de Yape, parsear y agregar a pagos
        const yapePayment = parseYapeNotification(notification)
        if (yapePayment) {
          setYapePayments(prev => [{
            ...yapePayment,
            id: Date.now(),
            receivedAt: new Date().toLocaleTimeString()
          }, ...prev])
        }
      })

      setIsListening(true)
      setError(null)
    } catch (err) {
      setError('Error al iniciar escucha: ' + err.message)
    }
  }

  const handleStopListening = async () => {
    try {
      await stopListening()
      setIsListening(false)
    } catch (err) {
      setError('Error al detener escucha: ' + err.message)
    }
  }

  const clearNotifications = () => {
    setNotifications([])
    setYapePayments([])
  }

  if (!isNative) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-lg mx-auto bg-white rounded-lg shadow p-6">
          <h1 className="text-xl font-bold text-gray-800 mb-4">
            Detector de Notificaciones Yape
          </h1>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">
              Esta funcionalidad solo está disponible en la app Android.
              Por favor, prueba desde el APK instalado en tu dispositivo.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-4">
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            Detector de Notificaciones Yape
          </h1>
          <p className="text-gray-600 text-sm">
            Prueba de lectura de notificaciones del sistema
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Estado de permisos */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Estado</h2>

          <div className="space-y-3">
            {/* Permiso */}
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Permiso de notificaciones:</span>
              <span className={`px-2 py-1 rounded text-sm ${hasPermission ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                {hasPermission ? 'Otorgado' : 'No otorgado'}
              </span>
            </div>

            {/* Escuchando */}
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Escuchando:</span>
              <span className={`px-2 py-1 rounded text-sm ${isListening ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                {isListening ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
        </div>

        {/* Controles */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Controles</h2>

          <div className="grid grid-cols-2 gap-3">
            {!hasPermission && (
              <button
                onClick={handleRequestPermission}
                className="col-span-2 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700"
              >
                <Settings className="w-5 h-5" />
                Otorgar Permiso
              </button>
            )}

            {hasPermission && !isListening && (
              <button
                onClick={handleStartListening}
                className="col-span-2 flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700"
              >
                <Bell className="w-5 h-5" />
                Iniciar Escucha
              </button>
            )}

            {isListening && (
              <button
                onClick={handleStopListening}
                className="col-span-2 flex items-center justify-center gap-2 bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700"
              >
                <BellOff className="w-5 h-5" />
                Detener Escucha
              </button>
            )}

            <button
              onClick={clearNotifications}
              className="col-span-2 flex items-center justify-center gap-2 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300"
            >
              <Trash2 className="w-4 h-4" />
              Limpiar
            </button>
          </div>
        </div>

        {/* Pagos de Yape detectados */}
        {yapePayments.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Pagos Yape Detectados ({yapePayments.length})
            </h2>

            <div className="space-y-3">
              {yapePayments.map(payment => (
                <div key={payment.id} className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-green-800">
                        S/ {payment.monto.toFixed(2)}
                      </p>
                      <p className="text-green-700 text-sm">
                        De: {payment.remitente}
                      </p>
                    </div>
                    <span className="text-xs text-green-600">
                      {payment.receivedAt}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 truncate">
                    {payment.textoOriginal}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Todas las notificaciones */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-800 mb-3">
            Todas las Notificaciones ({notifications.length})
          </h2>

          {notifications.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">
              {isListening
                ? 'Esperando notificaciones...'
                : 'Inicia la escucha para ver notificaciones'}
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`border rounded-lg p-3 ${notif.isYape ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'
                    }`}
                >
                  <div className="flex justify-between items-start">
                    <p className="font-medium text-gray-800 text-sm">
                      {notif.title || '(Sin título)'}
                    </p>
                    <span className="text-xs text-gray-500">
                      {notif.receivedAt}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm mt-1">
                    {notif.text || '(Sin texto)'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {notif.packageName}
                  </p>
                  {notif.isYape && (
                    <span className="inline-block mt-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                      YAPE
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instrucciones */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">Instrucciones</h3>
          <ol className="text-blue-700 text-sm space-y-1 list-decimal list-inside">
            <li>Presiona "Otorgar Permiso"</li>
            <li>Busca "Cobrify" en la lista y actívalo</li>
            <li>Regresa a la app y presiona "Iniciar Escucha"</li>
            <li>Envíate un Yape de prueba para ver si se detecta</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
