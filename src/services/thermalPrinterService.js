import { CapacitorThermalPrinter } from 'capacitor-thermal-printer';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { prepareLogoForPrinting } from './imageProcessingService';
import * as BLEPrinter from './blePrinterService';

/**
 * Servicio para manejar impresoras térmicas WiFi/Bluetooth
 * Soporta impresión de tickets, comandas de cocina y precuentas
 *
 * En iOS: Usa @capacitor-community/bluetooth-le como alternativa
 * En Android: Usa capacitor-thermal-printer
 */

// Plugin TCP para impresión WiFi/LAN
const TcpPrinter = registerPlugin('TcpPrinter');

// Plugin para impresora interna iMin
const IminPrinter = registerPlugin('IminPrinter');

// Estado de la impresora
let isPrinterConnected = false;
let connectedPrinterAddress = null;
let connectionType = 'bluetooth'; // 'bluetooth', 'wifi' o 'internal'
let useAlternativeBLE = false; // Usar servicio alternativo BLE en iOS

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
  const platform = Capacitor.getPlatform();

  if (!isNative) {
    console.warn('Thermal printer only available on native platforms');
    return { success: false, error: 'Not native platform', devices: [] };
  }

  try {
    // Solo en Android: solicitar permisos y verificar estado
    // iOS no tiene estos métodos, los permisos se solicitan automáticamente
    if (platform === 'android') {
      console.log('📱 Solicitando permisos de Bluetooth (Android)...');
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
        console.warn('No se pudieron solicitar permisos:', permError);
      }

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
      }
    } else {
      console.log('📱 iOS: Los permisos se solicitan automáticamente al escanear');
    }

    // Limpiar listeners anteriores
    await CapacitorThermalPrinter.removeAllListeners();

    // Array para almacenar dispositivos encontrados
    const devices = [];

    // Escuchar dispositivos descubiertos
    await CapacitorThermalPrinter.addListener('discoverDevices', (data) => {
      console.log('Printer discovered:', data);

      // iOS retorna { devices: [...] }, Android retorna dispositivo individual
      const deviceList = data.devices || [data];

      for (const device of deviceList) {
        // Normalizar la dirección (puede venir como address, macAddress, id, etc)
        const deviceAddress = device.address || device.macAddress || device.id || device.deviceAddress;
        const deviceName = device.name || device.deviceName || 'Impresora sin nombre';

        if (!deviceAddress) {
          console.warn('Device without address:', device);
          continue;
        }

        // Crear objeto normalizado
        const normalizedDevice = {
          address: deviceAddress,
          name: deviceName,
          ...device // Mantener propiedades originales
        };

        // Evitar duplicados
        if (!devices.find(d => d.address === deviceAddress)) {
          console.log('✅ Dispositivo agregado:', normalizedDevice.name, normalizedDevice.address);
          devices.push(normalizedDevice);
        }
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
 * Detectar si el dispositivo actual es un dispositivo iMin con impresora interna
 * @returns {Promise<boolean>}
 */
export const isIminDevice = async () => {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }
    const result = await IminPrinter.isIminDevice();
    return result && result.isImin === true;
  } catch (error) {
    console.warn('Error detecting iMin device:', error);
    return false;
  }
};

/**
 * Detectar si una dirección es IP, MAC o interna
 * @param {string} address - Dirección a verificar
 * @returns {'wifi' | 'bluetooth' | 'internal'} Tipo de conexión
 */
const detectConnectionType = (address) => {
  if (address === 'internal') {
    return 'internal';
  }
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
 * Enviar datos ESC/POS al plugin correspondiente (WiFi o interno)
 * @param {string} base64Data - Datos en base64
 * @returns {Promise<Object>}
 */
const sendEscPosData = async (base64Data) => {
  if (connectionType === 'internal') {
    return await IminPrinter.print({ data: base64Data });
  }
  return await TcpPrinter.print({ data: base64Data });
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
    if (connectionType === 'internal') {
      await IminPrinter.disconnect();
    } else if (connectionType === 'wifi') {
      await TcpPrinter.disconnect();
    } else if (useAlternativeBLE) {
      await BLEPrinter.disconnectBLEPrinter();
    } else {
      await CapacitorThermalPrinter.disconnect();
    }

    isPrinterConnected = false;
    useAlternativeBLE = false;
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

    if (detectedType === 'internal') {
      // Conexión a impresora interna iMin
      console.log('🖨️ Conectando a impresora interna iMin...');

      const result = await IminPrinter.connect();
      console.log('📋 Resultado de conexión interna:', result);

      if (result && result.success) {
        isPrinterConnected = true;
        connectedPrinterAddress = 'internal';
        connectionType = 'internal';
        console.log('✅ Impresora interna conectada');
        return { success: true, address: 'internal', type: 'internal' };
      } else {
        console.error('❌ Conexión interna falló');
        return { success: false, error: 'No se pudo conectar a la impresora interna' };
      }
    } else if (detectedType === 'wifi') {
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
      // Conexión Bluetooth
      const platform = Capacitor.getPlatform();

      // En iOS, usar el servicio alternativo BLE directamente (más confiable)
      if (platform === 'ios') {
        console.log('🔵 iOS: Conectando via BLE alternativo...');
        const bleResult = await BLEPrinter.connectBLEPrinter(address);
        console.log('📋 Resultado de conexión BLE alternativo:', bleResult);

        if (bleResult.success) {
          isPrinterConnected = true;
          connectedPrinterAddress = address;
          connectionType = 'bluetooth';
          useAlternativeBLE = true;
          console.log('✅ Impresora BLE conectada (alternativo):', address);
          return { success: true, address, type: 'bluetooth' };
        } else {
          console.error('❌ Conexión BLE alternativo falló:', bleResult.error);
          return { success: false, error: bleResult.error || 'No se pudo conectar a la impresora' };
        }
      }

      // En Android, usar el plugin original
      console.log('🔵 Android: Conectando via Bluetooth...');
      const result = await CapacitorThermalPrinter.connect({ address });
      console.log('📋 Resultado de connect():', result);

      // Solo marcar como conectado si el resultado no es null
      if (result !== null && result !== undefined) {
        isPrinterConnected = true;
        connectedPrinterAddress = address;
        connectionType = 'bluetooth';
        useAlternativeBLE = false;
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
    useAlternativeBLE = false;
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
 * Guardar configuración de impresora en localStorage (por dispositivo)
 * @param {string} userId - ID del usuario (usado como prefijo para evitar conflictos)
 * @param {Object} printerConfig - Configuración de la impresora
 */
export const savePrinterConfig = async (userId, printerConfig) => {
  try {
    const configData = {
      address: printerConfig.address,
      name: printerConfig.name,
      type: printerConfig.type || 'bluetooth', // bluetooth, wifi o internal
      paperWidth: printerConfig.paperWidth || 80, // Guardar ancho de papel (80mm por defecto)
      enabled: printerConfig.enabled !== false,
      webPrintLegible: printerConfig.webPrintLegible || false, // Modo legible para impresión web
      compactPrint: printerConfig.compactPrint || false, // Modo compacto para ahorro de papel
      updatedAt: new Date().toISOString()
    };

    // Guardar en localStorage (configuración local por dispositivo)
    localStorage.setItem('factuya_printerConfig', JSON.stringify(configData));
    console.log('✅ Configuración de impresora guardada localmente');

    return { success: true };
  } catch (error) {
    console.error('Error saving printer config:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Obtener configuración de impresora guardada desde localStorage (por dispositivo)
 * @param {string} userId - ID del usuario (no usado, mantenido por compatibilidad)
 */
export const getPrinterConfig = async (userId) => {
  try {
    // Leer de localStorage (configuración local por dispositivo)
    const savedConfig = localStorage.getItem('factuya_printerConfig');

    if (savedConfig) {
      const config = JSON.parse(savedConfig);
      console.log('📱 Configuración de impresora cargada desde dispositivo');
      return { success: true, config };
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

  // Si es conexión WiFi o interna, usar la función específica con ESC/POS builder
  if (connectionType === 'wifi' || connectionType === 'internal') {
    console.log(`📶 Usando impresión ${connectionType} para ticket...`);
    return await printWifiTicket(invoice, business, paperWidth);
  }

  // Si usa el servicio BLE alternativo (iOS), usar printBLEReceipt
  if (useAlternativeBLE) {
    console.log('🔵 iOS: Usando impresión BLE alternativa para ticket...');
    return await printBLETicket(invoice, business, paperWidth);
  }

  // Bluetooth Android - comportamiento original
  console.log('🔵 Android: Usando impresión Bluetooth para ticket...');

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
      // Usar 'name' como nombre principal, o 'description' si 'name' no existe (compatibilidad con datos antiguos)
      const itemName = convertSpanishText(item.name || item.description || '');
      // Observaciones adicionales (IMEI, placa, serie, etc.)
      const itemObservations = item.observations
        ? convertSpanishText(item.observations)
        : null;

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

      // Descuento por ítem
      const itemDiscount = item.itemDiscount || 0;
      const itemTotalWithDiscount = itemTotal - itemDiscount;

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

        // Línea de descuento por ítem si existe
        if (itemDiscount > 0) {
          const discountLabel = `Dsct.`;
          const discountStr = `-S/ ${itemDiscount.toFixed(2)}`;
          const discountSpace = lineWidth - discountLabel.length - discountStr.length;
          itemsText += `${discountLabel}${' '.repeat(Math.max(1, discountSpace))}${discountStr}\n`;
        }

        // Línea 3: Código si existe
        if (item.code) {
          itemsText += `Codigo: ${convertSpanishText(item.code)}\n`;
        }

        // Línea 4: Información del lote si existe (modo farmacia)
        if (item.batchNumber) {
          let batchLine = `Lote: ${item.batchNumber}`;
          if (item.batchExpiryDate) {
            const d = item.batchExpiryDate.toDate ? item.batchExpiryDate.toDate() : new Date(item.batchExpiryDate);
            const expiryStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            batchLine += ` Venc: ${expiryStr}`;
          }
          itemsText += `${batchLine}\n`;
        }

        // Línea 5: Observaciones adicionales si existen (IMEI, placa, serie, etc.)
        if (itemObservations) {
          itemsText += `  ${itemObservations}\n`;
        }
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

        // Línea de descuento por ítem si existe
        if (itemDiscount > 0) {
          const discountLabel = `Dsct.`;
          const discountStr = `-S/ ${itemDiscount.toFixed(2)}`;
          const discountSpace = lineWidth - discountLabel.length - discountStr.length;
          itemsText += `${discountLabel}${' '.repeat(Math.max(1, discountSpace))}${discountStr}\n`;
        }

        // Línea 3: Código si existe (alineado a la izquierda)
        if (item.code) {
          itemsText += `Codigo: ${convertSpanishText(item.code)}\n`;
        }

        // Línea 4: Información del lote si existe (modo farmacia)
        if (item.batchNumber) {
          let batchLine = `Lote: ${item.batchNumber}`;
          if (item.batchExpiryDate) {
            const d = item.batchExpiryDate.toDate ? item.batchExpiryDate.toDate() : new Date(item.batchExpiryDate);
            const expiryStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            batchLine += ` V:${expiryStr}`;
          }
          itemsText += `${batchLine}\n`;
        }

        // Línea 5: Observaciones adicionales si existen (IMEI, placa, serie, etc.)
        if (itemObservations) {
          itemsText += `  ${itemObservations}\n`;
        }
      }
    }

    // Eliminar el último salto de línea extra si existe
    if (itemsText.endsWith('\n\n')) {
      itemsText = itemsText.slice(0, -1);
    }

    // Construir comando en cadena
    let printer = CapacitorThermalPrinter.begin();

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
          console.log('✅ Logo listo (base64). Ancho:', logoWidthMm, 'mm');
          printer = printer
            .image(dataUrl);
        } else if (logoConfig.ready && logoConfig.url) {
          // Fallback: intentar con URL directa
          console.log('⚠️ Intentando imprimir logo desde URL...');
          printer = printer
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

    // Dirección (company-info) - CENTRADO - Priorizar: sucursal > almacén > empresa
    console.log('📍 Datos de dirección para ticket:', {
      branchAddress: invoice.branchAddress,
      branchPhone: invoice.branchPhone,
      warehouseAddress: invoice.warehouseAddress,
      warehousePhone: invoice.warehousePhone,
      businessAddress: business.address,
      businessPhone: business.phone
    });
    const displayAddress = invoice.branchAddress || invoice.warehouseAddress || business.address || 'Direccion no configurada';
    printer = printer.align('center').text(convertSpanishText(displayAddress + '\n'));

    // Teléfono (company-info) - CENTRADO - Priorizar: sucursal > almacén > empresa
    const displayPhone = invoice.branchPhone || invoice.warehousePhone || business.phone;
    if (displayPhone) {
      printer = printer.align('center').text(convertSpanishText(`Tel: ${displayPhone}\n`));
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
        // Para boletas y notas de venta - DNI, Nombre, Dirección y Teléfono (si existe)
        const customerAddress = invoice.customer?.address || invoice.customerAddress || '';
        const customerPhone = invoice.customer?.phone || invoice.customerPhone || '';

        printer = printer
          .text(convertSpanishText(`DNI: ${invoice.customer?.documentNumber || invoice.customerDocument || invoice.customerDni || '-'}\n`))
          .text(convertSpanishText(`Nombre: ${invoice.customer?.name || invoice.customerName || 'Cliente'}\n`));

        // Dirección (si existe)
        if (customerAddress) {
          printer = printer.text(convertSpanishText(`Direccion: ${customerAddress}\n`));
        }

        // Teléfono del cliente (si existe)
        if (customerPhone) {
          printer = printer.text(convertSpanishText(`Telefono: ${customerPhone}\n`));
        }
      }

      if (isInvoice) {
        // Para facturas - RUC, Razón Social, Nombre Comercial (opcional), Dirección y Teléfono (opcional)
        const customerName = invoice.customer?.name || invoice.customerName || '';
        const customerBusinessName = invoice.customer?.businessName || invoice.customerBusinessName || '-';
        const customerAddress = invoice.customer?.address || invoice.customerAddress || '';
        const customerPhone = invoice.customer?.phone || invoice.customerPhone || '';

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

        // Teléfono del cliente (si existe)
        if (customerPhone) {
          printer = printer.text(convertSpanishText(`Telefono: ${customerPhone}\n`));
        }
      }

      // Vendedor (si existe)
      if (invoice.sellerName) {
        printer = printer.text(convertSpanishText(`Vendedor: ${invoice.sellerName}\n`));
      }

      // Alumno y Horario (solo si está habilitado en configuración)
      if (business?.posCustomFields?.showStudentField) {
        if (invoice.customer?.studentName) {
          printer = printer.text(convertSpanishText(`Alumno: ${invoice.customer.studentName}\n`));
        }
        if (invoice.customer?.studentSchedule) {
          printer = printer.text(convertSpanishText(`Horario: ${invoice.customer.studentSchedule}\n`));
        }
      }

      // Placa de Vehículo (solo si está habilitado en configuración)
      if (business?.posCustomFields?.showVehiclePlateField && invoice.customer?.vehiclePlate) {
        printer = printer.text(convertSpanishText(`Placa: ${invoice.customer.vehiclePlate.toUpperCase()}\n`));
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

    // Mostrar subtotal e IGV solo si NO es nota de venta con ocultar IGV
    if (!(isNotaVenta && (business.hideRucIgvInNotaVenta || business.hideOnlyIgvInNotaVenta))) {
      const igvRateDisplay = business.emissionConfig?.taxConfig?.igvRate ?? business.taxConfig?.igvRate ?? 18
      printer = printer
        .text(`Subtotal: S/ ${(invoice.subtotal || 0).toFixed(2)}\n`)
        .text(`IGV (${igvRateDisplay}%): S/ ${(invoice.tax || invoice.igv || 0).toFixed(2)}\n`);
    }

    // Mostrar descuento si existe
    if (invoice.discount && invoice.discount > 0) {
      printer = printer.text(`Descuento: -S/ ${invoice.discount.toFixed(2)}\n`);
    }

    // Mostrar Recargo al Consumo si existe
    if (invoice.recargoConsumo && invoice.recargoConsumo > 0) {
      printer = printer.text(`Rec. Consumo (${invoice.recargoConsumoRate || 10}%): S/ ${invoice.recargoConsumo.toFixed(2)}\n`);
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
        const rawDate = invoice.issueDate?.toDate ? invoice.issueDate.toDate() : invoice.issueDate || invoice.createdAt?.toDate ? invoice.createdAt.toDate() : invoice.createdAt || new Date();
        const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
        fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

      const totalPaid = invoice.payments && invoice.payments.length > 0
        ? invoice.payments.reduce((sum, p) => sum + (p.amount || 0), 0)
        : 0;
      const isCreditSale = totalPaid === 0;

      if (isCreditSale && !invoice.paymentMethod) {
        // Venta al crédito (sin pagos)
        printer = printer
          .bold()
          .text(convertSpanishText('AL CREDITO\n'))
          .clearFormatting();
        printer = printer.text(convertSpanishText(`Saldo Pendiente: S/ ${(invoice.total || 0).toFixed(2)}\n`));
      } else if (invoice.payments && invoice.payments.length > 0) {
        invoice.payments.forEach(payment => {
          printer = printer.text(convertSpanishText(`${payment.method}: S/ ${payment.amount.toFixed(2)}\n`));
        });
        // Mostrar saldo pendiente si el pago es menor al total
        if (totalPaid < (invoice.total || 0)) {
          const saldoPendiente = (invoice.total || 0) - totalPaid;
          printer = printer
            .bold()
            .text(convertSpanishText(`Saldo Pendiente: S/ ${saldoPendiente.toFixed(2)}\n`))
            .clearFormatting();
        }
      } else if (invoice.paymentMethod) {
        printer = printer.text(convertSpanishText(`${invoice.paymentMethod}: S/ ${(invoice.total || 0).toFixed(2)}\n`));
      }
    }

    // ========== Estado de Pago para Notas de Venta (parcial/crédito) ==========
    console.log('🧾 [WiFi] Datos de pago parcial:', { paymentStatus: invoice.paymentStatus, amountPaid: invoice.amountPaid, balance: invoice.balance, paymentHistoryLength: invoice.paymentHistory?.length });
    if (invoice.paymentStatus === 'partial' || (invoice.paymentHistory && invoice.paymentHistory.length > 0)) {
      printer = addSeparator(printer, format.separator, paperWidth, 'left');

      const statusTitle = invoice.paymentStatus === 'partial' ? 'ESTADO DE PAGO' : 'DETALLE DE PAGOS';
      printer = printer
        .align('left')
        .bold()
        .text(convertSpanishText(`${statusTitle}\n`))
        .clearFormatting();

      if (invoice.paymentStatus === 'partial') {
        printer = printer.text(convertSpanishText(`Pagado: S/ ${(invoice.amountPaid || 0).toFixed(2)}\n`));
        printer = printer
          .bold()
          .text(convertSpanishText(`Saldo Pendiente: S/ ${(invoice.balance || 0).toFixed(2)}\n`))
          .clearFormatting();
      }

      if (invoice.paymentHistory && invoice.paymentHistory.length > 0) {
        printer = printer.text(convertSpanishText('Historial de pagos:\n'));
        for (const payment of invoice.paymentHistory) {
          const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
          const dateStr = paymentDate.toLocaleDateString('es-PE');
          const amountStr = (payment.amount || 0).toFixed(2);
          printer = printer.text(convertSpanishText(` ${dateStr} S/${amountStr} (${payment.method || 'Efectivo'})\n`));
        }
      }
    }

    // ========== Condiciones de Crédito para Facturas ==========
    if (invoice.documentType === 'factura' && invoice.paymentType === 'credito') {
      printer = addSeparator(printer, format.separator, paperWidth, 'left');

      printer = printer
        .align('left')
        .bold()
        .text('CONDICIONES DE CREDITO\n')
        .clearFormatting();

      printer = printer.text(convertSpanishText('Forma de Pago: CREDITO\n'));

      // Si hay fecha de vencimiento y no hay cuotas
      if (invoice.paymentDueDate && (!invoice.paymentInstallments || invoice.paymentInstallments.length === 0)) {
        const dueDate = new Date(invoice.paymentDueDate + 'T00:00:00');
        const dueDateStr = dueDate.toLocaleDateString('es-PE');
        printer = printer.text(convertSpanishText(`Fecha Vencimiento: ${dueDateStr}\n`));
      }

      // Si hay cuotas
      if (invoice.paymentInstallments && invoice.paymentInstallments.length > 0) {
        printer = printer
          .bold()
          .text('CUOTAS:\n')
          .clearFormatting();

        invoice.paymentInstallments.forEach((cuota, index) => {
          const cuotaNum = cuota.number || index + 1;
          const cuotaAmount = parseFloat(cuota.amount || 0).toFixed(2);
          const cuotaDueDate = cuota.dueDate
            ? new Date(cuota.dueDate + 'T00:00:00').toLocaleDateString('es-PE')
            : '-';
          printer = printer.text(convertSpanishText(`  Cuota ${cuotaNum}: S/ ${cuotaAmount} - Vence: ${cuotaDueDate}\n`));
        });
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

    // Observaciones generales (si existen)
    if (invoice.notes && invoice.notes.trim()) {
      printer = addSeparator(printer, format.separator, paperWidth, 'left');
      printer = printer
        .bold()
        .text('OBSERVACIONES:\n')
        .clearFormatting()
        .text(convertSpanishText(invoice.notes + '\n'));
      printer = addSeparator(printer, format.separator, paperWidth, 'left');
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

    // Finalizar y enviar - avanzar suficiente papel para que la cuchilla no corte el texto
    await printer
      .text('\n')
      .text('\n')
      .text('\n')
      .text('\n')
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
export const printKitchenOrder = async (order, table = null, paperWidth = 58, stationName = null) => {
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

  // Si es conexión WiFi o interna, usar función específica con ESC/POS builder
  if (connectionType === 'wifi' || connectionType === 'internal') {
    console.log(`📶 Usando impresión ${connectionType} para comanda...`);
    return await printWifiKitchenOrder(order, table, paperWidth, stationName);
  }

  // Si usa el servicio BLE alternativo (iOS), usar printBLEKitchenOrder
  if (useAlternativeBLE) {
    console.log('🔵 iOS: Usando impresión BLE alternativa para comanda...');
    return await BLEPrinter.printBLEKitchenOrder(order, table, paperWidth);
  }

  // Bluetooth Android - comportamiento original
  console.log('🔵 Android: Usando impresión Bluetooth para comanda...');

  try {
    const format = getFormat(paperWidth);

    // Construir items text
    let itemsText = '';
    for (const item of order.items || []) {
      itemsText += `${item.quantity}x ${convertSpanishText(item.name)}\n`;

      // Mostrar modificadores si existen
      if (item.modifiers && item.modifiers.length > 0) {
        for (const modifier of item.modifiers) {
          for (const option of modifier.options) {
            itemsText += `  > ${convertSpanishText(option.optionName)}`;
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
    }

    // Construir comando en cadena
    let printer = CapacitorThermalPrinter.begin()
      // Encabezado
      .align('center')
      .doubleHeight()
      .bold()
      .text('*** COMANDA ***\n')
      .clearFormatting();

    if (stationName) {
      printer = printer
        .align('center')
        .bold()
        .text(`* ${convertSpanishText(stationName.toUpperCase())} *\n`)
        .clearFormatting();
    }

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

    // Avanzar suficiente papel para que la cuchilla no corte el texto
    await printer
      .text('\n')
      .text('\n')
      .text('\n')
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
 * @param {Object} taxConfig - Configuración de impuestos
 * @param {number} paperWidth - Ancho de papel (58 o 80mm)
 * @param {Object} recargoConsumoConfig - Configuración de recargo al consumo
 */
export const printPreBill = async (order, table, business, taxConfig = { igvRate: 18, igvExempt: false }, paperWidth = 58, recargoConsumoConfig = { enabled: false, rate: 10 }) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative || !isPrinterConnected) {
    return { success: false, error: 'Printer not connected' };
  }

  // Si es conexión WiFi o interna, usar función específica con ESC/POS builder
  if (connectionType === 'wifi' || connectionType === 'internal') {
    console.log(`📶 Usando impresión ${connectionType} para precuenta...`);
    return await printWifiPreBill(order, table, business, taxConfig, paperWidth, recargoConsumoConfig);
  }

  // Si usa el servicio BLE alternativo (iOS), usar printBLEPreBill
  if (useAlternativeBLE) {
    console.log('🔵 iOS: Usando impresión BLE alternativa para precuenta...');
    return await BLEPrinter.printBLEPreBill(order, table, business, taxConfig, paperWidth, recargoConsumoConfig);
  }

  // Bluetooth Android - comportamiento original
  console.log('🔵 Android: Usando impresión Bluetooth para precuenta...');

  try {
    const format = getFormat(paperWidth);

    // Recalcular totales según taxConfig actual
    // Esto asegura que si la empresa cambió su estado de exoneración,
    // la precuenta muestre los valores correctos
    console.log('🔍 printPreBillThermal - taxConfig recibido:', taxConfig);
    console.log('🔍 printPreBillThermal - igvExempt:', taxConfig.igvExempt);
    console.log('🔍 printPreBillThermal - igvRate:', taxConfig.igvRate);

    let subtotal, tax, total, recargoConsumo = 0;
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

    // Calcular Recargo al Consumo si está habilitado
    if (recargoConsumoConfig.enabled && recargoConsumoConfig.rate > 0) {
      recargoConsumo = subtotal * (recargoConsumoConfig.rate / 100);
      total = total + recargoConsumo; // Total final incluye RC
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

    // Agregar Recargo al Consumo si aplica
    if (recargoConsumo > 0) {
      totalsText += `Rec. Consumo (${recargoConsumoConfig.rate}%): S/ ${recargoConsumo.toFixed(2)}\n`;
    }

    // Construir comando en cadena
    let printer = CapacitorThermalPrinter.begin()
      // Encabezado
      .align('center')
      .doubleHeight()
      .text((business.tradeName || 'RESTAURANTE') + '\n')
      .clearFormatting()
      .text((business.address || '') + '\n')
      .text((business.phone || '') + '\n')
      .bold()
      .doubleHeight()
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
      .doubleHeight()
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
      .text('\n')
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
 * Imprimir ticket usando el servicio BLE alternativo (iOS)
 * @param {Object} invoice - Datos de la factura/boleta
 * @param {Object} business - Datos del negocio
 * @param {number} paperWidth - Ancho de papel (58 o 80mm)
 */
const printBLETicket = async (invoice, business, paperWidth = 58) => {
  try {
    // Determinar tipo de documento
    const docType = invoice.documentType || invoice.type || 'boleta';
    const isInvoice = docType === 'factura' || docType === 'invoice';
    const isNotaVenta = docType === 'nota_venta';

    // Preparar datos completos del recibo para BLEPrinter (igual que Android)
    const receiptData = {
      // Datos del negocio
      businessName: business?.name || '',
      tradeName: business?.tradeName || business?.name || '',
      businessLegalName: business?.businessName || '',
      businessRuc: business?.ruc || '',
      ruc: business?.ruc || '',
      address: business?.address || '',
      phone: business?.phone || '',
      email: business?.email || '',
      socialMedia: business?.socialMedia || '',
      website: business?.website || '',
      logoUrl: business?.logoUrl || '',

      // Configuración
      hideRucIgvInNotaVenta: business?.hideRucIgvInNotaVenta || false,
      hideOnlyIgvInNotaVenta: business?.hideOnlyIgvInNotaVenta || false,

      // Documento
      documentType: docType,
      isNotaVenta: isNotaVenta,
      isInvoice: isInvoice,
      series: invoice.series || 'B001',
      correlativeNumber: invoice.correlativeNumber || invoice.number,
      number: invoice.number,

      // Fechas
      emissionDate: invoice.emissionDate,
      issueDate: invoice.issueDate,
      createdAt: invoice.createdAt,

      // Cliente
      customer: invoice.customer,
      customerName: invoice.customerName,
      customerDocument: invoice.customerDocument || invoice.customerDni || invoice.customerRuc,
      customerAddress: invoice.customerAddress,
      customerBusinessName: invoice.customerBusinessName,
      customerPhone: invoice.customer?.phone || invoice.customerPhone || '',

      // Items (con todos los campos necesarios)
      items: (invoice.items || []).map(item => ({
        name: item.name || '',
        description: item.description || '', // Descripción del producto (del catálogo)
        observations: item.observations || '', // Observaciones adicionales (IMEI, placa, serie, etc.)
        code: item.code || '',
        quantity: item.quantity || 1,
        unit: item.unit || '',
        allowDecimalQuantity: item.allowDecimalQuantity || false,
        price: item.price || 0,
        unitPrice: item.unitPrice || item.price || 0,
        total: item.total || item.subtotal || ((item.unitPrice || item.price || 0) * (item.quantity || 1)),
        subtotal: item.subtotal || item.total,
      })),

      // Totales
      subtotal: invoice.subtotal || 0,
      tax: invoice.tax || invoice.igv || 0,
      igv: invoice.igv || invoice.tax || 0,
      discount: invoice.discount || 0,
      total: invoice.total || 0,
      recargoConsumo: invoice.recargoConsumo || 0,
      recargoConsumoRate: invoice.recargoConsumoRate || 0,

      // Pago
      paymentMethod: invoice.paymentMethod || '',
      payments: invoice.payments || [],
      paymentStatus: invoice.paymentStatus || '',
      amountPaid: invoice.amountPaid || 0,
      balance: invoice.balance || 0,
      paymentHistory: invoice.paymentHistory || [],

      // Otros
      notes: invoice.notes || '',
      sunatHash: invoice.sunatHash || '',
      qrCode: invoice.qrCode || '',

      // Vendedor
      sellerName: invoice.sellerName || '',
    };

    console.log('🧾 [thermal->BLE] Datos de pago parcial del invoice:', {
      paymentStatus: invoice.paymentStatus,
      amountPaid: invoice.amountPaid,
      balance: invoice.balance,
      paymentHistoryLength: invoice.paymentHistory?.length
    });

    // Usar la función printBLEReceipt del servicio BLE
    const result = await BLEPrinter.printBLEReceipt(receiptData, paperWidth);

    if (result.success) {
      console.log('✅ Ticket impreso exitosamente via BLE');
    }

    return result;
  } catch (error) {
    console.error('❌ Error imprimiendo ticket via BLE:', error);
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

    // Si es impresora interna iMin
    if (connectionType === 'internal') {
      console.log('🖨️ Usando impresora interna iMin...');
      const result = await IminPrinter.printTest({ paperWidth });
      console.log('📋 Resultado de impresión interna:', result);

      if (result && result.success) {
        console.log('🎉 Impresión de prueba interna completada exitosamente');
        return { success: true };
      } else {
        return { success: false, error: 'Error al imprimir via impresora interna' };
      }
    }

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

    // Si usa el servicio BLE alternativo (iOS)
    if (useAlternativeBLE) {
      console.log('🔵 iOS: Usando impresión BLE alternativa...');
      const result = await BLEPrinter.printBLETest(paperWidth);
      console.log('📋 Resultado de impresión BLE alternativa:', result);

      if (result.success) {
        console.log('🎉 Impresión de prueba BLE completada exitosamente');
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Error al imprimir via BLE' };
      }
    }

    // Bluetooth Android - comportamiento original
    console.log('🔵 Android: Usando impresión Bluetooth...');
    console.log('🔄 Preparando comandos de impresión...');

    // Mostrar ancho configurado
    const widthText = paperWidth === 58 ? '58MM (ESTRECHO)' : '80MM (ANCHO)';
    const charsText = `${format.charsPerLine} caracteres por linea`;

    // Usar try-catch individual para manejar errores de impresión
    try {
      const printer = CapacitorThermalPrinter.begin()
        .align('center')
        .bold()
        .text('PRUEBA DE IMPRESORA\n')
        .bold(false)
        .text(format.separator + '\n')
        .text('\n')
        .bold()
        .text(`${widthText}\n`)
        .bold(false)
        .text(`${charsText}\n`)
        .text('\n')
        .text(format.separator + '\n')
        .text('\n')
        .align('left')
        .text(convertSpanishText('Texto en espanol: aeiou\n'))
        .text(convertSpanishText('Caracteres: nN\n'))
        .bold()
        .text('Texto en negrita\n')
        .bold(false)
        .text('\n')
        .align('center')
        .text(`Fecha: ${new Date().toLocaleDateString('es-PE')}\n`)
        .text('\n')
        .text(convertSpanishText('Impresora configurada\n'))
        .text('correctamente!\n')
        .text('\n')
        .text('\n')
        .text('\n');

      // Intentar cortar papel (puede fallar en algunas impresoras)
      try {
        await printer.cutPaper().write();
      } catch (cutError) {
        console.warn('⚠️ cutPaper no soportado, enviando sin corte');
        await printer.write();
      }
    } catch (printError) {
      console.error('❌ Error en comandos de impresión:', printError);
      throw printError;
    }

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
  if ((connectionType !== 'wifi' && connectionType !== 'internal') || !isPrinterConnected) {
    return { success: false, error: 'No hay conexión WiFi/interna activa' };
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

    // Dirección - Priorizar: sucursal > almacén > empresa
    const displayAddr = invoice.branchAddress || invoice.warehouseAddress || business.address || 'Direccion no configurada';
    builder.text(displayAddr).newLine();

    // Teléfono - Priorizar: sucursal > almacén > empresa
    const displayPh = invoice.branchPhone || invoice.warehousePhone || business.phone;
    if (displayPh) {
      builder.text(`Tel: ${displayPh}`).newLine();
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
      if (invoice.customer?.address) {
        builder.text(`Direccion: ${invoice.customer.address}`).newLine();
      }
      if (invoice.customer?.phone) {
        builder.text(`Telefono: ${invoice.customer.phone}`).newLine();
      }
    } else {
      builder.text(`DNI: ${invoice.customer?.documentNumber || '-'}`).newLine()
        .text(`Nombre: ${invoice.customer?.name || 'Cliente'}`).newLine();
      if (invoice.customer?.address || invoice.customerAddress) {
        builder.text(`Direccion: ${invoice.customer?.address || invoice.customerAddress}`).newLine();
      }
      if (invoice.customer?.phone || invoice.customerPhone) {
        builder.text(`Telefono: ${invoice.customer?.phone || invoice.customerPhone}`).newLine();
      }
    }

    // Vendedor (si existe)
    if (invoice.sellerName) {
      builder.text(`Vendedor: ${invoice.sellerName}`).newLine();
    }

    // Alumno y Horario (solo si está habilitado en configuración)
    if (business?.posCustomFields?.showStudentField) {
      if (invoice.customer?.studentName) {
        builder.text(`Alumno: ${invoice.customer.studentName}`).newLine();
      }
      if (invoice.customer?.studentSchedule) {
        builder.text(`Horario: ${invoice.customer.studentSchedule}`).newLine();
      }
    }

    // Placa de Vehículo (solo si está habilitado en configuración)
    if (business?.posCustomFields?.showVehiclePlateField && invoice.customer?.vehiclePlate) {
      builder.text(`Placa: ${invoice.customer.vehiclePlate.toUpperCase()}`).newLine();
    }

    builder.text(format.separator).newLine()
      .bold(true)
      .text('DETALLE')
      .newLine()
      .bold(false);

    // Items
    for (const item of invoice.items) {
      // Usar 'name' como nombre principal, o 'description' si 'name' no existe (compatibilidad con datos antiguos)
      const itemName = item.name || item.description || '';
      // Observaciones adicionales (IMEI, placa, serie, etc.)
      const itemObservations = item.observations || null;
      const unitPrice = item.unitPrice || item.price || 0;
      const itemTotal = item.total || item.subtotal || (unitPrice * item.quantity);
      // Descuento por ítem
      const itemDiscount = item.itemDiscount || 0;
      const itemTotalWithDiscount = itemTotal - itemDiscount;

      // Formatear cantidad: con decimales si tiene, sino entero
      const qtyFormatted = Number.isInteger(item.quantity)
        ? item.quantity.toString()
        : item.quantity.toFixed(3).replace(/\.?0+$/, '');
      const unitSuffix = item.unit && item.allowDecimalQuantity ? item.unit.toLowerCase() : '';

      builder.text(itemName).newLine()
        .text(`${qtyFormatted}${unitSuffix} x S/ ${unitPrice.toFixed(2)}`)
        .text(`  S/ ${itemTotal.toFixed(2)}`)
        .newLine();

      // Mostrar descuento por ítem si existe
      if (itemDiscount > 0) {
        builder.text(`Dsct.`)
          .text(`  -S/ ${itemDiscount.toFixed(2)}`)
          .newLine();
      }

      // Información del lote si existe (modo farmacia)
      if (item.batchNumber) {
        let batchLine = `Lote: ${item.batchNumber}`;
        if (item.batchExpiryDate) {
          const d = item.batchExpiryDate.toDate ? item.batchExpiryDate.toDate() : new Date(item.batchExpiryDate);
          const expiryStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
          batchLine += ` Venc: ${expiryStr}`;
        }
        builder.text(batchLine).newLine();
      }

      // Observaciones adicionales si existen (IMEI, placa, serie, etc.)
      if (itemObservations) {
        builder.text(`  ${itemObservations}`).newLine();
      }
    }

    builder.text(format.separator).newLine()
      .alignRight();

    // Totales
    if (!(isNotaVenta && (business.hideRucIgvInNotaVenta || business.hideOnlyIgvInNotaVenta))) {
      const igvRateDisplay = business.emissionConfig?.taxConfig?.igvRate ?? business.taxConfig?.igvRate ?? 18
      builder.text(`Subtotal: S/ ${(invoice.subtotal || 0).toFixed(2)}`).newLine()
        .text(`IGV (${igvRateDisplay}%): S/ ${(invoice.tax || invoice.igv || 0).toFixed(2)}`).newLine();
    }

    // Recargo al Consumo (si existe)
    if (invoice.recargoConsumo && invoice.recargoConsumo > 0) {
      builder.text(`Rec. Consumo (${invoice.recargoConsumoRate || 10}%): S/ ${invoice.recargoConsumo.toFixed(2)}`).newLine();
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
        const fecha = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${String(invoiceDate.getDate()).padStart(2, '0')}`;
        const docCliente = isInvoice ? '6' : '1';
        const numDocCliente = invoice.customer?.documentNumber || '';
        const qrData = `${business.ruc}|${tipoDoc}|${invoice.series}|${invoice.correlativeNumber || invoice.number}|${(invoice.tax || 0).toFixed(2)}|${(invoice.total || 0).toFixed(2)}|${fecha}|${docCliente}|${numDocCliente}`;

        builder.qr(qrData);
      }

      builder.text('Consulte su comprobante en:').newLine()
        .text('www.sunat.gob.pe').newLine();
    }

    // Observaciones generales (si existen)
    if (invoice.notes && invoice.notes.trim()) {
      builder.text('------------------------').newLine()
        .bold(true)
        .text('OBSERVACIONES:').newLine()
        .bold(false)
        .text(invoice.notes).newLine()
        .text('------------------------').newLine();
    }

    builder.bold(true)
      .text('!Gracias por su preferencia!')
      .newLine()
      .bold(false)
      .feed(3)
      .cut();

    // Enviar a impresora
    const base64Data = builder.toBase64();
    const result = await sendEscPosData(base64Data);

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
const printWifiKitchenOrder = async (order, table = null, paperWidth = 58, stationName = null) => {
  try {
    const format = getFormat(paperWidth);
    const builder = new EscPosBuilder();

    builder.init()
      .alignCenter()
      .doubleHeight(true)
      .bold(true)
      .text('*** COMANDA ***')
      .newLine()
      .doubleHeight(false);

    if (stationName) {
      builder.bold(true)
        .text(`* ${stationName.toUpperCase()} *`)
        .newLine();
    }

    builder.bold(false)
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
        for (const modifier of item.modifiers) {
          for (const option of modifier.options) {
            let optionText = `  > ${option.optionName}`;
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
    }

    builder.text(format.separator)
      .newLine()
      .feed(2)
      .cut();

    const base64Data = builder.toBase64();
    const result = await sendEscPosData(base64Data);

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
 * Imprimir comanda de estación a una impresora WiFi específica
 * @param {string} printerIp - Dirección IP de la impresora
 * @param {Object} order - Datos de la orden
 * @param {Object} station - Datos de la estación
 * @param {Array} items - Items filtrados para esta estación
 * @param {number} paperWidth - Ancho de papel (58 o 80mm)
 */
export const printStationTicket = async (printerIp, order, station, items, paperWidth = 58) => {
  if (!printerIp || items.length === 0) {
    return { success: false, error: 'IP de impresora no configurada o sin items' };
  }

  try {
    const format = getFormat(paperWidth);
    const builder = new EscPosBuilder();

    builder.init()
      .alignCenter()
      .doubleHeight(true)
      .bold(true)
      .text(`*** ${station.name?.toUpperCase() || 'ESTACION'} ***`)
      .newLine()
      .doubleHeight(false)
      .bold(false)
      .text(format.separator)
      .newLine()
      .alignLeft()
      .bold(true)
      .text(`Orden: #${order.orderNumber || order.id?.slice(-6) || 'N/A'}`)
      .newLine()
      .text(`Fecha: ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`)
      .newLine();

    // Info de mesa o tipo de orden
    if (order.tableNumber) {
      builder.text(`Mesa: ${order.tableNumber}`).newLine();
    } else {
      builder.text(order.orderType === 'delivery' ? 'DELIVERY' : 'PARA LLEVAR').newLine();
    }

    // Marca si existe
    if (order.brandName) {
      builder.text(`Marca: ${order.brandName}`).newLine();
    }

    // Prioridad si es urgente
    if (order.priority === 'urgent') {
      builder.doubleHeight(true)
        .text('!!! URGENTE !!!')
        .newLine()
        .doubleHeight(false);
    }

    builder.bold(false)
      .text(format.separator)
      .newLine();

    // Items para esta estación
    for (const item of items) {
      builder.bold(true)
        .text(`${item.quantity}x ${item.name}`)
        .newLine()
        .bold(false);

      // Modificadores
      if (item.modifiers && item.modifiers.length > 0) {
        for (const modifier of item.modifiers) {
          for (const option of modifier.options) {
            let optionText = `  > ${option.optionName}`;
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
    }

    builder.text(format.separator)
      .newLine()
      .feed(2)
      .cut();

    const base64Data = builder.toBase64();

    // Conectar temporalmente a la impresora de la estación
    const port = 9100;
    console.log(`📤 Imprimiendo a estación ${station.name} (${printerIp}:${port})...`);

    // Usar TcpPrinter para conectar e imprimir
    const connectResult = await TcpPrinter.connect({ ip: printerIp, port });
    if (!connectResult?.success) {
      return { success: false, error: `No se pudo conectar a ${printerIp}` };
    }

    const printResult = await TcpPrinter.print({ data: base64Data });

    // Desconectar después de imprimir
    try {
      await TcpPrinter.disconnect();
    } catch (e) {
      console.warn('Error al desconectar de impresora de estación:', e);
    }

    if (printResult?.success) {
      console.log(`✅ Ticket impreso en estación ${station.name}`);
      return { success: true };
    } else {
      return { success: false, error: 'Error al imprimir en la estación' };
    }
  } catch (error) {
    console.error(`Error imprimiendo en estación ${station.name}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir comanda a todas las estaciones configuradas
 * @param {Object} order - Datos de la orden
 * @param {Array} kitchenStations - Lista de estaciones de cocina con sus categorías e impresoras
 * @param {number} paperWidth - Ancho de papel
 */
export const printToAllStations = async (order, kitchenStations, paperWidth = 58) => {
  const results = [];

  for (const station of kitchenStations) {
    // Saltear estaciones sin impresora configurada
    if (!station.printerIp) {
      continue;
    }

    // Filtrar items que corresponden a esta estación según sus categorías
    let stationItems = [];

    if (station.isPase) {
      // Estación de pase ve todos los items
      stationItems = order.items || [];
    } else if (station.categories && station.categories.length > 0) {
      // Filtrar items por categoría
      stationItems = (order.items || []).filter(item => {
        const itemCategory = item.category || item.categoryId;
        return station.categories.some(cat => {
          const catId = typeof cat === 'string' ? cat : cat.id;
          return catId === itemCategory;
        });
      });
    }

    if (stationItems.length > 0) {
      const result = await printStationTicket(station.printerIp, order, station, stationItems, paperWidth);
      results.push({ station: station.name, ...result });
    }
  }

  return results;
};

/**
 * Imprimir precuenta vía WiFi
 */
const printWifiPreBill = async (order, table, business, taxConfig = { igvRate: 18, igvExempt: false }, paperWidth = 58, recargoConsumoConfig = { enabled: false, rate: 10 }) => {
  try {
    const format = getFormat(paperWidth);
    const builder = new EscPosBuilder();

    // Calcular totales
    let subtotal, tax, total, recargoConsumo = 0;
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

    // Calcular Recargo al Consumo si está habilitado
    if (recargoConsumoConfig.enabled && recargoConsumoConfig.rate > 0) {
      recargoConsumo = subtotal * (recargoConsumoConfig.rate / 100);
      total = total + recargoConsumo;
    }

    builder.init()
      .alignCenter()
      .doubleHeight(true)
      .text(business.tradeName || 'RESTAURANTE')
      .newLine()
      .doubleHeight(false)
      .text(business.address || '')
      .newLine()
      .text(business.phone || '')
      .newLine()
      .bold(true)
      .doubleHeight(true)
      .text('PRECUENTA')
      .newLine()
      .doubleHeight(false)
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
      const itemDiscount = item.itemDiscount || 0;
      const itemTotalWithDiscount = itemTotal - itemDiscount;
      builder.text(`${item.quantity}x ${item.name}`)
        .newLine()
        .text(`   S/ ${itemTotal.toFixed(2)}`)
        .newLine();

      // Mostrar descuento por ítem si existe
      if (itemDiscount > 0) {
        builder.text(`   Dsct.  -S/ ${itemDiscount.toFixed(2)}`)
          .newLine();
      }

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

    // Agregar Recargo al Consumo si aplica
    if (recargoConsumo > 0) {
      builder.text(`Rec. Consumo (${recargoConsumoConfig.rate}%): S/ ${recargoConsumo.toFixed(2)}`).newLine();
    }

    builder.bold(true)
      .doubleHeight(true)
      .text(`TOTAL: S/ ${total.toFixed(2)}`)
      .newLine()
      .doubleHeight(false)
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
    const result = await sendEscPosData(base64Data);

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
 * Imprimir ticket de cierre de caja
 * @param {Object} sessionData - Datos de la sesión de caja
 * @param {Array} movements - Movimientos de la sesión
 * @param {Object} business - Datos del negocio
 * @param {number} paperWidth - Ancho de papel (58 o 80mm)
 * @param {string} branchName - Nombre de la sucursal (opcional)
 */
export const printCashClosureTicket = async (sessionData, movements = [], business, paperWidth = 58, branchName = null) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative || !isPrinterConnected) {
    return { success: false, error: 'Impresora no conectada' };
  }

  // Si es conexión WiFi o interna, usar la función específica con ESC/POS builder
  if (connectionType === 'wifi' || connectionType === 'internal') {
    console.log(`📶 Usando impresión ${connectionType} para cierre de caja...`);
    return await printWifiCashClosure(sessionData, movements, business, paperWidth, branchName);
  }

  // Si usa el servicio BLE alternativo (iOS), usar printBLECashClosure
  if (useAlternativeBLE) {
    console.log('🔵 iOS: Usando impresión BLE alternativa para cierre de caja...');
    return await printBLECashClosure(sessionData, movements, business, paperWidth, branchName);
  }

  // Bluetooth Android - comportamiento original
  console.log('🔵 Android: Usando impresión Bluetooth para cierre de caja...');

  try {
    const format = getFormat(paperWidth);
    const lineWidth = format.charsPerLine;

    // Helper para convertir fechas
    const getDateFromTimestamp = (timestamp) => {
      if (!timestamp) return null;
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
      }
      if (timestamp instanceof Date) {
        return timestamp;
      }
      return new Date(timestamp);
    };

    // Formatear fecha y hora
    const formatDateTime = (dateValue) => {
      const date = getDateFromTimestamp(dateValue);
      if (!date) return '-';
      return date.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // Formatear moneda
    const formatCurrency = (value) => `S/ ${Number(value || 0).toFixed(2)}`;

    // Calcular totales de movimientos
    const totalIncome = movements
      .filter(m => m.type === 'income')
      .reduce((sum, m) => sum + (m.amount || 0), 0);

    const totalExpense = movements
      .filter(m => m.type === 'expense')
      .reduce((sum, m) => sum + (m.amount || 0), 0);

    // Datos de la sesión
    const openingAmount = sessionData?.openingAmount || 0;
    const totalSales = sessionData?.totalSales || 0;
    const salesCash = sessionData?.salesCash || 0;
    const salesCard = sessionData?.salesCard || 0;
    const salesTransfer = sessionData?.salesTransfer || 0;
    const salesYape = sessionData?.salesYape || 0;
    const salesPlin = sessionData?.salesPlin || 0;
    const expectedAmount = sessionData?.expectedAmount || 0;
    const closingCash = sessionData?.closingCash || 0;
    const closingCard = sessionData?.closingCard || 0;
    const closingTransfer = sessionData?.closingTransfer || 0;
    const closingAmount = sessionData?.closingAmount || 0;
    const difference = sessionData?.difference || (closingAmount - expectedAmount);

    // Helper para crear línea con valor alineado a la derecha
    const createLine = (label, value) => {
      const valueStr = value.toString();
      const spaces = lineWidth - label.length - valueStr.length;
      return `${label}${' '.repeat(Math.max(1, spaces))}${valueStr}`;
    };

    // Construir comando en cadena
    let printer = CapacitorThermalPrinter.begin();

    if (paperWidth === 80) {
      printer = printer.lineSpacing(2);
    }

    // ========== HEADER ==========
    printer = printer.align('center');

    // Logo (si existe)
    if (business?.logoUrl) {
      try {
        const logoConfig = await prepareLogoForPrinting(business.logoUrl, paperWidth);
        if (logoConfig) {
          printer = printer.bitmap(logoConfig.base64, logoConfig.width, logoConfig.height);
        }
      } catch (logoError) {
        console.warn('No se pudo cargar el logo:', logoError);
      }
    }

    // Nombre del negocio
    printer = printer
      .bold(true)
      .text(convertSpanishText(business?.tradeName || business?.name || 'MI EMPRESA') + '\n')
      .bold(false)
      .text(`RUC: ${business?.ruc || '00000000000'}\n`);

    if (business?.address) {
      printer = printer.text(convertSpanishText(business.address) + '\n');
    }

    if (branchName) {
      printer = printer.text(`Sucursal: ${convertSpanishText(branchName)}\n`);
    }

    // Título del documento
    printer = printer
      .text('\n')
      .bold(true)
      .doubleHeight(true)
      .text('CIERRE DE CAJA\n')
      .doubleHeight(false)
      .bold(false)
      .text(format.separator + '\n');

    // ========== INFORMACIÓN DE LA SESIÓN ==========
    printer = printer.align('left');
    printer = printer.text(`Apertura: ${formatDateTime(sessionData?.openedAt)}\n`);
    printer = printer.text(`Cierre:   ${formatDateTime(sessionData?.closedAt)}\n`);
    printer = printer.text(`Comprobantes: ${sessionData?.invoiceCount || 0}\n`);
    printer = printer.text(format.separator + '\n');

    // ========== APERTURA ==========
    printer = printer
      .bold(true)
      .text('APERTURA\n')
      .bold(false)
      .text(createLine('Monto Inicial:', formatCurrency(openingAmount)) + '\n')
      .text(format.separator + '\n');

    // ========== VENTAS DEL DÍA ==========
    printer = printer
      .bold(true)
      .text('VENTAS DEL DIA\n')
      .bold(false);

    if (salesCash > 0) printer = printer.text(createLine('Efectivo:', formatCurrency(salesCash)) + '\n');
    if (salesCard > 0) printer = printer.text(createLine('Tarjeta:', formatCurrency(salesCard)) + '\n');
    if (salesTransfer > 0) printer = printer.text(createLine('Transferencia:', formatCurrency(salesTransfer)) + '\n');
    if (salesYape > 0) printer = printer.text(createLine('Yape:', formatCurrency(salesYape)) + '\n');
    if (salesPlin > 0) printer = printer.text(createLine('Plin:', formatCurrency(salesPlin)) + '\n');

    printer = printer
      .text(format.halfSeparator + '\n')
      .bold(true)
      .text(createLine('Total Ventas:', formatCurrency(totalSales)) + '\n')
      .bold(false)
      .text(format.separator + '\n');

    // ========== OTROS MOVIMIENTOS ==========
    if (totalIncome > 0 || totalExpense > 0) {
      printer = printer
        .bold(true)
        .text('OTROS MOVIMIENTOS\n')
        .bold(false);

      if (totalIncome > 0) printer = printer.text(createLine('+ Ingresos:', formatCurrency(totalIncome)) + '\n');
      if (totalExpense > 0) printer = printer.text(createLine('- Egresos:', formatCurrency(totalExpense)) + '\n');

      printer = printer.text(format.separator + '\n');
    }

    // ========== CÁLCULO ==========
    printer = printer
      .bold(true)
      .text('CALCULO\n')
      .bold(false)
      .text(createLine('Apertura:', formatCurrency(openingAmount)) + '\n')
      .text(createLine('+ Ventas Efectivo:', formatCurrency(salesCash)) + '\n');

    if (totalIncome > 0) printer = printer.text(createLine('+ Ingresos:', formatCurrency(totalIncome)) + '\n');
    if (totalExpense > 0) printer = printer.text(createLine('- Egresos:', formatCurrency(totalExpense)) + '\n');

    printer = printer
      .text(format.halfSeparator + '\n')
      .bold(true)
      .text(createLine('Efectivo Esperado:', formatCurrency(expectedAmount)) + '\n')
      .bold(false)
      .text(format.separator + '\n');

    // ========== CONTEO DE CIERRE ==========
    printer = printer
      .bold(true)
      .text('CONTEO DE CIERRE\n')
      .bold(false)
      .text(createLine('Efectivo:', formatCurrency(closingCash)) + '\n')
      .text(createLine('Tarjeta:', formatCurrency(closingCard)) + '\n')
      .text(createLine('Transferencia:', formatCurrency(closingTransfer)) + '\n')
      .text(format.halfSeparator + '\n')
      .bold(true)
      .text(createLine('Total Contado:', formatCurrency(closingAmount)) + '\n')
      .bold(false)
      .text(format.separator + '\n');

    // ========== DIFERENCIA ==========
    const diffLabel = difference > 0 ? 'Diferencia (Sobrante):' : difference < 0 ? 'Diferencia (Faltante):' : 'Diferencia:';
    printer = printer
      .bold(true)
      .doubleHeight(true)
      .text(createLine(diffLabel, formatCurrency(difference)) + '\n')
      .doubleHeight(false)
      .bold(false)
      .text(format.separator + '\n');

    // ========== FOOTER ==========
    printer = printer
      .align('center')
      .text('Documento interno\n')
      .text('Sin valor tributario\n')
      .text('\n')
      .text(formatDateTime(new Date()) + '\n')
      .feed(3)
      .cut();

    // Enviar a la impresora
    await printer.write();

    console.log('✅ Ticket de cierre de caja impreso correctamente');
    return { success: true };

  } catch (error) {
    console.error('Error printing cash closure ticket:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir cierre de caja vía WiFi
 */
const printWifiCashClosure = async (sessionData, movements, business, paperWidth, branchName) => {
  try {
    const format = getFormat(paperWidth);
    const lineWidth = format.charsPerLine;
    const builder = new EscPosBuilder();

    // Helper para convertir fechas
    const getDateFromTimestamp = (timestamp) => {
      if (!timestamp) return null;
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
      }
      return timestamp instanceof Date ? timestamp : new Date(timestamp);
    };

    const formatDateTime = (dateValue) => {
      const date = getDateFromTimestamp(dateValue);
      if (!date) return '-';
      return date.toLocaleDateString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    };

    const formatCurrency = (value) => `S/ ${Number(value || 0).toFixed(2)}`;

    const totalIncome = movements.filter(m => m.type === 'income').reduce((sum, m) => sum + (m.amount || 0), 0);
    const totalExpense = movements.filter(m => m.type === 'expense').reduce((sum, m) => sum + (m.amount || 0), 0);

    const { openingAmount = 0, totalSales = 0, salesCash = 0, salesCard = 0, salesTransfer = 0,
      salesYape = 0, salesPlin = 0, expectedAmount = 0, closingCash = 0, closingCard = 0,
      closingTransfer = 0, closingAmount = 0 } = sessionData || {};
    const difference = sessionData?.difference || (closingAmount - expectedAmount);

    const createLine = (label, value) => {
      const valueStr = value.toString();
      const spaces = lineWidth - label.length - valueStr.length;
      return `${label}${' '.repeat(Math.max(1, spaces))}${valueStr}`;
    };

    // Header
    builder.alignCenter()
      .bold(true)
      .text(convertSpanishText(business?.tradeName || business?.name || 'MI EMPRESA'))
      .newLine()
      .bold(false)
      .text(`RUC: ${business?.ruc || '00000000000'}`)
      .newLine();

    if (business?.address) {
      builder.text(convertSpanishText(business.address)).newLine();
    }
    if (branchName) {
      builder.text(`Sucursal: ${convertSpanishText(branchName)}`).newLine();
    }

    builder.newLine()
      .bold(true)
      .doubleHeight(true)
      .text('CIERRE DE CAJA')
      .newLine()
      .doubleHeight(false)
      .bold(false)
      .text(format.separator)
      .newLine();

    // Info sesión
    builder.alignLeft()
      .text(`Apertura: ${formatDateTime(sessionData?.openedAt)}`)
      .newLine()
      .text(`Cierre:   ${formatDateTime(sessionData?.closedAt)}`)
      .newLine()
      .text(`Comprobantes: ${sessionData?.invoiceCount || 0}`)
      .newLine()
      .text(format.separator)
      .newLine();

    // Apertura
    builder.bold(true).text('APERTURA').newLine().bold(false)
      .text(createLine('Monto Inicial:', formatCurrency(openingAmount)))
      .newLine()
      .text(format.separator)
      .newLine();

    // Ventas
    builder.bold(true).text('VENTAS DEL DIA').newLine().bold(false);
    if (salesCash > 0) builder.text(createLine('Efectivo:', formatCurrency(salesCash))).newLine();
    if (salesCard > 0) builder.text(createLine('Tarjeta:', formatCurrency(salesCard))).newLine();
    if (salesTransfer > 0) builder.text(createLine('Transferencia:', formatCurrency(salesTransfer))).newLine();
    if (salesYape > 0) builder.text(createLine('Yape:', formatCurrency(salesYape))).newLine();
    if (salesPlin > 0) builder.text(createLine('Plin:', formatCurrency(salesPlin))).newLine();
    builder.text(format.halfSeparator).newLine()
      .bold(true).text(createLine('Total Ventas:', formatCurrency(totalSales))).newLine().bold(false)
      .text(format.separator).newLine();

    // Otros movimientos
    if (totalIncome > 0 || totalExpense > 0) {
      builder.bold(true).text('OTROS MOVIMIENTOS').newLine().bold(false);
      if (totalIncome > 0) builder.text(createLine('+ Ingresos:', formatCurrency(totalIncome))).newLine();
      if (totalExpense > 0) builder.text(createLine('- Egresos:', formatCurrency(totalExpense))).newLine();
      builder.text(format.separator).newLine();
    }

    // Cálculo
    builder.bold(true).text('CALCULO').newLine().bold(false)
      .text(createLine('Apertura:', formatCurrency(openingAmount))).newLine()
      .text(createLine('+ Ventas Efectivo:', formatCurrency(salesCash))).newLine();
    if (totalIncome > 0) builder.text(createLine('+ Ingresos:', formatCurrency(totalIncome))).newLine();
    if (totalExpense > 0) builder.text(createLine('- Egresos:', formatCurrency(totalExpense))).newLine();
    builder.text(format.halfSeparator).newLine()
      .bold(true).text(createLine('Efectivo Esperado:', formatCurrency(expectedAmount))).newLine().bold(false)
      .text(format.separator).newLine();

    // Conteo
    builder.bold(true).text('CONTEO DE CIERRE').newLine().bold(false)
      .text(createLine('Efectivo:', formatCurrency(closingCash))).newLine()
      .text(createLine('Tarjeta:', formatCurrency(closingCard))).newLine()
      .text(createLine('Transferencia:', formatCurrency(closingTransfer))).newLine()
      .text(format.halfSeparator).newLine()
      .bold(true).text(createLine('Total Contado:', formatCurrency(closingAmount))).newLine().bold(false)
      .text(format.separator).newLine();

    // Diferencia
    const diffLabel = difference > 0 ? 'Diferencia (Sobrante):' : difference < 0 ? 'Diferencia (Faltante):' : 'Diferencia:';
    builder.bold(true)
      .doubleHeight(true)
      .text(createLine(diffLabel, formatCurrency(difference)))
      .newLine()
      .doubleHeight(false)
      .bold(false)
      .text(format.separator)
      .newLine();

    // Footer
    builder.alignCenter()
      .text('Documento interno')
      .newLine()
      .text('Sin valor tributario')
      .newLine()
      .newLine()
      .text(formatDateTime(new Date()))
      .newLine()
      .feed(2)
      .cut();

    const base64Data = builder.toBase64();
    const result = await sendEscPosData(base64Data);

    if (result && result.success) {
      return { success: true };
    }
    return { success: false, error: 'Error al imprimir cierre de caja via WiFi' };
  } catch (error) {
    console.error('Error printing WiFi cash closure:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir cierre de caja vía BLE (iOS)
 */
const printBLECashClosure = async (sessionData, movements, business, paperWidth, branchName) => {
  try {
    const format = getFormat(paperWidth);
    const lineWidth = format.charsPerLine;

    const getDateFromTimestamp = (timestamp) => {
      if (!timestamp) return null;
      if (timestamp.toDate && typeof timestamp.toDate === 'function') return timestamp.toDate();
      return timestamp instanceof Date ? timestamp : new Date(timestamp);
    };

    const formatDateTime = (dateValue) => {
      const date = getDateFromTimestamp(dateValue);
      if (!date) return '-';
      return date.toLocaleDateString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    };

    const formatCurrency = (value) => `S/ ${Number(value || 0).toFixed(2)}`;

    const totalIncome = movements.filter(m => m.type === 'income').reduce((sum, m) => sum + (m.amount || 0), 0);
    const totalExpense = movements.filter(m => m.type === 'expense').reduce((sum, m) => sum + (m.amount || 0), 0);

    const { openingAmount = 0, totalSales = 0, salesCash = 0, salesCard = 0, salesTransfer = 0,
      salesYape = 0, salesPlin = 0, expectedAmount = 0, closingCash = 0, closingCard = 0,
      closingTransfer = 0, closingAmount = 0 } = sessionData || {};
    const difference = sessionData?.difference || (closingAmount - expectedAmount);

    const createLine = (label, value) => {
      const valueStr = value.toString();
      const spaces = lineWidth - label.length - valueStr.length;
      return `${label}${' '.repeat(Math.max(1, spaces))}${valueStr}`;
    };

    // Construir texto para BLE
    let ticketText = '';

    // Header
    ticketText += `${convertSpanishText(business?.tradeName || business?.name || 'MI EMPRESA')}\n`;
    ticketText += `RUC: ${business?.ruc || '00000000000'}\n`;
    if (business?.address) ticketText += `${convertSpanishText(business.address)}\n`;
    if (branchName) ticketText += `Sucursal: ${convertSpanishText(branchName)}\n`;
    ticketText += '\n';
    ticketText += '*** CIERRE DE CAJA ***\n';
    ticketText += format.separator + '\n';

    // Info
    ticketText += `Apertura: ${formatDateTime(sessionData?.openedAt)}\n`;
    ticketText += `Cierre:   ${formatDateTime(sessionData?.closedAt)}\n`;
    ticketText += `Comprobantes: ${sessionData?.invoiceCount || 0}\n`;
    ticketText += format.separator + '\n';

    // Apertura
    ticketText += 'APERTURA\n';
    ticketText += createLine('Monto Inicial:', formatCurrency(openingAmount)) + '\n';
    ticketText += format.separator + '\n';

    // Ventas
    ticketText += 'VENTAS DEL DIA\n';
    if (salesCash > 0) ticketText += createLine('Efectivo:', formatCurrency(salesCash)) + '\n';
    if (salesCard > 0) ticketText += createLine('Tarjeta:', formatCurrency(salesCard)) + '\n';
    if (salesTransfer > 0) ticketText += createLine('Transferencia:', formatCurrency(salesTransfer)) + '\n';
    if (salesYape > 0) ticketText += createLine('Yape:', formatCurrency(salesYape)) + '\n';
    if (salesPlin > 0) ticketText += createLine('Plin:', formatCurrency(salesPlin)) + '\n';
    ticketText += format.halfSeparator + '\n';
    ticketText += createLine('Total Ventas:', formatCurrency(totalSales)) + '\n';
    ticketText += format.separator + '\n';

    // Otros movimientos
    if (totalIncome > 0 || totalExpense > 0) {
      ticketText += 'OTROS MOVIMIENTOS\n';
      if (totalIncome > 0) ticketText += createLine('+ Ingresos:', formatCurrency(totalIncome)) + '\n';
      if (totalExpense > 0) ticketText += createLine('- Egresos:', formatCurrency(totalExpense)) + '\n';
      ticketText += format.separator + '\n';
    }

    // Cálculo
    ticketText += 'CALCULO\n';
    ticketText += createLine('Apertura:', formatCurrency(openingAmount)) + '\n';
    ticketText += createLine('+ Ventas Efectivo:', formatCurrency(salesCash)) + '\n';
    if (totalIncome > 0) ticketText += createLine('+ Ingresos:', formatCurrency(totalIncome)) + '\n';
    if (totalExpense > 0) ticketText += createLine('- Egresos:', formatCurrency(totalExpense)) + '\n';
    ticketText += format.halfSeparator + '\n';
    ticketText += createLine('Efectivo Esperado:', formatCurrency(expectedAmount)) + '\n';
    ticketText += format.separator + '\n';

    // Conteo
    ticketText += 'CONTEO DE CIERRE\n';
    ticketText += createLine('Efectivo:', formatCurrency(closingCash)) + '\n';
    ticketText += createLine('Tarjeta:', formatCurrency(closingCard)) + '\n';
    ticketText += createLine('Transferencia:', formatCurrency(closingTransfer)) + '\n';
    ticketText += format.halfSeparator + '\n';
    ticketText += createLine('Total Contado:', formatCurrency(closingAmount)) + '\n';
    ticketText += format.separator + '\n';

    // Diferencia
    const diffLabel = difference > 0 ? 'Diferencia (Sobrante):' : difference < 0 ? 'Diferencia (Faltante):' : 'Diferencia:';
    ticketText += createLine(diffLabel, formatCurrency(difference)) + '\n';
    ticketText += format.separator + '\n';

    // Footer
    ticketText += 'Documento interno\n';
    ticketText += 'Sin valor tributario\n';
    ticketText += '\n';
    ticketText += formatDateTime(new Date()) + '\n';
    ticketText += '\n\n\n';

    // Enviar via BLE
    const result = await BLEPrinter.printBLEText(ticketText);
    return result;

  } catch (error) {
    console.error('Error printing BLE cash closure:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Exportar el builder para uso externo si se necesita
 */
export { EscPosBuilder };
