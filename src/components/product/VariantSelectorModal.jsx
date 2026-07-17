import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { Plus } from 'lucide-react'

/**
 * Selector de variante de un producto (ej. Vino: Copa / Botella).
 *
 * Extraído del POS para reusarlo en los flujos de restaurante (mesas y órdenes),
 * donde no existía: al tocar un producto con variantes se agregaba con el precio
 * base sin preguntar, así que el mozo no podía elegir la presentación.
 *
 * Cada variante trae su propio precio y su propio stock por almacén.
 *
 * @param {Object} product - producto con `variants[]` (se asume hasVariants)
 * @param {Function} onSelect - (product, variant) => void
 * @param {Object} warehouse - almacén para calcular el stock (opcional)
 * @param {boolean} allowNegativeStock - permitir elegir variantes sin stock
 * @param {Function} formatCurrency - formateador de precio
 */
export default function VariantSelectorModal({
  isOpen,
  onClose,
  product,
  onSelect,
  warehouse = null,
  allowNegativeStock = false,
  formatCurrency,
}) {
  if (!product) return null

  const variants = product.variants || []

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Seleccionar variante - ${product.name || ''}`}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Selecciona la variante del producto que deseas agregar:
        </p>

        <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
          {variants.map((variant, index) => {
            const variantStock = warehouse
              ? ((variant.warehouseStocks || []).find(ws => ws.warehouseId === warehouse.id)?.stock || 0)
              : (variant.stock || 0)
            const noStock = variantStock <= 0 && !allowNegativeStock

            return (
              <button
                key={variant.sku || index}
                onClick={() => onSelect(product, variant)}
                disabled={noStock}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  noStock
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 hover:border-primary-500 hover:bg-primary-50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-mono text-xs text-gray-500 mb-1">{variant.sku}</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Object.entries(variant.attributes || {}).map(([key, value]) => (
                        <Badge key={key} variant="default" className="text-xs">
                          {key.charAt(0).toUpperCase() + key.slice(1)}: {value}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-lg font-bold text-primary-600">
                        {formatCurrency(variant.price)}
                      </p>
                      <span
                        className={`text-xs font-semibold ${
                          variantStock >= 4
                            ? 'text-green-600'
                            : variantStock > 0
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        {variantStock > 0
                          ? `Stock: ${Number.isInteger(variantStock) ? variantStock : parseFloat(variantStock.toFixed(2))}`
                          : 'Sin stock'}
                      </span>
                    </div>
                  </div>
                  {!noStock && <Plus className="w-5 h-5 text-primary-600 flex-shrink-0" />}
                </div>
              </button>
            )
          })}
        </div>

        {variants.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No hay variantes disponibles para este producto.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
