import { useState } from 'react'
import { Users, DollarSign, CheckCircle, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function SplitBillModal({ isOpen, onClose, table, order, onConfirm }) {
  const [splitMethod, setSplitMethod] = useState('equal') // 'equal' or 'custom'
  const [numberOfPeople, setNumberOfPeople] = useState(2)
  const [customAmounts, setCustomAmounts] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)

  if (!table || !order) return null

  const totalAmount = order.total || 0

  const handleSplitEqual = () => {
    const amountPerPerson = totalAmount / numberOfPeople
    const amounts = Array(numberOfPeople).fill(amountPerPerson)
    setCustomAmounts(amounts)
  }

  const handleCustomAmountChange = (index, value) => {
    const newAmounts = [...customAmounts]
    newAmounts[index] = parseFloat(value) || 0
    setCustomAmounts(newAmounts)
  }

  const getTotalCustomAmount = () => {
    return customAmounts.reduce((sum, amount) => sum + amount, 0)
  }

  const getRemainingAmount = () => {
    return totalAmount - getTotalCustomAmount()
  }

  const handleConfirm = async () => {
    if (splitMethod === 'equal') {
      handleSplitEqual()
    }

    // Validar que los montos personalizados sumen el total
    if (splitMethod === 'custom') {
      const customTotal = getTotalCustomAmount()
      if (Math.abs(customTotal - totalAmount) > 0.01) {
        alert(`Los montos deben sumar S/ ${totalAmount.toFixed(2)}. Actualmente suman S/ ${customTotal.toFixed(2)}`)
        return
      }
    }

    setIsProcessing(true)
    try {
      const amounts = splitMethod === 'equal'
        ? Array(numberOfPeople).fill(totalAmount / numberOfPeople)
        : customAmounts

      await onConfirm({
        method: splitMethod,
        numberOfPeople: splitMethod === 'equal' ? numberOfPeople : customAmounts.length,
        amounts,
        total: totalAmount
      })

      handleClose()
    } catch (error) {
      console.error('Error al procesar división de cuenta:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    setSplitMethod('equal')
    setNumberOfPeople(2)
    setCustomAmounts([])
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          <div>
            <div className="text-lg font-bold">Dividir Cuenta - Mesa {table.number}</div>
            <div className="text-sm font-normal text-gray-600">
              Total: S/ {totalAmount.toFixed(2)}
            </div>
          </div>
        </div>
      }
      size="md"
    >
      <div className="space-y-6">
        {/* Total de la cuenta */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-700 font-medium">Total de la Cuenta:</span>
            <span className="text-2xl font-bold text-primary-600">
              S/ {totalAmount.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Método de división */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Método de División
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setSplitMethod('equal')
                setCustomAmounts([])
              }}
              className={`p-4 border-2 rounded-lg text-left transition-colors ${
                splitMethod === 'equal'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900">Partes Iguales</div>
              <div className="text-sm text-gray-600 mt-1">
                Dividir el total entre N personas
              </div>
            </button>
            <button
              onClick={() => {
                setSplitMethod('custom')
                // Inicializar con 2 personas
                if (customAmounts.length === 0) {
                  setCustomAmounts([totalAmount / 2, totalAmount / 2])
                }
              }}
              className={`p-4 border-2 rounded-lg text-left transition-colors ${
                splitMethod === 'custom'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900">Montos Personalizados</div>
              <div className="text-sm text-gray-600 mt-1">
                Especificar monto por persona
              </div>
            </button>
          </div>
        </div>

        {/* División igual */}
        {splitMethod === 'equal' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Número de Personas
            </label>
            <Input
              type="number"
              min="2"
              max="20"
              value={numberOfPeople}
              onChange={(e) => setNumberOfPeople(parseInt(e.target.value) || 2)}
              className="w-full"
            />
            <div className="mt-4 bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Monto por persona:</span>
                <span className="text-xl font-bold text-gray-900">
                  S/ {(totalAmount / numberOfPeople).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* División personalizada */}
        {splitMethod === 'custom' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Montos por Persona
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCustomAmounts([...customAmounts, 0])}
              >
                + Agregar Persona
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {customAmounts.map((amount, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600 w-24">
                    Persona {index + 1}:
                  </span>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      S/
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => handleCustomAmountChange(index, e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  {customAmounts.length > 2 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newAmounts = customAmounts.filter((_, i) => i !== index)
                        setCustomAmounts(newAmounts)
                      }}
                      className="text-red-500 hover:bg-red-50"
                    >
                      Quitar
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Resumen de montos personalizados */}
            <div className="mt-4 space-y-2 bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total asignado:</span>
                <span className="font-medium">S/ {getTotalCustomAmount().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Restante:</span>
                <span className={`font-medium ${getRemainingAmount() > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  S/ {getRemainingAmount().toFixed(2)}
                </span>
              </div>
              {Math.abs(getRemainingAmount()) > 0.01 && (
                <div className="text-xs text-amber-600 mt-2">
                  ⚠️ Los montos deben sumar exactamente S/ {totalAmount.toFixed(2)}
                </div>
              )}
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
            disabled={isProcessing || (splitMethod === 'custom' && Math.abs(getRemainingAmount()) > 0.01)}
            className="flex-1 bg-primary-600 hover:bg-primary-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirmar División
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
