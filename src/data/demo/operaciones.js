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
    const porProducto = new Map()
    for (const it of venta.items || []) {
      if (!it.productId) continue
      porProducto.set(it.productId, (porProducto.get(it.productId) || 0) + (Number(it.quantity) || 0))
    }

    const products = d.products.map((p) => {
      const cantidad = porProducto.get(p.id)
      if (!cantidad) return p
      // Sin control de stock (servicios) no se descuenta nada.
      if (p.stock === null || p.trackStock === false) return p
      return aplicarStock(p, warehouseId, -cantidad)
    })

    return { products, invoices: [venta, ...d.invoices] }
  })

  return { success: true, id: venta.id, number: numero, series: serie, correlativeNumber: correlativo }
}

/** Anula una venta y devuelve el stock, como la anulación real. */
export function anularVentaDemo(invoiceId, warehouseId = null) {
  mutarDemo((d) => {
    const venta = d.invoices.find((i) => i.id === invoiceId)
    if (!venta) return null
    const porProducto = new Map()
    for (const it of venta.items || []) {
      if (!it.productId) continue
      porProducto.set(it.productId, (porProducto.get(it.productId) || 0) + (Number(it.quantity) || 0))
    }
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
