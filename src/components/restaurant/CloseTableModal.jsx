import { useState } from 'react'
import { FileText, ShoppingCart, Loader2, CheckCircle, X, UserMinus, AlertTriangle } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function CloseTableModal({
  isOpen,
  onClose,
  table,
  order,
  onConfirm,
  onIndividualPayment,
  taxConfig = { igvRate: 18, igvExempt: false }
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isProcessing, setIsProcessing] = useState(false)
  const [showCloseWithoutReceipt, setShowCloseWithoutReceipt] = useState(false)
  const [closeReason, setCloseReason] = useState('')

  // Detectar si estamos en demo mode basado en la ruta actual
  const isDemoMode = location.pathname.startsWith('/demo')
  const isDemoRestaurant = location.pathname.startsWith('/demorestaurant')

  if (!table || !order) return null

  // Recalcular subtotal e IGV a partir del total actual (puede diferir del original por pagos individuales)
  const currentTotal = order.total || 0
  const igvRate = taxConfig.igvRate || 18
  const igvMultiplier = 1 + (igvRate / 100)
  const displaySubtotal = taxConfig.igvExempt ? currentTotal : currentTotal / igvMultiplier
  const displayTax = taxConfig.igvExempt ? 0 : currentTotal - displaySubtotal

  const handleClose = () => {
    setShowCloseWithoutReceipt(false)
    setCloseReason('')
    onClose()
  }

  const handleCreateReceipt = () => {
    // Construir la ruta correcta según el modo
    let posPath = '/app/pos'
    if (isDemoRestaurant) {
      posPath = '/demorestaurant/pos'
    } else if (isDemoMode) {
      posPath = '/demo/pos'
    }

    // Redirigir al POS con los datos de la orden
    navigate(posPath, {
      state: {
        fromTable: true,
        tableId: table.id,
        tableNumber: table.number,
        orderId: order.id,
        orderNumber: order.orderNumber,
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        // Información del mozo
        waiterId: table.waiterId || order.waiterId || null,
        waiterName: table.waiter || order.waiterName || null,
      }
    })
    handleClose()
  }

  const handleCloseWithoutReceipt = async () => {
    // Cuando la orden ya fue cobrada el input de motivo no se muestra, así que no se exige.
    // Sólo exigir motivo cuando la mesa se cierra SIN emitir comprobante (flujo de cortesía/anulación).
    if (!order.paid && !closeReason.trim()) return
    setIsProcessing(true)
    try {
      await onConfirm({
        generateReceipt: 'none',
        reason: order.paid ? 'Mesa liberada (orden ya cobrada)' : closeReason.trim(),
        amount: order.total || 0,
        items: order.items || [],
      })
    } catch (error) {
      console.error('Error al cerrar mesa:', error)
    } finally {
      setIsProcessing(false)
      handleClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Cerrar Cuenta - Mesa ${table.number}`}
      size="lg"
    >
      <div className="space-y-6">
        {/* Resumen de la cuenta */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-700 font-medium">Total a Cobrar:</span>
            <span className="text-3xl font-bold text-primary-600">
              S/ {(order.total || 0).toFixed(2)}
            </span>
          </div>
          <div className="text-sm text-gray-600 space-y-1">
            {!taxConfig.igvExempt && (
              <>
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>S/ {displaySubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IGV ({taxConfig.igvRate}%):</span>
                  <span>S/ {displayTax.toFixed(2)}</span>
                </div>
              </>
            )}
            {taxConfig.igvExempt && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md">
                <span className="font-medium">⚠️ Empresa exonerada de IGV</span>
              </div>
            )}
          </div>
        </div>

        {/* Opciones de cierre */}
        {order.paid ? (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-800">Esta orden ya fue cobrada</p>
                  <p className="text-sm text-green-700">El comprobante ya fue generado desde la opción Cobrar.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1"
                disabled={isProcessing}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCloseWithoutReceipt}
                disabled={isProcessing}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cerrando...
                  </>
                ) : (
                  'Liberar Mesa'
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                ¿Cómo desea cerrar la cuenta?
              </label>
              <div className="space-y-2">
                <button
                  onClick={handleCreateReceipt}
                  className="w-full flex items-center gap-3 p-3 border-2 border-primary-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
                >
                  <ShoppingCart className="w-8 h-8 flex-shrink-0 text-primary-600" />
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">Crear Comprobante</div>
                    <div className="text-xs text-gray-500">Ir al POS para generar Boleta, Factura o Nota de Venta</div>
                  </div>
                </button>
                <button
                  onClick={() => { if (onIndividualPayment) onIndividualPayment() }}
                  className="w-full flex items-center gap-3 p-3 border-2 border-orange-200 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
                >
                  <UserMinus className="w-8 h-8 flex-shrink-0 text-orange-600" />
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">Cobro Individual</div>
                    <div className="text-xs text-gray-500">Cobrar items parciales, mesa sigue abierta</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Confirmación de cerrar sin comprobante */}
            {showCloseWithoutReceipt && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Cerrar sin comprobante</p>
                    <p className="text-xs text-red-600 mt-0.5">Esta acción quedará registrada. Ingrese el motivo:</p>
                  </div>
                </div>
                <Input
                  placeholder="Ej: Cortesía, error en pedido, cliente se fue..."
                  value={closeReason}
                  onChange={e => setCloseReason(e.target.value)}
                  required
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowCloseWithoutReceipt(false); setCloseReason('') }}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCloseWithoutReceipt}
                    disabled={isProcessing || !closeReason.trim()}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isProcessing ? 'Cerrando...' : 'Confirmar'}
                  </Button>
                </div>
              </div>
            )}

            {/* Footer: Cancelar + link sutil */}
            <div className="flex items-center justify-between pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowCloseWithoutReceipt(!showCloseWithoutReceipt)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                disabled={isProcessing}
              >
                Cerrar sin comprobante
              </button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                size="sm"
                disabled={isProcessing}
              >
                Cancelar
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
