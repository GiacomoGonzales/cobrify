/**
 * Motivos de traslado de la GUÍA DEL REMITENTE — catálogo 20 de SUNAT completo.
 *
 * A diferencia del transportista (subconjunto de 6, en
 * [carrierTransferReasons.js]), acá van los 11 motivos: el remitente es el
 * dueño de la mercadería y es quien declara POR QUÉ se mueve. Este motivo SÍ
 * viaja en el XML (`cbc:HandlingCode`), y con "Otros" SUNAT exige además su
 * descripción en texto libre o rechaza con el error 3457.
 */

export const MOTIVOS_TRASLADO_REMITENTE = [
  { code: '01', name: 'Venta' },
  { code: '02', name: 'Compra' },
  { code: '04', name: 'Traslado entre establecimientos de la misma empresa' },
  { code: '05', name: 'Consignación' },
  { code: '08', name: 'Importación' },
  { code: '09', name: 'Exportación' },
  { code: '13', name: 'Otros' },
  { code: '14', name: 'Venta sujeta a confirmación del comprador' },
  { code: '17', name: 'Traslado de bienes para transformación' },
  { code: '18', name: 'Traslado emisor itinerante CP' },
  { code: '19', name: 'Traslado a zona primaria' },
]

/** El que exige descripción en texto libre. */
export const MOTIVO_OTROS = '13'
export const MOTIVO_REMITENTE_POR_DEFECTO = '01'

export const etiquetaMotivoRemitente = (code) =>
  MOTIVOS_TRASLADO_REMITENTE.find(m => m.code === String(code || '').trim())?.name || ''

export const etiquetaConCodigoRemitente = (code) => {
  const nombre = etiquetaMotivoRemitente(code)
  return nombre ? `${code} - ${nombre}` : String(code || '')
}

/** Etiquetas para el desplegable del Excel masivo. */
export const ETIQUETAS_MOTIVO_REMITENTE_EXCEL =
  MOTIVOS_TRASLADO_REMITENTE.map(m => etiquetaConCodigoRemitente(m.code))

/**
 * Código a partir de lo escrito en una celda. Acepta '13', 'Otros' o
 * '13 - Otros', sin tildes ni mayúsculas. null si no lo reconoce.
 */
export const codigoDeMotivoRemitente = (valor) => {
  const limpio = String(valor ?? '').trim()
  if (!limpio) return null
  const sinTildes = (t) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const buscado = sinTildes(limpio)
  const soloCodigo = buscado.split('-')[0].trim()
  return MOTIVOS_TRASLADO_REMITENTE.find(m =>
    m.code === soloCodigo
    || sinTildes(m.name) === buscado
    || sinTildes(etiquetaConCodigoRemitente(m.code)) === buscado
  )?.code || null
}
