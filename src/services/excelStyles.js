/**
 * Módulo compartido para generación de Excel con estilos.
 *
 * Centraliza paleta de colores, estilos, factorías y helpers comunes que antes
 * estaban duplicados en cada servicio de export (accounting, inventory, invoice,
 * etc.). Cualquier export nuevo o legacy se debe construir encima de este módulo
 * para mantener el look & feel unificado.
 *
 * Dependencias:
 * - xlsx-js-style: permite aplicar estilos a celdas (vs el xlsx plano)
 * - date-fns: formato de fechas con locale es
 * - Capacitor: detección móvil vs web para descargar/compartir
 */
import * as XLSX from 'xlsx-js-style'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// =================== PALETA UNIFICADA ===================
export const COLORS = {
  // Layout
  titleBg: '1E3A8A',        // Azul oscuro (banner principal)
  titleFg: 'FFFFFF',
  subtitleBg: 'E0E7FF',     // Azul muy claro (subtítulos, metadata)
  headerBg: '3730A3',       // Indigo (encabezado de tabla)
  headerFg: 'FFFFFF',
  zebraBg: 'F9FAFB',        // Gris muy suave (filas alternas)
  totalBg: 'FEF3C7',        // Amarillo suave (totales)
  border: 'CBD5E1',         // Gris claro (bordes)
  textPrimary: '1F2937',    // Texto principal
  textMuted: '6B7280',      // Texto secundario

  // Badges de tipo de comprobante
  facturaTag: 'DBEAFE',
  facturaText: '1E40AF',
  boletaTag: 'DCFCE7',
  boletaText: '15803D',
  notaVentaTag: 'F3F4F6',
  notaVentaText: '374151',
  notaCreditoTag: 'FED7AA',
  notaCreditoText: '9A3412',
  notaDebitoTag: 'FCE7F3',
  notaDebitoText: '9D174D',

  // Badges genéricos (verde/naranja/azul/etc — para producto vs ingrediente,
  // estados de stock, etc.)
  successTag: 'D1FAE5',
  successText: '047857',
  warningTag: 'FEF3C7',
  warningText: 'B45309',
  dangerTag: 'FEE2E2',
  dangerText: '991B1B',
  infoTag: 'DBEAFE',
  infoText: '1E40AF',
  neutralTag: 'F3F4F6',
  neutralText: '374151',

  // Estados (texto coloreado en celda con fondo zebra)
  statusOk: '065F46',       // Aceptado / Pagado
  statusWarn: 'B45309',     // Pendiente / Borrador / Stock bajo
  statusError: 'B91C1C',    // Rechazado / Anulado / Sin stock
}

// =================== BORDES ===================
export const BORDER_ALL = {
  top: { style: 'thin', color: { rgb: COLORS.border } },
  bottom: { style: 'thin', color: { rgb: COLORS.border } },
  left: { style: 'thin', color: { rgb: COLORS.border } },
  right: { style: 'thin', color: { rgb: COLORS.border } },
}

// =================== ESTILOS BASE (constantes) ===================
export const titleStyle = {
  font: { bold: true, sz: 14, color: { rgb: COLORS.titleFg } },
  fill: { fgColor: { rgb: COLORS.titleBg } },
  alignment: { horizontal: 'center', vertical: 'center' },
}

