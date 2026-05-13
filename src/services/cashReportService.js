import * as XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { preloadLogo } from '@/utils/pdfGenerator';

/**
 * Helper para guardar y compartir archivos en móvil
 */
const saveAndShareFile = async (data, fileName, mimeType) => {
  const isNativePlatform = Capacitor.isNativePlatform();

  if (isNativePlatform) {
    try {
      const exportDir = 'Caja';
      try {
        await Filesystem.mkdir({
          path: exportDir,
          directory: Directory.Documents,
          recursive: true
        });
      } catch (mkdirError) {
        // Directorio ya existe
      }

      const result = await Filesystem.writeFile({
        path: `${exportDir}/${fileName}`,
        data: data,
        directory: Directory.Documents,
        recursive: true
      });

      console.log('Archivo guardado en:', result.uri);

      await Share.share({
        title: fileName,
        text: `Reporte de caja: ${fileName}`,
        url: result.uri,
        dialogTitle: 'Compartir Reporte de Caja'
      });

      return { success: true, uri: result.uri };
    } catch (error) {
      console.error('Error al exportar archivo en móvil:', error);
      throw error;
    }
  }
  return null;
};

/**
 * Helper para convertir fechas (Firestore Timestamp o Date)
 */
const getDateFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  // Si tiene método toDate(), es un Firestore Timestamp
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  // Si ya es un Date, devolverlo directamente
  if (timestamp instanceof Date) {
    return timestamp;
  }
  // Intentar crear un Date desde el valor
  return new Date(timestamp);
};

/**
 * Helper para formatear los métodos de pago de una factura
 * Si hay múltiples pagos, muestra el detalle de cada uno
 * Prioriza paymentHistory para ventas al crédito/parciales pagadas
 */
const formatPaymentMethods = (invoice) => {
  // Priorizar paymentHistory (ventas al crédito o parciales que fueron pagadas)
  if (invoice.paymentHistory && Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0) {
    if (invoice.paymentHistory.length === 1) {
      return invoice.paymentHistory[0].method || 'Efectivo';
    } else {
      // Múltiples pagos en el historial - mostrar detalle
      return invoice.paymentHistory
        .map(p => `${p.method}: S/${(p.amount || 0).toFixed(2)}`)
        .join(' + ');
    }
  }

  // Usar payments array para ventas normales
  if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    if (invoice.payments.length === 1) {
      // Un solo método de pago
      return invoice.payments[0].method || 'Efectivo';
    } else {
      // Múltiples métodos de pago - mostrar detalle
      return invoice.payments
        .map(p => `${p.method}: S/${(p.amount || 0).toFixed(2)}`)
        .join(' + ');
    }
  }
  // Fallback para facturas antiguas
  return invoice.paymentMethod || 'Efectivo';
};

// =================== ESTILOS (alineados con accountingExportService) ===================
const XLS_COLORS = {
  titleBg: '1E3A8A',       // azul principal
  titleFg: 'FFFFFF',
  subtitleBg: 'E0E7FF',    // banda metadata
  sectionBg: '3730A3',     // header de sección
  sectionFg: 'FFFFFF',
  headerBg: '4338CA',      // header de tabla
  headerFg: 'FFFFFF',
  zebraBg: 'F9FAFB',
  totalBg: 'FEF3C7',
  kpiInitial: 'DBEAFE',    // KPI cards (4 colores)
  kpiInitialText: '1E40AF',
  kpiSales: 'DCFCE7',
  kpiSalesText: '15803D',
  kpiIncome: 'EDE9FE',
  kpiIncomeText: '5B21B6',
  kpiExpense: 'FEE2E2',
  kpiExpenseText: 'B91C1C',
  diffOk: 'D1FAE5',
  diffOkText: '065F46',
  diffBad: 'FECACA',
  diffBadText: '991B1B',
  usdTag: 'D1FAE5',
  usdTagText: '047857',
  border: 'CBD5E1',
}

const XLS_BORDER_ALL = {
  top: { style: 'thin', color: { rgb: XLS_COLORS.border } },
  bottom: { style: 'thin', color: { rgb: XLS_COLORS.border } },
  left: { style: 'thin', color: { rgb: XLS_COLORS.border } },
  right: { style: 'thin', color: { rgb: XLS_COLORS.border } },
}

const sTitle = {
  font: { bold: true, sz: 16, color: { rgb: XLS_COLORS.titleFg } },
  fill: { fgColor: { rgb: XLS_COLORS.titleBg } },
  alignment: { horizontal: 'center', vertical: 'center' },
}

const sMetaLabel = {
  font: { bold: true, sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: XLS_COLORS.subtitleBg } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  border: XLS_BORDER_ALL,
}

