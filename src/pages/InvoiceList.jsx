import { useState, useEffect, useRef } from 'react'
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
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices, deleteInvoice, updateInvoice, getCompanySettings, sendInvoiceToSunat, sendCreditNoteToSunat, convertNotaVentaToBoleta } from '@/services/firestoreService'
import { generateInvoicePDF } from '@/utils/pdfGenerator'
import { prepareInvoiceXML, downloadCompressedXML, isSunatConfigured, voidDocument, canVoidDocument, checkVoidStatus } from '@/services/sunatService'
import { generateInvoicesExcel } from '@/services/invoiceExportService'
import InvoiceTicket from '@/components/InvoiceTicket'
import CreateDispatchGuideModal from '@/components/CreateDispatchGuideModal'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { printInvoiceTicket, connectPrinter, getPrinterConfig } from '@/services/thermalPrinterService'

export default function InvoiceList() {
  const { user, isDemoMode, demoData, getBusinessId, businessSettings } = useAppContext()
  const navigate = useNavigate()
  const toast = useToast()
  const [invoices, setInvoices] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const ticketRef = useRef()

  // Helper para manejar fechas (Firestore Timestamp o Date)
  const getInvoiceDate = (invoice) => {
    if (!invoice?.createdAt) return null
    return invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
  }
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterSeller, setFilterSeller] = useState('all')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [viewingInvoice, setViewingInvoice] = useState(null)
  const [deletingInvoice, setDeletingInvoice] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [sendingToSunat, setSendingToSunat] = useState(null) // ID de factura siendo enviada a SUNAT
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

  // Estados para conversión de Nota de Venta a Boleta
  const [convertingInvoice, setConvertingInvoice] = useState(null)
  const [isConverting, setIsConverting] = useState(false)
  const [convertCustomerData, setConvertCustomerData] = useState({
    name: '',
    documentType: 'DNI',
    documentNumber: '',
  })

  // Estado para configuración de impresión web legible
  const [webPrintLegible, setWebPrintLegible] = useState(false)

  // Cargar configuración de impresora para webPrintLegible
  useEffect(() => {
    const loadPrinterConfig = async () => {
      if (!user?.uid) return
      const printerConfigResult = await getPrinterConfig(getBusinessId())
      console.log('📄 InvoiceList - Resultado getPrinterConfig:', printerConfigResult)
      if (printerConfigResult.success && printerConfigResult.config) {
        const webPrintValue = printerConfigResult.config.webPrintLegible || false
        console.log('📄 InvoiceList - webPrintLegible cargado:', webPrintValue)
        setWebPrintLegible(webPrintValue)
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

    // Limpiar el número de teléfono (solo dígitos)
    const cleanPhone = phone.replace(/\D/g, '')

    // Crear mensaje
    const docTypeName = invoice.documentType === 'factura' ? 'Factura' :
                       invoice.documentType === 'boleta' ? 'Boleta' : 'Nota de Venta'

    const customerName = invoice.customer?.name || 'Cliente'
    const total = `S/ ${Number(invoice.total).toFixed(2)}`

    const message = `Hola ${customerName},

Gracias por tu compra. Aquí está el detalle de tu ${docTypeName}:

${docTypeName}: ${invoice.number}
Total: ${total}

${companySettings?.businessName || 'Tu Empresa'}
${companySettings?.phone ? `Tel: ${companySettings.phone}` : ''}
${companySettings?.website ? companySettings.website : ''}`

    const isNative = Capacitor.isNativePlatform()

    // Si es móvil, usar Capacitor Share con PDF
    if (isNative) {
      try {
        // Generar PDF
        toast.info('Generando PDF...')
        const pdfResult = await generateInvoicePDF(invoice, companySettings)

        if (pdfResult?.uri) {
          // Compartir con PDF adjunto
          await Share.share({
            title: `${docTypeName} ${invoice.number}`,
            text: message,
            url: pdfResult.uri,
            dialogTitle: 'Compartir comprobante por WhatsApp'
          })
          toast.success('Abriendo WhatsApp...')
        } else {
          // Si falla la generación del PDF, enviar solo texto
          const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
          window.open(url, '_blank')
          toast.success('Abriendo WhatsApp...')
        }
      } catch (error) {
        console.error('Error al compartir:', error)
        toast.error('Error al compartir el PDF')
      }
    } else {
      // En web, usar WhatsApp Web (solo texto)
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      window.open(url, '_blank')
      toast.success('Abriendo WhatsApp...')
    }
  }

  useEffect(() => {
    loadInvoices()
  }, [user])

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
          // Importar función de manejo de stock
          const { updateProductStock } = await import('@/services/firestoreService')

          for (const item of voidingInvoice.items) {
            if (item.productId) {
              try {
                await updateProductStock(businessId, item.productId, item.quantity, 'add')
              } catch (stockError) {
                console.warn(`No se pudo devolver stock para producto ${item.productId}:`, stockError)
              }
            }
          }
        }

        toast.success('Nota de venta anulada exitosamente')
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

      // Obtener método de emisión desde businessSettings
      const emissionMethod = businessSettings?.emissionConfig?.method || null

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
        toast.success(`${docTypeName} anulada exitosamente en SUNAT`)
        setVoidingSunatInvoice(null)
        setVoidSunatReason('')
        loadInvoices()
      } else if (result.status === 'pending') {
        toast.info('La anulación está siendo procesada por SUNAT. Consulte el estado en unos minutos.')
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

  // Función para abrir modal de conversión
  const handleOpenConvertModal = (invoice) => {
    // Pre-llenar con datos del cliente de la nota de venta
    setConvertCustomerData({
      name: invoice.customer?.name || '',
      documentType: invoice.customer?.documentType || 'DNI',
      documentNumber: invoice.customer?.documentNumber || '',
    })
    setConvertingInvoice(invoice)
  }

  // Función para convertir Nota de Venta a Boleta
  const handleConvertToBoleta = async () => {
    if (!convertingInvoice || !user?.uid) return
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    // Validar que tenga DNI para boleta
    if (!convertCustomerData.documentNumber || convertCustomerData.documentNumber.length < 8) {
      toast.error('Debe ingresar un DNI válido (8 dígitos) para generar la boleta')
      return
    }

    const businessId = getBusinessId()
    setIsConverting(true)

    try {
      // Convertir la nota de venta a boleta
      const result = await convertNotaVentaToBoleta(
        businessId,
        convertingInvoice.id,
        convertCustomerData
      )

      if (result.success) {
        toast.success(`Boleta ${result.boletaNumber} generada exitosamente`)

        // Preguntar si desea enviar a SUNAT
        const sendToSunat = window.confirm(
          `La boleta ${result.boletaNumber} ha sido creada.\n\n¿Deseas enviarla a SUNAT ahora?`
        )

        if (sendToSunat) {
          // Enviar a SUNAT
          setSendingToSunat(result.boletaId)
          try {
            const sunatResult = await sendInvoiceToSunat(businessId, result.boletaId)
            if (sunatResult.success) {
              toast.success('Boleta enviada a SUNAT exitosamente')
            } else {
              toast.error('Error al enviar a SUNAT: ' + (sunatResult.error || 'Error desconocido'))
            }
          } catch (sunatError) {
            console.error('Error al enviar a SUNAT:', sunatError)
            toast.error('Error al enviar a SUNAT. Puedes reintentarlo más tarde.')
          } finally {
            setSendingToSunat(null)
          }
        }

        // Cerrar modal y recargar lista
        setConvertingInvoice(null)
        setViewingInvoice(null)
        loadInvoices()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error al convertir nota de venta:', error)
      toast.error('Error al convertir la nota de venta')
    } finally {
      setIsConverting(false)
    }
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

    if (paymentAmount > paymentInvoice.balance) {
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

  const handleExportToExcel = () => {
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

      if (filteredInvoices.length === 0) {
        toast.error('No hay comprobantes que coincidan con los filtros seleccionados');
        return;
      }

      // Generar Excel
      generateInvoicesExcel(filteredInvoices, exportFilters, companySettings);
      toast.success(`${filteredInvoices.length} comprobante(s) exportado(s) exitosamente`);
      setShowExportModal(false);
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      toast.error('Error al generar el archivo Excel');
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

  // Filtrar facturas
  const filteredInvoices = invoices.filter(invoice => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      invoice.number?.toLowerCase().includes(search) ||
      invoice.customer?.name?.toLowerCase().includes(search) ||
      invoice.customer?.documentNumber?.includes(search)

    const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus
    const matchesType = filterType === 'all' || invoice.documentType === filterType
    const matchesSeller = filterSeller === 'all' || invoice.createdBy === filterSeller

    // Filtrar por rango de fechas
    let matchesDateRange = true
    if (filterStartDate || filterEndDate) {
      const invoiceDate = getInvoiceDate(invoice)

      if (filterStartDate) {
        // Crear fecha en zona horaria local (no UTC)
        const [year, month, day] = filterStartDate.split('-').map(Number);
        const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (invoiceDate && invoiceDate < startDate) {
          matchesDateRange = false
        }
      }

      if (filterEndDate) {
        // Crear fecha en zona horaria local (no UTC)
        const [year, month, day] = filterEndDate.split('-').map(Number);
        const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
        if (invoiceDate && invoiceDate > endDate) {
          matchesDateRange = false
        }
      }
    }

    return matchesSearch && matchesStatus && matchesType && matchesSeller && matchesDateRange
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
  }, [searchTerm, filterStatus, filterType, filterSeller, filterStartDate, filterEndDate])

  const getStatusBadge = (status, documentType) => {
    // Para Notas de Crédito, usar estados específicos
    if (documentType === 'nota_credito') {
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

  // Estadísticas
  const stats = {
    total: invoices.length,
    paid: invoices.filter(i => i.status === 'paid').length,
    pending: invoices.filter(i => i.status === 'pending').length,
    totalAmount: invoices.reduce((sum, i) => sum + (i.total || 0), 0),
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
                <p className="text-xs sm:text-sm font-medium text-gray-600">Total Comprobantes</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
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
                <p className="text-xs sm:text-sm font-medium text-gray-600">Monto Total</p>
                <p className="text-lg sm:text-xl font-bold text-primary-600 mt-2">
                  {formatCurrency(stats.totalAmount)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Barra de búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por número, cliente, RUC/DNI..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
              >
                <option value="all">Todos los tipos</option>
                <option value="factura">Facturas</option>
                <option value="boleta">Boletas</option>
                <option value="nota_credito">Notas de Crédito</option>
                <option value="nota_debito">Notas de Débito</option>
                <option value="nota_venta">Notas de Venta</option>
              </Select>
              <Select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                <option value="paid">Pagadas</option>
                <option value="pending">Pendientes</option>
                <option value="overdue">Vencidas</option>
                <option value="cancelled">Anuladas</option>
              </Select>
              <Select
                value={filterSeller}
                onChange={e => setFilterSeller(e.target.value)}
              >
                <option value="all">Todos los vendedores</option>
                {sellers.map(seller => (
                  <option key={seller.id} value={seller.id}>
                    {seller.name}
                  </option>
                ))}
              </Select>
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
                  style={{ minHeight: '44px' }}
                />
              </div>
            </div>

            {/* Clear filters button */}
            {(filterStartDate || filterEndDate) && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setFilterStartDate('')
                    setFilterEndDate('')
                  }}
                  className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                >
                  Limpiar fechas
                </button>
              </div>
            )}
          </div>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2.5 px-3">Número</TableHead>
                  <TableHead className="py-2.5 px-3">Tipo</TableHead>
                  <TableHead className="py-2.5 px-3">Cliente</TableHead>
                  <TableHead className="py-2.5 px-3">Fecha</TableHead>
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

                  {/* Reenviar a SUNAT (para facturas rechazadas o firmadas pero no enviadas) */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                   (invoice.sunatStatus === 'rejected' || invoice.sunatStatus === 'SIGNED' || invoice.sunatStatus === 'signed') && (
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

                  {/* Reenviar Nota de Crédito a SUNAT (rechazada o firmada) */}
                  {invoice.documentType === 'nota_credito' &&
                   (invoice.sunatStatus === 'rejected' || invoice.sunatStatus === 'SIGNED' || invoice.sunatStatus === 'signed') && (
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

                  {/* Descargar PDF */}
                  <button
                    onClick={async () => {
                      setOpenMenuId(null)
                      try {
                        const result = await generateInvoicePDF(invoice, companySettings)
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

                  {/* Descargar XML - Para facturas, boletas, notas de crédito y débito (comprobantes con validez fiscal) */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta' ||
                    invoice.documentType === 'nota_credito' || invoice.documentType === 'nota_debito') && (
                    <button
                      onClick={async () => {
                        setOpenMenuId(null)
                        try {
                          const result = await prepareInvoiceXML(invoice, companySettings)
                          if (result.success) {
                            await downloadCompressedXML(result.xml, result.fileName)
                            toast.success('XML descargado exitosamente')
                          } else {
                            toast.error(result.error || 'Error al generar el XML')
                          }
                        } catch (error) {
                          console.error('Error al generar XML:', error)
                          toast.error('Error al generar el XML')
                        }
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                    >
                      <Code className="w-4 h-4 text-blue-600" />
                      <span>Descargar XML</span>
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

                  {/* Anular en SUNAT - Para facturas y boletas aceptadas dentro del plazo */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                   invoice.sunatStatus === 'accepted' &&
                   invoice.status !== 'cancelled' &&
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
          <div className="space-y-6" data-web-print-legible={webPrintLegible}>
            {/* CSS para impresión web legible */}
            {console.log('🖨️ Renderizando modal de invoice - webPrintLegible:', webPrintLegible)}
            <style>{`
              @media print {
                /* Aplicar a TODOS los elementos dentro del contenedor */
                [data-web-print-legible="true"] * {
                  font-size: 12pt !important;
                  font-weight: 600 !important;
                  line-height: 1.4 !important;
                }
                /* Tamaños específicos para clases de texto */
                [data-web-print-legible="true"] .text-sm,
                [data-web-print-legible="true"] .text-xs {
                  font-size: 10pt !important;
                }
                [data-web-print-legible="true"] .text-lg {
                  font-size: 14pt !important;
                }
                [data-web-print-legible="true"] .text-xl {
                  font-size: 16pt !important;
                  font-weight: bold !important;
                }
                [data-web-print-legible="true"] .text-2xl {
                  font-size: 18pt !important;
                  font-weight: bold !important;
                }
                [data-web-print-legible="true"] .font-semibold,
                [data-web-print-legible="true"] .font-bold {
                  font-weight: 700 !important;
                }
              }
            `}</style>
            {/* Header Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Número</p>
                <p className="font-semibold text-primary-600">{viewingInvoice.number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Tipo</p>
                <p className="font-semibold">{getDocumentTypeName(viewingInvoice.documentType)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha</p>
                <p className="font-semibold">
                  {getInvoiceDate(viewingInvoice)
                    ? formatDate(getInvoiceDate(viewingInvoice))
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estado</p>
                <div className="mt-1">{getStatusBadge(viewingInvoice.status)}</div>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-600">Estado SUNAT</p>
                <div className="mt-1">{getSunatStatusBadge(viewingInvoice.sunatStatus)}</div>
              </div>
            </div>

            {/* Mostrar error de SUNAT si está rechazado */}
            {viewingInvoice.sunatStatus === 'rejected' && viewingInvoice.sunatResponse && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-900 mb-1">Factura Rechazada por SUNAT</h4>
                    <p className="text-sm text-red-800 mb-2">
                      {viewingInvoice.sunatResponse.description || 'Error desconocido'}
                    </p>
                    {viewingInvoice.sunatResponse.observations && viewingInvoice.sunatResponse.observations.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-red-900 mb-1">Observaciones:</p>
                        <ul className="text-xs text-red-800 list-disc list-inside space-y-1">
                          {viewingInvoice.sunatResponse.observations.map((obs, idx) => (
                            <li key={idx}>{obs}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setViewingInvoice(null)
                          handleSendToSunat(viewingInvoice.id)
                        }}
                        disabled={sendingToSunat === viewingInvoice.id}
                        className="border-red-300 text-red-700 hover:bg-red-100"
                      >
                        {sendingToSunat === viewingInvoice.id ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Reenviando...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Reintentar envío a SUNAT
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Customer Info */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Cliente</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Nombre</p>
                  <p className="font-medium">{viewingInvoice.customer?.name}</p>
                </div>
                <div>
                  <p className="text-gray-600">Documento</p>
                  <p className="font-medium">{viewingInvoice.customer?.documentNumber}</p>
                </div>
                {viewingInvoice.customer?.email && (
                  <div>
                    <p className="text-gray-600">Email</p>
                    <p className="font-medium">{viewingInvoice.customer?.email}</p>
                  </div>
                )}
                {viewingInvoice.customer?.phone && (
                  <div>
                    <p className="text-gray-600">Teléfono</p>
                    <p className="font-medium">{viewingInvoice.customer?.phone}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Items</h4>
              <div className="space-y-2">
                {viewingInvoice.items?.map((item, index) => (
                  <div key={index} className="flex justify-between items-start p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {item.quantity} x {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(item.subtotal)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(viewingInvoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">IGV (18%):</span>
                <span className="font-medium">{formatCurrency(viewingInvoice.igv)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span>Total:</span>
                <span className="text-primary-600">{formatCurrency(viewingInvoice.total)}</span>
              </div>
            </div>

            {/* Payment Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Método de Pago</p>
                <p className="font-semibold">{viewingInvoice.paymentMethod}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estado de Pago</p>
                <Select
                  value={viewingInvoice.status}
                  onChange={e => handleUpdateStatus(viewingInvoice.id, e.target.value)}
                  className="text-sm"
                >
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagada</option>
                  <option value="overdue">Vencida</option>
                  <option value="cancelled">Anulada</option>
                </Select>
              </div>
            </div>

            {/* Notes */}
            {viewingInvoice.notes && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Observaciones</p>
                <p className="text-sm">{viewingInvoice.notes}</p>
              </div>
            )}

            {/* Mostrar info de conversión si ya fue convertida */}
            {viewingInvoice.convertedTo && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-green-900">
                      Esta nota fue convertida a Boleta
                    </p>
                    <p className="text-sm text-green-800">
                      Boleta: <strong>{viewingInvoice.convertedTo.number}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Mostrar info de origen si es una boleta convertida desde nota */}
            {viewingInvoice.convertedFrom && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <ArrowRightCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900">
                      Este comprobante fue generado desde una Nota de Venta
                    </p>
                    <p className="text-sm text-blue-800">
                      Nota de Venta: <strong>{viewingInvoice.convertedFrom.number}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setViewingInvoice(null)}>
                Cerrar
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendWhatsApp(viewingInvoice)}
              >
                <Share2 className="w-4 h-4 mr-2" />
                WhatsApp
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  // Validar que existan los datos de la empresa
                  if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
                    toast.error('Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa', 5000)
                    return
                  }

                  handlePrintTicket()
                }}
              >
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
              <Button
                onClick={async () => {
                  // Validar que existan los datos de la empresa
                  if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
                    toast.error('Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa', 5000)
                    return
                  }

                  try {
                    const result = await generateInvoicePDF(viewingInvoice, companySettings)

                    if (result?.fileName) {
                      // En móvil, mostrar nombre del archivo guardado
                      toast.success(`PDF guardado: ${result.fileName}`)
                    } else {
                      // En web, descarga normal
                      toast.success('PDF descargado exitosamente')
                    }
                  } catch (error) {
                    console.error('Error al generar PDF:', error)
                    toast.error('Error al generar el PDF')
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
              {/* Botón Convertir a Boleta - Solo para Notas de Venta no convertidas y no anuladas */}
              {viewingInvoice.documentType === 'nota_venta' &&
               !viewingInvoice.convertedTo &&
               viewingInvoice.status !== 'voided' && (
                <Button
                  variant="success"
                  onClick={() => handleOpenConvertModal(viewingInvoice)}
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  Convertir a Boleta
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Conversión de Nota de Venta a Boleta */}
      <Modal
        isOpen={!!convertingInvoice}
        onClose={() => !isConverting && setConvertingInvoice(null)}
        title="Convertir Nota de Venta a Boleta"
        size="md"
      >
        {convertingInvoice && (
          <div className="space-y-6">
            {/* Info de la nota de venta */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Nota de Venta</p>
                  <p className="font-semibold">{convertingInvoice.number}</p>
                </div>
                <div>
                  <p className="text-gray-600">Total</p>
                  <p className="font-semibold text-lg">{formatCurrency(convertingInvoice.total)}</p>
                </div>
              </div>
            </div>

            {/* Aviso importante */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">Importante:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Se generará una <strong>Boleta electrónica</strong> que se enviará a SUNAT</li>
                    <li>El stock <strong>NO</strong> se descontará nuevamente</li>
                    <li>La nota de venta quedará marcada como convertida</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Datos del cliente */}
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">Datos del Cliente para la Boleta</h4>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre / Razón Social
                </label>
                <Input
                  value={convertCustomerData.name}
                  onChange={e => setConvertCustomerData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nombre del cliente"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Documento
                  </label>
                  <Select
                    value={convertCustomerData.documentType}
                    onChange={e => setConvertCustomerData(prev => ({ ...prev, documentType: e.target.value }))}
                  >
                    <option value="DNI">DNI</option>
                    <option value="CE">Carnet de Extranjería</option>
                    <option value="PASAPORTE">Pasaporte</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de Documento *
                  </label>
                  <Input
                    value={convertCustomerData.documentNumber}
                    onChange={e => setConvertCustomerData(prev => ({ ...prev, documentNumber: e.target.value }))}
                    placeholder="Ej: 12345678"
                    maxLength={convertCustomerData.documentType === 'DNI' ? 8 : 12}
                  />
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setConvertingInvoice(null)}
                disabled={isConverting}
              >
                Cancelar
              </Button>
              <Button
                variant="success"
                onClick={handleConvertToBoleta}
                disabled={isConverting || !convertCustomerData.documentNumber}
              >
                {isConverting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Convirtiendo...
                  </>
                ) : (
                  <>
                    <Receipt className="w-4 h-4 mr-2" />
                    Generar Boleta
                  </>
                )}
              </Button>
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
        title="Anular Factura en SUNAT"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <Ban className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas anular la factura{' '}
                <strong>{voidingSunatInvoice?.number || `${voidingSunatInvoice?.series}-${voidingSunatInvoice?.correlativeNumber}`}</strong> en SUNAT?
              </p>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 font-medium mb-2">Comunicación de Baja</p>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Se enviará una Comunicación de Baja a SUNAT</li>
              <li>La factura quedará anulada en el sistema de SUNAT</li>
              <li>Este proceso puede tomar unos segundos</li>
            </ul>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Importante:</strong> Solo puede anular facturas que NO hayan sido entregadas al cliente.
              Si el cliente ya recibió la factura, debe emitir una Nota de Crédito.
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
            <Input
              type="date"
              label="Fecha Desde"
              value={exportFilters.startDate}
              onChange={(e) => setExportFilters({ ...exportFilters, startDate: e.target.value })}
            />
            <Input
              type="date"
              label="Fecha Hasta"
              value={exportFilters.endDate}
              onChange={(e) => setExportFilters({ ...exportFilters, endDate: e.target.value })}
            />
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

      {/* Hidden Ticket Component for Printing */}
      {/* Ticket Oculto para Impresión */}
      {viewingInvoice && (
        <div className="hidden print:block">
          <InvoiceTicket ref={ticketRef} invoice={viewingInvoice} companySettings={companySettings} paperWidth={80} webPrintLegible={webPrintLegible} />
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
