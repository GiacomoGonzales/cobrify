import { useState, useEffect } from 'react'
import { Check, AlertCircle, Plus, Minus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'

/**
 * Modal para seleccionar modificadores de un producto en el pedido
 * Permite al usuario elegir opciones según las reglas definidas (obligatorio, máximo)
 * Soporta modo multi-opción (allowRepeat) donde una misma opción puede repetirse
 */
export default function ModifierSelectorModal({
  isOpen,
  onClose,
  product,
  onConfirm,
}) {
  // Para modo normal: { modifierId: [optionId, ...] }
  // Para modo allowRepeat: { modifierId: { optionId: count, ... } }
  const [selectedModifiers, setSelectedModifiers] = useState({})
  const [errors, setErrors] = useState({})

  // Inicializar estado cuando se abre el modal
  useEffect(() => {
    if (isOpen && product?.modifiers) {
      const initial = {}
      product.modifiers.forEach(modifier => {
        if (modifier.allowRepeat) {
          initial[modifier.id] = {} // { optionId: count }
        } else {
          initial[modifier.id] = [] // [optionId, ...]
        }
      })
      setSelectedModifiers(initial)
      setErrors({})
    }
  }, [isOpen, product])

  // Helper: obtener total de selecciones para un modificador
  const getSelectedCount = (modifier) => {
    const sel = selectedModifiers[modifier.id]
    if (!sel) return 0
    if (modifier.allowRepeat) {
      return Object.values(sel).reduce((sum, count) => sum + count, 0)
    }
    return sel.length
  }

  // Calcular precio total con ajustes de modificadores
  const calculateTotalPrice = () => {
    let total = product._selectedPrice ?? product.price ?? 0

    product.modifiers.forEach(modifier => {
      const sel = selectedModifiers[modifier.id]
      if (!sel) return

      if (modifier.allowRepeat) {
        // Modo repeat: sumar precio * cantidad por cada opción
        Object.entries(sel).forEach(([optionId, count]) => {
          const option = modifier.options.find(o => o.id === optionId)
          if (option && count > 0) {
            total += (option.priceAdjustment || 0) * count
          }
        })
      } else {
        // Modo normal: sumar precio de cada opción seleccionada
        sel.forEach(optionId => {
          const option = modifier.options.find(o => o.id === optionId)
          if (option) {
            total += option.priceAdjustment || 0
          }
        })
      }
    })

    return total
  }

  // Manejar selección de opción (modo normal - toggle)
  const handleOptionToggle = (modifierId, optionId) => {
    const modifier = product.modifiers.find(m => m.id === modifierId)
    if (!modifier) return

    setSelectedModifiers(prev => {
      const current = prev[modifierId] || []
      const isSelected = current.includes(optionId)

      let updated
      if (isSelected) {
        updated = current.filter(id => id !== optionId)
      } else {
        if (modifier.maxSelection === 1) {
          updated = [optionId]
        } else if (current.length < modifier.maxSelection) {
          updated = [...current, optionId]
        } else {
          return prev
        }
      }

      return { ...prev, [modifierId]: updated }
    })

    clearError(modifierId)
  }

  // Manejar incremento (modo multi-opción)
  const handleRepeatIncrement = (modifierId, optionId) => {
    const modifier = product.modifiers.find(m => m.id === modifierId)
    if (!modifier) return

    setSelectedModifiers(prev => {
      const current = prev[modifierId] || {}
      const totalCount = Object.values(current).reduce((sum, c) => sum + c, 0)

      if (totalCount >= modifier.maxSelection) return prev

      return {
        ...prev,
        [modifierId]: {
          ...current,
          [optionId]: (current[optionId] || 0) + 1
        }
      }
    })

    clearError(modifierId)
  }

  // Manejar decremento (modo multi-opción)
  const handleRepeatDecrement = (modifierId, optionId) => {
    setSelectedModifiers(prev => {
      const current = { ...(prev[modifierId] || {}) }
      if (!current[optionId] || current[optionId] <= 0) return prev

      current[optionId] = current[optionId] - 1
      if (current[optionId] === 0) delete current[optionId]

      return { ...prev, [modifierId]: current }
    })
  }

  const clearError = (modifierId) => {
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

    product.modifiers.forEach(modifier => {
      if (modifier.required) {
        const count = getSelectedCount(modifier)
        if (count === 0) {
          newErrors[modifier.id] = `Debes seleccionar al menos una opción de "${modifier.name}"`
        }
      }
    })

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Preparar datos de modificadores seleccionados
    const modifiersData = product.modifiers
      .map(modifier => {
        const sel = selectedModifiers[modifier.id]
        if (!sel) return null

        let options = []

        if (modifier.allowRepeat) {
          // Multi-opción: incluir quantity por cada opción
          Object.entries(sel).forEach(([optionId, count]) => {
            if (count > 0) {
              const option = modifier.options.find(o => o.id === optionId)
              if (option) {
                options.push({
                  optionId: option.id,
                  optionName: option.name,
                  priceAdjustment: option.priceAdjustment || 0,
                  quantity: count
                })
              }
            }
          })
        } else {
          // Modo normal
          options = sel.map(optionId => {
            const option = modifier.options.find(o => o.id === optionId)
            return {
              optionId: option.id,
              optionName: option.name,
              priceAdjustment: option.priceAdjustment || 0
            }
          })
        }

        if (options.length === 0) return null

        return {
          modifierId: modifier.id,
          modifierName: modifier.name,
          allowRepeat: modifier.allowRepeat || false,
          options
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
  const basePrice = product._selectedPrice ?? product.price ?? 0
  const priceAdjustment = totalPrice - basePrice

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
            <span className="text-gray-600">{formatCurrency(basePrice)}</span>
          </div>
        </div>

        {/* Lista de modificadores */}
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {product.modifiers.map((modifier) => {
            const selectedCount = getSelectedCount(modifier)
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
                        {modifier.allowRepeat && ' (puedes repetir)'}
                        {selectedCount > 0 && (
                          <span className="ml-1 text-primary-600 font-medium">
                            ({selectedCount} seleccionada{selectedCount > 1 ? 's' : ''})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

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
                    if (modifier.allowRepeat) {
                      // Modo multi-opción: botones +/-
                      const count = (selectedModifiers[modifier.id] || {})[option.id] || 0
                      const totalCount = getSelectedCount(modifier)
                      const canIncrement = totalCount < modifier.maxSelection

                      return (
                        <div
                          key={option.id}
                          className={`
                            flex items-center justify-between p-3 rounded-lg border-2 transition-all
                            ${count > 0 ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}
                          `}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-sm ${count > 0 ? 'text-primary-900 font-medium' : 'text-gray-700'}`}>
                              {option.name}
                            </span>
                            {option.priceAdjustment > 0 && (
                              <span className="text-xs text-gray-500">
                                +{formatCurrency(option.priceAdjustment)} c/u
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {count > 0 && option.priceAdjustment > 0 && (
                              <span className="text-xs text-primary-600 font-medium mr-1">
                                +{formatCurrency(option.priceAdjustment * count)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRepeatDecrement(modifier.id, option.id)}
                              disabled={count === 0}
                              className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                                count > 0
                                  ? 'border-primary-500 text-primary-600 hover:bg-primary-100'
                                  : 'border-gray-300 text-gray-300 cursor-not-allowed'
                              }`}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className={`w-6 text-center text-sm font-bold ${count > 0 ? 'text-primary-700' : 'text-gray-400'}`}>
                              {count}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRepeatIncrement(modifier.id, option.id)}
                              disabled={!canIncrement}
                              className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                                canIncrement
                                  ? 'border-primary-500 text-primary-600 hover:bg-primary-100'
                                  : 'border-gray-300 text-gray-300 cursor-not-allowed'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    } else {
                      // Modo normal: toggle on/off
                      const isSelected = (selectedModifiers[modifier.id] || []).includes(option.id)
                      const isDisabled = !isSelected && selectedCount >= modifier.maxSelection

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
                            <span className={`text-sm ${isSelected ? 'text-primary-900 font-medium' : 'text-gray-700'}`}>
                              {option.name}
                            </span>
                          </div>

                          {option.priceAdjustment > 0 && (
                            <span className="text-sm font-medium text-gray-700">
                              +{formatCurrency(option.priceAdjustment)}
                            </span>
                          )}
                        </button>
                      )
                    }
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
              <span>{formatCurrency(basePrice)}</span>
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
