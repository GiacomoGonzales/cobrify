import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Generar reporte de facturas en Excel
 */
export const generateInvoicesExcel = (invoices, filters, businessData) => {
  const workbook = XLSX.utils.book_new();

  // Preparar datos de las facturas
  const invoiceData = [
    ['REPORTE DE COMPROBANTES EMITIDOS'],
    [''],
    ['Negocio:', businessData?.name || 'N/A'],
    ['RUC:', businessData?.ruc || 'N/A'],
    ['Fecha de Generación:', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })],
    [''],
  ];

  // Agregar información de filtros aplicados
  if (filters.type && filters.type !== 'all') {
    const typeNames = {
      'factura': 'Facturas',
      'boleta': 'Boletas',
      'nota-credito': 'Notas de Crédito',
      'nota-debito': 'Notas de Débito'
    };
    invoiceData.push(['Tipo de Comprobante:', typeNames[filters.type] || filters.type]);
  }

  if (filters.startDate) {
    invoiceData.push(['Fecha Desde:', format(new Date(filters.startDate), 'dd/MM/yyyy', { locale: es })]);
  }

  if (filters.endDate) {
    invoiceData.push(['Fecha Hasta:', format(new Date(filters.endDate), 'dd/MM/yyyy', { locale: es })]);
  }

  invoiceData.push(['']);
  invoiceData.push(['LISTADO DE COMPROBANTES']);
  invoiceData.push(['']);

  // Encabezados de la tabla
  invoiceData.push([
    'Fecha',
    'Tipo',
    'Número',
    'Cliente',
    'RUC/DNI',
    'Subtotal',
    'IGV',
    'Total',
    'Estado',
    'Método de Pago'
  ]);

  // Agregar datos de cada factura
  invoices.forEach(invoice => {
    const typeNames = {
      'factura': 'Factura',
      'boleta': 'Boleta',
      'nota-credito': 'Nota de Crédito',
      'nota-debito': 'Nota de Débito'
    };

    const statusNames = {
      'draft': 'Borrador',
      'pending': 'Pendiente',
      'sent': 'Enviada',
      'accepted': 'Aceptada',
      'rejected': 'Rechazada',
      'cancelled': 'Anulada'
    };

    const paymentMethodNames = {
      'cash': 'Efectivo',
      'card': 'Tarjeta',
      'transfer': 'Transferencia',
      'yape': 'Yape',
      'plin': 'Plin'
    };

    invoiceData.push([
      invoice.createdAt ? format(invoice.createdAt.toDate(), 'dd/MM/yyyy', { locale: es }) : 'N/A',
      typeNames[invoice.type] || invoice.type || 'N/A',
      invoice.number || 'N/A',
      invoice.customerName || 'Cliente General',
      invoice.customerDocumentNumber || 'N/A',
      invoice.subtotal || 0,
      invoice.tax || 0,
      invoice.total || 0,
      statusNames[invoice.status] || invoice.status || 'N/A',
      paymentMethodNames[invoice.paymentMethod] || invoice.paymentMethod || 'N/A'
    ]);
  });

  // Agregar totales al final
  const subtotalSum = invoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
  const taxSum = invoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);
  const totalSum = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  invoiceData.push(['']);
  invoiceData.push([
    '',
    '',
    '',
    '',
    'TOTALES:',
    subtotalSum,
    taxSum,
    totalSum,
    '',
    ''
  ]);

  // Crear hoja de cálculo
  const worksheet = XLSX.utils.aoa_to_sheet(invoiceData);

  // Configurar anchos de columna
  worksheet['!cols'] = [
    { width: 12 },  // Fecha
    { width: 18 },  // Tipo
    { width: 15 },  // Número
    { width: 30 },  // Cliente
    { width: 15 },  // RUC/DNI
    { width: 12 },  // Subtotal
    { width: 10 },  // IGV
    { width: 12 },  // Total
    { width: 15 },  // Estado
    { width: 18 },  // Método de Pago
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Comprobantes');

  // Generar nombre de archivo
  const filterInfo = filters.type && filters.type !== 'all' ? `_${filters.type}` : '';
  const dateInfo = filters.startDate || filters.endDate ? '_filtrado' : '';
  const fileName = `Comprobantes${filterInfo}${dateInfo}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;

  // Descargar archivo
  XLSX.writeFile(workbook, fileName);
};
