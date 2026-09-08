/**
 * Qué almacenes cuentan para el stock que ve el comprador en el catálogo.
 *
 * Lo pidió La S'Kim beauty: tienen dos locales en Tacna y una bodega en Arica.
 * El catálogo sumaba los tres, así que un producto que solo estaba en la bodega
 * aparecía disponible — y les pasó: pidieron algo que estaba en Arica y no
 * pudieron cumplir.
 *
 * Ahora se eligen los almacenes en Configuración > Mi Catálogo Online y el
 * catálogo cuenta solo esos: para decir si algo está agotado, para mostrar las
 * unidades y para limitar cuánto puede pedir el comprador.
 *
 * ---
 *
 * ESTO SOLO FILTRA LO QUE SE MUESTRA. Al vender, el stock se descuenta del
 * almacén que corresponda como siempre — un almacén fuera del catálogo sigue
 * siendo un almacén con mercadería, y sus movimientos, reportes y valorización
 * no cambian.
 *
 * VACÍO SIGNIFICA TODOS, igual que en el resto del sistema (los permisos de
 * sub-usuario, los tipos de comprobante). Es lo que hace que los negocios que
 * nunca tocaron la opción sigan viendo su catálogo completo.
 */

/**
 * Los almacenes elegidos para el catálogo, o `null` si cuentan todos.
 *
 * @returns {string[]|null}
 */
export function almacenesDelCatalogo(business) {
  const elegidos = business?.catalogWarehouseIds
  if (!Array.isArray(elegidos) || elegidos.length === 0) return null
  return elegidos
}

/**
 * Suma el stock de `warehouseStocks` contando solo los almacenes permitidos.
 *
 * @param {Array<{warehouseId?: string, stock?: number}>} warehouseStocks
 * @param {string[]|null} almacenes  null = todos
 */
export function sumarStockDeAlmacenes(warehouseStocks, almacenes = null) {
  if (!Array.isArray(warehouseStocks)) return 0
  return warehouseStocks.reduce((total, ws) => {
    if (almacenes && !almacenes.includes(ws?.warehouseId)) return total
    return total + (Number(ws?.stock) || 0)
  }, 0)
}

/**
 * ¿El desglose por almacén sirve para decidir, con el filtro puesto?
 *
 * Sin filtro alcanza con que haya desglose. Con filtro hay que exigir que
 * alguno de los almacenes elegidos aparezca ahí: si el producto solo tiene
 * stock en almacenes excluidos, su desglose no menciona ninguno de los
 * elegidos y **la suma da 0**, que es justo lo que se quiere decir (no hay nada
 * disponible para el catálogo). Lo que NO se puede hacer es caer al
 * `product.stock` total, porque ese incluye la bodega escondida.
 */
export function hayDesgloseUtil(warehouseStocks) {
  return Array.isArray(warehouseStocks) && warehouseStocks.length > 0
}
