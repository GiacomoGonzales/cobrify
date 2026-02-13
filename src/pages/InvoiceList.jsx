import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  Loader2,
  FileText,
  AlertTriangle,
  AlertCircle,
  Printer,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  Ban,
  FileMinus,
  FilePlus,
  MoreVertical,
  FileSpreadsheet,
  Share2,
  Truck,
  ArrowRightCircle,
  Receipt,
  Code,
  FileCheck,
  Archive,
  Store,
  User,
  ShoppingCart,
  Copy,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useBranding } from '@/contexts/BrandingContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { getInvoices, deleteInvoice, updateInvoice, getCompanySettings, sendInvoiceToSunat, sendCreditNoteToSunat } from '@/services/firestoreService'
import { generateInvoicePDF, getInvoicePDFBlob, previewInvoicePDF, preloadLogo } from '@/utils/pdfGenerator'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, updateDoc } from 'firebase/firestore'
import { storage, db } from '@/lib/firebase'
import { prepareInvoiceXML, downloadCompressedXML, isSunatConfigured, voidDocument, canVoidDocument, checkVoidStatus } from '@/services/sunatService'
import { generateInvoicesExcel } from '@/services/invoiceExportService'
import { exportXMLandCDR, downloadZip, generateZipFileName } from '@/services/xmlExportService'
import InvoiceTicket from '@/components/InvoiceTicket'
import CreateDispatchGuideModal from '@/components/CreateDispatchGuideModal'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { printInvoiceTicket, connectPrinter, getPrinterConfig } from '@/services/thermalPrinterService'
import { shortenUrl } from '@/services/urlShortenerService'
import { getActiveBranches } from '@/services/branchService'

