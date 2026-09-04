/**
 * CONFIGURACIÓN › IMPRESIÓN
 *
 * Cinco bloques ordenados por ALCANCE, no por tipo de papel:
 *
 *   1. Cómo imprime este equipo     — cambia según dónde corre la app (plataforma.js)
 *   2. Formato del comprobante      — del NEGOCIO (Firestore): igual en todos los equipos
 *   3. Ajustes de este equipo       — del APARATO (localStorage): cada uno guarda los suyos
 *   4. Impresora de caja compartida — del negocio, pero solo se configura desde la app
 *   5. Probar el lector de códigos
 *
 * La pestaña vieja no sabía dónde corría: mostraba los botones de Bluetooth en
 * Chrome de escritorio y al tocarlos devolvía "Not native platform". Ahora
 * pregunta ANTES de ofrecer algo que no va a funcionar. También detectaba si el
 * aparato era una terminal iMin (`isImin`) y después no lo usaba para nada; acá
 * ese dato gobierna el botón de impresora interna.
 *
 * Reglas de escritura:
 *   - Lo del negocio sale por `useGuardado` con SOLO los campos de esta pestaña.
 *   - Lo del aparato sale por `savePrinterConfig` (localStorage), al instante.
 *   - La única escritura directa a `businesses/{id}` es `persistSharedCajaPrinter`,
 *     movida tal cual: escribe `cajaPrinter` y actualiza la caché del servicio.
 */
