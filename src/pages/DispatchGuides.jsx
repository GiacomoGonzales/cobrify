import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, Plus, FileText, Package, MapPin, User, Eye, Download, CheckCircle, Clock, XCircle, Send, Loader2, AlertCircle, AlertTriangle, X, Calendar, Weight, Hash, Pencil, Store, Search, Code, Share2, Printer, MoreVertical, FileCheck, Receipt, Ban, ShoppingCart, Copy, RotateCcw, Trash2 } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useAppContext } from '@/hooks/useAppContext'
import { useLocationAccess } from '@/utils/locationAccess'
import { useToast } from '@/contexts/ToastContext'
import { useBranding } from '@/contexts/BrandingContext'
import { getDispatchGuides, sendDispatchGuideToSunat, getCompanySettings, getProducts } from '@/services/firestoreService'
import CreateDispatchGuideModal from '@/components/CreateDispatchGuideModal'
import EditDispatchGuideModal from '@/components/EditDispatchGuideModal'
import DispatchGuideTicket from '@/components/DispatchGuideTicket'
import { aplicarTamanoDeHoja } from '@/utils/printPageSize'
import { generateDispatchGuidePDF, previewDispatchGuidePDF, shareDispatchGuidePDF, getDispatchGuidePDFBlob } from '@/utils/dispatchGuidePdfGenerator'
import { buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'
import { getActiveBranches } from '@/services/branchService'
import { canVoidDispatchGuide } from '@/services/sunatService'
import { updateDispatchGuide, deleteDispatchGuide, getDispatchGuide } from '@/services/firestoreService'
import { Capacitor } from '@capacitor/core'
import GuideLink from '@/components/guide/GuideLink'
import { documentLabelLong } from '@/utils/documentType'

const TRANSFER_REASONS = {
  '01': 'Venta',
  '02': 'Compra',
  '04': 'Traslado entre establecimientos',
  '05': 'Consignación',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
}

const TRANSPORT_MODES = {
  '01': 'Transporte Público',
  '02': 'Transporte Privado',
}

// Helper para formatear fecha sin problemas de zona horaria
// Cuando se parsea "2024-12-14" con new Date(), JavaScript lo interpreta como UTC
// lo que causa que en Perú (UTC-5) se muestre el día anterior
const formatTransferDate = (dateString) => {
  if (!dateString) return '-'
  // Si es formato YYYY-MM-DD, formatear directamente sin pasar por Date
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-')
    return `${day}/${month}/${year}`
  }
  // Para otros formatos, usar el método tradicional con ajuste
  const date = new Date(dateString + 'T12:00:00')
  return date.toLocaleDateString('es-PE')
}

// Datos demo para guías de remisión
const DEMO_GUIDES = [
  {
    id: 'demo-guide-1',
    number: 'T001-00000001',
    transferDate: new Date().toISOString(),
    transferReason: '01',
    transportMode: '02',
    destination: { address: 'Av. Larco 1234, Miraflores, Lima' },
    items: [{ description: 'Producto Demo 1', quantity: 10 }, { description: 'Producto Demo 2', quantity: 5 }],
    status: 'in_transit',
    sunatStatus: 'accepted',
    createdAt: new Date(),
  },
  {
    id: 'demo-guide-2',
    number: 'T001-00000002',
    transferDate: new Date(Date.now() - 86400000).toISOString(), // Ayer
    transferReason: '04',
    transportMode: '01',
    destination: { address: 'Jr. de la Unión 456, Centro de Lima' },
    items: [{ description: 'Mercadería variada', quantity: 20 }],
    status: 'delivered',
    sunatStatus: 'accepted',
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: 'demo-guide-3',
    number: 'T001-00000003',
    transferDate: new Date(Date.now() - 172800000).toISOString(), // Hace 2 días
    transferReason: '13',
    transportMode: '02',
    destination: { address: 'Calle Los Pinos 789, San Isidro, Lima' },
    items: [{ description: 'Equipos electrónicos', quantity: 3 }],
    status: 'pending',
    sunatStatus: 'pending',
    createdAt: new Date(Date.now() - 172800000),
  },
]

