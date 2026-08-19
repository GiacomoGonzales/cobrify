/**
 * Escaneo de códigos (QR y barras) con la cámara del dispositivo.
 *
 * La lógica vivía COPIADA en 9 pantallas (POS, Inventario, Productos,
 * Asistencia, movimientos de almacén…), cada una con su propia versión de las
 * dos trampas que tiene este plugin. Acá está una sola vez:
 *
 *  1. En Android, `installGoogleBarcodeScannerModule()` solo DISPARA la
 *     descarga. Llamar a `scan()` antes de que termine CRASHEA la app: hay que
 *     escuchar el evento de progreso y esperar el estado COMPLETED.
 *  2. En iOS ese módulo viene incluido con el plugin, y consultar las APIs de
 *     install/available rechaza con "Not implemented" — preguntarlo mostraba
 *     errores falsos al usuario.
 *
 * Solo funciona en la app instalada (Capacitor): en el navegador no hay plugin
 * nativo. Por eso `scannerDisponible()` — quien lo use debe ofrecer siempre una
 * alternativa escrita a mano, o el botón queda muerto en la web.
 */
import { Capacitor } from '@capacitor/core'

/** ¿Se puede abrir la cámara acá? Falso en el navegador. */
export const scannerDisponible = () => Capacitor.isNativePlatform()

const ESTADOS = { CANCELADO: 3, COMPLETADO: 4, FALLIDO: 5 }

/** Espera a que el módulo de escaneo de Android esté realmente instalado. */
async function asegurarModulo(BarcodeScanner, avisar) {
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
    if (available) return true
  } catch { /* si no se puede consultar, se intenta instalar igual */ }

  avisar?.info?.('Instalando módulo de escaneo (puede tardar unos segundos)…')

  return await new Promise((resolve) => {
    let listener = null
    let resuelto = false
    const terminar = (ok) => {
      if (resuelto) return
      resuelto = true
      try { listener?.remove?.() } catch { /* no-op */ }
      resolve(ok)
    }

    // Red de seguridad para conexiones lentas.
    const timeoutId = setTimeout(() => {
      avisar?.error?.('La instalación del módulo demoró demasiado. Intenta de nuevo con buena señal.')
      terminar(false)
    }, 60000)

    try {
      BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', (info) => {
        if (info.state === ESTADOS.COMPLETADO) {
          clearTimeout(timeoutId)
          terminar(true)
        } else if (info.state === ESTADOS.CANCELADO || info.state === ESTADOS.FALLIDO) {
          clearTimeout(timeoutId)
          avisar?.error?.('La instalación del módulo de escaneo falló. Verifica tu conexión.')
          terminar(false)
        }
      }).then((h) => { listener = h })

      BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {
        clearTimeout(timeoutId)
        avisar?.error?.('No se pudo iniciar la instalación del módulo de escaneo.')
        terminar(false)
      })
    } catch (err) {
      clearTimeout(timeoutId)
      console.error('Error al instalar el módulo de escaneo:', err)
      terminar(false)
    }
  })
}

/**
 * Abre la cámara y devuelve el contenido del código leído.
 *
 * @param {object} [opts]
 * @param {{info?:Function, success?:Function, error?:Function}} [opts.avisar]
 *        Toasts para la instalación del módulo (opcional).
 * @returns {Promise<string|null>} el contenido crudo del código, o null si el
 *          usuario cerró la cámara sin escanear (eso no es un error).
 * @throws {Error} con mensaje listo para mostrar al usuario
 */
export async function scanBarcode({ avisar } = {}) {
  if (!scannerDisponible()) {
    throw new Error('El escáner de cámara solo está disponible en la app instalada')
  }

  const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')

  const { camera } = await BarcodeScanner.checkPermissions()
  if (camera !== 'granted') {
    const { camera: reintento } = await BarcodeScanner.requestPermissions()
    if (reintento !== 'granted') throw new Error('Se necesita permiso de cámara')
  }

  if (Capacitor.getPlatform() === 'android') {
    const listo = await asegurarModulo(BarcodeScanner, avisar)
    if (!listo) throw new Error('El módulo de escaneo no está disponible. Reintenta en unos segundos.')
  }

  let resultado
  try {
    resultado = await BarcodeScanner.scan()
  } catch (err) {
    // Cerrar la cámara sin escanear es una decisión, no una falla.
    if (/cancel/i.test(err?.message || '')) return null
    console.error('Error al escanear:', err)
    throw new Error(err?.message || 'No se pudo abrir la cámara para escanear')
  } finally {
    await BarcodeScanner.stopScan().catch(() => {})
  }

  const codigo = resultado?.barcodes?.[0]?.rawValue
  if (!codigo) return null
  return codigo
}
