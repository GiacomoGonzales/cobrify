import { getStockInWarehouse } from '@/services/warehouseService'

/**
 * Stock de un producto, con el desglose por almacén.
 *
 * Cotizaciones y compras mostraban solo el total ("Stock: 16") y el usuario no
 * sabía en cuál de sus almacenes estaban esas 16 unidades — pedido de un usuario
 * el 31-jul-2026. Vive en un solo sitio para que las dos pantallas muestren lo
 * mismo: con una copia por página, terminan mostrando números distintos.
 *
 * Con un solo almacén no se desglosa nada: sería ruido, el total ya lo dice todo.
 *
 * @param {Object} product - producto del catálogo
 * @param {string} [variantSku] - si el ítem es una variante, su SKU
 * @param {Array} warehouses - almacenes visibles para el usuario (ya filtrados
 *   por sus permisos: un sub-usuario no debe ver el stock de un almacén ajeno)
 */
export default function StockByWarehouse({ product, variantSku = null, warehouses = [], className = '' }) {
  if (!product || product.trackStock === false) return null

  // La variante lleva su propio stock por almacén; si no se encuentra, se cae al
  // producto padre en vez de mostrar cero, que se leería como "agotado".
  const fuente = (variantSku && product.variants?.length)
    ? (product.variants.find(v => v.sku === variantSku) || product)
    : product

  const total = fuente.stock
  if (total === null || total === undefined) return null

  const minStock = product.minStock ?? 3
  const colorTotal = total <= 0 ? 'text-red-600' : total <= minStock ? 'text-amber-600' : 'text-gray-700'

  const desglose = warehouses
    .map(w => ({ nombre: w.name, cantidad: getStockInWarehouse(fuente, w.id) }))
    .filter(w => w.cantidad > 0)

  // Lo que no aparece en los almacenes listados. Puede ser stock sin asignar a
  // ninguno, o stock en un almacén que este usuario no tiene permitido ver. Se
  // muestra como "Otros" —sin afirmar cuál de los dos casos es— porque si se
  // omitiera, el desglose no sumaría el total y parecería que faltan unidades.
  const enListados = desglose.reduce((s, w) => s + w.cantidad, 0)
  const otros = Math.max(0, (Number(total) || 0) - enListados)

  const hayDesglose = warehouses.length > 1 && (desglose.length > 0 || otros > 0)

  return (
    <div className={`text-[11px] text-gray-500 mt-1 ml-1 ${className}`}>
      <span>
        Stock: <span className={`font-medium ${colorTotal}`}>{total}</span>
      </span>
      {hayDesglose && (
        <span className="text-gray-400">
          {' — '}
          {desglose.map((w, i) => (
            <span key={`${w.nombre}-${i}`}>
              {i > 0 && ' · '}
              {w.nombre}: <span className="text-gray-600 font-medium">{w.cantidad}</span>
            </span>
          ))}
          {otros > 0 && (
            <span>
              {desglose.length > 0 && ' · '}
              Otros: <span className="text-gray-600 font-medium">{parseFloat(otros.toFixed(2))}</span>
            </span>
          )}
        </span>
      )}
    </div>
  )
}
