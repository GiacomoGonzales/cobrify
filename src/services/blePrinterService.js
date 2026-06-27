/**
 * Servicio alternativo de impresión Bluetooth usando @capacitor-community/bluetooth-le
 * Este servicio se usa como fallback en iOS cuando el plugin capacitor-thermal-printer falla
 */

import { Capacitor } from '@capacitor/core';
import { BleClient, numbersToDataView, numberToUUID } from '@capacitor-community/bluetooth-le';
import { prepareLogoForPrinting } from './imageProcessingService';
import { buildKitchenLines } from '@/utils/kitchenComandaFormat';

// Estado de conexión
let connectedDeviceId = null;
let printerServiceUUID = null;
let printerCharacteristicUUID = null;

// UUIDs comunes para impresoras térmicas BLE
const COMMON_PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Común en muchas impresoras
  '0000ff00-0000-1000-8000-00805f9b34fb', // Alternativo
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Nordic UART Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10/HM-19
];

const COMMON_PRINTER_CHARACTERISTIC_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb', // Común
  '0000ff02-0000-1000-8000-00805f9b34fb', // Alternativo
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // Nordic UART TX
  '0000ffe1-0000-1000-8000-00805f9b34fb', // HM-10/HM-19
];

/**
 * Inicializar el cliente BLE
 */
export const initializeBLE = async () => {
  try {
    await BleClient.initialize({ androidNeverForLocation: true });
    console.log('✅ BLE Client inicializado');
    return { success: true };
  } catch (error) {
    console.error('❌ Error inicializando BLE:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Escanear dispositivos BLE
 */
export const scanBLEDevices = async (timeout = 15000) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative) {
    return { success: false, error: 'Solo disponible en plataforma nativa', devices: [] };
  }

  try {
    await initializeBLE();

    const devices = [];

    console.log('🔍 Iniciando escaneo BLE...');

    await BleClient.requestLEScan(
      { allowDuplicates: false },
      (result) => {
        console.log('📱 Dispositivo encontrado:', result.device.name, result.device.deviceId);

        // Evitar duplicados
        if (!devices.find(d => d.deviceId === result.device.deviceId)) {
          devices.push({
            deviceId: result.device.deviceId,
            name: result.device.name || 'Dispositivo sin nombre',
            address: result.device.deviceId, // En iOS el deviceId es el identificador único
          });
        }
      }
    );

    // Esperar el tiempo de escaneo
    await new Promise(resolve => setTimeout(resolve, timeout));

    // Detener escaneo
    await BleClient.stopLEScan();
    console.log('⏹️ Escaneo BLE detenido');
    console.log(`📊 Total dispositivos encontrados: ${devices.length}`);

    return { success: true, devices };
  } catch (error) {
    console.error('❌ Error en escaneo BLE:', error);
    try {
      await BleClient.stopLEScan();
    } catch (e) {
      // Ignorar
    }
    return { success: false, error: error.message, devices: [] };
  }
};

/**
 * Lista los dispositivos Bluetooth YA EMPAREJADOS del sistema (solo Android), incluidas
 * las impresoras emparejadas por otra app (ej. RawBT) que el escaneo por DESCUBRIMIENTO
 * NO detecta (quedan "bonded", no salen en discovery → por eso había que copiar la MAC
 * a mano). Usa BleClient.getBondedDevices() (disponible solo en Android).
 */
export const getBondedDevices = async () => {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return { success: true, devices: [] };
    }
    await initializeBLE();
    const bonded = await BleClient.getBondedDevices();
    const devices = (bonded || []).map(d => ({
      deviceId: d.deviceId,
      address: d.deviceId,
      name: d.name || 'Impresora emparejada',
      bonded: true,
    }));
    console.log(`📋 Dispositivos emparejados (bonded): ${devices.length}`);
    return { success: true, devices };
  } catch (error) {
    console.warn('No se pudieron obtener dispositivos emparejados:', error);
    return { success: false, devices: [] };
  }
};

// Cache de dispositivos escaneados
let scannedDevices = new Map();

/**
 * Conectar a una impresora BLE
 */
