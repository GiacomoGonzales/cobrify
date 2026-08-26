/**
 * Vínculos entre documentos: de dónde salió y en qué terminó.
 *
 * El sistema ya guardaba estos enlaces con el mismo par de campos —
 * `convertedFrom` en el documento destino y `convertedTo` en el de origen, los
 * dos con la forma `{ type, id, number }` — pero los textos de pantalla
 * estaban escritos a mano y decían "nota" para todo. Cuando el vínculo pasó a
 * admitir cotizaciones y guías, esos textos empezaron a mentir: una factura
 * hecha desde una cotización se anunciaba como "Generada desde Nota de Venta".
 *
 * Acá vive el nombre de cada tipo, una sola vez.
 */
import { DOCUMENT_TYPE_LABELS } from '@/utils/documentTypes'

const NOMBRES = {
  ...DOCUMENT_TYPE_LABELS,          // boleta, factura, nota_venta
  quotation: 'Cotización',
  dispatch_guide: 'Guía de Remisión',
  invoice: 'Comprobante',           // valor histórico, sin tipo preciso
}

// Escritos a mano: pegarle una "s" al nombre da "3 Nota de Ventas".
const PLURALES = {
  boleta: 'boletas de venta',
  factura: 'facturas electrónicas',
  nota_venta: 'notas de venta',
  quotation: 'cotizaciones',
  dispatch_guide: 'guías de remisión',
  invoice: 'comprobantes',
}

/** Nombre legible de un tipo de documento vinculado. */
export function nombreDeTipo(type) {
  return NOMBRES[type] || 'Documento'
}

/** Nombre en plural, para cuando el vínculo agrupa varios. */
export function pluralDeTipo(type) {
  return PLURALES[type] || 'documentos'
}

/**
 * El vínculo listo para mostrar, o null si no hay.
 * Devuelve `{ tipo, nombre, numero, id, etiqueta }`, donde `etiqueta` ya trae
 * el número cuando existe: "Cotización C001-000123".
 *
 * Tolera los dos formatos guardados: `{ id }` suelto y `{ ids: [...] }` de
 * cuando un comprobante junta varias notas de venta.
 */
export function vinculoDe(enlace) {
  if (!enlace || typeof enlace !== 'object') return null
  const id = enlace.id || (Array.isArray(enlace.ids) ? enlace.ids[0] : null)
  if (!id && !enlace.number) return null

  const nombre = nombreDeTipo(enlace.type)
  const numero = enlace.number || ''
  const varios = Array.isArray(enlace.ids) && enlace.ids.length > 1

  return {
    tipo: enlace.type || '',
    nombre,
    numero,
    id,
    varios,
    cuantos: varios ? enlace.ids.length : 1,
    etiqueta: varios
      ? `${enlace.ids.length} ${pluralDeTipo(enlace.type)}`
      : (numero ? `${nombre} ${numero}` : nombre),
  }
}

/** "Generado desde Cotización C001-000123" */
export function textoDeOrigen(convertedFrom) {
  const v = vinculoDe(convertedFrom)
  return v ? `Generado desde ${v.etiqueta}` : ''
}

/** "Facturado con Factura F001-00000123" */
export function textoDeDestino(convertedTo) {
  const v = vinculoDe(convertedTo)
  return v ? `Convertida en ${v.etiqueta}` : ''
}
