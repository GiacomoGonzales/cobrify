import { useState, useEffect } from 'react'
import { Loader2, ArrowRight, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'

export default function SplitTableModal({
  isOpen,
  onClose,
  table,
  order,
  tables = [],
  onConfirm,
}) {
  const [selectedItems, setSelectedItems] = useState([])
  const [selectedDestTable, setSelectedDestTable] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedItems([])
      setSelectedDestTable('')
      setIsLoading(false)
    }
  }, [isOpen])

  if (!table || !order) return null

  const items = order.items || []

  // Tables that can receive items: available or occupied (except the source table)
  const destinationTables = tables.filter(
    t => t.id !== table.id && (t.status === 'available' || t.status === 'occupied')
  )

  const toggleItem = (index) => {
    setSelectedItems(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  const selectAll = () => {
    if (selectedItems.length === items.length) {
      setSelectedItems([])
    } else {
      setSelectedItems(items.map((_, i) => i))
    }
  }

  const selectedTotal = selectedItems.reduce((sum, idx) => {
    const item = items[idx]
    return sum + (item?.total || item?.price * item?.quantity || 0)
  }, 0)

  const remainingTotal = items.reduce((sum, item, idx) => {
    if (selectedItems.includes(idx)) return sum
    return sum + (item?.total || item?.price * item?.quantity || 0)
  }, 0)

  const canConfirm = selectedItems.length > 0 &&
    selectedItems.length < items.length &&
    selectedDestTable

  const handleConfirm = async () => {
    if (!canConfirm) return

    setIsLoading(true)
    try {
      const destTable = destinationTables.find(t => t.id === selectedDestTable)
      await onConfirm(table.id, selectedDestTable, selectedItems, destTable)
    } catch (error) {
      console.error('Error al dividir mesa:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Dividir Mesa {table.number}</h2>
        <p className="text-sm text-gray-600 mt-1">
          Selecciona los items que quieres mover a otra mesa
        </p>
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
              {selectedItems.length === items.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3">
            {items.map((item, idx) => {
              const isSelected = selectedItems.includes(idx)
              return (
                <button
                  key={item.itemId || idx}
                  type="button"
                  onClick={() => toggleItem(idx)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-gray-300'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">{item.name}</span>
                        <span className="text-gray-500 text-sm ml-2">x{item.quantity}</span>
                      </div>
                    </div>
                    <span className="font-semibold text-gray-900">
                      S/ {(item.total || item.price * item.quantity || 0).toFixed(2)}
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

          {selectedItems.length > 0 && selectedItems.length === items.length && (
            <p className="text-sm text-amber-600 mt-2">
              No puedes mover todos los items. Usa "Cambiar Mesa" para mover la orden completa.
            </p>
          )}
        </div>

        {/* Summary */}
        {selectedItems.length > 0 && selectedItems.length < items.length && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Se queda en Mesa {table.number}</p>
              <p className="text-sm font-bold text-gray-900">
                {items.length - selectedItems.length} items - S/ {remainingTotal.toFixed(2)}
              </p>
            </div>
            <div className="bg-primary-50 rounded-lg p-3">
              <p className="text-xs text-primary-600 mb-1">Se mueve a otra mesa</p>
              <p className="text-sm font-bold text-primary-900">
                {selectedItems.length} items - S/ {selectedTotal.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Destination table */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mesa destino
          </label>
          <Select
            value={selectedDestTable}
            onChange={(e) => setSelectedDestTable(e.target.value)}
          >
            <option value="">-- Seleccionar mesa --</option>
            {destinationTables.map((t) => (
              <option key={t.id} value={t.id}>
                Mesa {t.number} - {t.zone}
                {t.status === 'occupied' ? ` (Ocupada - ${t.waiter})` : ' (Disponible)'}
              </option>
            ))}
          </Select>
          {destinationTables.length === 0 && (
            <p className="text-sm text-amber-600 mt-2">
              No hay mesas disponibles u ocupadas para dividir.
            </p>
          )}
          {selectedDestTable && (() => {
            const dest = destinationTables.find(t => t.id === selectedDestTable)
            if (dest?.status === 'occupied') {
              return (
                <p className="text-sm text-blue-600 mt-2">
                  Los items se agregarán a la orden existente de Mesa {dest.number}.
                </p>
              )
            }
            return (
              <p className="text-sm text-green-600 mt-2">
                Se creará una nueva orden en Mesa {dest?.number} con el mismo mozo.
              </p>
            )
          })()}
        </div>
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
            className="flex-1"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Dividiendo...
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4 mr-2" />
                Dividir Mesa
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
