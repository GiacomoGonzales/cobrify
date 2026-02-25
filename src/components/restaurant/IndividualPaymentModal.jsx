import { useState, useEffect, useMemo } from 'react'
import { Loader2, Check, UserMinus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

export default function IndividualPaymentModal({
  isOpen,
  onClose,
  table,
  order,
  onConfirm,
}) {
  const [selectedItems, setSelectedItems] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedItems([])
      setIsLoading(false)
    }
  }, [isOpen])

  const items = order?.items || []

  // Expandir items con cantidad > 1 en unidades individuales (mismo patrón que SplitTableModal)
  const expandedItems = useMemo(() => {
    const result = []
    items.forEach((item, originalIndex) => {
      const qty = item.quantity || 1
      if (qty <= 1) {
        result.push({ ...item, _origIdx: originalIndex })
      } else {
        const unitPrice = Math.round((item.total || 0) / qty * 100) / 100
        for (let i = 0; i < qty; i++) {
          const isLast = i === qty - 1
          result.push({
            ...item,
            quantity: 1,
            total: isLast ? (item.total || 0) - unitPrice * (qty - 1) : unitPrice,
            _origIdx: originalIndex,
          })
        }
      }
    })
    return result
  }, [items])

  if (!table || !order) return null

  const toggleItem = (index) => {
    setSelectedItems(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  const selectAll = () => {
    if (selectedItems.length === expandedItems.length) {
      setSelectedItems([])
    } else {
      setSelectedItems(expandedItems.map((_, i) => i))
    }
  }

  const selectedTotal = selectedItems.reduce((sum, idx) => {
    const item = expandedItems[idx]
    return sum + (item?.total || 0)
  }, 0)

  const remainingTotal = expandedItems.reduce((sum, item, idx) => {
    if (selectedItems.includes(idx)) return sum
    return sum + (item?.total || 0)
  }, 0)

  const canConfirm = selectedItems.length > 0 &&
    selectedItems.length < expandedItems.length

  const handleConfirm = async () => {
    if (!canConfirm) return

    setIsLoading(true)
    try {
      // Convertir selección de items expandidos a items con cantidades correctas
      const chargeCountByOriginal = {}
      selectedItems.forEach(expandedIdx => {
        const origIdx = expandedItems[expandedIdx]._origIdx
        chargeCountByOriginal[origIdx] = (chargeCountByOriginal[origIdx] || 0) + 1
      })

      const itemsToCharge = []
      const itemsRemaining = []
      items.forEach((item, origIdx) => {
        const qty = item.quantity || 1
        const chargeCount = chargeCountByOriginal[origIdx] || 0
        const keepCount = qty - chargeCount
        const unitPrice = (item.total || 0) / qty

        if (chargeCount > 0) {
          const { _origIdx, ...cleanItem } = item
          itemsToCharge.push({
            ...cleanItem,
            quantity: chargeCount,
            total: Math.round(unitPrice * chargeCount * 100) / 100,
          })
        }
        if (keepCount > 0) {
          const { _origIdx, ...cleanItem } = item
          itemsRemaining.push({
            ...cleanItem,
            quantity: keepCount,
            total: Math.round(unitPrice * keepCount * 100) / 100,
          })
        }
      })

      await onConfirm(itemsToCharge, itemsRemaining)
    } catch (error) {
      console.error('Error en cobro individual:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <UserMinus className="w-6 h-6 text-orange-600" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">Cobro Individual - Mesa {table.number}</h2>
            <p className="text-sm text-gray-600 mt-1">
              Selecciona los items a cobrar. La mesa seguirá abierta con los items restantes.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
        {/* Item selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Items de la orden
            </label>
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              {selectedItems.length === expandedItems.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
            {expandedItems.map((item, idx) => {
              const isSelected = selectedItems.includes(idx)
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleItem(idx)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-orange-500 bg-orange-500'
                          : 'border-gray-300'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">{item.name}</span>
                      </div>
                    </div>
                    <span className="font-semibold text-gray-900">
                      S/ {(item.total || 0).toFixed(2)}
                    </span>
                  </div>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="ml-8 mt-1 text-xs text-gray-500">
                      {item.modifiers.map(m => m.modifierName + ': ' + m.options.map(o => o.optionName).join(', ')).join(' | ')}
                    </div>
                  )}
                  {item.notes && (
                    <div className="ml-8 mt-1 text-xs text-gray-500 italic">
                      Nota: {item.notes}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {selectedItems.length > 0 && selectedItems.length === expandedItems.length && (
            <p className="text-sm text-amber-600 mt-2">
              No puedes cobrar todos los items. Usa "Crear Comprobante" para cerrar la cuenta completa.
            </p>
          )}
        </div>

        {/* Summary */}
        {selectedItems.length > 0 && selectedItems.length < expandedItems.length && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Queda en Mesa {table.number}</p>
              <p className="text-sm font-bold text-gray-900">
                {expandedItems.length - selectedItems.length} items - S/ {remainingTotal.toFixed(2)}
              </p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3">
              <p className="text-xs text-orange-600 mb-1">Se cobra ahora</p>
              <p className="text-sm font-bold text-orange-900">
                {selectedItems.length} items - S/ {selectedTotal.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
            className="flex-1 bg-orange-600 hover:bg-orange-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <UserMinus className="w-4 h-4 mr-2" />
                Cobrar Selección
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
