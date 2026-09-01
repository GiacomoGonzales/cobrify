/**
 * STOCK POR SUCURSAL, solo para CONSULTA desde el POS.
 *
 * El cajero de una sede necesita responder "no me queda, ¿hay en la otra
 * tienda?" sin salir de la caja. Esto arma ese desglose y nada más: no mueve
 * stock, no transfiere, no cambia de dónde se descuenta la venta — eso sigue
 * saliendo del almacén seleccionado.
 *
 * El stock vive por ALMACÉN (`warehouseStocks: [{warehouseId, stock}]`) y cada
 * almacén pertenece a una sucursal (`branchId`, vacío = Principal), así que
 * hay que sumar por sucursal.
 */

import { PRINCIPAL, claveDeSucursal } from './sellerBranches'

/**
 * El stock por almacén EFECTIVO de un producto.
 *
 * Con variantes el stock vive en cada variante y el `warehouseStocks` del padre
 * es una copia que no siempre está: de los 2,505 productos con variantes de la
 * base, 810 no tienen el campo y otros 162 lo tienen desfasado. Leyendo el del
 * padre, esos 810 salían como "sin stock en ninguna sucursal" y los 162 con un
 * número distinto al que muestra su propia tarjeta en el POS.
 *
 * Sumar desde las variantes es lo que hace el POS para pintar la tarjeta, así
 * que el desglose y el número de al lado no pueden discrepar.
 *
 * @param {object} producto - producto (con o sin variantes) o una variante suelta
 * @returns {Array<{warehouseId: string, stock: number}>}
 */
export function almacenesDelProducto(producto) {
  const variantes = producto?.hasVariants && Array.isArray(producto?.variants) ? producto.variants : []
  if (variantes.length === 0) {
    return Array.isArray(producto?.warehouseStocks) ? producto.warehouseStocks : []
  }

  const porAlmacen = new Map()
  for (const v of variantes) {
    const lista = Array.isArray(v?.warehouseStocks) ? v.warehouseStocks : []
    for (const ws of lista) {
      if (!ws?.warehouseId) continue
      porAlmacen.set(ws.warehouseId, (porAlmacen.get(ws.warehouseId) || 0) + (Number(ws.stock) || 0))
    }
  }
  return [...porAlmacen.entries()].map(([warehouseId, stock]) => ({ warehouseId, stock }))
}

/**
 * Desglose de stock por sucursal.
 *
 * @param {object} producto            - producto o variante (lo que tenga warehouseStocks)
 * @param {Array}  warehouses          - TODOS los almacenes del negocio
 * @param {Array}  branches            - TODAS las sucursales
 * @param {object} [opts]
 * @param {string} [opts.nombrePrincipal]
 * @param {string} [opts.sucursalActual] - id de la sede en la que está el cajero
 * @returns {Array<{clave, nombre, stock, esActual}>} ordenado: la actual primero,
 *          después las que tienen stock (de mayor a menor), después el resto.
 */
export function stockPorSucursal(producto, warehouses, branches, {
  nombrePrincipal = 'Principal',
  sucursalActual = null,
} = {}) {
  const lista = almacenesDelProducto(producto)
  if (lista.length === 0) return []

  // almacén -> sucursal
  const sucursalDe = new Map()
  for (const w of warehouses || []) sucursalDe.set(w.id, claveDeSucursal(w.branchId))

  const porSucursal = new Map()
  for (const ws of lista) {
    // Un almacén que ya no existe (borrado) no se puede atribuir a ninguna
    // sede: se ignora en vez de inventarle una.
    if (!sucursalDe.has(ws.warehouseId)) continue
    const clave = sucursalDe.get(ws.warehouseId)
    porSucursal.set(clave, (porSucursal.get(clave) || 0) + (Number(ws.stock) || 0))
  }

  const nombreDe = (clave) => (clave === PRINCIPAL
    ? nombrePrincipal
    : (branches || []).find((b) => b.id === clave)?.name || 'Sucursal')

  const claveActual = claveDeSucursal(sucursalActual)
  const filas = [...porSucursal.entries()].map(([clave, stock]) => ({
    clave,
    nombre: nombreDe(clave),
    stock: Number.isInteger(stock) ? stock : Number(stock.toFixed(2)),
    esActual: clave === claveActual,
  }))

  filas.sort((a, b) => {
    if (a.esActual !== b.esActual) return a.esActual ? -1 : 1
    if (b.stock !== a.stock) return b.stock - a.stock
    return a.nombre.localeCompare(b.nombre, 'es')
  })
  return filas
}

/** ¿Hay stock en alguna sucursal que NO sea la actual? */
export function hayEnOtrasSucursales(filas) {
  return (filas || []).some((f) => !f.esActual && f.stock > 0)
}
