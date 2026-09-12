/**
 * OPERACIONES DEL DEMO: lo que el visitante puede hacer de verdad.
 *
 * Cada una imita lo que hace el sistema real —incluido descontar el stock del
 * almacén correcto— pero contra el estado en memoria. Devuelven el mismo
 * `{ success, ... }` que los servicios de Firestore para que las pantallas no
 * tengan que distinguir.
 */

import { datosDemo, mutarDemo, enDemo } from './demoStore'

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100
const nuevoId = (prefijo) => `${prefijo}-${Math.random().toString(36).slice(2, 9)}`

/**
 * Lo que el visitante ya hizo, para la guía del demo ("abre una mesa",
 * "cobra"...). Vive dentro de los datos del demo y no en la pantalla: así se
 * guarda y se borra junto con todo lo demás.
 */
const conHito = (d, hito) => (d.hitos?.[hito] ? d.hitos : { ...(d.hitos || {}), [hito]: true })

/** Reparte un cambio de stock sobre los almacenes del producto. */
const aplicarStock = (producto, warehouseId, delta) => {
  const lista = Array.isArray(producto.warehouseStocks) ? [...producto.warehouseStocks] : []
  // Sin almacén indicado, cae en el primero: es lo que hace el POS cuando el
  // negocio tiene uno solo.
  const idx = warehouseId
    ? lista.findIndex((w) => w.warehouseId === warehouseId)
    : 0
  if (idx >= 0 && lista[idx]) {
    lista[idx] = { ...lista[idx], stock: (Number(lista[idx].stock) || 0) + delta }
  }
  const total = lista.reduce((s, w) => s + (Number(w.stock) || 0), 0)
  return { ...producto, warehouseStocks: lista, stock: lista.length > 0 ? total : (Number(producto.stock) || 0) + delta }
}

/** Cantidad vendida por producto en una lista de ítems. */
const cantidadesPorProducto = (items) => {
  const porProducto = new Map()
  for (const it of items || []) {
    if (!it.productId) continue
    porProducto.set(it.productId, (porProducto.get(it.productId) || 0) + (Number(it.quantity) || 0))
  }
  return porProducto
}

// ─────────────────────────────────────────────────────────── productos ──

export function crearProductoDemo(datos) {
  const producto = {
    ...datos,
    id: nuevoId('p'),
    stock: Number(datos.stock) || 0,
    price: Number(datos.price) || 0,
    cost: Number(datos.cost) || 0,
    createdAt: new Date(),
    // Si no le asignaron almacén, se pone todo en el primero para que el POS
    // lo ofrezca (el stock sin almacén no se puede vender).
    warehouseStocks: Array.isArray(datos.warehouseStocks) && datos.warehouseStocks.length > 0
      ? datos.warehouseStocks
      : [{ warehouseId: '1', stock: Number(datos.stock) || 0 }],
  }
  mutarDemo((d) => ({ products: [producto, ...d.products] }))
  return { success: true, id: producto.id, data: producto }
}

export function actualizarProductoDemo(productId, cambios) {
  mutarDemo((d) => ({
    products: d.products.map((p) => (p.id === productId ? { ...p, ...cambios, id: p.id } : p)),
  }))
  return { success: true }
}

export function eliminarProductoDemo(productId) {
  mutarDemo((d) => ({ products: d.products.filter((p) => p.id !== productId) }))
  return { success: true }
}

// ──────────────────────────────────────────────────────────── clientes ──

export function crearClienteDemo(datos) {
  const cliente = { ...datos, id: nuevoId('c'), createdAt: new Date() }
  mutarDemo((d) => ({ customers: [cliente, ...d.customers] }))
  return { success: true, id: cliente.id, data: cliente }
}

export function actualizarClienteDemo(customerId, cambios) {
  mutarDemo((d) => ({
    customers: d.customers.map((c) => (c.id === customerId ? { ...c, ...cambios, id: c.id } : c)),
  }))
  return { success: true }
}

export function eliminarClienteDemo(customerId) {
  mutarDemo((d) => ({ customers: d.customers.filter((c) => c.id !== customerId) }))
  return { success: true }
}

// ───────────────────────────────────────────────────────────── ventas ──

/**
 * Siguiente número de la serie, mirando lo ya emitido en esta sesión.
 * Antes el demo mostraba siempre "F001-00000099": vender dos veces daba el
 * mismo número y se notaba que era de mentira.
 */
function siguienteNumero(invoices, documentType) {
  const serie = documentType === 'factura' ? 'F001' : documentType === 'boleta' ? 'B001' : 'NV01'
  const usados = invoices
    .filter((i) => i.series === serie)
    .map((i) => Number(String(i.number || '').split('-')[1]) || 0)
  const siguiente = (usados.length > 0 ? Math.max(...usados) : 0) + 1
  return { serie, correlativo: siguiente, numero: `${serie}-${String(siguiente).padStart(8, '0')}` }
}

/**
 * Registra una venta: la agrega al historial y DESCUENTA EL STOCK, como el
 * sistema real. Sin el descuento, el visitante vende diez veces el mismo
 * producto y el inventario no se mueve — se nota de inmediato.
 *
 * @param {object} datosVenta - el comprobante que armó el POS
 * @param {string} [warehouseId] - almacén del que sale la mercadería
 */
