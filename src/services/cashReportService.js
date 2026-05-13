import * as XLSX from 'xlsx';
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

/**
 * Generar reporte de cierre de caja en Excel
 */
export const generateCashReportExcel = async (sessionData, movements, invoices, businessData, deferredPayments = []) => {
  const workbook = XLSX.utils.book_new();

  // Convertir fechas
  const openedAtDate = getDateFromTimestamp(sessionData.openedAt);
  const closedAtDate = getDateFromTimestamp(sessionData.closedAt);

  // Hoja 1: Resumen General
  const summaryData = [
    ['REPORTE DE CIERRE DE CAJA'],
    [''],
    ['Negocio:', businessData?.name || 'N/A'],
    ['RUC:', businessData?.ruc || 'N/A'],
    ['Fecha de Apertura:', openedAtDate ? format(openedAtDate, 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A'],
    ['Fecha de Cierre:', closedAtDate ? format(closedAtDate, 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A'],
    [''],
    ['RESUMEN FINANCIERO'],
    ['Monto Inicial:', sessionData.openingAmount || 0],
    [''],
    ['VENTAS DE LA SESIÓN'],
    ['Total Ventas:', sessionData.totalSales || 0],
    ['Cantidad de Comprobantes:', invoices.length],
    [''],
    ['OTROS MOVIMIENTOS'],
    ['Ingresos Adicionales:', sessionData.totalIncome || 0],
    ['Egresos:', sessionData.totalExpense || 0],
    [''],
    ['CIERRE'],
    ['Efectivo Esperado:', sessionData.expectedAmount || 0],
    ['Efectivo Contado:', sessionData.closingCash || 0],
    ['Diferencia en Efectivo:', (sessionData.closingCash || 0) - (sessionData.expectedAmount || 0)],
    [''],
    ['DETALLE DEL CONTEO'],
    ['Efectivo:', sessionData.closingCash || 0],
    ['Tarjetas:', sessionData.closingCard || 0],
    ['Transferencias:', sessionData.closingTransfer || 0],
    ...(sessionData.closingYape ? [['Yape:', sessionData.closingYape]] : []),
    ...(sessionData.closingPlin ? [['Plin:', sessionData.closingPlin]] : []),
    ...(sessionData.closingRappi ? [['Rappi:', sessionData.closingRappi]] : []),
    ...(sessionData.closingPedidosYa ? [['PedidosYa:', sessionData.closingPedidosYa]] : []),
    ...(sessionData.closingDiDiFood ? [['DiDiFood:', sessionData.closingDiDiFood]] : []),
    [''],
    ['VENTAS POR MÉTODO DE PAGO'],
    ['Efectivo:', sessionData.salesCash || 0],
    ['Tarjetas:', sessionData.salesCard || 0],
    ['Transferencias:', sessionData.salesTransfer || 0],
    ...(sessionData.salesYape ? [['Yape:', sessionData.salesYape]] : []),
    ...(sessionData.salesPlin ? [['Plin:', sessionData.salesPlin]] : []),
    ...(sessionData.salesRappi ? [['Rappi:', sessionData.salesRappi]] : []),
    ...(sessionData.salesPedidosYa ? [['PedidosYa:', sessionData.salesPedidosYa]] : []),
    ...(sessionData.salesDiDiFood ? [['DiDiFood:', sessionData.salesDiDiFood]] : []),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ width: 30 }, { width: 20 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

  // Hoja 2: Comprobantes de la Sesión
  if (invoices.length > 0) {
    const invoicesData = [
      ['COMPROBANTES DE LA SESIÓN'],
      [''],
      ['Número', 'Tipo', 'Cliente', 'Método de Pago', 'Total', 'Fecha']
    ];

    invoices.forEach(invoice => {
      const invoiceDate = getDateFromTimestamp(invoice.createdAt);
      invoicesData.push([
        invoice.number || 'N/A',
        invoice.type || 'N/A',
        invoice.customerName || 'Cliente General',
        formatPaymentMethods(invoice),
        invoice.total || 0,
        invoiceDate ? format(invoiceDate, 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A'
      ]);
    });

    const invoicesSheet = XLSX.utils.aoa_to_sheet(invoicesData);
    invoicesSheet['!cols'] = [
      { width: 20 },
      { width: 15 },
      { width: 30 },
      { width: 40 },  // Más ancho para mostrar pagos mixtos
      { width: 15 },
      { width: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, invoicesSheet, 'Comprobantes');
  }

  // Hoja: Pagos de comprobantes anteriores (cobros diferidos)
  if (deferredPayments.length > 0) {
    const deferredData = [
      ['PAGOS DE COMPROBANTES ANTERIORES'],
      ['(Cobros recibidos hoy sobre comprobantes emitidos en sesiones previas)'],
      [''],
      ['Comprobante', 'Cliente', 'Método', 'Monto', 'Hora']
    ];
    let deferredTotal = 0;
    deferredPayments.forEach(p => {
      deferredTotal += p.amount || 0;
      const time = p.date instanceof Date
        ? format(p.date, 'dd/MM/yyyy HH:mm', { locale: es })
        : '-';
      deferredData.push([
        p.invoiceNumber || '-',
        p.customerName || 'Cliente General',
        p.method || '-',
        p.amount || 0,
        time,
      ]);
    });
    deferredData.push([], ['', '', 'TOTAL', deferredTotal, '']);

    const deferredSheet = XLSX.utils.aoa_to_sheet(deferredData);
    deferredSheet['!cols'] = [{ width: 20 }, { width: 30 }, { width: 15 }, { width: 12 }, { width: 18 }];
    XLSX.utils.book_append_sheet(workbook, deferredSheet, 'Pagos Anteriores');
  }

  // Hoja 3: Movimientos Adicionales
  if (movements.length > 0) {
    const movementsData = [
      ['MOVIMIENTOS ADICIONALES'],
      [''],
      ['Tipo', 'Categoría', 'Descripción', 'Monto', 'Fecha']
    ];

    movements.forEach(movement => {
      const movementDate = getDateFromTimestamp(movement.createdAt);
      movementsData.push([
        movement.type === 'income' ? 'Ingreso' : 'Egreso',
        movement.category || 'N/A',
        movement.description || 'N/A',
        movement.amount || 0,
        movementDate ? format(movementDate, 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A'
      ]);
    });

    const movementsSheet = XLSX.utils.aoa_to_sheet(movementsData);
    movementsSheet['!cols'] = [
      { width: 15 },
      { width: 20 },
      { width: 40 },
      { width: 15 },
      { width: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, movementsSheet, 'Movimientos');
  }

  // Generar archivo
  const fileName = `Cierre_Caja_${format(closedAtDate || new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;

  const isNativePlatform = Capacitor.isNativePlatform();
  if (isNativePlatform) {
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    await saveAndShareFile(excelBuffer, fileName);
  } else {
    XLSX.writeFile(workbook, fileName);
  }
};

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