import { useState, useEffect, useRef } from 'react'
import { Bluetooth, Wifi, Printer, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { doc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useGuardado } from '@/components/settings/useGuardado'
import { Seccion, Ajuste, Campo, Fila, Nota, BarraGuardar, Regulador, Separador } from '@/components/settings/kit'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import ScannerTester from '@/components/ScannerTester'
import { invalidateLogoCache } from '@/utils/pdfGenerator'
import { DEFAULT_NOTA_VENTA_LEGEND, NOTA_VENTA_LEGEND_MAX } from '@/utils/documentLegends'
import { contexto, esApp, esAndroid, nombreDelContexto, tieneImpresoraInterna } from '@/utils/plataforma'
import { esDominioReseller } from '@/utils/resellerDomain'
import {
  scanPrinters,
  connectPrinter,
  savePrinterConfig,
  getPrinterConfig,
  testPrinter,
  saveDocumentPrinterConfig,
  getDocumentPrinterConfig,
  setBusinessCajaPrinter,
} from '@/services/thermalPrinterService'

// Default 80mm para coincidir con el POS (ticketPaperWidth || 80) y con
// savePrinterConfig (paperWidth || 80). Antes era 58: si el usuario nunca elegía
// ancho, al activar un toggle web se persistía 58 y el POS pasaba a imprimir en
// 58mm sin querer.
const CONFIG_LOCAL_INICIAL = {
  enabled: false,
  address: '',
  name: '',
  type: 'bluetooth', // bluetooth, wifi o internal
  paperWidth: 80,
  webPrintLegible: false, // legacy; derivado de ticketFontSize
  ticketFontSize: 'small', // 'small' | 'medium' | 'large'
}

const CAJA_INICIAL = { enabled: false, ip: '', port: 9100, name: '', paperWidth: 58 }

const COLORES_PDF = [
  { color: '#464646', name: 'Gris oscuro' },
  { color: '#1E40AF', name: 'Azul' },
  { color: '#065F46', name: 'Verde' },
  { color: '#7C2D12', name: 'Marrón' },
  { color: '#581C87', name: 'Púrpura' },
  { color: '#0F172A', name: 'Negro' },
  { color: '#B91C1C', name: 'Rojo' },
  { color: '#0E7490', name: 'Cyan' },
]

const LETRAS_TICKET = [
  { key: 'small', label: 'Pequeña (estándar)' },
  { key: 'medium', label: 'Mediana (más legible)' },
  { key: 'large', label: 'Grande' },
]

const LETRAS_COMANDA = [
  { key: '', label: 'Igual al ticket' },
  { key: 'medium', label: 'Mediana (doble alto)' },
  { key: 'large', label: 'Grande (triple alto)' },
  { key: 'xlarge', label: 'Muy grande (cuádruple alto)' },
]

const CLASE_TEXTAREA =
  'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500'

/**
 * Lo del negocio, leído del documento `businesses/{id}`. Los valores por
 * defecto son los mismos que usaba la pestaña vieja al cargar (los códigos y
 * la descripción en cotizaciones nacen encendidos por retrocompatibilidad).
 */
function desdeNegocio(b = {}) {
  const rc = b.restaurantConfig || {}
  return {
    pdfAccentColor: b.pdfAccentColor || '#464646',
    pdfSpacious: b.pdfSpacious === true,
    pdfA5: b.pdfA5 === true,
    showProductCodeInQuotation: b.showProductCodeInQuotation === true,
    showProductCodeInInvoices: b.showProductCodeInInvoices !== false,
    showProductDescriptionInQuotation: b.showProductDescriptionInQuotation !== false,
    showProductDescriptionInInvoice: b.showProductDescriptionInInvoice === true,
    showImagesInQuotations: b.showImagesInQuotations === true,
    quotationImageScale: Number(b.quotationImageScale) || 100,
    showImagesInInvoices: b.showImagesInInvoices === true,
    invoiceImageScale: Number(b.invoiceImageScale) || 100,
    showBrandInInvoices: b.showBrandInInvoices === true,
    hideBatchAndExpiryInDocuments: b.hideBatchAndExpiryInDocuments === true,
    invoiceFooterTerms: b.invoiceFooterTerms || '',
    showTermsOnTicket: b.showTermsOnTicket === true,
    notaVentaLegend: b.notaVentaLegend || '',
    ticketFooterMessage: b.ticketFooterMessage || '',
    ticketQrEnabled: b.ticketQrEnabled === true,
    ticketQrContent: b.ticketQrContent || '',
    ticketQrCaption: b.ticketQrCaption || '',
    // Por defecto 'auto' (negocios viejos ya tienen ticketQrContent escrito).
    ticketQrMode: b.ticketQrMode === 'image' ? 'image' : 'auto',
    ticketQrImageUrl: b.ticketQrImageUrl || '',
    showProductsInCashClosure: b.showProductsInCashClosure === true,
    autoPrintTicket: b.autoPrintTicket === true,
    hideRucIgvInNotaVenta: b.hideRucIgvInNotaVenta === true,
    hideOnlyIgvInNotaVenta: b.hideOnlyIgvInNotaVenta === true,
    hideCompanyDataInNotaVenta: b.hideCompanyDataInNotaVenta === true,
    enableCustomerDisplay: b.enableCustomerDisplay === true,
    showCustomerDataOnKitchenTicket: b.showCustomerDataOnKitchenTicket === true,
    logoPrintScale: Number(b.logoPrintScale) || 100,
    companySlogan: b.companySlogan || '',
    autoPrintKitchenComanda: rc.autoPrintKitchenComanda !== false,
    autoPrintByStation: rc.autoPrintByStation === true,
    combineStationsOnWebPrint: rc.combineStationsOnWebPrint === true,
    // Solo lectura: decide si las dos opciones por estación tienen efecto.
    enableKitchenStations: rc.enableKitchenStations === true,
  }
}

/** Enlace a la tienda para el navegador del celular. Nulo en la app y en dominios de reseller. */
function enlaceTienda() {
  if (esApp() || esDominioReseller()) return null
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
  if (/android/i.test(ua)) return 'https://play.google.com/store/apps/details?id=com.factuya.cobrify'
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'https://apps.apple.com/pe/app/cobrify-peru/id6756195760'
  return null
}

/** Título de una subsección dentro de un bloque. Sin icono. */
function Subtitulo({ titulo, descripcion }) {
  return (
    <div className="pt-3">
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {descripcion && <p className="text-xs text-gray-500 mt-0.5">{descripcion}</p>}
    </div>
  )
}

export default function Impresion() {
  const { user, getBusinessId, isDemoMode, businessSettings, businessMode } = useAppContext()
  const toast = useToast()
  const { guardar, guardando } = useGuardado()

  // El id como string en las dependencias, nunca la función: el contexto la
  // recrea en cada render y el efecto de carga entraría en bucle.
  const businessId = getBusinessId()
  const ctx = contexto()
  const enApp = esApp()
  const esRestaurante = businessMode === 'restaurant'

  // ── Lo del NEGOCIO (bloque 2) ─────────────────────────────────────────────
  // Se copia UNA vez del contexto y de ahí en más el formulario manda: si el
  // contexto se refresca a mitad de una edición (lo hace cada guardado) no
  // se pisan los cambios que el usuario todavía no guardó.
  //
  // Una sola vez y con un ref, no con el estado: en modo demo
  // `useAppContext()` arma `businessSettings` como un objeto literal nuevo en
  // cada render, y un efecto que haga setState cada vez que cambia la
  // referencia entra en bucle infinito.
  const [negocio, setNegocio] = useState(null)
  const negocioInicializado = useRef(false)
  useEffect(() => {
    if (negocioInicializado.current || !businessSettings) return
    negocioInicializado.current = true
    setNegocio(desdeNegocio(businessSettings))
  }, [businessSettings])
  const cambiar = (patch) => setNegocio((prev) => ({ ...prev, ...patch }))

  const [ticketQrImageFile, setTicketQrImageFile] = useState(null)
  const [uploadingQrImage, setUploadingQrImage] = useState(false)

  // ── Lo del APARATO (bloques 1 y 3) ────────────────────────────────────────
  const [printerConfig, setPrinterConfig] = useState(CONFIG_LOCAL_INICIAL)
  // Hasta que la config local no está cargada no se muestran sus controles:
  // cada guardado local parte del estado completo, y guardar con el estado
  // de fábrica pisaría lo que el equipo ya tenía (el ancho, por ejemplo).
  const [configLocalLista, setConfigLocalLista] = useState(false)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const local = await getPrinterConfig(businessId)
      if (!vivo) return
      if (local.success && local.config) {
        setPrinterConfig((prev) => ({ ...prev, ...local.config }))
      }
      setConfigLocalLista(true)
    })()
    return () => {
      vivo = false
    }
  }, [businessId])

  // Terminal iMin con impresora incorporada. En web devuelve false sin preguntar.
  const [isImin, setIsImin] = useState(false)
  useEffect(() => {
    let vivo = true
    tieneImpresoraInterna().then((v) => {
      if (vivo) setIsImin(v)
    })
    return () => {
      vivo = false
    }
  }, [])

  const [availablePrinters, setAvailablePrinters] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [showManualConnect, setShowManualConnect] = useState(false)
  const [showWifiConnect, setShowWifiConnect] = useState(false)
  const [wifiIp, setWifiIp] = useState('')
  const [wifiPort, setWifiPort] = useState('9100')
  const [wifiName, setWifiName] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [manualName, setManualName] = useState('')

  // ── Impresora de caja compartida (bloque 4) ───────────────────────────────
  const [documentPrinterConfig, setDocumentPrinterConfig] = useState(CAJA_INICIAL)
  const [docPrinterIp, setDocPrinterIp] = useState('')
  const [docPrinterPort, setDocPrinterPort] = useState('9100')
  const [docPrinterName, setDocPrinterName] = useState('')
  const [showDocPrinterForm, setShowDocPrinterForm] = useState(false)
  const [isConnectingDocPrinter, setIsConnectingDocPrinter] = useState(false)
  const [isTestingDocPrinter, setIsTestingDocPrinter] = useState(false)

  // Prioridad: la COMPARTIDA del negocio (Firestore); si no, la local del equipo.
  // En demo no hay caja compartida y `businessSettings` es un literal nuevo por
  // render: sin esta salida, un `cajaPrinter` en ese literal haría setState en
  // cada render (bucle infinito).
  const cajaDelNegocio = businessSettings?.cajaPrinter
  useEffect(() => {
    if (isDemoMode) return
    if (cajaDelNegocio) {
      setDocumentPrinterConfig(cajaDelNegocio)
      setBusinessCajaPrinter(cajaDelNegocio.enabled ? cajaDelNegocio : null)
      // CRÍTICO: espejar en localStorage. El servicio de impresión
      // (getDocumentPrinterConfig, usado al imprimir desde Ventas/POS) lee de
      // localStorage, NO del estado de React. Sin esto, un dispositivo que solo
      // CARGA la config compartida (no la configuró él) tenía el "Probar" OK
      // (lee estado) pero Ventas no imprimía nada (localStorage vacío → cae en
      // "Printer not connected" sin error visible).
      saveDocumentPrinterConfig(cajaDelNegocio)
    } else {
      const savedDocPrinter = getDocumentPrinterConfig()
      if (savedDocPrinter) {
        setDocumentPrinterConfig(savedDocPrinter)
      }
    }
  }, [cajaDelNegocio, isDemoMode])

  // ── Tamaño de hoja: dos flags detrás de un solo selector ──────────────────
  // `a4SheetPrint` (localStorage) hace que el ticket y la comanda que imprime
  // el NAVEGADOR salgan en una hoja A4 en vez de un rollo de 58/80 mm: es una
  // decisión de ESTE equipo (la impresora de tinta está enchufada acá).
  // `pdfA5` (Firestore) hace que los PDF de boletas, facturas y notas se
  // generen en A5: es del NEGOCIO, porque el PDF se genera igual en todos los
  // equipos. Son dos cosas distintas que el usuario vive como una sola
  // pregunta —"¿en qué hoja imprimo?"—, así que se eligen juntas y se
  // escriben cada una en su lugar al guardar. Si por herencia los dos flags
  // están encendidos, manda A4 y al guardar queda uno solo.
  const [hojaElegida, setHojaElegida] = useState(null)
  const hoja = hojaElegida ?? (printerConfig.a4SheetPrint ? 'a4' : negocio?.pdfA5 ? 'a5' : 'ticket')

  // ── Handlers de conexión (movidos tal cual de Settings.jsx) ───────────────
  const handleScanPrinters = async () => {
    setIsScanning(true)
    try {
      const result = await scanPrinters()
      if (result.success) {
        setAvailablePrinters(result.devices)
        toast.success(`${result.devices.length} impresoras encontradas`)
      } else {
        toast.error(result.error || 'Error al escanear impresoras')
      }
    } catch (error) {
      console.error('Error scanning printers:', error)
      toast.error('Error al escanear impresoras')
    } finally {
      setIsScanning(false)
    }
  }

  // ── Conectar una impresora: un solo camino para los tres tipos ────────────
  //
  // Conectar solo sabe de la CONEXIÓN: si está encendida, dónde está, cómo se
  // llama y de qué tipo es. No sabe nada de las opciones del ticket, así que
  // manda únicamente esos campos y `savePrinterConfig` (que hace merge)
  // conserva en el equipo todo lo demás.
  //
  // Lo que faltaba era la PANTALLA. Los tres handlers reemplazaban el estado
  // por ese objeto de cuatro campos, y los ocho interruptores del ticket
  // —"Unidad de medida" entre ellos— quedaban dibujados en apagado aunque en
  // el equipo siguieran encendidos. Carmen (JC&AN) tiene ticketera de red, que
  // se reconecta seguido: entraba a Configuración, veía la unidad de medida
  // apagada y la volvía a activar TODOS LOS DÍAS. El arreglo del 02-sep-2026
  // salvó el ticket, pero ella seguía viendo la casilla caída.
  //
  // Por eso el estado se RELEE de lo guardado en vez de fusionarse contra sí
  // mismo: si la config todavía no terminó de cargar, el estado trae los
  // valores de fábrica y fusionarlo pisaría el ancho guardado con 80.
  const conectarImpresora = async (datosDeConexion) => {
    await savePrinterConfig(getBusinessId(), datosDeConexion)
    const guardado = await getPrinterConfig(getBusinessId())
    if (guardado.success && guardado.config) setPrinterConfig(guardado.config)
    else setPrinterConfig((prev) => ({ ...prev, ...datosDeConexion }))
  }

  const handleConnectPrinter = async (printerAddress, printerName) => {
    setIsConnecting(true)
    try {
      const result = await connectPrinter(printerAddress)
      if (result.success) {
        await conectarImpresora({
          enabled: true,
          address: printerAddress,
          name: printerName,
          type: 'bluetooth',
        })
        toast.success('Impresora conectada exitosamente')
      } else {
        toast.error(result.error || 'Error al conectar impresora')
      }
    } catch (error) {
      console.error('Error connecting printer:', error)
      toast.error('Error al conectar impresora')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleChangePaperWidth = async (newWidth) => {
    try {
      await guardarLocal({ paperWidth: parseInt(newWidth) }, `Ancho de papel actualizado a ${newWidth}mm`)
    } catch (error) {
      console.error('Error updating paper width:', error)
      toast.error('Error al actualizar ancho de papel')
    }
  }

  const handleTestPrinter = async () => {
    setIsTesting(true)
    try {
      // Primero reconectar a la impresora guardada
      console.log('Reconectando a impresora:', printerConfig.address)
      if (printerConfig.address) {
        const connectResult = await connectPrinter(printerConfig.address)
        console.log('Resultado de conexión:', connectResult)

        if (!connectResult.success) {
          toast.error('No se pudo conectar a la impresora: ' + (connectResult.error || 'Error desconocido'))
          setIsTesting(false)
          return
        }
      }

      // El ancho de la PRUEBA tiene que ser el mismo con el que va a salir un
      // ticket de verdad, o la prueba no prueba nada. El POS lo lee FRESCO de la
      // configuración guardada y cae a 80 (POS.jsx ~8974); acá se usaba el
      // estado de React con `|| 58`, así que con el estado sin cargar la prueba
      // salía a 58 mientras las ventas salían a 80 — y el usuario diagnosticaba
      // un problema de impresora que no existía.
      const guardada = await getPrinterConfig(getBusinessId())
      const anchoDePrueba = guardada?.config?.paperWidth || printerConfig.paperWidth || 80
      console.log('Llamando a testPrinter con ancho:', anchoDePrueba)

      // Agregar timeout de 30 segundos
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: La impresión tardó demasiado')), 30000)
      )

      const result = await Promise.race([testPrinter(anchoDePrueba), timeoutPromise])

      console.log('Resultado de testPrinter:', result)

      if (result.success) {
        toast.success('Impresión de prueba enviada')
      } else {
        toast.error(result.error || 'Error al imprimir prueba')
      }
    } catch (error) {
      console.error('Error en handleTestPrinter:', error)
      toast.error(error.message || 'Error al imprimir prueba')
    } finally {
      setIsTesting(false)
    }
  }

  const handleDisablePrinter = async () => {
    try {
      await guardarLocal({ enabled: false }, 'Impresora deshabilitada')
    } catch (error) {
      console.error('Error disabling printer:', error)
      toast.error('Error al deshabilitar impresora')
    }
  }

  const handleManualConnect = async () => {
    if (!manualAddress.trim()) {
      toast.error('Ingresa la dirección MAC de la impresora')
      return
    }

    // Validar formato de dirección MAC (XX:XX:XX:XX:XX:XX)
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    if (!macRegex.test(manualAddress.trim())) {
      toast.error('Formato de dirección MAC inválido. Usa el formato XX:XX:XX:XX:XX:XX')
      return
    }

    await handleConnectPrinter(manualAddress.trim(), manualName.trim() || 'Impresora Manual')
    setShowManualConnect(false)
    setManualAddress('')
    setManualName('')
  }

  // Conectar impresora WiFi/LAN
  const handleWifiConnect = async () => {
    if (!wifiIp.trim()) {
      toast.error('Ingresa la dirección IP de la impresora')
      return
    }

    // Validar formato de IP
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(wifiIp.trim())) {
      toast.error('Formato de IP inválido. Usa el formato XXX.XXX.XXX.XXX')
      return
    }

    // Validar puerto
    const port = parseInt(wifiPort, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error('Puerto inválido. Debe ser un número entre 1 y 65535')
      return
    }

    setIsConnecting(true)
    try {
      // Construir dirección con puerto
      const address = `${wifiIp.trim()}:${port}`
      const result = await connectPrinter(address)

      if (result.success) {
        await conectarImpresora({
          enabled: true,
          address: address,
          name: wifiName.trim() || 'Impresora WiFi',
          type: 'wifi',
        })

        toast.success('Impresora WiFi conectada exitosamente')
        setShowWifiConnect(false)
        setWifiIp('')
        setWifiPort('9100')
        setWifiName('')
      } else {
        toast.error(result.error || 'Error al conectar impresora WiFi')
      }
    } catch (error) {
      console.error('Error connecting WiFi printer:', error)
      toast.error('Error al conectar impresora WiFi')
    } finally {
      setIsConnecting(false)
    }
  }

  // Conectar impresora interna iMin
  const handleInternalConnect = async () => {
    setIsConnecting(true)
    try {
      // Primero verificar si es dispositivo iMin y mostrar info
      let deviceInfo = null
      try {
        const { IminPrinter } = await import('@capacitor/core').then((m) => ({ IminPrinter: m.registerPlugin('IminPrinter') }))
        deviceInfo = await IminPrinter.isIminDevice()
        console.log('Device info:', JSON.stringify(deviceInfo))
      } catch (e) {
        console.warn('Error checking device:', e)
      }

      if (deviceInfo && !deviceInfo.isImin) {
        toast.error(
          `No es dispositivo iMin. Marca: ${deviceInfo.manufacturer}, Modelo: ${deviceInfo.model}`,
          { duration: 6000 }
        )
        // Intentar conectar igual para ver los logs
        console.log('No es iMin pero intentando conectar para debug...')
      }

      const result = await connectPrinter('internal')

      if (result.success) {
        await conectarImpresora({
          enabled: true,
          address: 'internal',
          name: 'Impresora Interna iMin',
          type: 'internal',
        })
        toast.success('Impresora interna conectada exitosamente')
      } else {
        toast.error(result.error || 'Error al conectar impresora interna')
      }
    } catch (error) {
      console.error('Error connecting internal printer:', error)
      toast.error(`Error: ${error.message || 'Error al conectar impresora interna'}`, { duration: 6000 })
    } finally {
      setIsConnecting(false)
    }
  }

  // ── Impresora de caja compartida (movido tal cual) ────────────────────────
  // Persiste la Impresora de Caja COMPARTIDA por negocio (Firestore) + cache del servicio,
  // para que TODOS los dispositivos impriman los comprobantes en la misma caja.
  // Es la única escritura directa a businesses/{id} de esta pestaña: escribe
  // un solo campo (`cajaPrinter`) y está permitida por contrato.
  const persistSharedCajaPrinter = async (config) => {
    try {
      await setDoc(doc(db, 'businesses', getBusinessId()), { cajaPrinter: config }, { merge: true })
    } catch (e) {
      console.warn('No se pudo guardar la impresora de caja compartida:', e)
    }
    try {
      setBusinessCajaPrinter(config?.enabled ? config : null)
    } catch (e) {
      void e
    }
  }

  // Conectar impresora de documentos (precuentas y boletas)
  const handleDocPrinterConnect = async () => {
    if (!docPrinterIp.trim()) {
      toast.error('Ingresa la dirección IP de la impresora de documentos')
      return
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(docPrinterIp.trim())) {
      toast.error('Formato de IP inválido. Usa el formato XXX.XXX.XXX.XXX')
      return
    }

    const port = parseInt(docPrinterPort, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error('Puerto inválido. Debe ser un número entre 1 y 65535')
      return
    }

    setIsConnectingDocPrinter(true)
    try {
      // Probar conexión temporal
      const { registerPlugin } = await import('@capacitor/core')
      const TcpPrinter = registerPlugin('TcpPrinter')

      const connectResult = await TcpPrinter.connect({ ip: docPrinterIp.trim(), port })
      if (!connectResult?.success) {
        toast.error('No se pudo conectar a la impresora de documentos')
        return
      }

      // Desconectar después de probar
      try {
        await TcpPrinter.disconnect()
      } catch {
        /* ignore */
      }

      // Reconectar impresora principal si estaba conectada
      if (printerConfig.enabled && printerConfig.address && printerConfig.type === 'wifi') {
        try {
          await connectPrinter(printerConfig.address)
        } catch (e) {
          console.warn('Error al reconectar impresora principal:', e)
        }
      }

      // Guardar configuración
      const newConfig = {
        enabled: true,
        ip: docPrinterIp.trim(),
        port,
        name: docPrinterName.trim() || 'Impresora de Documentos',
        // Mismo criterio que la impresora principal: el ancho solo se manda si
        // se sabe. Con `|| 58`, conectar con el estado sin cargar lo forzaba.
        ...(documentPrinterConfig.paperWidth ? { paperWidth: documentPrinterConfig.paperWidth } : {}),
      }
      setDocumentPrinterConfig(newConfig)
      saveDocumentPrinterConfig(newConfig)
      await persistSharedCajaPrinter(newConfig)

      toast.success('Impresora de Caja configurada (compartida con todos los dispositivos)')
      setShowDocPrinterForm(false)
      setDocPrinterIp('')
      setDocPrinterPort('9100')
      setDocPrinterName('')
    } catch (error) {
      console.error('Error connecting document printer:', error)
      toast.error('Error al conectar impresora de documentos: ' + (error.message || ''))
    } finally {
      setIsConnectingDocPrinter(false)
    }
  }

  // Probar impresora de documentos
  const handleTestDocPrinter = async () => {
    if (!documentPrinterConfig.enabled || !documentPrinterConfig.ip) {
      toast.error('No hay impresora de documentos configurada')
      return
    }

    setIsTestingDocPrinter(true)
    try {
      const { registerPlugin } = await import('@capacitor/core')
      const TcpPrinter = registerPlugin('TcpPrinter')

      const ip = documentPrinterConfig.ip
      const port = documentPrinterConfig.port || 9100

      const connectResult = await TcpPrinter.connect({ ip, port })
      if (!connectResult?.success) {
        toast.error('No se pudo conectar a la impresora de documentos')
        return
      }

      // Construir ticket de prueba con ESC/POS
      // Usar un array de bytes simple para la prueba
      const ESC = 0x1b
      const GS = 0x1d
      const bytes = [
        ESC, 0x40, // Init
        ESC, 0x61, 0x01, // Center
        ESC, 0x45, 0x01, // Bold ON
      ]
      const title = 'PRUEBA IMPRESORA DOCUMENTOS'
      for (let i = 0; i < title.length; i++) bytes.push(title.charCodeAt(i))
      bytes.push(0x0a) // newline
      bytes.push(ESC, 0x45, 0x00) // Bold OFF
      const line = '------------------------'
      for (let i = 0; i < line.length; i++) bytes.push(line.charCodeAt(i))
      bytes.push(0x0a)
      const msg = 'Impresora de documentos'
      for (let i = 0; i < msg.length; i++) bytes.push(msg.charCodeAt(i))
      bytes.push(0x0a)
      const msg2 = 'configurada correctamente'
      for (let i = 0; i < msg2.length; i++) bytes.push(msg2.charCodeAt(i))
      bytes.push(0x0a)
      const msg3 = `IP: ${ip}:${port}`
      for (let i = 0; i < msg3.length; i++) bytes.push(msg3.charCodeAt(i))
      bytes.push(0x0a)
      for (let i = 0; i < line.length; i++) bytes.push(line.charCodeAt(i))
      bytes.push(0x0a)
      bytes.push(ESC, 0x64, 0x03) // Feed 3
      bytes.push(GS, 0x56, 0x00) // Cut

      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64Data = btoa(binary)

      await TcpPrinter.print({ data: base64Data })

      try {
        await TcpPrinter.disconnect()
      } catch {
        /* ignore */
      }

      // Reconectar impresora principal si estaba conectada
      if (printerConfig.enabled && printerConfig.address && printerConfig.type === 'wifi') {
        try {
          await connectPrinter(printerConfig.address)
        } catch (e) {
          console.warn('Error al reconectar impresora principal:', e)
        }
      }

      toast.success('Prueba enviada a impresora de documentos')
    } catch (error) {
      console.error('Error testing document printer:', error)
      toast.error('Error al probar impresora de documentos: ' + (error.message || ''))
    } finally {
      setIsTestingDocPrinter(false)
    }
  }

  // Deshabilitar impresora de caja
  const handleDisableDocPrinter = async () => {
    const newConfig = { enabled: false, ip: '', port: 9100, name: '', paperWidth: 58 }
    setDocumentPrinterConfig(newConfig)
    saveDocumentPrinterConfig(newConfig)
    await persistSharedCajaPrinter(newConfig)
    setShowDocPrinterForm(false)
    toast.success('Impresora de Caja deshabilitada')
  }

  // Cambiar ancho de papel de la impresora de caja
  const handleDocPaperWidth = async (newWidth) => {
    const newConfig = { ...documentPrinterConfig, paperWidth: parseInt(newWidth) }
    setDocumentPrinterConfig(newConfig)
    saveDocumentPrinterConfig(newConfig)
    await persistSharedCajaPrinter(newConfig)
    toast.success(`Ancho de papel de la Impresora de Caja actualizado a ${newWidth}mm`)
  }

  // ── Ajustes de este equipo: un solo camino de guardado ────────────────────
  // Cada interruptor de la pestaña vieja repetía lo mismo: copiar el estado,
  // cambiar un campo, guardar en localStorage y avisar. Es un solo lugar.
  // Se guarda SOLO el campo que se tocó, no la pantalla entera.
  //
  // Mandar `{ ...printerConfig, ...patch }` volvía a afirmar los ocho ajustes
  // en cada clic, con los valores que esta pestaña tenía cargados. Si la config
  // había cambiado en otra parte —otra pestaña, otra PC, una reconexión—, tocar
  // un interruptor pisaba los demás con lo viejo, y un `false` explícito sí
  // vence al merge de `savePrinterConfig`. Con el patch solo, lo que no se tocó
  // ni se nombra.
  const guardarLocal = async (patch, mensaje) => {
    await savePrinterConfig(getBusinessId(), patch)
    setPrinterConfig((prev) => ({ ...prev, ...patch }))
    if (mensaje) toast.success(mensaje)
  }

  const cambiarLetraTicket = (key) =>
    guardarLocal(
      {
        ticketFontSize: key,
        webPrintLegible: key !== 'small', // legacy: medium/large => legible
        ...(key !== 'small' && { compactPrint: false }), // incompatible con compacto
      },
      `Tamaño de letra: ${LETRAS_TICKET.find((o) => o.key === key)?.label || key}`
    )

  // ── QR del ticket (movido tal cual) ───────────────────────────────────────
  // Subir imagen del QR para el ticket. Mismo flujo que el logo: valida
  // tipo/tamaño, muestra preview con FileReader, y deja el File en
  // ticketQrImageFile para subirlo a Storage al hacer "Guardar".
  const handleQrImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('El archivo debe ser una imagen (JPG, PNG o WEBP)')
      return
    }

    // Max 2MB (mismo límite que el logo). QR es una imagen simple, no
    // necesita más.
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 2MB')
      return
    }

    setTicketQrImageFile(file)

    // Preview con data URL (no se sube hasta Guardar).
    const reader = new FileReader()
    reader.onload = (ev) => {
      cambiar({ ticketQrImageUrl: ev.target.result })
    }
    reader.readAsDataURL(file)
  }

  // Quita la imagen del QR (storage + Firestore) y limpia el preview. Antes
  // hacía un setDoc directo; ahora el campo pasa por el guardado común, que
  // respeta el modo demo y refresca el contexto.
  const handleRemoveQrImage = async () => {
    if (!user?.uid) return

    try {
      // Si la URL apunta a Firebase Storage, intentar eliminar el blob.
      if (negocio?.ticketQrImageUrl && negocio.ticketQrImageUrl.includes('firebase')) {
        try {
          const qrRef = ref(storage, `businesses/${getBusinessId()}/ticket-qr`)
          await deleteObject(qrRef)
        } catch (error) {
          console.log('No se pudo eliminar la imagen del QR anterior:', error)
        }
      }

      const ok = await guardar({ ticketQrImageUrl: null }, 'Imagen del QR eliminada')
      if (ok) {
        cambiar({ ticketQrImageUrl: '' })
        setTicketQrImageFile(null)
      }
    } catch (error) {
      console.error('Error al eliminar imagen del QR:', error)
      toast.error('No se pudo eliminar la imagen del QR')
    }
  }

  // ── Guardar el formato del comprobante (bloque 2) ─────────────────────────
  const guardarFormato = async () => {
    if (!negocio) return

    // La imagen del QR se sube ANTES de escribir, para que la URL quede en la
    // misma escritura. Si la subida falla se conserva la URL que ya había:
    // la vista previa es un data URL enorme y no tiene que llegar a Firestore.
    let urlQr = negocio.ticketQrImageUrl
    if (!isDemoMode && ticketQrImageFile && negocio.ticketQrMode === 'image') {
      setUploadingQrImage(true)
      try {
        const qrRef = ref(storage, `businesses/${getBusinessId()}/ticket-qr`)
        await uploadBytes(qrRef, ticketQrImageFile)
        urlQr = await getDownloadURL(qrRef)
        invalidateLogoCache()
      } catch (qrError) {
        console.error('Error al subir imagen del QR:', qrError)
        toast.error('No se pudo subir la imagen del QR. Se guarda el resto de la configuración.')
        urlQr = businessSettings?.ticketQrImageUrl || ''
      } finally {
        setUploadingQrImage(false)
      }
    }

    const ok = await guardar(
      {
        // Comprobantes en PDF
        pdfAccentColor: negocio.pdfAccentColor,
        pdfSpacious: negocio.pdfSpacious === true,
        pdfA5: hoja === 'a5',
        showProductCodeInQuotation: negocio.showProductCodeInQuotation === true,
        showProductCodeInInvoices: negocio.showProductCodeInInvoices === true,
        showProductDescriptionInQuotation: negocio.showProductDescriptionInQuotation === true,
        showProductDescriptionInInvoice: negocio.showProductDescriptionInInvoice === true,
        showImagesInQuotations: negocio.showImagesInQuotations === true,
        quotationImageScale: Number(negocio.quotationImageScale) || 100,
        showImagesInInvoices: negocio.showImagesInInvoices === true,
        invoiceImageScale: Number(negocio.invoiceImageScale) || 100,
        showBrandInInvoices: negocio.showBrandInInvoices === true,
        hideBatchAndExpiryInDocuments: negocio.hideBatchAndExpiryInDocuments === true,
        invoiceFooterTerms: negocio.invoiceFooterTerms || '',
        companySlogan: negocio.companySlogan || '',
        // Ticket térmico
        ticketFooterMessage: negocio.ticketFooterMessage || '',
        notaVentaLegend: negocio.notaVentaLegend.trim() || '',
        showTermsOnTicket: negocio.showTermsOnTicket === true,
        logoPrintScale: Number(negocio.logoPrintScale) || 100,
        ticketQrEnabled: negocio.ticketQrEnabled === true,
        ticketQrContent: negocio.ticketQrContent || '',
        ticketQrCaption: negocio.ticketQrCaption || '',
        ticketQrMode: negocio.ticketQrMode === 'image' ? 'image' : 'auto',
        ticketQrImageUrl: urlQr || null,
        // Notas de venta
        hideRucIgvInNotaVenta: negocio.hideRucIgvInNotaVenta === true,
        hideOnlyIgvInNotaVenta: negocio.hideOnlyIgvInNotaVenta === true,
        hideCompanyDataInNotaVenta: negocio.hideCompanyDataInNotaVenta === true,
        // Al vender
        autoPrintTicket: negocio.autoPrintTicket === true,
        showProductsInCashClosure: negocio.showProductsInCashClosure === true,
        enableCustomerDisplay: negocio.enableCustomerDisplay === true,
        // Comandas. Con `merge: true` Firestore fusiona el mapa clave por
        // clave: no pisa lo que Punto de venta guarda en restaurantConfig.
        ...(esRestaurante
          ? {
              showCustomerDataOnKitchenTicket: negocio.showCustomerDataOnKitchenTicket === true,
              restaurantConfig: {
                autoPrintKitchenComanda: negocio.autoPrintKitchenComanda !== false,
                autoPrintByStation: negocio.autoPrintByStation === true,
                combineStationsOnWebPrint: negocio.combineStationsOnWebPrint === true,
              },
            }
          : {}),
      },
      'Impresión guardada'
    )
    if (!ok) return

    setTicketQrImageFile(null)
    cambiar({ ticketQrImageUrl: urlQr, pdfA5: hoja === 'a5' })

    // La mitad local del tamaño de hoja (ver el comentario de `hoja`).
    const a4SheetPrint = hoja === 'a4'
    if (a4SheetPrint !== (printerConfig.a4SheetPrint === true)) {
      await guardarLocal({ a4SheetPrint })
    }
  }

  // ── Piezas que se repiten ─────────────────────────────────────────────────
  const conectada = printerConfig.enabled && printerConfig.address
  const cajaConfigurada = documentPrinterConfig.enabled && documentPrinterConfig.ip
  const tipoConexion =
    printerConfig.type === 'internal' ? 'impresora interna' : printerConfig.type === 'wifi' ? 'WiFi o red' : 'Bluetooth'

  const selectorAncho = (
    <Campo
      id="opcion-paperWidth"
      etiqueta="Ancho del rollo"
      ayuda="El ancho del papel de tu ticketera. Con el valor equivocado el ticket sale cortado o con la mitad de la hoja en blanco."
    >
      <Select
        value={String(printerConfig.paperWidth || 80)}
        onChange={(e) => handleChangePaperWidth(e.target.value)}
        className="sm:max-w-xs"
      >
        <option value="58">58 mm (ticketeras pequeñas)</option>
        <option value="80">80 mm (estándar: Epson y similares)</option>
      </Select>
    </Campo>
  )

  const tienda = ctx === 'movil-web' ? enlaceTienda() : null

  return (
    <div className="space-y-8">
      {/* ── 1. Cómo imprime este equipo ─────────────────────────────────── */}
      <Seccion titulo="Cómo imprime este equipo" descripcion={`Estás en ${nombreDelContexto()}.`}>
        {ctx === 'escritorio-web' && (
          <>
            <p className="text-sm text-gray-700">
              Este equipo imprime por el diálogo de Windows o macOS: al imprimir un ticket se
              abre la ventana del sistema y ahí eliges la impresora. No hay nada que conectar
              desde acá.
            </p>
            {configLocalLista && selectorAncho}
            <Nota>
              Si esta computadora tiene una ticketera USB, puedes compartirla con las tablets:
              la carpeta <code>scripts/puente-impresion</code> trae el programa y las
              instrucciones.
            </Nota>
          </>
        )}

        {ctx === 'movil-web' && (
          <>
            <p className="text-sm text-gray-700">
              Desde el navegador se imprime por el diálogo del sistema. Para usar una ticketera
              Bluetooth, instala la app.
            </p>
            {tienda && (
              <a
                href={tienda}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              >
                Instalar la app
              </a>
            )}
          </>
        )}

        {enApp && (
          <>
            <Nota>
              Qué imprime cada impresora: la principal (esta) saca los tickets de venta, las
              precuentas y las comandas si no usas estaciones. La impresora de caja, más abajo,
              saca los comprobantes y las precuentas. Las de cocina y bar se configuran en
              Ventas, en Estaciones de cocina.
            </Nota>

            {!configLocalLista ? (
              <p className="text-sm text-gray-500">Cargando la configuración de este equipo...</p>
            ) : conectada ? (
              <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{printerConfig.name || 'Impresora térmica'}</p>
                  <p className="text-sm text-gray-600 break-all">
                    Conectada por {tipoConexion}
                    {printerConfig.type !== 'internal' && ` · ${printerConfig.address}`}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" size="sm" onClick={handleTestPrinter} disabled={isTesting}>
                    {isTesting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Imprimiendo...
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4 mr-2" />
                        Probar
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDisablePrinter}>
                    Deshabilitar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {/* Solo en terminales iMin: antes el botón salía en cualquier
                      Android y en los demás devolvía "No es dispositivo iMin". */}
                  {isImin && (
                    <Button onClick={handleInternalConnect} disabled={isConnecting}>
                      {isConnecting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Conectando...
                        </>
                      ) : (
                        'Impresora interna'
                      )}
                    </Button>
                  )}
                  <Button onClick={handleScanPrinters} disabled={isScanning}>
                    {isScanning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Bluetooth className="w-4 h-4 mr-2" />
                        Buscar por Bluetooth
                      </>
                    )}
                  </Button>
                  {/* La dirección MAC existe solo en Android: iPhone identifica
                      los aparatos Bluetooth de otra forma y no la expone. */}
                  {esAndroid() && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowManualConnect(!showManualConnect)
                        setShowWifiConnect(false)
                      }}
                    >
                      {showManualConnect ? 'Cancelar' : 'Dirección MAC a mano'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowWifiConnect(!showWifiConnect)
                      setShowManualConnect(false)
                    }}
                  >
                    {showWifiConnect ? (
                      'Cancelar'
                    ) : (
                      <>
                        <Wifi className="w-4 h-4 mr-2" />
                        WiFi o red (LAN)
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-sm text-gray-500">
                  {showManualConnect
                    ? 'Escribe la dirección MAC de tu impresora Bluetooth.'
                    : showWifiConnect
                      ? 'Conecta la ticketera por la red WiFi o por cable.'
                      : 'Enciende la ticketera y busca por Bluetooth. Si es de red, entra por WiFi o red (LAN).'}
                </p>

                {showWifiConnect && (
                  <div className="p-4 border border-gray-200 rounded-lg space-y-4">
                    <p className="text-sm text-gray-600">
                      La impresora debe estar en la misma red que este equipo. Las ticketeras
                      suelen usar el puerto 9100.
                    </p>
                    <Fila>
                      <Campo
                        etiqueta="Dirección IP"
                        ayuda="Mantén presionado el botón FEED al encender la impresora: imprime una hoja de autotest con su IP. O revisa su configuración de red."
                      >
                        <Input
                          type="text"
                          placeholder="192.168.1.100"
                          value={wifiIp}
                          onChange={(e) => setWifiIp(e.target.value)}
                          className="font-mono"
                        />
                      </Campo>
                      <Campo etiqueta="Puerto">
                        <Input
                          type="text"
                          placeholder="9100"
                          value={wifiPort}
                          onChange={(e) => setWifiPort(e.target.value.replace(/\D/g, ''))}
                          className="font-mono"
                        />
                      </Campo>
                    </Fila>
                    <Campo etiqueta="Nombre (opcional)">
                      <Input
                        type="text"
                        placeholder="Impresora Cocina"
                        value={wifiName}
                        onChange={(e) => setWifiName(e.target.value)}
                      />
                    </Campo>
                    <Button onClick={handleWifiConnect} disabled={isConnecting || !wifiIp.trim()} className="w-full">
                      {isConnecting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Conectando...
                        </>
                      ) : (
                        'Conectar por WiFi'
                      )}
                    </Button>
                  </div>
                )}

                {showManualConnect && (
                  <div className="p-4 border border-gray-200 rounded-lg space-y-4">
                    <Campo
                      etiqueta="Dirección MAC de la impresora"
                      ayuda="Formato 00:11:22:AA:BB:CC. La encuentras en Configuración, Bluetooth, tocando el detalle de la impresora emparejada."
                    >
                      <Input
                        type="text"
                        placeholder="XX:XX:XX:XX:XX:XX"
                        value={manualAddress}
                        onChange={(e) => setManualAddress(e.target.value.toUpperCase())}
                        className="font-mono"
                      />
                    </Campo>
                    <Campo etiqueta="Nombre (opcional)">
                      <Input
                        type="text"
                        placeholder="Mi impresora térmica"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                      />
                    </Campo>
                    <Button onClick={handleManualConnect} disabled={isConnecting || !manualAddress.trim()} className="w-full">
                      {isConnecting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Conectando...
                        </>
                      ) : (
                        'Conectar impresora Bluetooth'
                      )}
                    </Button>
                  </div>
                )}

                {availablePrinters.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-2">
                      Impresoras encontradas ({availablePrinters.length})
                    </p>
                    <div className="space-y-2">
                      {availablePrinters.map((printer) => (
                        <div
                          key={printer.address}
                          className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{printer.name || 'Impresora sin nombre'}</p>
                            <p className="text-xs text-gray-500 break-all">{printer.address}</p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleConnectPrinter(printer.address, printer.name)}
                            disabled={isConnecting}
                          >
                            {isConnecting ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Conectando...
                              </>
                            ) : (
                              'Conectar'
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  Compatible con impresoras térmicas ESC/POS de 58 y 80 mm (Epson, Star, Bixolon
                  y otras marcas compatibles con ESC/POS).
                </p>
              </div>
            )}
          </>
        )}
      </Seccion>

      <Separador />

      {/* ── 2. Formato del comprobante (del negocio) ────────────────────── */}
      <Seccion titulo="Formato del comprobante" descripcion="Se aplica a todo el negocio, en todos los equipos.">
        {!negocio ? (
          <p className="text-sm text-gray-500">Cargando...</p>
        ) : (
          <>
            {/* Ticket térmico */}
            <Subtitulo titulo="Ticket térmico" descripcion="Lo que sale en la ticketera, desde la app o desde el navegador." />

            <Campo
              id="opcion-ticketFooterMessage"
              etiqueta="Mensaje al pie del ticket"
              ayuda="Se imprime centrado, después del agradecimiento, en boletas, facturas y notas de venta. Sirve para políticas de cambio o un mensaje propio."
            >
              <textarea
                value={negocio.ticketFooterMessage}
                onChange={(e) => cambiar({ ticketFooterMessage: e.target.value.slice(0, 300) })}
                rows={3}
                maxLength={300}
                placeholder="Ej: Verifique el estado de su producto antes de retirarse. Una vez salida la mercadería no hay cambios ni devoluciones."
                className={CLASE_TEXTAREA}
              />
              <p className="text-xs text-gray-400 text-right">{negocio.ticketFooterMessage.length}/300</p>
            </Campo>

            <Campo
              id="opcion-notaVentaLegend"
              etiqueta="Leyenda al pie de las notas de venta"
              ayuda={`Advertencia que se imprime al final de cada nota de venta, en el ticket y en el PDF. Las boletas y facturas llevan la leyenda que exige SUNAT. Si lo dejas vacío se imprime "${DEFAULT_NOTA_VENTA_LEGEND}".`}
            >
              <Input
                type="text"
                value={negocio.notaVentaLegend}
                onChange={(e) => cambiar({ notaVentaLegend: e.target.value.slice(0, NOTA_VENTA_LEGEND_MAX) })}
                maxLength={NOTA_VENTA_LEGEND_MAX}
                placeholder={DEFAULT_NOTA_VENTA_LEGEND}
              />
              <p className="text-xs text-gray-400 text-right">
                {negocio.notaVentaLegend.length}/{NOTA_VENTA_LEGEND_MAX}
              </p>
            </Campo>

            <Ajuste
              id="opcion-showTermsOnTicket"
              checked={negocio.showTermsOnTicket}
              onChange={(e) => cambiar({ showTermsOnTicket: e.target.checked })}
              titulo="Imprimir los términos y condiciones también en el ticket"
              descripcion="Los mismos términos del PDF (más abajo) salen al pie de cada ticket, después del mensaje. Si son largos, cada venta gasta más papel."
            />

            {businessSettings?.logoUrl && (
              <Campo
                id="opcion-logoPrintScale"
                etiqueta="Tamaño del logo en el ticket"
                ayuda="100% es el tamaño actual. Reducir funciona siempre; agrandar depende de la resolución del logo."
              >
                <Select
                  value={String(negocio.logoPrintScale)}
                  onChange={(e) => cambiar({ logoPrintScale: Number(e.target.value) })}
                  className="sm:max-w-xs"
                >
                  {[50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150].map((v) => (
                    <option key={v} value={v}>
                      {v}%{v === 100 ? ' (normal)' : ''}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}

            <Ajuste
              id="opcion-ticketQrEnabled"
              checked={negocio.ticketQrEnabled}
              onChange={(e) => cambiar({ ticketQrEnabled: e.target.checked })}
              titulo="Imprimir un código QR al pie del ticket"
              descripcion="Se genera desde un enlace, o subes tu propia imagen (por ejemplo, el QR oficial de Yape o Plin)."
            />

            {/* Va FUERA del Ajuste: el Ajuste es un <label> y un formulario
                adentro marcaría y desmarcaría el interruptor al tocarlo. */}
            {negocio.ticketQrEnabled && (
              <div className="p-4 border border-gray-200 rounded-lg space-y-4">
                <Campo
                  etiqueta="Cómo se arma el QR"
                  ayuda={
                    negocio.ticketQrMode === 'auto'
                      ? 'Escribe a dónde debe llevar el QR (tu web, un enlace de pago). El ticket lo imprime solo, sin subir ninguna imagen.'
                      : 'Para un QR que ya tienes hecho, como el de Yape o Plin que te dio el banco. Se imprime tal cual en cada ticket.'
                  }
                >
                  <Select
                    value={negocio.ticketQrMode}
                    onChange={(e) => cambiar({ ticketQrMode: e.target.value })}
                    className="sm:max-w-xs"
                  >
                    <option value="auto">Generarlo desde un enlace</option>
                    <option value="image">Subir una imagen del QR</option>
                  </Select>
                </Campo>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
                  <div className="space-y-4 min-w-0">
                    {negocio.ticketQrMode === 'auto' ? (
                      <Campo etiqueta="A dónde lleva el QR" ayuda="URL de tu web, enlace de WhatsApp, datos de pago.">
                        <textarea
                          value={negocio.ticketQrContent}
                          onChange={(e) => cambiar({ ticketQrContent: e.target.value.slice(0, 500) })}
                          rows={3}
                          maxLength={500}
                          placeholder={'Ejemplos:\nhttps://mitienda.com\nhttps://wa.me/51987654321\nyape:987654321'}
                          className={`${CLASE_TEXTAREA} font-mono`}
                        />
                        <p className="text-xs text-gray-400 text-right">{negocio.ticketQrContent.length}/500</p>
                      </Campo>
                    ) : (
                      <Campo etiqueta="Imagen del QR" ayuda="PNG cuadrado, de al menos 300 x 300 px y fondo blanco, para que se imprima nítido. Máximo 2 MB.">
                        <div className="flex items-center gap-3">
                          <label className="flex-1 cursor-pointer">
                            <input
                              type="file"
                              accept="image/jpeg,image/jpg,image/png,image/webp"
                              onChange={handleQrImageUpload}
                              className="hidden"
                            />
                            <span className="block px-3 py-2 text-sm text-center border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50">
                              {uploadingQrImage ? (
                                <span className="inline-flex items-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Subiendo...
                                </span>
                              ) : negocio.ticketQrImageUrl ? (
                                'Cambiar imagen'
                              ) : (
                                'Elegir archivo (PNG, JPG o WEBP)'
                              )}
                            </span>
                          </label>
                          {negocio.ticketQrImageUrl && (
                            <Button variant="outline" size="sm" onClick={handleRemoveQrImage}>
                              Quitar
                            </Button>
                          )}
                        </div>
                      </Campo>
                    )}

                    <Campo etiqueta="Texto debajo del QR (opcional)">
                      <Input
                        type="text"
                        value={negocio.ticketQrCaption}
                        onChange={(e) => cambiar({ ticketQrCaption: e.target.value.slice(0, 60) })}
                        maxLength={60}
                        placeholder="Ej: Escanea para pagar con Yape"
                      />
                      <p className="text-xs text-gray-400 text-right">{negocio.ticketQrCaption.length}/60</p>
                    </Campo>
                  </div>

                  {/* Vista previa */}
                  <div className="border border-gray-200 rounded-lg p-4 flex flex-col items-center md:w-[200px]">
                    <span className="text-xs font-medium text-gray-500 mb-2">Vista previa</span>
                    {negocio.ticketQrMode === 'image' ? (
                      negocio.ticketQrImageUrl ? (
                        <>
                          <div className="bg-white p-2 rounded border border-gray-200">
                            <img src={negocio.ticketQrImageUrl} alt="QR del ticket" className="w-[140px] h-[140px] object-contain" />
                          </div>
                          {negocio.ticketQrCaption.trim() && (
                            <p className="text-xs text-gray-700 mt-2 text-center font-medium">{negocio.ticketQrCaption.trim()}</p>
                          )}
                        </>
                      ) : (
                        <div className="w-[140px] h-[140px] rounded border border-dashed border-gray-300 flex items-center justify-center">
                          <span className="text-xs text-gray-500 text-center px-2">Sube una imagen para ver la vista previa</span>
                        </div>
                      )
                    ) : negocio.ticketQrContent.trim() ? (
                      <>
                        <div className="bg-white p-2 rounded border border-gray-200">
                          <QRCodeSVG value={negocio.ticketQrContent.trim()} size={140} level="M" includeMargin={false} />
                        </div>
                        {negocio.ticketQrCaption.trim() && (
                          <p className="text-xs text-gray-700 mt-2 text-center font-medium">{negocio.ticketQrCaption.trim()}</p>
                        )}
                      </>
                    ) : (
                      <div className="w-[140px] h-[140px] rounded border border-dashed border-gray-300 flex items-center justify-center">
                        <span className="text-xs text-gray-500 text-center px-2">Escribe un enlace para ver el QR</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Comprobantes en PDF */}
            <Subtitulo titulo="Comprobantes en PDF" descripcion="Facturas, boletas, notas y cotizaciones que se descargan o se envían." />

            <Campo
              id="opcion-pdfAccentColor"
              etiqueta="Color de acento"
              ayuda="Se usa en los encabezados de tablas y secciones de facturas, boletas y cotizaciones."
            >
              <div className="flex flex-wrap items-center gap-2">
                {COLORES_PDF.map((opcion) => (
                  <button
                    key={opcion.color}
                    type="button"
                    title={opcion.name}
                    aria-label={opcion.name}
                    onClick={() => cambiar({ pdfAccentColor: opcion.color })}
                    className={`w-9 h-9 rounded-md border-2 ${
                      negocio.pdfAccentColor === opcion.color ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-400' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: opcion.color }}
                  />
                ))}
                <input
                  type="color"
                  value={negocio.pdfAccentColor}
                  onChange={(e) => cambiar({ pdfAccentColor: e.target.value })}
                  onInput={(e) => cambiar({ pdfAccentColor: e.target.value })}
                  title="Otro color"
                  className="w-9 h-9 rounded-md border border-gray-300 cursor-pointer"
                />
                <span className="text-xs text-gray-500">Otro</span>
              </div>
            </Campo>

            {/* Un ancla por flag: el Campo lleva la del negocio (pdfA5) y el
                envoltorio la del equipo (a4SheetPrint). */}
            <div id="opcion-a4SheetPrint" className="scroll-mt-24 rounded-lg">
              <Campo
                id="opcion-pdfA5"
                etiqueta="Tamaño de hoja"
                ayuda="Ticket: el comprobante sale en rollo térmico. A4: el ticket y la comanda salen en una hoja completa, para impresoras de tinta o láser (se guarda en este equipo). A5: los PDF de boletas, facturas y notas se generan en media hoja, ideal para imprimir dos por A4."
              >
                <Select value={hoja} onChange={(e) => setHojaElegida(e.target.value)} className="sm:max-w-xs" disabled={!configLocalLista}>
                  <option value="ticket">Ticket térmico (58 u 80 mm)</option>
                  <option value="a4">Hoja A4 (impresora de tinta o láser)</option>
                  <option value="a5">Hoja A5 para los PDF (media hoja)</option>
                </Select>
              </Campo>
            </div>

            <Ajuste
              id="opcion-pdfSpacious"
              checked={negocio.pdfSpacious}
              onChange={(e) => cambiar({ pdfSpacious: e.target.checked })}
              titulo="Espaciado amplio"
              descripcion="Más separación entre secciones y filas más altas. Apagado, el PDF usa el diseño compacto estándar."
            />

            <Campo
              id="opcion-invoiceFooterTerms"
              etiqueta="Términos y condiciones al pie del comprobante"
              ayuda="Texto libre al pie de facturas, boletas y notas de venta en PDF: garantías, políticas de devolución. También se propone como términos por defecto en cotizaciones nuevas. Solo va en el PDF, no se envía a SUNAT. Vacío, no se muestra nada."
            >
              <textarea
                value={negocio.invoiceFooterTerms}
                onChange={(e) => cambiar({ invoiceFooterTerms: e.target.value.slice(0, 1000) })}
                rows={5}
                maxLength={1000}
                placeholder={'Ej: - La garantía por reparación dura 7 días calendario desde la fecha de reparación.\n- No se aceptan devoluciones de dinero una vez realizado el servicio.'}
                className={CLASE_TEXTAREA}
              />
              <p className="text-xs text-gray-400 text-right">{negocio.invoiceFooterTerms.length}/1000</p>
            </Campo>

            <Campo
              id="opcion-companySlogan"
              etiqueta="Eslogan bajo el logo"
              ayuda="Tu frase comercial o una descripción breve. Aparece debajo del logo en el PDF, hasta dos líneas."
            >
              <Input
                type="text"
                value={negocio.companySlogan}
                onChange={(e) => cambiar({ companySlogan: e.target.value.toUpperCase().slice(0, 120) })}
                maxLength={120}
                placeholder="Tu frase comercial o descripción breve"
              />
            </Campo>

            <Ajuste
              id="opcion-showProductCodeInQuotation"
              checked={negocio.showProductCodeInQuotation}
              onChange={(e) => cambiar({ showProductCodeInQuotation: e.target.checked })}
              titulo="Códigos de producto en cotizaciones"
              descripcion="El código o SKU sale junto al nombre de cada producto en el PDF de la cotización."
            />
            <Ajuste
              id="opcion-showProductCodeInInvoices"
              checked={negocio.showProductCodeInInvoices}
              onChange={(e) => cambiar({ showProductCodeInInvoices: e.target.checked })}
              titulo="Códigos de producto en comprobantes"
              descripcion="El código o SKU sale en boletas, facturas y notas de crédito, débito y venta."
            />
            <Ajuste
              id="opcion-showProductDescriptionInQuotation"
              checked={negocio.showProductDescriptionInQuotation}
              onChange={(e) => cambiar({ showProductDescriptionInQuotation: e.target.checked })}
              titulo="Descripción del producto en cotizaciones"
              descripcion="La descripción detallada va debajo del nombre. Apágalo para cotizaciones con muchos productos."
            />
            <Ajuste
              id="opcion-showProductDescriptionInInvoice"
              checked={negocio.showProductDescriptionInInvoice}
              onChange={(e) => cambiar({ showProductDescriptionInInvoice: e.target.checked })}
              titulo="Descripción del producto en comprobantes"
              descripcion="La descripción detallada va debajo del nombre en facturas, boletas y notas de venta."
            />
            <Ajuste
              id="opcion-showImagesInQuotations"
              checked={negocio.showImagesInQuotations}
              onChange={(e) => cambiar({ showImagesInQuotations: e.target.checked })}
              titulo="Imágenes de los productos en cotizaciones"
              descripcion="Cada producto cotizado lleva una miniatura de su imagen; las filas salen un poco más altas."
            >
              {negocio.showImagesInQuotations && (
                <Regulador
                  etiqueta="Tamaño de las imágenes"
                  value={negocio.quotationImageScale}
                  onChange={(v) => cambiar({ quotationImageScale: v })}
                  min={50}
                  max={150}
                  step={10}
                  sufijo="%"
                  extremos={['Más pequeñas', 'Más grandes']}
                  ayuda="Las filas del PDF se ajustan solas. Si el diseño tiene poco espacio (farmacia, filas con descuento), se usa el máximo que entra sin aplastar la descripción."
                />
              )}
            </Ajuste>
            <Ajuste
              id="opcion-showImagesInInvoices"
              checked={negocio.showImagesInInvoices}
              onChange={(e) => cambiar({ showImagesInInvoices: e.target.checked })}
              titulo="Imágenes de los productos en comprobantes"
              descripcion="Cada producto de la factura, boleta o nota de venta lleva una miniatura de su imagen, igual que en las cotizaciones."
            >
              {negocio.showImagesInInvoices && (
                <Regulador
                  etiqueta="Tamaño de las imágenes"
                  value={negocio.invoiceImageScale}
                  onChange={(v) => cambiar({ invoiceImageScale: v })}
                  min={50}
                  max={150}
                  step={10}
                  sufijo="%"
                  extremos={['Más pequeñas', 'Más grandes']}
                  ayuda="Las filas del PDF se ajustan solas. Si el diseño tiene poco espacio, se usa el máximo que entra sin aplastar la descripción."
                />
              )}
            </Ajuste>
            <Ajuste
              id="opcion-showBrandInInvoices"
              checked={negocio.showBrandInInvoices}
              onChange={(e) => cambiar({ showBrandInInvoices: e.target.checked })}
              titulo="Columna de marca en comprobantes"
              descripcion="Agrega una columna MARCA con la marca de cada producto; el espacio sale de la columna DESCRIPCIÓN. Útil cuando la marca identifica el producto: municiones, repuestos, herramientas."
            />
            <Ajuste
              id="opcion-hideBatchAndExpiryInDocuments"
              checked={negocio.hideBatchAndExpiryInDocuments}
              onChange={(e) => cambiar({ hideBatchAndExpiryInDocuments: e.target.checked })}
              titulo="Ocultar lote y vencimiento en los comprobantes"
              descripcion="El lote y la fecha de vencimiento no aparecen en PDF, tickets ni impresión térmica. El control interno de lotes sigue igual: stock, FIFO y alertas. Para pastelerías, perfumerías y negocios que controlan lotes solo por dentro."
            />

            {/* Notas de venta */}
            <Subtitulo titulo="Notas de venta" descripcion="La nota de venta no es un comprobante electrónico: puede salir con menos datos." />

            <div id="opcion-hideOnlyIgvInNotaVenta" className="scroll-mt-24 rounded-lg">
              <Campo
                id="opcion-hideRucIgvInNotaVenta"
                etiqueta="RUC e IGV en las notas de venta"
                ayuda="Ocultar solo el IGV quita el desglose de subtotal e IGV y deja el RUC. Ocultar RUC e IGV deja únicamente el total."
              >
                <Select
                  value={negocio.hideRucIgvInNotaVenta ? 'ruc_igv' : negocio.hideOnlyIgvInNotaVenta ? 'igv' : 'todo'}
                  onChange={(e) =>
                    cambiar({
                      hideRucIgvInNotaVenta: e.target.value === 'ruc_igv',
                      hideOnlyIgvInNotaVenta: e.target.value === 'igv',
                    })
                  }
                  className="sm:max-w-xs"
                >
                  <option value="todo">Mostrar todo</option>
                  <option value="igv">Ocultar solo el IGV</option>
                  <option value="ruc_igv">Ocultar RUC e IGV</option>
                </Select>
              </Campo>
            </div>

            <Ajuste
              id="opcion-hideCompanyDataInNotaVenta"
              checked={negocio.hideCompanyDataInNotaVenta}
              onChange={(e) => cambiar({ hideCompanyDataInNotaVenta: e.target.checked })}
              titulo="Ocultar los datos de la empresa en el PDF de las notas de venta"
              descripcion="El PDF no muestra logo, nombre, razón social, RUC, dirección, teléfono, correo ni eslogan: solo NOTA DE VENTA con su número, el cliente y los productos. No afecta a facturas ni boletas, ni al ticket térmico."
            />

            {/* Al vender */}
            <Subtitulo titulo="Al vender" />

            <Ajuste
              id="opcion-autoPrintTicket"
              checked={negocio.autoPrintTicket}
              onChange={(e) => cambiar({ autoPrintTicket: e.target.checked })}
              titulo="Imprimir el ticket solo al completar la venta"
              descripcion="Al terminar la venta el ticket sale sin tocar el botón Imprimir."
            />
            <Ajuste
              id="opcion-showProductsInCashClosure"
              checked={negocio.showProductsInCashClosure}
              onChange={(e) => cambiar({ showProductsInCashClosure: e.target.checked })}
              titulo="Imprimir los productos vendidos en el cierre de caja"
              descripcion="El ticket de cierre lista qué se vendió en el turno, con cantidad e importe. Con muchos productos el ticket se alarga; el PDF del cierre siempre los trae."
            />
            <Ajuste
              id="opcion-enableCustomerDisplay"
              checked={negocio.enableCustomerDisplay}
              onChange={(e) => cambiar({ enableCustomerDisplay: e.target.checked })}
              titulo="Pantalla de cliente (segunda pantalla)"
              descripcion="En terminales con doble pantalla (iMin Swan 2) el cliente ve el detalle de su compra en tiempo real, con el logo y los colores de tu negocio. Enciéndelo solo si tienes una terminal así."
            />

            {/* Comandas: solo restaurante */}
            {esRestaurante && (
              <>
                <Subtitulo titulo="Comandas" descripcion="Los tickets que van a la cocina." />

                <Ajuste
                  id="opcion-autoPrintKitchenComanda"
                  checked={negocio.autoPrintKitchenComanda}
                  onChange={(e) => cambiar({ autoPrintKitchenComanda: e.target.checked })}
                  titulo="Imprimir la comanda automáticamente"
                  descripcion="Al tomar un pedido desde Mesas u Órdenes, la comanda se envía sola a la cocina. Apagado, el mozo la manda con el botón Imprimir comanda cuando la necesite."
                />
                <Ajuste
                  id="opcion-autoPrintByStation"
                  checked={negocio.autoPrintByStation}
                  onChange={(e) => cambiar({ autoPrintByStation: e.target.checked })}
                  titulo="Impresión automática por estación"
                  descripcion="Al enviar a cocina, cada estación imprime su parte en su propia impresora, según las categorías que tiene asignadas."
                />
                <Ajuste
                  id="opcion-combineStationsOnWebPrint"
                  checked={negocio.combineStationsOnWebPrint}
                  onChange={(e) => cambiar({ combineStationsOnWebPrint: e.target.checked })}
                  titulo="Imprimir la comanda junta desde la computadora"
                  descripcion="Al imprimir desde el navegador sale todo en una sola comanda. Apagado, se separa en una hoja por estación (Cocina, Bar)."
                />
                {!negocio.enableKitchenStations && (
                  <Nota>
                    Las dos opciones por estación actúan cuando el modo multi-estación está
                    encendido, en Ventas, Estaciones de cocina.
                  </Nota>
                )}
                <Ajuste
                  id="opcion-showCustomerDataOnKitchenTicket"
                  checked={negocio.showCustomerDataOnKitchenTicket}
                  onChange={(e) => cambiar({ showCustomerDataOnKitchenTicket: e.target.checked })}
                  titulo="Datos del cliente y cobro en las comandas"
                  descripcion="Las comandas de delivery y para llevar incluyen nombre, teléfono, dirección y el estado de pago (POR COBRAR con el monto, o PAGADO). Apagado, la comanda muestra solo los productos."
                />
              </>
            )}

            <BarraGuardar onClick={guardarFormato} guardando={guardando || uploadingQrImage} />
          </>
        )}
      </Seccion>

      <Separador />

      {/* ── 3. Ajustes de este equipo (localStorage) ─────────────────────── */}
      <Seccion titulo="Ajustes de este equipo" descripcion="Solo en este equipo. Cada computadora o tablet guarda los suyos, y se aplican al instante.">
        {!configLocalLista ? (
          <p className="text-sm text-gray-500">Cargando los ajustes de este equipo...</p>
        ) : (
          <>
            {/* En escritorio el ancho ya está arriba, junto a cómo imprime. */}
            {ctx !== 'escritorio-web' && selectorAncho}

            <Campo
              id="opcion-ticketFontSize"
              etiqueta="Tamaño de letra del ticket"
              ayuda="Comprobantes, precuentas y comandas. Mediana y grande apagan la impresión compacta."
            >
              <Select
                value={printerConfig.ticketFontSize || (printerConfig.webPrintLegible ? 'medium' : 'small')}
                onChange={(e) => cambiarLetraTicket(e.target.value)}
                className="sm:max-w-xs"
              >
                {LETRAS_TICKET.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Campo>

            {/* Letra propia de la COMANDA: en cocina se lee de lejos y con las
                manos ocupadas, pero agrandar el ticket entero gasta papel en
                cada venta. Solo la lee la impresión térmica directa. */}
            {enApp && esRestaurante && (
              <Campo
                id="opcion-kitchenFontSize"
                etiqueta="Tamaño de letra de la comanda"
                ayuda="Solo la comanda de cocina, sin agrandar comprobantes ni precuentas. Con letra muy grande usa más papel y los nombres largos se parten en dos líneas."
              >
                <Select
                  value={printerConfig.kitchenFontSize || ''}
                  onChange={(e) =>
                    guardarLocal(
                      { kitchenFontSize: e.target.value },
                      `Letra de la comanda: ${LETRAS_COMANDA.find((o) => o.key === e.target.value)?.label || ''}`
                    )
                  }
                  className="sm:max-w-xs"
                >
                  {LETRAS_COMANDA.map((o) => (
                    <option key={o.key || 'auto'} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}

            {/* Avance antes del corte: comando ESC/POS, solo tiene sentido en la
                impresión térmica directa de la app. */}
            {enApp && (
              <Campo
                id="opcion-cutFeedLines"
                etiqueta="Avance de papel antes del corte"
                ayuda="Líneas en blanco antes de cortar. Si el ticket sale con mucho espacio arriba, baja el valor; si el contenido se corta abajo, súbelo. Depende de cada modelo."
              >
                <Select
                  value={String(printerConfig.cutFeedLines ?? 5)}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(15, parseInt(e.target.value) || 0))
                    guardarLocal({ cutFeedLines: val }, `Avance antes del corte: ${val} líneas`)
                  }}
                  className="sm:max-w-xs"
                >
                  {Array.from({ length: 16 }, (_, i) => i).map((v) => (
                    <option key={v} value={v}>
                      {v} {v === 1 ? 'línea' : 'líneas'}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}

            <Ajuste
              id="opcion-compactPrint"
              checked={printerConfig.compactPrint || false}
              onChange={(e) =>
                guardarLocal(
                  {
                    compactPrint: e.target.checked,
                    ...(e.target.checked && { webPrintLegible: false, ticketFontSize: 'small' }),
                  },
                  e.target.checked ? 'Impresión compacta activada' : 'Impresión compacta desactivada'
                )
              }
              titulo="Impresión compacta (ahorro de papel)"
              descripcion="Reduce letra, espaciado y márgenes para tickets más cortos. Vuelve la letra a pequeña."
            />

            {esRestaurante && (
              <Ajuste
                id="opcion-ultraCompactKitchen"
                checked={printerConfig.ultraCompactKitchen || false}
                onChange={(e) =>
                  guardarLocal(
                    { ultraCompactKitchen: e.target.checked },
                    e.target.checked ? 'Comandas ultracompactas activadas' : 'Comandas ultracompactas desactivadas'
                  )
                }
                titulo="Comandas ultracompactas"
                descripcion="La comanda al mínimo: mesa, orden y productos, sin bordes ni fondos. El máximo ahorro de papel."
              />
            )}

            <Ajuste
              id="opcion-showItemUnit"
              checked={printerConfig.showItemUnit || false}
              onChange={(e) =>
                guardarLocal(
                  { showItemUnit: e.target.checked },
                  e.target.checked ? 'Unidad de medida activada en el ticket' : 'Unidad de medida desactivada'
                )
              }
              titulo="Unidad de medida en el ticket"
              descripcion="Antepone la cantidad y la unidad o presentación a cada producto: 1 UNIDAD Producto, 3 CAJA Producto."
            />

            <Ajuste
              id="opcion-simplePrint"
              checked={printerConfig.simplePrint || false}
              onChange={(e) =>
                guardarLocal(
                  { simplePrint: e.target.checked },
                  e.target.checked ? 'Impresión simple activada' : 'Impresión simple desactivada'
                )
              }
              titulo="Impresión simple (sin fondos negros)"
              descripcion="Reemplaza los fondos negros (tipo de documento, total a pagar) por bordes con texto negro. Para impresoras que no imprimen bien los fondos oscuros o pierden el texto blanco."
            />

            {/* Márgenes y ajuste de hoja son CSS del navegador: solo en web. */}
            {!enApp && (
              <>
                <Campo
                  id="opcion-printMargins"
                  etiqueta="Márgenes laterales"
                  ayuda="Espacio a los lados al imprimir desde el navegador. Usa 0 si el ticket se ve bien en la vista previa; súbelo si el texto se corta en tu impresora."
                >
                  <Select
                    value={String(printerConfig.printMargins ?? 8)}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(15, parseInt(e.target.value) || 0))
                      guardarLocal({ printMargins: val }, `Márgenes de impresión: ${val}mm`)
                    }}
                    className="sm:max-w-xs"
                  >
                    {Array.from({ length: 16 }, (_, i) => i).map((v) => (
                      <option key={v} value={v}>
                        {v} mm
                      </option>
                    ))}
                  </Select>
                </Campo>

                <Ajuste
                  id="opcion-ajustarHojaAlTicket"
                  checked={printerConfig.ajustarHojaAlTicket !== false}
                  onChange={(e) =>
                    guardarLocal(
                      { ajustarHojaAlTicket: e.target.checked },
                      e.target.checked ? 'El sistema ajustará la hoja al largo del ticket' : 'Manda el tamaño de papel de tu impresora'
                    )
                  }
                  titulo="Ajustar la hoja al largo del ticket"
                  descripcion="El sistema le pide al navegador una hoja del largo exacto del comprobante, para que no sobre papel ni se parta en dos. Apágalo si tu impresora ya tiene su propio tamaño de papel configurado (por ejemplo un rollo continuo de 72 x 3276 mm): cuando los dos tamaños no coinciden, el navegador achica el ticket y lo deja centrado en el papel."
                />
              </>
            )}
          </>
        )}
      </Seccion>

      <Separador />

      {/* ── 4. Impresora de caja compartida ─────────────────────────────── */}
      <Seccion
        id="opcion-cajaPrinter"
        titulo="Impresora de caja compartida"
        descripcion="La ticketera de red de la caja. Se configura una vez y todos los equipos del negocio mandan ahí los comprobantes y las precuentas; la principal sigue para las comandas. Sin ella, los comprobantes salen por la impresora principal."
      >
        {cajaConfigurada ? (
          <div className="p-4 border border-gray-200 rounded-lg space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{documentPrinterConfig.name || 'Impresora de caja'}</p>
              <p className="text-sm text-gray-600 break-all">
                IP {documentPrinterConfig.ip}:{documentPrinterConfig.port || 9100} · papel de {documentPrinterConfig.paperWidth || 58} mm
              </p>
              <p className="text-sm text-gray-600">Imprime comprobantes y precuentas.</p>
            </div>
            {enApp && (
              <>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" size="sm" onClick={handleTestDocPrinter} disabled={isTestingDocPrinter}>
                    {isTestingDocPrinter ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Imprimiendo...
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4 mr-2" />
                        Probar
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDisableDocPrinter}>
                    Deshabilitar
                  </Button>
                </div>
                <Campo etiqueta="Ancho del rollo de la caja">
                  <Select
                    value={String(documentPrinterConfig.paperWidth || 58)}
                    onChange={(e) => handleDocPaperWidth(e.target.value)}
                    className="sm:max-w-xs"
                  >
                    <option value="58">58 mm (ticketeras pequeñas)</option>
                    <option value="80">80 mm (estándar)</option>
                  </Select>
                </Campo>
              </>
            )}
          </div>
        ) : (
          enApp && (
            <>
              {!showDocPrinterForm ? (
                <Button variant="outline" onClick={() => setShowDocPrinterForm(true)}>
                  <Wifi className="w-4 h-4 mr-2" />
                  Configurar la impresora de caja
                </Button>
              ) : (
                <div className="p-4 border border-gray-200 rounded-lg space-y-4">
                  <p className="text-sm text-gray-600">Debe estar en la misma red que este equipo.</p>
                  <Fila>
                    <Campo etiqueta="Dirección IP">
                      <Input
                        type="text"
                        placeholder="192.168.1.101"
                        value={docPrinterIp}
                        onChange={(e) => setDocPrinterIp(e.target.value)}
                        className="font-mono"
                      />
                    </Campo>
                    <Campo etiqueta="Puerto">
                      <Input
                        type="text"
                        placeholder="9100"
                        value={docPrinterPort}
                        onChange={(e) => setDocPrinterPort(e.target.value.replace(/\D/g, ''))}
                        className="font-mono"
                      />
                    </Campo>
                  </Fila>
                  <Campo etiqueta="Nombre (opcional)">
                    <Input
                      type="text"
                      placeholder="Impresora Caja"
                      value={docPrinterName}
                      onChange={(e) => setDocPrinterName(e.target.value)}
                    />
                  </Campo>
                  <div className="flex gap-2">
                    <Button onClick={handleDocPrinterConnect} disabled={isConnectingDocPrinter || !docPrinterIp.trim()} className="flex-1">
                      {isConnectingDocPrinter ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Conectando...
                        </>
                      ) : (
                        'Configurar impresora'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDocPrinterForm(false)
                        setDocPrinterIp('')
                        setDocPrinterPort('9100')
                        setDocPrinterName('')
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </>
          )
        )}

        {/* Probar y configurar usan un plugin nativo (TcpPrinter) que en el
            navegador no existe. */}
        {!enApp && (
          <Nota>
            Se configura desde la app.
            {cajaConfigurada
              ? ' Este equipo la usa tal como está configurada.'
              : ' Cuando se configure en una tablet o celular, esta computadora también la va a usar.'}
          </Nota>
        )}
      </Seccion>

      <Separador />

      {/* ── 5. Probar el lector de códigos ──────────────────────────────── */}
      {/* La pistola lectora no se conecta a nada, pero cuando "no funciona"
          hay que poder decir POR QUÉ en un minuto y no en tres días de
          mensajes. Trae su propio título. */}
      <ScannerTester />
    </div>
  )
}
