import * as XLSX from 'xlsx-js-style'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Servicio de exportación para la página de Contabilidad.
 * Incluye desglose tributario (Op. Gravada/Exonerada/Inafecta, IGV, Descuento)
 * además de los campos fiscales/SUNAT (XML, CDR, Hash).
 */

// =================== PALETA (coherente con otros exports) ===================
const COLORS = {
  titleBg: '1E3A8A',
  titleFg: 'FFFFFF',
  subtitleBg: 'E0E7FF',
  headerBg: '3730A3',
  headerFg: 'FFFFFF',
  zebraBg: 'F9FAFB',
  totalBg: 'FEF3C7',
  facturaTag: 'DBEAFE',
  facturaText: '1E40AF',
  boletaTag: 'DCFCE7',
  boletaText: '15803D',
  notaCreditoTag: 'FED7AA',
  notaCreditoText: '9A3412',
  notaDebitoTag: 'FCE7F3',
  notaDebitoText: '9D174D',
  statusOk: '065F46',
  statusWarn: 'B45309',
  statusError: 'B91C1C',
  border: 'CBD5E1',
}

const BORDER_ALL = {
  top: { style: 'thin', color: { rgb: COLORS.border } },
  bottom: { style: 'thin', color: { rgb: COLORS.border } },
  left: { style: 'thin', color: { rgb: COLORS.border } },
  right: { style: 'thin', color: { rgb: COLORS.border } },
}

const titleStyle = {
  font: { bold: true, sz: 14, color: { rgb: COLORS.titleFg } },
  fill: { fgColor: { rgb: COLORS.titleBg } },
  alignment: { horizontal: 'center', vertical: 'center' },
}

const metaLabelStyle = {
  font: { bold: true, sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: COLORS.subtitleBg } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
}

