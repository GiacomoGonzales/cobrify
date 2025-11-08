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
import { getInvoices, deleteInvoice, updateInvoice, getCompanySettings, sendInvoiceToSunat } from '@/services/firestoreService'
import { generateInvoicePDF } from '@/utils/pdfGenerator'
import { prepareInvoiceXML, downloadCompressedXML, isSunatConfigured } from '@/services/sunatService'
import { generateInvoicesExcel } from '@/services/invoiceExportService'
import InvoiceTicket from '@/components/InvoiceTicket'

export default function InvoiceList() {
  const { user, isDemoMode, demoData, getBusinessId } = useAppContext()
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
    type: 'all',
    startDate: '',
    endDate: '',
  })

  // Función para imprimir ticket
  const handlePrintTicket = () => {
    if (!viewingInvoice || !companySettings) return
    window.print()
  }

  const handleSendWhatsApp = (invoice) => {
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

    // Abrir WhatsApp Web
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')

    toast.success('Abriendo WhatsApp...')
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

  const handleExportToExcel = () => {
    try {
      // Filtrar facturas según los criterios seleccionados
      let filteredInvoices = [...invoices];

      // Filtrar por tipo
      if (exportFilters.type && exportFilters.type !== 'all') {
        filteredInvoices = filteredInvoices.filter(inv => inv.type === exportFilters.type);
      }

      // Filtrar por rango de fechas
      if (exportFilters.startDate) {
        const startDate = new Date(exportFilters.startDate);
        startDate.setHours(0, 0, 0, 0);
        filteredInvoices = filteredInvoices.filter(inv => {
          const invDate = inv.createdAt?.toDate();
          return invDate && invDate >= startDate;
        });
      }

      if (exportFilters.endDate) {
        const endDate = new Date(exportFilters.endDate);
        endDate.setHours(23, 59, 59, 999);
        filteredInvoices = filteredInvoices.filter(inv => {
          const invDate = inv.createdAt?.toDate();
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
        const startDate = new Date(filterStartDate)
        startDate.setHours(0, 0, 0, 0)
        if (invoiceDate && invoiceDate < startDate) {
          matchesDateRange = false
        }
      }

      if (filterEndDate) {
        const endDate = new Date(filterEndDate)
        endDate.setHours(23, 59, 59, 999)
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

  const getStatusBadge = status => {
    switch (status) {
      case 'paid':
        return <Badge variant="success">Pagada</Badge>
      case 'pending':
        return <Badge variant="warning">Pendiente</Badge>
      case 'overdue':
        return <Badge variant="danger">Vencida</Badge>
      case 'cancelled':
        return <Badge>Anulada</Badge>
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
      case 'rejected':
        return (
          <Badge variant="danger" className="flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Rechazado
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Facturas y Boletas</h1>
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
          <Link to="/pos" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Venta
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
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
              <Input
                type="date"
                value={filterStartDate}
                onChange={e => setFilterStartDate(e.target.value)}
                placeholder="Fecha desde"
              />
              <Input
                type="date"
                value={filterEndDate}
                onChange={e => setFilterEndDate(e.target.value)}
                placeholder="Fecha hasta"
              />
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
              <Link to="/pos">
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
                      <span className="text-sm whitespace-nowrap">{getDocumentTypeName(invoice.documentType)}</span>
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
                      <span className="font-semibold text-sm whitespace-nowrap">{formatCurrency(invoice.total)}</span>
                    </TableCell>
                    <TableCell className="py-2.5 px-2">
                      <div className="scale-90 origin-left">{getStatusBadge(invoice.status)}</div>
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

                  {/* Reenviar a SUNAT (para facturas rechazadas) */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                   invoice.sunatStatus === 'rejected' && (
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
                      <div className="flex flex-col">
                        <span className="text-orange-600 font-medium">Reintentar envío a SUNAT</span>
                        <span className="text-xs text-gray-500">Corregir y reenviar</span>
                      </div>
                    </button>
                  )}

                  {/* Crear Nota de Crédito */}
                  {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                   invoice.sunatStatus === 'accepted' && (
                    <>
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          navigate(`/nota-credito?invoiceId=${invoice.id}`)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                      >
                        <FileMinus className="w-4 h-4 text-orange-600" />
                        <span>Crear Nota de Crédito</span>
                      </button>

                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          navigate(`/nota-debito?invoiceId=${invoice.id}`)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                      >
                        <FilePlus className="w-4 h-4 text-blue-600" />
                        <span>Crear Nota de Débito</span>
                      </button>

                      <div className="border-t border-gray-100 my-1" />
                    </>
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
                    onClick={() => {
                      setOpenMenuId(null)
                      generateInvoicePDF(invoice, companySettings)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Download className="w-4 h-4 text-green-600" />
                    <span>Descargar PDF</span>
                  </button>

                  {/* Eliminar */}
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
          <div className="space-y-6">
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
                onClick={() => {
                  // Validar que existan los datos de la empresa
                  if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
                    toast.error('Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa', 5000)
                    return
                  }

                  try {
                    generateInvoicePDF(viewingInvoice, companySettings)
                    toast.success('PDF generado exitosamente')
                  } catch (error) {
                    console.error('Error al generar PDF:', error)
                    toast.error('Error al generar el PDF')
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                PDF
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

      {/* Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Exportar Comprobantes a Excel"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Selecciona los filtros para exportar tus comprobantes a Excel
          </p>

          <Select
            label="Tipo de Comprobante"
            value={exportFilters.type}
            onChange={(e) => setExportFilters({ ...exportFilters, type: e.target.value })}
          >
            <option value="all">Todos los tipos</option>
            <option value="factura">Solo Facturas</option>
            <option value="boleta">Solo Boletas</option>
            <option value="nota-credito">Solo Notas de Crédito</option>
            <option value="nota-debito">Solo Notas de Débito</option>
          </Select>

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
              <strong>Nota:</strong> Si no seleccionas fechas, se exportarán todos los comprobantes del tipo seleccionado.
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
          <InvoiceTicket ref={ticketRef} invoice={viewingInvoice} companySettings={companySettings} />
        </div>
      )}
    </div>
  )
}
