import { CapacitorThermalPrinter } from 'capacitor-thermal-printer';
import { Capacitor } from '@capacitor/core';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Servicio para manejar impresoras térmicas WiFi/Bluetooth
 * Soporta impresión de tickets, comandas de cocina y precuentas
 */

// Estado de la impresora
let isPrinterConnected = false;
let connectedPrinterAddress = null;

/**
 * Escanear impresoras disponibles (Bluetooth)
 * @returns {Promise<Array>} Lista de impresoras encontradas
 */
export const scanPrinters = async () => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative) {
    console.warn('Thermal printer only available on native platforms');
    return { success: false, error: 'Not native platform', devices: [] };
  }

  try {
    // Limpiar listeners anteriores
    await CapacitorThermalPrinter.removeAllListeners();

    // Array para almacenar dispositivos encontrados
    const devices = [];

    // Escuchar dispositivos descubiertos
    await CapacitorThermalPrinter.addListener('discoverDevices', (device) => {
      console.log('Printer discovered:', device);
      // Evitar duplicados
      if (!devices.find(d => d.address === device.address)) {
        devices.push(device);
      }
    });

    // Iniciar escaneo
    await CapacitorThermalPrinter.startScan();
    console.log('✅ Scanning for thermal printers...');

    // Esperar 10 segundos para el escaneo
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Detener escaneo (si hay un método para eso)
    await CapacitorThermalPrinter.removeAllListeners();

    return { success: true, devices };
  } catch (error) {
    console.error('Error scanning printers:', error);
    return { success: false, error: error.message, devices: [] };
  }
};

/**
 * Conectar a una impresora
 * @param {string} address - Dirección MAC o IP de la impresora
 * @returns {Promise<Object>} Resultado de la conexión
 */
export const connectPrinter = async (address) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative) {
    return { success: false, error: 'Not native platform' };
  }

  try {
    await CapacitorThermalPrinter.connect({ address });
    isPrinterConnected = true;
    connectedPrinterAddress = address;
    console.log('✅ Printer connected:', address);
    return { success: true, address };
  } catch (error) {
    console.error('Error connecting to printer:', error);
    isPrinterConnected = false;
    connectedPrinterAddress = null;
    return { success: false, error: error.message };
  }
};

/**
 * Verificar si hay impresora conectada
 */
export const isPrinterReady = () => {
  return isPrinterConnected && connectedPrinterAddress;
};

/**
 * Guardar configuración de impresora en Firestore
 * @param {string} userId - ID del usuario
 * @param {Object} printerConfig - Configuración de la impresora
 */