const metaValueStyle = {
  font: { sz: 10, color: { rgb: '1F2937' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
}

const headerStyle = {
  font: { bold: true, sz: 10, color: { rgb: COLORS.headerFg } },
  fill: { fgColor: { rgb: COLORS.headerBg } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: BORDER_ALL,
}

const cellStyle = (i) => ({
  font: { sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: i % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
})

const centerStyle = (i) => ({
  ...cellStyle(i),
  alignment: { horizontal: 'center', vertical: 'center' },
})

const numberStyle = (i) => ({
  ...cellStyle(i),
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: '#,##0.00',
})

const typeTagStyle = (i, docType) => {
  let bg = COLORS.facturaTag, fg = COLORS.facturaText
  if (docType === 'boleta') { bg = COLORS.boletaTag; fg = COLORS.boletaText }
  else if (docType === 'nota_credito' || docType === 'nota-credito') { bg = COLORS.notaCreditoTag; fg = COLORS.notaCreditoText }
  else if (docType === 'nota_debito' || docType === 'nota-debito') { bg = COLORS.notaDebitoTag; fg = COLORS.notaDebitoText }
  return {
    font: { bold: true, sz: 9, color: { rgb: fg } },
    fill: { fgColor: { rgb: bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  }
}

const statusStyle = (i, text) => {
  const lower = (text || '').toLowerCase()
  let color = COLORS.statusOk
  if (lower.includes('rechaz') || lower.includes('anul')) color = COLORS.statusError
  else if (lower.includes('pend')) color = COLORS.statusWarn
  return {
    font: { bold: true, sz: 10, color: { rgb: color } },
    fill: { fgColor: { rgb: i % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  }
}

const checkStyle = (i, value) => ({
  font: { bold: true, sz: 10, color: { rgb: value === 'Sí' ? COLORS.statusOk : COLORS.statusError } },
  fill: { fgColor: { rgb: i % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER_ALL,
})

const totalLabelStyle = {
  font: { bold: true, sz: 11, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: COLORS.totalBg } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: BORDER_ALL,
}

const totalNumberStyle = {
  font: { bold: true, sz: 11, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: COLORS.totalBg } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: BORDER_ALL,
  numFmt: '#,##0.00',
}

function setStyle(ws, row, col, style) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  if (!ws[addr]) ws[addr] = { t: 's', v: '' }
  ws[addr].s = style
}

// =================== HELPERS ===================
const formatDate = (d) => {
  if (!d) return '-'
  const date = d.toDate ? d.toDate() : new Date(d)
  if (isNaN(date.getTime())) return '-'
  return format(date, 'dd/MM/yyyy', { locale: es })
}

const getInvoiceDate = (inv) => inv.issueDate || inv.createdAt || inv.date

const getSunatStatus = (inv) => {
  const s = inv.sunatStatus
  if (s === 'accepted' || s === 'ACEPTADO') return 'accepted'
  if (s === 'rejected' || s === 'RECHAZADO') return 'rejected'
  if (s === 'voided' || s === 'ANULADO') return 'voided'
  return 'pending'
}

const hasCdr = (inv) => !!(inv.cdrUrl || inv.cdrStorageUrl || inv.sunatResponse?.cdrStorageUrl || inv.sunatResponse?.cdrUrl || inv.cdrData || inv.sunatResponse?.cdrData)
// XML disponible: URL guardada o, si SUNAT dio CDR, se puede regenerar on-the-fly
const hasXml = (inv) => {
  if (inv.xmlUrl || inv.xmlStorageUrl || inv.sunatResponse?.xmlStorageUrl || inv.sunatResponse?.xmlUrl || inv.xmlData) return true
  return hasCdr(inv)
}

/**
 * Construye el workbook con estilos. Retorna el workbook listo para escribir.
 */
function buildAccountingWorkbook(filtered, businessData = null, periodLabel = null) {
  const headers = [
    'Número', 'Tipo', 'Cliente', 'RUC/DNI', 'Fecha Emisión',
    'Op. Gravada', 'Op. Exonerada', 'Op. Inafecta',
    'Subtotal', 'Descuento', 'IGV', 'Total',
    'Estado SUNAT', 'XML', 'CDR', 'Hash SUNAT',
  ]
  const totalCols = headers.length

  const aoa = []
  aoa.push(['REPORTE CONTABLE'])
  aoa.push([])
  aoa.push(['Negocio:', businessData?.name || 'N/A'])
  aoa.push(['RUC:', businessData?.ruc || 'N/A'])
  aoa.push(['Período:', periodLabel || 'Todos'])
  aoa.push(['Fecha de generación:', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })])
  aoa.push(['Total de documentos:', filtered.length])
  const metaEndRow = aoa.length - 1
  aoa.push([])

  const headerRow = aoa.length
  aoa.push(headers)

  const docTypes = [] // para estilizar el badge

  const dataStart = aoa.length
  filtered.forEach(inv => {
    const docType = inv.documentType || 'factura'
    docTypes.push(docType)

    // Calcular desglose tributario
    let opGravada = 0, opExonerada = 0, opInafecta = 0
    if (inv.items && Array.isArray(inv.items)) {
      inv.items.forEach(item => {
        const itemTotal = (item.quantity || 1) * (item.price || item.unitPrice || 0)
        if (item.taxAffectation === '20') opExonerada += itemTotal
        else if (item.taxAffectation === '30') opInafecta += itemTotal
        else opGravada += itemTotal
      })
    }

    const typeNames = {
      factura: 'Factura', boleta: 'Boleta',
      nota_credito: 'Nota Crédito', 'nota-credito': 'Nota Crédito',
      nota_debito: 'Nota Débito', 'nota-debito': 'Nota Débito',
    }

    const sunatLabel = getSunatStatus(inv) === 'accepted' ? 'Aceptado'
      : getSunatStatus(inv) === 'rejected' ? 'Rechazado'
      : getSunatStatus(inv) === 'voided' ? 'Anulado'
      : 'Pendiente'

    aoa.push([
      inv.number || '-',
      typeNames[docType] || 'Factura',
      inv.customer?.businessName || inv.customer?.name || '-',
      inv.customer?.documentNumber || '-',
      formatDate(getInvoiceDate(inv)),
      Number(opGravada.toFixed(2)),
      Number(opExonerada.toFixed(2)),
      Number(opInafecta.toFixed(2)),
      Number((inv.subtotal || 0).toFixed(2)),
      Number((inv.discount || 0).toFixed(2)),
      Number((inv.igv || inv.tax || 0).toFixed(2)),
      Number((inv.total || 0).toFixed(2)),
      sunatLabel,
      hasXml(inv) ? 'Sí' : 'No',
      hasCdr(inv) ? 'Sí' : 'No',
      inv.sunatResponse?.hash || inv.sunatHash || '-',
    ])
  })
  const dataEnd = aoa.length - 1

  // Totales
  const totals = filtered.reduce((acc, inv) => {
    let g = 0, e = 0, ia = 0
    inv.items?.forEach(item => {
      const t = (item.quantity || 1) * (item.price || item.unitPrice || 0)
      if (item.taxAffectation === '20') e += t
      else if (item.taxAffectation === '30') ia += t
      else g += t
    })
    return {
      gravada: acc.gravada + g,
      exonerada: acc.exonerada + e,
      inafecta: acc.inafecta + ia,
      subtotal: acc.subtotal + (inv.subtotal || 0),
      descuento: acc.descuento + (inv.discount || 0),
      igv: acc.igv + (inv.igv || inv.tax || 0),
      total: acc.total + (inv.total || 0),
    }
  }, { gravada: 0, exonerada: 0, inafecta: 0, subtotal: 0, descuento: 0, igv: 0, total: 0 })

  aoa.push([])
  const totalRow = aoa.length
  aoa.push([
    '', '', '', '', 'TOTALES:',
    Number(totals.gravada.toFixed(2)),
    Number(totals.exonerada.toFixed(2)),
    Number(totals.inafecta.toFixed(2)),
    Number(totals.subtotal.toFixed(2)),
    Number(totals.descuento.toFixed(2)),
    Number(totals.igv.toFixed(2)),
    Number(totals.total.toFixed(2)),
    '', '', '', '',
  ])

  // Crear sheet
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 16 },  // Número
    { wch: 14 },  // Tipo
    { wch: 32 },  // Cliente
    { wch: 14 },  // RUC/DNI
    { wch: 13 },  // Fecha Emisión
    { wch: 13 },  // Op. Gravada
    { wch: 14 },  // Op. Exonerada
    { wch: 13 },  // Op. Inafecta
    { wch: 12 },  // Subtotal
    { wch: 12 },  // Descuento
    { wch: 11 },  // IGV
    { wch: 13 },  // Total
    { wch: 14 },  // Estado SUNAT
    { wch: 8 },   // XML
    { wch: 8 },   // CDR
    { wch: 40 },  // Hash
  ]
  ws['!rows'] = []
  ws['!rows'][0] = { hpt: 28 }
  ws['!rows'][headerRow] = { hpt: 32 }
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }]

  // Estilo título
  for (let c = 0; c < totalCols; c++) setStyle(ws, 0, c, titleStyle)

  // Metadata
  for (let r = 2; r <= metaEndRow; r++) {
    setStyle(ws, r, 0, metaLabelStyle)
    setStyle(ws, r, 1, metaValueStyle)
  }

  // Header
  for (let c = 0; c < totalCols; c++) setStyle(ws, headerRow, c, headerStyle)

  // Data rows
  for (let i = 0; i < filtered.length; i++) {
    const r = dataStart + i
    const docType = docTypes[i]
    setStyle(ws, r, 0, centerStyle(i))  // Número
    setStyle(ws, r, 1, typeTagStyle(i, docType))  // Tipo badge
    setStyle(ws, r, 2, cellStyle(i))  // Cliente
    setStyle(ws, r, 3, centerStyle(i))  // RUC/DNI
    setStyle(ws, r, 4, centerStyle(i))  // Fecha
    for (let c = 5; c <= 11; c++) setStyle(ws, r, c, numberStyle(i))  // Números
    const statusText = aoa[r][12]
    setStyle(ws, r, 12, statusStyle(i, statusText))
    setStyle(ws, r, 13, checkStyle(i, aoa[r][13]))
    setStyle(ws, r, 14, checkStyle(i, aoa[r][14]))
    setStyle(ws, r, 15, { ...cellStyle(i), font: { ...cellStyle(i).font, sz: 9, color: { rgb: '6B7280' } } })
  }

  // Fila totales
  for (let c = 0; c < totalCols; c++) {
    if (c === 4) setStyle(ws, totalRow, c, totalLabelStyle)
    else if (c >= 5 && c <= 11) setStyle(ws, totalRow, c, totalNumberStyle)
    else setStyle(ws, totalRow, c, { ...totalNumberStyle, alignment: { horizontal: 'left', vertical: 'center' } })
  }

  ws['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contabilidad')
  return wb
}

// =================== APIs PÚBLICAS ===================

/**
 * Genera y descarga el Excel contable (para el botón "Exportar Excel").
 */
export const generateAccountingExcel = async (filtered, businessData = null, periodLabel = null) => {
  if (!filtered || filtered.length === 0) {
    throw new Error('No hay datos para exportar')
  }
  const wb = buildAccountingWorkbook(filtered, businessData, periodLabel)
  const fileName = `Contabilidad_${periodLabel ? periodLabel.replace(/\s+/g, '_') + '_' : ''}${format(new Date(), 'yyyy-MM-dd')}.xlsx`

  if (Capacitor.isNativePlatform()) {
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })
    const result = await Filesystem.writeFile({
      path: fileName,
      data: excelBuffer,
      directory: Directory.Documents,
      recursive: true,
    })
    try {
      await Share.share({
        title: fileName,
        text: 'Reporte contable',
        url: result.uri,
        dialogTitle: 'Compartir reporte',
      })
    } catch { /* canceló */ }
  } else {
    XLSX.writeFile(wb, fileName)
  }
}

/**
 * Genera el buffer Excel para incrustarlo dentro del ZIP de auditoría.
 */
export const generateAccountingExcelBuffer = (filtered, businessData = null, periodLabel = null) => {
  const wb = buildAccountingWorkbook(filtered, businessData, periodLabel)
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
