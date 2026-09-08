/**
 * PAGOS PENDIENTES POR CLIENTE — lo que pidieron el 8-set-2026:
 * la hora junto a la fecha de cada venta, encontrar al cliente por su nombre
 * comercial, y un ticket por cliente. Acá vive lo que se puede probar sin
 * pantalla; el componente (PendingPaymentsReport) solo lo usa.
 */
import { formatDate, buildSearchHaystack } from '@/lib/utils'

/**
 * "08/09/2026 12:23" — la fecha del comprobante con su hora.
 *
 * `info` es lo que devuelve getInvoiceTimeInfo (utils/invoiceDate): la única
 * hora que existe es la del REGISTRO. Cuando cae en el mismo día que la fecha
 * de emisión (casi siempre) se pega sin más; cuando no —una venta cargada con
 * fecha de ayer— se dice que es la hora de registro, porque "21/08 14:25" se
 * leería como un solo instante y no lo es. Sin `info` no hay hora: mostrar
 * las 12:00 que inventa el orden sería peor que no mostrar nada.
 */
export function etiquetaDeFechaYHora(fecha, info) {
  if (!fecha) return '—'
  const f = formatDate(fecha)
  if (!info?.hora) return f
  if (info.mismoDia) return `${f} ${info.hora}`
  return `${f} (reg. ${info.fechaRegistro} ${info.hora})`
}

// Sin tildes, mayúsculas ni espacios de sobra, para comparar nombres.
const normal = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

/**
 * Todos los nombres con que un cliente aparece en sus comprobantes: la razón
 * social, el nombre comercial, la sede que se eligió al venderle. Un mismo
 * cliente puede tener ventas a nombre de cada una de sus tiendas, y quien
 * cobra busca por la que conoce. En orden de aparición, sin vacíos ni
 * repetidos (mayúsculas, espacios y tildes no cuentan).
 */
export function nombresDelCliente(comprobantes = []) {
  const vistos = new Set()
  const nombres = []
  for (const inv of comprobantes || []) {
    const c = inv?.customer || {}
    for (const candidato of [c.name, c.businessName]) {
      const texto = String(candidato ?? '').trim()
      const k = normal(texto)
      if (!k || vistos.has(k)) continue
      vistos.add(k)
      nombres.push(texto)
    }
  }
  return nombres
}

/** Lo que el buscador compara: documento y todos los nombres, con el criterio del POS. */
export function haystackDeCliente(grupo) {
  return buildSearchHaystack(grupo?.docNumber, ...(grupo?.nombres || []))
}
