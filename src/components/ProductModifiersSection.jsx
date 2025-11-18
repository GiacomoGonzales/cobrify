import { useState } from 'react'
import { Plus, Trash2, X, Edit2, Check, ChevronDown, ChevronRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

/**
 * Componente para gestionar modificadores de productos en modo restaurante
 * Los modificadores permiten que los productos tengan opciones personalizables
 * como: término de la carne, ingredientes adicionales, tipo de pan, etc.
 */
export default function ProductModifiersSection({ modifiers, onChange }) {
  const [editingModifierId, setEditingModifierId] = useState(null)
  const [expandedModifierId, setExpandedModifierId] = useState(null)

  // Agregar nuevo modificador
  const handleAddModifier = () => {
    const newModifier = {
      id: `mod-${Date.now()}`,
      name: '',
      required: false,
      maxSelection: 1,
      options: []
    }
    onChange([...modifiers, newModifier])
    setEditingModifierId(newModifier.id)
    setExpandedModifierId(newModifier.id)
  }

  // Actualizar modificador
  const handleUpdateModifier = (modifierId, field, value) => {
    const updated = modifiers.map(mod =>
      mod.id === modifierId ? { ...mod, [field]: value } : mod
    )
    onChange(updated)
  }

  // Eliminar modificador
  const handleDeleteModifier = (modifierId) => {
    onChange(modifiers.filter(mod => mod.id !== modifierId))
  }

  // Agregar opción a un modificador
  const handleAddOption = (modifierId) => {
    const newOption = {
      id: `opt-${Date.now()}`,
      name: '',
      priceAdjustment: 0
    }
    const updated = modifiers.map(mod =>
      mod.id === modifierId
        ? { ...mod, options: [...mod.options, newOption] }
        : mod
    )
    onChange(updated)
  }

  // Actualizar opción
  const handleUpdateOption = (modifierId, optionId, field, value) => {
    const updated = modifiers.map(mod =>
      mod.id === modifierId
        ? {
            ...mod,
            options: mod.options.map(opt =>
              opt.id === optionId ? { ...opt, [field]: value } : opt
            )
          }
        : mod
    )
    onChange(updated)
  }

  // Eliminar opción
  const handleDeleteOption = (modifierId, optionId) => {
    const updated = modifiers.map(mod =>
      mod.id === modifierId
        ? { ...mod, options: mod.options.filter(opt => opt.id !== optionId) }
        : mod
    )
    onChange(updated)
  }

  // Toggle expandir/colapsar
  const toggleExpand = (modifierId) => {
    setExpandedModifierId(expandedModifierId === modifierId ? null : modifierId)
  }

  return (
    <div className="border-t border-gray-200 pt-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Modificadores (Modo Restaurante)
        </h3>
        <p className="text-xs text-gray-600">
          Agrega opciones personalizables como término de la carne, ingredientes adicionales, tipo de pan, etc.
        </p>
      </div>

      {modifiers.length === 0 ? (
        <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-sm text-gray-600 mb-3">
            Este producto no tiene modificadores. Los modificadores permiten personalizar el pedido.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddModifier}
          >
            <Plus className="w-4 h-4 mr-2" />
            Agregar Modificador
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {modifiers.map((modifier, modIndex) => {
            const isExpanded = expandedModifierId === modifier.id
            const isEditing = editingModifierId === modifier.id

            return (
              <div
                key={modifier.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* Header del modificador */}
                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleExpand(modifier.id)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    {isEditing ? (
                      <input
                        type="text"
                        value={modifier.name}
                        onChange={(e) => handleUpdateModifier(modifier.id, 'name', e.target.value)}
                        placeholder="Ej: Término de la Carne"
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        autoFocus
                      />
                    ) : (
                      <div className="flex-1">
                        <span className="font-medium text-gray-900 text-sm">
                          {modifier.name || `Modificador ${modIndex + 1}`}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs ${modifier.required ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {modifier.required ? 'Obligatorio' : 'Opcional'}
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">
                            Máx: {modifier.maxSelection} opción{modifier.maxSelection > 1 ? 'es' : ''}
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">
                            {modifier.options.length} opción{modifier.options.length !== 1 ? 'es' : ''}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingModifierId(isEditing ? null : modifier.id)}
                      className="text-gray-500 hover:text-primary-600"
                      title={isEditing ? 'Guardar' : 'Editar'}
                    >
                      {isEditing ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Edit2 className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteModifier(modifier.id)}
                      className="text-gray-500 hover:text-red-600"
                      title="Eliminar modificador"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Contenido expandible */}
                {isExpanded && (
                  <div className="p-4 space-y-4">
                    {/* Configuración del modificador */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={modifier.required}
                            onChange={(e) => handleUpdateModifier(modifier.id, 'required', e.target.checked)}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">¿Es obligatorio?</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1 ml-6">
                          El cliente debe seleccionar al menos una opción
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Máximo de selecciones
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={modifier.maxSelection}
                          onChange={(e) => handleUpdateModifier(modifier.id, 'maxSelection', parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Cantidad máxima de opciones que puede elegir
                        </p>
                      </div>
                    </div>

                    {/* Opciones del modificador */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-900">
                          Opciones
                        </h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddOption(modifier.id)}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Agregar Opción
                        </Button>
                      </div>

                      {modifier.options.length === 0 ? (
                        <div className="text-center py-4 bg-gray-50 rounded border border-dashed border-gray-300">
                          <p className="text-xs text-gray-500">
                            No hay opciones. Agrega al menos una opción para este modificador.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {modifier.options.map((option) => (
                            <div
                              key={option.id}
                              className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200"
                            >
                              <input
                                type="text"
                                value={option.name}
                                onChange={(e) => handleUpdateOption(modifier.id, option.id, 'name', e.target.value)}
                                placeholder="Ej: Término Medio"
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-500">+S/</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={option.priceAdjustment}
                                  onChange={(e) => handleUpdateOption(modifier.id, option.id, 'priceAdjustment', parseFloat(e.target.value) || 0)}
                                  placeholder="0.00"
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteOption(modifier.id, option.id)}
                                className="text-gray-400 hover:text-red-600"
                                title="Eliminar opción"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddModifier}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Agregar Otro Modificador
          </Button>
        </div>
      )}
    </div>
  )
}
