import Modal from '@/components/ui/Modal'

/**
 * Selector de presentación de venta de un producto (ej. Ron: Vaso / Botella).
 *
 * Extraído del POS para reusarlo en los flujos de restaurante, donde no existía:
 * al tocar un producto con presentaciones se agregaba en la unidad base sin
 * preguntar, así que el mozo no podía elegir vaso vs. botella.
 *
 * A diferencia de las variantes, ofrece SIEMPRE la "Unidad base" además de cada
 * presentación. Cada presentación tiene su nombre, factor (unidades que contiene)
 * y precio propio; el stock se lleva en la unidad base.
 *
 * @param {Object} product - producto con `presentations[]`
 * @param {Function} onSelectBase - () => void (vender por unidad base)
 * @param {Function} onSelectPresentation - (presentation) => void
 * @param {Function} formatCurrency
 * @param {string} baseUnitLabel - etiqueta de la unidad base (default "Unidad")
 */
export default function PresentationSelectorModal({
  isOpen,
  onClose,
  product,
  onSelectBase,
  onSelectPresentation,
  formatCurrency,
  baseUnitLabel = 'Unidad',
}) {
  if (!product) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Seleccionar presentación - ${product.name || ''}`}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Este producto tiene múltiples presentaciones. Selecciona cómo deseas venderlo:
        </p>
        <div className="space-y-2">
          {/* Opción: Unidad base */}
          <button
            onClick={onSelectBase}
            className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{baseUnitLabel}</p>
                <p className="text-xs text-gray-500">Precio base por unidad</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-primary-600">
                  {formatCurrency(product.price)}
                </p>
                <p className="text-xs text-gray-400">×1</p>
              </div>
            </div>
          </button>

          {/* Presentaciones definidas */}
          {(product.presentations || []).map((pres, idx) => (
            <button
              key={idx}
              onClick={() => onSelectPresentation(pres)}
              className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-green-500 hover:bg-green-50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{pres.name}</p>
                  <p className="text-xs text-gray-500">Contiene {pres.factor} unidades</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-green-600">
                    {formatCurrency(pres.price)}
                  </p>
                  <p className="text-xs text-gray-400">×{pres.factor}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
