/**
 * ELEGIR UNA VARIANTE POR SUS ATRIBUTOS, COMO EN CUALQUIER TIENDA.
 *
 * Un producto con variantes se guarda como una LISTA DE COMBINACIONES: cada
 * variante trae su `attributes` ({Talla: 'M', Color: 'Blanco', ...}), su precio
 * y su stock. Mostrar esa lista tal cual es lo que hacía el catálogo, y con
 * catorce combinaciones por modelo el comprador ve catorce filas de texto largo
 * que además **no vienen en el mismo orden** —`Object.entries` respeta el orden
 * en que se guardó cada una, que varía— así que una fila dice
 * "Jersey Algodón 30/1 RX / 2 / Corta" y la siguiente "Corta / Jersey / Color".
 * Ilegible (reporte de CITEX, 6-set-2026).
 *
 * Acá se da vuelta: en vez de N combinaciones, los atributos con sus valores
 * —Talla: 2 4 6 8, Color: Blanco Negro— y el comprador arma la suya. Es como
 * funciona cualquier tienda, y de paso deja ver de un golpe qué tallas hay.
 */

/** Nombre de atributo normalizado, para comparar 'talla' con 'Talla'. */
const clave = (nombre) => String(nombre || '').trim().toLowerCase()

/**
 * Los atributos del producto y sus valores posibles, en orden estable.
 *
 * El ORDEN importa y no puede salir de `Object.keys` de una variante
 * cualquiera: se toma el de la primera variante que menciona cada atributo, y
 * los valores en el orden en que aparecen. Así dos compradores ven lo mismo y
 * la pantalla no se reordena sola al cambiar de producto.
 *
 * @param {Array} variants
 * @returns {Array<{nombre: string, valores: string[]}>}
 */
export function atributosDeVariantes(variants = []) {
  const orden = []
  const porClave = new Map()

  for (const v of variants) {
    for (const [nombre, valor] of Object.entries(v?.attributes || {})) {
      const k = clave(nombre)
      if (!k || valor === undefined || valor === null || valor === '') continue
      if (!porClave.has(k)) {
        porClave.set(k, { nombre, valores: [] })
        orden.push(k)
      }
      const attr = porClave.get(k)
      const texto = String(valor)
      if (!attr.valores.includes(texto)) attr.valores.push(texto)
    }
  }

  return orden.map(k => porClave.get(k))
}

/** El valor que una variante tiene para ese atributo (o null). */
export function valorDeAtributo(variant, nombre) {
  const k = clave(nombre)
  for (const [n, v] of Object.entries(variant?.attributes || {})) {
    if (clave(n) === k) return v === undefined || v === null ? null : String(v)
  }
  return null
}

/**
 * ¿Esta variante coincide con lo elegido hasta ahora?
 * Una selección vacía coincide con todas: sirve para ir filtrando de a poco.
 */
export function coincideConSeleccion(variant, seleccion = {}) {
  return Object.entries(seleccion).every(([nombre, valor]) =>
    !valor || valorDeAtributo(variant, nombre) === String(valor))
}

/**
 * La variante que corresponde a la selección COMPLETA, o null si todavía falta
 * elegir algo (o si esa combinación no existe).
 *
 * @param {Array} variants
 * @param {Object} seleccion - {Talla: 'M', Color: 'Blanco'}
 * @param {Array} atributos - los de `atributosDeVariantes`; se exige uno por cada uno
 */
export function variantePorSeleccion(variants = [], seleccion = {}, atributos = null) {
  const requeridos = atributos || atributosDeVariantes(variants)
  const completa = requeridos.every(a => {
    const elegido = seleccion[a.nombre]
    return elegido !== undefined && elegido !== null && elegido !== ''
  })
  if (!completa) return null
  return variants.find(v => coincideConSeleccion(v, seleccion)) || null
}

/**
 * Qué valores de `atributo` siguen siendo posibles con lo YA elegido en los
 * OTROS atributos.
 *
 * Sirve para apagar la talla que no existe en el color elegido, en vez de
 * dejar que la toque y no pase nada. Se ignora lo elegido en el propio
 * atributo: si no, al elegir M solo quedaría M disponible y no se podría
 * cambiar de opinión.
 *
 * @returns {Set<string>} valores posibles
 */
export function valoresPosibles(variants = [], seleccion = {}, atributo, { conStock = false, stockDe = null } = {}) {
  const otros = { ...seleccion }
  delete otros[atributo]

  const posibles = new Set()
  for (const v of variants) {
    if (!coincideConSeleccion(v, otros)) continue
    if (conStock && stockDe && !(stockDe(v) > 0)) continue
    const valor = valorDeAtributo(v, atributo)
    if (valor !== null) posibles.add(valor)
  }
  return posibles
}

/**
 * Los atributos de TODO un catálogo, para filtrar la lista de productos.
 *
 * Sirve para "muéstrame lo que hay en talla M" sin entrar producto por
 * producto. Solo se devuelven los que tienen más de un valor: un atributo con
 * una sola opción no filtra nada y solo ocupa pantalla.
 *
 * Un catálogo sin variantes —un restaurante, una bodega— devuelve lista vacía y
 * la barra de filtros no se dibuja.
 */
export function atributosDeProductos(productos = []) {
  const todas = []
  for (const p of productos) {
    if (p?.hasVariants && Array.isArray(p.variants)) todas.push(...p.variants)
  }
  return atributosDeVariantes(todas).filter(a => a.valores.length > 1)
}

/**
 * ¿Este producto tiene ALGUNA variante que cumpla todo lo filtrado?
 *
 * Es "alguna" y no "todas" a propósito: al filtrar por talla M, el polo entra
 * si existe en M, aunque también venga en S y en L.
 *
 * Un producto SIN variantes queda fuera en cuanto hay un filtro activo: no
 * tiene tallas, así que no puede estar en la M.
 */
export function productoCoincideConAtributos(producto, filtros = {}) {
  const activos = Object.entries(filtros).filter(([, v]) => v)
  if (activos.length === 0) return true
  if (!producto?.hasVariants || !Array.isArray(producto.variants)) return false
  return producto.variants.some(v => coincideConSeleccion(v, Object.fromEntries(activos)))
}

/**
 * ¿Conviene mostrar selectores por atributo en vez de la lista de combinaciones?
 *
 * Con un solo atributo (Vino: Copa / Botella) la lista de siempre se lee mejor
 * y muestra el precio de cada opción; los selectores lucen cuando hay que cruzar
 * dos o más. También se exige que TODAS las variantes tengan atributos: si
 * alguna solo trae SKU, con selectores quedaría inalcanzable.
 */
export function convieneSelectores(variants = []) {
  if (variants.length < 2) return false
  if (variants.some(v => Object.keys(v?.attributes || {}).length === 0)) return false
  return atributosDeVariantes(variants).length >= 2
}
