/**
 * Categoría y subcategoría que llegan de un Excel de productos.
 *
 * Una subcategoría con el MISMO nombre que su categoría no es una subcategoría:
 * es la columna copiada. Pasó con un cliente el 5-set-2026: llenó
 * `subcategoria` con el mismo texto que `categoria` en las 789 filas, el
 * importador creó cada categoría dos veces (la raíz y una hija con su mismo
 * nombre) y los 780 productos cayeron dentro de la hija. En Productos veía la
 * categoría vacía y tenía que entrar a una segunda igual para hallar sus
 * artículos.
 *
 * Lo usan los dos caminos de importación (el modal del negocio y el servicio
 * del panel admin) para que el criterio sea uno solo.
 */

const limpio = (v) => String(v ?? '').trim()

/**
 * Devuelve la subcategoría que de verdad hay que crear: '' si viene vacía o si
 * repite el nombre de la categoría (sin distinguir mayúsculas).
 */
export function subcategoriaImportada(categoria, subcategoria) {
  const cat = limpio(categoria)
  const sub = limpio(subcategoria)
  if (!sub || !cat) return sub
  return sub.toLowerCase() === cat.toLowerCase() ? '' : sub
}
