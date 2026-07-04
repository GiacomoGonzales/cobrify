/**
 * Fecha "oficial" de un comprobante para mostrar/filtrar/ordenar.
 *
 * Prioriza SIEMPRE `emissionDate` (fecha de emisión configurada en el POS) sobre
 * `createdAt` (fecha en que el registro se cargó al sistema). Un comprobante puede
 * emitirse con fecha de junio pero cargarse al sistema en julio (backdated o
 * migrado): en ese caso la fecha que le importa al usuario y a SUNAT es la de
 * emisión, no la de carga.
 *
 * Única fuente de verdad: la usan tanto la página de Ventas (InvoiceList) como
 * el servicio de exportación a Excel, para que lo que se muestra en pantalla y
 * lo que se exporta coincidan exactamente.
 */
export const getInvoiceDate = (invoice) => {
  // Usar emissionDate si existe (fecha de emisión configurada en el POS)
  if (invoice?.emissionDate) {
    if (invoice.emissionDate.toDate) return invoice.emissionDate.toDate()
    if (typeof invoice.emissionDate === 'string') {
      // emissionDate es solo fecha "YYYY-MM-DD", tomar la hora de createdAt
      const createdAt = invoice.createdAt?.toDate?.() || (invoice.createdAt ? new Date(invoice.createdAt) : null)
      if (createdAt) {
        const [year, month, day] = invoice.emissionDate.split('-').map(Number)
        const combined = new Date(createdAt)
        combined.setFullYear(year, month - 1, day)
        return combined
      }
      return new Date(invoice.emissionDate + 'T12:00:00')
    }
    return new Date(invoice.emissionDate)
  }
  // Fallback a createdAt
  if (!invoice?.createdAt) return null
  return invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
}

/**
 * Parsea una fecha "YYYY-MM-DD" (la que emiten los <input type="date">) como fecha
 * LOCAL, no UTC. `new Date("2026-06-01")` la interpreta como medianoche UTC y al
 * mostrarla en Perú (UTC-5) retrocede un día → "31/05/2026". Con esto se mantiene
 * el día elegido por el usuario.
 */
export const parseLocalDateString = (str) => {
  if (!str || typeof str !== 'string') return null
  const [year, month, day] = str.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}