export function registrarVentaDemo(datosVenta, warehouseId = null) {
  if (!enDemo()) return { success: false, error: 'Fuera del demo' }
  const actuales = datosDemo()
  const { serie, correlativo, numero } = siguienteNumero(actuales.invoices || [], datosVenta.documentType)

  const venta = {
    ...datosVenta,
    id: nuevoId('inv'),
    number: numero,
    series: serie,
    correlativeNumber: correlativo,
    createdAt: datosVenta.createdAt || new Date(),
    status: datosVenta.status || 'paid',
  }

  mutarDemo((d) => {
    // El stock baja por producto, respetando el almacén elegido.
    const porProducto = cantidadesPorProducto(venta.items)

    const products = d.products.map((p) => {
      const cantidad = porProducto.get(p.id)
      if (!cantidad) return p
      // Sin control de stock (servicios) no se descuenta nada.
      if (p.stock === null || p.trackStock === false) return p
      return aplicarStock(p, warehouseId, -cantidad)
    })

    return { products, invoices: [venta, ...d.invoices], hitos: conHito(d, 'cobro') }
  })

  return { success: true, id: venta.id, number: numero, series: serie, correlativeNumber: correlativo }
}

/** Anula una venta y devuelve el stock, como la anulación real. */
export function anularVentaDemo(invoiceId, warehouseId = null) {
  mutarDemo((d) => {
    const venta = d.invoices.find((i) => i.id === invoiceId)
    if (!venta) return null
    const porProducto = cantidadesPorProducto(venta.items)
    const products = d.products.map((p) => {
      const cantidad = porProducto.get(p.id)
      if (!cantidad || p.stock === null || p.trackStock === false) return p
      return aplicarStock(p, warehouseId, cantidad)
    })
    return {
      products,
      invoices: d.invoices.map((i) => (i.id === invoiceId ? { ...i, status: 'cancelled' } : i)),
    }
  })
  return { success: true }
}

// ────────────────────────────────────────────────────────── inventario ──

/** Traslado entre almacenes: sale de uno y entra al otro. */
export function transferirStockDemo(productId, desdeId, haciaId, cantidad) {
  const cant = Number(cantidad) || 0
  if (cant <= 0) return { success: false, error: 'Cantidad inválida' }
  mutarDemo((d) => ({
    products: d.products.map((p) => {
      if (p.id !== productId) return p
      return aplicarStock(aplicarStock(p, desdeId, -cant), haciaId, cant)
    }),
  }))
  return { success: true }
}

/** Merma, consumo interno o cualquier salida sin venta. */
export function descontarStockDemo(productId, warehouseId, cantidad) {
  const cant = Number(cantidad) || 0
  if (cant <= 0) return { success: false, error: 'Cantidad inválida' }
  mutarDemo((d) => ({
    products: d.products.map((p) => (p.id === productId ? aplicarStock(p, warehouseId, -cant) : p)),
  }))
  return { success: true }
}

// ──────────────────────────────────────────────────────────── insumos ──

export function crearInsumoDemo(datos) {
  const insumo = {
    ...datos,
    id: nuevoId('ins'),
    currentStock: Number(datos.currentStock) || 0,
    minimumStock: Number(datos.minimumStock) || 0,
    averageCost: Number(datos.averageCost) || 0,
    createdAt: new Date(),
  }
  mutarDemo((d) => ({ ingredients: [insumo, ...(d.ingredients || [])] }))
  return { success: true, id: insumo.id, data: insumo }
}

export function actualizarInsumoDemo(id, cambios) {
  mutarDemo((d) => ({
    ingredients: (d.ingredients || []).map((i) => (i.id === id ? { ...i, ...cambios, id: i.id } : i)),
  }))
  return { success: true }
}

export function eliminarInsumoDemo(id) {
  mutarDemo((d) => ({ ingredients: (d.ingredients || []).filter((i) => i.id !== id) }))
  return { success: true }
}

// ──────────────────────────────────────────────────────────── recetas ──

/** kg↔g y l↔ml, como `convertUnit` del servicio de insumos; otra unidad pasa igual. */
const convertir = (valor, desde, hacia) => {
  const clave = `${String(desde || '').toLowerCase()}-${String(hacia || '').toLowerCase()}`
  const factor = { 'kg-g': 1000, 'g-kg': 0.001, 'l-ml': 1000, 'ml-l': 0.001 }[clave]
  return factor ? valor * factor : valor
}

/** Costo de la receta con el costo promedio de cada insumo, como `calculateRecipeCost`. */
const costearReceta = (ingredientes, d) => {
  let total = 0
  const lineas = (ingredientes || []).map((ing) => {
    let cantidad = Number(ing.quantity) || 0
    let unitario = 0
    if (ing.ingredientType === 'product') {
      const producto = (d.products || []).find((p) => p.id === ing.ingredientId)
      unitario = Number(producto?.cost || producto?.price) || 0
    } else {
      const insumo = (d.ingredients || []).find((i) => i.id === ing.ingredientId)
      unitario = Number(insumo?.averageCost) || 0
      cantidad = convertir(cantidad, ing.unit, insumo?.purchaseUnit)
    }
    const cost = cantidad * unitario
    total += cost
    return { ...ing, cost }
  })
  return { ingredients: lineas, totalCost: redondear(total) }
}

/** El plato se costea por su receta (costo por porción), como `syncProductCostFromRecipe`. */
const costearPlato = (productos, receta) => productos.map((p) => (p.id === receta.productId
  ? { ...p, cost: redondear(receta.totalCost / (Number(receta.portions) || 1)) }
  : p))

export function crearRecetaDemo(datos) {
  const d = datosDemo()
  if (!d) return { success: false }
  const receta = {
    ...datos,
    ...costearReceta(datos.ingredients, d),
    portions: Number(datos.portions) || 1,
    id: nuevoId('rec'),
    createdAt: new Date(),
  }
  mutarDemo((dd) => ({ recipes: [receta, ...(dd.recipes || [])], products: costearPlato(dd.products, receta) }))
  return { success: true, id: receta.id, totalCost: receta.totalCost }
}

