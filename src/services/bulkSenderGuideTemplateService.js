/**
 * EMISIÓN MASIVA — plantilla Excel de GRE REMITENTE.
 *
 * Gemela de la de GRE Transportista, con las diferencias propias de emitir
 * como DUEÑO de la mercadería:
 *  - El remitente es el propio negocio, así que no se pide: sale de su ficha.
 *  - Se declara el MOTIVO DE TRASLADO (catálogo 20), que en esta guía SÍ viaja
 *    a SUNAT, y su descripción cuando el motivo es "Otros".
 *  - La MODALIDAD decide qué datos de transporte hacen falta: público pide el
 *    transportista (RUC y razón social); privado, el vehículo y el conductor.
 *  - El peso admite KGM o TNE, como en el formulario individual.
 *
 * Este archivo es el CONTRATO: el parser importa las columnas y los valores
 * admitidos de acá, así que agregar una columna es tocar un solo lugar.
 */
import { etiquetasParaExcel } from '@/data/sunatUnits'
import { ETIQUETAS_MOTIVO_REMITENTE_EXCEL } from '@/utils/senderTransferReasons'
import { UNIDADES_PESO } from '@/utils/weightUnits'

/** Columnas en el orden EXACTO en que salen en la hoja GUIAS. */
export const COLUMNAS_GRE_REMITENTE = [
  { key: 'N_OPERACION', header: 'N° OPERACIÓN', width: 13, nota: 'Mismo número = misma guía. Una guía con un solo bien es una sola fila.' },
  { key: 'FECHA_EMISION', header: 'FECHA EMISIÓN', width: 14, nota: 'dd/mm/aaaa. Máximo unos días hacia atrás.' },
  { key: 'FECHA_TRASLADO', header: 'FECHA TRASLADO', width: 14, nota: 'dd/mm/aaaa. Cuándo inicia el traslado: el mismo día de la emisión o después.' },
  { key: 'MOTIVO_TRASLADO', header: 'MOTIVO DE TRASLADO', width: 38, nota: 'Elígelo de la lista. Va a SUNAT dentro de la guía. Solo en la primera fila de la operación.' },
  { key: 'DESCRIPCION_MOTIVO', header: 'DESCRIPCIÓN DEL MOTIVO', width: 32, nota: 'OBLIGATORIA si el motivo es "Otros": SUNAT rechaza la guía sin ella. En los demás motivos es opcional.' },
  { key: 'TIPO_DOC_DESTINATARIO', header: 'TIPO DOC. DESTINATARIO', width: 18, nota: 'RUC, DNI o CE de quien RECIBE la mercadería.' },
  { key: 'NUM_DOC_DESTINATARIO', header: 'N° DOC. DESTINATARIO', width: 17, nota: 'RUC: 11 dígitos. DNI: 8 dígitos.' },
  { key: 'NOMBRE_DESTINATARIO', header: 'NOMBRE DESTINATARIO', width: 30, nota: 'Nombre o razón social de quien recibe.' },
  { key: 'DIRECCION_PARTIDA', header: 'DIRECCIÓN PARTIDA', width: 30, nota: 'Dirección del punto de partida.' },
  { key: 'UBIGEO_PARTIDA', header: 'UBIGEO PARTIDA', width: 24, nota: 'DEPARTAMENTO/PROVINCIA/DISTRITO. Ejemplo: LIMA/LIMA/SURQUILLO' },
  { key: 'DIRECCION_LLEGADA', header: 'DIRECCIÓN LLEGADA', width: 30, nota: 'Dirección del punto de llegada.' },
  { key: 'UBIGEO_LLEGADA', header: 'UBIGEO LLEGADA', width: 24, nota: 'DEPARTAMENTO/PROVINCIA/DISTRITO. Ejemplo: AREQUIPA/AREQUIPA/CAYMA' },
  { key: 'MODALIDAD', header: 'MODALIDAD DE TRASLADO', width: 24, nota: 'PUBLICO (lo lleva un transportista) o PRIVADO (lo llevas tú). Decide qué columnas hacen falta abajo.' },
  { key: 'RUC_TRANSPORTISTA', header: 'RUC TRANSPORTISTA', width: 16, nota: 'Solo si la modalidad es PUBLICO. RUC de 11 dígitos de la empresa de transporte.' },
  { key: 'RAZON_SOCIAL_TRANSPORTISTA', header: 'RAZÓN SOCIAL TRANSPORTISTA', width: 30, nota: 'Solo si la modalidad es PUBLICO.' },
  { key: 'PLACA', header: 'PLACA VEHÍCULO', width: 13, nota: 'Solo si la modalidad es PRIVADO. Ejemplo: ABC-123' },
  { key: 'DNI_CONDUCTOR', header: 'DNI CONDUCTOR', width: 13, nota: 'Solo si la modalidad es PRIVADO. DNI de 8 dígitos.' },
  { key: 'NOMBRES_CONDUCTOR', header: 'NOMBRES CONDUCTOR', width: 20, nota: 'Solo si la modalidad es PRIVADO.' },
  { key: 'APELLIDOS_CONDUCTOR', header: 'APELLIDOS CONDUCTOR', width: 20, nota: 'Solo si la modalidad es PRIVADO.' },
  { key: 'LICENCIA_CONDUCTOR', header: 'LICENCIA', width: 14, nota: 'Solo si la modalidad es PRIVADO. Número de brevete. Ejemplo: Q12345678' },
  { key: 'PESO_TOTAL', header: 'PESO BRUTO TOTAL', width: 15, nota: 'Peso bruto TOTAL de la guía, solo en la primera fila de la operación.' },
  { key: 'UNIDAD_PESO', header: 'UND. DEL PESO', width: 13, nota: 'KGM (kilos) o TNE (toneladas). Vacío = KGM. El peso se declara EN esa unidad.' },
  { key: 'CODIGO_ITEM', header: 'CÓDIGO INTERNO', width: 15, nota: 'Opcional. Tu código del producto; viaja en el XML a SUNAT.' },
  { key: 'DESCRIPCION_BIEN', header: 'DESCRIPCIÓN DEL BIEN', width: 32, nota: 'Qué se traslada, tal como saldrá en la guía.' },
  { key: 'CANTIDAD', header: 'CANTIDAD', width: 10, nota: 'Cantidad de esta fila.' },
  { key: 'UNIDAD', header: 'UNIDAD', width: 16, nota: 'Unidad de medida SUNAT (catálogo 03). NIU para unidades.' },
  { key: 'OBSERVACIONES', header: 'OBSERVACIONES', width: 26, nota: 'Opcional. Sale impreso en la guía.' },
]

