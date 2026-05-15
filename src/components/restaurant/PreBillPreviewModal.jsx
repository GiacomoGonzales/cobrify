import { useState, useEffect, useMemo } from 'react'
import { Printer, Loader2, Trash2, Percent, DollarSign, Tag } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { applyOrderDiscount, removeOrderDiscount } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'

export default function PreBillPreviewModal({
  isOpen,
  onClose,
  table,
  order,
  onConfirmPrint,
  printLabel = 'Imprimir',
  title = 'Vista previa precuenta',
}) {
  const { getBusinessId, user } = useAppContext()
  const demoContext = useDemoRestaurant()
  const toast = useToast()

  const [discountType, setDiscountType] = useState('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const items = useMemo(() => order?.items || [], [order])

  // Total facturable: suma de items.total (cortesías ya están en 0)
  const billableTotal = useMemo(
    () => items.reduce((sum, it) => sum + (it.total || 0), 0),
    [items]
  )

  const hasExistingDiscount = !!order?.discount

  useEffect(() => {
    if (!isOpen) return
    if (hasExistingDiscount) {
      setDiscountType(order.discount.type || 'percent')
      setDiscountValue(String(order.discount.value ?? ''))
      setDiscountReason(order.discount.reason || '')
    } else {
      setDiscountType('percent')
      setDiscountValue('')
      setDiscountReason('')
    }
  }, [isOpen, hasExistingDiscount, order])

  const numericValue = parseFloat(discountValue) || 0

  const previewDiscountAmount = useMemo(() => {
    if (numericValue <= 0) return 0
    if (discountType === 'percent') {
      const pct = Math.min(numericValue, 100)
      return Math.round(billableTotal * (pct / 100) * 100) / 100
    }
    return Math.min(numericValue, billableTotal)
  }, [numericValue, discountType, billableTotal])

  const previewTotal = Math.max(0, billableTotal - previewDiscountAmount)

  const isDiscountValid =
    numericValue > 0 &&
    (discountType === 'percent'
      ? numericValue <= 100
      : numericValue <= billableTotal)

  // Detecta si el descuento mostrado en el modal difiere del guardado en la orden
  const discountChanged = useMemo(() => {
    const trimmedReason = discountReason.trim()
    if (!hasExistingDiscount) return numericValue > 0
    if (numericValue === 0) return true // se quitó
    const orig = order.discount
    return (
      orig.type !== discountType ||
      (orig.value || 0) !== numericValue ||
      (orig.reason || '') !== trimmedReason
    )
  }, [hasExistingDiscount, numericValue, discountType, discountReason, order])

  const handleClearDiscount = () => {
    setDiscountValue('')
    setDiscountReason('')
  }

  const handlePrint = async () => {
    if (numericValue > 0 && !isDiscountValid) {
      toast.error('Valor de descuento inválido')
      return
    }

    if (discountChanged && demoContext) {
      toast.info(
        'No se puede aplicar descuento en modo demo. Regístrate para usar todas las funcionalidades.'
      )
      return
    }

    setIsProcessing(true)
    try {
      // Persistir cambio de descuento si corresponde
      if (discountChanged) {
        if (numericValue === 0 && hasExistingDiscount) {
          const result = await removeOrderDiscount(getBusinessId(), order.id)
          if (!result.success) {
            toast.error('Error al quitar descuento: ' + result.error)
            return
          }
        } else if (numericValue > 0) {
          const result = await applyOrderDiscount(getBusinessId(), order.id, {
            type: discountType,
            value: numericValue,
            reason: discountReason.trim(),
            appliedBy: {
              uid: user?.uid,
              name: user?.displayName || user?.email || 'Usuario',
            },
          })
          if (!result.success) {
            toast.error('Error al aplicar descuento: ' + result.error)
            return
          }
        }
      }

      // Disparar impresión (el padre se encarga de refrescar la orden y llamar al print)
      if (onConfirmPrint) {
        await onConfirmPrint()
      }
    } catch (err) {
      console.error('Error al imprimir precuenta:', err)
      toast.error('Error al imprimir precuenta')
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
          <Printer className="w-5 h-5" />
          <span>
            {title} - Mesa {table.number}
          </span>
        </div>
      }
      size="md"
    >
      <div className="space-y-4">
        {/* Lista de ítems */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Ítems</span>
            <span className="text-xs text-gray-500">
              {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
            </span>
          </div>
          <div className="border rounded-lg divide-y max-h-60 overflow-y-auto bg-white">
            {items.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                Sin ítems
              </div>
            ) : (
              items.map((item, idx) => {
                const isCourtesy = !!item.isCourtesy
                const displayTotal =
                  isCourtesy && item.originalTotal !== undefined
                    ? item.originalTotal
                    : item.total
                return (
                  <div
                    key={idx}
                    className="p-2.5 flex items-start justify-between gap-3 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 shrink-0 tabular-nums">
                          {item.quantity}x
                        </span>
                        <span
                          className={`truncate ${
                            isCourtesy
                              ? 'text-gray-400 line-through'
                              : 'text-gray-900'
                          }`}
                        >
                          {item.name}
                        </span>
                        {isCourtesy && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 shrink-0">
                            CORTESÍA
                          </span>
                        )}
                      </div>
                      {isCourtesy && item.courtesyReason && (
                        <div className="text-xs text-amber-600 ml-7 mt-0.5 italic truncate">
                          {item.courtesyReason}
                        </div>
                      )}
                    </div>
                    <div
                      className={`text-right shrink-0 tabular-nums ${
                        isCourtesy
                          ? 'text-gray-400 line-through'
                          : 'text-gray-900 font-medium'
                      }`}
                    >
                      S/ {(displayTotal || 0).toFixed(2)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Panel de descuento */}
        <div className="border rounded-lg p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">
                Descuento al comensal
              </span>
            </div>
            {hasExistingDiscount && numericValue > 0 && (
              <button
                type="button"
                onClick={handleClearDiscount}
                className="text-xs text-red-600 hover:underline flex items-center gap-1"
                disabled={isProcessing}
              >
                <Trash2 className="w-3 h-3" /> Quitar
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              type="button"
              onClick={() => setDiscountType('percent')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 transition-colors text-sm ${
                discountType === 'percent'
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                  : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
              }`}
              disabled={isProcessing}
            >
              <Percent className="w-3.5 h-3.5" />
              Porcentaje
            </button>
            <button
              type="button"
              onClick={() => setDiscountType('amount')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 transition-colors text-sm ${
                discountType === 'amount'
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                  : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
              }`}
              disabled={isProcessing}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Monto fijo
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step={discountType === 'percent' ? '1' : '0.01'}
              min="0"
              max={discountType === 'percent' ? '100' : undefined}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percent' ? 'Ej: 10' : 'Ej: 5.00'}
              disabled={isProcessing}
            />
            <Input
              type="text"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="Motivo (opcional)"
              maxLength={120}
              disabled={isProcessing}
            />
          </div>
          {discountType === 'percent' && numericValue > 100 && (
            <p className="text-xs text-red-600 mt-1.5">
              No puede superar 100%
            </p>
          )}
          {discountType === 'amount' &&
            numericValue > billableTotal &&
            billableTotal > 0 && (
              <p className="text-xs text-red-600 mt-1.5">
                No puede superar S/ {billableTotal.toFixed(2)}
              </p>
            )}
        </div>

        {/* Resumen */}
        <div className="bg-white border rounded-lg p-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal:</span>
            <span className="tabular-nums">
              S/ {billableTotal.toFixed(2)}
            </span>
          </div>
          {previewDiscountAmount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>
                Descuento
                {discountType === 'percent' && numericValue > 0
                  ? ` (-${Math.min(numericValue, 100)}%)`
                  : ''}
                :
              </span>
              <span className="tabular-nums">
                - S/ {previewDiscountAmount.toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold border-t pt-1.5">
            <span>Total a cobrar:</span>
            <span className="text-primary-600 tabular-nums">
              S/ {previewTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handlePrint}
            disabled={
              isProcessing || (numericValue > 0 && !isDiscountValid)
            }
            className="flex-1 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            {printLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
