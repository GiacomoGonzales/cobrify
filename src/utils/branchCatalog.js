/**
 * Catálogo de productos por SUCURSAL (feature opt-in:
 * businessSettings.branchCatalogEnabled).
 *
 * Permite que un producto exista solo en algunas sedes. Hasta ahora el catálogo
 * era global: el POS descargaba todos los productos del negocio y los mostraba
 * en cualquier sucursal.
 *
 * ── El modelo guarda EXCEPCIONES, no permisos ────────────────────────────────
 *   product.hiddenInBranches = ['branchA', 'main', ...]
 *
 * O sea, se guarda en qué sedes NO está, no en cuáles sí. La ausencia significa
 * "disponible en todas". Esa decisión no es cosmética:
 *
 *   - Los productos que ya existen NO necesitan migración: sin el campo, siguen
 *     visibles en todas partes, que es como se comportan hoy.
 *   - Una sucursal NUEVA hereda todo el catálogo automáticamente. Con el modelo
 *     inverso ("disponible en"), abrir una sede obligaria a repasar los miles de
 *     productos existentes para habilitarlos uno por uno.
 *   - Solo se persiste lo que difiere del comportamiento normal, igual que
 *     `branchPrices`.
 *
 * ── Sucursal Principal ───────────────────────────────────────────────────────
 * No tiene documento en `branches`: se identifica por `branchId === null`. Para
 * poder guardarla dentro del arreglo se usa el token 'main', el MISMO que ya
 * usan los permisos por sede de los sub-usuarios (`allowedBranches`).
 *
 * ── Qué NO hace ──────────────────────────────────────────────────────────────
 * Solo controla VISIBILIDAD. No mueve stock ni lo restringe: "este producto es
 * de la sede B" y "su stock está en el almacén de la sede B" son cosas
 * distintas y se configuran por separado. Mezclarlas haría que una casilla mal
 * marcada moviera inventario, que es mucho más caro de arreglar.
 */

/** Token de la Sucursal Principal dentro del arreglo (misma convención que allowedBranches). */
export const MAIN_BRANCH_TOKEN = 'main'

/** Clave de una sucursal: su id, o el token de la Principal cuando es null. */
export const branchKey = (branchId) => branchId || MAIN_BRANCH_TOKEN

/** Sedes ocultas de un producto, saneadas. Siempre devuelve un arreglo. */
export const getHiddenBranches = (product) => {
  const raw = product?.hiddenInBranches
  if (!Array.isArray(raw)) return []
  return raw.map(v => String(v || '').trim()).filter(Boolean)
}

/**
 * ¿Este producto se ve en esta sucursal?
 *
 * @param {Object} product
 * @param {string|null} branchId  null = Sucursal Principal
 */
export const isProductInBranch = (product, branchId) => {
  const ocultas = getHiddenBranches(product)
  if (ocultas.length === 0) return true
  return !ocultas.includes(branchKey(branchId))
}

/**
 * Filtra una lista para una sucursal. Devuelve el MISMO arreglo por referencia
 * cuando no hay nada que filtrar, para no invalidar memos aguas abajo (mismo
 * criterio que applyBranchPricing).
 */
export const filterProductsForBranch = (products, branchId, enabled) => {
  if (!enabled || !Array.isArray(products)) return products
  const alguno = products.some(p => getHiddenBranches(p).length > 0)
  if (!alguno) return products
  return products.filter(p => isProductInBranch(p, branchId))
}

/**
 * Del formulario a Firestore.
 *
 * El formulario razona en positivo ("disponible en estas sedes") porque es como
 * lo piensa el usuario; el almacenamiento es en negativo. Acá se invierte.
 *
 * @param {Array<string>} disponiblesEn  claves elegidas ('main' + ids)
 * @param {Array<Object>} todasLasSedes  sucursales activas del negocio
 * @returns {Array<string>|null} sedes ocultas, o null si está en todas
 */
export const buildHiddenFromSelection = (disponiblesEn, todasLasSedes = []) => {
  const todas = [MAIN_BRANCH_TOKEN, ...todasLasSedes.map(b => b.id)]
  const elegidas = new Set(disponiblesEn || [])
  const ocultas = todas.filter(k => !elegidas.has(k))
  // "En todas" no guarda nada: es el comportamiento por defecto y asi el campo
  // no ensucia los documentos de la mayoria de los negocios.
  return ocultas.length === 0 ? null : ocultas
}

/**
 * De Firestore al formulario. Devuelve las claves DISPONIBLES para marcar los
 * checkboxes.
 */
export const buildSelectionFromHidden = (product, todasLasSedes = []) => {
  const todas = [MAIN_BRANCH_TOKEN, ...todasLasSedes.map(b => b.id)]
  const ocultas = new Set(getHiddenBranches(product))
  return todas.filter(k => !ocultas.has(k))
}

/** ¿El producto está restringido a algunas sedes? Para mostrar un distintivo. */
export const hasBranchRestriction = (product) => getHiddenBranches(product).length > 0

/**
 * Etiqueta corta de las sedes donde SÍ está, para listas y chips.
 * Ej: "Solo Sede Norte" / "3 sucursales".
 */
export const getBranchScopeLabel = (product, todasLasSedes = [], mainBranchName = 'Sucursal Principal') => {
  const ocultas = getHiddenBranches(product)
  if (ocultas.length === 0) return ''
  const nombre = (k) => (k === MAIN_BRANCH_TOKEN
    ? mainBranchName
    : (todasLasSedes.find(b => b.id === k)?.name || 'Sucursal'))
  const disponibles = [MAIN_BRANCH_TOKEN, ...todasLasSedes.map(b => b.id)].filter(k => !ocultas.includes(k))
  if (disponibles.length === 0) return 'Sin sucursales'
  if (disponibles.length === 1) return `Solo ${nombre(disponibles[0])}`
  return `${disponibles.length} sucursales`
}
