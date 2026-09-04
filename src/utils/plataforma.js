/**
 * EN QUÉ PLATAFORMA CORRE LA APP, en un solo lugar.
 *
 * La misma app corre en cuatro contextos y no todo funciona en todos:
 *
 *   escritorio-web   Chrome/Edge en una PC. Imprime por el diálogo del sistema.
 *   movil-web        El navegador del celular. Sin Bluetooth ni plugins.
 *   app-android      La app (Capacitor). Bluetooth, WiFi/LAN, iMin interna.
 *   app-ios          La app en iPhone/iPad. Bluetooth (BLE) y WiFi/LAN, sin iMin.
 *
 * La detección ya existía —`Capacitor.isNativePlatform()` en veinte archivos
 * y `isIminDevice()` en el servicio de impresión— pero la pestaña Impresora
 * no la usaba: mostraba los botones de Bluetooth en Chrome de escritorio y al
 * tocarlos devolvía "Not native platform". Acá se centraliza para que la
 * interfaz pregunte ANTES de ofrecer algo que no va a funcionar.
 */
import { Capacitor } from '@capacitor/core'
import { isIminDevice } from '@/services/thermalPrinterService'

export const esApp = () => Capacitor.isNativePlatform()
export const esAndroid = () => esApp() && Capacitor.getPlatform() === 'android'
export const esIOS = () => esApp() && Capacitor.getPlatform() === 'ios'

const UA_MOVIL = /Android|iPhone|iPad|iPod|Mobile/i

export const esMovilWeb = () =>
  !esApp() && typeof navigator !== 'undefined' && UA_MOVIL.test(navigator.userAgent)

export const esEscritorioWeb = () => !esApp() && !esMovilWeb()

/** 'app-android' | 'app-ios' | 'movil-web' | 'escritorio-web' */
export const contexto = () => {
  if (esAndroid()) return 'app-android'
  if (esIOS()) return 'app-ios'
  if (esMovilWeb()) return 'movil-web'
  return 'escritorio-web'
}

/** Texto para mostrarle al usuario dónde está. */
export const nombreDelContexto = () => ({
  'app-android': 'la app en Android',
  'app-ios': 'la app en iPhone',
  'movil-web': 'el navegador del celular',
  'escritorio-web': 'el navegador de la computadora',
})[contexto()]

/**
 * Si este aparato es una terminal iMin con impresora incorporada. Es async
 * porque pregunta al plugin nativo; en web devuelve false sin preguntar.
 */
export const tieneImpresoraInterna = async () => {
  if (!esAndroid()) return false
  try {
    return (await isIminDevice()) === true
  } catch {
    return false
  }
}
