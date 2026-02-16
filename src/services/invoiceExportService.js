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
export const generateInvoicesExcel = async (invoices, filters, businessData, branchLabel = null) => {
  const workbook = XLSX.utils.book_new();

  // Preparar datos de las facturas
  const invoiceData = [
    ['REPORTE DE COMPROBANTES EMITIDOS'],
    [''],
    ['Negocio:', businessData?.name || 'N/A'],
    ['RUC:', businessData?.ruc || 'N/A'],
    ['Sucursal:', branchLabel || 'Todas'],
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
    'Alumno',
    'Productos',
    'Op. Gravada',
    'Op. Exonerada',
    'Op. Inafecta',
    'Subtotal',
    'Descuento',
    'IGV',
    'Total',
    'Estado',
    'Estado SUNAT',
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

    // Obtener nombre del alumno (si aplica)
    const studentName = invoice.customer?.studentName || invoice.studentName || '';

    // Obtener lista de productos con indicador de exonerado/inafecto
    const productsList = invoice.items && Array.isArray(invoice.items)
      ? invoice.items.map(item => {
          const name = `${item.quantity || 1}x ${item.name || item.description || 'Producto'}`
          if (item.taxAffectation === '20') return `${name} [EXO]`
          if (item.taxAffectation === '30') return `${name} [INA]`
          return name
        }).join(', ')
      : '';

    // Calcular montos por tipo de afectación
    let opGravada = 0
    let opExonerada = 0
    let opInafecta = 0
    if (invoice.items && Array.isArray(invoice.items)) {
      invoice.items.forEach(item => {
        const itemTotal = (item.quantity || 1) * (item.price || item.unitPrice || 0)
        if (item.taxAffectation === '20') {
          opExonerada += itemTotal
        } else if (item.taxAffectation === '30') {
          opInafecta += itemTotal
        } else {
          opGravada += itemTotal
        }
      })
    }

    // Estado SUNAT
    const sunatStatusNames = {
      'accepted': 'Aceptado',
      'pending': 'Pendiente',
      'sending': 'Enviando',
      'rejected': 'Rechazado',
      'voided': 'Anulado',
      'voiding': 'Anulando',
      'SIGNED': 'Firmado',
      'signed': 'Firmado',
      'not_applicable': 'N/A'
    }
    const sunatStatus = invoice.documentType === 'nota_venta'
      ? 'N/A'
      : sunatStatusNames[invoice.sunatStatus] || invoice.sunatStatus || 'Pendiente'

    invoiceData.push([
      invoice.createdAt ? format(invoice.createdAt.toDate(), 'dd/MM/yyyy', { locale: es }) : 'N/A',
      typeNames[docType] || docType || 'N/A',
      invoice.number || 'N/A',
      customerName,
      customerDoc,
      studentName,
      productsList,
      Number(opGravada.toFixed(2)),
      Number(opExonerada.toFixed(2)),
      Number(opInafecta.toFixed(2)),
      invoice.subtotal || 0,
      invoice.discount || 0,
      invoice.igv || invoice.tax || 0,
      invoice.total || 0,
      statusNames[invoice.status] || invoice.status || 'N/A',
      sunatStatus,
      formatPaymentMethods(invoice)
    ]);
  });

  // Agregar totales al final
  const subtotalSum = invoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
  const discountSum = invoices.reduce((sum, inv) => sum + (inv.discount || 0), 0);
  const taxSum = invoices.reduce((sum, inv) => sum + (inv.igv || inv.tax || 0), 0);
  const totalSum = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  invoiceData.push(['']);
  invoiceData.push([
    '',
    '',
    '',
    '',
    '',
    '',
    'TOTALES:',
    '',
    '',
    '',
    Number(subtotalSum.toFixed(2)),
    Number(discountSum.toFixed(2)),
    Number(taxSum.toFixed(2)),
    Number(totalSum.toFixed(2)),
    '',
    '',
    ''
  ]);

  // Crear hoja de cálculo
  const worksheet = XLSX.utils.aoa_to_sheet(invoiceData);

  // Configurar anchos de columna
  worksheet['!cols'] = [
    { width: 12 },  // Fecha
    { width: 15 },  // Tipo
    { width: 15 },  // Número
    { width: 30 },  // Cliente
    { width: 15 },  // RUC/DNI
    { width: 25 },  // Alumno
    { width: 50 },  // Productos
    { width: 14 },  // Op. Gravada
    { width: 14 },  // Op. Exonerada
    { width: 14 },  // Op. Inafecta
    { width: 12 },  // Subtotal
    { width: 12 },  // Descuento
    { width: 10 },  // IGV
    { width: 12 },  // Total
    { width: 12 },  // Estado
    { width: 15 },  // Estado SUNAT
    { width: 35 },  // Método de Pago
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Comprobantes');

  // Hoja 2: Registro de Ventas (Formato contable SUNAT 14.1)
  const registroData = [
    ['REGISTRO DE VENTAS E INGRESOS'],
    [''],
    ['RUC:', businessData?.ruc || 'N/A'],
    ['Razón Social:', businessData?.name || 'N/A'],
    ['Período:', filters.startDate && filters.endDate
      ? `${format(new Date(filters.startDate), 'dd/MM/yyyy', { locale: es })} - ${format(new Date(filters.endDate), 'dd/MM/yyyy', { locale: es })}`
      : format(new Date(), 'MM/yyyy', { locale: es })],
    [''],
  ];

  // Códigos SUNAT para tipo de comprobante
  const sunatDocTypeCodes = {
    'factura': '01',
    'boleta': '03',
    'nota_venta': '00',
    'nota_credito': '07',
    'nota_debito': '08',
    'nota-credito': '07',
    'nota-debito': '08'
  };

  // Códigos SUNAT para tipo de documento de identidad
  const sunatIdTypeCodes = {
    '1': '1',   // DNI
    '6': '6',   // RUC
    '0': '0',   // Otros
    '4': '4',   // Carnet de extranjería
    '7': '7',   // Pasaporte
    'A': 'A',   // Cédula diplomática
  };

  registroData.push([
    'CUO',
    'Fecha Emisión',
    'Fecha Vencimiento',
    'Tipo Comprobante',
    'Serie',
    'Número',
    'Tipo Doc. Cliente',
    'Nro Doc. Cliente',
    'Razón Social / Nombre',
    'Base Imponible',
    'Descuento Base Imp.',
    'IGV',
    'Importe Exonerado',
    'Importe Inafecto',
    'ISC',
    'Otros Tributos',
    'Importe Total',
    'Tipo Cambio',
    'Tipo Comp. Ref.',
    'Serie Comp. Ref.',
    'Número Comp. Ref.',
    'Estado'
  ]);

  // Ordenar por fecha
  const sortedForRegistro = [...invoices].sort((a, b) => {
    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return dateA - dateB;
  });

  sortedForRegistro.forEach((invoice, index) => {
    const invoiceDate = invoice.createdAt?.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt);
    const docType = invoice.documentType || 'boleta';
    const numberParts = (invoice.number || '').split('-');
    const serie = numberParts[0] || '';
    const numero = numberParts.slice(1).join('-') || '';

    // Tipo y número de documento del cliente
    const customerDocType = invoice.customer?.documentType || '0';
    const customerDocNumber = invoice.customer?.documentNumber || '';

    // Calcular montos por tipo de afectación
    let baseImponible = 0, importeExonerado = 0, importeInafecto = 0;
    if (invoice.items && Array.isArray(invoice.items)) {
      invoice.items.forEach(item => {
        const itemTotal = (item.quantity || 1) * (item.price || item.unitPrice || 0);
        if (item.taxAffectation === '20') importeExonerado += itemTotal;
        else if (item.taxAffectation === '30') importeInafecto += itemTotal;
        else baseImponible += itemTotal;
      });
    }

    // Referencia (para notas de crédito/débito)
    const refDocType = invoice.referenceDocumentType ? (sunatDocTypeCodes[invoice.referenceDocumentType] || '') : '';
    const refParts = (invoice.referenceNumber || '').split('-');
    const refSerie = refParts[0] || '';
    const refNumero = refParts.slice(1).join('-') || '';

    // Estado
    let estado = '';
    if (invoice.status === 'cancelled' || invoice.status === 'voided') estado = '2'; // Anulado
    else estado = '1'; // Vigente

    registroData.push([
      String(index + 1),
      invoiceDate ? format(invoiceDate, 'dd/MM/yyyy', { locale: es }) : '',
      invoice.dueDate ? format(new Date(invoice.dueDate), 'dd/MM/yyyy', { locale: es }) : '',
      sunatDocTypeCodes[docType] || '00',
      serie,
      numero,
      sunatIdTypeCodes[customerDocType] || customerDocType || '0',
      customerDocNumber,
      invoice.customer?.name || invoice.customer?.businessName || 'Cliente General',
      Number(baseImponible.toFixed(2)),
      Number((invoice.discount || 0).toFixed(2)),
      Number((invoice.igv || invoice.tax || 0).toFixed(2)),
      Number(importeExonerado.toFixed(2)),
      Number(importeInafecto.toFixed(2)),
      0,  // ISC
      0,  // Otros tributos
      Number((invoice.total || 0).toFixed(2)),
      1.000,  // Tipo de cambio (PEN)
      refDocType,
      refSerie,
      refNumero,
      estado
    ]);
  });

  const wsRegistro = XLSX.utils.aoa_to_sheet(registroData);
  wsRegistro['!cols'] = [
    { width: 8 },   // CUO
    { width: 12 },  // Fecha Emisión
    { width: 12 },  // Fecha Vencimiento
    { width: 10 },  // Tipo Comprobante
    { width: 8 },   // Serie
    { width: 12 },  // Número
    { width: 10 },  // Tipo Doc Cliente
    { width: 15 },  // Nro Doc Cliente
    { width: 35 },  // Razón Social
    { width: 15 },  // Base Imponible
    { width: 12 },  // Descuento
    { width: 12 },  // IGV
    { width: 15 },  // Exonerado
    { width: 15 },  // Inafecto
    { width: 8 },   // ISC
    { width: 12 },  // Otros
    { width: 15 },  // Total
    { width: 10 },  // Tipo Cambio
    { width: 10 },  // Tipo Comp Ref
    { width: 8 },   // Serie Ref
    { width: 12 },  // Número Ref
    { width: 8 },   // Estado
  ];
  XLSX.utils.book_append_sheet(workbook, wsRegistro, 'Registro de Ventas');

  // Generar nombre de archivo
  const filterInfo = filters.type && filters.type !== 'all' ? `_${filters.type}` : '';
  const dateInfo = filters.startDate || filters.endDate ? '_filtrado' : '';
  const fileName = `Comprobantes${filterInfo}${dateInfo}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;

  // Descargar/compartir archivo
  await saveAndShareExcel(workbook, fileName);
};
