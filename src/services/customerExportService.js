import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Generar reporte de clientes en Excel
 */
export const generateCustomersExcel = async (customers, businessData) => {
  const workbook = XLSX.utils.book_new();

  // Preparar datos de los clientes
  const customerData = [
    ['LISTADO DE CLIENTES'],
    [''],
    ['Negocio:', businessData?.name || 'N/A'],
    ['RUC:', businessData?.ruc || 'N/A'],
    ['Fecha de Generación:', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })],
    ['Total de Clientes:', customers.length],
    [''],
    ['DATOS DE CLIENTES'],
    [''],
  ];

  // Encabezados de la tabla
  customerData.push([
    'Tipo Doc.',
    'Número Doc.',
    'Nombre/Razón Social',
    'Email',
    'Teléfono',
    'Dirección',
    'Cantidad Pedidos',
    'Total Gastado',
    'Fecha de Registro'
  ]);

  // Agregar datos de cada cliente
  customers.forEach(customer => {
    const documentTypes = {
      'DNI': 'DNI',
      'RUC': 'RUC',
      'CE': 'Carnet Extranjería',
      'PASSPORT': 'Pasaporte'
    };

    customerData.push([
      documentTypes[customer.documentType] || customer.documentType || 'N/A',
      customer.documentNumber || 'N/A',
      customer.businessName || customer.name || 'N/A',
      customer.email || 'N/A',
      customer.phone || 'N/A',
      customer.address || 'N/A',
      customer.ordersCount || 0,
      customer.totalSpent || 0,
      customer.createdAt ? format(customer.createdAt.toDate(), 'dd/MM/yyyy', { locale: es }) : 'N/A'
    ]);
  });

  // Agregar estadísticas al final
  const totalOrders = customers.reduce((sum, customer) => sum + (customer.ordersCount || 0), 0);
  const totalRevenue = customers.reduce((sum, customer) => sum + (customer.totalSpent || 0), 0);
  const avgSpent = customers.length > 0 ? totalRevenue / customers.length : 0;

  customerData.push(['']);
  customerData.push(['ESTADÍSTICAS']);
  customerData.push(['Total de Clientes:', customers.length]);
  customerData.push(['Total de Pedidos:', totalOrders]);
  customerData.push(['Ingresos Totales:', totalRevenue]);
  customerData.push(['Gasto Promedio por Cliente:', avgSpent]);

  // Crear hoja de cálculo
  const worksheet = XLSX.utils.aoa_to_sheet(customerData);

  // Configurar anchos de columna
  worksheet['!cols'] = [
    { width: 12 },  // Tipo Doc
    { width: 15 },  // Número Doc
    { width: 30 },  // Nombre/Razón Social
    { width: 25 },  // Email
    { width: 15 },  // Teléfono
    { width: 35 },  // Dirección
    { width: 12 },  // Cantidad Pedidos
    { width: 15 },  // Total Gastado
    { width: 15 },  // Fecha de Registro
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

  // Generar nombre de archivo
  const fileName = `Clientes_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;

  // Descargar/compartir archivo
  const isNativePlatform = Capacitor.isNativePlatform();

  if (isNativePlatform) {
    try {
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });

      const result = await Filesystem.writeFile({
        path: fileName,
        data: excelBuffer,
        directory: Directory.Documents,
        recursive: true
      });

      console.log('Excel guardado en:', result.uri);

      await Share.share({
        title: fileName,
        text: 'Listado de clientes',
        url: result.uri,
        dialogTitle: 'Compartir listado de clientes'
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
