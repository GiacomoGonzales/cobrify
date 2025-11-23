import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export default function MigratePurchases() {
  const { user, isAdmin, isBusinessOwner } = useAuth()
  const [isRunning, setIsRunning] = useState(false)
  const [log, setLog] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  const addLog = (message, type = 'info') => {
    setLog(prev => [...prev, { message, type, timestamp: new Date().toISOString() }])
  }

  const migratePurchases = async () => {
    if (!user || (!isAdmin && !isBusinessOwner)) {
      setError('Solo administradores pueden ejecutar esta migración')
      return
    }

    setIsRunning(true)
    setLog([])
    setStats(null)
    setError(null)
    addLog('🔄 Llamando a la función de migración...', 'info')

    try {
      // URL de la función desplegada
      const functionUrl = 'https://migratepurchaseshttp-tb5ph5ddsq-uc.a.run.app'

      addLog('⏳ Ejecutando migración en el servidor...', 'info')

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (result.success) {
        // Procesar logs
        if (result.logs) {
          result.logs.forEach(logMsg => {
            if (logMsg.includes('✓') || logMsg.includes('COMPLETADA')) {
              addLog(logMsg, 'success')
            } else if (logMsg.includes('📦')) {
              addLog(logMsg, 'warning')
            } else {
              addLog(logMsg, 'info')
            }
          })
        }

        setStats(result.stats)

        addLog('='.repeat(60), 'info')
        addLog('✅ MIGRACIÓN COMPLETADA', 'success')
        addLog('='.repeat(60), 'info')
        addLog(result.message, 'success')

        if (result.stats.totalPurchasesMigrated > 0) {
          addLog('🎉 ¡Migración completada! Ve a la página de Compras para verificar.', 'success')
        }
      } else {
        throw new Error(result.error || 'Error desconocido')
      }

    } catch (err) {
      console.error('Error durante la migración:', err)
      const errorMessage = err.message || 'Error desconocido'
      setError(errorMessage)
      addLog(`❌ Error: ${errorMessage}`, 'error')
    } finally {
      setIsRunning(false)
    }
  }

  if (!user || (!isAdmin && !isBusinessOwner)) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <p className="text-center text-gray-700">
              Solo administradores pueden acceder a esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Migración de Compras</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Esta herramienta migra las compras creadas por usuarios secundarios a la ubicación correcta.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Advertencia:</strong> Este proceso moverá todas las compras de usuarios
                secundarios a las colecciones de sus respectivos negocios (owners). Esta operación
                no se puede deshacer.
              </p>
            </div>

            <Button
              onClick={migratePurchases}
              disabled={isRunning}
              className="w-full"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Migrando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Iniciar Migración
                </>
              )}
            </Button>

            {stats && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-900 mb-2">✅ Migración Completada</h3>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Usuarios con compras: {stats.usersWithPurchases}</li>
                  <li>• Total de compras migradas: {stats.totalPurchasesMigrated}</li>
                </ul>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-900 mb-2">❌ Error</h3>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {log.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Log de Ejecución</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs overflow-auto max-h-96">
              {log.map((entry, index) => (
                <div
                  key={index}
                  className={`${
                    entry.type === 'error'
                      ? 'text-red-400'
                      : entry.type === 'success'
                      ? 'text-green-400'
                      : entry.type === 'warning'
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                  }`}
                >
                  {entry.message}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
