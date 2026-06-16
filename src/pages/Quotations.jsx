import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import {
  Plus,
  Search,
  Download,
  Eye,
  Edit,
  Trash2,
  Loader2,
  FileText,
  AlertTriangle,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  FileCheck,
  MoreVertical,
  Receipt,
  Store,
  Copy,
  Truck,
  FileSpreadsheet,
  Calendar,
  Printer,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate, matchesSearchQuery } from '@/lib/utils'
import { getDocumentTotalInBase, normalizeCurrency } from '@/utils/currency'
import {
  getQuotations,
  deleteQuotation,
  updateQuotationStatus,
  markQuotationAsSent,
  convertToInvoice,
  markQuotationAsConverted,
} from '@/services/quotationService'
import { createInvoice, getCompanySettings, getNextDocumentNumber } from '@/services/firestoreService'
import { generateQuotationPDF, previewQuotationPDF } from '@/utils/quotationPdfGenerator'
import { printQuotationTicket, getPrinterConfig } from '@/services/thermalPrinterService'
import InvoiceTicket from '@/components/InvoiceTicket'
import { generateQuotationsExcel } from '@/services/quotationExportService'
import { preloadLogo } from '@/utils/pdfGenerator'
import { getActiveBranches } from '@/services/branchService'
import CreateDispatchGuideModal from '@/components/CreateDispatchGuideModal'
import { useLocationAccess } from '@/utils/locationAccess'

