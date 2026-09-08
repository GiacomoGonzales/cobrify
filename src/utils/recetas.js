/**
 * QUÉ HACE UNA RECETA CON EL STOCK — el criterio, en un solo lugar y sin
 * Firestore, para poder probarlo.
 *
 * Un plato con receta no tiene stock propio: al venderlo (o al consumirlo el
 * personal) bajan sus INSUMOS. Acá vive la decisión de cuándo eso aplica y la
 * apertura del resultado de `getRecipeByProductId`, que devuelve un SOBRE
 * `{ success, data }` y no la receta.
 *
 * Tratar el sobre como si fuera la receta fue lo que dejó al consumo interno
 * sin descontar NADA en todos los restaurantes desde el 21-ago-2026: el sobre
 * siempre es truthy, no tiene `deductOnSale`, y su `.ingredients` es
 * undefined — así que en restaurante entraba al camino de la receta con una
 * lista vacía y salía sin tocar el producto, sin movimiento y sin error.
 */

/**
 * ¿Esta receta descuenta (y valida) stock de insumos al vender?
 *
 * El campo `deductOnSale` se introdujo después de que ya existían recetas en
 * producción. Las anteriores tienen `deductOnSale === undefined`; para esas se
 * aplica el mismo default que el formulario de Composición (Recipes.jsx):
 *   - businessMode === 'restaurant' → true (descontar al vender, comportamiento clásico)
 *   - cualquier otro modo            → false (modo "producción", no descontar al vender)
 *
 * Así los negocios no-restaurant con recetas viejas no quedan bloqueados por la
 * validación de stock de insumos (ver POS.jsx handleCheckout) cuando el dueño
 * nunca configuró que se descuente.
 */
export const shouldDeductIngredients = (recipe, businessMode) => {
  if (!recipe) return false
  if (recipe.deductOnSale === true) return true
  if (recipe.deductOnSale === false) return false
  return businessMode === 'restaurant'
}

/**
 * La receta que hay que descontar, o null.
 *
 * Recibe el RESULTADO de `getRecipeByProductId` (el sobre), no la receta. Un
 * objeto sin `success` —una receta pasada por error— también da null: es
 * preferible no descontar a descontar por un camino que no se entiende.
 */
export function recetaParaDescontar(resultado, businessMode) {
  const receta = resultado?.success === true ? resultado.data : null
  if (!receta) return null
  return shouldDeductIngredients(receta, businessMode) ? receta : null
}

/** Los insumos de la receta, multiplicados por las porciones consumidas. */
export function insumosDeReceta(receta, cantidad) {
  const n = Number(cantidad) || 0
  return (receta?.ingredients || [])
    .filter((ing) => ing && ing.ingredientId)
    .map((ing) => ({ ...ing, quantity: (Number(ing.quantity) || 0) * n }))
}

/**
 * Por dónde devolver una línea de consumo al anularla: por donde salió.
 *
 * Cada línea registrada desde el 8-set-2026 lleva `descuento`: 'insumos',
 * 'producto' o 'nada'. Las anteriores no lo tienen, y para esas se aplica lo
 * que el sistema hacía entonces: en restaurante NO descontaba (el sobre de
 * arriba), así que no hay nada que devolver; en los demás modos descontaba el
 * producto. Devolver lo que nunca salió infla el stock.
 *
 * @returns {'insumos'|'producto'|'nada'}
 */
export function viaDeDevolucion(item, businessMode) {
  const marcado = item?.descuento
  if (marcado === 'insumos' || marcado === 'producto' || marcado === 'nada') return marcado
  if (item?.controlaStock === false) return 'nada'
  return businessMode === 'restaurant' ? 'nada' : 'producto'
}

/**
 * Lo que DE VERDAD salió, cruzando lo pedido con lo que `deductIngredients`
 * aplicó.
 *
 * `deductions` trae un registro por insumo tocado: `quantity` es la cantidad
 * aplicada (menor que la pedida si no alcanzaba y no se permite negativo) y
 * `warehouseId` el almacén elegido. Un insumo pedido que no figura ahí no se
 * descontó — un plato sin stock propio puesto como "insumo" de un combo, un
 * insumo que ya no existe. Anotar lo pedido como si hubiera salido hace que
 * la anulación devuelva stock que nunca se movió.
 *
 * @returns {{ aplicados: Array, faltantes: Array<{nombre, pedido, aplicado}> }}
 */
export function resultadoDeDescuento(insumosPedidos = [], deductions = []) {
  const porId = new Map((deductions || []).map((d) => [d.ingredientId, d]))
  const aplicados = []
  const faltantes = []
  for (const i of insumosPedidos || []) {
    const d = porId.get(i.ingredientId)
    const pedido = Number(i.quantity) || 0
    // Un `deductions` viejo sin `quantity` significa que se aplicó completo.
    const aplicado = d ? (Number(d.quantity ?? pedido) || 0) : 0
    if (aplicado > 0) {
      aplicados.push({
        ingredientId: i.ingredientId,
        ingredientType: d.ingredientType || (i.ingredientType === 'product' ? 'product' : 'ingredient'),
        ingredientName: i.ingredientName || i.name || '',
        unit: i.unit || null,
        quantity: aplicado,
        warehouseId: d.warehouseId ?? null,
      })
    }
    if (aplicado < pedido) faltantes.push({ nombre: i.ingredientName || i.name || i.ingredientId, pedido, aplicado })
  }
  return { aplicados, faltantes }
}
