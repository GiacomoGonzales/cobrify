/**
 * EMISIÓN MASIVA — parser y validación del Excel de comprobantes (F1).
 *
 * Lee el archivo que el usuario llenó con la plantilla de
 * bulkEmissionTemplateService e importa SUS MISMAS constantes: columnas y
 * valores admitidos no pueden divergir entre lo que se genera y lo que se lee.
 *
 * Filosofía: acá se valida TODO y no se emite NADA. El resultado es la vista
 * previa — operaciones agrupadas con sus totales y cada problema anclado a su
 * fila del Excel, para que el usuario corrija en su archivo y vuelva a subir.
 * Errores bloquean la operación; advertencias informan pero dejan pasar.
 *
 * Los totales calculados acá son DE VISTA PREVIA: la emisión final (fase
 * siguiente) usa los mismos constructores del POS, que son la única fuente de
 * verdad de los montos que van a SUNAT.
 */
import { COLUMNAS_COMPROBANTES, VALORES_COMPROBANTES } from './bulkEmissionTemplateService'
import { validateDocument, ID_TYPES, DETRACTION_TYPES, DETRACTION_MIN_AMOUNT, calcularDetraccion } from '@/utils/peruUtils'
import { esUnidadValida, normalizeSunatUnit, unitDisplayName } from '@/data/sunatUnits'

/** Tope de operaciones por archivo (decisión de diseño: lotes manejables). */
export const LIMITE_OPERACIONES = 500

/**
 * Plazo de envío a SUNAT: hasta 3 días calendario desde la emisión. Más viejo
 * que eso, SUNAT lo rechaza (código 1079 en boletas — lección aprendida) y no
 * tiene sentido dejar que el lote llegue hasta allá.
 */
export const MAX_DIAS_ATRAS = 3

// Afectación de la plantilla → código SUNAT que usa todo el sistema.
const AFECTACION_A_CODIGO = { GRAVADO: '10', EXONERADO: '20', INAFECTO: '30' }

// Firma de las filas de ejemplo de la plantilla (van en ámbar y el usuario
// debe borrarlas; si llegan acá, avisar claro en vez de emitir de mentira).
const DOCS_DE_EJEMPLO = new Set(['20100047218', '46997122'])

/** 'PASAPORTE' (plantilla) → 'PASSPORT' (ID_TYPES del sistema). */
const TIPO_DOC_A_SISTEMA = {
  RUC: ID_TYPES.RUC,
  DNI: ID_TYPES.DNI,
  CE: ID_TYPES.CE,
  PASAPORTE: ID_TYPES.PASSPORT,
}

/** Mayúsculas y sin tildes, para comparar contra las listas del contrato. */
const normalizar = (v) => String(v ?? '')
  .trim()
  .toUpperCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')

/**
 * Valor crudo de una celda de exceljs → primitivo utilizable.
 * exceljs devuelve objetos para texto enriquecido, fórmulas e hipervínculos.
 */
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

/**
 * Fecha de celda → día calendario {y, m, d} o null.
 *
 * exceljs entrega las fechas del Excel como Date EN UTC (el Excel no tiene
 * zona horaria); leerlas con getDate() en una máquina UTC-5 las corre un día.
 * Por eso SIEMPRE componentes UTC para las Date, y parse manual para el que
 * escribió "31/12/2026" como texto.
 */
const diaDeCelda = (v) => {
  if (v instanceof Date) {
    return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() }
  }
  const texto = String(v ?? '').trim()
  const m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return null
  const dia = { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) }
  const prueba = new Date(dia.y, dia.m - 1, dia.d)
  const valida = prueba.getFullYear() === dia.y && prueba.getMonth() === dia.m - 1 && prueba.getDate() === dia.d
  return valida ? dia : null
}

