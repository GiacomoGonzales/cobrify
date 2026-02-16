import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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
export const generateCashReportExcel = async (sessionData, movements, invoices, businessData) => {
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
    ['Efectivo Contado:', sessionData.closingAmount || 0],
    ['Diferencia:', (sessionData.closingAmount || 0) - (sessionData.expectedAmount || 0)],
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
 * Generar reporte de cierre de caja en PDF
 */
export const generateCashReportPDF = async (sessionData, movements, invoices, businessData) => {
  const doc = new jsPDF();
  let yPosition = 20;

  // Convertir fechas
  const openedAtDate = getDateFromTimestamp(sessionData.openedAt);
  const closedAtDate = getDateFromTimestamp(sessionData.closedAt);

  // Título
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE CIERRE DE CAJA', 105, yPosition, { align: 'center' });
  yPosition += 15;

  // Información del Negocio
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Negocio: ${businessData?.name || 'N/A'}`, 20, yPosition);
  yPosition += 6;
  doc.text(`RUC: ${businessData?.ruc || 'N/A'}`, 20, yPosition);
  yPosition += 6;
  doc.text(`Apertura: ${openedAtDate ? format(openedAtDate, 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A'}`, 20, yPosition);
  yPosition += 6;
  doc.text(`Cierre: ${closedAtDate ? format(closedAtDate, 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A'}`, 20, yPosition);
  yPosition += 12;

  // Resumen Financiero
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN FINANCIERO', 20, yPosition);
  yPosition += 8;

  autoTable(doc, {
    startY: yPosition,
    head: [['Concepto', 'Monto']],
    body: [
      ['Monto Inicial', `S/ ${(sessionData.openingAmount || 0).toFixed(2)}`],
      ['Ventas de la Sesión', `S/ ${(sessionData.totalSales || 0).toFixed(2)}`],
      ['Otros Ingresos', `S/ ${(sessionData.totalIncome || 0).toFixed(2)}`],
      ['Egresos', `S/ ${(sessionData.totalExpense || 0).toFixed(2)}`],
      ['Efectivo Esperado', `S/ ${(sessionData.expectedAmount || 0).toFixed(2)}`],
    ],
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 'auto', halign: 'right' }
    }
  });

  yPosition = doc.lastAutoTable.finalY + 10;

  // Cierre y Diferencia
  autoTable(doc, {
    startY: yPosition,
    head: [['Detalle de Cierre', 'Monto']],
    body: [
      ['Efectivo', `S/ ${(sessionData.closingCash || 0).toFixed(2)}`],
      ['Tarjetas', `S/ ${(sessionData.closingCard || 0).toFixed(2)}`],
      ['Transferencias', `S/ ${(sessionData.closingTransfer || 0).toFixed(2)}`],
      ...(sessionData.closingYape ? [['Yape', `S/ ${sessionData.closingYape.toFixed(2)}`]] : []),
      ...(sessionData.closingPlin ? [['Plin', `S/ ${sessionData.closingPlin.toFixed(2)}`]] : []),
      ...(sessionData.closingRappi ? [['Rappi', `S/ ${sessionData.closingRappi.toFixed(2)}`]] : []),
      ...(sessionData.closingPedidosYa ? [['PedidosYa', `S/ ${sessionData.closingPedidosYa.toFixed(2)}`]] : []),
      ...(sessionData.closingDiDiFood ? [['DiDiFood', `S/ ${sessionData.closingDiDiFood.toFixed(2)}`]] : []),
      ['Total Contado', `S/ ${(sessionData.closingAmount || 0).toFixed(2)}`],
    ],
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [16, 185, 129] },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 'auto', halign: 'right' }
    }
  });

  yPosition = doc.lastAutoTable.finalY + 5;

  const difference = (sessionData.closingAmount || 0) - (sessionData.expectedAmount || 0);
  const differenceColor = difference >= 0 ? [16, 185, 129] : [239, 68, 68];

  autoTable(doc, {
    startY: yPosition,
    body: [
      ['DIFERENCIA', `S/ ${difference.toFixed(2)}`],
    ],
    theme: 'grid',
    styles: { fontSize: 11, fontStyle: 'bold' },
    bodyStyles: { fillColor: differenceColor, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 'auto', halign: 'right' }
    }
  });

  // Nueva página para comprobantes si hay muchos
  if (invoices.length > 0) {
    doc.addPage();
    yPosition = 20;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`COMPROBANTES DE LA SESIÓN (${invoices.length})`, 20, yPosition);
    yPosition += 8;

    const invoiceRows = invoices.map(invoice => [
      invoice.number || 'N/A',
      invoice.type || 'N/A',
      invoice.customerName || 'Cliente General',
      formatPaymentMethods(invoice),
      `S/ ${(invoice.total || 0).toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Número', 'Tipo', 'Cliente', 'Pago', 'Total']],
      body: invoiceRows,
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: {
        4: { halign: 'right' }
      }
    });
  }

  // Movimientos adicionales
  if (movements.length > 0) {
    if (doc.lastAutoTable && doc.lastAutoTable.finalY > 200) {
      doc.addPage();
      yPosition = 20;
    } else {
      yPosition = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : yPosition + 15;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`MOVIMIENTOS ADICIONALES (${movements.length})`, 20, yPosition);
    yPosition += 8;

    const movementRows = movements.map(movement => [
      movement.type === 'income' ? 'Ingreso' : 'Egreso',
      movement.category || 'N/A',
      movement.description || 'N/A',
      `S/ ${(movement.amount || 0).toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Tipo', 'Categoría', 'Descripción', 'Monto']],
      body: movementRows,
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: {
        3: { halign: 'right' }
      }
    });
  }

  // Guardar PDF
  const fileName = `Cierre_Caja_${format(closedAtDate || new Date(), 'yyyy-MM-dd_HHmm')}.pdf`;

  const isNativePlatform = Capacitor.isNativePlatform();
  if (isNativePlatform) {
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    await saveAndShareFile(pdfBase64, fileName);
  } else {
    doc.save(fileName);
  }
};
