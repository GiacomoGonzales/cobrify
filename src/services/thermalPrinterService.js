import { CapacitorThermalPrinter } from 'capacitor-thermal-printer';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { prepareLogoForPrinting } from './imageProcessingService';

/**
 * Servicio para manejar impresoras térmicas WiFi/Bluetooth
 * Soporta impresión de tickets, comandas de cocina y precuentas
 */

// Plugin TCP para impresión WiFi/LAN
const TcpPrinter = registerPlugin('TcpPrinter');

// Estado de la impresora
let isPrinterConnected = false;
let connectedPrinterAddress = null;
let connectionType = 'bluetooth'; // 'bluetooth' o 'wifi'

/**
 * Constantes de formato según ancho de papel
 * Los separadores se ajustan al ancho real de la impresora
 *
 * NOTA: Algunos rollos de 58mm solo imprimen ~24 caracteres
 * por lo que usamos valores conservadores para evitar desbordamiento
 */
const PAPER_FORMATS = {
  58: {
    charsPerLine: 24, // Ancho real de la mayoría de impresoras 58mm
    separator: '------------------------', // 24 guiones (ancho completo)
    halfSeparator: '------------' // 12 guiones (medio ancho)
  },
  80: {
    charsPerLine: 42, // Ancho real de la mayoría de impresoras 80mm
    separator: '------------------------------------------', // 42 guiones (ancho completo)
    halfSeparator: '---------------------' // 21 guiones (medio ancho)
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
 * Detectar si una dirección es IP o MAC
 * @param {string} address - Dirección a verificar
 * @returns {'wifi' | 'bluetooth'} Tipo de conexión
 */
const detectConnectionType = (address) => {
  // Patrón de IP: xxx.xxx.xxx.xxx o xxx.xxx.xxx.xxx:port
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
  // Patrón de MAC: XX:XX:XX:XX:XX:XX
  const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

  if (ipPattern.test(address)) {
    return 'wifi';
  } else if (macPattern.test(address)) {
    return 'bluetooth';
  }
  // Por defecto, asumir bluetooth para mantener compatibilidad
  return 'bluetooth';
};

/**
 * Parsear dirección IP y puerto
 * @param {string} address - Dirección IP con o sin puerto
 * @returns {{ ip: string, port: number }}
 */
const parseIpAddress = (address) => {
  if (address.includes(':')) {
    const [ip, port] = address.split(':');
    return { ip, port: parseInt(port, 10) };
  }
  return { ip: address, port: 9100 }; // Puerto por defecto para impresoras térmicas
};

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

    // Desconectar según el tipo de conexión actual
    if (connectionType === 'wifi') {
      await TcpPrinter.disconnect();
    } else {
      await CapacitorThermalPrinter.disconnect();
    }

    isPrinterConnected = false;
    connectedPrinterAddress = null;
    connectionType = 'bluetooth';
    console.log('✅ Impresora desconectada');
    return { success: true };
  } catch (error) {
    console.error('❌ Error al desconectar:', error);
    // Marcar como desconectado de todos modos
    isPrinterConnected = false;
    connectedPrinterAddress = null;
    connectionType = 'bluetooth';
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

  // Detectar tipo de conexión
  const detectedType = detectConnectionType(address);
  console.log('🔍 Tipo de conexión detectado:', detectedType);

  try {
    // Primero intentar desconectar cualquier conexión anterior
    console.log('🔄 Desconectando conexión anterior (si existe)...');
    await disconnectPrinter();

    // Pequeña espera para asegurar que la desconexión se complete
    await new Promise(resolve => setTimeout(resolve, 500));

    if (detectedType === 'wifi') {
      // Conexión WiFi/LAN via TCP
      console.log('📶 Conectando via WiFi/LAN...');
      const { ip, port } = parseIpAddress(address);
      console.log(`📍 IP: ${ip}, Puerto: ${port}`);

      const result = await TcpPrinter.connect({ ip, port });
      console.log('📋 Resultado de conexión WiFi:', result);

      if (result && result.success) {
        isPrinterConnected = true;
        connectedPrinterAddress = address;
        connectionType = 'wifi';
        console.log('✅ Impresora WiFi conectada:', address);
        return { success: true, address, type: 'wifi' };
      } else {
        console.error('❌ Conexión WiFi falló');
        return { success: false, error: 'No se pudo conectar a la impresora WiFi' };
      }
    } else {
      // Conexión Bluetooth (comportamiento original)
      console.log('🔵 Conectando via Bluetooth...');
      const result = await CapacitorThermalPrinter.connect({ address });
      console.log('📋 Resultado de connect():', result);

      // Solo marcar como conectado si el resultado no es null
      if (result !== null && result !== undefined) {
        isPrinterConnected = true;
        connectedPrinterAddress = address;
        connectionType = 'bluetooth';
        console.log('✅ Printer connected:', address);
        console.log('✅ isPrinterConnected:', isPrinterConnected);
        console.log('✅ connectedPrinterAddress:', connectedPrinterAddress);
        return { success: true, address, type: 'bluetooth' };
      } else {
        console.error('❌ Conexión falló - resultado null');
        isPrinterConnected = false;
        connectedPrinterAddress = null;
        return { success: false, error: 'No se pudo conectar a la impresora' };
      }
    }
  } catch (error) {
    console.error('❌ Error connecting to printer:', error);
    console.error('Tipo de error:', error.constructor.name);
    console.error('Mensaje:', error.message);

    isPrinterConnected = false;
    connectedPrinterAddress = null;
    connectionType = 'bluetooth';
    return { success: false, error: error.message || 'Error al conectar' };
  }
};

/**
 * Obtener el tipo de conexión actual
 */
export const getConnectionType = () => connectionType;

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
        paperWidth: printerConfig.paperWidth || 80, // Guardar ancho de papel (80mm por defecto)
        enabled: printerConfig.enabled !== false,
        webPrintLegible: printerConfig.webPrintLegible || false, // Modo legible para impresión web
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
 * Añadir separador centrado para 58mm
 * @param {Object} printer - Objeto printer
 * @param {string} separator - Línea separadora
 * @param {number} paperWidth - Ancho de papel
 * @param {string} currentAlign - Alineación actual ('left', 'center', 'right')
 * @returns {Object} Printer object
 */
const addSeparator = (printer, separator, paperWidth, currentAlign = 'left') => {
  if (paperWidth === 58) {
    return printer
      .align('center')
      .text(separator + '\n')
      .align(currentAlign);
  } else {
    return printer.text(separator + '\n');
  }
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

  // Si es conexión WiFi, usar la función específica para WiFi
  if (connectionType === 'wifi') {
    console.log('📶 Usando impresión WiFi para ticket...');
    return await printWifiTicket(invoice, business, paperWidth);
  }

  // Bluetooth - comportamiento original
  console.log('🔵 Usando impresión Bluetooth para ticket...');

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
    const lineWidth = format.charsPerLine; // Usar ancho real configurado (58mm: 24, 80mm: 42)
    const cantWidth = 6; // Columna cantidad
    const descWidth = paperWidth === 80 ? 20 : 12; // Columna descripción ajustada
    const priceWidth = paperWidth === 80 ? 12 : 10; // Columna precio ajustada

    // Items text
    let itemsText = '';

    // NO mostrar header de columnas para ningún formato (ni 58mm ni 80mm)
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
        // FORMATO 80MM - EXACTAMENTE IGUAL AL WEB
        // Línea 1: Nombre del producto completo
        itemsText += `${itemName}\n`;

        // Línea 2: "cantidad X precio unitario" (izq) y "total" (der) - CON ESPACIOS PARA ALINEAR
        // Formatear cantidad: con decimales si tiene, sino entero
        const qtyFormatted = Number.isInteger(item.quantity)
          ? item.quantity.toString()
          : item.quantity.toFixed(3).replace(/\.?0+$/, '');
        const unitSuffix = item.unit && item.allowDecimalQuantity ? item.unit.toLowerCase() : '';
        const qtyAndPrice = `${qtyFormatted}${unitSuffix} X S/ ${unitPrice.toFixed(2)}`;
        const totalStr = `S/ ${itemTotal.toFixed(2)}`;
        const spaceBetween = lineWidth - qtyAndPrice.length - totalStr.length;
        itemsText += `${qtyAndPrice}${' '.repeat(Math.max(1, spaceBetween))}${totalStr}\n`;

        // Línea 3: Código si existe
        if (item.code) {
          itemsText += `Codigo: ${convertSpanishText(item.code)}\n`;
        }

        // Línea 4: Separación entre items (línea vacía)
        itemsText += '\n';
      } else {
        // FORMATO 58MM - IGUAL QUE 80MM pero adaptado al ancho de 24 caracteres
        // Línea 1: Nombre del producto completo
        itemsText += `${itemName}\n`;

        // Línea 2: "cantidad x precio unitario" (izq) y "total" (der) - CON ESPACIOS PARA ALINEAR
        // Formatear cantidad: con decimales si tiene, sino entero
        const qtyFormatted = Number.isInteger(item.quantity)
          ? item.quantity.toString()
          : item.quantity.toFixed(3).replace(/\.?0+$/, '');
        const unitSuffix = item.unit && item.allowDecimalQuantity ? item.unit.toLowerCase() : '';
        const qtyAndPrice = `${qtyFormatted}${unitSuffix}x S/ ${unitPrice.toFixed(2)}`;
        const totalStr = `S/ ${itemTotal.toFixed(2)}`;
        const spaceBetween = lineWidth - qtyAndPrice.length - totalStr.length;
        itemsText += `${qtyAndPrice}${' '.repeat(Math.max(1, spaceBetween))}${totalStr}\n`;

        // Línea 3: Código si existe (alineado a la izquierda)
        if (item.code) {
          itemsText += `Codigo: ${convertSpanishText(item.code)}\n`;
        }
      }
    }

    // Eliminar el último salto de línea extra si existe
    if (itemsText.endsWith('\n\n')) {
      itemsText = itemsText.slice(0, -1);
    }

    // Construir comando en cadena
    let printer = CapacitorThermalPrinter.begin();

    // Solo aplicar lineSpacing para 80mm (el de 58mm ya está bien)
    if (paperWidth === 80) {
      printer = printer.lineSpacing(2); // Espaciado vertical entre líneas (0-255mm)
    }

    printer = printer.align('center');

    // ========== HEADER - Datos del Emisor ==========

    // Logo optimizado (si existe URL de logo del negocio)
    console.log('🖨️ Imprimiendo con ancho de papel:', paperWidth, 'mm');

    // Centrar todo el header en 58mm para mejor presentación
    printer = printer.align('center');

    if (business.logoUrl) {
      console.log('📷 Preparando logo del negocio...');
      try {
        const logoConfig = await prepareLogoForPrinting(business.logoUrl, paperWidth);

        // Determinar ancho en milímetros según papel (30% más pequeño)
        const logoWidthMm = paperWidth === 58 ? 32 : 46;
        console.log(`📏 Ancho de logo: ${logoWidthMm}mm para papel de ${paperWidth}mm`);

        if (logoConfig.ready && logoConfig.base64) {
          // Convertir base64 a data URL para el plugin
          const dataUrl = `data:image/png;base64,${logoConfig.base64}`;
          console.log('✅ Logo listo (base64). Aplicando ancho:', logoWidthMm, 'mm');
          printer = printer
            .limitWidth(logoWidthMm)
            .image(dataUrl);
        } else if (logoConfig.ready && logoConfig.url) {
          // Fallback: intentar con URL directa
          console.log('⚠️ Intentando imprimir logo desde URL...');
          printer = printer
            .limitWidth(logoWidthMm)
            .image(logoConfig.url);
        } else {
          console.warn('⚠️ Logo no disponible, usando header de texto');
        }
      } catch (error) {
        console.error('❌ Error al cargar logo:', error.message);
        console.warn('Continuando sin logo...');
      }
    } else {
      console.log('ℹ️ No hay logo configurado');
    }

    // Nombre del negocio (company-name) - Formato elegante con bold - CENTRADO
    const businessName = convertSpanishText(business.tradeName || business.name || 'MI EMPRESA');
    printer = printer
      .align('center')
      .bold()
      .text(businessName + '\n')
      .clearFormatting();

    // RUC (company-info) - CENTRADO
    if (!(isNotaVenta && business.hideRucIgvInNotaVenta)) {
      printer = printer.align('center').text(convertSpanishText(`RUC: ${business.ruc || '00000000000'}\n`));
    }

    // Razón Social (si existe y es diferente del nombre comercial) - CENTRADO
    if (business.businessName && business.businessName !== business.tradeName) {
      printer = printer.align('center').text(convertSpanishText(business.businessName + '\n'));
    }

    // Dirección (company-info) - CENTRADO
    printer = printer.align('center').text(convertSpanishText((business.address || 'Direccion no configurada') + '\n'));

    // Teléfono (company-info) - CENTRADO
    if (business.phone) {
      printer = printer.align('center').text(convertSpanishText(`Tel: ${business.phone}\n`));
    }

    // Email (company-info) - CENTRADO
    if (business.email) {
      printer = printer.align('center').text(convertSpanishText(`Email: ${business.email}\n`));
    }

    // Redes sociales (company-info) - CENTRADO
    if (business.socialMedia) {
      printer = printer.align('center').text(convertSpanishText(business.socialMedia + '\n'));
    }

    // Espacio antes del tipo de documento
    printer = printer.align('center').text('\n');

    // Tipo de documento (document-type) - CENTRADO
    printer = printer
      .align('center')
      .bold()
      .text(tipoComprobanteCompleto + '\n')
      .clearFormatting();

    // Número de documento (document-number) - CENTRADO
    printer = printer
      .align('center')
      .bold()
      .text(`${invoice.series || 'B001'}-${String(invoice.correlativeNumber || invoice.number || '000').padStart(8, '0')}\n`)
      .clearFormatting();

    printer = addSeparator(printer, format.separator, paperWidth, 'center');

    // ========== Fecha y Hora (ticket-section) ==========
    // Formatear fecha y hora de manera compatible con impresoras térmicas
    // Priorizar emissionDate (string YYYY-MM-DD) para evitar problemas de zona horaria
    let invoiceDate;
    if (invoice.emissionDate && typeof invoice.emissionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(invoice.emissionDate)) {
      // Parsear emissionDate como fecha local (no UTC) para Lima, Perú
      const [year, month, day] = invoice.emissionDate.split('-').map(Number);
      invoiceDate = new Date(year, month - 1, day, 12, 0, 0);
    } else {
      invoiceDate = new Date(invoice.issueDate?.toDate ? invoice.issueDate.toDate() : invoice.issueDate || invoice.createdAt?.toDate ? invoice.createdAt.toDate() : invoice.createdAt || new Date());
    }
    const createdDate = new Date(invoice.createdAt?.toDate ? invoice.createdAt.toDate() : invoice.createdAt || new Date());

    // Formatear hora en 24h para evitar problemas con "p.m." / "a.m."
    const hours = String(createdDate.getHours()).padStart(2, '0');
    const minutes = String(createdDate.getMinutes()).padStart(2, '0');
    const seconds = String(createdDate.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;

    printer = printer
      .align('left')
      .text(convertSpanishText(`Fecha: ${invoiceDate.toLocaleDateString('es-PE')}\n`))
      .text(`Hora: ${timeString}\n`);

    // ========== Datos del Cliente (ticket-section) ==========
    // Mostrar para facturas, boletas y notas de venta
    if (isInvoice || invoice.documentType === 'boleta' || invoice.documentType === 'nota_venta') {
      printer = printer
        .align('left')
        .bold()
        .text('DATOS DEL CLIENTE\n')
        .clearFormatting();

      if (invoice.documentType === 'boleta' || invoice.documentType === 'nota_venta') {
        // Para boletas y notas de venta - DNI, Nombre y Dirección (si existe)
        const customerAddress = invoice.customer?.address || invoice.customerAddress || '';

        printer = printer
          .text(convertSpanishText(`DNI: ${invoice.customer?.documentNumber || invoice.customerDocument || invoice.customerDni || '-'}\n`))
          .text(convertSpanishText(`Nombre: ${invoice.customer?.name || invoice.customerName || 'Cliente'}\n`));

        // Dirección (si existe)
        if (customerAddress) {
          printer = printer.text(convertSpanishText(`Direccion: ${customerAddress}\n`));
        }
      }

      if (isInvoice) {
        // Para facturas - RUC, Razón Social, Nombre Comercial (opcional), Dirección (opcional)
        const customerName = invoice.customer?.name || invoice.customerName || '';
        const customerBusinessName = invoice.customer?.businessName || invoice.customerBusinessName || '-';
        const customerAddress = invoice.customer?.address || invoice.customerAddress || '';

        printer = printer
          .text(convertSpanishText(`RUC: ${invoice.customer?.documentNumber || invoice.customerDocument || invoice.customerRuc || '-'}\n`))
          .text(convertSpanishText(`Razon Social: ${customerBusinessName}\n`));

        // Nombre Comercial (si existe y es diferente de VARIOS)
        if (customerName && customerName !== 'VARIOS') {
          printer = printer.text(convertSpanishText(`Nombre Comercial: ${customerName}\n`));
        }

        // Dirección (si existe)
        if (customerAddress) {
          printer = printer.text(convertSpanishText(`Direccion: ${customerAddress}\n`));
        }
      }

      printer = addSeparator(printer, format.separator, paperWidth, 'left');
    }

    // ========== Detalle de Productos/Servicios (ticket-section) ==========
    printer = printer
      .align('left')
      .bold()
      .text('DETALLE\n')
      .clearFormatting()
      .text(itemsText);

    printer = addSeparator(printer, format.separator, paperWidth, 'left')
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
      // Usar emissionDate primero para evitar problemas de zona horaria
      let fecha;
      if (invoice.emissionDate && typeof invoice.emissionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(invoice.emissionDate)) {
        fecha = invoice.emissionDate;
      } else {
        fecha = new Date(invoice.issueDate?.toDate ? invoice.issueDate.toDate() : invoice.issueDate || invoice.createdAt?.toDate ? invoice.createdAt.toDate() : invoice.createdAt || new Date()).toISOString().split('T')[0];
      }
      const docCliente = isInvoice ? '6' : '1'; // 6=RUC, 1=DNI
      const numDocCliente = invoice.customer?.documentNumber || invoice.customerDocument || invoice.customerRuc || invoice.customerDni || '';

      qrData = `${business.ruc}|${tipoDoc}|${invoice.series}|${invoice.correlativeNumber || invoice.number}|${(invoice.tax || invoice.igv || 0).toFixed(2)}|${(invoice.total || 0).toFixed(2)}|${fecha}|${docCliente}|${numDocCliente}`;
    }

    // ========== Forma de Pago (ticket-section) ==========
    if (invoice.paymentMethod || invoice.payments) {
      printer = addSeparator(printer, format.separator, paperWidth, 'left');

      printer = printer
        .align('left')
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

    // ========== Observaciones (ticket-section) ==========
    if (invoice.notes) {
      printer = addSeparator(printer, format.separator, paperWidth, 'center');

      printer = printer
        .bold()
        .text('OBSERVACIONES\n')
        .clearFormatting()
        .text(convertSpanishText(invoice.notes + '\n'));
    }

    // ========== FOOTER (ticket-footer) ==========
    printer = addSeparator(printer, format.separator, paperWidth, 'center');

    printer = printer.align('center');

    // Leyenda legal según tipo de documento
    if (isNotaVenta) {
      printer = printer
        .bold()
        .text('DOCUMENTO NO VALIDO PARA\n')
        .text('FINES TRIBUTARIOS\n')
        .clearFormatting();
    } else {
      // Para facturas y boletas electrónicas
      printer = printer
        .bold()
        .text(convertSpanishText(`REPRESENTACION IMPRESA DE LA\n${tipoComprobante} ELECTRONICA\n`))
        .clearFormatting();

      // Hash SUNAT (si existe)
      if (invoice.sunatHash) {
        printer = printer
          .align('left')
          .bold()
          .text('Hash: ')
          .clearFormatting()
          .text(convertSpanishText(invoice.sunatHash.substring(0, paperWidth === 80 ? 45 : 30)) + '\n')
          .align('center');
      }

      // QR Code con texto "Escanea para validar"
      if (qrData) {
        printer = printer
          .align('center')
          .qr(qrData)
          .text('Escanea para validar\n');
      }

      // Consulte comprobante en SUNAT
      printer = printer
        .align('center')
        .text('Consulte su comprobante en:\n')
        .text('www.sunat.gob.pe\n');
    }

    // Mensaje de agradecimiento
    printer = printer
      .align('center')
      .bold()
      .text(convertSpanishText('!Gracias por su preferencia!\n'))
      .clearFormatting();

    // Website (si existe)
    if (business.website) {
      printer = printer
        .align('center')
        .text(convertSpanishText(business.website + '\n'));
    }

    printer = printer.text('\n');

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
  console.log('📶 connectionType:', connectionType);
  console.log('📍 connectedPrinterAddress:', connectedPrinterAddress);

  if (!isNative) {
    console.error('❌ No es plataforma nativa');
    return { success: false, error: 'Solo disponible en app móvil' };
  }

  if (!isPrinterConnected || !connectedPrinterAddress) {
    console.error('❌ Impresora no conectada');
    return { success: false, error: 'Impresora no conectada. Conéctala primero desde Ajustes.' };
  }

  // Si es conexión WiFi, usar función específica
  if (connectionType === 'wifi') {
    console.log('📶 Usando impresión WiFi para comanda...');
    return await printWifiKitchenOrder(order, table, paperWidth);
  }

  // Bluetooth - comportamiento original
  console.log('🔵 Usando impresión Bluetooth para comanda...');

  try {
    const format = getFormat(paperWidth);

    // Construir items text
    let itemsText = '\n';
    for (const item of order.items || []) {
      itemsText += `${item.quantity}x ${convertSpanishText(item.name)}\n`;

      // Mostrar modificadores si existen (DESTACADO)
      if (item.modifiers && item.modifiers.length > 0) {
        itemsText += '  *** MODIFICADORES ***\n';
        for (const modifier of item.modifiers) {
          itemsText += `  * ${convertSpanishText(modifier.modifierName)}:\n`;
          for (const option of modifier.options) {
            itemsText += `    -> ${convertSpanishText(option.optionName)}`;
            if (option.priceAdjustment > 0) {
              itemsText += ` (+S/${option.priceAdjustment.toFixed(2)})`;
            }
            itemsText += '\n';
          }
        }
      }

      if (item.notes) {
        itemsText += `  Nota: ${convertSpanishText(item.notes)}\n`;
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
      .clearFormatting();

    printer = addSeparator(printer, format.separator, paperWidth, 'center');

    // Información de la orden
    printer = printer
      .align('left')
      .bold()
      .text(`Fecha: ${new Date().toLocaleString('es-PE')}\n`);

    if (table) {
      printer = printer
        .text(`Mesa: ${table.number}\n`)
        .text(`Mozo: ${table.waiter || 'N/A'}\n`);
    }

    printer = printer
      .text(`Orden: #${order.orderNumber || order.id?.slice(-6) || 'N/A'}\n`)
      .clearFormatting();

    printer = addSeparator(printer, format.separator, paperWidth, 'left');

    printer = printer
      // Items (aquí se resetea formato antes de cada item usando clearFormatting + bold + doubleWidth)
      .text(itemsText);

    printer = addSeparator(printer, format.separator, paperWidth, 'left');

    await printer
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

  // Si es conexión WiFi, usar función específica
  if (connectionType === 'wifi') {
    console.log('📶 Usando impresión WiFi para precuenta...');
    return await printWifiPreBill(order, table, business, taxConfig, paperWidth);
  }

  // Bluetooth - comportamiento original
  console.log('🔵 Usando impresión Bluetooth para precuenta...');

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
      const desc = convertSpanishText(item.name).substring(0, descWidth).padEnd(descWidth);
      const price = `S/${item.total.toFixed(2)}`.padStart(paperWidth === 80 ? 10 : 8);
      itemsText += `${cant}${desc}${price}\n`;

      // Mostrar modificadores si existen
      if (item.modifiers && item.modifiers.length > 0) {
        itemsText += '  ** MODIFICADORES **\n';
        for (const modifier of item.modifiers) {
          itemsText += `  * ${convertSpanishText(modifier.modifierName)}:\n`;
          for (const option of modifier.options) {
            itemsText += `    -> ${convertSpanishText(option.optionName)}`;
            if (option.priceAdjustment > 0) {
              itemsText += ` (+S/${option.priceAdjustment.toFixed(2)})`;
            }
            itemsText += '\n';
          }
        }
      }

      if (item.notes) {
        itemsText += `  * ${convertSpanishText(item.notes)}\n`;
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
    let printer = CapacitorThermalPrinter.begin()
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
      .clearFormatting();

    printer = addSeparator(printer, format.separator, paperWidth, 'center');

    // Información
    printer = printer.align('left')
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
      .clearFormatting();

    // Pie de página
    printer = addSeparator(printer, format.separator, paperWidth, 'center');

    await printer
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
  console.log('📶 Tipo de conexión:', connectionType);
  console.log('📏 Ancho de papel:', paperWidth, 'mm');

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

    // Si es WiFi, usar el plugin TCP
    if (connectionType === 'wifi') {
      console.log('📶 Usando impresión WiFi...');
      const result = await TcpPrinter.printTest({ paperWidth });
      console.log('📋 Resultado de impresión WiFi:', result);

      if (result && result.success) {
        console.log('🎉 Impresión de prueba WiFi completada exitosamente');
        return { success: true };
      } else {
        return { success: false, error: 'Error al imprimir via WiFi' };
      }
    }

    // Bluetooth - comportamiento original
    console.log('🔵 Usando impresión Bluetooth...');
    console.log('🔄 Preparando comandos de impresión...');

    // Mostrar ancho configurado
    const widthText = paperWidth === 58 ? '58MM (ESTRECHO)' : '80MM (ANCHO)';
    const charsText = `${format.charsPerLine} caracteres por linea`;

    await CapacitorThermalPrinter.begin()
      .align('center')
      .bold()
      .text('PRUEBA DE IMPRESORA\n')
      .clearFormatting()
      .text(format.separator + '\n')
      .text('\n')
      .bold()
      .doubleWidth()
      .text(`${widthText}\n`)
      .clearFormatting()
      .text(`${charsText}\n`)
      .text('\n')
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

/**
 * Probar impresión con logo
 * @param {string} logoUrl - URL del logo a probar
 * @param {number} paperWidth - Ancho de papel (58 o 80mm)
 */
export const testPrinterWithLogo = async (logoUrl, paperWidth = 58) => {
  const isNative = Capacitor.isNativePlatform();

  console.log('🖨️ testPrinterWithLogo - Iniciando prueba con logo');
  console.log('📷 Logo URL:', logoUrl);
  console.log('📏 Ancho de papel:', paperWidth, 'mm');

  if (!isNative) {
    return { success: false, error: 'Solo disponible en app móvil' };
  }

  if (!isPrinterConnected) {
    return { success: false, error: 'Impresora no conectada' };
  }

  try {
    const format = getFormat(paperWidth);

    // Preparar logo
    console.log('📷 Preparando logo...');
    const logoConfig = await prepareLogoForPrinting(logoUrl, paperWidth);

    let printer = CapacitorThermalPrinter.begin()
      .align('center')
      .bold()
      .text('PRUEBA DE LOGO\n')
      .clearFormatting()
      .text(format.separator + '\n')
      .text('\n');

    if (logoConfig.ready && logoConfig.base64) {
      const dataUrl = `data:image/png;base64,${logoConfig.base64}`;
      console.log('✅ Imprimiendo logo desde base64');
      printer = printer
        .image(dataUrl, logoConfig.width)
        .text('\n')
        .text('Logo impreso (base64)\n');
    } else if (logoConfig.ready && logoConfig.url) {
      console.log('⚠️ Imprimiendo logo desde URL');
      printer = printer
        .image(logoConfig.url, logoConfig.width)
        .text('\n')
        .text('Logo impreso (URL)\n');
    } else {
      console.log('❌ Logo no disponible');
      printer = printer.text('Logo no disponible\n');
    }

    await printer
      .text('\n')
      .text(format.separator + '\n')
      .text(`Ancho papel: ${paperWidth}mm\n`)
      .text(`Ancho logo: ${logoConfig.width}px\n`)
      .text(`Fecha: ${new Date().toLocaleString('es-PE')}\n`)
      .text('\n\n')
      .cutPaper()
      .write();

    return { success: true };
  } catch (error) {
    console.error('❌ Error en testPrinterWithLogo:', error);
    return { success: false, error: error.message };
  }
};

// ============================================
// FUNCIONES PARA IMPRESIÓN WIFI/LAN (ESC/POS)
// ============================================

/**
 * Clase para construir comandos ESC/POS para impresión WiFi
 */
class EscPosBuilder {
  constructor() {
    this.commands = [];
  }

  // Comandos ESC/POS básicos
  static ESC = 0x1B;
  static GS = 0x1D;
  static LF = 0x0A;

  // Inicializar impresora
  init() {
    this.commands.push(EscPosBuilder.ESC, 0x40); // ESC @
    return this;
  }

  // Alineación
  alignLeft() {
    this.commands.push(EscPosBuilder.ESC, 0x61, 0x00);
    return this;
  }

  alignCenter() {
    this.commands.push(EscPosBuilder.ESC, 0x61, 0x01);
    return this;
  }

  alignRight() {
    this.commands.push(EscPosBuilder.ESC, 0x61, 0x02);
    return this;
  }

  // Negrita
  bold(on = true) {
    this.commands.push(EscPosBuilder.ESC, 0x45, on ? 0x01 : 0x00);
    return this;
  }

  // Subrayado
  underline(on = true) {
    this.commands.push(EscPosBuilder.ESC, 0x2D, on ? 0x01 : 0x00);
    return this;
  }

  // Doble ancho
  doubleWidth(on = true) {
    this.commands.push(EscPosBuilder.ESC, 0x21, on ? 0x20 : 0x00);
    return this;
  }

  // Doble alto
  doubleHeight(on = true) {
    this.commands.push(EscPosBuilder.ESC, 0x21, on ? 0x10 : 0x00);
    return this;
  }

  // Limpiar formato
  clearFormatting() {
    this.commands.push(EscPosBuilder.ESC, 0x21, 0x00);
    return this;
  }

  // Texto
  text(str) {
    // Convertir caracteres especiales españoles
    const converted = convertSpanishText(str);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(converted);
    this.commands.push(...bytes);
    return this;
  }

  // Nueva línea
  newLine(count = 1) {
    for (let i = 0; i < count; i++) {
      this.commands.push(EscPosBuilder.LF);
    }
    return this;
  }

  // Alimentar papel
  feed(lines = 3) {
    this.commands.push(EscPosBuilder.ESC, 0x64, lines);
    return this;
  }

  // Cortar papel
  cut(partial = false) {
    this.commands.push(EscPosBuilder.GS, 0x56, partial ? 0x01 : 0x00);
    return this;
  }

  // Código QR
  qr(data, size = 6) {
    // Modelo QR
    this.commands.push(EscPosBuilder.GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Tamaño del módulo
    this.commands.push(EscPosBuilder.GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size);
    // Nivel de corrección de errores (L)
    this.commands.push(EscPosBuilder.GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30);
    // Almacenar datos
    const dataBytes = new TextEncoder().encode(data);
    const len = dataBytes.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);
    this.commands.push(EscPosBuilder.GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30, ...dataBytes);
    // Imprimir QR
    this.commands.push(EscPosBuilder.GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  // Obtener bytes para enviar
  build() {
    return new Uint8Array(this.commands);
  }

  // Obtener como base64
  toBase64() {
    const bytes = this.build();
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

/**
 * Imprimir ticket vía WiFi usando comandos ESC/POS
 */
export const printWifiTicket = async (invoice, business, paperWidth = 58) => {
  if (connectionType !== 'wifi' || !isPrinterConnected) {
    return { success: false, error: 'No hay conexión WiFi activa' };
  }

  try {
    const format = getFormat(paperWidth);
    const builder = new EscPosBuilder();

    // Determinar tipo de documento
    const docType = invoice.documentType || invoice.type || 'boleta';
    const isInvoice = docType === 'factura' || docType === 'invoice';
    const isNotaVenta = docType === 'nota_venta';
    const tipoComprobante = isNotaVenta ? 'NOTA DE VENTA' : (isInvoice ? 'FACTURA ELECTRONICA' : 'BOLETA DE VENTA ELECTRONICA');

    // Construir ticket
    builder.init()
      .alignCenter()
      .bold(true)
      .text(business.tradeName || business.name || 'MI EMPRESA')
      .newLine()
      .bold(false);

    // RUC
    if (!(isNotaVenta && business.hideRucIgvInNotaVenta)) {
      builder.text(`RUC: ${business.ruc || '00000000000'}`).newLine();
    }

    // Dirección
    builder.text(business.address || 'Direccion no configurada').newLine();

    // Teléfono
    if (business.phone) {
      builder.text(`Tel: ${business.phone}`).newLine();
    }

    builder.newLine()
      .bold(true)
      .text(tipoComprobante)
      .newLine()
      .text(`${invoice.series || 'B001'}-${String(invoice.correlativeNumber || invoice.number || '000').padStart(8, '0')}`)
      .newLine()
      .bold(false)
      .text(format.separator)
      .newLine();

    // Fecha y hora
    // Priorizar emissionDate para evitar problemas de zona horaria en Lima
    let invoiceDate;
    if (invoice.emissionDate && typeof invoice.emissionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(invoice.emissionDate)) {
      const [year, month, day] = invoice.emissionDate.split('-').map(Number);
      invoiceDate = new Date(year, month - 1, day, 12, 0, 0);
    } else {
      invoiceDate = new Date(invoice.issueDate?.toDate ? invoice.issueDate.toDate() : invoice.issueDate || new Date());
    }
    const createdDate = new Date(invoice.createdAt?.toDate ? invoice.createdAt.toDate() : invoice.createdAt || new Date());
    builder.alignLeft()
      .text(`Fecha: ${invoiceDate.toLocaleDateString('es-PE')}`)
      .newLine()
      .text(`Hora: ${createdDate.toLocaleTimeString('es-PE')}`)
      .newLine();

    // Datos del cliente
    builder.bold(true)
      .text('DATOS DEL CLIENTE')
      .newLine()
      .bold(false);

    if (isInvoice) {
      builder.text(`RUC: ${invoice.customer?.documentNumber || '-'}`).newLine()
        .text(`Razon Social: ${invoice.customer?.businessName || '-'}`).newLine();
    } else {
      builder.text(`DNI: ${invoice.customer?.documentNumber || '-'}`).newLine()
        .text(`Nombre: ${invoice.customer?.name || 'Cliente'}`).newLine();
    }

    builder.text(format.separator).newLine()
      .bold(true)
      .text('DETALLE')
      .newLine()
      .bold(false);

    // Items
    for (const item of invoice.items) {
      const itemName = item.description || item.name || '';
      const unitPrice = item.unitPrice || item.price || 0;
      const itemTotal = item.total || item.subtotal || (unitPrice * item.quantity);

      // Formatear cantidad: con decimales si tiene, sino entero
      const qtyFormatted = Number.isInteger(item.quantity)
        ? item.quantity.toString()
        : item.quantity.toFixed(3).replace(/\.?0+$/, '');
      const unitSuffix = item.unit && item.allowDecimalQuantity ? item.unit.toLowerCase() : '';

      builder.text(itemName).newLine()
        .text(`${qtyFormatted}${unitSuffix} x S/ ${unitPrice.toFixed(2)}`)
        .text(`  S/ ${itemTotal.toFixed(2)}`)
        .newLine();
    }

    builder.text(format.separator).newLine()
      .alignRight();

    // Totales
    if (!(isNotaVenta && business.hideRucIgvInNotaVenta)) {
      builder.text(`Subtotal: S/ ${(invoice.subtotal || 0).toFixed(2)}`).newLine()
        .text(`IGV (18%): S/ ${(invoice.tax || invoice.igv || 0).toFixed(2)}`).newLine();
    }

    builder.bold(true)
      .text(`TOTAL: S/ ${(invoice.total || 0).toFixed(2)}`)
      .newLine()
      .bold(false);

    // Footer
    builder.alignCenter()
      .text(format.separator)
      .newLine();

    if (isNotaVenta) {
      builder.bold(true)
        .text('DOCUMENTO NO VALIDO PARA')
        .newLine()
        .text('FINES TRIBUTARIOS')
        .newLine()
        .bold(false);
    } else {
      builder.text('REPRESENTACION IMPRESA DE LA')
        .newLine()
        .text(tipoComprobante)
        .newLine();

      // QR Code (si hay datos)
      if (business.ruc && invoice.series) {
        const tipoDoc = isInvoice ? '01' : '03';
        const fecha = invoiceDate.toISOString().split('T')[0];
        const docCliente = isInvoice ? '6' : '1';
        const numDocCliente = invoice.customer?.documentNumber || '';
        const qrData = `${business.ruc}|${tipoDoc}|${invoice.series}|${invoice.correlativeNumber || invoice.number}|${(invoice.tax || 0).toFixed(2)}|${(invoice.total || 0).toFixed(2)}|${fecha}|${docCliente}|${numDocCliente}`;

        builder.qr(qrData);
      }

      builder.text('Consulte su comprobante en:').newLine()
        .text('www.sunat.gob.pe').newLine();
    }

    builder.bold(true)
      .text('!Gracias por su preferencia!')
      .newLine()
      .bold(false)
      .feed(3)
      .cut();

    // Enviar a impresora
    const base64Data = builder.toBase64();
    const result = await TcpPrinter.print({ data: base64Data });

    if (result && result.success) {
      return { success: true };
    } else {
      return { success: false, error: 'Error al imprimir via WiFi' };
    }

  } catch (error) {
    console.error('Error printing WiFi ticket:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir comanda de cocina vía WiFi
 */
const printWifiKitchenOrder = async (order, table = null, paperWidth = 58) => {
  try {
    const format = getFormat(paperWidth);
    const builder = new EscPosBuilder();

    builder.init()
      .alignCenter()
      .doubleWidth(true)
      .bold(true)
      .text('*** COMANDA ***')
      .newLine()
      .doubleWidth(false)
      .bold(false)
      .text(format.separator)
      .newLine()
      .alignLeft()
      .bold(true)
      .text(`Fecha: ${new Date().toLocaleString('es-PE')}`)
      .newLine();

    if (table) {
      builder.text(`Mesa: ${table.number}`)
        .newLine()
        .text(`Mozo: ${table.waiter || 'N/A'}`)
        .newLine();
    }

    builder.text(`Orden: #${order.orderNumber || order.id?.slice(-6) || 'N/A'}`)
      .newLine()
      .bold(false)
      .text(format.separator)
      .newLine();

    // Items
    for (const item of order.items || []) {
      builder.bold(true)
        .text(`${item.quantity}x ${item.name}`)
        .newLine()
        .bold(false);

      // Modificadores
      if (item.modifiers && item.modifiers.length > 0) {
        builder.text('  *** MODIFICADORES ***').newLine();
        for (const modifier of item.modifiers) {
          builder.text(`  * ${modifier.modifierName}:`).newLine();
          for (const option of modifier.options) {
            let optionText = `    -> ${option.optionName}`;
            if (option.priceAdjustment > 0) {
              optionText += ` (+S/${option.priceAdjustment.toFixed(2)})`;
            }
            builder.text(optionText).newLine();
          }
        }
      }

      if (item.notes) {
        builder.text(`  Nota: ${item.notes}`).newLine();
      }
      builder.newLine();
    }

    builder.text(format.separator)
      .newLine()
      .feed(2)
      .cut();

    const base64Data = builder.toBase64();
    const result = await TcpPrinter.print({ data: base64Data });

    if (result && result.success) {
      return { success: true };
    } else {
      return { success: false, error: 'Error al imprimir comanda via WiFi' };
    }
  } catch (error) {
    console.error('Error printing WiFi kitchen order:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir precuenta vía WiFi
 */
const printWifiPreBill = async (order, table, business, taxConfig = { igvRate: 18, igvExempt: false }, paperWidth = 58) => {
  try {
    const format = getFormat(paperWidth);
    const builder = new EscPosBuilder();

    // Calcular totales
    let subtotal, tax, total;
    total = order.total || 0;

    if (taxConfig.igvExempt) {
      subtotal = total;
      tax = 0;
    } else {
      const igvRate = taxConfig.igvRate || 18;
      const igvMultiplier = 1 + (igvRate / 100);
      subtotal = total / igvMultiplier;
      tax = total - subtotal;
    }

    builder.init()
      .alignCenter()
      .doubleWidth(true)
      .text(business.tradeName || 'RESTAURANTE')
      .newLine()
      .doubleWidth(false)
      .text(business.address || '')
      .newLine()
      .text(business.phone || '')
      .newLine()
      .bold(true)
      .doubleWidth(true)
      .text('PRECUENTA')
      .newLine()
      .doubleWidth(false)
      .bold(false)
      .text(format.separator)
      .newLine();

    // Información
    builder.alignLeft()
      .text(`Fecha: ${new Date().toLocaleString('es-PE')}`)
      .newLine()
      .text(`Mesa: ${table.number}`)
      .newLine()
      .text(`Mozo: ${table.waiter || 'N/A'}`)
      .newLine()
      .text(`Orden: #${order.orderNumber || order.id?.slice(-6)}`)
      .newLine()
      .text(format.halfSeparator)
      .newLine();

    // Items
    for (const item of order.items || []) {
      const itemTotal = item.total || (item.price * item.quantity);
      builder.text(`${item.quantity}x ${item.name}`)
        .newLine()
        .text(`   S/ ${itemTotal.toFixed(2)}`)
        .newLine();

      if (item.modifiers && item.modifiers.length > 0) {
        for (const modifier of item.modifiers) {
          for (const option of modifier.options) {
            if (option.priceAdjustment > 0) {
              builder.text(`   + ${option.optionName}: S/${option.priceAdjustment.toFixed(2)}`)
                .newLine();
            }
          }
        }
      }

      if (item.notes) {
        builder.text(`   * ${item.notes}`).newLine();
      }
    }

    builder.text(format.halfSeparator).newLine()
      .alignRight();

    // Totales
    if (!taxConfig.igvExempt) {
      builder.text(`Subtotal: S/ ${subtotal.toFixed(2)}`).newLine()
        .text(`IGV (${taxConfig.igvRate}%): S/ ${tax.toFixed(2)}`).newLine();
    } else {
      builder.text('*** Exonerado de IGV ***').newLine();
    }

    builder.bold(true)
      .doubleWidth(true)
      .text(`TOTAL: S/ ${total.toFixed(2)}`)
      .newLine()
      .doubleWidth(false)
      .bold(false);

    // Pie
    builder.alignCenter()
      .text(format.separator)
      .newLine()
      .bold(true)
      .text('*** PRECUENTA ***')
      .newLine()
      .bold(false)
      .text('No valido como comprobante')
      .newLine()
      .text('Solicite su factura o boleta')
      .newLine()
      .newLine()
      .text('Gracias por su preferencia')
      .newLine()
      .feed(2)
      .cut();

    const base64Data = builder.toBase64();
    const result = await TcpPrinter.print({ data: base64Data });

    if (result && result.success) {
      return { success: true };
    } else {
      return { success: false, error: 'Error al imprimir precuenta via WiFi' };
    }
  } catch (error) {
    console.error('Error printing WiFi pre-bill:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Exportar el builder para uso externo si se necesita
 */
export { EscPosBuilder };