export function actualizarRecetaDemo(id, cambios) {
  const d = datosDemo()
  const actual = (d?.recipes || []).find((r) => r.id === id)
  if (!actual) return { success: false, error: 'Receta no encontrada' }
  const receta = {
    ...actual,
    ...cambios,
    ...costearReceta(cambios.ingredients || actual.ingredients, d),
    portions: Number(cambios.portions ?? actual.portions) || 1,
    id,
  }
  mutarDemo((dd) => ({
    recipes: (dd.recipes || []).map((r) => (r.id === id ? receta : r)),
    products: costearPlato(dd.products, receta),
  }))
  return { success: true, totalCost: receta.totalCost }
}

export function eliminarRecetaDemo(id) {
  mutarDemo((d) => ({ recipes: (d.recipes || []).filter((r) => r.id !== id) }))
  return { success: true }
}

// ──────────────────────────────────────────────────────────── gastos ──

export function crearGastoDemo(datos) {
  const gasto = {
    ...datos,
    id: nuevoId('gas'),
    amount: Number(datos.amount) || 0,
    date: datos.date || new Date(),
    createdAt: new Date(),
  }
  mutarDemo((d) => ({ expenses: [gasto, ...(d.expenses || [])] }))
  return { success: true, id: gasto.id, data: gasto }
}

export function actualizarGastoDemo(id, cambios) {
  mutarDemo((d) => ({
    expenses: (d.expenses || []).map((g) => (g.id === id ? { ...g, ...cambios, id: g.id } : g)),
  }))
  return { success: true }
}

export function eliminarGastoDemo(id) {
  mutarDemo((d) => ({ expenses: (d.expenses || []).filter((g) => g.id !== id) }))
  return { success: true }
}

// ──────────────────────────────────────────────────────────── salón ──
//
// Mesas y órdenes con la MISMA forma que guardan tableService y orderService:
// las pantallas de Mesas, Órdenes y Cocina leen los mismos campos en el demo y
// en una cuenta real, así que una operación que se salta un campo se ve rota.

const nuevoItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

/** Plato de comanda: con su id, su estado de cocina y cuándo salió. */
const itemDeComanda = (it) => ({
  ...it,
  itemId: it.itemId || nuevoItemId(),
  status: it.status || 'pending',
  printedToKitchen: !!it.printedToKitchen,
  firedAt: it.firedAt || new Date(),
})

/**
 * Totales de una orden (precios CON IGV): reaplica el descuento y suma el
 * envío, como `applyDiscountAndRecalc` del servicio real. Las cortesías ya
 * vienen en 0 y se excluyen solas.
 */
const totalesDeOrden = (items, { discount = null, deliveryFee = 0 } = {}) => {
  const facturable = items.reduce(
    (s, it) => s + (Number(it.total ?? (Number(it.price) || 0) * (Number(it.quantity) || 0)) || 0),
    0,
  )
  let descuento = null
  let neto = facturable
  if (discount && facturable > 0) {
    const bruto = discount.type === 'percent'
      ? facturable * ((Number(discount.value) || 0) / 100)
      : (Number(discount.value) || 0)
    const monto = redondear(Math.min(bruto, facturable))
    descuento = { ...discount, amount: monto }
    neto = facturable - monto
  }
  const total = redondear(Math.max(0, neto) + (Number(deliveryFee) || 0))
  const subtotal = redondear(total / 1.18)
  return { subtotal, tax: redondear(total - subtotal), total, discount: descuento }
}

/** Reemplaza la orden y lleva su total a las mesas que la tienen (en un grupo son varias). */
const reemplazarOrden = (d, orden) => ({
  orders: (d.orders || []).map((o) => (o.id === orden.id ? orden : o)),
  tables: (d.tables || []).map((t) => (t.currentOrder === orden.id ? { ...t, amount: orden.total } : t)),
})

/** Una mesa recién liberada: sin orden, sin mozo, sin grupo, sin precuenta. */
const mesaLibre = (t) => ({
  id: t.id,
  number: t.number,
  capacity: t.capacity,
  zone: t.zone,
  ...(t.isBarTab ? { isBarTab: true } : {}),
  status: 'available',
})

/**
 * Siguiente número de orden. Se lleva la cuenta aparte: al cerrar una mesa su
 * orden sale de la lista, y contar la lista repetía números.
 */
const siguienteOrden = (d) => {
  const vistos = (d.orders || []).map((o) => Number(String(o.orderNumber || '').replace(/\D/g, '')) || 0)
  const numero = Math.max(Number(d.ultimaOrden) || 0, 0, ...vistos) + 1
  return { numero, orderNumber: `#${String(numero).padStart(3, '0')}` }
}

/** El número de mesa como lo escribieron: "12" es un número, "Terraza 2" se queda texto. */
const numeroDeMesa = (valor) => {
  const texto = String(valor ?? '').trim()
  return /^\d+$/.test(texto) ? Number(texto) : texto
}

/** Cambia los ítems de una orden y recalcula su total y el de sus mesas. */
function cambiarItems(orderId, cambio) {
  let hecho = false
  mutarDemo((d) => {
    const orden = (d.orders || []).find((o) => o.id === orderId)
    if (!orden) return null
    const items = cambio([...(orden.items || [])])
    hecho = true
    const todoServido = items.length > 0 && items.every((it) => it.status === 'delivered')
    const r = reemplazarOrden(d, { ...orden, items, ...totalesDeOrden(items, orden) })
    return { ...r, tables: r.tables.map((t) => (t.currentOrder === orderId ? { ...t, allItemsServed: todoServido } : t)) }
  })
  return hecho ? { success: true } : { success: false, error: 'Orden no encontrada' }
}

