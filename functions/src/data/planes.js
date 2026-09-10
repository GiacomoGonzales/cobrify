/**
 * LOS PLANES QUE SE VENDEN, en un solo sitio.
 *
 * Vivían solo en `src/services/subscriptionService.js`, o sea solo en el
 * navegador. El servidor no conocía ni un precio: los únicos que aparecían por
 * `functions/` estaban dentro de COMENTARIOS. Mientras la venta la hacía una
 * persona daba igual; con un asistente que responde "¿cuánto cuesta?" ya no,
 * porque un precio que el servidor no puede leer es un precio que se inventa.
 *
 * Acá viven los SEIS que se venden hoy. Los planes viejos y heredados siguen en
 * `subscriptionService.js`: no se venden, solo se respetan.
 *
 * Archivo sin imports a propósito, como la semilla y los referidos: lo leen
 * igual Node (las funciones) y Vite (la pantalla). Reexportado en
 * `src/data/planes.js`.
 *
 * PRECIOS: `totalPrice` es lo que el cliente paga de una. `pricePerMonth` es
 * solo para mostrar la comparación, y en los de varios meses viene redondeado.
 */

export const PLANES_VENDIBLES = {
  basico_mensual: {
    name: 'Plan Básico - 1 Mes',
    category: 'qpse', emissionMethod: 'qpse',
    months: 1, pricePerMonth: 19.90, totalPrice: 19.90, precioConIgv: 23.50,
    // 100 comprobantes desde el 24-jul-2026 (antes 500). SOLO para altas y
    // cambios de plan NUEVOS: los clientes antiguos con 500 conservan su límite
    // porque renovar el mismo plan preserva los limits del doc.
    limits: { maxInvoicesPerMonth: 100, maxCustomers: -1, maxProducts: -1, maxBranches: 1, sunatIntegration: true, multiUser: true },
  },
  mensual: {
    name: 'Plan Mensual - 1 Mes',
    category: 'qpse', emissionMethod: 'qpse',
    months: 1, pricePerMonth: 29.90, totalPrice: 29.90, precioConIgv: 35.30,
    limits: { maxInvoicesPerMonth: 1000, maxCustomers: -1, maxProducts: -1, maxBranches: -1, sunatIntegration: true, multiUser: true },
  },
  semestral: {
    name: 'Plan Semestral - 6 Meses',
    category: 'qpse', emissionMethod: 'qpse',
    months: 6, pricePerMonth: 24.98, totalPrice: 149.90, precioConIgv: 176.90,
    limits: { maxInvoicesPerMonth: 1000, maxCustomers: -1, maxProducts: -1, maxBranches: -1, sunatIntegration: true, multiUser: true },
  },
  anual: {
    name: 'Plan Anual - 12 Meses',
    category: 'qpse', emissionMethod: 'qpse',
    months: 12, pricePerMonth: 16.66, totalPrice: 199.90, precioConIgv: 235.90,
    limits: { maxInvoicesPerMonth: 1000, maxCustomers: -1, maxProducts: -1, maxBranches: -1, sunatIntegration: true, multiUser: true },
  },
  ilimitado_mensual: {
    name: 'Plan Ilimitado - 1 Mes',
    category: 'qpse', emissionMethod: 'qpse',
    months: 1, pricePerMonth: 39.90, totalPrice: 39.90, precioConIgv: 47.10,
    limits: { maxInvoicesPerMonth: -1, maxCustomers: -1, maxProducts: -1, maxBranches: -1, sunatIntegration: true, multiUser: true },
  },
  ilimitado_anual: {
    name: 'Plan Ilimitado - 12 Meses',
    category: 'qpse', emissionMethod: 'qpse',
    months: 12, pricePerMonth: 24.99, totalPrice: 299.90, precioConIgv: 353.90,
    limits: { maxInvoicesPerMonth: -1, maxCustomers: -1, maxProducts: -1, maxBranches: -1, sunatIntegration: true, multiUser: true },
  },
}

/**
 * EL IGV NO ESTÁ INCLUIDO, y esto es lo que más cara sale olvidar.
 *
 * `totalPrice` es el precio que se publica y el que se cobra por Plin o Yape a
 * nombre de Giacomo. `precioConIgv` es lo que se cobra cuando el cliente pide
 * FACTURA: entonces paga a la cuenta BCP de QUANTIO SOLUTIONS EIRL y se le
 * suma el 18%.
 *
 * Los montos con IGV NO se calculan multiplicando: están publicados en la
 * página de Términos y Condiciones y ahí van redondeados (19.90 × 1.18 da
 * 23.48, pero lo publicado es 23.50). Cotizar un céntimo distinto del que el
 * cliente va a ver escrito es una discusión que no vale la pena tener.
 */

/** El orden en que se muestran y se ofrecen: de menor a mayor compromiso. */
export const ORDEN_DE_VENTA = [
  'basico_mensual', 'mensual', 'semestral', 'anual',
  'ilimitado_mensual', 'ilimitado_anual',
]

/**
 * Lo que de verdad los diferencia, dicho como se le dice a un cliente.
 *
 * OJO con el Básico: no es "el Mensual pero más barato". Además de los 100
 * comprobantes está limitado a UNA sucursal, y esa segunda limitación es la que
 * se olvida al venderlo. Un ferretero con dos tiendas que toma el Básico
 * creyendo que es lo mismo descubre a los dos días que no puede abrir la
 * segunda, y reclama con razón.
 */
export function comoSeExplica(planId) {
  const p = PLANES_VENDIBLES[planId]
  if (!p) return null
  const comprobantes = p.limits.maxInvoicesPerMonth === -1
    ? 'sin tope de comprobantes'
    : `hasta ${p.limits.maxInvoicesPerMonth} comprobantes al mes`
  const sucursales = p.limits.maxBranches === -1 ? 'sucursales ilimitadas' : 'una sola sucursal'
  return { id: planId, nombre: p.name, precio: p.totalPrice, meses: p.months, comprobantes, sucursales }
}

/**
 * Qué plan le calza a un negocio, según lo ÚNICO que hay que preguntarle:
 * cuántos comprobantes emite al mes y cuántos locales tiene.
 *
 * Devuelve el de entrada que le alcanza. Subir de ahí (semestral, anual) es
 * decisión de plazo y de precio, no de necesidad: los límites son los mismos.
 */
export function planQueLeCalza({ comprobantesAlMes = 0, sucursales = 1 } = {}) {
  const n = Number(comprobantesAlMes) || 0
  if (n > 1000) return 'ilimitado_mensual'
  if (n <= 100 && Number(sucursales) <= 1) return 'basico_mensual'
  return 'mensual'
}
