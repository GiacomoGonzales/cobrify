import { useState, useEffect } from 'react'
import { X, Plus, Minus, StickyNote } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'

export default function ProductCustomizationModal({
  isOpen,
  onClose,
  product,
  onConfirm,
  initialQuantity = 1,
  initialNotes = '',
  initialAdditions = []
}) {
  const [quantity, setQuantity] = useState(initialQuantity)
  const [notes, setNotes] = useState(initialNotes)
  const [selectedAdditions, setSelectedAdditions] = useState(initialAdditions)

  // Resetear estado cuando cambia el producto
  useEffect(() => {
    if (product) {
      setQuantity(initialQuantity)
      setNotes(initialNotes)
      setSelectedAdditions(initialAdditions)
    }
  }, [product, initialQuantity, initialNotes, initialAdditions])

  if (!product) return null

  const handleAdditionToggle = (addition) => {
    const exists = selectedAdditions.find(a => a.name === addition.name)
    if (exists) {
      setSelectedAdditions(selectedAdditions.filter(a => a.name !== addition.name))
    } else {
      setSelectedAdditions([...selectedAdditions, { ...addition, quantity: 1 }])
    }
  }

  const handleAdditionQuantityChange = (additionName, change) => {
    setSelectedAdditions(selectedAdditions.map(a => {
      if (a.name === additionName) {
        const newQuantity = Math.max(1, a.quantity + change)
        return { ...a, quantity: newQuantity }
      }
      return a
    }))
  }

  const calculateTotal = () => {
    const basePrice = product.price * quantity
    const additionsPrice = selectedAdditions.reduce((sum, add) => {
      return sum + (add.price * add.quantity * quantity)
    }, 0)
    return basePrice + additionsPrice
  }

  const handleConfirm = () => {
    onConfirm({
      quantity,
      notes: notes.trim(),
      additions: selectedAdditions
    })
    onClose()
  }

  // Adicionales comunes de ejemplo (esto debería venir de la configuración del producto)
  const commonAdditions = product.additions || [
    { name: 'Extra Queso', price: 2.00 },
    { name: 'Extra Tocino', price: 3.00 },
    { name: 'Extra Jamón', price: 2.50 },
    { name: 'Doble Carne', price: 5.00 },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <StickyNote className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Personalizar Producto</h2>
            <p className="text-sm text-gray-600 mt-1">{product.name}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
        {/* Cantidad */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cantidad
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <Minus className="w-5 h-5 text-gray-600" />
            </button>
            <span className="text-2xl font-bold text-gray-900 min-w-[3rem] text-center">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Adicionales */}
        {commonAdditions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Adicionales
            </label>
            <div className="space-y-2">
              {commonAdditions.map((addition, index) => {
                const isSelected = selectedAdditions.find(a => a.name === addition.name)
                return (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    onClick={() => handleAdditionToggle(addition)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{addition.name}</p>
                          <p className="text-sm text-gray-500">
                            +{formatCurrency(addition.price)} c/u
                          </p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleAdditionQuantityChange(addition.name, -1)}
                            className="p-1 rounded bg-white hover:bg-gray-100 transition-colors"
                          >
                            <Minus className="w-4 h-4 text-gray-600" />
                          </button>
                          <span className="font-medium text-gray-900 min-w-[2rem] text-center">
                            {isSelected.quantity}
                          </span>
                          <button
                            onClick={() => handleAdditionQuantityChange(addition.name, 1)}
                            className="p-1 rounded bg-white hover:bg-gray-100 transition-colors"
                          >
                            <Plus className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Instrucciones especiales */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Instrucciones Especiales
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Sin lechuga, extra mayonesa, punto medio..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            rows={3}
          />
          <p className="text-xs text-gray-500 mt-1">
            Estas notas aparecerán en la comanda de cocina
          </p>
        </div>

        {/* Resumen de precio */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Producto ({quantity}x)</span>
            <span className="font-medium">{formatCurrency(product.price * quantity)}</span>
          </div>
          {selectedAdditions.length > 0 && (
            <>
              {selectedAdditions.map((add, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {add.name} ({add.quantity}x por {quantity} producto{quantity > 1 ? 's' : ''})
                  </span>
                  <span className="font-medium">
                    {formatCurrency(add.price * add.quantity * quantity)}
                  </span>
                </div>
              ))}
            </>
          )}
          <div className="pt-2 border-t border-gray-300 flex justify-between">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold text-lg text-primary-600">
              {formatCurrency(calculateTotal())}
            </span>
          </div>
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
            className="flex-1"
          >
            Agregar al Carrito
          </Button>
        </div>
      </div>
    </Modal>
  )
}
