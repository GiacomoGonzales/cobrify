/**
 * EMISIÓN MASIVA — plantilla de Excel para GRE TRANSPORTISTA (F2, adelantada
 * por pedido urgente de un cliente transportista).
 *
 * Mismo contrato-en-código que la plantilla de comprobantes: las columnas y
 * valores de acá los importa el parser, no pueden divergir. Mismo formato de
 * agrupación: UNA FILA POR ÍTEM DE CARGA, agrupadas por N_OPERACION (una
 * guía con una sola carga = una fila; los datos de cabecera van en la
 * primera fila de cada operación).
 *
 * La SERIE y el NÚMERO los pone el sistema (numeración atómica de
 * 'guia_transportista'). El registro MTC sale de la configuración del negocio.
 * Los UBIGEOS se escriben con nombres — "LIMA/LIMA/SURQUILLO" — y el parser
 * los resuelve contra el catálogo corregido; pedirle códigos de 6 dígitos a
 * un transportista es pedirle errores.
 */
import { etiquetasParaExcel } from '@/data/sunatUnits'
import { ETIQUETAS_MOTIVO_EXCEL } from '@/utils/carrierTransferReasons'

/** Columnas de la hoja GUIAS, en orden. `key` es el nombre técnico. */
export const COLUMNAS_GRE_TRANSPORTISTA = [
  { key: 'N_OPERACION', header: 'N° OPERACIÓN', width: 13, nota: 'Mismo número = misma guía. Una guía con una sola carga es una sola fila.' },
  { key: 'FECHA_EMISION', header: 'FECHA EMISIÓN', width: 14, nota: 'dd/mm/aaaa. Máximo unos días hacia atrás.' },
  { key: 'FECHA_TRASLADO', header: 'FECHA TRASLADO', width: 14, nota: 'dd/mm/aaaa. Cuándo inicia el traslado: el mismo día de la emisión o después.' },
  { key: 'RUC_REMITENTE', header: 'RUC REMITENTE', width: 14, nota: 'RUC de 11 dígitos de quien ENVÍA la mercadería (tu cliente).' },
  { key: 'RAZON_SOCIAL_REMITENTE', header: 'RAZÓN SOCIAL REMITENTE', width: 30, nota: 'Razón social del remitente.' },
  { key: 'TIPO_DOC_DESTINATARIO', header: 'TIPO DOC. DESTINATARIO', width: 18, nota: 'RUC, DNI o CE de quien RECIBE.' },
  { key: 'NUM_DOC_DESTINATARIO', header: 'N° DOC. DESTINATARIO', width: 17, nota: 'RUC: 11 dígitos. DNI: 8 dígitos.' },
  { key: 'NOMBRE_DESTINATARIO', header: 'NOMBRE DESTINATARIO', width: 30, nota: 'Nombre o razón social de quien recibe.' },
  { key: 'DIRECCION_PARTIDA', header: 'DIRECCIÓN PARTIDA', width: 30, nota: 'Dirección del punto de partida.' },
  { key: 'UBIGEO_PARTIDA', header: 'UBIGEO PARTIDA', width: 24, nota: 'DEPARTAMENTO/PROVINCIA/DISTRITO. Ejemplo: LIMA/LIMA/SURQUILLO' },
  { key: 'DIRECCION_LLEGADA', header: 'DIRECCIÓN LLEGADA', width: 30, nota: 'Dirección del punto de llegada.' },
  { key: 'UBIGEO_LLEGADA', header: 'UBIGEO LLEGADA', width: 24, nota: 'DEPARTAMENTO/PROVINCIA/DISTRITO. Ejemplo: AREQUIPA/AREQUIPA/CAYMA' },
  { key: 'PLACA', header: 'PLACA VEHÍCULO', width: 13, nota: 'Placa del vehículo principal. Ejemplo: ABC-123' },
  { key: 'DNI_CONDUCTOR', header: 'DNI CONDUCTOR', width: 13, nota: 'DNI de 8 dígitos del conductor principal.' },
  { key: 'NOMBRES_CONDUCTOR', header: 'NOMBRES CONDUCTOR', width: 20, nota: 'Nombres del conductor.' },
  { key: 'APELLIDOS_CONDUCTOR', header: 'APELLIDOS CONDUCTOR', width: 20, nota: 'Apellidos del conductor.' },
  { key: 'LICENCIA_CONDUCTOR', header: 'LICENCIA', width: 14, nota: 'Número de brevete. Ejemplo: Q12345678' },
  { key: 'CODIGO_ITEM', header: 'CÓDIGO INTERNO', width: 15, nota: 'Opcional. Tu código del producto. Es el único de los tres códigos que hoy viaja en el XML a SUNAT.' },
  { key: 'CODIGO_SUNAT', header: 'CÓD. SUNAT', width: 13, nota: 'Opcional. Código de producto SUNAT (catálogo 25, 8 dígitos). Hoy solo se imprime en la guía.' },
  { key: 'GTIN', header: 'GTIN / EAN', width: 15, nota: 'Opcional. Código de barras del producto (8, 12, 13 o 14 dígitos). Hoy solo se imprime en la guía.' },
  { key: 'DESCRIPCION_CARGA', header: 'DESCRIPCIÓN DE LA CARGA', width: 32, nota: 'Qué se transporta, tal como saldrá en la guía.' },
  { key: 'CANTIDAD', header: 'CANTIDAD', width: 10, nota: 'Cantidad de bultos/unidades de esta fila.' },
  { key: 'UNIDAD', header: 'UNIDAD', width: 16, nota: 'Unidad de medida SUNAT (catálogo 03). Las más usadas están arriba en la lista; NIU para unidades.' },
  { key: 'PESO_TOTAL_KG', header: 'PESO TOTAL (KG)', width: 14, nota: 'Peso bruto TOTAL de la guía en kilogramos. Solo en la primera fila de la operación.' },
  { key: 'MOTIVO_TRASLADO', header: 'MOTIVO DE TRASLADO', width: 34, nota: 'Opcional (si se deja vacío: Venta). Solo en la primera fila de la operación. Sale impreso en la guía; SUNAT no lo pide en la guía del transportista.' },
  { key: 'DESCRIPCION_TRASLADO', header: 'DESCRIPCIÓN DEL TRASLADO', width: 32, nota: 'Opcional. El detalle del motivo, en tus palabras. Úsalo sobre todo con el motivo Otros.' },
  { key: 'OBSERVACIONES', header: 'OBSERVACIONES', width: 26, nota: 'Opcional. Sale en la guía.' },
]

