/**
 * ¿Este producto se OFRECE para vender? — criterio único del sistema.
 *
 * Antes esta pregunta estaba copiada a mano (`p.isActive !== false`) en el POS,
 * el escáner, cotizaciones, el modal de restaurante y el catálogo online, y
 * faltaba por completo en Factura/Boleta manual. Dos pantallas más filtraban
 * por `p.active`, un campo que el modelo nunca tuvo: filtros muertos.
 *
 * Son dos estados distintos y por eso son dos campos:
 *  - `isActive === false`  → DESCONTINUADO. No se vende y además sale de las
 *    alertas de stock y del filtro por defecto de Inventario.
 *  - `soloUsoInterno`      → USO INTERNO / OBRA. No se vende, pero se compra,
 *    se cuenta, se traslada, alerta por stock mínimo y se envía a obra. Pedido
 *    de JMC GERENCIA Y CONSTRUCCION (1-sep-2026) para sus materiales.
 *
 * REGLA DE ORO (la misma del catálogo por sucursal, y costó un bug grave):
 * esto decide qué se OFRECE para agregar, NUNCA qué se resuelve al guardar o
 * al cobrar. Todo lookup por productId del checkout —descuento de stock,
 * edición de una venta, un carrito precargado desde una cotización— tiene que
 * seguir yendo contra el catálogo COMPLETO. Si se filtra ahí, un ítem oculto
 * que llega por otra vía se cobra sin descontar stock y sin dejar movimiento.
 */

/** Material de uso interno / obra: no se vende, pero vive en el inventario. */
export const esSoloUsoInterno = (producto) => producto?.soloUsoInterno === true

/**
 * ¿Se puede ofrecer en una pantalla de venta o cotización?
 *
 * Un producto sin los campos cuenta como vendible: son la inmensa mayoría del
 * catálogo viejo y ninguno de los dos campos existía cuando se crearon. Un
 * hueco en la lista (null) no es vendible: no se puede ni pintar.
 */
export const esVendible = (producto) =>
  !!producto && producto.isActive !== false && !esSoloUsoInterno(producto)

/** Deja solo lo vendible. Tolera null/undefined para no romper cargas a medias. */
export const filtrarVendibles = (productos) =>
  Array.isArray(productos) ? productos.filter(esVendible) : []
