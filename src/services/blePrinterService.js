/**
 * Servicio alternativo de impresión Bluetooth usando @capacitor-community/bluetooth-le
 * Este servicio se usa como fallback en iOS cuando el plugin capacitor-thermal-printer falla
 */

import { Capacitor } from '@capacitor/core';
import { BleClient, numbersToDataView, numberToUUID } from '@capacitor-community/bluetooth-le';

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

  // Cortar papel
  cut: () => new Uint8Array([GS, 0x56, 0x00]),

  // Cortar papel parcial
  cutPartial: () => new Uint8Array([GS, 0x56, 0x01]),

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
 * Imprimir recibo/ticket
 */
export const printBLEReceipt = async (receiptData, paperWidth = 58) => {
  if (!isBLEPrinterConnected()) {
    return { success: false, error: 'Impresora no conectada' };
  }

  try {
    const separator = paperWidth === 58 ? '--------------------------------' : '------------------------------------------------';
    const charsPerLine = paperWidth === 58 ? 32 : 48;

    const commands = [
      ESCPOSCommands.init(),
    ];

    // Encabezado - Nombre del negocio
    if (receiptData.businessName) {
      commands.push(ESCPOSCommands.align(1));
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text(receiptData.businessName + '\n'));
      commands.push(ESCPOSCommands.bold(false));
    }

    // RUC
    if (receiptData.ruc) {
      commands.push(ESCPOSCommands.align(1));
      commands.push(ESCPOSCommands.text('RUC: ' + receiptData.ruc + '\n'));
    }

    // Dirección
    if (receiptData.address) {
      commands.push(ESCPOSCommands.align(1));
      commands.push(ESCPOSCommands.text(receiptData.address + '\n'));
    }

    commands.push(ESCPOSCommands.text(separator + '\n'));

    // Tipo de documento y número
    if (receiptData.documentType && receiptData.documentNumber) {
      commands.push(ESCPOSCommands.align(1));
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text(receiptData.documentType + '\n'));
      commands.push(ESCPOSCommands.text(receiptData.documentNumber + '\n'));
      commands.push(ESCPOSCommands.bold(false));
    }

    // Fecha
    if (receiptData.date) {
      commands.push(ESCPOSCommands.align(1));
      commands.push(ESCPOSCommands.text('Fecha: ' + receiptData.date + '\n'));
    }

    commands.push(ESCPOSCommands.text(separator + '\n'));

    // Cliente
    if (receiptData.customerName) {
      commands.push(ESCPOSCommands.align(0));
      commands.push(ESCPOSCommands.text('Cliente: ' + receiptData.customerName + '\n'));
    }
    if (receiptData.customerDocument) {
      commands.push(ESCPOSCommands.text('Doc: ' + receiptData.customerDocument + '\n'));
    }

    commands.push(ESCPOSCommands.text(separator + '\n'));

    // Items
    commands.push(ESCPOSCommands.align(0));
    if (receiptData.items && receiptData.items.length > 0) {
      for (const item of receiptData.items) {
        const qty = item.quantity || 1;
        const name = (item.name || '').substring(0, charsPerLine - 10);
        const price = (item.total || item.price || 0).toFixed(2);

        commands.push(ESCPOSCommands.text(`${qty} x ${name}\n`));
        commands.push(ESCPOSCommands.align(2));
        commands.push(ESCPOSCommands.text(`S/ ${price}\n`));
        commands.push(ESCPOSCommands.align(0));
      }
    }

    commands.push(ESCPOSCommands.text(separator + '\n'));

    // Totales
    commands.push(ESCPOSCommands.align(2));

    if (receiptData.subtotal !== undefined) {
      commands.push(ESCPOSCommands.text(`Subtotal: S/ ${receiptData.subtotal.toFixed(2)}\n`));
    }
    if (receiptData.igv !== undefined) {
      commands.push(ESCPOSCommands.text(`IGV (18%): S/ ${receiptData.igv.toFixed(2)}\n`));
    }
    if (receiptData.total !== undefined) {
      commands.push(ESCPOSCommands.bold(true));
      commands.push(ESCPOSCommands.text(`TOTAL: S/ ${receiptData.total.toFixed(2)}\n`));
      commands.push(ESCPOSCommands.bold(false));
    }

    commands.push(ESCPOSCommands.text(separator + '\n'));

    // Pie de página
    commands.push(ESCPOSCommands.align(1));
    commands.push(ESCPOSCommands.text('Gracias por su compra!\n'));

    commands.push(ESCPOSCommands.feed(4));

    const data = concatUint8Arrays(...commands);
    return await writeBLEData(data);
  } catch (error) {
    console.error('❌ Error imprimiendo recibo BLE:', error);
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
  ESCPOSCommands,
};