/** Valores admitidos por columna. El parser valida contra ESTAS listas. */
export const VALORES_GRE_TRANSPORTISTA = {
  TIPO_DOC_DESTINATARIO: ['RUC', 'DNI', 'CE'],
  MOTIVO_TRASLADO: ETIQUETAS_MOTIVO_EXCEL,
  // Catálogo 03 completo, no una lista propia: ver etiquetasParaExcel().
  UNIDAD: etiquetasParaExcel(),
}

const AZUL = 'FF1E3A8A'
const AMBAR = 'FFFef3C7'
const GRIS = 'FF6B7280'

/** Genera la plantilla como ArrayBuffer. */
export async function generarPlantillaGreTransportista() {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Cobrify'
  wb.created = new Date()

  // ── Hoja 1: INSTRUCCIONES ────────────────────────────────────────────────
  const hi = wb.addWorksheet('INSTRUCCIONES')
  hi.getColumn(1).width = 4
  hi.getColumn(2).width = 110
  const titulo = hi.getCell('B2')
  titulo.value = 'PLANTILLA DE EMISIÓN MASIVA DE GRE TRANSPORTISTA — COBRIFY'
  titulo.font = { bold: true, size: 14, color: { argb: AZUL } }

  const reglas = [
    '',
    'CÓMO FUNCIONA',
    '1. Cada FILA es una CARGA. Una guía con una sola carga es una sola fila.',
    '2. La columna N° OPERACIÓN agrupa: todas las filas con el mismo número forman UNA guía. Usa 1, 2, 3... en orden.',
    '3. Los datos de la guía (fechas, remitente, destinatario, ruta, vehículo, conductor, peso) van en la PRIMERA fila de cada operación.',
    '4. La SERIE y el NÚMERO de cada guía los asigna el sistema automáticamente. Tu registro MTC sale de tu configuración.',
    '',
    'CÓMO ESCRIBIR LOS UBIGEOS',
    '• Escribe DEPARTAMENTO/PROVINCIA/DISTRITO separados por barras: LIMA/LIMA/SURQUILLO',
    '• El sistema los convierte al código oficial de SUNAT. Si un nombre no calza, te lo dice con la fila exacta.',
    '',
    'REGLAS QUE EL SISTEMA VALIDA ANTES DE EMITIR',
    '• El RUC del remitente y el documento del destinatario se validan como en cualquier guía.',
    '• La fecha de traslado no puede ser anterior a la de emisión.',
    '• Placa, DNI, nombres, apellidos y brevete del conductor son obligatorios.',
    '• El peso total va en kilogramos, solo en la primera fila de cada guía.',
    '',
    'LOS TRES CÓDIGOS DE LA CARGA (todos opcionales)',
    '• CÓDIGO INTERNO: el tuyo. Es el único que hoy viaja en el XML que se envía a SUNAT.',
    '• CÓD. SUNAT y GTIN: se imprimen en la guía para tu control, pero todavía no se envían en el XML.',
    '• Si los dejas vacíos, la guía sale con un guion en esas columnas, igual que ahora.',
    '',
    'DESPUÉS DE LLENAR',
    '• Sube este archivo en Cobrify → Documentos → Emisión Masiva → pestaña GRE Transportista.',
    '• Verás la VISTA PREVIA con los errores por fila. Corriges, vuelves a subir, y cuando todo esté bien presionas Emitir.',
    '• La emisión va EN SERIE, guía por guía, con su resultado de SUNAT al lado.',
    '• Las filas de color ámbar de la hoja GUIAS son EJEMPLOS: bórralas antes de subir el archivo.',
    '',
    'Máximo 500 guías por archivo. ¿Dudas? El manual de uso está en Cobrify → Manual de uso.',
  ]
  const NEGRITAS = new Set(['CÓMO FUNCIONA', 'CÓMO ESCRIBIR LOS UBIGEOS', 'REGLAS QUE EL SISTEMA VALIDA ANTES DE EMITIR', 'LOS TRES CÓDIGOS DE LA CARGA (todos opcionales)', 'DESPUÉS DE LLENAR'])
  reglas.forEach((t, i) => {
    const c = hi.getCell(`B${3 + i}`)
    c.value = t
    c.font = NEGRITAS.has(t)
      ? { bold: true, color: { argb: AZUL } }
      : { size: 11, color: { argb: 'FF111827' } }
    c.alignment = { wrapText: true, vertical: 'top' }
  })

  // ── Hoja 2: GUIAS ────────────────────────────────────────────────────────
  const hc = wb.addWorksheet('GUIAS', { views: [{ state: 'frozen', ySplit: 1 }] })
  hc.columns = COLUMNAS_GRE_TRANSPORTISTA.map((c) => ({ key: c.key, width: c.width }))

  const encabezado = hc.getRow(1)
  COLUMNAS_GRE_TRANSPORTISTA.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1)
    celda.value = c.header
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    celda.note = { texts: [{ text: c.nota }] }
  })
  encabezado.height = 30

  // Filas de EJEMPLO (ámbar): guía simple y guía con dos cargas.
  const hoy = new Date()
  const ejemplos = [
    { N_OPERACION: 1, FECHA_EMISION: hoy, FECHA_TRASLADO: hoy, RUC_REMITENTE: '20100047218', RAZON_SOCIAL_REMITENTE: 'COMERCIAL EJEMPLO S.A.C.', TIPO_DOC_DESTINATARIO: 'RUC', NUM_DOC_DESTINATARIO: '20100047218', NOMBRE_DESTINATARIO: 'DISTRIBUIDORA EJEMPLO S.A.', DIRECCION_PARTIDA: 'Av. Argentina 2020, Callao', UBIGEO_PARTIDA: 'CALLAO/CALLAO/CALLAO', DIRECCION_LLEGADA: 'Av. Ejercito 710', UBIGEO_LLEGADA: 'AREQUIPA/AREQUIPA/CAYMA', PLACA: 'ABC-123', DNI_CONDUCTOR: '46997122', NOMBRES_CONDUCTOR: 'JUAN CARLOS', APELLIDOS_CONDUCTOR: 'QUISPE MAMANI', LICENCIA_CONDUCTOR: 'Q46997122', CODIGO_ITEM: 'ABA-001', CODIGO_SUNAT: '50000000', GTIN: '7501234567890', DESCRIPCION_CARGA: 'Cajas de abarrotes', CANTIDAD: 120, UNIDAD: 'BX - CAJA', PESO_TOTAL_KG: 2400, MOTIVO_TRASLADO: '01 - Venta' },
    { N_OPERACION: 2, FECHA_EMISION: hoy, FECHA_TRASLADO: hoy, RUC_REMITENTE: '20100047218', RAZON_SOCIAL_REMITENTE: 'COMERCIAL EJEMPLO S.A.C.', TIPO_DOC_DESTINATARIO: 'DNI', NUM_DOC_DESTINATARIO: '46997122', NOMBRE_DESTINATARIO: 'MARIA PEREZ TORRES', DIRECCION_PARTIDA: 'Av. Argentina 2020, Callao', UBIGEO_PARTIDA: 'CALLAO/CALLAO/CALLAO', DIRECCION_LLEGADA: 'Jr. Puno 350', UBIGEO_LLEGADA: 'CUSCO/CUSCO/WANCHAQ', PLACA: 'XYZ-789', DNI_CONDUCTOR: '46997122', NOMBRES_CONDUCTOR: 'PEDRO', APELLIDOS_CONDUCTOR: 'ROJAS HUAMAN', LICENCIA_CONDUCTOR: 'Q87654321', CODIGO_ITEM: 'ARR-050', DESCRIPCION_CARGA: 'Sacos de arroz', CANTIDAD: 50, UNIDAD: 'SA - SACO', PESO_TOTAL_KG: 2650, MOTIVO_TRASLADO: '13 - Otros', DESCRIPCION_TRASLADO: 'Traslado a planta de tratamiento' },
    { N_OPERACION: 2, DESCRIPCION_CARGA: 'Cajas de conservas', CANTIDAD: 15, UNIDAD: 'BX - CAJA' },
  ]
  ejemplos.forEach((e) => {
    const fila = hc.addRow(e)
    fila.eachCell({ includeEmpty: true }, (celda) => {
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBAR } }
      celda.font = { size: 10, color: { argb: GRIS }, italic: true }
    })
  })

  hc.getColumn('FECHA_EMISION').numFmt = 'dd/mm/yyyy'
  hc.getColumn('FECHA_TRASLADO').numFmt = 'dd/mm/yyyy'
  hc.getColumn('PESO_TOTAL_KG').numFmt = '#,##0.00'

  // ── Hoja 3: VALORES (desplegables) ───────────────────────────────────────
  const hv = wb.addWorksheet('VALORES')
  const listas = Object.entries(VALORES_GRE_TRANSPORTISTA)
  listas.forEach(([nombre, valores], col) => {
    hv.getCell(1, col + 1).value = nombre
    valores.forEach((v, i) => { hv.getCell(i + 2, col + 1).value = v })
  })
  hv.state = 'veryHidden'

  const colLetra = (key) => {
    const idx = COLUMNAS_GRE_TRANSPORTISTA.findIndex((c) => c.key === key)
    let n = idx + 1, s = ''
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
    return s
  }
  listas.forEach(([nombre, valores], col) => {
    if (!COLUMNAS_GRE_TRANSPORTISTA.some((c) => c.key === nombre)) return
    const letraValores = String.fromCharCode(65 + col)
    const letraDestino = colLetra(nombre)
    for (let fila = 2; fila <= 1001; fila++) {
      hc.getCell(`${letraDestino}${fila}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`VALORES!$${letraValores}$2:$${letraValores}$${valores.length + 1}`],
        showErrorMessage: true,
        errorTitle: 'Valor no válido',
        error: `Elige un valor de la lista: ${valores.slice(0, 4).join(', ')}${valores.length > 4 ? '…' : ''}`,
      }
    }
  })

  return wb.xlsx.writeBuffer()
}

/** Descarga la plantilla en el navegador. */
export async function descargarPlantillaGreTransportista() {
  const buffer = await generarPlantillaGreTransportista()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Plantilla_Emision_Masiva_GRE_Transportista_Cobrify.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}