/** Ocupa una mesa y le abre su orden. */
export function ocuparMesaDemo(tableId, { waiterId, waiterName, customerName } = {}) {
  const d = datosDemo()
  const mesa = (d?.tables || []).find((t) => t.id === tableId)
  if (!mesa) return { success: false, error: 'Mesa no encontrada' }
  const { numero, orderNumber } = siguienteOrden(d)
  const orden = {
    id: nuevoId('order'),
    orderNumber,
    tableId,
    tableNumber: mesa.number,
    waiterId: waiterId || null,
    waiterName: waiterName || '',
    customerName: customerName || '',
    orderType: 'dine_in',
    status: 'pending',
    overallStatus: 'active',
    paid: false,
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    createdAt: new Date(),
  }
  mutarDemo((dd) => ({
    ultimaOrden: numero,
    hitos: conHito(dd, 'mesa'),
    orders: [...(dd.orders || []), orden],
    tables: (dd.tables || []).map((t) => (t.id === tableId
      ? { ...t, status: 'occupied', waiter: waiterName || '', waiterId: waiterId || null, startTime: new Date(), amount: 0, currentOrder: orden.id, allItemsServed: false }
      : t)),
  }))
  return { success: true, orderId: orden.id, orderNumber }
}

/**
 * Agrega platos a la orden. Cada ronda entra como líneas nuevas con su propio
 * estado de cocina, como la comanda real: si se sumaran a la línea ya servida,
 * la cocina no se enteraría de lo nuevo.
 */
export function agregarItemsOrdenDemo(orderId, nuevos) {
  if (!orderId || !Array.isArray(nuevos) || nuevos.length === 0) return { success: false }
  let hecho = false
  mutarDemo((d) => {
    const orden = (d.orders || []).find((o) => o.id === orderId)
    if (!orden) return null
    hecho = true
    const items = [
      ...(orden.items || []),
      ...nuevos.map((n) => itemDeComanda({ ...n, status: 'pending', printedToKitchen: false, firedAt: new Date() })),
    ]
    const r = reemplazarOrden(d, { ...orden, items, overallStatus: 'active', ...totalesDeOrden(items, orden) })
    return {
      ...r,
      tables: r.tables.map((t) => (t.currentOrder === orderId ? { ...t, allItemsServed: false } : t)),
      hitos: conHito(d, 'pedido'),
    }
  })
  return hecho ? { success: true } : { success: false, error: 'Orden no encontrada' }
}

/** Pedido sin mesa (para llevar, delivery, en local), como lo arma Órdenes. */
export function crearOrdenDemo(datos) {
  const d = datosDemo()
  if (!d) return { success: false }
  const { numero, orderNumber } = siguienteOrden(d)
  const items = (datos.items || []).map((it) => itemDeComanda({ ...it, status: 'pending', printedToKitchen: false }))
  const base = {
    id: nuevoId('order'),
    orderNumber,
    orderType: datos.orderType || 'takeaway',
    ...(datos.source ? { source: datos.source } : {}),
    customerName: datos.customerName || null,
    customerPhone: datos.customerPhone || null,
    customerAddress: datos.customerAddress || null,
    ...(datos.documentType ? { customerDocumentType: datos.documentType } : {}),
    ...(datos.documentNumber ? { customerDocumentNumber: datos.documentNumber } : {}),
    ...(datos.businessName ? { customerBusinessName: datos.businessName } : {}),
    ...(datos.fiscalAddress ? { customerFiscalAddress: datos.fiscalAddress } : {}),
    ...(datos.brandId ? { brandId: datos.brandId, brandName: datos.brandName || null, brandColor: datos.brandColor || null } : {}),
    deliveryFee: Number(datos.deliveryFee) || 0,
    priority: datos.priority || 'normal',
    paid: !!datos.paid,
    ...(datos.paymentMethod ? { paymentMethod: datos.paymentMethod } : {}),
    status: 'pending',
    overallStatus: 'active',
    items,
    createdAt: new Date(),
  }
  const orden = { ...base, ...totalesDeOrden(items, base) }
  mutarDemo((dd) => ({
    ultimaOrden: numero,
    orders: [...(dd.orders || []), orden],
    hitos: items.length > 0 ? conHito(dd, 'pedido') : dd.hitos,
  }))
  return { success: true, id: orden.id, orderNumber }
}

/** Cambia el estado de la comanda (pendiente → preparando → lista → despachada → entregada). */
export function cambiarEstadoOrdenDemo(orderId, status) {
  mutarDemo((d) => ({
    orders: (d.orders || []).map((o) => (o.id === orderId
      ? {
        ...o,
        status,
        ...(status === 'ready' ? { readyAt: new Date() } : {}),
        ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
      }
      : o)),
    hitos: conHito(d, 'cocina'),
  }))
  return { success: true }
}

/** Estado de UN plato: la cocina lo marca listo y el mozo, servido. */
export function cambiarEstadoItemDemo(orderId, itemId, status) {
  const r = cambiarItems(orderId, (items) => items.map((it) => (it.itemId !== itemId ? it : {
    ...it,
    status,
    ...(status === 'ready' && !it.readyAt ? { readyAt: new Date() } : {}),
    ...(status === 'delivered' && !it.deliveredAt ? { deliveredAt: new Date() } : {}),
  })))
  if (r.success) mutarDemo((d) => ({ hitos: conHito(d, 'cocina') }))
  return r
}

/** Cambia la cantidad de un plato; en cero lo quita, como `updateOrderItemQuantity`. */
export function cambiarCantidadItemDemo(orderId, indice, cantidad) {
  const n = Number(cantidad) || 0
  if (n <= 0) return quitarItemDemo(orderId, indice)
  return cambiarItems(orderId, (items) => items.map((it, i) => (i !== indice
    ? it
    : { ...it, quantity: n, total: redondear((Number(it.price) || 0) * n) })))
}

