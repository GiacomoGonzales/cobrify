import { useState } from 'react'
import { FileText, ShoppingCart, Loader2, CheckCircle, X } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

export default function CloseTableModal({
  isOpen,
  onClose,
  table,
  order,
  onConfirm,
  taxConfig = { igvRate: 18, igvExempt: false }
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isProcessing, setIsProcessing] = useState(false)

  // Detectar si estamos en demo mode basado en la ruta actual
  const isDemoMode = location.pathname.startsWith('/demo')
  const isDemoRestaurant = location.pathname.startsWith('/demorestaurant')

  if (!table || !order) return null

  const handleClose = () => {
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
    setIsProcessing(true)
    try {
      await onConfirm({
        generateReceipt: 'none',
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
      size="md"
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
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>S/ {(order.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>IGV ({taxConfig.igvRate}%):</span>
              <span>S/ {(order.tax || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Opciones de cierre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            ¿Cómo desea cerrar la cuenta?
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleCreateReceipt}
              className="p-6 border-2 border-primary-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-center"
            >
              <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-primary-600" />
              <div className="font-semibold text-gray-900 mb-1">Crear Comprobante</div>
              <div className="text-xs text-gray-600">
                Ir al POS para generar Boleta, Factura o Nota de Venta
              </div>
            </button>
            <button
              onClick={handleCloseWithoutReceipt}
              disabled={isProcessing}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-10 h-10 mx-auto mb-3 text-gray-600" />
              <div className="font-semibold text-gray-900 mb-1">
                {isProcessing ? 'Cerrando...' : 'Cerrar sin Comprobante'}
              </div>
              <div className="text-xs text-gray-600">
                Liberar la mesa sin generar comprobante
              </div>
            </button>
          </div>
        </div>

        {/* Botón cancelar */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="w-full"
            disabled={isProcessing}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
