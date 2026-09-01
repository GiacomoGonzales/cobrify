/**
 * Piezas comunes de los Excel de EMISIÓN MASIVA DE GUÍAS.
 *
 * Salieron del parser de GRE Transportista cuando apareció el de GRE
 * Remitente: leer una celda de exceljs, entender una fecha "19/08/2026",
 * resolver "LIMA/LIMA/SURQUILLO" a su ubigeo y agrupar las filas por número de
 * operación es exactamente lo mismo en los dos, y dos copias de esto se
 * separan solas con el primer arreglo que se haga en una sola.
 *
 * Acá NO hay reglas de negocio de ninguna de las dos guías: cada parser pone
 * las suyas (qué campos exige, qué motivos acepta, qué valida del transporte).
 */
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import { ID_TYPES } from '@/utils/peruUtils'

/** Tope de guías por archivo. Más que esto se parte en varios. */
export const LIMITE_GUIAS = 500
/** Días hacia atrás que SUNAT acepta una guía. */
export const MAX_DIAS_ATRAS = 3

/** RUC/DNI de utilería de las plantillas: si llegan, el archivo no se limpió. */
export const DOCS_DE_EJEMPLO = new Set(['20100047218', '46997122'])

export const TIPO_DOC_A_SISTEMA = { RUC: ID_TYPES.RUC, DNI: ID_TYPES.DNI, CE: ID_TYPES.CE }
/** Código SUNAT del tipo de documento: '1' DNI, '4' CE, '6' RUC. */
export const TIPO_DOC_A_CODIGO = { DNI: '1', CE: '4', RUC: '6' }

/** Mayúsculas, sin espacios de sobra y sin tildes: para comparar textos. */
export const normalizar = (v) => String(v ?? '')
  .trim()
  .toUpperCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')

/** Valor plano de una celda de exceljs (texto enriquecido, fórmulas, fechas). */
export const valorDeCelda = (celda) => {
  const v = celda?.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('')
    if (v.result !== undefined) return v.result
    if (v.text !== undefined) return v.text
    return ''
  }
  return v
}

/**
 * Día de una celda: exceljs entrega Date EN UTC (por eso getUTC*), y el texto
 * "19/08/2026" se parsea a mano. Devuelve null si no es una fecha real —
 * "31/02/2026" no lo es aunque tenga el formato correcto.
 */
export const diaDeCelda = (v) => {
  if (v instanceof Date) return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() }
  const m = String(v ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return null
  const dia = { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) }
  const prueba = new Date(dia.y, dia.m - 1, dia.d)
  return (prueba.getFullYear() === dia.y && prueba.getMonth() === dia.m - 1 && prueba.getDate() === dia.d) ? dia : null
}

export const diaANumero = ({ y, m, d }) => y * 10000 + m * 100 + d
/** Mediodía a propósito: evita que un cambio de huso mueva el día. */
export const diaAFecha = ({ y, m, d }) => new Date(y, m - 1, d, 12, 0, 0)
export const diaLegible = ({ y, m, d }) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
export const diasEntre = (a, b) => Math.round((diaAFecha(b) - diaAFecha(a)) / 86400000)
/** 'YYYY-MM-DD', que es como el modelo de guía guarda las fechas. */
export const diaISO = (dia) => dia
  ? `${dia.y}-${String(dia.m).padStart(2, '0')}-${String(dia.d).padStart(2, '0')}`
  : ''

export const numeroDe = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Texto de celda limpio, sin el ".0" que Excel le pega a los códigos numéricos. */
export const textoDe = (v) => String(v ?? '').trim().replace(/\.0$/, '')

/**
 * "LIMA/LIMA/SURQUILLO" → { ubigeo: '150141', departamento: '15',
 * provincia: '01', distrito: '41' } o { error: 'texto explicando qué no calzó' }.
 * La comparación va sin tildes en ambos lados: el catálogo trae "ÁNCASH" y
 * la gente escribe "ANCASH".
 */
export const resolverUbigeo = (texto) => {
  const partes = String(texto ?? '').split('/').map((p) => normalizar(p)).filter(Boolean)
  if (partes.length !== 3) {
    return { error: 'Escríbelo como DEPARTAMENTO/PROVINCIA/DISTRITO. Ejemplo: LIMA/LIMA/SURQUILLO' }
  }
  const [depTexto, provTexto, distTexto] = partes

  const dep = DEPARTAMENTOS.find((d) => normalizar(d.name) === depTexto)
  if (!dep) return { error: `No existe el departamento "${depTexto}"` }

  const prov = (PROVINCIAS[dep.code] || []).find((p) => normalizar(p.name) === provTexto)
  if (!prov) return { error: `No existe la provincia "${provTexto}" en ${dep.name}` }

  const dist = (DISTRITOS[`${dep.code}${prov.code}`] || []).find((d) => normalizar(d.name) === distTexto)
  if (!dist) return { error: `No existe el distrito "${distTexto}" en ${dep.name}/${prov.name}` }

  return {
    ubigeo: `${dep.code}${prov.code}${dist.code}`,
    departamento: dep.code,
    provincia: prov.code,
    distrito: dist.code,
    legible: `${dep.name}/${prov.name}/${dist.name}`,
  }
}

/**
 * Primera pasada común: lee la hoja, descarta filas vacías y las de ejemplo, y
 * agrupa por N° OPERACIÓN (todas las filas con el mismo número son UNA guía).
 *
 * @param {object} hoja      hoja 'GUIAS' de exceljs
 * @param {Array}  columnas  contrato de la plantilla ({ key } en orden)
 * @param {Array}  clavesDoc claves cuyo valor se compara contra los documentos de ejemplo
 * @returns {{ porOperacion: Map, erroresGlobales: Array, hayFilasDeEjemplo: boolean }}
 */
export const agruparPorOperacion = (hoja, columnas, clavesDoc = []) => {
  const porOperacion = new Map()
  const erroresGlobales = []
  let hayFilasDeEjemplo = false

  const filasConDatos = []
  hoja.eachRow((row, f) => { if (f > 1) filasConDatos.push({ f, row }) })

  for (const { f, row } of filasConDatos) {
    const valores = {}
    let vacia = true
    columnas.forEach((col, i) => {
      const v = valorDeCelda(row.getCell(i + 1))
      valores[col.key] = v
      if (v !== '' && v !== null) vacia = false
    })
    if (vacia) continue

    if (clavesDoc.some((k) => DOCS_DE_EJEMPLO.has(String(valores[k]).trim()))) {
      hayFilasDeEjemplo = true
      continue
    }

    const nOp = numeroDe(valores.N_OPERACION)
    if (nOp === null || nOp <= 0 || !Number.isInteger(nOp)) {
      erroresGlobales.push({ fila: f, columna: 'N° OPERACIÓN', mensaje: 'Falta el número de operación (entero positivo que agrupa las filas de una guía).' })
      continue
    }
    if (!porOperacion.has(nOp)) porOperacion.set(nOp, { filas: [] })
    porOperacion.get(nOp).filas.push({ fila: f, valores })
  }

  if (hayFilasDeEjemplo) {
    erroresGlobales.push({ fila: 2, columna: '', mensaje: 'El archivo todavía tiene las filas de EJEMPLO de la plantilla (en ámbar). Bórralas y vuelve a subirlo.' })
  }

  return { porOperacion, erroresGlobales, hayFilasDeEjemplo }
}
