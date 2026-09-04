import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Edit2, Check, ChevronDown, ChevronRight, ChevronUp, GripVertical, Copy, BarChart3 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAppContext } from '@/hooks/useAppContext'
import { getModifierTemplates } from '@/services/modifierTemplateService'
import { sinElEnlace, conElEnlace } from '@/utils/modificadorInsumo'

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
  // Editar UN solo modificador, sin encabezado ni botones de agregar: lo usa la
  // pantalla de Modificadores, donde la lista y el "Nuevo" ya viven afuera.
  soloUno = false,
}) {
  const { getBusinessId, isDemoMode } = useAppContext()
  const [editingModifierId, setEditingModifierId] = useState(null)
  const [expandedModifierId, setExpandedModifierId] = useState(null)
  const [dragOptionData, setDragOptionData] = useState(null) // { modifierId, optionIndex }
  const [templates, setTemplates] = useState([])
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)

  // Insumos, para poder enlazarlos a una opción ("Pieza extra de pollo"
  // descuenta una pieza del inventario). Se cargan la primera vez que alguien
  // abre el enlace y no al montar: la gran mayoría de los modificadores no
  // descuenta nada, y esto se monta en el editor de cada producto.
  const [insumos, setInsumos] = useState(null) // null = todavía no se pidieron
  const [modificadoresConEnlace, setModificadoresConEnlace] = useState(() => new Set())

  const cargarInsumos = async () => {
    if (insumos !== null || isDemoMode) return
    setInsumos([])
    try {
      const { getIngredients } = await import('@/services/ingredientService')
      const res = await getIngredients(getBusinessId())
      if (res.success) setInsumos(res.data || [])
    } catch (error) {
      console.error('No se pudieron cargar los insumos:', error)
    }
  }

  // Si un modificador ya tiene opciones enlazadas, sus selectores se muestran
  // solos: si no, el enlace quedaría guardado y sin verse en pantalla.
  useEffect(() => {
    const conEnlace = (modifiers || [])
      .filter(m => (m.options || []).some(o => o?.ingredientId))
      .map(m => m.id)
    if (conEnlace.length === 0) return
    setModificadoresConEnlace(prev => {
      if (conEnlace.every(id => prev.has(id))) return prev
      return new Set([...prev, ...conEnlace])
    })
    cargarInsumos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifiers])

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
      // El insumo enlazado viaja con la opción: si no, insertar la plantilla
      // daría un modificador que cobra el agregado y no lo descuenta.
      options: (tpl.options || []).map((o, i) => conElEnlace({
        id: `opt-${ts}-${i}`,
        name: o.name || '',
        priceAdjustment: o.priceAdjustment || 0,
      }, o)),
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

  // Enlazar (o desenlazar) el insumo que descuenta una opción al venderse.
  // Se guarda también el NOMBRE y la UNIDAD del insumo: son los que viajan
  // congelados dentro de la venta, y el movimiento de stock los necesita para
  // poder leerse aunque el insumo se renombre después.
  const handleEnlazarInsumo = (modifierId, optionId, ingredientId) => {
    const insumo = (insumos || []).find(i => i.id === ingredientId)
    const updated = modifiers.map(mod =>
      mod.id === modifierId
        ? {
            ...mod,
            options: mod.options.map(opt => {
              if (opt.id !== optionId) return opt
              if (!insumo) return sinElEnlace(opt)
              return {
                ...opt,
                ingredientId: insumo.id,
                ingredientName: insumo.name || '',
                ingredientType: 'ingredient',
                ingredientQuantity: opt.ingredientQuantity || 1,
                ingredientUnit: opt.ingredientUnit || insumo.unit || '',
              }
            })
          }
        : mod
    )
    onChange(updated)
  }

  const toggleEnlaces = (modifierId) => {
    cargarInsumos()
    setModificadoresConEnlace(prev => {
      const next = new Set(prev)
      if (next.has(modifierId)) next.delete(modifierId)
      else next.add(modifierId)
      return next
    })
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
    <div className={soloUno ? '' : 'border-t border-gray-200 pt-4'}>
      {!soloUno && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            {title}
          </h3>
          <p className="text-xs text-gray-600">
            {description}
          </p>
        </div>
      )}

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
                <div className="bg-gray-50 px-3 sm:px-4 py-3 flex items-start sm:items-center justify-between gap-2">
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
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
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900 text-sm break-words">
                          {modifier.name || `Modificador ${modIndex + 1}`}
                        </span>
                        {/* Los datos del grupo, en fila que ENVUELVE. Sin
                            esto, en el celular se apretaban hasta partir
                            palabras ("3" arriba y "opciones" abajo). */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 [&>span]:whitespace-nowrap">
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
                    {/* Una columna en el celular: los textos de ayuda son
                        largos y a media pantalla quedaban en tiras de dos
                        palabras. Desde tablet vuelven las dos columnas. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          className="w-full max-w-[160px] px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                            <div key={option.id}>
                            <div
                              onDragOver={(e) => handleDragOver(e, modifier.id, optIndex)}
                              className={`flex items-start gap-1.5 p-2 bg-gray-50 rounded border transition-colors ${
                                dragOptionData?.modifierId === modifier.id && dragOptionData?.optionIndex === optIndex
                                  ? 'border-primary-400 bg-primary-50'
                                  : 'border-gray-200'
                              }`}
                            >
                              {/* Grip (arrastrable) + botones de reordenar.
                                  Solo el grip es draggable: antes lo era toda la fila, y
                                  al intentar seleccionar el texto del precio se disparaba
                                  el arrastre. */}
                              <div className="flex items-center gap-0.5 shrink-0">
                                {/* El arrastre es de escritorio: en tactil
                                    no funciona y solo le robaba ancho al
                                    nombre. En el celular se reordena con
                                    las flechas. */}
                                <span
                                  draggable
                                  onDragStart={() => handleDragStart(modifier.id, optIndex)}
                                  onDragEnd={handleDragEnd}
                                  className="hidden sm:block cursor-grab active:cursor-grabbing flex-shrink-0"
                                  title="Arrastrar para reordenar"
                                >
                                  <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                                </span>
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
                              {/* Nombre y precio: uno debajo del otro en el
                                  celular, en la misma fila desde tablet.
                                  Juntos en una sola fila, el nombre quedaba
                                  en un hilo de dos palabras. */}
                              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5">
                                <input
                                  type="text"
                                  value={option.name}
                                  onChange={(e) => handleUpdateOption(modifier.id, option.id, 'name', e.target.value)}
                                  placeholder="Ej: Término Medio"
                                  className="w-full sm:flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs text-gray-500">+S/</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  // Vacío = sin recargo (0). En blanco cuando el valor es 0
                                  // (no un "0" molesto de borrar). Durante la edición se guarda
                                  // el texto crudo (permite vaciarlo y escribir decimales como
                                  // 0.50, que con type=number fallan en Chrome); al salir se
                                  // normaliza a número.
                                  value={option.priceAdjustment === 0 ? '' : option.priceAdjustment}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(',', '.')
                                    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                                      handleUpdateOption(modifier.id, option.id, 'priceAdjustment', raw)
                                    }
                                  }}
                                  onBlur={(e) => handleUpdateOption(modifier.id, option.id, 'priceAdjustment', parseFloat(e.target.value) || 0)}
                                  placeholder="0"
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                              </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteOption(modifier.id, option.id)}
                                className="text-gray-400 hover:text-red-600 shrink-0 mt-1 sm:mt-0"
                                title="Eliminar opción"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Insumo que descuenta esta opción al venderse.
                                Se muestra solo cuando el modificador lo pide,
                                porque la mayoría de las opciones no descuenta
                                nada y el selector en todas sería ruido. */}
                            {modificadoresConEnlace.has(modifier.id) && (
                              <div className="flex flex-wrap items-center gap-1.5 pl-2 pr-2 pb-2 -mt-1">
                                <span className="text-xs text-gray-500">Descuenta</span>
                                <select
                                  value={option.ingredientId || ''}
                                  onChange={(e) => handleEnlazarInsumo(modifier.id, option.id, e.target.value)}
                                  className="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 max-w-[12rem]"
                                >
                                  <option value="">Nada</option>
                                  {(insumos || []).map(i => (
                                    <option key={i.id} value={i.id}>{i.name}</option>
                                  ))}
                                </select>
                                {option.ingredientId && (
                                  <>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={option.ingredientQuantity ?? 1}
                                      onChange={(e) => {
                                        const raw = e.target.value.replace(',', '.')
                                        if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                                          handleUpdateOption(modifier.id, option.id, 'ingredientQuantity', raw)
                                        }
                                      }}
                                      onBlur={(e) => handleUpdateOption(modifier.id, option.id, 'ingredientQuantity', parseFloat(e.target.value) || 1)}
                                      className="w-16 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                    <span className="text-xs text-gray-500">
                                      {option.ingredientUnit || 'por unidad pedida'}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Abrir o cerrar los selectores de insumo del grupo */}
                      {modifier.options.length > 0 && !isDemoMode && (
                        <button
                          type="button"
                          onClick={() => toggleEnlaces(modifier.id)}
                          className="mt-2 text-xs text-gray-500 hover:text-primary-600"
                        >
                          {modificadoresConEnlace.has(modifier.id)
                            ? 'Ocultar descuento de insumos'
                            : 'Descontar insumos al vender'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Uno debajo del otro en el celular: lado a lado, "Agregar Otro
              Modificador" no entraba y salia en dos renglones. */}
          <div className={`flex flex-col sm:flex-row sm:items-center gap-2 ${soloUno ? 'hidden' : ''}`}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddModifier}
              className="w-full sm:flex-1"
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
