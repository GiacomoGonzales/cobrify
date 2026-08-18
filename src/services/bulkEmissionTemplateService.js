/**
 * EMISIÓN MASIVA — generador de la PLANTILLA de Excel (F1: comprobantes).
 *
 * La plantilla es el CONTRATO de la importación masiva: lo que acá se define
 * es exactamente lo que el parser (fase siguiente) va a leer. Por eso vive en
 * su propio servicio y no en la página — el parser importará estas mismas
 * constantes para que columnas y valores válidos no puedan divergir.
 *
 * Formato elegido: UNA FILA POR ÍTEM, agrupadas por N_OPERACION (mismo número
 * = mismo comprobante). Es el formato estándar de los facturadores y el único
 * que soporta comprobantes de varios ítems en un Excel plano. Los datos de
 * cabecera (tipo, fecha, cliente...) se leen de la PRIMERA fila de cada
 * operación; en las siguientes pueden quedar vacíos o repetidos.
 *
 * La serie y el correlativo NO van en la plantilla a propósito: los asigna el
 * sistema con la numeración atómica. Un Excel que trae correlativos es una
 * fábrica de rechazos 1033 (comprobante ya registrado).
 *
 * exceljs se importa DINÁMICO: pesa ~1MB y solo se paga al entrar a esta
 * función, nunca en el bundle principal.
 */

/** Columnas de la hoja COMPROBANTES, en orden. `key` es el nombre técnico. */
export const COLUMNAS_COMPROBANTES = [
  { key: 'N_OPERACION', header: 'N° OPERACIÓN', width: 13, nota: 'Mismo número = mismo comprobante. Las filas 1,1,2 generan DOS comprobantes: el primero con dos ítems.' },
  { key: 'TIPO', header: 'TIPO', width: 11, nota: 'FACTURA o BOLETA. FACTURA exige cliente con RUC.' },
  { key: 'FECHA_EMISION', header: 'FECHA EMISIÓN', width: 14, nota: 'dd/mm/aaaa. Máximo unos días hacia atrás: SUNAT rechaza envíos fuera de plazo.' },
  { key: 'MONEDA', header: 'MONEDA', width: 9, nota: 'PEN (soles) o USD (dólares).' },
  { key: 'TIPO_DOC_CLIENTE', header: 'TIPO DOC. CLIENTE', width: 16, nota: 'RUC, DNI, CE, PASAPORTE o SIN DOCUMENTO (boletas menores).' },
  { key: 'NUM_DOC_CLIENTE', header: 'N° DOC. CLIENTE', width: 15, nota: 'RUC: 11 dígitos. DNI: 8 dígitos. Se valida el dígito verificador.' },
  { key: 'NOMBRE_CLIENTE', header: 'NOMBRE / RAZÓN SOCIAL', width: 32, nota: 'Nombre completo o razón social del cliente.' },
  { key: 'DIRECCION_CLIENTE', header: 'DIRECCIÓN', width: 28, nota: 'Opcional. Recomendada en facturas.' },
  { key: 'CODIGO_PRODUCTO', header: 'CÓDIGO PRODUCTO', width: 16, nota: 'Opcional. Si coincide con un producto de tu catálogo (SKU o código de barras), la venta DESCUENTA stock. Vacío = ítem libre sin stock.' },
  { key: 'DESCRIPCION', header: 'DESCRIPCIÓN', width: 34, nota: 'Descripción del ítem tal como saldrá en el comprobante.' },
  { key: 'CANTIDAD', header: 'CANTIDAD', width: 10, nota: 'Acepta decimales (0.5 kilos).' },
  { key: 'UNIDAD', header: 'UNIDAD', width: 16, nota: 'Unidad de medida SUNAT. NIU para unidades, ZZ para servicios.' },
  { key: 'PRECIO_UNITARIO', header: 'PRECIO UNITARIO', width: 15, nota: 'Precio de venta CON IGV incluido (como en tu POS). Para BONIFICACIÓN: el valor referencial de lo que regalas (obligatorio, no 0).' },
  { key: 'AFECTACION', header: 'AFECTACIÓN IGV', width: 15, nota: 'GRAVADO, EXONERADO, INAFECTO o BONIFICACION (regalo: se declara por su valor pero no se cobra).' },
  { key: 'DESCUENTO_ITEM', header: 'DSCTO. ÍTEM (S/)', width: 14, nota: 'Opcional. Descuento en dinero de ESTA línea.' },
  { key: 'DESCUENTO_GLOBAL', header: 'DSCTO. GLOBAL (S/)', width: 15, nota: 'Opcional. Descuento de todo el comprobante. Solo en la primera fila de la operación.' },
  { key: 'FORMA_PAGO', header: 'FORMA DE PAGO', width: 13, nota: 'CONTADO o CREDITO.' },
  { key: 'FECHA_VENCIMIENTO', header: 'FECHA VENCIM.', width: 14, nota: 'Solo si es CREDITO: cuándo vence la deuda.' },
  { key: 'METODO_PAGO', header: 'MÉTODO DE PAGO', width: 15, nota: 'Solo si es CONTADO: con qué pagó.' },
  { key: 'OBSERVACIONES', header: 'OBSERVACIONES', width: 26, nota: 'Opcional. Sale en el comprobante.' },
]