export const subtitleStyle = {
  font: { bold: true, sz: 11, color: { rgb: COLORS.textPrimary } },
  fill: { fgColor: { rgb: COLORS.subtitleBg } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
}

export const metaLabelStyle = {
  font: { bold: true, sz: 10, color: { rgb: COLORS.textPrimary } },
  fill: { fgColor: { rgb: COLORS.subtitleBg } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
}

export const metaValueStyle = {
  font: { sz: 10, color: { rgb: COLORS.textPrimary } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
}

export const headerStyle = {
  font: { bold: true, sz: 10, color: { rgb: COLORS.headerFg } },
  fill: { fgColor: { rgb: COLORS.headerBg } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: BORDER_ALL,
}

export const totalLabelStyle = {
  font: { bold: true, sz: 11, color: { rgb: COLORS.textPrimary } },
  fill: { fgColor: { rgb: COLORS.totalBg } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: BORDER_ALL,
}

export const totalNumberStyle = {
  font: { bold: true, sz: 11, color: { rgb: COLORS.textPrimary } },
  fill: { fgColor: { rgb: COLORS.totalBg } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: BORDER_ALL,
  numFmt: '#,##0.00',
}

// =================== FACTORÍAS DE ESTILO DEPENDIENTES DE FILA ===================
const zebraFill = (rowIdx) => (rowIdx % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg)

/** Celda básica izquierda, con zebra striping. */
export const cellStyle = (rowIdx) => ({
  font: { sz: 10, color: { rgb: COLORS.textPrimary } },
  fill: { fgColor: { rgb: zebraFill(rowIdx) } },
  alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  border: BORDER_ALL,
})

/** Celda centrada con zebra. */
export const centerStyle = (rowIdx) => ({
  font: { sz: 10, color: { rgb: COLORS.textPrimary } },
  fill: { fgColor: { rgb: zebraFill(rowIdx) } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER_ALL,
})

/** Celda numérica (alineada a derecha, formato #,##0.00). */
export const numberStyle = (rowIdx) => ({
  font: { sz: 10, color: { rgb: COLORS.textPrimary } },
  fill: { fgColor: { rgb: zebraFill(rowIdx) } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: BORDER_ALL,
  numFmt: '#,##0.00',
})

/** Numérica con prefijo de moneda (USD → "$ 1,234.50", PEN → "S/ 1,234.50"). */
export const numberStyleCcy = (rowIdx, ccy) => ({
  ...numberStyle(rowIdx),
  numFmt: ccy === 'USD' ? '"$" #,##0.00' : '"S/" #,##0.00',
})

/** Numérica entera (sin decimales). */
export const intStyle = (rowIdx) => ({
  ...numberStyle(rowIdx),
  numFmt: '#,##0',
})

/** Total numérico con prefijo de moneda. */
export const totalNumberStyleCcy = (ccy) => ({
  ...totalNumberStyle,
  numFmt: ccy === 'USD' ? '"$" #,##0.00' : '"S/" #,##0.00',
})

/**
 * Badge genérico con colores explícitos. Útil para tipos de comprobante,
 * categorías de producto, estados, etc. Mantén la firma { bg, fg } simple.
 */
export const badgeStyle = ({ bg, fg, bold = true, sz = 9 } = {}) => ({
  font: { bold, sz, color: { rgb: fg || COLORS.neutralText } },
  fill: { fgColor: { rgb: bg || COLORS.neutralTag } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER_ALL,
})

/** Badge predefinido para tipo de comprobante (factura/boleta/notas). */
export const docTypeBadgeStyle = (docType) => {
  const map = {
    factura: { bg: COLORS.facturaTag, fg: COLORS.facturaText },
    boleta: { bg: COLORS.boletaTag, fg: COLORS.boletaText },
    nota_venta: { bg: COLORS.notaVentaTag, fg: COLORS.notaVentaText },
    nota_credito: { bg: COLORS.notaCreditoTag, fg: COLORS.notaCreditoText },
    'nota-credito': { bg: COLORS.notaCreditoTag, fg: COLORS.notaCreditoText },
    nota_debito: { bg: COLORS.notaDebitoTag, fg: COLORS.notaDebitoText },
    'nota-debito': { bg: COLORS.notaDebitoTag, fg: COLORS.notaDebitoText },
  }
  return badgeStyle(map[docType] || { bg: COLORS.notaVentaTag, fg: COLORS.notaVentaText })
}

/** Badge de moneda (USD destacado en verde, PEN neutral con zebra). */
export const currencyTagStyle = (rowIdx, ccy) => ({
  font: { bold: true, sz: 9, color: { rgb: ccy === 'USD' ? COLORS.successText : COLORS.textMuted } },
  fill: { fgColor: { rgb: ccy === 'USD' ? COLORS.successTag : zebraFill(rowIdx) } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER_ALL,
})

/**
 * Celda de estado: texto coloreado según el contenido. Mantiene zebra.
 * Reglas: rechaz/anul/sin → rojo; pend/envi/borrad/bajo → amarillo; resto verde.
 */
export const statusStyle = (rowIdx, statusText) => {
  const lower = String(statusText || '').toLowerCase()
  let color = COLORS.statusOk
  if (lower.includes('rechaz') || lower.includes('anul') || lower.includes('sin stock') || lower.includes('agotado')) {
    color = COLORS.statusError
  } else if (lower.includes('pend') || lower.includes('envi') || lower.includes('borrad') || lower.includes('bajo')) {
    color = COLORS.statusWarn
  }
  return {
    font: { bold: true, sz: 10, color: { rgb: color } },
    fill: { fgColor: { rgb: zebraFill(rowIdx) } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  }
}

/** Checkmark coloreado: "Sí" verde, "No" rojo. */
export const checkStyle = (rowIdx, value) => ({
  font: { bold: true, sz: 10, color: { rgb: value === 'Sí' ? COLORS.statusOk : COLORS.statusError } },
  fill: { fgColor: { rgb: zebraFill(rowIdx) } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER_ALL,
})

// =================== HELPERS DE APLICACIÓN ===================

/**
 * Aplica un estilo a una celda de la hoja, creándola si no existe.
 * Es la primitiva más usada — todos los demás helpers la llaman.
 */
export const setStyle = (ws, row, col, style) => {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  if (!ws[addr]) ws[addr] = { t: 's', v: '' }
  ws[addr].s = style
}

/**
 * Aplica el estilo de título a toda una fila (típicamente la fila 0) y la
 * mergea horizontalmente. Llamar DESPUÉS de XLSX.utils.aoa_to_sheet.
 */
export const applyTitleRow = (ws, row, totalCols, { heightPt = 28 } = {}) => {
  // Merge horizontal
  if (!ws['!merges']) ws['!merges'] = []
  ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } })
  // Altura
  if (!ws['!rows']) ws['!rows'] = []
  ws['!rows'][row] = { hpt: heightPt }
  // Estilo
  for (let c = 0; c < totalCols; c++) setStyle(ws, row, c, titleStyle)
}

/** Aplica subtitle (fondo azul claro, izquierdo). Mergea horizontal. */
export const applySubtitleRow = (ws, row, totalCols, { heightPt = 22 } = {}) => {
  if (!ws['!merges']) ws['!merges'] = []
  ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: totalCols - 1 } })
  if (!ws['!rows']) ws['!rows'] = []
  ws['!rows'][row] = { hpt: heightPt }
  for (let c = 0; c < totalCols; c++) setStyle(ws, row, c, subtitleStyle)
}

/**
 * Aplica estilos a un bloque de filas de metadata (label en col 0, value en col 1).
 * Rango inclusive [startRow, endRow].
 */
export const applyMetadataRows = (ws, startRow, endRow) => {
  for (let r = startRow; r <= endRow; r++) {
    setStyle(ws, r, 0, metaLabelStyle)
    setStyle(ws, r, 1, metaValueStyle)
  }
}

/** Estilo a la fila de encabezados de tabla. Setea altura recomendada. */
export const applyHeaderRow = (ws, row, totalCols, { heightPt = 32 } = {}) => {
  if (!ws['!rows']) ws['!rows'] = []
  ws['!rows'][row] = { hpt: heightPt }
  for (let c = 0; c < totalCols; c++) setStyle(ws, row, c, headerStyle)
}

/** Congela todo hasta la fila del header (inclusive). */
export const applyFreezeBelow = (ws, headerRow) => {
  ws['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 }
}

/** Aplica anchos de columna (array de números en caracteres). */
export const applyColumnWidths = (ws, widths) => {
  ws['!cols'] = widths.map(wch => ({ wch }))
}

// =================== METADATA DE NEGOCIO ===================

/**
 * Construye un array de filas listas para hacer aoa.push(...metadataRows) con
 * la info estándar del negocio. Devuelve un objeto con las rows y los índices
 * del primer/último row para que el caller sepa qué rango estilizar después.
 *
 * @param {Object} businessData    { name, ruc, ... }
 * @param {Object} options         Opcional. Datos extra a incluir.
 * @param {string} options.periodLabel
 * @param {string} options.branchLabel
 * @param {string} options.warehouseLabel
 * @param {number} options.totalItems  Para "Total de items"/"Total documentos"
 * @param {string} options.totalLabel  Label para totalItems (default "Total")
 * @param {Object[]} options.extra     Array adicional de [label, value]
 */
export const buildBusinessMetadataRows = (businessData, options = {}) => {
  const {
    periodLabel,
    branchLabel,
    warehouseLabel,
    totalItems,
    totalLabel = 'Total',
    extra,
  } = options
  const rows = []
  rows.push(['Negocio:', businessData?.name || businessData?.tradeName || 'N/A'])
  rows.push(['RUC:', businessData?.ruc || 'N/A'])
  if (periodLabel) rows.push(['Período:', periodLabel])
  if (branchLabel) rows.push(['Sucursal:', branchLabel])
  if (warehouseLabel) rows.push(['Almacén:', warehouseLabel])
  rows.push(['Fecha de generación:', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })])
  if (typeof totalItems === 'number') rows.push([`${totalLabel}:`, totalItems])
  if (Array.isArray(extra)) {
    for (const [label, value] of extra) {
      if (value !== undefined && value !== null && value !== '') rows.push([label, value])
    }
  }
  return rows
}

// =================== FORMATEO ===================

/** Formatea una fecha (Date, Firestore Timestamp, string o number) → dd/MM/yyyy. */
export const formatDate = (d, fmt = 'dd/MM/yyyy') => {
  if (!d) return '-'
  const date = d.toDate ? d.toDate() : new Date(d)
  if (isNaN(date.getTime())) return '-'
  return format(date, fmt, { locale: es })
}

/** Formatea una fecha con hora → dd/MM/yyyy HH:mm. */
export const formatDateTime = (d) => formatDate(d, 'dd/MM/yyyy HH:mm')

/** Sufijo para nombre de archivo: YYYY-MM-DD_HHmm (estandariza el filename). */
export const fileNameTimestamp = () => format(new Date(), 'yyyy-MM-dd_HHmm')

/** Construye nombre de archivo estándar: prefix_extra_YYYY-MM-DD_HHmm.xlsx. */
export const buildExcelFileName = (prefix, extraParts = []) => {
  const parts = [prefix, ...extraParts.filter(Boolean), fileNameTimestamp()]
  return `${parts.join('_').replace(/\s+/g, '_')}.xlsx`
}

// =================== GUARDAR / COMPARTIR ===================

/**
 * Genera el archivo y lo descarga (web) o lo guarda + comparte (móvil).
 *
 * @param {Object} workbook
 * @param {string} fileName
 * @param {Object} options
 * @param {string} options.shareTitle   Título del diálogo de compartir
 * @param {string} options.shareText    Texto que acompaña el archivo
 * @param {string} options.subDirectory Carpeta dentro de Documents (móvil)
 */
export const saveAndShareExcel = async (
  workbook,
  fileName,
  {
    shareTitle = fileName,
    shareText = `Excel: ${fileName}`,
    subDirectory = '',
  } = {}
) => {
  if (Capacitor.isNativePlatform()) {
    try {
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })
      const path = subDirectory ? `${subDirectory}/${fileName}` : fileName
      if (subDirectory) {
        try {
          await Filesystem.mkdir({ path: subDirectory, directory: Directory.Documents, recursive: true })
        } catch { /* ya existe */ }
      }
      const result = await Filesystem.writeFile({
        path,
        data: excelBuffer,
        directory: Directory.Documents,
        recursive: true,
      })
      try {
        await Share.share({
          title: shareTitle,
          text: shareText,
          url: result.uri,
          dialogTitle: `Compartir ${shareTitle}`,
        })
      } catch { /* canceló */ }
      return { success: true, uri: result.uri }
    } catch (error) {
      console.error('Error al exportar Excel en móvil:', error)
      throw error
    }
  } else {
    XLSX.writeFile(workbook, fileName)
    return { success: true }
  }
}

// Re-export para conveniencia: los servicios solo necesitan importar de aquí.
export { XLSX }