const sMetaValue = {
  font: { sz: 10, color: { rgb: '1F2937' } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  border: XLS_BORDER_ALL,
}

const sSection = {
  font: { bold: true, sz: 12, color: { rgb: XLS_COLORS.sectionFg } },
  fill: { fgColor: { rgb: XLS_COLORS.sectionBg } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  border: XLS_BORDER_ALL,
}

const sHeader = {
  font: { bold: true, sz: 10, color: { rgb: XLS_COLORS.headerFg } },
  fill: { fgColor: { rgb: XLS_COLORS.headerBg } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: XLS_BORDER_ALL,
}

const sCell = (i, opts = {}) => ({
  font: { sz: 10, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: i % 2 === 0 ? 'FFFFFF' : XLS_COLORS.zebraBg } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  border: XLS_BORDER_ALL,
  ...opts,
})

const sCellCenter = (i, opts = {}) => ({
  ...sCell(i, opts),
  alignment: { horizontal: 'center', vertical: 'center' },
})

const sCellNumber = (i, opts = {}) => ({
  ...sCell(i, opts),
  alignment: { horizontal: 'right', vertical: 'center', indent: 1 },
  numFmt: opts.currency === 'USD' ? '"$" #,##0.00' : '"S/" #,##0.00',
})

const sKpiLabel = (bg) => ({
  font: { bold: false, sz: 9, color: { rgb: '6B7280' } },
  fill: { fgColor: { rgb: bg } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: XLS_BORDER_ALL,
})

const sKpiValue = (bg, fg, ccy = 'PEN') => ({
  font: { bold: true, sz: 14, color: { rgb: fg } },
  fill: { fgColor: { rgb: bg } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: XLS_BORDER_ALL,
  numFmt: ccy === 'USD' ? '"$" #,##0.00' : '"S/" #,##0.00',
})

const sTotalLabel = {
  font: { bold: true, sz: 11, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: XLS_COLORS.totalBg } },
  alignment: { horizontal: 'right', vertical: 'center', indent: 1 },
  border: XLS_BORDER_ALL,
}

const sTotalNumber = (ccy = 'PEN') => ({
  font: { bold: true, sz: 11, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: XLS_COLORS.totalBg } },
  alignment: { horizontal: 'right', vertical: 'center', indent: 1 },
  border: XLS_BORDER_ALL,
  numFmt: ccy === 'USD' ? '"$" #,##0.00' : '"S/" #,##0.00',
})

const sDifferenceLabel = (ok) => ({
  font: { bold: true, sz: 11, color: { rgb: ok ? XLS_COLORS.diffOkText : XLS_COLORS.diffBadText } },
  fill: { fgColor: { rgb: ok ? XLS_COLORS.diffOk : XLS_COLORS.diffBad } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  border: XLS_BORDER_ALL,
})

const sDifferenceNumber = (ok, ccy = 'PEN') => ({
  font: { bold: true, sz: 12, color: { rgb: ok ? XLS_COLORS.diffOkText : XLS_COLORS.diffBadText } },
  fill: { fgColor: { rgb: ok ? XLS_COLORS.diffOk : XLS_COLORS.diffBad } },
  alignment: { horizontal: 'right', vertical: 'center', indent: 1 },
  border: XLS_BORDER_ALL,
  numFmt: ccy === 'USD' ? '"$" #,##0.00' : '"S/" #,##0.00',
})

const setS = (ws, row, col, style, value = undefined) => {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  if (!ws[addr]) ws[addr] = { t: 's', v: value !== undefined ? value : '' }
  if (value !== undefined) ws[addr].v = value
  ws[addr].s = style
}

const docTypeLabels = {
  factura: 'Factura',
  boleta: 'Boleta',
  nota_venta: 'Nota de Venta',
  nota_credito: 'Nota de Crédito',
  nota_debito: 'Nota de Débito',
}

/**
 * Genera el reporte de cierre de caja en Excel con estilo moderno
 * (estilos, colores, KPI cards, soporte multi-divisa PEN/USD).
 */
export const generateCashReportExcel = async (sessionData, movements, invoices, businessData, deferredPayments = []) => {
  const workbook = XLSX.utils.book_new()

  const openedAtDate = getDateFromTimestamp(sessionData.openedAt)
  const closedAtDate = getDateFromTimestamp(sessionData.closedAt)
  const usd = sessionData?.usd || null

  // ========================================================================
  // HOJA 1: RESUMEN
  // ========================================================================
  const aoa = []

  // Título (fila 0)
  aoa.push(['REPORTE DE CIERRE DE CAJA', '', '', ''])
  aoa.push([])

  // Metadata
  aoa.push(['Negocio:', businessData?.name || 'N/A', '', ''])
  aoa.push(['RUC:', businessData?.ruc || 'N/A', '', ''])
  aoa.push(['Sucursal:', businessData?.branchName || '-', '', ''])
  aoa.push(['Apertura:', openedAtDate ? format(openedAtDate, 'dd/MM/yyyy HH:mm', { locale: es }) : '-', '', ''])
  aoa.push(['Cierre:', closedAtDate ? format(closedAtDate, 'dd/MM/yyyy HH:mm', { locale: es }) : '-', '', ''])
  aoa.push(['Cajero:', sessionData?.closedByName || sessionData?.openedByName || '-', '', ''])
  aoa.push(['Comprobantes:', invoices.length, '', ''])
  const metaEndRow = aoa.length - 1
  aoa.push([])

  // KPI cards (PEN) — label en una fila, valor en la siguiente
  aoa.push(['Monto Inicial', 'Ventas del Día', 'Otros Ingresos', 'Egresos'])
  const kpiLabelRow = aoa.length - 1
  aoa.push([
    Number((sessionData.openingAmount || 0).toFixed(2)),
    Number((sessionData.totalSales || 0).toFixed(2)),
    Number((sessionData.totalIncome || 0).toFixed(2)),
    Number((sessionData.totalExpense || 0).toFixed(2)),
  ])
  const kpiValueRow = aoa.length - 1
  aoa.push([])

  // VENTAS POR MÉTODO + ARQUEO (lado a lado en cols A-B y C-D)
  aoa.push(['VENTAS POR MÉTODO DE PAGO', '', 'ARQUEO DE CIERRE', ''])
  const sectionsRow = aoa.length - 1
  aoa.push(['Método', 'Monto', 'Método', 'Monto'])
  const tablesHeaderRow = aoa.length - 1

  const salesMethods = [
    ['Efectivo', sessionData.salesCash || 0],
    ['Tarjetas', sessionData.salesCard || 0],
    ['Transferencias', sessionData.salesTransfer || 0],
    ...(sessionData.salesYape ? [['Yape', sessionData.salesYape]] : []),
    ...(sessionData.salesPlin ? [['Plin', sessionData.salesPlin]] : []),
    ...(sessionData.salesRappi ? [['Rappi', sessionData.salesRappi]] : []),
    ...(sessionData.salesPedidosYa ? [['PedidosYa', sessionData.salesPedidosYa]] : []),
    ...(sessionData.salesDiDiFood ? [['DiDiFood', sessionData.salesDiDiFood]] : []),
  ]
  const closingMethods = [
    ['Efectivo Contado', sessionData.closingCash || 0],
    ['Tarjetas', sessionData.closingCard || 0],
    ['Transferencias', sessionData.closingTransfer || 0],
    ...(sessionData.closingYape ? [['Yape', sessionData.closingYape]] : []),
    ...(sessionData.closingPlin ? [['Plin', sessionData.closingPlin]] : []),
    ...(sessionData.closingRappi ? [['Rappi', sessionData.closingRappi]] : []),
    ...(sessionData.closingPedidosYa ? [['PedidosYa', sessionData.closingPedidosYa]] : []),
    ...(sessionData.closingDiDiFood ? [['DiDiFood', sessionData.closingDiDiFood]] : []),
  ]

  const maxRows = Math.max(salesMethods.length, closingMethods.length)
  const tableStartRow = aoa.length
  for (let i = 0; i < maxRows; i++) {
    const s = salesMethods[i] || ['', '']
    const c = closingMethods[i] || ['', '']
    aoa.push([s[0], s[1], c[0], c[1]])
  }
  const tableEndRow = aoa.length - 1

  // Total ventas / Total contado
  aoa.push([
    'TOTAL VENTAS', Number((sessionData.totalSales || 0).toFixed(2)),
    'TOTAL CONTADO', Number((sessionData.closingAmount || 0).toFixed(2)),
  ])
  const totalsRow = aoa.length - 1
  aoa.push([])

  // Efectivo esperado + diferencia
  aoa.push(['Efectivo Esperado (Inicial + Ventas Efectivo + Ingresos - Egresos)', '', '', Number((sessionData.expectedAmount || 0).toFixed(2))])
  const expectedRow = aoa.length - 1
  const difference = (sessionData.closingCash || 0) - (sessionData.expectedAmount || 0)
  const diffOk = difference >= 0
  const diffLabel = difference === 0 ? 'Cuadra' : (diffOk ? 'Sobrante' : 'Faltante')
  aoa.push([`DIFERENCIA EN EFECTIVO — ${diffLabel}`, '', '', Number(difference.toFixed(2))])
  const diffRow = aoa.length - 1
  aoa.push([])

  // ========== BLOQUE USD (solo si tuvo actividad) ==========
  let usdSectionRow = -1, usdKpiLabelRow = -1, usdKpiValueRow = -1
  let usdTableSectionRow = -1, usdTableHeaderRow = -1, usdTableStart = -1, usdTableEnd = -1
  let usdTotalsRow = -1, usdExpectedRow = -1, usdDiffRow = -1
  let usdDiffOk = false

  if (usd) {
    aoa.push(['CAJA EN DÓLARES (USD)', '', '', ''])
    usdSectionRow = aoa.length - 1
    aoa.push([])

    aoa.push(['Monto Inicial', 'Ventas del Día', 'Otros Ingresos', 'Egresos'])
    usdKpiLabelRow = aoa.length - 1
    aoa.push([
      Number((usd.openingAmount || 0).toFixed(2)),
      Number((usd.totalSales || 0).toFixed(2)),
      Number((usd.totalIncome || 0).toFixed(2)),
      Number((usd.totalExpense || 0).toFixed(2)),
    ])
    usdKpiValueRow = aoa.length - 1
    aoa.push([])

    aoa.push(['VENTAS USD POR MÉTODO DE PAGO', '', 'ARQUEO USD', ''])
    usdTableSectionRow = aoa.length - 1
    aoa.push(['Método', 'Monto', 'Método', 'Monto'])
    usdTableHeaderRow = aoa.length - 1

    const usdSales = [
      ['Efectivo', usd.salesCash || 0],
      ['Tarjetas', usd.salesCard || 0],
      ['Transferencias', usd.salesTransfer || 0],
      ...(usd.salesYape ? [['Yape', usd.salesYape]] : []),
      ...(usd.salesPlin ? [['Plin', usd.salesPlin]] : []),
    ]
    const usdClosing = [
      ['Efectivo Contado', usd.closingCash || 0],
      ['Tarjetas', usd.closingCard || 0],
      ['Transferencias', usd.closingTransfer || 0],
      ...(usd.closingYape ? [['Yape', usd.closingYape]] : []),
      ...(usd.closingPlin ? [['Plin', usd.closingPlin]] : []),
    ]
    const usdMax = Math.max(usdSales.length, usdClosing.length)
    usdTableStart = aoa.length
    for (let i = 0; i < usdMax; i++) {
      const s = usdSales[i] || ['', '']
      const c = usdClosing[i] || ['', '']
      aoa.push([s[0], s[1], c[0], c[1]])
    }
    usdTableEnd = aoa.length - 1

    aoa.push([
      'TOTAL VENTAS USD', Number((usd.totalSales || 0).toFixed(2)),
      'TOTAL CONTADO USD', Number((usd.closingAmount || 0).toFixed(2)),
    ])
    usdTotalsRow = aoa.length - 1
    aoa.push([])

    aoa.push(['Efectivo USD Esperado (Inicial + Ventas Efectivo + Ingresos - Egresos)', '', '', Number((usd.expectedAmount || 0).toFixed(2))])
    usdExpectedRow = aoa.length - 1
    const diffUSD = (usd.closingCash || 0) - (usd.expectedAmount || 0)
    usdDiffOk = diffUSD >= 0
    const diffUSDLbl = diffUSD === 0 ? 'Cuadra' : (usdDiffOk ? 'Sobrante' : 'Faltante')
    aoa.push([`DIFERENCIA USD — ${diffUSDLbl}`, '', '', Number(diffUSD.toFixed(2))])
    usdDiffRow = aoa.length - 1
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 35 }, { wch: 16 }, { wch: 28 }, { wch: 16 }]
  ws['!rows'] = []
  ws['!rows'][0] = { hpt: 32 }
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // título
    { s: { r: sectionsRow, c: 0 }, e: { r: sectionsRow, c: 1 } },
    { s: { r: sectionsRow, c: 2 }, e: { r: sectionsRow, c: 3 } },
    { s: { r: expectedRow, c: 0 }, e: { r: expectedRow, c: 2 } },
    { s: { r: diffRow, c: 0 }, e: { r: diffRow, c: 2 } },
  ]
  if (usd) {
    ws['!merges'].push(
      { s: { r: usdSectionRow, c: 0 }, e: { r: usdSectionRow, c: 3 } },
      { s: { r: usdTableSectionRow, c: 0 }, e: { r: usdTableSectionRow, c: 1 } },
      { s: { r: usdTableSectionRow, c: 2 }, e: { r: usdTableSectionRow, c: 3 } },
      { s: { r: usdExpectedRow, c: 0 }, e: { r: usdExpectedRow, c: 2 } },
      { s: { r: usdDiffRow, c: 0 }, e: { r: usdDiffRow, c: 2 } },
    )
  }

  // Aplicar estilos
  for (let c = 0; c < 4; c++) setS(ws, 0, c, sTitle)

  for (let r = 2; r <= metaEndRow; r++) {
    setS(ws, r, 0, sMetaLabel)
    setS(ws, r, 1, sMetaValue)
  }

  // KPI cards PEN
  const kpiPalette = [
    { bg: XLS_COLORS.kpiInitial, fg: XLS_COLORS.kpiInitialText },
    { bg: XLS_COLORS.kpiSales, fg: XLS_COLORS.kpiSalesText },
    { bg: XLS_COLORS.kpiIncome, fg: XLS_COLORS.kpiIncomeText },
    { bg: XLS_COLORS.kpiExpense, fg: XLS_COLORS.kpiExpenseText },
  ]
  for (let c = 0; c < 4; c++) {
    setS(ws, kpiLabelRow, c, sKpiLabel(kpiPalette[c].bg))
    setS(ws, kpiValueRow, c, sKpiValue(kpiPalette[c].bg, kpiPalette[c].fg, 'PEN'))
  }
  ws['!rows'][kpiValueRow] = { hpt: 26 }

  // Sección tablas
  for (let c = 0; c < 4; c++) setS(ws, sectionsRow, c, sSection)
  for (let c = 0; c < 4; c++) setS(ws, tablesHeaderRow, c, sHeader)
  for (let r = tableStartRow; r <= tableEndRow; r++) {
    const i = r - tableStartRow
    setS(ws, r, 0, sCell(i))
    setS(ws, r, 1, sCellNumber(i, { currency: 'PEN' }))
    setS(ws, r, 2, sCell(i))
    setS(ws, r, 3, sCellNumber(i, { currency: 'PEN' }))
  }
  setS(ws, totalsRow, 0, sTotalLabel)
  setS(ws, totalsRow, 1, sTotalNumber('PEN'))
  setS(ws, totalsRow, 2, sTotalLabel)
  setS(ws, totalsRow, 3, sTotalNumber('PEN'))

  // Esperado + diferencia
  setS(ws, expectedRow, 0, { ...sMetaLabel, font: { ...sMetaLabel.font, italic: true } })
  setS(ws, expectedRow, 3, sTotalNumber('PEN'))
  setS(ws, diffRow, 0, sDifferenceLabel(diffOk))
  setS(ws, diffRow, 3, sDifferenceNumber(diffOk, 'PEN'))

  // Bloque USD
  if (usd) {
    for (let c = 0; c < 4; c++) setS(ws, usdSectionRow, c, sSection)
    for (let c = 0; c < 4; c++) {
      setS(ws, usdKpiLabelRow, c, sKpiLabel(kpiPalette[c].bg))
      setS(ws, usdKpiValueRow, c, sKpiValue(kpiPalette[c].bg, kpiPalette[c].fg, 'USD'))
    }
    ws['!rows'][usdKpiValueRow] = { hpt: 26 }

    for (let c = 0; c < 4; c++) setS(ws, usdTableSectionRow, c, sSection)
    for (let c = 0; c < 4; c++) setS(ws, usdTableHeaderRow, c, sHeader)
    for (let r = usdTableStart; r <= usdTableEnd; r++) {
      const i = r - usdTableStart
      setS(ws, r, 0, sCell(i))
      setS(ws, r, 1, sCellNumber(i, { currency: 'USD' }))
      setS(ws, r, 2, sCell(i))
      setS(ws, r, 3, sCellNumber(i, { currency: 'USD' }))
    }
    setS(ws, usdTotalsRow, 0, sTotalLabel)
    setS(ws, usdTotalsRow, 1, sTotalNumber('USD'))
    setS(ws, usdTotalsRow, 2, sTotalLabel)
    setS(ws, usdTotalsRow, 3, sTotalNumber('USD'))

    setS(ws, usdExpectedRow, 0, { ...sMetaLabel, font: { ...sMetaLabel.font, italic: true } })
    setS(ws, usdExpectedRow, 3, sTotalNumber('USD'))
    setS(ws, usdDiffRow, 0, sDifferenceLabel(usdDiffOk))
    setS(ws, usdDiffRow, 3, sDifferenceNumber(usdDiffOk, 'USD'))
  }

  XLSX.utils.book_append_sheet(workbook, ws, 'Resumen')

  // ========================================================================
  // HOJA 2: COMPROBANTES
  // ========================================================================
  if (invoices.length > 0) {
    const hasUsdInvoices = invoices.some(i => i.currency === 'USD')
    const invHeaders = ['N°', 'Tipo', 'Cliente', 'Documento', 'Método de Pago', 'Total', ...(hasUsdInvoices ? ['Moneda'] : []), 'Estado', 'Fecha']
    const totalCols = invHeaders.length
    const ia = []
    ia.push(['COMPROBANTES DE LA SESIÓN', ...Array(totalCols - 1).fill('')])
    ia.push([])
    ia.push(['Total:', invoices.length, '', '', '', '', ...(hasUsdInvoices ? [''] : []), '', ''])
    ia.push([])
    ia.push(invHeaders)
    const invHeaderRow = ia.length - 1
    const invStart = ia.length
    invoices.forEach(inv => {
      const invDate = getDateFromTimestamp(inv.createdAt)
      const isVoided = inv.status === 'cancelled' || inv.status === 'voided'
      const isNC = inv.documentType === 'nota_credito'
      const isPending = inv.paymentStatus === 'pending'
      const isPartial = inv.paymentStatus === 'partial'
      const statusText = isVoided ? 'Anulado' : (isNC ? 'Devolución' : (isPending ? 'Crédito' : (isPartial ? 'Parcial' : 'Pagado')))
      const row = [
        inv.number || '-',
        docTypeLabels[inv.documentType] || inv.documentType || '-',
        inv.customer?.businessName || inv.customer?.name || inv.customerName || 'Cliente General',
        inv.customer?.documentNumber || '-',
        formatPaymentMethods(inv),
        Number((inv.total || 0).toFixed(2)),
        ...(hasUsdInvoices ? [inv.currency === 'USD' ? 'USD' : 'PEN'] : []),
        statusText,
        invDate ? format(invDate, 'dd/MM/yyyy HH:mm', { locale: es }) : '-',
      ]
      ia.push(row)
    })
    const invEnd = ia.length - 1

    const wsInv = XLSX.utils.aoa_to_sheet(ia)
    const colWidths = [
      { wch: 18 }, { wch: 14 }, { wch: 32 }, { wch: 14 },
      { wch: 30 }, { wch: 13 },
      ...(hasUsdInvoices ? [{ wch: 10 }] : []),
      { wch: 13 }, { wch: 18 },
    ]
    wsInv['!cols'] = colWidths
    wsInv['!rows'] = []
    wsInv['!rows'][0] = { hpt: 28 }
    wsInv['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }]

    for (let c = 0; c < totalCols; c++) setS(wsInv, 0, c, sTitle)
    setS(wsInv, 2, 0, sMetaLabel)
    setS(wsInv, 2, 1, sMetaValue)
    for (let c = 0; c < totalCols; c++) setS(wsInv, invHeaderRow, c, sHeader)
    for (let r = invStart; r <= invEnd; r++) {
      const i = r - invStart
      const inv = invoices[i]
      const isUSD = inv?.currency === 'USD'
      setS(wsInv, r, 0, sCellCenter(i))   // N°
      setS(wsInv, r, 1, sCellCenter(i))   // Tipo
      setS(wsInv, r, 2, sCell(i))         // Cliente
      setS(wsInv, r, 3, sCellCenter(i))   // Documento
      setS(wsInv, r, 4, sCell(i))         // Método
      setS(wsInv, r, 5, sCellNumber(i, { currency: isUSD ? 'USD' : 'PEN' })) // Total
      let nextCol = 6
      if (hasUsdInvoices) {
        // Badge moneda
        setS(wsInv, r, nextCol++, {
          ...sCellCenter(i),
          font: { bold: true, sz: 9, color: { rgb: isUSD ? XLS_COLORS.usdTagText : '6B7280' } },
          fill: { fgColor: { rgb: isUSD ? XLS_COLORS.usdTag : (i % 2 === 0 ? 'FFFFFF' : XLS_COLORS.zebraBg) } },
        })
      }
      setS(wsInv, r, nextCol++, sCellCenter(i)) // Estado
      setS(wsInv, r, nextCol++, sCellCenter(i)) // Fecha
    }
    wsInv['!freeze'] = { xSplit: 0, ySplit: invHeaderRow + 1 }
    XLSX.utils.book_append_sheet(workbook, wsInv, 'Comprobantes')
  }

  // ========================================================================
  // HOJA 3: PAGOS DE COMPROBANTES ANTERIORES (cobros diferidos)
  // ========================================================================
  if (deferredPayments.length > 0) {
    const hasUsdDef = deferredPayments.some(p => p.currency === 'USD')
    const defHeaders = ['Comprobante', 'Cliente', 'Método', 'Monto', ...(hasUsdDef ? ['Moneda'] : []), 'Hora']
    const totalDef = defHeaders.length
    const da = []
    da.push(['PAGOS DE COMPROBANTES ANTERIORES', ...Array(totalDef - 1).fill('')])
    da.push(['(Cobros recibidos hoy sobre comprobantes emitidos en sesiones previas)', ...Array(totalDef - 1).fill('')])
    da.push([])
    da.push(defHeaders)
    const defHeaderRow = da.length - 1
    const defStart = da.length
    let defTotalPEN = 0, defTotalUSD = 0
    deferredPayments.forEach(p => {
      const time = p.date instanceof Date ? format(p.date, 'dd/MM/yyyy HH:mm', { locale: es }) : '-'
      const isUSD = p.currency === 'USD'
      if (isUSD) defTotalUSD += p.amount || 0
      else defTotalPEN += p.amount || 0
      da.push([
        p.invoiceNumber || '-',
        p.customerName || '-',
        p.method || '-',
        Number((p.amount || 0).toFixed(2)),
        ...(hasUsdDef ? [isUSD ? 'USD' : 'PEN'] : []),
        time,
      ])
    })
    const defEnd = da.length - 1
    da.push([])
    da.push(['', '', 'TOTAL PEN', Number(defTotalPEN.toFixed(2)), ...(hasUsdDef ? [''] : []), ''])
    const defTotalRow = da.length - 1
    let defTotalUSDRow = -1
    if (hasUsdDef && defTotalUSD > 0) {
      da.push(['', '', 'TOTAL USD', Number(defTotalUSD.toFixed(2)), '', ''])
      defTotalUSDRow = da.length - 1
    }

    const wsDef = XLSX.utils.aoa_to_sheet(da)
    wsDef['!cols'] = [
      { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 13 },
      ...(hasUsdDef ? [{ wch: 10 }] : []),
      { wch: 18 },
    ]
    wsDef['!rows'] = []
    wsDef['!rows'][0] = { hpt: 28 }
    wsDef['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalDef - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalDef - 1 } },
    ]

    for (let c = 0; c < totalDef; c++) setS(wsDef, 0, c, sTitle)
    setS(wsDef, 1, 0, { ...sMetaValue, font: { ...sMetaValue.font, italic: true, color: { rgb: '6B7280' } } })
    for (let c = 0; c < totalDef; c++) setS(wsDef, defHeaderRow, c, sHeader)
    for (let r = defStart; r <= defEnd; r++) {
      const i = r - defStart
      const p = deferredPayments[i]
      const isUSD = p?.currency === 'USD'
      setS(wsDef, r, 0, sCellCenter(i))
      setS(wsDef, r, 1, sCell(i))
      setS(wsDef, r, 2, sCellCenter(i))
      setS(wsDef, r, 3, sCellNumber(i, { currency: isUSD ? 'USD' : 'PEN' }))
      let nextCol = 4
      if (hasUsdDef) {
        setS(wsDef, r, nextCol++, {
          ...sCellCenter(i),
          font: { bold: true, sz: 9, color: { rgb: isUSD ? XLS_COLORS.usdTagText : '6B7280' } },
          fill: { fgColor: { rgb: isUSD ? XLS_COLORS.usdTag : (i % 2 === 0 ? 'FFFFFF' : XLS_COLORS.zebraBg) } },
        })
      }
      setS(wsDef, r, nextCol++, sCellCenter(i))
    }
    setS(wsDef, defTotalRow, 2, sTotalLabel)
    setS(wsDef, defTotalRow, 3, sTotalNumber('PEN'))
    if (defTotalUSDRow >= 0) {
      setS(wsDef, defTotalUSDRow, 2, sTotalLabel)
      setS(wsDef, defTotalUSDRow, 3, sTotalNumber('USD'))
    }
    wsDef['!freeze'] = { xSplit: 0, ySplit: defHeaderRow + 1 }
    XLSX.utils.book_append_sheet(workbook, wsDef, 'Pagos Anteriores')
  }

  // ========================================================================
  // HOJA 4: MOVIMIENTOS MANUALES
  // ========================================================================
  if (movements.length > 0) {
    const hasUsdMov = movements.some(m => m.currency === 'USD')
    const movHeaders = ['Tipo', 'Categoría', 'Descripción', 'Monto', ...(hasUsdMov ? ['Moneda'] : []), 'Fecha']
    const totalMov = movHeaders.length
    const ma = []
    ma.push(['MOVIMIENTOS MANUALES (Ingresos y Egresos adicionales)', ...Array(totalMov - 1).fill('')])
    ma.push([])
    ma.push(movHeaders)
    const movHeaderRow = ma.length - 1
    const movStart = ma.length
    let totalIncomePEN = 0, totalExpensePEN = 0, totalIncomeUSD = 0, totalExpenseUSD = 0
    movements.forEach(m => {
      const mDate = getDateFromTimestamp(m.createdAt)
      const isUSD = m.currency === 'USD'
      const amt = m.amount || 0
      if (m.type === 'income') { if (isUSD) totalIncomeUSD += amt; else totalIncomePEN += amt }
      else { if (isUSD) totalExpenseUSD += amt; else totalExpensePEN += amt }
      ma.push([
        m.type === 'income' ? 'Ingreso' : 'Egreso',
        m.category || 'Otros',
        m.description || '-',
        Number(amt.toFixed(2)),
        ...(hasUsdMov ? [isUSD ? 'USD' : 'PEN'] : []),
        mDate ? format(mDate, 'dd/MM/yyyy HH:mm', { locale: es }) : '-',
      ])
    })
    const movEnd = ma.length - 1
    ma.push([])
    ma.push(['', '', 'Total Ingresos PEN:', Number(totalIncomePEN.toFixed(2)), ...(hasUsdMov ? [''] : []), ''])
    const tIPenRow = ma.length - 1
    ma.push(['', '', 'Total Egresos PEN:', Number(totalExpensePEN.toFixed(2)), ...(hasUsdMov ? [''] : []), ''])
    const tEPenRow = ma.length - 1
    let tIUsdRow = -1, tEUsdRow = -1
    if (hasUsdMov) {
      ma.push(['', '', 'Total Ingresos USD:', Number(totalIncomeUSD.toFixed(2)), '', ''])
      tIUsdRow = ma.length - 1
      ma.push(['', '', 'Total Egresos USD:', Number(totalExpenseUSD.toFixed(2)), '', ''])
      tEUsdRow = ma.length - 1
    }

    const wsMov = XLSX.utils.aoa_to_sheet(ma)
    wsMov['!cols'] = [
      { wch: 12 }, { wch: 22 }, { wch: 40 }, { wch: 13 },
      ...(hasUsdMov ? [{ wch: 10 }] : []),
      { wch: 18 },
    ]
    wsMov['!rows'] = []
    wsMov['!rows'][0] = { hpt: 28 }
    wsMov['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalMov - 1 } }]

    for (let c = 0; c < totalMov; c++) setS(wsMov, 0, c, sTitle)
    for (let c = 0; c < totalMov; c++) setS(wsMov, movHeaderRow, c, sHeader)
    for (let r = movStart; r <= movEnd; r++) {
      const i = r - movStart
      const m = movements[i]
      const isUSD = m?.currency === 'USD'
      setS(wsMov, r, 0, sCellCenter(i))
      setS(wsMov, r, 1, sCell(i))
      setS(wsMov, r, 2, sCell(i))
      setS(wsMov, r, 3, sCellNumber(i, { currency: isUSD ? 'USD' : 'PEN' }))
      let nextCol = 4
      if (hasUsdMov) {
        setS(wsMov, r, nextCol++, {
          ...sCellCenter(i),
          font: { bold: true, sz: 9, color: { rgb: isUSD ? XLS_COLORS.usdTagText : '6B7280' } },
          fill: { fgColor: { rgb: isUSD ? XLS_COLORS.usdTag : (i % 2 === 0 ? 'FFFFFF' : XLS_COLORS.zebraBg) } },
        })
      }
      setS(wsMov, r, nextCol++, sCellCenter(i))
    }
    setS(wsMov, tIPenRow, 2, sTotalLabel)
    setS(wsMov, tIPenRow, 3, sTotalNumber('PEN'))
    setS(wsMov, tEPenRow, 2, sTotalLabel)
    setS(wsMov, tEPenRow, 3, sTotalNumber('PEN'))
    if (tIUsdRow >= 0) {
      setS(wsMov, tIUsdRow, 2, sTotalLabel)
      setS(wsMov, tIUsdRow, 3, sTotalNumber('USD'))
      setS(wsMov, tEUsdRow, 2, sTotalLabel)
      setS(wsMov, tEUsdRow, 3, sTotalNumber('USD'))
    }
    wsMov['!freeze'] = { xSplit: 0, ySplit: movHeaderRow + 1 }
    XLSX.utils.book_append_sheet(workbook, wsMov, 'Movimientos')
  }

  // ========================================================================
  // Generar archivo
  // ========================================================================
  const fileName = `Cierre_Caja_${format(closedAtDate || new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`
  const isNativePlatform = Capacitor.isNativePlatform()
  if (isNativePlatform) {
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })
    await saveAndShareFile(excelBuffer, fileName)
  } else {
    XLSX.writeFile(workbook, fileName)
  }
}

/**
 * Helper para convertir hex a RGB
 */
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [70, 70, 70];
};

/**
 * Generar reporte de cierre de caja en PDF (estilo profesional compacto)
 */
export const generateCashReportPDF = async (sessionData, movements, invoices, businessData, closedWithoutReceipt = [], orderModifications = [], deferredPayments = []) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const openedAtDate = getDateFromTimestamp(sessionData.openedAt);
  const closedAtDate = getDateFromTimestamp(sessionData.closedAt);

  const ACCENT = hexToRgb(businessData?.pdfAccentColor || '#464646');
  const DARK = [50, 50, 50];
  const MED = [110, 110, 110];
  const LIGHT = [245, 245, 245];

  const ML = 15;
  const PW = 210;
  const PH = 297;
  const CW = PW - ML * 2;
  const RX = PW - ML; // right x
  const fmt = (n, ccy = 'PEN') => `${ccy === 'USD' ? '$' : 'S/'} ${(n || 0).toFixed(2)}`;

  let y = 0;

  // ===== HEADER (barra de acento) =====
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, PW, 32, 'F');

  // Logo
  let textX = ML;
  if (businessData?.logoUrl) {
    try {
      const imgData = await preloadLogo(businessData.logoUrl);
      if (imgData) {
        const imgFmt = businessData.logoUrl.toLowerCase().includes('.jp') ? 'JPEG' : 'PNG';
        const img = new Image();
        img.src = imgData;
        await new Promise(r => { img.onload = r; img.onerror = r; });
        const ar = img.width / img.height;
        const lh = 18;
        const lw = Math.min(lh * ar, 50);
        doc.addImage(imgData, imgFmt, ML, 7, lw, lw / ar, undefined, 'FAST');
        textX = ML + lw + 5;
      }
    } catch (e) { /* sin logo */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(businessData?.name || 'NEGOCIO', textX, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  if (businessData?.ruc) doc.text(`RUC: ${businessData.ruc}`, textX, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CIERRE DE CAJA', textX, 24);

  // Fechas derecha
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(210, 210, 210);
  const aStr = openedAtDate ? format(openedAtDate, "dd/MM/yyyy HH:mm", { locale: es }) : '-';
  const cStr = closedAtDate ? format(closedAtDate, "dd/MM/yyyy HH:mm", { locale: es }) : '-';
  doc.text(`Apertura: ${aStr}`, RX, 11, { align: 'right' });
  doc.text(`Cierre: ${cStr}`, RX, 16, { align: 'right' });
  if (sessionData.closedByName) {
    doc.text(`Cajero: ${sessionData.closedByName}`, RX, 21, { align: 'right' });
  }

  y = 37;

  // ===== RESUMEN (4 mini-cards en fila) =====
  const cw4 = (CW - 4.5) / 4; // ancho de cada card
  const ch = 14;
  const cards = [
    { lbl: 'Monto Inicial', val: fmt(sessionData.openingAmount), bg: [230, 242, 255], tc: [30, 80, 180] },
    { lbl: 'Ventas del Día', val: fmt(sessionData.totalSales), bg: [230, 250, 240], tc: [5, 120, 80] },
    { lbl: 'Otros Ingresos', val: fmt(sessionData.totalIncome), bg: [240, 238, 255], tc: [100, 40, 200] },
    { lbl: 'Egresos', val: fmt(sessionData.totalExpense), bg: [255, 238, 238], tc: [180, 30, 30] },
  ];
  cards.forEach((c, i) => {
    const cx = ML + i * (cw4 + 1.5);
    doc.setFillColor(...c.bg);
    doc.roundedRect(cx, y, cw4, ch, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(...MED);
    doc.text(c.lbl, cx + 3, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...c.tc);
    doc.text(c.val, cx + 3, y + 11);
  });
  y += ch + 6;

  // ===== Helper: section title =====
  const section = (title) => {
    doc.setFillColor(...ACCENT);
    doc.rect(ML, y, CW, 0.6, 'F');
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...DARK);
    doc.text(title, ML, y);
    y += 4;
  };

  // ===== Helper: row =====
  const row = (label, value, idx, bold) => {
    if (idx % 2 === 0) {
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y, CW, 5.5, 'F');
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...DARK);
    doc.text(label, ML + 2, y + 3.8);
    doc.text(value, RX - 2, y + 3.8, { align: 'right' });
    y += 5.5;
  };

  // ===== Helper: total row =====
  const totalRow = (label, value) => {
    doc.setFillColor(...ACCENT);
    doc.rect(ML, y, CW, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(label, ML + 2, y + 4);
    doc.text(value, RX - 2, y + 4, { align: 'right' });
    y += 8;
  };

  // ===== VENTAS POR MÉTODO DE PAGO (izq) + ARQUEO DE CIERRE (der) - lado a lado =====
  const colW = (CW - 5) / 2;
  const colL = ML;
  const colR = ML + colW + 5;
  const startY = y;

  // -- Columna izquierda: Ventas por método --
  let yL = startY;
  doc.setFillColor(...ACCENT);
  doc.rect(colL, yL, colW, 0.6, 'F');
  yL += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...DARK);
  doc.text('VENTAS POR MÉTODO DE PAGO', colL, yL);
  yL += 4;

  const salesItems = [
    ['Efectivo', sessionData.salesCash || 0],
    ['Tarjetas', sessionData.salesCard || 0],
    ['Transferencias', sessionData.salesTransfer || 0],
    ...(sessionData.salesYape ? [['Yape', sessionData.salesYape]] : []),
    ...(sessionData.salesPlin ? [['Plin', sessionData.salesPlin]] : []),
    ...(sessionData.salesRappi ? [['Rappi', sessionData.salesRappi]] : []),
    ...(sessionData.salesPedidosYa ? [['PedidosYa', sessionData.salesPedidosYa]] : []),
    ...(sessionData.salesDiDiFood ? [['DiDiFood', sessionData.salesDiDiFood]] : []),
  ];

  salesItems.forEach(([lbl, val], i) => {
    if (i % 2 === 0) { doc.setFillColor(...LIGHT); doc.rect(colL, yL, colW, 5, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...DARK);
    doc.text(lbl, colL + 2, yL + 3.5);
    doc.text(fmt(val), colL + colW - 2, yL + 3.5, { align: 'right' });
    yL += 5;
  });
  doc.setFillColor(...ACCENT); doc.rect(colL, yL, colW, 5.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255);
  doc.text('TOTAL VENTAS', colL + 2, yL + 3.8);
  doc.text(fmt(sessionData.totalSales), colL + colW - 2, yL + 3.8, { align: 'right' });
  yL += 5.5;

  // -- Columna derecha: Arqueo de cierre --
  let yR = startY;
  doc.setFillColor(...ACCENT);
  doc.rect(colR, yR, colW, 0.6, 'F');
  yR += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...DARK);
  doc.text('ARQUEO DE CIERRE', colR, yR);
  yR += 4;

  const closingItems = [
    ['Efectivo Contado', sessionData.closingCash || 0],
    ['Tarjetas', sessionData.closingCard || 0],
    ['Transferencias', sessionData.closingTransfer || 0],
    ...(sessionData.closingYape ? [['Yape', sessionData.closingYape]] : []),
    ...(sessionData.closingPlin ? [['Plin', sessionData.closingPlin]] : []),
    ...(sessionData.closingRappi ? [['Rappi', sessionData.closingRappi]] : []),
    ...(sessionData.closingPedidosYa ? [['PedidosYa', sessionData.closingPedidosYa]] : []),
    ...(sessionData.closingDiDiFood ? [['DiDiFood', sessionData.closingDiDiFood]] : []),
  ];

  closingItems.forEach(([lbl, val], i) => {
    if (i % 2 === 0) { doc.setFillColor(...LIGHT); doc.rect(colR, yR, colW, 5, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...DARK);
    doc.text(lbl, colR + 2, yR + 3.5);
    doc.text(fmt(val), colR + colW - 2, yR + 3.5, { align: 'right' });
    yR += 5;
  });
  doc.setFillColor(...ACCENT); doc.rect(colR, yR, colW, 5.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255);
  doc.text('TOTAL CONTADO', colR + 2, yR + 3.8);
  doc.text(fmt(sessionData.closingAmount), colR + colW - 2, yR + 3.8, { align: 'right' });
  yR += 5.5;

  y = Math.max(yL, yR) + 5;

  // ===== EFECTIVO ESPERADO + DIFERENCIA =====
  doc.setFillColor(240, 240, 240);
  doc.roundedRect(ML, y, CW, 7, 1, 1, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...MED);
  doc.text('Efectivo Esperado (Inicial + Ventas Efectivo + Ingresos - Egresos)', ML + 2, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text(fmt(sessionData.expectedAmount), RX - 2, y + 4.8, { align: 'right' });
  y += 9;

  const difference = (sessionData.closingCash || 0) - (sessionData.expectedAmount || 0);
  const diffOk = difference >= 0;
  const diffBg = diffOk ? [230, 250, 240] : [255, 235, 235];
  const diffTc = diffOk ? [5, 120, 80] : [180, 30, 30];
  const diffLbl = difference === 0 ? 'Cuadra' : (diffOk ? 'Sobrante' : 'Faltante');

  doc.setFillColor(...diffBg);
  doc.roundedRect(ML, y, CW, 9, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...diffTc);
  doc.text(`DIFERENCIA EN EFECTIVO — ${diffLbl}`, ML + 2, y + 5.5);
  doc.setFontSize(10);
  doc.text(fmt(difference), RX - 2, y + 6, { align: 'right' });
  y += 13;

  // ===== BLOQUE USD (solo si la sesión tuvo actividad en dólares) =====
  // Diseñado para verse como una continuación natural del bloque PEN:
  // mismo estilo de section(), mismas cards, mismo ACCENT en headers/totals.
  // La distinción USD se hace con un pill discreto y los valores con "$".
  const usd = sessionData?.usd
  if (usd) {
    if (y > PH - 60) { doc.addPage(); y = 10; }

    // Separador visual: línea fina + título con pill "USD"
    doc.setFillColor(...ACCENT)
    doc.rect(ML, y, CW, 0.6, 'F')
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    doc.text('CAJA EN DÓLARES', ML, y)
    // Pill USD pequeño al lado del título
    const titleW = doc.getTextWidth('CAJA EN DÓLARES')
    doc.setFillColor(220, 245, 232)
    doc.roundedRect(ML + titleW + 2, y - 2.5, 9, 3.5, 0.5, 0.5, 'F')
    doc.setFontSize(5.5)
    doc.setTextColor(5, 120, 80)
    doc.text('USD', ML + titleW + 6.5, y + 0.3, { align: 'center' })
    doc.setTextColor(...DARK)
    y += 5

    // 4 mini-cards USD — mismos colores semánticos que las PEN
    const usdCards = [
      { lbl: 'Monto Inicial', val: fmt(usd.openingAmount || 0, 'USD'), bg: [230, 242, 255], tc: [30, 80, 180] },
      { lbl: 'Ventas del Día', val: fmt(usd.totalSales || 0, 'USD'), bg: [230, 250, 240], tc: [5, 120, 80] },
      { lbl: 'Otros Ingresos', val: fmt(usd.totalIncome || 0, 'USD'), bg: [240, 238, 255], tc: [100, 40, 200] },
      { lbl: 'Egresos', val: fmt(usd.totalExpense || 0, 'USD'), bg: [255, 238, 238], tc: [180, 30, 30] },
    ]
    usdCards.forEach((c, i) => {
      const cx = ML + i * (cw4 + 1.5)
      doc.setFillColor(...c.bg)
      doc.roundedRect(cx, y, cw4, ch, 1.5, 1.5, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.5)
      doc.setTextColor(...MED)
      doc.text(c.lbl, cx + 3, y + 5)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...c.tc)
      doc.text(c.val, cx + 3, y + 11)
    })
    y += ch + 6

    // Dos columnas: Ventas por método | Arqueo — mismo estilo que PEN
    const sYL = y
    doc.setFillColor(...ACCENT); doc.rect(colL, sYL, colW, 0.6, 'F')
    let yLu = sYL + 4
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...DARK)
    doc.text('VENTAS POR MÉTODO DE PAGO', colL, yLu); yLu += 4

    const salesUSD = [
      ['Efectivo', usd.salesCash || 0],
      ['Tarjetas', usd.salesCard || 0],
      ['Transferencias', usd.salesTransfer || 0],
      ...(usd.salesYape ? [['Yape', usd.salesYape]] : []),
      ...(usd.salesPlin ? [['Plin', usd.salesPlin]] : []),
    ]
    salesUSD.forEach(([lbl, val], i) => {
      if (i % 2 === 0) { doc.setFillColor(...LIGHT); doc.rect(colL, yLu, colW, 5, 'F') }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...DARK)
      doc.text(lbl, colL + 2, yLu + 3.5)
      doc.text(fmt(val, 'USD'), colL + colW - 2, yLu + 3.5, { align: 'right' })
      yLu += 5
    })
    doc.setFillColor(...ACCENT); doc.rect(colL, yLu, colW, 5.5, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255)
    doc.text('TOTAL VENTAS', colL + 2, yLu + 3.8)
    doc.text(fmt(usd.totalSales || 0, 'USD'), colL + colW - 2, yLu + 3.8, { align: 'right' })
    yLu += 5.5

    let yRu = sYL
    doc.setFillColor(...ACCENT); doc.rect(colR, yRu, colW, 0.6, 'F'); yRu += 4
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...DARK)
    doc.text('ARQUEO DE CIERRE', colR, yRu); yRu += 4

    const closingUSD = [
      ['Efectivo Contado', usd.closingCash || 0],
      ['Tarjetas', usd.closingCard || 0],
      ['Transferencias', usd.closingTransfer || 0],
      ...(usd.closingYape ? [['Yape', usd.closingYape]] : []),
      ...(usd.closingPlin ? [['Plin', usd.closingPlin]] : []),
    ]
    closingUSD.forEach(([lbl, val], i) => {
      if (i % 2 === 0) { doc.setFillColor(...LIGHT); doc.rect(colR, yRu, colW, 5, 'F') }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...DARK)
      doc.text(lbl, colR + 2, yRu + 3.5)
      doc.text(fmt(val, 'USD'), colR + colW - 2, yRu + 3.5, { align: 'right' })
      yRu += 5
    })
    doc.setFillColor(...ACCENT); doc.rect(colR, yRu, colW, 5.5, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255)
    doc.text('TOTAL CONTADO', colR + 2, yRu + 3.8)
    doc.text(fmt(usd.closingAmount || 0, 'USD'), colR + colW - 2, yRu + 3.8, { align: 'right' })
    yRu += 5.5

    y = Math.max(yLu, yRu) + 5

    // Efectivo esperado USD (mismo estilo que PEN)
    doc.setFillColor(240, 240, 240)
    doc.roundedRect(ML, y, CW, 7, 1, 1, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MED)
    doc.text('Efectivo Esperado (Inicial + Ventas Efectivo + Ingresos - Egresos)', ML + 2, y + 4.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...DARK)
    doc.text(fmt(usd.expectedAmount || 0, 'USD'), RX - 2, y + 4.8, { align: 'right' })
    y += 9

    // Diferencia USD (mismo estilo que PEN)
    const diffUSD = (usd.closingCash || 0) - (usd.expectedAmount || 0)
    const diffUSDOk = diffUSD >= 0
    const diffUSDBg = diffUSDOk ? [230, 250, 240] : [255, 235, 235]
    const diffUSDTc = diffUSDOk ? [5, 120, 80] : [180, 30, 30]
    const diffUSDLbl = diffUSD === 0 ? 'Cuadra' : (diffUSDOk ? 'Sobrante' : 'Faltante')
    doc.setFillColor(...diffUSDBg)
    doc.roundedRect(ML, y, CW, 9, 1, 1, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...diffUSDTc)
    doc.text(`DIFERENCIA EN EFECTIVO — ${diffUSDLbl}`, ML + 2, y + 5.5)
    doc.setFontSize(10)
    doc.text(fmt(diffUSD, 'USD'), RX - 2, y + 6, { align: 'right' })
    y += 13
  }

  // ===== PAGOS DE COMPROBANTES ANTERIORES (cobros diferidos) =====
  if (deferredPayments.length > 0) {
    if (y > PH - 40) { doc.addPage(); y = 10; }
    section(`PAGOS DE COMPROBANTES ANTERIORES (${deferredPayments.length})`);

    // Subtítulo explicativo
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6);
    doc.setTextColor(...MED);
    doc.text('Cobros recibidos hoy sobre comprobantes emitidos en sesiones previas. Ya están sumados a las ventas por método de pago.', ML, y);
    y += 5;

    // Header de tabla
    doc.setFillColor(...LIGHT);
    doc.rect(ML, y, CW, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...MED);
    doc.text('COMPROBANTE', ML + 2, y + 3.3);
    doc.text('CLIENTE', ML + 40, y + 3.3);
    doc.text('MÉTODO', ML + 100, y + 3.3);
    doc.text('MONTO', RX - 20, y + 3.3, { align: 'right' });
    doc.text('HORA', RX - 2, y + 3.3, { align: 'right' });
    y += 5;

    let deferredTotal = 0;
    deferredPayments.forEach((p, i) => {
      if (y > PH - 15) { doc.addPage(); y = 10; }
      deferredTotal += p.amount || 0;
      if (i % 2 === 0) { doc.setFillColor(255, 251, 235); doc.rect(ML, y, CW, 5, 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...DARK);
      doc.text((p.invoiceNumber || '-').substring(0, 18), ML + 2, y + 3.3);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
      doc.text((p.customerName || 'Cliente General').substring(0, 32), ML + 40, y + 3.3);
      doc.text((p.method || '-').substring(0, 14), ML + 100, y + 3.3);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(5, 120, 80);
      doc.text(`+${fmt(p.amount || 0)}`, RX - 20, y + 3.3, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...MED);
      const time = p.date instanceof Date
        ? p.date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        : '-';
      doc.text(time, RX - 2, y + 3.3, { align: 'right' });
      y += 5;
    });
    // Total
    doc.setFillColor(...ACCENT);
    doc.rect(ML, y, CW, 5.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255);
    doc.text('TOTAL COBRADO ANTERIORES', ML + 2, y + 3.8);
    doc.text(fmt(deferredTotal), RX - 2, y + 3.8, { align: 'right' });
    y += 8;
  }

  // ===== MOVIMIENTOS ADICIONALES =====
  if (movements.length > 0) {
    if (y > PH - 40) { doc.addPage(); y = 10; }
    section(`MOVIMIENTOS ADICIONALES (${movements.length})`);
    movements.forEach((m, i) => {
      row(
        `${m.type === 'income' ? '+ Ingreso' : '- Egreso'}: ${m.description || '-'} (${m.category || '-'})`,
        fmt(m.amount), i, false
      );
    });
    y += 4;
  }

  // ===== COMPROBANTES DE LA SESIÓN =====
  if (invoices.length > 0) {
    if (y > PH - 40) { doc.addPage(); y = 10; }
    section(`COMPROBANTES DE LA SESIÓN (${invoices.length})`);

    // Header de tabla
    doc.setFillColor(...LIGHT);
    doc.rect(ML, y, CW, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...MED);
    doc.text('NÚMERO', ML + 2, y + 3.3);
    doc.text('TIPO', ML + 33, y + 3.3);
    doc.text('CLIENTE', ML + 55, y + 3.3);
    doc.text('PAGO', ML + 105, y + 3.3);
    doc.text('TOTAL', ML + 143, y + 3.3, { align: 'right' });
    doc.text('ESTADO', ML + 148, y + 3.3);
    y += 5;

    const docTypeLabels = { factura: 'Factura', boleta: 'Boleta', nota_venta: 'N. Venta', nota_credito: 'N. Crédito', nota_debito: 'N. Débito' };

    const getInvoiceStatus = (inv) => {
      const isVoided = inv.status === 'cancelled' || inv.status === 'voided' || inv.sunatStatus === 'voided';
      if (isVoided) return { label: 'Anulado', color: [220, 38, 38], excluded: true };
      if (inv.documentType === 'nota_credito') return { label: 'NC', color: [234, 88, 12], excluded: true };
      if (inv.documentType === 'nota_venta' && inv.convertedTo) return { label: 'Convertida', color: [37, 99, 235], excluded: true };
      if (inv.status === 'pending_cancellation' || inv.status === 'partial_refund_pending') return { label: 'Pend. Anul.', color: [220, 38, 38], excluded: true };
      if (inv.paymentStatus === 'pending') return { label: 'Crédito', color: [161, 98, 7], excluded: false };
      if (inv.paymentStatus === 'partial') return { label: 'Parcial', color: [180, 83, 9], excluded: false };
      if (inv.documentType === 'nota_debito') return { label: 'N. Débito', color: [100, 100, 100], excluded: false };
      return { label: 'Pagado', color: [22, 163, 74], excluded: false };
    };

    invoices.forEach((inv, i) => {
      if (y > PH - 15) { doc.addPage(); y = 10; }
      const st = getInvoiceStatus(inv);
      if (i % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(ML, y, CW, 5, 'F'); }

      const textColor = st.excluded ? [160, 160, 160] : DARK;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...textColor);
      doc.text((inv.number || '-').substring(0, 16), ML + 2, y + 3.3);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
      doc.text((docTypeLabels[inv.documentType] || inv.type || '-').substring(0, 10), ML + 33, y + 3.3);
      const clientName = inv.customer?.name || inv.customer?.businessName || inv.customerName || 'Cliente General';
      doc.text(clientName.substring(0, 26), ML + 55, y + 3.3);
      const payStr = formatPaymentMethods(inv);
      doc.text(payStr.substring(0, 22), ML + 105, y + 3.3);
      doc.setFont('helvetica', 'bold');
      const isNC = inv.documentType === 'nota_credito';
      doc.text(`${isNC ? '-' : ''}${fmt(inv.total || 0, inv.currency)}`, ML + 143, y + 3.3, { align: 'right' });
      // Estado badge
      doc.setFontSize(5); doc.setTextColor(...st.color);
      doc.text(st.label, ML + 148, y + 3.3);
      y += 5;
    });
    y += 3;
  }

  // ===== MESAS CERRADAS SIN COMPROBANTE (alerta) =====
  if (closedWithoutReceipt.length > 0) {
    if (y > PH - 40) { doc.addPage(); y = 10; }
    // Header rojo de alerta
    doc.setFillColor(220, 38, 38);
    doc.rect(ML, y, CW, 0.6, 'F');
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(220, 38, 38);
    doc.text(`⚠ MESAS CERRADAS SIN COMPROBANTE (${closedWithoutReceipt.length})`, ML, y);
    y += 5;

    closedWithoutReceipt.forEach((record, i) => {
      if (y > PH - 15) { doc.addPage(); y = 10; }
      doc.setFillColor(255, 245, 245);
      doc.rect(ML, y, CW, 10, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(180, 30, 30);
      doc.text(`Mesa ${record.tableNumber || '-'}`, ML + 2, y + 3.5);
      doc.text(fmt(record.amount), ML + 35, y + 3.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(140, 40, 40);
      const reason = (record.reason || '-').substring(0, 50);
      doc.text(`Motivo: ${reason}`, ML + 2, y + 8);
      doc.text(`Por: ${(record.closedByName || '-').substring(0, 20)}`, ML + 120, y + 8);
      const ts = record.createdAt?.toDate?.() || (record.createdAt ? new Date(record.createdAt) : null);
      if (ts) {
        doc.text(ts.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }), RX - 2, y + 3.5, { align: 'right' });
      }
      y += 11;
    });
    y += 3;
  }

  // ===== ÓRDENES MODIFICADAS DESPUÉS DE PRECUENTA (alerta) =====
  if (orderModifications.length > 0) {
    if (y > PH - 40) { doc.addPage(); y = 10; }
    // Header naranja de alerta
    doc.setFillColor(234, 88, 12);
    doc.rect(ML, y, CW, 0.6, 'F');
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(234, 88, 12);
    doc.text(`⚠ ÓRDENES MODIFICADAS DESPUÉS DE PRECUENTA (${orderModifications.length})`, ML, y);
    y += 5;

    orderModifications.forEach((record) => {
      if (y > PH - 20) { doc.addPage(); y = 10; }
      doc.setFillColor(255, 247, 237);
      doc.rect(ML, y, CW, 13, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(180, 60, 10);
      doc.text(`Mesa ${record.tableNumber || '-'}`, ML + 2, y + 3.5);
      const changeLabel = record.changeType === 'remove_item' ? 'Item eliminado' : 'Cantidad reducida';
      doc.text(changeLabel, ML + 35, y + 3.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(140, 50, 10);
      const itemDetail = record.changeType === 'remove_item'
        ? `${record.itemName} (x${record.previousQuantity})`
        : `${record.itemName} (${record.previousQuantity} → ${record.newQuantity})`;
      doc.text(itemDetail, ML + 2, y + 7.5);
      doc.setTextColor(220, 38, 38);
      doc.text(`-${fmt(record.amountDifference)}`, ML + 120, y + 7.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.setTextColor(160, 70, 20);
      doc.text(`Mozo: ${(record.waiterName || '-').substring(0, 15)} | Editó: ${(record.modifiedByName || '-').substring(0, 15)}`, ML + 2, y + 11.5);
      doc.text(`Precuenta: ${fmt(record.precuentaTotal)} → ${fmt(record.newTotal)}`, ML + 90, y + 11.5);
      const ts = record.createdAt?.toDate?.() || (record.createdAt ? new Date(record.createdAt) : null);
      if (ts) {
        doc.text(ts.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }), RX - 2, y + 3.5, { align: 'right' });
      }
      y += 14;
    });
    y += 3;
  }

  // ===== PIE DE PÁGINA =====
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.15);
    doc.line(ML, PH - 10, RX, PH - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`${businessData?.name || ''} — Cierre de Caja`, ML, PH - 6.5);
    doc.text(`Pág. ${i}/${pages}`, RX, PH - 6.5, { align: 'right' });
  }

  // Guardar
  const fileName = `Cierre_Caja_${format(closedAtDate || new Date(), 'yyyy-MM-dd_HHmm')}.pdf`;
  if (Capacitor.isNativePlatform()) {
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    await saveAndShareFile(pdfBase64, fileName);
  } else {
    doc.save(fileName);
  }
};
