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

      const excelDir = 'Cotizaciones';
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
        text: `Reporte de cotizaciones: ${fileName}`,
        url: result.uri,
        dialogTitle: 'Compartir Reporte de Cotizaciones'
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
 * Helper para obtener fecha de un timestamp de Firestore o Date
 */
const getDateFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate();
  if (timestamp instanceof Date) return timestamp;
  return new Date(timestamp);
};

/**
 * Generar reporte de cotizaciones en Excel
 */
export const generateQuotationsExcel = async (quotations, filters = {}, businessData = {}) => {
  const workbook = XLSX.utils.book_new();

  // Preparar datos de las cotizaciones
  const quotationData = [
    ['REPORTE DE COTIZACIONES'],
    [''],
    ['Negocio:', businessData?.name || 'N/A'],
    ['RUC:', businessData?.ruc || 'N/A'],
    ['Fecha de Generación:', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })],
    [''],
  ];

  // Agregar información de filtros aplicados
  if (filters.status && filters.status !== 'all') {
    const statusNames = {
      'draft': 'Borrador',
      'sent': 'Enviada',
      'accepted': 'Aceptada',
      'rejected': 'Rechazada',
      'expired': 'Expirada',
      'converted': 'Convertida'
    };
    quotationData.push(['Estado:', statusNames[filters.status] || filters.status]);
  }

  if (filters.startDate) {
    quotationData.push(['Fecha Desde:', format(new Date(filters.startDate), 'dd/MM/yyyy', { locale: es })]);
  }

  if (filters.endDate) {
    quotationData.push(['Fecha Hasta:', format(new Date(filters.endDate), 'dd/MM/yyyy', { locale: es })]);
  }

  quotationData.push(['']);
  quotationData.push(['Total de Cotizaciones:', quotations.length]);
  quotationData.push(['']);
  quotationData.push(['LISTADO DE COTIZACIONES']);
  quotationData.push(['']);

  // Encabezados de la tabla
  quotationData.push([
    'Número',
    'Fecha Emisión',
    'Fecha Vencimiento',
    'Cliente',
    'RUC/DNI',
    'Email',
    'Teléfono',
    'Productos',
    'Subtotal',
    'Descuento',
    'IGV',
    'Total',
    'Estado',
    'Válida por (días)',
    'Notas',
    'Creado por'
  ]);

  // Agregar datos de cada cotización
  quotations.forEach(quotation => {
    const statusNames = {
      'draft': 'Borrador',
      'sent': 'Enviada',
      'accepted': 'Aceptada',
      'rejected': 'Rechazada',
      'expired': 'Expirada',
      'converted': 'Convertida a Venta'
    };

    // Obtener nombre del cliente
    const customerName = quotation.customer?.name || quotation.customer?.businessName || quotation.customerName || 'Cliente General';

    // Obtener RUC/DNI del cliente
    const customerDoc = quotation.customer?.documentNumber || quotation.customerDocumentNumber || 'N/A';

    // Obtener email y teléfono
    const customerEmail = quotation.customer?.email || '';
    const customerPhone = quotation.customer?.phone || '';

    // Obtener lista de productos
    const productsList = quotation.items && Array.isArray(quotation.items)
      ? quotation.items.map(item => {
          const qty = item.quantity || 1;
          const name = item.name || item.description || 'Producto';
          const price = item.unitPrice || item.price || 0;
          return `${qty}x ${name} (S/${price.toFixed(2)})`;
        }).join('; ')
      : '';

    // Fechas
    const createdDate = getDateFromTimestamp(quotation.createdAt);
    const expiryDate = getDateFromTimestamp(quotation.expiryDate);

    quotationData.push([
      quotation.number || 'N/A',
      createdDate ? format(createdDate, 'dd/MM/yyyy', { locale: es }) : 'N/A',
      expiryDate ? format(expiryDate, 'dd/MM/yyyy', { locale: es }) : 'N/A',
      customerName,
      customerDoc,
      customerEmail,
      customerPhone,
      productsList,
      quotation.subtotal || 0,
      quotation.discount || 0,
      quotation.igv || quotation.tax || 0,
      quotation.total || 0,
      statusNames[quotation.status] || quotation.status || 'N/A',
      quotation.validDays || 'N/A',
      quotation.notes || '',
      quotation.createdByName || quotation.createdBy || 'N/A'
    ]);
  });

  // Agregar totales al final
  const subtotalSum = quotations.reduce((sum, q) => sum + (q.subtotal || 0), 0);
  const discountSum = quotations.reduce((sum, q) => sum + (q.discount || 0), 0);
  const taxSum = quotations.reduce((sum, q) => sum + (q.igv || q.tax || 0), 0);
  const totalSum = quotations.reduce((sum, q) => sum + (q.total || 0), 0);

  quotationData.push(['']);
  quotationData.push([
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'TOTALES:',
    Number(subtotalSum.toFixed(2)),
    Number(discountSum.toFixed(2)),
    Number(taxSum.toFixed(2)),
    Number(totalSum.toFixed(2)),
    '',
    '',
    '',
    ''
  ]);

  // Resumen por estado
  quotationData.push(['']);
  quotationData.push(['']);
  quotationData.push(['RESUMEN POR ESTADO']);
  quotationData.push(['']);

  const statusCounts = {
    draft: quotations.filter(q => q.status === 'draft').length,
    sent: quotations.filter(q => q.status === 'sent').length,
    accepted: quotations.filter(q => q.status === 'accepted').length,
    rejected: quotations.filter(q => q.status === 'rejected').length,
    expired: quotations.filter(q => q.status === 'expired').length,
    converted: quotations.filter(q => q.status === 'converted').length,
  };

  const statusTotals = {
    draft: quotations.filter(q => q.status === 'draft').reduce((sum, q) => sum + (q.total || 0), 0),
    sent: quotations.filter(q => q.status === 'sent').reduce((sum, q) => sum + (q.total || 0), 0),
    accepted: quotations.filter(q => q.status === 'accepted').reduce((sum, q) => sum + (q.total || 0), 0),
    rejected: quotations.filter(q => q.status === 'rejected').reduce((sum, q) => sum + (q.total || 0), 0),
    expired: quotations.filter(q => q.status === 'expired').reduce((sum, q) => sum + (q.total || 0), 0),
    converted: quotations.filter(q => q.status === 'converted').reduce((sum, q) => sum + (q.total || 0), 0),
  };

  quotationData.push(['Estado', 'Cantidad', 'Total S/']);
  quotationData.push(['Borrador', statusCounts.draft, Number(statusTotals.draft.toFixed(2))]);
  quotationData.push(['Enviada', statusCounts.sent, Number(statusTotals.sent.toFixed(2))]);
  quotationData.push(['Aceptada', statusCounts.accepted, Number(statusTotals.accepted.toFixed(2))]);
  quotationData.push(['Rechazada', statusCounts.rejected, Number(statusTotals.rejected.toFixed(2))]);
  quotationData.push(['Expirada', statusCounts.expired, Number(statusTotals.expired.toFixed(2))]);
  quotationData.push(['Convertida a Venta', statusCounts.converted, Number(statusTotals.converted.toFixed(2))]);

  // Tasa de conversión
  const totalQuotations = quotations.length;
  const convertedCount = statusCounts.converted + statusCounts.accepted;
  const conversionRate = totalQuotations > 0 ? ((convertedCount / totalQuotations) * 100).toFixed(1) : 0;

  quotationData.push(['']);
  quotationData.push(['Tasa de Conversión:', `${conversionRate}%`]);

  // Crear hoja de cálculo
  const worksheet = XLSX.utils.aoa_to_sheet(quotationData);

  // Configurar anchos de columna
  worksheet['!cols'] = [
    { width: 15 },  // Número
    { width: 14 },  // Fecha Emisión
    { width: 14 },  // Fecha Vencimiento
    { width: 30 },  // Cliente
    { width: 15 },  // RUC/DNI
    { width: 25 },  // Email
    { width: 15 },  // Teléfono
    { width: 60 },  // Productos
    { width: 12 },  // Subtotal
    { width: 12 },  // Descuento
    { width: 10 },  // IGV
    { width: 12 },  // Total
    { width: 15 },  // Estado
    { width: 12 },  // Válida por
    { width: 30 },  // Notas
    { width: 20 },  // Creado por
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cotizaciones');

  // Generar nombre de archivo
  const statusInfo = filters.status && filters.status !== 'all' ? `_${filters.status}` : '';
  const dateInfo = filters.startDate || filters.endDate ? '_filtrado' : '';
  const fileName = `Cotizaciones${statusInfo}${dateInfo}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;

  // Descargar/compartir archivo
  await saveAndShareExcel(workbook, fileName);
};
