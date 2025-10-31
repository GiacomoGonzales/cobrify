import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  Share2,
  Receipt,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Select from '@/components/ui/Select'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  getQuotations,
  deleteQuotation,
  updateQuotationStatus,
  markQuotationAsSent,
  convertToInvoice,
  markQuotationAsConverted,
} from '@/services/quotationService'
import { createInvoice, getCompanySettings, getNextDocumentNumber } from '@/services/firestoreService'
import { generateQuotationPDF } from '@/utils/quotationPdfGenerator'

export default function Quotations() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [quotations, setQuotations] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [viewingQuotation, setViewingQuotation] = useState(null)
  const [deletingQuotation, setDeletingQuotation] = useState(null)
  const [convertingQuotation, setConvertingQuotation] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })

  useEffect(() => {
    loadQuotations()
  }, [user])

  // Verificar cotizaciones expiradas
  useEffect(() => {
    if (quotations.length === 0) return

    const checkExpiredQuotations = () => {
      const now = new Date()
      quotations.forEach(quotation => {
        if (
          quotation.expiryDate &&
          quotation.status !== 'expired' &&
          quotation.status !== 'converted' &&
          quotation.status !== 'rejected'
        ) {
          const expiryDate = quotation.expiryDate.toDate
            ? quotation.expiryDate.toDate()
            : new Date(quotation.expiryDate)

          if (expiryDate < now) {
            updateQuotationStatus(user.uid, quotation.id, 'expired')
          }
        }
      })
    }

    checkExpiredQuotations()
    const interval = setInterval(checkExpiredQuotations, 60000) // Revisar cada minuto

    return () => clearInterval(interval)
  }, [quotations, user])

  const loadQuotations = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [quotationsResult, settingsResult] = await Promise.all([
        getQuotations(user.uid),
        getCompanySettings(user.uid),
      ])

      if (quotationsResult.success) {
        setQuotations(quotationsResult.data || [])
      } else {
        console.error('Error al cargar cotizaciones:', quotationsResult.error)
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
    if (!deletingQuotation || !user?.uid) return

    setIsDeleting(true)
    try {
      const result = await deleteQuotation(user.uid, deletingQuotation.id)

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

  const handleConvertToInvoice = async () => {
    if (!convertingQuotation || !user?.uid) return

    setIsConverting(true)
    try {
      // Obtener datos de la cotización para crear la factura
      const convertResult = await convertToInvoice(user.uid, convertingQuotation.id)

      if (!convertResult.success) {
        throw new Error(convertResult.error)
      }

      const quotationData = convertResult.data

      // Determinar el tipo de documento basado en el cliente
      const documentType = quotationData.customer.documentType === 'RUC' ? 'factura' : 'boleta'

      // Obtener el siguiente número de documento
      const numberResult = await getNextDocumentNumber(user.uid, documentType)

      if (!numberResult.success) {
        throw new Error(numberResult.error)
      }

      // Crear la factura
      const invoiceData = {
        number: numberResult.number,
        documentType,
        customer: quotationData.customer,
        items: quotationData.items,
        subtotal: quotationData.subtotal,
        igv: quotationData.igv,
        total: quotationData.total,
        paymentMethod: 'Efectivo', // Valor por defecto
        status: 'pending',
        notes: quotationData.notes || '',
        sunatStatus: 'pending',
      }

      const createResult = await createInvoice(user.uid, invoiceData)

      if (!createResult.success) {
        throw new Error(createResult.error)
      }

      // Marcar cotización como convertida
      await markQuotationAsConverted(user.uid, convertingQuotation.id, createResult.id)

      toast.success('Cotización convertida a factura exitosamente')
      setConvertingQuotation(null)
      loadQuotations()

      // Navegar a la lista de facturas
      navigate('/facturas')
    } catch (error) {
      console.error('Error al convertir cotización:', error)
      toast.error(error.message || 'Error al convertir la cotización a factura.')
    } finally {
      setIsConverting(false)
    }
  }

  const handleSendWhatsApp = (quotation) => {
    if (!quotation.customer?.phone) {
      toast.error('El cliente no tiene un número de teléfono registrado')
      return
    }

    // Limpiar el número de teléfono (solo dígitos)
    const phone = quotation.customer.phone.replace(/\D/g, '')

    // Crear mensaje
    const message = `Hola ${quotation.customer.name},

Te envío nuestra cotización N° ${quotation.number}.

Total: ${formatCurrency(quotation.total)}
${quotation.expiryDate ? `Válida hasta: ${formatDate(quotation.expiryDate.toDate ? quotation.expiryDate.toDate() : new Date(quotation.expiryDate))}` : ''}

¿Tienes alguna pregunta? Estamos para ayudarte.

Saludos,
${companySettings?.businessName || 'Tu Empresa'}`

    // Abrir WhatsApp Web
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')

    // Marcar como enviada
    markQuotationAsSent(user.uid, quotation.id, 'whatsapp')
    toast.success('Abriendo WhatsApp...')
    loadQuotations()
  }

  const handleDownloadPDF = (quotation) => {
    if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
      toast.error(
        'Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa',
        5000
      )
      return
    }

    try {
      generateQuotationPDF(quotation, companySettings)
      markQuotationAsSent(user.uid, quotation.id, 'manual')
      toast.success('PDF generado exitosamente')
      loadQuotations()
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar el PDF')
    }
  }

  // Filtrar cotizaciones
  const filteredQuotations = quotations.filter(quotation => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      quotation.number?.toLowerCase().includes(search) ||
      quotation.customer?.name?.toLowerCase().includes(search) ||
      quotation.customer?.documentNumber?.includes(search)

    const matchesStatus = filterStatus === 'all' || quotation.status === filterStatus

    return matchesSearch && matchesStatus
  })

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

    const expiryDate = quotation.expiryDate.toDate
      ? quotation.expiryDate.toDate()
      : new Date(quotation.expiryDate)
    const now = new Date()
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))

    return daysUntilExpiry <= 7 && daysUntilExpiry > 0
  }

  // Estadísticas
  const stats = {
    total: quotations.length,
    sent: quotations.filter(q => q.status === 'sent').length,
    accepted: quotations.filter(q => q.status === 'accepted').length,
    converted: quotations.filter(q => q.status === 'converted').length,
    totalAmount: quotations
      .filter(q => q.status !== 'rejected' && q.status !== 'expired')
      .reduce((sum, q) => sum + (q.total || 0), 0),
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
        <Link to="/cotizaciones/nueva" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Cotización
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Total</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
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
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <Select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full sm:w-56"
              >
                <option value="all">Todos los estados</option>
                <option value="draft">Borrador</option>
                <option value="sent">Enviadas</option>
                <option value="accepted">Aceptadas</option>
                <option value="rejected">Rechazadas</option>
                <option value="expired">Vencidas</option>
                <option value="converted">Convertidas</option>
              </Select>
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
              {searchTerm || filterStatus !== 'all'
                ? 'No se encontraron cotizaciones'
                : 'No hay cotizaciones registradas'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterStatus !== 'all'
                ? 'Intenta con otros filtros de búsqueda'
                : 'Comienza creando tu primera cotización'}
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <Link to="/cotizaciones/nueva">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Nueva Cotización
                </Button>
              </Link>
            )}
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
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
                {filteredQuotations.map(quotation => (
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
                        {quotation.createdAt
                          ? formatDate(quotation.createdAt.toDate())
                          : 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <div className="flex items-center gap-1">
                        <span className="text-sm whitespace-nowrap">
                          {quotation.expiryDate
                            ? formatDate(
                                quotation.expiryDate.toDate
                                  ? quotation.expiryDate.toDate()
                                  : new Date(quotation.expiryDate)
                              )
                            : 'N/A'}
                        </span>
                        {isExpiringSoon(quotation) && (
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <span className="font-semibold text-sm whitespace-nowrap">
                        {formatCurrency(quotation.total)}
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
                              setMenuPosition({
                                top: rect.top - 10,
                                right: window.innerWidth - rect.right
                              })
                              setOpenMenuId(openMenuId === quotation.id ? null : quotation.id)
                            }}
                            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                            title="Acciones"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu */}
                          {openMenuId === quotation.id && (
                            <>
                              {/* Backdrop */}
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />

                              {/* Menu */}
                              <div
                                className="fixed w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                                style={{
                                  top: `${menuPosition.top}px`,
                                  right: `${menuPosition.right}px`,
                                  transform: 'translateY(-100%)'
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

                                {/* Enviar por WhatsApp */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    handleSendWhatsApp(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Share2 className="w-4 h-4 text-green-600" />
                                  <span>Enviar por WhatsApp</span>
                                </button>

                                {/* Convertir a factura */}
                                {quotation.status !== 'converted' &&
                                  quotation.status !== 'expired' &&
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
                            </>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

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
                  {viewingQuotation.createdAt
                    ? formatDate(viewingQuotation.createdAt.toDate())
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Válida Hasta</p>
                <p className="font-semibold">
                  {viewingQuotation.expiryDate
                    ? formatDate(
                        viewingQuotation.expiryDate.toDate
                          ? viewingQuotation.expiryDate.toDate()
                          : new Date(viewingQuotation.expiryDate)
                      )
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
                <span className="font-medium">{formatCurrency(viewingQuotation.subtotal)}</span>
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
                        : viewingQuotation.discount
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">IGV (18%):</span>
                <span className="font-medium">{formatCurrency(viewingQuotation.igv)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span>Total:</span>
                <span className="text-primary-600">{formatCurrency(viewingQuotation.total)}</span>
              </div>
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
              <Button onClick={() => handleDownloadPDF(viewingQuotation)}>
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
              {viewingQuotation.status !== 'converted' &&
                viewingQuotation.status !== 'expired' &&
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
                ¿Estás seguro de que deseas convertir la cotización{' '}
                <strong>{convertingQuotation?.number}</strong> en una factura?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Se creará un nuevo comprobante y la cotización se marcará como convertida.
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
                  Convirtiendo...
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4 mr-2" />
                  Convertir
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
