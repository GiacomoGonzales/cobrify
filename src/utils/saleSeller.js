/**
 * Quién vendió un comprobante.
 *
 * VENDEDOR y CUENTA son cosas distintas y se venían confundiendo:
 *
 * - `sellerId` / `sellerName` es el VENDEDOR que el cajero elige en el selector
 *   del POS. Puede ser una persona sin usuario propio en el sistema (un
 *   mostrador con tres vendedores y una sola caja).
 * - `createdBy` / `createdByName` es la CUENTA con la que se emitió.
 *
 * Reportes agrupaba por la cuenta y Ventas ofrecía un filtro rotulado "Todos los
 * vendedores" que en realidad listaba cuentas. Un dueño que registra las ventas
 * de su equipo veía todo bajo su propio nombre y el vendedor elegido no aparecía
 * en ninguna parte.
 *
 * El criterio vive acá para que las dos pantallas no puedan volver a divergir.
 */

/**
 * @param {Object} invoice
 * @returns {{ id: string, name: string, email: string, isSeller: boolean }}
 *   `isSeller` distingue una fila de vendedor real de una que representa a la
 *   cuenta emisora porque esa venta no llevó vendedor asignado.
 */
export const getSaleSeller = (invoice) => {
  if (invoice?.sellerId) {
    return {
      id: invoice.sellerId,
      name: invoice.sellerName || 'Vendedor sin nombre',
      // Un vendedor del selector no tiene correo: no es una cuenta.
      email: '',
      isSeller: true,
    }
  }
  // Sin vendedor asignado: se cae a la cuenta para que la venta no quede fuera
  // del reporte ni del filtro.
  return {
    id: invoice?.createdBy || 'unknown',
    name: invoice?.createdByName || invoice?.createdByEmail || 'Sin asignar',
    email: invoice?.createdByEmail || '',
    isSeller: false,
  }
}

/** ¿Este comprobante corresponde al vendedor/cuenta `id`? Para filtros. */
export const matchesSaleSeller = (invoice, id) => getSaleSeller(invoice).id === id

/**
 * Lista de vendedores presentes en un conjunto de comprobantes, para poblar un
 * desplegable. Ordenada por nombre y sin repetidos.
 */
export const listSaleSellers = (invoices = []) => {
  const map = new Map()
  for (const inv of invoices) {
    const s = getSaleSeller(inv)
    if (!s.id || s.id === 'unknown') continue
    if (!map.has(s.id)) map.set(s.id, s)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
