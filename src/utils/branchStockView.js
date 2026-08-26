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
  const lista = Array.isArray(producto?.warehouseStocks) ? producto.warehouseStocks : []
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