/** Valores admitidos por columna. El parser valida contra ESTAS listas. */
export const VALORES_GRE_REMITENTE = {
  TIPO_DOC_DESTINATARIO: ['RUC', 'DNI', 'CE'],
  MODALIDAD: ['PUBLICO', 'PRIVADO'],
  MOTIVO_TRASLADO: ETIQUETAS_MOTIVO_REMITENTE_EXCEL,
  UNIDAD_PESO: UNIDADES_PESO.map((u) => u.code),
  UNIDAD: etiquetasParaExcel(),
}

const AZUL = 'FF1E3A8A'
const AMBAR = 'FFFef3C7'
const GRIS = 'FF6B7280'

/** Genera la plantilla como ArrayBuffer. */
export async function generarPlantillaGreRemitente() {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Cobrify'
  wb.created = new Date()

  // ── Hoja 1: INSTRUCCIONES ────────────────────────────────────────────────
  const hi = wb.addWorksheet('INSTRUCCIONES')
  hi.getColumn(1).width = 4
  hi.getColumn(2).width = 110
  const titulo = hi.getCell('B2')
  titulo.value = 'PLANTILLA DE EMISIÓN MASIVA DE GRE REMITENTE — COBRIFY'
  titulo.font = { bold: true, size: 14, color: { argb: AZUL } }

  const reglas = [
    '',
    'CÓMO FUNCIONA',
    '1. Cada FILA es un BIEN a trasladar. Una guía con un solo bien es una sola fila.',
    '2. La columna N° OPERACIÓN agrupa: todas las filas con el mismo número forman UNA guía. Usa 1, 2, 3... en orden.',
    '3. Los datos de la guía (fechas, motivo, destinatario, ruta, transporte y peso) van en la PRIMERA fila de cada operación.',
    '4. Tú eres el REMITENTE: tus datos salen de tu configuración, no se escriben en el Excel.',
    '5. La SERIE y el NÚMERO de cada guía los asigna el sistema automáticamente.',
    '',
    'CÓMO ESCRIBIR LOS UBIGEOS',
    '• Escribe DEPARTAMENTO/PROVINCIA/DISTRITO separados por barras: LIMA/LIMA/SURQUILLO',
    '• El sistema los convierte al código oficial de SUNAT. Si un nombre no calza, te lo dice con la fila exacta.',
    '',
    'MODALIDAD DE TRASLADO: qué columnas llenar',
    '• PUBLICO — lo lleva una empresa de transporte: llena RUC TRANSPORTISTA y RAZÓN SOCIAL TRANSPORTISTA.',
    '• PRIVADO — lo llevas tú: llena PLACA, DNI, NOMBRES, APELLIDOS y LICENCIA del conductor.',
    '• Lo que no corresponde a la modalidad se ignora, así que puedes dejarlo vacío.',
    '',
    'EL MOTIVO DE TRASLADO',
    '• Se elige de la lista y viaja a SUNAT dentro de la guía.',
    '• Si eliges "13 - Otros", la DESCRIPCIÓN DEL MOTIVO es OBLIGATORIA: sin ella SUNAT rechaza la guía.',
    '',
    'EL PESO',
    '• El peso bruto total va solo en la primera fila de cada guía.',
    '• La UND. DEL PESO puede ser KGM (kilos) o TNE (toneladas). Si la dejas vacía se asume KGM.',
    '• Escribe el número EN esa unidad: 2.5 con TNE son dos toneladas y media, no dos kilos y medio.',
    '',
    'DESPUÉS DE LLENAR',
    '• Sube este archivo en Cobrify → Documentos → Emisión Masiva → pestaña GRE Remitente.',
    '• Verás la VISTA PREVIA con los errores por fila. Corriges, vuelves a subir, y cuando todo esté bien presionas Emitir.',
    '• La emisión va EN SERIE, guía por guía, con su resultado de SUNAT al lado.',
    '• Las filas de color ámbar de la hoja GUIAS son EJEMPLOS: bórralas antes de subir el archivo.',
    '',
    'OJO: la emisión masiva NO descuenta stock. Si necesitas que descuente, emite esa guía desde la pantalla de GRE Remitente.',
    '',
    'Máximo 500 guías por archivo. ¿Dudas? El manual de uso está en Cobrify → Manual de uso.',
  ]
  const NEGRITAS = new Set([
    'CÓMO FUNCIONA', 'CÓMO ESCRIBIR LOS UBIGEOS', 'MODALIDAD DE TRASLADO: qué columnas llenar',
    'EL MOTIVO DE TRASLADO', 'EL PESO', 'DESPUÉS DE LLENAR',
  ])
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
  hc.columns = COLUMNAS_GRE_REMITENTE.map((c) => ({ key: c.key, width: c.width }))

  const encabezado = hc.getRow(1)
  COLUMNAS_GRE_REMITENTE.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1)
    celda.value = c.header
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    celda.note = { texts: [{ text: c.nota }] }
  })
  encabezado.height = 30

  // Filas de EJEMPLO (ámbar): una privada de dos bienes y una pública.
  const hoy = new Date()
  const ejemplos = [
    {
      N_OPERACION: 1, FECHA_EMISION: hoy, FECHA_TRASLADO: hoy,
      MOTIVO_TRASLADO: '04 - Traslado entre establecimientos de la misma empresa',
      TIPO_DOC_DESTINATARIO: 'RUC', NUM_DOC_DESTINATARIO: '20100047218', NOMBRE_DESTINATARIO: 'MI EMPRESA S.A.C. - ALMACÉN NORTE',
      DIRECCION_PARTIDA: 'Av. Argentina 2020, Callao', UBIGEO_PARTIDA: 'CALLAO/CALLAO/CALLAO',
      DIRECCION_LLEGADA: 'Av. Ejercito 710', UBIGEO_LLEGADA: 'AREQUIPA/AREQUIPA/CAYMA',
      MODALIDAD: 'PRIVADO', PLACA: 'ABC-123', DNI_CONDUCTOR: '46997122',
      NOMBRES_CONDUCTOR: 'JUAN CARLOS', APELLIDOS_CONDUCTOR: 'QUISPE MAMANI', LICENCIA_CONDUCTOR: 'Q46997122',
      PESO_TOTAL: 2400, UNIDAD_PESO: 'KGM',
      CODIGO_ITEM: 'CEM-001', DESCRIPCION_BIEN: 'Bolsas de cemento', CANTIDAD: 120, UNIDAD: 'BG - BOLSA',
    },
    { N_OPERACION: 1, DESCRIPCION_BIEN: 'Varillas de fierro', CANTIDAD: 40, UNIDAD: 'NIU' },
    {
      N_OPERACION: 2, FECHA_EMISION: hoy, FECHA_TRASLADO: hoy,
      MOTIVO_TRASLADO: '13 - Otros', DESCRIPCION_MOTIVO: 'Disposición final de residuos',
      TIPO_DOC_DESTINATARIO: 'RUC', NUM_DOC_DESTINATARIO: '20100047218', NOMBRE_DESTINATARIO: 'PLANTA DE TRATAMIENTO S.A.',
      DIRECCION_PARTIDA: 'Av. Argentina 2020, Callao', UBIGEO_PARTIDA: 'CALLAO/CALLAO/CALLAO',
      DIRECCION_LLEGADA: 'Jr. Puno 350', UBIGEO_LLEGADA: 'CUSCO/CUSCO/WANCHAQ',
      MODALIDAD: 'PUBLICO', RUC_TRANSPORTISTA: '20100047218', RAZON_SOCIAL_TRANSPORTISTA: 'TRANSPORTES EJEMPLO S.A.C.',
      PESO_TOTAL: 2.5, UNIDAD_PESO: 'TNE',
      DESCRIPCION_BIEN: 'Residuos sólidos peligrosos', CANTIDAD: 30, UNIDAD: 'NIU',
    },
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
  hc.getColumn('PESO_TOTAL').numFmt = '#,##0.000'

  // ── Hoja 3: VALORES (desplegables) ───────────────────────────────────────
  const hv = wb.addWorksheet('VALORES')
  const listas = Object.entries(VALORES_GRE_REMITENTE)
  listas.forEach(([nombre, valores], col) => {
    hv.getCell(1, col + 1).value = nombre
    valores.forEach((v, i) => { hv.getCell(i + 2, col + 1).value = v })
  })
  hv.state = 'veryHidden'

  const colLetra = (key) => {
    const idx = COLUMNAS_GRE_REMITENTE.findIndex((c) => c.key === key)
    let n = idx + 1, s = ''
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
    return s
  }
  listas.forEach(([nombre, valores], col) => {
    if (!COLUMNAS_GRE_REMITENTE.some((c) => c.key === nombre)) return
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
export async function descargarPlantillaGreRemitente() {
  const buffer = await generarPlantillaGreRemitente()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Plantilla_Emision_Masiva_GRE_Remitente_Cobrify.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}
