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

/**
 * LAS TRES FORMAS DE ESCRIBIR EL MISMO MOTIVO.
 *
 * El nombre oficial no entra en un ticket de 32 caracteres, así que cada
 * formato lo acorta — pero el CÓDIGO y su significado salen de una sola tabla.
 * Tenerlas separadas costó caro: el generador del PDF A4 tenía su propia lista
 * y estaba corrida un código (decía que el 17 era "emisor itinerante" y el 18
 * "zona primaria", cuando son el 18 y el 19). La guía T020-00000094 de JMC, con
 * motivo 18, salía como "Traslado emisor itinerante" en el ticket y como
 * "Traslado a zona primaria" en el A4: la misma guía diciendo dos cosas.
 *
 * Si agregas un motivo, agrégalo en `MOTIVOS_TRASLADO_REMITENTE`; acá solo van
 * los recortes de los que no entran.
 */
const ETIQUETA_BREVE = {
  '04': 'Traslado entre establecimientos',
  '14': 'Venta sujeta a confirmación',
  '17': 'Traslado para transformación',
  '18': 'Traslado emisor itinerante',
}

const ETIQUETA_TERMICA = {
  '04': 'Traslado entre establec.',
  '05': 'Consignacion',
  '08': 'Importacion',
  '09': 'Exportacion',
  '14': 'Venta suj. confirmacion',
  '17': 'Transformacion',
  '18': 'Emisor itinerante',
  '19': 'Zona primaria',
}

/** Para el ticket en pantalla y las casillas del A4 (espacio medio). */
export const etiquetaBreveRemitente = (code) => {
  const c = String(code || '').trim()
  return ETIQUETA_BREVE[c] || etiquetaMotivoRemitente(c)
}

/** Para la impresora térmica: papel angosto y sin tildes. */
export const etiquetaTermicaRemitente = (code) => {
  const c = String(code || '').trim()
  return ETIQUETA_TERMICA[c] || etiquetaBreveRemitente(c)
}

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
