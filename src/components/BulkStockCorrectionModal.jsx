import { useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, Wrench } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

/**
 * Modal para verificar y corregir el stock de TODOS los productos del inventario
 * a partir del historial de movimientos.
 *
 * Estados:
 *   - 'idle'      : pantalla inicial con descripción y botón "Iniciar verificación"
 *   - 'running'   : barra de progreso con conteo (X de Y)
 *   - 'done'      : resumen con cuántos se corrigieron y opcional lista
 *   - 'error'     : error inesperado al ejecutar
 *
 * Props:
 *   - isOpen, onClose
 *   - totalItems: número de items que se van a procesar (productos + ingredientes opcionalmente)
 *   - onStart: callback async que recibe ({ onProgress }) y devuelve el resultado del bulk
 *              { totalChecked, totalCorrected, errors, corrections, errorDetails }
 *   - onCompleted: callback opcional al cerrar tras éxito (para refrescar inventario)
 */
export default function BulkStockCorrectionModal({ isOpen, onClose, totalItems, onStart, onCompleted }) {
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState({ processed: 0, total: 0, corrected: 0, errors: 0, currentName: '' })
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const close = () => {
    if (phase === 'running') return
    if (phase === 'done' && onCompleted) onCompleted()
    setPhase('idle')
    setProgress({ processed: 0, total: 0, corrected: 0, errors: 0, currentName: '' })
    setResult(null)
    setErrorMsg('')
    onClose()
  }

  const handleStart = async () => {
    setPhase('running')
    setProgress({ processed: 0, total: totalItems, corrected: 0, errors: 0, currentName: '' })
    setResult(null)
    setErrorMsg('')
    try {
      const res = await onStart({
        onProgress: (state) => {
          setProgress(state)
        },
      })
      setResult(res)
      setPhase('done')
    } catch (err) {
      console.error('Error en verificación masiva de stock:', err)
      setErrorMsg(err?.message || String(err))
      setPhase('error')
    }
  }

  const percent = progress.total > 0
    ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
    : 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary-600" />
          <span className="text-lg font-bold">Verificar y corregir stock</span>
        </div>
      }
      size="md"
    >
      {phase === 'idle' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            Esto revisará <strong>{totalItems}</strong> producto{totalItems === 1 ? '' : 's'} del
            inventario y corregirá automáticamente el stock de aquellos cuyo valor no
            coincida con la suma de su historial de movimientos.
          </div>
          <ul className="text-xs text-gray-600 space-y-1 pl-4 list-disc">
            <li>El historial de movimientos es la fuente de verdad.</li>
            <li>Los productos con variantes recalculan cada variante por separado.</li>
            <li>Solo se corrigen los productos que efectivamente estén desfasados.</li>
            <li>Los productos correctos no se tocan.</li>
          </ul>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={close} className="flex-1">Cancelar</Button>
            <Button onClick={handleStart} className="flex-1 bg-primary-600 hover:bg-primary-700">
              <RefreshCw className="w-4 h-4 mr-2" />
              Iniciar verificación
            </Button>
          </div>
        </div>
      )}

      {phase === 'running' && (
        <div className="space-y-4">
          <div className="text-center py-2">
            <Loader2 className="w-10 h-10 text-primary-600 animate-spin mx-auto mb-2" />
            <div className="text-sm font-medium text-gray-800">
              Procesando {progress.processed} de {progress.total}…
            </div>
            <div className="text-xs text-gray-500 mt-1 truncate" title={progress.currentName || ''}>
              {progress.currentName ? `Último: ${progress.currentName}` : ' '}
            </div>
          </div>

          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-600 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div className="bg-green-50 border border-green-200 rounded p-2">
              <div className="font-medium text-green-700">Corregidos</div>
              <div className="text-lg font-bold text-green-800">{progress.corrected}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <div className="font-medium text-red-700">Errores</div>
              <div className="text-lg font-bold text-red-800">{progress.errors}</div>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">
            No cierres esta ventana. El proceso puede tardar varios segundos según la cantidad de productos.
          </p>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-4">
          <div className="text-center py-2">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
            <div className="text-base font-semibold text-gray-900">Verificación completa</div>
            <div className="text-sm text-gray-600">
              Se revisaron {result.totalChecked} producto{result.totalChecked === 1 ? '' : 's'}.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
              <div className="text-xs font-medium text-green-700">Corregidos</div>
              <div className="text-2xl font-bold text-green-800">{result.totalCorrected}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
              <div className="text-xs font-medium text-gray-600">Ya estaban OK</div>
              <div className="text-2xl font-bold text-gray-800">
                {Math.max(0, result.totalChecked - result.totalCorrected - result.errors)}
              </div>
            </div>
          </div>

          {result.errors > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                Hubo {result.errors} error{result.errors === 1 ? '' : 'es'} al procesar algunos productos. Revísalos individualmente.
              </div>
            </div>
          )}

          {result.corrections.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
                Productos corregidos ({result.corrections.length})
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                {result.corrections.map((c) => (
                  <div key={c.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-800 truncate" title={c.name}>
                      {c.name}
                      {c.hasVariants && c.variantsCount > 0 && (
                        <span className="ml-1 text-[10px] text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                          {c.variantsCount} var.
                        </span>
                      )}
                    </span>
                    <span className="text-gray-500 shrink-0">
                      <span className="line-through text-red-600">{c.previousStock}</span>
                      <span className="mx-1">→</span>
                      <span className="font-semibold text-green-700">{c.newStock}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={close} className="w-full bg-primary-600 hover:bg-primary-700">
            Cerrar
          </Button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded p-4 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <div className="font-semibold">Ocurrió un error</div>
              <div className="text-xs mt-1">{errorMsg || 'Error desconocido'}</div>
            </div>
          </div>
          <Button onClick={close} className="w-full">Cerrar</Button>
        </div>
      )}
    </Modal>
  )
}