export function quitarItemDemo(orderId, indice) {
  return cambiarItems(orderId, (items) => items.filter((_, i) => i !== indice))
}

/** Cortesía: el plato queda en la cuenta a S/ 0 y guarda su precio para la precuenta. */
export function cortesiaItemDemo(orderId, indice, marcar, { reason = '', markedBy = null } = {}) {
  return cambiarItems(orderId, (items) => items.map((it, i) => {
    if (i !== indice) return it
    if (marcar) {
      if (it.isCourtesy) return it
      return {
        ...it,
        originalPrice: it.price,
        originalTotal: it.total,
        price: 0,
        total: 0,
        isCourtesy: true,
        ...(reason ? { courtesyReason: reason } : {}),
        courtesyMarkedAt: new Date(),
        ...(markedBy ? { courtesyMarkedBy: markedBy.uid || null, courtesyMarkedByName: markedBy.name || 'Usuario' } : {}),
      }
    }
    if (!it.isCourtesy) return it
    const restaurado = { ...it, price: it.originalPrice ?? it.price, total: it.originalTotal ?? it.total }
    for (const campo of ['originalPrice', 'originalTotal', 'isCourtesy', 'courtesyReason', 'courtesyMarkedAt', 'courtesyMarkedBy', 'courtesyMarkedByName']) {
      delete restaurado[campo]
    }
    return restaurado
  }))
}

/** Descuento a toda la cuenta, en porcentaje o en soles, como `applyOrderDiscount`. */
export function aplicarDescuentoDemo(orderId, { type, value, reason = '', appliedBy = null } = {}) {
  const valor = parseFloat(value)
  if (!['percent', 'amount'].includes(type) || !(valor > 0) || (type === 'percent' && valor > 100)) {
    return { success: false, error: 'Valor de descuento inválido' }
  }
  let resultado = { success: false, error: 'Orden no encontrada' }
  mutarDemo((d) => {
    const orden = (d.orders || []).find((o) => o.id === orderId)
    if (!orden) return null
    const totales = totalesDeOrden(orden.items || [], {
      discount: {
        type,
        value: valor,
        reason: reason || '',
        appliedAt: new Date(),
        appliedBy: appliedBy?.uid || null,
        appliedByName: appliedBy?.name || 'Usuario',
      },
      deliveryFee: orden.deliveryFee,
    })
    if (!totales.discount) {
      resultado = { success: false, error: 'No hay items facturables para aplicar descuento' }
      return null
    }
    resultado = { success: true }
    return reemplazarOrden(d, { ...orden, ...totales })
  })
  return resultado
}

export function quitarDescuentoDemo(orderId) {
  mutarDemo((d) => {
    const orden = (d.orders || []).find((o) => o.id === orderId)
    if (!orden?.discount) return null
    return reemplazarOrden(d, { ...orden, ...totalesDeOrden(orden.items || [], { deliveryFee: orden.deliveryFee }) })
  })
  return { success: true }
}

/** Cambios sueltos en una orden: cliente, repartidor, comanda ya impresa… */
export function actualizarOrdenDemo(orderId, cambios) {
  mutarDemo((d) => {
    if (!(d.orders || []).some((o) => o.id === orderId)) return null
    return { orders: d.orders.map((o) => (o.id === orderId ? { ...o, ...cambios, id: o.id } : o)) }
  })
  return { success: true }
}

/** Corrige el costo del envío de un delivery y recalcula lo que se cobra. */
export function cambiarEnvioDemo(orderId, monto) {
  mutarDemo((d) => {
    const orden = (d.orders || []).find((o) => o.id === orderId)
    if (!orden) return null
    const conEnvio = { ...orden, deliveryFee: Number(monto) || 0 }
    return reemplazarOrden(d, { ...conEnvio, ...totalesDeOrden(conEnvio.items || [], conEnvio) })
  })
  return { success: true }
}

/**
 * Cobrada en el POS. Una orden de mesa se cierra con la mesa; la de delivery o
 * para llevar sigue su camino en cocina hasta "Entregada", como en el real.
 */
export function marcarOrdenPagadaDemo(orderId, { invoiceId = null, invoiceNumber = null } = {}) {
  return actualizarOrdenDemo(orderId, {
    paid: true,
    paidAt: new Date(),
    ...(invoiceId ? { invoiced: true, invoiceId, ...(invoiceNumber ? { invoiceNumber } : {}) } : {}),
  })
}

/** Cierra una orden sin mesa (Órdenes > cerrar sin comprobante). Si tiene mesa, la libera. */
export function completarOrdenDemo(orderId) {
  const orden = (datosDemo()?.orders || []).find((o) => o.id === orderId)
  if (orden?.tableId) return liberarMesaDemo(orden.tableId)
  mutarDemo((d) => ({
    orders: (d.orders || []).map((o) => (o.id === orderId ? { ...o, status: 'delivered', deliveredAt: new Date() } : o)),
  }))
  return { success: true }
}

/**
 * Libera la mesa sin cobrar. Si está unida a otras se liberan todas, y una
 * cuenta de barra desaparece: existe solo mientras el cliente consume.
 */
export function liberarMesaDemo(tableId) {
  mutarDemo((d) => {
    const mesa = (d.tables || []).find((t) => t.id === tableId)
    if (!mesa) return null
    const grupo = new Set(mesa.groupId
      ? d.tables.filter((t) => t.groupId === mesa.groupId).map((t) => t.id)
      : [tableId])
    const ordenes = new Set(d.tables.filter((t) => grupo.has(t.id)).map((t) => t.currentOrder).filter(Boolean))
    return {
      orders: (d.orders || []).filter((o) => !ordenes.has(o.id)),
      tables: d.tables
        .filter((t) => !(grupo.has(t.id) && t.isBarTab))
        .map((t) => (grupo.has(t.id) ? mesaLibre(t) : t)),
    }
  })
  return { success: true }
}

