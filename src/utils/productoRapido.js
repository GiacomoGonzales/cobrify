/**
 * EL PRODUCTO QUE NACE DE UNA VENTA.
 *
 * En el POS se puede vender algo que no está en el catálogo escribiéndolo a
 * mano ("producto personalizado"). Eso resuelve la venta pero no deja nada: al
 * día siguiente hay que volver a escribirlo igual, y si se escribe distinto los
 * reportes lo cuentan como dos cosas.
 *
 * Con la opción activada, ese mismo producto queda guardado en el catálogo para
 * la próxima vez (pedido de usuario, 03-sep-2026).
 *
 * ── Lo que NO cambia ─────────────────────────────────────────────────────────
 * La venta en curso sigue saliendo como personalizada: mismo ítem, mismo
 * comportamiento, sin movimiento de stock. Guardar el producto es para MAÑANA;
 * meterlo dentro de la venta de hoy cambiaría el descuento de stock de una
 * operación que ya estaba bien.
 *
 * Por eso también nace con `trackStock: false`: lo que se escribe a mano suele
 * ser un servicio o algo de una sola vez. Con control de stock nacería en cero
 * y la primera venta lo dejaría en negativo.
 */

/** Nombre comparable: sin tildes, sin dobles espacios, en mayúsculas. */
const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * ¿El catálogo ya tiene un producto con ese nombre?
 *
 * Se compara por NOMBRE porque es lo único que el vendedor escribió. Sin esto,
 * vender "Flete Lima" tres días seguidos dejaría tres productos iguales.
 */
export function yaEstaEnElCatalogo(productos, nombre) {
  const buscado = normalizar(nombre)
  if (!buscado) return true // sin nombre no hay nada que guardar
  return (Array.isArray(productos) ? productos : []).some(
    p => normalizar(p?.name) === buscado,
  )
}

/**
 * ¿Corresponde guardar este producto personalizado?
 *
 * Una BONIFICACIÓN no: es un regalo puntual, su precio es de referencia y su
 * nombre lleva el sufijo "(BONIFICACIÓN)". Guardarla ensuciaría el catálogo con
 * un producto que nadie va a volver a vender así.
 */
export function sePuedeGuardar(custom, productos) {
  if (!custom?.name || !String(custom.name).trim()) return false
  if (custom.isBonificacion) return false
  return !yaEstaEnElCatalogo(productos, custom.name)
}

/**
 * El producto tal como se va a guardar.
 *
 * Deliberadamente MÍNIMO: solo lo que el vendedor escribió más lo que el
 * catálogo necesita para mostrarlo y volver a venderlo. No se inventan
 * categoría ni código — el producto se encuentra por su nombre, y completarlo
 * bien es una decisión de quien administra el catálogo, no del apuro del
 * mostrador.
 *
 * @param {object} custom  el producto personalizado del POS
 * @param {object} [opciones]
 * @param {number} [opciones.igvRate]  tasa del negocio, para el gravado
 * @returns {object} listo para createProduct()
 */
export function productoDesdePersonalizado(custom, { igvRate = 18 } = {}) {
  const precio = Number(custom?.price) || 0
  const costo = Number(custom?.cost) || 0
  const afectacion = String(custom?.taxAffectation || '10')

  return {
    name: String(custom?.name || '').trim(),
    description: '',
    price: precio,
    cost: costo,
    unit: custom?.unit || 'NIU',
    taxAffectation: afectacion,
    // La tasa solo tiene sentido en lo gravado; en exonerado/inafecto es ruido.
    ...(afectacion === '10' ? { igvRate: Number(custom?.igvRate) || igvRate } : {}),
    category: '',
    code: '',
    sku: '',
    barcode: '',
    stock: 0,
    minStock: 0,
    // Ver la cabecera: sin control de stock, o la primera venta lo deja en rojo.
    trackStock: false,
    isActive: true,
    // De dónde salió. Sirve para reconocerlos después en el catálogo y para
    // saber cuáles conviene completar con categoría, código y costo real.
    createdFrom: 'pos_personalizado',
  }
}
