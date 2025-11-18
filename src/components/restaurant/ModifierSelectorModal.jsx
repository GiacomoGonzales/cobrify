import { useState, useEffect } from 'react'
import { Check, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'

/**
 * Modal para seleccionar modificadores de un producto en el pedido
 * Permite al usuario elegir opciones según las reglas definidas (obligatorio, máximo)
 */
export default function ModifierSelectorModal({
  isOpen,
  onClose,
  product,
  onConfirm
}) {
  const [selectedModifiers, setSelectedModifiers] = useState({})
  const [errors, setErrors] = useState({})

  // Inicializar estado cuando se abre el modal
  useEffect(() => {
    if (isOpen && product?.modifiers) {
      const initial = {}
      product.modifiers.forEach(modifier => {
        initial[modifier.id] = []
      })
      setSelectedModifiers(initial)
      setErrors({})
    }
  }, [isOpen, product])

  // Calcular precio total con ajustes de modificadores
  const calculateTotalPrice = () => {
    let total = product.price || 0

    Object.keys(selectedModifiers).forEach(modifierId => {
      const modifier = product.modifiers.find(m => m.id === modifierId)
      if (modifier) {
        selectedModifiers[modifierId].forEach(optionId => {
          const option = modifier.options.find(o => o.id === optionId)
          if (option) {
            total += option.priceAdjustment || 0
          }
        })
      }
    })

    return total
  }

  // Manejar selección de opción
  const handleOptionToggle = (modifierId, optionId) => {
    const modifier = product.modifiers.find(m => m.id === modifierId)
    if (!modifier) return

    setSelectedModifiers(prev => {
      const current = prev[modifierId] || []
      const isSelected = current.includes(optionId)

      let updated
      if (isSelected) {
        // Deseleccionar
        updated = current.filter(id => id !== optionId)
      } else {
        // Seleccionar
        if (modifier.maxSelection === 1) {
          // Solo una opción permitida
          updated = [optionId]
        } else if (current.length < modifier.maxSelection) {
          // Agregar si no se alcanzó el máximo
          updated = [...current, optionId]
        } else {
          // Ya alcanzó el máximo
          return prev
        }
      }

      return {
        ...prev,
        [modifierId]: updated
      }
    })

    // Limpiar error si existe
    if (errors[modifierId]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[modifierId]
        return newErrors
      })
    }
  }

  // Validar antes de confirmar
  const handleConfirm = () => {
    const newErrors = {}

    // Validar modificadores obligatorios
    product.modifiers.forEach(modifier => {
      if (modifier.required) {
        const selected = selectedModifiers[modifier.id] || []
        if (selected.length === 0) {
          newErrors[modifier.id] = `Debes seleccionar al menos una opción de "${modifier.name}"`
        }
      }
    })

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Preparar datos de modificadores seleccionados con detalles
    const modifiersData = product.modifiers
      .map(modifier => {
        const selectedOptions = selectedModifiers[modifier.id] || []
        if (selectedOptions.length === 0) return null

        return {
          modifierId: modifier.id,
          modifierName: modifier.name,
          options: selectedOptions.map(optionId => {
            const option = modifier.options.find(o => o.id === optionId)
            return {
              optionId: option.id,
              optionName: option.name,
              priceAdjustment: option.priceAdjustment || 0
            }
          })
        }
      })
      .filter(Boolean)

    onConfirm({
      selectedModifiers: modifiersData,
      totalPrice: calculateTotalPrice()
    })
  }

  if (!product || !product.modifiers || product.modifiers.length === 0) {
    return null
  }

  const totalPrice = calculateTotalPrice()
  const priceAdjustment = totalPrice - (product.price || 0)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Personaliza: ${product.name}`}
      size="md"
    >
      <div className="space-y-4">
        {/* Info del producto base */}
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-900">{product.name}</span>
            <span className="text-gray-600">{formatCurrency(product.price)}</span>
          </div>
        </div>

        {/* Lista de modificadores */}
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {product.modifiers.map((modifier, modIndex) => {
            const selectedCount = (selectedModifiers[modifier.id] || []).length
            const hasError = errors[modifier.id]

            return (
              <div
                key={modifier.id}
                className={`border rounded-lg p-4 ${
                  hasError ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              >
                {/* Header del modificador */}
                <div className="mb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">
                        {modifier.name}
                        {modifier.required && (
                          <span className="text-red-600 ml-1">*</span>
                        )}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {modifier.required ? 'Obligatorio' : 'Opcional'} •{' '}
                        {modifier.maxSelection === 1
                          ? 'Selecciona 1 opción'
                          : `Selecciona hasta ${modifier.maxSelection} opciones`}
                        {selectedCount > 0 && (
                          <span className="ml-1 text-primary-600 font-medium">
                            ({selectedCount} seleccionada{selectedCount > 1 ? 's' : ''})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Error message */}
                  {hasError && (
                    <div className="flex items-start gap-2 mt-2 text-red-600">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <p className="text-xs">{hasError}</p>
                    </div>
                  )}
                </div>

                {/* Opciones */}
                <div className="space-y-2">
                  {modifier.options.map((option) => {
                    const isSelected = (selectedModifiers[modifier.id] || []).includes(option.id)
                    const isDisabled =
                      !isSelected &&
                      selectedCount >= modifier.maxSelection

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleOptionToggle(modifier.id, option.id)}
                        disabled={isDisabled}
                        className={`
                          w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all
                          ${
                            isSelected
                              ? 'border-primary-500 bg-primary-50'
                              : isDisabled
                              ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                              : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50 cursor-pointer'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3">
                          {/* Checkbox/Radio visual */}
                          <div
                            className={`
                              w-5 h-5 rounded flex items-center justify-center border-2
                              ${
                                isSelected
                                  ? 'border-primary-500 bg-primary-500'
                                  : 'border-gray-300 bg-white'
                              }
                            `}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>

                          {/* Nombre de la opción */}
                          <span
                            className={`text-sm ${
                              isSelected ? 'text-primary-900 font-medium' : 'text-gray-700'
                            }`}
                          >
                            {option.name}
                          </span>
                        </div>

                        {/* Precio adicional */}
                        {option.priceAdjustment > 0 && (
                          <span className="text-sm font-medium text-gray-700">
                            +{formatCurrency(option.priceAdjustment)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Resumen de precio */}
        <div className="border-t pt-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Precio base:</span>
              <span>{formatCurrency(product.price)}</span>
            </div>

            {priceAdjustment > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Modificadores:</span>
                <span>+{formatCurrency(priceAdjustment)}</span>
              </div>
            )}

            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t">
              <span>Total:</span>
              <span className="text-primary-600">{formatCurrency(totalPrice)}</span>
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            className="flex-1"
          >
            Agregar al Pedido
          </Button>
        </div>
      </div>
    </Modal>
  )
}