export const savePrinterConfig = async (userId, printerConfig) => {
  try {
    const configRef = doc(db, 'businesses', userId);
    await setDoc(configRef, {
      printerConfig: {
        address: printerConfig.address,
        name: printerConfig.name,
        type: printerConfig.type || 'bluetooth', // bluetooth o wifi
        enabled: printerConfig.enabled !== false,
        updatedAt: new Date()
      }
    }, { merge: true });

    return { success: true };
  } catch (error) {
    console.error('Error saving printer config:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Obtener configuración de impresora guardada
 * @param {string} userId - ID del usuario
 */
export const getPrinterConfig = async (userId) => {
  try {
    const configRef = doc(db, 'businesses', userId);
    const configDoc = await getDoc(configRef);

    if (configDoc.exists() && configDoc.data().printerConfig) {
      return { success: true, config: configDoc.data().printerConfig };
    }

    return { success: true, config: null };
  } catch (error) {
    console.error('Error getting printer config:', error);
    return { success: false, error: error.message, config: null };
  }
};

/**
 * Imprimir ticket de comprobante (Factura/Boleta)
 * @param {Object} invoice - Datos del comprobante
 * @param {Object} business - Datos del negocio
 */
export const printInvoiceTicket = async (invoice, business) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative || !isPrinterConnected) {
    return { success: false, error: 'Printer not connected' };
  }

  try {
    await CapacitorThermalPrinter.begin();

    // Encabezado - Logo y nombre del negocio
    await CapacitorThermalPrinter.align('center');
    await CapacitorThermalPrinter.doubleWidth();
    await CapacitorThermalPrinter.text(business.tradeName || business.businessName || 'NEGOCIO');
    await CapacitorThermalPrinter.clearFormatting();

    await CapacitorThermalPrinter.align('center');
    await CapacitorThermalPrinter.text(`RUC: ${business.ruc || ''}`);
    await CapacitorThermalPrinter.text(business.address || '');
    await CapacitorThermalPrinter.text(business.phone || '');
    await CapacitorThermalPrinter.text('================================');

    // Tipo de comprobante
    await CapacitorThermalPrinter.doubleWidth();
    await CapacitorThermalPrinter.text(invoice.type === 'invoice' ? 'FACTURA ELECTRÓNICA' : 'BOLETA ELECTRÓNICA');
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.text(`${invoice.series}-${invoice.number}`);
    await CapacitorThermalPrinter.text('================================');

    // Datos del cliente
    await CapacitorThermalPrinter.align('left');
    await CapacitorThermalPrinter.text(`Fecha: ${new Date(invoice.issueDate?.toDate ? invoice.issueDate.toDate() : invoice.issueDate).toLocaleDateString('es-PE')}`);
    await CapacitorThermalPrinter.text(`Cliente: ${invoice.customerName}`);
    await CapacitorThermalPrinter.text(`${invoice.type === 'invoice' ? 'RUC' : 'DNI'}: ${invoice.customerDocument}`);
    await CapacitorThermalPrinter.text('--------------------------------');

    // Items
    await CapacitorThermalPrinter.text('CANT  DESCRIPCION      IMPORTE');
    await CapacitorThermalPrinter.text('--------------------------------');

    for (const item of invoice.items) {
      const cant = String(item.quantity).padEnd(6);
      const desc = item.description.substring(0, 14).padEnd(14);
      const price = `S/ ${item.total.toFixed(2)}`.padStart(8);
      await CapacitorThermalPrinter.text(`${cant}${desc}${price}`);
    }

    await CapacitorThermalPrinter.text('--------------------------------');

    // Totales
    await CapacitorThermalPrinter.align('right');
    await CapacitorThermalPrinter.text(`Subtotal: S/ ${invoice.subtotal.toFixed(2)}`);
    await CapacitorThermalPrinter.text(`IGV (18%): S/ ${invoice.tax.toFixed(2)}`);
    await CapacitorThermalPrinter.bold();
    await CapacitorThermalPrinter.doubleWidth();
    await CapacitorThermalPrinter.text(`TOTAL: S/ ${invoice.total.toFixed(2)}`);
    await CapacitorThermalPrinter.clearFormatting();

    // Pie de página
    await CapacitorThermalPrinter.align('center');
    await CapacitorThermalPrinter.text('================================');
    await CapacitorThermalPrinter.text('Gracias por su preferencia');
    await CapacitorThermalPrinter.text('');

    // QR Code (opcional - si la factura tiene QR)
    if (invoice.qrCode) {
      await CapacitorThermalPrinter.qr(invoice.qrCode);
    }

    await CapacitorThermalPrinter.text('');
    await CapacitorThermalPrinter.text('');

    // Enviar a imprimir
    await CapacitorThermalPrinter.write();

    // Cortar papel
    await CapacitorThermalPrinter.cutPaper();

    return { success: true };
  } catch (error) {
    console.error('Error printing invoice:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir comanda de cocina
 * @param {Object} order - Datos de la orden
 * @param {Object} table - Datos de la mesa (opcional)
 */
export const printKitchenOrder = async (order, table = null) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative || !isPrinterConnected) {
    return { success: false, error: 'Printer not connected' };
  }

  try {
    await CapacitorThermalPrinter.begin();

    // Encabezado
    await CapacitorThermalPrinter.align('center');
    await CapacitorThermalPrinter.doubleWidth();
    await CapacitorThermalPrinter.bold();
    await CapacitorThermalPrinter.text('*** COMANDA ***');
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.text('================================');

    // Información de la orden
    await CapacitorThermalPrinter.align('left');
    await CapacitorThermalPrinter.bold();
    await CapacitorThermalPrinter.text(`Fecha: ${new Date().toLocaleString('es-PE')}`);

    if (table) {
      await CapacitorThermalPrinter.text(`Mesa: ${table.number}`);
      await CapacitorThermalPrinter.text(`Mozo: ${table.waiter || 'N/A'}`);
    }

    await CapacitorThermalPrinter.text(`Orden: #${order.orderNumber || order.id?.slice(-6) || 'N/A'}`);
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.text('================================');

    // Items
    await CapacitorThermalPrinter.text('');
    for (const item of order.items || []) {
      await CapacitorThermalPrinter.bold();
      await CapacitorThermalPrinter.doubleWidth();
      await CapacitorThermalPrinter.text(`${item.quantity}x ${item.name}`);
      await CapacitorThermalPrinter.clearFormatting();

      if (item.notes) {
        await CapacitorThermalPrinter.text(`  Nota: ${item.notes}`);
      }
      await CapacitorThermalPrinter.text('');
    }

    await CapacitorThermalPrinter.text('================================');
    await CapacitorThermalPrinter.text('');
    await CapacitorThermalPrinter.text('');

    // Enviar a imprimir
    await CapacitorThermalPrinter.write();

    // Cortar papel
    await CapacitorThermalPrinter.cutPaper();

    return { success: true };
  } catch (error) {
    console.error('Error printing kitchen order:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir precuenta
 * @param {Object} order - Datos de la orden
 * @param {Object} table - Datos de la mesa
 * @param {Object} business - Datos del negocio
 */
export const printPreBill = async (order, table, business) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative || !isPrinterConnected) {
    return { success: false, error: 'Printer not connected' };
  }

  try {
    await CapacitorThermalPrinter.begin();

    // Encabezado
    await CapacitorThermalPrinter.align('center');
    await CapacitorThermalPrinter.doubleWidth();
    await CapacitorThermalPrinter.text(business.tradeName || 'RESTAURANTE');
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.text(business.address || '');
    await CapacitorThermalPrinter.text(business.phone || '');

    await CapacitorThermalPrinter.bold();
    await CapacitorThermalPrinter.doubleWidth();
    await CapacitorThermalPrinter.text('PRECUENTA');
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.text('================================');

    // Información
    await CapacitorThermalPrinter.align('left');
    await CapacitorThermalPrinter.text(`Fecha: ${new Date().toLocaleString('es-PE')}`);
    await CapacitorThermalPrinter.text(`Mesa: ${table.number}`);
    await CapacitorThermalPrinter.text(`Mozo: ${table.waiter || 'N/A'}`);
    await CapacitorThermalPrinter.text(`Orden: #${order.orderNumber || order.id?.slice(-6)}`);
    await CapacitorThermalPrinter.text('--------------------------------');

    // Items
    await CapacitorThermalPrinter.text('CANT  DESCRIPCION      IMPORTE');
    await CapacitorThermalPrinter.text('--------------------------------');

    for (const item of order.items || []) {
      const cant = String(item.quantity).padEnd(6);
      const desc = item.name.substring(0, 14).padEnd(14);
      const price = `S/${item.total.toFixed(2)}`.padStart(8);
      await CapacitorThermalPrinter.text(`${cant}${desc}${price}`);

      if (item.notes) {
        await CapacitorThermalPrinter.text(`  * ${item.notes}`);
      }
    }

    await CapacitorThermalPrinter.text('--------------------------------');

    // Totales
    await CapacitorThermalPrinter.align('right');
    await CapacitorThermalPrinter.text(`Subtotal: S/ ${(order.subtotal || 0).toFixed(2)}`);
    await CapacitorThermalPrinter.text(`IGV (18%): S/ ${(order.tax || 0).toFixed(2)}`);
    await CapacitorThermalPrinter.bold();
    await CapacitorThermalPrinter.doubleWidth();
    await CapacitorThermalPrinter.text(`TOTAL: S/ ${(order.total || 0).toFixed(2)}`);
    await CapacitorThermalPrinter.clearFormatting();

    // Pie de página
    await CapacitorThermalPrinter.align('center');
    await CapacitorThermalPrinter.text('================================');
    await CapacitorThermalPrinter.bold();
    await CapacitorThermalPrinter.text('*** PRECUENTA ***');
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.text('No valido como comprobante');
    await CapacitorThermalPrinter.text('Solicite su factura o boleta');
    await CapacitorThermalPrinter.text('');
    await CapacitorThermalPrinter.text('Gracias por su preferencia');
    await CapacitorThermalPrinter.text('');
    await CapacitorThermalPrinter.text('');

    // Enviar a imprimir
    await CapacitorThermalPrinter.write();

    // Cortar papel
    await CapacitorThermalPrinter.cutPaper();

    return { success: true };
  } catch (error) {
    console.error('Error printing pre-bill:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Probar impresora con un ticket de prueba
 */
export const testPrinter = async () => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative || !isPrinterConnected) {
    return { success: false, error: 'Printer not connected' };
  }

  try {
    await CapacitorThermalPrinter.begin();

    await CapacitorThermalPrinter.align('center');
    await CapacitorThermalPrinter.doubleWidth();
    await CapacitorThermalPrinter.bold();
    await CapacitorThermalPrinter.text('PRUEBA DE IMPRESORA');
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.text('================================');
    await CapacitorThermalPrinter.text('');
    await CapacitorThermalPrinter.align('left');
    await CapacitorThermalPrinter.text('Texto normal');
    await CapacitorThermalPrinter.bold();
    await CapacitorThermalPrinter.text('Texto en negrita');
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.underline();
    await CapacitorThermalPrinter.text('Texto subrayado');
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.doubleWidth();
    await CapacitorThermalPrinter.text('Texto grande');
    await CapacitorThermalPrinter.clearFormatting();
    await CapacitorThermalPrinter.text('');
    await CapacitorThermalPrinter.align('center');
    await CapacitorThermalPrinter.text(`Fecha: ${new Date().toLocaleString('es-PE')}`);
    await CapacitorThermalPrinter.text('');
    await CapacitorThermalPrinter.text('Impresora configurada');
    await CapacitorThermalPrinter.text('correctamente!');
    await CapacitorThermalPrinter.text('');
    await CapacitorThermalPrinter.text('');

    await CapacitorThermalPrinter.write();
    await CapacitorThermalPrinter.cutPaper();

    return { success: true };
  } catch (error) {
    console.error('Error testing printer:', error);
    return { success: false, error: error.message };
  }
};
