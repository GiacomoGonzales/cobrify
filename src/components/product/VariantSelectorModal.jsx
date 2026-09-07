import { useState, useMemo, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Plus, Search, Check } from 'lucide-react'
import { matchesSearchQuery } from '@/lib/utils'

/**
 * Selector de variante de un producto (ej. Vino: Copa / Botella).
 *
 * Extraído del POS para reusarlo en los flujos de restaurante (mesas y órdenes),
 * donde no existía: al tocar un producto con variantes se agregaba con el precio
 * base sin preguntar, así que el mozo no podía elegir la presentación.
 *
 * Cada variante trae su propio precio y su propio stock por almacén.
 *
 * `seguirAbierto` (reporte de CITEX, 6-set-2026): en una tienda de ropa cada
 * venta lleva VARIAS tallas del mismo modelo, y el modal se cerraba al elegir
 * una — había que buscar el producto otra vez para cada talla. Con esto queda
 * abierto, marca lo que ya se agregó y se cierra cuando el vendedor termina.
 * En restaurante no aplica: ahí se elige Copa **o** Botella, no las dos.
 *
 * @param {Object} product - producto con `variants[]` (se asume hasVariants)
 * @param {Function} onSelect - (product, variant) => void
 * @param {Object} warehouse - almacén para calcular el stock (opcional)
 * @param {boolean} allowNegativeStock - permitir elegir variantes sin stock
 * @param {Function} formatCurrency - formateador de precio
 * @param {boolean} seguirAbierto - no cerrar al elegir; permite agregar varias
 */
export default function VariantSelectorModal({
  isOpen,
  onClose,
  product,
  onSelect,
  warehouse = null,
  allowNegativeStock = false,
  formatCurrency,
  seguirAbierto = false,
}) {
  const [busqueda, setBusqueda] = useState('')
  // Cuáles se agregaron en ESTA visita, para que el vendedor vea qué lleva
  // puesto sin tener que mirar el carrito.
  const [agregadas, setAgregadas] = useState({})

  // Al abrir con otro producto se arranca de cero.
  useEffect(() => {
    if (isOpen) {
      setBusqueda('')
      setAgregadas({})
    }
  }, [isOpen, product?.id])

  const variants = useMemo(() => product?.variants || [], [product])

  // Buscar por talla, color o código: con catorce variantes por modelo, leer la
  // lista entera para encontrar la M es más lento que escribirla.
  const filtradas = useMemo(() => {
    const q = busqueda.trim()
    if (!q) return variants
    return variants.filter(v =>
      matchesSearchQuery(q, v.sku, ...Object.values(v.attributes || {})))
  }, [variants, busqueda])

  if (!product) return null

  const claveDe = (v, i) => v.sku || `i${i}`

  const elegir = (variant, clave) => {
    onSelect(product, variant)
    if (seguirAbierto) {
      setAgregadas(prev => ({ ...prev, [clave]: (prev[clave] || 0) + 1 }))
    }
  }

  const total = Object.values(agregadas).reduce((s, n) => s + n, 0)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Seleccionar variante - ${product.name || ''}`}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {seguirAbierto
            ? 'Toca cada variante que quieras agregar. Puedes agregar varias seguidas.'
            : 'Selecciona la variante del producto que deseas agregar:'}
        </p>

        {variants.length > 6 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por talla, color o código..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
          {filtradas.map((variant, index) => {
            const variantStock = warehouse
              ? ((variant.warehouseStocks || []).find(ws => ws.warehouseId === warehouse.id)?.stock || 0)
              : (variant.stock || 0)
            const noStock = variantStock <= 0 && !allowNegativeStock
            const clave = claveDe(variant, index)
            const puestas = agregadas[clave] || 0

            return (
              <button
                key={clave}
                onClick={() => elegir(variant, clave)}
                disabled={noStock}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  noStock
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    : puestas > 0
                      ? 'border-green-500 bg-green-50 hover:bg-green-100'
                      : 'border-gray-200 hover:border-primary-500 hover:bg-primary-50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* La foto de la variante, cuando la tiene. En el mostrador
                      sirve para lo mismo que en el catálogo: reconocer el color
                      de un vistazo en vez de leer el nombre. */}
                  {variant.imageUrl && (
                    <img
                      src={variant.imageUrl}
                      alt=""
                      loading="lazy"
                      className="w-14 h-14 rounded-lg object-cover border border-gray-200 flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
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
                  {puestas > 0 ? (
                    <span className="flex items-center gap-1 text-green-700 font-semibold flex-shrink-0">
                      <Check className="w-5 h-5" />
                      {puestas}
                    </span>
                  ) : (
                    !noStock && <Plus className="w-5 h-5 text-primary-600 flex-shrink-0" />
                  )}
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

        {variants.length > 0 && filtradas.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">Ninguna variante coincide con &quot;{busqueda}&quot;.</p>
          </div>
        )}

        {seguirAbierto && (
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-200">
            <span className="text-sm text-gray-600">
              {total > 0
                ? `${total} ${total === 1 ? 'variante agregada' : 'variantes agregadas'}`
                : 'Nada agregado todavía'}
            </span>
            <Button onClick={onClose} variant={total > 0 ? 'primary' : 'outline'}>
              {total > 0 ? 'Listo' : 'Cerrar'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
