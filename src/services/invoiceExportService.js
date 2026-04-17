import * as XLSX from 'xlsx-js-style'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// =================== PALETA DE ESTILOS (mismo look que inventario) ===================
const COLORS = {
  titleBg: '1E3A8A',        // Azul oscuro
  titleFg: 'FFFFFF',
  subtitleBg: 'E0E7FF',     // Azul muy claro
  headerBg: '3730A3',       // Indigo
  headerFg: 'FFFFFF',
  zebraBg: 'F9FAFB',        // Gris muy suave
  totalBg: 'FEF3C7',        // Amarillo suave
  // Badges tipo de comprobante
  facturaTag: 'DBEAFE',     // Azul claro
  facturaText: '1E40AF',
  boletaTag: 'DCFCE7',      // Verde claro
  boletaText: '15803D',
  notaVentaTag: 'F3F4F6',   // Gris
  notaVentaText: '374151',
  notaCreditoTag: 'FED7AA', // Naranja claro
  notaCreditoText: '9A3412',
  notaDebitoTag: 'FCE7F3',  // Rosa claro
  notaDebitoText: '9D174D',
  // Estados
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

const subtitleStyle = {
  font: { bold: true, sz: 11, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: COLORS.subtitleBg } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER_ALL,
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

const cellStyle = (rowIdx) => ({
  font: { sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: rowIdx % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
  alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  border: BORDER_ALL,
})

const numberStyle = (rowIdx) => ({
  font: { sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: rowIdx % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: BORDER_ALL,
  numFmt: '#,##0.00',
})

const centerStyle = (rowIdx) => ({
  font: { sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: rowIdx % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER_ALL,
})

// Badge de tipo de comprobante (Factura azul, Boleta verde, etc.)
const typeTagStyle = (rowIdx, docType) => {
  let bg = COLORS.notaVentaTag, fg = COLORS.notaVentaText
  if (docType === 'factura') { bg = COLORS.facturaTag; fg = COLORS.facturaText }
  else if (docType === 'boleta') { bg = COLORS.boletaTag; fg = COLORS.boletaText }
  else if (docType === 'nota_credito' || docType === 'nota-credito') { bg = COLORS.notaCreditoTag; fg = COLORS.notaCreditoText }
  else if (docType === 'nota_debito' || docType === 'nota-debito') { bg = COLORS.notaDebitoTag; fg = COLORS.notaDebitoText }
  return {
    font: { bold: true, sz: 9, color: { rgb: fg } },
    fill: { fgColor: { rgb: bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  }
}

// Estilo para columna de estado (coloreado según valor)
const statusStyle = (rowIdx, statusText) => {
  const lower = (statusText || '').toLowerCase()
  let color = COLORS.statusOk
  if (lower.includes('rechaz') || lower.includes('anul')) color = COLORS.statusError
  else if (lower.includes('pend') || lower.includes('envi') || lower.includes('borrad')) color = COLORS.statusWarn
  return {
    font: { bold: true, sz: 10, color: { rgb: color } },
    fill: { fgColor: { rgb: rowIdx % 2 === 0 ? 'FFFFFF' : COLORS.zebraBg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  }
}

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

// Aplica estilo a una celda (creándola si no existe)
function setStyle(ws, row, col, style) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  if (!ws[addr]) ws[addr] = { t: 's', v: '' }
  ws[addr].s = style
}

// =================== HELPER SAVE/SHARE ===================
const saveAndShareExcel = async (workbook, fileName) => {
  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })
      const excelDir = 'Comprobantes'
      try {
        await Filesystem.mkdir({ path: excelDir, directory: Directory.Documents, recursive: true })
      } catch { /* existe */ }

      const result = await Filesystem.writeFile({
        path: `${excelDir}/${fileName}`,
        data: excelBuffer,
        directory: Directory.Documents,
        recursive: true,
      })

      try {
        await Share.share({
          title: fileName,
          text: `Reporte de comprobantes: ${fileName}`,
          url: result.uri,
          dialogTitle: 'Compartir Reporte de Comprobantes',
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

/**
 * Formatea los métodos de pago de una factura.
 */
const formatPaymentMethods = (invoice) => {
  if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    if (invoice.payments.length === 1) {
      return invoice.payments[0].method || 'Efectivo'
    }
    return invoice.payments
      .map(p => `${p.method}: S/${(p.amount || 0).toFixed(2)}`)
      .join(' + ')
  }
  return invoice.paymentMethod || 'Efectivo'
}

/**
 * Generar reporte de facturas en Excel con estilos.
 */
export const generateInvoicesExcel = async (invoices, filters, businessData, branchLabel = null) => {
  const workbook = XLSX.utils.book_new()

  // =================== HOJA 1: COMPROBANTES ===================
  const headers1 = [
    'Fecha', 'Tipo', 'Número', 'Cliente', 'RUC/DNI', 'Alumno', 'Productos',
    'Op. Gravada', 'Op. Exonerada', 'Op. Inafecta', 'Subtotal', 'Descuento',
    'IGV', 'Total', 'Estado', 'Estado SUNAT', 'Método de Pago',
  ]
  const totalCols1 = headers1.length

  const aoa1 = []
  aoa1.push(['REPORTE DE COMPROBANTES EMITIDOS'])
  aoa1.push([])
  aoa1.push(['Negocio:', businessData?.name || 'N/A'])
  aoa1.push(['RUC:', businessData?.ruc || 'N/A'])
  aoa1.push(['Sucursal:', branchLabel || 'Todas'])
  aoa1.push(['Fecha de generación:', format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })])

  // Filtros aplicados
  if (filters.type && filters.type !== 'all') {
    const typeNames = {
      factura: 'Facturas', boleta: 'Boletas',
      'nota-credito': 'Notas de Crédito', 'nota-debito': 'Notas de Débito',
    }
    aoa1.push(['Tipo de Comprobante:', typeNames[filters.type] || filters.type])
  }
  if (filters.startDate) aoa1.push(['Fecha Desde:', format(new Date(filters.startDate), 'dd/MM/yyyy', { locale: es })])
  if (filters.endDate) aoa1.push(['Fecha Hasta:', format(new Date(filters.endDate), 'dd/MM/yyyy', { locale: es })])

  const metaEndRow = aoa1.length - 1
  aoa1.push([])

  const subtitleRow = aoa1.length
  aoa1.push(['LISTADO DE COMPROBANTES'])
  aoa1.push([])

  const header1Row = aoa1.length
  aoa1.push(headers1)

  // Preparar datos
  const typeNames = {
    factura: 'Factura', boleta: 'Boleta', nota_venta: 'Nota de Venta',
    nota_credito: 'Nota de Crédito', nota_debito: 'Nota de Débito',
    'nota-credito': 'Nota de Crédito', 'nota-debito': 'Nota de Débito',
  }
  const statusNames = {
    draft: 'Borrador', pending: 'Pendiente', paid: 'Pagado',
    sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada', cancelled: 'Anulada',
  }
  const sunatStatusNames = {
    accepted: 'Aceptado', pending: 'Pendiente', sending: 'Enviando',
    rejected: 'Rechazado', voided: 'Anulado', voiding: 'Anulando',
    SIGNED: 'Firmado', signed: 'Firmado', not_applicable: 'N/A',
  }

  const dataStart1 = aoa1.length
  const invoiceDocTypes = [] // Lo guardo para estilizar el badge

  invoices.forEach(invoice => {
    const docType = invoice.documentType || invoice.type || 'N/A'
    invoiceDocTypes.push(docType)
    const customerName = invoice.customer?.name || invoice.customer?.businessName || invoice.customerName || 'Cliente General'
    const customerDoc = invoice.customer?.documentNumber || invoice.customerDocumentNumber || 'N/A'
    const studentName = invoice.customer?.studentName || invoice.studentName || ''

    const productsList = invoice.items && Array.isArray(invoice.items)
      ? invoice.items.map(item => {
          const name = `${item.quantity || 1}x ${item.name || item.description || 'Producto'}`
          if (item.taxAffectation === '20') return `${name} [EXO]`
          if (item.taxAffectation === '30') return `${name} [INA]`
          return name
        }).join(', ')
      : ''

    let opGravada = 0, opExonerada = 0, opInafecta = 0
    if (invoice.items && Array.isArray(invoice.items)) {
      invoice.items.forEach(item => {
        const itemTotal = (item.quantity || 1) * (item.price || item.unitPrice || 0)
        if (item.taxAffectation === '20') opExonerada += itemTotal
        else if (item.taxAffectation === '30') opInafecta += itemTotal
        else opGravada += itemTotal
      })
    }

    const sunatStatus = invoice.documentType === 'nota_venta'
      ? 'N/A'
      : (sunatStatusNames[invoice.sunatStatus] || invoice.sunatStatus || 'Pendiente')

    aoa1.push([
      invoice.createdAt?.toDate ? format(invoice.createdAt.toDate(), 'dd/MM/yyyy', { locale: es }) : 'N/A',
      typeNames[docType] || docType || 'N/A',
      invoice.number || 'N/A',
      customerName,
      customerDoc,
      studentName,
      productsList,
      Number(opGravada.toFixed(2)),
      Number(opExonerada.toFixed(2)),
      Number(opInafecta.toFixed(2)),
      Number((invoice.subtotal || 0).toFixed(2)),
      Number((invoice.discount || 0).toFixed(2)),
      Number((invoice.igv || invoice.tax || 0).toFixed(2)),
      Number((invoice.total || 0).toFixed(2)),
      statusNames[invoice.status] || invoice.status || 'N/A',
      sunatStatus,
      formatPaymentMethods(invoice),
    ])
  })
  const dataEnd1 = aoa1.length - 1

  // Totales
  const subtotalSum = invoices.reduce((s, i) => s + (i.subtotal || 0), 0)
  const discountSum = invoices.reduce((s, i) => s + (i.discount || 0), 0)
  const taxSum = invoices.reduce((s, i) => s + (i.igv || i.tax || 0), 0)
  const totalSum = invoices.reduce((s, i) => s + (i.total || 0), 0)
  const gravadaSum = invoices.reduce((s, i) => {
    let g = 0
    i.items?.forEach(item => {
      const t = (item.quantity || 1) * (item.price || item.unitPrice || 0)
      if (item.taxAffectation !== '20' && item.taxAffectation !== '30') g += t
    })
    return s + g
  }, 0)
  const exoneradaSum = invoices.reduce((s, i) => {
    let e = 0
    i.items?.forEach(item => {
      const t = (item.quantity || 1) * (item.price || item.unitPrice || 0)
      if (item.taxAffectation === '20') e += t
    })
    return s + e
  }, 0)
  const inafectaSum = invoices.reduce((s, i) => {
    let ia = 0
    i.items?.forEach(item => {
      const t = (item.quantity || 1) * (item.price || item.unitPrice || 0)
      if (item.taxAffectation === '30') ia += t
    })
    return s + ia
  }, 0)

  aoa1.push([])
  const totalRow = aoa1.length
  aoa1.push([
    '', '', '', '', '', '', 'TOTALES:',
    Number(gravadaSum.toFixed(2)),
    Number(exoneradaSum.toFixed(2)),
    Number(inafectaSum.toFixed(2)),
    Number(subtotalSum.toFixed(2)),
    Number(discountSum.toFixed(2)),
    Number(taxSum.toFixed(2)),
    Number(totalSum.toFixed(2)),
    '', '', '',
  ])

  // Crear worksheet
  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)

  // Anchos
  ws1['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 14 },
    { wch: 22 }, { wch: 45 }, { wch: 13 }, { wch: 14 }, { wch: 13 },
    { wch: 12 }, { wch: 11 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 30 },
  ]

  // Alturas
  ws1['!rows'] = []
  ws1['!rows'][0] = { hpt: 28 }
  ws1['!rows'][subtitleRow] = { hpt: 22 }
  ws1['!rows'][header1Row] = { hpt: 32 }

  // Merges
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols1 - 1 } },                 // Título
    { s: { r: subtitleRow, c: 0 }, e: { r: subtitleRow, c: totalCols1 - 1 } }, // Subtítulo
  ]

  // Estilos título
  for (let c = 0; c < totalCols1; c++) setStyle(ws1, 0, c, titleStyle)

  // Estilos metadata
  for (let r = 2; r <= metaEndRow; r++) {
    setStyle(ws1, r, 0, metaLabelStyle)
    setStyle(ws1, r, 1, metaValueStyle)
  }

  // Subtitle
  for (let c = 0; c < totalCols1; c++) setStyle(ws1, subtitleRow, c, subtitleStyle)

  // Header
  for (let c = 0; c < totalCols1; c++) setStyle(ws1, header1Row, c, headerStyle)

  // Data rows
  for (let i = 0; i < invoices.length; i++) {
    const r = dataStart1 + i
    const docType = invoiceDocTypes[i]
    // 0: Fecha (centrado)
    setStyle(ws1, r, 0, centerStyle(i))
    // 1: Tipo (badge)
    setStyle(ws1, r, 1, typeTagStyle(i, docType))
    // 2: Número (centrado mono-like)
    setStyle(ws1, r, 2, centerStyle(i))
    // 3: Cliente
    setStyle(ws1, r, 3, cellStyle(i))
    // 4: RUC/DNI
    setStyle(ws1, r, 4, centerStyle(i))
    // 5: Alumno
    setStyle(ws1, r, 5, cellStyle(i))
    // 6: Productos
    setStyle(ws1, r, 6, cellStyle(i))
    // 7-13: Números
    for (let c = 7; c <= 13; c++) setStyle(ws1, r, c, numberStyle(i))
    // 14: Estado
    const statusText = aoa1[r][14]
    setStyle(ws1, r, 14, statusStyle(i, statusText))
    // 15: Estado SUNAT
    const sunatText = aoa1[r][15]
    setStyle(ws1, r, 15, statusStyle(i, sunatText))
    // 16: Método de pago
    setStyle(ws1, r, 16, cellStyle(i))
  }

  // Fila de totales
  for (let c = 0; c < totalCols1; c++) {
    if (c === 6) {
      setStyle(ws1, totalRow, c, totalLabelStyle)
    } else if (c >= 7 && c <= 13) {
      setStyle(ws1, totalRow, c, totalNumberStyle)
    } else {
      setStyle(ws1, totalRow, c, { ...totalNumberStyle, alignment: { horizontal: 'left', vertical: 'center' } })
    }
  }

  // Freeze panes en el header de datos
  ws1['!freeze'] = { xSplit: 0, ySplit: header1Row + 1 }

  XLSX.utils.book_append_sheet(workbook, ws1, 'Comprobantes')

  // =================== HOJA 2: REGISTRO DE VENTAS (SUNAT 14.1) ===================
  const headers2 = [
    'CUO', 'Fecha Emisión', 'Fecha Vencimiento', 'Tipo Comprobante', 'Serie', 'Número',
    'Tipo Doc. Cliente', 'Nro Doc. Cliente', 'Razón Social / Nombre',
    'Base Imponible', 'Descuento Base Imp.', 'IGV', 'Importe Exonerado', 'Importe Inafecto',
    'ISC', 'Otros Tributos', 'Importe Total', 'Tipo Cambio',
    'Tipo Comp. Ref.', 'Serie Comp. Ref.', 'Número Comp. Ref.', 'Estado',
  ]
  const totalCols2 = headers2.length

  const aoa2 = []
  aoa2.push(['REGISTRO DE VENTAS E INGRESOS'])
  aoa2.push([])
  aoa2.push(['RUC:', businessData?.ruc || 'N/A'])
  aoa2.push(['Razón Social:', businessData?.name || 'N/A'])
  aoa2.push(['Período:', filters.startDate && filters.endDate
    ? `${format(new Date(filters.startDate), 'dd/MM/yyyy', { locale: es })} - ${format(new Date(filters.endDate), 'dd/MM/yyyy', { locale: es })}`
    : format(new Date(), 'MM/yyyy', { locale: es })])
  const meta2End = aoa2.length - 1
  aoa2.push([])

  const header2Row = aoa2.length
  aoa2.push(headers2)

  const sunatDocTypeCodes = {
    factura: '01', boleta: '03', nota_venta: '00',
    nota_credito: '07', nota_debito: '08',
    'nota-credito': '07', 'nota-debito': '08',
  }
  const sunatIdTypeCodes = { '1': '1', '6': '6', '0': '0', '4': '4', '7': '7', A: 'A' }

  // Ordenar por fecha
  const sorted = [...invoices].sort((a, b) => {
    const dA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
    const dB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
    return dA - dB
  })

  const dataStart2 = aoa2.length
  sorted.forEach((invoice, index) => {
    const invoiceDate = invoice.createdAt?.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
    const docType = invoice.documentType || 'boleta'
    const parts = (invoice.number || '').split('-')
    const serie = parts[0] || ''
    const numero = parts.slice(1).join('-') || ''

    const customerDocType = invoice.customer?.documentType || '0'
    const customerDocNumber = invoice.customer?.documentNumber || ''

    let baseImponible = 0, importeExonerado = 0, importeInafecto = 0
    if (invoice.items && Array.isArray(invoice.items)) {
      invoice.items.forEach(item => {
        const itemTotal = (item.quantity || 1) * (item.price || item.unitPrice || 0)
        if (item.taxAffectation === '20') importeExonerado += itemTotal
        else if (item.taxAffectation === '30') importeInafecto += itemTotal
        else baseImponible += itemTotal
      })
    }

    const refDocType = invoice.referenceDocumentType ? (sunatDocTypeCodes[invoice.referenceDocumentType] || '') : ''
    const refParts = (invoice.referenceNumber || '').split('-')
    const refSerie = refParts[0] || ''
    const refNumero = refParts.slice(1).join('-') || ''

    let estado = '1'
    if (invoice.status === 'cancelled' || invoice.status === 'voided') estado = '2'

    aoa2.push([
      String(index + 1),
      invoiceDate ? format(invoiceDate, 'dd/MM/yyyy', { locale: es }) : '',
      invoice.dueDate ? format(new Date(invoice.dueDate), 'dd/MM/yyyy', { locale: es }) : '',
      sunatDocTypeCodes[docType] || '00',
      serie, numero,
      sunatIdTypeCodes[customerDocType] || customerDocType || '0',
      customerDocNumber,
      invoice.customer?.name || invoice.customer?.businessName || 'Cliente General',
      Number(baseImponible.toFixed(2)),
      Number((invoice.discount || 0).toFixed(2)),
      Number((invoice.igv || invoice.tax || 0).toFixed(2)),
      Number(importeExonerado.toFixed(2)),
      Number(importeInafecto.toFixed(2)),
      0, 0,
      Number((invoice.total || 0).toFixed(2)),
      1.000,
      refDocType, refSerie, refNumero, estado,
    ])
  })
  const dataEnd2 = aoa2.length - 1

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  ws2['!cols'] = [
    { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 },
    { wch: 10 }, { wch: 15 }, { wch: 35 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
    { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
  ]
  ws2['!rows'] = []
  ws2['!rows'][0] = { hpt: 28 }
  ws2['!rows'][header2Row] = { hpt: 32 }
  ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols2 - 1 } }]

  // Título
  for (let c = 0; c < totalCols2; c++) setStyle(ws2, 0, c, titleStyle)
  // Metadata
  for (let r = 2; r <= meta2End; r++) {
    setStyle(ws2, r, 0, metaLabelStyle)
    setStyle(ws2, r, 1, metaValueStyle)
  }
  // Header
  for (let c = 0; c < totalCols2; c++) setStyle(ws2, header2Row, c, headerStyle)

  // Data rows - columnas numéricas (SUNAT format, sin colores fuertes, solo zebra)
  const numericCols2 = [9, 10, 11, 12, 13, 14, 15, 16, 17] // Base, Desc, IGV, Exo, Ina, ISC, Otros, Total, TC
  for (let i = 0; i < sorted.length; i++) {
    const r = dataStart2 + i
    for (let c = 0; c < totalCols2; c++) {
      if (numericCols2.includes(c)) {
        setStyle(ws2, r, c, numberStyle(i))
      } else if (c === 0 || (c >= 3 && c <= 7) || c === 18 || c === 19 || c === 21) {
        setStyle(ws2, r, c, centerStyle(i))
      } else if (c === 1 || c === 2) {
        setStyle(ws2, r, c, centerStyle(i))
      } else {
        setStyle(ws2, r, c, cellStyle(i))
      }
    }
  }

  ws2['!freeze'] = { xSplit: 0, ySplit: header2Row + 1 }
  XLSX.utils.book_append_sheet(workbook, ws2, 'Registro de Ventas')

  // Generar nombre de archivo
  const filterInfo = filters.type && filters.type !== 'all' ? `_${filters.type}` : ''
  const dateInfo = filters.startDate || filters.endDate ? '_filtrado' : ''
  const fileName = `Comprobantes${filterInfo}${dateInfo}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`

  await saveAndShareExcel(workbook, fileName)
}