/**
 * Cierra la mesa SIN comprobante: descuenta el stock de lo consumido y la
 * libera. Cuando se cobra en el POS no se usa esta: la venta ya descontó el
 * stock y se libera con `liberarMesaDemo`.
 */
export function cerrarMesaDemo(tableId) {
  const d = datosDemo()
  if (!d) return { success: false }
  const mesa = (d.tables || []).find((t) => t.id === tableId)
  const orden = (d.orders || []).find((o) => o.id === mesa?.currentOrder)
  if (orden?.items?.length) {
    const porProducto = cantidadesPorProducto(orden.items)
    mutarDemo((dd) => ({
      products: dd.products.map((p) => {
        const cantidad = porProducto.get(p.id)
        if (!cantidad || p.stock === null || p.trackStock === false) return p
        return aplicarStock(p, null, -cantidad)
      }),
    }))
  }
  liberarMesaDemo(tableId)
  return { success: true, orden }
}

/** Cobro individual: la mesa sigue abierta con lo que falta pagar. */
export function cobroParcialDemo(orderId, restantes) {
  return cambiarItems(orderId, () => (restantes || []).map(itemDeComanda))
}

/** Cuenta de barra: una "mesa" con el nombre del cliente, que existe mientras consume. */
export function crearCuentaDeBarraDemo(nombre) {
  const numero = String(nombre || '').trim()
  if (!numero) return { success: false, error: 'Ingresa el nombre del cliente' }
  const mesa = { id: nuevoId('t'), number: numero, isBarTab: true, capacity: 1, zone: 'Barra', status: 'available', amount: 0 }
  mutarDemo((d) => ({ tables: [...(d.tables || []), mesa] }))
  return { success: true, id: mesa.id, table: mesa }
}

/** Alta de mesa desde la pantalla de Mesas. */
export function crearMesaDemo({ number, capacity, zone }) {
  const mesa = {
    id: nuevoId('t'),
    number: numeroDeMesa(number),
    capacity: Number(capacity) || 4,
    zone: zone || 'Salón Principal',
    status: 'available',
  }
  mutarDemo((d) => ({ tables: [...(d.tables || []), mesa] }))
  return { success: true, id: mesa.id }
}

export function actualizarMesaDemo(tableId, cambios) {
  mutarDemo((d) => ({
    tables: (d.tables || []).map((t) => (t.id === tableId
      ? { ...t, ...cambios, number: cambios.number !== undefined ? numeroDeMesa(cambios.number) : t.number, id: t.id }
      : t)),
  }))
  return { success: true }
}

export function eliminarMesaDemo(tableId) {
  mutarDemo((d) => ({ tables: (d.tables || []).filter((t) => t.id !== tableId) }))
  return { success: true }
}

export function reservarMesaDemo(tableId, { reservedFor, reservedBy, customerPhone } = {}) {
  mutarDemo((d) => ({
    tables: (d.tables || []).map((t) => (t.id === tableId
      ? {
        ...t,
        status: 'reserved',
        reservedFor: reservedFor || '',
        reservedBy: reservedBy || '',
        ...(customerPhone ? { customerPhone } : {}),
        reservationTime: new Date(),
      }
      : t)),
  }))
  return { success: true }
}

export function cancelarReservaDemo(tableId) {
  mutarDemo((d) => ({ tables: (d.tables || []).map((t) => (t.id === tableId ? mesaLibre(t) : t)) }))
  return { success: true }
}

/** Pasa la mesa (y su orden) a otro mozo. */
export function transferirMesaDemo(tableId, { waiterId, waiterName } = {}) {
  let resultado = { success: false, error: 'Solo se pueden transferir mesas ocupadas' }
  mutarDemo((d) => {
    const mesa = (d.tables || []).find((t) => t.id === tableId)
    if (!mesa || mesa.status !== 'occupied') return null
    resultado = { success: true }
    return {
      tables: d.tables.map((t) => (t.id === tableId ? { ...t, waiter: waiterName || '', waiterId: waiterId || null } : t)),
      orders: (d.orders || []).map((o) => (o.id === mesa.currentOrder ? { ...o, waiterName: waiterName || '', waiterId: waiterId || null } : o)),
    }
  })
  return resultado
}

/** Cambiar de mesa: la orden entera pasa a una mesa libre y la de origen queda disponible. */
export function moverOrdenDemo(origenId, destinoId) {
  let resultado = { success: false, error: 'No se pudo mover la orden' }
  mutarDemo((d) => {
    const origen = (d.tables || []).find((t) => t.id === origenId)
    const destino = (d.tables || []).find((t) => t.id === destinoId)
    if (!origen || origen.status !== 'occupied' || !origen.currentOrder) {
      resultado = { success: false, error: 'La mesa origen no tiene una orden activa' }
      return null
    }
    if (!destino || destino.status !== 'available') {
      resultado = { success: false, error: 'La mesa destino no está disponible' }
      return null
    }
    resultado = { success: true }
    return {
      orders: (d.orders || []).map((o) => (o.id === origen.currentOrder ? { ...o, tableId: destinoId, tableNumber: destino.number } : o)),
      tables: d.tables.map((t) => {
        if (t.id === destinoId) {
          return { ...t, status: 'occupied', currentOrder: origen.currentOrder, waiter: origen.waiter, waiterId: origen.waiterId, startTime: origen.startTime, amount: origen.amount }
        }
        return t.id === origenId ? mesaLibre(t) : t
      }),
    }
  })
  return resultado
}