export default function DispatchGuides() {
  const navigate = useNavigate()
  const { getBusinessId, isDemoMode, filterBranchesByAccess, allowedBranches, user, businessMode, businessSettings , branchScope } = useAppContext()
  // Seguridad: el usuario secundario solo ve guías de sus sucursales habilitadas
  const canAccess = useLocationAccess()
  const { branding } = useBranding()

  // Verificar si el usuario tiene acceso a la sucursal principal
  const hasMainAccess = !allowedBranches || allowedBranches.length === 0 || allowedBranches.includes('main')
  const toast = useToast()

  const [guides, setGuides] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [sendingToSunat, setSendingToSunat] = useState(null) // ID de guía siendo enviada
  const [downloadingPdf, setDownloadingPdf] = useState(null) // ID de guía descargándose
  const [previewingPdf, setPreviewingPdf] = useState(null) // ID de guía en vista previa
  const [sharingPdf, setSharingPdf] = useState(null) // ID de guía siendo compartida
  const [printingTicket, setPrintingTicket] = useState(null) // Guía para imprimir en ticket
  const ticketRef = useRef(null) // Ref para el componente de ticket
  const [companySettings, setCompanySettings] = useState(null) // Datos de la empresa
  const [allProducts, setAllProducts] = useState([]) // Productos para PDF (marca, lab, SKU)
  const [selectedGuide, setSelectedGuide] = useState(null) // Guía seleccionada para ver detalles
  const [editingGuide, setEditingGuide] = useState(null) // Guía en edición
  const [cloningGuide, setCloningGuide] = useState(null) // Guía para clonar
  const [branches, setBranches] = useState([])
  // La sucursal sale del selector del HEADER (branchScope), global a toda la
  // app. Tener un select propio aca era duplicarlo: si el usuario ya entro a
  // una sede, la pagina debe mostrarla sin que la elija dos veces.
  // Tokens: 'all' | 'main' | <branchId>.
  const filterBranch = branchScope || 'all'
  const [searchTerm, setSearchTerm] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)
  const ITEMS_PER_PAGE = 20

  // Estado para anulación de guías
  const [voidingGuide, setVoidingGuide] = useState(null) // Guía seleccionada para anular
  const [deletingGuide, setDeletingGuide] = useState(null) // Guía seleccionada para eliminar
  const [isDeletingGuide, setIsDeletingGuide] = useState(false)
  const [isVoidingGuide, setIsVoidingGuide] = useState(false) // Proceso en curso

  // Helper para forzar descarga de archivos desde URL (XML, CDR)
  const forceDownload = async (url, filename) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Error al descargar archivo:', error)
      window.open(url, '_blank')
    }
  }
  const [voidGuideReason, setVoidGuideReason] = useState('ANULACION DE GUIA DE REMISION')

  const [printMargins, setPrintMargins] = useState(8)
  const [simplePrint, setSimplePrint] = useState(false)
  const [ticketPaperWidth, setTicketPaperWidth] = useState(80)
  // Ajustar la hoja al largo del ticket. Apagado, manda el papel elegido en
  // la ventana de imprimir (Configuración > Impresora).
  const [ajustarHoja, setAjustarHoja] = useState(true)

  // Estado para dropdown menu de acciones
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: true })

  // Detectar si estamos en móvil
  const isNativePlatform = Capacitor.isNativePlatform()

  // Cargar configuración de impresora
  useEffect(() => {
    const loadPrinterConfig = async () => {
      if (!user?.uid) return
      try {
        const { getPrinterConfig } = await import('@/services/thermalPrinterService')
        const result = await getPrinterConfig(getBusinessId())
        if (result.success && result.config) {
          setPrintMargins(result.config.printMargins ?? 8)
          setSimplePrint(result.config.simplePrint || false)
          setTicketPaperWidth(result.config.paperWidth || 80)
          setAjustarHoja(result.config.ajustarHojaAlTicket !== false)
        }
      } catch (error) {
        console.error('Error loading printer config:', error)
      }
    }
    loadPrinterConfig()
  }, [user])

  // Cargar guías, datos de empresa y productos al montar el componente
  useEffect(() => {
    loadGuides()
    loadCompanySettings()
    loadBranches()
    loadAllProducts()
  }, [])

  // Cargar productos para PDF (marca, laboratorio, SKU)
  const loadAllProducts = async () => {
    if (isDemoMode) return
    try {
      const businessId = getBusinessId()
      if (businessId) {
        const result = await getProducts(businessId)
        if (result.success) {
          setAllProducts(result.data || [])
        }
      }
    } catch (e) {
      console.error('Error cargando productos:', e)
    }
  }

  // Cargar sucursales para filtro
  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const result = await getActiveBranches(getBusinessId())
      if (result.success) {
        const branchList = filterBranchesByAccess ? filterBranchesByAccess(result.data || []) : (result.data || [])
        setBranches(branchList)
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
    }
  }

  const loadGuides = async () => {
    setIsLoading(true)
    try {
      // MODO DEMO: Usar datos simulados
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Cargando guías de remisión simuladas...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Simular delay
        setGuides(DEMO_GUIDES)
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      const result = await getDispatchGuides(businessId)

      if (result.success) {
        setGuides((result.data || []).filter(canAccess))
      } else {
        throw new Error(result.error || 'Error al cargar las guías')
      }
    } catch (error) {
      console.error('Error al cargar guías:', error)
      toast.error('Error al cargar las guías de remisión')
    } finally {
      setIsLoading(false)
    }
  }

  const loadCompanySettings = async () => {
    try {
      // MODO DEMO: Usar datos simulados
      if (isDemoMode) {
        setCompanySettings({
          name: 'EMPRESA DEMO SAC',
          businessName: 'EMPRESA DEMO SOCIEDAD ANÓNIMA CERRADA',
          ruc: '20123456789',
          address: 'Av. Demo 123, Lima, Perú',
          logoUrl: null
        })
        return
      }

      const businessId = getBusinessId()
      const result = await getCompanySettings(businessId)

      if (result.success && result.data) {
        setCompanySettings(result.data)
      }
    } catch (error) {
      console.error('Error al cargar datos de empresa:', error)
    }
  }

  const handleCreateGuide = () => {
    setCloningGuide(null)
    setShowCreateModal(true)
  }

  const handleCloseModal = () => {
    setShowCreateModal(false)
    setCloningGuide(null)
    loadGuides() // Recargar guías después de crear una
  }

  // Enviar guía a SUNAT
  const handleSendToSunat = async (guide) => {
    if (sendingToSunat) return // Evitar múltiples envíos simultáneos

    setSendingToSunat(guide.id)

    try {
      // MODO DEMO: Simular envío a SUNAT
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Simulando envío a SUNAT...')
        toast.info(`Enviando guía ${guide.number} a SUNAT...`)
        await new Promise(resolve => setTimeout(resolve, 1500)) // Simular delay

        // Actualizar estado de la guía demo
        setGuides(prev => prev.map(g =>
          g.id === guide.id
            ? { ...g, sunatStatus: 'accepted' }
            : g
        ))
        toast.success(`Guía ${guide.number} aceptada por SUNAT (Demo)`)
        setSendingToSunat(null)
        return
      }

      const businessId = getBusinessId()
      toast.info(`Enviando guía ${guide.number} a SUNAT...`)

      const result = await sendDispatchGuideToSunat(businessId, guide.id)

      if (result.success && result.accepted) {
        toast.success(`Guía ${guide.number} aceptada por SUNAT`)
      } else if (result.success && !result.accepted) {
        toast.warning(`Guía ${guide.number} rechazada: ${result.description || 'Error desconocido'}`)
      } else {
        toast.error(`Error al enviar guía: ${result.error || 'Error desconocido'}`)
      }

      // Recargar guías para mostrar el nuevo estado
      await loadGuides()

    } catch (error) {
      console.error('Error al enviar guía a SUNAT:', error)
      toast.error(`Error al enviar guía: ${error.message}`)
    } finally {
      setSendingToSunat(null)
    }
  }

  // Descargar TODAS las guías filtradas en un ZIP.
  //
  // Emitir cincuenta guías desde Excel y después abrir el menú de cada una para
  // bajar su PDF es el trabajo que este botón se lleva. Va sobre las FILTRADAS,
  // igual que "Exportar Excel" que está al lado: lo que se ve es lo que baja.
  //
  // Los PDF se arman acá en el navegador, así que igual hay que generarlos uno
  // por uno; lo que se evita es el clic por cada uno. Con muchas guías tarda, y
  // por eso se muestra el avance en vez de dejar el botón mudo.
  const [zipeando, setZipeando] = useState(false)
  const [avanceZip, setAvanceZip] = useState('')

  const handleDownloadZip = async () => {
    if (zipeando) return
    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }
    if (filteredGuides.length === 0) {
      toast.error('No hay guías para descargar')
      return
    }

    setZipeando(true)
    setAvanceZip(`0 de ${filteredGuides.length}`)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const usados = new Set()
      let listas = 0
      let fallidas = 0

      for (const guide of filteredGuides) {
        try {
          const blob = await getDispatchGuidePDFBlob(guide, companySettings, allProducts, branding)
          // Dos guías pueden compartir número (series distintas, datos viejos):
          // sin desempatar, JSZip pisa la anterior y el ZIP sale corto.
          let nombre = `${guide.number || guide.id}.pdf`
          let n = 2
          while (usados.has(nombre)) nombre = `${guide.number || guide.id} (${n++}).pdf`
          usados.add(nombre)
          zip.file(nombre, blob)
          listas++
        } catch (e) {
          console.warn(`No se pudo generar el PDF de ${guide.number}:`, e)
          fallidas++
        }
        setAvanceZip(`${listas + fallidas} de ${filteredGuides.length}`)
        // Ceder el hilo: jsPDF dibuja de forma sincrónica y sin esto el
        // navegador no llega a repintar, así que el contador de avance se
        // quedaría clavado en 0 hasta que termine todo.
        await new Promise(r => setTimeout(r, 0))
      }

      if (listas === 0) {
        toast.error('No se pudo generar ningún PDF')
        return
      }

      const contenido = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(contenido)
      const a = document.createElement('a')
      a.href = url
      a.download = `guias-de-remision-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Si alguna falló hay que decirlo: un ZIP con menos archivos de los
      // esperados, sin aviso, se descubre cuando ya se archivó.
      if (fallidas > 0) {
        toast.warning(`${listas} guía(s) en el ZIP. ${fallidas} no se pudieron generar.`, 7000)
      } else {
        toast.success(`${listas} guía(s) descargadas`)
      }
    } catch (error) {
      console.error('Error al armar el ZIP:', error)
      toast.error('Error al armar el archivo ZIP')
    } finally {
      setZipeando(false)
      setAvanceZip('')
    }
  }

  // Descargar PDF de guía de remisión
  const handleDownloadPdf = async (guide) => {
    if (downloadingPdf) return

    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    setDownloadingPdf(guide.id)
    try {
      toast.info(`Generando PDF de ${guide.number}...`)
      await generateDispatchGuidePDF(guide, companySettings, true, allProducts, branding)
      toast.success('PDF descargado correctamente')
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar el PDF')
    } finally {
      setDownloadingPdf(null)
    }
  }

  // Vista previa del PDF
  const handlePreviewPdf = async (guide) => {
    if (previewingPdf) return

    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    setPreviewingPdf(guide.id)
    try {
      toast.info(`Generando vista previa de ${guide.number}...`)
      await previewDispatchGuidePDF(guide, companySettings, allProducts, branding)
    } catch (error) {
      console.error('Error al generar vista previa:', error)
      toast.error('Error al generar la vista previa')
    } finally {
      setPreviewingPdf(null)
    }
  }

  // Compartir PDF
  const handleSharePdf = async (guide, method = 'share') => {
    if (sharingPdf) return

    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    setSharingPdf(guide.id)
    try {
      toast.info(`Preparando PDF para compartir...`)
      const result = await shareDispatchGuidePDF(guide, companySettings, method, allProducts, branding)
      if (result.success) {
        if (!isNativePlatform) {
          toast.success('PDF listo para compartir')
        }
      }
    } catch (error) {
      console.error('Error al compartir PDF:', error)
      toast.error('Error al compartir el PDF')
    } finally {
      setSharingPdf(null)
    }
  }

  // Imprimir en formato ticket (impresora térmica o web)
  const handlePrintTicket = async (guide) => {
    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    // Si es nativo, intentar imprimir en impresora térmica
    if (isNativePlatform) {
      try {
        const { getPrinterConfig, connectPrinter, printDispatchGuideTicket } = await import('@/services/thermalPrinterService')
        const printerConfigResult = await getPrinterConfig(getBusinessId())

        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          const connectResult = await connectPrinter(printerConfigResult.config.address)

          if (!connectResult.success) {
            toast.error('No se pudo conectar a la impresora: ' + connectResult.error)
            toast.info('Usando impresión estándar...')
          } else {
            const result = await printDispatchGuideTicket(guide, companySettings, printerConfigResult.config.paperWidth || 80)

            if (result.success) {
              toast.success('Guía impresa en ticketera')
              return
            } else {
              toast.error('Error al imprimir: ' + result.error)
              toast.info('Usando impresión estándar...')
            }
          }
        }
      } catch (error) {
        console.error('Error al imprimir en ticketera:', error)
        toast.info('Usando impresión estándar...')
      }
    }

    // Fallback: impresión web (window.print)
    setPrintingTicket(guide)
    setTimeout(() => {
      // La hoja se ajusta al ticket. Sin esto el navegador usa A4 y la guía
      // sale chiquita arriba con media hoja en blanco.
      const quitarTamano = aplicarTamanoDeHoja(ticketRef.current, ticketPaperWidth, ajustarHoja)
      window.print()
      setTimeout(() => {
        quitarTamano()
        setPrintingTicket(null)
      }, 500)
    }, 100)
  }

  // Marcar guía como anulada (la baja se hace manualmente en portal SUNAT)
  const handleVoidGuide = async () => {
    if (!voidingGuide || isVoidingGuide) return

    setIsVoidingGuide(true)
    try {
      if (isDemoMode) {
        await new Promise(resolve => setTimeout(resolve, 500))
        setGuides(prev => prev.map(g =>
          g.id === voidingGuide.id ? { ...g, sunatStatus: 'voided' } : g
        ))
        toast.success(`Guía ${voidingGuide.number} marcada como anulada (Demo)`)
        setVoidingGuide(null)
        setVoidGuideReason('ANULACION DE GUIA DE REMISION')
        setIsVoidingGuide(false)
        return
      }

      const businessId = getBusinessId()

      // La guía se lee FRESCA de Firestore antes de decidir si hay que devolver
      // stock. `voidingGuide` es el objeto de la lista en memoria, y si el
      // descuento se hizo desde otra pestaña —o la lista no se refrescó— trae
      // `stockDeducted: false` viejo: la devolución se salteaba en silencio y el
      // stock quedaba descontado para siempre.
      //
      // Pasó de verdad (InduHealth, guía T001-00000076): anulada con
      // `stockDeducted: true`, sin ningún movimiento de devolución. Ese producto
      // quedó 10.000 abajo y despues el descuadre se arrastró a una
      // transferencia.
      let guiaFresca = voidingGuide
      try {
        const fresca = await getDispatchGuide(businessId, voidingGuide.id)
        if (fresca.success && fresca.data) guiaFresca = { ...voidingGuide, ...fresca.data }
      } catch (e) {
        console.warn('No se pudo releer la guía; se usa la de la lista:', e)
      }

      const result = await updateDispatchGuide(businessId, voidingGuide.id, {
        sunatStatus: 'voided',
        voidReason: voidGuideReason,
        voidedAt: new Date()
      })

      if (result.success) {
        // Restaurar stock si fue descontado. Usa el helper compartido para que la
        // restauración por lote sea consistente con el toggle manual.
        if (guiaFresca.stockDeducted && guiaFresca.warehouseId) {
          const { restoreStockForDispatchGuide } = await import('@/services/dispatchGuideStockService')
          const restoreRes = await restoreStockForDispatchGuide({
            businessId,
            guide: guiaFresca,
            userId: user?.uid,
            reason: 'Anulación guía de remisión',
            referenceType: 'dispatch_guide_void',
          })
          if (restoreRes.success) {
            toast.info('Stock restaurado al anular la guía')
          } else {
            // Un aviso suave se pierde: la guía queda anulada CON el stock
            // descontado, que es un descuadre que nadie va a notar hasta el
            // inventario. Se dice fuerte y el menú deja el botón para reintentar.
            toast.error(
              'La guía se anuló pero NO se pudo devolver el stock. Usa "Devolver stock" en el menú de la guía.',
              10000
            )
          }
        }
        toast.success(`Guía ${voidingGuide.number} marcada como anulada`)
        await loadGuides()
      } else {
        toast.error(`Error: ${result.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('Error al marcar guía como anulada:', error)
      toast.error(`Error: ${error.message}`)
    } finally {
      setVoidingGuide(null)
      setVoidGuideReason('ANULACION DE GUIA DE REMISION')
      setIsVoidingGuide(false)
    }
  }

  // Eliminar guía (solo si allowDeleteInvoices está activado y la guía NO fue aceptada por SUNAT)
  const handleDeleteGuide = async () => {
    if (!deletingGuide || isDeletingGuide) return
    setIsDeletingGuide(true)
    try {
      if (isDemoMode) {
        setGuides(prev => prev.filter(g => g.id !== deletingGuide.id))
        toast.success(`Guía ${deletingGuide.number} eliminada (Demo)`)
        return
      }
      const businessId = getBusinessId()
      const result = await deleteDispatchGuide(businessId, deletingGuide.id)
      if (result.success) {
        setGuides(prev => prev.filter(g => g.id !== deletingGuide.id))
        toast.success(`Guía ${deletingGuide.number} eliminada`)
      } else {
        toast.error(result.error || 'Error al eliminar la guía')
      }
    } catch (error) {
      console.error('Error al eliminar guía:', error)
      toast.error(`Error: ${error.message}`)
    } finally {
      setDeletingGuide(null)
      setIsDeletingGuide(false)
    }
  }

  // Búsqueda con haystack pre-construido (perf): re-normaliza solo cuando cambia
  // la lista de guías, no en cada keystroke.
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const guideSearchIndex = useMemo(() => {
    const map = new Map()
    for (const guide of guides) {
      map.set(guide.id, buildSearchHaystack(
        guide.number,
        guide.destination?.address,
        guide.destination?.businessName,
        guide.destination?.documentNumber,
      ))
    }
    return map
  }, [guides])

  // Filtrar guías (búsqueda flexible: multi-palabra parcial, sin acentos)
  const filteredGuides = guides.filter(canAccess).filter(guide => {
    const matchesSearch = matchesPrebuilt(deferredSearchTerm, guideSearchIndex.get(guide.id) || '')

    // Filtrar por sucursal
    let matchesBranch = true
    if (filterBranch !== 'all') {
      if (filterBranch === 'main') {
        matchesBranch = !guide.branchId
      } else {
        matchesBranch = guide.branchId === filterBranch
      }
    }

    return matchesSearch && matchesBranch
  })

  const displayedGuides = filteredGuides.slice(0, visibleCount)
  const hasMore = filteredGuides.length > visibleCount

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE)
  }, [searchTerm, filterBranch])

  // Calcular estadísticas (sobre guías filtradas)
  const stats = {
    total: filteredGuides.length,
    inTransit: filteredGuides.filter(g => g.status === 'in_transit').length,
    delivered: filteredGuides.filter(g => g.status === 'delivered').length,
    thisMonth: filteredGuides.filter(g => {
      if (!g.createdAt) return false
      const guideDate = g.createdAt.toDate ? g.createdAt.toDate() : new Date(g.createdAt)
      const now = new Date()
      return guideDate.getMonth() === now.getMonth() && guideDate.getFullYear() === now.getFullYear()
    }).length,
  }

  // Exportar las guías (filtradas) a Excel: listado detallado + resumen Mes × Estado.
  const handleExportExcel = async () => {
    if (filteredGuides.length === 0) {
      toast.error('No hay guías para exportar')
      return
    }
    setIsExporting(true)
    try {
      const { generateDispatchGuidesExcel } = await import('@/services/dispatchGuideExportService')
      const businessData = {
        name: companySettings?.razonSocial || companySettings?.businessName || companySettings?.name || 'N/A',
        ruc: companySettings?.ruc || 'N/A',
      }
      const branchLabel = filterBranch === 'all'
        ? 'Todas'
        : filterBranch === 'main'
          ? (businessSettings?.mainBranchName || 'Sucursal Principal')
          : (branches.find(b => b.id === filterBranch)?.name || 'Sucursal')
      await generateDispatchGuidesExcel(filteredGuides, businessData, branchLabel)
      toast.success('Excel generado correctamente')
    } catch (error) {
      console.error('Error al exportar guías a Excel:', error)
      toast.error('Error al generar el Excel')
    } finally {
      setIsExporting(false)
    }
  }

  const getStatusBadge = (status, sunatStatus) => {
    if (sunatStatus === 'voided') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
          <Ban className="w-3 h-3" />
          Anulada
        </span>
      )
    }

    if (sunatStatus === 'accepted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3" />
          Aceptada
        </span>
      )
    }

    if (sunatStatus === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
          <XCircle className="w-3 h-3" />
          Rechazada
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
        <Clock className="w-3 h-3" />
        Pendiente
      </span>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Guías de Remisión Electrónicas</h1>
            <GuideLink />
          </div>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona las guías de remisión para el transporte de mercancías
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleDownloadZip}
            disabled={zipeando || filteredGuides.length === 0}
            title="Descarga el PDF de todas las guías que estás viendo, en un solo archivo ZIP"
          >
            {zipeando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {zipeando ? `Armando ZIP ${avanceZip}` : 'Descargar PDFs (ZIP)'}
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleExportExcel}
            disabled={isExporting || filteredGuides.length === 0}
          >
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Exportar Excel
          </Button>
          <Button className="w-full sm:w-auto" onClick={handleCreateGuide}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Guía de Remisión
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-primary-50 border-l-4 border-primary-500 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-primary-900 mb-1">
              ¿Qué es una Guía de Remisión Electrónica (GRE)?
            </h3>
            <p className="text-sm text-primary-800 leading-relaxed">
              Es un documento electrónico obligatorio para el traslado de bienes, validado por SUNAT.
              Permite la trazabilidad del transporte y control fiscal. <strong>Obligatorio desde julio 2025.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Guías</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg">
                <FileText className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En Tránsito</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{stats.inTransit}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Truck className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Entregadas</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{stats.delivered}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <Package className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Este Mes</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.thisMonth}</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg">
                <FileText className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Barra de búsqueda */}
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar por número o destino..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>

            {/* Filtros */}
            {branches.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Guides List */}
      <Card>
        <CardHeader>
          <CardTitle>Listado de Guías de Remisión</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Cargando guías de remisión...</p>
            </div>
          ) : filteredGuides.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <Truck className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm || filterBranch !== 'all'
                  ? 'No se encontraron guías de remisión'
                  : 'No hay guías de remisión registradas'}
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {searchTerm || filterBranch !== 'all'
                  ? 'Intenta con otros filtros de búsqueda'
                  : 'Comienza a emitir guías de remisión electrónicas para documentar el transporte de tus mercancías.'}
              </p>
              {!searchTerm && filterBranch === 'all' && (
                <Button onClick={handleCreateGuide}>
                  <Plus className="w-5 h-5 mr-2" />
                  Crear Primera Guía de Remisión
                </Button>
              )}
            </div>
          ) : (
            <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {displayedGuides.map((guide) => (
                <div key={guide.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  {/* Fila 1: Número + fecha + acciones */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-primary-600 text-sm">{guide.number}</span>
                      <span className="text-xs text-gray-500">{formatTransferDate(guide.transferDate)}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const menuHeight = 350
                        const spaceBelow = window.innerHeight - rect.bottom
                        const openUpward = spaceBelow < menuHeight
                        setMenuPosition({
                          top: openUpward ? rect.top - 10 : rect.bottom + 10,
                          right: window.innerWidth - rect.right,
                          openUpward
                        })
                        setOpenMenuId(openMenuId === guide.id ? null : guide.id)
                      }}
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                      title="Acciones"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila 2: Destino (entidad principal) */}
                  <div className="flex items-start gap-1 mt-1 min-w-0">
                    <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm font-medium truncate">{guide.destination?.address || 'Sin destino'}</p>
                  </div>

                  {/* Fila 3: Motivo + transporte + items + estado */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>{TRANSFER_REASONS[guide.transferReason] || guide.transferReason}</span>
                      <span className="flex items-center gap-1">
                        <Truck className="w-3 h-3 text-gray-400" />
                        {TRANSPORT_MODES[guide.transportMode] || guide.transportMode}
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3 text-gray-400" />
                        {guide.items?.length || 0}
                      </span>
                    </div>
                    <div className="scale-90 origin-right">{getStatusBadge(guide.status, guide.sunatStatus)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla para desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Número
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha Traslado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Motivo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transporte
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Destino
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedGuides.map((guide) => (
                    <tr key={guide.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {guide.number}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatTransferDate(guide.transferDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {TRANSFER_REASONS[guide.transferReason] || guide.transferReason}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-900">
                          <Truck className="w-3 h-3 text-gray-400" />
                          {TRANSPORT_MODES[guide.transportMode] || guide.transportMode}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-1 text-sm text-gray-600 max-w-xs">
                          <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{guide.destination?.address}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-900">
                          <Package className="w-3 h-3 text-gray-400" />
                          {guide.items?.length || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(guide.status, guide.sunatStatus)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {/* Botón de menú */}
                        <button
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const menuHeight = 350
                            const spaceBelow = window.innerHeight - rect.bottom
                            const openUpward = spaceBelow < menuHeight

                            setMenuPosition({
                              top: openUpward ? rect.top - 10 : rect.bottom + 10,
                              right: window.innerWidth - rect.right,
                              openUpward
                            })
                            setOpenMenuId(openMenuId === guide.id ? null : guide.id)
                          }}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Acciones"
                        >
                          <MoreVertical className="w-5 h-5 text-gray-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>

          )}
        </CardContent>
      </Card>

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
            className="text-sm text-gray-600 hover:text-primary-600 transition-colors py-2 px-4 hover:bg-gray-50 rounded-lg"
          >
            Ver más guías ({filteredGuides.length - visibleCount} restantes)
          </button>
        </div>
      )}

      {/* Dropdown Menu (fuera del contenedor, con position fixed) */}
      {openMenuId && (
        <>
          {/* Backdrop para cerrar al hacer clic fuera */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpenMenuId(null)}
          />

          {/* Menu */}
          <div
            className="fixed w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
            style={{
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            {(() => {
              const guide = filteredGuides.find(g => g.id === openMenuId)
              if (!guide) return null

              return (
                <>
                  {/* Ver detalles */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      setSelectedGuide(guide)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Eye className="w-4 h-4 text-primary-600" />
                    <span>Ver detalles</span>
                  </button>

                  {/* Vista previa / Imprimir PDF */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      handlePreviewPdf(guide)
                    }}
                    disabled={previewingPdf === guide.id}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50"
                  >
                    {previewingPdf === guide.id ? (
                      <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                    ) : (
                      <Printer className="w-4 h-4 text-purple-600" />
                    )}
                    <span>{previewingPdf === guide.id ? 'Generando...' : 'Imprimir PDF'}</span>
                  </button>

                  {/* Imprimir Ticket (impresora térmica) */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      handlePrintTicket(guide)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Receipt className="w-4 h-4 text-orange-600" />
                    <span>Imprimir Ticket</span>
                  </button>

                  {/* Descargar PDF */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      handleDownloadPdf(guide)
                    }}
                    disabled={downloadingPdf === guide.id}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50"
                  >
                    {downloadingPdf === guide.id ? (
                      <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 text-green-600" />
                    )}
                    <span>{downloadingPdf === guide.id ? 'Generando...' : 'Descargar PDF'}</span>
                  </button>

                  {/* Compartir PDF (solo móvil) */}
                  {isNativePlatform && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleSharePdf(guide)
                      }}
                      disabled={sharingPdf === guide.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50"
                    >
                      {sharingPdf === guide.id ? (
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                      ) : (
                        <Share2 className="w-4 h-4 text-blue-600" />
                      )}
                      <span>{sharingPdf === guide.id ? 'Preparando...' : 'Compartir PDF'}</span>
                    </button>
                  )}

                  {/* XML SUNAT - Solo si fue aceptada */}
                  {guide.sunatStatus === 'accepted' && (guide.xmlStorageUrl || guide.xmlUrl || guide.sunatResponse?.xmlStorageUrl || guide.sunatResponse?.xmlUrl) && (
                    <button
                      onClick={async () => {
                        setOpenMenuId(null)
                        const xmlUrl = guide.xmlStorageUrl || guide.xmlUrl || guide.sunatResponse?.xmlStorageUrl || guide.sunatResponse?.xmlUrl
                        const xmlFilename = `${guide.number.replace(/\//g, '-')}_XML.xml`
                        await forceDownload(xmlUrl, xmlFilename)
                        toast.success('XML descargado exitosamente')
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                    >
                      <Code className="w-4 h-4 text-indigo-600" />
                      <span>XML SUNAT</span>
                    </button>
                  )}

                  {/* CDR SUNAT - Solo si fue aceptada */}
                  {guide.sunatStatus === 'accepted' && (guide.cdrStorageUrl || guide.cdrUrl || guide.sunatResponse?.cdrStorageUrl || guide.sunatResponse?.cdrUrl || guide.cdrData || guide.sunatResponse?.cdrData) && (
                    <button
                      onClick={async () => {
                        setOpenMenuId(null)
                        const cdrFilename = `CDR-${guide.number.replace(/\//g, '-')}.xml`
                        if (guide.cdrStorageUrl) {
                          await forceDownload(guide.cdrStorageUrl, cdrFilename)
                        } else if (guide.cdrUrl) {
                          await forceDownload(guide.cdrUrl, cdrFilename)
                        } else if (guide.sunatResponse?.cdrStorageUrl) {
                          await forceDownload(guide.sunatResponse.cdrStorageUrl, cdrFilename)
                        } else if (guide.sunatResponse?.cdrUrl) {
                          await forceDownload(guide.sunatResponse.cdrUrl, cdrFilename)
                        } else if (guide.cdrData || guide.sunatResponse?.cdrData) {
                          const cdrData = guide.cdrData || guide.sunatResponse.cdrData
                          const blob = new Blob([cdrData], { type: 'application/xml' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = cdrFilename
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        }
                        toast.success('CDR descargado exitosamente')
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                    >
                      <FileCheck className="w-4 h-4 text-green-600" />
                      <span>CDR SUNAT</span>
                    </button>
                  )}

                  {/* Clonar guía - Disponible para cualquier estado */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      setCloningGuide(guide)
                      setShowCreateModal(true)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-teal-50 flex items-center gap-3 text-teal-600"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Clonar guía</span>
                  </button>

                  {/* Separador antes de acciones de edición */}
                  {guide.sunatStatus !== 'accepted' && (
                    <div className="border-t border-gray-100 my-1" />
                  )}

                  {/* Editar - Solo si no está aceptada, anulada o anulando */}
                  {guide.sunatStatus !== 'accepted' && guide.sunatStatus !== 'voided' && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        setEditingGuide(guide)
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-amber-50 flex items-center gap-3 text-amber-600"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Editar guía</span>
                    </button>
                  )}

                  {/* Enviar a SUNAT - Solo si no está aceptada y no está anulada */}
                  {guide.sunatStatus !== 'accepted' && guide.sunatStatus !== 'voided' && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleSendToSunat(guide)
                      }}
                      disabled={sendingToSunat === guide.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-3 text-blue-600 disabled:opacity-50"
                    >
                      {sendingToSunat === guide.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>{sendingToSunat === guide.id ? 'Enviando...' : 'Enviar a SUNAT'}</span>
                    </button>
                  )}

                  {/* Descontar stock - Solo si no se ha descontado y tiene almacén */}
                  {!guide.stockDeducted && guide.warehouseId && guide.sunatStatus !== 'voided' && (
                    <button
                      onClick={async () => {
                        setOpenMenuId(null)
                        const { deductStockForDispatchGuide } = await import('@/services/dispatchGuideStockService')
                        const res = await deductStockForDispatchGuide({
                          businessId: getBusinessId(),
                          guide,
                          userId: user?.uid,
                        })
                        if (res.success) {
                          setGuides(prev => prev.map(g =>
                            g.id === guide.id
                              ? { ...g, stockDeducted: true, items: res.itemsWithBreakdown || g.items }
                              : g
                          ))
                          toast.success('Stock descontado exitosamente')
                        } else {
                          toast.error('Error al descontar stock')
                        }
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-amber-50 flex items-center gap-3 text-amber-700"
                    >
                      <Package className="w-4 h-4" />
                      <span>Descontar stock</span>
                    </button>
                  )}

                  {/* Devolver el stock descontado.
                      También en guías ANULADAS: si la devolución automática falló,
                      la guía queda anulada con el stock descontado y este botón es
                      la ÚNICA forma de arreglarlo. Antes se ocultaba justo ahí
                      —cuando `sunatStatus === 'voided'`— y el descuadre quedaba
                      sin salida desde la pantalla. */}
                  {guide.stockDeducted && guide.warehouseId && (
                    <button
                      onClick={async () => {
                        setOpenMenuId(null)
                        const { restoreStockForDispatchGuide } = await import('@/services/dispatchGuideStockService')
                        const res = await restoreStockForDispatchGuide({
                          businessId: getBusinessId(),
                          guide,
                          userId: user?.uid,
                        })
                        if (res.success) {
                          setGuides(prev => prev.map(g =>
                            g.id === guide.id
                              ? {
                                  ...g,
                                  stockDeducted: false,
                                  items: (g.items || []).map(it => {
                                    const { batchBreakdown, ...rest } = it
                                    return rest
                                  }),
                                }
                              : g
                          ))
                          toast.success('Stock restaurado exitosamente')
                        } else {
                          toast.error('Error al revertir descuento de stock')
                        }
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-3 text-green-700"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {/* En una guia ANULADA esto ya no es "revertir": es arreglar
                          un descuadre que quedo colgado. El texto lo dice. */}
                      <span>
                        {guide.sunatStatus === 'voided' ? 'Devolver stock (quedó pendiente)' : 'Revertir descuento'}
                      </span>
                    </button>
                  )}

                  {/* Marcar como anulada - Solo si está aceptada */}
                  {guide.sunatStatus === 'accepted' && (() => {
                    const validation = canVoidDispatchGuide(guide)
                    return validation.canVoid
                  })() && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        setVoidingGuide(guide)
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-600"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Anular guía</span>
                    </button>
                  )}

                  {/* Eliminar - Solo si está habilitado en Configuración Y NO fue aceptada por SUNAT */}
                  {businessSettings?.allowDeleteInvoices && guide.sunatStatus !== 'accepted' && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          setDeletingGuide(guide)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Eliminar</span>
                      </button>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </>
      )}

      {/* Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <MapPin className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Origen y Destino</h4>
                <p className="text-sm text-gray-600">
                  Registra los puntos de partida y llegada con dirección completa y ubigeo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Datos de Transporte</h4>
                <p className="text-sm text-gray-600">
                  Incluye información del conductor, vehículo y transportista según modalidad.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Package className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Bienes a Transportar</h4>
                <p className="text-sm text-gray-600">
                  Detalla los productos, cantidades, peso total y motivo del traslado.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Void Guide Confirmation Modal */}
      {voidingGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Ban className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Anular Guía de Remisión</h2>
                  <p className="text-red-100 text-sm">{voidingGuide.number}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setVoidingGuide(null)
                  setVoidGuideReason('ANULACION DE GUIA DE REMISION')
                }}
                disabled={isVoidingGuide}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">Proceso de anulación</p>
                    <p className="mb-2">SUNAT no permite anular guías de remisión por webservice. Debe hacerlo manualmente desde el portal SOL de SUNAT.</p>
                    <a
                      href="https://e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-700 underline font-medium hover:text-blue-900"
                    >
                      Ir al portal SUNAT
                      <Share2 className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p>Una vez anulada en SUNAT, presione <strong>"Marcar como anulada"</strong> para actualizar el estado en el sistema.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motivo de anulación
                </label>
                <select
                  value={voidGuideReason}
                  onChange={(e) => setVoidGuideReason(e.target.value)}
                  disabled={isVoidingGuide}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:opacity-50"
                >
                  <option value="ANULACION DE GUIA DE REMISION">Anulación de guía de remisión</option>
                  <option value="ERROR EN DATOS DE LA GUIA">Error en datos de la guía</option>
                  <option value="TRASLADO CANCELADO">Traslado cancelado</option>
                  <option value="DUPLICIDAD DE DOCUMENTO">Duplicidad de documento</option>
                  <option value="ERROR EN DATOS DEL DESTINATARIO">Error en datos del destinatario</option>
                  <option value="ERROR EN DATOS DEL TRANSPORTE">Error en datos del transporte</option>
                </select>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Número:</span>
                    <p className="font-medium">{voidingGuide.number}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Fecha traslado:</span>
                    <p className="font-medium">{formatTransferDate(voidingGuide.transferDate)}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Destino:</span>
                    <p className="font-medium truncate">{voidingGuide.destination?.address || '-'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setVoidingGuide(null)
                  setVoidGuideReason('ANULACION DE GUIA DE REMISION')
                }}
                disabled={isVoidingGuide}
              >
                Cancelar
              </Button>
              <button
                onClick={handleVoidGuide}
                disabled={isVoidingGuide}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {isVoidingGuide ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Ban className="w-4 h-4" />
                    Marcar como anulada
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Guide Modal */}
      {deletingGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Trash2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Eliminar Guía de Remisión</h2>
                  <p className="text-red-100 text-sm">{deletingGuide.number}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-700">
                Esta acción eliminará permanentemente la guía <strong>{deletingGuide.number}</strong>. No se podrá recuperar.
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <strong>Importante:</strong> Eliminar el registro no revierte el descuento de stock si ya se había aplicado.
                Si necesitás devolver el stock, usá la opción "Anular guía" o "Revertir descuento" antes de eliminar.
              </div>
            </div>
            <div className="border-t px-6 py-4 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeletingGuide(null)}
                disabled={isDeletingGuide}
              >
                Cancelar
              </Button>
              <button
                onClick={handleDeleteGuide}
                disabled={isDeletingGuide}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {isDeletingGuide ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Guide Modal */}
      <CreateDispatchGuideModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setCloningGuide(null)
          loadGuides()
        }}
        selectedBranch={filterBranch !== 'all' && filterBranch !== 'main' ? branches.find(b => b.id === filterBranch) : null}
        cloneData={cloningGuide}
      />

      {/* Edit Guide Modal */}
      <EditDispatchGuideModal
        isOpen={!!editingGuide}
        onClose={() => {
          setEditingGuide(null)
          loadGuides() // Recargar guías después de editar
        }}
        guide={editingGuide}
      />

      {/* Detail Guide Modal */}
      {selectedGuide && (() => {
        // Extraer datos de transporte de las diferentes ubicaciones posibles
        const driver = selectedGuide.transport?.driver || selectedGuide.driver || {}
        const vehicle = selectedGuide.transport?.vehicle || selectedGuide.vehicle || {}
        const carrier = selectedGuide.transport?.carrier || selectedGuide.carrier || {}
        const recipient = selectedGuide.recipient || selectedGuide.customer || {}
        const driverFullName = [driver.name, driver.lastName].filter(Boolean).join(' ') || '-'

        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            {/* Header — la misma chrome que el resto de los modales del
                sistema (blanco, título oscuro, X gris). La barra azul con el
                ícono en un cuadro no se parecía a ninguna otra pantalla. */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-gray-900">Guía de Remisión</h3>
                <p className="text-sm text-gray-500 mt-0.5">{selectedGuide.number}</p>
              </div>
              <button
                onClick={() => setSelectedGuide(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] space-y-6">
              {/* Estado */}
              <div className="flex justify-center">
                {getStatusBadge(selectedGuide.status, selectedGuide.sunatStatus)}
              </div>

              {/* Por qué SUNAT la rechazó. Estaba solo en el comprobante, y en
                  la guía había que adivinarlo: el usuario veía "Rechazada" y
                  nada más. Se lee de sunatDescription/sunatResponseCode, que es
                  donde la guarda el envío (el comprobante usa sunatResponse). */}
              {(selectedGuide.sunatStatus === 'rejected' || selectedGuide.sunatStatus === 'error') && (selectedGuide.sunatDescription || selectedGuide.sunatResponseCode) && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-red-800">
                        {selectedGuide.sunatStatus === 'rejected' ? 'Rechazada por SUNAT' : 'No se pudo enviar a SUNAT'}
                      </p>
                      <p className="text-sm text-red-700 mt-1 break-words">
                        {selectedGuide.sunatDescription || 'Sin detalle'}
                      </p>
                      {selectedGuide.sunatResponseCode && (
                        <p className="text-xs text-red-600 mt-1">Código SUNAT {selectedGuide.sunatResponseCode}</p>
                      )}
                      <p className="text-xs text-red-600 mt-2">
                        Una guía rechazada no existe para SUNAT: corrige el dato que reclama y emite una nueva.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Documento de Referencia */}
              {selectedGuide.referencedInvoice && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Documento de Referencia
                  </h3>
                  <div className="text-sm">
                    <span className="text-gray-500">Comprobante: </span>
                    <span className="font-medium">
                      {selectedGuide.referencedInvoice.documentType === '01' ? 'FACTURA' :
                       selectedGuide.referencedInvoice.documentType === '03' ? 'BOLETA' : 'COMPROBANTE'}{' '}
                      {selectedGuide.referencedInvoice.fullNumber ||
                       `${selectedGuide.referencedInvoice.series}-${selectedGuide.referencedInvoice.number}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Datos del Traslado */}
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Datos del Traslado
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Fecha de emisión:</span>
                    <p className="font-medium">{formatTransferDate(selectedGuide.issueDate)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Fecha de traslado:</span>
                    <p className="font-medium">{formatTransferDate(selectedGuide.transferDate)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Motivo:</span>
                    <p className="font-medium">{TRANSFER_REASONS[selectedGuide.transferReason] || selectedGuide.transferReason}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Modalidad:</span>
                    <p className="font-medium">{TRANSPORT_MODES[selectedGuide.transportMode] || selectedGuide.transportMode}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Peso total:</span>
                    <p className="font-medium">{selectedGuide.totalWeight || '0'} {selectedGuide.weightUnit === 'TNE' ? 'TNE' : 'KG'}</p>
                  </div>
                  {selectedGuide.transportMode === '01' && selectedGuide.carrierDeliveryDate && (
                    <div>
                      <span className="text-gray-500">Entrega al transportista:</span>
                      <p className="font-medium">{formatTransferDate(selectedGuide.carrierDeliveryDate)}</p>
                    </div>
                  )}
                  {selectedGuide.isM1LVehicle && (
                    <div>
                      <span className="text-gray-500">Vehículo:</span>
                      <p className="font-medium">Categoría M1 o L</p>
                    </div>
                  )}
                  {/* La descripción del motivo es lo que SUNAT exige con el
                      motivo "Otros", y no se veía en ningún lado. */}
                  {selectedGuide.transferDescription && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Descripción del motivo:</span>
                      <p className="font-medium break-words">{selectedGuide.transferDescription}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Puntos de Traslado */}
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  Puntos de Traslado
                </h3>
                <div className="space-y-3 text-sm">
                  {[
                    { etiqueta: 'Punto de partida', p: selectedGuide.origin, respaldo: companySettings?.address },
                    { etiqueta: 'Punto de llegada', p: selectedGuide.destination, respaldo: null },
                  ].map(({ etiqueta, p, respaldo }) => {
                    const zona = [p?.district, p?.province, p?.department].filter(Boolean).join(' · ')
                    return (
                      <div key={etiqueta}>
                        <span className="text-gray-500">{etiqueta}:</span>
                        <p className="font-medium">{p?.address || respaldo || '-'}</p>
                        {zona && <p className="text-xs text-gray-500">{zona}</p>}
                        {p?.ubigeo && <p className="text-xs text-gray-400">Ubigeo: {p.ubigeo}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Destinatario */}
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  Destinatario
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Razón social:</span>
                    <p className="font-medium">{recipient.name || recipient.businessName || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">
                      {documentLabelLong(recipient.documentType, recipient.documentNumber)}:
                    </span>
                    <p className="font-medium">{recipient.documentNumber || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Datos de Transporte - Privado */}
              {selectedGuide.transportMode === '02' && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-gray-400" />
                    Vehículo y Conductor
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Placa:</span>
                      <p className="font-medium">{vehicle.plate || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Conductor:</span>
                      <p className="font-medium">{driverFullName}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">DNI Conductor:</span>
                      <p className="font-medium">{driver.documentNumber || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Licencia:</span>
                      <p className="font-medium">{driver.license || '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Datos de Transporte - Público */}
              {selectedGuide.transportMode === '01' && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-gray-400" />
                    Transportista
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Razón social:</span>
                      <p className="font-medium">{carrier.businessName || carrier.name || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">RUC:</span>
                      <p className="font-medium">{carrier.ruc || '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Bienes */}
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-400" />
                  Bienes a Transportar ({selectedGuide.items?.length || 0})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 text-gray-600">#</th>
                        <th className="text-left py-2 px-2 text-gray-600">Descripción</th>
                        {businessMode === 'pharmacy' && (
                          <>
                            <th className="text-left py-2 px-2 text-gray-600">Marca</th>
                            <th className="text-left py-2 px-2 text-gray-600">Laborat.</th>
                            <th className="text-left py-2 px-2 text-gray-600">Lote</th>
                          </>
                        )}
                        <th className="text-center py-2 px-2 text-gray-600">Cantidad</th>
                        <th className="text-center py-2 px-2 text-gray-600">Unidad</th>
                        <th className="text-center py-2 px-2 text-gray-600">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedGuide.items || []).map((item, index) => (
                        <tr key={index} className="border-b border-gray-100">
                          <td className="py-2 px-2 text-gray-500">{index + 1}</td>
                          <td className="py-2 px-2">
                            <span className="font-medium">{item.description || item.name || '-'}</span>
                            {(item.code || item.sunatCode || item.gtin) && (
                              <span className="block text-xs text-gray-500">
                                {[
                                  item.code && `Cód. ${item.code}`,
                                  item.sunatCode && `SUNAT ${item.sunatCode}`,
                                  item.gtin && `GTIN ${item.gtin}`,
                                ].filter(Boolean).join(' · ')}
                              </span>
                            )}
                            {item.serialNumber && (
                              <span className="block text-xs text-amber-700">S/N: {item.serialNumber}</span>
                            )}
                          </td>
                          {businessMode === 'pharmacy' && (
                            <>
                              <td className="py-2 px-2 text-gray-600">{item.marca || '-'}</td>
                              <td className="py-2 px-2 text-gray-600">{item.laboratoryName || '-'}</td>
                              <td className="py-2 px-2 text-gray-600 text-xs">
                                {item.batchNumber || '-'}
                                {item.batchExpiryDate && (
                                  <span className="block text-gray-400">
                                    Venc: {item.batchExpiryDate?.toDate
                                      ? item.batchExpiryDate.toDate().toLocaleDateString('es-PE')
                                      : item.batchExpiryDate?.seconds
                                        ? new Date(item.batchExpiryDate.seconds * 1000).toLocaleDateString('es-PE')
                                        : typeof item.batchExpiryDate === 'string'
                                          ? item.batchExpiryDate
                                          : '-'}
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                          <td className="py-2 px-2 text-center">{item.quantity || 1}</td>
                          <td className="py-2 px-2 text-center">{item.unit || 'UNIDAD'}</td>
                          <td className="py-2 px-2 text-center text-gray-600">
                            {item.weight != null && item.weight !== '' ? item.weight : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Proveedor — solo con motivo 02 (Compra), donde el
                  destinatario es la propia empresa y el dato clave es de quién
                  se compró. Nunca se había mostrado. */}
              {selectedGuide.supplier && (selectedGuide.supplier.documentNumber || selectedGuide.supplier.name) && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Store className="w-4 h-4 text-gray-400" />
                    Proveedor
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Razón social:</span>
                      <p className="font-medium">{selectedGuide.supplier.name || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">RUC:</span>
                      <p className="font-medium">{selectedGuide.supplier.documentNumber || '-'}</p>
                    </div>
                    {selectedGuide.supplier.address && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Dirección:</span>
                        <p className="font-medium">{selectedGuide.supplier.address}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Documentos relacionados (facturas del proveedor, etc.) */}
              {selectedGuide.relatedDocuments?.length > 0 && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Documentos Relacionados ({selectedGuide.relatedDocuments.length})
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {selectedGuide.relatedDocuments.map((doc, i) => (
                      <li key={i} className="flex flex-wrap gap-x-2 text-gray-700">
                        <span className="font-medium">{doc.fullNumber || `${doc.series}-${doc.number}`}</span>
                        {doc.supplierName && <span className="text-gray-500">· {doc.supplierName}</span>}
                        {doc.supplierRuc && <span className="text-gray-400">({doc.supplierRuc})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Vehículos y conductores adicionales */}
              {(selectedGuide.transport?.additionalVehicles?.length > 0 || selectedGuide.transport?.additionalDrivers?.length > 0) && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-gray-400" />
                    Vehículos y Conductores Adicionales
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {selectedGuide.transport?.additionalVehicles?.length > 0 && (
                      <div>
                        <span className="text-gray-500">Vehículos:</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {selectedGuide.transport.additionalVehicles.map((v, i) => (
                            <li key={i} className="font-medium">{v.plate}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedGuide.transport?.additionalDrivers?.length > 0 && (
                      <div>
                        <span className="text-gray-500">Conductores:</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {selectedGuide.transport.additionalDrivers.map((d, i) => (
                            <li key={i} className="font-medium">
                              {[d.name, d.lastName].filter(Boolean).join(' ') || 'Sin nombre'}
                              <span className="text-gray-500 font-normal"> · DNI {d.documentNumber || '-'}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Observaciones */}
              {selectedGuide.additionalInfo && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Observaciones
                  </h3>
                  <p className="text-sm text-gray-700 whitespace-pre-line break-words">{selectedGuide.additionalInfo}</p>
                </div>
              )}

              {/* Registro interno: de dónde salió la guía y qué hizo con el
                  stock. No va en el documento que se imprime, pero es lo
                  primero que uno quiere saber cuando algo no cuadra. */}
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Hash className="w-4 h-4 text-gray-400" />
                  Registro
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Sucursal:</span>
                    <p className="font-medium">{selectedGuide.branchName || 'Principal'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Almacén:</span>
                    <p className="font-medium">{selectedGuide.warehouseName || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Descontó stock:</span>
                    <p className="font-medium">{selectedGuide.stockDeducted ? 'Sí' : 'No'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Cómo se emitió:</span>
                    <p className="font-medium">{selectedGuide.bulkSource === 'excel' ? 'Emisión masiva' : 'Individual'}</p>
                  </div>
                  {selectedGuide.sunatMethod && (
                    <div>
                      <span className="text-gray-500">Envío a SUNAT:</span>
                      <p className="font-medium">{selectedGuide.sunatMethod}</p>
                    </div>
                  )}
                  {selectedGuide.sunatResponseCode && (
                    <div>
                      <span className="text-gray-500">Código SUNAT:</span>
                      <p className="font-medium">{selectedGuide.sunatResponseCode}</p>
                    </div>
                  )}
                  {selectedGuide.createdAt && (
                    <div>
                      <span className="text-gray-500">Creada:</span>
                      <p className="font-medium">
                        {(selectedGuide.createdAt?.toDate
                          ? selectedGuide.createdAt.toDate()
                          : new Date(selectedGuide.createdAt?.seconds ? selectedGuide.createdAt.seconds * 1000 : selectedGuide.createdAt)
                        ).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
                  {selectedGuide.convertedFrom?.number && (
                    <div>
                      <span className="text-gray-500">Viene de:</span>
                      <p className="font-medium">Cotización {selectedGuide.convertedFrom.number}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Hash SUNAT */}
              {selectedGuide.sunatHash && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Hash className="w-4 h-4 text-gray-400" />
                    Hash SUNAT
                  </h3>
                  <p className="text-sm font-mono text-gray-600 break-all">{selectedGuide.sunatHash}</p>
                </div>
              )}
            </div>

            {/* Footer: botones todos del mismo tamaño. Estaban mezclados
                —unos `size="sm"` y otros no— y por eso se veían desparejos y
                "Generar Factura" partía en dos líneas. */}
            <div className="border-t border-gray-200 px-4 py-4 bg-white">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedGuide(null)}
                  >
                    Cerrar
                  </Button>

                  {/* Generar Factura desde Guía */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const guide = selectedGuide
                      const recipient = guide.recipient || guide.customer || {}
                      navigate('/app/pos', {
                        state: {
                          fromDispatchGuide: true,
                          guideId: guide.id,
                          guideNumber: guide.number,
                          stockAlreadyDeducted: !!guide.stockDeducted,
                          customer: {
                            documentType: recipient.documentType || '6',
                            documentNumber: recipient.documentNumber || '',
                            name: recipient.name || '',
                            businessName: recipient.businessName || recipient.name || '',
                            address: recipient.address || '',
                            email: recipient.email || '',
                          },
                          items: (guide.items || []).map(item => ({
                            productId: item.productId || '',
                            name: item.name || item.description || '',
                            description: item.description || item.name || '',
                            quantity: item.quantity || 1,
                            unit: item.unit || 'NIU',
                            price: 0,
                            code: item.code || '',
                            marca: item.marca || '',
                            laboratoryName: item.laboratoryName || '',
                            batchNumber: item.batchNumber || '',
                            batchExpiryDate: item.batchExpiryDate || '',
                          })),
                        }
                      })
                      toast.info(`Guía ${guide.number} cargada en el POS. Completa los precios y emite la factura.`)
                    }}
                  >
                    <ShoppingCart className="w-4 h-4 mr-1" />
                    Generar Factura
                  </Button>

                  {/* Descargar XML - Solo si tiene XML guardado */}
                  {selectedGuide.sunatStatus === 'accepted' && (selectedGuide.xmlStorageUrl || selectedGuide.xmlUrl || selectedGuide.sunatResponse?.xmlStorageUrl || selectedGuide.sunatResponse?.xmlUrl) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const xmlUrl = selectedGuide.xmlStorageUrl || selectedGuide.xmlUrl || selectedGuide.sunatResponse?.xmlStorageUrl || selectedGuide.sunatResponse?.xmlUrl
                        const xmlFilename = `${selectedGuide.number.replace(/\//g, '-')}_XML.xml`
                        await forceDownload(xmlUrl, xmlFilename)
                        toast.success('XML descargado exitosamente')
                      }}
                    >
                      <Code className="w-4 h-4 mr-1" />
                      XML
                    </Button>
                  )}

                  {/* Descargar CDR - Solo si fue aceptada y tiene CDR */}
                  {selectedGuide.sunatStatus === 'accepted' && (selectedGuide.cdrStorageUrl || selectedGuide.cdrUrl || selectedGuide.sunatResponse?.cdrStorageUrl || selectedGuide.sunatResponse?.cdrUrl || selectedGuide.cdrData || selectedGuide.sunatResponse?.cdrData) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const cdrFilename = `CDR-${selectedGuide.number.replace(/\//g, '-')}.xml`
                        if (selectedGuide.cdrStorageUrl) {
                          await forceDownload(selectedGuide.cdrStorageUrl, cdrFilename)
                        } else if (selectedGuide.cdrUrl) {
                          await forceDownload(selectedGuide.cdrUrl, cdrFilename)
                        } else if (selectedGuide.sunatResponse?.cdrStorageUrl) {
                          await forceDownload(selectedGuide.sunatResponse.cdrStorageUrl, cdrFilename)
                        } else if (selectedGuide.sunatResponse?.cdrUrl) {
                          await forceDownload(selectedGuide.sunatResponse.cdrUrl, cdrFilename)
                        } else if (selectedGuide.cdrData || selectedGuide.sunatResponse?.cdrData) {
                          const cdrData = selectedGuide.cdrData || selectedGuide.sunatResponse.cdrData
                          const blob = new Blob([cdrData], { type: 'application/xml' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = cdrFilename
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        }
                        toast.success('CDR descargado exitosamente')
                      }}
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      CDR
                    </Button>
                  )}


                  {/* Vista previa / Imprimir PDF */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePreviewPdf(selectedGuide)}
                    disabled={previewingPdf === selectedGuide.id}
                  >
                    {previewingPdf === selectedGuide.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4 mr-2" />
                        PDF
                      </>
                    )}
                  </Button>

                  {/* Imprimir Ticket */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePrintTicket(selectedGuide)}
                  >
                    <Receipt className="w-4 h-4 mr-2" />
                    Ticket
                  </Button>

                  {/* Compartir (móvil) o Descargar (web) */}
                  {isNativePlatform ? (
                    <Button
                    size="sm"
                      onClick={() => handleSharePdf(selectedGuide)}
                      disabled={sharingPdf === selectedGuide.id}
                    >
                      {sharingPdf === selectedGuide.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Preparando...
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4 mr-2" />
                          Compartir PDF
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                    size="sm"
                      onClick={() => handleDownloadPdf(selectedGuide)}
                      disabled={downloadingPdf === selectedGuide.id}
                    >
                      {downloadingPdf === selectedGuide.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Descargar PDF
                        </>
                      )}
                    </Button>
                  )}
              </div>
            </div>

          </div>
        </div>
        )
      })()}

      {/* Componente de ticket para impresión */}
      {printingTicket && (
        <DispatchGuideTicket
          ref={ticketRef}
          guide={printingTicket}
          companySettings={companySettings}
          paperWidth={ticketPaperWidth}
          printMargins={printMargins}
          simplePrint={simplePrint}
        />
      )}
    </div>
  )
}
