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
 * Constantes de formato según ancho de papel
 */
const PAPER_FORMATS = {
  58: {
    charsPerLine: 32,
    separator: '----------------------------',
    halfSeparator: '----------------------------'
  },
  80: {
    charsPerLine: 48,
    separator: '--------------------------------------------',
    halfSeparator: '--------------------------------------------'
  }
};

/**
 * Obtener formato según ancho de papel configurado
 * @param {number} paperWidth - Ancho de papel (58 o 80)
 */
const getFormat = (paperWidth = 58) => {
  return PAPER_FORMATS[paperWidth] || PAPER_FORMATS[58];
};

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
    // Solicitar permisos de Bluetooth antes de escanear
    console.log('📱 Solicitando permisos de Bluetooth...');
    try {
      const permissionResult = await CapacitorThermalPrinter.requestPermissions();
      console.log('Permisos de Bluetooth:', permissionResult);

      if (permissionResult && permissionResult.granted === false) {
        return {
          success: false,
          error: 'Permisos de Bluetooth denegados. Ve a Configuración y habilita los permisos de Bluetooth y Ubicación.',
          devices: []
        };
      }
    } catch (permError) {
      console.warn('No se pudieron solicitar permisos (puede que no sea necesario en esta versión):', permError);
      // Continuar de todos modos, algunos dispositivos no necesitan solicitar permisos explícitamente
    }

    // Verificar que el Bluetooth esté activado
    console.log('📡 Verificando estado del Bluetooth...');
    try {
      const bluetoothState = await CapacitorThermalPrinter.isEnabled();
      console.log('Estado del Bluetooth:', bluetoothState);

      if (bluetoothState && bluetoothState.enabled === false) {
        return {
          success: false,
          error: 'El Bluetooth está desactivado. Por favor, activa el Bluetooth en tu dispositivo.',
          devices: []
        };
      }
    } catch (stateError) {
      console.warn('No se pudo verificar el estado del Bluetooth:', stateError);
      // Continuar de todos modos
    }

    // Limpiar listeners anteriores
    await CapacitorThermalPrinter.removeAllListeners();

    // Array para almacenar dispositivos encontrados
    const devices = [];

    // Escuchar dispositivos descubiertos
    await CapacitorThermalPrinter.addListener('discoverDevices', (device) => {
      console.log('Printer discovered:', device);

      // Normalizar la dirección (puede venir como address, macAddress, id, etc)
      const deviceAddress = device.address || device.macAddress || device.id || device.deviceAddress;
      const deviceName = device.name || device.deviceName || 'Impresora sin nombre';

      if (!deviceAddress) {
        console.warn('Device without address:', device);
        return;
      }

      // Crear objeto normalizado
      const normalizedDevice = {
        address: deviceAddress,
        name: deviceName,
        ...device // Mantener propiedades originales
      };

      // Evitar duplicados
      if (!devices.find(d => d.address === deviceAddress)) {
        devices.push(normalizedDevice);
      }
    });

    // Iniciar escaneo
    console.log('🔍 Iniciando escaneo de impresoras Bluetooth...');
    await CapacitorThermalPrinter.startScan();
    console.log('✅ Escaneo iniciado. Esperando dispositivos...');

    // Esperar 15 segundos para el escaneo (aumentado de 10 a 15)
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Detener escaneo
    try {
      await CapacitorThermalPrinter.stopScan();
      console.log('⏹️ Escaneo detenido');
    } catch (stopError) {
      console.warn('No se pudo detener el escaneo:', stopError);
    }

    // Limpiar listeners
    await CapacitorThermalPrinter.removeAllListeners();

    console.log(`📊 Total de dispositivos encontrados: ${devices.length}`);
    if (devices.length > 0) {
      console.log('Dispositivos:', devices);
    } else {
      console.warn('⚠️ No se encontraron impresoras Bluetooth.');
      console.warn('Asegúrate de que:');
      console.warn('1. La impresora está encendida');
      console.warn('2. El Bluetooth está activado');
      console.warn('3. La impresora está en modo de emparejamiento');
      console.warn('4. Los permisos de Bluetooth y Ubicación están otorgados');
    }

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
/**
 * Desconectar impresora
 */
