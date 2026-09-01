/**
 * EMISIÓN MASIVA — parser y validación del Excel de GRE TRANSPORTISTA.
 *
 * Importa el contrato de bulkCarrierGuideTemplateService (columnas + valores)
 * y devuelve las guías agrupadas con cada problema anclado a su fila real del
 * Excel. Acá no se emite nada: es la compuerta de validación.
 *
 * Cada operación sale con la MISMA forma que arma el modal de GRE
 * Transportista (shipper/recipient/origin/destination/vehicles/drivers/items),
 * lista para pasarla a createCarrierDispatchGuide sin traducciones a mitad de
 * camino. Los ubigeos se escriben con nombres ("LIMA/LIMA/SURQUILLO") y acá
 * se resuelven a CÓDIGOS contra el catálogo corregido.
 */
import { COLUMNAS_GRE_TRANSPORTISTA, VALORES_GRE_TRANSPORTISTA } from './bulkCarrierGuideTemplateService'
import { codigoDeMotivo, MOTIVO_TRASLADO_POR_DEFECTO } from '@/utils/carrierTransferReasons'
import { validateDocument, ID_TYPES } from '@/utils/peruUtils'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import { esUnidadValida, normalizeSunatUnit } from '@/data/sunatUnits'

export const LIMITE_GUIAS = 500
export const MAX_DIAS_ATRAS = 3

// Firma de las filas de ejemplo de la plantilla (RUC/DNI de utilería).
const DOCS_DE_EJEMPLO = new Set(['20100047218', '46997122'])

const TIPO_DOC_A_SISTEMA = { RUC: ID_TYPES.RUC, DNI: ID_TYPES.DNI, CE: ID_TYPES.CE }
// El modelo de guía guarda el CÓDIGO SUNAT del tipo de documento del conductor
// y del destinatario ('1' DNI, '6' RUC, '4' CE) en algunos consumidores; el
// modal usa '1' para conductor. Para el destinatario conserva el texto.
const TIPO_DOC_A_CODIGO = { DNI: '1', CE: '4', RUC: '6' }

const normalizar = (v) => String(v ?? '')
  .trim()
  .toUpperCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')

const valorDeCelda = (celda) => {
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

// Fechas: exceljs entrega Date EN UTC; el texto "19/08/2026" se parsea a mano.
const diaDeCelda = (v) => {
  if (v instanceof Date) return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() }
  const m = String(v ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return null
  const dia = { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) }
  const prueba = new Date(dia.y, dia.m - 1, dia.d)
  return (prueba.getFullYear() === dia.y && prueba.getMonth() === dia.m - 1 && prueba.getDate() === dia.d) ? dia : null
}
const diaANumero = ({ y, m, d }) => y * 10000 + m * 100 + d
const diaAFecha = ({ y, m, d }) => new Date(y, m - 1, d, 12, 0, 0)
const diaLegible = ({ y, m, d }) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
const diasEntre = (a, b) => Math.round((diaAFecha(b) - diaAFecha(a)) / 86400000)

const numeroDe = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

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
 * Parsea y valida el Excel de GRE Transportista.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {object} [ctx]
 * @param {Date} [ctx.hoy] - inyectable para pruebas
 * @returns {Promise<{success:boolean, error?:string, operaciones?:Array, errores?:Array, advertencias?:Array, resumen?:object}>}
 */
