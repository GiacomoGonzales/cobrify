import { useState, useEffect, useMemo } from 'react'
import { Tag, Loader2, Trash2, Percent, DollarSign } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { applyOrderDiscount, removeOrderDiscount } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'

export default function ApplyDiscountModal({ isOpen, onClose, table, order, onSuccess }) {
  const { getBusinessId, user } = useAppContext()
  const demoContext = useDemoRestaurant()
  const toast = useToast()

  const [type, setType] = useState('percent')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Total facturable: suma de items NO cortesía
  const billableTotal = useMemo(() => {
    if (!order?.items) return 0
    return order.items.reduce((sum, it) => sum + (it.total || 0), 0)
  }, [order])

  const hasExistingDiscount = !!order?.discount

  // Pre-cargar datos del descuento existente al abrir
  useEffect(() => {
    if (isOpen && hasExistingDiscount) {
      setType(order.discount.type || 'percent')
      setValue(String(order.discount.value || ''))
      setReason(order.discount.reason || '')
    } else if (isOpen) {
      setType('percent')
      setValue('')
      setReason('')
    }
  }, [isOpen, hasExistingDiscount, order])

  const numericValue = parseFloat(value) || 0
  const previewDiscountAmount = useMemo(() => {
    if (numericValue <= 0) return 0
    if (type === 'percent') {
      const pct = Math.min(numericValue, 100)
      return Math.round(billableTotal * (pct / 100) * 100) / 100
    }
    return Math.min(numericValue, billableTotal)
  }, [numericValue, type, billableTotal])

  const previewTotal = Math.max(0, billableTotal - previewDiscountAmount)

  const isValid = numericValue > 0 && (type === 'percent' ? numericValue <= 100 : numericValue <= billableTotal)

  const handleApply = async () => {
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }
    if (!isValid) return

    setIsProcessing(true)
    try {
      const result = await applyOrderDiscount(getBusinessId(), order.id, {
        type,
        value: numericValue,
        reason: reason.trim(),
        appliedBy: { uid: user?.uid, name: user?.displayName || user?.email || 'Usuario' },
      })
      if (result.success) {
        toast.success(hasExistingDiscount ? 'Descuento actualizado' : 'Descuento aplicado')
        onSuccess?.()
        onClose()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error al aplicar descuento:', error)
      toast.error('Error al aplicar descuento')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRemove = async () => {
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }
    if (!window.confirm('¿Quitar el descuento aplicado?')) return

    setIsProcessing(true)
    try {
      const result = await removeOrderDiscount(getBusinessId(), order.id)
      if (result.success) {
        toast.success('Descuento eliminado')
        onSuccess?.()
        onClose()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error al quitar descuento:', error)
      toast.error('Error al quitar descuento')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!table || !order) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5" />
          <span>Aplicar descuento - Mesa {table.number}</span>
        </div>
      }
      size="md"
    >
      <div className="space-y-4">
        {/* Toggle Porcentaje / Monto */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de descuento</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('percent')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-colors ${
                type === 'percent'
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <Percent className="w-4 h-4" />
              Porcentaje
            </button>
            <button
              type="button"
              onClick={() => setType('amount')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-colors ${
                type === 'amount'
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Monto fijo
            </button>
          </div>
        </div>

        {/* Input de valor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {type === 'percent' ? 'Porcentaje (%)' : 'Monto (S/)'}
          </label>
          <Input
            type="number"
            step={type === 'percent' ? '1' : '0.01'}
            min="0"
            max={type === 'percent' ? '100' : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === 'percent' ? 'Ej: 10' : 'Ej: 5.00'}
            autoFocus
          />
          {type === 'percent' && numericValue > 100 && (
            <p className="text-xs text-red-600 mt-1">El porcentaje no puede superar 100%</p>
          )}
          {type === 'amount' && numericValue > billableTotal && billableTotal > 0 && (
            <p className="text-xs text-red-600 mt-1">El monto no puede superar el total (S/ {billableTotal.toFixed(2)})</p>
          )}
        </div>

        {/* Motivo opcional */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
          <Input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Cliente frecuente, promoción..."
            maxLength={120}
          />
        </div>

        {/* Preview */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Total facturable:</span>
            <span>S/ {billableTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>Descuento{type === 'percent' && numericValue > 0 ? ` (-${Math.min(numericValue, 100)}%)` : ''}:</span>
            <span>- S/ {previewDiscountAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold border-t pt-1.5">
            <span>Total a cobrar:</span>
            <span className="text-primary-600">S/ {previewTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-2 pt-2">
          {hasExistingDiscount && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRemove}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              Quitar
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={isProcessing} className="flex-1">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={!isValid || isProcessing}
            className="flex-1 flex items-center justify-center gap-2"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {hasExistingDiscount ? 'Actualizar' : 'Aplicar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