export const connectBLEPrinter = async (deviceId) => {
  try {
    await initializeBLE();

    console.log('🔗 Conectando a dispositivo BLE:', deviceId);

    // Primero, necesitamos escanear para que el plugin reconozca el dispositivo
    console.log('🔍 Escaneando para encontrar el dispositivo...');

    let deviceFound = false;

    // Escanear brevemente para encontrar el dispositivo
    await BleClient.requestLEScan(
      { allowDuplicates: false },
      (result) => {
        if (result.device.deviceId === deviceId) {
          console.log('✅ Dispositivo encontrado durante escaneo:', result.device.name);
          deviceFound = true;
          scannedDevices.set(result.device.deviceId, result.device);
        }
      }
    );

    // Esperar hasta encontrar el dispositivo o timeout
    const maxWait = 10000; // 10 segundos máximo
    const startTime = Date.now();

    while (!deviceFound && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Detener escaneo
    await BleClient.stopLEScan();

    if (!deviceFound) {
      console.error('❌ Dispositivo no encontrado durante el escaneo');
      return { success: false, error: 'Dispositivo no encontrado. Asegúrate de que la impresora esté encendida y cerca.' };
    }

    console.log('🔗 Intentando conectar...');

    // Conectar al dispositivo
    await BleClient.connect(deviceId, (disconnectedDeviceId) => {
      console.log('📴 Dispositivo desconectado:', disconnectedDeviceId);
      if (disconnectedDeviceId === connectedDeviceId) {
        connectedDeviceId = null;
        printerServiceUUID = null;
        printerCharacteristicUUID = null;
      }
    });

    console.log('✅ Conectado, descubriendo servicios...');

    // Obtener servicios disponibles
    const services = await BleClient.getServices(deviceId);
    console.log('📋 Servicios encontrados:', services.length);

    // Buscar el servicio y característica de la impresora
    let foundService = null;
    let foundCharacteristic = null;

    for (const service of services) {
      console.log('  📌 Servicio:', service.uuid);

      for (const characteristic of service.characteristics) {
        console.log('    📝 Característica:', characteristic.uuid, 'Props:', characteristic.properties);

        // Buscar una característica que permita escritura
        if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
          // Preferir UUIDs conocidos de impresoras
          const serviceUuidLower = service.uuid.toLowerCase();
          const charUuidLower = characteristic.uuid.toLowerCase();

          const isKnownService = COMMON_PRINTER_SERVICE_UUIDS.some(u => serviceUuidLower.includes(u.substring(4, 8)));
          const isKnownChar = COMMON_PRINTER_CHARACTERISTIC_UUIDS.some(u => charUuidLower.includes(u.substring(4, 8)));

          if (isKnownService || isKnownChar || !foundCharacteristic) {
            foundService = service.uuid;
            foundCharacteristic = characteristic.uuid;
            console.log('    ✅ Seleccionada para impresión');

            if (isKnownService && isKnownChar) {
              break; // Encontramos la mejor opción
            }
          }
        }
      }

      if (foundService && foundCharacteristic) {
        break;
      }
    }

    if (!foundService || !foundCharacteristic) {
      await BleClient.disconnect(deviceId);
      return {
        success: false,
        error: 'No se encontró una característica de escritura compatible. Esta impresora puede no ser compatible.'
      };
    }

    connectedDeviceId = deviceId;
    printerServiceUUID = foundService;
    printerCharacteristicUUID = foundCharacteristic;

    console.log('✅ Impresora BLE conectada');
    console.log('  Service UUID:', printerServiceUUID);
    console.log('  Characteristic UUID:', printerCharacteristicUUID);

    return {
      success: true,
      deviceId,
      serviceUUID: printerServiceUUID,
      characteristicUUID: printerCharacteristicUUID
    };
  } catch (error) {
    console.error('❌ Error conectando impresora BLE:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Desconectar impresora BLE
 */
export const disconnectBLEPrinter = async () => {
  if (connectedDeviceId) {
    try {
      await BleClient.disconnect(connectedDeviceId);
      console.log('✅ Impresora BLE desconectada');
    } catch (error) {
      console.warn('⚠️ Error desconectando:', error);
    }
    connectedDeviceId = null;
    printerServiceUUID = null;
    printerCharacteristicUUID = null;
  }
  return { success: true };
};

/**
 * Verificar si está conectado
 */
export const isBLEPrinterConnected = () => {
  return connectedDeviceId !== null;
};

/**
 * Enviar datos crudos a la impresora
 */
export const writeBLEData = async (data) => {
  if (!connectedDeviceId || !printerServiceUUID || !printerCharacteristicUUID) {
    return { success: false, error: 'Impresora no conectada' };
  }

  try {
    // Convertir a DataView si es necesario
    let dataView;
    if (data instanceof Uint8Array) {
      dataView = numbersToDataView(Array.from(data));
    } else if (Array.isArray(data)) {
      dataView = numbersToDataView(data);
    } else if (data instanceof DataView) {
      dataView = data;
    } else {
      return { success: false, error: 'Formato de datos no válido' };
    }

    // Enviar en chunks si es necesario (MTU típico es 20-512 bytes)
    const MTU = 100; // Usar un valor conservador
    const totalBytes = dataView.byteLength;

    for (let offset = 0; offset < totalBytes; offset += MTU) {
      const end = Math.min(offset + MTU, totalBytes);
      const chunk = new DataView(dataView.buffer, dataView.byteOffset + offset, end - offset);

      try {
        await BleClient.write(connectedDeviceId, printerServiceUUID, printerCharacteristicUUID, chunk);
      } catch (writeError) {
        // Intentar sin respuesta si falla
        await BleClient.writeWithoutResponse(connectedDeviceId, printerServiceUUID, printerCharacteristicUUID, chunk);
      }

      // Pequeña pausa entre chunks
      if (offset + MTU < totalBytes) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Error enviando datos BLE:', error);
    return { success: false, error: error.message };
  }
};

// Comandos ESC/POS básicos
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

/**
 * Obtener la cantidad de líneas de avance antes del corte desde localStorage
 */
const getCutFeedLines = () => {
  try {
    const saved = localStorage.getItem('factuya_printerConfig');
    if (saved) {
      const config = JSON.parse(saved);
      return config.cutFeedLines ?? 5;
    }
  } catch { /* ignore */ }
  return 5;
};

/**
 * Crear comandos ESC/POS
 */
export const ESCPOSCommands = {
  // Inicializar impresora
  init: () => new Uint8Array([ESC, 0x40]),

  // Salto de línea
  lineFeed: () => new Uint8Array([LF]),

  // Alineación: 0=izq, 1=centro, 2=der
  align: (n) => new Uint8Array([ESC, 0x61, n]),

  // Negrita: true/false
  bold: (on) => new Uint8Array([ESC, 0x45, on ? 1 : 0]),

  // Doble ancho
  doubleWidth: (on) => new Uint8Array([GS, 0x21, on ? 0x10 : 0x00]),

  // Doble alto
  doubleHeight: (on) => new Uint8Array([GS, 0x21, on ? 0x01 : 0x00]),

  // Cortar papel (con avance automático para evitar contenido cortado)
  // GS V 66 n = corte parcial con avance de n líneas antes de cortar
  // Esto asegura que el contenido pase la cuchilla antes del corte
  cut: () => new Uint8Array([GS, 0x56, 0x42, 0x00]),

  // Cortar papel parcial (con avance)
  cutPartial: () => new Uint8Array([GS, 0x56, 0x42, 0x00]),

  // Texto a bytes
  text: (str) => {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  },

  // Avanzar n líneas
  feed: (n) => {
    const feeds = [];
    for (let i = 0; i < n; i++) {
      feeds.push(LF);
    }
    return new Uint8Array(feeds);
  },
};

/**
 * Concatenar múltiples Uint8Array
 */
const concatUint8Arrays = (...arrays) => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
};

/**
 * Imprimir texto simple
 */
export const printBLEText = async (text, options = {}) => {
  const { bold = false, center = false, doubleSize = false } = options;

  const commands = [
    ESCPOSCommands.init(),
  ];

  if (center) {
    commands.push(ESCPOSCommands.align(1));
  }

  if (bold) {
    commands.push(ESCPOSCommands.bold(true));
  }

  if (doubleSize) {
    commands.push(ESCPOSCommands.doubleWidth(true));
    commands.push(ESCPOSCommands.doubleHeight(true));
  }

  commands.push(ESCPOSCommands.text(text));
  commands.push(ESCPOSCommands.lineFeed());

  // Resetear formato
  if (bold) commands.push(ESCPOSCommands.bold(false));
  if (doubleSize) {
    commands.push(ESCPOSCommands.doubleWidth(false));
    commands.push(ESCPOSCommands.doubleHeight(false));
  }
  if (center) commands.push(ESCPOSCommands.align(0));

  const data = concatUint8Arrays(...commands);
  return await writeBLEData(data);
};

/**
 * Imprimir prueba
 */
export const printBLETest = async (paperWidth = 58) => {
  if (!isBLEPrinterConnected()) {
    return { success: false, error: 'Impresora no conectada' };
  }

  try {
    const separator = paperWidth === 58 ? '--------------------------------' : '------------------------------------------------';
    const widthText = paperWidth === 58 ? '58MM (ESTRECHO)' : '80MM (ANCHO)';
    const fecha = new Date().toLocaleDateString('es-PE');

    const commands = [
      ESCPOSCommands.init(),
      ESCPOSCommands.align(1), // Centro
      ESCPOSCommands.bold(true),
      ESCPOSCommands.text('PRUEBA DE IMPRESORA\n'),
      ESCPOSCommands.bold(false),
      ESCPOSCommands.text(separator + '\n'),
      ESCPOSCommands.lineFeed(),
      ESCPOSCommands.bold(true),
      ESCPOSCommands.text(widthText + '\n'),
      ESCPOSCommands.bold(false),
      ESCPOSCommands.lineFeed(),
      ESCPOSCommands.text(separator + '\n'),
      ESCPOSCommands.lineFeed(),
      ESCPOSCommands.align(0), // Izquierda
      ESCPOSCommands.text('Texto normal\n'),
      ESCPOSCommands.bold(true),
      ESCPOSCommands.text('Texto en negrita\n'),
      ESCPOSCommands.bold(false),
      ESCPOSCommands.lineFeed(),
      ESCPOSCommands.align(1), // Centro
      ESCPOSCommands.text('Fecha: ' + fecha + '\n'),
      ESCPOSCommands.lineFeed(),
      ESCPOSCommands.text('Impresora configurada\n'),
      ESCPOSCommands.text('correctamente!\n'),
      ESCPOSCommands.feed(4),
    ];

    // Intentar cortar papel (puede no estar soportado)
    try {
      commands.push(ESCPOSCommands.cutPartial());
    } catch (e) {
      console.warn('⚠️ Corte de papel no soportado');
    }

    const data = concatUint8Arrays(...commands);
    const result = await writeBLEData(data);

    if (result.success) {
      console.log('✅ Prueba de impresión BLE completada');
    }

    return result;
  } catch (error) {
    console.error('❌ Error en prueba de impresión BLE:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Convertir texto con tildes a formato ASCII simple (sin acentos)
 * @param {string} text - Texto a convertir
 */
const convertSpanishText = (text) => {
  if (!text) return '';
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
 * Convertir imagen base64 a comandos ESC/POS de bitmap para impresora térmica
 * @param {string} base64 - Imagen en base64 (sin prefijo data:image)
 * @param {number} maxWidth - Ancho máximo en píxeles (debe ser múltiplo de 8)
 * @returns {Promise<Uint8Array>} Comandos ESC/POS para imprimir la imagen
 */
const imageToEscPosCommands = async (base64, maxWidth = 384) => {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();

      img.onload = () => {
        try {
          // Crear canvas para procesar la imagen
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // Calcular dimensiones manteniendo aspect ratio
          // El ancho debe ser múltiplo de 8 para ESC/POS
          let width = Math.min(img.width, maxWidth);
          width = Math.floor(width / 8) * 8; // Redondear a múltiplo de 8
          const scale = width / img.width;
          const height = Math.floor(img.height * scale);

          canvas.width = width;
          canvas.height = height;

          // Fondo blanco
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          // Dibujar imagen
          ctx.drawImage(img, 0, 0, width, height);

          // Obtener datos de píxeles
          const imageData = ctx.getImageData(0, 0, width, height);
          const pixels = imageData.data;

          // Convertir a bitmap monocromático (1 bit por píxel)
          const bytesPerLine = width / 8;
          const bitmapData = [];

          for (let y = 0; y < height; y++) {
            for (let byteIndex = 0; byteIndex < bytesPerLine; byteIndex++) {
              let byte = 0;
              for (let bit = 0; bit < 8; bit++) {
                const x = byteIndex * 8 + bit;
                const pixelIndex = (y * width + x) * 4;

                // Convertir a escala de grises y aplicar umbral
                const r = pixels[pixelIndex];
                const g = pixels[pixelIndex + 1];
                const b = pixels[pixelIndex + 2];
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;

                // Si es oscuro (< 128), establecer bit (punto negro)
                if (gray < 128) {
                  byte |= (0x80 >> bit);
                }
              }
              bitmapData.push(byte);
            }
          }

          // Construir comandos ESC/POS para imagen raster
          // Comando GS v 0 (imprimir imagen raster)
          const commands = [];

          // GS v 0 m xL xH yL yH d1...dk
          // m = 0 (modo normal)
          // xL xH = bytes por línea (low, high)
          // yL yH = número de líneas (low, high)
          const xL = bytesPerLine % 256;
          const xH = Math.floor(bytesPerLine / 256);
          const yL = height % 256;
          const yH = Math.floor(height / 256);

          commands.push(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH);
          commands.push(...bitmapData);

          console.log(`✅ Imagen convertida: ${width}x${height} px, ${bitmapData.length} bytes`);

          resolve(new Uint8Array(commands));
        } catch (error) {
          console.error('❌ Error procesando imagen:', error);
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Error al cargar imagen'));
      };

      // Cargar imagen desde base64
      img.src = `data:image/png;base64,${base64}`;
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generar código QR usando comandos ESC/POS
 * @param {string} data - Datos del QR
 * @param {number} size - Tamaño del módulo (1-8)
 */
const generateQRCommands = (data, size = 4) => {
  const commands = [];

  // Modelo QR: 1=Model 1, 2=Model 2
  commands.push(new Uint8Array([GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));

  // Tamaño del módulo (1-8)
  commands.push(new Uint8Array([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size]));

  // Nivel de corrección de errores (48=L, 49=M, 50=Q, 51=H)
  commands.push(new Uint8Array([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]));

  // Almacenar datos
  const dataBytes = new TextEncoder().encode(data);
  const len = dataBytes.length + 3;
  const pL = len % 256;
  const pH = Math.floor(len / 256);
  commands.push(new Uint8Array([GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30, ...dataBytes]));

  // Imprimir QR
  commands.push(new Uint8Array([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]));

  return commands;
};

/**
 * Imprimir recibo/ticket completo (igual que Android)
 */
export const printBLEReceipt = async (receiptData, paperWidth = 58) => {
  if (!isBLEPrinterConnected()) {
    return { success: false, error: 'Impresora no conectada' };
  }

  try {
    const separator = paperWidth === 58 ? '------------------------' : '------------------------------------------';
    const charsPerLine = paperWidth === 58 ? 24 : 42;

    // Extraer datos
    const {
      // Datos del negocio
      businessName,
      tradeName,
      businessRuc,
      ruc,
      address,
      phone,
      email,
      socialMedia,
      website,
      logoUrl,
      logoPrintScale,
      // Configuración
      hideRucIgvInNotaVenta,
      hideOnlyIgvInNotaVenta,
      // Documento
      documentType,
      isNotaVenta,
      isInvoice,
      series,
      correlativeNumber,
      number,
      // Fechas
      emissionDate,
      issueDate,
      createdAt,
      // Cliente
      customer,
      customerName,
      customerDocument,
      customerAddress,
      customerBusinessName,
      // Items
      items,
      // Totales
      subtotal,
      tax,
      igv,
      discount,
      total,
      recargoConsumo,
      recargoConsumoRate,
      // Pago
      paymentMethod,
      payments,
      paymentStatus,
      amountPaid,
      balance,
      paymentHistory,
      // Otros
      notes,
      sunatHash,
      qrCode,
      // Tax config
      taxConfig,
      igvRate: igvRateParam,
      // Moneda
      currency,
      // Desglose por afectación (gravada/exonerada/inafecta) precalculado
      taxBreakdown,
    } = receiptData;

    // Obtener igvRate de taxConfig o parámetro directo
    const igvRate = taxConfig?.igvRate ?? igvRateParam ?? 18;

    // Símbolo de moneda según la factura (USD → $, PEN/otros → S/).
    const currencySymbol = currency === 'USD' ? '$' : 'S/';

    const commands = [
      ESCPOSCommands.init(),
    ];

    // ========== HEADER - Datos del Emisor ==========
    commands.push(ESCPOSCommands.align(1)); // Centro

    // Logo del negocio (si existe)
    if (logoUrl) {
      console.log('📷 Preparando logo para impresión BLE...');
      try {
        const logoConfig = await prepareLogoForPrinting(logoUrl, paperWidth, logoPrintScale);

        if (logoConfig.ready && logoConfig.base64) {
          console.log('✅ Logo listo, convirtiendo a comandos ESC/POS...');
          // Ancho del logo según papel (baseline 192/288 px = "100%") ESCALADO por
          // logoPrintScale (30–150%). Antes era FIJO → por eso el control de tamaño
          // del logo no surtía efecto en ticketeras BLE. Acotado al máximo imprimible.
          const pct = Math.max(30, Math.min(150, Number(logoPrintScale) || 100)) / 100;
          const baseLogoWidth = paperWidth === 58 ? 192 : 288;
          const paperMaxDots = paperWidth === 58 ? 384 : 576;
          const maxLogoWidth = Math.min(paperMaxDots, Math.max(48, Math.round(baseLogoWidth * pct)));

          const logoCommands = await imageToEscPosCommands(logoConfig.base64, maxLogoWidth);
          commands.push(logoCommands);
          commands.push(ESCPOSCommands.lineFeed());
          console.log('✅ Logo agregado al ticket');
        } else {
          console.warn('⚠️ Logo no disponible para impresión');
        }
      } catch (logoError) {
        console.error('❌ Error al imprimir logo:', logoError.message);
        // Continuar sin logo
      }
    }

    // Nombre del negocio
    const businessDisplayName = convertSpanishText(tradeName || businessName || 'MI EMPRESA');
    commands.push(ESCPOSCommands.bold(true));
    commands.push(ESCPOSCommands.text(businessDisplayName + '\n'));
    commands.push(ESCPOSCommands.bold(false));

    // RUC (si no es nota de venta con ocultación)
    if (!(isNotaVenta && hideRucIgvInNotaVenta)) {
      const rucValue = businessRuc || ruc || '00000000000';
      commands.push(ESCPOSCommands.text('RUC: ' + rucValue + '\n'));
    }

    // Razón Social (si existe y es diferente)
    if (receiptData.businessLegalName && receiptData.businessLegalName !== businessDisplayName) {
      commands.push(ESCPOSCommands.text(convertSpanishText(receiptData.businessLegalName) + '\n'));
    }

    // Dirección
    commands.push(ESCPOSCommands.text(convertSpanishText(address || 'Direccion no configurada') + '\n'));

    // Teléfono
    if (phone) {
      commands.push(ESCPOSCommands.text('Tel: ' + phone + '\n'));
    }

    // Email
    if (email) {
      commands.push(ESCPOSCommands.text('Email: ' + email + '\n'));
    }

    // Redes sociales
    if (socialMedia) {
      commands.push(ESCPOSCommands.text(convertSpanishText(socialMedia) + '\n'));
    }

    commands.push(ESCPOSCommands.lineFeed());

    // Tipo de documento
    const tipoComprobanteCompleto = isNotaVenta ? 'NOTA DE VENTA' : (isInvoice ? 'FACTURA ELECTRONICA' : 'BOLETA DE VENTA ELECTRONICA');
    commands.push(ESCPOSCommands.bold(true));
    commands.push(ESCPOSCommands.text(tipoComprobanteCompleto + '\n'));
    commands.push(ESCPOSCommands.bold(false));

    // Número de documento
    const docNumber = `${series || 'B001'}-${String(correlativeNumber || number || '000').padStart(8, '0')}`;
    commands.push(ESCPOSCommands.bold(true));
    commands.push(ESCPOSCommands.text(docNumber + '\n'));
    commands.push(ESCPOSCommands.bold(false));

    commands.push(ESCPOSCommands.text(separator + '\n'));

    // ========== Fecha y Hora ==========
    let invoiceDate;
    if (emissionDate && typeof emissionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(emissionDate)) {
      const [year, month, day] = emissionDate.split('-').map(Number);
      invoiceDate = new Date(year, month - 1, day, 12, 0, 0);
    } else if (issueDate) {
      invoiceDate = issueDate.toDate ? issueDate.toDate() : new Date(issueDate);
    } else if (createdAt) {
      invoiceDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    } else {
      invoiceDate = new Date();
    }

    const createdDate = createdAt ? (createdAt.toDate ? createdAt.toDate() : new Date(createdAt)) : new Date();
    const hours = String(createdDate.getHours()).padStart(2, '0');
    const minutes = String(createdDate.getMinutes()).padStart(2, '0');
    const seconds = String(createdDate.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;

    commands.push(ESCPOSCommands.align(0)); // Izquierda
    commands.push(ESCPOSCommands.text('Fecha: ' + invoiceDate.toLocaleDateString('es-PE') + '\n'));
    commands.push(ESCPOSCommands.text('Hora: ' + timeString + '\n'));

    // ========== Datos del Cliente ==========
    commands.push(ESCPOSCommands.bold(true));
    commands.push(ESCPOSCommands.text('DATOS DEL CLIENTE\n'));
    commands.push(ESCPOSCommands.bold(false));

    const custName = customer?.name || customerName || 'Cliente';
    const custDoc = customer?.documentNumber || customerDocument || '-';
    const custAddress = customer?.address || customerAddress || '';
    const custBusinessName = customer?.businessName || customerBusinessName || '';
    const custPhone = customer?.phone || receiptData.customerPhone || '';

    if (isInvoice) {
      // Factura: RUC, Razón Social, Nombre Comercial (opcional), Dirección, Teléfono
      commands.push(ESCPOSCommands.text('RUC: ' + custDoc + '\n'));
      commands.push(ESCPOSCommands.text(convertSpanishText('Razon Social: ' + (custBusinessName || '-')) + '\n'));
      if (custName && custName !== 'VARIOS') {
        commands.push(ESCPOSCommands.text(convertSpanishText('Nombre Comercial: ' + custName) + '\n'));
      }
      if (custAddress) {
        commands.push(ESCPOSCommands.text(convertSpanishText('Direccion: ' + custAddress) + '\n'));
      }
      if (custPhone) {
        commands.push(ESCPOSCommands.text(convertSpanishText('Telefono: ' + custPhone) + '\n'));
      }
    } else {
      // Boleta/Nota de venta: DNI, Nombre, Dirección, Teléfono
      commands.push(ESCPOSCommands.text('DNI: ' + custDoc + '\n'));
      commands.push(ESCPOSCommands.text(convertSpanishText('Nombre: ' + custName) + '\n'));
      if (custAddress) {
        commands.push(ESCPOSCommands.text(convertSpanishText('Direccion: ' + custAddress) + '\n'));
      }
      if (custPhone) {
        commands.push(ESCPOSCommands.text(convertSpanishText('Telefono: ' + custPhone) + '\n'));
      }
    }

    // Vendedor (si existe)
    if (receiptData.sellerName) {
      commands.push(ESCPOSCommands.text(convertSpanishText('Vendedor: ' + receiptData.sellerName) + '\n'));
    }

    // Alumno y Horario (solo si existen en los datos)
    if (customer?.studentName) {
      commands.push(ESCPOSCommands.text(convertSpanishText('Alumno: ' + customer.studentName) + '\n'));
    }
    if (customer?.studentSchedule) {
      commands.push(ESCPOSCommands.text(convertSpanishText('Horario: ' + customer.studentSchedule) + '\n'));
    }

    // Mascota (modo veterinaria)
    if (customer?.petName) {
      commands.push(ESCPOSCommands.text(convertSpanishText('Mascota: ' + customer.petName) + '\n'));
    }

    // Placa de Vehículo (solo si existe en los datos)
    if (customer?.vehiclePlate) {
      commands.push(ESCPOSCommands.text(convertSpanishText('Placa: ' + customer.vehiclePlate.toUpperCase()) + '\n'));
    }
    if (customer?.vehicleModel) {
      commands.push(ESCPOSCommands.text(convertSpanishText('Modelo: ' + customer.vehicleModel.toUpperCase()) + '\n'));
    }
    if (customer?.vehicleYear) {
      commands.push(ESCPOSCommands.text(convertSpanishText('Ano: ' + customer.vehicleYear) + '\n'));
    }

    commands.push(ESCPOSCommands.text(separator + '\n'));

    // ========== Detalle de Productos ==========
    commands.push(ESCPOSCommands.bold(true));
    commands.push(ESCPOSCommands.text('DETALLE\n'));
    commands.push(ESCPOSCommands.bold(false));

    if (items && items.length > 0) {
      for (const item of items) {
        // Usar 'name' como nombre principal, o 'description' si 'name' no existe (compatibilidad con datos antiguos)
        const itemName = convertSpanishText(item.name || item.description || '');
        // Observaciones adicionales (IMEI, placa, serie, etc.)
        const itemObservations = item.observations
          ? convertSpanishText(item.observations)
          : null;
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

        // Línea 1: Nombre del producto
        commands.push(ESCPOSCommands.text(itemName + '\n'));

        // Línea 2: cantidad x precio -> total
        const qtyFormatted = Number.isInteger(item.quantity)
          ? item.quantity.toString()
          : item.quantity.toFixed(3).replace(/\.?0+$/, '');
        const unitSuffix = item.unit && item.allowDecimalQuantity ? item.unit.toLowerCase() : '';
        const qtyAndPrice = `${qtyFormatted}${unitSuffix}x ${currencySymbol} ${unitPrice.toFixed(2)}`;
        const totalStr = `${currencySymbol} ${itemTotal.toFixed(2)}`;
        const spaceBetween = charsPerLine - qtyAndPrice.length - totalStr.length;
        commands.push(ESCPOSCommands.text(qtyAndPrice + ' '.repeat(Math.max(1, spaceBetween)) + totalStr + '\n'));

        // Línea de descuento por ítem si existe
        if (itemDiscount > 0) {
          const discountLabel = 'Dsct.';
          const discountStr = `-${currencySymbol} ${itemDiscount.toFixed(2)}`;
          const discountSpace = charsPerLine - discountLabel.length - discountStr.length;
          commands.push(ESCPOSCommands.text(discountLabel + ' '.repeat(Math.max(1, discountSpace)) + discountStr + '\n'));
        }

        // Línea 3: Código si existe
        if (item.code) {
          commands.push(ESCPOSCommands.text('Codigo: ' + convertSpanishText(item.code) + '\n'));
        }

        // Número de serie si existe
        if (item.serialNumber) {
          commands.push(ESCPOSCommands.text('S/N: ' + convertSpanishText(item.serialNumber) + '\n'));
        }

        // Línea 4: Observaciones adicionales si existen (IMEI, placa, serie, etc.)
        if (itemObservations) {
          commands.push(ESCPOSCommands.text('  ' + itemObservations + '\n'));
        }

        // Modificadores con precio (modo restaurante).
        // Solo se imprimen los que suman al total (priceAdjustment > 0).
        // Los gratis (mayonesa, ketchup) no aparecen en el comprobante; sí en la comanda de cocina.
        if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
          for (const modifier of item.modifiers) {
            for (const option of (modifier.options || [])) {
              if (!(Number(option.priceAdjustment) > 0)) continue;
              const qtyPrefix = option.quantity > 1 ? option.quantity + 'x ' : '';
              const totalAdj = (option.priceAdjustment || 0) * (option.quantity || 1);
              commands.push(ESCPOSCommands.text(
                '  + ' + qtyPrefix + convertSpanishText(option.optionName) +
                ' (+' + currencySymbol + ' ' + totalAdj.toFixed(2) + ')\n'
              ));
            }
          }
        }

        // Espacio entre items (solo para 80mm)
        if (paperWidth === 80) {
          commands.push(ESCPOSCommands.lineFeed());
        }
      }
    }

    commands.push(ESCPOSCommands.text(separator + '\n'));

    // ========== Totales ==========
    commands.push(ESCPOSCommands.align(2)); // Derecha

    if (!(isNotaVenta && (hideRucIgvInNotaVenta || hideOnlyIgvInNotaVenta))) {
      const subtotalValue = subtotal || 0;
      const taxValue = tax || igv || 0;
      if (taxBreakdown && taxBreakdown.hasExoOrIna) {
        // Desglose por afectación (productos exonerados/inafectos)
        if (taxBreakdown.hasGravada) commands.push(ESCPOSCommands.text('OP. Gravada: ' + currencySymbol + ' ' + taxBreakdown.gravada.toFixed(2) + '\n'));
        if (taxBreakdown.exonerada > 0) commands.push(ESCPOSCommands.text('OP. Exonerada: ' + currencySymbol + ' ' + taxBreakdown.exonerada.toFixed(2) + '\n'));
        if (taxBreakdown.inafecta > 0) commands.push(ESCPOSCommands.text('OP. Inafecta: ' + currencySymbol + ' ' + taxBreakdown.inafecta.toFixed(2) + '\n'));
        if (taxBreakdown.hasGravada) commands.push(ESCPOSCommands.text(`IGV (${igvRate}%): ${currencySymbol} ` + taxBreakdown.igv.toFixed(2) + '\n'));
      } else {
        commands.push(ESCPOSCommands.text('Subtotal: ' + currencySymbol + ' ' + subtotalValue.toFixed(2) + '\n'));
        commands.push(ESCPOSCommands.text(`IGV (${igvRate}%): ${currencySymbol} ` + taxValue.toFixed(2) + '\n'));
      }
    }

    if (discount && discount > 0) {
      commands.push(ESCPOSCommands.text('Descuento: -' + currencySymbol + ' ' + discount.toFixed(2) + '\n'));
    }

    // Recargo al Consumo (si existe)
    if (recargoConsumo && recargoConsumo > 0) {
      commands.push(ESCPOSCommands.text('Rec. Consumo (' + (recargoConsumoRate || 10) + '%): ' + currencySymbol + ' ' + recargoConsumo.toFixed(2) + '\n'));
    }

    commands.push(ESCPOSCommands.bold(true));
    commands.push(ESCPOSCommands.text('TOTAL: ' + currencySymbol + ' ' + (total || 0).toFixed(2) + '\n'));
    commands.push(ESCPOSCommands.bold(false));

    // ========== Forma de Pago ==========
    const totalPaid = payments && payments.length > 0
      ? payments.reduce((sum, p) => sum + (p.amount || 0), 0)
      : 0;
    const isCreditSale = totalPaid === 0 && !paymentMethod && paymentStatus === 'pending';

    if (isCreditSale) {
      // Venta totalmente a crédito (sin pagos)
      commands.push(ESCPOSCommands.text(separator + '\n'));
      commands.push(ESCPOSCommands.align(0));
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text('FORMA DE PAGO\n'));
      commands.push(ESCPOSCommands.bold(false));
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text(convertSpanishText('AL CREDITO') + '\n'));
      commands.push(ESCPOSCommands.bold(false));
      commands.push(ESCPOSCommands.text('Saldo Pendiente: ' + currencySymbol + ' ' + (total || 0).toFixed(2) + '\n'));
    } else if (paymentMethod || (payments && payments.length > 0)) {
      commands.push(ESCPOSCommands.text(separator + '\n'));
      commands.push(ESCPOSCommands.align(0));
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text('FORMA DE PAGO\n'));
      commands.push(ESCPOSCommands.bold(false));

      if (payments && payments.length > 0) {
        for (const payment of payments) {
          commands.push(ESCPOSCommands.text(convertSpanishText(payment.method) + ': ' + currencySymbol + ' ' + payment.amount.toFixed(2) + '\n'));
        }
        // Mostrar saldo pendiente si el pago es menor al total
        if (totalPaid < (total || 0)) {
          const saldoPendiente = (total || 0) - totalPaid;
          commands.push(ESCPOSCommands.bold(true));
          commands.push(ESCPOSCommands.text('Saldo Pendiente: ' + currencySymbol + ' ' + saldoPendiente.toFixed(2) + '\n'));
          commands.push(ESCPOSCommands.bold(false));
        }
      } else if (paymentMethod) {
        commands.push(ESCPOSCommands.text(convertSpanishText(paymentMethod) + ': ' + currencySymbol + ' ' + (total || 0).toFixed(2) + '\n'));
      }
    }

    // ========== Estado de Pago (Pago Parcial / Saldo) ==========
    console.log('🧾 [BLE] Datos de pago parcial:', { paymentStatus, amountPaid, balance, paymentHistoryLength: paymentHistory?.length });
    if (paymentStatus === 'partial' || (paymentHistory && paymentHistory.length > 0)) {
      commands.push(ESCPOSCommands.text(separator + '\n'));
      commands.push(ESCPOSCommands.align(0));

      const statusTitle = paymentStatus === 'partial' ? 'ESTADO DE PAGO' : 'DETALLE DE PAGOS';
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text(statusTitle + '\n'));
      commands.push(ESCPOSCommands.bold(false));

      if (paymentStatus === 'partial') {
        commands.push(ESCPOSCommands.text('Pagado: ' + currencySymbol + ' ' + (amountPaid || 0).toFixed(2) + '\n'));
        commands.push(ESCPOSCommands.bold(true));
        commands.push(ESCPOSCommands.text('Saldo Pendiente: ' + currencySymbol + ' ' + (balance || 0).toFixed(2) + '\n'));
        commands.push(ESCPOSCommands.bold(false));
      }

      if (paymentHistory && paymentHistory.length > 0) {
        commands.push(ESCPOSCommands.text('Historial de pagos:\n'));
        for (const payment of paymentHistory) {
          const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
          const dateStr = paymentDate.toLocaleDateString('es-PE');
          const amountStr = (payment.amount || 0).toFixed(2);
          commands.push(ESCPOSCommands.text(' ' + dateStr + ' ' + currencySymbol + amountStr + ' (' + convertSpanishText(payment.method || 'Efectivo') + ')\n'));
        }
      }
    }

    // ========== Observaciones ==========
    if (notes) {
      commands.push(ESCPOSCommands.text(separator + '\n'));
      commands.push(ESCPOSCommands.align(1));
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text('OBSERVACIONES\n'));
      commands.push(ESCPOSCommands.bold(false));
      commands.push(ESCPOSCommands.text(convertSpanishText(notes) + '\n'));
    }

    // ========== FOOTER ==========
    commands.push(ESCPOSCommands.text(separator + '\n'));
    commands.push(ESCPOSCommands.align(1));

    if (isNotaVenta) {
      // Nota de venta: no válido tributariamente
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text('DOCUMENTO NO VALIDO PARA\n'));
      commands.push(ESCPOSCommands.text('FINES TRIBUTARIOS\n'));
      commands.push(ESCPOSCommands.bold(false));
    } else {
      // Factura/Boleta electrónica
      const tipoComprobante = isInvoice ? 'FACTURA' : 'BOLETA DE VENTA';
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text('REPRESENTACION IMPRESA DE LA\n'));
      commands.push(ESCPOSCommands.text(tipoComprobante + ' ELECTRONICA\n'));
      commands.push(ESCPOSCommands.bold(false));

      // Hash SUNAT
      if (sunatHash) {
        commands.push(ESCPOSCommands.align(0));
        commands.push(ESCPOSCommands.bold(true));
        commands.push(ESCPOSCommands.text('Hash: '));
        commands.push(ESCPOSCommands.bold(false));
        const hashLength = paperWidth === 80 ? 45 : 30;
        commands.push(ESCPOSCommands.text(sunatHash.substring(0, hashLength) + '\n'));
        commands.push(ESCPOSCommands.align(1));
      }

      // Código QR
      let qrData = qrCode;
      if (!qrData && (businessRuc || ruc) && series) {
        const tipoDoc = isInvoice ? '01' : '03';
        let fecha;
        if (emissionDate && typeof emissionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(emissionDate)) {
          fecha = emissionDate;
        } else {
          fecha = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${String(invoiceDate.getDate()).padStart(2, '0')}`;
        }
        const docCliente = isInvoice ? '6' : '1';
        const numDocCliente = custDoc;
        const taxValue = tax || igv || 0;
        qrData = `${businessRuc || ruc}|${tipoDoc}|${series}|${correlativeNumber || number}|${taxValue.toFixed(2)}|${(total || 0).toFixed(2)}|${fecha}|${docCliente}|${numDocCliente}`;
      }

      if (qrData) {
        // Generar QR
        const qrCommands = generateQRCommands(qrData, paperWidth === 58 ? 3 : 4);
        for (const cmd of qrCommands) {
          commands.push(cmd);
        }
        commands.push(ESCPOSCommands.text('Escanea para validar\n'));
      }

      // Consulta SUNAT
      commands.push(ESCPOSCommands.text('Consulte su comprobante en:\n'));
      commands.push(ESCPOSCommands.text('www.sunat.gob.pe\n'));
    }

    // Mensaje de agradecimiento
    commands.push(ESCPOSCommands.bold(true));
    commands.push(ESCPOSCommands.text('!Gracias por su preferencia!\n'));
    commands.push(ESCPOSCommands.bold(false));

    // Mensaje personalizado al pie (configurable en Settings)
    if (receiptData.ticketFooterMessage && receiptData.ticketFooterMessage.trim()) {
      commands.push(ESCPOSCommands.text('\n'));
      const footerLines = receiptData.ticketFooterMessage.trim().split(/\r?\n/);
      for (const line of footerLines) {
        commands.push(ESCPOSCommands.text(convertSpanishText(line) + '\n'));
      }
    }

    // QR personalizado al pie (configurable en Settings)
    // NOTA: BLE solo soporta el modo 'auto' (generar QR desde contenido).
    // Para el modo 'image' (imagen subida) se requiere ESC/POS raster que
    // este path no implementa todavía. Si el usuario configuró modo 'image'
    // y está imprimiendo vía BLE, se omite el QR sin romper el ticket.
    if (receiptData.ticketQrEnabled && receiptData.ticketQrContent && receiptData.ticketQrContent.trim()
        && receiptData.ticketQrMode !== 'image') {
      commands.push(ESCPOSCommands.text('\n'));
      const customQrCmds = generateQRCommands(receiptData.ticketQrContent.trim(), paperWidth === 58 ? 5 : 7);
      for (const cmd of customQrCmds) {
        commands.push(cmd);
      }
      if (receiptData.ticketQrCaption && receiptData.ticketQrCaption.trim()) {
        commands.push(ESCPOSCommands.text(convertSpanishText(receiptData.ticketQrCaption.trim()) + '\n'));
      }
    }

    // Website
    if (website) {
      commands.push(ESCPOSCommands.text(convertSpanishText(website) + '\n'));
    }

    commands.push(ESCPOSCommands.feed(getCutFeedLines()));
    commands.push(ESCPOSCommands.cut());

    const data = concatUint8Arrays(...commands);
    return await writeBLEData(data);
  } catch (error) {
    console.error('❌ Error imprimiendo recibo BLE:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir comanda de cocina via BLE
 */
export const printBLEKitchenOrder = async (order, table = null, paperWidth = 58) => {
  if (!isBLEPrinterConnected()) {
    return { success: false, error: 'Impresora no conectada' };
  }

  try {
    const commands = [ESCPOSCommands.init()];

    // Formato ÚNICO de comanda (mismo que Bluetooth / WiFi / estación / HTML)
    const lines = buildKitchenLines(order, table, paperWidth, null);
    for (const ln of lines) {
      if (ln.sep) {
        commands.push(ESCPOSCommands.align(0), ESCPOSCommands.bold(false), ESCPOSCommands.doubleHeight(false));
        commands.push(ESCPOSCommands.text('-'.repeat(paperWidth === 58 ? 24 : 42) + '\n'));
        continue;
      }
      if (ln.blank) { commands.push(ESCPOSCommands.text('\n')); continue; }
      commands.push(ESCPOSCommands.align(ln.a === 'C' ? 1 : 0));
      commands.push(ESCPOSCommands.doubleHeight(!!ln.big));
      commands.push(ESCPOSCommands.bold(!!ln.b));
      commands.push(ESCPOSCommands.text(convertSpanishText(ln.t) + '\n'));
    }
    commands.push(ESCPOSCommands.align(0), ESCPOSCommands.bold(false), ESCPOSCommands.doubleHeight(false));

    // En 80mm la impresora hace feed automático al cortar, menos líneas evitan margen excesivo
    commands.push(ESCPOSCommands.feed(getCutFeedLines()));
    commands.push(ESCPOSCommands.cut());

    const data = concatUint8Arrays(...commands);
    const result = await writeBLEData(data);

    if (result.success) {
      console.log('✅ Comanda BLE impresa correctamente');
    }

    return result;
  } catch (error) {
    console.error('❌ Error imprimiendo comanda BLE:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir precuenta via BLE
 */
export const printBLEPreBill = async (order, table, business, taxConfig = { igvRate: 18, igvExempt: false }, paperWidth = 58, recargoConsumoConfig = { enabled: false, rate: 10 }) => {
  if (!isBLEPrinterConnected()) {
    return { success: false, error: 'Impresora no conectada' };
  }

  try {
    const separator = paperWidth === 58 ? '------------------------' : '------------------------------------------';
    const halfSeparator = paperWidth === 58 ? '------------' : '---------------------';
    const charsPerLine = paperWidth === 58 ? 24 : 42;

    // Calcular totales
    let subtotal, tax, recargoConsumo = 0;
    let total = order.total || 0;
    const orderDiscount = order.discount || null;
    const itemsBaseTotal = (order.items || []).reduce((sum, it) => sum + (it.total || 0), 0);
    const discountAmount = orderDiscount && orderDiscount.amount ? orderDiscount.amount : 0;

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

    const commands = [
      ESCPOSCommands.init(),
      ESCPOSCommands.align(1), // Centro
      ESCPOSCommands.bold(true),
      ESCPOSCommands.doubleHeight(true),
      ESCPOSCommands.text(convertSpanishText(business.tradeName || 'RESTAURANTE') + '\n'),
      ESCPOSCommands.doubleHeight(false),
      ESCPOSCommands.bold(false),
      ESCPOSCommands.text(convertSpanishText(business.address || '') + '\n'),
      ESCPOSCommands.text((business.phone || '') + '\n'),
      ESCPOSCommands.bold(true),
      ESCPOSCommands.doubleHeight(true),
      ESCPOSCommands.text('PRECUENTA\n'),
      ESCPOSCommands.doubleHeight(false),
      ESCPOSCommands.bold(false),
      ESCPOSCommands.text(separator + '\n'),
      ESCPOSCommands.align(0), // Izquierda
      ESCPOSCommands.text('Fecha: ' + new Date().toLocaleString('es-PE') + '\n'),
      ESCPOSCommands.text('Mesa: ' + table.number + '\n'),
      ESCPOSCommands.text('Mozo: ' + (table.waiter || 'N/A') + '\n'),
      ESCPOSCommands.text('Orden: #' + (order.orderNumber || order.id?.slice(-6) || 'N/A') + '\n'),
      ESCPOSCommands.text(halfSeparator + '\n'),
    ];

    // Items
    for (const item of order.items || []) {
      const itemName = convertSpanishText(item.name || '');
      const itemTotal = (item.total || 0).toFixed(2);

      commands.push(ESCPOSCommands.text(item.quantity + 'x ' + itemName + '\n'));
      commands.push(ESCPOSCommands.text('   S/ ' + itemTotal + '\n'));

      // Modificadores
      if (item.modifiers && item.modifiers.length > 0) {
        for (const modifier of item.modifiers) {
          for (const option of modifier.options) {
            let optText = '  + ' + (option.quantity > 1 ? option.quantity + 'x ' : '') + convertSpanishText(option.optionName);
            if (option.priceAdjustment > 0) {
              optText += ' (+S/' + ((option.priceAdjustment || 0) * (option.quantity || 1)).toFixed(2) + ')';
            }
            commands.push(ESCPOSCommands.text(optText + '\n'));
          }
        }
      }

      if (item.notes) {
        commands.push(ESCPOSCommands.text('  * ' + convertSpanishText(item.notes) + '\n'));
      }
    }

    commands.push(ESCPOSCommands.text(halfSeparator + '\n'));
    commands.push(ESCPOSCommands.align(2)); // Derecha

    // Línea de descuento global (si aplica)
    if (discountAmount > 0) {
      commands.push(ESCPOSCommands.text('Subtotal Productos: S/ ' + itemsBaseTotal.toFixed(2) + '\n'));
      const discountLabel = orderDiscount.type === 'percent'
        ? 'Descuento (-' + orderDiscount.value + '%)'
        : 'Descuento';
      commands.push(ESCPOSCommands.text(discountLabel + ': -S/ ' + discountAmount.toFixed(2) + '\n'));
      if (orderDiscount.reason) {
        commands.push(ESCPOSCommands.text('Motivo: ' + convertSpanishText(orderDiscount.reason) + '\n'));
      }
    }

    // Totales
    if (!taxConfig.igvExempt) {
      commands.push(ESCPOSCommands.text('Subtotal: S/ ' + subtotal.toFixed(2) + '\n'));
      commands.push(ESCPOSCommands.text('IGV (' + taxConfig.igvRate + '%): S/ ' + tax.toFixed(2) + '\n'));
    } else {
      commands.push(ESCPOSCommands.text('*** Exonerado de IGV ***\n'));
    }

    // Agregar Recargo al Consumo si aplica
    if (recargoConsumo > 0) {
      commands.push(ESCPOSCommands.text('Rec. Consumo (' + recargoConsumoConfig.rate + '%): S/ ' + recargoConsumo.toFixed(2) + '\n'));
    }

    commands.push(ESCPOSCommands.bold(true));
    commands.push(ESCPOSCommands.doubleHeight(true));
    commands.push(ESCPOSCommands.text('TOTAL: S/ ' + total.toFixed(2) + '\n'));
    commands.push(ESCPOSCommands.doubleHeight(false));
    commands.push(ESCPOSCommands.bold(false));

    // Footer
    commands.push(ESCPOSCommands.text(separator + '\n'));
    commands.push(ESCPOSCommands.align(1)); // Centro
    commands.push(ESCPOSCommands.bold(true));
    commands.push(ESCPOSCommands.text('*** PRECUENTA ***\n'));
    commands.push(ESCPOSCommands.bold(false));
    commands.push(ESCPOSCommands.text('No valido como comprobante\n'));
    commands.push(ESCPOSCommands.text('Solicite su factura o boleta\n'));
    commands.push(ESCPOSCommands.lineFeed());
    commands.push(ESCPOSCommands.text('Gracias por su preferencia\n'));
    commands.push(ESCPOSCommands.feed(getCutFeedLines()));
    commands.push(ESCPOSCommands.cut());

    const data = concatUint8Arrays(...commands);
    const result = await writeBLEData(data);

    if (result.success) {
      console.log('✅ Precuenta BLE impresa correctamente');
    }

    return result;
  } catch (error) {
    console.error('❌ Error imprimiendo precuenta BLE:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Imprimir precuenta dividida en impresora BLE (una o todas las personas)
 */
export const printBLESplitPreBill = async (order, table, business, taxConfig = { igvRate: 18, igvExempt: false }, paperWidth = 58, recargoConsumoConfig = { enabled: false, rate: 10 }, splitData, personIndex = null) => {
  if (!isBLEPrinterConnected()) {
    return { success: false, error: 'Impresora no conectada' };
  }

  try {
    const separator = paperWidth === 58 ? '------------------------' : '------------------------------------------';
    const halfSeparator = paperWidth === 58 ? '------------' : '---------------------';

    const personsToprint = personIndex !== null
      ? [splitData.persons[personIndex]]
      : splitData.persons;

    for (let pi = 0; pi < personsToprint.length; pi++) {
      const person = personsToprint[pi];
      const isItemsSplit = splitData.method === 'items';
      const itemsToShow = isItemsSplit ? person.items : (order.items || []);
      const personTotal = person.total;

      let subtotal, tax, recargoConsumo = 0;
      let total = personTotal;

      if (taxConfig.igvExempt) {
        subtotal = total;
        tax = 0;
      } else {
        const igvRate = taxConfig.igvRate || 18;
        const igvMultiplier = 1 + (igvRate / 100);
        subtotal = total / igvMultiplier;
        tax = total - subtotal;
      }

      if (recargoConsumoConfig.enabled && recargoConsumoConfig.rate > 0) {
        recargoConsumo = subtotal * (recargoConsumoConfig.rate / 100);
        total = total + recargoConsumo;
      }

      const commands = [
        ESCPOSCommands.init(),
        ESCPOSCommands.align(1),
        ESCPOSCommands.bold(true),
        ESCPOSCommands.doubleHeight(true),
        ESCPOSCommands.text(convertSpanishText(business.tradeName || 'RESTAURANTE') + '\n'),
        ESCPOSCommands.doubleHeight(false),
        ESCPOSCommands.bold(false),
        ESCPOSCommands.text(convertSpanishText(business.address || '') + '\n'),
        ESCPOSCommands.text((business.phone || '') + '\n'),
        ESCPOSCommands.bold(true),
        ESCPOSCommands.doubleHeight(true),
        ESCPOSCommands.text('PRECUENTA DIVIDIDA\n'),
        ESCPOSCommands.doubleHeight(false),
        ESCPOSCommands.bold(false),
        ESCPOSCommands.text(separator + '\n'),
        ESCPOSCommands.align(0),
        ESCPOSCommands.text('Fecha: ' + new Date().toLocaleString('es-PE') + '\n'),
        ESCPOSCommands.text('Mesa: ' + table.number + '\n'),
        ESCPOSCommands.text('Mozo: ' + (table.waiter || 'N/A') + '\n'),
        ESCPOSCommands.text('Orden: #' + (order.orderNumber || order.id?.slice(-6) || 'N/A') + '\n'),
        ESCPOSCommands.bold(true),
        ESCPOSCommands.text('Persona ' + person.personNumber + ' de ' + splitData.numberOfPeople + '\n'),
        ESCPOSCommands.bold(false),
        ESCPOSCommands.text(halfSeparator + '\n'),
      ];

      // Items
      for (const item of itemsToShow) {
        const itemName = convertSpanishText(item.name || '');
        const itemTotal = (item.total || 0).toFixed(2);
        commands.push(ESCPOSCommands.text(item.quantity + 'x ' + itemName + '\n'));
        commands.push(ESCPOSCommands.text('   S/ ' + itemTotal + '\n'));
        if (item.notes) {
          commands.push(ESCPOSCommands.text('  * ' + convertSpanishText(item.notes) + '\n'));
        }
      }

      commands.push(ESCPOSCommands.text(halfSeparator + '\n'));
      commands.push(ESCPOSCommands.align(2));

      if (!taxConfig.igvExempt) {
        commands.push(ESCPOSCommands.text('Subtotal: S/ ' + subtotal.toFixed(2) + '\n'));
        commands.push(ESCPOSCommands.text('IGV (' + taxConfig.igvRate + '%): S/ ' + tax.toFixed(2) + '\n'));
      }

      if (recargoConsumo > 0) {
        commands.push(ESCPOSCommands.text('Rec. Consumo (' + recargoConsumoConfig.rate + '%): S/ ' + recargoConsumo.toFixed(2) + '\n'));
      }

      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.doubleHeight(true));
      commands.push(ESCPOSCommands.text('TOTAL: S/ ' + total.toFixed(2) + '\n'));
      commands.push(ESCPOSCommands.doubleHeight(false));
      commands.push(ESCPOSCommands.bold(false));

      commands.push(ESCPOSCommands.text(separator + '\n'));
      commands.push(ESCPOSCommands.align(1));
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text('*** PRECUENTA ***\n'));
      commands.push(ESCPOSCommands.bold(false));
      commands.push(ESCPOSCommands.text('No valido como comprobante\n'));
      commands.push(ESCPOSCommands.text('Solicite su factura o boleta\n'));
      commands.push(ESCPOSCommands.lineFeed());
      commands.push(ESCPOSCommands.text('Gracias por su preferencia\n'));
      commands.push(ESCPOSCommands.feed(getCutFeedLines()));
      commands.push(ESCPOSCommands.cut());

      const data = concatUint8Arrays(...commands);
      const result = await writeBLEData(data);
      if (!result.success) {
        return result;
      }
    }

    console.log('✅ Precuenta dividida BLE impresa correctamente');
    return { success: true };
  } catch (error) {
    console.error('❌ Error imprimiendo precuenta dividida BLE:', error);
    return { success: false, error: error.message };
  }
};

export const printBLERawData = async (base64Data) => {
  if (!connectedDeviceId) {
    return { success: false, error: 'Impresora BLE no conectada' };
  }

  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const result = await writeBLEData(bytes);
    if (!result.success) {
      return { success: false, error: result.error || 'Error escribiendo datos BLE' };
    }
    return { success: true };
  } catch (error) {
    console.error('❌ Error imprimiendo datos crudos BLE:', error);
    return { success: false, error: error.message };
  }
};

export default {
  initializeBLE,
  scanBLEDevices,
  connectBLEPrinter,
  disconnectBLEPrinter,
  isBLEPrinterConnected,
  writeBLEData,
  printBLEText,
  printBLETest,
  printBLEReceipt,
  printBLEKitchenOrder,
  printBLEPreBill,
  printBLESplitPreBill,
  printBLERawData,
  ESCPOSCommands,
};
