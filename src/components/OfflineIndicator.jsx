import { useState, useEffect } from 'react'
import { WifiOff, Wifi, CloudOff, RefreshCw, AlertCircle } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { getPendingSalesCount } from '@/services/offlineQueueService'
import { processPendingSales, onSyncEvent } from '@/services/offlineSyncService'
import { useAppContext } from '@/hooks/useAppContext'

/**
 * Componente que muestra el estado de conexión y ventas pendientes
 * Se muestra como una barra flotante cuando está offline o hay ventas pendientes
 */
export default function OfflineIndicator() {
  const { isOnline, isOffline, wasOffline } = useOnlineStatus()
  const { user, isDemoMode } = useAppContext()
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [showReconnected, setShowReconnected] = useState(false)

  // Cargar conteo de ventas pendientes
  useEffect(() => {
    const loadPendingCount = async () => {
      try {
        const count = await getPendingSalesCount()
        setPendingCount(count)
      } catch (error) {
        console.error('Error cargando ventas pendientes:', error)
      }
    }

    loadPendingCount()

    // Actualizar cada 30 segundos
    const interval = setInterval(loadPendingCount, 30000)
    return () => clearInterval(interval)
  }, [])

  // Escuchar eventos de sincronización
  useEffect(() => {
    const unsubscribe = onSyncEvent((event, data) => {
      switch (event) {
        case 'sync_started':
          setIsSyncing(true)
          setSyncMessage('Sincronizando ventas...')
          break
        case 'processing_sale':
          setSyncMessage('Procesando venta pendiente...')
          break
        case 'sale_processed':
          setPendingCount(prev => Math.max(0, prev - 1))
          break
        case 'sync_completed':
          setIsSyncing(false)
          if (data.processed > 0) {
            setSyncMessage(`${data.processed} venta(s) sincronizada(s)`)
            setTimeout(() => setSyncMessage(''), 3000)
          } else {
            setSyncMessage('')
          }
          break
        case 'sale_failed':
          setSyncMessage('Error sincronizando, se reintentará')
          setTimeout(() => setSyncMessage(''), 3000)
          break
      }
    })

    return unsubscribe
  }, [])

  // Mostrar mensaje de reconexión
  useEffect(() => {
    if (wasOffline && isOnline) {
      setShowReconnected(true)
      setTimeout(() => setShowReconnected(false), 3000)
    }
  }, [wasOffline, isOnline])

  // Manejar sincronización manual
  const handleManualSync = async () => {
    if (!user?.uid || isSyncing) return
    setIsSyncing(true)
    await processPendingSales(user.uid)
    setIsSyncing(false)
  }

  // No mostrar en modo demo
  if (isDemoMode) return null

  // No mostrar si está online y no hay pendientes
  if (isOnline && pendingCount === 0 && !showReconnected && !syncMessage) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm">
      {/* Banner de offline */}
      {isOffline && (
        <div className="flex items-center gap-3 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg mb-2 animate-pulse">
          <WifiOff className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">Sin conexión a internet</p>
            <p className="text-xs text-red-100">Las ventas se guardarán localmente</p>
          </div>
          <CloudOff className="w-4 h-4 text-red-200" />
        </div>
      )}

      {/* Banner de reconexión */}
      {showReconnected && isOnline && (
        <div className="flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg mb-2">
          <Wifi className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">Conexión restaurada</p>
            <p className="text-xs text-green-100">Sincronizando datos...</p>
          </div>
        </div>
      )}

      {/* Banner de ventas pendientes */}
      {pendingCount > 0 && isOnline && !showReconnected && (
        <div className="flex items-center gap-3 bg-amber-500 text-white px-4 py-3 rounded-lg shadow-lg">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">
              {pendingCount} venta{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-100">
              {syncMessage || 'Esperando sincronización'}
            </p>
          </div>
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="p-2 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-50"
            title="Sincronizar ahora"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}

      {/* Banner de sincronización exitosa */}
      {syncMessage && isOnline && pendingCount === 0 && !showReconnected && (
        <div className="flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg">
          <Wifi className="w-5 h-5 flex-shrink-0" />
          <p className="font-medium text-sm">{syncMessage}</p>
        </div>
      )}
    </div>
  )
}
