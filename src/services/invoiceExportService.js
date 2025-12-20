import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Helper para exportar Excel que funciona en iOS/Android
 */
const saveAndShareExcel = async (workbook, fileName) => {
  const isNativePlatform = Capacitor.isNativePlatform();

  if (isNativePlatform) {
    try {
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });

      const excelDir = 'Comprobantes';
      try {
        await Filesystem.mkdir({
          path: excelDir,
          directory: Directory.Documents,
          recursive: true
        });
      } catch (mkdirError) {
        // Directorio ya existe
      }

      const result = await Filesystem.writeFile({
        path: `${excelDir}/${fileName}`,
        data: excelBuffer,
        directory: Directory.Documents,
        recursive: true
      });

      console.log('Excel guardado en:', result.uri);

      await Share.share({
        title: fileName,
        text: `Reporte de comprobantes: ${fileName}`,
        url: result.uri,
        dialogTitle: 'Compartir Reporte de Comprobantes'
      });

      return { success: true, uri: result.uri };
    } catch (error) {
      console.error('Error al exportar Excel en móvil:', error);
      throw error;
    }
  } else {
    XLSX.writeFile(workbook, fileName);
    return { success: true };
  }
};

/**
 * Helper para formatear los métodos de pago de una factura
 * Si hay múltiples pagos, muestra el detalle de cada uno
 */
const formatPaymentMethods = (invoice) => {
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
 * Generar reporte de facturas en Excel
 */
export const generateInvoicesExcel = async (invoices, filters, businessData) => {
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
      'nota_venta': 'Nota de Venta',
      'nota-credito': 'Nota de Crédito',
      'nota-debito': 'Nota de Débito'
    };

    const statusNames = {
      'draft': 'Borrador',
      'pending': 'Pendiente',
      'paid': 'Pagado',
      'sent': 'Enviada',
      'accepted': 'Aceptada',
      'rejected': 'Rechazada',
      'cancelled': 'Anulada'
    };

    // Obtener tipo de documento (puede estar en documentType o type)
    const docType = invoice.documentType || invoice.type || 'N/A';

    // Obtener nombre del cliente (puede estar en customer.name o customerName)
    const customerName = invoice.customer?.name || invoice.customer?.businessName || invoice.customerName || 'Cliente General';

    // Obtener RUC/DNI del cliente (puede estar en customer.documentNumber o customerDocumentNumber)
    const customerDoc = invoice.customer?.documentNumber || invoice.customerDocumentNumber || 'N/A';

    invoiceData.push([
      invoice.createdAt ? format(invoice.createdAt.toDate(), 'dd/MM/yyyy', { locale: es }) : 'N/A',
      typeNames[docType] || docType || 'N/A',
      invoice.number || 'N/A',
      customerName,
      customerDoc,
      invoice.subtotal || 0,
      invoice.igv || invoice.tax || 0,
      invoice.total || 0,
      statusNames[invoice.status] || invoice.status || 'N/A',
      formatPaymentMethods(invoice)
    ]);
  });

  // Agregar totales al final
  const subtotalSum = invoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
  const taxSum = invoices.reduce((sum, inv) => sum + (inv.igv || inv.tax || 0), 0);
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
    { width: 40 },  // Método de Pago (más ancho para pagos mixtos)
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Comprobantes');

  // Generar nombre de archivo
  const filterInfo = filters.type && filters.type !== 'all' ? `_${filters.type}` : '';
  const dateInfo = filters.startDate || filters.endDate ? '_filtrado' : '';
  const fileName = `Comprobantes${filterInfo}${dateInfo}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;

  // Descargar/compartir archivo
  await saveAndShareExcel(workbook, fileName);
};