/** Valores admitidos por columna. El parser valida contra ESTAS listas. */
export const VALORES_COMPROBANTES = {
  TIPO: ['FACTURA', 'BOLETA'],
  MONEDA: ['PEN', 'USD'],
  TIPO_DOC_CLIENTE: ['RUC', 'DNI', 'CE', 'PASAPORTE', 'SIN DOCUMENTO'],
  AFECTACION: ['GRAVADO', 'EXONERADO', 'INAFECTO', 'BONIFICACION'],
  FORMA_PAGO: ['CONTADO', 'CREDITO'],
  METODO_PAGO: ['EFECTIVO', 'TRANSFERENCIA', 'YAPE', 'PLIN', 'TARJETA'],
  UNIDAD: [
    'NIU - UNIDAD', 'ZZ - SERVICIO', 'KGM - KILOGRAMO', 'GRM - GRAMO',
    'LTR - LITRO', 'MTR - METRO', 'MTK - METRO CUADRADO', 'BX - CAJA',
    'PK - PAQUETE', 'DZN - DOCENA', 'GLL - GALÓN', 'CEN - CIENTO',
    'MIL - MILLAR', 'SA - SACO', 'BG - BOLSA', 'BO - BOTELLA',
  ],
}

const AZUL = 'FF1E3A8A'   // cabecera (navy del sistema)
const AMBAR = 'FFFef3C7'  // celdas de ejemplo
const GRIS = 'FF6B7280'

/**
 * Genera la plantilla como ArrayBuffer (descargable en el navegador o
 * escribible a disco en Node). Sin argumentos: la plantilla es igual para
 * todos los negocios a propósito — un solo formato que soporte pueda conocer.
 */
