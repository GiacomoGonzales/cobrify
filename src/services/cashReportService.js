import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
 * Generar reporte de cierre de caja en Excel
 */
export const generateCashReportExcel = (sessionData, movements, invoices, businessData) => {
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
    ['VENTAS DEL DÍA'],
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
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ width: 30 }, { width: 20 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

  // Hoja 2: Comprobantes del Día
  if (invoices.length > 0) {
    const invoicesData = [
      ['COMPROBANTES DEL DÍA'],
      [''],
      ['Número', 'Tipo', 'Cliente', 'Método de Pago', 'Total', 'Fecha']
    ];

    invoices.forEach(invoice => {
      const invoiceDate = getDateFromTimestamp(invoice.createdAt);
      invoicesData.push([
        invoice.number || 'N/A',
        invoice.type || 'N/A',
        invoice.customerName || 'Cliente General',
        invoice.paymentMethod || 'Efectivo',
        invoice.total || 0,
        invoiceDate ? format(invoiceDate, 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A'
      ]);
    });

    const invoicesSheet = XLSX.utils.aoa_to_sheet(invoicesData);
    invoicesSheet['!cols'] = [
      { width: 20 },
      { width: 15 },
      { width: 30 },
      { width: 20 },
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
  XLSX.writeFile(workbook, fileName);
};

/**
 * Generar reporte de cierre de caja en PDF
 */
export const generateCashReportPDF = (sessionData, movements, invoices, businessData) => {
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
      ['Ventas del Día', `S/ ${(sessionData.totalSales || 0).toFixed(2)}`],
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
    doc.text(`COMPROBANTES DEL DÍA (${invoices.length})`, 20, yPosition);
    yPosition += 8;

    const invoiceRows = invoices.map(invoice => [
      invoice.number || 'N/A',
      invoice.type || 'N/A',
      invoice.customerName || 'Cliente General',
      invoice.paymentMethod || 'Efectivo',
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
  doc.save(fileName);
};
