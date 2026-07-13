import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Edit2, Check, ChevronDown, ChevronRight, ChevronUp, GripVertical, Copy, BarChart3 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAppContext } from '@/hooks/useAppContext'
import { getModifierTemplates } from '@/services/modifierTemplateService'

/**
 * Componente para gestionar modificadores de productos en modo restaurante
 * Los modificadores permiten que los productos tengan opciones personalizables
 * como: término de la carne, ingredientes adicionales, tipo de pan, etc.
 *
 * Props extra:
 * - enableTemplates: muestra "Desde plantilla" (insertar una copia de una
 *   plantilla guardada en Insumos > Modificadores). false cuando el propio
 *   componente se usa para EDITAR las plantillas.
 * - title/description: textos del encabezado (por defecto, los de producto).
 */
export default function ProductModifiersSection({
  modifiers,
  onChange,
  enableTemplates = true,
  title = 'Modificadores (Modo Restaurante)',
  description = 'Agrega opciones personalizables como término de la carne, ingredientes adicionales, tipo de pan, etc.',
}) {
  const { getBusinessId, isDemoMode } = useAppContext()
  const [editingModifierId, setEditingModifierId] = useState(null)
  const [expandedModifierId, setExpandedModifierId] = useState(null)
  const [dragOptionData, setDragOptionData] = useState(null) // { modifierId, optionIndex }
  const [templates, setTemplates] = useState([])
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)

  // Cargar plantillas de modificadores (definidas en Insumos > Modificadores)
  useEffect(() => {
    if (!enableTemplates || isDemoMode) return
    let cancelled = false
    getModifierTemplates(getBusinessId()).then(res => {
      if (!cancelled && res.success) setTemplates(res.data || [])
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableTemplates, isDemoMode])

  // Insertar una COPIA de la plantilla en el producto (con ids nuevos y
  // templateId de referencia). Editar la plantilla después no toca el producto.
  const insertTemplate = (tpl) => {
    const ts = Date.now()
    const copy = {
      id: `mod-${ts}`,
      name: tpl.name || '',
      required: !!tpl.required,
      maxSelection: tpl.maxSelection || 1,
      allowRepeat: !!tpl.allowRepeat,
      ...(tpl.trackUsage ? { trackUsage: true } : {}),
      ...(tpl.id ? { templateId: tpl.id } : {}),
      options: (tpl.options || []).map((o, i) => ({
        id: `opt-${ts}-${i}`,
        name: o.name || '',
        priceAdjustment: o.priceAdjustment || 0,
      })),
    }
    onChange([...modifiers, copy])
    setShowTemplateMenu(false)
    setExpandedModifierId(copy.id)
  }

  // Botón + menú "Desde plantilla" (solo si hay plantillas guardadas)
  const templateButton = enableTemplates && templates.length > 0 && (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShowTemplateMenu(o => !o)}
      >
        <Copy className="w-4 h-4 mr-2" />
        Desde plantilla
      </Button>
      {showTemplateMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowTemplateMenu(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden py-1 max-h-60 overflow-y-auto">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => insertTemplate(tpl)}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <p className="text-sm font-medium text-gray-900 truncate">{tpl.name || 'Sin nombre'}</p>
                <p className="text-xs text-gray-500">
                  {(tpl.options || []).length} opción{(tpl.options || []).length !== 1 ? 'es' : ''}
                  {tpl.trackUsage ? ' · con control' : ''}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

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

  // Mover opción arriba o abajo
  const handleMoveOption = (modifierId, optionIndex, direction) => {
    const newIndex = optionIndex + direction
    const updated = modifiers.map(mod => {
      if (mod.id !== modifierId) return mod
      if (newIndex < 0 || newIndex >= mod.options.length) return mod
      const newOptions = [...mod.options]
      const [moved] = newOptions.splice(optionIndex, 1)
      newOptions.splice(newIndex, 0, moved)
      return { ...mod, options: newOptions }
    })
    onChange(updated)
  }

  // Drag and drop de opciones
  const handleDragStart = (modifierId, optionIndex) => {
    setDragOptionData({ modifierId, optionIndex })
  }

  const handleDragOver = (e, modifierId, optionIndex) => {
    e.preventDefault()
    if (!dragOptionData || dragOptionData.modifierId !== modifierId) return
    if (dragOptionData.optionIndex === optionIndex) return

    // Reordenar en tiempo real mientras se arrastra
    const updated = modifiers.map(mod => {
      if (mod.id !== modifierId) return mod
      const newOptions = [...mod.options]
      const [moved] = newOptions.splice(dragOptionData.optionIndex, 1)
      newOptions.splice(optionIndex, 0, moved)
      return { ...mod, options: newOptions }
    })
    onChange(updated)
    setDragOptionData({ modifierId, optionIndex })
  }

  const handleDragEnd = () => {
    setDragOptionData(null)
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
          {title}
        </h3>
        <p className="text-xs text-gray-600">
          {description}
        </p>
      </div>

      {modifiers.length === 0 ? (
        <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-sm text-gray-600 mb-3">
            Este producto no tiene modificadores. Los modificadores permiten personalizar el pedido.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddModifier}
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Modificador
            </Button>
            {templateButton}
          </div>
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
                          {modifier.allowRepeat && (
                            <>
                              <span className="text-xs text-gray-400">•</span>
                              <span className="text-xs text-primary-600 font-medium">Multi-opción</span>
                            </>
                          )}
                          {modifier.trackUsage && (
                            <>
                              <span className="text-xs text-gray-400">•</span>
                              <span className="text-xs text-green-600 font-medium inline-flex items-center gap-0.5">
                                <BarChart3 className="w-3 h-3" /> Control
                              </span>
                            </>
                          )}
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
                      <div className="space-y-3">
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
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={modifier.allowRepeat || false}
                              onChange={(e) => handleUpdateModifier(modifier.id, 'allowRepeat', e.target.checked)}
                              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-700">Multi-opción</span>
                          </label>
                          <p className="text-xs text-gray-500 mt-1 ml-6">
                            Permite repetir la misma opción varias veces (ej: 3x huevo frito)
                          </p>
                        </div>
                        <div>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={modifier.trackUsage || false}
                              onChange={(e) => handleUpdateModifier(modifier.id, 'trackUsage', e.target.checked)}
                              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                            />
                            <span className="text-sm text-gray-700">Llevar control</span>
                          </label>
                          <p className="text-xs text-gray-500 mt-1 ml-6">
                            Incluye este grupo en el reporte de modificadores (Insumos &gt; Modificadores). Ideal para toppings, cremas y extras; no para preguntas tipo "¿desea cubiertos?".
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Máximo de selecciones
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={modifier.maxSelection}
                          onChange={(e) => handleUpdateModifier(modifier.id, 'maxSelection', e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value)
                            if (!val || val < 1) handleUpdateModifier(modifier.id, 'maxSelection', 1)
                          }}
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
                          {modifier.options.map((option, optIndex) => (
                            <div
                              key={option.id}
                              draggable
                              onDragStart={() => handleDragStart(modifier.id, optIndex)}
                              onDragOver={(e) => handleDragOver(e, modifier.id, optIndex)}
                              onDragEnd={handleDragEnd}
                              className={`flex items-center gap-1.5 p-2 bg-gray-50 rounded border transition-colors ${
                                dragOptionData?.modifierId === modifier.id && dragOptionData?.optionIndex === optIndex
                                  ? 'border-primary-400 bg-primary-50'
                                  : 'border-gray-200'
                              }`}
                            >
                              {/* Grip + Botones de reordenar */}
                              <div className="flex items-center gap-0.5">
                                <GripVertical className="w-3.5 h-3.5 text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0" />
                                <div className="flex flex-col">
                                <button
                                  type="button"
                                  onClick={() => handleMoveOption(modifier.id, optIndex, -1)}
                                  disabled={optIndex === 0}
                                  className={`p-0.5 ${optIndex === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-primary-600'}`}
                                  title="Mover arriba"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveOption(modifier.id, optIndex, 1)}
                                  disabled={optIndex === modifier.options.length - 1}
                                  className={`p-0.5 ${optIndex === modifier.options.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-primary-600'}`}
                                  title="Mover abajo"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                </div>
                              </div>
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

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddModifier}
              className="flex-1"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Otro Modificador
            </Button>
            {templateButton}
          </div>
        </div>
      )}
    </div>
  )
}