export async function generarPlantillaComprobantes() {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Cobrify'
  wb.created = new Date()

  // ── Hoja 1: INSTRUCCIONES ────────────────────────────────────────────────
  const hi = wb.addWorksheet('INSTRUCCIONES')
  hi.getColumn(1).width = 4
  hi.getColumn(2).width = 110
  const titulo = hi.getCell('B2')
  titulo.value = 'PLANTILLA DE EMISIÓN MASIVA DE COMPROBANTES — COBRIFY'
  titulo.font = { bold: true, size: 14, color: { argb: AZUL } }

  const reglas = [
    '',
    'CÓMO FUNCIONA',
    '1. Cada FILA es un ÍTEM (un producto o servicio). Un comprobante puede tener varias filas.',
    '2. La columna N° OPERACIÓN agrupa: todas las filas con el mismo número forman UN comprobante. Usa 1, 2, 3... en orden.',
    '3. Los datos del comprobante (tipo, fecha, cliente, forma de pago) se leen de la PRIMERA fila de cada operación. En las demás filas puedes dejarlos vacíos.',
    '4. La SERIE y el NÚMERO del comprobante los asigna el sistema automáticamente. No van en esta plantilla.',
    '',
    'REGLAS QUE EL SISTEMA VALIDA ANTES DE EMITIR',
    '• FACTURA exige cliente con RUC de 11 dígitos. BOLETA acepta DNI, CE, pasaporte o sin documento.',
    '• La fecha de emisión no puede ser futura ni tener más de unos días de antigüedad (plazo de envío de SUNAT).',
    '• El precio unitario es CON IGV incluido, como los precios de tu POS.',
    '• BONIFICACIÓN = regalo: pon en PRECIO UNITARIO el valor real de lo que regalas (SUNAT lo exige como referencia). No se cobra al cliente.',
    '• Si es CREDITO, indica la fecha de vencimiento. Si es CONTADO, el método de pago.',
    '• Si CÓDIGO PRODUCTO coincide con tu catálogo, la emisión descuenta stock; si va vacío, el ítem no toca inventario.',
    '',
    'DESPUÉS DE LLENAR',
    '• Sube este archivo en Cobrify → Documentos → Emisión masiva.',
    '• El sistema te muestra una VISTA PREVIA con los totales calculados y los errores por fila. Nada se emite hasta que confirmes.',
    '• Las filas de color ámbar de la hoja COMPROBANTES son EJEMPLOS: bórralas antes de subir el archivo.',
    '',
    'Máximo 500 operaciones por archivo. ¿Dudas? El manual de uso está en Cobrify → Manual de uso.',
  ]
  reglas.forEach((t, i) => {
    const c = hi.getCell(`B${3 + i}`)
    c.value = t
    if (t === 'CÓMO FUNCIONA' || t === 'REGLAS QUE EL SISTEMA VALIDA ANTES DE EMITIR' || t === 'DESPUÉS DE LLENAR') {
      c.font = { bold: true, color: { argb: AZUL } }
    } else {
      c.font = { size: 11, color: { argb: 'FF111827' } }
    }
    c.alignment = { wrapText: true, vertical: 'top' }
  })

  // ── Hoja 2: COMPROBANTES ────────────────────────────────────────────────
  const hc = wb.addWorksheet('COMPROBANTES', { views: [{ state: 'frozen', ySplit: 1 }] })
  hc.columns = COLUMNAS_COMPROBANTES.map(c => ({ key: c.key, width: c.width }))

  const encabezado = hc.getRow(1)
  COLUMNAS_COMPROBANTES.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1)
    celda.value = c.header
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    // La explicación de cada columna viaja como NOTA del encabezado: quien
    // llena la plantilla la ve al pasar el mouse, sin salir del Excel.
    celda.note = { texts: [{ text: c.nota }] }
  })
  encabezado.height = 30

  // Filas de EJEMPLO (en ámbar): 2 operaciones que muestran los casos clave —
  // factura al crédito con 2 ítems, y boleta al contado con bonificación.
  const hoy = new Date()
  const en30dias = new Date(hoy.getTime() + 30 * 86400000)
  const ejemplos = [
    { N_OPERACION: 1, TIPO: 'FACTURA', FECHA_EMISION: hoy, MONEDA: 'PEN', TIPO_DOC_CLIENTE: 'RUC', NUM_DOC_CLIENTE: '20100047218', NOMBRE_CLIENTE: 'COMERCIAL EJEMPLO S.A.C.', DIRECCION_CLIENTE: 'Av. Ejemplo 123, Lima', CODIGO_PRODUCTO: '1000001', DESCRIPCION: 'Arroz costeño x 50 kg', CANTIDAD: 10, UNIDAD: 'SA - SACO', PRECIO_UNITARIO: 120, AFECTACION: 'GRAVADO', FORMA_PAGO: 'CREDITO', FECHA_VENCIMIENTO: en30dias },
    { N_OPERACION: 1, CODIGO_PRODUCTO: '', DESCRIPCION: 'Flete de entrega', CANTIDAD: 1, UNIDAD: 'ZZ - SERVICIO', PRECIO_UNITARIO: 50, AFECTACION: 'GRAVADO' },
    { N_OPERACION: 2, TIPO: 'BOLETA', FECHA_EMISION: hoy, MONEDA: 'PEN', TIPO_DOC_CLIENTE: 'DNI', NUM_DOC_CLIENTE: '46997122', NOMBRE_CLIENTE: 'MARIA PEREZ TORRES', CODIGO_PRODUCTO: '', DESCRIPCION: 'Canasta de productos', CANTIDAD: 1, UNIDAD: 'NIU - UNIDAD', PRECIO_UNITARIO: 85.5, AFECTACION: 'GRAVADO', FORMA_PAGO: 'CONTADO', METODO_PAGO: 'YAPE' },
    { N_OPERACION: 2, CODIGO_PRODUCTO: '', DESCRIPCION: 'Taza de regalo', CANTIDAD: 1, UNIDAD: 'NIU - UNIDAD', PRECIO_UNITARIO: 15, AFECTACION: 'BONIFICACION' },
  ]
  ejemplos.forEach(e => {
    const fila = hc.addRow(e)
    fila.eachCell({ includeEmpty: true }, celda => {
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBAR } }
      celda.font = { size: 10, color: { argb: GRIS }, italic: true }
    })
  })

  // Formatos de columna (aplican a toda la columna, ejemplos incluidos)
  hc.getColumn('FECHA_EMISION').numFmt = 'dd/mm/yyyy'
  hc.getColumn('FECHA_VENCIMIENTO').numFmt = 'dd/mm/yyyy'
  hc.getColumn('PRECIO_UNITARIO').numFmt = '#,##0.00'
  hc.getColumn('DESCUENTO_ITEM').numFmt = '#,##0.00'
  hc.getColumn('DESCUENTO_GLOBAL').numFmt = '#,##0.00'

  // ── Hoja 3: VALORES (catálogos para los desplegables) ───────────────────
  // Las listas largas no caben inline en una validación; viven acá y las
  // validaciones las referencian. La hoja queda oculta para no confundir.
  const hv = wb.addWorksheet('VALORES')
  const listas = Object.entries(VALORES_COMPROBANTES)
  listas.forEach(([nombre, valores], col) => {
    hv.getCell(1, col + 1).value = nombre
    valores.forEach((v, i) => { hv.getCell(i + 2, col + 1).value = v })
  })
  hv.state = 'veryHidden'

  // Desplegables sobre 1000 filas de datos (de la 2 a la 1001)
  const colLetra = (key) => {
    const idx = COLUMNAS_COMPROBANTES.findIndex(c => c.key === key)
    let n = idx + 1, s = ''
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
    return s
  }
  listas.forEach(([nombre, valores], col) => {
    if (!COLUMNAS_COMPROBANTES.some(c => c.key === nombre)) return
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
export async function descargarPlantillaComprobantes() {
  const buffer = await generarPlantillaComprobantes()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Plantilla_Emision_Masiva_Comprobantes_Cobrify.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}