export default function Quotations() {
  const { user, isDemoMode, demoData, getBusinessId, filterBranchesByAccess, hasMainBranchAccess, allowedBranches, allowedWarehouses } = useAppContext()
  // Filtro de seguridad por sucursal/almacén habilitado del usuario (helper compartido)
  const canAccessQuotation = useLocationAccess()
  const navigate = useNavigate()
  const appNavigate = useAppNavigate()
  const toast = useToast()
  const [quotations, setQuotations] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [dateFilter, setDateFilter] = useState('30days') // 'all', 'today', '3days', '7days', '30days', 'custom'
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [viewingQuotation, setViewingQuotation] = useState(null)
  const [deletingQuotation, setDeletingQuotation] = useState(null)
  const [convertingQuotation, setConvertingQuotation] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [dispatchGuideQuotation, setDispatchGuideQuotation] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: true })
  const [visibleCount, setVisibleCount] = useState(20)
  const [isExporting, setIsExporting] = useState(false)
  const ITEMS_PER_PAGE = 20

  // Impresión web de ticket (window.print con el mismo diseño de las boletas)
  const [ticketQuotation, setTicketQuotation] = useState(null)
  const [ticketPaperWidth, setTicketPaperWidth] = useState(80)
  const [webPrintLegible, setWebPrintLegible] = useState(false)
  const [compactPrint, setCompactPrint] = useState(false)
  const [printMargins, setPrintMargins] = useState(8)
  const [simplePrint, setSimplePrint] = useState(false)
  const [a4SheetPrint, setA4SheetPrint] = useState(false)
  const [showItemUnit, setShowItemUnit] = useState(false)

  // Helper para manejar fechas de Firestore y Date objects
  const getDateFromTimestamp = (timestamp) => {
    if (!timestamp) return null
    return timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  }

  // Función para obtener el rango de fechas según el filtro seleccionado
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
        return {
          start: filterStartDate ? new Date(filterStartDate + 'T00:00:00') : null,
          end: filterEndDate ? new Date(filterEndDate + 'T23:59:59') : null
        }
      case 'all':
      default:
        return { start: null, end: null }
    }
  }

  // Función para filtrar por rango de fecha
  const filterByDateRange = (quotation) => {
    if (dateFilter === 'all') return true

    const { start, end } = getDateRange()
    const quotationDate = getDateFromTimestamp(quotation.createdAt || quotation.issueDate)

    if (!quotationDate) return true
    if (start && quotationDate < start) return false
    if (end && quotationDate > end) return false

    return true
  }

  // Helper para mostrar etiqueta del filtro de fecha
  const getFilterLabel = () => {
    switch (dateFilter) {
      case 'today': return 'Hoy'
      case '3days': return 'Últimos 3 días'
      case '7days': return 'Últimos 7 días'
      case '30days': return 'Últimos 30 días'
      case 'custom': return 'Personalizado'
      default: return 'Todo el tiempo'
    }
  }

  useEffect(() => {
    loadQuotations()
    loadBranches()
  }, [user, allowedBranches, allowedWarehouses])

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

  // Verificar cotizaciones expiradas
  useEffect(() => {
    if (quotations.length === 0 || isDemoMode) return // No ejecutar en modo demo

    const checkExpiredQuotations = () => {
      const now = new Date()
      quotations.forEach(quotation => {
        if (
          quotation.expiryDate &&
          quotation.status !== 'expired' &&
          quotation.status !== 'converted' &&
          quotation.status !== 'rejected'
        ) {
          const expiryDate = getDateFromTimestamp(quotation.expiryDate)
          // Comparar contra el FINAL del día de vencimiento (no la hora exacta).
          // Antes: "validez 1 día" emitida hoy tenía expiryDate = mañana 00:00,
          // entonces a las 00:01 del día siguiente ya aparecía vencida, sin
          // poder convertirse. Ahora la cotización queda vigente hasta las 23:59
          // del día de vencimiento.
          const expiryEnd = new Date(expiryDate)
          expiryEnd.setHours(23, 59, 59, 999)

          if (expiryEnd < now) {
            updateQuotationStatus(getBusinessId(), quotation.id, 'expired')
          }
        }
      })
    }

    checkExpiredQuotations()
    const interval = setInterval(checkExpiredQuotations, 60000) // Revisar cada minuto

    return () => clearInterval(interval)
  }, [quotations, user, isDemoMode])

  const loadQuotations = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      // MODO DEMO: Usar datos de ejemplo
      if (isDemoMode && demoData) {
        setQuotations(demoData.quotations || [])
        setCompanySettings(demoData.business || null)
        setIsLoading(false)
        return
      }

      const [quotationsResult, settingsResult] = await Promise.all([
        getQuotations(getBusinessId()),
        getCompanySettings(getBusinessId()),
      ])

      if (quotationsResult.success) {
        // Seguridad: solo cotizaciones de sucursales/almacenes permitidos (sanea tabla, stats y export)
        setQuotations((quotationsResult.data || []).filter(canAccessQuotation))
      } else {
        console.error('Error al cargar cotizaciones:', quotationsResult.error)
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
    if (!deletingQuotation || !user?.uid) return

    setIsDeleting(true)
    try {
      // MODO DEMO: Simular eliminación sin guardar en Firebase
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Eliminando cotización simulada...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Simular delay

        // Eliminar de la lista local
        setQuotations(prev => prev.filter(q => q.id !== deletingQuotation.id))

        toast.success('Cotización eliminada exitosamente (DEMO - No se guardó)', { duration: 5000 })
        setDeletingQuotation(null)
        setIsDeleting(false)
        return
      }

      const result = await deleteQuotation(getBusinessId(), deletingQuotation.id)

      if (result.success) {
        toast.success('Cotización eliminada exitosamente')
        setDeletingQuotation(null)
        loadQuotations()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar cotización:', error)
      toast.error('Error al eliminar la cotización. Inténtalo nuevamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Mapear cotización al formato que espera CreateDispatchGuideModal (referenceInvoice)
  const mapQuotationForDispatchGuide = (quotation) => ({
    id: quotation.id,
    number: quotation.number,
    documentType: 'cotizacion',
    branchId: quotation.branchId || null,
    customer: quotation.customer ? {
      documentType: quotation.customer.documentType || '',
      documentNumber: quotation.customer.documentNumber || '',
      name: quotation.customer.name || quotation.customer.businessName || '',
      address: quotation.customer.address || '',
      email: quotation.customer.email || '',
      department: quotation.customer.department || '',
      province: quotation.customer.province || '',
      district: quotation.customer.district || '',
    } : null,
    items: (quotation.items || []).map(item => ({
      productId: item.productId || '',
      code: item.code || '',
      name: item.name || '',
      description: item.description || item.name || '',
      quantity: item.quantity || 0,
      unit: item.unit || 'NIU',
    })),
  })

  const handleConvertToInvoice = async () => {
    if (!convertingQuotation || !user?.uid) return

    setIsConverting(true)
    try {
      // MODO DEMO: Simular conversión
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Navegando a POS con datos de cotización...')

        // Navegar a POS con los datos de la cotización
        appNavigate('pos', {
          state: {
            fromQuotation: true,
            quotationId: convertingQuotation.id,
            quotationNumber: convertingQuotation.number,
            customer: convertingQuotation.customer,
            items: convertingQuotation.items,
            discount: convertingQuotation.discount || 0,
            discountType: convertingQuotation.discountType || 'fixed',
            // Multi-divisa: propagar moneda y TC al POS
            currency: convertingQuotation.currency || 'PEN',
            exchangeRate: convertingQuotation.exchangeRate || 1,
          }
        })

        setConvertingQuotation(null)
        setIsConverting(false)
        return
      }

      // Obtener datos de la cotización
      const convertResult = await convertToInvoice(getBusinessId(), convertingQuotation.id)

      if (!convertResult.success) {
        throw new Error(convertResult.error)
      }

      const quotationData = convertResult.data

      // Navegar a POS con los datos de la cotización prellenados
      appNavigate('pos', {
        state: {
          fromQuotation: true,
          quotationId: convertingQuotation.id,
          quotationNumber: convertingQuotation.number,
          customer: quotationData.customer,
          items: quotationData.items,
          notes: quotationData.notes || '',
          discount: quotationData.discount || 0,
          discountType: quotationData.discountType || 'fixed',
          // Multi-divisa: propagar moneda y TC heredados de la cotización
          currency: quotationData.currency || 'PEN',
          exchangeRate: quotationData.exchangeRate || 1,
        }
      })

      setConvertingQuotation(null)
    } catch (error) {
      console.error('Error al preparar cotización:', error)
      toast.error(error.message || 'Error al cargar la cotización.')
    } finally {
      setIsConverting(false)
    }
  }

  const handleDownloadPDF = async (quotation) => {
    if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
      toast.error(
        'Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa',
        5000
      )
      return
    }

    try {
      await generateQuotationPDF(quotation, companySettings)

      if (!isDemoMode) {
        await markQuotationAsSent(getBusinessId(), quotation.id, 'manual')
        loadQuotations()
      } else {
        // En modo demo, actualizar estado local
        setQuotations(prev => prev.map(q =>
          q.id === quotation.id
            ? { ...q, status: 'sent', isSent: true, sentAt: new Date() }
            : q
        ))
      }

      toast.success('PDF generado exitosamente')
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar el PDF')
    }
  }

  const handlePreviewPDF = async (quotation) => {
    if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
      toast.error(
        'Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa',
        5000
      )
      return
    }

    try {
      await previewQuotationPDF(quotation, companySettings)
    } catch (error) {
      console.error('Error al generar vista previa:', error)
      toast.error('Error al generar la vista previa')
    }
  }

  // Imprimir cotización en formato ticket: app nativa → ticketera térmica (ESC/POS);
  // web → window.print con el mismo diseño de ticket de las boletas (InvoiceTicket).
  const handlePrintTicket = async (quotation) => {
    if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
      toast.error(
        'Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa',
        5000
      )
      return
    }

    if (Capacitor.isNativePlatform()) {
      // Leer ancho de papel guardado por el dispositivo (58 o 80mm)
      let paperWidth = 58
      try {
        const saved = localStorage.getItem('factuya_printerConfig')
        if (saved) {
          const cfg = JSON.parse(saved)
          if (cfg.paperWidth === 58 || cfg.paperWidth === 80) paperWidth = cfg.paperWidth
        }
      } catch { /* usar default */ }

      try {
        const result = await printQuotationTicket(quotation, companySettings, paperWidth)
        if (result?.success) {
          toast.success('Cotización enviada a la ticketera')
        } else if (result?.error === 'Printer not connected') {
          toast.error('No hay una impresora conectada. Conéctala desde Configuración > Impresora.', 5000)
        } else {
          toast.error(result?.error || 'No se pudo imprimir la cotización')
        }
      } catch (error) {
        console.error('Error al imprimir cotización en ticketera:', error)
        toast.error('Error al imprimir en la ticketera')
      }
      return
    }

    // Web: releer la config FRESCA de localStorage antes de imprimir (mismo fix
    // que POS/Ventas: no usar valores cacheados en memoria).
    try {
      const fresh = await getPrinterConfig(getBusinessId())
      if (fresh.success && fresh.config) {
        setTicketPaperWidth(fresh.config.paperWidth || 80)
        setWebPrintLegible(fresh.config.webPrintLegible || false)
        setCompactPrint(fresh.config.compactPrint || false)
        setPrintMargins(fresh.config.printMargins ?? 8)
        setSimplePrint(fresh.config.simplePrint || false)
        setA4SheetPrint(fresh.config.a4SheetPrint || false)
        setShowItemUnit(fresh.config.showItemUnit || false)
      }
    } catch (e) {
      console.error('Error releyendo config de impresora antes de imprimir:', e)
    }

    setTicketQuotation({
      ...quotation,
      documentType: 'cotizacion',
      emissionDate: quotation.issueDate || quotation.createdAt,
    })
    await new Promise(r => setTimeout(r, 120))
    window.print()
    setTicketQuotation(null)
  }

  // Filtrar cotizaciones (búsqueda flexible: multi-palabra parcial, sin acentos)
  const filteredQuotations = quotations.filter(canAccessQuotation).filter(quotation => {
    const matchesSearch = matchesSearchQuery(
      searchTerm,
      quotation.number,
      quotation.customer?.name,
      quotation.customer?.businessName,
      quotation.customer?.documentNumber,
    )

    const matchesStatus = filterStatus === 'all' || quotation.status === filterStatus

    // Filtrar por sucursal
    let matchesBranch = true
    if (filterBranch !== 'all') {
      if (filterBranch === 'main') {
        matchesBranch = !quotation.branchId
      } else {
        matchesBranch = quotation.branchId === filterBranch
      }
    }

    // Filtrar por fecha
    const matchesDate = filterByDateRange(quotation)

    return matchesSearch && matchesStatus && matchesBranch && matchesDate
  })

  const displayedQuotations = filteredQuotations.slice(0, visibleCount)
  const hasMore = filteredQuotations.length > visibleCount

  // Función para exportar cotizaciones a Excel
  const handleExportToExcel = async () => {
    if (filteredQuotations.length === 0) {
      toast.warning('No hay cotizaciones para exportar')
      return
    }

    setIsExporting(true)
    try {
      const { start, end } = getDateRange()
      const filters = {
        status: filterStatus !== 'all' ? filterStatus : null,
        startDate: start,
        endDate: end,
        dateFilterLabel: getFilterLabel(),
      }
      await generateQuotationsExcel(filteredQuotations, filters, companySettings)
      toast.success(`${filteredQuotations.length} cotización(es) exportada(s) exitosamente`)
    } catch (error) {
      console.error('Error al exportar a Excel:', error)
      toast.error('Error al generar el archivo Excel')
    } finally {
      setIsExporting(false)
    }
  }

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE)
  }, [searchTerm, filterStatus, filterBranch, dateFilter, filterStartDate, filterEndDate])

  const getStatusBadge = status => {
    switch (status) {
      case 'draft':
        return <Badge>Borrador</Badge>
      case 'sent':
        return <Badge variant="primary">Enviada</Badge>
      case 'accepted':
        return <Badge variant="success">Aceptada</Badge>
      case 'rejected':
        return <Badge variant="danger">Rechazada</Badge>
      case 'expired':
        return <Badge variant="warning">Vencida</Badge>
      case 'converted':
        return <Badge variant="success">Convertida</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  // Función para determinar si una cotización está próxima a vencer
  const isExpiringSoon = quotation => {
    if (!quotation.expiryDate || quotation.status === 'expired' || quotation.status === 'converted') {
      return false
    }

    const expiryDate = getDateFromTimestamp(quotation.expiryDate)
    const now = new Date()
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))

    return daysUntilExpiry <= 7 && daysUntilExpiry > 0
  }

  // Cotizaciones filtradas solo por fecha (para estadísticas)
  const dateFilteredQuotations = quotations.filter(filterByDateRange)

  // Estadísticas (basadas en el período seleccionado)
  const stats = {
    total: dateFilteredQuotations.length,
    totalAll: quotations.length,
    sent: dateFilteredQuotations.filter(q => q.status === 'sent').length,
    accepted: dateFilteredQuotations.filter(q => q.status === 'accepted').length,
    converted: dateFilteredQuotations.filter(q => q.status === 'converted').length,
    // Multi-divisa: sumar equivalente PEN base usando TC congelado en cada
    // cotización. PEN → tal cual; USD → multiplicado por su TC.
    totalAmount: dateFilteredQuotations
      .filter(q => q.status !== 'rejected' && q.status !== 'expired')
      .reduce((sum, q) => sum + getDocumentTotalInBase(q), 0),
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando cotizaciones...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tus cotizaciones y conviértelas en facturas
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleExportToExcel}
            disabled={isExporting || filteredQuotations.length === 0}
            className="w-full sm:w-auto"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 mr-2" />
            )}
            Exportar Excel
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => appNavigate('cotizaciones/nueva')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Cotización
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Total</p>
              {dateFilter !== 'all' && (
                <p className="text-xs text-primary-600">({getFilterLabel()})</p>
              )}
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
              <p className="text-xs sm:text-sm font-medium text-gray-600">Enviadas</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-2">{stats.sent}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Aceptadas</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600 mt-2">{stats.accepted}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Convertidas</p>
              <p className="text-xl sm:text-2xl font-bold text-purple-600 mt-2">{stats.converted}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Monto Total</p>
              {dateFilter !== 'all' && (
                <p className="text-xs text-primary-600">({getFilterLabel()})</p>
              )}
              <p className="text-lg sm:text-xl font-bold text-primary-600 mt-2">
                {formatCurrency(stats.totalAmount)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

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

            {/* Filtro de fechas */}
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

            {/* Fechas personalizadas */}
            {dateFilter === 'custom' && (
              <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Desde:</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Hasta:</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            )}

            {/* Filtros adicionales */}
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Filtro de Sucursal */}
                {branches.length > 0 && (
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <Store className="w-4 h-4 text-gray-500" />
                    <select
                      value={filterBranch}
                      onChange={e => setFilterBranch(e.target.value)}
                      className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                    >
                      <option value="all">Todas las sucursales</option>
                      {hasMainBranchAccess && <option value="main">{companySettings?.mainBranchName || 'Sucursal Principal'}</option>}
                      {branches.map(branch => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {/* Filtro de Estado */}
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Todos los estados</option>
                    <option value="draft">Borrador</option>
                    <option value="sent">Enviadas</option>
                    <option value="accepted">Aceptadas</option>
                    <option value="rejected">Rechazadas</option>
                    <option value="expired">Vencidas</option>
                    <option value="converted">Convertidas</option>
                  </select>
                </div>
              </div>

              {/* Botón limpiar filtros */}
              {(filterStatus !== 'all' || filterBranch !== 'all' || dateFilter !== '30days') && (
                <button
                  onClick={() => {
                    setDateFilter('30days')
                    setFilterStartDate('')
                    setFilterEndDate('')
                    setFilterStatus('all')
                    setFilterBranch('all')
                    setSearchTerm('')
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quotations Table */}
      <Card>
        {filteredQuotations.length === 0 ? (
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterStatus !== 'all' || filterBranch !== 'all'
                ? 'No se encontraron cotizaciones'
                : 'No hay cotizaciones registradas'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterStatus !== 'all' || filterBranch !== 'all'
                ? 'Intenta con otros filtros de búsqueda'
                : 'Comienza creando tu primera cotización'}
            </p>
            {!searchTerm && filterStatus === 'all' && filterBranch === 'all' && (
              <Button onClick={() => appNavigate('cotizaciones/nueva')}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nueva Cotización
                </Button>
            )}
          </CardContent>
        ) : (
          <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {displayedQuotations.map(quotation => (
                <div key={quotation.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  {/* Fila superior: Número + acciones */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-primary-600 text-sm">{quotation.number}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const menuHeight = 300
                        const spaceAbove = rect.top
                        const spaceBelow = window.innerHeight - rect.bottom
                        const openUpward = spaceAbove > menuHeight || spaceAbove > spaceBelow
                        setMenuPosition({
                          top: openUpward ? rect.top - 10 : rect.bottom + 10,
                          right: window.innerWidth - rect.right,
                          openUpward
                        })
                        setOpenMenuId(openMenuId === quotation.id ? null : quotation.id)
                      }}
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                      title="Acciones"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila medio: Cliente */}
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm font-medium truncate">{quotation.customer?.name || 'Sin cliente'}</p>
                    {quotation.customer?.documentNumber && (
                      <span className="text-xs text-gray-500 flex-shrink-0">{quotation.customer.documentNumber}</span>
                    )}
                  </div>

                  {/* Fila inferior: Total + fechas + badge estado */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm flex items-center gap-1.5">
                        {formatCurrency(quotation.total, quotation.currency)}
                        {normalizeCurrency(quotation.currency) === 'USD' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">USD</span>
                        )}
                      </span>
                      <span className="text-xs text-gray-500">
                        {quotation.issueDate ? formatDate(getDateFromTimestamp(quotation.issueDate)) : quotation.createdAt ? formatDate(getDateFromTimestamp(quotation.createdAt)) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="scale-90 origin-right">{getStatusBadge(quotation.status)}</div>
                    </div>
                  </div>

                  {/* Fila extra: Válida hasta */}
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-gray-500">
                      Válida hasta: {quotation.expiryDate ? formatDate(getDateFromTimestamp(quotation.expiryDate)) : 'N/A'}
                    </span>
                    {isExpiringSoon(quotation) && (
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                    )}
                  </div>

                  {/* Portal del menú de acciones */}
                  {openMenuId === quotation.id && createPortal(
                    <>
                      <div className="fixed inset-0 z-[9998]" onClick={() => setOpenMenuId(null)} />
                      <div
                        className="fixed w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]"
                        style={{
                          top: `${menuPosition.top}px`,
                          right: `${menuPosition.right}px`,
                          transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                          maxHeight: '80vh',
                          overflowY: 'auto'
                        }}
                      >
                        <button
                          onClick={() => { setOpenMenuId(null); setViewingQuotation(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Eye className="w-4 h-4 text-primary-600" />
                          <span>Ver detalles</span>
                        </button>
                        {quotation.status !== 'converted' && (
                          <button
                            onClick={() => { setOpenMenuId(null); appNavigate(`cotizaciones/editar/${quotation.id}`) }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                          >
                            <Edit className="w-4 h-4 text-amber-600" />
                            <span>Editar</span>
                          </button>
                        )}
                        <button
                          onClick={() => { setOpenMenuId(null); handlePreviewPDF(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Eye className="w-4 h-4 text-purple-600" />
                          <span>Vista previa / Imprimir</span>
                        </button>
                        <button
                          onClick={() => { setOpenMenuId(null); handleDownloadPDF(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Download className="w-4 h-4 text-green-600" />
                          <span>Descargar PDF</span>
                        </button>
                        <button
                          onClick={() => { setOpenMenuId(null); handlePrintTicket(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Printer className="w-4 h-4 text-gray-700" />
                          <span>{Capacitor.isNativePlatform() ? 'Imprimir en ticketera' : 'Imprimir ticket'}</span>
                        </button>
                        <button
                          onClick={() => { setOpenMenuId(null); appNavigate(`cotizaciones/nueva?clone=${quotation.id}`) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Copy className="w-4 h-4 text-cyan-600" />
                          <span>Duplicar</span>
                        </button>
                        {quotation.status !== 'converted' && quotation.status !== 'rejected' && (
                          <>
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              onClick={() => { setOpenMenuId(null); setConvertingQuotation(quotation) }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                            >
                              <Receipt className="w-4 h-4 text-blue-600" />
                              <span>Convertir a Factura</span>
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => { setOpenMenuId(null); setDispatchGuideQuotation(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Truck className="w-4 h-4 text-orange-600" />
                          <span>Crear Guía Remitente</span>
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          onClick={() => { setOpenMenuId(null); setDeletingQuotation(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              ))}
            </div>

            {/* Tabla para desktop */}
            <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2.5 px-3">Número</TableHead>
                  <TableHead className="py-2.5 px-3">Cliente</TableHead>
                  <TableHead className="py-2.5 px-3">Fecha</TableHead>
                  <TableHead className="py-2.5 px-3">Válida Hasta</TableHead>
                  <TableHead className="py-2.5 px-3">Total</TableHead>
                  <TableHead className="py-2.5 px-2">Estado</TableHead>
                  <TableHead className="py-2.5 px-1 text-right w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedQuotations.map(quotation => (
                  <TableRow key={quotation.id}>
                    <TableCell className="py-2.5 px-3">
                      <span className="font-medium text-primary-600 text-sm whitespace-nowrap">
                        {quotation.number}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <div className="max-w-[140px]">
                        <p className="font-medium text-sm truncate">{quotation.customer?.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {quotation.customer?.documentNumber}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <span className="text-sm whitespace-nowrap">
                        {quotation.issueDate
                          ? formatDate(getDateFromTimestamp(quotation.issueDate))
                          : quotation.createdAt
                            ? formatDate(getDateFromTimestamp(quotation.createdAt))
                            : 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <div className="flex items-center gap-1">
                        <span className="text-sm whitespace-nowrap">
                          {quotation.expiryDate
                            ? formatDate(getDateFromTimestamp(quotation.expiryDate))
                            : 'N/A'}
                        </span>
                        {isExpiringSoon(quotation) && (
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <span className="font-semibold text-sm whitespace-nowrap flex items-center gap-1.5">
                        {formatCurrency(quotation.total, quotation.currency)}
                        {normalizeCurrency(quotation.currency) === 'USD' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">USD</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-2">
                      <div className="scale-90 origin-left">{getStatusBadge(quotation.status)}</div>
                    </TableCell>
                    <TableCell className="py-2.5 px-1 w-12">
                      <div className="flex items-center justify-end">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              const menuHeight = 300 // Altura estimada del menú
                              const spaceAbove = rect.top
                              const spaceBelow = window.innerHeight - rect.bottom
                              const openUpward = spaceAbove > menuHeight || spaceAbove > spaceBelow

                              setMenuPosition({
                                top: openUpward ? rect.top - 10 : rect.bottom + 10,
                                right: window.innerWidth - rect.right,
                                openUpward
                              })
                              setOpenMenuId(openMenuId === quotation.id ? null : quotation.id)
                            }}
                            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                            title="Acciones"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu - usando Portal para evitar overflow clipping */}
                          {openMenuId === quotation.id && createPortal(
                            <>
                              {/* Backdrop */}
                              <div className="fixed inset-0 z-[9998]" onClick={() => setOpenMenuId(null)} />

                              {/* Menu */}
                              <div
                                className="fixed w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]"
                                style={{
                                  top: `${menuPosition.top}px`,
                                  right: `${menuPosition.right}px`,
                                  transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                                  maxHeight: '80vh',
                                  overflowY: 'auto'
                                }}
                              >
                                {/* Ver detalles */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    setViewingQuotation(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Eye className="w-4 h-4 text-primary-600" />
                                  <span>Ver detalles</span>
                                </button>

                                {/* Editar cotización */}
                                {quotation.status !== 'converted' && (
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null)
                                      appNavigate(`cotizaciones/editar/${quotation.id}`)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                  >
                                    <Edit className="w-4 h-4 text-amber-600" />
                                    <span>Editar</span>
                                  </button>
                                )}

                                {/* Vista previa PDF */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    handlePreviewPDF(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Eye className="w-4 h-4 text-purple-600" />
                                  <span>Vista previa / Imprimir</span>
                                </button>

                                {/* Descargar PDF */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    handleDownloadPDF(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Download className="w-4 h-4 text-green-600" />
                                  <span>Descargar PDF</span>
                                </button>

                                {/* Imprimir ticket (app: ticketera térmica / web: window.print) */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    handlePrintTicket(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Printer className="w-4 h-4 text-gray-700" />
                                  <span>{Capacitor.isNativePlatform() ? 'Imprimir en ticketera' : 'Imprimir ticket'}</span>
                                </button>

                                {/* Duplicar cotización */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    appNavigate(`cotizaciones/nueva?clone=${quotation.id}`)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Copy className="w-4 h-4 text-cyan-600" />
                                  <span>Duplicar</span>
                                </button>

                                {/* Convertir a factura */}
                                {quotation.status !== 'converted' &&
                                  quotation.status !== 'rejected' && (
                                    <>
                                      <div className="border-t border-gray-100 my-1" />
                                      <button
                                        onClick={() => {
                                          setOpenMenuId(null)
                                          setConvertingQuotation(quotation)
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                      >
                                        <Receipt className="w-4 h-4 text-blue-600" />
                                        <span>Convertir a Factura</span>
                                      </button>
                                    </>
                                  )}

                                {/* Crear Guía Remitente */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    setDispatchGuideQuotation(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Truck className="w-4 h-4 text-orange-600" />
                                  <span>Crear Guía Remitente</span>
                                </button>

                                {/* Eliminar */}
                                <div className="border-t border-gray-100 my-1" />
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    setDeletingQuotation(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span>Eliminar</span>
                                </button>
                              </div>
                            </>,
                            document.body
                          )}
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
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
            className="text-sm text-gray-600 hover:text-primary-600 transition-colors py-2 px-4 hover:bg-gray-50 rounded-lg"
          >
            Ver más cotizaciones ({filteredQuotations.length - visibleCount} restantes)
          </button>
        </div>
      )}

      {/* View Quotation Modal */}
      <Modal
        isOpen={!!viewingQuotation}
        onClose={() => setViewingQuotation(null)}
        title="Detalles de la Cotización"
        size="lg"
      >
        {viewingQuotation && (
          <div className="space-y-6">
            {/* Header Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Número</p>
                <p className="font-semibold text-primary-600">{viewingQuotation.number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estado</p>
                <div className="mt-1">{getStatusBadge(viewingQuotation.status)}</div>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha</p>
                <p className="font-semibold">
                  {viewingQuotation.issueDate
                    ? formatDate(getDateFromTimestamp(viewingQuotation.issueDate))
                    : viewingQuotation.createdAt
                      ? formatDate(getDateFromTimestamp(viewingQuotation.createdAt))
                      : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Válida Hasta</p>
                <p className="font-semibold">
                  {viewingQuotation.expiryDate
                    ? formatDate(getDateFromTimestamp(viewingQuotation.expiryDate))
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Customer Info */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Cliente</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Nombre</p>
                  <p className="font-medium">{viewingQuotation.customer?.name}</p>
                </div>
                <div>
                  <p className="text-gray-600">Documento</p>
                  <p className="font-medium">{viewingQuotation.customer?.documentNumber}</p>
                </div>
                {viewingQuotation.customer?.email && (
                  <div>
                    <p className="text-gray-600">Email</p>
                    <p className="font-medium">{viewingQuotation.customer?.email}</p>
                  </div>
                )}
                {viewingQuotation.customer?.phone && (
                  <div>
                    <p className="text-gray-600">Teléfono</p>
                    <p className="font-medium">{viewingQuotation.customer?.phone}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Items</h4>
              <div className="space-y-2">
                {viewingQuotation.items?.map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-start p-3 bg-gray-50 rounded-lg text-sm"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-600 mt-1 italic">
                          {item.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {item.quantity} x {formatCurrency(item.unitPrice, viewingQuotation?.currency)}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(item.subtotal, viewingQuotation?.currency)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-2">
              {!viewingQuotation.hideIgv && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(viewingQuotation.subtotal, viewingQuotation.currency)}</span>
                  </div>
                  {viewingQuotation.discount && viewingQuotation.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        Descuento
                        {viewingQuotation.discountType === 'percentage'
                          ? ` (${viewingQuotation.discount}%)`
                          : ''}
                        :
                      </span>
                      <span className="font-medium text-red-600">
                        - {formatCurrency(
                          viewingQuotation.discountType === 'percentage'
                            ? (viewingQuotation.subtotal * viewingQuotation.discount) / 100
                            : viewingQuotation.discount,
                          viewingQuotation.currency
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">IGV (18%):</span>
                    <span className="font-medium">{formatCurrency(viewingQuotation.igv, viewingQuotation.currency)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span className="flex items-center gap-2">
                  Total:
                  {normalizeCurrency(viewingQuotation.currency) === 'USD' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">USD · TC {viewingQuotation.exchangeRate || 1}</span>
                  )}
                </span>
                <span className="text-primary-600">{formatCurrency(viewingQuotation.total, viewingQuotation.currency)}</span>
              </div>
              {normalizeCurrency(viewingQuotation.currency) === 'USD' && (
                <div className="text-right text-xs text-gray-500 pt-1">
                  ≈ {formatCurrency(getDocumentTotalInBase(viewingQuotation), 'PEN')} al TC congelado
                </div>
              )}
            </div>

            {/* Notes */}
            {viewingQuotation.notes && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Observaciones</p>
                <p className="text-sm">{viewingQuotation.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setViewingQuotation(null)}>
                Cerrar
              </Button>
              <Button variant="outline" onClick={() => handlePreviewPDF(viewingQuotation)}>
                <Eye className="w-4 h-4 mr-2" />
                Vista Previa
              </Button>
              <Button onClick={() => handleDownloadPDF(viewingQuotation)}>
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
              {viewingQuotation.status !== 'converted' &&
                viewingQuotation.status !== 'rejected' && (
                  <Button
                    onClick={() => {
                      setViewingQuotation(null)
                      setConvertingQuotation(viewingQuotation)
                    }}
                  >
                    <Receipt className="w-4 h-4 mr-2" />
                    Convertir a Factura
                  </Button>
                )}
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingQuotation}
        onClose={() => !isDeleting && setDeletingQuotation(null)}
        title="Eliminar Cotización"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar la cotización{' '}
                <strong>{deletingQuotation?.number}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">Esta acción no se puede deshacer.</p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingQuotation(null)}
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

      {/* Convert Confirmation Modal */}
      <Modal
        isOpen={!!convertingQuotation}
        onClose={() => !isConverting && setConvertingQuotation(null)}
        title="Convertir a Factura"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <Receipt className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Deseas convertir la cotización{' '}
                <strong>{convertingQuotation?.number}</strong> en un comprobante?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Se abrirá el punto de venta con los datos de la cotización prellenados para que puedas revisar, agregar productos o modificar antes de emitir el comprobante.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConvertingQuotation(null)}
              disabled={isConverting}
            >
              Cancelar
            </Button>
            <Button onClick={handleConvertToInvoice} disabled={isConverting}>
              {isConverting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4 mr-2" />
                  Ir al Punto de Venta
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Dispatch Guide Modal from Quotation */}
      <CreateDispatchGuideModal
        isOpen={!!dispatchGuideQuotation}
        onClose={() => setDispatchGuideQuotation(null)}
        referenceInvoice={dispatchGuideQuotation ? mapQuotationForDispatchGuide(dispatchGuideQuotation) : null}
      />

      {/* Ticket oculto para impresión web (mismo diseño que las boletas) */}
      {ticketQuotation && (
        <div className="hidden print:block">
          <InvoiceTicket
            invoice={ticketQuotation}
            companySettings={companySettings}
            paperWidth={ticketPaperWidth}
            webPrintLegible={webPrintLegible}
            compactPrint={compactPrint}
            printMargins={printMargins}
            simplePrint={simplePrint}
            a4SheetPrint={a4SheetPrint}
            showItemUnit={showItemUnit}
          />
        </div>
      )}
    </div>
  )
}