export default function InvoiceList() {
  const { user, isDemoMode, demoData, getBusinessId, businessSettings, filterBranchesByAccess } = useAppContext()
  const { branding } = useBranding()
  const navigate = useNavigate()
  const toast = useToast()
  const [invoices, setInvoices] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const ticketRef = useRef()

  // Helper para manejar fechas - priorizar fecha de emisión sobre fecha de creación
  const getInvoiceDate = (invoice) => {
    // Usar emissionDate si existe (fecha de emisión configurada en el POS)
    if (invoice?.emissionDate) {
      if (invoice.emissionDate.toDate) return invoice.emissionDate.toDate()
      if (typeof invoice.emissionDate === 'string') {
        // emissionDate es solo fecha "YYYY-MM-DD", tomar la hora de createdAt
        const createdAt = invoice.createdAt?.toDate?.() || (invoice.createdAt ? new Date(invoice.createdAt) : null)
        if (createdAt) {
          const [year, month, day] = invoice.emissionDate.split('-').map(Number)
          const combined = new Date(createdAt)
          combined.setFullYear(year, month - 1, day)
          return combined
        }
        return new Date(invoice.emissionDate + 'T12:00:00')
      }
      return new Date(invoice.emissionDate)
    }
    // Fallback a createdAt
    if (!invoice?.createdAt) return null
    return invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
  }
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterSeller, setFilterSeller] = useState('all')
  const [filterBranch, setFilterBranch] = useState('all') // 'all', 'main', o branchId
  const [branches, setBranches] = useState([])
  const [dateFilter, setDateFilter] = useState('all') // 'all', 'today', '3days', '7days', '30days', 'custom'
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [viewingInvoice, setViewingInvoice] = useState(null)
  const [deletingInvoice, setDeletingInvoice] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [sendingToSunat, setSendingToSunat] = useState(null) // ID de factura siendo enviada a SUNAT
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false) // Estado de envío por WhatsApp
  const [openMenuId, setOpenMenuId] = useState(null) // ID del menú de acciones abierto
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: true }) // Posición del menú

  // Pagination for invoices
  const [visibleInvoicesCount, setVisibleInvoicesCount] = useState(20)
  const INVOICES_PER_PAGE = 20

  // Estados para exportación
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFilters, setExportFilters] = useState({
    types: ['factura', 'boleta', 'nota_venta', 'nota_credito', 'nota_debito'], // Array de tipos seleccionados
    sunatStatus: 'all', // 'all', 'accepted', 'pending', 'rejected', 'not_applicable'
    startDate: '',
    endDate: '',
    excludeConverted: true, // Por defecto excluir boletas convertidas desde notas
  })

  // Estados para exportación XML/CDR
  const [showXMLExportModal, setShowXMLExportModal] = useState(false)
  const [xmlExportFilters, setXmlExportFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    includeXML: true,
    includeCDR: true,
  })
  const [isExportingXML, setIsExportingXML] = useState(false)
  const [xmlExportProgress, setXmlExportProgress] = useState(0)

  // Estados para modal de guía de remisión
  const [showDispatchGuideModal, setShowDispatchGuideModal] = useState(false)
  const [selectedInvoiceForGuide, setSelectedInvoiceForGuide] = useState(null)

  // Estados para anulación de notas de venta
  const [voidingInvoice, setVoidingInvoice] = useState(null)
  const [isVoiding, setIsVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  // Estados para anulación de facturas SUNAT (Comunicación de Baja)
  const [voidingSunatInvoice, setVoidingSunatInvoice] = useState(null)
  const [isVoidingSunat, setIsVoidingSunat] = useState(false)
  const [voidSunatReason, setVoidSunatReason] = useState('')

  // Estados para registro de pagos
  const [paymentInvoice, setPaymentInvoice] = useState(null)
  const [isRegisteringPayment, setIsRegisteringPayment] = useState(false)
  const [newPaymentAmount, setNewPaymentAmount] = useState('')
  const [newPaymentMethod, setNewPaymentMethod] = useState('Efectivo')

  // Estado para configuración de impresión web legible y compacta
  const [webPrintLegible, setWebPrintLegible] = useState(false)
  const [compactPrint, setCompactPrint] = useState(false)

  // Cargar configuración de impresora para webPrintLegible y compactPrint
  useEffect(() => {
    const loadPrinterConfig = async () => {
      if (!user?.uid) return
      const printerConfigResult = await getPrinterConfig(getBusinessId())
      console.log('📄 InvoiceList - Resultado getPrinterConfig:', printerConfigResult)
      if (printerConfigResult.success && printerConfigResult.config) {
        const webPrintValue = printerConfigResult.config.webPrintLegible || false
        console.log('📄 InvoiceList - webPrintLegible cargado:', webPrintValue)
        setWebPrintLegible(webPrintValue)
        setCompactPrint(printerConfigResult.config.compactPrint || false)
      }
    }
    loadPrinterConfig()
  }, [user])

  // Función para imprimir ticket
  const handlePrintTicket = async () => {
    if (!viewingInvoice || !companySettings) return

    const isNative = Capacitor.isNativePlatform()

    // Si es móvil, intentar imprimir en impresora térmica
    if (isNative) {
      try {
        // Obtener configuración de impresora
        const printerConfigResult = await getPrinterConfig(getBusinessId())

        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          // Reconectar a la impresora
          const connectResult = await connectPrinter(printerConfigResult.config.address)

          if (!connectResult.success) {
            toast.error('No se pudo conectar a la impresora: ' + connectResult.error)
            toast.info('Usando impresión estándar...')
          } else {
            // Imprimir en impresora térmica (80mm por defecto)
            const result = await printInvoiceTicket(viewingInvoice, companySettings, printerConfigResult.config.paperWidth || 80)

            if (result.success) {
              toast.success('Comprobante impreso en ticketera')
              return
            } else {
              toast.error('Error al imprimir en ticketera: ' + result.error)
              toast.info('Usando impresión estándar...')
            }
          }
        }
      } catch (error) {
        console.error('Error al imprimir en ticketera:', error)
        toast.info('Usando impresión estándar...')
      }
    }

    // Fallback: impresión estándar (web o si falla la térmica)
    window.print()
  }

  const handleSendWhatsApp = async (invoice) => {
    if (!invoice) return

    // Verificar si hay teléfono del cliente
    const phone = invoice.customer?.phone

    if (!phone) {
      toast.error('El cliente no tiene un número de teléfono registrado')
      return
    }

    setSendingWhatsApp(true)
    try {
      toast.info('Generando comprobante...')

      // Generar el PDF como blob
      const pdfBlob = await getInvoicePDFBlob(invoice, companySettings, branding)

      // Preparar nombre del archivo
      const docTypeFile = invoice.documentType === 'factura' ? 'Factura' :
                          invoice.documentType === 'boleta' ? 'Boleta' :
                          invoice.documentType === 'nota_credito' ? 'NotaCredito' :
                          invoice.documentType === 'nota_debito' ? 'NotaDebito' : 'NotaVenta'
      const fileName = `${docTypeFile}_${invoice.number.replace(/\//g, '-')}_${Date.now()}.pdf`

      // Subir a Firebase Storage
      toast.info('Subiendo comprobante...')
      const businessId = getBusinessId()
      const storageRef = ref(storage, `comprobantes/${businessId}/${fileName}`)
      await uploadBytes(storageRef, pdfBlob, { contentType: 'application/pdf' })

      // Obtener URL de descarga
      const downloadURL = await getDownloadURL(storageRef)
      console.log('PDF subido:', downloadURL)

      // Acortar URL usando cbrfy.link
      const shortURL = await shortenUrl(downloadURL, businessId, invoice.id)
      console.log('URL acortada:', shortURL)

      // Preparar datos para WhatsApp
      const cleanPhone = phone.replace(/\D/g, '')
      let formattedPhone = cleanPhone
      if (formattedPhone.length === 9 && formattedPhone.startsWith('9')) {
        formattedPhone = '51' + formattedPhone
      }
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '51' + formattedPhone.substring(1)
      }

      const docTypeName = invoice.documentType === 'factura' ? 'Factura' :
                          invoice.documentType === 'boleta' ? 'Boleta' :
                          invoice.documentType === 'nota_credito' ? 'Nota de Crédito' :
                          invoice.documentType === 'nota_debito' ? 'Nota de Débito' : 'Nota de Venta'
      const customerName = invoice.customer?.name || 'Cliente'
      const total = formatCurrency(invoice.total)

      // Crear mensaje con link de descarga
      const message = `Hola ${customerName},

Gracias por tu compra en *${companySettings?.tradeName || companySettings?.name || 'nuestra tienda'}*.

*${docTypeName}:* ${invoice.number}
*Total:* ${total}

*Descarga tu comprobante aquí:*
${shortURL}

Gracias por tu preferencia.`

      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`

      toast.success('Abriendo WhatsApp...')

      // Detectar si es móvil para usar el método apropiado
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

      if (isMobile) {
        // En móvil, usar location.href para que el SO abra WhatsApp directamente
        window.location.href = whatsappUrl
      } else {
        // En desktop, usar enlace temporal con target blank
        const link = document.createElement('a')
        link.href = whatsappUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      setSendingWhatsApp(false)
    } catch (error) {
      console.error('Error al enviar por WhatsApp:', error)
      toast.error('Error al generar el comprobante. Intenta de nuevo.')
      setSendingWhatsApp(false)
    }
  }

  useEffect(() => {
    loadInvoices()
    loadBranches()
  }, [user])

  // Cargar sucursales para filtro (solo las que el usuario tiene acceso)
  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const result = await getActiveBranches(getBusinessId())
      if (result.success) {
        // Filtrar sucursales según acceso del usuario
        const branchList = filterBranchesByAccess ? filterBranchesByAccess(result.data) : result.data
        setBranches(branchList || [])
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
    }
  }

  const loadInvoices = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        // Cargar datos de demo
        setInvoices(demoData.invoices || [])
        setCompanySettings(demoData.business || null)
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      console.log('🔍 InvoiceList - Using businessId:', businessId, 'for user:', user.email)

      const [invoicesResult, settingsResult] = await Promise.all([
        getInvoices(businessId),
        getCompanySettings(businessId)
      ])

      if (invoicesResult.success) {
        setInvoices(invoicesResult.data || [])
      } else {
        console.error('Error al cargar facturas:', invoicesResult.error)
      }

      if (settingsResult.success) {
        setCompanySettings(settingsResult.data)
        // Pre-cargar logo en background
        if (settingsResult.data?.logoUrl) {
          preloadLogo(settingsResult.data.logoUrl).catch(() => {})
        }
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingInvoice || !user?.uid) return

    const businessId = getBusinessId()
    setIsDeleting(true)
    try {
      const result = await deleteInvoice(businessId, deletingInvoice.id)

      if (result.success) {
        toast.success('Factura eliminada exitosamente')
        setDeletingInvoice(null)
        loadInvoices()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar factura:', error)
      toast.error('Error al eliminar la factura. Inténtalo nuevamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleVoidInvoice = async () => {
    if (!voidingInvoice || !user?.uid) return
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    const businessId = getBusinessId()
    setIsVoiding(true)
    try {
      // Actualizar el estado de la nota de venta a 'cancelled'
      const voidData = {
        status: 'cancelled',
        voidedAt: new Date(),
        voidReason: voidReason.trim() || 'Sin motivo especificado',
        voidedBy: user.email || user.uid
      }

      const result = await updateInvoice(businessId, voidingInvoice.id, voidData)

      if (result.success) {
        // Devolver el stock de los productos
        if (voidingInvoice.items && voidingInvoice.items.length > 0) {
          // Importar funciones de manejo de stock
          const { updateWarehouseStock, createStockMovement } = await import('@/services/warehouseService')
          const { getProducts, updateProduct } = await import('@/services/firestoreService')

          // Obtener productos actuales
          const productsResult = await getProducts(businessId)
          const products = productsResult.success ? productsResult.data : []

          // Obtener warehouseId de la factura (si existe)
          const warehouseId = voidingInvoice.warehouseId || ''

          for (const item of voidingInvoice.items) {
            if (item.productId) {
              try {
                // Buscar el producto actual
                const productData = products.find(p => p.id === item.productId)
                if (!productData) {
                  console.warn(`Producto ${item.productId} no encontrado, omitiendo...`)
                  continue
                }

                // Si el producto no controla stock, omitir
                if (productData.trackStock === false || productData.stock === null) {
                  console.log(`Producto ${item.name} no controla stock, omitiendo...`)
                  continue
                }

                // Calcular cantidad a restaurar (considerando factor de presentación)
                const quantityToRestore = item.quantity * (item.presentationFactor || 1)

                // Actualizar stock usando el helper de almacén (cantidad positiva = entrada)
                const updatedProduct = updateWarehouseStock(
                  productData,
                  warehouseId,
                  quantityToRestore
                )

                // Guardar en Firestore
                await updateProduct(businessId, item.productId, {
                  stock: updatedProduct.stock,
                  warehouseStocks: updatedProduct.warehouseStocks
                })

                // Registrar movimiento de stock
                await createStockMovement(businessId, {
                  productId: item.productId,
                  warehouseId: warehouseId,
                  type: 'void_return',
                  quantity: quantityToRestore,
                  reason: 'Anulación de nota de venta',
                  referenceType: 'sale_void',
                  referenceId: voidingInvoice.id,
                  referenceNumber: voidingInvoice.number,
                  userId: user.uid,
                  notes: `Stock devuelto por anulación de ${voidingInvoice.number}`
                })

                console.log(`✅ Stock restaurado para ${item.name}: +${quantityToRestore}`)
              } catch (stockError) {
                console.warn(`No se pudo devolver stock para producto ${item.productId}:`, stockError)
              }
            }
          }
        }

        // Revertir métricas del vendedor si la venta tenía un vendedor asignado
        if (voidingInvoice.sellerId) {
          try {
            const { doc, updateDoc, increment } = await import('firebase/firestore')
            const { db } = await import('@/lib/firebase')

            const sellerRef = doc(db, 'businesses', businessId, 'sellers', voidingInvoice.sellerId)
            const saleTotal = voidingInvoice.total || voidingInvoice.amounts?.total || 0

            // Verificar si la venta fue hoy para restar de todaySales/todayOrders
            const saleDate = voidingInvoice.createdAt?.toDate?.() || voidingInvoice.createdAt
            const today = new Date()
            const isToday = saleDate &&
              saleDate.getDate() === today.getDate() &&
              saleDate.getMonth() === today.getMonth() &&
              saleDate.getFullYear() === today.getFullYear()

            const updateData = {
              totalSales: increment(-saleTotal),
              totalOrders: increment(-1),
            }

            // Solo restar de los contadores diarios si la venta fue hoy
            if (isToday) {
              updateData.todaySales = increment(-saleTotal)
              updateData.todayOrders = increment(-1)
            }

            await updateDoc(sellerRef, updateData)
            console.log(`✅ Métricas del vendedor ${voidingInvoice.sellerName || voidingInvoice.sellerId} actualizadas: -${saleTotal}`)
          } catch (sellerError) {
            console.warn('No se pudo actualizar métricas del vendedor:', sellerError)
            // No fallar la anulación si no se puede actualizar las métricas
          }
        }

        toast.success('Nota de venta anulada y stock restaurado exitosamente')
        setVoidingInvoice(null)
        setVoidReason('')
        loadInvoices()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al anular nota de venta:', error)
      toast.error('Error al anular la nota de venta. Inténtalo nuevamente.')
    } finally {
      setIsVoiding(false)
    }
  }

  // Función para anular factura/boleta en SUNAT (Comunicación de Baja o Resumen Diario)
  const handleVoidSunatInvoice = async () => {
    if (!voidingSunatInvoice || !user?.uid) return

    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    setIsVoidingSunat(true)
    try {
      const businessId = getBusinessId()

      // Obtener token de autenticación
      const { getAuth } = await import('firebase/auth')
      const auth = getAuth()
      const idToken = await auth.currentUser?.getIdToken()

      if (!idToken) {
        throw new Error('No se pudo obtener el token de autenticación')
      }

      // Detectar tipo de documento para mensaje apropiado
      const series = voidingSunatInvoice.series || voidingSunatInvoice.number?.split('-')[0] || ''
      const isBoleta = series.toUpperCase().startsWith('B')
      const docTypeName = isBoleta ? 'Boleta' : 'Factura'

      // Obtener método de emisión desde businessSettings (lógica similar a emissionRouter)
      let emissionMethod = businessSettings?.emissionConfig?.method || businessSettings?.emissionMethod || null
      // Solo usar qpse si realmente tiene credenciales configuradas
      if (emissionMethod === 'qpse') {
        const qpseConfig = businessSettings?.emissionConfig?.qpse || businessSettings?.qpse
        if (!qpseConfig?.usuario || !qpseConfig?.password) {
          emissionMethod = null // Fallback a SUNAT directo
        }
      }

      // Llamar al servicio de anulación unificado (detecta automáticamente factura o boleta)
      // Pasa el método de emisión para usar QPSe si corresponde
      const result = await voidDocument(
        voidingSunatInvoice,
        businessId,
        voidSunatReason || 'ANULACION DE OPERACION',
        idToken,
        emissionMethod
      )

      if (result.success || result.status === 'voided') {
        // Devolver el stock de los productos (igual que notas de venta)
        if (voidingSunatInvoice.items && voidingSunatInvoice.items.length > 0) {
          const { updateWarehouseStock, createStockMovement } = await import('@/services/warehouseService')
          const { getProducts, updateProduct } = await import('@/services/firestoreService')

          const productsResult = await getProducts(businessId)
          const products = productsResult.success ? productsResult.data : []
          const warehouseId = voidingSunatInvoice.warehouseId || ''

          for (const item of voidingSunatInvoice.items) {
            if (item.productId) {
              try {
                const productData = products.find(p => p.id === item.productId)
                if (!productData) continue
                if (productData.trackStock === false || productData.stock === null) continue

                const quantityToRestore = item.quantity * (item.presentationFactor || 1)

                const updatedProduct = updateWarehouseStock(
                  productData,
                  warehouseId,
                  quantityToRestore
                )

                await updateProduct(businessId, item.productId, {
                  stock: updatedProduct.stock,
                  warehouseStocks: updatedProduct.warehouseStocks
                })

                await createStockMovement(businessId, {
                  productId: item.productId,
                  warehouseId: warehouseId,
                  type: 'entry',
                  quantity: quantityToRestore,
                  reason: `Anulación de ${docTypeName.toLowerCase()}`,
                  referenceType: 'sunat_void',
                  referenceId: voidingSunatInvoice.id,
                  referenceNumber: voidingSunatInvoice.number,
                  userId: user.uid,
                  notes: `Stock devuelto por anulación SUNAT de ${voidingSunatInvoice.number}`
                })

                console.log(`✅ Stock restaurado para ${item.name}: +${quantityToRestore}`)
              } catch (stockError) {
                console.warn(`No se pudo devolver stock para producto ${item.productId}:`, stockError)
              }
            }
          }
        }

        // Revertir métricas del vendedor si la venta tenía un vendedor asignado
        if (voidingSunatInvoice.sellerId) {
          try {
            const { doc, updateDoc, increment } = await import('firebase/firestore')
            const { db } = await import('@/lib/firebase')

            const sellerRef = doc(db, 'businesses', businessId, 'sellers', voidingSunatInvoice.sellerId)
            const saleTotal = voidingSunatInvoice.total || voidingSunatInvoice.amounts?.total || 0

            // Verificar si la venta fue hoy para restar de todaySales/todayOrders
            const saleDate = voidingSunatInvoice.createdAt?.toDate?.() || voidingSunatInvoice.createdAt
            const today = new Date()
            const isToday = saleDate &&
              saleDate.getDate() === today.getDate() &&
              saleDate.getMonth() === today.getMonth() &&
              saleDate.getFullYear() === today.getFullYear()

            const updateData = {
              totalSales: increment(-saleTotal),
              totalOrders: increment(-1),
            }

            // Solo restar de los contadores diarios si la venta fue hoy
            if (isToday) {
              updateData.todaySales = increment(-saleTotal)
              updateData.todayOrders = increment(-1)
            }

            await updateDoc(sellerRef, updateData)
            console.log(`✅ Métricas del vendedor ${voidingSunatInvoice.sellerName || voidingSunatInvoice.sellerId} actualizadas: -${saleTotal}`)
          } catch (sellerError) {
            console.warn('No se pudo actualizar métricas del vendedor:', sellerError)
            // No fallar la anulación si no se puede actualizar las métricas
          }
        }

        // Mensaje específico según tipo de documento
        if (voidingSunatInvoice.documentType === 'nota_credito') {
          toast.success(`Nota de Crédito anulada exitosamente. La factura ${voidingSunatInvoice.referencedDocumentId || 'original'} ha sido restaurada.`)
        } else {
          toast.success(`${docTypeName} anulada exitosamente en SUNAT. Stock restaurado.`)
        }
        setVoidingSunatInvoice(null)
        setVoidSunatReason('')
        loadInvoices()
      } else if (result.status === 'pending') {
        const pendingMsg = voidingSunatInvoice.documentType === 'nota_credito'
          ? 'La anulación está siendo procesada. La factura original será restaurada cuando SUNAT confirme.'
          : 'La anulación está siendo procesada por SUNAT. Consulte el estado en unos minutos.'
        toast.info(pendingMsg)
        setVoidingSunatInvoice(null)
        setVoidSunatReason('')
        loadInvoices()
      } else {
        throw new Error(result.error || `Error al anular la ${docTypeName.toLowerCase()}`)
      }
    } catch (error) {
      console.error('Error al anular documento en SUNAT:', error)
      toast.error(error.message || 'Error al anular el documento. Inténtalo nuevamente.')
    } finally {
      setIsVoidingSunat(false)
    }
  }

  // Función para convertir nota de venta navegando al POS con datos precargados
  const handleConvertInPOS = (invoice) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    setViewingInvoice(null)

    navigate('/app/pos', {
      state: {
        fromNotaVenta: true,
        notaVentaId: invoice.id,
        notaVentaNumber: invoice.number,
        items: invoice.items || [],
        customer: invoice.customer || null,
        paymentMethod: invoice.paymentMethod || 'Efectivo',
        payments: invoice.payments || null,
        notes: invoice.notes || '',
        sellerId: invoice.sellerId || null,
        sellerName: invoice.sellerName || null,
        discount: invoice.discount || 0,
        discountPercentage: invoice.discountPercentage || 0,
      }
    })
  }

  const handleRegisterPayment = async () => {
    if (!paymentInvoice || !user?.uid) return
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    const paymentAmount = parseFloat(newPaymentAmount)

    // Validaciones
    if (!paymentAmount || paymentAmount <= 0) {
      toast.error('El monto debe ser mayor que cero')
      return
    }

    // Usar tolerancia de 0.01 para evitar problemas de precisión de decimales flotantes
    if (paymentAmount > paymentInvoice.balance + 0.01) {
      toast.error('El monto no puede ser mayor que el saldo pendiente')
      return
    }

    const businessId = getBusinessId()
    setIsRegisteringPayment(true)

    try {
      // Calcular nuevos valores
      const newAmountPaid = (paymentInvoice.amountPaid || 0) + paymentAmount
      const newBalance = paymentInvoice.total - newAmountPaid
      const newPaymentStatus = newBalance <= 0.01 ? 'completed' : 'partial' // 0.01 para manejar decimales

      // Crear nuevo registro de pago
      const newPaymentRecord = {
        amount: paymentAmount,
        date: new Date(),
        method: newPaymentMethod,
        recordedBy: user.email || user.uid,
        recordedByName: user.displayName || user.email || 'Usuario'
      }

      // Actualizar el historial de pagos
      const updatedPaymentHistory = [...(paymentInvoice.paymentHistory || []), newPaymentRecord]

      // Actualizar la nota de venta
      const result = await updateInvoice(businessId, paymentInvoice.id, {
        amountPaid: newAmountPaid,
        balance: newBalance,
        paymentStatus: newPaymentStatus,
        paymentHistory: updatedPaymentHistory,
        // Actualizar status principal cuando se completa el pago
        status: newPaymentStatus === 'completed' ? 'paid' : 'pending'
      })

      if (result.success) {
        toast.success(`Pago de ${formatCurrency(paymentAmount)} registrado exitosamente`)
        setPaymentInvoice(null)
        setNewPaymentAmount('')
        setNewPaymentMethod('Efectivo')
        loadInvoices()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al registrar pago:', error)
      toast.error('Error al registrar el pago. Inténtalo nuevamente.')
    } finally {
      setIsRegisteringPayment(false)
    }
  }

  const handleExportToExcel = async () => {
    try {
      // Filtrar facturas según los criterios seleccionados
      let filteredInvoices = [...invoices];

      // Filtrar por tipos seleccionados (array)
      if (exportFilters.types && exportFilters.types.length > 0) {
        filteredInvoices = filteredInvoices.filter(inv => exportFilters.types.includes(inv.documentType));
      }

      // Filtrar por estado SUNAT
      if (exportFilters.sunatStatus && exportFilters.sunatStatus !== 'all') {
        filteredInvoices = filteredInvoices.filter(inv => {
          const status = inv.sunatStatus || 'pending';
          // Las notas de venta no se envían a SUNAT
          if (inv.documentType === 'nota_venta') {
            return exportFilters.sunatStatus === 'not_applicable';
          }
          return status === exportFilters.sunatStatus;
        });
      }

      // Excluir boletas convertidas desde notas de venta (si está activado)
      if (exportFilters.excludeConverted) {
        filteredInvoices = filteredInvoices.filter(inv => {
          // Excluir boletas que fueron convertidas desde nota de venta
          if (inv.convertedFrom) return false;
          // Excluir notas de venta que ya fueron convertidas a boleta
          if (inv.documentType === 'nota_venta' && inv.convertedTo) return false;
          return true;
        });
      }

      // Filtrar por rango de fechas
      if (exportFilters.startDate) {
        // Crear fecha en zona horaria local (no UTC)
        const [year, month, day] = exportFilters.startDate.split('-').map(Number);
        const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
        filteredInvoices = filteredInvoices.filter(inv => {
          const invDate = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt);
          return invDate && invDate >= startDate;
        });
      }

      if (exportFilters.endDate) {
        // Crear fecha en zona horaria local (no UTC)
        const [year, month, day] = exportFilters.endDate.split('-').map(Number);
        const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
        filteredInvoices = filteredInvoices.filter(inv => {
          const invDate = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt);
          return invDate && invDate <= endDate;
        });
      }

      // Filtrar por sucursal seleccionada en la página
      if (filterBranch !== 'all') {
        filteredInvoices = filteredInvoices.filter(inv => {
          if (filterBranch === 'main') {
            return !inv.branchId
          }
          return inv.branchId === filterBranch
        })
      }

      if (filteredInvoices.length === 0) {
        toast.error('No hay comprobantes que coincidan con los filtros seleccionados');
        return;
      }

      // Determinar nombre de sucursal para el Excel
      let branchLabel = null
      if (filterBranch === 'main') {
        branchLabel = 'Sucursal Principal'
      } else if (filterBranch !== 'all') {
        const branch = branches.find(b => b.id === filterBranch)
        branchLabel = branch ? branch.name : null
      }

      // Generar Excel
      await generateInvoicesExcel(filteredInvoices, exportFilters, companySettings, branchLabel);
      toast.success(`${filteredInvoices.length} comprobante(s) exportado(s) exitosamente`);
      setShowExportModal(false);
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      toast.error('Error al generar el archivo Excel');
    }
  }

  // Función para exportar XML/CDR masivamente
  const handleExportXMLCDR = async () => {
    if (!companySettings?.ruc) {
      toast.error('Configura el RUC de tu empresa primero')
      return
    }

    setIsExportingXML(true)
    setXmlExportProgress(0)

    try {
      const { month, year, includeXML, includeCDR } = xmlExportFilters

      // Filtrar facturas del mes seleccionado que fueron aceptadas por SUNAT
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59)

      const filteredInvoices = invoices.filter(inv => {
        if (inv.sunatStatus !== 'accepted') return false
        if (!inv.sunatResponse) return false

        const invDate = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt)
        return invDate >= startDate && invDate <= endDate
      })

      if (filteredInvoices.length === 0) {
        toast.error('No hay comprobantes aceptados por SUNAT en el período seleccionado')
        setIsExportingXML(false)
        return
      }

      const { blob, results } = await exportXMLandCDR(
        filteredInvoices,
        companySettings.ruc,
        { includeXML, includeCDR },
        (progress) => setXmlExportProgress(progress)
      )

      const fileName = generateZipFileName(companySettings.ruc, month, year)
      await downloadZip(blob, fileName)

      const message = `Exportados: ${results.xmlCount} XML y ${results.cdrCount} CDR`
      if (results.failed > 0) {
        toast.warning(`${message}. ${results.failed} archivos no disponibles.`)
      } else {
        toast.success(message)
      }

      setShowXMLExportModal(false)
    } catch (error) {
      console.error('Error al exportar XML/CDR:', error)
      toast.error(error.message || 'Error al exportar XML/CDR')
    } finally {
      setIsExportingXML(false)
      setXmlExportProgress(0)
    }
  }

  const handleUpdateStatus = async (invoiceId, newStatus) => {
    if (!user?.uid) return

    const businessId = getBusinessId()
    try {
      const result = await updateInvoice(businessId, invoiceId, { status: newStatus })

      if (result.success) {
        toast.success('Estado actualizado exitosamente')
        loadInvoices()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al actualizar estado:', error)
      toast.error('Error al actualizar el estado.')
    }
  }

  const handleSendToSunat = async (invoiceId) => {
    if (!user?.uid) return

    const businessId = getBusinessId()
    setSendingToSunat(invoiceId)
    try {
      console.log('📤 Enviando factura a SUNAT...', invoiceId)

      const result = await sendInvoiceToSunat(businessId, invoiceId)

      if (result.success) {
        toast.success(result.message, 5000)

        // Si hay observaciones, mostrarlas
        if (result.observations && result.observations.length > 0) {
          console.log('📝 Observaciones SUNAT:', result.observations)
        }

        // Recargar facturas para ver el estado actualizado
        loadInvoices()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al enviar a SUNAT:', error)
      toast.error(error.message || 'Error al enviar a SUNAT. Inténtalo nuevamente.', 5000)
    } finally {
      setSendingToSunat(null)
    }
  }

  // Función específica para enviar Notas de Crédito a SUNAT
  const handleSendCreditNoteToSunat = async (creditNoteId) => {
    if (!user?.uid) return

    const businessId = getBusinessId()
    setSendingToSunat(creditNoteId)
    try {
      console.log('📤 Enviando Nota de Crédito a SUNAT...', creditNoteId)

      const result = await sendCreditNoteToSunat(businessId, creditNoteId)

      if (result.success) {
        toast.success(result.message || 'Nota de Crédito enviada exitosamente', 5000)

        // Si hay observaciones, mostrarlas
        if (result.observations && result.observations.length > 0) {
          console.log('📝 Observaciones SUNAT:', result.observations)
        }

        // Recargar documentos para ver el estado actualizado
        loadInvoices()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al enviar NC a SUNAT:', error)
      toast.error(error.message || 'Error al enviar Nota de Crédito a SUNAT.', 5000)
    } finally {
      setSendingToSunat(null)
    }
  }

  // Obtener lista única de vendedores
  const sellers = Array.from(
    new Set(
      invoices
        .filter(inv => inv.createdBy)
        .map(inv => JSON.stringify({ id: inv.createdBy, name: inv.createdByName || inv.createdByEmail || 'Sin nombre' }))
    )
  ).map(str => JSON.parse(str))

  // Obtener rango de fechas basado en el filtro de período
  const getDateRange = () => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    switch (dateFilter) {
      case 'today':
        return { start: startOfDay, end: endOfDay }
      case '3days':
        const threeDaysAgo = new Date(startOfDay)
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 2)
        return { start: threeDaysAgo, end: endOfDay }
      case '7days':
        const sevenDaysAgo = new Date(startOfDay)
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        return { start: sevenDaysAgo, end: endOfDay }
      case '30days':
        const thirtyDaysAgo = new Date(startOfDay)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
        return { start: thirtyDaysAgo, end: endOfDay }
      case 'custom':
        if (filterStartDate && filterEndDate) {
          const [sYear, sMonth, sDay] = filterStartDate.split('-').map(Number)
          const [eYear, eMonth, eDay] = filterEndDate.split('-').map(Number)
          return {
            start: new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0),
            end: new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999)
          }
        }
        return null
      default:
        return null
    }
  }

  // Filtrar por período
  const filterByDateRange = (invoice) => {
    const dateRange = getDateRange()
    if (!dateRange) return true

    const invoiceDate = getInvoiceDate(invoice)
    if (!invoiceDate) return true

    return invoiceDate >= dateRange.start && invoiceDate <= dateRange.end
  }

  // Etiqueta del filtro actual
  const getFilterLabel = () => {
    switch (dateFilter) {
      case 'today': return 'Hoy'
      case '3days': return 'Últimos 3 días'
      case '7days': return 'Últimos 7 días'
      case '30days': return 'Últimos 30 días'
      case 'custom':
        if (filterStartDate && filterEndDate) {
          return `${filterStartDate} - ${filterEndDate}`
        }
        return 'Personalizado'
      default: return 'Todo el tiempo'
    }
  }

  // Filtrar facturas
  const filteredInvoices = invoices
    .filter(filterByDateRange) // Primero filtrar por período
    .filter(invoice => {
      const search = searchTerm.toLowerCase()
      const matchesSearch =
        invoice.number?.toLowerCase().includes(search) ||
        invoice.customer?.name?.toLowerCase().includes(search) ||
        invoice.customer?.documentNumber?.includes(search)

      const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus
      const matchesType = filterType === 'all' || invoice.documentType === filterType
      const matchesSeller = filterSeller === 'all' || invoice.createdBy === filterSeller

      // Filtrar por sucursal
      let matchesBranch = true
      if (filterBranch !== 'all') {
        if (filterBranch === 'main') {
          // Sucursal Principal = sin branchId o branchId null
          matchesBranch = !invoice.branchId
        } else {
          matchesBranch = invoice.branchId === filterBranch
        }
      }

      return matchesSearch && matchesStatus && matchesType && matchesSeller && matchesBranch
    })

  // Apply pagination
  const displayedInvoices = filteredInvoices.slice(0, visibleInvoicesCount)
  const hasMoreInvoices = filteredInvoices.length > visibleInvoicesCount

  const loadMoreInvoices = () => {
    setVisibleInvoicesCount(prev => prev + INVOICES_PER_PAGE)
  }

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleInvoicesCount(20)
  }, [searchTerm, filterStatus, filterType, filterSeller, dateFilter, filterStartDate, filterEndDate])

  const getStatusBadge = (status, documentType) => {
    // Para Notas de Crédito y Notas de Débito, usar estados específicos
    if (documentType === 'nota_credito' || documentType === 'nota_debito') {
      switch (status) {
        case 'applied':
          return <Badge variant="success">Aplicada</Badge>
        case 'pending':
          return <Badge variant="warning">Pendiente</Badge>
        default:
          return <Badge>{status}</Badge>
      }
    }

    // Para Facturas, Boletas y Notas de Venta
    switch (status) {
      case 'paid':
        return <Badge variant="success">Pagada</Badge>
      case 'pending':
        return <Badge variant="warning">Pendiente</Badge>
      case 'overdue':
        return <Badge variant="danger">Vencida</Badge>
      case 'cancelled':
      case 'voided':
        return <Badge variant="danger">Anulada</Badge>
      case 'partial_refund':
        return <Badge className="bg-orange-100 text-orange-800">Dev. Parcial</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getDocumentTypeName = type => {
    if (type === 'factura') return 'Factura'
    if (type === 'nota_venta') return 'Nota de Venta'
    if (type === 'boleta') return 'Boleta'
    if (type === 'nota_credito') return 'Nota de Crédito'
    if (type === 'nota_debito') return 'Nota de Débito'
    return type
  }

  const getSunatStatusBadge = sunatStatus => {
    switch (sunatStatus) {
      case 'accepted':
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Aceptado
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Pendiente
          </Badge>
        )
      case 'sending':
        return (
          <Badge variant="info" className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Enviando...
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="danger" className="flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Rechazado
          </Badge>
        )
      case 'voided':
        return (
          <Badge variant="danger" className="flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Anulado
          </Badge>
        )
      case 'voiding':
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Anulando...
          </Badge>
        )
      case 'SIGNED':
      case 'signed':
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Firmado (no enviado)
          </Badge>
        )
      case 'not_applicable':
        return (
          <Badge className="flex items-center gap-1">
            <Ban className="w-3 h-3" />
            N/A
          </Badge>
        )
      default:
        return <Badge>{sunatStatus || 'N/A'}</Badge>
    }
  }

  // Facturas filtradas por período (para estadísticas, sin filtros de texto/tipo/estado/vendedor)
  const dateFilteredInvoices = useMemo(() => {
    return invoices.filter(filterByDateRange)
  }, [invoices, dateFilter, filterStartDate, filterEndDate])

  // Estadísticas (basadas en el período seleccionado)
  // Excluir facturas anuladas y notas de venta convertidas (para evitar doble conteo)
  const isConvertedNota = (i) => i.documentType === 'nota_venta' && i.convertedTo
  const statsInvoices = dateFilteredInvoices.filter(i => !isConvertedNota(i))
  const activeInvoices = statsInvoices.filter(i => i.status !== 'cancelled' && i.status !== 'voided')
  const stats = {
    total: statsInvoices.length,
    paid: statsInvoices.filter(i => i.status === 'paid').length,
    pending: statsInvoices.filter(i => i.status === 'pending').length,
    totalAmount: activeInvoices.reduce((sum, i) => sum + (i.total || 0), 0),
    totalAll: invoices.filter(i => !isConvertedNota(i)).length,
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando facturas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Ventas</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Visualiza y gestiona todas tus facturas y boletas emitidas
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => navigate('/app/nota-credito')}
            className="w-full sm:w-auto"
            title="Crear nota de crédito"
          >
            <FileMinus className="w-4 h-4 mr-2" />
            + Nota de Crédito
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowXMLExportModal(true)}
            className="w-full sm:w-auto"
            title="Descargar XML y CDR para auditoría SUNAT"
          >
            <Archive className="w-4 h-4 mr-2" />
            XML/CDR
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowExportModal(true)}
            className="w-full sm:w-auto"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Stats - Ocultar para usuarios secundarios si está configurado */}
      {!((user?.ownerId || user?.isBusinessOwner !== true) && businessSettings?.hideDashboardDataFromSecondary) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">
                  Comprobantes {dateFilter !== 'all' && <span className="text-primary-600">({getFilterLabel()})</span>}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
                {dateFilter !== 'all' && (
                  <p className="text-xs text-gray-500 mt-1">de {stats.totalAll} en total</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">Pagadas</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600 mt-2">{stats.paid}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">Pendientes</p>
                <p className="text-xl sm:text-2xl font-bold text-yellow-600 mt-2">{stats.pending}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">
                  Monto Total {dateFilter !== 'all' && <span className="text-primary-600">({getFilterLabel()})</span>}
                </p>
                <p className="text-lg sm:text-xl font-bold text-primary-600 mt-2">
                  {formatCurrency(stats.totalAmount)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por número, cliente, RUC/DNI..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Filtro de período */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 font-medium">Período:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'Todo' },
                { value: 'today', label: 'Hoy' },
                { value: '3days', label: '3 días' },
                { value: '7days', label: '7 días' },
                { value: '30days', label: '30 días' },
                { value: 'custom', label: 'Personalizado' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDateFilter(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    dateFilter === option.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fechas personalizadas */}
          {dateFilter === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Desde:</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Hasta:</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
          )}

          {/* Filtros de tipo, estado y vendedor */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900 text-sm"
            >
              <option value="all">Todos los tipos</option>
              <option value="factura">Facturas</option>
              <option value="boleta">Boletas</option>
              <option value="nota_venta">Notas de Venta</option>
              <option value="nota_credito">Notas de Crédito</option>
              <option value="nota_debito">Notas de Débito</option>
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900 text-sm"
            >
              <option value="all">Todos los estados</option>
              <option value="paid">Pagadas</option>
              <option value="pending">Pendientes</option>
              <option value="overdue">Vencidas</option>
              <option value="cancelled">Anuladas</option>
            </select>
            <select
              value={filterSeller}
              onChange={e => setFilterSeller(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900 text-sm"
            >
              <option value="all">Todos los vendedores</option>
              {sellers.map(seller => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
            {/* Filtro de Sucursal */}
            {branches.length > 0 && (
              <select
                value={filterBranch}
                onChange={e => setFilterBranch(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900 text-sm"
              >
                <option value="all">Todas las sucursales</option>
                <option value="main">Sucursal Principal</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Botón limpiar filtros */}
          {(filterType !== 'all' || filterStatus !== 'all' || filterSeller !== 'all' || filterBranch !== 'all' || dateFilter !== 'all') && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setDateFilter('all')
                  setFilterStartDate('')
                  setFilterEndDate('')
                  setFilterType('all')
                  setFilterStatus('all')
                  setFilterSeller('all')
                  setFilterBranch('all')
                }}
                className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Table */}
      <Card>
        {filteredInvoices.length === 0 ? (
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterStatus !== 'all' || filterType !== 'all'
                ? 'No se encontraron comprobantes'
                : 'No hay comprobantes registrados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterStatus !== 'all' || filterType !== 'all'
                ? 'Intenta con otros filtros de búsqueda'
                : 'Comienza creando tu primer comprobante desde el Punto de Venta'}
            </p>
            {!searchTerm && filterStatus === 'all' && filterType === 'all' && (
              <Link to="/app/pos">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Ir al Punto de Venta
                </Button>
              </Link>
            )}
          </CardContent>
        ) : (
          <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {displayedInvoices.map(invoice => (
                <div key={invoice.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  {/* Fila superior: Número + tipo + acciones */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-primary-600 text-sm">{invoice.number}</span>
                      <span className="text-xs text-gray-500">{getDocumentTypeName(invoice.documentType)}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const menuHeight = 400
                        const spaceAbove = rect.top
                        const spaceBelow = window.innerHeight - rect.bottom
                        const openUpward = spaceAbove > menuHeight || spaceAbove > spaceBelow
                        setMenuPosition({
                          top: openUpward ? rect.top - 10 : rect.bottom + 10,
                          right: window.innerWidth - rect.right,
                          openUpward
                        })
                        setOpenMenuId(openMenuId === invoice.id ? null : invoice.id)
                      }}
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                      title="Acciones"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila medio: Cliente */}
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm font-medium truncate">{invoice.customer?.name || 'Sin cliente'}</p>
                    {invoice.customer?.documentNumber && (
                      <span className="text-xs text-gray-500 flex-shrink-0">{invoice.customer.documentNumber}</span>
                    )}
                  </div>

                  {/* Fila inferior: Total + fecha + badges */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">{formatCurrency(invoice.total)}</span>
                      <span className="text-xs text-gray-500">
                        {getInvoiceDate(invoice) ? formatDate(getInvoiceDate(invoice)) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="scale-90 origin-right">{getStatusBadge(invoice.status, invoice.documentType)}</div>
                      <div className="scale-75 origin-right">{getSunatStatusBadge(invoice.sunatStatus || 'pending')}</div>
                    </div>
                  </div>

                  {/* Fila extra: pago parcial/crédito + indicadores conversión */}
                  {(
                    (invoice.documentType === 'nota_venta' && (invoice.paymentStatus === 'partial' || invoice.paymentStatus === 'pending')) ||
                    invoice.convertedTo ||
                    invoice.convertedFrom
                  ) && (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {invoice.documentType === 'nota_venta' && invoice.paymentStatus === 'pending' && (
                        <span className="text-xs text-orange-600 font-semibold">Al Crédito: {formatCurrency(invoice.total || 0)}</span>
                      )}
                      {invoice.documentType === 'nota_venta' && invoice.paymentStatus === 'partial' && (
                        <>
                          <span className="text-xs text-green-600">Pagado: {formatCurrency(invoice.amountPaid || 0)}</span>
                          <span className="text-xs text-orange-600 font-semibold">Saldo: {formatCurrency(invoice.balance || 0)}</span>
                        </>
                      )}
                      {invoice.convertedTo && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Convertida
                        </span>
                      )}
                      {invoice.convertedFrom && (
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <ArrowRightCircle className="w-3 h-3" />
                          Desde nota
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tabla para desktop */}
            <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2.5 px-3">Número</TableHead>
                  <TableHead className="py-2.5 px-3">Tipo</TableHead>
                  <TableHead className="py-2.5 px-3">Cliente</TableHead>
                  <TableHead className="py-2.5 px-3">Fecha Emisión</TableHead>
                  <TableHead className="py-2.5 px-3">Total</TableHead>
                  <TableHead className="py-2.5 px-2">Estado</TableHead>
                  <TableHead className="py-2.5 px-1 w-20">SUNAT</TableHead>
                  <TableHead className="py-2.5 px-1 text-right w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedInvoices.map(invoice => (
                  <TableRow key={invoice.id}>
                    <TableCell className="py-2.5 px-3">
                      <span className="font-medium text-primary-600 text-sm whitespace-nowrap">
                        {invoice.number}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm whitespace-nowrap">{getDocumentTypeName(invoice.documentType)}</span>
                        {/* Indicador de nota convertida */}
                        {invoice.convertedTo && (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Convertida
                          </span>
                        )}
                        {/* Indicador de boleta desde nota */}
                        {invoice.convertedFrom && (
                          <span className="text-xs text-blue-600 flex items-center gap-1">
                            <ArrowRightCircle className="w-3 h-3" />
                            Desde nota
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <div className="max-w-[140px]">
                        <p className="font-medium text-sm truncate">{invoice.customer?.name}</p>
                        <p className="text-xs text-gray-500 truncate">{invoice.customer?.documentNumber}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <span className="text-sm whitespace-nowrap">
                        {getInvoiceDate(invoice)
                          ? formatDate(getInvoiceDate(invoice))
                          : 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-sm whitespace-nowrap">{formatCurrency(invoice.total)}</span>
                        {/* Mostrar info de pago parcial o al crédito si aplica */}
                        {invoice.documentType === 'nota_venta' && (invoice.paymentStatus === 'partial' || invoice.paymentStatus === 'pending') && (
                          <div className="text-xs space-y-0.5">
                            {invoice.paymentStatus === 'pending' ? (
                              <div className="text-orange-600 font-semibold">Al Crédito: {formatCurrency(invoice.total || 0)}</div>
                            ) : (
                              <>
                                <div className="text-green-600">Pagado: {formatCurrency(invoice.amountPaid || 0)}</div>
                                <div className="text-orange-600 font-semibold">Saldo: {formatCurrency(invoice.balance || 0)}</div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-2">
                      <div className="flex flex-col gap-1">
                        <div className="scale-90 origin-left">{getStatusBadge(invoice.status, invoice.documentType)}</div>
                        {/* Badge de estado de pago para notas de venta con pago parcial o al crédito */}
                        {invoice.documentType === 'nota_venta' && (invoice.paymentStatus === 'partial' || invoice.paymentStatus === 'pending') && (
                          <Badge className="text-xs bg-orange-100 text-orange-800">
                            {invoice.paymentStatus === 'pending' ? 'Al Crédito' : 'Pago Pendiente'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-1 w-20">
                      <div className="scale-75 origin-left">{getSunatStatusBadge(invoice.sunatStatus || 'pending')}</div>
                    </TableCell>
                    <TableCell className="py-2.5 px-1 w-12">
                      <div className="flex items-center justify-end">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              const menuHeight = 400 // Altura estimada del menú
                              const spaceAbove = rect.top
                              const spaceBelow = window.innerHeight - rect.bottom
                              const openUpward = spaceAbove > menuHeight || spaceAbove > spaceBelow

                              setMenuPosition({
                                top: openUpward ? rect.top - 10 : rect.bottom + 10,
                                right: window.innerWidth - rect.right,
                                openUpward
                              })
                              setOpenMenuId(openMenuId === invoice.id ? null : invoice.id)
                            }}
                            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                            title="Acciones"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </>

        )}
      </Card>

      {/* Load More Button */}
      {filteredInvoices.length > 0 && hasMoreInvoices && (
        <div className="flex justify-center">
          <button
            onClick={loadMoreInvoices}
            className="text-sm text-gray-600 hover:text-primary-600 transition-colors py-2 px-4 hover:bg-gray-50 rounded-lg"
          >
            Ver más comprobantes ({filteredInvoices.length - visibleInvoicesCount} restantes)
          </button>
        </div>
      )}

      {/* Dropdown Menu (fuera de la tabla, con position fixed) */}
      {openMenuId && (
        <>
          {/* Backdrop para cerrar al hacer clic fuera */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpenMenuId(null)}
          />

          {/* Menu */}
          <div
            className="fixed w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
            style={{
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            {(() => {
              const invoice = filteredInvoices.find(inv => inv.id === openMenuId)
              if (!invoice) return null

              return (
                <>
                  {/* Editar documento (solo si no fue aceptado por SUNAT) */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                   invoice.sunatStatus !== 'accepted' && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        navigate(`/app/pos?editInvoiceId=${invoice.id}`)
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-3"
                    >
                      <Edit className="w-4 h-4 text-blue-600" />
                      <span className="text-blue-600 font-medium">Editar documento</span>
                    </button>
                  )}

                  {/* Duplicar documento */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta' || invoice.documentType === 'nota_venta') && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        navigate(`/app/pos?duplicateInvoiceId=${invoice.id}`)
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-purple-50 flex items-center gap-3"
                    >
                      <Copy className="w-4 h-4 text-purple-600" />
                      <span className="text-purple-600 font-medium">Duplicar comprobante</span>
                    </button>
                  )}

                  {/* Enviar a SUNAT */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                   invoice.sunatStatus === 'pending' && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleSendToSunat(invoice.id)
                      }}
                      disabled={sendingToSunat === invoice.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingToSunat === invoice.id ? (
                        <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 text-green-600" />
                      )}
                      <span>Enviar a SUNAT</span>
                    </button>
                  )}

                  {/* Reenviar a SUNAT (para facturas rechazadas, firmadas o atascadas en enviando) */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                   (invoice.sunatStatus === 'rejected' || invoice.sunatStatus === 'SIGNED' || invoice.sunatStatus === 'signed' || invoice.sunatStatus === 'sending') && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleSendToSunat(invoice.id)
                      }}
                      disabled={sendingToSunat === invoice.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-orange-50 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingToSunat === invoice.id ? (
                        <Loader2 className="w-4 h-4 text-orange-600 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 text-orange-600" />
                      )}
                      <span className="text-orange-600 font-medium">
                        Reintentar envío a SUNAT
                      </span>
                    </button>
                  )}

                  {/* Enviar Nota de Crédito a SUNAT */}
                  {invoice.documentType === 'nota_credito' &&
                   invoice.sunatStatus === 'pending' && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleSendCreditNoteToSunat(invoice.id)
                      }}
                      disabled={sendingToSunat === invoice.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingToSunat === invoice.id ? (
                        <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 text-green-600" />
                      )}
                      <span>Enviar NC a SUNAT</span>
                    </button>
                  )}

                  {/* Reenviar Nota de Crédito a SUNAT (rechazada, firmada o atascada) */}
                  {invoice.documentType === 'nota_credito' &&
                   (invoice.sunatStatus === 'rejected' || invoice.sunatStatus === 'SIGNED' || invoice.sunatStatus === 'signed' || invoice.sunatStatus === 'sending') && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleSendCreditNoteToSunat(invoice.id)
                      }}
                      disabled={sendingToSunat === invoice.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-orange-50 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingToSunat === invoice.id ? (
                        <Loader2 className="w-4 h-4 text-orange-600 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 text-orange-600" />
                      )}
                      <span className="text-orange-600 font-medium">
                        Reintentar envío NC a SUNAT
                      </span>
                    </button>
                  )}

                  {/* Crear Nota de Crédito */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                   invoice.sunatStatus === 'accepted' && (
                    <>
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          navigate(`/app/nota-credito?invoiceId=${invoice.id}`)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                      >
                        <FileMinus className="w-4 h-4 text-orange-600" />
                        <span>Crear Nota de Crédito</span>
                      </button>

                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          navigate(`/app/nota-debito?invoiceId=${invoice.id}`)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                      >
                        <FilePlus className="w-4 h-4 text-blue-600" />
                        <span>Crear Nota de Débito</span>
                      </button>
                    </>
                  )}

                  {/* Generar Guía de Remisión - Solo si está habilitado en preferencias */}
                  {/* Permitir para facturas/boletas/notas de venta (excepto rechazadas) */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta' || invoice.documentType === 'nota_venta') &&
                   invoice.sunatStatus !== 'rejected' &&
                   (businessSettings?.dispatchGuidesEnabled || isDemoMode) && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        setSelectedInvoiceForGuide(invoice)
                        setShowDispatchGuideModal(true)
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                    >
                      <Truck className="w-4 h-4 text-green-600" />
                      <span>Generar Guía de Remisión</span>
                    </button>
                  )}

                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                   invoice.sunatStatus === 'accepted' && (
                    <div className="border-t border-gray-100 my-1" />
                  )}

                  {/* Ver detalles */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      setViewingInvoice(invoice)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Eye className="w-4 h-4 text-primary-600" />
                    <span>Ver detalles</span>
                  </button>

                  {/* Vista previa PDF */}
                  <button
                    onClick={async () => {
                      setOpenMenuId(null)
                      try {
                        await previewInvoicePDF(invoice, companySettings, branding)
                      } catch (error) {
                        console.error('Error al generar vista previa:', error)
                        toast.error(`Error al generar vista previa: ${error.message}`)
                      }
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Printer className="w-4 h-4 text-purple-600" />
                    <span>Vista previa / Imprimir</span>
                  </button>

                  {/* Descargar PDF */}
                  <button
                    onClick={async () => {
                      setOpenMenuId(null)
                      try {
                        const result = await generateInvoicePDF(invoice, companySettings, true, branding, branches)
                        if (result?.fileName) {
                          toast.success(`PDF guardado: ${result.fileName}`)
                        } else {
                          toast.success('PDF descargado exitosamente')
                        }
                      } catch (error) {
                        console.error('Error al generar PDF:', error)
                        toast.error(`Error al generar el PDF: ${error.message}`)
                      }
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Download className="w-4 h-4 text-green-600" />
                    <span>Descargar PDF</span>
                  </button>

                  {/* Descargar XML - Prioriza el XML real firmado de Storage, fallback al generador frontend */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta' ||
                    invoice.documentType === 'nota_credito' || invoice.documentType === 'nota_debito') && (
                    <button
                      onClick={async () => {
                        setOpenMenuId(null)
                        try {
                          // Si tiene XML real guardado en Storage (firmado, enviado a SUNAT), usar ese
                          if (invoice.sunatResponse?.xmlStorageUrl) {
                            window.open(invoice.sunatResponse.xmlStorageUrl, '_blank')
                            toast.success('XML descargado exitosamente')
                            return
                          }
                          // Fallback: generar XML desde datos del documento (no firmado, para previsualización)
                          const result = await prepareInvoiceXML(invoice, companySettings)
                          if (result.success) {
                            await downloadCompressedXML(result.xml, result.fileName)
                            toast.success('XML generado (no enviado a SUNAT aún)')
                          } else {
                            toast.error(result.error || 'Error al generar el XML')
                          }
                        } catch (error) {
                          console.error('Error al descargar XML:', error)
                          toast.error('Error al descargar el XML')
                        }
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                    >
                      <Code className="w-4 h-4 text-blue-600" />
                      <span>Descargar XML</span>
                    </button>
                  )}

                  {/* Descargar CDR - Solo si el comprobante fue aceptado por SUNAT y tiene CDR */}
                  {invoice.sunatStatus === 'accepted' && (invoice.sunatResponse?.cdrStorageUrl || invoice.sunatResponse?.cdrData || invoice.sunatResponse?.cdrUrl) && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        // Prioridad: Storage URL > CDR externo > CDR data
                        if (invoice.sunatResponse.cdrStorageUrl) {
                          window.open(invoice.sunatResponse.cdrStorageUrl, '_blank')
                        } else if (invoice.sunatResponse.cdrUrl) {
                          window.open(invoice.sunatResponse.cdrUrl, '_blank')
                        } else if (invoice.sunatResponse.cdrData) {
                          // Descargar CDR desde data guardada en Firestore
                          const blob = new Blob([invoice.sunatResponse.cdrData], { type: 'application/xml' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `CDR-${invoice.series}-${invoice.correlativeNumber}.xml`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        }
                        toast.success('Descargando CDR de SUNAT')
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                    >
                      <FileCheck className="w-4 h-4 text-green-600" />
                      <span>CDR SUNAT</span>
                    </button>
                  )}

                  {/* Descargar CDR de Baja - Solo si fue anulado en SUNAT y tiene CDR de baja */}
                  {invoice.sunatStatus === 'voided' && (invoice.voidCdrStorageUrl || invoice.voidCdrData) && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        if (invoice.voidCdrStorageUrl) {
                          window.open(invoice.voidCdrStorageUrl, '_blank')
                        } else if (invoice.voidCdrData) {
                          const blob = new Blob([invoice.voidCdrData], { type: 'application/xml' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `CDR-BAJA-${invoice.series}-${invoice.correlativeNumber}.xml`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        }
                        toast.success('Descargando CDR de baja')
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                    >
                      <FileCheck className="w-4 h-4 text-red-600" />
                      <span>CDR Baja SUNAT</span>
                    </button>
                  )}

                  {/* Registrar Pago - Solo para notas de venta con saldo pendiente */}
                  {invoice.documentType === 'nota_venta' &&
                   invoice.status !== 'cancelled' &&
                   (invoice.paymentStatus === 'partial' || invoice.paymentStatus === 'pending') &&
                   (invoice.balance > 0 || invoice.status === 'pending') && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          setPaymentInvoice(invoice)
                          setNewPaymentAmount('')
                          setNewPaymentMethod('Efectivo')
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-3 text-green-600"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Registrar Pago</span>
                      </button>
                    </>
                  )}

                  {/* Anular - Solo para notas de venta no anuladas */}
                  {invoice.documentType === 'nota_venta' && invoice.status !== 'cancelled' && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          setVoidingInvoice(invoice)
                          setVoidReason('')
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-orange-50 flex items-center gap-3 text-orange-600"
                      >
                        <Ban className="w-4 h-4" />
                        <span>Anular Nota de Venta</span>
                      </button>
                    </>
                  )}

                  {/* Anular en SUNAT - Para facturas, boletas y notas de crédito/débito aceptadas dentro del plazo */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta' || invoice.documentType === 'nota_credito' || invoice.documentType === 'nota_debito') &&
                   invoice.sunatStatus === 'accepted' &&
                   invoice.status !== 'cancelled' &&
                   invoice.status !== 'voided' &&
                   (() => {
                     const validation = canVoidDocument(invoice)
                     return validation.canVoid
                   })() && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          setVoidingSunatInvoice(invoice)
                          setVoidSunatReason('')
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-orange-50 flex items-center gap-3 text-orange-600"
                      >
                        <Ban className="w-4 h-4" />
                        <span>Anular en SUNAT</span>
                      </button>
                    </>
                  )}

                  {/* Eliminar - Solo si está habilitado en Configuración Y NO fue enviado/aceptado por SUNAT */}
                  {/* Los comprobantes aceptados por SUNAT tienen validez fiscal y no se pueden eliminar */}
                  {/* Facturas/Boletas aceptadas solo se pueden anular mediante Nota de Crédito */}
                  {businessSettings?.allowDeleteInvoices && (
                    // Notas de venta (sin validez fiscal) se pueden eliminar si está habilitado
                    invoice.documentType === 'nota_venta' ||
                    // Facturas/Boletas/Notas de Crédito/Notas de Débito: solo si NO fueron aceptadas por SUNAT
                    (invoice.documentType !== 'nota_venta' && invoice.sunatStatus !== 'accepted')
                  ) && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          setDeletingInvoice(invoice)
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

      {/* View Invoice Modal */}
      <Modal
        isOpen={!!viewingInvoice}
        onClose={() => setViewingInvoice(null)}
        title="Detalles del Comprobante"
        size="lg"
      >
        {viewingInvoice && (
          <div className="space-y-5">
            {/* ========== HEADER ========== */}
            <div className="bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl p-5 -mx-1">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-primary-100 text-sm">{getDocumentTypeName(viewingInvoice.documentType)}</p>
                  <p className="text-2xl font-bold mt-1">{viewingInvoice.number}</p>
                  <p className="text-primary-100 text-sm mt-2">
                    {getInvoiceDate(viewingInvoice) ? formatDateTime(getInvoiceDate(viewingInvoice)) : 'Sin fecha'}
                  </p>
                </div>
                <div className="text-right space-y-2">
                  {getStatusBadge(viewingInvoice.status)}
                  <div className="mt-1">{getSunatStatusBadge(viewingInvoice.sunatStatus)}</div>
                </div>
              </div>
            </div>

            {/* ========== ERROR SUNAT ========== */}
            {viewingInvoice.sunatStatus === 'rejected' && viewingInvoice.sunatResponse && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-800">Rechazado por SUNAT</p>
                    <p className="text-sm text-red-700 mt-1">{viewingInvoice.sunatResponse.description || 'Error desconocido'}</p>
                    {viewingInvoice.sunatResponse.observations?.length > 0 && (
                      <ul className="mt-2 text-sm text-red-600 list-disc list-inside">
                        {viewingInvoice.sunatResponse.observations.map((obs, i) => <li key={i}>{obs}</li>)}
                      </ul>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
                      onClick={() => { setViewingInvoice(null); handleSendToSunat(viewingInvoice.id); }}
                      disabled={sendingToSunat === viewingInvoice.id}
                    >
                      {sendingToSunat === viewingInvoice.id ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reenviando...</>
                      ) : (
                        <><Send className="w-4 h-4 mr-2" />Reintentar envío</>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ========== INFO VENTA ========== */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {viewingInvoice.sellerName && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase">Vendedor</p>
                  <p className="font-medium text-gray-900 mt-1">{viewingInvoice.sellerName}</p>
                </div>
              )}
              {viewingInvoice.branchName && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase">Sucursal</p>
                  <p className="font-medium text-gray-900 mt-1">{viewingInvoice.branchName}</p>
                </div>
              )}
              {viewingInvoice.warehouseName && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase">Almacén</p>
                  <p className="font-medium text-gray-900 mt-1">{viewingInvoice.warehouseName}</p>
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase">Forma de Pago</p>
                <p className="font-medium text-gray-900 mt-1">{viewingInvoice.paymentType === 'credito' ? 'Crédito' : 'Contado'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase">Método</p>
                <p className="font-medium text-gray-900 mt-1">{viewingInvoice.paymentMethod || 'Efectivo'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase">Estado Pago</p>
                <Select
                  value={viewingInvoice.status}
                  onChange={e => handleUpdateStatus(viewingInvoice.id, e.target.value)}
                  className="mt-1 text-sm"
                >
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagada</option>
                  <option value="overdue">Vencida</option>
                  <option value="cancelled">Anulada</option>
                </Select>
              </div>
            </div>

            {/* ========== CLIENTE ========== */}
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-gray-400" />
                <h4 className="font-semibold text-gray-700">Cliente</h4>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-gray-900 text-lg">
                  {viewingInvoice.customer?.name || viewingInvoice.customer?.businessName || 'Cliente General'}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                  <span>{viewingInvoice.customer?.documentType === '6' ? 'RUC' : 'DNI'}: {viewingInvoice.customer?.documentNumber || '-'}</span>
                  {viewingInvoice.customer?.phone && <span>Tel: {viewingInvoice.customer.phone}</span>}
                  {viewingInvoice.customer?.email && <span>{viewingInvoice.customer.email}</span>}
                </div>
                {viewingInvoice.customer?.address && (
                  <p className="text-sm text-gray-500">{viewingInvoice.customer.address}</p>
                )}
                {(viewingInvoice.customer?.vehiclePlate || viewingInvoice.customer?.studentName) && (
                  <div className="flex gap-4 pt-2 border-t border-gray-100 text-sm">
                    {viewingInvoice.customer?.vehiclePlate && (
                      <span className="text-gray-600"><strong>Placa:</strong> {viewingInvoice.customer.vehiclePlate}</span>
                    )}
                    {viewingInvoice.customer?.studentName && (
                      <span className="text-gray-600"><strong>Alumno:</strong> {viewingInvoice.customer.studentName}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ========== ITEMS ========== */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-gray-400" />
                  <h4 className="font-semibold text-gray-700">Items ({viewingInvoice.items?.length || 0})</h4>
                </div>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {viewingInvoice.items?.map((item, idx) => (
                  <div key={idx} className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                          <span>{item.quantity} x {formatCurrency(item.unitPrice)}</span>
                          {item.code && <span className="text-gray-400">• Cód: {item.code}</span>}
                          {item.unit && <span className="text-gray-400">• {item.unit}</span>}
                          {item.taxAffectation === '20' && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Exonerado</span>}
                          {item.taxAffectation === '30' && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Inafecto</span>}
                        </div>
                        {item.batchNumber && (
                          <p className="text-xs text-blue-600 mt-1">
                            Lote: {item.batchNumber}
                            {item.batchExpiryDate && ` • Venc: ${item.batchExpiryDate?.toDate ? item.batchExpiryDate.toDate().toLocaleDateString('es-PE') : new Date(item.batchExpiryDate).toLocaleDateString('es-PE')}`}
                          </p>
                        )}
                        {item.observations && <p className="text-xs text-gray-500 mt-1 italic">{item.observations}</p>}
                      </div>
                      <p className="font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(item.subtotal)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ========== TOTALES ========== */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="space-y-2 text-sm">
                {viewingInvoice.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Descuento{viewingInvoice.discountPercentage ? ` (${viewingInvoice.discountPercentage}%)` : ''}</span>
                    <span>-{formatCurrency(viewingInvoice.discount)}</span>
                  </div>
                )}
                {viewingInvoice.opGravadas > 0 && (
                  <div className="flex justify-between"><span className="text-gray-600">Op. Gravadas</span><span>{formatCurrency(viewingInvoice.opGravadas)}</span></div>
                )}
                {viewingInvoice.opExoneradas > 0 && (
                  <div className="flex justify-between text-amber-600"><span>Op. Exoneradas</span><span>{formatCurrency(viewingInvoice.opExoneradas)}</span></div>
                )}
                {viewingInvoice.opInafectas > 0 && (
                  <div className="flex justify-between text-blue-600"><span>Op. Inafectas</span><span>{formatCurrency(viewingInvoice.opInafectas)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span>{formatCurrency(viewingInvoice.subtotal)}</span></div>
                {viewingInvoice.igv > 0 && (
                  viewingInvoice.igvByRate && Object.keys(viewingInvoice.igvByRate).length > 1 ? (
                    Object.entries(viewingInvoice.igvByRate)
                      .sort(([a], [b]) => Number(b) - Number(a))
                      .map(([rate, data]) => (
                        <div key={rate} className="flex justify-between"><span className="text-gray-600">IGV ({rate}%)</span><span>{formatCurrency(data.igv || 0)}</span></div>
                      ))
                  ) : (
                    <div className="flex justify-between"><span className="text-gray-600">IGV ({(viewingInvoice.igvByRate && Object.keys(viewingInvoice.igvByRate)[0]) || viewingInvoice.taxConfig?.igvRate || 18}%)</span><span>{formatCurrency(viewingInvoice.igv)}</span></div>
                  )
                )}
                {viewingInvoice.recargoConsumo > 0 && (
                  <div className="flex justify-between text-green-600"><span>Recargo al Consumo ({viewingInvoice.recargoConsumoRate || 10}%)</span><span>{formatCurrency(viewingInvoice.recargoConsumo)}</span></div>
                )}
                {viewingInvoice.detractionAmount > 0 && (
                  <div className="flex justify-between text-orange-600 pt-2 border-t"><span>Detracción ({viewingInvoice.detractionPercentage}%)</span><span>-{formatCurrency(viewingInvoice.detractionAmount)}</span></div>
                )}
                <div className="flex justify-between text-xl font-bold pt-3 border-t border-gray-300">
                  <span>Total</span>
                  <span className="text-primary-600">{formatCurrency(viewingInvoice.total)}</span>
                </div>
              </div>
            </div>

            {/* ========== CUOTAS CRÉDITO ========== */}
            {viewingInvoice.paymentType === 'credito' && viewingInvoice.creditTerms?.installments?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="font-semibold text-amber-800 mb-3">Cuotas de Pago</h4>
                <div className="space-y-2">
                  {viewingInvoice.creditTerms.installments.map((cuota, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-amber-700">Cuota {i + 1} - Vence: {cuota.dueDate}</span>
                      <span className="font-semibold text-amber-900">{formatCurrency(cuota.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========== PAGOS MÚLTIPLES ========== */}
            {viewingInvoice.payments?.length > 1 && (
              <div className="border border-gray-200 rounded-xl p-4">
                <h4 className="font-semibold text-gray-700 mb-3">Métodos de Pago Usados</h4>
                <div className="grid grid-cols-2 gap-2">
                  {viewingInvoice.payments.map((pago, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-2 flex justify-between text-sm">
                      <span className="text-gray-600">{pago.method}</span>
                      <span className="font-medium">{formatCurrency(pago.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========== NOTAS ========== */}
            {viewingInvoice.notes && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-yellow-800 uppercase mb-1">Observaciones</p>
                <p className="text-sm text-yellow-900">{viewingInvoice.notes}</p>
              </div>
            )}

            {/* ========== CONVERSIONES ========== */}
            {viewingInvoice.convertedTo && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">Nota convertida a Boleta</p>
                  <p className="text-sm text-green-700">Boleta: <strong>{viewingInvoice.convertedTo.number}</strong></p>
                </div>
              </div>
            )}
            {viewingInvoice.convertedFrom && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                <ArrowRightCircle className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-800">Generada desde Nota de Venta</p>
                  <p className="text-sm text-blue-700">Nota: <strong>{viewingInvoice.convertedFrom.number}</strong></p>
                </div>
              </div>
            )}

            {/* ========== ARCHIVOS SUNAT ========== */}
            {viewingInvoice.sunatStatus === 'accepted' && (viewingInvoice.sunatResponse?.xmlStorageUrl || viewingInvoice.sunatResponse?.cdrStorageUrl || viewingInvoice.sunatResponse?.cdrData) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-semibold text-emerald-800">Archivos SUNAT</h4>
                </div>
                {viewingInvoice.sunatResponse?.hash && (
                  <p className="text-xs text-emerald-700 font-mono mb-3 break-all bg-emerald-100 p-2 rounded">
                    Hash: {viewingInvoice.sunatResponse.hash}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {viewingInvoice.sunatResponse?.xmlStorageUrl && (
                    <Button size="sm" variant="outline" onClick={() => window.open(viewingInvoice.sunatResponse.xmlStorageUrl, '_blank')}>
                      <Code className="w-4 h-4 mr-2" />Descargar XML
                    </Button>
                  )}
                  {(viewingInvoice.sunatResponse?.cdrStorageUrl || viewingInvoice.sunatResponse?.cdrData) && (
                    <Button size="sm" variant="outline" onClick={() => {
                      if (viewingInvoice.sunatResponse.cdrStorageUrl) {
                        window.open(viewingInvoice.sunatResponse.cdrStorageUrl, '_blank')
                      } else if (viewingInvoice.sunatResponse.cdrData) {
                        const blob = new Blob([viewingInvoice.sunatResponse.cdrData], { type: 'application/xml' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url; a.download = `CDR-${viewingInvoice.number}.xml`; a.click()
                        URL.revokeObjectURL(url)
                      }
                    }}>
                      <FileCheck className="w-4 h-4 mr-2" />Descargar CDR
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ========== ARCHIVOS BAJA SUNAT ========== */}
            {viewingInvoice.sunatStatus === 'voided' && (viewingInvoice.voidXmlStorageUrl || viewingInvoice.voidCdrStorageUrl || viewingInvoice.voidCdrData) && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck className="w-4 h-4 text-red-600" />
                  <h4 className="font-semibold text-red-800">Archivos de Baja SUNAT</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {viewingInvoice.voidXmlStorageUrl && (
                    <Button size="sm" variant="outline" onClick={() => window.open(viewingInvoice.voidXmlStorageUrl, '_blank')}>
                      <Code className="w-4 h-4 mr-2" />XML Comunicación de Baja
                    </Button>
                  )}
                  {(viewingInvoice.voidCdrStorageUrl || viewingInvoice.voidCdrData) && (
                    <Button size="sm" variant="outline" onClick={() => {
                      if (viewingInvoice.voidCdrStorageUrl) {
                        window.open(viewingInvoice.voidCdrStorageUrl, '_blank')
                      } else if (viewingInvoice.voidCdrData) {
                        const blob = new Blob([viewingInvoice.voidCdrData], { type: 'application/xml' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url; a.download = `CDR-BAJA-${viewingInvoice.number}.xml`; a.click()
                        URL.revokeObjectURL(url)
                      }
                    }}>
                      <FileCheck className="w-4 h-4 mr-2" />CDR de Baja
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ========== ACCIONES ========== */}
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button size="sm" variant="outline" onClick={() => handleSendWhatsApp(viewingInvoice)} disabled={sendingWhatsApp}>
                  {sendingWhatsApp ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Share2 className="w-4 h-4 mr-1" />}
                  WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  if (!companySettings?.ruc) { toast.error('Configura los datos de tu empresa primero'); return; }
                  handlePrintTicket()
                }}>
                  <Printer className="w-4 h-4 mr-1" />
                  Ticket
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!companySettings?.ruc) { toast.error('Configura los datos de tu empresa primero'); return; }
                  try { await previewInvoicePDF(viewingInvoice, companySettings, branding) } catch (e) { toast.error('Error al generar vista previa') }
                }}>
                  <Eye className="w-4 h-4 mr-1" />
                  Vista Previa
                </Button>
                <Button size="sm" onClick={async () => {
                  if (!companySettings?.ruc) { toast.error('Configura los datos de tu empresa primero'); return; }
                  try { await generateInvoicePDF(viewingInvoice, companySettings, true, branding, branches); toast.success('PDF descargado') } catch (e) { toast.error('Error') }
                }}>
                  <Download className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setViewingInvoice(null)}>
                  Cerrar
                </Button>
                {/* Solo mostrar para notas de venta reales (no boletas/facturas mal etiquetadas) */}
                {viewingInvoice.documentType === 'nota_venta' &&
                 viewingInvoice.sunatStatus === 'not_applicable' &&
                 !viewingInvoice.convertedTo &&
                 viewingInvoice.status !== 'voided' && (
                  <Button size="sm" variant="success" className="flex-1" onClick={() => handleConvertInPOS(viewingInvoice)}>
                    <Receipt className="w-4 h-4 mr-1" />
                    Convertir a Comprobante
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingInvoice}
        onClose={() => !isDeleting && setDeletingInvoice(null)}
        title="Eliminar Comprobante"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar el comprobante{' '}
                <strong>{deletingInvoice?.number}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">Esta acción no se puede deshacer.</p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingInvoice(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>Eliminar</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Void Sales Note Modal */}
      <Modal
        isOpen={!!voidingInvoice}
        onClose={() => !isVoiding && setVoidingInvoice(null)}
        title="Anular Nota de Venta"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <Ban className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas anular la nota de venta{' '}
                <strong>{voidingInvoice?.number}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción marcará la nota como anulada y devolverá el stock de los productos.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Motivo de anulación (opcional)
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Ej: Error en el documento, cliente canceló la compra..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              rows={3}
              disabled={isVoiding}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVoidingInvoice(null)
                setVoidReason('')
              }}
              disabled={isVoiding}
            >
              Cancelar
            </Button>
            <Button
              variant="warning"
              onClick={handleVoidInvoice}
              disabled={isVoiding}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isVoiding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Anulando...
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4 mr-2" />
                  Anular Nota de Venta
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Void SUNAT Invoice Modal (Comunicación de Baja) */}
      <Modal
        isOpen={!!voidingSunatInvoice}
        onClose={() => !isVoidingSunat && setVoidingSunatInvoice(null)}
        title={`Anular ${voidingSunatInvoice?.documentType === 'nota_credito' ? 'Nota de Crédito' : voidingSunatInvoice?.documentType === 'nota_debito' ? 'Nota de Débito' : voidingSunatInvoice?.documentType === 'boleta' ? 'Boleta' : 'Factura'} en SUNAT`}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <Ban className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas anular {voidingSunatInvoice?.documentType === 'nota_credito' ? 'la nota de crédito' : voidingSunatInvoice?.documentType === 'nota_debito' ? 'la nota de débito' : voidingSunatInvoice?.documentType === 'boleta' ? 'la boleta' : 'la factura'}{' '}
                <strong>{voidingSunatInvoice?.number || `${voidingSunatInvoice?.series}-${voidingSunatInvoice?.correlativeNumber}`}</strong> en SUNAT?
              </p>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 font-medium mb-2">Comunicación de Baja</p>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Se enviará una Comunicación de Baja a SUNAT</li>
              <li>El documento quedará anulado en el sistema de SUNAT</li>
              <li>Este proceso puede tomar unos segundos</li>
            </ul>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Importante:</strong> Solo puede anular documentos que NO hayan sido entregados al cliente.
              {voidingSunatInvoice?.documentType === 'nota_credito' && ' Si ya fue entregada, debe emitir una Nota de Débito para revertirla.'}
              {(voidingSunatInvoice?.documentType === 'factura' || voidingSunatInvoice?.documentType === 'boleta') && ' Si el cliente ya recibió el documento, debe emitir una Nota de Crédito.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Motivo de anulación
            </label>
            <select
              value={voidSunatReason}
              onChange={(e) => setVoidSunatReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              disabled={isVoidingSunat}
            >
              <option value="">Seleccione un motivo</option>
              <option value="ANULACION DE OPERACION">Anulación de operación</option>
              <option value="ERROR EN RUC">Error en RUC del cliente</option>
              <option value="ERROR EN DESCRIPCION">Error en descripción de productos</option>
              <option value="ERROR EN MONTOS">Error en montos o cálculos</option>
              <option value="DOCUMENTO NO ENTREGADO">Documento no entregado</option>
            </select>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVoidingSunatInvoice(null)
                setVoidSunatReason('')
              }}
              disabled={isVoidingSunat}
            >
              Cancelar
            </Button>
            <Button
              variant="warning"
              onClick={handleVoidSunatInvoice}
              disabled={isVoidingSunat || !voidSunatReason}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isVoidingSunat ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Anulando...
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4 mr-2" />
                  Anular en SUNAT
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Register Payment Modal */}
      <Modal
        isOpen={!!paymentInvoice}
        onClose={() => !isRegisteringPayment && setPaymentInvoice(null)}
        title="Registrar Pago"
        size="sm"
      >
        {paymentInvoice && (
          <div className="space-y-4">
            {/* Current Payment Status */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-gray-900 text-sm">Estado de Pago Actual</h4>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Total</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(paymentInvoice.total)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Pagado</p>
                  <p className="font-semibold text-green-600">{formatCurrency(paymentInvoice.amountPaid || 0)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Saldo</p>
                  <p className="font-semibold text-orange-600">{formatCurrency(paymentInvoice.balance || 0)}</p>
                </div>
              </div>
            </div>

            {/* Payment Amount Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monto del Pago <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={paymentInvoice.balance}
                value={newPaymentAmount}
                onChange={(e) => setNewPaymentAmount(e.target.value)}
                placeholder="0.00"
                disabled={isRegisteringPayment}
              />
              <p className="text-xs text-gray-500 mt-1">
                Máximo: {formatCurrency(paymentInvoice.balance || 0)}
              </p>
            </div>

            {/* Payment Method Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Método de Pago
              </label>
              <Select
                value={newPaymentMethod}
                onChange={(e) => setNewPaymentMethod(e.target.value)}
                disabled={isRegisteringPayment}
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Yape">Yape</option>
                <option value="Plin">Plin</option>
              </Select>
            </div>

            {/* Payment Preview */}
            {newPaymentAmount && parseFloat(newPaymentAmount) > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-900 mb-2">Vista Previa</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Nuevo pago:</span>
                    <span className="font-semibold text-blue-600">
                      {formatCurrency(parseFloat(newPaymentAmount))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Total pagado:</span>
                    <span className="font-semibold text-green-600">
                      {formatCurrency((paymentInvoice.amountPaid || 0) + parseFloat(newPaymentAmount))}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-blue-300 pt-1">
                    <span className="text-gray-700">Nuevo saldo:</span>
                    <span className="font-semibold text-orange-600">
                      {formatCurrency(paymentInvoice.balance - parseFloat(newPaymentAmount))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPaymentInvoice(null)
                  setNewPaymentAmount('')
                  setNewPaymentMethod('Efectivo')
                }}
                disabled={isRegisteringPayment}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleRegisterPayment}
                disabled={isRegisteringPayment || !newPaymentAmount || parseFloat(newPaymentAmount) <= 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {isRegisteringPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Registrar Pago
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Exportar Comprobantes a Excel"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Selecciona los tipos de comprobantes y el rango de fechas para exportar
          </p>

          {/* Checkboxes de tipos de comprobante */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipos de Comprobante
            </label>
            <div className="space-y-2 bg-gray-50 p-3 rounded-lg">
              {/* Seleccionar/Deseleccionar todos */}
              <label className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <input
                  type="checkbox"
                  checked={exportFilters.types.length === 5}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setExportFilters({ ...exportFilters, types: ['factura', 'boleta', 'nota_venta', 'nota_credito', 'nota_debito'] })
                    } else {
                      setExportFilters({ ...exportFilters, types: [] })
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-700">Seleccionar todos</span>
              </label>

              {/* Facturas */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exportFilters.types.includes('factura')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setExportFilters({ ...exportFilters, types: [...exportFilters.types, 'factura'] })
                    } else {
                      setExportFilters({ ...exportFilters, types: exportFilters.types.filter(t => t !== 'factura') })
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Facturas</span>
              </label>

              {/* Boletas */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exportFilters.types.includes('boleta')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setExportFilters({ ...exportFilters, types: [...exportFilters.types, 'boleta'] })
                    } else {
                      setExportFilters({ ...exportFilters, types: exportFilters.types.filter(t => t !== 'boleta') })
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Boletas</span>
              </label>

              {/* Notas de Venta */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exportFilters.types.includes('nota_venta')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setExportFilters({ ...exportFilters, types: [...exportFilters.types, 'nota_venta'] })
                    } else {
                      setExportFilters({ ...exportFilters, types: exportFilters.types.filter(t => t !== 'nota_venta') })
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Notas de Venta</span>
              </label>

              {/* Notas de Crédito */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exportFilters.types.includes('nota_credito')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setExportFilters({ ...exportFilters, types: [...exportFilters.types, 'nota_credito'] })
                    } else {
                      setExportFilters({ ...exportFilters, types: exportFilters.types.filter(t => t !== 'nota_credito') })
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Notas de Crédito</span>
              </label>

              {/* Notas de Débito */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exportFilters.types.includes('nota_debito')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setExportFilters({ ...exportFilters, types: [...exportFilters.types, 'nota_debito'] })
                    } else {
                      setExportFilters({ ...exportFilters, types: exportFilters.types.filter(t => t !== 'nota_debito') })
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Notas de Débito</span>
              </label>
            </div>
          </div>

          {/* Filtro de estado SUNAT */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estado SUNAT
            </label>
            <Select
              value={exportFilters.sunatStatus}
              onChange={(e) => setExportFilters({ ...exportFilters, sunatStatus: e.target.value })}
            >
              <option value="all">Todos los estados</option>
              <option value="accepted">Aceptados por SUNAT</option>
              <option value="pending">Pendientes de envío</option>
              <option value="rejected">Rechazados por SUNAT</option>
              <option value="voided">Anulados en SUNAT</option>
              <option value="not_applicable">No aplica (Notas de Venta)</option>
            </Select>
          </div>

          {/* Opción para excluir documentos convertidos */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={exportFilters.excludeConverted}
                onChange={(e) => setExportFilters({ ...exportFilters, excludeConverted: e.target.checked })}
                className="w-4 h-4 mt-0.5 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
              />
              <div>
                <span className="text-sm font-medium text-amber-800">Evitar duplicados por conversión</span>
                <p className="text-xs text-amber-700 mt-0.5">
                  Excluye las boletas generadas desde notas de venta y las notas ya convertidas para evitar contar ventas dobles.
                </p>
              </div>
            </label>
          </div>

          {/* Rango de fechas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                type="date"
                label="Fecha Desde"
                value={exportFilters.startDate}
                onChange={(e) => setExportFilters({ ...exportFilters, startDate: e.target.value })}
                placeholder="dd/mm/aaaa"
              />
              {!exportFilters.startDate && (
                <p className="text-xs text-gray-500 mt-1">Selecciona fecha inicial</p>
              )}
            </div>
            <div>
              <Input
                type="date"
                label="Fecha Hasta"
                value={exportFilters.endDate}
                onChange={(e) => setExportFilters({ ...exportFilters, endDate: e.target.value })}
                placeholder="dd/mm/aaaa"
              />
              {!exportFilters.endDate && (
                <p className="text-xs text-gray-500 mt-1">Selecciona fecha final</p>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Nota:</strong> Si no seleccionas fechas, se exportarán todos los comprobantes de los tipos seleccionados.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowExportModal(false)}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleExportToExcel}
              disabled={exportFilters.types.length === 0}
              className="w-full sm:flex-1"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Exportar a Excel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Exportar XML/CDR */}
      <Modal
        isOpen={showXMLExportModal}
        onClose={() => !isExportingXML && setShowXMLExportModal(false)}
        title="Exportar XML y CDR para Auditoría"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Descarga todos los XML y CDR de comprobantes aceptados por SUNAT para el período seleccionado.
            Útil para declaraciones mensuales y auditorías.
          </p>

          {/* Selector de período */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
              <Select
                value={xmlExportFilters.month}
                onChange={(e) => setXmlExportFilters(prev => ({ ...prev, month: parseInt(e.target.value) }))}
                disabled={isExportingXML}
              >
                <option value={1}>Enero</option>
                <option value={2}>Febrero</option>
                <option value={3}>Marzo</option>
                <option value={4}>Abril</option>
                <option value={5}>Mayo</option>
                <option value={6}>Junio</option>
                <option value={7}>Julio</option>
                <option value={8}>Agosto</option>
                <option value={9}>Septiembre</option>
                <option value={10}>Octubre</option>
                <option value={11}>Noviembre</option>
                <option value={12}>Diciembre</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
              <Select
                value={xmlExportFilters.year}
                onChange={(e) => setXmlExportFilters(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                disabled={isExportingXML}
              >
                {[...Array(5)].map((_, i) => {
                  const year = new Date().getFullYear() - i
                  return <option key={year} value={year}>{year}</option>
                })}
              </Select>
            </div>
          </div>

          {/* Opciones de exportación */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Incluir en la exportación:</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={xmlExportFilters.includeXML}
                  onChange={(e) => setXmlExportFilters(prev => ({ ...prev, includeXML: e.target.checked }))}
                  disabled={isExportingXML}
                  className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Archivos XML</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={xmlExportFilters.includeCDR}
                  onChange={(e) => setXmlExportFilters(prev => ({ ...prev, includeCDR: e.target.checked }))}
                  disabled={isExportingXML}
                  className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Archivos CDR (respuesta SUNAT)</span>
              </label>
            </div>
          </div>

          {/* Barra de progreso */}
          {isExportingXML && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Descargando archivos...</span>
                <span className="font-medium">{xmlExportProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${xmlExportProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Info */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-700">
              <strong>Nota:</strong> Solo se exportarán comprobantes electrónicos (facturas, boletas, notas de crédito/débito)
              que hayan sido aceptados por SUNAT. Los archivos se descargarán en un ZIP organizado por carpetas XML y CDR.
            </p>
          </div>

          {/* Botones */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowXMLExportModal(false)}
              disabled={isExportingXML}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleExportXMLCDR}
              disabled={isExportingXML || (!xmlExportFilters.includeXML && !xmlExportFilters.includeCDR)}
              className="w-full sm:flex-1"
            >
              {isExportingXML ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Descargar ZIP
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Hidden Ticket Component for Printing */}
      {/* Ticket Oculto para Impresión */}
      {viewingInvoice && (
        <div className="hidden print:block">
          <InvoiceTicket ref={ticketRef} invoice={viewingInvoice} companySettings={companySettings} paperWidth={80} webPrintLegible={webPrintLegible} compactPrint={compactPrint} />
        </div>
      )}

      {/* Modal para crear Guía de Remisión */}
      <CreateDispatchGuideModal
        isOpen={showDispatchGuideModal}
        onClose={() => {
          setShowDispatchGuideModal(false)
          setSelectedInvoiceForGuide(null)
        }}
        referenceInvoice={selectedInvoiceForGuide}
      />
    </div>
  )
}