const diaANumero = ({ y, m, d }) => y * 10000 + m * 100 + d
const diaAFecha = ({ y, m, d }) => new Date(y, m - 1, d, 12, 0, 0) // mediodía local: inmune a DST
const diaLegible = ({ y, m, d }) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`

/** Días calendario entre dos días (b - a). */
const diasEntre = (a, b) => Math.round((diaAFecha(b) - diaAFecha(a)) / 86400000)

const numeroDe = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Formato de email: deliberadamente laxo, solo descarta lo que no lo es. */
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Tipo de detracción desde lo que el usuario dejó en la celda.
 *
 * Acepta la etiqueta completa del desplegable ("012 - Intermediación..."), el
 * código suelto ("012" o "12") o el nombre. El código manda: el nombre y la
 * tasa del catálogo 54 cambian con el tiempo y un archivo viejo tiene que
 * seguir funcionando.
 */
const detraccionDeTexto = (crudo) => {
  const texto = String(crudo ?? '').trim()
  if (!texto) return null
  const codigo = texto.match(/^(\d{1,3})/)
  if (codigo) {
    const c = codigo[1].padStart(3, '0')
    const porCodigo = DETRACTION_TYPES.find((t) => t.code === c)
    if (porCodigo) return porCodigo
  }
  const norm = normalizar(texto)
  return DETRACTION_TYPES.find((t) => normalizar(t.name) === norm) || null
}

/**
 * Cuotas desde "15/09/2026:700; 15/10/2026:550".
 *
 * Devuelve { cuotas, errores }: los errores son de FORMATO (lo que no se pudo
 * leer). Que las fechas y la suma sean válidas se valida afuera, donde se
 * conocen la fecha de emisión y el total.
 */
const cuotasDeTexto = (crudo) => {
  const texto = String(crudo ?? '').trim()
  if (!texto) return { cuotas: [], errores: [] }
  const cuotas = []
  const errores = []
  texto.split(/[;\n]/).forEach((parte) => {
    const t = parte.trim()
    if (!t) return
    // Separador ':' o '=' — la fecha ya lleva '/' y el monto puede llevar ','
    const corte = t.lastIndexOf(':') >= 0 ? t.lastIndexOf(':') : t.lastIndexOf('=')
    if (corte < 0) {
      errores.push(`"${t}" no tiene el formato fecha:monto (ejemplo 15/09/2026:500).`)
      return
    }
    const dia = diaDeCelda(t.slice(0, corte).trim())
    const monto = numeroDe(t.slice(corte + 1).trim())
    if (!dia) {
      errores.push(`"${t}": la fecha debe ir como dd/mm/aaaa.`)
      return
    }
    if (monto === null || monto <= 0) {
      errores.push(`"${t}": el monto de la cuota debe ser mayor a 0.`)
      return
    }
    cuotas.push({ dia, monto: Number(monto.toFixed(2)) })
  })
  return { cuotas, errores }
}

/**
 * Índice del catálogo para cruzar CODIGO_PRODUCTO: código, SKU, código de
 * barras y códigos alternativos, del padre y de cada variante. Se arma UNA
 * vez por archivo, no por fila.
 */
const indexarProductos = (products) => {
  const map = new Map()
  const poner = (codigo, entrada) => {
    const k = String(codigo ?? '').trim()
    if (k && !map.has(k)) map.set(k, entrada)
  }
  for (const p of products || []) {
    poner(p.code, { product: p })
    poner(p.sku, { product: p })
    poner(p.barcode, { product: p })
    if (Array.isArray(p.barcodes)) p.barcodes.forEach((b) => poner(b, { product: p }))
    if (Array.isArray(p.variants)) {
      for (const v of p.variants) {
        if (!v) continue
        poner(v.sku, { product: p, variant: v })
        poner(v.barcode, { product: p, variant: v })
      }
    }
  }
  return map
}

/**
 * Parsea y valida el Excel de comprobantes.
 *
 * @param {ArrayBuffer|Uint8Array} buffer - el archivo .xlsx subido
 * @param {object} [ctx]
 * @param {Array}  [ctx.products] - catálogo del negocio, para cruzar códigos y avisar stock
 * @param {number} [ctx.igvRate]  - tasa IGV del negocio (18 salvo excepciones)
 * @param {Array}  [ctx.sellers]  - vendedores registrados, para resolver la columna VENDEDOR
 * @param {string} [ctx.cuentaDetraccion] - cuenta del Banco de la Nación configurada en Ajustes
 * @param {Date}   [ctx.hoy]      - inyectable para pruebas
 * @returns {Promise<{success:boolean, error?:string, operaciones?:Array, errores?:Array, advertencias?:Array, resumen?:object}>}
 *
 * `operaciones[n].errores` / `.advertencias`: `{ fila, columna, mensaje }`,
 * con `fila` = número REAL de fila en el Excel (para que el usuario la ubique).
 */
export async function parsearExcelComprobantes(buffer, { products = [], igvRate = 18, sellers = [], cuentaDetraccion = '', hoy = new Date() } = {}) {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch {
    return { success: false, error: 'El archivo no es un Excel válido (.xlsx). Descarga la plantilla y llénala.' }
  }

  const hoja = wb.getWorksheet('COMPROBANTES')
  if (!hoja) {
    return { success: false, error: 'El archivo no tiene la hoja COMPROBANTES. Usa la plantilla de Cobrify sin cambiarle el nombre a las hojas.' }
  }

  const indice = indexarProductos(products)
  const hoyDia = { y: hoy.getFullYear(), m: hoy.getMonth() + 1, d: hoy.getDate() }

  // ── Pasada 1: filas crudas → operaciones agrupadas ──────────────────────
  const porOperacion = new Map() // nOperacion → { filas: [{fila, valores}] }
  let hayFilasDeEjemplo = false
  const erroresGlobales = []

  // eachRow recorre solo filas con contenido, estén donde estén: los conteos
  // de exceljs (actualRowCount/rowCount) mienten en archivos con validaciones
  // pre-cargadas hasta la fila 1001, como esta plantilla.
  const filasConDatos = []
  hoja.eachRow((row, f) => {
    if (f === 1) return // encabezado
    filasConDatos.push({ f, row })
  })
  for (const { f, row } of filasConDatos) {
    const valores = {}
    let vacia = true
    COLUMNAS_COMPROBANTES.forEach((col, i) => {
      const v = valorDeCelda(row.getCell(i + 1))
      valores[col.key] = v
      if (v !== '' && v !== null) vacia = false
    })
    if (vacia) continue

    if (DOCS_DE_EJEMPLO.has(String(valores.NUM_DOC_CLIENTE).trim())) {
      hayFilasDeEjemplo = true
      continue
    }

    const nOp = numeroDe(valores.N_OPERACION)
    if (nOp === null || nOp <= 0 || !Number.isInteger(nOp)) {
      erroresGlobales.push({ fila: f, columna: 'N° OPERACIÓN', mensaje: 'Falta el número de operación (entero positivo que agrupa las filas de un comprobante).' })
      continue
    }
    if (!porOperacion.has(nOp)) porOperacion.set(nOp, { filas: [] })
    porOperacion.get(nOp).filas.push({ fila: f, valores })
  }

  if (hayFilasDeEjemplo) {
    erroresGlobales.push({ fila: 2, columna: '', mensaje: 'El archivo todavía tiene las filas de EJEMPLO de la plantilla (en ámbar). Bórralas y vuelve a subirlo.' })
  }
  if (porOperacion.size === 0 && erroresGlobales.length === 0) {
    return { success: false, error: 'El archivo no tiene ninguna fila de datos. Llena la hoja COMPROBANTES debajo del encabezado.' }
  }
  if (porOperacion.size > LIMITE_OPERACIONES) {
    return { success: false, error: `El archivo tiene ${porOperacion.size} operaciones y el máximo es ${LIMITE_OPERACIONES}. Divídelo en varios archivos.` }
  }

  // ── Pasada 2: validar cada operación y armar su estructura ──────────────
  const operaciones = []

  for (const [nOp, grupo] of [...porOperacion.entries()].sort((a, b) => a[0] - b[0])) {
    const primera = grupo.filas[0]
    const cab = primera.valores
    const errores = []
    const advertencias = []
    const error = (fila, columna, mensaje) => errores.push({ fila, columna, mensaje })
    const advertir = (fila, columna, mensaje) => advertencias.push({ fila, columna, mensaje })

    // — Cabecera: tipo —
    const tipo = normalizar(cab.TIPO)
    if (!VALORES_COMPROBANTES.TIPO.includes(tipo)) {
      error(primera.fila, 'TIPO', cab.TIPO ? `Tipo "${cab.TIPO}" no válido: FACTURA o BOLETA.` : 'Falta el TIPO (FACTURA o BOLETA) en la primera fila de la operación.')
    }

    // — Cabecera: fecha de emisión —
    let fechaEmision = null
    const dia = diaDeCelda(cab.FECHA_EMISION)
    if (!dia) {
      error(primera.fila, 'FECHA EMISIÓN', 'Falta la fecha de emisión o no tiene formato dd/mm/aaaa.')
    } else {
      const diff = diasEntre(dia, hoyDia) // >0 = pasada, <0 = futura
      if (diff < 0) {
        error(primera.fila, 'FECHA EMISIÓN', `La fecha ${diaLegible(dia)} es futura. SUNAT no acepta comprobantes con fecha adelantada.`)
      } else if (diff > MAX_DIAS_ATRAS) {
        error(primera.fila, 'FECHA EMISIÓN', `La fecha ${diaLegible(dia)} tiene ${diff} días: fuera del plazo de envío a SUNAT (${MAX_DIAS_ATRAS} días). Se rechazaría.`)
      }
      fechaEmision = diaAFecha(dia)
    }

    // — Cabecera: moneda —
    const moneda = normalizar(cab.MONEDA) || 'PEN'
    if (!VALORES_COMPROBANTES.MONEDA.includes(moneda)) {
      error(primera.fila, 'MONEDA', `Moneda "${cab.MONEDA}" no válida: PEN o USD.`)
    }

    // — Cabecera: cliente —
    const tipoDocTexto = normalizar(cab.TIPO_DOC_CLIENTE)
    const numDoc = String(cab.NUM_DOC_CLIENTE ?? '').trim().replace(/\.0$/, '') // Excel a veces numeriza
    const nombre = String(cab.NOMBRE_CLIENTE ?? '').trim()
    const sinDocumento = tipoDocTexto === 'SIN DOCUMENTO'

    if (!VALORES_COMPROBANTES.TIPO_DOC_CLIENTE.includes(tipoDocTexto)) {
      error(primera.fila, 'TIPO DOC. CLIENTE', cab.TIPO_DOC_CLIENTE ? `Tipo de documento "${cab.TIPO_DOC_CLIENTE}" no válido.` : 'Falta el tipo de documento del cliente.')
    } else if (tipo === 'FACTURA' && tipoDocTexto !== 'RUC') {
      error(primera.fila, 'TIPO DOC. CLIENTE', 'Una FACTURA exige cliente con RUC.')
    } else if (tipo === 'BOLETA' && tipoDocTexto === 'RUC') {
      advertir(primera.fila, 'TIPO DOC. CLIENTE', 'Boleta a un RUC: es válido pero no da crédito fiscal. ¿Era factura?')
    }

    if (!sinDocumento && VALORES_COMPROBANTES.TIPO_DOC_CLIENTE.includes(tipoDocTexto)) {
      const tipoSistema = TIPO_DOC_A_SISTEMA[tipoDocTexto]
      const val = validateDocument(tipoSistema, numDoc)
      if (!val.isValid) error(primera.fila, 'N° DOC. CLIENTE', numDoc ? val.message : 'Falta el número de documento del cliente.')
    }
    if (!sinDocumento && !nombre) {
      error(primera.fila, 'NOMBRE / RAZÓN SOCIAL', 'Falta el nombre o razón social del cliente.')
    }

    // — Cabecera: forma de pago —
    let formaPago = normalizar(cab.FORMA_PAGO)
    if (!formaPago) {
      formaPago = 'CONTADO'
      advertir(primera.fila, 'FORMA DE PAGO', 'Sin forma de pago: se asume CONTADO.')
    } else if (!VALORES_COMPROBANTES.FORMA_PAGO.includes(formaPago)) {
      error(primera.fila, 'FORMA DE PAGO', `Forma de pago "${cab.FORMA_PAGO}" no válida: CONTADO o CREDITO.`)
    }

    let metodoPago = null
    let fechaVencimiento = null
    if (formaPago === 'CREDITO') {
      const diaVenc = diaDeCelda(cab.FECHA_VENCIMIENTO)
      if (!diaVenc) {
        error(primera.fila, 'FECHA VENCIM.', 'Una venta al CREDITO necesita fecha de vencimiento (dd/mm/aaaa).')
      } else if (dia && diaANumero(diaVenc) <= diaANumero(dia)) {
        // POSTERIOR, no "no anterior": SUNAT rechaza la cuota que vence el
        // mismo día de la emisión (regla 2801).
        error(primera.fila, 'FECHA VENCIM.', `El vencimiento ${diaLegible(diaVenc)} debe ser POSTERIOR a la fecha de emisión. SUNAT rechaza cuotas que vencen el mismo día.`)
      } else {
        fechaVencimiento = diaAFecha(diaVenc)
      }
    } else if (formaPago === 'CONTADO') {
      metodoPago = normalizar(cab.METODO_PAGO)
      if (!metodoPago) {
        metodoPago = 'EFECTIVO'
        advertir(primera.fila, 'MÉTODO DE PAGO', 'Sin método de pago: se asume EFECTIVO.')
      } else if (!VALORES_COMPROBANTES.METODO_PAGO.includes(metodoPago)) {
        error(primera.fila, 'MÉTODO DE PAGO', `Método "${cab.METODO_PAGO}" no válido: ${VALORES_COMPROBANTES.METODO_PAGO.join(', ')}.`)
      }
    }

    // Cabecera repetida en filas siguientes: solo molesta si CONTRADICE
    for (const { fila, valores } of grupo.filas.slice(1)) {
      for (const [key, etiqueta] of [['TIPO', 'TIPO'], ['NUM_DOC_CLIENTE', 'N° DOC. CLIENTE'], ['MONEDA', 'MONEDA']]) {
        const v = normalizar(valores[key])
        const vCab = normalizar(cab[key])
        if (v && vCab && v !== vCab) {
          advertir(fila, etiqueta, `Esta fila dice "${valores[key]}" pero la operación ${nOp} ya definió "${cab[key]}" en su primera fila. Se usa lo de la primera fila.`)
        }
      }
    }

    // — Ítems —
    const items = []
    for (const { fila, valores } of grupo.filas) {
      const descripcion = String(valores.DESCRIPCION ?? '').trim()
      const cantidad = numeroDe(valores.CANTIDAD)
      const precio = numeroDe(valores.PRECIO_UNITARIO)
      const afectacionTexto = normalizar(valores.AFECTACION) || 'GRAVADO'
      const descuentoItem = numeroDe(valores.DESCUENTO_ITEM) || 0

      if (!descripcion) error(fila, 'DESCRIPCIÓN', 'Falta la descripción del ítem.')
      if (cantidad === null || cantidad <= 0) error(fila, 'CANTIDAD', 'La cantidad debe ser mayor a 0.')
      if (precio === null || precio < 0) error(fila, 'PRECIO UNITARIO', 'Falta el precio unitario.')

      if (!VALORES_COMPROBANTES.AFECTACION.includes(afectacionTexto)) {
        error(fila, 'AFECTACIÓN IGV', `Afectación "${valores.AFECTACION}" no válida: ${VALORES_COMPROBANTES.AFECTACION.join(', ')}.`)
      }
      const esBonificacion = afectacionTexto === 'BONIFICACION'
      if (esBonificacion && !(precio > 0)) {
        // Lección del 3105: una bonificación sin valor referencial genera una
        // línea en 0 que SUNAT rechaza. Acá se corta antes.
        error(fila, 'PRECIO UNITARIO', 'Una BONIFICACIÓN necesita el valor referencial de lo que regalas (mayor a 0). No se cobra, pero SUNAT lo exige declarado.')
      }
      if (descuentoItem < 0) error(fila, 'DSCTO. ÍTEM (S/)', 'El descuento no puede ser negativo.')
      if (!esBonificacion && cantidad > 0 && precio >= 0 && descuentoItem > cantidad * precio) {
        error(fila, 'DSCTO. ÍTEM (S/)', `El descuento (${descuentoItem.toFixed(2)}) supera el total de la línea (${(cantidad * precio).toFixed(2)}).`)
      }

      // Unidad: se valida contra el CATÁLOGO 03 entero, no contra la lista de
      // la plantilla. Antes cualquier código válido que no estuviera en las 16
      // del desplegable (el metro cúbico, por ejemplo) rebotaba la fila. Se
      // acepta la etiqueta "MTQ - METRO CÚBICO", el código pelado y los alias
      // de texto de siempre ("m3", "kg", "litros").
      const unidadTexto = String(valores.UNIDAD ?? '').trim()
      if (unidadTexto && !esUnidadValida(unidadTexto)) {
        error(fila, 'UNIDAD', `Unidad "${valores.UNIDAD}" no válida. Usa el desplegable de la plantilla (NIU para unidades, ZZ para servicios).`)
      }
      const unidadCodigo = unidadTexto ? normalizeSunatUnit(unidadTexto) : 'NIU'

      // Cruce con el catálogo: el código decide si la emisión toca stock
      const codigo = String(valores.CODIGO_PRODUCTO ?? '').trim()
      let productId = null
      let variantSku = null
      let stockDisponible = null
      if (codigo) {
        const match = indice.get(codigo)
        if (match) {
          productId = match.product.id
          variantSku = match.variant?.sku || null
          const stockCrudo = match.variant ? match.variant.stock : match.product.stock
          if (typeof stockCrudo === 'number') {
            stockDisponible = stockCrudo
            if (cantidad > 0 && stockCrudo < cantidad) {
              advertir(fila, 'CÓDIGO PRODUCTO', `"${match.product.name}" tiene stock ${stockCrudo} y se piden ${cantidad}: quedaría en negativo.`)
            }
          }
        } else {
          advertir(fila, 'CÓDIGO PRODUCTO', `El código "${codigo}" no está en tu catálogo: el ítem se emite igual pero NO descuenta stock. Revisa si es un error de tipeo.`)
        }
      }

      items.push({
        fila,
        codigo: codigo || null,
        productId,
        variantSku,
        descripcion,
        cantidad: cantidad ?? 0,
        unidadCodigo,
        unidadTexto: `${unidadCodigo} - ${unitDisplayName(unidadCodigo)}`,
        precioUnitario: precio ?? 0,
        taxAffectation: esBonificacion ? '10' : (AFECTACION_A_CODIGO[afectacionTexto] || '10'),
        isBonificacion: esBonificacion,
        descuentoItem,
        stockDisponible,
      })
    }

    // — Totales de VISTA PREVIA (los definitivos los pone el constructor del POS) —
    const descuentoGlobal = numeroDe(cab.DESCUENTO_GLOBAL) || 0
    let totalGravado = 0
    let totalExonerado = 0
    let totalInafecto = 0
    let valorBonificaciones = 0
    for (const it of items) {
      if (it.isBonificacion) {
        valorBonificaciones += it.cantidad * it.precioUnitario
        continue
      }
      const linea = Math.max(0, it.cantidad * it.precioUnitario - it.descuentoItem)
      if (it.taxAffectation === '20') totalExonerado += linea
      else if (it.taxAffectation === '30') totalInafecto += linea
      else totalGravado += linea
    }
    let total = totalGravado + totalExonerado + totalInafecto
    if (descuentoGlobal < 0) {
      error(primera.fila, 'DSCTO. GLOBAL (S/)', 'El descuento global no puede ser negativo.')
    } else if (descuentoGlobal >= total && total > 0) {
      error(primera.fila, 'DSCTO. GLOBAL (S/)', `El descuento global (${descuentoGlobal.toFixed(2)}) es igual o mayor al total (${total.toFixed(2)}).`)
    } else if (descuentoGlobal > 0) {
      // El descuento global se reparte a prorrata entre las afectaciones
      const factor = (total - descuentoGlobal) / total
      totalGravado *= factor
      totalExonerado *= factor
      totalInafecto *= factor
      total -= descuentoGlobal
    }
    const baseGravada = totalGravado / (1 + igvRate / 100)
    const igv = totalGravado - baseGravada

    if (items.length > 0 && items.every((i) => i.isBonificacion)) {
      error(primera.fila, '', 'La operación solo tiene bonificaciones: un comprobante no puede ser 100% regalo, necesita al menos una línea cobrada.')
    }

    // Boleta sin documento: SUNAT exige identificar al cliente desde S/ 700
    if (sinDocumento && total >= 700 && moneda === 'PEN') {
      error(primera.fila, 'TIPO DOC. CLIENTE', `Boleta de S/ ${total.toFixed(2)}: desde S/ 700 SUNAT exige el DNI del cliente.`)
    }

    // — Email del cliente —
    const email = String(cab.EMAIL_CLIENTE ?? '').trim()
    if (email && !EMAIL_VALIDO.test(email)) {
      error(primera.fila, 'EMAIL CLIENTE', `"${email}" no parece un correo válido.`)
    }

    // — Vendedor —
    // Se resuelve contra los vendedores YA registrados: inventar uno acá
    // dejaría comisiones colgando de un nombre que no existe en ninguna parte.
    let vendedor = null
    const vendedorTexto = String(cab.VENDEDOR ?? '').trim()
    if (vendedorTexto) {
      const buscado = normalizar(vendedorTexto)
      vendedor = sellers.find((v) => normalizar(v.code) === buscado)
        || sellers.find((v) => normalizar(v.name) === buscado)
        || null
      if (!vendedor) {
        const disponibles = sellers.slice(0, 6).map((v) => v.code ? `${v.name} (${v.code})` : v.name).join(', ')
        error(primera.fila, 'VENDEDOR', sellers.length === 0
          ? `No tienes vendedores registrados: quita la columna VENDEDOR o crea el vendedor en Configuración.`
          : `El vendedor "${vendedorTexto}" no está registrado. Los que tienes son: ${disponibles}${sellers.length > 6 ? '…' : ''}.`)
      }
    }

    // — Detracción (SPOT) —
    let detraccion = null
    const detraccionTexto = String(cab.DETRACCION ?? '').trim()
    if (detraccionTexto) {
      const tipoDetraccion = detraccionDeTexto(detraccionTexto)
      if (!tipoDetraccion) {
        error(primera.fila, 'DETRACCIÓN', `"${detraccionTexto}" no está en el catálogo 54 de SUNAT. Elige un valor del desplegable.`)
      } else if (tipo === 'BOLETA') {
        error(primera.fila, 'DETRACCIÓN', 'La detracción solo aplica a FACTURA: una boleta no puede estar sujeta al SPOT.')
      } else {
        // La cuenta puede venir en el archivo o de Ajustes. Sin ninguna de las
        // dos no hay dónde depositar y SUNAT rechaza el XML.
        const cuentaArchivo = String(cab.CUENTA_DETRACCION ?? '').trim().replace(/[\s-]/g, '')
        const cuenta = cuentaArchivo || cuentaDetraccion || ''
        if (!cuenta) {
          error(primera.fila, 'CTA. BANCO NACIÓN', 'Falta la cuenta del Banco de la Nación: ponla en esta columna o configúrala en Ajustes > Cuentas bancarias (tipo "detracciones").')
        }
        // El mínimo general es S/ 700; el transporte de carga (027) baja a 400.
        const minimo = tipoDetraccion.minAmount || DETRACTION_MIN_AMOUNT
        const totalEnSoles = moneda === 'USD' ? null : total
        if (totalEnSoles !== null && totalEnSoles < minimo) {
          advertir(primera.fila, 'DETRACCIÓN', `El total es S/ ${total.toFixed(2)} y el mínimo para detraer es S/ ${minimo}. Se emite con detracción igual, revisa si corresponde.`)
        }
        detraccion = {
          code: tipoDetraccion.code,
          name: tipoDetraccion.name,
          rate: tipoDetraccion.rate,
          bankAccount: cuenta || null,
        }
      }
    } else if (String(cab.CUENTA_DETRACCION ?? '').trim()) {
      advertir(primera.fila, 'CTA. BANCO NACIÓN', 'Pusiste cuenta del Banco de la Nación pero no elegiste tipo de DETRACCIÓN: se ignora.')
    }

    // — Cuotas del crédito —
    let cuotas = []
    const cuotasTexto = String(cab.CUOTAS ?? '').trim()
    if (cuotasTexto) {
      if (formaPago !== 'CREDITO') {
        error(primera.fila, 'CUOTAS', 'Las cuotas son solo para ventas al CREDITO. En una venta al CONTADO no van.')
      } else {
        const leidas = cuotasDeTexto(cuotasTexto)
        leidas.errores.forEach((m) => error(primera.fila, 'CUOTAS', m))
        if (leidas.errores.length === 0) {
          leidas.cuotas.forEach((c) => {
            if (dia && diaANumero(c.dia) <= diaANumero(dia)) {
              error(primera.fila, 'CUOTAS', `La cuota del ${diaLegible(c.dia)} vence el mismo día de la emisión o antes. SUNAT las exige POSTERIORES.`)
            }
          })
          // Lo que se reparte en cuotas es lo que el cliente PAGA: con
          // detracción, el neto (el SPOT lo deposita él en el banco).
          // En USD haría falta el TC del día para saber el neto; ahí la suma
          // no se valida (más abajo se salta la comparación).
          const aRepartir = detraccion && moneda !== 'USD'
            ? Number((total - calcularDetraccion(total, 1, detraccion.rate).doc).toFixed(2))
            : total
          const suma = leidas.cuotas.reduce((a, c) => a + c.monto, 0)
          // Tolerancia de un centavo por cuota: repartir tercios de un total
          // impar nunca cuadra al céntimo.
          const tolerancia = Math.max(0.01, leidas.cuotas.length * 0.01)
          if (moneda !== 'USD' && Math.abs(suma - aRepartir) > tolerancia) {
            error(primera.fila, 'CUOTAS', detraccion
              ? `Las cuotas suman ${suma.toFixed(2)} y con detracción el cliente paga ${aRepartir.toFixed(2)} (el resto lo deposita en el Banco de la Nación).`
              : `Las cuotas suman ${suma.toFixed(2)} y el total del comprobante es ${total.toFixed(2)}.`)
          }
          cuotas = leidas.cuotas.map((c, i) => ({
            number: i + 1,
            amount: c.monto,
            dueDate: diaAFecha(c.dia),
          }))
        }
      }
    }

    operaciones.push({
      nOperacion: nOp,
      filaInicio: primera.fila,
      tipo: tipo === 'FACTURA' ? 'factura' : 'boleta',
      fechaEmision,
      moneda,
      cliente: {
        documentType: sinDocumento ? '' : (TIPO_DOC_A_SISTEMA[tipoDocTexto] || ''),
        documentNumber: sinDocumento ? '' : numDoc,
        name: nombre || 'Cliente varios',
        address: String(cab.DIRECCION_CLIENTE ?? '').trim(),
        email,
      },
      items,
      descuentoGlobal,
      formaPago: formaPago === 'CREDITO' ? 'credito' : 'contado',
      fechaVencimiento,
      cuotas,
      metodoPago,
      vendedor: vendedor ? { id: vendedor.id, name: vendedor.name, code: vendedor.code || null } : null,
      detraccion,
      observaciones: String(cab.OBSERVACIONES ?? '').trim(),
      totales: {
        baseGravada: Number(baseGravada.toFixed(2)),
        igv: Number(igv.toFixed(2)),
        exonerado: Number(totalExonerado.toFixed(2)),
        inafecto: Number(totalInafecto.toFixed(2)),
        bonificaciones: Number(valorBonificaciones.toFixed(2)),
        total: Number(total.toFixed(2)),
        // Detracción: lo que el cliente DEPOSITA en el Banco de la Nación y lo
        // que le queda por pagarte. El total del comprobante no cambia.
        // En USD el depósito depende del TC del día, que se resuelve al emitir.
        ...(detraccion && moneda !== 'USD' ? (() => {
          const d = calcularDetraccion(total, 1, detraccion.rate)
          return { detraccionMonto: d.pen, netoAPagar: Number((total - d.doc).toFixed(2)) }
        })() : {}),
      },
      errores,
      advertencias,
    })
  }

  const errores = [...erroresGlobales, ...operaciones.flatMap((o) => o.errores)]
  const advertencias = operaciones.flatMap((o) => o.advertencias)
  const conErrores = operaciones.filter((o) => o.errores.length > 0).length
  const totalLote = operaciones.reduce((s, o) => s + (o.errores.length ? 0 : o.totales.total), 0)

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
      totalEmitible: Number(totalLote.toFixed(2)),
    },
  }
}