export const disconnectPrinter = async () => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative) {
    return { success: false, error: 'Solo disponible en app móvil' };
  }

  try {
    console.log('🔌 Desconectando impresora...');
    await CapacitorThermalPrinter.disconnect();
    isPrinterConnected = false;
    connectedPrinterAddress = null;
    console.log('✅ Impresora desconectada');
    return { success: true };
  } catch (error) {
    console.error('❌ Error al desconectar:', error);
    // Marcar como desconectado de todos modos
    isPrinterConnected = false;
    connectedPrinterAddress = null;
    return { success: false, error: error.message };
  }
};

export const connectPrinter = async (address) => {
  const isNative = Capacitor.isNativePlatform();

  console.log('🔌 connectPrinter - Intentando conectar a:', address);
  console.log('📱 Plataforma nativa:', isNative);

  if (!isNative) {
    console.error('❌ No es plataforma nativa');
    return { success: false, error: 'Solo disponible en app móvil' };
  }

  try {
    // Primero intentar desconectar cualquier conexión anterior
    console.log('🔄 Desconectando conexión anterior (si existe)...');
    await disconnectPrinter();

    // Pequeña espera para asegurar que la desconexión se complete
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('🔄 Llamando a CapacitorThermalPrinter.connect()...');
    const result = await CapacitorThermalPrinter.connect({ address });
    console.log('📋 Resultado de connect():', result);

    // Solo marcar como conectado si el resultado no es null
    if (result !== null && result !== undefined) {
      isPrinterConnected = true;
      connectedPrinterAddress = address;
      console.log('✅ Printer connected:', address);
      console.log('✅ isPrinterConnected:', isPrinterConnected);
      console.log('✅ connectedPrinterAddress:', connectedPrinterAddress);
      return { success: true, address };
    } else {
      console.error('❌ Conexión falló - resultado null');
      isPrinterConnected = false;
      connectedPrinterAddress = null;
      return { success: false, error: 'No se pudo conectar a la impresora' };
    }
  } catch (error) {
    console.error('❌ Error connecting to printer:', error);
    console.error('Tipo de error:', error.constructor.name);
    console.error('Mensaje:', error.message);

    isPrinterConnected = false;
    connectedPrinterAddress = null;
    return { success: false, error: error.message || 'Error al conectar' };
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
 * Convertir texto con tildes a formato ASCII simple (sin acentos)
 * Ya que el plugin no soporta setCodePage en Android
 * @param {string} text - Texto a convertir
 */
const convertSpanishText = (text) => {
  // Mapeo de caracteres con tilde a sus equivalentes sin tilde
  const charMap = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
    'ñ': 'n', 'Ñ': 'N',
    'ü': 'u', 'Ü': 'U',
    '¿': '?', '¡': '!'
  };

  return text.split('').map(char => charMap[char] || char).join('');
};

/**
 * Imprimir ticket de comprobante (Factura/Boleta)
 * @param {Object} invoice - Datos del comprobante
 * @param {Object} business - Datos del negocio
 * @param {number} paperWidth - Ancho de papel (58 o 80mm)
 */
export const printInvoiceTicket = async (invoice, business, paperWidth = 58) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative || !isPrinterConnected) {
    return { success: false, error: 'Printer not connected' };
  }

  try {
    const format = getFormat(paperWidth);

    // Determinar tipo de documento (soportar diferentes formatos)
    const docType = invoice.documentType || invoice.type || 'boleta';
    const isInvoice = docType === 'factura' || docType === 'invoice';
    const isNotaVenta = docType === 'nota_venta';

    // Tipo de comprobante para textos legales
    const tipoComprobante = isNotaVenta ? 'NOTA DE VENTA' : (isInvoice ? 'FACTURA' : 'BOLETA DE VENTA');
    const tipoComprobanteCompleto = isNotaVenta ? 'NOTA DE VENTA' : (isInvoice ? 'FACTURA ELECTRONICA' : 'BOLETA DE VENTA ELECTRONICA');

    // Items text - columnas fijas para alinear precios correctamente
    const lineWidth = paperWidth === 80 ? 48 : 32; // Ancho total de línea
    const cantWidth = 6; // Columna cantidad
    const descWidth = paperWidth === 80 ? 26 : 14; // Columna descripción (58mm: 14 chars para dar espacio al precio)
    const priceWidth = paperWidth === 80 ? 10 : 10; // Columna precio

    // Header más compacto
    let itemsText = '';
    itemsText += 'DETALLE\n';

    // Solo mostrar header de columnas para 58mm
    if (paperWidth !== 80) {
      const headerLine = 'CANT  DESCRIPCION   PRECIO';
      itemsText += headerLine + '\n';
    }

    itemsText += format.halfSeparator + '\n';
    for (const item of invoice.items) {
      // Soportar tanto 'description' (facturas) como 'name' (POS)
      const itemName = convertSpanishText(item.description || item.name || '');

      // Calcular el precio total del item y precio unitario
      let itemTotal = 0;
      let unitPrice = 0;

      if (item.total) {
        itemTotal = item.total;
        unitPrice = item.unitPrice || item.price || (itemTotal / (item.quantity || 1));
      } else if (item.subtotal) {
        itemTotal = item.subtotal;
        unitPrice = item.unitPrice || item.price || (itemTotal / (item.quantity || 1));
      } else if (item.unitPrice && item.quantity) {
        unitPrice = item.unitPrice;
        itemTotal = item.unitPrice * item.quantity;
      } else if (item.price && item.quantity) {
        unitPrice = item.price;
        itemTotal = item.price * item.quantity;
      }

      if (paperWidth === 80) {
        // FORMATO 80MM - Igual al de la web
        // Línea 1: Nombre del producto completo
        itemsText += `${itemName}\n`;

        // Línea 2: "cantidad x precio unitario" (izq) y "total" (der)
        const qtyAndPrice = `${item.quantity} x S/${unitPrice.toFixed(2)}`;
        const totalStr = `S/${itemTotal.toFixed(2)}`;
        const spaceBetween = lineWidth - qtyAndPrice.length - totalStr.length;
        itemsText += `${qtyAndPrice}${' '.repeat(Math.max(1, spaceBetween))}${totalStr}\n`;

        // Código si existe
        if (item.code) {
          itemsText += `Codigo: ${convertSpanishText(item.code)}\n`;
        }
      } else {
        // FORMATO 58MM - Mantener formato actual con columnas fijas
        const cant = String(item.quantity || 0).padEnd(6);
        const priceStr = `S/${itemTotal.toFixed(2)}`;

        const displayName = itemName.length > descWidth
          ? itemName.substring(0, descWidth)
          : itemName.padEnd(descWidth);

        itemsText += `${cant}${displayName}${priceStr}\n`;

        // Si el nombre era más largo, mostrar el resto en líneas adicionales
        if (itemName.length > descWidth) {
          let remainingName = itemName.substring(descWidth);
          while (remainingName.length > 0) {
            const chunk = remainingName.substring(0, descWidth);
            itemsText += `      ${chunk}\n`;
            remainingName = remainingName.substring(descWidth);
          }
        }

        // Código del producto
        if (item.code) {
          itemsText += `      Codigo: ${convertSpanishText(item.code)}\n`;
        }
      }
    }

    // Construir comando en cadena
    let printer = CapacitorThermalPrinter.begin()
      .align('center');

    // Logo optimizado (si existe URL de logo del negocio)
    if (business.logoUrl) {
      // Tamaño reducido según ancho de papel
      const logoWidth = paperWidth === 80 ? 200 : 120;
      printer = printer
        .image(business.logoUrl, logoWidth);  // Sin salto de línea (más pegado)
    }

    // Nombre del negocio - solo usar doubleWidth si el nombre es corto
    const businessName = convertSpanishText(business.tradeName || business.businessName || 'NEGOCIO');
    if (businessName.length <= (paperWidth === 80 ? 24 : 16)) {
      printer = printer.doubleWidth().text(businessName + '\n').clearFormatting();
    } else {
      printer = printer.bold().text(businessName + '\n').clearFormatting();
    }

    // Mostrar RUC solo si NO es nota de venta O si está configurado para mostrarlo
    if (!(isNotaVenta && business.hideRucIgvInNotaVenta)) {
      printer = printer.text(convertSpanishText(`RUC: ${business.ruc || ''}\n`));
    }

    printer = printer
      .text(convertSpanishText((business.address || '') + '\n'))
      .text(convertSpanishText((business.phone || '') + '\n'))
      .text(format.separator + '\n')
      // Tipo de comprobante - centrado y en negrita
      .align('center')
      .bold()
      .text(tipoComprobanteCompleto + '\n')
      .text(`${invoice.series || 'B001'}-${invoice.correlativeNumber || invoice.number || '000'}\n`)
      .clearFormatting()
      // Fecha y hora - alineado a izquierda, más compacto
      .align('left')
      .text(convertSpanishText(`Fecha: ${new Date(invoice.issueDate?.toDate ? invoice.issueDate.toDate() : invoice.issueDate || invoice.createdAt?.toDate ? invoice.createdAt.toDate() : invoice.createdAt || new Date()).toLocaleDateString('es-PE')}\n`))
      .text(`Hora: ${new Date(invoice.createdAt?.toDate ? invoice.createdAt.toDate() : invoice.createdAt || new Date()).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }).replace('a.\u00a0m.', 'AM').replace('p.\u00a0m.', 'PM').replace('a. m.', 'AM').replace('p. m.', 'PM')}\n`);

    // Datos del cliente - solo si hay cliente
    const hasCustomer = (invoice.customer?.name || invoice.customerName) &&
                        (invoice.customer?.name || invoice.customerName) !== 'VARIOS' &&
                        (invoice.customer?.documentNumber || invoice.customerDocument || invoice.customerRuc || invoice.customerDni);

    if (hasCustomer) {
      printer = printer
        .bold()
        .text('DATOS DEL CLIENTE\n')
        .clearFormatting()
        .text(convertSpanishText(`${isInvoice ? 'RUC' : 'DNI'}: ${invoice.customer?.documentNumber || invoice.customerDocument || invoice.customerRuc || invoice.customerDni || '-'}\n`))
        .text(convertSpanishText(`Nombre: ${invoice.customer?.name || invoice.customerName || 'Cliente'}\n`));
    }

    printer = printer
      // Items
      .align('left')
      .text(itemsText)
      // Totales - alineados a la derecha
      .align('right');

    // Mostrar subtotal e IGV solo si NO es nota de venta O si está configurado para mostrarlo
    if (!(isNotaVenta && business.hideRucIgvInNotaVenta)) {
      printer = printer
        .text(`Subtotal: S/ ${(invoice.subtotal || 0).toFixed(2)}\n`)
        .text(`IGV (18%): S/ ${(invoice.tax || invoice.igv || 0).toFixed(2)}\n`);
    }

    // Mostrar descuento si existe
    if (invoice.discount && invoice.discount > 0) {
      printer = printer.text(`Descuento: -S/ ${invoice.discount.toFixed(2)}\n`);
    }

    printer = printer
      .bold()
      .text(`TOTAL: S/ ${(invoice.total || 0).toFixed(2)}\n`)
      .clearFormatting()
      // QR Code según formato SUNAT
      .align('center');

    // Generar QR Code
    let qrData = invoice.qrCode;

    // Si no hay QR, generar uno con formato SUNAT básico (solo para facturas y boletas electrónicas, NO para nota de venta)
    if (!qrData && business.ruc && invoice.series && !isNotaVenta) {
      // Formato QR SUNAT: RUC|Tipo|Serie|Numero|IGV|Total|Fecha|TipoDoc|NumDoc
      const tipoDoc = isInvoice ? '01' : '03'; // 01=Factura, 03=Boleta
      const fecha = new Date(invoice.issueDate?.toDate ? invoice.issueDate.toDate() : invoice.issueDate || invoice.createdAt?.toDate ? invoice.createdAt.toDate() : invoice.createdAt || new Date()).toISOString().split('T')[0];
      const docCliente = isInvoice ? '6' : '1'; // 6=RUC, 1=DNI
      const numDocCliente = invoice.customer?.documentNumber || invoice.customerDocument || invoice.customerRuc || invoice.customerDni || '';

      qrData = `${business.ruc}|${tipoDoc}|${invoice.series}|${invoice.correlativeNumber || invoice.number}|${(invoice.tax || invoice.igv || 0).toFixed(2)}|${(invoice.total || 0).toFixed(2)}|${fecha}|${docCliente}|${numDocCliente}`;
    }

    // Agregar QR y leyenda SUNAT solo para facturas y boletas electrónicas (NO para notas de venta)
    if (!isNotaVenta) {
      // Leyenda legal SUNAT (OBLIGATORIA)
      printer = printer
        .text(format.separator + '\n')
        .text(convertSpanishText(`REPRESENTACION IMPRESA DE\n${tipoComprobante} ELECTRONICA\n`))
        .text(convertSpanishText('Consulte en www.sunat.gob.pe\n'));

      // Hash SUNAT (si existe)
      if (invoice.sunatHash) {
        // Truncar hash para que quepa (mostrar primeros 40-45 caracteres)
        const hashToShow = paperWidth === 80
          ? invoice.sunatHash.substring(0, 45)
          : invoice.sunatHash.substring(0, 30);
        const hashSuffix = invoice.sunatHash.length > hashToShow.length ? '...' : '';

        printer = printer
          .align('left')
          .text('\n')
          .bold()
          .text('Hash: ')
          .clearFormatting()
          .text(convertSpanishText(hashToShow + hashSuffix) + '\n')
          .align('center');
      }

      // QR Code (obligatorio según SUNAT desde 2020) - después del texto SUNAT
      if (qrData) {
        printer = printer.text('\n').qr(qrData).text('\n');
      }
    }

    // Forma de pago (si existe)
    if (invoice.paymentMethod || invoice.payments) {
      printer = printer
        .bold()
        .text('FORMA DE PAGO\n')
        .clearFormatting();

      if (invoice.payments && invoice.payments.length > 0) {
        invoice.payments.forEach(payment => {
          printer = printer.text(convertSpanishText(`${payment.method}: S/ ${payment.amount.toFixed(2)}\n`));
        });
      } else if (invoice.paymentMethod) {
        printer = printer.text(convertSpanishText(`${invoice.paymentMethod}: S/ ${(invoice.total || 0).toFixed(2)}\n`));
      }
    }

    // Pie de página
    printer = printer
      .text(format.separator + '\n')
      .text(convertSpanishText('GRACIAS POR SU PREFERENCIA\n'))
      .text('\n');

    // Finalizar y enviar
    await printer
      .text('\n')
      .cutPaper()
      .write();

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
 * @param {number} paperWidth - Ancho de papel (58 o 80mm)
 */
export const printKitchenOrder = async (order, table = null, paperWidth = 58) => {
  const isNative = Capacitor.isNativePlatform();

  console.log('🖨️ printKitchenOrder - Iniciando...');
  console.log('📱 Plataforma nativa:', isNative);
  console.log('🔌 isPrinterConnected:', isPrinterConnected);
  console.log('📍 connectedPrinterAddress:', connectedPrinterAddress);

  if (!isNative) {
    console.error('❌ No es plataforma nativa');
    return { success: false, error: 'Solo disponible en app móvil' };
  }

  if (!isPrinterConnected || !connectedPrinterAddress) {
    console.error('❌ Impresora no conectada');
    return { success: false, error: 'Impresora no conectada. Conéctala primero desde Ajustes.' };
  }

  try {
    const format = getFormat(paperWidth);

    // Construir items text
    let itemsText = '\n';
    for (const item of order.items || []) {
      itemsText += `${item.quantity}x ${item.name}\n`;
      if (item.notes) {
        itemsText += `  Nota: ${item.notes}\n`;
      }
      itemsText += '\n';
    }

    // Construir comando en cadena
    let printer = CapacitorThermalPrinter.begin()
      // Encabezado
      .align('center')
      .doubleWidth()
      .bold()
      .text('*** COMANDA ***\n')
      .clearFormatting()
      .text(format.separator + '\n')
      // Información de la orden
      .align('left')
      .bold()
      .text(`Fecha: ${new Date().toLocaleString('es-PE')}\n`);

    if (table) {
      printer = printer
        .text(`Mesa: ${table.number}\n`)
        .text(`Mozo: ${table.waiter || 'N/A'}\n`);
    }

    await printer
      .text(`Orden: #${order.orderNumber || order.id?.slice(-6) || 'N/A'}\n`)
      .clearFormatting()
      .text(format.separator + '\n')
      // Items (aquí se resetea formato antes de cada item usando clearFormatting + bold + doubleWidth)
      .text(itemsText)
      .text(format.separator + '\n')
      .text('\n')
      .text('\n')
      .cutPaper()
      .write();

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
 * @param {number} paperWidth - Ancho de papel (58 o 80mm)
 */
export const printPreBill = async (order, table, business, taxConfig = { igvRate: 18, igvExempt: false }, paperWidth = 58) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative || !isPrinterConnected) {
    return { success: false, error: 'Printer not connected' };
  }

  try {
    const format = getFormat(paperWidth);

    // Recalcular totales según taxConfig actual
    // Esto asegura que si la empresa cambió su estado de exoneración,
    // la precuenta muestre los valores correctos
    console.log('🔍 printPreBillThermal - taxConfig recibido:', taxConfig);
    console.log('🔍 printPreBillThermal - igvExempt:', taxConfig.igvExempt);
    console.log('🔍 printPreBillThermal - igvRate:', taxConfig.igvRate);

    let subtotal, tax, total;
    total = order.total || 0;

    if (taxConfig.igvExempt) {
      // Si está exonerado, el total es igual al subtotal y no hay IGV
      subtotal = total;
      tax = 0;
    } else {
      // Si no está exonerado, calcular IGV dinámicamente
      const igvRate = taxConfig.igvRate || 18;
      const igvMultiplier = 1 + (igvRate / 100); // Ej: 1.18 para 18%
      subtotal = total / igvMultiplier; // Precio sin IGV
      tax = total - subtotal; // IGV = Total - Subtotal
    }

    // Items - ajustar columnas según ancho
    const descWidth = paperWidth === 80 ? 26 : 14;
    const headerLine = paperWidth === 80
      ? 'CANT  DESCRIPCIÓN                IMPORTE'
      : 'CANT  DESCRIPCION      IMPORTE';

    let itemsText = headerLine + '\n' + format.halfSeparator + '\n';
    for (const item of order.items || []) {
      const cant = String(item.quantity).padEnd(6);
      const desc = item.name.substring(0, descWidth).padEnd(descWidth);
      const price = `S/${item.total.toFixed(2)}`.padStart(paperWidth === 80 ? 10 : 8);
      itemsText += `${cant}${desc}${price}\n`;

      if (item.notes) {
        itemsText += `  * ${item.notes}\n`;
      }
    }

    // Construir texto de totales según si está exonerado o no
    let totalsText = '';
    if (!taxConfig.igvExempt) {
      totalsText = `Subtotal: S/ ${subtotal.toFixed(2)}\n` +
                   `IGV (${taxConfig.igvRate}%): S/ ${tax.toFixed(2)}\n`;
    } else {
      totalsText = '*** Empresa exonerada de IGV ***\n';
    }

    // Construir comando en cadena
    await CapacitorThermalPrinter.begin()
      // Encabezado
      .align('center')
      .doubleWidth()
      .text((business.tradeName || 'RESTAURANTE') + '\n')
      .clearFormatting()
      .text((business.address || '') + '\n')
      .text((business.phone || '') + '\n')
      .bold()
      .doubleWidth()
      .text('PRECUENTA\n')
      .clearFormatting()
      .text(format.separator + '\n')
      // Información
      .align('left')
      .text(`Fecha: ${new Date().toLocaleString('es-PE')}\n`)
      .text(`Mesa: ${table.number}\n`)
      .text(`Mozo: ${table.waiter || 'N/A'}\n`)
      .text(`Orden: #${order.orderNumber || order.id?.slice(-6)}\n`)
      .text(format.halfSeparator + '\n')
      // Items
      .text(itemsText)
      .text(format.halfSeparator + '\n')
      // Totales
      .align('right')
      .text(totalsText)
      .bold()
      .doubleWidth()
      .text(`TOTAL: S/ ${total.toFixed(2)}\n`)
      .clearFormatting()
      // Pie de página
      .align('center')
      .text(format.separator + '\n')
      .bold()
      .text('*** PRECUENTA ***\n')
      .clearFormatting()
      .text('No valido como comprobante\n')
      .text('Solicite su factura o boleta\n')
      .text('\n')
      .text('Gracias por su preferencia\n')
      .text('\n')
      .text('\n')
      .cutPaper()
      .write();

    return { success: true };
  } catch (error) {
    console.error('Error printing pre-bill:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Probar impresora con un ticket de prueba
 * @param {number} paperWidth - Ancho de papel (58 o 80mm)
 */
export const testPrinter = async (paperWidth = 58) => {
  const isNative = Capacitor.isNativePlatform();

  console.log('🖨️ testPrinter - Iniciando prueba de impresión');
  console.log('📱 Plataforma nativa:', isNative);
  console.log('🔌 Impresora conectada:', isPrinterConnected);
  console.log('📏 Ancho de papel:', paperWidth);

  if (!isNative) {
    console.error('❌ No es plataforma nativa');
    return { success: false, error: 'Solo disponible en app móvil' };
  }

  if (!isPrinterConnected) {
    console.error('❌ Impresora no conectada');
    return { success: false, error: 'Impresora no conectada. Conéctala primero.' };
  }

  try {
    console.log('✅ Iniciando impresión de prueba...');
    const format = getFormat(paperWidth);
    console.log('📐 Formato seleccionado:', format);

    console.log('🔄 Preparando comandos de impresión...');
    // El plugin usa method chaining - no se necesita await hasta write()
    await CapacitorThermalPrinter.begin()
      .align('center')
      .bold()
      .text('PRUEBA DE IMPRESORA\n')
      .clearFormatting()
      .text(format.separator + '\n')
      .text('\n')
      .align('left')
      .text(convertSpanishText('Texto en español: áéíóú\n'))
      .text(convertSpanishText('Caracteres: ñÑ ¿? ¡!\n'))
      .bold()
      .text('Texto en negrita\n')
      .clearFormatting()
      .underline()
      .text('Texto subrayado\n')
      .clearFormatting()
      .text('\n')
      .align('center')
      .text(`Fecha: ${new Date().toLocaleString('es-PE')}\n`)
      .text('\n')
      .text(`Ancho: ${paperWidth}mm\n`)
      .text(convertSpanishText('Impresora configurada\n'))
      .text('correctamente!\n')
      .text('\n')
      .text('\n')
      .cutPaper()
      .write();

    console.log('✅ Impresión completada');

    console.log('🎉 Impresión de prueba completada exitosamente');
    return { success: true };
  } catch (error) {
    console.error('❌ Error en testPrinter:', error);
    console.error('Tipo de error:', error.constructor.name);
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message || 'Error desconocido al imprimir' };
  }
};
