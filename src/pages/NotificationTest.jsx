import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { ArrowLeft, Bell, CheckCircle, XCircle, Settings, RefreshCw } from 'lucide-react'
import {
  isPermissionGranted,
  requestPermission
} from '@/plugins/notificationListener'
import { useAppContext } from '@/hooks/useAppContext'
import { getYapeConfig, getPendingYapePayments } from '@/services/yapeService'

/**
 * Página de estado del detector de Yape
 * Muestra si está configurado correctamente y los pagos recientes
 */
export default function NotificationTest() {
  const navigate = useNavigate()
  const { user, getBusinessId } = useAppContext()
  const [hasPermission, setHasPermission] = useState(false)
  const [yapeConfig, setYapeConfig] = useState(null)
  const [recentPayments, setRecentPayments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const isNative = Capacitor.isNativePlatform()

  // Cargar estado al montar
  useEffect(() => {
    loadStatus()
  }, [user])

  const loadStatus = async () => {
    setIsLoading(true)
    try {
      // Verificar permiso (solo en nativo)
      if (isNative) {
        const granted = await isPermissionGranted()
        setHasPermission(granted)
      }

      // Cargar configuración de Yape
      const businessId = getBusinessId()
      if (businessId) {
        const configResult = await getYapeConfig(businessId)
        if (configResult.success) {
          setYapeConfig(configResult.data)
        }

        // Cargar pagos recientes
        const paymentsResult = await getPendingYapePayments(businessId)
        if (paymentsResult.success) {
          setRecentPayments(paymentsResult.data)
        }
      }
    } catch (err) {
      setError('Error al cargar estado: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestPermission = async () => {
    try {
      await requestPermission()
      setTimeout(loadStatus, 1000)
    } catch (err) {
      setError('Error al solicitar permiso: ' + err.message)
    }
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header con botón atrás */}
      <div className="bg-purple-600 text-white p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-purple-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Detector de Yape</h1>
            <p className="text-purple-200 text-sm">Estado y pagos recientes</p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Estado del sistema */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Estado del Sistema</h2>
            <button
              onClick={loadStatus}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-3">
            {/* Plataforma */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">Plataforma</span>
              <span className={`flex items-center gap-1 text-sm ${isNative ? 'text-green-600' : 'text-yellow-600'}`}>
                {isNative ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Android (APK)
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Web (no soportado)
                  </>
                )}
              </span>
            </div>

            {/* Permiso */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">Permiso de notificaciones</span>
              <span className={`flex items-center gap-1 text-sm ${hasPermission ? 'text-green-600' : 'text-red-600'}`}>
                {hasPermission ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Otorgado
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    No otorgado
                  </>
                )}
              </span>
            </div>

            {/* Función habilitada */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">Detector activado</span>
              <span className={`flex items-center gap-1 text-sm ${yapeConfig?.enabled ? 'text-green-600' : 'text-gray-500'}`}>
                {yapeConfig?.enabled ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Activado
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Desactivado
                  </>
                )}
              </span>
            </div>

            {/* Auto-inicio */}
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Inicio automático</span>
              <span className={`flex items-center gap-1 text-sm ${yapeConfig?.autoStartListening ? 'text-green-600' : 'text-gray-500'}`}>
                {yapeConfig?.autoStartListening ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Activado
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Desactivado
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Acción requerida: Otorgar permiso */}
        {isNative && !hasPermission && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-800 mb-2">Acción requerida</h3>
            <p className="text-yellow-700 text-sm mb-3">
              Necesitas otorgar el permiso de acceso a notificaciones para detectar pagos de Yape.
            </p>
            <button
              onClick={handleRequestPermission}
              className="w-full flex items-center justify-center gap-2 bg-yellow-600 text-white py-3 px-4 rounded-lg hover:bg-yellow-700"
            >
              <Settings className="w-5 h-5" />
              Otorgar Permiso
            </button>
          </div>
        )}

        {/* Acción requerida: Activar en configuración */}
        {!yapeConfig?.enabled && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">Activar detector</h3>
            <p className="text-blue-700 text-sm mb-3">
              El detector de Yape está desactivado. Actívalo desde Configuración.
            </p>
            <button
              onClick={() => navigate('/settings')}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700"
            >
              <Settings className="w-5 h-5" />
              Ir a Configuración
            </button>
          </div>
        )}

        {/* Todo OK */}
        {isNative && hasPermission && yapeConfig?.enabled && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Todo configurado correctamente</span>
            </div>
            <p className="text-green-700 text-sm mt-2">
              El detector de Yape está activo. Cuando recibas un pago, se notificará automáticamente.
            </p>
          </div>
        )}

        {/* Pagos recientes */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-600" />
            Pagos Yape Recientes
          </h2>

          {recentPayments.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">
              No hay pagos detectados aún
            </p>
          ) : (
            <div className="space-y-3">
              {recentPayments.slice(0, 10).map(payment => (
                <div key={payment.id} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-purple-800">
                        S/ {payment.amount?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-purple-700 text-sm">
                        De: {payment.senderName || 'Desconocido'}
                      </p>
                    </div>
                    <span className="text-xs text-purple-600">
                      {formatDate(payment.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Botón volver */}
        <button
          onClick={() => navigate('/settings')}
          className="w-full bg-gray-200 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-300 flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Configuración
        </button>
      </div>
    </div>
  )
}