export async function parsearExcelGreTransportista(buffer, { hoy = new Date() } = {}) {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch {
    return { success: false, error: 'El archivo no es un Excel válido (.xlsx). Descarga la plantilla y llénala.' }
  }

  const hoja = wb.getWorksheet('GUIAS')
  if (!hoja) {
    return { success: false, error: 'El archivo no tiene la hoja GUIAS. Usa la plantilla de GRE Transportista de Cobrify (no la de comprobantes).' }
  }

  const hoyDia = { y: hoy.getFullYear(), m: hoy.getMonth() + 1, d: hoy.getDate() }

  // ── Pasada 1: filas → operaciones agrupadas ─────────────────────────────
  const porOperacion = new Map()
  let hayFilasDeEjemplo = false
  const erroresGlobales = []

  const filasConDatos = []
  hoja.eachRow((row, f) => { if (f > 1) filasConDatos.push({ f, row }) })
  for (const { f, row } of filasConDatos) {
    const valores = {}
    let vacia = true
    COLUMNAS_GRE_TRANSPORTISTA.forEach((col, i) => {
      const v = valorDeCelda(row.getCell(i + 1))
      valores[col.key] = v
      if (v !== '' && v !== null) vacia = false
    })
    if (vacia) continue

    if (DOCS_DE_EJEMPLO.has(String(valores.RUC_REMITENTE).trim()) || DOCS_DE_EJEMPLO.has(String(valores.NUM_DOC_DESTINATARIO).trim())) {
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
  if (porOperacion.size === 0 && erroresGlobales.length === 0) {
    return { success: false, error: 'El archivo no tiene ninguna fila de datos. Llena la hoja GUIAS debajo del encabezado.' }
  }
  if (porOperacion.size > LIMITE_GUIAS) {
    return { success: false, error: `El archivo tiene ${porOperacion.size} guías y el máximo es ${LIMITE_GUIAS}. Divídelo en varios archivos.` }
  }

  // ── Pasada 2: validar y armar cada guía ─────────────────────────────────
  const operaciones = []

  for (const [nOp, grupo] of [...porOperacion.entries()].sort((a, b) => a[0] - b[0])) {
    const primera = grupo.filas[0]
    const cab = primera.valores
    const errores = []
    const advertencias = []
    const error = (fila, columna, mensaje) => errores.push({ fila, columna, mensaje })
    const advertir = (fila, columna, mensaje) => advertencias.push({ fila, columna, mensaje })

    // — Fechas —
    let fechaEmision = null
    const diaEmision = diaDeCelda(cab.FECHA_EMISION)
    if (!diaEmision) {
      error(primera.fila, 'FECHA EMISIÓN', 'Falta la fecha de emisión o no tiene formato dd/mm/aaaa.')
    } else {
      const diff = diasEntre(diaEmision, hoyDia)
      if (diff < 0) error(primera.fila, 'FECHA EMISIÓN', `La fecha ${diaLegible(diaEmision)} es futura.`)
      else if (diff > MAX_DIAS_ATRAS) error(primera.fila, 'FECHA EMISIÓN', `La fecha ${diaLegible(diaEmision)} tiene ${diff} días: fuera del plazo de envío a SUNAT (${MAX_DIAS_ATRAS} días).`)
      fechaEmision = diaAFecha(diaEmision)
    }

    let fechaTraslado = null
    const diaTraslado = diaDeCelda(cab.FECHA_TRASLADO)
    if (!diaTraslado) {
      error(primera.fila, 'FECHA TRASLADO', 'Falta la fecha de inicio del traslado (dd/mm/aaaa).')
    } else {
      if (diaEmision && diaANumero(diaTraslado) < diaANumero(diaEmision)) {
        error(primera.fila, 'FECHA TRASLADO', `El traslado ${diaLegible(diaTraslado)} no puede empezar antes de la emisión.`)
      }
      fechaTraslado = diaAFecha(diaTraslado)
    }

    // — Remitente —
    const rucRemitente = String(cab.RUC_REMITENTE ?? '').trim().replace(/\.0$/, '')
    const razonRemitente = String(cab.RAZON_SOCIAL_REMITENTE ?? '').trim()
    if (!validateDocument(ID_TYPES.RUC, rucRemitente).isValid) {
      error(primera.fila, 'RUC REMITENTE', rucRemitente ? 'RUC del remitente inválido: 11 dígitos que empiezan en 1 o 2.' : 'Falta el RUC del remitente.')
    }
    if (!razonRemitente) error(primera.fila, 'RAZÓN SOCIAL REMITENTE', 'Falta la razón social del remitente.')

    // — Destinatario —
    const tipoDocDest = normalizar(cab.TIPO_DOC_DESTINATARIO)
    const numDocDest = String(cab.NUM_DOC_DESTINATARIO ?? '').trim().replace(/\.0$/, '').toUpperCase()
    const nombreDest = String(cab.NOMBRE_DESTINATARIO ?? '').trim()
    if (!VALORES_GRE_TRANSPORTISTA.TIPO_DOC_DESTINATARIO.includes(tipoDocDest)) {
      error(primera.fila, 'TIPO DOC. DESTINATARIO', cab.TIPO_DOC_DESTINATARIO ? `Tipo "${cab.TIPO_DOC_DESTINATARIO}" no válido: RUC, DNI o CE.` : 'Falta el tipo de documento del destinatario.')
    } else {
      const val = validateDocument(TIPO_DOC_A_SISTEMA[tipoDocDest], numDocDest)
      if (!val.isValid) error(primera.fila, 'N° DOC. DESTINATARIO', numDocDest ? val.message : 'Falta el documento del destinatario.')
    }
    if (!nombreDest) error(primera.fila, 'NOMBRE DESTINATARIO', 'Falta el nombre del destinatario.')

    // — Ruta (direcciones + ubigeos por nombre) —
    const dirPartida = String(cab.DIRECCION_PARTIDA ?? '').trim()
    const dirLlegada = String(cab.DIRECCION_LLEGADA ?? '').trim()
    if (!dirPartida) error(primera.fila, 'DIRECCIÓN PARTIDA', 'Falta la dirección del punto de partida.')
    if (!dirLlegada) error(primera.fila, 'DIRECCIÓN LLEGADA', 'Falta la dirección del punto de llegada.')

    const ubiPartida = resolverUbigeo(cab.UBIGEO_PARTIDA)
    if (ubiPartida.error) error(primera.fila, 'UBIGEO PARTIDA', ubiPartida.error)
    const ubiLlegada = resolverUbigeo(cab.UBIGEO_LLEGADA)
    if (ubiLlegada.error) error(primera.fila, 'UBIGEO LLEGADA', ubiLlegada.error)

    // — Vehículo y conductor —
    const placa = normalizar(cab.PLACA).replace(/[^A-Z0-9]/g, '')
    if (!/^[A-Z0-9]{6,7}$/.test(placa)) {
      error(primera.fila, 'PLACA VEHÍCULO', cab.PLACA ? `Placa "${cab.PLACA}" no parece válida (6 o 7 letras/números).` : 'Falta la placa del vehículo.')
    }
    const dniConductor = String(cab.DNI_CONDUCTOR ?? '').trim().replace(/\.0$/, '')
    const nombresConductor = String(cab.NOMBRES_CONDUCTOR ?? '').trim()
    const apellidosConductor = String(cab.APELLIDOS_CONDUCTOR ?? '').trim()
    const licencia = normalizar(cab.LICENCIA_CONDUCTOR).replace(/\s/g, '')
    if (!validateDocument(ID_TYPES.DNI, dniConductor).isValid) {
      error(primera.fila, 'DNI CONDUCTOR', dniConductor ? 'El DNI del conductor debe tener 8 dígitos.' : 'Falta el DNI del conductor.')
    }
    if (!nombresConductor) error(primera.fila, 'NOMBRES CONDUCTOR', 'Faltan los nombres del conductor.')
    if (!apellidosConductor) error(primera.fila, 'APELLIDOS CONDUCTOR', 'Faltan los apellidos del conductor.')
    if (!/^[A-Z0-9-]{8,12}$/.test(licencia)) {
      error(primera.fila, 'LICENCIA', licencia ? `El brevete "${cab.LICENCIA_CONDUCTOR}" no parece válido. Ejemplo: Q12345678` : 'Falta el brevete del conductor.')
    }

    // — Peso total (primera fila) —
    const peso = numeroDe(cab.PESO_TOTAL_KG)
    if (peso === null || peso <= 0) {
      error(primera.fila, 'PESO TOTAL (KG)', 'Falta el peso bruto total de la guía en kilogramos (mayor a 0), en la primera fila de la operación.')
    }

    // — Motivo del traslado (primera fila) —
    // Opcional: la plantilla vieja no traía la columna y el masivo mandaba
    // "Venta" fijo. Si viene vacía se mantiene ese valor; si viene escrita y
    // no se entiende, se avisa en vez de emitir con un motivo equivocado.
    const motivoCrudo = String(cab.MOTIVO_TRASLADO ?? '').trim()
    let motivo = MOTIVO_TRASLADO_POR_DEFECTO
    if (motivoCrudo) {
      const reconocido = codigoDeMotivo(motivoCrudo)
      if (reconocido) motivo = reconocido
      else error(primera.fila, 'MOTIVO DE TRASLADO', `Motivo "${motivoCrudo}" no válido. Elígelo de la lista de la plantilla.`)
    }
    const descripcionTraslado = String(cab.DESCRIPCION_TRASLADO ?? '').trim().slice(0, 250)

    // — Cargas —
    const items = []
    for (const { fila, valores } of grupo.filas) {
      const descripcion = String(valores.DESCRIPCION_CARGA ?? '').trim()
      const cantidad = numeroDe(valores.CANTIDAD)
      if (!descripcion) error(fila, 'DESCRIPCIÓN DE LA CARGA', 'Falta la descripción de la carga.')
      if (cantidad === null || cantidad <= 0) error(fila, 'CANTIDAD', 'La cantidad debe ser mayor a 0.')

      // Contra el catálogo 03 entero, no contra la lista de la plantilla:
      // mismo criterio que la plantilla de comprobantes.
      const unidadTexto = String(valores.UNIDAD ?? '').trim()
      if (unidadTexto && !esUnidadValida(unidadTexto)) {
        error(fila, 'UNIDAD', `Unidad "${valores.UNIDAD}" no válida. Usa el desplegable de la plantilla.`)
      }
      const unidadCodigo = unidadTexto ? normalizeSunatUnit(unidadTexto) : 'NIU'

      // Los tres códigos son OPCIONALES y ninguno bloquea: el código interno es
      // el único que hoy viaja en el XML (como SellersItemIdentification); el
      // código SUNAT y el GTIN solo se imprimen en la guía. Por eso un formato
      // raro se avisa, no se corta — no puede causar un rechazo de SUNAT.
      const codigoInterno = String(valores.CODIGO_ITEM ?? '').trim().replace(/\.0$/, '')
      if (codigoInterno.length > 30) {
        advertir(fila, 'CÓDIGO INTERNO', `El código "${codigoInterno}" tiene más de 30 caracteres: se enviará recortado a los primeros 30.`)
      }
      const codigoSunat = String(valores.CODIGO_SUNAT ?? '').trim().replace(/\.0$/, '')
      if (codigoSunat && !/^\d{8}$/.test(codigoSunat)) {
        advertir(fila, 'CÓD. SUNAT', `El código SUNAT "${codigoSunat}" no tiene los 8 dígitos del catálogo 25. Se imprime igual en la guía.`)
      }
      const gtin = String(valores.GTIN ?? '').trim().replace(/\.0$/, '')
      if (gtin && !/^\d{8}$|^\d{12,14}$/.test(gtin)) {
        advertir(fila, 'GTIN / EAN', `El GTIN "${gtin}" no tiene 8, 12, 13 ni 14 dígitos. Se imprime igual en la guía.`)
      }

      items.push({
        fila,
        description: descripcion,
        quantity: cantidad ?? 0,
        unit: unidadCodigo,
        code: codigoInterno,
        sunatCode: codigoSunat,
        gtin,
      })
    }

    // Estructura con la MISMA forma que arma el modal de GRE Transportista,
    // para que el emisor la pase a createCarrierDispatchGuide sin traducir.
    operaciones.push({
      nOperacion: nOp,
      filaInicio: primera.fila,
      fechaEmision,
      fechaTraslado,
      guia: {
        documentType: '31',
        issueDate: diaEmision ? `${diaEmision.y}-${String(diaEmision.m).padStart(2, '0')}-${String(diaEmision.d).padStart(2, '0')}` : '',
        transferDate: diaTraslado ? `${diaTraslado.y}-${String(diaTraslado.m).padStart(2, '0')}-${String(diaTraslado.d).padStart(2, '0')}` : '',
        transportType: '02',
        isM1OrLVehicle: false,
        relatedGuides: [],
        shipper: {
          ruc: rucRemitente,
          businessName: razonRemitente,
          address: dirPartida,
          city: '',
          ubigeo: ubiPartida.ubigeo || '',
        },
        recipient: {
          documentType: TIPO_DOC_A_CODIGO[tipoDocDest] || '1',
          documentNumber: numDocDest,
          name: nombreDest,
          address: dirLlegada,
          city: '',
          ubigeo: ubiLlegada.ubigeo || '',
        },
        freightPayer: 'remitente',
        thirdPartyPayer: null,
        transferReason: motivo,
        transferDescription: descripcionTraslado,
        totalWeight: peso ?? 0,
        observations: String(cab.OBSERVACIONES ?? '').trim(),
        origin: {
          address: dirPartida,
          ubigeo: ubiPartida.ubigeo || '',
          departamento: ubiPartida.departamento || '',
          provincia: ubiPartida.provincia || '',
          distrito: ubiPartida.distrito || '',
        },
        destination: {
          address: dirLlegada,
          ubigeo: ubiLlegada.ubigeo || '',
          departamento: ubiLlegada.departamento || '',
          provincia: ubiLlegada.provincia || '',
          distrito: ubiLlegada.distrito || '',
        },
        vehicles: [{ plate: placa, mtcAuthorization: '', mtcEntity: '', tuce: '', isPrincipal: true }],
        vehicle: { plate: placa, mtcAuthorization: '', tuce: '' },
        drivers: [{
          documentType: '1',
          documentNumber: dniConductor,
          name: nombresConductor,
          lastName: apellidosConductor,
          license: licencia,
          isPrincipal: true,
        }],
        driver: {
          documentType: '1',
          documentNumber: dniConductor,
          name: nombresConductor,
          lastName: apellidosConductor,
          license: licencia,
        },
        // La guía no lleva el número de fila del Excel (es dato de la vista previa)
        items: items.map((it) => {
          const copia = { ...it }
          delete copia.fila
          return copia
        }),
      },
      // Lo que la vista previa necesita mostrar sin bucear en `guia`
      resumen: {
        remitente: razonRemitente,
        destinatario: nombreDest,
        ruta: `${ubiPartida.legible || cab.UBIGEO_PARTIDA || '?'} → ${ubiLlegada.legible || cab.UBIGEO_LLEGADA || '?'}`,
        placa: cab.PLACA || '',
        conductor: `${nombresConductor} ${apellidosConductor}`.trim(),
        peso: peso ?? 0,
        cargas: items.length,
      },
      items,
      errores,
      advertencias,
    })
  }

  const errores = [...erroresGlobales, ...operaciones.flatMap((o) => o.errores)]
  const advertencias = operaciones.flatMap((o) => o.advertencias)
  const conErrores = operaciones.filter((o) => o.errores.length > 0).length

  return {
    success: true,
    operaciones,
    errores,
    advertencias,
    resumen: {
      operaciones: operaciones.length,
      items: operaciones.reduce((s, o) => s + o.items.length, 0),
      listas: operaciones.length - conErrores,
      conErrores,
    },
  }
}
