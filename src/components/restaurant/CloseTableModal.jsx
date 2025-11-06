import { useState } from 'react'
import { FileText, CreditCard, Loader2, CheckCircle, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

export default function CloseTableModal({
  isOpen,
  onClose,
  table,
  order,
  onConfirm
}) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [generateReceipt, setGenerateReceipt] = useState(null) // null, 'boleta', 'factura', 'none'
  const [documentType, setDocumentType] = useState('')
  const [documentNumber, setDocumentNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Efectivo')

  if (!table || !order) return null

  const handleClose = () => {
    setGenerateReceipt(null)
    setDocumentType('')
    setDocumentNumber('')
    setCustomerName('')
    setPaymentMethod('Efectivo')
    onClose()
  }

  const handleConfirm = async () => {
    // Validar según el tipo de comprobante
    if (generateReceipt === 'boleta') {
      if (documentNumber && documentNumber.length !== 8) {
        alert('El DNI debe tener 8 dígitos')
        return
      }
    } else if (generateReceipt === 'factura') {
      if (!documentNumber || documentNumber.length !== 11) {
        alert('El RUC debe tener 11 dígitos')
        return
      }
      if (!customerName.trim()) {
        alert('La razón social es obligatoria para facturas')
        return
      }
    }

    setIsProcessing(true)
    try {
      await onConfirm({
        generateReceipt,
        documentType: generateReceipt === 'boleta' ? 'DNI' : generateReceipt === 'factura' ? 'RUC' : null,
        documentNumber: documentNumber || null,
        customerName: customerName || null,
        paymentMethod,
      })
      handleClose()
    } catch (error) {
      console.error('Error al cerrar mesa:', error)
    } finally {
      setIsProcessing(false)
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
              <span>IGV (18%):</span>
              <span>S/ {(order.tax || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Pregunta inicial */}
        {generateReceipt === null && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              ¿Desea generar comprobante de pago?
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setGenerateReceipt('boleta')}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-center"
              >
                <FileText className="w-8 h-8 mx-auto mb-2 text-primary-600" />
                <div className="font-medium text-gray-900">Boleta</div>
                <div className="text-xs text-gray-600 mt-1">Con DNI</div>
              </button>
              <button
                onClick={() => setGenerateReceipt('factura')}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-center"
              >
                <FileText className="w-8 h-8 mx-auto mb-2 text-primary-600" />
                <div className="font-medium text-gray-900">Factura</div>
                <div className="text-xs text-gray-600 mt-1">Con RUC</div>
              </button>
              <button
                onClick={() => setGenerateReceipt('none')}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors text-center"
              >
                <X className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                <div className="font-medium text-gray-900">Sin Comprobante</div>
                <div className="text-xs text-gray-600 mt-1">Solo cerrar</div>
              </button>
            </div>
          </div>
        )}

        {/* Formulario para Boleta */}
        {generateReceipt === 'boleta' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Datos para Boleta</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setGenerateReceipt(null)}
              >
                Cambiar
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                DNI (Opcional)
              </label>
              <Input
                type="text"
                placeholder="12345678"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
                maxLength={8}
              />
              <p className="text-xs text-gray-500 mt-1">Dejar vacío para boleta sin DNI</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Cliente (Opcional)
              </label>
              <Input
                type="text"
                placeholder="Nombre completo"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Método de Pago
              </label>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Yape/Plin">Yape/Plin</option>
                <option value="Transferencia">Transferencia</option>
              </Select>
            </div>
          </div>
        )}

        {/* Formulario para Factura */}
        {generateReceipt === 'factura' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Datos para Factura</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setGenerateReceipt(null)}
              >
                Cambiar
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                RUC *
              </label>
              <Input
                type="text"
                placeholder="20123456789"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                maxLength={11}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Razón Social *
              </label>
              <Input
                type="text"
                placeholder="Empresa SAC"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Método de Pago
              </label>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Yape/Plin">Yape/Plin</option>
                <option value="Transferencia">Transferencia</option>
              </Select>
            </div>
          </div>
        )}

        {/* Confirmación sin comprobante */}
        {generateReceipt === 'none' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Cerrar sin comprobante</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setGenerateReceipt(null)}
              >
                Cambiar
              </Button>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                La mesa se cerrará sin generar comprobante de pago. El cajero podrá generarlo después desde el POS si es necesario.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Método de Pago
              </label>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Yape/Plin">Yape/Plin</option>
                <option value="Transferencia">Transferencia</option>
              </Select>
            </div>
          </div>
        )}

        {/* Botones */}
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
            onClick={handleConfirm}
            disabled={isProcessing || generateReceipt === null}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                {generateReceipt === 'none' ? 'Cerrar Mesa' : 'Generar y Cerrar'}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
