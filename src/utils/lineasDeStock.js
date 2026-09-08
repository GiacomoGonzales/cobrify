/**
 * UN PRODUCTO, VISTO COMO LO QUE SE PUEDE DESCONTAR.
 *
 * Para el inventario un producto con variantes no es una cosa: es una fila por
 * variante. "Cerveza" no tiene stock; lo tienen "Cerveza — personal" y
 * "Cerveza — 610 ml", cada una en cada almacén. Descontar "Cerveza" a secas
 * no descuenta ninguna de las dos —la transacción cae a la rama de producto
 * simple y toca el total del padre, que la siguiente venta de una variante
 * vuelve a calcular desde las variantes y **deshace en silencio**. Eso fue lo
 * que se vio en Consumo interno (7-set-2026): no bajaba el stock y no quedaba
 * rastro.
 *
 * Por eso las pantallas que descuentan (Traslado, Salidas, Recuento) muestran
 * una fila por variante. Acá está ese despliegue una sola vez, con el stock del
 * almacén elegido y el costo con el mismo criterio que la valorización.
 */
import { sumarStockDeAlmacenes, hayDesgloseUtil } from './stockDeCatalogo'
import { llevaStock } from './stockTracking'
import { getItemUnitCost } from './exitCosting'
import { nombreDeVariante } from './variantesPorAtributo'

/** Identifica una línea: el producto y, si la tiene, su variante. */
export const claveDeLinea = (productId, variantSku = null) => `${productId}|${variantSku || ''}`

/** Lo que se muestra: "Cerveza — 610 ml", o solo "Cerveza". */
export const nombreDeLinea = (linea) =>
  linea?.etiqueta ? `${linea.nombre} — ${linea.etiqueta}` : (linea?.nombre || '')

/**
 * Las líneas descontables de un producto.
 *
 * Con variantes: una por variante, con el stock que ESA variante tiene en el
 * almacén (solo `warehouseStocks`: es lo único que la transacción descuenta,
 * así que es lo único honesto de mostrar). Sin variantes: una sola línea; si el
 * producto es viejo y no tiene desglose por almacén, vale su `stock` total.
 *
 * @param {object} producto
 * @param {{ almacenId?: string|null }} opts  sin almacén cuenta el total
 * @returns {Array<{clave, productId, variantSku, nombre, etiqueta, stockActual, costoUnitario, controlaStock}>}
 */
export function lineasDeProducto(producto, { almacenId = null } = {}) {
  if (!producto?.id) return []
  const permitidos = almacenId ? [almacenId] : null
  const porId = { [producto.id]: producto }
  const base = {
    productId: producto.id,
    nombre: producto.name || '',
    controlaStock: llevaStock(producto),
  }

  const variantes = producto.hasVariants && Array.isArray(producto.variants)
    ? producto.variants.filter(Boolean)
    : []

  if (variantes.length === 0) {
    return [{
      ...base,
      clave: claveDeLinea(producto.id),
      variantSku: null,
      etiqueta: '',
      stockActual: hayDesgloseUtil(producto.warehouseStocks)
        ? sumarStockDeAlmacenes(producto.warehouseStocks, permitidos)
        : (Number(producto.stock) || 0),
      costoUnitario: getItemUnitCost({ productId: producto.id }, porId).cost,
    }]
  }

  return variantes.map((v) => ({
    ...base,
    clave: claveDeLinea(producto.id, v.sku),
    variantSku: v.sku || null,
    etiqueta: nombreDeVariante(v),
    stockActual: sumarStockDeAlmacenes(v.warehouseStocks, permitidos),
    costoUnitario: getItemUnitCost({ productId: producto.id, variantSku: v.sku }, porId).cost,
  }))
}
