/**
 * Motivos de traslado de la GUÍA DEL TRANSPORTISTA (catálogo 20 de SUNAT,
 * subconjunto) — criterio único para el formulario, la lista, el PDF y la
 * emisión masiva.
 *
 * El mismo catálogo estaba escrito a mano en tres archivos. Al sumar el cuarto
 * (la plantilla del Excel masivo) se pasó a un módulo: si mañana se agrega o
 * se renombra un motivo, no puede quedar la mitad del sistema diciendo otra
 * cosa que la otra mitad.
 *
 * OJO — no es lo mismo que el de la guía del REMITENTE, que usa el catálogo 20
 * completo (11 motivos, incluidos "Venta sujeta a confirmación" y "Traslado
 * emisor itinerante"). Acá van solo los que aplican a un transportista.
 *
 * El motivo NO viaja en el XML de la guía del transportista: SUNAT no lo pide
 * en ese documento. Sale impreso en la guía, que es donde el conductor y quien
 * recibe la mercadería lo leen.
 */

export const MOTIVOS_TRASLADO_TRANSPORTISTA = [
  { code: '01', name: 'Venta' },
  { code: '02', name: 'Compra' },
  { code: '04', name: 'Traslado entre establecimientos' },
  { code: '08', name: 'Importación' },
  { code: '09', name: 'Exportación' },
  { code: '13', name: 'Otros' },
]

export const MOTIVO_TRASLADO_POR_DEFECTO = '01'

/** Nombre del motivo: '01' → 'Venta'. Devuelve '' si el código no existe. */
export const etiquetaMotivo = (code) =>
  MOTIVOS_TRASLADO_TRANSPORTISTA.find(m => m.code === String(code || '').trim())?.name || ''

/** Con el código adelante: '01' → '01 - Venta'. Es como se ve en los selectores. */
export const etiquetaConCodigo = (code) => {
  const nombre = etiquetaMotivo(code)
  return nombre ? `${code} - ${nombre}` : String(code || '')
}

/** Las etiquetas para la lista desplegable del Excel masivo. */
export const ETIQUETAS_MOTIVO_EXCEL = MOTIVOS_TRASLADO_TRANSPORTISTA.map(m => etiquetaConCodigo(m.code))

/**
 * Código a partir de lo que el usuario escribió en el Excel. Acepta las tres
 * formas razonables —'01', 'Venta', '01 - Venta'— sin tildes ni mayúsculas,
 * porque escribir a mano en una celda no es elegir de una lista.
 * Devuelve null si no reconoce el valor (el parser lo reporta como error).
 */
export const codigoDeMotivo = (valor) => {
  const limpio = String(valor ?? '').trim()
  if (!limpio) return null
  const sinTildes = (t) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const buscado = sinTildes(limpio)
  const soloCodigo = buscado.split('-')[0].trim()
  return MOTIVOS_TRASLADO_TRANSPORTISTA.find(m =>
    m.code === soloCodigo || sinTildes(m.name) === buscado || sinTildes(etiquetaConCodigo(m.code)) === buscado
  )?.code || null
}