/**
 * Dividir mesa: parte de los platos pasa a otra mesa. Si la destino ya está
 * ocupada se suman a su orden; si está libre, se abre con una orden nueva.
 */
export function dividirMesaDemo(origenId, destinoId, { itemsToMove = [], itemsToKeep = [] } = {}) {
  if (itemsToMove.length === 0) return { success: false, error: 'No se seleccionaron items para mover' }
  if (itemsToKeep.length === 0) return { success: false, error: 'No puedes mover todos los items. Usa "Cambiar Mesa" en su lugar.' }
  const d = datosDemo()
  const origen = (d?.tables || []).find((t) => t.id === origenId)
  const destino = (d?.tables || []).find((t) => t.id === destinoId)
  if (!origen?.currentOrder) return { success: false, error: 'La mesa origen no tiene una orden activa' }
  if (!destino || !['available', 'occupied'].includes(destino.status)) {
    return { success: false, error: 'La mesa destino no está disponible ni ocupada' }
  }

  cambiarItems(origen.currentOrder, () => itemsToKeep.map(itemDeComanda))

  if (destino.status === 'occupied' && destino.currentOrder) {
    return cambiarItems(destino.currentOrder, (items) => [...items, ...itemsToMove.map(itemDeComanda)])
  }

  const { numero, orderNumber } = siguienteOrden(datosDemo())
  const items = itemsToMove.map(itemDeComanda)
  const base = {
    id: nuevoId('order'),
    orderNumber,
    tableId: destinoId,
    tableNumber: destino.number,
    waiterId: origen.waiterId || null,
    waiterName: origen.waiter || '',
    orderType: 'dine_in',
    status: 'pending',
    overallStatus: 'active',
    paid: false,
    items,
    createdAt: new Date(),
  }
  const orden = { ...base, ...totalesDeOrden(items) }
  mutarDemo((dd) => ({
    ultimaOrden: numero,
    orders: [...(dd.orders || []), orden],
    tables: dd.tables.map((t) => (t.id === destinoId
      ? { ...t, status: 'occupied', currentOrder: orden.id, waiter: origen.waiter || '', waiterId: origen.waiterId || null, startTime: new Date(), amount: orden.total, allItemsServed: false }
      : t)),
  }))
  return { success: true }
}

/**
 * Unir mesas en un GRUPO, como `mergeTables`: todas quedan ocupadas con la
 * cuenta de la principal y los platos de las otras pasan a esa cuenta. Si una
 * de las elegidas era principal de otro grupo, se trae el grupo entero.
 */
export function unirMesasDemo(principalId, otrasIds, mozo = null) {
  if (!Array.isArray(otrasIds) || otrasIds.length === 0) return { success: false, error: 'No se seleccionaron mesas para fusionar' }
  let d = datosDemo()
  let principal = (d?.tables || []).find((t) => t.id === principalId)
  if (!principal) return { success: false, error: 'Mesa principal no encontrada' }
  if (principal.status === 'reserved') return { success: false, error: 'La mesa principal está reservada. Cancela la reserva primero.' }
  if (principal.groupId && !principal.isGroupPrimary) {
    return { success: false, error: 'Esta mesa pertenece a un grupo. Fusiona desde la mesa principal del grupo.' }
  }

  // Elegidas + los grupos que arrastran, sin repetir y sin la principal.
  const ids = new Set(otrasIds.filter((id) => id !== principalId))
  for (const id of [...ids]) {
    const t = d.tables.find((x) => x.id === id)
    if (t?.groupId && t.isGroupPrimary && t.groupId !== principalId) {
      d.tables.filter((x) => x.groupId === t.groupId && x.id !== principalId).forEach((x) => ids.add(x.id))
    }
  }
  const otras = d.tables.filter((t) => ids.has(t.id))
  const trabada = otras.find((t) => !['occupied', 'available'].includes(t.status))
  if (trabada) {
    return { success: false, error: `La mesa ${trabada.number} está ${trabada.status === 'reserved' ? 'reservada' : 'en mantenimiento'} y no se puede unir` }
  }

  if (principal.status === 'available') {
    if (!mozo?.waiterId) return { success: false, error: 'Para fusionar mesas vacías debes indicar el mozo del grupo' }
    ocuparMesaDemo(principalId, mozo)
    d = datosDemo()
    principal = d.tables.find((t) => t.id === principalId)
  }

  const ordenPrincipalId = principal.currentOrder
  const numeros = [principal.number, ...otras.map((t) => t.number)]
  mutarDemo((dd) => {
    const ordenesDeOtras = new Set(otras
      .map((t) => (t.status === 'occupied' ? t.currentOrder : null))
      .filter((id) => id && id !== ordenPrincipalId))
    const traidos = []
    for (const o of dd.orders || []) {
      if (!ordenesDeOtras.has(o.id)) continue
      const deMesa = otras.find((t) => t.currentOrder === o.id)
      for (const it of o.items || []) traidos.push(itemDeComanda({ ...it, mergedFromTableNumber: deMesa?.number, mergedFromOrderId: o.id }))
    }
    const actual = (dd.orders || []).find((o) => o.id === ordenPrincipalId)
    const items = [...(actual?.items || []), ...traidos]
    const unida = {
      ...actual,
      items,
      overallStatus: 'active',
      linkedTableIds: [principalId, ...otras.map((t) => t.id)],
      linkedTableNumbers: numeros,
      ...totalesDeOrden(items, actual || {}),
    }
    return {
      orders: (dd.orders || []).filter((o) => !ordenesDeOtras.has(o.id)).map((o) => (o.id === ordenPrincipalId ? unida : o)),
      tables: dd.tables.map((t) => {
        if (t.id === principalId) {
          return { ...t, groupId: principalId, isGroupPrimary: true, groupTableNumbers: numeros, amount: unida.total, allItemsServed: false }
        }
        if (!ids.has(t.id)) return t
        return {
          ...t,
          status: 'occupied',
          currentOrder: ordenPrincipalId,
          groupId: principalId,
          isGroupPrimary: false,
          groupTableNumbers: numeros,
          waiter: principal.waiter || null,
          waiterId: principal.waiterId || null,
          startTime: t.status === 'occupied' ? t.startTime : new Date(),
          amount: unida.total,
          allItemsServed: false,
        }
      }),
    }
  })
  return { success: true, data: { groupId: principalId, totalTables: numeros.length } }
}

