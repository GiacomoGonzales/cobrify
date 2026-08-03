/**
 * Valorización de las salidas de almacén (modo logística).
 *
 * Responde "¿cuánto valen los materiales y herramientas que salieron a esta
 * obra?". El criterio vive acá y no en la pantalla porque lo consumen el reporte
 * en pantalla y el Excel: si se calculara en cada uno por separado, terminarían
 * dando números distintos para lo mismo.
 *
 * ── De dónde sale el costo ───────────────────────────────────────────────────
 * Desde agosto 2026 cada item de salida guarda su `unitCost` CONGELADO al
 * momento de registrarse. Es lo correcto: el costo de un producto cambia con
 * cada compra, y sin congelarlo el valor de una obra ya cerrada se movería solo
 * cada vez que se recalcula un costo.
 *
 * Las salidas ANTERIORES a ese cambio no lo tienen. Para esas se cae al costo
 * ACTUAL del producto, que es una aproximación — por eso `estimated` marca cada
 * fila así calculada y los totales informan cuántas lo están. Mostrar un número
 * sin decir que es estimado sería peor que no mostrarlo.
 */

/** Costo unitario de un item de salida. Devuelve `{ cost, estimated }`. */
export const getItemUnitCost = (item, productsById) => {
  const guardado = Number(item?.unitCost)
  if (Number.isFinite(guardado) && guardado > 0) return { cost: guardado, estimated: false }

  const product = productsById?.get?.(item?.productId) || productsById?.[item?.productId]
  if (!product) return { cost: 0, estimated: true }

  // Variante: su costo propio y, si no tiene, el del producto padre. Mismo
  // criterio que Inventario y Productos para valorizar stock con variantes.
  if (item?.variantSku && Array.isArray(product.variants)) {
    const v = product.variants.find(x => x.sku === item.variantSku)
    if (v) return { cost: Number(v.cost) || Number(product.cost) || 0, estimated: true }
  }
  return { cost: Number(product.cost) || 0, estimated: true }
}

/** Valor de una línea de salida. */
export const getItemLineCost = (item, productsById) => {
  const { cost, estimated } = getItemUnitCost(item, productsById)
  const qty = Number(item?.quantity) || 0
  return { unitCost: cost, total: Math.round(qty * cost * 100) / 100, estimated }
}

/** Valor total de una salida, sumando sus líneas. */
export const getExitTotalCost = (exit, productsById) => {
  const items = Array.isArray(exit?.items) ? exit.items : []
  let total = 0
  let estimatedLines = 0
  for (const item of items) {
    const line = getItemLineCost(item, productsById)
    total += line.total
    if (line.estimated) estimatedLines++
  }
  return {
    total: Math.round(total * 100) / 100,
    estimatedLines,
    // Toda la salida es estimada solo si NINGUNA línea traía costo congelado.
    fullyEstimated: items.length > 0 && estimatedLines === items.length,
  }
}

/** Índice productId → producto, para no buscar en el array en cada línea. */
export const buildProductIndex = (products = []) => {
  const map = new Map()
  for (const p of products) map.set(p.id, p)
  return map
}

/**
 * Agrupa las salidas por obra y devuelve, por cada una, cuánto salió y cuánto
 * vale. Las salidas simples (sin proyecto) se agrupan bajo una entrada propia
 * para que el total del reporte cuadre con lo que salió del almacén.
 *
 * @param {Array} exits    - salidas ya filtradas por fecha/almacén
 * @param {Array} products - catálogo, para el costo de las salidas viejas
 * @returns {{ groups: Array, totals: Object }}
 */
export const groupExitsByProject = (exits = [], products = []) => {
  const productsById = buildProductIndex(products)
  const map = new Map()

  for (const exit of exits) {
    const esObra = exit.exitType !== 'simple' && exit.projectId
    const key = esObra ? exit.projectId : '__simple__'

    const grupo = map.get(key) || {
      key,
      isProject: !!esObra,
      name: esObra ? (exit.projectName || 'Obra sin nombre') : 'Salidas simples (uso interno)',
      code: esObra ? (exit.projectCode || '') : '',
      exitCount: 0,
      itemCount: 0,
      unitCount: 0,
      total: 0,
      estimatedLines: 0,
      // Acumulado por producto, para el desglose de qué salió a cada obra.
      products: new Map(),
      firstDate: null,
      lastDate: null,
    }

    const items = Array.isArray(exit.items) ? exit.items : []
    grupo.exitCount++
    grupo.itemCount += items.length

    const fecha = exit.createdAt?.toDate ? exit.createdAt.toDate() : (exit.createdAt ? new Date(exit.createdAt) : null)
    if (fecha && !isNaN(fecha.getTime())) {
      if (!grupo.firstDate || fecha < grupo.firstDate) grupo.firstDate = fecha
      if (!grupo.lastDate || fecha > grupo.lastDate) grupo.lastDate = fecha
    }

    for (const item of items) {
      const line = getItemLineCost(item, productsById)
      const qty = Number(item.quantity) || 0
      grupo.unitCount += qty
      grupo.total += line.total
      if (line.estimated) grupo.estimatedLines++

      // Una variante es una fila propia: mezclarla con el producto padre
      // escondería justo el detalle que la obra necesita ver.
      const pKey = item.variantSku ? `${item.productId}::${item.variantSku}` : item.productId
      const prev = grupo.products.get(pKey) || {
        productId: item.productId,
        name: item.productName || 'Producto',
        code: item.productCode || '',
        variantLabel: item.variantLabel || (item.variantSku ? item.variantSku : ''),
        unit: item.unit || 'und',
        quantity: 0,
        total: 0,
        estimated: false,
      }
      prev.quantity += qty
      prev.total = Math.round((prev.total + line.total) * 100) / 100
      if (line.estimated) prev.estimated = true
      // Último costo unitario visto: sirve de referencia en el desglose.
      prev.unitCost = line.unitCost
      grupo.products.set(pKey, prev)
    }

    grupo.total = Math.round(grupo.total * 100) / 100
    map.set(key, grupo)
  }

  const groups = [...map.values()]
    .map(g => ({
      ...g,
      products: [...g.products.values()].sort((a, b) => b.total - a.total),
    }))
    // Las obras primero y por valor; las salidas simples al final, porque no son
    // una obra y encabezar el reporte con ellas confunde.
    .sort((a, b) => {
      if (a.isProject !== b.isProject) return a.isProject ? -1 : 1
      return b.total - a.total
    })

  const totals = groups.reduce((acc, g) => {
    acc.total += g.total
    acc.exitCount += g.exitCount
    acc.unitCount += g.unitCount
    acc.estimatedLines += g.estimatedLines
    return acc
  }, { total: 0, exitCount: 0, unitCount: 0, estimatedLines: 0 })
  totals.total = Math.round(totals.total * 100) / 100
  totals.projectCount = groups.filter(g => g.isProject).length

  return { groups, totals }
}
