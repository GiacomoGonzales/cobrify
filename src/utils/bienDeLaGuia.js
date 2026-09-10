/**
 * EL TEXTO DE UN BIEN EN LA GUÍA DE REMISIÓN cuando la guía sale de una venta,
 * una compra, una cotización o un movimiento de almacén.
 *
 * Es el NOMBRE del producto, el mismo que va en la factura: el XML de la
 * factura usa `item.name || item.description`
 * (functions/src/utils/xmlGenerator.js).
 *
 * Reporte de CHACHITA S.A.C. (vía PakiiP, 10-set-2026): la guía T001-00000002
 * salió con la DESCRIPCIÓN de cada producto en vez del nombre. El POS copia en
 * cada ítem vendido la descripción larga del producto (`description`, la que
 * el PDF muestra debajo del nombre si el negocio lo pide) y la guía la tomaba
 * primero. Productos distintos pueden compartir esa descripción: ROSQUILLA X 4
 * UNIDADES, X 100G, X 200G y X 400G decían las cuatro "Rosquita de almidón de
 * yuca", y en la guía no había forma de saber cuál era cuál.
 *
 * La descripción solo se usa si el ítem no tiene nombre (datos viejos, o ítems
 * que guardaron el texto ahí). `productName` es como lo guardan las salidas y
 * los retornos de almacén.
 */
export const textoDelBien = (item) => {
  for (const campo of ['name', 'description', 'productName']) {
    const texto = String(item?.[campo] ?? '').trim()
    if (texto) return texto
  }
  return ''
}