/**
 * Separar una mesa de su grupo, como `unmergeTable`. Desde la principal se
 * disuelve el grupo; una secundaria queda libre, y si solo quedaba la
 * principal, el grupo también se disuelve. La cuenta sigue en la principal.
 */
export function separarMesaDemo(tableId) {
  const d = datosDemo()
  const mesa = (d?.tables || []).find((t) => t.id === tableId)
  if (!mesa?.groupId) return { success: false, error: 'Esta mesa no pertenece a ningún grupo' }
  const grupo = d.tables.filter((t) => t.groupId === mesa.groupId)
  const principal = mesa.isGroupPrimary ? mesa : grupo.find((t) => t.isGroupPrimary)
  const sinGrupo = (t) => ({ ...t, groupId: null, isGroupPrimary: false, groupTableNumbers: null })

  if (mesa.isGroupPrimary || grupo.length <= 2) {
    const aLiberar = new Set(mesa.isGroupPrimary ? grupo.filter((t) => t.id !== tableId).map((t) => t.id) : [tableId])
    mutarDemo((dd) => ({
      tables: dd.tables.map((t) => {
        if (aLiberar.has(t.id)) return mesaLibre(t)
        return t.groupId === mesa.groupId ? sinGrupo(t) : t
      }),
      orders: (dd.orders || []).map((o) => (o.id === principal?.currentOrder
        ? { ...o, linkedTableIds: [principal.id], linkedTableNumbers: [principal.number] }
        : o)),
    }))
    return { success: true, data: { dissolved: true } }
  }

  const quedan = grupo.filter((t) => t.id !== tableId)
  const numeros = quedan.map((t) => t.number)
  mutarDemo((dd) => ({
    tables: dd.tables.map((t) => {
      if (t.id === tableId) return mesaLibre(t)
      return t.groupId === mesa.groupId ? { ...t, groupTableNumbers: numeros } : t
    }),
    orders: (dd.orders || []).map((o) => (o.id === principal?.currentOrder
      ? { ...o, linkedTableIds: quedan.map((t) => t.id), linkedTableNumbers: numeros }
      : o)),
  }))
  return { success: true, data: { dissolved: false } }
}

/** La precuenta ya salió: la grilla le pone su marca a la mesa (a todo el grupo si están unidas). */
export function marcarPrecuentaDemo(tableId) {
  mutarDemo((d) => {
    const mesa = (d.tables || []).find((t) => t.id === tableId)
    if (!mesa) return null
    const ids = new Set(mesa.groupId ? d.tables.filter((t) => t.groupId === mesa.groupId).map((t) => t.id) : [tableId])
    return { tables: d.tables.map((t) => (ids.has(t.id) ? { ...t, preBillPrintedAt: new Date() } : t)) }
  })
  return { success: true }
}

// ─────────────────────────────────────────────────────────────── guía ──

/**
 * Plegar o abrir la guía de pasos del demo. Va con los datos del demo: se
 * guarda y se reinicia junto con ellos.
 */
export function plegarGuiaDemo(plegada) {
  mutarDemo(() => ({ guiaPlegada: !!plegada }))
  return { success: true }
}

// ─────────────────────────────────────────────────── equipo del local ──

/** Vendedores y mozos: misma forma, distinta clave del paquete. */
const altaEnLista = (clave, prefijo) => (datos) => {
  const registro = { ...datos, id: nuevoId(prefijo), status: 'active', createdAt: new Date() }
  mutarDemo((d) => ({ [clave]: [registro, ...(d[clave] || [])] }))
  return { success: true, id: registro.id, data: registro }
}
const bajaEnLista = (clave) => (id) => {
  mutarDemo((d) => ({ [clave]: (d[clave] || []).filter((x) => x.id !== id) }))
  return { success: true }
}
const cambioEnLista = (clave) => (id, cambios) => {
  mutarDemo((d) => ({ [clave]: (d[clave] || []).map((x) => (x.id === id ? { ...x, ...cambios, id: x.id } : x)) }))
  return { success: true }
}

export const crearVendedorDemo = altaEnLista('sellers', 'sel')
export const actualizarVendedorDemo = cambioEnLista('sellers')
export const eliminarVendedorDemo = bajaEnLista('sellers')

export const crearMozoDemo = altaEnLista('waiters', 'moz')
export const actualizarMozoDemo = cambioEnLista('waiters')
export const eliminarMozoDemo = bajaEnLista('waiters')

// ─────────────────────────────────────────────────────── stock directo ──

/** Ajuste de inventario a mano (entrada, salida o corrección). */
export function ajustarStockDemo(productId, warehouseId, nuevoStock) {
  mutarDemo((d) => ({
    products: d.products.map((p) => {
      if (p.id !== productId) return p
      const actual = Array.isArray(p.warehouseStocks)
        ? (p.warehouseStocks.find((w) => w.warehouseId === warehouseId)?.stock || 0)
        : (Number(p.stock) || 0)
      return aplicarStock(p, warehouseId, redondear(Number(nuevoStock) - actual))
    }),
  }))
  return { success: true }
}
